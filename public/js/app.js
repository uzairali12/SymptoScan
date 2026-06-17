// ============================================================
// SymptoScan App.js — v3.0 Production Runtime
// All original function names, IDs, and logic preserved.
// Enhancements: typed toasts, loading veil, scroll reveal,
//               stat counters, richer interaction feedback.
// ============================================================

const getApiUrl = () => {
  if (window.API_URL) return window.API_URL;
  return "http://127.0.0.1:8000";
};

const API_URL        = getApiUrl();
const SUPABASE_URL   = window.SUPABASE_URL   || "https://uygmvinepffbxfpblvra.supabase.co";
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || "sb_publishable_q07H8qPV14nMqIFoS8qvkg_JqBqtzGv";

// ── Supabase Init ────────────────────────────────────────────
const supabase = (() => {
  if (typeof createClient !== "undefined") {
    return createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  if (window.supabase && typeof window.supabase.createClient === "function") {
    return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  console.error("Supabase client not found. Check the script include.");
  return null;
})();

window.authMode = window.authMode || "signin";

let currentSession = null;
let currentUser    = null;
let historyCache   = [];

// Combobox state
let selectedSymptoms     = [];
let allSymptomsVocab     = [];
let currentDropdownIndex = -1;


// ============================================================
// DEFENSIVE CONFIDENCE PARSING
// Handles fraction 0–1 from DB numeric(5,4) or percent string
// ============================================================
function parseConfidence(val) {
  if (val === undefined || val === null || val === "") return 70.00;

  if (typeof val === "string" && val.includes("%")) {
    const p = parseFloat(val.replace(/%/g, "").trim());
    return isNaN(p) ? 70.00 : p;
  }

  const parsed = parseFloat(val);
  if (isNaN(parsed) || !isFinite(parsed)) return 70.00;

  // DB returns decimal fraction (numeric 5,4) → convert to %
  if (parsed > 0 && parsed <= 1.0) return parsed * 100;
  return parsed;
}


// ============================================================
// ── TOAST SYSTEM ─────────────────────────────────────────────
// Supports types: 'ok' | 'err' | 'warn' | 'info'
// Backward-compatible: toast("msg") defaults to 'ok'
// ============================================================
const TOAST_ICONS = {
  ok:   "ti-check-circle",
  err:  "ti-circle-x",
  warn: "ti-alert-triangle",
  info: "ti-info-circle",
};

function toast(msg, type = "ok") {
  const wrap = document.getElementById("toasts");
  if (!wrap) return;

  const icon = TOAST_ICONS[type] || TOAST_ICONS.ok;
  const el   = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.innerHTML = `<i class="ti ${icon}"></i><span>${msg}</span>`;
  wrap.appendChild(el);

  // Auto-dismiss
  setTimeout(() => {
    el.style.animation = "fadeOut .3s ease forwards";
    setTimeout(() => el.remove(), 320);
  }, 3200);
}


// ============================================================
// ── LOADING VEIL ─────────────────────────────────────────────
// Full-screen scanner overlay during async operations
// ============================================================
function showVeil(label = "ANALYZING SYMPTOMS…") {
  if (document.getElementById("loading-veil")) return;

  const veil = document.createElement("div");
  veil.id = "loading-veil";
  veil.className = "loading-veil";
  veil.innerHTML = `
    <div class="veil-scanner">
      <div class="veil-ring vr1"></div>
      <div class="veil-ring vr2"></div>
      <div class="veil-arm-wrap"><div class="veil-arm"></div></div>
      <div class="veil-core"><i class="ti ti-brain"></i></div>
    </div>
    <p class="loading-text">${label}</p>`;
  document.body.appendChild(veil);
}

function hideVeil() {
  const veil = document.getElementById("loading-veil");
  if (!veil) return;
  veil.style.animation = "fadeOut .3s ease forwards";
  setTimeout(() => veil.remove(), 340);
}


// ============================================================
// ── SCROLL-REVEAL OBSERVER ───────────────────────────────────
// Elements with class 'reveal' animate in when they enter view.
// Called once on DOMContentLoaded.
// ============================================================
function initScrollReveal() {
  const style = document.createElement("style");
  style.textContent = `
    .reveal {
      opacity: 0;
      transform: translateY(22px);
      transition: opacity .55s cubic-bezier(.16,1,.3,1), transform .55s cubic-bezier(.16,1,.3,1);
    }
    .reveal.revealed {
      opacity: 1;
      transform: translateY(0);
    }
  `;
  document.head.appendChild(style);

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("revealed");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.08 }
  );

  document.querySelectorAll(".reveal").forEach((el) => observer.observe(el));
}


