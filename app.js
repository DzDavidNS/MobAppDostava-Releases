import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://piylbcgjwpxjumqjhnyt.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBpeWxiY2dqd3B4anVtcWpobnl0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM5NDExNDcsImV4cCI6MjEwOTUxNzE0N30.mlz0jucAAHlrZ0V-DqdpLMWBs9qC4KPGFH7TCkWVJCQ';
const ADMIN_FALLBACK_EMAIL = 'dzambic@gmail.com';
const DEFAULT_OFFER_TIMEOUT_MS = 45_000;
const DISPATCH_WEB_VERSION = 'dispatch-web v0.5.28';
const COURIER_STANDBY_MS = 90_000;      // 90s bez novog GPS/heartbeat-a -> Na čekanju (i dalje dostupan)
const COURIER_OFFLINE_MS = 30 * 60_000; // 30 min bez ikakvog signala (ili is_online=false) -> Van mreže
const MAX_DEBUG_LOGS = 300;
const WORKSPACES_STORAGE_KEY = 'flash_dispatch_workspaces_v2';
const FEED_STORAGE_KEY = 'flash_dispatch_feed_v1';
const MAX_FEED_ITEMS = 150;

const debugLogs = [];
function dispatchLog(tag, message) {
  const now = new Date();
  const ts = now.toTimeString().slice(0, 8) + '.' + String(now.getMilliseconds()).padStart(3, '0');
  const line = `[${ts}] [${tag}] ${message}`;
  debugLogs.push(line);
  if (debugLogs.length > MAX_DEBUG_LOGS) debugLogs.shift();
}

window.addEventListener('error', (ev) => {
  dispatchLog('ERROR', `${ev.message} (${ev.filename || ''}:${ev.lineno || 0})`);
});
window.addEventListener('unhandledrejection', (ev) => {
  const reason = ev.reason?.message || String(ev.reason || 'Unhandled rejection');
  dispatchLog('ERROR', `Promise: ${reason}`);
});

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const state = {
  user: null,
  isAdmin: false,
  couriers: new Map(),
  orders: [],
  places: [],
  selectedPickup: { name: null, address: '', lat: 0, lng: 0 },
  waypoints: [],
  selectedDelivery: { address: '', lat: 0, lng: 0 },
  courierMarkers: new Map(),
  orderMarkers: new Map(),
  selectedCourierId: null,
  selectedRouteLayer: null,
  draftRouteLayer: null,
  osrmCache: new Map(),
  osrmInflight: new Map(),
  courierTripEta: new Map(),
  draftEtaSummary: null,
  selectedEtaSections: [],
  orderFilters: {
    waiting: { search: '', source: '' },
    active: { search: '', source: '', courierId: '' },
    history: { search: '', source: '', courierId: '', status: '', dateRange: 'all' },
  },
  badgeCounts: { couriers: 0, feed: 0, waiting: 0, active: 0, history: 0 },
  realtimeStarted: false,
  placesUnavailable: false,
  expiredHandled: new Set(),
  editingVoiceTrip: null,
  feedEvents: [],
  feedFilterSelectedOnly: false,
  feedInitialized: false,
  prevCouriersSnapshot: new Map(),
  prevOrdersSnapshot: new Map(),
  feedDedupeMap: new Map(),
  workspaceStore: null,
  layout: null,
};

// --- DOM Elements ---
const authOverlay = document.getElementById('auth-overlay');
const appShell = document.getElementById('app-shell');
const authStatus = document.getElementById('auth-status');
const btnGoogleLogin = document.getElementById('btn-google-login');
const btnLogoutDenied = document.getElementById('btn-logout-denied');
const btnLogout = document.getElementById('btn-logout');
const btnRefresh = document.getElementById('btn-refresh');
const operatorEmailEl = document.getElementById('operator-email');
const realtimePill = document.getElementById('realtime-pill');
const couriersListEl = document.getElementById('couriers-list');
const couriersOnlineCountEl = document.getElementById('couriers-online-count');
const ordersWaitingListEl = document.getElementById('orders-waiting-list');
const ordersActiveListEl = document.getElementById('orders-active-list');
const ordersHistoryListEl = document.getElementById('orders-history-list');
const ordersUnassignedCountEl = document.getElementById('orders-unassigned-count');
const ordersCountEl = document.getElementById('orders-count');
const ordersHistoryCountEl = document.getElementById('orders-history-count');
const filterWaitingSearchEl = document.getElementById('filter-waiting-search');
const filterWaitingSourceEl = document.getElementById('filter-waiting-source');
const btnResetWaitingFilters = document.getElementById('btn-reset-waiting-filters');
const waitingFilterInfoEl = document.getElementById('waiting-filter-info');
const filterActiveSearchEl = document.getElementById('filter-active-search');
const filterActiveSourceEl = document.getElementById('filter-active-source');
const filterActiveCourierEl = document.getElementById('filter-active-courier');
const btnResetActiveFilters = document.getElementById('btn-reset-active-filters');
const activeFilterInfoEl = document.getElementById('active-filter-info');
const filterHistorySearchEl = document.getElementById('filter-history-search');
const filterHistorySourceEl = document.getElementById('filter-history-source');
const filterHistoryCourierEl = document.getElementById('filter-history-courier');
const filterHistoryStatusEl = document.getElementById('filter-history-status');
const filterHistoryDateEl = document.getElementById('filter-history-date');
const btnResetHistoryFilters = document.getElementById('btn-reset-history-filters');
const historyFilterInfoEl = document.getElementById('history-filter-info');
const unassignedPillEl = document.getElementById('unassigned-pill');
const unassignedPillCountEl = document.getElementById('unassigned-pill-count');
const courierSelectEl = document.getElementById('courier-select');
const orderForm = document.getElementById('order-form');
const editOrderIdInput = document.getElementById('edit-order-id');
const formTitleEl = document.getElementById('form-title');
const btnResetForm = document.getElementById('btn-reset-form');
const btnSubmitOrder = document.getElementById('btn-submit-order');
const btnSaveUnassigned = document.getElementById('btn-save-unassigned');
const pickupInput = document.getElementById('pickup-input');
const pickupSuggestions = document.getElementById('pickup-suggestions');
const deliveryInput = document.getElementById('delivery-input');
const deliverySuggestions = document.getElementById('delivery-suggestions');
const goodsInput = document.getElementById('goods-input');
const paymentSelect = document.getElementById('payment-select');
const clientTypeSelect = document.getElementById('client-type-select');
const tariffSelect = document.getElementById('tariff-select');
const btnAddWaypoint = document.getElementById('btn-add-waypoint');
const waypointsContainer = document.getElementById('waypoints-container');
const phoneInput = document.getElementById('phone-input');
const notesInput = document.getElementById('notes-input');
const noAutoExpireCheckbox = document.getElementById('no-auto-expire');
const btnOpenUsers = document.getElementById('btn-open-users');
const usersModal = document.getElementById('users-modal');
const btnRefreshUsers = document.getElementById('btn-refresh-users');
const btnCloseUsers = document.getElementById('btn-close-users');
const tabUsersStaffEl = document.getElementById('tab-users-staff');
const tabUsersCompaniesEl = document.getElementById('tab-users-companies');
const companiesPendingCountEl = document.getElementById('companies-pending-count');
const usersStaffPaneEl = document.getElementById('users-staff-pane');
const usersCompaniesPaneEl = document.getElementById('users-companies-pane');
const usersStatusEl = document.getElementById('users-status');
const usersListEl = document.getElementById('users-list');
const companiesStatusEl = document.getElementById('companies-status');
const companiesListEl = document.getElementById('companies-list');
const btnOpenDebug = document.getElementById('btn-open-debug');
const debugModal = document.getElementById('debug-modal');
const btnCloseDebug = document.getElementById('btn-close-debug');
const debugCategoryEl = document.getElementById('debug-category');
const debugCommentEl = document.getElementById('debug-comment');
const debugIncludeLogsEl = document.getElementById('debug-include-logs');
const debugLogCountEl = document.getElementById('debug-log-count');
const debugLogPreviewEl = document.getElementById('debug-log-preview');
const debugSendStatusEl = document.getElementById('debug-send-status');
const btnCopyDebugLog = document.getElementById('btn-copy-debug-log');
const btnSendDebugReport = document.getElementById('btn-send-debug-report');
const routeEtaOverlayEl = document.getElementById('route-eta-overlay');
const workspacePresetsBarEl = document.getElementById('workspace-presets-bar');
const btnSaveWorkspace = document.getElementById('btn-save-workspace');
const btnLayoutMenu = document.getElementById('btn-layout-menu');
const layoutMenuEl = document.getElementById('layout-menu');
const togglePanelCouriersEl = document.getElementById('toggle-panel-couriers');
const togglePanelFeedEl = document.getElementById('toggle-panel-feed');
const togglePanelOrderFormEl = document.getElementById('toggle-panel-orderForm');
const togglePanelWaitingEl = document.getElementById('toggle-panel-waiting');
const togglePanelActiveEl = document.getElementById('toggle-panel-active');
const togglePanelHistoryEl = document.getElementById('toggle-panel-history');
const toggleOverlayEtaEl = document.getElementById('toggle-overlay-eta');
const toggleOverlayLegendEl = document.getElementById('toggle-overlay-legend');
const btnWorkspaceSaveAs = document.getElementById('btn-workspace-save-as');
const btnWorkspaceUpdate = document.getElementById('btn-workspace-update');
const btnWorkspaceDelete = document.getElementById('btn-workspace-delete');
const btnWorkspaceExport = document.getElementById('btn-workspace-export');
const btnWorkspaceImport = document.getElementById('btn-workspace-import');
const workspaceImportFileEl = document.getElementById('workspace-import-file');
const btnDockAll = document.getElementById('btn-dock-all');
const btnResetLayout = document.getElementById('btn-reset-layout');
const bspWorkspaceEl = document.getElementById('bsp-workspace');
const panelPoolEl = document.getElementById('panel-pool');
const dockDropOverlayEl = document.getElementById('dock-drop-overlay');
const dockDropPreviewEl = document.getElementById('dock-drop-preview');
const dockDropLabelEl = document.getElementById('dock-drop-label');
const dragGhostEl = document.getElementById('drag-ghost');
const floatingLayerEl = document.getElementById('floating-layer');
const mapLegendEl = document.getElementById('map-legend');
const panelMapEl = document.getElementById('panel-map');
const panelCouriersEl = document.getElementById('panel-couriers');
const panelFeedEl = document.getElementById('panel-feed');
const panelOrderFormEl = document.getElementById('panel-orderForm');
const panelWaitingEl = document.getElementById('panel-waiting');
const panelActiveEl = document.getElementById('panel-active');
const panelHistoryEl = document.getElementById('panel-history');
const liveFeedListEl = document.getElementById('live-feed-list');
const liveFeedCountEl = document.getElementById('live-feed-count');
const btnFeedFilter = document.getElementById('btn-feed-filter');
const btnFeedClear = document.getElementById('btn-feed-clear');

// --- Map Initialization ---
const map = L.map('map').setView([45.255, 19.845], 13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap',
}).addTo(map);
state.selectedRouteLayer = L.layerGroup().addTo(map);
state.draftRouteLayer = L.layerGroup().addTo(map);

const mapContainerEl = document.getElementById('map');
if (mapContainerEl && typeof ResizeObserver !== 'undefined') {
  let mapResizeRaf = 0;
  new ResizeObserver(() => {
    cancelAnimationFrame(mapResizeRaf);
    mapResizeRaf = requestAnimationFrame(() => map.invalidateSize());
  }).observe(mapContainerEl);
}

let mapPickSeq = 0;
let draftRouteSeq = 0;
let selectedRouteSeq = 0;

function haversineMeters(a, b) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const x = sinLat * sinLat + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * sinLng * sinLng;
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(Math.max(0, 1 - x)));
}

function vehicleEtaFactor(vehicleType) {
  switch ((vehicleType || 'CAR').toUpperCase()) {
    case 'BIKE':
    case 'BICYCLE':
      return 1.55;
    case 'SCOOTER':
    case 'MOTO':
    case 'MOTORCYCLE':
      return 1.00;
    default:
      return 1.15;
  }
}

function formatDistanceKm(meters) {
  const m = Number(meters || 0);
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
}

function formatEtaMin(seconds) {
  return `${Math.max(1, Math.round(Number(seconds || 0) / 60))} min`;
}

function formatArrivalClock(secondsFromNow) {
  const dt = new Date(Date.now() + Number(secondsFromNow || 0) * 1000);
  return dt.toTimeString().slice(0, 5);
}

function buildOsrmCacheKey(points, vehicleType) {
  const rounded = points.map((pt) => `${Number(pt[0]).toFixed(4)},${Number(pt[1]).toFixed(4)}`).join(';');
  return `${vehicleEtaFactor(vehicleType)}|${rounded}`;
}

function getCachedOsrmRoute(points, vehicleType) {
  if (!Array.isArray(points) || points.length < 2) return null;
  return state.osrmCache.get(buildOsrmCacheKey(points, vehicleType)) || null;
}

function buildFallbackOsrmRoute(points, vehicleType) {
  const factor = vehicleEtaFactor(vehicleType);
  const legs = [];
  let totalDistance = 0;
  let totalDuration = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const dist = haversineMeters(points[i], points[i + 1]) * 1.32;
    const dur = (dist / (28000 / 3600)) * factor;
    legs.push({ distance: dist, duration: dur });
    totalDistance += dist;
    totalDuration += dur;
  }
  return {
    latLngs: points.map((p) => [Number(p[0]), Number(p[1])]),
    distance: totalDistance,
    duration: totalDuration,
    legs,
    isFallback: true,
  };
}

async function fetchOsrmRoute(points, vehicleType) {
  if (!Array.isArray(points) || points.length < 2) return null;
  const key = buildOsrmCacheKey(points, vehicleType);
  const cached = state.osrmCache.get(key);
  if (cached) return cached;
  if (state.osrmInflight.has(key)) return state.osrmInflight.get(key);

  const coordStr = points.map((p) => `${Number(p[1])},${Number(p[0])}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson&steps=false`;
  const factor = vehicleEtaFactor(vehicleType);

  const promise = (async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const route = data?.routes?.[0];
      const coords = route?.geometry?.coordinates;
      if (!route || !Array.isArray(coords) || coords.length < 2) {
        throw new Error('Empty OSRM geometry');
      }
      const legs = (Array.isArray(route.legs) ? route.legs : []).map((l) => ({
        distance: Number(l.distance || 0),
        duration: Number(l.duration || 0) * factor,
      }));
      const totalDistance = Number(route.distance || legs.reduce((s, l) => s + l.distance, 0));
      const totalDuration = legs.length
        ? legs.reduce((s, l) => s + l.duration, 0)
        : Number(route.duration || 0) * factor;
      const result = {
        latLngs: coords.map((c) => [c[1], c[0]]),
        distance: totalDistance,
        duration: totalDuration,
        legs,
        isFallback: false,
      };
      if (state.osrmCache.size >= 150) {
        const oldestKey = state.osrmCache.keys().next().value;
        if (oldestKey) state.osrmCache.delete(oldestKey);
      }
      state.osrmCache.set(key, result);
      return result;
    } catch (_) {
      return buildFallbackOsrmRoute(points, vehicleType);
    } finally {
      clearTimeout(timeoutId);
      state.osrmInflight.delete(key);
    }
  })();

  state.osrmInflight.set(key, promise);
  return promise;
}

function buildEtaSummary(title, legStops, routeRes, isDraft = false) {
  const legs = [];
  for (let i = 0; i < legStops.length - 1; i++) {
    const legData = routeRes.legs?.[i];
    const dist = legData ? legData.distance : haversineMeters(legStops[i].pt, legStops[i + 1].pt) * 1.32;
    const dur = legData ? legData.duration : dist / (28000 / 3600);
    legs.push({
      from: legStops[i].label,
      to: legStops[i + 1].label,
      distanceM: dist,
      durationS: dur,
    });
  }
  return {
    title,
    isDraft,
    totalDistanceM: routeRes.distance,
    totalDurationS: routeRes.duration,
    legs,
    isFallback: Boolean(routeRes.isFallback),
  };
}

function drawStreetPolyline(layerGroup, latLngs, strokeColor, isPlaceholder) {
  if (!Array.isArray(latLngs) || latLngs.length < 2) return;
  if (isPlaceholder) {
    L.polyline(latLngs, {
      color: strokeColor,
      weight: 3,
      opacity: 0.6,
      dashArray: '6, 6',
    }).addTo(layerGroup);
    return;
  }
  L.polyline(latLngs, {
    color: '#0b0e14',
    weight: 6.5,
    opacity: 0.85,
  }).addTo(layerGroup);
  L.polyline(latLngs, {
    color: strokeColor,
    weight: 3.5,
    opacity: 0.95,
  }).addTo(layerGroup);
}

function renderRouteEtaOverlay() {
  if (!routeEtaOverlayEl) return;
  if (state.layout && state.layout.overlays && state.layout.overlays.eta === false) {
    routeEtaOverlayEl.classList.add('hidden');
    return;
  }
  const sections = [...(state.selectedEtaSections || [])];
  if (state.draftEtaSummary) sections.push(state.draftEtaSummary);

  if (!sections.length) {
    routeEtaOverlayEl.classList.add('hidden');
    routeEtaOverlayEl.innerHTML = '';
    return;
  }

  routeEtaOverlayEl.innerHTML = sections
    .map((sec) => {
      const approx = sec.isFallback ? ' <span class="eta-approx">(procena)</span>' : '';
      const legsHtml = sec.legs
        .map(
          (l) => `
          <div class="eta-leg-row">
            <span class="eta-leg-label">${escapeHtml(l.from)} → ${escapeHtml(l.to)}</span>
            <span class="eta-leg-val">${formatEtaMin(l.durationS)} • ${formatDistanceKm(l.distanceM)}</span>
          </div>`
        )
        .join('');
      return `
        <div class="eta-section">
          <div class="eta-head">
            <span class="eta-title">${escapeHtml(sec.title)}${approx}</span>
            <span class="eta-total-pill ${sec.isDraft ? 'draft' : ''}">~${formatEtaMin(sec.totalDurationS)} • ${formatDistanceKm(sec.totalDistanceM)}</span>
          </div>
          <div class="eta-approx">Procenjeni završetak ~${formatArrivalClock(sec.totalDurationS)}</div>
          <div class="eta-legs-list">${legsHtml}</div>
        </div>
      `;
    })
    .join('');
  routeEtaOverlayEl.classList.remove('hidden');
}

function formatTripEtaBarHtml(etaInfo) {
  if (!etaInfo || !etaInfo.legs || !etaInfo.legs.length) return '';
  const approxMark = etaInfo.isFallback ? ' (proc.)' : '';
  const legsHtml = etaInfo.legs
    .map(
      (l) => `<div class="trip-eta-leg"><span>${escapeHtml(l.from)} → ${escapeHtml(l.to)}</span><span>${formatEtaMin(l.durationS)} • ${formatDistanceKm(l.distanceM)}</span></div>`
    )
    .join('');
  return `
    <div class="trip-eta-head">
      <span>⏱️ Putanja${approxMark}: <b>~${formatEtaMin(etaInfo.totalDurationS)}</b> (${formatDistanceKm(etaInfo.totalDistanceM)})</span>
      <span class="muted">kraj ~${formatArrivalClock(etaInfo.totalDurationS)}</span>
    </div>
    <div class="trip-eta-legs">${legsHtml}</div>
  `;
}

function updateCourierCardEtaDom(courierId) {
  if (!couriersListEl || !courierId) return;
  couriersListEl.querySelectorAll('.trip-eta-bar').forEach((el) => {
    const key = el.getAttribute('data-eta-key') || '';
    if (!key.startsWith(`${courierId}:`)) return;
    const etaInfo = state.courierTripEta.get(key);
    if (etaInfo) {
      el.innerHTML = formatTripEtaBarHtml(etaInfo);
      el.classList.remove('hidden');
    } else {
      el.innerHTML = '';
      el.classList.add('hidden');
    }
  });
}

function isMinorPoiType(osmKey, osmValue) {
  const k = String(osmKey || '').toLowerCase();
  const v = String(osmValue || '').toLowerCase();
  if (['highway', 'landuse', 'natural', 'boundary', 'waterway'].includes(k)) return true;
  if (k === 'place' && ['postcode', 'suburb', 'quarter', 'neighbourhood', 'city', 'town', 'village', 'house'].includes(v)) return true;
  if (k === 'building' && (!v || v === 'yes' || v === 'house' || v === 'apartments' || v === 'residential')) return true;
  return [
    'atm', 'vending_machine', 'parcel_locker', 'waste_basket', 'bench',
    'bicycle_parking', 'parking_entrance', 'toilets', 'post_box', 'recycling',
    'charging_station', 'house', 'postcode',
  ].includes(v);
}

function isMeaningfulPoi(osmKey, osmValue) {
  const k = String(osmKey || '').toLowerCase();
  const v = String(osmValue || '').toLowerCase();
  if (!k || isTransitStop(k, v) || isMinorPoiType(k, v)) return false;
  return ['shop', 'amenity', 'office', 'healthcare', 'tourism', 'leisure', 'craft', 'club'].includes(k)
    || (k === 'building' && ['supermarket', 'retail', 'commercial', 'hospital', 'school', 'university', 'hotel'].includes(v));
}

function poiCategoryIcon(osmKey, osmValue) {
  const v = String(osmValue || '').toLowerCase();
  const k = String(osmKey || '').toLowerCase();
  if (['supermarket', 'convenience', 'mall', 'department_store', 'greengrocer', 'bakery', 'butcher'].includes(v) || k === 'shop') return '🛒';
  if (['restaurant', 'fast_food', 'cafe', 'bar', 'pub', 'ice_cream'].includes(v)) return '🍽️';
  if (['pharmacy', 'clinic', 'hospital', 'doctors', 'dentist'].includes(v) || k === 'healthcare') return '💊';
  if (['bank', 'post_office', 'atm'].includes(v)) return '🏦';
  return '🏢';
}

function isAnchorPoiValue(osmValue) {
  return ['supermarket', 'mall', 'department_store', 'hospital', 'clinic', 'school', 'university'].includes(
    String(osmValue || '').toLowerCase()
  );
}

