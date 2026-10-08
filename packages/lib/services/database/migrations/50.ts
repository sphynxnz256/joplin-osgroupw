import { SqlQuery } from '../types';
import { addColumnQuery, required } from '../kysely/rawFragments/schema';

export default (): (SqlQuery|string)[] => {
	return [
		addColumnQuery('notes', 'is_locked', required('INT', 0)),
		addColumnQuery('notes', 'extracted_resource_ids', required('TEXT', '')),
		addColumnQuery('revisions', 'is_locked', required('INT', 0)),
		addColumnQuery('resources', 'is_locked', required('INT', 0)),
	];
};
