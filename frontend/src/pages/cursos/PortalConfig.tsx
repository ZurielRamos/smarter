import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { AnimatePresence, motion } from "framer-motion";
import {
  Loader2,
  Plus,
  X,
  Mail,
  MessageCircle,
  ShieldCheck,
  ArrowLeft,
  Palette,
  GraduationCap,
  ExternalLink,
  Upload,
  Pencil,
  Trash2,
  ListChecks,
  ChevronRight,
  Share2,
  Image as ImageIcon,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { DropdownSelect } from "@/components/ui/dropdown-select";
import { ColorPicker } from "@/components/ui/color-picker";
import { ImageCropper } from "@/components/ImageCropper";
import headerBg from "@/assets/header-background.jpg";
import {
  getAcademyConfig,
  updateAcademyConfig,
  uploadAcademyLogo,
  uploadAcademyOgImage,
  listWhatsappInboxes,
  listWhatsappTemplates,
  getCrmFields,
  type AcademyConfig,
  type CourseEnrollmentField,
  type PortalTheme,
  type PortalMeta,
  type WhatsappInboxOption,
  type WhatsappTemplateOption,
  type CrmFieldsCatalog,
} from "@/services/cursos";

// Valores por defecto de la apariencia del portal (deben coincidir con el
// fallback del portal público en AcademyPortal.tsx).
const THEME_DEFAULTS: Required<Pick<PortalTheme, "primary" | "onPrimary" | "background" | "radius">> = {
  primary: "#0f766e",
  onPrimary: "#ffffff",
  background: "#f8fafc",
  radius: "xl",
};

const RADIUS_PX: Record<string, string> = { sm: "6px", md: "10px", lg: "14px", xl: "20px" };
// Presets de tamaño del logo (altura en px). Un control de opciones, no slider.
const LOGO_MIN = 24;
const LOGO_MAX = 80;
const LOGO_DEFAULT = 44;
const LEGACY_LOGO_PX: Record<string, number> = { sm: 32, md: 44, lg: 56, xl: 72 };
const LOGO_PRESETS: { label: string; px: number }[] = [
  { label: "S", px: 32 },
  { label: "M", px: 44 },
  { label: "L", px: 56 },
  { label: "XL", px: 72 },
];
// Espacio vertical de la cabecera (padding arriba/abajo), en px.
const HEADER_PY_MIN = 0;
const HEADER_PY_MAX = 40;
const HEADER_PY_DEFAULT = 8;
const headerPyOf = (raw: unknown): number =>
  typeof raw === "number" ? Math.min(HEADER_PY_MAX, Math.max(HEADER_PY_MIN, raw)) : HEADER_PY_DEFAULT;

/** Normaliza logoSize (número px o valor legacy) a px. */
function logoPxOf(raw: unknown): number {
  if (typeof raw === "number" && raw > 0) return Math.min(LOGO_MAX, Math.max(LOGO_MIN, raw));
  if (typeof raw === "string" && LEGACY_LOGO_PX[raw]) return LEGACY_LOGO_PX[raw];
  return LOGO_DEFAULT;
}

type SectionKey = "appearance" | "share" | "verification" | "fields";

const SECTIONS: { key: SectionKey; label: string; icon: typeof Palette; hint: string }[] = [
  { key: "appearance", label: "Apariencia", icon: Palette, hint: "Colores, logo y cabecera" },
  { key: "share", label: "Compartir en redes", icon: Share2, hint: "Vista previa del enlace" },
  { key: "verification", label: "Verificación de acceso", icon: ShieldCheck, hint: "Canal y plantillas del código" },
  { key: "fields", label: "Datos de inscripción", icon: ListChecks, hint: "Campos para crear el contacto" },
];

/**
 * Configuración del PORTAL de academy (a nivel tenant). Cada sección vive en su
 * propia vista (navegación lateral) para que puedan crecer sin apilarse.
 */
export function PortalConfig() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const tenantId = user?.tenantRoles.find((tr) => tr.tenant.slug === slug)?.tenantId || "";
  const portalUrl = `${window.location.origin}/academy/${slug}`;

  const [cfg, setCfg] = useState<AcademyConfig>({ verificationChannel: "both" });
  const [fields, setFields] = useState<CourseEnrollmentField[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [section, setSection] = useState<SectionKey>("appearance");

  const [inboxes, setInboxes] = useState<WhatsappInboxOption[]>([]);
  const [templates, setTemplates] = useState<WhatsappTemplateOption[]>([]);
  const [crm, setCrm] = useState<CrmFieldsCatalog | null>(null);
  const [loadingTpl, setLoadingTpl] = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    Promise.all([getAcademyConfig(tenantId), listWhatsappInboxes(tenantId), getCrmFields(tenantId)])
      .then(([c, ib, fl]) => {
        setCfg({ verificationChannel: "both", ...c });
        setFields(c.enrollmentFields ?? []);
        setInboxes(ib);
        setCrm(fl);
      })
      .catch(() => toast.error("No se pudo cargar la configuración"))
      .finally(() => setLoading(false));
  }, [tenantId]);

  useEffect(() => {
    if (!cfg.whatsappInboxId) {
      setTemplates([]);
      return;
    }
    setLoadingTpl(true);
    listWhatsappTemplates(tenantId, cfg.whatsappInboxId)
      .then(setTemplates)
      .catch(() => setTemplates([]))
      .finally(() => setLoadingTpl(false));
  }, [tenantId, cfg.whatsappInboxId]);

  const set = (patch: Partial<AcademyConfig>) => setCfg((c) => ({ ...c, ...patch }));
  const setTheme = (patch: Partial<PortalTheme>) =>
    setCfg((c) => ({ ...c, theme: { ...c.theme, ...patch } }));
  const setMeta = (patch: Partial<PortalMeta>) =>
    setCfg((c) => ({ ...c, meta: { ...c.meta, ...patch } }));

  const save = async () => {
    setSaving(true);
    try {
      await updateAcademyConfig(tenantId, { ...cfg, enrollmentFields: fields });
      toast.success("Configuración del portal guardada");
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Hero */}
      <div
        className="px-8 pt-16 pb-4 shrink-0 rounded-b-2xl"
        style={{ backgroundImage: `url(${headerBg})`, backgroundSize: "cover", backgroundPosition: "center" }}
      >
        <button
          onClick={() => navigate(`/${slug}/cursos`)}
          className="inline-flex items-center gap-1.5 text-white/70 hover:text-white text-xs font-medium mb-3 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Volver a cursos
        </button>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">Configuración del portal</h1>
            <p className="text-brand-300 mt-0.5 text-sm">
              Define la apariencia, la verificación de acceso y los datos que pide tu portal público
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={portalUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-white/80 hover:bg-white/10 hover:text-white text-sm font-medium transition-colors"
            >
              <ExternalLink className="h-4 w-4" />
              Ver portal
            </a>
            <button
              onClick={save}
              disabled={saving || loading}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white/15 hover:bg-white/25 text-white text-sm font-medium transition-colors disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Guardar cambios
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-6 items-start">
            {/* Navegación lateral de secciones */}
            <nav className="lg:sticky lg:top-0 space-y-1">
              <div className="rounded-lg bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground mb-2">
                Portal público:
                <br />
                <span className="font-mono text-foreground break-all">{portalUrl}</span>
              </div>
              {SECTIONS.map((s) => {
                const active = section === s.key;
                return (
                  <button
                    key={s.key}
                    onClick={() => setSection(s.key)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${
                      active ? "bg-brand-700 text-white" : "hover:bg-muted text-foreground"
                    }`}
                  >
                    <s.icon className={`h-4 w-4 shrink-0 ${active ? "text-white" : "text-muted-foreground"}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium leading-tight">{s.label}</p>
                      <p className={`text-[11px] leading-tight ${active ? "text-white/70" : "text-muted-foreground"}`}>
                        {s.hint}
                      </p>
                    </div>
                    <ChevronRight className={`h-4 w-4 shrink-0 ${active ? "text-white/80" : "text-muted-foreground/50"}`} />
                  </button>
                );
              })}
            </nav>

            {/* Contenido de la sección activa */}
            <AnimatePresence mode="wait">
              <motion.div
                key={section}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
              >
                {section === "appearance" && (
                  <AppearanceSection
                    tenantId={tenantId}
                    theme={cfg.theme || {}}
                    setTheme={setTheme}
                  />
                )}
                {section === "share" && (
                  <ShareSection
                    tenantId={tenantId}
                    meta={cfg.meta || {}}
                    setMeta={setMeta}
                    fallbackTitle={cfg.theme?.headerTitle?.trim() || slug || "Academy"}
                    portalUrl={portalUrl}
                  />
                )}
                {section === "verification" && (
                  <VerificationSection
                    cfg={cfg}
                    set={set}
                    inboxes={inboxes}
                    templates={templates}
                    loadingTpl={loadingTpl}
                  />
                )}
                {section === "fields" && (
                  <FieldsSection fields={fields} setFields={setFields} crm={crm} />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── Apariencia ─────────────────────────── */

function AppearanceSection({
  tenantId,
  theme,
  setTheme,
}: {
  tenantId: string;
  theme: PortalTheme;
  setTheme: (patch: Partial<PortalTheme>) => void;
}) {
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  // El logo se sube tal cual, conservando su proporción original (sin recorte).
  const onPickLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !tenantId) return;
    setUploadingLogo(true);
    try {
      const updated = await uploadAcademyLogo(tenantId, file);
      setTheme({ logoUrl: updated.theme?.logoUrl });
      toast.success("Logo actualizado");
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "No se pudo subir el logo");
    } finally {
      setUploadingLogo(false);
    }
  };

  const preview = useMemo(
    () => ({
      primary: theme.primary || THEME_DEFAULTS.primary,
      onPrimary: theme.onPrimary || THEME_DEFAULTS.onPrimary,
      background: theme.background || THEME_DEFAULTS.background,
      radius: RADIUS_PX[theme.radius || THEME_DEFAULTS.radius] || RADIUS_PX.xl,
      title: theme.headerTitle?.trim() || "Academy",
      subtitle: theme.headerSubtitle?.trim() || "",
      logoUrl: theme.logoUrl?.trim() || "",
      logoPx: logoPxOf(theme.logoSize),
      headerPaddingY: headerPyOf(theme.headerPaddingY),
      showHeaderText: theme.showHeaderText !== false,
    }),
    [theme],
  );

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_300px] gap-6 items-start">
      <div className="space-y-6">
        <Card>
          <Section icon={Palette} title="Colores y estilo">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <ColorPicker
                label="Color principal"
                value={theme.primary || THEME_DEFAULTS.primary}
                onChange={(v) => setTheme({ primary: v })}
              />
              <ColorPicker
                label="Texto sobre el color principal"
                value={theme.onPrimary || THEME_DEFAULTS.onPrimary}
                onChange={(v) => setTheme({ onPrimary: v })}
              />
              <ColorPicker
                label="Color de fondo"
                value={theme.background || THEME_DEFAULTS.background}
                onChange={(v) => setTheme({ background: v })}
              />
              <Labeled label="Redondeo de esquinas">
                <DropdownSelect
                  value={theme.radius || THEME_DEFAULTS.radius}
                  onChange={(v) => setTheme({ radius: v })}
                  options={[
                    { value: "sm", label: "Sutil" },
                    { value: "md", label: "Medio" },
                    { value: "lg", label: "Amplio" },
                    { value: "xl", label: "Muy redondeado" },
                  ]}
                />
              </Labeled>
            </div>
          </Section>
        </Card>

        <Card>
          <Section icon={GraduationCap} title="Cabecera">
            <Labeled label="Título de la cabecera">
              <input
                value={theme.headerTitle ?? ""}
                onChange={(e) => setTheme({ headerTitle: e.target.value })}
                placeholder="Nombre de tu academia (por defecto el de tu cuenta)"
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-brand-300"
              />
            </Labeled>
            <Labeled label="Subtítulo (opcional)">
              <input
                value={theme.headerSubtitle ?? ""}
                onChange={(e) => setTheme({ headerSubtitle: e.target.value })}
                placeholder="Ej. Formación y certificaciones"
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-brand-300"
              />
            </Labeled>

            {/* Mostrar u ocultar los textos de la cabecera. */}
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <button
                type="button"
                role="switch"
                aria-checked={theme.showHeaderText !== false}
                onClick={() => setTheme({ showHeaderText: theme.showHeaderText === false })}
                className={`relative h-5 w-9 rounded-full transition-colors shrink-0 ${
                  theme.showHeaderText !== false ? "bg-brand-600" : "bg-muted-foreground/30"
                }`}
              >
                <span
                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                    theme.showHeaderText !== false ? "translate-x-4" : "translate-x-0.5"
                  }`}
                />
              </button>
              <span className="text-sm text-foreground">Mostrar título y subtítulo en la cabecera</span>
            </label>
            <Labeled label="Logo (opcional)">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  disabled={uploadingLogo}
                  className="group relative h-16 w-16 rounded-xl border-2 border-dashed border-border hover:border-brand-400 flex items-center justify-center overflow-hidden transition-all bg-muted/40 shrink-0 disabled:opacity-60"
                >
                  {uploadingLogo ? (
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  ) : theme.logoUrl ? (
                    <>
                      <img src={theme.logoUrl} alt="Logo" className="h-full w-full object-contain p-1" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Pencil className="h-4 w-4 text-white" />
                      </div>
                    </>
                  ) : (
                    <Upload className="h-5 w-5 text-muted-foreground group-hover:text-brand-500" />
                  )}
                </button>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => logoInputRef.current?.click()}
                      disabled={uploadingLogo}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-foreground hover:bg-muted disabled:opacity-60"
                    >
                      <Upload className="h-3.5 w-3.5" />
                      {theme.logoUrl ? "Cambiar logo" : "Subir logo"}
                    </button>
                    {theme.logoUrl && (
                      <button
                        type="button"
                        onClick={() => setTheme({ logoUrl: undefined })}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Quitar
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1.5">
                    PNG o SVG con fondo transparente. Se sube con su proporción original.
                  </p>
                </div>
                <input ref={logoInputRef} type="file" accept="image/*" onChange={onPickLogo} className="hidden" />
              </div>
            </Labeled>

            {theme.logoUrl && (
              <Labeled label="Tamaño del logo">
                <div className="inline-flex rounded-lg border border-border p-0.5 bg-muted/30">
                  {LOGO_PRESETS.map((p) => {
                    const active = logoPxOf(theme.logoSize) === p.px;
                    return (
                      <button
                        key={p.label}
                        type="button"
                        onClick={() => setTheme({ logoSize: p.px })}
                        className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-colors ${
                          active ? "bg-brand-700 text-white shadow-sm" : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </Labeled>
            )}

            <Labeled label="Espacio de la cabecera (arriba y abajo)">
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={HEADER_PY_MIN}
                  max={HEADER_PY_MAX}
                  step={2}
                  value={headerPyOf(theme.headerPaddingY)}
                  onChange={(e) => setTheme({ headerPaddingY: Number(e.target.value) })}
                  className="flex-1 accent-brand-600 cursor-pointer"
                />
                <span className="w-12 text-right text-xs font-medium text-muted-foreground tabular-nums">
                  {headerPyOf(theme.headerPaddingY)}px
                </span>
              </div>
            </Labeled>
          </Section>
        </Card>
      </div>

      {/* Vista previa */}
      <div className="xl:sticky xl:top-0">
        <p className="text-[11px] font-semibold text-muted-foreground uppercase mb-2">Vista previa</p>
        <div
          className="overflow-hidden border border-border shadow-sm"
          style={{ backgroundColor: preview.background, borderRadius: preview.radius }}
        >
          <div
            className="px-4 flex items-center gap-2.5"
            style={{
              backgroundColor: preview.primary,
              color: preview.onPrimary,
              paddingTop: preview.headerPaddingY,
              paddingBottom: preview.headerPaddingY,
            }}
          >
            {preview.logoUrl ? (
              <img
                src={preview.logoUrl}
                alt=""
                className="w-auto object-contain shrink-0"
                style={{ height: preview.logoPx }}
              />
            ) : (
              <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: "rgba(255,255,255,0.18)" }}>
                <GraduationCap className="h-4 w-4" />
              </div>
            )}
            {preview.showHeaderText && (
              <div className="min-w-0">
                <p className="text-[10px] font-medium leading-none opacity-70">{preview.title}</p>
                <p className="text-sm font-bold leading-tight truncate">{preview.subtitle || "Nombre de tu cuenta"}</p>
              </div>
            )}
          </div>
          <div className="p-3 space-y-2.5">
            <div className="bg-white shadow-sm p-3 space-y-2" style={{ borderRadius: preview.radius }}>
              <div className="h-16 w-full rounded-lg" style={{ backgroundColor: preview.primary, opacity: 0.12 }} />
              <div className="h-2.5 w-2/3 rounded bg-slate-200" />
              <div className="h-2 w-1/2 rounded bg-slate-100" />
              <button className="mt-1 text-[11px] font-semibold px-3 py-1.5 rounded-lg" style={{ backgroundColor: preview.primary, color: preview.onPrimary }}>
                Entrar al curso
              </button>
            </div>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground mt-2">
          Aproximación. Guarda los cambios para verlos en el portal real.
        </p>
      </div>
    </div>
  );
}

/* ─────────────────────────── Compartir en redes ─────────────────────────── */

const OG_ASPECT = 1200 / 630; // proporción estándar de og:image

function ShareSection({
  tenantId,
  meta,
  setMeta,
  fallbackTitle,
  portalUrl,
}: {
  tenantId: string;
  meta: PortalMeta;
  setMeta: (patch: Partial<PortalMeta>) => void;
  fallbackTitle: string;
  portalUrl: string;
}) {
  const ogInputRef = useRef<HTMLInputElement>(null);
  const [cropperSrc, setCropperSrc] = useState<string | null>(null);
  const [cropperFileName, setCropperFileName] = useState("");
  const [uploading, setUploading] = useState(false);

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCropperSrc(URL.createObjectURL(file));
    setCropperFileName(file.name);
    e.target.value = "";
  };

  const onCropped = async (cropped: File) => {
    setCropperSrc(null);
    setCropperFileName("");
    if (!tenantId) return;
    setUploading(true);
    try {
      const updated = await uploadAcademyOgImage(tenantId, cropped);
      setMeta({ ogImage: updated.meta?.ogImage });
      toast.success("Imagen de previsualización actualizada");
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "No se pudo subir la imagen");
    } finally {
      setUploading(false);
    }
  };

  const previewTitle = meta.title?.trim() || fallbackTitle;
  const previewDesc =
    meta.description?.trim() || "Accede a los cursos y sigue tu progreso.";
  const domain = (() => {
    try {
      return new URL(portalUrl).hostname.replace(/^www\./, "");
    } catch {
      return portalUrl;
    }
  })();

  return (
    <div className="space-y-6">
      <Card>
        <Section icon={Share2} title="Compartir en redes">
          <p className="text-xs text-muted-foreground -mt-1">
            Controla cómo se ve el enlace del portal al compartirlo en WhatsApp, Facebook, LinkedIn o X.
          </p>

          <Labeled label="Título al compartir">
            <input
              value={meta.title ?? ""}
              onChange={(e) => setMeta({ title: e.target.value })}
              maxLength={70}
              placeholder={fallbackTitle}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-brand-300"
            />
            <p className="text-[11px] text-muted-foreground mt-1">
              {(meta.title?.length ?? 0)}/70 · Si lo dejas vacío usamos el nombre de tu portal.
            </p>
          </Labeled>

          <Labeled label="Descripción">
            <textarea
              value={meta.description ?? ""}
              onChange={(e) => setMeta({ description: e.target.value })}
              maxLength={200}
              rows={3}
              placeholder="Breve descripción que acompaña al enlace (qué es tu portal, qué ofrece)."
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm resize-none focus:outline-none focus:border-brand-300"
            />
            <p className="text-[11px] text-muted-foreground mt-1">{(meta.description?.length ?? 0)}/200</p>
          </Labeled>

          <Labeled label="Imagen de previsualización">
            <div className="flex items-start gap-4">
              <button
                type="button"
                onClick={() => ogInputRef.current?.click()}
                disabled={uploading}
                className="group relative w-40 shrink-0 rounded-xl border-2 border-dashed border-border hover:border-brand-400 overflow-hidden transition-all bg-muted/40 disabled:opacity-60"
                style={{ aspectRatio: String(OG_ASPECT) }}
              >
                {uploading ? (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : meta.ogImage ? (
                  <>
                    <img src={meta.ogImage} alt="" className="h-full w-full object-cover" />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Pencil className="h-4 w-4 text-white" />
                    </div>
                  </>
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-muted-foreground group-hover:text-brand-500">
                    <ImageIcon className="h-5 w-5" />
                    <span className="text-[10px] font-medium">Sin imagen</span>
                  </div>
                )}
              </button>
              <div className="min-w-0 pt-1">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => ogInputRef.current?.click()}
                    disabled={uploading}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-foreground hover:bg-muted disabled:opacity-60"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    {meta.ogImage ? "Cambiar imagen" : "Subir imagen"}
                  </button>
                  {meta.ogImage && (
                    <button
                      type="button"
                      onClick={() => setMeta({ ogImage: undefined })}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Quitar
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1.5 max-w-[16rem]">
                  Proporción 1200×630 (1.91:1). La recortarás antes de subirla.
                </p>
              </div>
              <input ref={ogInputRef} type="file" accept="image/*" onChange={onPick} className="hidden" />
            </div>
          </Labeled>
        </Section>
      </Card>

      {/* Vista previa estilo tarjeta de red social */}
      <Card>
        <Section title="Vista previa del enlace">
          <div className="max-w-md rounded-xl border border-border overflow-hidden bg-card">
            <div className="bg-muted/40" style={{ aspectRatio: String(OG_ASPECT) }}>
              {meta.ogImage ? (
                <img src={meta.ogImage} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full flex items-center justify-center text-muted-foreground">
                  <ImageIcon className="h-8 w-8" />
                </div>
              )}
            </div>
            <div className="p-3 border-t border-border">
              <p className="text-[11px] uppercase text-muted-foreground tracking-wide">{domain}</p>
              <p className="text-sm font-semibold text-foreground truncate mt-0.5">{previewTitle}</p>
              <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{previewDesc}</p>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Aproximación. Cada red puede recortar o mostrar la tarjeta de forma algo distinta.
          </p>
        </Section>
      </Card>

      <AnimatePresence>
        {cropperSrc && (
          <ImageCropper
            imageSrc={cropperSrc}
            fileName={cropperFileName}
            aspect={OG_ASPECT}
            title="Recortar imagen para compartir"
            onCropComplete={onCropped}
            onCancel={() => {
              setCropperSrc(null);
              setCropperFileName("");
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─────────────────────────── Verificación ─────────────────────────── */

function VerificationSection({
  cfg,
  set,
  inboxes,
  templates,
  loadingTpl,
}: {
  cfg: AcademyConfig;
  set: (patch: Partial<AcademyConfig>) => void;
  inboxes: WhatsappInboxOption[];
  templates: WhatsappTemplateOption[];
  loadingTpl: boolean;
}) {
  const channel = cfg.verificationChannel || "both";
  const showEmail = channel === "email" || channel === "both";
  const showWhatsapp = channel === "phone" || channel === "both";
  const selectedTemplate = templates.find((t) => t.name === cfg.whatsappTemplateName);

  return (
    <div className="space-y-6 max-w-2xl">
      <Card>
        <Section icon={ShieldCheck} title="Canal de verificación">
          <Labeled label="¿Cómo verifican los participantes su acceso?">
            <DropdownSelect
              value={channel}
              onChange={(v) => set({ verificationChannel: v as AcademyConfig["verificationChannel"] })}
              options={[
                { value: "email", label: "Solo correo" },
                { value: "phone", label: "Solo WhatsApp" },
                { value: "both", label: "El participante elige" },
              ]}
            />
          </Labeled>
        </Section>
      </Card>

      {showEmail && (
        <Card>
          <Section icon={Mail} title="Plantilla de correo (código)">
            <Labeled label="Asunto">
              <input
                value={cfg.emailTemplate?.subject ?? ""}
                onChange={(e) => set({ emailTemplate: { ...cfg.emailTemplate, subject: e.target.value } })}
                placeholder="Tu código de acceso"
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-brand-300"
              />
            </Labeled>
            <Labeled label="Mensaje (usa {{code}} donde va el código)">
              <textarea
                value={cfg.emailTemplate?.body ?? ""}
                onChange={(e) => set({ emailTemplate: { ...cfg.emailTemplate, body: e.target.value } })}
                rows={4}
                placeholder={"Tu código de acceso es: {{code}}\n\nExpira en 10 minutos."}
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm resize-none focus:outline-none focus:border-brand-300"
              />
            </Labeled>
          </Section>
        </Card>
      )}

      {showWhatsapp && (
        <Card>
          <Section icon={MessageCircle} title="Plantilla de WhatsApp (código)">
            <Labeled label="Canal de WhatsApp">
              <DropdownSelect
                value={cfg.whatsappInboxId ?? ""}
                onChange={(v) => set({ whatsappInboxId: v, whatsappTemplateName: undefined })}
                options={[
                  { value: "", label: "Selecciona un canal" },
                  ...inboxes.map((i) => ({
                    value: i.id,
                    label: `${i.name}${i.connected ? "" : " (desconectado)"}`,
                  })),
                ]}
              />
            </Labeled>
            {cfg.whatsappInboxId && (
              <Labeled label="Plantilla aprobada">
                {loadingTpl ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando plantillas…
                  </div>
                ) : (
                  <DropdownSelect
                    value={cfg.whatsappTemplateName ?? ""}
                    onChange={(v) => {
                      const tpl = templates.find((t) => t.name === v);
                      set({ whatsappTemplateName: v, whatsappLanguage: tpl?.language });
                    }}
                    options={[
                      { value: "", label: "Selecciona una plantilla" },
                      ...templates.map((t) => ({ value: t.name, label: `${t.name} · ${t.category}` })),
                    ]}
                  />
                )}
              </Labeled>
            )}
            {selectedTemplate && (
              <>
                <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">
                  {selectedTemplate.bodyText}
                </p>
                <Labeled label="¿En qué variable va el código?">
                  <DropdownSelect
                    value={cfg.whatsappCodeVariable ?? "1"}
                    onChange={(v) => set({ whatsappCodeVariable: v })}
                    options={Array.from({ length: Math.max(1, selectedTemplate.variableCount) }).map((_, i) => ({
                      value: String(i + 1),
                      label: `Variable {{${i + 1}}}`,
                    }))}
                  />
                </Labeled>
              </>
            )}
          </Section>
        </Card>
      )}
    </div>
  );
}

/* ─────────────────────────── Datos de inscripción ─────────────────────────── */

function FieldsSection({
  fields,
  setFields,
  crm,
}: {
  fields: CourseEnrollmentField[];
  setFields: (f: CourseEnrollmentField[]) => void;
  crm: CrmFieldsCatalog | null;
}) {
  const crmOptions = crm
    ? [
        ...crm.system.map((f) => ({ value: f.value, label: `${f.label} (sistema)` })),
        ...crm.custom.map((f) => ({ value: f.value, label: `${f.label} (personalizado)` })),
      ]
    : [];

  return (
    <div className="max-w-2xl">
      <Card>
        <Section icon={ListChecks} title="Datos a pedir si el contacto no existe">
          <p className="text-xs text-muted-foreground -mt-1">
            Al verificarse por primera vez, se piden estos datos y se crea el contacto en el CRM.
          </p>
          {fields.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4 border border-dashed border-border rounded-lg">
              Sin campos. Añade los datos que quieres capturar.
            </p>
          )}
          {fields.map((f, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={f.label}
                onChange={(e) => setFields(fields.map((x, idx) => (idx === i ? { ...x, label: e.target.value } : x)))}
                placeholder="Etiqueta (ej. Nombre)"
                className="flex-1 px-2.5 py-1.5 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-brand-300"
              />
              <div className="w-48">
                <DropdownSelect
                  value={f.crmField || ""}
                  onChange={(v) => setFields(fields.map((x, idx) => (idx === i ? { ...x, crmField: v, key: x.key || v } : x)))}
                  options={[{ value: "", label: "Campo CRM…" }, ...crmOptions]}
                />
              </div>
              <label className="flex items-center gap-1 text-[11px] text-muted-foreground shrink-0">
                <input
                  type="checkbox"
                  checked={!!f.required}
                  onChange={(e) => setFields(fields.map((x, idx) => (idx === i ? { ...x, required: e.target.checked } : x)))}
                />
                Oblig.
              </label>
              <button onClick={() => setFields(fields.filter((_, idx) => idx !== i))} className="p-1 text-muted-foreground hover:text-red-600">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <button
            onClick={() => setFields([...fields, { key: "", label: "", crmField: "", type: "text", required: false }])}
            className="text-[11px] text-brand-600 hover:text-brand-500 inline-flex items-center gap-1"
          >
            <Plus className="h-3 w-3" /> Añadir campo
          </button>
        </Section>
      </Card>
    </div>
  );
}

/* ─────────────────────────── Primitivas ─────────────────────────── */

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-border bg-card p-5">{children}</div>;
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon?: typeof Mail;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-1.5">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {title}
      </h4>
      {children}
    </div>
  );
}

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-foreground mb-1">{label}</label>
      {children}
    </div>
  );
}
