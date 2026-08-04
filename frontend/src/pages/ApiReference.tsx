import { useState } from "react";
import { ChevronRight, ChevronDown, Copy, CheckCircle2, Play, X, Loader2 } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import logo from "@/assets/logo.svg";

interface EndpointDef {
  id: string;
  method: string;
  label: string;
  path: string;
  description: string;
  params?: Array<{ name: string; type: string; required?: boolean; description: string }>;
  body?: string;
  bodyDescription?: string;
  response?: string;
  curl?: string;
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
          {
            id: "list-contacts",
            method: "GET",
            label: "Listar contactos",
            path: "/api/v1/{cuenta}/records",
            description: "Lista todos los contactos de la cuenta con paginación. Retorna un array de contactos junto con el total para facilitar la navegación entre páginas.",
            params: [
              { name: "page", type: "integer", description: "Número de página (default: 1)" },
              { name: "limit", type: "integer", description: "Registros por página, máximo 100 (default: 50)" },
              { name: "sortBy", type: "string", description: "Campo para ordenar: firstName, lastName, email, phone, status, createdAt, score" },
              { name: "sortOrder", type: "ASC|DESC", description: "Dirección del orden (default: DESC por createdAt)" },
            ],
            curl: `const response = await fetch(
  "https://crm.strategee.us/api/v1/supergiros/records?page=1&limit=25&sortBy=createdAt&sortOrder=DESC",
  {
    method: "GET",
    headers: {
      "x-api-token": "tu_token_de_api"
    }
  }
);

const data = await response.json();`,
            response: `{
  "data": [
    {
      "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
      "firstName": "Juan",
      "lastName": "Pérez",
      "fullName": "Juan Pérez",
      "phone": "573001234567",
      "countryCode": "+57",
      "email": "juan@ejemplo.com",
      "documentType": "CC",
      "documentNumber": "1234567890",
      "gender": "male",
      "birthDate": "1990-05-15",
      "city": "Bogotá",
      "region": "Cundinamarca",
      "status": "active",
      "channelSource": "api",
      "source": "landing-page",
      "score": 75,
      "optInWhatsapp": true,
      "optInEmail": true,
      "assignedTo": null,
      "tags": ["vip", "premium"],
      "customData": {
        "empresa": "Acme Corp",
        "cargo": "Director"
      },
      "lastContactAt": "2026-08-01T14:30:00.000Z",
      "lastActivityAt": "2026-08-03T09:15:00.000Z",
      "createdAt": "2026-07-15T10:00:00.000Z",
      "updatedAt": "2026-08-03T09:15:00.000Z"
    }
  ],
  "total": 1523
}`,
          },
          {
            id: "get-contact",
            method: "GET",
            label: "Obtener contacto",
            path: "/api/v1/{cuenta}/records/{id}",
            description: "Obtiene toda la información de un contacto específico por su ID. Incluye campos del sistema, datos personalizados y etiquetas.",
            params: [
              { name: "id", type: "uuid", required: true, description: "ID único del contacto" },
            ],
            curl: `const response = await fetch(
  "https://crm.strategee.us/api/v1/supergiros/records/a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  {
    method: "GET",
    headers: {
      "x-api-token": "tu_token_de_api"
    }
  }
);

const contact = await response.json();`,
            response: `{
  "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "firstName": "Juan",
  "lastName": "Pérez",
  "fullName": "Juan Pérez",
  "phone": "573001234567",
  "countryCode": "+57",
  "email": "juan@ejemplo.com",
  "documentType": "CC",
  "documentNumber": "1234567890",
  "gender": "male",
  "birthDate": "1990-05-15",
  "city": "Bogotá",
  "region": "Cundinamarca",
  "status": "active",
  "channelSource": "api",
  "source": "landing-page",
  "score": 75,
  "optInWhatsapp": true,
  "optInEmail": true,
  "assignedTo": null,
  "tags": ["vip", "premium"],
  "customData": {
    "empresa": "Acme Corp",
    "cargo": "Director"
  },
  "lastContactAt": "2026-08-01T14:30:00.000Z",
  "lastActivityAt": "2026-08-03T09:15:00.000Z",
  "createdAt": "2026-07-15T10:00:00.000Z",
  "updatedAt": "2026-08-03T09:15:00.000Z"
}`,
          },
          {
            id: "create-contact",
            method: "POST",
            label: "Crear contacto",
            path: "/api/v1/{cuenta}/records",
            description: "Crea un nuevo contacto en la cuenta. Solo firstName o phone son suficientes para crear un registro. Los campos personalizados se envían en el objeto customData.",
            bodyDescription: "Todos los campos son opcionales excepto que al menos uno de firstName, lastName, phone o email debe estar presente.",
            body: `{
  "firstName": "María",
  "lastName": "García",
  "phone": "573009876543",
  "countryCode": "+57",
  "email": "maria@ejemplo.com",
  "documentType": "CC",
  "documentNumber": "9876543210",
  "gender": "female",
  "birthDate": "1985-03-20",
  "city": "Medellín",
  "region": "Antioquia",
  "status": "active",
  "source": "api-integracion",
  "score": 50,
  "optInWhatsapp": true,
  "optInEmail": true,
  "tags": ["nuevo", "web"],
  "customData": {
    "empresa": "Tech Solutions",
    "plan": "premium",
    "referido_por": "Juan Pérez"
  }
}`,
            curl: `const response = await fetch(
  "https://crm.strategee.us/api/v1/supergiros/records",
  {
    method: "POST",
    headers: {
      "x-api-token": "tu_token_de_api",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      firstName: "María",
      lastName: "García",
      phone: "573009876543",
      email: "maria@ejemplo.com",
      status: "active",
      tags: ["nuevo"],
      customData: { empresa: "Tech Solutions" }
    })
  }
);

const newContact = await response.json();`,
            response: `{
  "id": "f7e8d9c0-b1a2-3456-7890-abcdef123456",
  "firstName": "María",
  "lastName": "García",
  "fullName": null,
  "phone": "573009876543",
  "countryCode": "+57",
  "email": "maria@ejemplo.com",
  "documentType": "CC",
  "documentNumber": "9876543210",
  "gender": "female",
  "birthDate": "1985-03-20",
  "city": "Medellín",
  "region": "Antioquia",
  "status": "active",
  "channelSource": "api",
  "source": "api-integracion",
  "score": 50,
  "optInWhatsapp": true,
  "optInEmail": true,
  "tags": ["nuevo", "web"],
  "customData": {
    "empresa": "Tech Solutions",
    "plan": "premium",
    "referido_por": "Juan Pérez"
  },
  "createdAt": "2026-08-04T15:30:00.000Z",
  "updatedAt": "2026-08-04T15:30:00.000Z"
}`,
          },
          {
            id: "update-contact",
            method: "PUT",
            label: "Actualizar contacto",
            path: "/api/v1/{cuenta}/records/{id}",
            description: "Actualiza uno o más campos de un contacto existente. Solo envía los campos que deseas modificar; los demás se mantienen sin cambios.",
            bodyDescription: "Envía únicamente los campos que deseas actualizar.",
            params: [
              { name: "id", type: "uuid", required: true, description: "ID único del contacto a actualizar" },
            ],
            body: `{
  "firstName": "María José",
  "city": "Bogotá",
  "score": 85,
  "tags": ["vip", "premium", "leal"],
  "customData": {
    "empresa": "Tech Solutions",
    "plan": "enterprise",
    "nps": 9
  }
}`,
            curl: `const response = await fetch(
  "https://crm.strategee.us/api/v1/supergiros/records/f7e8d9c0-b1a2-3456-7890-abcdef123456",
  {
    method: "PUT",
    headers: {
      "x-api-token": "tu_token_de_api",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      firstName: "María José",
      city: "Bogotá",
      score: 85,
      tags: ["vip", "premium", "leal"]
    })
  }
);

const updated = await response.json();`,
            response: `{
  "id": "f7e8d9c0-b1a2-3456-7890-abcdef123456",
  "firstName": "María José",
  "lastName": "García",
  "phone": "573009876543",
  "email": "maria@ejemplo.com",
  "city": "Bogotá",
  "region": "Antioquia",
  "status": "active",
  "score": 85,
  "tags": ["vip", "premium", "leal"],
  "customData": {
    "empresa": "Tech Solutions",
    "plan": "enterprise",
    "nps": 9
  },
  "updatedAt": "2026-08-04T16:00:00.000Z"
}`,
          },
          {
            id: "delete-contact",
            method: "DELETE",
            label: "Eliminar contacto",
            path: "/api/v1/{cuenta}/records/{id}",
            description: "Elimina un contacto permanentemente. Esta acción no se puede deshacer. Se eliminará toda la información del contacto incluyendo su historial de actividad.",
            params: [
              { name: "id", type: "uuid", required: true, description: "ID único del contacto a eliminar" },
            ],
            curl: `const response = await fetch(
  "https://crm.strategee.us/api/v1/supergiros/records/f7e8d9c0-b1a2-3456-7890-abcdef123456",
  {
    method: "DELETE",
    headers: {
      "x-api-token": "tu_token_de_api"
    }
  }
);

const result = await response.json();`,
            response: `{
  "message": "Contacto eliminado correctamente"
}`,
          },
        ],
      },
      {
        id: "conversations", label: "Conversaciones", endpoints: [
          {
            id: "list-conversations",
            method: "GET",
            label: "Listar conversaciones",
            path: "/api/v1/{cuenta}/conversations",
            description: "Lista todas las conversaciones de la cuenta con paginación. Incluye información del inbox, contacto vinculado y etiquetas asignadas.",
            params: [
              { name: "inboxId", type: "uuid", description: "Filtrar por bandeja específica" },
              { name: "limit", type: "integer", description: "Registros por página, máximo 100 (default: 15)" },
              { name: "offset", type: "integer", description: "Desplazamiento para paginación (default: 0)" },
            ],
            curl: `const response = await fetch(
  "https://crm.strategee.us/api/v1/supergiros/conversations?limit=15&offset=0",
  {
    method: "GET",
    headers: {
      "x-api-token": "tu_token_de_api"
    }
  }
);

const data = await response.json();`,
            response: `{
  "data": [
    {
      "id": "c1d2e3f4-a5b6-7890-cdef-1234567890ab",
      "inboxId": "i1j2k3l4-m5n6-7890-opqr-stuvwxyz1234",
      "inbox": {
        "id": "i1j2k3l4-m5n6-7890-opqr-stuvwxyz1234",
        "name": "WhatsApp Principal",
        "channel": "whatsapp",
        "channelName": "+57 300 123 4567"
      },
      "contactId": "573001234567",
      "contactName": "Juan Pérez",
      "contactAvatar": null,
      "record": {
        "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
        "firstName": "Juan",
        "lastName": "Pérez",
        "phone": "573001234567",
        "email": "juan@ejemplo.com"
      },
      "status": "open",
      "lastMessage": "Hola, necesito ayuda con mi pedido",
      "lastMessageAt": "2026-08-04T14:30:00.000Z",
      "unreadCount": 2,
      "labels": [
        {
          "id": "l1m2n3o4-p5q6-7890-rstu-vwxyz1234567",
          "slug": "urgente",
          "label": "Urgente",
          "color": "#ef4444"
        },
        {
          "id": "l2m3n4o5-p6q7-8901-rstu-vwxyz2345678",
          "slug": "vip",
          "label": "VIP",
          "color": "#8b5cf6"
        }
      ],
      "createdAt": "2026-07-20T08:00:00.000Z",
      "updatedAt": "2026-08-04T14:30:00.000Z"
    }
  ],
  "total": 45
}`,
          },
          {
            id: "get-conversation",
            method: "GET",
            label: "Obtener conversación",
            path: "/api/v1/{cuenta}/conversations/{id}",
            description: "Obtiene todos los detalles de una conversación específica incluyendo inbox, contacto y etiquetas.",
            params: [
              { name: "id", type: "uuid", required: true, description: "ID de la conversación" },
            ],
            curl: `const response = await fetch(
  "https://crm.strategee.us/api/v1/supergiros/conversations/c1d2e3f4-a5b6-7890-cdef-1234567890ab",
  {
    method: "GET",
    headers: {
      "x-api-token": "tu_token_de_api"
    }
  }
);

const conversation = await response.json();`,
            response: `{
  "id": "c1d2e3f4-a5b6-7890-cdef-1234567890ab",
  "inboxId": "i1j2k3l4-m5n6-7890-opqr-stuvwxyz1234",
  "inbox": {
    "id": "i1j2k3l4-m5n6-7890-opqr-stuvwxyz1234",
    "name": "WhatsApp Principal",
    "channel": "whatsapp",
    "channelName": "+57 300 123 4567"
  },
  "contactId": "573001234567",
  "contactName": "Juan Pérez",
  "contactAvatar": null,
  "record": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "firstName": "Juan",
    "lastName": "Pérez",
    "phone": "573001234567",
    "email": "juan@ejemplo.com"
  },
  "status": "open",
  "lastMessage": "Hola, necesito ayuda",
  "lastMessageAt": "2026-08-04T14:30:00.000Z",
  "unreadCount": 2,
  "labels": [
    {
      "id": "l1m2n3o4-p5q6-7890-rstu-vwxyz1234567",
      "slug": "urgente",
      "label": "Urgente",
      "color": "#ef4444"
    }
  ],
  "createdAt": "2026-07-20T08:00:00.000Z",
  "updatedAt": "2026-08-04T14:30:00.000Z"
}`,
          },
          {
            id: "toggle-label",
            method: "POST",
            label: "Modificar etiquetas",
            path: "/api/v1/{cuenta}/conversations/{id}/labels",
            description: "Agrega o quita una etiqueta de una conversación. Solo usuarios administradores pueden modificar etiquetas.",
            params: [
              { name: "id", type: "uuid", required: true, description: "ID de la conversación" },
            ],
            body: `{
  "labelId": "l1m2n3o4-p5q6-7890-rstu-vwxyz1234567",
  "action": "add"
}`,
            bodyDescription: "action puede ser 'add' para agregar o 'remove' para quitar la etiqueta.",
            curl: `const response = await fetch(
  "https://crm.strategee.us/api/v1/supergiros/conversations/c1d2e3f4-a5b6-7890-cdef-1234567890ab/labels",
  {
    method: "POST",
    headers: {
      "x-api-token": "tu_token_de_api",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      labelId: "l1m2n3o4-p5q6-7890-rstu-vwxyz1234567",
      action: "add"
    })
  }
);

const result = await response.json();`,
            response: `{
  "labels": [
    {
      "id": "l1m2n3o4-p5q6-7890-rstu-vwxyz1234567",
      "slug": "urgente",
      "label": "Urgente",
      "description": "Requiere atención inmediata",
      "color": "#ef4444",
      "showInSidebar": true
    },
    {
      "id": "l2m3n4o5-p6q7-8901-rstu-vwxyz2345678",
      "slug": "vip",
      "label": "VIP",
      "description": null,
      "color": "#8b5cf6",
      "showInSidebar": false
    }
  ]
}`,
          },
          {
            id: "mark-read",
            method: "POST",
            label: "Marcar como leída",
            path: "/api/v1/{cuenta}/conversations/{id}/read",
            description: "Marca una conversación como leída, poniendo el contador de mensajes no leídos en 0.",
            params: [
              { name: "id", type: "uuid", required: true, description: "ID de la conversación" },
            ],
            curl: `const response = await fetch(
  "https://crm.strategee.us/api/v1/supergiros/conversations/c1d2e3f4-a5b6-7890-cdef-1234567890ab/read",
  {
    method: "POST",
    headers: {
      "x-api-token": "tu_token_de_api"
    }
  }
);

const result = await response.json();`,
            response: `{
  "success": true
}`,
          },
          {
            id: "delete-conversation",
            method: "DELETE",
            label: "Eliminar conversación",
            path: "/api/v1/{cuenta}/conversations/{id}",
            description: "Elimina una conversación y todos sus mensajes permanentemente. Solo administradores. Esta acción no se puede deshacer.",
            params: [
              { name: "id", type: "uuid", required: true, description: "ID de la conversación" },
            ],
            curl: `const response = await fetch(
  "https://crm.strategee.us/api/v1/supergiros/conversations/c1d2e3f4-a5b6-7890-cdef-1234567890ab",
  {
    method: "DELETE",
    headers: {
      "x-api-token": "tu_token_de_api"
    }
  }
);

const result = await response.json();`,
            response: `{
  "message": "Conversación eliminada correctamente"
}`,
          },
        ],
      },
      {
        id: "messages", label: "Mensajes", endpoints: [
          {
            id: "list-messages",
            method: "GET",
            label: "Listar mensajes",
            path: "/api/v1/{cuenta}/conversations/{conversationId}/messages",
            description: "Lista los mensajes de una conversación con paginación basada en cursor. Los mensajes se retornan en orden cronológico (más antiguos primero).",
            params: [
              { name: "conversationId", type: "uuid", required: true, description: "ID de la conversación" },
              { name: "limit", type: "integer", description: "Mensajes por página, máximo 100 (default: 50)" },
              { name: "before", type: "uuid", description: "ID del mensaje más antiguo para cargar mensajes anteriores (cursor)" },
            ],
            curl: `const response = await fetch(
  "https://crm.strategee.us/api/v1/supergiros/conversations/c1d2e3f4-uuid/messages?limit=50",
  {
    method: "GET",
    headers: {
      "x-api-token": "tu_token_de_api"
    }
  }
);

const data = await response.json();`,
            response: `{
  "data": [
    {
      "id": "m1a2b3c4-d5e6-7890-abcd-ef1234567890",
      "conversationId": "c1d2e3f4-a5b6-7890-cdef-1234567890ab",
      "direction": "inbound",
      "messageType": "text",
      "content": "Hola, necesito ayuda con mi pedido",
      "mediaUrl": null,
      "mediaMimeType": null,
      "status": "delivered",
      "senderId": null,
      "sender": null,
      "externalId": "wamid.abc123",
      "replyToExternalId": null,
      "createdAt": "2026-08-04T14:25:00.000Z"
    },
    {
      "id": "m2b3c4d5-e6f7-8901-bcde-f23456789012",
      "conversationId": "c1d2e3f4-a5b6-7890-cdef-1234567890ab",
      "direction": "outbound",
      "messageType": "text",
      "content": "Claro, con gusto te ayudo. ¿Cuál es tu número de pedido?",
      "mediaUrl": null,
      "mediaMimeType": null,
      "status": "delivered",
      "senderId": "u1v2w3x4-y5z6-7890-abcd-ef1234567890",
      "sender": {
        "id": "u1v2w3x4-y5z6-7890-abcd-ef1234567890",
        "name": "María García"
      },
      "externalId": "wamid.def456",
      "replyToExternalId": null,
      "createdAt": "2026-08-04T14:27:00.000Z"
    }
  ],
  "hasMore": true
}`,
          },
          {
            id: "get-message",
            method: "GET",
            label: "Obtener mensaje",
            path: "/api/v1/{cuenta}/conversations/{conversationId}/messages/{id}",
            description: "Obtiene un mensaje específico por su ID, incluyendo información del agente que lo envió.",
            params: [
              { name: "conversationId", type: "uuid", required: true, description: "ID de la conversación" },
              { name: "id", type: "uuid", required: true, description: "ID del mensaje" },
            ],
            curl: `const response = await fetch(
  "https://crm.strategee.us/api/v1/supergiros/conversations/c1d2e3f4-uuid/messages/m1a2b3c4-uuid",
  {
    method: "GET",
    headers: {
      "x-api-token": "tu_token_de_api"
    }
  }
);

const message = await response.json();`,
            response: `{
  "id": "m1a2b3c4-d5e6-7890-abcd-ef1234567890",
  "conversationId": "c1d2e3f4-a5b6-7890-cdef-1234567890ab",
  "direction": "outbound",
  "messageType": "text",
  "content": "Claro, con gusto te ayudo.",
  "mediaUrl": null,
  "mediaMimeType": null,
  "status": "delivered",
  "senderId": "u1v2w3x4-y5z6-7890-abcd-ef1234567890",
  "sender": {
    "id": "u1v2w3x4-y5z6-7890-abcd-ef1234567890",
    "name": "María García"
  },
  "externalId": "wamid.def456",
  "replyToExternalId": null,
  "createdAt": "2026-08-04T14:27:00.000Z"
}`,
          },
          {
            id: "send-message",
            method: "POST",
            label: "Enviar mensaje",
            path: "/api/v1/{cuenta}/conversations/{conversationId}/messages",
            description: "Envía un mensaje de texto en una conversación. Solo administradores. El mensaje se envía al contacto a través del canal configurado (WhatsApp, Messenger, etc.).",
            params: [
              { name: "conversationId", type: "uuid", required: true, description: "ID de la conversación" },
            ],
            body: `{
  "content": "Hola, ¿cómo te puedo ayudar?",
  "messageType": "text",
  "replyToExternalId": "wamid.abc123"
}`,
            bodyDescription: "messageType es opcional (default: 'text'). replyToExternalId es opcional para responder a un mensaje específico.",
            curl: `const response = await fetch(
  "https://crm.strategee.us/api/v1/supergiros/conversations/c1d2e3f4-uuid/messages",
  {
    method: "POST",
    headers: {
      "x-api-token": "tu_token_de_api",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      content: "Hola, ¿cómo te puedo ayudar?",
      messageType: "text"
    })
  }
);

const message = await response.json();`,
            response: `{
  "id": "m3c4d5e6-f7g8-9012-cdef-345678901234",
  "conversationId": "c1d2e3f4-a5b6-7890-cdef-1234567890ab",
  "direction": "outbound",
  "messageType": "text",
  "content": "Hola, ¿cómo te puedo ayudar?",
  "status": "sent",
  "senderId": "u1v2w3x4-y5z6-7890-abcd-ef1234567890",
  "createdAt": "2026-08-04T15:00:00.000Z"
}`,
          },
          {
            id: "create-note",
            method: "POST",
            label: "Crear nota privada",
            path: "/api/v1/{cuenta}/conversations/{conversationId}/messages/note",
            description: "Crea una nota privada visible solo para el equipo, no se envía al contacto. Solo administradores.",
            params: [
              { name: "conversationId", type: "uuid", required: true, description: "ID de la conversación" },
            ],
            body: `{
  "content": "Cliente VIP, dar prioridad en la atención"
}`,
            curl: `const response = await fetch(
  "https://crm.strategee.us/api/v1/supergiros/conversations/c1d2e3f4-uuid/messages/note",
  {
    method: "POST",
    headers: {
      "x-api-token": "tu_token_de_api",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      content: "Cliente VIP, dar prioridad en la atención"
    })
  }
);

const note = await response.json();`,
            response: `{
  "id": "m4d5e6f7-g8h9-0123-defg-456789012345",
  "conversationId": "c1d2e3f4-a5b6-7890-cdef-1234567890ab",
  "direction": "outbound",
  "messageType": "note",
  "content": "Cliente VIP, dar prioridad en la atención",
  "status": "delivered",
  "senderId": "u1v2w3x4-y5z6-7890-abcd-ef1234567890",
  "createdAt": "2026-08-04T15:05:00.000Z"
}`,
          },
        ],
      },
      {
        id: "inboxes", label: "Bandejas", endpoints: [
          {
            id: "list-inboxes",
            method: "GET",
            label: "Listar bandejas",
            path: "/api/v1/{cuenta}/inboxes",
            description: "Lista todas las bandejas (canales) configuradas en la cuenta. Incluye nombre, tipo de canal y estado de conexión.",
            curl: `const response = await fetch(
  "https://crm.strategee.us/api/v1/supergiros/inboxes",
  {
    method: "GET",
    headers: {
      "x-api-token": "tu_token_de_api"
    }
  }
);

const data = await response.json();`,
            response: `{
  "data": [
    {
      "id": "i1j2k3l4-m5n6-7890-opqr-stuvwxyz1234",
      "name": "WhatsApp Principal",
      "channel": "whatsapp",
      "status": "connected",
      "channelName": "+57 300 123 4567",
      "phoneNumberId": "123456789012345",
      "createdAt": "2026-06-01T10:00:00.000Z"
    },
    {
      "id": "i2j3k4l5-m6n7-8901-opqr-stuvwxyz2345",
      "name": "Instagram",
      "channel": "instagram",
      "status": "connected",
      "channelName": "@mi_negocio",
      "phoneNumberId": null,
      "createdAt": "2026-07-15T08:00:00.000Z"
    }
  ]
}`,
          },
          {
            id: "get-inbox",
            method: "GET",
            label: "Obtener bandeja",
            path: "/api/v1/{cuenta}/inboxes/{id}",
            description: "Obtiene el detalle completo de una bandeja específica incluyendo metadata del canal.",
            params: [
              { name: "id", type: "uuid", required: true, description: "ID de la bandeja" },
            ],
            curl: `const response = await fetch(
  "https://crm.strategee.us/api/v1/supergiros/inboxes/i1j2k3l4-m5n6-7890-opqr-stuvwxyz1234",
  {
    method: "GET",
    headers: {
      "x-api-token": "tu_token_de_api"
    }
  }
);

const inbox = await response.json();`,
            response: `{
  "id": "i1j2k3l4-m5n6-7890-opqr-stuvwxyz1234",
  "name": "WhatsApp Principal",
  "channel": "whatsapp",
  "status": "connected",
  "channelName": "+57 300 123 4567",
  "phoneNumberId": "123456789012345",
  "pageId": null,
  "wabaId": "109876543210",
  "metadata": {
    "profilePicture": "https://...",
    "about": "Somos SuperGiros"
  },
  "createdAt": "2026-06-01T10:00:00.000Z",
  "updatedAt": "2026-08-01T12:00:00.000Z"
}`,
          },
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

function CodeBlock({ code, title }: { code: string; title?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  return (
    <div className="relative rounded-lg bg-[#1e1e2e] text-gray-100 text-[11px] font-mono overflow-x-auto">
      {title && (
        <div className="px-4 py-2 border-b border-white/10 flex items-center justify-between">
          <span className="text-[10px] text-gray-400 uppercase tracking-wide font-medium">{title}</span>
        </div>
      )}
      <button onClick={copy} className="absolute top-2 right-2 p-1 rounded hover:bg-white/10 text-gray-500 hover:text-gray-300">
        {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
      <pre className="p-4 leading-relaxed text-green-300">{code}</pre>
    </div>
  );
}

function ResponseCard({ endpoint }: { endpoint: EndpointDef }) {
  const [activeTab, setActiveTab] = useState<"200" | "error">("200");
  const [copied, setCopied] = useState(false);

  const errorResponse = endpoint.method === "DELETE"
    ? `{\n  "statusCode": 404,\n  "message": "Contacto no encontrado",\n  "error": "Not Found"\n}`
    : `{\n  "statusCode": 403,\n  "message": "No tienes acceso a esta cuenta",\n  "error": "Forbidden"\n}`;

  const currentCode = activeTab === "200" ? (endpoint.response || "{}") : errorResponse;

  const copy = () => {
    navigator.clipboard.writeText(currentCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="sticky top-5 bg-[#1e1e2e] rounded-xl shadow-xl overflow-hidden">
      {/* Tabs header */}
      <div className="flex items-center justify-between px-4 pt-3 pb-0 border-b border-white/10">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setActiveTab("200")}
            className={`text-xs font-medium pb-2 border-b-2 transition-colors ${
              activeTab === "200"
                ? "text-blue-400 border-blue-400"
                : "text-gray-500 border-transparent hover:text-gray-300"
            }`}
          >
            200
          </button>
          <button
            onClick={() => setActiveTab("error")}
            className={`text-xs font-medium pb-2 border-b-2 transition-colors ${
              activeTab === "error"
                ? "text-blue-400 border-blue-400"
                : "text-gray-500 border-transparent hover:text-gray-300"
            }`}
          >
            {endpoint.method === "DELETE" ? "404" : "403"}
          </button>
        </div>
        <button
          onClick={copy}
          className="p-1.5 rounded-lg border border-white/10 hover:bg-white/5 text-gray-500 hover:text-gray-300 transition-colors mb-2"
        >
          {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>

      {/* JSON Content */}
      <div className="px-5 py-4 overflow-y-auto max-h-[70vh]">
        <pre className="text-[12px] font-mono leading-relaxed whitespace-pre-wrap text-green-300">{currentCode}</pre>
      </div>
    </div>
  );
}

export function ApiReference() {
  const [active, setActive] = useState("introduction");
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["contacts"]));
  const [tryItEndpoint, setTryItEndpoint] = useState<EndpointDef | null>(null);
  const [urlCopied, setUrlCopied] = useState(false);

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
          <div className="max-w-3xl mx-auto px-8 py-10 space-y-8">
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
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Estructura de URLs</h3>
              <p className="text-sm text-gray-600 mb-3">Todos los endpoints de la API v1 siguen esta estructura:</p>
              <CodeBlock code={`/api/v1/{cuenta}/recurso\n\nEjemplos:\n  GET  /api/v1/supergiros/records        → Lista contactos de "supergiros"\n  POST /api/v1/mi-empresa/records         → Crea contacto en "mi-empresa"\n  GET  /api/v1/supergiros/records/{id}    → Obtiene un contacto específico`} />
              <p className="text-xs text-gray-500 mt-3">El <code className="bg-gray-100 px-1.5 py-0.5 rounded">{"{cuenta}"}</code> es el slug de la cuenta (lo ves en la URL cuando navegas la plataforma). Tu token solo funcionará en cuentas donde tengas rol activo.</p>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Códigos de respuesta</h3>
              <div className="space-y-1.5 text-sm">
                <div className="p-2.5 rounded bg-gray-50 flex items-center gap-3"><code className="text-green-600 text-xs font-bold w-8">200</code><span className="text-gray-600 text-xs">Operación exitosa</span></div>
                <div className="p-2.5 rounded bg-gray-50 flex items-center gap-3"><code className="text-green-600 text-xs font-bold w-8">201</code><span className="text-gray-600 text-xs">Recurso creado correctamente</span></div>
                <div className="p-2.5 rounded bg-gray-50 flex items-center gap-3"><code className="text-amber-600 text-xs font-bold w-8">401</code><span className="text-gray-600 text-xs">Token inválido o no proporcionado</span></div>
                <div className="p-2.5 rounded bg-gray-50 flex items-center gap-3"><code className="text-amber-600 text-xs font-bold w-8">403</code><span className="text-gray-600 text-xs">Sin permisos para esta cuenta o recurso</span></div>
                <div className="p-2.5 rounded bg-gray-50 flex items-center gap-3"><code className="text-red-600 text-xs font-bold w-8">404</code><span className="text-gray-600 text-xs">Recurso no encontrado</span></div>
                <div className="p-2.5 rounded bg-gray-50 flex items-center gap-3"><code className="text-red-600 text-xs font-bold w-8">500</code><span className="text-gray-600 text-xs">Error interno del servidor</span></div>
              </div>
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
          <div className="max-w-3xl mx-auto px-8 py-10 space-y-8">
            <div>
              <p className="text-xs text-brand-600 font-medium mb-1">Seguridad</p>
              <h1 className="text-2xl font-bold text-gray-900">Autenticación</h1>
              <p className="text-sm text-gray-600 mt-3 leading-relaxed">
                La API utiliza un <strong>token de API personal</strong> para autenticarte. Este token es fijo y único por usuario; lo puedes obtener y regenerar desde tu perfil en la plataforma.
              </p>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-sm text-amber-800">
                <strong>Importante:</strong> Tu token de API tiene los mismos permisos que tu usuario. Solo podrás acceder a cuentas donde tengas un rol activo (administrador o agente).
              </p>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-2">Obtener tu token</h3>
              <ol className="list-decimal list-inside space-y-2 text-sm text-gray-600">
                <li>Inicia sesión en la plataforma</li>
                <li>Ve a <strong>Perfil</strong> desde el menú de usuario</li>
                <li>En la sección <strong>"Token de API"</strong>, haz clic en el ícono de ojo para revelarlo</li>
                <li>Copia el token con el botón de copiar</li>
              </ol>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Enviar el token</h3>
              <p className="text-sm text-gray-600 mb-3">Puedes enviar tu token de dos formas:</p>

              <div className="space-y-4">
                <div>
                  <p className="text-xs font-medium text-gray-700 mb-2">Opción 1: Header <code className="bg-gray-100 px-1.5 py-0.5 rounded">x-api-token</code> (recomendado)</p>
                  <CodeBlock code={`const response = await fetch(
  "https://crm.strategee.us/api/v1/supergiros/records",
  {
    headers: {
      "x-api-token": "a1b2c3d4e5f6...tu_token_aqui"
    }
  }
);`} title="javascript" />
                </div>

                <div>
                  <p className="text-xs font-medium text-gray-700 mb-2">Opción 2: Header <code className="bg-gray-100 px-1.5 py-0.5 rounded">Authorization: Bearer</code></p>
                  <CodeBlock code={`const response = await fetch(
  "https://crm.strategee.us/api/v1/supergiros/records",
  {
    headers: {
      "Authorization": "Bearer a1b2c3d4e5f6...tu_token_aqui"
    }
  }
);`} title="javascript" />
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Respuesta de error de autenticación</h3>
              <p className="text-sm text-gray-600 mb-3">Si el token es inválido o no se proporciona:</p>
              <CodeBlock code={`// HTTP 401 Unauthorized\n{\n  "statusCode": 401,\n  "message": "Token de API inválido o usuario desactivado",\n  "error": "Unauthorized"\n}`} />
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Respuesta de error de permisos</h3>
              <p className="text-sm text-gray-600 mb-3">Si intentas acceder a una cuenta donde no tienes rol:</p>
              <CodeBlock code={`// HTTP 403 Forbidden\n{\n  "statusCode": 403,\n  "message": "No tienes acceso a esta cuenta",\n  "error": "Forbidden"\n}`} />
            </div>
          </div>
        )}

        {/* Endpoint detail view */}
        {currentEndpoint && (
          <div className="flex h-full">
            {/* Left: Documentation */}
            <div className="flex-1 overflow-y-auto px-10 py-12 border-r border-gray-100">
              <p className="text-sm text-brand-600 font-medium mb-2">{currentSection}</p>
              <h1 className="text-3xl font-bold text-gray-900 mb-3">{currentEndpoint.label}</h1>
              <p className="text-base text-gray-600 mb-8">{currentEndpoint.description}</p>

              {/* Endpoint badge */}
              <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-gray-200 bg-white mb-8">
                <span className={`text-xs px-2.5 py-1 rounded font-bold ${METHOD_BADGE[currentEndpoint.method]}`}>{currentEndpoint.method}</span>
                <code className="text-base text-gray-700 font-mono flex-1 ml-1 overflow-x-auto whitespace-nowrap">
                  {currentEndpoint.path.split(/(\{[^}]+\})/).map((part, i) =>
                    part.startsWith("{") ? <span key={i} className="mx-0.5 px-1.5 py-0.5 rounded bg-green-100 text-green-700 text-sm">{part}</span> : <span key={i}>{part}</span>
                  )}
                </code>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(window.location.origin + currentEndpoint!.path);
                    setUrlCopied(true);
                    setTimeout(() => setUrlCopied(false), 2000);
                  }}
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 border border-gray-200 transition-colors"
                >
                  {urlCopied ? <CheckCircle2 className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>

              {/* Parameters */}
              {currentEndpoint.params && currentEndpoint.params.length > 0 && (
                <div className="mb-8">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Parámetros</h3>
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    {currentEndpoint.params.map((p, i) => (
                      <div key={p.name} className={`flex items-baseline gap-3 px-4 py-3 ${i > 0 ? "border-t border-gray-100" : ""}`}>
                        <code className="text-sm text-brand-700 font-semibold min-w-[100px]">{p.name}</code>
                        <span className="text-xs text-gray-400 min-w-[60px]">{p.type}</span>
                        {p.required && <span className="text-xs px-2 py-0.5 rounded bg-red-50 text-red-600 font-medium">required</span>}
                        <span className="text-sm text-gray-600 ml-auto text-right">{p.description}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Request body */}
              {currentEndpoint.body && (
                <div className="mb-8">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Body</h3>
                  {currentEndpoint.bodyDescription && (
                    <p className="text-sm text-gray-500 mb-3">{currentEndpoint.bodyDescription}</p>
                  )}
                  <CodeBlock code={currentEndpoint.body} title="application/json" />
                </div>
              )}

              {/* cURL example */}
              {currentEndpoint.curl && (
                <div className="mb-8">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Ejemplo de petición</h3>
                  <CodeBlock code={currentEndpoint.curl} title="javascript" />
                </div>
              )}
            </div>

            {/* Right: Response example card */}
            <div className="w-[420px] shrink-0 p-5 hidden lg:block overflow-y-auto">
              <ResponseCard endpoint={currentEndpoint} />
            </div>
          </div>
        )}
      </main>

      {/* Try It Modal */}
      <AnimatePresence>
        {tryItEndpoint && (
          <TryItModal endpoint={tryItEndpoint} onClose={() => setTryItEndpoint(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}

function TryItModal({ endpoint, onClose }: { endpoint: EndpointDef; onClose: () => void }) {
  const [apiToken, setApiToken] = useState("");
  const [pathParams, setPathParams] = useState<Record<string, string>>(() => {
    const params: Record<string, string> = {};
    const matches = endpoint.path.matchAll(/\{(\w+)\}/g);
    for (const m of matches) {
      params[m[1]] = "";
    }
    return params;
  });
  const [queryParams, setQueryParams] = useState<Record<string, string>>(() => {
    const params: Record<string, string> = {};
    if (endpoint.params) {
      for (const p of endpoint.params) {
        if (!endpoint.path.includes(`{${p.name}}`)) {
          params[p.name] = "";
        }
      }
    }
    return params;
  });
  const [bodyContent, setBodyContent] = useState(endpoint.body || "");
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<{ status: number; body: string } | null>(null);

  function buildUrl(): string {
    let url = endpoint.path;
    for (const [key, value] of Object.entries(pathParams)) {
      url = url.replace(`{${key}}`, value || `{${key}}`);
    }
    const queryEntries = Object.entries(queryParams).filter(([, v]) => v.trim());
    if (queryEntries.length > 0) {
      url += "?" + queryEntries.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
    }
    return url;
  }

  async function handleSend() {
    if (!apiToken.trim()) return;
    setLoading(true);
    setResponse(null);

    const url = window.location.origin + buildUrl();
    const options: RequestInit = {
      method: endpoint.method,
      headers: {
        "x-api-token": apiToken,
        "Content-Type": "application/json",
      },
    };
    if (["POST", "PUT"].includes(endpoint.method) && bodyContent.trim()) {
      options.body = bodyContent;
    }

    try {
      const res = await fetch(url, options);
      const text = await res.text();
      let formatted = text;
      try { formatted = JSON.stringify(JSON.parse(text), null, 2); } catch {}
      setResponse({ status: res.status, body: formatted });
    } catch (err: any) {
      setResponse({ status: 0, body: `Error de red: ${err.message}` });
    } finally {
      setLoading(false);
    }
  }

  const pathParamKeys = Object.keys(pathParams);
  const queryParamKeys = Object.keys(queryParams);

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 z-50"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="fixed inset-4 z-50 flex items-start justify-center pt-8"
      >
        <div
          className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <span className={`text-xs px-2.5 py-1 rounded font-bold ${METHOD_BADGE[endpoint.method]}`}>{endpoint.method}</span>
              <h2 className="text-lg font-semibold text-gray-900">{endpoint.label}</h2>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleSend}
                disabled={loading || !apiToken.trim()}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-500 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 fill-current" />}
                Send
              </button>
              <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600">
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 min-h-0 flex overflow-hidden">
            {/* Left: Parameters */}
            <div className="flex-1 overflow-y-auto p-6 border-r border-gray-100 space-y-6">
              {/* URL preview */}
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">URL</p>
                <div className="px-3 py-2.5 rounded-lg bg-gray-50 border border-gray-200">
                  <code className="text-xs font-mono text-gray-700 break-all">
                    {endpoint.method} {buildUrl()}
                  </code>
                </div>
              </div>

              {/* Authorization */}
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Autenticación</p>
                <div>
                  <label className="text-xs font-medium text-gray-700 mb-1 block">
                    x-api-token <span className="text-red-500 text-[10px] font-medium ml-1">required</span>
                  </label>
                  <input
                    type="text"
                    value={apiToken}
                    onChange={(e) => setApiToken(e.target.value)}
                    placeholder="Pega tu token de API aquí"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none font-mono text-xs"
                  />
                </div>
              </div>

              {/* Path Parameters */}
              {pathParamKeys.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Path</p>
                  <div className="space-y-3">
                    {pathParamKeys.map((key) => (
                      <div key={key}>
                        <label className="text-xs font-medium text-gray-700 mb-1 flex items-center gap-2">
                          {key}
                          <span className="text-[10px] text-gray-400">string</span>
                          <span className="text-red-500 text-[10px] font-medium">required</span>
                        </label>
                        <input
                          type="text"
                          value={pathParams[key]}
                          onChange={(e) => setPathParams({ ...pathParams, [key]: e.target.value })}
                          placeholder={`Ingresa ${key}`}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Query Parameters */}
              {queryParamKeys.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Query</p>
                  <div className="space-y-3">
                    {queryParamKeys.map((key) => {
                      const paramDef = endpoint.params?.find((p) => p.name === key);
                      return (
                        <div key={key}>
                          <label className="text-xs font-medium text-gray-700 mb-1 flex items-center gap-2">
                            {key}
                            <span className="text-[10px] text-gray-400">{paramDef?.type || "string"}</span>
                            {paramDef?.required && <span className="text-red-500 text-[10px] font-medium">required</span>}
                          </label>
                          <input
                            type="text"
                            value={queryParams[key]}
                            onChange={(e) => setQueryParams({ ...queryParams, [key]: e.target.value })}
                            placeholder={paramDef?.description || `Ingresa ${key}`}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Request Body */}
              {["POST", "PUT"].includes(endpoint.method) && (
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Body</p>
                  <textarea
                    value={bodyContent}
                    onChange={(e) => setBodyContent(e.target.value)}
                    rows={12}
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-xs font-mono focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none resize-y leading-relaxed"
                    placeholder='{ "key": "value" }'
                  />
                </div>
              )}
            </div>

            {/* Right: Response */}
            <div className="w-[420px] shrink-0 flex flex-col bg-[#1e1e2e] overflow-hidden">
              <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between shrink-0">
                <span className="text-xs text-gray-300 font-medium">Respuesta</span>
                {response && (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                    response.status >= 200 && response.status < 300
                      ? "bg-green-500/20 text-green-400"
                      : response.status >= 400
                        ? "bg-red-500/20 text-red-400"
                        : "bg-gray-500/20 text-gray-400"
                  }`}>
                    {response.status || "Error"}
                  </span>
                )}
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-4">
                {!response && !loading && (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-xs text-gray-500 text-center">
                      Completa los parámetros y presiona <strong className="text-green-400">Send</strong> para probar
                    </p>
                  </div>
                )}
                {loading && (
                  <div className="flex items-center justify-center h-full">
                    <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
                  </div>
                )}
                {response && (
                  <pre className="text-[11px] font-mono leading-relaxed whitespace-pre-wrap text-green-300">{response.body}</pre>
                )}
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </>
  );
}
