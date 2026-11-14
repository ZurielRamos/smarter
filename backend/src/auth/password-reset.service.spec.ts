import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import type { Repository } from 'typeorm';
import type { MailService } from '../mail/mail.service';
import type { User } from '../users/user.entity';
import type { PasswordResetCode } from './password-reset-code.entity';
import { PasswordResetService, RESET_CODE_MAX_ATTEMPTS } from './password-reset.service';

/** Repositorio en memoria con lo que usa el servicio (filtros por campo, IsNull, orden por fecha). */
function memoryCodeRepo() {
  const rows: PasswordResetCode[] = [];
  let seq = 0;
  const matches = (row: PasswordResetCode, where: Record<string, unknown>) =>
    Object.entries(where).every(([key, value]) => {
      const actual = (row as unknown as Record<string, unknown>)[key];
      // IsNull() de TypeORM es un FindOperator con type 'isNull'.
      if (value && typeof value === 'object' && (value as { type?: string }).type === 'isNull') return actual === null;
      return actual === value;
    });
  const newest = (list: PasswordResetCode[]) =>
    [...list].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null;

  return {
    rows,
    create: (data: Partial<PasswordResetCode>) => ({ ...data }) as PasswordResetCode,
    save: async (row: PasswordResetCode) => {
      if (!row.id) {
        row.id = `code-${++seq}`;
        row.createdAt = new Date(Date.now() + seq); // Orden estable aunque se creen en el mismo ms.
        rows.push(row);
      }
      return row;
    },
    update: async (where: Record<string, unknown>, patch: Partial<PasswordResetCode>) => {
      rows.filter((r) => matches(r, where)).forEach((r) => Object.assign(r, patch));
    },
    findOne: async ({ where }: { where: Record<string, unknown> }) => newest(rows.filter((r) => matches(r, where))),
  };
}

class TestPasswordResetService extends PasswordResetService {
  users: User[] = [];
  protected async findActiveUser(email: string) {
    const user = this.users.find((u) => u.email.toLowerCase() === email.trim().toLowerCase());
    return user && user.isActive ? user : null;
  }
}

describe('PasswordResetService', () => {
  let codes: ReturnType<typeof memoryCodeRepo>;
  let sent: { to: string; code: string }[];
  let user: User;
  let service: TestPasswordResetService;
  const jwt = new JwtService({ secret: 'test-secret' });

  beforeEach(() => {
    codes = memoryCodeRepo();
    sent = [];
    user = { id: 'user-1', email: 'Agente@Example.com', name: 'Agente', isActive: true, password: 'old' } as User;
    const userRepo = {
      findOne: async ({ where }: { where: { id: string } }) => (where.id === user.id ? user : null),
      save: async (u: User) => u,
    } as unknown as Repository<User>;
    const mail = {
      sendPasswordResetCode: async (p: { to: string; code: string }) => void sent.push(p),
    } as unknown as MailService;
    const config = { get: (_key: string, fallback?: string) => fallback } as unknown as ConfigService;
    service = new TestPasswordResetService(userRepo, codes as unknown as Repository<PasswordResetCode>, jwt, mail, config);
    service.users = [user];
  });

  const requestCode = async (email = 'agente@example.com') => {
    await service.request(email);
    return sent[sent.length - 1]?.code;
  };

  it('envía un código de 6 dígitos y guarda solo su hash', async () => {
    const code = await requestCode();
    expect(code).toMatch(/^\d{6}$/);
    expect(sent[0].to).toBe('Agente@Example.com');
    expect(codes.rows).toHaveLength(1);
    expect(codes.rows[0].codeHash).not.toContain(code);
  });

  it('no envía nada ni falla si el correo no existe', async () => {
    await expect(service.request('nadie@example.com')).resolves.toBeUndefined();
    expect(sent).toHaveLength(0);
  });

  it('no reenvía antes de un minuto', async () => {
    await requestCode();
    await requestCode();
    expect(sent).toHaveLength(1);
  });

  it('flujo completo: verifica el código y cambia la contraseña', async () => {
    const code = await requestCode();
    const { resetToken } = await service.verify('agente@example.com', code);
    await service.confirm(resetToken, 'NuevaClave123');
    expect(await bcrypt.compare('NuevaClave123', user.password)).toBe(true);
    expect(codes.rows[0].consumedAt).toBeInstanceOf(Date);
  });

  it('el token de verificación solo sirve una vez', async () => {
    const code = await requestCode();
    const { resetToken } = await service.verify('agente@example.com', code);
    await service.confirm(resetToken, 'NuevaClave123');
    await expect(service.confirm(resetToken, 'OtraClave456')).rejects.toThrow('ya se usó');
  });

  it('cuenta los intentos y bloquea al llegar al máximo', async () => {
    const code = await requestCode();
    const wrong = code === '000000' ? '111111' : '000000';
    await expect(service.verify('agente@example.com', wrong)).rejects.toThrow('Te quedan 4 intentos');
    for (let i = 1; i < RESET_CODE_MAX_ATTEMPTS; i += 1) {
      await service.verify('agente@example.com', wrong).catch(() => undefined);
    }
    // Tras agotar los intentos ni el código correcto sirve.
    await expect(service.verify('agente@example.com', code)).rejects.toThrow('número de intentos');
  });

  it('rechaza un código expirado', async () => {
    const code = await requestCode();
    codes.rows[0].expiresAt = new Date(Date.now() - 1000);
    await expect(service.verify('agente@example.com', code)).rejects.toThrow('expiró');
  });

  it('pedir un código nuevo invalida el anterior', async () => {
    const first = await requestCode();
    codes.rows[0].createdAt = new Date(Date.now() - 120_000); // Ya pasó el minuto de espera.
    const second = await requestCode();
    expect(sent).toHaveLength(2);
    if (first !== second) {
      await expect(service.verify('agente@example.com', first)).rejects.toThrow('Código incorrecto');
    }
    await expect(service.verify('agente@example.com', second)).resolves.toHaveProperty('resetToken');
  });

  it('exige al menos 8 caracteres', async () => {
    const code = await requestCode();
    const { resetToken } = await service.verify('agente@example.com', code);
    await expect(service.confirm(resetToken, 'corta')).rejects.toThrow('al menos 8');
  });

  it('rechaza un token de otro propósito', async () => {
    const foreign = jwt.sign({ sub: user.id, purpose: 'password-setup' });
    await expect(service.confirm(foreign, 'NuevaClave123')).rejects.toThrow('no es válida');
  });
});
