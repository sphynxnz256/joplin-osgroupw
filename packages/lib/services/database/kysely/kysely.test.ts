import { sql } from 'kysely';
import kysely, { compileQuery, genericKysely, inLiterals, legacyFragment, orderByArguments, toExpression } from './kysely';

describe('services/database/kysely', () => {

	test.each([
		[
			'insert',
			() => kysely.insertInto('notes').values({ id: 'a', title: 'b' } as never),
			'insert into "notes" ("id", "title") values (?, ?)',
			['a', 'b'],
		],
		[
			'insert or replace',
			() => kysely.insertInto('key_values').values({ key: 'k', value: 'v' } as never).orReplace(),
			'insert or replace into "key_values" ("key", "value") values (?, ?)',
			['k', 'v'],
		],
		[
			'update',
			() => kysely.updateTable('notes').set({ title: 't' }).where('id', '=', 'a'),
			'update "notes" set "title" = ? where "id" = ?',
			['t', 'a'],
		],
		[
			'select with raw collation',
			() => kysely.selectFrom('tags').select(['id']).where('title', 'like', 'a%').orderBy(sql`title collate nocase`),
			'select "id" from "tags" where "title" like ? order by title collate nocase',
			['a%'],
		],
		[
			'recursive CTE',
			() => kysely
				.withRecursive('tree(id)', db => db.selectFrom('folders').select('id').where('id', '=', 'x')
					.unionAll(db.selectFrom('folders').innerJoin('tree', 'tree.id', 'folders.parent_id').select('folders.id')))
				.selectFrom('tree').select('id'),
			'with recursive "tree"("id") as (select "id" from "folders" where "id" = ? union all select "folders"."id" from "folders" inner join "tree" on "tree"."id" = "folders"."parent_id") select "id" from "tree"',
			['x'],
		],
	])('should compile %s', (_name, build, expectedSql, expectedParams) => {
		const query = compileQuery(build());
		expect(query.sql).toBe(expectedSql);
		expect(query.params).toEqual(expectedParams);
	});

	test.each([
		['legacy fragment with parameters', () => legacyFragment('a = ? OR b LIKE ?', [1, 'x%']), 'select * from "notes" where a = ? OR b LIKE ?', [1, 'x%']],
		['IDs written as literals', () => inLiterals('id', ['a', 'it\'s']), 'select * from "notes" where "id" in (\'a\', \'it\'\'s\')', []],
		['condition function', () => toExpression(eb => eb('title', '=', 'x')), 'select * from "notes" where "title" = ?', ['x']],
		['legacy string condition', () => toExpression('is_todo = 1'), 'select * from "notes" where is_todo = 1', []],
	])('should build conditions: %s', (_name, build, expectedSql, expectedParams) => {
		const query = compileQuery(genericKysely.selectFrom('notes').selectAll().where(build()));
		expect(query.sql).toBe(expectedSql);
		expect(query.params).toEqual(expectedParams);
	});

	test('should build order by arguments', () => {
		const query = compileQuery(genericKysely.selectFrom('notes').selectAll().orderBy(...orderByArguments('title', 'DESC', true)));
		expect(query.sql).toBe('select * from "notes" order by "title" collate nocase desc');
		expect(() => orderByArguments('title', 'sideways', false)).toThrow('Invalid order direction');
		expect(() => legacyFragment('a = ?', [])).toThrow('Expected 1 parameters');
	});

});
