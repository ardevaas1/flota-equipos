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
let driveFolders  = {};
const today = new Date();

// ── OAuth / Google Identity Services ─────────────────────────
let tokenClient  = null;
let accessToken  = null;
let tokenExpiry  = 0;

const TOKEN_KEY  = 'lst_access_token';
const EXPIRY_KEY = 'lst_token_expiry';

// Guarda token en localStorage con tiempo de expiración
function saveToken(token, expiresIn) {
  accessToken = token;
  tokenExpiry = Date.now() + (expiresIn - 60) * 1000; // 60s de margen
  try {
    localStorage.setItem(TOKEN_KEY,  token);
    localStorage.setItem(EXPIRY_KEY, tokenExpiry.toString());
  } catch(e) {}
}

// Carga token guardado si aún es válido
function loadSavedToken() {
  try {
    const token  = localStorage.getItem(TOKEN_KEY);
    const expiry = parseInt(localStorage.getItem(EXPIRY_KEY) || '0');
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
    scope: CONFIG.SCOPES,
    callback: (response) => {
      if (response.error) {
        document.getElementById('login-hint').textContent = 'Error: ' + response.error;
        clearToken();
        return;
      }
      saveToken(response.access_token, response.expires_in || 3600);
      try { localStorage.setItem('lst_had_login', '1'); } catch(e) {}
      document.getElementById('login-screen').classList.add('hidden');
      document.getElementById('splash').classList.remove('hidden');
      loadData();
    },
  });

  // Renueva silenciosamente el token 5 min antes de que expire
  setInterval(() => {
    if (accessToken && tokenExpiry - Date.now() < 5 * 60 * 1000) {
      tokenClient.requestAccessToken({ prompt: '' });
    }
  }, 60 * 1000);
}

function signIn() {
  document.getElementById('login-hint').textContent = 'Conectando...';
  if (!tokenClient) { initOAuth(); setTimeout(signIn, 600); return; }
  const hadLogin = localStorage.getItem('lst_had_login');
  // Primera vez: muestra pantalla de consentimiento con todos los permisos
  // Veces siguientes: silencioso
  tokenClient.requestAccessToken({ 
    prompt: hadLogin ? '' : 'consent',
    include_granted_scopes: 'true'
  });
}

