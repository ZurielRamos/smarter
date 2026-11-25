import 'reflect-metadata';

// Dependencias ESM que Jest no transforma y que aquí no se usan.
jest.mock('../media/media-storage.service', () => ({ MediaStorageService: class {} }));

import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TenantResourceGuard, TenantResourceService } from './tenant-resource.guard';
import { ChatsController } from '../chats/chats.controller';

const T1 = '11111111-1111-4111-8111-111111111111';
const T2 = '22222222-2222-4222-8222-222222222222';
const RECORD = '33333333-3333-4333-8333-333333333333';

/** Ejecuta el guard sobre ChatsController.getConversations con la query dada. */
function run(query: Record<string, string>, user: any, owners: Record<string, string> = { [RECORD]: T1 }) {
  const resources = {
    owners: jest.fn(async (_kind: string, ids: string[]) => new Map(ids.filter((id) => owners[id]).map((id) => [id, owners[id]]))),
  } as unknown as TenantResourceService;
  const guard = new TenantResourceGuard(new Reflector(), resources);
  const request = { user, method: 'GET', params: {}, query, body: {} };
  const context: any = {
    getHandler: () => ChatsController.prototype.getConversations,
    getClass: () => ChatsController,
    switchToHttp: () => ({ getRequest: () => request }),
  };
  return guard.canActivate(context);
}

const member = (tenantId: string, role = 'agent') => ({ id: 'u1', tenantRoles: [{ tenantId, role, tenant: { id: tenantId } }] });

describe('GET /chats/conversations por contacto (ficha del contacto)', () => {
  it('deduce la cuenta del contacto: un miembro sin superadmin entra sin enviar tenantId', async () => {
    await expect(run({ recordId: RECORD }, member(T1))).resolves.toBe(true);
  });

  it('un usuario de otra cuenta no ve las conversaciones del contacto', async () => {
    await expect(run({ recordId: RECORD }, member(T2))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('un tenantId que no coincide con el del contacto se rechaza', async () => {
    await expect(run({ recordId: RECORD, tenantId: T2 }, member(T2))).rejects.toThrow();
  });

  it('sin tenantId ni recursos sigue pidiendo tenantId', async () => {
    await expect(run({}, member(T1))).rejects.toBeInstanceOf(BadRequestException);
  });
});
