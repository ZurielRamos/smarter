import { Language, renderPartial } from './contract-engine';

type LegalConfig = Record<string, any>;

/**
 * Modelos de partida para redactar un contrato. NO son asesoría legal.
 *
 * Los presets por país son valores sugeridos y editables. Donde un dato depende
 * de la jurisdicción exacta y no se puede afirmar con seguridad (domicilio
 * judicial, ley aplicable en EE. UU.), se deja vacío a propósito: la plantilla
 * exigirá completarlo antes de poder generar un contrato.
 *
 * Toda plantilla creada desde un preset debe ser revisada por un abogado local
 * antes de publicarse. La plantilla guarda los datos de esa revisión.
 */

export interface CountryPreset {
  code: string;
  name: Record<Language, string>;
  currency: string;
  defaultLanguage: Language;
  taxIdLabel: string;
  contractTypeLabel: Record<Language, string>;
  legalConfig: LegalConfig;
  /** Advertencias para quien arma la plantilla (en español). */
  notes: string[];
}

const BASE_LEGAL: LegalConfig = {
  relationship: { nature: 'independent', noSubordination: true, noExclusivity: true, ownMeans: true, flexibleSchedule: true },
  term: { type: 'fixed', defaultMonths: 6, autoRenew: false },
  payment: { frequency: 'monthly', termDays: 15, reviewDays: 10, onlyApproved: true, method: 'transferencia bancaria o billetera digital' },
  taxes: { invoiceRequired: true, withholdingApplies: true },
  socialSecurity: { responsibility: 'contractor', proofRequired: true },
  termination: { noticeDays: 15, forCause: true, payApprovedWork: true },
  confidentiality: { enabled: true, years: 3 },
  intellectualProperty: { dataOwner: 'company' },
  dataProtection: { consentRequired: true, geolocationConsent: true },
  signature: { required: true, allowedMethods: ['wet', 'electronic_simple', 'electronic_advanced'] },
  documentRetentionYears: 10,
  minimumAge: 18,
};

const merge = (override: LegalConfig): LegalConfig => {
  const out: LegalConfig = JSON.parse(JSON.stringify(BASE_LEGAL));
  for (const [k, v] of Object.entries(override)) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) ? { ...(out[k] ?? {}), ...v } : v;
  }
  return out;
};


