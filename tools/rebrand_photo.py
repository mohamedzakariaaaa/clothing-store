"""Replace white printed labels on dark bags/packaging with another word.

Usage:  python tools/rebrand_photo.py photos/hero-bags.jpg public/images/hero-bags.webp "SeefStore."
Finds white text sitting on dark surfaces, paints it out, and writes the new word in the same
place, size, angle and brightness. White clothes and colourful prints are skipped.
"""
import sys

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

FONT = 'C:/Windows/Fonts/arialbd.ttf'


def text_mask(img):
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    ink = ((hsv[..., 2] > 150) & (hsv[..., 1] < 32)).astype(np.uint8) * 255
    # Remove big light areas (clothing, shadows included) plus a margin, so their edges don't join labels
    light = ((hsv[..., 2] > 110) & (hsv[..., 1] < 45)).astype(np.uint8) * 255
    light = cv2.morphologyEx(light, cv2.MORPH_OPEN, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))  # drop thin letter strokes
    n, lab, st, _ = cv2.connectedComponentsWithStats(light)
    clothing = np.zeros_like(ink)
    for i in range(1, n):
        if st[i, cv2.CC_STAT_AREA] > 2500:
            clothing[lab == i] = 255
    ink[cv2.dilate(clothing, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))) > 0] = 0
    return ink, hsv[..., 2]


def letter_height(comp, ink):
    """Cap height of the letters inside a word: robust even when two labels are stuck together."""
    n, lab, st, _ = cv2.connectedComponentsWithStats(comp & (ink > 0))
    sizes = []
    for i in range(1, n):
        if st[i, cv2.CC_STAT_AREA] >= 6:
            pts = cv2.findNonZero((lab == i).astype(np.uint8))
            sizes.append(max(cv2.minAreaRect(pts)[1]))
    return float(np.percentile(sizes, 80)) if sizes else 0.0   # tall letters (T, k), not x-height


def keep_letters_on_line(comp, ink):
    """Drop stray bright bits (fabric edges, folds) that sit off the word's baseline."""
    n, lab, st, cen = cv2.connectedComponentsWithStats(comp & (ink > 0))
    if n <= 3:
        return comp
    idx = [i for i in range(1, n) if st[i, cv2.CC_STAT_AREA] >= 6]
    if len(idx) < 3:
        return comp
    centers = cen[idx].astype(np.float32)
    vx, vy, x0, y0 = cv2.fitLine(centers, cv2.DIST_HUBER, 0, 0.01, 0.01).ravel()
    dist = np.abs((centers[:, 0] - x0) * vy - (centers[:, 1] - y0) * vx)
    lh = letter_height(comp, ink)
    keep = np.zeros_like(comp)
    for i, d in zip(idx, dist):
        if d < 0.6 * lh:
            keep[lab == i] = 1
    return cv2.dilate(keep, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))) & comp


def word_box(comp, ink):
    """Rotated box around a word's letters, long side first: ((cx, cy), (w, h), angle, comp)."""
    pts = cv2.findNonZero(comp & (ink > 0))
    if pts is None or len(pts) < 20:
        return None
    (cx, cy), (w, h), ang = cv2.minAreaRect(pts)
    if w < h:
        w, h, ang = h, w, ang + 90
    return (cx, cy), (w, h), ang, comp


