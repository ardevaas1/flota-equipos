// ============================================
// MÓDULOS INVENTARIO & CONTAINERS — LST
// Generadores (con eventos), Maq. Menor,
// Herramientas, Containers
// ============================================

// ── Empty state con ícono (compartido con app-v2.js) ──
// Si app-v2.js ya la definió global, no la redefinimos
if (typeof emptyState === 'undefined') {
  window.emptyState = function(titulo, subtitulo, iconPath) {
    const path = iconPath || `<path d="M3 7h18M3 12h18M3 17h12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>`;
    return `<div class="empty">
      <div class="empty-icon"><svg viewBox="0 0 24 24" fill="none">${path}</svg></div>
      <div class="empty-title">${titulo}</div>
      ${subtitulo ? `<div class="empty-sub">${subtitulo}</div>` : ''}
    </div>`;
  };
}

// ── Carpeta Drive exclusiva para fotos de Inventario & Containers ──
const DRIVE_INV_FOLDER = '1VTFqBY-uF8vAapnsnnF2YvN8T5CUb52g';

// ── Paneles secundarios de inventario (ocultan el FAB) ────────
const INV_PANELES_SECUNDARIOS = [
  'panel-inv-detalle','panel-inv-edit','panel-gen-evento',
  'panel-cont-detalle','panel-cont-edit',
  'panel-nuevo-inv','panel-nuevo-cont',
  'panel-and-nuevo','panel-and-edit',
];

// Actualiza visibilidad del FAB según si hay algún panel secundario visible
function _invActualizarFab() {
  const algunAbierto = INV_PANELES_SECUNDARIOS.some(id => {
    const el = document.getElementById(id);
    return el && !el.classList.contains('hidden');
  });
  document.querySelectorAll('#mod-inventario .fab-btn, #mod-containers .fab-btn')
    .forEach(fab => { fab.style.display = algunAbierto ? 'none' : ''; });
}

// MutationObserver: detecta cambios de clase en los paneles y actualiza FAB
// automáticamente sin importar qué función cierre el panel
document.addEventListener('DOMContentLoaded', function() {
  const observer = new MutationObserver(_invActualizarFab);
  INV_PANELES_SECUNDARIOS.forEach(function(id) {
    const el = document.getElementById(id);
    if (el) observer.observe(el, { attributes: true, attributeFilter: ['class'] });
  });
});

// ── Nombres de hojas (agregados a config.js via JS) ──────────
const SHEET_GENERADORES  = 'GENERADORES';
const SHEET_MAQ_MENOR    = 'MAQUINARIA MENOR';
const SHEET_HERRAMIENTAS = 'HERRAMIENTAS';
const SHEET_CONTAINERS   = 'CONTENEDORES';
const SHEET_GEN_EVENTOS  = 'MANTENCIONES_GEN'; // hoja de eventos generadores
const SHEET_MOVIMIENTOS  = 'MOVIMIENTOS'; // hoja de movimientos entre obras/bodega

// ── Datos en memoria ─────────────────────────────────────────
let allGeneradores  = [];
let allMaqMenor     = [];
let allHerramientas = [];
let allContainers   = [];
let allGenEventos   = [];

// ── Estado actual de módulo ───────────────────────────────────
let invModulo = 'generadores'; // 'generadores' | 'maqmenor' | 'herramientas'
let invItem   = null;          // ítem seleccionado para edición/detalle

// ── Selección múltiple (mover en grupo) ────────────────────────
let _invModoSeleccion = false;
let _invSeleccion = new Set();
let _contModoSeleccion = false;
let _contSeleccion = new Set();
let _movMultiOverrides = {};
let _movMultiItems = [];

// Selector de color con opción "Otro..." — muestra/oculta el campo de texto libre
function _toggleColorOtro(selectId) {
  const sel = document.getElementById(selectId);
  const otro = document.getElementById(selectId + '-otro');
  if (!sel || !otro) return;
  otro.style.display = sel.value === 'OTRO' ? 'block' : 'none';
}
// Devuelve el valor final de color (predefinido o el de "otro" si corresponde)
function _valorColor(selectId) {
  const sel = document.getElementById(selectId);
  if (!sel) return '';
  if (sel.value === 'OTRO') {
    const otro = document.getElementById(selectId + '-otro');
    return (otro ? otro.value.trim().toUpperCase() : '');
  }
  return sel.value;
}
// Precarga un selector de color con un valor guardado (predefinido u "otro")
const COLORES_PREDEFINIDOS = ['AMARILLO','NARANJO','ROJO','AZUL','VERDE','GRIS','BLANCO','NEGRO'];
function _precargarColor(selectId, valorGuardado) {
  const sel = document.getElementById(selectId);
  const otro = document.getElementById(selectId + '-otro');
  if (!sel) return;
  const v = (valorGuardado || '').toUpperCase().trim();
  if (!v) { sel.value = ''; if (otro) { otro.value = ''; otro.style.display = 'none'; } return; }
  if (COLORES_PREDEFINIDOS.includes(v)) {
    sel.value = v;
    if (otro) { otro.value = ''; otro.style.display = 'none'; }
  } else {
    sel.value = 'OTRO';
    if (otro) { otro.value = v; otro.style.display = 'block'; }
  }
}
// Marca/desmarca visualmente un campo inválido y devuelve si es válido
function _campoValido(id, esValido) {
  const el = document.getElementById(id);
  if (!el) return esValido;
  el.classList.toggle('input-error', !esValido);
  return esValido;
}
function _limpiarErrores(panelId) {
  document.querySelectorAll(`#${panelId} .input-error`).forEach(el => el.classList.remove('input-error'));
}
// Hace foco en el primer campo marcado como inválido dentro de un panel
function _enfocarPrimerError(panelId) {
  const first = document.querySelector(`#${panelId} .input-error`);
  if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ── Colores de estado ─────────────────────────────────────────
const INV_ESTADO_COLOR = {
  'operativo':  'green',
  'revisar':    'amber',
  'malo':       'red',
  'mala':       'red',
  'en revisión':'amber',
  'nuevo':      'blue',
};

const INV_ESTADO_BORDER = {
  'operativo':  'card--op',
  'nuevo':      'card--op',
  'revisar':    'card--obs',
  'en revisión':'card--obs',
  'malo':       'card--det',
  'mala':       'card--det',
};

function invEstadoColor(estado) {
  const k = (estado || '').toLowerCase().trim();
  return INV_ESTADO_COLOR[k] || 'gray';
}

function invEstadoBorder(estado) {
  const k = (estado || '').toLowerCase().trim();
  return INV_ESTADO_BORDER[k] || 'card--default';
}

// ── Icono simple por tipo de equipo inventario ────────────────
// Iconos de línea blancos (mismo lenguaje visual que el resto de la app),
// pensados para ir dentro de una placa con degradado (.card-icon, etc).
const INV_ICONOS = {
  generador: `<svg viewBox="0 0 24 24" fill="none" class="equipo-svg"><rect x="2" y="7" width="18" height="10" rx="2" stroke="white" stroke-width="1.6"/><path d="M5 10h6M5 12.5h6M5 15h6" stroke="white" stroke-width="1.4" stroke-linecap="round"/><rect x="14" y="9.5" width="4" height="5" rx="0.8" stroke="white" stroke-width="1.4"/><path d="M2 19h18M5 7V5M17 7V5" stroke="white" stroke-width="1.4" stroke-linecap="round"/></svg>`,
  soplador: `<svg viewBox="0 0 24 24" fill="none" class="equipo-svg"><rect x="3" y="7" width="8" height="9" rx="2" stroke="white" stroke-width="1.6"/><path d="M11 11h7" stroke="white" stroke-width="1.8" stroke-linecap="round"/><path d="M18 9c2 1 2 3 0 4" stroke="white" stroke-width="1.4" stroke-linecap="round"/><path d="M19 7c3 1.5 3 6.5 0 8" stroke="white" stroke-width="1.2" stroke-linecap="round"/></svg>`,
  vibroapisonador: `<svg viewBox="0 0 24 24" fill="none" class="equipo-svg"><rect x="9" y="3" width="6" height="5" rx="1" stroke="white" stroke-width="1.6"/><path d="M10 8v3M14 8v3" stroke="white" stroke-width="1.6" stroke-linecap="round"/><path d="M7 17h10l-1.5-6h-7Z" stroke="white" stroke-width="1.6" stroke-linejoin="round"/><path d="M9 17v2M15 17v2" stroke="white" stroke-width="1.6" stroke-linecap="round"/><path d="M14 5l6 14" stroke="white" stroke-width="1.4" stroke-linecap="round"/></svg>`,
  aspiradora: `<svg viewBox="0 0 24 24" fill="none" class="equipo-svg"><ellipse cx="9" cy="8" rx="6" ry="5" stroke="white" stroke-width="1.7"/><path d="M13 11l7 8" stroke="white" stroke-width="1.7" stroke-linecap="round"/><path d="M17 16l3 3" stroke="white" stroke-width="1.7" stroke-linecap="round"/></svg>`,
  turbocalefactor: `<svg viewBox="0 0 24 24" fill="none" class="equipo-svg"><path d="M12 2c2 3-2 4-2 7a3 3 0 0 0 6 0c0-1-1-2-1-2 1 4-1 5-1 5" stroke="white" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 14h14v6H5Z" stroke="white" stroke-width="1.7" stroke-linejoin="round"/></svg>`,
  compresor: `<svg viewBox="0 0 24 24" fill="none" class="equipo-svg"><rect x="3" y="6" width="14" height="9" rx="3" stroke="white" stroke-width="1.7"/><circle cx="6.5" cy="19" r="1.6" stroke="white" stroke-width="1.7"/><circle cx="13.5" cy="19" r="1.6" stroke="white" stroke-width="1.7"/><path d="M17 9h4M17 12h4" stroke="white" stroke-width="1.7" stroke-linecap="round"/></svg>`,
  hidrolavadora: `<svg viewBox="0 0 24 24" fill="none" class="equipo-svg"><rect x="3" y="9" width="10" height="9" rx="2" stroke="white" stroke-width="1.7"/><circle cx="6" cy="20" r="1.4" stroke="white" stroke-width="1.5"/><circle cx="10" cy="20" r="1.4" stroke="white" stroke-width="1.5"/><path d="M13 12h4l4-3" stroke="white" stroke-width="1.7" stroke-linecap="round"/><path d="M17 12c1 2 1 3 0 5" stroke="white" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  'cortadora de asfalto': `<svg viewBox="0 0 24 24" fill="none" class="equipo-svg"><circle cx="9" cy="9" r="6" stroke="white" stroke-width="1.7"/><path d="M9 5v8M5 9h8" stroke="white" stroke-width="1.5"/><path d="M13 13l8 8" stroke="white" stroke-width="1.7" stroke-linecap="round"/></svg>`,
  motobomba: `<svg viewBox="0 0 24 24" fill="none" class="equipo-svg"><rect x="5" y="8" width="10" height="8" rx="1.5" stroke="white" stroke-width="1.6"/><circle cx="10" cy="12" r="2.2" stroke="white" stroke-width="1.5"/><path d="M2 11h3M15 11h4M19 9v4" stroke="white" stroke-width="1.6" stroke-linecap="round"/><path d="M7 16v2M13 16v2" stroke="white" stroke-width="1.6" stroke-linecap="round"/></svg>`,
  'bomba sumergible': `<svg viewBox="0 0 24 24" fill="none" class="equipo-svg"><path d="M12 2c3 4 6 7.5 6 11a6 6 0 1 1-12 0c0-3.5 3-7 6-11Z" stroke="white" stroke-width="1.7" stroke-linejoin="round"/><path d="M9.5 14a2.5 2.5 0 0 0 2.5 2.5" stroke="white" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  'placa compactadora': `<svg viewBox="0 0 24 24" fill="none" class="equipo-svg"><rect x="2" y="16" width="20" height="3.5" rx="1.3" stroke="white" stroke-width="1.6"/><rect x="8" y="9" width="7" height="6" rx="1.2" stroke="white" stroke-width="1.6"/><path d="M15 11l6-5" stroke="white" stroke-width="1.6" stroke-linecap="round"/></svg>`,
  betonera: `<svg viewBox="0 0 24 24" fill="none" class="equipo-svg"><path d="M5 5l11-2 2 13-11 2Z" stroke="white" stroke-width="1.6" stroke-linejoin="round"/><ellipse cx="10.3" cy="3.7" rx="5.2" ry="1.6" stroke="white" stroke-width="1.4" transform="rotate(-10 10.3 3.7)"/><circle cx="6" cy="20" r="1.6" stroke="white" stroke-width="1.5"/><circle cx="13" cy="20" r="1.6" stroke="white" stroke-width="1.5"/><path d="M3 18h14" stroke="white" stroke-width="1.5" stroke-linecap="round"/></svg>`,
  'unidad motriz': `<svg viewBox="0 0 24 24" fill="none" class="equipo-svg"><rect x="3" y="3" width="8" height="6" rx="1.3" stroke="white" stroke-width="1.6"/><path d="M11 6q4 0 4 4t4 4" stroke="white" stroke-width="1.6" stroke-linecap="round"/><path d="M17 14l1 7" stroke="white" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  rodillo: `<svg viewBox="0 0 24 24" fill="none" class="equipo-svg"><circle cx="6" cy="17" r="4" stroke="white" stroke-width="1.7"/><circle cx="18" cy="17" r="4" stroke="white" stroke-width="1.7"/><path d="M6 13V8a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v5" stroke="white" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  demoledor: `<svg viewBox="0 0 24 24" fill="none" class="equipo-svg"><rect x="9" y="3" width="6" height="11" rx="2" stroke="white" stroke-width="1.7"/><path d="M6 6h3M15 6h3" stroke="white" stroke-width="1.6" stroke-linecap="round"/><path d="M10.5 14l1.5 7 1.5-7" stroke="white" stroke-width="1.6" stroke-linejoin="round"/></svg>`,
  'pistola impacto': `<svg viewBox="0 0 24 24" fill="none" class="equipo-svg"><path d="M3 13h9l3-4h5v5h-5l-3 4H3Z" stroke="white" stroke-width="1.7" stroke-linejoin="round"/><path d="M7 18l-2 3" stroke="white" stroke-width="1.7" stroke-linecap="round"/></svg>`,
  'pulidora hormigón': `<svg viewBox="0 0 24 24" fill="none" class="equipo-svg"><path d="M9 3l9 5" stroke="white" stroke-width="1.7" stroke-linecap="round"/><path d="M9 3 4 13" stroke="white" stroke-width="1.7" stroke-linecap="round"/><circle cx="8" cy="17" r="4" stroke="white" stroke-width="1.7"/><circle cx="8" cy="17" r="1.4" stroke="white" stroke-width="1.4"/></svg>`,
  teodolito: `<svg viewBox="0 0 24 24" fill="none" class="equipo-svg"><circle cx="12" cy="9" r="4" stroke="white" stroke-width="1.7"/><path d="M12 13v4M8 21l4-4 4 4M5 9H2M22 9h-3" stroke="white" stroke-width="1.6" stroke-linecap="round"/></svg>`,
  esmeril: `<svg viewBox="0 0 24 24" fill="none" class="equipo-svg"><circle cx="9" cy="9" r="6" stroke="white" stroke-width="1.7"/><path d="M9 5v8M5 9h8" stroke="white" stroke-width="1.5"/><path d="M13 13l8 8" stroke="white" stroke-width="1.7" stroke-linecap="round"/></svg>`,
  taladro: `<svg viewBox="0 0 24 24" fill="none" class="equipo-svg"><path d="M2 14V9a1 1 0 0 1 1-1h9l3 3h6v3h-6l-3 3H6a1 1 0 0 1-1-1v-1Z" stroke="white" stroke-width="1.7" stroke-linejoin="round"/><path d="M21 11v3" stroke="white" stroke-width="1.7" stroke-linecap="round"/></svg>`,
  container: `<svg viewBox="0 0 24 24" fill="none" class="equipo-svg"><rect x="3" y="7" width="18" height="12" rx="1.5" stroke="white" stroke-width="1.7"/><path d="M3 11h18M8 7v4M16 7v4" stroke="white" stroke-width="1.7" stroke-linecap="round"/></svg>`,
  bodega: `<svg viewBox="0 0 24 24" fill="none" class="equipo-svg"><path d="M3 10 12 4l9 6" stroke="white" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 9v11h14V9" stroke="white" stroke-width="1.7" stroke-linejoin="round"/><path d="M9 20v-6h6v6" stroke="white" stroke-width="1.7" stroke-linejoin="round"/></svg>`,
  oficina: `<svg viewBox="0 0 24 24" fill="none" class="equipo-svg"><rect x="4" y="3" width="16" height="18" rx="1.5" stroke="white" stroke-width="1.7"/><path d="M8 8h2M14 8h2M8 12h2M14 12h2M8 16h2M14 16h2" stroke="white" stroke-width="1.6" stroke-linecap="round"/></svg>`,
  baño: `<svg viewBox="0 0 24 24" fill="none" class="equipo-svg"><path d="M6 10V6a3 3 0 0 1 6 0" stroke="white" stroke-width="1.7" stroke-linecap="round"/><rect x="4" y="10" width="14" height="6" rx="1.5" stroke="white" stroke-width="1.7"/><path d="M6 16v3M16 16v3" stroke="white" stroke-width="1.7" stroke-linecap="round"/></svg>`,
};
const INV_ICONO_DEFAULT = `<svg viewBox="0 0 24 24" fill="none" class="equipo-svg"><path d="M14.7 6.3a4 4 0 0 1-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 1 5.4-5.4L21 6l-3-3Z" stroke="white" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function invIcono(equipo) {
  const k = (equipo || '').toLowerCase();
  for (const [key, icon] of Object.entries(INV_ICONOS)) {
    if (k.includes(key)) return icon;
  }
  return INV_ICONO_DEFAULT;
}

// ── Parser genérico de hoja inventario ───────────────────────
// Generadores: fila header doble, datos desde fila 3
// Col: A=N° B=EQUIPO C=CODIGO D=MARCA E=MODELO F=AÑO G=COLOR H=POTENCIA
//      I=ESTADO J=UBICACION K=HOROMETRO L=PROX_MANT M=ULT_MANT N=OBS O=IMAGEN
function parseGeneradores(rows) {
  return rows
    .map((r, i) => ({ r, rowIndex: i + 3 }))   // rowIndex real ANTES de filtrar
    .filter(({ r }) => r[0] && !isNaN(parseInt(r[0])))
    .map(({ r, rowIndex }) => ({
      rowIndex,
      num:       r[0]  || '',
      equipo:    r[1]  || 'GENERADOR',
      codigo:    r[2]  || '',
      marca:     r[3]  || '',
      modelo:    r[4]  || '',
      anio:      r[5]  || '',
      color:     r[6]  || '',
      potencia:  r[7]  || '',
      estado:    r[8]  || '',
      ubicacion: r[9]  || '',
      horometro: r[10] || '',
      proxMant:  r[11] || '',
      ultMant:   r[12] || '',
      obs:       r[13] || '',
      imagen:    r[14] || '',
    }));
}

// Maq. Menor: Col A=N° B=EQUIPO C=FOTO D=MARCA E=MODELO F=MOTOR G=COLOR H=ESTADO I=UBICACION J=OBS
function parseMaqMenor(rows) {
  return rows
    .map((r, i) => ({ r, rowIndex: i + 3 }))
    .filter(({ r }) => r[0] && !isNaN(parseInt(r[0])))
    .map(({ r, rowIndex }) => ({
      rowIndex,
      num:       r[0] || '',
      equipo:    r[1] || '',
      foto:      r[2] || '',
      marca:     r[3] || '',
      modelo:    r[4] || '',
      motor:     r[5] || '',
      color:     r[6] || '',
      estado:    r[7] || '',
      ubicacion: r[8] || '',
      obs:       r[9] || '',
    }));
}

// Herramientas: Col A=N° B=EQUIPO C=REGISTRO D=MARCA E=MODELO F=MOTOR G=COLOR H=ESTADO I=UBICACION J=PROX_MANT K=ULT_MANT L=OBS M=MANT_CADA
function parseHerramientas(rows) {
  return rows
    .map((r, i) => ({ r, rowIndex: i + 3 }))
    .filter(({ r }) => r[0] && !isNaN(parseInt(r[0])))
    .map(({ r, rowIndex }) => ({
      rowIndex,
      num:       r[0]  || '',
      equipo:    r[1]  || '',
      registro:  r[2]  || '',
      marca:     r[3]  || '',
      modelo:    r[4]  || '',
      motor:     r[5]  || '',
      color:     r[6]  || '',
      estado:    r[7]  || '',
      ubicacion: r[8]  || '',
      proxMant:  r[9]  || '',
      ultMant:   r[10] || '',
      obs:       r[11] || '',
      mantCada:  r[12] || '',
    }));
}

// Containers: Col A=N° B=TIPO C=FOTO D=MEDIDAS E=ESTADO F=COLOR G=UBICACION H=FECHA I=EQUIPAMIENTO J=OBS
function parseContainers(rows) {
  return rows
    .map((r, i) => ({ r, rowIndex: i + 3 }))
    .filter(({ r }) => r[1] && r[1].toString().trim())
    .map(({ r, rowIndex }) => ({
      rowIndex,
      num:          r[0] || '',
      tipo:         r[1] || '',
      foto:         r[2] || '',
      medidas:      r[3] || '',
      estado:       r[4] || '',
      color:        r[5] || '',
      ubicacion:    r[6] || '',
      fecha:        r[7] || '',
      equipamiento: r[8] || '',
      obs:          r[9] || '',
    }));
}

// ── Cargar todos los módulos ──────────────────────────────────
async function loadInventario() {
  try {
    const [rowsGen, rowsMM, rowsH, rowsCont] = await Promise.all([
      fetchSheet(`'${SHEET_GENERADORES}'!A3:O200`),
      fetchSheet(`'${SHEET_MAQ_MENOR}'!A3:J200`),
      fetchSheet(`'${SHEET_HERRAMIENTAS}'!A3:M200`),
      fetchSheet(`'${SHEET_CONTAINERS}'!A3:J100`),
    ]);
    allGeneradores  = parseGeneradores(rowsGen);
    allMaqMenor     = parseMaqMenor(rowsMM);
    allHerramientas = parseHerramientas(rowsH);
    allContainers   = parseContainers(rowsCont);
    console.log('[INV] Cargado:', allGeneradores.length, 'gen,', allMaqMenor.length, 'mm,', allHerramientas.length, 'h,', allContainers.length, 'cont');
  } catch(e) {
    console.error('[INV] Error cargando inventario:', e.message);
    toast('Error cargando inventario: ' + e.message, 'error');
  }

  // Cargar eventos de generadores (hoja MANTENCIONES_GEN si existe, si no usar MANTENCIONES con prefijo GEN-)
  try {
    const rowsGE = await fetchSheet(`'${SHEET_GEN_EVENTOS}'!A2:H500`);
    allGenEventos = rowsGE
      .filter(r => r[0] || r[1])
      .map((r, i) => ({
        rowIndex:      i + 2,
        fechaRegistro: r[0] || '',
        codigo:        r[1] || '',
        equipo:        r[2] || '',
        horometro:     r[3] || '',
        tipo:          r[4] || 'Mantención preventiva',
        descripcion:   r[5] || '',
        fechaEvento:   r[6] || r[0] || '',
        foto:          r[7] || '',
      }))
      .sort((a, b) => {
        const pd = s => { if (!s) return 0; const p = s.split('/'); return p.length===3 ? new Date(+p[2],+p[1]-1,+p[0]).getTime() : new Date(s).getTime()||0; };
        return pd(b.fechaEvento) - pd(a.fechaEvento);
      });
  } catch(e) {
    // La hoja puede no existir aún — es normal la primera vez
    console.warn('[INV] Hoja MANTENCIONES_GEN no encontrada, se creará al guardar el primer evento');
    allGenEventos = [];
  }
}

// ── Render lista inventario ────────────────────────────────────
function renderInvLista() {
  const datos = invModulo === 'generadores'  ? allGeneradores
              : invModulo === 'maqmenor'     ? allMaqMenor
              : allHerramientas;

  const searchEl = document.getElementById('inv-search');
  const txt = searchEl ? searchEl.value.toLowerCase() : '';

  const filtrados = datos.filter(item => {
    if (!txt) return true;
    return (item.equipo+item.marca+item.modelo+item.ubicacion+item.estado+item.codigo+'').toLowerCase().includes(txt);
  }).sort((a, b) => {
    const cmp = (a.equipo||'').localeCompare(b.equipo||'', 'es');
    if (cmp !== 0) return cmp;
    return ((a.marca||'') + (a.modelo||'')).localeCompare((b.marca||'') + (b.modelo||''), 'es');
  });

  const html = filtrados.map(item => {
    const cls   = invEstadoColor(item.estado);
    const icon  = invIcono(item.equipo);
    const titulo = [item.marca, item.modelo].filter(Boolean).join(' ') || item.equipo;
    const sub    = [item.equipo, item.codigo || item.motor].filter(Boolean).join(' · ');
    const key = `${invModulo}:${item.rowIndex}`;
    const checked = _invSeleccion.has(key);
    const onclickAttr = _invModoSeleccion
      ? `invToggleItemSeleccion('${invModulo}',${item.rowIndex})`
      : `invAbrirDetalle('${invModulo}',${item.rowIndex})`;
    return `<div class="card ${invEstadoBorder(item.estado)}" onclick="${onclickAttr}">
      ${_invModoSeleccion ? `<div class="card-checkbox ${checked?'checked':''}">${checked?'✓':''}</div>` : ''}
      <div class="card-icon" style="font-size:22px">${icon}</div>
      <div class="card-body">
        <div class="card-title">${titulo}</div>
        <div class="card-sub">${sub}</div>
      </div>
      <div class="card-right">
        <span class="badge ${cls}">${item.estado||'Sin estado'}</span>
        <span style="font-size:11px;color:#aaa">${item.ubicacion||'—'}</span>
        ${_invModoSeleccion ? '' : ''}
      </div>
    </div>`;
  }).join('') || emptyState('Sin resultados','Probá con otro filtro o búsqueda');

  const lista   = document.getElementById('inv-lista');
  const listaDt = document.getElementById('inv-dt-lista');
  if (lista)   lista.innerHTML   = html;
  if (listaDt) listaDt.innerHTML = html;

  // Actualizar stats móvil y desktop
  const op  = datos.filter(i => (i.estado||'').toLowerCase().includes('operativ') || (i.estado||'').toLowerCase() === 'nuevo').length;
  const rev = datos.filter(i => (i.estado||'').toLowerCase().includes('revis')).length;
  const mal = datos.filter(i => (i.estado||'').toLowerCase().includes('mal')).length;
  const el = id => document.getElementById(id);
  ['inv-stat-op','inv-dt-stat-op'].forEach(id   => { if (el(id)) el(id).textContent = op; });
  ['inv-stat-rev','inv-dt-stat-rev'].forEach(id  => { if (el(id)) el(id).textContent = rev; });
  ['inv-stat-mal','inv-dt-stat-mal'].forEach(id  => { if (el(id)) el(id).textContent = mal; });
}

// ── Detalle ítem inventario ───────────────────────────────────
function invAbrirDetalle(modulo, rowIndex, soloLectura) {
  const datos = modulo === 'generadores'  ? allGeneradores
              : modulo === 'maqmenor'     ? allMaqMenor
              : allHerramientas;

  const item = datos.find(i => i.rowIndex === rowIndex);
  if (!item) return;
  invItem = { ...item, _modulo: modulo };

  const cls   = invEstadoColor(item.estado);
  const icon  = invIcono(item.equipo);

  // Campos específicos por módulo
  let extraFields = '';
  if (modulo === 'generadores') {
    extraFields = `
      ${item.codigo    ? `<div class="field-row"><span class="fl">Código</span><span class="fv">${item.codigo}</span></div>` : ''}
      ${item.potencia  ? `<div class="field-row"><span class="fl">Potencia</span><span class="fv">${item.potencia}</span></div>` : ''}
      ${item.anio      ? `<div class="field-row"><span class="fl">Año</span><span class="fv">${item.anio}</span></div>` : ''}
      ${item.horometro ? `<div class="field-row"><span class="fl">Horómetro</span><span class="fv">${item.horometro}</span></div>` : ''}
      ${item.proxMant  ? `<div class="field-row"><span class="fl">Próx. mantención</span><span class="fv">${item.proxMant}</span></div>` : ''}
      ${item.ultMant   ? `<div class="field-row"><span class="fl">Última mantención</span><span class="fv">${item.ultMant}</span></div>` : ''}
    `;
  } else if (modulo === 'maqmenor') {
    extraFields = item.motor ? `<div class="field-row"><span class="fl">Motor</span><span class="fv">${item.motor}</span></div>` : '';
  } else {
    extraFields = `
      ${item.motor    ? `<div class="field-row"><span class="fl">Motor / Potencia</span><span class="fv">${item.motor}</span></div>` : ''}
      ${item.mantCada ? `<div class="field-row"><span class="fl">Mantención cada</span><span class="fv">${item.mantCada}</span></div>` : ''}
    `;
  }

  // Sección eventos solo para generadores
  let secEventos = '';
  if (modulo === 'generadores') {
    const evs = allGenEventos.filter(e => e.codigo === item.codigo).slice(0, 10);
    secEventos = `
      <div class="ficha-section">
        <div class="ficha-sec-title">Historial de eventos</div>
        ${evs.length === 0
          ? emptyState('Sin eventos registrados','Aún no hay historial para este equipo')
          : evs.map(ev => {
              const meta = tipoEventoMeta(ev.tipo);
              return `<div class="evento-card-mini">
                <div class="evento-tipo-icon ${meta.color}">${meta.icon}</div>
                <div class="mant-body">
                  <div class="mant-title">${ev.tipo}</div>
                  <div class="mant-meta">${ev.fechaEvento}${ev.horometro?' · '+ev.horometro+' h':''}</div>
                  ${ev.descripcion?`<div class="evento-desc">${ev.descripcion}</div>`:''}
                </div>
              </div>`;
            }).join('')
        }
        <button class="action-btn" onclick="invAbrirEventoGen()">+ Registrar evento</button>
      </div>`;
  }

  const imgSrc = item.imagen || item.foto || item.registro || '';

  document.getElementById('inv-detalle-body').innerHTML = `
    <div class="ficha-hero">
      <div class="ficha-hero-icon" style="font-size:36px">${icon}</div>
      <div class="ficha-hero-info">
        <div class="ficha-hero-type">${item.equipo}</div>
        <div class="ficha-hero-name">${[item.marca,item.modelo].filter(Boolean).join(' ') || '—'}</div>
        ${item.num ? `<div class="ficha-hero-plate">N° ${item.num}</div>` : ''}
        <span class="badge ${cls}" style="margin-top:6px;display:inline-block">${item.estado||'Sin estado'}</span>
      </div>
    </div>

    <div class="ficha-section">
      <div class="ficha-sec-title">Información</div>
      <div class="field-row"><span class="fl">Ubicación</span><span class="fv">${item.ubicacion||'—'}</span></div>
      ${item.color ? `<div class="field-row"><span class="fl">Color</span><span class="fv">${item.color}</span></div>` : ''}
      ${extraFields}
      ${item.obs ? `<div class="ficha-obs"><svg viewBox="0 0 24 24" fill="none" class="inline-ic"><path d="M12 3 3 19h18Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M12 10v3.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="16.3" r="0.9" fill="currentColor"/></svg> ${item.obs}</div>` : ''}
    </div>

    ${imgSrc ? `
    <div class="ficha-section">
      <div class="ficha-sec-title">Foto de referencia</div>
      <div style="padding:4px 0"
           onclick="${imgSrc.startsWith('http') ? `invAbrirFotoModalUrl('${imgSrc.replace(/'/g,"\\'")}')` : `invAbrirFotoModal('${imgSrc.replace(/'/g,"\\'")}')` }">
        <div id="inv-foto-thumb-${rowIndex}" style="background:#1e293b;border-radius:10px;overflow:hidden;cursor:pointer;position:relative">
          <div style="min-height:60px;display:flex;align-items:center;justify-content:center">
            <span style="color:#64748b;font-size:13px;padding:12px">⏳ Cargando foto...</span>
          </div>
        </div>
      </div>
    </div>` : ''}

    ${secEventos}

    ${_renderHistorialMovimientos(item.codigo || String(item.rowIndex))}

    <button class="action-btn" onclick="invAbrirEditar()" style="margin-top:8px${soloLectura ? ';display:none' : ''}"><svg viewBox="0 0 24 24" fill="none" class="inline-ic"><path d="M4 20l1-4 11-11 3 3-11 11Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M14 7l3 3" stroke="currentColor" stroke-width="1.7"/></svg> Editar información</button>
    <a class="ficha-link-btn" onclick="invAbrirCarpetaDrive()" style="cursor:pointer;margin-top:6px;display:flex;align-items:center;gap:8px;background:#e8f4fd;color:#1a73e8;border:1px solid #c5e0f5;padding:10px 14px;border-radius:10px;font-size:14px;font-weight:500;text-decoration:none">
      <svg viewBox="0 0 24 24" fill="none" class="inline-ic"><path d="M3 8l1-3h6l1 2h9v12H3Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg> Ver fotos en Drive
    </a>
  `;

  openPanel('panel-inv-detalle');

  // Cargar miniatura si hay imagen
  if (imgSrc) {
    invCargarMiniatura(imgSrc, `inv-foto-thumb-${rowIndex}`);
  }
}

// ── Miniatura: busca el archivo en Drive y carga la imagen ─────
async function invCargarMiniatura(fileName, thumbId) {
  const el = document.getElementById(thumbId);
  if (!el || !fileName) return;

  // Si es URL directa (http/https), mostrar sin buscar en Drive
  if (fileName.startsWith('http')) {
    const mPath  = fileName.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    const mQuery = fileName.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    const fileId = (mPath && mPath[1]) || (mQuery && mQuery[1]);
    // uc?export=view devuelve el archivo crudo (bytes de imagen) — sin ningún overlay de Drive
    const imgUrl = fileId
      ? `https://drive.google.com/uc?export=view&id=${fileId}`
      : fileName;
    // Si uc?export=view falla (ej: archivo no público), intentar lh3
    const fallbackUrl = fileId ? `https://lh3.googleusercontent.com/d/${fileId}` : fileName;
    el.innerHTML = `<img src="${imgUrl}" alt="Foto"
      style="width:100%;height:220px;object-fit:cover;object-position:center top;display:block;pointer-events:none;-webkit-user-drag:none"
      draggable="false"
      onerror="if(this.src!=='${fallbackUrl}'){this.src='${fallbackUrl}'}">
      <div style="position:absolute;bottom:6px;right:8px;background:rgba(0,0,0,.5);border-radius:6px;padding:3px 7px;font-size:11px;color:#fff;pointer-events:none"><svg viewBox="0 0 24 24" fill="none" class="inline-ic" style="width:12px;height:12px"><circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" stroke-width="2"/><path d="M19.5 19.5l-4.3-4.3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg> Ver</div>`;
    el._driveImgUrl = imgUrl;
    el._driveFileId = fileId;
    return;
  }

  try {
    const q = encodeURIComponent(`name = '${fileName}' and trashed = false`);
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,thumbnailLink,webContentLink)&pageSize=1`,
      { headers: { 'Authorization': 'Bearer ' + accessToken } }
    );
    if (!res.ok) throw new Error('Error Drive ' + res.status);
    const data = await res.json();
    if (!data.files || data.files.length === 0) {
      el.innerHTML = `<span style="color:#64748b;font-size:12px;padding:12px"><svg viewBox="0 0 24 24" fill="none" class="inline-ic" style="width:13px;height:13px"><path d="M4 8a1 1 0 0 1 1-1h2l1.2-2h7.6L17 7h2a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="12" cy="13" r="3.4" stroke="currentColor" stroke-width="1.7"/></svg> ${fileName}</span>`;
      return;
    }
        const file = data.files[0];
    // uc?export=view = bytes crudos del archivo, sin overlay de Drive posible
    const imgUrl = `https://drive.google.com/uc?export=view&id=${file.id}`;
    const fallbackUrl = file.thumbnailLink
      ? file.thumbnailLink.replace(/=s\d+$/, '=s800')
      : `https://lh3.googleusercontent.com/d/${file.id}`;
    el.style.position = 'relative';
    el.innerHTML = `<img src="${imgUrl}" alt="Foto referencia"
      style="width:100%;height:220px;object-fit:cover;object-position:center top;display:block;cursor:pointer"
      onclick="invAbrirFotoModal('${fileName}')"
      onerror="if(this.src!=='${fallbackUrl}'){this.src='${fallbackUrl}';return};this.parentElement.innerHTML='<span style=color:#64748b;font-size:12px;padding:12px>Sin imagen</span>'">
      <div style="position:absolute;bottom:6px;right:8px;background:rgba(0,0,0,.5);border-radius:6px;padding:3px 7px;font-size:11px;color:#fff"><svg viewBox="0 0 24 24" fill="none" class="inline-ic" style="width:12px;height:12px"><circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" stroke-width="2"/><path d="M19.5 19.5l-4.3-4.3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg> Ver</div>`;
    el._driveFileId = file.id;
  } catch(e) {
    console.warn('[FOTO THUMB]', e.message);
    el.innerHTML = `<span style="color:#64748b;font-size:12px;padding:12px"><svg viewBox="0 0 24 24" fill="none" class="inline-ic" style="width:13px;height:13px"><path d="M4 8a1 1 0 0 1 1-1h2l1.2-2h7.6L17 7h2a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><circle cx="12" cy="13" r="3.4" stroke="currentColor" stroke-width="1.7"/></svg> ${fileName}</span>`;
  }
}

