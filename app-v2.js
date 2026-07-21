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
  actualizarChipUsuario();
  actualizarBannerOffline(true);
  chequearAlertaKilometraje();
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
let userRole  = null;   // 'admin' | 'mover' | 'andamios' | 'flota' | 'viewer'
let userEmail = null;

const ROLE_KEY  = 'lst_user_role';
const EMAIL_KEY = 'lst_user_email';

// ── Aviso de kilometraje/horómetro (solo admin) ─────────────────
// Nota discreta dentro del módulo Flota (dashboard móvil y vista Equipos de
// escritorio) que recuerda actualizar el kilometraje/horómetro de los
// equipos que no tienen GPS. No depende de datos por vehículo (no hay campo
// "tiene GPS" en la hoja): es simplemente un recordatorio periódico que se
// guarda por navegador. Se muestra si pasaron KM_ALERT_DIAS desde la última
// vez que el admin apretó "Hecho" (o si nunca se mostró), y desaparece al
// apretar ese botón hasta que vuelvan a pasar esos días.
const KM_ALERT_KEY  = 'lst_km_alert_last_ts';
const KM_ALERT_DIAS = 10;
const KM_ALERT_IDS  = ['km-alert-note', 'dt-km-alert-note'];

function chequearAlertaKilometraje() {
  const last = parseInt(localStorage.getItem(KM_ALERT_KEY) || '0');
  const diasPasados = (Date.now() - last) / (1000 * 60 * 60 * 24);
  const mostrar = userRole === 'admin' && (!last || diasPasados >= KM_ALERT_DIAS);
  KM_ALERT_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('hidden', !mostrar);
  });
}

function descartarAlertaKilometraje() {
  try { localStorage.setItem(KM_ALERT_KEY, Date.now().toString()); } catch(e) {}
  KM_ALERT_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  });
}

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
    let resuelto = false;

    // Watchdog: si el callback silencioso nunca se dispara (problema conocido
    // en Safari/iOS), sin esto 'isRenewing' quedaría en true para siempre y
    // esta renovación jamás se volvería a intentar — el token expira y la
    // sesión queda rota en silencio hasta que la persona recargue la página.
    const watchdog = setTimeout(() => {
      if (resuelto) return;
      resuelto = true;
      tokenClient.callback = prevCb;
      isRenewing = false;
    }, 8000);

    tokenClient.callback = (response) => {
      if (resuelto) return;
      resuelto = true;
      clearTimeout(watchdog);
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
  const esSilencioso = hadLogin && hasAllScopes;
  const opts = esSilencioso
    ? { prompt: '', login_hint: savedEmail }
    : { prompt: 'consent', include_granted_scopes: 'true' };

  if (esSilencioso) {
    // Watchdog: si el intento silencioso nunca dispara callback (problema
    // conocido en Safari/iOS), el botón quedaría pegado en "Conectando..."
    // para siempre. Si pasan 6s sin respuesta, se reintenta pidiendo consent
    // visible en vez de quedar colgado.
    let resuelto = false;
    const prevCb = tokenClient.callback;
    const watchdog = setTimeout(() => {
      if (resuelto) return;
      resuelto = true;
      tokenClient.callback = prevCb;
      document.getElementById('login-hint').textContent = 'Conectando...';
      tokenClient.requestAccessToken({ prompt: 'consent', include_granted_scopes: 'true' });
    }, 6000);
    tokenClient.callback = (response) => {
      if (resuelto) return;
      resuelto = true;
      clearTimeout(watchdog);
      tokenClient.callback = prevCb;
      if (prevCb) prevCb(response);
    };
  }

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
      let resuelto = false;

      // Watchdog: en Safari/iOS el callback silencioso puede no dispararse
      // NUNCA (ni éxito ni error) — problema conocido de Google Identity
      // Services ahí. Sin este timeout, esta Promise quedaría pendiente para
      // siempre y CUALQUIER acción de la app (guardar, cargar, mover, etc.)
      // se vería "pegada" indefinidamente en ese dispositivo.
      const watchdog = setTimeout(() => {
        if (resuelto) return;
        resuelto = true;
        tokenClient.callback = prevCallback;
        if (intentos < 2) {
          setTimeout(intentarRenovar, 1500);
        } else {
          reject(new Error('timeout_renovacion_silenciosa'));
        }
      }, 6000);

      tokenClient.callback = (response) => {
        if (resuelto) return;
        resuelto = true;
        clearTimeout(watchdog);
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
// registrar movimientos en el módulo Movimientos) · 'andamios' (solo
// lectura + puede modificar todo dentro del módulo Andamios) · 'flota'
// (solo lectura + puede modificar todo dentro del módulo Flota) ·
// cualquier otro valor o ausencia de match → 'viewer' (solo lectura).
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
    } else if (rolHoja === 'andamios') {
      userRole = 'andamios';
    } else if (rolHoja === 'flota') {
      userRole = 'flota';
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
  actualizarChipUsuario();
  console.log('[ROLE] Email:', userEmail, '→ Rol:', userRole);
}

// Aplica las clases de modo en el body según el rol:
// - admin    → sin clases (acceso total)
// - mover    → 'viewer-mode' (todo en solo lectura) + 'mover-mode' (puede usar
//              los controles del módulo Movimientos, marcados con .mov-action-btn)
// - andamios → 'viewer-mode' (todo en solo lectura) + 'andamios-mode' (puede
//              usar los controles del módulo Andamios, marcados con .and-action-btn)
// - flota    → 'viewer-mode' (todo en solo lectura) + 'flota-mode' (puede
//              modificar todo dentro del módulo Flota — ficha, editar equipo,
//              registrar eventos/mantenciones)
// - viewer   → solo 'viewer-mode' (solo lectura en toda la app)
function applyViewerMode() {
  document.body.classList.remove('viewer-mode', 'mover-mode', 'andamios-mode', 'flota-mode');
  if (userRole === 'viewer') {
    document.body.classList.add('viewer-mode');
  } else if (userRole === 'mover') {
    document.body.classList.add('viewer-mode', 'mover-mode');
  } else if (userRole === 'andamios') {
    document.body.classList.add('viewer-mode', 'andamios-mode');
  } else if (userRole === 'flota') {
    document.body.classList.add('viewer-mode', 'flota-mode');
  }
  // Controles reservados para admin (ej: herramientas de reparación de datos)
  // — ocultos por defecto en el HTML, se muestran solo si el rol es admin.
  document.querySelectorAll('.admin-only-btn').forEach(el => {
    el.style.display = (userRole === 'admin') ? '' : 'none';
  });
}

function authHeader() {
  return { 'Authorization': 'Bearer ' + accessToken };
}

// ── Chip de usuario (email + cerrar sesión) ─────────────────────
// Se muestra en la pantalla de inicio (modulos-home), que es la única
// pantalla común a mobile y desktop.
function actualizarChipUsuario() {
  const el = document.getElementById('user-chip-email');
  if (!el) return;
  const email = userEmail || localStorage.getItem(EMAIL_KEY) || '';
  if (!email) { el.innerHTML = ''; return; }
  const inicial = email.charAt(0).toUpperCase();
  el.innerHTML = `<span class="mfu-avatar">${inicial}</span><span class="mfu-email">${email}</span>`;
}

function cerrarSesion() {
  if (!confirm('¿Cerrar sesión? Vas a tener que iniciar sesión con Google de nuevo para volver a usar la app.')) return;

  try {
    if (accessToken && typeof google !== 'undefined' && google.accounts && google.accounts.oauth2) {
      google.accounts.oauth2.revoke(accessToken, () => {});
    }
  } catch(e) {}

  clearToken();
  try {
    localStorage.removeItem('lst_had_login');
    localStorage.removeItem('lst_has_drive_scope');
    localStorage.removeItem(EMAIL_KEY);
    localStorage.removeItem(ROLE_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(EXPIRY_KEY);
  } catch(e) {}

  userEmail = null;
  userRole  = null;
  tokenClient = null; // fuerza a initOAuth() a crear un tokenClient nuevo en el próximo login

  const modulosHome = document.getElementById('modulos-home');
  const mainEl      = document.getElementById('main');
  if (modulosHome) modulosHome.classList.add('hidden');
  if (mainEl)      mainEl.classList.add('hidden');

  mostrarLogin('Inicia sesión para acceder a los datos', false);
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
  if (type === 'loading') {
    t.innerHTML = `<span class="toast-spinner"></span>${msg}`;
  } else {
    t.textContent = msg;
  }
  t.className = `toast ${type}`;
  t.classList.remove('hidden');
  clearTimeout(t._timer);
  // Los toasts de "en progreso" no se auto-ocultan a los 6s — quedan hasta
  // que el propio código llame a toast() de nuevo (éxito o error), porque
  // algunas acciones (migrar fichas, generar documentos) tardan más que eso.
  if (type !== 'loading') {
    t._timer = setTimeout(() => t.classList.add('hidden'), 6000);
  }
}

function splash(pct, hint) {
  const fill = document.getElementById('splash-progress');
  // Al primer progreso real (>0%), apagar el pulso de espera
  if (pct > 0) fill.classList.remove('splash-waiting');
  fill.style.width = pct + '%';
  if (hint) document.getElementById('splash-hint').textContent = hint;
}

function hideSplash() {
  const el = document.getElementById('splash');
  el.style.opacity = '0';
  el.style.transition = 'opacity 0.4s';
  setTimeout(() => {
    el.classList.add('hidden');
    el.style.opacity = '';
    // Mostrar pantalla de módulos en vez de ir directo al main, con una
    // pequeña animación de aparición en vez de saltar de golpe
    const home = document.getElementById('modulos-home');
    home.classList.remove('hidden');
    home.classList.add('app-enter');
    setTimeout(() => home.classList.remove('app-enter'), 500);
    chequearAlertaKilometraje();
  }, 400);
}

// ── Debounce genérico para buscadores ──────────────────────────
// Evita que cada buscador re-dibuje toda la lista en CADA tecla; espera un
// pequeño instante de pausa antes de ejecutar. 'key' identifica cada buscador
// para que no se pisen los timers entre módulos distintos.
const _debTimers = {};
function _deb(key, fn, wait = 180) {
  clearTimeout(_debTimers[key]);
  _debTimers[key] = setTimeout(fn, wait);
}

// ── Google Sheets API ─────────────────────────────────────────
// Traduce errores crudos de la API de Google Sheets/Drive (JSON feo, en inglés)
// a un mensaje claro y accionable en español. Se usa en fetchSheet/writeSheet/
// appendSheet para que cualquier error de permisos, cuota, etc. se vea legible
// en los toasts en vez de un bloque de JSON en rojo.
function _friendlyGoogleApiError(status, rawBody) {
  let googleMsg = '';
  try { googleMsg = ((JSON.parse(rawBody) || {}).error || {}).message || ''; } catch (e) {}
  if (status === 403) {
    return 'Sin permiso para editar la planilla. Pide que te compartan el Google Sheet como "Editor" (el rol dentro de la app no basta, Google también tiene que darte acceso).';
  }
  if (status === 401) {
    return 'Tu sesión de Google expiró. Cierra y vuelve a abrir la app para iniciar sesión de nuevo.';
  }
  if (status === 404) {
    return 'No se encontró la hoja o el archivo en Google (¿se movió, se renombró o se borró?).';
  }
  if (status === 429) {
    return 'Demasiadas solicitudes a la vez a Google Sheets. Espera un momento y vuelve a intentar.';
  }
  return `Error ${status} de Google${googleMsg ? ': ' + googleMsg : ''}`;
}

// ── Indicador de carga global ─────────────────────────────────
// Se prende solo cada vez que hay una petición en curso a Sheets, Drive o
// Docs (sin importar qué función la dispare) y se apaga cuando ya no queda
// ninguna pendiente — así cualquier acción que tarde un poco muestra que la
// app sigue trabajando, sin tener que agregar esto a mano en cada función.
let _busyCount = 0;
function _busyShow() {
  _busyCount++;
  const bar = document.getElementById('global-loading-bar');
  if (bar) bar.classList.add('active');
}
function _busyHide() {
  _busyCount = Math.max(0, _busyCount - 1);
  if (_busyCount === 0) {
    const bar = document.getElementById('global-loading-bar');
    if (bar) bar.classList.remove('active');
  }
}
// Envuelve cualquier promesa: prende el indicador mientras esté pendiente,
// lo apaga al terminar (haya salido bien o mal).
async function _conIndicadorCarga(promesa) {
  _busyShow();
  try {
    return await promesa;
  } finally {
    _busyHide();
  }
}

async function fetchSheet(range) {
  await ensureToken();
  const url = `${SHEETS_BASE}/${CONFIG.SHEET_ID}/values/${encodeURIComponent(range)}`;
  return _conIndicadorCarga((async () => {
    const res = await fetch(url, { headers: authHeader() });
    if (!res.ok) throw new Error(_friendlyGoogleApiError(res.status, await res.text()));
    return (await res.json()).values || [];
  })());
}

async function writeSheet(range, values) {
  await ensureToken();
  const url = `${SHEETS_BASE}/${CONFIG.SHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
  return _conIndicadorCarga((async () => {
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ range, majorDimension: 'ROWS', values }),
    });
    if (!res.ok) throw new Error(_friendlyGoogleApiError(res.status, await res.text()));
    return res.json();
  })());
}

async function appendSheet(range, values) {
  await ensureToken();
  const url = `${SHEETS_BASE}/${CONFIG.SHEET_ID}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;
  return _conIndicadorCarga((async () => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader() },
      body: JSON.stringify({ range, majorDimension: 'ROWS', values }),
    });
    if (!res.ok) throw new Error(_friendlyGoogleApiError(res.status, await res.text()));
    return res.json();
  })());
}