def find_words(ink, value):
    """Group letters into words; keep groups that are elongated and surrounded by dark plastic."""
    words = cv2.dilate(ink, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))
    n, lab, st, _ = cv2.connectedComponentsWithStats(words)
    H, W = ink.shape
    found = []
    for i in range(1, n):
        x, y, bw, bh, area = st[i]
        if area < 40:
            continue
        at_edge = x <= 1 or y <= 1 or x + bw >= W - 1 or y + bh >= H - 1   # label cut off by the photo edge
        comp = (lab == i).astype(np.uint8)
        ring = cv2.dilate(comp, np.ones((9, 9), np.uint8)) - comp
        if np.median(value[ring > 0]) > 90:      # not on a dark bag (e.g. camo trousers)
            continue
        min_ratio = 1.0 if at_edge else 1.8   # below this it's a blob, not a word
        box = word_box(comp, ink)
        if box and box[1][0] / max(box[1][1], 1) < min_ratio:
            box = word_box(keep_letters_on_line(comp, ink), ink)   # stray bits made it look square
        if not box or box[1][0] / max(box[1][1], 1) < min_ratio:
            continue
        (cx, cy), (w, h), ang, letters = box
        # Labels stuck together end to end: split by how many words of this letter size fit
        lh = letter_height(letters, ink) or h
        h = min(h, lh * 1.15)
        parts = max(1, round(w / (lh * 4.6)))
        d = np.array([np.cos(np.radians(ang)), np.sin(np.radians(ang))])
        for k in range(parts):
            off = (k - (parts - 1) / 2) * w / parts
            # comp (not the filtered letters) is what gets erased, so no old letters survive
            found.append(((cx + d[0] * off, cy + d[1] * off), (w / parts, h), ang, comp))
    return found


def render_word(word, height_px):
    font = ImageFont.truetype(FONT, size=max(8, int(height_px * 1.38)))   # cap height ≈ 0.72 em
    l, t, r, b = font.getbbox(word)
    im = Image.new('L', (r - l + 4, b - t + 4), 0)
    ImageDraw.Draw(im).text((2 - l, 2 - t), word, fill=255, font=font)
    return np.array(im, np.float32) / 255


def main(src, dst, word):
    img = cv2.imread(src)
    ink, value = text_mask(img)
    words = find_words(ink, value)

    # 1) Paint the old labels out
    erase = np.zeros(ink.shape, np.uint8)
    for *_, comp in words:
        erase |= comp & (ink > 0)
    erase = cv2.dilate(erase.astype(np.uint8) * 255, np.ones((5, 5), np.uint8))
    out = cv2.inpaint(img, erase, 5, cv2.INPAINT_TELEA).astype(np.float32)

    # 2) Write the new word, matched to each label
    H, W = ink.shape
    for (cx, cy), (w, h), ang, comp in words:
        tone = np.median(img[(comp > 0) & (ink > 0)], axis=0)
        glyph = render_word(word, h)
        s = min(1.0, (w * 1.05) / glyph.shape[1])
        glyph = cv2.resize(glyph, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
        # Keep text reading upright: its "up" should point up (or left, for vertical labels)
        up = np.array([np.sin(np.radians(ang)), -np.cos(np.radians(ang))])
        if up[1] > 0.3 or (abs(up[1]) <= 0.3 and up[0] > 0):
            ang += 180
        gh, gw = glyph.shape
        size = int(np.hypot(gw, gh)) + 4
        canvas = np.zeros((size, size), np.float32)
        canvas[(size - gh) // 2:(size - gh) // 2 + gh, (size - gw) // 2:(size - gw) // 2 + gw] = glyph
        rot = cv2.getRotationMatrix2D((size / 2, size / 2), -ang, 1.0)
        canvas = cv2.warpAffine(canvas, rot, (size, size), flags=cv2.INTER_LINEAR)
        canvas = cv2.GaussianBlur(canvas, (0, 0), 0.6)

        x0, y0 = int(cx - size / 2), int(cy - size / 2)
        xs, ys = max(0, -x0), max(0, -y0)
        xe, ye = min(size, W - x0), min(size, H - y0)
        if xe <= xs or ye <= ys:
            continue
        a = canvas[ys:ye, xs:xe, None]
        region = out[y0 + ys:y0 + ye, x0 + xs:x0 + xe]
        out[y0 + ys:y0 + ye, x0 + xs:x0 + xe] = region * (1 - a) + tone * a

    out = np.clip(out, 0, 255).astype(np.uint8)
    cv2.imwrite(dst, out, [cv2.IMWRITE_WEBP_QUALITY, 72] if dst.endswith('.webp') else [])
    print(f'replaced {len(words)} labels ->', dst)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else 'SeefStore.')
