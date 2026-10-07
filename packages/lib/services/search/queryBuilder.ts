/* eslint-disable id-denylist */

import { Expression, QueryCreator, SelectQueryBuilder, SqlBool, expressionBuilder } from 'kysely';
import time from '../../time';
import { GenericTables, compileQuery, genericKysely } from '../database/kysely/kysely';
import { booleanLiteral, ftsMatch, ftsMatchInfo, ftsOffsets } from '../database/kysely/rawFragments';

interface Term {
	name: string;
	value: string;
	negated: boolean;
}

enum Relation {
	OR = 'OR',
	AND = 'AND',
}

enum Operation {
	UNION = 'UNION',
	INTERSECT = 'INTERSECT',
}

enum Requirement {
	EXCLUSION = 'EXCLUSION',
	INCLUSION = 'INCLUSION',
}

type SelectQuery = SelectQueryBuilder<GenericTables, string, Record<string, unknown>>;

// A condition of the final query. Pieces are combined in order, as a flat list
// of "AND" and "OR", so that AND binds tighter than OR like it does in SQL.
interface Piece {
	relation: Relation;
	expression: Expression<SqlBool>;
}

// A common table expression, which is added to the "WITH" clause of the query
interface Cte {
	name: string;
	columns?: string;
	query: SelectQuery;
}

const eb = expressionBuilder<GenericTables, string>();

const _notebookFilter = (notebooks: string[], requirement: Requirement, pieces: Piece[], ctes: Cte[], useFts: boolean) => {
	if (notebooks.length === 0) return;

	const viewName: string = requirement === Requirement.EXCLUSION ? 'notebooks_not_in_scope' : 'notebooks_in_scope';

	const relevantFolderIds = genericKysely
		.selectFrom('folders')
		.select('id')
		.where(eb => eb.or(notebooks.map(notebook => eb('folders.title', 'like', notebook))));

	ctes.push({
		name: viewName,
		columns: 'id',
		query: genericKysely
			.selectFrom('folders')
			.select('folders.id')
			.where('id', 'in', relevantFolderIds)
			.unionAll(genericKysely
				.selectFrom('folders')
				.innerJoin(viewName, 'folders.parent_id', `${viewName}.id`)
				.select('folders.id')),
	});

	const tableName = useFts ? 'notes_normalized' : 'notes';
	pieces.push({
		relation: Relation.AND,
		expression: eb('rowid', requirement === Requirement.EXCLUSION ? 'not in' : 'in', eb
			.selectFrom(viewName)
			.innerJoin(tableName, `${viewName}.id`, `${tableName}.parent_id`)
			.select(`${tableName}.rowid`)),
	});
};

const notebookFilter = (terms: Term[], pieces: Piece[], ctes: Cte[], useFts: boolean) => {
	const notebooksToInclude = terms.filter(x => x.name === 'notebook' && !x.negated).map(x => x.value);
	_notebookFilter(notebooksToInclude, Requirement.INCLUSION, pieces, ctes, useFts);

	const notebooksToExclude = terms.filter(x => x.name === 'notebook' && x.negated).map(x => x.value);
	_notebookFilter(notebooksToExclude, Requirement.EXCLUSION, pieces, ctes, useFts);
};

const getOperator = (requirement: Requirement, relation: Relation): Operation => {
	if (relation === 'AND' && requirement === 'INCLUSION') { return Operation.INTERSECT; } else { return Operation.UNION; }
};

