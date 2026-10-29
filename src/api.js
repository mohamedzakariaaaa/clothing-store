// Read products straight from Supabase's REST API. A plain fetch keeps the store pages light;
// the full Supabase library is only loaded by the dashboard.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './supabase.js';

export const toProduct = (r) => ({
  id: r.id, name: r.name, price: r.price, category: r.category, sizes: r.sizes, colors: r.colors,
  description: r.description, inStock: r.in_stock, images: r.images,
});

async function get(query) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/products?${query}`, { headers: { apikey: SUPABASE_ANON_KEY } });
  if (!res.ok) throw new Error(`Products request failed: ${res.status}`);
  return (await res.json()).map(toProduct);
}

export const fetchProducts = () => get('select=*&order=created_at.desc');

export const fetchProduct = async (id) => (await get(`select=*&id=eq.${Number(id)}`))[0] ?? null;

export const fetchProductsByIds = (ids) =>
  ids.length ? get(`select=*&id=in.(${ids.map(Number).join(',')})`) : Promise.resolve([]);
