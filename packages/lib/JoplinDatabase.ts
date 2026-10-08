import Resource from './models/Resource';
import shim from './shim';
import Database, { Row } from './database';
import { SqlQuery } from './services/database/types';
import addMigrationFile from './services/database/addMigrationFile';
import migrations from './services/database/migrations';
import { kysely, compile, insertRow } from './services/database/kysely';
import { DB } from './services/database/kysely/tables';
import {
	addColumnQuery, createFtsTableQuery, createFtsTriggerQueries, createIndexQueries, createIndexQuery, createSearchAuxTableQuery,
	createSpellfixTableQuery, createTableQuery, dropIndexQuery, dropTableQuery, dropTriggerQuery, dropViewQuery, nullable, primaryKey,
	required, tableInfoQuery, tagsWithNoteCountViewQuery,
} from './services/database/kysely/rawFragments/schema';

const { sprintf } = require('sprintf-js');

const structureQueries = () => {
	return [
		createTableQuery('folders', {
			id: primaryKey('TEXT'),
			title: required('TEXT', ''),
			created_time: required('INT'),
			updated_time: required('INT'),
		}),
		...createIndexQueries('folders', ['title', 'updated_time']),

		createTableQuery('notes', {
			id: primaryKey('TEXT'),
			parent_id: required('TEXT', ''),
			title: required('TEXT', ''),
			body: required('TEXT', ''),
			created_time: required('INT'),
			updated_time: required('INT'),
			is_conflict: required('INT', 0),
			latitude: required('NUMERIC', 0),
			longitude: required('NUMERIC', 0),
			altitude: required('NUMERIC', 0),
			author: required('TEXT', ''),
			source_url: required('TEXT', ''),
			is_todo: required('INT', 0),
			todo_due: required('INT', 0),
			todo_completed: required('INT', 0),
			source: required('TEXT', ''),
			source_application: required('TEXT', ''),
			application_data: required('TEXT', ''),
			order: required('INT', 0),
		}),
		...createIndexQueries('notes', ['title', 'updated_time', 'is_conflict', 'is_todo', 'order']),

		createTableQuery('tags', {
			id: primaryKey('TEXT'),
			title: required('TEXT', ''),
			created_time: required('INT'),
			updated_time: required('INT'),
		}),
		...createIndexQueries('tags', ['title', 'updated_time']),

		createTableQuery('note_tags', {
			id: primaryKey('TEXT'),
			note_id: required('TEXT'),
			tag_id: required('TEXT'),
			created_time: required('INT'),
			updated_time: required('INT'),
		}),
		...createIndexQueries('note_tags', ['note_id', 'tag_id', 'updated_time']),

		createTableQuery('resources', {
			id: primaryKey('TEXT'),
			title: required('TEXT', ''),
			mime: required('TEXT'),
			filename: required('TEXT', ''),
			created_time: required('INT'),
			updated_time: required('INT'),
		}),
		...createIndexQueries('resources', ['title', 'updated_time']),

		createTableQuery('settings', {
			key: primaryKey('TEXT'),
			value: nullable('TEXT'),
			type: required('INT'),
		}),

		createTableQuery('table_fields', {
			id: primaryKey('INTEGER'),
			table_name: required('TEXT'),
			field_name: required('TEXT'),
			field_type: required('INT'),
			field_default: nullable('TEXT'),
		}),

		createTableQuery('sync_items', {
			id: primaryKey('INTEGER'),
			sync_target: required('INT'),
			sync_time: required('INT', 0),
			item_type: required('INT'),
			item_id: required('TEXT'),
		}),
		...createIndexQueries('sync_items', ['sync_time', 'sync_target', 'item_type', 'item_id']),

		createTableQuery('deleted_items', {
			id: primaryKey('INTEGER'),
			item_type: required('INT'),
			item_id: required('TEXT'),
			deleted_time: required('INT'),
		}),

		createTableQuery('version', {
			version: required('INT'),
		}),

		insertRow('version', { version: 1 }),
	];
};

const baseItemTableNames = ['notes', 'folders', 'tags', 'note_tags', 'resources'];

const notesFtsColumns = ['id', 'title', 'body', 'user_created_time', 'user_updated_time', 'is_todo', 'todo_completed', 'parent_id', 'latitude', 'longitude', 'altitude', 'source_url'];

export interface TableField {
	name: string;
	type: number;
	default?: string | number | boolean | null;
	description?: string;
}

export default class JoplinDatabase extends Database {

	public static TYPE_INT = 1;
	public static TYPE_TEXT = 2;
	public static TYPE_NUMERIC = 3;

