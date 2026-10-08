import { SqlQuery } from '../types';
import { createIndexQuery, createTableQuery, primaryKey, required } from '../kysely/rawFragments/schema';

// Storage for the AI embeddings index. Two tables:
//
// - `note_embeddings_meta` holds the per-chunk metadata. It is a regular table
//   so the metadata (chunk text, source note ID, model identifier) can be
//   inspected and managed even on platforms where the sqlite-vec extension
//   isn't available.
//
// - `note_embeddings_vec` is the sqlite-vec virtual table holding the actual
//   vectors. It is created lazily by the embeddings code when sqlite-vec is
//   available, because virtual-table syntax differs by extension version and
//   trying to create it unconditionally would break startup on platforms
//   without the prebuilt.
//
// Neither table is synced — embeddings are large, model-specific, and easily
// re-derivable on demand.

export default (): (SqlQuery|string)[] => {
	return [
		createTableQuery('note_embeddings_meta', {
			id: primaryKey('INTEGER', true),
			note_id: required('TEXT'),
			chunk_index: required('INTEGER'),
			model_id: required('TEXT'),
			chunk_text: required('TEXT'),
			created_time: required('INT', 0),
		}, { ifNotExists: true }),
		createIndexQuery('note_embeddings_meta_note_id', 'note_embeddings_meta', ['note_id'], { ifNotExists: true }),
		createIndexQuery('note_embeddings_meta_note_chunk', 'note_embeddings_meta', ['note_id', 'chunk_index'], { unique: true, ifNotExists: true }),
	];
};
