import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://piylbcgjwpxjumqjhnyt.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpeWxiY2dqd3B4anVtcWpobnl0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM5NDExNDcsImV4cCI6MjEwOTUxNzE0N30.mlz0jucAAHlrZ0V-DqdpLMWBs9qC4KPGFH7TCkWVJCQ';
const COMPANY_PORTAL_VERSION = 'company-portal v0.5.27';
const MAX_DEBUG_LOGS = 250;

const debugLogs = [];
function companyLog(tag, message) {
  const now = new Date();
  const ts = now.toTimeString().slice(0, 8) + '.' + String(now.getMilliseconds()).padStart(3, '0');
  const line = `[${ts}] [${tag}] ${message}`;
  debugLogs.push(line);
  if (debugLogs.length > MAX_DEBUG_LOGS) debugLogs.shift();
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const state = {
  user: null,
  company: null,
  branches: [],
  orders: [],
  ordersTab: 'active',
  pendingOrderDraft: null,
  filters: {
    search: '',
    branchId: '',
    status: '',
    dateRange: 'all',
  },
  regBranches: [],
  waypoints: [],
  selectedDelivery: { address: '', lat: 0, lng: 0, pickedDisplay: '' },
  newBranchGeo: { address: '', lat: 0, lng: 0, pickedDisplay: '' },
  osrmCache: new Map(),
  osrmInflight: new Map(),
  prevOrdersSnap: new Map(),
  ordersLoadSeq: 0,
  ordersReloadTimer: null,
  lastPollAt: 0,
  realtimeChannel: null,
  refreshTimer: null,
};

// --- DOM Elements ---
const authOverlayEl = document.getElementById('co-auth-overlay');
const btnGoogleLogin = document.getElementById('btn-co-google-login');
const authStatusEl = document.getElementById('co-auth-status');
const shellEl = document.getElementById('co-shell');
const approvalPillEl = document.getElementById('co-approval-pill');
const userLabelEl = document.getElementById('co-user-label');
const btnBranchesTop = document.getElementById('btn-co-branches');
const branchesCountEl = document.getElementById('co-branches-count');
const btnOpenDebug = document.getElementById('btn-co-open-debug');
const btnRefresh = document.getElementById('btn-co-refresh');
const btnLogout = document.getElementById('btn-co-logout');

const onboardingEl = document.getElementById('co-onboarding');
const registerForm = document.getElementById('co-register-form');
const regCompanyNameEl = document.getElementById('reg-company-name');
const regContactNameEl = document.getElementById('reg-contact-name');
const regPhoneEl = document.getElementById('reg-phone');
const regPibEl = document.getElementById('reg-pib');
const regNotesEl = document.getElementById('reg-notes');
const btnRegAddBranch = document.getElementById('btn-reg-add-branch');
const regBranchesListEl = document.getElementById('reg-branches-list');
const regStatusEl = document.getElementById('reg-status');
const btnRegSubmit = document.getElementById('btn-reg-submit');

const pendingBannerEl = document.getElementById('co-pending-banner');
const pendingDescEl = document.getElementById('co-pending-desc');
const pendingBranchesPreviewEl = document.getElementById('co-pending-branches-preview');
const btnPendingEditBranches = document.getElementById('btn-pending-edit-branches');
const btnPendingCheck = document.getElementById('btn-pending-check');

const workspaceEl = document.getElementById('co-workspace');
const orderForm = document.getElementById('co-order-form');
const branchSelectEl = document.getElementById('co-branch-select');
const btnManageBranchesInline = document.getElementById('btn-co-manage-branches-inline');
const selectedBranchInfoEl = document.getElementById('co-selected-branch-info');
const btnAddWaypoint = document.getElementById('btn-co-add-waypoint');
const waypointsContainerEl = document.getElementById('co-waypoints-container');
const deliveryInputEl = document.getElementById('co-delivery-input');
const deliveryCoordHintEl = document.getElementById('co-delivery-coord-hint');
const deliverySuggestionsEl = document.getElementById('co-delivery-suggestions');
const customerPhoneEl = document.getElementById('co-customer-phone');
const goodsCostEl = document.getElementById('co-goods-cost');
const paymentSelectEl = document.getElementById('co-payment-select');
const tariffSelectEl = document.getElementById('co-tariff-select');
const orderNotesEl = document.getElementById('co-order-notes');
const orderFeedbackEl = document.getElementById('co-order-feedback');
const btnSubmitOrder = document.getElementById('btn-co-submit-order');

const tabActiveBtn = document.getElementById('tab-co-active');
const tabHistoryBtn = document.getElementById('tab-co-history');
const activeCountEl = document.getElementById('co-active-count');
const historyCountEl = document.getElementById('co-history-count');
const filterSearchEl = document.getElementById('co-filter-search');
const filterBranchEl = document.getElementById('co-filter-branch');
const filterStatusEl = document.getElementById('co-filter-status');
const filterDateEl = document.getElementById('co-filter-date');
const filterSummaryEl = document.getElementById('co-filter-summary');
const btnFilterReset = document.getElementById('btn-co-filter-reset');
const ordersListEl = document.getElementById('co-orders-list');

const debugModalEl = document.getElementById('co-debug-modal');
const btnCloseDebug = document.getElementById('btn-co-close-debug');
const debugCategoryEl = document.getElementById('co-debug-category');
const debugCommentEl = document.getElementById('co-debug-comment');
const debugIncludeLogsEl = document.getElementById('co-debug-include-logs');
const debugLogCountEl = document.getElementById('co-debug-log-count');
const debugLogPreviewEl = document.getElementById('co-debug-log-preview');
const debugSendStatusEl = document.getElementById('co-debug-send-status');
const btnCopyDebugLog = document.getElementById('btn-co-copy-debug-log');
const btnSendDebugReport = document.getElementById('btn-co-send-debug-report');

const confirmOrderModalEl = document.getElementById('co-confirm-order-modal');
const btnCloseConfirmOrder = document.getElementById('btn-co-close-confirm');
const confirmOrderBodyEl = document.getElementById('co-confirm-order-body');
const confirmOrderStatusEl = document.getElementById('co-confirm-order-status');
const btnConfirmOrderEdit = document.getElementById('btn-co-confirm-edit');
const btnConfirmOrderSend = document.getElementById('btn-co-confirm-send');

const branchesModalEl = document.getElementById('co-branches-modal');
const btnCloseBranchesModal = document.getElementById('btn-close-co-branches');
const branchesModalListEl = document.getElementById('co-branches-list');
const addBranchForm = document.getElementById('co-add-branch-form');
const newBranchNameEl = document.getElementById('new-branch-name');
const newBranchPhoneEl = document.getElementById('new-branch-phone');
const newBranchAddressEl = document.getElementById('new-branch-address');
const newBranchSuggestionsEl = document.getElementById('new-branch-suggestions');
const newBranchDefaultEl = document.getElementById('new-branch-default');
const newBranchFeedbackEl = document.getElementById('new-branch-feedback');
const btnSaveNewBranch = document.getElementById('btn-save-new-branch');

// --- Utilities ---
function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function showFeedback(el, msg, isErr = false) {
  if (!el) return;
  if (!msg) {
    el.className = 'form-feedback hidden';
    el.textContent = '';
    return;
  }
  el.className = `form-feedback ${isErr ? 'err' : 'ok'}`;
  el.textContent = msg;
}

function encodePaymentMeta(pay, timeTariff) {
  return `${pay || 'CASH'}|LEGAL_ENTITY|${timeTariff || 'DAY'}`;
}

function isTransitStop(osmKey, osmValue) {
  const k = String(osmKey || '').toLowerCase();
  const v = String(osmValue || '').toLowerCase();
  return k === 'public_transport' || ['bus_stop', 'tram_stop', 'platform', 'stop_position', 'bus_station', 'station'].includes(v);
}

async function searchNominatim(query) {
  const trimmed = String(query || '').trim();
  if (trimmed.length < 2) return [];
  const qFull = /novi\s*sad/i.test(trimmed) ? `${trimmed}, Serbia` : `${trimmed}, Novi Sad, Serbia`;
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(qFull)}&format=jsonv2&addressdetails=1&limit=5&countrycodes=rs`);
    if (!res.ok) return [];
    const arr = await res.json();
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((it) => !isTransitStop(it.class, it.type))
      .map((it) => {
        const a = it.address || {};
        const road = a.road || a.pedestrian || a.footway || it.name || '';
        const num = a.house_number ? ` ${a.house_number}` : '';
        const city = a.city || a.town || a.village || 'Novi Sad';
        const address = `${road}${num}, ${city}`.trim();
        const poiName = it.name && it.name !== road ? it.name : null;
        const display = [poiName, `${road}${num}`, city].filter(Boolean).join(', ');
        return {
          name: poiName,
          address,
          lat: Number(it.lat || 0),
          lng: Number(it.lon || 0),
          display,
          hasHouseNumber: Boolean(a.house_number),
        };
      })
      .filter((x) => x.address && x.lat && x.lng);
  } catch (_) {
    return [];
  }
}

async function searchAddressNoviSad(query) {
  const q = String(query || '').trim();
  if (q.length < 2) return [];
  const hasDigit = /\d/.test(q);
  const nomPromise = hasDigit ? searchNominatim(q) : Promise.resolve([]);
  const photonPromise = fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(q + ' Novi Sad')}&lat=45.255&lon=19.845&limit=8`)
    .then((res) => res.json())
    .then((json) => (json.features || [])
      .filter((f) => {
        const p = f.properties || {};
        return !isTransitStop(p.osm_key, p.osm_value);
      })
      .map((f) => {
        const p = f.properties || {};
        const street = p.street || p.name || '';
        const num = p.housenumber ? ` ${p.housenumber}` : '';
        const city = p.city || 'Novi Sad';
        const label = [p.name && p.name !== street ? p.name : null, `${street}${num}`, city].filter(Boolean).join(', ');
        return {
          name: p.name && p.name !== street ? p.name : null,
          address: `${street}${num}, ${city}`.trim(),
          lat: f.geometry.coordinates[1],
          lng: f.geometry.coordinates[0],
          display: label,
          hasHouseNumber: Boolean(p.housenumber),
        };
      }))
    .catch(() => []);

  const [nomRaw, photonMatches] = await Promise.all([nomPromise, photonPromise]);
  const nomMatches = [...nomRaw].sort((a, b) => Number(Boolean(b.hasHouseNumber)) - Number(Boolean(a.hasHouseNumber)));
  const seen = new Set();
  const merged = [];
  for (const item of [...nomMatches, ...photonMatches]) {
    const key = String(item.address || '').trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
    if (merged.length >= 8) break;
  }
  return merged;
}