// ── Google Drive API ──────────────────────────────────────────

// Busca o crea una carpeta. Usa uploadType=multipart porque es el único
// endpoint que acepta CORS desde GitHub Pages.
async function findOrCreateFolder(name, parentId) {
  await ensureToken();
  return _conIndicadorCarga((async () => {

  // 1. Buscar si ya existe
  const q = encodeURIComponent(`'${parentId}' in parents and name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const searchRes = await fetch(`${DRIVE_API}/files?q=${q}&fields=files(id,name)`, { headers: authHeader() });
  if (!searchRes.ok) throw new Error(_friendlyGoogleApiError(searchRes.status, await searchRes.text()));
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
    throw new Error(_friendlyGoogleApiError(createRes.status, err));
  }
  const folder = await createRes.json();
  console.log('[FOLDER] Creada OK:', name, folder.id);
  return folder.id;

  })());
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
  toast('Enviando a Drive...', 'loading');

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
    throw new Error(_friendlyGoogleApiError(res.status, err));
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

// ══ Ficha Técnica (Google Docs) — actualización automática ═══════════════
// Actualiza el Doc de "Ficha Técnica" de un vehículo con 3 cosas, y SOLO
// esas 3 (decisión explícita, no tocar lo demás del Doc):
//   1) Vigencia de SOAP / Permiso de circulación / Revisión técnica
//   2) La foto de referencia (la misma que se ve en la app)
//   3) Mantenciones nuevas en "Historial de eventos mayores"
// Requiere el scope de Docs API (agregado en config.js) — si un usuario ya
// había iniciado sesión antes de agregar ese scope, hay que pedirle que
// cierre sesión y vuelva a entrar para que Google le pida el permiso nuevo.
// ⚠️ No probado contra la API real (no hay forma de probarlo fuera de la
// app) — probar primero con UN vehículo antes de confiar en esto para todos.

async function docsApiFetch(method, path, body) {
  return _conIndicadorCarga((async () => {
    const res = await fetch(`https://docs.googleapis.com/v1/documents/${path}`, {
      method,
      headers: {
        'Authorization': 'Bearer ' + accessToken,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Docs API ${res.status}: ${errText.slice(0, 300)}`);
    }
    return res.json();
  })());
}

function _extraerDocId(url) {
  const m = (url || '').match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

// Recorre el documento entero (incluyendo el interior de las tablas) y arma
// una lista plana de fragmentos de texto con su rango [start,end) real —
// evita tener que caminar el árbol del documento de nuevo cada vez que hay
// que ubicar una etiqueta o un valor.
function _docFlatten(doc) {
  const frags = [];
  function walkContent(content) {
    (content || []).forEach(item => {
      if (item.paragraph) {
        (item.paragraph.elements || []).forEach(el => {
          if (el.textRun) frags.push({ start: el.startIndex, end: el.endIndex, text: el.textRun.content });
        });
      }
      if (item.table) {
        item.table.tableRows.forEach(row => row.tableCells.forEach(cell => walkContent(cell.content)));
      }
    });
  }
  walkContent(doc.body.content);
  return frags;
}

function _docCeldaTexto(cell) {
  // Cada párrafo de la celda se separa con un salto de línea explícito —
  // si no, dos párrafos distintos (ej. "ACEITE: X" y "COMBUSTIBLE: Y") se
  // pegaban sin ningún espacio entre medio.
  return (cell.content || [])
    .map(p => {
      const t = (p.paragraph?.elements || []).map(el => el.textRun?.content || '').join('');
      return t.endsWith('\n') ? t : t + '\n';
    })
    .join('');
}

// Ubica la primera tabla cuya fila de encabezado contiene `textoEncabezado`
function _docBuscarTabla(doc, textoEncabezado) {
  let found = null;
  function walk(content) {
    (content || []).forEach(item => {
      if (item.table && !found) {
        const textoPrimeraFila = (item.table.tableRows[0]?.tableCells || [])
          .map(_docCeldaTexto).join('');
        if (textoPrimeraFila.toUpperCase().includes(textoEncabezado)) found = item;
      }
      if (item.table) {
        item.table.tableRows.forEach(row => row.tableCells.forEach(cell => walk(cell.content)));
      }
    });
  }
  walk(doc.body.content);
  return found;
}

// Ubica la celda de tabla que ya tiene más fotos insertadas (la casilla de
// fotos junto al encabezado) — mucho más confiable que buscar por texto de
// patente, porque la patente también aparece en la fila "PATENTE" de la
// tabla de datos y esa se encontraba primero por error.
// Devuelve el rango [start,end) del texto visible dentro de una celda de
// tabla, sin incluir el salto de línea final obligatorio del último
// párrafo (Docs API no deja borrar ese carácter).
function _docCellRangoTexto(cell) {
  const frags = [];
  (cell.content || []).forEach(p => {
    (p.paragraph?.elements || []).forEach(el => {
      if (el.textRun) frags.push({ start: el.startIndex, end: el.endIndex, text: el.textRun.content });
    });
  });
  if (!frags.length) return null;
  const first = frags[0];
  const last = frags[frags.length - 1];
  const finAjustado = last.text.endsWith('\n') ? last.end - 1 : last.end;
  if (finAjustado <= first.start) return null; // celda ya vacía, nada que borrar
  return { startIndex: first.start, endIndex: finAjustado };
}

// Busca, dentro de una celda, el ÚLTIMO fragmento de texto no vacío (se usa
// para las cajas de "Fallas detectadas", donde la etiqueta y el valor
// comparten la misma celda — la etiqueta es el primer fragmento, el valor
// el último).
function _docUltimoFragmentoCelda(cell) {
  const frags = [];
  (cell.content || []).forEach(p => {
    (p.paragraph?.elements || []).forEach(el => {
      if (el.textRun && el.textRun.content.replace(/[\n\t]/g, '').trim()) {
        frags.push({ start: el.startIndex, end: el.endIndex, text: el.textRun.content });
      }
    });
  });
  if (!frags.length) return null;
  const last = frags[frags.length - 1];
  const finAjustado = last.text.endsWith('\n') ? last.end - 1 : last.end;
  if (finAjustado <= last.start) return null;
  return { startIndex: last.start, endIndex: finAjustado };
}

// Reemplaza el contenido de una celda (rango completo) por un texto nuevo.
// Devuelve los 2 requests (borrar + insertar) listos para meter en un
// batchUpdate — el llamador decide el orden si hay varios en el mismo lote.
function _reqReemplazarRango(rango, textoNuevo) {
  if (!rango) return [];
  return [
    { deleteContentRange: { range: rango } },
    { insertText: { location: { index: rango.startIndex }, text: textoNuevo } },
  ];
}

async function actualizarFichaTecnica(patente) {
  const e = allEquipos.find(x => x.patente === patente);
  if (!e || !e.linkFicha) { toast('Este vehículo no tiene ficha técnica vinculada', 'error'); return; }
  const docId = _extraerDocId(e.linkFicha);
  if (!docId) { toast('No se pudo leer el link de la ficha técnica', 'error'); return; }

  toast('Actualizando ficha técnica...', 'loading');
  try {
    if (!allEventos.length) await loadEventos(); // por si no se visitó Mantenciones en esta sesión
    await _actualizarDocumentacionFicha(docId, e);
    await _actualizarUbicacionFicha(docId, e);
    await _actualizarFallasFicha(docId, e);
    if (e.fotoRef) await _actualizarFotoFicha(docId, e);
    await _actualizarLinkCarpetaFicha(docId, e);
    await _actualizarHistorialFicha(docId, e);
    toast('✓ Ficha técnica actualizada');
  } catch (err) {
    console.error('[FICHA TECNICA]', err);
    if (err.message.includes('403')) {
      toast('Sin permiso para editar Docs — cierra sesión y vuelve a entrar para autorizarlo', 'error');
    } else {
      toast('No se pudo actualizar la ficha técnica: ' + err.message, 'error');
    }
  }
}

// 1) Documentación: SOAP / Permiso / Revisión técnica — fecha + estado.
// Ubica la tabla de Documentación y reemplaza cada celda (col 2 = fecha,
// col 3 = estado) por posición dentro de la fila, buscando la fila por el
// texto de la etiqueta (col 1) — funciona tanto la primera vez (celda con
// el marcador {{FECHA_...}}) como en corridas siguientes (celda con la
// fecha real de la vez anterior), porque no depende de qué texto haya ahí.
async function _actualizarDocumentacionFicha(docId, e) {
  const doc = await docsApiFetch('GET', docId);
  const tabla = _docBuscarTabla(doc, 'FECHA DE VENCIMIENTO') || _docBuscarTabla(doc, 'DOCUMENTACIÓN');
  if (!tabla) return; // no se encontró la tabla, no se toca nada

  const campos = [
    { label: 'SEGURO OBLIGATORIO', fecha: e.soap },
    { label: 'PERMISO DE CIRCULACIÓN', fecha: e.permiso },
    { label: 'REVISIÓN TÉCNICA', fecha: e.revision },
  ];

  const requests = [];
  tabla.table.tableRows.forEach(row => {
    const celdas = row.tableCells;
    if (celdas.length < 3) return;
    const textoLabel = _docCeldaTexto(celdas[0]).toUpperCase();
    const campo = campos.find(c => textoLabel.includes(c.label));
    if (!campo) return;
    const dias = campo.fecha ? diasRestantes(campo.fecha) : null;
    const textoFecha  = campo.fecha ? parsearFecha(campo.fecha) : 'Sin dato';
    const textoEstado = dias === null ? 'Sin dato' : (dias < 0 ? 'VENCIDO' : 'VIGENTE');

    requests.push(..._reqReemplazarRango(_docCellRangoTexto(celdas[1]), textoFecha));
    requests.push(..._reqReemplazarRango(_docCellRangoTexto(celdas[2]), textoEstado));
  });

  if (!requests.length) return;
  // De mayor índice a menor: así cada delete/insert no corre el índice de
  // los requests que todavía faltan aplicar dentro del mismo batchUpdate.
  requests.sort((a, b) => {
    const ia = a.deleteContentRange ? a.deleteContentRange.range.startIndex : a.insertText.location.index;
    const ib = b.deleteContentRange ? b.deleteContentRange.range.startIndex : b.insertText.location.index;
    return ib - ia;
  });

  await docsApiFetch('POST', `${docId}:batchUpdate`, { requests });
}

// 2) Ubicación: fila "UBICACIÓN" de la tabla de Datos Generales.
async function _actualizarUbicacionFicha(docId, e) {
  const doc = await docsApiFetch('GET', docId);
  const tabla = _docBuscarTabla(doc, 'PATENTE') || _docBuscarTabla(doc, 'EQUIPO');
  if (!tabla) return;

  const fila = tabla.table.tableRows.find(row =>
    row.tableCells[0] && _docCeldaTexto(row.tableCells[0]).toUpperCase().includes('UBICACIÓN')
  );
  if (!fila || fila.tableCells.length < 2) return;

  const requests = _reqReemplazarRango(_docCellRangoTexto(fila.tableCells[1]), e.ubicacion || 'Sin dato');
  if (!requests.length) return;
  await docsApiFetch('POST', `${docId}:batchUpdate`, { requests });
}

// 3) Fallas detectadas: la etiqueta ("⚙ OPERATIVA" / "✎ ESTÉTICA") y el
// valor están en la MISMA celda (para que se vea como una sola cajita) —
// se reemplaza solo el último fragmento de texto de cada celda, que es el
// valor (el rótulo, al ser el primer fragmento, nunca se toca).
async function _actualizarFallasFicha(docId, e) {
  const doc = await docsApiFetch('GET', docId);
  const tabla = _docBuscarTabla(doc, 'OPERATIVA') || _docBuscarTabla(doc, 'ESTÉTICA');
  if (!tabla) return;

  const requests = [];
  tabla.table.tableRows.forEach(row => {
    row.tableCells.forEach(cell => {
      const texto = _docCeldaTexto(cell).toUpperCase();
      let valorNuevo = null;
      if (texto.includes('OPERATIVA')) valorNuevo = e.fallaOperativa || 'Sin fallas registradas';
      else if (texto.includes('ESTÉTICA') || texto.includes('ESTETICA')) valorNuevo = e.fallaEstetica || 'Sin fallas registradas';
      if (valorNuevo === null) return;
      requests.push(..._reqReemplazarRango(_docUltimoFragmentoCelda(cell), valorNuevo));
    });
  });

  if (!requests.length) return;
  requests.sort((a, b) => {
    const ia = a.deleteContentRange ? a.deleteContentRange.range.startIndex : a.insertText.location.index;
    const ib = b.deleteContentRange ? b.deleteContentRange.range.startIndex : b.insertText.location.index;
    return ib - ia;
  });
  await docsApiFetch('POST', `${docId}:batchUpdate`, { requests });
}

// 4) Foto de referencia: usa el propio título "FOTO DE REFERENCIA" como
// referencia (existe en la plantilla nueva y se crea sola la primera vez
// en los docs viejos) — no necesita ningún marcador de texto visible
// aparte. Busca si ya hay una imagen o el marcador {{FOTO_REFERENCIA}}
// justo después del título para reemplazarla; si no hay nada, inserta la
// foto ahí directamente.
async function _actualizarFotoFicha(docId, e) {
  let doc = await docsApiFetch('GET', docId);
  let frags = _docFlatten(doc);
  let idxTitulo = frags.findIndex(f => f.text.toUpperCase().includes('FOTO DE REFERENCIA'));

  if (idxTitulo === -1) {
    // Doc "viejo": la sección todavía no existe — se crea después de la
    // tabla de datos generales. Se resetea el formato del texto nuevo
    // (negrita/color de fondo) para que no herede el estilo de la celda
    // de la tabla justo antes, que se veía mal.
    const tablaDatos = _docBuscarTabla(doc, 'PATENTE') || _docBuscarTabla(doc, 'EQUIPO');
    if (!tablaDatos) return; // no se pudo ubicar dónde insertarla — se deja para revisar a mano
    const punto = tablaDatos.endIndex;
    const texto = '\nFOTO DE REFERENCIA\n';
    await docsApiFetch('POST', `${docId}:batchUpdate`, {
      requests: [
        { insertText: { location: { index: punto }, text: texto } },
        {
          updateTextStyle: {
            range: { startIndex: punto, endIndex: punto + texto.length },
            textStyle: { bold: true, backgroundColor: {}, foregroundColor: {} },
            fields: 'bold,backgroundColor,foregroundColor',
          },
        },
      ],
    });
    doc = await docsApiFetch('GET', docId);
    frags = _docFlatten(doc);
    idxTitulo = frags.findIndex(f => f.text.toUpperCase().includes('FOTO DE REFERENCIA'));
    if (idxTitulo === -1) return;
  }

  const finTitulo = frags[idxTitulo].end;

  // A partir de ahí: ¿ya hay una imagen puesta en una corrida anterior?
  // ¿o el marcador {{FOTO_REFERENCIA}} de la plantilla nueva sin usar?
  let imagenExistente = null;
  let placeholderExistente = null;
  (function buscar(content) {
    (content || []).forEach(item => {
      if (item.paragraph) {
        (item.paragraph.elements || []).forEach(el => {
          if (el.startIndex < finTitulo) return;
          if (el.inlineObjectElement && !imagenExistente) imagenExistente = el;
          if (el.textRun && el.textRun.content.includes('{{FOTO_REFERENCIA}}') && !placeholderExistente) {
            placeholderExistente = { startIndex: el.startIndex, endIndex: el.endIndex };
          }
        });
      }
      if (item.table) item.table.tableRows.forEach(row => row.tableCells.forEach(cell => buscar(cell.content)));
    });
  })(doc.body.content);

  const tamano = { height: { magnitude: 150, unit: 'PT' }, width: { magnitude: 195, unit: 'PT' } };
  const requests = [];
  if (imagenExistente) {
    requests.push({ deleteContentRange: { range: { startIndex: imagenExistente.startIndex, endIndex: imagenExistente.endIndex } } });
    requests.push({ insertInlineImage: { location: { index: imagenExistente.startIndex }, uri: e.fotoRef, objectSize: tamano } });
  } else if (placeholderExistente) {
    requests.push({ deleteContentRange: { range: placeholderExistente } });
    requests.push({ insertInlineImage: { location: { index: placeholderExistente.startIndex }, uri: e.fotoRef, objectSize: tamano } });
  } else {
    requests.push({ insertText: { location: { index: finTitulo }, text: '\n' } });
    requests.push({ insertInlineImage: { location: { index: finTitulo + 1 }, uri: e.fotoRef, objectSize: tamano } });
  }

  await docsApiFetch('POST', `${docId}:batchUpdate`, { requests });
}

// 5) Link a la carpeta completa de fotos: reemplaza el texto del marcador
// {{LINK_CARPETA_FOTOS}} por una etiqueta fija ("Abrir carpeta de fotos")
// la primera vez, y SIEMPRE reaplica el link real (por si la carpeta
// cambiara) sobre ese texto — reutiliza la misma búsqueda que ya usa el
// botón "Abrir carpeta en Drive" que existe en la app.
async function _actualizarLinkCarpetaFicha(docId, e) {
  const ETIQUETA = 'Abrir carpeta de fotos';
  let folderUrl = null;
  try {
    await ensureToken();
    const q = `mimeType='application/vnd.google-apps.folder' and name='${e.patente}' and '${CONFIG.DRIVE_ROOT_FOLDER}' in parents and trashed=false`;
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name)&pageSize=1`,
      { headers: { Authorization: 'Bearer ' + accessToken } }
    );
    const data = await res.json();
    if (data.files && data.files.length > 0) {
      folderUrl = `https://drive.google.com/drive/folders/${data.files[0].id}`;
    }
  } catch (err) {
    console.warn('[FICHA TECNICA] No se pudo resolver la carpeta de fotos:', err);
  }
  if (!folderUrl) return; // el vehículo todavía no tiene carpeta de fotos — no se toca nada

  let doc = await docsApiFetch('GET', docId);
  const tieneMarcador = _docFlatten(doc).some(f => f.text.includes('{{LINK_CARPETA_FOTOS}}'));
  if (tieneMarcador) {
    await docsApiFetch('POST', `${docId}:batchUpdate`, {
      requests: [{
        replaceAllText: {
          containsText: { text: '{{LINK_CARPETA_FOTOS}}', matchCase: true },
          replaceText: ETIQUETA,
        },
      }],
    });
    doc = await docsApiFetch('GET', docId);
  }

  const frag = _docFlatten(doc).find(f => f.text.includes(ETIQUETA));
  if (!frag) {
    // Doc "viejo": no tiene el marcador nuevo. Se agrega el link recién
    // ahora, justo después del encabezado "REGISTRO FOTOGRÁFICO" que ya
    // existe en los docs viejos — si tampoco existe esa sección, se deja
    // sin tocar (no se sabe dónde ponerlo).
    const encabezado = _docFlatten(doc).find(f => f.text.toUpperCase().includes('REGISTRO FOTOGRÁFICO'));
    if (!encabezado) return;
    const textoNuevo = `\n📁 ${ETIQUETA}`;
    await docsApiFetch('POST', `${docId}:batchUpdate`, {
      requests: [
        { insertText: { location: { index: encabezado.end }, text: textoNuevo } },
        {
          updateTextStyle: {
            range: { startIndex: encabezado.end, endIndex: encabezado.end + textoNuevo.length },
            textStyle: { bold: false, backgroundColor: {}, foregroundColor: {} },
            fields: 'bold,backgroundColor,foregroundColor',
          },
        },
      ],
    });
    doc = await docsApiFetch('GET', docId);
  }

  const fragFinal = _docFlatten(doc).find(f => f.text.includes(ETIQUETA));
  if (!fragFinal) return;

  await docsApiFetch('POST', `${docId}:batchUpdate`, {
    requests: [{
      updateTextStyle: {
        range: { startIndex: fragFinal.start, endIndex: fragFinal.start + ETIQUETA.length },
        textStyle: { link: { url: folderUrl } },
        fields: 'link',
      },
    }],
  });
}


// 6) Historial de eventos mayores: agrega solo las mantenciones que todavía
// no aparecen en el Doc (se identifican por fecha — si esa fecha ya
// aparece en algún lado del documento, se asume que esa fila ya existe).
// Cada fila nueva se inserta con su propio ida y vuelta a la API para no
// tener que calcular a mano cómo se corren los índices de TODO el
// documento con cada fila — más lento, pero mucho más seguro.
async function _actualizarHistorialFicha(docId, e) {
  const eventos = allEventos.filter(ev => ev.patente === e.patente);
  console.log(`[HISTORIAL] ${e.patente}: ${eventos.length} evento(s) en la app.`);
  if (!eventos.length) return;

  const doc = await docsApiFetch('GET', docId);
  const textoDoc = _docFlatten(doc).map(f => f.text).join('');
  const nuevos = eventos.filter(ev => ev.fechaEvento && !textoDoc.includes(ev.fechaEvento));
  console.log(`[HISTORIAL] ${nuevos.length} evento(s) todavía no están en el Doc.`);
  if (!nuevos.length) return;

  const tabla = _docTablaEntre(doc, 'HISTORIAL DE EVENTOS');
  if (!tabla) { console.warn('[HISTORIAL] No se encontró la tabla en el Doc.'); return; }
  console.log(`[HISTORIAL] Tabla encontrada con ${tabla.table.tableRows.length} fila(s).`);

  // Busca la fila placeholder "Sin eventos registrados todavía" en
  // CUALQUIER posición de la tabla (no solo justo debajo del encabezado —
  // de intentos anteriores pudo haber quedado más abajo) y la borra.
  const idxPlaceholder = tabla.table.tableRows.findIndex((row, i) =>
    i > 0 && row.tableCells.length < 5 && _docCeldaTexto(row.tableCells[0]).toUpperCase().includes('SIN EVENTOS')
  );
  if (idxPlaceholder !== -1) {
    console.log('[HISTORIAL] Borrando la fila "Sin eventos registrados todavía"...');
    await docsApiFetch('POST', `${docId}:batchUpdate`, {
      requests: [{
        deleteTableRow: {
          tableCellLocation: { tableStartLocation: { index: tabla.startIndex }, rowIndex: idxPlaceholder, columnIndex: 0 },
        },
      }],
    });
  }

  for (const ev of nuevos.slice(0, 10)) { // tope por corrida, por las dudas
    console.log(`[HISTORIAL] Insertando evento del ${ev.fechaEvento}...`);

    const docActual = await docsApiFetch('GET', docId);
    const tablaActual = _docTablaEntre(docActual, 'HISTORIAL DE EVENTOS');
    if (!tablaActual) { console.warn('[HISTORIAL] La tabla ya no está — se corta acá.'); break; }

    // SIEMPRE se inserta pegado al encabezado (fila 0), nunca a la última
    // fila — el encabezado tiene garantizado 5 columnas separadas bien
    // formadas; una fila de datos más abajo podría estar rota (fusionada)
    // por un intento anterior fallido, y clonar eso arrastraba el problema
    // a cada fila nueva. Como efecto secundario, los eventos quedan
    // ordenados del más nuevo al más viejo (el más reciente arriba).
    await docsApiFetch('POST', `${docId}:batchUpdate`, {
      requests: [{
        insertTableRow: {
          tableCellLocation: { tableStartLocation: { index: tablaActual.startIndex }, rowIndex: 0, columnIndex: 0 },
          insertBelow: true,
        },
      }],
    });

    const docConFila = await docsApiFetch('GET', docId);
    const tablaConFila = _docTablaEntre(docConFila, 'HISTORIAL DE EVENTOS');
    const filaNueva = tablaConFila?.table.tableRows[1]; // justo debajo del encabezado
    if (!filaNueva) { console.warn(`[HISTORIAL] No se encontró la fila recién creada para el evento del ${ev.fechaEvento} — se saltea.`); continue; }
    if (filaNueva.tableCells.length < 5) {
      console.warn(`[HISTORIAL] La fila nueva tiene ${filaNueva.tableCells.length} celda(s) en vez de 5 — se saltea el evento del ${ev.fechaEvento} para no romper el Doc.`);
      continue;
    }

    // La fila nueva hereda el fondo azul y letra blanca del encabezado (por
    // haberse insertado pegada a él) — se resetea a fondo blanco acá.
    try {
      await docsApiFetch('POST', `${docId}:batchUpdate`, {
        requests: [{
          updateTableCellStyle: {
            tableRange: {
              tableCellLocation: { tableStartLocation: { index: tablaConFila.startIndex }, rowIndex: 1, columnIndex: 0 },
              rowSpan: 1,
              columnSpan: 5,
            },
            tableCellStyle: { backgroundColor: { color: { rgbColor: { red: 1, green: 1, blue: 1 } } } },
            fields: 'backgroundColor',
          },
        }],
      });
    } catch (errFormato) {
      console.warn('[HISTORIAL] No se pudo resetear el color de fondo de la fila nueva:', errFormato.message);
    }

    const valores = [
      ev.fechaEvento || '-',
      ev.horometro ? formatNum(ev.horometro) : '-',
      ev.tipo || '-',
      ev.descripcion || '-',
      '-', // costo: no existe en la app hoy, queda para completar a mano
    ];

    // Una celda a la vez, con su propia lectura fresca del Doc justo antes
    // de escribir — más lento, pero elimina cualquier duda sobre si el
    // índice calculado sigue siendo válido después de la escritura anterior.
    let huboError = false;
    for (let i = 0; i < valores.length; i++) {
      const docCelda = await docsApiFetch('GET', docId);
      const tablaCelda = _docTablaEntre(docCelda, 'HISTORIAL DE EVENTOS');
      const filaCelda = tablaCelda?.table.tableRows[1];
      const celda = filaCelda?.tableCells[i];
      if (!celda) { console.warn(`[HISTORIAL] No se encontró la celda ${i} de la fila nueva — se saltea.`); continue; }
      const parrafo = celda.content && celda.content[0];
      const idx = parrafo ? parrafo.startIndex : celda.startIndex;
      try {
        await docsApiFetch('POST', `${docId}:batchUpdate`, {
          requests: [
            { insertText: { location: { index: idx }, text: valores[i] } },
            {
              updateTextStyle: {
                range: { startIndex: idx, endIndex: idx + valores[i].length },
                textStyle: { bold: false, foregroundColor: { color: { rgbColor: { red: 0.15, green: 0.19, blue: 0.26 } } } },
                fields: 'bold,foregroundColor',
              },
            },
          ],
        });
      } catch (errCelda) {
        console.warn(`[HISTORIAL] No se pudo escribir la celda ${i} del evento del ${ev.fechaEvento}:`, errCelda.message);
        huboError = true;
      }
    }

    console.log(huboError
      ? `[HISTORIAL] Evento del ${ev.fechaEvento} agregado con algún campo faltante — revisar a mano.`
      : `[HISTORIAL] ✓ Evento del ${ev.fechaEvento} agregado.`);
  }
}

// ══ Migración visual completa a la plantilla nueva ═══════════════════════
// Crea un Doc NUEVO (con el diseño aprobado por el usuario: banner azul,
// tablas con color, etc.) para un vehículo, copiando del Doc viejo solo los
// datos que no existen en la app (Código, N° de Serie, Marca/Modelo, Año,
// Encargado, y las filas de Especificaciones Técnicas — las que sean, no
// se asume una lista fija porque varían según el tipo de máquina). Después
// corre automáticamente actualizarFichaTecnica() sobre el Doc nuevo para
// completar todo lo demás (documentación, foto, fallas, link, historial).
//
// Se llama UN vehículo a la vez desde la consola del navegador:
//   migrarFichaTecnicaVisual('HGBL14')
// A propósito no tiene botón en la interfaz — es una operación de una sola
// vez por vehículo, no algo para tocar por accidente.
// ⚠️ No probado contra la API real.

// Busca la primera tabla que aparece DESPUÉS de un texto ancla y ANTES de
// otro texto límite (para ubicar la tabla de "Especificaciones técnicas" o
// "Historial de eventos mayores", que no tienen ningún texto propio en su
// primera fila que las identifique — el título está en un párrafo aparte,
// arriba de la tabla). Si no se pasa textoFin, busca hasta el final del doc.
function _docTablaEntre(doc, textoInicio, textoFin) {
  const frags = _docFlatten(doc);
  const idxInicio = frags.findIndex(f => f.text.toUpperCase().includes(textoInicio));
  if (idxInicio === -1) return null;
  const idxFin = textoFin ? frags.findIndex((f, i) => i > idxInicio && f.text.toUpperCase().includes(textoFin)) : -1;
  const desde = frags[idxInicio].end;
  const hasta = idxFin !== -1 ? frags[idxFin].start : Infinity;

  let found = null;
  function walk(content) {
    (content || []).forEach(item => {
      if (item.table && item.startIndex >= desde && item.startIndex < hasta && !found) found = item;
      if (item.table) item.table.tableRows.forEach(row => row.tableCells.forEach(cell => walk(cell.content)));
    });
  }
  walk(doc.body.content);
  return found;
}

// Convierte una tabla de 2 columnas en una lista [{label, value}, ...]
function _extraerFilasTabla(tabla) {
  if (!tabla) return [];
  return tabla.table.tableRows
    .map(row => ({
      label: row.tableCells[0] ? _docCeldaTexto(row.tableCells[0]).replace(/\n/g, '').trim() : '',
      value: row.tableCells[1] ? _docCeldaTexto(row.tableCells[1]).replace(/\n/g, '').trim() : '',
    }))
    .filter(r => r.label);
}

// Igual que _extraerFilasTabla, pero soporta filas con DOS pares
// etiqueta/valor (4 celdas: etiqueta1, valor1, etiqueta2, valor2) — la
// tabla de Especificaciones Técnicas del doc original viene así, no de
// 2 columnas simples.
function _extraerFilasTablaSpecs(tabla) {
  if (!tabla) return [];
  // La etiqueta siempre va en una sola línea; el valor puede tener varias
  // (ej. "ACEITE: ...", "COMBUSTIBLE: ...", "AIRE: ..." en líneas separadas
  // dentro de la misma celda) — esas líneas se conservan, no se pegan.
  const limpiarValor = (txt) => txt.split('\n').map(s => s.trim()).filter(Boolean).join('\n');
  const filas = [];
  tabla.table.tableRows.forEach(row => {
    const c = row.tableCells;
    if (c[0] && c[1]) {
      const label = _docCeldaTexto(c[0]).replace(/\n/g, ' ').trim();
      const value = limpiarValor(_docCeldaTexto(c[1]));
      if (label) filas.push({ label, value });
    }
    if (c[2] && c[3]) {
      const label = _docCeldaTexto(c[2]).replace(/\n/g, ' ').trim();
      const value = limpiarValor(_docCeldaTexto(c[3]));
      if (label) filas.push({ label, value });
    }
  });
  return filas;
}

// Convierte una tabla de 2 columnas en un objeto { ETIQUETA: valor }.
// Prueba varias anclas porque _docBuscarTabla solo mira el texto de la
// PRIMERA fila de la tabla — "EQUIPO" es la primera fila real de la tabla
// de datos generales, "PATENTE" es una fila más abajo.
function _extraerTablaComoObjeto(doc, ...anclas) {
  let tabla = null;
  for (const ancla of anclas) {
    tabla = _docBuscarTabla(doc, ancla);
    if (tabla) break;
  }
  if (!tabla) return {};
  const out = {};
  _extraerFilasTabla(tabla).forEach(r => { out[r.label.toUpperCase()] = r.value; });
  return out;
}

async function _obtenerCarpetaPadre(fileId) {
  try {
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=parents`, {
      headers: { Authorization: 'Bearer ' + accessToken },
    });
    const data = await res.json();
    return (data.parents && data.parents[0]) || null;
  } catch (e) { return null; }
}

// Sube contenido HTML a Drive dejando que Google lo convierta a Doc nativo
// (mismo mecanismo con el que se armó y aprobó la plantilla de ejemplo).
async function _crearDocDesdeHtml(nombreArchivo, htmlContent, parentFolderId) {
  const boundary = 'lst_ficha_' + Date.now();
  const metadata = JSON.stringify({
    name: nombreArchivo,
    mimeType: 'application/vnd.google-apps.document',
    parents: parentFolderId ? [parentFolderId] : undefined,
  });
  const body = [
    '--' + boundary, 'Content-Type: application/json; charset=UTF-8', '', metadata,
    '--' + boundary, 'Content-Type: text/html; charset=UTF-8', '', htmlContent,
    '--' + boundary + '--',
  ].join('\r\n');

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'multipart/related; boundary=' + boundary },
    body,
  });
  if (!res.ok) throw new Error('Drive create ' + res.status + ': ' + (await res.text()).slice(0, 200));
  return res.json();
}

// Arma el HTML de la plantilla nueva con los datos fijos ya completados
// (los que no existen en la app) y marcadores {{ASÍ}} para lo que va a
// completar actualizarFichaTecnica() justo después de crear el Doc.
function _armarHtmlFichaTecnica(d) {
  const escapar = (s) => (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const escaparMultilinea = (s) => escapar(s).replace(/\n+/g, '<br>');
  const filasSpecs = (d.specsRows && d.specsRows.length)
    ? d.specsRows.map(r => `<tr><td class="etiqueta">${escapar(r.label)}</td><td>${escaparMultilinea(r.value) || '&nbsp;'}</td></tr>`).join('')
    : `<tr><td class="etiqueta">&nbsp;</td><td>&nbsp;</td></tr>`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  body { font-family: 'Trebuchet MS', Arial, sans-serif; color: #263646; font-size: 12.5px; line-height: 1.4; }
  p, div { margin: 0; padding: 0; }
  td p, th p { margin: 0; }
  table.header-tabla { width: 100%; border-collapse: collapse; }
  table.header-tabla td { background: #0f3d66; color: #ffffff; text-align: center; padding: 16px 20px; border: none; }
  .header-tabla .empresa { font-size: 11px; letter-spacing: 3px; color: #9fc3e8; font-weight: bold; margin-bottom: 4px; }
  .header-tabla .titulo { font-size: 18px; font-weight: bold; letter-spacing: 1px; }
  .header-tabla .subtitulo { font-size: 11px; color: #cfe3f5; margin-top: 3px; letter-spacing: 1px; }
  .datos-tabla { width: 100%; border-collapse: collapse; border: 1px solid #d7e2ec; }
  .datos-tabla td { border: 1px solid #e3ebf3; padding: 8px 12px; font-size: 12px; }
  .datos-tabla .etiqueta { background: #eef5fc; font-weight: bold; color: #0f3d66; width: 38%; letter-spacing: 0.3px; }
  .datos-tabla .valor { background: #ffffff; color: #1f2d3a; font-weight: bold; }
  .foto-caja { border: 1px solid #d7e2ec; background: #f7fafd; border-radius: 6px; padding: 12px; text-align: center; }
  .foto-caja .rotulo { font-size: 10px; color: #6f8aa3; letter-spacing: 1.2px; font-weight: bold; margin-bottom: 6px; }
  .foto-marcador { color: #b8641a; font-style: italic; font-size: 11.5px; }
  .seccion { margin-top: 22px; margin-bottom: 9px; border-bottom: 2px solid #0f3d66; padding-bottom: 5px; }
  .seccion .num { color: #6f8aa3; font-weight: bold; font-size: 12px; margin-right: 6px; }
  .seccion .txt { color: #0f3d66; font-weight: bold; font-size: 13px; letter-spacing: 0.5px; }
  table.grilla { width: 100%; border-collapse: collapse; }
  table.grilla th { background: #0f3d66; color: #fff; font-size: 10.5px; letter-spacing: 0.4px; text-align: left; padding: 8px 11px; }
  table.grilla td { border: 1px solid #e3ebf3; padding: 8px 11px; font-size: 12px; }
  table.grilla tr:nth-child(even) td { background: #f7fafd; }
  .marcador { color: #b8641a; font-style: italic; font-size: 11.5px; }
  .fallas-grid { width: 100%; border-collapse: collapse; }
  .fallas-grid td { border: none; width: 50%; vertical-align: top; padding: 0; }
  .falla-caja { border-radius: 6px; padding: 11px 13px; font-size: 12px; }
  .falla-caja.operativa { background: #fff2e2; border: 1px solid #f3d3a8; margin-right: 8px; }
  .falla-caja.estetica  { background: #eef5fc; border: 1px solid #cfe0f0; margin-left: 8px; }
  .falla-caja .rotulo { font-weight: bold; font-size: 10px; letter-spacing: 1px; margin-bottom: 5px; display: block; }
  .falla-caja.operativa .rotulo { color: #a05a10; }
  .falla-caja.estetica .rotulo { color: #1a4d8f; }
  .link-caja { background: #eef5fc; border: 1px solid #cfe0f0; border-radius: 6px; padding: 11px 13px; font-size: 12px; }
  .link-caja a { color: #0f3d66; font-weight: bold; text-decoration: underline; }
  .nota { font-size: 10.5px; color: #8697a8; margin-top: 5px; font-style: italic; }
  .specs-caja { border: 1.5px dashed #9fb3d1; border-radius: 6px; padding: 14px; min-height: 60px; color: #6f8aa3; font-size: 11.5px; }
  </style></head><body>
  <table class="header-tabla"><tr><td>
    <div class="empresa">CONSTRUCTORA LST</div>
    <div class="titulo">HOJA DE VIDA DE MAQUINARIA</div>
    <div class="subtitulo">REGISTRO TÉCNICO Y ADMINISTRATIVO</div>
  </td></tr></table>
  <div class="seccion" style="margin-top:20px"><span class="num">00&nbsp;&nbsp;·&nbsp;&nbsp;</span><span class="txt">DATOS GENERALES</span></div>
  <table class="datos-tabla">
    <tr><td class="etiqueta">EQUIPO</td><td class="valor">${escapar(d.equipo)}</td></tr>
    <tr><td class="etiqueta">CÓDIGO</td><td class="valor">${escapar(d.codigo)}</td></tr>
    <tr><td class="etiqueta">MARCA / MODELO</td><td class="valor">${escapar(d.marcaModelo)}</td></tr>
    <tr><td class="etiqueta">N° DE SERIE</td><td class="valor">${escapar(d.nSerie)}</td></tr>
    <tr><td class="etiqueta">AÑO</td><td class="valor">${escapar(d.anio)}</td></tr>
    <tr><td class="etiqueta">PATENTE</td><td class="valor">${escapar(d.patente)}</td></tr>
    <tr><td class="etiqueta">UBICACIÓN</td><td class="valor"><span class="marcador">{{UBICACION}}</span></td></tr>
    <tr><td class="etiqueta">ENCARGADO</td><td class="valor">${escapar(d.encargado)}</td></tr>
  </table>
  <div class="foto-caja" style="margin-top:12px">
    <div class="rotulo">FOTO DE REFERENCIA</div>
    <span class="foto-marcador">{{FOTO_REFERENCIA}}</span>
  </div>
  <div style="height:16px">&nbsp;</div>
  <div class="seccion"><span class="num">01&nbsp;&nbsp;·&nbsp;&nbsp;</span><span class="txt">ESPECIFICACIONES TÉCNICAS</span></div>
  <table class="datos-tabla">${filasSpecs}</table>
  <div class="seccion"><span class="num">02&nbsp;&nbsp;·&nbsp;&nbsp;</span><span class="txt">DOCUMENTACIÓN</span></div>
  <table class="grilla">
    <tr><th>DOCUMENTO</th><th>FECHA DE VENCIMIENTO</th><th>ESTADO</th></tr>
    <tr><td>Revisión Técnica</td><td><span class="marcador">{{FECHA_REVISION}}</span></td><td><span class="marcador">{{ESTADO_REVISION}}</span></td></tr>
    <tr><td>Permiso de Circulación</td><td><span class="marcador">{{FECHA_PERMISO}}</span></td><td><span class="marcador">{{ESTADO_PERMISO}}</span></td></tr>
    <tr><td>Seguro Obligatorio</td><td><span class="marcador">{{FECHA_SOAP}}</span></td><td><span class="marcador">{{ESTADO_SOAP}}</span></td></tr>
  </table>
  <div class="seccion"><span class="num">03&nbsp;&nbsp;·&nbsp;&nbsp;</span><span class="txt">FALLAS DETECTADAS</span></div>
  <table class="fallas-grid"><tr>
    <td><div class="falla-caja operativa"><span class="rotulo">⚙ OPERATIVA&nbsp;&nbsp;</span><span class="marcador">{{FALLA_OPERATIVA}}</span></div></td>
    <td><div class="falla-caja estetica"><span class="rotulo">✎ ESTÉTICA&nbsp;&nbsp;</span><span class="marcador">{{FALLA_ESTETICA}}</span></div></td>
  </tr></table>
  <div class="seccion"><span class="num">04&nbsp;&nbsp;·&nbsp;&nbsp;</span><span class="txt">REGISTRO FOTOGRÁFICO</span></div>
  <div class="link-caja">📁 Carpeta completa de fotos: <a href="#">{{LINK_CARPETA_FOTOS}}</a></div>
  <div class="seccion"><span class="num">05&nbsp;&nbsp;·&nbsp;&nbsp;</span><span class="txt">HISTORIAL DE EVENTOS MAYORES</span></div>
  <table class="grilla">
    <tr><th>FECHA</th><th>HORÓMETRO/ODÓMETRO</th><th>TIPO DE EVENTO</th><th>DESCRIPCIÓN</th><th>COSTO</th></tr>
    <tr><td colspan="5" style="text-align:center;color:#93a5b6">Sin eventos registrados todavía</td></tr>
  </table>
  </body></html>`;
}

async function migrarFichaTecnicaVisual(patente) {
  const e = allEquipos.find(x => x.patente === patente);
  if (!e || !e.linkFicha) { console.error('Vehículo sin ficha vinculada'); return; }
  const oldDocId = _extraerDocId(e.linkFicha);
  if (!oldDocId) { console.error('Link de ficha inválido'); return; }

  console.log(`[MIGRAR] ${patente}: leyendo doc viejo...`);
  const oldDoc = await docsApiFetch('GET', oldDocId);

  const datosGenerales = _extraerTablaComoObjeto(oldDoc, 'EQUIPO', 'PATENTE');
  const tablaSpecs = _docTablaEntre(oldDoc, 'ESPECIFICACIONES TÉCNICAS', 'DOCUMENTACIÓN');
  const specsRows = _extraerFilasTablaSpecs(tablaSpecs);
  console.log('[MIGRAR] Datos generales encontrados:', datosGenerales);
  console.log('[MIGRAR] Filas de especificaciones técnicas encontradas:', specsRows);

  const html = _armarHtmlFichaTecnica({
    equipo: datosGenerales['EQUIPO'] || '',
    codigo: datosGenerales['CÓDIGO'] || '',
    marcaModelo: datosGenerales['MARCA / MODELO'] || datosGenerales['MARCA/MODELO'] || '',
    nSerie: datosGenerales['N° DE SERIE'] || datosGenerales['N°DE SERIE'] || '',
    anio: datosGenerales['AÑO'] || '',
    patente: e.patente,
    encargado: datosGenerales['ENCARGADO'] || '',
    specsRows,
  });

  console.log('[MIGRAR] Creando doc nuevo...');
  const parentId = await _obtenerCarpetaPadre(oldDocId);
  const nuevoArchivo = await _crearDocDesdeHtml(`Ficha Técnica — ${patente}`, html, parentId);
  const nuevoDocUrl = `https://docs.google.com/document/d/${nuevoArchivo.id}/edit`;
  console.log('[MIGRAR] Doc nuevo creado:', nuevoDocUrl);

  // Actualizar linkFicha en la hoja MAQUINARIA (columna T)
  const rowsMaq = await fetchSheet(`'${CONFIG.SHEET_MAQUINARIA}'!E2:E200`); // col E = patente
  const rowIdx = (rowsMaq || []).findIndex(r => (r[0] || '').trim().toUpperCase() === patente.toUpperCase());
  if (rowIdx === -1) {
    console.error('[MIGRAR] No se encontró la fila del vehículo en MAQUINARIA — actualizá linkFicha a mano:', nuevoDocUrl);
  } else {
    const filaReal = rowIdx + 2;
    await writeSheet(`'${CONFIG.SHEET_MAQUINARIA}'!T${filaReal}`, [[nuevoDocUrl]]);
    e.linkFicha = nuevoDocUrl;
    console.log('[MIGRAR] linkFicha actualizado en la hoja, fila', filaReal);
  }

  console.log('[MIGRAR] Completando datos dinámicos con actualizarFichaTecnica()...');
  await actualizarFichaTecnica(patente);
  console.log(`[MIGRAR] ✓ ${patente} migrado. Revisa el doc nuevo: ${nuevoDocUrl}`);
}

// Migra TODOS los vehículos que tengan ficha técnica vinculada, uno por
// uno (nunca en paralelo, para no saturar la API de Docs). Si uno falla,
// sigue con el resto — no corta la corrida por un vehículo con problemas.
// Al final deja un resumen en la consola con cuáles salieron bien y
// cuáles no (para revisar esos a mano o reintentar).
//   migrarTodasLasFichasTecnicas()
async function migrarTodasLasFichasTecnicas() {
  if (!allEventos.length) {
    console.log('[MIGRAR TODAS] Cargando mantenciones (allEventos estaba vacío)...');
    await loadEventos();
    console.log(`[MIGRAR TODAS] ${allEventos.length} evento(s) de mantención cargados.`);
  }

  const pendientes = allEquipos.filter(e => e.linkFicha);
  console.log(`[MIGRAR TODAS] ${pendientes.length} vehículo(s) con ficha vinculada. Arrancando...`);

  const ok = [];
  const conError = [];

  for (const e of pendientes) {
    console.log(`\n[MIGRAR TODAS] ────── ${e.patente} ──────`);
    try {
      await migrarFichaTecnicaVisual(e.patente);
      ok.push(e.patente);
    } catch (err) {
      console.error(`[MIGRAR TODAS] ✗ ${e.patente} falló:`, err);
      conError.push({ patente: e.patente, error: err.message });
    }
    // Pausa breve entre vehículos para no pegarle a la API muy seguido
    await new Promise(r => setTimeout(r, 1500));
  }

  console.log('\n\n[MIGRAR TODAS] ══════ RESUMEN ══════');
  console.log(`✓ OK (${ok.length}):`, ok);
  console.log(`✗ Con error (${conError.length}):`, conError);
  if (conError.length) {
    console.log('Revisa esos a mano, o reintenta uno por uno con migrarFichaTecnicaVisual(\'PATENTE\')');
  }
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
        toast(`Subiendo foto ${i+1} de ${_eventoFotos.length}...`, 'loading');

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
    toast('Actualizando datos...', 'loading');
  }

  try {
    // Columnas A→W (índices 0→22)
    // A=N° B=EQUIPO C=CODIGO D=MARCA E=MODELO F=AÑO G=COLOR H=PATENTE
    // I=ESTADO J=UBICACION K=HOROMETRO L=PROX_MANT M=ULT_MANT
    // N=SOAP O=PERMISO P=REVISION Q=? R=PATENTE2 S=OBS T=MANT_CADA
    // U=PROPIETARIO V=RUT W=LINK_FICHA_TECNICA
    const rows = await fetchSheet(`'${CONFIG.SHEET_MAQUINARIA}'!A2:X200`);
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
          // Convertir cualquier link "de ver" de Drive (pegado a mano o generado por
          // versiones viejas de la app) al formato thumbnail que sí carga en <img>.
          // Reconoce tanto ".../file/d/ID/view" como "uc?export=view&id=ID".
          const mPath  = u.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
          const mQuery = u.match(/[?&]id=([a-zA-Z0-9_-]+)/);
          const fileId = (mPath && mPath[1]) || (mQuery && mQuery[1]);
          if (fileId) return `https://drive.google.com/thumbnail?id=${fileId}&sz=w800`;
          return u;
        })(),
        fallaOperativa: r[22] || '',
        fallaEstetica:  r[23] || '',
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
        chequearAlertaKilometraje();
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
    </div>`).join('') || emptyState('Sin resultados', 'Prueba con otro filtro o búsqueda',
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
function openFicha(patente, soloLectura) {
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
      <img src="${e.fotoRef}" alt="Foto de referencia" style="width:100%;height:220px;object-fit:cover;display:block;border-radius:14px">
    </div>` : ''}

    <div class="ficha-section">
      <div class="ficha-sec-title">Fotos</div>
      <div class="ficha-foto-row viewer-hidden">
        <label class="ficha-foto-btn">
          <svg viewBox="0 0 24 24" fill="none" class="inline-ic"><rect x="3" y="4" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.7"/><circle cx="8.5" cy="9.5" r="1.5" stroke="currentColor" stroke-width="1.5"/><path d="M3 16l5-5 3 3 4-4 6 6" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg> Elegir fotos
          <input type="file" accept="image/*" multiple onchange="onFichaFotoSelected(this,'${e.patente}')" style="display:none">
        </label>
        <label class="ficha-foto-btn">
          <svg viewBox="0 0 24 24" fill="none" class="inline-ic"><path d="M4 8a1 1 0 0 1 1-1h2l1.2-2h7.6L17 7h2a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="12" cy="13" r="3.4" stroke="currentColor" stroke-width="1.7"/></svg> Tomar foto
          <input type="file" accept="image/*" capture="environment" multiple onchange="onFichaFotoSelected(this,'${e.patente}')" style="display:none">
        </label>
      </div>
      <button class="ficha-link-btn" onclick="abrirCarpetaFotosEquipo('${e.patente}')" style="cursor:pointer;margin-top:8px;background:#f3f0ff;color:#6d43c9">
        <svg viewBox="0 0 24 24" fill="none" class="inline-ic"><path d="M3 8l1-3h6l1 2h9v12H3Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg> Ver fotos guardadas
      </button>
    </div>

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
    ${e.linkFicha ? `
    <button class="ficha-link-btn" onclick="actualizarFichaTecnica('${e.patente}')" style="cursor:pointer;margin-top:6px;width:100%;display:flex;align-items:center;gap:8px;background:#eafaf0;color:#1a8a4a;border:1px solid #bfe8cf">
      <svg viewBox="0 0 24 24" fill="none" class="inline-ic"><path d="M4 12a8 8 0 0 1 13.66-5.66L20 8M4 12a8 8 0 0 0 13.66 5.66L20 16M20 4v4h-4M4 20v-4h4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg> Actualizar ficha técnica
    </button>` : ''}
    <a class="ficha-link-btn" onclick="abrirCarpetaDrive('${e.patente}')" style="cursor:pointer;margin-top:6px;display:flex;align-items:center;gap:8px;background:#e8f4fd;color:#1a73e8;border:1px solid #c5e0f5">
      <svg viewBox="0 0 24 24" fill="none" class="inline-ic"><path d="M3 8l1-3h6l1 2h9v12H3Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg> Abrir carpeta en Drive
    </a>
    ${typeof _renderHistorialMovimientos === 'function' ? _renderHistorialMovimientos(e.patente) : ''}
    <button class="action-btn" onclick="openEditPanel()" style="margin-top:8px${soloLectura ? ';display:none' : ''}"><svg viewBox="0 0 24 24" fill="none" class="inline-ic"><path d="M4 20l1-4 11-11 3 3-11 11Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M14 7l3 3" stroke="currentColor" stroke-width="1.7"/></svg> Editar información</button>
  `;

  openPanel('panel-ficha');
}

// ── Abrir carpeta Drive de un equipo ─────────────────────────
async function abrirCarpetaDrive(patente) {
  toast('Buscando carpeta en Drive...', 'loading');
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

// ── Fotos sueltas del vehículo (sin foto de referencia ni evento) ──────
// Se suben directo a [PATENTE]/Fotos/ en Drive, reutilizando uploadFile()
// (mismo helper que usa el resto de la app para subir a subcarpetas). No
// tocan la columna fotoRef ni requieren pasar por el panel de eventos —
// es solo un lugar rápido para dejar fotos sueltas ("del día", control de
// avance, etc.) asociadas al equipo.
async function onFichaFotoSelected(input, patente) {
  if (!input.files || !input.files.length) return;
  const files = Array.from(input.files);
  input.value = '';
  let ok = 0;
  for (let i = 0; i < files.length; i++) {
    try {
      await uploadFile(files[i], patente, 'FOTO', 'Fotos');
      ok++;
    } catch(err) {
      toast('Error al subir foto: ' + err.message, 'error');
    }
  }
  if (ok > 1) toast(`${ok} fotos subidas a Drive ✓`);
}

async function abrirCarpetaFotosEquipo(patente) {
  toast('Buscando carpeta de fotos...', 'loading');
  try {
    await ensureToken();
    const folderId = await getSubfolder(patente, 'Fotos');
    window.open(`https://drive.google.com/drive/folders/${folderId}`, '_blank');
  } catch(err) {
    toast('Error: ' + err.message, 'error');
  }
}

