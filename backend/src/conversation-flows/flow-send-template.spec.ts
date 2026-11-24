import 'reflect-metadata';
import { ConversationFlowEngine } from './conversation-flow.engine';
import { ConversationFlow } from './conversation-flow.entity';

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

const action = (over: Record<string, unknown> = {}) => ({
  type: 'send_template',
  inboxId: 'i1',
  templateName: 'bienvenida',
  templateLanguage: 'es',
  templateVariables: { body_1: '{{firstName}}', body_2: '{{requerimiento}}' },
  recipients: { mode: 'current' },
  ...over,
});

describe('acción «Enviar plantilla»', () => {
  const engine = new ConversationFlowEngine();
  const run = (a: any, vars: Record<string, string> = {}, ctx: any = { hasContact: true }) =>
    engine.start(flowWith([a]), vars, async () => null, ctx);

  it('deja la plantilla como efecto con los valores sin resolver y las variables del flujo', async () => {
    const r = await run(action(), { requerimiento: 'Estudio de mercado' });
    expect(r.effects.templateSends).toHaveLength(1);
    expect(r.effects.templateSends[0]).toMatchObject({
      inboxId: 'i1',
      templateName: 'bienvenida',
      templateLanguage: 'es',
      templateVariables: { body_1: '{{firstName}}', body_2: '{{requerimiento}}' },
      variables: { requerimiento: 'Estudio de mercado' },
      recipients: { mode: 'current' },
    });
    // El flujo sigue sin esperar al envío.
    expect(r.messages.map((m) => m.text)).toEqual(['Listo']);
  });

  it('sin canal o sin plantilla no hace nada', async () => {
    expect((await run(action({ inboxId: '' }))).effects.templateSends).toEqual([]);
    expect((await run(action({ templateName: '' }))).effects.templateSends).toEqual([]);
  });

  it('al contacto de la conversación exige que exista; a otros contactos o listas no', async () => {
    expect((await run(action(), {}, { hasContact: false })).effects.templateSends).toEqual([]);
    const contacts = await run(action({ recipients: { mode: 'contacts', recordIds: ['a', 'b'] } }), {}, { hasContact: false });
    expect(contacts.effects.templateSends[0].recipients).toEqual({ mode: 'contacts', recordIds: ['a', 'b'] });
    const list = await run(action({ recipients: { mode: 'list', listId: 'l1' } }), {}, { hasContact: false });
    expect(list.effects.templateSends[0].recipients).toEqual({ mode: 'list', listId: 'l1' });
  });

  it('las variables del flujo se copian al efecto (no se comparten por referencia)', async () => {
    const vars = { x: '1' };
    const r = await run(action(), vars);
    vars.x = '2';
    expect(r.effects.templateSends[0].variables.x).toBe('1');
  });
});
