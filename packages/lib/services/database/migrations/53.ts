import { SqlQuery } from '../types';
import { createTableQuery, dropTableQuery, primaryKey, required } from '../kysely/rawFragments/schema';

// Recreate conflict_note_states with a numeric auto-increment primary key, to
// match the convention used by the other tables. note_id keeps its uniqueness
// through a UNIQUE constraint. The table was added in migration 51 and hasn't
// shipped in a release yet, so it is safe to drop and recreate it rather than
// migrate the rows

export default (): (SqlQuery|string)[] => {
	return [
		dropTableQuery('conflict_note_states', { ifExists: true }),
		createTableQuery('conflict_note_states', {
			id: primaryKey('INTEGER', true),
			note_id: { type: 'TEXT', notNull: true, unique: true },
			base_body: required('TEXT', ''),
			base_title: required('TEXT', ''),
			remote_body: required('TEXT', ''),
			remote_title: required('TEXT', ''),
			remote_updated_time: required('INT', 0),
		}),
	];
};
