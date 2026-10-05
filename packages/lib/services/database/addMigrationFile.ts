import queryBuilder, { toSqlQuery } from './queryBuilder';

export default (num: number) => {
	const timestamp = Date.now();
	return toSqlQuery(queryBuilder.insertInto('migrations').values({ number: num, created_time: timestamp, updated_time: timestamp }));
};
