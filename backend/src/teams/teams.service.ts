import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Team } from './team.entity';
import { TeamMember } from './team-member.entity';

@Injectable()
export class TeamsService {
  constructor(
    @InjectRepository(Team)
    private readonly teamRepo: Repository<Team>,
    @InjectRepository(TeamMember)
    private readonly memberRepo: Repository<TeamMember>,
  ) {}

  async findAll(tenantId: string): Promise<Team[]> {
    return this.teamRepo.find({ where: { tenantId }, order: { name: 'ASC' } });
  }

  async findOne(id: string): Promise<Team> {
    const team = await this.teamRepo.findOne({ where: { id } });
    if (!team) throw new NotFoundException('Equipo no encontrado');
    return team;
  }

  async create(data: { tenantId: string; name: string; description?: string }): Promise<Team> {
    const team = this.teamRepo.create(data);
    return this.teamRepo.save(team);
  }

  async update(id: string, data: { name?: string; description?: string }): Promise<Team> {
    const team = await this.findOne(id);
    if (data.name !== undefined) team.name = data.name;
    if (data.description !== undefined) team.description = data.description;
    return this.teamRepo.save(team);
  }

  async remove(id: string): Promise<void> {
    const team = await this.findOne(id);
    await this.teamRepo.remove(team);
  }

  async getMembers(teamId: string): Promise<TeamMember[]> {
    return this.memberRepo.find({
      where: { teamId },
      relations: { user: true },
      order: { createdAt: 'ASC' },
    });
  }

  async addMember(teamId: string, userId: string): Promise<TeamMember> {
    // Solo se agregan usuarios que ya pertenecen a la cuenta del equipo.
    if (typeof userId !== 'string' || !/^[0-9a-f-]{36}$/i.test(userId)) throw new BadRequestException('Usuario inválido');
    const team = await this.findOne(teamId);
    const rows = await this.memberRepo.manager.query(
      "SELECT 1 FROM user_tenants WHERE user_id = $1 AND tenant_id = $2 AND status IN ('active', 'pending')",
      [userId, team.tenantId],
    );
    if (!rows?.length) throw new BadRequestException('El usuario no pertenece a esta cuenta');
    const existing = await this.memberRepo.findOne({ where: { teamId, userId } });
    if (existing) return existing;
    const member = this.memberRepo.create({ teamId, userId });
    return this.memberRepo.save(member);
  }

  async removeMember(teamId: string, userId: string): Promise<void> {
    const member = await this.memberRepo.findOne({ where: { teamId, userId } });
    if (member) await this.memberRepo.remove(member);
  }
}
