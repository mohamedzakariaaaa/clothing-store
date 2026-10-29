# SeefStore

Online store for SeefStore — sportswear and casual wear. English and Arabic, built to stay fast on cheap Android phones.

## Pages

| Page | File |
|---|---|
| Home | `index.html` |
| All products | `shop.html` |
| Product | `product.html?id=…` |
| Cart → order on WhatsApp | `cart.html` |
| Shipping & exchanges | `shipping.html` |
| Dashboard (Seif adds / edits products) | `admin.html` |

Products and photos live in [Supabase](https://supabase.com). Database setup: `supabase/setup.sql`.

## Run it

```bash
npm install
npm run dev      # local site at http://localhost:5173
npm run build    # production files in dist/
```

## Where to change things

- Shipping price, free-shipping amount, exchange days: `src/policy.js`
- Texts in English and Arabic: `src/i18n.js`
- WhatsApp number: `src/site.js`
- Supabase project URL and public key: `src/supabase.js`

## Tools (Python, optional)

- `tools/cutout.py` — remove a product photo's background for the product cards
- `tools/rebrand_photo.py` — replace printed labels on bags in a photo
- `tools/ice_scene.py` — the "frozen in ice" hero image (not used at the moment)
