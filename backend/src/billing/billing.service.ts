import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  CreditPlan,
  CreditBalance,
  CreditTransaction,
  CreditCost,
  PlanType,
  TransactionType,
} from './entities';
import { CreatePlanDto, RechargeDto, ConsumeCreditsDto } from './dto';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    @InjectRepository(CreditPlan)
    private readonly planRepo: Repository<CreditPlan>,
    @InjectRepository(CreditBalance)
    private readonly balanceRepo: Repository<CreditBalance>,
    @InjectRepository(CreditTransaction)
    private readonly transactionRepo: Repository<CreditTransaction>,
    @InjectRepository(CreditCost)
    private readonly costRepo: Repository<CreditCost>,
    private readonly dataSource: DataSource,
  ) {}

  // ─── PLANES ──────────────────────────────────────────

  async createPlan(tenantId: string, dto: CreatePlanDto): Promise<CreditPlan> {
    const existing = await this.planRepo.findOne({ where: { tenantId } });
    if (existing) {
      // Update existing plan instead of rejecting
      existing.type = dto.type;
      existing.monthlyCredits = dto.monthlyCredits ?? existing.monthlyCredits;
      existing.rollover = dto.rollover ?? existing.rollover;
      existing.lowBalanceThreshold = dto.lowBalanceThreshold ?? existing.lowBalanceThreshold;
      return this.planRepo.save(existing);
    }

    const plan = this.planRepo.create({
      tenantId,
      type: dto.type,
      monthlyCredits: dto.monthlyCredits ?? 0,
      rollover: dto.rollover ?? false,
      lowBalanceThreshold: dto.lowBalanceThreshold ?? 100,
    });

    const savedPlan = await this.planRepo.save(plan);

    // Crear balance inicial
    const balance = this.balanceRepo.create({ tenantId, available: 0, reserved: 0 });
    await this.balanceRepo.save(balance);

    // Si es mensual, otorgar créditos iniciales
    if (dto.type === PlanType.MONTHLY && plan.monthlyCredits > 0) {
      await this.grantMonthlyCredits(tenantId, plan.monthlyCredits);
    }

    return savedPlan;
  }

  async updatePlan(tenantId: string, dto: Partial<CreatePlanDto>): Promise<CreditPlan> {
    const plan = await this.planRepo.findOne({ where: { tenantId } });
    if (!plan) {
      throw new NotFoundException('No se encontró un plan para esta cuenta');
    }

    Object.assign(plan, dto);
    return this.planRepo.save(plan);
  }

  async getPlan(tenantId: string): Promise<CreditPlan | null> {
    return this.planRepo.findOne({ where: { tenantId } });
  }

  // ─── BALANCE ─────────────────────────────────────────

  async getBalance(tenantId: string): Promise<CreditBalance> {
    let balance = await this.balanceRepo.findOne({ where: { tenantId } });
    if (!balance) {
      balance = this.balanceRepo.create({ tenantId, available: 0, reserved: 0 });
      balance = await this.balanceRepo.save(balance);
    }
    return balance;
  }

  // ─── RECARGA (PREPAGO) ──────────────────────────────

  async recharge(tenantId: string, dto: RechargeDto, performedBy?: string): Promise<CreditBalance> {
    return this.dataSource.transaction(async (manager) => {
      let balance = await manager.findOne(CreditBalance, {
        where: { tenantId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!balance) {
        balance = manager.create(CreditBalance, { tenantId, available: 0, reserved: 0 });
        balance = await manager.save(balance);
      }

      balance.available += dto.amount;
      await manager.save(balance);

      const transaction = manager.create(CreditTransaction, {
        tenantId,
        type: TransactionType.PURCHASE,
        amount: dto.amount,
        balanceAfter: balance.available,
        source: 'recharge',
        referenceId: dto.paymentRef ?? null,
        description: dto.description ?? `Recarga de ${dto.amount} créditos`,
        performedBy: performedBy ?? null,
      });
      await manager.save(transaction);

      return balance;
    });
  }

  // ─── CONSUMO ─────────────────────────────────────────

  /**
   * Consume créditos de una cuenta. Usa lock pesimista para evitar race conditions.
   * Retorna la transacción registrada.
   */
  async consume(tenantId: string, dto: ConsumeCreditsDto, performedBy?: string): Promise<CreditTransaction> {
    return this.dataSource.transaction(async (manager) => {
      const balance = await manager.findOne(CreditBalance, {
        where: { tenantId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!balance) {
        throw new NotFoundException('No se encontró balance para esta cuenta');
      }

      if (balance.available < dto.amount) {
        throw new BadRequestException(
          `Créditos insuficientes. Disponible: ${balance.available}, requerido: ${dto.amount}`,
        );
      }

      balance.available -= dto.amount;
      await manager.save(balance);

      const transaction = manager.create(CreditTransaction, {
        tenantId,
        type: TransactionType.CONSUME,
        amount: -dto.amount,
        balanceAfter: balance.available,
        source: dto.source,
        referenceId: dto.referenceId ?? null,
        description: dto.description ?? null,
        performedBy: performedBy ?? null,
      });
      await manager.save(transaction);

      return transaction;
    });
  }

  /**
   * Verifica si una cuenta tiene suficientes créditos para una acción.
   */
  async hasCredits(tenantId: string, amount: number): Promise<boolean> {
    const balance = await this.balanceRepo.findOne({ where: { tenantId } });
    if (!balance) return false;
    return balance.available >= amount;
  }

  /**
   * Obtiene el costo de una acción. Retorna null si no está configurada.
   */
  async getActionCost(action: string): Promise<number | null> {
    const cost = await this.costRepo.findOne({ where: { action, isActive: true } });
    return cost ? cost.cost : null;
  }

  /**
   * Consume créditos basándose en la acción configurada.
   * Consulta el costo automáticamente desde credit_costs.
   */
  async consumeByAction(
    tenantId: string,
    action: string,
    referenceId?: string,
    performedBy?: string,
  ): Promise<CreditTransaction> {
    const cost = await this.getActionCost(action);
    if (cost === null) {
      throw new BadRequestException(`Acción "${action}" no tiene un costo configurado`);
    }

    return this.consume(tenantId, {
      amount: cost,
      source: action,
      referenceId,
    }, performedBy);
  }

  // ─── RESERVA (para campañas en proceso) ─────────────

  /**
   * Reserva créditos para una campaña en proceso.
   * Mueve créditos de available a reserved.
   */
  async reserve(tenantId: string, amount: number, referenceId?: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const balance = await manager.findOne(CreditBalance, {
        where: { tenantId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!balance) {
        throw new NotFoundException('No se encontró balance para esta cuenta');
      }

      if (balance.available < amount) {
        throw new BadRequestException(
          `Créditos insuficientes para reservar. Disponible: ${balance.available}, requerido: ${amount}`,
        );
      }

      balance.available -= amount;
      balance.reserved += amount;
      await manager.save(balance);

      const transaction = manager.create(CreditTransaction, {
        tenantId,
        type: TransactionType.CONSUME,
        amount: 0, // No consume aún, solo reserva
        balanceAfter: balance.available,
        source: 'campaign_reserve',
        referenceId: referenceId ?? null,
        description: `Reserva de ${amount} créditos para campaña`,
      });
      await manager.save(transaction);
    });
  }

  /**
   * Liquida una reserva: cobra los créditos usados y libera el resto.
   * @param reservedAmount - Total que se reservó inicialmente
   * @param usedAmount - Total efectivamente consumido
   */
  async settleReservation(
    tenantId: string,
    reservedAmount: number,
    usedAmount: number,
    source: string,
    referenceId?: string,
    description?: string,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const balance = await manager.findOne(CreditBalance, {
        where: { tenantId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!balance) {
        throw new NotFoundException('No se encontró balance para esta cuenta');
      }

      // Liberar toda la reserva
      const actualReserved = Math.min(reservedAmount, balance.reserved);
      balance.reserved -= actualReserved;

      // Devolver la diferencia (no usados) a available
      const released = actualReserved - usedAmount;
      if (released > 0) {
        balance.available += released;
      }

      await manager.save(balance);

      // Registrar la transacción de consumo real
      if (usedAmount > 0) {
        const transaction = manager.create(CreditTransaction, {
          tenantId,
          type: TransactionType.CONSUME,
          amount: -usedAmount,
          balanceAfter: balance.available,
          source,
          referenceId: referenceId ?? null,
          description: description ?? `Consumo de ${usedAmount} créditos`,
        });
        await manager.save(transaction);
      }
    });
  }

  // ─── REEMBOLSO ──────────────────────────────────────

  async refund(
    tenantId: string,
    amount: number,
    source: string,
    referenceId?: string,
  ): Promise<CreditBalance> {
    return this.dataSource.transaction(async (manager) => {
      const balance = await manager.findOne(CreditBalance, {
        where: { tenantId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!balance) {
        throw new NotFoundException('No se encontró balance para esta cuenta');
      }

      balance.available += amount;
      await manager.save(balance);

      const transaction = manager.create(CreditTransaction, {
        tenantId,
        type: TransactionType.REFUND,
        amount,
        balanceAfter: balance.available,
        source,
        referenceId: referenceId ?? null,
        description: `Reembolso de ${amount} créditos`,
      });
      await manager.save(transaction);

      return balance;
    });
  }

  // ─── HISTORIAL ──────────────────────────────────────

  async getTransactions(
    tenantId: string,
    options?: { limit?: number; offset?: number },
  ): Promise<{ data: CreditTransaction[]; total: number }> {
    const [data, total] = await this.transactionRepo.findAndCount({
      where: { tenantId },
      order: { createdAt: 'DESC' },
      take: options?.limit ?? 50,
      skip: options?.offset ?? 0,
    });
    return { data, total };
  }

  async getAllTransactions(
    options?: { limit?: number; offset?: number },
  ): Promise<{ data: CreditTransaction[]; total: number }> {
    const [data, total] = await this.transactionRepo.findAndCount({
      order: { createdAt: 'DESC' },
      relations: { tenant: true },
      take: options?.limit ?? 50,
      skip: options?.offset ?? 0,
    });
    return { data, total };
  }

  // ─── COSTOS ─────────────────────────────────────────

  async getAllCosts(): Promise<CreditCost[]> {
    return this.costRepo.find({ order: { action: 'ASC' } });
  }

  async upsertCost(action: string, label: string, cost: number): Promise<CreditCost> {
    let existing = await this.costRepo.findOne({ where: { action } });
    if (existing) {
      existing.label = label;
      existing.cost = cost;
      return this.costRepo.save(existing);
    }
    const entity = this.costRepo.create({ action, label, cost });
    return this.costRepo.save(entity);
  }

  // ─── RENOVACIÓN MENSUAL (CRON) ─────────────────────

  /**
   * Se ejecuta el primer día de cada mes a las 00:00.
   * Renueva los créditos de todas las cuentas con plan mensual.
   */
  @Cron('0 0 1 * *', { name: 'monthly-credit-renewal' })
  async handleMonthlyRenewal(): Promise<void> {
    this.logger.log('Iniciando renovación mensual de créditos...');

    const plans = await this.planRepo.find({
      where: { type: PlanType.MONTHLY, isActive: true },
    });

    let renewed = 0;
    let errors = 0;

    for (const plan of plans) {
      try {
        await this.renewMonthlyCredits(plan);
        renewed++;
      } catch (err) {
        errors++;
        this.logger.error(
          `Error renovando créditos para tenant ${plan.tenantId}: ${err.message}`,
        );
      }
    }

    this.logger.log(
      `Renovación mensual completada. Renovados: ${renewed}, Errores: ${errors}`,
    );
  }

  private async renewMonthlyCredits(plan: CreditPlan): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const balance = await manager.findOne(CreditBalance, {
        where: { tenantId: plan.tenantId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!balance) return;

      // Si no hay rollover, expirar créditos restantes
      if (!plan.rollover && balance.available > 0) {
        const expired = manager.create(CreditTransaction, {
          tenantId: plan.tenantId,
          type: TransactionType.EXPIRE,
          amount: -balance.available,
          balanceAfter: 0,
          source: 'monthly_renewal',
          description: `Expiración de ${balance.available} créditos no usados`,
        });
        await manager.save(expired);
        balance.available = 0;
      }

      // Otorgar créditos del mes
      balance.available += plan.monthlyCredits;
      balance.lastRenewalAt = new Date();
      await manager.save(balance);

      const grant = manager.create(CreditTransaction, {
        tenantId: plan.tenantId,
        type: TransactionType.GRANT,
        amount: plan.monthlyCredits,
        balanceAfter: balance.available,
        source: 'monthly_renewal',
        description: `Renovación mensual: +${plan.monthlyCredits} créditos`,
      });
      await manager.save(grant);
    });
  }

  private async grantMonthlyCredits(tenantId: string, amount: number): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const balance = await manager.findOne(CreditBalance, {
        where: { tenantId },
        lock: { mode: 'pessimistic_write' },
      });

      if (!balance) return;

      balance.available += amount;
      balance.lastRenewalAt = new Date();
      await manager.save(balance);

      const transaction = manager.create(CreditTransaction, {
        tenantId,
        type: TransactionType.GRANT,
        amount,
        balanceAfter: balance.available,
        source: 'initial_grant',
        description: `Créditos iniciales del plan mensual: +${amount}`,
      });
      await manager.save(transaction);
    });
  }
}
