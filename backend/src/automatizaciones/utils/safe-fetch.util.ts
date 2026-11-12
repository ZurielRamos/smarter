import { lookup } from 'dns/promises';
import { isIP } from 'net';

/** Detecta direcciones privadas, loopback, link-local y metadata cloud. */
function isPrivateIp(ip: string): boolean {
  if (ip.includes(':')) {
    const v = ip.toLowerCase();
    if (v === '::1' || v === '::') return true;
    if (v.startsWith('fe80') || v.startsWith('fc') || v.startsWith('fd')) {
      return true;
    }
    if (v.startsWith('::ffff:')) return isPrivateIp(v.slice(7));
    return false;
  }
  const [a, b] = ip.split('.').map(Number);
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

/**
 * Valida que una URL sea http(s) y no apunte a la red interna (protección SSRF).
 * Lanza un Error descriptivo si no es segura. Se puede desactivar solo en
 * desarrollo con AUTOMATION_ALLOW_PRIVATE_HOSTS=true.
 */
export async function assertPublicUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(`URL inválida: ${rawUrl.slice(0, 120)}`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Solo se permiten URLs http(s)');
  }
  if (process.env.AUTOMATION_ALLOW_PRIVATE_HOSTS === 'true') return url;

  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) {
    throw new Error('No se permiten destinos de red interna');
  }
  const addrs = isIP(host)
    ? [{ address: host }]
    : await lookup(host, { all: true }).catch(() => {
        throw new Error(`No se pudo resolver el host ${host}`);
      });
  if (addrs.some((a) => isPrivateIp(a.address))) {
    throw new Error('No se permiten destinos de red interna');
  }
  return url;
}

export interface SafeFetchOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  /** Máximo de bytes de respuesta que se leen. */
  maxBytes?: number;
}

export interface SafeFetchResult {
  status: number;
  ok: boolean;
  headers: Record<string, string>;
  body: unknown;
}

/** fetch con validación SSRF, timeout, sin seguir redirecciones y límite de tamaño. */
export async function safeFetch(
  rawUrl: string,
  opts: SafeFetchOptions = {},
): Promise<SafeFetchResult> {
  const url = await assertPublicUrl(rawUrl);
  const res = await fetch(url, {
    method: opts.method || 'GET',
    headers: opts.headers,
    body: opts.body,
    redirect: 'manual',
    signal: AbortSignal.timeout(opts.timeoutMs ?? 15000),
  });

  const max = opts.maxBytes ?? 1024 * 1024;
  const buf = Buffer.from(await res.arrayBuffer()).subarray(0, max);
  const text = buf.toString('utf8');
  let body: unknown = text;
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('json') || /^\s*[[{]/.test(text)) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  const headers: Record<string, string> = {};
  res.headers.forEach((v, k) => (headers[k] = v));
  return { status: res.status, ok: res.ok, headers, body };
}
