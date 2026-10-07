import { addColumnQuery, emptyText } from '../kysely/schema';
import { SqlQuery } from '../types';

export default (): SqlQuery[] => {
	return [
		addColumnQuery('notes', 'user_data', emptyText),
		addColumnQuery('tags', 'user_data', emptyText),
		addColumnQuery('folders', 'user_data', emptyText),
		addColumnQuery('resources', 'user_data', emptyText),
	];
};
