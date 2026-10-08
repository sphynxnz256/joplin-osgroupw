import { SqlQuery } from '../types';
import { addColumnQuery, required } from '../kysely/rawFragments/schema';

export default (): (SqlQuery|string)[] => {
	return [
		addColumnQuery('sync_items', 'sync_warning_ignored', required('INT', '0')),
	];
};
