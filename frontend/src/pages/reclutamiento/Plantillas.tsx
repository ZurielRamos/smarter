import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, FileText, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  apiErrorMessage,
  reclutamientoApi,
  type ContractCatalog,
  type ContractTemplate,
  type Language,
} from "@/services/reclutamiento";
import { Field, ModalShell, Spinner, TemplateStatusBadge, inputClass, primaryButton, secondaryButton } from "./shared";
import { formatDate } from "./format";
import { useTenantId } from "./useTenantId";

export function Plantillas() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const tenantId = useTenantId();
  const [templates, setTemplates] = useState<ContractTemplate[]>([]);
  const [catalog, setCatalog] = useState<ContractCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(() => {
    if (!tenantId) return;
    Promise.all([reclutamientoApi.listTemplates(tenantId), reclutamientoApi.contractCatalog(tenantId)])
      .then(([t, c]) => {
        setTemplates(t);
        setCatalog(c);
      })
      .catch(() => toast.error("No se pudieron cargar las plantillas"))
      .finally(() => setLoading(false));
  }, [tenantId]);

  useEffect(load, [load]);


  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">Plantillas de contrato</h2>
          <p className="text-xs text-muted-foreground">El texto de cada contrato. Las plantillas publicadas no se modifican: se versionan.</p>
        </div>
        <button type="button" onClick={() => setShowCreate(true)} disabled={!catalog} className={`${primaryButton} ml-auto`}>
          <Plus className="h-3.5 w-3.5" /> Nueva plantilla
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <Spinner />
        ) : templates.length === 0 ? (
          <div className="mx-auto mt-16 max-w-sm text-center">
            <FileText className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm font-medium text-foreground">Aún no tienes plantillas</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Empieza en blanco o desde el modelo de un país, edita el texto, haz que lo revise un abogado y publícala.
            </p>
          </div>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-card text-[11px] uppercase text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-4 py-2 font-medium">Plantilla</th>
                <th className="px-4 py-2 font-medium">País</th>
                <th className="px-4 py-2 font-medium">Versión</th>
                <th className="px-4 py-2 font-medium">Estado</th>
                <th className="px-4 py-2 font-medium">Actualizada</th>
              </tr>
            </thead>
            <tbody>
              {templates.map((t) => (
                <tr
                  key={t.id}
                  onClick={() => navigate(`/${slug}/reclutamiento/plantillas/${t.id}`)}
                  className="cursor-pointer border-b border-border transition-colors hover:bg-muted/50"
                >
                  <td className="px-4 py-2.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/${slug}/reclutamiento/plantillas/${t.id}`);
                      }}
                      className="text-left"
                    >
                      <span className="block font-medium text-foreground">{t.name}</span>
                      <span className="block text-xs text-muted-foreground">{t.languageCode === "es" ? "Español" : "English"}</span>
                    </button>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-foreground">{t.countryCode}</td>
                  <td className="px-4 py-2.5 text-xs text-foreground">v{t.version}</td>
                  <td className="px-4 py-2.5"><TemplateStatusBadge status={t.status} /></td>
                  <td className="px-4 py-2.5 text-xs text-muted-foreground">{formatDate(t.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showCreate && catalog && (
        <CreateTemplateModal
          tenantId={tenantId}
          catalog={catalog}
          onClose={() => setShowCreate(false)}
          onCreated={(id) => {
            setShowCreate(false);
            navigate(`/${slug}/reclutamiento/plantillas/${id}`);
          }}
        />
      )}
    </div>
  );
}

const BLANK = "__blank";

function CreateTemplateModal({
  tenantId,
  catalog,
  onClose,
  onCreated,
}: {
  tenantId: string;
  catalog: ContractCatalog;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [code, setCode] = useState(BLANK);
  const preset = catalog.presets.find((p) => p.code === code);
  const [language, setLanguage] = useState<Language>("es");
  const [countryCode, setCountryCode] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const choose = (value: string) => {
    setCode(value);
    const p = catalog.presets.find((x) => x.code === value);
    if (p) setLanguage(p.defaultLanguage);
  };

  const needsCountry = code === BLANK || code === "GENERIC";

  const create = async () => {
    setError("");
    if (needsCountry && !/^[A-Za-z]{2}$/.test(countryCode.trim())) {
      return setError("Indica el país con su código de 2 letras (p. ej. CO)");
    }
    if (code === BLANK && !name.trim()) return setError("Ponle un nombre a la plantilla");
    setSaving(true);
    try {
      const t =
        code === BLANK
          ? await reclutamientoApi.createTemplate(tenantId, { name: name.trim(), countryCode: countryCode.trim().toUpperCase(), languageCode: language, body: "", contractPrefix: "CT" })
          : await reclutamientoApi.createTemplate(tenantId, {
              fromPreset: { code, languageCode: language, countryCode: countryCode.trim().toUpperCase() || undefined },
              ...(name.trim() ? { name: name.trim() } : {}),
            });
      toast.success("Plantilla creada como borrador");
      onCreated(t.id);
    } catch (err) {
      setError(apiErrorMessage(err, "No se pudo crear la plantilla"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell title="Nueva plantilla de contrato" onClose={onClose} busy={saving}>
      <div className="space-y-3 px-5 py-4">
        <Field label="Punto de partida" hint="Un modelo trae un texto completo que puedes editar libremente.">
          <select value={code} onChange={(e) => choose(e.target.value)} className={inputClass}>
            <option value={BLANK}>En blanco</option>
            {catalog.presets.map((p) => (
              <option key={p.code} value={p.code}>Modelo: {p.name.es}</option>
            ))}
          </select>
        </Field>
        <Field label="Nombre" hint={code === BLANK ? undefined : "Opcional: si lo dejas vacío se usa el del modelo."}>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} className={inputClass} />
        </Field>
        {needsCountry && (
          <Field label="País del contrato" hint="Código ISO de 2 letras">
            <input value={countryCode} onChange={(e) => setCountryCode(e.target.value)} maxLength={2} className={`${inputClass} uppercase`} placeholder="CO" />
          </Field>
        )}
        <Field label="Idioma del contrato">
          <select value={language} onChange={(e) => setLanguage(e.target.value as Language)} className={inputClass}>
            {catalog.languages.map((l) => (
              <option key={l} value={l}>{l === "es" ? "Español" : "English"}</option>
            ))}
          </select>
        </Field>
        {preset && preset.notes.length > 0 && (
          <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900 dark:bg-amber-500/15 dark:text-amber-100">
            <p className="mb-1 flex items-center gap-1 font-medium"><AlertTriangle className="h-3.5 w-3.5" /> Antes de usarla</p>
            <ul className="list-disc space-y-1 pl-4">
              {preset.notes.map((n) => <li key={n}>{n}</li>)}
            </ul>
          </div>
        )}
        {preset && (
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Los datos de la empresa, la ley aplicable y la jurisdicción quedan entre corchetes [COMO ESTE]: reemplázalos en el texto. Los modelos son un punto de partida, no asesoría legal: haz que un abogado de la jurisdicción los revise.
          </p>
        )}
        {error && <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">{error}</p>}
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
        <button type="button" onClick={onClose} disabled={saving} className={secondaryButton}>Cancelar</button>
        <button type="button" onClick={create} disabled={saving} className={primaryButton}>
          {saving && <Loader2 className="h-3 w-3 animate-spin" />} Crear borrador
        </button>
      </div>
    </ModalShell>
  );
}
