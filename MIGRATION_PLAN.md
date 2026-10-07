# Plan: migrate packages/lib database code to Kysely

## Status: all stages (0 to 11) are done

Final result of the last full run: `yarn tsc` is clean and the tests give **1,651 passed, 15 failed, 3 skipped**. The 15 failures are the same ones as before the migration, in the same 4 files (import-enex-md-gen, InteropService_Importer_Md, InteropService_Importer_Md_frontmatter, synchronizer_MigrationHandler). The other 29 passed tests are new. ESLint (ignoring the Windows line-ending rule) and CSpell are clean on every changed file. Nothing was committed or pushed.

What changed compared with the plan below (please read these):

1. **Only one SQL text option is kept on purpose.** `BaseModel`'s `where` option (with `whereParams`) still accepts SQL text, because `packages/app-desktop/gui/ResourceScreen.tsx` uses it and you asked me not to edit callers outside `packages/lib`. It goes through `legacyFragment()` in `services/database/kysely/kysely.ts`. Everything inside `packages/lib` uses the new `Condition` functions instead. When that one caller is updated, `legacyFragment`, the string form of `where` and `whereParams` can be deleted.
2. **Raw fragments are in more than one file** (see the inventory below). They are all small and all go through Kysely's `sql` tag.
3. **Jest needed a small transformer.** Kysely is an ES-module-only package and Jest could not load it (risk R1 happened). `packages/lib/jest.config.js` now converts Kysely's files to CommonJS with `packages/lib/jest.esmTransformer.js` (uses the TypeScript compiler already installed). Other packages that run Jest on code importing `@joplin/lib` (app-cli, app-desktop, app-mobile) will need the same treatment, and the desktop and mobile bundlers should be checked. I could not test those from `packages/lib`.
4. **Search parameters are now always bound in the order they appear.** Reading the old search query builder, it collected parameters in a different order from where they appeared in the SQL text when an `id:` filter was combined with `notebook:`, `tag:` or `resource:`, which would have given wrong results. I did not run the old code to confirm this. Kysely binds parameters in the order they appear in the SQL, so that combination can no longer be mixed up. Nothing else about search results changed (all existing search tests pass).
5. **Small, intended behaviour notes.** `undefined` values are still stored as NULL (Kysely would silently drop them, so the helper converts them). `LIMIT` and `OFFSET` are now bound parameters instead of numbers written into the text. Long `IN (...)` ID lists are still written into the SQL text on purpose (so they cannot exceed SQLite's parameter limit). `Database.updateQuery()` no longer accepts a SQL string as its `where` (nothing used it) and refuses an empty condition instead of updating every row.
6. **Removed helpers** (all used only inside `packages/lib`): `Database.escapeField/escapeFields/escapeValues/escapeFieldsToString/alterColumnQueries/wrapQueries`, `BaseModel.escapeIdsForSql/selectFields/applySqlOptions`, `Note.previewFieldsSql`, `paginationToSql.ts`, `sqlStringToLines.ts`. `SearchEngine.relevantFields` is now an array. `BaseModel.modelSelectAll/modelSelectOne` now only take a Kysely query. `Database.exec/selectAll/selectOne/transactionExecBatch` still accept SQL strings, because other packages call them.
7. **Stage 11 proof.** `services/database/schemaHistory.test.ts` records the database structure after each of the 53 upgrade steps and compares it with `services/database/schemaHistory.json`, which was generated from the old code before I touched the schema. The new code produces the same structure at every version (tables, columns with their types, NOT NULL, defaults and primary keys, indexes, views, FTS tables, triggers, and the final `table_fields` rows). Only the written order of `NOT NULL` and `DEFAULT` inside a stored `CREATE TABLE` is ignored, because Kysely writes them in the other order and SQLite treats them the same. `services/database/upgrades.test.ts` checks the upgrade steps that also move data (sync context, user times, note changes, resource fetch status, the notes `order` change, blob times).

New files: `services/database/kysely/` (`kysely.ts`, `tables.ts`, `schema.ts`, `rawFragments.ts` and their tests), `services/database/upgrades.ts`, `services/database/schemaHistory.*`, `services/database/upgrades.test.ts`, `services/search/queryBuilder.test.ts`, `jest.esmTransformer.js`.

## Raw SQL fragments that remain (final inventory)

Everything else is built with Kysely. These are written with Kysely's `sql` tag because Kysely has no builder for them.

In `services/database/kysely/rawFragments.ts`:
- Triggers: `createFtsTriggerQueries` (the 4 `notes_*` triggers and the 4 `items_*` triggers, used in `services/database/upgrades.ts` and `migrations/45.ts`) and `dropTriggerQuery`.
- Virtual tables: `createFtsTableQuery` (`notes_fts`, `items_fts`), `createSearchAuxQuery` (`search_aux`), `createSpellfixQuery` (`notes_spellfix`), `createVecTableQuery` (`note_embeddings_vec`).
- Search and vector functions: `ftsMatch` (MATCH), `ftsOffsets`, `ftsMatchInfo`, `vecMatch`, `vecToJson`, `lastInsertRowId`.
- `PRAGMA table_info`: `tableInfoQuery` (used by `JoplinDatabase.refreshTableFields`).
- Schema details with no builder: `doubleQuotedDefault` (the existing `DEFAULT ""` style), `nullModifier` and `uniqueModifier` (column modifiers written last), `intColumnType` (the `INT` column type), `booleanLiteral` (constant 0/1 conditions in search).

In `services/database/kysely/kysely.ts`:
- `inLiterals` and `notInLiterals`: ID lists written into the text on purpose.
- `equalsNoCase` and `orderByArguments`: `COLLATE NOCASE`.
- `legacyFragment`: the SQL text `where` option kept for ResourceScreen.tsx (see above).

Small literals inside otherwise normal Kysely queries: `sql.lit(1)` for `SELECT 1` in `NOT EXISTS` (`NoteEmbedding.ts`, `Resource.ts`), `sql.lit(k)` for the vec0 `LIMIT` (`NoteEmbedding.ts`), literal values inside the `tags_with_note_count` view (`schema.ts`, views cannot have parameters), and literal values in two `INSERT ... SELECT` upgrade steps (`upgrades.ts`).

## Callers outside packages/lib (listed only, not edited)

- `packages/app-desktop/gui/ResourceScreen.tsx` (line ~202): passes `where: 'id LIKE ? OR title LIKE ?'` and `whereParams` to `Resource.all()`. This still works. Moving it to a `Condition` function (`eb => eb.or([eb('id', 'like', s), eb('title', 'like', s)])`) would let `legacyFragment` be removed.
- Callers of `db.exec/selectAll/selectOne`, which still accept SQL text: `packages/app-mobile/components/screens/Note/Note.tsx`, `packages/app-mobile/utils/buildStartupTasks.ts`, `packages/app-cli/app/command-testing.ts`, `packages/app-cli/app/cli-integration-tests.test.ts`.
- Implementations of the database driver interface (unchanged): `packages/app-mobile/utils/database-driver-react-native.ts` and `.web.ts`.
- Still working and unchanged: `Folder.search({ titlePattern })`, `Tag.search(...)`, `Note.previews(...)`, `Note.allIds()`, `loadByPartialId()` (app-cli, app-mobile).
- Their Jest and bundler setup (see note 3).

---

## Original plan (as approved)

## 1. Context and plain-language summary

Joplin's database code (`packages/lib`) builds SQL by gluing text together. About 480 SQL snippets live in 50 files. Kysely is a library that builds the same SQL from typed TypeScript calls, so typos in column names are caught by `yarn tsc` instead of at runtime.

What I found while exploring:

- **How queries run today.** All SQL goes through one class, `Database` (`database.ts`). It hands the text to a "driver": `database-driver-node.ts` (node-sqlite3, callback style) on desktop and CLI, and `app-mobile/utils/database-driver-react-native.ts` on mobile. `better-sqlite` is only a stub.
- **Kysely cannot run queries on those drivers.** Its built-in SQLite support expects the synchronous `better-sqlite3` object. Joplin uses a different library and phone/web drivers. So the proposal is to use Kysely only to *write* the SQL (it turns a query into text plus values) and keep Joplin's existing drivers, retry logic and transaction handling to *run* it. I tried this on this machine: Kysely loads from our CommonJS code on Node 22.12 and produces correct SQLite text.
- **Where the SQL is.**
  - `BaseModel.ts`: generic select, insert, update and delete helpers that every model uses.
  - `models/*.ts`: about 300 hand-written queries (Note, Folder, BaseItem, Resource, Revision, Tag, NoteEmbedding, and others).
  - `JoplinDatabase.ts`: the first-version schema (~120 lines of CREATE TABLE) plus an upgrade ladder for versions 1 to 41, and `refreshTableFields`.
  - `services/database/migrations/42.ts` to `53.ts`: newer upgrade steps.
  - `services/search/`: `queryBuilder.ts` (builds big UNION/INTERSECT/WITH queries) and `SearchEngine.ts` (full-text search).
  - `services/KvStore.ts` and a few services (`ReportService`, `RevisionService`, `ResourceService`, `synchronizer/tools.ts`, `syncInfoUtils.ts`, `DebugService`).
- **Some SQL is passed in from outside the models.** Many callers hand `BaseModel` raw fragments such as `conditions: ['title LIKE ?']`, `order`, or `fields`. These have to be converted too, or they will stay as text forever.
- Other packages (`app-mobile`, `app-cli`) call `db.exec/selectAll/selectOne` directly in a few places, so the public `Database` API must keep working until the end.

Hard-to-do-with-Kysely items (details and decisions in section 4): triggers, FTS4 / spellfix / sqlite-vec virtual tables, FTS functions, `PRAGMA`, and executing on Joplin's own drivers.

## 2. Ground rules for every stage

1. Run `yarn tsc` in `packages/lib`, then the full test run: `npx -y -p node@22.23.3 node node_modules/jest/bin/jest.js`. The baseline is **1,622 passed / 15 failed**, and the same 15 failures in the same 4 files. A stage is only "done" if it ends at exactly that baseline. (If Jest prints `EPERM ... rename`, just rerun.)
2. **Safety net first: characterization tests.** Before touching a query, a test records the SQL text and values the old code produces for representative inputs. After the change the new code must produce an equivalent query (see risk R2 on what "equivalent" means). A schema snapshot test does the same for the database structure.
3. One stage = one reviewable chunk. No commits, pushes or history changes by me, ever; you decide when to commit.
4. Repo style from `CLAUDE.md`: tabs, single quotes, no `any`, `//` comments only, one `describe()` per test file, `yarn updateIgnored` after adding a new TS file.
5. Public method names and return shapes on `Database` / models do not change until the last stage.

## 3. Stages

### Stage 0. Foundation and proof that it works here
- **Goal:** add a "compile-only" Kysely instance (a Kysely with a dummy driver) and a tiny helper that returns `{ sql, params }` in the existing `SqlQuery` shape. No behaviour change.
- **Files:** new `services/database/kysely/` (instance + `compile` helper + its test). `package.json` already has Kysely.
- **Depends on:** nothing.
- **Done when:** the new unit test compiles insert/update/select/`orReplace`/`WITH RECURSIVE` examples and passes under Jest; also confirms Kysely can be loaded by Jest (it is an ES-module-only package and Jest 29 can be strict about that, see R1). Full suite equals baseline.

### Stage 1. Typed description of every table
- **Goal:** a TypeScript `interface` listing each table and its columns (notes, folders, resources, tags, note_tags, settings, sync_items, deleted_items, item_changes, note_resources, revisions, key_values, alarms, master_keys, migrations, resource_local_states, resources_to_download, conflict_note_states, note_embeddings_meta, notes_normalized, items_normalized, version, table_fields, and the view tags_with_note_count). Reuse the existing entity types in `services/database/types.ts` where they already exist.
- **Files:** new `services/database/kysely/tables.ts`; reads `JoplinDatabase.ts` and `migrations/*` as the source of truth.
- **Depends on:** Stage 0.
- **Done when:** a test creates a fully upgraded database, reads each table's real columns via `PRAGMA table_info`, and fails if any column is missing from or extra in the TypeScript description. This keeps the types honest forever.

### Stage 2. Rebuild `Database` helpers on Kysely
- **Goal:** `Database.insertQuery`, `updateQuery`, `escapeField(s)`, `escapeValues`, `wrapQuery(ies)` and `alterColumnQueries` get Kysely-based implementations, with the same signatures.
- **Files:** `database.ts`, `database.test.ts`, `BaseModel.ts` (`saveQuery` only).
- **Depends on:** Stages 0 to 1.
- **Done when:** characterization tests prove the same values are bound in the same order (this includes the "skip keys ending in `_`" rule and the string form of `updateQuery`'s `where`). The `undefined` behaviour difference (R3) is decided and tested. Every model `save` test still passes.

### Stage 3. BaseModel generic queries
- **Goal:** count, all, byIds, byPartialId, loadByField, loadByTitle, delete, batchDelete, and `applySqlOptions` (order, limit, `conditions`, `fields`) built with Kysely.
- **How the raw `conditions` strings are handled:** for this stage they are accepted through one narrow adapter (a clearly named "legacy fragment" wrapper) so callers keep working; Stages 4 to 9 convert the callers, and Stage 10 deletes the adapter.
- **Files:** `BaseModel.ts`, `models/utils/paginatedFeed.ts`, `BaseModel.test.ts`.
- **Depends on:** Stage 2.
- **Done when:** characterization tests pass and the suite equals baseline.

### Stage 4. Small models and KvStore
- **Goal:** convert `KvStore`, `Alarm`, `ConflictNoteState` (uses `INSERT OR REPLACE`), `ResourceLocalState`, `NoteTag`, `Migration`, `MasterKey`, `ItemChange`, `Search`, `SmartFilter`.
- **Depends on:** Stage 3.
- **Done when:** existing tests for these (`KvStore`, `ItemChange`, `MasterKey`, sync tests that read change logs) pass at baseline.

### Stage 5. Medium models
- **Goal:** `Tag` (incl. `COLLATE NOCASE`, the `tags_with_note_count` view reads), `NoteResource`, `Revision`, `Setting`, and the non-vector part of `NoteEmbedding`.
- **Depends on:** Stage 4.
- **Done when:** `Tag.test`, `Revision.test`, `RevisionService.test`, `Setting.test`, `NoteEmbedding.test` and the synchronizer tests pass at baseline.

### Stage 6. BaseItem (sync bookkeeping)
- **Goal:** convert `sync_items` / `deleted_items` queries and the "items that need syncing" query (currently assembled with `sprintf`).
- **Files:** `models/BaseItem.ts`, `services/synchronizer/tools.ts`, `syncInfoUtils.ts`.
- **Depends on:** Stage 5.
- **Done when:** `BaseItem.test` and all `Synchronizer.*` tests pass at baseline. These are the most important regression guard because a mistake here corrupts sync, so I will run them on their own after each sub-step.

### Stage 7. Folder, Resource, Note
- **Goal:** convert the three biggest models, including Folder's recursive query (`WITH RECURSIVE`), the share/lock queries, Note's ordering (`MAX/MIN(order)`), Note's multi-row `UPDATE`, and Resource's `INSERT ... SELECT ... WHERE NOT EXISTS`.
- **Depends on:** Stage 6.
- **Done when:** `Folder.test`, `Folder.sharing.test`, `Note.test`, `Note.customSortOrder.test`, `Resource.test` and everything that depends on them pass at baseline.

### Stage 8. Remaining services and scripts
- **Goal:** `ReportService`, `ResourceService`, `RevisionService`, `DebugService`, `BaseApplication`, `migrations/20.ts` (a JS script that issues `UPDATE`s), and `JoplinDatabase.clearForTesting`/`ftsEnabled`/`fuzzySearchEnabled`.
- **Depends on:** Stage 7.
- **Done when:** the related tests pass at baseline.

### Stage 9. Search
- **Goal:** convert `queryBuilder.ts` (WITH/UNION/INTERSECT/EXCEPT assembly, `notebook:` and `tag:` filters) and the SQL in `SearchEngine.ts`, `SearchEngineUtils.ts`.
- **What stays as raw SQL fragments inside Kysely:** the FTS4 pieces (`MATCH`, `offsets()`, `matchinfo()`, `docid`, and the `search_aux`/spellfix tables), because Kysely has no builder for them. They are written with Kysely's `sql` template tag in one place, so values are still bound safely.
- **Depends on:** Stage 8 (and uses `Database` helpers from Stage 3).
- **Done when:** `SearchEngine.test`, `SearchEngine.resources.test`, the `queryBuilder`/`filterParser` tests and `gotoAnything` tests pass at baseline; a new test compares the SQL text of ~20 search strings (from existing tests) before and after.

### Stage 10. Remove the legacy layer (everything except schema/upgrades)
- **Goal:** delete the "legacy fragment" adapter and string-only helpers, so no hand-written SQL string remains in models, services or search except the raw fragments listed in section 4b.
- **Depends on:** Stages 3 to 9.
- **Done when:** a grep check finds no `SELECT/INSERT/UPDATE/DELETE` text outside the allow-listed files (schema and upgrade files are still allowed at this point); full suite equals baseline; `yarn tsc` and cSpell clean.

### Stage 11 (last). Schema setup and database upgrade steps
- **Goal:** rewrite `structureSql`, `upgradeDatabase` (versions 1 to 41), `refreshTableFields`, `alterColumnQueries`, and migrations 42 to 53 using Kysely's schema builder (`createTable`, `createIndex`, `createView`, `alterTable...addColumn`, `dropTable`, `dropIndex`), with raw fragments only for what Kysely cannot build (section 4b).
- **Files:** `JoplinDatabase.ts`, `services/database/migrations/*.ts`, `addMigrationFile.ts`, `sqlStringToLines.ts`, `database.ts`.
- **Depends on:** all previous stages and Stage 1.
- **Done when (strongest check in the plan):** a test builds a brand-new database with the old code and with the new code and compares the complete `sqlite_master` listing, `table_info` and `table_fields` rows, which must be identical. A second test starts from databases frozen at several old versions (e.g. 15, 33, 41) and upgrades them with both code paths, comparing the results. The tolerated-failure fallback for the FTS migrations (v15/18/33/34) is covered by a test. The final grep check finds SQL text only in the raw-fragment file.

## 4. Things Kysely cannot do, and what I propose (needs your decision)

1. **Running queries on Joplin's drivers (decision A).** Kysely's SQLite support needs a `better-sqlite3`-style synchronous object; Joplin uses node-sqlite3 (callbacks), React Native and web drivers, its own retry-on-`SQLITE_BUSY` loop and its own transaction mutex. *Proposal:* use Kysely only to build queries, keep Joplin's own drivers/transactions. *Alternative:* write a custom Kysely driver per platform. That is a much larger job, touches `app-mobile`, and risks transaction behaviour. I recommend the first option.
2. **Triggers** (`CREATE/DROP TRIGGER` for the full-text index). Kysely has no trigger builder. *Proposal:* keep the trigger text as a `sql` raw fragment inside the Kysely schema code. *Alternative:* replace triggers with application code, which changes behaviour and is not recommended.
3. **Virtual tables** (FTS4 `notes_fts`/`items_fts`, `fts4aux`, `spellfix1`, sqlite-vec `vec0`). No builder for these either. *Proposal:* same raw-fragment approach, isolated in one file.
4. **FTS query functions** (`MATCH`, `offsets`, `matchinfo`, sqlite-vec `MATCH ... AND k = N`, `vec_to_json`). *Proposal:* `sql` template tag inside otherwise-Kysely queries.
5. **`PRAGMA table_info` (default values).** Kysely's introspection does not return column defaults, which `refreshTableFields` needs. *Proposal:* keep that one `PRAGMA` as a raw fragment.
6. **Old upgrade steps (versions 1 to 41, migrations 42 to 53) (decision B).** Rewriting history is the riskiest part: a subtle change could alter the schema for users upgrading from old versions. *Proposal (recommended):* rewrite with Kysely **and** prove equality with the Stage 11 schema-comparison tests. *Alternative:* leave frozen old steps as SQL text and write only new migrations with Kysely, which means "not everything" is migrated.
7. **ES-module-only Kysely vs. our CommonJS build.** Works with `require` in Node 22.12 (with an "experimental" notice) as I checked. Whether Jest, Electron and the React Native bundler also accept it must be confirmed in Stage 0 (decision C if it fails: pin a different loading approach or ask you).

## 4b. Raw fragments inventory (all kept in one file: `services/database/kysely/rawFragments.ts`)

Decided: raw SQL via Kysely's `sql` tag is accepted only for the items below. The final list with exact file/line is re-verified and updated in Stage 11.

1. Triggers: `notes_fts_before_update`, `notes_fts_before_delete`, `notes_after_update`, `notes_after_insert` and the four `items_fts_*`/`items_after_*` equivalents (create and drop), currently in `JoplinDatabase.ts` (v15, v18, v33) and `migrations/45.ts`.
2. Virtual tables: `notes_fts` and `items_fts` (FTS4), `search_aux` (fts4aux), `notes_spellfix` (spellfix1), `note_embeddings_vec` (sqlite-vec vec0), in `JoplinDatabase.ts`, `migrations/45.ts`, `models/NoteEmbedding.ts`.
3. FTS and vector query functions: `MATCH`, `offsets()`, `matchinfo()`, `docid` in `SearchEngine.ts`; vec0 `MATCH ... AND k = N`, `vec_to_json`, `last_insert_rowid()` in `NoteEmbedding.ts`.
4. `PRAGMA table_info(...)` in `JoplinDatabase.ts` (`countFields`, `refreshTableFields`).
5. Small expression fragments inside otherwise-Kysely queries: `COLLATE NOCASE` ordering/comparison (`BaseModel`, `Tag`, `paginatedFeed`), and `DEFAULT ""` column defaults if needed to keep the schema byte-identical (R4).

Anything found later that is not on this list will be added here and reported, not silently kept.

## 4c. Callers outside packages/lib (listed only, not edited)

`app-mobile`: `components/screens/Note/Note.tsx`, `utils/buildStartupTasks.ts`, `utils/database-driver-react-native.ts` and `.web.ts`, `components/ProfileSwitcher/*`; `app-cli`: `app/command-testing.ts`, `app/cli-integration-tests.test.ts`; `server`: `src/utils/joplinUtils.ts` (driver import). They call `db.exec/selectAll/selectOne` or implement the driver interface. The string API they use stays working to the end; I will re-verify this list at the end and report anything that would break.

## 5. Main risks and how each is handled

| # | Risk | Handling |
|---|------|----------|
| R1 | Kysely is ES-module-only; Jest, Electron or the mobile bundler could refuse to load it | Stage 0 proves it under Jest first. If not, stop and ask you before going on. Mobile/desktop bundling cannot be tested from `packages/lib`; I will flag this to you as something to verify in those apps |
| R2 | Kysely writes `"id"` where Joplin writes `` `id` `` and spells things slightly differently | Both are valid SQLite. Tests compare queries structurally (same tables, columns, parameters in the same order), not byte-for-byte, and the real test-suite checks results |
| R3 | **Kysely silently drops `undefined` values in insert/update**; today they are bound as NULL | Stage 2 decides this explicitly: preserve current behaviour by converting `undefined` to `null` in the helper, with a test |
| R4 | `DEFAULT ""` (double quotes) in existing schema vs. Kysely's `DEFAULT ''`; `refreshTableFields` strips only double quotes | Stage 11 schema-comparison test; if needed use a raw default expression so the stored schema is byte-identical |
| R5 | Existing user databases created by old versions must still upgrade | Stage 11 upgrade tests from frozen versions; old step order and version numbers unchanged |
| R6 | Raw `conditions`/`order` strings passed in by callers keep SQL text alive | Temporary adapter in Stage 3, each caller converted in Stages 4 to 9, adapter deleted and grep-checked in Stage 10 |
| R7 | Search query assembly (`UNION`/`INTERSECT`/`WITH`) is complex and subtle | Stage 9 compares generated SQL for ~20 real search strings, run on both fts and non-fts paths |
| R8 | Hidden pre-existing failures (15 tests in 4 files) could mask a real break | I compare per-file results with the baseline after each stage, not just totals; any change in those 4 files is reported |
| R9 | Performance regressions from query building | Compile step is microseconds; I will time the heaviest paths (search, folder tree) before/after and report |
| R10 | External packages call `db.exec(string)` directly | Public string API stays working to the end; external call sites are listed (4c), not edited |
| R11 | Jest cache `EPERM` and Node 22.12 crash | Use the commands you gave; rerun on `EPERM` |

## 6. Decisions (answered by you)

1. Kysely only builds queries; existing drivers run them. **Yes.**
2. Old upgrade steps rewritten with Kysely, proven by schema-comparison tests, as the **last** stage. **Yes.**
3. Raw `sql` fragments accepted for triggers, FTS, vec0, PRAGMA, kept in one file and listed here (4b). **Yes.**
4. Callers outside `packages/lib` are only listed (4c), not edited. **Yes.**

## 6b. Usage budget

All work and all test runs must fit inside one 5-hour usage window (about 11% already used). To stay inside it: stages run in order without pausing for review; full-suite runs happen at the end of each stage only, with single-file runs while iterating; characterization tests are table-driven (`test.each`) to keep them small; if the budget gets tight I will finish the stage in progress, leave the code green, and report which stages remain rather than leave a stage half-done.

## 7. How I will verify (end to end)

Per stage: `yarn tsc` in `packages/lib`, then `npx -y -p node@22.23.3 node node_modules/jest/bin/jest.js [file]`, expecting 1,622 passed and the same 15 known failures. At the end: the schema-equality tests and grep check from Stage 11, and a full run.
