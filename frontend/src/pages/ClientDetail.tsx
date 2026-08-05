import { useEffect, useState } from "react";
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
    getActivities(id).then((res) => setActivities(res.data)).catch(() => setActivities([])).finally(() => setActivitiesLoading(false));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    setContactEventsLoading(true);
    getContactEvents(id).then((res) => setContactEvents(res.data)).catch(() => setContactEvents([])).finally(() => setContactEventsLoading(false));
  }, [id]);

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
                <div className="h-20 w-20 mx-auto rounded-full bg-gray-100 flex items-center justify-center text-3xl font-semibold text-gray-600 overflow-hidden relative">
                  {client.avatarUrl ? (
                    <img src={client.avatarUrl} alt={fullName} className="h-full w-full object-cover" />
                  ) : (
                    (client.firstName?.[0] || client.email?.[0] || "?").toUpperCase()
                  )}
                  {client.status === "active" && (
                    <span className="absolute bottom-0.5 right-0.5 h-3.5 w-3.5 rounded-full bg-green-500 border-2 border-white" />
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
                    onClick={() => setShowEventForm((v) => !v)}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-brand-600 hover:bg-brand-50 rounded-lg transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Registrar
                  </button>
                </div>

                {/* Event form */}
                {showEventForm && (
                  <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200 space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        value={eventForm.type}
                        onChange={(e) => setEventForm({ ...eventForm, type: e.target.value, name: e.target.selectedOptions[0]?.dataset.label || eventForm.name })}
                        className="px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                      >
                        <option value="purchase" data-label="Compra">🛒 Compra</option>
                        <option value="appointment" data-label="Cita agendada">📅 Cita agendada</option>
                        <option value="demo" data-label="Demo realizada">🎥 Demo</option>
                        <option value="qualified" data-label="Lead calificado">⭐ Calificado</option>
                        <option value="proposal" data-label="Propuesta enviada">📄 Propuesta</option>
                        <option value="registration" data-label="Registro">📝 Registro</option>
                        <option value="subscription" data-label="Suscripción">🔄 Suscripción</option>
                        <option value="custom" data-label="">✨ Personalizado</option>
                      </select>
                      <input
                        type="text"
                        value={eventForm.name}
                        onChange={(e) => setEventForm({ ...eventForm, name: e.target.value })}
                        placeholder="Nombre del evento"
                        className="px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        value={eventForm.value}
                        onChange={(e) => setEventForm({ ...eventForm, value: e.target.value })}
                        placeholder="Valor (opcional)"
                        className="px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                      />
                      <select
                        value={eventForm.currency}
                        onChange={(e) => setEventForm({ ...eventForm, currency: e.target.value })}
                        className="px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                      >
                        <option value="COP">COP</option>
                        <option value="USD">USD</option>
                        <option value="EUR">EUR</option>
                        <option value="MXN">MXN</option>
                      </select>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setShowEventForm(false)} className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
                      <button onClick={handleCreateEvent} disabled={!eventForm.name} className="px-3 py-1.5 text-xs font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg disabled:opacity-50">Registrar</button>
                    </div>
                  </div>
                )}

                {/* Events list */}
                {contactEventsLoading ? (
                  <div className="flex items-center justify-center py-6">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-amber-500" />
                  </div>
                ) : contactEvents.length === 0 ? (
                  <div className="text-center py-6">
                    <Zap className="h-8 w-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-xs text-gray-400">Sin eventos registrados</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {contactEvents.map((evt) => (
                      <div key={evt.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50 group">
                        <div className="h-8 w-8 rounded-full bg-amber-50 flex items-center justify-center text-sm shrink-0">
                          {evt.type === 'purchase' && '🛒'}
                          {evt.type === 'appointment' && '📅'}
                          {evt.type === 'demo' && '🎥'}
                          {evt.type === 'qualified' && '⭐'}
                          {evt.type === 'proposal' && '📄'}
                          {evt.type === 'registration' && '📝'}
                          {evt.type === 'subscription' && '🔄'}
                          {evt.type === 'custom' && '✨'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{evt.name}</p>
                          <p className="text-[11px] text-gray-400">
                            {new Date(evt.createdAt).toLocaleDateString()} — {evt.actorName || 'Sistema'}
                            {evt.dispatched && <span className="ml-1.5 text-green-600">✓ Reportado</span>}
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
                  <div className="relative">
                    {/* Vertical line */}
                    <div className="absolute left-[11px] top-2 bottom-2 w-px bg-gray-200" />
                    <div className="space-y-4">
                      {activities.map((activity) => (
                        <TimelineItem key={activity.id} activity={activity} />
                      ))}
                    </div>
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