async function resolveFallbackGeocode(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return { name: null, address: '', lat: 0, lng: 0 };
  if (/\d/.test(trimmed)) {
    const nom = await searchNominatim(trimmed);
    const exact = nom.find((x) => x.hasHouseNumber) || nom[0];
    if (exact) return exact;
  }
  const matches = await searchAddressNoviSad(trimmed);
  return matches[0] || { name: null, address: trimmed, lat: 0, lng: 0 };
}

function wireAutocomplete(inputEl, listEl, onPick) {
  let timer = null;
  let searchSeq = 0;
  let currentItems = [];
  let activeIndex = -1;

  const updateActiveHighlight = () => {
    if (!listEl) return;
    const els = listEl.querySelectorAll('.suggestion-item');
    els.forEach((el, i) => el.classList.toggle('active', i === activeIndex));
    if (activeIndex >= 0 && els[activeIndex]) {
      els[activeIndex].scrollIntoView({ block: 'nearest' });
    }
  };

  const closeList = () => {
    clearTimeout(timer);
    searchSeq++;
    currentItems = [];
    activeIndex = -1;
    listEl?.classList.add('hidden');
  };

  inputEl?.addEventListener('input', () => {
    clearTimeout(timer);
    const seq = ++searchSeq;
    timer = setTimeout(async () => {
      const items = await searchAddressNoviSad(inputEl.value);
      if (seq !== searchSeq || document.activeElement !== inputEl) {
        closeList();
        return;
      }
      if (!listEl) return;
      listEl.innerHTML = '';
      currentItems = items;
      activeIndex = -1;
      if (!items.length) {
        listEl.classList.add('hidden');
        return;
      }
      items.forEach((item, idx) => {
        const div = document.createElement('div');
        div.className = 'suggestion-item';
        div.textContent = item.display;
        div.addEventListener('mouseenter', () => {
          activeIndex = idx;
          updateActiveHighlight();
        });
        div.addEventListener('mousedown', (e) => {
          e.preventDefault();
          onPick(item);
          closeList();
        });
        listEl.appendChild(div);
      });
      listEl.classList.remove('hidden');
    }, 240);
  });

  inputEl?.addEventListener('blur', () => {
    clearTimeout(timer);
    searchSeq++;
    setTimeout(() => closeList(), 160);
  });

  inputEl?.addEventListener('keydown', (e) => {
    const isOpen = listEl && !listEl.classList.contains('hidden') && currentItems.length > 0;
    if (e.key === 'Escape') {
      closeList();
      return;
    }
    if (!isOpen) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeIndex = (activeIndex + 1) % currentItems.length;
      updateActiveHighlight();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeIndex = activeIndex <= 0 ? currentItems.length - 1 : activeIndex - 1;
      updateActiveHighlight();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const picked = currentItems[activeIndex >= 0 ? activeIndex : 0];
      if (picked) {
        onPick(picked);
        e._autocompletePicked = true;
      }
      closeList();
    }
  });
}

// --- OSRM & ETA Helpers ---
function vehicleEtaFactor(vehicleType) {
  switch ((vehicleType || 'CAR').toUpperCase()) {
    case 'BIKE':
    case 'BICYCLE':
      return 2.15;
    case 'MOTORCYCLE':
    case 'SCOOTER':
      return 1.08;
    case 'WALKING':
    case 'FOOT':
      return 4.5;
    default:
      return 1.35;
  }
}

function haversineMeters(a, b) {
  const R = 6371000;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLng = ((b[1] - a[1]) * Math.PI) / 180;
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);
  const c = s1 * s1 + Math.cos((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * s2 * s2;
  return 2 * R * Math.atan2(Math.sqrt(c), Math.sqrt(Math.max(0, 1 - c)));
}

function buildFallbackRoute(points, vehicleType) {
  const factor = vehicleEtaFactor(vehicleType);
  let totalDist = 0;
  let totalDur = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const dist = haversineMeters(points[i], points[i + 1]) * 1.32;
    totalDist += dist;
    totalDur += (dist / (32000 / 3600)) * factor;
  }
  return { distance: totalDist, duration: totalDur, isFallback: true };
}

async function fetchOsrmEta(points, vehicleType) {
  if (!Array.isArray(points) || points.length < 2) return null;
  const factor = vehicleEtaFactor(vehicleType);
  const key = `${factor}|${points.map((p) => `${Number(p[0]).toFixed(4)},${Number(p[1]).toFixed(4)}`).join(';')}`;
  if (state.osrmCache.has(key)) return state.osrmCache.get(key);
  if (state.osrmInflight.has(key)) return state.osrmInflight.get(key);

  const coordStr = points.map((p) => `${Number(p[1])},${Number(p[0])}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=false&steps=false`;
  const promise = (async () => {
    const controller = new AbortController();
    const tId = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const route = json?.routes?.[0];
      if (!route) throw new Error('No route');
      const result = {
        distance: Number(route.distance || 0),
        duration: Number(route.duration || 0) * factor,
        isFallback: false,
      };
      if (state.osrmCache.size > 120) {
        const oldest = state.osrmCache.keys().next().value;
        if (oldest) state.osrmCache.delete(oldest);
      }
      state.osrmCache.set(key, result);
      return result;
    } catch (_) {
      return buildFallbackRoute(points, vehicleType);
    } finally {
      clearTimeout(tId);
      state.osrmInflight.delete(key);
    }
  })();

  state.osrmInflight.set(key, promise);
  return promise;
}

function formatDurationMin(seconds) {
  const mins = Math.max(1, Math.round(Number(seconds || 0) / 60));
  return `${mins} min`;
}

function formatKm(meters) {
  return `${(Number(meters || 0) / 1000).toFixed(1)} km`;
}

