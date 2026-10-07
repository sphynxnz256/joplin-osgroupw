import queryBuilder from './queryBuilder';

const term = (name: string, value: string, negated = false) => ({ name, value, negated });

describe('services/search/queryBuilder', () => {

	test.each([
		[
			'FTS text search',
			[term('text', 'abc')],
			true,
			['abc'],
			['"notes_fts" match ?', 'offsets("notes_fts") as "offsets"', 'matchinfo("notes_fts", \'pcnalx\')'],
		],
		[
			'basic search with an excluded title',
			[term('text', 'abc'), term('title', 'x*', true)],
			false,
			['%abc%', '%abc%', '%x%%'],
			['("notes"."body" like ? or "notes"."title" like ?)', 'and not "notes"."title" like ?'],
		],
		[
			'all tags',
			[term('tag', 'a'), term('tag', 'b')],
			true,
			['a', 'b'],
			['with recursive "notes_with_INCLUSION_tags" as (select "note_tags"."note_id" as "id" from "note_tags" where 1 intersect select'],
		],
		[
			'any excluded tag or todo type',
			[term('any', '1'), term('tag', 'a', true), term('type', 'todo')],
			true,
			['a', -1, 1],
			['"all_notes_with_EXCLUSION_tags"', ' except select ', 'where ("rowid" = ? or "rowid" in'],
		],
		[
			'notebook combined with any',
			[term('any', '1'), term('notebook', 'nb'), term('text', 'abc'), term('iscompleted', '1')],
			true,
			['nb', 'abc', 1, 0],
			['"notebooks_in_scope"("id")', 'and "rowid" in (select "rowid" from "notes_fts" where (0 or "notes_fts" match ?'],
		],
	])('should build the query for: %s', (_name, terms, useFts, expectedParams, expectedSqlParts) => {
		const { query, params } = queryBuilder(terms, useFts);
		expect(params).toEqual(expectedParams);
		for (const part of expectedSqlParts) expect(query).toContain(part);
	});

});
