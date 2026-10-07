import JoplinDatabase from '../../JoplinDatabase';
import kysely, { compileQuery, genericKysely } from '../database/kysely/kysely';
import BaseItem from '../../models/BaseItem';
import Setting from '../../models/Setting';
import SyncTargetRegistry from '../../SyncTargetRegistry';
import { SqlQuery } from '../database/types';

async function clearSyncContext() {
	const syncTargetIds = SyncTargetRegistry.allIds();

	for (const syncTargetId of syncTargetIds) {
		const key = `sync.${syncTargetId}.context`;
		if (Setting.keyExists(key)) {
			Setting.resetKey(key);
		}
	}

	await Setting.saveAll();
}

export async function clearLocalSyncStateForReupload(db: JoplinDatabase) {
	const queries: SqlQuery[] = [
		compileQuery(kysely.deleteFrom('deleted_items')),
		compileQuery(kysely.deleteFrom('sync_items')),
	];

	await db.transactionExecBatch(queries);

	await clearSyncContext();
}

export async function clearLocalDataForRedownload(db: JoplinDatabase) {
	const queries: SqlQuery[] = [
		compileQuery(kysely.deleteFrom('deleted_items')),
		compileQuery(kysely.deleteFrom('sync_items')),
		compileQuery(kysely.deleteFrom('item_changes')),
		compileQuery(kysely.deleteFrom('note_resources')),
	];

	const syncItemTypes = BaseItem.syncItemTypes();

	for (const syncItemType of syncItemTypes) {
		const SyncItemClass = BaseItem.getClassByItemType(syncItemType);
		queries.push(compileQuery(genericKysely.deleteFrom(SyncItemClass.tableName())));
	}

	await db.transactionExecBatch(queries);

	await clearSyncContext();
}
