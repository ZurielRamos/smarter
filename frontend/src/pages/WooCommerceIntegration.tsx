import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Plus,
  ShoppingCart,
  Trash2,
  Edit3,
  X,
  Loader2,
  Save,
  ToggleLeft,
  ToggleRight,
  Zap,
  Bell,
  Tag,
  CheckCircle2,
  CreditCard,
  ShoppingBag,
  Eye,
  UserPlus,
  FileText,
  PackageCheck,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/services/api";
import { toast } from "sonner";
import headerBg from "@/assets/header-background.jpg";

// WooCommerce events available
const WOO_EVENTS = [
  { key: "purchase", label: "Compra completada", description: "Cuando un pedido se completa o se confirma el pago", icon: PackageCheck, color: "text-green-600", bg: "bg-green-50", example: "Cliente pagó $50.000 por 2 productos" },
  { key: "add_to_cart", label: "Agregar al carrito", description: "Cuando un producto se agrega al carrito", icon: ShoppingBag, color: "text-purple-600", bg: "bg-purple-50", example: "Cliente agregó 'Plan Premium' al carrito" },
  { key: "initiate_checkout", label: "Inicio de checkout", description: "Cuando el cliente inicia el proceso de pago", icon: CreditCard, color: "text-blue-600", bg: "bg-blue-50", example: "Cliente entró a la página de pago" },
  { key: "view_content", label: "Vista de producto", description: "Cuando un cliente visita una página de producto", icon: Eye, color: "text-sky-600", bg: "bg-sky-50", example: "Cliente vio el producto 'Servicio Gold'" },
  { key: "sign_up", label: "Registro de usuario", description: "Cuando un nuevo usuario se registra en la tienda", icon: UserPlus, color: "text-indigo-600", bg: "bg-indigo-50", example: "Nuevo usuario: juan@email.com" },
  { key: "lead", label: "Formulario enviado", description: "Cuando se envía un formulario de contacto (CF7, WPForms)", icon: FileText, color: "text-orange-600", bg: "bg-orange-50", example: "Formulario 'Contacto' enviado" },
];

// Actions that can be triggered
const ACTION_TYPES = [
  { key: "conversion", label: "Evento de conversión", description: "Registrar como conversión y despachar a Meta, Google Ads, TikTok", icon: Zap, color: "text-amber-600", bg: "bg-amber-50", borderActive: "border-amber-300 bg-amber-50", tip: "Ideal para medir ROI de campañas publicitarias" },
  { key: "notification", label: "Enviar notificación", description: "Enviar mensaje automático por WhatsApp, SMS o email", icon: Bell, color: "text-blue-600", bg: "bg-blue-50", borderActive: "border-blue-300 bg-blue-50", tip: "Confirma pedidos o da la bienvenida a nuevos clientes" },
  { key: "tag", label: "Agregar etiqueta", description: "Clasificar al contacto con una etiqueta en el CRM", icon: Tag, color: "text-green-600", bg: "bg-green-50", borderActive: "border-green-300 bg-green-50", tip: "Segmenta contactos para futuras campañas" },
];

interface WooHook {
  id: string;
  event: string;
  actionType: string;
  enabled: boolean;
  config: {
    conversionType?: string;
    conversionName?: string;
    conversionValue?: string;
    conversionCurrency?: string;
    inboxId?: string;
    templateName?: string;
    templateMessage?: string;
    channel?: string;
    tagName?: string;
  };
  createdAt: string;
}

interface Inbox {
  id: string;
  name: string;
  channel: string;
}

