import { sql, SqlBool } from 'kysely';

// Raw SQL that Kysely cannot express: FTS4 MATCH, offsets() and matchinfo().

// column is optional: "notes_fts MATCH ?" matches all columns, "notes_fts.title MATCH ?" only the title.
export const ftsMatch = (table: string, column: string | null, query: string) => {
	const target = column ? sql.ref(`${table}.${column}`) : sql.ref(table);
	return sql<SqlBool>`${target} match ${query}`;
};

export const ftsOffsets = (table: string) => sql<Buffer>`offsets(${sql.ref(table)})`.as('offsets');

export const ftsMatchInfo = (table: string) => sql<Buffer>`matchinfo(${sql.ref(table)}, 'pcnalx')`.as('matchinfo');

export const alwaysTrue = sql<SqlBool>`1`;

export const alwaysFalse = sql<SqlBool>`0`;
