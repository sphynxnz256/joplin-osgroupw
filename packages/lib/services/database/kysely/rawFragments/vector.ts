import { sql, SqlBool } from 'kysely';
import { kysely } from '../index';

// Raw fragments for the sqlite-vec "vec0" virtual table, which Kysely cannot express.

const compileRaw = (fragment: { compile: (db: typeof kysely)=> { sql: string; parameters: readonly unknown[] } }) => {
	const compiled = fragment.compile(kysely);
	return { sql: compiled.sql, params: [...compiled.parameters] as (string | number)[] };
};

export const createVecTableQuery = (dimension: number) => {
	return compileRaw(sql`CREATE VIRTUAL TABLE IF NOT EXISTS note_embeddings_vec USING vec0(embedding FLOAT[${sql.raw(String(Math.trunc(dimension)))}])`);
};

export const deleteVecRowsQuery = (rowids: number[]) => {
	return compileRaw(sql`DELETE FROM note_embeddings_vec WHERE rowid IN (${sql.join(rowids)})`);
};

export const insertVecRowQuery = (rowid: number, vector: number[]) => {
	return compileRaw(sql`INSERT INTO note_embeddings_vec(rowid, embedding) VALUES (${rowid}, ${JSON.stringify(vector)})`);
};

export const deleteAllVecRowsQuery = () => {
	return compileRaw(sql`DELETE FROM note_embeddings_vec`);
};

export const lastInsertRowidQuery = () => {
	return compileRaw(sql`SELECT last_insert_rowid() AS id`);
};

// k must be inlined into the MATCH clause for vec0's planner
export const vecMatch = (vector: number[], k: number) => {
	return sql<SqlBool>`v.embedding MATCH ${JSON.stringify(vector)} AND k = ${sql.raw(String(Math.trunc(k)))}`;
};

export const vecToJson = (column: string) => sql<string>`vec_to_json(${sql.ref(column)})`;

export const vecDistance = () => sql<number>`v.distance`;

export const vecTableExistsQuery = () => {
	return compileRaw(sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'note_embeddings_vec'`);
};
