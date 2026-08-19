import { useState, useEffect } from "react";
import { BookOpen, Plus, Trash2, X, Loader2, FileText, ToggleLeft, ToggleRight } from "lucide-react";
import axios from "axios";

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || "/api" });
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

interface KnowledgeEntry {
  id: string;
  title: string;
  content: string;
  type: string;
  tokenCount: number;
  isEnabled: boolean;
  createdAt: string;
}

export function BotKnowledgePanel({ botId }: { botId: string }) {
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, [botId]);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/bots/${botId}/knowledge`);
      setEntries(data);
    } catch {} finally { setLoading(false); }
  };

  const handleAdd = async () => {
    if (!title.trim() || !content.trim()) return;
    setSaving(true);
    try {
      const { data } = await api.post(`/bots/${botId}/knowledge`, { title: title.trim(), content: content.trim() });
      setEntries((prev) => [...prev, data]);
      setTitle(""); setContent(""); setShowAdd(false);
    } catch {} finally { setSaving(false); }
  };

  const handleToggle = async (entry: KnowledgeEntry) => {
    try {
      const { data } = await api.put(`/bots/knowledge/${entry.id}`, { isEnabled: !entry.isEnabled });
      setEntries((prev) => prev.map((e) => e.id === entry.id ? data : e));
    } catch {}
  };

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/bots/knowledge/${id}`);
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } catch {}
  };

  const totalTokens = entries.filter((e) => e.isEnabled).reduce((sum, e) => sum + e.tokenCount, 0);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-brand-600" />
          <h3 className="text-sm font-semibold text-gray-900">Base de conocimiento</h3>
          <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">~{totalTokens.toLocaleString()} tokens</span>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-dashed border-gray-300 text-xs text-gray-500 hover:border-gray-400 hover:text-gray-600 transition-colors cursor-pointer">
            <Plus className="h-3 w-3" /> Subir archivo
            <input type="file" accept=".txt,.csv,.pdf,.md,.json" className="hidden" onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const formData = new FormData();
              formData.append('file', file);
              try {
                const { data } = await api.post(`/bots/${botId}/knowledge/upload`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
                setEntries((prev) => [...prev, data]);
              } catch {}
              e.target.value = '';
            }} />
          </label>
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-dashed border-gray-300 text-xs text-gray-500 hover:border-gray-400 hover:text-gray-600 transition-colors">
            <Plus className="h-3 w-3" /> Texto
          </button>
        </div>
      </div>
      <p className="text-xs text-gray-500 mb-4">Información que el bot usa para responder preguntas (productos, FAQs, políticas, etc.).</p>

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-gray-400" /></div>
      ) : entries.length === 0 ? (
        <div className="text-center py-6 border border-dashed border-gray-200 rounded-lg">
          <FileText className="h-6 w-6 text-gray-300 mx-auto mb-2" />
          <p className="text-xs text-gray-400">No hay documentos de conocimiento</p>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <div key={entry.id} className={`flex items-center justify-between p-3 border rounded-lg group ${entry.isEnabled ? "border-gray-200" : "border-gray-100 opacity-60"}`}>
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <button onClick={() => handleToggle(entry)} className="shrink-0">
                  {entry.isEnabled
                    ? <ToggleRight className="h-5 w-5 text-brand-600" />
                    : <ToggleLeft className="h-5 w-5 text-gray-400" />
                  }
                </button>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{entry.title}</p>
                  <p className="text-[10px] text-gray-400">~{entry.tokenCount.toLocaleString()} tokens · {entry.content.length.toLocaleString()} chars</p>
                </div>
              </div>
              <button onClick={() => handleDelete(entry.id)} className="p-1.5 rounded-md opacity-0 group-hover:opacity-100 hover:bg-red-50 text-gray-400 hover:text-red-500 transition-all">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Add modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowAdd(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900">Agregar conocimiento</h3>
              <button onClick={() => setShowAdd(false)} className="p-1 rounded-md hover:bg-gray-100 text-gray-400"><X className="h-4 w-4" /></button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Título</label>
                <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej: Catálogo de productos, Política de devoluciones..." className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Contenido</label>
                <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="Pega aquí la información que el bot debe conocer..." rows={10} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200 resize-y font-mono" />
                <p className="text-[10px] text-gray-400 mt-1 text-right">{content.length} chars · ~{Math.ceil(content.length / 4)} tokens</p>
              </div>
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
              <button onClick={() => setShowAdd(false)} className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-medium text-gray-600 hover:bg-gray-50">Cancelar</button>
              <button onClick={handleAdd} disabled={saving || !title.trim() || !content.trim()} className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-brand-700 hover:bg-brand-600 text-white text-xs font-medium disabled:opacity-50">
                {saving && <Loader2 className="h-3 w-3 animate-spin" />} Agregar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
