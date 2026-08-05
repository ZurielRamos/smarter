import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { ClientRecord } from './record.entity';

@Entity('notes')
@Index(['recordId'])
@Index(['tenantId'])
export class Note {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'record_id', type: 'uuid' })
  recordId: string;

  @ManyToOne(() => ClientRecord, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'record_id' })
  record: ClientRecord;

  @Column({ type: 'text' })
  content: string; // HTML rich text content

  @Column({ name: 'author_id', type: 'uuid', nullable: true })
  authorId: string | null;

  @Column({ name: 'author_name', type: 'varchar', nullable: true })
  authorName: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
