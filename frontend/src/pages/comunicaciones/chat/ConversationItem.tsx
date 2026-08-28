import { memo, useMemo } from "react";
import { Camera, Phone, MessageSquare, Megaphone } from "lucide-react";
import { WhatsAppIcon, MessengerIcon, InstagramIcon, FormIcon } from "@/components/ChannelIcons";
import type { Conversation, Label, TenantMember } from "./types";
import { getDisplayName, normalizeConvStatus } from "./types";

interface ConversationItemProps {
  conv: Conversation;
  isActive: boolean;
  labels: Label[];
  tenantMembers: TenantMember[];
  onClick: (conv: Conversation) => void;
  onContextMenu: (e: React.MouseEvent, conv: Conversation) => void;
}

export const ConversationItem = memo(function ConversationItem({
  conv,
  isActive,
  labels,
  tenantMembers,
  onClick,
  onContextMenu,
}: ConversationItemProps) {
  const displayName = useMemo(() => getDisplayName(conv), [conv]);

  const assignedMember = useMemo(() => {
    const assignedTo = conv.record?.assignedTo;
    if (!assignedTo) return null;
    return tenantMembers.find((m) => m.userId === assignedTo) || null;
  }, [conv.record?.assignedTo, tenantMembers]);

  const formattedDate = useMemo(() => {
    if (!conv.lastMessageAt) return "";
    const d = new Date(conv.lastMessageAt);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) {
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    return d.toLocaleDateString([], { day: "numeric", month: "short" });
  }, [conv.lastMessageAt]);

  return (
    <button
      onClick={() => onClick(conv)}
      onContextMenu={(e) => onContextMenu(e, conv)}
      className={`w-full flex items-center gap-3 px-4 py-3 text-left border-b border-gray-50 transition-colors ${isActive ? "bg-brand-50" : "hover:bg-gray-50"}`}
    >
      <div className={`relative h-10 w-10 rounded-full flex items-center justify-center text-sm font-bold text-gray-600 shrink-0 ${conv.hasAdTracking ? "ring-2 ring-blue-500 ring-offset-1 bg-gradient-to-br from-blue-50 to-indigo-100" : "bg-gray-200"}`}>
        {displayName.charAt(0).toUpperCase()}
        {conv.hasAdTracking && conv.adPlatform && (
          <AdPlatformBadge platform={conv.adPlatform} />
        )}
        {assignedMember && (
          <span className="absolute -top-1 -left-1 h-4.5 w-4.5 rounded-full bg-brand-600 text-white text-[8px] font-bold flex items-center justify-center border-2 border-white shadow-sm" title={assignedMember.user.name}>
            {assignedMember.user.name.split(" ").map((n) => n[0]).join("").substring(0, 2).toUpperCase()}
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        {conv.inbox && (
          <p className="text-[10px] text-gray-400 flex items-center gap-1 mb-0.5">
            {conv.inbox.channel === "whatsapp" && <WhatsAppIcon className="h-2.5 w-2.5 text-green-500" />}
            {conv.inbox.channel === "messenger" && <MessengerIcon className="h-2.5 w-2.5 text-blue-500" />}
            {conv.inbox.channel === "instagram" && <InstagramIcon className="h-2.5 w-2.5 text-pink-500" />}
            {conv.inbox.channel === "form" && <FormIcon className="h-2.5 w-2.5 text-purple-500" />}
            {conv.inbox.name}
            {conv.lastMessageSource === "campaign" && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0 rounded-full bg-emerald-50 text-emerald-600 text-[9px] font-medium ml-1">
                <Megaphone className="h-2.5 w-2.5" />
                Campaña
              </span>
            )}
          </p>
        )}
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-gray-900 truncate">{displayName}</p>
          <div className="flex items-center gap-1.5 shrink-0 ml-2">
            {conv.botStatus === "handed_off" && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">Agente</span>
            )}
            {normalizeConvStatus(conv.status) === "resolved" && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">Resuelta</span>
            )}
            {normalizeConvStatus(conv.status) === "archived" && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-medium">Archivada</span>
            )}
            <span className="text-[10px] text-gray-400">{formattedDate}</span>
          </div>
        </div>
        <div className="flex items-center justify-between mt-0.5">
          <p className="text-xs text-gray-500 truncate flex items-center gap-1">
            <LastMessagePreview lastMessage={conv.lastMessage} />
          </p>
          {conv.unreadCount > 0 && (
            <span className="h-5 min-w-5 px-1 rounded-full bg-brand-600 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
              {conv.unreadCount}
            </span>
          )}
        </div>
        {conv.labelIds && conv.labelIds.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {conv.labelIds.map((lid) => {
              const lbl = labels.find((l) => l.id === lid);
              if (!lbl) return null;
              return (
                <span key={lid} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-medium" style={{ backgroundColor: `${lbl.color}20`, color: lbl.color }}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: lbl.color }} />
                  {lbl.label}
                </span>
              );
            })}
          </div>
        )}
      </div>
    </button>
  );
});

function LastMessagePreview({ lastMessage }: { lastMessage: string | null }) {
  if (!lastMessage) return <>...</>;
  const lower = lastMessage.toLowerCase();
  if (lower === "[image]") return <><Camera className="h-3 w-3 inline shrink-0" /> Foto</>;
  if (lower === "[video]") return <><Camera className="h-3 w-3 inline shrink-0" /> Video</>;
  if (lower === "[audio]") return <><Phone className="h-3 w-3 inline shrink-0" /> Audio</>;
  if (lower === "[document]") return <><MessageSquare className="h-3 w-3 inline shrink-0" /> Documento</>;
  if (lower === "[sticker]") return <>🎭 Sticker</>;
  return <>{lastMessage}</>;
}

function AdPlatformBadge({ platform }: { platform: string }) {
  return (
    <span className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full bg-white border border-gray-200 flex items-center justify-center shadow-sm">
      {platform === "meta" && <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="#1877F2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>}
      {platform === "google" && <svg className="h-2.5 w-2.5" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>}
      {platform === "tiktok" && <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="#000"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.88 2.89 2.89 0 01-2.88-2.88 2.89 2.89 0 012.88-2.88c.28 0 .56.04.82.11v-3.5a6.37 6.37 0 00-.82-.05A6.34 6.34 0 003.15 15.7a6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.34-6.34V9.4a8.16 8.16 0 004.76 1.52v-3.4a4.85 4.85 0 01-1-.83z"/></svg>}
      {platform === "linkedin" && <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="#0A66C2"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>}
      {platform === "organic" && <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>}
    </span>
  );
}
