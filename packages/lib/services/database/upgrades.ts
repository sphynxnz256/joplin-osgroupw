import { sql } from 'kysely';
import Resource from '../../models/Resource';
import { SqlQuery } from './types';
import addMigrationFile from './addMigrationFile';
import { compileQuery, compileRawQuery, genericKysely, insertRow } from './kysely/kysely';
import { addColumnQuery, alterColumnQueries, createTagsWithNoteCountViewQuery, autoIncrementKey, createIndexQuery, createTableQuery, dropIndexQuery, dropTableQuery, dropViewQuery, emptyText, integerPrimaryKey, intDefaultingTo, numericDefaultingToZero, optionalText, requiredInt, requiredInteger, requiredText, textPrimaryKey } from './kysely/schema';
import { createFtsTableQuery, createFtsTriggerQueries, createSearchAuxQuery, createSpellfixQuery, dropTriggerQuery } from './kysely/rawFragments';

// The database upgrade steps for versions 1 to 41. The upgrade steps from version 42 are
// in services/database/migrations. Each version of the database must always create the
// exact same schema, as existing profiles have been upgraded by these steps. This is
// checked by schemaHistory.test.ts.

const baseItemTables = ['notes', 'folders', 'tags', 'note_tags', 'resources'];

const zero = intDefaultingTo(0);

const notesFtsTriggers = (sourceTable: string, columns: string[], filter?: string) => {
	return createFtsTriggerQueries({ prefix: 'notes', ftsTable: 'notes_fts', sourceTable, columns, filter }).map(compileRawQuery);
};

const dropNotesFtsTriggers = (ifExists: boolean) => {
	return ['notes_fts_before_update', 'notes_fts_before_delete', 'notes_after_update', 'notes_after_insert'].map(name => compileRawQuery(dropTriggerQuery(name, ifExists)));
};

const createNotesNormalizedQueries = (withAllFields: boolean) => {
	const columns = withAllFields ? {
		id: requiredText,
		title: emptyText,
		body: emptyText,
		user_created_time: zero,
		user_updated_time: zero,
		is_todo: zero,
		todo_completed: zero,
		parent_id: emptyText,
		latitude: numericDefaultingToZero,
		longitude: numericDefaultingToZero,
		altitude: numericDefaultingToZero,
		source_url: emptyText,
	} : {
		id: requiredText,
		title: emptyText,
		body: emptyText,
	};

	const queries = [
		createTableQuery('notes_normalized', columns),
		createIndexQuery('notes_normalized_id', 'notes_normalized', ['id']),
	];

	if (withAllFields) {
		for (const field of ['user_created_time', 'user_updated_time', 'is_todo', 'todo_completed', 'parent_id', 'latitude', 'longitude', 'altitude', 'source_url']) {
			queries.push(createIndexQuery(`notes_normalized_${field}`, 'notes_normalized', [field]));
		}
	}

	return queries;
};

