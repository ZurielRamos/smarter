import { useEffect, useState } from "react";
import { useParams, useNavigate, Outlet } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Plus, Mail, Globe, Loader2, FileText, MessageSquare, Phone, X } from "lucide-react";
import { WhatsAppIcon } from "@/components/ChannelIcons";
import { toast } from "sonner";
import { api } from "@/services/api";

interface TemplateTranslation {
  id: string;
  language: string;
  subject: string | null;
}

interface Template {
  id: string;
  tenantId: string;
  name: string;
  channel: string;
  defaultLanguage: string;
  translations: TemplateTranslation[];
  createdAt: string;
  updatedAt: string;
}

const CHANNEL_CONFIG: Record<string, { icon: any; color: string; bg: string; label: string; border: string; description: string }> = {
  email: { icon: Mail, color: "text-orange-600", bg: "bg-orange-50 dark:bg-orange-500/15", border: "border-orange-200 dark:border-orange-500/30", label: "Email", description: "Plantilla HTML con editor visual" },
  sms: { icon: MessageSquare, color: "text-sky-600", bg: "bg-sky-50 dark:bg-sky-500/15", border: "border-sky-200 dark:border-sky-500/30", label: "SMS", description: "Mensaje de texto corto" },
  whatsapp: { icon: WhatsAppIcon, color: "text-green-600", bg: "bg-green-50 dark:bg-green-500/15", border: "border-green-200 dark:border-green-500/30", label: "WhatsApp", description: "Plantilla de Meta Business" },
  llamada: { icon: Phone, color: "text-purple-600", bg: "bg-purple-50 dark:bg-purple-500/15", border: "border-purple-200 dark:border-purple-500/30", label: "Llamada", description: "Texto a voz o audio pre-grabado" },
};

