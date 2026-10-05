import JoplinDatabase from '../JoplinDatabase';
import Setting from '../models/Setting';
import SyncTargetJoplinServer from '../SyncTargetJoplinServer';
import queryBuilder, { toSqlQuery } from '../services/database/queryBuilder';

export default class DebugService {

	private db_: JoplinDatabase;

	public constructor(db: JoplinDatabase) {
		this.db_ = db;
	}

	private get db(): JoplinDatabase {
		return this.db_;
	}

	public async clearSyncState() {
		const tableNames = [
			'item_changes',
			'deleted_items',
			'sync_items',
			'key_values',
		];

		const queries = [];
		for (const n of tableNames) {
			queries.push(toSqlQuery(queryBuilder.deleteFrom(n)));
			queries.push(toSqlQuery(queryBuilder.deleteFrom('sqlite_sequence').where('name', '=', n))); // Reset autoincremented IDs
		}

		for (let i = 0; i < 20; i++) {
			queries.push(toSqlQuery(queryBuilder.deleteFrom('settings').where('key', '=', `sync.${i}.context`)));
			queries.push(toSqlQuery(queryBuilder.deleteFrom('settings').where('key', '=', `sync.${i}.auth`)));
		}

		await this.db.transactionExecBatch(queries);
	}

	public async setupJoplinServerUser(num: number) {
		const id = SyncTargetJoplinServer.id();
		Setting.setValue('sync.target', id);
		Setting.setValue(`sync.${id}.path`, 'http://localhost:22300');
		Setting.setValue(`sync.${id}.username`, `user${num}@example.com`);
		Setting.setValue(`sync.${id}.password`, '123456');
	}

}
