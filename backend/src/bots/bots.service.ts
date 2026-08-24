import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { Bot } from './bot.entity';
import { BotTool } from './bot-tool.entity';
import { BotToolLog } from './bot-tool-log.entity';
import { BotKnowledge } from './bot-knowledge.entity';
import { Message } from '../chats/message.entity';
import { Conversation } from '../chats/conversation.entity';
import { CreateBotDto } from './dto/create-bot.dto';
import { UpdateBotDto } from './dto/update-bot.dto';
import { CreateBotToolDto } from './dto/create-bot-tool.dto';
import { UpdateBotToolDto } from './dto/update-bot-tool.dto';
import { BillingService } from '../billing/billing.service';

export interface ChatResponse {
  role: string;
  content: string;
  usage?: { prompt_tokens: number; completion_tokens: number; model: string; cost: number | null; credits: number };
  extractedData?: Record<string, string>;
  handedOff?: boolean;
  toolsExecuted?: { name: string; result: string }[];
}

@Injectable()
export class BotsService {
  constructor(
    @InjectRepository(Bot)
    private readonly botRepo: Repository<Bot>,
    @InjectRepository(BotTool)
    private readonly botToolRepo: Repository<BotTool>,
    @InjectRepository(BotToolLog)
    private readonly toolLogRepo: Repository<BotToolLog>,
    @InjectRepository(BotKnowledge)
    private readonly knowledgeRepo: Repository<BotKnowledge>,
    @InjectRepository(Message)
    private readonly messageRepo: Repository<Message>,
    @InjectRepository(Conversation)
    private readonly conversationRepo: Repository<Conversation>,
    private readonly configService: ConfigService,
    private readonly billingService: BillingService,
  ) {}

  // ─── CRUD Bot ───────────────────────────────────────────

  async findAll(tenantId: string): Promise<Bot[]> {
    return this.botRepo.find({ where: { tenantId }, order: { createdAt: 'DESC' } });
  }

  async findOne(id: string): Promise<Bot> {
    const bot = await this.botRepo.findOne({ where: { id } });
    if (!bot) throw new NotFoundException('Bot no encontrado');
    return bot;
  }

  async create(dto: CreateBotDto): Promise<Bot> {
    const bot = this.botRepo.create({ tenantId: dto.tenantId, name: dto.name, description: dto.description || null, type: dto.type || 'freeform', status: 'draft' });
    return this.botRepo.save(bot);
  }

  async update(id: string, dto: UpdateBotDto): Promise<Bot> {
    const bot = await this.findOne(id);
    Object.assign(bot, dto);
    return this.botRepo.save(bot);
  }

  async remove(id: string): Promise<void> {
    const bot = await this.findOne(id);
    await this.botRepo.remove(bot);
  }

  async getConversation(conversationId: string): Promise<Conversation> {
    const conversation = await this.conversationRepo.findOne({ where: { id: conversationId } });
    if (!conversation) throw new NotFoundException('Conversación no encontrada');
    return conversation;
  }

  // ─── CRUD BotTool ───────────────────────────────────────

  async getTools(botId: string): Promise<BotTool[]> {
    return this.botToolRepo.find({ where: { botId }, order: { sortOrder: 'ASC', createdAt: 'ASC' } });
  }

  async getToolLogs(botId: string, limit = 20, offset = 0): Promise<BotToolLog[]> {
    return this.toolLogRepo.find({ where: { botId }, order: { createdAt: 'DESC' }, take: limit, skip: offset });
  }

  // ─── Knowledge Base ─────────────────────────────────────

  async getKnowledge(botId: string): Promise<BotKnowledge[]> {
    return this.knowledgeRepo.find({ where: { botId }, order: { createdAt: 'ASC' } });
  }

  async addKnowledge(botId: string, data: { title: string; content: string; type?: string }): Promise<BotKnowledge> {
    // Split content into chunks (approx 500 chars each for context injection)
    const chunks = this.chunkText(data.content, 500);
    const tokenCount = Math.ceil(data.content.length / 4); // rough estimate: 4 chars per token

    const entry = this.knowledgeRepo.create({
      botId,
      title: data.title,
      content: data.content,
      type: data.type || 'text',
      chunks,
      tokenCount,
      isEnabled: true,
    });
    return this.knowledgeRepo.save(entry);
  }

  async updateKnowledge(id: string, data: Partial<{ title: string; content: string; isEnabled: boolean }>): Promise<BotKnowledge> {
    const entry = await this.knowledgeRepo.findOne({ where: { id } });
    if (!entry) throw new NotFoundException('Knowledge entry not found');

    if (data.content) {
      entry.content = data.content;
      entry.chunks = this.chunkText(data.content, 500);
      entry.tokenCount = Math.ceil(data.content.length / 4);
    }
    if (data.title !== undefined) entry.title = data.title;
    if (data.isEnabled !== undefined) entry.isEnabled = data.isEnabled;

    return this.knowledgeRepo.save(entry);
  }

