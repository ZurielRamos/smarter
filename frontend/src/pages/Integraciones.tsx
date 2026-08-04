import { useParams } from "react-router-dom";
import { Puzzle, Globe, Database, Webhook, Key, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import headerBg from "@/assets/header-background.jpg";

const INTEGRATIONS = [
  {
    id: "webhooks",
    name: "Webhooks",
    description: "Recibe notificaciones en tiempo real cuando ocurren eventos en tu cuenta",
    icon: Webhook,
    color: "text-purple-600",
    bg: "bg-purple-50",
    status: "active",
  },
  {
    id: "api",
    name: "API REST",
    description: "Conecta aplicaciones externas mediante nuestra API",
    icon: Key,
    color: "text-blue-600",
    bg: "bg-blue-50",
    status: "soon",
  },
  {
    id: "crm",
    name: "CRM Externo",
    description: "Sincroniza contactos con HubSpot, Salesforce u otros CRMs",
    icon: Database,
    color: "text-green-600",
    bg: "bg-green-50",
    status: "soon",
  },
  {
    id: "ecommerce",
    name: "E-commerce",
    description: "Conecta tu tienda online para enviar notificaciones de pedidos",
    icon: Globe,
    color: "text-orange-600",
    bg: "bg-orange-50",
    status: "soon",
  },
];

export function Integraciones() {
  const { slug } = useParams();
  const navigate = useNavigate();

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div
        className="px-8 pt-16 pb-6 shrink-0 rounded-b-2xl"
        style={{ backgroundImage: `url(${headerBg})`, backgroundSize: "cover", backgroundPosition: "center" }}
      >
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-white/10 text-white transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <Puzzle className="h-5 w-5" /> Integraciones
            </h1>
            <p className="text-brand-300 mt-0.5 text-sm">Conecta herramientas externas a tu cuenta</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {INTEGRATIONS.map((integration) => {
              const Icon = integration.icon;
              const isClickable = integration.status === "active";
              return (
                <div
                  key={integration.id}
                  onClick={isClickable ? () => navigate(`/${slug}/integraciones/${integration.id}`) : undefined}
                  className={`bg-white rounded-xl border border-gray-200 p-5 transition-colors ${isClickable ? "hover:border-brand-300 hover:bg-brand-50/20 cursor-pointer" : "hover:border-gray-300"}`}
                >
                  <div className="flex items-start gap-4">
                    <div className={`h-10 w-10 rounded-lg ${integration.bg} flex items-center justify-center shrink-0`}>
                      <Icon className={`h-5 w-5 ${integration.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-gray-900">{integration.name}</h3>
                        {integration.status === "soon" && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">Próximamente</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-1">{integration.description}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-8 p-5 rounded-xl bg-gray-50 border border-gray-100">
            <h3 className="text-sm font-semibold text-gray-900 mb-1">¿Necesitas una integración específica?</h3>
            <p className="text-xs text-gray-500">Contáctanos para discutir integraciones personalizadas con tus herramientas actuales.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
