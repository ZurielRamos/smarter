import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Check, X, Loader2, Mail } from "lucide-react";

export function PendingInvites() {
  const { user, acceptInvite, declineInvite } = useAuth();
  const [accepting, setAccepting] = useState<string | null>(null);

  if (!user?.pendingInvites?.length) return null;

  return (
    <div className="fixed top-4 right-4 z-[100] space-y-2 max-w-sm">
      {user.pendingInvites.map((invite) => (
        <div
          key={invite.tenantId}
          className="bg-white rounded-xl shadow-lg border border-gray-200 p-4 animate-in slide-in-from-right"
        >
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-lg bg-brand-50 flex items-center justify-center shrink-0">
              <Mail className="h-4 w-4 text-brand-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900">Invitación pendiente</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Te han invitado como <strong>{invite.role === "owner" ? "Propietario" : invite.role === "admin" ? "Administrador" : "Agente"}</strong> a <strong>{invite.tenant.name}</strong>
              </p>
              <div className="flex items-center gap-2 mt-3">
                <button
                  onClick={async () => {
                    setAccepting(invite.tenantId);
                    await acceptInvite(invite.tenantId);
                    setAccepting(null);
                  }}
                  disabled={accepting === invite.tenantId}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand-700 hover:bg-brand-600 text-white text-xs font-medium transition-colors disabled:opacity-50"
                >
                  {accepting === invite.tenantId ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                  Aceptar
                </button>
                <button
                  onClick={() => declineInvite(invite.tenantId)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 text-xs font-medium transition-colors"
                >
                  <X className="h-3 w-3" />
                  Rechazar
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
