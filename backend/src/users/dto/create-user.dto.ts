export class CreateUserDto {
  name: string;
  email: string;
  password: string;
  isSuperAdmin?: boolean;
  tenantRoles?: { tenantId: string; role: string }[];
}
