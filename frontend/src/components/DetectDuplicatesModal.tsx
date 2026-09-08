import { useState } from "react";
import { Loader2, X, Users, CheckCircle2, Crown, Link2, StickyNote } from "lucide-react";
import {
  detectDuplicates,
  mergeRecords,
  type DuplicateGroup,
} from "@/services/api";
import { ConfirmModal } from "@/components/ConfirmModal";

/**
 * Herramienta de detección de duplicados y merge de contactos.
 * Flujo en 3 pasos:
 *  1. Criterios de detección.
 *  2. Revisión de grupos: por cada grupo se elige el contacto ganador y se puede
 *     incluir/excluir el grupo del merge.
 *  3. Confirmación (ConfirmModal) antes de fusionar.
 */

const CRITERIA = [
  { key: "email", label: "Email" },
  { key: "phone", label: "Teléfono" },
  { key: "document", label: "Documento" },
  { key: "whatsappId", label: "WhatsApp ID" },
];

const CRITERION_LABEL: Record<string, string> = {
  email: "Email",
  phone: "Teléfono",
  document: "Documento",
  whatsappId: "WhatsApp ID",
};

function memberName(m: DuplicateGroup["members"][number]): string {
  return (
    m.fullName ||
    [m.firstName, m.lastName].filter(Boolean).join(" ") ||
    m.email ||
    m.phone ||
    "Sin nombre"
  );
}

