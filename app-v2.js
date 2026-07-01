// ============================================
// CONSTRUCTORA LST — Flota & Equipos
// ============================================

const SHEETS_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
const DRIVE_API   = 'https://www.googleapis.com/drive/v3';
const DRIVE_UP    = 'https://www.googleapis.com/upload/drive/v3';
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwVj2C6YCjlwm4OwXqFBk8RiuYbGS0QXnA062oTq7_j_NiGu2xl5dOrGZb-RdJdExbYqg/exec';

let allEquipos    = [];
let currentEquipo = null;
let currentFilter = 'todos';
let driveFolders    = {};   // cache patente → folderId
let driveSubfolders = {};   // cache patente/subfolder → folderId
const today = new Date();

// ── Soporte offline básico ──────────────────────────────────────
// Guarda en localStorage una "foto" de los últimos datos cargados con
// éxito, para poder MOSTRARLOS (solo lectura) cuando no hay internet.
// No reemplaza la app online: solo evita la pantalla en blanco sin señal.
const OFFLINE_CACHE_KEY = 'lst_offline_cache';
const OFFLINE_CACHE_TS_KEY = 'lst_offline_cache_ts';

function guardarCacheOffline() {
  try {
    const snapshot = {
      allEquipos,
      allEventos: (typeof allEventos !== 'undefined') ? allEventos : [],
      allGeneradores: (typeof allGeneradores !== 'undefined') ? allGeneradores : [],
      allMaqMenor: (typeof allMaqMenor !== 'undefined') ? allMaqMenor : [],
      allHerramientas: (typeof allHerramientas !== 'undefined') ? allHerramientas : [],
      allContainers: (typeof allContainers !== 'undefined') ? allContainers : [],
      allMovimientos: (typeof allMovimientos !== 'undefined') ? allMovimientos : [],
    };
    localStorage.setItem(OFFLINE_CACHE_KEY, JSON.stringify(snapshot));
    localStorage.setItem(OFFLINE_CACHE_TS_KEY, Date.now().toString());
  } catch(e) {
    console.warn('[OFFLINE] No se pudo guardar el cache local:', e.message);
  }
}

// Recupera el snapshot guardado y lo vuelca en las variables globales.
// Devuelve true si había algo que cargar.
function cargarCacheOffline() {
  try {
    const raw = localStorage.getItem(OFFLINE_CACHE_KEY);
    if (!raw) return false;
    const snap = JSON.parse(raw);
    allEquipos = snap.allEquipos || [];
    if (typeof allEventos !== 'undefined') allEventos = snap.allEventos || [];
    if (typeof allGeneradores !== 'undefined') allGeneradores = snap.allGeneradores || [];
    if (typeof allMaqMenor !== 'undefined') allMaqMenor = snap.allMaqMenor || [];
    if (typeof allHerramientas !== 'undefined') allHerramientas = snap.allHerramientas || [];
    if (typeof allContainers !== 'undefined') allContainers = snap.allContainers || [];
    if (typeof allMovimientos !== 'undefined') allMovimientos = snap.allMovimientos || [];
    return true;
  } catch(e) {
    console.warn('[OFFLINE] No se pudo leer el cache local:', e.message);
    return false;
  }
}

// Muestra/oculta el banner de "sin conexión" con la fecha del último dato guardado
function actualizarBannerOffline(mostrar) {
  const banner = document.getElementById('offline-banner');
  if (!banner) return;
  document.body.classList.toggle('is-offline', mostrar);
  banner.classList.toggle('hidden', !mostrar);
  if (mostrar) {
    const ts = parseInt(localStorage.getItem(OFFLINE_CACHE_TS_KEY) || '0');
    const fechaEl = document.getElementById('offline-banner-fecha');
    if (fechaEl) {
      fechaEl.textContent = ts ? 'el ' + new Date(ts).toLocaleString('es-CL', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : '';
    }
  }
}

// Renderiza todo a partir de lo que haya en memoria (online o desde cache)
function _renderTodoDesdeMemoria() {
  if (typeof renderDashboard === 'function') renderDashboard();
  if (typeof renderEquipos === 'function') renderEquipos();
  if (typeof renderAlertas === 'function') renderAlertas();
  if (typeof renderEventos === 'function') renderEventos();
  if (typeof renderInvLista === 'function') renderInvLista();
  if (typeof renderContainers === 'function') renderContainers();
}

// Carga directamente desde el cache local sin tocar la red — para cuando
// arrancamos sin conexión o el login/los datos en vivo fallan.
function iniciarModoOffline() {
  const habiaCache = cargarCacheOffline();
  document.getElementById('splash').classList.add('hidden');
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('main').classList.add('hidden');
  document.getElementById('modulos-home').classList.remove('hidden');
  actualizarBannerOffline(true);
  if (habiaCache) {
    _renderTodoDesdeMemoria();
  } else {
    toast('Sin conexión y sin datos guardados todavía', 'error');
  }
}

window.addEventListener('online', () => {
  actualizarBannerOffline(false);
  // Al recuperar señal, refrescamos datos en background
  if (typeof loadData === 'function' && accessToken) loadData(true);
});
window.addEventListener('offline', () => actualizarBannerOffline(true));

// ── Roles de usuario ──────────────────────────────────────────
let userRole  = null;   // 'admin' | 'viewer'
let userEmail = null;

const ROLE_KEY  = 'lst_user_role';
const EMAIL_KEY = 'lst_user_email';

// ── OAuth / Google Identity Services ─────────────────────────
let tokenClient  = null;
let accessToken  = null;
let tokenExpiry  = 0;
let isRenewing   = false;  // evita múltiples renovaciones simultáneas

const TOKEN_KEY  = 'lst_access_token';
const EXPIRY_KEY = 'lst_token_expiry';

// Guarda token en localStorage con tiempo de expiración
function saveToken(token, expiresIn) {
  accessToken = token;
  tokenExpiry = Date.now() + (expiresIn - 60) * 1000; // 60s de margen
  try {
    localStorage.setItem(TOKEN_KEY,  token);
    localStorage.setItem(EXPIRY_KEY, tokenExpiry.toString());
    // También en sessionStorage como respaldo
    sessionStorage.setItem(TOKEN_KEY,  token);
    sessionStorage.setItem(EXPIRY_KEY, tokenExpiry.toString());
  } catch(e) {}
}

// Carga token guardado si aún es válido (localStorage o sessionStorage)
function loadSavedToken() {
  try {
    // Intentar localStorage primero
    let token  = localStorage.getItem(TOKEN_KEY);
    let expiry = parseInt(localStorage.getItem(EXPIRY_KEY) || '0');
    // Fallback a sessionStorage
    if (!token || expiry <= Date.now()) {
      token  = sessionStorage.getItem(TOKEN_KEY);
      expiry = parseInt(sessionStorage.getItem(EXPIRY_KEY) || '0');
    }
    if (token && expiry > Date.now()) {
      accessToken = token;
      tokenExpiry = expiry;
      return true;
    }
  } catch(e) {}
  return false;
}

function clearToken() {
  accessToken = null;
  tokenExpiry = 0;
  try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(EXPIRY_KEY); } catch(e) {}
}

function isTokenValid() {
  return accessToken && tokenExpiry > Date.now();
}

function initOAuth() {
  if (typeof google === 'undefined') {
    setTimeout(initOAuth, 300);
    return;
  }
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.CLIENT_ID,
    scope: CONFIG.SCOPES + ' https://www.googleapis.com/auth/userinfo.email',
    callback: async (response) => {
      if (response.error) {
        document.getElementById('login-hint').textContent = 'Error: ' + response.error;
        clearToken();
        return;
      }
      saveToken(response.access_token, response.expires_in || 3600);
      try { 
        localStorage.setItem('lst_had_login', '1');
        localStorage.setItem('lst_has_drive_scope', '1');
      } catch(e) {}

      // Obtener email via tokeninfo — no requiere scope extra, siempre funciona
      userEmail = '';
      try {
        const tiRes = await fetch(`https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${accessToken}`);
        const ti = await tiRes.json();
        userEmail = (ti.email || '').toLowerCase().trim();
        console.log('[AUTH] tokeninfo response:', ti);
      } catch(e) {
        console.warn('[AUTH] tokeninfo falló:', e.message);
      }

      // Respaldo: userinfo
      if (!userEmail) {
        try {
          const infoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { 'Authorization': 'Bearer ' + accessToken }
          });
          const info = await infoRes.json();
          userEmail = (info.email || '').toLowerCase().trim();
        } catch(e) {
          console.warn('[AUTH] userinfo falló:', e.message);
        }
      }

      console.log('[AUTH] Email detectado:', userEmail || '(vacío)');
      try { localStorage.setItem(EMAIL_KEY, userEmail); } catch(e) {}

      // Verificar rol en hoja USUARIOS
      await checkUserRole();

      document.getElementById('login-screen').classList.add('hidden');
      document.getElementById('splash').classList.remove('hidden');
      loadData();
    },
  });

  // Renueva silenciosamente el token 10 min antes de que expire
  // Usa login_hint con el email guardado para que GIS no muestre popup
  setInterval(() => {
    if (isRenewing) return;
    if (!accessToken) return;
    if (tokenExpiry - Date.now() > 10 * 60 * 1000) return;

    isRenewing = true;
    const prevCb = tokenClient.callback;
    tokenClient.callback = (response) => {
      tokenClient.callback = prevCb;
      isRenewing = false;
      if (response.error) { return; }
      saveToken(response.access_token, response.expires_in || 3600);
    };
    const hint = localStorage.getItem(EMAIL_KEY) || '';
    tokenClient.requestAccessToken({ prompt: '', login_hint: hint });
  }, 30 * 1000);
}

function signIn() {
  document.getElementById('login-hint').textContent = 'Conectando...';
  if (!tokenClient) { initOAuth(); setTimeout(signIn, 600); return; }
  const hadLogin    = localStorage.getItem('lst_had_login');
  const hasAllScopes = localStorage.getItem('lst_has_drive_scope');
  const savedEmail  = localStorage.getItem(EMAIL_KEY) || '';
  // Primera vez: consent para obtener todos los permisos
  // Veces siguientes: silencioso con login_hint para evitar popup de cuenta
  const opts = (hadLogin && hasAllScopes)
    ? { prompt: '', login_hint: savedEmail }
    : { prompt: 'consent', include_granted_scopes: 'true' };
  tokenClient.requestAccessToken(opts);
}

// Asegura que haya token válido antes de llamar a la API
function ensureToken() {
  return new Promise((resolve, reject) => {
    if (isTokenValid()) { resolve(); return; }
    if (!tokenClient) { reject(new Error('OAuth no iniciado')); return; }
    // Intenta renovar silenciosamente (sin popup), hasta 2 reintentos
    let intentos = 0;
    function intentarRenovar() {
      intentos++;
      const prevCallback = tokenClient.callback;
      tokenClient.callback = (response) => {
        tokenClient.callback = prevCallback;
        if (response.error) {
          if (intentos < 2 && response.error !== 'access_denied') {
            // Reintento con pequeño delay
            setTimeout(intentarRenovar, 1500);
          } else {
            reject(new Error(response.error));
          }
          return;
        }
        saveToken(response.access_token, response.expires_in || 3600);
        resolve();
      };
      tokenClient.requestAccessToken({ prompt: '' });
    }
    intentarRenovar();
  });
}

// ── Control de roles ──────────────────────────────────────────
// Busca el email en la hoja USUARIOS (col A=email, col B=rol).
// Roles soportados: 'admin' (todo) · 'mover' (solo lectura + puede
// registrar movimientos en el módulo Movimientos) · cualquier otro
// valor o ausencia de match → 'viewer' (solo lectura, sin poder mover).
async function checkUserRole() {
  try {
    const sheet = CONFIG.SHEET_USUARIOS || 'USUARIOS';
    const url = `${SHEETS_BASE}/${CONFIG.SHEET_ID}/values/${encodeURIComponent(`'${sheet}'!A2:B100`)}`;
    const res = await fetch(url, { headers: { 'Authorization': 'Bearer ' + accessToken } });
    if (!res.ok) throw new Error('Sheet USUARIOS no disponible');
    const data = await res.json();
    const rows = data.values || [];
    const match = rows.find(r => (r[0]||'').toLowerCase().trim() === userEmail);
    const rolHoja = match ? (match[1]||'').toLowerCase().trim() : '';
    if (rolHoja === 'admin') {
      userRole = 'admin';
    } else if (rolHoja === 'mover') {
      userRole = 'mover';
    } else {
      userRole = 'viewer';
    }
  } catch(e) {
    // Si la hoja no existe o hay error, cualquier email desconocido es viewer
    console.warn('[ROLE] No se pudo leer USUARIOS, asignando viewer:', e.message);
    userRole = 'viewer';
  }
  try {
    localStorage.setItem(ROLE_KEY, userRole);
    localStorage.setItem(EMAIL_KEY, userEmail || '');
  } catch(e) {}
  applyViewerMode();
  console.log('[ROLE] Email:', userEmail, '→ Rol:', userRole);
}

