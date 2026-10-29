import './admin.css';
import { isConfigured, supabase, PHOTO_BUCKET } from './supabase.js';
import { toProduct } from './api.js';

const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
const CATEGORIES = {
  hoodies: 'هوديز', jackets: 'جواكت', tshirts: 'تيشرتات', pants: 'بناطيل', shorts: 'شورتات', other: 'حاجات تانية',
};
const MAX_PHOTO_PX = 1200;      // photos are shrunk to this before upload: sharp on phones, small files
const PHOTO_QUALITY = 0.82;

// --- Data: Supabase when configured (src/supabase.js), otherwise an in-memory demo
const toRow = (p) => ({
  name: p.name, price: p.price, category: p.category, sizes: p.sizes, colors: p.colors,
  description: p.description, in_stock: p.inStock, images: p.images,
});
// Storage path of a photo we uploaded (null for photos that live elsewhere, e.g. /images/...)
const bucketPath = (url) => url.split(`/storage/v1/object/public/${PHOTO_BUCKET}/`)[1] ?? null;

const supabaseStore = {
  async session() {
    const { data } = await (await supabase()).auth.getSession();
    return Boolean(data.session);
  },
  async login(email, password) {
    const sb = await supabase();
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) return 'الإيميل أو كلمة السر غلط';
    const { data: admin } = await sb.rpc('is_admin');
    if (!admin) {
      await sb.auth.signOut();
      return 'الإيميل ده مش مسموح له يدخل الداشبورد';
    }
    return null;
  },
  async logout() { await (await supabase()).auth.signOut(); },
  async list() {
    const { data, error } = await (await supabase()).from('products').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return data.map(toProduct);
  },
  async uploadPhotos(photos) {
    const sb = await supabase();
    return Promise.all(photos.map(async ({ src, blob }) => {
      if (!blob) return src;
      const path = `${crypto.randomUUID()}.${blob.type === 'image/jpeg' ? 'jpg' : 'webp'}`;
      const { error } = await sb.storage.from(PHOTO_BUCKET).upload(path, blob, { contentType: blob.type, cacheControl: '31536000' });
      if (error) throw error;
      return sb.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
    }));
  },
  async save(p, before) {
    const sb = await supabase();
    const { error } = p.id
      ? await sb.from('products').update(toRow(p)).eq('id', p.id)
      : await sb.from('products').insert(toRow(p));
    if (error) throw error;
    // Photos removed from the product: delete the files too
    const gone = (before?.images ?? []).filter((u) => !p.images.includes(u)).map(bucketPath).filter(Boolean);
    if (gone.length) await sb.storage.from(PHOTO_BUCKET).remove(gone);
  },
  async remove(p) {
    const sb = await supabase();
    const { error } = await sb.from('products').delete().eq('id', p.id);
    if (error) throw error;
    const paths = p.images.map(bucketPath).filter(Boolean);
    if (paths.length) await sb.storage.from(PHOTO_BUCKET).remove(paths);
  },
};

const demoStore = {
  products: [
    { id: 1, name: 'Navy Wave Jacket', price: 1450, category: 'jackets', sizes: ['M', 'L', 'XL'], colors: ['كحلي', 'أبيض'], description: '', inStock: true, images: ['/images/products/navy-jacket.webp'] },
    { id: 2, name: 'Retro Track Jacket', price: 1250, category: 'jackets', sizes: ['S', 'M', 'L'], colors: ['أوف وايت', 'أزرق'], description: '', inStock: true, images: ['/images/products/track-jacket.webp'] },
    { id: 3, name: 'Wave Parachute Pants', price: 1650, category: 'pants', sizes: ['M', 'L'], colors: ['أبيض', 'أزرق'], description: '', inStock: false, images: ['/images/products/wave-pants.webp'] },
    { id: 4, name: 'Court Shorts', price: 520, category: 'shorts', sizes: ['M', 'L', 'XL', 'XXL'], colors: ['زيتي'], description: '', inStock: true, images: ['/images/products/court-shorts.webp'] },
  ],
  nextId: 5,
  async session() { return false; },
  async login() { return null; },
  async logout() {},
  async list() { return [...this.products]; },
  async uploadPhotos(photos) { return photos.map((ph) => ph.src); },
  async save(p) {
    if (p.id) this.products = this.products.map((x) => (x.id === p.id ? p : x));
    else this.products.unshift({ ...p, id: this.nextId++ });
  },
  async remove(p) { this.products = this.products.filter((x) => x.id !== p.id); },
};

