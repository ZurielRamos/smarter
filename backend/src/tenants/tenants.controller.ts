import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { TenantsService } from './tenants.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { MediaStorageService } from '../media/media-storage.service';

@Controller('tenants')
export class TenantsController {
  constructor(
    private readonly tenantsService: TenantsService,
    private readonly mediaStorage: MediaStorageService,
  ) {}

  @Get()
  findAll() {
    return this.tenantsService.findAll();
  }

  @Get('stats')
  getStats() {
    return this.tenantsService.getStats();
  }

  @Get('check-slug/:slug')
  checkSlug(@Param('slug') slug: string) {
    return this.tenantsService.checkSlugAvailability(slug);
  }

  @Get(':id/members')
  getMembers(@Param('id') id: string) {
    return this.tenantsService.getMembers(id);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tenantsService.findOne(id);
  }

  @Post()
  @UseInterceptors(
    FileFieldsInterceptor([{ name: 'icon', maxCount: 1 }]),
  )
  async create(
    @Body() dto: CreateTenantDto,
    @UploadedFiles()
    files: { icon?: Express.Multer.File[] },
  ) {
    let iconUrl: string | null = null;
    if (files?.icon?.[0]) {
      const file = files.icon[0];
      const stored = await this.mediaStorage.uploadBuffer(
        file.buffer,
        {
          channel: 'system',
          tenantId: 'global',
          conversationId: 'tenants',
          messageId: dto.slug || Date.now().toString(),
          mimeType: file.mimetype,
          filename: file.originalname,
        },
      );
      iconUrl = stored?.url || null;
    }
    return this.tenantsService.create(dto, iconUrl);
  }

  @Put(':id')
  @UseInterceptors(
    FileFieldsInterceptor([{ name: 'icon', maxCount: 1 }]),
  )
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateTenantDto,
    @UploadedFiles()
    files: { icon?: Express.Multer.File[] },
  ) {
    let iconUrl: string | undefined;
    if (files?.icon?.[0]) {
      const file = files.icon[0];
      const stored = await this.mediaStorage.uploadBuffer(
        file.buffer,
        {
          channel: 'system',
          tenantId: id,
          conversationId: 'tenants',
          messageId: Date.now().toString(),
          mimeType: file.mimetype,
          filename: file.originalname,
        },
      );
      iconUrl = stored?.url || undefined;
    }
    return this.tenantsService.update(id, dto, iconUrl);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.tenantsService.remove(id);
  }
}
