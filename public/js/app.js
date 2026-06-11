// ============================================================
// SymptoScan App.js (PRODUCTION RUNTIME COMPATIBLE)
// ============================================================

const API_URL = window.API_URL || "http://127.0.0.1:8000";
const SUPABASE_URL = window.SUPABASE_URL || "https://uygmvinepffbxfpblvra.supabase.co";
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || "sb_publishable_q07H8qPV14nMqIFoS8qvkg_JqBqtzGv";

// ------------------------------
// Supabase Initialization
// ------------------------------
const supabase = (() => {
  if (typeof createClient !== "undefined") {
    return createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  if (window.supabase && typeof window.supabase.createClient === "function") {
    return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  console.error("Supabase client not found. Check the script include for @supabase/supabase-js.");
  return null;
})();

window.authMode = window.authMode || "signin";

let currentSession = null;
let currentUser = null;
let historyCache = [];

// Combobox Dropdown Core State
let selectedSymptoms = [];
let allSymptomsVocab = []; 
let currentDropdownIndex = -1;

// ============================================================
// DEFENSIVE DATA TYPE PARSING ENGINE
// ============================================================

/**
 * Safely parses confidence values coming from either the ML API or the Postgres database.
 * Detects numeric(5,4) fractions (e.g., 0.8540) and translates them seamlessly into UI display percentages (85.40%).
 */
function parseConfidence(val) {
  if (val === undefined || val === null || val === "") return 70.00;
  
  // If it's already a string with a percent sign, strip it and parse it
  if (typeof val === "string" && val.includes("%")) {
    let p = parseFloat(val.replace(/%/g, "").trim());
    return isNaN(p) ? 70.00 : p;
  }

  let parsed = parseFloat(val);
  if (isNaN(parsed) || !isFinite(parsed)) return 70.00;

  // If the database returns the raw decimal value from the numeric(5,4) column (e.g. 0.8542)
  if (parsed > 0 && parsed <= 1.0) {
    return parsed * 100;
  }

  return parsed;
}

// ============================================================
// AUTHENTICATION MATRIX CONTROL SEQUENCE
// ============================================================

window.onAuthChange = async (sessionPayload) => {
  const session = sessionPayload?.data?.session || sessionPayload || null;
  currentSession = session;
  currentUser = session?.user || null;
  
  if (currentUser) {
    console.log("🔐 Authenticated context established for user:", currentUser.id);
    await syncBackendProfile();
    await loadHistory();
  } else {
    console.log("🔓 Session cleared. Resetting database application states.");
    historyCache = [];
    const box = document.getElementById("hist-list");
    if (box) box.innerHTML = `<p class="text-slate-400">Please sign in to view your saved history.</p>`;
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
      toast("Signed in successfully");
    }

    if (event === "SIGNED_OUT") {
      go("landing");
    }
  });

  supabase.auth.getSession().then(({ data }) => {
    if (data?.session && window.onAuthChange) window.onAuthChange(data.session);
  });
}

function getHeaders() {
  return currentSession?.access_token
    ? { 
        "Authorization": `Bearer ${currentSession.access_token}`,
        "Content-Type": "application/json"
      }
    : { "Content-Type": "application/json" };
}

async function syncBackendProfile() {
  if (!currentSession?.access_token) return;
  try {
    const res = await fetch(`${API_URL}/api/user/profile`, { headers: getHeaders() });
    if (res.ok) {
      const liveProfile = await res.json();
      currentUser.enrichedMetadata = {
        fullName: liveProfile.full_name,
        avatarUrl: liveProfile.avatar_url
      };
    }
  } catch (err) {
    console.debug("Backend profile sync pending setup or optional:", err);
  } finally {
    updateAuthUI(currentUser);
  }
}

// ============================================================
// ROUTING & NAVIGATION
// ============================================================

const VIEWS = ["landing", "dashboard", "result", "analytics", "history", "profile"];

window.go = function (view) {
  VIEWS.forEach(v => {
    const el = document.getElementById(`view-${v}`);
    if (el) el.classList.add("hidden");
  });

  const target = document.getElementById(`view-${view}`);
  if (target) target.classList.remove("hidden");

  window.scrollTo({ top: 0, behavior: "smooth" });

  if (view === "history") loadHistory();
  if (view === "analytics") loadAnalytics();
  if (view === "profile") renderProfile();
};

