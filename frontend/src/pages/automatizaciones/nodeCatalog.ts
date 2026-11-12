import {
  Bot,
  Clock,
  Globe,
  Hand,
  Hourglass,
  Mail,
  MessageCircle,
  MessageSquare,
  MessagesSquare,
  OctagonX,
  Repeat,
  Send,
  SlidersHorizontal,
  UserCog,
  UserPlus,
  UserSearch,
  Split,
  Webhook,
  type LucideIcon,
} from "lucide-react";
import type { AutomationNodeData, AutomationNodeType } from "@/services/automatizaciones";

export type NodeCategory = "trigger" | "logic" | "integration" | "crm";

export type FieldDef =
  | { kind: "text"; key: string; label: string; placeholder?: string; help?: string }
  | { kind: "textarea"; key: string; label: string; placeholder?: string; rows?: number; mono?: boolean; help?: string }
  | { kind: "number"; key: string; label: string; min?: number; max?: number; help?: string }
  | { kind: "select"; key: string; label: string; options: { value: string; label: string }[]; help?: string }
  | { kind: "toggle"; key: string; label: string; help?: string }
  | { kind: "keyvalue"; key: string; label: string; keyPlaceholder?: string; valuePlaceholder?: string }
  | { kind: "connection"; key: string; label: string; types: string[]; optional?: boolean }
  | { kind: "inbox"; key: string; label: string; optional?: boolean; help?: string }
  | { kind: "cron"; key: string; label: string }
  | { kind: "assignments"; key: string; label: string }
  | { kind: "branches"; key: string; label: string }
  | { kind: "webhookInfo"; key: string; label: string };

/** Condición de visibilidad de un campo según otros valores del nodo. */
export type FieldWithShow = FieldDef & { showWhen?: (d: AutomationNodeData) => boolean };

export interface NodeDef {
  type: AutomationNodeType;
  label: string;
  description: string;
  category: NodeCategory;
  icon: LucideIcon;
  /** Clases Tailwind del acento (borde del icono / fondo suave). */
  accent: string;
  /** Tipo de salidas del nodo. */
  outputs: "default" | "condition" | "loop" | "none";
  fields: FieldWithShow[];
  defaults: AutomationNodeData;
}

const method = [
  { value: "GET", label: "GET" },
  { value: "POST", label: "POST" },
  { value: "PUT", label: "PUT" },
  { value: "PATCH", label: "PATCH" },
  { value: "DELETE", label: "DELETE" },
];

