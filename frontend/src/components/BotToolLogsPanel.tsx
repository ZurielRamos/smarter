import { useState, useEffect } from "react";
import { ScrollText, CheckCircle, XCircle, Clock, FlaskConical } from "lucide-react";
import axios from "axios";

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || "/api" });
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

interface ToolLog {
  id: string;
  toolName: string;
  args: Record<string, any> | null;
  response: string | null;
  success: boolean;
  durationMs: number;
  isTest: boolean;
  createdAt: string;
}

export function BotToolLogsPanel({ botId }: { botId: string }) {
  const [logs, setLogs] = useState<ToolLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => { load(); }, [botId]);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/bots/${botId}/tool-logs?limit=30`);
      setLogs(data);
    } catch {} finally { setLoading(false); }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center gap-2 mb-4">
        <ScrollText className="h-4 w-4 text-brand-600" />
        <h3 className="text-sm font-semibold text-gray-900">Logs de herramientas</h3>
        <span className="text-[10px] text-gray-400">Últimas {logs.length} ejecuciones</span>
      </div>

      {loading ? (
        <div className="flex justify-center py-6"><Clock className="h-4 w-4 animate-spin text-gray-400" /></div>
      ) : logs.length === 0 ? (
        <div className="text-center py-6 border border-dashed border-gray-200 rounded-lg">
          <ScrollText className="h-6 w-6 text-gray-300 mx-auto mb-2" />
          <p className="text-xs text-gray-400">No hay ejecuciones registradas</p>
        </div>
      ) : (
        <div className="space-y-1.5 max-h-96 overflow-y-auto">
          {logs.map((log) => (
            <div key={log.id} className="border border-gray-100 rounded-lg overflow-hidden">
              <button
                onClick={() => setExpanded(expanded === log.id ? null : log.id)}
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-50 transition-colors"
              >
                {log.success
                  ? <CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0" />
                  : <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                }
                <span className="text-xs font-medium text-gray-900 font-mono">{log.toolName}</span>
                {log.isTest && <FlaskConical className="h-3 w-3 text-amber-500 shrink-0" />}
                <span className="text-[10px] text-gray-400 ml-auto shrink-0">{log.durationMs}ms · {new Date(log.createdAt).toLocaleString("es-CO", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" })}</span>
              </button>
              {expanded === log.id && (
                <div className="px-3 pb-3 space-y-2">
                  {log.args && Object.keys(log.args).length > 0 && (
                    <div>
                      <p className="text-[9px] text-gray-400 uppercase font-medium mb-0.5">Argumentos</p>
                      <pre className="text-[10px] bg-gray-50 rounded p-2 overflow-x-auto text-gray-700 font-mono">{JSON.stringify(log.args, null, 2)}</pre>
                    </div>
                  )}
                  {log.response && (
                    <div>
                      <p className="text-[9px] text-gray-400 uppercase font-medium mb-0.5">Respuesta</p>
                      <pre className="text-[10px] bg-gray-50 rounded p-2 overflow-x-auto text-gray-700 font-mono max-h-40 overflow-y-auto">{(() => { try { return JSON.stringify(JSON.parse(log.response), null, 2); } catch { return log.response; } })()}</pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
