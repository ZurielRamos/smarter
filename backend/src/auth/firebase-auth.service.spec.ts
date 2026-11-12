import { ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type KeyLike } from 'jose';
import { FirebaseAuthService } from './firebase-auth.service';

const PROJECT = 'smarter-test';

/** Usa claves locales en lugar de las de Google para firmar tokens de prueba. */
class TestFirebaseAuthService extends FirebaseAuthService {
  setKeys(keys: Parameters<typeof createLocalJWKSet>[0]) {
    this.keySet = createLocalJWKSet(keys);
  }
}

describe('FirebaseAuthService', () => {
  let privateKey: KeyLike;
  let otherKey: KeyLike;
  let service: TestFirebaseAuthService;

  const config = (projectId?: string) =>
    ({ get: (key: string) => (key === 'FIREBASE_PROJECT_ID' ? projectId : undefined) }) as unknown as ConfigService;

  const sign = (
    claims: Record<string, unknown>,
    opts: { key?: KeyLike; issuer?: string; audience?: string; exp?: string } = {},
  ) =>
    new SignJWT({
      email: 'agente@example.com',
      email_verified: true,
      firebase: { sign_in_provider: 'google.com' },
      ...claims,
    })
      .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
      .setSubject('firebase-uid-1')
      .setIssuer(opts.issuer ?? `https://securetoken.google.com/${PROJECT}`)
      .setAudience(opts.audience ?? PROJECT)
      .setIssuedAt()
      .setExpirationTime(opts.exp ?? '1h')
      .sign(opts.key ?? privateKey);

  beforeAll(async () => {
    const pair = await generateKeyPair('RS256');
    privateKey = pair.privateKey;
    otherKey = (await generateKeyPair('RS256')).privateKey;
    const jwk = { ...(await exportJWK(pair.publicKey)), kid: 'test-key', alg: 'RS256' };
    service = new TestFirebaseAuthService(config(PROJECT));
    service.setKeys({ keys: [jwk] });
  });

  it('acepta un token válido de Google', async () => {
    await expect(service.verify(await sign({}))).resolves.toEqual({
      email: 'agente@example.com',
      provider: 'google.com',
      picture: undefined,
    });
  });

  it('acepta un token válido de Apple', async () => {
    const token = await sign({ firebase: { sign_in_provider: 'apple.com' } });
    await expect(service.verify(token)).resolves.toMatchObject({ provider: 'apple.com' });
  });

  it.each([
    ['firma de otra clave', () => sign({}, { key: otherKey })],
    ['otro proyecto (aud)', () => sign({}, { audience: 'otro-proyecto' })],
    ['otro emisor (iss)', () => sign({}, { issuer: 'https://evil.example.com' })],
    ['token expirado', () => sign({}, { exp: '-10m' })],
    ['proveedor no permitido', () => sign({ firebase: { sign_in_provider: 'password' } })],
    ['correo sin verificar', () => sign({ email_verified: false })],
    ['sin correo', () => sign({ email: undefined })],
  ])('rechaza: %s', async (_label, make) => {
    await expect(service.verify(await make())).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rechaza un token vacío o mal formado', async () => {
    await expect(service.verify('')).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.verify('no-es-un-jwt')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('responde 503 si falta FIREBASE_PROJECT_ID', async () => {
    const unconfigured = new FirebaseAuthService(config(undefined));
    await expect(unconfigured.verify(await sign({}))).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