// Modal simple para URLs directas
function invAbrirFotoModalUrl(imgUrl) {
  let modal = document.getElementById('foto-modal-overlay');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'foto-modal-overlay';
    modal.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.92);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;';
    modal.innerHTML = `
      <button onclick="invCerrarFotoModal()" style="position:absolute;top:16px;right:16px;background:rgba(255,255,255,.15);border:none;border-radius:50%;width:40px;height:40px;font-size:22px;color:#fff;cursor:pointer">✕</button>
      <img id="foto-modal-img" src="" alt="Foto" style="max-width:100%;max-height:88vh;object-fit:contain;border-radius:12px">
    `;
    modal.addEventListener('click', e => { if (e.target === modal) invCerrarFotoModal(); });
    document.body.appendChild(modal);
  }
  modal.style.display = 'flex';
  const img = document.getElementById('foto-modal-img');
  if (img) img.src = imgUrl;
}


// ── Modal foto pantalla completa ───────────────────────────────
async function invAbrirFotoModal(fileName) {
  // Si recibe URL directa, delegar a invAbrirFotoModalUrl
  if (fileName && fileName.startsWith('http')) {
    const mPath  = fileName.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    const mQuery = fileName.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    const fileId = (mPath && mPath[1]) || (mQuery && mQuery[1]);
    const url = fileId
      ? `https://drive.google.com/thumbnail?id=${fileId}&sz=w1600`
      : fileName;
    invAbrirFotoModalUrl(url);
    return;
  }

  // Crear modal si no existe
  let modal = document.getElementById('foto-modal-overlay');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'foto-modal-overlay';
    modal.style.cssText = `
      position:fixed;inset:0;z-index:9999;
      background:rgba(0,0,0,.92);
      display:flex;flex-direction:column;align-items:center;justify-content:center;
      padding:16px;box-sizing:border-box;
    `;
    modal.innerHTML = `
      <button id="foto-modal-close" onclick="invCerrarFotoModal()" style="
        position:absolute;top:16px;right:16px;
        background:rgba(255,255,255,.15);border:none;border-radius:50%;
        width:40px;height:40px;font-size:22px;color:#fff;cursor:pointer;
        display:flex;align-items:center;justify-content:center;line-height:1
      ">✕</button>
      <div id="foto-modal-spinner" style="color:#64748b;font-size:14px">Cargando imagen...</div>
      <img id="foto-modal-img" src="" alt="Foto"
        style="max-width:100%;max-height:88vh;object-fit:contain;border-radius:12px;display:none">
      <div id="foto-modal-name" style="color:#94a3b8;font-size:11px;margin-top:10px;text-align:center;word-break:break-all"></div>
    `;
    modal.addEventListener('click', function(e) {
      if (e.target === modal) invCerrarFotoModal();
    });
    document.body.appendChild(modal);
  }

  // Mostrar modal con spinner
  modal.style.display = 'flex';
  document.getElementById('foto-modal-spinner').style.display = 'block';
  const imgEl = document.getElementById('foto-modal-img');
  imgEl.style.display = 'none';
  imgEl.src = '';
  document.getElementById('foto-modal-name').textContent = fileName;
  document.body.style.overflow = 'hidden';

  try {
    const q = encodeURIComponent(`name = '${fileName}' and trashed = false`);
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,thumbnailLink)&pageSize=1`,
      { headers: { 'Authorization': 'Bearer ' + accessToken } }
    );
    const data = res.ok ? await res.json() : { files: [] };
    if (data.files && data.files.length > 0) {
      const f = data.files[0];
      const url = f.thumbnailLink
        ? f.thumbnailLink.replace('=s220', '=s1600')
        : `https://drive.google.com/thumbnail?id=${f.id}&sz=w1600`;
      imgEl.onload = () => {
        document.getElementById('foto-modal-spinner').style.display = 'none';
        imgEl.style.display = 'block';
      };
      imgEl.onerror = () => {
        document.getElementById('foto-modal-spinner').textContent = '⚠️ No se pudo cargar la imagen';
      };
      imgEl.src = url;
    } else {
      document.getElementById('foto-modal-spinner').textContent = '⚠️ Archivo no encontrado en Drive';
    }
  } catch(e) {
    document.getElementById('foto-modal-spinner').textContent = '⚠️ Error: ' + e.message;
  }
}

