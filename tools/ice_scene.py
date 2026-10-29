"""Hero background: the product cut-outs frozen in ice blocks inside a shipping container.

Usage:  python tools/ice_scene.py
Output: public/images/hero-ice.webp (desktop, landscape) and public/images/hero-ice-mobile.webp (phone, portrait)
Products come from public/images/products/ (transparent WebP made by tools/cutout.py).
"""
import os

import cv2
import numpy as np

ROOT = os.path.join(os.path.dirname(__file__), '..')
PRODUCTS = ['navy-jacket', 'track-jacket', 'wave-pants', 'court-shorts']   # 2x2, left-to-right, top row first
SEED = 7


def rgb(*c):
    return np.array(c, np.float32)


def lerp(a, b, t):
    return a + (b - a) * t


def fill(img, pts, color):
    cv2.fillPoly(img, [np.round(np.array(pts)).astype(np.int32)], tuple(float(c) for c in color), cv2.LINE_AA)


def soft_noise(h, w, sigma, rng):
    n = cv2.GaussianBlur(rng.standard_normal((h, w)).astype(np.float32), (0, 0), sigma)
    return n / (np.abs(n).max() + 1e-6)


# ---------- container interior ----------
def container(W, H):
    img = np.zeros((H, W, 3), np.float32)
    img[:] = rgb(0.02, 0.03, 0.05)                          # night outside
    if H > W:   # phone: container in the top part, the truck bed below leaves room for the text
        x0, x1, y0, yb = W * 0.04, W * 0.96, H * 0.04, H * 0.62
        bx0, bx1, by0, by1 = W * 0.36, W * 0.64, H * 0.14, H * 0.36
    else:
        x0, x1, y0, yb = W * 0.04, W * 0.96, H * 0.07, H * 0.86  # door opening
        bx0, bx1, by0, by1 = W * 0.37, W * 0.63, H * 0.27, H * 0.56  # far wall
    o = {'tl': (x0, y0), 'tr': (x1, y0), 'br': (x1, yb), 'bl': (x0, yb)}
    i = {'tl': (bx0, by0), 'tr': (bx1, by0), 'br': (bx1, by1), 'bl': (bx0, by1)}
    P = lambda a, b, t: (lerp(a[0], b[0], t), lerp(a[1], b[1], t))

    # Corrugated ceiling and side walls: bands that get thinner with depth
    depths = [1 - 1 / (1 + k * 0.22) for k in range(60)] + [1.0]
    for k in range(len(depths) - 1):
        t0, t1 = depths[k], depths[k + 1]
        light = k % 2 == 0
        fill(img, [P(o['tl'], i['tl'], t0), P(o['tr'], i['tr'], t0), P(o['tr'], i['tr'], t1), P(o['tl'], i['tl'], t1)],
             rgb(0.44, 0.49, 0.57) if light else rgb(0.26, 0.30, 0.37))
        for a, b in (('tl', 'bl'), ('tr', 'br')):
            fill(img, [P(o[a], i[a], t0), P(o[b], i[b], t0), P(o[b], i[b], t1), P(o[a], i[a], t1)],
                 rgb(0.30, 0.35, 0.44) if light else rgb(0.19, 0.23, 0.30))
    fill(img, [i['tl'], i['tr'], i['br'], i['bl']], rgb(0.11, 0.13, 0.17))

    # Floor with planks running towards the back, and the truck bed in front
    fill(img, [o['bl'], o['br'], i['br'], i['bl']], rgb(0.36, 0.39, 0.44))
    for k in range(28):
        t = k / 27
        cv2.line(img, tuple(np.int32(P(o['bl'], o['br'], t))), tuple(np.int32(P(i['bl'], i['br'], t))),
                 (0.22, 0.24, 0.28), 2, cv2.LINE_AA)
    deck = [(-W * 0.1, H), (W * 1.1, H), o['br'], o['bl']]
    fill(img, deck, rgb(0.46, 0.49, 0.54))
    for k in range(70):
        t = k / 69
        cv2.line(img, (int(lerp(-W * 0.1, W * 1.1, t)), H), tuple(np.int32(P(o['bl'], o['br'], t))),
                 (0.27, 0.29, 0.33), 2, cv2.LINE_AA)

    # Blue steel door frame
    f = W * 0.018
    for pts in ([(x0 - f, y0 - f), (x1 + f, y0 - f), (x1 + f, y0), (x0 - f, y0)],
                [(x0 - f, y0 - f), (x0, y0 - f), (x0, yb), (x0 - f, yb + f * 0.6)],
                [(x1, y0 - f), (x1 + f, y0 - f), (x1 + f, yb + f * 0.6), (x1, yb)]):
        fill(img, pts, rgb(0.09, 0.16, 0.36))
    return img, yb


