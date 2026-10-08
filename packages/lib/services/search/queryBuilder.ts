/* eslint-disable id-denylist */

import { Expression, expressionBuilder, Kysely, SelectQueryBuilder, SqlBool } from 'kysely';
import time from '../../time';
import { compile, kysely } from '../database/kysely';
import { alwaysFalse, alwaysTrue, ftsMatch, ftsMatchInfo, ftsOffsets } from '../database/kysely/rawFragments/search';

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
	UNION = 'union',
	INTERSECT = 'intersect',
}

enum Requirement {
	EXCLUSION = 'EXCLUSION',
	INCLUSION = 'INCLUSION',
}

// Table and column names are built dynamically here, so the typed schema is relaxed.
type LooseDB = Record<string, Record<string, unknown>>;
type IdQuery = SelectQueryBuilder<LooseDB, string, { id: unknown }>;

interface Condition {
	connective: Relation;
	expr: Expression<SqlBool>;
}

interface CommonTableExpression {
	name: string;
	query: IdQuery;
}

const db = kysely as unknown as Kysely<LooseDB>;
const eb = expressionBuilder<LooseDB, string>();

const idQuery = (query: unknown) => query as IdQuery;

// Combines conditions as SQL text would be read, where AND binds tighter than OR.
const combineConditions = (first: Expression<SqlBool>, conditions: Condition[]) => {
	const groups: Expression<SqlBool>[][] = [[first]];
	for (const condition of conditions) {
		if (condition.connective === Relation.OR) groups.push([condition.expr]);
		else groups[groups.length - 1].push(condition.expr);
	}
	return groups.length === 1 ? eb.and(groups[0]) : eb.or(groups.map(g => eb.and(g)));
};

const _notebookFilter = (notebooks: string[], requirement: Requirement, conditions: Condition[], ctes: CommonTableExpression[], useFts: boolean) => {
	if (notebooks.length === 0) return;

	const viewName: string = requirement === Requirement.EXCLUSION ? 'notebooks_not_in_scope' : 'notebooks_in_scope';

	const foldersMatchingTitle = db.selectFrom('folders')
		.select('id')
		.where(eb.or(notebooks.map(notebook => eb('folders.title', 'like', notebook))));

	const subfolders = db.selectFrom('folders')
		.innerJoin(viewName, 'folders.parent_id', `${viewName}.id`)
		.select('folders.id');

	ctes.push({
		name: `${viewName}(id)`,
		query: idQuery(db.selectFrom('folders')
			.select('folders.id')
			.where('id', 'in', foldersMatchingTitle)
			.unionAll(subfolders)),
	});

	const tableName: string = useFts ? 'notes_normalized' : 'notes';
	const notesInScope = db.selectFrom(viewName)
		.innerJoin(tableName, `${viewName}.id`, `${tableName}.parent_id`)
		.select(`${tableName}.rowid`);

	conditions.push({
		connective: Relation.AND,
		expr: eb('rowid', requirement === Requirement.EXCLUSION ? 'not in' : 'in', notesInScope),
	});
};

const notebookFilter = (terms: Term[], conditions: Condition[], ctes: CommonTableExpression[], useFts: boolean) => {
	const notebooksToInclude = terms.filter(x => x.name === 'notebook' && !x.negated).map(x => x.value);
	_notebookFilter(notebooksToInclude, Requirement.INCLUSION, conditions, ctes, useFts);

	const notebooksToExclude = terms.filter(x => x.name === 'notebook' && x.negated).map(x => x.value);
	_notebookFilter(notebooksToExclude, Requirement.EXCLUSION, conditions, ctes, useFts);
};

const getOperator = (requirement: Requirement, relation: Relation): Operation => {
	if (relation === 'AND' && requirement === 'INCLUSION') { return Operation.INTERSECT; } else { return Operation.UNION; }
};

