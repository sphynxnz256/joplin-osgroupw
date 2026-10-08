import JoplinDatabase from '../../JoplinDatabase';
import { sql } from 'kysely';
import { compile, kysely, legacyFragment, orderByClause } from '../../services/database/kysely';
import { DB } from '../../services/database/kysely/tables';
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

	let query = fields.length ? kysely.selectFrom(tableName as keyof DB).select(fields.map(f => sql.ref(f)) as never[]) : kysely.selectFrom(tableName as keyof DB).selectAll();
	if (whereQuery && whereQuery.sql) query = query.where(legacyFragment(whereQuery.sql, whereQuery.params || []));
	for (const o of pagination.order) query = query.orderBy(orderByClause(o, pagination.caseInsensitive));
	const q = compile(query.limit(pagination.limit).offset(offset));

	const rows = await db.selectAll(q.sql, q.params);

	return {
		items: rows,
		has_more: rows.length >= pagination.limit,
	};
}
