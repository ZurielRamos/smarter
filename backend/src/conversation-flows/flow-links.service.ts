import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { FlowLink } from './flow-link.entity';

export interface CreateFlowLinkInput {
  tenantId: string;
  conversationId: string;
  flowId: string;
  nodeId: string;
  buttonId: string;
  title: string;
  url: string;
}

/** Formato válido de un código (12 caracteres base64url). */
export const FLOW_LINK_CODE_RE = /^[A-Za-z0-9_-]{8,16}$/;

@Injectable()
export class FlowLinksService {
  private readonly logger = new Logger(FlowLinksService.name);

  constructor(
    @InjectRepository(FlowLink)
    private readonly repo: Repository<FlowLink>,
    private readonly config: ConfigService,
  ) {}

  /**
   * Origen público desde el que los contactos abren los enlaces cortos. Debe ser
   * https y accesible desde internet: con localhost el enlace llegaría roto al
   * teléfono del contacto, así que en ese caso no se activa el seguimiento.
   */
  get publicBase(): string | null {
    const base = (
      this.config.get<string>('PUBLIC_BASE_URL') ||
      this.config.get<string>('META_BASE_URL') ||
      ''
    )
      .trim()
      .replace(/\/+$/, '');
    if (!/^https:\/\//i.test(base)) return null;
    if (
      /\/\/(localhost|127\.|0\.0\.0\.0|\[::1\])|\.local(:|\/|$)/i.test(base)
    ) {
      return null;
    }
    return base;
  }

  trackingAvailable(): boolean {
    return this.publicBase !== null;
  }

  urlFor(code: string): string {
    return `${this.publicBase}/webhooks/l/${code}`;
  }

  async createLink(input: CreateFlowLinkInput): Promise<FlowLink> {
    // 12 caracteres base64url = 72 bits; el reintento cubre una colisión improbable.
    for (let attempt = 0; attempt < 3; attempt++) {
      const code = crypto.randomBytes(9).toString('base64url');
      try {
        return await this.repo.save(
          this.repo.create({
            ...input,
            title: input.title.slice(0, 64),
            code,
          }),
        );
      } catch (err: any) {
        if (err?.code !== '23505') throw err; // 23505 = violación de unicidad
      }
    }
    throw new Error('No se pudo generar un código de enlace único');
  }

  findByCode(code: string): Promise<FlowLink | null> {
    return this.repo.findOne({ where: { code } });
  }

  /**
   * Registra un clic. `first` es true solo para el primer clic del enlace, y es
   * atómico: si dos peticiones llegan a la vez, solo una lo recibe en true. Así
   * el flujo continúa una única vez por enlace enviado.
   */
  async registerClick(
    code: string,
  ): Promise<{ link: FlowLink; first: boolean } | null> {
    const link = await this.findByCode(code);
    if (!link) return null;

    await this.repo
      .createQueryBuilder()
      .update(FlowLink)
      .set({
        clickCount: (): string => 'click_count + 1',
        lastClickAt: () => 'now()',
      })
      .where('code = :code', { code })
      .execute();

    const firstUpdate = await this.repo
      .createQueryBuilder()
      .update(FlowLink)
      .set({ firstClickAt: () => 'now()' })
      .where('code = :code AND first_click_at IS NULL', { code })
      .execute();

    const first = (firstUpdate.affected ?? 0) > 0;
    if (first) this.logger.log(`Primer clic en enlace ${code} (${link.title})`);
    return { link, first };
  }
}
