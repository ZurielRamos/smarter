import { useEffect, useState } from "react";
import { X, ExternalLink, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { getMessages } from "@/services/api";
import type { ConversationRecord, MessageRecord } from "@/services/api";

interface Props {
  conversation: ConversationRecord;
  onClose: () => void;
  onGoToConversation: () => void;
}

export function ConversationPreviewModal({ conversation, onClose, onGoToConversation }: Props) {
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    getMessages(conversation.id, 20)
      .then((data) => setMessages(Array.isArray(data) ? data.reverse() : []))
      .catch(() => setMessages([]))
      .finally(() => setLoading(false));
  }, [conversation.id]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 backdrop-blur-sm p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-md h-[70vh] flex flex-col rounded-2xl shadow-2xl border border-white/30 overflow-hidden"
          style={{ background: "rgba(255, 255, 255, 0.94)", backdropFilter: "blur(24px)" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">{conversation.inbox?.name || "Conversación"}</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {conversation.contactName || conversation.contactId} · {conversation.status === "open" ? "Abierta" : "Cerrada"}
              </p>
            </div>
            <button onClick={onClose} className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-gray-50/50">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
              </div>
            ) : messages.length === 0 ? (
              <div className="flex items-center justify-center h-full text-sm text-gray-400">
                Sin mensajes
              </div>
            ) : (
              messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} />
              ))
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 shrink-0">
            <p className="text-[11px] text-gray-400">Últimos {messages.length} mensajes</p>
            <button
              onClick={onGoToConversation}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors shadow-sm"
            >
              Ir a la conversación
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function MessageBubble({ message }: { message: MessageRecord }) {
  const isOutbound = message.direction === "outbound";
  const time = new Date(message.createdAt).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });

  return (
    <div className={`flex ${isOutbound ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-xl px-3.5 py-2 ${
          isOutbound
            ? "bg-emerald-600 text-white rounded-br-sm"
            : "bg-white border border-gray-200 text-gray-800 rounded-bl-sm"
        }`}
      >
        {message.messageType === "note" ? (
          <p className="text-xs italic opacity-80">📝 Nota interna</p>
        ) : null}
        <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
        <p className={`text-[10px] mt-1 ${isOutbound ? "text-white/60" : "text-gray-400"} text-right`}>
          {time}
        </p>
      </div>
    </div>
  );
}
