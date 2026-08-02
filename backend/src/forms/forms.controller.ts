import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { FormsService } from './forms.service';
import { FormField, FormStyle } from './form.entity';

@Controller('forms')
export class FormsController {
  constructor(private readonly service: FormsService) {}

  @Get()
  findAll(@Query('tenantId') tenantId: string) {
    return this.service.findAll(tenantId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  // Public endpoint for rendering forms
  @Get('public/:slug')
  findBySlug(@Param('slug') slug: string) {
    return this.service.findBySlug(slug);
  }

  @Post()
  create(@Body() body: {
    tenantId: string;
    inboxId?: string;
    name: string;
    description?: string;
    fields?: FormField[];
    style?: FormStyle;
  }) {
    return this.service.create(body);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: Partial<{
    name: string;
    description: string;
    fields: FormField[];
    style: FormStyle;
    status: string;
    inboxId: string;
    slug: string;
  }>) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.service.delete(id);
  }

  @Post(':id/submit')
  submit(@Param('id') id: string, @Body() body: { values: Record<string, string> }) {
    return this.service.handleSubmission(id, body.values);
  }
}
