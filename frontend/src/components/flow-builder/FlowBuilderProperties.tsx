import { useState } from "react";
import { Plus, Trash2, Settings2, Code2, Wand2 } from "lucide-react";
import { COMPONENT_META, screenOptions, FLOW_LIMITS, textLimitFor } from "./model";
import type { FlowComponent, FlowComponentType, FlowScreenModel, FlowModel, FlowOption, CarouselImage } from "./types";
import { DropdownSelect } from "@/components/ui/dropdown-select";
import {
  collectFields,
  parseCondition,
  buildCondition,
  OPERATOR_LABELS,
  type ConditionClause,
  type ConditionOperator,
  type ConditionJoin,
} from "./condition";

interface PropsPanelProps {
  model: FlowModel;
  screen: FlowScreenModel | null;
  component: FlowComponent | null;
  onUpdateComponent: (patch: Partial<FlowComponent>) => void;
  onUpdateScreen: (patch: Partial<FlowScreenModel>) => void;
}

export function FlowBuilderProperties({
  model,
  screen,
  component,
  onUpdateComponent,
  onUpdateScreen,
}: PropsPanelProps) {
  return (
    <div className="w-72 border-l border-border bg-card flex flex-col shrink-0 overflow-y-auto">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
        <h3 className="text-xs font-semibold text-foreground">
          {component ? "Propiedades del componente" : "Propiedades de la pantalla"}
        </h3>
      </div>

      <div className="p-4 space-y-4">
        {component ? (
          <ComponentProps model={model} component={component} onUpdate={onUpdateComponent} />
        ) : screen ? (
          <ScreenProps model={model} screen={screen} onUpdate={onUpdateScreen} />
        ) : (
          <p className="text-xs text-muted-foreground">Selecciona un elemento</p>
        )}
      </div>
    </div>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-foreground mb-1">{label}</label>
      {children}
      {hint && <p className="text-[9px] text-muted-foreground mt-0.5">{hint}</p>}
    </div>
  );
}

const inputCls =
  "w-full px-2.5 py-1.5 rounded-md border border-border bg-background text-foreground text-xs focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200";

/**
 * Tipos de componente donde Meta permite "helper-text". En los de selección
 * (Dropdown/RadioButtonsGroup/CheckboxGroup) y OptIn Meta lo rechaza, por eso
 * no se ofrece en el panel ni se serializa.
 */
const HELPER_TEXT_TYPES = new Set<FlowComponentType>([
  "TextInput",
  "TextArea",
  "DatePicker",
  "PhotoPicker",
  "DocumentPicker",
]);

/** Contador de caracteres que avisa cuando se acerca/supera el límite de Meta. */
function CharCount({ value, max }: { value: string | undefined; max: number }) {
  const len = (value || "").length;
  const near = len > max * 0.8;
  const over = len > max;
  return (
    <span
      className={`block text-right text-[9px] mt-0.5 ${
        over ? "text-red-600 font-medium" : near ? "text-amber-600" : "text-muted-foreground"
      }`}
    >
      {len}/{max}
    </span>
  );
}

