import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Check, MessageSquare, Phone } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { WhatsAppIcon, MessengerIcon, InstagramIcon, EmailIcon, FormIcon, ChatIcon, GenericChatIcon } from "@/components/ChannelIcons";
import { EvolutionQrConnect } from "@/components/EvolutionQrConnect";
import headerBg from "@/assets/header-background.jpg";
import axios from "axios";

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || "/api" });
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

interface Inbox {
  id: string;
  name: string;
  channel: string;
  status: string;
}

interface TenantMember {
  id: string;
  userId: string;
  role: string;
  user: { id: string; name: string; email: string };
}

const CHANNELS = [
  { value: "whatsapp", label: "WhatsApp", description: "Conecta tu número de WhatsApp Business", color: "text-green-600", bg: "bg-green-50" },
  { value: "messenger", label: "Facebook Messenger", description: "Conecta tu página de Facebook", color: "text-blue-600", bg: "bg-blue-50" },
  { value: "instagram", label: "Instagram", description: "Conecta tu cuenta de Instagram", color: "text-pink-600", bg: "bg-pink-50" },
  { value: "sms", label: "SMS", description: "Envía mensajes de texto a tus contactos", color: "text-sky-600", bg: "bg-sky-50" },
  { value: "llamada", label: "Llamada", description: "Realiza llamadas automáticas a tus contactos", color: "text-purple-600", bg: "bg-purple-50" },
  { value: "email", label: "Email", description: "Envía correos desde tu propio dominio", color: "text-orange-600", bg: "bg-orange-50" },
  { value: "email_transaccional", label: "Email Transaccional", description: "Envía correos transaccionales vía Mailgun", color: "text-red-600", bg: "bg-red-50" },
  { value: "form", label: "Formulario", description: "Recibe mensajes desde un formulario web", color: "text-violet-600", bg: "bg-violet-50" },
  { value: "chat", label: "Chat", description: "Chat en vivo para tu sitio web", color: "text-teal-600", bg: "bg-teal-50" },
  { value: "evolution", label: "Chat Genérico", description: "Conecta un número de WhatsApp vía QR", color: "text-emerald-600", bg: "bg-emerald-50" },
];

const STEPS = [
  { n: 1, title: "Elegir canal", desc: "Selecciona el canal que deseas conectar" },
  { n: 2, title: "Crear bandeja", desc: "Nombra tu bandeja de entrada" },
  { n: 3, title: "Añadir agentes", desc: "Asigna usuarios que atenderán los chats" },
  { n: 4, title: "¡Listo!", desc: "Todo está configurado" },
];

