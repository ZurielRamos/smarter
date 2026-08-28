import { memo, useState, useRef, useCallback } from "react";
import { Virtuoso } from "react-virtuoso";
import { MessageSquare, Phone, Mail, Filter, ArrowUpDown } from "lucide-react";
import { WhatsAppIcon, MessengerIcon, InstagramIcon, FormIcon } from "@/components/ChannelIcons";
import { ConversationItem } from "./ConversationItem";
import type { Conversation, Inbox, Label, TenantMember } from "./types";

interface ConversationListProps {
  conversations: Conversation[];
  activeConversationId: string | undefined;
  inboxes: Inbox[];
  labels: Label[];
  tenantMembers: TenantMember[];
  loadingConversations: boolean;
  hasMoreConversations: boolean;
  selectedInboxFilter: Set<string>;
  setSelectedInboxFilter: (v: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
  selectedLabelFilters: Set<string>;
  setSelectedLabelFilters: (v: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
  hideCampaignMessages: boolean;
  setHideCampaignMessages: (v: boolean | ((prev: boolean) => boolean)) => void;
  onSelectConversation: (conv: Conversation) => void;
  onContextMenu: (e: React.MouseEvent, conv: Conversation) => void;
  onLoadMore: () => void;
}

export const ConversationList = memo(function ConversationList({
  conversations,
  activeConversationId,
  inboxes,
  labels,
  tenantMembers,
  loadingConversations,
  hasMoreConversations,
  selectedInboxFilter,
  setSelectedInboxFilter,
  selectedLabelFilters,
  setSelectedLabelFilters,
  hideCampaignMessages,
  setHideCampaignMessages,
  onSelectConversation,
  onContextMenu,
  onLoadMore,
}: ConversationListProps) {
  const [channelDropdownOpen, setChannelDropdownOpen] = useState(false);
  const [filterDropdownOpen, setFilterDropdownOpen] = useState(false);
  const channelDropdownRef = useRef<HTMLDivElement>(null);
  const filterDropdownRef = useRef<HTMLDivElement>(null);

  const handleEndReached = useCallback(() => {
    if (!loadingConversations && hasMoreConversations) {
      onLoadMore();
    }
  }, [loadingConversations, hasMoreConversations, onLoadMore]);

  // itemContent estable: evita recrear el closure por render. Depende de las
  // props que sí afectan al render de cada item (activo, labels, miembros).
  const renderConversation = useCallback(
    (_index: number, conv: Conversation) => (
      <ConversationItem
        key={conv.id}
        conv={conv}
        isActive={conv.id === activeConversationId}
        labels={labels}
        tenantMembers={tenantMembers}
        onClick={onSelectConversation}
        onContextMenu={onContextMenu}
      />
    ),
    [activeConversationId, labels, tenantMembers, onSelectConversation, onContextMenu]
  );

  return (
    <div className="w-80 border-r border-gray-200 flex flex-col shrink-0">
      {/* Header with filters */}
      <div className="px-3 py-2.5 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="relative" ref={channelDropdownRef}>
            <button
              onClick={() => setChannelDropdownOpen((v) => !v)}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
            >
              {selectedInboxFilter.size > 0 ? (
                <>
                  <MessageSquare className="h-4 w-4 text-brand-500" />
                  <span>{selectedInboxFilter.size} canal{selectedInboxFilter.size > 1 ? "es" : ""}</span>
                </>
              ) : (
                <>
                  <MessageSquare className="h-4 w-4 text-gray-400" />
                  <span>Todos los canales</span>
                </>
              )}
              <svg className={`h-3.5 w-3.5 text-gray-400 transition-transform ${channelDropdownOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
            </button>
            {channelDropdownOpen && (
              <div className="absolute top-full left-0 mt-1.5 w-64 bg-white rounded-xl shadow-xl border border-gray-200/80 py-1.5 z-50">
                <p className="px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Canales</p>
                <button
                  onClick={() => { setSelectedInboxFilter(new Set()); setChannelDropdownOpen(false); }}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${selectedInboxFilter.size === 0 ? "bg-brand-50 text-brand-700 font-medium" : "text-gray-700 hover:bg-gray-50"}`}
                >
                  <div className="h-7 w-7 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                    <MessageSquare className="h-3.5 w-3.5 text-gray-500" />
                  </div>
                  <span className="flex-1 text-left">Todos los canales</span>
                  {selectedInboxFilter.size === 0 && <span className="text-brand-500">✓</span>}
                </button>
                {inboxes.map((inbox) => {
                  const isSelected = selectedInboxFilter.has(inbox.id);
                  return (
                    <button
                      key={inbox.id}
                      onClick={() => {
                        setSelectedInboxFilter((prev) => {
                          const next = new Set(prev);
                          if (next.has(inbox.id)) next.delete(inbox.id);
                          else next.add(inbox.id);
                          return next;
                        });
                      }}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${isSelected ? "bg-brand-50 text-brand-700 font-medium" : "text-gray-700 hover:bg-gray-50"}`}
                    >
                      <div className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 ${inbox.channel === "whatsapp" ? "bg-green-50" : inbox.channel === "messenger" ? "bg-blue-50" : inbox.channel === "form" ? "bg-purple-50" : inbox.channel === "sms" ? "bg-sky-50" : inbox.channel === "llamada" ? "bg-purple-50" : inbox.channel === "email" ? "bg-orange-50" : "bg-pink-50"}`}>
                        {inbox.channel === "whatsapp" && <WhatsAppIcon className="h-3.5 w-3.5 text-green-600" />}
                        {inbox.channel === "messenger" && <MessengerIcon className="h-3.5 w-3.5 text-blue-600" />}
                        {inbox.channel === "instagram" && <InstagramIcon className="h-3.5 w-3.5 text-pink-600" />}
                        {inbox.channel === "sms" && <MessageSquare className="h-3.5 w-3.5 text-sky-600" />}
                        {inbox.channel === "llamada" && <Phone className="h-3.5 w-3.5 text-purple-600" />}
                        {inbox.channel === "email" && <Mail className="h-3.5 w-3.5 text-orange-600" />}
                        {inbox.channel === "form" && <FormIcon className="h-3.5 w-3.5 text-purple-600" />}
                      </div>
                      <span className="flex-1 text-left">{inbox.name}</span>
                      {inbox.status === "connected" ? <span className="h-2 w-2 rounded-full bg-green-400" /> : <span className="h-2 w-2 rounded-full bg-gray-300" />}
                      {isSelected && <span className="text-brand-500">✓</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1">
            <div className="relative" ref={filterDropdownRef}>
              <button
                onClick={() => setFilterDropdownOpen((v) => !v)}
                className={`p-1.5 rounded-lg transition-colors ${selectedLabelFilters.size > 0 || hideCampaignMessages ? "text-brand-600 bg-brand-50" : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"}`}
                title="Filtrar"
              >
                <Filter className="h-4 w-4" />
              </button>
              {filterDropdownOpen && (
                <div className="absolute top-full right-0 mt-1.5 w-64 bg-white rounded-xl shadow-xl border border-gray-200/80 py-2 z-50">
                  <div className="px-3 py-2 flex items-center justify-between">
                    <span className="text-sm text-gray-700">Mensajes de campaña</span>
                    <button
                      onClick={() => setHideCampaignMessages((v) => !v)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${!hideCampaignMessages ? "bg-brand-600" : "bg-gray-200"}`}
                    >
                      <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${!hideCampaignMessages ? "translate-x-[18px]" : "translate-x-[3px]"}`} />
                    </button>
                  </div>
                  {labels.length > 0 && (
                    <div className="border-t border-gray-100 mt-1 pt-1">
                      <p className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Etiquetas</p>
                      <button
                        onClick={() => setSelectedLabelFilters(new Set())}
                        className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${selectedLabelFilters.size === 0 ? "bg-brand-50 text-brand-700 font-medium" : "text-gray-700 hover:bg-gray-50"}`}
                      >
                        <span className="flex-1 text-left">Todas</span>
                        {selectedLabelFilters.size === 0 && <span className="text-brand-500 text-xs">✓</span>}
                      </button>
                      {labels.map((lbl) => {
                        const isSelected = selectedLabelFilters.has(lbl.id);
                        return (
                          <button
                            key={lbl.id}
                            onClick={() => {
                              setSelectedLabelFilters((prev) => {
                                const next = new Set(prev);
                                if (next.has(lbl.id)) next.delete(lbl.id);
                                else next.add(lbl.id);
                                return next;
                              });
                            }}
                            className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${isSelected ? "bg-brand-50 text-brand-700 font-medium" : "text-gray-700 hover:bg-gray-50"}`}
                          >
                            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: lbl.color }} />
                            <span className="flex-1 text-left truncate">{lbl.label}</span>
                            {isSelected && <span className="text-brand-500 text-xs">✓</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {(selectedLabelFilters.size > 0 || hideCampaignMessages) && (
                    <div className="border-t border-gray-100 mt-1.5 pt-1.5">
                      <button
                        onClick={() => { setSelectedLabelFilters(new Set()); setHideCampaignMessages(false); }}
                        className="w-full px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 transition-colors text-left"
                      >
                        Limpiar filtros
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
            <button className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors" title="Ordenar">
              <ArrowUpDown className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Virtualized conversation list */}
      {conversations.length === 0 && !loadingConversations ? (
        <div className="flex flex-col items-center justify-center h-full text-center px-6">
          <MessageSquare className="h-8 w-8 text-gray-300 mb-2" />
          <p className="text-sm text-gray-500">Sin conversaciones</p>
          <p className="text-[11px] text-gray-400 mt-1">Los mensajes entrantes aparecerán aquí</p>
        </div>
      ) : (
        <Virtuoso
          style={{ flex: 1 }}
          data={conversations}
          endReached={handleEndReached}
          overscan={200}
          itemContent={renderConversation}
          components={{
            Footer: () => loadingConversations ? (
              <div className="flex items-center justify-center py-3">
                <div className="h-4 w-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : null,
          }}
        />
      )}
    </div>
  );
});
