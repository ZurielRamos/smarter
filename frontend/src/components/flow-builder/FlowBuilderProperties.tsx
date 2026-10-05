import { Plus, Trash2, Settings2 } from "lucide-react";
import { COMPONENT_META, screenOptions } from "./model";
import type { FlowComponent, FlowScreenModel, FlowModel, FlowOption, CarouselImage } from "./types";
import { DropdownSelect } from "@/components/ui/dropdown-select";

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
        <>
          <Field
            label="Condición"
            hint="Ej: ${form.es_cliente} == 'si'  ·  operadores: == != > < >= <= && ||"
          >
            <input
              value={component.condition || ""}
              onChange={(e) => onUpdate({ condition: e.target.value })}
              className={inputCls + " font-mono"}
            />
          </Field>
          <p className="text-[10px] text-muted-foreground">
            Los componentes "Entonces" y "Si no" se editan dentro del bloque en el lienzo.
          </p>
        </>
      )}

      {/* ── Texto ── */}
      {meta.hasText && (
        <Field label={component.type === "RichText" ? "Texto (markdown)" : "Texto"}>
          <textarea
            value={component.text || ""}
            onChange={(e) => onUpdate({ text: e.target.value })}
            rows={component.type === "RichText" ? 5 : 3}
            className={inputCls + " resize-y" + (component.type === "RichText" ? " font-mono" : "")}
          />
        </Field>
      )}

      {/* ── Campos de formulario ── */}
      {meta.isField && (
        <>
          <Field label="Etiqueta">
            <input value={component.label || ""} onChange={(e) => onUpdate({ label: e.target.value })} className={inputCls} />
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

          <Field label="Texto de ayuda">
            <input value={component.helperText || ""} onChange={(e) => onUpdate({ helperText: e.target.value })} className={inputCls} />
          </Field>

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
        <input value={screen.title} onChange={(e) => onUpdate({ title: e.target.value })} className={inputCls} />
      </Field>
      <Field label="ID (clave de pantalla)" hint="MAYÚSCULAS y _">
        <input
          value={screen.id}
          onChange={(e) => onUpdate({ id: e.target.value.toUpperCase().replace(/\s+/g, "_") })}
          className={inputCls + " font-mono"}
        />
      </Field>
      <Field label="Texto del botón">
        <input value={screen.footerLabel} onChange={(e) => onUpdate({ footerLabel: e.target.value })} className={inputCls} />
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
