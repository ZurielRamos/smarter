import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { MessageSquare, Phone, Mail, Send, X, Check, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import axios from "axios";

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || "/api" });
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

interface ChannelConfig {
  id: string;
  channel: string;
  provider: string;
  credentials: Record<string, string>;
  isActive: boolean;
}

interface ProviderDef {
  value: string;
  label: string;
  fields: { key: string; label: string; placeholder: string; secret?: boolean; maxLength?: number }[];
}

const channelDefinitions = [
  {
    channel: "sms",
    label: "SMS",
    description: "Envía mensajes de texto a tus clientes",
    icon: MessageSquare,
    color: "text-blue-600",
    bg: "bg-blue-50",
    border: "border-blue-200",
    providers: [
      {
        value: "onurix",
        label: "Onurix",
        fields: [
          { key: "client", label: "Client ID", placeholder: "Ej: 8411" },
          { key: "key", label: "API Key", placeholder: "Tu clave API de Onurix", secret: true },
        ],
      },
      {
        value: "twilio",
        label: "Twilio",
        fields: [
          { key: "accountSid", label: "Account SID", placeholder: "ACxxxxxxxxxxxxxxxx" },
          { key: "authToken", label: "Auth Token", placeholder: "Token de autenticación", secret: true },
          { key: "fromNumber", label: "Número origen", placeholder: "+1234567890" },
        ],
      },
      {
        value: "brevo",
        label: "Brevo (ex Sendinblue)",
        fields: [
          { key: "apiKey", label: "API Key", placeholder: "xkeysib-xxxxxxx...", secret: true },
          { key: "sender", label: "Sender (nombre o número)", placeholder: "MiEmpresa (máx 11 caracteres)", maxLength: 11 },
        ],
      },
    ] as ProviderDef[],
  },
  {
    channel: "whatsapp",
    label: "WhatsApp",
    description: "Envía mensajes con plantillas de WhatsApp vía Onurix",
    icon: Send,
    color: "text-green-600",
    bg: "bg-green-50",
    border: "border-green-200",
    providers: [
      {
        value: "onurix",
        label: "Onurix",
        fields: [
          { key: "client", label: "Client ID (Onurix)", placeholder: "Ej: 8411" },
          { key: "key", label: "API Key (Onurix)", placeholder: "Key de la cuenta Onurix", secret: true },
          { key: "phoneSenderId", label: "Phone Sender ID (Onurix)", placeholder: "ID del número de teléfono remitente" },
          { key: "metaToken", label: "Meta Access Token", placeholder: "Token permanente de Meta Business", secret: true },
          { key: "metaBusinessId", label: "Meta Business ID (WABA)", placeholder: "ID de la cuenta WhatsApp Business" },
        ],
      },
    ] as ProviderDef[],
  },
  {
    channel: "email",
    label: "Email",
    description: "Envía correos electrónicos personalizados",
    icon: Mail,
    color: "text-purple-600",
    bg: "bg-purple-50",
    border: "border-purple-200",
    providers: [
      {
        value: "sendgrid",
        label: "SendGrid",
        fields: [
          { key: "apiKey", label: "API Key", placeholder: "SG.xxxxxxx...", secret: true },
          { key: "fromEmail", label: "Email remitente", placeholder: "noreply@tudominio.com" },
          { key: "fromName", label: "Nombre remitente", placeholder: "Mi Empresa" },
        ],
      },
      {
        value: "mailgun",
        label: "Mailgun",
        fields: [
          { key: "apiKey", label: "API Key", placeholder: "key-xxxxxxx", secret: true },
          { key: "domain", label: "Dominio", placeholder: "mg.tudominio.com" },
          { key: "fromEmail", label: "Email remitente", placeholder: "noreply@tudominio.com" },
        ],
      },
      {
        value: "smtp",
        label: "SMTP personalizado",
        fields: [
          { key: "host", label: "Host", placeholder: "smtp.tudominio.com" },
          { key: "port", label: "Puerto", placeholder: "587" },
          { key: "user", label: "Usuario", placeholder: "usuario@tudominio.com" },
          { key: "password", label: "Contraseña", placeholder: "••••••••", secret: true },
          { key: "fromEmail", label: "Email remitente", placeholder: "noreply@tudominio.com" },
        ],
      },
      {
        value: "brevo",
        label: "Brevo (ex Sendinblue)",
        fields: [
          { key: "apiKey", label: "API Key", placeholder: "xkeysib-xxxxxxx...", secret: true },
          { key: "fromEmail", label: "Email remitente", placeholder: "noreply@tudominio.com" },
          { key: "fromName", label: "Nombre remitente", placeholder: "Mi Empresa" },
        ],
      },
    ] as ProviderDef[],
  },
  {
    channel: "llamada",
    label: "Llamada",
    description: "Realiza llamadas automatizadas de voz",
    icon: Phone,
    color: "text-orange-600",
    bg: "bg-orange-50",
    border: "border-orange-200",
    providers: [
      {
        value: "onurix",
        label: "Onurix",
        fields: [
          { key: "client", label: "Client ID", placeholder: "Ej: 8411" },
          { key: "key", label: "API Key", placeholder: "Tu clave API de Onurix", secret: true },
        ],
      },
      {
        value: "twilio",
        label: "Twilio Voice",
        fields: [
          { key: "accountSid", label: "Account SID", placeholder: "ACxxxxxxxxxxxxxxxx" },
          { key: "authToken", label: "Auth Token", placeholder: "Token de autenticación", secret: true },
          { key: "fromNumber", label: "Número origen", placeholder: "+1234567890" },
        ],
      },
    ] as ProviderDef[],
  },
];

