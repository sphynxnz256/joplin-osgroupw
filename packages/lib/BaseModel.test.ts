import BaseModel from './BaseModel';
import Folder from './models/Folder';
import { setupDatabaseAndSynchronizer, switchClient } from './testing/test-utils';

describe('BaseModel', () => {
	beforeEach(async () => {
		await setupDatabaseAndSynchronizer(1);
		await switchClient(1);
	});

	test('should run generic queries', async () => {
		const b = await Folder.save({ title: 'b' });
		const a = await Folder.save({ title: 'A' });
		const c = await Folder.save({ title: 'c', parent_id: a.id });

		expect(await Folder.count()).toBe(3);
		expect(await Folder.count({ where: eb => eb('parent_id', '!=', '') })).toBe(1);
		expect(await Folder.count({ where: eb => eb('title', '=', 'b') })).toBe(1);

		expect((await Folder.allIds({ order: [{ by: 'title', dir: 'DESC' }], limit: 2 }))).toEqual([c.id, b.id]);
		expect((await Folder.allIds({ order: [{ by: 'title', dir: 'ASC' }], caseInsensitive: true })).slice(0, 2)).toEqual([a.id, b.id]);
		expect((await Folder.all({ fields: ['id'], where: 'title = ? OR title = ?', whereParams: ['b', 'c'], order: [{ by: 'title', dir: 'ASC' }] })).map(f => f.id)).toEqual([b.id, c.id]);
		expect((await Folder.byIds([a.id, c.id, 'unknown'])).map(f => f.id).sort()).toEqual([a.id, c.id].sort());
		expect((await Folder.search({ conditions: [eb => eb('parent_id', '=', a.id), eb => eb('title', '=', 'c')] })).map(f => f.id)).toEqual([c.id]);
		expect((await Folder.search({ titlePattern: '*' })).length).toBe(3);

		expect((await Folder.loadByField('title', 'B', { caseInsensitive: true })).id).toBe(b.id);
		expect(await Folder.loadByField('title', 'B')).toBeFalsy();
		expect((await Folder.loadByFields({ title: 'c', parent_id: a.id })).id).toBe(c.id);
		expect((await Folder.loadByTitle('b')).id).toBe(b.id);
		expect((await Folder.loadByPartialId(a.id.substr(0, 8))).map(f => f.id)).toContain(a.id);

		await Folder.delete(a.id);
		await Folder.delete(b.id);
		await Folder.delete(c.id);
		expect(await Folder.count()).toBe(0);
	});

	test.each([
		[0, 0],
		[4, 10],
		[10, 4],
		[5, 5],
	])('should filter items by IDs (itemCount: %d, idCount: %d)', (itemCount, idCount) => {
		const items = [];
		const ids = [];

		const expectedMatchingItems = [];
		for (let i = 0; i < idCount; i++) {
			const id = `matching-${i}`;
			ids.push(id);

			if (items.length < itemCount) {
				const item = { id };
				items.push(item);
				expectedMatchingItems.push(item);
			}
		}

		while (items.length < itemCount) {
			items.push({ id: `non-matching-${items.length}` });
		}

		expect(BaseModel.modelsByIds(items, ids)).toMatchObject(expectedMatchingItems);
	});

	test.each([
		[0, false],
		[12, false],
		[4096, false],
		[4097, true],
		[100000, true],
	])('userSideValidation should reject overly long titles (length: %d)', (length, shouldThrow) => {
		const run = () => BaseModel.userSideValidation({ title: 'x'.repeat(length) });
		if (shouldThrow) {
			expect(run).toThrow(/title must be 4096 characters or less/);
		} else {
			expect(run).not.toThrow();
		}
	});

	const nul = String.fromCharCode(0);
	test.each([
		[{ title: 'fine', body: 'fine' }, false],
		[{ title: `bad${nul}title`, body: 'fine' }, true],
		[{ title: 'fine', body: `bad${nul}body` }, true],
		[{ source_url: `https://example.com/${nul}` }, true],
		[{ title: 'fine' }, false],
		[{ body: 'fine' }, false],
	])('userSideValidation should reject any string field containing a null byte (input: %j)', (input, shouldThrow) => {
		const run = () => BaseModel.userSideValidation(input);
		if (shouldThrow) {
			expect(run).toThrow(/null byte/);
		} else {
			expect(run).not.toThrow();
		}
	});
});
