import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Users, Send, Calendar, Clock, RefreshCw, Pencil, List } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MessageEditor } from "@/components/campaigns/MessageEditor";
import { WhatsAppTemplateSelector } from "@/components/campaigns/WhatsAppTemplateSelector";
import { CallEditor } from "@/components/campaigns/CallEditor";
import { SegmentBuilder } from "@/components/campaigns/SegmentBuilder";
import type { SegmentGroup } from "@/components/campaigns/SegmentBuilder";
import { TimePicker } from "@/components/ui/time-picker";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import headerBg from "@/assets/header-background.jpg";
import { getRecordLists } from "@/services/api";
import type { RecordListItem } from "@/services/api";
import { api } from "@/services/api";

interface Campaign {
  id: string;
  tenantId: string;
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
  recurrenceDays: string[] | null;
  matchedCount: number;
  messageTemplate: string | null;
  whatsappTemplateName: string | null;
  whatsappTemplateLanguage: string | null;
  whatsappVariableMapping: Record<string, string> | null;
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
  draft: { bg: "bg-muted", text: "text-muted-foreground" },
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

export function CampaignDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [savingMessage, setSavingMessage] = useState(false);
  const [savingWhatsApp, setSavingWhatsApp] = useState(false);
  const [savingCall, setSavingCall] = useState(false);
  const [sends, setSends] = useState<CampaignSendRecord[]>([]);
  const [sending, setSending] = useState(false);
  const [activeSend, setActiveSend] = useState<CampaignSendRecord | null>(null);
  const [showSendModal, setShowSendModal] = useState(false);
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
  const [editRecurrenceDays, setEditRecurrenceDays] = useState<string[]>([]);
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
      .catch(() => navigate("/campaigns"))
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
    setShowSendModal(true);
    try {
      const { data } = await api.post<CampaignSendRecord>(`/campaigns/${campaign.id}/send`);
      setActiveSend(data);
      // Poll for progress
      pollSendStatus(data.id);
    } catch {
      setActiveSend({ id: '', campaignId: '', status: 'failed', totalRecipients: 0, totalSent: 0, totalDelivered: 0, totalFailed: 0, errorMessage: 'Error al iniciar el envío', startedAt: null, completedAt: null, createdAt: new Date().toISOString() });
      setSending(false);
    }
  };

  const pollSendStatus = async (sendId: string) => {
    const poll = async () => {
      try {
        const { data: allSends } = await api.get<CampaignSendRecord[]>(`/campaigns/${campaign!.id}/sends`);
        const current = allSends.find((s) => s.id === sendId);
        if (current) {
          setActiveSend(current);
          if (current.status === 'completed' || current.status === 'failed') {
            setSending(false);
            await loadSends();
            return;
          }
        }
        setTimeout(poll, 1500);
      } catch {
        setSending(false);
      }
    };
    setTimeout(poll, 1500);
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
      const segments = editSegments.map((g) => ({
        logic: g.logic,
        conditions: g.conditions.map((c) => ({
          field: c.field,
          operator: c.operator,
          value: c.value,
        })),
      }));
      const { data } = await api.post<{ count: number; sample: Array<{ idCliente: string; nombreCompleto: string; estado: string; numTransacciones: number }> }>("/campaigns/preview", { segments });
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
    setEditRecurrenceDays(campaign.recurrenceDays || []);
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
      <div className="h-full flex items-center justify-center">
        <p className="text-muted-foreground">Cargando...</p>
      </div>
    );
  }

  if (!campaign) return null;

  const statusStyle = statusColors[campaign.status] || statusColors.draft;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Dark section */}
      <div
        className="px-8 pt-16 pb-4 shrink-0 rounded-b-2xl"
        style={{
          backgroundImage: `url(${headerBg})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate("/campaigns")}
              className="text-brand-300 hover:text-white transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold text-white">{campaign.name}</h1>
                <button
                  onClick={() => { setNewName(campaign.name); setShowRenameModal(true); }}
                  className="text-brand-400 hover:text-white transition-colors"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${statusStyle.bg} ${statusStyle.text}`}>
                  {campaign.status}
                </span>
              </div>
              {campaign.description && (
                <p className="text-brand-300 mt-0.5 text-sm">{campaign.description}</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {campaign.status === "draft" && (
              <Button
                onClick={() => handleStatusChange("active")}
                size="sm"
                className="gap-1.5 bg-accent-500 hover:bg-accent-600 text-white"
              >
                <Send className="h-3.5 w-3.5" />
                Activar
              </Button>
            )}
            {campaign.status === "active" && (
              <Button
                onClick={() => handleStatusChange("paused")}
                size="sm"
                variant="outline"
                className="gap-1.5 text-brand-300 border-brand-700 hover:bg-brand-800"
              >
                Pausar
              </Button>
            )}
            {campaign.status === "paused" && (
              <Button
                onClick={() => handleStatusChange("active")}
                size="sm"
                className="gap-1.5 bg-accent-500 hover:bg-accent-600 text-white"
              >
                Reanudar
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1, ease: 'easeOut' }} className="flex-1 min-h-0 overflow-auto px-0 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main info */}
          <div className="lg:col-span-2 space-y-6">
            {/* Segmentation */}
            <div className="bg-card rounded-xl border border-border p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-foreground">Segmentación</h2>
                {!campaign.listId && (
                  <button
                    onClick={handleOpenSegmentEditor}
                    className="px-3 py-1 rounded-md text-xs font-medium text-brand-700 border border-brand-200 hover:bg-brand-50 transition-colors flex items-center gap-1.5"
                  >
                    <Pencil className="h-3 w-3" />
                    Editar
                  </button>
                )}
              </div>

              {/* Source selector: Segments vs List */}
              {(() => {
                const usesList = !!campaign.listId;
                const selectedList = recordLists.find((l) => l.id === campaign.listId);

                return (
                  <div className="space-y-4">
                    {/* Two cards to pick source */}
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={async () => {
                          if (campaign.listId) {
                            const { data: updated } = await api.put(`/campaigns/${campaign.id}`, { listId: null });
                            setCampaign(updated);
                          }
                        }}
                        className={`p-4 rounded-xl border-2 text-left transition-all ${!usesList ? "border-brand-500 bg-brand-50/50" : "border-border hover:border-border"}`}
                      >
                        <p className={`text-sm font-semibold ${!usesList ? "text-brand-800" : "text-foreground"}`}>Segmentación</p>
                        <p className="text-[11px] text-muted-foreground mt-1">Define condiciones para filtrar contactos dinámicamente al enviar</p>
                      </button>
                      <button
                        onClick={() => {
                          if (!campaign.listId) {
                            setCampaign({ ...campaign, listId: "pending" });
                          }
                        }}
                        className={`p-4 rounded-xl border-2 text-left transition-all ${usesList ? "border-brand-500 bg-brand-50/50" : "border-border hover:border-border"}`}
                      >
                        <div className="flex items-center gap-1.5">
                          <List className="h-3.5 w-3.5 text-muted-foreground" />
                          <p className={`text-sm font-semibold ${usesList ? "text-brand-800" : "text-foreground"}`}>Lista</p>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1">Usa una lista pre-definida de contactos (estática o dinámica)</p>
                      </button>
                    </div>

                    {/* Content based on selection */}
                    {usesList ? (
                      <div className="space-y-2">
                        {selectedList ? (
                          <div className="flex items-center justify-between px-4 py-3 rounded-lg border border-brand-200 bg-brand-50/50">
                            <div>
                              <p className="text-sm font-medium text-foreground">{selectedList.name}</p>
                              <p className="text-[11px] text-muted-foreground">{selectedList.type === "dynamic" ? "Dinámica — se recalcula al enviar" : "Estática"}{selectedList.type === "static" && selectedList.recordIds ? ` · ${selectedList.recordIds.length} contactos` : ""}</p>
                            </div>
                            <button
                              onClick={() => setCampaign({ ...campaign, listId: "pending" })}
                              className="text-xs text-brand-600 hover:text-brand-800 font-medium"
                            >
                              Cambiar
                            </button>
                          </div>
                        ) : (
                          /* List picker */
                          recordLists.length === 0 ? (
                            <p className="text-xs text-muted-foreground py-4 text-center">No hay listas creadas. Crea una desde la vista de Contactos.</p>
                          ) : (
                            <div className="space-y-2">
                              <p className="text-xs text-muted-foreground mb-2">Selecciona una lista:</p>
                              {recordLists.map((list) => (
                                <button
                                  key={list.id}
                                  onClick={async () => {
                                    const { data: updated } = await api.put(`/campaigns/${campaign.id}`, { listId: list.id });
                                    setCampaign(updated);
                                  }}
                                  className="w-full flex items-center justify-between px-4 py-3 rounded-lg border border-border hover:border-brand-300 hover:bg-brand-50/30 text-left transition-all"
                                >
                                  <div>
                                    <p className="text-sm font-medium text-foreground">{list.name}</p>
                                    <p className="text-[11px] text-muted-foreground">{list.type === "dynamic" ? "Dinámica" : "Estática"}{list.type === "static" && list.recordIds ? ` · ${list.recordIds.length} contactos` : ""}</p>
                                  </div>
                                </button>
                              ))}
                            </div>
                          )
                        )}
                      </div>
                    ) : (
                      /* Segment conditions display */
                      <div className="space-y-3">
                        {campaign.segments.length === 0 ? (
                          <p className="text-xs text-muted-foreground py-3 text-center">Sin condiciones configuradas. Haz click en "Editar" para agregar filtros.</p>
                        ) : campaign.segments.map((group, gIdx) => (
                          <div key={gIdx} className="rounded-lg border border-border bg-muted p-4">
                            <div className="flex items-center gap-2 mb-3">
                              <span className="text-xs font-semibold text-muted-foreground uppercase">
                                Grupo {gIdx + 1}
                              </span>
                              <span className="px-2 py-0.5 rounded text-xs font-medium bg-brand-100 text-brand-700">
                                {group.logic}
                              </span>
                            </div>
                            <div className="space-y-2">
                              {group.conditions.map((cond, cIdx) => (
                                <div
                                  key={cIdx}
                                  className="flex items-center gap-2 text-sm bg-card rounded-md border border-border px-3 py-2"
                                >
                                  <span className="font-medium text-brand-700">
                                    {fieldLabels[cond.field] || cond.field}
                                  </span>
                                  <span className="text-muted-foreground">
                                    {operatorLabels[cond.operator] || cond.operator}
                                  </span>
                                  {!["is_true", "is_false", "is_null", "is_not_null"].includes(cond.operator) && (
                                    <span className="font-medium text-foreground">
                                      {String(cond.value)}
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Audience */}
            <div className="bg-card rounded-xl border border-border p-6">
              <h2 className="text-base font-semibold text-foreground mb-2">Audiencia</h2>
              <div className="flex items-center gap-3">
                <div className="h-12 w-12 rounded-lg bg-accent-50 flex items-center justify-center">
                  <Users className="h-6 w-6 text-accent-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">
                    {campaign.matchedCount.toLocaleString()}
                  </p>
                  <p className="text-sm text-muted-foreground">clientes que cumplen las condiciones</p>
                </div>
              </div>
            </div>

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
                onTemplateChange={(name, lang) =>
                  setCampaign({
                    ...campaign,
                    whatsappTemplateName: name,
                    whatsappTemplateLanguage: lang,
                  })
                }
                onMappingChange={(mapping) =>
                  setCampaign({ ...campaign, whatsappVariableMapping: mapping })
                }
                onSave={handleSaveWhatsAppTemplate}
                saving={savingWhatsApp}
                tenantId={campaign.tenantId}
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
                onMessageChange={(val) => setCampaign({ ...campaign, messageTemplate: val })}
                onVoiceChange={(val) => setCampaign({ ...campaign, callVoice: val })}
                onRetriesChange={(val) => setCampaign({ ...campaign, callRetries: val })}
                onLeaveVoicemailChange={(val) => setCampaign({ ...campaign, callLeaveVoicemail: val })}
                onAudioCodeChange={(val) => setCampaign({ ...campaign, callAudioCode: val })}
                onSave={handleSaveCallConfig}
                saving={savingCall}
                variables={availableFields}
              />
            )}

            {/* Send History */}
            <div className="bg-card rounded-xl border border-border p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-foreground">Historial de Envíos</h2>
                <button
                  onClick={handleSendCampaign}
                  disabled={sending || (campaign.channel === "sms" ? !campaign.messageTemplate : campaign.channel === "whatsapp" ? !campaign.whatsappTemplateName : campaign.channel === "llamada" ? (!campaign.messageTemplate && !campaign.callAudioCode) : true)}
                  className="px-3 py-1.5 rounded-md text-xs font-medium bg-accent-500 text-white hover:bg-accent-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
                >
                  <Send className="h-3.5 w-3.5" />
                  {sending ? "Enviando..." : "Enviar ahora"}
                </button>
              </div>

              {sends.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">
                  No se han realizado envíos aún
                </p>
              ) : (
                <div className="space-y-2">
                  {sends.map((s) => (
                    <div key={s.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted">
                      <div className="flex items-center gap-3">
                        <div className={`h-2 w-2 rounded-full ${
                          s.status === "completed" ? "bg-green-500" :
                          s.status === "sending" ? "bg-amber-500 animate-pulse" :
                          s.status === "failed" ? "bg-red-500" : "bg-gray-400"
                        }`} />
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {new Date(s.createdAt).toLocaleString()}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {s.status === "completed" ? "Completado" :
                             s.status === "sending" ? "Enviando..." :
                             s.status === "failed" ? "Fallido" : "Pendiente"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 text-xs">
                        <div className="text-center">
                          <p className="font-semibold text-foreground">{s.totalRecipients}</p>
                          <p className="text-muted-foreground">Destinos</p>
                        </div>
                        <div className="text-center">
                          <p className="font-semibold text-green-600">{s.totalSent}</p>
                          <p className="text-muted-foreground">Enviados</p>
                        </div>
                        <div className="text-center">
                          <p className="font-semibold text-red-600">{s.totalFailed}</p>
                          <p className="text-muted-foreground">Fallidos</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sidebar info */}
          <div className="space-y-6">
            {/* Schedule */}
            <div className="bg-card rounded-xl border border-border p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-semibold text-foreground">Programación</h2>
                <button
                  onClick={handleOpenScheduleModal}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-brand-700 hover:bg-brand-50 transition-colors"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="space-y-3 text-sm">
                {campaign.maxSends && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span>Máx. {campaign.maxSends.toLocaleString()} envíos</span>
                  </div>
                )}
                {campaign.isRecurring ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <RefreshCw className="h-4 w-4 text-muted-foreground" />
                    <span>Recurrente</span>
                  </div>
                ) : (
                  campaign.sendDate && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span>{new Date(campaign.sendDate).toLocaleDateString()}</span>
                    </div>
                  )
                )}
                {campaign.sendTime && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span>{campaign.sendTime}</span>
                  </div>
                )}
                {campaign.recurrenceDays && campaign.recurrenceDays.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {campaign.recurrenceDays.map((day) => (
                      <span
                        key={day}
                        className="px-2 py-0.5 rounded-md text-xs font-medium bg-brand-100 text-brand-700"
                      >
                        {day}
                      </span>
                    ))}
                  </div>
                )}
                {!campaign.maxSends && !campaign.sendDate && !campaign.sendTime && !campaign.isRecurring && (
                  <p className="text-muted-foreground">Sin configurar</p>
                )}
              </div>
            </div>

          </div>
        </div>
      </motion.div>

      {/* Schedule Editor Modal */}
      {showScheduleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowScheduleModal(false)} />
          <div className="relative bg-card rounded-xl shadow-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-foreground mb-5">Editar Programación</h3>

            <div className="space-y-5">
              {/* Max sends */}
              <div>
                <label className="text-sm font-medium text-foreground block mb-1.5">Máximo de envíos</label>
                <input
                  type="number"
                  value={editMaxSends}
                  onChange={(e) => setEditMaxSends(e.target.value ? Number(e.target.value) : "")}
                  placeholder="Sin límite"
                  className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                />
              </div>

              {/* Recurring */}
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-foreground">Recurrente</label>
                <button
                  type="button"
                  onClick={() => setEditIsRecurring(!editIsRecurring)}
                  className={cn(
                    "relative w-10 h-5 rounded-full transition-colors",
                    editIsRecurring ? "bg-accent-500" : "bg-gray-300"
                  )}
                >
                  <span className={cn(
                    "absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform",
                    editIsRecurring && "translate-x-5"
                  )} />
                </button>
              </div>

              {/* Date (if not recurring) */}
              {!editIsRecurring && (
                <div>
                  <label className="text-sm font-medium text-foreground block mb-1.5">Fecha de envío</label>
                  <input
                    type="date"
                    value={editSendDate}
                    onChange={(e) => setEditSendDate(e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                  />
                </div>
              )}

              {/* Time */}
              <div>
                <label className="text-sm font-medium text-foreground block mb-1.5">Hora de envío</label>
                <TimePicker value={editSendTime} onChange={setEditSendTime} />
              </div>

              {/* Recurrence days */}
              {editIsRecurring && (
                <div>
                  <label className="text-sm font-medium text-foreground block mb-1.5">Días de envío</label>
                  <div className="flex gap-1.5 flex-wrap">
                    {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map((day, idx) => {
                      const dayKey = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"][idx];
                      const isSelected = editRecurrenceDays.includes(dayKey);
                      return (
                        <button
                          key={dayKey}
                          type="button"
                          onClick={() =>
                            setEditRecurrenceDays(
                              isSelected
                                ? editRecurrenceDays.filter((d) => d !== dayKey)
                                : [...editRecurrenceDays, dayKey]
                            )
                          }
                          className={cn(
                            "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                            isSelected
                              ? "bg-brand-600 text-white"
                              : "bg-muted text-muted-foreground hover:bg-muted"
                          )}
                        >
                          {day}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <Button variant="outline" size="sm" onClick={() => setShowScheduleModal(false)}>
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={handleSaveSchedule}
                disabled={savingSchedule}
                className="bg-brand-800 hover:bg-brand-700 text-white"
              >
                {savingSchedule ? "Guardando..." : "Guardar"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Send Progress Modal */}
      {showSendModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative bg-card rounded-xl shadow-xl p-8 w-full max-w-md">
            {activeSend ? (
              <div>
                {/* Status icon */}
                <div className="flex justify-center mb-4">
                  {activeSend.status === 'sending' && (
                    <div className="h-16 w-16 rounded-full bg-amber-50 flex items-center justify-center">
                      <Send className="h-7 w-7 text-amber-500 animate-pulse" />
                    </div>
                  )}
                  {activeSend.status === 'completed' && (
                    <div className="h-16 w-16 rounded-full bg-green-50 flex items-center justify-center">
                      <Send className="h-7 w-7 text-green-500" />
                    </div>
                  )}
                  {activeSend.status === 'failed' && (
                    <div className="h-16 w-16 rounded-full bg-red-50 flex items-center justify-center">
                      <Send className="h-7 w-7 text-red-500" />
                    </div>
                  )}
                  {activeSend.status === 'pending' && (
                    <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
                      <Send className="h-7 w-7 text-muted-foreground" />
                    </div>
                  )}
                </div>

                {/* Title */}
                <h3 className="text-lg font-semibold text-center text-foreground mb-1">
                  {activeSend.status === 'sending' && 'Enviando campaña...'}
                  {activeSend.status === 'completed' && 'Envío completado'}
                  {activeSend.status === 'failed' && 'Error en el envío'}
                  {activeSend.status === 'pending' && 'Preparando envío...'}
                </h3>
                <p className="text-sm text-center text-muted-foreground mb-6">
                  {activeSend.status === 'sending' && 'Los mensajes se están enviando a los destinatarios'}
                  {activeSend.status === 'completed' && 'Todos los mensajes han sido procesados'}
                  {activeSend.status === 'failed' && (activeSend.errorMessage || 'Ocurrió un error durante el envío')}
                  {activeSend.status === 'pending' && 'Preparando la lista de destinatarios'}
                </p>

                {/* Progress bar */}
                {activeSend.totalRecipients > 0 && (
                  <div className="mb-6">
                    <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                      <span>Progreso</span>
                      <span>{activeSend.totalSent + activeSend.totalFailed} / {activeSend.totalRecipients}</span>
                    </div>
                    <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500 bg-accent-500"
                        style={{ width: `${((activeSend.totalSent + activeSend.totalFailed) / activeSend.totalRecipients) * 100}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Stats */}
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="text-center p-3 bg-muted rounded-lg">
                    <p className="text-xl font-bold text-foreground">{activeSend.totalRecipients}</p>
                    <p className="text-xs text-muted-foreground">Destinatarios</p>
                  </div>
                  <div className="text-center p-3 bg-green-50 rounded-lg">
                    <p className="text-xl font-bold text-green-600">{activeSend.totalSent}</p>
                    <p className="text-xs text-muted-foreground">Enviados</p>
                  </div>
                  <div className="text-center p-3 bg-red-50 rounded-lg">
                    <p className="text-xl font-bold text-red-600">{activeSend.totalFailed}</p>
                    <p className="text-xs text-muted-foreground">Fallidos</p>
                  </div>
                </div>

                {/* Close button */}
                {(activeSend.status === 'completed' || activeSend.status === 'failed') && (
                  <Button
                    onClick={() => { setShowSendModal(false); setActiveSend(null); }}
                    className="w-full bg-brand-800 hover:bg-brand-700 text-white"
                  >
                    Cerrar
                  </Button>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center py-8">
                <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center animate-pulse mb-4">
                  <Send className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="text-muted-foreground">Iniciando envío...</p>
              </div>
            )}
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
          <div className="relative bg-card rounded-xl shadow-xl w-full max-w-4xl max-h-[80vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between p-5 border-b border-border shrink-0">
              <h3 className="text-lg font-semibold text-foreground">Editar Segmentación</h3>
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
          <div className="relative bg-card rounded-xl shadow-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-foreground mb-4">
              Renombrar campaña
            </h3>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRename()}
              placeholder="Nombre de la campaña"
              className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
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
