jest.mock('../media/media-storage.service', () => ({
  MediaStorageService: class {},
}));
import { ChatsService } from './chats.service';
import {
  isBusinessHistoryMessage,
  mapHistoryStatus,
  normalizeWhatsAppMessage,
  parseStateSyncContact,
  resolveEchoContact,
  resolveThreadContact,
  unixToDate,
} from './whatsapp-coexistence.util';

const PHONE_ID = '106540352242922';
const BUSINESS = '15550783881';
const USER = '16505551234';

describe('whatsapp-coexistence.util', () => {
  it('normaliza texto, multimedia y placeholders', () => {
    expect(
      normalizeWhatsAppMessage({ type: 'text', text: { body: 'hola' } }),
    ).toMatchObject({ messageType: 'text', content: 'hola' });
    expect(
      normalizeWhatsAppMessage({
        type: 'image',
        image: { id: 'm1', caption: 'foto', mime_type: 'image/jpeg' },
      }),
    ).toMatchObject({
      messageType: 'image',
      content: 'foto',
      mediaId: 'm1',
      mediaMimeType: 'image/jpeg',
    });
    expect(normalizeWhatsAppMessage({ type: 'media_placeholder' })).toMatchObject(
      { messageType: 'text', mediaId: null },
    );
    expect(normalizeWhatsAppMessage({ type: 'reaction' }).content).toBe(
      '[reaction]',
    );
  });

  it('mapea estados del historial', () => {
    expect(mapHistoryStatus('played')).toBe('read');
    expect(mapHistoryStatus('read')).toBe('read');
    expect(mapHistoryStatus('delivered')).toBe('delivered');
    expect(mapHistoryStatus('error')).toBe('failed');
    expect(mapHistoryStatus('pending')).toBe('sent');
    expect(mapHistoryStatus(undefined)).toBe('sent');
  });

  it('distingue mensajes del negocio y del usuario en el historial', () => {
    expect(isBusinessHistoryMessage({ from: BUSINESS }, BUSINESS)).toBe(true);
    expect(isBusinessHistoryMessage({ from: '+1 555-078-3881' }, BUSINESS)).toBe(
      true,
    );
    expect(isBusinessHistoryMessage({ from: USER }, BUSINESS)).toBe(false);
    expect(
      isBusinessHistoryMessage({ from_user_id: 'CO.123' }, BUSINESS),
    ).toBe(false);
    expect(isBusinessHistoryMessage({ to: USER }, BUSINESS)).toBe(true);
  });

  it('resuelve el contacto de un eco y de un hilo', () => {
    expect(
      resolveEchoContact({ to: USER }, [{ wa_id: 'x', profile: { username: 'u' } }]),
    ).toEqual({ waId: USER, userId: null, name: 'u' });
    expect(resolveEchoContact({ to_user_id: 'CO.9' }, undefined)).toMatchObject({
      waId: null,
      userId: 'CO.9',
    });
    expect(
      resolveThreadContact({ id: USER, context: { user_id: 'CO.1' } }),
    ).toEqual({ waId: USER, userId: 'CO.1', name: null });
  });

  it('parsea contactos de state sync', () => {
    expect(
      parseStateSyncContact({
        type: 'contact',
        action: 'add',
        contact: { full_name: 'Pablo Morales', phone_number: '+1 650 555 1234' },
      }),
    ).toEqual({
      action: 'add',
      phone: '16505551234',
      userId: null,
      fullName: 'Pablo Morales',
    });
    expect(parseStateSyncContact({ type: 'other' })).toBeNull();
    expect(
      parseStateSyncContact({
        type: 'contact',
        action: 'remove',
        contact: { phone_number: USER },
      })?.action,
    ).toBe('remove');
  });

  it('convierte timestamps Unix', () => {
    expect(unixToDate('1700255121').getTime()).toBe(1700255121000);
  });
});

