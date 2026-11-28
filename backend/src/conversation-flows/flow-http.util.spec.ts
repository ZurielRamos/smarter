import {
  HTTP_MAX_VALUE_CHARS,
  applyMappings,
  executeFlowHttp,
  isSensitiveHeader,
  type Resolve,
} from './flow-http.util';
import type { FlowHttpConfig, FlowHttpMapping } from './conversation-flow.entity';

/** Resuelve {{x}} desde un mapa; lo que falta queda vacío. */
const resolver =
  (values: Record<string, string>): Resolve =>
  (text) =>
    text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k: string) => values[k] ?? '');

const reply = (status: number, body: unknown = {}) =>
  jest.fn(async () => ({ status, ok: status < 400, headers: {}, body })) as any;

const map = (path: string, variable: string): FlowHttpMapping => ({
  id: variable,
  path,
  variable,
});

describe('executeFlowHttp', () => {
  it('usa el método y devuelve el cuerpo en una respuesta 2xx', async () => {
    const fetcher = reply(200, { ok: true });
    const r = await executeFlowHttp(
      { method: 'DELETE', url: 'https://api.test/x' },
      resolver({}),
      { fetcher },
    );
    expect(fetcher.mock.calls[0][0]).toBe('https://api.test/x');
    expect(fetcher.mock.calls[0][1].method).toBe('DELETE');
    expect(r).toMatchObject({ ok: true, status: 200, body: { ok: true } });
  });

  it('codifica los {{x}} de la URL y los parámetros de consulta', async () => {
    const fetcher = reply(200);
    const cfg: FlowHttpConfig = {
      method: 'GET',
      url: 'https://api.test/buscar/{{q}}',
      query: [
        { key: 'nombre', value: '{{q}}' },
        { key: 'k', value: 'a&b' },
      ],
    };
    await executeFlowHttp(cfg, resolver({ q: 'ana & pepe/1' }), { fetcher });
    const url: string = fetcher.mock.calls[0][0];
    expect(url.startsWith('https://api.test/buscar/ana%20%26%20pepe%2F1?')).toBe(true);
    const qs = new URLSearchParams(url.split('?')[1]);
    expect(qs.get('nombre')).toBe('ana & pepe/1');
    expect(qs.get('k')).toBe('a&b');
  });

  it('agrega los parámetros con & si la URL ya tiene consulta', async () => {
    const fetcher = reply(200);
    await executeFlowHttp(
      { method: 'GET', url: 'https://api.test/x?a=1', query: [{ key: 'b', value: '2' }] },
      resolver({}),
      { fetcher },
    );
    expect(fetcher.mock.calls[0][0]).toBe('https://api.test/x?a=1&b=2');
  });

  it('un valor con comillas y saltos de línea no rompe el JSON del cuerpo', async () => {
    const fetcher = reply(200);
    const nasty = 'dijo "hola"\nsegunda línea \\ fin';
    await executeFlowHttp(
      {
        method: 'POST',
        url: 'https://api.test/x',
        bodyType: 'json',
        body: '{"mensaje": "{{m}}", "n": 1}',
      },
      resolver({ m: nasty }),
      { fetcher },
    );
    const opts = fetcher.mock.calls[0][1];
    expect(JSON.parse(opts.body)).toEqual({ mensaje: nasty, n: 1 });
    expect(opts.headers['Content-Type']).toBe('application/json');
  });

  it('respeta un Content-Type escrito por el usuario', async () => {
    const fetcher = reply(200);
    await executeFlowHttp(
      {
        method: 'POST',
        url: 'https://api.test/x',
        bodyType: 'json',
        body: '{}',
        headers: [{ key: 'content-type', value: 'application/vnd.api+json' }],
      },
      resolver({}),
      { fetcher },
    );
    const headers = fetcher.mock.calls[0][1].headers;
    expect(headers['content-type']).toBe('application/vnd.api+json');
    expect(headers['Content-Type']).toBeUndefined();
  });

  it('formulario: codifica los pares', async () => {
    const fetcher = reply(200);
    await executeFlowHttp(
      {
        method: 'POST',
        url: 'https://api.test/x',
        bodyType: 'form',
        formFields: [
          { key: 'nombre', value: '{{n}}' },
          { key: '', value: 'descartado' },
        ],
      },
      resolver({ n: 'a b&c' }),
      { fetcher },
    );
    const opts = fetcher.mock.calls[0][1];
    expect(opts.body).toBe('nombre=a+b%26c');
    expect(opts.headers['Content-Type']).toBe('application/x-www-form-urlencoded');
  });

  it('cuerpo de texto con variables', async () => {
    const fetcher = reply(200);
    await executeFlowHttp(
      { method: 'PUT', url: 'https://api.test/x', bodyType: 'text', body: 'hola {{n}}' },
      resolver({ n: 'Ana' }),
      { fetcher },
    );
    expect(fetcher.mock.calls[0][1].body).toBe('hola Ana');
  });

  it('GET no envía cuerpo', async () => {
    const fetcher = reply(200);
    await executeFlowHttp(
      { method: 'GET', url: 'https://api.test/x', bodyType: 'text', body: 'x' },
      resolver({}),
      { fetcher },
    );
    expect(fetcher.mock.calls[0][1].body).toBeUndefined();
  });

  it('rechaza encabezados con salto de línea sin llamar a la API', async () => {
    const fetcher = reply(200);
    const r = await executeFlowHttp(
      {
        method: 'GET',
        url: 'https://api.test/x',
        headers: [{ key: 'X-Dato', value: 'a{{v}}' }],
      },
      resolver({ v: 'x\nInjected: 1' }),
      { fetcher },
    );
    expect(r).toMatchObject({ ok: false, status: 0, error: 'Encabezado no válido' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('limita el tiempo de espera a 15 s y usa 10 s por defecto', async () => {
    const fetcher = reply(200);
    await executeFlowHttp({ method: 'GET', url: 'https://api.test/x', timeoutSec: 60 }, resolver({}), { fetcher });
    expect(fetcher.mock.calls[0][1].timeoutMs).toBe(15000);
    await executeFlowHttp({ method: 'GET', url: 'https://api.test/x' }, resolver({}), { fetcher });
    expect(fetcher.mock.calls[1][1].timeoutMs).toBe(10000);
  });

  it('el presupuesto del turno recorta el tiempo de espera', async () => {
    const fetcher = reply(200);
    await executeFlowHttp({ method: 'GET', url: 'https://api.test/x' }, resolver({}), {
      fetcher,
      budgetMs: 2500,
    });
    expect(fetcher.mock.calls[0][1].timeoutMs).toBe(2500);
  });

  it('con el presupuesto agotado no llama a la API', async () => {
    const fetcher = reply(200);
    const r = await executeFlowHttp({ method: 'GET', url: 'https://api.test/x' }, resolver({}), {
      fetcher,
      budgetMs: 0,
    });
    expect(r).toMatchObject({
      ok: false,
      status: 0,
      error: 'Tiempo total del turno agotado',
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('sin URL falla sin llamar a la API', async () => {
    const fetcher = reply(200);
    const r = await executeFlowHttp({ method: 'GET', url: '  ' }, resolver({}), { fetcher });
    expect(r).toMatchObject({ ok: false, status: 0, error: 'El nodo no tiene URL' });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('traduce el timeout', async () => {
    const err = Object.assign(new Error('The operation was aborted'), { name: 'TimeoutError' });
    const fetcher = jest.fn(async () => {
      throw err;
    }) as any;
    const r = await executeFlowHttp({ method: 'GET', url: 'https://api.test/x' }, resolver({}), { fetcher });
    expect(r).toMatchObject({ ok: false, status: 0, error: 'Tiempo agotado' });
  });

  it('traduce una URL no permitida', async () => {
    for (const message of [
      'No se permiten destinos internos',
      'Solo se permiten URLs http/https',
      'URL inválida',
    ]) {
      const fetcher = jest.fn(async () => {
        throw new Error(message);
      }) as any;
      const r = await executeFlowHttp({ method: 'GET', url: 'http://localhost/x' }, resolver({}), { fetcher });
      expect(r).toMatchObject({ ok: false, status: 0, error: 'URL no permitida' });
    }
  });

  it('un error de red se traduce a «No se pudo conectar»', async () => {
    const fetcher = jest.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as any;
    const r = await executeFlowHttp({ method: 'GET', url: 'https://api.test/x' }, resolver({}), { fetcher });
    expect(r).toMatchObject({ ok: false, status: 0, error: 'No se pudo conectar' });
  });

  it('un estado 404 es ok:false con «HTTP 404»', async () => {
    const r = await executeFlowHttp({ method: 'GET', url: 'https://api.test/x' }, resolver({}), {
      fetcher: reply(404, { message: 'no existe' }),
    });
    expect(r).toMatchObject({ ok: false, status: 404, error: 'HTTP 404' });
  });
});

describe('applyMappings', () => {
  const body = {
    data: { items: [{ nombre: 'Ana' }, { nombre: 'Luis' }], total: 2, activo: false },
    nulo: null,
  };

  it('lee rutas anidadas e índices de lista', () => {
    const r = applyMappings(
      [map('data.items[1].nombre', 'segundo'), map('data.total', 'total'), map('data.activo', 'activo')],
      body,
    );
    expect(r.values).toEqual({ segundo: 'Luis', total: '2', activo: 'false' });
    expect(r.missing).toEqual([]);
  });

  it('una ruta ausente o null va a missing y no genera valor', () => {
    const r = applyMappings([map('data.nada', 'a'), map('nulo', 'b'), map('data.items[9].nombre', 'c')], body);
    expect(r.values).toEqual({});
    expect(r.missing).toEqual(['data.nada', 'nulo', 'data.items[9].nombre']);
  });

  it('`$` guarda la respuesta completa, JSON o texto', () => {
    expect(applyMappings([map('$', 'todo')], { a: 1 }).values.todo).toBe('{"a":1}');
    expect(applyMappings([map('$', 'todo')], 'texto plano').values.todo).toBe('texto plano');
  });

  it('objetos y listas se guardan como JSON', () => {
    const r = applyMappings([map('data.items', 'lista'), map('data.items[0]', 'uno')], body);
    expect(JSON.parse(r.values.lista)).toEqual(body.data.items);
    expect(r.values.uno).toBe('{"nombre":"Ana"}');
  });

  it('recorta a 4000 caracteres', () => {
    const r = applyMappings([map('t', 'largo')], { t: 'x'.repeat(HTTP_MAX_VALUE_CHARS + 500) });
    expect(r.values.largo).toHaveLength(HTTP_MAX_VALUE_CHARS);
  });

  it('ignora la variable __proto__ y las rutas con claves peligrosas', () => {
    const r = applyMappings(
      [map('a', '__proto__'), map('__proto__.polluted', 'p'), map('constructor.name', 'c')],
      { a: 'x' },
    );
    expect(Object.keys(r.values)).toEqual([]);
    expect(({} as any).polluted).toBeUndefined();
  });

  it('el valor 0 y el texto vacío sí se guardan', () => {
    const r = applyMappings([map('n', 'n'), map('s', 's')], { n: 0, s: '' });
    expect(r.values).toEqual({ n: '0', s: '' });
  });
});

describe('isSensitiveHeader', () => {
  it('detecta encabezados de credenciales', () => {
    for (const h of [
      'Authorization',
      'authorization',
      'Cookie',
      'Proxy-Authorization',
      'X-API-Key',
      'X-Api-Key',
      'X-Custom-Token',
      'X-Secret',
      'X-Auth-User',
    ])
      expect(isSensitiveHeader(h)).toBe(true);
  });

  it('no marca encabezados comunes', () => {
    for (const h of ['Content-Type', 'Accept', 'User-Agent', '', '  '])
      expect(isSensitiveHeader(h)).toBe(false);
  });
});
