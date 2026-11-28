import 'reflect-metadata';
// El almacenamiento de medios importa `uuid` (solo ESM), que Jest no carga; aquí no se usa.
jest.mock('../media/media-storage.service', () => ({ MediaStorageService: class MediaStorageService {} }));
import { ConversationFlowEngine } from './conversation-flow.engine';
import type {
  ConversationFlow,
  FlowHttpConfig,
} from './conversation-flow.entity';

const http = (over: Partial<FlowHttpConfig> = {}): FlowHttpConfig => ({
  method: 'GET',
  url: 'https://api.test/clientes/{{id}}',
  ...over,
});

const reply = (status: number, body: unknown = {}) =>
  jest.fn(async () => ({ status, ok: status < 400, headers: {}, body })) as any;

const msg = (id: string, text: string) => ({
  id,
  type: 'message',
  position: { x: 0, y: 0 },
  data: { text },
});

/** Inicio → Petición API → (Éxito: «ok» · Si falla: «ko», si está conectada). */
const flowWith = (cfg: FlowHttpConfig, withError = true): ConversationFlow =>
  ({
    id: 'f1',
    tenantId: 't1',
    name: 'Prueba',
    status: 'active',
    nodes: [
      { id: 'start', type: 'start', position: { x: 0, y: 0 }, data: {} },
      { id: 'api', type: 'http_request', position: { x: 0, y: 0 }, data: { http: cfg } },
      msg('ok', 'ok {{plan}} / {{http_status}}'),
      msg('ko', 'falló {{http_status}}: {{http_error}}'),
    ],
    edges: [
      { id: 'e1', source: 'start', sourceHandle: 'next', target: 'api' },
      { id: 'e2', source: 'api', sourceHandle: 'next', target: 'ok' },
      ...(withError ? [{ id: 'e3', source: 'api', sourceHandle: 'error', target: 'ko' }] : []),
    ],
  }) as unknown as ConversationFlow;

const run = async (
  flow: ConversationFlow,
  fetcher: any,
  variables: Record<string, string> = {},
  contact: Record<string, string> = {},
) => {
  const engine = new ConversationFlowEngine();
  (engine as any).httpFetcher = fetcher;
  return engine.start(flow, variables, async () => null, { contact, now: new Date('2026-03-10T15:00:00Z') });
};

