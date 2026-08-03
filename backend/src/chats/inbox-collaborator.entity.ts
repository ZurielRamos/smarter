import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
  Index,
} from 'typeorm';
import { Inbox } from './inbox.entity';
import { User } from '../users/user.entity';
import { Team } from '../teams/team.entity';

/**
 * Links agents and teams to inboxes.
 * type = 'user' for individual agents, 'team' for teams.
 */
@Entity('inbox_collaborators')
@Unique(['inboxId', 'type', 'referenceId'])
@Index(['inboxId'])
export class InboxCollaborator {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'inbox_id', type: 'uuid' })
  inboxId: string;

  /** 'user' | 'team' */
  @Column({ type: 'varchar', length: 10 })
  type: string;

  /** userId or teamId depending on type */
  @Column({ name: 'reference_id', type: 'uuid' })
  referenceId: string;

  @ManyToOne(() => Inbox, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'inbox_id' })
  inbox: Inbox;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