export function ChannelConfigCard() {
  const { slug } = useParams();
  const { user } = useAuth();
  const currentTenant = user?.tenantRoles.find((tr) => tr.tenant.slug === slug);
  const tenantId = currentTenant?.tenantId;

  const [configs, setConfigs] = useState<ChannelConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalChannel, setModalChannel] = useState<string | null>(null);

  // Modal form state
  const [selectedProvider, setSelectedProvider] = useState("");
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (tenantId) loadConfigs();
  }, [tenantId]);

  async function loadConfigs() {
    setLoading(true);
    try {
      const { data } = await api.get<ChannelConfig[]>("/channel-configs", {
        params: { tenantId },
      });
      setConfigs(data);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }

  function openModal(channel: string) {
    const existing = configs.find((c) => c.channel === channel);
    if (existing) {
      setSelectedProvider(existing.provider);
      setCredentials(existing.credentials);
    } else {
      setSelectedProvider("");
      setCredentials({});
    }
    setError("");
    setModalChannel(channel);
  }

  function closeModal() {
    setModalChannel(null);
    setSelectedProvider("");
    setCredentials({});
    setError("");
  }

  async function handleSave() {
    if (!selectedProvider) {
      setError("Selecciona un proveedor");
      return;
    }

    const channelDef = channelDefinitions.find((d) => d.channel === modalChannel);
    const providerDef = channelDef?.providers.find((p) => p.value === selectedProvider);
    const requiredFields = providerDef?.fields.map((f) => f.key) ?? [];
    const missing = requiredFields.filter((k) => !credentials[k]?.trim());

    if (missing.length > 0) {
      setError("Completa todos los campos requeridos");
      return;
    }

    setSaving(true);
    setError("");
    try {
      await api.post("/channel-configs", {
        tenantId,
        channel: modalChannel,
        provider: selectedProvider,
        credentials,
      });
      await loadConfigs();
      closeModal();
    } catch {
      setError("Error al guardar la configuración");
    } finally {
      setSaving(false);
    }
  }

  const activeChannelDef = channelDefinitions.find((d) => d.channel === modalChannel);
  const activeProviderDef = activeChannelDef?.providers.find((p) => p.value === selectedProvider);

  return (
    <>
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Canales</h2>
        <p className="text-sm text-gray-500 mb-5">
          Configura los proveedores y credenciales para cada canal de comunicación.
        </p>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {channelDefinitions.map((ch) => {
              const Icon = ch.icon;
              const config = configs.find((c) => c.channel === ch.channel);
              const isConfigured = !!config;

              return (
                <button
                  key={ch.channel}
                  onClick={() => openModal(ch.channel)}
                  className={cn(
                    "flex items-start gap-4 p-4 rounded-xl border-2 text-left transition-all hover:shadow-sm",
                    isConfigured
                      ? `${ch.border} ${ch.bg}`
                      : "border-gray-200 bg-white hover:border-gray-300"
                  )}
                >
                  <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center shrink-0", ch.bg)}>
                    <Icon className={cn("h-5 w-5", ch.color)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">{ch.label}</span>
                      {isConfigured && (
                        <span className="flex items-center gap-1 text-xs text-green-600 bg-green-100 px-1.5 py-0.5 rounded-full">
                          <Check className="h-3 w-3" />
                          Activo
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{ch.description}</p>
                    {isConfigured && (
                      <p className="text-xs text-gray-400 mt-1 capitalize">
                        Proveedor: {config.provider}
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Config Modal */}
      <AnimatePresence>
        {modalChannel && activeChannelDef && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 z-50"
              onClick={closeModal}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
            >
              <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="px-6 pt-6 pb-4 border-b border-gray-100">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center", activeChannelDef.bg)}>
                        <activeChannelDef.icon className={cn("h-5 w-5", activeChannelDef.color)} />
                      </div>
                      <div>
                        <h2 className="text-lg font-semibold text-gray-900">
                          Configurar {activeChannelDef.label}
                        </h2>
                        <p className="text-sm text-gray-500">
                          Selecciona un proveedor e ingresa las credenciales
                        </p>
                      </div>
                    </div>
                    <button onClick={closeModal} className="text-gray-400 hover:text-gray-600 transition-colors">
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                </div>

                {/* Body */}
                <div className="px-6 py-5 space-y-5 max-h-[60vh] overflow-y-auto">
                  {error && (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      {error}
                    </div>
                  )}

                  {/* Provider selection */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Proveedor
                    </label>
                    <div className="grid grid-cols-1 gap-2">
                      {activeChannelDef.providers.map((prov) => (
                        <button
                          key={prov.value}
                          type="button"
                          onClick={() => {
                            setSelectedProvider(prov.value);
                            setCredentials({});
                          }}
                          className={cn(
                            "flex items-center gap-3 px-4 py-3 rounded-lg border-2 text-left transition-all",
                            selectedProvider === prov.value
                              ? "border-brand-500 bg-brand-50 ring-1 ring-brand-200"
                              : "border-gray-200 hover:border-gray-300"
                          )}
                        >
                          <div className={cn(
                            "h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0",
                            selectedProvider === prov.value ? "border-brand-500" : "border-gray-300"
                          )}>
                            {selectedProvider === prov.value && (
                              <div className="h-2 w-2 rounded-full bg-brand-500" />
                            )}
                          </div>
                          <span className="text-sm font-medium text-gray-900">{prov.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Credential fields */}
                  {activeProviderDef && (
                    <div className="space-y-4 pt-2">
                      <div className="flex items-center gap-2">
                        <div className="h-px flex-1 bg-gray-200" />
                        <span className="text-xs text-gray-400 font-medium">Credenciales</span>
                        <div className="h-px flex-1 bg-gray-200" />
                      </div>
                      {activeProviderDef.fields.map((field) => (
                        <div key={field.key}>
                          <label className="block text-sm font-medium text-gray-700 mb-1.5">
                            {field.label}
                          </label>
                          <input
                            type={field.secret ? "password" : "text"}
                            value={credentials[field.key] ?? ""}
                            onChange={(e) => setCredentials({ ...credentials, [field.key]: e.target.value })}
                            placeholder={field.placeholder}
                            maxLength={field.maxLength}
                            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all"
                          />
                          {field.maxLength && (
                            <p className="text-xs text-gray-400 mt-1">
                              {(credentials[field.key] ?? "").length}/{field.maxLength} caracteres
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
                  <p className="text-xs text-gray-400">
                    Las credenciales se almacenan de forma segura.
                  </p>
                  <div className="flex items-center gap-3">
                    <Button onClick={closeModal} variant="outline" size="sm">
                      Cancelar
                    </Button>
                    <Button
                      onClick={handleSave}
                      disabled={saving || !selectedProvider}
                      size="sm"
                      className="bg-brand-800 hover:bg-brand-700 text-white gap-1.5"
                    >
                      {saving ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Guardando...
                        </>
                      ) : (
                        "Guardar configuración"
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
