#!/usr/bin/env python3
"""
Roof Report PDF Generator
Pages:
  1 — Satellite image + measurements
  2 — 2D roof diagram with labeled edge dimensions
  3 — Quote pricing (if a quote exists)
"""

import json
import math
import sys
import os
from io import BytesIO
from datetime import datetime

import requests
from PIL import Image, ImageDraw
from reportlab.lib.pagesizes import letter
from reportlab.lib.colors import HexColor, white
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader


# ── Brand colors ──────────────────────────────────────────────────
BRAND_900 = HexColor("#0c4a6e")
BRAND_700 = HexColor("#0369a1")
BRAND_600 = HexColor("#0284c7")
BRAND_500 = HexColor("#0ea5e9")
BRAND_400 = HexColor("#38bdf8")
BRAND_200 = HexColor("#bae6fd")
BRAND_100 = HexColor("#e0f2fe")
BRAND_50  = HexColor("#f0f9ff")
GRAY_600  = HexColor("#4b5563")
GRAY_400  = HexColor("#9ca3af")
GRAY_200  = HexColor("#e5e7eb")
GRAY_50   = HexColor("#f9fafb")


# ── Geometry helpers ───────────────────────────────────────────────

def haversine_ft(lat1, lng1, lat2, lng2):
    """Distance in feet between two lat/lng points."""
    R = 20902231  # Earth radius in feet
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = (math.sin(dlat / 2) ** 2
         + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2))
         * math.sin(dlng / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def latlng_to_local_ft(points):
    """
    Convert a list of [lat, lng] pairs to local XY coordinates in feet,
    using the centroid as origin with a flat-earth projection.
    Returns list of (x_ft, y_ft).
    """
    c_lat = sum(p[0] for p in points) / len(points)
    c_lng = sum(p[1] for p in points) / len(points)
    lat_rad = math.radians(c_lat)
    ft_per_deg_lat = 364000  # ~ft per degree latitude
    ft_per_deg_lng = 364000 * math.cos(lat_rad)

    return [
        ((p[1] - c_lng) * ft_per_deg_lng,
         -((p[0] - c_lat) * ft_per_deg_lat))   # flip Y so north is up
        for p in points
    ]


def pixel_to_local_ft(points, meters_per_px):
    """Convert pixel polygon to local feet coordinates."""
    ft_per_px = meters_per_px * 3.28084
    cx = sum(p[0] for p in points) / len(points)
    cy = sum(p[1] for p in points) / len(points)
    return [((p[0] - cx) * ft_per_px, -((p[1] - cy) * ft_per_px)) for p in points]


def edge_length_ft(pts_ft, i):
    """Length in feet of edge i→i+1."""
    j = (i + 1) % len(pts_ft)
    dx = pts_ft[j][0] - pts_ft[i][0]
    dy = pts_ft[j][1] - pts_ft[i][1]
    return math.hypot(dx, dy)


def align_polygon(pts_ft):
    """
    Rotate pts_ft so the longest edge is axis-aligned (horizontal).
    Returns rotated pts_ft list.
    """
    if len(pts_ft) < 2:
        return pts_ft
    # Find longest edge
    best_angle = 0
    best_len = -1
    n = len(pts_ft)
    for i in range(n):
        j = (i + 1) % n
        dx = pts_ft[j][0] - pts_ft[i][0]
        dy = pts_ft[j][1] - pts_ft[i][1]
        length = math.hypot(dx, dy)
        if length > best_len:
            best_len = length
            best_angle = math.atan2(dy, dx)
    # Rotate so longest edge is horizontal (0 degrees)
    angle = -best_angle
    cos_a, sin_a = math.cos(angle), math.sin(angle)
    rotated = [(x * cos_a - y * sin_a, x * sin_a + y * cos_a) for x, y in pts_ft]
    # After rotation, ensure the polygon bounding box top is at positive Y
    # (i.e., don't flip upside down)
    ys = [p[1] for p in rotated]
    if ys[0] < sum(ys) / len(ys):
        pass  # already fine
    return rotated


def scale_and_center(pts_ft, box_x, box_y, box_w, box_h, padding=40):
    """
    Scale and translate local-ft points to fit inside the given page box.
    Returns (scaled_pts, scale_factor).
    """
    xs = [p[0] for p in pts_ft]
    ys = [p[1] for p in pts_ft]
    span_x = max(xs) - min(xs) or 1
    span_y = max(ys) - min(ys) or 1
    scale = min((box_w - padding * 2) / span_x, (box_h - padding * 2) / span_y)

    cx = (max(xs) + min(xs)) / 2
    cy = (max(ys) + min(ys)) / 2
    origin_x = box_x + box_w / 2
    origin_y = box_y + box_h / 2

    scaled = [
        (origin_x + (p[0] - cx) * scale,
         origin_y + (p[1] - cy) * scale)
        for p in pts_ft
    ]
    return scaled, scale


# ── Satellite tile fetcher ─────────────────────────────────────────

def fetch_satellite_image(lat, lng, zoom, grid=5, tile_size=256):
    n = 2 ** zoom
    lat_rad = math.radians(lat)
    cx = int(((lng + 180) / 360) * n)
    cy = int((1 - math.log(math.tan(lat_rad) + 1 / math.cos(lat_rad)) / math.pi) / 2 * n)
    offset = grid // 2
    size = tile_size * grid
    img = Image.new("RGB", (size, size), (13, 31, 60))
    for row in range(grid):
        for col in range(grid):
            tx, ty = cx - offset + col, cy - offset + row
            url = (f"https://server.arcgisonline.com/ArcGIS/rest/services/"
                   f"World_Imagery/MapServer/tile/{zoom}/{ty}/{tx}")
            try:
                resp = requests.get(url, timeout=10)
                if resp.status_code == 200:
                    img.paste(Image.open(BytesIO(resp.content)), (col * tile_size, row * tile_size))
            except Exception:
                pass
    return img


def draw_polygon_overlay(img, polygon, lat, lng, zoom, grid=5, tile_size=256):
    """Draw traced polygon on satellite image. Returns (img, facet_count)."""
    if not polygon or len(polygon) < 3:
        return img, 2
    draw = ImageDraw.Draw(img, "RGBA")
    n = 2 ** zoom
    lat_rad = math.radians(lat)
    cx = int(((lng + 180) / 360) * n)
    cy = int((1 - math.log(math.tan(lat_rad) + 1 / math.cos(lat_rad)) / math.pi) / 2 * n)
    offset = grid // 2
    is_latlng = all(abs(p[0]) <= 90 and abs(p[1]) <= 180 for p in polygon)
    if is_latlng:
        pixels = []
        for p_lat, p_lng in polygon:
            xf = ((p_lng + 180) / 360) * n
            p_lr = math.radians(p_lat)
            yf = (1 - math.log(math.tan(p_lr) + 1 / math.cos(p_lr)) / math.pi) / 2 * n
            pixels.append(((xf - (cx - offset)) * tile_size, (yf - (cy - offset)) * tile_size))
    else:
        pixels = [(p[0], p[1]) for p in polygon]
    draw.polygon(pixels, fill=(14, 165, 233, 55))
    for i in range(len(pixels)):
        draw.line([pixels[i], pixels[(i + 1) % len(pixels)]], fill=(14, 165, 233, 220), width=3)
    for i, (px, py) in enumerate(pixels):
        r = 5
        fill = (239, 68, 68, 255) if i == 0 else (14, 165, 233, 255)
        draw.ellipse([px - r, py - r, px + r, py + r], fill=fill, outline=(255, 255, 255, 255), width=2)
    return img, estimate_facets(pixels)


def estimate_facets(pixels):
    if len(pixels) < 3:
        return 2
    n = len(pixels)
    angles = [math.atan2(pixels[(i+1)%n][1]-pixels[i][1], pixels[(i+1)%n][0]-pixels[i][0]) for i in range(n)]
    changes = sum(1 for i in range(n)
                  if min(abs(angles[(i+1)%n]-angles[i]), 2*math.pi - abs(angles[(i+1)%n]-angles[i])) > math.radians(25))
    return max(2, changes // 2)


def degrees_to_pitch_ratio(deg):
    return f"{round(math.tan(math.radians(deg)) * 12)}/12"


def degrees_to_bracket(deg):
    if deg <= 10: return "Flat"
    if deg <= 20: return "Low Slope"
    if deg <= 30: return "Medium"
    if deg <= 40: return "Steep"
    return "Very Steep"


# ── Page layout helpers ────────────────────────────────────────────

def draw_page_header(c, w, h, company_name, tagline, right_label, right_sub, company=None):
    """Compact 70-pt header bar matching quote page style."""
    c.setFillColor(BRAND_900)
    c.rect(0, h - 70, w, 70, fill=1, stroke=0)
    # Hex icon
    _draw_hex(c, 52, h - 35, 16, BRAND_500)
    # Company name
    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 16)
    c.drawString(78, h - 32, company_name)
    if tagline:
        c.setFont("Helvetica", 8)
        c.setFillColor(BRAND_200)
        c.drawString(78, h - 46, tagline)
    # Right labels
    c.setFont("Helvetica-Bold", 10)
    c.setFillColor(white)
    c.drawRightString(w - 40, h - 28, right_label)
    c.setFont("Helvetica", 8)
    c.setFillColor(BRAND_200)
    if right_sub:
        c.drawRightString(w - 40, h - 42, right_sub)
    # Company contact
    if company:
        y = h - 54
        for field in ["company_phone", "company_email"]:
            val = company.get(field, "")
            if val:
                c.setFont("Helvetica", 7)
                c.setFillColor(BRAND_400)
                c.drawRightString(w - 40, y, val)
                y -= 10


def draw_client_bar(c, w, h, client_name, address, job_id):
    """Light blue client info strip."""
    c.setFillColor(BRAND_50)
    c.rect(0, h - 110, w, 40, fill=1, stroke=0)
    c.setStrokeColor(BRAND_200)
    c.line(0, h - 110, w, h - 110)
    c.setFillColor(BRAND_900)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(40, h - 95, client_name)
    if address:
        c.setFont("Helvetica", 9)
        c.setFillColor(GRAY_600)
        c.drawString(40, h - 107, address)
    c.setFont("Helvetica", 8)
    c.setFillColor(GRAY_400)
    c.drawRightString(w - 40, h - 98, f"Job #{job_id:05d}")


def draw_page_footer(c, w, company_name, page_num=None):
    c.setStrokeColor(GRAY_200)
    c.setLineWidth(0.5)
    c.line(40, 40, w - 40, 40)
    c.setFont("Helvetica", 6)
    c.setFillColor(GRAY_400)
    c.drawCentredString(w / 2, 28, f"Generated by {company_name} \u2022 Powered by Roof Tool")
    if page_num:
        c.drawRightString(w - 40, 28, f"Page {page_num}")


def _draw_hex(c, cx, cy, size, fill_color):
    pts = [(cx + size * math.cos(math.radians(60*i - 30)),
            cy + size * math.sin(math.radians(60*i - 30))) for i in range(6)]
    p = c.beginPath()
    p.moveTo(pts[0][0], pts[0][1])
    for pt in pts[1:]: p.lineTo(pt[0], pt[1])
    p.close()
    c.setFillColor(fill_color)
    c.drawPath(p, fill=1, stroke=0)


# ── 2D Roof Diagram Page ───────────────────────────────────────────

def draw_roof_diagram_page(c, w, h, polygon, meters_per_px, company_name, tagline,
                            client_name, address, job_id, company, roof_sqft=None):
    """
    Draw a clean 2D technical diagram of the roof outline with labeled
    edge dimensions and corner markers.
    """
    c.showPage()

    # Header & client bar
    draw_page_header(c, w, h, company_name, tagline, "ROOF DIAGRAM", "2D Outline & Dimensions", company)
    draw_client_bar(c, w, h, client_name, address, job_id)

    # ── Total sq ft hero stat ────────────────────────────────────
    # Prominent area callout below client bar
    y_hero = h - 128
    hero_x = w - 40
    c.setFillColor(BRAND_700)
    c.setFont("Helvetica-Bold", 18)
    area_text = f"{roof_sqft:,.0f} sq ft" if roof_sqft else "—"
    c.drawRightString(hero_x, y_hero, area_text)
    c.setFont("Helvetica", 8)
    c.setFillColor(GRAY_400)
    c.drawRightString(hero_x, y_hero - 13, "Total Roof Area")

    # Section title
    y_title = h - 130
    c.setFont("Helvetica-Bold", 10)
    c.setFillColor(BRAND_700)
    c.drawString(40, y_title, "ROOF OUTLINE — LABELED DIMENSIONS")
    c.setFont("Helvetica", 7)
    c.setFillColor(GRAY_400)
    c.drawString(265, y_title, "All measurements in feet  \u2022  Derived from traced satellite outline")

    # Divider
    c.setStrokeColor(BRAND_200)
    c.setLineWidth(0.8)
    c.line(40, y_title - 6, w - 40, y_title - 6)

    # ── Coordinate conversion ─────────────────────────────────────
    is_latlng = all(abs(p[0]) <= 90 and abs(p[1]) <= 180 for p in polygon)
    if is_latlng:
        pts_ft = latlng_to_local_ft(polygon)
        edge_lengths = [haversine_ft(polygon[i][0], polygon[i][1],
                                     polygon[(i+1)%len(polygon)][0],
                                     polygon[(i+1)%len(polygon)][1])
                        for i in range(len(polygon))]
    else:
        pts_ft = pixel_to_local_ft(polygon, meters_per_px or 0.15)
        edge_lengths = [edge_length_ft(pts_ft, i) for i in range(len(pts_ft))]

    # Filter out degenerate zero-length edges (duplicate points)
    MIN_EDGE_FT = 0.5
    valid_indices = [i for i, l in enumerate(edge_lengths) if l >= MIN_EDGE_FT]
    # Build cleaned polygon (unique points only)
    clean_polygon = [polygon[i] for i in valid_indices]
    clean_pts_ft  = [pts_ft[i] for i in valid_indices]
    clean_lengths  = [edge_lengths[i] for i in valid_indices]

    if len(clean_pts_ft) < 3:
        clean_pts_ft = pts_ft
        clean_lengths = edge_lengths
        clean_polygon = polygon

    n = len(clean_pts_ft)

    # ── Axis-align: rotate so longest edge is horizontal ─────────
    aligned_pts_ft = align_polygon(clean_pts_ft)

    # ── Diagram bounding box ──────────────────────────────────────
    # Generous margins so labels never spill outside
    label_margin = 60   # space for dimension pill labels
    footer_h = 90       # height reserved for stats box + footer
    header_bottom = h - y_title + 20   # px used by header/title

    box_x = 40 + label_margin
    box_y = footer_h
    box_w = w - 80 - label_margin * 2
    box_h = h - header_bottom - footer_h - label_margin

    scaled_pts, scale = scale_and_center(aligned_pts_ft, box_x, box_y, box_w, box_h, padding=label_margin)

    # ── Draw subtle grid (confined to diagram box) ────────────────
    c.setStrokeColor(HexColor("#e8f4fd"))
    c.setLineWidth(0.3)
    grid_spacing = 40
    gx_start = int(box_x)
    gx_end   = int(box_x + box_w) + 1
    gy_start = int(box_y)
    gy_end   = int(box_y + box_h) + 1
    for gx in range(gx_start, gx_end, grid_spacing):
        c.line(gx, gy_start, gx, gy_end)
    for gy in range(gy_start, gy_end, grid_spacing):
        c.line(gx_start, gy, gx_end, gy)

    # ── Build path helper ─────────────────────────────────────────
    def make_path():
        p = c.beginPath()
        p.moveTo(scaled_pts[0][0], scaled_pts[0][1])
        for pt in scaled_pts[1:]:
            p.lineTo(pt[0], pt[1])
        p.close()
        return p

    # ── Solid fill ────────────────────────────────────────────────
    c.setFillColor(BRAND_100)
    c.drawPath(make_path(), fill=1, stroke=0)

    # ── Inner shadow / depth effect (slightly darker inner ring) ──
    # Draw a slightly inset version of the polygon with BRAND_200
    inset_pts = []
    cx_poly = sum(p[0] for p in scaled_pts) / n
    cy_poly = sum(p[1] for p in scaled_pts) / n
    inset_d = 6  # px inward
    for px, py in scaled_pts:
        dx = cx_poly - px
        dy = cy_poly - py
        d = math.hypot(dx, dy) or 1
        inset_pts.append((px + dx / d * inset_d, py + dy / d * inset_d))

    p_inner = c.beginPath()
    p_inner.moveTo(inset_pts[0][0], inset_pts[0][1])
    for pt in inset_pts[1:]:
        p_inner.lineTo(pt[0], pt[1])
    p_inner.close()
    c.setStrokeColor(BRAND_200)
    c.setLineWidth(1.2)
    c.drawPath(p_inner, fill=0, stroke=1)

    # ── Outline ───────────────────────────────────────────────────
    c.setStrokeColor(BRAND_500)
    c.setLineWidth(2.5)
    c.drawPath(make_path(), fill=0, stroke=1)

    # ── Edge dimension labels ─────────────────────────────────────
    vertex_labels = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    for i in range(n):
        j = (i + 1) % n
        ax, ay = scaled_pts[i]
        bx, by = scaled_pts[j]

        mx = (ax + bx) / 2
        my = (ay + by) / 2

        # Push label outward from centroid
        outward_x = mx - cx_poly
        outward_y = my - cy_poly
        outward_len = math.hypot(outward_x, outward_y) or 1
        outward_x /= outward_len
        outward_y /= outward_len

        label_offset = 28
        lx = mx + outward_x * label_offset
        ly = my + outward_y * label_offset

        # Perpendicular tick marks at each end
        edge_angle = math.atan2(by - ay, bx - ax)
        perp_angle = edge_angle + math.pi / 2
        tick = 5
        c.setStrokeColor(BRAND_400)
        c.setLineWidth(0.8)
        for ex, ey in [(ax, ay), (bx, by)]:
            c.line(ex + math.cos(perp_angle)*tick, ey + math.sin(perp_angle)*tick,
                   ex - math.cos(perp_angle)*tick, ey - math.sin(perp_angle)*tick)

        # Dashed leader line midpoint → label
        c.setDash([3, 3])
        c.setStrokeColor(BRAND_400)
        c.setLineWidth(0.5)
        c.line(mx, my, lx, ly)
        c.setDash([])

        # Pill label
        length_ft = clean_lengths[i]
        label_text = f"{length_ft:.1f} ft"
        c.setFont("Helvetica-Bold", 8)
        tw = c.stringWidth(label_text, "Helvetica-Bold", 8)
        pill_w = tw + 10
        pill_h = 13
        c.setFillColor(BRAND_700)
        c.roundRect(lx - pill_w / 2, ly - pill_h / 2, pill_w, pill_h, 3, fill=1, stroke=0)
        c.setFillColor(white)
        c.drawCentredString(lx, ly - 3, label_text)

    # ── Vertex circles (drawn last so they sit on top) ────────────
    for i, (px, py) in enumerate(scaled_pts):
        c.setFillColor(white)
        c.setStrokeColor(BRAND_600)
        c.setLineWidth(1.5)
        c.circle(px, py, 7, fill=1, stroke=1)
        c.setFillColor(BRAND_700)
        c.setFont("Helvetica-Bold", 6)
        c.drawCentredString(px, py - 2.5, vertex_labels[i % len(vertex_labels)])

    # ── Stats box (bottom left, above footer) ─────────────────────
    total_perimeter = sum(clean_lengths)
    stats = [
        ("Total Roof Area", f"{roof_sqft:,.0f} sq ft" if roof_sqft else "—"),
        ("Perimeter", f"{total_perimeter:.1f} ft"),
        ("Longest edge", f"{max(clean_lengths):.1f} ft"),
        ("Shortest edge", f"{min(clean_lengths):.1f} ft"),
        ("Vertices", str(n)),
    ]
    stats_x = 48
    stats_w = 170
    stats_row_h = 16
    stats_total_h = len(stats) * stats_row_h + 14
    stats_y = 55  # bottom of box

    c.setFillColor(BRAND_50)
    c.setStrokeColor(BRAND_200)
    c.setLineWidth(0.8)
    c.roundRect(stats_x - 8, stats_y, stats_w, stats_total_h, 5, fill=1, stroke=1)

    y_stat = stats_y + stats_total_h - 8
    for stat_name, stat_val in stats:
        # Highlight first row (area) in bold blue
        if stat_name == "Total Roof Area":
            c.setFont("Helvetica-Bold", 8)
            c.setFillColor(BRAND_700)
            c.drawString(stats_x, y_stat, stat_name)
            c.setFont("Helvetica-Bold", 8)
            c.setFillColor(BRAND_900)
            c.drawRightString(stats_x + stats_w - 16, y_stat, stat_val)
        else:
            c.setFont("Helvetica", 7)
            c.setFillColor(GRAY_600)
            c.drawString(stats_x, y_stat, stat_name)
            c.setFont("Helvetica-Bold", 7)
            c.setFillColor(BRAND_900)
            c.drawRightString(stats_x + stats_w - 16, y_stat, stat_val)
        y_stat -= stats_row_h

    # ── Scale bar (bottom right, above footer) ────────────────────
    scale_bar_ft = 10
    scale_bar_px = scale_bar_ft * scale
    # Clamp scale bar width so it's readable
    scale_bar_px = min(scale_bar_px, 100)
    sb_x = w - 40 - scale_bar_px
    sb_y = 72

    c.setStrokeColor(BRAND_600)
    c.setLineWidth(1.5)
    c.line(sb_x, sb_y, sb_x + scale_bar_px, sb_y)
    c.line(sb_x, sb_y - 4, sb_x, sb_y + 4)
    c.line(sb_x + scale_bar_px, sb_y - 4, sb_x + scale_bar_px, sb_y + 4)
    c.setFont("Helvetica", 7)
    c.setFillColor(BRAND_700)
    c.drawCentredString(sb_x + scale_bar_px / 2, sb_y + 6, f"{scale_bar_ft} ft")

    # ── North arrow (bottom right, above scale bar) ───────────────
    if is_latlng:
        na_x = w - 40 - scale_bar_px - 30
        na_y = sb_y
        c.setFillColor(BRAND_700)
        c.setStrokeColor(BRAND_700)
        c.setLineWidth(1)
        c.line(na_x, na_y - 10, na_x, na_y + 10)
        p_arr = c.beginPath()
        p_arr.moveTo(na_x, na_y + 12)
        p_arr.lineTo(na_x - 4, na_y + 4)
        p_arr.lineTo(na_x + 4, na_y + 4)
        p_arr.close()
        c.drawPath(p_arr, fill=1, stroke=0)
        c.setFont("Helvetica-Bold", 7)
        c.setFillColor(BRAND_700)
        c.drawCentredString(na_x, na_y - 18, "N")

    draw_page_footer(c, w, company_name, page_num=2)


# ── PDF Generation ─────────────────────────────────────────────────

def generate_report(data, output_path):
    job        = data["job"]
    measurement = data.get("measurement")
    satellite  = data.get("satellite_estimate")
    quote      = data.get("quote")
    company    = data.get("company", {})

    w, h = letter
    c = canvas.Canvas(output_path, pagesize=letter)

    company_name = company.get("company_name", "Roof Tool")
    tagline      = company.get("company_tagline", "")
    address      = job.get("address", "")
    job_id       = job.get("id", 0)
    client_name  = job.get("client_name", "Client")

    sat_lat       = (satellite.get("lat") or job.get("lat")) if satellite else job.get("lat")
    sat_lng       = (satellite.get("lng") or job.get("lng")) if satellite else job.get("lng")
    polygon_json  = (satellite.get("polygon_json") or "[]") if satellite else "[]"
    sat_source    = satellite.get("source", "osm") if satellite else None
    meters_per_px = satellite.get("meters_per_px", 0.15) if satellite else 0.15

    polygon = json.loads(polygon_json) if polygon_json else []
    facet_count = 2

    # ═══════════════════════════════════════════════════════
    # PAGE 1 — Satellite image + measurements
    # ═══════════════════════════════════════════════════════

    # Full-height header for page 1
    c.setFillColor(BRAND_900)
    c.rect(0, h - 100, w, 100, fill=1, stroke=0)
    _draw_hex(c, 52, h - 50, 22, BRAND_600)
    _draw_hex(c, 52, h - 50, 16, BRAND_500)

    c.setFillColor(white)
    c.setFont("Helvetica-Bold", 20)
    c.drawString(82, h - 45, company_name)
    if tagline:
        c.setFont("Helvetica", 9)
        c.setFillColor(BRAND_200)
        c.drawString(82, h - 60, tagline)

    c.setFont("Helvetica", 8)
    c.setFillColor(BRAND_200)
    y_contact = h - 35
    for field in ["company_phone", "company_email", "company_address"]:
        val = company.get(field, "")
        if val:
            c.drawRightString(w - 40, y_contact, val)
            y_contact -= 12

    c.setFont("Helvetica-Bold", 10)
    c.setFillColor(white)
    c.drawRightString(w - 40, h - 82, "ROOF REPORT")
    c.setFont("Helvetica", 8)
    c.drawRightString(w - 40, h - 93, datetime.now().strftime("%B %d, %Y"))

    # Client bar
    c.setFillColor(BRAND_50)
    c.rect(0, h - 140, w, 40, fill=1, stroke=0)
    c.setStrokeColor(BRAND_200)
    c.line(0, h - 140, w, h - 140)
    c.setFillColor(BRAND_900)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(40, h - 125, client_name)
    if address:
        c.setFont("Helvetica", 9)
        c.setFillColor(GRAY_600)
        c.drawString(40, h - 137, address)
    c.setFont("Helvetica", 8)
    c.setFillColor(GRAY_400)
    c.drawRightString(w - 40, h - 128, f"Job #{job_id:05d}")

    y_cursor = h - 160

    # Satellite image
    sat_img = None
    if sat_lat and sat_lng:
        try:
            sat_img = fetch_satellite_image(sat_lat, sat_lng, 20, grid=5)
            if polygon and len(polygon) >= 3:
                sat_img, facet_count = draw_polygon_overlay(sat_img, polygon, sat_lat, sat_lng, 20, grid=5)
            sz = sat_img.size[0]
            margin = sz // 6
            sat_img = sat_img.crop((margin, margin, sz - margin, sz - margin))
        except Exception as e:
            print(f"Warning: satellite image failed: {e}", file=sys.stderr)

    if sat_img:
        img_w, img_h = w - 80, 280
        buf = BytesIO()
        sat_img.save(buf, format="PNG")
        buf.seek(0)
        c.setFont("Helvetica-Bold", 10)
        c.setFillColor(BRAND_700)
        c.drawString(40, y_cursor, "SATELLITE VIEW")
        c.setFont("Helvetica", 7)
        c.setFillColor(GRAY_400)
        src_label = "OpenStreetMap" if sat_source == "osm" else "Manual Trace"
        c.drawString(155, y_cursor, f"Source: {src_label}")
        y_cursor -= img_h + 10
        c.setStrokeColor(BRAND_200)
        c.setLineWidth(1)
        c.roundRect(39, y_cursor, img_w + 2, img_h + 2, 8, fill=0, stroke=1)
        c.drawImage(ImageReader(buf), 40, y_cursor + 1, img_w, img_h, preserveAspectRatio=True, anchor="c")
        y_cursor -= 15
    else:
        y_cursor -= 20

    # Measurements
    c.setFont("Helvetica-Bold", 10)
    c.setFillColor(BRAND_700)
    c.drawString(40, y_cursor, "ROOF MEASUREMENTS")
    y_cursor -= 8

    if measurement:
        pitch_deg    = measurement.get("pitch_degrees", 26.57)
        pitch_ratio  = degrees_to_pitch_ratio(pitch_deg)
        pitch_bracket = degrees_to_bracket(pitch_deg)
        poly_count   = len(polygon)

        metrics = [
            ("Roof Area",          f'{measurement.get("total_sqft", 0):,.0f} sq ft',  "Total roof surface area"),
            ("Pitch",              f'{pitch_ratio} ({pitch_deg:.1f}\u00b0)',            pitch_bracket),
            ("Estimated Facets",   str(facet_count),                                   f"Derived from {poly_count}-point outline"),
            ("Eave / Gutter Length", f'{measurement.get("eave_length_ft", 0):,.1f} lin ft', "Total perimeter"),
            ("Ridge Length",       f'{measurement.get("ridge_length_ft", 0):,.1f} lin ft', ""),
            ("Valley Length",      f'{measurement.get("valley_length_ft", 0):,.1f} lin ft', ""),
            ("Complexity Factor",  f'{measurement.get("complexity_score", 1.0):.2f}\u00d7', ""),
        ]
        col_x = [40, 200, 400]
        for name, val, note in metrics:
            y_cursor -= 20
            c.setFont("Helvetica", 9);    c.setFillColor(GRAY_600);  c.drawString(col_x[0], y_cursor, name)
            c.setFont("Helvetica-Bold", 10); c.setFillColor(BRAND_900); c.drawString(col_x[1], y_cursor, val)
            if note:
                c.setFont("Helvetica", 7); c.setFillColor(GRAY_400); c.drawString(col_x[2], y_cursor + 1, note)
            y_cursor -= 4
            c.setStrokeColor(GRAY_200); c.setLineWidth(0.5); c.line(col_x[0], y_cursor, w - 40, y_cursor)

        y_cursor -= 18
        source = measurement.get("source", "manual")
        src_labels = {"manual":"Manual Entry","satellite":"Satellite (OSM)","traced":"Satellite (Traced)","drone":"Drone (ODM)","blended":"Blended (70/30)"}
        c.setFont("Helvetica", 7); c.setFillColor(BRAND_500)
        c.drawString(40, y_cursor, f"Measurement Source: {src_labels.get(source, source)}")
    else:
        y_cursor -= 20
        c.setFont("Helvetica", 9); c.setFillColor(GRAY_400)
        c.drawString(40, y_cursor, "No measurements available")

    y_cursor -= 25
    c.setFont("Helvetica-Oblique", 7); c.setFillColor(GRAY_400)
    c.drawString(40, y_cursor,
        "Measurements are estimates derived from satellite imagery. "
        "Actual dimensions may vary. Final pricing subject to on-site inspection.")

    draw_page_footer(c, w, company_name, page_num=1)

    # ═══════════════════════════════════════════════════════
    # PAGE 2 — 2D Roof Diagram
    # ═══════════════════════════════════════════════════════
    if polygon and len(polygon) >= 3:
        # Try every place the area might live:
        # 1. measurements.total_sqft  2. satellite_estimates.roof_sqft  3. satellite_estimates.footprint_sqft
        roof_sqft = None
        if measurement:
            roof_sqft = measurement.get("total_sqft") or measurement.get("roof_sqft")
        if not roof_sqft and satellite:
            roof_sqft = satellite.get("roof_sqft") or satellite.get("footprint_sqft")
        draw_roof_diagram_page(
            c, w, h, polygon, meters_per_px,
            company_name, tagline, client_name, address, job_id, company,
            roof_sqft=roof_sqft
        )

    # ═══════════════════════════════════════════════════════
    # PAGE 3 — Quote (if available)
    # ═══════════════════════════════════════════════════════
    if quote:
        c.showPage()
        draw_page_header(c, w, h, company_name, tagline, "QUOTE",
                         f"#{quote.get('id', 0):05d}  \u2022  {datetime.now().strftime('%B %d, %Y')}", company)
        draw_client_bar(c, w, h, client_name, address, job_id)

        y_cursor = h - 130

        service_labels = {"reroof":"Full Reroof","spray":"Roof Spray / Coating",
                          "tuneup":"Roof Tune-Up","gutter_clean":"Gutter Clean"}
        services   = quote.get("service_types", [])
        svc_label  = " + ".join(service_labels.get(s, s) for s in services)

        c.setFont("Helvetica-Bold", 9); c.setFillColor(BRAND_700)
        c.drawString(40, y_cursor, "SERVICE")
        y_cursor -= 14
        c.setFont("Helvetica", 10); c.setFillColor(BRAND_900)
        c.drawString(40, y_cursor, svc_label)
        y_cursor -= 28

        line_items = quote.get("line_items", [])
        if line_items:
            cols = [40, 280, 340, 410, 490]
            headers = ["Description", "Qty", "Unit", "Rate", "Amount"]
            c.setFillColor(BRAND_50)
            c.rect(40, y_cursor - 4, w - 80, 18, fill=1, stroke=0)
            c.setFont("Helvetica-Bold", 7); c.setFillColor(BRAND_700)
            for cp, hdr in zip(cols, headers):
                if hdr == "Description": c.drawString(cp + 5, y_cursor, hdr)
                else: c.drawRightString(cp + 55, y_cursor, hdr)
            y_cursor -= 10
            c.setStrokeColor(BRAND_200); c.setLineWidth(1)
            c.line(40, y_cursor, w - 40, y_cursor)

            for item in line_items:
                y_cursor -= 18
                c.setFont("Helvetica", 9); c.setFillColor(BRAND_900)
                c.drawString(cols[0]+5, y_cursor, item.get("label",""))
                c.setFillColor(GRAY_600)
                qty = item.get("quantity", 0)
                c.drawRightString(cols[1]+55, y_cursor, f"{qty:,.0f}" if qty > 0 else "\u2014")
                c.drawRightString(cols[2]+55, y_cursor, item.get("unit",""))
                price = item.get("unit_price", 0)
                c.drawRightString(cols[3]+55, y_cursor, f"${price:.2f}" if price > 0 else "\u2014")
                c.setFillColor(BRAND_900); c.setFont("Helvetica-Bold", 9)
                sub = item.get("subtotal", 0)
                c.drawRightString(cols[4]+55, y_cursor, f"${sub:,.0f}" if sub > 0 else "\u2014")
                y_cursor -= 4
                c.setStrokeColor(GRAY_200); c.setLineWidth(0.3)
                c.line(40, y_cursor, w - 40, y_cursor)

            totals_x = w - 40
            y_cursor -= 25
            c.setFont("Helvetica", 9); c.setFillColor(GRAY_600)
            c.drawRightString(totals_x-80, y_cursor, "Subtotal")
            c.drawRightString(totals_x, y_cursor, f"${quote.get('subtotal',0):,.0f}")
            tax_rate = quote.get("tax_rate", 0)
            if tax_rate > 0:
                y_cursor -= 16
                c.drawRightString(totals_x-80, y_cursor, f"Tax ({tax_rate*100:.0f}%)")
                c.drawRightString(totals_x, y_cursor, f"${quote.get('tax',0):,.0f}")
            y_cursor -= 6
            c.setStrokeColor(BRAND_500); c.setLineWidth(2)
            c.line(totals_x-160, y_cursor, totals_x, y_cursor)
            y_cursor -= 18
            c.setFont("Helvetica-Bold", 14); c.setFillColor(BRAND_700)
            c.drawRightString(totals_x-80, y_cursor, "Total")
            c.drawRightString(totals_x, y_cursor, f"${quote.get('total',0):,.0f}")

        y_cursor -= 50
        c.setFont("Helvetica-Oblique", 7); c.setFillColor(GRAY_400)
        c.drawString(40, y_cursor, "This quote is valid for 30 days. Final pricing subject to on-site inspection.")

        draw_page_footer(c, w, company_name, page_num=3)

    c.save()
    return output_path


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python generate-report.py <job_json_path> <output_pdf_path>", file=sys.stderr)
        sys.exit(1)
    with open(sys.argv[1]) as f:
        data = json.load(f)
    output = generate_report(data, sys.argv[2])
    print(json.dumps({"ok": True, "path": output}))
