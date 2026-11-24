jest.mock('../media/media-storage.service', () => ({
  MediaStorageService: class {},
}));
import { ConversationFlowsService } from './conversation-flows.service';
describe('findTriggerCandidates', () => {
  const flows: any[] = [
    {
      id: 'old',
      name: 'Antiguo',
      status: 'active',
      triggers: {
        keywords: ['hola'],
        matchType: 'exact',
        onNewConversation: true,
        inboxIds: [],
      },
    },
    {
      id: 'low',
      name: 'Baja',
      status: 'active',
      triggers: {
        version: 2,
        items: [
          {
            id: 'a',
            type: 'keyword',
            keywords: ['hola'],
            matchType: 'contains',
          },
        ],
        inboxIds: [],
      },
    },
    {
      id: 'high',
      name: 'Alta',
      status: 'active',
      triggers: {
        version: 2,
        priority: 10,
        items: [
          {
            id: 'b',
            type: 'keyword',
            keywords: ['hola'],
            matchType: 'starts_with',
          },
        ],
        inboxIds: [],
      },
    },
    {
      id: 'otherInbox',
      name: 'Otra',
      status: 'active',
      triggers: {
        version: 2,
        items: [{ id: 'c', type: 'keyword', keywords: ['hola'] }],
        inboxIds: ['x'],
      },
    },
    {
      id: 'sub',
      name: 'Sub',
      status: 'active',
      triggers: {
        version: 2,
        subflowOnly: true,
        items: [{ id: 'd', type: 'keyword', keywords: ['hola'] }],
        inboxIds: [],
      },
    },
    {
      id: 'closed',
      name: 'Cerrado',
      status: 'active',
      triggers: {
        version: 2,
        items: [{ id: 'e', type: 'keyword', keywords: ['hola'] }],
        inboxIds: [],
        schedule: { mode: 'inside', days: [0], from: '08:00', to: '09:00' },
      },
    },
    {
      id: 'tpl',
      name: 'Tpl',
      status: 'active',
      triggers: {
        version: 2,
        items: [
          {
            id: 'f',
            type: 'template_reply',
            templateName: 'promo',
            buttons: ['Sí'],
            withinHours: 72,
          },
        ],
        inboxIds: [],
      },
    },
  ];
  const repo: any = { find: jest.fn(async () => flows) };
  const svc = new ConversationFlowsService(
    repo,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );
  const now = new Date('2025-01-10T15:00:00Z'); // viernes 10:00 Bogotá

  it('ordena por prioridad y aplica bandeja, subflujo y horario', async () => {
    const c = await svc.findTriggerCandidates(
      't',
      'inbox1',
      { kind: 'keyword', text: 'Hola buenas' },
      now,
    );
    expect(c.map((x) => x.flow.id)).toEqual(['high', 'low']);
    expect(c[0].variables).toEqual({
      trigger_type: 'keyword',
      trigger_keyword: 'hola',
    });
    const exact = await svc.findTriggerCandidates(
      't',
      'inbox1',
      { kind: 'keyword', text: 'hola' },
      now,
    );
    expect(exact.map((x) => x.flow.id)).toEqual(['high', 'old', 'low']);
  });

  it('conversación nueva desde el formato antiguo y respuesta a plantilla', async () => {
    const n = await svc.findTriggerCandidates(
      't',
      'inbox1',
      { kind: 'new_conversation' },
      now,
    );
    expect(n.map((x) => x.flow.id)).toEqual(['old']);
    const t = await svc.findTriggerCandidates(
      't',
      'inbox1',
      {
        kind: 'template_reply',
        reply: {
          templateName: 'PROMO',
          button: 'si',
          sentAt: new Date('2025-01-09T15:00:00Z'),
        },
      },
      now,
    );
    expect(t.map((x) => x.flow.id)).toEqual(['tpl']);
    expect(t[0].variables.template_button).toBe('si');
  });

  it('el saneado rechaza regex inválida y limpia la audiencia', () => {
    const s = (svc as any).sanitizeTriggers.bind(svc);
    expect(() =>
      s({
        version: 2,
        items: [{ type: 'keyword', matchType: 'regex', keywords: ['(abc'] }],
      }),
    ).toThrow(/no es válida/);
    const out = s({
      version: 2,
      items: [],
      audience: {
        match: 'any',
        rules: [{ source: 'label', operator: 'is_set', field: 'l1' }],
      },
    });
    expect(out.audience.match).toBe('any');
    expect(out.audience.rules[0]).toMatchObject({
      source: 'label',
      operator: 'is_set',
      field: 'l1',
    });
    expect(
      s({ version: 2, items: [], audience: { rules: [] } }).audience,
    ).toBeUndefined();
  });
});
