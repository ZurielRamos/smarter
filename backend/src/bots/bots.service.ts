import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { Bot } from './bot.entity';
import { CreateBotDto } from './dto/create-bot.dto';
import { UpdateBotDto } from './dto/update-bot.dto';

@Injectable()
export class BotsService {
  constructor(
    @InjectRepository(Bot)
    private readonly botRepo: Repository<Bot>,
    private readonly configService: ConfigService,
  ) {}

  async findAll(tenantId: string): Promise<Bot[]> {
    return this.botRepo.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Bot> {
    const bot = await this.botRepo.findOne({ where: { id } });
    if (!bot) throw new NotFoundException('Bot no encontrado');
    return bot;
  }

  async create(dto: CreateBotDto): Promise<Bot> {
    const bot = this.botRepo.create({
      tenantId: dto.tenantId,
      name: dto.name,
      description: dto.description || null,
      status: 'draft',
    });
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

  async chat(botId: string, messages: { role: string; content: string }[], collectedData?: Record<string, string>): Promise<{ role: string; content: string; usage?: { prompt_tokens: number; completion_tokens: number; model: string; cost: number | null }; extractedData?: Record<string, string>; handedOff?: boolean }> {
    const bot = await this.findOne(botId);
    const apiKey = this.configService.get<string>('OPENROUTER_API_KEY');
    if (!apiKey) throw new NotFoundException('OPENROUTER_API_KEY no configurada');

    // Check handoff keywords in the last user message
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
    if (lastUserMsg && bot.handoffKeywords && bot.handoffKeywords.length > 0) {
      const lowerContent = lastUserMsg.content.toLowerCase();
      const triggered = bot.handoffKeywords.some((kw) => lowerContent.includes(kw.toLowerCase()));
      if (triggered) {
        const handoffMsg = bot.handoffMessage || 'Te conecto con un agente humano. Un momento por favor.';
        return { role: 'assistant', content: handoffMsg, handedOff: true };
      }
    }

    const systemPrompt = this.compileSystemPrompt(bot, collectedData);
    const systemMessages: { role: string; content: string }[] = [];
    if (systemPrompt) {
      systemMessages.push({ role: 'system', content: systemPrompt });
    }

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: bot.model || 'openai/gpt-4o-mini',
        messages: [...systemMessages, ...messages],
        temperature: Number(bot.temperature) || 0.7,
        max_tokens: bot.maxTokens || 1024,
      }),
    });

    if (!res.ok) {
      const error = await res.text();
      throw new Error(`OpenRouter error: ${error}`);
    }

    const json = await res.json();
    const choice = json.choices?.[0]?.message;
    const usage = json.usage;

    // Accumulate token usage
    if (usage) {
      bot.totalPromptTokens = (bot.totalPromptTokens || 0) + (usage.prompt_tokens || 0);
      bot.totalCompletionTokens = (bot.totalCompletionTokens || 0) + (usage.completion_tokens || 0);
      bot.totalRequests = (bot.totalRequests || 0) + 1;
      await this.botRepo.save(bot);
    }

    let content = choice?.content || 'Sin respuesta';
    let extractedData: Record<string, string> | undefined;

    // Post-process: extract DATA block if data collection is enabled
    if (bot.dataCollectionEnabled) {
      const dataMatch = content.match(/<!--DATA:(.*?)-->/s);
      if (dataMatch) {
        try {
          extractedData = JSON.parse(dataMatch[1]);
        } catch {
          // ignore parse errors
        }
        // Remove the DATA block from the response
        content = content.replace(/<!--DATA:.*?-->/s, '').trim();
      }
    }

    return {
      role: 'assistant',
      content,
      usage: usage ? {
        prompt_tokens: usage.prompt_tokens,
        completion_tokens: usage.completion_tokens,
        model: bot.model || 'openai/gpt-4o-mini',
        cost: usage.total_cost ?? null,
      } : undefined,
      extractedData,
    };
  }

  compileSystemPrompt(bot: Bot, collectedData?: Record<string, string>): string {
    // If user has manual system prompt override, use it directly
    if (bot.systemPrompt?.trim()) {
      return bot.systemPrompt;
    }

    const parts: string[] = [];

    // Identity
    if (bot.persona || bot.role) {
      let identity = 'Eres';
      if (bot.persona) identity += ` ${bot.persona},`;
      if (bot.role) identity += ` un asistente de ${bot.role}`;
      identity += '.';
      parts.push(identity);
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

    // Format constraint (messaging channels don't render markdown)
    parts.push('\nFORMATO DE RESPUESTA:');
    parts.push('- Responde en texto plano, sin markdown, sin tablas, sin asteriscos, sin formato especial.');
    parts.push('- Usa saltos de línea para separar ideas.');
    parts.push('- Si necesitas listar información, usa guiones simples (-).');

    // Rules
    if (bot.rules && bot.rules.length > 0) {
      parts.push('\nREGLAS:');
      bot.rules.forEach((rule) => {
        parts.push(`- ${rule}`);
      });
    }

    // Business context
    if (bot.businessContext?.trim()) {
      parts.push(`\nCONTEXTO DEL NEGOCIO:\n${bot.businessContext}`);
    }

    // Data collection
    if (bot.dataCollectionEnabled && bot.dataCollectionFields && bot.dataCollectionFields.length > 0) {
      const fields = bot.dataCollectionFields;
      const fieldKeys = fields.map((f) => f.field).join(', ');

      parts.push('\nEXTRACCIÓN DE DATOS:');

      const intensity = parseInt(bot.dataCollectionMode) || 3;

      if (intensity <= 1) {
        parts.push('Solo registra datos si el usuario los menciona explícitamente por iniciativa propia.');
        parts.push('NO preguntes por estos datos bajo ninguna circunstancia.');
      } else if (intensity === 2) {
        parts.push('Extrae datos solo si el usuario los menciona de forma natural. NO preguntes activamente.');
      } else if (intensity === 3) {
        parts.push('Si surge un momento natural en la conversación, puedes preguntar por alguno de estos datos.');
        parts.push('No fuerces la pregunta si no tiene sentido en el contexto.');
      } else if (intensity === 4) {
        parts.push('Busca momentos en la conversación para preguntar por los datos que faltan.');
        parts.push('Pregunta un dato a la vez, de forma conversacional y amable.');
      } else {
        parts.push('Tu objetivo PRIORITARIO es recopilar estos datos. Pregunta desde el primer mensaje.');
        parts.push('Pregunta un dato a la vez pero de forma directa y clara.');
      }

      // List fields grouped by priority
      const highPriority = fields.filter((f) => f.priority === 1);
      const medPriority = fields.filter((f) => f.priority === 2);
      const lowPriority = fields.filter((f) => f.priority === 3 || !f.priority);

      const formatField = (f: { field: string; label: string; instructions: string }) =>
        f.instructions ? `- ${f.field} (${f.label}): ${f.instructions}` : `- ${f.field} (${f.label})`;

      if (highPriority.length > 0) {
        parts.push('\nPRIORIDAD ALTA (preguntar primero):');
        highPriority.forEach((f) => parts.push(formatField(f)));
      }
      if (medPriority.length > 0) {
        parts.push('\nPRIORIDAD MEDIA:');
        medPriority.forEach((f) => parts.push(formatField(f)));
      }
      if (lowPriority.length > 0) {
        parts.push('\nPRIORIDAD BAJA (solo si hay oportunidad):');
        lowPriority.forEach((f) => parts.push(formatField(f)));
      }

      parts.push(`\nCuando obtengas uno o más datos REALES, incluye AL FINAL de tu respuesta (en una línea aparte) este bloque exacto:`);
      parts.push(`<!--DATA:{"campo":"valor_real"}-->`);
      parts.push(`Los campos válidos son: ${fieldKeys}`);
      parts.push('REGLAS ESTRICTAS PARA EL BLOQUE DATA:');
      parts.push('- SOLO incluye datos que el usuario haya ESCRITO EXPLÍCITAMENTE en su mensaje.');
      parts.push('- NUNCA inventes, supongas ni deduzcas datos.');
      parts.push('- Si el usuario NO ha proporcionado ningún dato concreto, NO incluyas el bloque DATA.');
      parts.push('- Solo incluye datos NUEVOS. No repitas datos ya recopilados.');
      parts.push('- Este bloque es invisible para el usuario.');

      // Tell the model what's already collected
      if (collectedData && Object.keys(collectedData).length > 0) {
        const alreadyCollected = Object.entries(collectedData).map(([k, v]) => `${k}: ${v}`).join(', ');
        const missingFields = fields.filter((f) => !collectedData[f.field]);
        parts.push(`\nDatos YA recopilados (NO los vuelvas a incluir en DATA): ${alreadyCollected}`);
        if (missingFields.length > 0) {
          const missingNames = missingFields.map((f) => f.label).join(', ');
          parts.push(`Datos que AÚN FALTAN por recopilar: ${missingNames}`);
        } else {
          parts.push('Ya se han recopilados todos los datos necesarios. No necesitas pedir más información.');
        }
      }
    }

    return parts.join('\n');
  }
}
