import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { Inbox } from '../chats/inbox.entity';
import { Conversation } from '../chats/conversation.entity';
import { ClientRecord } from '../records/record.entity';
import { FlowSubmissionsService } from './flow-submissions.service';

const GRAPH_VERSION = 'v21.0';

/**
 * Parámetros para enviar un WhatsApp Flow interactivo a un contacto.
 */
export interface SendFlowInput {
  // Inbox de WhatsApp desde el que se envía (debe tener accessToken + phoneNumberId).
  inboxId: string;
  // Conversación destino (de ella se resuelve el destinatario). Opcional si se
  // pasa `to` explícito.
  conversationId?: string;
  // Destinatario explícito (teléfono E.164 sin '+') si no hay conversación.
  to?: string;

  // ID del Flow publicado en Meta.
  metaFlowId: string;
  // Pantalla inicial del Flow (la del routing model, p. ej. "SCREEN_INTRO").
  initialScreen: string;
  // Datos iniciales a inyectar en la primera pantalla (opcional).
  initialData?: Record<string, any>;

  // Textos del mensaje interactivo que contiene el botón del Flow.
  bodyText: string;
  ctaText?: string; // texto del botón, p. ej. "Comenzar"
  headerText?: string;
  footerText?: string;

  // Modo del Flow: 'published' (producción) o 'draft' (pruebas).
  flowMode?: 'published' | 'draft';

  // Vínculo opcional con la definición registrada en whatsapp_flows.
  flowId?: string;
}

export interface SendFlowResult {
  success: boolean;
  flowToken: string;
  messageId: string | null;
  error?: string;
}

/**
 * Parámetros para disparar un Flow mediante una PLANTILLA aprobada en Meta.
 *
 * Esta es la vía para INICIAR una conversación (fuera de la ventana de 24h):
 * la plantilla ya debe existir y estar aprobada en Meta con un botón de tipo
 * Flow. Aquí solo inyectamos el flow_token dinámico (y datos iniciales) en el
 * componente del botón.
 */
export interface SendFlowTemplateInput {
  inboxId: string;
  conversationId?: string;
  to?: string;

  // Nombre e idioma de la plantilla aprobada en Meta.
  templateName: string;
  languageCode: string; // p. ej. "es" o "es_ES"

  // Índice del botón de Flow dentro de la plantilla (normalmente "0").
  buttonIndex?: string;

  // Datos iniciales que se inyectan en la primera pantalla del Flow (opcional).
  flowActionData?: Record<string, any>;

  // Parámetros del cuerpo de la plantilla ({{1}}, {{2}}...), si los tiene.
  bodyParameters?: string[];

  // Vínculos opcionales.
  metaFlowId?: string;
  flowId?: string;
}

/**
 * Envía un WhatsApp Flow como mensaje interactivo (type: interactive /
 * interactive.type: 'flow') a través de la Cloud API, generando el flow_token
 * y registrando la submission para poder correlacionar las respuestas que
 * lleguen al endpoint cifrado.
 */
@Injectable()
export class FlowSenderService {
  private readonly logger = new Logger(FlowSenderService.name);

  constructor(
    @InjectRepository(Inbox)
    private readonly inboxRepo: Repository<Inbox>,
    @InjectRepository(Conversation)
    private readonly conversationRepo: Repository<Conversation>,
    @InjectRepository(ClientRecord)
    private readonly recordRepo: Repository<ClientRecord>,
    private readonly submissions: FlowSubmissionsService,
  ) {}

