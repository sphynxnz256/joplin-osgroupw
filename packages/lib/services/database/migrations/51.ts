import { addColumnQuery, createTableQuery, emptyText, intDefaultingTo, textPrimaryKey } from '../kysely/schema';
import { SqlQuery } from '../types';

export default (): SqlQuery[] => {
	return [
		addColumnQuery('sync_items', 'base_body', emptyText),
		addColumnQuery('sync_items', 'base_title', emptyText),
		addColumnQuery('sync_items', 'base_conflict_note_id', emptyText),
		createTableQuery('conflict_note_states', {
			note_id: textPrimaryKey,
			base_body: emptyText,
			base_title: emptyText,
			remote_body: emptyText,
			remote_title: emptyText,
			remote_updated_time: intDefaultingTo(0),
		}, { ifNotExists: true }),
	];
};
