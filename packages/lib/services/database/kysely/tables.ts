import { Generated } from 'kysely';

// Column types of every table, as created by the upgrade steps in JoplinDatabase.ts and
// services/database/migrations. `Generated` marks columns with a default value (or an
// auto-increment id). The project does not use strictNullChecks, so Kysely cannot enforce that
// they are optional on insert; callers building inserts cast the values. tables.test.ts checks that this list matches
// the real database, so it cannot silently drift.

export interface AlarmsTable {
	id: Generated<number>;
	note_id: string;
	trigger_time: number;
}

export interface ConflictNoteStatesTable {
	id: Generated<number>;
	note_id: string;
	base_body: Generated<string>;
	base_title: Generated<string>;
	remote_body: Generated<string>;
	remote_title: Generated<string>;
	remote_updated_time: Generated<number>;
}

export interface DeletedItemsTable {
	id: Generated<number>;
	item_type: number;
	item_id: string;
	deleted_time: number;
	sync_target: number;
}

export interface FoldersTable {
	id: string;
	title: Generated<string>;
	created_time: number;
	updated_time: number;
	user_created_time: Generated<number>;
	user_updated_time: Generated<number>;
	encryption_cipher_text: Generated<string>;
	encryption_applied: Generated<number>;
	parent_id: Generated<string>;
	is_shared: Generated<number>;
	share_id: Generated<string>;
	master_key_id: Generated<string>;
	icon: Generated<string>;
	user_data: Generated<string>;
	deleted_time: Generated<number>;
}

export interface ItemChangesTable {
	id: Generated<number>;
	item_type: number;
	item_id: string;
	type: number;
	created_time: number;
	source: Generated<number>;
	before_change_item: Generated<string>;
}

export interface ItemsNormalizedTable {
	id: Generated<number>;
	title: Generated<string>;
	body: Generated<string>;
	item_id: string;
	item_type: number;
	user_updated_time: Generated<number>;
	reserved1: number | null;
	reserved2: number | null;
	reserved3: number | null;
	reserved4: number | null;
	reserved5: number | null;
	reserved6: number | null;
}

export interface KeyValuesTable {
	id: Generated<number>;
	key: string;
	value: string;
	type: number;
	updated_time: number;
}

export interface MasterKeysTable {
	id: string;
	created_time: number;
	updated_time: number;
	source_application: string;
	encryption_method: number;
	checksum: string;
	content: string;
}

export interface MigrationsTable {
	id: Generated<number>;
	number: number;
	updated_time: number;
	created_time: number;
}

export interface NoteEmbeddingsMetaTable {
	id: Generated<number>;
	note_id: string;
	chunk_index: number;
	model_id: string;
	chunk_text: string;
	created_time: Generated<number>;
}

export interface NoteResourcesTable {
	id: Generated<number>;
	note_id: string;
	resource_id: string;
	is_associated: number;
	last_seen_time: number;
}

export interface NoteTagsTable {
	id: string;
	note_id: string;
	tag_id: string;
	created_time: number;
	updated_time: number;
	user_created_time: Generated<number>;
	user_updated_time: Generated<number>;
	encryption_cipher_text: Generated<string>;
	encryption_applied: Generated<number>;
	is_shared: Generated<number>;
}

export interface NotesTable {
	id: string;
	parent_id: Generated<string>;
	title: Generated<string>;
	body: Generated<string>;
	created_time: number;
	updated_time: number;
	is_conflict: Generated<number>;
	latitude: Generated<number>;
	longitude: Generated<number>;
	altitude: Generated<number>;
	author: Generated<string>;
	source_url: Generated<string>;
	is_todo: Generated<number>;
	todo_due: Generated<number>;
	todo_completed: Generated<number>;
	source: Generated<string>;
	source_application: Generated<string>;
	application_data: Generated<string>;
	'order': Generated<number>;
	user_created_time: Generated<number>;
	user_updated_time: Generated<number>;
	encryption_cipher_text: Generated<string>;
	encryption_applied: Generated<number>;
	markup_language: Generated<number>;
	is_shared: Generated<number>;
	share_id: Generated<string>;
	conflict_original_id: Generated<string>;
	master_key_id: Generated<string>;
	user_data: Generated<string>;
	deleted_time: Generated<number>;
	is_locked: Generated<number>;
	extracted_resource_ids: Generated<string>;
}

