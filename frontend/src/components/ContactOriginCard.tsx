import { useEffect, useState } from "react";
import { Megaphone, ChevronDown, ChevronUp } from "lucide-react";
import { getTouchpoints } from "@/services/api";
import type { ClientRecord, TouchpointRecord } from "@/services/api";

const PLATFORM_LABELS: Record<string, string> = {
  meta: "Meta Ads",
  google: "Google Ads",
  microsoft: "Microsoft Ads",
  tiktok: "TikTok Ads",
  linkedin: "LinkedIn Ads",
  twitter: "X Ads",
  organic: "Orgánico",
  direct: "Directo",
};

const platformLabel = (p?: string | null) => (p ? PLATFORM_LABELS[p] || p : "—");

interface TouchData {
  platform?: string | null;
  medium?: string | null;
  campaign?: string | null;
  content?: string | null;
  term?: string | null;
  clickId?: string | null;
  landingPage?: string | null;
  referrer?: string | null;
  at?: string | null;
}

function Row({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex items-start justify-between gap-3 text-xs">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-foreground text-right break-all" title={value}>
        {value.length > 80 ? `${value.slice(0, 80)}…` : value}
      </span>
    </div>
  );
}

function TouchBlock({ title, touch }: { title: string; touch: TouchData }) {
  const hasData = !!(touch.platform || touch.campaign || touch.landingPage);
  return (
    <div className="rounded-lg border border-border p-3 space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-foreground">{title}</span>
        {touch.at && (
          <span className="text-[11px] text-muted-foreground">
            {new Date(touch.at).toLocaleString("es-CO")}
          </span>
        )}
      </div>
      {hasData ? (
        <>
          <Row label="Plataforma" value={platformLabel(touch.platform)} />
          <Row label="Medio" value={touch.medium} />
          <Row label="Campaña" value={touch.campaign} />
          <Row label="Contenido" value={touch.content} />
          <Row label="Término" value={touch.term} />
          <Row label="Click ID" value={touch.clickId} />
          <Row label="Landing" value={touch.landingPage} />
          <Row label="Referrer" value={touch.referrer} />
        </>
      ) : (
        <p className="text-xs text-muted-foreground">Sin datos</p>
      )}
    </div>
  );
}

/** Origen del contacto: first touch, last touch e historial de touchpoints. */
export function ContactOriginCard({ client, tenantId }: { client: ClientRecord; tenantId: string }) {
  const [touchpoints, setTouchpoints] = useState<TouchpointRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    if (!tenantId || !client.id) return;
    setLoading(true);
    getTouchpoints(tenantId, client.id)
      .then(setTouchpoints)
      .catch(() => setTouchpoints([]))
      .finally(() => setLoading(false));
  }, [tenantId, client.id]);

  const first: TouchData = {
    platform: client.firstTouchPlatform,
    medium: client.firstTouchMedium,
    campaign: client.firstTouchCampaign,
    content: client.firstTouchContent,
    term: client.firstTouchTerm,
    clickId: client.firstTouchClickId,
    landingPage: client.firstTouchLandingPage,
    referrer: client.firstTouchReferrer,
    at: client.firstTouchAt,
  };
  const last: TouchData = {
    platform: client.lastTouchPlatform,
    medium: client.lastTouchMedium,
    campaign: client.lastTouchCampaign,
    content: client.lastTouchContent,
    term: client.lastTouchTerm,
    clickId: client.lastTouchClickId,
    landingPage: client.lastTouchLandingPage,
    referrer: client.lastTouchReferrer,
    at: client.lastTouchAt,
  };

  const hasTouch = !!client.firstTouchAt || !!client.lastTouchAt;
  const sameTouch = !!client.firstAdEventId && client.firstAdEventId === client.lastAdEventId;

  return (
    <div className="bg-card rounded-xl border border-border p-5">
      <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
        <Megaphone className="h-4 w-4 text-blue-600" />
        Origen
      </h3>

      {client.source && (
        <div className="mb-3">
          <Row label="Fuente" value={client.source} />
        </div>
      )}

      {hasTouch ? (
        <div className="space-y-2">
          <TouchBlock title={sameTouch ? "Primer y último toque" : "Primer toque"} touch={first} />
          {!sameTouch && <TouchBlock title="Último toque" touch={last} />}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground py-2 text-center">
          Sin datos de atribución de anuncios
        </p>
      )}

      {(loading || touchpoints.length > 0) && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            aria-expanded={showHistory}
            className="w-full flex items-center justify-between text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <span>Historial de touchpoints{touchpoints.length > 0 ? ` (${touchpoints.length})` : ""}</span>
            {showHistory ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>

          {showHistory && (
            <div className="mt-2 space-y-2">
              {loading ? (
                <div className="flex items-center justify-center py-4">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-emerald-600" />
                </div>
              ) : (
                touchpoints.map((t) => (
                  <div key={t.id} className="rounded-lg border border-border p-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-foreground">{platformLabel(t.platform)}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {new Date(t.createdAt).toLocaleString("es-CO")}
                      </span>
                    </div>
                    <Row label="Medio" value={t.utmMedium} />
                    <Row label="Campaña" value={t.utmCampaign} />
                    <Row label="Anuncio" value={t.adHeadline} />
                    <Row label="ID de anuncio" value={t.adSourceId} />
                    <Row label="Contenido" value={t.utmContent} />
                    <Row label="Término" value={t.utmTerm} />
                    <Row label={t.clickIdType || "Click ID"} value={t.clickId} />
                    <Row label="Landing" value={t.landingPage} />
                    <Row label="Referrer" value={t.referrer} />
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
