import { SqlQuery } from '../types';
import { addColumnQuery, required } from '../kysely/rawFragments/schema';

export default (): (SqlQuery|string)[] => {
	return [
		addColumnQuery('resources', 'ocr_driver_id', required('INT', '1')),
	];
};
