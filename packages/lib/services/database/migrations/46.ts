import { SqlQuery } from '../types';
import { addColumnQuery, dropViewQuery, required, tagsWithNoteCountViewQuery } from '../kysely/rawFragments/schema';

export default (): (SqlQuery|string)[] => {
	return [
		addColumnQuery('notes', 'deleted_time', required('INT', 0)),
		addColumnQuery('folders', 'deleted_time', required('INT', 0)),
		dropViewQuery('tags_with_note_count'),
		tagsWithNoteCountViewQuery({ todoCompletedCount: true, excludeDeleted: true }),
	];
};
