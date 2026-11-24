import { useEffect, useState } from "react";
import type { LandingAppearance } from "@/services/reclutamiento";

/** Paletas listas para elegir. Cada una es solo un color de marca: el resto del sitio se deriva de él. */
export const PALETTES: Array<{ id: string; name: string; color: string }> = [
  { id: "azul", name: "Azul", color: "#2563eb" },
  { id: "indigo", name: "Índigo", color: "#4f46e5" },
  { id: "violeta", name: "Violeta", color: "#7c3aed" },
  { id: "rosa", name: "Rosa", color: "#db2777" },
  { id: "rojo", name: "Rojo", color: "#dc2626" },
  { id: "naranja", name: "Naranja", color: "#ea580c" },
  { id: "ambar", name: "Ámbar", color: "#d97706" },
  { id: "verde", name: "Verde", color: "#16a34a" },
  { id: "esmeralda", name: "Esmeralda", color: "#059669" },
  { id: "turquesa", name: "Turquesa", color: "#0d9488" },
  { id: "cian", name: "Cian", color: "#0891b2" },
  { id: "pizarra", name: "Pizarra", color: "#334155" },
];

type Hsl = [number, number, number];

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export function hexToHsl(hex: string): Hsl {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l * 100];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [(h * 60 + 360) % 360, s * 100, l * 100];
}

export function hslToHex([h, s, l]: Hsl): string {
  const sat = s / 100;
  const lig = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(lig, 1 - lig);
  const f = (n: number) => lig - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const to = (x: number) => Math.round(x * 255).toString(16).padStart(2, "0");
  return `#${to(f(0))}${to(f(8))}${to(f(4))}`;
}

const triple = ([h, s, l]: Hsl) => `${Math.round(h)} ${Math.round(s)}% ${Math.round(l)}%`;

/** Luminancia relativa (WCAG) de un color hexadecimal. */
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export const isHexColor = (v: string) => /^#[0-9a-fA-F]{6}$/.test(v);

export interface LandingTheme {
  dark: boolean;
  /** Color de marca para fondos de botones y bandas. */
  primary: string;
  /** Texto legible sobre `primary`. */
  onPrimary: string;
  /** Color de marca para texto e iconos sobre el fondo (con contraste suficiente). */
  accent: string;
  bg: string;
  /** Fondo alterno de las secciones, con un tinte de la marca. */
  alt: string;
  /** Tarjetas y paneles. */
  surface: string;
  text: string;
  muted: string;
  border: string;
  /** Tinte suave de la marca para insignias e iconos. */
  soft: string;
  /** Variables CSS del tema de la aplicación (formato «H S% L%») y la escala `brand`, para aplicar el tema al resto del portal. */
  vars: Record<string, string>;
}

/**
 * Deriva todos los colores del sitio a partir del color de marca y del modo.
 * Los neutros toman el matiz de la marca para que fondos, bordes y textos
 * combinen con ella; el color de marca se ajusta solo donde hace falta contraste.
 */
export function buildTheme(primaryHex: string, dark: boolean): LandingTheme {
  const base = isHexColor(primaryHex) ? primaryHex : PALETTES[0].color;
  const [h, s, l] = hexToHsl(base);
  const sN = clamp(s * 0.35, 8, 26);

  // Relleno de marca: en oscuro no puede perderse contra el fondo.
  const fill: Hsl = dark && l < 42 ? [h, s, 48] : [h, s, l];
  const primary = hslToHex(fill);
  // Texto sobre el botón: el de mayor contraste entre blanco y casi negro.
  const lp = luminance(primary);
  const onPrimary = (1.05) / (lp + 0.05) >= (lp + 0.05) / (luminance("#111827") + 0.05) ? "#ffffff" : "#111827";
  const accent = hslToHex(dark ? [h, s, Math.max(l, 64)] : [h, s, Math.min(l, 44)]);

  const n = dark
    ? {
        bg: [h, sN, 7] as Hsl,
        alt: [h, sN, 10] as Hsl,
        surface: [h, sN, 13] as Hsl,
        text: [h, sN, 94] as Hsl,
        muted: [h, Math.max(sN - 6, 6), 66] as Hsl,
        border: [h, sN, 22] as Hsl,
      }
    : {
        bg: [h, 0, 100] as Hsl,
        alt: [h, clamp(sN + 30, 30, 70), 96] as Hsl,
        surface: [h, 0, 100] as Hsl,
        text: [h, sN + 10, 13] as Hsl,
        muted: [h, sN, 32] as Hsl,
        border: [h, sN + 6, 89] as Hsl,
      };

  // Escala `brand` de la aplicación: 600 es el color de marca (con luminosidad acotada para texto blanco encima).
  const anchor = clamp(l, 28, 52);
  const shade = (delta: number): Hsl => [h, clamp(s, 35, 90), clamp(anchor + delta, 6, 97)];
  const brand: Record<string, Hsl> = {
    "50": shade(46 + (anchor > 45 ? -2 : 0)),
    "100": shade(40),
    "200": shade(30),
    "300": shade(20),
    "400": shade(10),
    "500": shade(4),
    "600": shade(0),
    "700": shade(-7),
    "800": shade(-14),
    "900": shade(-22),
  };
  brand["50"][2] = clamp(brand["50"][2], 94, 97);
  brand["100"][2] = clamp(brand["100"][2], 88, 94);

  const vars: Record<string, string> = {
    "--background": triple(n.bg),
    "--foreground": triple(n.text),
    "--card": triple(n.surface),
    "--card-foreground": triple(n.text),
    "--popover": triple(n.surface),
    "--popover-foreground": triple(n.text),
    "--secondary": triple(n.alt),
    "--secondary-foreground": triple(n.text),
    "--muted": triple(n.alt),
    "--muted-foreground": triple(n.muted),
    "--border": triple(n.border),
    "--input": triple(n.border),
    "--primary": triple(fill),
    "--primary-foreground": onPrimary === "#ffffff" ? "0 0% 100%" : "222 47% 11%",
    "--ring": triple(fill),
  };
  for (const [k, v] of Object.entries(brand)) vars[`--color-brand-${k}`] = hslToHex(v);

  return {
    dark,
    primary,
    onPrimary,
    accent,
    bg: hslToHex(n.bg),
    alt: hslToHex(n.alt),
    surface: hslToHex(n.surface),
    text: hslToHex(n.text),
    muted: hslToHex(n.muted),
    border: hslToHex(n.border),
    soft: `hsl(${Math.round(h)} ${Math.round(s)}% ${Math.round(fill[2])}% / ${dark ? 0.18 : 0.12})`,
    vars,
  };
}

/** ¿El dispositivo de quien visita prefiere el modo oscuro? Se actualiza si cambia. */
export function useSystemDark(): boolean {
  const [dark, setDark] = useState(() => typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setDark(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);
  return dark;
}

/** Modo efectivo a partir de la preferencia de la cuenta y del dispositivo. */
export function resolveDark(appearance: LandingAppearance, systemDark: boolean): boolean {
  return appearance === "auto" ? systemDark : appearance === "dark";
}