describe('nodo Petición API en el motor', () => {
  it('éxito: guarda variables y http_status, y el Mensaje siguiente las usa', async () => {
    const fetcher = reply(200, { data: { plan: 'Pro' } });
    const r = await run(
      flowWith(http({ mappings: [{ id: 'm', path: 'data.plan', variable: 'plan' }] })),
      fetcher,
      { id: 'a b' },
    );
    expect(r.variables).toMatchObject({ plan: 'Pro', http_status: '200' });
    expect(r.variables.http_error).toBeUndefined();
    expect(r.messages.map((m) => m.text)).toEqual(['ok Pro / 200']);
    // {{id}} se interpolió y codificó en la URL
    expect(fetcher.mock.calls[0][0]).toBe('https://api.test/clientes/a%20b');
  });

  it('una Condición posterior lee la variable mapeada', async () => {
    const flow = flowWith(http({ mappings: [{ id: 'm', path: 'plan', variable: 'plan' }] }));
    flow.nodes.push({
      id: 'cond',
      type: 'condition',
      position: { x: 0, y: 0 },
      data: { conditionVariable: 'plan', conditionOperator: 'equals', conditionValue: 'Pro' },
    } as any);
    flow.nodes.push(msg('si', 'es pro') as any, msg('no', 'no es pro') as any);
    // «Éxito» ahora va a la Condición
    flow.edges = flow.edges.filter((e) => e.id !== 'e2');
    flow.edges.push(
      { id: 'c1', source: 'api', sourceHandle: 'next', target: 'cond' },
      { id: 'c2', source: 'cond', sourceHandle: 'true', target: 'si' },
      { id: 'c3', source: 'cond', sourceHandle: 'false', target: 'no' },
    );
    const pro = await run(flow, reply(200, { plan: 'Pro' }));
    expect(pro.messages.map((m) => m.text)).toEqual(['es pro']);
    const basic = await run(flow, reply(200, { plan: 'Basic' }));
    expect(basic.messages.map((m) => m.text)).toEqual(['no es pro']);
  });

  it('error con salida «Si falla» conectada: guarda http_status y http_error', async () => {
    const r = await run(
      flowWith(http({ mappings: [{ id: 'm', path: 'plan', variable: 'plan' }] })),
      reply(500, { plan: 'Pro' }),
    );
    expect(r.messages.map((m) => m.text)).toEqual(['falló 500: HTTP 500']);
    expect(r.variables.http_status).toBe('500');
    expect(r.variables.http_error).toBe('HTTP 500');
  });

  it('un estado no 2xx no aplica mapeos ni escribe campos del contacto', async () => {
    const r = await run(
      flowWith(
        http({ mappings: [{ id: 'm', path: 'plan', variable: 'plan', saveToField: 'notes' }] }),
      ),
      reply(404, { plan: 'Pro' }),
      { plan: 'previo' },
    );
    // La variable previa no se toca porque los mapeos no corren
    expect(r.variables.plan).toBe('previo');
    expect(r.contactUpdates).toEqual({});
  });

  it('fallo de red sin respuesta: http_status 0 y el motivo', async () => {
    const fetcher = jest.fn(async () => {
      throw Object.assign(new Error('x'), { name: 'TimeoutError' });
    });
    const r = await run(flowWith(http()), fetcher);
    expect(r.variables).toMatchObject({ http_status: '0', http_error: 'Tiempo agotado' });
    expect(r.messages.map((m) => m.text)).toEqual(['falló 0: Tiempo agotado']);
  });

  it('error sin salida conectada: el flujo termina y no ejecuta «Éxito»', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const r = await run(
        flowWith(http({ headers: [{ key: 'Authorization', value: 'Bearer secreto' }] }), false),
        reply(500, { cuerpo: 'privado' }),
      );
      expect(r.messages).toEqual([]);
      expect(r.state).toBeNull();
      expect(r.variables.http_status).toBe('500');
      expect(warn).toHaveBeenCalledTimes(1);
      const line = String(warn.mock.calls[0][0]);
      expect(line).toContain('f1');
      expect(line).toContain('api');
      expect(line).toContain('api.test');
      expect(line).toContain('500');
      expect(line).not.toContain('secreto');
      expect(line).not.toContain('privado');
    } finally {
      warn.mockRestore();
    }
  });

  it('sin URL sigue por «Si falla» con http_status 0', async () => {
    const fetcher = reply(200);
    const r = await run(flowWith(http({ url: '  ' })), fetcher);
    expect(fetcher).not.toHaveBeenCalled();
    expect(r.variables).toMatchObject({ http_status: '0', http_error: 'El nodo no tiene URL' });
    expect(r.messages.map((m) => m.text)).toEqual(['falló 0: El nodo no tiene URL']);
  });

  it('saveToField escribe en el contacto y keepExisting conserva un dato existente', async () => {
    const cfg = http({
      mappings: [
        { id: 'a', path: 'ciudad', variable: 'ciudad', saveToField: 'city', keepExisting: true },
        { id: 'b', path: 'correo', variable: 'correo', saveToField: 'email' },
        { id: 'c', path: 'tel', variable: 'tel', saveToField: 'phone', keepExisting: true },
      ],
    });
    const r = await run(
      flowWith(cfg),
      reply(200, { ciudad: 'Cali', correo: 'a@b.co', tel: '300' }),
      {},
      { city: 'Bogotá', email: 'viejo@b.co', phone: '' },
    );
    expect(r.contactUpdates).toEqual({ email: 'a@b.co', phone: '300' });
    expect(r.variables).toMatchObject({ ciudad: 'Cali', correo: 'a@b.co', tel: '300' });
  });

  it('una ruta ausente borra el valor de una ejecución anterior', async () => {
    const r = await run(
      flowWith(
        http({
          mappings: [
            { id: 'a', path: 'plan', variable: 'plan' },
            { id: 'b', path: 'otro', variable: 'otro' },
          ],
        }),
      ),
      reply(200, { otro: 'nuevo' }),
      { plan: 'viejo', otro: 'viejo' },
    );
    expect(r.variables.plan).toBeUndefined();
    expect(r.variables.otro).toBe('nuevo');
    expect(r.messages[0].text).toBe('ok  / 200');
  });

  it('una respuesta que no es JSON se guarda entera con la ruta `$`', async () => {
    const r = await run(
      flowWith(http({ mappings: [{ id: 'a', path: '$', variable: 'plan' }] })),
      reply(200, 'texto plano'),
    );
    expect(r.variables.plan).toBe('texto plano');
  });

  it('con 30 s consumidos en el turno, el segundo nodo no llama a la API y sigue por «Si falla»', async () => {
    let clock = 1_700_000_000_000;
    const now = jest.spyOn(Date, 'now').mockImplementation(() => clock);
    try {
      const fetcher = jest.fn(async () => {
        clock += 30_000; // la primera petición gasta todo el presupuesto
        return { status: 200, ok: true, headers: {}, body: {} };
      }) as any;
      const flow = flowWith(http());
      // Inicio → api → api2 → ok / ko
      flow.nodes.push({
        id: 'api2',
        type: 'http_request',
        position: { x: 0, y: 0 },
        data: { http: http({ url: 'https://api.test/otra' }) },
      } as any);
      flow.edges = [
        { id: 'e1', source: 'start', sourceHandle: 'next', target: 'api' },
        { id: 'e2', source: 'api', sourceHandle: 'next', target: 'api2' },
        { id: 'e3', source: 'api2', sourceHandle: 'next', target: 'ok' },
        { id: 'e4', source: 'api2', sourceHandle: 'error', target: 'ko' },
      ] as any;
      const r = await run(flow, fetcher);
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(r.httpMs).toBe(30_000);
      expect(r.variables).toMatchObject({
        http_status: '0',
        http_error: 'Tiempo total del turno agotado',
      });
      expect(r.messages.map((m) => m.text)).toEqual(['falló 0: Tiempo total del turno agotado']);
    } finally {
      now.mockRestore();
    }
  });

  it('los flujos sin el nodo siguen igual (httpMs en 0)', async () => {
    const flow = {
      id: 'f2',
      tenantId: 't1',
      name: 'Simple',
      status: 'active',
      nodes: [
        { id: 'start', type: 'start', position: { x: 0, y: 0 }, data: {} },
        msg('m', 'hola'),
      ],
      edges: [{ id: 'e', source: 'start', sourceHandle: 'next', target: 'm' }],
    } as unknown as ConversationFlow;
    const r = await run(flow, reply(200));
    expect(r.messages.map((m) => m.text)).toEqual(['hola']);
    expect(r.httpMs).toBe(0);
  });
});
