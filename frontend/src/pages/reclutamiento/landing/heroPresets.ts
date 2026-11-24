import { hexToHsl, hslToHex, type LandingTheme } from "./landingTheme";

/**
 * Fondos de portada generados con CSS a partir de los colores de la marca: se
 * adaptan solos a la paleta y al modo claro u oscuro, y no dependen de archivos
 * ni de licencias de terceros.
 */
export interface HeroPreset {
  id: string;
  name: string;
}

export const HERO_PRESETS: HeroPreset[] = [
  { id: "degradado", name: "Degradado" },
  { id: "aurora", name: "Aurora" },
  { id: "malla", name: "Malla" },
  { id: "atardecer", name: "Atardecer" },
  { id: "oceano", name: "Océano" },
  { id: "noche", name: "Noche" },
  { id: "rayos", name: "Rayos" },
  { id: "ondas", name: "Ondas" },
  { id: "diagonales", name: "Diagonales" },
  { id: "suave", name: "Suave" },
  { id: "luz", name: "Luz" },
  { id: "circulos", name: "Círculos" },
  { id: "puntos", name: "Puntos" },
  { id: "cuadricula", name: "Cuadrícula" },
];

/** Corre el matiz y la luminosidad de un color. */
function shift(hex: string, dh: number, dl = 0): string {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex([(h + dh + 360) % 360, s, Math.min(92, Math.max(8, l + dl))]);
}

/**
 * CSS del fondo y si el texto debe ir claro (`dark`: fondo oscuro o intenso) u
 * oscuro (`light`). Devuelve null si el diseño no existe.
 */
export function presetBackground(id: string, t: LandingTheme): { background: string; tone: "dark" | "light" } | null {
  const p = t.primary;
  const p2 = shift(p, 35);
  const p3 = shift(p, -35);
  const deep = shift(p, 0, -24);
  const night = hslToHex([hexToHsl(p)[0], 35, t.dark ? 6 : 9]);
  const adaptive = t.dark ? "dark" : "light";
  switch (id) {
    case "degradado":
      return { background: `linear-gradient(135deg, ${deep}, ${p})`, tone: "dark" };
    case "aurora":
      return {
        background: `radial-gradient(60% 80% at 15% 20%, ${p}cc, transparent 60%), radial-gradient(50% 70% at 85% 30%, ${p2}aa, transparent 60%), radial-gradient(60% 80% at 50% 110%, ${p3}99, transparent 60%), ${night}`,
        tone: "dark",
      };
    case "malla":
      return {
        background: `radial-gradient(45% 60% at 0% 0%, ${p2}, transparent 70%), radial-gradient(45% 60% at 100% 0%, ${p3}, transparent 70%), radial-gradient(60% 70% at 50% 100%, ${p}, transparent 70%), ${deep}`,
        tone: "dark",
      };
    case "atardecer":
      return { background: `linear-gradient(160deg, ${p3}, ${p}, ${p2})`, tone: "dark" };
    case "oceano":
      return { background: `linear-gradient(135deg, ${shift(p, -60, -18)}, ${shift(p, -25, -6)})`, tone: "dark" };
    case "noche":
      return { background: `radial-gradient(70% 90% at 80% 0%, ${p}88, transparent 60%), ${night}`, tone: "dark" };
    case "rayos":
      return { background: `conic-gradient(from 210deg at 70% 120%, ${deep}, ${p}, ${p2}, ${deep})`, tone: "dark" };
    case "ondas":
      return { background: `repeating-radial-gradient(circle at 0 100%, ${p}44 0 24px, transparent 24px 48px), linear-gradient(135deg, ${deep}, ${p})`, tone: "dark" };
    case "diagonales":
      return { background: `repeating-linear-gradient(45deg, #ffffff14 0 14px, transparent 14px 28px), linear-gradient(135deg, ${deep}, ${p})`, tone: "dark" };
    case "suave":
      return { background: `linear-gradient(180deg, ${t.alt}, ${t.bg})`, tone: adaptive };
    case "luz":
      return { background: `radial-gradient(80% 100% at 50% 0%, ${p}40, transparent 70%), ${t.bg}`, tone: adaptive };
    case "circulos":
      return { background: `radial-gradient(40% 60% at 10% 10%, ${p}38, transparent), radial-gradient(40% 60% at 90% 90%, ${p2}38, transparent), ${t.alt}`, tone: adaptive };
    case "puntos":
      return { background: `radial-gradient(${p}66 1.5px, transparent 1.5px) 0 0 / 22px 22px, ${t.alt}`, tone: adaptive };
    case "cuadricula":
      return {
        background: `linear-gradient(${t.border} 1px, transparent 1px) 0 0 / 32px 32px, linear-gradient(90deg, ${t.border} 1px, transparent 1px) 0 0 / 32px 32px, ${t.alt}`,
        tone: adaptive,
      };
    default:
      return null;
  }
}
