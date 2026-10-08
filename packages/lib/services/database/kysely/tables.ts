import { ColumnType } from 'kysely';

// Writes are loosely typed because models save partial entities and the project does not use strictNullChecks.
type Col<T> = ColumnType<T, T | undefined, T | undefined>;

export interface AlarmsTable {
	id?: Col<number>;
	note_id?: Col<string>;
	trigger_time?: Col<number>;
}

export interface ConflictNoteStatesTable {
	id?: Col<number>;
	note_id?: Col<string>;
	base_body?: Col<string>;
	base_title?: Col<string>;
	remote_body?: Col<string>;
	remote_title?: Col<string>;
	remote_updated_time?: Col<number>;
}

export interface DeletedItemsTable {
	id?: Col<number>;
	item_type?: Col<number>;
	item_id?: Col<string>;
	deleted_time?: Col<number>;
	sync_target?: Col<number>;
}

export interface FoldersTable {
	id?: Col<string>;
	title?: Col<string>;
	created_time?: Col<number>;
	updated_time?: Col<number>;
	user_created_time?: Col<number>;
	user_updated_time?: Col<number>;
	encryption_cipher_text?: Col<string>;
	encryption_applied?: Col<number>;
	parent_id?: Col<string>;
	is_shared?: Col<number>;
	share_id?: Col<string>;
	master_key_id?: Col<string>;
	icon?: Col<string>;
	user_data?: Col<string>;
	deleted_time?: Col<number>;
}

export interface ItemChangesTable {
	id?: Col<number>;
	item_type?: Col<number>;
	item_id?: Col<string>;
	type?: Col<number>;
	created_time?: Col<number>;
	source?: Col<number>;
	before_change_item?: Col<string>;
}

export interface ItemsNormalizedTable {
	id?: Col<number>;
	title?: Col<string>;
	body?: Col<string>;
	item_id?: Col<string>;
	item_type?: Col<number>;
	user_updated_time?: Col<number>;
	reserved1?: Col<number>;
	reserved2?: Col<number>;
	reserved3?: Col<number>;
	reserved4?: Col<number>;
	reserved5?: Col<number>;
	reserved6?: Col<number>;
}

export interface KeyValuesTable {
	id?: Col<number>;
	key?: Col<string>;
	value?: Col<string>;
	type?: Col<number>;
	updated_time?: Col<number>;
}

export interface MasterKeysTable {
	id?: Col<string>;
	created_time?: Col<number>;
	updated_time?: Col<number>;
	source_application?: Col<string>;
	encryption_method?: Col<number>;
	checksum?: Col<string>;
	content?: Col<string>;
}

export interface MigrationsTable {
	id?: Col<number>;
	number?: Col<number>;
	updated_time?: Col<number>;
	created_time?: Col<number>;
}

export interface NoteEmbeddingsMetaTable {
	id?: Col<number>;
	note_id?: Col<string>;
	chunk_index?: Col<number>;
	model_id?: Col<string>;
	chunk_text?: Col<string>;
	created_time?: Col<number>;
}

export interface NoteResourcesTable {
	id?: Col<number>;
	note_id?: Col<string>;
	resource_id?: Col<string>;
	is_associated?: Col<number>;
	last_seen_time?: Col<number>;
}

export interface NoteTagsTable {
	id?: Col<string>;
	note_id?: Col<string>;
	tag_id?: Col<string>;
	created_time?: Col<number>;
	updated_time?: Col<number>;
	user_created_time?: Col<number>;
	user_updated_time?: Col<number>;
	encryption_cipher_text?: Col<string>;
	encryption_applied?: Col<number>;
	is_shared?: Col<number>;
}

export interface NotesTable {
	id?: Col<string>;
	parent_id?: Col<string>;
	title?: Col<string>;
	body?: Col<string>;
	created_time?: Col<number>;
	updated_time?: Col<number>;
	is_conflict?: Col<number>;
	latitude?: Col<number>;
	longitude?: Col<number>;
	altitude?: Col<number>;
	author?: Col<string>;
	source_url?: Col<string>;
	is_todo?: Col<number>;
	todo_due?: Col<number>;
	todo_completed?: Col<number>;
	source?: Col<string>;
	source_application?: Col<string>;
	application_data?: Col<string>;
	order?: Col<number>;
	user_created_time?: Col<number>;
	user_updated_time?: Col<number>;
	encryption_cipher_text?: Col<string>;
	encryption_applied?: Col<number>;
	markup_language?: Col<number>;
	is_shared?: Col<number>;
	share_id?: Col<string>;
	conflict_original_id?: Col<string>;
	master_key_id?: Col<string>;
	user_data?: Col<string>;
	deleted_time?: Col<number>;
	is_locked?: Col<number>;
	extracted_resource_ids?: Col<string>;
}

export interface NotesNormalizedTable {
	id?: Col<string>;
	title?: Col<string>;
	body?: Col<string>;
	user_created_time?: Col<number>;
	user_updated_time?: Col<number>;
	is_todo?: Col<number>;
	todo_completed?: Col<number>;
	parent_id?: Col<string>;
	latitude?: Col<number>;
	longitude?: Col<number>;
	altitude?: Col<number>;
	source_url?: Col<string>;
	todo_due?: Col<number>;
}

