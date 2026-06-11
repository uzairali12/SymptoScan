// ============================================================
// SymptoScan Auth (FULLY ALIGNED WITH HTML)
// ============================================================

const SUPABASE_URL =
  window.SUPABASE_URL ||
  "https://uygmvinepffbxfpblvra.supabase.co";

const SUPABASE_ANON_KEY =
  window.SUPABASE_ANON_KEY || "YOUR_SUPABASE_ANON_KEY";

const _sb = (() => {
  if (typeof createClient !== "undefined") {
    return createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  if (window.supabase && typeof window.supabase.createClient === "function") {
    return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  console.error("Supabase client not found. Ensure the SDK is loaded before auth.js.");
  return null;
})();

let mode = "signin";
let currentUser = null;

// ============================================================
// AUTH STATE
// ============================================================

_sb.auth.onAuthStateChange((event, session) => {
  currentUser = session?.user ?? null;

  if (window.onAuthChange) {
    window.onAuthChange(currentUser);
  }

  updateNavbar(currentUser);

  if (event === "SIGNED_IN") {
    closeAuth();
    go("dashboard");
  }

  if (event === "SIGNED_OUT") {
    go("landing");
  }
});

// ============================================================
// NAVBAR UPDATE (MATCH HTML)
// ============================================================

function updateNavbar(user) {
  const navUser = document.getElementById("nav-user");
  const btnSignin = document.getElementById("btn-signin");
  const navLinks = document.getElementById("nav-links");

  const initials = document.getElementById("user-initials");
  const nameNav = document.getElementById("user-name-nav");

  if (!navUser || !btnSignin) return;

  if (user) {
    navUser.classList.remove("hidden");
    btnSignin.classList.add("hidden");
    navLinks?.classList.remove("hidden");

    const name =
      user.user_metadata?.full_name ||
      user.email?.split("@")[0] ||
      "User";

    nameNav.textContent = name;
    initials.textContent = name.slice(0, 2).toUpperCase();
  } else {
    navUser.classList.add("hidden");
    btnSignin.classList.remove("hidden");
    navLinks?.classList.add("hidden");
  }
}

// ============================================================
// EMAIL AUTH (MATCH HTML IDs)
// ============================================================

async function emailAuth() {
  const email = document.getElementById("auth-email")?.value?.trim();
  const password = document.getElementById("auth-pass")?.value;
  const name = document.getElementById("auth-name")?.value?.trim();

  const err = document.getElementById("auth-err");
  const btn = document.getElementById("auth-btn");

  if (!email || !password) {
    showError("Email and password required");
    return;
  }

  btn.disabled = true;
  btn.textContent = mode === "signin" ? "Signing in..." : "Signing up...";

  let result;

  if (mode === "signin") {
    result = await _sb.auth.signInWithPassword({ email, password });
  } else {
    result = await _sb.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name || "" }
      }
    });
  }

  btn.disabled = false;
  btn.textContent = mode === "signin" ? "Sign In" : "Sign Up";

  if (result.error) {
    showError(result.error.message);
    return;
  }

  if (mode === "signup") {
    showError("Check your email to confirm account", "info");
  }
}

// ============================================================
// SOCIAL LOGIN (MATCH HTML onclick)
// ============================================================

async function socialAuth(provider) {
  const map = {
    google: "google",
    github: "github",
    microsoft: "azure"
  };

  const { error } = await _sb.auth.signInWithOAuth({
    provider: map[provider],
    options: {
      redirectTo: window.location.origin
    }
  });

  if (error) showError(error.message);
}

// ============================================================
// MODE TOGGLE (MATCH HTML)
// ============================================================

function toggleMode() {
  mode = mode === "signin" ? "signup" : "signin";

  const btn = document.getElementById("auth-btn");
  const label = document.getElementById("auth-switch-lbl");
  const switchBtn = document.getElementById("auth-switch-btn");
  const nameField = document.getElementById("name-field");

  btn.textContent = mode === "signin" ? "Sign In" : "Sign Up";

  label.textContent =
    mode === "signin"
      ? "Don't have an account?"
      : "Already have an account?";

  switchBtn.textContent =
    mode === "signin" ? "Sign up free" : "Sign in";

  nameField?.classList.toggle("hidden", mode === "signin");

  hideError();
}

// ============================================================
// AUTH MODAL
// ============================================================

function openAuth() {
  document.getElementById("modal-auth")?.classList.remove("hidden");
}

function closeAuth() {
  document.getElementById("modal-auth")?.classList.add("hidden");
  hideError();
}

function handleOverlay(event) {
  if (event.target.id === "modal-auth") closeAuth();
}

// ============================================================
// ERROR HANDLING
// ============================================================

function showError(msg, type = "error") {
  const el = document.getElementById("auth-err");
  if (!el) return;

  el.textContent = msg;
  el.classList.remove("hidden");

  el.style.background =
    type === "info" ? "rgba(0,200,255,0.1)" : "rgba(255,0,0,0.1)";
}

function hideError() {
  document.getElementById("auth-err")?.classList.add("hidden");
}

// ============================================================
// SIGN OUT
// ============================================================

async function signOut() {
  await _sb.auth.signOut();
  showToast?.("Signed out", "info");
}

// expose
window.openAuth = openAuth;
window.closeAuth = closeAuth;
window.emailAuth = emailAuth;
window.socialAuth = socialAuth;
window.toggleMode = toggleMode;
window.handleOverlay = handleOverlay;
window.signOut = signOut;