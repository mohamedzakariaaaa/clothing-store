// The cart lives in this browser: [{ id, size, color, qty }]. Prices are always re-read from the
// database on the cart page, so a price Seif changes is never stale.
const KEY = 'cart';
const MAX_QTY = 20;

export function cartItems() {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
}

export function setCart(items) {
  try { localStorage.setItem(KEY, JSON.stringify(items)); } catch {}
  window.dispatchEvent(new Event('cart-change'));
}

export function addToCart({ id, size, color, qty }) {
  const items = cartItems();
  const same = items.find((i) => i.id === id && i.size === size && i.color === color);
  if (same) same.qty = Math.min(same.qty + qty, MAX_QTY);
  else items.push({ id, size, color, qty });
  setCart(items);
}

export function setQty(index, qty) {
  const items = cartItems();
  if (!items[index]) return;
  items[index].qty = Math.max(1, Math.min(qty, MAX_QTY));
  setCart(items);
}

export function removeItem(index) {
  const items = cartItems();
  items.splice(index, 1);
  setCart(items);
}

export const clearCart = () => setCart([]);

export const cartCount = () => cartItems().reduce((n, i) => n + i.qty, 0);
