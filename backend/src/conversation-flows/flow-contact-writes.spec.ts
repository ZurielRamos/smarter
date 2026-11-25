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
    ],
    edges: [{ id: 'e1', source: 'start', sourceHandle: 'next', target: 'act' }],
  }) as unknown as ConversationFlow;

describe('escritura de campos del contacto: reemplazar o conservar', () => {
  const engine = new ConversationFlowEngine();
  const run = (actions: any[], contact: Record<string, string>) =>
    engine.start(flowWith(actions), {}, async () => null, { hasContact: true, contact });

  it('por defecto reemplaza el dato que ya tiene el contacto', async () => {
    const r = await run([{ type: 'update_contact', field: 'city', value: 'Bogotá' }], { city: 'Cali' });
    expect(r.contactUpdates).toEqual({ city: 'Bogotá' });
  });

  it('con keepExisting conserva el dato si ya tiene valor', async () => {
    const r = await run([{ type: 'update_contact', field: 'city', value: 'Bogotá', keepExisting: true }], { city: 'Cali' });
    expect(r.contactUpdates).toEqual({});
  });

  it('con keepExisting escribe si el campo está vacío', async () => {
    const r = await run([{ type: 'update_contact', field: 'city', value: 'Bogotá', keepExisting: true }], { city: '  ' });
    expect(r.contactUpdates).toEqual({ city: 'Bogotá' });
    const r2 = await run([{ type: 'update_contact', field: 'city', value: 'Bogotá', keepExisting: true }], {});
    expect(r2.contactUpdates).toEqual({ city: 'Bogotá' });
  });

  it('dos escrituras al mismo campo en el turno: la segunda reemplaza, o se conserva la primera con keepExisting', async () => {
    const replace = await run(
      [
        { type: 'update_contact', field: 'city', value: 'Cali' },
        { type: 'update_contact', field: 'city', value: 'Bogotá' },
      ],
      {},
    );
    expect(replace.contactUpdates).toEqual({ city: 'Bogotá' });
    const keep = await run(
      [
        { type: 'update_contact', field: 'city', value: 'Cali' },
        { type: 'update_contact', field: 'city', value: 'Bogotá', keepExisting: true },
      ],
      {},
    );
    expect(keep.contactUpdates).toEqual({ city: 'Cali' });
  });
});
