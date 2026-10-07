import JoplinDatabase from '../../JoplinDatabase';
import { Condition, compileQuery, genericKysely, orderByArguments, toExpression } from '../../services/database/kysely/kysely';
import { Pagination, PaginationOrder } from './types';

export interface ModelFeedPage {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Heterogeneous: callers receive entity types (Note/Folder/Resource) which lack index signatures
	items: any[];
	has_more: boolean;
	total?: number;
}

export type WhereQuery = Condition;

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

	let query = genericKysely.selectFrom(tableName)
		.$if(!fields.length, qb => qb.selectAll())
		.$if(!!fields.length, qb => qb.select(fields));

	if (whereQuery) query = query.where(toExpression(whereQuery));

	for (const o of pagination.order) {
		query = query.orderBy(...orderByArguments(o.by, o.dir, !!o.caseInsensitive || !!pagination.caseInsensitive));
	}

	const rows = await db.selectAll(compileQuery(query.limit(pagination.limit).offset(offset)));

	return {
		items: rows,
		has_more: rows.length >= pagination.limit,
	};
}