export function Plantillas() {
  const { slug, templateId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const tenantRole = user?.tenantRoles.find((tr: any) => tr.tenant.slug === slug);
  const tenantId = tenantRole?.tenantId || "";

  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterChannel, setFilterChannel] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const fetchTemplates = () => {
    if (!tenantId) return;
    setLoading(true);
    const params: any = { tenantId };
    if (filterChannel) params.channel = filterChannel;
    api
      .get<Template[]>("/templates", { params })
      .then(({ data }) => setTemplates(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchTemplates();
  }, [tenantId, filterChannel]);

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Sidebar — Templates list */}
      <div className="w-80 border-r border-border flex flex-col shrink-0">
        <div className="px-3 py-3 border-b border-border flex items-center justify-between">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase">Plantillas</h3>
          <button
            onClick={() => setShowCreateModal(true)}
            className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title="Nueva plantilla"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {/* Channel filter */}
        <div className="px-3 py-2 border-b border-border flex items-center gap-1">
          <button
            onClick={() => setFilterChannel(null)}
            className={`text-[10px] px-2 py-1 rounded-md font-medium transition-colors ${
              !filterChannel ? "bg-brand-100 text-brand-700 dark:bg-brand-700 dark:text-brand-100" : "bg-muted text-muted-foreground hover:bg-muted"
            }`}
          >
            Todos
          </button>
          {Object.entries(CHANNEL_CONFIG).map(([key, cfg]) => (
            <button
              key={key}
              onClick={() => setFilterChannel(filterChannel === key ? null : key)}
              className={`text-[10px] px-2 py-1 rounded-md font-medium transition-colors ${
                filterChannel === key ? "bg-brand-100 text-brand-700 dark:bg-brand-700 dark:text-brand-100" : "bg-muted text-muted-foreground hover:bg-muted"
              }`}
            >
              {cfg.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : templates.length === 0 ? (
            <div className="px-3 py-8 text-center">
              <FileText className="h-6 w-6 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground">Sin plantillas</p>
              <p className="text-[10px] text-muted-foreground mt-1">
                Crea tu primera plantilla
              </p>
            </div>
          ) : (
            templates.map((tpl) => {
              const channelInfo = CHANNEL_CONFIG[tpl.channel] || CHANNEL_CONFIG.email;
              const Icon = channelInfo.icon;
              return (
                <button
                  key={tpl.id}
                  onClick={() =>
                    navigate(`/${slug}/comunicaciones/plantillas/${tpl.id}`)
                  }
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors ${
                    templateId === tpl.id
                      ? "bg-brand-50 text-brand-700 dark:bg-brand-700 dark:text-brand-100"
                      : "text-foreground hover:bg-muted"
                  }`}
                >
                  <div className={`h-7 w-7 rounded-lg ${channelInfo.bg} flex items-center justify-center shrink-0`}>
                    <Icon className={`h-3.5 w-3.5 ${channelInfo.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{tpl.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[9px] text-muted-foreground">{channelInfo.label}</span>
                      <Globe className="h-2.5 w-2.5 text-muted-foreground/40" />
                      <div className="flex items-center gap-0.5">
                        {tpl.translations.map((t) => (
                          <span
                            key={t.language}
                            className={`text-[9px] px-1 py-0 rounded font-medium ${
                              t.language === tpl.defaultLanguage
                                ? "bg-brand-50 text-brand-700 dark:bg-brand-700 dark:text-brand-100"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {t.language.toUpperCase()}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
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

      {/* Create Modal */}
      {showCreateModal && (
        <CreateTemplateModal
          tenantId={tenantId}
          onClose={() => setShowCreateModal(false)}
          onCreated={(tpl) => {
            setShowCreateModal(false);
            fetchTemplates();
            if (tpl.channel === "email") {
              navigate(`/${slug}/email-builder/global/${tpl.id}?lang=es`);
            } else {
              navigate(`/${slug}/comunicaciones/plantillas/${tpl.id}`);
            }
          }}
        />
      )}
    </div>
  );
}

// === Create Template Modal ===

function CreateTemplateModal({
  tenantId,
  onClose,
  onCreated,
}: {
  tenantId: string;
  onClose: () => void;
  onCreated: (tpl: Template) => void;
}) {
  const [name, setName] = useState("");
  const [channel, setChannel] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!name.trim() || !channel || !tenantId) return;

    setSaving(true);
    try {
      const translations: any[] = [{ language: "es" }];
      if (channel === "email") {
        translations[0].subject = "";
        translations[0].html = "";
        translations[0].blocks = null;
      } else if (channel === "sms" || channel === "llamada") {
        translations[0].body = "";
      } else if (channel === "whatsapp") {
        translations[0].whatsappComponents = [];
      }

      const { data } = await api.post("/templates", {
        tenantId,
        name: name.trim(),
        channel,
        defaultLanguage: "es",
        translations,
      });
      toast.success("Plantilla creada");
      onCreated(data);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Error al crear plantilla");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-card text-card-foreground rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">Nueva plantilla</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-foreground mb-1.5">Nombre</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Bienvenida nuevo cliente"
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200"
              autoFocus
            />
          </div>

          {/* Channel selector */}
          <div>
            <label className="block text-xs font-medium text-foreground mb-2">Canal</label>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(CHANNEL_CONFIG).filter(([key]) => key !== "whatsapp").map(([key, cfg]) => {
                const Icon = cfg.icon;
                const isSelected = channel === key;
                return (
                  <button
                    key={key}
                    onClick={() => setChannel(key)}
                    className={`flex items-center gap-2.5 p-2.5 rounded-xl border-2 transition-all text-left ${
                      isSelected
                        ? `${cfg.border} ${cfg.bg}`
                        : "border-border hover:bg-muted bg-card"
                    }`}
                  >
                    <div className={`h-7 w-7 rounded-lg ${cfg.bg} flex items-center justify-center shrink-0`}>
                      <Icon className={`h-3.5 w-3.5 ${cfg.color}`} />
                    </div>
                    <div>
                      <p className="text-xs font-medium text-foreground">{cfg.label}</p>
                      <p className="text-[9px] text-muted-foreground mt-0.5">{cfg.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-border flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleCreate}
            disabled={!name.trim() || !channel || saving}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-brand-700 hover:bg-brand-600 text-white text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving && <Loader2 className="h-3 w-3 animate-spin" />}
            {channel === "email" ? "Crear y abrir editor" : "Crear plantilla"}
          </button>
        </div>
      </div>
    </div>
  );
}