function invCerrarFotoModal() {
  const modal = document.getElementById('foto-modal-overlay');
  if (modal) modal.style.display = 'none';
  document.body.style.overflow = '';
}

// Abre la carpeta Drive del ítem actual (HOJA/CODIGO/)
async function invAbrirCarpetaDrive() {
  if (!invItem) return;
  toast('Buscando carpeta en Drive...');
  try {
    await ensureToken();
    const codigo = invItem.codigo || invItem.num || '';
    const sheetName = invItem._modulo === 'generadores' ? SHEET_GENERADORES
                    : invItem._modulo === 'maqmenor'    ? SHEET_MAQ_MENOR
                    : SHEET_HERRAMIENTAS;

    // Buscar carpeta de la hoja dentro de DRIVE_INV_FOLDER
    const q1 = encodeURIComponent(`'${DRIVE_INV_FOLDER}' in parents and name='${sheetName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
    const r1  = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q1}&fields=files(id)`, { headers: { Authorization: 'Bearer ' + accessToken } });
    const d1  = await r1.json();
    if (!d1.files || !d1.files.length) {
      // Carpeta de hoja no existe aún → abrir carpeta raíz de inventario
      window.open(`https://drive.google.com/drive/folders/${DRIVE_INV_FOLDER}`, '_blank');
      return;
    }
    const sheetFolderId = d1.files[0].id;

    // Buscar subcarpeta del código dentro de la carpeta de la hoja
    const q2 = encodeURIComponent(`'${sheetFolderId}' in parents and name='${codigo}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
    const r2  = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q2}&fields=files(id)`, { headers: { Authorization: 'Bearer ' + accessToken } });
    const d2  = await r2.json();
    if (d2.files && d2.files.length) {
      window.open(`https://drive.google.com/drive/folders/${d2.files[0].id}`, '_blank');
    } else {
      // Subcarpeta no existe aún → abrir carpeta de la hoja
      window.open(`https://drive.google.com/drive/folders/${sheetFolderId}`, '_blank');
    }
  } catch(e) {
    toast('Error abriendo Drive: ' + e.message, 'error');
  }
}

// ── Panel editar ítem inventario ──────────────────────────────
function invAbrirEditar() {
  if (!invItem) return;
  const item = invItem;
  const modulo = item._modulo;

  document.getElementById('inv-edit-row').value    = item.rowIndex;
  document.getElementById('inv-edit-modulo').value = modulo;

  // Estado: select con opciones comunes
  const sel = document.getElementById('inv-edit-estado');
  sel.value = item.estado;
  if (!sel.value) {
    const opt = document.createElement('option');
    opt.value = item.estado; opt.textContent = item.estado;
    sel.appendChild(opt); sel.value = item.estado;
  }

  document.getElementById('inv-edit-ubicacion').value = item.ubicacion || '';
  _precargarColor('inv-edit-color', item.color || '');
  document.getElementById('inv-edit-obs').value        = item.obs || '';

  // Limpiar foto nueva pendiente
  _invFotoRef = null;
  _invFotoQuitar = false;
  const prevNew = document.getElementById('inv-edit-foto-preview');
  const prevImg = document.getElementById('inv-edit-foto-preview-img');
  if (prevNew) { prevNew.style.display = 'none'; }
  if (prevImg) prevImg.src = '';

  // Mostrar foto actual si existe
  const fotoActual = item.foto || '';
  const actWrap = document.getElementById('inv-edit-foto-actual');
  const actImg  = document.getElementById('inv-edit-foto-actual-img');
  const actInfo = document.getElementById('inv-edit-foto-actual-info');
  const remBtn  = document.getElementById('inv-edit-foto-remove');
  if (fotoActual && actWrap && actImg) {
    // Construir URL thumbnail si es un file ID de Drive o nombre de archivo
    const fotoUrl = fotoActual.startsWith('http')
      ? fotoActual
      : `https://drive.google.com/thumbnail?id=${fotoActual}&sz=w400`;
    actImg.src = fotoUrl;
    actImg.onerror = () => { actWrap.style.display = 'none'; };
    actWrap.style.display = 'block';
    if (actInfo) actInfo.textContent = 'Foto actual guardada';
    if (remBtn) remBtn.style.display = 'block';
  } else {
    if (actWrap) actWrap.style.display = 'none';
    if (remBtn) remBtn.style.display = 'none';
  }

  openPanel('panel-inv-edit');
}

// Foto de referencia para edición inventario
let _invFotoRef = null;
let _invFotoQuitar = false;

function quitarInvFoto() {
  _invFotoQuitar = true;
  _invFotoRef = null;
  const actWrap = document.getElementById('inv-edit-foto-actual');
  const remBtn  = document.getElementById('inv-edit-foto-remove');
  if (actWrap) actWrap.style.display = 'none';
  if (remBtn) remBtn.style.display = 'none';
  const prevNew = document.getElementById('inv-edit-foto-preview');
  if (prevNew) prevNew.style.display = 'none';
  toast('Foto se eliminará al guardar');
}

function onInvFotoSelected(input) {
  if (!input.files || !input.files.length) return;
  const file = input.files[0];
  const reader = new FileReader();
  reader.onload = () => {
    _invFotoRef = {
      b64:        reader.result.split(',')[1],
      name:       file.name,
      mimeType:   file.type || 'image/jpeg',
      previewUrl: reader.result,
    };
    _invFotoQuitar = false;
    const prevWrap = document.getElementById('inv-edit-foto-preview');
    const prevImg  = document.getElementById('inv-edit-foto-preview-img');
    if (prevImg) prevImg.src = reader.result;
    if (prevWrap) prevWrap.style.display = 'block';
    // Ocultar foto actual mientras hay nueva seleccionada
    const actWrap = document.getElementById('inv-edit-foto-actual');
    if (actWrap) actWrap.style.display = 'none';
  };
  reader.readAsDataURL(file);
  input.value = '';
}

async function invGuardar() {
  const row    = parseInt(document.getElementById('inv-edit-row').value);
  const modulo = document.getElementById('inv-edit-modulo').value;
  const estado = document.getElementById('inv-edit-estado').value;
  const ubic   = document.getElementById('inv-edit-ubicacion').value;
  const color  = _valorColor('inv-edit-color');
  const obs    = document.getElementById('inv-edit-obs').value;

  if (!row) return;

  const btn = document.querySelector('#panel-inv-edit .pnl-action');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }

  try {
    // Mapeo de columnas por módulo
    // Generadores:  I=estado(9) J=ubicacion(10) G=color(7) N=obs(14) O=imagen(15)
    // Maq. Menor:   H=estado(8) I=ubicacion(9)  G=color(7) J=obs(10) C=foto(3)
    // Herramientas: H=estado(8) I=ubicacion(9)  G=color(7) L=obs(12) C=registro(3)
    let colEstado, colUbic, colColor, colObs, colFoto, sheetName;

    if (modulo === 'generadores') {
      colEstado = 'I'; colUbic = 'J'; colColor = 'G'; colObs = 'N'; colFoto = 'O';
      sheetName = SHEET_GENERADORES;
    } else if (modulo === 'maqmenor') {
      colEstado = 'H'; colUbic = 'I'; colColor = 'G'; colObs = 'J'; colFoto = 'C';
      sheetName = SHEET_MAQ_MENOR;
    } else {
      colEstado = 'H'; colUbic = 'I'; colColor = 'G'; colObs = 'L'; colFoto = 'C';
      sheetName = SHEET_HERRAMIENTAS;
    }

    toast('Guardando...');
    await Promise.all([
      writeSheet(`'${sheetName}'!${colEstado}${row}`, [[estado]]),
      writeSheet(`'${sheetName}'!${colUbic}${row}`,   [[ubic]]),
      writeSheet(`'${sheetName}'!${colColor}${row}`,  [[color]]),
      writeSheet(`'${sheetName}'!${colObs}${row}`,    [[obs]]),
    ]);

    // Quitar foto si se marcó
    if (_invFotoQuitar) {
      await writeSheet(`'${sheetName}'!${colFoto}${row}`, [['']] );
      _invFotoQuitar = false;
    }

    // Subir foto de referencia si hay una nueva
    if (_invFotoRef) {
      if (btn) btn.textContent = 'Subiendo foto...';
      toast('Subiendo foto de referencia...');
      try {
        const codigo = invItem.codigo || invItem.num || row;
        // Estructura: DRIVE_INV_FOLDER / [HOJA] / [CODIGO] /
        let folderId = DRIVE_INV_FOLDER;
        try {
          const sheetFolder = await findOrCreateFolder(sheetName, DRIVE_INV_FOLDER);
          folderId = await findOrCreateFolder(codigo, sheetFolder);
        } catch(fe) { console.warn('[INV FOTO] Carpeta fallback:', fe.message); }

        const ext      = _invFotoRef.name.split('.').pop() || 'jpg';
        const fileName = `REF_${codigo}_${sheetName.replace(/ /g,'_')}_${new Date().toLocaleDateString('es-CL').replace(/\//g,'-')}.${ext}`;
        const boundary = 'lst_inv_' + Date.now();
        const metadata = JSON.stringify({ name: fileName, parents: [folderId] });
        const body = [
          '--' + boundary,
          'Content-Type: application/json; charset=UTF-8',
          '',
          metadata,
          '--' + boundary,
          'Content-Type: ' + _invFotoRef.mimeType,
          'Content-Transfer-Encoding: base64',
          '',
          _invFotoRef.b64,
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

        if (res.ok) {
          const result = await res.json();
          // Guardar nombre de archivo en la columna de foto
          await writeSheet(`'${sheetName}'!${colFoto}${row}`, [[result.name]]);
          toast('Foto subida ✓');
        } else {
          const err = await res.text();
          console.error('[INV FOTO] Error:', err);
          toast('Foto no se pudo subir: ' + res.status, 'error');
        }
      } catch(fe) {
        console.error('[INV FOTO] Error:', fe.message);
        toast('Error subiendo foto: ' + fe.message, 'error');
      }
    }

    toast('Guardado ✓');
    _origClosePanel('panel-inv-edit'); 
    const idx1 = _panelStack.lastIndexOf('panel-inv-edit');
    if (idx1 !== -1) _panelStack.splice(idx1, 1);

    // Recargar solo los datos de inventario
    await loadInventario();

    // Actualizar el ítem en memoria y volver a mostrar el detalle
    const datosNew = modulo === 'generadores' ? allGeneradores
                   : modulo === 'maqmenor'    ? allMaqMenor
                   : allHerramientas;
    const updated = datosNew.find(i => i.rowIndex === row);
    if (updated) {
      invItem = { ...updated, _modulo: modulo };
      invAbrirDetalle(modulo, row);
      const idxD = _panelStack.lastIndexOf('panel-inv-detalle');
      if (idxD !== -1) _panelStack.splice(idxD, 1);
    }
    renderInvLista();

  } catch(err) {
    toast('Error: ' + err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Guardar'; }
  }
}

// ── Evento generador ──────────────────────────────────────────
let _genEventoFotos = [];

function invAbrirEventoGen() {
  if (!invItem || invItem._modulo !== 'generadores') return;

  document.getElementById('gen-evento-codigo').value = invItem.codigo || '';
  document.getElementById('gen-evento-nombre').textContent =
    [invItem.marca, invItem.modelo].filter(Boolean).join(' ') || invItem.equipo;
  document.getElementById('gen-evento-fecha').value     = new Date().toISOString().slice(0,10);
  document.getElementById('gen-evento-horometro').value = '';
  document.getElementById('gen-evento-obs').value       = '';
  _genEventoFotos = [];
  renderGenEventoFotos();

  const tipo = document.getElementById('gen-evento-tipo');
  tipo.value = 'Mantención preventiva';

  openPanel('panel-gen-evento');
}

function onGenEventoFotosSelected(input) {
  if (!input.files || !input.files.length) return;
  Array.from(input.files).forEach(file => {
    const reader = new FileReader();
    reader.onload = () => {
      _genEventoFotos.push({
        b64: reader.result.split(',')[1],
        name: file.name, mimeType: file.type || 'image/jpeg',
        previewUrl: reader.result,
      });
      renderGenEventoFotos();
    };
    reader.readAsDataURL(file);
  });
  input.value = '';
}

function renderGenEventoFotos() {
  const c = document.getElementById('gen-evento-fotos-preview');
  const cnt = document.getElementById('gen-evento-fotos-count');
  if (!c) return;
  if (_genEventoFotos.length === 0) { c.innerHTML = ''; if (cnt) cnt.textContent = ''; return; }
  if (cnt) cnt.textContent = `${_genEventoFotos.length} foto(s) seleccionada(s)`;
  c.innerHTML = _genEventoFotos.map((f,i) => `
    <div class="foto-thumb-wrap">
      <img src="${f.previewUrl}" class="foto-thumb">
      <button class="foto-thumb-del" onclick="eliminarGenFoto(${i})">✕</button>
    </div>`).join('');
}

function eliminarGenFoto(i) { _genEventoFotos.splice(i,1); renderGenEventoFotos(); }

async function invGuardarEventoGen() {
  const codigo    = document.getElementById('gen-evento-codigo').value;
  const fecha     = document.getElementById('gen-evento-fecha').value;
  const tipo      = document.getElementById('gen-evento-tipo').value;
  const horometro = document.getElementById('gen-evento-horometro').value;
  const obs       = document.getElementById('gen-evento-obs').value;

  if (!codigo || !fecha) { toast('Completa los campos obligatorios', 'error'); return; }

  const btn = document.querySelector('#panel-gen-evento .pnl-action');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }

  try {
    // Subir fotos
    const fotosSubidas = [];
    if (_genEventoFotos.length > 0) {
      let folderId = DRIVE_INV_FOLDER;
      try { folderId = await findOrCreateFolder('Generadores_Eventos', DRIVE_INV_FOLDER); } catch(e) {}

      const fechaStr   = new Date().toLocaleDateString('es-CL').replace(/\//g,'-');
      const prefixBase = `EVT_GEN_${tipo.replace(/[\s\/]/g,'_')}`;

      for (let i = 0; i < _genEventoFotos.length; i++) {
        const foto = _genEventoFotos[i];
        if (btn) btn.textContent = `Subiendo foto ${i+1}/${_genEventoFotos.length}...`;
        try {
          const ext      = foto.name.split('.').pop() || 'jpg';
          const suffix   = _genEventoFotos.length > 1 ? `_${i+1}` : '';
          const fileName = `${prefixBase}${suffix}_${codigo}_${fechaStr}.${ext}`;
          const boundary = 'lst_gen_' + Date.now() + '_' + i;
          const metadata = JSON.stringify({ name: fileName, parents: [folderId] });
          const body = ['--'+boundary,'Content-Type: application/json; charset=UTF-8','',metadata,'--'+boundary,'Content-Type: '+foto.mimeType,'Content-Transfer-Encoding: base64','',foto.b64,'--'+boundary+'--'].join('\r\n');
          const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
            method: 'POST', headers: { 'Authorization': 'Bearer '+accessToken, 'Content-Type': 'multipart/related; boundary='+boundary }, body,
          });
          if (res.ok) { const r = await res.json(); fotosSubidas.push(r.name || fileName); }
        } catch(fe) { console.error('[GEN EVT FOTO]', fe.message); }
      }
    }

    const fechaReg = "'" + new Date().toLocaleDateString('es-CL');
    const fechaFmt = "'" + fecha.split('-').reverse().join('/');
    const gen = allGeneradores.find(g => g.codigo === codigo);
    const nombreGen = gen ? [gen.marca, gen.modelo].filter(Boolean).join(' ') || gen.equipo : codigo;

    // Guardar en hoja MANTENCIONES_GEN
    // Columnas: A=FECHA_REG B=CODIGO C=EQUIPO D=HOROMETRO E=TIPO F=DESC G=FECHA_EVT H=FOTO
    await appendSheet(`'${SHEET_GEN_EVENTOS}'!A:H`, [[
      fechaReg, codigo, nombreGen, horometro, tipo, obs, fechaFmt, fotosSubidas.join(' | ')
    ]]);

    // Si mantención preventiva: actualizar horómetro/próxima en hoja GENERADORES
    if (gen && tipo === 'Mantención preventiva') {
      const writes = [];
      if (horometro) writes.push(writeSheet(`'${SHEET_GENERADORES}'!K${gen.rowIndex}`, [[horometro]]));
      await Promise.all(writes);
    }

    toast('Evento registrado ✓');
    _genEventoFotos = [];
    _origClosePanel('panel-gen-evento'); 
    const idx = _panelStack.lastIndexOf('panel-gen-evento');
    if (idx !== -1) _panelStack.splice(idx, 1);
    await loadInventario();
    renderInvLista();
    // Refrescar detalle
    if (invItem) invAbrirDetalle(invItem._modulo, invItem.rowIndex);

  } catch(err) {
    toast('Error: ' + err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Guardar'; }
  }
}

// ── Containers ────────────────────────────────────────────────
let contItem = null;
let _contFoto = null;

function renderContainers() {
  const searchEl = document.getElementById('cont-search');
  const txt = searchEl ? searchEl.value.toLowerCase() : '';

  const filtrados = allContainers.filter(c => {
    if (!txt) return true;
    return (c.tipo+c.ubicacion+c.estado+c.obs+'').toLowerCase().includes(txt);
  }).sort((a, b) => {
    const cmp = (a.tipo||'').localeCompare(b.tipo||'', 'es');
    if (cmp !== 0) return cmp;
    return (parseInt(a.num)||0) - (parseInt(b.num)||0);
  });

  const html = filtrados.map(c => {
    const icon = invIcono(c.tipo);
    const cls  = c.estado === 'REGULAR' ? 'amber' : c.estado === 'INCOMPLETO' ? 'red' : 'green';
    const borderCls = c.estado === 'REGULAR' ? 'card--obs' : c.estado === 'INCOMPLETO' ? 'card--det' : 'card--op';
    const key = `cont:${c.rowIndex}`;
    const checked = _contSeleccion.has(key);
    const onclickAttr = _contModoSeleccion
      ? `contToggleItemSeleccion(${c.rowIndex})`
      : `contAbrirDetalle(${c.rowIndex})`;
    return `<div class="card ${borderCls}" onclick="${onclickAttr}">
      ${_contModoSeleccion ? `<div class="card-checkbox ${checked?'checked':''}">${checked?'✓':''}</div>` : ''}
      <div class="card-icon" style="font-size:22px">${icon}</div>
      <div class="card-body">
        <div class="card-title">N° ${c.num} · ${c.tipo}</div>
        <div class="card-sub">${c.medidas}${c.equipamiento&&c.equipamiento!=='-'?' · '+c.equipamiento:''}</div>
      </div>
      <div class="card-right">
        <span class="badge ${cls}">${c.estado||'Sin estado'}</span>
        <span style="font-size:11px;color:#aaa">${c.ubicacion||'—'}</span>
      </div>
    </div>`;
  }).join('') || emptyState('Sin resultados','Probá con otro filtro o búsqueda');

  const lista   = document.getElementById('cont-lista');
  const listaDt = document.getElementById('cont-dt-lista');
  if (lista)   lista.innerHTML   = html;
  if (listaDt) listaDt.innerHTML = html;

  // Stats móvil y desktop
  const total   = allContainers.length;
  const bodegas  = allContainers.filter(c => c.tipo.toLowerCase().includes('bodega')).length;
  const oficinas = allContainers.filter(c => c.tipo.toLowerCase().includes('oficina')).length;
  const el = id => document.getElementById(id);
  ['cont-stat-total','cont-dt-stat-total'].forEach(id     => { if (el(id)) el(id).textContent = total; });
  ['cont-stat-bodega','cont-dt-stat-bodega'].forEach(id   => { if (el(id)) el(id).textContent = bodegas; });
  ['cont-stat-oficina','cont-dt-stat-oficina'].forEach(id => { if (el(id)) el(id).textContent = oficinas; });
}

