import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Users, Send, Calendar, Clock, RefreshCw, Pencil, List, Settings2, Filter, Play, Pause, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MessageEditor } from "@/components/campaigns/MessageEditor";
import { WhatsAppTemplateSelector } from "@/components/campaigns/WhatsAppTemplateSelector";
import { CallEditor } from "@/components/campaigns/CallEditor";
import { SegmentBuilder } from "@/components/campaigns/SegmentBuilder";
import type { SegmentGroup } from "@/components/campaigns/SegmentBuilder";
import { TimePicker } from "@/components/ui/time-picker";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { getRecordLists } from "@/services/api";
import type { RecordListItem } from "@/services/api";
import { api } from "@/services/api";

interface Campaign {
  id: string;
  tenantId: string;
  inboxId: string | null;
  name: string;
  description: string | null;
  status: string;
  channel: string | null;
  segments: Array<{ logic: string; conditions: Array<{ field: string; operator: string; value: unknown }> }>;
  listId: string | null;
  maxSends: number | null;
  isRecurring: boolean;
  sendDate: string | null;
  sendTime: string | null;
  recurrenceDays: Record<string, string> | null;
  matchedCount: number;
  messageTemplate: string | null;
  whatsappTemplateName: string | null;
  whatsappTemplateLanguage: string | null;
  whatsappVariableMapping: Record<string, string> | null;
  whatsappTemplateCategory: string | null;
  callVoice: string | null;
  callRetries: string | null;
  callLeaveVoicemail: boolean | null;
  callAudioCode: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CampaignSendRecord {
  id: string;
  campaignId: string;
  status: string;
  totalRecipients: number;
  totalSent: number;
  totalDelivered: number;
  totalFailed: number;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

const statusColors: Record<string, { bg: string; text: string }> = {
  draft: { bg: "bg-gray-100", text: "text-gray-600" },
  active: { bg: "bg-green-100", text: "text-green-700" },
  completed: { bg: "bg-blue-100", text: "text-blue-700" },
  paused: { bg: "bg-orange-100", text: "text-orange-700" },
};

const operatorLabels: Record<string, string> = {
  equals: "es",
  not_equals: "no es",
  contains: "contiene",
  greater_than: "mayor que",
  less_than: "menor que",
  greater_or_equal: "≥",
  less_or_equal: "≤",
  is_true: "Sí",
  is_false: "No",
  is_null: "es vacío",
  is_not_null: "no es vacío",
};

const fieldLabels: Record<string, string> = {
  estado: "Estado",
  numTransacciones: "Nº Transacciones",
  montoTotal: "Monto Total",
  segmentoValor: "Segmento Valor",
  ciudad: "Ciudad",
  productoPreferido: "Producto Preferido",
  frecuenciaSemanal: "Frecuencia Semanal",
  tieneBonoActivo: "Tiene Bono Activo",
  ultimoJuego: "Último Juego",
};

export function CampanaDetail() {
  const { campaignId: id, slug } = useParams();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [campaignTab, setCampaignTab] = useState<"general" | "segmentacion" | "programacion" | "ejecuciones">("general");
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [savingMessage, setSavingMessage] = useState(false);
  const [savingWhatsApp, setSavingWhatsApp] = useState(false);
  const [savingCall, setSavingCall] = useState(false);
  const [sends, setSends] = useState<CampaignSendRecord[]>([]);
  const [sending, setSending] = useState(false);
  const [recordLists, setRecordLists] = useState<RecordListItem[]>([]);
  const [availableFields, setAvailableFields] = useState<{ field: string; label: string }[]>([]);
  const [showSegmentEditor, setShowSegmentEditor] = useState(false);
  const [editSegments, setEditSegments] = useState<SegmentGroup[]>([]);
  const [segmentPreviewCount, setSegmentPreviewCount] = useState<number | null>(null);
  const [segmentPreviewSample, setSegmentPreviewSample] = useState<Array<{ idCliente: string; nombreCompleto: string; estado: string; numTransacciones: number }>>([]);
  const [savingSegments, setSavingSegments] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [editMaxSends, setEditMaxSends] = useState<number | "">("");
  const [editIsRecurring, setEditIsRecurring] = useState(false);
  const [editSendDate, setEditSendDate] = useState("");
  const [editSendTime, setEditSendTime] = useState("");
  const [editRecurrenceDays, setEditRecurrenceDays] = useState<Record<string, string>>({});
  const [savingSchedule, setSavingSchedule] = useState(false);

  useEffect(() => {
    if (!id) return;
    api.get<Campaign>(`/campaigns/${id}`)
      .then(async ({ data }) => {
        // Recalcular audiencia con los segmentos actuales (only if using segments, not list)
        if (!data.listId && data.segments?.length > 0) {
          try {
            const segments = data.segments.map((g) => ({
              logic: g.logic,
              conditions: g.conditions,
            }));
            const { data: preview } = await api.post<{ count: number }>("/campaigns/preview", { segments });
            data.matchedCount = preview.count;
            await api.put(`/campaigns/${id}`, { matchedCount: preview.count });
          } catch {}
        }
        setCampaign(data);
        // Load record lists and available fields for the tenant
        if (data.tenantId) {
          getRecordLists(data.tenantId).then(setRecordLists).catch(() => {});
          api.get('/campaigns/whatsapp/available-fields', { params: { tenantId: data.tenantId } })
            .then(({ data: fields }) => setAvailableFields(fields))
            .catch(() => {});
        }
      })
      .catch(() => navigate(`/${slug}/comunicaciones/campanas`))
      .finally(() => setLoading(false));
    loadSends();
  }, [id, navigate]);

  const handleStatusChange = async (newStatus: string) => {
    if (!campaign) return;
    try {
      const { data } = await api.put<Campaign>(`/campaigns/${campaign.id}`, { status: newStatus });
      setCampaign(data);
    } catch {
      // error
    }
  };

  const handleRename = async () => {
    if (!campaign || !newName.trim()) return;
    try {
      const { data } = await api.put<Campaign>(`/campaigns/${campaign.id}`, { name: newName.trim() });
      setCampaign(data);
      setShowRenameModal(false);
    } catch {
      // error
    }
  };

  const handleSaveMessage = async () => {
    if (!campaign) return;
    setSavingMessage(true);
    try {
      const { data } = await api.put<Campaign>(`/campaigns/${campaign.id}`, {
        messageTemplate: campaign.messageTemplate,
      });
      setCampaign(data);
    } catch {
      // error
    } finally {
      setSavingMessage(false);
    }
  };

  const handleSaveWhatsAppTemplate = async () => {
    if (!campaign) return;
    setSavingWhatsApp(true);
    try {
      const { data } = await api.put<Campaign>(`/campaigns/${campaign.id}`, {
        whatsappTemplateName: campaign.whatsappTemplateName,
        whatsappTemplateLanguage: campaign.whatsappTemplateLanguage,
        whatsappVariableMapping: campaign.whatsappVariableMapping,
        whatsappTemplateCategory: campaign.whatsappTemplateCategory,
      });
      setCampaign(data);
    } catch {
      // error
    } finally {
      setSavingWhatsApp(false);
    }
  };

  const handleSaveCallConfig = async () => {
    if (!campaign) return;
    setSavingCall(true);
    try {
      const { data } = await api.put<Campaign>(`/campaigns/${campaign.id}`, {
        messageTemplate: campaign.messageTemplate,
        callVoice: campaign.callVoice,
        callRetries: campaign.callRetries,
        callLeaveVoicemail: campaign.callLeaveVoicemail,
        callAudioCode: campaign.callAudioCode,
      });
      setCampaign(data);
    } catch {
      // error
    } finally {
      setSavingCall(false);
    }
  };

  const loadSends = async () => {
    if (!id) return;
    try {
      const { data } = await api.get<CampaignSendRecord[]>(`/campaigns/${id}/sends`);
      setSends(data);
    } catch {
      // silently fail
    }
  };

  const handleSendCampaign = async () => {
    if (!campaign) return;
    setSending(true);
    try {
      const { data } = await api.post<CampaignSendRecord>(`/campaigns/${campaign.id}/send`);
      // Add to sends list immediately
      setSends((prev) => [data, ...prev]);
      // Connect to WebSocket for real-time updates
      connectSendWs(data.id);
    } catch {
      setSending(false);
    }
  };

  const connectSendWs = (sendId: string) => {
    const wsUrl = import.meta.env.VITE_WS_URL || 'http://localhost:3001';
    let resolved = false;

    // Primary: WebSocket for real-time
    import('socket.io-client').then(({ io }) => {
      const socket = io(`${wsUrl}/ws/campaigns`, {
        query: { tenantId: campaign?.tenantId },
        transports: ['websocket'],
      });

      socket.on('connect', () => {
        socket.emit('join_send', sendId);
      });

      socket.on('send_progress', (payload: { sendId: string; status: string; totalRecipients: number; totalSent: number; totalFailed: number; error?: string }) => {
        if (payload.sendId !== sendId) return;
        resolved = true;
        setSends((prev) => prev.map((s) => s.id === sendId ? {
          ...s,
          status: payload.status,
          totalRecipients: payload.totalRecipients,
          totalSent: payload.totalSent,
          totalFailed: payload.totalFailed,
          errorMessage: payload.error || s.errorMessage,
        } : s));

        if (payload.status === 'completed' || payload.status === 'failed') {
          setSending(false);
          setTimeout(() => socket.disconnect(), 1000);
        }
      });

      // Disconnect after 2 min regardless
      setTimeout(() => socket.disconnect(), 120000);
    }).catch(() => {});

    // Fallback: lightweight polling every 3s
    const pollInterval = setInterval(async () => {
      if (resolved) { clearInterval(pollInterval); return; }
      try {
        const { data: allSends } = await api.get<CampaignSendRecord[]>(`/campaigns/${campaign!.id}/sends`);
        const current = allSends.find((s) => s.id === sendId);
        if (current) {
          setSends((prev) => prev.map((s) => s.id === sendId ? current : s));
          if (current.status === 'completed' || current.status === 'failed') {
            resolved = true;
            setSending(false);
            clearInterval(pollInterval);
          }
        }
      } catch {}
    }, 3000);

    // Stop polling after 2 min
    setTimeout(() => clearInterval(pollInterval), 120000);
  };

  const handleOpenSegmentEditor = () => {
    if (!campaign) return;
    // Convert campaign segments to SegmentGroup format with ids
    const groups: SegmentGroup[] = campaign.segments.map((g, idx) => ({
      id: `group_${idx}`,
      logic: g.logic as "AND" | "OR",
      conditions: g.conditions.map((c, cIdx) => ({
        id: `cond_${idx}_${cIdx}`,
        field: c.field,
        operator: c.operator,
        value: c.value as string | number | boolean,
      })),
    }));
    setEditSegments(groups);
    setSegmentPreviewCount(null);
    setSegmentPreviewSample([]);
    setShowSegmentEditor(true);
  };

  const handleSegmentPreview = async () => {
    try {
      const source = editSegments.length > 0 ? editSegments : (campaign?.segments || []).map((g, idx) => ({
        id: `group_${idx}`,
        logic: g.logic as "AND" | "OR",
        conditions: g.conditions.map((c, cIdx) => ({
          id: `cond_${idx}_${cIdx}`,
          field: c.field,
          operator: c.operator,
          value: c.value as string | number | boolean,
        })),
      }));
      const segments = source.map((g) => ({
        logic: g.logic,
        conditions: g.conditions.map((c) => ({
          field: c.field,
          operator: c.operator,
          value: c.value,
        })),
      }));
      const { data } = await api.post<{ count: number; sample: Array<{ idCliente: string; nombreCompleto: string; estado: string; numTransacciones: number }> }>("/campaigns/preview", { segments, tenantId: campaign?.tenantId });
      setSegmentPreviewCount(data.count);
      setSegmentPreviewSample(data.sample || []);
    } catch {
      setSegmentPreviewCount(null);
    }
  };

  const handleSaveSegments = async () => {
    if (!campaign) return;
    setSavingSegments(true);
    try {
      const segments = editSegments.map((g) => ({
        logic: g.logic,
        conditions: g.conditions.map((c) => ({
          field: c.field,
          operator: c.operator,
          value: c.value,
        })),
      }));
      const { data } = await api.put<Campaign>(`/campaigns/${campaign.id}`, { segments });
      setCampaign(data);
      setShowSegmentEditor(false);
    } catch {
      // error
    } finally {
      setSavingSegments(false);
    }
  };

  const handleOpenScheduleModal = () => {
    if (!campaign) return;
    setEditMaxSends(campaign.maxSends || "");
    setEditIsRecurring(campaign.isRecurring || false);
    setEditSendDate(campaign.sendDate ? campaign.sendDate.split("T")[0] : "");
    setEditSendTime(campaign.sendTime || "");
    setEditRecurrenceDays(campaign.recurrenceDays || {});
    setShowScheduleModal(true);
  };

  const handleSaveSchedule = async () => {
    if (!campaign) return;
    setSavingSchedule(true);
    try {
      const { data } = await api.put<Campaign>(`/campaigns/${campaign.id}`, {
        maxSends: editMaxSends || null,
        isRecurring: editIsRecurring,
        sendDate: editIsRecurring ? null : editSendDate || null,
        sendTime: editSendTime || null,
        recurrenceDays: editIsRecurring ? editRecurrenceDays : null,
      });
      setCampaign(data);
      setShowScheduleModal(false);
    } catch {
      // error
    } finally {
      setSavingSchedule(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="h-6 w-6 border-2 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!campaign) return null;

  const statusStyle = statusColors[campaign.status] || statusColors.draft;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Tabs with campaign info */}
      <div className="px-5 border-b border-gray-100 flex items-center gap-4 shrink-0 bg-white">
        <div className="flex items-center gap-1 flex-1">
        {([
          { key: "general", label: "General", icon: Settings2 },
          { key: "segmentacion", label: "Segmentación", icon: Filter },
          { key: "programacion", label: "Programación", icon: Calendar },
          { key: "ejecuciones", label: "Ejecuciones", icon: Play },
        ] as const).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setCampaignTab(key)}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              campaignTab === key
                ? "border-brand-600 text-brand-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
        </div>
      </div>

      {/* Content */}
      {campaignTab === "general" && (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1, ease: 'easeOut' }} className="flex-1 min-h-0 overflow-auto px-6 py-6">
        <div className="max-w-3xl space-y-6">
          {/* Main info */}
          <div className="space-y-6">
            {/* Message Editor - only for SMS */}
            {campaign.channel === "sms" && (
              <MessageEditor
                value={campaign.messageTemplate || ""}
                onChange={(val) => setCampaign({ ...campaign, messageTemplate: val })}
                onSave={handleSaveMessage}
                saving={savingMessage}
                variables={availableFields}
              />
            )}

            {/* WhatsApp Template Selector - only for WhatsApp */}
            {campaign.channel === "whatsapp" && (
              <WhatsAppTemplateSelector
                selectedTemplate={campaign.whatsappTemplateName || null}
                selectedLanguage={campaign.whatsappTemplateLanguage || null}
                variableMapping={campaign.whatsappVariableMapping || {}}
                onTemplateChange={(name, lang, category) =>
                  setCampaign((prev) => prev ? ({
                    ...prev,
                    whatsappTemplateName: name,
                    whatsappTemplateLanguage: lang,
                    whatsappTemplateCategory: category,
                  }) : prev)
                }
                onMappingChange={(mapping) =>
                  setCampaign((prev) => prev ? ({ ...prev, whatsappVariableMapping: mapping }) : prev)
                }
                onSave={handleSaveWhatsAppTemplate}
                saving={savingWhatsApp}
                tenantId={campaign.tenantId}
                inboxId={campaign.inboxId}
              />
            )}

            {/* Call Editor - only for llamada */}
            {campaign.channel === "llamada" && (
              <CallEditor
                message={campaign.messageTemplate || ""}
                voice={campaign.callVoice || ""}
                retries={campaign.callRetries || ""}
                leaveVoicemail={campaign.callLeaveVoicemail ?? true}
                audioCode={campaign.callAudioCode || ""}
                onSave={handleSaveCallConfig}
                saving={savingCall}
                variables={availableFields}
              />
            )}
          </div>
        </div>
      </motion.div>
      )}


      {campaignTab === "segmentacion" && (
        <div className="flex-1 min-h-0 overflow-auto px-6 py-6">
          <div className="max-w-3xl space-y-6">
            {/* Segmentation */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-gray-900">Segmentación</h2>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={async () => { if (campaign.listId) { const { data: updated } = await api.put(`/campaigns/${campaign.id}`, { listId: null }); setCampaign(updated); } }}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${!campaign.listId ? "border-brand-500 bg-brand-50/50" : "border-gray-200 hover:border-gray-300"}`}
                >
                  <p className={`text-sm font-semibold ${!campaign.listId ? "text-brand-800" : "text-gray-700"}`}>Segmentación</p>
                  <p className="text-[11px] text-gray-500 mt-1">Define condiciones para filtrar contactos dinámicamente al enviar</p>
                </button>
                <button
                  onClick={() => { if (!campaign.listId) setCampaign({ ...campaign, listId: "pending" }); }}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${campaign.listId ? "border-brand-500 bg-brand-50/50" : "border-gray-200 hover:border-gray-300"}`}
                >
                  <div className="flex items-center gap-2">
                    <List className="h-4 w-4" />
                    <p className={`text-sm font-semibold ${campaign.listId ? "text-brand-800" : "text-gray-700"}`}>Lista</p>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-1">Usa una lista pre-definida de contactos (estática o dinámica)</p>
                </button>
              </div>

              {/* Content based on selection */}
              {campaign.listId ? (
                <div className="mt-4 space-y-2">
                  {(() => {
                    const selectedList = recordLists.find((l) => l.id === campaign.listId);
                    if (selectedList) {
                      return (
                        <div className="flex items-center justify-between px-4 py-3 rounded-lg border border-brand-200 bg-brand-50/50">
                          <div>
                            <p className="text-sm font-medium text-gray-800">{selectedList.name}</p>
                            <p className="text-[11px] text-gray-500">{selectedList.type === "dynamic" ? "Dinámica — se recalcula al enviar" : "Estática"}{selectedList.type === "static" && selectedList.recordIds ? ` · ${selectedList.recordIds.length} contactos` : ""}</p>
                          </div>
                          <button
                            onClick={() => setCampaign({ ...campaign, listId: "pending" })}
                            className="text-xs text-brand-600 hover:text-brand-800 font-medium"
                          >
                            Cambiar
                          </button>
                        </div>
                      );
                    }
                    // List picker
                    if (recordLists.length === 0) {
                      return <p className="text-xs text-gray-400 py-4 text-center">No hay listas creadas. Crea una desde la vista de Contactos.</p>;
                    }
                    return (
                      <div className="space-y-2">
                        <p className="text-xs text-gray-500 mb-2">Selecciona una lista:</p>
                        {recordLists.map((list) => (
                          <button
                            key={list.id}
                            onClick={async () => {
                              const { data: updated } = await api.put(`/campaigns/${campaign.id}`, { listId: list.id });
                              setCampaign(updated);
                            }}
                            className="w-full flex items-center justify-between px-4 py-3 rounded-lg border border-gray-200 hover:border-brand-300 hover:bg-brand-50/30 text-left transition-all"
                          >
                            <div>
                              <p className="text-sm font-medium text-gray-800">{list.name}</p>
                              <p className="text-[11px] text-gray-400">{list.type === "dynamic" ? "Dinámica" : "Estática"}{list.type === "static" && list.recordIds ? ` · ${list.recordIds.length} contactos` : ""}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <div className="mt-4">
                  <SegmentBuilder
                    groups={campaign.segments.map((g, idx) => ({
                      id: `group_${idx}`,
                      logic: g.logic as "AND" | "OR",
                      conditions: g.conditions.map((c, cIdx) => ({
                        id: `cond_${idx}_${cIdx}`,
                        field: c.field,
                        operator: c.operator,
                        value: c.value as string | number | boolean,
                      })),
                    }))}
                    onChange={async (groups) => {
                      const segments = groups.map((g) => ({
                        logic: g.logic,
                        conditions: g.conditions.map((c) => ({
                          field: c.field,
                          operator: c.operator,
                          value: c.value,
                        })),
                      }));
                      setCampaign({ ...campaign, segments });
                      // Auto-save
                      try {
                        const { data } = await api.put(`/campaigns/${campaign.id}`, { segments });
                        setCampaign(data);
                      } catch {}
                    }}
                    matchedCount={segmentPreviewCount}
                    previewSample={segmentPreviewSample}
                    onPreview={handleSegmentPreview}
                  />
                </div>
              )}
            </div>

            {/* Audience */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-base font-semibold text-gray-900 mb-4">Audiencia</h2>
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-lg bg-accent-50 flex items-center justify-center">
                  <Users className="h-6 w-6 text-accent-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{campaign.matchedCount.toLocaleString()}</p>
                  <p className="text-sm text-gray-500">clientes que cumplen las condiciones</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {campaignTab === "programacion" && (
        <div className="flex-1 min-h-0 overflow-auto px-6 py-6">
          <div className="max-w-lg space-y-6">
            {/* Type selector cards */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-base font-semibold text-gray-900 mb-4">Tipo de envío</h2>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setCampaign({ ...campaign, isRecurring: false })}
                  className={cn(
                    "p-4 rounded-xl border-2 text-left transition-all",
                    !campaign.isRecurring ? "border-brand-500 bg-brand-50/50" : "border-gray-200 hover:border-gray-300"
                  )}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Calendar className="h-4 w-4" />
                    <p className={cn("text-sm font-semibold", !campaign.isRecurring ? "text-brand-800" : "text-gray-700")}>Envío único</p>
                  </div>
                  <p className="text-[11px] text-gray-500">Enviar una vez, de forma manual o en una fecha programada</p>
                </button>
                <button
                  onClick={() => setCampaign({ ...campaign, isRecurring: true })}
                  className={cn(
                    "p-4 rounded-xl border-2 text-left transition-all",
                    campaign.isRecurring ? "border-brand-500 bg-brand-50/50" : "border-gray-200 hover:border-gray-300"
                  )}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <RefreshCw className="h-4 w-4" />
                    <p className={cn("text-sm font-semibold", campaign.isRecurring ? "text-brand-800" : "text-gray-700")}>Envío recurrente</p>
                  </div>
                  <p className="text-[11px] text-gray-500">Enviar automáticamente en días y horas específicos cada semana</p>
                </button>
              </div>
            </div>

            {/* Configuration based on selection */}
            {!campaign.isRecurring ? (
              /* === ENVÍO ÚNICO === */
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-base font-semibold text-gray-900 mb-5">Configuración de envío único</h2>
                <div className="space-y-5">
                  {/* Send type: manual or scheduled */}
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-2">¿Cuándo enviar?</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setCampaign({ ...campaign, sendDate: null, sendTime: null })}
                        className={cn(
                          "px-3 py-2.5 rounded-lg border text-sm font-medium transition-all text-center",
                          !campaign.sendDate ? "border-brand-500 bg-brand-50 text-brand-700" : "border-gray-200 text-gray-600 hover:border-gray-300"
                        )}
                      >
                        Manual (ahora)
                      </button>
                      <button
                        type="button"
                        onClick={() => setCampaign({ ...campaign, sendDate: campaign.sendDate || new Date().toISOString().split("T")[0] })}
                        className={cn(
                          "px-3 py-2.5 rounded-lg border text-sm font-medium transition-all text-center",
                          campaign.sendDate ? "border-brand-500 bg-brand-50 text-brand-700" : "border-gray-200 text-gray-600 hover:border-gray-300"
                        )}
                      >
                        Programado
                      </button>
                    </div>
                  </div>

                  {/* Date & Time (only if scheduled) */}
                  {campaign.sendDate && (
                    <div className="space-y-4 p-4 rounded-lg bg-gray-50 border border-gray-100">
                      <div>
                        <label className="text-sm font-medium text-gray-700 block mb-1.5">Fecha de envío</label>
                        <input
                          type="date"
                          value={campaign.sendDate ? campaign.sendDate.split("T")[0] : ""}
                          onChange={(e) => setCampaign({ ...campaign, sendDate: e.target.value || null })}
                          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                        />
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-700 block mb-1.5">Hora de envío</label>
                        <TimePicker value={campaign.sendTime || ""} onChange={(val) => setCampaign({ ...campaign, sendTime: val || null })} />
                      </div>
                    </div>
                  )}

                  {/* Limit */}
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1.5">Límite de envíos</label>
                    <input
                      type="number"
                      value={campaign.maxSends || ""}
                      onChange={(e) => setCampaign({ ...campaign, maxSends: e.target.value ? Number(e.target.value) : null })}
                      placeholder="Sin límite (se envía a toda la audiencia)"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                    />
                    <p className="text-[11px] text-gray-400 mt-1">Máximo de mensajes a enviar en esta ejecución. Déjalo vacío para enviar a todos.</p>
                  </div>
                </div>

                {/* Save */}
                <div className="flex justify-end pt-5 mt-5 border-t border-gray-100">
                  <Button
                    size="sm"
                    onClick={async () => {
                      setSavingSchedule(true);
                      try {
                        const { data } = await api.put(`/campaigns/${campaign.id}`, {
                          isRecurring: false,
                          maxSends: campaign.maxSends || null,
                          sendDate: campaign.sendDate || null,
                          sendTime: campaign.sendTime || null,
                          recurrenceDays: null,
                        });
                        setCampaign(data);
                      } catch {} finally { setSavingSchedule(false); }
                    }}
                    disabled={savingSchedule}
                    className="bg-brand-800 hover:bg-brand-700 text-white"
                  >
                    {savingSchedule ? "Guardando..." : "Guardar programación"}
                  </Button>
                </div>
              </div>
            ) : (
              /* === ENVÍO RECURRENTE === */
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-base font-semibold text-gray-900 mb-5">Configuración de envío recurrente</h2>
                <div className="space-y-5">
                  {/* Days with individual time */}
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-2">Días y horas de envío</label>
                    <p className="text-[11px] text-gray-400 mb-3">Selecciona los días y configura la hora de envío para cada uno</p>
                    <div className="space-y-2">
                      {["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"].map((dayLabel, idx) => {
                        const dayKey = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"][idx];
                        const recDays = campaign.recurrenceDays || {};
                        const isSelected = dayKey in recDays;
                        const dayTime = recDays[dayKey] || "";
                        return (
                          <div key={dayKey} className={cn(
                            "flex items-center gap-3 p-3 rounded-lg border transition-all",
                            isSelected ? "border-brand-200 bg-brand-50/30" : "border-gray-100 bg-gray-50/50"
                          )}>
                            <button
                              type="button"
                              onClick={() => {
                                const updated = { ...(campaign.recurrenceDays || {}) };
                                if (isSelected) {
                                  delete updated[dayKey];
                                } else {
                                  updated[dayKey] = "09:00";
                                }
                                setCampaign({ ...campaign, recurrenceDays: Object.keys(updated).length > 0 ? updated : null });
                              }}
                              className={cn(
                                "w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors",
                                isSelected ? "border-brand-600 bg-brand-600" : "border-gray-300"
                              )}
                            >
                              {isSelected && (
                                <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </button>
                            <span className={cn("text-sm font-medium w-20", isSelected ? "text-gray-900" : "text-gray-400")}>{dayLabel}</span>
                            {isSelected && (
                              <div className="flex-1">
                                <TimePicker
                                  value={dayTime}
                                  onChange={(val) => {
                                    const updated = { ...(campaign.recurrenceDays || {}) };
                                    updated[dayKey] = val || "09:00";
                                    setCampaign({ ...campaign, recurrenceDays: updated });
                                  }}
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Limit per execution */}
                  <div>
                    <label className="text-sm font-medium text-gray-700 block mb-1.5">Límite por ejecución</label>
                    <input
                      type="number"
                      value={campaign.maxSends || ""}
                      onChange={(e) => setCampaign({ ...campaign, maxSends: e.target.value ? Number(e.target.value) : null })}
                      placeholder="Sin límite"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                    />
                    <p className="text-[11px] text-gray-400 mt-1">Máximo de mensajes a enviar en cada ejecución recurrente. Déjalo vacío para enviar a todos.</p>
                  </div>
                </div>

                {/* Save */}
                <div className="flex justify-end pt-5 mt-5 border-t border-gray-100">
                  <Button
                    size="sm"
                    onClick={async () => {
                      setSavingSchedule(true);
                      try {
                        const { data } = await api.put(`/campaigns/${campaign.id}`, {
                          isRecurring: true,
                          maxSends: campaign.maxSends || null,
                          sendDate: null,
                          sendTime: null,
                          recurrenceDays: campaign.recurrenceDays || {},
                        });
                        setCampaign(data);
                      } catch {} finally { setSavingSchedule(false); }
                    }}
                    disabled={savingSchedule}
                    className="bg-brand-800 hover:bg-brand-700 text-white"
                  >
                    {savingSchedule ? "Guardando..." : "Guardar programación"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {campaignTab === "ejecuciones" && (
        <div className="flex-1 min-h-0 overflow-auto px-6 py-6">
          <div className="max-w-3xl space-y-6">
            {/* Action buttons */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-base font-semibold text-gray-900 mb-4">Acciones</h2>
              {(() => {
                const isManual = !campaign.isRecurring && !campaign.sendDate;
                const isScheduled = !campaign.isRecurring && !!campaign.sendDate;
                const isRecurring = campaign.isRecurring;
                const canSend = campaign.channel === "sms" ? !!campaign.messageTemplate : campaign.channel === "whatsapp" ? !!campaign.whatsappTemplateName : campaign.channel === "llamada" ? (!!campaign.messageTemplate || !!campaign.callAudioCode) : false;

                if (isManual) {
                  return (
                    <div className="space-y-3">
                      <p className="text-sm text-gray-500 mb-3">Envío manual — ejecuta el envío inmediatamente a toda la audiencia</p>
                      <Button
                        onClick={handleSendCampaign}
                        disabled={sending || !canSend}
                        className="w-full py-3 text-base bg-accent-500 hover:bg-accent-600 text-white gap-2"
                      >
                        <Send className="h-5 w-5" />
                        {sending ? "Enviando..." : "Enviar ahora"}
                      </Button>
                      {!canSend && (
                        <p className="text-[11px] text-amber-600 text-center">Configura el contenido del mensaje en la pestaña General antes de enviar</p>
                      )}
                    </div>
                  );
                }

                return (
                  <div className="space-y-3">
                    <p className="text-sm text-gray-500 mb-3">
                      {isScheduled ? "Envío programado" : "Envío recurrente"} — gestiona el estado de la programación
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {(campaign.status === "draft" || campaign.status === "paused") && (
                        <Button
                          onClick={() => handleStatusChange("active")}
                          className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 text-white gap-2"
                        >
                          <Play className="h-4 w-4" />
                          Activar programación
                        </Button>
                      )}
                      {campaign.status === "active" && (
                        <Button
                          onClick={() => handleStatusChange("paused")}
                          variant="outline"
                          className="flex-1 py-2.5 border-amber-300 text-amber-700 hover:bg-amber-50 gap-2"
                        >
                          <Pause className="h-4 w-4" />
                          Pausar programación
                        </Button>
                      )}
                      {campaign.status !== "completed" && (
                        <Button
                          onClick={() => handleStatusChange("completed")}
                          variant="outline"
                          className="flex-1 py-2.5 border-gray-300 text-gray-700 hover:bg-gray-50 gap-2"
                        >
                          <CheckCircle className="h-4 w-4" />
                          Marcar como terminada
                        </Button>
                      )}
                    </div>
                    {campaign.status === "active" && (
                      <p className="text-[11px] text-green-600 text-center flex items-center justify-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse" />
                        Programación activa — los envíos se ejecutarán según la configuración
                      </p>
                    )}
                    {campaign.status === "paused" && (
                      <p className="text-[11px] text-amber-600 text-center">Programación pausada — no se ejecutarán envíos hasta reactivar</p>
                    )}
                    {campaign.status === "completed" && (
                      <p className="text-[11px] text-gray-500 text-center">Campaña terminada — no se ejecutarán más envíos</p>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Send history */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-base font-semibold text-gray-900 mb-4">Historial de Envíos</h2>
              {sends.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">No se han realizado envíos aún</p>
              ) : (
                <div className="space-y-3">
                  {sends.map((s) => {
                    const isActive = s.status === "sending" || s.status === "queued";
                    const processed = s.totalSent + s.totalFailed;
                    const progress = s.totalRecipients > 0 ? (processed / s.totalRecipients) * 100 : 0;

                    return (
                      <div key={s.id} className={cn(
                        "p-4 rounded-lg border transition-all",
                        isActive ? "border-amber-200 bg-amber-50/30" : s.status === "completed" ? "border-green-100 bg-green-50/20" : s.status === "failed" ? "border-red-100 bg-red-50/20" : "border-gray-100 bg-gray-50"
                      )}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className={cn(
                              "h-2.5 w-2.5 rounded-full",
                              s.status === "completed" ? "bg-green-500" :
                              isActive ? "bg-amber-500 animate-pulse" :
                              s.status === "failed" ? "bg-red-500" : "bg-gray-400"
                            )} />
                            <span className="text-sm font-medium text-gray-900">
                              {s.status === "completed" ? "Completado" :
                               s.status === "sending" ? "Enviando..." :
                               s.status === "queued" ? "En cola..." :
                               s.status === "failed" ? "Fallido" : "Pendiente"}
                            </span>
                          </div>
                          <span className="text-xs text-gray-400">{new Date(s.createdAt).toLocaleString()}</span>
                        </div>

                        {/* Progress bar for active sends */}
                        {isActive && s.totalRecipients > 0 && (
                          <div className="mb-3">
                            <div className="flex justify-between text-[11px] text-gray-500 mb-1">
                              <span>{processed.toLocaleString()} / {s.totalRecipients.toLocaleString()} procesados</span>
                              <span>{Math.round(progress)}%</span>
                            </div>
                            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full bg-amber-500 transition-all duration-300"
                                style={{ width: `${progress}%` }}
                              />
                            </div>
                          </div>
                        )}

                        {/* Stats */}
                        <div className="flex items-center gap-4 text-xs">
                          <div className="flex items-center gap-1">
                            <span className="text-gray-400">Destinos:</span>
                            <span className="font-semibold text-gray-900">{s.totalRecipients.toLocaleString()}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-gray-400">Enviados:</span>
                            <span className="font-semibold text-green-600">{s.totalSent.toLocaleString()}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-gray-400">Fallidos:</span>
                            <span className="font-semibold text-red-600">{s.totalFailed.toLocaleString()}</span>
                          </div>
                        </div>

                        {/* Timestamps */}
                        {(s.startedAt || s.completedAt) && (
                          <div className="flex items-center gap-3 mt-2 text-[11px] text-gray-400">
                            {s.startedAt && <span>Inicio: {new Date(s.startedAt).toLocaleTimeString()}</span>}
                            {s.completedAt && <span>Fin: {new Date(s.completedAt).toLocaleTimeString()}</span>}
                            {s.startedAt && s.completedAt && (
                              <span>Duración: {Math.round((new Date(s.completedAt).getTime() - new Date(s.startedAt).getTime()) / 1000)}s</span>
                            )}
                          </div>
                        )}

                        {/* Error message */}
                        {s.status === "failed" && s.errorMessage && (
                          <p className="text-[11px] text-red-500 mt-2">{s.errorMessage}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Segment Editor Modal */}
      {showSegmentEditor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowSegmentEditor(false)}
          />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[80vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-gray-200 shrink-0">
              <h3 className="text-lg font-semibold text-gray-900">Editar Segmentación</h3>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowSegmentEditor(false)}
                >
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  onClick={handleSaveSegments}
                  disabled={savingSegments}
                  className="bg-brand-800 hover:bg-brand-700 text-white"
                >
                  {savingSegments ? "Guardando..." : "Guardar"}
                </Button>
              </div>
            </div>
            <div className="flex-1 min-h-0 p-5 overflow-hidden">
              <SegmentBuilder
                groups={editSegments}
                onChange={setEditSegments}
                matchedCount={segmentPreviewCount}
                previewSample={segmentPreviewSample}
                onPreview={handleSegmentPreview}
              />
            </div>
          </div>
        </div>
      )}

      {/* Rename Modal */}
      {showRenameModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowRenameModal(false)}
          />
          <div className="relative bg-white rounded-xl shadow-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Renombrar campaña
            </h3>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRename()}
              placeholder="Nombre de la campaña"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
              autoFocus
            />
            <div className="flex justify-end gap-2 mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowRenameModal(false)}
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={handleRename}
                disabled={!newName.trim()}
                className="bg-brand-800 hover:bg-brand-700 text-white"
              >
                Guardar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