# ---------- ice blocks ----------
def ice_block(product, bw, bh, rng):
    y, x = np.mgrid[0:bh, 0:bw].astype(np.float32)
    base = lerp(rgb(0.93, 0.95, 0.97), rgb(0.80, 0.86, 0.92), (y / bh)[..., None])
    base += soft_noise(bh, bw, bw * 0.06, rng)[..., None] * 0.06

    # The garment inside: cooled, slightly blurred, as if seen through ice
    size = int(min(bw, bh) * 0.86)
    p = cv2.resize(product, (size, size), interpolation=cv2.INTER_AREA).astype(np.float32) / 255
    p_rgb, p_a = p[..., 2::-1], p[..., 3:]
    grey = p_rgb.mean(axis=2, keepdims=True)
    p_rgb = lerp(p_rgb, grey, 0.25) * rgb(0.86, 0.93, 1.04) * 0.92
    p_rgb, p_a = cv2.GaussianBlur(p_rgb, (0, 0), 1.0), cv2.GaussianBlur(p_a, (0, 0), 1.0)[..., None]
    oy, ox = int((bh - size) * 0.42), (bw - size) // 2
    region = base[oy:oy + size, ox:ox + size]
    base[oy:oy + size, ox:ox + size] = lerp(region, p_rgb, p_a * 0.94)

    # Frost: cloudy patches, streaks, cracks and bubbles on top of the garment
    frost = np.clip(soft_noise(bh, bw, bw * 0.035, rng) * 0.8 + 0.15, 0, 1) * 0.30
    streaks = np.zeros((bh, bw), np.float32)
    for _ in range(26):
        sx = rng.uniform(0, bw)
        cv2.line(streaks, (int(sx), int(rng.uniform(0, bh * 0.3))),
                 (int(sx + rng.uniform(-bw * 0.08, bw * 0.08)), int(rng.uniform(bh * 0.6, bh))), 1.0, 2, cv2.LINE_AA)
    frost += cv2.GaussianBlur(streaks, (0, 0), 3) * 0.25
    cracks = np.zeros((bh, bw), np.float32)
    for _ in range(9):
        pt = np.array([rng.uniform(0, bw), rng.uniform(0, bh)])
        ang = rng.uniform(0, np.pi * 2)
        for _ in range(int(rng.integers(4, 9))):
            ang += rng.uniform(-0.6, 0.6)
            nxt = pt + np.array([np.cos(ang), np.sin(ang)]) * rng.uniform(bw * 0.03, bw * 0.08)
            cv2.line(cracks, tuple(np.int32(pt)), tuple(np.int32(nxt)), 1.0, 1, cv2.LINE_AA)
            pt = nxt
    frost += cracks * 0.55
    for _ in range(60):
        cv2.circle(frost, (int(rng.uniform(0, bw)), int(rng.uniform(0, bh))), int(rng.integers(1, 4)), 0.5, -1, cv2.LINE_AA)
    base = lerp(base, rgb(0.97, 0.98, 1.0), np.clip(frost, 0, 1)[..., None])

    # Thick glassy edges: darker rim, bright highlight, lit top face
    edge = np.minimum.reduce([x, y, bw - 1 - x, bh - 1 - y]) / (min(bw, bh) * 0.08)
    base *= (0.78 + 0.22 * np.clip(edge, 0, 1))[..., None]
    rim = np.zeros((bh, bw), np.float32)
    cv2.rectangle(rim, (3, 3), (bw - 4, bh - 4), 1.0, 2, cv2.LINE_AA)
    base = lerp(base, rgb(1, 1, 1), cv2.GaussianBlur(rim, (0, 0), 1.5)[..., None] * 0.8)
    top = np.clip(1 - y / (bh * 0.05), 0, 1)
    return np.clip(lerp(base, rgb(0.98, 0.99, 1.0), top[..., None] * 0.7), 0, 1)


