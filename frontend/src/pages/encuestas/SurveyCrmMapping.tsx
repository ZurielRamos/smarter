import { useEffect, useMemo, useState } from "react";
import { Loader2, Save, Link2, UserCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { DropdownSelect } from "@/components/ui/dropdown-select";
import { collectFields } from "@/components/flow-builder/condition";
import { parseFlowJson } from "@/components/flow-builder/model";
import { useParams } from "react-router-dom";
import {
  getCrmTargets,
  updateSurveyCrmMapping,
  getTenantMembers,
  setSurveyManager,
  type SurveyItem,
  type CrmTargets,
  type CrmMapping,
  type TenantMember,
} from "@/services/surveys";

/**
 * Mapeo de campos de la encuesta hacia el CRM.
 *
 * Permite vincular cada campo de la encuesta a un campo del CRM (sistema o
 * custom) y elegir el campo por el que se buscará un contacto existente para
 * atribuirle la respuesta (o crear uno nuevo si no hay match). El mapeo se
 * guarda en la encuesta (survey.crmMapping), fuera del flow.json, para no
 * afectar la compatibilidad con WhatsApp Flows de Meta.
 */
export function SurveyCrmMapping({
  survey,
  onSaved,
}: {
  survey: SurveyItem;
  onSaved: () => void;
}) {
  const { slug } = useParams();
  const [targets, setTargets] = useState<CrmTargets | null>(null);
  const [members, setMembers] = useState<TenantMember[]>([]);
  const [manager, setManager] = useState<string>(survey.managedByUserId || "");
  const [savingManager, setSavingManager] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [fieldMap, setFieldMap] = useState<Record<string, string>>(
    survey.crmMapping?.fields || {},
  );
  // Regla de match (AND/OR sobre varios campos). Migra el formato legado.
  const [matchLogic, setMatchLogic] = useState<"and" | "or">(
    survey.crmMapping?.matchRules?.logic || "or",
  );
  const [matchFields, setMatchFields] = useState<string[]>(
    survey.crmMapping?.matchRules?.fields ||
      (survey.crmMapping?.matchField ? [survey.crmMapping.matchField] : []),
  );

  // Campos de la encuesta (del flow.json), con sus labels.
  const surveyFields = useMemo(() => {
    const model = parseFlowJson(survey.flowJson || {});
    return collectFields(model);
  }, [survey.flowJson]);

  useEffect(() => {
    getCrmTargets(survey.tenantId)
      .then(setTargets)
      .catch(() => setTargets(null))
      .finally(() => setLoading(false));
  }, [survey.tenantId]);

  useEffect(() => {
    if (!slug) return;
    getTenantMembers(slug)
      .then((m) => setMembers(m.filter((x) => x.status === "active")))
      .catch(() => setMembers([]));
  }, [slug]);

  const saveManager = async (userId: string) => {
    setManager(userId);
    setSavingManager(true);
    try {
      await setSurveyManager(survey.id, userId || null);
      toast.success("Gestor de la encuesta actualizado");
      onSaved();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "No se pudo actualizar el gestor");
    } finally {
      setSavingManager(false);
    }
  };

  // Opciones del selector de CRM. system y custom ya vienen sin solaparse
  // (misma fuente: tabla custom_fields). Los personalizados se marcan al final.
  const crmOptions = useMemo(() => {
    const opts: Array<{ value: string; label: string }> = [{ value: "", label: "— Sin vincular —" }];
    if (targets) {
      for (const t of targets.system) opts.push({ value: t.value, label: t.label });
      for (const c of targets.custom) opts.push({ value: c.value, label: `${c.label} (personalizado)` });
    }
    return opts;
  }, [targets]);

  // El campo de match solo puede ser un campo de la encuesta que esté mapeado
  // a un target "matchable" (email, phone, documentNumber...) o a un custom.
  // Campos elegibles para match: mapeados a un target matchable (sistema) o a
  // un campo personalizado. Devuelve {value: surveyFieldName, label}.
  const matchableFields = useMemo(() => {
    const matchable = new Set(targets?.matchable || []);
    const customValues = new Set((targets?.custom || []).map((c) => c.value));
    const out: Array<{ value: string; label: string }> = [];
    for (const f of surveyFields) {
      const target = fieldMap[f.name];
      if (!target) continue;
      if (matchable.has(target) || customValues.has(target)) {
        out.push({ value: f.name, label: `${f.label} → ${labelForTarget(target, targets)}` });
      }
    }
    return out;
  }, [surveyFields, fieldMap, targets]);

  // Opciones para añadir un campo de match: los elegibles que no están ya en la regla.
  const addableMatchOptions = useMemo(
    () => [
      { value: "", label: "+ Añadir campo de atribución…" },
      ...matchableFields.filter((f) => !matchFields.includes(f.value)),
    ],
    [matchableFields, matchFields],
  );

  const labelForSurveyField = (name: string) =>
    matchableFields.find((f) => f.value === name)?.label || name;

  const setMap = (surveyField: string, crmTarget: string) => {
    setFieldMap((prev) => {
      const next = { ...prev };
      if (crmTarget) next[surveyField] = crmTarget;
      else delete next[surveyField];
      return next;
    });
    // Si un campo de match deja de estar mapeado, quitarlo de la regla.
    if (!crmTarget) setMatchFields((prev) => prev.filter((f) => f !== surveyField));
  };

  const addMatchField = (surveyField: string) => {
    if (!surveyField) return;
    setMatchFields((prev) => (prev.includes(surveyField) ? prev : [...prev, surveyField]));
  };

  const removeMatchField = (surveyField: string) => {
    setMatchFields((prev) => prev.filter((f) => f !== surveyField));
  };

  const save = async () => {
    setSaving(true);
    try {
      const mapping: CrmMapping = {
        fields: fieldMap,
        matchRules: { logic: matchLogic, fields: matchFields },
      };
      await updateSurveyCrmMapping(survey.id, mapping);
      toast.success("Vinculación con el CRM guardada");
      onSaved();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "No se pudo guardar la vinculación");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2.5">
        <Link2 className="h-4 w-4 text-brand-600 shrink-0 mt-0.5" />
        <p>
          Vincula los campos de la encuesta a campos del CRM. Al recibir una respuesta se creará o
          actualizará el contacto con estos datos. El <strong>campo de atribución</strong> decide
          cómo se reconoce un contacto existente.
        </p>
      </div>

      {/* Gestor de la encuesta (atribución a nivel de toda la encuesta) */}
      <div className="rounded-xl border border-border p-4">
        <div className="flex items-center gap-2 mb-2">
          <UserCheck className="h-4 w-4 text-brand-600" />
          <h3 className="text-sm font-semibold text-foreground">Gestor de la encuesta</h3>
          {savingManager && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Agente responsable de esta encuesta. Es independiente de la atribución de cada respuesta.
        </p>
        <DropdownSelect
          value={manager}
          onChange={saveManager}
          options={[
            { value: "", label: "— Sin gestor —" },
            ...members.map((m) => ({ value: m.userId, label: m.name || m.email })),
          ]}
        />
      </div>

      {surveyFields.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Esta encuesta aún no tiene campos. Añádelos en el Constructor para poder vincularlos.
        </p>
      ) : (
        <>
          {/* Mapeo campo a campo. Sin overflow-hidden en el contenedor para no
              recortar el menú del desplegable (que se posiciona en absolute). */}
          <div className="rounded-xl border border-border">
            <div className="grid grid-cols-2 gap-0 bg-muted/50 px-4 py-2 text-[10px] font-semibold text-muted-foreground uppercase rounded-t-xl">
              <span>Campo de la encuesta</span>
              <span>Campo del CRM</span>
            </div>
            {surveyFields.map((f) => (
              <div
                key={f.name}
                className="grid grid-cols-2 gap-3 items-center px-4 py-2.5 border-t border-border"
              >
                <div className="min-w-0">
                  <p className="text-sm text-foreground truncate">{f.label}</p>
                  <p className="text-[10px] text-muted-foreground font-mono truncate">{f.name}</p>
                </div>
                <DropdownSelect
                  value={fieldMap[f.name] || ""}
                  onChange={(v) => setMap(f.name, v)}
                  options={crmOptions}
                />
              </div>
            ))}
          </div>

          {/* Regla de atribución (match) con AND/OR sobre varios campos */}
          <div className="rounded-xl border border-border p-4">
            <div className="flex items-center gap-2 mb-2">
              <UserCheck className="h-4 w-4 text-brand-600" />
              <h3 className="text-sm font-semibold text-foreground">Atribución de contactos</h3>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              Campos por los que se busca un contacto existente. Si coincide, se actualiza; si no, se
              crea uno nuevo. Solo aparecen campos vinculados a email, teléfono, documento o un campo
              personalizado.
            </p>

            {matchFields.length === 0 ? (
              <p className="text-[11px] text-muted-foreground mb-3">
                Sin campos de atribución: cada respuesta creará siempre un contacto nuevo.
              </p>
            ) : (
              <>
                {/* Selector de lógica, solo relevante con 2+ campos */}
                {matchFields.length >= 2 && (
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-[11px] text-muted-foreground">Coincidir cuando</span>
                    <div className="w-44">
                      <DropdownSelect
                        value={matchLogic}
                        onChange={(v) => setMatchLogic(v as "and" | "or")}
                        options={[
                          { value: "or", label: "Cualquiera coincida (O)" },
                          { value: "and", label: "Todas coincidan (Y)" },
                        ]}
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-1.5 mb-3">
                  {matchFields.map((name, i) => (
                    <div key={name} className="flex items-center gap-2">
                      {i > 0 && (
                        <span className="text-[10px] font-semibold text-brand-600 w-6 shrink-0">
                          {matchLogic === "and" ? "Y" : "O"}
                        </span>
                      )}
                      {i === 0 && <span className="w-6 shrink-0" />}
                      <div className="flex-1 flex items-center justify-between rounded-lg border border-border px-3 py-1.5 bg-background">
                        <span className="text-xs text-foreground truncate">
                          {labelForSurveyField(name)}
                        </span>
                        <button
                          onClick={() => removeMatchField(name)}
                          className="p-0.5 rounded hover:bg-red-50 text-red-500 shrink-0"
                          title="Quitar"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Añadir otro campo de match */}
            {addableMatchOptions.length > 1 && (
              <div className="w-full">
                <DropdownSelect
                  value=""
                  onChange={(v) => addMatchField(v)}
                  options={addableMatchOptions}
                />
              </div>
            )}
            {matchableFields.length === 0 && (
              <p className="text-[11px] text-amber-600">
                Vincula primero un campo a email, teléfono, documento o un campo personalizado para
                poder atribuir.
              </p>
            )}
          </div>

          <div className="flex justify-end">
            <button
              onClick={save}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-brand-700 hover:bg-brand-600 text-white text-xs font-medium transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Guardar vinculación
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function labelForTarget(target: string, targets: CrmTargets | null): string {
  if (!targets) return target;
  const sys = targets.system.find((t) => t.value === target);
  if (sys) return sys.label;
  const cus = targets.custom.find((c) => c.value === target);
  if (cus) return cus.label;
  return target;
}
