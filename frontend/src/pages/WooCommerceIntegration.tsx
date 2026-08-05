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
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/services/api";
import { toast } from "sonner";
import headerBg from "@/assets/header-background.jpg";

// WooCommerce events available
const WOO_EVENTS = [
  { key: "purchase", label: "Compra completada", description: "Cuando un pedido se completa o se confirma el pago" },
  { key: "add_to_cart", label: "Agregar al carrito", description: "Cuando un producto se agrega al carrito" },
  { key: "initiate_checkout", label: "Inicio de checkout", description: "Cuando el cliente inicia el proceso de pago" },
  { key: "view_content", label: "Vista de producto", description: "Cuando un cliente visita una página de producto" },
  { key: "sign_up", label: "Registro de usuario", description: "Cuando un nuevo usuario se registra en la tienda" },
  { key: "lead", label: "Formulario enviado", description: "Cuando se envía un formulario de contacto (CF7, WPForms)" },
];

// Actions that can be triggered
const ACTION_TYPES = [
  { key: "conversion", label: "Evento de conversión", description: "Registrar como conversión y despachar a plataformas de ads", icon: Zap },
  { key: "notification", label: "Enviar notificación", description: "Enviar un mensaje por WhatsApp, SMS o email al contacto", icon: Bell },
  { key: "tag", label: "Agregar etiqueta", description: "Agregar una etiqueta al contacto en el CRM", icon: Tag },
];

interface WooHook {
  id: string;
  event: string;
  actionType: string;
  enabled: boolean;
  config: {
    conversionName?: string;
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
      // If endpoint doesn't exist yet, start with empty
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
            <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-900">
                  {editingId ? "Editar hook" : "Nuevo hook"}
                </h3>
                <button onClick={() => setShowForm(false)} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400">
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Event selection */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">Evento de WooCommerce</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {WOO_EVENTS.map((evt) => (
                    <button
                      key={evt.key}
                      type="button"
                      onClick={() => setFormEvent(evt.key)}
                      className={`text-left p-3 rounded-lg border transition-colors ${
                        formEvent === evt.key
                          ? "border-purple-300 bg-purple-50"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <span className="text-xs font-semibold text-gray-900">{evt.label}</span>
                      <span className="block text-[11px] text-gray-500 mt-0.5">{evt.description}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Action selection */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">Acción a ejecutar</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {ACTION_TYPES.map((act) => {
                    const Icon = act.icon;
                    return (
                      <button
                        key={act.key}
                        type="button"
                        onClick={() => {
                          setFormAction(act.key);
                          setFormConfig({});
                        }}
                        className={`text-left p-3 rounded-lg border transition-colors ${
                          formAction === act.key
                            ? "border-blue-300 bg-blue-50"
                            : "border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        <Icon className={`h-4 w-4 mb-1 ${formAction === act.key ? "text-blue-600" : "text-gray-400"}`} />
                        <span className="text-xs font-semibold text-gray-900">{act.label}</span>
                        <span className="block text-[11px] text-gray-500 mt-0.5">{act.description}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Config by action type */}
              {formAction === "conversion" && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Nombre de la conversión</label>
                  <input
                    type="text"
                    value={formConfig.conversionName || ""}
                    onChange={(e) => setFormConfig({ ...formConfig, conversionName: e.target.value })}
                    placeholder="Ej: Compra WooCommerce"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">Se mapeará al tipo de evento de conversión configurado en tu cuenta.</p>
                </div>
              )}

              {formAction === "notification" && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Canal de envío</label>
                    <select
                      value={formConfig.inboxId || ""}
                      onChange={(e) => {
                        const inbox = inboxes.find((i) => i.id === e.target.value);
                        setFormConfig({ ...formConfig, inboxId: e.target.value, channel: inbox?.channel || "" });
                      }}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400"
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
                    <label className="block text-xs font-medium text-gray-700 mb-1">Mensaje / Template</label>
                    <textarea
                      value={formConfig.templateMessage || ""}
                      onChange={(e) => setFormConfig({ ...formConfig, templateMessage: e.target.value })}
                      rows={3}
                      placeholder="Hola {{firstName}}, tu pedido #{{orderNumber}} ha sido confirmado."
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 resize-none"
                    />
                    <p className="text-[11px] text-gray-400 mt-1">
                      Variables disponibles: {"{{firstName}}"}, {"{{lastName}}"}, {"{{orderNumber}}"}, {"{{total}}"}, {"{{currency}}"}
                    </p>
                  </div>
                </div>
              )}

              {formAction === "tag" && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Nombre de la etiqueta</label>
                  <input
                    type="text"
                    value={formConfig.tagName || ""}
                    onChange={(e) => setFormConfig({ ...formConfig, tagName: e.target.value })}
                    placeholder="Ej: cliente-woocommerce"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400"
                  />
                </div>
              )}

              {/* Save */}
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors">
                  Cancelar
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !formEvent || !formAction}
                  className="flex items-center gap-2 bg-brand-800 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-brand-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {editingId ? "Actualizar" : "Crear hook"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
