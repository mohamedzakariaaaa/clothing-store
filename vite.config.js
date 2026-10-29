import { defineConfig } from 'vite';

export default defineConfig({
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
