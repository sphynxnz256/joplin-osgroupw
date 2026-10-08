import { createHash } from 'crypto';
import { mkdtemp, readFile, remove } from 'fs-extra';
import { tmpdir } from 'os';
import { join } from 'path';
import JoplinDatabase from '../../../JoplinDatabase';
import { DatabaseDriverNode } from '../../../database-driver-node';
import { Row } from '../../../database';
import { kysely, compile } from './index';
import { DB } from './tables';
import { tableInfoQuery } from './rawFragments/schema';

// The golden file was generated from the original hand-written SQL schema. Kysely emits CREATE TABLE
// statements in its own format (lower case, quoted identifiers, constraints in a different order), so
// SQLite stores different text for them. The schema is therefore compared as follows:
// - Tables are compared through PRAGMA table_info, which is exact (names, declared types, NOT NULL,
//   default values and primary keys).
// - Indexes, views, triggers and virtual tables are compared through their stored SQL, normalized by
//   removing case, whitespace, quotes and "AS" keywords.
//
// To create a normalized hash per version, run the original code and compute
// sha1(JSON.stringify({ ver, master: normalizedMaster(master), info })) as done by `snapshotHash` below,
// then store them in the golden file as `normalizedHashes: { '1': '...', ..., '53': '...' }`.

interface Snapshot {
	ver: number;
	master: Row[];
	info: Record<string, Row[]>;
}

interface Golden {
	tableFields: Row[];
	hashes: Record<string, string>;
	normalizedHashes?: Record<string, string>;
	full: Record<string, Snapshot>;
}

const normalizeSql = (sqlText: string | null) => {
	if (!sqlText) return null;
	return sqlText.toLowerCase().replace(/[`"']/g, '').replace(/\bas\b/g, '').replace(/\s+/g, '');
};

const normalizedMaster = (master: Row[]) => {
	return master.map(row => {
		const isPlainTable = row.type === 'table' && !(row.sql ?? '').startsWith('CREATE VIRTUAL');
		return { ...row, sql: isPlainTable ? null : normalizeSql(row.sql) };
	});
};

const snapshotHash = (snapshot: Snapshot) => {
	const content = JSON.stringify({ ver: snapshot.ver, master: normalizedMaster(snapshot.master), info: snapshot.info });
	return createHash('sha1').update(content).digest('hex');
};

const takeSnapshot = async (db: JoplinDatabase, ver: number) => {
	const masterQuery = compile(
		kysely.selectFrom('sqlite_master' as keyof DB)
			.select(['type', 'name', 'tbl_name', 'sql'] as never)
			.orderBy('type' as never)
			.orderBy('name' as never),
	);
	const master = await db.selectAll(masterQuery.sql, masterQuery.params);

	const info: Record<string, Row[]> = {};
	for (const row of master) {
		if (row.type !== 'table' || row.name.startsWith('sqlite_')) continue;
		const query = tableInfoQuery(row.name);
		info[row.name] = await db.selectAll(query.sql, query.params);
	}

	return { ver, master, info };
};

const allVersions = Array.from({ length: 53 }, (_v, index) => index + 1);

describe('services/database/kysely/schema', () => {

	let tempDir_: string;
	let golden_: Golden;
	const databases_: JoplinDatabase[] = [];

	const openDatabase = async () => {
		const db = new JoplinDatabase(new DatabaseDriverNode());
		await db.driver().open({ name: join(tempDir_, `${databases_.length}.sqlite`) });
		databases_.push(db);
		return db;
	};

	const expectedHash = (version: number) => {
		const normalized = golden_.normalizedHashes?.[String(version)];
		if (normalized) return normalized;
		const full = golden_.full[`v${version}`];
		if (full) return snapshotHash(full);
		throw new Error(`No normalized golden hash for version ${version}. See the comment at the top of this file.`);
	};

	beforeAll(async () => {
		golden_ = JSON.parse(await readFile(join(__dirname, '../../../tests/support/schemaGolden/schemaGolden.json'), 'utf8'));
	});

	beforeEach(async () => {
		tempDir_ = await mkdtemp(join(tmpdir(), 'joplin-schema-test-'));
	});

	afterEach(async () => {
		for (const db of databases_) await db.close();
		databases_.splice(0, databases_.length);
		await remove(tempDir_);
	});

	test.each(allVersions)('should create the same schema as the original SQL at version %i', async (version) => {
		const db = await openDatabase();
		const ver = await db.upgradeDatabase(0, version);
		expect(ver).toBe(version);

		expect(snapshotHash(await takeSnapshot(db, ver))).toBe(expectedHash(version));
	});

	test.each([41, 53])('should have the same tables, indexes, views and triggers as the golden dump at version %i', async (version) => {
		const db = await openDatabase();
		const ver = await db.upgradeDatabase(0, version);
		const snapshot = await takeSnapshot(db, ver);
		const golden = golden_.full[`v${version}`];

		expect(snapshot.info).toEqual(golden.info);
		expect(normalizedMaster(snapshot.master)).toEqual(normalizedMaster(golden.master));
	});

	test('should refresh the table fields like the original code', async () => {
		const db = await openDatabase();
		await db.upgradeDatabase(0, 53);
		await db.refreshTableFields(53);

		const query = compile(kysely.selectFrom('table_fields').selectAll().orderBy('id'));
		expect(await db.selectAll(query.sql, query.params)).toEqual(golden_.tableFields);
	});

	test.each([15, 33, 41])('should upgrade from version %i to the same schema as a full upgrade', async (fromVersion) => {
		const db = await openDatabase();
		await db.upgradeDatabase(0, fromVersion);
		const ver = await db.upgradeDatabase(fromVersion);
		expect(ver).toBe(53);

		expect(snapshotHash(await takeSnapshot(db, ver))).toBe(expectedHash(53));
	});

});