  async sendFlow(input: SendFlowInput): Promise<SendFlowResult> {
    const flowToken = this.generateFlowToken();

    const inbox = await this.inboxRepo.findOne({ where: { id: input.inboxId } });
    if (!inbox) {
      return { success: false, flowToken, messageId: null, error: 'Inbox no encontrado' };
    }
    if (inbox.channel !== 'whatsapp' || !inbox.accessToken || !inbox.phoneNumberId) {
      return {
        success: false,
        flowToken,
        messageId: null,
        error: 'El inbox no es de WhatsApp o no está conectado',
      };
    }

    // Resolver destinatario y vínculos de contacto/conversación.
    const { recipient, conversation } = await this.resolveTarget(
      input.conversationId,
      input.to,
    );
    if (!recipient) {
      return { success: false, flowToken, messageId: null, error: 'Falta conversationId o to' };
    }

    // Registrar la submission ANTES de enviar, para que las respuestas que
    // lleguen con este flow_token queden vinculadas al contacto correcto.
    await this.submissions.startSubmission({
      tenantId: inbox.tenantId,
      flowToken,
      inboxId: inbox.id,
      recordId: conversation?.recordId ?? null,
      conversationId: conversation?.id ?? null,
      contactIdentifier: conversation?.contactId ?? input.to ?? null,
      metaFlowId: input.metaFlowId,
      flowId: input.flowId ?? null,
    });

    const interactive: any = {
      type: 'flow',
      body: { text: input.bodyText },
      action: {
        name: 'flow',
        parameters: {
          flow_message_version: '3',
          flow_token: flowToken,
          flow_id: input.metaFlowId,
          mode: input.flowMode === 'draft' ? 'draft' : 'published',
          flow_cta: input.ctaText || 'Comenzar',
          flow_action: 'navigate',
          flow_action_payload: {
            screen: input.initialScreen,
            ...(input.initialData ? { data: input.initialData } : {}),
          },
        },
      },
    };
    if (input.headerText) {
      interactive.header = { type: 'text', text: input.headerText };
    }
    if (input.footerText) {
      interactive.footer = { text: input.footerText };
    }

    const messageBody = {
      messaging_product: 'whatsapp',
      ...recipient,
      type: 'interactive',
      interactive,
    };

    return this.postToCloudApi(inbox, messageBody, flowToken);
  }

  /**
   * Dispara un Flow a través de una PLANTILLA aprobada en Meta.
   *
   * Úsalo para iniciar conversaciones (campañas, notificaciones) cuando el
   * usuario está fuera de la ventana de 24h. La plantilla debe estar aprobada
   * con un botón de tipo Flow; aquí se inyecta el flow_token en ese botón.
   */
  async sendFlowTemplate(input: SendFlowTemplateInput): Promise<SendFlowResult> {
    const flowToken = this.generateFlowToken();

    const inbox = await this.inboxRepo.findOne({ where: { id: input.inboxId } });
    if (!inbox) {
      return { success: false, flowToken, messageId: null, error: 'Inbox no encontrado' };
    }
    if (inbox.channel !== 'whatsapp' || !inbox.accessToken || !inbox.phoneNumberId) {
      return {
        success: false,
        flowToken,
        messageId: null,
        error: 'El inbox no es de WhatsApp o no está conectado',
      };
    }

    const { recipient, conversation } = await this.resolveTarget(
      input.conversationId,
      input.to,
    );
    if (!recipient) {
      return { success: false, flowToken, messageId: null, error: 'Falta conversationId o to' };
    }

    await this.submissions.startSubmission({
      tenantId: inbox.tenantId,
      flowToken,
      inboxId: inbox.id,
      recordId: conversation?.recordId ?? null,
      conversationId: conversation?.id ?? null,
      contactIdentifier: conversation?.contactId ?? input.to ?? null,
      metaFlowId: input.metaFlowId ?? null,
      flowId: input.flowId ?? null,
    });

    // Componentes de la plantilla: cuerpo (si lleva variables) + botón de Flow.
    const components: any[] = [];

    if (input.bodyParameters && input.bodyParameters.length > 0) {
      components.push({
        type: 'body',
        parameters: input.bodyParameters.map((text) => ({ type: 'text', text })),
      });
    }

    components.push({
      type: 'button',
      sub_type: 'flow',
      index: input.buttonIndex ?? '0',
      parameters: [
        {
          type: 'action',
          action: {
            flow_token: flowToken,
            ...(input.flowActionData
              ? { flow_action_data: input.flowActionData }
              : {}),
          },
        },
      ],
    });

    const messageBody = {
      messaging_product: 'whatsapp',
      ...recipient,
      type: 'template',
      template: {
        name: input.templateName,
        language: { code: input.languageCode },
        components,
      },
    };

    return this.postToCloudApi(inbox, messageBody, flowToken);
  }

