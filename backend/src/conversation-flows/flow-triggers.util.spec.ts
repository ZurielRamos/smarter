import {
  frequencySince,
  hasAutoTriggers,
  inSchedule,
  matchAdClick,
  matchKeyword,
  matchTemplateReply,
  normalizeTriggers,
} from './flow-triggers.util';
import { FlowTrigger } from './conversation-flow.entity';

// Bogotá es UTC-5 todo el año: 15:00 UTC = 10:00 en Bogotá.
const at = (iso: string) => new Date(iso);

describe('normalizeTriggers', () => {
  it('convierte el formato antiguo', () => {
    const t = normalizeTriggers({
      keywords: ['Me Interesa'],
      matchType: 'contains',
      onNewConversation: true,
      inboxIds: ['i1'],
    });
    expect(t).toEqual({
      version: 2,
      items: [
        {
          id: 'kw',
          type: 'keyword',
          keywords: ['Me Interesa'],
          matchType: 'contains',
        },
        { id: 'new', type: 'new_conversation' },
      ],
      inboxIds: ['i1'],
    });
  });

  it('descarta lo desconocido y limita valores', () => {
    const t = normalizeTriggers({
      version: 2,
      items: [
        { id: 'a', type: 'nope' },
        { id: 'b', type: 'template_reply', withinHours: 99999 },
        { id: 'b', type: 'new_conversation' },
      ],
      inboxIds: [],
      priority: 500,
      frequency: { mode: 'cooldown', after: 0 },
      schedule: { mode: 'inside', days: [], from: '08:00', to: '18:00' },
    });
    expect(t.items.map((i) => i.id)).toEqual(['b', 'b_3']);
    expect(t.items[0].withinHours).toBe(720);
    expect(t.priority).toBe(100);
    expect(t.frequency).toBeUndefined();
    expect(t.schedule).toBeUndefined();
  });

  it('sin palabras clave ni otros disparadores no inicia solo', () => {
    expect(hasAutoTriggers(normalizeTriggers({ keywords: [] }))).toBe(false);
    expect(
      hasAutoTriggers(
        normalizeTriggers({
          version: 2,
          items: [{ type: 'ad_click' }],
          subflowOnly: true,
        }),
      ),
    ).toBe(false);
  });
});

describe('matchKeyword', () => {
  const kw = (
    matchType: FlowTrigger['matchType'],
    keywords: string[],
    exclude?: string[],
  ) =>
    ({ id: 'k', type: 'keyword', matchType, keywords, exclude }) as FlowTrigger;

  it('exacta, sin tildes ni mayúsculas', () => {
    expect(matchKeyword(kw('exact', ['Menú']), '  menu ')).toBe('Menú');
    expect(matchKeyword(kw('exact', ['menu']), 'ver menu')).toBeNull();
  });

  it('contiene y empieza por', () => {
    expect(
      matchKeyword(kw('contains', ['precio']), '¿Cuál es el PRECIO?'),
    ).toBe('precio');
    expect(matchKeyword(kw('starts_with', ['hola']), 'Hola, quiero info')).toBe(
      'hola',
    );
    expect(matchKeyword(kw('starts_with', ['hola']), 'holanda')).toBeNull();
  });

  it('expresión regular y exclusiones', () => {
    expect(
      matchKeyword(kw('regex', ['^pedido\\s*#?\\d+$']), 'Pedido #123'),
    ).toBe('^pedido\\s*#?\\d+$');
    expect(
      matchKeyword(kw('contains', ['info'], ['no quiero']), 'no quiero info'),
    ).toBeNull();
  });
});

describe('matchTemplateReply', () => {
  const now = at('2025-01-10T15:00:00Z');
  const sentAt = at('2025-01-10T12:00:00Z');
  const t = (extra: Partial<FlowTrigger>) =>
    ({
      id: 't',
      type: 'template_reply',
      withinHours: 72,
      ...extra,
    }) as FlowTrigger;

  it('plantilla y botón', () => {
    const reply = {
      templateName: 'promo_enero',
      button: 'Me interesa',
      sentAt,
    };
    expect(
      matchTemplateReply(t({ templateName: 'promo_enero' }), reply, now),
    ).toBe(true);
    expect(matchTemplateReply(t({ templateName: 'otra' }), reply, now)).toBe(
      false,
    );
    expect(
      matchTemplateReply(t({ buttons: ['me interesa'] }), reply, now),
    ).toBe(true);
    expect(matchTemplateReply(t({ buttons: ['No gracias'] }), reply, now)).toBe(
      false,
    );
  });

  it('texto libre solo con anyReply, y dentro del plazo', () => {
    const reply = { templateName: 'promo', button: null, sentAt };
    expect(matchTemplateReply(t({}), reply, now)).toBe(false);
    expect(matchTemplateReply(t({ anyReply: true }), reply, now)).toBe(true);
    expect(
      matchTemplateReply(t({ anyReply: true, withinHours: 2 }), reply, now),
    ).toBe(false);
  });
});

describe('matchAdClick', () => {
  const ad = { sourceId: '120200', headline: 'Promo de verano 2x1' };
  it('filtra por id y titular', () => {
    expect(matchAdClick({ id: 'a', type: 'ad_click' }, ad)).toBe(true);
    expect(
      matchAdClick({ id: 'a', type: 'ad_click', adIds: ['999'] }, ad),
    ).toBe(false);
    expect(
      matchAdClick(
        { id: 'a', type: 'ad_click', headlineContains: 'VERANO' },
        ad,
      ),
    ).toBe(true);
  });
});

describe('inSchedule', () => {
  // 2025-01-10 es viernes (5).
  const schedule = {
    mode: 'inside' as const,
    days: [1, 2, 3, 4, 5],
    from: '08:00',
    to: '18:00',
  };
  it('dentro y fuera del horario', () => {
    expect(inSchedule(schedule, at('2025-01-10T15:00:00Z'))).toBe(true); // vie 10:00
    expect(inSchedule(schedule, at('2025-01-11T15:00:00Z'))).toBe(false); // sáb
    expect(
      inSchedule({ ...schedule, mode: 'outside' }, at('2025-01-11T15:00:00Z')),
    ).toBe(true);
    expect(inSchedule(null, at('2025-01-11T15:00:00Z'))).toBe(true);
  });
  it('horario que cruza la medianoche', () => {
    const night = {
      mode: 'inside' as const,
      days: [5],
      from: '22:00',
      to: '06:00',
    };
    expect(inSchedule(night, at('2025-01-11T04:00:00Z'))).toBe(true); // vie 23:00
    expect(inSchedule(night, at('2025-01-11T09:00:00Z'))).toBe(true); // sáb 04:00
    expect(inSchedule(night, at('2025-01-11T12:00:00Z'))).toBe(false); // sáb 07:00
  });
});

describe('frequencySince', () => {
  const now = at('2025-01-10T15:00:00Z');
  it('calcula la ventana', () => {
    expect(frequencySince(null, now)).toBeNull();
    expect(frequencySince({ mode: 'once' }, now)?.getTime()).toBe(0);
    expect(
      frequencySince(
        { mode: 'cooldown', after: 2, unit: 'days' },
        now,
      )?.toISOString(),
    ).toBe('2025-01-08T15:00:00.000Z');
  });
});