async function reverseGeocode(lat, lng) {
  const fallbackAddr = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  const nomPromise = fetch(
    `https://nominatim.openstreetmap.org/reverse?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&format=jsonv2&addressdetails=1`
  )
    .then((res) => (res.ok ? res.json() : null))
    .catch(() => null);

  const photonPromise = fetch(
    `https://photon.komoot.io/reverse?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&radius=0.075&limit=20`
  )
    .then((res) => (res.ok ? res.json() : null))
    .catch(() => null);

  const [nomData, photonData] = await Promise.all([nomPromise, photonPromise]);

  let baseAddress = fallbackAddr;
  if (nomData?.address) {
    const a = nomData.address;
    const road = a.road || a.pedestrian || a.footway || '';
    const num = a.house_number ? ` ${a.house_number}` : '';
    const city = a.city || a.town || a.village || 'Novi Sad';
    if (road) baseAddress = `${road}${num}, ${city}`.trim();
  }

  const rawCandidates = [];
  const pushCandidate = (cand) => {
    if (!cand || !cand.name) return;
    if (cand.distMeters > 75) return;
    rawCandidates.push(cand);
  };

  // 1. Lokalna baza poznatih lokala/firmi (shared_delivery_places) u blizini klika
  for (const p of state.places || []) {
    const pLat = Number(p.latitude || 0);
    const pLng = Number(p.longitude || 0);
    if (!pLat || !pLng || !p.name) continue;
    const distMeters = haversineMeters([lat, lng], [pLat, pLng]);
    if (distMeters <= 65) {
      pushCandidate({
        name: p.name,
        address: p.official_address || baseAddress,
        lat: pLat,
        lng: pLng,
        icon: '⭐',
        distMeters,
        effectiveDist: distMeters - 8,
        isMinor: false,
      });
    }
  }

  // 2. Photon reverse (hvata way poligone kao npr. Univerexport i sve lokale u zgradi)
  for (const f of photonData?.features || []) {
    const props = f?.properties || {};
    const coords = f?.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) continue;
    const pLat = Number(coords[1]);
    const pLng = Number(coords[0]);
    const street = props.street || '';
    const num = props.housenumber ? ` ${props.housenumber}` : '';
    const city = props.city || 'Novi Sad';
    const featureAddr = street ? `${street}${num}, ${city}`.trim() : baseAddress;
    if (baseAddress === fallbackAddr && street) {
      baseAddress = featureAddr;
    }

    const k = props.osm_key;
    const v = props.osm_value;
    if (!props.name || isTransitStop(k, v)) continue;
    const minor = isMinorPoiType(k, v);
    const meaningful = isMeaningfulPoi(k, v);
    if (!meaningful && !minor) continue;
    if (['highway', 'landuse', 'natural', 'boundary', 'waterway'].includes(String(k || '').toLowerCase()) || v === 'postcode') continue;

    const distMeters = haversineMeters([lat, lng], [pLat, pLng]);
    const anchorBonus = isAnchorPoiValue(v) ? 6 : 0;
    pushCandidate({
      name: props.name,
      address: featureAddr,
      lat: pLat,
      lng: pLng,
      icon: poiCategoryIcon(k, v),
      distMeters,
      effectiveDist: distMeters + (minor ? 55 : 0) - anchorBonus,
      isMinor: minor,
    });
  }

  // 3. Nominatim reverse rezultat kao dopunski kandidat
  if (nomData?.name) {
    const k = nomData.class || nomData.category;
    const v = nomData.type;
    const minor = isMinorPoiType(k, v);
    if (!isTransitStop(k, v) && (isMeaningfulPoi(k, v) || minor) && v !== 'postcode') {
      const pLat = Number(nomData.lat || lat);
      const pLng = Number(nomData.lon || lng);
      const distMeters = haversineMeters([lat, lng], [pLat, pLng]);
      const anchorBonus = isAnchorPoiValue(v) ? 6 : 0;
      pushCandidate({
        name: nomData.name,
        address: baseAddress,
        lat: pLat,
        lng: pLng,
        icon: poiCategoryIcon(k, v),
        distMeters,
        effectiveDist: distMeters + (minor ? 55 : 0) - anchorBonus,
        isMinor: minor,
      });
    }
  }

  rawCandidates.sort((a, b) => a.effectiveDist - b.effectiveDist);

  const seenNames = new Set();
  const candidates = [];
  for (const c of rawCandidates) {
    const key = String(c.name || '').trim().toLowerCase();
    if (!key || seenNames.has(key)) continue;
    seenNames.add(key);
    candidates.push(c);
    if (candidates.length >= 6) break;
  }

  const bestPoi = candidates.find((c) => !c.isMinor && c.distMeters <= 45)
    || candidates.find((c) => c.distMeters <= 30)
    || null;

  const addrOption = {
    name: null,
    address: baseAddress,
    lat,
    lng,
    icon: '📍',
    distMeters: 0,
    effectiveDist: 999,
    isMinor: false,
  };
  const allOptions = [...candidates, addrOption];
  const primary = bestPoi || addrOption;

  return {
    name: primary.name,
    address: primary.address,
    lat: primary.lat,
    lng: primary.lng,
    primary,
    candidates: allOptions,
    baseAddress,
  };
}

function renderDraftRoutePreview() {
  if (!state.draftRouteLayer) return;
  const seq = ++draftRouteSeq;
  state.draftRouteLayer.clearLayers();
  const draftStops = [];

  const p = state.selectedPickup;
  if (p && Number(p.lat) && Number(p.lng)) {
    const pPt = [Number(p.lat), Number(p.lng)];
    const pTitle = p.name || (p.address || '').split(',')[0] || 'Preuzimanje';
    draftStops.push({ label: `P (${pTitle})`, pt: pPt });
    L.circleMarker(pPt, {
      radius: 8,
      color: '#ffca28',
      weight: 2.5,
      fillColor: '#ff9800',
      fillOpacity: 0.95,
    })
      .bindTooltip(`P (Nacrt): ${pTitle}`, { permanent: true, direction: 'top', className: 'pin-label', offset: [0, -6] })
      .addTo(state.draftRouteLayer);
  }

  state.waypoints.forEach((wp, idx) => {
    if (Number(wp.lat) && Number(wp.lng)) {
      const wPt = [Number(wp.lat), Number(wp.lng)];
      const wTitle = (wp.address || '').split(',')[0] || `Stajanje #${idx + 1}`;
      draftStops.push({ label: `S${idx + 1} (${wTitle})`, pt: wPt });
      L.circleMarker(wPt, {
        radius: 7,
        color: '#ffca28',
        weight: 2.5,
        fillColor: '#ab47bc',
        fillOpacity: 0.95,
      })
        .bindTooltip(`S${idx + 1} (Nacrt): ${wTitle}`, { permanent: true, direction: 'top', className: 'pin-label', offset: [0, -6] })
        .addTo(state.draftRouteLayer);
    }
  });

  const d = state.selectedDelivery;
  if (d && Number(d.lat) && Number(d.lng)) {
    const dPt = [Number(d.lat), Number(d.lng)];
    const dTitle = (d.address || '').split(',')[0] || 'Dostava';
    draftStops.push({ label: `D (${dTitle})`, pt: dPt });
    L.circleMarker(dPt, {
      radius: 8,
      color: '#ffca28',
      weight: 2.5,
      fillColor: '#ef5350',
      fillOpacity: 0.95,
    })
      .bindTooltip(`D (Nacrt): ${dTitle}`, { permanent: true, direction: 'top', className: 'pin-label', offset: [0, -6] })
      .addTo(state.draftRouteLayer);
  }

  if (draftStops.length < 2) {
    state.draftEtaSummary = null;
    renderRouteEtaOverlay();
    return;
  }

  const pts = draftStops.map((s) => s.pt);
  const lineGroup = L.layerGroup().addTo(state.draftRouteLayer);
  const cached = getCachedOsrmRoute(pts, null);
  if (cached) {
    drawStreetPolyline(lineGroup, cached.latLngs, '#ffca28', cached.isFallback);
    state.draftEtaSummary = buildEtaSummary('📝 Nacrt rute', draftStops, cached, true);
    renderRouteEtaOverlay();
  } else {
    drawStreetPolyline(lineGroup, pts, '#ffca28', true);
    fetchOsrmRoute(pts, null).then((routeRes) => {
      if (seq !== draftRouteSeq || !routeRes) return;
      lineGroup.clearLayers();
      drawStreetPolyline(lineGroup, routeRes.latLngs, '#ffca28', routeRes.isFallback);
      state.draftEtaSummary = buildEtaSummary('📝 Nacrt rute', draftStops, routeRes, true);
      renderRouteEtaOverlay();
    });
  }
}

function openMapPickPopup(lat, lng) {
  const seq = ++mapPickSeq;
  let resolved = {
    name: null,
    address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
    lat,
    lng,
  };

  const wrap = document.createElement('div');
  wrap.className = 'map-pick-popup';
  wrap.innerHTML = `
    <div class="map-pick-addr">Tražim adresu...</div>
    <div class="map-pick-coords">${lat.toFixed(5)}, ${lng.toFixed(5)}</div>
    <div class="map-pick-candidates hidden"></div>
    <div class="map-pick-actions">
      <button type="button" class="map-pick-btn pickup">🟠 Preuzimanje (P)</button>
      <button type="button" class="map-pick-btn waypoint">🟣 Usputno stajanje (S)</button>
      <button type="button" class="map-pick-btn delivery">🔴 Dostava (D)</button>
    </div>
  `;

  const addrEl = wrap.querySelector('.map-pick-addr');
  const coordsEl = wrap.querySelector('.map-pick-coords');
  const candidatesEl = wrap.querySelector('.map-pick-candidates');

  const applySelection = (opt) => {
    resolved = {
      name: opt.name || null,
      address: opt.address,
      lat: opt.lat,
      lng: opt.lng,
    };
    if (addrEl) {
      addrEl.textContent = resolved.name ? `${resolved.name} — ${resolved.address}` : resolved.address;
    }
    if (coordsEl) {
      coordsEl.textContent = `${Number(resolved.lat).toFixed(5)}, ${Number(resolved.lng).toFixed(5)}`;
    }
  };

  wrap.querySelector('.map-pick-btn.pickup')?.addEventListener('click', () => {
    state.selectedPickup = {
      name: resolved.name || null,
      address: resolved.address,
      lat: resolved.lat,
      lng: resolved.lng,
    };
    pickupInput.value = resolved.name ? `${resolved.name}, ${resolved.address}` : resolved.address;
    renderDraftRoutePreview();
    map.closePopup();
  });
  wrap.querySelector('.map-pick-btn.waypoint')?.addEventListener('click', () => {
    const label = resolved.name ? `${resolved.name}, ${resolved.address}` : resolved.address;
    state.waypoints.push({
      address: label,
      pickedLabel: label,
      lat: resolved.lat,
      lng: resolved.lng,
      surcharge: 80,
      goodsCost: 0,
      note: resolved.name || '',
    });
    renderWaypointsEditor();
    renderDraftRoutePreview();
    map.closePopup();
  });
  wrap.querySelector('.map-pick-btn.delivery')?.addEventListener('click', () => {
    const label = resolved.name ? `${resolved.name}, ${resolved.address}` : resolved.address;
    state.selectedDelivery = {
      address: label,
      lat: resolved.lat,
      lng: resolved.lng,
    };
    deliveryInput.value = label;
    renderDraftRoutePreview();
    map.closePopup();
  });

  L.popup({ closeOnClick: true, maxWidth: 300, autoPan: false })
    .setLatLng([lat, lng])
    .setContent(wrap)
    .openOn(map);

  reverseGeocode(lat, lng).then((res) => {
    if (seq !== mapPickSeq) return;
    applySelection(res.primary || res);
    const options = Array.isArray(res.candidates) ? res.candidates : [];
    if (candidatesEl && options.length > 1) {
      candidatesEl.innerHTML = '';
      options.forEach((opt) => {
        const chip = document.createElement('button');
        chip.type = 'button';
        const isCurrent = (opt.name || null) === (resolved.name || null) && opt.address === resolved.address;
        chip.className = `map-pick-chip${isCurrent ? ' active' : ''}`;
        const label = opt.name || 'Samo adresa';
        const meta = opt.name && opt.distMeters > 0 ? `<span class="map-pick-chip-meta">${Math.round(opt.distMeters)}m</span>` : '';
        chip.innerHTML = `${escapeHtml(opt.icon || '📍')} <span>${escapeHtml(label)}</span>${meta}`;
        chip.addEventListener('click', (e) => {
          L.DomEvent.stopPropagation(e);
          applySelection(opt);
          candidatesEl.querySelectorAll('.map-pick-chip').forEach((el) => el.classList.remove('active'));
          chip.classList.add('active');
        });
        candidatesEl.appendChild(chip);
      });
      candidatesEl.classList.remove('hidden');
    }
  });
}

map.on('click', (ev) => {
  openMapPickPopup(ev.latlng.lat, ev.latlng.lng);
});

function playAlertBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 660;
    gain.gain.value = 0.08;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    setTimeout(() => { osc.stop(); ctx.close(); }, 220);
  } catch (_) {}
}

