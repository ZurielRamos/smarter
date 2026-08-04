import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  MessageSquare,
  Users,
  Zap,
  BarChart3,
  Shield,
  Globe,
  ArrowRight,
  Check,
  Star,
  Send,
  Bot,
  Layers,
  Clock,
  HeadphonesIcon,
} from "lucide-react";
import logo from "@/assets/logo.svg";

const FEATURES = [
  {
    icon: MessageSquare,
    title: "Comunicación omnicanal",
    description: "WhatsApp, SMS, email y llamadas desde una sola plataforma. Centraliza todas tus conversaciones.",
  },
  {
    icon: Users,
    title: "Gestión de contactos",
    description: "Base de datos inteligente con segmentación avanzada, campos personalizados y scoring automático.",
  },
  {
    icon: Zap,
    title: "Campañas masivas",
    description: "Envía miles de mensajes personalizados con segmentación precisa y reportes en tiempo real.",
  },
  {
    icon: BarChart3,
    title: "Analítica en tiempo real",
    description: "Dashboards con métricas de entrega, engagement y conversión para tomar mejores decisiones.",
  },
  {
    icon: Shield,
    title: "Seguridad empresarial",
    description: "Roles y permisos granulares, autenticación segura y cifrado de datos en tránsito y reposo.",
  },
  {
    icon: Globe,
    title: "API abierta",
    description: "Integra Smartee con tus sistemas existentes mediante nuestra API REST documentada.",
  },
];

const STATS = [
  { value: "99.9%", label: "Uptime garantizado" },
  { value: "10M+", label: "Mensajes enviados/mes" },
  { value: "<200ms", label: "Tiempo de respuesta API" },
  { value: "50+", label: "Empresas confían en nosotros" },
];

const TESTIMONIALS = [
  {
    quote: "Smartee nos permitió centralizar toda la comunicación con nuestros clientes. La eficiencia de nuestro equipo aumentó un 40% en el primer trimestre.",
    name: "Carlos Mendoza",
    role: "Director de Operaciones",
    company: "SuperGiros",
  },
  {
    quote: "La API es robusta y bien documentada. Integramos Smartee con nuestro ERP en menos de una semana.",
    name: "Andrea López",
    role: "CTO",
    company: "Grupo Financiero del Valle",
  },
  {
    quote: "El soporte es excepcional. Siempre tienen respuestas rápidas y soluciones a medida para nuestras necesidades.",
    name: "Roberto Sánchez",
    role: "Gerente de Tecnología",
    company: "Redes & Servicios",
  },
];

const USE_CASES = [
  {
    icon: Send,
    title: "Notificaciones transaccionales",
    description: "Confirmaciones de pago, alertas de cuenta y actualizaciones de estado en tiempo real.",
  },
  {
    icon: Bot,
    title: "Atención al cliente",
    description: "Gestiona conversaciones con asignación inteligente, etiquetas y métricas de respuesta.",
  },
  {
    icon: Layers,
    title: "Marketing automatizado",
    description: "Campañas segmentadas con plantillas aprobadas y seguimiento de conversiones.",
  },
  {
    icon: Clock,
    title: "Recordatorios y cobros",
    description: "Automatiza recordatorios de pago, citas y vencimientos con mensajes programados.",
  },
];

const fadeIn = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } },
};

