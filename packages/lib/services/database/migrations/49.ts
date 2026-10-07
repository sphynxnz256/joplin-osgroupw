import { addColumnQuery, intDefaultingTo } from '../kysely/schema';
import { SqlQuery } from '../types';

export default (): SqlQuery[] => {
	return [
		addColumnQuery('sync_items', 'remote_item_updated_time', intDefaultingTo(0)),
	];
};
