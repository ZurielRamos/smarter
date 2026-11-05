import { Award, Download, Link as LinkIcon, Check } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import type { CertificateAsset, CourseCertificateConfig } from "@/services/cursos";

/** Datos mínimos que necesita el lienzo del certificado. */
export interface CertificateData {
  serial: string;
  participantName: string;
  courseName: string;
  tenantName: string;
  score: number;
  rank: number | null;
  issuedAt: string;
  config?: CourseCertificateConfig | null;
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("es", { day: "2-digit", month: "long", year: "numeric" });
  } catch {
    return iso;
  }
}

/**
 * Lienzo del certificado. Se renderiza con la configuración del curso (título,
 * textos, firma, logo, acento y qué métricas mostrar), con valores por defecto
 * cuando la config no está definida. `fallbackAccent` es el color del tema del
 * portal, usado si el certificado no define un `accentColor` propio.
 */
export function CertificateCanvas({
  data,
  fallbackAccent,
  printable = true,
}: {
  data: CertificateData;
  fallbackAccent: string;
  /** Si es false, no lleva el id usado por la impresión (para miniaturas). */
  printable?: boolean;
}) {
  const cfg = data.config ?? {};
  const accent = cfg.accentColor || fallbackAccent;
  const title = cfg.title?.trim() || "Certificado de finalización";
  const intro = cfg.introText?.trim() || "Se otorga el presente certificado a";
  const body = cfg.bodyText?.trim() || "por haber aprobado satisfactoriamente el curso";
  const footer = cfg.footerText?.trim();
  const showScore = cfg.showScore !== false;
  const showRank = cfg.showRank !== false && data.rank != null;
  const showSerial = cfg.showSerial !== false;

  // Resolución de assets posicionables (con compatibilidad hacia los campos
  // antiguos logoUrl/signatureImageUrl).
  const logo = resolveAsset(cfg.logo, cfg.logoUrl, { x: 50, y: 14, size: 16 });
  const signature = resolveAsset(cfg.signature, cfg.signatureImageUrl, { x: 22, y: 80, size: 20 });
  const stamp = resolveAsset(cfg.stamp, undefined, { x: 78, y: 78, size: 18 });

  return (
    <div
      id={printable ? "certificate-canvas" : undefined}
      className="relative bg-white rounded-2xl shadow-2xl overflow-hidden w-full"
      style={{
        border: `6px solid ${accent}`,
        aspectRatio: "297 / 210",
        containerType: "inline-size",
      }}
    >
      {/* Capa de contenido textual, centrada. */}
      <div className="h-full w-full flex flex-col items-center justify-center text-center px-[7%] py-[7%]">
        {!logo && (
          // Marca por defecto cuando no hay logo subido.
          <div
            className="rounded-2xl flex items-center justify-center mb-[2.5%] text-white"
            style={{ backgroundColor: accent, width: "7%", aspectRatio: "1" }}
          >
            <Award className="h-1/2 w-1/2" />
          </div>
        )}

        <p className="uppercase tracking-[0.3em] text-slate-400 font-semibold text-[1.6cqw]">{title}</p>

        <p className="text-slate-500 mt-[3%] text-[1.6cqw]">{intro}</p>
        <h2 className="font-bold text-slate-900 mt-[0.8%] text-[3.4cqw]">{data.participantName}</h2>

        <p className="text-slate-500 mt-[3%] text-[1.6cqw]">{body}</p>
        <h3 className="font-semibold mt-[0.6%] text-[2.4cqw]" style={{ color: accent }}>
          {data.courseName}
        </h3>

        {(showScore || showRank) && (
          <div className="flex items-center justify-center gap-[6%] mt-[4%]">
            {showScore && (
              <div>
                <p className="font-bold text-slate-900 text-[2.8cqw]">{data.score.toFixed(1)}</p>
                <p className="text-slate-400 uppercase tracking-wide text-[1.1cqw]">Calificación</p>
              </div>
            )}
            {showRank && (
              <div>
                <p className="font-bold text-slate-900 text-[2.8cqw]">#{data.rank}</p>
                <p className="text-slate-400 uppercase tracking-wide text-[1.1cqw]">Ranking</p>
              </div>
            )}
          </div>
        )}

        {footer && <p className="text-slate-500 mt-[3.5%] max-w-[60%] text-[1.5cqw]">{footer}</p>}
      </div>

      {/* Pie fijo: datos de firma (texto) y folio, en las esquinas inferiores. */}
      <div className="absolute inset-x-[7%] bottom-[5%] flex items-end justify-between gap-4 text-left pointer-events-none">
        <div>
          {cfg.signatureName?.trim() ? (
            <>
              <p className="font-semibold text-slate-800 border-t border-slate-300 pt-1 inline-block text-[1.6cqw]">
                {cfg.signatureName}
              </p>
              {cfg.signatureTitle?.trim() && (
                <p className="text-slate-400 text-[1.2cqw]">{cfg.signatureTitle}</p>
              )}
              <p className="text-slate-400 mt-1 text-[1.2cqw]">{data.tenantName}</p>
            </>
          ) : (
            <>
              <p className="font-semibold text-slate-800 text-[1.6cqw]">{data.tenantName}</p>
              <p className="text-slate-400 text-[1.2cqw]">Emitido el {fmtDate(data.issuedAt)}</p>
            </>
          )}
        </div>
        {showSerial && (
          <div className="text-right">
            <p className="text-slate-400 uppercase tracking-wide text-[1cqw]">Folio de verificación</p>
            <p className="font-mono font-semibold text-slate-700 text-[1.5cqw]">{data.serial}</p>
          </div>
        )}
      </div>

      {/* Capa de imágenes posicionables (logo, firma, sello). */}
      {logo && <AssetImage asset={logo} />}
      {signature && <AssetImage asset={signature} />}
      {stamp && <AssetImage asset={stamp} />}
    </div>
  );
}

