import 'reflect-metadata';
import { ConversationFlowEngine } from './conversation-flow.engine';
import { ConversationFlow } from './conversation-flow.entity';

const flow = {
  id: 'f1',
  tenantId: 't1',
  name: 'Prueba',
  status: 'active',
  nodes: [
    { id: 'start', type: 'start', position: { x: 0, y: 0 }, data: {} },
    {
      id: 'ai',
      type: 'ai_agent',
      position: { x: 0, y: 0 },
      data: {
        agent: {
          source: 'custom',
          instructions: 'Averigua el requerimiento',
          outcomes: [{ id: 'o1', name: 'Listo' }],
          collect: [
            { variable: 'requerimiento', description: 'lo que pide', saveToField: 'resumen_requerimiento' },
            { variable: 'area', description: 'el área' },
          ],
        },
      },
    },
  ],
  edges: [{ id: 'e1', source: 'start', sourceHandle: 'next', target: 'ai' }],
} as unknown as ConversationFlow;

describe('Conversación con IA: datos conocidos', () => {
  it('no da por sabido lo que el nodo debe averiguar, pero sí el resto del contacto', async () => {
    const converse = jest.fn().mockResolvedValue({ reply: 'Hola', saved: {} });
    const engine = new ConversationFlowEngine({ converse } as any);
    await engine.start(
      flow,
      { requerimiento: 'viejo', area: 'viejo', otra: 'x' },
      async () => null,
      { hasContact: true, contact: { resumen_requerimiento: 'viejo', city: 'Cali' } },
    );
    expect(converse).toHaveBeenCalledTimes(1);
    expect(converse.mock.calls[0][0].known.data).toEqual({ city: 'Cali', otra: 'x' });
  });

  it('lo que la IA averigua reemplaza el valor del CRM y de la variable', async () => {
    const converse = jest
      .fn()
      .mockResolvedValueOnce({ reply: 'Hola', saved: {} })
      .mockResolvedValueOnce({ reply: '', saved: { requerimiento: 'nuevo', area: 'Research' } });
    const engine = new ConversationFlowEngine({ converse } as any);
    const start = await engine.start(flow, { requerimiento: 'viejo' }, async () => null, {
      hasContact: true,
      contact: { resumen_requerimiento: 'viejo' },
    });
    const next = await engine.resume(
      start.state,
      start.variables,
      { text: 'Quiero un estudio de mercado' },
      async () => flow,
      { hasContact: true, contact: { resumen_requerimiento: 'viejo' } },
    );
    expect(next.variables.requerimiento).toBe('nuevo');
    expect(next.contactUpdates).toEqual({ resumen_requerimiento: 'nuevo' });
  });
});
