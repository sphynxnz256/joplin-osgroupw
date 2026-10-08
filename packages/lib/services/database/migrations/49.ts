import { SqlQuery } from '../types';
import { addColumnQuery, required } from '../kysely/rawFragments/schema';

export default (): (SqlQuery|string)[] => {
	return [
		addColumnQuery('sync_items', 'remote_item_updated_time', required('INT', 0)),
	];
};
