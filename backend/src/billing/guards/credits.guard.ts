import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { BillingService } from '../billing.service';

export const CREDITS_COST_KEY = 'credits_cost';

/**
 * Decorador para marcar endpoints que requieren créditos.
 * @param action - Acción de credit_costs (ej: 'whatsapp_message')
 */
export const RequiresCredits = (action: string) =>
  SetMetadata(CREDITS_COST_KEY, action);

@Injectable()
export class CreditsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly billingService: BillingService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const action = this.reflector.getAllAndOverride<string>(CREDITS_COST_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!action) {
      return true; // No se requieren créditos
    }

    const request = context.switchToHttp().getRequest();
    const tenantId = request.params?.tenantId || request.body?.tenantId;

    if (!tenantId) {
      throw new ForbiddenException('No se pudo determinar la cuenta');
    }

    const cost = await this.billingService.getActionCost(action);
    if (cost === null) {
      return true; // Acción sin costo configurado, permitir
    }

    const hasEnough = await this.billingService.hasCredits(tenantId, cost);
    if (!hasEnough) {
      throw new ForbiddenException(
        `Créditos insuficientes para la acción "${action}". Se requieren ${cost} créditos.`,
      );
    }

    return true;
  }
}