const structureQueries = () => {
	const queries: SqlQuery[] = [];
	const timestamps = { created_time: requiredInt, updated_time: requiredInt };
	const indexes = (tableName: string, columns: string[]) => {
		for (const column of columns) queries.push(createIndexQuery(`${tableName}_${column}`, tableName, [column]));
	};

	queries.push(createTableQuery('folders', { id: textPrimaryKey, title: emptyText, ...timestamps }));
	indexes('folders', ['title', 'updated_time']);

	queries.push(createTableQuery('notes', {
		id: textPrimaryKey,
		parent_id: emptyText,
		title: emptyText,
		body: emptyText,
		...timestamps,
		is_conflict: zero,
		latitude: numericDefaultingToZero,
		longitude: numericDefaultingToZero,
		altitude: numericDefaultingToZero,
		author: emptyText,
		source_url: emptyText,
		is_todo: zero,
		todo_due: zero,
		todo_completed: zero,
		source: emptyText,
		source_application: emptyText,
		application_data: emptyText,
		order: zero,
	}));
	indexes('notes', ['title', 'updated_time', 'is_conflict', 'is_todo', 'order']);

	queries.push(createTableQuery('tags', { id: textPrimaryKey, title: emptyText, ...timestamps }));
	indexes('tags', ['title', 'updated_time']);

	queries.push(createTableQuery('note_tags', { id: textPrimaryKey, note_id: requiredText, tag_id: requiredText, ...timestamps }));
	indexes('note_tags', ['note_id', 'tag_id', 'updated_time']);

	queries.push(createTableQuery('resources', { id: textPrimaryKey, title: emptyText, mime: requiredText, filename: emptyText, ...timestamps }));
	indexes('resources', ['title', 'updated_time']);

	queries.push(createTableQuery('settings', { key: textPrimaryKey, value: optionalText, type: requiredInt }));

	queries.push(createTableQuery('table_fields', {
		id: integerPrimaryKey,
		table_name: requiredText,
		field_name: requiredText,
		field_type: requiredInt,
		field_default: optionalText,
	}));

	queries.push(createTableQuery('sync_items', {
		id: integerPrimaryKey,
		sync_target: requiredInt,
		sync_time: zero,
		item_type: requiredInt,
		item_id: requiredText,
	}));
	indexes('sync_items', ['sync_time', 'sync_target', 'item_type', 'item_id']);

	queries.push(createTableQuery('deleted_items', { id: integerPrimaryKey, item_type: requiredInt, item_id: requiredText, deleted_time: requiredInt }));

	queries.push(createTableQuery('version', { version: requiredInt }));
	queries.push(compileQuery(insertRow('version', { version: 1 })));

	return queries;
};

const itemChangesAndNoteResourcesQueries = () => {
	return [
		createTableQuery('item_changes', { id: autoIncrementKey, item_type: requiredInt, item_id: requiredText, type: requiredInt, created_time: requiredInt }),
		createIndexQuery('item_changes_item_id', 'item_changes', ['item_id']),
		createIndexQuery('item_changes_created_time', 'item_changes', ['created_time']),
		createIndexQuery('item_changes_item_type', 'item_changes', ['item_type']),

		createTableQuery('note_resources', { id: integerPrimaryKey, note_id: requiredText, resource_id: requiredText, is_associated: requiredInt, last_seen_time: requiredInt }),
		createIndexQuery('note_resources_note_id', 'note_resources', ['note_id']),
		createIndexQuery('note_resources_resource_id', 'note_resources', ['resource_id']),

		compileQuery(genericKysely
			.insertInto('item_changes')
			.columns(['item_type', 'item_id', 'type', 'created_time'])
			.expression(genericKysely.selectFrom('notes').select([sql.lit(1).as('item_type'), 'id', sql.lit(1).as('type'), sql.val(Date.now()).as('created_time')]))),
	];
};

const resourcesColumnsAtVersion14 = {
	id: textPrimaryKey,
	title: emptyText,
	mime: requiredText,
	filename: emptyText,
	created_time: requiredInt,
	updated_time: requiredInt,
	user_created_time: zero,
	user_updated_time: zero,
	file_extension: emptyText,
	encryption_cipher_text: emptyText,
	encryption_applied: zero,
	encryption_blob_encrypted: zero,
};

const notesColumnsAtVersion30 = {
	id: textPrimaryKey,
	parent_id: emptyText,
	title: emptyText,
	body: emptyText,
	created_time: requiredInt,
	updated_time: requiredInt,
	is_conflict: zero,
	latitude: numericDefaultingToZero,
	longitude: numericDefaultingToZero,
	altitude: numericDefaultingToZero,
	author: emptyText,
	source_url: emptyText,
	is_todo: zero,
	todo_due: zero,
	todo_completed: zero,
	source: emptyText,
	source_application: emptyText,
	application_data: emptyText,
	order: numericDefaultingToZero, // Changed from INT to NUMERIC in this version
	user_created_time: zero,
	user_updated_time: zero,
	encryption_cipher_text: emptyText,
	encryption_applied: zero,
	markup_language: intDefaultingTo(1),
	is_shared: zero,
};

