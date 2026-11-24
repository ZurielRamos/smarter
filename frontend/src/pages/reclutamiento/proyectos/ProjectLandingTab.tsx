import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { apiErrorMessage, reclutamientoApi, type Project, type ProjectFace, type ProjectPublicSettings } from "@/services/reclutamiento";
import { Spinner, inputClass, secondaryButton } from "../shared";
import { LandingEditorCore } from "../landing/LandingEditor";

const STATUS_NOTE: Record<Project["status"], string> = {
  draft: "es un borrador",
  active: "",
  paused: "está pausado",
  ended: "terminó",
};

/** Interruptor accesible con el mismo aspecto que el de la publicación. */
function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60 ${checked ? "bg-green-600" : "bg-gray-300 dark:bg-gray-600"}`}
    >
      <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : ""}`} />
    </button>
  );
}

/**
 * Landing del proyecto: la misma herramienta que la landing general, más el
 * nombre público y el interruptor del registro de prospectos.
 */
export function ProjectLandingTab({ tenantId, project }: { tenantId: string; project: Project }) {
  const { slug } = useParams();
  const { user } = useAuth();
  const tenantName = user?.tenantRoles.find((tr) => tr.tenant.slug === slug)?.tenant.name ?? "Tu empresa";
  const [face, setFace] = useState<ProjectFace | null>(null);
  const [settings, setSettings] = useState<ProjectPublicSettings | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const readOnly = project.status === "ended";

  useEffect(() => {
    reclutamientoApi
      .projectFace(tenantId, project.id)
      .then((f) => {
        setFace(f);
        setSettings(f.settings);
        setNameDraft(f.settings.publicName ?? "");
      })
      .catch(() => toast.error("No se pudo cargar la landing del proyecto"));
  }, [tenantId, project.id]);

  if (!face || !settings) return <div className="flex-1"><Spinner /></div>;

  const update = async (patch: Partial<ProjectPublicSettings>, done: string) => {
    setBusy(true);
    setError("");
    try {
      const next = await reclutamientoApi.saveProjectSettings(tenantId, project.id, patch);
      setSettings(next);
      setNameDraft(next.publicName ?? "");
      toast.success(done);
    } catch (err) {
      setError(apiErrorMessage(err, "No se pudo guardar el cambio"));
    } finally {
      setBusy(false);
    }
  };

  const shownName = settings.publicName || project.name;
  const live = project.status === "active";
  const url = `${window.location.origin}/r/${slug}/${project.slug}`;
  const nameChanged = nameDraft.trim() !== (settings.publicName ?? "");

  return (
    <LandingEditorCore
      title="Landing del proyecto"
      subtitle="Página de presentación y registro de este proyecto."
      initial={face.landing}
      onSave={(l) => reclutamientoApi.saveProjectLanding(tenantId, project.id, l)}
      upload={(slotName, file) => reclutamientoApi.uploadProjectLandingImage(tenantId, project.id, slotName, file)}
      publicUrl={url}
      tenantName={tenantName}
      projectName={shownName}
      variablesHint="Usa {{proyecto}} para el nombre público del proyecto y {{empresa}} para el de tu cuenta."
      registrationOpen={settings.registrationOpen}
      publicationHint={(enabled) => (
        <>
          {live
            ? enabled
              ? "Quien abra la dirección verá esta landing."
              : "Quien abra la dirección verá solo la pantalla de acceso."
            : `La dirección todavía no está disponible: el proyecto ${STATUS_NOTE[project.status]}. Puedes prepararla desde ahora; se publica cuando lo actives.`}{" "}
          {settings.registrationOpen ? "El registro está abierto." : "El registro está cerrado."}
        </>
      )}
      publicationExtra={
        <div className="mt-4 space-y-3 border-t border-border pt-3">
          {error && (
            <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:bg-rose-500/15 dark:text-rose-200">
              {error}
            </p>
          )}
          <div className="flex items-center gap-3">
            <Switch checked={settings.registrationOpen} disabled={busy || readOnly} label="Recibir registros" onChange={(v) => update({ registrationOpen: v }, v ? "Registro abierto" : "Registro cerrado")} />
            <div>
              <p className="text-sm font-medium text-foreground">Recibir registros</p>
              <p className="text-[11px] text-muted-foreground">Apagado, la landing se ve pero nadie puede registrarse.</p>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-foreground" htmlFor="project-public-name">
              Nombre público
            </label>
            <div className="flex gap-2">
              <input
                id="project-public-name"
                value={nameDraft}
                maxLength={80}
                disabled={readOnly}
                placeholder={project.name}
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && nameChanged && update({ publicName: nameDraft.trim() || null }, "Nombre público guardado")}
                className={inputClass}
              />
              <button type="button" disabled={!nameChanged || busy || readOnly} onClick={() => update({ publicName: nameDraft.trim() || null }, "Nombre público guardado")} className={secondaryButton}>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Guardar
              </button>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">Es lo que ven las personas. Vacío, se usa el nombre interno.</p>
          </div>
        </div>
      }
    />
  );
}
