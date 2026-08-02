export class UpdateTenantDto {
  name?: string;
  slug?: string;
  isActive?: boolean;
  tableConfig?: Record<string, any>;
}
