jest.mock('../media/media-storage.service', () => ({
  MediaStorageService: class {},
}));
import * as safeFetchModule from '../automatizaciones/utils/safe-fetch.util';
import { ConversationFlowsService } from './conversation-flows.service';
import { maskFlow, sanitizeHttpConfig } from './flow-http-sanitize.util';
import { MASKED_HEADER_VALUE } from './flow-http.util';

const TENANT = '11111111-1111-4111-8111-111111111111';
const FLOW_ID = '22222222-2222-4222-8222-222222222222';

function makeService(flow?: any) {
  const flowRepo: any = {
    findOne: jest.fn(async () => flow ?? null),
    save: jest.fn(async (f: any) => f),
  };
  const customFieldRepo: any = { find: jest.fn(async () => []) };
  const service = new ConversationFlowsService(
    flowRepo,
    {} as any,
    customFieldRepo,
    {} as any,
    {} as any,
    {} as any,
  );
  return { service, flowRepo };
}

const savedFlow = () => ({
  id: FLOW_ID,
  tenantId: TENANT,
  nodes: [
    {
      id: 'h1',
      type: 'http_request',
      position: { x: 0, y: 0 },
      data: {
        http: {
          method: 'GET',
          url: 'https://api.example.com/x',
          headers: [
            { key: 'Authorization', value: 'Bearer secreto' },
            { key: 'Content-Type', value: 'application/json' },
          ],
        },
      },
    },
  ],
});

describe('sanitizeHttpConfig', () => {
  it('método inválido pasa a GET', () => {
    expect(sanitizeHttpConfig({ method: 'HACK', url: 'https://a.com' }).method).toBe('GET');
    expect(sanitizeHttpConfig({ method: 'post', url: 'https://a.com' }).method).toBe('POST');
  });

  it('descarta encabezados prohibidos y de nombre inválido', () => {
    const out = sanitizeHttpConfig({
      url: 'https://a.com',
      headers: [
        { key: 'Host', value: 'x' },
        { key: 'content-length', value: '1' },
        { key: 'Transfer-Encoding', value: 'chunked' },
        { key: 'CONNECTION', value: 'close' },
        { key: 'Mal Nombre', value: 'x' },
        { key: 'X-Ok', value: 'v' },
      ],
    });
    expect(out.headers).toEqual([{ key: 'X-Ok', value: 'v' }]);
  });

  it('descarta variables reservadas, repetidas o inválidas', () => {
    const out = sanitizeHttpConfig({
      url: 'https://a.com',
      mappings: [
        { id: 'a', path: 'x', variable: 'http_status' },
        { id: 'b', path: 'x', variable: 'http_error' },
        { id: 'c', path: 'x', variable: 'nombre' },
        { id: 'd', path: 'y', variable: 'nombre' },
        { id: 'e', path: 'y', variable: 'con espacio' },
        { id: 'f', path: '', variable: 'sinruta' },
      ],
    });
    expect(out.mappings?.map((m) => m.variable)).toEqual(['nombre']);
  });

  it('genera id de mapeo si falta', () => {
    const out = sanitizeHttpConfig({
      url: 'https://a.com',
      mappings: [{ path: 'x', variable: 'v' }],
    });
    expect(out.mappings?.[0].id).toBeTruthy();
  });

  it('aplica los límites', () => {
    const pairs = Array.from({ length: 30 }, (_, i) => ({ key: `k${i}`, value: 'v' }));
    const out = sanitizeHttpConfig({
      method: 'POST',
      url: 'https://a.com/' + 'x'.repeat(3000),
      query: [...pairs, { key: '', value: 'sin clave' }],
      bodyType: 'text',
      body: 'b'.repeat(20000),
      timeoutSec: 99,
      mappings: Array.from({ length: 40 }, (_, i) => ({
        id: 'i'.repeat(100) + i,
        path: 'p'.repeat(500),
        variable: `v${i}`,
      })),
    });
    expect(out.url).toHaveLength(2000);
    expect(out.query).toHaveLength(20);
    expect(out.body).toHaveLength(10000);
    expect(out.timeoutSec).toBe(15);
    expect(out.mappings).toHaveLength(30);
    expect(out.mappings![0].path).toHaveLength(200);
    expect(out.mappings![0].id.length).toBeLessThanOrEqual(64);
    expect(sanitizeHttpConfig({ url: 'x', timeoutSec: 0 }).timeoutSec).toBe(1);
    expect(sanitizeHttpConfig({ url: 'x' }).timeoutSec).toBe(10);
  });

  it('GET queda sin cuerpo ni formFields', () => {
    const out = sanitizeHttpConfig({
      method: 'GET',
      url: 'https://a.com',
      bodyType: 'json',
      body: '{"a":1}',
      formFields: [{ key: 'a', value: 'b' }],
    });
    expect(out.bodyType).toBe('none');
    expect(out.body).toBeUndefined();
    expect(out.formFields).toBeUndefined();
  });

  it('__saved__ conserva el valor anterior (sin distinguir mayúsculas)', () => {
    const prev = savedFlow().nodes[0].data.http as any;
    const out = sanitizeHttpConfig(
      {
        url: 'https://a.com',
        headers: [{ key: 'authorization', value: MASKED_HEADER_VALUE }],
      },
      prev,
    );
    expect(out.headers).toEqual([{ key: 'authorization', value: 'Bearer secreto' }]);
  });

  it('__saved__ sin anterior se descarta', () => {
    const out = sanitizeHttpConfig({
      url: 'https://a.com',
      headers: [{ key: 'Authorization', value: MASKED_HEADER_VALUE }],
    });
    expect(out.headers).toBeUndefined();
  });
});