function ComponentProps({
  model,
  component,
  onUpdate,
}: {
  model: FlowModel;
  component: FlowComponent;
  onUpdate: (patch: Partial<FlowComponent>) => void;
}) {
  const meta = COMPONENT_META[component.type];
  const screens = screenOptions(model);

  return (
    <>
      <div className="text-[10px] text-muted-foreground uppercase font-semibold">{meta.label}</div>

      {/* ── Lógica condicional (If) ── */}
      {component.type === "If" && (
        <ConditionEditor
          model={model}
          value={component.condition || ""}
          onChange={(condition) => onUpdate({ condition })}
        />
      )}

      {/* ── Texto ── */}
      {meta.hasText && (
        <Field label={component.type === "RichText" ? "Texto (markdown)" : "Texto"}>
          <textarea
            value={component.text || ""}
            onChange={(e) => onUpdate({ text: e.target.value })}
            maxLength={textLimitFor(component.type)}
            rows={component.type === "RichText" ? 5 : 3}
            className={inputCls + " resize-y" + (component.type === "RichText" ? " font-mono" : "")}
          />
          <CharCount value={component.text} max={textLimitFor(component.type)} />
        </Field>
      )}

      {/* Toggle de formato (markdown) para TextBody/TextCaption. Sin él, los
          enlaces y la negrita se muestran como texto plano en WhatsApp. */}
      {(component.type === "TextBody" || component.type === "TextCaption") && (
        <div>
          <label className="flex items-start gap-2 text-[11px] text-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={!!component.markdown}
              onChange={(e) => onUpdate({ markdown: e.target.checked })}
              className="rounded border-border mt-0.5"
            />
            <span>
              Habilitar formato (negrita, enlaces, listas)
              <span className="block text-[10px] text-muted-foreground mt-0.5">
                Usa markdown: **negrita**, *cursiva*, [texto](https://url). Necesario para que los
                enlaces sean clicables en WhatsApp.
              </span>
            </span>
          </label>
        </div>
      )}

      {/* ── Campos de formulario ── */}
      {meta.isField && (
        <>
          <Field label="Etiqueta">
            <input
              value={component.label || ""}
              onChange={(e) => onUpdate({ label: e.target.value })}
              maxLength={FLOW_LIMITS.label}
              className={inputCls}
            />
            <CharCount value={component.label} max={FLOW_LIMITS.label} />
          </Field>
          <Field label="Nombre del campo (clave)" hint="Único en la pantalla. Minúsculas y _">
            <input
              value={component.name || ""}
              onChange={(e) => onUpdate({ name: e.target.value.replace(/\s+/g, "_") })}
              className={inputCls + " font-mono"}
            />
          </Field>

          {component.type === "TextInput" && (
            <>
              <Field label="Tipo de dato">
                <DropdownSelect
                  value={component.inputType || "text"}
                  onChange={(v) => onUpdate({ inputType: v })}
                  options={[
                    { value: "text", label: "Texto" },
                    { value: "number", label: "Número" },
                    { value: "email", label: "Email" },
                    { value: "phone", label: "Teléfono" },
                    { value: "password", label: "Contraseña" },
                    { value: "passcode", label: "Código numérico" },
                  ]}
                />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Mín. caracteres">
                  <input
                    type="number"
                    value={component.minChars ?? ""}
                    onChange={(e) => onUpdate({ minChars: e.target.value === "" ? undefined : Number(e.target.value) })}
                    className={inputCls}
                  />
                </Field>
                <Field label="Máx. caracteres">
                  <input
                    type="number"
                    value={component.maxChars ?? ""}
                    onChange={(e) => onUpdate({ maxChars: e.target.value === "" ? undefined : Number(e.target.value) })}
                    className={inputCls}
                  />
                </Field>
              </div>
            </>
          )}

          {component.type === "TextArea" && (
            <Field label="Máx. caracteres">
              <input
                type="number"
                value={component.maxChars ?? ""}
                onChange={(e) => onUpdate({ maxChars: e.target.value === "" ? undefined : Number(e.target.value) })}
                className={inputCls}
              />
            </Field>
          )}

          {component.type === "DatePicker" && (
            <div className="grid grid-cols-2 gap-2">
              <Field label="Fecha mínima">
                <input type="date" value={component.minDate || ""} onChange={(e) => onUpdate({ minDate: e.target.value })} className={inputCls} />
              </Field>
              <Field label="Fecha máxima">
                <input type="date" value={component.maxDate || ""} onChange={(e) => onUpdate({ maxDate: e.target.value })} className={inputCls} />
              </Field>
            </div>
          )}

          {(component.type === "PhotoPicker" || component.type === "DocumentPicker") && (
            <Field label="Descripción">
              <input value={component.description || ""} onChange={(e) => onUpdate({ description: e.target.value })} className={inputCls} />
            </Field>
          )}

          {/* "Texto de ayuda" (helper-text) solo se ofrece en los componentes
              que Meta lo permite. En Dropdown/Radio/Checkbox/OptIn Meta lo
              rechaza (INVALID_PROPERTY_KEY), así que no se muestra. */}
          {HELPER_TEXT_TYPES.has(component.type) && (
            <Field label="Texto de ayuda">
              <input
                value={component.helperText || ""}
                onChange={(e) => onUpdate({ helperText: e.target.value })}
                maxLength={FLOW_LIMITS.helperText}
                className={inputCls}
              />
              <CharCount value={component.helperText} max={FLOW_LIMITS.helperText} />
            </Field>
          )}

          <label className="flex items-center gap-2 text-[11px] text-foreground">
            <input
              type="checkbox"
              checked={!!component.required}
              onChange={(e) => onUpdate({ required: e.target.checked })}
              className="rounded border-border"
            />
            Obligatorio
          </label>

          {/* OptIn puede navegar a una pantalla (términos) */}
          {component.type === "OptIn" && (
            <Field label="Abrir pantalla al pulsar (opcional)">
              <DropdownSelect
                value={component.linkScreen || ""}
                onChange={(v) => onUpdate({ linkScreen: v || null })}
                options={[{ value: "", label: "— Ninguna —" }, ...screens.map((s) => ({ value: s.id, label: s.title }))]}
              />
            </Field>
          )}
        </>
      )}

      {/* ── Opciones ── */}
      {meta.hasOptions && (
        <OptionsEditor options={component.options || []} onChange={(options) => onUpdate({ options })} />
      )}

      {/* ── Imagen ── */}
      {component.type === "Image" && (
        <>
          <Field label="URL o base64 de la imagen">
            <input value={component.src || ""} onChange={(e) => onUpdate({ src: e.target.value })} className={inputCls} />
          </Field>
          <Field label="Texto alternativo">
            <input value={component.altText || ""} onChange={(e) => onUpdate({ altText: e.target.value })} className={inputCls} />
          </Field>
          <Field label="Ajuste">
            <DropdownSelect
              value={component.scaleType || "contain"}
              onChange={(v) => onUpdate({ scaleType: v as any })}
              options={[
                { value: "contain", label: "Contener" },
                { value: "cover", label: "Cubrir" },
              ]}
            />
          </Field>
        </>
      )}

      {/* ── Carrusel ── */}
      {component.type === "ImageCarousel" && (
        <CarouselEditor images={component.images || []} onChange={(images) => onUpdate({ images })} />
      )}

      {/* ── Enlace ── */}
      {component.type === "EmbeddedLink" && (
        <>
          <Field label="Texto del enlace">
            <input value={component.text || ""} onChange={(e) => onUpdate({ text: e.target.value })} className={inputCls} />
          </Field>
          <Field label="Abrir pantalla (navegación interna)">
            <DropdownSelect
              value={component.linkScreen || ""}
              onChange={(v) => onUpdate({ linkScreen: v || null, url: v ? undefined : component.url })}
              options={[{ value: "", label: "— Usar URL externa —" }, ...screens.map((s) => ({ value: s.id, label: s.title }))]}
            />
          </Field>
          {!component.linkScreen && (
            <Field label="URL externa">
              <input value={component.url || ""} onChange={(e) => onUpdate({ url: e.target.value })} className={inputCls} />
            </Field>
          )}
        </>
      )}
    </>
  );
}

/**
 * Editor visual de la condición de un bloque `If`. Construye con desplegables
 * la expresión compatible con Meta (${form.campo} OP 'valor', combinable con
 * Y/O). Ofrece un modo avanzado para editar la expresión a mano; si la
 * expresión existente no se puede interpretar visualmente, abre ese modo para
 * no perderla.
 */
function ConditionEditor({
  model,
  value,
  onChange,
}: {
  model: FlowModel;
  value: string;
  onChange: (expr: string) => void;
}) {
  const fields = collectFields(model);
  const parsedInit = parseCondition(value);
  // Modo avanzado si la expresión no es interpretable visualmente.
  const [advanced, setAdvanced] = useState(!parsedInit.parsed);

  const parsed = parseCondition(value);
  const clauses = parsed.parsed && parsed.clauses.length ? parsed.clauses : [{ field: "", operator: "==" as ConditionOperator, value: "" }];
  const join = parsed.join;
  const hasTwo = clauses.length === 2;

  const emit = (nextClauses: ConditionClause[], nextJoin: ConditionJoin) => {
    onChange(buildCondition(nextClauses, nextJoin));
  };

  const updateClause = (idx: number, patch: Partial<ConditionClause>) => {
    const next = clauses.map((c, i) => (i === idx ? { ...c, ...patch } : c));
    emit(next, join);
  };

  const addSecond = () => {
    emit([clauses[0], { field: "", operator: "==", value: "" }], join);
  };

  const removeSecond = () => {
    emit([clauses[0]], join);
  };

  const operatorOptions = (Object.keys(OPERATOR_LABELS) as ConditionOperator[]).map((op) => ({
    value: op,
    label: OPERATOR_LABELS[op],
  }));

  return (
    <>
      <div className="flex items-center justify-between">
        <div className="text-[10px] text-muted-foreground uppercase font-semibold">Condición</div>
        <button
          onClick={() => setAdvanced((v) => !v)}
          className="flex items-center gap-1 text-[10px] text-brand-700 dark:text-brand-300 hover:underline"
          title={advanced ? "Editor visual" : "Editar expresión"}
        >
          {advanced ? <Wand2 className="h-3 w-3" /> : <Code2 className="h-3 w-3" />}
          {advanced ? "Visual" : "Avanzado"}
        </button>
      </div>

      {advanced ? (
        <Field label="Expresión" hint="Operadores: == != > < >= <= && ||  ·  Ej: ${form.es_cliente} == 'si'">
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={3}
            className={inputCls + " font-mono resize-y"}
          />
        </Field>
      ) : fields.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">
          Primero añade campos a la encuesta para poder construir una condición sobre ellos.
        </p>
      ) : (
        <div className="space-y-3">
          <ClauseEditor
            clause={clauses[0]}
            fields={fields}
            operatorOptions={operatorOptions}
            onChange={(patch) => updateClause(0, patch)}
          />

          {hasTwo ? (
            <>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-px bg-border" />
                <div className="w-24">
                  <DropdownSelect
                    value={join}
                    onChange={(v) => emit(clauses, v as ConditionJoin)}
                    options={[
                      { value: "&&", label: "Y (ambas)" },
                      { value: "||", label: "O (alguna)" },
                    ]}
                  />
                </div>
                <button
                  onClick={removeSecond}
                  className="p-1 rounded hover:bg-red-50 text-red-500 shrink-0"
                  title="Quitar segunda condición"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
              <ClauseEditor
                clause={clauses[1]}
                fields={fields}
                operatorOptions={operatorOptions}
                onChange={(patch) => updateClause(1, patch)}
              />
            </>
          ) : (
            <button
              onClick={addSecond}
              className="flex items-center gap-1 text-[11px] text-brand-700 dark:text-brand-300 hover:underline"
            >
              <Plus className="h-3 w-3" /> Añadir otra condición
            </button>
          )}

          {/* Vista previa de la expresión generada (transparencia) */}
          {value && (
            <div className="rounded-md bg-muted/50 border border-border px-2 py-1.5">
              <p className="text-[9px] text-muted-foreground mb-0.5">Se generará:</p>
              <code className="text-[10px] text-foreground break-all">{value}</code>
            </div>
          )}
        </div>
      )}

      <p className="text-[10px] text-muted-foreground">
        Los componentes "Entonces" y "Si no" se editan dentro del bloque en el lienzo.
      </p>
    </>
  );
}

