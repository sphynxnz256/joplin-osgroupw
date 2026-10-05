import JoplinDatabase from '../../JoplinDatabase';
import queryBuilder, { orderByFields, rawCondition } from '../../services/database/queryBuilder';
import { Pagination, PaginationOrder } from './types';

export interface ModelFeedPage {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Heterogeneous: callers receive entity types (Note/Folder/Resource) which lack index signatures
	items: any[];
	has_more: boolean;
	total?: number;
}

export interface WhereQuery {
	sql: string;
	params?: (string | number | boolean)[];
}

// Note: this method might return more fields than was requested as it will
// also return fields that are necessary for pagination.
export default async function(db: JoplinDatabase, tableName: string, pagination: Pagination, whereQuery: WhereQuery = null, fields: string[] = null): Promise<ModelFeedPage> {
	fields = fields ? fields.slice() : ['id'];

	const where = whereQuery && whereQuery.sql ? [whereQuery.sql] : [];
	const sqlParams = whereQuery && whereQuery.params ? whereQuery.params.slice() : [];

	if (!pagination.order.length) throw new Error('Pagination order must be provided');
	if (pagination.order.length > 1) throw new Error('Only one pagination order field can be provided');

	const paginationOrder = pagination.order[0].dir;

	if (!pagination.order.find((o: PaginationOrder) => o.by === 'id')) {
		pagination = {
			...pagination,
			order: pagination.order.concat([{
				by: 'id',
				dir: paginationOrder,
				caseInsensitive: false,
			}]),
		};
	}

	const offset = (pagination.page - 1) * pagination.limit;

	const baseQuery = queryBuilder.selectFrom(tableName);
	let query = fields.length ? baseQuery.select(fields) : baseQuery.selectAll();
	if (where.length) query = query.where(rawCondition(where.join(' AND '), sqlParams));
	query = orderByFields(query, pagination.order, pagination.caseInsensitive);

	const rows = await db.selectAll(query.limit(pagination.limit).offset(offset));

	return {
		items: rows,
		has_more: rows.length >= pagination.limit,
	};
}
