import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import logoCompleto from '../assets/icon.svg';
import heroBg from '../assets/hero.png';
import loginBg from '../assets/login-background.jpg';
import whiteBg from '../assets/white-background.jpg';

export function Login() {
  const [email, setEmail] = useState(() => localStorage.getItem('rememberedEmail') || '');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(() => !!localStorage.getItem('rememberedEmail'));
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [redirectTo, setRedirectTo] = useState('');
  const [ripples, setRipples] = useState<{ x: number; y: number; id: number }[]>([]);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const { login } = useAuth();
  const navigate = useNavigate();

  function handleRipple(e: React.MouseEvent<HTMLButtonElement>) {
    const button = buttonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const id = Date.now();
    setRipples((prev) => [...prev, { x, y, id }]);
    setTimeout(() => {
      setRipples((prev) => prev.filter((r) => r.id !== id));
    }, 600);
  }

  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const isFormValid = isValidEmail && password.trim().length > 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!isFormValid) {
      return;
    }

    setIsSubmitting(true);

    try {
      const dest = await login(email, password);
      if (rememberMe) {
        localStorage.setItem('rememberedEmail', email);
      } else {
        localStorage.removeItem('rememberedEmail');
      }
      setRedirectTo(dest);
      setIsExiting(true);
    } catch (err: any) {
      const message =
        err?.response?.data?.message || 'Error al iniciar sesión';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div
      className="min-h-screen flex"
      style={{
        backgroundImage: `url(${whiteBg})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {/* Left side - Login form */}
      <div className="flex-1 flex items-center justify-center px-8 py-12">
        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.96 }}
          animate={isExiting ? { opacity: 0, y: -50, scale: 0.9 } : { opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: isExiting ? 1.2 : 0.6, ease: [0.22, 1, 0.36, 1] }}
          onAnimationComplete={() => {
            if (isExiting) {
              navigate(redirectTo, { replace: true });
            }
          }}
          className="w-full max-w-md rounded-2xl shadow-2xl p-10 border border-white/30"
          style={{
            background: 'rgba(255, 255, 255, 0.25)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
          }}
        >
          {/* Logo */}
          <div className="mb-8">
            <img
              src={logoCompleto}
              alt="Smarter"
              className="h-14 mb-4"
            />
            <h1 className="text-2xl font-bold text-gray-900">
              Bienvenido a Smarter
            </h1>
          </div>

          {/* Heading */}
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-gray-800">
              Inicia sesión
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Ingresa tus credenciales para acceder a la plataforma
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            <div>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 transition-colors peer-focus:text-brand-600">
                  <Mail size={18} />
                </span>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  placeholder=" "
                  className={`peer w-full pl-11 pr-4 pt-5 pb-2 border rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all bg-transparent ${error ? 'border-red-400' : 'border-gray-300'}`}
                />
                <label
                  htmlFor="email"
                  className="absolute left-11 top-1/2 -translate-y-1/2 text-sm text-gray-500 transition-all duration-200 pointer-events-none peer-focus:top-2 peer-focus:translate-y-0 peer-focus:text-xs peer-focus:text-brand-600 peer-[:not(:placeholder-shown)]:top-2 peer-[:not(:placeholder-shown)]:translate-y-0 peer-[:not(:placeholder-shown)]:text-xs"
                >
                  Correo electrónico
                </label>
              </div>
            </div>

            <div>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 transition-colors peer-focus:text-brand-600">
                  <Lock size={18} />
                </span>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder=" "
                  className={`peer w-full pl-11 pr-11 pt-5 pb-2 border rounded-lg text-sm focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none transition-all bg-transparent ${error ? 'border-red-400' : 'border-gray-300'}`}
                />
                <label
                  htmlFor="password"
                  className="absolute left-11 top-1/2 -translate-y-1/2 text-sm text-gray-500 transition-all duration-200 pointer-events-none peer-focus:top-2 peer-focus:translate-y-0 peer-focus:text-xs peer-focus:text-brand-600 peer-[:not(:placeholder-shown)]:top-2 peer-[:not(:placeholder-shown)]:translate-y-0 peer-[:not(:placeholder-shown)]:text-xs"
                >
                  Contraseña
                </label>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <p className={`mt-1.5 text-xs h-4 transition-opacity duration-200 ${error ? 'text-red-500 opacity-100' : 'opacity-0'}`}>
                {error || '\u00A0'}
              </p>
            </div>

            {/* Remember me + Forgot password */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={rememberMe}
                  onClick={() => setRememberMe(!rememberMe)}
                  className={`h-5 w-5 rounded border-2 flex items-center justify-center transition-all duration-200 cursor-pointer ${
                    rememberMe
                      ? 'bg-brand-800 border-brand-800'
                      : 'border-gray-300 bg-transparent hover:border-brand-500'
                  }`}
                >
                  <motion.svg
                    viewBox="0 0 12 10"
                    className="h-3 w-3"
                    fill="none"
                    stroke="white"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <motion.path
                      d="M1 5.5L4 8.5L11 1.5"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: rememberMe ? 1 : 0 }}
                      transition={{ duration: 0.3, ease: 'easeOut' }}
                    />
                  </motion.svg>
                </button>
                <label
                  onClick={() => setRememberMe(!rememberMe)}
                  className="text-sm text-gray-600 cursor-pointer select-none"
                >
                  Recordarme
                </label>
              </div>
              <button
                type="button"
                className="text-sm text-brand-700 hover:text-brand-900 font-medium transition-colors"
              >
                ¿Olvidaste tu contraseña?
              </button>
            </div>

            <button
              ref={buttonRef}
              type="submit"
              disabled={!isFormValid || isSubmitting}
              onClick={handleRipple}
              className="relative w-full bg-brand-800 hover:bg-brand-700 text-white font-medium py-2.5 px-4 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed text-sm overflow-hidden shadow-lg backdrop-blur-sm border border-white/10"
            >
              {/* Glass shine effect */}
              <span className="absolute inset-0 rounded-lg bg-gradient-to-br from-white/20 via-white/5 to-transparent pointer-events-none" />
              {ripples.map((ripple) => (
                <span
                  key={ripple.id}
                  className="absolute rounded-full bg-white/30 animate-[ripple_0.6s_ease-out]"
                  style={{
                    left: ripple.x - 50,
                    top: ripple.y - 50,
                    width: 100,
                    height: 100,
                  }}
                />
              ))}
              {isSubmitting ? (
                <span className="flex items-center justify-center gap-2">
                  <svg
                    className="animate-spin h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Ingresando...
                </span>
              ) : (
                'Iniciar sesión'
              )}
            </button>

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-white/60 px-3 text-gray-400">o continúa con</span>
              </div>
            </div>

            {/* Google button */}
            <button
              type="button"
              className="w-full flex items-center justify-center gap-3 py-2.5 px-4 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 transition-colors text-sm font-medium text-gray-700"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Iniciar sesión con Google
            </button>
          </form>

          {/* Footer */}
          <p className="mt-8 text-center text-xs text-gray-400">
            © 2026 Smarter · Reach further, connect smarter
          </p>
        </motion.div>
      </div>

      {/* Right side - Background image with content overlay */}
      <motion.div
        className="hidden lg:flex flex-1 items-center justify-center p-4"
        initial={{ opacity: 1, x: 0 }}
        animate={isExiting ? { opacity: 0, x: 200 } : { opacity: 1, x: 0 }}
        transition={{ duration: isExiting ? 1.2 : 0.6, ease: [0.22, 1, 0.36, 1] }}
      >
        <div
          className="w-full h-full rounded-2xl relative overflow-hidden flex items-center justify-center"
          style={{
            backgroundImage: `url(${loginBg})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative z-10 text-center px-12">
            <img
              src={heroBg}
              alt="StrateCast Platform"
              className="max-w-md mx-auto mb-8 drop-shadow-2xl brightness-150 grayscale invert"
            />
            <h2 className="text-2xl font-bold text-white mb-3">
              Gestiona tus campañas
            </h2>
            <p className="text-gray-300 text-sm max-w-sm mx-auto">
              Plataforma integral para la gestión de campañas, clientes y comunicaciones multicanal.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