/** Una fila: campo + operador + valor (valor según el tipo de campo). */
function ClauseEditor({
  clause,
  fields,
  operatorOptions,
  onChange,
}: {
  clause: ConditionClause;
  fields: ReturnType<typeof collectFields>;
  operatorOptions: Array<{ value: string; label: string }>;
  onChange: (patch: Partial<ConditionClause>) => void;
}) {
  const selectedField = fields.find((f) => f.name === clause.field);

  return (
    <div className="rounded-lg border border-border p-2 space-y-2 bg-background">
      <Field label="Campo">
        <DropdownSelect
          value={clause.field}
          onChange={(v) => {
            // Al cambiar de campo, reseteamos el valor para que coincida con el
            // nuevo tipo (opciones vs texto libre).
            onChange({ field: v, value: "" });
          }}
          options={[
            { value: "", label: "— Selecciona —" },
            ...fields.map((f) => ({ value: f.name, label: f.label })),
          ]}
        />
      </Field>
      <Field label="Operador">
        <DropdownSelect
          value={clause.operator}
          onChange={(v) => onChange({ operator: v as ConditionOperator })}
          options={operatorOptions}
        />
      </Field>
      <Field label="Valor">
        {selectedField?.boolean ? (
          <DropdownSelect
            value={clause.value || "true"}
            onChange={(v) => onChange({ value: v })}
            options={[
              { value: "true", label: "Marcado (Sí)" },
              { value: "false", label: "Sin marcar (No)" },
            ]}
          />
        ) : selectedField?.options && selectedField.options.length > 0 ? (
          <DropdownSelect
            value={clause.value}
            onChange={(v) => onChange({ value: v })}
            options={[
              { value: "", label: "— Selecciona —" },
              ...selectedField.options.map((o) => ({ value: o.id, label: o.title })),
            ]}
          />
        ) : (
          <input
            value={clause.value}
            onChange={(e) => onChange({ value: e.target.value })}
            placeholder="Valor a comparar"
            className={inputCls}
          />
        )}
      </Field>
    </div>
  );
}

