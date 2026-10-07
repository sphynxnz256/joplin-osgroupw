import { compileQuery, insertRow } from './kysely/kysely';

export default (num: number) => {
	const timestamp = Date.now();
	return compileQuery(insertRow('migrations', { number: num, created_time: timestamp, updated_time: timestamp }));
};