function escapeHtml(val) {
  return String(val ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function vehicleLabel(type) {
  switch ((type || 'CAR').toUpperCase()) {
    case 'SCOOTER':
    case 'MOTO':
    case 'MOTORCYCLE':
      return '🛵 Skuter';
    case 'BIKE':
    case 'BICYCLE':
      return '🚲 Bicikl';
    default:
      return '🚗 Auto';
  }
}

function renderTripStepperHtml(status, hasWaypoints) {
  const st = (status || 'IDLE').toUpperCase();
  let stage = 0;
  if (st === 'EN_ROUTE_WAYPOINT' || st === 'AT_WAYPOINT') stage = 1;
  else if (st === 'EN_ROUTE_CUSTOMER' || st === 'AT_CUSTOMER') stage = 2;
  else if (st === 'COMPLETED') stage = 3;

  const steps = hasWaypoints
    ? [
        { label: 'Preuzimanje', idx: 0 },
        { label: 'Stajanja', idx: 1 },
        { label: 'Dostava', idx: 2 },
      ]
    : [
        { label: 'Preuzimanje', idx: 0 },
        { label: 'Dostava', idx: 2 },
      ];
  return `<div class="trip-stepper">${steps
    .map((s) => {
      const cls = stage > s.idx ? 'done' : stage === s.idx ? 'active' : 'pending';
      const icon = cls === 'done' ? '✓ ' : cls === 'active' ? '● ' : '';
      return `<span class="step-chip ${cls}">${icon}${s.label}</span>`;
    })
    .join('')}</div>`;
}

function courierStatusMeta(status) {
  switch ((status || 'IDLE').toUpperCase()) {
    case 'EN_ROUTE_PICKUP':
    case 'AT_PICKUP':
      return { label: status === 'AT_PICKUP' ? 'U lokalu' : 'Po robu', badge: 'badge-orange', color: '#ff9800' };
    case 'EN_ROUTE_WAYPOINT':
    case 'AT_WAYPOINT':
    case 'EN_ROUTE_CUSTOMER':
    case 'AT_CUSTOMER':
      return { label: status === 'AT_CUSTOMER' ? 'Kod kupca' : 'Ka kupcu', badge: 'badge-red', color: '#f44336' };
    case 'STANDBY':
      return { label: 'Na čekanju', badge: 'badge-standby', color: '#26c6da' };
    default:
      return { label: 'Slobodan', badge: 'badge-green', color: '#4caf50' };
  }
}

function dispatchBadgeMeta(order) {
  switch (order.dispatch_status) {
    case 'OFFERED': {
      if (order.no_auto_expire) return { text: 'Čeka prijem (bez isteka)', cls: 'badge-blue' };
      const expMs = order.offer_expires_at ? Date.parse(order.offer_expires_at) : 0;
      const remSec = Math.max(0, Math.ceil((expMs - Date.now()) / 1000));
      return { text: `Čeka prijem (${remSec}s)`, cls: 'badge-orange' };
    }
    case 'ACCEPTED': return { text: `Prihvaćeno (${order.trip_status || 'EN_ROUTE_PICKUP'})`, cls: 'badge-green' };
    case 'REJECTED': return { text: 'Odbijeno', cls: 'badge-red' };
    case 'EXPIRED': return { text: 'Isteklo (45s)', cls: 'badge-red' };
    case 'CANCELLED': return { text: 'Otkazano', cls: 'badge-gray' };
    case 'COMPLETED': return { text: 'Završeno', cls: 'badge-gray' };
    default: return { text: 'Čeka dodelu', cls: 'badge-blue' };
  }
}

function parseCourierTrips(courier) {
  if (!courier || !courier.active_trips_json) return [];
  try {
    const parsed = typeof courier.active_trips_json === 'string'
      ? JSON.parse(courier.active_trips_json)
      : courier.active_trips_json;
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function updateOrderSubmitButtonLabel() {
  if (!btnSubmitOrder) return;
  const isEditing = Boolean(editOrderIdInput?.value || state.editingVoiceTrip);
  if (btnSaveUnassigned) {
    btnSaveUnassigned.classList.toggle('hidden', isEditing);
  }
  if (isEditing) {
    btnSubmitOrder.textContent = 'Sačuvaj izmene';
    return;
  }
  btnSubmitOrder.textContent = courierSelectEl?.value ? 'Pošalji porudžbinu kuriru' : 'Sačuvaj kao nedodeljenu';
}

function selectCourier(userId, fitToRoute = true) {
  state.selectedCourierId = userId || null;
  courierSelectEl.value = state.selectedCourierId || '';
  updateOrderSubmitButtonLabel();
  renderCouriers();
  renderSelectedCourierRoute(fitToRoute);
  renderLiveFeed();
}

courierSelectEl.addEventListener('change', () => {
  updateOrderSubmitButtonLabel();
  selectCourier(courierSelectEl.value || null, true);
});

function renderSelectedCourierRoute(fitToBounds = false) {
  if (!state.selectedRouteLayer) return;
  const seq = ++selectedRouteSeq;
  state.selectedRouteLayer.clearLayers();
  state.selectedEtaSections = [];

  if (!state.selectedCourierId) {
    renderRouteEtaOverlay();
    return;
  }
  const courier = state.couriers.get(state.selectedCourierId);
  if (!courier || !isCourierEffectivelyOnline(courier)) {
    renderRouteEtaOverlay();
    if (fitToBounds && courier && courier.lat && courier.lng) {
      map.setView([courier.lat, courier.lng], 15);
    }
    return;
  }

  const trips = parseCourierTrips(courier);
  if (!trips.length) {
    renderRouteEtaOverlay();
    if (fitToBounds && courier.lat && courier.lng) {
      map.setView([courier.lat, courier.lng], 15);
      state.courierMarkers.get(courier.user_id)?.openPopup();
    }
    return;
  }

  const allLatLngs = [];
  const hasCourierGps = Boolean(courier.lat && courier.lng);
  if (hasCourierGps) {
    allLatLngs.push([courier.lat, courier.lng]);
  }

  const etaSections = new Array(trips.length).fill(null);

  trips.forEach((t, idx) => {
    const tag = idx + 1;
    const isVoice = t.source === 'voice' || !t.dispatch_order_id;
    const sourceLabel = isVoice ? '🎙️ Glasovno/Ručno' : '📡 Dispečer';
    const lineColor = isVoice ? '#26a69a' : '#29b6f6';
    const legStops = [];
    if (hasCourierGps) {
      legStops.push({ label: 'Kurir', pt: [courier.lat, courier.lng] });
    }

    const needsPickup = ['CALL_RECEIVED', 'EN_ROUTE_PICKUP', 'AT_PICKUP'].includes((t.status || '').toUpperCase());
    const pickupShort = t.partner_name || (t.pickup_address || '').split(',')[0] || `P${tag}`;
    if (t.pickup_lat && t.pickup_lng) {
      const pPt = [t.pickup_lat, t.pickup_lng];
      allLatLngs.push(pPt);
      if (needsPickup) legStops.push({ label: `P${tag}: ${pickupShort}`, pt: pPt });

      const pLabel = `P${tag}: ${pickupShort}`;
      L.circleMarker(pPt, {
        radius: 8,
        color: '#ffffff',
        weight: 2,
        fillColor: '#ff9800',
        fillOpacity: 0.95,
      })
        .bindTooltip(pLabel, { permanent: true, direction: 'top', className: 'pin-label', offset: [0, -6] })
        .bindPopup(
          `<b>Preuzimanje #${tag} (${sourceLabel})</b><br>${t.partner_name ? `<b>${t.partner_name}</b><br>` : ''}${t.pickup_address || ''}<br>Status: ${courierStatusMeta(t.status).label}`,
          { autoPan: false }
        )
        .addTo(state.selectedRouteLayer);
    }

    const wps = Array.isArray(t.waypoints) ? t.waypoints : [];
    wps.forEach((wp, wIdx) => {
      if (wp.lat && wp.lng) {
        const wPt = [wp.lat, wp.lng];
        const isVisited = Boolean(wp.is_visited);
        const wShort = (wp.address || '').split(',')[0] || `S${tag}.${wIdx + 1}`;
        allLatLngs.push(wPt);
        if (!isVisited) legStops.push({ label: `S${tag}.${wIdx + 1}: ${wShort}`, pt: wPt });
        const wLabel = `${isVisited ? '✓ ' : ''}S${tag}.${wIdx + 1}: ${wShort}`;
        L.circleMarker(wPt, {
          radius: 7,
          color: '#ffffff',
          weight: 2,
          fillColor: isVisited ? '#66bb6a' : '#ab47bc',
          fillOpacity: isVisited ? 0.65 : 0.95,
        })
          .bindTooltip(wLabel, { permanent: true, direction: 'top', className: 'pin-label', offset: [0, -6] })
          .bindPopup(
            `<b>Usputno stajanje #${tag}.${wIdx + 1}${isVisited ? ' (Posećeno)' : ''}</b><br>${wp.address || ''}${wp.note ? `<br>${wp.note}` : ''}${Number(wp.goods_cost || 0) > 0 ? `<br>Roba: ${Number(wp.goods_cost)} RSD` : ''}`,
            { autoPan: false }
          )
          .addTo(state.selectedRouteLayer);
      }
    });

    if (t.delivery_lat && t.delivery_lng) {
      const dPt = [t.delivery_lat, t.delivery_lng];
      const dShort = (t.delivery_address || '').split(',')[0] || `D${tag}`;
      allLatLngs.push(dPt);
      legStops.push({ label: `D${tag}: ${dShort}`, pt: dPt });

      const dLabel = `D${tag}: ${dShort}`;
      L.circleMarker(dPt, {
        radius: 8,
        color: '#ffffff',
        weight: 2,
        fillColor: isVoice ? '#26a69a' : '#ef5350',
        fillOpacity: 0.95,
      })
        .bindTooltip(dLabel, { permanent: true, direction: 'top', className: 'pin-label', offset: [0, -6] })
        .bindPopup(
          `<b>Dostava #${tag} (${sourceLabel})</b><br>${t.delivery_address || 'Čeka adresu'}<br>Roba: ${Number(t.goods_cost || 0)} RSD • Naplata: ${Number(t.total_required || 0)} RSD`,
          { autoPan: false }
        )
        .addTo(state.selectedRouteLayer);
    }

    if (legStops.length >= 2) {
      const tripTitle = `${isVoice ? '🎙️' : '📡'} #${tag} ${pickupShort}`;
      const etaKey = `${courier.user_id}:${t.trip_id || idx}`;
      const pts = legStops.map((s) => s.pt);
      const routeLineGroup = L.layerGroup().addTo(state.selectedRouteLayer);
      const cached = getCachedOsrmRoute(pts, courier.vehicle_type);
      if (cached) {
        drawStreetPolyline(routeLineGroup, cached.latLngs, lineColor, cached.isFallback);
        const etaInfo = buildEtaSummary(tripTitle, legStops, cached, false);
        state.courierTripEta.set(etaKey, etaInfo);
        etaSections[idx] = etaInfo;
      } else {
        drawStreetPolyline(routeLineGroup, pts, lineColor, true);
        fetchOsrmRoute(pts, courier.vehicle_type).then((routeRes) => {
          if (seq !== selectedRouteSeq || !routeRes) return;
          routeLineGroup.clearLayers();
          drawStreetPolyline(routeLineGroup, routeRes.latLngs, lineColor, routeRes.isFallback);
          const etaInfo = buildEtaSummary(tripTitle, legStops, routeRes, false);
          state.courierTripEta.set(etaKey, etaInfo);
          etaSections[idx] = etaInfo;
          state.selectedEtaSections = etaSections.filter(Boolean);
          renderRouteEtaOverlay();
          updateCourierCardEtaDom(courier.user_id);
        });
      }
    }
  });

  state.selectedEtaSections = etaSections.filter(Boolean);
  renderRouteEtaOverlay();
  updateCourierCardEtaDom(courier.user_id);

  if (fitToBounds && allLatLngs.length >= 2) {
    try {
      map.fitBounds(L.latLngBounds(allLatLngs), { padding: [55, 55], maxZoom: 15 });
    } catch (_) {}
  } else if (fitToBounds && hasCourierGps) {
    map.setView([courier.lat, courier.lng], 15);
  }
}

function getCourierPresence(c) {
  if (!c || !c.is_online || !c.updated_at) return 'offline';
  const ageMs = Date.now() - Date.parse(c.updated_at);
  if (!Number.isFinite(ageMs) || ageMs > COURIER_OFFLINE_MS) return 'offline';
  if (ageMs > COURIER_STANDBY_MS) return 'standby';
  return 'online';
}

function presenceSortRank(c) {
  const p = getCourierPresence(c);
  return p === 'online' ? 2 : p === 'standby' ? 1 : 0;
}

function presenceDotIcon(presence) {
  if (presence === 'online') return '🟢';
  if (presence === 'standby') return '⏸️';
  return '⚫';
}

function isCourierEffectivelyOnline(c) {
  return getCourierPresence(c) !== 'offline';
}

function effectiveCourierStatus(c, trips) {
  const presence = getCourierPresence(c);
  if (presence === 'offline') return 'IDLE';
  if ((c.active_orders_count || 0) === 0 || (c.active_trips_json && trips.length === 0)) {
    return presence === 'standby' ? 'STANDBY' : 'IDLE';
  }
  return c.status || 'IDLE';
}

function renderCouriers() {
  const arr = Array.from(state.couriers.values()).sort((a, b) => presenceSortRank(b) - presenceSortRank(a));
  const onlineCount = arr.filter((c) => isCourierEffectivelyOnline(c)).length;
  if (couriersOnlineCountEl) couriersOnlineCountEl.textContent = String(onlineCount);
  state.badgeCounts.couriers = onlineCount;
  refreshPanelTabBadges();

  const selectedBefore = courierSelectEl.value;
  courierSelectEl.innerHTML = '<option value="">-- Bez kurira (čeka dodelu) --</option>';
  arr.forEach((c) => {
    const presence = getCourierPresence(c);
    const available = presence !== 'offline';
    const trips = parseCourierTrips(c);
    const effStatus = effectiveCourierStatus(c, trips);
    const opt = document.createElement('option');
    opt.value = c.user_id;
    opt.textContent = `${presenceDotIcon(presence)} ${c.full_name || c.user_email} (${available ? courierStatusMeta(effStatus).label : 'Van mreže'})`;
    courierSelectEl.appendChild(opt);
  });
  if (selectedBefore) courierSelectEl.value = selectedBefore;
  populateOrderCourierFilterSelects(arr);
  updateOrderSubmitButtonLabel();

  couriersListEl.innerHTML = '';
  arr.forEach((c) => {
    const presence = getCourierPresence(c);
    const available = presence !== 'offline';
    const trips = available ? parseCourierTrips(c) : [];
    const effStatus = effectiveCourierStatus(c, trips);
    const meta = courierStatusMeta(effStatus);
    const isSelected = state.selectedCourierId === c.user_id;
    const card = document.createElement('div');
    const presenceCardCls = presence === 'offline' ? 'offline' : presence === 'standby' ? 'standby' : '';
    card.className = `card clickable ${presenceCardCls} ${isSelected ? 'selected' : ''}`;
    const ageSec = c.updated_at ? Math.max(0, Math.round((Date.now() - Date.parse(c.updated_at)) / 1000)) : null;
    const updatedAgo = ageSec === null ? '-' : (ageSec >= 60 ? `${Math.floor(ageSec / 60)}m` : `${ageSec}s`);
    const signalCls = presence === 'offline'
      ? 'offline'
      : presence === 'standby'
        ? 'standby'
        : (ageSec !== null && ageSec > 45 ? 'warn' : 'online');
    const activeTripsCount = available ? (trips.length || c.active_orders_count || 0) : 0;

    const tripsHtml = trips.length
      ? `<div class="courier-trips">${trips.map((t, idx) => {
          const isVoice = t.source === 'voice' || !t.dispatch_order_id;
          const tMeta = courierStatusMeta(t.status);
          const wps = Array.isArray(t.waypoints) ? t.waypoints : [];
          const matchedOrder = t.dispatch_order_id
            ? state.orders.find((o) => o.id === t.dispatch_order_id)
            : null;
          const pickupTitle = t.partner_name
            ? `${escapeHtml(t.partner_name)} — ${escapeHtml(t.pickup_address || '')}`
            : escapeHtml(t.pickup_address || 'Polazište');
          const delTitle = escapeHtml(t.delivery_address || 'Čeka adresu dostave');
          const payMeta = decodePaymentMeta(t.payment_method);
          const clientType = t.client_type || payMeta.clientType;
          const timeTariff = t.time_tariff || payMeta.timeTariff;
          const deliveryPrice = Number(t.delivery_price || 0);
          const wpSurcharge = Number(t.waypoints_surcharge || 0);
          const phone = t.customer_phone || matchedOrder?.customer_phone || '';
          const note = t.driver_comment || matchedOrder?.notes || '';

          const wpRowsHtml = wps.map((wp, wIdx) => {
            const visited = Boolean(wp.is_visited);
            const wpMeta = [];
            if (Number(wp.goods_cost || 0) > 0) wpMeta.push(`+${Math.round(wp.goods_cost)} roba`);
            if (Number(wp.amount_collected || 0) > 0) wpMeta.push(`napl. ${Math.round(wp.amount_collected)}`);
            if (wp.note) wpMeta.push(escapeHtml(wp.note));
            return `
              <div class="trip-stop-row ${visited ? 'visited' : ''}">
                <span class="stop-dot ${visited ? 's-done' : 's'}"></span>
                <span><b>S${wIdx + 1}:</b> ${escapeHtml(wp.address || 'Usputno stajanje')}${wpMeta.length ? ` <span class="muted">(${wpMeta.join(' • ')})</span>` : ''}</span>
              </div>
            `;
          }).join('');

          const extraParts = [];
          if (phone) {
            extraParts.push(`<a href="tel:${escapeHtml(phone)}" class="trip-phone-link">📞 ${escapeHtml(phone)}</a>`);
          }
          if (note) {
            extraParts.push(`<span>📝 ${escapeHtml(note)}</span>`);
          }

          const etaKey = `${c.user_id}:${t.trip_id || idx}`;
          const cachedEta = state.courierTripEta.get(etaKey);

          return `
            <div class="courier-trip-item">
              <div class="courier-trip-head">
                <span>${isVoice ? '🎙️ Glasovno' : '📡 Dispečer'} #${idx + 1}</span>
                <div class="courier-trip-head-right">
                  ${matchedOrder
                    ? `<button type="button" class="btn btn-secondary btn-xs btn-trip-edit" data-edit-order-id="${escapeHtml(matchedOrder.id)}">✏️ Izmeni</button>
                       <button type="button" class="btn btn-secondary btn-xs btn-trip-cancel" data-cancel-order-id="${escapeHtml(matchedOrder.id)}">✕ Otkaži</button>`
                    : `<button type="button" class="btn btn-secondary btn-xs btn-trip-edit" data-trip-idx="${idx}">✏️ Izmeni</button>
                       <button type="button" class="btn btn-secondary btn-xs btn-trip-cancel" data-trip-idx="${idx}">✕ Otkaži</button>`}
                  <span class="badge ${tMeta.badge}">${tMeta.label}</span>
                </div>
              </div>
              ${renderTripStepperHtml(t.status, wps.length > 0)}
              <div class="trip-eta-bar ${cachedEta ? '' : 'hidden'}" data-eta-key="${escapeHtml(etaKey)}">${cachedEta ? formatTripEtaBarHtml(cachedEta) : ''}</div>
              <div class="trip-stops">
                <div class="trip-stop-row"><span class="stop-dot p"></span><span><b>P:</b> ${pickupTitle}</span></div>
                ${wpRowsHtml}
                <div class="trip-stop-row"><span class="stop-dot d"></span><span><b>D:</b> ${delTitle}${t.determined_zone ? ` <span class="muted">(${escapeHtml(t.determined_zone)})</span>` : ''}</span></div>
              </div>
              <div class="trip-tags">
                <span class="trip-tag">${paymentModeLabel(payMeta.paymentMethod)}</span>
                <span class="trip-tag">${clientType === 'INDIVIDUAL' ? 'Privatno' : 'Pravno'}</span>
                <span class="trip-tag">${timeTariff === 'NIGHT' ? '🌙 Noćna' : '☀️ Dnevna'}</span>
              </div>
              <div class="trip-finance">
                <div><span>Roba</span><strong>${Math.round(t.goods_cost || 0)} RSD</strong></div>
                <div><span>Dostava</span><strong>${deliveryPrice > 0 ? `${Math.round(deliveryPrice)} RSD` : '—'}${wpSurcharge > 0 ? ` <small>(+${Math.round(wpSurcharge)})</small>` : ''}</strong></div>
                <div><span>Naplata</span><strong>${Math.round(t.total_required || 0)} RSD</strong></div>
              </div>
              ${extraParts.length ? `<div class="trip-extra">${extraParts.join('')}</div>` : ''}
            </div>
          `;
        }).join('')}</div>`
      : '';

    card.innerHTML = `
      <div class="card-top">
        <div class="courier-title">
          <span class="signal-dot ${signalCls}"></span>
          <strong>${escapeHtml(c.full_name || c.user_email)}</strong>
        </div>
        <span class="badge ${available ? meta.badge : 'badge-gray'}">${available ? meta.label : 'Van mreže'}</span>
      </div>
      <div class="courier-meta-row">
        <span>${vehicleLabel(c.vehicle_type)}</span>
        <span>•</span>
        <span>${Math.round(c.speed_kmh || 0)} km/h</span>
        <span>•</span>
        <span>Aktivno: <b>${activeTripsCount}</b></span>
        <span>•</span>
        <span>pre ${updatedAgo}</span>
      </div>
      <div class="courier-actions">
        <button type="button" class="btn btn-secondary btn-xs btn-courier-focus">📍 Fokus</button>
        <button type="button" class="btn btn-secondary btn-xs btn-courier-new-order">➕ Nova porudžbina</button>
      </div>
      ${available && !trips.length && effStatus !== 'IDLE' && effStatus !== 'STANDBY' && c.active_summary ? `<div style="margin-top:6px;color:#cfd8dc">${escapeHtml(c.active_summary)}</div>` : ''}
      ${tripsHtml}
    `;
    card.querySelector('.btn-courier-focus')?.addEventListener('click', (e) => {
      e.stopPropagation();
      selectCourier(c.user_id, true);
    });
    card.querySelector('.btn-courier-new-order')?.addEventListener('click', (e) => {
      e.stopPropagation();
      ensurePanelOpen('orderForm');
      resetForm();
      state.selectedCourierId = c.user_id;
      courierSelectEl.value = c.user_id;
      renderCouriers();
      renderSelectedCourierRoute(false);
      pickupInput.focus();
    });
    card.querySelectorAll('.trip-phone-link').forEach((link) => {
      link.addEventListener('click', (e) => e.stopPropagation());
    });
    card.querySelectorAll('.btn-trip-edit').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const oid = btn.getAttribute('data-edit-order-id');
        if (oid) {
          const ord = state.orders.find((o) => o.id === oid);
          if (ord) {
            startEditOrder(ord);
            pickupInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
          return;
        }
        const tIdx = Number(btn.getAttribute('data-trip-idx'));
        const targetTrip = Number.isFinite(tIdx) ? trips[tIdx] : null;
        if (targetTrip) {
          startEditVoiceTrip(c, targetTrip);
          pickupInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });
    });
    card.querySelectorAll('.btn-trip-cancel').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const oid = btn.getAttribute('data-cancel-order-id');
        if (oid) {
          if (confirm('Da li želite da otkažete ovu aktivnu porudžbinu?')) {
            cancelOrder(oid);
          }
          return;
        }
        const tIdx = Number(btn.getAttribute('data-trip-idx'));
        const targetTrip = Number.isFinite(tIdx) ? trips[tIdx] : null;
        if (targetTrip) {
          cancelVoiceTrip(c, targetTrip);
        }
      });
    });
    card.addEventListener('click', () => {
      selectCourier(c.user_id, true);
    });
    couriersListEl.appendChild(card);

    // Map marker
    const existingMarker = state.courierMarkers.get(c.user_id);
    if (available && c.lat && c.lng) {
      const tripPopupLines = trips.map((t, i) => {
        const tag = t.source === 'voice' || !t.dispatch_order_id ? '🎙️' : '📡';
        return `${tag} #${i + 1}: ${t.partner_name || (t.pickup_address || '').split(',')[0]} → ${t.delivery_address || 'čeka adresu'}`;
      }).join('<br>');
      const popupHtml = `<b>${c.full_name || c.user_email}</b><br>${meta.label} (${Math.round(c.speed_kmh || 0)} km/h)${tripPopupLines ? `<br>${tripPopupLines}` : (c.active_summary ? `<br>${c.active_summary}` : '')}`;
      if (existingMarker) {
        existingMarker.setLatLng([c.lat, c.lng]).setStyle({ color: isSelected ? '#29b6f6' : '#ffffff', fillColor: meta.color });
        if (existingMarker.getPopup()?.getContent() !== popupHtml) {
          existingMarker.setPopupContent(popupHtml);
        }
      } else {
        const marker = L.circleMarker([c.lat, c.lng], {
          radius: 9,
          color: isSelected ? '#29b6f6' : '#ffffff',
          weight: 2,
          fillColor: meta.color,
          fillOpacity: 0.95,
        }).bindPopup(popupHtml, { autoPan: false }).addTo(map);
        marker.on('click', (ev) => {
          L.DomEvent.stopPropagation(ev);
          selectCourier(c.user_id, true);
        });
        state.courierMarkers.set(c.user_id, marker);
      }
    } else if (existingMarker) {
      map.removeLayer(existingMarker);
      state.courierMarkers.delete(c.user_id);
    }
  });

  renderSelectedCourierRoute(false);
}

function isOrderFinished(o) {
  return o.dispatch_status === 'COMPLETED' ||
    o.dispatch_status === 'CANCELLED' ||
    o.trip_status === 'COMPLETED' ||
    o.trip_status === 'CANCELLED';
}

function isOrderWaiting(o) {
  if (isOrderFinished(o)) return false;
  return (
    o.dispatch_status === 'UNASSIGNED' ||
    o.dispatch_status === 'REJECTED' ||
    o.dispatch_status === 'EXPIRED' ||
    !o.assigned_courier_id
  );
}

function isOrderActiveAssigned(o) {
  return !isOrderFinished(o) && !isOrderWaiting(o);
}

function populateOrderCourierFilterSelects(couriersArr) {
  const populateOne = (selEl, stateVal, onReset) => {
    if (!selEl) return;
    const prev = stateVal || selEl.value || '';
    selEl.innerHTML = '<option value="">Svi kuriri</option>';
    (couriersArr || []).forEach((c) => {
      const opt = document.createElement('option');
      opt.value = c.user_id;
      opt.textContent = c.full_name || c.user_email || c.user_id;
      selEl.appendChild(opt);
    });
    if (prev && (couriersArr || []).some((c) => c.user_id === prev)) {
      selEl.value = prev;
    } else {
      selEl.value = '';
      onReset();
    }
  };
  populateOne(filterActiveCourierEl, state.orderFilters.active.courierId, () => { state.orderFilters.active.courierId = ''; });
  populateOne(filterHistoryCourierEl, state.orderFilters.history.courierId, () => { state.orderFilters.history.courierId = ''; });
}

unassignedPillEl?.addEventListener('click', () => {
  ensurePanelOpen('waiting');
});

filterWaitingSearchEl?.addEventListener('input', () => {
  state.orderFilters.waiting.search = filterWaitingSearchEl.value.trim();
  renderOrders();
});
filterWaitingSourceEl?.addEventListener('change', () => {
  state.orderFilters.waiting.source = filterWaitingSourceEl.value;
  renderOrders();
});
btnResetWaitingFilters?.addEventListener('click', () => {
  state.orderFilters.waiting = { search: '', source: '' };
  if (filterWaitingSearchEl) filterWaitingSearchEl.value = '';
  if (filterWaitingSourceEl) filterWaitingSourceEl.value = '';
  renderOrders();
});

filterActiveSearchEl?.addEventListener('input', () => {
  state.orderFilters.active.search = filterActiveSearchEl.value.trim();
  renderOrders();
});
filterActiveSourceEl?.addEventListener('change', () => {
  state.orderFilters.active.source = filterActiveSourceEl.value;
  renderOrders();
});
filterActiveCourierEl?.addEventListener('change', () => {
  state.orderFilters.active.courierId = filterActiveCourierEl.value;
  renderOrders();
});
btnResetActiveFilters?.addEventListener('click', () => {
  state.orderFilters.active = { search: '', source: '', courierId: '' };
  if (filterActiveSearchEl) filterActiveSearchEl.value = '';
  if (filterActiveSourceEl) filterActiveSourceEl.value = '';
  if (filterActiveCourierEl) filterActiveCourierEl.value = '';
  renderOrders();
});

filterHistorySearchEl?.addEventListener('input', () => {
  state.orderFilters.history.search = filterHistorySearchEl.value.trim();
  renderOrders();
});
filterHistorySourceEl?.addEventListener('change', () => {
  state.orderFilters.history.source = filterHistorySourceEl.value;
  renderOrders();
});
filterHistoryCourierEl?.addEventListener('change', () => {
  state.orderFilters.history.courierId = filterHistoryCourierEl.value;
  renderOrders();
});
filterHistoryStatusEl?.addEventListener('change', () => {
  state.orderFilters.history.status = filterHistoryStatusEl.value;
  renderOrders();
});
filterHistoryDateEl?.addEventListener('change', () => {
  state.orderFilters.history.dateRange = filterHistoryDateEl.value || 'all';
  renderOrders();
});
btnResetHistoryFilters?.addEventListener('click', () => {
  state.orderFilters.history = { search: '', source: '', courierId: '', status: '', dateRange: 'all' };
  if (filterHistorySearchEl) filterHistorySearchEl.value = '';
  if (filterHistorySourceEl) filterHistorySourceEl.value = '';
  if (filterHistoryCourierEl) filterHistoryCourierEl.value = '';
  if (filterHistoryStatusEl) filterHistoryStatusEl.value = '';
  if (filterHistoryDateEl) filterHistoryDateEl.value = 'all';
  renderOrders();
});

function encodePaymentMeta(pay, clientType, timeTariff) {
  return `${pay || 'CASH'}|${clientType || 'LEGAL_ENTITY'}|${timeTariff || 'DAY'}`;
}

function decodePaymentMeta(raw) {
  const parts = String(raw || 'CASH').split('|');
  let pay = (parts[0] || 'CASH').toUpperCase();
  if (pay === 'CARD' || pay === 'ACCOUNT' || pay === 'ONLINE') pay = 'ALL_PAID';
  const clientType = parts[1] === 'INDIVIDUAL' ? 'INDIVIDUAL' : 'LEGAL_ENTITY';
  const timeTariff = parts[2] === 'NIGHT' ? 'NIGHT' : 'DAY';
  return { paymentMethod: pay, clientType, timeTariff };
}

function paymentModeLabel(pay) {
  switch (pay) {
    case 'DELIVERY_ONLY': return 'Samo dostava';
    case 'ALL_PAID': return 'Sve plaćeno';
    default: return 'Keš';
  }
}

function parseOrderWaypoints(order) {
  if (!order || !order.waypoints_json) return [];
  try {
    const arr = typeof order.waypoints_json === 'string'
      ? JSON.parse(order.waypoints_json)
      : order.waypoints_json;
    return Array.isArray(arr) ? arr : [];
  } catch (_) {
    return [];
  }
}

