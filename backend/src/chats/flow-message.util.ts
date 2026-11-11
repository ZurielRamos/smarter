/**
 * Constructores de mensajes de flujos por canal.
 *
 * Son funciones puras (sin red ni BD) para poder verificarlas aparte. Reglas de
 * Meta que condicionan el diseño (verificadas en la documentación oficial):
 *  - WhatsApp: un mensaje interactivo lleva botones de respuesta (máx. 3), una
 *    lista (máx. 10) o UN solo botón de URL (cta_url). No se pueden mezclar.
 *    No existe botón de llamada fuera de plantillas.
 *  - WhatsApp: el encabezado multimedia solo lo admiten los botones de respuesta
 *    y cta_url; las listas solo admiten encabezado de texto.
 *  - Messenger: plantilla de botones con 1 a 3 botones (web_url, phone_number),
 *    compatible con respuestas rápidas (máx. 13, título ≤ 20).
 *  - Instagram: solo respuestas rápidas de texto; enlaces y teléfonos van en el texto.
 */

export interface OutgoingButton {
  id: string;
  title: string;
}

export interface OutgoingAction {
  type: 'url' | 'call';
  title: string;
  /** Lo que recibe el contacto (puede ser un enlace corto con seguimiento). */
  url?: string;
  phone?: string;
  /** URL real cuando `url` es un enlace rastreado; es la que se guarda y ve el agente. */
  displayUrl?: string;
}

export interface OutgoingHeaderMedia {
  type: 'image' | 'video' | 'document';
  url: string;
  filename?: string;
}

export interface FlowMessageParts {
  content: string;
  /** Botones de respuesta (id = payload que devuelve el canal) */
  buttons?: OutgoingButton[] | null;
  /** Botones de enlace / llamada */
  actions?: OutgoingAction[] | null;
  /** Encabezado de texto (excluye headerMedia) */
  header?: string | null;
  footer?: string | null;
  headerMedia?: OutgoingHeaderMedia | null;
}