function contAbrirDetalle(rowIndex) {
  const c = allContainers.find(i => i.rowIndex === rowIndex);
  if (!c) return;
  contItem = c;

  const icon = invIcono(c.tipo);
  const cls  = c.estado === 'REGULAR' ? 'amber' : c.estado === 'INCOMPLETO' ? 'red' : 'green';

  document.getElementById('cont-detalle-body').innerHTML = `
    <div class="ficha-hero">
      <div class="ficha-hero-icon" style="font-size:36px">${icon}</div>
      <div class="ficha-hero-info">
        <div class="ficha-hero-type">${c.tipo}</div>
        <div class="ficha-hero-name">Container N° ${c.num}</div>
        <span class="badge ${cls}" style="margin-top:6px;display:inline-block">${c.estado||'Sin estado'}</span>
      </div>
    </div>

    <div class="ficha-section">
      <div class="ficha-sec-title">Información</div>
      <div class="field-row"><span class="fl">Ubicación</span><span class="fv">${c.ubicacion||'—'}</span></div>
      <div class="field-row"><span class="fl">Medidas</span><span class="fv">${c.medidas||'—'}</span></div>
      <div class="field-row"><span class="fl">Color</span><span class="fv">${c.color||'—'}</span></div>
      ${c.equipamiento&&c.equipamiento!=='-'?`<div class="field-row"><span class="fl">Equipamiento</span><span class="fv">${c.equipamiento}</span></div>`:''}
      ${c.fecha&&c.fecha!=='-'?`<div class="field-row"><span class="fl">Fecha arribo</span><span class="fv">${c.fecha}</span></div>`:''}
      ${c.obs?`<div class="ficha-obs"><svg viewBox="0 0 24 24" fill="none" class="inline-ic"><path d="M12 3 3 19h18Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M12 10v3.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="16.3" r="0.9" fill="currentColor"/></svg> ${c.obs}</div>`:''}
    </div>

    ${c.foto?`
    <div class="ficha-section">
      <div class="ficha-sec-title">Foto de referencia</div>
      <div style="padding:8px 0" onclick="${c.foto.startsWith('http') ? `invAbrirFotoModalUrl('${c.foto.replace(/'/g,"\\'")}')` : `invAbrirFotoModal('${c.foto.replace(/'/g,"\\'")}')` }">
        <div id="cont-foto-thumb-${c.rowIndex}" style="background:#1e293b;border-radius:10px;overflow:hidden;cursor:pointer;position:relative;min-height:60px;display:flex;align-items:center;justify-content:center">
          <span style="color:#64748b;font-size:13px;padding:12px">⏳ Cargando foto...</span>
        </div>
      </div>
    </div>`:''}

    ${_renderHistorialMovimientos(String(c.num || c.rowIndex))}

    <button class="action-btn" onclick="contAbrirEditar()" style="margin-top:8px"><svg viewBox="0 0 24 24" fill="none" class="inline-ic"><path d="M4 20l1-4 11-11 3 3-11 11Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M14 7l3 3" stroke="currentColor" stroke-width="1.7"/></svg> Editar información</button>
  `;

  openPanel('panel-cont-detalle');

  // Cargar miniatura si hay foto
  if (c.foto) {
    invCargarMiniatura(c.foto, `cont-foto-thumb-${c.rowIndex}`);
  }
}

function contAbrirEditar() {
  if (!contItem) return;
  const c = contItem;

  document.getElementById('cont-edit-row').value    = c.rowIndex;
  document.getElementById('cont-edit-estado').value = c.estado;
  document.getElementById('cont-edit-ubicacion').value = c.ubicacion || '';
  _precargarColor('cont-edit-color', c.color || '');
  document.getElementById('cont-edit-equip').value     = c.equipamiento !== '-' ? c.equipamiento : '';
  document.getElementById('cont-edit-obs').value        = c.obs || '';
  _contFoto = null;
  document.getElementById('cont-edit-foto-preview').innerHTML = '';
  document.getElementById('cont-edit-foto-preview').style.display = 'none';

  openPanel('panel-cont-edit');
}

function onContFotoSelected(input) {
  if (!input.files || !input.files.length) return;
  const file = input.files[0];
  const reader = new FileReader();
  reader.onload = () => {
    _contFoto = { b64: reader.result.split(',')[1], name: file.name, mimeType: file.type || 'image/jpeg', previewUrl: reader.result };
    const prev = document.getElementById('cont-edit-foto-preview');
    prev.style.display = 'block';
    prev.innerHTML = `<img src="${reader.result}" style="width:100%;max-height:160px;object-fit:cover;border-radius:10px;margin-top:8px">`;
  };
  reader.readAsDataURL(file);
  input.value = '';
}

// Foto de referencia al crear un container nuevo
let _contNuevoFoto = null;
function onContNuevoFotoSelected(input) {
  if (!input.files || !input.files.length) return;
  const file = input.files[0];
  const reader = new FileReader();
  reader.onload = () => {
    _contNuevoFoto = { b64: reader.result.split(',')[1], name: file.name, mimeType: file.type || 'image/jpeg', previewUrl: reader.result };
    const prev = document.getElementById('cont-nuevo-foto-preview');
    prev.style.display = 'block';
    prev.innerHTML = `<img src="${reader.result}" style="width:100%;max-height:160px;object-fit:cover;border-radius:10px">`;
  };
  reader.readAsDataURL(file);
  input.value = '';
}

async function contGuardar() {
  const row    = parseInt(document.getElementById('cont-edit-row').value);
  const estado = document.getElementById('cont-edit-estado').value;
  const ubic   = document.getElementById('cont-edit-ubicacion').value;
  const color  = _valorColor('cont-edit-color');
  const equip  = document.getElementById('cont-edit-equip').value;
  const obs    = document.getElementById('cont-edit-obs').value;
  if (!row) return;

  const btn = document.querySelector('#panel-cont-edit .pnl-action');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }

  try {
    // Containers: E=estado(5) F=color(6) G=ubicacion(7) I=equipamiento(9) J=obs(10) C=foto(3)
    toast('Guardando...');
    await Promise.all([
      writeSheet(`'${SHEET_CONTAINERS}'!E${row}`, [[estado]]),
      writeSheet(`'${SHEET_CONTAINERS}'!F${row}`, [[color]]),
      writeSheet(`'${SHEET_CONTAINERS}'!G${row}`, [[ubic]]),
      writeSheet(`'${SHEET_CONTAINERS}'!I${row}`, [[equip]]),
      writeSheet(`'${SHEET_CONTAINERS}'!J${row}`, [[obs]]),
    ]);

    if (_contFoto) {
      if (btn) btn.textContent = 'Subiendo foto...';
      toast('Subiendo foto...');
      try {
        let folderId = DRIVE_INV_FOLDER;
        try { folderId = await findOrCreateFolder('Containers', DRIVE_INV_FOLDER); } catch(fe) {}
        const ext      = _contFoto.name.split('.').pop() || 'jpg';
        const fileName = `CONT_${contItem.num}_${new Date().toLocaleDateString('es-CL').replace(/\//g,'-')}.${ext}`;
        const boundary = 'lst_cont_' + Date.now();
        const metadata = JSON.stringify({ name: fileName, parents: [folderId] });
        const body = ['--'+boundary,'Content-Type: application/json; charset=UTF-8','',metadata,'--'+boundary,'Content-Type: '+_contFoto.mimeType,'Content-Transfer-Encoding: base64','',_contFoto.b64,'--'+boundary+'--'].join('\r\n');
        const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
          method:'POST', headers:{'Authorization':'Bearer '+accessToken,'Content-Type':'multipart/related; boundary='+boundary}, body,
        });
        if (res.ok) {
          const r = await res.json();
          await writeSheet(`'${SHEET_CONTAINERS}'!C${row}`, [[r.name]]);
          toast('Foto subida ✓');
        }
      } catch(fe) { toast('Error foto: '+fe.message, 'error'); }
    }

    toast('Guardado ✓');
    _origClosePanel('panel-cont-edit'); 
    const idx = _panelStack.lastIndexOf('panel-cont-edit');
    if (idx !== -1) _panelStack.splice(idx, 1);
    await loadInventario();
    renderContainers();
    const c = allContainers.find(i => i.rowIndex === row);
    if (c) { contItem = c; contAbrirDetalle(row); const idxD = _panelStack.lastIndexOf('panel-cont-detalle'); if (idxD !== -1) _panelStack.splice(idxD, 1); }

  } catch(err) {
    toast('Error: ' + err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Guardar'; }
  }
}

// ── Navegación módulos ────────────────────────────────────────
// Muestra u oculta el sidebar de Flota (solo en desktop)
function _setDesktopSidebarFlota(visible) {
  const esDesktop = window.innerWidth >= 900;
  if (!esDesktop) return;
  const s = document.getElementById('desktop-sidebar');
  const m = document.getElementById('desktop-main');
  if (visible) {
    if (s) s.classList.remove('dt-oculto');
    if (m) m.classList.remove('dt-oculto');
  } else {
    if (s) s.classList.add('dt-oculto');
    if (m) m.classList.add('dt-oculto');
  }
}

// ══ TRANSICIÓN DE NAVEGACIÓN (push/pop simple, una sola pantalla en movimiento) ═══════
// PG_ANIM_MS debe ser >= la duración CSS más larga (enter: 250ms, exit: 220ms)
const PG_ANIM_MS = 260;
const PG_CONTAINERS = ['modulos-home', 'main', 'mod-inventario', 'mod-containers', 'mod-movimientos', 'mod-andamios'];
let _pgTimeoutId = null;
let _pgAnimEl    = null; // elemento que está animando actualmente
let _pgOnEnd     = null; // listener transitionend activo

// Limpia clases de animación de todos los contenedores
function _pgClearAnimClasses() {
  PG_CONTAINERS.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('pg-push-enter', 'pg-push-enter-active', 'pg-pop-exit-active');
  });
}

// Cancela completamente cualquier animación en curso y deja el DOM limpio
function _pgAbortAnim() {
  if (_pgTimeoutId) { clearTimeout(_pgTimeoutId); _pgTimeoutId = null; }
  if (_pgAnimEl && _pgOnEnd) {
    _pgAnimEl.removeEventListener('transitionend', _pgOnEnd);
    _pgAnimEl.style.willChange  = '';
    _pgAnimEl.style.pointerEvents = '';
    _pgAnimEl = null;
    _pgOnEnd  = null;
  }
  _pgClearAnimClasses();
}

function _pgTransition(saliente, entrante, direccion) {
  if (!entrante) return;

  // Cancelar animación anterior y dejar DOM limpio
  _pgAbortAnim();

  // Desktop o misma pantalla: cambio instantáneo, sin animación
  if (window.innerWidth >= 900 || !saliente || saliente === entrante) {
    PG_CONTAINERS.forEach(id => {
      const el = document.getElementById(id);
      if (el && el !== entrante) el.classList.add('hidden');
    });
    entrante.classList.remove('hidden');
    return;
  }

  // Ocultar pantallas que no participan en esta transición
  PG_CONTAINERS.forEach(id => {
    const el = document.getElementById(id);
    if (el && el !== saliente && el !== entrante) el.classList.add('hidden');
  });

  entrante.classList.remove('hidden');
  saliente.classList.remove('hidden');

  // GPU layer solo en el elemento que anima — evita presión de memoria
  const animEl = direccion === 'forward' ? entrante : saliente;
  animEl.style.willChange    = 'transform';
  animEl.style.pointerEvents = 'none'; // bloquear taps durante la animación
  _pgAnimEl = animEl;

  // Cleanup preciso al terminar (transitionend es exacto, sin lag de setTimeout)
  _pgOnEnd = () => {
    animEl.style.willChange    = '';
    animEl.style.pointerEvents = '';
    saliente.classList.add('hidden');
    _pgClearAnimClasses();
    _pgAnimEl = null;
    _pgOnEnd  = null;
    if (_pgTimeoutId) { clearTimeout(_pgTimeoutId); _pgTimeoutId = null; }
  };
  animEl.addEventListener('transitionend', _pgOnEnd, { once: true });

  // Fallback: por si transitionend no dispara (edge case en algunos browsers)
  _pgTimeoutId = setTimeout(_pgOnEnd, PG_ANIM_MS + 80);

  if (direccion === 'forward') {
    // Doble rAF: el browser registra translateX(100%) en un frame y en el siguiente
    // ya tiene el punto de partida para interpolar → transición garantizada sin reflow síncrono
    entrante.classList.add('pg-push-enter');
    requestAnimationFrame(() => requestAnimationFrame(() => {
      entrante.classList.remove('pg-push-enter');
      entrante.classList.add('pg-push-enter-active');
    }));
  } else {
    // Back: un rAF para que el browser vea el estado inicial antes de añadir la clase de salida
    requestAnimationFrame(() => {
      saliente.classList.add('pg-pop-exit-active');
    });
  }
}

function irAModulo(modulo) {
  const homeEl = document.getElementById('modulos-home');
  document.getElementById('mod-flota').classList.add('hidden');

  // Ocultar instantáneamente cualquier módulo que no sea el destino (no participa en la animación)
  ['mod-inventario', 'mod-containers', 'mod-movimientos', 'mod-andamios', 'main'].forEach(id => {
    const el = document.getElementById(id);
    if (el && id !== _moduloElId(modulo)) el.classList.add('hidden');
  });

  // Tema de color por módulo — aplicado en <body> para que también
  // alcance a los paneles de editar/agregar (viven fuera del contenedor del módulo)
  document.body.classList.remove('tema-inv', 'tema-cont', 'tema-mov', 'tema-and');
  if (modulo === 'containers') document.body.classList.add('tema-cont');
  else if (modulo === 'movimientos') document.body.classList.add('tema-mov');
  else if (modulo === 'andamios') document.body.classList.add('tema-and');
  else if (modulo !== 'flota') document.body.classList.add('tema-inv');

  if (modulo === 'flota') {
    // Flota usa su propio sidebar desktop nativo
    _setDesktopSidebarFlota(true);
    _pgTransition(homeEl, document.getElementById('main'), 'forward');
    const hdr = document.querySelector('#main .header');
    if (hdr && !document.getElementById('flota-back-btn')) {
      const backBtn = document.createElement('button');
      backBtn.id = 'flota-back-btn';
      backBtn.className = 'header-btn';
      backBtn.style.cssText = 'font-size:20px;color:#fff;order:-1';
      backBtn.onclick = () => volverAInicio();
      backBtn.textContent = '‹';
      hdr.insertBefore(backBtn, hdr.firstChild);
    }
  } else if (modulo === 'containers') {
    // Ocultar sidebar de Flota para que no se superponga
    _setDesktopSidebarFlota(false);
    _pgTransition(homeEl, document.getElementById('mod-containers'), 'forward');
    // Diferir el renderizado pesado de la lista un frame para no trabar la animación de entrada
    requestAnimationFrame(() => { _invActivarDesktop('containers'); renderContainers(); });
  } else if (modulo === 'movimientos') {
    _setDesktopSidebarFlota(false);
    _pgTransition(homeEl, document.getElementById('mod-movimientos'), 'forward');
    requestAnimationFrame(() => movhInit());
  } else if (modulo === 'andamios') {
    _setDesktopSidebarFlota(false);
    _pgTransition(homeEl, document.getElementById('mod-andamios'), 'forward');
    requestAnimationFrame(() => { _invActivarDesktop('andamios'); andInit(); });
  } else {
    // Inventario (generadores, maqmenor, herramientas)
    _setDesktopSidebarFlota(false);
    _pgTransition(homeEl, document.getElementById('mod-inventario'), 'forward');
    requestAnimationFrame(() => {
      _invActivarDesktop('inventario');
      invSetModulo(modulo === 'generadores' ? 'generadores' : modulo === 'maqmenor' ? 'maqmenor' : 'herramientas');
    });
  }

  history.pushState({ modulo }, '');
}

// Mapea el nombre lógico de módulo al id de su contenedor raíz
function _moduloElId(modulo) {
  if (modulo === 'flota') return 'main';
  if (modulo === 'containers') return 'mod-containers';
  if (modulo === 'movimientos') return 'mod-movimientos';
  if (modulo === 'andamios') return 'mod-andamios';
  return 'mod-inventario';
}

// Activa el layout desktop o móvil según el ancho de ventana
function _invActivarDesktop(tipo) {
  const esDesktop = window.innerWidth >= 900;
  if (tipo === 'inventario') {
    const sidebar  = document.getElementById('inv-desktop-sidebar');
    const content  = document.getElementById('inv-desktop-content');
    const mHdr     = document.getElementById('inv-mobile-header');
    const mTabs    = document.getElementById('inv-mobile-tabs');
    const mStats   = document.getElementById('inv-mobile-stats');
    const mSearch  = document.getElementById('inv-mobile-search');
    const mList    = document.getElementById('inv-mobile-list');
    if (sidebar)  sidebar.style.display  = esDesktop ? 'flex'  : 'none';
    if (content)  content.style.display  = esDesktop ? 'flex'  : 'none';
    if (mHdr)     mHdr.style.display     = esDesktop ? 'none'  : '';
    if (mTabs)    mTabs.style.display    = esDesktop ? 'none'  : '';
    if (mStats)   mStats.style.display   = esDesktop ? 'none'  : '';
    if (mSearch)  mSearch.style.display  = esDesktop ? 'none'  : '';
    if (mList)    mList.style.display    = esDesktop ? 'none'  : '';
  } else {
    const pre = tipo === 'andamios' ? 'and' : 'cont';
    const sidebar  = document.getElementById(`${pre}-desktop-sidebar`);
    const content  = document.getElementById(`${pre}-desktop-content`);
    const mHdr     = document.getElementById(`${pre}-mobile-header`);
    const mStats   = document.getElementById(`${pre}-mobile-stats`);
    const mSearch  = document.getElementById(`${pre}-mobile-search`);
    const mList    = document.getElementById(`${pre}-mobile-list`);
    if (sidebar)  sidebar.style.display  = esDesktop ? 'flex'  : 'none';
    if (content)  content.style.display  = esDesktop ? 'flex'  : 'none';
    if (mHdr)     mHdr.style.display     = esDesktop ? 'none'  : '';
    if (mStats)   mStats.style.display   = esDesktop ? 'none'  : '';
    if (mSearch)  mSearch.style.display  = esDesktop ? 'none'  : '';
    if (mList)    mList.style.display    = esDesktop ? 'none'  : '';
  }
}

function invSetModulo(mod) {
  invModulo = mod;
  // Tabs móvil
  document.querySelectorAll('.inv-tab').forEach(t => t.classList.remove('active'));
  const tabEl = document.getElementById('inv-tab-' + mod);
  if (tabEl) tabEl.classList.add('active');
  // Tabs desktop
  document.querySelectorAll('.inv-desktop-tab').forEach(t => t.classList.remove('active'));
  const dtTab = document.getElementById('inv-dt-tab-' + mod);
  if (dtTab) dtTab.classList.add('active');

  const nombre = mod === 'generadores' ? 'Generadores' : mod === 'maqmenor' ? 'Maq. Menor' : 'Herramientas';
  const tituloMob = document.getElementById('inv-titulo');
  const tituloDt  = document.getElementById('inv-dt-titulo');
  if (tituloMob) tituloMob.textContent = nombre;
  if (tituloDt)  tituloDt.textContent  = nombre;

  renderInvLista();
}

// Sincronizar búsqueda desktop → móvil (renderInvLista lee inv-search)
function invSyncSearch() {
  const dtInput  = document.getElementById('inv-dt-search');
  const mobInput = document.getElementById('inv-search');
  if (dtInput && mobInput) mobInput.value = dtInput.value;
  renderInvLista();
}

// Sincronizar búsqueda desktop → móvil para containers
function contSyncSearch() {
  const dtInput  = document.getElementById('cont-dt-search');
  const mobInput = document.getElementById('cont-search');
  if (dtInput && mobInput) mobInput.value = dtInput.value;
  renderContainers();
}

function volverAInicio() {
  const homeEl = document.getElementById('modulos-home');
  const candidatos = ['mod-inventario', 'mod-containers', 'mod-flota', 'mod-movimientos', 'mod-andamios', 'main']
    .map(id => document.getElementById(id));
  const saliente = candidatos.find(el => el && !el.classList.contains('hidden'));

  candidatos.forEach(el => { if (el && el !== saliente) el.classList.add('hidden'); });
  document.body.classList.remove('tema-inv', 'tema-cont', 'tema-mov', 'tema-and');
  // Ocultar sidebar de Flota para que no quede sobre la home
  const s = document.getElementById('desktop-sidebar');
  const m = document.getElementById('desktop-main');
  if (s) s.classList.add('dt-oculto');
  if (m) m.classList.add('dt-oculto');

  _pgTransition(saliente, homeEl, 'back');
}

// ══ AGREGAR NUEVO ÍTEM ══════════════════════════════════════

// Tipos predefinidos por módulo (para el select de equipo)
const TIPOS_MAQ_MENOR = ['SOPLADOR','VIBROAPISONADOR','ASPIRADORA','TURBOCALEFACTOR','COMPRESOR','HIDROLAVADORA','CORTADORA DE ASFALTO','MOTOBOMBA','BOMBA SUMERGIBLE','PLACA COMPACTADORA','BETONERA','UNIDAD MOTRIZ','RODILLO','OTRO'];
const TIPOS_HERRAMIENTA = ['DEMOLEDOR 5 KILOS','DEMOLEDOR 10 KILOS','DEMOLEDOR 9 KILOS','ESMERIL 5"','ESMERIL 7"','TALADRO PERCUTOR','PISTOLA IMPACTO','PULIDORA HORMIGÓN','TEODOLITO','OTRO'];
const TIPOS_GENERADOR = ['GENERADOR'];
const TIPOS_CONTAINER = ['OFICINA','BODEGA','BAÑO','OTRO'];

