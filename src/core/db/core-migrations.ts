import type { Migration } from '@/core/db/migrations';

export const CORE_MIGRATIONS: Migration[] = [
  {
    id: 'core:001',
    up: `
      CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE plugin_state (id TEXT PRIMARY KEY, enabled INTEGER NOT NULL);
    `,
  },
  {
    id: 'core:002',
    up: `
      CREATE TABLE media (id TEXT PRIMARY KEY, mime TEXT NOT NULL, width INTEGER NOT NULL, height INTEGER NOT NULL, pending INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL);
    `,
  },
];
