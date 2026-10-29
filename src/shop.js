import './style.css';
import { initSite, productCard, message, t } from './site.js';
import { fetchProducts } from './api.js';

// Shop: every product, filtered by category and sorted. ?cat=jackets in the link opens a category.
const CATEGORY_ORDER = ['hoodies', 'jackets', 'tshirts', 'pants', 'shorts', 'other'];
const params = new URLSearchParams(location.search);
let category = params.get('cat') || 'all';
let products = null;
let failed = false;

const sortSelect = document.getElementById('sort');

function sorted(list) {
  const s = sortSelect.value;
  const byStock = (a, b) => Number(b.inStock) - Number(a.inStock);   // sold-out items go last
  if (s === 'low') return [...list].sort((a, b) => byStock(a, b) || a.price - b.price);
  if (s === 'high') return [...list].sort((a, b) => byStock(a, b) || b.price - a.price);
  return [...list].sort(byStock);   // already newest first from the database
}

function renderFilters() {
  const present = CATEGORY_ORDER.filter((c) => products?.some((p) => p.category === c));
  const chip = (value, label) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'filter';
    b.textContent = label;
    b.setAttribute('aria-pressed', String(value === category));
    b.addEventListener('click', () => {
      category = value;
      const url = new URL(location.href);
      if (value === 'all') url.searchParams.delete('cat'); else url.searchParams.set('cat', value);
      history.replaceState(null, '', url);
      render();
    });
    return b;
  };
  document.getElementById('filters').replaceChildren(
    chip('all', t('shop.all')),
    ...present.map((c) => chip(c, t(`cat.${c}`))),
  );
}

function render() {
  const grid = document.getElementById('shop-grid');
  if (failed) return grid.replaceChildren(message(t('products.error'), 'error'));
  if (!products) return grid.replaceChildren(message(t('products.loading')));
  renderFilters();
  const shown = sorted(category === 'all' ? products : products.filter((p) => p.category === category));
  grid.replaceChildren(...(shown.length ? shown.map(productCard) : [message(t('products.empty'))]));
}

sortSelect.addEventListener('change', render);
initSite({ title: () => `${t('shop.title')} — SeefStore`, onLanguage: render });
fetchProducts()
  .then((p) => { products = p; })
  .catch(() => { failed = true; })
  .finally(render);
