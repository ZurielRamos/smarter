import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Bot, FlowStep, BotFlowState, FlowConfig, FlowStepWebhook, FlowConsentConfig } from './bot.entity';
import { Conversation } from '../chats/conversation.entity';
import { BillingService } from '../billing/billing.service';
import { BotKnowledge } from './bot-knowledge.entity';
import { looksLikeNonAnswer } from './flow-answer.util';

export interface SequentialFlowResponse {
  content: string;
  extractedData?: Record<string, string>;
  handedOff?: boolean;
  flowCompleted?: boolean;
  currentStep?: FlowStep;
  usage?: { prompt_tokens: number; completion_tokens: number; model: string; cost: number | null; credits: number };
  webhookResults?: { stepId: string; success: boolean; response?: string }[];
}

@Injectable()
export class SequentialFlowEngine {
  constructor(
    @InjectRepository(Conversation)
    private readonly conversationRepo: Repository<Conversation>,
    @InjectRepository(BotKnowledge)
    private readonly knowledgeRepo: Repository<BotKnowledge>,
    private readonly configService: ConfigService,
    private readonly billingService: BillingService,
  ) {}

  /**
   * Process an inbound message through the sequential flow.
   */
  async processMessage(
    bot: Bot,
    conversation: Conversation,
    userMessage: string,
  ): Promise<SequentialFlowResponse> {
    const steps = bot.flowSteps || [];
    const config: FlowConfig = bot.flowConfig || {};

    if (steps.length === 0) {
      return { content: bot.fallbackMessage || 'Este bot no tiene un flujo configurado.', handedOff: true };
    }

    // Initialize or load flow state
    const state: BotFlowState = conversation.botFlowState || this.createInitialState();

    // Check if this is the first interaction
    const isFirstMessage = state.currentStepIndex === 0 && state.completedSteps.length === 0 && !state.lastStepAt;

    if (isFirstMessage) {
      const firstStep = this.getNextStep(steps, state, config);
      if (!firstStep) {
        return this.handleFlowCompletion(bot, conversation, state, config);
      }

      state.lastStepAt = new Date().toISOString();
      conversation.botFlowState = state;
      await this.persistState(conversation);

      const questionText = this.formatStepQuestion(firstStep);
      const greeting = bot.welcomeMessage ? `${bot.welcomeMessage}\n\n${questionText}` : questionText;
      return { content: greeting, currentStep: firstStep };
    }

    // Get the current step
    const currentStep = steps.find((s) => s.order === state.currentStepIndex);
    if (!currentStep) {
      return this.handleFlowCompletion(bot, conversation, state, config);
    }

    // Check skip keyword
    if (config.allowSkip && config.skipKeyword) {
      const skipKw = (config.skipKeyword || 'omitir').toLowerCase();
      if (userMessage.trim().toLowerCase() === skipKw) {
        if (currentStep.required !== false) {
          return {
            content: `Este dato es obligatorio y no se puede omitir. ${currentStep.question}`,
            currentStep,
          };
        }
        return this.advanceToNextStep(bot, conversation, state, steps, config, currentStep);
      }
    }

    // Handle consent-type steps
    if (currentStep.type === 'consent') {
      return this.handleConsentResponse(bot, conversation, state, steps, config, currentStep, userMessage);
    }

    // Validate the user's response
    const validationResult = await this.validateResponse(userMessage, currentStep, bot);

    // Guard: even if the value passes type validation, a message that is clearly
    // a non-answer (confusion, refusal, question, off-topic) must not be stored
    // as the field value. Treat it as invalid so we re-ask instead.
    // 1) Cheap deterministic heuristic first.
    let isNonAnswer = validationResult.valid && this.looksLikeNonAnswer(userMessage);
    let nonAnswerUsage: any | undefined;

    // 2) AI fallback for free-text steps the heuristic couldn't catch. Only for
    //    text fields without an explicit validation pattern (where anything passes).
    const isFreeText = currentStep.type === 'text' && !currentStep.validation?.pattern;
    if (validationResult.valid && !isNonAnswer && isFreeText) {
      const check = await this.aiIsRealAnswer(bot, userMessage, currentStep);
      nonAnswerUsage = check.usage;
      if (!check.isAnswer) isNonAnswer = true;
    }

    if (!validationResult.valid || isNonAnswer) {
      // Check if it's an off-topic message (doesn't look like an answer to the question)
      if (!isNonAnswer && config.offTopicBehavior === 'ai_respond' && this.looksOffTopic(userMessage, currentStep)) {
        const aiResponse = await this.handleOffTopic(bot, userMessage, currentStep);
        if (aiResponse) {
          // Save state (no change to step), return AI response + re-ask
          conversation.botFlowState = state;
          await this.persistState(conversation);
          return {
            content: `${aiResponse.content}\n\n${currentStep.question}`,
            currentStep,
            usage: aiResponse.usage,
          };
        }
      }

      // Increment retry count
      state.retryCount++;
      state.globalRetryCount++;

      // Check max retries for this step
      const maxRetries = currentStep.retries ?? 2;
      if (state.retryCount > maxRetries) {
        conversation.botFlowState = state;
        await this.persistState(conversation);
        return {
          content: bot.handoffMessage || 'Te conecto con un agente para asistirte mejor.',
          handedOff: true,
        };
      }

      // Check global max retries
      if (config.maxGlobalRetries && state.globalRetryCount > config.maxGlobalRetries) {
        conversation.botFlowState = state;
        await this.persistState(conversation);
        return {
          content: bot.handoffMessage || 'Te conecto con un agente para asistirte mejor.',
          handedOff: true,
        };
      }

      conversation.botFlowState = state;
      await this.persistState(conversation);

      // When the user didn't really answer, reply with an AI-generated
      // clarification so it feels natural instead of mechanically repeating.
      const clarification = await this.generateClarification(bot, userMessage, currentStep);
      if (clarification) {
        return {
          content: clarification.content,
          currentStep,
          usage: this.mergeUsage(nonAnswerUsage, clarification.usage),
        };
      }

      // Fallback: validation error + repeat question
      const errorMsg = validationResult.errorMessage || currentStep.validation?.errorMessage || 'No estoy seguro de haber entendido tu respuesta.';
      return {
        content: `${errorMsg}\n\n${currentStep.question}`,
        currentStep,
        usage: this.mergeUsage(nonAnswerUsage, validationResult.usage),
      };
    }

    // Response is valid — save the data
    let parsedValue = validationResult.parsedValue || userMessage.trim();

    // Apply AI interpretation if enabled (extract clean data from natural language)
    if (currentStep.aiInterpretation && !validationResult.usage) {
      const aiResult = await this.aiParseValue(parsedValue, currentStep, bot);
      if (aiResult.parsedValue) {
        parsedValue = aiResult.parsedValue;
      }
    }

    state.collectedData[currentStep.field] = parsedValue;
    state.retryCount = 0;

    // Execute onCollected webhook if configured
    const webhookResults: { stepId: string; success: boolean; response?: string }[] = [];
    if (currentStep.onCollected?.url) {
      const result = await this.executeWebhook(currentStep.onCollected, {
        step: currentStep,
        value: parsedValue,
        collectedData: state.collectedData,
        conversationId: conversation.id,
        contactId: conversation.contactId,
      });
      webhookResults.push({ stepId: currentStep.id, ...result });
    }

    // Advance to next step
    const response = await this.advanceToNextStep(bot, conversation, state, steps, config, currentStep, parsedValue, validationResult.usage);
    if (webhookResults.length > 0) response.webhookResults = webhookResults;
    return response;
  }

