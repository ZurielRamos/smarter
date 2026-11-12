import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BillingService } from '../billing/billing.service';
import { BotsService } from '../bots/bots.service';
import type { FlowAgentConfig, FlowNodeData } from './conversation-flow.entity';
import {
  FINISH_TOOL,
  HANDOFF_TOOL,
  buildAgentPrompt,
  buildAgentTools,
  interpretAgentTurn,
  type AgentKnownData,
  type AgentTurn,
} from './flow-agent.util';
import {
  AI_MODES,
  buildExtractionPrompt,
  parseExtractionResponse,
  type AiExtraction,
} from './flow-input.util';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const FALLBACK_MODEL = 'openai/gpt-4o-mini';
/** Un flujo no puede dejar al contacto esperando: pasado este tiempo se sigue sin IA. */
const AI_TIMEOUT_MS = 15_000;
const BILLING_SOURCE = 'flow_ai';
/** Un turno de conversación puede incluir herramientas del bot (webhooks, conocimiento). */
const AGENT_TIMEOUT_MS = 25_000;
/** Mensaje interno para que la IA abra el tramo cuando no hay primer mensaje. */
const OPENING_CUE =
  '[Mensaje interno, no lo escribió el contacto: el contacto acaba de llegar a este tramo de la conversación. Escribe tu primer mensaje según el objetivo.]';

interface Usage {
  prompt_tokens?: number;
  completion_tokens?: number;
}

/**
 * IA de los nodos Entrada: extrae un dato concreto de la respuesta del contacto
 * y transcribe notas de voz. Usa la misma clave de OpenRouter, el mismo modelo
 * predeterminado del tenant y la misma tarifa por tokens que los bots.
 *
 * Nunca lanza: si no hay clave, no hay créditos, se agota el tiempo o la
 * respuesta no se entiende, devuelve null y el motor valida la respuesta sin IA.
 */
@Injectable()
export class FlowAiService {
  private readonly logger = new Logger(FlowAiService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly billing: BillingService,
    private readonly bots: BotsService,
  ) {}

  private apiKey(): string | null {
    return this.config.get<string>('OPENROUTER_API_KEY') || null;
  }

