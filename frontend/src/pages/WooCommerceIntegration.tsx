import { useState, useEffect, useRef } from "react";
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
  ChevronDown,
  Check,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/services/api";
import { toast } from "sonner";
import headerBg from "@/assets/header-background.jpg";

/** Custom dropdown component — replaces native <select> */
function Dropdown({ value, options, onChange, placeholder = "Seleccionar...", className = "" }: {
  value: string;
  options: Array<{ value: string; label: string; desc?: string; icon?: any }>;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const selected = options.find((o) => o.value === value);

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-white hover:border-gray-300 transition-colors text-left"
      >
        {selected ? (
          <div className="flex items-center gap-2 min-w-0">
            {selected.icon && <selected.icon className="h-3.5 w-3.5 text-gray-500 shrink-0" />}
            <span className="text-gray-900 truncate">{selected.label}</span>
          </div>
        ) : (
          <span className="text-gray-400">{placeholder}</span>
        )}
        <ChevronDown className={`h-4 w-4 text-gray-400 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute left-0 right-0 bottom-full mb-1 bg-white rounded-xl border border-gray-200 shadow-lg py-1 z-50 max-h-56 overflow-y-auto">
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onChange(opt.value); setOpen(false); }}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors ${isSelected ? "bg-brand-50 text-brand-800" : "hover:bg-gray-50 text-gray-700"}`}
              >
                {opt.icon && <opt.icon className={`h-4 w-4 shrink-0 ${isSelected ? "text-brand-600" : "text-gray-400"}`} />}
                <div className="flex-1 min-w-0">
                  <span className={`block truncate ${isSelected ? "font-medium" : ""}`}>{opt.label}</span>
                  {opt.desc && <span className="block text-[10px] text-gray-400 truncate">{opt.desc}</span>}
                </div>
                {isSelected && <Check className="h-3.5 w-3.5 text-brand-600 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// WooCommerce events available
const WOO_EVENTS = [
  { key: "purchase", label: "Compra completada", description: "Cuando un pedido se completa o se confirma el pago", icon: PackageCheck, color: "text-green-600", bg: "bg-green-50", example: "Cliente pagó $50.000 por 2 productos", active: true },
  { key: "add_to_cart", label: "Agregar al carrito", description: "Cuando un producto se agrega al carrito", icon: ShoppingBag, color: "text-purple-600", bg: "bg-purple-50", example: "Cliente agregó 'Plan Premium' al carrito", active: false },
  { key: "initiate_checkout", label: "Inicio de checkout", description: "Cuando el cliente inicia el proceso de pago", icon: CreditCard, color: "text-blue-600", bg: "bg-blue-50", example: "Cliente entró a la página de pago", active: false },
  { key: "view_content", label: "Vista de producto", description: "Cuando un cliente visita una página de producto", icon: Eye, color: "text-sky-600", bg: "bg-sky-50", example: "Cliente vio el producto 'Servicio Gold'", active: false },
  { key: "sign_up", label: "Registro de usuario", description: "Cuando un nuevo usuario se registra en la tienda", icon: UserPlus, color: "text-indigo-600", bg: "bg-indigo-50", example: "Nuevo usuario: juan@email.com", active: false },
  { key: "lead", label: "Formulario enviado", description: "Cuando se envía un formulario de contacto (CF7, WPForms)", icon: FileText, color: "text-orange-600", bg: "bg-orange-50", example: "Formulario 'Contacto' enviado", active: false },
];

// Variables available per WooCommerce event
const VARIABLES_BY_EVENT: Record<string, Array<{ key: string; label: string; desc: string }>> = {
  purchase: [
    { key: "{{firstName}}", label: "Nombre", desc: "Nombre del cliente" },
    { key: "{{lastName}}", label: "Apellido", desc: "Apellido del cliente" },
    { key: "{{email}}", label: "Email", desc: "Email de facturación" },
    { key: "{{phone}}", label: "Teléfono", desc: "Teléfono de facturación" },
    { key: "{{total}}", label: "Total", desc: "Monto total del pedido" },
    { key: "{{currency}}", label: "Moneda", desc: "Moneda del pedido" },
    { key: "{{orderNumber}}", label: "# Pedido", desc: "Número de orden" },
    { key: "{{productName}}", label: "Producto", desc: "Nombre del producto principal" },
    { key: "{{itemsCount}}", label: "Cantidad", desc: "Número de items" },
    { key: "{{paymentMethod}}", label: "Método pago", desc: "Método de pago usado" },
  ],
  add_to_cart: [
    { key: "{{firstName}}", label: "Nombre", desc: "Nombre del cliente" },
    { key: "{{lastName}}", label: "Apellido", desc: "Apellido del cliente" },
    { key: "{{email}}", label: "Email", desc: "Email del cliente" },
    { key: "{{phone}}", label: "Teléfono", desc: "Teléfono del cliente" },
    { key: "{{productName}}", label: "Producto", desc: "Nombre del producto agregado" },
    { key: "{{productSku}}", label: "SKU", desc: "SKU del producto" },
    { key: "{{quantity}}", label: "Cantidad", desc: "Cantidad agregada" },
    { key: "{{value}}", label: "Valor", desc: "Precio × cantidad" },
    { key: "{{currency}}", label: "Moneda", desc: "Moneda de la tienda" },
  ],
  initiate_checkout: [
    { key: "{{firstName}}", label: "Nombre", desc: "Nombre del cliente" },
    { key: "{{lastName}}", label: "Apellido", desc: "Apellido del cliente" },
    { key: "{{email}}", label: "Email", desc: "Email del cliente" },
    { key: "{{phone}}", label: "Teléfono", desc: "Teléfono del cliente" },
    { key: "{{total}}", label: "Total", desc: "Total del carrito" },
    { key: "{{currency}}", label: "Moneda", desc: "Moneda de la tienda" },
    { key: "{{itemsCount}}", label: "Items", desc: "Cantidad de productos en el carrito" },
  ],
  view_content: [
    { key: "{{email}}", label: "Email", desc: "Email del cliente" },
    { key: "{{phone}}", label: "Teléfono", desc: "Teléfono del cliente" },
    { key: "{{productName}}", label: "Producto", desc: "Nombre del producto visto" },
    { key: "{{productSku}}", label: "SKU", desc: "SKU del producto" },
    { key: "{{value}}", label: "Precio", desc: "Precio del producto" },
    { key: "{{currency}}", label: "Moneda", desc: "Moneda de la tienda" },
    { key: "{{category}}", label: "Categoría", desc: "Categoría del producto" },
  ],
  sign_up: [
    { key: "{{firstName}}", label: "Nombre", desc: "Nombre del usuario" },
    { key: "{{lastName}}", label: "Apellido", desc: "Apellido del usuario" },
    { key: "{{email}}", label: "Email", desc: "Email de registro" },
    { key: "{{username}}", label: "Usuario", desc: "Nombre de usuario" },
  ],
  lead: [
    { key: "{{firstName}}", label: "Nombre", desc: "Nombre del contacto" },
    { key: "{{lastName}}", label: "Apellido", desc: "Apellido del contacto" },
    { key: "{{email}}", label: "Email", desc: "Email del formulario" },
    { key: "{{phone}}", label: "Teléfono", desc: "Teléfono del formulario" },
    { key: "{{formName}}", label: "Formulario", desc: "Nombre del formulario enviado" },
  ],
};
const ACTION_TYPES = [
  { key: "conversion", label: "Evento de conversión", description: "Registrar como conversión y despachar a Meta, Google Ads, TikTok", icon: Zap, color: "text-amber-600", bg: "bg-amber-50", borderActive: "border-amber-300 bg-amber-50", tip: "Ideal para medir ROI de campañas publicitarias", active: true },
  { key: "notification", label: "Enviar notificación", description: "Enviar mensaje automático por WhatsApp, SMS o email", icon: Bell, color: "text-blue-600", bg: "bg-blue-50", borderActive: "border-blue-300 bg-blue-50", tip: "Confirma pedidos o da la bienvenida a nuevos clientes", active: true },
  { key: "tag", label: "Agregar etiqueta", description: "Clasificar al contacto con una etiqueta en el CRM", icon: Tag, color: "text-green-600", bg: "bg-green-50", borderActive: "border-green-300 bg-green-50", tip: "Segmenta contactos para futuras campañas", active: false },
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
    templateLanguage?: string;
    templateMessage?: string;
    variableMapping?: Record<string, string>;
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
  const [whatsappTemplates, setWhatsappTemplates] = useState<any[]>([]);
  const [loadingTpl, setLoadingTpl] = useState(false);

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

  async function loadTemplates(inboxId: string) {
    setLoadingTpl(true);
    try {
      const { data } = await api.get("/campaigns/whatsapp/templates", { params: { inboxId } });
      setWhatsappTemplates(data);
    } catch {
      setWhatsappTemplates([]);
    } finally {
      setLoadingTpl(false);
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
                          disabled={!evt.active}
                          onClick={() => evt.active && setFormEvent(evt.key)}
                          className={`group text-left p-3.5 rounded-xl border-2 transition-all duration-200 relative ${
                            !evt.active
                              ? "border-gray-100 opacity-50 cursor-not-allowed"
                              : formEvent === evt.key
                              ? "border-purple-400 bg-purple-50 shadow-sm shadow-purple-100"
                              : "border-gray-100 hover:border-purple-200 hover:bg-purple-50/30 hover:shadow-sm"
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`h-8 w-8 rounded-lg ${evt.bg} flex items-center justify-center shrink-0 transition-transform ${evt.active ? "group-hover:scale-110" : ""}`}>
                              <EvtIcon className={`h-4 w-4 ${evt.active ? evt.color : "text-gray-400"}`} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-gray-900 block">{evt.label}</span>
                                {!evt.active && (
                                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">Próximamente</span>
                                )}
                              </div>
                              <span className="block text-[11px] text-gray-500 mt-0.5 leading-relaxed">{evt.description}</span>
                              {evt.active && (
                                <span className={`block text-[10px] mt-1.5 italic transition-opacity ${formEvent === evt.key ? "text-purple-600 opacity-100" : "text-gray-400 opacity-0 group-hover:opacity-100"}`}>
                                  Ej: {evt.example}
                                </span>
                              )}
                            </div>
                            {formEvent === evt.key && evt.active && (
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
                          disabled={!act.active}
                          onClick={() => {
                            if (!act.active) return;
                            setFormAction(act.key);
                            setFormConfig({});
                          }}
                          className={`group text-left p-4 rounded-xl border-2 transition-all duration-200 ${
                            !act.active
                              ? "border-gray-100 opacity-50 cursor-not-allowed"
                              : isSelected
                              ? `${act.borderActive} shadow-sm`
                              : "border-gray-100 hover:border-gray-200 hover:shadow-sm"
                          }`}
                        >
                          <div className={`h-9 w-9 rounded-lg ${act.bg} flex items-center justify-center mb-2.5 transition-transform ${act.active ? "group-hover:scale-110" : ""}`}>
                            <Icon className={`h-4.5 w-4.5 ${act.active ? act.color : "text-gray-400"}`} />
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-gray-900">{act.label}</span>
                            {!act.active && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">Próximamente</span>
                            )}
                          </div>
                          <span className="block text-[11px] text-gray-500 mt-1 leading-relaxed">{act.description}</span>
                          {act.active && (
                            <span className={`block text-[10px] mt-2 font-medium transition-opacity ${isSelected ? `${act.color} opacity-100` : "text-gray-400 opacity-0 group-hover:opacity-100"}`}>
                              {act.tip}
                            </span>
                          )}
                          {isSelected && act.active && (
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
                              onDrop={(e) => { e.preventDefault(); const v = e.dataTransfer.getData("text/plain"); setFormConfig({ ...formConfig, conversionName: (formConfig.conversionName || "") + v }); }}
                              onDragOver={(e) => e.preventDefault()}
                              placeholder="Ej: Compra {{productName}} por {{total}}"
                              className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-200 focus:border-amber-400 bg-white"
                            />
                            <p className="text-[10px] text-gray-400 mt-1">Puedes usar variables de WooCommerce arrastrándolas al campo</p>
                          </div>

                          {/* Value */}
                          <div>
                            <label className="text-[11px] font-medium text-gray-700">Valor monetario <span className="text-gray-400 font-normal">(opcional)</span></label>
                            <div className="flex gap-2 mt-1">
                              <input
                                type="text"
                                value={formConfig.conversionValue || ""}
                                onChange={(e) => setFormConfig({ ...formConfig, conversionValue: e.target.value })}
                                onDrop={(e) => { e.preventDefault(); const v = e.dataTransfer.getData("text/plain"); setFormConfig({ ...formConfig, conversionValue: (formConfig.conversionValue || "") + v }); }}
                                onDragOver={(e) => e.preventDefault()}
                                placeholder="{{total}} o un valor fijo"
                                className="flex-1 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-200 focus:border-amber-400 bg-white"
                              />
                              <Dropdown
                                value={formConfig.conversionCurrency || "COP"}
                                onChange={(val) => setFormConfig({ ...formConfig, conversionCurrency: val })}
                                options={[
                                  { value: "COP", label: "COP" },
                                  { value: "USD", label: "USD" },
                                  { value: "EUR", label: "EUR" },
                                  { value: "MXN", label: "MXN" },
                                  { value: "{{currency}}", label: "Auto (moneda del pedido)" },
                                ]}
                                className="w-28"
                              />
                            </div>
                            <p className="text-[10px] text-gray-400 mt-1">Usa {"{{total}}"} para tomar el valor automáticamente del pedido</p>
                          </div>

                          {/* Available variables */}
                          <div>
                            <label className="text-[11px] font-medium text-gray-700 mb-2 block">Variables disponibles de WooCommerce</label>
                            <p className="text-[10px] text-gray-400 mb-2">Arrastra o haz clic para copiar e insertar en los campos</p>
                            <div className="flex flex-wrap gap-1.5">
                              {(VARIABLES_BY_EVENT[formEvent] || []).map((v) => (
                                <span
                                  key={v.key}
                                  draggable
                                  onDragStart={(e) => e.dataTransfer.setData("text/plain", v.key)}
                                  onClick={() => navigator.clipboard.writeText(v.key).then(() => toast.success(`${v.key} copiado`))}
                                  title={v.desc}
                                  className="text-[10px] px-2 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 font-medium cursor-grab active:cursor-grabbing hover:bg-amber-100 hover:border-amber-300 transition-colors select-none"
                                >
                                  {v.label} <span className="text-amber-500 font-mono">{v.key}</span>
                                </span>
                              ))}
                            </div>
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
                            <Dropdown
                              value={formConfig.inboxId || ""}
                              onChange={(val) => {
                                const inbox = inboxes.find((i) => i.id === val);
                                setFormConfig({ ...formConfig, inboxId: val, channel: inbox?.channel || "", templateName: "", templateMessage: "", variableMapping: {} });
                                if (inbox?.channel === "whatsapp") {
                                  loadTemplates(val);
                                }
                              }}
                              placeholder="Selecciona una bandeja..."
                              options={inboxes.map((inbox) => ({
                                value: inbox.id,
                                label: `${inbox.name} (${inbox.channel})`,
                                desc: inbox.channel,
                              }))}
                            />
                          </div>

                          {/* WhatsApp: template selector + variable mapping */}
                          {formConfig.channel === "whatsapp" && formConfig.inboxId && (
                            <div className="space-y-3">
                              <div>
                                <label className="text-xs font-medium text-gray-700 mb-2 block">Plantilla aprobada</label>
                                {loadingTpl ? (
                                  <div className="flex items-center gap-2 text-xs text-gray-400 py-3">
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando plantillas...
                                  </div>
                                ) : whatsappTemplates.length === 0 ? (
                                  <p className="text-xs text-gray-400 py-2">No hay plantillas aprobadas en esta bandeja.</p>
                                ) : (
                                  <Dropdown
                                    value={formConfig.templateName || ""}
                                    onChange={(val) => {
                                      const tpl = whatsappTemplates.find((t) => t.name === val);
                                      if (!tpl) return;
                                      const bodyText = tpl.components?.find((c: any) => c.type === "BODY")?.text || "";
                                      const matches = bodyText.match(/\{\{\d+\}\}/g) || [];
                                      const mapping: Record<string, string> = {};
                                      matches.forEach((m: string) => { mapping[m.replace(/[{}]/g, "")] = ""; });
                                      setFormConfig({ ...formConfig, templateName: tpl.name, templateLanguage: tpl.language, variableMapping: mapping });
                                    }}
                                    placeholder="Seleccionar plantilla..."
                                    options={whatsappTemplates.map((tpl) => {
                                      const body = tpl.components?.find((c: any) => c.type === "BODY")?.text || "";
                                      return {
                                        value: tpl.name,
                                        label: `${tpl.name} (${tpl.language}) — ${tpl.category}`,
                                        desc: body.substring(0, 80) + (body.length > 80 ? "..." : ""),
                                      };
                                    })}
                                  />
                                )}
                              </div>

                              {/* Variable mapping */}
                              {formConfig.templateName && formConfig.variableMapping && Object.keys(formConfig.variableMapping).length > 0 && (
                                <div>
                                  <label className="text-xs font-medium text-gray-700 mb-1 block">Mapeo de variables</label>
                                  <p className="text-[10px] text-gray-400 mb-2">Asigna datos de WooCommerce a cada variable de la plantilla</p>
                                  <div className="space-y-2">
                                    {Object.keys(formConfig.variableMapping).sort((a, b) => Number(a) - Number(b)).map((varNum) => (
                                      <div key={varNum} className="flex items-center gap-2 p-2.5 rounded-lg bg-gray-50 border border-gray-100">
                                        <span className="text-xs font-mono text-gray-500 w-12 shrink-0">{`{{${varNum}}}`}</span>
                                        <span className="text-xs text-gray-400">→</span>
                                        <Dropdown
                                          value={(formConfig.variableMapping as any)?.[varNum] || ""}
                                          onChange={(val) => {
                                            const updated = { ...(formConfig.variableMapping || {}), [varNum]: val };
                                            setFormConfig({ ...formConfig, variableMapping: updated });
                                          }}
                                          placeholder="Seleccionar variable..."
                                          options={(VARIABLES_BY_EVENT[formEvent] || []).map((v) => ({
                                            value: v.key,
                                            label: v.label,
                                            desc: v.key,
                                          }))}
                                          className="flex-1"
                                        />
                                      </div>
                                    ))}
                                  </div>

                                  {/* Preview */}
                                  {(() => {
                                    const tpl = whatsappTemplates.find((t) => t.name === formConfig.templateName);
                                    const bodyText = tpl?.components?.find((c: any) => c.type === "BODY")?.text || "";
                                    let preview = bodyText;
                                    Object.entries(formConfig.variableMapping || {}).forEach(([num, val]) => {
                                      const varLabel = (VARIABLES_BY_EVENT[formEvent] || []).find((v) => v.key === val)?.label || val || `{{${num}}}`;
                                      preview = preview.replace(`{{${num}}}`, `[${varLabel}]`);
                                    });
                                    return (
                                      <div className="mt-3 rounded-lg border border-green-200 bg-green-50/50 p-3">
                                        <p className="text-[10px] font-semibold text-green-800 uppercase tracking-wide mb-1">Vista previa</p>
                                        <p className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">{preview}</p>
                                      </div>
                                    );
                                  })()}
                                </div>
                              )}
                            </div>
                          )}

                          {/* SMS / other channels: free text message */}
                          {formConfig.channel && formConfig.channel !== "whatsapp" && (
                            <div>
                              <label className="flex items-center gap-2 text-xs font-medium text-gray-700 mb-2">
                                <Bell className="h-3.5 w-3.5 text-blue-500" />
                                Mensaje a enviar
                              </label>
                              <textarea
                                value={formConfig.templateMessage || ""}
                                onChange={(e) => setFormConfig({ ...formConfig, templateMessage: e.target.value })}
                                onDrop={(e) => { e.preventDefault(); const v = e.dataTransfer.getData("text/plain"); setFormConfig({ ...formConfig, templateMessage: (formConfig.templateMessage || "") + v }); }}
                                onDragOver={(e) => e.preventDefault()}
                                rows={3}
                                placeholder="Hola {{firstName}}, tu pedido #{{orderNumber}} ha sido confirmado."
                                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 resize-none bg-white"
                              />
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {(VARIABLES_BY_EVENT[formEvent] || []).map((v) => (
                                  <span
                                    key={v.key}
                                    draggable
                                    onDragStart={(e) => e.dataTransfer.setData("text/plain", v.key)}
                                    onClick={() => navigator.clipboard.writeText(v.key).then(() => toast.success(`${v.key} copiado`))}
                                    title={v.desc}
                                    className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium cursor-grab active:cursor-grabbing hover:bg-blue-200 transition-colors select-none"
                                  >
                                    {v.key}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
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
