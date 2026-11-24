import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { ArrowDown, ArrowUp, Check, ChevronDown, ChevronRight, ExternalLink, ImagePlus, Loader2, Monitor, Moon, Palette, Plus, Save, Sun, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import {
  reclutamientoApi,
  type LandingConfig,
  type LandingImageSlot,
  type LandingItem,
  type LandingSectionId,
  type RegistrationMode,
} from "@/services/reclutamiento";
import { Field, Segmented, Spinner, inputClass, primaryButton, secondaryButton } from "../shared";
import { useTenantId } from "../useTenantId";
import { HERO_PRESETS, presetBackground } from "./heroPresets";
import { IconPicker } from "./IconPicker";
import { PALETTES, buildTheme, isHexColor, resolveDark, useSystemDark } from "./landingTheme";
import { LandingView } from "./LandingView";

const SECTION_LABELS: Record<LandingSectionId, { label: string; hint: string }> = {
  hero: { label: "Portada", hint: "Título, subtítulo, botón e imagen principal." },
  about: { label: "Sobre el proyecto", hint: "Qué es el proyecto y en qué consiste el trabajo." },
  benefits: { label: "Beneficios", hint: "Por qué conviene unirse." },
  steps: { label: "Pasos del proceso", hint: "Cómo funciona, de la inscripción a la firma." },
  requirements: { label: "Requisitos", hint: "Lo que necesita quien se postula." },
  faq: { label: "Preguntas frecuentes", hint: "Dudas comunes con su respuesta." },
  cta: { label: "Llamado final", hint: "Cierre con el botón de registro." },
};

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
/** Ancho mínimo del panel para mostrar el editor y la vista previa lado a lado. */
const SPLIT_MIN_WIDTH = 860;

/** Imagen de la landing: se sube al elegirla y su URL queda en el borrador hasta guardar. */
function ImageField({ label, value, onChange, upload, slot }: { label: string; value: string; onChange: (url: string) => void; upload: (slot: LandingImageSlot, file: File) => Promise<string>; slot: LandingImageSlot }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const pick = async (file: File | undefined) => {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return void toast.error("La imagen debe ser JPG, PNG o WebP");
    if (file.size > MAX_IMAGE_BYTES) return void toast.error("La imagen no puede superar 5 MB");
    setBusy(true);
    try {
      onChange(await upload(slot, file));
    } catch (err) {
      const m = (err as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
      toast.error(typeof m === "string" ? m : "No se pudo subir la imagen");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };
  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-foreground">{label}</span>
      <div className="flex items-center gap-3">
        {value ? (
          <img src={value} alt="" className="h-14 w-20 rounded-lg border border-border object-cover" />
        ) : (
          <div className="flex h-14 w-20 items-center justify-center rounded-lg border border-dashed border-border text-muted-foreground">
            <ImagePlus className="h-4 w-4" aria-hidden="true" />
          </div>
        )}
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => pick(e.target.files?.[0])} />
        <button type="button" disabled={busy} onClick={() => input.current?.click()} className={secondaryButton}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />} {value ? "Cambiar" : "Subir"}
        </button>
        {value && (
          <button type="button" disabled={busy} onClick={() => onChange("")} className={secondaryButton}>
            Quitar
          </button>
        )}
      </div>
    </div>
  );
}

/** Lista de elementos con título y texto (beneficios, pasos). */
function ItemsEditor({ items, onChange, max, noun, withIcons = false }: { items: LandingItem[]; onChange: (items: LandingItem[]) => void; max: number; noun: string; withIcons?: boolean }) {
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="rounded-lg border border-border p-3">
          <div className="flex items-start gap-2">
            {withIcons && <IconPicker label={`${noun} ${i + 1}`} value={item.icon} onChange={(icon) => onChange(items.map((x, j) => (j === i ? { ...x, icon } : x)))} />}
            <div className="grid flex-1 gap-2">
              <input aria-label={`Título de ${noun} ${i + 1}`} placeholder="Título" value={item.title} maxLength={80} onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} className={inputClass} />
              <textarea aria-label={`Texto de ${noun} ${i + 1}`} placeholder="Descripción" rows={2} value={item.text} maxLength={300} onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} className={inputClass} />
            </div>
            <button type="button" aria-label={`Quitar ${noun} ${i + 1}`} onClick={() => onChange(items.filter((_, j) => j !== i))} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-rose-500">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ))}
      <button type="button" disabled={items.length >= max} onClick={() => onChange([...items, { title: "", text: "", icon: "" }])} className={secondaryButton}>
        <Plus className="h-3.5 w-3.5" /> Agregar {noun}
      </button>
    </div>
  );
}