const live = isConfigured();
const store = live ? supabaseStore : demoStore;

const $ = (id) => document.getElementById(id);
const price = (n) => `${Number(n).toLocaleString('en-US')} ج.م`;
let products = [];

if (live) {
  $('demo-banner').hidden = true;
  $('login-hint').hidden = true;
}

// --- Login
function showApp() {
  $('login').hidden = true;
  $('app').hidden = false;
  refresh();
}
$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const btn = e.target.querySelector('button');
  btn.disabled = true;
  $('login-error').textContent = '';
  const error = await store.login(f.get('email').trim().toLowerCase(), f.get('password'));
  btn.disabled = false;
  if (error) $('login-error').textContent = error;
  else showApp();
});
$('logout').addEventListener('click', async () => {
  await store.logout();
  $('app').hidden = true;
  $('login').hidden = false;
});
store.session().then((signedIn) => { if (signedIn) showApp(); });

// --- Product list
async function refresh() {
  try {
    products = await store.list();
    render();
  } catch {
    $('products').replaceChildren();
    $('empty').hidden = false;
    $('empty').textContent = 'مقدرتش أجيب المنتجات — اتأكد من النت وجرّب تاني';
  }
}

function render() {
  const q = $('search').value.trim().toLowerCase();
  const shown = products.filter((p) => p.name.toLowerCase().includes(q));
  $('count').textContent = `(${products.length})`;
  $('empty').hidden = products.length > 0;
  $('empty').textContent = 'مفيش منتجات. دوس "منتج جديد" وابدأ.';
  $('products').replaceChildren(...shown.map(card));
}

function card(p) {
  const el = document.createElement('article');
  el.className = 'product' + (p.inStock ? '' : ' out');
  el.innerHTML = `
    <button class="product-open" type="button">
      <img alt="" loading="lazy" width="600" height="600" />
    </button>
    <div class="product-body">
      <h3></h3>
      <p class="meta"><span class="price">${price(p.price)}</span> · ${CATEGORIES[p.category] || ''}</p>
      <p class="meta muted">${p.sizes.join(' · ') || 'مفيش مقاسات'}</p>
      <div class="product-actions">
        <button class="pill ${p.inStock ? 'ok' : 'off'}" type="button" data-stock>${p.inStock ? 'متوفر' : 'خلص'}</button>
        <button class="link" type="button" data-edit>تعديل</button>
      </div>
    </div>`;
  // Product names and photo URLs are data: set them as text/attributes, never as HTML
  el.querySelector('h3').textContent = p.name;
  el.querySelector('img').src = p.images[0] || '';
  el.querySelector('.product-open').setAttribute('aria-label', `تعديل ${p.name}`);
  el.querySelector('.product-open').addEventListener('click', () => openEditor(p));
  el.querySelector('[data-edit]').addEventListener('click', () => openEditor(p));
  el.querySelector('[data-stock]').addEventListener('click', async (e) => {
    e.target.disabled = true;
    try {
      await store.save({ ...p, inStock: !p.inStock }, p);
    } catch {
      alert('مقدرتش أحفظ التغيير — جرّب تاني');
    }
    refresh();
  });
  return el;
}

$('search').addEventListener('input', render);

// --- Editor
const dialog = $('editor');
const form = $('editor-form');
let editing = null;   // product being edited, or null for a new one
let photos = [];      // [{ src, blob? }] — blob is set for new photos not uploaded yet; first = main photo

$('sizes').append(...SIZES.map((s) => {
  const label = document.createElement('label');
  label.className = 'chip';
  label.innerHTML = `<input type="checkbox" name="sizes" value="${s}" /><span>${s}</span>`;
  return label;
}));

