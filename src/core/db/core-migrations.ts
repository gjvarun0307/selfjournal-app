import type { Migration } from '@/core/db/migrations';

export const CORE_MIGRATIONS: Migration[] = [
  {
    id: 'core:001',
    up: `
      CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE plugin_state (id TEXT PRIMARY KEY, enabled INTEGER NOT NULL);
    `,
  },
];
