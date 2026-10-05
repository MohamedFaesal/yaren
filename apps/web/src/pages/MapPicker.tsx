import { useEffect, useRef, useState } from "react";

type LeafletMap = {
  setView: (center: [number, number], zoom: number) => LeafletMap;
  on: (event: string, handler: (event: { latlng: { lat: number; lng: number } }) => void) => void;
  off: (event: string) => void;
  remove: () => void;
  invalidateSize: () => void;
};

type LeafletMarker = {
  setLatLng: (point: [number, number]) => LeafletMarker;
  addTo: (map: LeafletMap) => LeafletMarker;
  on: (event: string, handler: (event: { latlng: { lat: number; lng: number } }) => void) => void;
  remove: () => void;
};

type LeafletNamespace = {
  map: (element: HTMLElement, options: { zoomControl: boolean; attributionControl: boolean }) => LeafletMap;
  tileLayer: (url: string, options: { attribution: string; maxZoom: number }) => { addTo: (map: LeafletMap) => void };
  marker: (point: [number, number], options?: { draggable?: boolean }) => LeafletMarker;
};

declare global {
  interface Window {
    L?: LeafletNamespace;
  }
}

const leafletCss = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const leafletJs = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";

async function loadLeaflet() {
  if (window.L) return window.L;
  if (!document.querySelector(`link[href="${leafletCss}"]`)) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = leafletCss;
    document.head.append(link);
  }
  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(`script[src="${leafletJs}"]`);
    if (existing) {
      if (window.L) {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Map failed to load")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = leafletJs;
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(new Error("Map failed to load")), { once: true });
    document.head.append(script);
  });
  if (!window.L) throw new Error("Map failed to load");
  return window.L;
}

export function MapPicker({
  lat,
  lng,
  center,
  disabled,
  onChange,
}: {
  lat: number | null;
  lng: number | null;
  center: { lat: number; lng: number };
  disabled?: boolean;
  onChange: (point: { lat: number; lng: number }) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<LeafletMarker | null>(null);
  const onChangeRef = useRef(onChange);
  const disabledRef = useRef(disabled);
  const [ready, setReady] = useState(false);
  onChangeRef.current = onChange;
  disabledRef.current = disabled;

  useEffect(() => {
    let cancelled = false;
    loadLeaflet().then((L) => {
      if (cancelled || !root.current || mapRef.current) return;
      const map = L.map(root.current, { zoomControl: true, attributionControl: true }).setView([center.lat, center.lng], 12);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap",
        maxZoom: 19,
      }).addTo(map);
      map.on("click", (event) => {
        if (disabledRef.current) return;
        onChangeRef.current({ lat: roundCoord(event.latlng.lat), lng: roundCoord(event.latlng.lng) });
      });
      mapRef.current = map;
      setReady(true);
      window.setTimeout(() => map.invalidateSize(), 80);
    }).catch(() => undefined);
    return () => {
      cancelled = true;
      mapRef.current?.off("click");
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const L = window.L;
    if (!ready || !map || !L) return;
    map.setView([center.lat, center.lng], lat == null ? 12 : 14);
    if (lat == null || lng == null) {
      markerRef.current?.remove();
      markerRef.current = null;
      return;
    }
    if (!markerRef.current) {
      const marker = L.marker([lat, lng], { draggable: !disabled });
      marker.on("dragend", (event) => {
        onChangeRef.current({ lat: roundCoord(event.latlng.lat), lng: roundCoord(event.latlng.lng) });
      });
      marker.addTo(map);
      markerRef.current = marker;
      return;
    }
    markerRef.current.setLatLng([lat, lng]);
  }, [ready, center.lat, center.lng, lat, lng, disabled]);

  return (
    <div className="mt-1 overflow-hidden rounded-xl border border-line-strong">
      <div ref={root} className="h-72 w-full bg-surface-2" />
      <p className="border-t border-line-soft bg-surface-2 px-3 py-2 text-xs text-muted-strong">
        {disabled
          ? "The pin is read-only on this page."
          : lat == null || lng == null
            ? "Click the map to place the hotel."
            : `Pin at ${lat.toFixed(5)}, ${lng.toFixed(5)}. Click again or drag the pin to move it.`}
      </p>
    </div>
  );
}

export function StaticMap({ lat, lng }: { lat: number; lng: number }) {
  return <MapPicker lat={lat} lng={lng} center={{ lat, lng }} disabled onChange={() => undefined} />;
}

function roundCoord(value: number) {
  return Math.round(value * 100000) / 100000;
}