export function DetectDuplicatesModal({
  tenantId,
  onClose,
  onMerged,
}: {
  tenantId: string;
  onClose: () => void;
  onMerged: () => void;
}) {
  const [selectedCriteria, setSelectedCriteria] = useState<Set<string>>(
    new Set(["email", "phone", "document", "whatsappId"]),
  );
  const [groups, setGroups] = useState<DuplicateGroup[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Estado por grupo: ganador elegido y si está incluido en el merge.
  const [winners, setWinners] = useState<Record<string, string>>({});
  const [included, setIncluded] = useState<Record<string, boolean>>({});

  const [showConfirm, setShowConfirm] = useState(false);
  const [merging, setMerging] = useState(false);
  const [mergedCount, setMergedCount] = useState<number | null>(null);

  const toggleCriterion = (key: string) => {
    setGroups(null);
    setMergedCount(null);
    setSelectedCriteria((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const runDetect = async () => {
    if (selectedCriteria.size === 0) {
      setError("Selecciona al menos un criterio de detección.");
      return;
    }
    setLoading(true);
    setError("");
    setMergedCount(null);
    try {
      const res = await detectDuplicates({ tenantId, criteria: [...selectedCriteria] });
      setGroups(res.groups);
      // Inicializar ganador sugerido e incluir todos por defecto.
      const w: Record<string, string> = {};
      const inc: Record<string, boolean> = {};
      for (const g of res.groups) {
        w[g.key] = g.suggestedWinnerId;
        inc[g.key] = true;
      }
      setWinners(w);
      setIncluded(inc);
    } catch (err: any) {
      setError(err.response?.data?.message || "No se pudo detectar duplicados");
    } finally {
      setLoading(false);
    }
  };

  const includedGroups = (groups || []).filter((g) => included[g.key]);
  const totalToMerge = includedGroups.reduce((acc, g) => acc + (g.members.length - 1), 0);

  const handleMerge = async () => {
    setMerging(true);
    setError("");
    let done = 0;
    try {
      for (const g of includedGroups) {
        const winnerId = winners[g.key];
        const loserIds = g.members.map((m) => m.id).filter((id) => id !== winnerId);
        if (loserIds.length === 0) continue;
        await mergeRecords({ tenantId, winnerId, loserIds });
        done += loserIds.length;
      }
      setMergedCount(done);
      setShowConfirm(false);
      setGroups(null);
      onMerged();
    } catch (err: any) {
      setError(err.response?.data?.message || "No se pudo completar la fusión");
      setShowConfirm(false);
    } finally {
      setMerging(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="w-full max-w-3xl rounded-2xl shadow-2xl border border-white/30 flex flex-col max-h-[85vh] overflow-hidden bg-card"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center">
              <Users className="h-4.5 w-4.5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">Detectar duplicados</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Encuentra y fusiona contactos repetidos</p>
            </div>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-muted-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-5">
          {/* Criterios */}
          <div>
            <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Detectar por</label>
            <div className="flex flex-wrap gap-2">
              {CRITERIA.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => toggleCriterion(c.key)}
                  className={`px-3 py-1.5 rounded-lg border text-sm transition-all ${
                    selectedCriteria.has(c.key)
                      ? "border-brand-400 bg-brand-50 text-brand-700 ring-1 ring-brand-200"
                      : "border-border text-muted-foreground hover:border-border"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {!groups && (
            <button
              onClick={runDetect}
              disabled={loading || selectedCriteria.size === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-700 hover:bg-brand-600 text-white text-sm font-medium transition-colors disabled:opacity-50"
            >
              {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {loading ? "Buscando..." : "Buscar duplicados"}
            </button>
          )}

          {error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

          {mergedCount !== null && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <div className="flex items-center gap-2 text-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
                <span className="text-sm font-medium">Fusión completada</span>
              </div>
              <p className="text-xs text-emerald-700 mt-1">{mergedCount} contacto(s) duplicado(s) fusionado(s).</p>
            </div>
          )}

          {/* Grupos */}
          {groups && mergedCount === null && (
            <div className="space-y-4">
              {groups.length === 0 ? (
                <p className="text-sm text-muted-foreground">No se encontraron contactos duplicados con estos criterios.</p>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    {groups.length} grupo(s) encontrados. Elige el contacto que se conservará (ganador) en cada grupo; el resto se fusionará en él.
                  </p>
                  {groups.map((g) => (
                    <div key={g.key} className={`rounded-xl border transition-all ${included[g.key] ? "border-border" : "border-border opacity-60"}`}>
                      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-50 bg-muted/50 rounded-t-xl">
                        <span className="text-xs text-muted-foreground">
                          Coinciden por <span className="font-medium text-foreground">{CRITERION_LABEL[g.criterion] || g.criterion}</span>:{" "}
                          <span className="font-mono text-muted-foreground">{g.value}</span>
                        </span>
                        <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                          <input
                            type="checkbox"
                            checked={included[g.key] ?? true}
                            onChange={(e) => setIncluded((prev) => ({ ...prev, [g.key]: e.target.checked }))}
                            className="h-3.5 w-3.5 rounded border-border text-brand-600 focus:ring-brand-500"
                          />
                          Incluir
                        </label>
                      </div>
                      <div className="divide-y divide-gray-50">
                        {g.members.map((m) => {
                          const isWinner = winners[g.key] === m.id;
                          return (
                            <label
                              key={m.id}
                              className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${isWinner ? "bg-brand-50/40" : "hover:bg-muted/60"}`}
                            >
                              <input
                                type="radio"
                                name={`winner-${g.key}`}
                                checked={isWinner}
                                onChange={() => setWinners((prev) => ({ ...prev, [g.key]: m.id }))}
                                disabled={!included[g.key]}
                                className="h-4 w-4 text-brand-600 focus:ring-brand-500"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-sm font-medium text-foreground truncate">{memberName(m)}</span>
                                  {isWinner && <Crown className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
                                </div>
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground mt-0.5">
                                  {m.phone && <span className="font-mono">{m.phone}</span>}
                                  {m.email && <span>{m.email}</span>}
                                  {m.documentNumber && <span>Doc: {m.documentNumber}</span>}
                                </div>
                              </div>
                              <div className="flex items-center gap-3 text-[11px] text-muted-foreground shrink-0">
                                <span className="flex items-center gap-1" title="Datos relacionados (chats, notas, actividades)">
                                  <Link2 className="h-3 w-3" />
                                  {m.relatedCount}
                                </span>
                                <span className="flex items-center gap-1" title="Campos completos">
                                  <StickyNote className="h-3 w-3" />
                                  {m.filledFields}
                                </span>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors">
            {mergedCount !== null ? "Cerrar" : "Cancelar"}
          </button>
          {groups && groups.length > 0 && mergedCount === null && (
            <>
              <button
                onClick={runDetect}
                disabled={loading}
                className="px-4 py-2 text-sm text-muted-foreground border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
              >
                Volver a buscar
              </button>
              <button
                onClick={() => setShowConfirm(true)}
                disabled={totalToMerge === 0}
                className="px-5 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors disabled:opacity-50 shadow-sm"
              >
                Fusionar {totalToMerge} contacto{totalToMerge === 1 ? "" : "s"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Confirmación final */}
      <ConfirmModal
        open={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={handleMerge}
        title="Fusionar contactos duplicados"
        description={`Se fusionarán ${totalToMerge} contacto(s) en ${includedGroups.length} grupo(s). Los contactos perdedores se archivarán (podrás recuperarlos en Eliminados) y su historial se moverá al ganador. Esta acción modifica los datos.`}
        confirmLabel="Fusionar"
        variant="warning"
        loading={merging}
      />
    </div>
  );
}
