import { compileRawQuery } from '../kysely/kysely';
import { createFtsTableQuery, createFtsTriggerQueries } from '../kysely/rawFragments';
import { addColumnQuery, autoIncrementKey, createIndexQuery, createTableQuery, emptyText, intDefaultingTo, optionalInt, requiredInt, requiredText } from '../kysely/schema';
import { SqlQuery } from '../types';

export default (): SqlQuery[] => {
	const queries: SqlQuery[] = [];

	queries.push(addColumnQuery('resources', 'ocr_text', emptyText));
	queries.push(addColumnQuery('resources', 'ocr_details', emptyText));
	queries.push(addColumnQuery('resources', 'ocr_status', intDefaultingTo(0)));
	queries.push(addColumnQuery('resources', 'ocr_error', emptyText));

	queries.push(createTableQuery('items_normalized', {
		id: autoIncrementKey,
		title: emptyText,
		body: emptyText,
		item_id: requiredText,
		item_type: requiredInt,
		user_updated_time: intDefaultingTo(0),
		reserved1: optionalInt,
		reserved2: optionalInt,
		reserved3: optionalInt,
		reserved4: optionalInt,
		reserved5: optionalInt,
		reserved6: optionalInt,
	}));

	queries.push(createIndexQuery('items_normalized_id', 'items_normalized', ['id']));
	queries.push(createIndexQuery('items_normalized_item_id', 'items_normalized', ['item_id']));
	queries.push(createIndexQuery('items_normalized_item_type', 'items_normalized', ['item_type']));

	const columns = ['id', 'title', 'body', 'item_id', 'item_type', 'user_updated_time', 'reserved1', 'reserved2', 'reserved3', 'reserved4', 'reserved5', 'reserved6'];
	const notIndexed = columns.filter(c => c !== 'title' && c !== 'body');

	queries.push(compileRawQuery(createFtsTableQuery('items_fts', 'items_normalized', notIndexed, columns)));
	queries.push(...createFtsTriggerQueries({ prefix: 'items', ftsTable: 'items_fts', sourceTable: 'items_normalized', columns }).map(compileRawQuery));

	return queries;
};
