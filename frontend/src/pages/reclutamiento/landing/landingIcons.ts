import {
  Accessibility, Activity, Anchor, Award, Baby, Banknote, BarChart3, BadgeCheck, Bell, Bike, BookOpen, Bookmark, Briefcase, Building2, Bus,
  CalendarCheck, CalendarDays, Camera, Car, Check, CheckCircle2, ClipboardCheck, ClipboardList, Clock, Cloud, Code, Coffee, Coins, Compass,
  Cpu, CreditCard, Crown, Database, Dumbbell, FileCheck, FileSignature, FileText, Fingerprint, Flag, Flame, Folder, Gift, Globe,
  GraduationCap, Hand, Handshake, Heart, HeartHandshake, HeartPulse, Home, Hourglass, Key, Languages, Laptop, Layers, Leaf, Lightbulb, Link,
  Lock, Mail, Map as MapIcon, MapPin, Medal, Megaphone, MessageCircle, Mic, Monitor, Moon, Mountain, Music, Navigation, Newspaper, Package, Palette,
  Pencil, Percent, Phone, PiggyBank, Plane, Puzzle, QrCode, Receipt, Rocket, Search, Settings, Share2, Shield, ShieldCheck, ShoppingBag,
  ShoppingCart, Shuffle, SlidersHorizontal, Smartphone, Smile, Sparkles, Star, Stethoscope, Store, Sun, Sunrise, Tag, Target, ThumbsUp,
  Timer, TreePine, TrendingUp, Trophy, Truck, User, UserCheck, UserPlus, Users, Utensils, Video, Wallet, Wifi, Wrench, Zap,
  type LucideIcon,
} from "lucide-react";

export interface LandingIcon {
  id: string;
  label: string;
  /** Palabras con las que la gente busca este icono (en español, sin tildes). */
  keywords: string;
  Icon: LucideIcon;
}

/**
 * Biblioteca de iconos para la landing. Es una selección (no todo el paquete)
 * para que la página pública cargue solo lo que usa. El contenido guarda el
 * `id`; uno desconocido se muestra como una marca de verificación.
 */
