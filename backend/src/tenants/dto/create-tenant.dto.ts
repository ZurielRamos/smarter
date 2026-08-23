export class CreateTenantDto {
  name: string;
  slug: string;

  /** Máximo de agentes permitidos (default: 5) */
  maxAgents?: number;

  /** Marca como cuenta de desarrollo */
  isDev?: boolean;

  /** Email del propietario (owner) de la cuenta. Se le enviará invitación. */
  ownerEmail?: string;

  /** Nombre del propietario (usado si es usuario nuevo) */
  ownerName?: string;

  // --- Billing plan (opcional, se crea al mismo tiempo) ---

  /** Tipo de plan: 'monthly' | 'prepaid' */
  planType?: 'monthly' | 'prepaid';

  /** Créditos mensuales (solo aplica si planType = 'monthly') */
  monthlyCredits?: number;

  /** Si los créditos no usados se acumulan al renovar */
  rollover?: boolean;
}
