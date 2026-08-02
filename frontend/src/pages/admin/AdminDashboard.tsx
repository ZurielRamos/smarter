import { Users, ShieldCheck, Building2, TrendingUp } from "lucide-react";
import { motion } from "framer-motion";
import headerBg from "@/assets/header-background.jpg";

export function AdminDashboard() {
  const statCards = [
    {
      label: "Total Cuentas",
      value: "0",
      icon: Users,
      color: "text-brand-300",
      bg: "bg-brand-700",
    },
    {
      label: "Usuarios Activos",
      value: "0",
      icon: Building2,
      color: "text-accent-300",
      bg: "bg-accent-500/20",
    },
    {
      label: "Staff",
      value: "0",
      icon: ShieldCheck,
      color: "text-amber-400",
      bg: "bg-amber-500/10",
    },
    {
      label: "Actividad Hoy",
      value: "0",
      icon: TrendingUp,
      color: "text-brand-400",
      bg: "bg-brand-600/20",
    },
  ];

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Dark section - title + stats */}
      <div
        className="px-8 pt-16 pb-6 shrink-0 rounded-b-2xl"
        style={{
          backgroundImage: `url(${headerBg})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <h1 className="text-2xl font-bold text-white mb-6">
          Panel de Administración
        </h1>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map((stat) => (
            <div
              key={stat.label}
              className="relative rounded-xl p-5 flex items-center justify-between overflow-hidden border border-white/15 shadow-[0_0_15px_rgba(255,255,255,0.05)]"
              style={{
                background: 'linear-gradient(135deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.04) 100%)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
              }}
            >
              {/* Top shine */}
              <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />
              <div>
                <p className="text-sm text-brand-300">{stat.label}</p>
                <p className="text-3xl font-bold text-white mt-1">
                  {stat.value}
                </p>
              </div>
              <div
                className={`${stat.bg} h-10 w-10 rounded-lg flex items-center justify-center`}
              >
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Light section */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.1, ease: 'easeOut' }}
        className="py-6 flex-1 min-h-0 overflow-auto"
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Overview */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Resumen General
            </h2>
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="h-16 w-16 rounded-full bg-brand-50 flex items-center justify-center mb-3">
                <TrendingUp className="h-7 w-7 text-brand-400" />
              </div>
              <p className="text-gray-500 text-sm">
                Panel de administración superior
              </p>
              <p className="text-gray-400 text-xs mt-1">
                Gestiona cuentas de usuarios y staff desde aquí
              </p>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Actividad Reciente
            </h2>
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="h-16 w-16 rounded-full bg-accent-50 flex items-center justify-center mb-3">
                <ShieldCheck className="h-7 w-7 text-accent-500" />
              </div>
              <p className="text-gray-500 text-sm">
                No hay actividad reciente
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
