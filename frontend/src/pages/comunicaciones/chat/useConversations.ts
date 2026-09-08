import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useSocket } from "@/hooks/useSocket";
import { chatApi } from "./api";
import type { Inbox, Conversation, Message, Label, TenantMember, AssignmentFilter } from "./types";
import type { FilterCondition } from "@/pages/FilterPanel";
import { getCustomFields } from "@/services/api";
import type { CustomField } from "@/services/api";
import { getCachedStaticData, setCachedStaticData } from "./staticDataCache";

interface BootstrapResponse {
  inboxes: Inbox[];
  conversations: { data: Conversation[]; total: number };
  labels: Label[];
  members: TenantMember[];
}

export function useConversations() {
  const { slug, conversationId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const tenantRole = user?.tenantRoles.find((tr: any) => tr.tenant.slug === slug);
  const tenantId = tenantRole?.tenantId || "";
  const { joinConversation, leaveConversation, on, connected, reconnectCount } = useSocket(tenantId || undefined);

  // --- Conversation List State ---
  const [inboxes, setInboxes] = useState<Inbox[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationsTotal, setConversationsTotal] = useState(0);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [hasMoreConversations, setHasMoreConversations] = useState(true);
  const [labels, setLabels] = useState<Label[]>([]);
  const [tenantMembers, setTenantMembers] = useState<TenantMember[]>([]);

  // Filters
  const [selectedInboxFilter, setSelectedInboxFilter] = useState<Set<string>>(new Set());
  const [selectedLabelFilters, setSelectedLabelFilters] = useState<Set<string>>(() => {
    const saved = localStorage.getItem("chat_filter_labels");
    return saved ? new Set(JSON.parse(saved)) : new Set();
  });
  const [hideCampaignMessages, setHideCampaignMessages] = useState(() => {
    const saved = localStorage.getItem("chat_filter_hideCampaign");
    return saved !== null ? saved === "true" : true;
  });
  const [assignmentFilter, setAssignmentFilter] = useState<AssignmentFilter>(() => {
    const saved = localStorage.getItem("chat_filter_assignment");
    return saved === "unassigned" || saved === "mine" ? saved : "all";
  });
  // Texto de búsqueda de chats (por nombre de contacto o texto en mensajes).
  const [searchQuery, setSearchQuery] = useState("");
  // Reglas de filtro sobre los campos del contacto (patrón FilterPanel).
  const [recordFilters, setRecordFilters] = useState<FilterCondition[]>(() => {
    try {
      const saved = localStorage.getItem("chat_filter_recordRules");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  // Campos del contacto (sistema + personalizados) para construir las reglas.
  const [customFields, setCustomFields] = useState<CustomField[]>([]);

  // --- Active Conversation & Messages State ---
  const [messages, setMessages] = useState<Message[]>([]);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const activeConversation = conversations.find((c) => c.id === conversationId) || null;
  const activeConversationIdRef = useRef<string | undefined>(conversationId);
  activeConversationIdRef.current = conversationId;

  const setActiveConversation = useCallback((conv: Conversation | null) => {
    if (conv) {
      navigate(`/${slug}/comunicaciones/conversaciones/${conv.id}`);
    } else {
      navigate(`/${slug}/comunicaciones/conversaciones`);
    }
  }, [navigate, slug]);

  // --- Data Loading ---
  const conversationsRef = useRef(conversations);
  conversationsRef.current = conversations;

  const loadConversations = useCallback((reset = true) => {
    if (!tenantId) return;
    setLoadingConversations(true);
    if (reset) setConversations([]);

    const params: Record<string, string> = {
      limit: "15",
      offset: reset ? "0" : String(conversationsRef.current.length),
    };
    if (selectedInboxFilter.size > 0) {
      params.inboxIds = Array.from(selectedInboxFilter).join(",");
    } else {
      params.tenantId = tenantId;
    }
    if (selectedLabelFilters.size > 0) {
      params.labelIds = Array.from(selectedLabelFilters).join(",");
    }
    if (hideCampaignMessages) {
      params.hideCampaign = "true";
    }
    if (assignmentFilter !== "all") {
      params.assignment = assignmentFilter;
    }
    if (searchQuery.trim()) {
      params.search = searchQuery.trim();
    }
    const activeRecordFilters = recordFilters.filter((f) => f.field && f.operator);
    if (activeRecordFilters.length > 0) {
      params.recordFilters = JSON.stringify(activeRecordFilters.map(({ field, operator, value }) => ({ field, operator, value })));
    }

    chatApi.get<{ data: Conversation[]; total: number }>("/chats/conversations", { params })
      .then(({ data: res }) => {
        if (reset) {
          setConversations(res.data);
        } else {
          setConversations((prev) => [...prev, ...res.data]);
        }
        setConversationsTotal(res.total);
        setHasMoreConversations(
          reset ? res.data.length < res.total : conversationsRef.current.length + res.data.length < res.total
        );
      })
      .catch(() => {})
      .finally(() => setLoadingConversations(false));
  }, [tenantId, selectedInboxFilter, selectedLabelFilters, hideCampaignMessages, assignmentFilter, searchQuery, recordFilters]);

  // Carga inicial consolidada: una sola petición trae inboxes + primera página
  // de conversaciones + labels + members. Los datos semi-estáticos se sirven
  // desde caché si están disponibles (evita refetch al reentrar a la vista).
  const loadBootstrap = useCallback(() => {
    if (!tenantId) return;

    // Pinta de inmediato los datos estáticos cacheados (si los hay).
    const cached = getCachedStaticData(tenantId);
    if (cached) {
      setInboxes(cached.inboxes);
      setLabels(cached.labels);
      setTenantMembers(cached.members);
    }

    setLoadingConversations(true);

    const params: Record<string, string> = { limit: "15", offset: "0", tenantId };
    if (selectedInboxFilter.size > 0) params.inboxIds = Array.from(selectedInboxFilter).join(",");
    if (selectedLabelFilters.size > 0) params.labelIds = Array.from(selectedLabelFilters).join(",");
    if (hideCampaignMessages) params.hideCampaign = "true";
    if (assignmentFilter !== "all") params.assignment = assignmentFilter;
    if (searchQuery.trim()) params.search = searchQuery.trim();
    const activeRecordFilters = recordFilters.filter((f) => f.field && f.operator);
    if (activeRecordFilters.length > 0) {
      params.recordFilters = JSON.stringify(activeRecordFilters.map(({ field, operator, value }) => ({ field, operator, value })));
    }

    chatApi.get<BootstrapResponse>("/chats/bootstrap", { params })
      .then(({ data }) => {
        setInboxes(data.inboxes);
        setLabels(data.labels);
        setTenantMembers(data.members);
        setConversations(data.conversations.data);
        setConversationsTotal(data.conversations.total);
        setHasMoreConversations(data.conversations.data.length < data.conversations.total);
        // Refresca el caché de datos semi-estáticos.
        setCachedStaticData(tenantId, {
          inboxes: data.inboxes,
          labels: data.labels,
          members: data.members,
        });
      })
      .catch(() => {})
      .finally(() => setLoadingConversations(false));
  }, [tenantId, selectedInboxFilter, selectedLabelFilters, hideCampaignMessages, assignmentFilter, searchQuery, recordFilters]);

  const loadMessages = useCallback((convId: string) => {
    setLoadingMessages(true);
    setHasMoreMessages(true);
    chatApi.get<Message[]>(`/chats/conversations/${convId}/messages`, { params: { limit: 30 } })
      .then(({ data }) => {
        setMessages(data);
        if (data.length < 30) setHasMoreMessages(false);
      })
      .catch(() => {})
      .finally(() => setLoadingMessages(false));
  }, []);

  // Carga páginas más antiguas hasta que el mensaje `targetCreatedAt` quede
  // dentro del rango cargado. Se usa para navegar a coincidencias de búsqueda
  // que pueden estar fuera de la ventana inicial. Devuelve true si se cargó.
  //
  // El cursor de paginación se lleva localmente (no vía messagesRef) para que
  // el bucle siempre progrese sin depender de que React haya re-renderizado y
  // actualizado el ref entre iteraciones.
  const ensureMessageLoaded = useCallback(async (targetCreatedAt: string): Promise<boolean> => {
    const convId = activeConversationIdRef.current;
    if (!convId) return false;
    const targetTime = new Date(targetCreatedAt).getTime();

    // Punto de partida: el mensaje más antiguo actualmente cargado.
    let oldest = messagesRef.current[0];
    // Ya está dentro del rango cargado.
    if (oldest && new Date(oldest.createdAt).getTime() <= targetTime) return true;

    // Pagina hacia atrás con lotes grandes hasta alcanzar la fecha objetivo.
    for (let i = 0; i < 50; i++) {
      const cursorId = oldest?.id;

      let data: Message[];
      try {
        const res = await chatApi.get<Message[]>(`/chats/conversations/${convId}/messages`, {
          params: { limit: 50, before: cursorId },
        });
        data = res.data;
      } catch {
        return false;
      }

      // Si cambió la conversación activa mientras cargábamos, aborta.
      if (activeConversationIdRef.current !== convId) return false;

      if (data.length === 0) {
        setHasMoreMessages(false);
        return false;
      }
      if (data.length < 50) setHasMoreMessages(false);

      // Merge evitando duplicados.
      setMessages((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        const fresh = data.filter((m) => !seen.has(m.id));
        return fresh.length > 0 ? [...fresh, ...prev] : prev;
      });

      // Avanza el cursor localmente al mensaje más antiguo recibido (los datos
      // vienen en orden cronológico ascendente, así que el primero es el más
      // antiguo del lote).
      oldest = data[0];
      if (new Date(oldest.createdAt).getTime() <= targetTime) return true;
    }
    return false;
  }, []);

  // Refs para leer estado fresco dentro de loadOlderMessages sin recrear el
  // callback en cada cambio de `messages`/`loadingMore`. Recrearlo invalidaba
  // el memo de ChatPanel en cada mensaje entrante.
  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const loadingMoreRef = useRef(loadingMore);
  loadingMoreRef.current = loadingMore;
  const hasMoreMessagesRef = useRef(hasMoreMessages);
  hasMoreMessagesRef.current = hasMoreMessages;

  const loadOlderMessages = useCallback(() => {
    const convId = activeConversationIdRef.current;
    const currentMessages = messagesRef.current;
    if (!convId || loadingMoreRef.current || !hasMoreMessagesRef.current || currentMessages.length === 0) return;
    setLoadingMore(true);
    const oldestMsg = currentMessages[0];

    chatApi.get<Message[]>(`/chats/conversations/${convId}/messages`, { params: { limit: 10, before: oldestMsg.id } })
      .then(({ data }) => {
        if (data.length < 10) setHasMoreMessages(false);
        if (data.length === 0) { setHasMoreMessages(false); return; }
        setMessages((prev) => [...data, ...prev]);
      })
      .catch(() => {})
      .finally(() => { setTimeout(() => setLoadingMore(false), 100); });
  }, []);

  // --- Initial load (una sola petición consolidada) ---
  useEffect(() => {
    if (!tenantId) return;
    loadBootstrap();
  }, [tenantId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cargar campos del contacto para el panel de filtros por reglas.
  useEffect(() => {
    if (!tenantId) return;
    getCustomFields(tenantId)
      .then((fields) => {
        // Excluir campos computados y de solo lectura poco útiles para filtrar.
        const usable = fields.filter((f) => f.fieldType !== "computed" && f.fieldKey !== "fullName");
        setCustomFields(usable.sort((a, b) => a.sortOrder - b.sortOrder));
      })
      .catch(() => {});
  }, [tenantId]);

  // Recargar conversaciones al cambiar filtros. Se salta el primer render para
  // no duplicar la petición que ya hace el bootstrap al montar.
  const didMountRef = useRef(false);
  useEffect(() => {
    if (!tenantId) return;
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    loadConversations();
  }, [selectedInboxFilter, selectedLabelFilters, hideCampaignMessages, assignmentFilter, recordFilters]); // eslint-disable-line react-hooks/exhaustive-deps

  // Recargar conversaciones al cambiar la búsqueda, con debounce para no lanzar
  // una petición por cada tecla. Se salta el primer render (búsqueda vacía).
  const didMountSearchRef = useRef(false);
  useEffect(() => {
    if (!tenantId) return;
    if (!didMountSearchRef.current) {
      didMountSearchRef.current = true;
      return;
    }
    const timer = setTimeout(() => loadConversations(), 350);
    return () => clearTimeout(timer);
  }, [searchQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist filters
  useEffect(() => {
    localStorage.setItem("chat_filter_labels", JSON.stringify(Array.from(selectedLabelFilters)));
  }, [selectedLabelFilters]);

  useEffect(() => {
    localStorage.setItem("chat_filter_hideCampaign", String(hideCampaignMessages));
  }, [hideCampaignMessages]);

  useEffect(() => {
    localStorage.setItem("chat_filter_assignment", assignmentFilter);
  }, [assignmentFilter]);

  useEffect(() => {
    localStorage.setItem("chat_filter_recordRules", JSON.stringify(recordFilters));
  }, [recordFilters]);

  // --- Active conversation effects ---
  useEffect(() => {
    if (!activeConversation) return;
    loadMessages(activeConversation.id);
    chatApi.post(`/chats/conversations/${activeConversation.id}/read`).catch(() => {});
    setConversations((prev) => prev.map((c) => c.id === activeConversation.id ? { ...c, unreadCount: 0 } : c));
    joinConversation(activeConversation.id);
    return () => { leaveConversation(activeConversation.id); };
  }, [activeConversation?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // --- WebSocket listeners ---
  useEffect(() => {
    if (!tenantId) return;

    const offConv = on("conversation_updated", (conv: any) => {
      setConversations((prev) => {
        const idx = prev.findIndex((c) => c.id === conv.id);
        if (idx === -1) {
          // Conversación nueva: va arriba (más reciente).
          return [conv, ...prev];
        }
        const existing = prev[idx];
        const unreadCount = conv.id === activeConversationIdRef.current ? 0 : conv.unreadCount ?? existing.unreadCount;
        const merged = { ...existing, ...conv, unreadCount };

        // Reordenar solo por inserción: quitar el item y colocarlo en su
        // posición por lastMessageAt, en vez de re-ordenar toda la lista en
        // cada evento de socket.
        const rest = prev.slice(0, idx).concat(prev.slice(idx + 1));
        const mergedTime = new Date(merged.lastMessageAt || 0).getTime();
        let insertAt = rest.findIndex(
          (c) => new Date(c.lastMessageAt || 0).getTime() < mergedTime
        );
        if (insertAt === -1) insertAt = rest.length;
        rest.splice(insertAt, 0, merged);
        return rest;
      });
    });

    const offMsg = on("new_message", (data: { conversationId: string; message: any }) => {
      if (activeConversationIdRef.current === data.conversationId) {
        setMessages((prev) => {
          if (prev.find((m) => m.id === data.message.id)) return prev;
          if (data.message.direction === "outbound") {
            const tempIdx = prev.findIndex(
              (m) => m.id.startsWith("temp-") && m.content === data.message.content && m.direction === "outbound"
            );
            if (tempIdx !== -1) {
              const updated = [...prev];
              updated[tempIdx] = data.message;
              return updated;
            }
          }
          return [...prev, data.message];
        });
      }
    });

    const offStatus = on("message_status", (data: { messageId: string; status: string }) => {
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === data.messageId);
        // El mensaje del ACK no está en la conversación abierta: no tocar
        // el array (evita crear uno nuevo y re-renderizar de balde).
        if (idx === -1) return prev;
        if (prev[idx].status === data.status) return prev;
        const next = prev.slice();
        next[idx] = { ...next[idx], status: data.status };
        return next;
      });
    });

    return () => { offConv?.(); offMsg?.(); offStatus?.(); };
  }, [tenantId, reconnectCount, on]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    // Identifiers
    slug,
    tenantId,
    user,
    connected,

    // Conversation list
    inboxes,
    conversations,
    setConversations,
    conversationsTotal,
    loadingConversations,
    hasMoreConversations,
    loadConversations,
    activeConversation,
    setActiveConversation,

    // Filters
    selectedInboxFilter,
    setSelectedInboxFilter,
    selectedLabelFilters,
    setSelectedLabelFilters,
    hideCampaignMessages,
    setHideCampaignMessages,
    assignmentFilter,
    setAssignmentFilter,
    searchQuery,
    setSearchQuery,
    recordFilters,
    setRecordFilters,
    customFields,

    // Labels & Members
    labels,
    tenantMembers,

    // Messages
    messages,
    setMessages,
    hasMoreMessages,
    loadingMore,
    loadingMessages,
    loadMessages,
    loadOlderMessages,
    ensureMessageLoaded,
  };
}
