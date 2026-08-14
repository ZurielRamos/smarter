import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Mail, Phone, MapPin, Calendar, Tag, MessageSquare, Camera, MoreHorizontal, StickyNote, Plus, Trash2, User, ArrowRightLeft, UserPlus, Send, Pencil, Clock, ShoppingCart, CalendarCheck, Presentation, Star, FileText, Zap } from "lucide-react";
import { WhatsAppIcon, MessengerIcon, InstagramIcon, FormIcon } from "@/components/ChannelIcons";
import { getClient, getConversationsByRecord, getNotes, deleteNote, getActivities, getContactEvents, createContactEvent, deleteContactEvent } from "@/services/api";
import type { ClientRecord, ConversationRecord, NoteRecord, ActivityRecord, ContactEventRecord } from "@/services/api";
import { useAuth } from "@/context/AuthContext";
import { AddNoteModal } from "./AddNoteModal";
import { ConversationPreviewModal } from "./ConversationPreviewModal";
import { toast } from "sonner";
import headerBg from "@/assets/header-background.jpg";

const statusColors: Record<string, { bg: string; text: string; label: string }> = {
  lead: { bg: "bg-blue-100", text: "text-blue-700", label: "Lead" },
  contactado: { bg: "bg-sky-100", text: "text-sky-700", label: "Contactado" },
  interesado: { bg: "bg-indigo-100", text: "text-indigo-700", label: "Interesado" },
  oportunidad: { bg: "bg-amber-100", text: "text-amber-700", label: "Oportunidad" },
  cliente: { bg: "bg-green-100", text: "text-green-700", label: "Cliente" },
  premium: { bg: "bg-purple-100", text: "text-purple-700", label: "Premium" },
  fidelizado: { bg: "bg-emerald-100", text: "text-emerald-700", label: "Fidelizado" },
  inactivo: { bg: "bg-gray-100", text: "text-gray-600", label: "Inactivo" },
  perdido: { bg: "bg-red-100", text: "text-red-700", label: "Perdido" },
  // Legacy support
  active: { bg: "bg-green-100", text: "text-green-700", label: "Activo" },
  inactive: { bg: "bg-gray-100", text: "text-gray-600", label: "Inactivo" },
  blocked: { bg: "bg-red-100", text: "text-red-700", label: "Bloqueado" },
};

const genderLabels: Record<string, string> = {
  male: "Masculino",
  female: "Femenino",
  other: "Otro",
  prefer_not_to_say: "Prefiere no decir",
};

const CHANNEL_ICONS: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string; bg: string }> = {
  whatsapp: { icon: WhatsAppIcon, color: "text-green-600", bg: "bg-green-50" },
  messenger: { icon: MessengerIcon, color: "text-blue-600", bg: "bg-blue-50" },
  instagram: { icon: Camera, color: "text-pink-600", bg: "bg-pink-50" },
  sms: { icon: MessageSquare, color: "text-sky-600", bg: "bg-sky-50" },
  llamada: { icon: Phone, color: "text-purple-600", bg: "bg-purple-50" },
  email: { icon: Mail, color: "text-orange-600", bg: "bg-orange-50" },
  form: { icon: FormIcon, color: "text-purple-600", bg: "bg-purple-50" },
};