export function WooCommerceIntegration() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const tenantRole = user?.tenantRoles.find((tr) => tr.tenant.slug === slug);
  const tenantId = tenantRole?.tenantId || "";

  const [hooks, setHooks] = useState<WooHook[]>([]);
  const [inboxes, setInboxes] = useState<Inbox[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Form state
  const [formEvent, setFormEvent] = useState("");
  const [formAction, setFormAction] = useState("");
  const [formConfig, setFormConfig] = useState<WooHook["config"]>({});
  const [formEnabled, setFormEnabled] = useState(true);

  useEffect(() => {
    if (!tenantId) return;
    loadData();
  }, [tenantId]);

  async function loadData() {
    setLoading(true);
    try {
      const [hooksRes, inboxesRes] = await Promise.all([
        api.get("/woo-hooks", { params: { tenantId } }),
        api.get("/chats/inboxes", { params: { tenantId } }),
      ]);
      setHooks(hooksRes.data);
      setInboxes(inboxesRes.data);
    } catch {
      setHooks([]);
      try {
        const inboxesRes = await api.get("/chats/inboxes", { params: { tenantId } });
        setInboxes(inboxesRes.data);
      } catch {}
    } finally {
      setLoading(false);
    }
  }

  function openNewForm() {
    setEditingId(null);
    setFormEvent("");
    setFormAction("");
    setFormConfig({});
    setFormEnabled(true);
    setShowForm(true);
  }

  function openEditForm(hook: WooHook) {
    setEditingId(hook.id);
    setFormEvent(hook.event);
    setFormAction(hook.actionType);
    setFormConfig(hook.config || {});
    setFormEnabled(hook.enabled);
    setShowForm(true);
  }

  async function handleSave() {
    if (!formEvent || !formAction) {
      toast.error("Selecciona un evento y una acción");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        tenantId,
        event: formEvent,
        actionType: formAction,
        enabled: formEnabled,
        config: formConfig,
      };

      if (editingId) {
        await api.put(`/woo-hooks/${editingId}`, payload);
        toast.success("Hook actualizado");
      } else {
        await api.post("/woo-hooks", payload);
        toast.success("Hook creado");
      }
      setShowForm(false);
      loadData();
    } catch (err: any) {
      toast.error(err.response?.data?.message || "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(hook: WooHook) {
    try {
      await api.put(`/woo-hooks/${hook.id}`, { ...hook, enabled: !hook.enabled, tenantId });
      setHooks((prev) => prev.map((h) => (h.id === hook.id ? { ...h, enabled: !h.enabled } : h)));
    } catch {
      toast.error("Error al actualizar");
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("¿Eliminar este hook?")) return;
    try {
      await api.delete(`/woo-hooks/${id}`);
      setHooks((prev) => prev.filter((h) => h.id !== id));
      toast.success("Hook eliminado");
    } catch {
      toast.error("Error al eliminar");
    }
  }

  function getEventLabel(key: string) {
    return WOO_EVENTS.find((e) => e.key === key)?.label || key;
  }

  function getActionLabel(key: string) {
    return ACTION_TYPES.find((a) => a.key === key)?.label || key;
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div
        className="px-8 pt-16 pb-6 shrink-0 rounded-b-2xl"
        style={{ backgroundImage: `url(${headerBg})`, backgroundSize: "cover", backgroundPosition: "center" }}
      >
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(`/${slug}/integraciones`)} className="p-1.5 rounded-lg hover:bg-white/10 text-white transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" /> WordPress / WooCommerce
            </h1>
            <p className="text-brand-300 mt-0.5 text-sm">Configura acciones automáticas basadas en eventos de tu tienda</p>
          </div>
          <button onClick={openNewForm} className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
            <Plus className="h-4 w-4" /> Nuevo hook
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto space-y-6">

          {/* Plugin instructions */}
          <div className="bg-purple-50 border border-purple-100 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-purple-900 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" /> Plugin Smartee Control
            </h3>
            <p className="text-xs text-purple-700 mt-1">
              Instala el plugin <strong>Smartee Control</strong> en tu WordPress para enviar eventos automáticamente.
              Configura aquí qué acciones disparar cuando ocurra cada evento.
            </p>
          </div>

          {/* Hooks list */}
          {hooks.length === 0 && !showForm ? (
            <div className="text-center py-16">
              <ShoppingCart className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-sm font-semibold text-gray-900">Sin hooks configurados</h3>
              <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
                Crea un hook para definir qué pasa cuando ocurre un evento en tu tienda WooCommerce.
              </p>
              <button onClick={openNewForm} className="mt-4 inline-flex items-center gap-2 bg-brand-800 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-brand-700 transition-colors">
                <Plus className="h-4 w-4" /> Crear primer hook
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {hooks.map((hook) => (
                <div key={hook.id} className={`bg-white rounded-xl border p-4 flex items-center gap-4 transition-colors ${hook.enabled ? "border-gray-200" : "border-gray-100 opacity-60"}`}>
                  <button onClick={() => handleToggle(hook)} className="shrink-0">
                    {hook.enabled ? (
                      <ToggleRight className="h-6 w-6 text-green-500" />
                    ) : (
                      <ToggleLeft className="h-6 w-6 text-gray-400" />
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
                        {getEventLabel(hook.event)}
                      </span>
                      <span className="text-gray-400 text-xs">→</span>
                      <span className="text-xs font-medium bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                        {getActionLabel(hook.actionType)}
                      </span>
                    </div>
                    {hook.config.conversionName && (
                      <p className="text-xs text-gray-500 mt-1">Conversión: {hook.config.conversionName}</p>
                    )}
                    {hook.config.channel && hook.config.inboxId && (
                      <p className="text-xs text-gray-500 mt-1">
                        Canal: {hook.config.channel} · Inbox: {inboxes.find((i) => i.id === hook.config.inboxId)?.name || hook.config.inboxId}
                      </p>
                    )}
                    {hook.config.tagName && (
                      <p className="text-xs text-gray-500 mt-1">Etiqueta: {hook.config.tagName}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => openEditForm(hook)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
                      <Edit3 className="h-4 w-4" />
                    </button>
                    <button onClick={() => handleDelete(hook.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Create/Edit Form */}
          {showForm && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
              {/* Form header */}
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                <div>
                  <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                    {editingId ? <Edit3 className="h-4 w-4 text-gray-500" /> : <Plus className="h-4 w-4 text-brand-600" />}
                    {editingId ? "Editar hook" : "Nuevo hook"}
                  </h3>
                  <p className="text-[11px] text-gray-500 mt-0.5">Define qué pasa cuando ocurre un evento en tu tienda</p>
                </div>
                <button onClick={() => setShowForm(false)} className="p-1.5 rounded-lg hover:bg-gray-200 text-gray-400 transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="p-6 space-y-6">
                {/* Step 1: Event selection */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="flex items-center justify-center h-5 w-5 rounded-full bg-purple-100 text-purple-700 text-[10px] font-bold">1</span>
                    <label className="text-xs font-bold text-gray-900 uppercase tracking-wide">¿Qué evento quieres capturar?</label>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {WOO_EVENTS.map((evt) => {
                      const EvtIcon = evt.icon;
                      return (
                        <button
                          key={evt.key}
                          type="button"
                          onClick={() => setFormEvent(evt.key)}
                          className={`group text-left p-3.5 rounded-xl border-2 transition-all duration-200 relative ${
                            formEvent === evt.key
                              ? "border-purple-400 bg-purple-50 shadow-sm shadow-purple-100"
                              : "border-gray-100 hover:border-purple-200 hover:bg-purple-50/30 hover:shadow-sm"
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`h-8 w-8 rounded-lg ${evt.bg} flex items-center justify-center shrink-0 transition-transform group-hover:scale-110`}>
                              <EvtIcon className={`h-4 w-4 ${evt.color}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <span className="text-xs font-semibold text-gray-900 block">{evt.label}</span>
                              <span className="block text-[11px] text-gray-500 mt-0.5 leading-relaxed">{evt.description}</span>
                              <span className={`block text-[10px] mt-1.5 italic transition-opacity ${formEvent === evt.key ? "text-purple-600 opacity-100" : "text-gray-400 opacity-0 group-hover:opacity-100"}`}>
                                Ej: {evt.example}
                              </span>
                            </div>
                            {formEvent === evt.key && (
                              <CheckCircle2 className="h-4 w-4 text-purple-500 shrink-0 mt-0.5" />
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Step 2: Action selection */}
                <div className={`transition-opacity duration-300 ${formEvent ? "opacity-100" : "opacity-40 pointer-events-none"}`}>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="flex items-center justify-center h-5 w-5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold">2</span>
                    <label className="text-xs font-bold text-gray-900 uppercase tracking-wide">¿Qué acción ejecutar?</label>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {ACTION_TYPES.map((act) => {
                      const Icon = act.icon;
                      const isSelected = formAction === act.key;
                      return (
                        <button
                          key={act.key}
                          type="button"
                          onClick={() => {
                            setFormAction(act.key);
                            setFormConfig({});
                          }}
                          className={`group text-left p-4 rounded-xl border-2 transition-all duration-200 ${
                            isSelected
                              ? `${act.borderActive} shadow-sm`
                              : "border-gray-100 hover:border-gray-200 hover:shadow-sm"
                          }`}
                        >
                          <div className={`h-9 w-9 rounded-lg ${act.bg} flex items-center justify-center mb-2.5 transition-transform group-hover:scale-110`}>
                            <Icon className={`h-4.5 w-4.5 ${act.color}`} />
                          </div>
                          <span className="text-xs font-bold text-gray-900 block">{act.label}</span>
                          <span className="block text-[11px] text-gray-500 mt-1 leading-relaxed">{act.description}</span>
                          <span className={`block text-[10px] mt-2 font-medium transition-opacity ${isSelected ? `${act.color} opacity-100` : "text-gray-400 opacity-0 group-hover:opacity-100"}`}>
                            {act.tip}
                          </span>
                          {isSelected && (
                            <CheckCircle2 className={`h-4 w-4 ${act.color} absolute top-3 right-3`} />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Step 3: Config */}
                {formAction && (
                  <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="flex items-center justify-center h-5 w-5 rounded-full bg-green-100 text-green-700 text-[10px] font-bold">3</span>
                      <label className="text-xs font-bold text-gray-900 uppercase tracking-wide">Configuración</label>
                    </div>

                    <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                      {formAction === "conversion" && (
                        <div className="space-y-4">
                          {/* Event type selector - same as manual conversion registration */}
                          <div>
                            <label className="flex items-center gap-2 text-xs font-medium text-gray-700 mb-2">
                              <Zap className="h-3.5 w-3.5 text-amber-500" />
                              ¿Qué tipo de conversión registrar?
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                              {([
                                { value: "purchase", label: "Compra", desc: "Venta cerrada", icon: PackageCheck, color: "text-green-600", bg: "bg-green-50" },
                                { value: "appointment", label: "Cita", desc: "Reunión agendada", icon: CreditCard, color: "text-blue-600", bg: "bg-blue-50" },
                                { value: "demo", label: "Demo", desc: "Demostración realizada", icon: Eye, color: "text-purple-600", bg: "bg-purple-50" },
                                { value: "qualified", label: "Calificado", desc: "Lead cualificado", icon: CheckCircle2, color: "text-amber-600", bg: "bg-amber-50" },
                                { value: "proposal", label: "Propuesta", desc: "Cotización enviada", icon: FileText, color: "text-indigo-600", bg: "bg-indigo-50" },
                                { value: "registration", label: "Registro", desc: "Se registró", icon: UserPlus, color: "text-cyan-600", bg: "bg-cyan-50" },
                                { value: "subscription", label: "Suscripción", desc: "Plan activado", icon: Zap, color: "text-emerald-600", bg: "bg-emerald-50" },
                                { value: "custom", label: "Otro", desc: "Evento personalizado", icon: Tag, color: "text-gray-600", bg: "bg-gray-50" },
                              ]).map((opt) => {
                                const Icon = opt.icon;
                                const isSelected = formConfig.conversionType === opt.value;
                                return (
                                  <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => setFormConfig({ ...formConfig, conversionType: opt.value, conversionName: formConfig.conversionName || opt.label })}
                                    className={`group flex items-center gap-2.5 p-3 rounded-xl border-2 text-left transition-all ${
                                      isSelected
                                        ? "border-amber-300 bg-amber-50/50 shadow-sm"
                                        : "border-gray-100 hover:border-amber-200 hover:bg-amber-50/30"
                                    }`}
                                  >
                                    <div className={`h-7 w-7 rounded-lg ${opt.bg} flex items-center justify-center shrink-0 transition-transform group-hover:scale-110`}>
                                      <Icon className={`h-3.5 w-3.5 ${isSelected ? opt.color : "text-gray-400"}`} />
                                    </div>
                                    <div>
                                      <p className={`text-xs font-semibold ${isSelected ? "text-gray-900" : "text-gray-700"}`}>{opt.label}</p>
                                      <p className="text-[10px] text-gray-400">{opt.desc}</p>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          {/* Event name */}
                          <div>
                            <label className="text-[11px] font-medium text-gray-700">Nombre del evento</label>
                            <input
                              type="text"
                              value={formConfig.conversionName || ""}
                              onChange={(e) => setFormConfig({ ...formConfig, conversionName: e.target.value })}
                              placeholder="Ej: Compra Plan Premium, Demo producto, Cita presencial..."
                              className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-200 focus:border-amber-400 bg-white"
                            />
                            <p className="text-[10px] text-gray-400 mt-1">Describe brevemente qué pasó con este contacto</p>
                          </div>

                          {/* Value */}
                          <div>
                            <label className="text-[11px] font-medium text-gray-700">Valor monetario <span className="text-gray-400 font-normal">(opcional)</span></label>
                            <div className="flex gap-2 mt-1">
                              <input
                                type="number"
                                value={formConfig.conversionValue || ""}
                                onChange={(e) => setFormConfig({ ...formConfig, conversionValue: e.target.value })}
                                placeholder="0"
                                className="flex-1 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-200 focus:border-amber-400 bg-white"
                              />
                              <select
                                value={formConfig.conversionCurrency || "COP"}
                                onChange={(e) => setFormConfig({ ...formConfig, conversionCurrency: e.target.value })}
                                className="w-24 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-200 focus:border-amber-400 bg-white"
                              >
                                <option value="COP">COP</option>
                                <option value="USD">USD</option>
                                <option value="EUR">EUR</option>
                                <option value="MXN">MXN</option>
                              </select>
                            </div>
                            <p className="text-[10px] text-gray-400 mt-1">Si este evento tiene un valor de venta, se reportará a las plataformas de ads</p>
                          </div>

                          {/* Info */}
                          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-blue-50 border border-blue-100">
                            <Zap className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
                            <p className="text-[11px] text-blue-700 leading-relaxed">
                              Si el contacto llegó desde un anuncio (Google, Meta, TikTok), este evento se reportará automáticamente a la plataforma de ads como una conversión.
                            </p>
                          </div>
                        </div>
                      )}

                      {formAction === "notification" && (
                        <div className="space-y-4">
                          <div>
                            <label className="flex items-center gap-2 text-xs font-medium text-gray-700 mb-2">
                              <Bell className="h-3.5 w-3.5 text-blue-500" />
                              Canal de envío
                            </label>
                            <select
                              value={formConfig.inboxId || ""}
                              onChange={(e) => {
                                const inbox = inboxes.find((i) => i.id === e.target.value);
                                setFormConfig({ ...formConfig, inboxId: e.target.value, channel: inbox?.channel || "" });
                              }}
                              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 bg-white"
                            >
                              <option value="">Selecciona una bandeja...</option>
                              {inboxes.map((inbox) => (
                                <option key={inbox.id} value={inbox.id}>
                                  {inbox.name} ({inbox.channel})
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="flex items-center gap-2 text-xs font-medium text-gray-700 mb-2">
                              <Bell className="h-3.5 w-3.5 text-blue-500" />
                              Mensaje a enviar
                            </label>
                            <textarea
                              value={formConfig.templateMessage || ""}
                              onChange={(e) => setFormConfig({ ...formConfig, templateMessage: e.target.value })}
                              rows={3}
                              placeholder="Hola {{firstName}}, tu pedido #{{orderNumber}} ha sido confirmado. Total: {{total}} {{currency}}"
                              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 resize-none bg-white"
                            />
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {["{{firstName}}", "{{lastName}}", "{{orderNumber}}", "{{total}}", "{{currency}}"].map((v) => (
                                <span key={v} className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium cursor-default hover:bg-blue-200 transition-colors">
                                  {v}
                                </span>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}

                      {formAction === "tag" && (
                        <div>
                          <label className="flex items-center gap-2 text-xs font-medium text-gray-700 mb-2">
                            <Tag className="h-3.5 w-3.5 text-green-500" />
                            Nombre de la etiqueta
                          </label>
                          <input
                            type="text"
                            value={formConfig.tagName || ""}
                            onChange={(e) => setFormConfig({ ...formConfig, tagName: e.target.value })}
                            placeholder="Ej: cliente-woocommerce"
                            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-200 focus:border-green-400 bg-white"
                          />
                          <div className="mt-3 flex items-start gap-2 text-[11px] text-gray-500 bg-green-50 border border-green-100 rounded-lg p-2.5">
                            <Tag className="h-3.5 w-3.5 text-green-500 shrink-0 mt-0.5" />
                            <span>La etiqueta se agregará al contacto en el CRM. Úsala para segmentar en campañas futuras.</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Save */}
                <div className="flex items-center justify-between pt-3 border-t border-gray-100">
                  <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors">
                    Cancelar
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving || !formEvent || !formAction}
                    className="flex items-center gap-2 bg-brand-800 text-white text-sm font-semibold px-5 py-2.5 rounded-lg hover:bg-brand-700 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm hover:shadow"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {editingId ? "Actualizar hook" : "Crear hook"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
