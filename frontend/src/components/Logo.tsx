import { useBranding } from "@/context/BrandingContext";

type LogoVariant = "full" | "icon" | "dark";

interface LogoProps {
  /**
   * - "full": logo horizontal completo (default)
   * - "icon": isotipo cuadrado
   * - "dark": variante del logo para fondos oscuros
   */
  variant?: LogoVariant;
  className?: string;
  /** Sobrescribe el texto alternativo (por defecto, el nombre de la app). */
  alt?: string;
  style?: React.CSSProperties;
}

/**
 * Logo de la aplicación. Toma la URL del branding configurable por entorno
 * (ver BrandingContext), con fallback a los assets incluidos en el build.
 * Reemplaza los imports estáticos de logo dispersos por la app.
 */
export function Logo({ variant = "full", className, alt, style }: LogoProps) {
  const branding = useBranding();

  const src =
    variant === "icon"
      ? branding.iconUrl
      : variant === "dark"
        ? branding.logoDarkUrl
        : branding.logoUrl;

  return (
    <img src={src} alt={alt ?? branding.name} className={className} style={style} />
  );
}
