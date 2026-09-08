import { useState } from "react";
import { Loader2, X, Phone, CheckCircle2, AlertTriangle, ArrowRight } from "lucide-react";
import {
  previewPhoneNormalization,
  applyPhoneNormalization,
  type PhoneNormalizationPreview,
} from "@/services/api";
import { ConfirmModal } from "@/components/ConfirmModal";

/**
 * Modal para normalizar los teléfonos de los contactos del tenant.
 * Flujo en 2 pasos:
 *  1. Configuración (país por defecto + limpiar formato) y previsualización (dry-run).
 *  2. Confirmación (ConfirmModal) antes de aplicar los cambios.
 */

const COUNTRIES = [
  { code: "CO", label: "Colombia", prefix: "+57" },
  { code: "MX", label: "México", prefix: "+52" },
  { code: "US", label: "Estados Unidos", prefix: "+1" },
  { code: "CUSTOM", label: "Personalizado", prefix: "+…" },
];

export function NormalizePhonesModal({
  tenantId,
  onClose,
  onApplied,
}: {
  tenantId: string;
  onClose: () => void;
  onApplied: () => void;
}) {
  const [country, setCountry] = useState("CO");
  const [cleanFormat, setCleanFormat] = useState(true);
  const [customCode, setCustomCode] = useState("");
  const [customDigits, setCustomDigits] = useState("10");
  const [preview, setPreview] = useState<PhoneNormalizationPreview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [error, setError] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<{ updated: number; skippedAmbiguous: number; skippedCollisions: number } | null>(null);

  const isCustom = country === "CUSTOM";
  const selectedCountry = COUNTRIES.find((c) => c.code === country) || COUNTRIES[0];

  // Prefijo mostrado: para custom, refleja lo que escribe el usuario.
  const parsedCode = customCode.replace(/[^\d]/g, "");
  const parsedDigits = customDigits
    .split(",")
    .map((d) => parseInt(d.trim(), 10))
    .filter((d) => Number.isInteger(d) && d >= 4 && d <= 15);
  const displayPrefix = isCustom ? (parsedCode ? `+${parsedCode}` : "+…") : selectedCountry.prefix;

  const customValid = !isCustom || (parsedCode.length > 0 && parsedDigits.length > 0);

  // Construye el payload de patrón personalizado cuando aplica.
  const buildCustom = () => (isCustom ? { code: parsedCode, digits: parsedDigits } : undefined);

  const runPreview = async () => {
    if (isCustom && !customValid) {
      setError("Ingresa un prefijo (solo dígitos) y al menos una longitud nacional entre 4 y 15.");
      return;
    }
    setLoadingPreview(true);
    setError("");
    setResult(null);
    try {
      const data = await previewPhoneNormalization({ tenantId, country, cleanFormat, custom: buildCustom() });
      setPreview(data);
    } catch (err: any) {
      setError(err.response?.data?.message || "No se pudo generar la previsualización");
    } finally {
      setLoadingPreview(false);
    }
  };

  // Cuando cambia una opción, invalidamos la previsualización previa.
  const handleCountryChange = (c: string) => { setCountry(c); setPreview(null); setResult(null); };
  const handleCleanFormatChange = (v: boolean) => { setCleanFormat(v); setPreview(null); setResult(null); };
  const handleCustomCodeChange = (v: string) => { setCustomCode(v); setPreview(null); setResult(null); };
  const handleCustomDigitsChange = (v: string) => { setCustomDigits(v); setPreview(null); setResult(null); };

  const handleApply = async () => {
    setApplying(true);
    try {
      const res = await applyPhoneNormalization({ tenantId, country, cleanFormat, custom: buildCustom() });
      setResult(res);
      setShowConfirm(false);
      setPreview(null);
      onApplied();
    } catch (err: any) {
      setError(err.response?.data?.message || "No se pudo aplicar la normalización");
      setShowConfirm(false);
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl rounded-2xl shadow-2xl border border-white/30 flex flex-col max-h-[85vh] overflow-hidden bg-card"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center">
              <Phone className="h-4.5 w-4.5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">Normalizar teléfonos</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Detecta y agrega el prefijo de país donde falte</p>
            </div>
          </div>
          <button onClick={onClose} className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-muted text-muted-foreground hover:text-muted-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-5">
          {/* Configuración */}
          <div>
            <label className="block text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">País por defecto</label>
            <p className="text-xs text-muted-foreground mb-2.5">Se usará para los números locales que no tienen prefijo internacional.</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {COUNTRIES.map((c) => (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => handleCountryChange(c.code)}
                  className={`px-3 py-2.5 rounded-lg border text-sm text-left transition-all ${
                    country === c.code
                      ? "border-brand-400 bg-brand-50 ring-1 ring-brand-200"
                      : "border-border hover:border-border"
                  }`}
                >
                  <span className="block font-medium text-foreground">{c.label}</span>
                  <span className="block text-xs text-muted-foreground font-mono">{c.prefix}</span>
                </button>
              ))}
            </div>

            {/* Configuración personalizada */}
            {isCustom && (
              <div className="mt-3 grid grid-cols-2 gap-3 rounded-lg border border-border bg-muted/60 p-3">
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Prefijo de país</label>
                  <div className="flex items-center rounded-lg border border-border bg-card overflow-hidden focus-within:ring-1 focus-within:ring-brand-200 focus-within:border-brand-300">
                    <span className="pl-3 pr-1 text-muted-foreground font-mono text-sm">+</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={customCode}
                      onChange={(e) => handleCustomCodeChange(e.target.value.replace(/[^\d]/g, ""))}
                      placeholder="54"
                      className="flex-1 py-2 pr-3 text-sm font-mono focus:outline-none bg-transparent"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Dígitos nacionales</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={customDigits}
                    onChange={(e) => handleCustomDigitsChange(e.target.value)}
                    placeholder="10"
                    className="w-full px-3 py-2 rounded-lg border border-border text-sm font-mono focus:outline-none focus:ring-1 focus:ring-brand-200 focus:border-brand-300"
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">Longitud sin prefijo. Puedes separar varias con coma (ej. 10,11).</p>
                </div>
              </div>
            )}
          </div>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={cleanFormat}
              onChange={(e) => handleCleanFormatChange(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-border text-brand-600 focus:ring-brand-500"
            />
            <span className="text-sm text-foreground">
              Limpiar formato
              <span className="block text-xs text-muted-foreground">Quita espacios, guiones, paréntesis y el signo "+" de los números que ya tienen prefijo.</span>
            </span>
          </label>

          {/* Botón previsualizar */}
          {!preview && (
            <button
              onClick={runPreview}
              disabled={loadingPreview || !customValid}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-brand-700 hover:bg-brand-600 text-white text-sm font-medium transition-colors disabled:opacity-50"
            >
              {loadingPreview && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {loadingPreview ? "Analizando..." : "Previsualizar cambios"}
            </button>
          )}

          {error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

          {/* Resultado aplicado */}
          {result && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
              <div className="flex items-center gap-2 text-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
                <span className="text-sm font-medium">Normalización aplicada</span>
              </div>
              <p className="text-xs text-emerald-700 mt-1">
                {result.updated} teléfonos actualizados
                {result.skippedAmbiguous > 0 && ` · ${result.skippedAmbiguous} ambiguos omitidos`}
                {result.skippedCollisions > 0 && ` · ${result.skippedCollisions} colisiones omitidas`}
              </p>
            </div>
          )}

          {/* Previsualización */}
          {preview && !result && (
            <div className="space-y-4">
              {/* Resumen */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <StatCard label="A modificar" value={preview.willChange} tone="brand" />
                <StatCard label="Ya correctos" value={preview.counts.ok} tone="gray" />
                <StatCard label="Ambiguos" value={preview.counts.ambiguous} tone="amber" />
                <StatCard label="Sin teléfono" value={preview.counts.empty} tone="gray" />
              </div>

              {preview.collisions > 0 && (
                <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <p className="text-xs text-amber-700">
                    {preview.collisions} número(s) quedarían duplicados con contactos existentes al agregar el prefijo. Se omitirán automáticamente.
                  </p>
                </div>
              )}

              {/* Ejemplos de cambios */}
              {preview.samples.needsPrefix.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    Ejemplos ({displayPrefix})
                  </p>
                  <div className="rounded-lg border border-border divide-y divide-gray-50 overflow-hidden">
                    {preview.samples.needsPrefix.map((s) => (
                      <div key={s.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                        <span className="font-mono text-muted-foreground line-through">{s.before}</span>
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="font-mono text-foreground">{s.after}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Ambiguos reportados */}
              {preview.samples.ambiguous.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                    Casos a revisar (no se modifican)
                  </p>
                  <div className="rounded-lg border border-border divide-y divide-gray-50 overflow-hidden">
                    {preview.samples.ambiguous.map((s) => (
                      <div key={s.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                        <span className="font-mono text-foreground">{s.value}</span>
                        <span className="text-xs text-muted-foreground">{s.reason}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {preview.willChange === 0 && (
                <p className="text-sm text-muted-foreground">No hay teléfonos que necesiten cambios con esta configuración.</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted transition-colors">
            {result ? "Cerrar" : "Cancelar"}
          </button>
          {preview && !result && (
            <>
              <button
                onClick={runPreview}
                disabled={loadingPreview}
                className="px-4 py-2 text-sm text-muted-foreground border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
              >
                Volver a analizar
              </button>
              <button
                onClick={() => setShowConfirm(true)}
                disabled={preview.willChange === 0}
                className="px-5 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors disabled:opacity-50 shadow-sm"
              >
                Aplicar a {preview.willChange} contacto{preview.willChange === 1 ? "" : "s"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Confirmación final */}
      <ConfirmModal
        open={showConfirm}
        onClose={() => setShowConfirm(false)}
        onConfirm={handleApply}
        title="Aplicar normalización de teléfonos"
        description={
          preview
            ? `Se actualizarán ${preview.willChange} teléfono(s) agregando el prefijo ${displayPrefix}. Esta acción modifica los datos de los contactos.`
            : ""
        }
        confirmLabel="Aplicar cambios"
        variant="warning"
        loading={applying}
      />
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: "brand" | "gray" | "amber" }) {
  const tones = {
    brand: "bg-brand-50 text-brand-700 border-brand-100",
    gray: "bg-muted text-foreground border-border",
    amber: "bg-amber-50 text-amber-700 border-amber-100",
  };
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${tones[tone]}`}>
      <div className="text-lg font-semibold">{value}</div>
      <div className="text-[11px] opacity-70">{label}</div>
    </div>
  );
}
