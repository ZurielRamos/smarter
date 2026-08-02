import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ChannelConfig } from './channel-config.entity';

@Injectable()
export class ChannelConfigsService {
  constructor(
    @InjectRepository(ChannelConfig)
    private readonly repo: Repository<ChannelConfig>,
  ) {}

  async findAll(tenantId: string): Promise<ChannelConfig[]> {
    return this.repo.find({
      where: { tenantId },
      order: { channel: 'ASC' },
    });
  }

  async findOne(id: string): Promise<ChannelConfig> {
    const config = await this.repo.findOne({ where: { id } });
    if (!config) throw new NotFoundException(`Config ${id} not found`);
    return config;
  }

  async upsert(data: {
    tenantId: string;
    channel: string;
    provider: string;
    credentials: Record<string, string>;
  }): Promise<ChannelConfig> {
    // If already exists for this tenant+channel, update it
    const existing = await this.repo.findOne({
      where: { tenantId: data.tenantId, channel: data.channel },
    });

    if (existing) {
      existing.provider = data.provider;
      existing.credentials = data.credentials;
      existing.isActive = true;
      return this.repo.save(existing);
    }

    const config = this.repo.create(data);
    return this.repo.save(config);
  }

  async update(
    id: string,
    data: Partial<{
      provider: string;
      credentials: Record<string, string>;
      isActive: boolean;
    }>,
  ): Promise<ChannelConfig> {
    const config = await this.findOne(id);
    Object.assign(config, data);
    return this.repo.save(config);
  }

  async remove(id: string): Promise<{ deleted: boolean }> {
    const config = await this.findOne(id);
    await this.repo.remove(config);
    return { deleted: true };
  }
}