// Aplica las clases de modo en el body según el rol:
// - admin  → sin clases (acceso total)
// - mover  → 'viewer-mode' (todo en solo lectura) + 'mover-mode' (puede usar
//            los controles del módulo Movimientos, marcados con .mov-action-btn)
// - viewer → solo 'viewer-mode' (ni siquiera puede registrar movimientos)
function applyViewerMode() {
  document.body.classList.remove('viewer-mode', 'mover-mode');
  if (userRole === 'viewer') {
    document.body.classList.add('viewer-mode');
  } else if (userRole === 'mover') {
    document.body.classList.add('viewer-mode', 'mover-mode');
  }
}

function authHeader() {
  return { 'Authorization': 'Bearer ' + accessToken };
}

// ── Utilidades ────────────────────────────────────────────────
function parseEstado(raw) {
  if (!raw) return 'sin-dato';
  const r = raw.toLowerCase().trim();
  if (r.includes('reparaci')) return 'rep';
  if (r.includes('deteni') || r.includes('vender') || r.includes('parada')) return 'det';
  // obs antes de op para que "operativo (con observaciones)" quede como obs
  if (r.includes('observaci') || r.includes('falla') || r.includes('presenta')) return 'obs';
  if (r.includes('operativ')) return 'op';
  return 'otro';
}
const ESTADO_LABEL = { op:'Operativo', obs:'Con observaciones', det:'Detenido', rep:'En reparación', 'sin-dato':'Sin dato', otro:'Otro' };
const ESTADO_COLOR = { op:'green', obs:'amber', det:'red', rep:'blue', otro:'gray' };

// ── Chevron SVG para reemplazar el › unicode en tarjetas ──
const CHEVRON = `<span class="card-chevron"><svg viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`;

// ── Empty state con ícono contextual ──
function emptyState(titulo, subtitulo, iconPath) {
  const path = iconPath || `<path d="M3 7h18M3 12h18M3 17h12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>`;
  return `<div class="empty">
    <div class="empty-icon"><svg viewBox="0 0 24 24" fill="none">${path}</svg></div>
    <div class="empty-title">${titulo}</div>
    ${subtitulo ? `<div class="empty-sub">${subtitulo}</div>` : ''}
  </div>`;
}

function iconoEquipo(tipo) {
  const t = (tipo || '').toLowerCase();
  // Iconos de línea simples (mismo lenguaje visual que el menú principal):
  // trazo blanco, sin relleno, para usar dentro de una placa con degradado.
  const svgs = {
    camioneta: `<svg viewBox="0 0 24 24" fill="none" class="equipo-svg"><path d="M2 16h1M3 16V9a1 1 0 0 1 1-1h6v8M10 16h7" stroke="white" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 9h4l3 3v4" stroke="white" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><circle cx="6" cy="16" r="2" stroke="white" stroke-width="1.7"/><circle cx="18" cy="16" r="2" stroke="white" stroke-width="1.7"/></svg>`,
    camion: `<svg viewBox="0 0 24 24" fill="none" class="equipo-svg"><path d="M2 16h1M2 16V7a1 1 0 0 1 1-1h9v10M12 16h6" stroke="white" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 11h4l3 3v2" stroke="white" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><circle cx="6" cy="16" r="2" stroke="white" stroke-width="1.7"/><circle cx="17" cy="16" r="2" stroke="white" stroke-width="1.7"/></svg>`,
    furgon: `<svg viewBox="0 0 24 24" fill="none" class="equipo-svg"><rect x="2" y="6" width="20" height="10" rx="2" stroke="white" stroke-width="1.7"/><path d="M9 6v10M16 6v10" stroke="white" stroke-width="1.7"/><circle cx="7" cy="18.5" r="1.6" stroke="white" stroke-width="1.7"/><circle cx="17" cy="18.5" r="1.6" stroke="white" stroke-width="1.7"/></svg>`,
    retroexcavadora: `<svg viewBox="0 0 24 24" fill="none" class="equipo-svg"><rect x="6" y="10" width="9" height="6" rx="1.3" stroke="white" stroke-width="1.6"/><circle cx="9" cy="19" r="2.6" stroke="white" stroke-width="1.6"/><circle cx="15" cy="19" r="2.6" stroke="white" stroke-width="1.6"/><path d="M6 13l-3 1.5v2.5l3-1" stroke="white" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M15 11h4l3 3-1.5 4-3-1" stroke="white" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    excavadora: `<svg viewBox="0 0 24 24" fill="none" class="equipo-svg"><rect x="2" y="17" width="13" height="3.5" rx="1.5" stroke="white" stroke-width="1.6"/><rect x="4" y="11" width="7" height="6.5" rx="1.2" stroke="white" stroke-width="1.6"/><path d="M9 12.5h4l5-7" stroke="white" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M18 5.5l4 1.5-2.2 4.3-3.3-1.6Z" stroke="white" stroke-width="1.6" stroke-linejoin="round"/></svg>`,
    minicargador: `<svg viewBox="0 0 24 24" fill="none" class="equipo-svg"><rect x="4" y="9" width="9" height="7" rx="1.3" stroke="white" stroke-width="1.6"/><circle cx="6.5" cy="19" r="2.3" stroke="white" stroke-width="1.6"/><circle cx="11" cy="19" r="2.3" stroke="white" stroke-width="1.6"/><path d="M13 9l6 1v6l-3 1" stroke="white" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 17l3-1.5v-3" stroke="white" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    manipulador: `<svg viewBox="0 0 24 24" fill="none" class="equipo-svg"><rect x="2" y="13" width="9" height="6" rx="1.3" stroke="white" stroke-width="1.6"/><circle cx="5" cy="20.5" r="1.7" stroke="white" stroke-width="1.6"/><circle cx="10" cy="20.5" r="1.7" stroke="white" stroke-width="1.6"/><path d="M9 14 20 4" stroke="white" stroke-width="2" stroke-linecap="round"/><path d="M20 4h3M20 7l3-1" stroke="white" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    grua: `<svg viewBox="0 0 24 24" fill="none" class="equipo-svg"><rect x="2" y="14" width="9" height="5" rx="1.3" stroke="white" stroke-width="1.6"/><circle cx="4.5" cy="20.5" r="1.6" stroke="white" stroke-width="1.6"/><circle cx="9" cy="20.5" r="1.6" stroke="white" stroke-width="1.6"/><path d="M6 14 20 3" stroke="white" stroke-width="1.8" stroke-linecap="round"/><path d="M20 3v6" stroke="white" stroke-width="1.4" stroke-linecap="round" stroke-dasharray="1.5 1.5"/><circle cx="20" cy="10.5" r="0.9" stroke="white" stroke-width="1.3"/></svg>`,
    rodillo: `<svg viewBox="0 0 24 24" fill="none" class="equipo-svg"><circle cx="6" cy="17" r="4" stroke="white" stroke-width="1.7"/><circle cx="18" cy="17" r="4" stroke="white" stroke-width="1.7"/><path d="M6 13V8a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v5" stroke="white" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    mixer: `<svg viewBox="0 0 24 24" fill="none" class="equipo-svg"><path d="M2 17h1M3 17V9a1 1 0 0 1 1-1h6v9" stroke="white" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><circle cx="20" cy="13" r="6" stroke="white" stroke-width="1.7"/><path d="M16 9.5l8 7M16 16.5l8-7" stroke="white" stroke-width="1.2" stroke-linecap="round"/><path d="M14 8l6-2v14" stroke="white" stroke-width="1.5" stroke-linejoin="round"/><circle cx="6.5" cy="17" r="2" stroke="white" stroke-width="1.7"/><circle cx="13.5" cy="17" r="2" stroke="white" stroke-width="1.7"/></svg>`,
    tractor: `<svg viewBox="0 0 24 24" fill="none" class="equipo-svg"><rect x="3" y="9" width="9" height="7" rx="1.3" stroke="white" stroke-width="1.7"/><circle cx="6" cy="19" r="3.2" stroke="white" stroke-width="1.7"/><circle cx="18" cy="19" r="2.2" stroke="white" stroke-width="1.7"/><path d="M12 11h7v5" stroke="white" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    generador: `<svg viewBox="0 0 24 24" fill="none" class="equipo-svg"><rect x="2" y="7" width="18" height="10" rx="2" stroke="white" stroke-width="1.6"/><path d="M5 10h6M5 12.5h6M5 15h6" stroke="white" stroke-width="1.4" stroke-linecap="round"/><rect x="14" y="9.5" width="4" height="5" rx="0.8" stroke="white" stroke-width="1.4"/><path d="M2 19h18M5 7V5M17 7V5" stroke="white" stroke-width="1.4" stroke-linecap="round"/></svg>`,
    default: `<svg viewBox="0 0 24 24" fill="none" class="equipo-svg"><rect x="4" y="4" width="16" height="13" rx="2" stroke="white" stroke-width="1.7"/><path d="M9 21h6M12 17v4" stroke="white" stroke-width="1.7" stroke-linecap="round"/></svg>`,
  };
  if (t.includes('camioneta'))   return svgs.camioneta;
  if (t.includes('camion') || t.includes('camión')) return svgs.camion;
  if (t.includes('furgon') || t.includes('furgón')) return svgs.furgon;
  if (t.includes('retroexcavadora')) return svgs.retroexcavadora;
  if (t.includes('excavadora'))  return svgs.excavadora;
  if (t.includes('minicargador')) return svgs.minicargador;
  if (t.includes('manipulador')) return svgs.manipulador;
  if (t.includes('grua') || t.includes('grúa')) return svgs.grua;
  if (t.includes('rodillo'))     return svgs.rodillo;
  if (t.includes('mixer'))       return svgs.mixer;
  if (t.includes('tractor'))     return svgs.tractor;
  if (t.includes('generador'))   return svgs.generador;
  return svgs.default;
}

// Convierte serial Excel (ej: 46185) o string dd/mm/yyyy → string "dd/mm/yyyy"
// Si ya es un string de fecha válido, lo devuelve tal cual.
function parsearFecha(valor) {
  if (!valor && valor !== 0) return '';
  const s = valor.toString().trim();
  if (!s || s === '-' || s.toLowerCase() === 'falta' || s.toLowerCase() === 'sin dato') return s;
  // ¿Es un número puro? → Serial de Excel
  if (/^\d{4,6}$/.test(s)) {
    const serial = parseInt(s, 10);
    // Excel epoch: 1 = 1 ene 1900, con el bug del año bisiesto 1900 (por eso -1)
    const msDesde1900 = (serial - 1) * 86400000;
    const fecha = new Date(Date.UTC(1900, 0, 1) + msDesde1900);
    // Corrección del bug de Excel (considera 1900 bisiesto)
    if (serial >= 60) fecha.setUTCDate(fecha.getUTCDate() - 1);
    const d = String(fecha.getUTCDate()).padStart(2, '0');
    const m = String(fecha.getUTCMonth() + 1).padStart(2, '0');
    const y = fecha.getUTCFullYear();
    return `${d}/${m}/${y}`;
  }
  // Ya es dd/mm/yyyy u otro formato texto → devolver tal cual
  return s;
}

function diasRestantes(fechaStr) {
  if (!fechaStr) return null;
  const s = parsearFecha(fechaStr.toString().trim());
  if (!s || s === '-' || s.toLowerCase() === 'falta' || s.toLowerCase() === 'sin dato') return null;
  const parts = s.split('/');
  if (parts.length === 3) {
    const d = new Date(+parts[2], +parts[1] - 1, +parts[0]);
    if (isNaN(d)) return null;
    return Math.round((d - today) / 86400000);
  }
  return null;
}

function docBadge(dias) {
  if (dias === null) return '<span class="badge gray">Sin dato</span>';
  if (dias < 0)  return `<span class="badge red">Vencido ${Math.abs(dias)}d</span>`;
  if (dias < 30) return `<span class="badge amber">Vence en ${dias}d</span>`;
  if (dias < 60) return `<span class="badge blue">Vence en ${dias}d</span>`;
  return `<span class="badge green">Vigente ${dias}d</span>`;
}

function formatNum(v) {
  const n = parseFloat((v || '').toString().replace(/\./g,'').replace(',','.'));
  if (isNaN(n)) return v || '—';
  return n.toLocaleString('es-CL');
}

function field(label, value) {
  return `<div class="field-row"><span class="fl">${label}</span><span class="fv">${value || '—'}</span></div>`;
}