// ============================================================
// ── NUMBER COUNTER ANIMATION ─────────────────────────────────
// Animates a numeric element from 0 → target over duration ms
// ============================================================
function animateCounter(el, target, duration = 1400, suffix = "") {
  if (!el || isNaN(target)) return;
  const start    = performance.now();
  const startVal = 0;

  const tick = (now) => {
    const elapsed  = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased    = 1 - Math.pow(1 - progress, 3); // ease-out cubic
    el.textContent = Math.round(startVal + (target - startVal) * eased) + suffix;
    if (progress < 1) requestAnimationFrame(tick);
  };

  requestAnimationFrame(tick);
}


// ============================================================
// AUTH STATE MANAGEMENT
// ============================================================
window.onAuthChange = async (sessionPayload) => {
  const session    = sessionPayload?.data?.session || sessionPayload || null;
  currentSession   = session;
  currentUser      = session?.user || null;

  if (currentUser) {
    console.log("🔐 Authenticated:", currentUser.id);
    await syncBackendProfile();
    await loadHistory();
  } else {
    console.log("🔓 Session cleared.");
    historyCache = [];
    const box = document.getElementById("hist-list");
    if (box) box.innerHTML = `<p style="color:var(--muted);padding:16px">Please sign in to view your saved history.</p>`;
    updateAuthUI(null);
  }
};

if (supabase && supabase.auth) {
  supabase.auth.onAuthStateChange((event, sessionPayload) => {
    const session = sessionPayload?.data?.session || sessionPayload;
    if (window.onAuthChange) window.onAuthChange(session);

    if (event === "SIGNED_IN" && session) {
      closeAuth();
      go("dashboard");
      toast("Signed in successfully", "ok");
    }
    if (event === "SIGNED_OUT") go("landing");
  });

  supabase.auth.getSession().then(({ data }) => {
    if (data?.session && window.onAuthChange) window.onAuthChange(data.session);
  });
}

