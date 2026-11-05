import { useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Award, Eye, Upload, Trash2, PenLine, Stamp, Image as ImageIcon } from "lucide-react";
import { CertificateCanvas } from "../CertificateCanvas";
import {
  uploadCertificateAsset,
  type Course,
  type CourseCertificateConfig,
  type CertificateAsset,
} from "@/services/cursos";

type AssetKind = "logo" | "signature" | "stamp";

/** Posición por defecto de cada asset (centro en %, tamaño en % del ancho). */
const ASSET_DEFAULTS: Record<AssetKind, Required<Pick<CertificateAsset, "x" | "y" | "size">>> = {
  logo: { x: 50, y: 14, size: 16 },
  signature: { x: 22, y: 80, size: 20 },
  stamp: { x: 78, y: 78, size: 18 },
};

/** Anclas rápidas de posición (fila superior / media / inferior). */
const ANCHORS: { label: string; x: number; y: number }[] = [
  { label: "↖", x: 18, y: 16 },
  { label: "↑", x: 50, y: 16 },
  { label: "↗", x: 82, y: 16 },
  { label: "←", x: 18, y: 50 },
  { label: "•", x: 50, y: 50 },
  { label: "→", x: 82, y: 50 },
  { label: "↙", x: 18, y: 84 },
  { label: "↓", x: 50, y: 84 },
  { label: "↘", x: 82, y: 84 },
];

const ACCENT_PRESETS = ["#0f766e", "#2563eb", "#7c3aed", "#db2777", "#ea580c", "#16a34a", "#0f172a"];

/**
 * Pestaña de configuración del certificado del curso. Un interruptor principal
 * activa/desactiva el certificado; al activarlo se muestra el formulario
 * completo de configuración y una vista previa en vivo.
 */