function parseWaypoints(raw) {
  if (!raw) return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

// --- Onboarding Multi-Branch Builder ---
function addRegBranchDraft(initial = {}) {
  state.regBranches.push({
    branch_name: initial.branch_name || (state.regBranches.length === 0 ? 'Glavna filijala' : `Filijala ${state.regBranches.length + 1}`),
    address: initial.address || '',
    lat: Number(initial.lat || 0),
    lng: Number(initial.lng || 0),
    phone: initial.phone || '',
    is_default: state.regBranches.length === 0 ? true : Boolean(initial.is_default),
  });
  renderRegBranches();
}

function renderRegBranches() {
  if (!regBranchesListEl) return;
  regBranchesListEl.innerHTML = '';
  state.regBranches.forEach((b, idx) => {
    const card = document.createElement('div');
    card.className = 'branch-row-card';
    const hasCoords = Boolean(b.lat && b.lng);
    card.innerHTML = `
      <div class="branch-row-head">
        <strong>Filijala #${idx + 1}</strong>
        <div style="display:flex;align-items:center;gap:10px">
          <label class="checkbox-row">
            <input type="radio" name="reg-default-branch" ${b.is_default ? 'checked' : ''} />
            <span>Podrazumevana</span>
          </label>
          ${state.regBranches.length > 1 ? '<button type="button" class="btn btn-xs btn-danger act-del-branch">Ukloni</button>' : ''}
        </div>
      </div>
      <div class="grid-2">
        <div class="field">
          <label>Naziv filijale *</label>
          <input type="text" class="reg-b-name" value="${escapeHtml(b.branch_name)}" placeholder="npr. Centar / Liman" required />
        </div>
        <div class="field">
          <label>Telefon filijale</label>
          <input type="tel" class="reg-b-phone" value="${escapeHtml(b.phone)}" placeholder="06x xxx xxxx" />
        </div>
      </div>
      <div class="field autocomplete-field">
        <label>Adresa preuzimanja *</label>
        <input type="text" class="reg-b-addr" value="${escapeHtml(b.address)}" placeholder="Ulica i broj, Novi Sad" autocomplete="off" required />
        <div class="reg-b-coord ${hasCoords ? 'coord-ok' : 'coord-warn'}">
          ${hasCoords ? `✓ Koordinate pronađene (${b.lat.toFixed(4)}, ${b.lng.toFixed(4)})` : 'Izaberite predlog iz liste radi tačne GPS lokacije'}
        </div>
        <div class="suggestions hidden reg-b-sug"></div>
      </div>
    `;
    const nameEl = card.querySelector('.reg-b-name');
    const phoneEl = card.querySelector('.reg-b-phone');
    const addrEl = card.querySelector('.reg-b-addr');
    const coordEl = card.querySelector('.reg-b-coord');
    const sugEl = card.querySelector('.reg-b-sug');
    const defRadio = card.querySelector('input[type="radio"]');

    nameEl?.addEventListener('input', () => { b.branch_name = nameEl.value; });
    phoneEl?.addEventListener('input', () => { b.phone = phoneEl.value; });
    addrEl?.addEventListener('input', () => {
      b.address = addrEl.value;
      b.lat = 0;
      b.lng = 0;
      if (coordEl) {
        coordEl.className = 'reg-b-coord coord-warn';
        coordEl.textContent = 'Izaberite predlog iz liste radi tačne GPS lokacije';
      }
    });
    defRadio?.addEventListener('change', () => {
      state.regBranches.forEach((item, i) => { item.is_default = (i === idx); });
    });
    card.querySelector('.act-del-branch')?.addEventListener('click', () => {
      const wasDefault = b.is_default;
      state.regBranches.splice(idx, 1);
      if (wasDefault && state.regBranches[0]) state.regBranches[0].is_default = true;
      renderRegBranches();
    });
    wireAutocomplete(addrEl, sugEl, (picked) => {
      b.address = picked.address;
      b.lat = picked.lat;
      b.lng = picked.lng;
      if (addrEl) addrEl.value = picked.address;
      if (coordEl) {
        coordEl.className = 'reg-b-coord coord-ok';
        coordEl.textContent = `✓ Koordinate pronađene (${b.lat.toFixed(4)}, ${b.lng.toFixed(4)})`;
      }
    });
    regBranchesListEl.appendChild(card);
  });
}

btnRegAddBranch?.addEventListener('click', () => addRegBranchDraft());

registerForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!state.user) return;
  showFeedback(regStatusEl, '');
  const companyName = regCompanyNameEl.value.trim();
  const phone = regPhoneEl.value.trim();
  if (!companyName || !phone) {
    showFeedback(regStatusEl, 'Unesite naziv firme i kontakt telefon.', true);
    return;
  }
  if (!state.regBranches.length) {
    showFeedback(regStatusEl, 'Dodajte barem jednu filijalu.', true);
    return;
  }

  btnRegSubmit.disabled = true;
  btnRegSubmit.textContent = 'Šaljem registraciju...';
  try {
    const resolvedBranches = [];
    for (let i = 0; i < state.regBranches.length; i++) {
      const b = state.regBranches[i];
      const bName = (b.branch_name || '').trim();
      const bAddrRaw = (b.address || '').trim();
      if (!bName || !bAddrRaw) {
        showFeedback(regStatusEl, `Popunite naziv i adresu za Filijalu #${i + 1}.`, true);
        return;
      }
      let finalAddr = bAddrRaw;
      let lat = Number(b.lat || 0);
      let lng = Number(b.lng || 0);
      if (!lat || !lng) {
        const geo = await resolveFallbackGeocode(bAddrRaw);
        finalAddr = geo.address || bAddrRaw;
        lat = Number(geo.lat || 0);
        lng = Number(geo.lng || 0);
      }
      if (!lat || !lng) {
        showFeedback(regStatusEl, `Nismo pronašli koordinate za "${bAddrRaw}" (Filijala #${i + 1}). Izaberite predlog iz padajuće liste.`, true);
        return;
      }
      resolvedBranches.push({
        company_user_id: state.user.id,
        branch_name: bName,
        address: finalAddr,
        lat,
        lng,
        phone: (b.phone || '').trim() || phone,
        is_default: Boolean(b.is_default),
        is_active: true,
      });
    }
    if (!resolvedBranches.some((x) => x.is_default) && resolvedBranches[0]) {
      resolvedBranches[0].is_default = true;
    }

    const { error: accErr } = await supabase.from('company_accounts').insert({
      user_id: state.user.id,
      email: state.user.email || null,
      company_name: companyName,
      contact_name: regContactNameEl.value.trim() || null,
      phone,
      pib: regPibEl.value.trim() || null,
      notes: regNotesEl.value.trim() || null,
      is_approved: false,
      approved_at: null,
      approved_by: null,
    });
    if (accErr) throw accErr;

    const { error: brErr } = await supabase.from('company_branches').insert(resolvedBranches);
    if (brErr) throw brErr;

    await loadPortalData();
  } catch (err) {
    showFeedback(regStatusEl, `Greška pri registraciji: ${err?.message || err}`, true);
  } finally {
    btnRegSubmit.disabled = false;
    btnRegSubmit.textContent = 'Pošalji registraciju na odobrenje';
  }
});

// --- Branch Management Modal ---
function renderBranchSelect() {
  if (!branchSelectEl) return;
  const prev = branchSelectEl.value;
  branchSelectEl.innerHTML = '';
  const activeBranches = state.branches.filter((b) => b.is_active !== false);
  if (!activeBranches.length) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = '-- Dodajte filijalu da biste slali porudžbine --';
    branchSelectEl.appendChild(opt);
    if (selectedBranchInfoEl) selectedBranchInfoEl.textContent = '';
    return;
  }
  activeBranches.forEach((b) => {
    const opt = document.createElement('option');
    opt.value = b.id;
    opt.textContent = `${b.is_default ? '★ ' : ''}${b.branch_name} — ${b.address}`;
    branchSelectEl.appendChild(opt);
  });
  const chosen = activeBranches.find((b) => b.id === prev) || activeBranches.find((b) => b.is_default) || activeBranches[0];
  if (chosen) branchSelectEl.value = chosen.id;
  updateSelectedBranchHint();
}

function updateSelectedBranchHint() {
  if (!selectedBranchInfoEl) return;
  const b = state.branches.find((x) => x.id === branchSelectEl?.value);
  if (!b) {
    selectedBranchInfoEl.textContent = '';
    return;
  }
  selectedBranchInfoEl.textContent = `Preuzimanje: ${b.address}${b.phone ? ` • Tel: ${b.phone}` : ''}`;
}

branchSelectEl?.addEventListener('change', updateSelectedBranchHint);

function renderBranchesModal() {
  if (branchesCountEl) branchesCountEl.textContent = String(state.branches.length);
  if (!branchesModalListEl) return;
  branchesModalListEl.innerHTML = '';
  if (!state.branches.length) {
    branchesModalListEl.innerHTML = '<div class="muted small">Još uvek nema unetih filijala.</div>';
    return;
  }
  state.branches.forEach((b) => {
    const card = document.createElement('div');
    card.className = 'branch-row-card';
    card.innerHTML = `
      <div class="branch-row-head">
        <div>
          <strong>${escapeHtml(b.branch_name)}</strong>
          ${b.is_default ? '<span class="badge badge-ok" style="margin-left:6px">Podrazumevana</span>' : ''}
        </div>
        <div style="display:flex;gap:6px">
          ${!b.is_default ? '<button type="button" class="btn btn-xs btn-secondary act-set-default">Podrazumevana</button>' : ''}
          ${state.branches.length > 1 ? '<button type="button" class="btn btn-xs btn-danger act-delete-branch">Obriši</button>' : ''}
        </div>
      </div>
      <div class="muted small">${escapeHtml(b.address)}${b.phone ? ` • ${escapeHtml(b.phone)}` : ''}</div>
    `;
    card.querySelector('.act-set-default')?.addEventListener('click', async () => {
      await supabase.from('company_branches').update({ is_default: false }).eq('company_user_id', state.user.id);
      await supabase.from('company_branches').update({ is_default: true }).eq('id', b.id);
      await loadPortalData();
      renderBranchesModal();
    });
    card.querySelector('.act-delete-branch')?.addEventListener('click', async () => {
      if (state.branches.length <= 1) return;
      if (!confirm(`Obrisati filijalu "${b.branch_name}"?`)) return;
      await supabase.from('company_branches').delete().eq('id', b.id);
      if (b.is_default) {
        const remaining = state.branches.find((x) => x.id !== b.id);
        if (remaining) {
          await supabase.from('company_branches').update({ is_default: true }).eq('id', remaining.id);
        }
      }
      await loadPortalData();
      renderBranchesModal();
    });
    branchesModalListEl.appendChild(card);
  });
}

function openBranchesModal() {
  showFeedback(newBranchFeedbackEl, '');
  renderBranchesModal();
  branchesModalEl?.classList.remove('hidden');
}

btnBranchesTop?.addEventListener('click', openBranchesModal);
btnPendingEditBranches?.addEventListener('click', openBranchesModal);
btnManageBranchesInline?.addEventListener('click', openBranchesModal);
btnCloseBranchesModal?.addEventListener('click', () => branchesModalEl?.classList.add('hidden'));
branchesModalEl?.addEventListener('click', (e) => {
  if (e.target === branchesModalEl) branchesModalEl.classList.add('hidden');
});

wireAutocomplete(newBranchAddressEl, newBranchSuggestionsEl, (picked) => {
  newBranchAddressEl.value = picked.address;
  state.newBranchGeo = { address: picked.address, lat: picked.lat, lng: picked.lng, pickedDisplay: picked.address };
});

addBranchForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!state.user || !state.company) return;
  showFeedback(newBranchFeedbackEl, '');
  const bName = newBranchNameEl.value.trim();
  const bAddrRaw = newBranchAddressEl.value.trim();
  if (!bName || !bAddrRaw) {
    showFeedback(newBranchFeedbackEl, 'Unesite naziv i adresu filijale.', true);
    return;
  }
  btnSaveNewBranch.disabled = true;
  btnSaveNewBranch.textContent = 'Čuvam...';
  try {
    let lat = state.newBranchGeo.lat;
    let lng = state.newBranchGeo.lng;
    let finalAddr = bAddrRaw;
    if (!lat || !lng || state.newBranchGeo.pickedDisplay !== bAddrRaw) {
      const geo = await resolveFallbackGeocode(bAddrRaw);
      finalAddr = geo.address || bAddrRaw;
      lat = Number(geo.lat || 0);
      lng = Number(geo.lng || 0);
    }
    if (!lat || !lng) {
      showFeedback(newBranchFeedbackEl, 'Adresa nije prepoznata na mapi. Izaberite predlog iz padajuće liste.', true);
      return;
    }
    const setDefault = Boolean(newBranchDefaultEl.checked) || state.branches.length === 0;
    if (setDefault && state.branches.length > 0) {
      await supabase.from('company_branches').update({ is_default: false }).eq('company_user_id', state.user.id);
    }
    const { error } = await supabase.from('company_branches').insert({
      company_user_id: state.user.id,
      branch_name: bName,
      address: finalAddr,
      lat,
      lng,
      phone: newBranchPhoneEl.value.trim() || state.company.phone || null,
      is_default: setDefault,
      is_active: true,
    });
    if (error) throw error;
    addBranchForm.reset();
    state.newBranchGeo = { address: '', lat: 0, lng: 0, pickedDisplay: '' };
    showFeedback(newBranchFeedbackEl, `✅ Filijala "${bName}" uspešno dodata.`);
    await loadPortalData();
    renderBranchesModal();
  } catch (err) {
    showFeedback(newBranchFeedbackEl, `Greška: ${err?.message || err}`, true);
  } finally {
    btnSaveNewBranch.disabled = false;
    btnSaveNewBranch.textContent = 'Sačuvaj filijalu';
  }
});

// --- Order Waypoints & Delivery Autocomplete ---
function renderWaypoints() {
  if (!waypointsContainerEl) return;
  waypointsContainerEl.innerHTML = '';
  state.waypoints.forEach((wp, idx) => {
    const row = document.createElement('div');
    row.className = 'waypoint-row';
    row.innerHTML = `
      <div class="branch-row-head">
        <span class="small">Usputna stanica #${idx + 1}</span>
        <button type="button" class="btn btn-xs btn-danger act-rm-wp">Ukloni</button>
      </div>
      <div class="field autocomplete-field">
        <input type="text" class="wp-addr" value="${escapeHtml(wp.address)}" placeholder="Adresa usputne stanice..." autocomplete="off" />
        <div class="suggestions hidden wp-sug"></div>
      </div>
      <div class="grid-2">
        <div class="field">
          <input type="number" class="wp-goods" min="0" step="10" value="${Number(wp.goodsCost || 0)}" placeholder="Cena robe (RSD)" />
        </div>
        <div class="field">
          <input type="text" class="wp-note" value="${escapeHtml(wp.note)}" placeholder="Napomena za stanicu" />
        </div>
      </div>
    `;
    const addrEl = row.querySelector('.wp-addr');
    const sugEl = row.querySelector('.wp-sug');
    const goodsEl = row.querySelector('.wp-goods');
    const noteEl = row.querySelector('.wp-note');

    addrEl?.addEventListener('input', () => {
      wp.address = addrEl.value;
      wp.lat = 0;
      wp.lng = 0;
    });
    goodsEl?.addEventListener('input', () => { wp.goodsCost = Number(goodsEl.value || 0); });
    noteEl?.addEventListener('input', () => { wp.note = noteEl.value; });
    row.querySelector('.act-rm-wp')?.addEventListener('click', () => {
      state.waypoints.splice(idx, 1);
      renderWaypoints();
    });
    wireAutocomplete(addrEl, sugEl, (picked) => {
      const label = picked.name ? `${picked.name}, ${picked.address}` : picked.address;
      wp.address = label;
      wp.pickedLabel = label;
      wp.lat = picked.lat;
      wp.lng = picked.lng;
      if (addrEl) addrEl.value = label;
    });
    waypointsContainerEl.appendChild(row);
  });
}

btnAddWaypoint?.addEventListener('click', () => {
  state.waypoints.push({ address: '', pickedLabel: '', lat: 0, lng: 0, goodsCost: 0, note: '' });
  renderWaypoints();
});

deliveryInputEl?.addEventListener('input', () => {
  if (state.selectedDelivery.pickedDisplay && deliveryInputEl.value !== state.selectedDelivery.pickedDisplay) {
    state.selectedDelivery = { address: '', lat: 0, lng: 0, pickedDisplay: '' };
    if (deliveryCoordHintEl) {
      deliveryCoordHintEl.className = 'muted small';
      deliveryCoordHintEl.textContent = 'Izaberite predlog iz liste ili unesite punu adresu sa brojem.';
    }
  }
});

wireAutocomplete(deliveryInputEl, deliverySuggestionsEl, (picked) => {
  deliveryInputEl.value = picked.address;
  state.selectedDelivery = {
    address: picked.address,
    lat: picked.lat,
    lng: picked.lng,
    pickedDisplay: picked.address,
  };
  if (deliveryCoordHintEl) {
    deliveryCoordHintEl.className = 'coord-ok';
    deliveryCoordHintEl.textContent = `✓ Koordinate dostave spremne (${picked.lat.toFixed(4)}, ${picked.lng.toFixed(4)})`;
  }
});

// --- Enter confirms active field only; Submit opens confirmation modal ---
orderForm?.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const tag = e.target?.tagName;
  if (tag !== 'INPUT' && tag !== 'SELECT') return;
  e.preventDefault();
  const focusables = Array.from(orderForm.querySelectorAll('select, input, textarea'))
    .filter((el) => !el.disabled && el.type !== 'hidden' && el.offsetParent !== null);
  const idx = focusables.indexOf(e.target);
  if (idx >= 0 && idx + 1 < focusables.length) {
    const nextEl = focusables[idx + 1];
    nextEl.focus();
    if (nextEl.tagName === 'INPUT' && typeof nextEl.select === 'function') {
      nextEl.select();
    }
  } else {
    e.target.blur();
  }
});

function closeConfirmOrderModal() {
  confirmOrderModalEl?.classList.add('hidden');
  showFeedback(confirmOrderStatusEl, '');
}

function renderConfirmOrderModal(draft) {
  if (!confirmOrderBodyEl || !draft) return;
  const { branch, delivery, deliveryRaw, waypointsPayload, paymentLabel, tariffLabel, goodsCost, customerPhone, notes } = draft;
  const hasDeliveryCoords = Boolean(delivery.lat && delivery.lng);
  const wpHtml = waypointsPayload.length
    ? `<ol class="confirm-waypoints">${waypointsPayload.map((w) => {
        const extra = [
          Number(w.goodsCost || 0) > 0 ? `Roba: ${Number(w.goodsCost)} RSD` : null,
          w.note ? w.note : null,
        ].filter(Boolean).join(' • ');
        return `<li>${escapeHtml(w.address)}${extra ? ` <span class="muted small">(${escapeHtml(extra)})</span>` : ''}</li>`;
      }).join('')}</ol>`
    : '<span class="muted small">Nema usputnih stanica</span>';

  confirmOrderBodyEl.innerHTML = `
    <div class="confirm-row">
      <span class="confirm-label">🏢 Filijala preuzimanja</span>
      <span class="confirm-val">${escapeHtml(branch.branch_name)} — ${escapeHtml(branch.address)}</span>
    </div>
    <div class="confirm-row">
      <span class="confirm-label">🛑 Usputne stanice (${waypointsPayload.length})</span>
      <div class="confirm-val">${wpHtml}</div>
    </div>
    <div class="confirm-row">
      <span class="confirm-label">📍 Adresa dostave (kupac)</span>
      <span class="confirm-val">${escapeHtml(delivery.address || deliveryRaw)}</span>
      <span class="${hasDeliveryCoords ? 'coord-ok' : 'coord-warn'}">
        ${hasDeliveryCoords ? `✓ GPS koordinate spremne (${delivery.lat.toFixed(4)}, ${delivery.lng.toFixed(4)})` : '⚠️ GPS koordinate nisu automatski pronađene (dispečer/kurir dopunjava)'}
      </span>
    </div>
    <div class="confirm-row">
      <span class="confirm-label">📞 Telefon kupca</span>
      <span class="confirm-val">${customerPhone ? escapeHtml(customerPhone) : '<span class="muted small">Nije uneto</span>'}</span>
    </div>
    <div class="confirm-row">
      <span class="confirm-label">💰 Cena robe / plaćanje / tarifa</span>
      <span class="confirm-val">Otkup: ${Number(goodsCost || 0)} RSD • ${escapeHtml(paymentLabel)} • ${escapeHtml(tariffLabel)}</span>
    </div>
    <div class="confirm-row">
      <span class="confirm-label">📝 Napomena</span>
      <div class="confirm-note">${notes ? escapeHtml(notes) : '<span class="muted small">Bez napomene</span>'}</div>
    </div>
  `;
  showFeedback(confirmOrderStatusEl, '');
  confirmOrderModalEl?.classList.remove('hidden');
}

