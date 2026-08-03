import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantAccessGuard } from '../auth/tenant-access.guard';
import { CustomFieldsService } from './custom-fields.service';

@Controller('custom-fields')
@UseGuards(JwtAuthGuard, TenantAccessGuard)
export class CustomFieldsController {
  constructor(private readonly customFieldsService: CustomFieldsService) {}

  @Get(':tenantId')
  findAll(@Param('tenantId') tenantId: string) {
    return this.customFieldsService.findAllByTenant(tenantId);
  }

  @Post()
  create(
    @Body()
    body: {
      tenantId: string;
      fieldKey: string;
      fieldLabel: string;
      fieldType: string;
      options?: string[];
      isRequired?: boolean;
      isSystem?: boolean;
      sortOrder?: number;
      validations?: Record<string, any>;
    },
  ) {
    return this.customFieldsService.create(body);
  }

  @Put(':id')
  update(
    @Param('id') id: string,
    @Body()
    body: {
      fieldLabel?: string;
      fieldType?: string;
      options?: string[] | null;
      isRequired?: boolean;
      isUnique?: boolean;
      isNullable?: boolean;
      defaultValue?: string | null;
      validations?: Record<string, any> | null;
      sortOrder?: number;
    },
  ) {
    return this.customFieldsService.update(id, body);
  }

  @Post(':id/generate')
  generateValues(@Param('id') id: string) {
    return this.customFieldsService.generateValues(id);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.customFieldsService.remove(id);
  }
}