function buildService() {
  const svc: any = Object.create(ChatsService.prototype);
  const inbox: any = {
    id: 'inbox1',
    tenantId: 'ten1',
    channel: 'whatsapp',
    phoneNumberId: PHONE_ID,
    accessToken: 'tok',
    metadata: { coexistence: { enabled: true, onboardedAt: new Date().toISOString() } },
  };
  const conversation: any = {
    id: 'conv1',
    inboxId: 'inbox1',
    contactId: USER,
    recordId: 'rec1',
    unreadCount: 3,
    lastMessageAt: null,
  };
  svc.inboxRepo = {
    findOne: jest.fn(async () => inbox),
    update: jest.fn(async () => undefined),
    find: jest.fn(async () => [inbox]),
  };
  svc.conversationRepo = {
    findOne: jest.fn(async () => conversation),
    save: jest.fn(async (c: any) => c),
    create: jest.fn((c: any) => ({ id: 'convNew', ...c })),
  };
  const saved: any[] = [];
  svc.messageRepo = {
    findOne: jest.fn(async () => null),
    find: jest.fn(async () => []),
    create: jest.fn((m: any) => ({ ...m })),
    save: jest.fn(async (m: any) => {
      if (Array.isArray(m)) saved.push(...m);
      else saved.push(m);
      return m;
    }),
  };
  svc.clientRecordRepo = {
    findOne: jest.fn(async () => null),
    create: jest.fn((r: any) => r),
    save: jest.fn(async (r: any) => r),
  };
  svc.chatsGateway = {
    emitNewMessage: jest.fn(),
    emitConversationUpdate: jest.fn(),
  };
  svc.mediaStorageService = {
    processWhatsAppMedia: jest.fn(async () => ({
      url: 'https://cdn/x.jpg',
      mimeType: 'image/jpeg',
    })),
  };
  svc.findRecordByPhoneFlexible = jest.fn(async () => null);
  return { svc, inbox, conversation, saved };
}

const echoPayload = (extra: any = {}) => ({
  metadata: { display_phone_number: BUSINESS, phone_number_id: PHONE_ID },
  message_echoes: [
    {
      from: BUSINESS,
      to: USER,
      id: 'wamid.ECHO1',
      timestamp: '1700255121',
      type: 'text',
      text: { body: 'Desde la app' },
      ...extra,
    },
  ],
});

describe('smb_message_echoes', () => {
  it('guarda el eco como saliente, sin tocar no leídos ni disparar automatizaciones', async () => {
    const { svc, conversation, saved } = buildService();
    svc.runInboxAutomations = jest.fn();
    svc.notifyInboundMessage = jest.fn();

    await svc.handleWhatsAppMessageEchoes(echoPayload());

    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      conversationId: 'conv1',
      direction: 'outbound',
      content: 'Desde la app',
      externalId: 'wamid.ECHO1',
      source: 'app',
      status: 'sent',
    });
    expect(conversation.unreadCount).toBe(3);
    expect(conversation.lastMessage).toBe('Desde la app');
    expect(conversation.lastMessageSource).toBe('app');
    expect(svc.runInboxAutomations).not.toHaveBeenCalled();
    expect(svc.notifyInboundMessage).not.toHaveBeenCalled();
    expect(svc.chatsGateway.emitNewMessage).toHaveBeenCalledTimes(1);
  });

  it('ignora un eco duplicado (idempotencia por external_id)', async () => {
    const { svc, saved } = buildService();
    svc.messageRepo.findOne = jest.fn(async () => ({ id: 'ya' }));
    await svc.handleWhatsAppMessageEchoes(echoPayload());
    expect(saved).toHaveLength(0);
  });

  it('descarga el archivo de un eco multimedia', async () => {
    const { svc, saved } = buildService();
    await svc.handleWhatsAppMessageEchoes(
      echoPayload({
        type: 'image',
        text: undefined,
        image: { id: 'media1', mime_type: 'image/jpeg', caption: 'foto' },
      }),
    );
    expect(svc.mediaStorageService.processWhatsAppMedia).toHaveBeenCalledWith(
      'media1',
      'tok',
      expect.objectContaining({ tenantId: 'ten1', conversationId: 'conv1' }),
    );
    expect(saved[0]).toMatchObject({
      messageType: 'image',
      mediaUrl: 'https://cdn/x.jpg',
      content: 'foto',
    });
  });

  it('no hace nada si no existe el inbox', async () => {
    const { svc, saved } = buildService();
    svc.inboxRepo.findOne = jest.fn(async () => null);
    await svc.handleWhatsAppMessageEchoes(echoPayload());
    expect(saved).toHaveLength(0);
  });
});

