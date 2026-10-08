import filterParser from './filterParser';
import queryBuilder from './queryBuilder';
import time from '../../time';

const referencedTables = (sql: string) => {
	const tables = new Set<string>();
	for (const match of sql.matchAll(/\b(?:from|join)\s+"([^"]+)"/gi)) tables.add(match[1]);
	return [...tables].sort();
};

const msFromDate = (date: string) => time.formatLocalToMs(date, 'YYYYMMDD').toString();

// Each case lists the tables the query reads (including WITH clauses) and the bound parameters in SQL order
describe('queryBuilder', () => {

	test.each([
		['hello', true, ['notes_fts'], ['"hello"']],
		['hello', false, ['notes'], ['%hello%', '%hello%']],
		['hello world', true, ['notes_fts'], ['"hello" "world"']],
		['hello world', false, ['notes'], ['%hello%', '%hello%', '%world%', '%world%']],
		['"hello world"', true, ['notes_fts'], ['"hello world"']],
		['"hello world"', false, ['notes'], ['%hello world%', '%hello world%']],
		['any:1 hello world', true, ['notes_fts'], [-1, '"hello" OR "world"']],
		['title:hello', true, ['notes_fts'], ['title:hello']],
		['body:hello', false, ['notes'], ['%hello%']],
		['-hello', true, ['notes_fts'], ['"hello"']],
		['-hello', false, ['notes'], ['%hello%', '%hello%']],
		['any:1 -hello -world', true, ['notes_fts'], [-1, '"hello"', '"world"']],
		['tag:a', true, ['note_tags', 'notes_fts', 'notes_normalized', 'notes_with_INCLUSION_tags', 'tags'], ['a']],
		['tag:a tag:b', false, ['note_tags', 'notes', 'notes_with_INCLUSION_tags', 'tags'], ['a', 'b']],
		['any:1 tag:a tag:b', true, ['note_tags', 'notes_fts', 'notes_normalized', 'notes_with_INCLUSION_tags', 'tags'], ['a', 'b', -1]],
		['-tag:a', false, ['note_tags', 'notes', 'notes_with_EXCLUSION_tags', 'tags'], ['a']],
		['any:1 -tag:a -tag:b', true, ['all_notes_with_EXCLUSION_tags', 'note_tags', 'notes_fts', 'notes_normalized', 'notes_with_EXCLUSION_tags', 'tags'], ['a', 'b', -1]],
		['resource:image/*', true, ['note_resources', 'notes_fts', 'notes_normalized', 'notes_with_INCLUSION_resources', 'resources'], [1, 'image/%']],
		['notebook:folder1', true, ['folders', 'notebooks_in_scope', 'notes_fts', 'notes_normalized'], ['folder1']],
		['notebook:folder1 -notebook:folder2', false, ['folders', 'notebooks_in_scope', 'notebooks_not_in_scope', 'notes'], ['folder1', 'folder2']],
		['any:1 notebook:folder1 hello', true, ['folders', 'notebooks_in_scope', 'notes_fts', 'notes_normalized'], ['folder1', '"hello"']],
		['type:todo', true, ['notes_fts'], [1]],
		['iscompleted:1 type:todo', false, ['notes'], [1, 1, 0]],
		['created:20200101 updated:20201231', true, ['notes_fts', 'notes_normalized'], [msFromDate('20200101'), msFromDate('20201231')]],
		['due:20201231', false, ['notes'], [1, msFromDate('20201231')]],
		['sourceurl:https://www.google.com', true, ['notes_fts', 'notes_normalized'], ['https://www.google.com']],
		['id:abc', true, ['notes_fts', 'notes_normalized'], ['abc']],
		['latitude:10', false, ['notes'], ['10']],
	])('should build the query for "%s" (fts: %s)', (searchString, useFts, expectedTables, expectedParams) => {
		const { query, params } = queryBuilder(filterParser(searchString), useFts);

		expect(referencedTables(query)).toEqual([...expectedTables].sort());
		expect(params).toEqual(expectedParams);
		expect(query.includes('matchinfo(')).toBe(useFts);
	});

});
