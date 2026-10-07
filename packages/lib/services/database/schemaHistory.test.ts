import { readFile, writeFile } from 'fs-extra';
import JoplinDatabase from '../../JoplinDatabase';
import { DatabaseDriverNode } from '../../database-driver-node';
import { StringOrSqlQuery } from './types';
import { setupDatabaseAndSynchronizer, switchClient, tempFilePath } from '../../testing/test-utils';

type Signatures = Record<string, string>;
type History = Record<string, Record<string, string | null>>;

// Objects that depend on how SQLite was compiled, or that SQLite creates by itself
const ignoredObjects = /^(sqlite_|(notes|items)_fts_(content|segments|segdir|docsize|stat)$|notes_spellfix|search_aux)/;

// Quotes and the optional "AS" keyword are not significant to SQLite
const normalizeSql = (sql: string) => sql.replace(/[`"]/g, '').replace(/\bas\b/gi, ' ').replace(/\s+/g, ' ').replace(/ ?([(),=]) ?/g, '$1').toLowerCase().trim();

// Records the structure of the database after each upgrade step, so that the
// result of the upgrade can be compared with a version of Joplin that creates
// the schema in a different way.
class RecordingDatabase extends JoplinDatabase {

	public history: History = {};
	private previousVersion_ = 0;
	private previousSignatures_: Signatures = {};

	public async transactionExecBatch(queries: StringOrSqlQuery[]) {
		await super.transactionExecBatch(queries);

		let versionRow: { version: number } | null = null;
		try {
			versionRow = await this.selectOne('SELECT version FROM version') as { version: number };
		} catch (error) {
			// The table does not exist yet
		}
		if (!versionRow || versionRow.version === this.previousVersion_) return;

		this.previousVersion_ = versionRow.version;
		const signatures = await this.signatures();
		const changes: Record<string, string | null> = {};
		for (const name of Object.keys(signatures)) {
			if (signatures[name] !== this.previousSignatures_[name]) changes[name] = signatures[name];
		}
		for (const name of Object.keys(this.previousSignatures_)) {
			if (!(name in signatures)) changes[name] = null;
		}
		this.history[`${versionRow.version}`] = changes;
		this.previousSignatures_ = signatures;
	}

	private async signatures() {
		const objects = await this.selectAll<{ type: string; name: string; tbl_name: string; sql: string }>('SELECT type, name, tbl_name, sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY name');
		const output: Signatures = {};
		for (const object of objects) {
			if (ignoredObjects.test(object.name) || ignoredObjects.test(object.tbl_name)) continue;

			let columns: string[] = [];
			if (object.type === 'table' || object.type === 'view') {
				const info = await this.selectAll<{ name: string; type: string; notnull: number; dflt_value: string; pk: number }>(`PRAGMA table_info("${object.name}")`);
				columns = info.map(c => `${c.name}|${c.type.toLowerCase()}|${c.notnull}|${c.dflt_value}|${c.pk}`);
			}

			output[object.name] = JSON.stringify({ type: object.type, table: object.tbl_name, sql: normalizeSql(object.sql), columns });
		}
		return output;
	}

	public async finalState() {
		const fields = await this.selectAll<{ table_name: string; field_name: string; field_type: number; field_default: string }>('SELECT table_name, field_name, field_type, field_default FROM table_fields ORDER BY table_name, field_name');
		return fields.map(f => `${f.table_name}|${f.field_name}|${f.field_type}|${f.field_default}`);
	}

}

// "DEFAULT x NOT NULL" and "NOT NULL DEFAULT x" are the same column for SQLite, but Kysely writes the former
const canonical = (history: unknown) => JSON.parse(JSON.stringify(history).replace(/ default( -?\w+)? not null/g, ' not null default$1'));

const historyPath = `${__dirname}/schemaHistory.json`;

describe('services/database/schemaHistory', () => {

	beforeEach(async () => {
		await setupDatabaseAndSynchronizer(1);
		await switchClient(1);
	});

	test('should create the same schema, at every version, as the recorded history', async () => {
		const db = new RecordingDatabase(new DatabaseDriverNode());
		await db.open({ name: tempFilePath('sqlite') });

		const result = { history: db.history, tableFields: await db.finalState(), version: db.version() };
		await db.close();

		// Run with UPDATE_SCHEMA_HISTORY=1 after intentionally changing the schema
		if (process.env.UPDATE_SCHEMA_HISTORY) {
			await writeFile(historyPath, JSON.stringify(result, null, '\t'));
		} else {
			expect(canonical(result)).toEqual(canonical(JSON.parse(await readFile(historyPath, 'utf8'))));
		}
	}, 60000);

});