function toast(msg, type = 'ok') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast ${type}`;
  t.classList.remove('hidden');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add('hidden'), 6000);
}

function splash(pct, hint) {
  document.getElementById('splash-progress').style.width = pct + '%';
  if (hint) document.getElementById('splash-hint').textContent = hint;
}

function hideSplash() {
  const el = document.getElementById('splash');
  el.style.opacity = '0';
  el.style.transition = 'opacity 0.4s';
  setTimeout(() => {
    el.classList.add('hidden');
    // Mostrar pantalla de módulos en vez de ir directo al main
    document.getElementById('modulos-home').classList.remove('hidden');
  }, 400);
}

// ── Google Sheets API ─────────────────────────────────────────
async function fetchSheet(range) {
  await ensureToken();
  const url = `${SHEETS_BASE}/${CONFIG.SHEET_ID}/values/${encodeURIComponent(range)}`;
  const res = await fetch(url, { headers: authHeader() });
  if (!res.ok) throw new Error(`Sheets ${res.status}: ${await res.text()}`);
  return (await res.json()).values || [];
}

async function writeSheet(range, values) {
  await ensureToken();
  const url = `${SHEETS_BASE}/${CONFIG.SHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ range, majorDimension: 'ROWS', values }),
  });
  if (!res.ok) throw new Error(`Sheets write ${res.status}: ${await res.text()}`);
  return res.json();
}

async function appendSheet(range, values) {
  await ensureToken();
  const url = `${SHEETS_BASE}/${CONFIG.SHEET_ID}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ range, majorDimension: 'ROWS', values }),
  });
  if (!res.ok) throw new Error(`Sheets append ${res.status}: ${await res.text()}`);
  return res.json();
}

// ── Google Drive API ──────────────────────────────────────────

// Busca o crea una carpeta. Usa uploadType=multipart porque es el único
// endpoint que acepta CORS desde GitHub Pages.
async function findOrCreateFolder(name, parentId) {
  await ensureToken();

  // 1. Buscar si ya existe
  const q = encodeURIComponent(`'${parentId}' in parents and name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const searchRes = await fetch(`${DRIVE_API}/files?q=${q}&fields=files(id,name)`, { headers: authHeader() });
  if (!searchRes.ok) throw new Error(`Drive search ${searchRes.status}: ${await searchRes.text()}`);
  const searchData = await searchRes.json();
  if (searchData.files && searchData.files.length > 0) {
    console.log('[FOLDER] Encontrada:', name, searchData.files[0].id);
    return searchData.files[0].id;
  }

  // 2. Crear — multipart con body vacío (único endpoint CORS-friendly desde GitHub Pages)
  console.log('[FOLDER] Creando:', name, 'en:', parentId);
  const boundary = 'lst_boundary_' + Date.now();
  const metadata = JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] });
  const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: text/plain\r\n\r\n\r\n--${boundary}--`;

  const createRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer ' + accessToken, 'Content-Type': 'multipart/related; boundary=' + boundary },
    body,
  });
  if (!createRes.ok) {
    const err = await createRes.text();
    console.error('[FOLDER] Error:', err);
    throw new Error(`Drive mkdir ${createRes.status}: ${err.slice(0,200)}`);
  }
  const folder = await createRes.json();
  console.log('[FOLDER] Creada OK:', name, folder.id);
  return folder.id;
}

// Devuelve el ID de [PATENTE]/ — la crea si no existe
async function getFolderForPatente(patente) {
  if (driveFolders[patente]) return driveFolders[patente];
  const id = await findOrCreateFolder(patente, CONFIG.DRIVE_ROOT_FOLDER);
  driveFolders[patente] = id;
  return id;
}

// Devuelve el ID de [PATENTE]/subfolder — la crea si no existe
// subfolder: 'Documentos' | 'Eventos'
async function getSubfolder(patente, subfolder) {
  const key = `${patente}/${subfolder}`;
  if (driveSubfolders[key]) return driveSubfolders[key];
  const parentId = await getFolderForPatente(patente);
  const id = await findOrCreateFolder(subfolder, parentId);
  driveSubfolders[key] = id;
  return id;
}

// Sube un archivo a [PATENTE]/subfolder (default 'Eventos')
async function uploadFile(file, patente, prefixName, subfolder = 'Eventos') {
  console.log('[UPLOAD] uploadFile:', prefixName, patente, file?.name, file?.size, '→', subfolder);
  toast('Subiendo ' + prefixName + '...');
  await ensureToken();

  let folderId;
  try {
    folderId = await getSubfolder(patente, subfolder);
  } catch(e) {
    console.warn('[UPLOAD] No se pudo crear subcarpeta, usando raíz:', e.message);
    folderId = CONFIG.DRIVE_ROOT_FOLDER;
  }

  // Nombre del archivo
  const ext = file.name.split('.').pop();
  const fileName = `${prefixName}_${patente}_${new Date().toLocaleDateString('es-CL').replace(/\//g,'-')}.${ext}`;
  const mimeType = file.type || 'application/octet-stream';

  // Leer como base64
  const b64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  // Construir multipart body manualmente
  // Este endpoint SÍ acepta requests desde github.io
  const boundary = 'lst_boundary_' + Date.now();
  const metadata = JSON.stringify({ name: fileName, parents: [folderId] });

  const body = [
    '--' + boundary,
    'Content-Type: application/json; charset=UTF-8',
    '',
    metadata,
    '--' + boundary,
    'Content-Type: ' + mimeType,
    'Content-Transfer-Encoding: base64',
    '',
    b64,
    '--' + boundary + '--'
  ].join('\r\n');

  console.log('[UPLOAD] Iniciando fetch multipart para:', fileName);
  console.log('[UPLOAD] folderId:', folderId);
  console.log('[UPLOAD] token válido:', !!accessToken, 'expira en:', Math.round((tokenExpiry - Date.now())/1000) + 's');
  console.log('[UPLOAD] body length:', body.length, 'b64 length:', b64.length);
  toast('Enviando a Drive...');

  let res;
  try {
    res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + accessToken,
        'Content-Type': 'multipart/related; boundary=' + boundary,
      },
      body: body
    });
  } catch(fetchErr) {
    console.error('[UPLOAD] fetch error:', fetchErr);
    throw new Error('Error de red: ' + fetchErr.message);
  }

  console.log('[UPLOAD] respuesta status:', res.status);
  
  if (!res.ok) {
    const err = await res.text();
    console.error('[UPLOAD] error body:', err);
    throw new Error('Drive error ' + res.status + ': ' + err.slice(0, 300));
  }

  const result = await res.json();
  console.log('[UPLOAD] éxito:', result);
  toast(prefixName + ' subido ✓');
  return { id: result.id, name: result.name };
}

// ── Tipos de eventos ──────────────────────────────────────────
const TIPOS_EVENTO = [
  { value: 'Mantención preventiva', icon: `<svg viewBox="0 0 24 24" fill="none" class="equipo-svg"><path d="M14.7 6.3a4 4 0 0 1-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 1 5.4-5.4L21 6l-3-3Z" stroke="white" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`, color: 'green'  },
  { value: 'Reparación',            icon: `<svg viewBox="0 0 24 24" fill="none" class="equipo-svg"><path d="M9 11 4 16l3 3 5-5" stroke="white" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M11 9l4-4 4 4-4 4Z" stroke="white" stroke-width="1.7" stroke-linejoin="round"/></svg>`, color: 'blue'   },
  { value: 'Falla',                 icon: `<svg viewBox="0 0 24 24" fill="none" class="equipo-svg"><path d="M12 3 3 19h18Z" stroke="white" stroke-width="1.7" stroke-linejoin="round"/><path d="M12 10v3.5" stroke="white" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="16.3" r="0.9" fill="white"/></svg>`, color: 'amber'  },
  { value: 'Choque / Accidente',    icon: `<svg viewBox="0 0 24 24" fill="none" class="equipo-svg"><path d="M3 16h1M3 16V9a1 1 0 0 1 1-1h9v8M12 16h7" stroke="white" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 11h4l3 3v2" stroke="white" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 4l3 3-3 3M9 2l-1 4 4-1" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`, color: 'red'    },
  { value: 'Inspección',            icon: `<svg viewBox="0 0 24 24" fill="none" class="equipo-svg"><circle cx="10" cy="10" r="6.5" stroke="white" stroke-width="1.7"/><path d="M15 15l6 6" stroke="white" stroke-width="1.7" stroke-linecap="round"/><path d="M7.5 10l1.8 1.8L13 8" stroke="white" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`, color: 'blue'   },
  { value: 'Cambio de documento',   icon: `<svg viewBox="0 0 24 24" fill="none" class="equipo-svg"><path d="M6 2h9l3 3v17H6Z" stroke="white" stroke-width="1.6" stroke-linejoin="round"/><path d="M9 11h6M9 15h6M9 7h3" stroke="white" stroke-width="1.5" stroke-linecap="round"/></svg>`, color: 'gray'   },
  { value: 'Otro',                  icon: `<svg viewBox="0 0 24 24" fill="none" class="equipo-svg"><circle cx="12" cy="12" r="9" stroke="white" stroke-width="1.7"/><path d="M12 16v.01M12 13c0-2 2-2 2-4a2 2 0 1 0-4 0" stroke="white" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`, color: 'gray'   },
];

function tipoEventoMeta(tipo) {
  return TIPOS_EVENTO.find(t => t.value === tipo) || TIPOS_EVENTO[TIPOS_EVENTO.length - 1];
}

// allEventos: cargados desde hoja MANTENCIONES
// Columnas: A=FECHA_REGISTRO B=PATENTE C=EQUIPO D=HOROMETRO E=TIPO F=DESCRIPCION G=FECHA_EVENTO H=FOTO
let allEventos = [];

async function loadEventos() {
  try {
    const rows = await fetchSheet(`'${CONFIG.SHEET_MANTENCIONES}'!A2:H500`);
    allEventos = rows
      .filter(r => r[0] || r[1])
      .map((r, i) => ({
        rowIndex:      i + 2,
        fechaRegistro: parsearFecha(r[0] || ''),
        patente:       r[1] || '',
        equipo:        r[2] || '',
        horometro:     r[3] || '',
        tipo:          r[4] || 'Mantención preventiva',
        descripcion:   r[5] || '',
        fechaEvento:   parsearFecha(r[6] || r[0] || ''),
        foto:          r[7] || '',
      }))
      .sort((a, b) => {
        const parseDate = s => {
          if (!s) return 0;
          const p = s.split('/');
          if (p.length === 3) return new Date(+p[2], +p[1]-1, +p[0]).getTime();
          return new Date(s).getTime() || 0;
        };
        return parseDate(b.fechaEvento) - parseDate(a.fechaEvento);
      });
  } catch(e) {
    console.warn('No se pudieron cargar eventos:', e.message);
    allEventos = [];
  }
}

function renderEventos() {
  // Selector de equipos en el formulario
  const sel = document.getElementById('evento-equipo');
  if (sel) {
    sel.innerHTML = allEquipos.map(e =>
      `<option value="${e.patente}">${e.marca} ${e.modelo} (${e.patente})</option>`
    ).join('');
  }

  // Próximas mantenciones (desde MAQUINARIA)
  const conHoro = allEquipos
    .filter(e => e.horometro && e.proxMant)
    .map(e => {
      const actual = parseFloat((e.horometro||'').toString().replace(/\./g,'')) || 0;
      const prox   = parseFloat((e.proxMant ||'').toString().replace(/\./g,'')) || 0;
      return { ...e, actual, prox, diff: prox - actual };
    })
    .filter(e => e.prox > 0)
    .sort((a,b) => a.diff - b.diff);

  document.getElementById('eventos-proximas').innerHTML = conHoro.slice(0,8).map(e => {
    const cls = e.diff < 0 ? 'red' : e.diff < 500 ? 'amber' : 'green';
    return `<div class="mant-card" onclick="openFicha('${e.patente}')">
      <div class="mant-icon mant-icon--flota">${iconoEquipo(e.equipo)}</div>
      <div class="mant-body">
        <div class="mant-title">${e.marca} ${e.modelo}</div>
        <div class="mant-meta">${e.equipo} · Actual: ${formatNum(e.actual)} · Próxima: ${formatNum(e.prox)} · Cada: ${e.mantCada||'—'}</div>
      </div>
      <span class="badge ${cls}">${e.diff >= 0 ? formatNum(e.diff)+' restante' : 'ATRASADA'}</span>
    </div>`;
  }).join('') || '<div class="empty">Sin datos de horómetro disponibles</div>';

  // Historial cronológico general
  renderHistorialEventos('eventos-historial', allEventos);
}

