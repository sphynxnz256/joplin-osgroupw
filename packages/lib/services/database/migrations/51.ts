import { SqlQuery } from '../types';
import { addColumnQuery, createTableQuery, primaryKey, required } from '../kysely/rawFragments/schema';

export default (): (SqlQuery|string)[] => {
	return [
		addColumnQuery('sync_items', 'base_body', required('TEXT', '')),
		addColumnQuery('sync_items', 'base_title', required('TEXT', '')),
		addColumnQuery('sync_items', 'base_conflict_note_id', required('TEXT', '')),
		createTableQuery('conflict_note_states', {
			note_id: primaryKey('TEXT'),
			base_body: required('TEXT', ''),
			base_title: required('TEXT', ''),
			remote_body: required('TEXT', ''),
			remote_title: required('TEXT', ''),
			remote_updated_time: required('INT', 0),
		}, { ifNotExists: true }),
	];
};
