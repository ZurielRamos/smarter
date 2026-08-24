import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Bot, FlowStep, BotFlowState, FlowConfig } from './bot.entity';
import { Conversation } from '../chats/conversation.entity';
import { BillingService } from '../billing/billing.service';

export interface SequentialFlowResponse {
  content: string;
  extractedData?: Record<string, string>;
  handedOff?: boolean;
  flowCompleted?: boolean;
  currentStep?: FlowStep;
  usage?: { prompt_tokens: number; completion_tokens: number; model: string; cost: number | null; credits: number };
}

@Injectable()
export class SequentialFlowEngine {
  constructor(
    @InjectRepository(Conversation)
    private readonly conversationRepo: Repository<Conversation>,
    private readonly configService: ConfigService,
    private readonly billingService: BillingService,
  ) {}

  /**
   * Process an inbound message through the sequential flow.
   * Returns the next message to send to the user.
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
    let state: BotFlowState = conversation.botFlowState || this.createInitialState();

    // Check if this is the first interaction (no steps completed, index 0)
    const isFirstMessage = state.currentStepIndex === 0 && state.completedSteps.length === 0 && !state.lastStepAt;

    if (isFirstMessage) {
      // Send the first question (this is the welcome + first step)
      const firstStep = this.getNextStep(steps, state, config);
      if (!firstStep) {
        return { content: config.completionMessage || 'Flujo completado.', flowCompleted: true };
      }

      state.lastStepAt = new Date().toISOString();
      conversation.botFlowState = state;
      await this.conversationRepo.save(conversation);

      const greeting = bot.welcomeMessage ? `${bot.welcomeMessage}\n\n${firstStep.question}` : firstStep.question;
      return { content: greeting, currentStep: firstStep };
    }

    // Get the current step that we're expecting a response for
    const currentStep = steps.find((s) => s.order === state.currentStepIndex);
    if (!currentStep) {
      // We're past the last step — flow is done
      return this.handleFlowCompletion(bot, conversation, state, config);
    }

    // Check skip keyword
    if (config.allowSkip && config.skipKeyword) {
      const skipKw = (config.skipKeyword || 'omitir').toLowerCase();
      if (userMessage.trim().toLowerCase() === skipKw) {
        if (currentStep.required !== false) {
          // Cannot skip required steps
          return {
            content: `Este dato es obligatorio y no se puede omitir. ${currentStep.question}`,
            currentStep,
          };
        }
        // Skip this step
        return this.advanceToNextStep(bot, conversation, state, steps, config, currentStep);
      }
    }

    // Validate the user's response
    const validationResult = await this.validateResponse(userMessage, currentStep, bot);

    if (!validationResult.valid) {
      // Increment retry count
      state.retryCount++;
      state.globalRetryCount++;

      // Check max retries for this step
      const maxRetries = currentStep.retries ?? 2;
      if (state.retryCount > maxRetries) {
        // Max retries exceeded for this step — handoff
        conversation.botFlowState = state;
        await this.conversationRepo.save(conversation);
        return {
          content: bot.handoffMessage || 'Te conecto con un agente para asistirte mejor.',
          handedOff: true,
        };
      }

      // Check global max retries
      if (config.maxGlobalRetries && state.globalRetryCount > config.maxGlobalRetries) {
        conversation.botFlowState = state;
        await this.conversationRepo.save(conversation);
        return {
          content: bot.handoffMessage || 'Te conecto con un agente para asistirte mejor.',
          handedOff: true,
        };
      }

      // Send validation error + repeat question
      const errorMsg = validationResult.errorMessage || currentStep.validation?.errorMessage || 'Respuesta no válida.';
      conversation.botFlowState = state;
      await this.conversationRepo.save(conversation);

      return {
        content: `${errorMsg}\n\n${currentStep.question}`,
        currentStep,
        usage: validationResult.usage,
      };
    }

    // Response is valid — save the data and advance
    const parsedValue = validationResult.parsedValue || userMessage.trim();
    state.collectedData[currentStep.field] = parsedValue;
    state.retryCount = 0; // Reset per-step retry count

    return this.advanceToNextStep(bot, conversation, state, steps, config, currentStep, parsedValue, validationResult.usage);
  }

  /**
   * Send the initial greeting + first question when a new conversation starts.
   * Called from triggerBotReply when there's no prior flow state.
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
    await this.conversationRepo.save(conversation);

    const greeting = bot.welcomeMessage ? `${bot.welcomeMessage}\n\n${firstStep.question}` : firstStep.question;
    return { content: greeting, currentStep: firstStep };
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

  private getNextStep(steps: FlowStep[], state: BotFlowState, config: FlowConfig): FlowStep | null {
    const sortedSteps = [...steps].sort((a, b) => a.order - b.order);

    for (const step of sortedSteps) {
      if (state.completedSteps.includes(step.id)) continue;

      // Check skipIf condition
      if (step.skipIf && this.evaluateSkipCondition(step.skipIf, state.collectedData)) {
        state.completedSteps.push(step.id);
        continue;
      }

      return step;
    }

    return null; // All steps completed
  }

  private evaluateSkipCondition(condition: string, collectedData: Record<string, string>): boolean {
    // Simple condition evaluator: "collectedData.fieldName" checks if the field has a value
    // Supports: "collectedData.phone", "!collectedData.email" (negation)
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
    // Mark current step as completed
    state.completedSteps.push(completedStep.id);
    state.lastStepAt = new Date().toISOString();

    // Find the next step
    const nextStep = this.getNextStep(steps, state, config);

    if (!nextStep) {
      // All steps completed
      return this.handleFlowCompletion(bot, conversation, state, config, usage);
    }

    // Update state to next step
    state.currentStepIndex = nextStep.order;
    state.retryCount = 0;
    conversation.botFlowState = state;
    await this.conversationRepo.save(conversation);

    return {
      content: nextStep.question,
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
    // Save final state
    conversation.botFlowState = state;
    await this.conversationRepo.save(conversation);

    const completionMessage = config.completionMessage || 'Gracias, hemos recopilado toda la información necesaria.';
    const handedOff = config.completionAction === 'handoff' || config.completionAction === 'resolve';

    return {
      content: completionMessage,
      extractedData: state.collectedData,
      flowCompleted: true,
      handedOff,
      usage,
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

    // Type-based validation
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

      default:
        // If AI interpretation is enabled, use AI to parse
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
    // Extract number from message (user might say "tengo 25 años" for age)
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
    // Extract email from message
    const emailMatch = message.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (!emailMatch) {
      return { valid: false, errorMessage: step.validation?.errorMessage || 'Por favor, ingresa un correo electrónico válido.' };
    }
    return { valid: true, parsedValue: emailMatch[0].toLowerCase() };
  }

  private validatePhone(message: string, step: FlowStep): { valid: boolean; parsedValue?: string; errorMessage?: string } {
    // Extract phone number: at least 7 digits, allow +, spaces, dashes, parens
    const cleaned = message.replace(/[^\d+]/g, '');
    if (cleaned.length < 7 || cleaned.length > 15) {
      return { valid: false, errorMessage: step.validation?.errorMessage || 'Por favor, ingresa un número de teléfono válido (7-15 dígitos).' };
    }
    return { valid: true, parsedValue: cleaned };
  }

  private async validateDate(message: string, step: FlowStep, bot: Bot): Promise<{ valid: boolean; parsedValue?: string; errorMessage?: string; usage?: any }> {
    // Try common date formats first
    const datePatterns = [
      /(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/,  // DD/MM/YYYY or DD-MM-YYYY
      /(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/,     // YYYY-MM-DD
    ];

    for (const pattern of datePatterns) {
      const match = message.match(pattern);
      if (match) {
        // Normalize to YYYY-MM-DD
        let year: string, month: string, day: string;
        if (match[1].length === 4) {
          // YYYY-MM-DD format
          year = match[1];
          month = match[2].padStart(2, '0');
          day = match[3].padStart(2, '0');
        } else {
          // DD/MM/YYYY format
          day = match[1].padStart(2, '0');
          month = match[2].padStart(2, '0');
          year = match[3].length === 2 ? `20${match[3]}` : match[3];
        }
        const dateStr = `${year}-${month}-${day}`;
        const date = new Date(dateStr);
        if (!isNaN(date.getTime())) {
          return { valid: true, parsedValue: dateStr };
        }
      }
    }

    // If AI interpretation is enabled, use AI to parse natural language dates
    if (step.aiInterpretation) {
      return this.aiValidate(message, step, bot);
    }

    return { valid: false, errorMessage: step.validation?.errorMessage || 'Por favor, ingresa una fecha válida (DD/MM/AAAA).' };
  }

  private validateSelect(message: string, step: FlowStep): { valid: boolean; parsedValue?: string; errorMessage?: string } {
    const options = step.validation?.options || [];
    if (options.length === 0) {
      return { valid: true, parsedValue: message };
    }

    const lowerMessage = message.toLowerCase().trim();

    // Check exact match first
    const exactMatch = options.find((opt) => opt.toLowerCase() === lowerMessage);
    if (exactMatch) return { valid: true, parsedValue: exactMatch };

    // Check if user sent a number (option index)
    const numMatch = lowerMessage.match(/^(\d+)$/);
    if (numMatch) {
      const idx = parseInt(numMatch[1]) - 1;
      if (idx >= 0 && idx < options.length) {
        return { valid: true, parsedValue: options[idx] };
      }
    }

    // Check partial match (option contains the message or vice versa)
    const partialMatch = options.find(
      (opt) => opt.toLowerCase().includes(lowerMessage) || lowerMessage.includes(opt.toLowerCase()),
    );
    if (partialMatch) return { valid: true, parsedValue: partialMatch };

    const optionsList = options.map((o, i) => `${i + 1}. ${o}`).join('\n');
    return {
      valid: false,
      errorMessage: step.validation?.errorMessage || `Por favor, selecciona una opción válida:\n${optionsList}`,
    };
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
    if (!step.validation?.pattern) {
      return { valid: true, parsedValue: message };
    }

    const regex = new RegExp(step.validation.pattern);
    const match = message.match(regex);
    if (!match) {
      return { valid: false, errorMessage: step.validation.errorMessage || 'El formato de la respuesta no es válido.' };
    }

    // Return the matched group if available, otherwise the full match
    return { valid: true, parsedValue: match[1] || match[0] };
  }

  // ─── AI Interpretation ──────────────────────────────────

  private async aiValidate(
    message: string,
    step: FlowStep,
    bot: Bot,
  ): Promise<{ valid: boolean; parsedValue?: string; errorMessage?: string; usage?: any }> {
    const apiKey = this.configService.get<string>('OPENROUTER_API_KEY');
    if (!apiKey) {
      // Fallback: accept as-is if no API key
      return { valid: true, parsedValue: message };
    }

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

      if (!res.ok) {
        // Fallback: accept as-is
        return { valid: true, parsedValue: message };
      }

      const json = await res.json();
      const content = json.choices?.[0]?.message?.content || '';
      const usage = json.usage ? {
        prompt_tokens: json.usage.prompt_tokens || 0,
        completion_tokens: json.usage.completion_tokens || 0,
        model: resolvedModel,
        cost: null,
        credits: 0,
      } : undefined;

      // Parse AI response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.valid) {
          return { valid: true, parsedValue: parsed.value, usage };
        } else {
          return {
            valid: false,
            errorMessage: parsed.reason || step.validation?.errorMessage || 'No se pudo interpretar la respuesta.',
            usage,
          };
        }
      }

      // Fallback: accept as-is
      return { valid: true, parsedValue: message, usage };
    } catch {
      // Fallback: accept as-is on AI error
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

    if (variant && !model.includes(':')) {
      model = `${model}:${variant}`;
    }

    return model;
  }

  /**
   * Reset the flow state for a conversation — allows restarting the flow.
   */
  async resetFlowState(conversationId: string): Promise<void> {
    await this.conversationRepo.update(conversationId, { botFlowState: null });
  }

  /**
   * Get flow progress for a conversation.
   */
  getFlowProgress(bot: Bot, conversation: Conversation): { totalSteps: number; completedSteps: number; percentage: number; currentStep: FlowStep | null; collectedData: Record<string, string> } {
    const steps = bot.flowSteps || [];
    const state = conversation.botFlowState;

    if (!state) {
      return { totalSteps: steps.length, completedSteps: 0, percentage: 0, currentStep: steps[0] || null, collectedData: {} };
    }

    const completed = state.completedSteps.length;
    const percentage = steps.length > 0 ? Math.round((completed / steps.length) * 100) : 0;
    const currentStep = steps.find((s) => s.order === state.currentStepIndex) || null;

    return {
      totalSteps: steps.length,
      completedSteps: completed,
      percentage,
      currentStep,
      collectedData: state.collectedData,
    };
  }
}
