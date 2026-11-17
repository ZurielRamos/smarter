import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Archive, ArrowLeft, Copy, Eye, EyeOff, FilePlus2, Loader2, Rocket, Save, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";
import { ConfirmModal } from "@/components/ConfirmModal";
import {
  reclutamientoApi,
  type ContractCatalog,
  type ContractTemplate,
  type Language,
  type PreviewResult,
  type TemplateDraft,
} from "@/services/reclutamiento";
import { ContractTextEditor } from "./ContractTextEditor";
import { TemplatePreview } from "./TemplatePreview";
import { Field, Spinner, TemplateStatusBadge, inputClass, primaryButton, secondaryButton } from "./shared";
import { useTenantId } from "./useTenantId";

type Dialog = "publish" | "archive" | "delete" | null;

const toDraft = (t: ContractTemplate): TemplateDraft => ({
  name: t.name,
  countryCode: t.countryCode,
  languageCode: t.languageCode,
  contractPrefix: t.contractPrefix,
  body: t.body,
});

/** Editor de una plantilla: el nombre, el país y el texto del contrato. Con «{{» se insertan variables. */
export function PlantillaEditor() {
  const { slug, templateId } = useParams();
  const navigate = useNavigate();
  const tenantId = useTenantId();

  const [template, setTemplate] = useState<ContractTemplate | null>(null);
  const [catalog, setCatalog] = useState<ContractCatalog | null>(null);
  const [draft, setDraft] = useState<TemplateDraft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [publishErrors, setPublishErrors] = useState<string[]>([]);

  const [showPreview, setShowPreview] = useState(true);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewing, setPreviewing] = useState(false);

  const load = useCallback(async () => {
    if (!tenantId || !templateId) return;
    try {
      const [t, c] = await Promise.all([reclutamientoApi.getTemplate(tenantId, templateId), reclutamientoApi.contractCatalog(tenantId)]);
      setTemplate(t);
      setCatalog(c);
      setDraft(toDraft(t));
      setDirty(false);
    } catch (err) {
      if ((err as { response?: { status?: number } })?.response?.status === 404) setNotFound(true);
    } finally {
      setLoading(false);
    }
  }, [tenantId, templateId]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const edit = useCallback((patch: Partial<TemplateDraft>) => {
    setDraft((d) => (d ? { ...d, ...patch } : d));
    setPublishErrors([]);
    setDirty(true);
  }, []);

  const readOnly = template?.status !== "draft";
  const back = () => navigate(`/${slug}/reclutamiento/plantillas`);

  // La vista previa se actualiza sola poco después de dejar de escribir.
  const requestId = useRef(0);
  useEffect(() => {
    if (!showPreview || !template || !draft || !tenantId) return;
    const id = ++requestId.current;
    const timer = setTimeout(async () => {
      setPreviewing(true);
      try {
        const countryOk = /^[A-Za-z]{2}$/.test(draft.countryCode ?? "");
        const result = await reclutamientoApi.previewTemplate(tenantId, {
          templateId: template.id,
          draft: readOnly ? undefined : { body: draft.body ?? "", languageCode: draft.languageCode, ...(countryOk ? { countryCode: draft.countryCode } : {}) },
        });
        if (id === requestId.current) setPreview(result);
      } catch {
        /* el interceptor muestra el motivo si corresponde */
      } finally {
        if (id === requestId.current) setPreviewing(false);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [showPreview, template, draft, readOnly, tenantId]);

  const save = async (): Promise<boolean> => {
    if (!draft || !template) return false;
    setBusy("save");
    try {
      const saved = await reclutamientoApi.updateTemplate(tenantId, template.id, draft);
      setTemplate(saved);
      setDirty(false);
      toast.success("Plantilla guardada");
      return true;
    } catch {
      return false;
    } finally {
      setBusy(null);
    }
  };

  const publish = async () => {
    if (!template) return;
    if (dirty && !(await save())) {
      setDialog(null);
      return;
    }
    try {
      const res = await reclutamientoApi.publishTemplate(tenantId, template.id);
      setDialog(null);
      toast.success(`Plantilla publicada (v${res.template.version})`);
      await load();
    } catch (err) {
      const data = (err as { response?: { data?: { code?: string; errors?: string[] } } })?.response?.data;
      setDialog(null);
      if (data?.code === "TEMPLATE_INVALID" && data.errors) setPublishErrors(data.errors);
    }
  };

  const action = async (name: string, fn: () => Promise<void>) => {
    setBusy(name);
    try {
      await fn();
    } catch (err) {
      const res = (err as { response?: { status?: number; data?: { code?: string; templateId?: string } } })?.response;
      if (res?.status === 409 && res.data?.code === "DRAFT_EXISTS" && res.data.templateId) {
        navigate(`/${slug}/reclutamiento/plantillas/${res.data.templateId}`);
      }
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <div className="flex-1"><Spinner /></div>;
  if (notFound || !template || !draft || !catalog) {
    return (
      <div className="mx-auto mt-16 max-w-sm text-center">
        <p className="text-sm font-medium text-foreground">Plantilla no encontrada</p>
        <button type="button" onClick={back} className={`${secondaryButton} mt-3`}><ArrowLeft className="h-3.5 w-3.5" /> Volver</button>
      </div>
    );
  }

  const errors = [...new Set([...(preview?.errors ?? []), ...publishErrors])];

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <button type="button" aria-label="Volver a las plantillas" onClick={back} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 truncate text-sm font-semibold text-foreground">
            {template.name} <span className="text-xs font-normal text-muted-foreground">v{template.version}</span>
            <TemplateStatusBadge status={template.status} />
          </h2>
          {dirty && <p className="text-xs text-muted-foreground">Cambios sin guardar</p>}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setShowPreview((v) => !v)} className={secondaryButton}>
            {showPreview ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />} Vista previa
          </button>
          {!readOnly && (
            <>
              <button type="button" onClick={save} disabled={!dirty || busy !== null} className={secondaryButton}>
                {busy === "save" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Guardar
              </button>
              <button type="button" onClick={() => setDialog("publish")} disabled={busy !== null} className={primaryButton}>
                <Rocket className="h-3.5 w-3.5" /> Publicar
              </button>
              <button type="button" aria-label="Eliminar borrador" onClick={() => setDialog("delete")} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-rose-500">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}
          {readOnly && (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => action("version", async () => {
                const v = await reclutamientoApi.newTemplateVersion(tenantId, template.id);
                toast.success(`Borrador v${v.version} creado`);
                navigate(`/${slug}/reclutamiento/plantillas/${v.id}`);
              })}
              className={primaryButton}
            >
              <FilePlus2 className="h-3.5 w-3.5" /> Nueva versión
            </button>
          )}
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => action("dup", async () => {
              const d = await reclutamientoApi.duplicateTemplate(tenantId, template.id);
              toast.success("Plantilla duplicada");
              navigate(`/${slug}/reclutamiento/plantillas/${d.id}`);
            })}
            className={secondaryButton}
          >
            <Copy className="h-3.5 w-3.5" /> Duplicar
          </button>
          {template.status === "published" && (
            <button type="button" onClick={() => setDialog("archive")} className={secondaryButton}><Archive className="h-3.5 w-3.5" /> Archivar</button>
          )}
        </div>
      </div>

      {readOnly && (
        <p role="status" className="border-b border-border bg-muted px-4 py-2 text-xs text-muted-foreground">
          Esta plantilla está {template.status === "published" ? "publicada" : "archivada"} y no se edita, para que los contratos ya emitidos conserven su texto. Crea una nueva versión para modificarla.
        </p>
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_90px_130px_110px]">
            <Field label="Nombre"><input value={draft.name ?? ""} onChange={(e) => edit({ name: e.target.value })} disabled={readOnly} maxLength={200} className={inputClass} /></Field>
            <Field label="País"><input value={draft.countryCode ?? ""} onChange={(e) => edit({ countryCode: e.target.value.toUpperCase() })} disabled={readOnly} maxLength={2} className={`${inputClass} uppercase`} placeholder="CO" /></Field>
            <Field label="Idioma">
              <select value={draft.languageCode} onChange={(e) => edit({ languageCode: e.target.value as Language })} disabled={readOnly} className={inputClass}>
                {catalog.languages.map((l) => <option key={l} value={l}>{l === "es" ? "Español" : "English"}</option>)}
              </select>
            </Field>
            <Field label="Prefijo nº"><input value={draft.contractPrefix ?? ""} onChange={(e) => edit({ contractPrefix: e.target.value.toUpperCase() || null })} disabled={readOnly} maxLength={10} className={`${inputClass} uppercase`} placeholder="CT" /></Field>
          </div>

          <div className="flex min-h-[320px] flex-1 flex-col">
            <ContractTextEditor
              value={draft.body ?? ""}
              onChange={(body) => edit({ body })}
              variables={catalog.variables}
              disabled={readOnly}
              placeholder="Escribe aquí el contrato. Escribe «{{» para insertar el nombre del contacto, su documento, la tarifa, las fechas…"
              className={`${inputClass} min-h-[320px] flex-1 resize-y font-serif text-[13px] leading-relaxed`}
            />
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Escribe <code className="font-mono">{"{{"}</code> para insertar una variable. Los datos del contacto se toman de su ficha en el CRM y se pueden completar al generar cada contrato.
            </p>
          </div>

          {errors.length > 0 && (
            <div role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:bg-rose-500/15 dark:text-rose-200">
              <p className="mb-1 flex items-center gap-1 font-medium"><XCircle className="h-3.5 w-3.5" /> Corrige esto para poder publicar</p>
              <ul className="list-disc space-y-0.5 pl-4">{errors.map((e) => <li key={e}>{e}</li>)}</ul>
            </div>
          )}
        </div>

        {showPreview && (
          <aside className="min-h-0 w-full shrink-0 overflow-y-auto border-t border-border bg-muted/30 p-4 lg:w-[44%] lg:border-l lg:border-t-0" aria-label="Vista previa">
            <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">Vista previa con datos de ejemplo</h3>
            <TemplatePreview result={preview} loading={previewing && !preview} />
          </aside>
        )}
      </div>

      <ConfirmModal
        open={dialog === "publish"}
        onClose={() => setDialog(null)}
        onConfirm={publish}
        title={`Publicar versión ${template.version}`}
        description="Una plantilla publicada no se puede modificar: los cambios se hacen en una nueva versión. Si ya hay otra versión publicada, pasará a archivada (los contratos emitidos no cambian). Antes de usarla, haz que un abogado de la jurisdicción revise el texto."
        confirmLabel="Publicar"
        variant="warning"
      />
      <ConfirmModal
        open={dialog === "archive"}
        onClose={() => setDialog(null)}
        onConfirm={() => action("archive", async () => {
          await reclutamientoApi.archiveTemplate(tenantId, template.id);
          setDialog(null);
          toast.success("Plantilla archivada");
          await load();
        })}
        title="Archivar plantilla"
        description="Ya no se podrá usar para generar contratos nuevos. Los contratos ya emitidos conservan su texto."
        confirmLabel="Archivar"
        variant="warning"
      />
      <ConfirmModal
        open={dialog === "delete"}
        onClose={() => setDialog(null)}
        onConfirm={() => action("delete", async () => {
          await reclutamientoApi.deleteTemplate(tenantId, template.id);
          toast.success("Borrador eliminado");
          back();
        })}
        title="Eliminar borrador"
        description="Se eliminará este borrador de plantilla. Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        variant="danger"
      />
    </div>
  );
}
