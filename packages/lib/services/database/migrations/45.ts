import { SqlQuery } from '../types';
import { addColumnQuery, createFtsTableQuery, createFtsTriggerQueries, createIndexQueries, createTableQuery, nullable, primaryKey, required } from '../kysely/rawFragments/schema';

export default (): (SqlQuery|string)[] => {
	const queries: (SqlQuery|string)[] = [];

	queries.push(addColumnQuery('resources', 'ocr_text', required('TEXT', '')));
	queries.push(addColumnQuery('resources', 'ocr_details', required('TEXT', '')));
	queries.push(addColumnQuery('resources', 'ocr_status', required('INT', 0)));
	queries.push(addColumnQuery('resources', 'ocr_error', required('TEXT', '')));

	queries.push(createTableQuery('items_normalized', {
		id: primaryKey('INTEGER', true),
		title: required('TEXT', ''),
		body: required('TEXT', ''),
		item_id: required('TEXT'),
		item_type: required('INT'),
		user_updated_time: required('INT', 0),
		reserved1: nullable('INT'),
		reserved2: nullable('INT'),
		reserved3: nullable('INT'),
		reserved4: nullable('INT'),
		reserved5: nullable('INT'),
		reserved6: nullable('INT'),
	}));

	queries.push(...createIndexQueries('items_normalized', ['id', 'item_id', 'item_type']));

	const tableFields = ['id', 'title', 'body', 'item_id', 'item_type', 'user_updated_time', 'reserved1', 'reserved2', 'reserved3', 'reserved4', 'reserved5', 'reserved6'];

	queries.push(createFtsTableQuery('items_fts', 'items_normalized', tableFields.filter(c => c !== 'title' && c !== 'body'), tableFields));

	queries.push(...createFtsTriggerQueries({
		prefix: 'items',
		ftsTable: 'items_fts',
		contentTable: 'items_normalized',
		columns: tableFields,
	}));

	return queries;
};