export const COUNTRY_PRESETS: CountryPreset[] = [
  {
    code: 'CO',
    name: { es: 'Colombia', en: 'Colombia' },
    currency: 'COP',
    defaultLanguage: 'es',
    taxIdLabel: 'NIT / RUT',
    contractTypeLabel: { es: 'Contrato de prestación de servicios', en: 'Service agreement' },
    legalConfig: merge({
      governingLaw: 'las leyes de la República de Colombia',
      dataProtection: { lawName: 'la Ley 1581 de 2012 y sus decretos reglamentarios', authority: 'la Superintendencia de Industria y Comercio' },
      taxes: { invoiceDescription: 'factura electrónica o documento soporte equivalente, según la normativa vigente' },
      socialSecurity: { note: 'EL CONTRATISTA declara conocer que, como trabajador independiente, debe cotizar al sistema de seguridad social conforme a la ley vigente.' },
    }),
    notes: [
      'Riesgo de «contrato realidad»: si en la práctica existe subordinación (horarios impuestos, órdenes directas, exclusividad, jefe inmediato), puede reconocerse una relación laboral aunque el contrato diga lo contrario.',
      'Los contratistas independientes deben cotizar a seguridad social. Define con tu asesor cómo verificarás las planillas y el ingreso base de cotización.',
      'Confirma con tu contador el tratamiento de la retención en la fuente y la facturación (factura electrónica o documento soporte).',
      'Deja la jurisdicción o el domicilio judicial en blanco o complétalo con la ciudad que corresponda; la plantilla no lo supone.',
    ],
  },
  {
    code: 'MX',
    name: { es: 'México', en: 'Mexico' },
    currency: 'MXN',
    defaultLanguage: 'es',
    taxIdLabel: 'RFC',
    contractTypeLabel: { es: 'Contrato de prestación de servicios profesionales independientes', en: 'Independent professional services agreement' },
    legalConfig: merge({
      governingLaw: 'las leyes de los Estados Unidos Mexicanos',
      dataProtection: { lawName: 'la Ley Federal de Protección de Datos Personales en Posesión de los Particulares' },
      taxes: { invoiceDescription: 'comprobante fiscal digital por Internet (CFDI)' },
    }),
    notes: [
      'Contrato de servicios profesionales independientes: confirma con tu asesor el encuadre frente a la regulación de subcontratación y de plataformas digitales vigente.',
      'Exige CFDI y valida con tu contador las retenciones de ISR e IVA que correspondan.',
      'El aviso de privacidad es una obligación aparte de este contrato.',
    ],
  },
  {
    code: 'PE',
    name: { es: 'Perú', en: 'Peru' },
    currency: 'PEN',
    defaultLanguage: 'es',
    taxIdLabel: 'RUC',
    contractTypeLabel: { es: 'Contrato de locación de servicios', en: 'Service agreement (locación de servicios)' },
    legalConfig: merge({
      governingLaw: 'las leyes de la República del Perú',
      dataProtection: { lawName: 'la Ley N.° 29733, Ley de Protección de Datos Personales', authority: 'la Autoridad Nacional de Protección de Datos Personales' },
      taxes: { invoiceDescription: 'recibo por honorarios electrónico o comprobante de pago equivalente' },
    }),
    notes: [
      'Locación de servicios: si existe subordinación en los hechos, el contrato puede desnaturalizarse y tratarse como laboral.',
      'Valida con tu contador la emisión de recibos por honorarios y las retenciones aplicables.',
    ],
  },
  {
    code: 'CL',
    name: { es: 'Chile', en: 'Chile' },
    currency: 'CLP',
    defaultLanguage: 'es',
    taxIdLabel: 'RUT',
    contractTypeLabel: { es: 'Contrato de prestación de servicios a honorarios', en: 'Fee-based service agreement' },
    legalConfig: merge({
      governingLaw: 'las leyes de la República de Chile',
      dataProtection: { lawName: 'la normativa chilena de protección de datos personales vigente (Ley N.° 19.628 y Ley N.° 21.719, según su entrada en vigor)' },
      taxes: { invoiceDescription: 'boleta de honorarios electrónica' },
    }),
    notes: [
      'Quienes emiten boletas de honorarios tienen obligaciones de retención y cotización. Valida la normativa vigente con tu asesor.',
      'Si existe subordinación y dependencia en los hechos, puede aplicarse la normativa laboral.',
    ],
  },
  {
    code: 'AR',
    name: { es: 'Argentina', en: 'Argentina' },
    currency: 'ARS',
    defaultLanguage: 'es',
    taxIdLabel: 'CUIT / CUIL',
    contractTypeLabel: { es: 'Contrato de locación de servicios', en: 'Service agreement (locación de servicios)' },
    legalConfig: merge({
      governingLaw: 'las leyes de la República Argentina',
      dataProtection: { lawName: 'la Ley N.° 25.326 de Protección de los Datos Personales', authority: 'la Agencia de Acceso a la Información Pública' },
      taxes: { invoiceDescription: 'factura electrónica (monotributo o responsable inscripto, según corresponda)' },
      socialSecurity: { note: 'EL CONTRATISTA declara estar inscripto en el régimen impositivo y previsional que le corresponda.' },
    }),
    notes: [
      'La ley argentina presume la existencia de contrato de trabajo cuando hay prestación de servicios personales; documenta con cuidado la autonomía real del contratista.',
      'Confirma con tu contador el régimen del contratista (monotributo o responsable inscripto) y las retenciones aplicables.',
    ],
  },
  {
    code: 'EC',
    name: { es: 'Ecuador', en: 'Ecuador' },
    currency: 'USD',
    defaultLanguage: 'es',
    taxIdLabel: 'RUC',
    contractTypeLabel: { es: 'Contrato civil de prestación de servicios', en: 'Civil service agreement' },
    legalConfig: merge({
      governingLaw: 'las leyes de la República del Ecuador',
      dataProtection: { lawName: 'la Ley Orgánica de Protección de Datos Personales', authority: 'la Superintendencia de Protección de Datos Personales' },
      taxes: { invoiceDescription: 'factura o liquidación de compra, según corresponda' },
    }),
    notes: [
      'Valida con tu asesor la modalidad contractual y la obligación de afiliación a la seguridad social de quien presta servicios de manera independiente.',
      'Confirma con tu contador la facturación y las retenciones aplicables.',
    ],
  },
  {
    code: 'ES',
    name: { es: 'España', en: 'Spain' },
    currency: 'EUR',
    defaultLanguage: 'es',
    taxIdLabel: 'NIF / NIE',
    contractTypeLabel: { es: 'Contrato de servicios con trabajador autónomo', en: 'Services agreement with a self-employed worker' },
    legalConfig: merge({
      governingLaw: 'las leyes de España',
      dataProtection: { lawName: 'el Reglamento (UE) 2016/679 (RGPD) y la Ley Orgánica 3/2018 (LOPDGDD)', authority: 'la Agencia Española de Protección de Datos' },
      taxes: { invoiceDescription: 'factura' , vatApplies: true },
      socialSecurity: { note: 'EL CONTRATISTA declara estar dado de alta en el régimen de la Seguridad Social que le corresponda como trabajador autónomo.' },
    }),
    notes: [
      'Riesgo de «falso autónomo»: si hay dependencia, horario impuesto o exclusividad real, puede recalificarse la relación como laboral.',
      'Revisa el régimen del trabajador autónomo económicamente dependiente si el contratista obtiene la mayor parte de sus ingresos de una sola empresa.',
      'Valida con tu asesor el IVA y la retención de IRPF aplicables a la factura.',
    ],
  },
  {
    code: 'US',
    name: { es: 'Estados Unidos', en: 'United States' },
    currency: 'USD',
    defaultLanguage: 'en',
    taxIdLabel: 'SSN / EIN',
    contractTypeLabel: { es: 'Contrato de contratista independiente', en: 'Independent contractor agreement' },
    legalConfig: merge({
      dataProtection: { lawName: 'applicable federal and state privacy laws' },
      taxes: { invoiceDescription: 'an invoice', withholdingApplies: false },
      payment: { method: 'bank transfer or digital wallet' },
    }),
    notes: [
      'La ley aplicable y la jurisdicción se dejan en blanco: dependen del estado. Complétalas antes de generar contratos.',
      'La clasificación entre empleado y contratista independiente varía por estado y por criterio (por ejemplo, pruebas tipo «ABC»). Consulta con un abogado antes de usarla.',
      'Recoge el formulario fiscal que corresponda (por ejemplo, W-9) fuera de este contrato.',
    ],
  },
  {
    code: 'GENERIC',
    name: { es: 'Otro país (configuración en blanco)', en: 'Other country (blank setup)' },
    currency: 'USD',
    defaultLanguage: 'es',
    taxIdLabel: '',
    contractTypeLabel: { es: 'Contrato de prestación de servicios', en: 'Service agreement' },
    legalConfig: merge({}),
    notes: [
      'Preset neutro para países sin perfil propio. Completa la ley aplicable, la jurisdicción, la norma de datos personales, el documento de cobro y la seguridad social según la ley del país.',
    ],
  },
];

// ───────────────────────────── Biblioteca de cláusulas ─────────────────────────────

export interface LibraryClause {
  key: string;
  category: string;
  title: Record<Language, string>;
  body: Record<Language, string>;
}

