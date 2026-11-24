import 'reflect-metadata';
import * as path from 'path';
import { DataSource, QueryRunner } from 'typeorm';

/**
 * Base de pruebas compartida por las suites de integración.
 *
 * - Se activa con TEST_DATABASE_URL y se niega a correr si el nombre de la base no
 *   contiene «test», porque borra y recrea el esquema.
 * - Jest corre cada archivo en su propio proceso, y todos usan la misma base: antes
 *   de recrear el esquema se toma un bloqueo de PostgreSQL (advisory lock) que se
 *   libera al cerrar, así los archivos se turnan en lugar de pisarse.
 */
const LOCK_KEY = 7203041;

export const testDbUrl = process.env.TEST_DATABASE_URL;
const dbName = testDbUrl ? new URL(testDbUrl).pathname.replace('/', '') : '';
export const testDbEnabled = !!testDbUrl && dbName.includes('test');
if (testDbUrl && !testDbEnabled) console.warn(`Pruebas de integración omitidas: la base «${dbName}» no parece de pruebas (debe contener «test»).`);

export interface TestDb {
  ds: DataSource;
  close: () => Promise<void>;
}

export async function openTestDb(): Promise<TestDb> {
  // Conexión aparte que solo sostiene el bloqueo mientras dura la suite.
  const locker = new DataSource({ type: 'postgres', url: testDbUrl, entities: [] });
  await locker.initialize();
  const lockRunner: QueryRunner = locker.createQueryRunner();
  await lockRunner.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);

  const ds = new DataSource({
    type: 'postgres',
    url: testDbUrl,
    entities: [path.join(__dirname, '..', '..', '**', '*.entity.{ts,js}')],
    synchronize: true,
    dropSchema: true,
  });
  await ds.initialize();

  return {
    ds,
    close: async () => {
      await ds.destroy().catch(() => undefined);
      await lockRunner.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]).catch(() => undefined);
      await lockRunner.release().catch(() => undefined);
      await locker.destroy().catch(() => undefined);
    },
  };
}