function renderWaypointsEditor() {
  if (!waypointsContainer) return;
  waypointsContainer.innerHTML = '';
  state.waypoints.forEach((wp, idx) => {
    const row = document.createElement('div');
    row.className = 'waypoint-row';
    row.innerHTML = `
      <div class="waypoint-row-top autocomplete-wrap">
        <input type="text" class="wp-addr" placeholder="Adresa/lokal stajanja #${idx + 1}" value="${(wp.address || '').replace(/"/g, '&quot;')}" />
        <button type="button" class="btn btn-xs btn-secondary wp-remove" title="Ukloni stajanje">✕</button>
        <div class="suggestions hidden wp-suggestions"></div>
      </div>
      <div class="waypoint-row-meta">
        <select class="wp-surcharge">
          <option value="80" ${Number(wp.surcharge || 80) === 80 ? 'selected' : ''}>Usputno stajanje / Market (+80)</option>
          <option value="105" ${Number(wp.surcharge) === 105 ? 'selected' : ''}>Neodent (+105)</option>
          <option value="140" ${Number(wp.surcharge) === 140 ? 'selected' : ''}>Drugi lokal (+140)</option>
          <option value="220" ${Number(wp.surcharge) === 220 ? 'selected' : ''}>Privatna adresa (+220)</option>
        </select>
        <input type="number" min="0" step="10" class="wp-goods" placeholder="Roba RSD" value="${wp.goodsCost || ''}" />
      </div>
    `;
    const addrInput = row.querySelector('.wp-addr');
    const sugList = row.querySelector('.wp-suggestions');
    const surSel = row.querySelector('.wp-surcharge');
    const goodsEl = row.querySelector('.wp-goods');
    wireAutocomplete(addrInput, sugList, (picked) => {
      const label = picked.name ? `${picked.name}, ${picked.address}` : picked.address;
      addrInput.value = label;
      wp.address = label;
      wp.pickedLabel = label;
      wp.lat = picked.lat || 0;
      wp.lng = picked.lng || 0;
      if (!wp.note && picked.name) wp.note = picked.name;
      renderDraftRoutePreview();
    });
    addrInput.addEventListener('input', () => { wp.address = addrInput.value; });
    surSel.addEventListener('change', () => { wp.surcharge = Number(surSel.value || 80); });
    goodsEl.addEventListener('input', () => { wp.goodsCost = Number(goodsEl.value || 0); });
    row.querySelector('.wp-remove')?.addEventListener('click', () => {
      state.waypoints.splice(idx, 1);
      renderWaypointsEditor();
      renderDraftRoutePreview();
    });
    waypointsContainer.appendChild(row);
  });
}

btnAddWaypoint?.addEventListener('click', () => {
  state.waypoints.push({ address: '', lat: 0, lng: 0, surcharge: 80, goodsCost: 0, note: '' });
  renderWaypointsEditor();
});

function orderMatchesDateRange(createdAtIso, dateRange) {
  if (!dateRange || dateRange === 'all') return true;
  if (!createdAtIso) return false;
  const ms = new Date(createdAtIso).getTime();
  if (!Number.isFinite(ms)) return false;
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (dateRange === 'today') return ms >= startToday;
  if (dateRange === 'yesterday') return ms >= (startToday - 86_400_000) && ms < startToday;
  if (dateRange === '7d') return ms >= (now.getTime() - 7 * 86_400_000);
  return true;
}

function orderMatchesPanelFilter(o, panelKind) {
  const f = state.orderFilters[panelKind] || {};
  const isCompany = o.order_source === 'company' || Boolean(o.company_user_id);
  if (f.source === 'company' && !isCompany) return false;
  if (f.source === 'dispatcher' && isCompany) return false;
  if (f.courierId && o.assigned_courier_id !== f.courierId) return false;
  if (panelKind === 'history') {
    const ds = (o.dispatch_status || '').toUpperCase();
    const ts = (o.trip_status || '').toUpperCase();
    if (f.status === 'COMPLETED' && ds !== 'COMPLETED' && ts !== 'COMPLETED') return false;
    if (f.status === 'CANCELLED' && ds !== 'CANCELLED') return false;
    if (!orderMatchesDateRange(o.created_at, f.dateRange)) return false;
  }
  if (f.search) {
    const q = f.search.toLowerCase();
    const hay = [
      o.order_code ? `#${o.order_code}` : '',
      String(o.order_code || ''),
      o.company_name,
      o.pickup_name,
      o.pickup_address,
      o.delivery_address,
      o.assigned_courier_name,
      o.assigned_courier_email,
      o.customer_phone,
      o.notes,
    ].filter(Boolean).join(' ').toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

function isPanelFilterActive(panelKind) {
  const f = state.orderFilters[panelKind] || {};
  return Boolean(f.search || f.source || f.courierId || f.status || (f.dateRange && f.dateRange !== 'all'));
}

function buildOrderCardElement(o, couriersSorted) {
  const meta = dispatchBadgeMeta(o);
  const payMeta = decodePaymentMeta(o.payment_method);
  const wps = parseOrderWaypoints(o);
  const wpSummary = wps.length
    ? `<div class="muted">Usput (${wps.length}): ${wps.map((w) => escapeHtml((w.address || '').split(',')[0])).filter(Boolean).join(' → ')}</div>`
    : '';
  const finished = isOrderFinished(o);
  const waiting = isOrderWaiting(o);
  const canUnassign = o.dispatch_status === 'OFFERED';

  let inlineAssignHtml = '';
  if (waiting) {
    const courierOpts = couriersSorted.map((c) => {
      const presence = getCourierPresence(c);
      const available = presence !== 'offline';
      const trips = available ? parseCourierTrips(c) : [];
      const effStatus = effectiveCourierStatus(c, trips);
      const activeCnt = available ? (trips.length || c.active_orders_count || 0) : 0;
      const label = `${presenceDotIcon(presence)} ${c.full_name || c.user_email} (${available ? `${courierStatusMeta(effStatus).label} • ${activeCnt}` : 'Van mreže'})`;
      const preSel = (state.selectedCourierId && state.selectedCourierId === c.user_id) ? ' selected' : '';
      return `<option value="${escapeHtml(c.user_id)}"${preSel}>${escapeHtml(label)}</option>`;
    }).join('');
    inlineAssignHtml = `
      <div class="inline-assign-row">
        <select class="inline-courier-select">
          <option value="">-- Izaberi kurira --</option>
          ${courierOpts}
        </select>
        <button type="button" class="btn btn-xs btn-primary act-assign">📤 Dodeli</button>
      </div>
    `;
  }

  const card = document.createElement('div');
  card.className = `card${waiting ? ' card-unassigned' : ''}`;
  const isCompanyOrder = o.order_source === 'company' || Boolean(o.company_user_id);
  const companyBadgeHtml = isCompanyOrder
    ? `<span class="badge badge-company">🏢 ${escapeHtml(o.company_name || 'Firma')}</span>`
    : '';
  const timeShort = o.created_at ? new Date(o.created_at).toLocaleTimeString('sr-RS', { hour: '2-digit', minute: '2-digit' }) : '';
  card.innerHTML = `
    <div class="card-top">
      <strong class="${o.pickup_lat && o.pickup_lng ? 'order-focus-head' : ''}" title="${o.pickup_lat && o.pickup_lng ? 'Klikni za fokus na mapi' : ''}">#${escapeHtml(o.order_code || '?')} ${escapeHtml(o.pickup_name || o.pickup_address)}</strong>
      <div style="display:flex;align-items:center;gap:4px;flex-wrap:wrap">
        ${companyBadgeHtml}
        <span class="badge ${meta.cls}">${escapeHtml(meta.text)}</span>
      </div>
    </div>
    <div class="muted">Preuzimanje: ${escapeHtml(o.pickup_address)}${timeShort ? ` • ${escapeHtml(timeShort)}` : ''}</div>
    ${wpSummary}
    ${o.delivery_address ? `<div>Dostava: ${escapeHtml(o.delivery_address)}</div>` : '<div class="muted">Dostava: dopunjava kurir</div>'}
    <div class="muted">Kurir: ${escapeHtml(o.assigned_courier_name || o.assigned_courier_email || 'Nedodeljeno')} • Roba: ${Number(o.goods_cost || 0)} RSD</div>
    <div class="muted">${paymentModeLabel(payMeta.paymentMethod)} • ${payMeta.clientType === 'INDIVIDUAL' ? 'Privatno (220)' : 'Lokal (140)'} • ${payMeta.timeTariff === 'NIGHT' ? 'Noćna' : 'Dnevna'}</div>
    ${o.notes ? `<div style="color:#ffe082;margin-top:3px">Napomena: ${escapeHtml(o.notes)}</div>` : ''}
    ${inlineAssignHtml}
    <div class="card-actions">
      <button type="button" class="btn btn-xs btn-secondary act-edit">Izmeni</button>
      ${canUnassign ? '<button type="button" class="btn btn-xs btn-secondary act-unassign">⏳ Na čekanje</button>' : ''}
      ${!finished ? '<button type="button" class="btn btn-xs btn-secondary act-cancel">Otkaži</button>' : ''}
    </div>
  `;
  card.querySelector('.order-focus-head')?.addEventListener('click', () => {
    if (o.pickup_lat && o.pickup_lng) {
      map.setView([o.pickup_lat, o.pickup_lng], 15);
      state.orderMarkers.get(o.id)?.openPopup();
    }
  });
  card.querySelector('.act-edit')?.addEventListener('click', () => startEditOrder(o));
  card.querySelector('.act-assign')?.addEventListener('click', () => {
    const sel = card.querySelector('.inline-courier-select');
    const cid = sel?.value || state.selectedCourierId || o.assigned_courier_id;
    assignOrderToCourier(o, cid);
  });
  card.querySelector('.act-unassign')?.addEventListener('click', () => unassignOrder(o));
  card.querySelector('.act-cancel')?.addEventListener('click', () => cancelOrder(o.id));
  return card;
}

function renderOrderPanelList(listEl, baseOrders, panelKind, emptyText, infoEl, resetBtn, couriersSorted) {
  if (!listEl) return;
  const filtered = baseOrders.filter((o) => orderMatchesPanelFilter(o, panelKind));
  const activeFilter = isPanelFilterActive(panelKind);
  resetBtn?.classList.toggle('hidden', !activeFilter);
  if (infoEl) {
    infoEl.textContent = activeFilter
      ? `Prikazano ${filtered.length} od ${baseOrders.length}`
      : `Ukupno: ${baseOrders.length}`;
  }
  listEl.innerHTML = '';
  if (!filtered.length) {
    const empty = document.createElement('div');
    empty.className = 'feed-empty';
    empty.textContent = activeFilter ? 'Nema rezultata za izabrani filter.' : emptyText;
    listEl.appendChild(empty);
    return;
  }
  filtered.forEach((o) => listEl.appendChild(buildOrderCardElement(o, couriersSorted)));
}

function renderOrders() {
  const waitingOrders = state.orders.filter(isOrderWaiting);
  const activeOrders = state.orders.filter(isOrderActiveAssigned);
  const historyOrders = state.orders.filter(isOrderFinished);
  if (ordersUnassignedCountEl) ordersUnassignedCountEl.textContent = String(waitingOrders.length);
  if (ordersCountEl) ordersCountEl.textContent = String(activeOrders.length);
  if (ordersHistoryCountEl) ordersHistoryCountEl.textContent = String(historyOrders.length);

  state.badgeCounts.waiting = waitingOrders.length;
  state.badgeCounts.active = activeOrders.length;
  state.badgeCounts.history = historyOrders.length;
  refreshPanelTabBadges();

  unassignedPillEl?.classList.toggle('hidden', waitingOrders.length === 0);
  if (unassignedPillCountEl) unassignedPillCountEl.textContent = String(waitingOrders.length);

  const unfinishedOrders = [...waitingOrders, ...activeOrders];
  const unfinishedIds = new Set(unfinishedOrders.map((o) => o.id));
  for (const [id, marker] of state.orderMarkers.entries()) {
    if (!unfinishedIds.has(id)) {
      map.removeLayer(marker);
      state.orderMarkers.delete(id);
    }
  }

  const couriersSorted = Array.from(state.couriers.values()).sort(
    (a, b) => presenceSortRank(b) - presenceSortRank(a)
  );

  renderOrderPanelList(
    ordersWaitingListEl,
    waitingOrders,
    'waiting',
    'Nema nedodeljenih porudžbina na čekanju.',
    waitingFilterInfoEl,
    btnResetWaitingFilters,
    couriersSorted
  );
  renderOrderPanelList(
    ordersActiveListEl,
    activeOrders,
    'active',
    'Nema aktivnih dodeljenih porudžbina.',
    activeFilterInfoEl,
    btnResetActiveFilters,
    couriersSorted
  );
  renderOrderPanelList(
    ordersHistoryListEl,
    historyOrders,
    'history',
    'Još nema završenih ili otkazanih porudžbina.',
    historyFilterInfoEl,
    btnResetHistoryFilters,
    couriersSorted
  );

  unfinishedOrders.forEach((o) => {
    if (!o.pickup_lat || !o.pickup_lng) return;
    const waiting = isOrderWaiting(o);
    const shortTitle = shortPlaceLabel(o.pickup_address, o.pickup_name) || 'Preuzimanje';
    const html = `<b>${waiting ? '⏳ Čeka dodelu ' : ''}#${escapeHtml(o.order_code || '?')} ${escapeHtml(o.pickup_name || o.pickup_address)}</b><br>${escapeHtml(o.delivery_address || 'Čeka adresu dostave')}`;
    const existing = state.orderMarkers.get(o.id);
    if (existing && existing._isWaitingPin !== waiting) {
      map.removeLayer(existing);
      state.orderMarkers.delete(o.id);
    }
    const curMarker = state.orderMarkers.get(o.id);
    if (curMarker) {
      curMarker.setLatLng([o.pickup_lat, o.pickup_lng]);
      if (curMarker.getPopup()?.getContent() !== html) {
        curMarker.setPopupContent(html);
      }
    } else if (waiting) {
      const marker = L.circleMarker([o.pickup_lat, o.pickup_lng], {
        radius: 9,
        color: '#ffffff',
        weight: 2.5,
        fillColor: '#ffca28',
        fillOpacity: 0.95,
      })
        .bindTooltip(`⏳ #${o.order_code || '?'}: ${shortTitle}`, { permanent: true, direction: 'top', className: 'pin-label', offset: [0, -6] })
        .bindPopup(html, { autoPan: false })
        .addTo(map);
      marker._isWaitingPin = true;
      marker.on('click', () => {
        ensurePanelOpen('waiting');
      });
      state.orderMarkers.set(o.id, marker);
    } else {
      const marker = L.marker([o.pickup_lat, o.pickup_lng]).bindPopup(html, { autoPan: false }).addTo(map);
      marker._isWaitingPin = false;
      state.orderMarkers.set(o.id, marker);
    }
  });
}

function startEditOrder(order) {
  ensurePanelOpen('orderForm');
  state.editingVoiceTrip = null;
  const payMeta = decodePaymentMeta(order.payment_method);
  editOrderIdInput.value = order.id;
  formTitleEl.textContent = `Izmena porudžbine #${order.order_code}`;
  btnResetForm.classList.remove('hidden');
  btnSubmitOrder.textContent = 'Sačuvaj izmene';
  pickupInput.value = order.pickup_name ? `${order.pickup_name}, ${order.pickup_address}` : order.pickup_address;
  state.selectedPickup = { name: order.pickup_name, address: order.pickup_address, lat: order.pickup_lat, lng: order.pickup_lng };
  state.waypoints = parseOrderWaypoints(order).map((w) => ({
    address: w.address || '',
    pickedLabel: w.address || '',
    lat: Number(w.lat || 0),
    lng: Number(w.lng || 0),
    surcharge: Number(w.surcharge || 80),
    goodsCost: Number(w.goodsCost || 0),
    note: w.note || '',
  }));
  renderWaypointsEditor();
  deliveryInput.value = order.delivery_address || '';
  state.selectedDelivery = { address: order.delivery_address || '', lat: order.delivery_lat || 0, lng: order.delivery_lng || 0 };
  goodsInput.value = order.goods_cost || '';
  paymentSelect.value = payMeta.paymentMethod;
  if (clientTypeSelect) clientTypeSelect.value = payMeta.clientType;
  if (tariffSelect) tariffSelect.value = payMeta.timeTariff;
  phoneInput.value = order.customer_phone || '';
  notesInput.value = order.notes || '';
  courierSelectEl.value = order.assigned_courier_id || '';
  noAutoExpireCheckbox.checked = Boolean(order.no_auto_expire);
  updateOrderSubmitButtonLabel();
  renderDraftRoutePreview();
}

function startEditVoiceTrip(courier, trip) {
  ensurePanelOpen('orderForm');
  resetForm();
  const payMeta = decodePaymentMeta(trip.payment_method);
  const clientType = trip.client_type || payMeta.clientType;
  const timeTariff = trip.time_tariff || payMeta.timeTariff;
  state.editingVoiceTrip = {
    courierId: courier.user_id,
    tripId: trip.trip_id,
    status: trip.status || 'EN_ROUTE_CUSTOMER',
  };
  formTitleEl.textContent = `Izmena glasovne vožnje #${trip.trip_number || 1}`;
  btnResetForm.classList.remove('hidden');
  btnSubmitOrder.textContent = 'Sačuvaj izmene';
  pickupInput.value = trip.partner_name
    ? `${trip.partner_name}, ${trip.pickup_address || ''}`
    : (trip.pickup_address || '');
  state.selectedPickup = {
    name: trip.partner_name || null,
    address: trip.pickup_address || '',
    lat: Number(trip.pickup_lat || 0),
    lng: Number(trip.pickup_lng || 0),
  };
  const wps = Array.isArray(trip.waypoints) ? trip.waypoints : [];
  state.waypoints = wps.map((w) => ({
    address: w.address || '',
    pickedLabel: w.address || '',
    lat: Number(w.lat || 0),
    lng: Number(w.lng || 0),
    surcharge: Number(w.surcharge || 80),
    goodsCost: Number(w.goods_cost || w.goodsCost || 0),
    note: w.note || '',
  }));
  renderWaypointsEditor();
  deliveryInput.value = trip.delivery_address || '';
  state.selectedDelivery = {
    address: trip.delivery_address || '',
    lat: Number(trip.delivery_lat || 0),
    lng: Number(trip.delivery_lng || 0),
  };
  goodsInput.value = trip.goods_cost || '';
  paymentSelect.value = payMeta.paymentMethod;
  if (clientTypeSelect) clientTypeSelect.value = clientType;
  if (tariffSelect) tariffSelect.value = timeTariff;
  phoneInput.value = trip.customer_phone || '';
  notesInput.value = trip.driver_comment || '';
  courierSelectEl.value = courier.user_id || '';
  noAutoExpireCheckbox.checked = true;
  updateOrderSubmitButtonLabel();
  renderDraftRoutePreview();
}

async function cancelVoiceTrip(courier, trip) {
  const label = trip.partner_name || (trip.pickup_address || '').split(',')[0] || `vožnju #${trip.trip_number || 1}`;
  if (!confirm(`Da li želite da otkažete aktivnu vožnju "${label}"?`)) return;
  const payMeta = decodePaymentMeta(trip.payment_method);
  const clientType = trip.client_type || payMeta.clientType;
  const timeTariff = trip.time_tariff || payMeta.timeTariff;
  await supabase.from('dispatch_orders').insert({
    created_by_email: state.user?.email || null,
    assigned_courier_id: courier.user_id,
    assigned_courier_email: courier.user_email || null,
    assigned_courier_name: courier.full_name || courier.user_email || null,
    dispatch_status: 'CANCELLED',
    trip_status: 'CANCELLED',
    pickup_name: trip.partner_name || null,
    pickup_address: trip.pickup_address || 'Novi Sad',
    pickup_lat: Number(trip.pickup_lat || 0),
    pickup_lng: Number(trip.pickup_lng || 0),
    delivery_address: trip.delivery_address || null,
    delivery_lat: Number(trip.delivery_lat || 0),
    delivery_lng: Number(trip.delivery_lng || 0),
    waypoints_json: '[]',
    goods_cost: Number(trip.goods_cost || 0),
    payment_method: encodePaymentMeta(payMeta.paymentMethod, clientType, timeTariff),
    customer_phone: trip.customer_phone || null,
    notes: trip.driver_comment || null,
    offer_expires_at: null,
    no_auto_expire: true,
    updated_by_role: `dispatcher_trip_${trip.trip_id}`,
    updated_at: new Date().toISOString(),
  });
  await loadAllData();
}

function hideAllSuggestions() {
  document.querySelectorAll('.suggestions').forEach((el) => el.classList.add('hidden'));
}

function resetForm() {
  state.editingVoiceTrip = null;
  editOrderIdInput.value = '';
  formTitleEl.textContent = 'Nova porudžbina';
  btnResetForm.classList.add('hidden');
  orderForm.reset();
  if (state.selectedCourierId) {
    courierSelectEl.value = state.selectedCourierId;
  }
  updateOrderSubmitButtonLabel();
  state.selectedPickup = { name: null, address: '', lat: 0, lng: 0 };
  state.waypoints = [];
  renderWaypointsEditor();
  state.selectedDelivery = { address: '', lat: 0, lng: 0 };
  hideAllSuggestions();
  renderDraftRoutePreview();
}
btnResetForm.addEventListener('click', resetForm);

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

async function searchPlacesAndPhoton(query) {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const localMatches = state.places
    .filter((p) => {
      const aliasStr = Array.isArray(p.aliases) ? p.aliases.join(' ').toLowerCase() : '';
      return p.name.toLowerCase().includes(q) || p.official_address.toLowerCase().includes(q) || aliasStr.includes(q);
    })
    .slice(0, 5)
    .map((p) => ({
      name: p.name,
      address: p.official_address,
      lat: p.latitude,
      lng: p.longitude,
      display: `${p.name} — ${p.official_address}`,
    }));

  const hasDigit = /\d/.test(q);
  const nomPromise = hasDigit ? searchNominatim(query) : Promise.resolve([]);
  const photonPromise = fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(query + ' Novi Sad')}&lat=45.255&lon=19.845&limit=8`)
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
  for (const item of [...localMatches, ...nomMatches, ...photonMatches]) {
    const key = String(item.address || '').trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
    if (merged.length >= 8) break;
  }
  return merged;
}

function wireAutocomplete(inputEl, listEl, onPick) {
  let timer = null;
  let searchSeq = 0;

  const closeList = () => {
    clearTimeout(timer);
    searchSeq++;
    listEl.classList.add('hidden');
  };

  inputEl.addEventListener('input', () => {
    clearTimeout(timer);
    const seq = ++searchSeq;
    timer = setTimeout(async () => {
      const items = await searchPlacesAndPhoton(inputEl.value);
      if (seq !== searchSeq || document.activeElement !== inputEl) {
        listEl.classList.add('hidden');
        return;
      }
      listEl.innerHTML = '';
      if (!items.length) {
        listEl.classList.add('hidden');
        return;
      }
      items.forEach((item) => {
        const div = document.createElement('div');
        div.className = 'suggestion-item';
        div.textContent = item.display;
        div.addEventListener('mousedown', (e) => {
          e.preventDefault();
          onPick(item);
          closeList();
        });
        listEl.appendChild(div);
      });
      listEl.classList.remove('hidden');
    }, 220);
  });

  inputEl.addEventListener('blur', () => {
    clearTimeout(timer);
    searchSeq++;
    setTimeout(() => listEl.classList.add('hidden'), 150);
  });

  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeList();
    }
  });
}

wireAutocomplete(pickupInput, pickupSuggestions, (item) => {
  pickupInput.value = item.name ? `${item.name}, ${item.address}` : item.address;
  state.selectedPickup = item;
  renderDraftRoutePreview();
});
wireAutocomplete(deliveryInput, deliverySuggestions, (item) => {
  deliveryInput.value = item.address;
  state.selectedDelivery = item;
  renderDraftRoutePreview();
});

async function resolveFallbackGeocode(text) {
  if (!text) return { name: null, address: '', lat: 0, lng: 0 };
  if (/\d/.test(text)) {
    const nom = await searchNominatim(text);
    const exact = nom.find((x) => x.hasHouseNumber) || nom[0];
    if (exact) return exact;
  }
  const matches = await searchPlacesAndPhoton(text);
  return matches[0] || { name: null, address: text, lat: 0, lng: 0 };
}

let isSubmittingOrder = false;
async function submitOrderForm(forceUnassigned = false) {
  if (isSubmittingOrder) return;
  isSubmittingOrder = true;
  const origSubmitText = btnSubmitOrder.textContent;
  let didReset = false;
  btnSubmitOrder.disabled = true;
  if (btnSaveUnassigned) btnSaveUnassigned.disabled = true;
  btnSubmitOrder.textContent = 'Šaljem...';
  try {
    hideAllSuggestions();
    const courierId = forceUnassigned ? null : (courierSelectEl.value || null);
    const courierObj = courierId ? state.couriers.get(courierId) : null;
    const targetLabel = courierObj?.user_email || courierObj?.full_name || courierId || 'UNASSIGNED';
    const noAutoExpire = noAutoExpireCheckbox.checked;

    let pickup = state.selectedPickup;
    if (!pickup.address || pickupInput.value.trim() !== (pickup.name ? `${pickup.name}, ${pickup.address}` : pickup.address)) {
      pickup = await resolveFallbackGeocode(pickupInput.value.trim());
    }
    const deliveryRaw = deliveryInput.value.trim();
    let delivery = state.selectedDelivery;
    if (deliveryRaw && delivery.address !== deliveryRaw) {
      delivery = await resolveFallbackGeocode(deliveryRaw);
    } else if (!deliveryRaw) {
      delivery = { address: '', lat: 0, lng: 0 };
    }

    const waypointsPayload = [];
    for (const wp of state.waypoints) {
      const rawAddr = (wp.address || '').trim();
      if (!rawAddr) continue;
      let lat = wp.lat || 0;
      let lng = wp.lng || 0;
      let finalAddr = rawAddr;
      if ((!lat && !lng) || (wp.pickedLabel && wp.pickedLabel !== rawAddr)) {
        const geo = await resolveFallbackGeocode(rawAddr);
        finalAddr = geo.name ? `${geo.name}, ${geo.address}` : (geo.address || rawAddr);
        lat = geo.lat || 0;
        lng = geo.lng || 0;
      }
      waypointsPayload.push({
        address: finalAddr,
        lat,
        lng,
        surcharge: Number(wp.surcharge || 80),
        goodsCost: Number(wp.goodsCost || 0),
        note: wp.note || null,
        isCustomerDropoff: false,
      });
    }
    const encodedPayment = encodePaymentMeta(
      paymentSelect.value,
      clientTypeSelect?.value || 'LEGAL_ENTITY',
      tariffSelect?.value || 'DAY'
    );

    const editId = editOrderIdInput.value;
    if (editId) {
      const origOrder = state.orders.find((o) => o.id === editId);
      const updatePatch = {
        pickup_name: pickup.name,
        pickup_address: pickup.address || pickupInput.value.trim(),
        pickup_lat: pickup.lat || 0,
        pickup_lng: pickup.lng || 0,
        delivery_address: delivery.address || null,
        delivery_lat: delivery.lat || 0,
        delivery_lng: delivery.lng || 0,
        waypoints_json: JSON.stringify(waypointsPayload),
        goods_cost: Number(goodsInput.value || 0),
        payment_method: encodedPayment,
        customer_phone: phoneInput.value.trim() || null,
        notes: notesInput.value.trim() || null,
        assigned_courier_id: courierId,
        assigned_courier_email: courierObj?.user_email || null,
        assigned_courier_name: courierObj?.full_name || courierObj?.user_email || null,
        no_auto_expire: noAutoExpire,
        updated_by_role: 'dispatcher',
        updated_at: new Date().toISOString(),
      };
      if (origOrder && isOrderWaiting(origOrder) && courierId) {
        state.expiredHandled.delete(editId);
        updatePatch.dispatch_status = 'OFFERED';
        updatePatch.offer_expires_at = noAutoExpire ? null : new Date(Date.now() + DEFAULT_OFFER_TIMEOUT_MS).toISOString();
      } else if (origOrder && origOrder.dispatch_status === 'OFFERED' && !courierId) {
        updatePatch.dispatch_status = 'UNASSIGNED';
        updatePatch.offer_expires_at = null;
      }
      const { error } = await supabase.from('dispatch_orders').update(updatePatch).eq('id', editId);
      if (error) {
        dispatchLog('ORDER/ERR', `Izmena porudžbine ${editId}: ${error.message}`);
        alert('Greška pri slanju porudžbine: ' + error.message);
        return;
      }
      dispatchLog('ORDER', `Izmenjena porudžbina -> ${targetLabel}`);
      resetForm();
      didReset = true;
      await loadAllData();
      return;
    }

    if (state.editingVoiceTrip) {
      const { error } = await supabase.from('dispatch_orders').insert({
        created_by_email: state.user?.email || null,
        assigned_courier_id: courierId,
        assigned_courier_email: courierObj?.user_email || null,
        assigned_courier_name: courierObj?.full_name || courierObj?.user_email || null,
        dispatch_status: 'ACCEPTED',
        trip_status: state.editingVoiceTrip.status,
        pickup_name: pickup.name,
        pickup_address: pickup.address || pickupInput.value.trim(),
        pickup_lat: pickup.lat || 0,
        pickup_lng: pickup.lng || 0,
        delivery_address: delivery.address || null,
        delivery_lat: delivery.lat || 0,
        delivery_lng: delivery.lng || 0,
        waypoints_json: JSON.stringify(waypointsPayload),
        goods_cost: Number(goodsInput.value || 0),
        payment_method: encodedPayment,
        customer_phone: phoneInput.value.trim() || null,
        notes: notesInput.value.trim() || null,
        offer_expires_at: null,
        no_auto_expire: true,
        updated_by_role: `dispatcher_trip_${state.editingVoiceTrip.tripId}`,
        updated_at: new Date().toISOString(),
      });
      if (error) {
        dispatchLog('ORDER/ERR', `Izmena glasovne vožnje: ${error.message}`);
        alert('Greška pri slanju porudžbine: ' + error.message);
        return;
      }
      dispatchLog('ORDER', `Izmenjena glasovna vožnja (ACCEPTED) -> ${targetLabel}`);
      resetForm();
      didReset = true;
      await loadAllData();
      return;
    }

    const expiresAt = (!noAutoExpire && courierId)
      ? new Date(Date.now() + DEFAULT_OFFER_TIMEOUT_MS).toISOString()
      : null;
    const nextStatus = courierId ? 'OFFERED' : 'UNASSIGNED';

    const { error } = await supabase.from('dispatch_orders').insert({
      created_by_email: state.user?.email || null,
      assigned_courier_id: courierId,
      assigned_courier_email: courierObj?.user_email || null,
      assigned_courier_name: courierObj?.full_name || courierObj?.user_email || null,
      dispatch_status: nextStatus,
      trip_status: 'CALL_RECEIVED',
      pickup_name: pickup.name,
      pickup_address: pickup.address || pickupInput.value.trim(),
      pickup_lat: pickup.lat || 0,
      pickup_lng: pickup.lng || 0,
      delivery_address: delivery.address || null,
      delivery_lat: delivery.lat || 0,
      delivery_lng: delivery.lng || 0,
      waypoints_json: JSON.stringify(waypointsPayload),
      goods_cost: Number(goodsInput.value || 0),
      payment_method: encodedPayment,
      customer_phone: phoneInput.value.trim() || null,
      notes: notesInput.value.trim() || null,
      offer_expires_at: expiresAt,
      no_auto_expire: noAutoExpire,
      updated_by_role: 'dispatcher',
    });
    if (error) {
      dispatchLog('ORDER/ERR', `Slanje porudžbine (${nextStatus}): ${error.message}`);
      alert('Greška pri slanju porudžbine: ' + error.message);
      return;
    }
    dispatchLog('ORDER', `Poslata nova porudžbina (${nextStatus}) -> ${targetLabel}`);
    resetForm();
    didReset = true;
    await loadAllData();
    if (nextStatus === 'UNASSIGNED') {
      ensurePanelOpen('waiting');
    } else {
      ensurePanelOpen('active');
    }
  } catch (err) {
    dispatchLog('ORDER/ERR', err?.message || String(err));
    alert('Greška pri slanju porudžbine: ' + (err?.message || err));
  } finally {
    isSubmittingOrder = false;
    btnSubmitOrder.disabled = false;
    if (btnSaveUnassigned) btnSaveUnassigned.disabled = false;
    if (!didReset) updateOrderSubmitButtonLabel();
  }
}

orderForm.addEventListener('submit', (e) => {
  e.preventDefault();
  submitOrderForm(false);
});

btnSaveUnassigned?.addEventListener('click', () => {
  if (!orderForm.reportValidity()) return;
  submitOrderForm(true);
});

async function assignOrderToCourier(order, courierId) {
  if (!courierId) { alert('Izaberite kurira iz padajućeg menija.'); return; }
  const courierObj = state.couriers.get(courierId);
  const targetLabel = courierObj?.user_email || courierObj?.full_name || order.assigned_courier_email || courierId;
  const noAutoExpire = Boolean(order.no_auto_expire);
  state.expiredHandled.delete(order.id);
  const { error } = await supabase.from('dispatch_orders').update({
    assigned_courier_id: courierId,
    assigned_courier_email: courierObj?.user_email || order.assigned_courier_email || null,
    assigned_courier_name: courierObj?.full_name || courierObj?.user_email || order.assigned_courier_name || null,
    dispatch_status: 'OFFERED',
    offer_expires_at: noAutoExpire ? null : new Date(Date.now() + DEFAULT_OFFER_TIMEOUT_MS).toISOString(),
    updated_by_role: 'dispatcher',
    updated_at: new Date().toISOString(),
  }).eq('id', order.id);
  if (error) {
    dispatchLog('ORDER/ERR', `Dodela porudžbine #${order.order_code || order.id}: ${error.message}`);
    alert('Greška pri slanju porudžbine: ' + error.message);
    return;
  }
  dispatchLog('ORDER', `Dodeljena porudžbina #${order.order_code || order.id} (OFFERED) -> ${targetLabel}`);
  await loadAllData();
}