// Prefijos de código por tipo de equipo (se pueden extender)
const PREFIJOS_TIPO = {
  // Generadores
  'GENERADOR': 'GEN',
  // Maq. Menor
  'SOPLADOR': 'SPL', 'VIBROAPISONADOR': 'VIB', 'ASPIRADORA': 'ASP',
  'TURBOCALEFACTOR': 'TCA', 'COMPRESOR': 'CMP', 'HIDROLAVADORA': 'HID',
  'CORTADORA DE ASFALTO': 'CAS', 'MOTOBOMBA': 'MTB', 'BOMBA SUMERGIBLE': 'BSM',
  'PLACA COMPACTADORA': 'PLC', 'BETONERA': 'BET', 'UNIDAD MOTRIZ': 'UMO',
  'RODILLO': 'ROD',
  // Herramientas
  'DEMOLEDOR 5 KILOS': 'DM5', 'DEMOLEDOR 10 KILOS': 'D10', 'DEMOLEDOR 9 KILOS': 'DM9',
  'ESMERIL 5"': 'ES5', 'ESMERIL 7"': 'ES7', 'TALADRO PERCUTOR': 'TAL',
  'PISTOLA IMPACTO': 'PST', 'PULIDORA HORMIGÓN': 'PUL', 'TEODOLITO': 'TEO',
  'OTRO': 'OTR',
};

// Calcula el siguiente código para un tipo dado, buscando en TODOS los ítems del sistema
function _nextCodigo(tipo, _datosIgnorado) {
  // Prefijo: usar tabla o generar desde el nombre evitando colisiones
  let prefijo = PREFIJOS_TIPO[tipo];
  if (!prefijo) {
    // Generar prefijo de 3 letras desde palabras clave del nombre
    const palabras = tipo.replace(/[^A-Z0-9 ]/gi, '').toUpperCase().split(' ').filter(Boolean);
    if (palabras.length >= 2) {
      // Iniciales de las primeras 3 palabras
      prefijo = palabras.slice(0, 3).map(p => p[0]).join('');
      if (prefijo.length < 3) prefijo = (palabras[0].slice(0, 3 - prefijo.length + 1) + prefijo.slice(1)).slice(0, 3);
    } else {
      prefijo = (palabras[0] || 'OTR').slice(0, 3);
    }
    prefijo = prefijo.padEnd(3, 'X').slice(0, 3);
  }

  // Buscar en TODOS los ítems del sistema (generadores + maqmenor + herramientas + containers)
  const todosCodigos = [
    ...allGeneradores, ...allMaqMenor, ...allHerramientas, ...allContainers
  ].map(i => (i.codigo || '').toString().trim().toUpperCase());

  const re   = new RegExp(`^${prefijo}-(\\d+)$`, 'i');
  const nums = todosCodigos
    .map(c => { const m = c.match(re); return m ? parseInt(m[1]) : 0; })
    .filter(n => n > 0);
  const siguiente = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return `${prefijo}-${String(siguiente).padStart(2, '0')}`;
}

// Mostrar input personalizado cuando se elige OTRO
function _onNuevoEquipoChange() {
  const val = document.getElementById('nuevo-equipo').value;
  const row = document.getElementById('nuevo-equipo-otro-row');
  if (row) row.style.display = val === 'OTRO' ? '' : 'none';
  _actualizarCodigoAuto();
}

// Foto de referencia en nuevo ítem
let _nuevoInvFoto = null;

function onNuevoInvFotoSelected(input) {
  if (!input.files || !input.files.length) return;
  const file = input.files[0];
  const reader = new FileReader();
  reader.onload = () => {
    _nuevoInvFoto = { b64: reader.result.split(',')[1], name: file.name, mimeType: file.type || 'image/jpeg', previewUrl: reader.result };
    const img  = document.getElementById('nuevo-foto-img');
    const prev = document.getElementById('nuevo-foto-preview');
    const rem  = document.getElementById('nuevo-foto-remove');
    img.src = reader.result;
    prev.style.display = 'block';
    rem.style.display  = 'block';
  };
  reader.readAsDataURL(file);
  input.value = '';
}

function quitarNuevoInvFoto() {
  _nuevoInvFoto = null;
  document.getElementById('nuevo-foto-img').src = '';
  document.getElementById('nuevo-foto-preview').style.display = 'none';
  document.getElementById('nuevo-foto-remove').style.display = 'none';
}

function invAbrirNuevo() {
  const mod = invModulo;
  const tipos = mod === 'generadores' ? TIPOS_GENERADOR
              : mod === 'maqmenor'    ? TIPOS_MAQ_MENOR
              : TIPOS_HERRAMIENTA;

  // Poblar select de tipo
  const sel = document.getElementById('nuevo-equipo');
  sel.innerHTML = tipos.map(t => `<option value="${t}">${t}</option>`).join('');

  // Código solo para generadores; maq. menor y herramientas no lo tienen en el sheet
  document.getElementById('nuevo-codigo-row').style.display = mod === 'generadores' ? '' : 'none';
  document.getElementById('nuevo-potencia-row').style.display = mod === 'generadores' ? '' : 'none';

  // Limpiar campos
  ['nuevo-marca','nuevo-modelo','nuevo-ubicacion','nuevo-potencia','nuevo-equipo-otro','nuevo-color'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  _precargarColor('nuevo-color', '');
  document.getElementById('nuevo-estado').value = 'OPERATIVO';
  // Reset campo OTRO y foto
  const otroRow = document.getElementById('nuevo-equipo-otro-row');
  if (otroRow) otroRow.style.display = 'none';
  quitarNuevoInvFoto();
  document.getElementById('nuevo-modulo').value = mod;

  // Calcular número correlativo siguiente
  const datos = mod === 'generadores' ? allGeneradores : mod === 'maqmenor' ? allMaqMenor : allHerramientas;
  const nextNum = datos.length > 0 ? Math.max(...datos.map(i => parseInt(i.num)||0)) + 1 : 1;
  document.getElementById('nuevo-num').value = nextNum;

  // Autocompletar código según el primer tipo disponible
  _actualizarCodigoAuto();

  openPanel('panel-nuevo-inv');
}

// Se llama al cambiar el tipo en el select — recalcula el código sugerido
function _actualizarCodigoAuto() {
  const mod   = document.getElementById('nuevo-modulo').value;
  const tipo  = document.getElementById('nuevo-equipo').value;
  const datos = mod === 'generadores' ? allGeneradores : mod === 'maqmenor' ? allMaqMenor : allHerramientas;
  const codigoEl = document.getElementById('nuevo-codigo');
  if (codigoEl) codigoEl.value = _nextCodigo(tipo, datos);
}

async function invGuardarNuevo() {
  const mod      = document.getElementById('nuevo-modulo').value;
  const num      = document.getElementById('nuevo-num').value;
  const equipoSel = document.getElementById('nuevo-equipo').value;
  const equipoOtro = document.getElementById('nuevo-equipo-otro')?.value.trim().toUpperCase();
  const equipo   = (equipoSel === 'OTRO' && equipoOtro) ? equipoOtro : equipoSel;
  const marca    = document.getElementById('nuevo-marca').value.trim().toUpperCase();
  const modelo   = document.getElementById('nuevo-modelo').value.trim().toUpperCase();
  const estado   = document.getElementById('nuevo-estado').value;
  const ubicacion= document.getElementById('nuevo-ubicacion').value.trim().toUpperCase();
  const color    = _valorColor('nuevo-color');
  const codigo   = mod === 'generadores' ? document.getElementById('nuevo-codigo').value.trim().toUpperCase() : '';
  const potencia = mod === 'generadores' ? document.getElementById('nuevo-potencia').value.trim().toUpperCase() : '';

  _limpiarErrores('panel-nuevo-inv');
  let valido = true;
  if (!_campoValido('nuevo-equipo-otro', equipoSel !== 'OTRO' || !!equipoOtro)) valido = false;
  if (!_campoValido('nuevo-marca', !!marca)) valido = false;
  if (mod === 'generadores' && !_campoValido('nuevo-codigo', !!codigo)) valido = false;
  if (!valido) {
    toast('Completa los campos obligatorios marcados en rojo', 'error');
    _enfocarPrimerError('panel-nuevo-inv');
    return;
  }

  // Re-chequear N° correlativo por si se agregó otro ítem desde que se abrió el formulario
  // (evita duplicados si dos personas registran al mismo tiempo)
  const datosActuales = mod === 'generadores' ? allGeneradores : mod === 'maqmenor' ? allMaqMenor : allHerramientas;
  const numFresco = datosActuales.length > 0 ? Math.max(...datosActuales.map(i => parseInt(i.num)||0)) + 1 : 1;
  let numFinal = num;
  if (parseInt(num) !== numFresco) {
    numFinal = numFresco;
    document.getElementById('nuevo-num').value = numFresco;
    toast(`Se actualizó el N° a ${numFresco} (ya se había registrado otro ítem)`, 'info');
  }

  const btn = document.querySelector('#panel-nuevo-inv .pnl-action');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }

  try {
    let sheetName, fila;
    if (mod === 'generadores') {
      // Cols: A=N° B=EQUIPO C=CODIGO D=MARCA E=MODELO F=AÑO G=COLOR H=POTENCIA I=ESTADO J=UBICACION N=OBS
      sheetName = SHEET_GENERADORES;
      fila = [numFinal, equipo, codigo, marca, modelo, '', color, potencia, estado, ubicacion, '', '', '', ''];
    } else if (mod === 'maqmenor') {
      // Cols: A=N° B=EQUIPO C=FOTO D=MARCA E=MODELO F=MOTOR G=COLOR H=ESTADO I=UBICACION J=OBS
      sheetName = SHEET_MAQ_MENOR;
      fila = [numFinal, equipo, '', marca, modelo, '', color, estado, ubicacion, ''];
    } else {
      // Herramientas: A=N° B=EQUIPO C=REGISTRO D=MARCA E=MODELO F=MOTOR G=COLOR H=ESTADO I=UBICACION
      sheetName = SHEET_HERRAMIENTAS;
      fila = [numFinal, equipo, '', marca, modelo, '', color, estado, ubicacion, '', '', '', ''];
    }

    await appendSheet(`'${sheetName}'!A:Z`, [fila]);
    toast('✓ Ítem agregado');

    // Subir foto de referencia si se seleccionó
    if (_nuevoInvFoto) {
      toast('Subiendo foto de referencia...');
      try {
        // Obtener rowIndex del nuevo ítem (última fila del sheet)
        const datos = mod === 'generadores' ? allGeneradores : mod === 'maqmenor' ? allMaqMenor : allHerramientas;
        const newRow = (datos.length > 0 ? Math.max(...datos.map(i => i.rowIndex||0)) : 1) + 1;
        const codigoFoto = mod === 'generadores' ? (document.getElementById('nuevo-codigo')?.value || numFinal) : numFinal;
        let folderId = DRIVE_INV_FOLDER;
        try {
          const sf = await findOrCreateFolder(sheetName, DRIVE_INV_FOLDER);
          folderId = await findOrCreateFolder(String(codigoFoto), sf);
        } catch(fe) { console.warn('[NUEVO FOTO] carpeta fallback'); }
        const ext = _nuevoInvFoto.name.split('.').pop() || 'jpg';
        const fileName = `REF_${codigoFoto}_${sheetName.replace(/ /g,'_')}.${ext}`;
        const boundary = 'lst_inv_' + Date.now();
        const metadata = JSON.stringify({ name: fileName, parents: [folderId] });
        const body = ['--'+boundary,'Content-Type: application/json; charset=UTF-8','',metadata,'--'+boundary,'Content-Type: '+_nuevoInvFoto.mimeType,'Content-Transfer-Encoding: base64','',_nuevoInvFoto.b64,'--'+boundary+'--'].join('\r\n');
        const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + accessToken, 'Content-Type': 'multipart/related; boundary=' + boundary },
          body,
        });
        if (res.ok) {
          const result = await res.json();
          // Determinar columna de foto y fila real
          const colFotoNuevo = mod === 'generadores' ? 'O' : 'C';
          await writeSheet(`'${sheetName}'!${colFotoNuevo}${newRow}`, [[result.name]]);
          toast('Foto subida ✓');
        }
      } catch(fe) { console.error('[NUEVO FOTO]', fe); }
      _nuevoInvFoto = null;
    }

    _origClosePanel('panel-nuevo-inv'); 
    const idx = _panelStack.lastIndexOf('panel-nuevo-inv');
    if (idx !== -1) _panelStack.splice(idx, 1);
    await loadInventario();
    renderInvLista();
  } catch(err) {
    toast('Error: ' + err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Agregar'; }
  }
}

// ── Nuevo Container ───────────────────────────────────────────
function contAbrirNuevo() {
  ['cont-nuevo-ubicacion','cont-nuevo-color','cont-nuevo-equip','cont-nuevo-obs'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  _precargarColor('cont-nuevo-color', '');
  document.getElementById('cont-nuevo-tipo').value   = 'OFICINA';
  document.getElementById('cont-nuevo-estado').value = 'REGULAR';
  document.getElementById('cont-nuevo-medidas').value= '6 METROS';
  _contNuevoFoto = null;
  const fp = document.getElementById('cont-nuevo-foto-preview');
  if (fp) { fp.style.display = 'none'; fp.innerHTML = ''; }

  const nextNum = allContainers.length > 0 ? Math.max(...allContainers.map(i => parseInt(i.num)||0)) + 1 : 1;
  document.getElementById('cont-nuevo-num').value = nextNum;

  openPanel('panel-nuevo-cont');
}

async function contGuardarNuevo() {
  const num      = document.getElementById('cont-nuevo-num').value;
  const tipo     = document.getElementById('cont-nuevo-tipo').value;
  const medidas  = document.getElementById('cont-nuevo-medidas').value.trim().toUpperCase();
  const estado   = document.getElementById('cont-nuevo-estado').value;
  const ubicacion= document.getElementById('cont-nuevo-ubicacion').value.trim().toUpperCase();
  const color    = _valorColor('cont-nuevo-color');
  const equip    = document.getElementById('cont-nuevo-equip').value.trim();
  const obs      = document.getElementById('cont-nuevo-obs').value.trim();

  _limpiarErrores('panel-nuevo-cont');
  let valido = true;
  if (!_campoValido('cont-nuevo-medidas', !!medidas)) valido = false;
  if (!valido) {
    toast('Completa los campos obligatorios marcados en rojo', 'error');
    _enfocarPrimerError('panel-nuevo-cont');
    return;
  }

  // Re-chequear N° por si se agregó otro container desde que se abrió el formulario
  const numFresco = allContainers.length > 0 ? Math.max(...allContainers.map(i => parseInt(i.num)||0)) + 1 : 1;
  let numFinal = num;
  if (parseInt(num) !== numFresco) {
    numFinal = numFresco;
    document.getElementById('cont-nuevo-num').value = numFresco;
    toast(`Se actualizó el N° a ${numFresco} (ya se había registrado otro container)`, 'info');
  }

  const btn = document.querySelector('#panel-nuevo-cont .pnl-action');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }

  try {
    // Cols: A=N° B=TIPO C=FOTO D=MEDIDAS E=ESTADO F=COLOR G=UBICACION H=FECHA I=EQUIPAMIENTO J=OBS
    const fila = [numFinal, tipo, '', medidas, estado, color, ubicacion, '-', equip || '-', obs];
    await appendSheet(`'${SHEET_CONTAINERS}'!A:J`, [fila]);
    toast('✓ Container agregado');

    // Subir foto de referencia si se seleccionó
    if (_contNuevoFoto) {
      toast('Subiendo foto de referencia...');
      try {
        const newRow = (allContainers.length > 0 ? Math.max(...allContainers.map(i => i.rowIndex||0)) : 2) + 1;
        let folderId = DRIVE_INV_FOLDER;
        try { folderId = await findOrCreateFolder('Containers', DRIVE_INV_FOLDER); } catch(fe) {}
        const ext      = _contNuevoFoto.name.split('.').pop() || 'jpg';
        const fileName = `CONT_${numFinal}_${new Date().toLocaleDateString('es-CL').replace(/\//g,'-')}.${ext}`;
        const boundary = 'lst_cont_' + Date.now();
        const metadata = JSON.stringify({ name: fileName, parents: [folderId] });
        const body = ['--'+boundary,'Content-Type: application/json; charset=UTF-8','',metadata,'--'+boundary,'Content-Type: '+_contNuevoFoto.mimeType,'Content-Transfer-Encoding: base64','',_contNuevoFoto.b64,'--'+boundary+'--'].join('\r\n');
        const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
          method:'POST', headers:{'Authorization':'Bearer '+accessToken,'Content-Type':'multipart/related; boundary='+boundary}, body,
        });
        if (res.ok) {
          const r = await res.json();
          await writeSheet(`'${SHEET_CONTAINERS}'!C${newRow}`, [[r.name]]);
          toast('Foto subida ✓');
        }
      } catch(fe) { console.error('[CONT NUEVO FOTO]', fe); }
      _contNuevoFoto = null;
    }

    _origClosePanel('panel-nuevo-cont'); 
    const idx = _panelStack.lastIndexOf('panel-nuevo-cont');
    if (idx !== -1) _panelStack.splice(idx, 1);
    await loadInventario();
    renderContainers();
  } catch(err) {
    toast('Error: ' + err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Agregar'; }
  }
}

// ============================================
// MOVIMIENTOS — Traslados entre obras/bodega
// Hoja MOVIMIENTOS: A=ID B=FECHA_SALIDA C=TIPO_EQUIPO D=CODIGO_EQUIPO
//   E=NOMBRE_EQUIPO F=ORIGEN G=DESTINO H=AUTORIZA I=TRASLADA J=OBS_SALIDA
//   K=REGISTRADO_POR L=GUIA_DESPACHO
// (pendiente futuro: ESTADO / FECHA_RECEPCION / RECIBE / OBS_RECEPCION)
// ============================================

let allMovimientos = [];
let _movPendienteActual = null; // item temporal mientras se llena el form de mover

// Renderiza el historial de movimientos de un equipo (por código) para insertar en su ficha
function _renderHistorialMovimientos(codigoEquipo) {
  const hist = (allMovimientos || [])
    .filter(m => m.codigoEquipo === codigoEquipo)
    .sort((a,b) => b.rowIndex - a.rowIndex)
    .slice(0, 8);

  if (hist.length === 0) {
    return `
    <div class="ficha-section">
      <div class="ficha-sec-title">Historial de movimientos</div>
      ${emptyState('Sin movimientos','Este equipo no ha sido trasladado aún')}
    </div>`;
  }

  return `
    <div class="ficha-section">
      <div class="ficha-sec-title">Historial de movimientos</div>
      ${hist.map(m => {
        const recibido = m.estado === 'recibido';
        const badge = recibido
          ? `<span style="background:#dcfce7;color:#15803d;border-radius:99px;padding:1px 7px;font-size:10px;font-weight:700">Recibido</span>`
          : `<span style="background:#fef3c7;color:#b45309;border-radius:99px;padding:1px 7px;font-size:10px;font-weight:700">En tránsito</span>`;
        return `
        <div class="evento-card-mini">
          <div class="evento-tipo-icon"><svg viewBox="0 0 24 24" fill="none" class="equipo-svg"><path d="M3 16h1M3 16V9a1 1 0 0 1 1-1h9v8M12 16h7" stroke="white" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 11h4l3 3v2" stroke="white" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><circle cx="7" cy="16.5" r="1.6" stroke="white" stroke-width="1.6"/><circle cx="16" cy="16.5" r="1.6" stroke="white" stroke-width="1.6"/></svg></div>
          <div class="mant-body">
            <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:2px">
              <div class="mant-title" style="margin:0">${m.origen||'—'} → ${m.destino||'—'}</div>
              ${badge}
            </div>
            <div class="mant-meta">${m.fechaSalida}${m.guiaDespacho ? ' · Guía N° ' + m.guiaDespacho : ''}</div>
            ${m.traslada ? `<div class="evento-desc">Traslada: ${m.traslada}${m.autoriza?' · Autoriza: '+m.autoriza:''}</div>` : ''}
            ${m.obsSalida ? `<div class="evento-desc"><svg viewBox="0 0 24 24" fill="none" class="inline-ic"><path d="M6 2h9l3 3v17H6Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M9 11h6M9 15h6M9 7h3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg> ${m.obsSalida}</div>` : ''}
            ${recibido ? `<div class="evento-desc" style="color:#15803d"><svg viewBox="0 0 24 24" fill="none" class="inline-ic"><path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg> Recibido el ${m.fechaRecepcion} por ${m.recibe}</div>` : ''}
          </div>
        </div>`;
      }).join('')}
    </div>`;
}

