# Parallel execution plan for MIGRATION_PLAN.md

Only the lead runs `yarn tsc` and Jest. Helpers type-check with `npx tsc --noEmit -p tsconfig.json` in packages/lib. A file is owned by exactly one agent per wave; shared changes are requested from the lead and made between waves.

## Dependencies

- Stages 0 to 3 change shared code (`database.ts`, `BaseModel.ts`, Kysely helpers), so they run first, done by the lead.
- Stages 4 to 9 only depend on the foundation: public method names and return shapes do not change, so they touch disjoint files and can run in parallel.
- Stage 11 (schema and upgrades) only needs the Kysely helpers and the golden schema snapshot, and owns different files (`JoplinDatabase.ts`, `migrations/*`), so it runs in the same wave.
- Stage 10 (remove the legacy layer) needs everything else, so it runs last, done by the lead.

## Wave 0: foundation (lead, no helpers)

Stages 0, 1, 2, 3. Files: `services/database/kysely/*` (index, tables, tests), `database.ts`, `database.test.ts`, `BaseModel.ts`, `BaseModel.test.ts`, `models/utils/paginatedFeed.ts`, `jest.config.js`, `jestEsmTransform.js`, `tests/support/schemaGolden/schemaGolden.json` (golden schema dumps from the old code at every version 1 to 53).
Gate: `yarn tsc` and full test suite at baseline (1,622 passed / 15 failed in the same 4 files).

## Wave 1: parallel helpers

| Helper | Stages | Files owned |
|---|---|---|
| H1 | 4 + 5 | `services/KvStore.ts`, `models/{Alarm,ConflictNoteState,ResourceLocalState,NoteTag,Migration,MasterKey,ItemChange,Search,SmartFilter,Tag,NoteResource,Revision,Setting,NoteEmbedding}.ts`, `services/database/kysely/rawFragments/vector.ts` |
| H2 | 6 | `models/BaseItem.ts`, `services/synchronizer/tools.ts`, `services/synchronizer/syncInfoUtils.ts` |
| H3 | 7 | `models/Folder.ts`, `models/Resource.ts`, `models/Note.ts` |
| H4 | 8 | `services/ReportService.ts`, `services/ResourceService.ts`, `services/RevisionService.ts`, `services/debug/DebugService.ts`, `BaseApplication.ts`, `services/rest/routes/search.ts` and any other non-model, non-search, non-schema file with SQL text found by grep |
| H5 | 9 | `services/search/*` (queryBuilder, SearchEngine, SearchEngineUtils), `services/database/kysely/rawFragments/search.ts` |
| H6 | 11 | `JoplinDatabase.ts` (schema, upgrade ladder, `refreshTableFields`, `clearForTesting`, `ftsEnabled`, `fuzzySearchEnabled`), `services/database/migrations/*.ts`, `services/database/addMigrationFile.ts`, `services/database/sqlStringToLines.ts`, `services/database/kysely/rawFragments/schema.ts`, new schema-comparison test |

The lead owns everything not listed, including `database.ts`, `BaseModel.ts`, `kysely/index.ts`, `kysely/tables.ts` and `kysely/rawFragments/index.ts`.

Gate after wave 1: `yarn tsc`, then `--findRelatedTests` for all changed files, plus the schema-comparison test. Failures are fixed or reassigned before wave 2.

## Wave 2: legacy removal and verification (lead)

Stage 10: delete the legacy string adapter in `BaseModel` where no caller needs it, grep check for SQL text outside the approved raw fragments, then the full suite, `yarn linter-ci` and `yarn spellcheck` on all changed and new files, `yarn updateIgnored` for new TS files.
