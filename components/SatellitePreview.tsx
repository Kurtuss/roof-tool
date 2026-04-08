"use client";

/**
 * SatellitePreview — read-only satellite view with building polygon overlay.
 *
 * Shows the detected building outline on satellite imagery.
 * User confirms "Correct" or flags "Wrong House" to trigger pin correction.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { Check, AlertTriangle, MapPin } from "lucide-react";

interface Props {
  lat: number;
  lng: number;
  /** OSM building polygon as [[lat, lng], ...] */
  polygon?: [number, number][];
  zoom?: number;
  onConfirm: () => void;
  onReject: () => void;
}

const TILE_SIZE = 256;
const GRID = 5;
const CANVAS_SIZE = TILE_SIZE * GRID;
const DEFAULT_ZOOM = 19;

export default function SatellitePreview({
  lat,
  lng,
  polygon,
  zoom: initialZoom,
  onConfirm,
  onReject,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [zoom] = useState(initialZoom ?? DEFAULT_ZOOM);
  const [tilesLoaded, setTilesLoaded] = useState(false);
  const tilesRef = useRef<HTMLImageElement[]>([]);

  const n = 2 ** zoom;
  const latRad = (lat * Math.PI) / 180;
  const centerXTile = Math.floor(((lng + 180) / 360) * n);
  const centerYTile = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  );
  const offset = Math.floor(GRID / 2);
  const originTileX = centerXTile - offset;
  const originTileY = centerYTile - offset;

  const latlngToPixel = useCallback(
    (pLat: number, pLng: number) => {
      const xFrac = ((pLng + 180) / 360) * n;
      const pLatRad = (pLat * Math.PI) / 180;
      const yFrac =
        ((1 - Math.log(Math.tan(pLatRad) + 1 / Math.cos(pLatRad)) / Math.PI) / 2) * n;
      return {
        x: (xFrac - originTileX) * TILE_SIZE,
        y: (yFrac - originTileY) * TILE_SIZE,
      };
    },
    [n, originTileX, originTileY]
  );

  // Load tiles
  useEffect(() => {
    const tiles: HTMLImageElement[] = [];
    let loaded = 0;
    const total = GRID * GRID;
    setTilesLoaded(false);

    for (let row = 0; row < GRID; row++) {
      for (let col = 0; col < GRID; col++) {
        const tx = centerXTile - offset + col;
        const ty = centerYTile - offset + row;
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${ty}/${tx}`;
        img.onload = img.onerror = () => {
          loaded++;
          if (loaded === total) setTilesLoaded(true);
        };
        tiles.push(img);
      }
    }
    tilesRef.current = tiles;
  }, [zoom, centerXTile, centerYTile, offset]);

  // Draw
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Tiles
    for (let row = 0; row < GRID; row++) {
      for (let col = 0; col < GRID; col++) {
        const img = tilesRef.current[row * GRID + col];
        if (img?.complete && img.naturalWidth > 0) {
          ctx.drawImage(img, col * TILE_SIZE, row * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        } else {
          ctx.fillStyle = "#0d1f3c";
          ctx.fillRect(col * TILE_SIZE, row * TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }
      }
    }

    // Draw building polygon overlay
    if (polygon && polygon.length >= 3) {
      const pixels = polygon.map(([pLat, pLng]) => latlngToPixel(pLat, pLng));

      // Fill
      ctx.beginPath();
      ctx.moveTo(pixels[0].x, pixels[0].y);
      for (let i = 1; i < pixels.length; i++) ctx.lineTo(pixels[i].x, pixels[i].y);
      ctx.closePath();
      ctx.fillStyle = "rgba(14, 165, 233, 0.25)";
      ctx.fill();

      // Outline
      ctx.beginPath();
      ctx.moveTo(pixels[0].x, pixels[0].y);
      for (let i = 1; i < pixels.length; i++) ctx.lineTo(pixels[i].x, pixels[i].y);
      ctx.closePath();
      ctx.strokeStyle = "#0ea5e9";
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Vertices
      for (const p of pixels) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = "#0ea5e9";
        ctx.fill();
        ctx.strokeStyle = "white";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    // Center crosshair (geocoded address)
    const center = latlngToPixel(lat, lng);
    ctx.strokeStyle = "rgba(239, 68, 68, 0.7)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(center.x - 20, center.y);
    ctx.lineTo(center.x + 20, center.y);
    ctx.moveTo(center.x, center.y - 20);
    ctx.lineTo(center.x, center.y + 20);
    ctx.stroke();
    ctx.setLineDash([]);

    // Small red dot at center
    ctx.fillStyle = "rgba(239, 68, 68, 0.8)";
    ctx.beginPath();
    ctx.arc(center.x, center.y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "white";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }, [tilesLoaded, lat, lng, polygon, latlngToPixel]);

  useEffect(() => {
    draw();
  }, [draw]);

  return (
    <div className="space-y-3">
      <div>
        <h4 className="font-semibold text-brand-900 text-sm flex items-center gap-2">
          <MapPin size={15} className="text-brand-500" />
          Satellite Preview
        </h4>
        <p className="text-xs text-brand-600/60 mt-0.5">
          Blue outline = detected building. Red crosshair = address location. Is this the correct house?
        </p>
      </div>

      <div className="relative rounded-xl overflow-hidden border border-brand-200/50 shadow-hex-card">
        <canvas
          ref={canvasRef}
          width={CANVAS_SIZE}
          height={CANVAS_SIZE}
          className="w-full"
          style={{ maxHeight: "450px" }}
        />
        {!tilesLoaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-hex-dark/60 backdrop-blur-sm text-white text-sm">
            Loading satellite imagery...
          </div>
        )}

        {/* Legend */}
        <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-sm text-white text-[10px] px-3 py-2 rounded-lg space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 bg-sky-400" />
            <span>Detected building</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
            <span>Address location</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button onClick={onConfirm} className="btn-primary text-xs">
          <Check size={13} /> Correct House
        </button>
        <button onClick={onReject} className="btn-secondary text-xs border-amber-300 text-amber-700 hover:bg-amber-50">
          <AlertTriangle size={13} /> Wrong House
        </button>
      </div>
    </div>
  );
}
