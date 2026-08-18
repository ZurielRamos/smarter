import { useEffect, useState } from "react";
import headerBg from "@/assets/header-background.jpg";
import {
  MessageSquare,
  Phone,
  Mail,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";
import { motion } from "framer-motion";
import { api } from "@/services/api";

const WhatsAppIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
  </svg>
);

const MetaIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M6.915 4.03c-1.968 0-3.683 1.28-4.871 3.113C.704 9.208 0 11.883 0 14.449c0 .706.07 1.369.21 1.973a6.624 6.624 0 0 0 .265.86 5.297 5.297 0 0 0 .371.761c.696 1.159 1.818 1.927 3.593 1.927 1.497 0 2.633-.671 3.965-2.444.76-1.012 1.144-1.626 2.663-4.32l.756-1.339.186-.325c.061.1.121.196.183.3l2.152 3.595c.724 1.21 1.665 2.556 2.47 3.314 1.046.987 1.992 1.22 3.06 1.22 1.075 0 1.876-.355 2.455-.843a3.743 3.743 0 0 0 .81-.973c.542-.939.861-2.127.861-3.745 0-2.72-.681-5.357-2.084-7.45-1.282-1.912-2.957-2.93-4.716-2.93-1.047 0-2.088.467-3.053 1.308-.652.57-1.257 1.29-1.82 2.05-.69-.875-1.335-1.547-1.958-2.056-1.182-.966-2.315-1.303-3.454-1.303zm10.16 2.053c1.147 0 2.188.758 2.992 1.999 1.132 1.748 1.647 4.195 1.647 6.4 0 1.548-.368 2.9-1.839 2.9-.58 0-1.027-.23-1.664-1.004-.496-.601-1.343-1.878-2.832-4.358l-.617-1.028a44.908 44.908 0 0 0-1.255-1.98c.07-.109.141-.224.211-.327 1.12-1.667 2.118-2.602 3.358-2.602zm-10.201.553c1.265 0 2.058.791 2.675 1.446.307.327.737.871 1.234 1.579l-1.02 1.566c-.757 1.163-1.882 3.017-2.837 4.338-1.191 1.649-1.81 1.817-2.486 1.817-.524 0-1.038-.237-1.383-.794-.263-.426-.464-1.13-.464-2.046 0-2.221.63-4.535 1.66-6.088.454-.687.964-1.226 1.533-1.533a2.264 2.264 0 0 1 1.088-.285z" />
  </svg>
);

const OpenRouterIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 512 512" fill="currentColor" className={className}>
    <path fillRule="evenodd" clipRule="evenodd" d="M358.485 41.75l154.027 87.573v1.856l-155.605 86.634.362-45.162-17.514-.64c-22.592-.598-34.368.042-48.384 2.346-22.699 3.734-43.478 12.31-67.136 28.843l-46.208 32.107c-6.059 4.16-10.56 7.168-14.507 9.706l-10.987 6.87-8.469 4.992 8.213 4.906 11.307 7.211c10.155 6.699 24.96 16.981 57.621 39.808 23.68 16.533 44.438 25.109 67.136 28.843l6.4.96c14.806 1.941 29.334 2.005 60.267.704l.469-46.059 154.027 87.573v1.856l-155.605 86.656.298-39.722-13.546.469c-29.568.896-45.59.043-66.944-3.456-36.139-5.973-69.547-19.755-104.128-43.925l-46.038-32a467.072 467.072 0 00-16.106-10.624l-9.963-5.974c-5.38-3.1-10.785-6.157-16.213-9.173C62.037 314.24 12.01 301.141 0 301.141v-90.197l2.987.085c12.032-.149 62.08-13.269 81.258-23.978l21.675-12.374 9.344-5.845c9.131-5.973 22.869-15.488 57.301-39.531 34.582-24.17 67.968-37.973 104.128-43.925 24.576-4.053 42.112-4.544 81.366-2.944l.426-40.683z" />
  </svg>
);

