import type { FlowModel, FlowComponent, FlowComponentType } from "./types";
import { COMPONENT_META } from "./model";

/**
 * Utilidades para construir visualmente la condición de un bloque `If` sin que
 * el usuario escriba la expresión a mano, generando SIEMPRE la misma string
 * compatible con WhatsApp Flows de Meta:
 *
 *   ${form.campo} == 'valor'
 *   ${form.a} == 'x' && ${form.b} != 'y'
 *
 * Operadores soportados por Meta: == != > < >= <= && ||
 */

export type ConditionOperator = "==" | "!=" | ">" | "<" | ">=" | "<=";
export type ConditionJoin = "&&" | "||";

export interface ConditionClause {
  field: string; // nombre del campo (sin ${form.})
  operator: ConditionOperator;
  value: string; // valor a comparar
}

export interface ParsedCondition {
  clauses: ConditionClause[]; // 1 o 2 cláusulas
  join: ConditionJoin; // conector entre las dos (si hay dos)
  // Si la expresión original no se pudo interpretar visualmente, se conserva
  // tal cual para edición avanzada (no se pierde nada).
  raw?: string;
  parsed: boolean; // true si se pudo mapear a cláusulas visuales
}

export const OPERATOR_LABELS: Record<ConditionOperator, string> = {
  "==": "es igual a",
  "!=": "es distinto de",
  ">": "es mayor que",
  "<": "es menor que",
  ">=": "es mayor o igual que",
  "<=": "es menor o igual que",
};

export interface FieldChoice {
  name: string;
  label: string;
  options?: Array<{ id: string; title: string }>;
  boolean?: boolean; // OptIn → valores true/false
}

/**
 * Lista los campos (name) disponibles en TODO el flujo, con su label y, si son
 * de selección, sus opciones. Sirve para los desplegables del editor visual.
 */
export function collectFields(model: FlowModel): FieldChoice[] {
  const out: FieldChoice[] = [];
  const seen = new Set<string>();

  const isField = (t: FlowComponentType) => COMPONENT_META[t]?.isField;

  const walk = (comps: FlowComponent[]) => {
    for (const c of comps) {
      if (c.name && isField(c.type) && !seen.has(c.name)) {
        out.push({
          name: c.name,
          label: c.label || c.name,
          options: c.options?.map((o) => ({ id: o.id, title: o.title })),
          boolean: c.type === "OptIn",
        });
        seen.add(c.name);
      }
      if (c.type === "If") {
        walk(c.thenComponents || []);
        walk(c.elseComponents || []);
      }
    }
  };

  for (const s of model.screens) walk(s.components);
  return out;
}

/** Serializa una cláusula a la sintaxis de Meta: ${form.campo} OP 'valor'. */
function clauseToString(c: ConditionClause): string {
  const field = `\${form.${c.field}}`;
  // Los booleanos (OptIn) y números van sin comillas; el resto, entre comillas.
  const isBool = c.value === "true" || c.value === "false";
  const isNum = c.value !== "" && !isNaN(Number(c.value)) && !isBool;
  const value = isBool || isNum ? c.value : `'${c.value.replace(/'/g, "\\'")}'`;
  return `${field} ${c.operator} ${value}`;
}

/** Construye la expresión final a partir de las cláusulas visuales. */
export function buildCondition(clauses: ConditionClause[], join: ConditionJoin): string {
  const valid = clauses.filter((c) => c.field);
  if (valid.length === 0) return "";
  if (valid.length === 1) return clauseToString(valid[0]);
  return `${clauseToString(valid[0])} ${join} ${clauseToString(valid[1])}`;
}

const CLAUSE_RE =
  /\$\{form\.([a-zA-Z0-9_]+)\}\s*(==|!=|>=|<=|>|<)\s*('(?:[^'\\]|\\.)*'|true|false|-?\d+(?:\.\d+)?)/;

function parseClause(text: string): ConditionClause | null {
  const m = text.trim().match(new RegExp(`^${CLAUSE_RE.source}$`));
  if (!m) return null;
  let value = m[3];
  if (value.startsWith("'") && value.endsWith("'")) {
    value = value.slice(1, -1).replace(/\\'/g, "'");
  }
  return { field: m[1], operator: m[2] as ConditionOperator, value };
}

/**
 * Intenta interpretar una expresión existente como 1-2 cláusulas visuales.
 * Si no encaja (p. ej. una expresión más compleja escrita a mano), devuelve
 * parsed=false y conserva la expresión en `raw` para edición avanzada.
 */
export function parseCondition(expr?: string | null): ParsedCondition {
  const empty: ParsedCondition = {
    clauses: [{ field: "", operator: "==", value: "" }],
    join: "&&",
    parsed: true,
  };
  if (!expr || !expr.trim()) return empty;

  const text = expr.trim();

  // ¿Una sola cláusula?
  const single = parseClause(text);
  if (single) return { clauses: [single], join: "&&", parsed: true };

  // ¿Dos cláusulas unidas por && o ||?
  for (const join of ["&&", "||"] as ConditionJoin[]) {
    const idx = text.indexOf(join);
    if (idx > 0) {
      const left = parseClause(text.slice(0, idx));
      const right = parseClause(text.slice(idx + join.length));
      if (left && right) {
        return { clauses: [left, right], join, parsed: true };
      }
    }
  }

  // No interpretable: modo avanzado.
  return { clauses: [], join: "&&", raw: text, parsed: false };
}