/** Recorta un texto a `max` caracteres (límites de Meta). */
export function truncateText(text: string, max: number): string {
  const t = (text || '').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

export interface TextFormat {
  bold: (s: string) => string;
  italic: (s: string) => string;
}

export const WHATSAPP_FORMAT: TextFormat = {
  bold: (s) => `*${s}*`,
  italic: (s) => `_${s}_`,
};

export const PLAIN_FORMAT: TextFormat = { bold: (s) => s, italic: (s) => s };

const joinBlocks = (blocks: (string | null | undefined | false)[]): string =>
  blocks.filter(Boolean).join('\n\n');

/** Acciones con destino (una URL o teléfono vacío no se puede enviar). */
function usableActions(actions?: OutgoingAction[] | null): OutgoingAction[] {
  return (actions || []).filter((a) => (a.type === 'url' ? a.url : a.phone));
}

/** Línea tocable para un botón de acción: WhatsApp enlaza URLs y teléfonos del texto. */
export function actionLine(a: OutgoingAction): string {
  return a.type === 'url'
    ? `🔗 ${a.title}: ${a.url}`
    : `📞 ${a.title}: ${a.phone}`;
}

/**
 * Cuerpo que cabe en `max` caracteres con las líneas de acción al final. Si hay
 * que recortar, se recorta el texto y nunca los enlaces.
 */
function fitBody(base: string, lines: string[], max: number): string {
  const tail = lines.join('\n');
  if (!tail) return truncateText(base, max);
  if (!base) return truncateText(tail, max);
  const room = max - tail.length - 2;
  if (room < 40) return truncateText(tail, max);
  return `${truncateText(base, room)}\n\n${tail}`;
}

/**
 * Texto plano para canales sin botones nativos (chat web, Evolution, puente
 * SendPulse): encabezado, cuerpo, opciones numeradas, enlaces y pie.
 */
export function buildPlainText(
  parts: FlowMessageParts,
  fmt: TextFormat,
): string {
  const options = parts.buttons?.length
    ? parts.buttons.map((b, i) => `${i + 1}. ${b.title}`).join('\n')
    : null;
  const links = usableActions(parts.actions).map(actionLine).join('\n') || null;
  return joinBlocks([
    parts.header && fmt.bold(parts.header),
    parts.content,
    options,
    links,
    parts.footer && fmt.italic(parts.footer),
  ]);
}

/**
 * Cuerpos de mensaje de WhatsApp Cloud, en el orden de envío (sin
 * messaging_product ni destinatario). Vacío si no hay nada que enviar.
 */
export function buildWhatsAppMessages(
  parts: FlowMessageParts,
): Record<string, any>[] {
  const reply = parts.buttons || [];
  const actions = usableActions(parts.actions);
  const media = parts.headerMedia || null;
  const header = media ? null : parts.header || null;
  const footer = parts.footer || null;

  const mediaObject = (caption?: string) => ({
    link: media!.url,
    ...(media!.type === 'document' && media!.filename
      ? { filename: media!.filename }
      : {}),
    ...(caption ? { caption: truncateText(caption, 1024) } : {}),
  });
  const interactiveHeader = media
    ? { header: { type: media.type, [media.type]: mediaObject() } }
    : header
      ? { header: { type: 'text', text: truncateText(header, 60) } }
      : {};
  const interactiveFooter = footer
    ? { footer: { text: truncateText(footer, 60) } }
    : {};
  const mediaMessage = () => ({
    type: media!.type,
    [media!.type]: mediaObject(),
  });

  // ── Botones de respuesta o lista ──
  if (reply.length > 0) {
    // WhatsApp no mezcla respuestas con botones de enlace: los enlaces y
    // teléfonos se añaden al texto, donde WhatsApp los hace tocables.
    const body = fitBody(
      parts.content || 'Elige una opción:',
      actions.map(actionLine),
      1024,
    );

    if (reply.length <= 3) {
      return [
        {
          type: 'interactive',
          interactive: {
            type: 'button',
            ...interactiveHeader,
            body: { text: body },
            ...interactiveFooter,
            action: {
              buttons: reply.map((b) => ({
                type: 'reply',
                reply: { id: b.id, title: truncateText(b.title, 20) },
              })),
            },
          },
        },
      ];
    }

    // 4 a 10 opciones: lista. Admite solo encabezado de texto, así que un
    // archivo se envía antes como mensaje aparte.
    const list = {
      type: 'interactive',
      interactive: {
        type: 'list',
        ...(header
          ? { header: { type: 'text', text: truncateText(header, 60) } }
          : {}),
        body: { text: body },
        ...interactiveFooter,
        action: {
          button: 'Ver opciones',
          sections: [
            {
              title: 'Opciones',
              rows: reply
                .slice(0, 10)
                .map((b) => ({ id: b.id, title: truncateText(b.title, 24) })),
            },
          ],
        },
      },
    };
    return media ? [mediaMessage(), list] : [list];
  }

  // ── Un botón de URL nativo (cta_url). Los demás van en el texto. ──
  const primary = actions.find((a) => a.type === 'url');
  if (primary) {
    const others = actions.filter((a) => a !== primary);
    return [
      {
        type: 'interactive',
        interactive: {
          type: 'cta_url',
          ...interactiveHeader,
          body: {
            text: fitBody(
              parts.content || primary.title,
              others.map(actionLine),
              1024,
            ),
          },
          ...interactiveFooter,
          action: {
            name: 'cta_url',
            parameters: {
              display_text: truncateText(primary.title, 20),
              url: primary.url,
            },
          },
        },
      },
    ];
  }

  // ── Solo archivo y/o texto (con llamadas como líneas tocables) ──
  const lines = actions.map(actionLine);
  if (media) {
    const caption = joinBlocks([
      parts.content,
      lines.join('\n') || null,
      footer && WHATSAPP_FORMAT.italic(footer),
    ]);
    return [{ type: media.type, [media.type]: mediaObject(caption) }];
  }
  const body = buildPlainText({ ...parts, buttons: null }, WHATSAPP_FORMAT);
  return body
    ? [{ type: 'text', text: { body: truncateText(body, 4096) } }]
    : [];
}

/**
 * Mensajes (`message`) de Messenger o Instagram, en orden de envío. El archivo
 * del encabezado va como adjunto previo. En Messenger los enlaces y llamadas
 * usan la plantilla de botones (máx. 3); en Instagram van como texto.
 */
export function buildMessengerMessages(
  parts: FlowMessageParts,
  channel: 'messenger' | 'instagram',
): Record<string, any>[] {
  const reply = (parts.buttons || []).slice(0, 13);
  const actions = usableActions(parts.actions);
  const media = parts.headerMedia || null;
  const messages: Record<string, any>[] = [];

  if (media) {
    messages.push({
      attachment: {
        type: media.type === 'document' ? 'file' : media.type,
        payload: { url: media.url, is_reusable: true },
      },
    });
  }

  const native = channel === 'messenger' ? actions.slice(0, 3) : [];
  const asText = actions.filter((a) => !native.includes(a));
  const text = joinBlocks([
    parts.header,
    parts.content,
    asText.map(actionLine).join('\n') || null,
    parts.footer,
  ]);
  const quickReplies = reply.length
    ? {
        quick_replies: reply.map((b) => ({
          content_type: 'text',
          title: truncateText(b.title, 20),
          payload: b.id,
        })),
      }
    : {};

  if (native.length) {
    messages.push({
      attachment: {
        type: 'template',
        payload: {
          template_type: 'button',
          text: truncateText(text || native[0].title, 640),
          buttons: native.map((a) =>
            a.type === 'url'
              ? {
                  type: 'web_url',
                  url: a.url,
                  title: truncateText(a.title, 20),
                }
              : {
                  type: 'phone_number',
                  title: truncateText(a.title, 20),
                  payload: a.phone,
                },
          ),
        },
      },
      ...quickReplies,
    });
  } else if (text || reply.length) {
    messages.push({
      text: truncateText(text || 'Elige una opción:', 2000),
      ...quickReplies,
    });
  }
  return messages;
}
