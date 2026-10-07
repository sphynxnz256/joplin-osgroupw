import { addColumnQuery, emptyText, intDefaultingTo } from '../kysely/schema';
import { SqlQuery } from '../types';

export default (): SqlQuery[] => {
	return [
		addColumnQuery('notes', 'is_locked', intDefaultingTo(0)),
		addColumnQuery('notes', 'extracted_resource_ids', emptyText),
		addColumnQuery('revisions', 'is_locked', intDefaultingTo(0)),
		addColumnQuery('resources', 'is_locked', intDefaultingTo(0)),
	];
};
