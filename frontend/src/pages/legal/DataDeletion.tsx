import { useState } from "react";
import { LegalLayout } from "./LegalLayout";

export function DataDeletion() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [reason, setReason] = useState("");
  const [submitted, setSubmitted] = useState(false);

  return (
    <LegalLayout>
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 md:p-12">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Eliminación de Datos de Usuario</h1>
          <p className="text-sm text-gray-500 mt-1">Instrucciones para solicitar la eliminación de tus datos personales</p>
        </div>

        <div className="space-y-8 text-[15px] leading-relaxed text-gray-600">
          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">Tus derechos</h2>
            <p>
              De acuerdo con la legislación aplicable de protección de datos (incluyendo el GDPR y la Ley 1581 de 2012), tienes derecho a solicitar la eliminación completa de tus datos personales de nuestra plataforma. Este proceso es gratuito y será atendido en un plazo máximo de 30 días calendario.
            </p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">¿Qué datos se eliminan?</h2>
            <p className="mb-3">Al procesar tu solicitud de eliminación, se borrarán permanentemente:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Información de perfil y cuenta (nombre, email, teléfono)</li>
              <li>Historial de conversaciones donde seas el contacto</li>
              <li>Datos de contacto almacenados en las bases de datos de la plataforma</li>
              <li>Información recopilada a través de formularios</li>
              <li>Datos de segmentación y etiquetas asociadas</li>
              <li>Cualquier dato personal vinculado a tu identidad</li>
            </ul>
            <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
              <p className="font-medium">Nota importante:</p>
              <p className="mt-1">Algunos datos anonimizados pueden retenerse para fines estadísticos. Datos requeridos por obligaciones legales o regulatorias pueden conservarse durante el período exigido por la ley, pero no serán utilizados para ningún otro propósito.</p>
            </div>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">Opción 1: Solicitud por correo electrónico</h2>
            <p>
              Puedes enviar tu solicitud directamente a nuestro equipo de protección de datos:
            </p>
            <div className="mt-3 bg-gray-50 rounded-lg p-4 text-sm">
              <p><strong>Destinatario:</strong> <a href="mailto:notificaciones@strategee.us" className="text-brand-600 hover:underline">notificaciones@strategee.us</a></p>
              <p className="mt-1"><strong>Asunto:</strong> Solicitud de eliminación de datos personales</p>
              <p className="mt-1"><strong>Incluir:</strong> Nombre completo, correo electrónico de la cuenta, número de teléfono registrado</p>
            </div>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">Opción 2: Formulario de solicitud</h2>
            <p className="mb-4">
              Completa el siguiente formulario para iniciar el proceso de eliminación de datos:
            </p>

            {!submitted ? (
              <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Nombre completo</label>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Tu nombre"
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1.5">Correo electrónico</label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="tu@correo.com"
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Motivo <span className="text-gray-400 font-normal">(opcional)</span></label>
                    <textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="¿Por qué deseas eliminar tus datos?"
                      rows={3}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all resize-none"
                    />
                  </div>
                  <div className="pt-2">
                    <button
                      onClick={() => { if (email.trim() && name.trim()) setSubmitted(true); }}
                      disabled={!email.trim() || !name.trim()}
                      className="px-5 py-2.5 text-sm font-medium rounded-lg bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 transition-colors"
                    >
                      Solicitar eliminación de mis datos
                    </button>
                    <p className="text-xs text-gray-400 mt-2">Al enviar, confirmas que eres el titular de los datos o estás autorizado para realizar esta solicitud.</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-green-50 rounded-xl p-6 border border-green-200">
                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded-full bg-green-100 flex items-center justify-center shrink-0 mt-0.5">
                    <svg className="h-4 w-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-green-800">Solicitud recibida correctamente</p>
                    <p className="text-sm text-green-700 mt-1">
                      Hemos registrado tu solicitud de eliminación de datos para <strong>{email}</strong>.
                    </p>
                    <ul className="text-sm text-green-700 mt-3 space-y-1 list-disc pl-4">
                      <li>Recibirás una confirmación por correo electrónico</li>
                      <li>Tu solicitud será procesada en un máximo de 30 días</li>
                      <li>Te notificaremos cuando la eliminación se complete</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">Proceso de eliminación</h2>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="h-7 w-7 rounded-full bg-brand-100 flex items-center justify-center text-xs font-bold text-brand-700 shrink-0">1</div>
                <div>
                  <p className="font-medium text-gray-800 text-sm">Recepción de la solicitud</p>
                  <p className="text-sm text-gray-500">Verificamos tu identidad como titular de los datos</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="h-7 w-7 rounded-full bg-brand-100 flex items-center justify-center text-xs font-bold text-brand-700 shrink-0">2</div>
                <div>
                  <p className="font-medium text-gray-800 text-sm">Confirmación</p>
                  <p className="text-sm text-gray-500">Te enviamos un correo confirmando que hemos recibido la solicitud</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="h-7 w-7 rounded-full bg-brand-100 flex items-center justify-center text-xs font-bold text-brand-700 shrink-0">3</div>
                <div>
                  <p className="font-medium text-gray-800 text-sm">Procesamiento</p>
                  <p className="text-sm text-gray-500">Eliminamos todos tus datos personales de nuestros sistemas (máximo 30 días)</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="h-7 w-7 rounded-full bg-brand-100 flex items-center justify-center text-xs font-bold text-brand-700 shrink-0">4</div>
                <div>
                  <p className="font-medium text-gray-800 text-sm">Notificación final</p>
                  <p className="text-sm text-gray-500">Te confirmamos por correo que la eliminación se ha completado</p>
                </div>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-base font-semibold text-gray-900 mb-3">Contacto</h2>
            <p>Para preguntas adicionales sobre la eliminación de datos:</p>
            <div className="mt-3 bg-gray-50 rounded-lg p-4 text-sm">
              <p><strong>Email:</strong> <a href="mailto:notificaciones@strategee.us" className="text-brand-600 hover:underline">notificaciones@strategee.us</a></p>
              <p className="mt-1"><strong>Tiempo de respuesta:</strong> Máximo 30 días calendario</p>
            </div>
          </section>
        </div>
      </div>
    </LegalLayout>
  );
}