	private initialized_ = false;
	private tableFields_: Record<string, TableField[]> = null;
	private version_: number = null;
	private tableFieldNames_: Record<string, string[]> = {};
	private tableDescriptions_: Record<string, Record<string, string>>;
	private sqliteVecAvailable_ = false;

	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Base Database class uses `any` for driver — different drivers (sqlite, better-sqlite3, web) have different shapes
	public constructor(driver: any) {
		super(driver);
	}

	public initialized() {
		return this.initialized_;
	}

	// Returns true if the sqlite-vec extension loaded successfully when the
	// database was opened. False on platforms where the prebuilt is missing or
	// extension loading is otherwise blocked. Callers that need vector search
	// (the AI embeddings index) should gate on this and degrade gracefully
	// rather than throwing.
	public sqliteVecAvailable() {
		return this.sqliteVecAvailable_;
	}

	public async open(options: Record<string, unknown>) {
		await super.open(options);
		await this.tryLoadSqliteVec();
		return this.initialize();
	}

	private async tryLoadSqliteVec() {
		const sqliteVec = shim.sqliteVec();
		if (!sqliteVec) {
			this.sqliteVecAvailable_ = false;
			this.logger().info('sqlite-vec not provided by the host app; vector search disabled');
			return;
		}
		try {
			await this.loadExtension(sqliteVec.getLoadablePath());
			this.sqliteVecAvailable_ = true;
			this.logger().info('sqlite-vec extension loaded');
		} catch (error) {
			this.sqliteVecAvailable_ = false;
			this.logger().warn('sqlite-vec extension failed to load; vector search disabled:', error);
		}
	}

	public tableFieldNames(tableName: string) {
		if (this.tableFieldNames_[tableName]) return this.tableFieldNames_[tableName].slice();

		const tf = this.tableFields(tableName);
		const output = [];
		for (let i = 0; i < tf.length; i++) {
			output.push(tf[i].name);
		}
		this.tableFieldNames_[tableName] = output;

		return output.slice();
	}

	public tableFields(tableName: string, options: { includeDescription?: boolean } = null) {
		if (options === null) options = {};

		if (!this.tableFields_) throw new Error('Fields have not been loaded yet');
		if (!this.tableFields_[tableName]) throw new Error(`Unknown table: ${tableName}`);
		const output = this.tableFields_[tableName].slice();

		if (options.includeDescription) {
			for (let i = 0; i < output.length; i++) {
				output[i].description = this.fieldDescription(tableName, output[i].name);
			}
		}

		return output;
	}

	public async clearForTesting() {
		const tableNames = [
			'notes',
			'folders',
			'resources',
			'tags',
			'note_tags',
			// 'master_keys',
			'item_changes',
			'note_resources',
			// 'settings',
			'deleted_items',
			'sync_items',
			'notes_normalized',
			'revisions',
			'resources_to_download',
			'key_values',
		];

		const queries = [];
		for (const n of tableNames) {
			queries.push(compile(kysely.deleteFrom(n as keyof DB)));
			queries.push(compile(kysely.deleteFrom('sqlite_sequence' as keyof DB).where('name' as never, '=', n as never))); // Reset autoincremented IDs
		}

		queries.push(compile(kysely.deleteFrom('settings').where('key', 'in', [
			'sync.1.context',
			'sync.2.context',
			'sync.3.context',
			'sync.4.context',
			'sync.5.context',
			'sync.6.context',
			'sync.7.context',
			'revisionService.lastProcessedChangeId',
			'resourceService.lastProcessedChangeId',
			'searchEngine.lastProcessedChangeId',
		])));

		await this.transactionExecBatch(queries);
	}

	public createDefaultRow(tableName: string) {
		const row: Record<string, unknown> = {};
		const fields = this.tableFields(tableName);
		for (let i = 0; i < fields.length; i++) {
			const f = fields[i];
			row[f.name] = Database.formatValue(f.type, f.default);
		}
		return row;
	}

	public fieldByName(tableName: string, fieldName: string) {
		const fields = this.tableFields(tableName);
		for (const field of fields) {
			if (field.name === fieldName) return field;
		}
		throw new Error(`No such field: ${tableName}: ${fieldName}`);
	}

	public fieldDefaultValue(tableName: string, fieldName: string) {
		return this.fieldByName(tableName, fieldName).default;
	}

