import { useState } from "react";
import { Book, ChevronRight, Search, Copy, CheckCircle2 } from "lucide-react";

const SECTIONS = [
  { id: "introduction", label: "Introducción" },
  { id: "authentication", label: "Autenticación" },
  { id: "webhooks", label: "Webhooks" },
  { id: "contacts", label: "Contactos" },
  { id: "conversations", label: "Conversaciones" },
  { id: "messages", label: "Mensajes" },
  { id: "campaigns", label: "Campañas" },
  { id: "inboxes", label: "Bandejas" },
  { id: "lists", label: "Listas" },
];

function CodeBlock({ code, language = "json" }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  return (
    <div className="relative rounded-lg bg-gray-900 text-gray-100 text-[12px] font-mono overflow-x-auto">
      <button onClick={copy} className="absolute top-2 right-2 p-1 rounded hover:bg-white/10 text-gray-400">
        {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
      <pre className="p-4 leading-relaxed">{code}</pre>
    </div>
  );
}

function Endpoint({ method, path, description }: { method: string; path: string; description: string }) {
  const colors: Record<string, string> = { GET: "bg-green-100 text-green-700", POST: "bg-blue-100 text-blue-700", PUT: "bg-amber-100 text-amber-700", DELETE: "bg-red-100 text-red-700" };
  return (
    <div className="flex items-center gap-3 py-2">
      <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${colors[method] || "bg-gray-100 text-gray-700"}`}>{method}</span>
      <code className="text-sm text-gray-800 font-mono">{path}</code>
      <span className="text-xs text-gray-500 ml-auto">{description}</span>
    </div>
  );
}

export function ApiReference() {
  const [active, setActive] = useState("introduction");

  return (
    <div className="h-screen flex bg-white">
      {/* Sidebar */}
      <aside className="w-64 border-r border-gray-200 flex flex-col shrink-0">
        <div className="px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-brand-700 flex items-center justify-center">
              <span className="text-white text-[10px] font-bold">SM</span>
            </div>
            <span className="text-sm font-bold text-gray-900">Smartee API</span>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto py-3 px-3">
          {SECTIONS.map((s) => (
            <button key={s.id} onClick={() => setActive(s.id)} className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors mb-0.5 ${active === s.id ? "bg-brand-50 text-brand-700 font-medium" : "text-gray-600 hover:bg-gray-50"}`}>
              {s.label}
            </button>
          ))}
        </nav>
      </aside>

      {/* Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-8 py-10">

          {active === "introduction" && (
            <div className="space-y-6">
              <div>
                <p className="text-xs text-brand-600 font-medium mb-1">Primeros pasos</p>
                <h1 className="text-2xl font-bold text-gray-900">Introducción a la API</h1>
                <p className="text-sm text-gray-600 mt-2 leading-relaxed">Aprende a usar la API de Smartee para crear integraciones, automatizar flujos de trabajo y gestionar tu comunicación omnicanal programáticamente.</p>
              </div>
              <p className="text-sm text-gray-700 leading-relaxed">La API de Smartee te permite interactuar con todos los recursos de tu cuenta: contactos, conversaciones, mensajes, campañas y más. Está diseñada con una arquitectura REST estándar y respuestas en JSON.</p>
              <div className="bg-gray-50 rounded-xl border border-gray-200 p-5">
                <h3 className="text-sm font-semibold text-gray-900 mb-2">Base URL</h3>
                <CodeBlock code="https://crm.strategee.us/api" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-2">Recursos disponibles</h3>
                <ul className="space-y-1.5 text-sm text-gray-700">
                  <li className="flex items-center gap-2"><ChevronRight className="h-3 w-3 text-brand-500" /> <strong>Contactos</strong> — Gestión completa de registros de clientes</li>
                  <li className="flex items-center gap-2"><ChevronRight className="h-3 w-3 text-brand-500" /> <strong>Conversaciones</strong> — Acceso a hilos de chat</li>
                  <li className="flex items-center gap-2"><ChevronRight className="h-3 w-3 text-brand-500" /> <strong>Mensajes</strong> — Envío y lectura de mensajes</li>
                  <li className="flex items-center gap-2"><ChevronRight className="h-3 w-3 text-brand-500" /> <strong>Campañas</strong> — Gestión de campañas masivas</li>
                  <li className="flex items-center gap-2"><ChevronRight className="h-3 w-3 text-brand-500" /> <strong>Webhooks</strong> — Notificaciones en tiempo real</li>
                </ul>
              </div>
            </div>
          )}

          {active === "authentication" && (
            <div className="space-y-6">
              <div>
                <p className="text-xs text-brand-600 font-medium mb-1">Seguridad</p>
                <h1 className="text-2xl font-bold text-gray-900">Autenticación</h1>
                <p className="text-sm text-gray-600 mt-2 leading-relaxed">Todas las peticiones a la API requieren autenticación mediante un token JWT en el header Authorization.</p>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-2">Obtener token</h3>
                <CodeBlock code={`POST /api/auth/login\n\n{\n  "email": "tu@email.com",\n  "password": "tu_contraseña"\n}`} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-2">Usar el token</h3>
                <p className="text-sm text-gray-700 mb-2">Incluye el token en el header de cada petición:</p>
                <CodeBlock code={`Authorization: Bearer eyJhbGciOiJIUzI1NiIs...`} />
              </div>
            </div>
          )}

          {active === "webhooks" && (
            <div className="space-y-6">
              <div>
                <p className="text-xs text-brand-600 font-medium mb-1">Integraciones</p>
                <h1 className="text-2xl font-bold text-gray-900">Webhooks</h1>
                <p className="text-sm text-gray-600 mt-2">Recibe notificaciones HTTP POST en tiempo real cuando ocurren eventos en tu cuenta.</p>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-2">Endpoints</h3>
                <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 overflow-hidden">
                  <Endpoint method="GET" path="/api/user-webhooks" description="Listar webhooks" />
                  <Endpoint method="POST" path="/api/user-webhooks" description="Crear webhook" />
                  <Endpoint method="PUT" path="/api/user-webhooks/:id" description="Actualizar webhook" />
                  <Endpoint method="DELETE" path="/api/user-webhooks/:id" description="Eliminar webhook" />
                </div>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-2">Eventos disponibles</h3>
                <div className="space-y-2 text-sm">
                  <div className="p-3 rounded-lg bg-gray-50"><code className="text-brand-600">message_created</code> — Cuando se envía o recibe un mensaje</div>
                  <div className="p-3 rounded-lg bg-gray-50"><code className="text-brand-600">contact_created</code> — Cuando se crea un contacto nuevo</div>
                  <div className="p-3 rounded-lg bg-gray-50"><code className="text-brand-600">contact_updated</code> — Cuando se actualiza un contacto</div>
                  <div className="p-3 rounded-lg bg-gray-50"><code className="text-brand-600">campaign_started</code> — Cuando inicia la ejecución de una campaña</div>
                  <div className="p-3 rounded-lg bg-gray-50"><code className="text-brand-600">campaign_completed</code> — Cuando se completa una campaña</div>
                </div>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-2">Ejemplo de payload — message_created</h3>
                <CodeBlock code={`{\n  "event": "message_created",\n  "timestamp": "2026-08-04T18:30:00.000Z",\n  "data": {\n    "message": {\n      "id": "uuid",\n      "direction": "inbound",\n      "messageType": "text",\n      "content": "Hola, necesito ayuda",\n      "status": "delivered",\n      "mediaUrl": null,\n      "replyToExternalId": null,\n      "createdAt": "2026-08-04T18:30:00.000Z"\n    },\n    "conversation": {\n      "id": "uuid",\n      "contactId": "573001234567",\n      "contactName": "Juan Pérez",\n      "status": "open",\n      "inboxId": "uuid"\n    },\n    "contact": {\n      "id": "uuid",\n      "firstName": "Juan",\n      "lastName": "Pérez",\n      "phone": "573001234567",\n      "email": "juan@ejemplo.com",\n      "tags": ["vip"],\n      "customData": { ... }\n    },\n    "inbox": {\n      "id": "uuid",\n      "name": "WhatsApp Principal",\n      "channel": "whatsapp"\n    }\n  }\n}`} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-2">Verificación de firma</h3>
                <p className="text-sm text-gray-700 mb-2">Si configuras un secret, cada request incluirá el header <code className="bg-gray-100 px-1 rounded">X-Webhook-Signature</code> con una firma HMAC-SHA256:</p>
                <CodeBlock code={`const crypto = require('crypto');\nconst signature = crypto\n  .createHmac('sha256', 'tu_secret')\n  .update(JSON.stringify(body))\n  .digest('hex');\n\n// Comparar con req.headers['x-webhook-signature']`} language="javascript" />
              </div>
            </div>
          )}

          {active === "contacts" && (
            <div className="space-y-6">
              <div>
                <p className="text-xs text-brand-600 font-medium mb-1">Recursos</p>
                <h1 className="text-2xl font-bold text-gray-900">Contactos</h1>
                <p className="text-sm text-gray-600 mt-2">Gestiona los registros de contactos de tu cuenta.</p>
              </div>
              <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 overflow-hidden">
                <Endpoint method="GET" path="/api/records?tenantId=:id" description="Listar contactos (paginado)" />
                <Endpoint method="GET" path="/api/records/:id" description="Obtener un contacto" />
                <Endpoint method="POST" path="/api/records" description="Crear contacto" />
                <Endpoint method="PUT" path="/api/records/:id" description="Actualizar contacto" />
                <Endpoint method="DELETE" path="/api/records/:id" description="Eliminar contacto" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-2">Crear contacto</h3>
                <CodeBlock code={`POST /api/records\n\n{\n  "tenantId": "uuid",\n  "firstName": "María",\n  "lastName": "García",\n  "phone": "573001234567",\n  "email": "maria@ejemplo.com",\n  "status": "active",\n  "channelSource": "manual",\n  "tags": ["nuevo", "web"],\n  "customData": {\n    "nombre_corto": "Mari"\n  }\n}`} />
              </div>
            </div>
          )}

          {active === "conversations" && (
            <div className="space-y-6">
              <div>
                <p className="text-xs text-brand-600 font-medium mb-1">Recursos</p>
                <h1 className="text-2xl font-bold text-gray-900">Conversaciones</h1>
                <p className="text-sm text-gray-600 mt-2">Accede a los hilos de conversación de tus bandejas.</p>
              </div>
              <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 overflow-hidden">
                <Endpoint method="GET" path="/api/chats/conversations?tenantId=:id" description="Listar conversaciones" />
                <Endpoint method="POST" path="/api/chats/conversations/:id/read" description="Marcar como leída" />
                <Endpoint method="DELETE" path="/api/chats/conversations/:id" description="Eliminar conversación" />
              </div>
            </div>
          )}

          {active === "messages" && (
            <div className="space-y-6">
              <div>
                <p className="text-xs text-brand-600 font-medium mb-1">Recursos</p>
                <h1 className="text-2xl font-bold text-gray-900">Mensajes</h1>
                <p className="text-sm text-gray-600 mt-2">Envía y lee mensajes dentro de conversaciones.</p>
              </div>
              <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 overflow-hidden">
                <Endpoint method="GET" path="/api/chats/conversations/:id/messages" description="Obtener mensajes" />
                <Endpoint method="POST" path="/api/chats/conversations/:id/send" description="Enviar mensaje" />
                <Endpoint method="POST" path="/api/chats/conversations/:id/note" description="Crear nota privada" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-2">Enviar mensaje</h3>
                <CodeBlock code={`POST /api/chats/conversations/:id/send\n\n{\n  "content": "Hola, ¿en qué te puedo ayudar?",\n  "messageType": "text",\n  "senderId": "uuid-del-agente"\n}`} />
              </div>
            </div>
          )}

          {active === "campaigns" && (
            <div className="space-y-6">
              <div>
                <p className="text-xs text-brand-600 font-medium mb-1">Recursos</p>
                <h1 className="text-2xl font-bold text-gray-900">Campañas</h1>
                <p className="text-sm text-gray-600 mt-2">Gestiona campañas masivas de WhatsApp, SMS y llamadas.</p>
              </div>
              <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 overflow-hidden">
                <Endpoint method="GET" path="/api/campaigns?tenantId=:id" description="Listar campañas" />
                <Endpoint method="GET" path="/api/campaigns/:id" description="Obtener campaña" />
                <Endpoint method="POST" path="/api/campaigns" description="Crear campaña" />
                <Endpoint method="PUT" path="/api/campaigns/:id" description="Actualizar campaña" />
                <Endpoint method="POST" path="/api/campaigns/:id/send" description="Ejecutar envío" />
              </div>
            </div>
          )}

          {active === "inboxes" && (
            <div className="space-y-6">
              <div>
                <p className="text-xs text-brand-600 font-medium mb-1">Recursos</p>
                <h1 className="text-2xl font-bold text-gray-900">Bandejas (Inboxes)</h1>
                <p className="text-sm text-gray-600 mt-2">Gestiona los canales de comunicación conectados.</p>
              </div>
              <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 overflow-hidden">
                <Endpoint method="GET" path="/api/chats/inboxes?tenantId=:id" description="Listar bandejas" />
                <Endpoint method="GET" path="/api/chats/inboxes/:id" description="Obtener bandeja" />
                <Endpoint method="POST" path="/api/chats/inboxes" description="Crear bandeja" />
                <Endpoint method="PUT" path="/api/chats/inboxes/:id" description="Actualizar bandeja" />
                <Endpoint method="DELETE" path="/api/chats/inboxes/:id" description="Eliminar bandeja" />
              </div>
            </div>
          )}

          {active === "lists" && (
            <div className="space-y-6">
              <div>
                <p className="text-xs text-brand-600 font-medium mb-1">Recursos</p>
                <h1 className="text-2xl font-bold text-gray-900">Listas</h1>
                <p className="text-sm text-gray-600 mt-2">Listas de contactos estáticas y dinámicas para segmentación.</p>
              </div>
              <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 overflow-hidden">
                <Endpoint method="GET" path="/api/record-lists?tenantId=:id" description="Listar listas" />
                <Endpoint method="POST" path="/api/record-lists" description="Crear lista" />
                <Endpoint method="PUT" path="/api/record-lists/:id" description="Actualizar lista" />
                <Endpoint method="DELETE" path="/api/record-lists/:id" description="Eliminar lista" />
                <Endpoint method="GET" path="/api/record-lists/:id/records" description="Obtener contactos de una lista" />
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
