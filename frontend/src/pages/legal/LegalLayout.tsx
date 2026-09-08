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
    <div className="min-h-screen flex flex-col bg-muted">
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-10">
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
                  className={`text-sm transition-colors ${location.pathname === link.to ? "text-foreground font-medium" : "text-muted-foreground hover:text-foreground"}`}
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
      <footer className="bg-card border-t border-border py-8">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <img src={logo} alt="Smarter" className="h-5 opacity-60" />
              <span className="text-xs text-muted-foreground">© {new Date().getFullYear()} Todos los derechos reservados.</span>
            </div>
            <div className="flex items-center gap-4">
              {navLinks.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className="text-xs text-muted-foreground hover:text-muted-foreground transition-colors"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-border text-center">
            <p className="text-[11px] text-muted-foreground">
              Smarter es una plataforma de comunicaciones empresariales desarrollada por Strategee.
              Para consultas: notificaciones@strategee.us
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