function OptionsEditor({ options, onChange }: { options: FlowOption[]; onChange: (opts: FlowOption[]) => void }) {
  return (
    <Field label="Opciones">
      <div className="space-y-1.5">
        {options.map((opt, i) => (
          <div key={i} className="flex items-center gap-1">
            <input
              value={opt.title}
              onChange={(e) => {
                const c = [...options];
                c[i] = { ...c[i], title: e.target.value };
                onChange(c);
              }}
              placeholder="Texto"
              maxLength={FLOW_LIMITS.optionTitle}
              className={inputCls}
            />
            <input
              value={opt.id}
              onChange={(e) => {
                const c = [...options];
                c[i] = { ...c[i], id: e.target.value.replace(/\s+/g, "_") };
                onChange(c);
              }}
              placeholder="id"
              className="w-16 px-1.5 py-1.5 rounded-md border border-border bg-background text-muted-foreground text-[10px] font-mono focus:outline-none"
            />
            <button onClick={() => onChange(options.filter((_, j) => j !== i))} className="p-1 rounded hover:bg-red-50 text-red-500 shrink-0">
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
        <button
          onClick={() => onChange([...options, { id: `opcion_${options.length + 1}`, title: `Opción ${options.length + 1}` }])}
          className="flex items-center gap-1 text-[11px] text-brand-700 dark:text-brand-300 hover:underline"
        >
          <Plus className="h-3 w-3" /> Añadir opción
        </button>
      </div>
    </Field>
  );
}

function CarouselEditor({ images, onChange }: { images: CarouselImage[]; onChange: (imgs: CarouselImage[]) => void }) {
  return (
    <Field label="Imágenes del carrusel">
      <div className="space-y-2">
        {images.map((im, i) => (
          <div key={i} className="rounded-md border border-border p-2 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-muted-foreground">Imagen {i + 1}</span>
              <button onClick={() => onChange(images.filter((_, j) => j !== i))} className="p-0.5 rounded hover:bg-red-50 text-red-500">
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
            <input
              value={im.src}
              onChange={(e) => {
                const c = [...images];
                c[i] = { ...c[i], src: e.target.value };
                onChange(c);
              }}
              placeholder="URL de la imagen"
              className={inputCls}
            />
            <input
              value={im.altText || ""}
              onChange={(e) => {
                const c = [...images];
                c[i] = { ...c[i], altText: e.target.value };
                onChange(c);
              }}
              placeholder="Texto alternativo"
              className={inputCls}
            />
          </div>
        ))}
        <button
          onClick={() => onChange([...images, { src: "https://", altText: `Imagen ${images.length + 1}` }])}
          className="flex items-center gap-1 text-[11px] text-brand-700 dark:text-brand-300 hover:underline"
        >
          <Plus className="h-3 w-3" /> Añadir imagen
        </button>
      </div>
    </Field>
  );
}

function ScreenProps({
  model,
  screen,
  onUpdate,
}: {
  model: FlowModel;
  screen: FlowScreenModel;
  onUpdate: (patch: Partial<FlowScreenModel>) => void;
}) {
  const targets = screenOptions(model, screen.id);
  const dataEntries = Object.entries(screen.dataSchema || {});

  return (
    <>
      <Field label="Título de la pantalla">
        <input
          value={screen.title}
          onChange={(e) => onUpdate({ title: e.target.value })}
          maxLength={FLOW_LIMITS.screenTitle}
          className={inputCls}
        />
        <CharCount value={screen.title} max={FLOW_LIMITS.screenTitle} />
      </Field>
      <Field label="ID (clave de pantalla)" hint="Solo letras y _ (Meta no permite números)">
        <input
          value={screen.id}
          onChange={(e) =>
            onUpdate({
              // Meta solo permite letras y guiones bajos: sanitizamos quitando
              // cualquier otro carácter (incluidos números) al escribir.
              id: e.target.value
                .toUpperCase()
                .replace(/\s+/g, "_")
                .replace(/[^A-Z_]/g, ""),
            })
          }
          className={inputCls + " font-mono"}
        />
      </Field>
      <Field label="Texto del botón">
        <input
          value={screen.footerLabel}
          onChange={(e) => onUpdate({ footerLabel: e.target.value })}
          maxLength={FLOW_LIMITS.footerLabel}
          className={inputCls}
        />
        <CharCount value={screen.footerLabel} max={FLOW_LIMITS.footerLabel} />
      </Field>
      <Field label="Siguiente pantalla">
        <DropdownSelect
          value={screen.next || ""}
          onChange={(v) => onUpdate({ next: v || null })}
          options={[{ value: "", label: "— Ninguna (pantalla final) —" }, ...targets.map((t) => ({ value: t.id, label: t.title }))]}
        />
      </Field>

      {/* Data schema: datos que esta pantalla recibe de la anterior */}
      <div className="pt-2 border-t border-border">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1.5">
          Datos recibidos (${"{"}data.x{"}"})
        </p>
        <div className="space-y-1.5">
          {dataEntries.map(([key, example], i) => (
            <div key={i} className="flex items-center gap-1">
              <input
                value={key}
                onChange={(e) => {
                  const next = { ...(screen.dataSchema || {}) };
                  delete next[key];
                  next[e.target.value.replace(/\s+/g, "_")] = example;
                  onUpdate({ dataSchema: next });
                }}
                placeholder="nombre"
                className={inputCls + " font-mono"}
              />
              <input
                value={example}
                onChange={(e) => {
                  const next = { ...(screen.dataSchema || {}) };
                  next[key] = e.target.value;
                  onUpdate({ dataSchema: next });
                }}
                placeholder="ejemplo"
                className={inputCls}
              />
              <button
                onClick={() => {
                  const next = { ...(screen.dataSchema || {}) };
                  delete next[key];
                  onUpdate({ dataSchema: Object.keys(next).length ? next : undefined });
                }}
                className="p-1 rounded hover:bg-red-50 text-red-500 shrink-0"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          ))}
          <button
            onClick={() => {
              const next = { ...(screen.dataSchema || {}) };
              next[`dato_${dataEntries.length + 1}`] = "";
              onUpdate({ dataSchema: next });
            }}
            className="flex items-center gap-1 text-[11px] text-brand-700 dark:text-brand-300 hover:underline"
          >
            <Plus className="h-3 w-3" /> Añadir dato recibido
          </button>
        </div>
        <p className="text-[9px] text-muted-foreground mt-1">
          Se reenvían automáticamente a la siguiente pantalla.
        </p>
      </div>
    </>
  );
}
