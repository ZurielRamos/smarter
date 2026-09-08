import { useEffect, useState } from "react";
import { useParams, useNavigate, Outlet } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Plus, Phone, MessageSquare, Mail, MessageCircle, Camera, Wifi, WifiOff } from "lucide-react";
import { WhatsAppIcon, FormIcon, MessengerIcon } from "@/components/ChannelIcons";
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
  whatsapp: { icon: WhatsAppIcon, color: "text-green-600", bg: "bg-green-50 dark:bg-green-500/15" },
  messenger: { icon: MessengerIcon, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-500/15" },
  instagram: { icon: Camera, color: "text-pink-600", bg: "bg-pink-50 dark:bg-pink-500/15" },
  sms: { icon: MessageSquare, color: "text-sky-600", bg: "bg-sky-50 dark:bg-sky-500/15" },
  llamada: { icon: Phone, color: "text-purple-600", bg: "bg-purple-50 dark:bg-purple-500/15" },
  email: { icon: Mail, color: "text-orange-600", bg: "bg-orange-50 dark:bg-orange-500/15" },
  form: { icon: FormIcon, color: "text-violet-600", bg: "bg-violet-50 dark:bg-violet-500/15" },
  chat: { icon: MessageCircle, color: "text-teal-600", bg: "bg-teal-50 dark:bg-teal-500/15" },
};

export function Canales() {
  const { slug, inboxId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const tenantRole = user?.tenantRoles.find((tr) => tr.tenant.slug === slug);
  const tenantId = tenantRole?.tenantId || "";

  const [inboxes, setInboxes] = useState<Inbox[]>([]);

  useEffect(() => {
    if (!tenantId) return;
    api.get<Inbox[]>("/chats/inboxes", { params: { tenantId } })
      .then(({ data }) => setInboxes(data))
      .catch(() => {});
  }, [tenantId, inboxId]);

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Sidebar — Inboxes list */}
      <div className="w-80 border-r border-border flex flex-col shrink-0">
        <div className="px-3 py-3 border-b border-border flex items-center justify-between">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase">Canales</h3>
          <button
            onClick={() => navigate(`/${slug}/inboxes/new`)}
            className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {inboxes.length === 0 ? (
            <div className="px-3 py-8 text-center">
              <MessageSquare className="h-6 w-6 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">Sin canales</p>
              <button
                onClick={() => navigate(`/${slug}/inboxes/new`)}
                className="mt-2 text-xs text-brand-600 dark:text-brand-300 hover:text-brand-700 font-medium"
              >
                + Crear canal
              </button>
            </div>
          ) : (
            inboxes.map((inbox) => {
              const channelInfo = CHANNEL_ICONS[inbox.channel] || { icon: MessageSquare, color: "text-muted-foreground", bg: "bg-muted" };
              const Icon = channelInfo.icon;
              return (
                <button
                  key={inbox.id}
                  onClick={() => navigate(`/${slug}/comunicaciones/canales/${inbox.id}`)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors ${
                    inboxId === inbox.id ? "bg-brand-50 text-brand-700 dark:bg-brand-700 dark:text-brand-100" : "text-foreground hover:bg-muted"
                  }`}
                >
                  <div className={`h-7 w-7 rounded-lg ${channelInfo.bg} flex items-center justify-center shrink-0`}>
                    <Icon className={`h-3.5 w-3.5 ${channelInfo.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{inbox.name}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{inbox.channelName || inbox.channel}</p>
                  </div>
                  {inbox.status === "connected" ? (
                    <Wifi className="h-3 w-3 text-green-500 shrink-0" />
                  ) : (
                    <WifiOff className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Detail panel — Outlet renders child route */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <Outlet />
      </div>
    </div>
  );
}
