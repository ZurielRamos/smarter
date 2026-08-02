import { DataSource } from 'typeorm';

/**
 * Crea índices funcionales para búsquedas case-insensitive eficientes.
 * Ejecutar una vez manualmente o en el onModuleInit del ETL.
 */
export async function createEtlIndexes(dataSource: DataSource): Promise<void> {
  const queryRunner = dataSource.createQueryRunner();
  try {
    // Índice funcional para phone (LOWER TRIM) por tenant
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_clients_tenant_phone_lower
      ON clients (tenant_id, LOWER(TRIM(phone)))
      WHERE phone IS NOT NULL
    `);

    // Índice funcional para email (LOWER TRIM) por tenant
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_clients_tenant_email_lower
      ON clients (tenant_id, LOWER(TRIM(email)))
      WHERE email IS NOT NULL
    `);

    // Índice funcional para document_number por tenant
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_clients_tenant_docnum_lower
      ON clients (tenant_id, LOWER(TRIM(document_number)))
      WHERE document_number IS NOT NULL
    `);

    // Índice funcional para full_name por tenant
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_clients_tenant_fullname_lower
      ON clients (tenant_id, LOWER(TRIM(full_name)))
      WHERE full_name IS NOT NULL
    `);

    // Índice funcional para first_name por tenant
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_clients_tenant_firstname_lower
      ON clients (tenant_id, LOWER(TRIM(first_name)))
      WHERE first_name IS NOT NULL
    `);

    // Índice GIN para búsquedas en custom_data
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_clients_custom_data_gin
      ON clients USING GIN (custom_data jsonb_path_ops)
      WHERE custom_data IS NOT NULL
    `);
  } finally {
    await queryRunner.release();
  }
}