// Carga todos los movimientos (se usa para historial)
async function loadMovimientos() {
  try {
    const rows = await fetchSheet(`'${SHEET_MOVIMIENTOS}'!A2:Q2000`);
    allMovimientos = (rows || []).map((r, i) => ({
      rowIndex: i + 2,
      id: r[0] || '',
      fechaSalida: r[1] || '',
      tipoEquipo: r[2] || '',
      codigoEquipo: r[3] || '',
      nombreEquipo: r[4] || '',
      origen: r[5] || '',
      destino: r[6] || '',
      autoriza: r[7] || '',
      traslada: r[8] || '',
      obsSalida: r[9] || '',
      registradoPor: r[10] || '',
      guiaDespacho: r[11] || '',
      estado: r[12] || 'en_transito',       // M=ESTADO (vacío = en tránsito por compatibilidad)
      fechaRecepcion: r[13] || '',           // N=FECHA_RECEPCION
      recibe: r[14] || '',                   // O=RECIBE
      obsRecepcion: r[15] || '',             // P=OBS_RECEPCION
      fotoRecepcion: r[16] || '',            // Q=FOTO_RECEPCION
    }));
  } catch (e) {
    console.warn('[MOV] Hoja MOVIMIENTOS no encontrada, se creará al guardar el primer movimiento');
    allMovimientos = [];
  }
}

// ── Abrir panel "Mover" desde Inventario (Generadores/MaqMenor/Herramientas) ──
function abrirMoverInv() {
  if (!invItem) return;
  const nombre = [invItem.marca, invItem.modelo].filter(Boolean).join(' ') || invItem.equipo;
  _abrirPanelMover({
    tipoEquipo: invItem._modulo === 'generadores' ? 'Generador'
              : invItem._modulo === 'maqmenor' ? 'Maq. Menor' : 'Herramienta',
    codigoEquipo: invItem.codigo || String(invItem.rowIndex),
    nombreEquipo: nombre,
    ubicacionActual: invItem.ubicacion || '',
    rowIndex: invItem.rowIndex,
    onGuardar: 'inv',
  });
}

// ── Abrir panel "Mover" desde Containers ──
function abrirMoverCont() {
  if (!contItem) return;
  _abrirPanelMover({
    tipoEquipo: 'Container',
    codigoEquipo: String(contItem.num || contItem.rowIndex),
    nombreEquipo: contItem.tipo || 'Container',
    ubicacionActual: contItem.ubicacion || '',
    rowIndex: contItem.rowIndex,
    onGuardar: 'cont',
  });
}

function _abrirPanelMover(data) {
  _movPendienteActual = data;
  document.getElementById('mov-tipo-equipo').value = data.tipoEquipo;
  document.getElementById('mov-codigo-equipo').value = data.codigoEquipo;
  document.getElementById('mov-row-index').value = data.rowIndex;
  document.getElementById('mov-nombre-equipo').textContent = `${data.tipoEquipo} — ${data.nombreEquipo}`;
  document.getElementById('mov-origen').value = data.ubicacionActual || '';
  document.getElementById('mov-destino').value = '';
  document.getElementById('mov-fecha').value = new Date().toISOString().slice(0,10);
  document.getElementById('mov-guia').value = '';
  document.getElementById('mov-autoriza').value = '';
  document.getElementById('mov-traslada').value = '';
  document.getElementById('mov-obs-salida').value = '';
  openPanel('panel-mover');
}

async function invGuardarMovimiento() {
  const tipoEquipo   = document.getElementById('mov-tipo-equipo').value;
  const codigoEquipo = document.getElementById('mov-codigo-equipo').value;
  const rowIndex     = document.getElementById('mov-row-index').value;
  const nombreEquipo = _movPendienteActual ? _movPendienteActual.nombreEquipo : '';
  const origen   = document.getElementById('mov-origen').value.trim();
  const destino  = document.getElementById('mov-destino').value.trim();
  const fecha    = document.getElementById('mov-fecha').value;
  const guia     = document.getElementById('mov-guia').value.trim();
  const autoriza = document.getElementById('mov-autoriza').value.trim();
  const traslada = document.getElementById('mov-traslada').value.trim();
  const obs      = document.getElementById('mov-obs-salida').value.trim();

  if (!fecha) { toast('La fecha del movimiento es obligatoria', 'error'); document.getElementById('mov-fecha').focus(); return; }
  if (!destino) { toast('Completa el destino', 'error'); return; }

  const btn = document.querySelector('#panel-mover .pnl-action');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }

  try {
    const fechaFmt = "'" + fecha.split('-').reverse().join('/');
    const idMov = 'MOV-' + Date.now();
    const registradoPor = (typeof userEmail !== 'undefined' && userEmail) ? userEmail : '';

    // A=ID B=FECHA_SALIDA C=TIPO D=CODIGO E=NOMBRE F=ORIGEN G=DESTINO H=AUTORIZA
    // I=TRASLADA J=OBS_SALIDA K=REGISTRADO_POR L=GUIA_DESPACHO M=ESTADO
    await appendSheet(`'${SHEET_MOVIMIENTOS}'!A:M`, [[
      idMov, fechaFmt, tipoEquipo, codigoEquipo, nombreEquipo,
      origen, destino, autoriza, traslada, obs,
      registradoPor, guia, 'en_transito'
    ]]);

    // Actualizar ubicación actual del equipo de inmediato
    if (_movPendienteActual && _movPendienteActual.onGuardar === 'inv' && invItem) {
      let col = null;
      if (invItem._modulo === 'generadores') col = 'J';
      else if (invItem._modulo === 'maqmenor') col = 'I';
      else if (invItem._modulo === 'herramientas') col = 'I';
      const sheetName = invItem._modulo === 'generadores' ? SHEET_GENERADORES
                       : invItem._modulo === 'maqmenor' ? SHEET_MAQ_MENOR : SHEET_HERRAMIENTAS;
      if (col) await writeSheet(`'${sheetName}'!${col}${rowIndex}`, [[destino]]);
    } else if (_movPendienteActual && _movPendienteActual.onGuardar === 'cont') {
      await writeSheet(`'${SHEET_CONTAINERS}'!G${rowIndex}`, [[destino]]);
    } else if (_movPendienteActual && _movPendienteActual.onGuardar === 'flota') {
      await writeSheet(`'${CONFIG.SHEET_MAQUINARIA}'!K${rowIndex}`, [[destino]]);
    }

    toast('✓ Movimiento registrado');
    _origClosePanel('panel-mover');
    const idx = _panelStack.lastIndexOf('panel-mover');
    if (idx !== -1) _panelStack.splice(idx, 1);

    await loadInventario();
    await loadMovimientos();
    if (_movPendienteActual && _movPendienteActual.onGuardar === 'cont') renderContainers();
    if (_movPendienteActual && _movPendienteActual.onGuardar === 'flota' && typeof loadData === 'function') {
      await loadData(true);
    }
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Guardar'; }
  }
}

// ── Abrir Flota (Maquinaria) — definida aquí porque reutiliza panel-mover ──
function abrirMoverFlota(patente) {
  const eq = (typeof allEquipos !== 'undefined' ? allEquipos : []).find(x => x.patente === patente);
  if (!eq) return;
  _abrirPanelMover({
    tipoEquipo: 'Maquinaria',
    codigoEquipo: eq.patente,
    nombreEquipo: [eq.marca, eq.modelo].filter(Boolean).join(' ') || eq.equipo,
    ubicacionActual: eq.ubicacion || '',
    rowIndex: eq.rowIndex,
    onGuardar: 'flota',
  });
}


// ============================================
// SELECCIÓN MÚLTIPLE — Mover varios ítems a la vez
// ============================================

// ── Inventario (Generadores/MaqMenor/Herramientas) ──
function invToggleModoSeleccion() {
  _invModoSeleccion = !_invModoSeleccion;
  if (!_invModoSeleccion) _invSeleccion.clear();
  const btn = document.getElementById('inv-btn-seleccionar');
  if (btn) btn.textContent = _invModoSeleccion ? '✕ Cancelar' : '☑️ Seleccionar';
  _invActualizarBarraSeleccion();
  renderInvLista();
}

function invCancelarSeleccion() {
  _invModoSeleccion = false;
  _invSeleccion.clear();
  const btn = document.getElementById('inv-btn-seleccionar');
  if (btn) btn.textContent = '☑️ Seleccionar';
  _invActualizarBarraSeleccion();
  renderInvLista();
}

function invToggleItemSeleccion(modulo, rowIndex) {
  const key = `${modulo}:${rowIndex}`;
  if (_invSeleccion.has(key)) _invSeleccion.delete(key);
  else _invSeleccion.add(key);
  _invActualizarBarraSeleccion();
  renderInvLista();
}

function _invActualizarBarraSeleccion() {
  const bar = document.getElementById('inv-sel-bar');
  const count = document.getElementById('inv-sel-count');
  if (!bar) return;
  if (_invModoSeleccion && _invSeleccion.size > 0) {
    bar.classList.remove('hidden');
    if (count) count.textContent = `${_invSeleccion.size} seleccionado${_invSeleccion.size>1?'s':''}`;
  } else {
    bar.classList.add('hidden');
  }
}

// ── Containers ──
function contToggleModoSeleccion() {
  _contModoSeleccion = !_contModoSeleccion;
  if (!_contModoSeleccion) _contSeleccion.clear();
  const btn = document.getElementById('cont-btn-seleccionar');
  if (btn) btn.textContent = _contModoSeleccion ? '✕ Cancelar' : '☑️ Seleccionar';
  _contActualizarBarraSeleccion();
  renderContainers();
}

function contCancelarSeleccion() {
  _contModoSeleccion = false;
  _contSeleccion.clear();
  const btn = document.getElementById('cont-btn-seleccionar');
  if (btn) btn.textContent = '☑️ Seleccionar';
  _contActualizarBarraSeleccion();
  renderContainers();
}

function contToggleItemSeleccion(rowIndex) {
  const key = `cont:${rowIndex}`;
  if (_contSeleccion.has(key)) _contSeleccion.delete(key);
  else _contSeleccion.add(key);
  _contActualizarBarraSeleccion();
  renderContainers();
}

function _contActualizarBarraSeleccion() {
  const bar = document.getElementById('cont-sel-bar');
  const count = document.getElementById('cont-sel-count');
  if (!bar) return;
  if (_contModoSeleccion && _contSeleccion.size > 0) {
    bar.classList.remove('hidden');
    if (count) count.textContent = `${_contSeleccion.size} seleccionado${_contSeleccion.size>1?'s':''}`;
  } else {
    bar.classList.add('hidden');
  }
}

// ── Abrir panel de mover selección (Inventario) ──
function abrirMoverSeleccionInv() {
  _movMultiItems = [];
  _movMultiOverrides = {};
  _invSeleccion.forEach(key => {
    const [modulo, rowIndexStr] = key.split(':');
    const rowIndex = parseInt(rowIndexStr);
    const datos = modulo === 'generadores' ? allGeneradores
                : modulo === 'maqmenor'    ? allMaqMenor : allHerramientas;
    const item = datos.find(d => d.rowIndex === rowIndex);
    if (!item) return;
    const nombre = [item.marca, item.modelo].filter(Boolean).join(' ') || item.equipo;
    _movMultiItems.push({
      key, modulo, rowIndex,
      tipoEquipo: modulo === 'generadores' ? 'Generador' : modulo === 'maqmenor' ? 'Maq. Menor' : 'Herramienta',
      nombreEquipo: nombre,
      ubicacionActual: item.ubicacion || '',
    });
  });
  _abrirPanelMoverMulti();
}

// ── Abrir panel de mover selección (Containers) ──
function abrirMoverSeleccionCont() {
  _movMultiItems = [];
  _movMultiOverrides = {};
  _contSeleccion.forEach(key => {
    const rowIndex = parseInt(key.split(':')[1]);
    const item = allContainers.find(c => c.rowIndex === rowIndex);
    if (!item) return;
    _movMultiItems.push({
      key, modulo: 'cont', rowIndex,
      tipoEquipo: 'Container',
      nombreEquipo: item.tipo || 'Container',
      ubicacionActual: item.ubicacion || '',
    });
  });
  _abrirPanelMoverMulti();
}

function _abrirPanelMoverMulti() {
  if (_movMultiItems.length === 0) { toast('No hay ítems seleccionados', 'error'); return; }
  // Origen por defecto: si todos comparten la misma ubicación, se usa esa; si no, queda vacío
  const ubicaciones = new Set(_movMultiItems.map(i => i.ubicacionActual));
  document.getElementById('movm-origen').value = ubicaciones.size === 1 ? _movMultiItems[0].ubicacionActual : '';
  document.getElementById('movm-destino').value = '';
  document.getElementById('movm-fecha').value = new Date().toISOString().slice(0,10);
  document.getElementById('movm-guia').value = '';
  document.getElementById('movm-autoriza').value = '';
  document.getElementById('movm-traslada').value = '';
  document.getElementById('movm-obs-salida').value = '';
  document.getElementById('movm-items-titulo').textContent = `Ítems seleccionados (${_movMultiItems.length})`;
  _movMultiRefrescarLista();
  openPanel('panel-mover-multi');
}

function _movMultiRefrescarLista() {
  const destinoGeneral = document.getElementById('movm-destino') ? document.getElementById('movm-destino').value.trim() : '';
  const cont = document.getElementById('movm-items-lista');
  if (!cont) return;
  cont.innerHTML = _movMultiItems.map((item, idx) => {
    const ov = _movMultiOverrides[item.key];
    const destinoMostrado = (ov && ov.destino) ? ov.destino : (destinoGeneral || '—');
    const personalizado = !!(ov && (ov.destino || ov.guia || ov.obs));
    return `<div class="movm-item-card" onclick="abrirOverrideItemMulti(${idx})">
      <div>
        <div class="movm-item-title">${item.tipoEquipo} — ${item.nombreEquipo}</div>
        <div class="movm-item-sub">→ ${destinoMostrado}${personalizado ? ' (personalizado)' : ''}</div>
      </div>
      <button type="button" class="btn-detalle-mini" title="Ver detalles y fotos" onclick="event.stopPropagation();movhVerDetalle('${item.modulo}',${item.rowIndex})">
        <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6"/><path d="M12 11v5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="8" r="1" fill="currentColor"/></svg>
      </button>
      <span style="color:#94a3b8"><svg viewBox="0 0 24 24" fill="none" style="width:14px;height:14px"><path d="M4 20l1-4 11-11 3 3-11 11Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M14 7l3 3" stroke="currentColor" stroke-width="1.7"/></svg></span>
    </div>`;
  }).join('');
}

function abrirOverrideItemMulti(idx) {
  const item = _movMultiItems[idx];
  if (!item) return;
  document.getElementById('movmi-idx').value = idx;
  document.getElementById('movmi-nombre').textContent = `${item.tipoEquipo} — ${item.nombreEquipo}`;
  const ov = _movMultiOverrides[item.key] || {};
  document.getElementById('movmi-destino').value = ov.destino || '';
  document.getElementById('movmi-guia').value = ov.guia || '';
  document.getElementById('movmi-obs').value = ov.obs || '';
  openPanel('panel-mover-multi-item');
}

function guardarOverrideItemMulti() {
  const idx = parseInt(document.getElementById('movmi-idx').value);
  const item = _movMultiItems[idx];
  if (!item) return;
  const destino = document.getElementById('movmi-destino').value.trim();
  const guia = document.getElementById('movmi-guia').value.trim();
  const obs = document.getElementById('movmi-obs').value.trim();
  if (destino || guia || obs) {
    _movMultiOverrides[item.key] = { destino, guia, obs };
  } else {
    delete _movMultiOverrides[item.key];
  }
  _origClosePanel('panel-mover-multi-item');
  const idx2 = _panelStack.lastIndexOf('panel-mover-multi-item');
  if (idx2 !== -1) _panelStack.splice(idx2, 1);
  _movMultiRefrescarLista();
}

function quitarItemDeSeleccionMulti() {
  const idx = parseInt(document.getElementById('movmi-idx').value);
  const item = _movMultiItems[idx];
  if (!item) return;
  _movMultiItems.splice(idx, 1);
  delete _movMultiOverrides[item.key];
  // También desmarcar de la selección original (sea cual sea su origen)
  if (item.modulo === 'cont') _contSeleccion.delete(item.key);
  else if (item.modulo !== 'flota') _invSeleccion.delete(item.key);
  if (typeof movhSeleccion !== 'undefined') movhSeleccion.delete(item.key);

  _origClosePanel('panel-mover-multi-item');
  const idx2 = _panelStack.lastIndexOf('panel-mover-multi-item');
  if (idx2 !== -1) _panelStack.splice(idx2, 1);

  if (_movMultiItems.length === 0) {
    toast('Selección vacía');
    _origClosePanel('panel-mover-multi');
    const idx3 = _panelStack.lastIndexOf('panel-mover-multi');
    if (idx3 !== -1) _panelStack.splice(idx3, 1);
    return;
  }
  document.getElementById('movm-items-titulo').textContent = `Ítems seleccionados (${_movMultiItems.length})`;
  _movMultiRefrescarLista();
}

async function guardarMovimientoMulti() {
  const origenGeneral   = document.getElementById('movm-origen').value.trim();
  const destinoGeneral  = document.getElementById('movm-destino').value.trim();
  const fecha            = document.getElementById('movm-fecha').value;
  const guiaGeneral       = document.getElementById('movm-guia').value.trim();
  const autoriza          = document.getElementById('movm-autoriza').value.trim();
  const traslada           = document.getElementById('movm-traslada').value.trim();
  const obsGeneral        = document.getElementById('movm-obs-salida').value.trim();

  if (!fecha) { toast('La fecha del movimiento es obligatoria', 'error'); document.getElementById('movm-fecha').focus(); return; }
  if (!destinoGeneral) { toast('Completa el destino general', 'error'); return; }
  if (_movMultiItems.length === 0) { toast('No hay ítems seleccionados', 'error'); return; }

  const btn = document.querySelector('#panel-mover-multi .pnl-action');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }

  try {
    const fechaFmt = "'" + fecha.split('-').reverse().join('/');
    const registradoPor = (typeof userEmail !== 'undefined' && userEmail) ? userEmail : '';

    const filas = [];
    const writes = [];

    for (const item of _movMultiItems) {
      const ov = _movMultiOverrides[item.key] || {};
      const destino = ov.destino || destinoGeneral;
      const guia = ov.guia || guiaGeneral;
      const obs = ov.obs || obsGeneral;
      const idMov = 'MOV-' + Date.now() + '-' + item.rowIndex;

      filas.push([
        idMov, fechaFmt, item.tipoEquipo, '', item.nombreEquipo,
        origenGeneral || item.ubicacionActual, destino, autoriza, traslada, obs,
        registradoPor, guia, 'en_transito'
      ]);

      // Actualizar ubicación en la hoja correspondiente
      if (item.modulo === 'cont') {
        writes.push(writeSheet(`'${SHEET_CONTAINERS}'!G${item.rowIndex}`, [[destino]]));
      } else if (item.modulo === 'flota') {
        writes.push(writeSheet(`'${CONFIG.SHEET_MAQUINARIA}'!K${item.rowIndex}`, [[destino]]));
      } else {
        let col = item.modulo === 'generadores' ? 'J' : 'I';
        const sheetName = item.modulo === 'generadores' ? SHEET_GENERADORES
                         : item.modulo === 'maqmenor' ? SHEET_MAQ_MENOR : SHEET_HERRAMIENTAS;
        writes.push(writeSheet(`'${sheetName}'!${col}${item.rowIndex}`, [[destino]]));
      }
    }

    await appendSheet(`'${SHEET_MOVIMIENTOS}'!A:M`, filas);
    await Promise.all(writes);

    toast(`✓ ${filas.length} movimientos registrados`);

    _origClosePanel('panel-mover-multi');
    const idx = _panelStack.lastIndexOf('panel-mover-multi');
    if (idx !== -1) _panelStack.splice(idx, 1);

    // Salir de modo selección y refrescar todo
    invCancelarSeleccion();
    contCancelarSeleccion();
    movhCancelarSeleccion();
    await loadInventario();
    await loadMovimientos();
    renderContainers();
    if (typeof loadData === 'function') await loadData(true);
    movhRenderLista();
    movhRenderHistorial();
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Guardar'; }
  }
}

// ============================================
// MÓDULO MOVIMIENTOS — vista centralizada
// Lista equipos de TODOS los tipos (flota, generadores, maq. menor,
// herramientas, containers) en un solo lugar para registrar traslados,
// más una pestaña de Historial. Reemplaza los botones "Registrar
// movimiento" que antes vivían dentro de cada ficha individual.
// ============================================

let movhTab = 'registrar';
let movhFiltroTipo = 'todos';
let movhSeleccion = new Set(); // claves "modulo:rowIndex"

