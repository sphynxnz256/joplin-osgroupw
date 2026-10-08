import { sql, Kysely, ColumnDefinitionBuilder, AliasedExpression } from 'kysely';
import { kysely, compile } from '../index';
import { SqlQuery } from '../../types';

// Schema helpers. Raw SQL is limited to what Kysely cannot express: SQLite virtual tables, triggers,
// PRAGMA statements, and the upper case column types and double-quoted string defaults that the
// historical schema uses (the PRAGMA table_info output, and thus table_fields, depends on them).

export type ColumnType = 'TEXT' | 'INT' | 'INTEGER' | 'NUMERIC';

export interface ColumnSpec {
	type: ColumnType;
	notNull?: boolean;
	primaryKey?: boolean;
	autoIncrement?: boolean;
	unique?: boolean;
	// Strings are stored as double-quoted literals, numbers as is
	default?: string | number;
}

// NOT NULL column, with an optional default value
export const required = (type: ColumnType, defaultValue?: string | number): ColumnSpec => {
	return { type, notNull: true, default: defaultValue };
};

export const nullable = (type: ColumnType): ColumnSpec => {
	return { type };
};

export const primaryKey = (type: ColumnType, autoIncrement = false): ColumnSpec => {
	return { type, primaryKey: true, autoIncrement };
};

const buildColumn = (spec: ColumnSpec) => (column: ColumnDefinitionBuilder) => {
	if (spec.primaryKey) column = column.primaryKey();
	if (spec.autoIncrement) column = column.autoIncrement();
	if (spec.unique) column = column.unique();
	if (spec.notNull) column = column.notNull();
	if (spec.default !== undefined) column = column.defaultTo(typeof spec.default === 'string' ? sql.raw(`"${spec.default}"`) : spec.default);
	return column;
};

export const createTableQuery = (name: string, columns: Record<string, ColumnSpec>, options: { ifNotExists?: boolean } = {}) => {
	let builder = kysely.schema.createTable(name);
	if (options.ifNotExists) builder = builder.ifNotExists();
	for (const columnName of Object.keys(columns)) {
		builder = builder.addColumn(columnName, sql.raw(columns[columnName].type), buildColumn(columns[columnName]));
	}
	return compile(builder);
};

export const addColumnQuery = (tableName: string, columnName: string, spec: ColumnSpec) => {
	return compile(kysely.schema.alterTable(tableName).addColumn(columnName, sql.raw(spec.type), buildColumn(spec)));
};

export const createIndexQuery = (name: string, tableName: string, columns: string[], options: { unique?: boolean; ifNotExists?: boolean } = {}) => {
	let builder = kysely.schema.createIndex(name);
	if (options.unique) builder = builder.unique();
	if (options.ifNotExists) builder = builder.ifNotExists();
	return compile(builder.on(tableName).columns(columns));
};

// Creates one index per column, named `${tableName}_${column}`
export const createIndexQueries = (tableName: string, columns: string[]) => {
	return columns.map(column => createIndexQuery(`${tableName}_${column}`, tableName, [column]));
};

export const dropTableQuery = (name: string, options: { ifExists?: boolean } = {}) => {
	const builder = kysely.schema.dropTable(name);
	return compile(options.ifExists ? builder.ifExists() : builder);
};

export const dropIndexQuery = (name: string) => {
	return compile(kysely.schema.dropIndex(name));
};

export const dropViewQuery = (name: string) => {
	return compile(kysely.schema.dropView(name));
};

// Selects over views are loosely typed because the views are not part of the generated table types
type LooseDb = Record<string, Record<string, unknown>>;

export const tagsWithNoteCountViewQuery = (options: { ifNotExists?: boolean; todoCompletedCount?: boolean; excludeDeleted?: boolean }) => {
	const db = kysely as unknown as Kysely<LooseDb>;

	let select = db.selectFrom('tags')
		.leftJoin('note_tags as nt', 'nt.tag_id', 'tags.id')
		.leftJoin('notes', 'notes.id', 'nt.note_id')
		.select(eb => {
			const columns: AliasedExpression<unknown, string>[] = [
				eb.ref('tags.id').as('id'),
				eb.ref('tags.title').as('title'),
				eb.ref('tags.created_time').as('created_time'),
				eb.ref('tags.updated_time').as('updated_time'),
				eb.fn.count('notes.id').as('note_count'),
			];
			if (options.todoCompletedCount) {
				// eslint-disable-next-line promise/prefer-await-to-then -- Kysely case builder, not a promise
				columns.push(eb.fn.sum(eb.case().when('notes.todo_completed', '>', 0).then(1).else(0).end()).as('todo_completed_count'));
			}
			return columns;
		})
		.where('notes.id', 'is not', null);

	if (options.excludeDeleted) select = select.where('notes.deleted_time', '=', 0);

	let view = kysely.schema.createView('tags_with_note_count');
	if (options.ifNotExists) view = view.ifNotExists();
	return compile(view.as(select.groupBy('tags.id')));
};

