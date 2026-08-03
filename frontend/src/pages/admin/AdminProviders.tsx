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
    <path d="M6.915 4.03c-1.968 0-3.402 1.042-4.36 2.879C1.513 8.388 1 10.547 1 12.753c0 1.63.406 2.976 1.182 3.86.638.727 1.504 1.112 2.428 1.112.939 0 1.777-.403 2.545-1.223.607-.65 1.18-1.524 1.734-2.603l.546-1.058c.86-1.67 1.576-2.812 2.152-3.478.636-.735 1.375-1.106 2.237-1.106 1.34 0 2.41.657 3.155 1.842.701 1.114 1.062 2.585 1.062 4.16 0 1.225-.21 2.278-.614 3.096-.357.721-.838 1.215-1.449 1.487l.822 1.596c.94-.483 1.673-1.235 2.177-2.252C23.453 16.21 23.7 14.763 23.7 13.1c0-2.066-.482-3.862-1.423-5.26-1.003-1.49-2.404-2.266-4.1-2.266-1.208 0-2.244.453-3.063 1.332-.77.826-1.49 2.05-2.192 3.68l-.046.1-.555 1.075c-.53 1.027-.987 1.769-1.384 2.256-.482.592-.977.887-1.515.887-.487 0-.876-.236-1.182-.716-.345-.54-.524-1.297-.524-2.2 0-1.863.397-3.632 1.1-4.96.585-1.103 1.29-1.666 2.1-1.666.606 0 1.12.27 1.532.8l1.358-1.404C8.91 4.485 8.008 4.03 6.915 4.03z" />
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
