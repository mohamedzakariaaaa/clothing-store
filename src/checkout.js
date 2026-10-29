import './style.css';
import { initSite, message, price, t, lang, whatsappLink } from './site.js';
import { fetchProductsByIds } from './api.js';
import { cartItems, setCart, setQty, removeItem, clearCart } from './cart-store.js';
import { shippingFor, FREE_SHIPPING_FROM } from './policy.js';

// Cart: lines with fresh prices from the database, then a short form. "Send" opens WhatsApp
// with the whole order written out for Seif.
const GOVERNORATES = [
  ['Cairo', 'القاهرة'], ['Giza', 'الجيزة'], ['Alexandria', 'الإسكندرية'], ['Qalyubia', 'القليوبية'],
  ['Sharqia', 'الشرقية'], ['Dakahlia', 'الدقهلية'], ['Gharbia', 'الغربية'], ['Monufia', 'المنوفية'],
  ['Beheira', 'البحيرة'], ['Kafr El Sheikh', 'كفر الشيخ'], ['Damietta', 'دمياط'], ['Port Said', 'بورسعيد'],
  ['Ismailia', 'الإسماعيلية'], ['Suez', 'السويس'], ['Faiyum', 'الفيوم'], ['Beni Suef', 'بني سويف'],
  ['Minya', 'المنيا'], ['Asyut', 'أسيوط'], ['Sohag', 'سوهاج'], ['Qena', 'قنا'], ['Luxor', 'الأقصر'],
  ['Aswan', 'أسوان'], ['Red Sea', 'البحر الأحمر'], ['New Valley', 'الوادي الجديد'], ['Matrouh', 'مطروح'],
  ['North Sinai', 'شمال سيناء'], ['South Sinai', 'جنوب سيناء'],
];
const EGYPT_MOBILE = /^01[0125][0-9]{8}$/;

const root = document.getElementById('cart');
let byId = null;        // product id -> product, null while loading
let failed = false;
let removedNote = false;
let sentLink = null;    // set after the order was handed to WhatsApp
const draft = {};       // form values, kept across language switches and re-renders

const lines = () => cartItems()
  .map((item, index) => ({ ...item, index, product: byId?.get(item.id) }))
  .filter((l) => l.product);

function lineRow(l) {
  const row = document.createElement('article');
  row.className = 'line';
  row.innerHTML = `
    <a class="line-media"><img alt="" width="96" height="96" /></a>
    <div class="line-info">
      <a class="line-name"></a>
      <p class="line-opts muted"></p>
      <div class="line-actions">
        <div class="qty qty-sm">
          <button type="button" data-step="-1" aria-label="−">−</button>
          <output></output>
          <button type="button" data-step="1" aria-label="+">+</button>
        </div>
        <button type="button" class="link-btn" data-remove></button>
      </div>
    </div>
    <p class="line-price price"></p>`;
  const href = `product.html?id=${l.product.id}`;
  row.querySelector('.line-media').href = href;
  row.querySelector('img').src = l.product.images[0] || '';
  row.querySelector('.line-name').href = href;
  row.querySelector('.line-name').textContent = l.product.name;
  row.querySelector('.line-opts').textContent = [
    l.size && `${t('product.size')}: ${l.size}`,
    l.color && `${t('product.color')}: ${l.color}`,
  ].filter(Boolean).join(' · ');
  row.querySelector('output').textContent = l.qty;
  row.querySelector('.line-price').textContent = price(l.product.price * l.qty);
  row.querySelector('[data-remove]').textContent = t('cart.remove');
  row.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => setQty(l.index, l.qty + Number(b.dataset.step))));
  row.querySelector('[data-remove]').addEventListener('click', () => removeItem(l.index));
  return row;
}