const filterByTableName = (
	terms: Term[],
	pieces: Piece[],
	ctes: Cte[],
	relation: Relation,
	noteIds: (value: string)=> SelectQuery,
	requirement: Requirement,
	tableName: string,
	useFts: boolean,
) => {
	const operator: Operation = getOperator(requirement, relation);

	const values = terms.map(x => x.value);

	// The requirement and table name are added to the names to make them unique
	const cteName = `notes_with_${requirement}_${tableName}`;

	if (relation === Relation.OR && requirement === Requirement.EXCLUSION) {
		const allNotesName = `all_notes_with_${requirement}_${tableName}`;

		ctes.push({
			name: allNotesName,
			query: genericKysely.selectFrom(`note_${tableName}`).select(`note_${tableName}.note_id as id`).distinct(),
		});

		const notesWithoutExcludedField = (value: string) => genericKysely
			.selectFrom(genericKysely.selectFrom(allNotesName).selectAll().except(noteIds(value)).as('notes_without_excluded'))
			.selectAll();

		// We need notes without at least one excluded (tag/resource)
		ctes.push({
			name: cteName,
			query: values.slice(1).reduce((query: SelectQuery, value) => query.union(notesWithoutExcludedField(value)), notesWithoutExcludedField(values[0])),
		});
	} else {
		// Notes with any/all values depending upon relation and requirement
		const baseQuery: SelectQuery = genericKysely
			.selectFrom(`note_${tableName}`)
			.select(`note_${tableName}.note_id as id`)
			.where(booleanLiteral(operator === Operation.INTERSECT ? 1 : 0));

		ctes.push({
			name: cteName,
			query: values.reduce((query: SelectQuery, value) => {
				return operator === Operation.INTERSECT ? query.intersect(noteIds(value)) : query.union(noteIds(value));
			}, baseQuery),
		});
	}

	// Get the ROWIDs that satisfy the condition so we can filter the result
	const targetTableName = useFts ? 'notes_normalized' : 'notes';
	pieces.push({
		relation,
		expression: eb('rowid', (relation === 'AND' && requirement === 'EXCLUSION') ? 'not in' : 'in', eb
			.selectFrom(cteName)
			.innerJoin(targetTableName, `${cteName}.id`, `${targetTableName}.id`)
			.select(`${targetTableName}.rowid`)),
	});
};

const resourceFilter = (terms: Term[], pieces: Piece[], ctes: Cte[], relation: Relation, useFts: boolean) => {
	const tableName = 'resources';

	const noteIdsWithResource = (mime: string): SelectQuery => genericKysely
		.selectFrom('note_resources')
		.select('note_resources.note_id as id')
		.where('note_resources.is_associated', '=', 1)
		.where('note_resources.resource_id', 'in', genericKysely
			.selectFrom('resources')
			.select('resources.id')
			.where('resources.mime', 'like', mime));

	const requiredResources = terms.filter(x => x.name === 'resource' && !x.negated);
	const excludedResources = terms.filter(x => x.name === 'resource' && x.negated);

	if (requiredResources.length > 0) {
		filterByTableName(requiredResources, pieces, ctes, relation, noteIdsWithResource, Requirement.INCLUSION, tableName, useFts);
	}

	if (excludedResources.length > 0) {
		filterByTableName(excludedResources, pieces, ctes, relation, noteIdsWithResource, Requirement.EXCLUSION, tableName, useFts);
	}
};

const tagFilter = (terms: Term[], pieces: Piece[], ctes: Cte[], relation: Relation, useFts: boolean) => {
	const tableName = 'tags';

	const noteIdsWithTag = (title: string): SelectQuery => genericKysely
		.selectFrom('note_tags')
		.select('note_tags.note_id as id')
		.where('note_tags.tag_id', 'in', genericKysely
			.selectFrom('tags')
			.select('tags.id')
			.where('tags.title', 'like', title));

	const requiredTags = terms.filter(x => x.name === 'tag' && !x.negated);
	const excludedTags = terms.filter(x => x.name === 'tag' && x.negated);

	if (requiredTags.length > 0) {
		filterByTableName(requiredTags, pieces, ctes, relation, noteIdsWithTag, Requirement.INCLUSION, tableName, useFts);
	}

	if (excludedTags.length > 0) {
		filterByTableName(excludedTags, pieces, ctes, relation, noteIdsWithTag, Requirement.EXCLUSION, tableName, useFts);
	}
};

