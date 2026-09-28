import { setupDatabaseAndSynchronizer, switchClient } from '../../testing/test-utils';
import { ListRenderer, NoteListColumns } from '../plugins/api/noteListType';
import defaultListRenderer from './defaultListRenderer';
import defaultLeftToRightListRenderer from './defaultLeftToRightListRenderer';
import defaultMultiColumnsRenderer from './defaultMultiColumnsRenderer';
import renderTemplate from './renderTemplate';

const renderNote = async (renderer: ListRenderer, isPublished: boolean, isSelected: boolean) => {
	const columns: NoteListColumns = renderer.multiColumns ? [{ name: 'note.title', width: 0 }] : [];
	const view = await renderer.onRenderNote({
		note: { id: '1', title: 'Test', body: '', is_todo: 0, todo_completed: 0, is_locked: 0, is_published: isPublished, is_shared: isPublished ? 1 : 0, isWatched: false },
		item: { size: { width: 150, height: 150 }, selected: isSelected },
	});
	return renderTemplate(columns, renderer.itemTemplate, renderer.itemValueTemplates ?? {}, view);
};

describe('publishedIndicator', () => {

	beforeEach(async () => {
		await setupDatabaseAndSynchronizer(1);
		await switchClient(1);
	});

	test.each([
		['compact', defaultListRenderer],
		['detailed', defaultLeftToRightListRenderer],
	])('should show the published icon only on published notes (%s)', async (_name, renderer) => {
		for (const isSelected of [false, true]) {
			expect(await renderNote(renderer, true, isSelected)).toContain('aria-label="Published"');
			expect(await renderNote(renderer, false, isSelected)).not.toContain('publishedicon');
		}
	});

	test('should mark published rows and label the icon in the multi-column list', async () => {
		const html = await renderNote(defaultMultiColumnsRenderer, true, true);
		expect(html).toMatch(/class="row [^"]*-published/);
		expect(html).toContain('aria-label="Published"');
	});
});
