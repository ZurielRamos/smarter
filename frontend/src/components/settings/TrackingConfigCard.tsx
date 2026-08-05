import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Crosshair, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/services/api";

interface TrackingConfig {
  whatsappPhone?: string;
  messageTemplate?: string;
  nextCode?: number;
}

export function TrackingConfigCard() {
  const { slug } = useParams();
  const { user } = useAuth();
  const tenantRole = user?.tenantRoles.find((tr) => tr.tenant.slug === slug);
  const tenantId = tenantRole?.tenantId;

  const [config, setConfig] = useState<TrackingConfig>({
    whatsappPhone: "",
    messageTemplate: "Hola, me interesa información. Ref: {{code}}",
  });
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (!tenantId) return;
    api.get(`/tenants/${tenantId}`).then(({ data }) => {
      if (data.trackingConfig) {
        setConfig(data.trackingConfig);
      }
    }).catch(() => {});
  }, [tenantId]);

  const handleSave = async () => {
    if (!tenantId) return;
    setSaving(true);
    try {
      await api.put(`/tenants/${tenantId}`, { trackingConfig: config });
      toast.success("Configuración guardada");
    } catch {
      toast.error("Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  const baseUrl = window.location.origin;
  const linkTrackerUrl = `${baseUrl}/api/t/${slug}/wa`;
  const pixelScript = `<script src="${baseUrl}/api/t/${slug}/pixel.js"></script>`;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
        <Crosshair className="h-4 w-4 text-gray-400" />
        <h2 className="text-sm font-semibold text-gray-900">Tracking de conversiones</h2>
      </div>

      <div className="p-5 space-y-5">
        {/* WhatsApp Phone */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">
            Número de WhatsApp (con código de país)
          </label>
          <input
            type="text"
            value={config.whatsappPhone || ""}
            onChange={(e) => setConfig({ ...config, whatsappPhone: e.target.value })}
            placeholder="573001234567"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
          />
          <p className="text-[11px] text-gray-400 mt-1">Se usará como destino en los links de tracking</p>
        </div>

        {/* Message Template */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">
            Plantilla del mensaje
          </label>
          <textarea
            value={config.messageTemplate || ""}
            onChange={(e) => setConfig({ ...config, messageTemplate: e.target.value })}
            placeholder="Hola, me interesa información. Ref: {{code}}"
            rows={3}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 resize-none"
          />
          <p className="text-[11px] text-gray-400 mt-1">
            Usa <code className="px-1 py-0.5 bg-gray-100 rounded text-[10px]">{"{{code}}"}</code> donde quieras insertar el código de seguimiento
          </p>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors disabled:opacity-50"
        >
          {saving ? "Guardando..." : "Guardar configuración"}
        </button>

        {/* Generated URLs */}
        <div className="border-t border-gray-100 pt-4 space-y-3">
          <p className="text-xs font-medium text-gray-700">URLs de tracking</p>

          {/* Link Tracker */}
          <div>
            <p className="text-[11px] text-gray-500 mb-1">Link tracker (usar como URL de destino en ads)</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-[11px] bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-600 truncate">
                {linkTrackerUrl}
              </code>
              <button
                onClick={() => copyToClipboard(linkTrackerUrl, "link")}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors shrink-0"
              >
                {copied === "link" ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5 text-gray-400" />}
              </button>
            </div>
          </div>

          {/* Pixel */}
          <div>
            <p className="text-[11px] text-gray-500 mb-1">Pixel (insertar en tu sitio web antes de {"</body>"})</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-[11px] bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-600 truncate">
                {pixelScript}
              </code>
              <button
                onClick={() => copyToClipboard(pixelScript, "pixel")}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors shrink-0"
              >
                {copied === "pixel" ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5 text-gray-400" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