const genericFilter = (terms: Term[], pieces: Piece[], relation: Relation, fieldName: string, useFts: boolean) => {
	if (fieldName === 'iscompleted' || fieldName === 'type') {
		// Faster query when values can only take two distinct values
		biConditionalFilter(terms, pieces, relation, fieldName, useFts);
		return;
	}

	const tableName = useFts ? 'notes_normalized' : 'notes';

	const getCondition = (term: Term) => {
		if (fieldName === 'sourceurl') {
			return eb(`${tableName}.source_url`, term.negated ? 'not like' : 'like', term.value);
		} else if (fieldName === 'date' && term.name === 'due') {
			return eb('todo_due', term.negated ? '<' : '>=', term.value);
		} else if (fieldName === 'id') {
			return eb('id', term.negated ? 'not like' : 'like', term.value);
		} else {
			return eb(`${tableName}.${fieldName === 'date' ? `user_${term.name}_time` : `${term.name}`}`, term.negated ? '<' : '>=', term.value);
		}
	};

	for (const term of terms) {
		const rowIdCondition = eb('rowid', 'in', eb.selectFrom(tableName).select('rowid').where(getCondition(term)));
		pieces.push({
			relation,
			expression: term.name === 'due' ? eb.and([eb('is_todo', 'is', 1), rowIdCondition]) : eb.and([rowIdCondition]),
		});
	}
};

const biConditionalFilter = (terms: Term[], pieces: Piece[], relation: Relation, filterName: string, useFts: boolean) => {
	const getCondition = (filterName: string, value: string, relation: Relation) => {
		const tableName = useFts ? (relation === 'AND' ? 'notes_fts' : 'notes_normalized') : 'notes';
		if (filterName === 'type') {
			return eb(`${tableName}.is_todo`, 'is', value === 'todo' ? 1 : 0);
		} else if (filterName === 'iscompleted') {
			return eb.and([
				eb(`${tableName}.is_todo`, 'is', 1),
				eb(`${tableName}.todo_completed`, value === '1' ? 'is not' : 'is', 0),
			]);
		} else {
			throw new Error('Invalid filter name.');
		}
	};

	const values = terms.map(x => x.value);

	// AND and OR are handled differently because FTS restricts how OR can be used.
	for (const value of values) {
		if (relation === 'AND') {
			pieces.push({ relation, expression: getCondition(filterName, value, relation) });
		}
		if (relation === 'OR') {
			if (useFts) {
				pieces.push({
					relation,
					expression: eb('rowid', 'in', eb.selectFrom('notes_normalized').select('rowid').where(getCondition(filterName, value, relation))),
				});
			} else {
				pieces.push({ relation, expression: getCondition(filterName, value, relation) });
			}
		}
	}
};

const noteIdFilter = (terms: Term[], pieces: Piece[], relation: Relation, useFts: boolean) => {
	const noteIdTerms = terms.filter(x => x.name === 'id');
	genericFilter(noteIdTerms, pieces, relation, 'id', useFts);
};


const typeFilter = (terms: Term[], pieces: Piece[], relation: Relation, useFts: boolean) => {
	const typeTerms = terms.filter(x => x.name === 'type');
	genericFilter(typeTerms, pieces, relation, 'type', useFts);
};

const completedFilter = (terms: Term[], pieces: Piece[], relation: Relation, useFts: boolean) => {
	const completedTerms = terms.filter(x => x.name === 'iscompleted');
	genericFilter(completedTerms, pieces, relation, 'iscompleted', useFts);
};


const locationFilter = (terms: Term[], pieces: Piece[], relation: Relation, useFts: boolean) => {
	const locationTerms = terms.filter(x => x.name === 'latitude' || x.name === 'longitude' || x.name === 'altitude');
	genericFilter(locationTerms, pieces, relation, 'location', useFts);
};

