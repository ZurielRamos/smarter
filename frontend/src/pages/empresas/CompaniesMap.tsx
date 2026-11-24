import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { OrganizationType } from "@/services/companies";

export interface MapMarker {
  id: string;
  name: string;
  type: OrganizationType;
  lat: number;
  lng: number;
  /** Segunda línea del tooltip (ciudad o dirección). */
  subtitle?: string | null;
}

const COLORS: Record<OrganizationType, string> = {
  client: "#2563eb",
  establishment: "#9333ea",
  other: "#6b7280",
};

interface Props {
  markers: MapMarker[];
  /** Se llama al hacer clic en un marcador. Sin él, los marcadores no son clicables. */
  onSelect?: (id: string) => void;
  /** Altura CSS del mapa. */
  height?: string;
  /** Mapa fijo (sin arrastre ni zoom), para miniaturas. */
  interactive?: boolean;
}

/**
 * Mapa con marcadores vectoriales (sin imágenes de icono, que Leaflet no resuelve
 * bien con los empaquetadores). Los nombres se insertan como texto, nunca como HTML.
 */
export function CompaniesMap({ markers, onSelect, height = "100%", interactive = true }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, {
      zoomControl: interactive,
      dragging: interactive,
      scrollWheelZoom: interactive,
      doubleClickZoom: interactive,
      boxZoom: interactive,
      keyboard: interactive,
      touchZoom: interactive,
    }).setView([4.6, -74.1], 5);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
      layer.current = null;
    };
  }, [interactive]);

  useEffect(() => {
    const m = map.current;
    const group = layer.current;
    if (!m || !group) return;
    group.clearLayers();
    markers.forEach((p) => {
      const marker = L.circleMarker([p.lat, p.lng], {
        radius: 8,
        color: "#ffffff",
        weight: 2,
        fillColor: COLORS[p.type],
        fillOpacity: 0.9,
      });
      const tip = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = p.name;
      tip.appendChild(title);
      if (p.subtitle) {
        const sub = document.createElement("div");
        sub.textContent = p.subtitle;
        tip.appendChild(sub);
      }
      marker.bindTooltip(tip);
      if (onSelectRef.current) marker.on("click", () => onSelectRef.current?.(p.id));
      marker.addTo(group);
    });
    if (markers.length === 1) {
      m.setView([markers[0].lat, markers[0].lng], 15);
    } else if (markers.length > 1) {
      m.fitBounds(L.latLngBounds(markers.map((p) => [p.lat, p.lng] as [number, number])), { padding: [30, 30], maxZoom: 16 });
    }
    // Tras mostrarse en un contenedor que cambió de tamaño, Leaflet necesita recalcular.
    m.invalidateSize();
  }, [markers]);

  return <div ref={el} style={{ height }} className="z-0 w-full rounded-lg" role="img" aria-label="Mapa de empresas" />;
}
