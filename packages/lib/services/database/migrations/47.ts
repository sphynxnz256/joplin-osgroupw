import { addColumnQuery, intDefaultingTo } from '../kysely/schema';
import { SqlQuery } from '../types';

export default (): SqlQuery[] => {
	return [
		addColumnQuery('sync_items', 'sync_warning_ignored', intDefaultingTo(0, true)),
	];
};
