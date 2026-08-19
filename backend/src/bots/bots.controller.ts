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
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { BotsService } from './bots.service';
import { CreateBotDto } from './dto/create-bot.dto';
import { UpdateBotDto } from './dto/update-bot.dto';
import { CreateBotToolDto } from './dto/create-bot-tool.dto';
import { UpdateBotToolDto } from './dto/update-bot-tool.dto';

@Controller('bots')
export class BotsController {
  constructor(private readonly service: BotsService) {}

  @Get('models/search')
  searchModels(@Query('q') q: string) {
    return this.service.searchModels(q);
  }

  @Get()
  findAll(@Query('tenantId') tenantId: string) {
    return this.service.findAll(tenantId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateBotDto) {
    return this.service.create(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateBotDto) {
    return this.service.update(id, dto);
  }

  @Post(':id/chat')
  chat(@Param('id') id: string, @Body() body: { messages: { role: string; content: string }[]; collectedData?: Record<string, string>; mockContact?: Record<string, string> }) {
    // Merge mockContact into collectedData for testing
    const contactData = { ...(body.mockContact || {}), ...(body.collectedData || {}) };
    return this.service.chat(id, body.messages, Object.keys(contactData).length > 0 ? contactData : undefined);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  // ─── Metrics ───────────────────────────────────────────

  @Get(':id/metrics')
  getMetrics(@Param('id') id: string) {
    return this.service.getMetrics(id);
  }

  // ─── Bot Tools ─────────────────────────────────────────

  @Get(':id/tools')
  getTools(@Param('id') id: string) {
    return this.service.getTools(id);
  }

  @Get(':id/tool-logs')
  getToolLogs(@Param('id') id: string, @Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.service.getToolLogs(id, limit ? parseInt(limit) : 20, offset ? parseInt(offset) : 0);
  }

  // ─── Knowledge Base ────────────────────────────────────

  @Get(':id/knowledge')
  getKnowledge(@Param('id') id: string) {
    return this.service.getKnowledge(id);
  }

  @Post(':id/knowledge')
  addKnowledge(@Param('id') id: string, @Body() body: { title: string; content: string; type?: string }) {
    return this.service.addKnowledge(id, body);
  }

  @Post(':id/knowledge/upload')
  @UseInterceptors(FileInterceptor('file'))
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
  updateKnowledge(@Param('knowledgeId') knowledgeId: string, @Body() body: Partial<{ title: string; content: string; isEnabled: boolean }>) {
    return this.service.updateKnowledge(knowledgeId, body);
  }

  @Delete('knowledge/:knowledgeId')
  removeKnowledge(@Param('knowledgeId') knowledgeId: string) {
    return this.service.removeKnowledge(knowledgeId);
  }

  @Post(':id/tools')
  createTool(@Param('id') id: string, @Body() dto: CreateBotToolDto) {
    dto.botId = id;
    return this.service.createTool(dto);
  }

  @Put('tools/:toolId')
  updateTool(@Param('toolId') toolId: string, @Body() dto: UpdateBotToolDto) {
    return this.service.updateTool(toolId, dto);
  }

  @Post('tools/:toolId/test')
  testTool(@Param('toolId') toolId: string, @Body() body: { args?: Record<string, any>; contactData?: Record<string, string> }) {
    return this.service.testTool(toolId, body.args || {}, body.contactData || {});
  }

  @Delete('tools/:toolId')
  removeTool(@Param('toolId') toolId: string) {
    return this.service.removeTool(toolId);
  }
}
