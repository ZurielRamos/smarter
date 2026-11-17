import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { AlertTriangle, Eye, EyeOff, Loader2 } from "lucide-react";
import {
  apiErrorMessage,
  reclutamientoApi,
  type ContractInput,
  type ContractTemplate,
  type ContractCatalog,
  type MissingItem,
  type PreviewResult,
  type SurveyorContract,
} from "@/services/reclutamiento";
import { TemplatePreview } from "./TemplatePreview";
import { Field, ModalShell, inputClass, primaryButton, secondaryButton } from "./shared";

interface Props {
  tenantId: string;
  profileId: string;
  /** Contrato en borrador que se edita (null = nuevo). */
  contract: SurveyorContract | null;
  /** Último contrato del encuestador, como punto de partida de uno nuevo. */
  template: SurveyorContract | null;
  onClose: () => void;
  onSaved: () => void;
}

const MANUAL = "__manual";
const today = () => new Date().toISOString().slice(0, 10);
const humanize = (key: string) => {
  const s = key.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/**
 * Crea o edita un contrato. Con plantilla, el texto se redacta en el servidor
 * con los datos del contacto; lo que falte (datos del contacto o «datos» del
 * texto) se pide aquí antes de emitirlo. Sin plantilla, es un contrato manual
 * (el documento se gestiona fuera de la plataforma).
 */
export function ContractFormModal({ tenantId, profileId, contract, template: lastContract, onClose, onSaved }: Props) {
  const [templates, setTemplates] = useState<ContractTemplate[]>([]);
  const [catalog, setCatalog] = useState<ContractCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [templateId, setTemplateId] = useState<string>(contract?.templateId ?? "");
  const [countryCode, setCountryCode] = useState(contract?.countryCode ?? lastContract?.countryCode ?? "");
  const [currency, setCurrency] = useState(contract?.currency ?? lastContract?.currency ?? "");
  const [rate, setRate] = useState(contract ? String(contract.defaultRate) : "");
  const [startDate, setStartDate] = useState(contract?.startDate.slice(0, 10) ?? "");
  const [endDate, setEndDate] = useState(contract?.endDate?.slice(0, 10) ?? "");
  const [issueDate, setIssueDate] = useState(contract?.issueDate?.slice(0, 10) ?? today());
  const [notes, setNotes] = useState(contract?.notes ?? "");
  const [datos, setDatos] = useState<Record<string, string>>({});
  const [contacto, setContacto] = useState<Record<string, string>>({});
  const [analysis, setAnalysis] = useState<PreviewResult | null>(null);
  const [showText, setShowText] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const editing = !!contract;
  const isManual = templateId === MANUAL || (!templateId && editing && !contract?.templateId);

  useEffect(() => {
    Promise.all([reclutamientoApi.listTemplates(tenantId), reclutamientoApi.contractCatalog(tenantId)])
      .then(([all, cat]) => {
        const usable = all.filter((t) => t.status === "published" || t.id === contract?.templateId);
        setTemplates(usable);
        setCatalog(cat);
        if (!contract) setTemplateId((prev) => prev || (usable[0]?.id ?? MANUAL));
      })
      .finally(() => setLoading(false));
  }, [tenantId, contract]);

  // Al editar un borrador se recuperan los valores guardados.
  useEffect(() => {
    const saved = contract?.variableValues as { datos?: Record<string, string>; contacto?: Record<string, string> } | null | undefined;
    if (!saved) return;
    setDatos(saved.datos ?? {});
    setContacto(saved.contacto ?? {});
  }, [contract]);

  const selected = templates.find((t) => t.id === templateId);

  // Al elegir plantilla se sugieren país y moneda del modelo del país.
  useEffect(() => {
    if (!selected || editing) return;
    setCountryCode(selected.countryCode);
    const preset = catalog?.presets.find((p) => p.code === selected.countryCode);
    if (preset) setCurrency((c) => c || preset.currency);
  }, [selected, catalog, editing]);

  const facts = () => ({ rate: Number(rate) || undefined, currency: currency || undefined, startDate: startDate || undefined, endDate: endDate || undefined });
  const cleanValues = () => ({
    datos: Object.fromEntries(Object.entries(datos).filter(([, v]) => v.trim() !== "")),
    contacto: Object.fromEntries(Object.entries(contacto).filter(([, v]) => v.trim() !== "")),
  });

  // Redacta con los datos reales del contacto para saber qué falta, poco después de dejar de escribir.
  const requestId = useRef(0);
  useEffect(() => {
    if (!selected) {
      setAnalysis(null);
      return;
    }
    const id = ++requestId.current;
    const timer = setTimeout(async () => {
      try {
        const res = await reclutamientoApi.previewTemplate(tenantId, { templateId: selected.id, profileId, values: cleanValues(), contract: facts() });
        if (id === requestId.current) setAnalysis(res);
      } catch {
        /* mensaje del interceptor */
      }
    }, 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, tenantId, profileId, datos, contacto, rate, currency, startDate, endDate]);

  const missingContacto = useMemo(() => (analysis?.missing ?? []).filter((m) => m.path.startsWith("contacto.")), [analysis]);
  const missingOther = useMemo(() => (analysis?.missing ?? []).filter((m) => m.source === "contract" || m.source === "template"), [analysis]);
  const datosNames = analysis?.datos ?? [];

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    const parsedRate = Number(rate);
    if (!/^[A-Za-z]{3}$/.test(currency.trim())) return setError("La moneda debe ser un código de 3 letras (p. ej. COP)");
    if (rate.trim() === "" || !Number.isFinite(parsedRate) || parsedRate < 0) return setError("La tarifa debe ser un número mayor o igual a 0");
    if (!startDate) return setError("La fecha de inicio es requerida");
    if (endDate && endDate < startDate) return setError("La fecha de fin no puede ser anterior a la de inicio");

    const input: ContractInput = {
      currency: currency.trim().toUpperCase(),
      defaultRate: parsedRate,
      startDate,
      endDate: endDate || null,
      notes: notes.trim() || null,
    };
    if (isManual) {
      if (!/^[A-Za-z]{2}$/.test(countryCode.trim())) return setError("El país debe ser un código de 2 letras (p. ej. CO)");
      input.countryCode = countryCode.trim().toUpperCase();
    } else {
      if (!selected && !editing) return setError("Elige una plantilla");
      input.templateId = selected?.id ?? contract?.templateId ?? undefined;
      input.issueDate = issueDate;
      input.values = cleanValues();
    }

    setSaving(true);
    try {
      if (contract) await reclutamientoApi.updateContract(tenantId, contract.id, input);
      else await reclutamientoApi.createContract(tenantId, profileId, input);
      onSaved();
    } catch (err) {
      const data = (err as { response?: { data?: { code?: string; missing?: MissingItem[]; message?: string } } })?.response?.data;
      setError(data?.message ?? apiErrorMessage(err, "No se pudo guardar el contrato"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell title={editing ? "Editar contrato" : "Nuevo contrato"} onClose={onClose} busy={saving} wide>
      <form onSubmit={submit}>
        <div className="space-y-3 px-5 py-4">
          {loading ? (
            <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Cargando" /></div>
          ) : (
            <>
              {!editing && (
                <Field label="Modelo de contrato" hint={templates.length === 0 ? "No hay plantillas publicadas. Crea y publica una en «Plantillas de contrato»." : undefined}>
                  <select value={templateId} onChange={(e) => { setTemplateId(e.target.value); setAnalysis(null); setDatos({}); setContacto({}); }} className={inputClass}>
                    {templates.map((t) => <option key={t.id} value={t.id}>{t.name} · v{t.version} · {t.countryCode}</option>)}
                    <option value={MANUAL}>Sin plantilla (el contrato se gestiona fuera de la plataforma)</option>
                  </select>
                </Field>
              )}
              {editing && contract?.templateName && (
                <p className="text-xs text-muted-foreground">Plantilla: <strong>{contract.templateName}</strong> v{contract.templateVersion} · {contract.contractNumber}. Al guardar se redacta de nuevo el texto.</p>
              )}

              <div className="grid gap-3 sm:grid-cols-3">
                {isManual && (
                  <Field label="País" hint="ISO de 2 letras">
                    <input value={countryCode} onChange={(e) => setCountryCode(e.target.value)} maxLength={2} className={`${inputClass} uppercase`} placeholder="CO" />
                  </Field>
                )}
                <Field label="Moneda" hint="ISO de 3 letras">
                  <input value={currency} onChange={(e) => setCurrency(e.target.value)} maxLength={3} className={`${inputClass} uppercase`} placeholder="COP" />
                </Field>
                <Field label="Tarifa por respuesta aprobada">
                  <input value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal" className={inputClass} placeholder="0.00" />
                </Field>
                <Field label="Inicio"><input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputClass} /></Field>
                <Field label="Fin (opcional)"><input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputClass} /></Field>
                {!isManual && <Field label="Fecha de emisión"><input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} className={inputClass} /></Field>}
              </div>

              {!isManual && datosNames.length > 0 && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {datosNames.map((name) => (
                    <Field key={name} label={humanize(name)}>
                      <input value={datos[name] ?? ""} onChange={(e) => setDatos((d) => ({ ...d, [name]: e.target.value }))} className={inputClass} />
                    </Field>
                  ))}
                </div>
              )}

              {!isManual && missingContacto.length > 0 && (
                <section className="rounded-lg bg-amber-50 p-3 dark:bg-amber-500/15">
                  <p className="mb-2 flex items-center gap-1 text-xs font-medium text-amber-900 dark:text-amber-100">
                    <AlertTriangle className="h-3.5 w-3.5" /> Faltan datos del contacto. Complétalos aquí (solo para este contrato) o actualiza su ficha.
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {missingContacto.map((m) => {
                      const key = m.path.replace("contacto.", "");
                      return (
                        <Field key={m.path} label={m.label.replace(/^Contacto: /, "")}>
                          <input value={contacto[key] ?? ""} onChange={(e) => setContacto((c) => ({ ...c, [key]: e.target.value }))} type={key === "fecha_nacimiento" ? "date" : "text"} className={inputClass} />
                        </Field>
                      );
                    })}
                  </div>
                </section>
              )}

              {!isManual && missingOther.length > 0 && (
                <div role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:bg-rose-500/15 dark:text-rose-200">
                  <p className="font-medium">El texto usa datos del contrato que no tienes:</p>
                  <ul className="list-disc pl-4">{missingOther.map((m) => <li key={m.path}>{m.label}</li>)}</ul>
                </div>
              )}

              {!isManual && analysis && analysis.blockers.length > 0 && (
                <div role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:bg-rose-500/15 dark:text-rose-200">
                  <ul className="list-disc pl-4">{analysis.blockers.map((b) => <li key={b}>{b}</li>)}</ul>
                </div>
              )}

              {isManual && (
                <Field label="Notas (opcional)">
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={2000} className={inputClass} />
                </Field>
              )}

              {!isManual && analysis && (
                <div>
                  <button type="button" onClick={() => setShowText((v) => !v)} className={secondaryButton}>
                    {showText ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />} {showText ? "Ocultar el texto" : "Revisar el texto antes de emitir"}
                  </button>
                  {showText && <div className="mt-3 max-h-80 overflow-y-auto"><TemplatePreview result={analysis} loading={false} /></div>}
                </div>
              )}

              {error && <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
            </>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <button type="button" onClick={onClose} disabled={saving} className={secondaryButton}>Cancelar</button>
          <button type="submit" disabled={saving || loading} className={primaryButton}>
            {saving && <Loader2 className="h-3 w-3 animate-spin" />} {editing ? "Guardar" : "Generar contrato"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