function getHeaders() {
  return currentSession?.access_token
    ? { Authorization: `Bearer ${currentSession.access_token}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };
}

async function syncBackendProfile() {
  if (!currentSession?.access_token) return;
  try {
    const res = await fetch(`${API_URL}/api/user/profile`, { headers: getHeaders() });
    if (res.ok) {
      const liveProfile = await res.json();
      currentUser.enrichedMetadata = {
        fullName:  liveProfile.full_name,
        avatarUrl: liveProfile.avatar_url,
      };
    }
  } catch (err) {
    console.debug("Backend profile sync pending:", err);
  } finally {
    updateAuthUI(currentUser);
  }
}


// ============================================================
// ROUTING & NAVIGATION
// ============================================================
const VIEWS = ["landing", "dashboard", "result", "analytics", "history", "profile"];

window.go = function (view) {
  VIEWS.forEach((v) => {
    const el = document.getElementById(`view-${v}`);
    if (el) el.classList.add("hidden");
  });

  const target = document.getElementById(`view-${view}`);
  if (target) {
    target.classList.remove("hidden");
    // Re-run scroll reveal on newly visible elements
    target.querySelectorAll(".reveal:not(.revealed)").forEach((el) => el.classList.add("revealed"));
  }

  window.scrollTo({ top: 0, behavior: "smooth" });

  if (view === "history")   loadHistory();
  if (view === "analytics") loadAnalytics();
  if (view === "profile")   renderProfile();
};


// ============================================================
// AVATAR & PROFILE COMPILATION
// ============================================================
function getAvatarUrl(user) {
  return (
    user?.enrichedMetadata?.avatarUrl ||
    user?.user_metadata?.avatar_url ||
    user?.user_metadata?.picture ||
    user?.identities?.[0]?.identity_data?.avatar_url ||
    null
  );
}

function renderUserAvatar(element, user) {
  if (!element) return;
  const avatarUrl = getAvatarUrl(user);
  if (avatarUrl) {
    element.textContent = "";
    element.style.backgroundImage = `url(${avatarUrl})`;
    element.style.backgroundSize  = "cover";
    element.style.backgroundPosition = "center";
  } else {
    element.style.backgroundImage = "";
    const nameData = user?.enrichedMetadata?.fullName || user?.user_metadata?.full_name;
    const initials = nameData
      ? nameData.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
      : user?.email?.split("@")[0]?.slice(0, 2).toUpperCase() || "--";
    element.textContent = initials;
  }
}

function updateAuthUI(user) {
  const navUser  = document.getElementById("nav-user");
  const btnSignin = document.getElementById("btn-signin");
  const nameNav  = document.getElementById("user-name-nav");
  const initials = document.getElementById("user-initials");

  if (!navUser || !btnSignin) return;

  if (user) {
    navUser.classList.remove("hidden");
    btnSignin.classList.add("hidden");
    const name = user.enrichedMetadata?.fullName || user.user_metadata?.full_name || user.email?.split("@")[0] || "User";
    if (nameNav) nameNav.textContent = name.split(" ")[0];
    if (initials) renderUserAvatar(initials, user);
  } else {
    navUser.classList.add("hidden");
    btnSignin.classList.remove("hidden");
  }
}


// ============================================================
// MODAL INTERFACE CONTROLS
// ============================================================
window.openAuth = function () {
  document.getElementById("modal-auth")?.classList.remove("hidden");
};

window.closeAuth = function () {
  document.getElementById("modal-auth")?.classList.add("hidden");
  clearAuthError();
};

window.handleOverlay = function (e) {
  if (e.target.id === "modal-auth") closeAuth();
};

window.toggleMode = function () {
  const nameField    = document.getElementById("name-field");
  const authBtn      = document.getElementById("auth-btn");
  const authSwitchLbl = document.getElementById("auth-switch-lbl");
  const authSwitchBtn = document.getElementById("auth-switch-btn");
  const authTitle    = document.getElementById("auth-title");

  window.authMode = window.authMode === "signup" ? "signin" : "signup";
  const isSignup  = window.authMode === "signup";

  if (nameField)    nameField.classList.toggle("hidden", !isSignup);
  if (authBtn)      authBtn.textContent = isSignup ? "Create Account" : "Sign In";
  if (authTitle)    authTitle.textContent = isSignup ? "Sign up" : "Sign in";
  if (authSwitchLbl) authSwitchLbl.textContent = isSignup ? "Already have an account?" : "Don't have an account?";
  if (authSwitchBtn) authSwitchBtn.textContent  = isSignup ? "Sign in" : "Sign up free";
};

window.toggleDd = function () {
  document.getElementById("dd-menu")?.classList.toggle("hidden");
};

window.closeDd = function () {
  document.getElementById("dd-menu")?.classList.add("hidden");
};

// Close dropdown when clicking outside
document.addEventListener("click", (e) => {
  const chip = document.getElementById("user-chip");
  const dd   = document.getElementById("dd-menu");
  if (dd && chip && !chip.contains(e.target) && !dd.contains(e.target)) {
    dd.classList.add("hidden");
  }
});

function showAuthError(msg) {
  const el = document.getElementById("auth-err");
  if (!el) return;
  el.textContent = msg;
  el.classList.remove("hidden");
}

function clearAuthError() {
  const el = document.getElementById("auth-err");
  if (!el) return;
  el.classList.add("hidden");
  el.textContent = "";
}

function ensureSupabaseConfigured() {
  if (!supabase) {
    showAuthError("Supabase client not available. Confirm the SDK is loaded.");
    return false;
  }
  return true;
}

async function processOAuthRedirect() {
  if (!supabase || !window.location.hash) return;
  const hash = window.location.hash;
  if (!hash.includes("access_token") && !hash.includes("refresh_token") && !hash.includes("error")) return;

  try {
    const sessionResult = await supabase.auth.getSession();
    const session = sessionResult?.data?.session;
    if (session) {
      window.history.replaceState({}, document.title, window.location.pathname);
      if (window.onAuthChange) await window.onAuthChange(session);
      closeAuth();
      go("dashboard");
      toast("Signed in successfully", "ok");
    }
  } catch (err) {
    showAuthError(err.message || "OAuth redirect processing failed");
  }
}


// ============================================================
// EMAIL & SOCIAL AUTHENTICATION
// ============================================================
window.emailAuth = async function () {
  if (!ensureSupabaseConfigured()) return;

  const email = document.getElementById("auth-email")?.value?.trim();
  const pass  = document.getElementById("auth-pass")?.value;
  const name  = document.getElementById("auth-name")?.value?.trim();

  clearAuthError();
  if (!email || !pass) {
    showAuthError("Email and password are required.");
    return;
  }

  const mode = window.authMode || "signin";

  try {
    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({
        email,
        password: pass,
        options: {
          data:            { full_name: name || "" },
          emailRedirectTo: `${window.location.origin}/`,
        },
      });
      if (error) throw error;
      showAuthError("✓ Check your email to confirm your account.");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
      if (error) throw error;
    }
  } catch (err) {
    showAuthError(err.message);
  }
};

window.socialAuth = async function (provider) {
  if (!ensureSupabaseConfigured()) return;
  const providerMap = { google: "google", github: "github", microsoft: "azure" };
  const supabaseProvider = providerMap[provider] || provider;
  const redirectTo = `${window.location.origin}${window.location.pathname}`;

  const { error } = await supabase.auth.signInWithOAuth({
    provider: supabaseProvider,
    options:  { redirectTo },
  });
  if (error) showAuthError(error.message);
};

window.signOut = async function () {
  if (supabase) await supabase.auth.signOut();
  currentUser = null;
  currentSession = null;
  if (window.onAuthChange) window.onAuthChange(null);
  updateAuthUI(null);
  toast("Signed out successfully.", "info");
  go("landing");
};


// ============================================================
// COMBOBOX AUTOCOMPLETE — SYMPTOM SELECTOR
// ============================================================
async function initSymptomAutocomplete() {
  const input    = document.getElementById("symptom-search-input");
  const dropdown = document.getElementById("symptom-dropdown");
  if (!input || !dropdown) return;

  const fallbackVocab = ["fever", "cough", "headache", "fatigue", "sore_throat", "chills", "nausea"];

  try {
    const res = await fetch(`${API_URL}/api/symptoms`);
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.symptoms)) allSymptomsVocab = data.symptoms;
      else if (Array.isArray(data))              allSymptomsVocab = data;
      else                                       allSymptomsVocab = fallbackVocab;
    } else {
      allSymptomsVocab = fallbackVocab;
    }
  } catch {
    allSymptomsVocab = fallbackVocab;
  }

  input.addEventListener("input", (e) =>
    renderSymptomDropdown(e.target.value.trim().toLowerCase())
  );
  input.addEventListener("focus", (e) =>
    renderSymptomDropdown(e.target.value.trim().toLowerCase())
  );

  document.addEventListener("click", (e) => {
    if (!input.contains(e.target) && !dropdown.contains(e.target)) {
      hideSymptomDropdown();
    }
  });

  input.addEventListener("keydown", (e) => {
    const items = dropdown.querySelectorAll(".symptom-dropdown-item:not(.selected-item)");
    if (!items.length) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      currentDropdownIndex = (currentDropdownIndex + 1) % items.length;
      highlightDropdownItem(items);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      currentDropdownIndex = (currentDropdownIndex - 1 + items.length) % items.length;
      highlightDropdownItem(items);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (currentDropdownIndex >= 0 && items[currentDropdownIndex]) {
        items[currentDropdownIndex].click();
      }
    } else if (e.key === "Escape") {
      hideSymptomDropdown();
      input.blur();
    }
  });
}

function renderSymptomDropdown(query) {
  const dropdown = document.getElementById("symptom-dropdown");
  if (!dropdown) return;

  dropdown.innerHTML = "";
  currentDropdownIndex = -1;

  const matches = allSymptomsVocab
    .filter((item) =>
      String(item).toLowerCase().replace(/_/g, " ").includes(query.replace(/_/g, " "))
    )
    .slice(0, 10);

  if (matches.length === 0) {
    dropdown.innerHTML = `<div class="symptom-dropdown-empty">No matching clinical entries found</div>`;
    dropdown.classList.remove("hidden");
    return;
  }

  matches.forEach((item) => {
    const btn             = document.createElement("button");
    btn.type              = "button";
    const isAlreadySelected = selectedSymptoms.includes(item);
    btn.className         = "symptom-dropdown-item" + (isAlreadySelected ? " selected-item" : "");
    btn.textContent       = String(item).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

    if (!isAlreadySelected) btn.onclick = () => selectSymptom(item);
    dropdown.appendChild(btn);
  });

  dropdown.classList.remove("hidden");
}

function highlightDropdownItem(items) {
  items.forEach((item, idx) => {
    item.classList.toggle("focused", idx === currentDropdownIndex);
    if (idx === currentDropdownIndex) item.scrollIntoView({ block: "nearest" });
  });
}

function hideSymptomDropdown() {
  const dropdown = document.getElementById("symptom-dropdown");
  if (dropdown) dropdown.classList.add("hidden");
  currentDropdownIndex = -1;
}

function selectSymptom(symptom) {
  if (!selectedSymptoms.includes(symptom)) {
    selectedSymptoms.push(symptom);
    renderChips();
  }
  const input = document.getElementById("symptom-search-input");
  if (input) { input.value = ""; input.focus(); }
  hideSymptomDropdown();
}

window.deselectSymptom = function (symptom) {
  selectedSymptoms = selectedSymptoms.filter((s) => s !== symptom);
  renderChips();
};

function renderChips() {
  const container = document.getElementById("selected-tags-container");
  if (!container) return;
  container.innerHTML = "";

  selectedSymptoms.forEach((s) => {
    const chip = document.createElement("div");
    chip.className = "symptom-chip";
    chip.innerHTML = `
      <span>${s.replace(/_/g, " ")}</span>
      <button type="button" class="symptom-chip-close" onclick="deselectSymptom('${s}')" aria-label="Remove ${s}">&times;</button>`;
    container.appendChild(chip);
  });
}


// ============================================================
// DIAGNOSTIC CORE — ANALYZE SYMPTOMS
// ============================================================
window.analyzeSymptoms = async function () {
  if (selectedSymptoms.length === 0) {
    toast("Please select at least one symptom from the search bar.", "warn");
    return;
  }

  showVeil("ANALYZING SYMPTOMS…");

  try {
    const res = await fetch(`${API_URL}/api/predict`, {
      method:  "POST",
      headers: getHeaders(),
      body:    JSON.stringify({ symptoms: selectedSymptoms }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Prediction inference rejected.");

    selectedSymptoms = [];
    renderChips();

    renderResult(data);
    hideVeil();
    go("result");
    toast("Analysis complete.", "ok");

    if (currentSession?.access_token) await loadHistory();
  } catch (err) {
    hideVeil();
    toast(err.message || "Error processing diagnostic inference.", "err");
  }
};


// ============================================================
// RESULT RENDER ENGINE
// ============================================================
function renderResult(data) {
  const disease   = document.getElementById("result-disease");
  const conf      = document.getElementById("result-conf");
  const fill      = document.getElementById("conf-fill");
  const desc      = document.getElementById("result-desc");
  const syms      = document.getElementById("result-syms");
  const prec      = document.getElementById("result-prec");
  const date      = document.getElementById("result-date");
  const sevBadge  = document.getElementById("result-sev");
  const top3Grid  = document.getElementById("result-top3-grid");

  const confidence = Math.min(100, Math.max(0, parseConfidence(data.confidence)));

  if (disease) disease.textContent = data.disease || data.prediction || "Unknown Condition";
  if (date)    date.textContent    = new Date().toLocaleString();
  if (desc)    desc.textContent    = data.description || "No description available.";

  // Animated confidence counter
  if (conf) animateCounter(conf, confidence, 1200, "%");

  // Progress bar (CSS transition handles the animation)
  if (fill) {
    fill.style.width = "0%";
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        fill.style.width = confidence + "%";
      });
    });
  }

  // Risk / severity badge
  const risk = data.risk_level ||
    (confidence >= 70 ? "High" : confidence >= 40 ? "Medium" : "Low");

  if (sevBadge) {
    sevBadge.textContent = `${risk} Risk`;
    sevBadge.className   = `sev-badge sev-${risk.toLowerCase()}`;
  }

  // Symptoms list
  if (syms) {
    const arr = data.symptoms || data.symptoms_provided || [];
    syms.textContent = arr.map((s) => String(s).replace(/_/g, " ")).join(", ") || "—";
  }

  // Precautions
  if (prec) {
    prec.innerHTML = "";
    const precArray = Array.isArray(data.precautions)
      ? data.precautions
      : typeof data.precautions === "string"
      ? data.precautions.split(",")
      : [];

    if (precArray.length === 0) {
      const li = document.createElement("li");
      li.className = "prec-item";
      li.textContent = "No precautions data returned.";
      prec.appendChild(li);
    } else {
      precArray.forEach((p) => {
        if (!p || !String(p).trim()) return;
        const li = document.createElement("li");
        li.className = "prec-item";
        li.textContent = String(p).trim();
        prec.appendChild(li);
      });
    }
  }

  // Top-3 differential diagnoses
  if (top3Grid) {
    top3Grid.innerHTML = "";
    const top3 = Array.isArray(data.top3) ? data.top3 : [];

    if (!top3.length) {
      top3Grid.innerHTML = `<p style="color:var(--muted);font-size:.82rem;padding:8px">No differential diagnoses calculated.</p>`;
      return;
    }

    const rankLabel = ["Primary", "Secondary", "Tertiary"];
    const rankClass = ["top3-primary", "top3-secondary", "top3-tertiary"];

    top3.forEach((item, i) => {
      const itemConf = typeof item.probability === "number"
        ? item.probability
        : parseConfidence(item.confidence);
      const itemRisk = item.risk ||
        (itemConf >= 70 ? "High" : itemConf >= 40 ? "Medium" : "Low");
      const itemName  = String(item.disease || "").replace(/_/g, " ");
      const itemDesc  = item.description || "Clinical assessment based on provided symptoms.";
      const itemPrecs = Array.isArray(item.precautions) ? item.precautions : [];

      const card = document.createElement("div");
      card.className = `top3-card ${rankClass[i] || "top3-tertiary"}`;
      card.innerHTML = `
        <div class="top3-header">
          <div class="top3-header-top">
            <span class="top3-rank-badge">${rankLabel[i] || `#${i + 1}`}</span>
            <span class="top3-conf-val">${itemConf.toFixed(2)}%</span>
          </div>
          <div class="top3-disease-name">${itemName}</div>
          <span class="sev-badge sev-${itemRisk.toLowerCase()}">${itemRisk} Risk</span>
        </div>
        <div class="conf-track" style="margin:4px 0 10px">
          <div class="top3-fill-${itemRisk.toLowerCase()}"
            style="height:100%;border-radius:999px;width:0%;transition:width 1s cubic-bezier(.16,1,.3,1)">
          </div>
        </div>
        <div class="top3-body">
          <div class="top3-desc-block">
            <span class="top3-label">Clinical Insight</span>
            <p class="top3-desc-text">${itemDesc}</p>
          </div>
          ${itemPrecs.length ? `
          <div class="top3-prec-block">
            <span class="top3-label">Precautions</span>
            <ul class="top3-prec-list">
              ${itemPrecs.map((p) => `<li>${String(p).trim()}</li>`).join("")}
            </ul>
          </div>` : ""}
        </div>`;

      top3Grid.appendChild(card);

      // Animate individual card fill bars after append
      const fillBar = card.querySelector(`.top3-fill-${itemRisk.toLowerCase()}`);
      if (fillBar) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            fillBar.style.width = itemConf + "%";
          });
        });
      }
    });
  }
}


// ============================================================
// HISTORY — LOAD & RENDER
// ============================================================
async function loadHistory() {
  const box = document.getElementById("hist-list");
  if (!box) return;

  if (!currentSession?.access_token) {
    box.innerHTML = `
      <div class="hist-empty panel panel-soft">
        <div class="hist-empty-icon"><i class="ti ti-history"></i></div>
        <p>Sign in to save and view your diagnostic history.</p>
        <button class="btn btn-primary btn-sm" onclick="openAuth()">Sign in</button>
      </div>`;
    return;
  }

  try {
    const res = await fetch(`${API_URL}/api/history`, { headers: getHeaders() });
    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw new Error(error.detail || "Failed to load history.");
    }

    const data  = await res.json();
    historyCache = data.history || [];

    if (!historyCache.length) {
      box.innerHTML = `
        <div class="hist-empty panel panel-soft">
          <div class="hist-empty-icon"><i class="ti ti-clipboard-list"></i></div>
          <p>No diagnostic records yet. Run your first analysis to get started.</p>
          <button class="btn btn-primary btn-sm" onclick="go('dashboard')">Start Diagnosis</button>
        </div>`;
      return;
    }

    box.innerHTML = historyCache
      .map((h, idx) => {
        // Normalise symptoms
        let symptomsArray = [];
        if (Array.isArray(h.symptoms_provided))       symptomsArray = h.symptoms_provided;
        else if (Array.isArray(h.symptoms))            symptomsArray = h.symptoms;
        else if (typeof h.symptoms_provided === "string") symptomsArray = h.symptoms_provided.split(",");
        else if (typeof h.symptoms === "string")       symptomsArray = h.symptoms.split(",");

        const symptomsText = symptomsArray
          .map((s) => String(s).trim().replace(/_/g, " "))
          .filter(Boolean)
          .join(", ") || "No symptoms recorded";

        // Normalise precautions
        let precautionsArray = [];
        if (Array.isArray(h.precautions))          precautionsArray = h.precautions;
        else if (typeof h.precautions === "string") precautionsArray = h.precautions.split(",");

        const precautionsHtml = precautionsArray
          .map((p) => `<li>${String(p).trim()}</li>`)
          .join("");

        const cleanScore = parseConfidence(h.confidence);
        const confidenceDisplay = cleanScore.toFixed(2);
        const diseaseName = h.prediction || h.disease || "Unknown Profile";
        const histRisk = h.risk_level ||
          (cleanScore >= 70 ? "High" : cleanScore >= 40 ? "Medium" : "Low");

        return `
          <div class="hist-item" data-idx="${idx}">
            <div class="hist-header" onclick="toggleHistItem(${idx})">
              <div class="hist-main">
                <div class="hist-disease">${diseaseName}</div>
                <div class="hist-symptoms-preview">${symptomsText}</div>
              </div>
              <div class="hist-side">
                <span class="hist-date">${new Date(h.analyzed_at || h.created_at || Date.now()).toLocaleString()}</span>
                <span class="sev-badge sev-${histRisk.toLowerCase()}" style="font-size:.62rem">${histRisk}</span>
                <span class="hist-conf">${confidenceDisplay}%</span>
                <button class="hist-delete-btn" onclick="deleteHistItem(${idx}, event)" aria-label="Delete entry">
                  <i class="ti ti-trash"></i>
                </button>
                <button class="hist-toggle" aria-label="Expand">
                  <i class="ti ti-chevron-down"></i>
                </button>
              </div>
            </div>
            <div class="hist-details hidden">
              <div class="hist-content">
                <div class="hist-block">
                  <strong>Symptoms Entered</strong>
                  <p class="hist-symptoms-detailed">${symptomsText}</p>
                </div>
                <div class="hist-block">
                  <strong>Recommended Precautions</strong>
                  <ul class="hist-precautions-list">
                    ${precautionsHtml || "<li>No precautions recorded.</li>"}
                  </ul>
                </div>
              </div>
              ${(() => {
                const tp = Array.isArray(h.top_predictions) && h.top_predictions.length > 0
                  ? h.top_predictions : null;
                if (!tp) return "";
                return `
                  <div class="hist-block" style="margin-top:18px;padding-top:18px;border-top:1px solid var(--b1)">
                    <strong>Differential Diagnoses</strong>
                    <div class="hist-top3-mini">
                      ${tp.map((p, pi) => `
                        <div class="hist-top3-item">
                          <span class="hist-top3-rank">${["1st","2nd","3rd"][pi] || `#${pi+1}`}</span>
                          <span class="hist-top3-disease">${String(p.disease || "").replace(/_/g," ")}</span>
                          <span class="sev-badge sev-${(p.risk||"low").toLowerCase()}" style="font-size:.58rem">${p.risk||"Low"} Risk</span>
                          <span class="hist-top3-conf">${typeof p.probability === "number" ? p.probability.toFixed(1)+"%" : (p.confidence || "—")}</span>
                        </div>`).join("")}
                    </div>
                  </div>`;
              })()}
            </div>
          </div>`;
      })
      .join("");
  } catch (e) {
    box.innerHTML = `
      <div class="hist-empty panel panel-soft">
        <div class="hist-empty-icon"><i class="ti ti-wifi-off"></i></div>
        <p>${e.message || "Failed to load history. Check your connection."}</p>
      </div>`;
  }
}

function toggleHistItem(idx) {
  const item = document.querySelector(`[data-idx="${idx}"]`);
  if (!item) return;
  const details = item.querySelector(".hist-details");
  const toggle  = item.querySelector(".hist-toggle");
  if (!details) return;

  const isHidden = details.classList.contains("hidden");
  details.classList.toggle("hidden", !isHidden);
  if (toggle) {
    toggle.setAttribute("aria-label", isHidden ? "Collapse" : "Expand");
    toggle.innerHTML = isHidden
      ? `<i class="ti ti-chevron-up"></i>`
      : `<i class="ti ti-chevron-down"></i>`;
  }
}

window.deleteHistItem = async function (idx, event) {
  if (event) event.stopPropagation();
  const item = historyCache[idx];
  if (!item) return;

  if (!confirm("Permanently delete this diagnostic record?")) return;

  try {
    const res = await fetch(`${API_URL}/api/history/${item.id}`, {
      method:  "DELETE",
      headers: getHeaders(),
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.detail || "Deletion failed.");
    }

    toast("Record deleted.", "ok");
    await loadHistory();

    const analyticsView = document.getElementById("view-analytics");
    if (analyticsView && !analyticsView.classList.contains("hidden")) loadAnalytics();
  } catch (err) {
    toast("Delete failed: " + err.message, "err");
  }
};


// ============================================================
// ANALYTICS — LOAD & RENDER
// ============================================================
async function loadAnalytics() {
  if (!currentSession?.access_token) {
    ["an-total", "an-risk"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.textContent = "0";
    });
    const avgEl = document.getElementById("an-conf");
    if (avgEl) avgEl.textContent = "—";
    const container = document.getElementById("an-list");
    if (container) container.innerHTML = `
      <div class="panel panel-soft" style="text-align:center;padding:32px">
        <p>Sign in to view your analytics.</p>
        <button class="btn btn-primary btn-sm" onclick="openAuth()" style="margin-top:12px">Sign In</button>
      </div>`;
    return;
  }

  try {
    const res = await fetch(`${API_URL}/api/history`, { headers: getHeaders() });
    if (!res.ok) throw new Error();

    const data = await res.json();
    const h    = data.history || [];

    const totalEl = document.getElementById("an-total");
    const riskEl  = document.getElementById("an-risk");
    const avgEl   = document.getElementById("an-conf");

    const riskCount = h.filter(
      (x) => x.risk_level === "High" || parseConfidence(x.confidence) >= 70
    ).length;

    const avgVal = h.length
      ? h.reduce((sum, row) => sum + parseConfidence(row.confidence), 0) / h.length
      : 0;

    // Animated counters
    if (totalEl) animateCounter(totalEl, h.length, 800);
    if (riskEl)  animateCounter(riskEl, riskCount, 800);
    if (avgEl)   {
      if (h.length) animateCounter(avgEl, Math.round(avgVal * 100) / 100, 900, "%");
      else avgEl.textContent = "0%";
    }

    // Top symptoms tag cloud
    const tagContainer = document.getElementById("an-tags");
    if (tagContainer) {
      const freq = {};
      h.forEach((record) => {
        const arr = Array.isArray(record.symptoms_provided)
          ? record.symptoms_provided
          : typeof record.symptoms_provided === "string"
          ? record.symptoms_provided.split(",")
          : [];
        arr.forEach((s) => {
          const key = String(s).trim().toLowerCase().replace(/_/g, " ");
          if (key) freq[key] = (freq[key] || 0) + 1;
        });
      });

      const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 12);
      if (sorted.length) {
        tagContainer.innerHTML = sorted
          .map(([sym]) => `<span class="tag">${sym}</span>`)
          .join("");
      } else {
        tagContainer.innerHTML = `<span class="tag-empty">No symptom data yet.</span>`;
      }
    }
  } catch (err) {
    console.error("Analytics render error:", err);
  }
}


// ============================================================
// PROFILE RENDER
// ============================================================
function renderProfile() {
  if (!currentUser) return;

  const name = currentUser.enrichedMetadata?.fullName ||
    currentUser.user_metadata?.full_name ||
    currentUser.email?.split("@")[0] || "User";

  const nameEl  = document.getElementById("prof-name");
  const emailEl = document.getElementById("prof-email");
  const totalEl = document.getElementById("prof-total");
  const avatarEl = document.getElementById("prof-av");

  if (nameEl)   nameEl.textContent  = name;
  if (emailEl)  emailEl.textContent = currentUser.email || "—";
  if (totalEl)  totalEl.textContent = historyCache.length;
  if (avatarEl) renderUserAvatar(avatarEl, currentUser);

  // Most common result
  const commonEl = document.getElementById("prof-common");
  if (commonEl && historyCache.length) {
    const freq = {};
    historyCache.forEach((h) => {
      const d = h.prediction || h.disease || "Unknown";
      freq[d] = (freq[d] || 0) + 1;
    });
    const most = Object.entries(freq).sort((a, b) => b[1] - a[1])[0]?.[0] || "N/A";
    commonEl.textContent = most;
  }

  // Avg confidence
  const avgEl = document.getElementById("prof-avg");
  if (avgEl && historyCache.length) {
    const avg = historyCache.reduce((s, r) => s + parseConfidence(r.confidence), 0) / historyCache.length;
    avgEl.textContent = avg.toFixed(2) + "%";
  }
}


// ============================================================
// SYSTEM INIT — DOMContentLoaded
// ============================================================
window.addEventListener("hashchange", () => {
  if (supabase) processOAuthRedirect();
});

document.addEventListener("DOMContentLoaded", async () => {
  // OAuth redirect handling first
  if (supabase) {
    await processOAuthRedirect();
    const sessionResult = await supabase.auth.getSession();
    if (sessionResult?.data?.session && window.onAuthChange) {
      await window.onAuthChange(sessionResult.data.session);
    }
  }

  // Core init
  await initSymptomAutocomplete();
  initScrollReveal();
  go("landing");
});