const filterByTableName = (
	terms: Term[],
	conditions: Condition[],
	relation: Relation,
	noteIDs: (value: string)=> IdQuery,
	requirement: Requirement,
	ctes: CommonTableExpression[],
	tableName: string,
	useFts: boolean,
) => {
	const operator: Operation = getOperator(requirement, relation);

	const values = terms.map(x => x.value);
	const joinTable = `note_${tableName}`;
	const cteName = `notes_with_${requirement}_${tableName}`;

	if (relation === Relation.OR && requirement === Requirement.EXCLUSION) {
		// with_${requirement}_${tableName} is added to the names to make them unique
		const allNotesName = `all_notes_with_${requirement}_${tableName}`;
		ctes.push({
			name: allNotesName,
			query: idQuery(db.selectFrom(joinTable).select(`${joinTable}.note_id as id`).distinct()),
		});

		const notesWithoutExcludedField = (value: string) => {
			const remaining = db.selectFrom(allNotesName).selectAll().except(noteIDs(value));
			return idQuery(db.selectFrom(remaining.as('remaining')).selectAll());
		};

		// We need notes without at least one excluded (tag/resource)
		let requiredNotes = notesWithoutExcludedField(values[0]);
		for (const value of values.slice(1)) requiredNotes = requiredNotes.union(notesWithoutExcludedField(value));
		ctes.push({ name: cteName, query: requiredNotes });
	} else {
		// Notes with any/all values depending upon relation and requirement
		let requiredNotes = idQuery(db.selectFrom(joinTable)
			.select(`${joinTable}.note_id as id`)
			.where(operator === Operation.INTERSECT ? alwaysTrue : alwaysFalse));
		for (const value of values) requiredNotes = requiredNotes[operator](noteIDs(value));
		ctes.push({ name: cteName, query: requiredNotes });
	}

	// Get the ROWIDs that satisfy the condition so we can filter the result
	const targetTableName: string = useFts ? 'notes_normalized' : 'notes';
	const matchingRowIds = db.selectFrom(cteName)
		.innerJoin(targetTableName, `${cteName}.id`, `${targetTableName}.id`)
		.select(`${targetTableName}.rowid`);

	conditions.push({
		connective: relation,
		expr: eb('rowid', (relation === 'AND' && requirement === 'EXCLUSION') ? 'not in' : 'in', matchingRowIds),
	});
};

const resourceFilter = (terms: Term[], conditions: Condition[], relation: Relation, ctes: CommonTableExpression[], useFts: boolean) => {
	const tableName = 'resources';

	const noteIDsWithResource = (mime: string) => idQuery(db.selectFrom('note_resources')
		.select('note_resources.note_id as id')
		.where('note_resources.is_associated', '=', 1)
		.where('note_resources.resource_id', 'in', db.selectFrom('resources')
			.select('resources.id')
			.where('resources.mime', 'like', mime)));

	const requiredResources = terms.filter(x => x.name === 'resource' && !x.negated);
	const excludedResources = terms.filter(x => x.name === 'resource' && x.negated);

	if (requiredResources.length > 0) {
		filterByTableName(requiredResources, conditions, relation, noteIDsWithResource, Requirement.INCLUSION, ctes, tableName, useFts);
	}

	if (excludedResources.length > 0) {
		filterByTableName(excludedResources, conditions, relation, noteIDsWithResource, Requirement.EXCLUSION, ctes, tableName, useFts);
	}
};

const tagFilter = (terms: Term[], conditions: Condition[], relation: Relation, ctes: CommonTableExpression[], useFts: boolean) => {
	const tableName = 'tags';

	const noteIDsWithTag = (title: string) => idQuery(db.selectFrom('note_tags')
		.select('note_tags.note_id as id')
		.where('note_tags.tag_id', 'in', db.selectFrom('tags')
			.select('tags.id')
			.where('tags.title', 'like', title)));

	const requiredTags = terms.filter(x => x.name === 'tag' && !x.negated);
	const excludedTags = terms.filter(x => x.name === 'tag' && x.negated);

	if (requiredTags.length > 0) {
		filterByTableName(requiredTags, conditions, relation, noteIDsWithTag, Requirement.INCLUSION, ctes, tableName, useFts);
	}

	if (excludedTags.length > 0) {
		filterByTableName(excludedTags, conditions, relation, noteIDsWithTag, Requirement.EXCLUSION, ctes, tableName, useFts);
	}
};