// ============================================================
// PROFILE & AVATAR COMPILATION LAYERS
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
    element.style.backgroundSize = "cover";
    element.style.backgroundPosition = "center";
  } else {
    element.style.backgroundImage = "";
    const nameData = user?.enrichedMetadata?.fullName || user?.user_metadata?.full_name;
    const initials = nameData
      ? nameData
          .split(" ")
          .map(w => w[0])
          .join("")
          .slice(0, 2)
          .toUpperCase()
      : user?.email?.split("@")[0]?.slice(0, 2).toUpperCase() || "--";
    element.textContent = initials;
  }
}

function updateAuthUI(user) {
  const navUser = document.getElementById("nav-user");
  const btnSignin = document.getElementById("btn-signin");
  const nameNav = document.getElementById("user-name-nav");
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
// INTERACTION INTERFACE WINDOW COUPLINGS
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
  const nameField = document.getElementById("name-field");
  const authBtn = document.getElementById("auth-btn");
  const authSwitchLbl = document.getElementById("auth-switch-lbl");
  const authSwitchBtn = document.getElementById("auth-switch-btn");

  window.authMode = window.authMode === "signup" ? "signin" : "signup";

  if (nameField) nameField.classList.toggle("hidden", window.authMode === "signin");
  if (authBtn) authBtn.textContent = window.authMode === "signin" ? "Sign In" : "Sign Up";
  if (authSwitchLbl) {
    authSwitchLbl.textContent = window.authMode === "signin" ? "Don't have an account?" : "Already have an account?";
  }
  if (authSwitchBtn) {
    authSwitchBtn.textContent = window.authMode === "signin" ? "Sign up free" : "Sign in";
  }
};

window.toggleDd = function () {
  const dd = document.getElementById("dd-menu");
  if (dd) dd.classList.toggle("hidden");
};

window.closeDd = function () {
  const dd = document.getElementById("dd-menu");
  if (dd) dd.classList.add("hidden");
};

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
    showAuthError("Supabase client is not available. Confirm the SDK is loaded.");
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
      toast("Signed in successfully");
    }
  } catch (err) {
    showAuthError(err.message || "OAuth redirect processing failed");
  }
}

// ============================================================
// SYSTEM SECURITY SIGN-IN ACTIONS
// ============================================================

window.emailAuth = async function () {
  if (!ensureSupabaseConfigured()) return;

  const email = document.getElementById("auth-email")?.value?.trim();
  const pass = document.getElementById("auth-pass")?.value;
  const name = document.getElementById("auth-name")?.value?.trim();

  clearAuthError();
  if (!email || !pass) {
    showAuthError("Email and password required");
    return;
  }

  const mode = window.authMode || "signin";
  try {
    if (mode === "signup") {
      const { data, error } = await supabase.auth.signUp({
        email,
        password: pass,
        options: { data: { full_name: name || "" } }
      });
      if (error) throw error;
      showAuthError("Check your email to confirm your account");
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password: pass });
      if (error) throw error;
      if (data?.session && window.onAuthChange) await window.onAuthChange(data.session);
      closeAuth();
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
    options: { redirectTo }
  });
  if (error) showAuthError(error.message);
};

window.signOut = async function () {
  if (supabase) await supabase.auth.signOut();
  currentUser = null;
  currentSession = null;
  if (window.onAuthChange) window.onAuthChange(null);
  updateAuthUI(null);
  go("landing");
};

// ============================================================
// COMBOBOX AUTOCOMPLETE DICTIONARY CORE
// ============================================================