describe('history', () => {
  const historyPayload = (messages: any[], progress = 55) => ({
    metadata: { display_phone_number: BUSINESS, phone_number_id: PHONE_ID },
    history: [
      {
        metadata: { phase: 0, chunk_order: 1, progress },
        threads: [{ id: USER, messages }],
      },
    ],
  });

  it('importa mensajes con dirección, estado y fecha correctos', async () => {
    const { svc, conversation, saved } = buildService();
    await svc.handleWhatsAppHistory(
      historyPayload([
        {
          from: USER,
          id: 'w2',
          timestamp: '1739230970',
          type: 'text',
          text: { body: 'Thanks!' },
          history_context: { status: 'read' },
        },
        {
          from: BUSINESS,
          id: 'w1',
          timestamp: '1739230955',
          type: 'text',
          text: { body: 'Info' },
          history_context: { status: 'read' },
        },
        {
          from: BUSINESS,
          id: 'w3',
          timestamp: '1739230960',
          type: 'media_placeholder',
          history_context: { status: 'played' },
        },
      ]),
    );

    expect(saved.map((m) => m.externalId)).toEqual(['w1', 'w3', 'w2']);
    expect(saved[0]).toMatchObject({ direction: 'outbound', status: 'read', source: 'app' });
    expect(saved[0].createdAt.getTime()).toBe(1739230955000);
    expect(saved[2]).toMatchObject({ direction: 'inbound', status: 'delivered', source: null });
    expect(conversation.lastMessage).toBe('Thanks!');
    expect(conversation.unreadCount).toBe(3);
    expect(svc.chatsGateway.emitNewMessage).not.toHaveBeenCalled();
    // progreso y total quedan guardados
    const patch = svc.inboxRepo.update.mock.calls.at(-1)[1].metadata.coexistence;
    expect(patch).toMatchObject({
      historyStatus: 'shared',
      historyProgress: 55,
      historyMessagesImported: 3,
    });
  });

  it('omite mensajes ya guardados', async () => {
    const { svc, saved } = buildService();
    svc.messageRepo.find = jest.fn(async () => [{ externalId: 'w1' }]);
    await svc.handleWhatsAppHistory(
      historyPayload([
        { from: BUSINESS, id: 'w1', timestamp: '1', type: 'text', text: { body: 'a' } },
        { from: BUSINESS, id: 'w2', timestamp: '2', type: 'text', text: { body: 'b' } },
      ]),
    );
    expect(saved.map((m) => m.externalId)).toEqual(['w2']);
  });

  it('no pisa la vista previa si ya hay un mensaje más reciente', async () => {
    const { svc, conversation } = buildService();
    conversation.lastMessage = 'reciente';
    conversation.lastMessageAt = new Date('2030-01-01');
    await svc.handleWhatsAppHistory(
      historyPayload([
        { from: USER, id: 'w1', timestamp: '1739230970', type: 'text', text: { body: 'viejo' } },
      ]),
    );
    expect(conversation.lastMessage).toBe('reciente');
  });

  it('marca el historial como rechazado (error 2593109)', async () => {
    const { svc, saved } = buildService();
    await svc.handleWhatsAppHistory({
      metadata: { phone_number_id: PHONE_ID },
      history: [{ errors: [{ code: 2593109, title: 'off' }] }],
    });
    expect(saved).toHaveLength(0);
    const patch = svc.inboxRepo.update.mock.calls.at(-1)[1].metadata.coexistence;
    expect(patch.historyStatus).toBe('declined');
  });

  it('adjunta el archivo cuando llega el webhook de multimedia', async () => {
    const { svc } = buildService();
    const existing: any = {
      id: 'm1',
      conversationId: 'conv1',
      messageType: 'text',
      content: '[Archivo multimedia no disponible]',
      mediaUrl: null,
    };
    svc.messageRepo.findOne = jest.fn(async () => existing);
    await svc.handleWhatsAppHistory({
      metadata: { phone_number_id: PHONE_ID },
      messages: [
        {
          from: USER,
          id: 'w9',
          type: 'image',
          image: { id: 'media9', caption: 'Echeveria', mime_type: 'image/jpeg' },
        },
      ],
    });
    expect(existing).toMatchObject({
      messageType: 'image',
      mediaUrl: 'https://cdn/x.jpg',
      content: 'Echeveria',
    });
  });
});

