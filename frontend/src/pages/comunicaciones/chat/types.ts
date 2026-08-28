export interface Inbox {
  id: string;
  name: string;
  channel: string;
  status: string;
  channelName: string | null;
}

export interface Conversation {
  id: string;
  inboxId: string;
  contactId: string;
  contactName: string | null;
  lastMessage: string | null;
  lastMessageAt: string | null;
  lastMessageSource?: string | null;
  hasAdTracking?: boolean;
  adPlatform?: string | null;
  unreadCount: number;
  labelIds?: string[];
  botStatus?: string;
  status?: string;
  inbox?: {
    id: string;
    name: string;
    channel: string;
  } | null;
  record?: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    phone: string | null;
    assignedTo?: string | null;
  } | null;
}

export interface Message {
  id: string;
  conversationId: string;
  direction: string;
  messageType: string;
  content: string | null;
  mediaUrl?: string | null;
  mediaMimeType?: string | null;
  status: string;
  createdAt: string;
  externalId?: string | null;
  replyToExternalId?: string | null;
  sender?: {
    id: string;
    name: string;
    avatarPath: string | null;
  } | null;
}

export interface Label {
  id: string;
  slug: string;
  label: string;
  description: string | null;
  color: string;
  showInSidebar: boolean;
}

export interface TenantMember {
  userId: string;
  user: { id: string; name: string; email: string };
}

export const STATUS_OPTIONS = [
  { value: "lead", label: "Lead", color: "bg-blue-500" },
  { value: "contactado", label: "Contactado", color: "bg-sky-500" },
  { value: "interesado", label: "Interesado", color: "bg-indigo-500" },
  { value: "oportunidad", label: "Oportunidad", color: "bg-amber-500" },
  { value: "cliente", label: "Cliente", color: "bg-green-500" },
  { value: "premium", label: "Premium", color: "bg-purple-500" },
  { value: "fidelizado", label: "Fidelizado", color: "bg-emerald-500" },
  { value: "inactivo", label: "Inactivo", color: "bg-gray-400" },
  { value: "perdido", label: "Perdido", color: "bg-red-500" },
] as const;

// Estado propio de la conversación (open | resolved | archived)
export const CONVERSATION_STATUS_OPTIONS = [
  { value: "open", label: "Abierta", color: "bg-green-500" },
  { value: "resolved", label: "Resuelta", color: "bg-gray-400" },
  { value: "archived", label: "Archivada", color: "bg-amber-500" },
] as const;

// Normaliza el estado de la conversación tratando 'closed' (legado) como 'resolved'
export function normalizeConvStatus(status?: string): string {
  if (!status) return "open";
  if (status === "closed") return "resolved";
  return status;
}

export function getDisplayName(conv: Conversation): string {
  if (conv.record) {
    const parts = [conv.record.firstName, conv.record.lastName].filter(Boolean);
    if (parts.length > 0) return parts.join(" ");
  }
  return conv.contactName || conv.contactId;
}
