import { useAuth } from "@/context/AuthContext";
import { Mail, Check, X, Loader2, LogOut } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

export function Pending() {
  const { user, acceptInvite, declineInvite, logout } = useAuth();
  const navigate = useNavigate();
  const [accepting, setAccepting] = useState<string | null>(null);

  const handleAccept = async (tenantId: string) => {
    setAccepting(tenantId);
    await acceptInvite(tenantId);
    setAccepting(null);
    // After accepting, redirect to the tenant
    const invite = user?.pendingInvites.find((i) => i.tenantId === tenantId);
    if (invite) {
      navigate(`/${invite.tenant.slug}`, { replace: true });
    }
  };

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  if (!user?.pendingInvites?.length) {
    // No pending invites — show no access message
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
            <div className="h-14 w-14 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
              <LogOut className="h-6 w-6 text-gray-400" />
            </div>
            <h1 className="text-xl font-bold text-gray-900">Sin acceso</h1>
            <p className="text-sm text-gray-500 mt-2 max-w-xs mx-auto">
              Tu cuenta no tiene acceso a ninguna organización. Contacta a un administrador para que te invite.
            </p>
            <button
              onClick={handleLogout}
              className="mt-6 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
              Cerrar sesión
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          <div className="text-center mb-6">
            <div className="h-14 w-14 rounded-full bg-brand-50 flex items-center justify-center mx-auto mb-4">
              <Mail className="h-6 w-6 text-brand-600" />
            </div>
            <h1 className="text-xl font-bold text-gray-900">Invitaciones pendientes</h1>
            <p className="text-sm text-gray-500 mt-1">
              Acepta una invitación para acceder a la plataforma
            </p>
          </div>

          <div className="space-y-3">
            {user.pendingInvites.map((invite) => (
              <div key={invite.tenantId} className="p-4 rounded-xl border border-gray-200 bg-gray-50/50">
                <div className="flex items-center gap-3 mb-3">
                  {invite.tenant.iconPath ? (
                    <img
                      src={invite.tenant.iconPath.startsWith("http") ? invite.tenant.iconPath : `/${invite.tenant.iconPath}`}
                      alt=""
                      className="h-10 w-10 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-lg bg-brand-100 flex items-center justify-center text-sm font-bold text-brand-700">
                      {invite.tenant.name.charAt(0)}
                    </div>
                  )}
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{invite.tenant.name}</p>
                    <p className="text-xs text-gray-500">
                      Rol: {invite.role === "admin" ? "Administrador" : "Agente"}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleAccept(invite.tenantId)}
                    disabled={accepting === invite.tenantId}
                    className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-brand-700 hover:bg-brand-600 text-white text-sm font-medium transition-colors disabled:opacity-50"
                  >
                    {accepting === invite.tenantId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    Aceptar
                  </button>
                  <button
                    onClick={() => declineInvite(invite.tenantId)}
                    className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-100 text-sm font-medium transition-colors"
                  >
                    <X className="h-4 w-4" />
                    Rechazar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="text-center mt-4">
          <button
            onClick={handleLogout}
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  );
}