async function initSymptomAutocomplete() {
  const input = document.getElementById("symptom-search-input");
  const dropdown = document.getElementById("symptom-dropdown");
  if (!input || !dropdown) return;

  const fallbackVocab = ["fever", "cough", "headache", "fatigue", "sore_throat", "chills", "nausea"];

  try {
    const res = await fetch(`${API_URL}/api/symptoms`);
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.symptoms)) {
        allSymptomsVocab = data.symptoms;
      } else if (Array.isArray(data)) {
        allSymptomsVocab = data;
      } else {
        allSymptomsVocab = fallbackVocab;
      }
    } else {
      allSymptomsVocab = fallbackVocab;
    }
  } catch (e) {
    allSymptomsVocab = fallbackVocab;
  }

  input.addEventListener("input", (e) => renderSymptomDropdown(e.target.value.trim().toLowerCase()));
  input.addEventListener("focus", (e) => renderSymptomDropdown(e.target.value.trim().toLowerCase()));

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

  const matches = allSymptomsVocab.filter(item => {
    return String(item).toLowerCase().replace(/_/g, " ").includes(query.replace(/_/g, " "));
  }).slice(0, 10);

  if (matches.length === 0) {
    dropdown.innerHTML = `<div class="symptom-dropdown-empty">No matching clinical entries found</div>`;
    dropdown.classList.remove("hidden");
    return;
  }

  matches.forEach(item => {
    const btn = document.createElement("button");
    btn.type = "button";
    const isAlreadySelected = selectedSymptoms.includes(item);
    
    btn.className = "symptom-dropdown-item" + (isAlreadySelected ? " selected-item" : "");
    btn.textContent = String(item).replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

    if (!isAlreadySelected) {
      btn.onclick = () => selectSymptom(item);
    }
    dropdown.appendChild(btn);
  });

  dropdown.classList.remove("hidden");
}

