import addMigrationFile from '../addMigrationFile';
import { SqlQuery } from '../types';

export default (): SqlQuery[] => {
	return [
		addMigrationFile(42),
	];
};
