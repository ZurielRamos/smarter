import {
  shortId,
  type FlowConditionBranch,
  type FlowConditionOperator,
  type FlowConditionRule,
  type FlowConditionSource,
  type FlowEdgeModel,
  type FlowNodeData,
  type FlowNodeModel,
  type InboxOption,
  type LabelOption,
} from "./types";
import type { VariableOption } from "./variables";

/**
 * Catálogo y utilidades del nodo Condición: qué operadores ofrece cada tipo de
 * dato, cómo se describe una regla en lenguaje natural, qué le falta a una regla
 * incompleta y cómo se convierte el nodo antiguo (una regla, salidas Sí/No).
 */

// ─── Operadores ───────────────────────────────────────────────

export type OperatorKind = "text" | "number" | "date" | "bool" | "presence";

export interface OperatorDef {
  key: FlowConditionOperator;
  label: string;
  kind: OperatorKind;
  /** Cuántos valores pide: 0, 1 o 2 (entre dos números o fechas). */
  arity: 0 | 1 | 2;
}

export const OPERATORS: OperatorDef[] = [
  // Texto
  { key: "equals", label: "es igual a", kind: "text", arity: 1 },
  { key: "not_equals", label: "es distinto de", kind: "text", arity: 1 },
  { key: "contains", label: "contiene", kind: "text", arity: 1 },
  { key: "not_contains", label: "no contiene", kind: "text", arity: 1 },
  { key: "starts_with", label: "empieza con", kind: "text", arity: 1 },
  { key: "ends_with", label: "termina con", kind: "text", arity: 1 },
  { key: "in_list", label: "es uno de (lista)", kind: "text", arity: 1 },
  { key: "not_in_list", label: "no es ninguno de (lista)", kind: "text", arity: 1 },
  { key: "regex", label: "coincide con la expresión regular", kind: "text", arity: 1 },
  // Número
  { key: "eq", label: "= igual a", kind: "number", arity: 1 },
  { key: "neq", label: "≠ distinto de", kind: "number", arity: 1 },
  { key: "gt", label: "> mayor que", kind: "number", arity: 1 },
  { key: "gte", label: "≥ mayor o igual que", kind: "number", arity: 1 },
  { key: "lt", label: "< menor que", kind: "number", arity: 1 },
  { key: "lte", label: "≤ menor o igual que", kind: "number", arity: 1 },
  { key: "between", label: "está entre", kind: "number", arity: 2 },
  // Fecha
  { key: "date_before", label: "es anterior a", kind: "date", arity: 1 },
  { key: "date_after", label: "es posterior a", kind: "date", arity: 1 },
  { key: "date_on", label: "es el día", kind: "date", arity: 1 },
  { key: "date_between", label: "está entre las fechas", kind: "date", arity: 2 },
  { key: "within_last_days", label: "fue en los últimos (días)", kind: "date", arity: 1 },
  { key: "older_than_days", label: "fue hace más de (días)", kind: "date", arity: 1 },
  // Sí / No
  { key: "is_true", label: "es Sí / verdadero", kind: "bool", arity: 0 },
  { key: "is_false", label: "es No / falso", kind: "bool", arity: 0 },
  // Presencia
  { key: "is_set", label: "tiene valor", kind: "presence", arity: 0 },
  { key: "is_not_set", label: "está vacío", kind: "presence", arity: 0 },
  // Reparto al azar
  { key: "percent", label: "se cumple el (%) de las veces", kind: "number", arity: 1 },
  // Nombres del nodo antiguo (solo para leer flujos viejos)
  { key: "greater_than", label: "> mayor que", kind: "number", arity: 1 },
  { key: "less_than", label: "< menor que", kind: "number", arity: 1 },
];

export const OPERATOR_BY_KEY: Record<string, OperatorDef> = Object.fromEntries(OPERATORS.map((o) => [o.key, o]));

export const OPERATOR_KIND_LABELS: Record<OperatorKind, string> = {
  text: "Texto",
  number: "Número",
  date: "Fecha",
  bool: "Sí / No",
  presence: "Valor",
};