let preparingOrder = false;
orderForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (preparingOrder || submittingOrder || !state.user || !state.company?.is_approved) return;
  showFeedback(orderFeedbackEl, '');

  const branch = state.branches.find((b) => b.id === branchSelectEl.value);
  if (!branch) {
    showFeedback(orderFeedbackEl, 'Izaberite ili dodajte filijalu preuzimanja.', true);
    return;
  }
  const deliveryRaw = deliveryInputEl.value.trim();
  if (!deliveryRaw) {
    showFeedback(orderFeedbackEl, 'Unesite adresu dostave kupca.', true);
    return;
  }

  preparingOrder = true;
  btnSubmitOrder.disabled = true;
  btnSubmitOrder.textContent = 'Pripremam pregled...';
  try {
    let delivery = state.selectedDelivery;
    if (!delivery.lat || !delivery.lng || delivery.pickedDisplay !== deliveryRaw) {
      const geo = await resolveFallbackGeocode(deliveryRaw);
      delivery = {
        address: geo.address || deliveryRaw,
        lat: Number(geo.lat || 0),
        lng: Number(geo.lng || 0),
        pickedDisplay: geo.address || deliveryRaw,
      };
    }

    const waypointsPayload = [];
    for (const wp of state.waypoints) {
      const rawAddr = (wp.address || '').trim();
      if (!rawAddr) continue;
      let lat = Number(wp.lat || 0);
      let lng = Number(wp.lng || 0);
      let finalAddr = rawAddr;
      if ((!lat && !lng) || (wp.pickedLabel && wp.pickedLabel !== rawAddr)) {
        const geo = await resolveFallbackGeocode(rawAddr);
        finalAddr = geo.name ? `${geo.name}, ${geo.address}` : (geo.address || rawAddr);
        lat = Number(geo.lat || 0);
        lng = Number(geo.lng || 0);
      }
      waypointsPayload.push({
        address: finalAddr,
        lat,
        lng,
        surcharge: 80,
        goodsCost: Number(wp.goodsCost || 0),
        note: (wp.note || '').trim() || null,
        isCustomerDropoff: false,
      });
    }

    const pickupLabel = branch.branch_name && branch.branch_name.toLowerCase() !== state.company.company_name.toLowerCase()
      ? `${state.company.company_name} — ${branch.branch_name}`
      : state.company.company_name;

    const goodsCost = Number(goodsCostEl.value || 0);
    const customerPhone = customerPhoneEl.value.trim() || null;
    const notes = orderNotesEl.value.trim() || null;
    const paymentLabel = paymentSelectEl.options[paymentSelectEl.selectedIndex]?.textContent || paymentSelectEl.value;
    const tariffLabel = tariffSelectEl.options[tariffSelectEl.selectedIndex]?.textContent || tariffSelectEl.value;

    state.pendingOrderDraft = {
      branch,
      delivery,
      deliveryRaw,
      waypointsPayload,
      paymentLabel,
      tariffLabel,
      goodsCost,
      customerPhone,
      notes,
      insertPayload: {
        created_by_email: state.user.email || null,
        company_user_id: state.user.id,
        company_branch_id: branch.id,
        company_name: state.company.company_name,
        order_source: 'company',
        assigned_courier_id: null,
        assigned_courier_email: null,
        assigned_courier_name: null,
        dispatch_status: 'UNASSIGNED',
        trip_status: 'CALL_RECEIVED',
        pickup_name: pickupLabel,
        pickup_address: branch.address,
        pickup_lat: Number(branch.lat || 0),
        pickup_lng: Number(branch.lng || 0),
        delivery_address: delivery.address || deliveryRaw,
        delivery_lat: Number(delivery.lat || 0),
        delivery_lng: Number(delivery.lng || 0),
        waypoints_json: JSON.stringify(waypointsPayload),
        goods_cost: goodsCost,
        payment_method: encodePaymentMeta(paymentSelectEl.value, tariffSelectEl.value),
        customer_phone: customerPhone,
        notes,
        offer_expires_at: null,
        no_auto_expire: true,
        updated_by_role: 'company',
      },
    };

    renderConfirmOrderModal(state.pendingOrderDraft);
  } catch (err) {
    companyLog('ORDER/PREP_ERR', err?.message || String(err));
    showFeedback(orderFeedbackEl, `Greška pri pripremi porudžbine: ${err?.message || err}`, true);
  } finally {
    preparingOrder = false;
    btnSubmitOrder.disabled = false;
    btnSubmitOrder.textContent = '📨 Pošalji porudžbinu dispečeru';
  }
});

let submittingOrder = false;
async function confirmAndSendPendingOrder() {
  const draft = state.pendingOrderDraft;
  if (submittingOrder || !draft || !state.user || !state.company?.is_approved) return;
  submittingOrder = true;
  if (btnConfirmOrderSend) {
    btnConfirmOrderSend.disabled = true;
    btnConfirmOrderSend.textContent = 'Šaljem...';
  }
  if (btnConfirmOrderEdit) btnConfirmOrderEdit.disabled = true;
  showFeedback(confirmOrderStatusEl, '');

  try {
    const { error } = await supabase.from('dispatch_orders').insert(draft.insertPayload);
    if (error) throw error;

    companyLog('ORDER', `Poslata porudžbina iz filijale "${draft.branch.branch_name}" -> ${draft.delivery.address || draft.deliveryRaw}`);

    const keptBranch = draft.branch.id;
    state.pendingOrderDraft = null;
    closeConfirmOrderModal();

    orderForm.reset();
    branchSelectEl.value = keptBranch;
    updateSelectedBranchHint();
    state.waypoints = [];
    renderWaypoints();
    state.selectedDelivery = { address: '', lat: 0, lng: 0, pickedDisplay: '' };
    if (deliveryCoordHintEl) {
      deliveryCoordHintEl.className = 'muted small';
      deliveryCoordHintEl.textContent = 'Izaberite predlog iz liste ili unesite punu adresu sa brojem.';
    }
    showFeedback(orderFeedbackEl, '✅ Porudžbina je poslata dispečerskom centru (čeka dodelu kuriru).');
    state.ordersTab = 'active';
    await loadOrdersOnly();
  } catch (err) {
    companyLog('ORDER/ERR', err?.message || String(err));
    showFeedback(confirmOrderStatusEl, `Greška pri slanju porudžbine: ${err?.message || err}`, true);
  } finally {
    submittingOrder = false;
    if (btnConfirmOrderSend) {
      btnConfirmOrderSend.disabled = false;
      btnConfirmOrderSend.textContent = '✅ Potvrdi i pošalji';
    }
    if (btnConfirmOrderEdit) btnConfirmOrderEdit.disabled = false;
  }
}

btnConfirmOrderSend?.addEventListener('click', confirmAndSendPendingOrder);
btnConfirmOrderEdit?.addEventListener('click', closeConfirmOrderModal);
btnCloseConfirmOrder?.addEventListener('click', closeConfirmOrderModal);
confirmOrderModalEl?.addEventListener('click', (e) => {
  if (e.target === confirmOrderModalEl) closeConfirmOrderModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && confirmOrderModalEl && !confirmOrderModalEl.classList.contains('hidden')) {
    closeConfirmOrderModal();
  }
});

// --- Time, Filter & Status Helpers ---
function formatDateTimeSr(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dd}.${mm}.${yyyy}. ${hh}:${min}`;
}

function formatShortTimeSr(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${dd}.${mm}. ${hh}:${min}`;
}

