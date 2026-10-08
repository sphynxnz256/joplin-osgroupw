import { compile, insertRow, kysely } from './index';

describe('services/database/kysely', () => {

	test('should compile insert, update, select and recursive queries', () => {
		expect(insertRow('notes', { id: 'a', title: undefined })).toEqual({
			sql: 'insert into "notes" ("id", "title") values (?, ?)',
			params: ['a', null],
		});
		expect(insertRow('notes', { id: 'a' }, { orReplace: true }).sql).toBe('insert or replace into "notes" ("id") values (?)');
		expect(compile(kysely.updateTable('notes').set({ title: 'x' }).where('id', '=', 'a'))).toEqual({
			sql: 'update "notes" set "title" = ? where "id" = ?',
			params: ['x', 'a'],
		});
		expect(compile(kysely.selectFrom('notes').select('id').where('id', 'in', ['a', 'b'])).params).toEqual(['a', 'b']);
		const recursive = kysely.withRecursive('t(id)', db => db.selectFrom('folders').select('id')).selectFrom('t').selectAll();
		expect(compile(recursive).sql).toContain('with recursive "t"("id") as');
	});

});
