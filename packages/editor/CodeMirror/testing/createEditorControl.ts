import Setting from '@joplin/lib/models/Setting';
import createEditor from '../createEditor';
import createEditorSettings from '../../testing/createEditorSettings';
import { EditorSettings } from '../../types';

const createEditorControl = (initialText: string, settings: Partial<EditorSettings> = {}) => {
	const editorSettings: EditorSettings = {
		...createEditorSettings(Setting.THEME_LIGHT),
		...settings,
	};

	return createEditor(document.body, {
		initialText,
		initialNoteId: '',
		settings: editorSettings,
		onEvent: _event => { },
		onLogMessage: _message => { },
		onPasteFile: null,
		resolveImageSrc: (src) => Promise.resolve(src),
		onLocalize: input => input,
	});
};

export default createEditorControl;