function formatClockTimeSr(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('sr-RS', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function formatDurationBetween(startIso, endIso) {
  if (!startIso || !endIso) return '';
  const diffMin = Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000);
  if (!Number.isFinite(diffMin) || diffMin < 0) return '';
  if (diffMin < 60) return `${Math.max(1, diffMin)} min`;
  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function populateFilterBranchSelect() {
  if (!filterBranchEl) return;
  const prev = state.filters.branchId || filterBranchEl.value || '';
  filterBranchEl.innerHTML = '<option value="">Sve filijale</option>';
  state.branches.forEach((b) => {
    const opt = document.createElement('option');
    opt.value = b.id;
    opt.textContent = b.branch_name;
    filterBranchEl.appendChild(opt);
  });
  if (prev && state.branches.some((b) => b.id === prev)) {
    filterBranchEl.value = prev;
  } else {
    filterBranchEl.value = '';
    state.filters.branchId = '';
  }
}

function orderMatchesDateRange(createdAtIso, range) {
  if (!range || range === 'all') return true;
  if (!createdAtIso) return false;
  const createdMs = new Date(createdAtIso).getTime();
  if (!Number.isFinite(createdMs)) return false;

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (range === 'today') return createdMs >= startOfToday;
  if (range === 'yesterday') {
    const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;
    return createdMs >= startOfYesterday && createdMs < startOfToday;
  }
  if (range === '7d') return createdMs >= (now.getTime() - 7 * 24 * 60 * 60 * 1000);
  if (range === '30d') return createdMs >= (now.getTime() - 30 * 24 * 60 * 60 * 1000);
  return true;
}

function orderMatchesFilters(o) {
  const { search, branchId, status, dateRange } = state.filters;
  if (branchId && o.company_branch_id !== branchId) return false;
  if (!orderMatchesDateRange(o.created_at, dateRange)) return false;

  const ds = (o.dispatch_status || 'UNASSIGNED').toUpperCase();
  const ts = (o.trip_status || '').toUpperCase();
  if (status === 'WAITING') {
    if (!['UNASSIGNED', 'OFFERED', 'REJECTED', 'EXPIRED'].includes(ds)) return false;
  } else if (status === 'IN_PROGRESS') {
    if (ds !== 'ACCEPTED' || ts === 'COMPLETED') return false;
  } else if (status === 'COMPLETED') {
    if (ds !== 'COMPLETED' && ts !== 'COMPLETED') return false;
  } else if (status === 'CANCELLED') {
    if (ds !== 'CANCELLED') return false;
  }

  if (search) {
    const q = search.toLowerCase();
    const haystack = [
      o.order_code ? `#${o.order_code}` : '',
      String(o.order_code || ''),
      o.pickup_name,
      o.pickup_address,
      o.delivery_address,
      o.customer_phone,
      o.assigned_courier_name,
      o.assigned_courier_email,
      o.notes,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (!haystack.includes(q)) return false;
  }
  return true;
}

function hasActiveFilters() {
  return Boolean(
    state.filters.search
    || state.filters.branchId
    || state.filters.status
    || (state.filters.dateRange && state.filters.dateRange !== 'all')
  );
}

// --- Orders Status, 5-Step Progress & Live ETA ---
function orderStepInfo(o) {
  const ds = (o.dispatch_status || 'UNASSIGNED').toUpperCase();
  const ts = (o.trip_status || 'CALL_RECEIVED').toUpperCase();

  if (ds === 'CANCELLED') {
    return { stepIdx: -1, badgeText: 'Otkazano', badgeCls: 'badge-err', isFinished: true };
  }
  if (ds === 'COMPLETED' || ts === 'COMPLETED') {
    return { stepIdx: 4, badgeText: 'Dostavljeno', badgeCls: 'badge-ok', isFinished: true };
  }
  if (ds === 'UNASSIGNED' || ds === 'REJECTED' || ds === 'EXPIRED') {
    return { stepIdx: 0, badgeText: 'Čeka dodelu dispečera', badgeCls: 'badge-wait', isFinished: false };
  }
  if (ds === 'OFFERED') {
    return { stepIdx: 0, badgeText: 'Dodeljeno kuriru — čeka potvrdu', badgeCls: 'badge-wait', isFinished: false };
  }
  // ACCEPTED (pokriva i Android TripStatus i Web Dispečer nazive)
  switch (ts) {
    case 'EN_ROUTE_PICKUP':
      return { stepIdx: 2, badgeText: 'Kurir ide po robu', badgeCls: 'badge-cyan', isFinished: false };
    case 'AT_PICKUP':
      return { stepIdx: 2, badgeText: 'Kurir je na preuzimanju', badgeCls: 'badge-cyan', isFinished: false };
    case 'PICKED_UP':
    case 'EN_ROUTE_CUSTOMER':
    case 'EN_ROUTE_DELIVERY':
      return { stepIdx: 3, badgeText: 'Roba preuzeta — ka kupcu', badgeCls: 'badge-info', isFinished: false };
    case 'EN_ROUTE_WAYPOINT':
      return { stepIdx: 3, badgeText: 'Ka usputnoj stanici', badgeCls: 'badge-info', isFinished: false };
    case 'AT_WAYPOINT':
      return { stepIdx: 3, badgeText: 'Na usputnoj stanici', badgeCls: 'badge-info', isFinished: false };
    case 'AT_CUSTOMER':
    case 'AT_DELIVERY':
      return { stepIdx: 3, badgeText: 'Kurir je na adresi kupca', badgeCls: 'badge-ok', isFinished: false };
    default:
      return { stepIdx: 1, badgeText: 'Kurir prihvatio', badgeCls: 'badge-info', isFinished: false };
  }
}

async function computeAndRenderOrderEta(o, boxEl) {
  if (!boxEl || o.dispatch_status !== 'ACCEPTED') return;
  const cLat = Number(o.courier_lat || 0);
  const cLng = Number(o.courier_lng || 0);
  const gpsTimeStr = o.courier_location_updated_at
    ? `<div class="muted small">GPS ažuriran: ${escapeHtml(formatClockTimeSr(o.courier_location_updated_at))}</div>`
    : '';

  if (!cLat || !cLng) {
    boxEl.innerHTML = `<div class="muted">Kurir <strong>${escapeHtml(o.assigned_courier_name || 'dodeljen')}</strong> je prihvatio — čekamo validnu GPS poziciju kurira za ETA.</div>`;
    return;
  }

  const cPt = [cLat, cLng];
  const pPt = (Number(o.pickup_lat) && Number(o.pickup_lng)) ? [Number(o.pickup_lat), Number(o.pickup_lng)] : null;
  const dPt = (Number(o.delivery_lat) && Number(o.delivery_lng)) ? [Number(o.delivery_lat), Number(o.delivery_lng)] : null;
  const wps = parseWaypoints(o.waypoints_json)
    .filter((w) => w && !w.visited && !w.isVisited && Number(w.lat) && Number(w.lng))
    .map((w) => [Number(w.lat), Number(w.lng)]);
  const ts = (o.trip_status || 'CALL_RECEIVED').toUpperCase();
  const pickedAlready = [
    'PICKED_UP',
    'EN_ROUTE_WAYPOINT',
    'AT_WAYPOINT',
    'EN_ROUTE_CUSTOMER',
    'EN_ROUTE_DELIVERY',
    'AT_CUSTOMER',
    'AT_DELIVERY',
  ].includes(ts);

  if (!pickedAlready) {
    if (!pPt) {
      boxEl.innerHTML = `<div><strong>🚗 Kurir je dodeljen i aktivan</strong></div>${gpsTimeStr}`;
      return;
    }
    const pickupRoute = ts === 'AT_PICKUP'
      ? { duration: 60, distance: 0 }
      : await fetchOsrmEta([cPt, pPt], o.courier_vehicle_type);
    if (!boxEl.isConnected) return;

    const pickupLine = ts === 'AT_PICKUP'
      ? '<div><strong>📍 Kurir je stigao na preuzimanje</strong></div>'
      : `<div><strong>🚗 Dolazak po robu:</strong> ~${formatDurationMin(pickupRoute.duration)} (${formatKm(pickupRoute.distance)})</div>`;

    if (dPt) {
      const fullRoute = await fetchOsrmEta([cPt, pPt, ...wps, dPt], o.courier_vehicle_type);
      if (!boxEl.isConnected) return;
      const totalWithHandling = Number(fullRoute.duration || 0) + (ts === 'AT_PICKUP' ? 90 : 180);
      boxEl.innerHTML = `
        ${pickupLine}
        <div><strong>📦 Procenjena dostava kupcu:</strong> ~${formatDurationMin(totalWithHandling)} ukupno (${formatKm(fullRoute.distance)})</div>
        ${gpsTimeStr}
      `;
    } else {
      boxEl.innerHTML = `${pickupLine}${gpsTimeStr}`;
    }
  } else {
    if (ts === 'AT_CUSTOMER' || ts === 'AT_DELIVERY') {
      boxEl.innerHTML = `<div><strong>🏁 Kurir je stigao na adresu kupca.</strong></div>${gpsTimeStr}`;
      return;
    }
    if (!dPt) {
      boxEl.innerHTML = `<div><strong>📦 Roba je preuzeta</strong> — kurir je na putu ka kupcu.</div>${gpsTimeStr}`;
      return;
    }
    const delivRoute = await fetchOsrmEta([cPt, ...wps, dPt], o.courier_vehicle_type);
    if (!boxEl.isConnected) return;
    boxEl.innerHTML = `
      <div><strong>📦 Dolazak kod kupca:</strong> ~${formatDurationMin(delivRoute.duration)} (${formatKm(delivRoute.distance)})</div>
      ${gpsTimeStr}
    `;
  }
}

function renderOrders() {
  const isDone = (o) => {
    const ds = (o.dispatch_status || '').toUpperCase();
    const ts = (o.trip_status || '').toUpperCase();
    return ds === 'COMPLETED' || ds === 'CANCELLED' || ts === 'COMPLETED';
  };
  const activeOrders = state.orders.filter((o) => !isDone(o));
  const historyOrders = state.orders.filter(isDone);

  if (activeCountEl) activeCountEl.textContent = String(activeOrders.length);
  if (historyCountEl) historyCountEl.textContent = String(historyOrders.length);
  tabActiveBtn?.classList.toggle('active', state.ordersTab === 'active');
  tabHistoryBtn?.classList.toggle('active', state.ordersTab === 'history');

  const baseList = state.ordersTab === 'active' ? activeOrders : historyOrders;
  const filteredList = baseList.filter(orderMatchesFilters);

  const filtering = hasActiveFilters();
  btnFilterReset?.classList.toggle('hidden', !filtering);
  if (filterSummaryEl) {
    filterSummaryEl.textContent = filtering
      ? `Prikazano ${filteredList.length} od ${baseList.length} porudžbina u ovom tabu`
      : `Ukupno u tabu: ${baseList.length}`;
  }

  if (!ordersListEl) return;
  ordersListEl.innerHTML = '';

  if (!filteredList.length) {
    ordersListEl.innerHTML = `<div class="muted small" style="padding:12px 0">${
      filtering
        ? 'Nema porudžbina koje odgovaraju izabranim filterima.'
        : (state.ordersTab === 'active'
          ? 'Trenutno nemate aktivnih porudžbina. Pošaljite novu porudžbinu preko formulara levo.'
          : 'Još nema završenih ili otkazanih porudžbina.')
    }</div>`;
    return;
  }

  const stepsLabels = ['Čeka dodelu', 'Prihvaćeno', 'Po robu', 'Ka kupcu', 'Dostavljeno'];

  filteredList.forEach((o) => {
    const info = orderStepInfo(o);
    const wps = parseWaypoints(o.waypoints_json);
    const createdStr = formatShortTimeSr(o.created_at);
    const pickedStr = o.picked_up_at ? formatShortTimeSr(o.picked_up_at) : '';
    const deliveredIso = o.delivered_at || ((info.stepIdx === 4 && info.isFinished) ? o.updated_at : null);
    const deliveredFullStr = deliveredIso ? formatDateTimeSr(deliveredIso) : '';
    const totalDuration = (o.created_at && deliveredIso) ? formatDurationBetween(o.created_at, deliveredIso) : '';
    const cancelledFullStr = (o.dispatch_status || '').toUpperCase() === 'CANCELLED' ? formatDateTimeSr(o.updated_at) : '';

    const stepperHtml = info.stepIdx >= 0
      ? `<div class="stepper">${stepsLabels.map((lbl, idx) => {
          const cls = idx < info.stepIdx || (info.stepIdx === 4 && idx === 4) ? 'done' : (idx === info.stepIdx ? 'active' : '');
          return `<div class="step-chip ${cls}">${idx + 1}. ${lbl}</div>`;
        }).join('')}</div>`
      : '';

    const canCancel = (o.dispatch_status || '').toUpperCase() === 'UNASSIGNED';
    const showEta = (o.dispatch_status || '').toUpperCase() === 'ACCEPTED' && (o.trip_status || '').toUpperCase() !== 'COMPLETED';
    const card = document.createElement('div');
    card.className = `order-card${o.dispatch_status === 'UNASSIGNED' ? ' waiting' : ''}`;
    card.innerHTML = `
      <div class="order-card-top">
        <strong>#${escapeHtml(o.order_code || '?')} ${escapeHtml(o.pickup_name || o.pickup_address)}</strong>
        <div style="display:flex;align-items:center;gap:8px">
          <span class="muted small">${escapeHtml(createdStr)}</span>
          <span class="badge ${info.badgeCls}">${escapeHtml(info.badgeText)}</span>
        </div>
      </div>
      <div class="order-times-row">
        ${createdStr ? `<span>📤 Poslato: ${escapeHtml(createdStr)}</span>` : ''}
        ${o.accepted_at ? `<span>👍 Prihvaćeno: ${escapeHtml(formatShortTimeSr(o.accepted_at))}</span>` : ''}
        ${pickedStr ? `<span>📦 Preuzeto: ${escapeHtml(pickedStr)}</span>` : ''}
      </div>
      <div class="muted small">Preuzimanje: ${escapeHtml(o.pickup_address)}</div>
      ${wps.length ? `<div class="muted small">Usputne stanice (${wps.length}): ${escapeHtml(wps.map((w) => w.address).filter(Boolean).join(' → '))}</div>` : ''}
      <div>Dostava: <strong>${escapeHtml(o.delivery_address || 'Dopunjava dispečer/kurir')}</strong></div>
      <div class="muted small">
        Kurir: ${escapeHtml(o.assigned_courier_name || o.assigned_courier_email || 'Čeka dodelu')}
        • Otkup/roba: ${Number(o.goods_cost || 0)} RSD
        ${o.customer_phone ? `• Tel kupca: ${escapeHtml(o.customer_phone)}` : ''}
      </div>
      ${o.notes ? `<div class="small" style="color:#ffd54f">Napomena: ${escapeHtml(o.notes)}</div>` : ''}
      ${stepperHtml}
      ${deliveredFullStr ? `<div class="delivered-banner"><span><strong>✅ Roba predata kupcu:</strong> ${escapeHtml(deliveredFullStr)}</span>${totalDuration ? `<span>⏱️ Ukupno: ${escapeHtml(totalDuration)}</span>` : ''}</div>` : ''}
      ${cancelledFullStr ? `<div class="cancelled-banner">❌ Otkazano: ${escapeHtml(cancelledFullStr)}</div>` : ''}
      ${showEta ? `<div class="eta-box" data-eta-order="${escapeHtml(o.id)}"><span class="muted">Računam ETA...</span></div>` : ''}
      ${canCancel ? '<div class="order-actions"><button type="button" class="btn btn-xs btn-danger act-cancel-order">Otkaži porudžbinu</button></div>' : ''}
    `;

    card.querySelector('.act-cancel-order')?.addEventListener('click', async () => {
      if (!confirm(`Otkazati porudžbinu #${o.order_code || ''}?`)) return;
      const { error } = await supabase
        .from('dispatch_orders')
        .update({
          dispatch_status: 'CANCELLED',
          updated_by_role: 'company',
          updated_at: new Date().toISOString(),
        })
        .eq('id', o.id)
        .eq('dispatch_status', 'UNASSIGNED');
      if (error) {
        companyLog('ORDER/CANCEL_ERR', `#${o.order_code || o.id}: ${error.message}`);
        alert(`Nije moguće otkazati: ${error.message}`);
      } else {
        companyLog('ORDER', `Otkazana porudžbina #${o.order_code || o.id}`);
      }
      await loadOrdersOnly();
    });

    ordersListEl.appendChild(card);

    if (showEta) {
      const box = card.querySelector(`[data-eta-order="${o.id}"]`);
      computeAndRenderOrderEta(o, box);
    }
  });
}

tabActiveBtn?.addEventListener('click', () => { state.ordersTab = 'active'; renderOrders(); });
tabHistoryBtn?.addEventListener('click', () => { state.ordersTab = 'history'; renderOrders(); });

filterSearchEl?.addEventListener('input', () => {
  state.filters.search = filterSearchEl.value.trim();
  renderOrders();
});
filterBranchEl?.addEventListener('change', () => {
  state.filters.branchId = filterBranchEl.value;
  renderOrders();
});
filterStatusEl?.addEventListener('change', () => {
  const val = filterStatusEl.value;
  state.filters.status = val;
  if (val === 'COMPLETED' || val === 'CANCELLED') state.ordersTab = 'history';
  else if (val === 'WAITING' || val === 'IN_PROGRESS') state.ordersTab = 'active';
  renderOrders();
});
filterDateEl?.addEventListener('change', () => {
  state.filters.dateRange = filterDateEl.value || 'all';
  renderOrders();
});
btnFilterReset?.addEventListener('click', () => {
  state.filters = { search: '', branchId: '', status: '', dateRange: 'all' };
  if (filterSearchEl) filterSearchEl.value = '';
  if (filterBranchEl) filterBranchEl.value = '';
  if (filterStatusEl) filterStatusEl.value = '';
  if (filterDateEl) filterDateEl.value = 'all';
  renderOrders();
});

// --- Data Loading, Realtime & Diagnostics ---
function diffOrdersSnapshot(orders) {
  const nextSnap = new Map();
  for (const o of orders) {
    if (!o?.id) continue;
    const gpsSig = o.courier_lat && o.courier_lng
      ? `${Number(o.courier_lat).toFixed(4)},${Number(o.courier_lng).toFixed(4)}`
      : 'none';
    const sig = `${o.dispatch_status}|${o.trip_status}|${o.assigned_courier_id || ''}|${gpsSig}`;
    const prevSig = state.prevOrdersSnap.get(o.id);
    if (prevSig && prevSig !== sig) {
      companyLog('ORDER_SYNC', `#${o.order_code || o.id}: ${prevSig} -> ${sig}`);
    }
    nextSnap.set(o.id, sig);
  }
  state.prevOrdersSnap = nextSnap;
}

function scheduleOrdersReload(delayMs = 200) {
  clearTimeout(state.ordersReloadTimer);
  state.ordersReloadTimer = setTimeout(() => {
    loadOrdersOnly();
  }, delayMs);
}

async function loadOrdersOnly() {
  if (!state.user || !state.company?.is_approved) return;
  const seq = ++state.ordersLoadSeq;
  const { data, error } = await supabase
    .from('dispatch_orders')
    .select('*')
    .eq('company_user_id', state.user.id)
    .order('created_at', { ascending: false })
    .limit(200);
  if (seq !== state.ordersLoadSeq) return;
  if (error) {
    companyLog('ORDERS/ERR', error.message);
    return;
  }
  state.orders = data || [];
  diffOrdersSnapshot(state.orders);
  renderOrders();
}

async function loadPortalData() {
  if (!state.user) return;
  const [{ data: acc, error: accErr }, { data: brs, error: brErr }] = await Promise.all([
    supabase.from('company_accounts').select('*').eq('user_id', state.user.id).maybeSingle(),
    supabase.from('company_branches').select('*').eq('company_user_id', state.user.id).order('is_default', { ascending: false }).order('created_at', { ascending: true }),
  ]);

  if (accErr) {
    companyLog('PORTAL/ERR', accErr.message);
    authStatusEl.textContent = `Greška učitavanja naloga: ${accErr.message}`;
    authStatusEl.classList.remove('hidden');
    return;
  }
  if (brErr) companyLog('BRANCHES/ERR', brErr.message);

  state.company = acc || null;
  state.branches = brs || [];
  if (branchesCountEl) branchesCountEl.textContent = String(state.branches.length);
  populateFilterBranchSelect();

  if (!state.company) {
    approvalPillEl.textContent = 'Novi nalog';
    approvalPillEl.className = 'pill pill-pending';
    btnBranchesTop?.classList.add('hidden');
    onboardingEl?.classList.remove('hidden');
    pendingBannerEl?.classList.add('hidden');
    workspaceEl?.classList.add('hidden');
    if (!state.regBranches.length) addRegBranchDraft();
    return;
  }

  userLabelEl.textContent = `${state.company.company_name} (${state.user.email || ''})`;
  btnBranchesTop?.classList.remove('hidden');
  onboardingEl?.classList.add('hidden');

  if (!state.company.is_approved) {
    approvalPillEl.textContent = 'Čeka odobrenje admina';
    approvalPillEl.className = 'pill pill-pending';
    pendingBannerEl?.classList.remove('hidden');
    workspaceEl?.classList.add('hidden');
    if (pendingDescEl) {
      pendingDescEl.textContent = `Firma "${state.company.company_name}" (${state.user.email || ''}) je registrovana i čeka odobrenje administratora. Čim admin potvrdi nalog u Web Dispečeru, portal se automatski otvara.`;
    }
    if (pendingBranchesPreviewEl) {
      pendingBranchesPreviewEl.innerHTML = state.branches.map((b) => `
        <div class="branch-row-card">
          <div class="branch-row-head">
            <strong>${escapeHtml(b.branch_name)}</strong>
            ${b.is_default ? '<span class="badge badge-ok">Podrazumevana</span>' : ''}
          </div>
          <div class="muted small">${escapeHtml(b.address)}</div>
        </div>
      `).join('');
    }
    return;
  }

  approvalPillEl.textContent = 'Odobrena firma';
  approvalPillEl.className = 'pill pill-approved';
  pendingBannerEl?.classList.add('hidden');
  workspaceEl?.classList.remove('hidden');
  renderBranchSelect();
  await loadOrdersOnly();
}

function setupRealtime() {
  if (!state.user || state.realtimeChannel) return;
  const uid = state.user.id;
  const channel = supabase
    .channel(`company-portal-${uid}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'company_accounts', filter: `user_id=eq.${uid}` }, (payload) => {
      companyLog('RT/ACCOUNT', `${payload.eventType}: approved=${payload.new?.is_approved}`);
      loadPortalData();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'company_branches', filter: `company_user_id=eq.${uid}` }, (payload) => {
      companyLog('RT/BRANCH', payload.eventType);
      loadPortalData();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'dispatch_orders', filter: `company_user_id=eq.${uid}` }, (payload) => {
      const n = payload.new || {};
      companyLog(
        'RT/ORDER',
        `${payload.eventType} #${n.order_code || '?'} st=${n.dispatch_status || '?'}/${n.trip_status || '?'} gps=${n.courier_lat ?? '-'},${n.courier_lng ?? '-'}`
      );
      scheduleOrdersReload(180);
    })
    .subscribe((status) => {
      companyLog('REALTIME', `Status kanala: ${status}`);
    });
  state.realtimeChannel = channel;

  if (!state.refreshTimer) {
    state.refreshTimer = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      const hasAcceptedActive = state.orders.some(
        (o) => (o.dispatch_status || '').toUpperCase() === 'ACCEPTED' && (o.trip_status || '').toUpperCase() !== 'COMPLETED'
      );
      const intervalMs = hasAcceptedActive ? 5000 : 15000;
      if (now - state.lastPollAt < intervalMs - 200) return;
      state.lastPollAt = now;
      if (state.company?.is_approved) loadOrdersOnly();
      else if (state.company) loadPortalData();
    }, 5000);
  }
}

