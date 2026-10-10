import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Repository } from 'typeorm';
import { ModuleFeatureGuard } from './module-feature.guard';
import { Tenant } from '../tenants/tenant.entity';

describe('ModuleFeatureGuard', () => {
  let reflector: Reflector;
  let tenantRepo: jest.Mocked<Pick<Repository<Tenant>, 'findOne'>>;
  let guard: ModuleFeatureGuard;

  const makeContext = (request: any): ExecutionContext =>
    ({
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => ({}),
      getClass: () => ({}),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    reflector = new Reflector();
    tenantRepo = { findOne: jest.fn() };
    guard = new ModuleFeatureGuard(reflector, tenantRepo as unknown as Repository<Tenant>);
  });

  it('permite el paso cuando el endpoint no declara feature requerido', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

    const result = await guard.canActivate(makeContext({ query: {} }));

    expect(result).toBe(true);
    expect(tenantRepo.findOne).not.toHaveBeenCalled();
  });

  it('lanza 403 cuando el flag está apagado para el tenant', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('projects');
    tenantRepo.findOne.mockResolvedValue({ id: 't1', features: { projects: false } } as Tenant);

    await expect(
      guard.canActivate(makeContext({ query: { tenantId: 't1' } })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lanza 403 cuando el tenant no tiene features configurados', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('companies');
    tenantRepo.findOne.mockResolvedValue({ id: 't1', features: null } as Tenant);

    await expect(
      guard.canActivate(makeContext({ query: { tenantId: 't1' } })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('permite el paso cuando el flag está activo', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('projects');
    tenantRepo.findOne.mockResolvedValue({ id: 't1', features: { projects: true } } as Tenant);

    const result = await guard.canActivate(makeContext({ body: { tenantId: 't1' } }));

    expect(result).toBe(true);
  });

  it('lanza 403 cuando falta el tenantId en el request', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('projects');

    await expect(
      guard.canActivate(makeContext({ query: {} })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lanza 403 cuando el tenant no existe', async () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue('projects');
    tenantRepo.findOne.mockResolvedValue(null);

    await expect(
      guard.canActivate(makeContext({ params: { tenantId: 'missing' } })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
