import { createRosterHandler } from "./handler.js";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

Deno.serve(createRosterHandler({
  async authorize(password: string, clientIP: string) {
    if (!supabaseUrl || !serviceKey) return { status: 503, message: "Chưa bật lưu trực tuyến." };
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(clientIP));
    const clientKey = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/authorize_roster_editor`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_password: password, p_client_key: clientKey }),
    });
    if (!response.ok) return { status: 503, message: "Chưa lưu được. Thử lại sau." };
    return response.json();
  },
}));