const genericFilter = (terms: Term[], conditions: Condition[], relation: Relation, fieldName: string, useFts: boolean) => {
	if (fieldName === 'iscompleted' || fieldName === 'type') {
		// Faster query when values can only take two distinct values
		biConditionalFilter(terms, conditions, relation, fieldName, useFts);
		return;
	}

	const tableName: string = useFts ? 'notes_normalized' : 'notes';

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
		const matchingRowIds = eb('rowid', 'in', db.selectFrom(tableName).select('rowid').where(getCondition(term)));
		conditions.push({
			connective: relation,
			expr: term.name === 'due' ? eb.and([eb('is_todo', 'is', 1), matchingRowIds]) : matchingRowIds,
		});
	}
};

const biConditionalFilter = (terms: Term[], conditions: Condition[], relation: Relation, filterName: string, useFts: boolean) => {
	const getConditions = (filterName: string, value: string, relation: Relation) => {
		const tableName = useFts ? (relation === 'AND' ? 'notes_fts' : 'notes_normalized') : 'notes';
		if (filterName === 'type') {
			return [eb(`${tableName}.is_todo`, 'is', value === 'todo' ? 1 : 0)];
		} else if (filterName === 'iscompleted') {
			return [
				eb(`${tableName}.is_todo`, 'is', 1),
				value === '1' ? eb(`${tableName}.todo_completed`, 'is not', 0) : eb(`${tableName}.todo_completed`, 'is', 0),
			];
		} else {
			throw new Error('Invalid filter name.');
		}
	};

	// AND and OR are handled differently because FTS restricts how OR can be used.
	for (const term of terms) {
		const valueConditions = getConditions(filterName, term.value, relation);
		if (relation === 'AND') {
			for (const expr of valueConditions) conditions.push({ connective: Relation.AND, expr });
		}
		if (relation === 'OR') {
			if (useFts) {
				const matchingRowIds = db.selectFrom('notes_normalized').select('rowid').where(eb.and(valueConditions));
				conditions.push({ connective: Relation.OR, expr: eb('rowid', 'in', matchingRowIds) });
			} else {
				for (const [index, expr] of valueConditions.entries()) {
					conditions.push({ connective: index === 0 ? Relation.OR : Relation.AND, expr });
				}
			}
		}
	}
};

const noteIdFilter = (terms: Term[], conditions: Condition[], relation: Relation, useFts: boolean) => {
	const noteIdTerms = terms.filter(x => x.name === 'id');
	genericFilter(noteIdTerms, conditions, relation, 'id', useFts);
};

const typeFilter = (terms: Term[], conditions: Condition[], relation: Relation, useFts: boolean) => {
	const typeTerms = terms.filter(x => x.name === 'type');
	genericFilter(typeTerms, conditions, relation, 'type', useFts);
};

const completedFilter = (terms: Term[], conditions: Condition[], relation: Relation, useFts: boolean) => {
	const completedTerms = terms.filter(x => x.name === 'iscompleted');
	genericFilter(completedTerms, conditions, relation, 'iscompleted', useFts);
};

const locationFilter = (terms: Term[], conditions: Condition[], relation: Relation, useFts: boolean) => {
	const locationTerms = terms.filter(x => x.name === 'latitude' || x.name === 'longitude' || x.name === 'altitude');
	genericFilter(locationTerms, conditions, relation, 'location', useFts);
};

const dateFilter = (terms: Term[], conditions: Condition[], relation: Relation, useFts: boolean) => {
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
	genericFilter(unixDateTerms, conditions, relation, 'date', useFts);
};

const sourceUrlFilter = (terms: Term[], conditions: Condition[], relation: Relation, useFts: boolean) => {
	const urlTerms = terms.filter(x => x.name === 'sourceurl');
	genericFilter(urlTerms, conditions, relation, 'sourceurl', useFts);
};

const trimQuotes = (str: string) => str.startsWith('"') && str.endsWith('"') ? str.substr(1, str.length - 2) : str;

