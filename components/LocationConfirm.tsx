"use client";

/**
 * LocationConfirm — satellite tile map with a movable pin.
 *
 * Used in two contexts:
 *  1. New Job form: confirm geocoded address before creating job
 *  2. Job detail: "Wrong House" → click correct house location
 *
 * User clicks on the map to reposition the pin. Confirm sends final lat/lng.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { Check, X, MapPin, RotateCcw } from "lucide-react";

interface Props {
  lat: number;
  lng: number;
  zoom?: number;
  title?: string;
  subtitle?: string;
  confirmLabel?: string;
  rejectLabel?: string;
  onConfirm: (lat: number, lng: number) => void;
  onReject?: () => void;
}

const TILE_SIZE = 256;
const GRID = 5;
const CANVAS_SIZE = TILE_SIZE * GRID;
const DEFAULT_ZOOM = 19;

export default function LocationConfirm({
  lat,
  lng,
  zoom: initialZoom,
  title = "Confirm Location",
  subtitle = "Is the pin on the correct house? Click the map to move it.",
  confirmLabel = "Yes, Correct",
  rejectLabel = "Cancel",
  onConfirm,
  onReject,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [zoom] = useState(initialZoom ?? DEFAULT_ZOOM);
  const [pinLat, setPinLat] = useState(lat);
  const [pinLng, setPinLng] = useState(lng);
  const [tilesLoaded, setTilesLoaded] = useState(false);
  const [moved, setMoved] = useState(false);
  const tilesRef = useRef<HTMLImageElement[]>([]);

  // Tile math for the ORIGINAL center (map doesn't pan, only pin moves)
  const n = 2 ** zoom;
  const latRad = (lat * Math.PI) / 180;
  const centerXTile = Math.floor(((lng + 180) / 360) * n);
  const centerYTile = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  );
  const metersPerPx = (40075016.686 * Math.cos(latRad)) / (TILE_SIZE * n);
  const offset = Math.floor(GRID / 2);
  const originTileX = centerXTile - offset;
  const originTileY = centerYTile - offset;

  // Convert lat/lng to canvas pixel
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

  // Convert canvas pixel to lat/lng
  const pixelToLatlng = useCallback(
    (px: number, py: number) => {
      const xFrac = px / TILE_SIZE + originTileX;
      const yFrac = py / TILE_SIZE + originTileY;
      const pLng = (xFrac / n) * 360 - 180;
      const pLatRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * yFrac) / n)));
      const pLat = (pLatRad * 180) / Math.PI;
      return { lat: pLat, lng: pLng };
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

    // Original geocode marker (small faded crosshair)
    const orig = latlngToPixel(lat, lng);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(orig.x - 15, orig.y);
    ctx.lineTo(orig.x + 15, orig.y);
    ctx.moveTo(orig.x, orig.y - 15);
    ctx.lineTo(orig.x, orig.y + 15);
    ctx.stroke();
    ctx.setLineDash([]);

    // Pin at current position
    const pin = latlngToPixel(pinLat, pinLng);

    // Pin shadow
    ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
    ctx.beginPath();
    ctx.ellipse(pin.x + 2, pin.y + 2, 8, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Pin body (teardrop shape)
    ctx.fillStyle = moved ? "#22c55e" : "#ef4444";
    ctx.beginPath();
    ctx.moveTo(pin.x, pin.y);
    ctx.bezierCurveTo(pin.x - 12, pin.y - 16, pin.x - 12, pin.y - 30, pin.x, pin.y - 34);
    ctx.bezierCurveTo(pin.x + 12, pin.y - 30, pin.x + 12, pin.y - 16, pin.x, pin.y);
    ctx.fill();
    ctx.strokeStyle = "white";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Pin dot
    ctx.fillStyle = "white";
    ctx.beginPath();
    ctx.arc(pin.x, pin.y - 22, 4, 0, Math.PI * 2);
    ctx.fill();
  }, [tilesLoaded, pinLat, pinLng, lat, lng, latlngToPixel, moved]);

  useEffect(() => {
    draw();
  }, [draw]);

  // Click to move pin
  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = CANVAS_SIZE / rect.width;
    const scaleY = CANVAS_SIZE / rect.height;
    const px = (e.clientX - rect.left) * scaleX;
    const py = (e.clientY - rect.top) * scaleY;

    const { lat: newLat, lng: newLng } = pixelToLatlng(px, py);
    setPinLat(newLat);
    setPinLng(newLng);
    setMoved(true);
  };

  const resetPin = () => {
    setPinLat(lat);
    setPinLng(lng);
    setMoved(false);
  };

  return (
    <div className="space-y-3">
      <div>
        <h4 className="font-semibold text-brand-900 text-sm flex items-center gap-2">
          <MapPin size={15} className="text-brand-500" />
          {title}
        </h4>
        <p className="text-xs text-brand-600/60 mt-0.5">{subtitle}</p>
      </div>

      <div className="relative rounded-xl overflow-hidden border border-brand-200/50 shadow-hex-card">
        <canvas
          ref={canvasRef}
          width={CANVAS_SIZE}
          height={CANVAS_SIZE}
          onClick={handleClick}
          className="w-full cursor-crosshair"
          style={{ maxHeight: "450px" }}
        />
        {!tilesLoaded && (
          <div className="absolute inset-0 flex items-center justify-center bg-hex-dark/60 backdrop-blur-sm text-white text-sm">
            Loading satellite imagery...
          </div>
        )}

        {moved && (
          <div className="absolute top-3 left-3 bg-emerald-500/90 text-white text-xs font-semibold px-3 py-1.5 rounded-lg">
            Pin moved — confirm new location
          </div>
        )}

        {/* Scale indicator */}
        <div className="absolute bottom-3 right-3 flex items-center gap-1.5 text-[10px] text-white/80 bg-black/50 px-2 py-1 rounded">
          <div className="w-[60px] h-0.5 bg-white/60" />
          <span>{(metersPerPx * 60 * 3.28084).toFixed(0)} ft</span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {moved && (
          <button onClick={resetPin} className="btn-secondary text-xs">
            <RotateCcw size={13} /> Reset Pin
          </button>
        )}
        <div className="flex gap-2 ml-auto">
          {onReject && (
            <button onClick={onReject} className="btn-secondary text-xs">
              <X size={13} /> {rejectLabel}
            </button>
          )}
          <button onClick={() => onConfirm(pinLat, pinLng)} className="btn-primary text-xs">
            <Check size={13} /> {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