const compileRaw = (fragment: { compile: (db: typeof kysely)=> { sql: string; parameters: readonly unknown[] } }): SqlQuery => {
	const compiled = fragment.compile(kysely);
	return { sql: compiled.sql, params: [...compiled.parameters] };
};

export const tableInfoQuery = (tableName: string): SqlQuery => {
	return compileRaw(sql`PRAGMA table_info(${sql.raw(`"${tableName}"`)})`);
};

export const createVirtualTableQuery = (name: string, moduleAndArguments: string) => {
	return compileRaw(sql`CREATE VIRTUAL TABLE ${sql.raw(name)} USING ${sql.raw(moduleAndArguments)}`);
};

// Full text search table over a content table. The not-indexed columns are stored but not searchable.
export const createFtsTableQuery = (name: string, contentTable: string, notIndexedColumns: string[], columns: string[]) => {
	const notIndexed = notIndexedColumns.map(c => `notindexed="${c}"`);
	return createVirtualTableQuery(name, `fts4(content="${contentTable}", ${notIndexed.join(', ')}, ${columns.join(', ')})`);
};

export const createSearchAuxTableQuery = () => createVirtualTableQuery('search_aux', 'fts4aux(notes_fts)');

export const createSpellfixTableQuery = () => createVirtualTableQuery('notes_spellfix', 'spellfix1');

interface FtsTriggerOptions {
	// Trigger names are `${prefix}_fts_before_update`, `${prefix}_fts_before_delete`,
	// `${prefix}_after_update` and `${prefix}_after_insert`
	prefix: string;
	ftsTable: string;
	contentTable: string;
	columns: string[];
	// Extra SQL condition, without trailing AND, to restrict which content rows are indexed
	condition?: string;
}

// Keep the content table and the FTS table in sync.
// More info at https://www.sqlite.org/fts3.html#_external_content_fts4_tables_
export const createFtsTriggerQueries = (options: FtsTriggerOptions) => {
	const { prefix, ftsTable, contentTable } = options;
	const columns = options.columns.join(', ');
	const condition = options.condition ? `${options.condition} AND ` : '';
	const insert = `INSERT INTO ${ftsTable}(docid, ${columns}) SELECT rowid, ${columns} FROM ${contentTable} WHERE ${condition}new.rowid = ${contentTable}.rowid;`;
	const remove = `DELETE FROM ${ftsTable} WHERE docid=old.rowid;`;

	return [
		compileRaw(sql`CREATE TRIGGER ${sql.raw(`${prefix}_fts_before_update`)} BEFORE UPDATE ON ${sql.raw(contentTable)} BEGIN ${sql.raw(remove)} END`),
		compileRaw(sql`CREATE TRIGGER ${sql.raw(`${prefix}_fts_before_delete`)} BEFORE DELETE ON ${sql.raw(contentTable)} BEGIN ${sql.raw(remove)} END`),
		compileRaw(sql`CREATE TRIGGER ${sql.raw(`${prefix}_after_update`)} AFTER UPDATE ON ${sql.raw(contentTable)} BEGIN ${sql.raw(insert)} END`),
		compileRaw(sql`CREATE TRIGGER ${sql.raw(`${prefix}_after_insert`)} AFTER INSERT ON ${sql.raw(contentTable)} BEGIN ${sql.raw(insert)} END`),
	];
};

export const dropTriggerQuery = (name: string, options: { ifExists?: boolean } = {}) => {
	return compileRaw(sql`DROP TRIGGER ${sql.raw(options.ifExists ? 'IF EXISTS ' : '')}${sql.raw(name)}`);
};
