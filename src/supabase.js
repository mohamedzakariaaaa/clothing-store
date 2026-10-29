// Supabase project (Project Settings → API). Both values are public by design: the database rules
// in supabase/setup.sql decide who can change what. Never put the service_role / secret key here.
export const SUPABASE_URL = 'https://jydyqbhyzbauofdllzsl.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_aWRF-3Fhey-73fsOT_h83Q_FuNbpSpB';   // publishable (public) key

export const PHOTO_BUCKET = 'product-images';
export const isConfigured = () => Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

let client;
export async function supabase() {
  if (!client) {
    const { createClient } = await import('@supabase/supabase-js');
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return client;
}