// Asegura que haya token válido antes de llamar a la API
function ensureToken() {
  return new Promise((resolve, reject) => {
    if (isTokenValid()) { resolve(); return; }
    if (!tokenClient) { reject(new Error('OAuth no iniciado')); return; }
    // Intenta renovar silenciosamente (sin popup)
    const prevCallback = tokenClient.callback;
    tokenClient.callback = (response) => {
      tokenClient.callback = prevCallback;
      if (response.error) { reject(new Error(response.error)); return; }
      saveToken(response.access_token, response.expires_in || 3600);
      resolve();
    };
    tokenClient.requestAccessToken({ prompt: '' });
  });
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

function iconoEquipo(tipo) {
  const t = (tipo || '').toLowerCase();
  // SVG icons por tipo de máquina
  const svgs = {
    camioneta: `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" width="32" height="32" class="equipo-svg">
      <rect x="2" y="18" width="36" height="14" rx="3" fill="#3B82F6"/>
      <path d="M6 18 L10 10 L28 10 L34 18" fill="#2563EB"/>
      <rect x="10" y="11" width="8" height="6" rx="1" fill="#BAE6FD"/>
      <rect x="20" y="11" width="8" height="6" rx="1" fill="#BAE6FD"/>
      <circle cx="10" cy="32" r="4" fill="#1E293B"/><circle cx="10" cy="32" r="2" fill="#94A3B8"/>
      <circle cx="30" cy="32" r="4" fill="#1E293B"/><circle cx="30" cy="32" r="2" fill="#94A3B8"/>
    </svg>`,
    camion: `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" width="32" height="32" class="equipo-svg">
      <rect x="2" y="16" width="24" height="16" rx="2" fill="#F59E0B"/>
      <rect x="26" y="20" width="12" height="12" rx="2" fill="#D97706"/>
      <rect x="28" y="22" width="8" height="7" rx="1" fill="#FEF3C7"/>
      <rect x="4" y="18" width="10" height="8" rx="1" fill="#FDE68A"/>
      <circle cx="9" cy="32" r="4" fill="#1E293B"/><circle cx="9" cy="32" r="2" fill="#94A3B8"/>
      <circle cx="31" cy="32" r="4" fill="#1E293B"/><circle cx="31" cy="32" r="2" fill="#94A3B8"/>
    </svg>`,
    furgon: `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" width="32" height="32" class="equipo-svg">
      <rect x="2" y="14" width="36" height="18" rx="3" fill="#8B5CF6"/>
      <rect x="4" y="16" width="12" height="9" rx="1" fill="#C4B5FD"/>
      <rect x="18" y="16" width="8" height="9" rx="1" fill="#C4B5FD"/>
      <rect x="28" y="16" width="8" height="9" rx="1" fill="#C4B5FD"/>
      <circle cx="10" cy="32" r="4" fill="#1E293B"/><circle cx="10" cy="32" r="2" fill="#94A3B8"/>
      <circle cx="30" cy="32" r="4" fill="#1E293B"/><circle cx="30" cy="32" r="2" fill="#94A3B8"/>
    </svg>`,
    retroexcavadora: `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" width="32" height="32" class="equipo-svg">
      <rect x="2" y="24" width="22" height="10" rx="2" fill="#F59E0B"/>
      <rect x="4" y="18" width="14" height="8" rx="1" fill="#D97706"/>
      <rect x="6" y="20" width="8" height="5" rx="1" fill="#FEF3C7"/>
      <path d="M24 22 L30 14 L34 18 L28 26 Z" fill="#92400E"/>
      <path d="M34 18 L38 22 L36 28 L32 26 Z" fill="#78350F"/>
      <rect x="2" y="32" width="22" height="4" rx="2" fill="#1E293B"/>
    </svg>`,
    excavadora: `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" width="32" height="32" class="equipo-svg">
      <rect x="2" y="26" width="24" height="8" rx="2" fill="#EF4444"/>
      <rect x="4" y="18" width="16" height="10" rx="1" fill="#DC2626"/>
      <rect x="6" y="20" width="10" height="6" rx="1" fill="#FCA5A5"/>
      <path d="M20 16 L28 10 L32 14 L26 22 Z" fill="#B91C1C"/>
      <path d="M32 14 L38 18 L36 24 L30 22 Z" fill="#991B1B"/>
      <path d="M36 24 L40 26 L38 30 L34 28 Z" fill="#7F1D1D"/>
      <rect x="2" y="32" width="24" height="4" rx="2" fill="#1E293B"/>
    </svg>`,
    minicargador: `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" width="32" height="32" class="equipo-svg">
      <rect x="6" y="20" width="20" height="12" rx="2" fill="#F59E0B"/>
      <rect x="8" y="22" width="10" height="7" rx="1" fill="#FEF3C7"/>
      <path d="M2 28 L6 24 L6 32 L2 32 Z" fill="#D97706"/>
      <path d="M2 26 L8 26 L8 28 L2 28 Z" fill="#92400E"/>
      <rect x="26" y="16" width="4" height="6" rx="1" fill="#92400E"/>
      <rect x="22" y="14" width="12" height="4" rx="1" fill="#78350F"/>
      <rect x="4" y="30" width="22" height="5" rx="2" fill="#1E293B"/>
    </svg>`,
    manipulador: `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" width="32" height="32" class="equipo-svg">
      <rect x="4" y="22" width="20" height="12" rx="2" fill="#10B981"/>
      <rect x="6" y="24" width="10" height="7" rx="1" fill="#D1FAE5"/>
      <path d="M24 20 L34 8 L36 10 L28 24 Z" fill="#059669"/>
      <path d="M34 8 L38 10 L38 14 L36 14 Z" fill="#065F46"/>
      <rect x="4" y="32" width="20" height="4" rx="2" fill="#1E293B"/>
    </svg>`,
    grua: `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" width="32" height="32" class="equipo-svg">
      <rect x="4" y="24" width="16" height="10" rx="2" fill="#F59E0B"/>
      <rect x="6" y="26" width="8" height="6" rx="1" fill="#FEF3C7"/>
      <rect x="18" y="6" width="3" height="28" fill="#D97706"/>
      <rect x="18" y="6" width="18" height="3" fill="#D97706"/>
      <rect x="33" y="9" width="2" height="12" fill="#92400E"/>
      <rect x="4" y="32" width="16" height="4" rx="2" fill="#1E293B"/>
    </svg>`,
    rodillo: `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" width="32" height="32" class="equipo-svg">
      <rect x="8" y="16" width="24" height="12" rx="2" fill="#6B7280"/>
      <rect x="10" y="18" width="12" height="7" rx="1" fill="#D1D5DB"/>
      <ellipse cx="20" cy="30" rx="14" ry="6" fill="#374151"/>
      <ellipse cx="20" cy="30" rx="10" ry="4" fill="#6B7280"/>
      <rect x="6" y="12" width="28" height="6" rx="3" fill="#4B5563"/>
    </svg>`,
    mixer: `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" width="32" height="32" class="equipo-svg">
      <rect x="2" y="20" width="20" height="14" rx="2" fill="#3B82F6"/>
      <rect x="4" y="22" width="8" height="8" rx="1" fill="#BFDBFE"/>
      <ellipse cx="28" cy="22" rx="9" ry="11" fill="#1D4ED8"/>
      <path d="M22 16 L34 14 L34 30 L22 28 Z" fill="#2563EB"/>
      <circle cx="8" cy="34" r="3" fill="#1E293B"/><circle cx="8" cy="34" r="1.5" fill="#94A3B8"/>
      <circle cx="16" cy="34" r="3" fill="#1E293B"/><circle cx="16" cy="34" r="1.5" fill="#94A3B8"/>
    </svg>`,
    tractor: `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" width="32" height="32" class="equipo-svg">
      <rect x="4" y="18" width="20" height="14" rx="2" fill="#16A34A"/>
      <rect x="6" y="20" width="10" height="8" rx="1" fill="#BBF7D0"/>
      <circle cx="12" cy="32" r="6" fill="#1E293B"/><circle cx="12" cy="32" r="3" fill="#4B5563"/>
      <circle cx="30" cy="34" r="4" fill="#1E293B"/><circle cx="30" cy="34" r="2" fill="#4B5563"/>
      <rect x="22" y="22" width="12" height="8" rx="1" fill="#15803D"/>
    </svg>`,
    generador: `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" width="32" height="32" class="equipo-svg">
      <rect x="4" y="16" width="32" height="18" rx="3" fill="#6B7280"/>
      <rect x="8" y="20" width="10" height="8" rx="1" fill="#D1D5DB"/>
      <path d="M22 18 L26 26 L23 26 L27 34 L21 24 L24 24 Z" fill="#FCD34D"/>
      <circle cx="32" cy="24" r="4" fill="#374151"/>
      <circle cx="32" cy="24" r="2" fill="#9CA3AF"/>
    </svg>`,
    default: `<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" width="32" height="32" class="equipo-svg">
      <rect x="8" y="12" width="24" height="20" rx="3" fill="#6B7280"/>
      <rect x="12" y="16" width="8" height="6" rx="1" fill="#D1D5DB"/>
      <path d="M16 8 L20 4 L24 8 L22 8 L22 12 L18 12 L18 8 Z" fill="#4B5563"/>
      <rect x="10" y="28" width="6" height="4" rx="1" fill="#374151"/>
      <rect x="24" y="28" width="6" height="4" rx="1" fill="#374151"/>
    </svg>`,
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

function diasRestantes(fechaStr) {
  if (!fechaStr) return null;
  const s = fechaStr.toString().trim().toLowerCase();
  if (!s || s === '-' || s === 'falta' || s === 'foto' || s === 'sin dato') return null;
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
    document.getElementById('main').classList.remove('hidden');
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
// Busca la subcarpeta de una patente dentro de la carpeta raíz
async function getFolderForPatente(patente) {
  if (driveFolders[patente]) return driveFolders[patente];

  const q = encodeURIComponent(`'${CONFIG.DRIVE_ROOT_FOLDER}' in parents and name='${patente}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  await ensureToken();
  const url = `${DRIVE_API}/files?q=${q}&fields=files(id,name)`;
  const res = await fetch(url, { headers: authHeader() });
  if (!res.ok) throw new Error(`Drive search ${res.status}`);
  const data = await res.json();

  if (data.files && data.files.length > 0) {
    driveFolders[patente] = data.files[0].id;
    return data.files[0].id;
  }
  // Si no existe la carpeta, usa la raíz
  return CONFIG.DRIVE_ROOT_FOLDER;
}

// Sube un archivo a la carpeta de la patente
async function uploadFile(file, patente, prefixName) {
  toast('Subiendo ' + prefixName + '...');

  // Paso 1: buscar carpeta (sigue usando Drive API solo para leer, no para escribir)
  let folderId;
  try {
    await ensureToken();
    folderId = await getFolderForPatente(patente);
    toast('Carpeta encontrada: ' + patente);
  } catch(e) {
    folderId = CONFIG.DRIVE_ROOT_FOLDER;
    toast('Carpeta ' + patente + ' no encontrada, usando raíz', 'error');
  }

  // Paso 2: preparar nombre y leer archivo como base64
  const ext = file.name.split('.').pop();
  const fileName = `${prefixName}_${patente}_${new Date().toLocaleDateString('es-CL').replace(/\//g,'-')}.${ext}`;

  const fileData = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]); // solo base64, sin el prefijo
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  // Paso 3: enviar al Apps Script (que corre dentro de Google y sube a Drive sin restricciones)
  toast('Enviando ' + fileName + ' a Drive...');
  const res = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    body: JSON.stringify({
      folderId: folderId,
      fileName: fileName,
      fileData: fileData,
      mimeType: file.type || 'application/octet-stream'
    })
  });

  if (!res.ok) throw new Error('Error HTTP ' + res.status);

  const result = await res.json();
  if (!result.success) throw new Error(result.error || 'Error desconocido en Apps Script');

  toast(prefixName + ' subido ✓ → ' + result.name);
  return { id: result.id, name: result.name };
}

// ── Cargar datos ──────────────────────────────────────────────
async function loadData() {
  const btn = document.getElementById('refresh-btn');
  if (btn) btn.style.opacity = '0.4';
  splash(10, 'Conectando con Google Sheets...');

  try {
    // Columnas A→W (índices 0→22)
    // A=N° B=EQUIPO C=CODIGO D=MARCA E=MODELO F=AÑO G=COLOR H=PATENTE
    // I=ESTADO J=UBICACION K=HOROMETRO L=PROX_MANT M=ULT_MANT
    // N=SOAP O=PERMISO P=REVISION Q=? R=PATENTE2 S=OBS T=MANT_CADA
    // U=PROPIETARIO V=RUT W=LINK_FICHA_TECNICA
    const rows = await fetchSheet(`'${CONFIG.SHEET_MAQUINARIA}'!A2:T200`);
    splash(70, 'Procesando equipos...');

    allEquipos = rows
      .filter(r => r[1] && r[1].toString().trim() && r[1].toString().trim().toUpperCase() !== 'EQUIPO')
      .map((r, i) => ({
        rowIndex:    i + 2,
        equipo:      r[1]  || '',   // B - tipo equipo
        marca:       r[2]  || '',   // C
        modelo:      r[3]  || '',   // D
        patente:     r[4]  || '',   // E
        anio:        r[5]  || '',   // F
        color:       r[6]  || '',   // G
        propietario: r[7]  || '',   // H
        rut:         r[8]  || '',   // I
        estadoRaw:   r[9]  || '',   // J
        estado:      parseEstado(r[9]),
        ubicacion:   r[10] || '',   // K
        horometro:   r[11] || '',   // L
        proxMant:    r[12] || '',   // M
        ultMant:     r[13] || '',   // N ← nueva
        mantCada:    r[14] || '',   // O
        soap:        r[15] || '',   // P
        permiso:     r[16] || '',   // Q
        revision:    r[17] || '',   // R
        obs:         r[18] || '',   // S
        linkFicha:   r[19] || '',   // T
      }));

    splash(100, '¡Listo!');
    renderDashboard();
    renderEquipos();
    renderAlertas();
    renderMantenciones();
    setTimeout(() => {
      hideSplash();
      restoreState();
    }, 300);
    toast('Datos actualizados ✓');
  } catch (e) {
    console.error(e);
    splash(100, 'Error: ' + e.message);
    toast('Error: ' + e.message, 'error');
    setTimeout(hideSplash, 2000);
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
      <div class="card-icon">${iconoEquipo(e.equipo)}</div>
      <div class="card-body">
        <div class="card-title">${e.marca} ${e.modelo}</div>
        <div class="card-sub">${e.equipo} · ${e.patente} · ${e.ubicacion}</div>
      </div>
      <div class="card-right">
        <span class="badge ${cls}">${txt}</span>
        <span style="font-size:11px;color:#aaa">${lbl}</span>
      </div>
    </div>`;
  }).join('') || '<div class="empty">Sin alertas urgentes ✓</div>';

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
      <div class="card-icon">${iconoEquipo(e.equipo)}</div>
      <div class="card-body">
        <div class="card-title">${e.marca} ${e.modelo}</div>
        <div class="card-sub">Actual: ${formatNum(e.actual)} · Próxima: ${formatNum(e.prox)}</div>
      </div>
      <span class="badge ${cls}">${e.diff >= 0 ? 'Faltan ' + formatNum(e.diff) : 'ATRASADA'}</span>
    </div>`;
  }).join('') || '<div class="empty">Sin datos de horómetro disponibles</div>';
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
  });

  document.getElementById('equipos-list').innerHTML = filtered.map(e => `
    <div class="card" onclick="openFicha('${e.patente}')">
      <div class="card-icon">${iconoEquipo(e.equipo)}</div>
      <div class="card-body">
        <div class="card-title">${e.marca} ${e.modelo}</div>
        <div class="card-sub">${e.equipo} · ${e.patente} · ${e.anio}</div>
        <span class="badge ${ESTADO_COLOR[e.estado]||'gray'}" style="margin-top:4px;display:inline-block">${ESTADO_LABEL[e.estado]||e.estado}</span>
      </div>
      <div class="card-right">
        <span class="card-arrow">›</span>
        <span style="font-size:11px;color:#aaa">${e.ubicacion}</span>
      </div>
    </div>`).join('') || '<div class="empty">Sin resultados</div>';
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
        📄 Abrir ficha técnica
       </a>`
    : `<div class="ficha-link-btn disabled" style="opacity:0.4;cursor:default">📄 Ficha técnica no disponible</div>`;

  document.getElementById('ficha-body').innerHTML = `
    <div class="ficha-hero">
      <div class="ficha-hero-icon">${iconoEquipo(e.equipo)}</div>
      <div class="ficha-hero-info">
        <div class="ficha-hero-type">${e.equipo}</div>
        <div class="ficha-hero-name">${e.marca} ${e.modelo}</div>
        <div class="ficha-hero-plate">${e.patente} · ${e.anio} · ${e.color}</div>
        <span class="badge ${ESTADO_COLOR[e.estado]||'gray'}" style="margin-top:6px;display:inline-block">
          ${ESTADO_LABEL[e.estado]||e.estado}
        </span>
      </div>
    </div>

    <div class="ficha-section">
      <div class="ficha-sec-title">Información general</div>
      ${field('Ubicación', e.ubicacion)}
      ${field('Propietario', e.propietario)}
      ${field('Año', e.anio)}
      ${field('Color', e.color)}
    </div>

    <div class="ficha-section">
      <div class="ficha-sec-title">Horómetro / Odómetro</div>
      ${field('Actual', formatNum(e.horometro) + (e.mantCada ? ' · Cada ' + e.mantCada : ''))}
      ${field('Próxima mantención', formatNum(e.proxMant))}
      ${field('Última mantención', formatNum(e.ultMant))}
      ${e.obs ? `<div class="ficha-obs">⚠️ ${e.obs}</div>` : ''}
      <button class="action-btn" onclick="openMantPanel('${e.patente}')">+ Registrar mantención</button>
    </div>

    <div class="ficha-section">
      <div class="ficha-sec-title">Documentos</div>
      <div class="doc-row">
        <div><div class="doc-name">SOAP</div><div class="doc-date">${e.soap||'Sin dato'}</div></div>
        <div style="display:flex;gap:6px;align-items:center">
          ${docBadge(diasRestantes(e.soap))}
          ${e.soap && e.soap !== 'Sin dato' ? `<button class="doc-open-btn" onclick="openDocDrive('${e.patente}','SOAP')">Ver</button>` : ''}
        </div>
      </div>
      <div class="doc-row">
        <div><div class="doc-name">Permiso de circulación</div><div class="doc-date">${e.permiso||'Sin dato'}</div></div>
        <div style="display:flex;gap:6px;align-items:center">
          ${docBadge(diasRestantes(e.permiso))}
          ${e.permiso && e.permiso !== 'Sin dato' ? `<button class="doc-open-btn" onclick="openDocDrive('${e.patente}','PERMISO')">Ver</button>` : ''}
        </div>
      </div>
      <div class="doc-row">
        <div><div class="doc-name">Revisión técnica</div><div class="doc-date">${e.revision||'Sin dato'}</div></div>
        <div style="display:flex;gap:6px;align-items:center">
          ${docBadge(diasRestantes(e.revision))}
          ${e.revision && e.revision !== 'Sin dato' ? `<button class="doc-open-btn" onclick="openDocDrive('${e.patente}','REVISION')">Ver</button>` : ''}
        </div>
      </div>
    </div>

    ${fichaBtn}
    <button class="action-btn" onclick="openEditPanel()" style="margin-top:8px">✏️ Editar información</button>
  `;

  openPanel('panel-ficha');
}

// ── Abrir documento desde Drive ──────────────────────────────
async function openDocDrive(patente, prefix) {
  toast('Buscando documento...');
  try {
    const folderId = await getFolderForPatente(patente);
    const q = encodeURIComponent(`'${folderId}' in parents and name contains '${prefix}_${patente}' and trashed=false`);
    await ensureToken();
    const url = `${DRIVE_API}/files?q=${q}&fields=files(id,name,webViewLink)&orderBy=createdTime desc`;
    const res = await fetch(url, { headers: authHeader() });
    const data = await res.json();
    if (data.files && data.files.length > 0) {
      window.open(data.files[0].webViewLink, '_blank');
    } else {
      toast('No se encontró archivo de ' + prefix + ' en Drive', 'error');
    }
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
      <div class="card-icon">${iconoEquipo(e.equipo)}</div>
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

  document.getElementById('alertas-vencidos').innerHTML = vencidos.join('') || '<div class="empty">Sin documentos vencidos ✓</div>';
  document.getElementById('alertas-pronto').innerHTML   = pronto.join('')   || '<div class="empty">Sin vencimientos próximos ✓</div>';
  document.getElementById('alertas-ok').innerHTML       = ok.join('')       || '<div class="empty">Sin equipos con documentos</div>';
}

// ── Mantenciones ──────────────────────────────────────────────
function renderMantenciones() {
  document.getElementById('mant-equipo').innerHTML = allEquipos.map(e =>
    `<option value="${e.patente}">${e.marca} ${e.modelo} (${e.patente})</option>`
  ).join('');

  const conHoro = allEquipos
    .filter(e => e.horometro && e.proxMant)
    .map(e => {
      const actual = parseFloat((e.horometro||'').toString().replace(/\./g,'')) || 0;
      const prox   = parseFloat((e.proxMant ||'').toString().replace(/\./g,'')) || 0;
      return { ...e, actual, prox, diff: prox - actual };
    })
    .filter(e => e.prox > 0)
    .sort((a,b) => a.diff - b.diff);

  document.getElementById('mant-proximas').innerHTML = conHoro.slice(0,8).map(e => {
    const cls = e.diff < 0 ? 'red' : e.diff < 500 ? 'amber' : 'green';
    return `<div class="mant-card" onclick="openFicha('${e.patente}')">
      <div class="mant-icon">${iconoEquipo(e.equipo)}</div>
      <div class="mant-body">
        <div class="mant-title">${e.marca} ${e.modelo}</div>
        <div class="mant-meta">${e.equipo} · Actual: ${formatNum(e.actual)} · Próxima: ${formatNum(e.prox)} · Cada: ${e.mantCada||'—'}</div>
      </div>
      <span class="badge ${cls}">${e.diff >= 0 ? formatNum(e.diff)+' restante' : 'ATRASADA'}</span>
    </div>`;
  }).join('') || '<div class="empty">Sin datos de horómetro disponibles</div>';

  document.getElementById('mant-historial').innerHTML = allEquipos
    .filter(e => e.ultMant && !['-','falta',''].includes(e.ultMant.toString().toLowerCase()))
    .slice(0,8)
    .map(e => `<div class="mant-card" onclick="openFicha('${e.patente}')">
      <div class="mant-icon">${iconoEquipo(e.equipo)}</div>
      <div class="mant-body">
        <div class="mant-title">${e.marca} ${e.modelo}</div>
        <div class="mant-meta">${e.equipo} · Última: ${formatNum(e.ultMant)} · ${e.ubicacion}</div>
      </div>
    </div>`).join('') || '<div class="empty">Sin historial registrado</div>';
}

// ── Panel mantención ──────────────────────────────────────────
function openMantPanel(patente) {
  if (patente) {
    const sel = document.getElementById('mant-equipo');
    for (const opt of sel.options) {
      if (opt.value === patente) { sel.value = patente; break; }
    }
  }
  document.getElementById('mant-fecha').value = new Date().toISOString().slice(0,10);
  document.getElementById('mant-horometro').value = '';
  document.getElementById('mant-obs').value = '';
  document.getElementById('mant-foto').value = '';
  document.getElementById('mant-foto-label').textContent = '📷 Agregar foto (opcional)';
  openPanel('panel-mant');
}

async function saveMant() {
  const patente   = document.getElementById('mant-equipo').value;
  const horometro = document.getElementById('mant-horometro').value;
  const fecha     = document.getElementById('mant-fecha').value;
  const tipo      = document.getElementById('mant-tipo').value;
  const obs       = document.getElementById('mant-obs').value;
  const fotoFile  = document.getElementById('mant-foto').files[0];

  if (!patente || !fecha) { toast('Completa los campos obligatorios', 'error'); return; }

  try {
    const e = allEquipos.find(x => x.patente === patente);
    const nombreEquipo = e ? `${e.marca} ${e.modelo}` : patente;

    // Sube foto a Drive si hay
    let fotoNombre = '';
    if (fotoFile) {
      try {
        const uploaded = await uploadFile(fotoFile, patente, `MANT_${tipo.replace(/\s/g,'_')}`);
        fotoNombre = uploaded.name || '';
        toast('Foto subida a Drive ✓');
      } catch(uploadErr) {
        toast('Error al subir foto: ' + uploadErr.message, 'error');
        console.error('Upload error:', uploadErr);
      }
    }

    // Registra en hoja MANTENCIONES
    await appendSheet(`'${CONFIG.SHEET_MANTENCIONES}'!A:H`, [[
      new Date().toLocaleDateString('es-CL'),
      patente, nombreEquipo, horometro, tipo, obs, fecha, fotoNombre
    ]]);

    // Actualiza horómetro y última mantención en hoja principal
    if (horometro && e) {
      const fechaMant = new Date().toLocaleDateString('es-CL');
      await Promise.all([
        writeSheet(`'${CONFIG.SHEET_MAQUINARIA}'!L${e.rowIndex}`, [[horometro]]),
        writeSheet(`'${CONFIG.SHEET_MAQUINARIA}'!N${e.rowIndex}`, [[horometro]]),
      ]);
      e.horometro = horometro;
      e.ultMant = horometro;
    }

    toast('Mantención registrada ✓');
    closePanel('panel-mant');
    renderMantenciones();
    renderDashboard();
  } catch(err) {
    toast('Error: ' + err.message, 'error');
  }
}

// Preview nombre foto seleccionada
function onFotoSelected(input) {
  const label = document.getElementById('mant-foto-label');
  label.textContent = input.files[0] ? '✅ ' + input.files[0].name : '📷 Agregar foto (opcional)';
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
  openPanel('panel-edit');
}

async function saveEquipo() {
  const row      = document.getElementById('edit-row').value;
  const estado   = document.getElementById('edit-estado').value;
  const ubicacion = document.getElementById('edit-ubicacion').value;
  const horometro = document.getElementById('edit-horometro').value;
  const proxima  = document.getElementById('edit-proxima').value;

  const soap     = document.getElementById('edit-soap').value;
  const permiso  = document.getElementById('edit-permiso').value;
  const revision = document.getElementById('edit-revision').value;
  const obs      = document.getElementById('edit-obs').value;
  if (!row) return;

  try {
    // Escribe cada campo en su columna exacta para no pisar otras columnas
    // I=Estado, J=Ubicación, K=Horómetro, L=Próxima, M=Última
    // N=SOAP, O=Permiso, P=Revisión, S=Observaciones
    console.log('Guardando fila', row, 'estado:', estado);
    await Promise.all([
      writeSheet(`'${CONFIG.SHEET_MAQUINARIA}'!J${row}`, [[estado]]),
      writeSheet(`'${CONFIG.SHEET_MAQUINARIA}'!K${row}`, [[ubicacion]]),
      writeSheet(`'${CONFIG.SHEET_MAQUINARIA}'!L${row}`, [[horometro]]),
      writeSheet(`'${CONFIG.SHEET_MAQUINARIA}'!M${row}`, [[proxima]]),
      writeSheet(`'${CONFIG.SHEET_MAQUINARIA}'!P${row}`, [[soap]]),
      writeSheet(`'${CONFIG.SHEET_MAQUINARIA}'!Q${row}`, [[permiso]]),
      writeSheet(`'${CONFIG.SHEET_MAQUINARIA}'!R${row}`, [[revision]]),
      writeSheet(`'${CONFIG.SHEET_MAQUINARIA}'!S${row}`, [[obs]]),
    ]);
    toast('Guardado en Google Sheets ✓');
    const patente = document.getElementById('edit-patente').value;
    await uploadDocFiles(patente);
    resetDocInputs();
    closePanel('panel-edit');
    await loadData();
    if (patente) openFicha(patente);
  } catch(err) {
    toast('Error: ' + err.message, 'error');
  }
}

// ── Navegación ────────────────────────────────────────────────
function showPage(id, btn) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + id).classList.add('active');
  btn.classList.add('active');
  const titles = { dashboard:'Inicio', equipos:'Equipos', alertas:'Alertas', mantenciones:'Mantención' };
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

function openPanel(id) {
  const el = document.getElementById(id);
  el.classList.remove('hidden');
  requestAnimationFrame(() => el.style.transform = 'translateX(0)');
}

function closePanel(id) {
  const el = document.getElementById(id);
  el.style.transform = 'translateX(100%)';
  setTimeout(() => el.classList.add('hidden'), 280);
  if (id === 'panel-ficha') {
    try { localStorage.removeItem('lst_ficha'); } catch(e) {}
  }
}

// ── Restaurar estado anterior ─────────────────────────────────
function restoreState() {
  try {
    const page   = localStorage.getItem('lst_page')  || 'dashboard';
    const ficha  = localStorage.getItem('lst_ficha');
    const filter = localStorage.getItem('lst_filter') || 'todos';

    // Restaura pestaña activa
    const navIdx = { dashboard:0, equipos:1, alertas:2, mantenciones:3 };
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
document.addEventListener('DOMContentLoaded', () => {
  // Siempre ocultar splash al inicio
  document.getElementById('splash').classList.add('hidden');

  // Si hay token válido guardado, entra directo sin mostrar login
  if (loadSavedToken()) {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('splash').classList.remove('hidden');
    initOAuth();
    loadData();
    return;
  }

  // Si ya inició sesión antes, intenta renovar silenciosamente
  const hadLogin = localStorage.getItem('lst_had_login');
  if (hadLogin) {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('splash').classList.remove('hidden');
    initOAuth();
    setTimeout(() => {
      if (tokenClient) {
        // prompt:'' renueva silenciosamente con los scopes ya autorizados
        tokenClient.requestAccessToken({ prompt: '' });
      } else {
        document.getElementById('splash').classList.add('hidden');
        document.getElementById('login-screen').classList.remove('hidden');
      }
    }, 800);
    return;
  }

  // Primera vez: muestra pantalla de login
  document.getElementById('login-screen').classList.remove('hidden');
  initOAuth();
});

// ── Helpers para upload de documentos en formulario edición ──
function onDocFileSelected(input, labelId) {
  const label = document.getElementById(labelId);
  if (input.files[0]) {
    label.textContent = '✅ ' + input.files[0].name;
    label.classList.add('selected');
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
      const result = await uploadFile(file, patente, doc.prefix);
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
  ['soap-file','permiso-file','revision-file'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  ['soap-file-label','permiso-file-label','revision-file-label'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.classList.remove('selected');
      const defaults = { 'soap-file-label':'📎 Subir archivo SOAP', 'permiso-file-label':'📎 Subir archivo Permiso', 'revision-file-label':'📎 Subir archivo Rev. Técnica' };
      el.textContent = defaults[id];
    }
  });
}

// ── Manejo del botón Back del navegador ──────────────────────
// Cada vez que se abre un panel, empujamos un estado al historial.
// Cuando el usuario presiona Back, cerramos el panel en vez de salir.

const _panelStack = [];

const _origOpenPanel = openPanel;
window.openPanel = function(id) {
  history.pushState({ panel: id }, '');
  _panelStack.push(id);
  _origOpenPanel(id);
};

const _origClosePanel = closePanel;
window.closePanel = function(id) {
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
  }
});
