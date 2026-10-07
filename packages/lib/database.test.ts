import { setupDatabaseAndSynchronizer, switchClient } from './testing/test-utils';
import BaseModel from './BaseModel';
import Database from './database';

describe('database', () => {
	beforeEach(async () => {
		await setupDatabaseAndSynchronizer(1);
		await switchClient(1);
	});

	it('should not modify cached field names', (async () => {
		const db = BaseModel.db();

		const fieldNames = db.tableFieldNames('notes');
		const fieldCount = fieldNames.length;
		fieldNames.push('type_');

		expect(fieldCount).toBeGreaterThan(0);
		expect(db.tableFieldNames('notes').length).toBe(fieldCount);
	}));

	it.each([
		['skips keys ending with an underscore and stores undefined as null', 'notes', { id: 'a', title: 't', type_: 1, body: undefined }, 'insert into "notes" ("id", "title", "body") values (?, ?, ?)', ['a', 't', null]],
		['quotes column names that are SQL keywords', 'notes', { id: 'a', order: 5 }, 'insert into "notes" ("id", "order") values (?, ?)', ['a', 5]],
	])('should build insert queries: %s', (_name, table, data, expectedSql, expectedParams) => {
		expect(Database.insertQuery(table, data)).toEqual({ sql: expectedSql, params: expectedParams });
	});

	it.each([
		['one condition', { title: 't', type_: 1 }, { id: 'a' }, 'update "notes" set "title" = ? where "id" = ?', ['t', 'a']],
		['several conditions', { title: 't' }, { parent_id: 'p', is_conflict: 0 }, 'update "notes" set "title" = ? where "parent_id" = ? and "is_conflict" = ?', ['t', 'p', 0]],
	])('should build update queries: %s', (_name, data, where, expectedSql, expectedParams) => {
		expect(Database.updateQuery('notes', data, where)).toEqual({ sql: expectedSql, params: expectedParams });
	});

	it('should refuse queries that have no data or no condition', () => {
		expect(() => Database.insertQuery('notes', {})).toThrow('Data is empty');
		expect(() => Database.insertQuery('notes', { type_: 1 })).toThrow('Data is empty');
		expect(() => Database.updateQuery('notes', { title: 't' }, {})).toThrow('Where condition is empty');
	});

});
