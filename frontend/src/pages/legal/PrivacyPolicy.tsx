import { LegalLayout } from "./LegalLayout";

export function PrivacyPolicy() {
  return (
    <LegalLayout>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 md:p-12">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Política de Privacidad</h1>
          <p className="text-sm text-gray-500 mt-1">Última actualización: 2 de agosto de 2026</p>
        </div>

        <div className="space-y-8 text-[15px] leading-relaxed text-gray-600">
          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">1. Introducción</h2>
            <p>
              En Smartee (en adelante, "nosotros", "nuestro" o "la plataforma"), nos comprometemos a proteger la privacidad de los usuarios y contactos que interactúan con nuestra plataforma de comunicaciones empresariales. Esta política describe cómo recopilamos, usamos, almacenamos y protegemos su información personal de acuerdo con las leyes aplicables de protección de datos, incluyendo el Reglamento General de Protección de Datos (GDPR) y la legislación colombiana (Ley 1581 de 2012).
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">2. Responsable del tratamiento</h2>
            <p>El responsable del tratamiento de los datos personales es:</p>
            <div className="mt-3 bg-gray-50 rounded-lg p-4 text-sm">
              <p className="font-medium text-gray-800">Strategee</p>
              <p>Correo electrónico: notificaciones@strategee.us</p>
            </div>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">3. Información que recopilamos</h2>
            <p className="mb-3">Recopilamos las siguientes categorías de información personal:</p>

            <h3 className="text-sm font-semibold text-gray-800 mt-4 mb-2">3.1 Información proporcionada directamente</h3>
            <ul className="list-disc pl-5 space-y-1">
              <li>Nombre y apellidos</li>
              <li>Correo electrónico</li>
              <li>Número de teléfono</li>
              <li>Datos de la empresa u organización</li>
              <li>Contenido de mensajes enviados y recibidos a través de la plataforma</li>
            </ul>

            <h3 className="text-sm font-semibold text-gray-800 mt-4 mb-2">3.2 Información recopilada automáticamente</h3>
            <ul className="list-disc pl-5 space-y-1">
              <li>Dirección IP y datos de geolocalización aproximada</li>
              <li>Tipo de navegador y sistema operativo</li>
              <li>Datos de uso de la plataforma (páginas visitadas, acciones realizadas)</li>
              <li>Cookies y tecnologías similares</li>
            </ul>

            <h3 className="text-sm font-semibold text-gray-800 mt-4 mb-2">3.3 Información de terceros</h3>
            <ul className="list-disc pl-5 space-y-1">
              <li>Datos provenientes de la integración con Meta (Facebook, Instagram, WhatsApp Business)</li>
              <li>Información de perfil público de redes sociales cuando se autoriza la conexión</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">4. Finalidad del tratamiento</h2>
            <p className="mb-3">Utilizamos la información recopilada para las siguientes finalidades:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Proporcionar, operar y mantener los servicios de la plataforma</li>
              <li>Gestionar comunicaciones multicanal (WhatsApp, Messenger, Instagram, SMS, Email)</li>
              <li>Ejecutar campañas de comunicación autorizadas por los administradores de cuenta</li>
              <li>Segmentar y gestionar bases de contactos</li>
              <li>Mejorar la experiencia del usuario y desarrollar nuevas funcionalidades</li>
              <li>Enviar notificaciones relacionadas con el servicio</li>
              <li>Cumplir con obligaciones legales y regulatorias</li>
              <li>Prevenir fraude y garantizar la seguridad de la plataforma</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">5. Base legal del tratamiento</h2>
            <p className="mb-3">El tratamiento de datos personales se basa en:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Consentimiento:</strong> Cuando el usuario acepta esta política al registrarse</li>
              <li><strong>Ejecución de contrato:</strong> Para la prestación del servicio contratado</li>
              <li><strong>Interés legítimo:</strong> Para mejorar nuestros servicios y prevenir fraude</li>
              <li><strong>Obligación legal:</strong> Cuando la ley exige la conservación o comunicación de datos</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">6. Compartir información con terceros</h2>
            <p className="mb-3">No vendemos ni alquilamos información personal. Compartimos datos únicamente con:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Meta Platforms, Inc.:</strong> Para el funcionamiento de integraciones con WhatsApp Business API, Messenger e Instagram</li>
              <li><strong>Proveedores de infraestructura:</strong> Servicios de alojamiento y procesamiento de datos</li>
              <li><strong>Autoridades competentes:</strong> Cuando sea requerido por ley o por orden judicial</li>
            </ul>
            <p className="mt-3">Todos nuestros proveedores están obligados contractualmente a proteger los datos de acuerdo con estándares equivalentes a los establecidos en esta política.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">7. Seguridad de datos</h2>
            <p className="mb-3">Implementamos medidas técnicas y organizativas apropiadas, incluyendo:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Cifrado de datos en tránsito (TLS/SSL) y en reposo</li>
              <li>Controles de acceso basados en roles (RBAC)</li>
              <li>Autenticación segura con tokens JWT</li>
              <li>Monitoreo continuo de seguridad</li>
              <li>Copias de seguridad periódicas</li>
              <li>Revisiones regulares de seguridad</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">8. Retención de datos</h2>
            <p>
              Conservamos los datos personales únicamente durante el tiempo necesario para cumplir con las finalidades descritas o según lo exija la ley. Una vez cumplido el período de retención, los datos se eliminan de forma segura. Los usuarios pueden solicitar la eliminación anticipada de sus datos en cualquier momento.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">9. Derechos de los titulares</h2>
            <p className="mb-3">De acuerdo con la legislación aplicable, usted tiene derecho a:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li><strong>Acceso:</strong> Conocer qué datos personales tenemos sobre usted</li>
              <li><strong>Rectificación:</strong> Corregir datos inexactos o incompletos</li>
              <li><strong>Supresión:</strong> Solicitar la eliminación de sus datos personales</li>
              <li><strong>Oposición:</strong> Oponerse al tratamiento de sus datos</li>
              <li><strong>Portabilidad:</strong> Recibir sus datos en un formato estructurado</li>
              <li><strong>Limitación:</strong> Restringir el tratamiento de sus datos en ciertos casos</li>
              <li><strong>Revocación del consentimiento:</strong> Retirar su consentimiento en cualquier momento</li>
            </ul>
            <p className="mt-3">
              Para ejercer estos derechos, contacte a <a href="mailto:notificaciones@strategee.us" className="text-brand-600 hover:underline font-medium">notificaciones@strategee.us</a> o visite nuestra página de <a href="/data-deletion" className="text-brand-600 hover:underline font-medium">eliminación de datos</a>.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">10. Cookies</h2>
            <p>
              Utilizamos cookies esenciales para el funcionamiento de la plataforma y cookies analíticas para mejorar el servicio. No utilizamos cookies de publicidad ni de seguimiento de terceros.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">11. Transferencias internacionales</h2>
            <p>
              Sus datos pueden ser transferidos y almacenados en servidores ubicados fuera de su país de residencia. Garantizamos que cualquier transferencia internacional cumple con las salvaguardas legales apropiadas.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">12. Cambios en esta política</h2>
            <p>
              Nos reservamos el derecho de actualizar esta política periódicamente. Cualquier cambio sustancial será notificado a los usuarios a través de la plataforma o por correo electrónico. La fecha de la última actualización se indica al inicio del documento.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">13. Contacto</h2>
            <p>Para cualquier consulta relacionada con esta política de privacidad:</p>
            <div className="mt-3 bg-gray-50 rounded-lg p-4 text-sm">
              <p><strong>Email:</strong> notificaciones@strategee.us</p>
              <p className="mt-1"><strong>Responsable de datos:</strong> Strategee</p>
            </div>
          </section>
        </div>
      </div>
    </LegalLayout>
  );
}