	public fieldDescription(tableName: string, fieldName: string) {
		const sp = sprintf;

		if (!this.tableDescriptions_) {
			this.tableDescriptions_ = {
				notes: {
					parent_id: sp('ID of the notebook that contains this note. Change this ID to move the note to a different notebook.'),
					body: sp('The note body, in Markdown. May also contain HTML.'),
					is_conflict: sp('Tells whether the note is a conflict or not.'),
					is_todo: sp('Tells whether this note is a todo or not.'),
					todo_due: sp('When the todo is due. An alarm will be triggered on that date.'),
					todo_completed: sp('Tells whether todo is completed or not. This is a timestamp in milliseconds.'),
					source_url: sp('The full URL where the note comes from.'),
					is_shared: sp('Whether the note is published.'),
				},
				folders: {},
				resources: {},
				tags: {},
				item_changes: {
					type: 'The type of change - either 1 (created), 2 (updated) or 3 (deleted)',
					created_time: 'When the event was generated',
					item_type: 'The item type (see table above for the list of item types)',
					item_id: 'The item ID',
					before_change_item: 'Unused',
					source: 'Unused',
				},
			};

			const baseItems = ['notes', 'folders', 'tags', 'resources'];

			for (let i = 0; i < baseItems.length; i++) {
				const n = baseItems[i];
				const singular = n.substr(0, n.length - 1);
				this.tableDescriptions_[n].title = sp('The %s title.', singular);
				this.tableDescriptions_[n].created_time = sp('When the %s was created.', singular);
				this.tableDescriptions_[n].updated_time = sp('When the %s was last updated.', singular);
				this.tableDescriptions_[n].user_created_time = sp('When the %s was created. It may differ from created_time as it can be manually set by the user.', singular);
				this.tableDescriptions_[n].user_updated_time = sp('When the %s was last updated. It may differ from updated_time as it can be manually set by the user.', singular);
				this.tableDescriptions_[n].share_id = sp('The ID of the Joplin Server/Cloud share containing the %s. Empty if not shared.', singular);
			}
		}

		const d = this.tableDescriptions_[tableName];
		return d && d[fieldName] ? d[fieldName] : '';
	}

	private async countFields(tableName: string): Promise<number> {
		const query = tableInfoQuery(tableName);
		const pragmas = await this.selectAll(query.sql, query.params);
		if (!pragmas) throw new Error(`No such table: ${tableName}`);
		return pragmas.length;
	}

	public async refreshTableFields(newVersion: number) {
		this.logger().info('Initializing tables...');
		const queries: SqlQuery[] = [];
		queries.push(compile(kysely.deleteFrom('table_fields')));

		const countFieldsNotesFts = await this.countFields('notes_fts');
		const countFieldsItemsFts = await this.countFields('items_fts');
		if (countFieldsNotesFts !== countFieldsItemsFts) {
			throw new Error(`\`notes_fts\` (${countFieldsNotesFts} fields) must have the same number of fields as \`items_fts\` (${countFieldsItemsFts} fields) for the search engine BM25 algorithm to work`);
		}

		interface TableRow {
			name: string;
		}

		const tableRowsQuery = compile(kysely.selectFrom('sqlite_master' as keyof DB).select('name' as never).where('type' as never, '=', 'table' as never));
		const tableRows: TableRow[] = await this.selectAll(tableRowsQuery.sql, tableRowsQuery.params);

		for (let i = 0; i < tableRows.length; i++) {
			let pragmas: Row[] = [];
			const tableName = tableRows[i].name;
			try {
				if (tableName === 'android_metadata') continue;
				if (tableName === 'table_fields') continue;
				if (tableName.startsWith('sqlite_')) continue;
				if (tableName.indexOf('notes_fts') === 0) continue;
				if (tableName.indexOf('items_fts') === 0) continue;
				if (tableName === 'notes_spellfix') continue;
				if (tableName === 'search_aux') continue;
				if (tableName.startsWith('note_embeddings_vec')) continue;

				const pragmasQuery = tableInfoQuery(tableName);
				pragmas = await this.selectAll(pragmasQuery.sql, pragmasQuery.params);

				for (let i = 0; i < pragmas.length; i++) {
					const item = pragmas[i];
					// In SQLite, if the default value is a string it has double quotes around it, so remove them here
					let defaultValue = item.dflt_value;
					if (typeof defaultValue === 'string' && defaultValue.length >= 2 && defaultValue[0] === '"' && defaultValue[defaultValue.length - 1] === '"') {
						defaultValue = defaultValue.substr(1, defaultValue.length - 2);
					}
					queries.push(insertRow('table_fields', {
						table_name: tableName,
						field_name: item.name,
						field_type: Database.enumId('fieldType', item.type),
						field_default: defaultValue,
					}));
				}
			} catch (error) {
				error.message = `On table: ${tableName}: Pragma: ${JSON.stringify(pragmas)}: ${error.message}`;
				throw error;
			}
		}

		queries.push(compile(kysely.updateTable('version').set({ table_fields_version: newVersion })));
		await this.transactionExecBatch(queries);
	}

