import { Kysely, DummyDriver, SqliteAdapter, SqliteIntrospector, SqliteQueryCompiler, Compilable, CompiledQuery, RawBuilder, SelectQueryBuilder, SqlBool, sql } from 'kysely';
import { SqlParams } from './types';

// The tables are not described to Kysely, so any table and column name is accepted
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- See above
export type AnyDatabase = Record<string, Record<string, any>>;

// Kysely is only used to build queries. They are executed by the platform
// specific database drivers, via the Database class.
const queryBuilder = new Kysely<AnyDatabase>({
	dialect: {
		createAdapter: () => new SqliteAdapter(),
		createDriver: () => new DummyDriver(),
		createIntrospector: db => new SqliteIntrospector(db),
		createQueryCompiler: () => new SqliteQueryCompiler(),
	},
});

export const toSqlQuery = (query: Compilable | CompiledQuery): { sql: string; params: SqlParams } => {
	const compiled = 'compile' in query ? query.compile() : query;
	return { sql: compiled.sql, params: [...compiled.parameters] };
};

// Wraps a hand-written SQL fragment with positional "?" placeholders, as passed
// by callers in the "where" and "conditions" options of the models
export const rawCondition = (sqlFragment: string, params: unknown[] = []): RawBuilder<SqlBool> => {
	const parts = sqlFragment.split('?');
	if (parts.length - 1 !== params.length) throw new Error(`Expected ${parts.length - 1} parameters but got ${params.length}: ${sqlFragment}`);
	return sql<SqlBool>(parts as unknown as TemplateStringsArray, ...params);
};

export interface OrderField {
	by: string;
	dir: string;
	caseInsensitive?: boolean;
}

export const orderByFields = <Q extends SelectQueryBuilder<AnyDatabase, string, object>>(query: Q, order: OrderField[], caseInsensitive = false) => {
	let output = query;
	for (const o of order) {
		const collate = (!!o.caseInsensitive || caseInsensitive) ? sql` collate nocase` : sql``;
		output = output.orderBy(sql`${sql.ref(o.by)}${collate}`, o.dir.toLowerCase() as 'asc' | 'desc') as Q;
	}
	return output;
};

// Lists of values are written inline, not as bound parameters, because the number of
// parameters per statement is limited and some of the lists (such as note IDs) can be large
export const valuesList = (values: (string | number)[]) => {
	return sql<string>`(${sql.join(values.map(v => sql.lit(v)))})`;
};

export default queryBuilder;
