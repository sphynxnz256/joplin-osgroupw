import { ColumnDefinitionBuilder, sql } from 'kysely';
import kysely, { compileQuery, compileRawQuery, genericKysely } from './kysely';
import { doubleQuotedDefault, intColumnType, nullModifier, uniqueModifier } from './rawFragments';
import { SqlQuery } from '../types';

// Helpers to write the schema (tables, columns, indexes) with Kysely's schema builder.
// All of them return queries that can be given to Database.transactionExecBatch().

type ColumnDataType = 'text' | 'int' | 'integer' | 'numeric';

export interface ColumnSpec {
	type: ColumnDataType;
	define?: (column: ColumnDefinitionBuilder) => ColumnDefinitionBuilder;
}

export const textPrimaryKey: ColumnSpec = { type: 'text', define: c => c.primaryKey() };
export const integerPrimaryKey: ColumnSpec = { type: 'integer', define: c => c.primaryKey() };
export const autoIncrementKey: ColumnSpec = { type: 'integer', define: c => c.primaryKey().autoIncrement() };
export const optionalText: ColumnSpec = { type: 'text' };
export const optionalInt: ColumnSpec = { type: 'int', define: c => c.modifyEnd(nullModifier) };
export const requiredText: ColumnSpec = { type: 'text', define: c => c.notNull() };
export const requiredInt: ColumnSpec = { type: 'int', define: c => c.notNull() };
export const requiredInteger: ColumnSpec = { type: 'integer', define: c => c.notNull() };
export const uniqueRequiredText: ColumnSpec = { type: 'text', define: c => c.notNull().modifyEnd(uniqueModifier) };
export const emptyText: ColumnSpec = { type: 'text', define: c => c.notNull().defaultTo(doubleQuotedDefault('')) };
export const numericDefaultingToZero: ColumnSpec = { type: 'numeric', define: c => c.notNull().defaultTo(0) };

// A default value that is a number, or a number written between quotes like old databases have it
export const intDefaultingTo = (value: number, quoted = false): ColumnSpec => {
	return { type: 'int', define: c => c.notNull().defaultTo(quoted ? doubleQuotedDefault(`${value}`) : value) };
};

const dataType = (spec: ColumnSpec) => spec.type === 'int' ? intColumnType : spec.type;

export const createTableQuery = (tableName: string, columns: Record<string, ColumnSpec>, options: { ifNotExists?: boolean; temporary?: boolean } = {}) => {
	let builder = kysely.schema.createTable(tableName);
	if (options.ifNotExists) builder = builder.ifNotExists();
	if (options.temporary) builder = builder.temporary();
	for (const [name, spec] of Object.entries(columns)) {
		builder = builder.addColumn(name, dataType(spec), spec.define);
	}
	return compileQuery(builder);
};

export const addColumnQuery = (tableName: string, columnName: string, spec: ColumnSpec) => {
	return compileQuery(kysely.schema.alterTable(tableName).addColumn(columnName, dataType(spec), spec.define));
};

export const createIndexQuery = (indexName: string, tableName: string, columns: string[], options: { unique?: boolean; ifNotExists?: boolean } = {}) => {
	let builder = kysely.schema.createIndex(indexName).on(tableName).columns(columns);
	if (options.unique) builder = builder.unique();
	if (options.ifNotExists) builder = builder.ifNotExists();
	return compileQuery(builder);
};

export const dropTableQuery = (tableName: string, ifExists = false) => {
	const builder = kysely.schema.dropTable(tableName);
	return compileQuery(ifExists ? builder.ifExists() : builder);
};

export const dropIndexQuery = (indexName: string) => compileQuery(kysely.schema.dropIndex(indexName));

export const dropViewQuery = (viewName: string) => compileQuery(kysely.schema.dropView(viewName));

export const compileRaw = (query: Parameters<typeof compileRawQuery>[0]): SqlQuery => compileRawQuery(query);

// SQLite cannot change the type of a column, so the table is recreated: its rows
// are copied to a temporary table, the table is created again with the new
// columns, and the rows are copied back.
export const alterColumnQueries = (tableName: string, columns: Record<string, ColumnSpec>) => {
	const backupName = `${tableName}_backup`;
	const columnNames = Object.keys(columns);

	return [
		createTableQuery(backupName, columns, { temporary: true }),
		compileQuery(genericKysely.insertInto(backupName).expression(genericKysely.selectFrom(tableName).select(columnNames))),
		dropTableQuery(tableName),
		createTableQuery(tableName, columns),
		compileQuery(genericKysely.insertInto(tableName).expression(genericKysely.selectFrom(backupName).select(columnNames))),
		dropTableQuery(backupName),
	];
};

export const createTagsWithNoteCountViewQuery = (options: { ifNotExists?: boolean; withTodoCount?: boolean; excludeDeleted?: boolean }) => {
	// Values must be written in the view, the query cannot have parameters
	const query = kysely
		.selectFrom('tags')
		.leftJoin('note_tags as nt', 'nt.tag_id', 'tags.id')
		.leftJoin('notes', 'notes.id', 'nt.note_id')
		.select(eb => [
			'tags.id as id',
			'tags.title as title',
			'tags.created_time as created_time',
			'tags.updated_time as updated_time',
			eb.fn.count('notes.id').as('note_count'),
			...(options.withTodoCount ? [eb.fn.sum(eb.case().when('notes.todo_completed', '>', sql.lit(0)).then(sql.lit(1)).else(sql.lit(0)).end()).as('todo_completed_count')] : []),
		])
		.where('notes.id', 'is not', null)
		.$if(!!options.excludeDeleted, qb => qb.where('notes.deleted_time', '=', sql.lit(0)))
		.groupBy('tags.id');

	const view = kysely.schema.createView('tags_with_note_count');
	return compileQuery((options.ifNotExists ? view.ifNotExists() : view).as(query));
};