/** Normaliza un asset: si no tiene URL (ni la legacy), devuelve null. */
function resolveAsset(
  asset: CertificateAsset | undefined,
  legacyUrl: string | undefined,
  defaults: { x: number; y: number; size: number },
): Required<CertificateAsset> | null {
  const url = asset?.url || legacyUrl;
  if (!url) return null;
  if (asset?.visible === false) return null;
  return {
    url,
    x: asset?.x ?? defaults.x,
    y: asset?.y ?? defaults.y,
    size: asset?.size ?? defaults.size,
    visible: true,
  };
}

/** Imagen posicionada en el lienzo (centrada en x/y, ancho en % del lienzo). */
function AssetImage({ asset }: { asset: Required<CertificateAsset> }) {
  return (
    <img
      src={asset.url}
      alt=""
      className="absolute object-contain -translate-x-1/2 -translate-y-1/2 pointer-events-none"
      style={{
        left: `${asset.x}%`,
        top: `${asset.y}%`,
        width: `${asset.size}%`,
      }}
    />
  );
}

/** Botón circular para compartir en una red social. */
function ShareButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="h-10 w-10 rounded-full bg-white ring-1 ring-slate-200 text-slate-700 hover:bg-slate-50 hover:ring-slate-300 flex items-center justify-center transition-colors"
    >
      {children}
    </button>
  );
}

/**
 * Barra de acciones del certificado: compartir en redes (izquierda) y
 * descargar + copiar enlace (derecha). Reutilizable en la card (modo `compact`,
 * solo iconos) y en el modal (con etiquetas).
 *
 * En `compact`, "Descargar" normalmente abre la vista previa (vía
 * `onRequestDownload`) porque la impresión necesita el lienzo imprimible del
 * modal; sin override, imprime directamente.
 */
export function CertificateActions({
  data,
  fallbackAccent,
  compact = false,
  shareLabelColor = "muted",
  onRequestDownload,
}: {
  data: CertificateData;
  fallbackAccent: string;
  compact?: boolean;
  shareLabelColor?: "light" | "muted";
  onRequestDownload?: () => void;
}) {
  const accent = data.config?.accentColor || fallbackAccent;
  const verifyUrl = `${window.location.origin}/cursos/certificates/verify/${data.serial}`;
  const [copied, setCopied] = useState(false);

  const shareText = `He obtenido mi certificado del curso "${data.courseName}" en ${data.tenantName}.`;
  const encodedUrl = encodeURIComponent(verifyUrl);
  const encodedText = encodeURIComponent(shareText);

  const shareLinks = {
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
    x: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedText}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
  };

  const openShare = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer,width=640,height=640");
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(verifyUrl);
      setCopied(true);
      toast.success("Enlace del certificado copiado");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("No se pudo copiar el enlace");
    }
  };

  const download = () => (onRequestDownload ? onRequestDownload() : window.print());

  // Evita que el click en una acción dispare el onClick del contenedor (card).
  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };

  if (compact) {
    return (
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <IconButton label="Compartir en LinkedIn" onClick={stop(() => openShare(shareLinks.linkedin))}>
            <LinkedInIcon />
          </IconButton>
          <IconButton label="Compartir en X" onClick={stop(() => openShare(shareLinks.x))}>
            <XIcon />
          </IconButton>
          <IconButton label="Compartir en Facebook" onClick={stop(() => openShare(shareLinks.facebook))}>
            <FacebookIcon />
          </IconButton>
        </div>
        <div className="flex items-center gap-1.5">
          <IconButton label={copied ? "Enlace copiado" : "Copiar enlace"} onClick={stop(copyLink)}>
            {copied ? <Check className="h-[18px] w-[18px] text-green-600" /> : <LinkIcon className="h-[18px] w-[18px] text-slate-600" />}
          </IconButton>
          <IconButton label="Descargar" onClick={stop(download)} style={{ backgroundColor: accent, borderColor: accent }}>
            <Download className="h-[18px] w-[18px] text-white" />
          </IconButton>
        </div>
      </div>
    );
  }

  const shareLabelCls = shareLabelColor === "light" ? "text-white/80" : "text-slate-500";
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {/* Izquierda: compartir en redes sociales. */}
      <div className="flex items-center gap-2">
        <span className={`text-xs font-medium mr-0.5 hidden sm:inline ${shareLabelCls}`}>Compartir</span>
        <ShareButton label="Compartir en LinkedIn" onClick={() => openShare(shareLinks.linkedin)}>
          <LinkedInIcon />
        </ShareButton>
        <ShareButton label="Compartir en X" onClick={() => openShare(shareLinks.x)}>
          <XIcon />
        </ShareButton>
        <ShareButton label="Compartir en Facebook" onClick={() => openShare(shareLinks.facebook)}>
          <FacebookIcon />
        </ShareButton>
      </div>

      {/* Derecha: copiar enlace y descargar. */}
      <div className="flex items-center gap-2">
        <button
          onClick={copyLink}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white ring-1 ring-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors"
        >
          {copied ? <Check className="h-4 w-4 text-green-600" /> : <LinkIcon className="h-4 w-4" />}
          {copied ? "Copiado" : "Copiar enlace"}
        </button>
        <button
          onClick={download}
          style={{ backgroundColor: accent }}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-sm font-semibold shadow-sm hover:brightness-110 transition-all"
        >
          <Download className="h-4 w-4" /> Descargar
        </button>
      </div>
    </div>
  );
}