/** Operadores de esos tipos, sin los alias antiguos ni el reparto al azar. */
const HIDDEN_OPERATORS = new Set<FlowConditionOperator>(["percent", "greater_than", "less_than"]);
const ofKinds = (...kinds: OperatorKind[]): OperatorDef[] =>
  OPERATORS.filter((o) => kinds.includes(o.kind) && !HIDDEN_OPERATORS.has(o.key));

/** Nombres más claros de algunos operadores según el tipo del campo. */
const TYPE_OPERATOR_LABELS: Record<string, Partial<Record<FlowConditionOperator, string>>> = {
  select: { equals: "es", not_equals: "no es", in_list: "es alguno de", not_in_list: "no es ninguno de" },
  array: { contains: "incluye", not_contains: "no incluye" },
  boolean: { is_true: "es Sí", is_false: "es No" },
};

/**
 * Operadores que tienen sentido para un campo según su tipo. Sin tipo conocido
 * se trata como texto.
 */
export function operatorsForType(type?: string): OperatorDef[] {
  const pick = (keys: FlowConditionOperator[]) => keys.map((k) => OPERATOR_BY_KEY[k]);
  let ops: OperatorDef[];
  switch (type) {
    case "number":
      ops = ofKinds("number", "presence");
      break;
    case "date":
      ops = ofKinds("date", "presence");
      break;
    case "boolean":
      ops = pick(["is_true", "is_false", "is_set", "is_not_set"]);
      break;
    case "select":
      ops = pick(["equals", "not_equals", "in_list", "not_in_list", "is_set", "is_not_set"]);
      break;
    case "array":
      ops = pick(["contains", "not_contains", "is_set", "is_not_set"]);
      break;
    default:
      ops = ofKinds("text", "presence");
  }
  const labels = (type && TYPE_OPERATOR_LABELS[type]) || {};
  return ops.map((o) => (labels[o.key] ? { ...o, label: labels[o.key] as string } : o));
}

/** Operador inicial al elegir un campo de ese tipo. */
export function defaultOperatorForType(type?: string): FlowConditionOperator {
  switch (type) {
    case "number":
      return "eq";
    case "date":
      return "date_after";
    case "boolean":
      return "is_true";
    case "array":
      return "contains";
    default:
      return "equals";
  }
}

/** Nombres legibles de los valores de algunos campos de selección del CRM. */
const OPTION_LABELS: Record<string, Record<string, string>> = {
  gender: { male: "Masculino", female: "Femenino", other: "Otro", prefer_not_to_say: "Prefiere no decirlo" },
  language: { es: "Español", en: "Inglés", pt: "Portugués", fr: "Francés", de: "Alemán" },
};

export function optionLabel(field: string | undefined, value: string): string {
  return (field && OPTION_LABELS[field]?.[value]) || value;
}

// ─── Fuentes ──────────────────────────────────────────────────

export interface SourceDef {
  key: FlowConditionSource;
  label: string;
  group: string;
  defaultOperator: FlowConditionOperator;
  /** Operadores permitidos; undefined = los que correspondan al tipo del campo. */
  operators?: FlowConditionOperator[];
  /** Etiquetas propias de los operadores de esta fuente («Tiene» en lugar de «es Sí»). */
  operatorLabels?: Partial<Record<FlowConditionOperator, string>>;
}

