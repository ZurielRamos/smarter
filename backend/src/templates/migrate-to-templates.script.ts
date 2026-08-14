/**
 * Migration script: Move data from email_templates + email_template_translations
 * to the new generic templates + template_translations tables.
 *
 * Run with: npx ts-node -r tsconfig-paths/register src/templates/migrate-to-templates.script.ts
 *
 * Prerequisites: Start the app first so TypeORM synchronize creates the new tables.
 * This script is idempotent.
 */
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config();

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
    // Verify new tables exist
    const newTablesExist = await queryRunner.query(`
      SELECT
        (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name = 'templates') > 0 AS t_exist,
        (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name = 'template_translations') > 0 AS tt_exist
    `);

    if (!newTablesExist[0]?.t_exist || !newTablesExist[0]?.tt_exist) {
      console.error('❌ New tables (templates, template_translations) do not exist.');
      console.error('   Start the app first so TypeORM synchronize creates them.');
      process.exit(1);
    }

    // Check if old tables exist
    const oldTablesExist = await queryRunner.query(`
      SELECT
        (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name = 'email_templates') > 0 AS et_exist,
        (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name = 'email_template_translations') > 0 AS ett_exist
    `);

    if (!oldTablesExist[0]?.et_exist) {
      console.log('ℹ️  Old email_templates table does not exist. Nothing to migrate.');
      await dataSource.destroy();
      return;
    }

    // Migrate email_templates → templates
    const emailTemplates = await queryRunner.query(`
      SELECT id, tenant_id, name, default_language, created_at, updated_at
      FROM email_templates
    `);

    console.log(`📋 Found ${emailTemplates.length} email template(s) to migrate`);

    let migratedTemplates = 0;
    let migratedTranslations = 0;

    for (const et of emailTemplates) {
      // Check if already migrated (by id)
      const existing = await queryRunner.query(`SELECT id FROM templates WHERE id = $1`, [et.id]);
      if (existing.length > 0) {
        console.log(`  ⏭️  "${et.name}" (${et.id}) already exists in templates, skipping`);
        continue;
      }

      // Insert into templates with channel = 'email'
      await queryRunner.query(
        `INSERT INTO templates (id, tenant_id, name, channel, default_language, created_at, updated_at)
         VALUES ($1, $2, $3, 'email', $4, $5, $6)`,
        [et.id, et.tenant_id, et.name, et.default_language, et.created_at, et.updated_at],
      );
      migratedTemplates++;

      // Migrate translations
      const translations = await queryRunner.query(
        `SELECT id, template_id, language, subject, blocks, html, created_at, updated_at
         FROM email_template_translations
         WHERE template_id = $1`,
        [et.id],
      );

      for (const tt of translations) {
        const existingTT = await queryRunner.query(
          `SELECT id FROM template_translations WHERE template_id = $1 AND language = $2`,
          [tt.template_id, tt.language],
        );
        if (existingTT.length > 0) continue;

        await queryRunner.query(
          `INSERT INTO template_translations (id, template_id, language, subject, blocks, html, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [tt.id, tt.template_id, tt.language, tt.subject, JSON.stringify(tt.blocks), tt.html, tt.created_at, tt.updated_at],
        );
        migratedTranslations++;
      }

      console.log(`  ✅ Migrated: "${et.name}" (${et.id}) with ${translations.length} translation(s)`);
    }

    console.log(`\n🎉 Migration complete! Migrated ${migratedTemplates} template(s) and ${migratedTranslations} translation(s)`);
    console.log(`\nℹ️  Old tables (email_templates, email_template_translations) are preserved.`);
    console.log(`   You can DROP them manually once verified.`);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await queryRunner.release();
    await dataSource.destroy();
  }
}

migrate();