  /**
   * Start the flow for a new conversation.
   */
  async startFlow(bot: Bot, conversation: Conversation): Promise<SequentialFlowResponse> {
    const steps = bot.flowSteps || [];
    const config: FlowConfig = bot.flowConfig || {};

    if (steps.length === 0) {
      return { content: bot.fallbackMessage || 'Este bot no tiene un flujo configurado.', handedOff: true };
    }

    const state = this.createInitialState();
    const firstStep = this.getNextStep(steps, state, config);

    if (!firstStep) {
      return { content: config.completionMessage || 'Flujo completado.', flowCompleted: true };
    }

    state.lastStepAt = new Date().toISOString();
    conversation.botFlowState = state;
    await this.persistState(conversation);

    const questionText = this.formatStepQuestion(firstStep);
    const greeting = bot.welcomeMessage ? `${bot.welcomeMessage}\n\n${questionText}` : questionText;
    return { content: greeting, currentStep: firstStep };
  }

  /**
   * Runs the sequential flow WITHOUT persisting state — used by the "Probar
   * Bot" test panel, which sends the full transcript on every turn and keeps
   * no server-side conversation. We replay every prior user answer through the
   * real engine to rebuild the flow state in memory, then process the latest
   * user message. This guarantees the test path behaves EXACTLY like production
   * (same validation, non-answer detection, AI fallback) with zero duplication.
   *
   * `flowMessages` is the transcript already stripped of any bot-level consent
   * exchange by the caller. The engine's per-step `consent` steps still work.
   */
  async runStateless(
    bot: Bot,
    flowMessages: { role: string; content: string }[],
  ): Promise<SequentialFlowResponse> {
    // Ephemeral conversation: the engine reads/writes botFlowState on it but
    // persistState() will skip the DB because of the __ephemeral flag.
    const conversation = {
      id: 'test',
      contactId: 'test',
      botFlowState: null,
      __ephemeral: true,
    } as unknown as Conversation;

    const userMessages = flowMessages.filter((m) => m.role === 'user').map((m) => m.content);

    // No user input yet → present the first step (like startFlow).
    if (userMessages.length === 0) {
      return this.startFlow(bot, conversation);
    }

    // First user message triggers the flow start (mirrors processMessage's
    // isFirstMessage branch, which presents step 1 without consuming input).
    let lastResponse = await this.startFlow(bot, conversation);

    // Replay each user answer against the engine to rebuild state. The final
    // answer produces the response we return to the caller.
    for (const msg of userMessages) {
      // If a previous turn already completed the flow or handed off, stop
      // advancing — extra messages shouldn't re-trigger the flow.
      if (lastResponse.flowCompleted || lastResponse.handedOff) {
        return { content: '', handedOff: true };
      }
      lastResponse = await this.processMessage(bot, conversation, msg);
    }

    return lastResponse;
  }