  async removeKnowledge(id: string): Promise<void> {
    const entry = await this.knowledgeRepo.findOne({ where: { id } });
    if (!entry) throw new NotFoundException('Knowledge entry not found');
    await this.knowledgeRepo.remove(entry);
  }

  private chunkText(text: string, maxChars: number): string[] {
    const paragraphs = text.split(/\n\n+/);
    const chunks: string[] = [];
    let current = '';

    for (const para of paragraphs) {
      if ((current + para).length > maxChars && current) {
        chunks.push(current.trim());
        current = para;
      } else {
        current += (current ? '\n\n' : '') + para;
      }
    }
    if (current.trim()) chunks.push(current.trim());
    return chunks;
  }

  private async searchKnowledge(botId: string, query: string): Promise<string> {
    const entries = await this.knowledgeRepo.find({ where: { botId, isEnabled: true } });
    if (entries.length === 0) return JSON.stringify({ results: [] });

    // Tokenize query into keywords (lowercase, remove accents, min 3 chars)
    const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const keywords = normalize(query)
      .split(/\s+/)
      .filter((w) => w.length >= 3)
      .filter((w) => !['que', 'con', 'los', 'las', 'una', 'del', 'para', 'por', 'como', 'mas', 'son', 'hay'].includes(w));

    if (keywords.length === 0) {
      // No meaningful keywords, return first chunk of each entry as overview
      const overview = entries.slice(0, 3).map((e) => e.chunks?.[0] || e.content.substring(0, 500));
      return JSON.stringify({ results: overview });
    }

    // Score each chunk by keyword matches
    const scoredChunks: { chunk: string; score: number; title: string }[] = [];

    for (const entry of entries) {
      const chunks = entry.chunks || [entry.content];
      for (const chunk of chunks) {
        const normalizedChunk = normalize(chunk);
        let score = 0;
        for (const kw of keywords) {
          const occurrences = (normalizedChunk.match(new RegExp(kw, 'g')) || []).length;
          score += occurrences;
        }
        if (score > 0) {
          scoredChunks.push({ chunk, score, title: entry.title });
        }
      }
    }

    // Sort by score, take top 5
    scoredChunks.sort((a, b) => b.score - a.score);
    const topResults = scoredChunks.slice(0, 5);

    if (topResults.length === 0) {
      return JSON.stringify({ results: [], message: 'No se encontró información relevante.' });
    }

    // Format results for the model
    const formatted = topResults.map((r) => `[${r.title}]\n${r.chunk}`);
    return JSON.stringify({ results: formatted });
  }

  async createTool(dto: CreateBotToolDto): Promise<BotTool> {
    const tool = this.botToolRepo.create({
      botId: dto.botId,
      name: dto.name,
      description: dto.description,
      parameters: dto.parameters || { type: 'object', properties: {} },
      executionType: dto.executionType,
      webhookUrl: dto.webhookUrl || null,
      webhookMethod: dto.webhookMethod || 'POST',
      webhookHeaders: dto.webhookHeaders || null,
      staticResponse: dto.staticResponse || null,
      internalAction: dto.internalAction || null,
      isEnabled: dto.isEnabled ?? true,
    });
    return this.botToolRepo.save(tool);
  }

  async updateTool(id: string, dto: UpdateBotToolDto): Promise<BotTool> {
    const tool = await this.botToolRepo.findOne({ where: { id } });
    if (!tool) throw new NotFoundException('Tool no encontrada');
    Object.assign(tool, dto);
    return this.botToolRepo.save(tool);
  }

  async removeTool(id: string): Promise<void> {
    const tool = await this.botToolRepo.findOne({ where: { id } });
    if (!tool) throw new NotFoundException('Tool no encontrada');
    await this.botToolRepo.remove(tool);
  }

  async testTool(toolId: string, args: Record<string, any>, contactData: Record<string, string>): Promise<{ success: boolean; response: string; duration: number }> {
    const tool = await this.botToolRepo.findOne({ where: { id: toolId } });
    if (!tool) throw new NotFoundException('Tool no encontrada');

    const start = Date.now();
    let response: string;

    if (tool.executionType === 'static') {
      response = tool.staticResponse || '{"result": "No response configured"}';
    } else if (tool.executionType === 'webhook') {
      response = await this.executeWebhook(tool, args, contactData);
    } else {
      response = JSON.stringify({ error: 'Unknown execution type' });
    }

    const duration = Date.now() - start;
    const success = !response.includes('"error"');

    // Log test execution
    this.toolLogRepo.save(this.toolLogRepo.create({
      botId: tool.botId,
      toolId: tool.id,
      toolName: tool.name,
      args,
      response: response.substring(0, 5000),
      success,
      durationMs: duration,
      isTest: true,
    })).catch(() => {});

    return { success, response, duration };
  }

  // ─── Models Search ──────────────────────────────────────

