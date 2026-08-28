import { memo, useMemo, useState, useRef, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { MoreVertical, Eye, Zap, ArrowRightLeft, ChevronLeft, UserPlus, X, CheckCheck, Bot, Trash2, ShoppingCart, CalendarCheck, Presentation, Star, FileText, Inbox, UserPlus as UserPlusIcon } from "lucide-react";
import { TemplateConfigModal } from "@/components/TemplateModal";
import { ConfirmModal } from "@/components/ConfirmModal";
import { ChatEmpty } from "../ChatEmpty";
import { MessageList } from "./MessageList";
import { ChatInput } from "./ChatInput";
import { chatApi } from "./api";
import { getDisplayName, STATUS_OPTIONS, CONVERSATION_STATUS_OPTIONS, normalizeConvStatus } from "./types";
import type { Conversation, Message, Label, TenantMember } from "./types";
import { createContactEvent } from "@/services/api";
import { toast } from "sonner";

interface ChatPanelProps {
  activeConversation: Conversation | null;
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  loadingMessages: boolean;
  loadingMore: boolean;
  hasMoreMessages: boolean;
  loadOlderMessages: () => void;
  loadMessages: (convId: string) => void;
  loadConversations: (reset?: boolean) => void;
  setConversations: React.Dispatch<React.SetStateAction<Conversation[]>>;
  labels: Label[];
  tenantMembers: TenantMember[];
  slug: string | undefined;
  user: any;
  tenantId: string;
}

export const ChatPanel = memo(function ChatPanel({
  activeConversation,
  messages,
  setMessages,
  loadingMessages,
  loadingMore,
  hasMoreMessages,
  loadOlderMessages,
  loadMessages,
  loadConversations,
  setConversations,
  labels,
  tenantMembers,
  slug,
  user,
  tenantId,
}: ChatPanelProps) {
  const navigate = useNavigate();
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [msgContextMenu, setMsgContextMenu] = useState<{ x: number; y: number; message: Message } | null>(null);
  const msgContextMenuRef = useRef<HTMLDivElement>(null);

  // Chat header menu state
  const [chatHeaderMenuOpen, setChatHeaderMenuOpen] = useState(false);
  const [showStatusSubmenu, setShowStatusSubmenu] = useState(false);
  const [showConvStatusSubmenu, setShowConvStatusSubmenu] = useState(false);
  const [showAssignSubmenu, setShowAssignSubmenu] = useState(false);
  const [showClearChatConfirm, setShowClearChatConfirm] = useState(false);
  const [showEventForm, setShowEventForm] = useState(false);
  const [eventForm, setEventForm] = useState({ type: "purchase", name: "", value: "", currency: "COP" });
  const chatHeaderMenuRef = useRef<HTMLDivElement>(null);

  const displayName = activeConversation ? getDisplayName(activeConversation) : "";

  // Compute isWindowClosed with useMemo
  const isWindowClosed = useMemo(() => {
    if (!activeConversation) return false;
    const channel = activeConversation.inbox?.channel;
    if (!channel || !["whatsapp", "messenger", "instagram"].includes(channel)) return false;
    let lastInboundTime = 0;
    let lastTemplateTime = 0;
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (!lastInboundTime && m.direction === "inbound") {
        lastInboundTime = new Date(m.createdAt).getTime();
      }
      if (!lastTemplateTime && m.direction === "outbound" && m.messageType === "template") {
        lastTemplateTime = new Date(m.createdAt).getTime();
      }
      if (lastInboundTime && lastTemplateTime) break;
    }
    const lastWindowOpener = Math.max(lastInboundTime, lastTemplateTime);
    if (lastWindowOpener === 0) return true;
    return (Date.now() - lastWindowOpener) / (1000 * 60 * 60) > 24;
  }, [activeConversation, messages]);

  const handleMsgContextMenu = useCallback((e: React.MouseEvent, msg: Message) => {
    e.preventDefault();
    setMsgContextMenu({ x: e.clientX, y: e.clientY, message: msg });
  }, []);

  // Close the chat header menu on outside click or Escape
  useEffect(() => {
    if (!chatHeaderMenuOpen) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (chatHeaderMenuRef.current && !chatHeaderMenuRef.current.contains(e.target as Node)) {
        setChatHeaderMenuOpen(false);
        setShowStatusSubmenu(false);
        setShowConvStatusSubmenu(false);
        setShowAssignSubmenu(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setChatHeaderMenuOpen(false);
        setShowStatusSubmenu(false);
        setShowConvStatusSubmenu(false);
        setShowAssignSubmenu(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [chatHeaderMenuOpen]);

  // Close the message context menu on outside click or Escape
  useEffect(() => {
    if (!msgContextMenu) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (msgContextMenuRef.current && !msgContextMenuRef.current.contains(e.target as Node)) {
        setMsgContextMenu(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMsgContextMenu(null);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [msgContextMenu]);

  const handleSend = useCallback(async (content: string, mode: "reply" | "note", replyToExternalId?: string | null) => {
    if (!activeConversation) return;
    const tempId = `temp-${Date.now()}`;
    const optimisticMsg: Message = {
      id: tempId,
      conversationId: activeConversation.id,
      direction: "outbound",
      messageType: mode === "note" ? "note" : "text",
      content,
      status: "sending",
      createdAt: new Date().toISOString(),
      externalId: null,
      replyToExternalId: replyToExternalId || null,
      sender: user ? { id: user.id, name: user.name, avatarPath: null } : null,
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    try {
      if (mode === "note") {
        await chatApi.post(`/chats/conversations/${activeConversation.id}/note`, { content, senderId: user?.id });
      } else {
        await chatApi.post(`/chats/conversations/${activeConversation.id}/send`, { content, senderId: user?.id, replyToExternalId: replyToExternalId || undefined });
      }
      setMessages((prev) => prev.map((m) => m.id === tempId ? { ...m, status: "sent" } : m));
    } catch {
      setMessages((prev) => prev.map((m) => m.id === tempId ? { ...m, status: "failed" } : m));
    }
  }, [activeConversation, user, setMessages]);

  const handleSendFile = useCallback(async (file: File, caption?: string) => {
    if (!activeConversation) return;
    const tempId = `temp-${Date.now()}`;
    const isImage = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");
    const preview = (isImage || isVideo) ? URL.createObjectURL(file) : undefined;

    const optimisticMsg: Message = {
      id: tempId,
      conversationId: activeConversation.id,
      direction: "outbound",
      messageType: isImage ? "image" : isVideo ? "video" : "document",
      content: caption || null,
      mediaUrl: preview,
      mediaMimeType: file.type,
      status: "sending",
      createdAt: new Date().toISOString(),
      sender: user ? { id: user.id, name: user.name, avatarPath: null } : null,
    };
    setMessages((prev) => [...prev, optimisticMsg]);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("conversationId", activeConversation.id);
      formData.append("senderId", user?.id || "");
      if (caption) formData.append("caption", caption);
      await chatApi.post("/chats/conversations/upload", formData, { headers: { "Content-Type": "multipart/form-data" } });
      setMessages((prev) => prev.map((m) => m.id === tempId ? { ...m, status: "sent" } : m));
    } catch {
      setMessages((prev) => prev.map((m) => m.id === tempId ? { ...m, status: "failed" } : m));
    } finally {
      if (preview) URL.revokeObjectURL(preview);
    }
  }, [activeConversation, user, setMessages]);

  const handleSendAudio = useCallback(async (blob: Blob, mimeType: string) => {
    if (!activeConversation) return;
    const ext = mimeType.includes("ogg") ? "ogg" : "webm";
    const file = new File([blob], `audio-${Date.now()}.${ext}`, { type: mimeType });
    const previewUrl = URL.createObjectURL(blob);
    const tempId = `temp-${Date.now()}`;
    const optimisticMsg: Message = {
      id: tempId,
      conversationId: activeConversation.id,
      direction: "outbound",
      messageType: "audio",
      content: null,
      mediaUrl: previewUrl,
      mediaMimeType: mimeType,
      status: "sending",
      createdAt: new Date().toISOString(),
      sender: user ? { id: user.id, name: user.name, avatarPath: null } : null,
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("conversationId", activeConversation.id);
      formData.append("senderId", user?.id || "");
      await chatApi.post("/chats/conversations/upload", formData, { headers: { "Content-Type": "multipart/form-data" } });
      setMessages((prev) => prev.map((m) => m.id === tempId ? { ...m, status: "sent" } : m));
    } catch {
      setMessages((prev) => prev.map((m) => m.id === tempId ? { ...m, status: "failed" } : m));
    } finally {
      URL.revokeObjectURL(previewUrl);
    }
  }, [activeConversation, user, setMessages]);

  const handleToggleBot = async () => {
    if (!activeConversation) return;
    const isActive = activeConversation.botStatus === "active";
    try {
      if (isActive) {
        await chatApi.post(`/chats/conversations/${activeConversation.id}/bot-pause`);
        setConversations((prev) => prev.map((c) => c.id === activeConversation.id ? { ...c, botStatus: "handed_off" } : c));
        toast.success("Bot pausado");
      } else {
        await chatApi.post(`/chats/conversations/${activeConversation.id}/bot-reactivate`);
        setConversations((prev) => prev.map((c) => c.id === activeConversation.id ? { ...c, botStatus: "active" } : c));
        toast.success("Bot activado");
      }
      setChatHeaderMenuOpen(false);
    } catch {
      toast.error("Error al cambiar estado del bot");
    }
  };

  const handleClearChat = async () => {
    if (!activeConversation) return;
    try {
      await chatApi.delete(`/chats/conversations/${activeConversation.id}/messages`);
      setMessages([]);
      toast.success("Chat vaciado");
      setShowClearChatConfirm(false);
    } catch {
      toast.error("Error al vaciar el chat");
    }
  };

  const handleChangeStatus = async (newStatus: string) => {
    const recordId = activeConversation?.record?.id;
    if (!recordId) return;
    try {
      await chatApi.put(`/records/${recordId}`, { status: newStatus });
      toast.success(`Estado cambiado a "${STATUS_OPTIONS.find((s) => s.value === newStatus)?.label || newStatus}"`);
      setChatHeaderMenuOpen(false);
      setShowStatusSubmenu(false);
    } catch {
      toast.error("Error al cambiar estado");
    }
  };

  const handleChangeConvStatus = async (newStatus: string) => {
    if (!activeConversation) return;
    try {
      await chatApi.put(`/chats/conversations/${activeConversation.id}/status`, { status: newStatus });
      setConversations((prev) => prev.map((c) => c.id === activeConversation.id ? { ...c, status: newStatus } : c));
      const label = CONVERSATION_STATUS_OPTIONS.find((s) => s.value === newStatus)?.label || newStatus;
      toast.success(`Conversación marcada como "${label}"`);
      setChatHeaderMenuOpen(false);
      setShowConvStatusSubmenu(false);
    } catch {
      toast.error("Error al cambiar el estado de la conversación");
    }
  };

  const handleAssignTo = async (userId: string | null) => {
    const recordId = activeConversation?.record?.id;
    if (!recordId) return;
    try {
      await chatApi.put(`/records/${recordId}`, { assignedTo: userId });
      setConversations((prev) => prev.map((c) => {
        if (c.id !== activeConversation?.id) return c;
        return { ...c, record: c.record ? { ...c.record, assignedTo: userId } : c.record };
      }));
      const member = userId ? tenantMembers.find((m) => m.userId === userId) : null;
      toast.success(userId ? `Asignado a ${member?.user.name || "agente"}` : "Asignación removida");
      setChatHeaderMenuOpen(false);
      setShowAssignSubmenu(false);
    } catch {
      toast.error("Error al asignar");
    }
  };

  const handleCreateEvent = async () => {
    const recordId = activeConversation?.record?.id;
    if (!recordId || !tenantId || !eventForm.name) return;
    try {
      await createContactEvent({
        tenantId,
        recordId,
        type: eventForm.type,
        name: eventForm.name,
        value: eventForm.value ? parseFloat(eventForm.value) : undefined,
        currency: eventForm.currency,
        actorId: user?.id,
        actorName: user?.name,
      });
      toast.success("Evento registrado");
      setShowEventForm(false);
      setEventForm({ type: "purchase", name: "", value: "", currency: "COP" });
    } catch {
      toast.error("Error al registrar evento");
    }
  };

  if (!activeConversation) {
    return (
      <div className="flex-1 flex flex-col bg-gray-50 min-w-0 overflow-hidden">
        <ChatEmpty />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-gray-50 min-w-0 overflow-hidden">
      {/* Header */}
      <div className="h-14 px-6 flex items-center justify-between border-b border-gray-200 bg-white shrink-0">
        <div className="flex items-center gap-3">
          <div className={`relative h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold text-gray-600 ${activeConversation.hasAdTracking ? "ring-2 ring-blue-500 ring-offset-1 bg-gradient-to-br from-blue-50 to-indigo-100" : "bg-gray-200"}`}>
            {displayName.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">{displayName}</p>
            <p className="text-[10px] text-gray-400">{activeConversation.contactId}</p>
          </div>
        </div>
        {/* Dropdown menu */}
        <div className="relative" ref={chatHeaderMenuRef}>
          <button onClick={() => setChatHeaderMenuOpen(!chatHeaderMenuOpen)} className="h-8 w-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <MoreVertical className="h-4 w-4" />
          </button>
          {chatHeaderMenuOpen && (
            <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-50 py-1">
              <button onClick={() => { setChatHeaderMenuOpen(false); const recordId = activeConversation.record?.id; if (recordId) navigate(`/${slug}/clients/${recordId}`); }} className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left text-gray-700 hover:bg-gray-50 transition-colors">
                <Eye className="h-4 w-4 shrink-0 text-gray-400" /> <span className="flex-1">Ver Contacto</span>
              </button>
              <button onClick={() => { setChatHeaderMenuOpen(false); setShowEventForm(true); }} className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left text-gray-700 hover:bg-gray-50 transition-colors">
                <Zap className="h-4 w-4 shrink-0 text-amber-500" /> <span className="flex-1">Agregar evento de conversión</span>
              </button>
              {/* Conversation status submenu */}
              <div className="relative" onMouseEnter={() => setShowConvStatusSubmenu(true)} onMouseLeave={() => setShowConvStatusSubmenu(false)}>
                <button className="flex items-center justify-between w-full px-3 py-2 text-sm text-left text-gray-700 hover:bg-gray-50 transition-colors">
                  <span className="flex items-center gap-2"><Inbox className="h-4 w-4 shrink-0 text-gray-400" /> Estado de conversación</span>
                  <ChevronLeft className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                </button>
                {showConvStatusSubmenu && (
                  <div className="absolute right-full top-0 mr-1 w-44 bg-white border border-gray-200 rounded-lg shadow-lg py-1">
                    {CONVERSATION_STATUS_OPTIONS.map((status) => {
                      const isCurrent = normalizeConvStatus(activeConversation.status) === status.value;
                      return (
                        <button key={status.value} onClick={() => handleChangeConvStatus(status.value)} className={`flex items-center gap-2.5 w-full px-3 py-2 text-sm text-left transition-colors ${isCurrent ? "bg-brand-50 text-brand-700" : "text-gray-700 hover:bg-gray-50"}`}>
                          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${status.color}`} /> <span className="flex-1">{status.label}</span>
                          {isCurrent && <CheckCheck className="h-3.5 w-3.5 shrink-0 text-brand-600" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              {/* Contact CRM status submenu */}
              <div className="relative" onMouseEnter={() => setShowStatusSubmenu(true)} onMouseLeave={() => setShowStatusSubmenu(false)}>
                <button className="flex items-center justify-between w-full px-3 py-2 text-sm text-left text-gray-700 hover:bg-gray-50 transition-colors">
                  <span className="flex items-center gap-2"><ArrowRightLeft className="h-4 w-4 shrink-0 text-gray-400" /> Estado del contacto</span>
                  <ChevronLeft className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                </button>
                {showStatusSubmenu && (
                  <div className="absolute right-full top-0 mr-1 w-44 bg-white border border-gray-200 rounded-lg shadow-lg py-1">
                    {STATUS_OPTIONS.map((status) => (
                      <button key={status.value} onClick={() => handleChangeStatus(status.value)} className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-left text-gray-700 hover:bg-gray-50 transition-colors">
                        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${status.color}`} /> <span className="flex-1">{status.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {/* Assign submenu */}
              <div className="relative" onMouseEnter={() => setShowAssignSubmenu(true)} onMouseLeave={() => setShowAssignSubmenu(false)}>
                <button className="flex items-center justify-between w-full px-3 py-2 text-sm text-left text-gray-700 hover:bg-gray-50 transition-colors">
                  <span className="flex items-center gap-2"><UserPlus className="h-4 w-4 shrink-0 text-gray-400" /> Asignar a</span>
                  <ChevronLeft className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                </button>
                {showAssignSubmenu && (
                  <div className="absolute right-full top-0 mr-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg py-1 max-h-60 overflow-y-auto">
                    {activeConversation.record?.assignedTo && (
                      <button onClick={() => handleAssignTo(null)} className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors border-b border-gray-100">
                        <X className="h-3.5 w-3.5" /> Quitar asignación
                      </button>
                    )}
                    {tenantMembers.map((member) => (
                      <button key={member.userId} onClick={() => handleAssignTo(member.userId)} className={`flex items-center gap-2.5 w-full px-3 py-2 text-sm transition-colors ${activeConversation.record?.assignedTo === member.userId ? "bg-brand-50 text-brand-700" : "text-gray-700 hover:bg-gray-50"}`}>
                        <span className="h-5 w-5 rounded-full bg-brand-100 text-brand-700 text-[9px] font-bold flex items-center justify-center shrink-0">
                          {member.user.name.split(" ").map((n) => n[0]).join("").substring(0, 2).toUpperCase()}
                        </span>
                        <span className="truncate">{member.user.name}</span>
                        {activeConversation.record?.assignedTo === member.userId && <CheckCheck className="h-3.5 w-3.5 ml-auto shrink-0 text-brand-600" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="border-t border-gray-100 my-1" />
              <button onClick={handleToggleBot} className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left text-gray-700 hover:bg-gray-50 transition-colors">
                <Bot className={`h-4 w-4 shrink-0 ${activeConversation.botStatus === "active" ? "text-green-500" : "text-gray-400"}`} />
                <span className="flex-1">{activeConversation.botStatus === "active" ? "Pausar bot" : "Activar bot"}</span>
              </button>
              <button onClick={() => { setChatHeaderMenuOpen(false); setShowClearChatConfirm(true); }} className="flex items-center gap-2 w-full px-3 py-2 text-sm text-left text-red-600 hover:bg-red-50 transition-colors">
                <Trash2 className="h-4 w-4 shrink-0 text-red-400" /> <span className="flex-1">Vaciar chat</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Messages */}
      <MessageList
        messages={messages}
        loadingMessages={loadingMessages}
        loadingMore={loadingMore}
        hasMoreMessages={hasMoreMessages}
        displayName={displayName}
        onLoadOlder={loadOlderMessages}
        onMsgContextMenu={handleMsgContextMenu}
      />

      {/* Input */}
      <ChatInput
        activeConversation={activeConversation}
        isWindowClosed={isWindowClosed}
        replyTo={replyTo}
        onClearReply={() => setReplyTo(null)}
        onSend={handleSend}
        onSendFile={handleSendFile}
        onSendAudio={handleSendAudio}
        onSelectTemplate={setSelectedTemplate}
      />

      {/* Message context menu */}
      {msgContextMenu && (
        <div ref={msgContextMenuRef} className="fixed z-[100] w-52 bg-white rounded-lg shadow-lg border border-gray-200 py-1 animate-in fade-in zoom-in-95 duration-100" style={{ top: msgContextMenu.y, left: msgContextMenu.x }}>
          <button onClick={() => { setReplyTo(msgContextMenu.message); setMsgContextMenu(null); }} className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
            <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" /></svg>
            Responder
          </button>
          <button onClick={() => { if (msgContextMenu.message.content) navigator.clipboard.writeText(msgContextMenu.message.content); setMsgContextMenu(null); }} className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
            <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
            Copiar texto
          </button>
        </div>
      )}

      {/* Template modal */}
      {selectedTemplate && (
        <TemplateConfigModal
          template={selectedTemplate}
          conversationId={activeConversation.id}
          senderId={user?.id}
          contact={activeConversation.record}
          onClose={() => setSelectedTemplate(null)}
          onSent={() => { loadMessages(activeConversation.id); loadConversations(); }}
        />
      )}

      {/* Clear chat confirm */}
      <ConfirmModal
        open={showClearChatConfirm}
        onClose={() => setShowClearChatConfirm(false)}
        onConfirm={handleClearChat}
        title="Vaciar chat"
        description="Se eliminarán todos los mensajes de esta conversación. Esta acción no se puede deshacer."
        confirmLabel="Vaciar"
        variant="danger"
      />

      {/* Event form modal */}
      {showEventForm && (
        <EventFormModal
          eventForm={eventForm}
          setEventForm={setEventForm}
          onClose={() => setShowEventForm(false)}
          onSubmit={handleCreateEvent}
        />
      )}
    </div>
  );
});

// --- Event Form Modal (extracted to reduce ChatPanel render cost) ---
function EventFormModal({
  eventForm,
  setEventForm,
  onClose,
  onSubmit,
}: {
  eventForm: { type: string; name: string; value: string; currency: string };
  setEventForm: (v: any) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const EVENT_TYPES = [
    { value: "purchase", label: "Compra", desc: "Venta cerrada", icon: ShoppingCart, color: "text-green-600" },
    { value: "appointment", label: "Cita", desc: "Reunión agendada", icon: CalendarCheck, color: "text-blue-600" },
    { value: "demo", label: "Demo", desc: "Demostración realizada", icon: Presentation, color: "text-purple-600" },
    { value: "qualified", label: "Calificado", desc: "Lead cualificado", icon: Star, color: "text-amber-600" },
    { value: "proposal", label: "Propuesta", desc: "Cotización enviada", icon: FileText, color: "text-indigo-600" },
    { value: "registration", label: "Registro", desc: "Se registró", icon: UserPlusIcon, color: "text-cyan-600" },
    { value: "subscription", label: "Suscripción", desc: "Plan activado", icon: ArrowRightLeft, color: "text-emerald-600" },
    { value: "custom", label: "Otro", desc: "Evento personalizado", icon: Zap, color: "text-gray-600" },
  ] as const;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-5 border-b border-gray-100 bg-gradient-to-r from-amber-50 to-orange-50">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center">
              <Zap className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">Registrar evento de conversión</h2>
              <p className="text-xs text-gray-500 mt-0.5">Este evento queda en el historial del contacto y puede notificarse a plataformas de ads</p>
            </div>
          </div>
        </div>
        <div className="px-6 py-5 space-y-5">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2">¿Qué ocurrió?</label>
            <div className="grid grid-cols-2 gap-2">
              {EVENT_TYPES.map((opt) => {
                const Icon = opt.icon;
                const isSelected = eventForm.type === opt.value;
                return (
                  <button key={opt.value} onClick={() => setEventForm({ ...eventForm, type: opt.value, name: eventForm.name || opt.label })} className={`flex items-center gap-2.5 p-3 rounded-xl border text-left transition-all ${isSelected ? "border-brand-500 bg-brand-50/50 ring-1 ring-brand-500/20" : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"}`}>
                    <Icon className={`h-4 w-4 shrink-0 ${isSelected ? opt.color : "text-gray-400"}`} />
                    <div>
                      <p className={`text-sm font-medium ${isSelected ? "text-gray-900" : "text-gray-700"}`}>{opt.label}</p>
                      <p className="text-[10px] text-gray-400">{opt.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Nombre del evento</label>
            <input type="text" value={eventForm.name} onChange={(e) => setEventForm({ ...eventForm, name: e.target.value })} placeholder="Ej: Compra Plan Premium..." className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Valor monetario <span className="text-gray-400 font-normal">(opcional)</span></label>
            <div className="flex gap-2">
              <input type="number" value={eventForm.value} onChange={(e) => setEventForm({ ...eventForm, value: e.target.value })} placeholder="0" className="flex-1 px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400" />
              <select value={eventForm.currency} onChange={(e) => setEventForm({ ...eventForm, currency: e.target.value })} className="w-24 px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400">
                <option value="COP">COP</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="MXN">MXN</option>
              </select>
            </div>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium transition-colors">Cancelar</button>
          <button onClick={onSubmit} disabled={!eventForm.name} className="px-5 py-2 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-xl transition-colors disabled:opacity-50 shadow-sm">Registrar evento</button>
        </div>
      </div>
    </div>
  );
}