export const CLAUSE_LIBRARY: LibraryClause[] = [
  {
    key: 'parties',
    category: 'Partes',
    title: { es: 'Partes', en: 'Parties' },
    body: {
      es: 'Entre {{company.legalName}}, identificada con {{#if company.taxIdLabel}}{{company.taxIdLabel}} {{/if}}{{company.taxId}}, con domicilio en {{company.address}}, {{company.city}}{{#if company.country}}, {{company.country}}{{/if}}{{#if company.representativeName}}, representada legalmente por {{company.representativeName}}{{#if company.representativeDocumentNumber}}, identificado(a) con {{#if company.representativeDocumentType}}{{company.representativeDocumentType}} {{/if}}{{company.representativeDocumentNumber}}{{/if}}{{/if}}, en adelante «LA EMPRESA»; y {{contractor.fullName}}, quien declara ser mayor de edad, identificado(a) con {{#if contractor.documentType}}{{contractor.documentType}} {{/if}}{{contractor.documentNumber}}, con domicilio en {{contractor.address}}, {{contractor.city}}, correo electrónico {{contractor.email}}, en adelante «EL CONTRATISTA», celebran el contrato No. {{contract.number}}, que se regirá por las siguientes cláusulas.',
      en: 'This agreement No. {{contract.number}} is entered into between {{company.legalName}}, identified with {{#if company.taxIdLabel}}{{company.taxIdLabel}} {{/if}}{{company.taxId}}, located at {{company.address}}, {{company.city}}{{#if company.country}}, {{company.country}}{{/if}}{{#if company.representativeName}}, legally represented by {{company.representativeName}}{{/if}} ("THE COMPANY"); and {{contractor.fullName}}, who declares being of legal age, identified with {{#if contractor.documentType}}{{contractor.documentType}} {{/if}}{{contractor.documentNumber}}, residing at {{contractor.address}}, {{contractor.city}}, email {{contractor.email}} ("THE CONTRACTOR"), under the following terms.',
    },
  },
  {
    key: 'object',
    category: 'Objeto',
    title: { es: 'Objeto', en: 'Purpose' },
    body: {
      es: 'EL CONTRATISTA se obliga a prestar a LA EMPRESA, de manera independiente, el servicio de levantamiento de información mediante encuestas, entrevistas, verificaciones y actividades afines de recolección de datos, en campo o por canales digitales, conforme a las asignaciones que LA EMPRESA le comunique por escrito o a través de la plataforma tecnológica que disponga{{#if custom.serviceZone}}, en la zona o cobertura: {{custom.serviceZone}}{{/if}}.{{#if custom.projectDescription}} Alcance particular: {{custom.projectDescription}}{{/if}}',
      en: 'THE CONTRACTOR agrees to provide THE COMPANY, independently, data-collection services through surveys, interviews, verifications and related activities, in the field or through digital channels, according to the assignments THE COMPANY communicates in writing or through its technology platform{{#if custom.serviceZone}}, in the following area: {{custom.serviceZone}}{{/if}}.{{#if custom.projectDescription}} Specific scope: {{custom.projectDescription}}{{/if}}',
    },
  },
  {
    key: 'nature',
    category: 'Naturaleza de la relación',
    title: { es: 'Naturaleza de la relación', en: 'Nature of the relationship' },
    body: {
      es: "{{#if legal.relationship.nature == 'independent'}}Entre las partes no existe relación laboral{{#if legal.relationship.noSubordination}}, de subordinación ni de dependencia{{/if}}. EL CONTRATISTA ejecuta el objeto de este contrato con autonomía técnica y administrativa{{#if legal.relationship.flexibleSchedule}}, definiendo libremente su horario y la forma de organizar su trabajo, sin perjuicio de los plazos de entrega y los criterios de calidad pactados{{/if}}{{#if legal.relationship.ownMeans}}, y aporta sus propios medios (dispositivo móvil, conectividad y transporte), que corren por su cuenta y riesgo{{/if}}.{{#if legal.relationship.noExclusivity}} Este contrato no genera exclusividad: EL CONTRATISTA puede prestar servicios a terceros, siempre que respete la confidencialidad y los conflictos de interés previstos en este contrato.{{/if}}{{/if}}",
      en: "{{#if legal.relationship.nature == 'independent'}}No employment relationship exists between the parties{{#if legal.relationship.noSubordination}}, nor any relationship of subordination or dependency{{/if}}. THE CONTRACTOR performs this agreement with technical and administrative autonomy{{#if legal.relationship.flexibleSchedule}}, freely setting their own schedule and organizing their own work, without prejudice to the agreed delivery deadlines and quality criteria{{/if}}{{#if legal.relationship.ownMeans}}, and provides their own means (mobile device, connectivity and transportation) at their own cost and risk{{/if}}.{{#if legal.relationship.noExclusivity}} This agreement does not create exclusivity: THE CONTRACTOR may provide services to third parties, provided the confidentiality and conflict-of-interest provisions of this agreement are respected.{{/if}}{{/if}}",
    },
  },
  {
    key: 'contractor_obligations',
    category: 'Obligaciones',
    title: { es: 'Obligaciones del contratista', en: 'Contractor obligations' },
    body: {
      es: 'EL CONTRATISTA se obliga a: (a) levantar la información de manera veraz y completa, conforme a los protocolos y cuestionarios entregados; (b) no fabricar, alterar, duplicar ni inducir las respuestas; (c) informar a cada persona encuestada la finalidad de la recolección y obtener su autorización cuando la ley o el protocolo lo exijan; (d) registrar la información únicamente mediante las herramientas autorizadas por LA EMPRESA; (e) mantener la reserva de sus credenciales de acceso, que son personales e intransferibles; (f) permitir las verificaciones de calidad razonables; (g) reportar de inmediato cualquier incidente que afecte la información o a los encuestados; (h) adoptar medidas razonables de autocuidado y abstenerse de ingresar a zonas que considere inseguras; y (i) cumplir la normativa aplicable a su actividad.',
      en: 'THE CONTRACTOR agrees to: (a) collect information truthfully and completely, following the protocols and questionnaires provided; (b) not fabricate, alter, duplicate or lead responses; (c) inform each respondent of the purpose of the collection and obtain their authorization when required by law or by the protocol; (d) record information only through the tools authorized by THE COMPANY; (e) keep their access credentials confidential, as they are personal and non-transferable; (f) allow reasonable quality verifications; (g) immediately report any incident affecting the information or respondents; (h) take reasonable safety precautions and refrain from entering areas they consider unsafe; and (i) comply with the law applicable to their activity.',
    },
  },
  {
    key: 'company_obligations',
    category: 'Obligaciones',
    title: { es: 'Obligaciones de la empresa', en: 'Company obligations' },
    body: {
      es: 'LA EMPRESA se obliga a: (a) comunicar con claridad las asignaciones, los protocolos y los criterios de calidad; (b) habilitar el acceso a las herramientas tecnológicas necesarias; (c) revisar el trabajo entregado dentro de los plazos pactados; (d) pagar oportunamente el trabajo aprobado; y (e) tratar los datos personales de EL CONTRATISTA conforme a la ley.',
      en: 'THE COMPANY agrees to: (a) clearly communicate assignments, protocols and quality criteria; (b) provide access to the necessary technology tools; (c) review delivered work within the agreed deadlines; (d) pay approved work on time; and (e) process THE CONTRACTOR\'s personal data in accordance with the law.',
    },
  },
  {
    key: 'term',
    category: 'Plazo',
    title: { es: 'Plazo', en: 'Term' },
    body: {
      es: '{{#if contract.endDate}}El contrato rige desde el {{contract.startDate|date}} hasta el {{contract.endDate|date}}.{{else}}El contrato rige desde el {{contract.startDate|date}} y tendrá vigencia indefinida, hasta que una de las partes lo termine conforme a la cláusula de terminación.{{/if}}{{#if legal.term.autoRenew}}{{#if contract.endDate}} Vencido el plazo, el contrato se prorrogará por períodos iguales, salvo que una de las partes manifieste por escrito su voluntad de no prorrogarlo{{#if legal.termination.noticeDays}} con al menos {{legal.termination.noticeDays}} días de antelación{{/if}}.{{/if}}{{/if}}',
      en: '{{#if contract.endDate}}This agreement is effective from {{contract.startDate|date}} until {{contract.endDate|date}}.{{else}}This agreement is effective from {{contract.startDate|date}} and remains in force indefinitely until either party terminates it under the termination clause.{{/if}}{{#if legal.term.autoRenew}}{{#if contract.endDate}} Upon expiry, it will renew for equal periods unless either party gives written notice of non-renewal{{#if legal.termination.noticeDays}} at least {{legal.termination.noticeDays}} days in advance{{/if}}.{{/if}}{{/if}}',
    },
  },
  {
    key: 'compensation',
    category: 'Remuneración',
    title: { es: 'Remuneración y forma de pago', en: 'Compensation and payment' },
    body: {
      es: 'Por cada respuesta o encuesta efectivamente realizada y aprobada por LA EMPRESA conforme a los criterios de calidad, LA EMPRESA pagará a EL CONTRATISTA la suma de {{contract.rate|money}} ({{contract.rate|words}} {{contract.currency}}).{{#if legal.payment.onlyApproved}} Solo se pagan las respuestas aprobadas; las respuestas rechazadas por incumplir los criterios de calidad, o que resulten duplicadas, incompletas o inconsistentes, no generan pago.{{/if}}{{#if legal.payment.reviewDays}} LA EMPRESA revisará las entregas dentro de los {{legal.payment.reviewDays}} días siguientes a su recepción.{{/if}}{{#if legal.payment.frequency}} El pago se liquidará {{legal.payment.frequency|label}}{{#if legal.payment.termDays}} y se efectuará dentro de los {{legal.payment.termDays}} días siguientes a la aprobación o a la presentación del documento de cobro, según corresponda{{/if}}{{#if legal.payment.method}}, mediante {{legal.payment.method}}{{/if}}.{{/if}} EL CONTRATISTA podrá solicitar la revisión motivada de una respuesta rechazada. La tarifa no genera remuneración adicional por tiempo, desplazamientos ni gastos, salvo pacto expreso por escrito.',
      en: 'For each response or survey actually completed and approved by THE COMPANY under the quality criteria, THE COMPANY will pay THE CONTRACTOR {{contract.rate|money}} ({{contract.rate|words}} {{contract.currency}}).{{#if legal.payment.onlyApproved}} Only approved responses are paid; responses rejected for failing the quality criteria, or found to be duplicated, incomplete or inconsistent, do not generate payment.{{/if}}{{#if legal.payment.reviewDays}} THE COMPANY will review deliveries within {{legal.payment.reviewDays}} days of receipt.{{/if}}{{#if legal.payment.frequency}} Payment will be settled {{legal.payment.frequency|label}}{{#if legal.payment.termDays}} and made within {{legal.payment.termDays}} days of approval or of the payment document being submitted, as applicable{{/if}}{{#if legal.payment.method}}, by {{legal.payment.method}}{{/if}}.{{/if}} THE CONTRACTOR may request a reasoned review of a rejected response. The rate does not give rise to additional compensation for time, travel or expenses unless expressly agreed in writing.',
    },
  },
  {
    key: 'taxes',
    category: 'Remuneración',
    title: { es: 'Impuestos y retenciones', en: 'Taxes and withholdings' },
    body: {
      es: '{{#if legal.taxes.invoiceRequired}}Para cada pago, EL CONTRATISTA presentará {{#if legal.taxes.invoiceDescription}}{{legal.taxes.invoiceDescription}}{{else}}el documento de cobro exigido por la ley aplicable{{/if}}. {{/if}}{{#if legal.taxes.withholdingApplies}}LA EMPRESA practicará las retenciones y deducciones que ordene la ley aplicable{{#if legal.taxes.withholdingRatePct}} (tarifa de referencia: {{legal.taxes.withholdingRatePct|pct}}, sujeta a la normativa vigente){{/if}}. {{/if}}{{#if legal.taxes.vatApplies}}Cuando resulte aplicable el impuesto al valor agregado, se liquidará conforme a la ley{{#if legal.taxes.vatRatePct}} (tarifa de referencia: {{legal.taxes.vatRatePct|pct}}){{/if}}. {{/if}}EL CONTRATISTA es responsable de sus propias obligaciones tributarias.{{#if legal.taxes.note}} {{legal.taxes.note}}{{/if}}',
      en: '{{#if legal.taxes.invoiceRequired}}For each payment, THE CONTRACTOR will submit {{#if legal.taxes.invoiceDescription}}{{legal.taxes.invoiceDescription}}{{else}}the payment document required by applicable law{{/if}}. {{/if}}{{#if legal.taxes.withholdingApplies}}THE COMPANY will make the withholdings and deductions required by applicable law{{#if legal.taxes.withholdingRatePct}} (reference rate: {{legal.taxes.withholdingRatePct|pct}}, subject to current regulations){{/if}}. {{/if}}{{#if legal.taxes.vatApplies}}Where value-added tax applies, it will be settled in accordance with the law{{#if legal.taxes.vatRatePct}} (reference rate: {{legal.taxes.vatRatePct|pct}}){{/if}}. {{/if}}THE CONTRACTOR is responsible for their own tax obligations.{{#if legal.taxes.note}} {{legal.taxes.note}}{{/if}}',
    },
  },
  {
    key: 'social_security',
    category: 'Seguridad social',
    title: { es: 'Seguridad social', en: 'Social security' },
    body: {
      es: "{{#if legal.socialSecurity.responsibility == 'contractor'}}EL CONTRATISTA es el único responsable de su afiliación y de los aportes a los sistemas de seguridad social que la ley aplicable le exija{{#if legal.socialSecurity.proofRequired}}, y deberá acreditar su cumplimiento a solicitud de LA EMPRESA y como condición para el pago{{/if}}.{{/if}}{{#if legal.socialSecurity.responsibility == 'company'}}LA EMPRESA asumirá las obligaciones de seguridad social que la ley aplicable le imponga respecto de EL CONTRATISTA.{{/if}}{{#if legal.socialSecurity.responsibility == 'shared'}}Las obligaciones de seguridad social se asumirán por las partes en la proporción que establezca la ley aplicable.{{/if}}{{#if legal.socialSecurity.responsibility == 'not_applicable'}}Las partes declaran que, conforme a la ley aplicable, este contrato no genera obligaciones de seguridad social a cargo de LA EMPRESA.{{/if}}{{#if legal.socialSecurity.note}} {{legal.socialSecurity.note}}{{/if}}",
      en: "{{#if legal.socialSecurity.responsibility == 'contractor'}}THE CONTRACTOR is solely responsible for their enrollment in, and contributions to, the social security systems required by applicable law{{#if legal.socialSecurity.proofRequired}}, and must provide proof of compliance upon THE COMPANY's request and as a condition of payment{{/if}}.{{/if}}{{#if legal.socialSecurity.responsibility == 'company'}}THE COMPANY will assume the social security obligations that applicable law imposes on it with respect to THE CONTRACTOR.{{/if}}{{#if legal.socialSecurity.responsibility == 'shared'}}Social security obligations will be borne by the parties in the proportion established by applicable law.{{/if}}{{#if legal.socialSecurity.responsibility == 'not_applicable'}}The parties declare that, under applicable law, this agreement does not give rise to social security obligations for THE COMPANY.{{/if}}{{#if legal.socialSecurity.note}} {{legal.socialSecurity.note}}{{/if}}",
    },
  },
  {
    key: 'quality',
    category: 'Calidad',
    title: { es: 'Verificación de calidad', en: 'Quality verification' },
    body: {
      es: 'LA EMPRESA podrá verificar la calidad y la autenticidad del trabajo mediante auditorías, contactos de verificación a los encuestados, revisión de registros y controles automáticos (por ejemplo, tiempos de respuesta, duplicados y consistencia).{{#if legal.dataProtection.geolocationConsent}} EL CONTRATISTA autoriza, de manera libre, previa, expresa e informada, el tratamiento de los datos de ubicación del dispositivo generados al registrar cada encuesta, con la exclusiva finalidad de verificar la autenticidad del trabajo de campo.{{/if}} Estas verificaciones recaen sobre el resultado entregado y no sobre la manera en que EL CONTRATISTA organiza su trabajo.',
      en: 'THE COMPANY may verify the quality and authenticity of the work through audits, verification contacts with respondents, record reviews and automated checks (for example, response times, duplicates and consistency).{{#if legal.dataProtection.geolocationConsent}} THE CONTRACTOR freely, previously, expressly and knowingly authorizes the processing of device location data generated when recording each survey, for the sole purpose of verifying the authenticity of field work.{{/if}} These verifications concern the delivered result and not the way THE CONTRACTOR organizes their work.',
    },
  },
  {
    key: 'confidentiality',
    category: 'Confidencialidad',
    title: { es: 'Confidencialidad', en: 'Confidentiality' },
    body: {
      es: '{{#if legal.confidentiality.enabled}}EL CONTRATISTA mantendrá en reserva la información a la que acceda por razón de este contrato, incluida la de los encuestados, los cuestionarios, los resultados y los datos de LA EMPRESA y de sus clientes, y no la usará para fines distintos de este contrato ni la divulgará a terceros{{#if legal.confidentiality.years}}. Esta obligación se mantiene durante la vigencia del contrato y por {{legal.confidentiality.years}} años después de su terminación{{/if}}. Al terminar el contrato, EL CONTRATISTA eliminará o devolverá la información que conserve.{{/if}}',
      en: '{{#if legal.confidentiality.enabled}}THE CONTRACTOR will keep confidential the information accessed by reason of this agreement, including respondents\' information, questionnaires, results and data of THE COMPANY and its clients, and will not use it for purposes other than this agreement or disclose it to third parties{{#if legal.confidentiality.years}}. This obligation lasts for the term of the agreement and for {{legal.confidentiality.years}} years after its termination{{/if}}. Upon termination, THE CONTRACTOR will delete or return any information they retain.{{/if}}',
    },
  },
  {
    key: 'data_protection',
    category: 'Protección de datos',
    title: { es: 'Protección de datos personales', en: 'Personal data protection' },
    body: {
      es: 'Las partes tratarán los datos personales conforme a {{#if legal.dataProtection.lawName}}{{legal.dataProtection.lawName}}{{else}}la normativa de protección de datos aplicable{{/if}}. EL CONTRATISTA solo tratará los datos de las personas encuestadas para el fin de este contrato, bajo las instrucciones de LA EMPRESA y con las medidas de seguridad que ella indique{{#if legal.dataProtection.consentRequired}}, y obtendrá y registrará la autorización o el consentimiento de cada titular cuando la ley o el protocolo lo exijan{{/if}}. EL CONTRATISTA autoriza a LA EMPRESA a tratar sus datos personales para la gestión, el pago y la verificación de este contrato{{#if legal.dataProtection.authority}}, sin perjuicio de su derecho a acudir ante {{legal.dataProtection.authority}}{{/if}}.{{#if legal.dataProtection.contactEmail}} Para ejercer sus derechos puede escribir a {{legal.dataProtection.contactEmail}}.{{/if}}',
      en: 'The parties will process personal data in accordance with {{#if legal.dataProtection.lawName}}{{legal.dataProtection.lawName}}{{else}}the applicable data protection law{{/if}}. THE CONTRACTOR will process respondents\' data only for the purpose of this agreement, under THE COMPANY\'s instructions and with the security measures it indicates{{#if legal.dataProtection.consentRequired}}, and will obtain and record each data subject\'s authorization or consent where required by law or by the protocol{{/if}}. THE CONTRACTOR authorizes THE COMPANY to process their personal data for the management, payment and verification of this agreement{{#if legal.dataProtection.authority}}, without prejudice to their right to contact {{legal.dataProtection.authority}}{{/if}}.{{#if legal.dataProtection.contactEmail}} To exercise their rights, they may write to {{legal.dataProtection.contactEmail}}.{{/if}}',
    },
  },
  {
    key: 'intellectual_property',
    category: 'Propiedad intelectual',
    title: { es: 'Titularidad de los datos y resultados', en: 'Ownership of data and results' },
    body: {
      es: "Los datos, bases de datos, respuestas, grabaciones, registros y demás resultados que EL CONTRATISTA obtenga en ejecución de este contrato pertenecen a {{#if legal.intellectualProperty.dataOwner == 'client'}}el cliente de LA EMPRESA para el cual se realiza el estudio y se entregan a LA EMPRESA para tal fin{{else}}LA EMPRESA{{/if}}. EL CONTRATISTA cede los derechos patrimoniales que pudieran corresponderle sobre dichos resultados, en la medida permitida por la ley aplicable, sin que ello genere una remuneración adicional a la pactada.",
      en: "The data, databases, responses, recordings, records and other results obtained by THE CONTRACTOR in performing this agreement belong to {{#if legal.intellectualProperty.dataOwner == 'client'}}THE COMPANY's client for whom the study is carried out and are delivered to THE COMPANY for that purpose{{else}}THE COMPANY{{/if}}. THE CONTRACTOR assigns any economic rights they may have in such results, to the extent permitted by applicable law, without additional compensation beyond what is agreed.",
    },
  },
  {
    key: 'non_compete',
    category: 'Confidencialidad',
    title: { es: 'No competencia', en: 'Non-competition' },
    body: {
      es: '{{#if legal.nonCompete.enabled}}Durante la vigencia del contrato{{#if legal.nonCompete.months}} y por {{legal.nonCompete.months}} meses después de su terminación{{/if}}, EL CONTRATISTA no prestará servicios a terceros que compitan directamente con LA EMPRESA{{#if legal.nonCompete.scope}} en {{legal.nonCompete.scope}}{{/if}}, en la medida permitida por la ley aplicable.{{/if}}',
      en: '{{#if legal.nonCompete.enabled}}During the term of this agreement{{#if legal.nonCompete.months}} and for {{legal.nonCompete.months}} months after its termination{{/if}}, THE CONTRACTOR will not provide services to third parties that compete directly with THE COMPANY{{#if legal.nonCompete.scope}} in {{legal.nonCompete.scope}}{{/if}}, to the extent permitted by applicable law.{{/if}}',
    },
  },
  {
    key: 'conduct_antifraud',
    category: 'Calidad',
    title: { es: 'Conducta y prevención del fraude', en: 'Conduct and fraud prevention' },
    body: {
      es: 'La falsificación, fabricación o alteración de respuestas, el registro de información de personas que no fueron efectivamente encuestadas, la suplantación y el uso de credenciales de terceros son faltas graves. Las respuestas afectadas no generarán pago y, de haberse pagado, LA EMPRESA podrá compensar su valor con pagos futuros, en la medida permitida por la ley aplicable{{#if legal.termination.forCause}}, y terminar el contrato conforme a la cláusula de terminación{{/if}}, sin perjuicio de las acciones legales que correspondan.',
      en: 'Falsifying, fabricating or altering responses, recording information from people who were not actually surveyed, impersonation and the use of third-party credentials are serious breaches. Affected responses will not generate payment and, if already paid, THE COMPANY may offset their value against future payments, to the extent permitted by applicable law{{#if legal.termination.forCause}}, and terminate the agreement under the termination clause{{/if}}, without prejudice to any legal action that may apply.',
    },
  },
  {
    key: 'assignment',
    category: 'Disposiciones generales',
    title: { es: 'Cesión y subcontratación', en: 'Assignment and subcontracting' },
    body: {
      es: 'EL CONTRATISTA no podrá ceder este contrato ni subcontratar su ejecución sin autorización previa y escrita de LA EMPRESA.',
      en: 'THE CONTRACTOR may not assign this agreement or subcontract its performance without THE COMPANY\'s prior written authorization.',
    },
  },
  {
    key: 'insurance',
    category: 'Responsabilidad',
    title: { es: 'Seguros', en: 'Insurance' },
    body: {
      es: '{{#if legal.insurance.required}}EL CONTRATISTA mantendrá vigente {{#if legal.insurance.description}}{{legal.insurance.description}}{{else}}el seguro exigido por la ley aplicable{{/if}} durante la ejecución del contrato.{{/if}}',
      en: '{{#if legal.insurance.required}}THE CONTRACTOR will maintain {{#if legal.insurance.description}}{{legal.insurance.description}}{{else}}the insurance required by applicable law{{/if}} in force throughout the performance of this agreement.{{/if}}',
    },
  },
  {
    key: 'liability',
    category: 'Responsabilidad',
    title: { es: 'Responsabilidad', en: 'Liability' },
    body: {
      es: 'EL CONTRATISTA responde por los daños que cause a LA EMPRESA o a terceros por dolo o culpa en la ejecución de este contrato. Lo anterior se entiende sin perjuicio de las obligaciones que la ley aplicable imponga a cada parte.',
      en: 'THE CONTRACTOR is liable for damages caused to THE COMPANY or third parties through willful misconduct or negligence in performing this agreement. This is without prejudice to the obligations that applicable law imposes on each party.',
    },
  },
  {
    key: 'termination',
    category: 'Terminación',
    title: { es: 'Terminación', en: 'Termination' },
    body: {
      es: 'Cualquiera de las partes podrá terminar este contrato{{#if legal.termination.noticeDays}} dando aviso escrito con {{legal.termination.noticeDays}} días de antelación{{/if}}.{{#if legal.termination.forCause}} LA EMPRESA podrá terminarlo de manera inmediata por incumplimiento grave de EL CONTRATISTA, en particular por falsificación o manipulación de la información, uso indebido de datos personales o de credenciales, o violación de la confidencialidad.{{/if}}{{#if legal.termination.payApprovedWork}} En todo caso, LA EMPRESA pagará el trabajo entregado y aprobado hasta la fecha de terminación.{{/if}}{{#if legal.termination.penaltyPct}} Si la terminación anticipada sin justa causa por parte de EL CONTRATISTA causa perjuicio, se aplicará una cláusula penal del {{legal.termination.penaltyPct|pct}} del valor del último período liquidado, en la medida en que la ley aplicable lo permita.{{/if}}',
      en: 'Either party may terminate this agreement{{#if legal.termination.noticeDays}} by giving {{legal.termination.noticeDays}} days\' written notice{{/if}}.{{#if legal.termination.forCause}} THE COMPANY may terminate it immediately for serious breach by THE CONTRACTOR, in particular for falsifying or manipulating information, misuse of personal data or credentials, or breach of confidentiality.{{/if}}{{#if legal.termination.payApprovedWork}} In any case, THE COMPANY will pay for work delivered and approved up to the termination date.{{/if}}{{#if legal.termination.penaltyPct}} If early termination by THE CONTRACTOR without just cause causes harm, a contractual penalty of {{legal.termination.penaltyPct|pct}} of the value of the last settled period will apply, to the extent permitted by applicable law.{{/if}}',
    },
  },
  {
    key: 'governing_law',
    category: 'Ley aplicable',
    title: { es: 'Ley aplicable y solución de controversias', en: 'Governing law and dispute resolution' },
    body: {
      es: 'Este contrato se rige por {{legal.governingLaw}}. Las controversias que surjan se resolverán {{#if legal.disputeResolution.method}}{{legal.disputeResolution.method|label}}{{else}}ante la jurisdicción ordinaria{{/if}}{{#if legal.disputeResolution.institution}}, ante {{legal.disputeResolution.institution}}{{/if}}{{#if legal.disputeResolution.seat}}, con sede en {{legal.disputeResolution.seat}}{{/if}}{{#if legal.jurisdiction}}; para los efectos judiciales, las partes se someten a {{legal.jurisdiction}}{{/if}}.',
      en: 'This agreement is governed by {{legal.governingLaw}}. Any dispute will be resolved {{#if legal.disputeResolution.method}}{{legal.disputeResolution.method|label}}{{else}}before the ordinary courts{{/if}}{{#if legal.disputeResolution.institution}}, before {{legal.disputeResolution.institution}}{{/if}}{{#if legal.disputeResolution.seat}}, seated in {{legal.disputeResolution.seat}}{{/if}}{{#if legal.jurisdiction}}; for judicial purposes, the parties submit to {{legal.jurisdiction}}{{/if}}.',
    },
  },
  {
    key: 'notices',
    category: 'Disposiciones generales',
    title: { es: 'Notificaciones', en: 'Notices' },
    body: {
      es: 'Las notificaciones se harán por escrito al domicilio indicado en este contrato, al correo electrónico {{contractor.email}} de EL CONTRATISTA{{#if company.email}} y al correo {{company.email}} de LA EMPRESA{{/if}}, o a través de la plataforma tecnológica, según corresponda. Cada parte informará por escrito cualquier cambio en sus datos de contacto.',
      en: 'Notices will be given in writing to the address stated in this agreement, to THE CONTRACTOR\'s email {{contractor.email}}{{#if company.email}} and THE COMPANY\'s email {{company.email}}{{/if}}, or through the technology platform, as applicable. Each party will notify any change in its contact details in writing.',
    },
  },
  {
    key: 'general',
    category: 'Disposiciones generales',
    title: { es: 'Disposiciones generales', en: 'General provisions' },
    body: {
      es: 'Este contrato constituye el acuerdo total entre las partes sobre su objeto y reemplaza cualquier acuerdo anterior. Cualquier modificación deberá constar por escrito y ser aceptada por ambas partes. Si alguna cláusula resultare inválida o inexigible, las demás conservarán su validez.',
      en: 'This agreement constitutes the entire agreement between the parties on its subject matter and supersedes any prior agreement. Any amendment must be in writing and accepted by both parties. If any provision is found invalid or unenforceable, the remaining provisions will remain valid.',
    },
  },
  {
    key: 'signature',
    category: 'Firma',
    title: { es: 'Firma', en: 'Signature' },
    body: {
      es: 'En constancia de aceptación, las partes firman este contrato en {{company.city}}, el {{contract.issueDate|date}}.\n\nLA EMPRESA\n\n______________________________\n{{company.legalName}}{{#if company.representativeName}}\n{{company.representativeName}}{{#if company.representativeTitle}} — {{company.representativeTitle}}{{/if}}{{/if}}\n\nEL CONTRATISTA\n\n______________________________\n{{contractor.fullName}}\n{{#if contractor.documentType}}{{contractor.documentType}} {{/if}}{{contractor.documentNumber}}{{#if legal.signature.witnessRequired}}\n\nTESTIGO\n\n______________________________\nNombre y documento{{/if}}',
      en: 'In witness whereof, the parties sign this agreement in {{company.city}}, on {{contract.issueDate|date}}.\n\nTHE COMPANY\n\n______________________________\n{{company.legalName}}{{#if company.representativeName}}\n{{company.representativeName}}{{#if company.representativeTitle}} — {{company.representativeTitle}}{{/if}}{{/if}}\n\nTHE CONTRACTOR\n\n______________________________\n{{contractor.fullName}}\n{{#if contractor.documentType}}{{contractor.documentType}} {{/if}}{{contractor.documentNumber}}{{#if legal.signature.witnessRequired}}\n\nWITNESS\n\n______________________________\nName and ID{{/if}}',
    },
  },
];