/** Botón-ícono compacto (para la barra de acciones de la card). */
function IconButton({
  label,
  onClick,
  style,
  children,
}: {
  label: string;
  onClick: (e: React.MouseEvent) => void;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      style={style}
      className="h-8 w-8 rounded-lg bg-white ring-1 ring-slate-200 hover:bg-slate-50 hover:ring-slate-300 flex items-center justify-center transition-colors"
    >
      {children}
    </button>
  );
}

/* Logos de marca como SVG inline (lucide no incluye iconos de marca). */

function LinkedInIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="#0A66C2" aria-hidden="true">
      <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.8 0 0 .78 0 1.74v20.52C0 23.22.8 24 1.77 24h20.45c.98 0 1.78-.78 1.78-1.74V1.74C24 .78 23.2 0 22.22 0z" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[16px] w-[16px]" fill="#000000" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.66l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="#1877F2" aria-hidden="true">
      <path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07c0 6.02 4.39 11.01 10.13 11.93v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.08 24 18.09 24 12.07z" />
    </svg>
  );
}

/** Modal reutilizable con el lienzo + acciones (imprimir / verificar / cerrar). */
export function CertificateModal({
  data,
  fallbackAccent,
  onClose,
}: {
  data: CertificateData;
  fallbackAccent: string;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Al imprimir, ocultamos todo menos el lienzo del certificado y usamos
          una página A4 horizontal que el lienzo ocupa por completo. */}
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 0; }
          html, body {
            margin: 0 !important; padding: 0 !important;
            width: 297mm !important; height: 210mm !important;
            overflow: hidden !important;
          }
          body * { visibility: hidden !important; }
          #certificate-canvas, #certificate-canvas * { visibility: visible !important; }
          #certificate-canvas {
            position: fixed !important; top: 0 !important; left: 0 !important;
            margin: 0 !important;
            /* Tamaño exacto de la hoja; el borde entra en el cálculo (border-box)
               para no desbordar hacia una segunda página. */
            width: 297mm !important; height: 210mm !important;
            box-sizing: border-box !important;
            aspect-ratio: auto !important;
            overflow: hidden !important;
            border-radius: 0 !important; box-shadow: none !important;
            /* Evita que el navegador parta el certificado en dos páginas. */
            page-break-before: avoid !important;
            page-break-after: avoid !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
        }
      `}</style>
      <div className="absolute inset-0 bg-slate-900/50 animate-in fade-in duration-150" onClick={onClose} />
      <div className="relative w-full max-w-3xl animate-in zoom-in-95 fade-in duration-200">
        <CertificateCanvas data={data} fallbackAccent={fallbackAccent} />

        <div className="mt-4 print:hidden">
          <CertificateActions data={data} fallbackAccent={fallbackAccent} shareLabelColor="light" />
        </div>

        {/* Cerrar (discreto, arriba a la derecha del modal). */}
        <button
          onClick={onClose}
          aria-label="Cerrar"
          className="absolute -top-3 -right-3 h-8 w-8 rounded-full bg-white shadow-md ring-1 ring-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center print:hidden"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