export function CertificateTab({
  course,
  onChange,
}: {
  course: Course;
  onChange: (patch: Partial<Course>) => Promise<unknown>;
}) {
  const initial: CourseCertificateConfig = course.settings?.certificate ?? {};
  const [cfg, setCfg] = useState<CourseCertificateConfig>(initial);
  const [saving, setSaving] = useState(false);

  const set = (patch: Partial<CourseCertificateConfig>) => setCfg((c) => ({ ...c, ...patch }));

  const enabled = cfg.enabled ?? false;

  // Edición de un asset concreto (logo / firma / sello).
  const setAsset = (kind: AssetKind, patch: Partial<CertificateAsset>) =>
    setCfg((c) => ({ ...c, [kind]: { ...ASSET_DEFAULTS[kind], ...(c[kind] ?? {}), ...patch } }));

  // Subida de assets. Se persiste al instante y devuelve el asset posicionado.
  const [uploading, setUploading] = useState<null | AssetKind>(null);

  const uploadAsset = async (kind: AssetKind, file: File) => {
    setUploading(kind);
    try {
      const updated = await uploadCertificateAsset(course.id, kind, file);
      const next = updated.settings?.certificate?.[kind];
      // Conservamos la edición en curso y traemos el asset recién subido.
      setCfg((c) => ({ ...c, [kind]: next }));
      toast.success("Imagen actualizada");
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "No se pudo subir la imagen");
    } finally {
      setUploading(null);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await onChange({ settings: { ...(course.settings ?? {}), certificate: cfg } });
    } finally {
      setSaving(false);
    }
  };

  const accent = cfg.accentColor || "#0f766e";

  // Datos de ejemplo para la vista previa.
  const previewData = {
    serial: "CERT-AB12-CD34",
    participantName: "Nombre del participante",
    courseName: course.name,
    tenantName: "Tu organización",
    score: 95,
    rank: 1,
    issuedAt: new Date().toISOString(),
    config: cfg,
  };

  return (
    <div className="p-5 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-6 items-start">
      {/* Columna de configuración */}
      <div className="space-y-6 max-w-xl">
        {/* Interruptor principal */}
        <div className="rounded-xl border border-border p-4 flex items-start gap-3">
          <div
            className="h-10 w-10 rounded-lg flex items-center justify-center text-white shrink-0"
            style={{ backgroundColor: enabled ? accent : "#94a3b8" }}
          >
            <Award className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">Certificado de finalización</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Se emite automáticamente cuando el participante aprueba el curso.
                </p>
              </div>
              <Toggle checked={enabled} onChange={(v) => set({ enabled: v })} accent={accent} />
            </div>
          </div>
        </div>

        {enabled && (
          <>
            <Section title="Contenido">
              <Labeled label="Título">
                <Input
                  value={cfg.title ?? ""}
                  onChange={(v) => set({ title: v })}
                  placeholder="Certificado de finalización"
                />
              </Labeled>
              <Labeled label="Texto antes del nombre">
                <Input
                  value={cfg.introText ?? ""}
                  onChange={(v) => set({ introText: v })}
                  placeholder="Se otorga el presente certificado a"
                />
              </Labeled>
              <Labeled label="Texto antes del curso">
                <Input
                  value={cfg.bodyText ?? ""}
                  onChange={(v) => set({ bodyText: v })}
                  placeholder="por haber aprobado satisfactoriamente el curso"
                />
              </Labeled>
              <Labeled label="Mensaje al pie (opcional)">
                <textarea
                  value={cfg.footerText ?? ""}
                  onChange={(e) => set({ footerText: e.target.value })}
                  rows={2}
                  placeholder="Agradecemos tu dedicación y esfuerzo."
                  className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm resize-none focus:outline-none focus:border-brand-300"
                />
              </Labeled>
            </Section>

            <Section title="Firma">
              <div className="grid grid-cols-2 gap-3">
                <Labeled label="Nombre de quien firma">
                  <Input
                    value={cfg.signatureName ?? ""}
                    onChange={(v) => set({ signatureName: v })}
                    placeholder="Ej: Ana Pérez"
                  />
                </Labeled>
                <Labeled label="Cargo">
                  <Input
                    value={cfg.signatureTitle ?? ""}
                    onChange={(v) => set({ signatureTitle: v })}
                    placeholder="Ej: Directora académica"
                  />
                </Labeled>
              </div>
              <p className="text-[11px] text-muted-foreground">
                La imagen de la firma se sube y posiciona en “Elementos gráficos”, más abajo.
              </p>
            </Section>

            <Section title="Apariencia">
              <Labeled label="Color de acento">
                <div className="flex items-center gap-2 flex-wrap">
                  {ACCENT_PRESETS.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      onClick={() => set({ accentColor: hex })}
                      className={`h-7 w-7 rounded-full ring-2 ring-offset-2 ring-offset-background transition-all ${
                        accent.toLowerCase() === hex.toLowerCase() ? "ring-foreground/40" : "ring-transparent"
                      }`}
                      style={{ backgroundColor: hex }}
                      aria-label={hex}
                    />
                  ))}
                  <input
                    value={cfg.accentColor ?? ""}
                    onChange={(e) => set({ accentColor: e.target.value })}
                    placeholder="#0f766e"
                    className="w-24 px-2 py-1.5 rounded-lg border border-border bg-background text-xs font-mono focus:outline-none focus:border-brand-300"
                  />
                </div>
              </Labeled>
            </Section>

            <Section title="Elementos gráficos">
              <p className="text-[11px] text-muted-foreground -mt-1">
                Sube cada imagen y ajusta su tamaño y posición sobre el certificado.
              </p>
              <AssetEditor
                title="Logo de la empresa"
                icon={<ImageIcon className="h-4 w-4" />}
                asset={cfg.logo}
                defaults={ASSET_DEFAULTS.logo}
                uploading={uploading === "logo"}
                onUpload={(f) => uploadAsset("logo", f)}
                onChange={(patch) => setAsset("logo", patch)}
                onRemove={() => set({ logo: undefined })}
              />
              <AssetEditor
                title="Firma"
                icon={<PenLine className="h-4 w-4" />}
                asset={cfg.signature}
                defaults={ASSET_DEFAULTS.signature}
                uploading={uploading === "signature"}
                onUpload={(f) => uploadAsset("signature", f)}
                onChange={(patch) => setAsset("signature", patch)}
                onRemove={() => set({ signature: undefined })}
                hint="PNG con fondo transparente recomendado."
              />
              <AssetEditor
                title="Sello"
                icon={<Stamp className="h-4 w-4" />}
                asset={cfg.stamp}
                defaults={ASSET_DEFAULTS.stamp}
                uploading={uploading === "stamp"}
                onUpload={(f) => uploadAsset("stamp", f)}
                onChange={(patch) => setAsset("stamp", patch)}
                onRemove={() => set({ stamp: undefined })}
                hint="PNG con fondo transparente recomendado."
              />
            </Section>

            <Section title="Datos a mostrar">
              <div className="flex flex-col gap-2">
                <Check
                  label="Mostrar la calificación obtenida"
                  checked={cfg.showScore !== false}
                  onChange={(v) => set({ showScore: v })}
                />
                <Check
                  label="Mostrar la posición en el ranking"
                  checked={cfg.showRank !== false}
                  onChange={(v) => set({ showRank: v })}
                />
                <Check
                  label="Mostrar el folio de verificación"
                  checked={cfg.showSerial !== false}
                  onChange={(v) => set({ showSerial: v })}
                />
              </div>
            </Section>
          </>
        )}

        <div className="flex justify-end pt-2 border-t border-border">
          <button
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-brand-700 hover:bg-brand-600 text-white text-xs font-medium disabled:opacity-50"
          >
            {saving && <Loader2 className="h-3 w-3 animate-spin" />}
            Guardar certificado
          </button>
        </div>
      </div>

      {/* Columna de vista previa */}
      {enabled ? (
        <div className="lg:sticky lg:top-4">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-2">
            <Eye className="h-3.5 w-3.5" /> Vista previa · A4 horizontal
          </div>
          <CertificateCanvas data={previewData} fallbackAccent={accent} />
        </div>
      ) : (
        <div className="hidden lg:flex flex-col items-center justify-center text-center rounded-2xl border-2 border-dashed border-border p-10 text-muted-foreground">
          <Award className="h-8 w-8 mb-2 opacity-50" />
          <p className="text-sm font-medium">Certificado desactivado</p>
          <p className="text-xs mt-1 max-w-[16rem]">
            Actívalo para configurar y previsualizar el certificado de este curso.
          </p>
        </div>
      )}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  accent,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  accent: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0"
      style={{ backgroundColor: checked ? accent : "#cbd5e1" }}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function Check({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function Input({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-brand-300"
    />
  );
}

/**
 * Editor de un elemento gráfico del certificado: subida de imagen + controles
 * sencillos de tamaño (slider) y posición (anclas rápidas + ajuste fino X/Y).
 */
function AssetEditor({
  title,
  icon,
  asset,
  defaults,
  uploading,
  onUpload,
  onChange,
  onRemove,
  hint,
}: {
  title: string;
  icon: React.ReactNode;
  asset?: CertificateAsset;
  defaults: { x: number; y: number; size: number };
  uploading: boolean;
  onUpload: (file: File) => void;
  onChange: (patch: Partial<CertificateAsset>) => void;
  onRemove: () => void;
  hint?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const hasImage = !!asset?.url;
  const size = asset?.size ?? defaults.size;
  const x = asset?.x ?? defaults.x;
  const y = asset?.y ?? defaults.y;

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) onUpload(file);
  };

  return (
    <div className="rounded-xl border border-border p-3 space-y-3">
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="group relative h-16 w-24 shrink-0 rounded-lg border-2 border-dashed border-border hover:border-brand-400 overflow-hidden bg-muted/40 transition-all disabled:opacity-60"
        >
          {uploading ? (
            <div className="absolute inset-0 flex items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : hasImage ? (
            <img src={asset!.url} alt="" className="h-full w-full object-contain p-1.5" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground group-hover:text-brand-500">
              {icon}
            </div>
          )}
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-foreground">{title}</p>
          <div className="flex items-center gap-2 mt-1.5">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-border text-[11px] font-medium text-foreground hover:bg-muted disabled:opacity-60"
            >
              <Upload className="h-3 w-3" />
              {hasImage ? "Cambiar" : "Subir"}
            </button>
            {hasImage && (
              <button
                type="button"
                onClick={onRemove}
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border border-red-200 text-red-600 text-[11px] font-medium hover:bg-red-50"
              >
                <Trash2 className="h-3 w-3" /> Quitar
              </button>
            )}
          </div>
          {hint && <p className="text-[11px] text-muted-foreground mt-1">{hint}</p>}
        </div>
      </div>

      {hasImage && (
        <div className="space-y-3 pt-1">
          {/* Tamaño */}
          <Slider label="Tamaño" value={size} min={4} max={50} suffix="%" onChange={(v) => onChange({ size: v })} />

          {/* Posición: anclas rápidas */}
          <div>
            <p className="text-[11px] font-medium text-foreground mb-1">Posición</p>
            <div className="flex items-start gap-3">
              <div className="grid grid-cols-3 gap-1 shrink-0">
                {ANCHORS.map((a) => {
                  const active = Math.abs(a.x - x) < 2 && Math.abs(a.y - y) < 2;
                  return (
                    <button
                      key={a.label}
                      type="button"
                      onClick={() => onChange({ x: a.x, y: a.y })}
                      className={`h-6 w-6 rounded-md border text-xs leading-none transition-colors ${
                        active
                          ? "border-brand-500 bg-brand-50 text-brand-700"
                          : "border-border text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {a.label}
                    </button>
                  );
                })}
              </div>
              <div className="flex-1 space-y-2">
                <Slider label="Horizontal" value={x} min={0} max={100} onChange={(v) => onChange({ x: v })} />
                <Slider label="Vertical" value={y} min={0} max={100} onChange={(v) => onChange({ y: v })} />
              </div>
            </div>
          </div>
        </div>
      )}

      <input ref={inputRef} type="file" accept="image/*" onChange={onPick} className="hidden" />
    </div>
  );
}

/** Slider sencillo con etiqueta y valor. */
function Slider({
  label,
  value,
  min,
  max,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[11px] text-muted-foreground w-16 shrink-0">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        value={Math.round(value)}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 accent-brand-600"
      />
      <span className="text-[11px] font-mono text-foreground w-10 text-right">
        {Math.round(value)}
        {suffix ?? ""}
      </span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase">{title}</h4>
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
