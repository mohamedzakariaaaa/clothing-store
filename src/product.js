import './style.css';
import { initSite, message, price, t } from './site.js';
import { fetchProduct } from './api.js';
import { addToCart } from './cart-store.js';
import { FREE_SHIPPING_FROM, EXCHANGE_DAYS } from './policy.js';

// Product page: /product.html?id=12
const id = new URLSearchParams(location.search).get('id');
const root = document.getElementById('product');
let product;            // undefined = loading, null = not found
let failed = false;
let choice = { size: null, color: null, qty: 1, photo: 0 };

function chips(name, values, selected) {
  const wrap = document.createElement('div');
  wrap.className = 'options';
  for (const v of values) {
    const label = document.createElement('label');
    label.className = 'option';
    label.innerHTML = `<input type="radio" name="${name}" /><span></span>`;
    const input = label.querySelector('input');
    input.value = v;
    input.checked = v === selected;
    label.querySelector('span').textContent = v;
    wrap.append(label);
  }
  return wrap;
}

function render() {
  if (failed) return root.replaceChildren(message(t('products.error'), 'error'));
  if (product === undefined) return root.replaceChildren(message(t('products.loading')));
  if (!product) return root.replaceChildren(message(t('product.notFound')));
  const p = product;

  const el = document.createElement('div');
  el.className = 'product';
  el.innerHTML = `
    <div class="gallery">
      <div class="gallery-main" id="gallery-main"></div>
      <div class="gallery-thumbs" id="gallery-thumbs"></div>
    </div>
    <form class="buy" id="buy" novalidate>
      <h1 class="product-name"></h1>
      <p class="product-price"></p>
      <p class="badge-inline" hidden></p>
      <fieldset class="field" data-field="size"><legend></legend></fieldset>
      <fieldset class="field" data-field="color"><legend></legend></fieldset>
      <div class="field">
        <span class="field-label"></span>
        <div class="qty">
          <button type="button" data-step="-1" aria-label="−">−</button>
          <output id="qty">1</output>
          <button type="button" data-step="1" aria-label="+">+</button>
        </div>
      </div>
      <p class="form-error" id="buy-error" role="alert"></p>
      <button class="btn btn-primary btn-block" type="submit"></button>
      <a class="perks" href="/shipping.html"></a>
      <section class="details" hidden><h2></h2><p></p></section>
    </form>`;

  // Photos: swipe on phones, tap a thumbnail anywhere
  const main = el.querySelector('#gallery-main');
  const thumbs = el.querySelector('#gallery-thumbs');
  p.images.forEach((src, i) => {
    const img = document.createElement('img');
    img.src = src; img.alt = p.name; img.width = 600; img.height = 600;
    if (i > 0) img.loading = 'lazy';
    main.append(img);
    if (p.images.length > 1) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'thumb' + (i === choice.photo ? ' active' : '');
      b.innerHTML = '<img alt="" width="80" height="80" />';
      b.querySelector('img').src = src;
      b.addEventListener('click', () => main.scrollTo({ left: i * main.clientWidth * (document.documentElement.dir === 'rtl' ? -1 : 1), behavior: 'smooth' }));
      thumbs.append(b);
    }
  });
  main.addEventListener('scroll', () => {
    choice.photo = Math.round(Math.abs(main.scrollLeft) / main.clientWidth);
    thumbs.querySelectorAll('.thumb').forEach((b, i) => b.classList.toggle('active', i === choice.photo));
  }, { passive: true });

  el.querySelector('.product-name').textContent = p.name;
  el.querySelector('.product-price').textContent = price(p.price);
  el.querySelector('.perks').textContent = t('product.perks', { free: price(FREE_SHIPPING_FROM), days: EXCHANGE_DAYS });

  const sizeField = el.querySelector('[data-field=size]');
  const colorField = el.querySelector('[data-field=color]');
  sizeField.querySelector('legend').textContent = t('product.size');
  colorField.querySelector('legend').textContent = t('product.color');
  if (p.sizes.length) sizeField.append(chips('size', p.sizes, choice.size)); else sizeField.remove();
  if (p.colors.length > 1) colorField.append(chips('color', p.colors, choice.color)); else colorField.remove();
  el.querySelector('.field-label').textContent = t('product.qty');
  el.querySelector('#qty').textContent = choice.qty;

  const submit = el.querySelector('[type=submit]');
  if (p.inStock) submit.textContent = t('product.add');
  else {
    submit.textContent = t('products.soldOut');
    submit.disabled = true;
    const b = el.querySelector('.badge-inline');
    b.hidden = false;
    b.textContent = t('product.soldOutNote');
  }

  if (p.description) {
    const d = el.querySelector('.details');
    d.hidden = false;
    d.querySelector('h2').textContent = t('product.description');
    d.querySelector('p').textContent = p.description;
  }

  // Remember choices so switching language doesn't lose them
  el.querySelectorAll('[name=size]').forEach((r) => r.addEventListener('change', () => { choice.size = r.value; }));
  el.querySelectorAll('[name=color]').forEach((r) => r.addEventListener('change', () => { choice.color = r.value; }));
  el.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => {
    choice.qty = Math.max(1, Math.min(10, choice.qty + Number(b.dataset.step)));
    el.querySelector('#qty').textContent = choice.qty;
  }));

  el.querySelector('#buy').addEventListener('submit', (e) => {
    e.preventDefault();
    const error = el.querySelector('#buy-error');
    if (p.sizes.length && !choice.size) { error.textContent = t('product.pickSize'); return; }
    if (p.colors.length > 1 && !choice.color) { error.textContent = t('product.pickColor'); return; }
    error.textContent = '';
    addToCart({ id: p.id, size: choice.size, color: p.colors.length === 1 ? p.colors[0] : choice.color, qty: choice.qty });
    showToast();
  });

  root.replaceChildren(el);
}

let toastTimer;
function showToast() {
  const toast = document.getElementById('toast');
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 4000);
}

initSite({
  title: () => (product ? `${product.name} — SeefStore` : 'SeefStore'),
  onLanguage: render,
});

if (!id) { product = null; render(); }
else {
  fetchProduct(id)
    .then((p) => { product = p; })
    .catch(() => { failed = true; })
    .finally(() => {
      render();
      document.title = product ? `${product.name} — SeefStore` : 'SeefStore';
    });
}