const ftsColumnsAtVersion33 = ['id', 'title', 'body', 'user_created_time', 'user_updated_time', 'is_todo', 'todo_completed', 'parent_id', 'latitude', 'longitude', 'altitude', 'source_url'];

export default (targetVersion: number): SqlQuery[] => {
	const queries: SqlQuery[] = [];

	if (targetVersion === 1) {
		queries.push(...structureQueries());
	}

	if (targetVersion === 2) {
		queries.push(dropTableQuery('deleted_items'));
		queries.push(createTableQuery('deleted_items', { id: integerPrimaryKey, item_type: requiredInt, item_id: requiredText, deleted_time: requiredInt, sync_target: requiredInt }));
		queries.push(createIndexQuery('deleted_items_sync_target', 'deleted_items', ['sync_target']));
	}

	if (targetVersion === 3) {
		queries.push(...alterColumnQueries('settings', { key: textPrimaryKey, value: optionalText }));
	}

	if (targetVersion === 4) {
		const syncContext = genericKysely.selectFrom('settings').select('value').where('key', '=', 'sync.context');
		queries.push(compileQuery(genericKysely.insertInto('settings').values({ key: 'sync.3.context', value: syncContext })));
		queries.push(compileQuery(genericKysely.deleteFrom('settings').where('key', '=', 'sync.context')));
	}

	if (targetVersion === 5) {
		for (const tableName of baseItemTables) {
			queries.push(addColumnQuery(tableName, 'user_created_time', zero));
			queries.push(addColumnQuery(tableName, 'user_updated_time', zero));
			queries.push(compileQuery(genericKysely.updateTable(tableName).set(eb => ({ user_created_time: eb.ref('created_time') }))));
			queries.push(compileQuery(genericKysely.updateTable(tableName).set(eb => ({ user_updated_time: eb.ref('updated_time') }))));
			queries.push(createIndexQuery(`${tableName}_user_updated_time`, tableName, ['user_updated_time']));
		}
	}

	if (targetVersion === 6) {
		queries.push(createTableQuery('alarms', { id: autoIncrementKey, note_id: requiredText, trigger_time: requiredInt }));
		queries.push(createIndexQuery('alarm_note_id', 'alarms', ['note_id']));
	}

	if (targetVersion === 7) {
		queries.push(addColumnQuery('resources', 'file_extension', emptyText));
	}

	if (targetVersion === 8) {
		queries.push(addColumnQuery('sync_items', 'sync_disabled', intDefaultingTo(0, true)));
		queries.push(addColumnQuery('sync_items', 'sync_disabled_reason', emptyText));
	}

	if (targetVersion === 9) {
		queries.push(createTableQuery('master_keys', {
			id: textPrimaryKey,
			created_time: requiredInt,
			updated_time: requiredInt,
			source_application: requiredText,
			encryption_method: requiredInt,
			checksum: requiredText,
			content: requiredText,
		}));

		for (const tableName of baseItemTables) {
			queries.push(addColumnQuery(tableName, 'encryption_cipher_text', emptyText));
			queries.push(addColumnQuery(tableName, 'encryption_applied', zero));
			queries.push(createIndexQuery(`${tableName}_encryption_applied`, tableName, ['encryption_applied']));
		}

		queries.push(addColumnQuery('sync_items', 'force_sync', zero));
		queries.push(addColumnQuery('resources', 'encryption_blob_encrypted', zero));
	}

	if (targetVersion === 10) {
		queries.push(...itemChangesAndNoteResourcesQueries());
	}

	if (targetVersion === 11) {
		// This trick was needed because Electron Builder incorrectly released a dev branch containing v10 as it was
		// still being developed, and the db schema was not final at that time. So this v11 was created to
		// make sure any invalid db schema that was accidentally created was deleted and recreated.
		queries.push(dropTableQuery('item_changes'));
		queries.push(dropTableQuery('note_resources'));
		queries.push(...itemChangesAndNoteResourcesQueries());
	}

	if (targetVersion === 12) {
		queries.push(addColumnQuery('folders', 'parent_id', emptyText));
	}

	if (targetVersion === 13) {
		queries.push(addColumnQuery('resources', 'fetch_status', intDefaultingTo(2, true)));
		queries.push(addColumnQuery('resources', 'fetch_error', emptyText));
		queries.push(compileQuery(genericKysely.updateTable('resources').set({ fetch_status: Resource.FETCH_STATUS_DONE })));
	}

	if (targetVersion === 14) {
		queries.push(createTableQuery('resource_local_states', {
			id: integerPrimaryKey,
			resource_id: requiredText,
			fetch_status: intDefaultingTo(2, true),
			fetch_error: emptyText,
		}));

		queries.push(compileQuery(genericKysely
			.insertInto('resource_local_states')
			.expression(genericKysely.selectFrom('resources').select([sql.lit(null).as('local_state_id'), 'id', 'fetch_status', 'fetch_error']))));

		queries.push(createIndexQuery('resource_local_states_resource_id', 'resource_local_states', ['resource_id']));
		queries.push(createIndexQuery('resource_local_states_resource_fetch_status', 'resource_local_states', ['fetch_status']));

		queries.push(...alterColumnQueries('resources', resourcesColumnsAtVersion14));
	}

	if (targetVersion === 15) {
		queries.push(compileRawQuery(createFtsTableQuery('notes_fts', 'notes', ['id'], ['id', 'title', 'body'])));
		queries.push(compileQuery(genericKysely
			.insertInto('notes_fts')
			.columns(['docid', 'id', 'title', 'body'])
			.expression(genericKysely.selectFrom('notes').select(['rowid', 'id', 'title', 'body']).where('is_conflict', '=', 0).where('encryption_applied', '=', 0))));
		queries.push(...notesFtsTriggers('notes', ['id', 'title', 'body'], 'is_conflict = 0 AND encryption_applied = 0'));
	}

	if (targetVersion === 18) {
		queries.push(...createNotesNormalizedQueries(false));
		queries.push(...dropNotesFtsTriggers(true));
		queries.push(dropTableQuery('notes_fts', true));
		queries.push(compileRawQuery(createFtsTableQuery('notes_fts', 'notes_normalized', ['id'], ['id', 'title', 'body'])));
		queries.push(...notesFtsTriggers('notes_normalized', ['id', 'title', 'body']));
	}

	if (targetVersion === 19) {
		queries.push(createTableQuery('revisions', {
			id: textPrimaryKey,
			parent_id: emptyText,
			item_type: requiredInt,
			item_id: requiredText,
			item_updated_time: requiredInt,
			title_diff: emptyText,
			body_diff: emptyText,
			metadata_diff: emptyText,
			encryption_cipher_text: emptyText,
			encryption_applied: zero,
			updated_time: requiredInt,
			created_time: requiredInt,
		}));

		for (const column of ['parent_id', 'item_type', 'item_id', 'item_updated_time', 'updated_time']) {
			queries.push(createIndexQuery(`revisions_${column}`, 'revisions', [column]));
		}

		queries.push(addColumnQuery('item_changes', 'source', intDefaultingTo(1)));
		queries.push(addColumnQuery('item_changes', 'before_change_item', emptyText));
	}

	if (targetVersion === 20) {
		queries.push(createTableQuery('migrations', { id: integerPrimaryKey, number: requiredInteger, updated_time: requiredInt, created_time: requiredInt }));
		queries.push(addColumnQuery('resources', 'size', intDefaultingTo(-1)));
		queries.push(addMigrationFile(20));
	}

	if (targetVersion === 21) {
		queries.push(addColumnQuery('sync_items', 'item_location', intDefaultingTo(1)));
	}

	if (targetVersion === 22) {
		queries.push(createTableQuery('resources_to_download', { id: integerPrimaryKey, resource_id: requiredText, updated_time: requiredInt, created_time: requiredInt }));
		queries.push(createIndexQuery('resources_to_download_resource_id', 'resources_to_download', ['resource_id']));
		queries.push(createIndexQuery('resources_to_download_updated_time', 'resources_to_download', ['updated_time']));
	}

	if (targetVersion === 23) {
		queries.push(createTableQuery('key_values', { id: integerPrimaryKey, key: requiredText, value: requiredText, type: requiredInt, updated_time: requiredInt }));
		queries.push(createIndexQuery('key_values_key', 'key_values', ['key'], { unique: true }));
	}

	if (targetVersion === 24) {
		queries.push(addColumnQuery('notes', 'markup_language', intDefaultingTo(1))); // 1: Markdown, 2: HTML
	}

	if (targetVersion === 25) {
		queries.push(createTagsWithNoteCountViewQuery({}));
	}

	if (targetVersion === 26) {
		for (const tableName of baseItemTables) {
			queries.push(addColumnQuery(tableName, 'is_shared', zero));
		}
	}

	if (targetVersion === 27) {
		queries.push(addMigrationFile(27));
	}

	if (targetVersion === 28) {
		queries.push(createIndexQuery('resources_size', 'resources', ['size']));
	}

	if (targetVersion === 29) {
		queries.push(addColumnQuery('version', 'table_fields_version', zero));
	}

	if (targetVersion === 30) {
		// Change the type of the "order" field from INT to NUMERIC
		// Making it a float provides a much bigger range when inserting notes.
		// For example, with an INT, inserting a note C between note A with order 1000 and
		// note B with order 1001 wouldn't be possible without changing the order
		// value of note A or B. But with a float, we can set the order of note C to 1000.5
		queries.push(...alterColumnQueries('notes', notesColumnsAtVersion30));
	}

	if (targetVersion === 31) {
		// This empty version is due to the revert of the hierarchical tag feature
		// We need to keep the version for the users who have upgraded using
		// the pre-release
		queries.push(addColumnQuery('tags', 'parent_id', emptyText));
	}

	if (targetVersion === 32) {
		// This is the same as version 25 - this is to complete the
		// revert of the hierarchical tag feature.
		queries.push(createTagsWithNoteCountViewQuery({ ifNotExists: true }));
	}

	if (targetVersion === 33) {
		queries.push(...dropNotesFtsTriggers(false));

		queries.push(dropIndexQuery('notes_normalized_id'));
		queries.push(dropTableQuery('notes_normalized'));
		queries.push(dropTableQuery('notes_fts'));

		queries.push(...createNotesNormalizedQueries(true));

		const notIndexed = ftsColumnsAtVersion33.filter(c => !['title', 'body'].includes(c));
		queries.push(compileRawQuery(createFtsTableQuery('notes_fts', 'notes_normalized', notIndexed, ftsColumnsAtVersion33)));
		queries.push(...notesFtsTriggers('notes_normalized', ftsColumnsAtVersion33));
		queries.push(addMigrationFile(33));
	}

	if (targetVersion === 34) {
		queries.push(compileRawQuery(createSearchAuxQuery()));
		queries.push(compileRawQuery(createSpellfixQuery()));
	}

	if (targetVersion === 35) {
		queries.push(addColumnQuery('notes_normalized', 'todo_due', zero));
		queries.push(createIndexQuery('notes_normalized_todo_due', 'notes_normalized', ['todo_due']));
		queries.push(addMigrationFile(35));
	}

	if (targetVersion === 36) {
		queries.push(addColumnQuery('folders', 'share_id', emptyText));
		queries.push(addColumnQuery('notes', 'share_id', emptyText));
		queries.push(addColumnQuery('resources', 'share_id', emptyText));
	}

	if (targetVersion === 38) {
		queries.push(dropViewQuery('tags_with_note_count'));
		queries.push(createTagsWithNoteCountViewQuery({ withTodoCount: true }));
	}

	if (targetVersion === 39) {
		queries.push(addColumnQuery('notes', 'conflict_original_id', emptyText));
	}

	if (targetVersion === 40) {
		queries.push(addColumnQuery('folders', 'master_key_id', emptyText));
		queries.push(addColumnQuery('notes', 'master_key_id', emptyText));
		queries.push(addColumnQuery('resources', 'master_key_id', emptyText));
	}

	if (targetVersion === 41) {
		queries.push(addColumnQuery('folders', 'icon', emptyText));
	}

	return queries;
};
