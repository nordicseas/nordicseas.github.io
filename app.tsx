import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Map } from "react-map-gl/maplibre";
import DeckGL, { DeckGLRef } from "@deck.gl/react";
import { WebMercatorViewport, type MapViewState } from "@deck.gl/core";
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

const DATES = [
  "2011-01-04",
  "2011-01-09",
  "2011-01-14",
  "2011-01-19",
  "2011-01-24",
  "2011-01-29",
  "2011-02-03",
  "2011-02-08",
  "2011-02-13",
  "2011-02-18",
  "2011-02-23",
  "2011-02-28",
  "2011-03-05",
  "2011-03-10",
  "2011-03-15",
  "2011-03-20",
  "2011-03-25",
  "2011-03-30",
  "2011-04-04",
  "2011-04-09",
  "2011-04-14",
  "2011-04-19",
  "2011-04-24",
  "2011-04-29",
  "2011-05-04",
  "2011-05-09",
  "2011-05-14",
  "2011-05-19",
  "2011-05-24",
  "2011-05-29",
  "2011-06-03",
  "2011-06-08",
  "2011-06-13",
  "2011-06-18",
  "2011-06-23",
  "2011-06-28",
  "2011-07-03",
  "2011-07-08",
  "2011-07-13",
  "2011-07-18",
  "2011-07-23",
  "2011-07-28",
  "2011-08-02",
  "2011-08-07",
  "2011-08-12",
  "2011-08-17",
  "2011-08-22",
  "2011-08-27",
  "2011-09-01",
  "2011-09-06",
  "2011-09-11",
  "2011-09-16",
  "2011-09-21",
  "2011-09-26",
  "2011-10-01",
  "2011-10-06",
  "2011-10-11",
  "2011-10-16",
  "2011-10-21",
  "2011-10-26",
  "2011-10-31",
  "2011-11-05",
  "2011-11-10",
  "2011-11-15",
  "2011-11-20",
  "2011-11-25",
  "2011-11-30",
  "2011-12-05",
  "2011-12-10",
  "2011-12-15",
  "2011-12-20",
  "2011-12-25",
  "2011-12-30",
];

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

  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [fps, setFps] = useState(1);
  const [blend, setBlend] = useState(0);
  const [overlay, setOverlay] = useState<
    "mag" | "deep" | "vort" | "sst" | "sss" | "ice" | "wind" | "topo"
  >("mag");
  const [showParticles, setShowParticles] = useState(true);
  const [movieOn, setMovieOn] = useState(false);
  const [audioOn, setAudioOn] = useState(false);

  const idxRef = useRef(idx);
  const [viewportSize, setViewportSize] = useState({
    width: window.innerWidth,
    height: window.innerHeight,
  });

  const frames = useMemo(() => {
    const base = import.meta.env.BASE_URL;
    return DATES.map((d) => `${base}uv_${d}.png`);
  }, []);
  const windFrames = useMemo(() => {
    const base = import.meta.env.BASE_URL;
    return DATES.map((d) => `${base}wind_${d}.png`);
  }, []);
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
    setPlaying(movieOn);
  }, [movieOn]);

  useEffect(() => {
    if (overlay === "deep" || overlay === "wind") {
      setShowParticles(false);
    }
  }, [overlay]);

  const surfaceFlowToggleEnabled = overlay !== "deep" && overlay !== "wind";
  const showFlowParticles =
    overlay === "deep" || overlay === "wind" ? true : showParticles;

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
  const particleFrames =
    overlay === "wind" ? windFrames : overlay === "deep" ? deepFrames : frames;
  const imageUrl = particleFrames[idx];
  const nextIdx = (idx + 1) % frames.length;
  const imageNextUrl = particleFrames[nextIdx];

  const overlayFrames = useMemo(() => {
    const base = import.meta.env.BASE_URL;
    if (overlay === "topo") {
      return DATES.map(() => `${base}topography.png`);
    }
    const prefix =
      overlay === "ice"
        ? "SI"
        : overlay === "wind"
          ? "windmag"
          : overlay === "deep"
            ? "magdeep"
            : overlay === "vort"
              ? "Ro"
              : overlay;
    return DATES.map((d) => `${base}${prefix}_${d}.png`);
  }, [overlay]);

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
        scaleLabel: "Scale ( N/m^2}",
        minLabel: "slow",
        maxLabel: "fast",
        gradient:
          // cmocean.cm.tempo
          "linear-gradient(90deg, #FFF6F4, #D2D9C7, #A1C1A1, #69AB89, #2A937F, #117677, #1B5867, #1B3B55, #151D44)",
      },
      topo: {
        scaleLabel: "Depth (m):",
        minLabel: "50",
        maxLabel: "4200",
        gradient:
          "linear-gradient(90deg, #08306B, #08519C, #2171B5, #4292C6, #6BAED6, #9ECAE1, #C6DBEF, #DEEBF7, #F7FBFF)",
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

  const flowSpeedFactor = useMemo(() => {
    return (
      FLOW_REFERENCE_SPEED_FACTOR *
      2 ** (initialViewState.zoom - FLOW_REFERENCE_ZOOM)
    );
  }, [initialViewState.zoom]);

  const layers = [
    new BitmapLayer({
      id: "magnitude-raster",
      image: magUrl,
      bounds: BOUNDS,
      opacity: magOpacity * (1 - blend),
    }),
    new BitmapLayer({
      id: "magnitude-raster-next",
      image: magNextUrl,
      bounds: BOUNDS,
      opacity: magOpacity * blend,
    }),
    ...(showFlowParticles
      ? [
          new ParticleLayer({
            id: "flow",
            image: imageUrl,
            imageNext: imageNextUrl,
            blend,
            imageUnscale: [-128, 127],
            bounds: BOUNDS,
            numParticles: 12000,
            maxAge: 45,
            speedFactor: flowSpeedFactor,
            color: [255, 255, 255, 255],
            width: 2,
            opacity: 0.8,
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
	      <audio
	        ref={audioRef}
	        src={`${import.meta.env.BASE_URL}Dmitri Shostakovich Jazz Suite Waltz No.2.mp3`}
	        preload="auto"
	        loop
	      />

      <DeckGL
        ref={ref}
        layers={layers}
        initialViewState={initialViewState}
        controller={true}
	      >
	        <Map reuseMaps mapStyle={MAP_STYLE} />
	      </DeckGL>

		      {/* Bottom-left control + legend */}
		      <div
	        style={{
	          position: "absolute",
          left: 12,
          bottom: 12,
          width: 480,
          padding: 10,
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
	        <div style={{ fontSize: 12, opacity: 0.75 }}>
	          Source: MITgcm simulation
	        </div>

	        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
	          <div style={{ fontSize: 12, opacity: 0.9 }}>Data:</div>
	          <div style={{ display: "flex", gap: 8, flexWrap: "nowrap" }}>
	            {[
	              { id: "mag", label: "Surface Currents" },
	              { id: "deep", label: "Deep Currents" },
	              { id: "topo", label: "Topo" },
	              { id: "vort", label: "Vorticity" },
	              { id: "sst", label: "SST" },
	              { id: "sss", label: "SSS" },
	              { id: "ice", label: "Ice" },
              { id: "wind", label: "Wind" },
            ].map((opt) => (
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
            inspired by earth.nullschool.net
          </span>
        </div>
      </div>
    </div>
  );
}

export async function renderToDOM(container: HTMLDivElement) {
  createRoot(container).render(<App />);
}
