import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Query,
  Body,
} from '@nestjs/common';
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
  chat(@Param('id') id: string, @Body() body: { messages: { role: string; content: string }[]; collectedData?: Record<string, string> }) {
    return this.service.chat(id, body.messages, body.collectedData);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  // ─── Bot Tools ─────────────────────────────────────────

  @Get(':id/tools')
  getTools(@Param('id') id: string) {
    return this.service.getTools(id);
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

  @Delete('tools/:toolId')
  removeTool(@Param('toolId') toolId: string) {
    return this.service.removeTool(toolId);
  }
}