export const SOURCES: SourceDef[] = [
  { key: "variable", label: "Campo del CRM o variable", group: "Contacto", defaultOperator: "equals" },
  {
    key: "message",
    label: "Último mensaje del contacto",
    group: "Mensaje",
    defaultOperator: "contains",
    operators: ["equals", "not_equals", "contains", "not_contains", "starts_with", "ends_with", "in_list", "not_in_list", "regex", "is_set", "is_not_set"],
  },
  { key: "channel", label: "Canal", group: "Conversación", defaultOperator: "equals", operators: ["equals", "not_equals"], operatorLabels: { equals: "es", not_equals: "no es" } },
  { key: "inbox", label: "Bandeja", group: "Conversación", defaultOperator: "equals", operators: ["equals", "not_equals"], operatorLabels: { equals: "es", not_equals: "no es" } },
  { key: "label", label: "Etiqueta de la conversación", group: "Conversación", defaultOperator: "is_true", operators: ["is_true", "is_false"], operatorLabels: { is_true: "la tiene", is_false: "no la tiene" } },
  { key: "conversation_status", label: "Estado de la conversación", group: "Conversación", defaultOperator: "equals", operators: ["equals", "not_equals"], operatorLabels: { equals: "es", not_equals: "no es" } },
  { key: "new_conversation", label: "¿Es una conversación nueva?", group: "Conversación", defaultOperator: "is_true", operators: ["is_true", "is_false"], operatorLabels: { is_true: "Sí", is_false: "No" } },
  { key: "has_contact", label: "¿Tiene contacto en el CRM?", group: "Conversación", defaultOperator: "is_true", operators: ["is_true", "is_false"], operatorLabels: { is_true: "Sí", is_false: "No" } },
  { key: "inbound_count", label: "Mensajes enviados por el contacto", group: "Conversación", defaultOperator: "gte", operators: ["eq", "neq", "gt", "gte", "lt", "lte", "between"] },
  { key: "time_of_day", label: "Hora del día", group: "Fecha y hora", defaultOperator: "between", operators: ["between", "lt", "gte"], operatorLabels: { between: "está entre", lt: "es antes de", gte: "es a partir de" } },
  { key: "weekday", label: "Día de la semana", group: "Fecha y hora", defaultOperator: "in_list", operators: ["in_list", "not_in_list"], operatorLabels: { in_list: "es", not_in_list: "no es" } },
  { key: "date", label: "Fecha de hoy", group: "Fecha y hora", defaultOperator: "date_after", operators: ["date_before", "date_after", "date_on", "date_between"], operatorLabels: { date_before: "es anterior a", date_after: "es posterior a", date_on: "es el", date_between: "está entre" } },
  { key: "random", label: "Reparto al azar (prueba A/B)", group: "Azar", defaultOperator: "percent", operators: ["percent"], operatorLabels: { percent: "se cumple el" } },
];

export const SOURCE_BY_KEY: Record<string, SourceDef> = Object.fromEntries(SOURCES.map((s) => [s.key, s]));

export function operatorLabel(source: FlowConditionSource, op: FlowConditionOperator): string {
  return SOURCE_BY_KEY[source]?.operatorLabels?.[op] ?? OPERATOR_BY_KEY[op]?.label ?? op;
}

/** Operadores que ofrece una regla: los de su fuente o, para un campo, los de su tipo. */
export function operatorsForRule(rule: FlowConditionRule, fieldType?: string): OperatorDef[] {
  const src = SOURCE_BY_KEY[rule.source];
  if (src?.operators) return src.operators.map((k) => ({ ...OPERATOR_BY_KEY[k], label: operatorLabel(rule.source, k) }));
  return operatorsForType(fieldType);
}

// ─── Canales, estados, días ───────────────────────────────────

export const CHANNEL_OPTIONS = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "messenger", label: "Messenger" },
  { value: "instagram", label: "Instagram" },
  { value: "chat", label: "Chat web" },
  { value: "evolution", label: "WhatsApp (Evolution)" },
];

export const STATUS_OPTIONS = [
  { value: "open", label: "Abierta" },
  { value: "resolved", label: "Resuelta" },
  { value: "archived", label: "Archivada" },
];

/** 0 = domingo, igual que el backend. */
export const WEEKDAYS = [
  { value: "1", short: "Lun", label: "Lunes" },
  { value: "2", short: "Mar", label: "Martes" },
  { value: "3", short: "Mié", label: "Miércoles" },
  { value: "4", short: "Jue", label: "Jueves" },
  { value: "5", short: "Vie", label: "Viernes" },
  { value: "6", short: "Sáb", label: "Sábado" },
  { value: "0", short: "Dom", label: "Domingo" },
];

// ─── Creación ─────────────────────────────────────────────────