async function openDocDrive(patente, prefix) {
  toast('Buscando documento en Drive...', 'loading');
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
  if (document.getElementById('edit-falla-operativa')) document.getElementById('edit-falla-operativa').value = e.fallaOperativa || '';
  if (document.getElementById('edit-falla-estetica'))  document.getElementById('edit-falla-estetica').value  = e.fallaEstetica || '';

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
  const fallaOp   = document.getElementById('edit-falla-operativa')?.value || '';
  const fallaEst  = document.getElementById('edit-falla-estetica')?.value || '';
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
    toast('Guardando datos...', 'loading');
    console.log('[SAVE] Escribiendo fila', row, 'en Sheet...');

    // Determinar URL final de foto de referencia (Drive)
    let fotoRefVal = currentEquipo?.fotoRef || '';
    if (_editFotoRef === 'QUITAR') {
      fotoRefVal = '';
    } else if (_editFotoRef === 'NUEVA' && _editFotoRefFile) {
      toast('Subiendo foto de referencia a Drive...', 'loading');
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
      // Columna L (km/horómetro) nunca se toca desde la app — se actualiza solo en el Sheets
      writeSheet(`'${CONFIG.SHEET_MAQUINARIA}'!M${row}`, [[proxima]]),
      writeSheet(`'${CONFIG.SHEET_MAQUINARIA}'!N${row}`, [[ultima]]),
      writeSheet(`'${CONFIG.SHEET_MAQUINARIA}'!P${row}`, [[soap]]),
      writeSheet(`'${CONFIG.SHEET_MAQUINARIA}'!Q${row}`, [[permiso]]),
      writeSheet(`'${CONFIG.SHEET_MAQUINARIA}'!R${row}`, [[revision]]),
      writeSheet(`'${CONFIG.SHEET_MAQUINARIA}'!S${row}`, [[obs]]),
      writeSheet(`'${CONFIG.SHEET_MAQUINARIA}'!V${row}`, [[fotoRefVal]]),
      writeSheet(`'${CONFIG.SHEET_MAQUINARIA}'!W${row}`, [[fallaOp]]),
      writeSheet(`'${CONFIG.SHEET_MAQUINARIA}'!X${row}`, [[fallaEst]]),
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
  if (id === 'panel-ficha') {
    try { localStorage.removeItem('lst_ficha'); } catch(e) {}
  }
  // Usar transitionend para ocultar el panel exactamente cuando termina la animación,
  // sin lag ni glitch de setTimeout. Fallback por si el evento no dispara.
  let _panelClosed = false;
  function _onPanelClose() {
    if (_panelClosed) return;
    _panelClosed = true;
    el.removeEventListener('transitionend', _onPanelClose);
    el.classList.add('hidden');
    // Desktop: quitar overlay si ya no queda ningún panel abierto
    if (isDesktop()) {
      const stillOpen = document.querySelectorAll('.panel:not(.hidden)').length;
      if (!stillOpen) {
        const ov = document.getElementById('panel-overlay');
        if (ov) ov.remove();
      }
    }
  }
  el.addEventListener('transitionend', _onPanelClose, { once: true });
  setTimeout(_onPanelClose, 320); // fallback
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

// Muestra la pantalla de login con un mensaje dado. Si conectando=true,
// oculta el botón y muestra el spinner en su lugar (reconexión en
// silencio); si no, muestra el botón normal para que la persona entre
// con Google. No usa el splash oscuro para este caso — mantiene una sola
// pantalla consistente en vez de saltar entre login y splash.
function mostrarLogin(hint, conectando) {
  document.getElementById('login-hint').textContent = hint || 'Inicia sesión para acceder a los datos';
  document.getElementById('login-btn').classList.toggle('hidden', !!conectando);
  document.getElementById('login-spinner').classList.toggle('hidden', !conectando);
  document.getElementById('login-screen').classList.remove('hidden');
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
      actualizarChipUsuario();
    }
  } catch(e) {}

  const hadLogin   = localStorage.getItem('lst_had_login');
  const savedEmail = localStorage.getItem(EMAIL_KEY) || '';

  // ── Caso 1: token aún válido → splash normal + carga ──
  if (loadSavedToken()) {
    document.getElementById('login-screen').classList.add('hidden');
    const splashEl = document.getElementById('splash');
    splashEl.classList.remove('hidden');
    document.getElementById('splash-progress').classList.add('splash-waiting');
    document.getElementById('splash-hint').textContent = 'Conectando...';
    loadData();
    return;
  }

  // ── Caso 2: ya hizo login antes → reconectar en silencio con la misma
  //    cuenta, mostrando el login con un spinner en vez del splash. Así el
  //    arranque usa siempre la misma pantalla liviana hasta que efectivamente
  //    hay datos que cargar (recién ahí aparece el splash con progreso). ──
  if (hadLogin) {
    mostrarLogin('Conectando...', true);

    let intentosInit = 0;
    function intentarSilencioso() {
      intentosInit++;
      if (tokenClient) {
        const prevCb = tokenClient.callback;
        let resuelto = false;

        // Watchdog: en Safari/iOS, requestAccessToken con prompt:'' (silencioso)
        // puede quedar colgado sin disparar el callback NI de éxito NI de error
        // (problema conocido de Google Identity Services en Safari, relacionado
        // con el bloqueo de cookies/almacenamiento de terceros). Sin este timeout
        // la app se queda pegada en "Conectando..." para siempre en esos casos.
        const watchdog = setTimeout(() => {
          if (resuelto) return;
          resuelto = true;
          tokenClient.callback = prevCb;
          if (intentosInit < 3) {
            setTimeout(intentarSilencioso, 1500);
          } else {
            mostrarLogin('Inicia sesión para acceder a los datos', false);
          }
        }, 6000);

        tokenClient.callback = (response) => {
          if (resuelto) return;
          resuelto = true;
          clearTimeout(watchdog);
          tokenClient.callback = prevCb;
          if (response.error) {
            if (intentosInit < 3 && response.error !== 'access_denied') {
              setTimeout(intentarSilencioso, 2000);
            } else {
              // Tras múltiples fallos → login
              mostrarLogin('Inicia sesión para acceder a los datos', false);
            }
            return;
          }
          saveToken(response.access_token, response.expires_in || 3600);
          try {
            const sr = localStorage.getItem(ROLE_KEY);
            const se = localStorage.getItem(EMAIL_KEY);
            if (sr) { userRole = sr; userEmail = se || ''; applyViewerMode(); actualizarChipUsuario(); }
          } catch(e) {}
          // Recién ahora, con la sesión ya renovada, pasamos del login al
          // splash con progreso — loadData() ya maneja el splash y al final
          // muestra modulos-home
          document.getElementById('login-screen').classList.add('hidden');
          document.getElementById('splash').classList.remove('hidden');
          document.getElementById('splash-progress').classList.add('splash-waiting');
          loadData();
        };
        tokenClient.requestAccessToken({ prompt: '', login_hint: savedEmail });
      } else if (intentosInit < 8) {
        setTimeout(intentarSilencioso, 500);
      } else {
        mostrarLogin('Inicia sesión para acceder a los datos', false);
      }
    }
    setTimeout(intentarSilencioso, 400);
    return;
  }

  // ── Caso 3: primera vez → el login ya está visible por defecto ──
  mostrarLogin('Inicia sesión para acceder a los datos', false);
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

  toast('Subiendo documentos...', 'loading');
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
  toast('Probando conexión con Apps Script...', 'loading');
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
    .chips, .inv-tabs, .movh-tabs-bar, .movh-chips-row {
      overscroll-behavior-x: contain;
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
  toast('Actualizando datos...', 'loading');
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
