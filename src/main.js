import './style.css';
import { initSite, productCard, message, t } from './site.js';
import { fetchProducts } from './api.js';

// Home page: the 4 newest products that are in stock, straight from the dashboard's database
const FEATURED_COUNT = 4;
let products = null;
let failed = false;

function render() {
  const grid = document.getElementById('featured');
  if (failed) grid.replaceChildren(message(t('products.error'), 'error'));
  else if (!products) grid.replaceChildren(message(t('products.loading')));
  else {
    const shown = products.filter((p) => p.inStock).slice(0, FEATURED_COUNT);
    grid.replaceChildren(...(shown.length ? shown.map(productCard) : [message(t('products.empty'))]));
  }
}

initSite({ onLanguage: render });
fetchProducts()
  .then((p) => { products = p; })
  .catch(() => { failed = true; })
  .finally(render);
