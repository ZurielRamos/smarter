/**
 * Migration script: Move email templates from inbox.metadata.emailTemplates
 * to the new email_templates + email_template_translations tables.
 *
 * Run with: npx ts-node -r tsconfig-paths/register src/email-templates/migrate-email-templates.script.ts
 *
 * This script is idempotent — it skips inboxes that have already been migrated
 * (checks if metadata.emailTemplatesMigrated === true).
 */
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config();

interface LegacyEmailTemplate {
  id: string;
  name: string;
  subject: string;
  blocks: any[] | null;
  html: string;
  createdAt: string;
}

async function migrate() {
  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'smarter',
  });

  await dataSource.initialize();
  console.log('✅ Connected to database');

  const queryRunner = dataSource.createQueryRunner();

  try {
    // Ensure the target tables exist (synchronize should have created them)
    const tablesExist = await queryRunner.query(`
      SELECT
        (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name = 'email_templates') > 0 AS templates_exist,
        (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name = 'email_template_translations') > 0 AS translations_exist
    `);

    if (!tablesExist[0]?.templates_exist || !tablesExist[0]?.translations_exist) {
      console.error('❌ Target tables do not exist. Start the app first so TypeORM synchronize creates them.');
      process.exit(1);
    }

    // Fetch all inboxes that have emailTemplates in metadata
    const inboxes = await queryRunner.query(`
      SELECT id, tenant_id, metadata
      FROM inboxes
      WHERE metadata->'emailTemplates' IS NOT NULL
        AND jsonb_array_length(metadata->'emailTemplates') > 0
        AND (metadata->>'emailTemplatesMigrated') IS DISTINCT FROM 'true'
    `);

    console.log(`📋 Found ${inboxes.length} inbox(es) with email templates to migrate`);

    let totalTemplates = 0;

    for (const inbox of inboxes) {
      const templates: LegacyEmailTemplate[] = inbox.metadata.emailTemplates || [];

      if (templates.length === 0) continue;

      console.log(`\n📥 Inbox ${inbox.id} (tenant: ${inbox.tenant_id}) — ${templates.length} template(s)`);

      for (const legacy of templates) {
        // Insert into email_templates
        const [inserted] = await queryRunner.query(
          `INSERT INTO email_templates (id, tenant_id, inbox_id, name, default_language, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW())
           ON CONFLICT (id) DO NOTHING
           RETURNING id`,
          [
            legacy.id,
            inbox.tenant_id,
            inbox.id,
            legacy.name,
            'es', // default language
            legacy.createdAt ? new Date(legacy.createdAt) : new Date(),
          ],
        );

        if (!inserted) {
          console.log(`  ⏭️  Template "${legacy.name}" (${legacy.id}) already exists, skipping`);
          continue;
        }

        // Insert translation for the default language
        await queryRunner.query(
          `INSERT INTO email_template_translations (id, template_id, language, subject, blocks, html, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW(), NOW())
           ON CONFLICT (template_id, language) DO NOTHING`,
          [
            legacy.id,
            'es',
            legacy.subject || '',
            legacy.blocks ? JSON.stringify(legacy.blocks) : null,
            legacy.html || '',
          ],
        );

        console.log(`  ✅ Migrated: "${legacy.name}" (${legacy.id})`);
        totalTemplates++;
      }

      // Mark inbox as migrated (preserve existing metadata)
      await queryRunner.query(
        `UPDATE inboxes SET metadata = metadata || '{"emailTemplatesMigrated": true}'::jsonb WHERE id = $1`,
        [inbox.id],
      );
    }

    console.log(`\n🎉 Migration complete! Migrated ${totalTemplates} template(s) from ${inboxes.length} inbox(es)`);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await queryRunner.release();
    await dataSource.destroy();
  }
}

migrate();