function renderHistorialEventos(containerId, eventos, limit = 50) {
  const list = eventos.slice(0, limit);
  document.getElementById(containerId).innerHTML = list.map(ev => {
    const meta   = tipoEventoMeta(ev.tipo);
    const equipo = allEquipos.find(e => e.patente === ev.patente);
    const nombre = equipo ? `${equipo.marca} ${equipo.modelo}` : ev.equipo || ev.patente;
    return `<div class="evento-card" onclick="${equipo ? `openFicha('${ev.patente}')` : ''}">
      <div class="evento-tipo-icon ${meta.color}">${meta.icon}</div>
      <div class="mant-body">
        <div class="mant-title">${ev.tipo}</div>
        <div class="mant-meta">${ev.fechaEvento} · ${nombre} · ${ev.patente}${ev.horometro ? ' · '+formatNum(ev.horometro)+' h/km' : ''}</div>
        ${ev.descripcion ? `<div class="evento-desc">${ev.descripcion}</div>` : ''}
      </div>
      <span class="badge ${meta.color}" style="white-space:nowrap">${ev.patente}</span>
    </div>`;
  }).join('') || emptyState('Sin eventos registrados','Aún no hay mantenciones ni reparaciones',`<path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>`);
}

function renderHistorialEquipo(patente) {
  const eventos = allEventos.filter(ev => ev.patente === patente);
  if (eventos.length === 0) return emptyState('Sin eventos','Aún no hay mantenciones ni reparaciones',`<path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>`);
  return eventos.slice(0, 20).map(ev => {
    const meta = tipoEventoMeta(ev.tipo);
    return `<div class="evento-card-mini">
      <div class="evento-tipo-icon ${meta.color}">${meta.icon}</div>
      <div class="mant-body">
        <div class="mant-title">${ev.tipo}</div>
        <div class="mant-meta">${ev.fechaEvento}${ev.horometro ? ' · '+formatNum(ev.horometro)+' h/km' : ''}</div>
        ${ev.descripcion ? `<div class="evento-desc">${ev.descripcion}</div>` : ''}
      </div>
    </div>`;
  }).join('');
}

// ── Panel evento ───────────────────────────────────────────────
function openEventoPanel(patente) {
  const sel = document.getElementById('evento-equipo');
  if (sel) {
    sel.innerHTML = '<option value="">— Seleccionar equipo —</option>' +
      allEquipos.map(e =>
        `<option value="${e.patente}">${e.marca} ${e.modelo} (${e.patente})</option>`
      ).join('');
    if (patente) {
      for (const opt of sel.options) {
        if (opt.value === patente) { sel.value = patente; break; }
      }
    }
  }
  document.getElementById('evento-fecha').value     = new Date().toISOString().slice(0,10);
  document.getElementById('evento-horometro').value = '';
  document.getElementById('evento-proxima').value   = '';
  document.getElementById('evento-obs').value       = '';
  limpiarFotos();
  // Mostrar/ocultar campo próxima según tipo
  const tipoSel = document.getElementById('evento-tipo');
  const toggleProxima = () => {
    document.getElementById('evento-proxima-group').style.display =
      tipoSel.value === 'Mantención preventiva' ? 'block' : 'none';
  };
  tipoSel.onchange = toggleProxima;
  tipoSel.value = 'Mantención preventiva';
  toggleProxima();
  openPanel('panel-evento');
}

// Alias para compatibilidad con botones existentes
function openMantPanel(patente) { openEventoPanel(patente); }

async function saveEvento() {
  const patente   = document.getElementById('evento-equipo').value;
  const horometro = document.getElementById('evento-horometro').value;
  const fecha     = document.getElementById('evento-fecha').value;
  const tipo      = document.getElementById('evento-tipo').value;
  const obs       = document.getElementById('evento-obs').value;
  const proxima   = document.getElementById('evento-proxima')?.value || '';

  if (!patente || !fecha) { toast('Completa los campos obligatorios', 'error'); return; }

  // Bloquear botón para evitar doble guardado
  const btn = document.querySelector('#panel-evento .pnl-action');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }

  try {
    const e = allEquipos.find(x => x.patente === patente);
    const nombreEquipo = e ? `${e.marca} ${e.modelo}` : patente;

    // Subir todas las fotos desde memoria (_eventoFotos) a [PATENTE]/Eventos/
    const fotosSubidas = [];
    if (_eventoFotos.length > 0) {
      await ensureToken();
      let folderId = CONFIG.DRIVE_ROOT_FOLDER;
      try { folderId = await getSubfolder(patente, 'Eventos'); } catch(fe) {
        console.warn('[EVENTO] No se pudo obtener subcarpeta Eventos:', fe.message);
      }

      const prefixBase = `EVT_${tipo.replace(/[\s\/]/g,'_')}`;
      const fechaStr = new Date().toLocaleDateString('es-CL').replace(/\//g,'-');

      for (let i = 0; i < _eventoFotos.length; i++) {
        const foto = _eventoFotos[i];
        if (btn) btn.textContent = `Subiendo foto ${i+1}/${_eventoFotos.length}...`;
        toast(`Subiendo foto ${i+1} de ${_eventoFotos.length}...`);

        try {
          const ext      = foto.name.split('.').pop() || 'jpg';
          const suffix   = _eventoFotos.length > 1 ? `_${i+1}` : '';
          const fileName = `${prefixBase}${suffix}_${patente}_${fechaStr}.${ext}`;
          const boundary = 'lst_ev_' + Date.now() + '_' + i;
          const metadata = JSON.stringify({ name: fileName, parents: [folderId] });

          const body = [
            '--' + boundary,
            'Content-Type: application/json; charset=UTF-8',
            '',
            metadata,
            '--' + boundary,
            'Content-Type: ' + foto.mimeType,
            'Content-Transfer-Encoding: base64',
            '',
            foto.b64,
            '--' + boundary + '--'
          ].join('\r\n');

          const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST',
            headers: {
              'Authorization': 'Bearer ' + accessToken,
              'Content-Type': 'multipart/related; boundary=' + boundary,
            },
            body,
          });

          if (!res.ok) {
            const err = await res.text();
            console.error('[EVENTO] Error foto', i+1, err);
            toast(`Error foto ${i+1}: ${res.status}`, 'error');
          } else {
            const result = await res.json();
            fotosSubidas.push(result.name || fileName);
            console.log('[EVENTO] Foto subida OK:', result.name);
          }
        } catch(fotoErr) {
          console.error('[EVENTO] Error subiendo foto', i+1, fotoErr);
          toast(`Error foto ${i+1}: ${fotoErr.message}`, 'error');
        }
      }
      if (fotosSubidas.length > 0) toast(`${fotosSubidas.length} foto(s) subida(s) a Drive ✓`);
    }

    const fotoNombre = fotosSubidas.join(' | ');

    // A=FECHA_REG B=PATENTE C=EQUIPO D=HOROMETRO E=TIPO F=DESC G=FECHA_EVT H=FOTO
    const fechaReg = "'" + new Date().toLocaleDateString('es-CL');
    const fechaFmt = "'" + fecha.split('-').reverse().join('/');
    await appendSheet(`'${CONFIG.SHEET_MANTENCIONES}'!A:H`, [[
      fechaReg, patente, nombreEquipo, horometro, tipo, obs, fechaFmt, fotoNombre
    ]]);

    // Solo Mantención preventiva: actualizar última mantención (N) y próxima (M)
    if (e && tipo === 'Mantención preventiva') {
      const writes = [];
      if (horometro) {
        writes.push(writeSheet(`'${CONFIG.SHEET_MAQUINARIA}'!N${e.rowIndex}`, [[horometro]]));
        e.ultMant = horometro;
      }
      if (proxima) {
        writes.push(writeSheet(`'${CONFIG.SHEET_MAQUINARIA}'!M${e.rowIndex}`, [[proxima]]));
        e.proxMant = proxima;
      }
      if (writes.length) await Promise.all(writes);
    }

    toast('Evento registrado ✓');
    limpiarFotos();
    // Usar _origClosePanel para no disparar history.go(-1) que deja el panel colgado
    _origClosePanel('panel-evento');
    const idx = _panelStack.lastIndexOf('panel-evento');
    if (idx !== -1) _panelStack.splice(idx, 1);
    await loadEventos();
    renderEventos();
    renderDashboard();
  } catch(err) {
    toast('Error: ' + err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Guardar'; }
  }
}

// ── Multi-foto en evento ───────────────────────────────────────
// Fotos capturadas en memoria: array de { b64, name, size, mimeType, previewUrl }
const _eventoFotos = [];

function onFotosSelected(input) {
  if (!input.files || !input.files.length) return;
  const nuevos = Array.from(input.files);
  // Limpiar input para permitir seleccionar los mismos archivos de nuevo
  input.value = '';

  nuevos.forEach(file => {
    const reader = new FileReader();
    reader.onload = () => {
      _eventoFotos.push({
        b64:        reader.result.split(',')[1],
        name:       file.name,
        size:       file.size,
        mimeType:   file.type || 'image/jpeg',
        previewUrl: reader.result,   // data URL para miniatura
      });
      renderFotoPreview();
    };
    reader.readAsDataURL(file);
  });
}

function renderFotoPreview() {
  const container = document.getElementById('evento-fotos-preview');
  if (!container) return;

  if (_eventoFotos.length === 0) {
    container.innerHTML = '';
    document.getElementById('evento-fotos-count').textContent = '';
    return;
  }

  document.getElementById('evento-fotos-count').textContent =
    `${_eventoFotos.length} foto${_eventoFotos.length > 1 ? 's' : ''} seleccionada${_eventoFotos.length > 1 ? 's' : ''}`;

  container.innerHTML = _eventoFotos.map((f, i) => `
    <div class="foto-thumb-wrap">
      <img src="${f.previewUrl}" class="foto-thumb" alt="${f.name}">
      <button class="foto-thumb-del" onclick="eliminarFoto(${i})" title="Eliminar">✕</button>
    </div>
  `).join('');
}

function eliminarFoto(index) {
  _eventoFotos.splice(index, 1);
  renderFotoPreview();
}

function limpiarFotos() {
  _eventoFotos.length = 0;
  renderFotoPreview();
}

// Alias legacy para compatibilidad
function onFotoSelected(input) {
  onFotosSelected(input);
}

// ── Cargar datos ──────────────────────────────────────────────
async function loadData(background = false) {
  const btn = document.getElementById('refresh-btn');
  if (btn) btn.style.opacity = '0.4';

  // En modo background (refresh silencioso) no mostramos el splash grande
  if (!background) {
    splash(10, 'Conectando con Google Sheets...');
  } else {
    toast('Actualizando datos...');
  }

  try {
    // Columnas A→W (índices 0→22)
    // A=N° B=EQUIPO C=CODIGO D=MARCA E=MODELO F=AÑO G=COLOR H=PATENTE
    // I=ESTADO J=UBICACION K=HOROMETRO L=PROX_MANT M=ULT_MANT
    // N=SOAP O=PERMISO P=REVISION Q=? R=PATENTE2 S=OBS T=MANT_CADA
    // U=PROPIETARIO V=RUT W=LINK_FICHA_TECNICA
    const rows = await fetchSheet(`'${CONFIG.SHEET_MAQUINARIA}'!A2:V200`);
    if (!background) splash(70, 'Procesando equipos...');

    allEquipos = rows
      .filter(r => r[1] && r[1].toString().trim() && r[1].toString().trim().toUpperCase() !== 'EQUIPO')
      .map((r, i) => ({
        rowIndex:    i + 2,
        equipo:      r[1]  || '',
        marca:       r[2]  || '',
        modelo:      r[3]  || '',
        patente:     r[4]  || '',
        anio:        r[5]  || '',
        color:       r[6]  || '',
        propietario: r[7]  || '',
        rut:         r[8]  || '',
        estadoRaw:   r[9]  || '',
        estado:      parseEstado(r[9]),
        ubicacion:   r[10] || '',
        horometro:   r[11] || '',
        proxMant:    r[12] || '',
        ultMant:     r[13] || '',
        mantCada:    r[14] || '',
        soap:        parsearFecha(r[15] || ''),
        permiso:     parsearFecha(r[16] || ''),
        revision:    parsearFecha(r[17] || ''),
        obs:         r[18] || '',
        linkFicha:   r[19] || '',
        estadoDoc:   r[20] || '',
        fotoRef:     (() => {
          const u = r[21] || '';
          if (!u) return '';
          // Convertir URL antigua uc?export=view al formato thumbnail que sí carga en <img>
          const m = u.match(/[?&]id=([a-zA-Z0-9_-]+)/);
          if (m) return `https://drive.google.com/thumbnail?id=${m[1]}&sz=w800`;
          return u;
        })(),
      }));

    if (!background) splash(80, 'Cargando eventos...');
    await loadEventos();

    if (!background) splash(90, 'Cargando inventario...');
    await loadInventario();
    if (typeof loadMovimientos === 'function') { try { await loadMovimientos(); } catch(e) {} }

    if (!background) splash(100, '¡Listo!');
    renderDashboard();
    renderEquipos();
    renderAlertas();
    renderEventos();
    // Refrescar vistas de inventario/containers si están visibles
    if (typeof renderInvLista === 'function') renderInvLista();
    if (typeof renderContainers === 'function') renderContainers();
    if (!background) {
      setTimeout(() => {
        hideSplash();
        restoreState();
      }, 300);
    }
    toast('Datos actualizados ✓');
    actualizarBannerOffline(false);
    guardarCacheOffline();
  } catch (e) {
    console.error(e);
    // Sin conexión (u otro error de red) → si hay datos guardados, mostrarlos en vez de dejar la pantalla en blanco
    const sinRed = !navigator.onLine || /Failed to fetch|NetworkError|network/i.test(e.message || '');
    if (sinRed && cargarCacheOffline()) {
      splash(100, 'Sin conexión — usando datos guardados');
      setTimeout(() => {
        hideSplash();
        document.getElementById('modulos-home').classList.remove('hidden');
        actualizarBannerOffline(true);
        _renderTodoDesdeMemoria();
      }, 400);
    } else {
      splash(100, 'Error: ' + e.message);
      toast('Error: ' + e.message, 'error');
      setTimeout(hideSplash, 2000);
    }
  } finally {
    if (btn) btn.style.opacity = '1';
  }
}

