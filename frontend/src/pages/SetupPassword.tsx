import { useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Lock, CheckCircle2, AlertCircle } from "lucide-react";
import { api } from "@/services/api";
import logoCompleto from "@/assets/logo-completo.png";

export function SetupPassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") || "";
  const mode = searchParams.get("mode"); // "reset" for change password

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ status: string; message: string } | null>(null);

  const isReset = mode === "reset";
  const title = isReset ? "Cambiar contraseña" : "Establece tu contraseña";
  const subtitle = isReset
    ? "Ingresa tu nueva contraseña"
    : "Completa tu registro configurando una contraseña segura para acceder a Smartee";
  const buttonText = isReset ? "Cambiar contraseña" : "Crear mi cuenta";

  const passwordsMatch = password === confirmPassword && password.length > 0;
  const passwordStrong = password.length >= 8;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordsMatch || !passwordStrong) return;

    setLoading(true);
    try {
      const { data } = await api.post("/auth/setup-password", { token, newPassword: password });
      if (data.error) {
        setResult({ status: "error", message: data.error });
      } else {
        setResult({ status: "success", message: data.message });
        setTimeout(() => navigate("/login", { replace: true }), 2000);
      }
    } catch {
      setResult({ status: "error", message: "Error al procesar la solicitud" });
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
          <h1 className="text-lg font-semibold text-gray-900">Enlace inválido</h1>
          <p className="text-sm text-gray-500 mt-1">Este enlace no es válido o ha expirado.</p>
          <button onClick={() => navigate("/login")} className="mt-4 text-sm text-brand-600 hover:text-brand-700 font-medium">
            Ir al inicio de sesión
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          {/* Logo */}
          <div className="text-center mb-6">
            <img src={logoCompleto} alt="Smartee" className="h-10 mx-auto mb-4" />
            <h1 className="text-xl font-bold text-gray-900">{title}</h1>
            <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
          </div>

          {result?.status === "success" ? (
            <div className="text-center py-6">
              <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-3" />
              <p className="text-sm font-medium text-green-700">{result.message}</p>
              <p className="text-xs text-gray-400 mt-2">Redirigiendo al inicio de sesión...</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Contraseña</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mínimo 8 caracteres"
                    className="w-full pl-10 pr-10 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {password && !passwordStrong && (
                  <p className="text-[11px] text-red-500 mt-1">La contraseña debe tener al menos 8 caracteres</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirmar contraseña</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repite tu contraseña"
                    className={`w-full pl-10 pr-10 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent ${
                      confirmPassword && !passwordsMatch ? "border-red-300" : "border-gray-200"
                    }`}
                  />
                  {confirmPassword && passwordsMatch && (
                    <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />
                  )}
                </div>
                {confirmPassword && !passwordsMatch && (
                  <p className="text-[11px] text-red-500 mt-1">Las contraseñas no coinciden</p>
                )}
              </div>

              {result?.status === "error" && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                  <p className="text-xs text-red-700">{result.message}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !passwordsMatch || !passwordStrong}
                className="w-full py-2.5 rounded-lg bg-brand-800 hover:bg-brand-700 text-white font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Procesando..." : buttonText}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
