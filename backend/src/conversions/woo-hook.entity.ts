import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * Defines WooCommerce hook configurations.
 * Maps WooCommerce events to actions (conversions, notifications, tags).
 */
@Entity('woo_hooks')
@Index(['tenantId'])
export class WooHook {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  /** WooCommerce event: purchase, add_to_cart, initiate_checkout, view_content, sign_up, lead */
  @Column({ type: 'varchar', length: 50 })
  event: string;

  /** Action type: conversion, notification, tag */
  @Column({ name: 'action_type', type: 'varchar', length: 30 })
  actionType: string;

  /** Whether this hook is active */
  @Column({ type: 'boolean', default: true })
  enabled: boolean;

  /** Action configuration (JSON) */
  @Column({ type: 'jsonb', default: {} })
  config: {
    conversionType?: string;
    conversionName?: string;
    conversionValue?: string;
    conversionCurrency?: string;
    inboxId?: string;
    templateName?: string;
    templateLanguage?: string;
    templateMessage?: string;
    variableMapping?: Record<string, string>;
    channel?: string;
    tagName?: string;
  };

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
