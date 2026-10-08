import { SqlQuery } from '../types';
import { kysely, compile } from '../kysely';
import { addColumnQuery, required } from '../kysely/rawFragments/schema';

export default (): (SqlQuery|string)[] => {
	return [
		addColumnQuery('resources', 'blob_updated_time', required('INT', 0)),
		compile(kysely.updateTable('resources').set(eb => ({ blob_updated_time: eb.ref('updated_time') }))),
	];
};
