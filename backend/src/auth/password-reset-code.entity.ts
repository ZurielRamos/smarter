import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Código de 6 dígitos para restablecer la contraseña desde la app móvil.
 * Solo se guarda el hash (HMAC) del código. Un código vale 15 minutos, admite 5 intentos
 * y se consume al cambiar la contraseña o al pedir uno nuevo.
 */
@Entity('password_reset_codes')
@Index(['userId', 'createdAt'])
export class PasswordResetCode {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'code_hash', type: 'varchar', length: 64 })
  codeHash: string;

  @Column({ type: 'integer', default: 0 })
  attempts: number;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  /** Usado o reemplazado por uno nuevo. Un código consumido no sirve para nada. */
  @Column({ name: 'consumed_at', type: 'timestamptz', nullable: true })
  consumedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
