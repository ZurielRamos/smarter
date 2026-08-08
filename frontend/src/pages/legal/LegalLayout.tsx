import { Link, useLocation } from "react-router-dom";
import logo from "@/assets/logo.svg";

export function LegalLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();

  const navLinks = [
    { to: "/privacy", label: "Política de Privacidad" },
    { to: "/terms", label: "Condiciones del Servicio" },
    { to: "/data-deletion", label: "Eliminación de Datos" },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link to="/" className="flex items-center gap-2">
              <img src={logo} alt="Smarter" className="h-7" />
            </Link>
            <nav className="hidden sm:flex items-center gap-6">
              {navLinks.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className={`text-sm transition-colors ${location.pathname === link.to ? "text-gray-900 font-medium" : "text-gray-500 hover:text-gray-700"}`}
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 py-12 px-4">
        <div className="max-w-3xl mx-auto">
          {children}
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 py-8">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <img src={logo} alt="Smarter" className="h-5 opacity-60" />
              <span className="text-xs text-gray-400">© {new Date().getFullYear()} Todos los derechos reservados.</span>
            </div>
            <div className="flex items-center gap-4">
              {navLinks.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-gray-100 text-center">
            <p className="text-[11px] text-gray-400">
              Smarter es una plataforma de comunicaciones empresariales desarrollada por Strategee.
              Para consultas: notificaciones@strategee.us
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
