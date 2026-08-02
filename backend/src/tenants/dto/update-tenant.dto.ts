export class UpdateTenantDto {
  name?: string;
  slug?: string;
  isActive?: boolean;
  isDev?: boolean;
  maxAgents?: number;
  tableConfig?: Record<string, any>;
}
