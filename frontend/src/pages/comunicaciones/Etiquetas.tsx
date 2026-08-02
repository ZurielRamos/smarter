import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Settings2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import axios from "axios";

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || "/api" });
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

interface Label {
  id: string;
  slug: string;
  label: string;
  description: string | null;
  color: string;
  showInSidebar: boolean;
}

export function Etiquetas() {
  const { slug } = useParams();
  const { user } = useAuth();
  const tenantRole = user?.tenantRoles.find((tr) => tr.tenant.slug === slug);
  const tenantId = tenantRole?.tenantId || "";

  const [labels, setLabels] = useState<Label[]>([]);
  const [showNewLabel, setShowNewLabel] = useState(false);
  const [editingLabel, setEditingLabel] = useState<{ id: string; label: string; slug: string; description: string; color: string; showInSidebar: boolean } | null>(null);
  const [newLabel, setNewLabel] = useState({ label: "", slug: "", description: "", color: "#6b7280", showInSidebar: false });

  const loadLabels = () => {
    if (!tenantId) return;
    api.get("/chats/labels", { params: { tenantId } }).then(({ data }) => setLabels(data)).catch(() => {});
  };

  useEffect(() => {
    loadLabels();
  }, [tenantId]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Etiquetas</h3>
          <p className="text-[11px] text-gray-400 mt-0.5">{labels.length} etiquetas</p>
        </div>
        <button onClick={() => setShowNewLabel(true)} className="text-xs text-brand-600 font-medium hover:text-brand-700">+ Nueva</button>
      </div>

      {showNewLabel && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowNewLabel(false)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-1">Nueva etiqueta</h3>
            <p className="text-xs text-gray-400 mb-5">Crea una etiqueta para clasificar conversaciones</p>
            <div className="space-y-4">
              <div className="relative">
                <input
                  type="text"
                  value={newLabel.label}
                  onChange={(e) => setNewLabel({ ...newLabel, label: e.target.value, slug: e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") })}
                  placeholder=" "
                  className="peer w-full px-4 pt-5 pb-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all"
                />
                <label className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-gray-400 transition-all duration-200 pointer-events-none peer-focus:top-2 peer-focus:translate-y-0 peer-focus:text-[11px] peer-focus:text-brand-600 peer-[:not(:placeholder-shown)]:top-2 peer-[:not(:placeholder-shown)]:translate-y-0 peer-[:not(:placeholder-shown)]:text-[11px]">
                  Nombre
                </label>
              </div>
              <div className="relative">
                <input
                  type="text"
                  value={newLabel.slug}
                  onChange={(e) => setNewLabel({ ...newLabel, slug: e.target.value })}
                  placeholder=" "
                  className="peer w-full px-4 pt-5 pb-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all"
                />
                <label className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-gray-400 transition-all duration-200 pointer-events-none peer-focus:top-2 peer-focus:translate-y-0 peer-focus:text-[11px] peer-focus:text-brand-600 peer-[:not(:placeholder-shown)]:top-2 peer-[:not(:placeholder-shown)]:translate-y-0 peer-[:not(:placeholder-shown)]:text-[11px]">
                  Código (slug)
                </label>
              </div>
              <div className="relative">
                <input
                  type="text"
                  value={newLabel.description}
                  onChange={(e) => setNewLabel({ ...newLabel, description: e.target.value })}
                  placeholder=" "
                  className="peer w-full px-4 pt-5 pb-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all"
                />
                <label className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-gray-400 transition-all duration-200 pointer-events-none peer-focus:top-2 peer-focus:translate-y-0 peer-focus:text-[11px] peer-focus:text-brand-600 peer-[:not(:placeholder-shown)]:top-2 peer-[:not(:placeholder-shown)]:translate-y-0 peer-[:not(:placeholder-shown)]:text-[11px]">
                  Descripción (opcional)
                </label>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-gray-500 mb-2">Color</label>
                <div className="flex flex-wrap gap-2">
                  {["#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899", "#6b7280", "#1f2937"].map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewLabel({ ...newLabel, color: c })}
                      className={`h-8 w-8 rounded-full transition-all ${newLabel.color === c ? "ring-2 ring-offset-2 ring-brand-400 scale-110" : "hover:scale-110 hover:ring-1 hover:ring-gray-300"}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-2.5 text-sm text-gray-600 cursor-pointer select-none">
                <input type="checkbox" checked={newLabel.showInSidebar} onChange={(e) => setNewLabel({ ...newLabel, showInSidebar: e.target.checked })} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500 h-4 w-4" />
                Mostrar en sidebar
              </label>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setShowNewLabel(false)} className="px-4 py-2.5 text-sm text-gray-600 rounded-lg hover:bg-gray-100 font-medium transition-colors">Cancelar</button>
              <button
                onClick={async () => {
                  if (!newLabel.label.trim() || !newLabel.slug.trim()) return;
                  await api.post("/chats/labels", { tenantId, ...newLabel });
                  loadLabels();
                  setShowNewLabel(false);
                  setNewLabel({ label: "", slug: "", description: "", color: "#6b7280", showInSidebar: false });
                }}
                className="px-4 py-2 text-sm rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-medium"
              >
                Crear etiqueta
              </button>
            </div>
          </div>
        </div>
      )}

      {editingLabel && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setEditingLabel(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm mx-4 p-6">
            <h3 className="text-base font-semibold text-gray-900 mb-1">Editar etiqueta</h3>
            <p className="text-xs text-gray-400 mb-5">Modifica las propiedades de la etiqueta</p>
            <div className="space-y-4">
              <div className="relative">
                <input
                  type="text"
                  value={editingLabel.label}
                  onChange={(e) => setEditingLabel({ ...editingLabel, label: e.target.value })}
                  placeholder=" "
                  className="peer w-full px-4 pt-5 pb-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all"
                />
                <label className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-gray-400 transition-all duration-200 pointer-events-none peer-focus:top-2 peer-focus:translate-y-0 peer-focus:text-[11px] peer-focus:text-brand-600 peer-[:not(:placeholder-shown)]:top-2 peer-[:not(:placeholder-shown)]:translate-y-0 peer-[:not(:placeholder-shown)]:text-[11px]">
                  Nombre
                </label>
              </div>
              <div className="relative">
                <input
                  type="text"
                  value={editingLabel.description}
                  onChange={(e) => setEditingLabel({ ...editingLabel, description: e.target.value })}
                  placeholder=" "
                  className="peer w-full px-4 pt-5 pb-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all"
                />
                <label className="absolute left-4 top-1/2 -translate-y-1/2 text-sm text-gray-400 transition-all duration-200 pointer-events-none peer-focus:top-2 peer-focus:translate-y-0 peer-focus:text-[11px] peer-focus:text-brand-600 peer-[:not(:placeholder-shown)]:top-2 peer-[:not(:placeholder-shown)]:translate-y-0 peer-[:not(:placeholder-shown)]:text-[11px]">
                  Descripción
                </label>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-gray-500 mb-2">Color</label>
                <div className="flex flex-wrap gap-2">
                  {["#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899", "#6b7280", "#1f2937"].map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setEditingLabel({ ...editingLabel, color: c })}
                      className={`h-8 w-8 rounded-full transition-all ${editingLabel.color === c ? "ring-2 ring-offset-2 ring-brand-400 scale-110" : "hover:scale-110 hover:ring-1 hover:ring-gray-300"}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-2.5 text-sm text-gray-600 cursor-pointer select-none">
                <input type="checkbox" checked={editingLabel.showInSidebar} onChange={(e) => setEditingLabel({ ...editingLabel, showInSidebar: e.target.checked })} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500 h-4 w-4" />
                Mostrar en sidebar
              </label>
            </div>
            <div className="flex items-center justify-between mt-6">
              <button
                onClick={async () => { await api.delete(`/chats/labels/${editingLabel.id}`); loadLabels(); setEditingLabel(null); }}
                className="px-3 py-2 text-sm text-red-600 rounded-lg hover:bg-red-50 font-medium transition-colors"
              >
                Eliminar
              </button>
              <div className="flex gap-2">
                <button onClick={() => setEditingLabel(null)} className="px-4 py-2.5 text-sm text-gray-600 rounded-lg hover:bg-gray-100 font-medium transition-colors">Cancelar</button>
                <button
                  onClick={async () => {
                    await api.put(`/chats/labels/${editingLabel.id}`, { label: editingLabel.label, description: editingLabel.description, color: editingLabel.color, showInSidebar: editingLabel.showInSidebar });
                    loadLabels();
                    setEditingLabel(null);
                  }}
                  className="px-4 py-2.5 text-sm rounded-lg bg-brand-600 hover:bg-brand-700 text-white font-medium transition-colors"
                >
                  Guardar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {labels.length === 0 && !showNewLabel ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <svg className="h-8 w-8 text-gray-300 mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" />
            </svg>
            <p className="text-sm text-gray-500">Sin etiquetas</p>
            <p className="text-[11px] text-gray-400 mt-1">Crea etiquetas para clasificar conversaciones</p>
          </div>
        ) : (
          labels.map((lbl) => (
            <div key={lbl.id} className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors group">
              <div className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: lbl.color }} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">{lbl.label}</p>
                <p className="text-[10px] text-gray-400 font-mono">{lbl.slug}</p>
              </div>
              {lbl.showInSidebar && <span className="text-[9px] px-1.5 py-0.5 rounded bg-brand-50 text-brand-600">sidebar</span>}
              <button
                onClick={() => setEditingLabel({ id: lbl.id, label: lbl.label, slug: lbl.slug, description: lbl.description || "", color: lbl.color, showInSidebar: lbl.showInSidebar })}
                className="p-1.5 rounded-lg text-gray-300 hover:text-gray-600 hover:bg-gray-100 opacity-0 group-hover:opacity-100 transition-all"
              >
                <Settings2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
