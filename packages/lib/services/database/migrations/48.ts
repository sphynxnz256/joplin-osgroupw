import { addColumnQuery, intDefaultingTo } from '../kysely/schema';
import { SqlQuery } from '../types';

export default (): SqlQuery[] => {
	return [
		addColumnQuery('resources', 'ocr_driver_id', intDefaultingTo(1, true)),
	];
};