async function unassignOrder(order) {
  const { error } = await supabase.from('dispatch_orders').update({
    assigned_courier_id: null,
    assigned_courier_email: null,
    assigned_courier_name: null,
    dispatch_status: 'UNASSIGNED',
    offer_expires_at: null,
    updated_by_role: 'dispatcher',
    updated_at: new Date().toISOString(),
  }).eq('id', order.id);
  if (error) {
    dispatchLog('ORDER/ERR', `Povlačenje #${order.order_code || order.id} na čekanje: ${error.message}`);
    alert('Greška pri vraćanju porudžbine na čekanje: ' + error.message);
    return;
  }
  dispatchLog('ORDER', `Porudžbina #${order.order_code || order.id} vraćena na čekanje`);
  await loadAllData();
}

async function reofferOrder(order) {
  const courierId = courierSelectEl.value || state.selectedCourierId || order.assigned_courier_id;
  await assignOrderToCourier(order, courierId);
}

async function cancelOrder(id) {
  await supabase.from('dispatch_orders').update({
    dispatch_status: 'CANCELLED',
    updated_by_role: 'dispatcher',
    updated_at: new Date().toISOString(),
  }).eq('id', id);
  await loadAllData();
}

async function loadAllData() {
  const skipPlaces = state.places.length > 0 || state.placesUnavailable;
  const [{ data: couriers, error: cErr }, { data: orders, error: oErr }, { data: places, error: pErr }] = await Promise.all([
    supabase.from('courier_live_status').select('*'),
    supabase.from('dispatch_orders').select('*').order('created_at', { ascending: false }).limit(200),
    skipPlaces
      ? Promise.resolve({ data: state.places, error: null })
      : supabase.from('shared_delivery_places').select('name,official_address,aliases,latitude,longitude').limit(500),
  ]);
  if (cErr) dispatchLog('SYNC/ERR', `courier_live_status: ${cErr.message}`);
  if (oErr) dispatchLog('SYNC/ERR', `dispatch_orders: ${oErr.message}`);
  if (pErr) {
    if (pErr.message?.includes('schema cache') || pErr.code === 'PGRST205') {
      state.placesUnavailable = true;
    }
    dispatchLog('SYNC/ERR', `shared_delivery_places: ${pErr.message}`);
  }
  if (places) state.places = places;
  if (couriers) {
    state.couriers.clear();
    couriers.forEach((c) => state.couriers.set(c.user_id, c));
  }
  if (orders) state.orders = orders;
  dispatchLog('SYNC', `Učitano kurira=${couriers?.length ?? 0}, porudžbina=${orders?.length ?? 0}, lokala=${state.places.length}`);
  processCouriersFeedDiff(state.couriers.values(), !state.feedInitialized);
  processOrdersFeedDiff(state.orders, !state.feedInitialized);
  state.feedInitialized = true;
  renderCouriers();
  renderOrders();
}

function setupRealtime() {
  if (state.realtimeStarted) return;
  state.realtimeStarted = true;
  supabase
    .channel('flash-dispatch-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'courier_live_status' }, (payload) => {
      if (payload.new?.user_id) {
        state.couriers.set(payload.new.user_id, payload.new);
        processCouriersFeedDiff([payload.new], !state.feedInitialized);
        renderCouriers();
      }
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'dispatch_orders' }, () => {
      loadAllData();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'company_accounts' }, () => {
      if (state.isAdmin) loadCompanies();
    })
    .subscribe((status) => {
      dispatchLog('REALTIME', `Status kanala: ${status}`);
      realtimePill.textContent = status === 'SUBSCRIBED' ? 'Realtime: UŽIVO' : `Realtime: ${status}`;
      realtimePill.classList.toggle('ok', status === 'SUBSCRIBED');
    });

  // 1s ticker za odbrojavanje 45s roka i zvuk alarma
  setInterval(async () => {
    let needsRender = false;
    for (const o of state.orders) {
      if (o.dispatch_status === 'OFFERED' && !o.no_auto_expire && o.offer_expires_at) {
        needsRender = true;
        if (Date.now() > Date.parse(o.offer_expires_at) && !state.expiredHandled.has(o.id)) {
          state.expiredHandled.add(o.id);
          playAlertBeep();
          await supabase.from('dispatch_orders').update({
            dispatch_status: 'EXPIRED',
            updated_by_role: 'dispatcher',
            updated_at: new Date().toISOString(),
          }).eq('id', o.id).eq('dispatch_status', 'OFFERED');
        }
      }
    }
    if (needsRender) renderOrders();
  }, 1000);

  setInterval(loadAllData, 10000);
}

async function verifySessionAndBoot(session) {
  if (!session?.user) {
    authOverlay.classList.remove('hidden');
    appShell.classList.add('hidden');
    return;
  }
  const email = session.user.email || '';
  const { data: prof } = await supabase.from('profiles').select('role,is_approved').eq('id', session.user.id).maybeSingle();
  const isFallbackAdmin = email.toLowerCase() === ADMIN_FALLBACK_EMAIL;
  const isAdmin = isFallbackAdmin || Boolean(prof && prof.is_approved && prof.role === 'admin');
  const allowed = isAdmin || Boolean(prof && prof.is_approved && prof.role === 'dispatcher');
  if (!allowed) {
    authStatus.textContent = `Nalog ${email} nema ulogu operatora (admin/dispatcher).`;
    authStatus.classList.remove('hidden');
    btnLogoutDenied.classList.remove('hidden');
    return;
  }
  state.user = session.user;
  state.isAdmin = isAdmin;
  if (isAdmin) {
    btnOpenUsers?.classList.remove('hidden');
    loadCompanies();
  }
  operatorEmailEl.textContent = email;
  dispatchLog('AUTH', `Prijavljen operator: ${email}`);
  authOverlay.classList.add('hidden');
  appShell.classList.remove('hidden');
  applyWorkspaceLayout();
  renderLiveFeed();
  setTimeout(() => map.invalidateSize(), 150);
  await loadAllData();
  setupRealtime();
}

function buildFullDiagnosticsReportText() {
  const selected = state.selectedCourierId ? state.couriers.get(state.selectedCourierId) : null;
  const onlineCount = Array.from(state.couriers.values()).filter((c) => isCourierEffectivelyOnline(c)).length;
  const header = [
    '=== FLASH DOSTAVA WEB DISPEČER — DIJAGNOSTIČKI IZVEŠTAJ ===',
    `Datum i vreme: ${new Date().toISOString()}`,
    `Verzija: ${DISPATCH_WEB_VERSION}`,
    `Operator: ${state.user?.email || 'nepoznato'}`,
    `Browser: ${navigator.userAgent}`,
    `Kuriri online: ${onlineCount}/${state.couriers.size}, Porudžbina: ${state.orders.length}`,
    selected ? `Izabrani kurir: ${selected.full_name || selected.user_email} (${selected.status}, aktivno=${parseCourierTrips(selected).length})` : 'Izabrani kurir: nijedan',
    '',
    `--- DIJAGNOSTIČKI LOGOVI (${debugLogs.length} zapisa) ---`,
    ...debugLogs,
    '=========================================================',
  ];
  return header.join('\n');
}

function refreshDebugModalPreview() {
  debugLogCountEl.textContent = String(debugLogs.length);
  debugLogPreviewEl.textContent = debugLogs.slice(-60).join('\n') || '(Nema zabeleženih događaja još uvek)';
}

btnOpenDebug?.addEventListener('click', () => {
  debugSendStatusEl.textContent = '';
  refreshDebugModalPreview();
  debugModal.classList.remove('hidden');
});
btnCloseDebug?.addEventListener('click', () => debugModal.classList.add('hidden'));
debugModal?.addEventListener('click', (e) => {
  if (e.target === debugModal) debugModal.classList.add('hidden');
});

btnCopyDebugLog?.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(buildFullDiagnosticsReportText());
    debugSendStatusEl.textContent = 'Log kopiran u clipboard.';
  } catch (err) {
    debugSendStatusEl.textContent = `Kopiranje nije uspelo: ${err?.message || err}`;
  }
});

btnSendDebugReport?.addEventListener('click', async () => {
  btnSendDebugReport.disabled = true;
  debugSendStatusEl.textContent = 'Šaljem izveštaj u Supabase...';
  try {
    const selected = state.selectedCourierId ? state.couriers.get(state.selectedCourierId) : null;
    const onlineCount = Array.from(state.couriers.values()).filter((c) => isCourierEffectivelyOnline(c)).length;
    const activeInfo = [
      `Online kurira: ${onlineCount}/${state.couriers.size}`,
      `Porudžbina: ${state.orders.length}`,
      selected ? `Kurir: ${selected.full_name || selected.user_email} (${selected.status})` : null,
    ].filter(Boolean).join(' | ');

    const commentText = debugCommentEl.value.trim() || 'Direktno slanje Web Dispečer loga';
    const { error } = await supabase.from('feedback_reports').insert({
      user_id: state.user?.id || null,
      user_email: state.user?.email || 'unknown',
      category: debugCategoryEl.value,
      comment: commentText,
      active_trip_info: activeInfo,
      diagnostics_log: debugIncludeLogsEl.checked ? buildFullDiagnosticsReportText() : null,
      app_version: DISPATCH_WEB_VERSION,
      device_model: navigator.userAgent.slice(0, 120),
      status: 'new',
    });
    if (error) throw error;
    dispatchLog('DEBUG', `Poslat izveštaj (${debugCategoryEl.value})`);
    debugCommentEl.value = '';
    debugSendStatusEl.textContent = '✅ Izveštaj uspešno poslat! Možeš mi javiti u chatu da ga proverim.';
    refreshDebugModalPreview();
  } catch (err) {
    dispatchLog('DEBUG/ERR', err?.message || String(err));
    debugSendStatusEl.textContent = `❌ Greška pri slanju: ${err?.message || err}`;
  } finally {
    btnSendDebugReport.disabled = false;
  }
});

btnGoogleLogin.addEventListener('click', () => {
  supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + window.location.pathname },
  });
});
const doSignOut = async () => { await supabase.auth.signOut(); window.location.reload(); };
btnLogout.addEventListener('click', doSignOut);
btnLogoutDenied.addEventListener('click', doSignOut);
btnRefresh.addEventListener('click', loadAllData);