export function NewInbox() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const tenantRole = user?.tenantRoles.find((tr) => tr.tenant.slug === slug);
  const tenantId = tenantRole?.tenantId || "";

  const [step, setStep] = useState(1);
  const [channel, setChannel] = useState("");
  const [name, setName] = useState("");
  const [createdInbox, setCreatedInbox] = useState<Inbox | null>(null);
  const [members, setMembers] = useState<TenantMember[]>([]);
  const [selectedAgents, setSelectedAgents] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [waConfig, setWaConfig] = useState<{ appId: string; configId: string } | null>(null);

  // Pre-load WhatsApp config so FB.login can be called synchronously on click
  const preloadWaConfig = async () => {
    try {
      const { data } = await api.get("/chats/whatsapp/config");
      setWaConfig(data);
    } catch {}
  };

  const handleSelectChannel = (ch: string) => {
    setChannel(ch);
    setStep(2);
    if (ch === "whatsapp") preloadWaConfig();
  };

  const handleCreateInbox = async () => {
    if (!name.trim() || !channel) return;
    setCreating(true);
    try {
      const { data } = await api.post<Inbox>("/chats/inboxes", { tenantId, name: name.trim(), channel });
      setCreatedInbox(data);

      // For form channel, create form and navigate to builder
      if (channel === "form") {
        const { data: form } = await api.post("/forms", { tenantId, inboxId: data.id, name: name.trim() });
        navigate(`/${slug}/forms/${form.id}`);
        return;
      }

      // For chat channel, navigate to widget builder
      if (channel === "chat") {
        navigate(`/${slug}/chat-widget/${data.id}`);
        return;
      }

      // Load tenant members
      const { data: m } = await api.get<TenantMember[]>(`/tenants/${tenantId}/members`);
      setMembers(m);
      // Auto-select all as agents
      setSelectedAgents(new Set(m.map((member) => member.userId)));
      setStep(3);
    } catch {} finally { setCreating(false); }
  };

  const toggleAgent = (userId: string) => {
    setSelectedAgents((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const handleConnect = () => {
    if (!createdInbox) return;

    if (createdInbox.channel === "whatsapp") {
      if (!waConfig) { alert("Configuración no cargada. Intenta de nuevo."); return; }
      setConnecting(true);

      const FB = (window as any).FB;
      if (!FB) { alert("Facebook SDK no cargado. Recarga la página."); setConnecting(false); return; }

      FB.init({ appId: waConfig.appId, xfbml: true, version: "v21.0" });

      FB.login(
        (response: any) => {
          if (response.authResponse?.code) {
            api.post("/chats/whatsapp/embedded-signup", {
              code: response.authResponse.code,
              inboxId: createdInbox.id,
            }).then(() => {
              setStep(4);
              setConnecting(false);
            }).catch(() => { setConnecting(false); });
          } else { setConnecting(false); }
        },
        {
          config_id: waConfig.configId,
          response_type: "code",
          override_default_response_type: true,
          extras: {
            setup: {},
            featureType: "whatsapp_business_app_onboarding",
            sessionInfoVersion: "3",
            version: "v4",
          },
        }
      );
    } else {
      // Messenger / Instagram — OAuth redirect
      window.location.href = `/api/chats/oauth/connect?inboxId=${createdInbox.id}&channel=${createdInbox.channel}`;
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Hero */}
      <div className="px-8 pt-16 pb-4 shrink-0 rounded-b-2xl" style={{ backgroundImage: `url(${headerBg})`, backgroundSize: "cover", backgroundPosition: "center" }}>
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(`/${slug}/comunicaciones`)} className="p-1.5 rounded-lg hover:bg-white/10 text-white transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-white">Nueva bandeja</h1>
            <p className="text-brand-300 mt-0.5 text-sm">Conecta un canal de comunicación</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-4xl mx-auto flex gap-10">
          {/* Stepper */}
          <div className="w-56 shrink-0">
            <div className="space-y-6">
              {STEPS.map((s) => (
                <div key={s.n} className="flex items-start gap-3">
                  <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${step > s.n ? "bg-green-500 text-white" : step === s.n ? "bg-brand-600 text-white" : "bg-gray-200 text-gray-500"}`}>
                    {step > s.n ? <Check className="h-3.5 w-3.5" /> : s.n}
                  </div>
                  <div>
                    <p className={`text-sm font-medium ${step === s.n ? "text-brand-700" : step > s.n ? "text-gray-700" : "text-gray-400"}`}>{s.title}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Step content */}
          <div className="flex-1">
            {step === 1 && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-1">Elige un canal</h2>
                <p className="text-sm text-gray-500 mb-5">Selecciona el proveedor que deseas integrar</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {CHANNELS.map((ch) => (
                      <button
                        key={ch.value}
                        onClick={() => handleSelectChannel(ch.value)}
                        className="p-5 rounded-xl border-2 border-gray-200 text-left transition-all hover:border-brand-300 hover:shadow-md"
                      >
                        <div className={`h-10 w-10 rounded-lg flex items-center justify-center mb-3 ${ch.bg}`}>
                          {ch.value === "whatsapp" && <WhatsAppIcon className={`h-5 w-5 ${ch.color}`} />}
                          {ch.value === "messenger" && <MessengerIcon className={`h-5 w-5 ${ch.color}`} />}
                          {ch.value === "instagram" && <InstagramIcon className={`h-5 w-5 ${ch.color}`} />}
                          {ch.value === "sms" && <MessageSquare className={`h-5 w-5 ${ch.color}`} />}
                          {ch.value === "llamada" && <Phone className={`h-5 w-5 ${ch.color}`} />}
                          {ch.value === "email" && <EmailIcon className={`h-5 w-5 ${ch.color}`} />}
                          {ch.value === "email_transaccional" && <EmailIcon className={`h-5 w-5 ${ch.color}`} />}
                          {ch.value === "form" && <FormIcon className={`h-5 w-5 ${ch.color}`} />}
                          {ch.value === "chat" && <ChatIcon className={`h-5 w-5 ${ch.color}`} />}
                          {ch.value === "evolution" && <GenericChatIcon className={`h-5 w-5 ${ch.color}`} />}
                        </div>
                        <p className="text-sm font-semibold text-gray-900">{ch.label}</p>
                        <p className="text-xs text-gray-500 mt-1">{ch.description}</p>
                      </button>
                  ))}
                </div>
              </div>
            )}

            {step === 2 && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-1">Configurar bandeja</h2>
                <p className="text-sm text-gray-500 mb-5">
                  Canal: <span className="capitalize font-medium">{channel}</span>
                </p>
                <div className="space-y-4 max-w-md">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Nombre de la bandeja</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Ej: Soporte, Ventas, Atención al cliente..."
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                    />
                  </div>
                  <p className="text-xs text-gray-400">
                    Al crear la bandeja podrás conectar tu cuenta mediante autenticación de Facebook.
                  </p>
                  <div className="flex gap-3 pt-2">
                    <button onClick={() => setStep(1)} className="px-4 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-100 font-medium">
                      Atrás
                    </button>
                    <button
                      onClick={handleCreateInbox}
                      disabled={!name.trim() || creating}
                      className="px-5 py-2 text-sm rounded-lg bg-brand-800 hover:bg-brand-700 text-white font-medium disabled:opacity-50"
                    >
                      {creating ? "Creando..." : "Crear bandeja"}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 mb-1">Añadir agentes</h2>
                <p className="text-sm text-gray-500 mb-5">
                  Los agentes asignados recibirán y podrán responder los chats de esta bandeja
                </p>
                <div className="space-y-2 max-w-md">
                  {members.length === 0 ? (
                    <p className="text-xs text-gray-400 py-4 text-center bg-gray-50 rounded-lg">No hay miembros en este tenant.</p>
                  ) : (
                    members.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => toggleAgent(m.userId)}
                        className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border transition-all text-left ${selectedAgents.has(m.userId) ? "border-brand-500 bg-brand-50/50" : "border-gray-200 hover:border-gray-300"}`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-600">
                            {m.user.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-gray-800">{m.user.name}</p>
                            <p className="text-[11px] text-gray-400">{m.user.email}</p>
                          </div>
                        </div>
                        {selectedAgents.has(m.userId) && (
                          <div className="h-5 w-5 rounded-full bg-brand-600 flex items-center justify-center">
                            <Check className="h-3 w-3 text-white" />
                          </div>
                        )}
                      </button>
                    ))
                  )}
                </div>
                <div className="flex gap-3 pt-4 mt-4">
                  {(channel === "sms" || channel === "email" || channel === "email_transaccional" || channel === "llamada" || channel === "chat") ? (
                    <button
                      onClick={() => setStep(4)}
                      className="px-5 py-2 text-sm rounded-lg bg-brand-800 hover:bg-brand-700 text-white font-medium"
                    >
                      Continuar
                    </button>
                  ) : channel === "evolution" && createdInbox ? (
                    <div className="w-full">
                      <EvolutionQrConnect
                        inboxId={createdInbox.id}
                        onConnected={() => setStep(4)}
                      />
                      <div className="flex justify-center mt-4">
                        <button onClick={() => setStep(4)} className="px-4 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-100 font-medium">
                          Omitir por ahora
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={handleConnect}
                        disabled={connecting}
                        className="px-5 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium disabled:opacity-50"
                      >
                        {connecting ? "Conectando..." : `Conectar ${channel}`}
                      </button>
                      <button onClick={() => { setStep(4); }} className="px-4 py-2 text-sm text-gray-600 rounded-lg hover:bg-gray-100 font-medium">
                        Omitir por ahora
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="text-center py-12">
                <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                  <Check className="h-8 w-8 text-green-600" />
                </div>
                <h2 className="text-lg font-semibold text-gray-900 mb-2">¡Bandeja creada!</h2>
                <p className="text-sm text-gray-500 mb-6 max-w-sm mx-auto">
                  {(channel === "sms" || channel === "email" || channel === "email_transaccional" || channel === "llamada")
                    ? <>Tu bandeja <strong>{createdInbox?.name}</strong> fue creada. Ahora configura los datos del canal.</>
                    : <>Tu bandeja <strong>{createdInbox?.name}</strong> está lista. Ahora conecta tu cuenta.</>
                  }
                </p>
                <button
                  onClick={() => navigate(`/${slug}/comunicaciones/canales/${createdInbox?.id}`)}
                  className="px-5 py-2.5 text-sm rounded-lg bg-brand-800 hover:bg-brand-700 text-white font-medium"
                >
                  {(channel === "sms" || channel === "email" || channel === "llamada") ? "Configurar canal" : "Ir a configuración"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
