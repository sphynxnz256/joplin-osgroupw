import { autoIncrementKey, createTableQuery, dropTableQuery, emptyText, intDefaultingTo, uniqueRequiredText } from '../kysely/schema';
import { SqlQuery } from '../types';

// Recreate conflict_note_states with a numeric auto-increment primary key, to
// match the convention used by the other tables. note_id keeps its uniqueness
// through a UNIQUE constraint. The table was added in migration 51 and hasn't
// shipped in a release yet, so it is safe to drop and recreate it rather than
// migrate the rows

export default (): SqlQuery[] => {
	return [
		dropTableQuery('conflict_note_states', true),
		createTableQuery('conflict_note_states', {
			id: autoIncrementKey,
			note_id: uniqueRequiredText,
			base_body: emptyText,
			base_title: emptyText,
			remote_body: emptyText,
			remote_title: emptyText,
			remote_updated_time: intDefaultingTo(0),
		}),
	];
};
