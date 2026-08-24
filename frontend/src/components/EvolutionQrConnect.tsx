import { useEffect, useState, useCallback } from "react";
import { Loader2, RefreshCw, CheckCircle2, WifiOff, Smartphone } from "lucide-react";
import axios from "axios";

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || "/api" });
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

interface EvolutionQrConnectProps {
  inboxId: string;
  onConnected: () => void;
  onError?: (error: string) => void;
}

type ConnectionState = "creating" | "waiting_qr" | "scanning" | "connected" | "error";

export function EvolutionQrConnect({ inboxId, onConnected, onError }: EvolutionQrConnectProps) {
  const [state, setState] = useState<ConnectionState>("creating");
  const [qrBase64, setQrBase64] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phoneNumber, setPhoneNumber] = useState<string | null>(null);

  const createInstance = useCallback(async () => {
    setState("creating");
    setError(null);
    try {
      await api.post("/evolution/instances", { inboxId });
      setState("waiting_qr");
    } catch (err: any) {
      const msg = err.response?.data?.message || "Error al crear la instancia";
      setError(msg);
      setState("error");
      onError?.(msg);
    }
  }, [inboxId, onError]);

  const fetchQr = useCallback(async () => {
    try {
      const { data } = await api.get(`/evolution/instances/${inboxId}/qr`);
      if (data.connected) {
        setState("connected");
        onConnected();
        return;
      }
      if (data.base64) {
        setQrBase64(data.base64);
        setState("waiting_qr");
      }
      if (data.pairingCode) {
        setPairingCode(data.pairingCode);
      }
    } catch (err: any) {
      // Si da error puede ser que la instancia aún no está lista
      console.warn("[EvolutionQR] Error fetching QR:", err.message);
    }
  }, [inboxId, onConnected]);

  const checkStatus = useCallback(async () => {
    try {
      const { data } = await api.get(`/evolution/instances/${inboxId}/status`);
      if (data.status === "open") {
        setState("connected");
        setPhoneNumber(data.phoneNumber || null);
        onConnected();
        return true;
      }
      if (data.status === "connecting") {
        setState("scanning");
      }
      return false;
    } catch {
      return false;
    }
  }, [inboxId, onConnected]);

  // Iniciar la instancia al montar
  useEffect(() => {
    createInstance();
  }, [createInstance]);

  // Polling: obtener QR y verificar estado
  useEffect(() => {
    if (state === "connected" || state === "error") return;

    let interval: NodeJS.Timeout;

    const startPolling = () => {
      // Primer fetch del QR después de un pequeño delay para que la instancia se cree
      const initialDelay = state === "creating" ? 2000 : 500;
      const timeoutId = setTimeout(() => {
        fetchQr();
        interval = setInterval(async () => {
          const connected = await checkStatus();
          if (!connected && state !== "connected") {
            fetchQr();
          }
        }, 3000);
      }, initialDelay);

      return () => {
        clearTimeout(timeoutId);
        if (interval) clearInterval(interval);
      };
    };

    const cleanup = startPolling();
    return cleanup;
  }, [state, fetchQr, checkStatus]);

  const handleRetry = () => {
    setQrBase64(null);
    setPairingCode(null);
    setError(null);
    createInstance();
  };

  if (state === "connected") {
    return (
      <div className="flex flex-col items-center gap-4 py-6">
        <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
          <CheckCircle2 className="h-8 w-8 text-green-600" />
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-gray-900">WhatsApp conectado</p>
          {phoneNumber && (
            <p className="text-xs text-gray-500 mt-1">Número: +{phoneNumber}</p>
          )}
        </div>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="flex flex-col items-center gap-4 py-6">
        <div className="h-16 w-16 rounded-full bg-red-100 flex items-center justify-center">
          <WifiOff className="h-8 w-8 text-red-500" />
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-gray-900">Error de conexión</p>
          <p className="text-xs text-gray-500 mt-1">{error}</p>
        </div>
        <button
          onClick={handleRetry}
          className="flex items-center gap-2 px-4 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50 font-medium text-gray-700"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Reintentar
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-5 py-4">
      {/* Instrucciones */}
      <div className="text-center">
        <p className="text-sm font-semibold text-gray-900">Conectar WhatsApp</p>
        <p className="text-xs text-gray-500 mt-1 max-w-xs">
          Escanea el código QR con tu WhatsApp para vincular este número a la bandeja.
        </p>
      </div>

      {/* QR Code */}
      <div className="relative">
        {qrBase64 ? (
          <div className="p-3 bg-white border-2 border-gray-200 rounded-2xl shadow-sm">
            <img
              src={qrBase64.startsWith("data:") ? qrBase64 : `data:image/png;base64,${qrBase64}`}
              alt="QR Code WhatsApp"
              className="w-56 h-56"
            />
          </div>
        ) : (
          <div className="w-56 h-56 border-2 border-dashed border-gray-300 rounded-2xl flex flex-col items-center justify-center gap-2 bg-gray-50">
            <Loader2 className="h-6 w-6 text-gray-400 animate-spin" />
            <p className="text-xs text-gray-400">Generando código QR...</p>
          </div>
        )}

        {state === "scanning" && (
          <div className="absolute inset-0 bg-white/80 rounded-2xl flex flex-col items-center justify-center gap-2">
            <Loader2 className="h-6 w-6 text-brand-600 animate-spin" />
            <p className="text-xs text-brand-700 font-medium">Conectando...</p>
          </div>
        )}
      </div>

      {/* Pairing code alternativo */}
      {pairingCode && (
        <div className="text-center">
          <p className="text-[11px] text-gray-400">O usa el código de vinculación:</p>
          <p className="text-lg font-mono font-bold text-gray-800 tracking-widest mt-1">{pairingCode}</p>
        </div>
      )}

      {/* Pasos */}
      <div className="bg-gray-50 rounded-xl p-4 w-full max-w-xs">
        <p className="text-[11px] font-semibold text-gray-700 mb-2">Instrucciones:</p>
        <ol className="text-[11px] text-gray-500 space-y-1.5 list-decimal list-inside">
          <li>Abre WhatsApp en tu teléfono</li>
          <li>Ve a <span className="font-medium">Dispositivos vinculados</span></li>
          <li>Toca <span className="font-medium">Vincular un dispositivo</span></li>
          <li>Escanea este código QR</li>
        </ol>
      </div>

      {/* Refresh */}
      <button
        onClick={handleRetry}
        className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700"
      >
        <RefreshCw className="h-3 w-3" />
        Generar nuevo código
      </button>
    </div>
  );
}
