import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

// Assets por defecto incluidos en el build. Sirven de fallback cuando el
// backend no define las variables de branding (APP_LOGO_URL, etc.), de modo que
// la UI nunca queda sin logo.
import defaultLogo from "@/assets/logo.svg";
import defaultLogoDark from "@/assets/logo-completo-dark.svg";
import defaultIcon from "@/assets/icon.svg";

/**
 * Branding configurable por entorno (white-label).
 *
 * El frontend se buildea dentro del Dockerfile, así que las variables VITE_* se
 * hornean en build time y no sirven para cambiar el branding en runtime. En su
 * lugar, el backend expone GET /api/branding leyendo sus propias env vars
 * (APP_NAME, APP_LOGO_URL, ...), y aquí las consumimos al arrancar. Cambiar el
 * nombre/logo = cambiar el entorno del contenedor y reiniciar, sin rebuild.
 */
export interface Branding {
  name: string;
  title: string;
  /** Logo horizontal completo (header, login). */
  logoUrl: string;
  /** Variante para fondos oscuros. */
  logoDarkUrl: string;
  /** Ícono/isotipo cuadrado. */
  iconUrl: string;
  /** Favicon (puede ser null; entonces se respeta el del index.html). */
  faviconUrl: string | null;
}

const DEFAULT_BRANDING: Branding = {
  name: "Smarter",
  title: "Smarter | Reach further, connect better",
  logoUrl: defaultLogo,
  logoDarkUrl: defaultLogoDark,
  iconUrl: defaultIcon,
  faviconUrl: null,
};

const API_URL = import.meta.env.VITE_API_URL || "/api";

const BrandingContext = createContext<Branding>(DEFAULT_BRANDING);

function updateFavicon(href: string) {
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    document.head.appendChild(link);
  }
  link.href = href;
}

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [branding, setBranding] = useState<Branding>(DEFAULT_BRANDING);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`${API_URL}/branding`);
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled) return;

        // Fusionamos con los defaults: cualquier campo vacío/null del backend
        // conserva el asset o texto por defecto.
        const merged: Branding = {
          name: data.name || DEFAULT_BRANDING.name,
          title: data.title || DEFAULT_BRANDING.title,
          logoUrl: data.logoUrl || DEFAULT_BRANDING.logoUrl,
          logoDarkUrl:
            data.logoDarkUrl || data.logoUrl || DEFAULT_BRANDING.logoDarkUrl,
          iconUrl: data.iconUrl || DEFAULT_BRANDING.iconUrl,
          faviconUrl: data.faviconUrl || null,
        };
        setBranding(merged);
      } catch {
        // Sin red / backend caído: nos quedamos con los defaults.
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Sincroniza el título de la pestaña y el favicon con el branding activo.
  useEffect(() => {
    document.title = branding.title;
    if (branding.faviconUrl) {
      updateFavicon(branding.faviconUrl);
    }
  }, [branding.title, branding.faviconUrl]);

  return (
    <BrandingContext.Provider value={branding}>
      {children}
    </BrandingContext.Provider>
  );
}

export function useBranding(): Branding {
  return useContext(BrandingContext);
}