export const NODE_CATALOG: NodeDef[] = [
  // ── Disparadores ──
  {
    type: "trigger_manual",
    label: "Inicio manual",
    description: "Se ejecuta con el botón «Ejecutar» del editor",
    category: "trigger",
    icon: Hand,
    accent: "bg-violet-500",
    outputs: "default",
    fields: [],
    defaults: { label: "Inicio manual" },
  },
  {
    type: "trigger_webhook",
    label: "Webhook",
    description: "Se dispara al recibir una petición HTTP en una URL única",
    category: "trigger",
    icon: Webhook,
    accent: "bg-violet-500",
    outputs: "default",
    fields: [
      {
        kind: "select",
        key: "method",
        label: "Método aceptado",
        options: [{ value: "ANY", label: "Cualquiera" }, ...method.slice(0, 2), method[2], method[4]],
      },
      {
        kind: "text",
        key: "secret",
        label: "Secreto (opcional)",
        placeholder: "Se exige en la cabecera x-webhook-secret",
        help: "Si lo defines, las peticiones sin esta cabecera serán rechazadas.",
      },
      { kind: "webhookInfo", key: "info", label: "URL del webhook" },
    ],
    defaults: { label: "Webhook", method: "ANY" },
  },
  {
    type: "trigger_schedule",
    label: "Programado",
    description: "Se ejecuta de forma recurrente con una expresión cron",
    category: "trigger",
    icon: Clock,
    accent: "bg-violet-500",
    outputs: "default",
    fields: [{ kind: "cron", key: "cron", label: "Frecuencia" }],
    defaults: { label: "Programado", cron: "0 9 * * 1-5" },
  },

  {
    type: "trigger_contact_created",
    label: "Contacto nuevo",
    description: "Se dispara cuando se crea un contacto (chat, importación, formulario, API)",
    category: "trigger",
    icon: UserPlus,
    accent: "bg-violet-500",
    outputs: "default",
    fields: [],
    defaults: { label: "Contacto nuevo" },
  },
  {
    type: "trigger_message_received",
    label: "Mensaje recibido",
    description: "Se dispara cuando un contacto escribe por un canal",
    category: "trigger",
    icon: MessageCircle,
    accent: "bg-violet-500",
    outputs: "default",
    fields: [
      { kind: "inbox", key: "inboxId", label: "Canal", optional: true, help: "Vacío = todos los canales." },
      { kind: "text", key: "keywords", label: "Palabras clave (opcional)", placeholder: "precio, cotización", help: "Separadas por coma. Vacío = cualquier mensaje." },
      {
        kind: "select",
        key: "matchType",
        label: "Coincidencia",
        options: [
          { value: "contains", label: "El mensaje contiene la palabra" },
          { value: "exact", label: "El mensaje es exactamente la palabra" },
        ],
      },
    ],
    defaults: { label: "Mensaje recibido", matchType: "contains" },
  },
  {
    type: "trigger_conversation_created",
    label: "Conversación nueva",
    description: "Se dispara cuando se abre una conversación nueva",
    category: "trigger",
    icon: MessagesSquare,
    accent: "bg-violet-500",
    outputs: "default",
    fields: [{ kind: "inbox", key: "inboxId", label: "Canal", optional: true, help: "Vacío = todos los canales." }],
    defaults: { label: "Conversación nueva" },
  },

  // ── Lógica ──
  {
    type: "condition",
    label: "Condición",
    description: "Divide el flujo según reglas (si / si no)",
    category: "logic",
    icon: Split,
    accent: "bg-amber-500",
    outputs: "condition",
    fields: [{ kind: "branches", key: "branches", label: "Ramas" }],
    defaults: { label: "Condición", branches: [] },
  },
  {
    type: "loop",
    label: "Bucle",
    description: "Repite los nodos conectados por cada elemento de una lista",
    category: "logic",
    icon: Repeat,
    accent: "bg-amber-500",
    outputs: "loop",
    fields: [
      {
        kind: "text",
        key: "items",
        label: "Lista",
        placeholder: "{{steps.http-1.output.body.items}}",
        help: "Arreglo JSON o texto con un elemento por línea (máx. 1000). Dentro del bucle usa {{vars.item}} y {{vars.index}}.",
      },
    ],
    defaults: { label: "Bucle", items: "" },
  },
  {
    type: "set_variable",
    label: "Definir variables",
    description: "Crea o transforma valores para usarlos más adelante",
    category: "logic",
    icon: SlidersHorizontal,
    accent: "bg-amber-500",
    outputs: "default",
    fields: [{ kind: "assignments", key: "assignments", label: "Variables" }],
    defaults: { label: "Definir variables", assignments: [{ name: "", value: "", type: "string" }] },
  },
  {
    type: "delay",
    label: "Espera",
    description: "Pausa la ejecución (hasta 5 minutos)",
    category: "logic",
    icon: Hourglass,
    accent: "bg-amber-500",
    outputs: "default",
    fields: [
      { kind: "number", key: "amount", label: "Duración", min: 0 },
      {
        kind: "select",
        key: "unit",
        label: "Unidad",
        options: [
          { value: "seconds", label: "Segundos" },
          { value: "minutes", label: "Minutos" },
        ],
      },
    ],
    defaults: { label: "Espera", amount: 5, unit: "seconds" },
  },
  {
    type: "stop",
    label: "Detener",
    description: "Termina la ejecución con éxito o con error",
    category: "logic",
    icon: OctagonX,
    accent: "bg-rose-500",
    outputs: "none",
    fields: [
      {
        kind: "select",
        key: "mode",
        label: "Resultado",
        options: [
          { value: "success", label: "Terminar con éxito" },
          { value: "error", label: "Terminar con error" },
        ],
      },
      { kind: "text", key: "message", label: "Mensaje", placeholder: "Motivo (opcional)" },
    ],
    defaults: { label: "Detener", mode: "success" },
  },

  // ── Integraciones ──
  {
    type: "http_request",
    label: "Petición HTTP",
    description: "Llama a cualquier API REST (GET, POST, PUT…)",
    category: "integration",
    icon: Globe,
    accent: "bg-sky-500",
    outputs: "default",
    fields: [
      { kind: "select", key: "method", label: "Método", options: method },
      { kind: "text", key: "url", label: "URL", placeholder: "https://api.ejemplo.com/v1/items" },
      { kind: "connection", key: "connectionId", label: "Autenticación", types: ["http_bearer", "http_basic", "http_api_key"], optional: true },
      { kind: "keyvalue", key: "query", label: "Parámetros de consulta", keyPlaceholder: "nombre", valuePlaceholder: "valor" },
      { kind: "keyvalue", key: "headers", label: "Cabeceras", keyPlaceholder: "Header", valuePlaceholder: "valor" },
      {
        kind: "select",
        key: "bodyType",
        label: "Cuerpo",
        options: [
          { value: "none", label: "Sin cuerpo" },
          { value: "json", label: "JSON" },
          { value: "form", label: "Formulario" },
          { value: "text", label: "Texto" },
        ],
      },
      {
        kind: "textarea",
        key: "body",
        label: "Contenido",
        rows: 6,
        mono: true,
        placeholder: '{\n  "email": "{{trigger.body.email}}"\n}',
        showWhen: (d) => d.bodyType === "json" || d.bodyType === "text" || (!d.bodyType && d.method !== "GET"),
      },
      { kind: "keyvalue", key: "formFields", label: "Campos del formulario", showWhen: (d) => d.bodyType === "form" } as FieldWithShow,
      { kind: "number", key: "timeoutSec", label: "Timeout (segundos)", min: 1, max: 60 },
      { kind: "toggle", key: "failOnError", label: "Fallar si la respuesta no es 2xx", help: "Desactívalo para manejar los códigos de error con una condición." },
    ],
    defaults: { label: "Petición HTTP", method: "GET", url: "", bodyType: "none", timeoutSec: 15, failOnError: true },
  },
  {
    type: "send_email",
    label: "Enviar correo",
    description: "Envía un correo transaccional (máx. 5 destinatarios)",
    category: "integration",
    icon: Mail,
    accent: "bg-sky-500",
    outputs: "default",
    fields: [
      { kind: "text", key: "to", label: "Para", placeholder: "{{trigger.body.email}}", help: "Separa varias direcciones con coma." },
      { kind: "text", key: "subject", label: "Asunto" },
      { kind: "textarea", key: "body", label: "Mensaje", rows: 6 },
      { kind: "toggle", key: "html", label: "El mensaje es HTML" },
      { kind: "text", key: "replyTo", label: "Responder a (opcional)" },
    ],
    defaults: { label: "Enviar correo", to: "", subject: "", body: "", html: false },
  },
  {
    type: "slack",
    label: "Slack",
    description: "Publica un mensaje en un canal de Slack",
    category: "integration",
    icon: MessageSquare,
    accent: "bg-fuchsia-500",
    outputs: "default",
    fields: [
      { kind: "connection", key: "connectionId", label: "Conexión", types: ["slack_webhook"] },
      { kind: "textarea", key: "text", label: "Mensaje", rows: 4, placeholder: "Nuevo lead: {{trigger.body.name}}" },
    ],
    defaults: { label: "Slack", text: "" },
  },
  {
    type: "discord",
    label: "Discord",
    description: "Publica un mensaje mediante un webhook de Discord",
    category: "integration",
    icon: MessageSquare,
    accent: "bg-indigo-500",
    outputs: "default",
    fields: [
      { kind: "connection", key: "connectionId", label: "Conexión", types: ["discord_webhook"] },
      { kind: "textarea", key: "text", label: "Mensaje", rows: 4 },
      { kind: "text", key: "username", label: "Nombre a mostrar (opcional)" },
    ],
    defaults: { label: "Discord", text: "" },
  },
  {
    type: "telegram",
    label: "Telegram",
    description: "Envía un mensaje con un bot de Telegram",
    category: "integration",
    icon: Send,
    accent: "bg-cyan-500",
    outputs: "default",
    fields: [
      { kind: "connection", key: "connectionId", label: "Conexión", types: ["telegram_bot"] },
      { kind: "text", key: "chatId", label: "Chat ID", placeholder: "-1001234567890" },
      { kind: "textarea", key: "text", label: "Mensaje", rows: 4 },
      {
        kind: "select",
        key: "parseMode",
        label: "Formato",
        options: [
          { value: "", label: "Texto plano" },
          { value: "HTML", label: "HTML" },
          { value: "MarkdownV2", label: "MarkdownV2" },
        ],
      },
    ],
    defaults: { label: "Telegram", chatId: "", text: "" },
  },
  {
    type: "ai_prompt",
    label: "IA (prompt)",
    description: "Genera, clasifica o extrae datos con un modelo de lenguaje",
    category: "integration",
    icon: Bot,
    accent: "bg-emerald-500",
    outputs: "default",
    fields: [
      { kind: "connection", key: "connectionId", label: "Conexión OpenRouter", types: ["openrouter"], optional: true },
      { kind: "text", key: "model", label: "Modelo", placeholder: "openai/gpt-4o-mini" },
      { kind: "textarea", key: "system", label: "Instrucciones del sistema", rows: 3 },
      { kind: "textarea", key: "prompt", label: "Prompt", rows: 5, placeholder: "Clasifica este mensaje: {{trigger.body.text}}" },
      { kind: "number", key: "temperature", label: "Temperatura", min: 0, max: 2 },
      { kind: "toggle", key: "parseJson", label: "Interpretar la respuesta como JSON", help: "Disponible como {{steps.<id>.output.json}}." },
    ],
    defaults: { label: "IA (prompt)", model: "openai/gpt-4o-mini", prompt: "", temperature: 0.3 },
  },

  // ── CRM ──
  {
    type: "send_message",
    label: "Enviar mensaje",
    description: "Escribe a un contacto por uno de tus canales (con plantilla de respaldo)",
    category: "crm",
    icon: MessageSquare,
    accent: "bg-teal-500",
    outputs: "default",
    fields: [
      { kind: "inbox", key: "inboxId", label: "Canal" },
      { kind: "text", key: "phone", label: "Teléfono", placeholder: "{{trigger.contact.phone}}" },
      { kind: "text", key: "email", label: "Email (si el canal es correo)", placeholder: "{{trigger.contact.email}}" },
      { kind: "text", key: "recordId", label: "ID de contacto (opcional)", placeholder: "{{trigger.contact.id}}", help: "Si lo indicas, se usa en lugar del teléfono o email." },
      { kind: "textarea", key: "text", label: "Mensaje", rows: 5, placeholder: "Hola {{trigger.contact.firstName}}, gracias por escribirnos." },
      { kind: "toggle", key: "createIfMissing", label: "Crear el contacto si no existe" },
      { kind: "text", key: "templateName", label: "Plantilla de respaldo (WhatsApp)", help: "Se usa si la ventana de 24 h está cerrada. Consume créditos según su categoría." },
      { kind: "text", key: "templateLanguage", label: "Idioma de la plantilla", placeholder: "es" },
      { kind: "keyvalue", key: "templateParams", label: "Variables de la plantilla (en orden)", keyPlaceholder: "{{1}}", valuePlaceholder: "valor" },
    ],
    defaults: { label: "Enviar mensaje", text: "", createIfMissing: true },
  },
  {
    type: "contact_upsert",
    label: "Crear o actualizar contacto",
    description: "Busca por teléfono o email; actualiza si existe, crea si no",
    category: "crm",
    icon: UserCog,
    accent: "bg-teal-500",
    outputs: "default",
    fields: [
      { kind: "text", key: "phone", label: "Teléfono", placeholder: "{{trigger.body.phone}}" },
      { kind: "text", key: "email", label: "Email", placeholder: "{{trigger.body.email}}" },
      { kind: "text", key: "firstName", label: "Nombre" },
      { kind: "text", key: "lastName", label: "Apellido" },
      { kind: "text", key: "status", label: "Estado", placeholder: "lead, active…" },
      { kind: "text", key: "tags", label: "Etiquetas a agregar", placeholder: "web, interesado", help: "Separadas por coma; se suman a las existentes." },
      { kind: "keyvalue", key: "customData", label: "Campos personalizados", keyPlaceholder: "clave del campo", valuePlaceholder: "valor" },
      {
        kind: "select",
        key: "mode",
        label: "Modo",
        options: [
          { value: "upsert", label: "Crear o actualizar" },
          { value: "create_only", label: "Solo crear si no existe" },
          { value: "update_only", label: "Solo actualizar si existe" },
        ],
      },
    ],
    defaults: { label: "Crear o actualizar contacto", mode: "upsert" },
  },
  {
    type: "contact_find",
    label: "Buscar contacto",
    description: "Devuelve el contacto que coincide con un teléfono o email",
    category: "crm",
    icon: UserSearch,
    accent: "bg-teal-500",
    outputs: "default",
    fields: [
      { kind: "text", key: "phone", label: "Teléfono", placeholder: "{{trigger.body.phone}}" },
      { kind: "text", key: "email", label: "Email", placeholder: "{{trigger.body.email}}" },
    ],
    defaults: { label: "Buscar contacto" },
  },
];