describe('maskFlow', () => {
  it('oculta Authorization y X-Api-Key pero no Content-Type, sin mutar el original', () => {
    const flow: any = savedFlow();
    flow.nodes[0].data.http.headers.push({ key: 'X-Api-Key', value: 'k' });
    flow.nodes[0].data.http.headers.push({ key: 'X-Token', value: '' });
    const masked: any = maskFlow(flow);
    const h = masked.nodes[0].data.http.headers;
    expect(h[0].value).toBe(MASKED_HEADER_VALUE);
    expect(h[1].value).toBe('application/json');
    expect(h[2].value).toBe(MASKED_HEADER_VALUE);
    expect(h[3].value).toBe('');
    expect(flow.nodes[0].data.http.headers[0].value).toBe('Bearer secreto');
  });
});

describe('ConversationFlowsService (petición API)', () => {
  it('isValidHandle de http_request: solo next y error', () => {
    const { service } = makeService();
    const check = (node: any, h: string) => (service as any).isValidHandle(node, h);
    const node = { id: 'h', type: 'http_request', position: { x: 0, y: 0 }, data: {} };
    expect(check(node, 'next')).toBe(true);
    expect(check(node, 'error')).toBe(true);
    expect(check(node, 'timeout')).toBe(false);
    expect(check(node, 'btn:1')).toBe(false);
  });

  it('update conserva el secreto guardado y no lo devuelve', async () => {
    const flow: any = savedFlow();
    flow.nodes.unshift({ id: 'start', type: 'start', position: { x: 0, y: 0 }, data: {} });
    flow.edges = [];
    const { service, flowRepo } = makeService(flow);
    const res: any = await service.update(FLOW_ID, {
      tenantId: TENANT,
      nodes: [
        flow.nodes[0],
        {
          id: 'h1',
          type: 'http_request',
          position: { x: 0, y: 0 },
          data: {
            http: {
              method: 'GET',
              url: 'https://api.example.com/x',
              headers: [{ key: 'Authorization', value: MASKED_HEADER_VALUE }],
            },
          },
        },
      ] as any,
    });
    const stored = flowRepo.save.mock.calls[0][0];
    expect(stored.nodes[1].data.http.headers[0].value).toBe('Bearer secreto');
    expect(res.nodes[1].data.http.headers[0].value).toBe(MASKED_HEADER_VALUE);
  });

  it('testHttp con localhost devuelve ok:false y «URL no permitida», sin red', async () => {
    const { service } = makeService();
    const res = await service.testHttp({
      tenantId: TENANT,
      config: { method: 'GET', url: 'http://localhost:3000/x' },
    });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(0);
    expect(res.error).toBe('URL no permitida');
  });

  it('testHttp con nodo guardado usa el secreto real y no lo devuelve', async () => {
    const { service } = makeService(savedFlow());
    const spy = jest.spyOn(safeFetchModule, 'safeFetch').mockResolvedValue({
      status: 200,
      ok: true,
      headers: { 'set-cookie': 'a=b' },
      body: { hola: 'mundo' },
    });
    try {
      const res: any = await service.testHttp({
        tenantId: TENANT,
        flowId: FLOW_ID,
        nodeId: 'h1',
        config: {
          method: 'GET',
          url: 'https://api.example.com/u/{{ id }}',
          headers: [{ key: 'Authorization', value: MASKED_HEADER_VALUE }],
        },
        values: { id: 'a b' },
      });
      const [url, opts] = spy.mock.calls[0] as any[];
      expect(url).toBe('https://api.example.com/u/a%20b');
      expect(opts.headers.Authorization).toBe('Bearer secreto');
      expect(res).toMatchObject({
        ok: true,
        status: 200,
        contentType: 'json',
        body: { hola: 'mundo' },
        truncated: false,
      });
      expect(JSON.stringify(res)).not.toContain('secreto');
      expect(JSON.stringify(res)).not.toContain('set-cookie');
    } finally {
      spy.mockRestore();
    }
  });

  it('testHttp recorta un cuerpo JSON de más de 256 KB a texto', async () => {
    const { service } = makeService();
    const spy = jest.spyOn(safeFetchModule, 'safeFetch').mockResolvedValue({
      status: 200,
      ok: true,
      headers: {},
      body: { data: 'x'.repeat(300 * 1024) },
    });
    try {
      const res: any = await service.testHttp({
        tenantId: TENANT,
        config: { method: 'GET', url: 'https://api.example.com/big' },
      });
      expect(res.contentType).toBe('text');
      expect(res.truncated).toBe(true);
      expect(typeof res.body).toBe('string');
      expect(res.body.length).toBe(256 * 1024);
    } finally {
      spy.mockRestore();
    }
  });
});