function orderForm(subtotal) {
  const form = document.createElement('form');
  form.className = 'checkout';
  form.noValidate = true;
  form.innerHTML = `
    <h2></h2>
    <label><span data-k="checkout.name"></span><input name="name" autocomplete="name" required maxlength="60" /></label>
    <label><span data-k="checkout.phone"></span><input name="phone" type="tel" inputmode="numeric" autocomplete="tel" required maxlength="11" placeholder="01012345678" dir="ltr" /></label>
    <label><span data-k="checkout.governorate"></span><select name="governorate" required><option value=""></option></select></label>
    <label><span data-k="checkout.address"></span><textarea name="address" rows="2" autocomplete="street-address" required maxlength="200"></textarea></label>
    <label><span data-k="checkout.notes"></span><textarea name="notes" rows="2" maxlength="200"></textarea></label>
    <p class="form-error" role="alert"></p>
    <button class="btn btn-whatsapp btn-block" type="submit"></button>`;
  form.querySelector('h2').textContent = t('checkout.title');
  form.querySelectorAll('[data-k]').forEach((el) => { el.textContent = t(el.dataset.k); });
  const gov = form.querySelector('[name=governorate]');
  gov.options[0].textContent = t('checkout.choose');
  for (const [en, ar] of GOVERNORATES) gov.add(new Option(lang() === 'ar' ? ar : en, en));
  form.querySelector('[type=submit]').textContent = t('checkout.send');

  for (const [k, v] of Object.entries(draft)) if (form.elements[k]) form.elements[k].value = v;
  form.addEventListener('input', (e) => { draft[e.target.name] = e.target.value; });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form));
    f.phone = f.phone.replace(/\D/g, '');
    const error = form.querySelector('.form-error');
    const missing = ['name', 'phone', 'governorate', 'address'].find((k) => !f[k].trim());
    if (missing) { error.textContent = t('checkout.required'); form.elements[missing].focus(); return; }
    if (!EGYPT_MOBILE.test(f.phone)) { error.textContent = t('checkout.phoneError'); form.elements.phone.focus(); return; }
    error.textContent = '';

    const govName = GOVERNORATES.find(([en]) => en === f.governorate)[lang() === 'ar' ? 1 : 0];
    const text = [
      `🛍️ ${t('order.header')}`,
      '',
      ...lines().map((l, i) => [
        `${i + 1}) ${l.product.name}`,
        l.size && `${t('product.size')}: ${l.size}`,
        l.color && `${t('product.color')}: ${l.color}`,
        `× ${l.qty}`,
        price(l.product.price * l.qty),
      ].filter(Boolean).join(' — ')),
      '',
      `${t('cart.subtotal')}: ${price(subtotal)}`,
      `${t('cart.shipping')}: ${shippingFor(subtotal) ? price(shippingFor(subtotal)) : t('cart.free')}`,
      `${t('order.total')}: ${price(subtotal + shippingFor(subtotal))}`,
      t('order.payment'),
      '',
      `${t('checkout.name')}: ${f.name.trim()}`,
      `${t('checkout.phone')}: ${f.phone}`,
      `${t('checkout.governorate')}: ${govName}`,
      `${t('checkout.address')}: ${f.address.trim()}`,
      f.notes.trim() ? `${t('checkout.notes')}: ${f.notes.trim()}` : null,
    ].filter((x) => x !== null).join('\n');

    sentLink = whatsappLink(text);
    window.open(sentLink, '_blank', 'noopener');
    clearCart();
    for (const k of Object.keys(draft)) delete draft[k];
  });
  return form;
}

function render() {
  if (sentLink) {
    const done = document.createElement('div');
    done.className = 'done';
    done.innerHTML = '<h2></h2><p></p><a class="btn btn-whatsapp" target="_blank" rel="noopener"></a><a class="btn btn-outline" href="shop.html"></a>';
    done.querySelector('h2').textContent = t('checkout.doneTitle');
    done.querySelector('p').textContent = t('checkout.doneBody');
    done.querySelector('.btn-whatsapp').href = sentLink;
    done.querySelector('.btn-whatsapp').textContent = t('checkout.reopen');
    done.querySelector('.btn-outline').textContent = t('cart.continue');
    return root.replaceChildren(done);
  }
  if (!cartItems().length) {
    const empty = document.createElement('div');
    empty.className = 'done';
    empty.innerHTML = '<p></p><a class="btn btn-primary" href="shop.html"></a>';
    empty.querySelector('p').textContent = t('cart.empty');
    empty.querySelector('a').textContent = t('cart.continue');
    return root.replaceChildren(empty);
  }
  if (failed) return root.replaceChildren(message(t('products.error'), 'error'));
  if (!byId) return root.replaceChildren(message(t('products.loading')));

  const ls = lines();
  const subtotal = ls.reduce((sum, l) => sum + l.product.price * l.qty, 0);
  const shipping = shippingFor(subtotal);
  const list = document.createElement('div');
  list.className = 'lines';
  if (removedNote) list.append(message(t('checkout.removed'), 'note'));
  list.append(...ls.map(lineRow));

  const summary = document.createElement('div');
  summary.className = 'summary';
  summary.innerHTML = `
    <p class="summary-row"><span data-k="cart.subtotal"></span><span data-v="subtotal"></span></p>
    <p class="summary-row"><span data-k="cart.shipping"></span><span data-v="shipping"></span></p>
    <p class="free-hint small" hidden></p>
    <p class="summary-row summary-total"><span data-k="cart.total"></span><strong class="price" data-v="total"></strong></p>
    <p class="muted small" data-k="cart.terms"></p>
    <a class="small policy-link" href="shipping.html" data-k="cart.policyLink"></a>`;
  summary.querySelectorAll('[data-k]').forEach((el) => { el.textContent = t(el.dataset.k); });
  summary.querySelector('[data-v=subtotal]').textContent = price(subtotal);
  summary.querySelector('[data-v=shipping]').textContent = shipping ? price(shipping) : t('cart.free');
  summary.querySelector('[data-v=total]').textContent = price(subtotal + shipping);
  if (shipping) {
    const hint = summary.querySelector('.free-hint');
    hint.hidden = false;
    hint.textContent = t('cart.freeHint', { amount: price(FREE_SHIPPING_FROM - subtotal) });
  }

  const layout = document.createElement('div');
  layout.className = 'cart-layout';
  const side = document.createElement('div');
  side.className = 'cart-side';
  side.append(summary, orderForm(subtotal));
  layout.append(list, side);
  root.replaceChildren(layout);
}

async function load() {
  try {
    const items = cartItems();
    const products = await fetchProductsByIds([...new Set(items.map((i) => i.id))]);
    byId = new Map(products.filter((p) => p.inStock).map((p) => [p.id, p]));
    // Drop items that were deleted or sold out since they were added
    const kept = items.filter((i) => byId.has(i.id));
    if (kept.length !== items.length) { removedNote = true; setCart(kept); }
  } catch {
    failed = true;
  }
  render();
}

initSite({ title: () => `${t('cart.title')} — SeefStore`, onLanguage: render });
window.addEventListener('cart-change', render);
load();
