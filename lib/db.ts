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
          trend_data JSONB,
          trend_fetched_at TIMESTAMPTZ,
          trend_basis_volume BIGINT,
          blog_total BIGINT,
          blog_posts_per_day NUMERIC(12,4),
          blog_sample_days INTEGER,
          blog_sample_size INTEGER,
          blog_fetched_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        ALTER TABLE keywords ADD COLUMN IF NOT EXISTS trend_data JSONB;
        ALTER TABLE keywords ADD COLUMN IF NOT EXISTS trend_fetched_at TIMESTAMPTZ;
        ALTER TABLE keywords ADD COLUMN IF NOT EXISTS trend_basis_volume BIGINT;
        ALTER TABLE keywords ADD COLUMN IF NOT EXISTS blog_total BIGINT;
        ALTER TABLE keywords ADD COLUMN IF NOT EXISTS blog_posts_per_day NUMERIC(12,4);
        ALTER TABLE keywords ADD COLUMN IF NOT EXISTS blog_sample_days INTEGER;
        ALTER TABLE keywords ADD COLUMN IF NOT EXISTS blog_sample_size INTEGER;
        ALTER TABLE keywords ADD COLUMN IF NOT EXISTS blog_fetched_at TIMESTAMPTZ;

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

        CREATE TABLE IF NOT EXISTS trend_api_daily_usage (
          usage_day DATE PRIMARY KEY,
          call_count INTEGER NOT NULL DEFAULT 0,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS blog_api_daily_usage (
          usage_day DATE PRIMARY KEY,
          call_count INTEGER NOT NULL DEFAULT 0,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS shopping_api_daily_usage (
          usage_day DATE PRIMARY KEY,
          call_count INTEGER NOT NULL DEFAULT 0,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS shopping_insights (
          id BIGSERIAL PRIMARY KEY,
          keyword_id BIGINT NOT NULL REFERENCES keywords(id) ON DELETE CASCADE,
          category_code TEXT NOT NULL,
          category_name TEXT NOT NULL,
          trend_data JSONB,
          device_data JSONB,
          age_data JSONB,
          fetched_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE(keyword_id, category_code)
        );

        CREATE INDEX IF NOT EXISTS idx_shopping_insights_keyword_category
          ON shopping_insights(keyword_id, category_code);
        CREATE INDEX IF NOT EXISTS idx_shopping_insights_fetched_at
          ON shopping_insights(fetched_at DESC);

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