def place_blocks(img, floor_y, rng):
    H, W = img.shape[:2]
    portrait = H > W
    bw = int(min(W * 0.34, H * 0.26) if portrait else min(W * 0.17, H * 0.28))
    bh, gap = int(bw * 1.08), max(6, bw // 28)
    left, top = (W - (2 * bw + gap)) // 2, int(floor_y - (2 * bh + gap))
    if not portrait:
        left = int(W * 0.70 - bw - gap / 2)   # desktop: blocks sit right of centre, text goes on the left

    # Cold glow from the ice lighting up the container
    glow = np.zeros((H, W), np.float32)
    cv2.rectangle(glow, (left, top), (left + 2 * bw + gap, top + 2 * bh + gap), 1.0, -1)
    glow = cv2.GaussianBlur(glow, (0, 0), bw * 0.9)
    img[:] = img * (0.55 + 0.9 * glow[..., None]) + rgb(0.35, 0.45, 0.6) * glow[..., None] * 0.25

    # Shadow and melt on the floor
    shadow = np.zeros((H, W), np.float32)
    cv2.ellipse(shadow, (left + bw + gap // 2, int(floor_y)), (int(bw * 1.15), int(bh * 0.06)), 0, 0, 360, 1.0, -1)
    img[:] *= 1 - cv2.GaussianBlur(shadow, (0, 0), bw * 0.08)[..., None] * 0.6

    # Visible side faces (the blocks are thick): the side facing the centre of view
    vp = np.array([W / 2, H * (0.25 if portrait else 0.42)])
    span = (left, left + 2 * bw + gap)
    side_x = span[0] if span[0] > vp[0] - bw else span[1]   # left side if blocks are right of centre
    for r in range(2):
        by = top + r * (bh + gap)
        a, b = np.array([side_x, by], np.float32), np.array([side_x, by + bh], np.float32)
        face = [a, b, b + (vp - b) * 0.10, a + (vp - a) * 0.10]
        fill(img, face, rgb(0.62, 0.72, 0.82))
        m = np.zeros((H, W), np.float32)
        fill(m, face, (1.0,))
        img[:] = lerp(img, rgb(0.85, 0.9, 0.95), (m * (soft_noise(H, W, 6, rng) * 0.3 + 0.2))[..., None])

    for k, name in enumerate(PRODUCTS):
        prod = cv2.imread(os.path.join(ROOT, 'public', 'images', 'products', f'{name}.webp'), cv2.IMREAD_UNCHANGED)
        r, c = divmod(k, 2)
        bx, by = left + c * (bw + gap), top + r * (bh + gap)
        img[by:by + bh, bx:bx + bw] = ice_block(prod, bw, bh, rng)

    # Crushed ice: heaped along the base of the blocks, a few bits scattered further out
    snow = np.zeros((H, W), np.float32)
    for _ in range(int(W * 0.5)):
        sx = rng.uniform(span[0] - bw * 0.15, span[1] + bw * 0.15)
        sy = floor_y + abs(rng.normal(0, bh * 0.05)) ** 1.0
        cv2.circle(snow, (int(sx), int(sy)), int(rng.integers(2, 5)), float(rng.uniform(0.6, 1)), -1, cv2.LINE_AA)
    for _ in range(int(W * 0.12)):
        sx, sy = rng.normal((span[0] + span[1]) / 2, bw * 0.8), floor_y + abs(rng.normal(0, bh * 0.25))
        if 0 <= sx < W and sy < H:
            cv2.circle(snow, (int(sx), int(sy)), int(rng.integers(1, 3)), float(rng.uniform(0.4, 0.9)), -1, cv2.LINE_AA)
    for _ in range(10):
        cv2.ellipse(snow, (int(rng.uniform(span[0], span[1])), int(floor_y + rng.uniform(0, bh * 0.02))),
                    (int(rng.uniform(bw * 0.06, bw * 0.18)), int(rng.uniform(bh * 0.012, bh * 0.03))), 0, 180, 360, 0.95, -1)
    img[:] = lerp(img, rgb(0.92, 0.95, 0.98), cv2.GaussianBlur(snow, (0, 0), 0.8)[..., None])


def grade(img, rng):
    H, W = img.shape[:2]
    img = img * rgb(0.88, 0.97, 1.08)                     # cold night flash look
    img = (img - 0.5) * 1.12 + 0.48
    y, x = np.mgrid[0:H, 0:W].astype(np.float32)
    vig = 1 - 0.55 * (((x - W / 2) / (W * 0.62)) ** 2 + ((y - H * 0.5) / (H * 0.62)) ** 2)
    img *= np.clip(vig, 0.25, 1)[..., None]
    img += rng.standard_normal((H, W, 1)).astype(np.float32) * 0.012   # light film grain
    return np.clip(img, 0, 1)


def render(W, H, out):
    rng = np.random.default_rng(SEED)
    img, floor_y = container(W, H)
    place_blocks(img, floor_y, rng)
    img = grade(img, rng)
    bgr = (img[..., ::-1] * 255).astype(np.uint8)
    path = os.path.join(ROOT, 'public', 'images', out)
    cv2.imwrite(path, bgr, [cv2.IMWRITE_WEBP_QUALITY, 70])
    print('saved', path, os.path.getsize(path) // 1024, 'KB')


if __name__ == '__main__':
    render(1800, 1100, 'hero-ice.webp')
    render(900, 1500, 'hero-ice-mobile.webp')