	public async upgradeDatabase(fromVersion: number, toVersion: number = null) {
		// INSTRUCTIONS TO UPGRADE THE DATABASE:
		//
		// 1. Add the migration to lib/services/database/migrations.
		// 2. Import the migration and add it to the `migrations` array above.

		// IMPORTANT:
		//
		// Whenever adding a new database property, some additional logic might be needed
		// in the synchronizer to handle this property. For example, when adding a property
		// that should have a default value, existing remote items will not have this
		// default value and thus might cause problems. In that case, the default value
		// must be set in the synchronizer too.

		// Note: v16 and v17 don't do anything. They were used to debug an issue.
		const existingDatabaseVersions = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41];

		for (let i = 0; i < migrations.length; i++) existingDatabaseVersions.push(existingDatabaseVersions[existingDatabaseVersions.length - 1] + 1);

		let currentVersionIndex = existingDatabaseVersions.indexOf(fromVersion);

		// currentVersionIndex < 0 if for the case where an old version of Joplin used with a newer
		// version of the database, so that migration is not run in this case.
		if (currentVersionIndex < 0) {
			throw new Error(
				'Unknown profile version. Most likely this is an old version of Joplin, while the profile was created by a newer version. Please upgrade Joplin at https://joplinapp.org and try again.\n'
				+ `Joplin version: ${shim.appVersion()}\n`
				+ `Profile version: ${fromVersion}\n`
				+ `Expected version: ${existingDatabaseVersions[existingDatabaseVersions.length - 1]}`);
		}

		this.logger().info(`Upgrading database from version ${fromVersion}`);

		if (currentVersionIndex === existingDatabaseVersions.length - 1) return fromVersion;

		let latestVersion = fromVersion;