  async searchModels(q?: string): Promise<{ id: string; name: string; pricing: { prompt: string; completion: string }; context_length: number }[]> {
    const params = new URLSearchParams();
    params.set('limit', '20');
    params.set('output_modalities', 'text');
    params.set('sort', 'most-popular');
    if (q) params.set('q', q);

    const res = await fetch(`https://openrouter.ai/api/v1/models?${params.toString()}`);
    if (!res.ok) return [];

    const json = await res.json();
    return (json.data || []).map((m: any) => ({
      id: m.id,
      name: m.name,
      pricing: m.pricing ? { prompt: m.pricing.prompt, completion: m.pricing.completion } : null,
      context_length: m.context_length,
    }));
  }

  // ─── Chat with Tools ───────────────────────────────────

  async chat(botId: string, messages: { role: string; content: string }[], collectedData?: Record<string, string>): Promise<ChatResponse> {
    const bot = await this.findOne(botId);
    const apiKey = this.configService.get<string>('OPENROUTER_API_KEY');
    if (!apiKey) throw new NotFoundException('OPENROUTER_API_KEY no configurada');

    // === CONSENT GATE (for test chat) ===
    if (bot.consentConfig?.enabled) {
      const consent = bot.consentConfig;
      // Check if consent has been given in this conversation (look at message history)
      const consentGiven = messages.some((m) => {
        if (m.role !== 'assistant') return false;
        // If bot has already responded with something other than the consent message, consent was given
        const isConsentMsg = m.content.includes(consent.message?.substring(0, 30) || '___no_match___');
        return !isConsentMsg && messages.indexOf(m) > 0;
      });

      if (!consentGiven) {
        const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
        if (lastUserMsg) {
          const lower = lastUserMsg.content.toLowerCase().trim();
          const acceptWords = consent.acceptKeywords?.length
            ? consent.acceptKeywords.map((k) => k.toLowerCase())
            : ['si', 'sí', 'acepto', 'autorizo', 'ok', 'dale', 'de acuerdo'];
          const rejectWords = consent.rejectKeywords?.length
            ? consent.rejectKeywords.map((k) => k.toLowerCase())
            : ['no', 'rechazo', 'no acepto', 'no autorizo'];

          const accepted = acceptWords.some((w) => lower.includes(w));
          const rejected = rejectWords.some((w) => lower.includes(w));

          if (rejected) {
            const rejectMsg = consent.rejectMessage || 'Entendido. Sin tu autorización no podemos continuar.';
            return { role: 'assistant', content: rejectMsg, handedOff: consent.rejectAction === 'handoff' };
          }

          if (!accepted) {
            // First message or ambiguous — send consent message
            let consentText = consent.message || 'Necesito tu autorización para continuar.';
            if (consent.termsUrl) consentText += `\n\n📎 Términos y condiciones: ${consent.termsUrl}`;
            if (consent.ageVerification) consentText += `\n\n${consent.ageMessage || '⚠️ Declaro ser mayor de edad.'}`;
            consentText += '\n\nResponde "Acepto" o "No acepto".';
            return { role: 'assistant', content: consentText };
          }
          // accepted — fall through to normal chat
        } else {
          // No user message yet — send consent
          let consentText = consent.message || 'Necesito tu autorización para continuar.';
          if (consent.termsUrl) consentText += `\n\n📎 Términos y condiciones: ${consent.termsUrl}`;
          if (consent.ageVerification) consentText += `\n\n${consent.ageMessage || '⚠️ Declaro ser mayor de edad.'}`;
          consentText += '\n\nResponde "Acepto" o "No acepto".';
          return { role: 'assistant', content: consentText };
        }
      }
    }

    // Check handoff keywords first (no tokens spent)
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
    if (lastUserMsg && bot.handoffKeywords && bot.handoffKeywords.length > 0) {
      const lowerContent = lastUserMsg.content.toLowerCase();
      const triggered = bot.handoffKeywords.some((kw) => lowerContent.includes(kw.toLowerCase()));
      if (triggered) {
        const handoffMsg = bot.handoffMessage || 'Te conecto con un agente humano. Un momento por favor.';
        return { role: 'assistant', content: handoffMsg, handedOff: true };
      }
    }

    // Build system prompt
    const systemPrompt = this.compileSystemPrompt(bot, collectedData);

    // Build tools array
    const tools = await this.compileTools(bot, collectedData);

    // First request to OpenRouter
    const requestMessages: any[] = [];
    if (systemPrompt) requestMessages.push({ role: 'system', content: systemPrompt });
    requestMessages.push(...messages);

    // Resolve model: tenant config → global config → fallback + variant
    const resolvedModel = await this.resolveModel(bot.tenantId, bot.model);

    const requestBody: any = {
      model: resolvedModel,
      messages: requestMessages,
      temperature: Number(bot.temperature) || 0.7,
      max_tokens: bot.maxTokens || 1024,
    };
    if (tools.length > 0) {
      requestBody.tools = tools;
      requestBody.tool_choice = 'auto';
    }

    let response = await this.callOpenRouter(apiKey, requestBody);

    // Process tool calls (loop up to 3 rounds)
    let extractedData: Record<string, string> | undefined;
    let handedOff = false;
    const toolsExecuted: { name: string; result: string }[] = [];
    let rounds = 0;
    let totalPromptTokens = response.usage?.prompt_tokens || 0;
    let totalCompletionTokens = response.usage?.completion_tokens || 0;
    let totalCost = response.usage?.total_cost ?? 0;

    while (response.tool_calls && response.tool_calls.length > 0 && rounds < 3) {
      rounds++;

      // Add assistant message with tool_calls to conversation
      requestBody.messages.push({
        role: 'assistant',
        content: response.content || null,
        tool_calls: response.tool_calls,
      });

      // Execute each tool call (deduplicate by function name within same round)
      const executedInRound = new Set<string>();
      for (const toolCall of response.tool_calls) {
        const fnName = toolCall.function.name;
        if (executedInRound.has(fnName)) {
          // Skip duplicate tool call, but still add a dummy result for the API
          requestBody.messages.push({ role: 'tool', tool_call_id: toolCall.id, content: '{"skipped": "duplicate"}' });
          continue;
        }
        executedInRound.add(fnName);

        let args: Record<string, any> = {};
        try { args = JSON.parse(toolCall.function.arguments); } catch {}

        const result = await this.executeTool(bot, fnName, args, collectedData);
        toolsExecuted.push({ name: fnName, result });

        // Handle system tools
        if (fnName === 'save_contact_data') {
          extractedData = { ...(extractedData || {}), ...args };
        } else if (fnName === 'handoff_to_human') {
          handedOff = true;
        } else if (fnName === 'mark_resolved') {
          handedOff = true;
        }

        // Add tool result to conversation
        requestBody.messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: result,
        });
      }

