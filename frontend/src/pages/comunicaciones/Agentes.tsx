import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import axios from "axios";

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || "/api" });
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

interface Agent {
  id: string;
  userId: string;
  role: string;
  user: { id: string; name: string; email: string };
}

export function Agentes() {
  const { slug } = useParams();
  const { user } = useAuth();
  const tenantRole = user?.tenantRoles.find((tr) => tr.tenant.slug === slug);
  const tenantId = tenantRole?.tenantId || "";
  const [agents, setAgents] = useState<Agent[]>([]);

  useEffect(() => {
    if (!tenantId) return;
    api.get("/tenants/" + tenantId + "/members").then(({ data }) => setAgents(data)).catch(() => {});
  }, [tenantId]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-900">Agentes</h3>
        <p className="text-[11px] text-gray-400 mt-0.5">{agents.length} miembros del equipo</p>
      </div>
      <div className="flex-1 overflow-y-auto">
        {agents.map((agent) => (
          <div key={agent.id} className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors">
            <div className="h-9 w-9 rounded-full bg-brand-100 flex items-center justify-center text-sm font-bold text-brand-700 shrink-0">
              {agent.user.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{agent.user.name}</p>
              <p className="text-[11px] text-gray-400 truncate">{agent.user.email}</p>
            </div>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${agent.role === "admin" ? "bg-purple-100 text-purple-700" : "bg-gray-100 text-gray-600"}`}>
              {agent.role === "admin" ? "Administrador" : "Agente"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