/** Regla nueva con valores iniciales útiles para su fuente. */
export function newRule(source: FlowConditionSource = "variable"): FlowConditionRule {
  const base: FlowConditionRule = {
    id: shortId("c"),
    source,
    operator: SOURCE_BY_KEY[source].defaultOperator,
  };
  switch (source) {
    case "variable":
      return { ...base, field: "", value: "" };
    case "channel":
      return { ...base, value: "whatsapp" };
    case "conversation_status":
      return { ...base, value: "open" };
    case "weekday":
      return { ...base, value: "1,2,3,4,5" };
    case "time_of_day":
      return { ...base, value: "09:00", value2: "18:00" };
    case "inbound_count":
      return { ...base, value: "1" };
    case "random":
      return { ...base, value: "50" };
    case "label":
      return { ...base, field: "" };
    default:
      return { ...base, value: "" };
  }
}

export function newBranch(position: number): FlowConditionBranch {
  return { id: shortId("r"), name: `Rama ${position}`, match: "all", rules: [newRule()] };
}

// ─── Validación ───────────────────────────────────────────────

/** Qué le falta a una regla para poder evaluarse, o null si está completa. */
export function ruleIssue(rule: FlowConditionRule): string | null {
  const op = OPERATOR_BY_KEY[rule.operator];
  if (!op) return "Operador no válido";
  if (rule.source === "variable" && !rule.field?.trim()) return "Elige un campo o variable";
  if (rule.source === "label" && !rule.field) return "Elige una etiqueta";
  if (rule.source === "weekday") return rule.value?.trim() ? null : "Elige al menos un día";
  if (rule.source === "random") {
    const n = Number(rule.value);
    return rule.value?.trim() && n >= 0 && n <= 100 ? null : "Pon un porcentaje entre 0 y 100";
  }
  if (op.arity >= 1 && !rule.value?.trim()) return "Falta el valor";
  if (op.arity === 2 && !rule.value2?.trim()) return "Falta el segundo valor";
  if (rule.operator === "regex") {
    const pattern = rule.value ?? "";
    if (pattern.length > 200) return "La expresión regular es demasiado larga (máx. 200)";
    try {
      new RegExp(pattern, "i");
    } catch {
      return "La expresión regular no es válida";
    }
  }
  return null;
}

/** Cuántas reglas incompletas o ramas vacías tiene el nodo (para avisar en el lienzo). */
export function conditionIssues(branches: FlowConditionBranch[] | undefined): number {
  if (!branches?.length) return 1;
  return branches.reduce((n, b) => n + (b.rules.length === 0 ? 1 : b.rules.filter((r) => ruleIssue(r)).length), 0);
}

// ─── Descripción en lenguaje natural ──────────────────────────

export interface DescribeLookups {
  options: VariableOption[];
  labels: LabelOption[];
  inboxes: InboxOption[];
}

function weekdayNames(value?: string): string {
  const set = new Set((value ?? "").split(",").map((v) => v.trim()));
  const picked = WEEKDAYS.filter((d) => set.has(d.value));
  return picked.length ? picked.map((d) => d.short).join(", ") : "ningún día";
}

