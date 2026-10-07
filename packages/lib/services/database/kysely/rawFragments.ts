import { SqlBool, sql } from 'kysely';

// This is the only file that contains hand-written SQL. Kysely has no builder
// for these SQLite features, so each one is a small fragment written with the
// `sql` tag (values are still bound as parameters, or are numbers that are
// inlined on purpose). See "Raw fragments inventory" in MIGRATION_PLAN.md.

// sqlite-vec (vec0) virtual table and query functions

export const createVecTableQuery = (dimension: number) => {
	return sql`create virtual table if not exists note_embeddings_vec using vec0(embedding float[${sql.lit(dimension)}])`;
};

// vec0 needs k inlined into the MATCH clause, a bound parameter is not visible to its planner
export const vecMatch = (column: string, queryVector: string, k: number) => {
	return sql<SqlBool>`${sql.ref(column)} match ${queryVector} and k = ${sql.lit(k)}`;
};

export const vecToJson = (column: string) => sql<string>`vec_to_json(${sql.ref(column)})`;

// node-sqlite3's exec() doesn't return the insert id, so it is read back with this
export const lastInsertRowId = () => sql<number>`last_insert_rowid()`;

// SQLite full-text search (FTS4) functions

// `column` is a table name to match against any column, or "table.column" for a single one
export const ftsMatch = (column: string, query: string) => sql<SqlBool>`${sql.ref(column)} match ${query}`;

export const ftsOffsets = (table: string) => sql<string>`offsets(${sql.ref(table)})`;

export const ftsMatchInfo = (table: string, format: string) => sql<Uint8Array>`matchinfo(${sql.ref(table)}, ${sql.lit(format)})`;

// Constant conditions used by the search query builder
export const booleanLiteral = (value: 0 | 1) => sql<SqlBool>`${sql.lit(value)}`;

// Schema: full-text search tables, triggers and extension tables

// Existing databases store text defaults between double quotes (DEFAULT ""), and
// the code that reads the schema expects it. So new columns must do the same.
export const doubleQuotedDefault = (value: string) => sql.raw(`"${value}"`);

// Explicit NULL and UNIQUE column modifiers that are written after all the others
export const nullModifier = sql.raw('null');
export const uniqueModifier = sql.raw('unique');

export const createFtsTableQuery = (name: string, contentTable: string, notIndexedColumns: string[], columns: string[]) => {
	const options = [`content="${contentTable}"`, ...notIndexedColumns.map(c => `notindexed="${c}"`), ...columns];
	return sql`create virtual table ${sql.id(name)} using fts4(${sql.raw(options.join(', '))})`;
};

interface FtsTriggerOptions {
	// Triggers are named "<prefix>_fts_before_update", "<prefix>_after_insert", etc.
	prefix: string;
	ftsTable: string;
	sourceTable: string;
	columns: string[];
	// Only index the rows that match this condition
	filter?: string;
}

// Keep the content table and the FTS table in sync.
// More info at https://www.sqlite.org/fts3.html#_external_content_fts4_tables_
export const createFtsTriggerQueries = (options: FtsTriggerOptions) => {
	const { prefix, ftsTable, sourceTable } = options;
	const columns = options.columns.join(', ');
	const filter = options.filter ? `${options.filter} AND ` : '';
	const insert = `INSERT INTO ${ftsTable}(docid, ${columns}) SELECT rowid, ${columns} FROM ${sourceTable} WHERE ${filter}new.rowid = ${sourceTable}.rowid;`;

	return [
		`CREATE TRIGGER ${prefix}_fts_before_update BEFORE UPDATE ON ${sourceTable} BEGIN DELETE FROM ${ftsTable} WHERE docid=old.rowid; END;`,
		`CREATE TRIGGER ${prefix}_fts_before_delete BEFORE DELETE ON ${sourceTable} BEGIN DELETE FROM ${ftsTable} WHERE docid=old.rowid; END;`,
		`CREATE TRIGGER ${prefix}_after_update AFTER UPDATE ON ${sourceTable} BEGIN ${insert} END;`,
		`CREATE TRIGGER ${prefix}_after_insert AFTER INSERT ON ${sourceTable} BEGIN ${insert} END;`,
	].map(query => sql.raw(query));
};

export const dropTriggerQuery = (name: string, ifExists = false) => {
	return sql`drop trigger ${ifExists ? sql.raw('if exists') : sql.raw('')} ${sql.id(name)}`;
};

export const createSearchAuxQuery = () => sql`create virtual table search_aux using fts4aux(notes_fts)`;

export const createSpellfixQuery = () => sql`create virtual table notes_spellfix using spellfix1`;

export const tableInfoQuery = (tableName: string) => sql`pragma table_info(${sql.id(tableName)})`;

// Kysely has no builder for the "int" column type, which the whole schema uses. It is
// not the same as "integer" for SQLite: only INTEGER PRIMARY KEY is an alias of the row ID.
export const intColumnType = sql.raw('int');
