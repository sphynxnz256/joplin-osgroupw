import { addColumnQuery, createTagsWithNoteCountViewQuery, dropViewQuery, intDefaultingTo } from '../kysely/schema';
import { SqlQuery } from '../types';

export default (): SqlQuery[] => {
	return [
		addColumnQuery('notes', 'deleted_time', intDefaultingTo(0)),
		addColumnQuery('folders', 'deleted_time', intDefaultingTo(0)),
		dropViewQuery('tags_with_note_count'),
		createTagsWithNoteCountViewQuery({ withTodoCount: true, excludeDeleted: true }),
	];
};
