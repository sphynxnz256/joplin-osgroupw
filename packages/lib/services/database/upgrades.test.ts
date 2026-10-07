import Database from '../../database';
import { DatabaseDriverNode } from '../../database-driver-node';
import { setupDatabaseAndSynchronizer, switchClient, tempFilePath } from '../../testing/test-utils';
import migrations from './migrations';
import upgradeQueries from './upgrades';

// The structure created by the upgrade steps is checked in schemaHistory.test.ts. This
// checks the steps that also move the data of the existing profiles.
describe('services/database/upgrades', () => {

	let db: Database;

	// Applies the upgrade steps in the given range, except the ones that need an SQLite extension
	const applySteps = async (from: number, to: number) => {
		for (let version = from; version <= to; version++) {
			if (version === 34) continue;
			await db.transactionExecBatch(upgradeQueries(version));
		}
	};

	beforeEach(async () => {
		await setupDatabaseAndSynchronizer(1);
		await switchClient(1);
		db = new Database(new DatabaseDriverNode());
		await db.open({ name: tempFilePath('sqlite') });
	});

	afterEach(async () => {
		await db.close();
	});

	test('should move the sync context to the sync target 3', async () => {
		await applySteps(1, 3);
		await db.exec('INSERT INTO settings (key, value) VALUES (\'sync.context\', \'abc\'), (\'other\', \'x\')');
		await applySteps(4, 4);

		expect(await db.selectAll('SELECT key, value FROM settings ORDER BY key')).toEqual([
			{ key: 'other', value: 'x' },
			{ key: 'sync.3.context', value: 'abc' },
		]);
	});

	test('should copy the times to the user times', async () => {
		await applySteps(1, 4);
		await db.exec('INSERT INTO notes (id, created_time, updated_time) VALUES (\'n1\', 5, 7)');
		await db.exec('INSERT INTO tags (id, created_time, updated_time) VALUES (\'t1\', 8, 9)');
		await applySteps(5, 5);

		expect(await db.selectAll('SELECT user_created_time, user_updated_time FROM notes')).toEqual([{ user_created_time: 5, user_updated_time: 7 }]);
		expect(await db.selectAll('SELECT user_created_time, user_updated_time FROM tags')).toEqual([{ user_created_time: 8, user_updated_time: 9 }]);
	});

	test('should add a change for each existing note', async () => {
		await applySteps(1, 9);
		await db.exec('INSERT INTO notes (id, created_time, updated_time) VALUES (\'n1\', 1, 1), (\'n2\', 1, 1)');
		await applySteps(10, 10);

		expect(await db.selectAll('SELECT item_type, item_id, type FROM item_changes ORDER BY item_id')).toEqual([
			{ item_type: 1, item_id: 'n1', type: 1 },
			{ item_type: 1, item_id: 'n2', type: 1 },
		]);
	});

	test('should keep the resources when moving their fetch status', async () => {
		await applySteps(1, 12);
		await db.exec('INSERT INTO resources (id, title, mime, created_time, updated_time) VALUES (\'r1\', \'title\', \'image/png\', 1, 2)');
		await applySteps(13, 14);

		expect(await db.selectAll('SELECT resource_id, fetch_status, fetch_error FROM resource_local_states')).toEqual([{ resource_id: 'r1', fetch_status: 2, fetch_error: '' }]);
		expect(await db.selectAll('SELECT id, title, mime, created_time, updated_time FROM resources')).toEqual([
			{ id: 'r1', title: 'title', mime: 'image/png', created_time: 1, updated_time: 2 },
		]);
	});

	test('should keep the notes when changing the type of the order field', async () => {
		await applySteps(1, 29);
		await db.exec('INSERT INTO notes (id, title, created_time, updated_time, `order`) VALUES (\'n1\', \'title\', 1, 2, 5)');
		await applySteps(30, 30);
		await db.exec('INSERT INTO notes (id, created_time, updated_time, `order`) VALUES (\'n2\', 1, 2, 1000.5)');

		expect(await db.selectAll('SELECT id, title, `order` FROM notes ORDER BY id')).toEqual([
			{ id: 'n1', title: 'title', order: 5 },
			{ id: 'n2', title: '', order: 1000.5 },
		]);
	});

	test('should copy the resource update time to the blob update time', async () => {
		await applySteps(1, 41);
		await db.transactionExecBatch(migrations[0]());
		await db.transactionExecBatch(migrations[1]());
		await db.exec('INSERT INTO resources (id, mime, created_time, updated_time) VALUES (\'r1\', \'image/png\', 1, 9)');
		await db.transactionExecBatch(migrations[2]());

		expect(await db.selectAll('SELECT updated_time, blob_updated_time FROM resources')).toEqual([{ updated_time: 9, blob_updated_time: 9 }]);
	});

});
