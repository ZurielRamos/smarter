import { useState } from "react";
import { ChevronRight, ChevronDown, Copy, CheckCircle2 } from "lucide-react";
import logo from "@/assets/logo.svg";

interface EndpointDef {
  id: string;
  method: string;
  label: string;
  path: string;
  description: string;
  params?: Array<{ name: string; type: string; required?: boolean; description: string }>;
  body?: string;
  response?: string;
}

interface SidebarSection {
  title: string;
  items: Array<{
    id: string;
    label: string;
    endpoints?: EndpointDef[];
  }>;
}

const METHOD_COLORS: Record<string, string> = {
  GET: "bg-green-500",
  POST: "bg-blue-500",
  PUT: "bg-amber-500",
  DELETE: "bg-red-500",
};

const METHOD_BADGE: Record<string, string> = {
  GET: "bg-green-100 text-green-700",
  POST: "bg-blue-100 text-blue-700",
  PUT: "bg-amber-100 text-amber-700",
  DELETE: "bg-red-100 text-red-700",
};

const SIDEBAR: SidebarSection[] = [
  {
    title: "Primeros pasos",
    items: [
      { id: "introduction", label: "Introducción" },
      { id: "authentication", label: "Autenticación" },
    ],
  },
  {
    title: "APIs de aplicación",
    items: [
      {
        id: "contacts", label: "Contactos", endpoints: [
          { id: "list-contacts", method: "GET", label: "Listar contactos", path: "/api/records", description: "Lista todos los contactos del tenant con paginación.", params: [{ name: "tenantId", type: "string", required: true, description: "ID del tenant" }, { name: "page", type: "integer", description: "Página (default: 1)" }, { name: "limit", type: "integer", description: "Registros por página (default: 50)" }, { name: "sortBy", type: "string", description: "Campo para ordenar" }, { name: "sortOrder", type: "ASC|DESC", description: "Dirección del orden" }], response: `{\n  "data": [\n    {\n      "id": "uuid",\n      "firstName": "Juan",\n      "lastName": "Pérez",\n      "phone": "573001234567",\n      "email": "juan@ejemplo.com",\n      "status": "active",\n      ...\n    }\n  ],\n  "total": 150\n}` },
          { id: "get-contact", method: "GET", label: "Obtener contacto", path: "/api/records/:id", description: "Obtiene un contacto por su ID.", params: [{ name: "id", type: "uuid", required: true, description: "ID del contacto" }], response: `{\n  "id": "uuid",\n  "firstName": "Juan",\n  "lastName": "Pérez",\n  "phone": "573001234567",\n  "email": "juan@ejemplo.com",\n  "status": "active",\n  "tags": ["vip"],\n  "customData": { "campo": "valor" },\n  ...\n}` },
          { id: "create-contact", method: "POST", label: "Crear contacto", path: "/api/records", description: "Crea un nuevo contacto.", body: `{\n  "tenantId": "uuid",\n  "firstName": "María",\n  "lastName": "García",\n  "phone": "573009876543",\n  "email": "maria@ejemplo.com",\n  "status": "active",\n  "tags": ["nuevo"]\n}`, response: `{\n  "id": "uuid",\n  "firstName": "María",\n  ...\n}` },
          { id: "update-contact", method: "PUT", label: "Actualizar contacto", path: "/api/records/:id", description: "Actualiza los campos de un contacto.", body: `{\n  "firstName": "María José",\n  "city": "Medellín",\n  "tags": ["vip", "premium"]\n}`, response: `{\n  "id": "uuid",\n  "firstName": "María José",\n  "city": "Medellín",\n  ...\n}` },
          { id: "delete-contact", method: "DELETE", label: "Eliminar contacto", path: "/api/records/:id", description: "Elimina un contacto permanentemente.", params: [{ name: "id", type: "uuid", required: true, description: "ID del contacto" }], response: `{ }` },
        ],
      },
      {
        id: "conversations", label: "Conversaciones", endpoints: [
          { id: "list-conversations", method: "GET", label: "Listar conversaciones", path: "/api/chats/conversations", description: "Lista conversaciones con paginación.", params: [{ name: "tenantId", type: "string", required: true, description: "ID del tenant" }, { name: "inboxId", type: "string", description: "Filtrar por bandeja" }, { name: "limit", type: "integer", description: "Default: 15" }, { name: "offset", type: "integer", description: "Default: 0" }], response: `{\n  "data": [...],\n  "total": 45\n}` },
          { id: "mark-read", method: "POST", label: "Marcar como leída", path: "/api/chats/conversations/:id/read", description: "Marca una conversación como leída (unreadCount = 0).", response: `{ "success": true }` },
          { id: "delete-conversation", method: "DELETE", label: "Eliminar conversación", path: "/api/chats/conversations/:id", description: "Elimina una conversación y sus mensajes.", response: `{ }` },
        ],
      },
      {
        id: "messages", label: "Mensajes", endpoints: [
          { id: "get-messages", method: "GET", label: "Obtener mensajes", path: "/api/chats/conversations/:id/messages", description: "Obtiene los mensajes de una conversación.", params: [{ name: "limit", type: "integer", description: "Default: 50" }, { name: "before", type: "string", description: "Cursor para paginación" }], response: `[\n  {\n    "id": "uuid",\n    "direction": "inbound",\n    "messageType": "text",\n    "content": "Hola!",\n    "status": "delivered",\n    "createdAt": "2026-08-04T..."\n  }\n]` },
          { id: "send-message", method: "POST", label: "Enviar mensaje", path: "/api/chats/conversations/:id/send", description: "Envía un mensaje de texto en una conversación.", body: `{\n  "content": "Hola, ¿cómo te puedo ayudar?",\n  "messageType": "text",\n  "senderId": "uuid-agente"\n}`, response: `{\n  "id": "uuid",\n  "direction": "outbound",\n  "content": "Hola, ¿cómo te puedo ayudar?",\n  "status": "sent",\n  ...\n}` },
          { id: "create-note", method: "POST", label: "Crear nota privada", path: "/api/chats/conversations/:id/note", description: "Crea una nota privada (no visible para el contacto).", body: `{\n  "content": "Cliente VIP, dar prioridad",\n  "senderId": "uuid-agente"\n}`, response: `{\n  "id": "uuid",\n  "messageType": "note",\n  ...\n}` },
        ],
      },

      {
        id: "inboxes", label: "Bandejas", endpoints: [
          { id: "list-inboxes", method: "GET", label: "Listar bandejas", path: "/api/chats/inboxes", description: "Lista las bandejas del tenant.", params: [{ name: "tenantId", type: "string", required: true, description: "ID del tenant" }], response: `[\n  {\n    "id": "uuid",\n    "name": "WhatsApp Principal",\n    "channel": "whatsapp",\n    "status": "connected"\n  }\n]` },
          { id: "create-inbox", method: "POST", label: "Crear bandeja", path: "/api/chats/inboxes", description: "Crea una nueva bandeja.", body: `{\n  "tenantId": "uuid",\n  "name": "Mi canal",\n  "channel": "whatsapp"\n}`, response: `{ "id": "uuid", ... }` },
          { id: "update-inbox", method: "PUT", label: "Actualizar bandeja", path: "/api/chats/inboxes/:id", description: "Actualiza nombre u otros campos.", body: `{ "name": "Nuevo nombre" }`, response: `{ "id": "uuid", ... }` },
          { id: "delete-inbox", method: "DELETE", label: "Eliminar bandeja", path: "/api/chats/inboxes/:id", description: "Elimina una bandeja (soft-delete si tiene conversaciones).", response: `{ "softDeleted": true }` },
        ],
      },
      {
        id: "campaigns", label: "Campañas", endpoints: [
          { id: "list-campaigns", method: "GET", label: "Listar campañas", path: "/api/campaigns", description: "Lista las campañas del tenant.", params: [{ name: "tenantId", type: "string", required: true, description: "ID del tenant" }], response: `[\n  {\n    "id": "uuid",\n    "name": "Promo Julio",\n    "channel": "whatsapp",\n    "status": "draft"\n  }\n]` },
          { id: "get-campaign", method: "GET", label: "Obtener campaña", path: "/api/campaigns/:id", description: "Obtiene detalle de una campaña.", response: `{ "id": "uuid", "name": "...", ... }` },
          { id: "create-campaign", method: "POST", label: "Crear campaña", path: "/api/campaigns", description: "Crea una nueva campaña.", body: `{\n  "tenantId": "uuid",\n  "name": "Mi campaña",\n  "channel": "sms",\n  "inboxId": "uuid"\n}`, response: `{ "id": "uuid", ... }` },
          { id: "send-campaign", method: "POST", label: "Ejecutar envío", path: "/api/campaigns/:id/send", description: "Inicia la ejecución de la campaña. Encola el envío a todos los destinatarios.", response: `{\n  "id": "uuid",\n  "status": "queued",\n  "totalRecipients": 150\n}` },
        ],
      },
      {
        id: "webhooks", label: "Webhooks", endpoints: [
          { id: "list-webhooks", method: "GET", label: "Listar webhooks", path: "/api/user-webhooks", description: "Lista los webhooks del tenant.", params: [{ name: "tenantId", type: "string", required: true, description: "ID del tenant" }], response: `[\n  {\n    "id": "uuid",\n    "name": "n8n",\n    "url": "https://...",\n    "events": ["message_created"],\n    "enabled": true\n  }\n]` },
          { id: "create-webhook", method: "POST", label: "Crear webhook", path: "/api/user-webhooks", description: "Crea un nuevo webhook.", body: `{\n  "tenantId": "uuid",\n  "name": "Mi webhook",\n  "url": "https://example.com/hook",\n  "events": ["message_created", "contact_created"],\n  "secret": "mi_secret_opcional"\n}`, response: `{ "id": "uuid", ... }` },
          { id: "update-webhook", method: "PUT", label: "Actualizar webhook", path: "/api/user-webhooks/:id", description: "Actualiza un webhook existente.", body: `{ "enabled": false }`, response: `{ "id": "uuid", ... }` },
          { id: "delete-webhook", method: "DELETE", label: "Eliminar webhook", path: "/api/user-webhooks/:id", description: "Elimina un webhook.", response: `{ }` },
        ],
      },
      {
        id: "lists", label: "Listas", endpoints: [
          { id: "list-lists", method: "GET", label: "Listar listas", path: "/api/record-lists", description: "Lista las listas de contactos.", params: [{ name: "tenantId", type: "string", required: true, description: "ID del tenant" }], response: `[\n  {\n    "id": "uuid",\n    "name": "VIP",\n    "type": "static",\n    "recordIds": ["uuid1", "uuid2"]\n  }\n]` },
          { id: "list-records", method: "GET", label: "Contactos de lista", path: "/api/record-lists/:id/records", description: "Obtiene los contactos que pertenecen a una lista.", response: `{ "data": [...], "total": 25 }` },
          { id: "create-list", method: "POST", label: "Crear lista", path: "/api/record-lists", description: "Crea una nueva lista.", body: `{\n  "tenantId": "uuid",\n  "name": "Clientes Premium",\n  "type": "static"\n}`, response: `{ "id": "uuid", ... }` },
        ],
      },
    ],
  },
];

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  return (
    <div className="relative rounded-lg bg-[#1e1e2e] text-gray-100 text-[11px] font-mono overflow-x-auto">
      <button onClick={copy} className="absolute top-2 right-2 p-1 rounded hover:bg-white/10 text-gray-500 hover:text-gray-300">
        {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
      <pre className="p-4 leading-relaxed text-green-300">{code}</pre>
    </div>
  );
}

