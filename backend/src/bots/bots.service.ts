import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { Bot } from './bot.entity';
import { BotTool } from './bot-tool.entity';
import { CreateBotDto } from './dto/create-bot.dto';
import { UpdateBotDto } from './dto/update-bot.dto';
import { CreateBotToolDto } from './dto/create-bot-tool.dto';
import { UpdateBotToolDto } from './dto/update-bot-tool.dto';
import { BillingService } from '../billing/billing.service';

export interface ChatResponse {
  role: string;
  content: string;
  usage?: { prompt_tokens: number; completion_tokens: number; model: string; cost: number | null };
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
    const bot = this.botRepo.create({ tenantId: dto.tenantId, name: dto.name, description: dto.description || null, status: 'draft' });
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

  // ─── CRUD BotTool ───────────────────────────────────────

  async getTools(botId: string): Promise<BotTool[]> {
    return this.botToolRepo.find({ where: { botId }, order: { sortOrder: 'ASC', createdAt: 'ASC' } });
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

      // Execute each tool call
      for (const toolCall of response.tool_calls) {
        const fnName = toolCall.function.name;
        let args: Record<string, any> = {};
        try { args = JSON.parse(toolCall.function.arguments); } catch {}

        const result = await this.executeTool(bot, fnName, args, collectedData);
        toolsExecuted.push({ name: fnName, result });
        console.log(`[Bot Tool] ${fnName} args:`, JSON.stringify(args), 'result:', result.substring(0, 200));

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

    return {
      role: 'assistant',
      content,
      usage: {
        prompt_tokens: totalPromptTokens,
        completion_tokens: totalCompletionTokens,
        model: resolvedModel,
        cost: totalCost,
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
    // System tools return confirmation
    if (toolName === 'save_contact_data') {
      return JSON.stringify({ success: true, saved: args });
    }
    if (toolName === 'handoff_to_human') {
      return JSON.stringify({ success: true, message: 'Conversación transferida a un agente humano.' });
    }
    if (toolName === 'mark_resolved') {
      return JSON.stringify({ success: true, message: 'Conversación marcada como resuelta.' });
    }

    // Custom tools
    const tool = await this.botToolRepo.findOne({ where: { botId: bot.id, name: toolName, isEnabled: true } });
    if (!tool) return JSON.stringify({ error: 'Tool not found' });

    if (tool.executionType === 'static') {
      return tool.staticResponse || JSON.stringify({ result: 'No response configured' });
    }

    if (tool.executionType === 'webhook') {
      return this.executeWebhook(tool, args, contactData);
    }

    return JSON.stringify({ error: 'Unknown execution type' });
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
}