const dateFilter = (terms: Term[], pieces: Piece[], relation: Relation, useFts: boolean) => {
	const getUnixMs = (date: string): string => {
		const yyyymmdd = /^[0-9]{8}$/;
		const yyyymm = /^[0-9]{6}$/;
		const yyyy = /^[0-9]{4}$/;
		const smartValue = /^(day|week|month|year)(\+|-)([0-9]+)$/i;

		if (yyyymmdd.test(date)) {
			return time.formatLocalToMs(date, 'YYYYMMDD').toString();
		} else if (yyyymm.test(date)) {
			return time.formatLocalToMs(date, 'YYYYMM').toString();
		} else if (yyyy.test(date)) {
			return time.formatLocalToMs(date, 'YYYY').toString();
		} else if (smartValue.test(date)) {
			const match = smartValue.exec(date);
			const timeUnit = match[1]; // eg. day, week, month, year
			const timeDirection = match[2]; // + or -
			const num = Number(match[3]); // eg. 1, 12, 15

			if (timeDirection === '+') { return time.goForwardInTime(Date.now(), num, timeUnit); } else { return time.goBackInTime(Date.now(), num, timeUnit); }
		} else {
			throw new Error('Invalid date format!');
		}
	};

	const dateTerms = terms.filter(x => x.name === 'created' || x.name === 'updated' || x.name === 'due');
	const unixDateTerms = dateTerms.map(term => { return { ...term, value: getUnixMs(term.value) }; });
	genericFilter(unixDateTerms, pieces, relation, 'date', useFts);
};

const sourceUrlFilter = (terms: Term[], pieces: Piece[], relation: Relation, useFts: boolean) => {
	const urlTerms = terms.filter(x => x.name === 'sourceurl');
	genericFilter(urlTerms, pieces, relation, 'sourceurl', useFts);
};

const trimQuotes = (str: string) => str.startsWith('"') && str.endsWith('"') ? str.substr(1, str.length - 2) : str;

const textFilter = (terms: Term[], pieces: Piece[], relation: Relation, useFts: boolean) => {
	const createLikeMatch = (term: Term, negate: boolean) => {
		const param = `%${trimQuotes(term.value).replace(/\*/, '%')}%`;

		const matches: Expression<SqlBool>[] = [];
		if (term.name === 'text' || term.name === 'body') matches.push(eb('notes.body', 'like', param));
		if (term.name === 'text' || term.name === 'title') matches.push(eb('notes.title', 'like', param));

		const match = eb.or(matches);
		pieces.push({ relation, expression: negate ? eb.not(match) : match });
	};

	const addExcludeTextConditions = (excludedTerms: Term[], relation: Relation) => {
		if (useFts) {
			const type = excludedTerms[0].name === 'text' ? '' : `.${excludedTerms[0].name}`;
			if (relation === 'AND') {
				pieces.push({
					relation,
					expression: eb('rowid', 'not in', eb
						.selectFrom('notes_fts')
						.select('rowid')
						.where(ftsMatch(`notes_fts${type}`, excludedTerms.map(x => x.value).join(' OR ')))),
				});
			}
			if (relation === 'OR') {
				for (const term of excludedTerms) {
					pieces.push({
						relation,
						expression: eb('rowid', 'in', eb
							.selectFrom(eb
								.selectFrom('notes_fts')
								.select('rowid')
								.except(eb.selectFrom('notes_fts').select('rowid').where(ftsMatch(`notes_fts${type}`, term.value)))
								.as('notes_without_match'))
							.selectAll()),
					});
				}
			}
		} else {
			for (const term of excludedTerms) {
				createLikeMatch(term, true);
			}
		}
	};

	const allTerms = terms.filter(x => x.name === 'title' || x.name === 'body' || x.name === 'text');

	const includedTerms = allTerms.filter(x => !x.negated);
	if (includedTerms.length > 0) {
		if (useFts) {
			const termsToMatch = includedTerms.map(term => {
				if (term.name === 'text') return term.value;
				else return `${term.name}:${term.value}`;
			});
			const matchQuery = (relation === 'OR') ? termsToMatch.join(' OR ') : termsToMatch.join(' ');
			pieces.push({ relation, expression: ftsMatch('notes_fts', matchQuery) });
		} else {
			for (const term of includedTerms) {
				createLikeMatch(term, false);
			}
		}
	}

	const excludedTextTerms = allTerms.filter(x => x.name === 'text' && x.negated);
	const excludedTitleTerms = allTerms.filter(x => x.name === 'title' && x.negated);
	const excludedBodyTerms = allTerms.filter(x => x.name === 'body' && x.negated);

	if ((excludedTextTerms.length > 0)) {
		addExcludeTextConditions(excludedTextTerms, relation);
	}

	if (excludedTitleTerms.length > 0) {
		addExcludeTextConditions(excludedTitleTerms, relation);
	}

	if (excludedBodyTerms.length > 0) {
		addExcludeTextConditions(excludedBodyTerms, relation);
	}
};

