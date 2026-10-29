"""Remove the background from a product photo for the product cards.

Usage:  python tools/cutout.py photos/products/navy-jacket.jpg public/images/products/navy-jacket.webp [ai|color|rect]
        ai (default): rembg AI model (pip install "rembg[cpu]"), best for most photos
        color: learns the background colour from the photo's edges (no AI)
        rect: plain GrabCut (no AI)
Output: square transparent WebP, garment centred, max 600x600.
"""
import os
import sys

import cv2
import numpy as np

SIZE = 600
MARGIN = 0.06   # empty space around the garment, as a fraction of the square


def segment(img):
    """GrabCut seeded with the background colours found along the photo's border."""
    h, w = img.shape[:2]
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB).astype(np.float32)
    b = max(4, int(min(h, w) * 0.03))
    border = np.concatenate([lab[:b].reshape(-1, 3), lab[-b:].reshape(-1, 3),
                             lab[:, :b].reshape(-1, 3), lab[:, -b:].reshape(-1, 3)])
    _, _, centers = cv2.kmeans(border, 4, None, (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 20, 1), 3,
                               cv2.KMEANS_PP_CENTERS)
    dist = np.min(np.linalg.norm(lab[:, :, None, :] - centers[None, None], axis=3), axis=2)

    mask = np.full((h, w), cv2.GC_PR_FGD, np.uint8)
    mask[dist < 14] = cv2.GC_PR_BGD          # looks like the background
    mask[dist > 40] = cv2.GC_FGD             # clearly not the background
    mask[:b], mask[-b:], mask[:, :b], mask[:, -b:] = cv2.GC_BGD, cv2.GC_BGD, cv2.GC_BGD, cv2.GC_BGD
    bgd = np.zeros((1, 65), np.float64); fgd = np.zeros((1, 65), np.float64)
    cv2.grabCut(img, mask, None, bgd, fgd, 8, cv2.GC_INIT_WITH_MASK)
    fg = np.where((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)

    # Keep the main garment, drop specks and thin lines, fill holes inside it
    big = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (25, 25))
    core = cv2.morphologyEx(fg, cv2.MORPH_OPEN, big)
    n, labels, stats, _ = cv2.connectedComponentsWithStats(core)
    if n > 1:
        core = np.where(labels == 1 + stats[1:, cv2.CC_STAT_AREA].argmax(), 255, 0).astype(np.uint8)
    fg &= cv2.dilate(core, big)
    fg = cv2.morphologyEx(fg, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15)))
    cnts, _ = cv2.findContours(fg, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    solid = np.zeros_like(fg)
    cv2.drawContours(solid, [max(cnts, key=cv2.contourArea)], -1, 255, -1)
    return cv2.erode(solid, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3)))


def segment_rect(img):
    """Plain GrabCut started from a rectangle just inside the photo's edges."""
    h, w = img.shape[:2]
    m = int(min(w, h) * 0.05)
    mask = np.zeros((h, w), np.uint8)
    bgd = np.zeros((1, 65), np.float64); fgd = np.zeros((1, 65), np.float64)
    cv2.grabCut(img, mask, (m, m, w - 2 * m, h - 2 * m), bgd, fgd, 8, cv2.GC_INIT_WITH_RECT)
    fg = np.where((mask == 1) | (mask == 3), 255, 0).astype(np.uint8)
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
    fg = cv2.morphologyEx(fg, cv2.MORPH_CLOSE, k, iterations=2)
    fg = cv2.morphologyEx(fg, cv2.MORPH_OPEN, k)
    cnts, _ = cv2.findContours(fg, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    solid = np.zeros_like(fg)
    cv2.drawContours(solid, [max(cnts, key=cv2.contourArea)], -1, 255, -1)
    return cv2.erode(solid, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))


def segment_ai(img):
    """rembg (AI model, downloaded on first use). Returns a soft alpha, main object only."""
    from rembg import new_session, remove
    alpha = remove(img, session=new_session('isnet-general-use'), only_mask=True)
    alpha = np.asarray(alpha, np.uint8)
    n, labels, stats, _ = cv2.connectedComponentsWithStats((alpha > 128).astype(np.uint8))
    if n > 1:   # drop captions, logos and specks that aren't the garment
        keep = 1 + stats[1:, cv2.CC_STAT_AREA].argmax()
        alpha = np.where(cv2.dilate((labels == keep).astype(np.uint8), np.ones((9, 9), np.uint8)) > 0, alpha, 0)
    return alpha.astype(np.uint8)


def main(src, dst, mode='ai'):
    img = cv2.imread(src)
    if mode == 'ai':
        alpha = segment_ai(img)
        mask = np.where(alpha > 128, 255, 0).astype(np.uint8)
    else:
        mask = segment_rect(img) if mode == 'rect' else segment(img)
        alpha = cv2.GaussianBlur(mask, (5, 5), 0)      # soft edge instead of jaggies
    x, y, w, h = cv2.boundingRect(mask)
    rgba = cv2.cvtColor(img, cv2.COLOR_BGR2BGRA)
    rgba[:, :, 3] = alpha
    rgba = rgba[y:y + h, x:x + w]

    inner = int(SIZE * (1 - 2 * MARGIN))
    s = inner / max(w, h)
    rgba = cv2.resize(rgba, (max(1, round(w * s)), max(1, round(h * s))), interpolation=cv2.INTER_AREA)
    out = np.zeros((SIZE, SIZE, 4), np.uint8)
    oy, ox = (SIZE - rgba.shape[0]) // 2, (SIZE - rgba.shape[1]) // 2
    out[oy:oy + rgba.shape[0], ox:ox + rgba.shape[1]] = rgba

    os.makedirs(os.path.dirname(os.path.abspath(dst)), exist_ok=True)
    cv2.imwrite(dst, out, [cv2.IMWRITE_WEBP_QUALITY, 80])
    print('saved', dst, os.path.getsize(dst) // 1024, 'KB')


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else 'ai')