// ── Dashboard ─────────────────────────────────────────────────
function renderDashboard() {
  document.getElementById('stat-op').textContent  = allEquipos.filter(e => e.estado === 'op').length;
  document.getElementById('stat-obs').textContent = allEquipos.filter(e => e.estado === 'obs').length;
  document.getElementById('stat-det').textContent = allEquipos.filter(e => e.estado === 'det' || e.estado === 'rep').length;

  let docsVenc = 0;
  allEquipos.forEach(e => ['soap','permiso','revision'].forEach(k => {
    const d = diasRestantes(e[k]);
    if (d !== null && d < 0) docsVenc++;
  }));
  document.getElementById('stat-docs').textContent = docsVenc;
  document.getElementById('nav-dot').style.display = docsVenc > 0 ? 'block' : 'none';

  // Alertas urgentes
  const alertas = [];
  allEquipos.forEach(e => {
    [['soap','SOAP'],['permiso','Permiso Circ.'],['revision','Rev. Técnica']].forEach(([k,lbl]) => {
      const d = diasRestantes(e[k]);
      if (d !== null && d < CONFIG.DIAS_ALERTA) alertas.push({ e, lbl, d });
    });
  });
  alertas.sort((a,b) => a.d - b.d);

  document.getElementById('dash-alerts').innerHTML = alertas.slice(0,6).map(({e,lbl,d}) => {
    const cls = d < 0 ? 'red' : d < 30 ? 'amber' : 'blue';
    const txt = d < 0 ? `Vencido ${Math.abs(d)}d` : `Vence en ${d}d`;
    return `<div class="card" onclick="openFicha('${e.patente}')">
      <div class="card-icon card-icon--flota">${iconoEquipo(e.equipo)}</div>
      <div class="card-body">
        <div class="card-title">${e.marca} ${e.modelo}</div>
        <div class="card-sub">${e.equipo} · ${e.patente} · ${e.ubicacion}</div>
      </div>
      <div class="card-right">
        <span class="badge ${cls}">${txt}</span>
        <span style="font-size:11px;color:#aaa">${lbl}</span>
      </div>
    </div>`;
  }).join('') || emptyState('Todo al día','No hay alertas urgentes pendientes',`<path d="M9 12l2 2 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/>`);

  // Mantenciones próximas
  const conHoro = allEquipos
    .filter(e => e.horometro && e.proxMant)
    .map(e => {
      const actual = parseFloat((e.horometro||'').toString().replace(/\./g,'').replace(',','.')) || 0;
      const prox   = parseFloat((e.proxMant ||'').toString().replace(/\./g,'').replace(',','.')) || 0;
      return { ...e, actual, prox, diff: prox - actual };
    })
    .filter(e => e.prox > 0)
    .sort((a,b) => a.diff - b.diff);

  document.getElementById('dash-mant').innerHTML = conHoro.slice(0,5).map(e => {
    const cls = e.diff < 0 ? 'red' : e.diff < 500 ? 'amber' : 'green';
    return `<div class="card" onclick="openFicha('${e.patente}')">
      <div class="card-icon card-icon--flota">${iconoEquipo(e.equipo)}</div>
      <div class="card-body">
        <div class="card-title">${e.marca} ${e.modelo}</div>
        <div class="card-sub">Actual: ${formatNum(e.actual)} · Próxima: ${formatNum(e.prox)}</div>
      </div>
      <span class="badge ${cls}">${e.diff >= 0 ? 'Faltan ' + formatNum(e.diff) : 'ATRASADA'}</span>
    </div>`;
  }).join('') || '<div class="empty">Sin datos de horómetro disponibles</div>';

  // Actualizar layout desktop si está activo
  if (typeof _desktopAfterLoad === 'function') _desktopAfterLoad();
}

// ── Equipos ───────────────────────────────────────────────────
function renderEquipos() {
  const txt = (document.getElementById('search-input').value || '').toLowerCase();
  const filtered = allEquipos.filter(e => {
    const matchF =
      currentFilter === 'todos' ||
      (currentFilter === 'op'  && e.estado === 'op')  ||
      (currentFilter === 'obs' && e.estado === 'obs') ||
      (currentFilter === 'det' && e.estado === 'det') ||
      (currentFilter === 'rep' && e.estado === 'rep');
    const matchT = !txt ||
      e.marca.toLowerCase().includes(txt)   ||
      e.modelo.toLowerCase().includes(txt)  ||
      e.equipo.toLowerCase().includes(txt)  ||
      e.patente.toLowerCase().includes(txt) ||
      e.ubicacion.toLowerCase().includes(txt);
    return matchF && matchT;
  }).sort((a, b) => {
    const cmp = (a.equipo||'').localeCompare(b.equipo||'', 'es');
    if (cmp !== 0) return cmp;
    return ((a.marca||'') + (a.modelo||'')).localeCompare((b.marca||'') + (b.modelo||''), 'es');
  });

  const ESTADO_CARD = { op: 'card--op', obs: 'card--obs', det: 'card--det', rep: 'card--rep' };

  document.getElementById('equipos-list').innerHTML = filtered.map(e => `
    <div class="card ${ESTADO_CARD[e.estado] || 'card--default'}" onclick="openFicha('${e.patente}')">
      <div class="card-icon card-icon--flota">${iconoEquipo(e.equipo)}</div>
      <div class="card-body">
        <div class="card-title">${e.marca} ${e.modelo}</div>
        <div class="card-sub">${e.equipo} · ${e.patente}</div>
      </div>
      <div class="card-right">
        <span class="badge ${ESTADO_COLOR[e.estado]||'gray'}">${ESTADO_LABEL[e.estado]||e.estado}</span>
        <span style="font-size:11px;color:#aaa">${e.ubicacion}</span>
      </div>
    </div>`).join('') || emptyState('Sin resultados', 'Probá con otro filtro o búsqueda',
      `<circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.8"/><path d="M16 16l4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`);
}

function setFilter(f, btn) {
  currentFilter = f;
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  try { localStorage.setItem('lst_filter', f); } catch(e) {}
  renderEquipos();
}

// ── Ficha equipo ──────────────────────────────────────────────
function openFicha(patente) {
  currentEquipo = allEquipos.find(e => e.patente === patente);
  if (!currentEquipo) return;
  const e = currentEquipo;
  try { localStorage.setItem('lst_ficha', patente); } catch(err) {}

  document.getElementById('ficha-title').textContent = `${e.marca} ${e.modelo}`;

  // Botón ficha técnica (Google Doc)
  const fichaBtn = e.linkFicha
    ? `<a class="ficha-link-btn" href="${e.linkFicha}" target="_blank" rel="noopener">
        <svg viewBox="0 0 24 24" fill="none" class="inline-ic"><path d="M6 2h9l3 3v17H6Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M9 11h6M9 15h6M9 7h3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg> Abrir ficha técnica
       </a>`
    : `<div class="ficha-link-btn disabled" style="opacity:0.4;cursor:default"><svg viewBox="0 0 24 24" fill="none" class="inline-ic"><path d="M6 2h9l3 3v17H6Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M9 11h6M9 15h6M9 7h3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg> Ficha técnica no disponible</div>`;

  document.getElementById('ficha-body').innerHTML = `
    <div class="ficha-hero">
      <div class="ficha-hero-icon ficha-hero-icon--flota">${iconoEquipo(e.equipo)}</div>
      <div class="ficha-hero-info">
        <div class="ficha-hero-type">${e.equipo}</div>
        <div class="ficha-hero-name">${e.marca} ${e.modelo}</div>
        <div class="ficha-hero-plate">${e.patente} · ${e.anio} · ${e.color}</div>
        <span class="badge ${ESTADO_COLOR[e.estado]||'gray'}" style="margin-top:6px;display:inline-block">
          ${ESTADO_LABEL[e.estado]||e.estado}
        </span>
        ${e.estadoDoc ? `<span class="badge gray" style="margin-top:4px;display:inline-block">${e.estadoDoc}</span>` : ''}
      </div>
    </div>

    <div class="ficha-section">
      <div class="ficha-sec-title">Información general</div>
      ${field('Ubicación', e.ubicacion)}
      ${field('Propietario', e.propietario)}
      ${field('Año', e.anio)}
      ${field('Color', e.color)}
    </div>

    ${e.fotoRef ? `
    <div class="ficha-section" style="padding:0;overflow:hidden;border-radius:14px;cursor:pointer" onclick="abrirFotoRefModal('${e.patente}')">
      <img src="${e.fotoRef}" alt="Foto de referencia" style="width:100%;max-height:220px;object-fit:cover;display:block;border-radius:14px">
    </div>` : ''}

    <div class="ficha-section">
      <div class="ficha-sec-title">Horómetro / Odómetro</div>
      ${field('Actual', formatNum(e.horometro) + (e.mantCada ? ' · Cada ' + e.mantCada : ''))}
      ${field('Próxima mantención', formatNum(e.proxMant))}
      ${field('Última mantención', formatNum(e.ultMant))}
      ${e.obs ? `<div class="ficha-obs"><svg viewBox="0 0 24 24" fill="none" class="inline-ic"><path d="M12 3 3 19h18Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M12 10v3.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="16.3" r="0.9" fill="currentColor"/></svg> ${e.obs}</div>` : ''}
      <button class="action-btn" onclick="openEventoPanel('${e.patente}')">+ Registrar evento</button>
    </div>

    <div class="ficha-section">
      <div class="ficha-sec-title">Historial de eventos</div>
      ${renderHistorialEquipo(e.patente)}
    </div>

    <div class="ficha-section">
      <div class="ficha-sec-title">Documentos</div>
      <div class="doc-row">
        <div><div class="doc-name">SOAP</div><div class="doc-date">${e.soap||'Sin dato'}</div></div>
        <div style="display:flex;gap:6px;align-items:center">
          ${docBadge(diasRestantes(e.soap))}
          <button class="doc-open-btn" onclick="openDocDrive('${e.patente}','SOAP')"><svg viewBox="0 0 24 24" fill="none" class="inline-ic"><path d="M3 8l1-3h6l1 2h9v12H3Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg> Ver</button>
        </div>
      </div>
      <div class="doc-row">
        <div><div class="doc-name">Permiso de circulación</div><div class="doc-date">${e.permiso||'Sin dato'}</div></div>
        <div style="display:flex;gap:6px;align-items:center">
          ${docBadge(diasRestantes(e.permiso))}
          <button class="doc-open-btn" onclick="openDocDrive('${e.patente}','PERMISO')"><svg viewBox="0 0 24 24" fill="none" class="inline-ic"><path d="M3 8l1-3h6l1 2h9v12H3Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg> Ver</button>
        </div>
      </div>
      <div class="doc-row">
        <div><div class="doc-name">Revisión técnica</div><div class="doc-date">${e.revision||'Sin dato'}</div></div>
        <div style="display:flex;gap:6px;align-items:center">
          ${docBadge(diasRestantes(e.revision))}
          <button class="doc-open-btn" onclick="openDocDrive('${e.patente}','REVISION')"><svg viewBox="0 0 24 24" fill="none" class="inline-ic"><path d="M3 8l1-3h6l1 2h9v12H3Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg> Ver</button>
        </div>
      </div>
    </div>

    ${fichaBtn}
    <a class="ficha-link-btn" onclick="abrirCarpetaDrive('${e.patente}')" style="cursor:pointer;margin-top:6px;display:flex;align-items:center;gap:8px;background:#e8f4fd;color:#1a73e8;border:1px solid #c5e0f5">
      <svg viewBox="0 0 24 24" fill="none" class="inline-ic"><path d="M3 8l1-3h6l1 2h9v12H3Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg> Abrir carpeta en Drive
    </a>
    ${typeof _renderHistorialMovimientos === 'function' ? _renderHistorialMovimientos(e.patente) : ''}
    <button class="action-btn" onclick="openEditPanel()" style="margin-top:8px"><svg viewBox="0 0 24 24" fill="none" class="inline-ic"><path d="M4 20l1-4 11-11 3 3-11 11Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M14 7l3 3" stroke="currentColor" stroke-width="1.7"/></svg> Editar información</button>
  `;

  openPanel('panel-ficha');
}

// ── Abrir carpeta Drive de un equipo ─────────────────────────
async function abrirCarpetaDrive(patente) {
  toast('Buscando carpeta en Drive...');
  try {
    await ensureToken();
    // Buscar carpeta con nombre igual a la patente dentro de DRIVE_ROOT_FOLDER
    const q = `mimeType='application/vnd.google-apps.folder' and name='${patente}' and '${CONFIG.DRIVE_ROOT_FOLDER}' in parents and trashed=false`;
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=1`,
      { headers: { Authorization: 'Bearer ' + accessToken } }
    );
    const data = await res.json();
    if (data.files && data.files.length > 0) {
      const folderId = data.files[0].id;
      window.open(`https://drive.google.com/drive/folders/${folderId}`, '_blank');
    } else {
      // Carpeta no existe aún — abrir la raíz
      toast('Carpeta no encontrada, abriendo carpeta raíz...', 'warn');
      window.open(`https://drive.google.com/drive/folders/${CONFIG.DRIVE_ROOT_FOLDER}`, '_blank');
    }
  } catch(e) {
    toast('Error: ' + e.message, 'error');
  }
}
async function openDocDrive(patente, prefix) {
  toast('Buscando documento en Drive...');
  try {
    await ensureToken();

    // Busca en: [PATENTE]/Documentos/ → [PATENTE]/ → raíz (retrocompatible)
    const foldersToSearch = [];
    try { foldersToSearch.push(await getSubfolder(patente, 'Documentos')); } catch(e) {}
    try { foldersToSearch.push(await getFolderForPatente(patente)); } catch(e) {}
    foldersToSearch.push(CONFIG.DRIVE_ROOT_FOLDER);

    // Deduplicar
    const unique = [...new Set(foldersToSearch)];

    for (const folder of unique) {
      const q = encodeURIComponent(`'${folder}' in parents and name contains '${prefix}_${patente}' and trashed=false`);
      const url = `${DRIVE_API}/files?q=${q}&fields=files(id,name,webViewLink)&orderBy=createdTime desc`;
      const res = await fetch(url, { headers: authHeader() });
      const data = await res.json();
      if (data.files && data.files.length > 0) {
        toast('Abriendo ' + data.files[0].name + '...');
        window.open(`https://drive.google.com/uc?export=view&id=${data.files[0].id}`, '_blank');
        return;
      }
    }
    toast('No se encontró archivo de ' + prefix + ' para ' + patente + '. ¿Ya subiste el documento?', 'error');
  } catch(err) {
    toast('Error: ' + err.message, 'error');
  }
}