async function loadUsers() {
  if (!state.isAdmin || !usersListEl) return;
  usersStatusEl.textContent = 'Učitavam korisnike...';
  usersListEl.innerHTML = '';
  const { data, error } = await supabase
    .from('profiles')
    .select('id,email,full_name,role,is_approved,created_at')
    .order('is_approved', { ascending: true })
    .order('created_at', { ascending: false });
  if (error) {
    usersStatusEl.textContent = `Greška: ${error.message}`;
    dispatchLog('USERS/ERR', error.message);
    return;
  }
  const rows = data || [];
  usersStatusEl.textContent = `Ukupno naloga: ${rows.length} (na čekanju: ${rows.filter((u) => !u.is_approved).length})`;
  rows.forEach((u) => {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="card-top">
        <strong>${u.full_name || u.email || 'Bez imena'}</strong>
        <span class="badge ${u.is_approved ? 'badge-green' : 'badge-orange'}">${u.is_approved ? 'Odobren' : 'Čeka odobrenje'}</span>
      </div>
      <div class="muted">${u.email || u.id}</div>
      <div class="card-actions" style="align-items:center;margin-top:8px">
        <select class="act-role" style="background:var(--bg);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:4px 8px;font-size:12px">
          <option value="courier" ${u.role === 'courier' ? 'selected' : ''}>courier</option>
          <option value="dispatcher" ${u.role === 'dispatcher' ? 'selected' : ''}>dispatcher</option>
          <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>admin</option>
        </select>
        <button type="button" class="btn btn-xs ${u.is_approved ? 'btn-secondary' : 'btn-primary'} act-toggle-approve">
          ${u.is_approved ? 'Ukloni odobrenje' : 'Odobri'}
        </button>
      </div>
    `;
    const roleSel = card.querySelector('.act-role');
    roleSel?.addEventListener('change', async () => {
      const nextRole = roleSel.value;
      const { error: upErr } = await supabase.from('profiles').update({ role: nextRole }).eq('id', u.id);
      if (upErr) {
        usersStatusEl.textContent = `Greška izmene uloge: ${upErr.message}`;
        return;
      }
      dispatchLog('USERS', `Promenjena uloga ${u.email} -> ${nextRole}`);
      await loadUsers();
    });
    card.querySelector('.act-toggle-approve')?.addEventListener('click', async () => {
      const nextApproved = !u.is_approved;
      const { error: upErr } = await supabase.from('profiles').update({ is_approved: nextApproved }).eq('id', u.id);
      if (upErr) {
        usersStatusEl.textContent = `Greška odobrenja: ${upErr.message}`;
        return;
      }
      dispatchLog('USERS', `${u.email} is_approved=${nextApproved}`);
      await loadUsers();
    });
    usersListEl.appendChild(card);
  });
}

let activeUsersModalTab = 'staff';

function setUsersModalTab(tab) {
  activeUsersModalTab = tab === 'companies' ? 'companies' : 'staff';
  tabUsersStaffEl?.classList.toggle('active', activeUsersModalTab === 'staff');
  tabUsersCompaniesEl?.classList.toggle('active', activeUsersModalTab === 'companies');
  usersStaffPaneEl?.classList.toggle('hidden', activeUsersModalTab !== 'staff');
  usersCompaniesPaneEl?.classList.toggle('hidden', activeUsersModalTab !== 'companies');
}

async function loadCompanies() {
  if (!state.isAdmin || !companiesListEl) return;
  companiesStatusEl.textContent = 'Učitavam firme...';
  companiesListEl.innerHTML = '';
  const [{ data: companies, error: cErr }, { data: branches, error: bErr }] = await Promise.all([
    supabase
      .from('company_accounts')
      .select('user_id,email,company_name,contact_name,phone,pib,notes,is_approved,approved_at,approved_by,created_at')
      .order('is_approved', { ascending: true })
      .order('created_at', { ascending: false }),
    supabase
      .from('company_branches')
      .select('id,company_user_id,branch_name,address,phone,is_default,is_active')
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: true }),
  ]);

  if (cErr) {
    companiesStatusEl.textContent = `Greška: ${cErr.message}`;
    dispatchLog('COMPANIES/ERR', cErr.message);
    return;
  }
  if (bErr) {
    dispatchLog('COMPANIES/BRANCHES/ERR', bErr.message);
  }

  const rows = companies || [];
  const branchesByUser = new Map();
  (branches || []).forEach((b) => {
    if (!branchesByUser.has(b.company_user_id)) branchesByUser.set(b.company_user_id, []);
    branchesByUser.get(b.company_user_id).push(b);
  });

  const pendingCount = rows.filter((r) => !r.is_approved).length;
  if (companiesPendingCountEl) companiesPendingCountEl.textContent = String(pendingCount);
  if (btnOpenUsers) {
    btnOpenUsers.textContent = pendingCount > 0 ? `👥 Korisnici (${pendingCount})` : '👥 Korisnici';
  }
  tabUsersCompaniesEl?.classList.toggle('has-waiting', pendingCount > 0);
  companiesStatusEl.textContent = `Ukupno firmi: ${rows.length} (na čekanju: ${pendingCount})`;

  if (!rows.length) {
    companiesListEl.innerHTML = '<div class="muted" style="padding:10px 0">Još nema registrovanih partnerskih firmi.</div>';
    return;
  }

  rows.forEach((co) => {
    const coBranches = branchesByUser.get(co.user_id) || [];
    const branchesHtml = coBranches.length
      ? coBranches.map((b) => `<div class="muted" style="font-size:11px">📍 <strong>${escapeHtml(b.branch_name)}</strong>${b.is_default ? ' (glavna)' : ''}: ${escapeHtml(b.address)}${b.phone ? ` • ${escapeHtml(b.phone)}` : ''}</div>`).join('')
      : '<div class="muted" style="font-size:11px">Nema dodatih filijala.</div>';

    const card = document.createElement('div');
    card.className = `card${co.is_approved ? '' : ' card-unassigned'}`;
    card.innerHTML = `
      <div class="card-top">
        <strong>🏢 ${escapeHtml(co.company_name)}</strong>
        <span class="badge ${co.is_approved ? 'badge-green' : 'badge-orange'}">${co.is_approved ? 'Odobrena' : 'Čeka odobrenje'}</span>
      </div>
      <div class="muted">${escapeHtml(co.email || co.user_id)}${co.phone ? ` • ${escapeHtml(co.phone)}` : ''}${co.contact_name ? ` • ${escapeHtml(co.contact_name)}` : ''}</div>
      ${co.pib ? `<div class="muted" style="font-size:11px">PIB: ${escapeHtml(co.pib)}</div>` : ''}
      ${co.notes ? `<div style="color:#ffe082;font-size:11px;margin-top:2px">Napomena: ${escapeHtml(co.notes)}</div>` : ''}
      <div style="margin-top:6px;display:flex;flex-direction:column;gap:2px">${branchesHtml}</div>
      <div class="card-actions" style="margin-top:8px">
        <button type="button" class="btn btn-xs ${co.is_approved ? 'btn-secondary' : 'btn-primary'} act-toggle-company">
          ${co.is_approved ? 'Ukloni odobrenje' : '✅ Odobri firmu'}
        </button>
      </div>
    `;
    card.querySelector('.act-toggle-company')?.addEventListener('click', async () => {
      const nextApproved = !co.is_approved;
      const patch = {
        is_approved: nextApproved,
        approved_at: nextApproved ? new Date().toISOString() : null,
        approved_by: nextApproved ? (state.user?.email || null) : null,
      };
      const { error: upErr } = await supabase.from('company_accounts').update(patch).eq('user_id', co.user_id);
      if (upErr) {
        companiesStatusEl.textContent = `Greška odobrenja firme: ${upErr.message}`;
        return;
      }
      dispatchLog('COMPANIES', `${co.company_name} (${co.email}) is_approved=${nextApproved}`);
      await loadCompanies();
    });
    companiesListEl.appendChild(card);
  });
}

tabUsersStaffEl?.addEventListener('click', () => setUsersModalTab('staff'));
tabUsersCompaniesEl?.addEventListener('click', () => {
  setUsersModalTab('companies');
  loadCompanies();
});

btnOpenUsers?.addEventListener('click', () => {
  usersModal?.classList.remove('hidden');
  loadUsers();
  loadCompanies();
});
btnRefreshUsers?.addEventListener('click', () => {
  loadUsers();
  loadCompanies();
});
btnCloseUsers?.addEventListener('click', () => usersModal?.classList.add('hidden'));
usersModal?.addEventListener('click', (e) => {
  if (e.target === usersModal) usersModal.classList.add('hidden');
});

// --- Live Activity Feed ---
function todayDateKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function loadSavedFeedEvents() {
  try {
    const raw = localStorage.getItem(FEED_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.date !== todayDateKey() || !Array.isArray(parsed.events)) return [];
    return parsed.events.slice(0, MAX_FEED_ITEMS);
  } catch (_) {
    return [];
  }
}

function saveFeedEvents() {
  try {
    localStorage.setItem(FEED_STORAGE_KEY, JSON.stringify({
      date: todayDateKey(),
      events: state.feedEvents.slice(0, MAX_FEED_ITEMS),
    }));
  } catch (_) {}
}

state.feedEvents = loadSavedFeedEvents();

function shortPlaceLabel(addr, partnerName) {
  if (partnerName) return partnerName;
  const s = String(addr || '').trim();
  if (!s) return '';
  return s.split(',')[0].trim();
}

function pushFeedEvent({ icon, category, actor, text, courierId = null, dedupeKey = '' }) {
  const now = Date.now();
  if (dedupeKey) {
    const prevTs = state.feedDedupeMap.get(dedupeKey);
    if (prevTs && now - prevTs < 15_000) return;
    state.feedDedupeMap.set(dedupeKey, now);
    if (state.feedDedupeMap.size > 300) {
      for (const [k, ts] of state.feedDedupeMap.entries()) {
        if (now - ts > 60_000) state.feedDedupeMap.delete(k);
      }
    }
  }
  const timeStr = new Date(now).toTimeString().slice(0, 8);
  state.feedEvents.unshift({
    id: `${now}-${Math.random().toString(36).slice(2, 7)}`,
    ts: now,
    time: timeStr,
    icon: icon || '📌',
    category: category || 'delivery',
    actor: actor || 'Sistem',
    text: text || '',
    courierId: courierId || null,
  });
  if (state.feedEvents.length > MAX_FEED_ITEMS) {
    state.feedEvents.length = MAX_FEED_ITEMS;
  }
  saveFeedEvents();
  renderLiveFeed();
}

function describeTripStatusTransition(prevStatus, nextStatus, trip) {
  const pickup = shortPlaceLabel(trip.pickup_address, trip.partner_name) || 'lokal';
  const delivery = shortPlaceLabel(trip.delivery_address) || 'kupca';
  const prev = String(prevStatus || '').toUpperCase();
  const next = String(nextStatus || '').toUpperCase();
  switch (next) {
    case 'EN_ROUTE_PICKUP':
      return { icon: '🛵', category: 'pickup', text: `krenuo po robu (${pickup})` };
    case 'AT_PICKUP':
      return { icon: '🏪', category: 'pickup', text: `stigao u lokal (${pickup})` };
    case 'EN_ROUTE_WAYPOINT':
      return { icon: '📦', category: 'delivery', text: `pokupio robu (${pickup}) • ide na usputno stajanje` };
    case 'AT_WAYPOINT':
      return { icon: '🛒', category: 'arrived', text: `stigao na usputno stajanje` };
    case 'EN_ROUTE_CUSTOMER':
      if (prev === 'EN_ROUTE_PICKUP' || prev === 'AT_PICKUP' || prev === 'CALL_RECEIVED' || !prev) {
        return { icon: '🚀', category: 'delivery', text: `pokupio robu (${pickup}) i krenuo ka ${delivery}` };
      }
      return { icon: '➡️', category: 'delivery', text: `nastavio dostavu ka ${delivery}` };
    case 'AT_CUSTOMER':
      return { icon: '📍', category: 'arrived', text: `na lokaciji kupca (${delivery})` };
    case 'COMPLETED':
      return { icon: '✅', category: 'done', text: `završio dostavu (${delivery})` };
    case 'CANCELLED':
      return { icon: '🚫', category: 'warn', text: `otkazana vožnja (${pickup})` };
    default:
      return null;
  }
}

function buildCourierTripsSnapshotMap(trips) {
  const mapOut = new Map();
  (trips || []).forEach((t, idx) => {
    const key = String(t.dispatch_order_id || t.trip_id || idx);
    const wps = Array.isArray(t.waypoints) ? t.waypoints : [];
    mapOut.set(key, {
      key,
      status: String(t.status || 'IDLE').toUpperCase(),
      pickup_address: t.pickup_address || '',
      partner_name: t.partner_name || '',
      delivery_address: t.delivery_address || '',
      goods_cost: Number(t.goods_cost || 0),
      source: t.source || (t.dispatch_order_id ? 'dispatch' : 'voice'),
      dispatch_order_id: t.dispatch_order_id || null,
      waypoints: wps.map((wp, wIdx) => ({
        key: String(wp.address || wIdx),
        address: wp.address || `Stajanje #${wIdx + 1}`,
        is_visited: Boolean(wp.is_visited),
        amount_collected: Number(wp.amount_collected || 0),
        goods_cost: Number(wp.goods_cost || 0),
      })),
    });
  });
  return mapOut;
}

function processCouriersFeedDiff(couriersIterable, isInitial = false) {
  for (const c of couriersIterable || []) {
    if (!c || !c.user_id) continue;
    const presence = getCourierPresence(c);
    const available = presence !== 'offline';
    const actor = c.full_name || c.user_email || 'Kurir';
    const trips = available ? parseCourierTrips(c) : [];
    const nextTripsMap = buildCourierTripsSnapshotMap(trips);
    const prev = state.prevCouriersSnapshot.get(c.user_id);

    if (!isInitial && prev) {
      const prevPresence = prev.presence || (prev.online ? 'online' : 'offline');
      if (prevPresence === 'offline' && presence !== 'offline') {
        pushFeedEvent({
          icon: '🟢',
          category: 'online',
          actor,
          text: 'priključio se na mrežu',
          courierId: c.user_id,
          dedupeKey: `presence:${c.user_id}:online`,
        });
      } else if (prevPresence === 'online' && presence === 'standby') {
        pushFeedEvent({
          icon: '⏸️',
          category: 'standby',
          actor,
          text: 'na čekanju (dostupan za porudžbine)',
          courierId: c.user_id,
          dedupeKey: `presence:${c.user_id}:standby`,
        });
      } else if (prevPresence === 'standby' && presence === 'online') {
        pushFeedEvent({
          icon: '🟢',
          category: 'online',
          actor,
          text: 'ponovo aktivan',
          courierId: c.user_id,
          dedupeKey: `presence:${c.user_id}:active`,
        });
      } else if (prevPresence !== 'offline' && presence === 'offline') {
        pushFeedEvent({
          icon: '⚫',
          category: 'offline',
          actor,
          text: 'otišao van mreže',
          courierId: c.user_id,
          dedupeKey: `presence:${c.user_id}:offline`,
        });
      }

      if (available) {
        for (const [tKey, tNext] of nextTripsMap.entries()) {
          const tPrev = prev.tripsMap.get(tKey);
          const pickup = shortPlaceLabel(tNext.pickup_address, tNext.partner_name) || 'lokal';
          const delivery = shortPlaceLabel(tNext.delivery_address) || 'bez adrese';

          if (!tPrev) {
            if (tNext.source === 'voice') {
              pushFeedEvent({
                icon: '🎙️',
                category: 'pickup',
                actor,
                text: `dodao glasovnu vožnju (${pickup} → ${delivery})`,
                courierId: c.user_id,
                dedupeKey: `newtrip:${c.user_id}:${tKey}`,
              });
            } else {
              const stepMeta = describeTripStatusTransition('', tNext.status, tNext);
              if (stepMeta) {
                pushFeedEvent({
                  icon: stepMeta.icon,
                  category: stepMeta.category,
                  actor,
                  text: stepMeta.text,
                  courierId: c.user_id,
                  dedupeKey: `tripst:${tKey}:${tNext.status}`,
                });
              }
            }
            continue;
          }

          if (tPrev.status !== tNext.status) {
            const stepMeta = describeTripStatusTransition(tPrev.status, tNext.status, tNext);
            if (stepMeta) {
              pushFeedEvent({
                icon: stepMeta.icon,
                category: stepMeta.category,
                actor,
                text: stepMeta.text,
                courierId: c.user_id,
                dedupeKey: `tripst:${tKey}:${tNext.status}`,
              });
            }
          }

          if (!tPrev.delivery_address && tNext.delivery_address) {
            pushFeedEvent({
              icon: '✏️',
              category: 'edit',
              actor,
              text: `dodao adresu dostave: ${shortPlaceLabel(tNext.delivery_address)}`,
              courierId: c.user_id,
              dedupeKey: `deladdr:${tKey}:${tNext.delivery_address}`,
            });
          } else if (tPrev.delivery_address && tNext.delivery_address && tPrev.delivery_address !== tNext.delivery_address) {
            pushFeedEvent({
              icon: '✏️',
              category: 'edit',
              actor,
              text: `izmenio adresu dostave: ${shortPlaceLabel(tNext.delivery_address)}`,
              courierId: c.user_id,
              dedupeKey: `deladdr:${tKey}:${tNext.delivery_address}`,
            });
          }

          if (tNext.waypoints.length > tPrev.waypoints.length) {
            const added = tNext.waypoints.slice(tPrev.waypoints.length);
            const wpLabels = added.map((w) => shortPlaceLabel(w.address)).filter(Boolean).join(', ');
            pushFeedEvent({
              icon: '➕',
              category: 'edit',
              actor,
              text: `dodao usputno stajanje${wpLabels ? `: ${wpLabels}` : ''}`,
              courierId: c.user_id,
              dedupeKey: `wpadd:${tKey}:${tNext.waypoints.length}`,
            });
          }

          tNext.waypoints.forEach((wpNext, wIdx) => {
            const wpPrev = tPrev.waypoints[wIdx];
            if (wpPrev && !wpPrev.is_visited && wpNext.is_visited) {
              const collTxt = wpNext.amount_collected > 0 ? ` (+naplaćeno ${Math.round(wpNext.amount_collected)} RSD)` : '';
              pushFeedEvent({
                icon: '✓',
                category: 'done',
                actor,
                text: `obavio stajanje ${shortPlaceLabel(wpNext.address)}${collTxt}`,
                courierId: c.user_id,
                dedupeKey: `wpvisit:${tKey}:${wIdx}`,
              });
            }
          });

          if (Math.round(tPrev.goods_cost) !== Math.round(tNext.goods_cost)) {
            pushFeedEvent({
              icon: '💰',
              category: 'edit',
              actor,
              text: `izmenio cenu robe (${Math.round(tPrev.goods_cost)} → ${Math.round(tNext.goods_cost)} RSD)`,
              courierId: c.user_id,
              dedupeKey: `goods:${tKey}:${Math.round(tNext.goods_cost)}`,
            });
          }
        }

        for (const [oldKey, tOld] of prev.tripsMap.entries()) {
          if (!nextTripsMap.has(oldKey) && tOld.status !== 'COMPLETED' && tOld.status !== 'CANCELLED') {
            const ord = tOld.dispatch_order_id ? state.orders.find((o) => o.id === tOld.dispatch_order_id) : null;
            if (!ord || (ord.dispatch_status !== 'CANCELLED' && ord.trip_status !== 'CANCELLED')) {
              const delivery = shortPlaceLabel(tOld.delivery_address) || shortPlaceLabel(tOld.pickup_address, tOld.partner_name) || 'vožnju';
              pushFeedEvent({
                icon: '🏁',
                category: 'done',
                actor,
                text: `završio dostavu (${delivery})`,
                courierId: c.user_id,
                dedupeKey: `tripst:${oldKey}:COMPLETED`,
              });
            }
          }
        }
      }
    }

    state.prevCouriersSnapshot.set(c.user_id, {
      online: available,
      presence,
      name: actor,
      tripsMap: nextTripsMap,
    });
  }
}

function processOrdersFeedDiff(ordersArray, isInitial = false) {
  for (const o of ordersArray || []) {
    if (!o || !o.id) continue;
    const prev = state.prevOrdersSnapshot.get(o.id);
    const code = o.order_code ? `#${o.order_code}` : '';
    const pickup = shortPlaceLabel(o.pickup_address, o.pickup_name) || 'lokal';
    const delivery = shortPlaceLabel(o.delivery_address);
    const actor = o.assigned_courier_name || o.assigned_courier_email || 'Dispečer';
    const curWpsLen = parseOrderWaypoints(o).length;

    if (!isInitial) {
      if (!prev) {
        if (o.dispatch_status === 'UNASSIGNED') {
          const isCompanyOrder = o.order_source === 'company' || Boolean(o.company_user_id);
          if (isCompanyOrder) playAlertBeep();
          pushFeedEvent({
            icon: isCompanyOrder ? '🏢' : '⏳',
            category: 'edit',
            actor: isCompanyOrder ? (o.company_name || 'Firma') : 'Dispečer',
            text: isCompanyOrder
              ? `poslala novu porudžbinu ${code} (${pickup}${delivery ? ` → ${delivery}` : ''}) — čeka dodelu`
              : `nova nedodeljena porudžbina ${code} (${pickup}${delivery ? ` → ${delivery}` : ''}) — čeka dodelu`,
            courierId: null,
            dedupeKey: `ordnew:${o.id}`,
          });
        } else if (o.dispatch_status !== 'CANCELLED' && o.dispatch_status !== 'COMPLETED') {
          pushFeedEvent({
            icon: '📨',
            category: 'pickup',
            actor: 'Dispečer',
            text: `nova porudžbina ${code} (${pickup}${delivery ? ` → ${delivery}` : ''}) → ${actor}`,
            courierId: o.assigned_courier_id || null,
            dedupeKey: `ordnew:${o.id}`,
          });
        }
      } else {
        if (prev.dispatch_status !== o.dispatch_status) {
          if (o.dispatch_status === 'UNASSIGNED') {
            pushFeedEvent({
              icon: '⏳',
              category: 'edit',
              actor: 'Dispečer',
              text: `porudžbina ${code} vraćena na čekanje (${pickup})`,
              courierId: null,
              dedupeKey: `ordst:${o.id}:UNASSIGNED`,
            });
          } else if (o.dispatch_status === 'ACCEPTED') {
            pushFeedEvent({
              icon: '👍',
              category: 'pickup',
              actor,
              text: `prihvatio porudžbinu ${code} (${pickup})`,
              courierId: o.assigned_courier_id || null,
              dedupeKey: `ordst:${o.id}:ACCEPTED`,
            });
          } else if (o.dispatch_status === 'REJECTED') {
            pushFeedEvent({
              icon: '❌',
              category: 'warn',
              actor,
              text: `odbio porudžbinu ${code} (${pickup})`,
              courierId: o.assigned_courier_id || null,
              dedupeKey: `ordst:${o.id}:REJECTED`,
            });
          } else if (o.dispatch_status === 'EXPIRED') {
            pushFeedEvent({
              icon: '⏰',
              category: 'warn',
              actor,
              text: `istekla ponuda ${code} (${pickup})`,
              courierId: o.assigned_courier_id || null,
              dedupeKey: `ordst:${o.id}:EXPIRED`,
            });
          } else if (o.dispatch_status === 'CANCELLED') {
            pushFeedEvent({
              icon: '🚫',
              category: 'warn',
              actor: 'Dispečer',
              text: `otkazana porudžbina ${code} (${pickup})`,
              courierId: o.assigned_courier_id || null,
              dedupeKey: `ordst:${o.id}:CANCELLED`,
            });
          } else if (o.dispatch_status === 'COMPLETED') {
            pushFeedEvent({
              icon: '✅',
              category: 'done',
              actor,
              text: `završio porudžbinu ${code} (${delivery || pickup})`,
              courierId: o.assigned_courier_id || null,
              dedupeKey: `tripst:${o.id}:COMPLETED`,
            });
          } else if (o.dispatch_status === 'OFFERED') {
            pushFeedEvent({
              icon: '📤',
              category: 'pickup',
              actor: 'Dispečer',
              text: `poslata ponuda ${code} → ${actor}`,
              courierId: o.assigned_courier_id || null,
              dedupeKey: `ordoffer:${o.id}:${o.assigned_courier_id || ''}`,
            });
          }
        } else if (
          prev.trip_status !== o.trip_status &&
          o.dispatch_status === 'ACCEPTED'
        ) {
          const stepMeta = describeTripStatusTransition(prev.trip_status, o.trip_status, o);
          if (stepMeta) {
            pushFeedEvent({
              icon: stepMeta.icon,
              category: stepMeta.category,
              actor,
              text: `${stepMeta.text} (${code})`,
              courierId: o.assigned_courier_id || null,
              dedupeKey: `tripst:${o.id}:${o.trip_status}`,
            });
          }
        }

        if (
          prev.dispatch_status === o.dispatch_status &&
          o.dispatch_status !== 'COMPLETED' &&
          o.dispatch_status !== 'CANCELLED' &&
          (prev.wpsLen !== curWpsLen ||
            Math.round(prev.goods_cost) !== Math.round(o.goods_cost || 0) ||
            prev.delivery_address !== (o.delivery_address || ''))
        ) {
          pushFeedEvent({
            icon: '✏️',
            category: 'edit',
            actor: 'Dispečer',
            text: `izmenjena porudžbina ${code} (${pickup})`,
            courierId: o.assigned_courier_id || null,
            dedupeKey: `ordedit:${o.id}:${o.updated_at || ''}`,
          });
        }
      }
    }

    state.prevOrdersSnapshot.set(o.id, {
      dispatch_status: o.dispatch_status,
      trip_status: o.trip_status,
      goods_cost: Number(o.goods_cost || 0),
      delivery_address: o.delivery_address || '',
      wpsLen: curWpsLen,
    });
  }
}