export interface ResourceLocalStatesTable {
	id?: Col<number>;
	resource_id?: Col<string>;
	fetch_status?: Col<number>;
	fetch_error?: Col<string>;
}

export interface ResourcesTable {
	id?: Col<string>;
	title?: Col<string>;
	mime?: Col<string>;
	filename?: Col<string>;
	created_time?: Col<number>;
	updated_time?: Col<number>;
	user_created_time?: Col<number>;
	user_updated_time?: Col<number>;
	file_extension?: Col<string>;
	encryption_cipher_text?: Col<string>;
	encryption_applied?: Col<number>;
	encryption_blob_encrypted?: Col<number>;
	size?: Col<number>;
	is_shared?: Col<number>;
	share_id?: Col<string>;
	master_key_id?: Col<string>;
	user_data?: Col<string>;
	blob_updated_time?: Col<number>;
	ocr_text?: Col<string>;
	ocr_details?: Col<string>;
	ocr_status?: Col<number>;
	ocr_error?: Col<string>;
	ocr_driver_id?: Col<number>;
	is_locked?: Col<number>;
}

export interface ResourcesToDownloadTable {
	id?: Col<number>;
	resource_id?: Col<string>;
	updated_time?: Col<number>;
	created_time?: Col<number>;
}

export interface RevisionsTable {
	id?: Col<string>;
	parent_id?: Col<string>;
	item_type?: Col<number>;
	item_id?: Col<string>;
	item_updated_time?: Col<number>;
	title_diff?: Col<string>;
	body_diff?: Col<string>;
	metadata_diff?: Col<string>;
	encryption_cipher_text?: Col<string>;
	encryption_applied?: Col<number>;
	updated_time?: Col<number>;
	created_time?: Col<number>;
	is_locked?: Col<number>;
}

export interface SettingsTable {
	key?: Col<string>;
	value?: Col<string>;
}

export interface SyncItemsTable {
	id?: Col<number>;
	sync_target?: Col<number>;
	sync_time?: Col<number>;
	item_type?: Col<number>;
	item_id?: Col<string>;
	sync_disabled?: Col<number>;
	sync_disabled_reason?: Col<string>;
	force_sync?: Col<number>;
	item_location?: Col<number>;
	sync_warning_ignored?: Col<number>;
	remote_item_updated_time?: Col<number>;
	base_body?: Col<string>;
	base_title?: Col<string>;
	base_conflict_note_id?: Col<string>;
}

export interface TableFieldsTable {
	id?: Col<number>;
	table_name?: Col<string>;
	field_name?: Col<string>;
	field_type?: Col<number>;
	field_default?: Col<string>;
}

export interface TagsTable {
	id?: Col<string>;
	title?: Col<string>;
	created_time?: Col<number>;
	updated_time?: Col<number>;
	user_created_time?: Col<number>;
	user_updated_time?: Col<number>;
	encryption_cipher_text?: Col<string>;
	encryption_applied?: Col<number>;
	is_shared?: Col<number>;
	parent_id?: Col<string>;
	user_data?: Col<string>;
}

export interface VersionTable {
	version?: Col<number>;
	table_fields_version?: Col<number>;
}

export interface TagsWithNoteCountTable {
	id?: Col<string>;
	title?: Col<string>;
	created_time?: Col<number>;
	updated_time?: Col<number>;
	note_count?: Col<number>;
	todo_completed_count?: Col<number>;
}

export interface NotesFtsTable {
	id?: Col<string>;
	title?: Col<string>;
	body?: Col<string>;
	user_created_time?: Col<string>;
	user_updated_time?: Col<string>;
	is_todo?: Col<string>;
	todo_completed?: Col<string>;
	parent_id?: Col<string>;
	latitude?: Col<string>;
	longitude?: Col<string>;
	altitude?: Col<string>;
	source_url?: Col<string>;
}

export interface ItemsFtsTable {
	id?: Col<string>;
	title?: Col<string>;
	body?: Col<string>;
	item_id?: Col<string>;
	item_type?: Col<string>;
	user_updated_time?: Col<string>;
	reserved1?: Col<string>;
	reserved2?: Col<string>;
	reserved3?: Col<string>;
	reserved4?: Col<string>;
	reserved5?: Col<string>;
	reserved6?: Col<string>;
}

export interface SearchAuxTable {
	term?: Col<string>;
	col?: Col<string>;
	documents?: Col<number>;
	occurrences?: Col<number>;
}

export interface NotesSpellfixTable {
	word?: Col<string>;
	rank?: Col<number>;
	distance?: Col<number>;
	langid?: Col<number>;
	score?: Col<number>;
	matchlen?: Col<number>;
	source?: Col<string>;
	top?: Col<number>;
	scope?: Col<number>;
}

export interface NoteEmbeddingsVecTable {
	rowid?: Col<number>;
	embedding?: Col<Uint8Array>;
}

// eslint-disable-next-line @typescript-eslint/naming-convention -- Conventional name for a Kysely database interface
export interface DB {
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
	version: VersionTable;
	tags_with_note_count: TagsWithNoteCountTable;
	notes_fts: NotesFtsTable;
	items_fts: ItemsFtsTable;
	search_aux: SearchAuxTable;
	notes_spellfix: NotesSpellfixTable;
	note_embeddings_vec: NoteEmbeddingsVecTable;
}
