import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { MailModule } from '../mail/mail.module';
import { Inbox } from '../chats/inbox.entity';
import { WhatsAppService } from '../campaigns/whatsapp.service';
import { Tenant } from '../tenants/tenant.entity';
import { ClientRecord } from '../records/record.entity';
import { CustomField } from '../records/custom-field.entity';
import { ContactProfile } from './entities/contact-profile.entity';
import { SurveyorContract } from './entities/surveyor-contract.entity';
import { SurveyorPaymentMethod } from './entities/surveyor-payment-method.entity';
import { ContractTemplate } from './entities/contract-template.entity';
import { ContractCounter } from './entities/contract-counter.entity';
import { ContractRenderService } from './contracts/contract-render.service';
import { ContractTemplatesService } from './contract-templates.service';
import { ContractNumberingService } from './contract-numbering.service';
import { PaymentCryptoService } from './payment-crypto.service';
import { ProfilesService } from './profiles.service';
import { ContractsService } from './contracts.service';
import { PaymentMethodsService } from './payment-methods.service';
import { ReclutamientoController } from './reclutamiento.controller';
import { PortalConfigRow } from './entities/portal-config.entity';
import { PortalOtp } from './entities/portal-otp.entity';
import { PortalInvitation } from './entities/portal-invitation.entity';
import { ProfileDocument } from './entities/profile-document.entity';
import { PortalConfigService } from './portal/portal-config.service';
import { PortalMessengerService } from './portal/portal-messenger.service';
import { PortalAuthService } from './portal/portal-auth.service';
import { PortalService } from './portal/portal.service';
import { PortalInvitationsService } from './portal/portal-invitations.service';
import { PrivateFileService } from './portal/private-file.service';
import { ProfileDocumentsService } from './portal/profile-documents.service';
import { PortalSessionGuard } from './portal/portal-session.guard';
import { PortalController } from './portal/portal.controller';
import { PortalAdminController } from './portal/portal-admin.controller';

/**
 * Módulo Reclutamiento: una cuenta reclutadora gestiona sus encuestadores
 * (contactos con perfil `surveyor`), sus contratos de prestación de servicios y
 * sus datos de pago (cifrados). Requiere el feature flag `reclutamiento`.
 *
 * TenantAuditService viene del AuditModule (global).
 */
@Module({
  imports: [
    // Tenant: lo necesita ModuleFeatureGuard.
    TypeOrmModule.forFeature([
      ContactProfile,
      SurveyorContract,
      SurveyorPaymentMethod,
      ContractTemplate,
      ContractCounter,
      ClientRecord,
      CustomField,
      Inbox,
      PortalConfigRow,
      PortalOtp,
      PortalInvitation,
      ProfileDocument,
      Tenant,
    ]),
    MailModule,
    // Sin secreto por defecto: el portal firma con su propia clave derivada (ver PortalAuthService).
    JwtModule.register({}),
  ],
  controllers: [ReclutamientoController, PortalAdminController, PortalController],
  providers: [
    ProfilesService,
    ContractsService,
    PaymentMethodsService,
    PaymentCryptoService,
    ContractTemplatesService,
    ContractNumberingService,
    ContractRenderService,
    WhatsAppService,
    PortalConfigService,
    PortalMessengerService,
    PortalAuthService,
    PortalService,
    PortalInvitationsService,
    PrivateFileService,
    ProfileDocumentsService,
    PortalSessionGuard,
  ],
})
export class ReclutamientoModule {}
