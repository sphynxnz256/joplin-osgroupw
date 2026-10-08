import { sql, SqlBool, DummyDriver, Kysely, SqliteAdapter, SqliteIntrospector, SqliteQueryCompiler, Compilable } from 'kysely';
import { SqlParams } from '../types';
import { DB } from './tables';

// Joplin runs queries on its own drivers, so Kysely is only used to build SQL text and parameters.
export const kysely = new Kysely<DB>({
	dialect: {
		createAdapter: () => new SqliteAdapter(),
		createDriver: () => new DummyDriver(),
		createIntrospector: db => new SqliteIntrospector(db),
		createQueryCompiler: () => new SqliteQueryCompiler(),
	},
});

// Kysely drops undefined values from insert/update, whereas Joplin binds them as NULL
export const undefinedToNull = <T extends Record<string, unknown>>(data: T) => {
	const output: Record<string, unknown> = {};
	for (const key of Object.keys(data)) output[key] = data[key] === undefined ? null : data[key];
	return output as T;
};

export const compile = (query: Compilable<unknown>) => {
	const compiled = query.compile();
	const params: SqlParams = [...compiled.parameters];
	return { sql: compiled.sql, params };
};

// The project doesn't use strictNullChecks, which makes Kysely treat every column as required on insert.
export const insertRow = <T extends keyof DB>(table: T, row: Partial<Record<keyof DB[T], unknown>>, options: { orReplace?: boolean } = {}) => {
	const builder = options.orReplace ? kysely.insertInto(table).orReplace() : kysely.insertInto(table);
	return compile(builder.values(undefinedToNull(row) as never));
};

// Wraps a hand-written fragment that uses "?" placeholders. Only for callers that still pass SQL text
// (for example the "where" option of BaseModel.all()); new code should use query builder expressions.
export const legacyFragment = (fragment: string, params: unknown[] = []) => {
	const parts = fragment.split('?');
	if (parts.length - 1 !== params.length) throw new Error(`Placeholder count does not match parameter count: ${fragment}`);
	let output = sql<SqlBool>`${sql.raw(parts[0])}`;
	for (let i = 1; i < parts.length; i++) output = sql<SqlBool>`${output}${sql.val(params[i - 1])}${sql.raw(parts[i])}`;
	return output;
};

// Joplin's order option: [{ by: 'title', dir: 'ASC' }] with an optional per-item or global case-insensitive flag
export const orderByClause = (order: { by: string; dir: string; caseInsensitive?: boolean }, caseInsensitive = false) => {
	const ref = sql.ref(order.by);
	return (!!order.caseInsensitive || caseInsensitive) ? sql`${ref} collate nocase ${sql.raw(order.dir)}` : sql`${ref} ${sql.raw(order.dir)}`;
};
