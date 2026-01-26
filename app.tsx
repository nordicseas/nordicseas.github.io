import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Map } from "react-map-gl/maplibre";
import DeckGL, { DeckGLRef } from "@deck.gl/react";
import {
  COORDINATE_SYSTEM,
  WebMercatorViewport,
  type MapViewState,
} from "@deck.gl/core";
import { BitmapLayer, TextLayer } from "@deck.gl/layers";
import ParticleLayer from "./particle-layer";

const MAP_STYLE =
  "https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json";

// lon/lat bounds for your uv_*.png
const BOUNDS: [number, number, number, number] = [-30, 57.67, 23.28, 81.5];

// Tune particle speed to match the "simple" repo's default feel.
// That demo is tuned around ~zoom 3.8 with speedFactor ~3.
const FLOW_REFERENCE_ZOOM = 3.8;
const FLOW_REFERENCE_SPEED_FACTOR = 3;

function clamp(n: number, min: number, max: number) {
  return Math.min(Math.max(n, min), max);
}

function generateIsoDates(startIso: string, endIso: string, stepDays: number) {
  const start = new Date(`${startIso}T00:00:00Z`);
  const end = new Date(`${endIso}T00:00:00Z`);
  const stepMs = stepDays * 24 * 60 * 60 * 1000;
  const out: string[] = [];
  for (let t = start.getTime(); t <= end.getTime(); t += stepMs) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

// Must match filenames in `public/` (e.g. `uv_YYYY-MM-DD.png`).
const DATES = generateIsoDates("2010-01-04", "2011-12-30", 5);

function formatDateLabel(isoDate: string) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${y} ${monthNames[m - 1]} ${String(d).padStart(2, "0")}`;
}

export default function App() {
  const ref = useRef<DeckGLRef>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const [panelOpen, setPanelOpen] = useState(false);
  const [sourceMode, setSourceMode] = useState<"simulation" | "observation">(
    "simulation"
  );
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [fps, setFps] = useState(1);
  const [blend, setBlend] = useState(0);
  const [overlay, setOverlay] = useState<
    "mag" | "deep" | "vort" | "sst" | "sss" | "ice" | "wind" | "wind10" | "topo"
  >("topo");
  const [showParticles, setShowParticles] = useState(true);
  const [showWindFlow, setShowWindFlow] = useState(false);
  const [movieOn, setMovieOn] = useState(false);
  const [audioOn, setAudioOn] = useState(false);

  const idxRef = useRef(idx);
  const [viewportSize, setViewportSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });
  const [panelPos, setPanelPos] = useState<{ left: number; top: number } | null>(
    null
  );
  const OPEN_BUTTON_INSET = { dx: 8, dy: -48 };
  const [openButtonOffset, setOpenButtonOffset] = useState({ dx: 0, dy: 0 });
  const openButtonDragRef = useRef<{
    dragging: boolean;
    pointerId: number | null;
    startX: number;
    startY: number;
    startOffsetX: number;
    startOffsetY: number;
    moved: boolean;
  }>({
    dragging: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    startOffsetX: 0,
    startOffsetY: 0,
    moved: false,
  });
  const [tooltip, setTooltip] = useState<{
    text: string;
    left: number;
    top: number;
  } | null>(null);

  const overlaySupportsObservation =
    overlay === "mag" ||
    overlay === "sst" ||
    overlay === "sss" ||
    overlay === "ice" ||
    overlay === "wind10";

  const dataOptions = useMemo(() => {
    const all = [
      { id: "topo", label: "Topo" },
      { id: "mag", label: "Surface Currents" },
      { id: "deep", label: "Deep Currents" },
      { id: "vort", label: "Vorticity" },
      { id: "sst", label: "SST" },
      { id: "sss", label: "SSS" },
      { id: "ice", label: "Ice" },
      { id: "wind", label: "Wind Stress" },
      { id: "wind10", label: "10m Wind" },
    ] as const;

    if (sourceMode === "observation") {
      return all.filter(
        (o) =>
          o.id === "topo" ||
          o.id === "mag" ||
          o.id === "sst" ||
          o.id === "sss" ||
          o.id === "ice" ||
          o.id === "wind10"
      );
    }
    return all.filter((o) => o.id !== "wind10");
  }, [sourceMode]);

  const frames = useMemo(() => {
    const base = import.meta.env.BASE_URL;
    const folder = sourceMode === "observation" ? "observation/" : "";
    return DATES.map((d) => `${base}${folder}uv_${d}.png`);
  }, [overlay, sourceMode]);
  const windFrames = useMemo(() => {
    const base = import.meta.env.BASE_URL;
    const folder = sourceMode === "observation" ? "observation/" : "";
    return DATES.map((d) => `${base}${folder}wind_${d}.png`);
  }, [sourceMode]);
  const deepFrames = useMemo(() => {
    const base = import.meta.env.BASE_URL;
    return DATES.map((d) => `${base}uvdeep_${d}.png`);
  }, []);

  useEffect(() => {
    idxRef.current = idx;
  }, [idx]);

  useEffect(() => {
    const onResize = () => {
      setViewportSize({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!panelOpen) return;
    if (panelPos) return;
    const el = panelRef.current;
    if (!el) return;
    const id = window.requestAnimationFrame(() => {
      const rect = el.getBoundingClientRect();
      setPanelPos({
        left: 12,
        top: Math.max(12, window.innerHeight - rect.height - 12),
      });
    });
    return () => window.cancelAnimationFrame(id);
  }, [panelOpen, panelPos]);

  useEffect(() => {
    setPlaying(movieOn);
  }, [movieOn]);

  useEffect(() => {
    setShowParticles(
      !(overlay === "deep" || overlay === "wind" || overlay === "wind10")
    );
  }, [overlay]);

  useEffect(() => {
    if (overlay === "wind" || overlay === "wind10") {
      setShowWindFlow(true);
    }
  }, [overlay]);

  const surfaceFlowToggleEnabled =
    overlay !== "deep" && overlay !== "wind" && overlay !== "wind10";
  const windFlowToggleEnabled = true;

  useEffect(() => {
    if (!playing) {
      setBlend(0);
      return;
    }
    const startTime = performance.now();
    const startIdx = idxRef.current;
    const frameMs = Math.max(80, Math.round(1000 / fps));
    let rafId = 0;

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const frame = Math.floor(elapsed / frameMs);
      const nextIdx = (startIdx + frame) % frames.length;
      const nextBlend = (elapsed % frameMs) / frameMs;
      if (nextIdx !== idxRef.current) {
        setIdx(nextIdx);
      }
      setBlend(nextBlend);
      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [playing, fps, frames.length]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audioOn) {
      audio.play().catch(() => {
        setAudioOn(false);
      });
    } else {
      audio.pause();
      audio.currentTime = 0;
    }
  }, [audioOn]);

  const currentDate = DATES[idx];
  const nextIdx = (idx + 1) % frames.length;
  const surfaceImageUrl = frames[idx];
  const surfaceImageNextUrl = frames[nextIdx];
  const deepImageUrl = deepFrames[idx];
  const deepImageNextUrl = deepFrames[nextIdx];
  const windImageUrl = windFrames[idx];
  const windImageNextUrl = windFrames[nextIdx];

  const overlayFrames = useMemo(() => {
    const base =
      import.meta.env.BASE_URL +
      (sourceMode === "observation" && overlaySupportsObservation
        ? "observation/"
        : "");
    if (overlay === "topo") {
      return DATES.map(() => `${import.meta.env.BASE_URL}topography.png`);
    }
	    const prefix =
	      overlay === "ice"
	        ? "SI"
	        : overlay === "wind"
	          ? "windmag"
	          : overlay === "wind10"
	            ? "windmag"
	          : overlay === "deep"
	            ? "magdeep"
	            : overlay === "vort"
	              ? "Ro"
	              : overlay;
    return DATES.map((d) => `${base}${prefix}_${d}.png`);
  }, [overlay, overlaySupportsObservation, sourceMode]);

  const magUrl = overlayFrames[idx];
  const magNextUrl = overlayFrames[nextIdx];
  const magOpacity = 0.45;

  const overlayMeta = useMemo(() => {
    const gradients = {
      mag: {
        scaleLabel: "Scale:",
        minLabel: "slow",
        maxLabel: "fast",
        gradient:
          // parula (MATLAB)
          "linear-gradient(90deg, #352A87, #0363E1, #1485D4, #06A7C6, #38B99E, #92BF73, #D9BA56, #FCCE2E, #F9FB0E)",
      },
      deep: {
        scaleLabel: "Scale:",
        minLabel: "slow",
        maxLabel: "fast",
        gradient:
          // parula (MATLAB)
          "linear-gradient(90deg, #352A87, #0363E1, #1485D4, #06A7C6, #38B99E, #92BF73, #D9BA56, #FCCE2E, #F9FB0E)",
      },
      vort: {
        scaleLabel: "Scale:",
        minLabel: "negative",
        maxLabel: "positive",
        gradient:
          // cmocean.cm.curl
          "linear-gradient(90deg, #151D44, #1B5968, #2C947F, #A3C2A2, #FFF6F4, #E2A78F, #C35961, #852060, #340D35)",
      },
      sst: {
        scaleLabel: "Scale (°C):",
        minLabel: "cold",
        maxLabel: "warm",
        gradient:
          "linear-gradient(90deg, #053061, #2166ac, #4393c3, #92c5de, #f7f7f7, #f4a582, #d6604d, #b2182b, #67001f)",
      },
      sss: {
        scaleLabel: "Scale (psu):",
        minLabel: "fresh",
        maxLabel: "salty",
        gradient:
          "linear-gradient(90deg, #2a1867, #2f5a9e, #1a8bb6, #16b6b6, #5bd4b5, #bfe3a3, #f4d08a)",
      },
      ice: {
        scaleLabel: "Scale: (concentration)",
        minLabel: "0",
        maxLabel: "1",
        gradient:
          // cmocean.cm.ice
          "linear-gradient(90deg, #040613, #212041, #383975, #3F57A3, #427BB7, #589DC3, #7BBFD0, #B1DEE2, #EAFDFD)",
      },
      wind: {
        scaleLabel: "Scale (N/m^2):",
        minLabel: "0",
        maxLabel: "1",
        gradient:
          // cmocean.cm.amp
          "linear-gradient(90deg, #F1EDEC, #E2C7BF, #D7A291, #CC7E64, #C0583B, #AF3024, #901029, #650F24, #3C0912)",
      },
      wind10: {
        scaleLabel: "Scale (m/s):",
        minLabel: "low",
        maxLabel: "high",
        gradient:
          // cmocean.cm.amp
          "linear-gradient(90deg, #F1EDEC, #E2C7BF, #D7A291, #CC7E64, #C0583B, #AF3024, #901029, #650F24, #3C0912)",
      },
      topo: {
        scaleLabel: "Depth (m):",
        minLabel: "50",
        maxLabel: "4200",
        gradient:
          "linear-gradient(90deg, #F7FBFF, #DEEBF7, #C6DBEF, #9ECAE1, #6BAED6, #4292C6, #2171B5, #08519C, #08306B)",
      },
    } as const;
    return gradients[overlay];
  }, [overlay]);

  const initialViewState = useMemo((): MapViewState => {
    const viewport = new WebMercatorViewport({
      width: viewportSize.width,
      height: viewportSize.height,
    });
    const { longitude, latitude, zoom } = viewport.fitBounds(
      [
        [BOUNDS[0], BOUNDS[1]],
        [BOUNDS[2], BOUNDS[3]],
      ],
      { padding: 40 }
    );
    return { longitude, latitude, zoom };
  }, [viewportSize.height, viewportSize.width]);

  const [viewState, setViewState] = useState<MapViewState>(initialViewState);

  useEffect(() => {
    // Re-fit to bounds when viewport size changes (e.g. mobile rotation),
    // but otherwise let the user pan/zoom without snapping back.
    setViewState((prev) => ({
      ...prev,
      ...initialViewState,
    }));
  }, [initialViewState.latitude, initialViewState.longitude, initialViewState.zoom]);

  const flowSpeedFactor = useMemo(() => {
    return (
      FLOW_REFERENCE_SPEED_FACTOR *
      2 ** (viewState.zoom - FLOW_REFERENCE_ZOOM)
    );
  }, [viewState.zoom]);

  const particleCount = useMemo(() => {
    const area = viewportSize.width * viewportSize.height;
    const referenceArea = 1280 * 720;
    const scaled = Math.round((15000 * area) / referenceArea);
    return clamp(scaled, 6000, 30000);
  }, [viewportSize.height, viewportSize.width]);

  const openButtonAnchorPx = useMemo(() => {
    const viewport = new WebMercatorViewport({
      width: viewportSize.width,
      height: viewportSize.height,
      longitude: viewState.longitude,
      latitude: viewState.latitude,
      zoom: viewState.zoom,
      bearing: viewState.bearing ?? 0,
      pitch: viewState.pitch ?? 0,
    });
    const [x, y] = viewport.project([BOUNDS[0], BOUNDS[1]]);
    return { x, y };
  }, [
    viewportSize.height,
    viewportSize.width,
    viewState.bearing,
    viewState.latitude,
    viewState.longitude,
    viewState.pitch,
    viewState.zoom,
  ]);

  const openButtonPos = useMemo(() => {
    const buttonSize = 40;
    const rawLeft = openButtonAnchorPx.x + OPEN_BUTTON_INSET.dx + openButtonOffset.dx;
    const rawTop = openButtonAnchorPx.y + OPEN_BUTTON_INSET.dy + openButtonOffset.dy;
    return {
      left: clamp(rawLeft, 12, window.innerWidth - buttonSize - 12),
      top: clamp(rawTop, 12, window.innerHeight - buttonSize - 12),
    };
  }, [OPEN_BUTTON_INSET.dx, OPEN_BUTTON_INSET.dy, openButtonAnchorPx.x, openButtonAnchorPx.y, openButtonOffset.dx, openButtonOffset.dy]);

  const isNarrowUi = viewportSize.width < 520;

  const layers = [
    new BitmapLayer({
      id: "magnitude-raster",
      image: magUrl,
      bounds: BOUNDS,
      opacity: magOpacity * (1 - blend),
      _imageCoordinateSystem:
        sourceMode === "observation" && overlaySupportsObservation
          ? COORDINATE_SYSTEM.LNGLAT
          : COORDINATE_SYSTEM.DEFAULT,
    }),
    new BitmapLayer({
      id: "magnitude-raster-next",
      image: magNextUrl,
      bounds: BOUNDS,
      opacity: magOpacity * blend,
      _imageCoordinateSystem:
        sourceMode === "observation" && overlaySupportsObservation
          ? COORDINATE_SYSTEM.LNGLAT
          : COORDINATE_SYSTEM.DEFAULT,
    }),
    ...(surfaceFlowToggleEnabled && showParticles
      ? [
          new ParticleLayer({
            id: "surface-flow",
            image: surfaceImageUrl,
            imageNext: surfaceImageNextUrl,
            blend,
            imageUnscale: [-128, 127],
            bounds: BOUNDS,
            numParticles: particleCount,
            maxAge: 50,
            speedFactor: flowSpeedFactor,
            color: [255, 255, 255, 255],
            colorScheme: "nullschool",
            width: 2,
            opacity: 0.8,
          }),
        ]
      : []),
    ...(overlay === "deep"
      ? [
          new ParticleLayer({
            id: "deep-flow",
            image: deepImageUrl,
            imageNext: deepImageNextUrl,
            blend,
            imageUnscale: [-128, 127],
            bounds: BOUNDS,
            numParticles: particleCount,
            maxAge: 45,
            speedFactor: flowSpeedFactor,
            color: [255, 255, 255, 255],
            colorScheme: "nullschool",
            width: 2,
            opacity: 0.8,
          }),
        ]
      : []),
    ...(showWindFlow
      ? [
          new ParticleLayer({
            id: "wind-flow",
            image: windImageUrl,
            imageNext: windImageNextUrl,
            blend,
            imageUnscale: [-128, 127],
            bounds: BOUNDS,
            numParticles: particleCount,
            maxAge: 45,
            speedFactor: flowSpeedFactor,
            color: [255, 255, 255, 255],
            colorScheme: "amp",
            width: 2,
            opacity: 0.85,
          }),
        ]
      : []),
    new TextLayer({
      id: "geo-labels",
      data: [
        { name: "Iceland", position: [-19.0, 64.9] },
        { name: "Greenland", position: [-40.0, 70.0], size: 16, weight: 500 },
        { name: "Svalbard", position: [15.0, 78.5] },
        { name: "Bergen,\nNorway", position: [7, 60.39] },
        { name: "UK", position: [-5.0, 58.0] },
      ],
      getText: (d) => d.name,
      getPosition: (d) => d.position,
      getSize: (d) => d.size ?? 12,
      sizeUnits: "pixels",
      getColor: [255, 255, 255, 220],
      fontFamily: "system-ui, sans-serif",
      getFontWeight: (d) => d.weight ?? 700,
      billboard: true,
    }),
    new TextLayer({
      id: "geo-markers",
      data: [{ position: [7, 60.39], label: "o" }],
      getText: (d) => d.label,
      getPosition: (d) => d.position,
      getSize: 12,
      sizeUnits: "pixels",
      getColor: [255, 255, 255, 220],
      fontFamily: "system-ui, sans-serif",
      fontWeight: 700,
      billboard: true,
    }),
  ];

		  return (
		    <div style={{ position: "relative", width: "100vw", height: "100vh" }}>
		      {tooltip && (
		        <div
		          style={{
		            position: "fixed",
		            left: tooltip.left + 140,
		            top: tooltip.top,
		            transform: "translate(-50%, -100%)",
		            background: "rgba(0,0,0,0.85)",
		            color: "white",
		            border: "1px solid rgba(255,255,255,0.18)",
		            borderRadius: 10,
		            padding: "8px 10px",
		            fontSize: 12,
		            lineHeight: 1.25,
		            whiteSpace: "pre-line",
		            maxWidth: 360,
		            pointerEvents: "none",
		            zIndex: 1000,
		          }}
		        >
		          {tooltip.text}
		        </div>
		      )}

		      <audio
		        ref={audioRef}
		        src={`${import.meta.env.BASE_URL}Dmitri Shostakovich Jazz Suite Waltz No.2.mp3`}
		        preload="auto"
	        loop
	      />

      <DeckGL
        ref={ref}
        layers={layers}
        viewState={viewState}
        onViewStateChange={({ viewState: next }) =>
          setViewState(next as MapViewState)
        }
        controller={true}
	      >
	        <Map reuseMaps mapStyle={MAP_STYLE} />
	      </DeckGL>

	        {!panelOpen && (
	          <button
	            type="button"
	            title="Open control panel"
	            onPointerDown={(e) => {
	              const drag = openButtonDragRef.current;
	              drag.dragging = true;
	              drag.pointerId = e.pointerId;
	              drag.startX = e.clientX;
	              drag.startY = e.clientY;
	              drag.startOffsetX = openButtonOffset.dx;
	              drag.startOffsetY = openButtonOffset.dy;
	              drag.moved = false;
	              try {
	                (e.currentTarget as HTMLButtonElement).setPointerCapture(
	                  e.pointerId
	                );
	              } catch {
	                // ignore
	              }
	            }}
	            onPointerMove={(e) => {
	              const drag = openButtonDragRef.current;
	              if (!drag.dragging) return;
	              if (drag.pointerId !== null && e.pointerId !== drag.pointerId)
	                return;
	              const dx = e.clientX - drag.startX;
	              const dy = e.clientY - drag.startY;
	              if (!drag.moved && Math.hypot(dx, dy) > 4) {
	                drag.moved = true;
	              }
	              if (!drag.moved) return;
	              const buttonSize = 40;
	              const nextLeft = openButtonAnchorPx.x + OPEN_BUTTON_INSET.dx + (drag.startOffsetX + dx);
	              const nextTop = openButtonAnchorPx.y + OPEN_BUTTON_INSET.dy + (drag.startOffsetY + dy);
	              const clampedLeft = clamp(
	                nextLeft,
	                12,
	                window.innerWidth - buttonSize - 12
	              );
	              const clampedTop = clamp(
	                nextTop,
	                12,
	                window.innerHeight - buttonSize - 12
	              );
	              setOpenButtonOffset({
	                dx: clampedLeft - (openButtonAnchorPx.x + OPEN_BUTTON_INSET.dx),
	                dy: clampedTop - (openButtonAnchorPx.y + OPEN_BUTTON_INSET.dy),
	              });
	            }}
	            onPointerUp={(e) => {
	              const drag = openButtonDragRef.current;
	              if (!drag.dragging) return;
	              if (drag.pointerId !== null && e.pointerId !== drag.pointerId)
	                return;
	              const shouldOpen = !drag.moved;
	              drag.dragging = false;
	              drag.pointerId = null;
	              drag.moved = false;
	              if (shouldOpen) setPanelOpen(true);
	            }}
	            onPointerCancel={() => {
	              const drag = openButtonDragRef.current;
	              drag.dragging = false;
	              drag.pointerId = null;
	              drag.moved = false;
	            }}
	            style={{
	              position: "absolute",
	              left: openButtonPos.left,
	              top: openButtonPos.top,
	              width: 40,
	              height: 40,
	              borderRadius: 10,
	              border: "1px solid rgba(255,255,255,0.25)",
	              background: "rgba(0,0,0,0.55)",
	              color: "white",
	              cursor: "pointer",
	              pointerEvents: "auto",
	              display: "grid",
	              placeItems: "center",
	              fontSize: 18,
	              lineHeight: 1,
	              touchAction: "none",
	            }}
	          >
	            ☰
	          </button>
	        )}

		      {/* Bottom-left control + legend */}
			      {panelOpen && (
			      <div
			        ref={panelRef}
			        style={{
			          position: "absolute",
		          left: panelPos?.left ?? 12,
		          ...(panelPos ? { top: panelPos.top } : { bottom: 12 }),
		          width: Math.min(480, Math.max(260, viewportSize.width - 24)),
		          padding: isNarrowUi ? 8 : 10,
		          paddingBottom: `calc(${isNarrowUi ? 8 : 10}px + env(safe-area-inset-bottom))`,
		          borderRadius: 10,
		          background: "rgba(0,0,0,0.55)",
		          color: "white",
	          fontFamily: "system-ui, sans-serif",
	          display: "flex",
          flexDirection: "column",
          gap: 6,
		          pointerEvents: "auto",
		        }}
		      >
		        <div
		          onPointerDown={(e) => {
		            const el = panelRef.current;
		            if (!el) return;
		            const rect = el.getBoundingClientRect();
		            const startOffsetX = e.clientX - rect.left;
		            const startOffsetY = e.clientY - rect.top;

		            const onMove = (ev: PointerEvent) => {
		              const el2 = panelRef.current;
		              if (!el2) return;
		              const rect2 = el2.getBoundingClientRect();
		              const nextLeft = ev.clientX - startOffsetX;
		              const nextTop = ev.clientY - startOffsetY;
		              const maxLeft = Math.max(12, window.innerWidth - rect2.width - 12);
		              const maxTop = Math.max(12, window.innerHeight - rect2.height - 12);
		              setPanelPos({
		                left: Math.min(Math.max(12, nextLeft), maxLeft),
		                top: Math.min(Math.max(12, nextTop), maxTop),
		              });
		            };

		            const onUp = () => {
		              window.removeEventListener("pointermove", onMove);
		              window.removeEventListener("pointerup", onUp);
		              window.removeEventListener("pointercancel", onUp);
		            };

		            window.addEventListener("pointermove", onMove);
		            window.addEventListener("pointerup", onUp);
		            window.addEventListener("pointercancel", onUp);
		          }}
		          onDoubleClick={() => setPanelPos(null)}
		          title="Drag to move (double-click to reset)"
		          style={{
		            display: "flex",
		            alignItems: "center",
		            justifyContent: "space-between",
		            userSelect: "none",
		            cursor: "grab",
		            padding: "2px 0",
		          }}
		        >
		          <div style={{ fontSize: 12, opacity: 0.7 }}>Control Panel</div>
		          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
		            <button
		              type="button"
		              onClick={() => {
		                setTooltip(null);
		                setPanelOpen(false);
		              }}
		              title="Close"
		              style={{
		                border: "none",
		                background: "transparent",
		                color: "rgba(255,255,255,0.8)",
		                cursor: "pointer",
		                fontSize: 14,
		                lineHeight: 1,
		                padding: 0,
		              }}
		            >
		              ×
		            </button>
		            <div style={{ fontSize: 12, opacity: 0.4 }}>⋮⋮</div>
		          </div>
		        </div>

		        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
		          <div style={{ fontSize: 12, opacity: 0.75 }}>Source:</div>
		          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
	            <button
	              type="button"
	              onClick={() => {
	                setSourceMode("simulation");
	                if (overlay === "wind10") setOverlay("wind");
	              }}
	              onMouseEnter={(e) => {
	                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
	                setTooltip({
	                  text: "A high resolution ocean ice coupled model using MITgcm",
	                  left: rect.left + rect.width / 2,
	                  top: rect.top - 8,
	                });
	              }}
	              onMouseLeave={() => setTooltip(null)}
	              onFocus={(e) => {
	                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
	                setTooltip({
	                  text: "A high resolution ocean ice coupled model using MITgcm",
	                  left: rect.left + rect.width / 2,
	                  top: rect.top - 8,
	                });
	              }}
	              onBlur={() => setTooltip(null)}
	              style={{
	                padding: "2px 8px",
	                borderRadius: 999,
	                border: "1px solid rgba(255,255,255,0.25)",
	                background:
	                  sourceMode === "simulation"
	                    ? "rgba(255,255,255,0.16)"
	                    : "transparent",
	                color:
	                  sourceMode === "simulation"
	                    ? "white"
	                    : "rgba(255,255,255,0.75)",
	                cursor: "pointer",
	                fontSize: 12,
	                fontWeight: sourceMode === "simulation" ? 700 : 500,
	              }}
	            >
	              Model
	            </button>
	            <button
		              type="button"
		              onClick={() => {
		                setSourceMode("observation");
		                if (
		                  overlay !== "topo" &&
		                  overlay !== "mag" &&
		                  overlay !== "sst" &&
		                  overlay !== "sss" &&
		                  overlay !== "ice" &&
		                  overlay !== "wind10"
		                ) {
		                  setOverlay("mag");
		                }
		              }}
	              onMouseEnter={(e) => {
	                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
	                setTooltip({
	                  text:
	                    "Gridded prodcuts, e.g, Ssalto/Duacs, OSTIA SST and Ice, ERA5",
	                  left: rect.left + rect.width / 2,
	                  top: rect.top - 8,
	                });
	              }}
	              onMouseLeave={() => setTooltip(null)}
	              onFocus={(e) => {
	                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
	                setTooltip({
	                  text:
	                    "Gridded prodcuts, e.g, Ssalto/Duacs, OSTIA SST and Ice, ERA5",
	                  left: rect.left + rect.width / 2,
	                  top: rect.top - 8,
	                });
	              }}
	              onBlur={() => setTooltip(null)}
	              style={{
	                padding: "2px 8px",
	                borderRadius: 999,
	                border: "1px solid rgba(255,255,255,0.25)",
	                background:
	                  sourceMode === "observation"
	                    ? "rgba(255,255,255,0.16)"
	                    : "transparent",
	                color:
	                  sourceMode === "observation"
	                    ? "white"
	                    : "rgba(255,255,255,0.75)",
	                cursor: "pointer",
	                fontSize: 12,
	                fontWeight: sourceMode === "observation" ? 700 : 500,
	              }}
	            >
	              Observation
	            </button>
	          </div>
	        </div>

		        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
		          <div style={{ fontSize: 12, opacity: 0.9 }}>Data:</div>
			          <div
			            style={{
			              display: "flex",
			              gap: 8,
			              flexWrap: isNarrowUi ? "wrap" : "nowrap",
			              rowGap: 4,
			            }}
			          >
			            {dataOptions.map((opt) => (
              <button
                key={opt.id}
                onClick={() => setOverlay(opt.id as typeof overlay)}
                style={{
                  padding: 0,
                  border: "none",
                  background: "transparent",
                  color: overlay === opt.id ? "white" : "rgba(255,255,255,0.6)",
                  cursor: "pointer",
                  fontWeight: overlay === opt.id ? 700 : 500,
                  fontSize: 12,
                }}
                title={opt.label}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
	          <button
	            type="button"
	            role="switch"
	            aria-checked={showParticles}
	            disabled={!surfaceFlowToggleEnabled}
	            onClick={() => {
	              if (!surfaceFlowToggleEnabled) return;
	              setShowParticles((v) => !v);
	            }}
	            style={{
	              position: "relative",
	              width: 36,
	              height: 20,
	              borderRadius: 999,
	              border: "1px solid rgba(255,255,255,0.25)",
	              background: showParticles
	                ? "rgba(94,201,120,0.9)"
	                : "rgba(255,255,255,0.15)",
	              cursor: surfaceFlowToggleEnabled ? "pointer" : "not-allowed",
	              padding: 0,
	              transition: "background 160ms ease",
	              opacity: surfaceFlowToggleEnabled ? 1 : 0.55,
	            }}
	            title={
	              surfaceFlowToggleEnabled
	                ? "Toggle surface flow particles"
	                : "Surface flow particles are disabled for this dataset"
	            }
	          >
            <span
              style={{
                position: "absolute",
                top: 2,
                left: showParticles ? 18 : 2,
                width: 16,
                height: 16,
                borderRadius: "50%",
                background: "white",
                boxShadow: "0 1px 2px rgba(0,0,0,0.4)",
                transition: "left 160ms ease",
              }}
            />
	          </button>
	          <div style={{ fontSize: 12, opacity: 0.9 }}>Surface Flow</div>

	          <button
	            type="button"
	            role="switch"
	            aria-checked={showWindFlow}
	            disabled={!windFlowToggleEnabled}
	            onClick={() => {
	              if (!windFlowToggleEnabled) return;
	              setShowWindFlow((v) => !v);
	            }}
	            style={{
	              position: "relative",
	              width: 36,
	              height: 20,
	              borderRadius: 999,
	              border: "1px solid rgba(255,255,255,0.25)",
	              background: showWindFlow
	                ? "rgba(246,120,85,0.95)"
	                : "rgba(255,255,255,0.15)",
	              cursor: windFlowToggleEnabled ? "pointer" : "not-allowed",
	              padding: 0,
	              transition: "background 160ms ease",
	              opacity: windFlowToggleEnabled ? 1 : 0.55,
	            }}
	            title={
	              windFlowToggleEnabled
	                ? "Toggle wind flow particles"
	                : "Wind flow particles"
	            }
	          >
	            <span
	              style={{
	                position: "absolute",
	                top: 2,
	                left: showWindFlow ? 18 : 2,
	                width: 16,
	                height: 16,
	                borderRadius: "50%",
	                background: "white",
	                boxShadow: "0 1px 2px rgba(0,0,0,0.4)",
	                transition: "left 160ms ease",
	              }}
	            />
	          </button>
	          <div style={{ fontSize: 12, opacity: 0.9 }}>Wind</div>

	          <button
	            type="button"
	            role="switch"
	            aria-checked={movieOn}
	            onClick={() => setMovieOn((v) => !v)}
            style={{
              position: "relative",
              width: 36,
              height: 20,
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.25)",
              background: movieOn
                ? "rgba(94,201,120,0.9)"
                : "rgba(255,255,255,0.15)",
              cursor: "pointer",
              padding: 0,
              transition: "background 160ms ease",
            }}
            title="Toggle movie"
          >
            <span
              style={{
                position: "absolute",
                top: 2,
                left: movieOn ? 18 : 2,
                width: 16,
                height: 16,
                borderRadius: "50%",
                background: "white",
                boxShadow: "0 1px 2px rgba(0,0,0,0.4)",
                transition: "left 160ms ease",
              }}
            />
          </button>
          <div style={{ fontSize: 12, opacity: 0.9 }}>Movie</div>

          <button
            type="button"
            role="switch"
            aria-checked={audioOn}
            onClick={() => setAudioOn((v) => !v)}
            style={{
              position: "relative",
              width: 36,
              height: 20,
              borderRadius: 999,
              border: "1px solid rgba(255,255,255,0.25)",
              background: audioOn
                ? "rgba(94,201,120,0.9)"
                : "rgba(255,255,255,0.15)",
              cursor: "pointer",
              padding: 0,
              transition: "background 160ms ease",
            }}
            title="Toggle audio"
          >
            <span
              style={{
                position: "absolute",
                top: 2,
                left: audioOn ? 18 : 2,
                width: 16,
                height: 16,
                borderRadius: "50%",
                background: "white",
                boxShadow: "0 1px 2px rgba(0,0,0,0.4)",
                transition: "left 160ms ease",
              }}
            />
          </button>
	          <div style={{ fontSize: 12, opacity: 0.9 }}>Audio</div>
	        </div>

	        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
	          <div style={{ fontSize: 12, opacity: 0.9 }}>
	            Date: {formatDateLabel(currentDate)}
	          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <button
              onClick={() =>
                setIdx((prev) => (prev - 1 + frames.length) % frames.length)
              }
              style={{
                padding: 0,
                border: "none",
                background: "transparent",
                color: "white",
                cursor: "pointer",
                lineHeight: 1,
                fontSize: 14,
                fontWeight: 700,
              }}
              title="Previous frame"
            >
              &lt;
            </button>
            <button
              onClick={() => setIdx((prev) => (prev + 1) % frames.length)}
              style={{
                padding: 0,
                border: "none",
                background: "transparent",
                color: "white",
                cursor: "pointer",
                lineHeight: 1,
                fontSize: 14,
                fontWeight: 700,
              }}
              title="Next frame"
            >
              &gt;
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 12, opacity: 0.75 }}>fps</span>
              <input
                type="number"
                value={fps}
                min={1}
                max={30}
                onChange={(e) => setFps(Number(e.target.value) || 1)}
                style={{
                  width: 40,
                  padding: 0,
                  border: "none",
                  background: "transparent",
                  color: "white",
                }}
              />
            </div>
          </div>
        </div>

        <input
          type="range"
          min={0}
          max={frames.length - 1}
          value={idx}
          onChange={(e) => {
            setPlaying(false);
            setMovieOn(false);
            setBlend(0);
            setIdx(Number(e.target.value));
          }}
          style={{ width: "100%" }}
        />

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontSize: 12, opacity: 0.9 }}>
            {overlayMeta.scaleLabel}
          </div>
          <div style={{ width: 190 }}>
            <div
              style={{
                width: 190,
                height: 6,
                borderRadius: 3,
                background: overlayMeta.gradient,
                boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.25)",
              }}
            />
            <div
              style={{
                marginTop: 4,
                display: "flex",
                justifyContent: "space-between",
                fontSize: 10,
                opacity: 0.75,
              }}
            >
              <span>{overlayMeta.minLabel}</span>
              <span>{overlayMeta.maxLabel}</span>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: 12, opacity: 0.75 }}>Feedback:</div>
          <a
            href="https://www.linkedin.com/in/dong-jian/"
            target="_blank"
            rel="noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              color: "white",
              textDecoration: "none",
              fontSize: 12,
              opacity: 0.8,
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M4.98 3.5C3.34 3.5 2 4.84 2 6.48c0 1.63 1.33 2.98 2.97 2.98h.02c1.64 0 2.98-1.35 2.98-2.98C7.97 4.84 6.64 3.5 4.98 3.5zM2.4 21h5.17V9.75H2.4V21zM9.74 9.75V21h5.17v-6.27c0-3.35 4.36-3.62 4.36 0V21h5.17v-7.99c0-6.22-7.1-6-9.53-2.94V9.75H9.74z" />
            </svg>
            LinkedIn
          </a>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              color: "white",
              fontSize: 12,
              opacity: 0.8,
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z" />
            </svg>
            d.jian[at]uea.ac.uk
          </span>
          <span style={{ fontSize: 12, opacity: 0.6 }}>
            (© DJ, 2026)
          </span>
        </div>
      </div>
      )}
    </div>
  );
}

export async function renderToDOM(container: HTMLDivElement) {
  createRoot(container).render(<App />);
}
