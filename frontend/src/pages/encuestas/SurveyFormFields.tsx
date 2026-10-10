/**
 * Renderer compartido de los campos de una encuesta a partir del flowJson
 * (formato Meta Flow JSON). Lo usan la página pública (/s/:slug) y el modo
 * asistido (agente respondiendo por un contacto). Aplana todas las pantallas en
 * orden y conserva el `name` de cada campo, de modo que la respuesta usa las
 * mismas claves que el flowJson.
 */

export interface RenderField {
  type: string;
  name: string;
  label: string;
  required: boolean;
  helperText?: string;
  inputType?: string;
  options?: Array<{ id: string; title: string }>;
  heading?: string;
}

const TEXT_TYPES = new Set([
  "TextHeading",
  "TextSubheading",
  "TextBody",
  "TextCaption",
  "RichText",
]);

const FIELD_TYPES = new Set([
  "TextInput",
  "TextArea",
  "DatePicker",
  "Dropdown",
  "RadioButtonsGroup",
  "CheckboxGroup",
  "OptIn",
]);

/** Extrae los campos renderizables de un conjunto de children (una pantalla). */
function fieldsFromChildren(layoutChildren: any[]): RenderField[] {
  const out: RenderField[] = [];
  const walk = (children: any[]) => {
    let lastText: string | null = null;
    for (const node of children || []) {
      if (!node || typeof node !== "object") continue;
      if (TEXT_TYPES.has(node.type) && typeof node.text === "string") {
        lastText = node.text;
        continue;
      }
      if (FIELD_TYPES.has(node.type) && node.name) {
        out.push({
          type: node.type,
          name: String(node.name),
          label: node.label || node.name,
          required: !!node.required,
          helperText: node["helper-text"],
          inputType: node["input-type"],
          options: Array.isArray(node["data-source"])
            ? node["data-source"].map((o: any) => ({ id: String(o.id), title: String(o.title) }))
            : undefined,
          heading: lastText || undefined,
        });
        lastText = null;
      }
      if (Array.isArray(node.children)) walk(node.children);
      if (Array.isArray(node.then)) walk(node.then);
      if (Array.isArray(node.else)) walk(node.else);
    }
  };
  for (const c of layoutChildren || []) {
    if (c?.type === "Form" && Array.isArray(c.children)) walk(c.children);
    else walk([c]);
  }
  return out;
}

/** Aplana TODAS las pantallas a una sola lista (compat / modo asistido). */
export function flattenFields(flowJson: Record<string, any> | null): RenderField[] {
  const out: RenderField[] = [];
  if (!flowJson?.screens || !Array.isArray(flowJson.screens)) return out;
  for (const screen of flowJson.screens) {
    out.push(...fieldsFromChildren(screen.layout?.children || []));
  }
  return out;
}

export interface SurveyScreen {
  id: string;
  title: string;
  footerLabel: string;
  fields: RenderField[];
  // Texto introductorio de la pantalla (primer heading/body suelto), opcional.
  intro?: string;
}

/**
 * Devuelve las pantallas de la encuesta EN ORDEN DE NAVEGACIÓN, siguiendo el
 * routing_model (igual que el Flow en WhatsApp). Si no hay routing, usa el
 * orden natural de screens[]. Cada pantalla trae sus campos y su botón.
 */
export function screensInOrder(flowJson: Record<string, any> | null): SurveyScreen[] {
  const screens: any[] = flowJson?.screens || [];
  if (!Array.isArray(screens) || screens.length === 0) return [];

  const byId = new Map<string, any>(screens.map((s) => [s.id, s]));
  const routing: Record<string, string[]> = flowJson?.routing_model || {};

  // Orden: desde la pantalla de entrada (primera clave del routing, o la
  // primera de screens), siguiendo el primer destino de cada una. Evita ciclos.
  const order: any[] = [];
  const seen = new Set<string>();
  let currentId: string | undefined =
    Object.keys(routing)[0] || screens[0]?.id;

  while (currentId && byId.has(currentId) && !seen.has(currentId)) {
    const s = byId.get(currentId);
    order.push(s);
    seen.add(currentId);
    const next = routing[currentId];
    currentId = Array.isArray(next) && next.length > 0 ? next[0] : undefined;
  }
  // Añadir cualquier pantalla no alcanzada por el routing (al final, por orden).
  for (const s of screens) if (!seen.has(s.id)) order.push(s);

  return order.map((s) => {
    const layoutChildren: any[] = s.layout?.children || [];
    const footer = (layoutChildren.find((c) => c.type === "Form")?.children || layoutChildren).find(
      (c: any) => c.type === "Footer",
    );
    return {
      id: s.id,
      title: s.title || s.id,
      footerLabel: footer?.label || "Continuar",
      fields: fieldsFromChildren(layoutChildren),
    };
  });
}

/**
 * Renderiza campos como inputs controlados. NO usa validación nativa del
 * navegador (sin `required`, sin `type=email/tel/number`): toda la validación
 * la hace la app y los errores se muestran con `errors[name]` (borde rojo +
 * mensaje bajo el campo), para un acabado elegante y consistente.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[+]?[\d\s()-]{7,}$/;

/**
 * Valida una lista de campos contra los valores. Devuelve un mapa
 * nombre -> mensaje de error (vacío si todo OK). Validación propia, sin usar la
 * del navegador: obligatorios + formato (email, teléfono, número).
 */
