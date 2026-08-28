/**
 * Loader de pantalla completa que muestra el isotipo de Smarter "latiendo".
 * Se usa como fallback de <Suspense> mientras se cargan los chunks de ruta.
 */
export function AppLoader() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-white">
      <style>{`
        @keyframes smarter-heartbeat {
          0%, 100% { transform: scale(1); opacity: 1; }
          25%      { transform: scale(1.12); opacity: 0.85; }
          50%      { transform: scale(0.96); opacity: 1; }
          75%      { transform: scale(1.06); opacity: 0.9; }
        }
        @keyframes smarter-glow {
          0%, 100% { opacity: 0.15; transform: scale(0.9); }
          50%      { opacity: 0.35; transform: scale(1.25); }
        }
        @media (prefers-reduced-motion: reduce) {
          .smarter-loader-icon { animation: none !important; }
          .smarter-loader-glow { animation: none !important; }
        }
      `}</style>

      <div className="relative flex items-center justify-center">
        {/* Halo suave detrás del isotipo */}
        <div
          className="smarter-loader-glow absolute h-24 w-24 rounded-full"
          style={{
            background:
              "radial-gradient(circle, var(--color-brand-500, #2a4d6e) 0%, transparent 70%)",
            animation: "smarter-glow 1.6s ease-in-out infinite",
          }}
          aria-hidden="true"
        />

        {/* Isotipo de Smarter */}
        <svg
          className="smarter-loader-icon relative"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 55.4 55.9"
          width={64}
          height={64}
          role="img"
          aria-label="Cargando"
          style={{
            fill: "var(--color-brand-900, #0a1520)",
            animation: "smarter-heartbeat 1.6s ease-in-out infinite",
            transformOrigin: "center",
          }}
        >
          <path d="M4.6,45.7h19.5c4.2.1,8.4.1,12.3-1.4s7.5-5.7,8.3-9.5-.8-9.2-3.9-12.8l-2.7-3.1h13.7c4.6,7.7,5,16.8.4,25s-11.7,11.8-20.4,11.9H4.6c0,.1,0-10,0-10Z" />
          <path d="M22.8,10.3c-5.2,0-9.4,4-11,7.4-2.3,5-1.9,10.3,1.4,14.4l3.9,4.8H3.7c-4.7-7.8-5.1-17-.4-25S15.4,0,24.1,0h26.7c0,0,0,10.1,0,10.1l-27.9.2Z" />
          <path d="M36.1,29.3c2,2,1,5.5-.4,6.8-2.1,1.9-5.2,2-7.2,0l-9-9c-1.9-1.9-1.1-5.6.7-7s5-1.9,7.2.3l8.7,8.9Z" />
        </svg>
      </div>
    </div>
  );
}
