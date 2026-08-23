import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Crosshair, Copy, Check, Globe, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/services/api";

interface TrackingConfig {
  codePattern?: string;
  nextCode?: number;
  pixelToken?: string;
  lastPingAt?: string;
  lastPingOrigin?: string;
}

export function TrackingConfigCard() {
  const { slug } = useParams();
  const { user } = useAuth();
  const tenantRole = user?.tenantRoles.find((tr) => tr.tenant.slug === slug);
  const tenantId = tenantRole?.tenantId;

  const [config, setConfig] = useState<TrackingConfig>({
    codePattern: "ref-{{code}}",
  });
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [verifyUrl, setVerifyUrl] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{ installed: boolean; error?: string; lastPingAt?: string; lastPingOrigin?: string } | null>(null);

  useEffect(() => {
    if (!slug) return;
    api.get(`/account/${slug}`).then(({ data }) => {
      if (data.trackingConfig) {
        setConfig(data.trackingConfig);
      }
    }).catch(() => {});
  }, [tenantId]);

  const handleSave = async () => {
    if (!tenantId) return;
    setSaving(true);
    try {
      await api.put(`/account/${slug}`, { trackingConfig: config });
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
  const pixelScript = `<script src="${baseUrl}/api/t/${slug}/pixel.js"></script>`;
  const previewCode = "1";
  const previewResult = (config.codePattern || "ref-{{code}}").replace("{{code}}", previewCode);

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
        <Crosshair className="h-4 w-4 text-gray-400" />
        <h2 className="text-sm font-semibold text-gray-900">Tracking de conversiones</h2>
      </div>

      <div className="p-5 space-y-5">
        {/* Explanation */}
        <div className="bg-blue-50 border border-blue-100 rounded-lg p-3">
          <p className="text-xs text-blue-700">
            Instala el pixel en tu sitio web. Cuando un visitante llega desde un anuncio (Google, Meta, TikTok) y hace click en un enlace de WhatsApp, el pixel agrega automáticamente un código de seguimiento al mensaje para poder atribuir la conversión.
          </p>
        </div>

        {/* Code Pattern */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1.5">
            Estructura del código en el mensaje
          </label>
          <input
            type="text"
            value={config.codePattern || ""}
            onChange={(e) => setConfig({ ...config, codePattern: e.target.value })}
            placeholder="ref-{{code}}"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
          />
          <p className="text-[11px] text-gray-400 mt-1.5">
            Usa <code className="px-1 py-0.5 bg-gray-100 rounded text-[10px]">{"{{code}}"}</code> donde irá el código único. Se agregará al final del texto del enlace de WhatsApp.
          </p>
          <p className="text-[11px] text-gray-500 mt-1">
            Vista previa: <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded">{previewResult}</span>
          </p>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors disabled:opacity-50"
        >
          {saving ? "Guardando..." : "Guardar"}
        </button>

        {/* Pixel Token */}
        {config.pixelToken && (
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1.5">Pixel Token</label>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-[11px] bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-500 font-mono truncate">
                {config.pixelToken}
              </code>
              <button
                onClick={() => copyToClipboard(config.pixelToken || "", "token")}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors shrink-0"
              >
                {copied === "token" ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5 text-gray-400" />}
              </button>
            </div>
            <p className="text-[11px] text-gray-400 mt-1">Se genera automáticamente. Identifica tu pixel de forma segura.</p>
          </div>
        )}

        {/* Pixel Script */}
        <div className="border-t border-gray-100 pt-4">
          <p className="text-xs font-medium text-gray-700 mb-2">Pixel de tracking</p>
          <p className="text-[11px] text-gray-500 mb-2">
            Inserta este script en tu sitio web, antes del cierre de {"</body>"}. El pixel detectará automáticamente los enlaces de WhatsApp y agregará el código de seguimiento.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-[11px] bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-gray-600 break-all">
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

        {/* Verification */}
        <div className="border-t border-gray-100 pt-4">
          <p className="text-xs font-medium text-gray-700 mb-2">Verificar instalación</p>

          {/* Last ping info */}
          {config.lastPingAt && (
            <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-green-50 border border-green-100 rounded-lg">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />
              <div className="text-[11px] text-green-700">
                <span>Última señal: {new Date(config.lastPingAt).toLocaleString()}</span>
                {config.lastPingOrigin && <span className="text-green-600 ml-1">({config.lastPingOrigin})</span>}
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <input
                type="url"
                value={verifyUrl}
                onChange={(e) => setVerifyUrl(e.target.value)}
                placeholder="https://tusitio.com"
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
              />
            </div>
            <button
              onClick={async () => {
                if (!verifyUrl) return;
                setVerifying(true);
                setVerifyResult(null);
                try {
                  const { data } = await api.post(`/t/${slug}/verify`, { url: verifyUrl });
                  setVerifyResult(data);
                } catch {
                  setVerifyResult({ installed: false, error: "Error al verificar" });
                } finally {
                  setVerifying(false);
                }
              }}
              disabled={verifying || !verifyUrl}
              className="px-3 py-2 text-sm font-medium text-white bg-brand-600 hover:bg-brand-700 rounded-lg transition-colors disabled:opacity-50 shrink-0"
            >
              {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verificar"}
            </button>
          </div>

          {verifyResult && (
            <div className={`mt-3 flex items-start gap-2 px-3 py-2.5 rounded-lg border ${verifyResult.installed ? "bg-green-50 border-green-100" : "bg-red-50 border-red-100"}`}>
              {verifyResult.installed ? (
                <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
              ) : (
                <XCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
              )}
              <div>
                <p className={`text-sm font-medium ${verifyResult.installed ? "text-green-800" : "text-red-800"}`}>
                  {verifyResult.installed ? "Pixel detectado correctamente" : "Pixel no detectado"}
                </p>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  {verifyResult.installed
                    ? "El script está presente en el HTML de tu sitio."
                    : verifyResult.error || "Asegúrate de haber insertado el script antes de </body>."}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