/** «Ciudad es igual a Bogotá», «Hora está entre 09:00 y 18:00»… */
export function describeRule(rule: FlowConditionRule, lookups: DescribeLookups): string {
  const op = OPERATOR_BY_KEY[rule.operator];
  const opText = operatorLabel(rule.source, rule.operator);
  const v = (rule.value ?? "").trim();
  const v2 = (rule.value2 ?? "").trim();
  const value = op?.arity === 0 ? "" : op?.arity === 2 ? ` ${v || "…"} y ${v2 || "…"}` : ` ${v ? (rule.operator === "regex" ? `/${v}/` : `«${v}»`) : "…"}`;

  switch (rule.source) {
    case "variable": {
      const f = lookups.options.find((o) => o.key === rule.field);
      const typed = operatorsForType(f?.type).find((o) => o.key === rule.operator)?.label ?? opText;
      const shown =
        f?.options?.length && op?.arity === 1 && rule.operator !== "regex"
          ? ` ${v
              .split(",")
              .map((x) => x.trim())
              .filter(Boolean)
              .map((x) => `«${optionLabel(rule.field, x)}»`)
              .join(", ") || "…"}`
          : value;
      return `${f?.label || rule.field || "(campo)"} ${typed}${shown}`;
    }
    case "message":
      return `El mensaje ${opText}${value}`;
    case "channel":
      return `Canal ${opText} ${CHANNEL_OPTIONS.find((c) => c.value === v)?.label ?? (v || "…")}`;
    case "inbox":
      return `Bandeja ${opText} ${lookups.inboxes.find((i) => i.id === v)?.name ?? (v || "…")}`;
    case "conversation_status":
      return `Estado ${opText} ${STATUS_OPTIONS.find((s) => s.value === v)?.label ?? (v || "…")}`;
    case "label": {
      const name = lookups.labels.find((l) => l.id === rule.field)?.label ?? "(etiqueta)";
      return `${opText === "la tiene" ? "Tiene" : "No tiene"} la etiqueta «${name}»`;
    }
    case "new_conversation":
      return rule.operator === "is_true" ? "Es una conversación nueva" : "No es una conversación nueva";
    case "has_contact":
      return rule.operator === "is_true" ? "Tiene contacto en el CRM" : "No tiene contacto en el CRM";
    case "inbound_count":
      return `Mensajes del contacto ${opText}${value}`;
    case "time_of_day":
      return rule.operator === "between" ? `Hora entre ${v || "…"} y ${v2 || "…"}` : `Hora ${opText} ${v || "…"}`;
    case "weekday":
      return `Día ${opText} ${weekdayNames(rule.value)}`;
    case "date":
      return `Hoy ${opText}${value}`;
    case "random":
      return `${v || "…"} % de las veces`;
    default:
      return opText;
  }
}

export function describeBranch(branch: FlowConditionBranch, lookups: DescribeLookups): string {
  if (branch.rules.length === 0) return "Sin reglas";
  const joiner = branch.match === "any" ? " o " : " y ";
  return branch.rules.map((r) => describeRule(r, lookups)).join(joiner);
}

// ─── Nodo antiguo (una regla, salidas Sí / No) ────────────────

const LEGACY_OPERATOR: Record<string, FlowConditionOperator> = {
  greater_than: "gt",
  less_than: "lt",
};

/**
 * Convierte los nodos Condición del formato antiguo al nuevo: una rama con la
 * regla, la salida «Sí» pasa a esa rama y «No» a «Si no». Las conexiones se
 * reescriben para que el flujo siga igual. Los nodos que ya tienen ramas no se tocan.
 */
export function migrateLegacyConditions(
  nodes: FlowNodeModel[],
  edges: FlowEdgeModel[],
): { nodes: FlowNodeModel[]; edges: FlowEdgeModel[]; migrated: number } {
  const legacyIds = new Map<string, string>(); // nodeId → id de la rama
  const migratedNodes = nodes.map((n) => {
    if (n.type !== "condition" || Array.isArray(n.data.branches)) return n;
    const branchId = "si";
    legacyIds.set(n.id, branchId);
    const d = n.data;
    const hasRule = !!d.conditionVariable;
    const operator = d.conditionOperator ?? "equals";
    const rule: FlowConditionRule = {
      id: shortId("c"),
      source: "variable",
      field: d.conditionVariable ?? "",
      operator: LEGACY_OPERATOR[operator] ?? operator,
      value: d.conditionValue ?? "",
    };
    const { conditionVariable: _v, conditionOperator: _o, conditionValue: _c, ...rest } = d;
    void _v;
    void _o;
    void _c;
    const data: FlowNodeData = {
      ...rest,
      branches: [{ id: branchId, name: "Sí", match: "all", rules: hasRule ? [rule] : [] }],
    };
    return { ...n, data };
  });

  const migratedEdges = edges.map((e) => {
    const branchId = legacyIds.get(e.source);
    if (!branchId) return e;
    if (e.sourceHandle === "true") return { ...e, sourceHandle: `cond:${branchId}` };
    if (e.sourceHandle === "false") return { ...e, sourceHandle: "else" };
    return e;
  });
  return { nodes: migratedNodes, edges: migratedEdges, migrated: legacyIds.size };
}