// ── Alertas ───────────────────────────────────────────────────
function renderAlertas() {
  const vencidos = [], pronto = [], ok = [];

  allEquipos.forEach(e => {
    const entries = [['soap','SOAP'],['permiso','Permiso Circ.'],['revision','Rev. Técnica']];
    let hasVenc = false, hasPront = false;
    const badges = entries.map(([k,lbl]) => {
      const d = diasRestantes(e[k]);
      if (d === null) return `<span class="badge gray">${lbl} sin dato</span>`;
      if (d < 0)                  { hasVenc  = true; return `<span class="badge red">${lbl} vencido ${Math.abs(d)}d</span>`; }
      if (d < CONFIG.DIAS_ALERTA) { hasPront = true; return `<span class="badge ${d<30?'amber':'blue'}">${lbl} ${d}d</span>`; }
      return `<span class="badge green">${lbl} ✓ ${d}d</span>`;
    }).join('');

    const card = `<div class="card" onclick="openFicha('${e.patente}')">
      <div class="card-icon card-icon--flota">${iconoEquipo(e.equipo)}</div>
      <div class="card-body">
        <div class="card-title">${e.marca} ${e.modelo}</div>
        <div class="card-sub">${e.equipo} · ${e.patente} · ${e.ubicacion}</div>
        <div class="badge-row">${badges}</div>
      </div>
    </div>`;

    if (hasVenc) vencidos.push(card);
    else if (hasPront) pronto.push(card);
    else ok.push(card);
  });

  document.getElementById('alertas-vencidos').innerHTML = vencidos.join('') || emptyState('Sin vencidos','Todos los documentos están vigentes');
  document.getElementById('alertas-pronto').innerHTML   = pronto.join('')   || emptyState('Sin vencimientos','No hay documentos por vencer pronto');
  document.getElementById('alertas-ok').innerHTML       = ok.join('')       || emptyState('Sin documentos registrados','Agrega documentos desde la ficha de cada equipo');
}


// ── Panel editar equipo ───────────────────────────────────────
function openEditPanel() {
  const e = currentEquipo;
  if (!e) return;
  document.getElementById('edit-row').value       = e.rowIndex;
  document.getElementById('edit-patente').value   = e.patente;

  // Carga estado: si el valor exacto no está en las opciones, lo agrega
  const estadoSelect = document.getElementById('edit-estado');
  const estadoVal = e.estadoRaw || 'OPERATIVO';
  let found = false;
  for (const opt of estadoSelect.options) {
    if (opt.value.trim().toUpperCase() === estadoVal.trim().toUpperCase()) {
      estadoSelect.value = opt.value;
      found = true;
      break;
    }
  }
  if (!found) {
    // Agrega el valor exacto del Sheet como opción
    const opt = document.createElement('option');
    opt.value = estadoVal;
    opt.textContent = estadoVal;
    estadoSelect.appendChild(opt);
    estadoSelect.value = estadoVal;
  }

  document.getElementById('edit-ubicacion').value = e.ubicacion;
  document.getElementById('edit-horometro').value = e.horometro;
  document.getElementById('edit-proxima').value   = e.proxMant;
  document.getElementById('edit-ultima').value    = e.ultMant;

  document.getElementById('edit-soap').value      = e.soap;
  document.getElementById('edit-permiso').value   = e.permiso;
  document.getElementById('edit-revision').value  = e.revision;
  document.getElementById('edit-obs').value       = e.obs;

  // Cargar foto de referencia actual si existe
  _editFotoRef = null;
  _editFotoRefFile = null;
  const prevImg  = document.getElementById('edit-foto-ref-img');
  const prevWrap = document.getElementById('edit-foto-ref-preview');
  const removeBtn = document.getElementById('edit-foto-ref-remove');
  const infoEl   = document.getElementById('edit-foto-ref-info');
  if (e.fotoRef) {
    prevImg.src = e.fotoRef;
    prevWrap.style.display = 'block';
    removeBtn.style.display = 'block';
    infoEl.textContent = 'Foto actual guardada';
  } else {
    prevImg.src = '';
    prevWrap.style.display = 'none';
    removeBtn.style.display = 'none';
    infoEl.textContent = '';
  }

  // Limpiar estado de archivos del equipo anterior
  Object.keys(_capturedFiles).forEach(k => delete _capturedFiles[k]);
  resetDocInputs();

  openPanel('panel-edit');
}

// ── Foto de referencia de equipo (Drive) ─────────────────────
// null = sin cambios, 'QUITAR' = borrar, File = nueva foto a subir
let _editFotoRef = null;
let _editFotoRefFile = null; // File object para subir a Drive

function onFotoRefSelected(input) {
  const file = input.files[0];
  if (!file) return;
  _editFotoRefFile = file;
  _editFotoRef = 'NUEVA'; // marca que hay foto nueva pendiente de subir

  // Preview local inmediato
  const reader = new FileReader();
  reader.onload = ev => {
    const prevImg   = document.getElementById('edit-foto-ref-img');
    const prevWrap  = document.getElementById('edit-foto-ref-preview');
    const removeBtn = document.getElementById('edit-foto-ref-remove');
    const infoEl    = document.getElementById('edit-foto-ref-info');
    prevImg.src = ev.target.result;
    prevWrap.style.display  = 'block';
    removeBtn.style.display = 'block';
    const kb = Math.round(file.size / 1024);
    infoEl.textContent = `Nueva foto · ${file.name} · ${kb} KB · se subirá a Drive al guardar`;
  };
  reader.readAsDataURL(file);
  input.value = '';
}

function quitarFotoRef() {
  _editFotoRef = 'QUITAR';
  _editFotoRefFile = null;
  document.getElementById('edit-foto-ref-img').src = '';
  document.getElementById('edit-foto-ref-preview').style.display = 'none';
  document.getElementById('edit-foto-ref-remove').style.display = 'none';
  document.getElementById('edit-foto-ref-info').textContent = 'Foto eliminada al guardar';
}

// Modal foto referencia a pantalla completa
function abrirFotoRefModal(patente) {
  const eq = allEquipos.find(e => e.patente === patente);
  if (!eq || !eq.fotoRef) return;
  let modal = document.getElementById('foto-ref-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'foto-ref-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:9999;display:flex;align-items:center;justify-content:center;flex-direction:column';
    modal.innerHTML = `
      <button onclick="document.getElementById('foto-ref-modal').style.display='none'" style="position:absolute;top:16px;right:16px;background:rgba(255,255,255,0.15);border:none;color:#fff;font-size:22px;width:40px;height:40px;border-radius:50%;cursor:pointer">✕</button>
      <img id="foto-ref-modal-img" src="" style="max-width:95vw;max-height:90vh;object-fit:contain;border-radius:8px">
    `;
    modal.onclick = e => { if (e.target === modal) modal.style.display = 'none'; };
    document.body.appendChild(modal);
  }
  document.getElementById('foto-ref-modal-img').src = eq.fotoRef;
  modal.style.display = 'flex';
}