$('add').addEventListener('click', () => openEditor(null));
$('close').addEventListener('click', () => dialog.close());

function openEditor(p) {
  editing = p;
  form.reset();
  $('editor-title').textContent = p ? 'تعديل المنتج' : 'منتج جديد';
  $('delete').hidden = !p;
  $('upload-status').textContent = '';
  photos = p ? p.images.map((src) => ({ src })) : [];
  if (p) {
    form.name.value = p.name;
    form.price.value = p.price;
    form.category.value = p.category;
    form.colors.value = p.colors.join('، ');
    form.description.value = p.description;
    form.inStock.checked = p.inStock;
    form.querySelectorAll('[name=sizes]').forEach((c) => { c.checked = p.sizes.includes(c.value); });
  }
  renderThumbs();
  dialog.showModal();
}

function renderThumbs() {
  $('thumbs').replaceChildren(...photos.map((ph, i) => {
    const t = document.createElement('div');
    t.className = 'thumb' + (i === 0 ? ' main' : '');
    t.innerHTML = '<img alt="" /><button type="button" class="thumb-remove" aria-label="مسح الصورة">✕</button>';
    t.querySelector('img').src = ph.src;
    t.querySelector('img').addEventListener('click', () => { photos.unshift(...photos.splice(i, 1)); renderThumbs(); });
    t.querySelector('button').addEventListener('click', () => { photos.splice(i, 1); renderThumbs(); });
    return t;
  }));
}

// Shrink each photo in the browser before it's uploaded (phone photos are often 3–8 MB)
async function shrink(file) {
  const bitmap = await createImageBitmap(file);
  const s = Math.min(1, MAX_PHOTO_PX / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * s);
  canvas.height = Math.round(bitmap.height * s);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', PHOTO_QUALITY));
  // Already small and web-ready? Keep the original rather than re-encoding it bigger
  const webReady = /image\/(webp|jpeg)/.test(file.type);
  return s === 1 && webReady && file.size <= blob.size ? file : blob;
}

$('files').addEventListener('change', async (e) => {
  const files = [...e.target.files];
  e.target.value = '';
  let before = 0, after = 0;
  for (const [i, file] of files.entries()) {
    $('upload-status').textContent = `بجهّز الصورة ${i + 1} من ${files.length}…`;
    const blob = await shrink(file);
    before += file.size; after += blob.size;
    photos.push({ src: URL.createObjectURL(blob), blob });   // uploaded when the product is saved
    renderThumbs();
  }
  const kb = (n) => `${Math.round(n / 1024)} KB`;
  $('upload-status').textContent = after < before * 0.95
    ? `اتضافت ${files.length} صورة — الحجم صغر من ${kb(before)} لـ ${kb(after)}`
    : `اتضافت ${files.length} صورة (${kb(after)})`;
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!photos.length) {
    $('upload-status').textContent = 'لازم صورة واحدة على الأقل';
    return;
  }
  const f = new FormData(form);
  const save = $('save');
  save.disabled = true;
  save.textContent = 'بيحفظ…';
  try {
    const images = await store.uploadPhotos(photos);
    await store.save({
      id: editing?.id,
      name: f.get('name').trim(),
      price: Number(f.get('price')),
      category: f.get('category'),
      sizes: f.getAll('sizes'),
      colors: f.get('colors').split(/[,،]/).map((c) => c.trim()).filter(Boolean),
      description: f.get('description').trim(),
      inStock: form.inStock.checked,
      images,
    }, editing);
    dialog.close();
    refresh();
  } catch {
    $('upload-status').textContent = 'مقدرتش أحفظ — اتأكد من النت وجرّب تاني';
  } finally {
    save.disabled = false;
    save.textContent = 'حفظ';
  }
});

$('delete').addEventListener('click', async () => {
  if (!editing || !confirm(`تمسح "${editing.name}"؟ مش هينفع ترجّعه.`)) return;
  try {
    await store.remove(editing);
    dialog.close();
    refresh();
  } catch {
    alert('مقدرتش أمسح المنتج — جرّب تاني');
  }
});