const getDefaultRelation = (terms: Term[]): Relation => {
	const anyTerm = terms.find(term => term.name === 'any');
	if (anyTerm) { return (anyTerm.value === '1') ? Relation.OR : Relation.AND; }
	return Relation.AND;
};

// The first condition. Acts as 0 (something always false) when OR is used and there is no notebook term.
const getConnective = (terms: Term[], relation: Relation) => {
	const notebookTerm = terms.find(x => x.name === 'notebook');
	return (!notebookTerm && (relation === 'OR')) ? eb('rowid', '=', -1) : booleanLiteral(1);
};

// Combines the conditions in order. As in SQL, AND binds tighter than OR.
const combine = (first: Expression<SqlBool>, pieces: Piece[]) => {
	const groups: Expression<SqlBool>[][] = [[first]];
	for (const piece of pieces) {
		if (piece.relation === Relation.AND) {
			groups[groups.length - 1].push(piece.expression);
		} else {
			groups.push([piece.expression]);
		}
	}

	const andGroups = groups.map(group => group.length === 1 ? group[0] : eb.and(group));
	return andGroups.length === 1 ? andGroups[0] : eb.or(andGroups);
};

export default function queryBuilder(terms: Term[], useFts: boolean) {
	const pieces: Piece[] = [];
	const ctes: Cte[] = [];

	const relation: Relation = getDefaultRelation(terms);

	const tableName = useFts ? 'notes_fts' : 'notes';

	noteIdFilter(terms, pieces, relation, useFts);

	notebookFilter(terms, pieces, ctes, useFts);

	tagFilter(terms, pieces, ctes, relation, useFts);

	resourceFilter(terms, pieces, ctes, relation, useFts);

	textFilter(terms, pieces, relation, useFts);


	typeFilter(terms, pieces, relation, useFts);

	completedFilter(terms, pieces, relation, useFts);

	dateFilter(terms, pieces, relation, useFts);

	locationFilter(terms, pieces, relation, useFts);

	sourceUrlFilter(terms, pieces, relation, useFts);

	let where: Expression<SqlBool>;
	if (ctes.length > 0 && terms.find(x => x.name === 'notebook') && terms.find(x => x.name === 'any')) {
		// The notebook filter should be independent of the any filter.
		// So we're first finding the OR of other filters and then combining them with the notebook filter using AND
		// in-required-notebook AND (condition #1 OR condition #2  OR ... )
		const otherFilters = combine(booleanLiteral(0), pieces.slice(1));
		where = combine(getConnective(terms, relation), [
			pieces[0],
			{ relation: Relation.AND, expression: eb('rowid', 'in', eb.selectFrom('notes_fts').select('rowid').where(otherFilters)) },
		]);
	} else {
		where = combine(getConnective(terms, relation), pieces);
	}

	let queryCreator: QueryCreator<GenericTables> = genericKysely;
	for (const cte of ctes) {
		// RECURSIVE is required by the notebook filter and harmless for the others
		const name = cte.columns ? `${cte.name}(${cte.columns})` : cte.name;
		queryCreator = queryCreator.withRecursive(name as `${string}(${string})`, () => cte.query) as unknown as QueryCreator<GenericTables>;
	}

	const query = queryCreator
		.selectFrom(tableName)
		.select([
			`${tableName}.id`,
			`${tableName}.title`,
			...(useFts ? [ftsOffsets('notes_fts').as('offsets'), ftsMatchInfo('notes_fts', 'pcnalx').as('matchinfo')] : []),
			`${tableName}.user_created_time`,
			`${tableName}.user_updated_time`,
			`${tableName}.is_todo`,
			`${tableName}.todo_completed`,
			`${tableName}.parent_id`,
		])
		.where(where);

	const compiled = compileQuery(query);
	return { query: compiled.sql, params: compiled.params };
}