  // ─── Consent Handling ──────────────────────────────────

  private async handleConsentResponse(
    bot: Bot,
    conversation: Conversation,
    state: BotFlowState,
    steps: FlowStep[],
    config: FlowConfig,
    step: FlowStep,
    userMessage: string,
  ): Promise<SequentialFlowResponse> {
    const consent = step.consent || {} as FlowConsentConfig;
    const lower = userMessage.toLowerCase().trim();

    const acceptWords = consent.acceptKeywords?.length
      ? consent.acceptKeywords.map((k) => k.toLowerCase())
      : ['si', 'sí', 'acepto', 'autorizo', 'ok', 'dale', 'claro', 'de acuerdo', '1'];

    const rejectWords = consent.rejectKeywords?.length
      ? consent.rejectKeywords.map((k) => k.toLowerCase())
      : ['no', 'rechazo', 'no acepto', 'no autorizo', '2'];

    const accepted = acceptWords.some((w) => lower.includes(w));
    const rejected = rejectWords.some((w) => lower.includes(w));

    if (accepted) {
      // User accepted — store consent and advance
      state.collectedData[step.field] = 'accepted';
      state.retryCount = 0;

      // Fire onCollected webhook if configured
      const webhookResults: { stepId: string; success: boolean; response?: string }[] = [];
      if (step.onCollected?.url) {
        const result = await this.executeWebhook(step.onCollected, {
          step,
          value: 'accepted',
          collectedData: state.collectedData,
          conversationId: conversation.id,
          contactId: conversation.contactId,
        });
        webhookResults.push({ stepId: step.id, ...result });
      }

      const response = await this.advanceToNextStep(bot, conversation, state, steps, config, step, 'accepted');
      if (webhookResults.length > 0) response.webhookResults = webhookResults;
      return response;
    }

    if (rejected) {
      // User rejected consent
      state.collectedData[step.field] = 'rejected';
      conversation.botFlowState = state;
      await this.persistState(conversation);

      const rejectMsg = consent.rejectMessage || 'Entendido. Sin tu autorización no podemos continuar con el proceso.';
      const action = consent.rejectAction || 'end';

      return {
        content: rejectMsg,
        handedOff: action === 'handoff',
        extractedData: { [step.field]: 'rejected' },
      };
    }

    // Ambiguous response — re-ask
    state.retryCount++;
    if (state.retryCount > (step.retries ?? 2)) {
      conversation.botFlowState = state;
      await this.persistState(conversation);
      return {
        content: bot.handoffMessage || 'Te conecto con un agente para asistirte mejor.',
        handedOff: true,
      };
    }

    conversation.botFlowState = state;
    await this.persistState(conversation);

    return {
      content: `No pude entender tu respuesta. Por favor responde "Acepto" o "No acepto".\n\n${this.formatStepQuestion(step)}`,
      currentStep: step,
    };
  }

  // ─── Off-Topic Handling ────────────────────────────────

  private looksOffTopic(message: string, currentStep: FlowStep): boolean {
    // Heuristic: if the message is a question (ends with ?) or is too long for the expected type
    const trimmed = message.trim();
    if (trimmed.endsWith('?')) return true;
    if (trimmed.length > 200 && currentStep.type !== 'text') return true;

    // Check if it starts with common question words
    const questionWords = ['qué', 'que', 'cómo', 'como', 'cuánto', 'cuanto', 'dónde', 'donde', 'cuál', 'cual', 'por qué', 'por que', 'quién', 'quien'];
    const lower = trimmed.toLowerCase();
    if (questionWords.some((w) => lower.startsWith(w))) return true;

    return false;
  }

