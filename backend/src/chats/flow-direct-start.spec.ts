jest.mock('../media/media-storage.service', () => ({
  MediaStorageService: class {},
}));
import { BadRequestException } from '@nestjs/common';
import { ChatsService } from './chats.service';

/** ChatsService con solo las dependencias que usa el inicio directo. */
function build(opts: {
  windowOpen: boolean;
  channel?: string;
  flowStatus?: string;
}) {
  const svc: any = Object.create(ChatsService.prototype);
  const conversation: any = {
    id: 'conv1',
    recordId: 'rec1',
    flowVariables: { previa: '1' },
    flowState: { flowId: 'old', nodeId: 'n', waitingFor: 'input' },
    inbox: {
      id: 'inbox1',
      tenantId: 'ten1',
      channel: opts.channel ?? 'whatsapp',
    },
  };
  const flow = {
    id: 'flow1',
    name: 'Me interesa',
    status: opts.flowStatus ?? 'active',
  };
  svc.conversationRepo = {
    findOne: jest.fn(async () => ({ ...conversation })),
    save: jest.fn(async (c: any) => c),
  };
  svc.messageRepo = { update: jest.fn(async () => undefined) };
  svc.conversationFlowsService = { loadForTenant: jest.fn(async () => flow) };
  svc.conversationFlowEngine = {
    start: jest.fn(async () => ({
      handled: true,
      messages: [],
      state: null,
      startedFlowIds: ['flow1'],
    })),
  };
  svc.flowTimersService = {
    cancelForConversation: jest.fn(async () => undefined),
  };
  svc.isServiceWindowOpen = jest.fn(async () => opts.windowOpen);
  svc.withInboundLock = async (_k: string, fn: () => Promise<void>) => fn();
  svc.buildFlowContext = jest.fn(async () => ({}));
  svc.applyFlowResult = jest.fn(async () => undefined);
  svc.createSystemNote = jest.fn(async () => undefined);
  svc.sendTemplateMessage = jest.fn(async () => ({
    id: 'msg1',
    status: 'sent',
  }));
  return { svc, flow };
}

describe('startFlowInConversation', () => {
  it('con la ventana abierta inicia el flujo con las variables y registra el origen', async () => {
    const { svc } = build({ windowOpen: true });
    const r = await svc.startFlowInConversation('conv1', 'flow1', {
      source: 'manual',
      variables: { pedido: 'A-1', 'mala clave': 'x', obj: { a: 1 } },
      performedBy: 'user1',
      performedByName: 'Ana',
    });
    expect(r).toEqual({ status: 'started', conversationId: 'conv1' });
    expect(svc.conversationFlowEngine.start.mock.calls[0][1]).toEqual({
      previa: '1',
      pedido: 'A-1',
      trigger_type: 'manual',
    });
    expect(svc.applyFlowResult.mock.calls[0][4]).toEqual({
      startInfo: { source: 'manual', ref: 'user1' },
    });
    expect(svc.createSystemNote.mock.calls[0][1]).toContain('por Ana');
  });

  it('rechaza un flujo inactivo', async () => {
    const { svc } = build({ windowOpen: true, flowStatus: 'draft' });
    await expect(
      svc.startFlowInConversation('conv1', 'flow1', { source: 'api' }),
    ).rejects.toThrow(/no está activo/);
  });

  it('con la ventana cerrada exige plantilla y en Messenger no se puede', async () => {
    const { svc } = build({ windowOpen: false });
    await expect(
      svc.startFlowInConversation('conv1', 'flow1', { source: 'api' }),
    ).rejects.toThrow(BadRequestException);
    const m = build({ windowOpen: false, channel: 'messenger' }).svc;
    await expect(
      m.startFlowInConversation('conv1', 'flow1', {
        source: 'api',
        template: { name: 'x' },
      }),
    ).rejects.toThrow(/no admite plantillas/);
  });

  it('con la ventana cerrada envía la plantilla y deja el flujo pendiente', async () => {
    const { svc } = build({ windowOpen: false });
    const r = await svc.startFlowInConversation('conv1', 'flow1', {
      source: 'automation',
      variables: { pedido: 'A-1' },
      template: { name: 'seguimiento', language: 'es_CO', params: ['Ana'] },
    });
    expect(r).toEqual({
      status: 'template_sent',
      conversationId: 'conv1',
      messageId: 'msg1',
    });
    expect(svc.sendTemplateMessage.mock.calls[0].slice(0, 4)).toEqual([
      'conv1',
      'seguimiento',
      'es_CO',
      [{ type: 'body', parameters: [{ type: 'text', text: 'Ana' }] }],
    ]);
    expect(svc.messageRepo.update).toHaveBeenCalledWith('msg1', {
      replyFlowId: 'flow1',
      replyFlowSource: 'automation',
    });
    const saved = svc.conversationRepo.save.mock.calls[0][0];
    expect(saved.flowState).toBeNull();
    expect(saved.flowVariables).toEqual({
      previa: '1',
      pedido: 'A-1',
      trigger_type: 'automation',
    });
    expect(svc.conversationFlowEngine.start).not.toHaveBeenCalled();
  });
});

describe('startAssignedReplyFlow', () => {
  const now = new Date('2025-01-10T15:00:00Z');
  const reply = (extra: any) => ({
    templateName: 'seguimiento',
    button: 'Sí',
    sentAt: new Date('2025-01-10T12:00:00Z'),
    campaignId: null,
    replyFlowId: null,
    replyFlowSource: null,
    ...extra,
  });

  it('inicia el flujo pendiente de la plantilla con su origen', async () => {
    const { svc, flow } = build({ windowOpen: true });
    const loader = jest.fn(async () => flow);
    const out = await svc.startAssignedReplyFlow(
      { tenantId: 'ten1' },
      reply({ replyFlowId: 'flow1', replyFlowSource: 'api' }),
      { previa: '1' },
      loader,
      async () => ({}),
      now,
    );
    expect(out.info).toEqual({ source: 'api', ref: null });
    expect(svc.conversationFlowEngine.start.mock.calls[0][1]).toMatchObject({
      trigger_type: 'api',
      template_button: 'Sí',
      previa: '1',
    });
  });

  it('fuera de las 72 h no inicia nada', async () => {
    const { svc, flow } = build({ windowOpen: true });
    const out = await svc.startAssignedReplyFlow(
      { tenantId: 'ten1' },
      reply({ replyFlowId: 'flow1', sentAt: new Date('2025-01-01T00:00:00Z') }),
      {},
      async () => flow,
      async () => ({}),
      now,
    );
    expect(out).toBeNull();
  });

  it('usa el Flujo al responder de la campaña', async () => {
    const { svc, flow } = build({ windowOpen: true });
    svc.campaignRepo = {
      findOne: jest.fn(async () => ({
        id: 'camp1',
        name: 'Enero',
        replyFlowId: 'flow1',
      })),
    };
    const out = await svc.startAssignedReplyFlow(
      { tenantId: 'ten1' },
      reply({ campaignId: 'camp1' }),
      {},
      async () => flow,
      async () => ({}),
      now,
    );
    expect(out.info).toEqual({ source: 'campaign', ref: 'camp1' });
    expect(svc.conversationFlowEngine.start.mock.calls[0][1]).toMatchObject({
      campaign_name: 'Enero',
      trigger_type: 'campaign',
    });
  });
});