  /**
   * Resuelve el destinatario a partir de conversationId o `to` explícito.
   */
  private async resolveTarget(
    conversationId?: string,
    to?: string,
  ): Promise<{ recipient: Record<string, any> | null; conversation: Conversation | null }> {
    if (conversationId) {
      const conversation = await this.conversationRepo.findOne({
        where: { id: conversationId },
      });
      if (!conversation) return { recipient: null, conversation: null };
      return { recipient: await this.resolveRecipient(conversation), conversation };
    }
    if (to) {
      return { recipient: { to: to.replace(/^\+/, '') }, conversation: null };
    }
    return { recipient: null, conversation: null };
  }

  /**
   * POST compartido a la Cloud API con manejo de errores homogéneo.
   */
  private async postToCloudApi(
    inbox: Inbox,
    messageBody: Record<string, any>,
    flowToken: string,
  ): Promise<SendFlowResult> {
    try {
      const res = await fetch(
        `https://graph.facebook.com/${GRAPH_VERSION}/${inbox.phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${inbox.accessToken}`,
          },
          body: JSON.stringify(messageBody),
        },
      );
      const data = await res.json();

      if (!res.ok) {
        const errDetail =
          data.error?.message ||
          data.error?.error_data?.details ||
          'Error desconocido';
        this.logger.warn(`[FlowSender] Envío fallido: ${JSON.stringify(data.error || data)}`);
        return { success: false, flowToken, messageId: null, error: `WhatsApp API error: ${errDetail}` };
      }

      const messageId = data.messages?.[0]?.id || null;
      this.logger.log(`[FlowSender] Flow enviado flow_token=${flowToken} messageId=${messageId}`);
      return { success: true, flowToken, messageId };
    } catch (err: any) {
      this.logger.error(`[FlowSender] Error de red: ${err.message}`);
      return {
        success: false,
        flowToken,
        messageId: null,
        error: err.message || 'Error de conexión con WhatsApp API',
      };
    }
  }

  /**
   * Genera un flow_token único y difícil de adivinar.
   */
  private generateFlowToken(): string {
    return `flw_${crypto.randomBytes(16).toString('hex')}`;
  }

  /**
   * Resuelve el destinatario (to/recipient) a partir de la conversación,
   * priorizando el teléfono real del contacto y cayendo al BSUID o contactId.
   * Replica el criterio de ChatsService.resolveWhatsAppRecipient.
   */
  private async resolveRecipient(
    conversation: Conversation,
  ): Promise<Record<string, any>> {
    if (conversation.recordId) {
      const record = await this.recordRepo.findOne({
        where: { id: conversation.recordId },
      });
      const phone = record?.phone?.trim();
      if (phone && !this.isIdentityId(phone)) {
        return { to: phone.replace(/^\+/, '') };
      }
      const whatsappId = record?.whatsappId?.trim();
      if (whatsappId && this.isIdentityId(whatsappId)) {
        return { recipient: whatsappId };
      }
    }
    return this.isIdentityId(conversation.contactId)
      ? { recipient: conversation.contactId }
      : { to: conversation.contactId };
  }

  /** Un BSUID tiene formato "{PREFIJO}.{id}" (p. ej. "CO.123..."). */
  private isIdentityId(id: string | null | undefined): boolean {
    if (!id) return false;
    return /^[A-Z]{2,}(\.[A-Z]{2,})*\.\d+$/.test(id);
  }
}
