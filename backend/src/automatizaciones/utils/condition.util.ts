import { renderString, TemplateContext } from './template.util';

export type ConditionOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'starts_with'
  | 'ends_with'
  | 'regex'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'is_set'
  | 'is_not_set'
  | 'is_true'
  | 'is_false';

export interface ConditionRule {
  /** Valor a evaluar; admite {{variables}}. */
  left: string;
  operator: ConditionOperator;
  right?: string;
}

export interface ConditionBranch {
  id: string;
  label?: string;
  /** all = AND, any = OR */
  match: 'all' | 'any';
  rules: ConditionRule[];
}

const isEmpty = (v: unknown) =>
  v === undefined ||
  v === null ||
  (typeof v === 'string' && v.trim() === '') ||
  (Array.isArray(v) && v.length === 0);

const asText = (v: unknown) =>
  v === undefined || v === null
    ? ''
    : typeof v === 'object'
      ? JSON.stringify(v)
      : String(v);

export function evaluateRule(rule: ConditionRule, ctx: TemplateContext): boolean {
  const left = renderString(rule.left ?? '', ctx);
  const rightRaw = rule.right ?? '';
  const right = renderString(rightRaw, ctx);
  const l = asText(left);
  const r = asText(right);

  switch (rule.operator) {
    case 'equals':
      return l === r;
    case 'not_equals':
      return l !== r;
    case 'contains':
      return Array.isArray(left) ? left.map(asText).includes(r) : l.includes(r);
    case 'not_contains':
      return Array.isArray(left) ? !left.map(asText).includes(r) : !l.includes(r);
    case 'starts_with':
      return l.startsWith(r);
    case 'ends_with':
      return l.endsWith(r);
    case 'regex': {
      // Patrón limitado en longitud para reducir el riesgo de ReDoS.
      if (r.length > 200) return false;
      try {
        return new RegExp(r, 'i').test(l.slice(0, 5000));
      } catch {
        return false;
      }
    }
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      const a = Number(l);
      const b = Number(r);
      if (Number.isNaN(a) || Number.isNaN(b)) return false;
      if (rule.operator === 'gt') return a > b;
      if (rule.operator === 'gte') return a >= b;
      if (rule.operator === 'lt') return a < b;
      return a <= b;
    }
    case 'is_set':
      return !isEmpty(left);
    case 'is_not_set':
      return isEmpty(left);
    case 'is_true':
      return left === true || l.toLowerCase() === 'true' || l === '1';
    case 'is_false':
      return left === false || l.toLowerCase() === 'false' || l === '0';
    default:
      return false;
  }
}

export function evaluateBranch(
  branch: ConditionBranch,
  ctx: TemplateContext,
): boolean {
  const rules = branch.rules ?? [];
  if (rules.length === 0) return false;
  return branch.match === 'any'
    ? rules.some((r) => evaluateRule(r, ctx))
    : rules.every((r) => evaluateRule(r, ctx));
}
