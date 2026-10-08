import { insertRow } from './kysely';

export default (num: number) => {
	const timestamp = Date.now();
	return insertRow('migrations', { number: num, created_time: timestamp, updated_time: timestamp });
};
