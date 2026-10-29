import { defineConfig } from 'vite';

export default defineConfig({
  // Relative paths, so the same build works at a domain's root (Netlify) and in a
  // sub-folder (GitHub Pages: mohamedzakariaaaa.github.io/clothing-store/)
  base: './',
  build: {
    target: 'es2020',
    rolldownOptions: {
      // Store pages plus Seif's dashboard
      input: {
        main: 'index.html',
        shop: 'shop.html',
        product: 'product.html',
        cart: 'cart.html',
        shipping: 'shipping.html',
        admin: 'admin.html',
      },
    },
  },
});