// --- Company Diagnostics / Bug Report Modal ---
function buildDiagnosticsReportText() {
  const activeOrders = state.orders.filter((o) => !['COMPLETED', 'CANCELLED'].includes((o.dispatch_status || '').toUpperCase()));
  const orderSummaryLines = activeOrders.slice(0, 12).map((o) => (
    `  #${o.order_code || o.id}: ${o.dispatch_status}/${o.trip_status} | courier=${o.assigned_courier_name || o.assigned_courier_id || 'none'} | gps=${o.courier_lat ?? 'null'},${o.courier_lng ?? 'null'} @ ${o.courier_location_updated_at || 'never'}`
  ));
  return [
    '=== FLASH DOSTAVA PORTAL ZA FIRME — DIJAGNOSTIČKI IZVEŠTAJ ===',
    `Datum i vreme: ${new Date().toISOString()}`,
    `Verzija: ${COMPANY_PORTAL_VERSION}`,
    `Korisnik: ${state.user?.email || 'nepoznato'} (${state.user?.id || '-'})`,
    `Firma: ${state.company?.company_name || 'neregistrovana'} (odobrena=${Boolean(state.company?.is_approved)}, filijala=${state.branches.length})`,
    `Browser: ${navigator.userAgent}`,
    `Porudžbina ukupno: ${state.orders.length}, aktivnih: ${activeOrders.length}`,
    ...(orderSummaryLines.length ? ['--- AKTIVNE PORUDŽBINE ---', ...orderSummaryLines] : []),
    '',
    `--- DIJAGNOSTIČKI LOGOVI (${debugLogs.length} zapisa) ---`,
    ...debugLogs,
    '==============================================================',
  ].join('\n');
}

