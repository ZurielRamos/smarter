import { Plus, Trash2, Settings2 } from "lucide-react";
import { COMPONENT_META, screenOptions } from "./model";
import type { FlowComponent, FlowScreenModel, FlowModel, FlowOption } from "./types";
import { uid } from "./types";

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
          <ComponentProps component={component} onUpdate={onUpdateComponent} />
        ) : screen ? (
          <ScreenProps model={model} screen={screen} onUpdate={onUpdateScreen} />
        ) : (
          <p className="text-xs text-muted-foreground">Selecciona un elemento</p>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-foreground mb-1">{label}</label>
      {children}
    </div>
  );
}

const inputCls =
  "w-full px-2.5 py-1.5 rounded-md border border-border bg-background text-foreground text-xs focus:outline-none focus:border-brand-300 focus:ring-1 focus:ring-brand-200";

function ComponentProps({
  component,
  onUpdate,
}: {
  component: FlowComponent;
  onUpdate: (patch: Partial<FlowComponent>) => void;
}) {
  const meta = COMPONENT_META[component.type];

  return (
    <>
      <div className="text-[10px] text-muted-foreground uppercase font-semibold">{meta.label}</div>

      {meta.hasText && (
        <Field label="Texto">
          <textarea
            value={component.text || ""}
            onChange={(e) => onUpdate({ text: e.target.value })}
            rows={3}
            className={inputCls + " resize-y"}
          />
        </Field>
      )}

      {meta.isField && (
        <>
          <Field label="Etiqueta">
            <input value={component.label || ""} onChange={(e) => onUpdate({ label: e.target.value })} className={inputCls} />
          </Field>
          <Field label="Nombre del campo (clave)">
            <input
              value={component.name || ""}
              onChange={(e) => onUpdate({ name: e.target.value.replace(/\s+/g, "_") })}
              className={inputCls + " font-mono"}
            />
          </Field>
          {component.type === "TextInput" && (
            <Field label="Tipo de dato">
              <select
                value={component.inputType || "text"}
                onChange={(e) => onUpdate({ inputType: e.target.value })}
                className={inputCls}
              >
                <option value="text">Texto</option>
                <option value="number">Número</option>
                <option value="email">Email</option>
                <option value="phone">Teléfono</option>
                <option value="password">Contraseña</option>
              </select>
            </Field>
          )}
          <Field label="Texto de ayuda">
            <input
              value={component.helperText || ""}
              onChange={(e) => onUpdate({ helperText: e.target.value })}
              className={inputCls}
            />
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
        </>
      )}

      {meta.hasOptions && (
        <OptionsEditor
          options={component.options || []}
          onChange={(options) => onUpdate({ options })}
        />
      )}

      {component.type === "Image" && (
        <>
          <Field label="URL de la imagen">
            <input value={component.src || ""} onChange={(e) => onUpdate({ src: e.target.value })} className={inputCls} />
          </Field>
          <Field label="Texto alternativo">
            <input value={component.altText || ""} onChange={(e) => onUpdate({ altText: e.target.value })} className={inputCls} />
          </Field>
        </>
      )}

      {component.type === "EmbeddedLink" && (
        <>
          <Field label="Texto del enlace">
            <input value={component.text || ""} onChange={(e) => onUpdate({ text: e.target.value })} className={inputCls} />
          </Field>
          <Field label="URL">
            <input value={component.url || ""} onChange={(e) => onUpdate({ url: e.target.value })} className={inputCls} />
          </Field>
        </>
      )}
    </>
  );
}

function OptionsEditor({
  options,
  onChange,
}: {
  options: FlowOption[];
  onChange: (opts: FlowOption[]) => void;
}) {
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
            <button
              onClick={() => onChange(options.filter((_, j) => j !== i))}
              className="p-1 rounded hover:bg-red-50 text-red-500 shrink-0"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
        <button
          onClick={() =>
            onChange([...options, { id: `opcion_${options.length + 1}`, title: `Opción ${options.length + 1}` }])
          }
          className="flex items-center gap-1 text-[11px] text-brand-700 dark:text-brand-300 hover:underline"
        >
          <Plus className="h-3 w-3" /> Añadir opción
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
  // Evitar warning de uid import no usado si no se emplea; se usa en el builder.
  void uid;

  return (
    <>
      <Field label="Título de la pantalla">
        <input value={screen.title} onChange={(e) => onUpdate({ title: e.target.value })} className={inputCls} />
      </Field>
      <Field label="ID (clave de pantalla)">
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
        <select
          value={screen.next || ""}
          onChange={(e) => onUpdate({ next: e.target.value || null })}
          className={inputCls}
        >
          <option value="">— Ninguna (pantalla final) —</option>
          {targets.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title}
            </option>
          ))}
        </select>
      </Field>
      <p className="text-[10px] text-muted-foreground">
        Si no eliges siguiente pantalla, esta será la pantalla final (botón "Enviar").
      </p>
    </>
  );
}