export function ClientDetail() {
  const { slug, id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const tenantId = user?.tenantRoles.find((tr) => tr.tenant.slug === slug)?.tenantId || "";
  const [client, setClient] = useState<ClientRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [conversations, setConversations] = useState<ConversationRecord[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState(false);
  const [notes, setNotes] = useState<NoteRecord[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [previewConversation, setPreviewConversation] = useState<ConversationRecord | null>(null);
  const [activities, setActivities] = useState<ActivityRecord[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(false);
  const [activitiesPage, setActivitiesPage] = useState(1);
  const [activitiesTotal, setActivitiesTotal] = useState(0);
  const [loadingMoreActivities, setLoadingMoreActivities] = useState(false);
  const timelineRef = useRef<HTMLDivElement>(null);
  const [contactEvents, setContactEvents] = useState<ContactEventRecord[]>([]);
  const [contactEventsLoading, setContactEventsLoading] = useState(false);
  const [showEventForm, setShowEventForm] = useState(false);
  const [eventForm, setEventForm] = useState({ type: 'purchase', name: '', value: '', currency: 'COP' });

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getClient(id)
      .then((data) => setClient(data))
      .catch(() => navigate(`/${slug}/clients`))
      .finally(() => setLoading(false));
  }, [id, slug, navigate]);

  useEffect(() => {
    if (!id) return;
    setConversationsLoading(true);
    getConversationsByRecord(id)
      .then((res) => setConversations(res.data))
      .catch(() => setConversations([]))
      .finally(() => setConversationsLoading(false));
  }, [id]);

  const loadNotes = () => {
    if (!id) return;
    setNotesLoading(true);
    getNotes(id)
      .then((res) => setNotes(res.data))
      .catch(() => setNotes([]))
      .finally(() => setNotesLoading(false));
  };

  useEffect(() => { loadNotes(); }, [id]);

  useEffect(() => {
    if (!id) return;
    setActivitiesLoading(true);
    setActivitiesPage(1);
    getActivities(id, 1, 10).then((res) => {
      setActivities(res.data);
      setActivitiesTotal(res.total);
    }).catch(() => setActivities([])).finally(() => setActivitiesLoading(false));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    setContactEventsLoading(true);
    getContactEvents(id).then((res) => setContactEvents(res.data)).catch(() => setContactEvents([])).finally(() => setContactEventsLoading(false));
  }, [id]);

  const loadMoreActivities = async () => {
    if (!id || loadingMoreActivities || activities.length >= activitiesTotal) return;
    setLoadingMoreActivities(true);
    const nextPage = activitiesPage + 1;
    try {
      const res = await getActivities(id, nextPage, 10);
      setActivities((prev) => [...prev, ...res.data]);
      setActivitiesPage(nextPage);
      setActivitiesTotal(res.total);
    } catch { /* ignore */ }
    setLoadingMoreActivities(false);
  };

  const handleTimelineScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 80) {
      loadMoreActivities();
    }
  };

  const handleCreateEvent = async () => {
    if (!id || !tenantId || !eventForm.name) return;
    try {
      await createContactEvent({
        tenantId,
        recordId: id,
        type: eventForm.type,
        name: eventForm.name,
        value: eventForm.value ? parseFloat(eventForm.value) : undefined,
        currency: eventForm.currency,
        actorId: user?.id,
        actorName: user?.name,
      });
      toast.success("Evento registrado");
      setShowEventForm(false);
      setEventForm({ type: 'purchase', name: '', value: '', currency: 'COP' });
      getContactEvents(id).then((res) => setContactEvents(res.data)).catch(() => {});
    } catch {
      toast.error("Error al registrar evento");
    }
  };

  if (!client && !loading) return null;

  const fullName = client ? [client.firstName, client.lastName].filter(Boolean).join(" ") || "Sin nombre" : "";
  const status = statusColors[client?.status || "active"] || statusColors.active;

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Header */}
      <div
        className="relative px-8 pt-16 pb-4 rounded-b-2xl overflow-hidden shrink-0"
        style={{ backgroundImage: `url(${headerBg})`, backgroundSize: "cover", backgroundPosition: "center" }}
      >
        <div className="absolute inset-0 bg-gradient-to-r from-black/60 to-black/30" />
        <div className="relative z-10 flex items-center gap-3">
          <button
            onClick={() => navigate(`/${slug}/clients`)}
            className="h-9 w-9 rounded-full flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 transition-colors shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-lg font-semibold text-white">Información del contacto</h1>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
        </div>
      ) : client ? (
        <div className="flex-1 overflow-y-auto px-8 py-6">
          <div className="max-w-5xl grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">

            {/* Left Column - Profile Card + Activity */}
            <div className="space-y-6">
              {/* Profile Card */}
              <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
                <div className={`relative h-20 w-20 mx-auto rounded-full flex items-center justify-center text-3xl font-semibold text-gray-600 ${client.hasAdTracking ? "ring-3 ring-blue-500 ring-offset-2 bg-gradient-to-br from-blue-50 to-indigo-100" : "bg-gray-100"}`}>
                  {client.avatarUrl ? (
                    <img src={client.avatarUrl} alt={fullName} className="h-full w-full rounded-full object-cover" />
                  ) : (
                    (client.firstName?.[0] || client.email?.[0] || "?").toUpperCase()
                  )}
                  {client.hasAdTracking && (client.adLastPlatform || client.adFirstPlatform) && (
                    <span className="absolute -bottom-0.5 -right-0.5 h-5 w-5 rounded-full bg-white border border-gray-200 flex items-center justify-center shadow-sm">
                      {(client.adLastPlatform || client.adFirstPlatform) === 'meta' && <svg className="h-3 w-3" viewBox="0 0 24 24" fill="#1877F2"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>}
                      {(client.adLastPlatform || client.adFirstPlatform) === 'google' && <svg className="h-3 w-3" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>}
                      {(client.adLastPlatform || client.adFirstPlatform) === 'tiktok' && <svg className="h-3 w-3" viewBox="0 0 24 24" fill="#000"><path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.88 2.89 2.89 0 01-2.88-2.88 2.89 2.89 0 012.88-2.88c.28 0 .56.04.82.11v-3.5a6.37 6.37 0 00-.82-.05A6.34 6.34 0 003.15 15.7a6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.34-6.34V9.4a8.16 8.16 0 004.76 1.52v-3.4a4.85 4.85 0 01-1-.83z"/></svg>}
                      {(client.adLastPlatform || client.adFirstPlatform) === 'linkedin' && <svg className="h-3 w-3" viewBox="0 0 24 24" fill="#0A66C2"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>}
                      {(client.adLastPlatform || client.adFirstPlatform) === 'organic' && <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>}
                    </span>
                  )}
                </div>
                <h2 className="text-lg font-semibold text-gray-900 mt-3">{fullName}</h2>
                <p className="text-sm text-gray-500 mt-0.5">{client.email || "Sin email"}</p>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium mt-2 ${status.bg} ${status.text}`}>
                  {status.label}
                </span>

                {/* Action buttons */}
                <div className="flex items-center justify-center gap-4 mt-5 pt-5 border-t border-gray-100">
                  {client.phone && (
                    <ActionButton icon={Phone} label="Llamar" onClick={() => window.open(`tel:${client.phone}`)} />
                  )}
                  {client.email && (
                    <ActionButton icon={Mail} label="Email" onClick={() => window.open(`mailto:${client.email}`)} />
                  )}
                  <ActionButton icon={MessageSquare} label="Mensaje" onClick={() => navigate(`/${slug}/comunicaciones/conversaciones`)} />
                  <ActionButton icon={MoreHorizontal} label="Más" onClick={() => {}} />
                </div>
              </div>

              {/* Activity / Conversations */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="text-sm font-semibold text-gray-900 mb-4">Conversaciones</h3>
                {conversationsLoading ? (
                  <div className="flex items-center justify-center py-6">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-emerald-600" />
                  </div>
                ) : conversations.length === 0 ? (
                  <p className="text-sm text-gray-500 py-4 text-center">No hay conversaciones</p>
                ) : (
                  <div className="space-y-2">
                    {conversations.map((conv) => {
                      const channel = conv.inbox?.channel || "";
                      const channelInfo = CHANNEL_ICONS[channel] || { icon: MessageSquare, color: "text-gray-500", bg: "bg-gray-50" };
                      const ChannelIcon = channelInfo.icon;
                      return (
                        <button
                          key={conv.id}
                          onClick={() => setPreviewConversation(conv)}
                          className="w-full flex items-start gap-3 p-3 rounded-lg border border-gray-100 hover:border-gray-200 hover:bg-gray-50 transition-colors text-left"
                        >
                          <div className={`h-8 w-8 rounded-lg ${channelInfo.bg} flex items-center justify-center shrink-0 mt-0.5`}>
                            <ChannelIcon className={`h-4 w-4 ${channelInfo.color}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-medium text-gray-900 truncate">
                                {conv.inbox?.name || "Mensaje"}
                              </span>
                              {conv.unreadCount > 0 && (
                                <span className="h-4 min-w-[16px] px-1 rounded-full bg-emerald-500 text-white text-[10px] font-medium flex items-center justify-center shrink-0">
                                  {conv.unreadCount}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-500 truncate mt-0.5">
                              {conv.lastMessage || "Sin mensajes"}
                            </p>
                            {conv.lastMessageAt && (
                              <p className="text-[11px] text-gray-400 mt-0.5">
                                {new Date(conv.lastMessageAt).toLocaleString("es-CO")}
                              </p>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Notes */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-gray-900">Notas</h3>
                  <button
                    onClick={() => setShowNoteModal(true)}
                    className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-emerald-600 hover:bg-emerald-50 font-medium transition-colors"
                  >
                    <Plus className="h-3 w-3" />
                    Agregar
                  </button>
                </div>
                {notesLoading ? (
                  <div className="flex items-center justify-center py-6">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-emerald-600" />
                  </div>
                ) : notes.length === 0 ? (
                  <div className="text-center py-6">
                    <StickyNote className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">Sin notas aún</p>
                    <button
                      onClick={() => setShowNoteModal(true)}
                      className="text-xs text-emerald-600 hover:text-emerald-700 font-medium mt-1"
                    >
                      Crear la primera nota
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {notes.map((note) => {
                      const isAuthor = user?.id === note.authorId;
                      const createdAt = new Date(note.createdAt);
                      const withinOneHour = (Date.now() - createdAt.getTime()) < 3600000;
                      const canDelete = isAuthor && withinOneHour;

                      return (
                        <div key={note.id} className="group p-3 rounded-lg border border-gray-100 hover:border-gray-200 transition-colors">
                          <div className="flex items-start justify-between gap-2">
                            <div
                              className="text-xs text-gray-700 leading-relaxed flex-1 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_a]:text-emerald-600 [&_a]:underline [&_b]:font-semibold"
                              dangerouslySetInnerHTML={{ __html: note.content }}
                            />
                            {canDelete && (
                              <button
                                onClick={async () => {
                                  if (confirm("¿Eliminar esta nota?")) {
                                    await deleteNote(note.id);
                                    toast.success("Nota eliminada");
                                    loadNotes();
                                  }
                                }}
                                className="h-5 w-5 rounded flex items-center justify-center text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all shrink-0"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-2 text-[11px] text-gray-400">
                            {note.authorName && (
                              <>
                                <User className="h-3 w-3" />
                                <span>{note.authorName}</span>
                                <span>·</span>
                              </>
                            )}
                            <span>{new Date(note.createdAt).toLocaleString("es-CO")}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Contact Events */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                    <Zap className="h-4 w-4 text-amber-500" />
                    Eventos de conversión
                  </h3>
                  <button
                    onClick={() => setShowEventForm(true)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Registrar
                  </button>
                </div>

                {/* Events list */}
                {contactEventsLoading ? (
                  <div className="flex items-center justify-center py-6">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-amber-500" />
                  </div>
                ) : contactEvents.length === 0 ? (
                  <div className="text-center py-6">
                    <Zap className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-xs text-gray-400">Sin eventos registrados</p>
                    <p className="text-[11px] text-gray-300 mt-1">Registra hitos como compras, citas o demos</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {contactEvents.map((evt) => (
                      <div key={evt.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50 group">
                        <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                          {evt.type === 'purchase' && <ShoppingCart className="h-4 w-4 text-green-600" />}
                          {evt.type === 'appointment' && <CalendarCheck className="h-4 w-4 text-blue-600" />}
                          {evt.type === 'demo' && <Presentation className="h-4 w-4 text-purple-600" />}
                          {evt.type === 'qualified' && <Star className="h-4 w-4 text-amber-600" />}
                          {evt.type === 'proposal' && <FileText className="h-4 w-4 text-indigo-600" />}
                          {evt.type === 'registration' && <UserPlus className="h-4 w-4 text-cyan-600" />}
                          {evt.type === 'subscription' && <ArrowRightLeft className="h-4 w-4 text-emerald-600" />}
                          {evt.type === 'custom' && <Zap className="h-4 w-4 text-gray-600" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{evt.name}</p>
                          <p className="text-[11px] text-gray-400">
                            {new Date(evt.createdAt).toLocaleDateString()} — {evt.actorName || 'Sistema'}
                            {evt.dispatched && <span className="ml-1.5 text-green-600">✓ Reportado a ads</span>}
                          </p>
                        </div>
                        {evt.value && (
                          <span className="text-sm font-semibold text-gray-700">
                            {Number(evt.value).toLocaleString()} {evt.currency}
                          </span>
                        )}
                        <button
                          onClick={async () => {
                            await deleteContactEvent(evt.id);
                            setContactEvents((prev) => prev.filter((e) => e.id !== evt.id));
                            toast.success("Evento eliminado");
                          }}
                          className="p-1 rounded text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Timeline */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="text-sm font-semibold text-gray-900 mb-4">Timeline</h3>
                {activitiesLoading ? (
                  <div className="flex items-center justify-center py-6">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-emerald-600" />
                  </div>
                ) : activities.length === 0 ? (
                  <p className="text-sm text-gray-500 py-4 text-center">Sin actividad registrada</p>
                ) : (
                  <div
                    ref={timelineRef}
                    onScroll={handleTimelineScroll}
                    className="relative max-h-[400px] overflow-y-auto pr-1"
                  >
                    {/* Vertical line */}
                    <div className="absolute left-[11px] top-2 bottom-2 w-px bg-gray-200" />
                    <div className="space-y-4">
                      {activities.map((activity) => (
                        <TimelineItem key={activity.id} activity={activity} />
                      ))}
                    </div>
                    {loadingMoreActivities && (
                      <div className="flex items-center justify-center py-3">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-emerald-600" />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Right Column - Contact Info */}
            <div className="space-y-6">
              {/* General */}
              <InfoSection title="General">
                <InfoRow label="Nombre" value={fullName} />
                <InfoRow label="Estado" value={status.label} badge badgeClass={`${status.bg} ${status.text}`} />
                <InfoRow label="Email" value={client.email} />
                <InfoRow label="Teléfono" value={client.phone ? `${client.countryCode || ""} ${client.phone}`.trim() : null} />
                <InfoRow label="Canal" value={client.channelSource} />
                {client.score > 0 && <InfoRow label="Score" value={String(client.score)} />}
              </InfoSection>

              {/* Other Info */}
              <InfoSection title="Otra información">
                <InfoRow label="Género" value={client.gender ? genderLabels[client.gender] || client.gender : null} />
                <InfoRow label="Fecha de nacimiento" value={client.birthDate ? new Date(client.birthDate).toLocaleDateString("es-CO") : null} />
                <InfoRow label="Documento" value={client.documentNumber ? `${client.documentType || ""} ${client.documentNumber}`.trim() : null} />
                <InfoRow label="Ciudad" value={client.city} />
                <InfoRow label="Región" value={client.region} />
                <InfoRow label="Fuente" value={client.source} />
              </InfoSection>

              {/* Consent & Tags */}
              <InfoSection title="Consentimiento y etiquetas">
                <InfoRow label="Opt-in WhatsApp" value={client.optInWhatsapp ? "Sí" : "No"} />
                <InfoRow label="Opt-in Email" value={client.optInEmail ? "Sí" : "No"} />
                {client.tags && client.tags.length > 0 && (
                  <div className="flex items-center justify-between py-2.5 border-b border-gray-100 last:border-0">
                    <span className="text-sm text-gray-500">Etiquetas</span>
                    <div className="flex flex-wrap gap-1 justify-end max-w-[60%]">
                      {client.tags.map((tag) => (
                        <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <Tag className="h-2.5 w-2.5" />
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </InfoSection>

              {/* Custom Data */}
              {client.customData && Object.keys(client.customData).length > 0 && (
                <InfoSection title="Campos personalizados">
                  {Object.entries(client.customData).map(([key, value]) => (
                    <InfoRow key={key} label={key} value={value != null ? String(value) : null} />
                  ))}
                </InfoSection>
              )}

              {/* Timestamps */}
              <InfoSection title="Fechas">
                <InfoRow label="Último contacto" value={client.lastContactAt ? new Date(client.lastContactAt).toLocaleString("es-CO") : null} />
                <InfoRow label="Última actividad" value={client.lastActivityAt ? new Date(client.lastActivityAt).toLocaleString("es-CO") : null} />
                <InfoRow label="Creado" value={new Date(client.createdAt).toLocaleString("es-CO")} />
                <InfoRow label="Actualizado" value={new Date(client.updatedAt).toLocaleString("es-CO")} />
              </InfoSection>
            </div>
          </div>
        </div>
      ) : null}

      {/* Note Modal */}
      {showNoteModal && client && (
        <AddNoteModal
          client={client}
          onClose={() => setShowNoteModal(false)}
          onSaved={() => { setShowNoteModal(false); toast.success("Nota guardada"); loadNotes(); }}
        />
      )}

      {/* Conversation Preview Modal */}
      {previewConversation && (
        <ConversationPreviewModal
          conversation={previewConversation}
          onClose={() => setPreviewConversation(null)}
          onGoToConversation={() => { navigate(`/${slug}/comunicaciones/conversaciones/${previewConversation.id}`); }}
        />
      )}

      {/* Event Registration Modal */}
      {showEventForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={() => setShowEventForm(false)}>
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
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

            {/* Body */}
            <div className="px-6 py-5 space-y-5">
              {/* Event Type Selection */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">¿Qué ocurrió?</label>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { value: 'purchase', label: 'Compra', desc: 'Venta cerrada', icon: ShoppingCart, color: 'text-green-600' },
                    { value: 'appointment', label: 'Cita', desc: 'Reunión agendada', icon: CalendarCheck, color: 'text-blue-600' },
                    { value: 'demo', label: 'Demo', desc: 'Demostración realizada', icon: Presentation, color: 'text-purple-600' },
                    { value: 'qualified', label: 'Calificado', desc: 'Lead cualificado', icon: Star, color: 'text-amber-600' },
                    { value: 'proposal', label: 'Propuesta', desc: 'Cotización enviada', icon: FileText, color: 'text-indigo-600' },
                    { value: 'registration', label: 'Registro', desc: 'Se registró', icon: UserPlus, color: 'text-cyan-600' },
                    { value: 'subscription', label: 'Suscripción', desc: 'Plan activado', icon: ArrowRightLeft, color: 'text-emerald-600' },
                    { value: 'custom', label: 'Otro', desc: 'Evento personalizado', icon: Zap, color: 'text-gray-600' },
                  ] as const).map((opt) => {
                    const Icon = opt.icon;
                    const isSelected = eventForm.type === opt.value;
                    return (
                      <button
                        key={opt.value}
                        onClick={() => setEventForm({ ...eventForm, type: opt.value, name: eventForm.name || opt.label })}
                        className={`flex items-center gap-2.5 p-3 rounded-xl border text-left transition-all ${isSelected ? "border-brand-500 bg-brand-50/50 ring-1 ring-brand-500/20" : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"}`}
                      >
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

              {/* Event Name */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Nombre del evento</label>
                <input
                  type="text"
                  value={eventForm.name}
                  onChange={(e) => setEventForm({ ...eventForm, name: e.target.value })}
                  placeholder="Ej: Compra Plan Premium, Demo producto, Cita presencial..."
                  className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400"
                />
                <p className="text-[11px] text-gray-400 mt-1">Describe brevemente qué pasó con este contacto</p>
              </div>

              {/* Value */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Valor monetario <span className="text-gray-400 font-normal">(opcional)</span></label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={eventForm.value}
                    onChange={(e) => setEventForm({ ...eventForm, value: e.target.value })}
                    placeholder="0"
                    className="flex-1 px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400"
                  />
                  <select
                    value={eventForm.currency}
                    onChange={(e) => setEventForm({ ...eventForm, currency: e.target.value })}
                    className="w-24 px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-400"
                  >
                    <option value="COP">COP</option>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="MXN">MXN</option>
                  </select>
                </div>
                <p className="text-[11px] text-gray-400 mt-1">Si este evento tiene un valor de venta, se reportará a las plataformas de ads</p>
              </div>

              {/* Info box */}
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-blue-50 border border-blue-100">
                <svg className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <p className="text-[11px] text-blue-700 leading-relaxed">
                  Si este contacto llegó desde un anuncio (Google, Meta, TikTok), este evento se reportará automáticamente a la plataforma de ads como una conversión.
                </p>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowEventForm(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 font-medium transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateEvent}
                disabled={!eventForm.name}
                className="px-5 py-2 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 rounded-xl transition-colors disabled:opacity-50 shadow-sm"
              >
                Registrar evento
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ActionButton({ icon: Icon, label, onClick }: { icon: React.ElementType; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex flex-col items-center gap-1 group">
      <div className="h-10 w-10 rounded-full border border-gray-200 flex items-center justify-center group-hover:bg-gray-50 group-hover:border-gray-300 transition-colors">
        <Icon className="h-4.5 w-4.5 text-gray-600" />
      </div>
      <span className="text-[11px] text-gray-500">{label}</span>
    </button>
  );
}

function InfoSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
      </div>
      <div className="px-5">{children}</div>
    </div>
  );
}

function InfoRow({ label, value, badge, badgeClass }: { label: string; value: string | null | undefined; badge?: boolean; badgeClass?: string }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-500">{label}</span>
      {badge ? (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${badgeClass}`}>
          {value || "—"}
        </span>
      ) : (
        <span className="text-sm font-medium text-gray-900 text-right max-w-[60%] truncate">{value || "—"}</span>
      )}
    </div>
  );
}

function TimelineItem({ activity }: { activity: ActivityRecord }) {
  const iconMap: Record<string, { icon: React.ElementType; bg: string; color: string }> = {
    status_changed: { icon: ArrowRightLeft, bg: "bg-blue-100", color: "text-blue-600" },
    assigned: { icon: UserPlus, bg: "bg-indigo-100", color: "text-indigo-600" },
    note_created: { icon: StickyNote, bg: "bg-amber-100", color: "text-amber-600" },
    message_received: { icon: MessageSquare, bg: "bg-green-100", color: "text-green-600" },
    message_sent: { icon: Send, bg: "bg-emerald-100", color: "text-emerald-600" },
    contact_created: { icon: Plus, bg: "bg-gray-100", color: "text-gray-600" },
    contact_updated: { icon: Pencil, bg: "bg-gray-100", color: "text-gray-500" },
    tag_added: { icon: Tag, bg: "bg-purple-100", color: "text-purple-600" },
    tag_removed: { icon: Tag, bg: "bg-red-100", color: "text-red-600" },
    conversion_event: { icon: Zap, bg: "bg-amber-100", color: "text-amber-600" },
  };
  const config = iconMap[activity.type] || { icon: Clock, bg: "bg-gray-100", color: "text-gray-500" };
  const Icon = config.icon;

  return (
    <div className="flex items-start gap-3 relative">
      <div className={`h-[22px] w-[22px] rounded-full ${config.bg} flex items-center justify-center shrink-0 z-10`}>
        <Icon className={`h-3 w-3 ${config.color}`} />
      </div>
      <div className="flex-1 min-w-0 pt-0.5">
        <p className="text-xs text-gray-700">{activity.description || activity.type}</p>
        <div className="flex items-center gap-2 mt-0.5">
          {activity.actorName && <span className="text-[11px] text-gray-400">{activity.actorName}</span>}
          <span className="text-[11px] text-gray-400">{new Date(activity.createdAt).toLocaleString("es-CO")}</span>
        </div>
      </div>
    </div>
  );
}