export interface NotesNormalizedTable {
	id: string;
	title: Generated<string>;
	body: Generated<string>;
	user_created_time: Generated<number>;
	user_updated_time: Generated<number>;
	is_todo: Generated<number>;
	todo_completed: Generated<number>;
	parent_id: Generated<string>;
	latitude: Generated<number>;
	longitude: Generated<number>;
	altitude: Generated<number>;
	source_url: Generated<string>;
	todo_due: Generated<number>;
}

export interface ResourceLocalStatesTable {
	id: Generated<number>;
	resource_id: string;
	fetch_status: Generated<number>;
	fetch_error: Generated<string>;
}

export interface ResourcesTable {
	id: string;
	title: Generated<string>;
	mime: string;
	filename: Generated<string>;
	created_time: number;
	updated_time: number;
	user_created_time: Generated<number>;
	user_updated_time: Generated<number>;
	file_extension: Generated<string>;
	encryption_cipher_text: Generated<string>;
	encryption_applied: Generated<number>;
	encryption_blob_encrypted: Generated<number>;
	size: Generated<number>;
	is_shared: Generated<number>;
	share_id: Generated<string>;
	master_key_id: Generated<string>;
	user_data: Generated<string>;
	blob_updated_time: Generated<number>;
	ocr_text: Generated<string>;
	ocr_details: Generated<string>;
	ocr_status: Generated<number>;
	ocr_error: Generated<string>;
	ocr_driver_id: Generated<number>;
	is_locked: Generated<number>;
}

export interface ResourcesToDownloadTable {
	id: Generated<number>;
	resource_id: string;
	updated_time: number;
	created_time: number;
}

export interface RevisionsTable {
	id: string;
	parent_id: Generated<string>;
	item_type: number;
	item_id: string;
	item_updated_time: number;
	title_diff: Generated<string>;
	body_diff: Generated<string>;
	metadata_diff: Generated<string>;
	encryption_cipher_text: Generated<string>;
	encryption_applied: Generated<number>;
	updated_time: number;
	created_time: number;
	is_locked: Generated<number>;
}

export interface SettingsTable {
	key: string;
	value: string | null;
}

export interface SyncItemsTable {
	id: Generated<number>;
	sync_target: number;
	sync_time: Generated<number>;
	item_type: number;
	item_id: string;
	sync_disabled: Generated<number>;
	sync_disabled_reason: Generated<string>;
	force_sync: Generated<number>;
	item_location: Generated<number>;
	sync_warning_ignored: Generated<number>;
	remote_item_updated_time: Generated<number>;
	base_body: Generated<string>;
	base_title: Generated<string>;
	base_conflict_note_id: Generated<string>;
}

export interface TableFieldsTable {
	id: Generated<number>;
	table_name: string;
	field_name: string;
	field_type: number;
	field_default: string | null;
}

export interface TagsTable {
	id: string;
	title: Generated<string>;
	created_time: number;
	updated_time: number;
	user_created_time: Generated<number>;
	user_updated_time: Generated<number>;
	encryption_cipher_text: Generated<string>;
	encryption_applied: Generated<number>;
	is_shared: Generated<number>;
	parent_id: Generated<string>;
	user_data: Generated<string>;
}

export interface TagsWithNoteCountTable {
	id: string;
	title: string | null;
	created_time: number | null;
	updated_time: number | null;
	note_count: number;
	todo_completed_count: number;
}

export interface VersionTable {
	version: number;
	table_fields_version: Generated<number>;
}

export interface DatabaseTables {
	alarms: AlarmsTable;
	conflict_note_states: ConflictNoteStatesTable;
	deleted_items: DeletedItemsTable;
	folders: FoldersTable;
	item_changes: ItemChangesTable;
	items_normalized: ItemsNormalizedTable;
	key_values: KeyValuesTable;
	master_keys: MasterKeysTable;
	migrations: MigrationsTable;
	note_embeddings_meta: NoteEmbeddingsMetaTable;
	note_resources: NoteResourcesTable;
	note_tags: NoteTagsTable;
	notes: NotesTable;
	notes_normalized: NotesNormalizedTable;
	resource_local_states: ResourceLocalStatesTable;
	resources: ResourcesTable;
	resources_to_download: ResourcesToDownloadTable;
	revisions: RevisionsTable;
	settings: SettingsTable;
	sync_items: SyncItemsTable;
	table_fields: TableFieldsTable;
	tags: TagsTable;
	tags_with_note_count: TagsWithNoteCountTable;
	version: VersionTable;
}
