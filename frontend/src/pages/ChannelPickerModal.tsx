import { useEffect, useState } from "react";
import { X, MessageSquare, Loader2, Mail, Phone, Camera, ArrowRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { WhatsAppIcon, MessengerIcon, FormIcon } from "@/components/ChannelIcons";
import { getInboxes, findOrCreateConversation } from "@/services/api";
import type { InboxSummary, ConversationRecord } from "@/services/api";
import { toast } from "sonner";

const CHANNEL_ICONS: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string; bg: string }> = {
  whatsapp: { icon: WhatsAppIcon, color: "text-green-600", bg: "bg-green-50" },
  messenger: { icon: MessengerIcon, color: "text-blue-600", bg: "bg-blue-50" },
  instagram: { icon: Camera, color: "text-pink-600", bg: "bg-pink-50" },
  sms: { icon: MessageSquare, color: "text-sky-600", bg: "bg-sky-50" },
  llamada: { icon: Phone, color: "text-purple-600", bg: "bg-purple-50" },
  email: { icon: Mail, color: "text-orange-600", bg: "bg-orange-50" },
  form: { icon: FormIcon, color: "text-purple-600", bg: "bg-purple-50" },
};

interface Props {
  tenantId: string;
  recordId: string;
  /** Conversaciones ya existentes del contacto, para marcar canales con conversación. */
  conversations: ConversationRecord[];
  onClose: () => void;
  /** Se llama con la conversación resuelta (existente o recién creada). */
  onSelect: (conversation: ConversationRecord) => void;
}

export function ChannelPickerModal({ tenantId, recordId, conversations, onClose, onSelect }: Props) {
  const [inboxes, setInboxes] = useState<InboxSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectingId, setSelectingId] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId) return;
    setLoading(true);
    getInboxes(tenantId)
      .then((data) => setInboxes(data.filter((i) => i.status === "connected")))
      .catch(() => setInboxes([]))
      .finally(() => setLoading(false));
  }, [tenantId]);

  const existingByInbox = new Map<string, ConversationRecord>();
  for (const conv of conversations) {
    if (!existingByInbox.has(conv.inboxId)) existingByInbox.set(conv.inboxId, conv);
  }

  const handleSelect = async (inbox: InboxSummary) => {
    if (selectingId) return;
    const existing = existingByInbox.get(inbox.id);
    if (existing) {
      onSelect(existing);
      return;
    }
    setSelectingId(inbox.id);
    try {
      const conversation = await findOrCreateConversation(inbox.id, recordId);
      onSelect(conversation);
    } catch (err: any) {
      const msg = err?.response?.data?.message || "No se pudo abrir la conversación en este canal";
      toast.error(Array.isArray(msg) ? msg[0] : msg);
      setSelectingId(null);
    }
  };

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
          className="w-full max-w-md rounded-2xl shadow-2xl border border-white/30 overflow-hidden"
          style={{ background: "rgba(255, 255, 255, 0.96)", backdropFilter: "blur(24px)" }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Enviar mensaje</h2>
              <p className="text-xs text-gray-500 mt-0.5">Elige el canal para conversar con el contacto</p>
            </div>
            <button
              onClick={onClose}
              className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Channel list */}
          <div className="px-4 py-4 max-h-[60vh] overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
              </div>
            ) : inboxes.length === 0 ? (
              <div className="text-center py-10">
                <MessageSquare className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No hay canales conectados</p>
              </div>
            ) : (
              <div className="space-y-2">
                {inboxes.map((inbox) => {
                  const info = CHANNEL_ICONS[inbox.channel] || { icon: MessageSquare, color: "text-gray-500", bg: "bg-gray-50" };
                  const Icon = info.icon;
                  const hasConversation = existingByInbox.has(inbox.id);
                  const isBusy = selectingId === inbox.id;
                  return (
                    <button
                      key={inbox.id}
                      onClick={() => handleSelect(inbox)}
                      disabled={!!selectingId}
                      className="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:border-gray-200 hover:bg-gray-50 transition-colors text-left disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      <div className={`h-9 w-9 rounded-lg ${info.bg} flex items-center justify-center shrink-0`}>
                        <Icon className={`h-4 w-4 ${info.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{inbox.name}</p>
                        <p className="text-xs text-gray-500 truncate">
                          {hasConversation ? "Conversación existente" : "Iniciar nueva conversación"}
                        </p>
                      </div>
                      {isBusy ? (
                        <Loader2 className="h-4 w-4 animate-spin text-gray-400 shrink-0" />
                      ) : (
                        <ArrowRight className="h-4 w-4 text-gray-300 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