      // Request again with tool results
      response = await this.callOpenRouter(apiKey, requestBody);
      totalPromptTokens += response.usage?.prompt_tokens || 0;
      totalCompletionTokens += response.usage?.completion_tokens || 0;
      totalCost += response.usage?.total_cost ?? 0;
    }

    const content = response.content || 'Sin respuesta';

    // Accumulate token usage
    bot.totalPromptTokens = (bot.totalPromptTokens || 0) + totalPromptTokens;
    bot.totalCompletionTokens = (bot.totalCompletionTokens || 0) + totalCompletionTokens;
    bot.totalRequests = (bot.totalRequests || 0) + 1;
    await this.botRepo.save(bot);

    // Calculate and debit credits
    let creditsConsumed = 0;
    try {
      const inputRate = await this.billingService.getEffectiveActionCost(bot.tenantId, 'ai_input_tokens') ?? 0;
      const outputRate = await this.billingService.getEffectiveActionCost(bot.tenantId, 'ai_output_tokens') ?? 0;
      // Rates are per 1M tokens
      const inputCredits = (totalPromptTokens / 1_000_000) * inputRate;
      const outputCredits = (totalCompletionTokens / 1_000_000) * outputRate;
      creditsConsumed = Math.ceil((inputCredits + outputCredits) * 100) / 100; // round to 2 decimals

      if (creditsConsumed > 0) {
        await this.billingService.consume(bot.tenantId, {
          amount: creditsConsumed,
          source: 'bot_message',
          referenceId: bot.id,
          description: `Bot "${bot.name}" - ${totalPromptTokens} in / ${totalCompletionTokens} out tokens`,
        });
      }
    } catch (err) {
      console.warn(`[Bot Billing] Failed to debit credits for bot ${bot.id}:`, err?.message);
    }

    return {
      role: 'assistant',
      content,
      usage: {
        prompt_tokens: totalPromptTokens,
        completion_tokens: totalCompletionTokens,
        model: resolvedModel,
        cost: totalCost,
        credits: creditsConsumed,
      },
      extractedData,
      handedOff,
      toolsExecuted: toolsExecuted.length > 0 ? toolsExecuted : undefined,
    };
  }

  // ─── OpenRouter API Call ────────────────────────────────

  private async callOpenRouter(apiKey: string, body: any): Promise<any> {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`OpenRouter error: ${error}`);
    }

    const json = await res.json();
    const choice = json.choices?.[0]?.message || {};
    return { ...choice, usage: json.usage };
  }

  // ─── Compile Tools ──────────────────────────────────────

  private async compileTools(bot: Bot, collectedData?: Record<string, string>): Promise<any[]> {
    const tools: any[] = [];

    // System tool: save_contact_data
    if (bot.dataCollectionEnabled && bot.dataCollectionFields && bot.dataCollectionFields.length > 0) {
      const missingFields = bot.dataCollectionFields.filter((f) => !collectedData?.[f.field]);
      if (missingFields.length > 0) {
        const properties: Record<string, any> = {};
        for (const f of missingFields) {
          properties[f.field] = { type: 'string', description: f.instructions || f.label };
        }
        tools.push({
          type: 'function',
          function: {
            name: 'save_contact_data',
            description: 'Guarda datos del contacto que el usuario ha proporcionado explícitamente en la conversación. SOLO usar cuando el usuario ha dicho un dato concreto.',
            parameters: { type: 'object', properties },
          },
        });
      }
    }

    // System tool: search_knowledge (only if bot has knowledge entries)
    const hasKnowledge = await this.knowledgeRepo.count({ where: { botId: bot.id, isEnabled: true } });
    if (hasKnowledge > 0) {
      tools.push({
        type: 'function',
        function: {
          name: 'search_knowledge',
          description: 'Busca información en la base de conocimiento del negocio (productos, precios, políticas, FAQs, etc). Usar cuando necesites datos específicos para responder al usuario.',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Términos de búsqueda relevantes a la pregunta del usuario' },
            },
            required: ['query'],
          },
        },
      });
    }

    // System tool: handoff_to_human
    tools.push({
      type: 'function',
      function: {
        name: 'handoff_to_human',
        description: 'Transfiere la conversación a un agente humano. Usar cuando el tema excede las capacidades del bot, el usuario está frustrado, o no se puede resolver.',
        parameters: { type: 'object', properties: { reason: { type: 'string', description: 'Razón de la transferencia' } } },
      },
    });

    // System tool: mark_resolved
    tools.push({
      type: 'function',
      function: {
        name: 'mark_resolved',
        description: `Marca la conversación como resuelta. Usar cuando se cumplió el objetivo${bot.objective ? ': ' + bot.objective : ''} y el usuario no tiene más preguntas.`,
        parameters: { type: 'object', properties: { summary: { type: 'string', description: 'Resumen de lo resuelto' } } },
      },
    });

    // Custom tools from DB
    const customTools = await this.botToolRepo.find({ where: { botId: bot.id, isEnabled: true }, order: { sortOrder: 'ASC' } });
    for (const ct of customTools) {
      tools.push({
        type: 'function',
        function: {
          name: ct.name,
          description: ct.description,
          parameters: ct.parameters || { type: 'object', properties: {} },
        },
      });
    }

    return tools;
  }

  // ─── Execute Tool ───────────────────────────────────────

  private async executeTool(bot: Bot, toolName: string, args: Record<string, any>, contactData?: Record<string, any>): Promise<string> {
    // System tools
    if (toolName === 'save_contact_data') {
      return JSON.stringify({ success: true, saved: args });
    }
    if (toolName === 'handoff_to_human') {
      return JSON.stringify({ success: true, message: 'Conversación transferida a un agente humano.' });
    }
    if (toolName === 'mark_resolved') {
      return JSON.stringify({ success: true, message: 'Conversación marcada como resuelta.' });
    }
    if (toolName === 'search_knowledge') {
      return this.searchKnowledge(bot.id, args.query || '');
    }

    // Custom tools
    const tool = await this.botToolRepo.findOne({ where: { botId: bot.id, name: toolName, isEnabled: true } });
    if (!tool) return JSON.stringify({ error: 'Tool not found' });

    const start = Date.now();
    let result: string;

    if (tool.executionType === 'static') {
      result = tool.staticResponse || JSON.stringify({ result: 'No response configured' });
    } else if (tool.executionType === 'webhook') {
      result = await this.executeWebhook(tool, args, contactData);
    } else {
      result = JSON.stringify({ error: 'Unknown execution type' });
    }

    const duration = Date.now() - start;

    // Log execution
    this.toolLogRepo.save(this.toolLogRepo.create({
      botId: bot.id,
      toolId: tool.id,
      toolName,
      args,
      response: result.substring(0, 5000),
      success: !result.includes('"error"'),
      durationMs: duration,
      isTest: false,
    })).catch(() => {});

    return result;
  }

  private async executeWebhook(tool: BotTool, args: Record<string, any>, contactData?: Record<string, any>): Promise<string> {
    if (!tool.webhookUrl) return JSON.stringify({ error: 'No webhook URL configured' });

    // Replace both {{param}} (from AI) and {{contact.field}} (from CRM)
    const replacePlaceholders = (text: string): string => {
      return text
        .replace(/\{\{contact\.(\w+)\}\}/g, (_, field) => contactData?.[field] ?? '')
        .replace(/\{\{(\w+)\}\}/g, (_, k) => args[k] ?? '');
    };

    try {
      const method = (tool.webhookMethod || 'GET').toUpperCase();

      // Build URL with query params
      let url = tool.webhookUrl;
      if (tool.webhookQueryParams && tool.webhookQueryParams.length > 0) {
        const params = new URLSearchParams();
        for (const p of tool.webhookQueryParams) {
          params.set(p.key, replacePlaceholders(p.value));
        }
        url += (url.includes('?') ? '&' : '?') + params.toString();
      }

      // Build headers
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (tool.webhookHeaders && tool.webhookHeaders.length > 0) {
        for (const h of tool.webhookHeaders) {
          headers[h.key] = replacePlaceholders(h.value);
        }
      }

      // Auth
      if (tool.webhookAuthType === 'bearer' && tool.webhookAuthValue) {
        headers['Authorization'] = `Bearer ${tool.webhookAuthValue}`;
      } else if (tool.webhookAuthType === 'basic' && tool.webhookAuthValue) {
        headers['Authorization'] = `Basic ${Buffer.from(tool.webhookAuthValue).toString('base64')}`;
      } else if (tool.webhookAuthType === 'api_key' && tool.webhookAuthValue) {
        // Format: header_name:value
        const [headerName, ...valueParts] = tool.webhookAuthValue.split(':');
        if (headerName && valueParts.length) headers[headerName] = valueParts.join(':');
      }

      // Build body
      const fetchOptions: any = { method, headers };
      if (method !== 'GET') {
        if (tool.webhookBodyType === 'raw' && tool.webhookRawBody) {
          fetchOptions.body = replacePlaceholders(tool.webhookRawBody);
        } else if (tool.webhookBodyFields && tool.webhookBodyFields.length > 0) {
          const body: Record<string, any> = {};
          for (const f of tool.webhookBodyFields) {
            let val = replacePlaceholders(f.value);
            val = this.applyTransform(val, (f as any).transform);
            body[f.key] = val;
          }
          fetchOptions.body = JSON.stringify(body);
        } else {
          fetchOptions.body = JSON.stringify(args);
        }
      }

      const res = await fetch(url, fetchOptions);
      const text = await res.text();

      // Parse response
      let responseData: any;
      try { responseData = JSON.parse(text); } catch { responseData = text; }

      // Apply response mapping if configured
      if (tool.responseMapping && tool.responseMapping.length > 0 && typeof responseData === 'object') {
        const mapped: Record<string, any> = {};
        for (const mapping of tool.responseMapping) {
          const value = this.getNestedValue(responseData, mapping.path);
          if (value !== undefined) mapped[mapping.label] = value;
        }
        return JSON.stringify(mapped);
      }

      return typeof responseData === 'string' ? JSON.stringify({ result: responseData }) : text;
    } catch (err: any) {
      return JSON.stringify({ error: `Webhook failed: ${err.message}` });
    }
  }

  // ─── Metrics ─────────────────────────────────────────────

  async getMetrics(botId: string) {
    const bot = await this.findOne(botId);

    // Total messages sent by bot
    const totalMessages = await this.messageRepo.count({ where: { botId } });

    // Messages in last 24h
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const messages24h = await this.messageRepo
      .createQueryBuilder('m')
      .where('m.bot_id = :botId', { botId })
      .andWhere('m.created_at > :since', { since: last24h })
      .getCount();

    // Messages in last 7 days
    const last7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const messages7d = await this.messageRepo
      .createQueryBuilder('m')
      .where('m.bot_id = :botId', { botId })
      .andWhere('m.created_at > :since', { since: last7d })
      .getCount();

    // Total credits consumed
    const creditsResult = await this.messageRepo
      .createQueryBuilder('m')
      .select('SUM(m.credits_cost)', 'total')
      .where('m.bot_id = :botId', { botId })
      .getRawOne();
    const totalCredits = parseFloat(creditsResult?.total || '0');

    // Conversations where bot participated
    const conversationsResult = await this.messageRepo
      .createQueryBuilder('m')
      .select('COUNT(DISTINCT m.conversation_id)', 'total')
      .where('m.bot_id = :botId', { botId })
      .getRawOne();
    const totalConversations = parseInt(conversationsResult?.total || '0');

    // Resolved conversations (bot_status = 'handed_off' and last bot message in conversation)
    const resolvedResult = await this.conversationRepo
      .createQueryBuilder('c')
      .where('c.bot_status = :status', { status: 'handed_off' })
      .andWhere((qb) => {
        const sub = qb.subQuery().select('1').from(Message, 'msg').where('msg.conversation_id = c.id').andWhere('msg.bot_id = :botId').getQuery();
        return `EXISTS ${sub}`;
      })
      .setParameter('botId', botId)
      .getCount();

    // Average tokens per message
    const avgTokensResult = await this.messageRepo
      .createQueryBuilder('m')
      .select("AVG((m.ai_usage->>'promptTokens')::int + (m.ai_usage->>'completionTokens')::int)", 'avg')
      .where('m.bot_id = :botId', { botId })
      .andWhere('m.ai_usage IS NOT NULL')
      .getRawOne();
    const avgTokensPerMessage = Math.round(parseFloat(avgTokensResult?.avg || '0'));

    return {
      totalMessages,
      messages24h,
      messages7d,
      totalCredits: Math.round(totalCredits * 100) / 100,
      totalConversations,
      resolvedConversations: resolvedResult,
      resolutionRate: totalConversations > 0 ? Math.round((resolvedResult / totalConversations) * 100) : 0,
      avgTokensPerMessage,
      totalPromptTokens: bot.totalPromptTokens,
      totalCompletionTokens: bot.totalCompletionTokens,
      totalRequests: bot.totalRequests,
    };
  }

  // ─── Helpers ─────────────────────────────────────────────

  private async resolveModel(tenantId: string, variant?: string | null): Promise<string> {
    // 1. Tenant-level config
    const tenantConfig = await this.billingService.getTenantDefaultModel(tenantId);
    let model = tenantConfig.model || '';

    // 2. Global config
    if (!model) {
      const globalConfig = await this.billingService.getDefaultModel();
      model = globalConfig.model || '';
    }

    // 3. Fallback
    if (!model) model = 'openai/gpt-4o-mini';

    // Append routing variant if configured
    if (variant && !model.includes(':')) {
      model = `${model}:${variant}`;
    }

    return model;
  }

  private applyTransform(value: string, transform?: string): string {
    if (!transform || !value) return value;
    const transforms = transform.split(',').map((t) => t.trim());
    let result = value;
    for (const t of transforms) {
      const tl = t.toLowerCase();
      if (tl === 'date_ymd' || tl === 'date') {
        const d = new Date(result);
        if (!isNaN(d.getTime())) result = d.toISOString().split('T')[0];
      } else if (tl === 'uppercase') {
        result = result.toUpperCase();
      } else if (tl === 'lowercase') {
        result = result.toLowerCase();
      } else if (tl === 'no_tildes' || tl === 'remove_accents') {
        result = result.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      } else if (tl === 'trim') {
        result = result.trim();
      } else if (t.startsWith('prefix:')) {
        result = t.substring(7) + result;
      } else if (t.startsWith('suffix:')) {
        result = result + t.substring(7);
      } else if (t.startsWith('map:')) {
        // map:original1=nuevo1|original2=nuevo2
        const mappings = t.substring(4).split('|');
        for (const m of mappings) {
          const [from, to] = m.split('=');
          if (from && to && result.toLowerCase() === from.toLowerCase()) {
            result = to;
            break;
          }
        }
      } else if (t.startsWith('replace:')) {
        // replace:buscar=reemplazar
        const parts = t.substring(8).split('=');
        if (parts[0]) result = result.replaceAll(parts[0], parts[1] || '');
      }
    }
    return result;
  }

  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => {
      if (current === undefined || current === null) return undefined;
      const match = key.match(/^(\w+)\[(\d+)\]$/);
      if (match) return current[match[1]]?.[parseInt(match[2])];
      return current[key];
    }, obj);
  }

  // ─── Compile System Prompt ──────────────────────────────

  compileSystemPrompt(bot: Bot, collectedData?: Record<string, string>): string {
    if (bot.systemPrompt?.trim()) return bot.systemPrompt;

    const parts: string[] = [];

    // Identity
    if (bot.persona || bot.role) {
      let identity = 'Eres';
      if (bot.persona) identity += ` ${bot.persona},`;
      if (bot.role) identity += ` un asistente de ${bot.role}`;
      identity += '.';
      parts.push(identity);
    }

    // Objective
    if (bot.objective) {
      parts.push(`Tu objetivo principal es: ${bot.objective}`);
    }

    // Tone
    if (bot.tone && bot.tone.length > 0) {
      parts.push(`Tu tono de comunicación es: ${bot.tone.join(', ')}.`);
    }

    // Language
    if (bot.language) {
      const langMap: Record<string, string> = { es: 'español', en: 'inglés', pt: 'portugués', fr: 'francés' };
      const langs = bot.language.split(',').map((l) => langMap[l.trim()] || l.trim());
      if (langs.length === 1) {
        parts.push(`Responde siempre en ${langs[0]}.`);
      } else {
        parts.push(`Puedes responder en: ${langs.join(', ')}. Responde en el idioma en que te escriban.`);
      }
    }

    // Format constraint
    parts.push('\nFORMATO DE RESPUESTA:');
    parts.push('- Responde en texto plano, sin markdown, sin tablas, sin asteriscos, sin formato especial.');
    parts.push('- Usa saltos de línea para separar ideas.');
    parts.push('- Si necesitas listar información, usa guiones simples (-).');

    // Rules
    if (bot.rules && bot.rules.length > 0) {
      parts.push('\nREGLAS:');
      bot.rules.forEach((rule) => parts.push(`- ${rule}`));
    }

    // Business context
    if (bot.businessContext?.trim()) {
      parts.push(`\nCONTEXTO DEL NEGOCIO:\n${bot.businessContext}`);
    }

    // Data collection context (what's already collected)
    if (bot.dataCollectionEnabled && collectedData && Object.keys(collectedData).length > 0) {
      const alreadyCollected = Object.entries(collectedData).map(([k, v]) => `${k}: ${v}`).join(', ');
      parts.push(`\nDatos del contacto ya recopilados: ${alreadyCollected}`);
      const missingFields = (bot.dataCollectionFields || []).filter((f) => !collectedData[f.field]);
      if (missingFields.length > 0) {
        const intensity = parseInt(bot.dataCollectionMode) || 3;
        if (intensity >= 3) {
          parts.push(`Datos que aún faltan: ${missingFields.map((f) => f.label).join(', ')}. Busca oportunidades naturales para preguntar.`);
        }
      }
    }

    return parts.join('\n');
  }

  // ─── Media Processing ───────────────────────────────────

  /**
   * Uses a vision-capable model to describe an image.
   * Sends the image URL to the model and returns a textual description.
   */
  async describeImage(imageUrl: string, tenantId: string): Promise<{ text: string; usage: { prompt_tokens: number; completion_tokens: number } | null }> {
    const apiKey = this.configService.get<string>('OPENROUTER_API_KEY');
    if (!apiKey) throw new Error('OPENROUTER_API_KEY not configured');

    // Use a vision-capable model
    const visionModel = this.configService.get<string>('VISION_MODEL') || 'openai/gpt-4o-mini';

    const requestBody = {
      model: visionModel,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Describe esta imagen de forma clara y concisa en español. Si contiene texto, transcríbelo. Si es un recibo, factura o documento, extrae la información relevante. Máximo 300 palabras.',
            },
            {
              type: 'image_url',
              image_url: { url: imageUrl },
            },
          ],
        },
      ],
      max_tokens: 500,
      temperature: 0.3,
    };

    const response = await this.callOpenRouter(apiKey, requestBody);

    return {
      text: response.content || 'No se pudo obtener una descripción de la imagen.',
      usage: response.usage ? { prompt_tokens: response.usage.prompt_tokens || 0, completion_tokens: response.usage.completion_tokens || 0 } : null,
    };
  }

  /**
   * Transcribes audio using OpenAI's Whisper API.
   * Downloads the audio file and sends it to OpenRouter for transcription.
   */
  async transcribeAudio(audioUrl: string, tenantId: string): Promise<{ text: string; usage: { prompt_tokens: number; completion_tokens: number } | null }> {
    const apiKey = this.configService.get<string>('OPENROUTER_API_KEY');
    if (!apiKey) throw new Error('OPENROUTER_API_KEY not configured');

    // Download the audio file
    const audioResponse = await fetch(audioUrl);
    if (!audioResponse.ok) {
      throw new Error(`Failed to download audio: ${audioResponse.status}`);
    }
    const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());
    const base64Audio = audioBuffer.toString('base64');

    // Determine MIME type from URL
    const urlPath = new URL(audioUrl).pathname;
    const ext = urlPath.split('.').pop() || 'ogg';
    const mimeMap: Record<string, string> = { ogg: 'audio/ogg', mp3: 'audio/mpeg', mp4: 'audio/mp4', m4a: 'audio/mp4', wav: 'audio/wav', webm: 'audio/webm' };
    const mimeType = mimeMap[ext] || 'audio/ogg';

    // Use OpenRouter chat completions with audio input (same API key, same pattern)
    const sttModel = this.configService.get<string>('STT_MODEL') || 'openai/whisper-large-v3';

    const requestBody = {
      model: sttModel,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Transcribe este audio en español. Devuelve SOLO el texto transcrito, sin comentarios adicionales.',
            },
            {
              type: 'input_audio',
              input_audio: { data: base64Audio, format: ext === 'mp3' ? 'mp3' : 'wav' },
            },
          ],
        },
      ],
      max_tokens: 1000,
      temperature: 0,
    };

    try {
      const response = await this.callOpenRouter(apiKey, requestBody);
      return {
        text: response.content?.trim() || 'No se pudo transcribir el audio.',
        usage: response.usage ? { prompt_tokens: response.usage.prompt_tokens || 0, completion_tokens: response.usage.completion_tokens || 0 } : null,
      };
    } catch (err) {
      // Fallback: try with a multimodal model that supports audio
      const fallbackModel = 'google/gemini-2.0-flash-001';
      const fallbackBody = {
        model: fallbackModel,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Transcribe este audio en español. Devuelve SOLO la transcripción textual exacta, sin comentarios ni explicaciones.',
              },
              {
                type: 'input_audio',
                input_audio: { data: base64Audio, format: ext === 'mp3' ? 'mp3' : 'wav' },
              },
            ],
          },
        ],
        max_tokens: 1000,
        temperature: 0,
      };

      const fallbackResponse = await this.callOpenRouter(apiKey, fallbackBody);
      return {
        text: fallbackResponse.content?.trim() || 'No se pudo transcribir el audio.',
        usage: fallbackResponse.usage ? { prompt_tokens: fallbackResponse.usage.prompt_tokens || 0, completion_tokens: fallbackResponse.usage.completion_tokens || 0 } : null,
      };
    }
  }
}
