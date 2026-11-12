/**
 * Backfill de first touch / last touch en `clients` a partir de `ad_events`.
 *
 * - Solo toca contactos con `first_touch_at IS NULL` que tengan al menos un
 *   ad_event ligado (record_id). Es idempotente: una segunda corrida no cambia nada.
 * - No modifica `ad_touchpoints` (esos contadores ya se acumularon en su momento).
 * - Por defecto es una SIMULACIÓN (no escribe). Usa --apply para ejecutar.
 *
 * Prerrequisito: arrancar la app una vez para que TypeORM synchronize cree las
 * columnas nuevas de `clients`.
 *
 * Uso (desde /backend):
 *   npx ts-node -r tsconfig-paths/register src/conversions/backfill-touches.script.ts
 *   npx ts-node -r tsconfig-paths/register src/conversions/backfill-touches.script.ts --tenant=<uuid>
 *   npx ts-node -r tsconfig-paths/register src/conversions/backfill-touches.script.ts --apply
 */
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config();

const REQUIRED_COLUMNS = [
  'first_ad_event_id', 'first_touch_platform', 'first_touch_medium', 'first_touch_campaign',
  'first_touch_content', 'first_touch_term', 'first_touch_click_id', 'first_touch_landing_page',
  'first_touch_referrer', 'first_touch_at',
  'last_ad_event_id', 'last_touch_platform', 'last_touch_medium', 'last_touch_campaign',
  'last_touch_content', 'last_touch_term', 'last_touch_click_id', 'last_touch_landing_page',
  'last_touch_referrer', 'last_touch_at',
];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function run() {
  const apply = process.argv.includes('--apply');
  const tenantArg = process.argv.find((a) => a.startsWith('--tenant='))?.split('=')[1];
  if (tenantArg && !UUID_RE.test(tenantArg)) {
    console.error('❌ --tenant debe ser un UUID válido.');
    process.exit(1);
  }
  const tenantParams = tenantArg ? [tenantArg] : [];
  const tenantFilter = tenantArg ? 'AND tenant_id = $1' : '';
  const tenantFilterClients = tenantArg ? 'AND c.tenant_id = $1' : '';

  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'smarter',
  });

  await dataSource.initialize();
  // Solo host y base, nunca credenciales.
  console.log(`✅ Conectado a ${process.env.DB_HOST || 'localhost'} / ${process.env.DB_NAME || 'smarter'}`);
  console.log(apply ? '⚠️  Modo APPLY: se escribirán datos.' : 'ℹ️  Modo SIMULACIÓN: no se escribe nada (usa --apply para ejecutar).');
  if (tenantArg) console.log(`   Limitado al tenant ${tenantArg}`);

  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();

  try {
    // 1) Verificar que las columnas nuevas existen
    const cols: { column_name: string }[] = await queryRunner.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'clients'`,
    );
    const existing = new Set(cols.map((c) => c.column_name));
    const missing = REQUIRED_COLUMNS.filter((c) => !existing.has(c));
    if (missing.length > 0) {
      console.error(`❌ Faltan columnas en clients: ${missing.join(', ')}`);
      console.error('   Arranca la app una vez para que TypeORM synchronize las cree y vuelve a ejecutar.');
      process.exit(1);
    }

    // 2) Contactos elegibles
    const eligible: { platform: string; total: string }[] = await queryRunner.query(
      `SELECT f.platform, COUNT(*)::text AS total
       FROM clients c
       JOIN LATERAL (
         SELECT platform FROM ad_events
         WHERE record_id = c.id ${tenantFilter}
         ORDER BY created_at ASC LIMIT 1
       ) f ON true
       WHERE c.first_touch_at IS NULL ${tenantFilterClients}
       GROUP BY f.platform
       ORDER BY COUNT(*) DESC`,
      tenantParams,
    );
    const totalEligible = eligible.reduce((s, r) => s + parseInt(r.total, 10), 0);
    console.log(`\nContactos a completar: ${totalEligible}`);
    eligible.forEach((r) => console.log(`  - primer toque ${r.platform}: ${r.total}`));

    if (totalEligible === 0) {
      console.log('✅ Nada que hacer.');
      return;
    }
    if (!apply) {
      console.log('\nSimulación terminada. Ejecuta con --apply para escribir.');
      return;
    }

    // 3) Escritura en una transacción
    await queryRunner.startTransaction();
    try {
      const result = await queryRunner.query(
        `WITH first_ev AS (
           SELECT DISTINCT ON (record_id)
             record_id, id, platform, utm_medium, utm_campaign, utm_content, utm_term,
             click_id, landing_page, referrer, created_at
           FROM ad_events
           WHERE record_id IS NOT NULL ${tenantFilter}
           ORDER BY record_id, created_at ASC
         ), last_ev AS (
           SELECT DISTINCT ON (record_id)
             record_id, id, platform, utm_medium, utm_campaign, utm_content, utm_term,
             click_id, landing_page, referrer, created_at
           FROM ad_events
           WHERE record_id IS NOT NULL ${tenantFilter}
           ORDER BY record_id, created_at DESC
         )
         UPDATE clients c SET
           has_ad_tracking = true,
           ad_first_platform = COALESCE(c.ad_first_platform, f.platform),
           ad_last_platform = COALESCE(c.ad_last_platform, l.platform),

           first_ad_event_id = f.id,
           first_touch_platform = f.platform,
           first_touch_medium = f.utm_medium,
           first_touch_campaign = f.utm_campaign,
           first_touch_content = f.utm_content,
           first_touch_term = f.utm_term,
           first_touch_click_id = f.click_id,
           first_touch_landing_page = f.landing_page,
           first_touch_referrer = f.referrer,
           first_touch_at = f.created_at,

           last_ad_event_id = l.id,
           last_touch_platform = l.platform,
           last_touch_medium = l.utm_medium,
           last_touch_campaign = l.utm_campaign,
           last_touch_content = l.utm_content,
           last_touch_term = l.utm_term,
           last_touch_click_id = l.click_id,
           last_touch_landing_page = l.landing_page,
           last_touch_referrer = l.referrer,
           last_touch_at = l.created_at
         FROM first_ev f
         JOIN last_ev l ON l.record_id = f.record_id
         WHERE c.id = f.record_id
           AND c.first_touch_at IS NULL ${tenantFilterClients}`,
        tenantParams,
      );
      await queryRunner.commitTransaction();
      // pg devuelve [rows, rowCount] en UPDATE sin RETURNING
      const updated = Array.isArray(result) ? result[1] : result;
      console.log(`\n✅ Contactos actualizados: ${updated}`);
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    }
  } finally {
    await queryRunner.release();
    await dataSource.destroy();
  }
}

run().catch((err) => {
  console.error('❌ Error en el backfill:', err?.message || err);
  process.exit(1);
});
