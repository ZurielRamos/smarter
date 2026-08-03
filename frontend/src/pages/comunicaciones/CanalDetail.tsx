import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Settings2, Users, Clock } from "lucide-react";
import { InboxSettingsContent } from "@/components/InboxSettingsContent";

type Tab = "ajustes" | "colaboradores" | "horarios";

export function CanalDetail() {
  const { slug, inboxId } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>("ajustes");

  if (!inboxId) return null;

  const tabs = [
    { key: "ajustes" as Tab, label: "Ajustes", icon: Settings2 },
    { key: "colaboradores" as Tab, label: "Colaboradores", icon: Users },
    { key: "horarios" as Tab, label: "Horarios", icon: Clock },
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Tabs */}
      <div className="px-5 border-b border-gray-100 flex items-center gap-1 shrink-0">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === key
                ? "border-brand-600 text-brand-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "ajustes" && (
        <InboxSettingsContent
          inboxId={inboxId}
          onDeleted={() => navigate(`/${slug}/comunicaciones/canales`, { replace: true })}
        />
      )}

      {activeTab === "colaboradores" && (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
          <Users className="h-8 w-8 text-gray-300 mb-2" />
          <p className="text-sm text-gray-500 font-medium">Colaboradores</p>
          <p className="text-[11px] text-gray-400 mt-1">Asigna agentes que atenderán las conversaciones de este canal</p>
        </div>
      )}

      {activeTab === "horarios" && (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
          <Clock className="h-8 w-8 text-gray-300 mb-2" />
          <p className="text-sm text-gray-500 font-medium">Horarios de atención</p>
          <p className="text-[11px] text-gray-400 mt-1">Configura los horarios en los que este canal está disponible</p>
        </div>
      )}
    </div>
  );
}
