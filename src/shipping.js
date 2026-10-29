import './style.css';
import { initSite, price, t } from './site.js';
import { SHIPPING_FEE, FREE_SHIPPING_FROM, EXCHANGE_DAYS } from './policy.js';

// Shipping & exchanges page: the texts with numbers come from src/policy.js
function render() {
  document.getElementById('cost-fee').textContent = t('shipping.cost.fee', { fee: price(SHIPPING_FEE) });
  document.getElementById('cost-free').textContent = t('shipping.cost.free', { free: price(FREE_SHIPPING_FROM) });
  document.getElementById('exchange-window').textContent = t('shipping.exchange.body', { days: EXCHANGE_DAYS });
}

initSite({ title: () => `${t('nav.shipping')} — SeefStore`, onLanguage: render });
