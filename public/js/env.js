// ======================================================
// env.js — PUBLIC ENV CONFIG (SAFE FOR VERCEL)
// ======================================================

window.SUPABASE_URL = "https://uygmvinepffbxfpblvra.supabase.co";
window.SUPABASE_ANON_KEY = "sb_publishable_q07H8qPV14nMqIFoS8qvkg_JqBqtzGv";

// Automatically detect if running locally or deployed
if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
    // Local development backend
    window.API_URL = "http://127.0.0.1:8000";
} else {
    // Deployed Hugging Face Space direct API endpoint
    window.API_URL = "https://uzairq2qwq-symptoscan-backend.hf.space";
}