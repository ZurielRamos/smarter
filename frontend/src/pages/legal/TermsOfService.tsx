import { LegalLayout } from "./LegalLayout";

export function TermsOfService() {
  return (
    <LegalLayout>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 md:p-12">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Condiciones del Servicio</h1>
          <p className="text-sm text-gray-500 mt-1">Última actualización: 2 de agosto de 2026</p>
        </div>

        <div className="space-y-8 text-[15px] leading-relaxed text-gray-600">
          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">1. Aceptación de los términos</h2>
            <p>
              Al acceder, registrarse o utilizar la plataforma Smarter (en adelante, "el Servicio"), usted acepta cumplir con estas Condiciones del Servicio. Si no está de acuerdo con alguna de estas condiciones, no deberá utilizar el Servicio. Estas condiciones constituyen un acuerdo legal vinculante entre usted y Strategee.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">2. Descripción del Servicio</h2>
            <p className="mb-3">Smarter es una plataforma de comunicaciones empresariales que proporciona:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Gestión centralizada de conversaciones multicanal (WhatsApp Business, Facebook Messenger, Instagram Direct, SMS, Email)</li>
              <li>Creación y gestión de campañas de comunicación masiva</li>
              <li>Gestión de contactos, segmentación de audiencias y listas dinámicas</li>
              <li>Integración con plataformas de Meta (Facebook, Instagram, WhatsApp)</li>
              <li>Automatización de flujos de comunicación</li>
              <li>Formularios de captura de datos</li>
              <li>Gestión de equipos y agentes</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">3. Registro y cuentas</h2>
            <p className="mb-3">Para utilizar el Servicio, usted debe:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Proporcionar información veraz, precisa y actualizada durante el registro</li>
              <li>Mantener la confidencialidad de sus credenciales de acceso</li>
              <li>Notificar inmediatamente cualquier uso no autorizado de su cuenta</li>
              <li>Ser mayor de edad según la legislación aplicable en su jurisdicción</li>
            </ul>
            <p className="mt-3">Usted es responsable de todas las actividades realizadas bajo su cuenta. Nos reservamos el derecho de suspender o cancelar cuentas que violen estas condiciones.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">4. Uso aceptable</h2>
            <p className="mb-3">Al utilizar el Servicio, usted se compromete a NO:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Enviar mensajes no solicitados (spam) o comunicaciones masivas sin consentimiento previo del destinatario</li>
              <li>Violar las políticas de uso de Meta, WhatsApp Business, Facebook o Instagram</li>
              <li>Transmitir contenido ilegal, difamatorio, obsceno, amenazante o que infrinja derechos de propiedad intelectual</li>
              <li>Utilizar el Servicio para actividades fraudulentas o engañosas</li>
              <li>Intentar acceder a sistemas, datos o cuentas sin autorización</li>
              <li>Interferir con el funcionamiento normal de la plataforma</li>
              <li>Revender o redistribuir el Servicio sin autorización</li>
              <li>Utilizar la plataforma para enviar contenido relacionado con actividades ilegales</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">5. Políticas de mensajería</h2>
            <p className="mb-3">El uso de canales de mensajería está sujeto a las políticas de cada plataforma:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>WhatsApp Business:</strong> Debe cumplir con la Política Comercial de WhatsApp y la Política de Mensajería de WhatsApp Business Platform</li>
              <li><strong>Facebook Messenger:</strong> Debe cumplir con las Políticas de la Plataforma de Facebook</li>
              <li><strong>Instagram:</strong> Debe cumplir con las Directrices de la Comunidad de Instagram</li>
            </ul>
            <p className="mt-3">El incumplimiento de estas políticas puede resultar en la suspensión de la cuenta y la desconexión de los canales afectados.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">6. Propiedad intelectual</h2>
            <p>
              El Servicio, incluyendo su código fuente, diseño, logotipos, funcionalidades y documentación, es propiedad de Strategee y está protegido por leyes de propiedad intelectual. Se le otorga una licencia limitada, no exclusiva y no transferible para utilizar el Servicio de acuerdo con estas condiciones.
            </p>
            <p className="mt-3">
              Usted conserva la propiedad total de los datos, contenidos y materiales que suba o gestione a través de la plataforma.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">7. Privacidad y protección de datos</h2>
            <p>
              El tratamiento de datos personales se rige por nuestra <a href="/privacy" className="text-brand-600 hover:underline font-medium">Política de Privacidad</a>, que forma parte integral de estas condiciones. Al utilizar el Servicio, usted acepta el tratamiento de datos descrito en dicha política.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">8. Disponibilidad del servicio</h2>
            <p>
              Nos esforzamos por mantener el Servicio disponible de forma ininterrumpida. Sin embargo, no garantizamos un tiempo de actividad del 100%. Podremos realizar mantenimientos programados, actualizaciones o enfrentar interrupciones fuera de nuestro control. Notificaremos con anticipación los mantenimientos planificados cuando sea posible.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">9. Limitación de responsabilidad</h2>
            <p>
              En la máxima medida permitida por la ley, Strategee no será responsable por daños indirectos, incidentales, especiales, consecuentes o punitivos, incluyendo pérdida de datos, pérdida de beneficios, interrupción del negocio o pérdida de oportunidades comerciales. Nuestra responsabilidad total acumulada no excederá el monto total pagado por el Servicio durante los 12 meses anteriores al evento que dio origen al reclamo.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">10. Indemnización</h2>
            <p>
              Usted acepta indemnizar y mantener indemne a Strategee de cualquier reclamo, daño, pérdida, responsabilidad o gasto (incluyendo honorarios de abogados) que surja del incumplimiento de estas condiciones o del uso indebido del Servicio.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">11. Terminación</h2>
            <p className="mb-3">
              Podemos suspender o terminar su acceso al Servicio en los siguientes casos:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Incumplimiento de estas Condiciones del Servicio</li>
              <li>Violación de políticas de plataformas de terceros (Meta, WhatsApp, etc.)</li>
              <li>Actividad fraudulenta o ilegal</li>
              <li>Falta de pago (si aplica)</li>
              <li>A solicitud del usuario</li>
            </ul>
            <p className="mt-3">Usted puede cancelar su cuenta en cualquier momento contactando a nuestro equipo de soporte. Tras la cancelación, sus datos serán tratados según nuestra Política de Privacidad.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">12. Modificaciones</h2>
            <p>
              Nos reservamos el derecho de modificar estas condiciones en cualquier momento. Los cambios sustanciales serán notificados con al menos 30 días de anticipación a través de la plataforma o por correo electrónico. El uso continuado del Servicio después de la entrada en vigencia de los cambios constituye su aceptación de los términos modificados.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">13. Ley aplicable y jurisdicción</h2>
            <p>
              Estas condiciones se rigen por las leyes de la República de Colombia. Cualquier controversia será sometida a la jurisdicción de los tribunales competentes de Colombia, sin perjuicio de los derechos que puedan corresponderle al consumidor según la legislación aplicable.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">14. Contacto</h2>
            <p>Para preguntas sobre estas condiciones:</p>
            <div className="mt-3 bg-gray-50 rounded-lg p-4 text-sm">
              <p><strong>Email:</strong> notificaciones@strategee.us</p>
              <p className="mt-1"><strong>Empresa:</strong> Strategee</p>
            </div>
          </section>
        </div>
      </div>
    </LegalLayout>
  );
}
