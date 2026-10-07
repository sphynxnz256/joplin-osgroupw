import { Compilable, Insertable, DummyDriver, Expression, ExpressionBuilder, Kysely, RawBuilder, SqlBool, SqliteAdapter, SqliteIntrospector, SqliteQueryCompiler, expressionBuilder, sql } from 'kysely';
import { DatabaseTables } from './tables';

// Kysely is only used to build SQL text and parameters. The queries are
// executed by Joplin's own database drivers (see database.ts), so this
// instance uses a dummy driver that never touches a database.
const dialect = {
	createAdapter: () => new SqliteAdapter(),
	createDriver: () => new DummyDriver(),
	createIntrospector: (db: Kysely<unknown>) => new SqliteIntrospector(db),
	createQueryCompiler: () => new SqliteQueryCompiler(),
};

const kysely = new Kysely<DatabaseTables>({ dialect });

// Code that works on a table chosen at runtime (such as BaseModel) cannot
// use the typed table list, so it uses this instance where any table and
// column name is accepted.
export type GenericTables = Record<string, Record<string, unknown>>;
export const genericKysely = new Kysely<GenericTables>({ dialect });

// The project does not use strictNullChecks, so Kysely cannot tell which columns are
// optional on insert. This helper accepts any subset of the columns of the table.
export const insertRow = <T extends keyof DatabaseTables>(table: T, values: Partial<Insertable<DatabaseTables[T]>>) => {
	return kysely.insertInto(table).values(values as never);
};

// Selects all the columns of a table, or only the given ones
export const selectFromTable = (table: string, fields: string | string[] = '*') => {
	const selectedFields = Array.isArray(fields) ? fields : [];
	return genericKysely.selectFrom(table)
		.$if(!selectedFields.length, qb => qb.selectAll())
		.$if(!!selectedFields.length, qb => qb.select(selectedFields));
};

export const compileQuery = (query: Compilable) => {
	const compiled = query.compile();
	return { sql: compiled.sql, params: [...compiled.parameters] };
};

// For queries written entirely with the `sql` tag (see rawFragments.ts)
export const compileRawQuery = (query: RawBuilder<unknown>) => {
	const compiled = query.compile(genericKysely);
	return { sql: compiled.sql, params: [...compiled.parameters] };
};

export const isCompilable = (query: unknown): query is Compilable => {
	return !!query && typeof query === 'object' && typeof (query as Compilable).compile === 'function';
};

export type Condition = (eb: ExpressionBuilder<GenericTables, string>) => Expression<SqlBool>;

// Values are written into the SQL text instead of being bound, so that a long
// list of IDs cannot go over the maximum number of parameters of a query.
export const inLiterals = (column: string, values: (string | number)[]): Expression<SqlBool> => {
	return sql<SqlBool>`${sql.ref(column)} in (${sql.join(values.map(v => sql.lit(v)))})`;
};

export const notInLiterals = (column: string, values: (string | number)[]): Expression<SqlBool> => {
	return sql<SqlBool>`${sql.ref(column)} not in (${sql.join(values.map(v => sql.lit(v)))})`;
};

// Lets the `where` option of BaseModel accept SQL text with "?" placeholders. It is
// only kept because ResourceScreen.tsx in app-desktop, which is outside packages/lib,
// still passes it. See "Callers outside packages/lib" in MIGRATION_PLAN.md.
export const legacyFragment = (text: string, params: unknown[] = []): RawBuilder<SqlBool> => {
	const parts = text.split('?');
	if (parts.length - 1 !== params.length) throw new Error(`Expected ${parts.length - 1} parameters but got ${params.length}: ${text}`);

	const pieces: Expression<unknown>[] = [];
	parts.forEach((part, index) => {
		if (index > 0) pieces.push(sql`${params[index - 1]}`);
		pieces.push(sql.raw(part));
	});
	return sql<SqlBool>`${sql.join(pieces, sql``)}`;
};

// Turns a Condition, or a legacy SQL string and its parameters, into an expression
export const toExpression = (condition: Condition | string, params: unknown[] = []): Expression<SqlBool> => {
	if (typeof condition === 'string') return legacyFragment(condition, params);
	return condition(expressionBuilder<GenericTables, string>());
};

// COLLATE NOCASE has no builder, so it is a small raw fragment
export const equalsNoCase = (column: string, value: unknown) => {
	return sql<SqlBool>`${sql.ref(column)} = ${value} collate nocase`;
};

// Arguments for `orderBy()`. COLLATE NOCASE has no builder, so it is a small raw fragment.
export const orderByArguments = (column: string, dir: string, caseInsensitive: boolean) => {
	const direction = dir.toLowerCase();
	if (direction !== 'asc' && direction !== 'desc') throw new Error(`Invalid order direction: ${dir}`);
	return [caseInsensitive ? sql`${sql.ref(column)} collate nocase` : sql.ref(column), direction] as const;
};

export default kysely;
