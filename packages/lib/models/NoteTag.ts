import BaseItem from './BaseItem';
import kysely, { compileQuery, inLiterals } from '../services/database/kysely/kysely';
import BaseModel from '../BaseModel';

export default class NoteTag extends BaseItem {
	public static tableName() {
		return 'note_tags';
	}

	public static modelType() {
		return BaseModel.TYPE_NOTE_TAG;
	}

	public static async byNoteIds(noteIds: string[]) {
		if (!noteIds.length) return [];
		return this.modelSelectAll(kysely.selectFrom('note_tags').selectAll().where(inLiterals('note_id', noteIds)));
	}

	public static async tagIdsByNoteId(noteId: string) {
		const rows = await this.db().selectAll(compileQuery(kysely.selectFrom('note_tags').select('tag_id').where('note_id', '=', noteId)));
		const output = [];
		for (let i = 0; i < rows.length; i++) {
			output.push(rows[i].tag_id);
		}
		return output;
	}
}