function movhInit() {
  movhTab = 'registrar';
  movhFiltroTipo = 'todos';
  movhSeleccion.clear();
  document.querySelectorAll('.movh-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === 'registrar'));
  document.querySelectorAll('.movh-chip').forEach(c => c.classList.toggle('active', c.dataset.tipo === 'todos'));
  document.getElementById('movh-vista-registrar').classList.remove('hidden');
  document.getElementById('movh-vista-pendientes').classList.add('hidden');
  document.getElementById('movh-vista-historial').classList.add('hidden');
  const dtList = document.getElementById('movh-dt-list-wrap');
  const dtPend = document.getElementById('movh-dt-pendientes-wrap');
  const dtHist = document.getElementById('movh-dt-historial-wrap');
  if (dtList) dtList.classList.remove('hidden');
  if (dtPend) dtPend.classList.add('hidden');
  if (dtHist) dtHist.classList.add('hidden');
  const dtTitulo = document.getElementById('movh-dt-titulo');
  if (dtTitulo) dtTitulo.textContent = 'Registrar movimiento';
  const dtSearchWrap = document.getElementById('movh-dt-search-wrap');
  const dtChips = document.getElementById('movh-dt-chips');
  if (dtSearchWrap) dtSearchWrap.style.display = '';
  if (dtChips) dtChips.style.display = 'flex';
  _movhActivarDesktop();
  movhRenderLista();
  movhRenderPendientes();
  movhRenderHistorial();
}

// Activa el layout desktop (sidebar + área central) o el móvil según el ancho de ventana
function _movhActivarDesktop() {
  const esDesktop = window.innerWidth >= 900;
  const sidebar = document.getElementById('movh-desktop-sidebar');
  const content = document.getElementById('movh-desktop-content');
  if (sidebar) sidebar.style.display = esDesktop ? 'flex' : 'none';
  if (content) content.style.display = esDesktop ? 'flex' : 'none';
}

function movhSetTab(tab) {
  movhTab = tab;
  document.querySelectorAll('.movh-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  document.getElementById('movh-vista-registrar').classList.toggle('hidden', tab !== 'registrar');
  document.getElementById('movh-vista-pendientes').classList.toggle('hidden', tab !== 'pendientes');
  document.getElementById('movh-vista-historial').classList.toggle('hidden', tab !== 'historial');
  const dtList = document.getElementById('movh-dt-list-wrap');
  const dtPend = document.getElementById('movh-dt-pendientes-wrap');
  const dtHist = document.getElementById('movh-dt-historial-wrap');
  const dtTitulo = document.getElementById('movh-dt-titulo');
  const dtSearchWrap = document.getElementById('movh-dt-search-wrap');
  const dtChips = document.getElementById('movh-dt-chips');
  if (dtList) dtList.classList.toggle('hidden', tab !== 'registrar');
  if (dtPend) dtPend.classList.toggle('hidden', tab !== 'pendientes');
  if (dtHist) dtHist.classList.toggle('hidden', tab !== 'historial');
  const titulos = { registrar: 'Registrar movimiento', pendientes: 'Pendientes de recepción', historial: 'Historial de movimientos' };
  if (dtTitulo) dtTitulo.textContent = titulos[tab] || '';
  if (dtSearchWrap) dtSearchWrap.style.display = tab === 'registrar' ? '' : 'none';
  if (dtChips) dtChips.style.display = tab === 'registrar' ? 'flex' : 'none';
  if (tab === 'pendientes') movhRenderPendientes();
  if (tab === 'historial') movhRenderHistorial();
}

function movhSetFiltroTipo(tipo) {
  movhFiltroTipo = tipo;
  document.querySelectorAll('.movh-chip').forEach(c => c.classList.toggle('active', c.dataset.tipo === tipo));
  movhRenderLista();
}

// Sincroniza búsqueda desktop → móvil (movhRenderLista lee movh-search)
function movhSyncSearch() {
  const dtInput = document.getElementById('movh-dt-search');
  const mobInput = document.getElementById('movh-search');
  if (dtInput && mobInput) mobInput.value = dtInput.value;
  movhRenderLista();
}

// Construye la lista unificada de equipos (todos los módulos) con su ubicación actual
function _movhTodosLosItems() {
  const items = [];
  (typeof allEquipos !== 'undefined' ? allEquipos : []).forEach(e => {
    const marcaModelo = [e.marca, e.modelo].filter(Boolean).join(' ');
    items.push({
      key: `flota:${e.rowIndex}`, modulo: 'flota', rowIndex: e.rowIndex,
      tipoEquipo: 'Maquinaria',
      codigoEquipo: e.patente,
      nombreEquipo: [e.equipo, marcaModelo].filter(Boolean).join(' — ') || e.patente,
      ubicacionActual: e.ubicacion || '',
      icon: iconoEquipo(e.equipo),
    });
  });
  (typeof allGeneradores !== 'undefined' ? allGeneradores : []).forEach(e => {
    const marcaModelo = [e.marca, e.modelo].filter(Boolean).join(' ');
    items.push({
      key: `generadores:${e.rowIndex}`, modulo: 'generadores', rowIndex: e.rowIndex,
      tipoEquipo: 'Generador',
      codigoEquipo: e.codigo || String(e.rowIndex),
      nombreEquipo: [e.equipo, marcaModelo].filter(Boolean).join(' — ') || 'Generador',
      ubicacionActual: e.ubicacion || '',
      icon: invIcono(e.equipo),
    });
  });
  (typeof allMaqMenor !== 'undefined' ? allMaqMenor : []).forEach(e => {
    const marcaModelo = [e.marca, e.modelo].filter(Boolean).join(' ');
    items.push({
      key: `maqmenor:${e.rowIndex}`, modulo: 'maqmenor', rowIndex: e.rowIndex,
      tipoEquipo: 'Maq. Menor',
      codigoEquipo: e.codigo || String(e.rowIndex),
      nombreEquipo: [e.equipo, marcaModelo].filter(Boolean).join(' — ') || 'Maq. Menor',
      ubicacionActual: e.ubicacion || '',
      icon: invIcono(e.equipo),
    });
  });
  (typeof allHerramientas !== 'undefined' ? allHerramientas : []).forEach(e => {
    const marcaModelo = [e.marca, e.modelo].filter(Boolean).join(' ');
    items.push({
      key: `herramientas:${e.rowIndex}`, modulo: 'herramientas', rowIndex: e.rowIndex,
      tipoEquipo: 'Herramienta',
      codigoEquipo: e.codigo || String(e.rowIndex),
      nombreEquipo: [e.equipo, marcaModelo].filter(Boolean).join(' — ') || 'Herramienta',
      ubicacionActual: e.ubicacion || '',
      icon: invIcono(e.equipo),
    });
  });
  (typeof allContainers !== 'undefined' ? allContainers : []).forEach(e => {
    items.push({
      key: `cont:${e.rowIndex}`, modulo: 'cont', rowIndex: e.rowIndex,
      tipoEquipo: 'Container',
      codigoEquipo: String(e.num || e.rowIndex),
      nombreEquipo: e.tipo || 'Container',
      ubicacionActual: e.ubicacion || '',
      icon: invIcono(e.tipo),
    });
  });
  return items;
}

function movhRenderLista() {
  const searchEl = document.getElementById('movh-search');
  const txt = searchEl ? searchEl.value.toLowerCase() : '';

  let items = _movhTodosLosItems();
  if (movhFiltroTipo !== 'todos') items = items.filter(i => i.modulo === movhFiltroTipo);
  if (txt) {
    items = items.filter(i => (i.nombreEquipo + i.codigoEquipo + i.ubicacionActual + i.tipoEquipo).toLowerCase().includes(txt));
  }
  items.sort((a, b) => a.nombreEquipo.localeCompare(b.nombreEquipo, 'es'));

  const html = items.map(item => {
    const checked = movhSeleccion.has(item.key);
    return `<div class="card" onclick="movhToggleItem('${item.key}')">
      <div class="card-checkbox movh-checkbox ${checked ? 'checked' : ''}">${checked ? '✓' : ''}</div>
      <div class="card-icon">${item.icon}</div>
      <div class="card-body">
        <div class="card-title">${item.nombreEquipo}</div>
        <div class="card-sub">${item.tipoEquipo} · ${item.codigoEquipo}</div>
      </div>
      <div class="card-right">
        <span style="font-size:11px;color:#aaa">${item.ubicacionActual || '—'}</span>
        <button type="button" class="btn-detalle-mini" title="Ver detalles y fotos" onclick="event.stopPropagation();movhVerDetalle('${item.modulo}',${item.rowIndex})">
          <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6"/><path d="M12 11v5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="8" r="1" fill="currentColor"/></svg>
        </button>
      </div>
    </div>`;
  }).join('') || emptyState('Sin resultados','Probá con otro filtro o búsqueda');


  const lista = document.getElementById('movh-lista');
  const listaDt = document.getElementById('movh-dt-lista');
  if (lista) lista.innerHTML = html;
  if (listaDt) listaDt.innerHTML = html;
  _movhActualizarBarra();
}

// Abre la ficha completa (datos + fotos) de un equipo/ítem desde el módulo de Movimientos,
// sin alterar la selección en curso. Usa el visor de detalle correcto según el módulo de origen.
function movhVerDetalle(modulo, rowIndex) {
  if (modulo === 'flota') {
    const eq = (typeof allEquipos !== 'undefined' ? allEquipos : []).find(e => e.rowIndex === rowIndex);
    if (!eq) { toast('Equipo no encontrado', 'error'); return; }
    openFicha(eq.patente, true);
  } else {
    invAbrirDetalle(modulo, rowIndex, true);
  }
}

function movhToggleItem(key) {
  if (typeof userRole !== 'undefined' && userRole === 'viewer') return; // solo lectura, no puede seleccionar
  if (movhSeleccion.has(key)) movhSeleccion.delete(key);
  else movhSeleccion.add(key);
  movhRenderLista();
}

function movhCancelarSeleccion() {
  movhSeleccion.clear();
  movhRenderLista();
}

function _movhActualizarBarra() {
  const bar = document.getElementById('movh-selbar');
  const barDt = document.getElementById('movh-selbar-desktop');
  const count = document.getElementById('movh-sel-count');
  const countDt = document.getElementById('movh-sel-count-dt');
  const txt = `${movhSeleccion.size} seleccionados`;
  [{bar, count}, {bar: barDt, count: countDt}].forEach(({bar, count}) => {
    if (!bar) return;
    if (movhSeleccion.size > 0) {
      bar.classList.remove('hidden');
      bar.classList.add('show');
      if (count) count.textContent = txt;
    } else {
      bar.classList.add('hidden');
      bar.classList.remove('show');
    }
  });
}

// Abre el panel de mover (reutiliza panel-mover-multi) con los ítems seleccionados,
// sea cual sea su tipo (flota, inventario o containers)
function movhAbrirMoverSeleccion() {
  const todos = _movhTodosLosItems();
  _movMultiItems = [];
  _movMultiOverrides = {};
  movhSeleccion.forEach(key => {
    const item = todos.find(i => i.key === key);
    if (item) _movMultiItems.push(item);
  });
  _abrirPanelMoverMulti();
}

// Renderiza la lista de movimientos pendientes de recepción + badge en tabs
function movhRenderPendientes() {
  const pendientes = (allMovimientos || [])
    .filter(m => !m.estado || m.estado === 'en_transito')
    .sort((a, b) => b.rowIndex - a.rowIndex);

  // Actualizar badges en ambas tabs (móvil y desktop)
  const n = pendientes.length;
  ['movh-dt-badge-pend', 'movh-mob-badge-pend'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (n > 0) { el.style.display = 'inline'; el.textContent = n; }
    else el.style.display = 'none';
  });

  const svgCamion = `<svg viewBox="0 0 24 24" fill="none" class="equipo-svg"><path d="M3 16h1M3 16V9a1 1 0 0 1 1-1h9v8M12 16h7" stroke="white" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 11h4l3 3v2" stroke="white" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><circle cx="7" cy="16.5" r="1.6" stroke="white" stroke-width="1.6"/><circle cx="16" cy="16.5" r="1.6" stroke="white" stroke-width="1.6"/></svg>`;

  let html;
  if (pendientes.length === 0) {
    html = emptyState('Sin pendientes', 'Todos los movimientos han sido recepcionados');
  } else {
    html = pendientes.map(m => `
      <div class="evento-card-mini" onclick="movAbrirRecepcion('${m.id}', ${m.rowIndex})" style="cursor:pointer">
        <div class="evento-tipo-icon" style="background:linear-gradient(135deg,#f59e0b,#d97706)">${svgCamion}</div>
        <div class="mant-body" style="flex:1">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
            <div class="mant-title">${m.tipoEquipo || '—'} — ${m.nombreEquipo || '—'}</div>
            <span style="background:#fef3c7;color:#b45309;border-radius:99px;padding:2px 8px;font-size:10px;font-weight:700;white-space:nowrap">En tránsito</span>
          </div>
          <div class="mant-meta">${m.fechaSalida} · ${m.origen || '—'} → ${m.destino || '—'}${m.guiaDespacho ? ' · Guía N° ' + m.guiaDespacho : ''}</div>
          ${m.traslada ? `<div class="evento-desc">Traslada: ${m.traslada}${m.autoriza ? ' · Autoriza: ' + m.autoriza : ''}</div>` : ''}
        </div>
        <div style="flex-shrink:0;padding-left:6px;color:#94a3b8">
          <svg viewBox="0 0 24 24" fill="none" style="width:16px;height:16px"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
      </div>`).join('');
  }

  const mob = document.getElementById('movh-pendientes-lista');
  const dt  = document.getElementById('movh-dt-pendientes-lista');
  if (mob) mob.innerHTML = html;
  if (dt)  dt.innerHTML  = html;
}

// Variable para la foto de recepción pendiente
let _recvFotoRef = null;

// Abre el panel de recepción con los datos del movimiento
function movAbrirRecepcion(movId, rowIndex) {
  const m = (allMovimientos || []).find(x => x.id === movId && x.rowIndex === rowIndex)
         || (allMovimientos || []).find(x => x.rowIndex === rowIndex);
  if (!m) { toast('Movimiento no encontrado', 'error'); return; }

  _recvFotoRef = null;
  document.getElementById('recv-mov-id').value = m.id;
  document.getElementById('recv-row-index').value = m.rowIndex;
  document.getElementById('recv-fecha').value = new Date().toISOString().slice(0, 10);
  document.getElementById('recv-recibe').value = '';
  document.getElementById('recv-obs').value = '';
  // Limpiar foto
  const prevWrap = document.getElementById('recv-foto-preview');
  const prevImg  = document.getElementById('recv-foto-preview-img');
  const lblFoto  = document.getElementById('recv-foto-label');
  const statusFoto = document.getElementById('recv-foto-status');
  if (prevWrap) prevWrap.style.display = 'none';
  if (prevImg)  prevImg.src = '';
  if (lblFoto)  lblFoto.textContent = 'Seleccionar foto…';
  if (statusFoto) statusFoto.style.display = 'none';
  // Rellenar resumen
  document.getElementById('recv-resumen-equipo').textContent = `${m.tipoEquipo || ''} — ${m.nombreEquipo || ''}`;
  const metaParts = [
    m.fechaSalida,
    m.origen && m.destino ? `${m.origen} → ${m.destino}` : (m.destino || ''),
    m.guiaDespacho ? `Guía N° ${m.guiaDespacho}` : '',
    m.traslada ? `Traslada: ${m.traslada}` : '',
  ].filter(Boolean);
  document.getElementById('recv-resumen-meta').textContent = metaParts.join(' · ');

  openPanel('panel-recepcionar');
}

// Maneja la selección de foto de recepción
function onRecvFotoSelected(input) {
  if (!input.files || !input.files.length) return;
  const file = input.files[0];
  const reader = new FileReader();
  reader.onload = () => {
    _recvFotoRef = {
      b64: reader.result.split(',')[1],
      name: file.name,
      mimeType: file.type || 'image/jpeg',
      previewUrl: reader.result,
    };
    const prevWrap = document.getElementById('recv-foto-preview');
    const prevImg  = document.getElementById('recv-foto-preview-img');
    const lblFoto  = document.getElementById('recv-foto-label');
    if (prevImg)  prevImg.src = reader.result;
    if (prevWrap) prevWrap.style.display = 'block';
    if (lblFoto)  lblFoto.textContent = file.name;
  };
  reader.readAsDataURL(file);
  input.value = '';
}

// Guarda la recepción: escribe en columnas M(estado), N, O, P, Q del Sheet
async function movGuardarRecepcion() {
  const movId    = document.getElementById('recv-mov-id').value;
  const rowIndex = parseInt(document.getElementById('recv-row-index').value);
  const fecha    = document.getElementById('recv-fecha').value;
  const recibe   = document.getElementById('recv-recibe').value.trim();
  const obs      = document.getElementById('recv-obs').value.trim();

  if (!fecha)  { toast('La fecha de recepción es obligatoria', 'error'); document.getElementById('recv-fecha').focus(); return; }
  if (!recibe) { toast('Indica quién recibe', 'error'); document.getElementById('recv-recibe').focus(); return; }

  const btn = document.querySelector('#panel-recepcionar .pnl-action');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }

  try {
    const fechaFmt = "'" + fecha.split('-').reverse().join('/');
    let fotoNombre = '';

    // Subir foto a Drive si hay una seleccionada
    if (_recvFotoRef) {
      const statusEl = document.getElementById('recv-foto-status');
      if (statusEl) { statusEl.style.display = 'block'; statusEl.textContent = 'Subiendo foto…'; }
      try {
        let folderId = DRIVE_INV_FOLDER;
        try {
          const recvFolder = await findOrCreateFolder('Recepciones_Movimientos', DRIVE_INV_FOLDER);
          folderId = recvFolder;
        } catch(fe) { console.warn('[RECV FOTO] Carpeta fallback:', fe.message); }

        const ext      = _recvFotoRef.name.split('.').pop() || 'jpg';
        const fileName = `RECV_${movId || rowIndex}_${fecha.replace(/-/g,'')}.${ext}`;
        const boundary = 'lst_recv_' + Date.now();
        const metadata = JSON.stringify({ name: fileName, parents: [folderId] });
        const body = [
          '--' + boundary, 'Content-Type: application/json; charset=UTF-8', '',
          metadata,
          '--' + boundary, 'Content-Type: ' + _recvFotoRef.mimeType,
          'Content-Transfer-Encoding: base64', '',
          _recvFotoRef.b64,
          '--' + boundary + '--',
        ].join('\r\n');

        const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + accessToken, 'Content-Type': 'multipart/related; boundary=' + boundary },
          body,
        });
        if (res.ok) {
          const result = await res.json();
          fotoNombre = result.name;
          if (statusEl) statusEl.textContent = 'Foto subida ✓';
        } else {
          const err = await res.text();
          console.error('[RECV FOTO]', err);
          toast('Foto no se pudo subir: ' + res.status, 'error');
        }
      } catch(fe) {
        console.error('[RECV FOTO]', fe.message);
        toast('Error subiendo foto: ' + fe.message, 'error');
      }
    }

    // Escribir columnas M=ESTADO, N=FECHA_RECEPCION, O=RECIBE, P=OBS_RECEPCION, Q=FOTO
    // Usamos batchUpdate escribiendo rango M:Q de la fila correspondiente
    await writeSheet(`'${SHEET_MOVIMIENTOS}'!M${rowIndex}:Q${rowIndex}`, [[
      'recibido', fechaFmt, recibe, obs, fotoNombre
    ]]);

    toast('Recepción confirmada ✓');
    _origClosePanel('panel-recepcionar');
    const idx = _panelStack.lastIndexOf('panel-recepcionar');
    if (idx !== -1) _panelStack.splice(idx, 1);

    await loadMovimientos();
    movhRenderPendientes();
    movhRenderHistorial();
    // Actualizar historial en fichas de equipos también
    if (typeof renderInvLista === 'function') renderInvLista();

  } catch(err) {
    toast('Error: ' + err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Confirmar'; }
  }
}

