import { useNavigate, useParams } from "react-router-dom";
import { Puzzle, Webhook, Key, Database, Globe, ChevronRight, ShoppingCart } from "lucide-react";

const INTEGRATIONS = [
  {
    id: "webhooks",
    name: "Webhooks",
    description: "Recibe notificaciones en tiempo real cuando ocurren eventos",
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
    status: "active",
  },
  {
    id: "woocommerce",
    name: "WordPress / WooCommerce",
    description: "Rastrea conversiones y envía notificaciones desde tu tienda",
    icon: ShoppingCart,
    color: "text-purple-700",
    bg: "bg-purple-50",
    status: "active",
  },
  {
    id: "crm",
    name: "CRM Externo",
    description: "Sincroniza contactos con HubSpot, Salesforce u otros",
    icon: Database,
    color: "text-green-600",
    bg: "bg-green-50",
    status: "soon",
  },
  {
    id: "ecommerce",
    name: "E-commerce (otros)",
    description: "Conecta Shopify, PrestaShop u otras plataformas",
    icon: Globe,
    color: "text-orange-600",
    bg: "bg-orange-50",
    status: "soon",
  },
];

export function IntegrationsCard() {
  const { slug } = useParams();
  const navigate = useNavigate();

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
        <Puzzle className="h-4 w-4 text-gray-400" />
        <h2 className="text-sm font-semibold text-gray-900">Integraciones</h2>
      </div>
      <div className="divide-y divide-gray-50">
        {INTEGRATIONS.map((integration) => {
          const Icon = integration.icon;
          const isClickable = integration.status === "active";
          return (
            <button
              key={integration.id}
              disabled={!isClickable}
              onClick={() => {
                if (integration.id === "api") {
                  window.open("/api-reference", "_blank");
                } else {
                  navigate(`/${slug}/integraciones/${integration.id}`);
                }
              }}
              className={`w-full flex items-center gap-3 px-5 py-3.5 text-left transition-colors ${
                isClickable ? "hover:bg-gray-50 cursor-pointer" : "opacity-60 cursor-default"
              }`}
            >
              <div className={`h-8 w-8 rounded-lg ${integration.bg} flex items-center justify-center shrink-0`}>
                <Icon className={`h-4 w-4 ${integration.color}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-gray-900">{integration.name}</p>
                  {integration.status === "soon" && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">Próximamente</span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{integration.description}</p>
              </div>
              {isClickable && <ChevronRight className="h-4 w-4 text-gray-300 shrink-0" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