export const NODE_BY_TYPE: Record<string, NodeDef> = Object.fromEntries(
  NODE_CATALOG.map((n) => [n.type, n]),
);

export const CATEGORY_LABELS: Record<NodeCategory, string> = {
  trigger: "Disparadores",
  logic: "Lógica",
  integration: "Integraciones",
  crm: "CRM",
};

export const CRON_PRESETS: { label: string; value: string }[] = [
  { label: "Cada minuto", value: "* * * * *" },
  { label: "Cada hora", value: "0 * * * *" },
  { label: "Diario 9:00", value: "0 9 * * *" },
  { label: "Lun-Vie 9:00", value: "0 9 * * 1-5" },
  { label: "Lunes 8:00", value: "0 8 * * 1" },
  { label: "Día 1 de mes", value: "0 9 1 * *" },
];

export const CONDITION_OPERATORS: { value: string; label: string; unary?: boolean }[] = [
  { value: "equals", label: "es igual a" },
  { value: "not_equals", label: "no es igual a" },
  { value: "contains", label: "contiene" },
  { value: "not_contains", label: "no contiene" },
  { value: "starts_with", label: "empieza con" },
  { value: "ends_with", label: "termina con" },
  { value: "regex", label: "coincide con regex" },
  { value: "gt", label: "es mayor que" },
  { value: "gte", label: "es mayor o igual que" },
  { value: "lt", label: "es menor que" },
  { value: "lte", label: "es menor o igual que" },
  { value: "is_set", label: "tiene valor", unary: true },
  { value: "is_not_set", label: "está vacío", unary: true },
  { value: "is_true", label: "es verdadero", unary: true },
  { value: "is_false", label: "es falso", unary: true },
];
