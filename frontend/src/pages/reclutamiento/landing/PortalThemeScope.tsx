import { useEffect, useMemo, type ReactNode } from "react";
import type { LandingConfig } from "@/services/reclutamiento";
import { buildTheme, resolveDark, useSystemDark } from "./landingTheme";

/**
 * Aplica el tema de la landing (color de marca y modo claro u oscuro) a todo el
 * portal público: acceso, registro, datos, documentos y contratos. Sin landing
 * publicada no hace nada y el portal usa el tema normal de la aplicación.
 */
export function PortalThemeScope({ landing, children }: { landing: LandingConfig | null; children: ReactNode }) {
  const systemDark = useSystemDark();
  const brandColor = landing?.brand.primaryColor;
  const appearance = landing?.brand.appearance;
  const theme = useMemo(
    () => (brandColor && appearance ? buildTheme(brandColor, resolveDark(appearance, systemDark)) : null),
    [brandColor, appearance, systemDark],
  );
  const dark = theme?.dark;

  // Las variantes `dark:` de Tailwind miran la clase de <html>: se ajusta mientras el portal está abierto y se restaura al salir.
  useEffect(() => {
    if (dark === undefined) return;
    const root = document.documentElement;
    const wasDark = root.classList.contains("dark");
    root.classList.toggle("dark", dark);
    root.style.colorScheme = dark ? "dark" : "light";
    return () => {
      root.classList.toggle("dark", wasDark);
      root.style.colorScheme = wasDark ? "dark" : "light";
    };
  }, [dark]);

  if (!theme) return <>{children}</>;
  return (
    <div style={{ ...theme.vars, colorScheme: theme.dark ? "dark" : "light" } as React.CSSProperties} className="min-h-screen bg-background text-foreground">
      {children}
    </div>
  );
}