function renderLiveFeed() {
  if (!liveFeedListEl) return;
  const filterBySelected = state.feedFilterSelectedOnly && Boolean(state.selectedCourierId);
  const selectedCourier = filterBySelected ? state.couriers.get(state.selectedCourierId) : null;
  if (btnFeedFilter) {
    if (state.feedFilterSelectedOnly && selectedCourier) {
      const shortName = (selectedCourier.full_name || selectedCourier.user_email || 'Kurir').split(' ')[0];
      btnFeedFilter.textContent = `Filter: ${shortName}`;
      btnFeedFilter.classList.add('btn-primary');
      btnFeedFilter.classList.remove('btn-secondary');
    } else {
      btnFeedFilter.textContent = state.feedFilterSelectedOnly ? 'Filter: izaberi kurira' : 'Svi kuriri';
      btnFeedFilter.classList.remove('btn-primary');
      btnFeedFilter.classList.add('btn-secondary');
    }
  }

  const visibleEvents = filterBySelected
    ? state.feedEvents.filter((ev) => ev.courierId === state.selectedCourierId)
    : state.feedEvents;

  if (liveFeedCountEl) liveFeedCountEl.textContent = String(visibleEvents.length);
  state.badgeCounts.feed = visibleEvents.length;
  refreshPanelTabBadges();
  liveFeedListEl.innerHTML = '';

  if (!visibleEvents.length) {
    const empty = document.createElement('div');
    empty.className = 'feed-empty';
    empty.textContent = filterBySelected
      ? 'Nema zabeleženih događaja za izabranog kurira.'
      : 'Čekam promene statusa kurira i porudžbina uživo...';
    liveFeedListEl.appendChild(empty);
    return;
  }

  visibleEvents.forEach((ev) => {
    const row = document.createElement('div');
    row.className = `feed-item feed-cat-${escapeHtml(ev.category || 'delivery')}${ev.courierId ? ' clickable' : ''}`;
    row.innerHTML = `
      <span class="feed-icon">${escapeHtml(ev.icon || '📌')}</span>
      <span class="feed-body-text"><span class="feed-actor">${escapeHtml(ev.actor)}</span> <span class="feed-msg">${escapeHtml(ev.text)}</span></span>
      <span class="feed-time">${escapeHtml(ev.time)}</span>
    `;
    if (ev.courierId) {
      row.title = 'Klikni za fokus kurira na mapi';
      row.addEventListener('click', () => selectCourier(ev.courierId, true));
    }
    liveFeedListEl.appendChild(row);
  });
}

btnFeedFilter?.addEventListener('click', () => {
  state.feedFilterSelectedOnly = !state.feedFilterSelectedOnly;
  renderLiveFeed();
});

btnFeedClear?.addEventListener('click', () => {
  state.feedEvents = [];
  saveFeedEvents();
  renderLiveFeed();
});

// --- Blender-Style BSP Docking & Saved Workspaces Manager ---
const PANEL_IDS = ['map', 'couriers', 'feed', 'orderForm', 'waiting', 'active', 'history'];
const PANEL_ELEMENTS = {
  map: panelMapEl,
  couriers: panelCouriersEl,
  feed: panelFeedEl,
  orderForm: panelOrderFormEl,
  waiting: panelWaitingEl,
  active: panelActiveEl,
  history: panelHistoryEl,
};
const PANEL_META = {
  map: { title: 'Mapa', icon: '🗺️', closable: false },
  couriers: { title: 'Kuriri', icon: '🚗', closable: true, badgeKey: 'couriers' },
  feed: { title: 'Live Feed', icon: '📡', closable: true, badgeKey: 'feed' },
  orderForm: { title: 'Nova porudžbina', icon: '📝', closable: true },
  waiting: { title: 'Čekaju', icon: '⏳', closable: true, badgeKey: 'waiting' },
  active: { title: 'Aktivne', icon: '📦', closable: true, badgeKey: 'active' },
  history: { title: 'Istorija', icon: '📜', closable: true, badgeKey: 'history' },
};

let leafSeq = 0;
function nextLeafId() {
  leafSeq += 1;
  return `leaf_${Date.now().toString(36)}_${leafSeq}`;
}

function makeLeaf(panels, active) {
  const arr = Array.isArray(panels) ? panels.filter((p) => PANEL_IDS.includes(p)) : [];
  return {
    type: 'leaf',
    id: nextLeafId(),
    panels: arr,
    active: arr.includes(active) ? active : (arr[0] || null),
  };
}

function makeSplit(dir, ratio, a, b) {
  return {
    type: 'split',
    dir: dir === 'col' ? 'col' : 'row',
    ratio: Math.min(0.85, Math.max(0.15, Number(ratio || 0.5))),
    a,
    b,
  };
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function buildBuiltinPreset(presetId) {
  if (presetId === 'split_orders') {
    return {
      overlays: { eta: true, legend: true },
      floating: {},
      hidden: [],
      root: makeSplit(
        'row',
        0.21,
        makeSplit('col', 0.62, makeLeaf(['couriers']), makeLeaf(['feed'])),
        makeSplit(
          'row',
          0.67,
          makeSplit(
            'col',
            0.62,
            makeLeaf(['map']),
            makeSplit('row', 0.5, makeLeaf(['waiting']), makeLeaf(['active']))
          ),
          makeSplit('col', 0.54, makeLeaf(['orderForm']), makeLeaf(['history']))
        )
      ),
    };
  }
  if (presetId === 'map_focus') {
    return {
      overlays: { eta: true, legend: true },
      floating: {},
      hidden: ['feed', 'orderForm', 'history'],
      root: makeSplit(
        'row',
        0.21,
        makeLeaf(['couriers']),
        makeSplit(
          'row',
          0.72,
          makeLeaf(['map']),
          makeSplit('col', 0.45, makeLeaf(['waiting']), makeLeaf(['active']))
        )
      ),
    };
  }
  // 'standard' default
  return {
    overlays: { eta: true, legend: true },
    floating: {},
    hidden: [],
    root: makeSplit(
      'row',
      0.22,
      makeSplit('col', 0.62, makeLeaf(['couriers']), makeLeaf(['feed'])),
      makeSplit(
        'row',
        0.64,
        makeLeaf(['map']),
        makeSplit(
          'col',
          0.54,
          makeLeaf(['orderForm']),
          makeLeaf(['waiting', 'active', 'history'], 'active')
        )
      )
    ),
  };
}

const BUILTIN_PRESETS = [
  { id: 'standard', name: 'Standard', builtin: true },
  { id: 'split_orders', name: 'Razdvojene kartice', builtin: true },
  { id: 'map_focus', name: 'Fokus Mapa', builtin: true },
];

function collectDockedPanelIds(node, out = []) {
  if (!node) return out;
  if (node.type === 'leaf') {
    (node.panels || []).forEach((p) => { if (PANEL_IDS.includes(p)) out.push(p); });
  } else if (node.type === 'split') {
    collectDockedPanelIds(node.a, out);
    collectDockedPanelIds(node.b, out);
  }
  return out;
}

function findLeafContainingPanel(node, pid) {
  if (!node) return null;
  if (node.type === 'leaf') {
    return (node.panels || []).includes(pid) ? node : null;
  }
  return findLeafContainingPanel(node.a, pid) || findLeafContainingPanel(node.b, pid);
}

function findLeafById(node, leafId) {
  if (!node) return null;
  if (node.type === 'leaf') return node.id === leafId ? node : null;
  return findLeafById(node.a, leafId) || findLeafById(node.b, leafId);
}

function removePanelFromTree(node, pid) {
  if (!node) return null;
  if (node.type === 'leaf') {
    const remaining = (node.panels || []).filter((p) => p !== pid);
    if (!remaining.length) return null;
    return {
      ...node,
      panels: remaining,
      active: remaining.includes(node.active) ? node.active : remaining[0],
    };
  }
  const nextA = removePanelFromTree(node.a, pid);
  const nextB = removePanelFromTree(node.b, pid);
  if (!nextA) return nextB;
  if (!nextB) return nextA;
  return { ...node, a: nextA, b: nextB };
}

function insertPanelInTree(node, targetLeafId, pid, zone) {
  if (!node) return makeLeaf([pid]);
  if (node.type === 'leaf') {
    if (node.id !== targetLeafId) return node;
    if (zone === 'center') {
      const panels = node.panels.includes(pid) ? node.panels : [...node.panels, pid];
      return { ...node, panels, active: pid };
    }
    const newLeaf = makeLeaf([pid]);
    if (zone === 'left') return makeSplit('row', 0.38, newLeaf, node);
    if (zone === 'right') return makeSplit('row', 0.62, node, newLeaf);
    if (zone === 'top') return makeSplit('col', 0.38, newLeaf, node);
    return makeSplit('col', 0.62, node, newLeaf);
  }
  return {
    ...node,
    a: insertPanelInTree(node.a, targetLeafId, pid, zone),
    b: insertPanelInTree(node.b, targetLeafId, pid, zone),
  };
}

function sanitizeNode(node, seen) {
  if (!node || typeof node !== 'object') return null;
  if (node.type === 'leaf') {
    const valid = [];
    for (const pid of node.panels || []) {
      if (PANEL_IDS.includes(pid) && !seen.has(pid)) {
        seen.add(pid);
        valid.push(pid);
      }
    }
    if (!valid.length) return null;
    return {
      type: 'leaf',
      id: typeof node.id === 'string' && node.id ? node.id : nextLeafId(),
      panels: valid,
      active: valid.includes(node.active) ? node.active : valid[0],
    };
  }
  if (node.type === 'split') {
    const a = sanitizeNode(node.a, seen);
    const b = sanitizeNode(node.b, seen);
    if (!a) return b;
    if (!b) return a;
    return makeSplit(node.dir, node.ratio, a, b);
  }
  return null;
}

function sanitizeLayout(raw) {
  const def = buildBuiltinPreset('standard');
  if (!raw || typeof raw !== 'object') return def;
  const seen = new Set();
  let root = sanitizeNode(raw.root, seen);
  const floating = {};
  if (raw.floating && typeof raw.floating === 'object') {
    Object.entries(raw.floating).forEach(([pid, cfg]) => {
      if (!PANEL_IDS.includes(pid) || seen.has(pid) || !cfg || typeof cfg !== 'object') return;
      seen.add(pid);
      floating[pid] = {
        x: Number.isFinite(Number(cfg.x)) ? Number(cfg.x) : 40,
        y: Number.isFinite(Number(cfg.y)) ? Number(cfg.y) : 72,
        w: Math.max(260, Number(cfg.w || 360)),
        h: Math.max(160, Number(cfg.h || 340)),
        minimized: Boolean(cfg.minimized),
      };
    });
  }
  if (!seen.has('map')) {
    root = root ? makeSplit('row', 0.65, makeLeaf(['map']), root) : makeLeaf(['map']);
    seen.add('map');
  }
  const hidden = Array.isArray(raw.hidden)
    ? raw.hidden.filter((pid) => pid !== 'map' && PANEL_IDS.includes(pid) && !seen.has(pid))
    : [];
  hidden.forEach((pid) => seen.add(pid));
  // Bilo koji novootkriveni panel koji nije nigde — smesti ga bezbedno u drvo
  PANEL_IDS.forEach((pid) => {
    if (!seen.has(pid)) {
      root = makeSplit('row', 0.72, root, makeLeaf([pid]));
      seen.add(pid);
    }
  });
  return {
    overlays: {
      eta: raw.overlays?.eta !== false,
      legend: raw.overlays?.legend !== false,
    },
    floating,
    hidden,
    root: root || def.root,
  };
}

function buildInitialWorkspaceStore() {
  const presets = {};
  BUILTIN_PRESETS.forEach((bp) => {
    presets[bp.id] = {
      id: bp.id,
      name: bp.name,
      builtin: true,
      layout: buildBuiltinPreset(bp.id),
    };
  });
  return {
    activePresetId: 'standard',
    presets,
    working: deepClone(presets.standard.layout),
  };
}

function loadWorkspaceStore() {
  const initial = buildInitialWorkspaceStore();
  try {
    const raw = localStorage.getItem(WORKSPACES_STORAGE_KEY);
    if (!raw) return initial;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return initial;
    const merged = buildInitialWorkspaceStore();
    if (parsed.presets && typeof parsed.presets === 'object') {
      Object.entries(parsed.presets).forEach(([id, entry]) => {
        if (!entry || typeof entry !== 'object' || merged.presets[id]?.builtin) return;
        merged.presets[id] = {
          id,
          name: String(entry.name || id).slice(0, 40),
          builtin: false,
          layout: sanitizeLayout(entry.layout),
        };
      });
    }
    if (parsed.activePresetId && merged.presets[parsed.activePresetId]) {
      merged.activePresetId = parsed.activePresetId;
    }
    merged.working = parsed.working
      ? sanitizeLayout(parsed.working)
      : deepClone(merged.presets[merged.activePresetId].layout);
    return merged;
  } catch (_) {
    return initial;
  }
}

function saveWorkspaceStore() {
  if (!state.workspaceStore || !state.layout) return;
  try {
    state.workspaceStore.working = state.layout;
    localStorage.setItem(WORKSPACES_STORAGE_KEY, JSON.stringify(state.workspaceStore));
  } catch (_) {}
}

state.workspaceStore = loadWorkspaceStore();
state.layout = state.workspaceStore.working;
let topFloatingZIndex = 1210;

function getPanelVisibilityMap() {
  const visible = {};
  const docked = new Set(collectDockedPanelIds(state.layout?.root));
  PANEL_IDS.forEach((pid) => {
    visible[pid] = docked.has(pid) || Boolean(state.layout?.floating?.[pid]);
  });
  return visible;
}

function refreshPanelTabBadges() {
  document.querySelectorAll('.bsp-tab[data-panel]').forEach((tabBtn) => {
    const pid = tabBtn.getAttribute('data-panel');
    const meta = PANEL_META[pid];
    if (!meta || !meta.badgeKey) return;
    const cnt = Number(state.badgeCounts[meta.badgeKey] || 0);
    const badgeEl = tabBtn.querySelector('.bsp-tab-badge');
    if (badgeEl) badgeEl.textContent = String(cnt);
    if (pid === 'waiting') {
      tabBtn.classList.toggle('has-waiting', cnt > 0);
    }
  });
}

function clampFloatingCoords(cfg) {
  const maxW = Math.max(260, window.innerWidth - 24);
  const maxH = Math.max(160, window.innerHeight - 64);
  cfg.w = Math.min(maxW, Math.max(260, Number(cfg.w || 360)));
  cfg.h = Math.min(maxH, Math.max(160, Number(cfg.h || 340)));
  cfg.x = Math.min(Math.max(8, Number(cfg.x || 24)), Math.max(8, window.innerWidth - 90));
  cfg.y = Math.min(Math.max(58, Number(cfg.y || 72)), Math.max(58, window.innerHeight - 44));
}

function syncLeafTabsState(leafEl, leafNode) {
  if (!leafEl || !leafNode) return;
  leafEl.querySelectorAll('.bsp-tab').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-panel') === leafNode.active);
  });
  leafNode.panels.forEach((pid) => {
    const pEl = PANEL_ELEMENTS[pid];
    if (!pEl) return;
    pEl.classList.toggle('tab-inactive', pid !== leafNode.active);
  });
  const activePid = leafNode.active || leafNode.panels[0];
  const closeBtn = leafEl.querySelector('.bsp-leaf-header [data-win-act="close"]');
  if (closeBtn) {
    closeBtn.classList.toggle('hidden', PANEL_META[activePid]?.closable === false);
  }
  if (activePid === 'map') {
    requestAnimationFrame(() => map.invalidateSize());
  }
}

// --- Interactive Drag-to-Dock Preview Helpers ---
function computeDropTarget(clientX, clientY, draggingPid) {
  const leaves = Array.from(bspWorkspaceEl?.querySelectorAll('.bsp-leaf') || []);
  for (const leafEl of leaves) {
    const r = leafEl.getBoundingClientRect();
    if (clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) continue;
    const leafId = leafEl.getAttribute('data-leaf-id');
    const relX = (clientX - r.left) / Math.max(1, r.width);
    const relY = (clientY - r.top) / Math.max(1, r.height);
    let zone = 'center';
    if (relX < 0.24) zone = 'left';
    else if (relX > 0.76) zone = 'right';
    else if (relY < 0.24) zone = 'top';
    else if (relY > 0.76) zone = 'bottom';

    const leafNode = findLeafById(state.layout.root, leafId);
    if (zone !== 'center' && leafNode && leafNode.panels.length === 1 && leafNode.panels[0] === draggingPid) {
      return null;
    }

    let box = { left: r.left, top: r.top, width: r.width, height: r.height };
    let label = '🗂️ Dodaj kao tab';
    if (zone === 'left') {
      box = { left: r.left, top: r.top, width: r.width * 0.45, height: r.height };
      label = '📌 Dokuj levo';
    } else if (zone === 'right') {
      box = { left: r.left + r.width * 0.55, top: r.top, width: r.width * 0.45, height: r.height };
      label = '📌 Dokuj desno';
    } else if (zone === 'top') {
      box = { left: r.left, top: r.top, width: r.width, height: r.height * 0.45 };
      label = '📌 Dokuj gore';
    } else if (zone === 'bottom') {
      box = { left: r.left, top: r.top + r.height * 0.55, width: r.width, height: r.height * 0.45 };
      label = '📌 Dokuj dole';
    }
    return { leafId, zone, box, label };
  }
  return null;
}

function showDockDropPreview(target) {
  if (!dockDropOverlayEl || !dockDropPreviewEl || !dockDropLabelEl) return;
  if (!target) {
    dockDropOverlayEl.classList.add('hidden');
    return;
  }
  dockDropOverlayEl.classList.remove('hidden');
  dockDropPreviewEl.style.left = `${Math.round(target.box.left)}px`;
  dockDropPreviewEl.style.top = `${Math.round(target.box.top)}px`;
  dockDropPreviewEl.style.width = `${Math.round(target.box.width)}px`;
  dockDropPreviewEl.style.height = `${Math.round(target.box.height)}px`;
  dockDropLabelEl.textContent = target.label;
  dockDropLabelEl.style.left = `${Math.round(target.box.left + target.box.width / 2)}px`;
  dockDropLabelEl.style.top = `${Math.round(target.box.top + target.box.height / 2)}px`;
}

function hideDockDropPreview() {
  dockDropOverlayEl?.classList.add('hidden');
  dragGhostEl?.classList.add('hidden');
}

function dockPanelIntoTree(pid, targetLeafId, zone) {
  if (!PANEL_IDS.includes(pid)) return;
  delete state.layout.floating[pid];
  state.layout.hidden = (state.layout.hidden || []).filter((x) => x !== pid);
  const srcLeaf = findLeafContainingPanel(state.layout.root, pid);
  if (srcLeaf && srcLeaf.id === targetLeafId && zone === 'center') {
    srcLeaf.active = pid;
    applyWorkspaceLayout();
    return;
  }
  let nextRoot = removePanelFromTree(state.layout.root, pid);
  if (!nextRoot) {
    nextRoot = makeLeaf([pid]);
  } else if (findLeafById(nextRoot, targetLeafId)) {
    nextRoot = insertPanelInTree(nextRoot, targetLeafId, pid, zone);
  } else {
    nextRoot = makeSplit('row', 0.65, nextRoot, makeLeaf([pid]));
  }
  state.layout.root = nextRoot;
  applyWorkspaceLayout();
}

