import { useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { Combobox } from "@/components/ui/combobox";
import { DropdownSelect } from "@/components/ui/dropdown-select";
import { useAuth } from "@/context/AuthContext";
import { reclutamientoApi, type PortalFieldDef } from "@/services/reclutamiento";

/**
 * Segmentación por Reclutamiento. El proyecto (y la pregunta) viajan dentro de
 * `field`, así que la condición sigue siendo { field, operator, value }:
 *   project:<proyecto>                    → ¿está en el proyecto? (value = "any" o un estado)
 *   project_answer:<proyecto>:<pregunta>  → respuesta a una pregunta del formulario
 *   project_answer:<proyecto>:field_<clave> → dato personal que pide el formulario (vive en el contacto)
 */
export const PROJECT_FIELD = "project:";
export const PROJECT_ANSWER_FIELD = "project_answer::";

export const isProjectField = (field: string) => field.startsWith("project:") || field.startsWith("project_answer:");
const isAnswerField = (field: string) => field.startsWith("project_answer:");

function parseField(field: string): { projectId: string; questionId: string } {
  const [, projectId = "", questionId = ""] = field.split(":");
  return { projectId, questionId };
}

const buildField = (kind: "project" | "project_answer", projectId: string, questionId = "") =>
  kind === "project" ? `project:${projectId}` : `project_answer:${projectId}:${questionId}`;

interface ProjectOption {
  id: string;
  name: string;
  status: string;
}
interface StateOption {
  key: string;
  label: string;
}

export interface RecruitmentSegmentData {
  projects: ProjectOption[];
  states: StateOption[];
}

/** Datos de Reclutamiento para segmentar; null si la cuenta no lo tiene activo o no hay permiso. */
export function useRecruitmentSegment(tenantId?: string): RecruitmentSegmentData | null {
  const { user } = useAuth();
  const [data, setData] = useState<RecruitmentSegmentData | null>(null);
  const tenantRole = user?.tenantRoles.find((tr) => tr.tenant.id === tenantId);
  // Igual que en Flujos: módulo activo y owner/admin (la API de Reclutamiento lo exige).
  // El módulo debe estar activo en la cuenta, también para un superadmin (si no, la API responde 403).
  const allowed =
    !!tenantId && !!user && !!tenantRole?.tenant.features?.reclutamiento && (user.isSuperAdmin || tenantRole.role === "owner" || tenantRole.role === "admin");

  useEffect(() => {
    if (!allowed || !tenantId) {
      setData(null);
      return;
    }
    let alive = true;
    Promise.all([reclutamientoApi.projects(tenantId, { limit: 100 }), reclutamientoApi.prospectCatalog(tenantId)])
      .then(([projects, catalog]) => {
        if (!alive) return;
        setData({
          projects: projects.data.map((p) => ({ id: p.id, name: p.name, status: p.status })),
          states: catalog.states.map((s) => ({ key: s.key, label: s.label })),
        });
      })
      .catch(() => alive && setData(null));
    return () => {
      alive = false;
    };
  }, [allowed, tenantId]);

  return data;
}

/** Lo que se puede filtrar del formulario de un proyecto: sus preguntas y los datos personales que pide. */
type ItemKind = "single" | "multi" | "yesno" | "boolean" | "number" | "date" | "text";
interface FormItem {
  id: string;
  label: string;
  kind: ItemKind;
  options: string[];
  personal: boolean;
}

function fieldKind(f: PortalFieldDef): ItemKind {
  switch (f.type) {
    case "select": return "single";
    case "boolean": return "boolean";
    case "number": return "number";
    case "date": return "date";
    default: return "text";
  }
}

// Formulario de cada proyecto, una sola vez mientras la página está abierta.
const itemsCache = new Map<string, Promise<FormItem[]>>();
const catalogCache = new Map<string, Promise<PortalFieldDef[]>>();
function loadItems(tenantId: string, projectId: string): Promise<FormItem[]> {
  const key = `${tenantId}:${projectId}`;
  if (!itemsCache.has(key)) {
    if (!catalogCache.has(tenantId)) catalogCache.set(tenantId, reclutamientoApi.portalConfig(tenantId).then((r) => r.fields));
    const p = Promise.all([reclutamientoApi.projectFace(tenantId, projectId), catalogCache.get(tenantId)!]).then(([face, catalog]): FormItem[] => [
      ...face.form.questions.map((q): FormItem => ({
        id: q.id,
        label: q.label,
        kind: q.type === "single" || q.type === "multi" || q.type === "yesno" ? q.type : q.type === "number" || q.type === "scale" ? "number" : q.type === "date" ? "date" : "text",
        options: q.type === "single" || q.type === "multi" ? q.options : [],
        personal: false,
      })),
      ...face.form.fields.flatMap((f) => catalog.filter((c) => c.key === f.key)).map((f): FormItem => ({
        id: `field_${f.key}`,
        label: `${f.label} (dato personal)`,
        kind: fieldKind(f),
        options: (f.options ?? []).map((o) => o.value),
        personal: true,
      })),
    ]);
    itemsCache.set(key, p.catch((err) => (itemsCache.delete(key), Promise.reject(err))));
  }
  return itemsCache.get(key)!;
}

const STATUS_LABEL: Record<string, string> = { paused: "Pausado", draft: "Borrador", ended: "Terminado" };

const EQ_OPS = [
  { value: "equals", label: "es" },
  { value: "not_equals", label: "no es" },
];
const MULTI_OPS = [
  { value: "equals", label: "incluye" },
  { value: "not_equals", label: "no incluye" },
];
const TEXT_OPS = [
  { value: "contains", label: "contiene" },
  { value: "equals", label: "es" },
  { value: "not_equals", label: "no es" },
];
const NUMBER_OPS = [
  { value: "equals", label: "igual a" },
  { value: "greater_than", label: "mayor que" },
  { value: "less_than", label: "menor que" },
  { value: "greater_or_equal", label: "mayor o igual a" },
  { value: "less_or_equal", label: "menor o igual a" },
];
const DATE_OPS = [
  { value: "greater_than", label: "después de" },
  { value: "less_than", label: "antes de" },
  { value: "equals", label: "igual a" },
];
const MEMBER_OPS = [
  { value: "in_project", label: "está en" },
  { value: "not_in_project", label: "no está en" },
];

const inputClass =
  "flex-1 px-3 py-1.5 text-sm border border-border rounded-md min-w-[100px] bg-background focus:outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-400";

const BOOLEAN_OPS = [
  { value: "is_true", label: "Sí" },
  { value: "is_false", label: "No" },
];

function itemOperators(q: FormItem | undefined) {
  switch (q?.kind) {
    case "single":
    case "yesno":
      return EQ_OPS;
    case "boolean":
      return BOOLEAN_OPS;
    case "multi":
      return MULTI_OPS;
    case "number":
      return NUMBER_OPS;
    case "date":
      return DATE_OPS;
    default:
      return TEXT_OPS;
  }
}

interface ProjectConditionRowProps {
  condition: { field: string; operator: string; value: string | number | boolean };
  tenantId?: string;
  recruitment: RecruitmentSegmentData;
  onUpdate: (updates: { field?: string; operator?: string; value?: string | number | boolean }) => void;
  onRemove: () => void;
}

export function ProjectConditionRow({ condition, tenantId, recruitment, onUpdate, onRemove }: ProjectConditionRowProps) {
  const answer = isAnswerField(condition.field);
  const { projectId, questionId } = parseField(condition.field);
  const [questions, setQuestions] = useState<FormItem[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (!answer || !tenantId || !projectId) {
      setQuestions(null);
      setLoadError(false);
      return;
    }
    let alive = true;
    setQuestions(null);
    setLoadError(false);
    loadItems(tenantId, projectId)
      .then((q) => alive && setQuestions(q))
      .catch(() => alive && setLoadError(true));
    return () => {
      alive = false;
    };
  }, [answer, tenantId, projectId]);

  const project = recruitment.projects.find((p) => p.id === projectId);
  const projectOptions = useMemo(
    () => [
      ...(projectId && !project ? [{ value: projectId, label: "(proyecto eliminado)" }] : []),
      ...recruitment.projects.map((p) => ({ value: p.id, label: STATUS_LABEL[p.status] ? `${p.name} (${STATUS_LABEL[p.status]})` : p.name })),
    ],
    [recruitment.projects, project, projectId],
  );
  const question = questions?.find((q) => q.id === questionId);

  const changeProject = (id: string) => {
    if (answer) onUpdate({ field: buildField("project_answer", id), operator: "equals", value: "" });
    else onUpdate({ field: buildField("project", id) });
  };
  const changeQuestion = (id: string) => {
    const q = questions?.find((x) => x.id === id);
    const op = itemOperators(q)[0].value;
    // Los operadores Sí/No no llevan valor; se guarda uno fijo para que la condición no se descarte por vacía.
    onUpdate({ field: buildField("project_answer", projectId, id), operator: op, value: q?.kind === "boolean" ? "1" : "" });
  };

  const value = String(condition.value ?? "");
  const choices: string[] = question?.options ?? [];

  return (
    <div className="flex flex-wrap items-center gap-2 p-3 bg-card rounded-lg border border-border">
      <span className="text-sm font-medium text-brand-700 dark:text-brand-200 shrink-0">{answer ? "Respuesta de proyecto" : "Proyecto"}</span>

      {!answer && (
        <DropdownSelect value={condition.operator} onChange={(v) => onUpdate({ operator: v })} options={MEMBER_OPS} />
      )}

      <Combobox
        value={projectOptions.find((o) => o.value === projectId)?.label ?? ""}
        onChange={(label) => {
          const opt = projectOptions.find((o) => o.label === label);
          if (opt) changeProject(opt.value);
        }}
        options={projectOptions.map((o) => o.label)}
        placeholder={projectOptions.length ? "Elegir proyecto..." : "La cuenta no tiene proyectos"}
        className="flex-1 min-w-[160px]"
      />

      {!answer && (
        <>
          <span className="text-sm text-muted-foreground shrink-0">con estado</span>
          <DropdownSelect
            value={value || "any"}
            onChange={(v) => onUpdate({ value: v })}
            options={[{ value: "any", label: "Cualquiera" }, ...recruitment.states.map((s) => ({ value: s.key, label: s.label }))]}
          />
        </>
      )}

      {answer && projectId && loadError && <span className="text-xs text-amber-700 dark:text-amber-300">No se pudo cargar el formulario</span>}
      {answer && projectId && !loadError && !questions && <span className="text-xs text-muted-foreground">Cargando preguntas…</span>}
      {answer && questions && questions.length === 0 && <span className="text-xs text-muted-foreground">El formulario del proyecto no tiene preguntas ni datos personales</span>}

      {answer && questions && questions.length > 0 && (
        <>
          <Combobox
            value={question?.label ?? ""}
            onChange={(label) => {
              const q = questions.find((x) => x.label === label);
              if (q) changeQuestion(q.id);
            }}
            options={questions.map((q) => q.label)}
            placeholder="Elegir pregunta o dato..."
            className="flex-1 min-w-[160px]"
          />
          {question && (
            <>
              <DropdownSelect value={condition.operator} onChange={(v) => onUpdate({ operator: v })} options={itemOperators(question)} />
              {question.kind === "boolean" ? null : choices.length > 0 ? (
                <Combobox value={value} onChange={(v) => onUpdate({ value: v })} options={choices} placeholder="Seleccionar valor..." className="flex-1 min-w-[150px]" />
              ) : question.kind === "yesno" ? (
                <DropdownSelect
                  value={value}
                  onChange={(v) => onUpdate({ value: v })}
                  options={[
                    { value: "", label: "Elegir…" },
                    { value: "true", label: "Sí" },
                    { value: "false", label: "No" },
                  ]}
                />
              ) : question.kind === "number" ? (
                <input type="number" value={value} onChange={(e) => onUpdate({ value: e.target.value })} placeholder="Valor..." className={inputClass} />
              ) : question.kind === "date" ? (
                <input type="date" value={value} onChange={(e) => onUpdate({ value: e.target.value })} className={inputClass} />
              ) : (
                <input type="text" value={value} onChange={(e) => onUpdate({ value: e.target.value })} placeholder="Valor..." className={inputClass} />
              )}
            </>
          )}
        </>
      )}

      <button
        onClick={onRemove}
        aria-label="Quitar condición"
        className="p-1.5 ml-auto text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-md transition-colors shrink-0"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
