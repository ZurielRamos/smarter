/** Clases de los controles sobre la banda oscura, iguales a las de Contactos. */
export const glassButton =
  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
export const glassGroup = "flex items-center rounded-lg bg-white/10 p-0.5";
export const glassSegment = (active: boolean) =>
  `flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
    active ? "bg-white/20 text-white" : "text-white/60 hover:text-white/80"
  }`;
export const glassInput =
  "h-8 rounded-lg bg-white/10 text-sm text-white placeholder:text-white/50 focus:bg-white/20 focus:outline-none";