function Card({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-background p-4">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {description && <p className="mb-3 mt-0.5 text-xs text-muted-foreground">{description}</p>}
      <div className={description ? "" : "mt-3"}>{children}</div>
    </section>
  );
}

/**
 * Muestra la landing a su ancho de escritorio (1100 px) reducida para caber en el
 * panel, así se ve igual que en pantalla grande aunque el panel sea angosto.
 */
const PREVIEW_WIDTH = 1100;
function ScaledPreview({ children }: { children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const o = outer.current;
    const n = inner.current;
    if (!o || !n) return;
    const measure = () => {
      setScale(Math.min(1, o.clientWidth / PREVIEW_WIDTH));
      setHeight(n.offsetHeight);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(o);
    ro.observe(n);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={outer} className="overflow-hidden rounded-xl border border-border bg-white shadow-sm" style={{ height: height * scale || undefined }}>
      <div ref={inner} style={{ width: PREVIEW_WIDTH, transform: `scale(${scale})`, transformOrigin: "top left" }}>
        {children}
      </div>
    </div>
  );
}

/** Paleta de colores: elige una y todo el sitio (fondos, tarjetas, botones, textos) se ajusta. */
function PalettePicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  const picker = useRef<HTMLInputElement>(null);
  const [hex, setHex] = useState(value);
  useEffect(() => setHex(value), [value]);
  const preset = PALETTES.find((p) => p.color.toLowerCase() === value.toLowerCase());
  return (
    <div>
      <span className="mb-1.5 block text-xs font-medium text-foreground">Paleta de colores</span>
      <div role="radiogroup" aria-label="Paleta de colores" className="grid grid-cols-6 gap-2">
        {PALETTES.map((p) => {
          const selected = preset?.id === p.id;
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={p.name}
              title={p.name}
              onClick={() => onChange(p.color)}
              className={`flex h-9 items-center justify-center rounded-lg border transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 ${selected ? "border-foreground ring-2 ring-offset-2 ring-offset-background" : "border-border"}`}
              style={{ backgroundColor: p.color, ["--tw-ring-color" as string]: p.color }}
            >
              {selected && <Check className="h-4 w-4 text-white drop-shadow" aria-hidden="true" />}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => picker.current?.click()}
          className={`${secondaryButton} ${!preset ? "border-foreground text-foreground" : ""}`}
        >
          <span className="h-3.5 w-3.5 rounded-full" style={{ background: "conic-gradient(red, yellow, lime, aqua, blue, magenta, red)" }} aria-hidden="true" />
          Personalizado
        </button>
        <input ref={picker} type="color" aria-label="Elegir color personalizado" value={value} onChange={(e) => onChange(e.target.value)} className="sr-only" tabIndex={-1} />
        <input
          aria-label="Color en hexadecimal"
          value={hex}
          maxLength={7}
          spellCheck={false}
          onChange={(e) => {
            const v = e.target.value.startsWith("#") ? e.target.value : `#${e.target.value}`;
            setHex(v);
            if (isHexColor(v)) onChange(v.toLowerCase());
          }}
          onBlur={() => setHex(value)}
          className={`${inputClass} w-28 font-mono`}
        />
        <span className="text-[11px] text-muted-foreground">{preset ? preset.name : "Personalizado"}</span>
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground">Fondos, tarjetas, botones y textos se ajustan solos al color elegido, en modo claro y oscuro.</p>
    </div>
  );
}

export interface LandingEditorCoreProps {
  title: string;
  subtitle: string;
  /** Landing con la que se abre el editor. */
  initial: LandingConfig;
  /** Guarda la landing y devuelve la versión normalizada por el servidor. */
  onSave: (landing: LandingConfig) => Promise<LandingConfig>;
  upload: (slot: LandingImageSlot, file: File) => Promise<string>;
  publicUrl: string;
  /** Nombre de la cuenta reclutadora: lo que reemplaza a `{{empresa}}`. */
  tenantName: string;
  /** Nombre que se muestra en el encabezado de la vista previa. */
  headerName?: string;
  /** Solo en proyectos: reemplaza a `{{proyecto}}`. */
  projectName?: string;
  variablesHint: string;
  /** Si el botón principal invita a registrarse (true) o a ingresar (false). */
  registrationOpen: boolean;
  /** Texto bajo el interruptor de publicación. */
  publicationHint: (enabled: boolean) => ReactNode;
  /** Controles propios de quien usa el editor, dentro de la tarjeta «Publicación». */
  publicationExtra?: ReactNode;
}

/** Editor de una landing del portal: marca, secciones (activar, ordenar, editar) y publicación. Lo usan la landing general y la de cada proyecto. */
export function LandingEditorCore({
  title,
  subtitle,
  initial,
  onSave,
  upload,
  publicUrl,
  tenantName,
  headerName,
  projectName,
  variablesHint,
  registrationOpen,
  publicationHint,
  publicationExtra,
}: LandingEditorCoreProps) {
  const [landing, setLanding] = useState<LandingConfig>(initial);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const [open, setOpen] = useState<LandingSectionId | null>("hero");
  // El diseño depende del ancho del panel (no de la ventana): la barra lateral de la app también le quita espacio.
  const rootRef = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(false);
  /** Con apariencia automática, qué modo mostrar en la vista previa. */
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWide(el.clientWidth >= SPLIT_MIN_WIDTH));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const edit = useCallback((fn: (l: LandingConfig) => LandingConfig) => {
    setLanding(fn);
    setDirty(true);
    setError("");
  }, []);

  const content = <K extends keyof LandingConfig["content"]>(key: K, patch: Partial<LandingConfig["content"][K]>) =>
    edit((l) => ({ ...l, content: { ...l.content, [key]: { ...l.content[key], ...patch } } }));

  const save = async (next: LandingConfig = landing) => {
    setSaving(true);
    setError("");
    try {
      const saved = await onSave(next);
      setLanding(saved);
      setDirty(false);
      toast.success(saved.enabled ? "Landing guardada y publicada" : "Landing guardada y despublicada");
      return true;
    } catch (err) {
      const m = (err as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
      setError(typeof m === "string" ? m : "No se pudo guardar la landing");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const move = (i: number, dir: -1 | 1) =>
    edit((l) => {
      const next = [...l.sections];
      const j = i + dir;
      if (j < 0 || j >= next.length) return l;
      [next[i], next[j]] = [next[j], next[i]];
      return { ...l, sections: next };
    });

  const c = landing.content;
  // En «Automático» el editor y la vista previa siguen el modo de este dispositivo, igual que verá cada visitante.
  const systemDark = useSystemDark();
  const themeDark = resolveDark(landing.brand.appearance, systemDark);
  const editorTheme = buildTheme(landing.brand.primaryColor, themeDark);
  const bg = c.hero.background;
  const setBackground = (patch: Partial<typeof bg>) => content("hero", { background: { ...bg, ...patch } });
  const sectionForm: Record<LandingSectionId, ReactNode> = {
    hero: (
      <div className="space-y-3">
        <Field label="Título"><input value={c.hero.title} maxLength={120} onChange={(e) => content("hero", { title: e.target.value })} className={inputClass} /></Field>
        <Field label="Subtítulo"><textarea rows={2} value={c.hero.subtitle} maxLength={300} onChange={(e) => content("hero", { subtitle: e.target.value })} className={inputClass} /></Field>
        <Field label="Texto del botón" hint="Se muestra con el registro abierto. Con acceso por invitación el botón dice «Ingresar al portal».">
          <input value={c.hero.ctaLabel} maxLength={40} onChange={(e) => content("hero", { ctaLabel: e.target.value })} className={inputClass} />
        </Field>
        <Segmented
          label="Fondo de la portada"
          value={bg.type}
          onChange={(type) => setBackground({ type })}
          options={[
            { value: "none", label: "Ninguno" },
            { value: "image", label: "Imagen", icon: <ImagePlus className="h-3.5 w-3.5" /> },
            { value: "preset", label: "Diseño", icon: <Palette className="h-3.5 w-3.5" /> },
          ]}
        />
        {bg.type === "image" && (
          <div className="space-y-3 rounded-lg border border-border p-3">
            <ImageField label="Imagen de fondo" value={bg.imageUrl} slot="background" upload={upload} onChange={(url) => setBackground({ imageUrl: url })} />
            <label className="block">
              <span className="mb-1 flex items-center justify-between text-xs font-medium text-foreground">
                Oscurecer la imagen <span className="font-mono text-muted-foreground">{bg.overlay}%</span>
              </span>
              <input type="range" min={0} max={80} step={5} value={bg.overlay} onChange={(e) => setBackground({ overlay: Number(e.target.value) })} className="w-full accent-brand-600" />
              <span className="mt-1 block text-[11px] text-muted-foreground">Un fondo más oscuro hace que el texto blanco se lea mejor. Se recomienda 40 % o más. Usa imágenes horizontales de buena calidad (se reducen a 1600 px de ancho).</span>
            </label>
            {!bg.imageUrl && <p className="text-[11px] text-amber-700 dark:text-amber-300">Sin imagen, la portada se muestra sin fondo.</p>}
          </div>
        )}
        {bg.type === "preset" && (
          <div>
            <div role="radiogroup" aria-label="Diseño de fondo" className="grid grid-cols-4 gap-2">
              {HERO_PRESETS.map((p) => {
                const selected = bg.preset === p.id;
                const css = presetBackground(p.id, editorTheme);
                return (
                  <button
                    key={p.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={p.name}
                    onClick={() => setBackground({ preset: p.id })}
                    className={`group overflow-hidden rounded-lg border text-left transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 ${selected ? "border-brand-600 ring-2 ring-brand-600" : "border-border hover:shadow-sm"}`}
                  >
                    <span className="block h-12" style={{ background: css?.background }} />
                    <span className="flex items-center justify-between px-1.5 py-1 text-[10px] text-foreground">
                      {p.name}
                      {selected && <Check className="h-3 w-3 text-brand-600" aria-hidden="true" />}
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">Los diseños usan los colores de tu paleta y cambian solos si la cambias.</p>
          </div>
        )}
        <ImageField label="Imagen junto al título (opcional)" value={c.hero.imageUrl} slot="hero" upload={upload} onChange={(url) => content("hero", { imageUrl: url })} />
      </div>
    ),
    about: (
      <div className="space-y-3">
        <Field label="Título"><input value={c.about.title} maxLength={120} onChange={(e) => content("about", { title: e.target.value })} className={inputClass} /></Field>
        <Field label="Texto"><textarea rows={6} value={c.about.body} maxLength={3000} onChange={(e) => content("about", { body: e.target.value })} className={inputClass} /></Field>
        <ImageField label="Imagen (opcional)" value={c.about.imageUrl} slot="about" upload={upload} onChange={(url) => content("about", { imageUrl: url })} />
      </div>
    ),
    benefits: (
      <div className="space-y-3">
        <Field label="Título"><input value={c.benefits.title} maxLength={120} onChange={(e) => content("benefits", { title: e.target.value })} className={inputClass} /></Field>
        <ItemsEditor items={c.benefits.items} max={8} noun="beneficio" withIcons onChange={(items) => content("benefits", { items })} />
      </div>
    ),
    steps: (
      <div className="space-y-3">
        <Field label="Título"><input value={c.steps.title} maxLength={120} onChange={(e) => content("steps", { title: e.target.value })} className={inputClass} /></Field>
        <ItemsEditor items={c.steps.items} max={8} noun="paso" onChange={(items) => content("steps", { items })} />
      </div>
    ),
    requirements: (
      <div className="space-y-3">
        <Field label="Título"><input value={c.requirements.title} maxLength={120} onChange={(e) => content("requirements", { title: e.target.value })} className={inputClass} /></Field>
        <div className="space-y-2">
          {c.requirements.items.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <input aria-label={`Requisito ${i + 1}`} value={r} maxLength={200} onChange={(e) => content("requirements", { items: c.requirements.items.map((x, j) => (j === i ? e.target.value : x)) })} className={inputClass} />
              <button type="button" aria-label={`Quitar requisito ${i + 1}`} onClick={() => content("requirements", { items: c.requirements.items.filter((_, j) => j !== i) })} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-rose-500">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <button type="button" disabled={c.requirements.items.length >= 12} onClick={() => content("requirements", { items: [...c.requirements.items, ""] })} className={secondaryButton}>
            <Plus className="h-3.5 w-3.5" /> Agregar requisito
          </button>
        </div>
      </div>
    ),
    faq: (
      <div className="space-y-3">
        <Field label="Título"><input value={c.faq.title} maxLength={120} onChange={(e) => content("faq", { title: e.target.value })} className={inputClass} /></Field>
        <div className="space-y-2">
          {c.faq.items.map((q, i) => (
            <div key={i} className="rounded-lg border border-border p-3">
              <div className="flex items-start gap-2">
                <div className="grid flex-1 gap-2">
                  <input aria-label={`Pregunta ${i + 1}`} placeholder="Pregunta" value={q.question} maxLength={200} onChange={(e) => content("faq", { items: c.faq.items.map((x, j) => (j === i ? { ...x, question: e.target.value } : x)) })} className={inputClass} />
                  <textarea aria-label={`Respuesta ${i + 1}`} placeholder="Respuesta" rows={2} value={q.answer} maxLength={1000} onChange={(e) => content("faq", { items: c.faq.items.map((x, j) => (j === i ? { ...x, answer: e.target.value } : x)) })} className={inputClass} />
                </div>
                <button type="button" aria-label={`Quitar pregunta ${i + 1}`} onClick={() => content("faq", { items: c.faq.items.filter((_, j) => j !== i) })} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-rose-500">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
          <button type="button" disabled={c.faq.items.length >= 12} onClick={() => content("faq", { items: [...c.faq.items, { question: "", answer: "" }] })} className={secondaryButton}>
            <Plus className="h-3.5 w-3.5" /> Agregar pregunta
          </button>
        </div>
      </div>
    ),
    cta: (
      <div className="space-y-3">
        <Field label="Título"><input value={c.cta.title} maxLength={120} onChange={(e) => content("cta", { title: e.target.value })} className={inputClass} /></Field>
        <Field label="Texto"><textarea rows={2} value={c.cta.text} maxLength={300} onChange={(e) => content("cta", { text: e.target.value })} className={inputClass} /></Field>
        <Field label="Texto del botón"><input value={c.cta.buttonLabel} maxLength={40} onChange={(e) => content("cta", { buttonLabel: e.target.value })} className={inputClass} /></Field>
      </div>
    ),
  };

  return (
    <div ref={rootRef} className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div role="tablist" aria-label="Modo" className={`${wide ? "hidden" : "flex"} rounded-lg border border-border p-0.5 text-xs`}>
            {(["edit", "preview"] as const).map((t) => (
              <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`rounded-md px-3 py-1 font-medium ${tab === t ? "bg-brand-100 text-brand-700 dark:bg-brand-700 dark:text-brand-100" : "text-muted-foreground hover:text-foreground"}`}>
                {t === "edit" ? "Editar" : "Vista previa"}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => save()} disabled={!dirty || saving} className={primaryButton}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Guardar
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className={`${wide ? "w-[26rem] shrink-0 border-r border-border" : tab === "edit" ? "flex-1" : "hidden"} min-w-0 overflow-y-auto p-4`}>
          <div className="space-y-4">
            {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:bg-rose-500/15 dark:text-rose-200">{error}</p>}

            <Card title="Publicación">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  role="switch"
                  aria-checked={landing.enabled}
                  aria-label="Publicar la landing"
                  disabled={saving}
                  onClick={() => save({ ...landing, enabled: !landing.enabled })}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60 ${landing.enabled ? "bg-green-600" : "bg-gray-300 dark:bg-gray-600"}`}
                >
                  <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${landing.enabled ? "translate-x-5" : ""}`} />
                </button>
                <span className="text-sm font-medium text-foreground">{landing.enabled ? "Publicada" : "No publicada"}</span>
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">{publicationHint(landing.enabled)}</p>
              <div className="mt-3 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-lg bg-muted px-3 py-2 text-xs text-foreground">{publicUrl}</code>
                <a href={publicUrl} target="_blank" rel="noreferrer" aria-label="Abrir la página pública" className={secondaryButton}>
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">El interruptor se aplica al instante y guarda también los cambios pendientes. {landing.enabled && dirty ? "Tienes cambios sin guardar: se publican con «Guardar»." : ""}</p>
              {publicationExtra}
            </Card>

            <Card title="Marca" description={variablesHint}>
              <div className="space-y-4">
                <PalettePicker value={landing.brand.primaryColor} onChange={(color) => edit((l) => ({ ...l, brand: { ...l.brand, primaryColor: color } }))} />
                <Segmented
                  label="Tipografía"
                  value={landing.brand.font}
                  onChange={(font) => edit((l) => ({ ...l, brand: { ...l.brand, font } }))}
                  options={[
                    { value: "sans", label: "Moderna" },
                    { value: "serif", label: "Clásica" },
                  ]}
                />
                <ImageField label="Logo (si no subes uno, se usa el icono de la cuenta)" value={landing.brand.logoUrl} slot="logo" upload={upload} onChange={(url) => edit((l) => ({ ...l, brand: { ...l.brand, logoUrl: url } }))} />
                <label className="flex items-center gap-2 text-xs text-foreground">
                  <input type="checkbox" checked={landing.brand.showName} onChange={(e) => edit((l) => ({ ...l, brand: { ...l.brand, showName: e.target.checked } }))} />
                  Mostrar el nombre de la cuenta junto al logo
                </label>
              </div>
            </Card>

            <Card title="Secciones" description="Activa, ordena y edita las secciones. El encabezado (con el botón «Ingresar») y el pie siempre se muestran.">
              <ul className="space-y-2">
                {landing.sections.map((s, i) => {
                  const meta = SECTION_LABELS[s.id];
                  const expanded = open === s.id;
                  return (
                    <li key={s.id} className="rounded-lg border border-border">
                      <div className="flex items-center gap-2 px-3 py-2">
                        <input type="checkbox" aria-label={`Mostrar ${meta.label}`} checked={s.enabled} onChange={(e) => edit((l) => ({ ...l, sections: l.sections.map((x) => (x.id === s.id ? { ...x, enabled: e.target.checked } : x)) }))} />
                        <button type="button" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : s.id)} className="flex min-w-0 flex-1 items-center gap-1.5 text-left">
                          {expanded ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
                          <span className="min-w-0">
                            <span className={`block text-sm font-medium leading-tight ${s.enabled ? "text-foreground" : "text-muted-foreground"}`}>{meta.label}</span>
                            <span className="block text-[11px] leading-snug text-muted-foreground">{meta.hint}</span>
                          </span>
                        </button>
                        <button type="button" aria-label={`Subir ${meta.label}`} disabled={i === 0} onClick={() => move(i, -1)} className="rounded-md p-1 text-muted-foreground hover:bg-muted disabled:opacity-30">
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button type="button" aria-label={`Bajar ${meta.label}`} disabled={i === landing.sections.length - 1} onClick={() => move(i, 1)} className="rounded-md p-1 text-muted-foreground hover:bg-muted disabled:opacity-30">
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      {expanded && <div className="border-t border-border px-3 py-3">{sectionForm[s.id]}</div>}
                    </li>
                  );
                })}
              </ul>
            </Card>

            <Card title="Pie de página" description="Datos de contacto y enlaces (política de privacidad, términos…).">
              <div className="space-y-3">
                <Field label="Texto"><textarea rows={2} value={c.footer.text} maxLength={300} onChange={(e) => content("footer", { text: e.target.value })} className={inputClass} /></Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Correo de contacto"><input type="email" value={c.footer.email} maxLength={200} onChange={(e) => content("footer", { email: e.target.value })} className={inputClass} /></Field>
                  <Field label="Teléfono de contacto"><input value={c.footer.phone} maxLength={40} onChange={(e) => content("footer", { phone: e.target.value })} className={inputClass} /></Field>
                </div>
                <div className="space-y-2">
                  {c.footer.links.map((l, i) => (
                    <div key={i} className="grid grid-cols-[1fr_2fr_auto] items-center gap-2">
                      <input aria-label={`Texto del enlace ${i + 1}`} placeholder="Texto" value={l.label} maxLength={60} onChange={(e) => content("footer", { links: c.footer.links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} className={inputClass} />
                      <input aria-label={`Dirección del enlace ${i + 1}`} placeholder="https://…" value={l.url} maxLength={500} onChange={(e) => content("footer", { links: c.footer.links.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })} className={inputClass} />
                      <button type="button" aria-label={`Quitar enlace ${i + 1}`} onClick={() => content("footer", { links: c.footer.links.filter((_, j) => j !== i) })} className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-rose-500">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  <button type="button" disabled={c.footer.links.length >= 6} onClick={() => content("footer", { links: [...c.footer.links, { label: "", url: "" }] })} className={secondaryButton}>
                    <Plus className="h-3.5 w-3.5" /> Agregar enlace
                  </button>
                </div>
              </div>
            </Card>
          </div>
        </div>
        <div className={`${wide || tab === "preview" ? "" : "hidden"} min-w-0 flex-1 overflow-y-auto bg-muted/40 p-4`}>
          <div className="mb-3 flex justify-center">
            <div className="w-full max-w-xs">
              <Segmented
                label="Apariencia"
                value={landing.brand.appearance}
                onChange={(appearance) => edit((l) => ({ ...l, brand: { ...l.brand, appearance } }))}
                options={[
                  { value: "light", label: "Claro", icon: <Sun className="h-3.5 w-3.5" /> },
                  { value: "dark", label: "Oscuro", icon: <Moon className="h-3.5 w-3.5" /> },
                  { value: "auto", label: "Automático", icon: <Monitor className="h-3.5 w-3.5" /> },
                ]}
                hint={
                  landing.brand.appearance === "auto"
                    ? "Cada visitante la ve en el modo de su dispositivo (ahora, el de este)."
                    : "Todos la ven así, en la landing y en todo el portal. Se guarda con «Guardar»."
                }
              />
            </div>
          </div>
          <ScaledPreview>
            <LandingView
              landing={landing}
              tenantName={tenantName}
              headerName={headerName}
              projectName={projectName}
              fallbackLogoUrl={null}
              registrationOpen={registrationOpen}
              onPrimary={() => undefined}
              onLogin={() => undefined}
            />
          </ScaledPreview>
          <p className="mt-3 text-center text-[11px] text-muted-foreground">Vista previa en vivo, con tus cambios sin guardar. Los botones no hacen nada aquí.</p>
        </div>
      </div>
    </div>
  );
}

/** Landing general del portal de la cuenta: la que se ve en /r/<cuenta>. */
export function LandingEditor() {
  const { slug } = useParams();
  const tenantId = useTenantId();
  const { user } = useAuth();
  const tenantName = user?.tenantRoles.find((tr) => tr.tenant.slug === slug)?.tenant.name ?? "Tu empresa";
  const [data, setData] = useState<{ landing: LandingConfig; mode: RegistrationMode } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    reclutamientoApi
      .portalConfig(tenantId)
      .then((r) => setData({ landing: r.config.landing, mode: r.config.registration.mode }))
      .catch(() => {
        setFailed(true);
        toast.error("No se pudo cargar la landing");
      });
  }, [tenantId]);

  if (failed) return <div className="flex-1 p-8 text-center text-sm text-muted-foreground">No se pudo cargar la landing.</div>;
  if (!data) return <div className="flex-1"><Spinner /></div>;
  return (
    <LandingEditorCore
      title="Landing del portal"
      subtitle="Página de presentación que ven las personas antes de registrarse."
      initial={data.landing}
      onSave={(l) => reclutamientoApi.saveLanding(tenantId, l)}
      upload={(slot, file) => reclutamientoApi.uploadLandingImage(tenantId, slot, file)}
      publicUrl={`${window.location.origin}/r/${slug}`}
      tenantName={tenantName}
      variablesHint="Usa {{empresa}} en cualquier texto para mostrar el nombre de tu cuenta."
      registrationOpen={data.mode === "open"}
      publicationHint={(enabled) => (
        <>
          {enabled ? "Quien abra la dirección del portal verá esta landing." : "Quien abra la dirección del portal verá solo la pantalla de acceso."}{" "}
          {data.mode === "open" ? "El registro está abierto." : "El acceso es solo por invitación; cámbialo en «Portal de registro»."}
        </>
      )}
    />
  );
}
