import 'reflect-metadata';

// Estos módulos usan dependencias ESM que Jest no transforma y aquí no se usan.
jest.mock('../media/media-storage.service', () => ({ MediaStorageService: class {} }));
import { ChatsService } from './chats.service';
import { CONTACT_SYSTEM_FIELDS } from '../conversation-flows/contact-fields.util';

/** ChatsService sin dependencias: solo lo que usa applyFlowContactUpdates. */
function build(record: any) {
  const svc: any = Object.create(ChatsService.prototype);
  svc.clientRecordRepo = {
    findOne: jest.fn().mockResolvedValue(record),
    save: jest.fn(async (r: any) => r),
  };
  svc.conversationFlowsService = {
    getVariableCatalog: jest.fn().mockResolvedValue({
      special: [],
      crm: CONTACT_SYSTEM_FIELDS.map((f) =>
        f.key === 'status' ? { ...f, options: ['1. Captura en Curso', '2. Cerrado'] } : f,
      ),
      custom: [
        { key: 'resumen_requerimiento', label: 'Resumen Requerimiento', fieldType: 'text', writable: true },
        { key: 'presupuesto', label: 'Presupuesto', fieldType: 'number', writable: true },
      ],
    }),
  };
  svc.createSystemNote = jest.fn().mockResolvedValue(undefined);
  const apply = (updates: Record<string, string>) =>
    svc.applyFlowContactUpdates({ channel: 'whatsapp', tenantId: 't1' }, { id: 'c1', recordId: record.id }, updates);
  return { svc, apply };
}

describe('applyFlowContactUpdates: reemplaza lo que ya hay', () => {
  it('reemplaza un campo personalizado que ya tenía valor', async () => {
    const record = { id: 'r1', customData: { resumen_requerimiento: 'viejo' } };
    const { svc, apply } = build(record);
    await apply({ resumen_requerimiento: 'nuevo' });
    expect(svc.clientRecordRepo.save).toHaveBeenCalledTimes(1);
    expect(record.customData.resumen_requerimiento).toBe('nuevo');
  });

  it('reemplaza campos del sistema y respeta las opciones de la cuenta (estado)', async () => {
    const record: any = { id: 'r1', city: 'Cali', status: 'lead', customData: {} };
    const { apply } = build(record);
    await apply({ city: 'Bogotá', status: '1. Captura en Curso' });
    expect(record.city).toBe('Bogotá');
    expect(record.status).toBe('1. Captura en Curso');
  });

  it('un estado que no está en las opciones de la cuenta no se guarda', async () => {
    const record: any = { id: 'r1', status: 'lead', customData: {} };
    const { svc, apply } = build(record);
    await apply({ status: 'fidelizado' });
    expect(record.status).toBe('lead');
    expect(svc.clientRecordRepo.save).not.toHaveBeenCalled();
  });

  it('guarda números como número y no guarda si el valor es el mismo', async () => {
    const record: any = { id: 'r1', customData: { presupuesto: 100 } };
    const { svc, apply } = build(record);
    await apply({ presupuesto: '2500' });
    expect(record.customData.presupuesto).toBe(2500);
    svc.clientRecordRepo.save.mockClear();
    await apply({ presupuesto: '2500' });
    expect(svc.clientRecordRepo.save).not.toHaveBeenCalled();
  });
});
