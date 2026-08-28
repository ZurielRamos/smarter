import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCheck, BellOff, Archive, Trash2, UserCircle, X, UserPlus } from "lucide-react";
import { ConfirmModal } from "@/components/ConfirmModal";
import { useConversations } from "./useConversations";
import { ConversationList } from "./ConversationList";
import { ChatPanel } from "./ChatPanel";
import { chatApi } from "./api";
import { getDisplayName } from "./types";
import type { Conversation, Message } from "./types";
import { toast } from "sonner";

export function Conversaciones() {
  const ctx = useConversations();
  const navigate = useNavigate();

  // Context menu state (lives here since it spans the sidebar and needs conversation data)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; conversation: Conversation } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Conversation | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  const handleContextMenu = useCallback((e: React.MouseEvent, conv: Conversation) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, conversation: conv });
  }, []);

  // Close the context menu on outside click or Escape
  useEffect(() => {
    if (!contextMenu) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setContextMenu(null);
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [contextMenu]);

  const handleMarkAsRead = () => {
    if (!contextMenu) return;
    chatApi.post(`/chats/conversations/${contextMenu.conversation.id}/read`).catch(() => {});
    ctx.setConversations((prev) => prev.map((c) => c.id === contextMenu.conversation.id ? { ...c, unreadCount: 0 } : c));
    setContextMenu(null);
  };

  const handleDeleteConversation = () => {
    if (!contextMenu) return;
    setDeleteConfirm(contextMenu.conversation);
    setContextMenu(null);
  };

  const confirmDelete = () => {
    if (!deleteConfirm) return;
    chatApi.delete(`/chats/conversations/${deleteConfirm.id}`).then(() => {
      if (ctx.activeConversation?.id === deleteConfirm.id) {
        navigate(`/${ctx.slug}/comunicaciones/conversaciones`);
      }
      ctx.loadConversations();
    }).catch(() => {});
    setDeleteConfirm(null);
  };

  const handleAssignFromContext = (userId: string | null) => {
    if (!contextMenu) return;
    const recordId = contextMenu.conversation.record?.id;
    if (!recordId) return;
    chatApi.put(`/records/${recordId}`, { assignedTo: userId }).then(() => {
      ctx.setConversations((prev) => prev.map((c) => c.id !== contextMenu.conversation.id ? c : { ...c, record: c.record ? { ...c.record, assignedTo: userId } : c.record }));
      const member = userId ? ctx.tenantMembers.find((m) => m.userId === userId) : null;
      toast.success(userId ? `Asignado a ${member?.user.name}` : "Asignación removida");
    }).catch(() => toast.error("Error al asignar"));
    setContextMenu(null);
  };

  const handleLabelToggle = (labelId: string, action: "add" | "remove") => {
    if (!contextMenu) return;
    const convId = contextMenu.conversation.id;
    const lbl = ctx.labels.find((l) => l.id === labelId);

    // Optimistic update
    ctx.setConversations((prev) =>
      prev.map((c) => {
        if (c.id !== convId) return c;
        const currentLabels = c.labelIds || [];
        const newLabels = action === "add" ? [...currentLabels, labelId] : currentLabels.filter((id) => id !== labelId);
        return { ...c, labelIds: newLabels };
      })
    );

    // Optimistic note
    if (ctx.activeConversation?.id === convId && lbl) {
      const noteMsg: Message = {
        id: `temp-label-${Date.now()}`,
        conversationId: convId,
        direction: "outbound",
        messageType: "note",
        content: `${ctx.user?.name} ${action === "add" ? "agregó" : "quitó"} ${lbl.label}`,
        status: "delivered",
        createdAt: new Date().toISOString(),
        sender: ctx.user ? { id: ctx.user.id, name: ctx.user.name, avatarPath: null } : null,
      };
      ctx.setMessages((prev) => [...prev, noteMsg]);
    }
    setContextMenu(null);

    chatApi.post(`/chats/conversations/${convId}/toggle-label`, {
      labelId,
      action,
      userId: ctx.user?.id,
      userName: ctx.user?.name,
    }).catch(() => {
      // Revert
      ctx.setConversations((prev) =>
        prev.map((c) => {
          if (c.id !== convId) return c;
          const currentLabels = c.labelIds || [];
          const reverted = action === "add" ? currentLabels.filter((id) => id !== labelId) : [...currentLabels, labelId];
          return { ...c, labelIds: reverted };
        })
      );
    });
  };

  return (
    <>
      <ConversationList
        conversations={ctx.conversations}
        activeConversationId={ctx.activeConversation?.id}
        inboxes={ctx.inboxes}
        labels={ctx.labels}
        tenantMembers={ctx.tenantMembers}
        loadingConversations={ctx.loadingConversations}
        hasMoreConversations={ctx.hasMoreConversations}
        selectedInboxFilter={ctx.selectedInboxFilter}
        setSelectedInboxFilter={ctx.setSelectedInboxFilter}
        selectedLabelFilters={ctx.selectedLabelFilters}
        setSelectedLabelFilters={ctx.setSelectedLabelFilters}
        hideCampaignMessages={ctx.hideCampaignMessages}
        setHideCampaignMessages={ctx.setHideCampaignMessages}
        onSelectConversation={ctx.setActiveConversation}
        onContextMenu={handleContextMenu}
        onLoadMore={() => ctx.loadConversations(false)}
      />

      <ChatPanel
        activeConversation={ctx.activeConversation}
        messages={ctx.messages}
        setMessages={ctx.setMessages}
        loadingMessages={ctx.loadingMessages}
        loadingMore={ctx.loadingMore}
        hasMoreMessages={ctx.hasMoreMessages}
        loadOlderMessages={ctx.loadOlderMessages}
        loadMessages={ctx.loadMessages}
        loadConversations={ctx.loadConversations}
        setConversations={ctx.setConversations}
        labels={ctx.labels}
        tenantMembers={ctx.tenantMembers}
        slug={ctx.slug}
        user={ctx.user}
        tenantId={ctx.tenantId}
      />

      {/* Conversation context menu */}
      {contextMenu && (
        <div ref={contextMenuRef} className="fixed z-[100] w-52 bg-white rounded-lg shadow-lg border border-gray-200 py-1 animate-in fade-in zoom-in-95 duration-100" style={{ top: contextMenu.y, left: contextMenu.x }}>
          <button onClick={handleMarkAsRead} className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
            <CheckCheck className="h-4 w-4 text-gray-400" /> Marcar como leído
          </button>
          <button onClick={() => setContextMenu(null)} className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
            <BellOff className="h-4 w-4 text-gray-400" /> Silenciar
          </button>
          <button onClick={() => setContextMenu(null)} className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
            <UserCircle className="h-4 w-4 text-gray-400" /> Ver contacto
          </button>
          <button onClick={() => setContextMenu(null)} className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
            <Archive className="h-4 w-4 text-gray-400" /> Archivar
          </button>
          {/* Labels submenu */}
          {ctx.labels.length > 0 && (
            <div className="relative group/labels">
              <button className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                <svg className="h-4 w-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></svg>
                <span className="flex-1 text-left">Asignar etiqueta</span>
                <svg className="h-3 w-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
              </button>
              <div className="absolute left-full top-0 ml-1 w-48 bg-white rounded-lg shadow-xl border border-gray-200 py-1 opacity-0 invisible group-hover/labels:opacity-100 group-hover/labels:visible transition-all z-[110] max-h-52 overflow-y-auto">
                {ctx.labels.map((lbl) => {
                  const isAssigned = contextMenu.conversation.labelIds?.includes(lbl.id);
                  return (
                    <button key={lbl.id} onClick={() => handleLabelToggle(lbl.id, isAssigned ? "remove" : "add")} className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 transition-colors">
                      <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: lbl.color }} />
                      <span className="flex-1 text-left truncate">{lbl.label}</span>
                      {isAssigned && <span className="text-brand-500 text-[10px]">✓</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {/* Assign submenu */}
          <div className="relative group/assign">
            <button className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
              <UserPlus className="h-4 w-4 text-gray-400" />
              <span className="flex-1 text-left">Asignar a</span>
              <svg className="h-3 w-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
            </button>
            <div className="absolute left-full top-0 ml-1 w-48 bg-white rounded-lg shadow-xl border border-gray-200 py-1 opacity-0 invisible group-hover/assign:opacity-100 group-hover/assign:visible transition-all z-[110] max-h-60 overflow-y-auto">
              {contextMenu.conversation.record?.assignedTo && (
                <button onClick={() => handleAssignFromContext(null)} className="flex items-center gap-2 w-full px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 transition-colors border-b border-gray-100">
                  <X className="h-3.5 w-3.5" /> Quitar asignación
                </button>
              )}
              {ctx.tenantMembers.map((member) => (
                <button key={member.userId} onClick={() => handleAssignFromContext(member.userId)} className={`flex items-center gap-2 w-full px-3 py-1.5 text-xs transition-colors ${contextMenu.conversation.record?.assignedTo === member.userId ? "bg-brand-50 text-brand-700" : "text-gray-700 hover:bg-gray-50"}`}>
                  <span className="h-5 w-5 rounded-full bg-brand-100 text-brand-700 text-[8px] font-bold flex items-center justify-center shrink-0">
                    {member.user.name.split(" ").map((n) => n[0]).join("").substring(0, 2).toUpperCase()}
                  </span>
                  <span className="truncate">{member.user.name}</span>
                  {contextMenu.conversation.record?.assignedTo === member.userId && <CheckCheck className="h-3 w-3 ml-auto shrink-0 text-brand-600" />}
                </button>
              ))}
            </div>
          </div>
          <div className="my-1 border-t border-gray-100" />
          <button onClick={handleDeleteConversation} className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors">
            <Trash2 className="h-4 w-4 text-red-400" /> Eliminar conversación
          </button>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteConfirm && (
        <ConfirmModal
          open={!!deleteConfirm}
          onClose={() => setDeleteConfirm(null)}
          onConfirm={confirmDelete}
          title="Eliminar conversación"
          description={`¿Estás seguro de eliminar la conversación con ${getDisplayName(deleteConfirm)}? Se borrarán todos los mensajes. Esta acción no se puede deshacer.`}
          confirmLabel="Eliminar"
          variant="danger"
        />
      )}
    </>
  );
}