export function findPreset(code: string): CountryPreset | undefined {
  return COUNTRY_PRESETS.find((p) => p.code === code);
}

// ───────────────────────────── Texto de partida ─────────────────────────────

/** Valores legibles de las opciones que usa el filtro `label` en los modelos. */
const LABELS: Record<Language, Record<string, string>> = {
  es: {
    per_delivery: 'por cada entrega aprobada',
    weekly: 'semanalmente',
    biweekly: 'quincenalmente',
    monthly: 'mensualmente',
    courts: 'ante la jurisdicción ordinaria',
    arbitration: 'mediante arbitraje',
    mediation_then_courts: 'mediación previa y, de no resolverse, jurisdicción ordinaria',
  },
  en: {
    per_delivery: 'per approved delivery',
    weekly: 'weekly',
    biweekly: 'every two weeks',
    monthly: 'monthly',
    courts: 'before the ordinary courts',
    arbitration: 'through arbitration',
    mediation_then_courts: 'prior mediation and, failing that, the ordinary courts',
  },
};

const PLACEHOLDERS: Record<Language, Record<string, string>> = {
  es: {
    'company.legalName': '[RAZÓN SOCIAL DE LA EMPRESA]',
    'company.taxId': '[NIT / IDENTIFICACIÓN TRIBUTARIA]',
    'company.address': '[DIRECCIÓN DE LA EMPRESA]',
    'company.city': '[CIUDAD]',
  },
  en: {
    'company.legalName': '[COMPANY LEGAL NAME]',
    'company.taxId': '[COMPANY TAX ID]',
    'company.address': '[COMPANY ADDRESS]',
    'company.city': '[CITY]',
  },
};