function refreshDebugModalPreview() {
  if (debugLogCountEl) debugLogCountEl.textContent = String(debugLogs.length);
  if (debugLogPreviewEl) {
    debugLogPreviewEl.textContent = debugLogs.slice(-60).join('\n') || '(Nema zabeleženih događaja još uvek)';
  }
}

btnOpenDebug?.addEventListener('click', () => {
  if (debugSendStatusEl) debugSendStatusEl.textContent = '';
  refreshDebugModalPreview();
  debugModalEl?.classList.remove('hidden');
});
btnCloseDebug?.addEventListener('click', () => debugModalEl?.classList.add('hidden'));
debugModalEl?.addEventListener('click', (e) => {
  if (e.target === debugModalEl) debugModalEl.classList.add('hidden');
});

btnCopyDebugLog?.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(buildDiagnosticsReportText());
    if (debugSendStatusEl) debugSendStatusEl.textContent = 'Log kopiran u clipboard.';
  } catch (err) {
    if (debugSendStatusEl) debugSendStatusEl.textContent = `Kopiranje nije uspelo: ${err?.message || err}`;
  }
});

btnSendDebugReport?.addEventListener('click', async () => {
  const commentText = debugCommentEl?.value.trim() || '';
  if (!commentText) {
    if (debugSendStatusEl) debugSendStatusEl.textContent = '⚠️ Unesite kratak opis problema ili komentar pre slanja.';
    debugCommentEl?.focus();
    return;
  }
  btnSendDebugReport.disabled = true;
  if (debugSendStatusEl) debugSendStatusEl.textContent = 'Šaljem izveštaj u Supabase...';
  try {
    const activeOrders = state.orders.filter((o) => !['COMPLETED', 'CANCELLED'].includes((o.dispatch_status || '').toUpperCase()));
    const activeInfo = [
      `Firma: ${state.company?.company_name || 'Neregistrovana'}`,
      `Filijala: ${state.branches.length}`,
      `Aktivnih porudžbina: ${activeOrders.length}/${state.orders.length}`,
    ].join(' | ');

    const { error } = await supabase.from('feedback_reports').insert({
      user_id: state.user?.id || null,
      user_email: state.user?.email || 'unknown',
      category: debugCategoryEl?.value || 'bug',
      comment: commentText,
      active_trip_info: activeInfo,
      diagnostics_log: debugIncludeLogsEl?.checked ? buildDiagnosticsReportText() : null,
      app_version: COMPANY_PORTAL_VERSION,
      device_model: navigator.userAgent.slice(0, 120),
      status: 'new',
    });
    if (error) throw error;
    companyLog('DEBUG', `Poslat izveštaj firme (${debugCategoryEl?.value || 'bug'})`);
    if (debugCommentEl) debugCommentEl.value = '';
    if (debugSendStatusEl) debugSendStatusEl.textContent = '✅ Izveštaj uspešno poslat! Hvala na povratnoj informaciji.';
    refreshDebugModalPreview();
  } catch (err) {
    companyLog('DEBUG/ERR', err?.message || String(err));
    if (debugSendStatusEl) debugSendStatusEl.textContent = `❌ Greška pri slanju: ${err?.message || err}`;
  } finally {
    btnSendDebugReport.disabled = false;
  }
});

async function handleSession(session) {
  if (!session?.user) {
    authOverlayEl?.classList.remove('hidden');
    shellEl?.classList.add('hidden');
    return;
  }
  state.user = session.user;
  companyLog('AUTH', `Prijavljen korisnik: ${session.user.email || session.user.id}`);
  if (userLabelEl) userLabelEl.textContent = session.user.email || '';
  if (!regContactNameEl.value && session.user.user_metadata?.full_name) {
    regContactNameEl.value = session.user.user_metadata.full_name;
  }
  authOverlayEl?.classList.add('hidden');
  shellEl?.classList.remove('hidden');
  await loadPortalData();
  setupRealtime();
}

btnGoogleLogin?.addEventListener('click', () => {
  supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + window.location.pathname },
  });
});

btnLogout?.addEventListener('click', async () => {
  await supabase.auth.signOut();
  window.location.reload();
});

btnRefresh?.addEventListener('click', loadPortalData);
btnPendingCheck?.addEventListener('click', loadPortalData);

window.__COMPANY_PORTAL_VERSION__ = COMPANY_PORTAL_VERSION;

supabase.auth.getSession().then(({ data }) => handleSession(data.session));
supabase.auth.onAuthStateChange((_event, session) => {
  if (session?.user && !state.user) handleSession(session);
});