		while (currentVersionIndex < existingDatabaseVersions.length - 1) {
			const targetVersion = existingDatabaseVersions[currentVersionIndex + 1];
			if (toVersion !== null && targetVersion > toVersion) break;
			this.logger().info(`Converting database to version ${targetVersion}`);

			let queries: (SqlQuery|string)[] = [];

			if (targetVersion === 1) {
				queries = structureQueries();
			}

			if (targetVersion === 2) {
				queries.push(dropTableQuery('deleted_items'));
				queries.push(createTableQuery('deleted_items', {
					id: primaryKey('INTEGER'),
					item_type: required('INT'),
					item_id: required('TEXT'),
					deleted_time: required('INT'),
					sync_target: required('INT'),
				}));
				queries.push(createIndexQuery('deleted_items_sync_target', 'deleted_items', ['sync_target']));
			}

			if (targetVersion === 3) {
				queries = this.alterColumnQueries('settings', { key: 'TEXT PRIMARY KEY', value: 'TEXT' });
			}

			if (targetVersion === 4) {
				queries.push(compile(kysely.insertInto('settings').values(eb => ({
					key: 'sync.3.context',
					value: eb.selectFrom('settings').select('value').where('key', '=', 'sync.context'),
				}))));
				queries.push(compile(kysely.deleteFrom('settings').where('key', '=', 'sync.context')));
			}

			if (targetVersion === 5) {
				for (const n of ['notes', 'folders', 'tags', 'note_tags', 'resources'] as const) {
					queries.push(addColumnQuery(n, 'user_created_time', required('INT', 0)));
					queries.push(addColumnQuery(n, 'user_updated_time', required('INT', 0)));
					queries.push(compile(kysely.updateTable(n as 'notes').set(eb => ({ user_created_time: eb.ref('created_time') }))));
					queries.push(compile(kysely.updateTable(n as 'notes').set(eb => ({ user_updated_time: eb.ref('updated_time') }))));
					queries.push(...createIndexQueries(n, ['user_updated_time']));
				}
			}

			if (targetVersion === 6) {
				queries.push(createTableQuery('alarms', {
					id: primaryKey('INTEGER', true),
					note_id: required('TEXT'),
					trigger_time: required('INT'),
				}));
				queries.push(createIndexQuery('alarm_note_id', 'alarms', ['note_id']));
			}

			if (targetVersion === 7) {
				queries.push(addColumnQuery('resources', 'file_extension', required('TEXT', '')));
			}

			if (targetVersion === 8) {
				queries.push(addColumnQuery('sync_items', 'sync_disabled', required('INT', '0')));
				queries.push(addColumnQuery('sync_items', 'sync_disabled_reason', required('TEXT', '')));
			}

			if (targetVersion === 9) {
				queries.push(createTableQuery('master_keys', {
					id: primaryKey('TEXT'),
					created_time: required('INT'),
					updated_time: required('INT'),
					source_application: required('TEXT'),
					encryption_method: required('INT'),
					checksum: required('TEXT'),
					content: required('TEXT'),
				}));
				for (const n of baseItemTableNames) {
					queries.push(addColumnQuery(n, 'encryption_cipher_text', required('TEXT', '')));
					queries.push(addColumnQuery(n, 'encryption_applied', required('INT', 0)));
					queries.push(...createIndexQueries(n, ['encryption_applied']));
				}

				queries.push(addColumnQuery('sync_items', 'force_sync', required('INT', 0)));
				queries.push(addColumnQuery('resources', 'encryption_blob_encrypted', required('INT', 0)));
			}

			const upgradeVersion10 = () => {
				queries.push(createTableQuery('item_changes', {
					id: primaryKey('INTEGER', true),
					item_type: required('INT'),
					item_id: required('TEXT'),
					type: required('INT'),
					created_time: required('INT'),
				}));
				queries.push(...createIndexQueries('item_changes', ['item_id', 'created_time', 'item_type']));

				queries.push(createTableQuery('note_resources', {
					id: primaryKey('INTEGER'),
					note_id: required('TEXT'),
					resource_id: required('TEXT'),
					is_associated: required('INT'),
					last_seen_time: required('INT'),
				}));
				queries.push(...createIndexQueries('note_resources', ['note_id', 'resource_id']));

				queries.push(compile(
					kysely.insertInto('item_changes')
						.columns(['item_type', 'item_id', 'type', 'created_time'])
						.expression(eb => eb.selectFrom('notes').select([eb.lit(1).as('item_type'), 'id as item_id', eb.lit(1).as('type'), eb.val(Date.now()).as('created_time')])),
				));
			};

			if (targetVersion === 10) {
				upgradeVersion10();
			}

			if (targetVersion === 11) {
				// This trick was needed because Electron Builder incorrectly released a dev branch containing v10 as it was
				// still being developed, and the db schema was not final at that time. So this v11 was created to
				// make sure any invalid db schema that was accidentally created was deleted and recreated.
				queries.push(dropTableQuery('item_changes'));
				queries.push(dropTableQuery('note_resources'));
				upgradeVersion10();
			}

			if (targetVersion === 12) {
				queries.push(addColumnQuery('folders', 'parent_id', required('TEXT', '')));
			}

			if (targetVersion === 13) {
				queries.push(addColumnQuery('resources', 'fetch_status', required('INT', '2')));
				queries.push(addColumnQuery('resources', 'fetch_error', required('TEXT', '')));
				queries.push(compile(kysely.updateTable('resources').set({ fetch_status: Resource.FETCH_STATUS_DONE } as never)));
			}

			if (targetVersion === 14) {
				queries.push(createTableQuery('resource_local_states', {
					id: primaryKey('INTEGER'),
					resource_id: required('TEXT'),
					fetch_status: required('INT', '2'),
					fetch_error: required('TEXT', ''),
				}));

				queries.push(compile(
					kysely.insertInto('resource_local_states')
						.expression(eb => eb.selectFrom('resources').select([eb.lit(null).as('id'), 'id as resource_id', 'fetch_status', 'fetch_error'])),
				));

				queries.push(createIndexQuery('resource_local_states_resource_id', 'resource_local_states', ['resource_id']));
				queries.push(createIndexQuery('resource_local_states_resource_fetch_status', 'resource_local_states', ['fetch_status']));

				queries = queries.concat(
					this.alterColumnQueries('resources', {
						id: 'TEXT PRIMARY KEY',
						title: 'TEXT NOT NULL DEFAULT ""',
						mime: 'TEXT NOT NULL',
						filename: 'TEXT NOT NULL DEFAULT ""',
						created_time: 'INT NOT NULL',
						updated_time: 'INT NOT NULL',
						user_created_time: 'INT NOT NULL DEFAULT 0',
						user_updated_time: 'INT NOT NULL DEFAULT 0',
						file_extension: 'TEXT NOT NULL DEFAULT ""',
						encryption_cipher_text: 'TEXT NOT NULL DEFAULT ""',
						encryption_applied: 'INT NOT NULL DEFAULT 0',
						encryption_blob_encrypted: 'INT NOT NULL DEFAULT 0',
					}),
				);
			}

			if (targetVersion === 15) {
				queries.push(createFtsTableQuery('notes_fts', 'notes', ['id'], ['id', 'title', 'body']));
				queries.push(compile(
					kysely.insertInto('notes_fts' as keyof DB)
						.columns(['docid', 'id', 'title', 'body'] as never)
						.expression(eb => eb.selectFrom('notes').select(['rowid', 'id', 'title', 'body'] as never).where('is_conflict', '=', 0).where('encryption_applied', '=', 0)),
				));

				queries.push(...createFtsTriggerQueries({
					prefix: 'notes',
					ftsTable: 'notes_fts',
					contentTable: 'notes',
					columns: ['id', 'title', 'body'],
					condition: 'is_conflict = 0 AND encryption_applied = 0',
				}));
			}

			if (targetVersion === 18) {
				queries.push(createTableQuery('notes_normalized', {
					id: required('TEXT'),
					title: required('TEXT', ''),
					body: required('TEXT', ''),
				}));

				queries.push(...createIndexQueries('notes_normalized', ['id']));

				queries.push(dropTriggerQuery('notes_fts_before_update', { ifExists: true }));
				queries.push(dropTriggerQuery('notes_fts_before_delete', { ifExists: true }));
				queries.push(dropTriggerQuery('notes_after_update', { ifExists: true }));
				queries.push(dropTriggerQuery('notes_after_insert', { ifExists: true }));
				queries.push(dropTableQuery('notes_fts', { ifExists: true }));

				queries.push(createFtsTableQuery('notes_fts', 'notes_normalized', ['id'], ['id', 'title', 'body']));

				queries.push(...createFtsTriggerQueries({
					prefix: 'notes',
					ftsTable: 'notes_fts',
					contentTable: 'notes_normalized',
					columns: ['id', 'title', 'body'],
				}));
			}

			if (targetVersion === 19) {
				queries.push(createTableQuery('revisions', {
					id: primaryKey('TEXT'),
					parent_id: required('TEXT', ''),
					item_type: required('INT'),
					item_id: required('TEXT'),
					item_updated_time: required('INT'),
					title_diff: required('TEXT', ''),
					body_diff: required('TEXT', ''),
					metadata_diff: required('TEXT', ''),
					encryption_cipher_text: required('TEXT', ''),
					encryption_applied: required('INT', 0),
					updated_time: required('INT'),
					created_time: required('INT'),
				}));

				queries.push(...createIndexQueries('revisions', ['parent_id', 'item_type', 'item_id', 'item_updated_time', 'updated_time']));

				queries.push(addColumnQuery('item_changes', 'source', required('INT', 1)));
				queries.push(addColumnQuery('item_changes', 'before_change_item', required('TEXT', '')));
			}

			if (targetVersion === 20) {
				queries.push(createTableQuery('migrations', {
					id: primaryKey('INTEGER'),
					number: required('INTEGER'),
					updated_time: required('INT'),
					created_time: required('INT'),
				}));

				queries.push(addColumnQuery('resources', 'size', required('INT', -1)));
				queries.push(addMigrationFile(20));
			}

			if (targetVersion === 21) {
				queries.push(addColumnQuery('sync_items', 'item_location', required('INT', 1)));
			}

			if (targetVersion === 22) {
				queries.push(createTableQuery('resources_to_download', {
					id: primaryKey('INTEGER'),
					resource_id: required('TEXT'),
					updated_time: required('INT'),
					created_time: required('INT'),
				}));

				queries.push(...createIndexQueries('resources_to_download', ['resource_id', 'updated_time']));
			}

			if (targetVersion === 23) {
				queries.push(createTableQuery('key_values', {
					id: primaryKey('INTEGER'),
					key: required('TEXT'),
					value: required('TEXT'),
					type: required('INT'),
					updated_time: required('INT'),
				}));

				queries.push(createIndexQuery('key_values_key', 'key_values', ['key'], { unique: true }));
			}

			if (targetVersion === 24) {
				queries.push(addColumnQuery('notes', 'markup_language', required('INT', 1))); // 1: Markdown, 2: HTML
			}

			if (targetVersion === 25) {
				queries.push(tagsWithNoteCountViewQuery({}));
			}

			if (targetVersion === 26) {
				for (const n of baseItemTableNames) {
					queries.push(addColumnQuery(n, 'is_shared', required('INT', 0)));
				}
			}

			if (targetVersion === 27) {
				queries.push(addMigrationFile(27));
			}

			if (targetVersion === 28) {
				queries.push(createIndexQuery('resources_size', 'resources', ['size']));
			}

			if (targetVersion === 29) {
				queries.push(addColumnQuery('version', 'table_fields_version', required('INT', 0)));
			}

			if (targetVersion === 30) {
				// Change the type of the "order" field from INT to NUMERIC
				// Making it a float provides a much bigger range when inserting notes.
				// For example, with an INT, inserting a note C between note A with order 1000 and
				// note B with order 1001 wouldn't be possible without changing the order
				// value of note A or B. But with a float, we can set the order of note C to 1000.5
				queries = queries.concat(
					this.alterColumnQueries('notes', {
						id: 'TEXT PRIMARY KEY',
						parent_id: 'TEXT NOT NULL DEFAULT ""',
						title: 'TEXT NOT NULL DEFAULT ""',
						body: 'TEXT NOT NULL DEFAULT ""',
						created_time: 'INT NOT NULL',
						updated_time: 'INT NOT NULL',
						is_conflict: 'INT NOT NULL DEFAULT 0',
						latitude: 'NUMERIC NOT NULL DEFAULT 0',
						longitude: 'NUMERIC NOT NULL DEFAULT 0',
						altitude: 'NUMERIC NOT NULL DEFAULT 0',
						author: 'TEXT NOT NULL DEFAULT ""',
						source_url: 'TEXT NOT NULL DEFAULT ""',
						is_todo: 'INT NOT NULL DEFAULT 0',
						todo_due: 'INT NOT NULL DEFAULT 0',
						todo_completed: 'INT NOT NULL DEFAULT 0',
						source: 'TEXT NOT NULL DEFAULT ""',
						source_application: 'TEXT NOT NULL DEFAULT ""',
						application_data: 'TEXT NOT NULL DEFAULT ""',
						order: 'NUMERIC NOT NULL DEFAULT 0', // that's the change!
						user_created_time: 'INT NOT NULL DEFAULT 0',
						user_updated_time: 'INT NOT NULL DEFAULT 0',
						encryption_cipher_text: 'TEXT NOT NULL DEFAULT ""',
						encryption_applied: 'INT NOT NULL DEFAULT 0',
						markup_language: 'INT NOT NULL DEFAULT 1',
						is_shared: 'INT NOT NULL DEFAULT 0',
					}),
				);
			}

			if (targetVersion === 31) {
				// This empty version is due to the revert of the hierarchical tag feature
				// We need to keep the version for the users who have upgraded using
				// the pre-release
				queries.push(addColumnQuery('tags', 'parent_id', required('TEXT', '')));
				// Drop the tag note count view, instead compute note count on the fly
				// queries.push('DROP VIEW tags_with_note_count');
				// queries.push(addMigrationFile(31));
			}

			if (targetVersion === 32) {
				// This is the same as version 25 - this is to complete the
				// revert of the hierarchical tag feature.
				queries.push(tagsWithNoteCountViewQuery({ ifNotExists: true }));
			}

			if (targetVersion === 33) {
				queries.push(dropTriggerQuery('notes_fts_before_update'));
				queries.push(dropTriggerQuery('notes_fts_before_delete'));
				queries.push(dropTriggerQuery('notes_after_update'));
				queries.push(dropTriggerQuery('notes_after_insert'));

				queries.push(dropIndexQuery('notes_normalized_id'));
				queries.push(dropTableQuery('notes_normalized'));
				queries.push(dropTableQuery('notes_fts'));

				queries.push(createTableQuery('notes_normalized', {
					id: required('TEXT'),
					title: required('TEXT', ''),
					body: required('TEXT', ''),
					user_created_time: required('INT', 0),
					user_updated_time: required('INT', 0),
					is_todo: required('INT', 0),
					todo_completed: required('INT', 0),
					parent_id: required('TEXT', ''),
					latitude: required('NUMERIC', 0),
					longitude: required('NUMERIC', 0),
					altitude: required('NUMERIC', 0),
					source_url: required('TEXT', ''),
				}));

				queries.push(...createIndexQueries('notes_normalized', ['id', 'user_created_time', 'user_updated_time', 'is_todo', 'todo_completed', 'parent_id', 'latitude', 'longitude', 'altitude', 'source_url']));

				queries.push(createFtsTableQuery('notes_fts', 'notes_normalized', notesFtsColumns.filter(c => c !== 'title' && c !== 'body'), notesFtsColumns));

				queries.push(...createFtsTriggerQueries({
					prefix: 'notes',
					ftsTable: 'notes_fts',
					contentTable: 'notes_normalized',
					columns: notesFtsColumns,
				}));
				queries.push(addMigrationFile(33));
			}

			if (targetVersion === 34) {
				queries.push(createSearchAuxTableQuery());
				queries.push(createSpellfixTableQuery());
			}

			if (targetVersion === 35) {
				queries.push(addColumnQuery('notes_normalized', 'todo_due', required('INT', 0)));
				queries.push(...createIndexQueries('notes_normalized', ['todo_due']));
				queries.push(addMigrationFile(35));
			}

			if (targetVersion === 36) {
				queries.push(addColumnQuery('folders', 'share_id', required('TEXT', '')));
				queries.push(addColumnQuery('notes', 'share_id', required('TEXT', '')));
				queries.push(addColumnQuery('resources', 'share_id', required('TEXT', '')));
			}

			if (targetVersion === 38) {
				queries.push(dropViewQuery('tags_with_note_count'));
				queries.push(tagsWithNoteCountViewQuery({ todoCompletedCount: true }));
			}

			if (targetVersion === 39) {
				queries.push(addColumnQuery('notes', 'conflict_original_id', required('TEXT', '')));
			}

			if (targetVersion === 40) {
				queries.push(addColumnQuery('folders', 'master_key_id', required('TEXT', '')));
				queries.push(addColumnQuery('notes', 'master_key_id', required('TEXT', '')));
				queries.push(addColumnQuery('resources', 'master_key_id', required('TEXT', '')));
			}

			if (targetVersion === 41) {
				queries.push(addColumnQuery('folders', 'icon', required('TEXT', '')));
			}

			if (targetVersion > 41) {
				const migration = migrations[targetVersion - 42];
				if (!migration) throw new Error(`No such migration: ${targetVersion}`);
				const migrationQueries = migration();
				queries = queries.concat(migrationQueries);
			}

			const updateVersionQuery = compile(kysely.updateTable('version').set({ version: targetVersion }));

			queries.push(updateVersionQuery);

			try {
				await this.transactionExecBatch(queries);
			} catch (error) {
				// In some cases listed below, when the upgrade fail it is acceptable (a fallback will be used)
				// and in those cases, even though it fails, we still want to set the version number so that the
				// migration is not repeated on next upgrade.
				let saveVersionAgain = false;

				if (targetVersion === 15 || targetVersion === 18 || targetVersion === 33) {
					this.logger().warn('Could not upgrade to database v15 or v18 or v33 - FTS feature will not be used', error);
					saveVersionAgain = true;
				} else if (targetVersion === 34) {
					// if (!shim.isTestingEnv()) this.logger().warn('Could not upgrade to database v34 - fuzzy search will not be used', error);
					saveVersionAgain = true;
				} else {
					throw error;
				}

				if (saveVersionAgain) {
					this.logger().info('Migration failed with fallback and will not be repeated - saving version number');
					await this.transactionExecBatch([updateVersionQuery]);
				}
			}

			latestVersion = targetVersion;

			currentVersionIndex++;
		}

