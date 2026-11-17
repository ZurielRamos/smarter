import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Query,
  Body,
  UseInterceptors,
  UploadedFile,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantAccessGuard } from '../auth/tenant-access.guard';
import { AuthOnly, TenantResource, TenantResourceGuard } from '../auth/tenant-resource.guard';
import { BotsService } from './bots.service';
import { SequentialFlowEngine } from './sequential-flow.engine';
import { CreateBotDto } from './dto/create-bot.dto';
import { UpdateBotDto } from './dto/update-bot.dto';
import { CreateBotToolDto } from './dto/create-bot-tool.dto';
import { UpdateBotToolDto } from './dto/update-bot-tool.dto';

@Controller('bots')
@UseGuards(JwtAuthGuard, TenantAccessGuard, TenantResourceGuard)
export class BotsController {
  constructor(
    private readonly service: BotsService,
    private readonly sequentialFlowEngine: SequentialFlowEngine,
  ) {}

  @Get('models/search')
  @AuthOnly()
  searchModels(@Query('q') q: string) {
    return this.service.searchModels(q);
  }

  @Get()
  findAll(@Query('tenantId') tenantId: string) {
    return this.service.findAll(tenantId);
  }

  @Get(':id')
  @TenantResource('bot')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateBotDto) {
    return this.service.create(dto);
  }

  @Put(':id')
  @TenantResource('bot')
  update(@Param('id') id: string, @Body() dto: UpdateBotDto) {
    return this.service.update(id, dto);
  }

  @Post(':id/chat')
  @TenantResource('bot')
  chat(@Param('id') id: string, @Body() body: { messages: { role: string; content: string }[]; collectedData?: Record<string, string>; mockContact?: Record<string, string> }) {
    // Merge mockContact into collectedData for testing
    const contactData = { ...(body.mockContact || {}), ...(body.collectedData || {}) };
    return this.service.chat(id, body.messages, Object.keys(contactData).length > 0 ? contactData : undefined);
  }

  @Delete(':id')
  @TenantResource('bot')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  // ─── Metrics ───────────────────────────────────────────

  @Get(':id/metrics')
  @TenantResource('bot')
  getMetrics(@Param('id') id: string) {
    return this.service.getMetrics(id);
  }

  // ─── Bot Tools ─────────────────────────────────────────

  @Get(':id/tools')
  @TenantResource('bot')
  getTools(@Param('id') id: string) {
    return this.service.getTools(id);
  }

  @Get(':id/tool-logs')
  @TenantResource('bot')
  getToolLogs(@Param('id') id: string, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.service.getToolLogs(id, limit ? parseInt(limit) : 20, offset ? parseInt(offset) : 0);
  }

  // ─── Knowledge Base ────────────────────────────────────

  @Get(':id/knowledge')
  @TenantResource('bot')
  getKnowledge(@Param('id') id: string) {
    return this.service.getKnowledge(id);
  }

  @Post(':id/knowledge')
  @TenantResource('bot')
  addKnowledge(@Param('id') id: string, @Body() body: { title: string; content: string; type?: string }) {
    return this.service.addKnowledge(id, body);
  }

  @Post(':id/knowledge/upload')
  @TenantResource('bot')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024, files: 1 } }))
  async uploadKnowledge(@Param('id') id: string, @UploadedFile() file: Express.Multer.File) {
    const title = file.originalname.replace(/\.[^/.]+$/, '');
    let content: string;

    if (file.mimetype === 'application/pdf') {
      // Extract text from PDF
      const pdfParse = require('pdf-parse');
      const result = await pdfParse(file.buffer);
      content = result.text;
    } else {
      // Plain text, CSV, etc.
      content = file.buffer.toString('utf-8');
    }

    return this.service.addKnowledge(id, { title, content, type: 'file' });
  }

  @Put('knowledge/:knowledgeId')
  @TenantResource('botKnowledge', 'knowledgeId')
  updateKnowledge(@Param('knowledgeId') knowledgeId: string, @Body() body: Partial<{ title: string; content: string; isEnabled: boolean }>) {
    return this.service.updateKnowledge(knowledgeId, body);
  }

  @Delete('knowledge/:knowledgeId')
  @TenantResource('botKnowledge', 'knowledgeId')
  removeKnowledge(@Param('knowledgeId') knowledgeId: string) {
    return this.service.removeKnowledge(knowledgeId);
  }

  @Post(':id/tools')
  @TenantResource('bot')
  createTool(@Param('id') id: string, @Body() dto: CreateBotToolDto) {
    dto.botId = id;
    return this.service.createTool(dto);
  }

  @Put('tools/:toolId')
  @TenantResource('botTool', 'toolId')
  updateTool(@Param('toolId') toolId: string, @Body() dto: UpdateBotToolDto) {
    return this.service.updateTool(toolId, dto);
  }

  @Post('tools/:toolId/test')
  @TenantResource('botTool', 'toolId')
  testTool(@Param('toolId') toolId: string, @Body() body: { args?: Record<string, any>; contactData?: Record<string, string> }) {
    return this.service.testTool(toolId, body.args || {}, body.contactData || {});
  }

  @Delete('tools/:toolId')
  @TenantResource('botTool', 'toolId')
  removeTool(@Param('toolId') toolId: string) {
    return this.service.removeTool(toolId);
  }

  // ─── Sequential Flow ───────────────────────────────────

  @Get(':id/flow/progress/:conversationId')
  @TenantResource('bot')
  async getFlowProgress(@Param('id') id: string, @Param('conversationId') conversationId: string) {
    const bot = await this.service.findOne(id);
    await this.service.assertConversationInTenant(conversationId, bot.tenantId);
    const conversation = await this.service.getConversation(conversationId);
    return this.sequentialFlowEngine.getFlowProgress(bot, conversation);
  }

  @Post(':id/flow/reset/:conversationId')
  @TenantResource('bot')
  async resetFlowState(@Param('id') id: string, @Param('conversationId') conversationId: string) {
    const bot = await this.service.findOne(id);
    await this.service.assertConversationInTenant(conversationId, bot.tenantId);
    await this.sequentialFlowEngine.resetFlowState(conversationId);
    return { success: true, message: 'Flow state reset successfully' };
  }

  @Post(':id/flow/test')
  @TenantResource('bot')
  async testFlow(@Param('id') id: string, @Body() body: { message: string; conversationId?: string }) {
    const bot = await this.service.findOne(id);
    // For testing, we create a mock conversation state or use an existing one
    if (body.conversationId) await this.service.assertConversationInTenant(body.conversationId, bot.tenantId);
    const conversation = body.conversationId
      ? await this.service.getConversation(body.conversationId)
      : { id: 'test', botFlowState: null } as any;

    if (!conversation.botFlowState) {
      return this.sequentialFlowEngine.startFlow(bot, conversation);
    }
    return this.sequentialFlowEngine.processMessage(bot, conversation, body.message);
  }
}