  /** Extrae el dato que pide el nodo. null = no se pudo usar la IA. */
  async extract(params: {
    tenantId: string;
    flowId: string;
    data: FlowNodeData;
    question: string;
    answer: string;
    now: Date;
  }): Promise<AiExtraction | null> {
    const apiKey = this.apiKey();
    if (!apiKey || !(await this.canSpend(params.tenantId))) return null;

    const prompt = buildExtractionPrompt(
      params.data,
      params.question,
      params.answer,
      params.now,
    );
    const extraKeys = (params.data.ai?.extras || []).map((e) => e.variable);
    try {
      const model = await this.resolveModel(
        params.tenantId,
        params.data.ai?.mode,
      );
      const res = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: prompt.system },
            { role: 'user', content: prompt.user },
          ],
          temperature: 0,
          max_tokens: 400,
        }),
        signal: AbortSignal.timeout(AI_TIMEOUT_MS),
      });
      if (!res.ok) {
        this.logger.warn(
          `OpenRouter ${res.status} en entrada de flujo ${params.flowId}`,
        );
        return null;
      }
      const json = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
        usage?: Usage;
      };
      await this.charge(
        params.tenantId,
        params.flowId,
        json.usage,
        'extracción',
      );
      return parseExtractionResponse(
        json.choices?.[0]?.message?.content || '',
        extraKeys,
      );
    } catch (err) {
      this.logger.warn(
        `IA no disponible en entrada de flujo ${params.flowId}: ${(err as Error)?.message || err}`,
      );
      return null;
    }
  }

  /**
   * Un turno del nodo «Conversación con IA». Sin historial, la IA escribe el
   * primer mensaje. null = la IA no está disponible (sin clave, sin créditos,
   * error o tiempo agotado).
   */
  async converse(params: {
    tenantId: string;
    flowId: string;
    config: FlowAgentConfig;
    history: { role: 'user' | 'assistant'; content: string }[];
    known: AgentKnownData;
  }): Promise<AgentTurn | null> {
    if (!this.apiKey() || !(await this.canSpend(params.tenantId))) return null;
    const { config } = params;
    try {
      const result = await this.bots.runFlowAgent({
        tenantId: params.tenantId,
        botId: config.source === 'bot' ? config.botId : null,
        flowPrompt: buildAgentPrompt(config, params.known),
        messages: params.history.length
          ? params.history
          : [{ role: 'user', content: OPENING_CUE }],
        flowTools: buildAgentTools(config),
        terminalTools: [FINISH_TOOL, HANDOFF_TOOL],
        variant: config.mode ?? null,
        contactData: params.known.data,
        timeoutMs: AGENT_TIMEOUT_MS,
      });
      await this.charge(
        params.tenantId,
        params.flowId,
        result.usage,
        'conversación',
      );
      return interpretAgentTurn(config, result.content, result.flowCalls);
    } catch (err) {
      this.logger.warn(
        `Conversación con IA no disponible en el flujo ${params.flowId}: ${(err as Error)?.message || err}`,
      );
      return null;
    }
  }

  /** Transcribe una nota de voz. null = no se pudo. */
  async transcribe(
    tenantId: string,
    flowId: string,
    audioUrl: string,
  ): Promise<string | null> {
    if (!this.apiKey() || !(await this.canSpend(tenantId))) return null;
    try {
      const result = await Promise.race([
        this.bots.transcribeAudio(audioUrl, tenantId),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error('tiempo agotado')),
            AI_TIMEOUT_MS * 2,
          ),
        ),
      ]);
      await this.charge(
        tenantId,
        flowId,
        result.usage ?? undefined,
        'transcripción',
      );
      const text = (result.text || '').trim();
      // transcribeAudio devuelve este texto cuando no entendió el audio.
      if (!text || text === 'No se pudo transcribir el audio.') return null;
      return text;
    } catch (err) {
      this.logger.warn(
        `No se pudo transcribir el audio del flujo ${flowId}: ${(err as Error)?.message || err}`,
      );
      return null;
    }
  }

  /** Con tarifa de IA configurada, exige saldo; sin tarifa no hay nada que cobrar. */
  private async canSpend(tenantId: string): Promise<boolean> {
    try {
      const [input, output] = await Promise.all([
        this.billing.getEffectiveActionCost(tenantId, 'ai_input_tokens'),
        this.billing.getEffectiveActionCost(tenantId, 'ai_output_tokens'),
      ]);
      if (!input && !output) return true;
      return await this.billing.hasCredits(tenantId, 0.01);
    } catch {
      return false;
    }
  }

  /** Cobra los tokens con la misma tarifa que los bots (créditos por millón de tokens). */
  private async charge(
    tenantId: string,
    flowId: string,
    usage: Usage | undefined,
    what: string,
  ): Promise<void> {
    const prompt = usage?.prompt_tokens || 0;
    const completion = usage?.completion_tokens || 0;
    if (!prompt && !completion) return;
    try {
      const inputRate =
        (await this.billing.getEffectiveActionCost(
          tenantId,
          'ai_input_tokens',
        )) ?? 0;
      const outputRate =
        (await this.billing.getEffectiveActionCost(
          tenantId,
          'ai_output_tokens',
        )) ?? 0;
      const credits =
        Math.ceil(
          ((prompt / 1_000_000) * inputRate +
            (completion / 1_000_000) * outputRate) *
            100,
        ) / 100;
      if (credits <= 0) return;
      await this.billing.consume(tenantId, {
        amount: credits,
        source: BILLING_SOURCE,
        referenceId: flowId,
        description: `Flujo: ${what} con IA (${prompt} in / ${completion} out tokens)`,
      });
    } catch (err) {
      this.logger.warn(
        `No se pudieron cobrar los créditos de IA del flujo ${flowId}: ${(err as Error)?.message || err}`,
      );
    }
  }

  /**
   * Mismo orden que los bots: modelo del tenant → modelo global → respaldo. El
   * modo se añade como variante de OpenRouter (`modelo:nitro`) salvo que el
   * modelo configurado ya traiga una.
   */
  private async resolveModel(tenantId: string, mode?: string): Promise<string> {
    const tenant = await this.billing.getTenantDefaultModel(tenantId);
    let model = tenant?.model || '';
    if (!model) model = (await this.billing.getDefaultModel())?.model || '';
    if (!model) model = FALLBACK_MODEL;
    if (mode && AI_MODES.has(mode) && !model.includes(':'))
      model = `${model}:${mode}`;
    return model;
  }
}