  private async handleOffTopic(
    bot: Bot,
    userMessage: string,
    currentStep: FlowStep,
  ): Promise<{ content: string; usage?: any } | null> {
    const apiKey = this.configService.get<string>('OPENROUTER_API_KEY');
    if (!apiKey) return null;

    // Search knowledge base for relevant info
    let knowledgeContext = '';
    const hasKnowledge = await this.knowledgeRepo.count({ where: { botId: bot.id, isEnabled: true } });
    if (hasKnowledge > 0) {
      knowledgeContext = await this.searchKnowledge(bot.id, userMessage);
    }

    const systemPrompt = `Eres ${bot.persona || 'un asistente virtual'}. ${bot.objective ? `Tu objetivo: ${bot.objective}.` : ''}
Estás en medio de un formulario paso a paso. El usuario hizo una pregunta fuera de tema en lugar de responder la pregunta actual.

Pregunta actual del formulario: "${currentStep.question}"

${knowledgeContext ? `Información disponible para responder:\n${knowledgeContext}\n` : ''}
Instrucciones:
- Responde brevemente la pregunta del usuario si tienes la información.
- Si no tienes la info, dile que no puedes ayudarle con eso ahora.
- NO incluyas la pregunta del formulario en tu respuesta (se agrega automáticamente después).
- Sé amable pero conciso (máximo 2 oraciones).
- Responde en texto plano sin formato.`;

    try {
      const resolvedModel = await this.resolveModel(bot.tenantId, bot.model);

      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: resolvedModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          temperature: 0.5,
          max_tokens: 200,
        }),
      });

      if (!res.ok) return null;

      const json = await res.json();
      const content = json.choices?.[0]?.message?.content || '';
      const usage = json.usage ? {
        prompt_tokens: json.usage.prompt_tokens || 0,
        completion_tokens: json.usage.completion_tokens || 0,
        model: resolvedModel,
        cost: null,
        credits: 0,
      } : undefined;

      return content ? { content, usage } : null;
    } catch {
      return null;
    }
  }

  // ─── Non-Answer Detection ──────────────────────────────

  /**
   * Detects when the user's message is not an actual answer to the current
   * question but rather an expression of confusion, refusal, or a request for
   * clarification (e.g. "no entiendo", "no sé", "cómo?"). These must NOT be
   * stored as the field value.
   */
  private looksLikeNonAnswer(message: string): boolean {
    return looksLikeNonAnswer(message);
  }

  /**
   * Generates a natural, AI-written clarification when the user did not answer
   * the current question, so the bot doesn't just mechanically repeat itself.
   * Falls back to null if the model is unavailable — caller handles the fallback.
   */
  private async generateClarification(
    bot: Bot,
    userMessage: string,
    currentStep: FlowStep,
  ): Promise<{ content: string; usage?: any } | null> {
    const apiKey = this.configService.get<string>('OPENROUTER_API_KEY');
    if (!apiKey) return null;

    const systemPrompt = `Eres ${bot.persona || 'un asistente virtual'}.${bot.objective ? ` Tu objetivo: ${bot.objective}.` : ''}
Estás completando un formulario paso a paso. El usuario no respondió la pregunta actual: parece confundido, dudó o pidió una aclaración.

Pregunta actual del formulario: "${currentStep.question}"

Instrucciones:
- Reformula o aclara la pregunta de forma amable y natural, con tus propias palabras.
- Explica brevemente por qué necesitas ese dato si ayuda a que el usuario responda.
- NO inventes que ya tienes el dato. NO avances al siguiente paso.
- Sé cálido y conciso (máximo 2 oraciones). Responde en texto plano, sin formato.
- Termina invitando al usuario a responder la pregunta.`;

    try {
      const resolvedModel = await this.resolveModel(bot.tenantId, bot.model);

      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: resolvedModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          temperature: 0.6,
          max_tokens: 200,
        }),
      });

      if (!res.ok) return null;

      const json = await res.json();
      const content = json.choices?.[0]?.message?.content?.trim() || '';
      const usage = json.usage ? {
        prompt_tokens: json.usage.prompt_tokens || 0,
        completion_tokens: json.usage.completion_tokens || 0,
        model: resolvedModel,
        cost: null,
        credits: 0,
      } : undefined;

      return content ? { content, usage } : null;
    } catch {
      return null;
    }
  }

  /**
   * AI fallback that decides whether the user's message actually answers the
   * current question. Used only for free-text steps where the cheap heuristic
   * couldn't tell. Returns { isAnswer } plus token usage. On any error or when
   * the model is unavailable, assumes it IS an answer to avoid blocking valid
   * responses (fail-open).
   */
  private async aiIsRealAnswer(
    bot: Bot,
    userMessage: string,
    currentStep: FlowStep,
  ): Promise<{ isAnswer: boolean; usage?: any }> {
    const apiKey = this.configService.get<string>('OPENROUTER_API_KEY');
    if (!apiKey) return { isAnswer: true };

    const systemPrompt = `Eres un clasificador. Debes decidir si el mensaje del usuario responde a la pregunta de un formulario.

Pregunta del formulario: "${currentStep.question}"
Dato esperado: "${currentStep.field}" (tipo: ${currentStep.type}).

Responde SOLO con un JSON:
{"isAnswer": true} si el mensaje contiene o intenta dar el dato solicitado.
{"isAnswer": false} si el usuario pregunta otra cosa, cambia de tema, expresa confusión, o no proporciona el dato.

NO agregues texto fuera del JSON.`;

    try {
      const resolvedModel = await this.resolveModel(bot.tenantId, bot.model);
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: resolvedModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
          temperature: 0,
          max_tokens: 20,
        }),
      });

      if (!res.ok) return { isAnswer: true };

      const json = await res.json();
      const raw = json.choices?.[0]?.message?.content?.trim() || '';
      const usage = json.usage ? {
        prompt_tokens: json.usage.prompt_tokens || 0,
        completion_tokens: json.usage.completion_tokens || 0,
        model: resolvedModel,
        cost: null,
        credits: 0,
      } : undefined;

      let isAnswer = true; // fail-open default
      try {
        const match = raw.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          if (typeof parsed.isAnswer === 'boolean') isAnswer = parsed.isAnswer;
        }
      } catch {
        // keep fail-open default
      }

      return { isAnswer, usage };
    } catch {
      return { isAnswer: true };
    }
  }

  /** Adds up token usage from two AI calls made within the same turn. */
  private mergeUsage(a?: any, b?: any): any | undefined {
    if (!a) return b;
    if (!b) return a;
    return {
      prompt_tokens: (a.prompt_tokens || 0) + (b.prompt_tokens || 0),
      completion_tokens: (a.completion_tokens || 0) + (b.completion_tokens || 0),
      model: b.model || a.model,
      cost: null,
      credits: (a.credits || 0) + (b.credits || 0),
    };
  }

  private async searchKnowledge(botId: string, query: string): Promise<string> {
    const entries = await this.knowledgeRepo.find({ where: { botId, isEnabled: true } });
    if (entries.length === 0) return '';

    // Simple keyword search across chunks
    const keywords = query.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
    if (keywords.length === 0) return '';

    let bestChunks: { chunk: string; score: number }[] = [];

    for (const entry of entries) {
      const chunks = entry.chunks || [];
      for (const chunk of chunks) {
        const lower = chunk.toLowerCase();
        const score = keywords.reduce((acc, kw) => acc + (lower.includes(kw) ? 1 : 0), 0);
        if (score > 0) bestChunks.push({ chunk, score });
      }
    }

    bestChunks.sort((a, b) => b.score - a.score);
    return bestChunks.slice(0, 3).map((c) => c.chunk).join('\n\n');
  }

  // ─── Webhook Execution ─────────────────────────────────

  private async executeWebhook(
    webhook: FlowStepWebhook,
    payload: Record<string, any>,
  ): Promise<{ success: boolean; response?: string }> {
    try {
      const method = webhook.method || 'POST';
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(webhook.headers || {}),
      };

      const res = await fetch(webhook.url, {
        method,
        headers,
        body: method !== 'GET' ? JSON.stringify(payload) : undefined,
      });

      const text = await res.text();
      return { success: res.ok, response: text.substring(0, 2000) };
    } catch (err: any) {
      return { success: false, response: err?.message || 'Webhook failed' };
    }
  }

  // ─── Private Methods ───────────────────────────────────

  private createInitialState(): BotFlowState {
    return {
      currentStepIndex: 0,
      completedSteps: [],
      collectedData: {},
      retryCount: 0,
      globalRetryCount: 0,
      startedAt: new Date().toISOString(),
      lastStepAt: '',
    };
  }

  /**
   * Persists the flow state, unless the conversation is ephemeral (in-memory
   * test session). This lets the SAME engine drive both production (persisted)
   * and the "Probar Bot" panel (stateless) without duplicating flow logic.
   */
  private async persistState(conversation: Conversation): Promise<void> {
    if ((conversation as any).__ephemeral) return;
    await this.conversationRepo.save(conversation);
  }

  private formatStepQuestion(step: FlowStep): string {
    if (step.type === 'consent') {
      const consent = step.consent || {} as FlowConsentConfig;
      let text = step.question || consent.legalText || '';
      if (consent.termsUrl) {
        text += `\n\n📎 Términos y condiciones: ${consent.termsUrl}`;
      }
      text += '\n\nResponde "Acepto" o "No acepto".';
      return text;
    }

    if (step.type === 'select' && step.validation?.options?.length) {
      const options = step.validation.options.map((o, i) => `${i + 1}. ${o}`).join('\n');
      return `${step.question}\n\n${options}`;
    }

    return step.question;
  }

  private getNextStep(steps: FlowStep[], state: BotFlowState, config: FlowConfig): FlowStep | null {
    const sortedSteps = [...steps].sort((a, b) => a.order - b.order);

    for (const step of sortedSteps) {
      if (state.completedSteps.includes(step.id)) continue;

      if (step.skipIf && this.evaluateSkipCondition(step.skipIf, state.collectedData)) {
        state.completedSteps.push(step.id);
        continue;
      }

      return step;
    }

    return null;
  }

  private evaluateSkipCondition(condition: string, collectedData: Record<string, string>): boolean {
    try {
      const trimmed = condition.trim();
      if (trimmed.startsWith('!')) {
        const field = trimmed.slice(1).replace('collectedData.', '').trim();
        return !collectedData[field];
      }
      const field = trimmed.replace('collectedData.', '').trim();
      return !!collectedData[field];
    } catch {
      return false;
    }
  }

  private async advanceToNextStep(
    bot: Bot,
    conversation: Conversation,
    state: BotFlowState,
    steps: FlowStep[],
    config: FlowConfig,
    completedStep: FlowStep,
    parsedValue?: string,
    usage?: { prompt_tokens: number; completion_tokens: number; model: string; cost: number | null; credits: number },
  ): Promise<SequentialFlowResponse> {
    state.completedSteps.push(completedStep.id);
    state.lastStepAt = new Date().toISOString();

    const nextStep = this.getNextStep(steps, state, config);

    if (!nextStep) {
      return this.handleFlowCompletion(bot, conversation, state, config, usage);
    }

    state.currentStepIndex = nextStep.order;
    state.retryCount = 0;
    conversation.botFlowState = state;
    await this.persistState(conversation);

    return {
      content: this.formatStepQuestion(nextStep),
      currentStep: nextStep,
      extractedData: parsedValue ? { [completedStep.field]: parsedValue } : undefined,
      usage,
    };
  }

  private async handleFlowCompletion(
    bot: Bot,
    conversation: Conversation,
    state: BotFlowState,
    config: FlowConfig,
    usage?: { prompt_tokens: number; completion_tokens: number; model: string; cost: number | null; credits: number },
  ): Promise<SequentialFlowResponse> {
    conversation.botFlowState = state;
    await this.persistState(conversation);

    // Execute completion webhook if configured
    const webhookResults: { stepId: string; success: boolean; response?: string }[] = [];
    if (config.onCompletionWebhook?.url) {
      const result = await this.executeWebhook(config.onCompletionWebhook, {
        event: 'flow_completed',
        collectedData: state.collectedData,
        conversationId: conversation.id,
        contactId: conversation.contactId,
        completedAt: new Date().toISOString(),
      });
      webhookResults.push({ stepId: '__completion__', ...result });
    }

    const completionMessage = config.completionMessage || 'Gracias, hemos recopilado toda la información necesaria.';
    const handedOff = config.completionAction === 'handoff' || config.completionAction === 'resolve';

    return {
      content: completionMessage,
      extractedData: state.collectedData,
      flowCompleted: true,
      handedOff,
      usage,
      webhookResults: webhookResults.length > 0 ? webhookResults : undefined,
    };
  }

  // ─── Validation ─────────────────────────────────────────

  private async validateResponse(
    userMessage: string,
    step: FlowStep,
    bot: Bot,
  ): Promise<{ valid: boolean; parsedValue?: string; errorMessage?: string; usage?: any }> {
    const message = userMessage.trim();

    if (!message) {
      return { valid: false, errorMessage: 'Por favor, proporciona una respuesta.' };
    }

    switch (step.type) {
      case 'text':
        return this.validateText(message, step);
      case 'number':
        return this.validateNumber(message, step);
      case 'email':
        return this.validateEmail(message, step);
      case 'phone':
        return this.validatePhone(message, step);
      case 'date':
        return this.validateDate(message, step, bot);
      case 'select':
        return this.validateSelect(message, step);
      case 'boolean':
        return this.validateBoolean(message, step);
      case 'regex':
        return this.validateRegex(message, step);
      case 'consent':
        // Consent is handled separately in handleConsentResponse
        return { valid: true, parsedValue: message };
      default:
        if (step.aiInterpretation) {
          return this.aiValidate(message, step, bot);
        }
        return { valid: true, parsedValue: message };
    }
  }

  private validateText(message: string, step: FlowStep): { valid: boolean; parsedValue?: string; errorMessage?: string } {
    if (step.validation?.pattern) {
      const regex = new RegExp(step.validation.pattern);
      if (!regex.test(message)) {
        return { valid: false, errorMessage: step.validation.errorMessage };
      }
    }
    if (step.validation?.min && message.length < step.validation.min) {
      return { valid: false, errorMessage: step.validation.errorMessage || `La respuesta debe tener al menos ${step.validation.min} caracteres.` };
    }
    if (step.validation?.max && message.length > step.validation.max) {
      return { valid: false, errorMessage: step.validation.errorMessage || `La respuesta no debe exceder ${step.validation.max} caracteres.` };
    }
    return { valid: true, parsedValue: message };
  }

  private validateNumber(message: string, step: FlowStep): { valid: boolean; parsedValue?: string; errorMessage?: string } {
    const numberMatch = message.match(/[\d.,]+/);
    if (!numberMatch) {
      return { valid: false, errorMessage: step.validation?.errorMessage || 'Por favor, ingresa un número válido.' };
    }
    const num = parseFloat(numberMatch[0].replace(',', '.'));
    if (isNaN(num)) {
      return { valid: false, errorMessage: step.validation?.errorMessage || 'Por favor, ingresa un número válido.' };
    }
    if (step.validation?.min !== undefined && num < step.validation.min) {
      return { valid: false, errorMessage: step.validation.errorMessage || `El número debe ser al menos ${step.validation.min}.` };
    }
    if (step.validation?.max !== undefined && num > step.validation.max) {
      return { valid: false, errorMessage: step.validation.errorMessage || `El número no debe ser mayor a ${step.validation.max}.` };
    }
    return { valid: true, parsedValue: String(num) };
  }

  private validateEmail(message: string, step: FlowStep): { valid: boolean; parsedValue?: string; errorMessage?: string } {
    const emailMatch = message.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (!emailMatch) {
      return { valid: false, errorMessage: step.validation?.errorMessage || 'Por favor, ingresa un correo electrónico válido.' };
    }
    return { valid: true, parsedValue: emailMatch[0].toLowerCase() };
  }

  private validatePhone(message: string, step: FlowStep): { valid: boolean; parsedValue?: string; errorMessage?: string } {
    const cleaned = message.replace(/[^\d+]/g, '');
    if (cleaned.length < 7 || cleaned.length > 15) {
      return { valid: false, errorMessage: step.validation?.errorMessage || 'Por favor, ingresa un número de teléfono válido (7-15 dígitos).' };
    }
    return { valid: true, parsedValue: cleaned };
  }

  private async validateDate(message: string, step: FlowStep, bot: Bot): Promise<{ valid: boolean; parsedValue?: string; errorMessage?: string; usage?: any }> {
    const datePatterns = [
      /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/,
      /(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/,
    ];

    for (const pattern of datePatterns) {
      const match = message.match(pattern);
      if (match) {
        let year: string, month: string, day: string;
        if (match[1].length === 4) {
          year = match[1]; month = match[2].padStart(2, '0'); day = match[3].padStart(2, '0');
        } else {
          day = match[1].padStart(2, '0'); month = match[2].padStart(2, '0');
          year = match[3].length === 2 ? `20${match[3]}` : match[3];
        }
        const dateStr = `${year}-${month}-${day}`;
        if (!isNaN(new Date(dateStr).getTime())) {
          return { valid: true, parsedValue: dateStr };
        }
      }
    }

    if (step.aiInterpretation) {
      return this.aiValidate(message, step, bot);
    }

    return { valid: false, errorMessage: step.validation?.errorMessage || 'Por favor, ingresa una fecha válida (DD/MM/AAAA).' };
  }

  private validateSelect(message: string, step: FlowStep): { valid: boolean; parsedValue?: string; errorMessage?: string } {
    const options = step.validation?.options || [];
    if (options.length === 0) return { valid: true, parsedValue: message };

    const lowerMessage = message.toLowerCase().trim();

    const exactMatch = options.find((opt) => opt.toLowerCase() === lowerMessage);
    if (exactMatch) return { valid: true, parsedValue: exactMatch };

    const numMatch = lowerMessage.match(/^(\d+)$/);
    if (numMatch) {
      const idx = parseInt(numMatch[1]) - 1;
      if (idx >= 0 && idx < options.length) return { valid: true, parsedValue: options[idx] };
    }

    const partialMatch = options.find(
      (opt) => opt.toLowerCase().includes(lowerMessage) || lowerMessage.includes(opt.toLowerCase()),
    );
    if (partialMatch) return { valid: true, parsedValue: partialMatch };

    const optionsList = options.map((o, i) => `${i + 1}. ${o}`).join('\n');
    return { valid: false, errorMessage: step.validation?.errorMessage || `Por favor, selecciona una opción válida:\n${optionsList}` };
  }

  private validateBoolean(message: string, step: FlowStep): { valid: boolean; parsedValue?: string; errorMessage?: string } {
    const positives = ['si', 'sí', 'yes', 'ok', 'dale', 'claro', 'correcto', 'afirmativo', '1', 'true'];
    const negatives = ['no', 'nop', 'nope', 'negativo', '0', 'false', 'nel'];

    const lower = message.toLowerCase().trim();
    if (positives.some((p) => lower.includes(p))) return { valid: true, parsedValue: 'true' };
    if (negatives.some((n) => lower.includes(n))) return { valid: true, parsedValue: 'false' };

    return { valid: false, errorMessage: step.validation?.errorMessage || 'Por favor, responde sí o no.' };
  }

  private validateRegex(message: string, step: FlowStep): { valid: boolean; parsedValue?: string; errorMessage?: string } {
    if (!step.validation?.pattern) return { valid: true, parsedValue: message };

    const regex = new RegExp(step.validation.pattern);
    const match = message.match(regex);
    if (!match) {
      return { valid: false, errorMessage: step.validation.errorMessage || 'El formato de la respuesta no es válido.' };
    }
    return { valid: true, parsedValue: match[1] || match[0] };
  }

  // ─── AI Interpretation ──────────────────────────────────

  private async aiParseValue(
    rawValue: string,
    step: FlowStep,
    bot: Bot,
  ): Promise<{ parsedValue?: string }> {
    const apiKey = this.configService.get<string>('OPENROUTER_API_KEY');
    if (!apiKey) return {};

    const systemPrompt = `Eres un parser de datos. El usuario respondió a la pregunta: "${step.question}".
El campo esperado es: "${step.field}" (${step.type}).
Extrae SOLO el dato relevante de la respuesta del usuario. Devuelve únicamente el valor extraído, sin explicaciones ni formato adicional.

Ejemplos:
- Pregunta: "¿Cuál es tu nombre?" / Respuesta: "mi nombre es Victor Ramos" → Victor Ramos
- Pregunta: "¿Cuál es tu empresa?" / Respuesta: "La empresa se llama Nueva Empresa" → Nueva Empresa
- Pregunta: "¿Cuál es tu email?" / Respuesta: "mi correo es test@mail.com" → test@mail.com
- Pregunta: "¿Cuál es tu teléfono?" / Respuesta: "me pueden llamar al 300 123 4567" → 3001234567`;

    try {
      const resolvedModel = await this.resolveModel(bot.tenantId, bot.model);
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: resolvedModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: rawValue },
          ],
          temperature: 0.1,
          max_tokens: 100,
        }),
      });

      if (!res.ok) return {};

      const json = await res.json();
      const parsed = json.choices?.[0]?.message?.content?.trim();
      if (parsed && parsed.length > 0 && parsed.length < rawValue.length * 2) {
        return { parsedValue: parsed };
      }
      return {};
    } catch {
      return {};
    }
  }

  private async aiValidate(
    message: string,
    step: FlowStep,
    bot: Bot,
  ): Promise<{ valid: boolean; parsedValue?: string; errorMessage?: string; usage?: any }> {
    const apiKey = this.configService.get<string>('OPENROUTER_API_KEY');
    if (!apiKey) return { valid: true, parsedValue: message };

    const typeInstructions: Record<string, string> = {
      date: 'Extrae la fecha mencionada y devuélvela en formato YYYY-MM-DD.',
      number: 'Extrae el número mencionado.',
      text: 'Extrae el valor relevante de la respuesta del usuario.',
      email: 'Extrae el correo electrónico mencionado.',
      phone: 'Extrae el número de teléfono mencionado.',
    };

    const systemPrompt = `Eres un parser de datos. El usuario está respondiendo a la pregunta: "${step.question}".
El campo esperado es: "${step.field}" (${step.type}).
${typeInstructions[step.type] || 'Extrae el dato relevante.'}

Responde SOLO con un JSON con esta estructura:
{"valid": true, "value": "dato_extraido"} si puedes extraer un dato válido.
{"valid": false, "reason": "explicación breve"} si la respuesta no contiene el dato esperado.

NO agregues explicaciones fuera del JSON.`;

    try {
      const resolvedModel = await this.resolveModel(bot.tenantId, bot.model);

      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: resolvedModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: message },
          ],
          temperature: 0.1,
          max_tokens: 150,
        }),
      });

      if (!res.ok) return { valid: true, parsedValue: message };

      const json = await res.json();
      const content = json.choices?.[0]?.message?.content || '';
      const usage = json.usage ? {
        prompt_tokens: json.usage.prompt_tokens || 0,
        completion_tokens: json.usage.completion_tokens || 0,
        model: resolvedModel,
        cost: null,
        credits: 0,
      } : undefined;

      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.valid) return { valid: true, parsedValue: parsed.value, usage };
        return { valid: false, errorMessage: parsed.reason || step.validation?.errorMessage || 'No se pudo interpretar la respuesta.', usage };
      }

      return { valid: true, parsedValue: message, usage };
    } catch {
      return { valid: true, parsedValue: message };
    }
  }

  private async resolveModel(tenantId: string, variant?: string | null): Promise<string> {
    const tenantConfig = await this.billingService.getTenantDefaultModel(tenantId);
    let model = tenantConfig.model || '';
    if (!model) {
      const globalConfig = await this.billingService.getDefaultModel();
      model = globalConfig.model || '';
    }
    if (!model) model = 'openai/gpt-4o-mini';
    if (variant && !model.includes(':')) model = `${model}:${variant}`;
    return model;
  }

  // ─── Public Utilities ──────────────────────────────────

  async resetFlowState(conversationId: string): Promise<void> {
    await this.conversationRepo.update(conversationId, { botFlowState: null });
  }

  getFlowProgress(bot: Bot, conversation: Conversation): { totalSteps: number; completedSteps: number; percentage: number; currentStep: FlowStep | null; collectedData: Record<string, string> } {
    const steps = bot.flowSteps || [];
    const state = conversation.botFlowState;

    if (!state) {
      return { totalSteps: steps.length, completedSteps: 0, percentage: 0, currentStep: steps[0] || null, collectedData: {} };
    }

    const completed = state.completedSteps.length;
    const percentage = steps.length > 0 ? Math.round((completed / steps.length) * 100) : 0;
    const currentStep = steps.find((s) => s.order === state.currentStepIndex) || null;

    return { totalSteps: steps.length, completedSteps: completed, percentage, currentStep, collectedData: state.collectedData };
  }
}
