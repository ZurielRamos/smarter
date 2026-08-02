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
import { diskStorage } from 'multer';
import { extname } from 'path';
import { TenantsService } from './tenants.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';

const storage = diskStorage({
  destination: './uploads/tenants',
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `${file.fieldname}-${uniqueSuffix}${extname(file.originalname)}`);
  },
});

@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

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
    FileFieldsInterceptor(
      [{ name: 'icon', maxCount: 1 }],
      { storage },
    ),
  )
  create(
    @Body() dto: CreateTenantDto,
    @UploadedFiles()
    files: { icon?: Express.Multer.File[] },
  ) {
    const iconPath = files?.icon?.[0]?.path || null;
    return this.tenantsService.create(dto, iconPath);
  }

  @Put(':id')
  @UseInterceptors(
    FileFieldsInterceptor(
      [{ name: 'icon', maxCount: 1 }],
      { storage },
    ),
  )
  update(
    @Param('id') id: string,
    @Body() dto: UpdateTenantDto,
    @UploadedFiles()
    files: { icon?: Express.Multer.File[] },
  ) {
    const iconPath = files?.icon?.[0]?.path || undefined;
    return this.tenantsService.update(id, dto, iconPath);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.tenantsService.remove(id);
  }
}