export const LANDING_ICONS: LandingIcon[] = [
  // Trabajo y dinero
  { id: "briefcase", label: "Maletín", keywords: "trabajo empleo oficina profesional negocio", Icon: Briefcase },
  { id: "wallet", label: "Billetera", keywords: "pagos dinero cartera cobrar", Icon: Wallet },
  { id: "banknote", label: "Billete", keywords: "dinero efectivo pago salario", Icon: Banknote },
  { id: "coins", label: "Monedas", keywords: "dinero ingresos ganar", Icon: Coins },
  { id: "piggy-bank", label: "Alcancía", keywords: "ahorro dinero ahorrar", Icon: PiggyBank },
  { id: "credit-card", label: "Tarjeta", keywords: "pago tarjeta banco dinero", Icon: CreditCard },
  { id: "receipt", label: "Recibo", keywords: "factura comprobante pago dinero", Icon: Receipt },
  { id: "percent", label: "Porcentaje", keywords: "descuento comision tarifa", Icon: Percent },
  { id: "trending-up", label: "Crecimiento", keywords: "progreso mejorar subir ingresos dinero", Icon: TrendingUp },
  { id: "bar-chart", label: "Estadísticas", keywords: "grafico resultados datos metricas", Icon: BarChart3 },
  { id: "gift", label: "Regalo", keywords: "bono incentivo premio beneficio", Icon: Gift },
  { id: "award", label: "Premio", keywords: "reconocimiento logro certificado", Icon: Award },
  { id: "trophy", label: "Trofeo", keywords: "ganador logro competencia", Icon: Trophy },
  { id: "medal", label: "Medalla", keywords: "reconocimiento logro", Icon: Medal },
  { id: "star", label: "Estrella", keywords: "favorito calidad destacado", Icon: Star },
  { id: "crown", label: "Corona", keywords: "premium mejor lider", Icon: Crown },
  // Tiempo
  { id: "clock", label: "Reloj", keywords: "horario tiempo flexible hora", Icon: Clock },
  { id: "timer", label: "Temporizador", keywords: "tiempo rapido minutos cronometro", Icon: Timer },
  { id: "hourglass", label: "Reloj de arena", keywords: "espera tiempo plazo", Icon: Hourglass },
  { id: "calendar", label: "Calendario", keywords: "fecha dias agenda programar", Icon: CalendarDays },
  { id: "calendar-check", label: "Calendario con visto", keywords: "cita agenda confirmado disponibilidad", Icon: CalendarCheck },
  { id: "zap", label: "Rayo", keywords: "rapido energia veloz inmediato", Icon: Zap },
  { id: "rocket", label: "Cohete", keywords: "inicio lanzamiento crecer rapido", Icon: Rocket },
  { id: "sunrise", label: "Amanecer", keywords: "manana comenzar nuevo", Icon: Sunrise },
  // Personas
  { id: "users", label: "Equipo", keywords: "personas grupo comunidad gente", Icon: Users },
  { id: "user", label: "Persona", keywords: "usuario perfil individuo", Icon: User },
  { id: "user-check", label: "Persona verificada", keywords: "perfil aprobado registro", Icon: UserCheck },
  { id: "user-plus", label: "Nueva persona", keywords: "registro unirse invitar sumar", Icon: UserPlus },
  { id: "handshake", label: "Acuerdo", keywords: "trato alianza confianza contrato", Icon: Handshake },
  { id: "heart-handshake", label: "Alianza", keywords: "apoyo confianza colaboracion", Icon: HeartHandshake },
  { id: "smile", label: "Sonrisa", keywords: "feliz satisfaccion buen ambiente", Icon: Smile },
  { id: "thumbs-up", label: "Me gusta", keywords: "aprobado bueno positivo", Icon: ThumbsUp },
  { id: "heart", label: "Corazón", keywords: "amor favorito pasion", Icon: Heart },
  { id: "hand", label: "Mano", keywords: "apoyo ayuda alto", Icon: Hand },
  // Lugares y movilidad
  { id: "map-pin", label: "Ubicación", keywords: "lugar zona ciudad cerca", Icon: MapPin },
  { id: "map", label: "Mapa", keywords: "zona cobertura recorrido", Icon: MapIcon },
  { id: "navigation", label: "Navegación", keywords: "ruta direccion gps", Icon: Navigation },
  { id: "compass", label: "Brújula", keywords: "orientacion rumbo explorar", Icon: Compass },
  { id: "globe", label: "Mundo", keywords: "global internacional paises", Icon: Globe },
  { id: "home", label: "Casa", keywords: "hogar remoto desde casa", Icon: Home },
  { id: "building", label: "Edificio", keywords: "oficina empresa compania", Icon: Building2 },
  { id: "store", label: "Tienda", keywords: "comercio negocio establecimiento", Icon: Store },
  { id: "car", label: "Carro", keywords: "auto vehiculo transporte", Icon: Car },
  { id: "bike", label: "Bicicleta", keywords: "moto transporte moverse", Icon: Bike },
  { id: "bus", label: "Bus", keywords: "transporte publico", Icon: Bus },
  { id: "plane", label: "Avión", keywords: "viaje vuelo viajar", Icon: Plane },
  { id: "truck", label: "Camión", keywords: "envio transporte entrega", Icon: Truck },
  { id: "package", label: "Paquete", keywords: "envio entrega caja", Icon: Package },
  { id: "mountain", label: "Montaña", keywords: "aventura naturaleza reto", Icon: Mountain },
  { id: "anchor", label: "Ancla", keywords: "estable firme seguro", Icon: Anchor },
  // Tecnología y comunicación
  { id: "smartphone", label: "Celular", keywords: "telefono movil app whatsapp", Icon: Smartphone },
  { id: "laptop", label: "Computador", keywords: "portatil en linea digital remoto", Icon: Laptop },
  { id: "monitor", label: "Pantalla", keywords: "computador escritorio", Icon: Monitor },
  { id: "wifi", label: "Internet", keywords: "conexion red en linea", Icon: Wifi },
  { id: "cloud", label: "Nube", keywords: "almacenamiento digital en linea", Icon: Cloud },
  { id: "cpu", label: "Procesador", keywords: "tecnologia inteligencia automatico", Icon: Cpu },
  { id: "code", label: "Código", keywords: "programacion desarrollo software", Icon: Code },
  { id: "database", label: "Datos", keywords: "base informacion almacenar", Icon: Database },
  { id: "mail", label: "Correo", keywords: "email mensaje carta", Icon: Mail },
  { id: "message", label: "Mensaje", keywords: "chat conversacion whatsapp hablar", Icon: MessageCircle },
  { id: "phone", label: "Teléfono", keywords: "llamada contacto", Icon: Phone },
  { id: "video", label: "Video", keywords: "videollamada reunion grabacion", Icon: Video },
  { id: "camera", label: "Cámara", keywords: "foto imagen evidencia", Icon: Camera },
  { id: "mic", label: "Micrófono", keywords: "audio voz grabar entrevista", Icon: Mic },
  { id: "megaphone", label: "Megáfono", keywords: "anuncio comunicar difusion", Icon: Megaphone },
  { id: "bell", label: "Campana", keywords: "aviso notificacion alerta", Icon: Bell },
  { id: "newspaper", label: "Noticias", keywords: "prensa informacion novedades", Icon: Newspaper },
  { id: "languages", label: "Idiomas", keywords: "traduccion lenguaje hablar", Icon: Languages },
  { id: "share", label: "Compartir", keywords: "recomendar referir enviar", Icon: Share2 },
  { id: "link", label: "Enlace", keywords: "vinculo url conexion", Icon: Link },
  { id: "qr", label: "Código QR", keywords: "escanear codigo", Icon: QrCode },
  // Documentos y aprendizaje
  { id: "file-text", label: "Documento", keywords: "archivo papel contrato texto", Icon: FileText },
  { id: "file-signature", label: "Firma", keywords: "contrato firmar documento", Icon: FileSignature },
  { id: "file-check", label: "Documento aprobado", keywords: "revisado verificado archivo", Icon: FileCheck },
  { id: "clipboard-check", label: "Lista cumplida", keywords: "requisitos tareas completado", Icon: ClipboardCheck },
  { id: "clipboard-list", label: "Lista", keywords: "tareas pasos requisitos encuesta formulario", Icon: ClipboardList },
  { id: "pencil", label: "Lápiz", keywords: "escribir editar completar formulario", Icon: Pencil },
  { id: "book-open", label: "Libro", keywords: "aprender estudiar capacitacion guia", Icon: BookOpen },
  { id: "graduation-cap", label: "Graduación", keywords: "formacion estudio capacitacion curso", Icon: GraduationCap },
  { id: "lightbulb", label: "Idea", keywords: "innovacion conocimiento aprender", Icon: Lightbulb },
  { id: "search", label: "Búsqueda", keywords: "buscar encontrar investigar", Icon: Search },
  { id: "folder", label: "Carpeta", keywords: "archivos documentos organizar", Icon: Folder },
  { id: "bookmark", label: "Marcador", keywords: "guardar favorito", Icon: Bookmark },
  { id: "tag", label: "Etiqueta", keywords: "precio categoria oferta", Icon: Tag },
  // Seguridad y confianza
  { id: "shield", label: "Escudo", keywords: "proteccion seguridad", Icon: Shield },
  { id: "shield-check", label: "Escudo verificado", keywords: "seguro protegido confianza datos", Icon: ShieldCheck },
  { id: "lock", label: "Candado", keywords: "privacidad seguridad cerrado", Icon: Lock },
  { id: "key", label: "Llave", keywords: "acceso clave entrar", Icon: Key },
  { id: "fingerprint", label: "Huella", keywords: "identidad verificacion biometrico", Icon: Fingerprint },
  { id: "badge-check", label: "Sello verificado", keywords: "aprobado certificado calidad", Icon: BadgeCheck },
  { id: "check-circle", label: "Visto en círculo", keywords: "correcto listo completado ok", Icon: CheckCircle2 },
  { id: "check", label: "Visto", keywords: "correcto listo ok", Icon: Check },
  // Flexibilidad y herramientas
  { id: "shuffle", label: "Variedad", keywords: "cambio flexible opciones aleatorio", Icon: Shuffle },
  { id: "sliders", label: "Ajustes", keywords: "personalizar configurar controlar", Icon: SlidersHorizontal },
  { id: "settings", label: "Configuración", keywords: "engranaje ajustes", Icon: Settings },
  { id: "wrench", label: "Herramienta", keywords: "llave herramientas arreglar", Icon: Wrench },
  { id: "puzzle", label: "Rompecabezas", keywords: "encajar solucion pieza", Icon: Puzzle },
  { id: "layers", label: "Capas", keywords: "niveles apilar", Icon: Layers },
  { id: "target", label: "Objetivo", keywords: "meta enfoque punteria", Icon: Target },
  { id: "flag", label: "Bandera", keywords: "meta hito objetivo", Icon: Flag },
  { id: "sparkles", label: "Destellos", keywords: "nuevo magia especial brillo", Icon: Sparkles },
  { id: "flame", label: "Llama", keywords: "popular fuego pasion", Icon: Flame },
  // Salud y bienestar
  { id: "heart-pulse", label: "Salud", keywords: "bienestar medico cuidado", Icon: HeartPulse },
  { id: "stethoscope", label: "Estetoscopio", keywords: "medico salud", Icon: Stethoscope },
  { id: "activity", label: "Actividad", keywords: "ritmo energia movimiento", Icon: Activity },
  { id: "dumbbell", label: "Pesas", keywords: "gimnasio deporte ejercicio", Icon: Dumbbell },
  { id: "baby", label: "Bebé", keywords: "familia hijos cuidado", Icon: Baby },
  { id: "accessibility", label: "Accesibilidad", keywords: "inclusion discapacidad", Icon: Accessibility },
  // Vida cotidiana
  { id: "coffee", label: "Café", keywords: "descanso pausa bebida", Icon: Coffee },
  { id: "utensils", label: "Comida", keywords: "restaurante alimentacion almuerzo", Icon: Utensils },
  { id: "shopping-bag", label: "Bolsa de compras", keywords: "compras tienda", Icon: ShoppingBag },
  { id: "shopping-cart", label: "Carrito", keywords: "compras supermercado", Icon: ShoppingCart },
  { id: "music", label: "Música", keywords: "sonido audio", Icon: Music },
  { id: "palette", label: "Paleta", keywords: "arte diseno creatividad color", Icon: Palette },
  { id: "leaf", label: "Hoja", keywords: "naturaleza ecologico verde", Icon: Leaf },
  { id: "tree", label: "Árbol", keywords: "naturaleza bosque ambiente", Icon: TreePine },
  { id: "sun", label: "Sol", keywords: "dia luz", Icon: Sun },
  { id: "moon", label: "Luna", keywords: "noche turno nocturno", Icon: Moon },
];

const BY_ID = new Map(LANDING_ICONS.map((i) => [i.id, i]));

/** Icono por identificador; si no existe (o está vacío) devuelve la marca de verificación. */
export function getLandingIcon(id: string | undefined | null): LucideIcon {
  return (id ? BY_ID.get(id)?.Icon : undefined) ?? Check;
}

const normalize = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/** Filtra por nombre, palabras clave o identificador, sin importar tildes ni mayúsculas. Todas las palabras deben coincidir. */
export function searchLandingIcons(query: string): LandingIcon[] {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return LANDING_ICONS;
  return LANDING_ICONS.filter((i) => {
    const hay = normalize(`${i.label} ${i.keywords} ${i.id}`);
    return words.every((w) => hay.includes(w));
  });
}
