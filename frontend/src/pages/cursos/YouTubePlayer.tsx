import { useEffect, useRef } from "react";

/**
 * Reproductor de YouTube con la IFrame Player API. Rastrea el progreso real de
 * reproducción y dispara onWatched cuando se alcanza el umbral (default 90%) o
 * al terminar el video. Se usa para marcar una clase/material como consumido de
 * forma fiable (no por un temporizador de pestaña abierta, que es burlable).
 */

// Carga única del script de la IFrame API.
let apiReadyPromise: Promise<void> | null = null;
function loadYouTubeApi(): Promise<void> {
  if (apiReadyPromise) return apiReadyPromise;
  apiReadyPromise = new Promise<void>((resolve) => {
    const w = window as any;
    if (w.YT && w.YT.Player) {
      resolve();
      return;
    }
    const prev = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      prev?.();
      resolve();
    };
    if (!document.getElementById("youtube-iframe-api")) {
      const tag = document.createElement("script");
      tag.id = "youtube-iframe-api";
      tag.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag);
    }
  });
  return apiReadyPromise;
}

export function YouTubePlayer({
  videoId,
  threshold = 0.9,
  onWatched,
}: {
  videoId: string;
  threshold?: number;
  onWatched: () => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const playerRef = useRef<any>(null);
  const firedRef = useRef(false);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    let disposed = false;
    firedRef.current = false;

    loadYouTubeApi().then(() => {
      if (disposed || !iframeRef.current) return;
      const w = window as any;
      // Adjuntamos la API a un <iframe> real (con enablejsapi/playsinline y los
      // atributos `allow` correctos) en vez de dejar que la API reemplace un
      // <div>. Esto es lo que permite la reproducción inline en móviles.
      playerRef.current = new w.YT.Player(iframeRef.current, {
        events: {
          onStateChange: (e: any) => {
            // 1 = playing, 0 = ended
            if (e.data === w.YT.PlayerState.ENDED) fire();
            if (e.data === w.YT.PlayerState.PLAYING) startPolling();
            else stopPolling();
          },
        },
      });
    });

    const startPolling = () => {
      if (pollRef.current) return;
      pollRef.current = window.setInterval(() => {
        const p = playerRef.current;
        if (!p || typeof p.getCurrentTime !== "function") return;
        const dur = p.getDuration?.() || 0;
        const cur = p.getCurrentTime?.() || 0;
        if (dur > 0 && cur / dur >= threshold) fire();
      }, 2000);
    };
    const stopPolling = () => {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
    const fire = () => {
      if (firedRef.current) return;
      firedRef.current = true;
      stopPolling();
      onWatched();
    };

    return () => {
      disposed = true;
      stopPolling();
      try {
        playerRef.current?.destroy?.();
      } catch {
        /* noop */
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  // enablejsapi=1 → la API puede controlar/leer el iframe. playsinline=1 y el
  // atributo allow con "autoplay; encrypted-media; ..." son necesarios para que
  // el video se reproduzca dentro de la página en iOS/Android (y no abra la app
  // de YouTube o quede en modo "Mirar en YouTube").
  const src =
    `https://www.youtube.com/embed/${videoId}` +
    `?enablejsapi=1&rel=0&modestbranding=1&playsinline=1&origin=${encodeURIComponent(window.location.origin)}`;

  return (
    <div className="overflow-hidden aspect-video bg-black sm:rounded-xl">
      <iframe
        ref={iframeRef}
        className="w-full h-full"
        src={src}
        title="Reproductor de video"
        frameBorder={0}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
      />
    </div>
  );
}
