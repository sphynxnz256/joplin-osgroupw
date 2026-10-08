import { SqlQuery } from '../types';
import { addColumnQuery, required } from '../kysely/rawFragments/schema';

export default (): (SqlQuery|string)[] => {
	return [
		addColumnQuery('notes', 'user_data', required('TEXT', '')),
		addColumnQuery('tags', 'user_data', required('TEXT', '')),
		addColumnQuery('folders', 'user_data', required('TEXT', '')),
		addColumnQuery('resources', 'user_data', required('TEXT', '')),
	];
};
