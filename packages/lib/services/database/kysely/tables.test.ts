import { readFileSync } from 'fs';
import { logger, setupDatabaseAndSynchronizer, db, switchClient } from '../../../testing/test-utils';

// The Kysely table types are plain interfaces, so read them from the source to compare with the real schema
const typedColumns = () => {
	const source = readFileSync(`${__dirname}/../../../services/database/kysely/tables.ts`, 'utf8').replace(/\r/g, '');
	const output: Record<string, string[]> = {};
	const dbBlock = source.match(/export interface DB \{([^}]*)\}/)[1];
	for (const m of dbBlock.matchAll(/\t(\w+): (\w+);/g)) {
		const body = source.match(new RegExp(`export interface ${m[2]} [{]([^}]*)[}]`))[1];
		output[m[1]] = [...body.matchAll(/\t'?(\w+)'?\?: Col/g)].map(c => c[1]).sort();
	}
	return output;
};

describe('services/database/kysely/tables', () => {

	beforeEach(async () => {
		await setupDatabaseAndSynchronizer(1);
		await switchClient(1);
		expect(logger).toBeTruthy();
	});

	test('should describe the same columns as the real tables', async () => {
		const typed = typedColumns();
		const tables = Object.keys(typed).filter(t => !['notes_fts', 'items_fts', 'search_aux', 'notes_spellfix', 'note_embeddings_vec'].includes(t));
		expect(tables.length).toBeGreaterThan(15);
		for (const table of tables) {
			const rows = await db().selectAll(`PRAGMA table_info("${table}")`);
			expect({ table, columns: rows.map(r => r.name).sort() }).toEqual({ table, columns: typed[table] });
		}
	});

});
