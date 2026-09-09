import { useState, useEffect, useCallback } from "react";
import { Loader2, Save, Copy, Check, RefreshCw, Zap, ZapOff, AlertTriangle, Info } from "lucide-react";
import { api } from "@/services/api";
import { ConfirmModal } from "@/components/ConfirmModal";

interface BridgeConfig {
  active: boolean;
  botId: string;
  syncStatus?: "idle" | "queued" | "running" | "completed" | "failed";
  syncProgress?: number;
  syncStats?: { contacts?: number; messages?: number; conversations?: number };
  syncError?: string;
  lastSyncAt?: string;
  activatedAt?: string;
}

interface BridgeStatus {
  bridge: BridgeConfig | null;
  webhookUrl: string;
  hasApiKey: boolean;
}

const SYNC_LABELS: Record<string, string> = {
  idle: "Sin sincronizar",
  queued: "En cola",
  running: "Sincronizando",
  completed: "Completada",
  failed: "Fallida",
};

export function SendPulseBridgeTab({ inboxId, tenantId }: { inboxId: string; tenantId: string }) {
  const [status, setStatus] = useState<BridgeStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showActivate, setShowActivate] = useState(false);
  const [showDeactivate, setShowDeactivate] = useState(false);

  const isActive = status?.bridge?.active === true;
  const syncStatus = status?.bridge?.syncStatus;
  const isSyncing = syncStatus === "running" || syncStatus === "queued";

  const loadStatus = useCallback(async () => {
    try {
      const { data } = await api.get<BridgeStatus>(`/sendpulse/bridge/${inboxId}`, {
        params: { tenantId },
      });
      setStatus(data);
    } catch {
      /* el interceptor de api ya muestra el toast */
    } finally {
      setLoading(false);
    }
  }, [inboxId, tenantId]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  // Poll mientras la sync inicial está en curso, para reflejar el progreso.
  useEffect(() => {
    if (!isSyncing) return;
    const interval = setInterval(loadStatus, 3000);
    return () => clearInterval(interval);
  }, [isSyncing, loadStatus]);

  const handleActivate = async () => {
    setSaving(true);
    try {
      const { data } = await api.post<{ bridge: BridgeConfig; webhookUrl: string }>(
        `/sendpulse/bridge/${inboxId}/activate`,
        { apiKey: apiKey.trim(), tenantId },
      );
      setStatus((prev) => ({
        bridge: data.bridge,
        webhookUrl: data.webhookUrl,
        hasApiKey: true,
        ...(prev || {}),
        // sobrescribir con lo nuevo
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any));
      setApiKey("");
      await loadStatus();
    } finally {
      setSaving(false);
      setShowActivate(false);
    }
  };

  const handleDeactivate = async () => {
    setSaving(true);
    try {
      await api.post(`/sendpulse/bridge/${inboxId}/deactivate`, { tenantId });
      await loadStatus();
    } finally {
      setSaving(false);
      setShowDeactivate(false);
    }
  };

  const copyWebhook = () => {
    if (!status?.webhookUrl) return;
    navigator.clipboard.writeText(status.webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-5">
      <div className="max-w-2xl space-y-5">
        {/* Header + estado */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              {isActive ? (
                <Zap className="h-4 w-4 text-green-600" />
              ) : (
                <ZapOff className="h-4 w-4 text-muted-foreground" />
              )}
              Modo Puente SendPulse
            </h3>
            <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
              Mientras esté activo, las conversaciones se sincronizan desde SendPulse y los
              mensajes entrantes y salientes pasan por SendPulse en tiempo real. Al
              desactivarlo, la bandeja vuelve a su canal normal.
            </p>
          </div>
          <span
            className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
              isActive
                ? "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {isActive ? "Activo" : "Inactivo"}
          </span>
        </div>

        {/* Config / activación */}
        {!isActive ? (
          <div className="space-y-3 p-4 rounded-xl border border-border bg-card">
            <label className="block text-xs font-medium text-foreground">API Key de SendPulse</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sp_apikey_..."
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm font-mono focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200"
            />
            <p className="text-[11px] text-muted-foreground">
              Genérala en SendPulse: Configuración de cuenta → API → API keys.
            </p>
            <button
              onClick={() => setShowActivate(true)}
              disabled={!apiKey.trim() || saving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand-700 hover:bg-brand-600 text-white text-xs font-medium transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
              Activar modo puente
            </button>
          </div>
        ) : (
          <>
            {/* Webhook URL */}
            <div className="space-y-2 p-4 rounded-xl border border-border bg-card">
              <label className="block text-xs font-medium text-foreground">
                URL del webhook (pégala en SendPulse)
              </label>
              <div className="flex items-center gap-2">
                <code className="flex-1 px-3 py-2 rounded-lg bg-muted text-[11px] text-foreground font-mono break-all">
                  {status?.webhookUrl}
                </code>
                <button
                  onClick={copyWebhook}
                  className="shrink-0 flex items-center gap-1 px-2.5 py-2 rounded-lg border border-border text-xs text-muted-foreground hover:bg-muted transition-colors"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copiada" : "Copiar"}
                </button>
              </div>
              <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>
                  En SendPulse ve a <strong>Bot Settings → Webhooks</strong>, pega esta URL y
                  selecciona el evento <strong>“Incoming messages”</strong>.
                </span>
              </div>
            </div>

            {/* Estado de sincronización */}
            <div className="space-y-2 p-4 rounded-xl border border-border bg-card">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-foreground">Sincronización del histórico</label>
                <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                  {isSyncing && <Loader2 className="h-3 w-3 animate-spin" />}
                  {SYNC_LABELS[syncStatus || "idle"]}
                </span>
              </div>
              {(isSyncing || syncStatus === "completed") && (
                <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-brand-600 transition-all"
                    style={{ width: `${status?.bridge?.syncProgress ?? 0}%` }}
                  />
                </div>
              )}
              {status?.bridge?.syncStats && (
                <p className="text-[11px] text-muted-foreground">
                  {status.bridge.syncStats.conversations ?? 0} conversaciones ·{" "}
                  {status.bridge.syncStats.messages ?? 0} mensajes
                </p>
              )}
              {syncStatus === "failed" && status?.bridge?.syncError && (
                <p className="text-[11px] text-red-600 flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                  {status.bridge.syncError}
                </p>
              )}
              <button
                onClick={loadStatus}
                className="flex items-center gap-1 text-[11px] text-brand-600 hover:text-brand-700 font-medium"
              >
                <RefreshCw className="h-3 w-3" />
                Actualizar estado
              </button>
            </div>

            {/* Desactivar */}
            <button
              onClick={() => setShowDeactivate(true)}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 text-xs font-medium transition-colors disabled:opacity-50"
            >
              <ZapOff className="h-3.5 w-3.5" />
              Desactivar modo puente
            </button>
          </>
        )}
      </div>

      <ConfirmModal
        open={showActivate}
        onClose={() => setShowActivate(false)}
        onConfirm={handleActivate}
        title="Activar modo puente"
        description="Se validará la API key, se sincronizará el histórico de SendPulse y los mensajes empezarán a enviarse y recibirse a través de SendPulse. Recuerda configurar el webhook en SendPulse después."
        confirmLabel="Activar"
        variant="default"
        loading={saving}
      />

      <ConfirmModal
        open={showDeactivate}
        onClose={() => setShowDeactivate(false)}
        onConfirm={handleDeactivate}
        title="Desactivar modo puente"
        description="Se dejará de enviar y recibir mensajes a través de SendPulse. Las conversaciones ya sincronizadas se conservan. El número seguirá en SendPulse hasta que migres el webhook en Meta."
        confirmLabel="Desactivar"
        variant="warning"
        loading={saving}
      />
    </div>
  );
}
