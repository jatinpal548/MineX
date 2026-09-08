/**
 * Local SQLite database for offline inspection capture (Milestone 2B-2).
 *
 * Design: this is NOT a mirror of Supabase. It only holds work that is not yet
 * confirmed on the server:
 *
 *   records     - one row per unsynced domain object (inspection / item /
 *                 observation / evidence). `id` is the SAME UUID that will be
 *                 used server-side, so no local->server id mapping is needed.
 *   sync_queue  - ordered list of server calls still to make. Drained by the
 *                 sync engine (src/features/inspection/syncEngine.ts).
 *   meta        - db_version, auth_expired flag, last_sync_at.
 *
 * When everything for an inspection is synced, its rows are deleted - the
 * server becomes the single source of truth again.
 */
import * as SQLite from 'expo-sqlite';

const DB_NAME = 'coalguard-offline.db';
const SCHEMA_VERSION = 1;

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

const MIGRATIONS: Record<number, string> = {
  1: `
    CREATE TABLE IF NOT EXISTS records (
      kind          TEXT NOT NULL,
      id            TEXT NOT NULL,
      inspection_id TEXT NOT NULL,
      payload       TEXT NOT NULL,
      sync_state    TEXT NOT NULL DEFAULT 'local',
      updated_at    TEXT NOT NULL,
      PRIMARY KEY (kind, id)
    );
    CREATE INDEX IF NOT EXISTS idx_records_inspection ON records (inspection_id);

    CREATE TABLE IF NOT EXISTS sync_queue (
      seq           INTEGER PRIMARY KEY AUTOINCREMENT,
      op            TEXT NOT NULL,
      kind          TEXT NOT NULL,
      record_id     TEXT NOT NULL,
      inspection_id TEXT NOT NULL,
      args          TEXT NOT NULL,
      depends_on    TEXT,
      attempts      INTEGER NOT NULL DEFAULT 0,
      last_error    TEXT,
      status        TEXT NOT NULL DEFAULT 'pending',
      created_at    TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_queue_status ON sync_queue (status, seq);
    CREATE INDEX IF NOT EXISTS idx_queue_inspection ON sync_queue (inspection_id);

    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
  `,
};

async function migrate(db: SQLite.SQLiteDatabase): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let current = row?.user_version ?? 0;
  while (current < SCHEMA_VERSION) {
    const next = current + 1;
    const sql = MIGRATIONS[next];
    if (!sql) break;
    await db.withTransactionAsync(async () => {
      await db.execAsync(sql);
    });
    await db.execAsync(`PRAGMA user_version = ${next}`);
    current = next;
  }
}

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
      await migrate(db);
      return db;
    })();
  }
  return dbPromise;
}

/* ------------------------------- meta helpers ------------------------- */

export async function metaGet(key: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM meta WHERE key = ?',
    key,
  );
  return row?.value ?? null;
}

export async function metaSet(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    value,
  );
}
