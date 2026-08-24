import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { formalizeTenantRoles } from './001-formalize-tenant-roles.migration';
import { addBotMediaHandling } from './002-add-bot-media-handling.migration';
import { addBotTypeAndFlow } from './003-add-bot-type-and-flow.migration';

dotenv.config();

/**
 * Runner de migraciones.
 * Ejecutar con: npx ts-node -r tsconfig-paths/register src/migrations/run-migration.ts
 */
async function run() {
  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'supergiros',
  });

  await dataSource.initialize();
  console.log('[Runner] Conexión a base de datos establecida');

  try {
    await formalizeTenantRoles(dataSource);
    await addBotMediaHandling(dataSource);
    await addBotTypeAndFlow(dataSource);
  } finally {
    await dataSource.destroy();
    console.log('[Runner] Conexión cerrada');
  }
}

run().catch((err) => {
  console.error('[Runner] Error fatal:', err);
  process.exit(1);
});
