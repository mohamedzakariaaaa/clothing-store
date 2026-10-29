// Shared by every store page: header, footer, language switch, cart badge, product cards.
import { TEXTS, formatPrice } from './i18n.js';
import { cartCount } from './cart-store.js';

const WHATSAPP_NUMBER = '201018314972';   // the store's WhatsApp, international format, digits only

export const lang = () => (document.documentElement.lang === 'ar' ? 'ar' : 'en');
/** Text in the current language; {name} placeholders are filled from vars */
export const t = (key, vars = {}) =>
  (TEXTS[lang()][key] ?? TEXTS.en[key] ?? key).replace(/\{(\w+)\}/g, (m, name) => vars[name] ?? m);
export const price = (amount) => formatPrice(amount, lang());
export const whatsappLink = (text) => `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;

const HEADER = `
  <a href="/" class="logo"><img src="/images/logo.webp" alt="SeefStore" width="151" height="128" /></a>
  <nav>
    <a href="/shop.html" data-i18n="nav.shop">Shop</a>
    <a href="/#about" class="nav-extra" data-i18n="nav.about">About</a>
    <a href="/#contact" class="nav-extra" data-i18n="nav.contact">Contact</a>
    <a href="/cart.html" class="cart-link" data-i18n-label="nav.cart">
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" d="M6 7h12l-1 13H7L6 7Zm3 0V6a3 3 0 0 1 6 0v1"/></svg>
      <span class="cart-count" id="cart-count" hidden>0</span>
    </a>
    <button class="lang-btn" id="lang-btn" type="button" data-i18n="lang.switch">عربي</button>
  </nav>`;

const FOOTER = `
  <p class="footer-links">
    <a href="/shop.html" data-i18n="nav.shop">Shop</a>
    <a href="/shipping.html" data-i18n="nav.shipping">Shipping &amp; exchanges</a>
    <a href="/#contact" data-i18n="nav.contact">Contact</a>
  </p>
  <p>© <span id="year"></span> SeefStore. <span data-i18n="footer.rights">All rights reserved.</span></p>`;

let options = {};

/** options.title: () => page title; options.onLanguage: re-render page content after a language switch */
export function initSite(opts = {}) {
  options = opts;
  document.getElementById('site-header').innerHTML = HEADER;
  document.getElementById('site-footer').innerHTML = FOOTER;
  document.getElementById('year').textContent = new Date().getFullYear();
  document.getElementById('lang-btn').addEventListener('click', () => setLanguage(lang() === 'ar' ? 'en' : 'ar'));
  window.addEventListener('cart-change', updateCartCount);
  window.addEventListener('storage', updateCartCount);   // cart changed in another tab
  setLanguage(lang());   // the inline script in <head> already picked the language
}

function updateCartCount() {
  const n = cartCount();
  const el = document.getElementById('cart-count');
  el.textContent = n;
  el.hidden = n === 0;
}

export function setLanguage(l) {
  const root = document.documentElement;
  root.lang = l;
  root.dir = l === 'ar' ? 'rtl' : 'ltr';
  document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-label]').forEach((el) => el.setAttribute('aria-label', t(el.dataset.i18nLabel)));
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => { el.placeholder = t(el.dataset.i18nPlaceholder); });
  document.querySelectorAll('[data-price]').forEach((el) => { el.textContent = price(el.dataset.price); });
  document.querySelectorAll('[data-wa]').forEach((el) => { el.href = whatsappLink(t('contact.message')); });

  document.title = options.title ? options.title() : t('meta.title');
  document.querySelector('meta[name=description]').content = t('meta.description');
  const btn = document.getElementById('lang-btn');
  btn.lang = l === 'ar' ? 'en' : 'ar';            // the button is written in the other language
  btn.setAttribute('aria-label', t('lang.switchLabel'));

  try { localStorage.setItem('lang', l); } catch {}
  updateCartCount();
  options.onLanguage?.();
}

export function productCard(p) {
  const a = document.createElement('a');
  a.className = 'card' + (p.inStock ? '' : ' sold-out');
  a.href = `/product.html?id=${p.id}`;
  a.innerHTML = `
    <div class="card-media"><img alt="" width="600" height="600" loading="lazy" /></div>
    <div class="card-body"><h3></h3><p class="price"></p></div>`;
  // Names and photo URLs come from the database: set as text / attributes, never as HTML
  a.querySelector('img').src = p.images[0] || '';
  a.querySelector('img').alt = p.name;
  a.querySelector('h3').textContent = p.name;
  a.querySelector('.price').textContent = price(p.price);
  if (!p.inStock) {
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = t('products.soldOut');
    a.querySelector('.card-media').append(badge);
  }
  return a;
}

export function message(text, kind = '') {
  const p = document.createElement('p');
  p.className = `state ${kind}`;
  p.textContent = text;
  return p;
}