// Renderiza el historial global de movimientos (todos los tipos), más recientes primero
function movhRenderHistorial() {
  const cont = document.getElementById('movh-historial-lista');
  const contDt = document.getElementById('movh-dt-historial-lista');
  const hist = (allMovimientos || []).slice().sort((a, b) => b.rowIndex - a.rowIndex).slice(0, 100);

  let html;
  if (hist.length === 0) {
    html = emptyState('Sin movimientos','No hay traslados registrados');
  } else {
    html = hist.map(m => {
      const recibido = m.estado === 'recibido';
      const badge = recibido
        ? `<span style="background:#dcfce7;color:#15803d;border-radius:99px;padding:2px 8px;font-size:10px;font-weight:700;white-space:nowrap">Recibido</span>`
        : `<span style="background:#fef3c7;color:#b45309;border-radius:99px;padding:2px 8px;font-size:10px;font-weight:700;white-space:nowrap">En tránsito</span>`;
      return `
      <div class="evento-card-mini">
        <div class="evento-tipo-icon"><svg viewBox="0 0 24 24" fill="none" class="equipo-svg"><path d="M3 16h1M3 16V9a1 1 0 0 1 1-1h9v8M12 16h7" stroke="white" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 11h4l3 3v2" stroke="white" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><circle cx="7" cy="16.5" r="1.6" stroke="white" stroke-width="1.6"/><circle cx="16" cy="16.5" r="1.6" stroke="white" stroke-width="1.6"/></svg></div>
        <div class="mant-body">
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:2px">
            <div class="mant-title" style="margin:0">${m.tipoEquipo || '—'} — ${m.nombreEquipo || '—'}</div>
            ${badge}
          </div>
          <div class="mant-meta">${m.fechaSalida} · ${m.origen || '—'} → ${m.destino || '—'}${m.guiaDespacho ? ' · Guía N° ' + m.guiaDespacho : ''}</div>
          ${m.traslada ? `<div class="evento-desc">Traslada: ${m.traslada}${m.autoriza ? ' · Autoriza: ' + m.autoriza : ''}</div>` : ''}
          ${m.obsSalida ? `<div class="evento-desc"><svg viewBox="0 0 24 24" fill="none" class="inline-ic"><path d="M6 2h9l3 3v17H6Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M9 11h6M9 15h6M9 7h3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg> ${m.obsSalida}</div>` : ''}
          ${recibido ? `<div class="evento-desc" style="color:#15803d"><svg viewBox="0 0 24 24" fill="none" class="inline-ic"><path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg> Recibido el ${m.fechaRecepcion} por ${m.recibe}${m.obsRecepcion ? ' · ' + m.obsRecepcion : ''}</div>` : ''}
        </div>
      </div>`;
    }).join('');
  }
  if (cont) cont.innerHTML = html;
  if (contDt) contDt.innerHTML = html;
}

// ══════════════════════════════════════════════════════════════
// MÓDULO ANDAMIOS — Conteo de piezas
// Hoja 'ANDAMIOS' en el mismo Sheet: A=rowIndex(fila real) B=TIPO
// C=FOTO(nombre archivo en Drive) D=CANTIDAD E=OBS
// ══════════════════════════════════════════════════════════════
const SHEET_ANDAMIOS = 'ANDAMIOS';
let allAndamios = [];      // [{ rowIndex, tipo, foto, cantidad, obs }]
let andItemActual = null;  // ítem abierto en panel-and-edit
let _andNuevoFoto = null;
let _andEditFoto  = null;
let _andGuardando = false; // evita doble-tap en +/- mientras se escribe a Sheets

// Carga (o recarga) los datos desde Sheets y renderiza
async function andCargar() {
  try {
    const rows = await fetchSheet(`'${SHEET_ANDAMIOS}'!A2:E500`);
    allAndamios = (rows || [])
      .map((r, i) => ({
        rowIndex: i + 2, // fila real en la hoja (offset por header en fila 1)
        tipo: r[0] || '',
        foto: r[1] || '',
        cantidad: parseInt(r[2]) || 0,
        obs: r[3] || '',
      }))
      .filter(x => x.tipo); // ignora filas vacías
  } catch (e) {
    console.warn('[ANDAMIOS] Hoja no encontrada aún, se creará al guardar el primer tipo', e.message);
    allAndamios = [];
  }
  andRenderLista();
}

function andInit() {
  andCargar();
}

function andRenderLista() {
  // Oculta el botón de importación inicial en cuanto ya existan piezas cargadas
  const mostrarImport = allAndamios.length === 0 ? '' : 'none';
  const importBar = document.getElementById('and-import-bar');
  if (importBar) importBar.style.display = mostrarImport;
  const importBarDt = document.getElementById('and-dt-import-bar');
  if (importBarDt) importBarDt.style.display = mostrarImport;

  // Sincroniza el texto de búsqueda entre el buscador móvil y el desktop
  const searchEl   = document.getElementById('and-search');
  const searchDtEl = document.getElementById('and-dt-search');
  const txt = (searchEl ? searchEl.value : searchDtEl ? searchDtEl.value : '').toLowerCase();

  const filtrados = allAndamios
    .filter(it => !txt || (it.tipo + it.obs).toLowerCase().includes(txt))
    .sort((a, b) => a.tipo.localeCompare(b.tipo, 'es'));

  // suffix distingue los ids entre la copia móvil ('') y la copia desktop ('-dt')
  // para que ambas puedan coexistir en el DOM sin chocar
  const buildHtml = (suffix) => filtrados.map(it => `
    <div class="and-card">
      <div class="and-thumb" id="and-thumb${suffix}-${it.rowIndex}" onclick="andVerFoto(${it.rowIndex})">
        ${it.foto ? '' : `<svg viewBox="0 0 24 24" fill="none" style="width:24px;height:24px"><path d="M4 8a1 1 0 0 1 1-1h2l1.2-2h7.6L17 7h2a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><circle cx="12" cy="13" r="3.2" stroke="currentColor" stroke-width="1.6"/></svg>`}
      </div>
      <div class="and-info" onclick="andAbrirEditar(${it.rowIndex})">
        <div class="and-nombre">${it.tipo}</div>
        ${it.obs ? `<div class="and-obs">${it.obs}</div>` : ''}
      </div>
      <div class="and-counter">
        <button class="and-btn and-btn--minus" onclick="andCambiarCantidad(${it.rowIndex},-1)">−</button>
        <span class="and-num" id="and-num${suffix}-${it.rowIndex}">${it.cantidad}</span>
        <button class="and-btn" onclick="andCambiarCantidad(${it.rowIndex},1)">+</button>
      </div>
    </div>`).join('') || emptyState('Sin piezas registradas', 'Toca el botón ＋ para agregar el primer tipo de pieza');

  const lista   = document.getElementById('and-lista');
  const listaDt = document.getElementById('and-dt-lista');
  if (lista)   lista.innerHTML   = buildHtml('');
  if (listaDt) listaDt.innerHTML = buildHtml('-dt');

  // Cargar miniaturas de foto (async, no bloquea el render) en ambas copias
  filtrados.forEach(it => {
    if (!it.foto) return;
    invCargarMiniaturaAndamio(it.foto, `and-thumb-${it.rowIndex}`);
    invCargarMiniaturaAndamio(it.foto, `and-thumb-dt-${it.rowIndex}`);
  });

  const total = allAndamios.reduce((sum, it) => sum + (it.cantidad || 0), 0);
  const totalEl = document.getElementById('and-total');
  if (totalEl) totalEl.textContent = total;
  const totalDtEl = document.getElementById('and-dt-total');
  if (totalDtEl) totalDtEl.textContent = total;
}

// Sincroniza búsqueda desktop → móvil (andRenderLista lee ambos campos)
function andSyncSearch() {
  const dtInput = document.getElementById('and-dt-search');
  const mobInput = document.getElementById('and-search');
  if (dtInput && mobInput) mobInput.value = dtInput.value;
  andRenderLista();
}

// Miniatura simplificada (reutiliza la búsqueda en Drive por nombre de archivo,
// pero con thumb cuadrado en vez del formato "hero" de fichas)
async function invCargarMiniaturaAndamio(fileName, thumbId) {
  const el = document.getElementById(thumbId);
  if (!el || !fileName) return;
  try {
    const q = encodeURIComponent(`name = '${fileName}' and trashed = false`);
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,thumbnailLink)&pageSize=1`,
      { headers: { 'Authorization': 'Bearer ' + accessToken } }
    );
    if (!res.ok) return;
    const data = await res.json();
    if (!data.files || data.files.length === 0) return;
    const file = data.files[0];
    const imgUrl = `https://drive.google.com/uc?export=view&id=${file.id}`;
    const fallbackUrl = file.thumbnailLink ? file.thumbnailLink.replace(/=s\d+$/, '=s200') : '';
    el.innerHTML = `<img src="${imgUrl}" alt="Foto" onerror="if(this.src!=='${fallbackUrl}' && '${fallbackUrl}'){this.src='${fallbackUrl}'}">`;
    el._driveFileId = file.id;
  } catch (e) { /* silencioso: si falla, se queda el ícono placeholder */ }
}

// Abre la foto de un tipo en pantalla completa (reutiliza el modal genérico)
function andVerFoto(rowIndex) {
  const it = allAndamios.find(x => x.rowIndex === rowIndex);
  if (!it || !it.foto) return;
  invAbrirFotoModal(it.foto);
}

// ── Botones +1 / -1 ──────────────────────────────────────────
// Actualiza en memoria y en pantalla al instante (feedback inmediato para
// contar rápido), y escribe a Sheets en segundo plano.
async function andCambiarCantidad(rowIndex, delta) {
  if (typeof userRole !== 'undefined' && userRole === 'viewer') { toast('Sin permisos para modificar', 'error'); return; }
  const it = allAndamios.find(x => x.rowIndex === rowIndex);
  if (!it) return;

  const nueva = Math.max(0, (it.cantidad || 0) + delta);
  if (nueva === it.cantidad) return; // ya estaba en 0 y se intentó restar
  it.cantidad = nueva;

  // Feedback visual inmediato en ambas copias (móvil y desktop)
  const num = document.getElementById(`and-num-${rowIndex}`);
  if (num) num.textContent = nueva;
  const numDt = document.getElementById(`and-num-dt-${rowIndex}`);
  if (numDt) numDt.textContent = nueva;
  const total = allAndamios.reduce((sum, x) => sum + (x.cantidad || 0), 0);
  const totalEl = document.getElementById('and-total');
  if (totalEl) totalEl.textContent = total;
  const totalDtEl = document.getElementById('and-dt-total');
  if (totalDtEl) totalDtEl.textContent = total;

  // Escribir a Sheets (columna C = cantidad, fila rowIndex)
  try {
    await writeSheet(`'${SHEET_ANDAMIOS}'!C${rowIndex}`, [[nueva]]);
  } catch (e) {
    toast('No se pudo guardar el conteo: ' + e.message, 'error');
    // revertir en memoria y en pantalla si falló el guardado
    it.cantidad = nueva - delta;
    if (num) num.textContent = it.cantidad;
    if (numDt) numDt.textContent = it.cantidad;
  }
}

// ── Nuevo tipo de pieza ────────────────────────────────────────
function andAbrirNuevo() {
  document.getElementById('and-nuevo-nombre').value = '';
  document.getElementById('and-nuevo-cantidad').value = '0';
  document.getElementById('and-nuevo-obs').value = '';
  _andNuevoFoto = null;
  const prev = document.getElementById('and-nuevo-foto-preview');
  prev.innerHTML = ''; prev.style.display = 'none';
  openPanel('panel-and-nuevo');
}

function onAndNuevoFotoSelected(input) {
  if (!input.files || !input.files.length) return;
  const file = input.files[0];
  const reader = new FileReader();
  reader.onload = () => {
    _andNuevoFoto = { b64: reader.result.split(',')[1], name: file.name, mimeType: file.type || 'image/jpeg' };
    const prev = document.getElementById('and-nuevo-foto-preview');
    prev.style.display = 'block';
    prev.innerHTML = `<img src="${reader.result}" style="width:100%;max-height:160px;object-fit:cover;border-radius:10px;margin-top:8px">`;
  };
  reader.readAsDataURL(file);
  input.value = '';
}

async function andGuardarNuevo() {
  const nombre = document.getElementById('and-nuevo-nombre').value.trim();
  const cantidad = parseInt(document.getElementById('and-nuevo-cantidad').value) || 0;
  const obs = document.getElementById('and-nuevo-obs').value.trim();
  if (!nombre) { toast('El nombre de la pieza es obligatorio', 'error'); document.getElementById('and-nuevo-nombre').focus(); return; }

  const btn = document.querySelector('#panel-and-nuevo .pnl-action');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }

  try {
    toast('Guardando...');
    // Se agrega primero sin foto para conocer la fila real (rowIndex) donde quedó
    await appendSheet(`'${SHEET_ANDAMIOS}'!A:D`, [[nombre, '', cantidad, obs]]);

    let fotoNombre = '';
    if (_andNuevoFoto) {
      if (btn) btn.textContent = 'Subiendo foto...';
      try {
        const folderId = await findOrCreateFolder('Andamios', DRIVE_INV_FOLDER);
        const ext = _andNuevoFoto.name.split('.').pop() || 'jpg';
        const fileName = `AND_${nombre.replace(/[^a-zA-Z0-9]+/g,'_')}_${Date.now()}.${ext}`;
        const boundary = 'lst_and_' + Date.now();
        const metadata = JSON.stringify({ name: fileName, parents: [folderId] });
        const body = ['--'+boundary,'Content-Type: application/json; charset=UTF-8','',metadata,'--'+boundary,'Content-Type: '+_andNuevoFoto.mimeType,'Content-Transfer-Encoding: base64','',_andNuevoFoto.b64,'--'+boundary+'--'].join('\r\n');
        const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
          method: 'POST', headers: { 'Authorization': 'Bearer ' + accessToken, 'Content-Type': 'multipart/related; boundary=' + boundary }, body,
        });
        if (res.ok) { const r = await res.json(); fotoNombre = r.name; }
      } catch (fe) { toast('Tipo guardado, pero la foto falló: ' + fe.message, 'error'); }
    }

    await andCargar();
    if (fotoNombre) {
      const it = allAndamios.find(x => x.tipo === nombre);
      if (it) await writeSheet(`'${SHEET_ANDAMIOS}'!B${it.rowIndex}`, [[fotoNombre]]);
      await andCargar();
    }

    toast('✓ Tipo de pieza agregado');
    _origClosePanel('panel-and-nuevo');
    const idx = _panelStack.lastIndexOf('panel-and-nuevo');
    if (idx !== -1) _panelStack.splice(idx, 1);
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Guardar'; }
  }
}

// ── Editar tipo existente ───────────────────────────────────────
function andAbrirEditar(rowIndex) {
  const it = allAndamios.find(x => x.rowIndex === rowIndex);
  if (!it) return;
  andItemActual = it;

  document.getElementById('and-edit-row').value = it.rowIndex;
  document.getElementById('and-edit-nombre').value = it.tipo;
  document.getElementById('and-edit-cantidad').value = it.cantidad;
  document.getElementById('and-edit-obs').value = it.obs || '';
  _andEditFoto = null;
  const prev = document.getElementById('and-edit-foto-preview');
  prev.innerHTML = ''; prev.style.display = 'none';

  openPanel('panel-and-edit');
}

function onAndEditFotoSelected(input) {
  if (!input.files || !input.files.length) return;
  const file = input.files[0];
  const reader = new FileReader();
  reader.onload = () => {
    _andEditFoto = { b64: reader.result.split(',')[1], name: file.name, mimeType: file.type || 'image/jpeg' };
    const prev = document.getElementById('and-edit-foto-preview');
    prev.style.display = 'block';
    prev.innerHTML = `<img src="${reader.result}" style="width:100%;max-height:160px;object-fit:cover;border-radius:10px;margin-top:8px">`;
  };
  reader.readAsDataURL(file);
  input.value = '';
}

async function andGuardarEdit() {
  const row = parseInt(document.getElementById('and-edit-row').value);
  const nombre = document.getElementById('and-edit-nombre').value.trim();
  const cantidad = parseInt(document.getElementById('and-edit-cantidad').value) || 0;
  const obs = document.getElementById('and-edit-obs').value.trim();
  if (!row) return;
  if (!nombre) { toast('El nombre de la pieza es obligatorio', 'error'); document.getElementById('and-edit-nombre').focus(); return; }

  const btn = document.querySelector('#panel-and-edit .pnl-action');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }

  try {
    toast('Guardando...');
    await Promise.all([
      writeSheet(`'${SHEET_ANDAMIOS}'!A${row}`, [[nombre]]),
      writeSheet(`'${SHEET_ANDAMIOS}'!C${row}`, [[cantidad]]),
      writeSheet(`'${SHEET_ANDAMIOS}'!D${row}`, [[obs]]),
    ]);

    if (_andEditFoto) {
      if (btn) btn.textContent = 'Subiendo foto...';
      try {
        const folderId = await findOrCreateFolder('Andamios', DRIVE_INV_FOLDER);
        const ext = _andEditFoto.name.split('.').pop() || 'jpg';
        const fileName = `AND_${nombre.replace(/[^a-zA-Z0-9]+/g,'_')}_${Date.now()}.${ext}`;
        const boundary = 'lst_and_' + Date.now();
        const metadata = JSON.stringify({ name: fileName, parents: [folderId] });
        const body = ['--'+boundary,'Content-Type: application/json; charset=UTF-8','',metadata,'--'+boundary,'Content-Type: '+_andEditFoto.mimeType,'Content-Transfer-Encoding: base64','',_andEditFoto.b64,'--'+boundary+'--'].join('\r\n');
        const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
          method: 'POST', headers: { 'Authorization': 'Bearer ' + accessToken, 'Content-Type': 'multipart/related; boundary=' + boundary }, body,
        });
        if (res.ok) { const r = await res.json(); await writeSheet(`'${SHEET_ANDAMIOS}'!B${row}`, [[r.name]]); }
      } catch (fe) { toast('Guardado, pero la foto falló: ' + fe.message, 'error'); }
    }

    toast('✓ Guardado');
    _origClosePanel('panel-and-edit');
    const idx = _panelStack.lastIndexOf('panel-and-edit');
    if (idx !== -1) _panelStack.splice(idx, 1);
    await andCargar();
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Guardar'; }
  }
}

async function andEliminarTipo() {
  const row = parseInt(document.getElementById('and-edit-row').value);
  if (!row) return;
  if (!confirm('¿Eliminar este tipo de pieza? Esta acción no se puede deshacer.')) return;

  try {
    toast('Eliminando...');
    // No hay endpoint simple de "borrar fila" vía values API sin batchUpdate con sheetId;
    // se vacían sus celdas para no dejar basura visible en el conteo.
    await writeSheet(`'${SHEET_ANDAMIOS}'!A${row}:D${row}`, [['', '', '', '']]);
    toast('✓ Eliminado');
    _origClosePanel('panel-and-edit');
    const idx = _panelStack.lastIndexOf('panel-and-edit');
    if (idx !== -1) _panelStack.splice(idx, 1);
    await andCargar();
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  }
}

// ── Importación inicial del catálogo Andamio Europeo (Alzatec) ──────────
// Sube cada foto a Drive y agrega la fila correspondiente en la hoja ANDAMIOS.
// Pensada para ejecutarse una sola vez; el botón se oculta solo apenas hay datos.
async function andImportarSeed() {
  if (typeof ANDAMIOS_SEED === 'undefined') { toast('No se encontró el catálogo a importar', 'error'); return; }
  if (allAndamios.length > 0) {
    if (!confirm('Ya hay piezas cargadas. ¿Importar de todos modos? Esto puede crear tipos duplicados.')) return;
  } else {
    if (!confirm(`Se importarán ${ANDAMIOS_SEED.length} tipos de pieza con sus fotos y cantidades del proyecto. ¿Continuar?`)) return;
  }

  const btns = document.querySelectorAll('#and-import-bar .action-btn, #and-dt-import-bar .action-btn');
  btns.forEach(b => b.disabled = true);

  let folderId = DRIVE_INV_FOLDER;
  try { folderId = await findOrCreateFolder('Andamios', DRIVE_INV_FOLDER); } catch (e) {}

  let ok = 0, fallidos = 0;
  for (let i = 0; i < ANDAMIOS_SEED.length; i++) {
    const item = ANDAMIOS_SEED[i];
    btns.forEach(b => b.textContent = `Importando ${i + 1}/${ANDAMIOS_SEED.length}: ${item.tipo}...`);
    toast(`Importando: ${item.tipo}`);

    let fotoNombre = '';
    if (item.fotoB64) {
      try {
        const fileName = `AND_${item.tipo.replace(/[^a-zA-Z0-9]+/g, '_')}.jpg`;
        const boundary = 'lst_and_seed_' + Date.now() + '_' + i;
        const metadata = JSON.stringify({ name: fileName, parents: [folderId] });
        const body = ['--' + boundary, 'Content-Type: application/json; charset=UTF-8', '', metadata, '--' + boundary, 'Content-Type: image/jpeg', 'Content-Transfer-Encoding: base64', '', item.fotoB64, '--' + boundary + '--'].join('\r\n');
        const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
          method: 'POST', headers: { 'Authorization': 'Bearer ' + accessToken, 'Content-Type': 'multipart/related; boundary=' + boundary }, body,
        });
        if (res.ok) { const r = await res.json(); fotoNombre = r.name; }
      } catch (fe) { console.warn('[ANDAMIOS SEED] Foto falló para', item.tipo, fe.message); }
    }

    try {
      await appendSheet(`'${SHEET_ANDAMIOS}'!A:D`, [[item.tipo, fotoNombre, item.cantidad, item.obs || '']]);
      ok++;
    } catch (e) {
      fallidos++;
      console.warn('[ANDAMIOS SEED] Fila falló para', item.tipo, e.message);
    }
  }

  btns.forEach(b => { b.disabled = false; b.textContent = '⬇ Importar catálogo Andamio Europeo (una sola vez)'; });
  toast(`✓ Importación terminada: ${ok} piezas agregadas${fallidos ? `, ${fallidos} con error` : ''}`);
  await andCargar();
}