const textFilter = (terms: Term[], conditions: Condition[], relation: Relation, useFts: boolean) => {
	const createLikeMatch = (term: Term, negate: boolean) => {
		const param = `%${trimQuotes(term.value).replace(/\*/, '%')}%`;
		const likes = [];
		if (term.name === 'text' || term.name === 'body') likes.push(eb('notes.body', 'like', param));
		if (term.name === 'text' || term.name === 'title') likes.push(eb('notes.title', 'like', param));
		const match = eb.or(likes);
		conditions.push({ connective: relation, expr: negate ? eb.not(match) : match });
	};

	const addExcludeTextConditions = (excludedTerms: Term[]) => {
		if (useFts) {
			const column = excludedTerms[0].name === 'text' ? null : excludedTerms[0].name;
			if (relation === 'AND') {
				const matching = db.selectFrom('notes_fts')
					.select('rowid')
					.where(ftsMatch('notes_fts', column, excludedTerms.map(x => x.value).join(' OR ')));
				conditions.push({ connective: Relation.AND, expr: eb('rowid', 'not in', matching) });
			}
			if (relation === 'OR') {
				for (const term of excludedTerms) {
					const notMatching = db.selectFrom('notes_fts')
						.select('rowid')
						.except(db.selectFrom('notes_fts').select('rowid').where(ftsMatch('notes_fts', column, term.value)));
					const wrapped = db.selectFrom(notMatching.as('not_matching')).selectAll();
					conditions.push({ connective: Relation.OR, expr: eb('rowid', 'in', wrapped) });
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
			conditions.push({ connective: relation, expr: ftsMatch('notes_fts', null, matchQuery) });
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
		addExcludeTextConditions(excludedTextTerms);
	}

	if (excludedTitleTerms.length > 0) {
		addExcludeTextConditions(excludedTitleTerms);
	}

	if (excludedBodyTerms.length > 0) {
		addExcludeTextConditions(excludedBodyTerms);
	}
};

const getDefaultRelation = (terms: Term[]): Relation => {
	const anyTerm = terms.find(term => term.name === 'any');
	if (anyTerm) { return (anyTerm.value === '1') ? Relation.OR : Relation.AND; }
	return Relation.AND;
};

const getConnective = (terms: Term[], relation: Relation) => {
	const notebookTerm = terms.find(x => x.name === 'notebook');
	return (!notebookTerm && (relation === 'OR')) ? eb('rowid', '=', -1) : alwaysTrue; // rowid = -1 acts as 0 (something always false)
};

export default function queryBuilder(terms: Term[], useFts: boolean) {
	const conditions: Condition[] = [];
	const ctes: CommonTableExpression[] = [];

	const relation: Relation = getDefaultRelation(terms);

	const tableName = useFts ? 'notes_fts' : 'notes';

	noteIdFilter(terms, conditions, relation, useFts);

	notebookFilter(terms, conditions, ctes, useFts);

	tagFilter(terms, conditions, relation, ctes, useFts);

	resourceFilter(terms, conditions, relation, ctes, useFts);

	textFilter(terms, conditions, relation, useFts);

	typeFilter(terms, conditions, relation, useFts);

	completedFilter(terms, conditions, relation, useFts);

	dateFilter(terms, conditions, relation, useFts);

	locationFilter(terms, conditions, relation, useFts);

	sourceUrlFilter(terms, conditions, relation, useFts);

	const connective = getConnective(terms, relation);

	let where;
	if (ctes.length > 0 && terms.find(x => x.name === 'notebook') && terms.find(x => x.name === 'any')) {
		// The notebook filter should be independent of the any filter.
		// So we're first finding the OR of other filters and then combining them with the notebook filter using AND
		// in-required-notebook AND (condition #1 OR condition #2  OR ... )
		const otherConditions = combineConditions(alwaysFalse, conditions.slice(1));
		const matchingOthers = db.selectFrom('notes_fts').select('rowid').where(otherConditions);
		where = combineConditions(connective, [conditions[0], { connective: Relation.AND, expr: eb('rowid', 'in', matchingOthers) }]);
	} else {
		where = combineConditions(connective, conditions);
	}

	let creator = db;
	for (const cte of ctes) creator = creator.withRecursive(cte.name, () => cte.query as never) as unknown as Kysely<LooseDB>;

	const columns = [
		`${tableName}.id`,
		`${tableName}.title`,
		`${tableName}.user_created_time`,
		`${tableName}.user_updated_time`,
		`${tableName}.is_todo`,
		`${tableName}.todo_completed`,
		`${tableName}.parent_id`,
	];

	let query = creator.selectFrom(tableName).select(columns.slice(0, 2));
	if (useFts) query = query.select([ftsOffsets('notes_fts'), ftsMatchInfo('notes_fts')]);
	query = query.select(columns.slice(2)).where(where);

	const compiled = compile(query);
	return { query: compiled.sql, params: compiled.params };
}
