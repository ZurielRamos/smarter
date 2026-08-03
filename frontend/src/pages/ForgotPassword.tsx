import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mail, ArrowLeft, CheckCircle2 } from "lucide-react";
import { api } from "@/services/api";
import logoCompleto from "@/assets/logo-completo.png";

export function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    setLoading(true);
    try {
      await api.post("/auth/forgot-password", { email });
      setSent(true);
    } catch {} finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">
          {/* Logo */}
          <div className="text-center mb-6">
            <img src={logoCompleto} alt="Smartee" className="h-10 mx-auto mb-4" />
          </div>

          {sent ? (
            <div className="text-center py-4">
              <div className="h-14 w-14 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="h-6 w-6 text-green-500" />
              </div>
              <h1 className="text-xl font-bold text-gray-900 mb-2">Revisa tu correo</h1>
              <p className="text-sm text-gray-500 max-w-xs mx-auto">
                Si <strong>{email}</strong> está registrado, recibirás un enlace para restablecer tu contraseña.
              </p>
              <button
                onClick={() => navigate("/login")}
                className="mt-6 inline-flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700 font-medium"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Volver al inicio de sesión
              </button>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-bold text-gray-900 text-center">¿Olvidaste tu contraseña?</h1>
              <p className="text-sm text-gray-500 text-center mt-1 mb-6">
                Ingresa tu correo electrónico y te enviaremos un enlace para restablecerla.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Correo electrónico</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="tu@correo.com"
                      required
                      className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading || !email}
                  className="w-full py-2.5 rounded-lg bg-brand-800 hover:bg-brand-700 text-white font-medium text-sm transition-colors disabled:opacity-50"
                >
                  {loading ? "Enviando..." : "Enviar enlace de recuperación"}
                </button>
              </form>

              <div className="text-center mt-4">
                <button
                  onClick={() => navigate("/login")}
                  className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Volver al inicio de sesión
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
