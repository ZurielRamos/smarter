import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Plus, Settings2, Phone, MessageSquare, Mail, MessageCircle, Camera, Wifi, WifiOff } from "lucide-react";
import { WhatsAppIcon, FormIcon } from "@/components/ChannelIcons";
import { api } from "@/services/api";

interface Inbox {
  id: string;
  name: string;
  channel: string;
  status: string;
  channelName: string | null;
  createdAt: string;
}

const CHANNEL_ICONS: Record<string, { icon: any; color: string; bg: string }> = {
  whatsapp: { icon: WhatsAppIcon, color: "text-green-600", bg: "bg-green-50" },
  messenger: { icon: MessageCircle, color: "text-blue-600", bg: "bg-blue-50" },
  instagram: { icon: Camera, color: "text-pink-600", bg: "bg-pink-50" },
  sms: { icon: MessageSquare, color: "text-sky-600", bg: "bg-sky-50" },
  llamada: { icon: Phone, color: "text-purple-600", bg: "bg-purple-50" },
  email: { icon: Mail, color: "text-orange-600", bg: "bg-orange-50" },
  form: { icon: FormIcon, color: "text-violet-600", bg: "bg-violet-50" },
};

export function Canales() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const tenantRole = user?.tenantRoles.find((tr) => tr.tenant.slug === slug);
  const tenantId = tenantRole?.tenantId || "";

  const [inboxes, setInboxes] = useState<Inbox[]>([]);
  const [selectedInbox, setSelectedInbox] = useState<Inbox | null>(null);

  useEffect(() => {
    if (!tenantId) return;
    api.get<Inbox[]>("/chats/inboxes", { params: { tenantId } })
      .then(({ data }) => setInboxes(data))
      .catch(() => {});
  }, [tenantId]);

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Sidebar — Inboxes list */}
      <div className="w-64 border-r border-gray-100 flex flex-col">
        <div className="px-3 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-xs font-semibold text-gray-500 uppercase">Canales</h3>
          <button
            onClick={() => navigate(`/${slug}/inboxes/new`)}
            className="p-1 rounded-md hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {inboxes.length === 0 ? (
            <div className="px-3 py-8 text-center">
              <MessageSquare className="h-6 w-6 text-gray-300 mx-auto mb-2" />
              <p className="text-xs text-gray-400">Sin canales</p>
              <button
                onClick={() => navigate(`/${slug}/inboxes/new`)}
                className="mt-2 text-xs text-brand-600 hover:text-brand-700 font-medium"
              >
                + Crear canal
              </button>
            </div>
          ) : (
            inboxes.map((inbox) => {
              const channelInfo = CHANNEL_ICONS[inbox.channel] || { icon: MessageSquare, color: "text-gray-500", bg: "bg-gray-50" };
              const Icon = channelInfo.icon;
              return (
                <button
                  key={inbox.id}
                  onClick={() => setSelectedInbox(inbox)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors ${
                    selectedInbox?.id === inbox.id ? "bg-brand-50 text-brand-700" : "text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  <div className={`h-7 w-7 rounded-lg ${channelInfo.bg} flex items-center justify-center shrink-0`}>
                    <Icon className={`h-3.5 w-3.5 ${channelInfo.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{inbox.name}</p>
                    <p className="text-[10px] text-gray-400 truncate">{inbox.channelName || inbox.channel}</p>
                  </div>
                  {inbox.status === "connected" ? (
                    <Wifi className="h-3 w-3 text-green-500 shrink-0" />
                  ) : (
                    <WifiOff className="h-3 w-3 text-gray-300 shrink-0" />
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Detail panel */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedInbox ? (
          <div className="flex-1 flex flex-col">
            {/* Header */}
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {(() => {
                  const info = CHANNEL_ICONS[selectedInbox.channel] || { icon: MessageSquare, color: "text-gray-500", bg: "bg-gray-50" };
                  const Icon = info.icon;
                  return (
                    <div className={`h-10 w-10 rounded-lg ${info.bg} flex items-center justify-center`}>
                      <Icon className={`h-5 w-5 ${info.color}`} />
                    </div>
                  );
                })()}
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">{selectedInbox.name}</h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[11px] text-gray-400 capitalize">{selectedInbox.channel}</span>
                    {selectedInbox.status === "connected" ? (
                      <span className="inline-flex items-center gap-1 text-[10px] text-green-600 font-medium">
                        <span className="h-1.5 w-1.5 rounded-full bg-green-500" /> Conectado
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[10px] text-gray-400 font-medium">
                        <span className="h-1.5 w-1.5 rounded-full bg-gray-300" /> Desconectado
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button
                onClick={() => navigate(`/${slug}/inboxes/${selectedInbox.id}/settings`)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
              >
                <Settings2 className="h-3.5 w-3.5" />
                Configurar
              </button>
            </div>

            {/* Details */}
            <div className="flex-1 overflow-y-auto p-5">
              <div className="space-y-4 max-w-md">
                <div className="p-4 rounded-lg border border-gray-200 bg-gray-50/50 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Canal</span>
                    <span className="text-gray-700 font-medium capitalize">{selectedInbox.channel}</span>
                  </div>
                  {selectedInbox.channelName && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500">Identificador</span>
                      <span className="text-gray-700 font-mono">{selectedInbox.channelName}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Estado</span>
                    <span className={selectedInbox.status === "connected" ? "text-green-600 font-medium" : "text-red-500 font-medium"}>
                      {selectedInbox.status === "connected" ? "Conectado" : "Desconectado"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Creado</span>
                    <span className="text-gray-700">{new Date(selectedInbox.createdAt).toLocaleDateString("es-CO")}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
            <MessageSquare className="h-8 w-8 text-gray-300 mb-2" />
            <p className="text-sm text-gray-500 font-medium">Selecciona un canal</p>
            <p className="text-[11px] text-gray-400 mt-1">O crea uno nuevo para conectar un proveedor de comunicación</p>
          </div>
        )}
      </div>
    </div>
  );
}