interface ProviderStatus {
  channel: string;
  provider: string;
  name: string;
  configured: boolean;
  keys: { key: string; label: string; set: boolean }[];
}

const CHANNEL_ICONS: Record<string, { icon: any; color: string; bg: string; description?: string }> = {
  sms: { icon: MessageSquare, color: "text-blue-600", bg: "bg-blue-50", description: "Envío de SMS masivo y transaccional" },
  llamada: { icon: Phone, color: "text-purple-600", bg: "bg-purple-50", description: "Llamadas automáticas e IVR" },
  email: { icon: Mail, color: "text-orange-600", bg: "bg-orange-50", description: "Email transaccional" },
  whatsapp: { icon: MetaIcon, color: "text-blue-600", bg: "bg-blue-50", description: "WhatsApp, Messenger e Instagram" },
  ai: { icon: OpenRouterIcon, color: "text-gray-900", bg: "bg-gray-50", description: "Modelos de lenguaje (LLM) para bots e IA" },
};

export function AdminProviders() {
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<ProviderStatus[]>("/providers/status")
      .then(({ data }) => setProviders(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div
        className="px-8 pt-16 pb-6 shrink-0 rounded-b-2xl"
        style={{ backgroundImage: `url(${headerBg})`, backgroundSize: "cover", backgroundPosition: "center" }}
      >
        <h1 className="text-2xl font-bold text-white">Proveedores</h1>
        <p className="text-brand-300 text-sm mt-1">
          Estado de configuración de los servicios de comunicación
        </p>
      </div>

      {/* Content */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1, ease: "easeOut" }}
        className="py-6 flex-1 min-h-0 overflow-auto"
      >
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-brand-500" />
          </div>
        ) : (
          <div className="space-y-4">
            {providers.map((p) => {
              const channelInfo = CHANNEL_ICONS[p.channel] || { icon: MessageSquare, color: "text-gray-600", bg: "bg-gray-50" };
              const Icon = channelInfo.icon;

              return (
                <div
                  key={p.channel}
                  className={`bg-white rounded-xl border overflow-hidden ${p.configured ? "border-green-200" : "border-red-200"}`}
                >
                  <div className="px-5 py-4 flex items-center gap-4">
                    <div className={`h-10 w-10 rounded-lg ${channelInfo.bg} flex items-center justify-center shrink-0`}>
                      <Icon className={`h-5 w-5 ${channelInfo.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-gray-900">{p.name}</h3>
                        {p.configured ? (
                          <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-green-50 text-green-700 font-medium">
                            <CheckCircle2 className="h-2.5 w-2.5" /> Configurado
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-red-50 text-red-700 font-medium">
                            <XCircle className="h-2.5 w-2.5" /> Sin configurar
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {(channelInfo as any).description || `Proveedor: ${p.provider}`}
                      </p>
                    </div>
                  </div>

                  {/* Keys status */}
                  <div className="px-5 pb-4">
                    <div className="flex flex-wrap gap-2">
                      {p.keys.map((k) => (
                        <div
                          key={k.key}
                          className={`inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border ${
                            k.set
                              ? "bg-green-50/50 border-green-200 text-green-700"
                              : "bg-red-50/50 border-red-200 text-red-600"
                          }`}
                        >
                          {k.set ? (
                            <CheckCircle2 className="h-3 w-3" />
                          ) : (
                            <XCircle className="h-3 w-3" />
                          )}
                          {k.label}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Info */}
            <div className="bg-gray-50 rounded-xl border border-gray-200 p-5">
              <h4 className="text-sm font-semibold text-gray-700 mb-2">
                ¿Cómo configurar?
              </h4>
              <p className="text-xs text-gray-500">
                Las credenciales de los proveedores se configuran en las variables de entorno del servidor (<code className="bg-gray-200 px-1 rounded">.env</code>). 
                Esto garantiza que no se expongan en la base de datos y se gestionen de forma segura por entorno (desarrollo, staging, producción).
              </p>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