async function saveEquipo() {
  const row       = document.getElementById('edit-row').value;
  const estado    = document.getElementById('edit-estado').value;
  const ubicacion = document.getElementById('edit-ubicacion').value;
  const horometro = document.getElementById('edit-horometro').value;
  const proxima   = document.getElementById('edit-proxima').value;
  const ultima    = document.getElementById('edit-ultima').value;
  const soap      = document.getElementById('edit-soap').value;
  const permiso   = document.getElementById('edit-permiso').value;
  const revision  = document.getElementById('edit-revision').value;
  const obs       = document.getElementById('edit-obs').value;
  const patente   = document.getElementById('edit-patente').value;
  if (!row) return;

  // ── PASO 0: Leer archivos desde _capturedFiles (guardados al seleccionar) ──
  // Los input[type=file] se vacían solos en móvil durante navegación async.
  // Por eso onDocFileSelected ya convirtió cada archivo a base64 en memoria.
  const fileQueue = Object.values(_capturedFiles);
  console.log('[SAVE] Archivos en memoria:', fileQueue.length, fileQueue.map(f => f.prefix));
  // Limpiar para el próximo uso
  Object.keys(_capturedFiles).forEach(k => delete _capturedFiles[k]);

  // Evitar doble submit si el botón ya está deshabilitado
  const btn = document.getElementById('save-equipo-btn');
  if (btn && btn.disabled) { console.warn('[SAVE] Ya hay un guardado en curso, ignorando.'); return; }
  const setBtnState = (disabled, text) => {
    if (btn) { btn.disabled = disabled; btn.textContent = text; }
  };
  setBtnState(true, 'Guardando...');

  try {
    // 1. Guardar todos los campos en Sheets
    toast('Guardando datos...');
    console.log('[SAVE] Escribiendo fila', row, 'en Sheet...');

    // Determinar URL final de foto de referencia (Drive)
    let fotoRefVal = currentEquipo?.fotoRef || '';
    if (_editFotoRef === 'QUITAR') {
      fotoRefVal = '';
    } else if (_editFotoRef === 'NUEVA' && _editFotoRefFile) {
      toast('Subiendo foto de referencia a Drive...');
      try {
        await ensureToken();
        const fotoFolderId = await getSubfolder(patente, 'FotoRef');
        const ext = _editFotoRefFile.name.split('.').pop();
        const fileName = `FOTOREF_${patente}.${ext}`;
        const mimeType = _editFotoRefFile.type || 'image/jpeg';
        const b64 = await new Promise((res, rej) => {
          const rd = new FileReader();
          rd.onload = () => res(rd.result.split(',')[1]);
          rd.onerror = rej;
          rd.readAsDataURL(_editFotoRefFile);
        });
        const boundary = 'lst_boundary_' + Date.now();
        const metadata = JSON.stringify({ name: fileName, parents: [fotoFolderId] });
        const body = [
          '--' + boundary,
          'Content-Type: application/json; charset=UTF-8',
          '',
          metadata,
          '--' + boundary,
          'Content-Type: ' + mimeType,
          'Content-Transfer-Encoding: base64',
          '',
          b64,
          '--' + boundary + '--'
        ].join('\r\n');
        const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + accessToken, 'Content-Type': 'multipart/related; boundary=' + boundary },
          body,
        });
        if (!uploadRes.ok) throw new Error('Drive upload ' + uploadRes.status);
        const fileData = await uploadRes.json();
        // Hacer público para mostrar como <img>
        await fetch(`https://www.googleapis.com/drive/v3/files/${fileData.id}/permissions`, {
          method: 'POST',
          headers: { ...authHeader(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: 'reader', type: 'anyone' }),
        });
        fotoRefVal = `https://drive.google.com/thumbnail?id=${fileData.id}&sz=w800`;
        console.log('[FOTOREF] Subida OK:', fotoRefVal);
      } catch(fe) {
        console.error('[FOTOREF] Error subiendo foto:', fe);
        toast('\u26a0\ufe0f No se pudo subir la foto de referencia');
        fotoRefVal = currentEquipo?.fotoRef || '';
      }
    }

    await Promise.all([
      writeSheet(`'${CONFIG.SHEET_MAQUINARIA}'!J${row}`, [[estado]]),
      writeSheet(`'${CONFIG.SHEET_MAQUINARIA}'!K${row}`, [[ubicacion]]),
      // Columna L (horómetro actual) NO se toca aquí: solo se actualiza al registrar un evento de mantención
      writeSheet(`'${CONFIG.SHEET_MAQUINARIA}'!M${row}`, [[proxima]]),
      writeSheet(`'${CONFIG.SHEET_MAQUINARIA}'!N${row}`, [[ultima]]),
      writeSheet(`'${CONFIG.SHEET_MAQUINARIA}'!P${row}`, [[soap]]),
      writeSheet(`'${CONFIG.SHEET_MAQUINARIA}'!Q${row}`, [[permiso]]),
      writeSheet(`'${CONFIG.SHEET_MAQUINARIA}'!R${row}`, [[revision]]),
      writeSheet(`'${CONFIG.SHEET_MAQUINARIA}'!S${row}`, [[obs]]),
      writeSheet(`'${CONFIG.SHEET_MAQUINARIA}'!V${row}`, [[fotoRefVal]]),
    ]);
    console.log('[SAVE] Sheet OK');

    // 2. Subir archivos desde fileQueue (ya en memoria, no depende del DOM)
    if (fileQueue.length > 0) {
      await ensureToken();
      console.log('[SAVE] Token OK, subiendo', fileQueue.length, 'archivo(s)...');

      // Obtener carpeta [PATENTE]/Documentos/ — la crea si no existe
      let folderId = CONFIG.DRIVE_ROOT_FOLDER;
      try { folderId = await getSubfolder(patente, 'Documentos'); } catch(e) {
        console.warn('[SAVE] No se pudo obtener subcarpeta, usando raíz:', e.message);
      }
      console.log('[SAVE] folderId (Documentos):', folderId);

      for (const doc of fileQueue) {
        setBtnState(true, 'Subiendo ' + doc.prefix + '...');
        toast('Subiendo ' + doc.prefix + '...');
        console.log('[SAVE] Subiendo', doc.prefix, doc.name, doc.size, 'bytes');

        try {
          const ext      = doc.name.split('.').pop();
          const fileName = `${doc.prefix}_${patente}_${new Date().toLocaleDateString('es-CL').replace(/\//g,'-')}.${ext}`;
          const boundary = 'lst_boundary_' + Date.now();
          const metadata = JSON.stringify({ name: fileName, parents: [folderId] });
          const body = [
            '--' + boundary,
            'Content-Type: application/json; charset=UTF-8',
            '',
            metadata,
            '--' + boundary,
            'Content-Type: ' + doc.mimeType,
            'Content-Transfer-Encoding: base64',
            '',
            doc.b64,
            '--' + boundary + '--'
          ].join('\r\n');

          console.log('[SAVE] POST a Drive, body length:', body.length);
          const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST',
            headers: {
              'Authorization': 'Bearer ' + accessToken,
              'Content-Type': 'multipart/related; boundary=' + boundary,
            },
            body,
          });
          console.log('[SAVE] Drive response status:', res.status);
          if (!res.ok) {
            const errText = await res.text();
            console.error('[SAVE] Drive error:', errText);
            toast('Error ' + doc.prefix + ': ' + res.status, 'error');
          } else {
            const result = await res.json();
            console.log('[SAVE] Subida OK:', result.id, result.name);
            toast(doc.prefix + ' subido a Drive ✓');
          }
        } catch(uploadErr) {
          console.error('[SAVE] Error subiendo ' + doc.prefix + ':', uploadErr);
          toast('Error subiendo ' + doc.prefix + ': ' + uploadErr.message, 'error');
        }
      }
    }

    // 3. Cerrar y recargar
    // Usamos _origClosePanel directamente para NO disparar history.go(-1),
    // que causaría un popstate que vuelve a cerrar el panel y rompe el flujo.
    resetDocInputs();
    _editFotoRef = null;
  _editFotoRefFile = null;
    setBtnState(false, 'Guardar');
    _origClosePanel('panel-edit');
    // Limpiar el stack de paneles para que el botón Back no quede desincronizado
    const editIdx = _panelStack.lastIndexOf('panel-edit');
    if (editIdx !== -1) _panelStack.splice(editIdx, 1);
    // Esperar animación de cierre (280ms) antes de recargar y abrir ficha
    await new Promise(r => setTimeout(r, 320));
    // background=true: evita el splash y el "hideSplash()" que al terminar
    // siempre vuelve a mostrar modulos-home, lo que sacaba al usuario de la ficha.
    await loadData(true);
    if (patente) openFicha(patente);

  } catch(err) {
    console.error('[SAVE] Error general:', err);
    toast('Error al guardar: ' + err.message, 'error');
    setBtnState(false, 'Guardar');
  }
}

// ── Navegación ────────────────────────────────────────────────
function showPage(id, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + id).classList.add('active');
  btn.classList.add('active');
  const titles = { dashboard:'Inicio', equipos:'Equipos', alertas:'Alertas', eventos:'Eventos' };
  document.getElementById('page-title').textContent = titles[id] || id;
  try { localStorage.setItem('lst_page', id); } catch(e) {}
}

function goEquipos(filter) {
  const btn = document.querySelector('.nav-item:nth-child(2)');
  showPage('equipos', btn);
  currentFilter = filter;
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  const idx = { op:1, obs:2, det:3, rep:4 }[filter];
  if (idx !== undefined) document.querySelectorAll('.chip')[idx].classList.add('active');
  renderEquipos();
}

const isDesktop = () => window.innerWidth >= 900;

function openPanel(id) {
  const el = document.getElementById(id);
  // Forzar posición inicial ANTES de mostrar el elemento,
  // así el navegador siempre tiene un punto de partida para la transición
  // (sin esto, la primera vez que se abre un panel no hay animación porque
  // el elemento nunca tuvo un transform definido en un frame visible anterior).
  el.style.transform = 'translateX(100%)';
  el.classList.remove('hidden');
  // Doble rAF: el primero confirma que el elemento ya tiene display,
  // el segundo dispara la transición CSS desde 100% → 0.
  requestAnimationFrame(() => requestAnimationFrame(() => el.style.transform = 'translateX(0)'));

  // Desktop: overlay detrás del panel
  if (isDesktop() && !document.getElementById('panel-overlay')) {
    const ov = document.createElement('div');
    ov.id = 'panel-overlay';
    ov.className = 'panel-overlay';
    ov.onclick = () => {
      // cierra el panel visible más reciente
      const visible = [...document.querySelectorAll('.panel:not(.hidden)')].pop();
      if (visible) closePanel(visible.id);
    };
    document.getElementById('app').appendChild(ov);
  }
}

function closePanel(id) {
  const el = document.getElementById(id);
  el.style.transform = 'translateX(100%)';
  setTimeout(() => el.classList.add('hidden'), 280);
  if (id === 'panel-ficha') {
    try { localStorage.removeItem('lst_ficha'); } catch(e) {}
  }

  // Desktop: quitar overlay si no queda ningún panel abierto
  if (isDesktop()) {
    setTimeout(() => {
      const stillOpen = document.querySelectorAll('.panel:not(.hidden)').length;
      if (!stillOpen) {
        const ov = document.getElementById('panel-overlay');
        if (ov) ov.remove();
      }
    }, 290);
  }
}

// ── Restaurar estado anterior ─────────────────────────────────
function restoreState() {
  try {
    const page   = localStorage.getItem('lst_page')  || 'dashboard';
    const ficha  = localStorage.getItem('lst_ficha');
    const filter = localStorage.getItem('lst_filter') || 'todos';

    // Restaura pestaña activa
    const navIdx = { dashboard:0, equipos:1, alertas:2, eventos:3 };
    const idx = navIdx[page];
    if (idx !== undefined) {
      const btn = document.querySelectorAll('.nav-item')[idx];
      if (btn) showPage(page, btn);
    }

    // Restaura filtro de equipos
    currentFilter = filter;
    const chipIdx = { todos:0, op:1, obs:2, det:3, rep:4 };
    const ci = chipIdx[filter];
    if (ci !== undefined) {
      const chip = document.querySelectorAll('.chip')[ci];
      if (chip) { document.querySelectorAll('.chip').forEach(c => c.classList.remove('active')); chip.classList.add('active'); }
    }

    // Restaura ficha abierta
    if (ficha && page === 'equipos') {
      setTimeout(() => openFicha(ficha), 100);
    }
  } catch(e) {}
}

// ── Init ──────────────────────────────────────────────────────
// ── Sistema PIN ──────────────────────────────────────────────
const PIN_KEY        = 'lst_pin_ok';
const PIN_ATTEMPTS   = 'lst_pin_attempts';
const PIN_BLOCK_TIME = 'lst_pin_block';
const PINS_VALIDOS   = ['1234', '5678', '9012', '3456']; // Cambia estos PINs

let pinIngresado = '';

function initPin() {
  // PIN eliminado — el acceso se controla solo por Google OAuth + rol en hoja USUARIOS
  enterApp();
}

function mostrarPantallaPIN() {
  document.getElementById('pin-screen').classList.remove('hidden');
  pinIngresado = '';
  actualizarPuntos();
  verificarBloqueo();
}

function verificarBloqueo() {
  const blockTime = parseInt(localStorage.getItem(PIN_BLOCK_TIME) || '0');
  const ahora = Date.now();
  if (blockTime > ahora) {
    const seg = Math.ceil((blockTime - ahora) / 1000);
    document.getElementById('pin-hint').textContent = `Demasiados intentos. Espera ${seg}s`;
    document.getElementById('pin-hint').style.color = '#EF4444';
    setTimeout(verificarBloqueo, 1000);
    return false;
  }
  document.getElementById('pin-hint').textContent = 'Ingresa tu PIN';
  document.getElementById('pin-hint').style.color = '';
  return true;
}

function pinPresionar(digito) {
  if (!verificarBloqueo()) return;
  if (pinIngresado.length >= 4) return;
  pinIngresado += digito;
  actualizarPuntos();
  if (pinIngresado.length === 4) {
    setTimeout(validarPin, 150);
  }
}

function pinBorrar() {
  pinIngresado = pinIngresado.slice(0, -1);
  actualizarPuntos();
}

function actualizarPuntos() {
  const puntos = document.querySelectorAll('.pin-dot');
  puntos.forEach((dot, i) => {
    dot.classList.toggle('filled', i < pinIngresado.length);
  });
}

function validarPin() {
  if (PINS_VALIDOS.includes(pinIngresado)) {
    // PIN correcto
    localStorage.setItem(PIN_KEY, 'true');
    localStorage.removeItem(PIN_ATTEMPTS);
    localStorage.removeItem(PIN_BLOCK_TIME);
    document.getElementById('pin-screen').classList.add('hidden');
    enterApp();
  } else {
    // PIN incorrecto
    const intentos = parseInt(localStorage.getItem(PIN_ATTEMPTS) || '0') + 1;
    localStorage.setItem(PIN_ATTEMPTS, intentos.toString());
    if (intentos >= 3) {
      localStorage.setItem(PIN_BLOCK_TIME, (Date.now() + 60000).toString());
      localStorage.setItem(PIN_ATTEMPTS, '0');
    }
    document.getElementById('pin-hint').textContent = intentos >= 3 
      ? 'Bloqueado 1 minuto' 
      : `PIN incorrecto (${3 - intentos} intentos restantes)`;
    document.getElementById('pin-hint').style.color = '#EF4444';
    // Vibrar si disponible
    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
    pinIngresado = '';
    actualizarPuntos();
    setTimeout(verificarBloqueo, 1500);
  }
}