export function validateFields(
  fields: RenderField[],
  values: Record<string, any>,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const f of fields) {
    const v = values[f.name];
    const isEmpty =
      v === undefined ||
      v === null ||
      v === "" ||
      (Array.isArray(v) && v.length === 0) ||
      (f.type === "OptIn" && v !== true);

    if (f.required && isEmpty) {
      errors[f.name] =
        f.type === "OptIn"
          ? "Debes aceptar para continuar."
          : f.type === "Dropdown" || f.type === "RadioButtonsGroup" || f.type === "CheckboxGroup"
            ? "Selecciona una opción."
            : "Este campo es obligatorio.";
      continue;
    }
    if (isEmpty) continue;

    if (f.type === "TextInput" || (!f.options && f.type !== "TextArea" && f.type !== "DatePicker")) {
      const str = String(v).trim();
      if (f.inputType === "email" && !EMAIL_RE.test(str)) {
        errors[f.name] = "Introduce un correo válido.";
      } else if (f.inputType === "phone" && !PHONE_RE.test(str)) {
        errors[f.name] = "Introduce un teléfono válido.";
      } else if (f.inputType === "number" && isNaN(Number(str))) {
        errors[f.name] = "Introduce un número válido.";
      }
    }
  }
  return errors;
}

export function SurveyFormFields({
  fields,
  values,
  onChange,
  errors = {},
}: {
  fields: RenderField[];
  values: Record<string, any>;
  onChange: (name: string, value: any) => void;
  errors?: Record<string, string>;
}) {
  const toggleCheckbox = (name: string, optionId: string, checked: boolean) => {
    const current: string[] = Array.isArray(values[name]) ? values[name] : [];
    onChange(name, checked ? [...current, optionId] : current.filter((x) => x !== optionId));
  };

  // Para inputs de texto: números y teléfonos usan teclado numérico en móvil
  // mediante inputMode, sin activar la validación nativa de type=number/tel.
  const inputModeFor = (t?: string): "numeric" | "tel" | "email" | undefined => {
    if (t === "number") return "numeric";
    if (t === "phone") return "tel";
    if (t === "email") return "email";
    return undefined;
  };

  const base =
    "w-full px-4 py-3 border rounded-xl text-sm outline-none bg-background text-foreground transition-colors";
  const okRing = "border-border focus:ring-2 focus:ring-brand-500 focus:border-brand-500";
  const errRing = "border-red-400 focus:ring-2 focus:ring-red-400";
  const cls = (name: string) => `${base} ${errors[name] ? errRing : okRing}`;

  return (
    <>
      {fields.map((field) => {
        const err = errors[field.name];
        return (
          <div key={field.name}>
            {field.heading && (
              <p className="text-sm font-semibold text-foreground mb-1">{field.heading}</p>
            )}
            <label className="block text-sm font-medium text-foreground mb-1.5">
              {field.label}
              {field.required && <span className="text-red-400 ml-0.5">*</span>}
            </label>
            {field.helperText && (
              <p className="text-xs text-muted-foreground mb-1.5">{field.helperText}</p>
            )}

            {field.type === "TextArea" ? (
              <textarea
                value={values[field.name] || ""}
                onChange={(e) => onChange(field.name, e.target.value)}
                rows={4}
                className={cls(field.name) + " resize-none"}
              />
            ) : field.type === "Dropdown" ? (
              <select
                value={values[field.name] || ""}
                onChange={(e) => onChange(field.name, e.target.value)}
                className={cls(field.name)}
              >
                <option value="">Seleccionar...</option>
                {field.options?.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.title}
                  </option>
                ))}
              </select>
            ) : field.type === "RadioButtonsGroup" ? (
              <div className="space-y-2">
                {field.options?.map((o) => (
                  <label key={o.id} className="flex items-center gap-2.5 text-sm text-foreground cursor-pointer">
                    <input
                      type="radio"
                      name={field.name}
                      value={o.id}
                      checked={values[field.name] === o.id}
                      onChange={(e) => onChange(field.name, e.target.value)}
                      className="text-brand-600"
                    />
                    {o.title}
                  </label>
                ))}
              </div>
            ) : field.type === "CheckboxGroup" ? (
              <div className="space-y-2">
                {field.options?.map((o) => (
                  <label key={o.id} className="flex items-center gap-2.5 text-sm text-foreground cursor-pointer">
                    <input
                      type="checkbox"
                      value={o.id}
                      checked={Array.isArray(values[field.name]) && values[field.name].includes(o.id)}
                      onChange={(e) => toggleCheckbox(field.name, o.id, e.target.checked)}
                      className="rounded text-brand-600"
                    />
                    {o.title}
                  </label>
                ))}
              </div>
            ) : field.type === "OptIn" ? (
              <label className="flex items-center gap-2.5 text-sm text-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={values[field.name] === true}
                  onChange={(e) => onChange(field.name, e.target.checked)}
                  className="rounded text-brand-600"
                />
                {field.label}
              </label>
            ) : field.type === "DatePicker" ? (
              <input
                type="date"
                value={values[field.name] || ""}
                onChange={(e) => onChange(field.name, e.target.value)}
                className={cls(field.name)}
              />
            ) : (
              <input
                type="text"
                inputMode={inputModeFor(field.inputType)}
                value={values[field.name] || ""}
                onChange={(e) => onChange(field.name, e.target.value)}
                className={cls(field.name)}
              />
            )}

            {/* Mensaje de error elegante bajo el campo */}
            {err && <p className="text-xs text-red-500 mt-1.5">{err}</p>}
          </div>
        );
      })}
    </>
  );
}
