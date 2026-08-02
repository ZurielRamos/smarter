import { useParams } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Settings as SettingsIcon } from "lucide-react";
import { GeneralCard } from "@/components/settings/GeneralCard";
import { ChannelConfigCard } from "@/components/settings/ChannelConfigCard";
import { motion } from "framer-motion";
import headerBg from "@/assets/header-background.jpg";
import { TeamCard } from "@/components/settings/TeamCard";

export function Settings() {
  const { slug } = useParams();
  const { user } = useAuth();
  const currentTenant = user?.tenantRoles.find((tr) => tr.tenant.slug === slug);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Dark section - title */}
      <div
        className="px-8 pt-16 pb-4 shrink-0 rounded-b-2xl"
        style={{
          backgroundImage: `url(${headerBg})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div className="flex items-center gap-3">
          <SettingsIcon className="h-5 w-5 text-brand-300" />
          <div>
            <h1 className="text-xl font-bold text-white">Configuración</h1>
            <p className="text-brand-300 mt-0.5 text-sm">
              Configuraciones generales de {currentTenant?.tenant.name ?? "la cuenta"}
            </p>
          </div>
        </div>
      </div>

      {/* Content */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.1, ease: 'easeOut' }} className="flex-1 min-h-0 overflow-auto py-6">
        <div className="max-w-3xl space-y-6">
          <GeneralCard />
          <ChannelConfigCard />
          <TeamCard />
        </div>
      </motion.div>
    </div>
  );
}