/** Nombre de las variables del modelo antiguo → variable actual. */
const CONTACT_RENAME: Record<string, string> = {
  fullName: 'nombre_completo',
  documentType: 'tipo_documento',
  documentNumber: 'numero_documento',
  address: 'direccion',
  city: 'ciudad',
  email: 'correo',
  phone: 'telefono',
  region: 'departamento',
  birthDate: 'fecha_nacimiento',
};
const CONTRACT_RENAME: Record<string, string> = {
  number: 'numero',
  issueDate: 'fecha_emision',
  startDate: 'fecha_inicio',
  endDate: 'fecha_fin',
  rate: 'tarifa',
  currency: 'moneda',
  country: 'pais',
};
const DATOS_RENAME: Record<string, string> = {
  serviceZone: 'zona_de_trabajo',
  projectDescription: 'alcance_del_estudio',
};

function renamePath(path: string): string {
  const [root, key] = path.split('.');
  if (root === 'contractor') return `contacto.${CONTACT_RENAME[key] ?? key}`;
  if (root === 'contract') return `contrato.${CONTRACT_RENAME[key] ?? key}`;
  if (root === 'custom') return `datos.${DATOS_RENAME[key] ?? key}`;
  return path;
}

const regionName = (code: string, lang: Language): string => {
  try {
    return new Intl.DisplayNames([lang], { type: 'region' }).of(code) ?? code;
  } catch {
    return code;
  }
};

