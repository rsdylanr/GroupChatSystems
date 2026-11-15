import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://kuuhrbylaaojxepbwccc.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_88vhykUlUeURQLIu_N6o_g_kBDUbEdm';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export { supabase };