function enterApp() {
  // Sin conexión al entrar → ir directo a modo offline con lo último guardado,
  // sin intentar login/token (fallaría igual y solo demora la espera).
  if (!navigator.onLine) {
    iniciarModoOffline();
    return;
  }

  initOAuth();

  // Estado base en el historial → el botón Back no saldrá de la app
  history.replaceState({ lst: 'base' }, '');

  // Restaurar rol guardado
  try {
    const savedRole  = localStorage.getItem(ROLE_KEY);
    const savedEmail = localStorage.getItem(EMAIL_KEY);
    if (savedRole) {
      userRole  = savedRole;
      userEmail = savedEmail || '';
      applyViewerMode();
    }
  } catch(e) {}

  const hadLogin   = localStorage.getItem('lst_had_login');
  const savedEmail = localStorage.getItem(EMAIL_KEY) || '';

  // ── Caso 1: token aún válido → splash normal + carga ──
  if (loadSavedToken()) {
    document.getElementById('splash').classList.remove('hidden');
    loadData();
    return;
  }

  // ── Caso 2: ya hizo login antes → ir directo a módulos, renovar en background ──
  if (hadLogin) {
    document.getElementById('splash').classList.add('hidden');
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('modulos-home').classList.remove('hidden');

    let intentosInit = 0;
    function intentarSilencioso() {
      intentosInit++;
      if (tokenClient) {
        const prevCb = tokenClient.callback;
        tokenClient.callback = (response) => {
          tokenClient.callback = prevCb;
          if (response.error) {
            if (intentosInit < 3 && response.error !== 'access_denied') {
              setTimeout(intentarSilencioso, 2000);
            } else {
              // Solo tras múltiples fallos ir al login
              document.getElementById('modulos-home').classList.add('hidden');
              document.getElementById('main').classList.add('hidden');
              document.getElementById('login-screen').classList.remove('hidden');
            }
            return;
          }
          saveToken(response.access_token, response.expires_in || 3600);
          try {
            const sr = localStorage.getItem(ROLE_KEY);
            const se = localStorage.getItem(EMAIL_KEY);
            if (sr) { userRole = sr; userEmail = se || ''; applyViewerMode(); }
          } catch(e) {}
          // Recargar datos frescos en background
          loadData();
        };
        tokenClient.requestAccessToken({ prompt: '', login_hint: savedEmail });
      } else if (intentosInit < 8) {
        setTimeout(intentarSilencioso, 500);
      } else {
        document.getElementById('modulos-home').classList.add('hidden');
        document.getElementById('main').classList.add('hidden');
        document.getElementById('login-screen').classList.remove('hidden');
      }
    }
    setTimeout(intentarSilencioso, 400);
    return;
  }

  // ── Caso 3: primera vez → mostrar login ──
  document.getElementById('splash').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
}

document.addEventListener('DOMContentLoaded', () => {
  initPin();
});

// ── Helpers para upload de documentos en formulario edición ──
// Almacén en memoria — se llena al seleccionar, se lee al guardar
const _capturedFiles = {};

function onDocFileSelected(input, labelId) {
  const label = document.getElementById(labelId);
  const file = input.files[0];
  if (file) {
    // IMPORTANTE: NO usar label.textContent (destruye el <input> hijo del label)
    // Actualizar solo el nodo de texto, manteniendo el input intacto
    const textNode = Array.from(label.childNodes).find(n => n.nodeType === Node.TEXT_NODE);
    if (textNode) {
      textNode.textContent = '\u2705 ' + file.name + ' ';
    } else {
      label.insertBefore(document.createTextNode('\u2705 ' + file.name + ' '), label.firstChild);
    }
    label.classList.add('selected');
    // Leer a base64 AHORA, antes de cualquier await o navegación
    const prefix = { 'soap-file':'SOAP', 'permiso-file':'PERMISO', 'revision-file':'REVISION' }[input.id];
    const reader = new FileReader();
    reader.onload = () => {
      _capturedFiles[prefix] = {
        b64:      reader.result.split(',')[1],
        name:     file.name,
        size:     file.size,
        mimeType: file.type || 'application/octet-stream',
        prefix,
      };
      console.log('[CAPTURE] Guardado en memoria:', prefix, file.name, file.size);
    };
    reader.onerror = (e) => console.error('[CAPTURE] Error leyendo archivo:', e);
    reader.readAsDataURL(file);
  } else {
    label.classList.remove('selected');
  }
}

// Llama a esto desde saveEquipo para subir los 3 docs si tienen archivo
async function uploadDocFiles(patente) {
  const docs = [
    { inputId: 'soap-file',     prefix: 'SOAP'    },
    { inputId: 'permiso-file',  prefix: 'PERMISO' },
    { inputId: 'revision-file', prefix: 'REVISION'},
  ];

  // Verifica si hay archivos seleccionados
  const hasFiles = docs.some(d => {
    const el = document.getElementById(d.inputId);
    return el && el.files && el.files[0];
  });
  if (!hasFiles) return;

  toast('Subiendo documentos...');
  let uploaded = 0;

  for (const doc of docs) {
    const input = document.getElementById(doc.inputId);
    if (!input || !input.files || !input.files[0]) continue;
    const file = input.files[0];
    console.log('Subiendo:', doc.prefix, file.name, file.size, 'bytes');
    try {
      await ensureToken();
      console.log('Token OK, subiendo a carpeta de:', patente);
      const result = await uploadFile(file, patente, doc.prefix, 'Documentos');
      console.log('Subida exitosa:', result);
      uploaded++;
      toast(doc.prefix + ' subido ✓');
    } catch(e) {
      console.error('Error subiendo ' + doc.prefix + ':', e);
      toast('Error ' + doc.prefix + ': ' + e.message, 'error');
    }
  }
  if (uploaded > 0) toast(`${uploaded} documento(s) subido(s) a Drive ✓`);
}

// Resetea los inputs de archivo del formulario de edición
function resetDocInputs() {
  // Limpiar memoria
  Object.keys(_capturedFiles).forEach(k => delete _capturedFiles[k]);

  const ic = '<svg viewBox="0 0 24 24" fill="none" class="inline-ic"><path d="M7 11V6a4 4 0 0 1 8 0v9a3 3 0 1 1-6 0V8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const configs = [
    { labelId: 'soap-file-label',     inputId: 'soap-file',     text: ic + ' Subir archivo SOAP'         },
    { labelId: 'permiso-file-label',  inputId: 'permiso-file',  text: ic + ' Subir archivo Permiso'      },
    { labelId: 'revision-file-label', inputId: 'revision-file', text: ic + ' Subir archivo Rev. Técnica' },
  ];

  configs.forEach(function(cfg) {
    var label = document.getElementById(cfg.labelId);
    if (!label) return;

    // Reconstruir el label completo con un input nuevo limpio
    // (el input anterior puede haber sido destruido por textContent en onDocFileSelected)
    label.classList.remove('selected');
    label.innerHTML =
      cfg.text + ' ' +
      '<input type="file" id="' + cfg.inputId + '" accept="image/*,.pdf" ' +
      'onchange="onDocFileSelected(this,\'' + cfg.labelId + '\')" style="display:none">';
  });
}


// ── Test de conexión al Apps Script (diagnóstico) ────────────
async function testAppsScript() {
  toast('Probando conexión con Apps Script...');
  try {
    const res = await fetch(APPS_SCRIPT_URL, { method: 'GET' });
    const text = await res.text();
    const data = JSON.parse(text);
    if (data.status === 'ok') {
      toast('✅ Apps Script OK — conexión funciona');
    } else {
      toast('⚠️ Apps Script responde pero con estado: ' + JSON.stringify(data), 'error');
    }
  } catch(e) {
    toast('❌ No se puede conectar al Apps Script: ' + e.message, 'error');
  }
}

// ── Interceptar refresh para no perder sesión ─────────────────
// En móvil: bloquea el gesto pull-to-refresh del navegador.
// En desktop: intercepta Ctrl+R / F5 y en vez de recargar llama loadData().

// Fix scroll Android Chrome: el problema es que overscroll-behavior
// debe estar en el elemento que scrollea, no en body/html.
// Además prevenimos pull-to-refresh solo cuando el dedo va hacia abajo
// y el elemento scrolleable está al tope.
document.addEventListener('DOMContentLoaded', () => {
  // Aplicar overscroll-behavior: contain a todos los contenedores scrolleables
  // Esto evita que el scroll "se pegue" al llegar al fondo
  const style = document.createElement('style');
  style.textContent = `
    .panel-body, .pages, .panel, .ficha-body {
      overscroll-behavior: contain;
      -webkit-overflow-scrolling: touch;
    }
    body, html {
      overscroll-behavior-y: none;
    }
  `;
  document.head.appendChild(style);
});

let _touchStartY = 0;
let _touchTarget  = null;

document.addEventListener('touchstart', (e) => {
  _touchStartY = e.touches[0].clientY;
  _touchTarget  = e.target;
}, { passive: true });

document.addEventListener('touchmove', (e) => {
  // Solo bloquear pull-to-refresh, nunca bloquear scroll normal dentro de paneles
  const dy = e.touches[0].clientY - _touchStartY;

  // Si el dedo va hacia abajo (dy > 0), verificar si el elemento que scrollea
  // está en el tope — en ese caso bloquear el pull-to-refresh
  if (dy > 0) {
    // Buscar el ancestro scrolleable más cercano
    let el = _touchTarget;
    let scrollable = null;
    while (el && el !== document.body) {
      const st = window.getComputedStyle(el);
      const overflow = st.overflowY;
      if ((overflow === 'auto' || overflow === 'scroll') && el.scrollHeight > el.clientHeight) {
        scrollable = el;
        break;
      }
      el = el.parentElement;
    }
    // Solo bloquear si no hay elemento scrolleable (o está en el tope y es el window)
    if (!scrollable && window.scrollY === 0) {
      e.preventDefault();
    } else if (scrollable && scrollable.scrollTop === 0) {
      e.preventDefault();
    }
    // Si scrollable.scrollTop > 0, dejar pasar (el usuario está scrolleando hacia arriba)
  }
}, { passive: false });

// Interceptar Ctrl+R / F5 en desktop → recargar datos sin perder sesión
document.addEventListener('keydown', (e) => {
  const isRefresh = e.key === 'F5' || (e.ctrlKey && e.key === 'r') || (e.metaKey && e.key === 'r');
  if (!isRefresh) return;
  const inApp = !document.getElementById('login-screen') || document.getElementById('login-screen').classList.contains('hidden');
  if (!inApp) return;
  e.preventDefault();
  toast('Actualizando datos...');
  loadData();
});

// ── Manejo del botón Back del navegador ──────────────────────
// Cada vez que se abre un panel, empujamos un estado al historial.
// Cuando el usuario presiona Back, cerramos el panel en vez de salir.
// Un estado base ("app") queda siempre en el historial para que el primer
// Back cierre el panel activo en vez de salir de la app.

const _panelStack = [];

// Empujar estado base al arrancar para "atrapar" el primer Back
function _pushBaseState() {
  history.replaceState({ lst: 'base' }, '');
}

const _origOpenPanel = openPanel;
window.openPanel = function(id) {
  history.pushState({ panel: id }, '');
  _panelStack.push(id);
  _origOpenPanel(id);
};

const _origClosePanel = closePanel;
window.closePanel = function(id) {
  // Al cerrar el panel de edición, siempre limpiar archivos capturados y labels
  if (id === 'panel-edit') {
    resetDocInputs();
  }
  if (_panelStack.length && _panelStack[_panelStack.length - 1] === id) {
    _panelStack.pop();
    // go(-1) disparará popstate, que llama closePanel de nuevo → evitar loop
    history.go(-1);
  } else {
    _origClosePanel(id);
  }
};

window.addEventListener('popstate', (e) => {
  if (_panelStack.length > 0) {
    const id = _panelStack.pop();
    _origClosePanel(id);
    // Si ya no quedan paneles, volver a empujar el estado base
    if (_panelStack.length === 0) {
      setTimeout(() => history.pushState({ lst: 'base' }, ''), 50);
    }
  } else {
    // Sin paneles: re-empujar estado base para no salir de la app
    setTimeout(() => history.pushState({ lst: 'base' }, ''), 50);
  }
});