		return latestVersion;
	}

	public async ftsEnabled() {
		try {
			const query = compile(kysely.selectFrom('notes_fts' as keyof DB).select(eb => eb.fn.countAll().as('count')));
			await this.selectOne(query.sql, query.params);
		} catch (error) {
			this.logger().warn('FTS check failed', error);
			return false;
		}

		this.logger().info('FTS check succeeded');

		return true;
	}

	public async fuzzySearchEnabled() {
		try {
			const query = compile(kysely.selectFrom('notes_spellfix' as keyof DB).select(eb => eb.fn.countAll().as('count')));
			await this.selectOne(query.sql, query.params);
		} catch (error) {
			this.logger().warn('Fuzzy search check failed', error);
			return false;
		}
		this.logger().info('Fuzzy search check succeeded');
		return true;
	}

	public version() {
		return this.version_;
	}

	public async initialize() {
		this.logger().info('Checking for database schema update...');

		let versionRow = null;
		try {
			// Will throw if the database has not been created yet, but this is handled below
			versionRow = await this.selectOne(compile(kysely.selectFrom('version').selectAll().limit(1)).sql);
		} catch (error) {
			if (error.message && error.message.indexOf('no such table: version') >= 0) {
				// Ignore
			} else {
				this.logger().info(error);
			}
		}

		const version = !versionRow ? 0 : versionRow.version;
		const tableFieldsVersion = !versionRow ? 0 : versionRow.table_fields_version;
		this.version_ = version;
		this.logger().info('Current database version', versionRow);

		const newVersion = await this.upgradeDatabase(version);
		this.version_ = newVersion;

		this.logger().info(`New version: ${newVersion}. Previously recorded version: ${tableFieldsVersion}`);

		if (newVersion !== tableFieldsVersion) await this.refreshTableFields(newVersion);

		this.tableFields_ = {};

		const rows = await this.selectAll(compile(kysely.selectFrom('table_fields').selectAll()).sql);

		for (let i = 0; i < rows.length; i++) {
			const row = rows[i];
			if (!this.tableFields_[row.table_name]) this.tableFields_[row.table_name] = [];
			this.tableFields_[row.table_name].push({
				name: row.field_name,
				type: row.field_type,
				default: Database.formatValue(row.field_type, row.field_default),
			});
		}
	}
}