/** Claves de cláusula que van sin encabezado numerado (apertura y firma). */
const UNTITLED = new Set(['parties', 'signature']);

/**
 * Texto inicial de un contrato para un país e idioma. Las partes que dependen
 * de la jurisdicción quedan como [PLACEHOLDER] visibles para completar; los
 * datos del contacto y del contrato quedan como variables «{{…}}».
 */
export function buildStarterText(code: string, language: Language, countryCode?: string): string {
  const preset = findPreset(code);
  if (!preset) throw new Error(`Modelo desconocido: ${code}`);
  const placeholders = PLACEHOLDERS[language];
  const country = regionName(countryCode ?? preset.code, language);

  const legal: Record<string, any> = JSON.parse(JSON.stringify(preset.legalConfig));
  if (!legal.governingLaw) legal.governingLaw = language === 'es' ? '[LEY APLICABLE]' : '[GOVERNING LAW]';
  if (!legal.jurisdiction) legal.jurisdiction = language === 'es' ? '[JURISDICCIÓN / CIUDAD]' : '[JURISDICTION / CITY]';

  const ctx = {
    legal,
    company: {
      country: preset.code === 'GENERIC' && !countryCode ? '' : country,
      taxIdLabel: preset.taxIdLabel,
    },
  };

  const heading = language === 'es' ? 'CLÁUSULA' : 'CLAUSE';
  const blocks: string[] = [];
  let n = 0;
  for (const clause of CLAUSE_LIBRARY) {
    const body = renderPartial(clause.body[language], ctx, {
      language,
      labels: LABELS[language],
      resolveRoots: new Set(['legal', 'company']),
      rename: renamePath,
      placeholder: (path) => placeholders[path] ?? `[${path.split('.').pop()?.toUpperCase()}]`,
    }).trim();
    if (!body) continue;
    if (UNTITLED.has(clause.key)) {
      blocks.push(body);
    } else {
      n += 1;
      blocks.push(`${heading} ${n}. ${clause.title[language].toUpperCase()}\n${body}`);
    }
  }
  return blocks.join('\n\n');
}
