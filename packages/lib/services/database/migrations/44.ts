import { addColumnQuery, intDefaultingTo } from '../kysely/schema';
import kysely, { compileQuery } from '../kysely/kysely';
import { SqlQuery } from '../types';

export default (): SqlQuery[] => {
	return [
		addColumnQuery('resources', 'blob_updated_time', intDefaultingTo(0)),
		compileQuery(kysely.updateTable('resources').set(eb => ({ blob_updated_time: eb.ref('updated_time') }))),
	];
};