export function Landing() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-white">
      {/* Navigation */}
      <nav className="fixed top-0 inset-x-0 z-50 bg-white/80 backdrop-blur-xl border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src={logo} alt="Smartee" className="h-6" />
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm text-gray-600">
            <a href="#features" className="hover:text-gray-900 transition-colors">Funcionalidades</a>
            <a href="#use-cases" className="hover:text-gray-900 transition-colors">Casos de uso</a>
            <a href="#testimonials" className="hover:text-gray-900 transition-colors">Testimonios</a>
            <a href="#pricing" className="hover:text-gray-900 transition-colors">Precios</a>
            <a href="/api-reference" className="hover:text-gray-900 transition-colors">API</a>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/login")}
              className="text-sm text-gray-700 hover:text-gray-900 font-medium px-4 py-2 rounded-lg transition-colors"
            >
              Iniciar sesión
            </button>
            <button
              onClick={() => navigate("/login")}
              className="text-sm text-white bg-brand-800 hover:bg-brand-700 font-medium px-5 py-2.5 rounded-lg transition-colors"
            >
              Solicitar demo
            </button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="max-w-3xl">
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1 }}
              className="text-sm font-medium text-brand-600 mb-4"
            >
              Plataforma de comunicación empresarial
            </motion.p>
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.6 }}
              className="text-5xl md:text-6xl font-bold text-gray-900 leading-tight tracking-tight"
            >
              Toda tu comunicación con clientes,{" "}
              <span className="text-brand-600">en un solo lugar</span>
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35, duration: 0.6 }}
              className="text-lg text-gray-600 mt-6 leading-relaxed max-w-2xl"
            >
              Centraliza WhatsApp, SMS, email y llamadas. Gestiona contactos, lanza campañas masivas
              y conecta tus sistemas con nuestra API. Diseñado para empresas que necesitan escalar.
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.6 }}
              className="flex items-center gap-4 mt-8"
            >
              <button
                onClick={() => navigate("/login")}
                className="inline-flex items-center gap-2 text-sm font-semibold text-white bg-brand-800 hover:bg-brand-700 px-6 py-3 rounded-xl transition-colors"
              >
                Comenzar ahora <ArrowRight className="h-4 w-4" />
              </button>
              <button
                onClick={() => navigate("/login")}
                className="inline-flex items-center gap-2 text-sm font-semibold text-gray-700 border border-gray-300 hover:border-gray-400 px-6 py-3 rounded-xl transition-colors"
              >
                Hablar con ventas
              </button>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-12 border-y border-gray-100 bg-gray-50/50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {STATS.map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="text-3xl font-bold text-gray-900">{stat.value}</p>
                <p className="text-sm text-gray-500 mt-1">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeIn}
            className="text-center max-w-2xl mx-auto mb-16"
          >
            <p className="text-sm font-medium text-brand-600 mb-3">Funcionalidades</p>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
              Todo lo que necesitas para conectar con tus clientes
            </h2>
            <p className="text-gray-600 mt-4">
              Una plataforma completa que crece con tu empresa. Sin límites artificiales.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map((feature, i) => {
              const Icon = feature.icon;
              return (
                <motion.div
                  key={feature.title}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true }}
                  variants={{
                    hidden: { opacity: 0, y: 20 },
                    visible: { opacity: 1, y: 0, transition: { duration: 0.5, delay: i * 0.1 } },
                  }}
                  className="p-6 rounded-2xl border border-gray-200 hover:border-brand-200 hover:bg-brand-50/30 transition-all group"
                >
                  <div className="h-11 w-11 rounded-xl bg-brand-100 flex items-center justify-center mb-4 group-hover:bg-brand-200 transition-colors">
                    <Icon className="h-5 w-5 text-brand-700" />
                  </div>
                  <h3 className="text-base font-semibold text-gray-900 mb-2">{feature.title}</h3>
                  <p className="text-sm text-gray-600 leading-relaxed">{feature.description}</p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Use Cases */}
      <section id="use-cases" className="py-24 px-6 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeIn}
            className="text-center max-w-2xl mx-auto mb-16"
          >
            <p className="text-sm font-medium text-brand-600 mb-3">Casos de uso</p>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
              Soluciones para cada necesidad
            </h2>
            <p className="text-gray-600 mt-4">
              Desde notificaciones transaccionales hasta campañas de marketing, Smartee se adapta a tu operación.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {USE_CASES.map((uc, i) => {
              const Icon = uc.icon;
              return (
                <motion.div
                  key={uc.title}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true }}
                  variants={{
                    hidden: { opacity: 0, y: 20 },
                    visible: { opacity: 1, y: 0, transition: { duration: 0.5, delay: i * 0.1 } },
                  }}
                  className="bg-white p-6 rounded-2xl border border-gray-200 flex gap-4"
                >
                  <div className="h-10 w-10 rounded-lg bg-brand-100 flex items-center justify-center shrink-0">
                    <Icon className="h-5 w-5 text-brand-700" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 mb-1">{uc.title}</h3>
                    <p className="text-sm text-gray-600 leading-relaxed">{uc.description}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeIn}
            className="text-center max-w-2xl mx-auto mb-16"
          >
            <p className="text-sm font-medium text-brand-600 mb-3">Testimonios</p>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
              Empresas que confían en Smartee
            </h2>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {TESTIMONIALS.map((t, i) => (
              <motion.div
                key={t.name}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={{
                  hidden: { opacity: 0, y: 20 },
                  visible: { opacity: 1, y: 0, transition: { duration: 0.5, delay: i * 0.15 } },
                }}
                className="bg-gray-50 p-6 rounded-2xl border border-gray-100"
              >
                <div className="flex gap-1 mb-4">
                  {[...Array(5)].map((_, j) => (
                    <Star key={j} className="h-4 w-4 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <p className="text-sm text-gray-700 leading-relaxed mb-5 italic">"{t.quote}"</p>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{t.name}</p>
                  <p className="text-xs text-gray-500">{t.role}, {t.company}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-24 px-6 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeIn}
            className="text-center max-w-2xl mx-auto mb-16"
          >
            <p className="text-sm font-medium text-brand-600 mb-3">Precios</p>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
              Planes que se adaptan a tu escala
            </h2>
            <p className="text-gray-600 mt-4">
              Sin contratos de permanencia. Paga solo por lo que usas.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {/* Starter */}
            <div className="bg-white rounded-2xl border border-gray-200 p-8">
              <h3 className="text-lg font-semibold text-gray-900">Starter</h3>
              <p className="text-sm text-gray-500 mt-1">Para equipos pequeños</p>
              <div className="mt-6">
                <span className="text-4xl font-bold text-gray-900">$99</span>
                <span className="text-sm text-gray-500">/mes</span>
              </div>
              <ul className="mt-6 space-y-3">
                {["Hasta 5,000 contactos", "1 canal de WhatsApp", "3 usuarios", "Campañas básicas", "Soporte por email"].map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-gray-600">
                    <Check className="h-4 w-4 text-green-500 shrink-0" /> {f}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => navigate("/login")}
                className="w-full mt-8 py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Comenzar
              </button>
            </div>

            {/* Business */}
            <div className="bg-brand-800 rounded-2xl p-8 text-white relative overflow-hidden">
              <div className="absolute top-4 right-4 text-[10px] px-2 py-0.5 rounded-full bg-white/20 font-medium">Popular</div>
              <h3 className="text-lg font-semibold">Business</h3>
              <p className="text-sm text-brand-200 mt-1">Para empresas en crecimiento</p>
              <div className="mt-6">
                <span className="text-4xl font-bold">$299</span>
                <span className="text-sm text-brand-200">/mes</span>
              </div>
              <ul className="mt-6 space-y-3">
                {["Hasta 50,000 contactos", "3 canales", "10 usuarios", "Campañas avanzadas + API", "Webhooks e integraciones", "Soporte prioritario"].map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-brand-100">
                    <Check className="h-4 w-4 text-green-300 shrink-0" /> {f}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => navigate("/login")}
                className="w-full mt-8 py-2.5 rounded-lg bg-white text-brand-800 text-sm font-semibold hover:bg-gray-100 transition-colors"
              >
                Comenzar
              </button>
            </div>

            {/* Enterprise */}
            <div className="bg-white rounded-2xl border border-gray-200 p-8">
              <h3 className="text-lg font-semibold text-gray-900">Enterprise</h3>
              <p className="text-sm text-gray-500 mt-1">Para grandes operaciones</p>
              <div className="mt-6">
                <span className="text-4xl font-bold text-gray-900">Custom</span>
              </div>
              <ul className="mt-6 space-y-3">
                {["Contactos ilimitados", "Canales ilimitados", "Usuarios ilimitados", "SLA dedicado", "Onboarding personalizado", "Account Manager"].map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-gray-600">
                    <Check className="h-4 w-4 text-green-500 shrink-0" /> {f}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => navigate("/login")}
                className="w-full mt-8 py-2.5 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Contactar ventas
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeIn}
          >
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900">
              ¿Listo para transformar tu comunicación?
            </h2>
            <p className="text-gray-600 mt-4 text-lg">
              Agenda una demo personalizada y descubre cómo Smartee puede impulsar tu operación.
            </p>
            <div className="flex items-center justify-center gap-4 mt-8">
              <button
                onClick={() => navigate("/login")}
                className="inline-flex items-center gap-2 text-sm font-semibold text-white bg-brand-800 hover:bg-brand-700 px-6 py-3 rounded-xl transition-colors"
              >
                Solicitar demo <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-200 py-12 px-6 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <div>
              <img src={logo} alt="Smartee" className="h-5 mb-4" />
              <p className="text-xs text-gray-500 leading-relaxed">
                Plataforma de comunicación empresarial para equipos que necesitan escalar.
              </p>
            </div>
            <div>
              <h4 className="text-xs font-semibold text-gray-900 uppercase tracking-wide mb-3">Producto</h4>
              <ul className="space-y-2 text-sm text-gray-600">
                <li><a href="#features" className="hover:text-gray-900">Funcionalidades</a></li>
                <li><a href="/api-reference" className="hover:text-gray-900">API Reference</a></li>
                <li><a href="#pricing" className="hover:text-gray-900">Precios</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-xs font-semibold text-gray-900 uppercase tracking-wide mb-3">Empresa</h4>
              <ul className="space-y-2 text-sm text-gray-600">
                <li><a href="#testimonials" className="hover:text-gray-900">Clientes</a></li>
                <li><a href="#" className="hover:text-gray-900">Sobre nosotros</a></li>
                <li><a href="#" className="hover:text-gray-900">Contacto</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-xs font-semibold text-gray-900 uppercase tracking-wide mb-3">Legal</h4>
              <ul className="space-y-2 text-sm text-gray-600">
                <li><a href="/privacy" className="hover:text-gray-900">Privacidad</a></li>
                <li><a href="/terms" className="hover:text-gray-900">Términos</a></li>
              </ul>
            </div>
          </div>
          <div className="mt-10 pt-6 border-t border-gray-200 flex items-center justify-between">
            <p className="text-xs text-gray-400">© 2026 Smartee. Todos los derechos reservados.</p>
            <div className="flex items-center gap-2">
              <HeadphonesIcon className="h-4 w-4 text-gray-400" />
              <span className="text-xs text-gray-500">soporte@strategee.us</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