describe('smb_app_state_sync', () => {
  const payload = (state_sync: any[]) => ({
    metadata: { phone_number_id: PHONE_ID },
    state_sync,
  });

  it('crea contactos nuevos y no borra al recibir remove', async () => {
    const { svc } = buildService();
    svc.clientRecordRepo.delete = jest.fn();
    svc.clientRecordRepo.softDelete = jest.fn();
    await svc.handleWhatsAppStateSync(
      payload([
        {
          type: 'contact',
          action: 'add',
          contact: { full_name: 'Pablo Morales', phone_number: USER },
        },
        { type: 'contact', action: 'remove', contact: { phone_number: '999999999' } },
      ]),
    );
    expect(svc.clientRecordRepo.save).toHaveBeenCalledTimes(1);
    expect(svc.clientRecordRepo.save.mock.calls[0][0]).toMatchObject({
      tenantId: 'ten1',
      phone: USER,
      firstName: 'Pablo',
      lastName: 'Morales',
    });
    expect(svc.clientRecordRepo.delete).not.toHaveBeenCalled();
    expect(svc.clientRecordRepo.softDelete).not.toHaveBeenCalled();
  });

  it('solo completa el nombre de un contacto existente sin nombre', async () => {
    const { svc } = buildService();
    const rec: any = { id: 'r1', firstName: '', lastName: '', phone: USER };
    svc.findRecordByPhoneFlexible = jest.fn(async () => rec);
    await svc.handleWhatsAppStateSync(
      payload([
        { type: 'contact', action: 'add', contact: { full_name: 'Ana Gil', phone_number: USER } },
      ]),
    );
    expect(rec).toMatchObject({ firstName: 'Ana', lastName: 'Gil' });
  });
});

describe('PARTNER_REMOVED', () => {
  it('desconecta solo inboxes en coexistencia', async () => {
    const { svc, inbox } = buildService();
    inbox.wabaId = 'W1';
    await svc.handleWhatsAppPartnerRemoved({
      event: 'PARTNER_REMOVED',
      waba_info: { waba_id: 'W1' },
      disconnection_info: { reason: 'USER_DISCONNECTED', initiated_by: 'USER' },
    });
    expect(svc.inboxRepo.update).toHaveBeenCalledWith(
      'inbox1',
      expect.objectContaining({ status: 'disconnected' }),
    );

    svc.inboxRepo.update.mockClear();
    inbox.metadata = {};
    await svc.handleWhatsAppPartnerRemoved({ waba_info: { waba_id: 'W1' } });
    expect(svc.inboxRepo.update).not.toHaveBeenCalled();
  });
});

describe('runCoexistenceSync', () => {
  const okFetch = (ids: string[]) => {
    const f = jest.fn();
    ids.forEach((id) =>
      f.mockResolvedValueOnce({ ok: true, json: async () => ({ request_id: id }) }),
    );
    return f;
  };
  afterEach(() => {
    delete (global as any).fetch;
  });

  it('pide contactos y luego historial, y guarda los request_id', async () => {
    const { svc } = buildService();
    (global as any).fetch = okFetch(['r1', 'r2']);
    const res = await svc.runCoexistenceSync('inbox1');
    const calls = (global as any).fetch.mock.calls;
    expect(calls.map((c: any) => JSON.parse(c[1].body).sync_type)).toEqual([
      'smb_app_state_sync',
      'history',
    ]);
    expect(calls[0][0]).toContain(`/${PHONE_ID}/smb_app_data`);
    expect(res).toMatchObject({ ok: true, contacts: 'ok', history: 'ok' });
  });

  it('omite los pasos ya completados al reintentar', async () => {
    const { svc, inbox } = buildService();
    inbox.metadata.coexistence.contactsSync = { status: 'ok', at: 'x' };
    (global as any).fetch = okFetch(['r2']);
    const res = await svc.runCoexistenceSync('inbox1');
    expect((global as any).fetch).toHaveBeenCalledTimes(1);
    expect(res.contacts).toBe('already_done');
  });

  it('rechaza si pasaron más de 24 h', async () => {
    const { svc, inbox } = buildService();
    inbox.metadata.coexistence.onboardedAt = new Date(
      Date.now() - 25 * 3600 * 1000,
    ).toISOString();
    (global as any).fetch = jest.fn();
    const res = await svc.runCoexistenceSync('inbox1');
    expect(res.ok).toBe(false);
    expect((global as any).fetch).not.toHaveBeenCalled();
  });

  it('registra el fallo de un paso y devuelve ok=false', async () => {
    const { svc } = buildService();
    (global as any).fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: { message: 'boom' } }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ request_id: 'r2' }) });
    const res = await svc.runCoexistenceSync('inbox1');
    expect(res).toMatchObject({ ok: false, contacts: 'failed', history: 'ok' });
  });
});
