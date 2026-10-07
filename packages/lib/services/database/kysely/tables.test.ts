import { setupDatabaseAndSynchronizer, switchClient, db } from '../../../testing/test-utils';
import { DatabaseTables } from './tables';

// Each table lists its columns as `true`. TypeScript rejects a missing or unknown column, and the
// test below compares the same list with the columns of the real, fully upgraded database.
const typedColumns: { [T in keyof DatabaseTables]: Record<keyof DatabaseTables[T], true> } = {
	alarms: {
		id: true, note_id: true, trigger_time: true,
	},
	conflict_note_states: {
		id: true, note_id: true, base_body: true, base_title: true, remote_body: true, remote_title: true, remote_updated_time: true,
	},
	deleted_items: {
		id: true, item_type: true, item_id: true, deleted_time: true, sync_target: true,
	},
	folders: {
		id: true, title: true, created_time: true, updated_time: true, user_created_time: true, user_updated_time: true, encryption_cipher_text: true, encryption_applied: true, parent_id: true, is_shared: true, share_id: true, master_key_id: true, icon: true, user_data: true, deleted_time: true,
	},
	item_changes: {
		id: true, item_type: true, item_id: true, type: true, created_time: true, source: true, before_change_item: true,
	},
	items_normalized: {
		id: true, title: true, body: true, item_id: true, item_type: true, user_updated_time: true, reserved1: true, reserved2: true, reserved3: true, reserved4: true, reserved5: true, reserved6: true,
	},
	key_values: {
		id: true, key: true, value: true, type: true, updated_time: true,
	},
	master_keys: {
		id: true, created_time: true, updated_time: true, source_application: true, encryption_method: true, checksum: true, content: true,
	},
	migrations: {
		id: true, number: true, updated_time: true, created_time: true,
	},
	note_embeddings_meta: {
		id: true, note_id: true, chunk_index: true, model_id: true, chunk_text: true, created_time: true,
	},
	note_resources: {
		id: true, note_id: true, resource_id: true, is_associated: true, last_seen_time: true,
	},
	note_tags: {
		id: true, note_id: true, tag_id: true, created_time: true, updated_time: true, user_created_time: true, user_updated_time: true, encryption_cipher_text: true, encryption_applied: true, is_shared: true,
	},
	notes: {
		id: true, parent_id: true, title: true, body: true, created_time: true, updated_time: true, is_conflict: true, latitude: true, longitude: true, altitude: true, author: true, source_url: true, is_todo: true, todo_due: true, todo_completed: true, source: true, source_application: true, application_data: true, 'order': true, user_created_time: true, user_updated_time: true, encryption_cipher_text: true, encryption_applied: true, markup_language: true, is_shared: true, share_id: true, conflict_original_id: true, master_key_id: true, user_data: true, deleted_time: true, is_locked: true, extracted_resource_ids: true,
	},
	notes_normalized: {
		id: true, title: true, body: true, user_created_time: true, user_updated_time: true, is_todo: true, todo_completed: true, parent_id: true, latitude: true, longitude: true, altitude: true, source_url: true, todo_due: true,
	},
	resource_local_states: {
		id: true, resource_id: true, fetch_status: true, fetch_error: true,
	},
	resources: {
		id: true, title: true, mime: true, filename: true, created_time: true, updated_time: true, user_created_time: true, user_updated_time: true, file_extension: true, encryption_cipher_text: true, encryption_applied: true, encryption_blob_encrypted: true, size: true, is_shared: true, share_id: true, master_key_id: true, user_data: true, blob_updated_time: true, ocr_text: true, ocr_details: true, ocr_status: true, ocr_error: true, ocr_driver_id: true, is_locked: true,
	},
	resources_to_download: {
		id: true, resource_id: true, updated_time: true, created_time: true,
	},
	revisions: {
		id: true, parent_id: true, item_type: true, item_id: true, item_updated_time: true, title_diff: true, body_diff: true, metadata_diff: true, encryption_cipher_text: true, encryption_applied: true, updated_time: true, created_time: true, is_locked: true,
	},
	settings: {
		key: true, value: true,
	},
	sync_items: {
		id: true, sync_target: true, sync_time: true, item_type: true, item_id: true, sync_disabled: true, sync_disabled_reason: true, force_sync: true, item_location: true, sync_warning_ignored: true, remote_item_updated_time: true, base_body: true, base_title: true, base_conflict_note_id: true,
	},
	table_fields: {
		id: true, table_name: true, field_name: true, field_type: true, field_default: true,
	},
	tags: {
		id: true, title: true, created_time: true, updated_time: true, user_created_time: true, user_updated_time: true, encryption_cipher_text: true, encryption_applied: true, is_shared: true, parent_id: true, user_data: true,
	},
	tags_with_note_count: {
		id: true, title: true, created_time: true, updated_time: true, note_count: true, todo_completed_count: true,
	},
	version: {
		version: true, table_fields_version: true,
	},
};

describe('services/database/kysely/tables', () => {

	beforeEach(async () => {
		await setupDatabaseAndSynchronizer(1);
		await switchClient(1);
	});

	test('should describe the exact columns of every table and view', async () => {
		const objects = await db().selectAll<{ name: string }>("SELECT name FROM sqlite_master WHERE type IN ('table', 'view')");
		const typedNames = Object.keys(typedColumns);

		for (const name of typedNames) {
			const columns = await db().selectAll<{ name: string }>(`PRAGMA table_info("${name}")`);
			expect(columns.map(c => c.name).sort()).toEqual(Object.keys(typedColumns[name as keyof DatabaseTables]).sort());
		}

		// Tables that are deliberately not typed: full-text search and extension tables
		const untyped = objects.map(o => o.name).filter(n => !typedNames.includes(n));
		const unexpected = untyped.filter(n => !/^(sqlite_sequence|notes_fts.*|items_fts.*|search_aux|notes_spellfix.*|note_embeddings_vec.*)$/.test(n));
		expect(unexpected).toEqual([]);
	});

});
