import 'reflect-metadata';
import { ConversationFlowEngine } from './conversation-flow.engine';
import { ConversationFlow } from './conversation-flow.entity';

/** Flujo Inicio → Acción → Mensaje, con las acciones de proyecto dadas. */
const flowWith = (actions: any[]): ConversationFlow =>
  ({
    id: 'f1',
    tenantId: 't1',
    name: 'Prueba',
    status: 'active',
    nodes: [
      { id: 'start', type: 'start', position: { x: 0, y: 0 }, data: {} },
      { id: 'act', type: 'action', position: { x: 0, y: 0 }, data: { actions } },
      { id: 'msg', type: 'message', position: { x: 0, y: 0 }, data: { text: 'Listo' } },
    ],
    edges: [
      { id: 'e1', source: 'start', sourceHandle: 'next', target: 'act' },
      { id: 'e2', source: 'act', sourceHandle: 'next', target: 'msg' },
    ],
  }) as unknown as ConversationFlow;

describe('acciones de proyecto en el nodo Acción', () => {
  const engine = new ConversationFlowEngine();
  const run = (actions: any[]) => engine.start(flowWith(actions), {}, async () => null, { hasContact: true });

  it('las deja como efectos, en orden, y el flujo sigue', async () => {
    const r = await run([
      { type: 'add_to_project', projectId: 'p1', role: 'surveyor', status: 'en_contacto' },
      { type: 'set_project_status', projectId: 'p2', status: 'seleccionado' },
      { type: 'add_to_project', projectId: 'p3' },
    ]);
    expect(r.effects.projectActions).toEqual([
      { type: 'add', projectId: 'p1', role: 'surveyor', status: 'en_contacto' },
      { type: 'status', projectId: 'p2', status: 'seleccionado' },
      { type: 'add', projectId: 'p3' },
    ]);
    expect(r.messages.map((m) => m.text)).toEqual(['Listo']);
  });

  it('omite las acciones incompletas (sin proyecto, o cambio de estado sin estado)', async () => {
    const r = await run([
      { type: 'add_to_project', projectId: '' },
      { type: 'set_project_status', projectId: 'p2' },
    ]);
    expect(r.effects.projectActions).toEqual([]);
  });
});

describe('condiciones de proyecto', () => {
  const { evaluateRule } = jest.requireActual('./flow-conditions.util');
  const env = (projects: Record<string, { status: string; role: string }>) => ({
    now: new Date(),
    lastMessage: '',
    channel: 'whatsapp',
    inboxId: 'i1',
    labelIds: [],
    conversationStatus: 'open',
    inboundCount: 1,
    hasContact: true,
    projects,
    lookup: () => '',
    interpolate: (t: string) => t,
    random: () => 0,
  });
  const rule = (source: string, operator: string, field: string, value?: string) => ({ id: 'r', source, operator, field, value });
  const mine = env({ p1: { status: 'en_espera', role: 'participant' } });
  const none = env({});

  it('está o no está en el proyecto', () => {
    expect(evaluateRule(rule('project', 'is_true', 'p1'), mine)).toBe(true);
    expect(evaluateRule(rule('project', 'is_false', 'p1'), mine)).toBe(false);
    expect(evaluateRule(rule('project', 'is_true', 'p2'), mine)).toBe(false);
    expect(evaluateRule(rule('project', 'is_false', 'p1'), none)).toBe(true);
  });

  it('estado en el proyecto: es uno de / no es ninguno de; sin estar en el proyecto, «no es» se cumple', () => {
    expect(evaluateRule(rule('project_status', 'in_list', 'p1', 'nuevo,en_espera'), mine)).toBe(true);
    expect(evaluateRule(rule('project_status', 'in_list', 'p1', 'seleccionado'), mine)).toBe(false);
    expect(evaluateRule(rule('project_status', 'not_in_list', 'p1', 'seleccionado'), mine)).toBe(true);
    expect(evaluateRule(rule('project_status', 'in_list', 'p1', 'nuevo'), none)).toBe(false);
    expect(evaluateRule(rule('project_status', 'not_in_list', 'p1', 'nuevo'), none)).toBe(true);
  });

  it('perfil en el proyecto', () => {
    expect(evaluateRule(rule('project_role', 'in_list', 'p1', 'participant'), mine)).toBe(true);
    expect(evaluateRule(rule('project_role', 'in_list', 'p1', 'surveyor,moderator'), mine)).toBe(false);
  });

  it('una Condición después de una acción del mismo turno ya ve el cambio', async () => {
    const engine = new ConversationFlowEngine();
    const flow = {
      id: 'f2',
      tenantId: 't1',
      name: 'Encadenado',
      status: 'active',
      nodes: [
        { id: 'start', type: 'start', position: { x: 0, y: 0 }, data: {} },
        { id: 'act', type: 'action', position: { x: 0, y: 0 }, data: { actions: [{ type: 'add_to_project', projectId: 'p9' }, { type: 'set_project_status', projectId: 'p9', status: 'seleccionado' }] } },
        {
          id: 'cond',
          type: 'condition',
          position: { x: 0, y: 0 },
          data: { branches: [{ id: 'b1', name: 'Seleccionado', match: 'all', rules: [rule('project_status', 'in_list', 'p9', 'seleccionado')] }] },
        },
        { id: 'si', type: 'message', position: { x: 0, y: 0 }, data: { text: 'Seleccionado' } },
        { id: 'no', type: 'message', position: { x: 0, y: 0 }, data: { text: 'Otro' } },
      ],
      edges: [
        { id: 'e1', source: 'start', sourceHandle: 'next', target: 'act' },
        { id: 'e2', source: 'act', sourceHandle: 'next', target: 'cond' },
        { id: 'e3', source: 'cond', sourceHandle: 'cond:b1', target: 'si' },
        { id: 'e4', source: 'cond', sourceHandle: 'else', target: 'no' },
      ],
    } as unknown as ConversationFlow;
    const withContact = await engine.start(flow, {}, async () => null, { hasContact: true, projects: {} });
    expect(withContact.messages.map((m) => m.text)).toEqual(['Seleccionado']);
    // Sin contacto no se puede agregar a nadie: la condición no se cumple.
    const noContact = await engine.start(flow, {}, async () => null, { hasContact: false, projects: {} });
    expect(noContact.messages.map((m) => m.text)).toEqual(['Otro']);
  });
});
