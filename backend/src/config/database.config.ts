import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';

export const getDatabaseConfig = (
  configService: ConfigService,
): TypeOrmModuleOptions => ({
  type: 'postgres',
  host: configService.get<string>('DB_HOST', 'localhost'),
  port: configService.get<number>('DB_PORT', 5432),
  username: configService.get<string>('DB_USERNAME', 'postgres'),
  password: configService.get<string>('DB_PASSWORD', 'postgres'),
  database: configService.get<string>('DB_NAME', 'supergiros'),
  autoLoadEntities: true,
  synchronize: true, // Solo para desarrollo
  // Connection pool tuning for high-concurrency ETL workloads
  extra: {
    max: configService.get<number>('DB_POOL_MAX', 20),       // Max connections in pool
    min: configService.get<number>('DB_POOL_MIN', 5),        // Min idle connections
    idleTimeoutMillis: 30000,                                 // Close idle connections after 30s
    connectionTimeoutMillis: 5000,                            // Connection timeout
    statement_timeout: 120000,                                // Kill queries after 2 min
  },
});
