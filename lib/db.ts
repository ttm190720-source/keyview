import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __keyviewPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var __keyviewSchemaReady: Promise<void> | undefined;
}

function getPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not configured");

  if (!global.__keyviewPool) {
    global.__keyviewPool = new Pool({ connectionString, max: 8 });
  }
  return global.__keyviewPool;
}

export async function ensureSchema() {
  if (!global.__keyviewSchemaReady) {
    global.__keyviewSchemaReady = (async () => {
      const db = getPool();
      await db.query(`
        CREATE TABLE IF NOT EXISTS keywords (
          id BIGSERIAL PRIMARY KEY,
          normalized_keyword TEXT NOT NULL UNIQUE,
          display_keyword TEXT NOT NULL,
          monthly_pc BIGINT,
          monthly_mobile BIGINT,
          pc_low BOOLEAN NOT NULL DEFAULT FALSE,
          mobile_low BOOLEAN NOT NULL DEFAULT FALSE,
          volume_fetched_at TIMESTAMPTZ,
          relations_fetched_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS keyword_relations (
          parent_keyword_id BIGINT NOT NULL REFERENCES keywords(id) ON DELETE CASCADE,
          child_keyword_id BIGINT NOT NULL REFERENCES keywords(id) ON DELETE CASCADE,
          rank INTEGER NOT NULL,
          fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (parent_keyword_id, child_keyword_id)
        );

        CREATE TABLE IF NOT EXISTS search_events (
          id BIGSERIAL PRIMARY KEY,
          keyword_id BIGINT NOT NULL REFERENCES keywords(id) ON DELETE CASCADE,
          searched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS api_call_events (
          id BIGSERIAL PRIMARY KEY,
          normalized_keyword TEXT NOT NULL,
          status TEXT NOT NULL,
          requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_keyword_relations_parent_rank
          ON keyword_relations(parent_keyword_id, rank);
        CREATE INDEX IF NOT EXISTS idx_search_events_searched_at
          ON search_events(searched_at DESC);
        CREATE INDEX IF NOT EXISTS idx_search_events_keyword
          ON search_events(keyword_id, searched_at DESC);
        CREATE INDEX IF NOT EXISTS idx_api_call_events_requested_at
          ON api_call_events(requested_at DESC);
      `);
    })().catch((error) => {
      global.__keyviewSchemaReady = undefined;
      throw error;
    });
  }
  return global.__keyviewSchemaReady;
}

export async function query<T = Record<string, unknown>>(text: string, params: unknown[] = []) {
  await ensureSchema();
  const result = await getPool().query(text, params);
  return result.rows as T[];
}

export async function withClient<T>(fn: (client: import("pg").PoolClient) => Promise<T>) {
  await ensureSchema();
  const client = await getPool().connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}