function highlightDropdownItem(items) {
  items.forEach((item, idx) => {
    if (idx === currentDropdownIndex) {
      item.classList.add("focused");
      item.scrollIntoView({ block: "nearest" });
    } else {
      item.classList.remove("focused");
    }
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
  if (input) {
    input.value = "";
    input.focus();
  }
  hideSymptomDropdown();
}

window.deselectSymptom = function(symptom) {
  selectedSymptoms = selectedSymptoms.filter(s => s !== symptom);
  renderChips();
};

function renderChips() {
  const container = document.getElementById("selected-tags-container");
  if (!container) return;
  container.innerHTML = "";

  selectedSymptoms.forEach(s => {
    const chip = document.createElement("div");
    chip.className = "symptom-chip";
    chip.innerHTML = `
      <span>${s.replace(/_/g, " ")}</span>
      <button type="button" class="symptom-chip-close" onclick="deselectSymptom('${s}')">&times;</button>
    `;
    container.appendChild(chip);
  });
}

// ============================================================
// DIAGNOSTIC CORE COMPUTATION ROUTINES
// ============================================================

window.analyzeSymptoms = async function () {
  if (selectedSymptoms.length === 0) {
    toast("Please select at least one symptom from the search bar");
    return;
  }

  try {
    const res = await fetch(`${API_URL}/api/predict`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify({ symptoms: selectedSymptoms })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.detail || "Prediction inference rejected.");

    // Clean out array tokens immediately before shifting context windows
    selectedSymptoms = [];
    renderChips();

    renderResult(data);
    go("result");
    toast("Analysis complete");

    if (currentSession?.access_token) {
      await loadHistory();
    }
  } catch (err) {
    toast(err.message || "Error processing diagnostic inference");
  }
};

function renderResult(data) {
  const disease = document.getElementById("result-disease");
  const conf = document.getElementById("result-conf");
  const fill = document.getElementById("conf-fill");
  const desc = document.getElementById("result-desc");
  const syms = document.getElementById("result-syms");
  const prec = document.getElementById("result-prec");
  const date = document.getElementById("result-date");

  // Parse using cross-compatible logic
  const rawScore = data.confidence;
  const cleanScore = parseConfidence(rawScore);
  const confidence = Math.min(100, Math.max(0, cleanScore));

  if (disease) disease.textContent = data.disease || data.prediction || "Unknown Condition";
  if (conf) conf.textContent = confidence.toFixed(2) + "%";
  if (fill) fill.style.width = confidence + "%";
  if (desc) desc.textContent = data.description || "No description provided.";
  if (syms) {
    const symptomList = data.symptoms || data.symptoms_provided || [];
    syms.textContent = symptomList.map(s => String(s).replace(/_/g, " ")).join(", ");
  }
  if (date) date.textContent = new Date().toLocaleString();

  if (prec) {
    prec.innerHTML = "";
    const precArray = Array.isArray(data.precautions) 
      ? data.precautions 
      : (typeof data.precautions === "string" ? data.precautions.split(",") : []);

    precArray.forEach(p => {
      if (p && String(p).trim()) {
        const li = document.createElement("li");
        li.textContent = String(p).trim();
        prec.appendChild(li);
      }
    });
  }
}

// ============================================================
// SYSTEM RECORD DATABASE TRANSACTIONS
// ============================================================

async function loadHistory() {
  const box = document.getElementById("hist-list");
  if (!box) return;

  if (!currentSession?.access_token) {
    box.innerHTML = `
      <div class="hist-empty panel panel-soft">
        <p>Please sign in to view your saved history.</p>
        <button class="btn btn-primary btn-sm" onclick="openAuth()">Sign in</button>
      </div>`;
    return;
  }

  try {
    const res = await fetch(`${API_URL}/api/history`, { headers: getHeaders() });
    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw new Error(error.detail || "Failed to load history payload matrix.");
    }

    const data = await res.json();
    historyCache = data.history || [];

    if (!historyCache.length) {
      box.innerHTML = `<p class="text-slate-400 p-4 text-center">No diagnostic history profiles recorded yet.</p>`;
      return;
    }

    box.innerHTML = historyCache
      .map((h, idx) => {
        let symptomsArray = [];
        if (Array.isArray(h.symptoms_provided)) symptomsArray = h.symptoms_provided;
        else if (Array.isArray(h.symptoms)) symptomsArray = h.symptoms;
        else if (typeof h.symptoms_provided === "string") symptomsArray = h.symptoms_provided.split(",");
        else if (typeof h.symptoms === "string") symptomsArray = h.symptoms.split(",");

        const symptomsText = symptomsArray.map(s => String(s).trim().replace(/_/g, ' ')).filter(Boolean).join(", ") || "No symptoms recorded";
        
        let precautionsArray = [];
        if (Array.isArray(h.precautions)) precautionsArray = h.precautions;
        else if (typeof h.precautions === "string") precautionsArray = h.precautions.split(",");
        
        const precautionsHtml = precautionsArray.map(p => `<li>${String(p).trim()}</li>`).join("");
        
        const cleanScore = parseConfidence(h.confidence);
        const confidenceDisplay = cleanScore.toFixed(2);
        const diseaseName = h.prediction || h.disease || "Unknown Profile";

        return `
          <div class="hist-item" data-idx="${idx}">
            <div class="hist-header" onclick="toggleHistItem(${idx})">
              <div class="hist-main">
                <div class="hist-disease">${diseaseName}</div>
                <div class="hist-symptoms-preview">${symptomsText}</div>
              </div>
              <div class="hist-side">
                <span class="hist-date">${new Date(h.analyzed_at || h.created_at || Date.now()).toLocaleString()}</span>
                <span class="hist-conf">${confidenceDisplay}%</span>
                <button class="hist-delete-btn" onclick="deleteHistItem(${idx}, event)" aria-label="Delete Entry">
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
                  <strong>Condition Analysis Summary</strong>
                  <p class="hist-description-detailed mt-1 text-slate-300">${h.description || "No deep condition clinical description saved."}</p>
                </div>
                <div class="hist-block">
                  <strong>Symptoms Evaluated</strong>
                  <p class="hist-symptoms-detailed mt-1 text-teal-400">${symptomsText}</p>
                </div>
                <div class="hist-block">
                  <strong>Recommended Precautions</strong>
                  <ul class="hist-precautions-list mt-1 list-disc pl-4 text-slate-300">${precautionsHtml || `<li>No medical steps recorded</li>`}</ul>
                </div>
              </div>
            </div>
          </div>`;
      })
      .join("");
  } catch (e) {
    box.innerHTML = `<p class="text-red-400 p-4">${e.message || "Failed to load dynamic history pipeline."}</p>`;
  }
}

// ============================================================
// PERFORMANCE METRIC ANALYTICS WINDOWS
// ============================================================

async function loadAnalytics() {
  if (!currentSession?.access_token) {
    if (document.getElementById("an-total")) document.getElementById("an-total").textContent = "0";
    if (document.getElementById("an-risk")) document.getElementById("an-risk").textContent = "0";
    if (document.getElementById("an-conf")) document.getElementById("an-conf").textContent = "—";
    const container = document.getElementById("an-list");
    if (container) container.innerHTML = `<div class="panel panel-soft"><p>Sign in to view analytics.</p></div>`;
    return;
  }

  try {
    const res = await fetch(`${API_URL}/api/history`, { headers: getHeaders() });
    if (!res.ok) throw new Error();

    const data = await res.json();
    const h = data.history || [];

    const total = document.getElementById("an-total");
    const risk = document.getElementById("an-risk");
    const avg = document.getElementById("an-conf");

    if (total) total.textContent = h.length;
    if (risk) risk.textContent = h.filter(x => parseConfidence(x.confidence) >= 85.00).length;

    const avgVal = h.reduce((sum, row) => sum + parseConfidence(row.confidence), 0) / (h.length || 1);
    if (avg) avg.textContent = h.length ? avgVal.toFixed(2) + "%" : "0.00%";
  } catch(err) {
    console.error("Analytics rendering engine aborted:", err);
  }
}

function renderProfile() {
  if (!currentUser) return;

  const name = currentUser.enrichedMetadata?.fullName || currentUser.user_metadata?.full_name || currentUser.email?.split("@")[0] || "User";
  const avatarContainer = document.getElementById("prof-av");

  if (document.getElementById("prof-name")) document.getElementById("prof-name").textContent = name;
  if (document.getElementById("prof-email")) document.getElementById("prof-email").textContent = currentUser.email;
  if (document.getElementById("prof-total")) document.getElementById("prof-total").textContent = historyCache.length;

  if (avatarContainer) renderUserAvatar(avatarContainer, currentUser);
}

// ============================================================
// UTILITY ANIMATION WINDOW SLICING TRANSITIONS
// ============================================================

function toggleHistItem(idx) {
  const item = document.querySelector(`[data-idx="${idx}"]`);
  if (!item) return;

  const details = item.querySelector(".hist-details");
  const toggle = item.querySelector(".hist-toggle");

  if (details) {
    const isHidden = details.classList.contains("hidden");
    details.classList.toggle("hidden", !isHidden);
    if (toggle) {
      toggle.setAttribute("aria-label", isHidden ? "Collapse" : "Expand");
      toggle.innerHTML = isHidden ? `<i class="ti ti-chevron-up"></i>` : `<i class="ti ti-chevron-down"></i>`;
    }
  }
}

function toast(msg) {
  const wrap = document.getElementById("toasts");
  if (!wrap) return;

  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;

  wrap.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ============================================================
// HISTORY TRANSACTION RECORD PURGES
// ============================================================

window.deleteHistItem = async function (idx, event) {
  if (event) event.stopPropagation();

  const item = historyCache[idx];
  if (!item) return;

  if (!confirm("Are you sure you want to permanently delete this diagnostic record?")) return;

  try {
    const res = await fetch(`${API_URL}/api/history/${item.id}`, {
      method: "DELETE",
      headers: getHeaders()
    });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.detail || "Backend refused structural entry deletion row.");
    }

    toast("Record deleted successfully!");
    await loadHistory();

    const analyticsView = document.getElementById("view-analytics");
    if (analyticsView && !analyticsView.classList.contains("hidden")) {
      loadAnalytics();
    }
  } catch (err) {
    console.error("Deletion query fault trace:", err);
    alert("Deletion Failed: " + err.message);
  }
};

// ============================================================
// SYSTEM INIT INITIALIZATION LIFECYCLES
// ============================================================

window.addEventListener("hashchange", () => {
  if (supabase) processOAuthRedirect();
});

document.addEventListener("DOMContentLoaded", async () => {
  if (supabase) {
    await processOAuthRedirect();

    const sessionResult = await supabase.auth.getSession();
    if (sessionResult?.data?.session && window.onAuthChange) {
      await window.onAuthChange(sessionResult.data.session);
    }
  }

  initSymptomAutocomplete();
  go("landing");
});