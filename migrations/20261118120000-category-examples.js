'use strict';

// Past category choices with their embeddings, for retrieval in the AI
// service (PLANS.md, Phase C). BE/ owns the migration; only the AI service
// reads or writes the table, with a role limited to it (see AI/README.md).
//
// The pgvector extension is optional. Where the server doesn't offer it, or
// this role may not enable it, the table is skipped and the AI service
// suggests without examples: a deploy never fails over this.
const EMBEDDING_DIMENSIONS = 384; // the AI service's embedding model

module.exports = {
  up: async (queryInterface) => {
    const { sequelize } = queryInterface;
    try {
      await sequelize.query('CREATE EXTENSION IF NOT EXISTS vector');
    } catch (error) {
      console.warn(`pgvector not enabled, skipping category_examples: ${error.message}`);
      return;
    }
    // The extension's schema differs by host (public locally, "extensions"
    // on Supabase), so the type is named in full.
    const [[type]] = await sequelize.query(
      `SELECT n.nspname AS schema FROM pg_type t
       JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = 'vector'`,
    );
    await sequelize.query(`
      CREATE TABLE category_examples (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid,
        kind text NOT NULL,
        source text NOT NULL,
        text text NOT NULL,
        category text NOT NULL,
        embedding "${type.schema}".vector(${EMBEDDING_DIMENSIONS}) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )`);
    // One row per choice; user_id is null for the single local user.
    await sequelize.query(`
      CREATE UNIQUE INDEX category_examples_user_kind_source
      ON category_examples (user_id, kind, source) NULLS NOT DISTINCT`);
    // No vector index: a user has a few thousand rows at most, and an exact
    // scan of those is fast and always returns the true nearest.
  },

  down: async (queryInterface) => {
    await queryInterface.sequelize.query('DROP TABLE IF EXISTS category_examples');
  },
};