function floatPanel(pid, atClientX = null, atClientY = null) {
  if (!PANEL_IDS.includes(pid)) return;
  const el = PANEL_ELEMENTS[pid];
  const rect = el ? el.getBoundingClientRect() : null;
  const dockedElsewhere = removePanelFromTree(state.layout.root, pid);
  if (!dockedElsewhere) return; // ne ostavljaj workspace prazan
  state.layout.root = dockedElsewhere;
  state.layout.hidden = (state.layout.hidden || []).filter((x) => x !== pid);
  const w = rect && rect.width > 120 ? Math.min(540, Math.max(280, Math.round(rect.width))) : 380;
  const h = rect && rect.height > 120 ? Math.min(window.innerHeight - 90, Math.max(220, Math.round(rect.height))) : 380;
  const x = atClientX !== null ? atClientX - Math.round(w / 2) : (rect ? rect.left + 16 : 60);
  const y = atClientY !== null ? atClientY - 14 : (rect ? rect.top + 14 : 80);
  state.layout.floating[pid] = { x, y, w, h, minimized: false };
  clampFloatingCoords(state.layout.floating[pid]);
  if (el) el.style.zIndex = String(++topFloatingZIndex);
  applyWorkspaceLayout();
}

function hidePanel(pid) {
  if (!PANEL_IDS.includes(pid) || PANEL_META[pid]?.closable === false) return;
  const nextRoot = removePanelFromTree(state.layout.root, pid);
  if (!nextRoot) return;
  state.layout.root = nextRoot;
  delete state.layout.floating[pid];
  if (!state.layout.hidden.includes(pid)) state.layout.hidden.push(pid);
  applyWorkspaceLayout();
}

function showPanel(pid) {
  if (!PANEL_IDS.includes(pid)) return;
  state.layout.hidden = (state.layout.hidden || []).filter((x) => x !== pid);
  if (state.layout.floating[pid]) {
    state.layout.floating[pid].minimized = false;
    applyWorkspaceLayout();
    return;
  }
  const existingLeaf = findLeafContainingPanel(state.layout.root, pid);
  if (existingLeaf) {
    existingLeaf.active = pid;
    applyWorkspaceLayout();
    return;
  }
  const mapLeaf = findLeafContainingPanel(state.layout.root, 'map');
  const zone = (pid === 'couriers' || pid === 'feed') ? 'left' : 'right';
  state.layout.root = mapLeaf
    ? insertPanelInTree(state.layout.root, mapLeaf.id, pid, zone)
    : makeSplit('row', 0.65, state.layout.root, makeLeaf([pid]));
  applyWorkspaceLayout();
}

function startTabDrag(e, pid) {
  if (e.button !== 0) return;
  e.stopPropagation();
  const startX = e.clientX;
  const startY = e.clientY;
  let dragging = false;
  let dropTarget = null;
  const meta = PANEL_META[pid] || { icon: '🪟', title: pid };

  const onMove = (mv) => {
    if (!dragging && Math.hypot(mv.clientX - startX, mv.clientY - startY) < 7) return;
    dragging = true;
    if (dragGhostEl) {
      dragGhostEl.textContent = `${meta.icon} ${meta.title}`;
      dragGhostEl.style.left = `${mv.clientX + 12}px`;
      dragGhostEl.style.top = `${mv.clientY + 12}px`;
      dragGhostEl.classList.remove('hidden');
    }
    dropTarget = computeDropTarget(mv.clientX, mv.clientY, pid);
    showDockDropPreview(dropTarget);
  };

  const onUp = (up) => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    hideDockDropPreview();
    if (!dragging) return;
    if (dropTarget) {
      dockPanelIntoTree(pid, dropTarget.leafId, dropTarget.zone);
    } else {
      const wsRect = bspWorkspaceEl?.getBoundingClientRect();
      const outside = !wsRect || up.clientX < wsRect.left || up.clientX > wsRect.right || up.clientY < wsRect.top || up.clientY > wsRect.bottom;
      if (outside) {
        floatPanel(pid, up.clientX, up.clientY);
      }
    }
  };

  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}

function renderBspNode(node) {
  if (!node) return document.createElement('div');
  if (node.type === 'leaf') {
    const leafEl = document.createElement('div');
    leafEl.className = 'bsp-leaf';
    leafEl.setAttribute('data-leaf-id', node.id);

    const headerEl = document.createElement('div');
    headerEl.className = 'bsp-leaf-header';

    const tabsEl = document.createElement('div');
    tabsEl.className = 'bsp-tabs';
    node.panels.forEach((pid) => {
      const meta = PANEL_META[pid] || { title: pid, icon: '' };
      const tabBtn = document.createElement('button');
      tabBtn.type = 'button';
      tabBtn.className = `bsp-tab${pid === node.active ? ' active' : ''}`;
      tabBtn.setAttribute('data-panel', pid);
      const badgeHtml = meta.badgeKey
        ? `<span class="bsp-tab-badge">${Number(state.badgeCounts[meta.badgeKey] || 0)}</span>`
        : '';
      tabBtn.innerHTML = `<span>${meta.icon}</span><span>${escapeHtml(meta.title)}</span>${badgeHtml}`;
      tabBtn.title = 'Klik za fokus, prevuci na ivicu drugog prozora za dokovanje/deljenje';
      tabBtn.addEventListener('click', () => {
        if (node.active !== pid) {
          node.active = pid;
          syncLeafTabsState(leafEl, node);
          saveWorkspaceStore();
        }
      });
      tabBtn.addEventListener('pointerdown', (e) => startTabDrag(e, pid));
      tabsEl.appendChild(tabBtn);
    });

    const controlsEl = document.createElement('div');
    controlsEl.className = 'panel-win-controls';
    const btnFloat = document.createElement('button');
    btnFloat.type = 'button';
    btnFloat.className = 'win-btn';
    btnFloat.setAttribute('data-win-act', 'float');
    btnFloat.textContent = '↗';
    btnFloat.title = 'Odvoji aktivni prozor kao plutajući';
    btnFloat.addEventListener('click', (e) => {
      e.stopPropagation();
      floatPanel(node.active || node.panels[0]);
    });

    const btnClose = document.createElement('button');
    btnClose.type = 'button';
    btnClose.className = 'win-btn close';
    btnClose.setAttribute('data-win-act', 'close');
    btnClose.textContent = '✕';
    btnClose.title = 'Sakrij aktivnu karticu';
    btnClose.addEventListener('click', (e) => {
      e.stopPropagation();
      hidePanel(node.active || node.panels[0]);
    });

    controlsEl.appendChild(btnFloat);
    controlsEl.appendChild(btnClose);
    headerEl.appendChild(tabsEl);
    headerEl.appendChild(controlsEl);

    const bodyEl = document.createElement('div');
    bodyEl.className = 'bsp-leaf-body';
    node.panels.forEach((pid) => {
      const pEl = PANEL_ELEMENTS[pid];
      if (!pEl) return;
      pEl.classList.remove('floating', 'panel-hidden', 'minimized', 'fill', 'fixed-h');
      pEl.classList.add('in-bsp');
      pEl.style.left = '';
      pEl.style.top = '';
      pEl.style.width = '';
      pEl.style.height = '';
      pEl.style.zIndex = '';
      bodyEl.appendChild(pEl);
    });

    leafEl.appendChild(headerEl);
    leafEl.appendChild(bodyEl);
    syncLeafTabsState(leafEl, node);
    return leafEl;
  }

  // Split node
  const splitEl = document.createElement('div');
  splitEl.className = `bsp-split ${node.dir === 'col' ? 'dir-col' : 'dir-row'}`;

  const childAEl = document.createElement('div');
  childAEl.className = 'bsp-child';
  childAEl.style.flex = `${node.ratio} 1 0%`;
  childAEl.appendChild(renderBspNode(node.a));

  const dividerEl = document.createElement('div');
  dividerEl.className = 'bsp-divider';
  dividerEl.title = 'Povuci za promenu proporcije prozora';

  const childBEl = document.createElement('div');
  childBEl.className = 'bsp-child';
  childBEl.style.flex = `${1 - node.ratio} 1 0%`;
  childBEl.appendChild(renderBspNode(node.b));

  dividerEl.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    dividerEl.classList.add('dragging');
    const splitRect = splitEl.getBoundingClientRect();
    const isCol = node.dir === 'col';
    const totalSize = Math.max(100, isCol ? splitRect.height : splitRect.width);
    const startPos = isCol ? e.clientY : e.clientX;
    const startRatio = node.ratio;

    const onMove = (mv) => {
      const delta = (isCol ? mv.clientY : mv.clientX) - startPos;
      const nextRatio = Math.min(0.85, Math.max(0.15, startRatio + delta / totalSize));
      node.ratio = nextRatio;
      childAEl.style.flex = `${nextRatio} 1 0%`;
      childBEl.style.flex = `${1 - nextRatio} 1 0%`;
      requestAnimationFrame(() => map.invalidateSize());
    };

    const onUp = () => {
      dividerEl.classList.remove('dragging');
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      saveWorkspaceStore();
      map.invalidateSize();
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  });

  splitEl.appendChild(childAEl);
  splitEl.appendChild(dividerEl);
  splitEl.appendChild(childBEl);
  return splitEl;
}

function renderWorkspacePresetsBar() {
  if (!workspacePresetsBarEl || !state.workspaceStore) return;
  workspacePresetsBarEl.innerHTML = '';
  const { activePresetId, presets } = state.workspaceStore;
  Object.values(presets).forEach((preset) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `ws-preset-btn${preset.id === activePresetId ? ' active' : ''}`;
    btn.textContent = `${preset.builtin ? '' : '★ '}${preset.name}`;
    btn.title = preset.builtin ? `Učitaj postavku: ${preset.name}` : `Korisnička postavka: ${preset.name}`;
    btn.addEventListener('click', () => {
      state.workspaceStore.activePresetId = preset.id;
      state.layout = deepClone(preset.layout);
      applyWorkspaceLayout();
    });
    workspacePresetsBarEl.appendChild(btn);
  });

  const activePreset = presets[activePresetId];
  const isCustom = Boolean(activePreset && !activePreset.builtin);
  if (btnWorkspaceUpdate) btnWorkspaceUpdate.disabled = !isCustom;
  if (btnWorkspaceDelete) btnWorkspaceDelete.disabled = !isCustom;
}

function syncLayoutMenuControls() {
  const vis = getPanelVisibilityMap();
  if (togglePanelCouriersEl) togglePanelCouriersEl.checked = Boolean(vis.couriers);
  if (togglePanelFeedEl) togglePanelFeedEl.checked = Boolean(vis.feed);
  if (togglePanelOrderFormEl) togglePanelOrderFormEl.checked = Boolean(vis.orderForm);
  if (togglePanelWaitingEl) togglePanelWaitingEl.checked = Boolean(vis.waiting);
  if (togglePanelActiveEl) togglePanelActiveEl.checked = Boolean(vis.active);
  if (togglePanelHistoryEl) togglePanelHistoryEl.checked = Boolean(vis.history);
  if (toggleOverlayEtaEl) toggleOverlayEtaEl.checked = state.layout?.overlays?.eta !== false;
  if (toggleOverlayLegendEl) toggleOverlayLegendEl.checked = state.layout?.overlays?.legend !== false;
}

function applyWorkspaceLayout() {
  if (!state.layout || !bspWorkspaceEl || !panelPoolEl) return;

  // Premesti sve trajne panele u pool PRE praznjenja BSP kontejnera da ne izgubimo #map i formu
  PANEL_IDS.forEach((pid) => {
    const el = PANEL_ELEMENTS[pid];
    if (el && el.parentElement !== panelPoolEl) {
      panelPoolEl.appendChild(el);
    }
  });

  bspWorkspaceEl.innerHTML = '';
  bspWorkspaceEl.appendChild(renderBspNode(state.layout.root));

  // Plutajući i skriveni paneli
  PANEL_IDS.forEach((pid) => {
    const el = PANEL_ELEMENTS[pid];
    if (!el) return;
    const fCfg = state.layout.floating?.[pid];
    if (fCfg && floatingLayerEl) {
      clampFloatingCoords(fCfg);
      el.classList.remove('in-bsp', 'tab-inactive', 'panel-hidden');
      el.classList.add('floating');
      el.classList.toggle('minimized', Boolean(fCfg.minimized));
      el.style.left = `${Math.round(fCfg.x)}px`;
      el.style.top = `${Math.round(fCfg.y)}px`;
      el.style.width = `${Math.round(fCfg.w)}px`;
      el.style.height = fCfg.minimized ? '' : `${Math.round(fCfg.h)}px`;
      if (!el.style.zIndex) el.style.zIndex = String(++topFloatingZIndex);
      const floatBtn = el.querySelector('.panel-header [data-win-act="float"]');
      if (floatBtn) {
        floatBtn.textContent = '📌';
        floatBtn.title = 'Dokuj nazad u radni prostor';
      }
      const minBtn = el.querySelector('.panel-header [data-win-act="minimize"]');
      if (minBtn) {
        minBtn.textContent = fCfg.minimized ? '▢' : '—';
        minBtn.title = fCfg.minimized ? 'Proširi prozor' : 'Minimiziraj prozor';
      }
      floatingLayerEl.appendChild(el);
    } else if (!findLeafContainingPanel(state.layout.root, pid)) {
      el.classList.remove('in-bsp', 'floating', 'tab-inactive');
      el.classList.add('panel-hidden');
    }
  });

  if (mapLegendEl) {
    mapLegendEl.classList.toggle('hidden', state.layout.overlays?.legend === false);
  }
  renderRouteEtaOverlay();
  refreshPanelTabBadges();
  renderWorkspacePresetsBar();
  syncLayoutMenuControls();
  saveWorkspaceStore();
  requestAnimationFrame(() => map.invalidateSize());
}

function ensurePanelOpen(pid) {
  if (!PANEL_IDS.includes(pid)) return;
  showPanel(pid);
}

function saveLayoutAsNewPreset() {
  const name = prompt('Naziv nove postavke radnog prostora:', 'Moj raspored');
  if (!name || !name.trim()) return;
  const cleanName = name.trim().slice(0, 40);
  const id = `custom_${Date.now().toString(36)}`;
  state.workspaceStore.presets[id] = {
    id,
    name: cleanName,
    builtin: false,
    layout: deepClone(state.layout),
  };
  state.workspaceStore.activePresetId = id;
  saveWorkspaceStore();
  renderWorkspacePresetsBar();
}

function initWorkspaceManager() {
  // Kontrole unutar plutajucih prozora
  PANEL_IDS.forEach((pid) => {
    const el = PANEL_ELEMENTS[pid];
    if (!el) return;
    const header = el.querySelector('.panel-header');
    const resizeHandle = el.querySelector('.panel-resize-handle');

    el.querySelectorAll('.panel-header .win-btn[data-win-act]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const act = btn.getAttribute('data-win-act');
        if (act === 'float') {
          if (state.layout.floating[pid]) {
            const mapLeaf = findLeafContainingPanel(state.layout.root, 'map');
            dockPanelIntoTree(pid, mapLeaf ? mapLeaf.id : null, (pid === 'couriers' || pid === 'feed') ? 'left' : 'right');
          } else {
            floatPanel(pid);
          }
        } else if (act === 'minimize') {
          const fCfg = state.layout.floating[pid];
          if (fCfg) {
            fCfg.minimized = !fCfg.minimized;
            applyWorkspaceLayout();
          }
        } else if (act === 'close') {
          hidePanel(pid);
        }
      });
    });

    el.addEventListener('pointerdown', () => {
      if (state.layout.floating?.[pid]) {
        el.style.zIndex = String(++topFloatingZIndex);
      }
    });

    header?.addEventListener('pointerdown', (e) => {
      const fCfg = state.layout.floating?.[pid];
      if (!fCfg) return;
      if (e.target.closest('button, input, select')) return;
      e.preventDefault();
      el.style.zIndex = String(++topFloatingZIndex);
      const startX = e.clientX;
      const startY = e.clientY;
      const origX = fCfg.x;
      const origY = fCfg.y;
      let dropTarget = null;

      const onMove = (mv) => {
        fCfg.x = Math.min(Math.max(8, origX + (mv.clientX - startX)), Math.max(8, window.innerWidth - 90));
        fCfg.y = Math.min(Math.max(58, origY + (mv.clientY - startY)), Math.max(58, window.innerHeight - 44));
        el.style.left = `${Math.round(fCfg.x)}px`;
        el.style.top = `${Math.round(fCfg.y)}px`;
        dropTarget = computeDropTarget(mv.clientX, mv.clientY, pid);
        showDockDropPreview(dropTarget);
      };

      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        hideDockDropPreview();
        if (dropTarget) {
          dockPanelIntoTree(pid, dropTarget.leafId, dropTarget.zone);
        } else {
          saveWorkspaceStore();
        }
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });

    resizeHandle?.addEventListener('pointerdown', (e) => {
      const fCfg = state.layout.floating?.[pid];
      if (!fCfg || fCfg.minimized) return;
      e.preventDefault();
      e.stopPropagation();
      el.style.zIndex = String(++topFloatingZIndex);
      const startX = e.clientX;
      const startY = e.clientY;
      const origW = fCfg.w;
      const origH = fCfg.h;

      const onMove = (mv) => {
        fCfg.w = Math.min(window.innerWidth - fCfg.x - 8, Math.max(260, origW + (mv.clientX - startX)));
        fCfg.h = Math.min(window.innerHeight - fCfg.y - 8, Math.max(160, origH + (mv.clientY - startY)));
        el.style.width = `${Math.round(fCfg.w)}px`;
        el.style.height = `${Math.round(fCfg.h)}px`;
        if (pid === 'map') requestAnimationFrame(() => map.invalidateSize());
      };

      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        saveWorkspaceStore();
        if (pid === 'map') map.invalidateSize();
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });
  });

  // Layout popover menu
  btnLayoutMenu?.addEventListener('click', (e) => {
    e.stopPropagation();
    layoutMenuEl?.classList.toggle('hidden');
  });
  layoutMenuEl?.addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('click', () => layoutMenuEl?.classList.add('hidden'));

  const bindPanelToggle = (el, pid) => {
    el?.addEventListener('change', () => {
      if (el.checked) showPanel(pid);
      else hidePanel(pid);
    });
  };
  bindPanelToggle(togglePanelCouriersEl, 'couriers');
  bindPanelToggle(togglePanelFeedEl, 'feed');
  bindPanelToggle(togglePanelOrderFormEl, 'orderForm');
  bindPanelToggle(togglePanelWaitingEl, 'waiting');
  bindPanelToggle(togglePanelActiveEl, 'active');
  bindPanelToggle(togglePanelHistoryEl, 'history');

  toggleOverlayEtaEl?.addEventListener('change', () => {
    state.layout.overlays.eta = Boolean(toggleOverlayEtaEl.checked);
    applyWorkspaceLayout();
  });
  toggleOverlayLegendEl?.addEventListener('change', () => {
    state.layout.overlays.legend = Boolean(toggleOverlayLegendEl.checked);
    applyWorkspaceLayout();
  });

  btnSaveWorkspace?.addEventListener('click', saveLayoutAsNewPreset);
  btnWorkspaceSaveAs?.addEventListener('click', () => {
    saveLayoutAsNewPreset();
    layoutMenuEl?.classList.add('hidden');
  });

  btnWorkspaceUpdate?.addEventListener('click', () => {
    const id = state.workspaceStore.activePresetId;
    const preset = state.workspaceStore.presets[id];
    if (!preset || preset.builtin) return;
    preset.layout = deepClone(state.layout);
    saveWorkspaceStore();
    layoutMenuEl?.classList.add('hidden');
  });

  btnWorkspaceDelete?.addEventListener('click', () => {
    const id = state.workspaceStore.activePresetId;
    const preset = state.workspaceStore.presets[id];
    if (!preset || preset.builtin) return;
    if (!confirm(`Obrisati sačuvanu postavku "${preset.name}"?`)) return;
    delete state.workspaceStore.presets[id];
    state.workspaceStore.activePresetId = 'standard';
    state.layout = deepClone(state.workspaceStore.presets.standard.layout);
    applyWorkspaceLayout();
    layoutMenuEl?.classList.add('hidden');
  });

  btnWorkspaceExport?.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state.workspaceStore, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'flash-dispatch-workspaces.json';
    a.click();
    URL.revokeObjectURL(url);
  });

  btnWorkspaceImport?.addEventListener('click', () => workspaceImportFileEl?.click());
  workspaceImportFileEl?.addEventListener('change', async () => {
    const file = workspaceImportFileEl.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (parsed?.presets && typeof parsed.presets === 'object') {
        Object.entries(parsed.presets).forEach(([id, entry]) => {
          if (!entry || entry.builtin || !entry.layout) return;
          state.workspaceStore.presets[id] = {
            id,
            name: String(entry.name || id).slice(0, 40),
            builtin: false,
            layout: sanitizeLayout(entry.layout),
          };
        });
      }
      if (parsed?.working) {
        state.layout = sanitizeLayout(parsed.working);
      }
      applyWorkspaceLayout();
      layoutMenuEl?.classList.add('hidden');
    } catch (err) {
      alert(`Neispravan JSON fajl postavki: ${err?.message || err}`);
    } finally {
      workspaceImportFileEl.value = '';
    }
  });

  btnDockAll?.addEventListener('click', () => {
    const floatIds = Object.keys(state.layout.floating || {});
    floatIds.forEach((pid) => {
      const mapLeaf = findLeafContainingPanel(state.layout.root, 'map');
      dockPanelIntoTree(pid, mapLeaf ? mapLeaf.id : null, (pid === 'couriers' || pid === 'feed') ? 'left' : 'right');
    });
    if (!floatIds.length) applyWorkspaceLayout();
    layoutMenuEl?.classList.add('hidden');
  });

  btnResetLayout?.addEventListener('click', () => {
    const preset = state.workspaceStore.presets[state.workspaceStore.activePresetId] || state.workspaceStore.presets.standard;
    state.layout = deepClone(preset.layout);
    applyWorkspaceLayout();
    layoutMenuEl?.classList.add('hidden');
  });

  window.addEventListener('resize', () => {
    const hasFloating = Object.keys(state.layout?.floating || {}).length > 0;
    if (hasFloating) applyWorkspaceLayout();
    else map.invalidateSize();
  });

  applyWorkspaceLayout();
  renderLiveFeed();
}

initWorkspaceManager();

supabase.auth.getSession().then(({ data }) => verifySessionAndBoot(data.session));
supabase.auth.onAuthStateChange((_ev, session) => {
  if (session && !state.user) verifySessionAndBoot(session);
});
