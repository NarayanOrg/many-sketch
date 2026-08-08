import { createClient } from "@supabase/supabase-js";
const url = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}
// Service-role client — full DB access, bypasses RLS (there is none by design).
// NEVER expose this client or key to the browser. Server-side only.
export const supabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
});
