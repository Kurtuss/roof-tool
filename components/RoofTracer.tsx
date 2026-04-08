"use client";

/**
 * RoofTracer — interactive polygon drawing on satellite imagery.
 *
 * Renders Esri satellite tiles centered on the target lat/lng.
 * Supports zoom in/out (scroll wheel or buttons) and drag-to-pan.
 * User clicks to place vertices outlining the roof, then saves.
 *
 * Default zoom is 20 (~0.15m/px) — close enough to see shingles on most roofs.
 * Zoom range: 17–21 (neighborhood → individual shingles).
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { Undo2, Trash2, Check, X, HelpCircle, ZoomIn, ZoomOut, Move, Crosshair } from "lucide-react";

interface Props {
  lat: number;
  lng: number;
  zoom?: number;
  initialPitch?: number;
  onSave: (data: TracerResult) => void;
  onCancel: () => void;
}

export interface TracerResult {
  polygon_pixels: [number, number][];
  meters_per_px: number;
  pitch_degrees: number;
  lat: number;
  lng: number;
  footprint_sqft: number;
  roof_sqft: number;
  perimeter_ft: number;
}

const TILE_SIZE = 256;
const GRID = 7; // 7×7 tiles for more coverage at high zoom
const CANVAS_SIZE = TILE_SIZE * GRID;
const MIN_ZOOM = 17;
const MAX_ZOOM = 21;
const DEFAULT_ZOOM = 20;

type Mode = "draw" | "pan";

export default function RoofTracer({ lat, lng, zoom: initialZoom, initialPitch = 26.57, onSave, onCancel }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [points, setPoints] = useState<[number, number][]>([]);
  const [pitch, setPitch] = useState(initialPitch);
  const [zoom, setZoom] = useState(initialZoom ?? DEFAULT_ZOOM);
  const [tilesLoaded, setTilesLoaded] = useState(false);
  const [showHelp, setShowHelp] = useState(true);
  const [mode, setMode] = useState<Mode>("draw");

  // Pan offset: the lat/lng we're actually centered on (starts at target)
  const [centerLat, setCenterLat] = useState(lat);
  const [centerLng, setCenterLng] = useState(lng);

  // Drag state
  const dragRef = useRef<{ startX: number; startY: number; startLat: number; startLng: number } | null>(null);

  const tilesRef = useRef<HTMLImageElement[]>([]);
  const prevTilesRef = useRef<HTMLImageElement[]>([]);

  // Compute tile info for current center + zoom
  const n = 2 ** zoom;
  const centerXTile = Math.floor(((centerLng + 180) / 360) * n);
  const latRad = (centerLat * Math.PI) / 180;
  const centerYTile = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  );
  const metersPerPx = (40075016.686 * Math.cos(latRad)) / (TILE_SIZE * n);

  // Pixel position of the TARGET address within the canvas (may drift from center after pan)
  const targetPixelX = (() => {
    const targetXFrac = ((lng + 180) / 360) * n;
    const tileOffset = Math.floor(GRID / 2);
    const originTileX = centerXTile - tileOffset;
    return (targetXFrac - originTileX) * TILE_SIZE;
  })();
  const targetPixelY = (() => {
    const targetLatRad = (lat * Math.PI) / 180;
    const targetYFrac =
      ((1 - Math.log(Math.tan(targetLatRad) + 1 / Math.cos(targetLatRad)) / Math.PI) / 2) * n;
    const tileOffset = Math.floor(GRID / 2);
    const originTileY = centerYTile - tileOffset;
    return (targetYFrac - originTileY) * TILE_SIZE;
  })();

  // Compute area live
  const { areaSqft, perimeterFt } = computeArea(points, metersPerPx);
  const pitchRad = (pitch * Math.PI) / 180;
  const roofSqft = pitchRad > 0 ? +(areaSqft / Math.cos(pitchRad)).toFixed(1) : areaSqft;

  // Load tiles when center or zoom changes
  useEffect(() => {
    // Keep previous tiles for instant fallback display
    if (tilesRef.current.length > 0) {
      prevTilesRef.current = tilesRef.current;
    }

    const currentN = 2 ** zoom;
    const currentLatRad = (centerLat * Math.PI) / 180;
    const cxTile = Math.floor(((centerLng + 180) / 360) * currentN);
    const cyTile = Math.floor(
      ((1 - Math.log(Math.tan(currentLatRad) + 1 / Math.cos(currentLatRad)) / Math.PI) / 2) * currentN
    );

    const offset = Math.floor(GRID / 2);
    const tiles: HTMLImageElement[] = [];
    let loaded = 0;
    const total = GRID * GRID;

    setTilesLoaded(false);

    for (let row = 0; row < GRID; row++) {
      for (let col = 0; col < GRID; col++) {
        const tx = cxTile - offset + col;
        const ty = cyTile - offset + row;
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${ty}/${tx}`;
        img.onload = () => {
          loaded++;
          if (loaded === total) {
            setTilesLoaded(true);
          }
        };
        img.onerror = () => {
          loaded++;
          if (loaded === total) {
            setTilesLoaded(true);
          }
        };
        tiles.push(img);
      }
    }
    tilesRef.current = tiles;
  }, [centerLat, centerLng, zoom]);

  // Redraw when anything visual changes
  useEffect(() => {
    drawAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, tilesLoaded, mode]);

  const drawAll = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const tiles = tilesRef.current;

    // Draw tiles
    for (let row = 0; row < GRID; row++) {
      for (let col = 0; col < GRID; col++) {
        const img = tiles[row * GRID + col];
        if (img && img.complete && img.naturalWidth > 0) {
          ctx.drawImage(img, col * TILE_SIZE, row * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        } else {
          // Try previous tiles as fallback, else dark fill
          const prevImg = prevTilesRef.current[row * GRID + col];
          if (prevImg && prevImg.complete && prevImg.naturalWidth > 0) {
            ctx.drawImage(prevImg, col * TILE_SIZE, row * TILE_SIZE, TILE_SIZE, TILE_SIZE);
            ctx.fillStyle = "rgba(0,0,0,0.3)";
            ctx.fillRect(col * TILE_SIZE, row * TILE_SIZE, TILE_SIZE, TILE_SIZE);
          } else {
            ctx.fillStyle = "#0d1f3c";
            ctx.fillRect(col * TILE_SIZE, row * TILE_SIZE, TILE_SIZE, TILE_SIZE);
          }
        }
      }
    }

    // Draw target crosshair (where the address is)
    const tx = targetPixelX;
    const ty = targetPixelY;
    if (tx >= 0 && tx <= CANVAS_SIZE && ty >= 0 && ty <= CANVAS_SIZE) {
      ctx.strokeStyle = "rgba(14, 165, 233, 0.6)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(tx - 20, ty);
      ctx.lineTo(tx + 20, ty);
      ctx.moveTo(tx, ty - 20);
      ctx.lineTo(tx, ty + 20);
      ctx.stroke();
      ctx.setLineDash([]);

      // Small diamond marker
      ctx.fillStyle = "rgba(14, 165, 233, 0.8)";
      ctx.beginPath();
      ctx.moveTo(tx, ty - 4);
      ctx.lineTo(tx + 4, ty);
      ctx.lineTo(tx, ty + 4);
      ctx.lineTo(tx - 4, ty);
      ctx.closePath();
      ctx.fill();
    }

    // Draw polygon
    const pts = points;
    if (pts.length === 0) return;

    // Fill
    if (pts.length >= 3) {
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.closePath();
      ctx.fillStyle = "rgba(14, 165, 233, 0.2)";
      ctx.fill();
    }

    // Edges
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    if (pts.length >= 3) ctx.closePath();
    ctx.strokeStyle = "#0ea5e9";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Edge lengths (in feet)
    ctx.font = "11px Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (let i = 0; i < pts.length; i++) {
      const j = (i + 1) % pts.length;
      if (j === 0 && pts.length < 3) continue; // don't close if < 3 points
      const dx = pts[j][0] - pts[i][0];
      const dy = pts[j][1] - pts[i][1];
      const distPx = Math.sqrt(dx * dx + dy * dy);
      const distFt = (distPx * metersPerPx * 3.28084).toFixed(1);
      const mx = (pts[i][0] + pts[j][0]) / 2;
      const my = (pts[i][1] + pts[j][1]) / 2;

      // Background pill
      const textWidth = ctx.measureText(`${distFt} ft`).width;
      ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
      const px = 4, py = 2;
      ctx.beginPath();
      ctx.roundRect(mx - textWidth / 2 - px, my - 7 - py, textWidth + px * 2, 14 + py * 2, 4);
      ctx.fill();

      ctx.fillStyle = "#ffffff";
      ctx.fillText(`${distFt} ft`, mx, my);
    }

    // Vertices
    for (let i = 0; i < pts.length; i++) {
      ctx.beginPath();
      ctx.arc(pts[i][0], pts[i][1], 6, 0, Math.PI * 2);
      ctx.fillStyle = i === 0 ? "#ef4444" : "#0ea5e9";
      ctx.fill();
      ctx.strokeStyle = "white";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, tilesLoaded, targetPixelX, targetPixelY, metersPerPx, mode]);

  // ── Interaction handlers ────────────────────────────────────────

  const canvasCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = CANVAS_SIZE / rect.width;
    const scaleY = CANVAS_SIZE / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (mode === "pan") {
      const { x, y } = canvasCoords(e);
      dragRef.current = { startX: x, startY: y, startLat: centerLat, startLng: centerLng };
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (mode === "pan" && dragRef.current) {
      const { x, y } = canvasCoords(e);
      const dx = x - dragRef.current.startX;
      const dy = y - dragRef.current.startY;

      // Convert pixel delta to lat/lng delta
      const currentN = 2 ** zoom;
      const currentLatRad = (dragRef.current.startLat * Math.PI) / 180;
      const mpp = (40075016.686 * Math.cos(currentLatRad)) / (TILE_SIZE * currentN);

      const dLng = -(dx * mpp) / (111320 * Math.cos(currentLatRad));
      const dLat = (dy * mpp) / 110540;

      setCenterLat(dragRef.current.startLat + dLat);
      setCenterLng(dragRef.current.startLng + dLng);
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (mode === "pan" && dragRef.current) {
      // Only register as a click (not a drag) if movement was tiny
      const { x, y } = canvasCoords(e);
      const dx = Math.abs(x - dragRef.current.startX);
      const dy = Math.abs(y - dragRef.current.startY);
      dragRef.current = null;
      if (dx < 3 && dy < 3) {
        // Tiny movement — don't add a point in pan mode, it was just a tap
      }
      return;
    }
    // Draw mode — place a point
    if (mode === "draw") {
      const { x, y } = canvasCoords(e);
      setPoints((prev) => [...prev, [x, y]]);
      setShowHelp(false);
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      // Zoom in
      setZoom((z) => Math.min(z + 1, MAX_ZOOM));
    } else {
      // Zoom out
      setZoom((z) => Math.max(z - 1, MIN_ZOOM));
    }
    // Clear polygon points when zooming since pixel positions change
    if (points.length > 0) {
      setPoints([]);
    }
  };

  const zoomIn = () => {
    setZoom((z) => Math.min(z + 1, MAX_ZOOM));
    if (points.length > 0) setPoints([]);
  };
  const zoomOut = () => {
    setZoom((z) => Math.max(z - 1, MIN_ZOOM));
    if (points.length > 0) setPoints([]);
  };
  const recenter = () => {
    setCenterLat(lat);
    setCenterLng(lng);
  };

  const undo = () => setPoints((prev) => prev.slice(0, -1));
  const clear = () => setPoints([]);

  const save = () => {
    if (points.length < 3) return;
    onSave({
      polygon_pixels: points,
      meters_per_px: metersPerPx,
      pitch_degrees: pitch,
      lat: centerLat,
      lng: centerLng,
      footprint_sqft: areaSqft,
      roof_sqft: roofSqft,
      perimeter_ft: perimeterFt,
    });
  };

  // Scale display for current zoom
  const scaleBarFt = +(metersPerPx * 100 * 3.28084).toFixed(0); // 100px worth of feet

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h4 className="font-semibold text-brand-900 text-sm">Trace Roof Outline</h4>
          <p className="text-xs text-brand-600/60">Click corners of the roof. Scroll to zoom. Hold pan mode to drag.</p>
        </div>
        <button onClick={() => setShowHelp(!showHelp)} className="text-brand-400 hover:text-brand-600">
          <HelpCircle size={16} />
        </button>
      </div>

      {showHelp && (
        <div className="p-3 bg-brand-50 border border-brand-200/50 rounded-xl text-xs text-brand-700 space-y-1">
          <p><strong>How to trace:</strong></p>
          <p>1. Use scroll wheel or +/- to zoom in until the roof fills most of the view</p>
          <p>2. Switch to Pan mode to drag the map, then back to Draw mode to place points</p>
          <p>3. Click on each corner of the roof to place vertices (red dot = first point)</p>
          <p>4. Edge lengths show in feet as you trace</p>
          <p>5. Use Undo to remove the last point, or Clear to start over</p>
          <p>6. Click Save when done — pitch is preset to 6/12 (26.57°)</p>
        </div>
      )}

      {/* Mode + Zoom controls */}
      <div className="flex items-center gap-2">
        <div className="flex rounded-xl border border-brand-200 overflow-hidden">
          <button
            onClick={() => setMode("draw")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold transition-colors ${
              mode === "draw"
                ? "bg-brand-500 text-white"
                : "bg-white text-brand-600 hover:bg-brand-50"
            }`}
          >
            <Crosshair size={13} /> Draw
          </button>
          <button
            onClick={() => setMode("pan")}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border-l border-brand-200 transition-colors ${
              mode === "pan"
                ? "bg-brand-500 text-white"
                : "bg-white text-brand-600 hover:bg-brand-50"
            }`}
          >
            <Move size={13} /> Pan
          </button>
        </div>

        <div className="flex items-center gap-1 ml-2">
          <button onClick={zoomOut} disabled={zoom <= MIN_ZOOM} className="btn-secondary !px-2 !py-1.5 text-xs">
            <ZoomOut size={14} />
          </button>
          <span className="text-xs font-mono text-brand-600 w-8 text-center">{zoom}</span>
          <button onClick={zoomIn} disabled={zoom >= MAX_ZOOM} className="btn-secondary !px-2 !py-1.5 text-xs">
            <ZoomIn size={14} />
          </button>
        </div>

        <button onClick={recenter} className="btn-secondary !px-2.5 !py-1.5 text-xs ml-1" title="Re-center on address">
          <Crosshair size={13} />
        </button>

        {/* Scale bar */}
        <div className="ml-auto flex items-center gap-1.5 text-[10px] text-brand-400">
          <div className="w-[100px] h-1 bg-brand-300/50 rounded-full relative">
            <div className="absolute -left-0.5 -top-0.5 w-0.5 h-2 bg-brand-400 rounded" />
            <div className="absolute -right-0.5 -top-0.5 w-0.5 h-2 bg-brand-400 rounded" />
          </div>
          <span>{scaleBarFt} ft</span>
        </div>
      </div>

      {/* Canvas */}
      <div ref={containerRef} className="relative rounded-xl overflow-hidden border border-brand-200/50 shadow-hex-card">
        <canvas
          ref={canvasRef}
          width={CANVAS_SIZE}
          height={CANVAS_SIZE}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onWheel={handleWheel}
          className={`w-full ${mode === "draw" ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing"}`}
          style={{ maxHeight: "650px", imageRendering: "auto" }}
        />
        {!tilesLoaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-hex-dark/60 backdrop-blur-sm text-white text-sm">
            <div className="text-center">
              <div className="hex-shape w-10 h-10 bg-gradient-to-br from-brand-400 to-brand-600 mx-auto mb-2 animate-pulse-slow" />
              <p>Loading satellite imagery...</p>
            </div>
          </div>
        )}

        {/* Live stats overlay */}
        {points.length >= 3 && (
          <div className="absolute top-3 left-3 bg-hex-dark/80 backdrop-blur-sm text-white text-xs px-4 py-2.5 rounded-xl space-y-1 border border-white/10">
            <p>Footprint: <strong>{areaSqft.toLocaleString()} sq ft</strong></p>
            <p>Roof area (at {pitch.toFixed(1)}°): <strong>{roofSqft.toLocaleString()} sq ft</strong></p>
            <p>Perimeter: <strong>{perimeterFt.toLocaleString()} lin ft</strong></p>
          </div>
        )}

        {/* Point count + mode indicator */}
        <div className="absolute top-3 right-3 flex items-center gap-2">
          {mode === "pan" && (
            <span className="bg-amber-500/90 text-white text-[10px] font-semibold px-2 py-1 rounded-lg">
              PAN MODE
            </span>
          )}
          <span className="bg-hex-dark/80 backdrop-blur-sm text-white text-xs px-2.5 py-1 rounded-lg border border-white/10">
            {points.length} point{points.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Zoom warning if too far out */}
        {zoom <= 18 && points.length === 0 && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-amber-500/90 text-white text-xs font-medium px-3 py-1.5 rounded-lg">
            Zoom in closer before tracing
          </div>
        )}
      </div>

      {/* Drawing controls */}
      <div className="flex items-center gap-3">
        <button onClick={undo} disabled={points.length === 0} className="btn-secondary text-xs">
          <Undo2 size={13} /> Undo
        </button>
        <button onClick={clear} disabled={points.length === 0} className="btn-secondary text-xs">
          <Trash2 size={13} /> Clear
        </button>

        <div className="flex items-center gap-2 ml-auto">
          <label className="text-xs text-brand-600 font-medium">Pitch:</label>
          <input
            type="number"
            min="0"
            max="60"
            step="0.01"
            value={pitch}
            onChange={(e) => setPitch(parseFloat(e.target.value) || 0)}
            className="input w-20 text-xs"
          />
          <span className="text-xs text-brand-400">° (6/12 = 26.57°)</span>
        </div>
      </div>

      {/* Save / Cancel */}
      <div className="flex gap-2 pt-1">
        <button onClick={save} disabled={points.length < 3} className="btn-primary">
          <Check size={13} /> Save Traced Outline
        </button>
        <button onClick={onCancel} className="btn-secondary">
          <X size={13} /> Cancel
        </button>
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────

function computeArea(
  points: [number, number][],
  metersPerPx: number
): { areaSqft: number; perimeterFt: number } {
  if (points.length < 3) return { areaSqft: 0, perimeterFt: 0 };

  let area = 0;
  let perimeter = 0;
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i][0] * points[j][1] - points[j][0] * points[i][1];
    const dx = points[j][0] - points[i][0];
    const dy = points[j][1] - points[i][1];
    perimeter += Math.sqrt(dx * dx + dy * dy);
  }
  area = Math.abs(area) / 2; // pixels²
  const areaSqm = area * metersPerPx * metersPerPx;
  const perimeterM = perimeter * metersPerPx;

  return {
    areaSqft: +(areaSqm * 10.7639).toFixed(1),
    perimeterFt: +(perimeterM * 3.28084).toFixed(1),
  };
}
