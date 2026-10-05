import BaseItem from './BaseItem';
import BaseModel from '../BaseModel';
import queryBuilder, { valuesList } from '../services/database/queryBuilder';

export default class NoteTag extends BaseItem {
	public static tableName() {
		return 'note_tags';
	}

	public static modelType() {
		return BaseModel.TYPE_NOTE_TAG;
	}

	public static async byNoteIds(noteIds: string[]) {
		if (!noteIds.length) return [];
		return this.modelSelectAll(queryBuilder.selectFrom('note_tags').selectAll().where('note_id', 'in', valuesList(noteIds)));
	}

	public static async tagIdsByNoteId(noteId: string) {
		const rows = await this.db().selectAll(queryBuilder.selectFrom('note_tags').select('tag_id').where('note_id', '=', noteId));
		const output = [];
		for (let i = 0; i < rows.length; i++) {
			output.push(rows[i].tag_id);
		}
		return output;
	}
}
