import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { apiErrorMessage, reclutamientoApi, type SurveyorContract } from "@/services/reclutamiento";
import { Field, ModalShell, inputClass, primaryButton, secondaryButton } from "./shared";

const METHODS: Record<string, string> = {
  wet: "Firma manuscrita",
  electronic_simple: "Firma electrónica simple",
  electronic_advanced: "Firma electrónica avanzada",
  digital_certificate: "Firma digital con certificado",
};

const today = () => new Date().toISOString().slice(0, 10);

/**
 * Registra que el contrato fue firmado. La plataforma no firma por las partes:
 * deja constancia de cómo y cuándo se firmó, ligada a la huella del texto.
 */
export function SignContractModal({
  tenantId,
  contract,
  onClose,
  onSaved,
}: {
  tenantId: string;
  contract: SurveyorContract;
  onClose: () => void;
  onSaved: () => void;
}) {
  const allowed = Object.keys(METHODS);
  const [method, setMethod] = useState(allowed[0] ?? "wet");
  const [signedAt, setSignedAt] = useState(today());
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [witnessName, setWitnessName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSaving(true);
    try {
      await reclutamientoApi.signContract(tenantId, contract.id, {
        method,
        signedAt,
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
        witnessName: witnessName.trim() || undefined,
      });
      onSaved();
    } catch (err) {
      setError(apiErrorMessage(err, "No se pudo registrar la firma"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell title="Registrar firma del contrato" onClose={onClose} busy={saving}>
      <form onSubmit={submit}>
        <div className="space-y-3 px-5 py-4">
          <p className="text-xs leading-relaxed text-muted-foreground">
            Registra que el contrato <strong>{contract.contractNumber}</strong> ya fue firmado por ambas partes. Una vez firmado, su texto no se puede modificar.
          </p>
          <Field label="Método de firma">
            <select value={method} onChange={(e) => setMethod(e.target.value)} className={inputClass}>
              {allowed.map((m) => <option key={m} value={m}>{METHODS[m] ?? m}</option>)}
            </select>
          </Field>
          <Field label="Fecha de firma"><input type="date" value={signedAt} max={today()} onChange={(e) => setSignedAt(e.target.value)} className={inputClass} /></Field>
          <Field label="Referencia (opcional)" hint="Ej.: número de acuse, ID de la firma electrónica o ubicación del documento firmado.">
            <input value={reference} onChange={(e) => setReference(e.target.value)} maxLength={200} className={inputClass} />
          </Field>
          <Field label="Nombre del testigo (opcional)"><input value={witnessName} onChange={(e) => setWitnessName(e.target.value)} maxLength={200} className={inputClass} /></Field>
          <Field label="Notas (opcional)"><textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={1000} className={inputClass} /></Field>
          {error && <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button type="button" onClick={onClose} disabled={saving} className={secondaryButton}>Cancelar</button>
          <button type="submit" disabled={saving} className={primaryButton}>
            {saving && <Loader2 className="h-3 w-3 animate-spin" />} Registrar firma
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