export function ApiReference() {
  const [active, setActive] = useState("introduction");
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["contacts"]));

  const toggleExpand = (id: string) => {
    setExpanded((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };

  // Find current endpoint if active is an endpoint ID
  let currentEndpoint: EndpointDef | null = null;
  let currentSection = "";
  for (const section of SIDEBAR) {
    for (const item of section.items) {
      if (item.endpoints) {
        const ep = item.endpoints.find((e) => e.id === active);
        if (ep) { currentEndpoint = ep; currentSection = item.label; }
      }
    }
  }

  return (
    <div className="h-screen flex bg-white">
      {/* Sidebar */}
      <aside className="w-64 border-r border-gray-200 flex flex-col shrink-0 bg-gray-50/50">
        <div className="px-4 py-3.5 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <img src={logo} alt="Smartee" className="h-5" />
            <span className="text-xs font-bold text-gray-700">API Reference</span>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto py-2 px-2 text-[13px]">
          {SIDEBAR.map((section) => (
            <div key={section.title} className="mb-3">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-2.5 mb-1">{section.title}</p>
              {section.items.map((item) => (
                <div key={item.id}>
                  <button
                    onClick={() => { if (item.endpoints) toggleExpand(item.id); else setActive(item.id); }}
                    className={`w-full text-left px-2.5 py-1.5 rounded-md flex items-center justify-between transition-colors ${!item.endpoints && active === item.id ? "bg-brand-50 text-brand-700 font-medium" : "text-gray-700 hover:bg-gray-100"}`}
                  >
                    <span>{item.label}</span>
                    {item.endpoints && (expanded.has(item.id) ? <ChevronDown className="h-3 w-3 text-gray-400" /> : <ChevronRight className="h-3 w-3 text-gray-400" />)}
                  </button>
                  {item.endpoints && expanded.has(item.id) && (
                    <div className="ml-2 border-l border-gray-200 pl-2 mt-0.5 space-y-0.5">
                      {item.endpoints.map((ep) => (
                        <button key={ep.id} onClick={() => setActive(ep.id)} className={`w-full text-left px-2 py-1 rounded-md flex items-center gap-2 text-[12px] transition-colors ${active === ep.id ? "bg-brand-50 text-brand-700 font-medium" : "text-gray-600 hover:bg-gray-100"}`}>
                          <span className={`text-[8px] px-1 py-0.5 rounded font-bold text-white leading-none ${METHOD_COLORS[ep.method]}`}>{ep.method}</span>
                          <span className="truncate">{ep.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {active === "introduction" && (
          <div className="max-w-3xl mx-auto px-8 py-10 space-y-6">
            <div>
              <p className="text-xs text-brand-600 font-medium mb-1">Primeros pasos</p>
              <h1 className="text-2xl font-bold text-gray-900">Introducción a la API</h1>
              <p className="text-sm text-gray-600 mt-3 leading-relaxed">La API de Smartee te permite interactuar programáticamente con contactos, conversaciones, mensajes, campañas y más. Usa una arquitectura REST con respuestas JSON.</p>
            </div>
            <div className="bg-gray-50 rounded-xl border border-gray-200 p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Base URL</h3>
              <CodeBlock code="https://crm.strategee.us/api" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Eventos de Webhook disponibles</h3>
              <div className="space-y-1.5 text-sm">
                <div className="p-2.5 rounded bg-gray-50 flex items-center gap-3"><code className="text-brand-600 text-xs">message_created</code><span className="text-gray-500 text-xs">Mensaje enviado o recibido</span></div>
                <div className="p-2.5 rounded bg-gray-50 flex items-center gap-3"><code className="text-brand-600 text-xs">contact_created</code><span className="text-gray-500 text-xs">Contacto nuevo creado</span></div>
                <div className="p-2.5 rounded bg-gray-50 flex items-center gap-3"><code className="text-brand-600 text-xs">contact_updated</code><span className="text-gray-500 text-xs">Contacto actualizado</span></div>
                <div className="p-2.5 rounded bg-gray-50 flex items-center gap-3"><code className="text-brand-600 text-xs">campaign_started</code><span className="text-gray-500 text-xs">Campaña iniciada</span></div>
                <div className="p-2.5 rounded bg-gray-50 flex items-center gap-3"><code className="text-brand-600 text-xs">campaign_completed</code><span className="text-gray-500 text-xs">Campaña completada</span></div>
              </div>
            </div>
          </div>
        )}

        {active === "authentication" && (
          <div className="max-w-3xl mx-auto px-8 py-10 space-y-6">
            <div>
              <p className="text-xs text-brand-600 font-medium mb-1">Seguridad</p>
              <h1 className="text-2xl font-bold text-gray-900">Autenticación</h1>
              <p className="text-sm text-gray-600 mt-3 leading-relaxed">Todas las peticiones requieren un token JWT en el header <code className="bg-gray-100 px-1 rounded text-xs">Authorization</code>.</p>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Obtener token</h3>
              <CodeBlock code={`curl -X POST https://crm.strategee.us/api/auth/login \\\n  -H "Content-Type: application/json" \\\n  -d '{"email": "tu@email.com", "password": "tu_contraseña"}'`} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Usar el token</h3>
              <CodeBlock code={`curl https://crm.strategee.us/api/records?tenantId=uuid \\\n  -H "Authorization: Bearer eyJhbGciOi..."`} />
            </div>
          </div>
        )}

        {/* Endpoint detail view */}
        {currentEndpoint && (
          <div className="flex h-full">
            {/* Left: Documentation */}
            <div className="flex-1 overflow-y-auto px-8 py-10 border-r border-gray-100">
              <p className="text-xs text-brand-600 font-medium mb-1">{currentSection}</p>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">{currentEndpoint.label}</h1>
              <p className="text-sm text-gray-600 mb-6">{currentEndpoint.description}</p>

              {/* Endpoint badge */}
              <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-gray-900 mb-6">
                <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${METHOD_BADGE[currentEndpoint.method]}`}>{currentEndpoint.method}</span>
                <code className="text-sm text-gray-100 font-mono">{currentEndpoint.path}</code>
              </div>

              {/* Parameters */}
              {currentEndpoint.params && currentEndpoint.params.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">Parámetros</h3>
                  <div className="space-y-3">
                    {currentEndpoint.params.map((p) => (
                      <div key={p.name} className="flex items-baseline gap-3">
                        <code className="text-xs text-brand-700 font-semibold">{p.name}</code>
                        <span className="text-[10px] text-gray-500">{p.type}</span>
                        {p.required && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-600 font-medium">required</span>}
                        <span className="text-xs text-gray-600 ml-auto">{p.description}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Request body */}
              {currentEndpoint.body && (
                <div className="mb-6">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">Body</h3>
                  <CodeBlock code={currentEndpoint.body} />
                </div>
              )}
            </div>

            {/* Right: Response example */}
            <div className="w-[380px] shrink-0 bg-[#1a1a2e] overflow-y-auto p-5 hidden lg:block">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] text-gray-400 font-medium">{currentEndpoint.label}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700 text-gray-300">200</span>
              </div>
              {currentEndpoint.response && (
                <pre className="text-[11px] font-mono text-green-300 leading-relaxed whitespace-pre-wrap">{currentEndpoint.response}</pre>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
