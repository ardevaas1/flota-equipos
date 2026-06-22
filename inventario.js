// ============================================
// MÓDULOS INVENTARIO & CONTAINERS — LST
// Generadores (con eventos), Maq. Menor,
// Herramientas, Containers
// ============================================

// ── Carpeta Drive exclusiva para fotos de Inventario & Containers ──
const DRIVE_INV_FOLDER = '1VTFqBY-uF8vAapnsnnF2YvN8T5CUb52g';

// ── Paneles secundarios de inventario (ocultan el FAB) ────────
const INV_PANELES_SECUNDARIOS = [
  'panel-inv-detalle','panel-inv-edit','panel-gen-evento',
  'panel-cont-detalle','panel-cont-edit',
  'panel-nuevo-inv','panel-nuevo-cont',
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

// ── Colores de estado ─────────────────────────────────────────
const INV_ESTADO_COLOR = {
  'operativo':  'green',
  'revisar':    'amber',
  'malo':       'red',
  'mala':       'red',
  'en revisión':'amber',
  'nuevo':      'blue',
};

function invEstadoColor(estado) {
  const k = (estado || '').toLowerCase().trim();
  return INV_ESTADO_COLOR[k] || 'gray';
}

// ── Icono simple por tipo de equipo inventario ────────────────
const INV_ICONOS = {
  generador: '⚡',
  soplador: '💨',
  vibroapisonador: '🔨',
  aspiradora: '🌀',
  turbocalefactor: '🔥',
  compresor: '🔧',
  hidrolavadora: '💧',
  'cortadora de asfalto': '⚙️',
  motobomba: '🚰',
  'bomba sumergible': '🌊',
  'placa compactadora': '🪨',
  betonera: '🔄',
  'unidad motriz': '⚙️',
  rodillo: '🛞',
  demoledor: '💥',
  'pistola impacto': '🔩',
  'pulidora hormigón': '✨',
  teodolito: '📐',
  esmeril: '⚙️',
  taladro: '🔩',
  container: '📦',
  bodega: '🏚️',
  oficina: '🏢',
  baño: '🚽',
};

function invIcono(equipo) {
  const k = (equipo || '').toLowerCase();
  for (const [key, icon] of Object.entries(INV_ICONOS)) {
    if (k.includes(key)) return icon;
  }
  return '🔧';
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
    .map((r, i) => ({ r, rowIndex: i + 2 }))
    .filter(({ r }) => r[0] && !isNaN(parseInt(r[0])))
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
      fetchSheet(`'${SHEET_CONTAINERS}'!A2:J100`),
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
    return `<div class="card" onclick="invAbrirDetalle('${invModulo}',${item.rowIndex})">
      <div class="card-icon" style="font-size:22px">${icon}</div>
      <div class="card-body">
        <div class="card-title">${titulo}</div>
        <div class="card-sub">${sub}</div>
        <span class="badge ${cls}" style="margin-top:4px;display:inline-block">${item.estado||'Sin estado'}</span>
      </div>
      <div class="card-right">
        <span class="card-arrow">›</span>
        <span style="font-size:11px;color:#aaa">${item.ubicacion||'—'}</span>
      </div>
    </div>`;
  }).join('') || '<div class="empty">Sin resultados</div>';

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
function invAbrirDetalle(modulo, rowIndex) {
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
          ? '<div class="empty">Sin eventos registrados</div>'
          : evs.map(ev => {
              const meta = tipoEventoMeta(ev.tipo);
              return `<div class="evento-card-mini">
                <div class="evento-tipo-icon">${meta.icon}</div>
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
      ${item.obs ? `<div class="ficha-obs">⚠️ ${item.obs}</div>` : ''}
    </div>

    ${imgSrc ? `
    <div class="ficha-section">
      <div class="ficha-sec-title">Foto de referencia</div>
      <div style="padding:8px 0" onclick="${imgSrc.startsWith('http') ? `invAbrirFotoModalUrl('${imgSrc.replace(/'/g,"\\'")}')` : `invAbrirFotoModal('${imgSrc.replace(/'/g,"\\'")}')` }">
        <div id="inv-foto-thumb-${rowIndex}" style="background:#1e293b;border-radius:10px;overflow:hidden;cursor:pointer;position:relative;min-height:60px;display:flex;align-items:center;justify-content:center">
          <span style="color:#64748b;font-size:13px;padding:12px">⏳ Cargando foto...</span>
        </div>
      </div>
    </div>` : ''}

    ${secEventos}

    ${_renderHistorialMovimientos(item.codigo || String(item.rowIndex))}

    <button class="action-btn" onclick="abrirMoverInv()" style="margin-top:8px;background:#fff3e0;color:#e65100;border:1px solid #ffd9a8">📦 Registrar movimiento</button>
    <button class="action-btn" onclick="invAbrirEditar()" style="margin-top:8px">✏️ Editar información</button>
    <a class="ficha-link-btn" onclick="invAbrirCarpetaDrive()" style="cursor:pointer;margin-top:6px;display:flex;align-items:center;gap:8px;background:#e8f4fd;color:#1a73e8;border:1px solid #c5e0f5;padding:10px 14px;border-radius:10px;font-size:14px;font-weight:500;text-decoration:none">
      📁 Ver fotos en Drive
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
    // Soporta /file/d/ID/view  y  ?id=ID  y  &id=ID
    const mPath  = fileName.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    const mQuery = fileName.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    const fileId = (mPath && mPath[1]) || (mQuery && mQuery[1]);
    const imgUrl = fileId
      ? `https://drive.google.com/thumbnail?id=${fileId}&sz=w800`
      : fileName;
    el.style.position = 'relative';
    el.innerHTML = `<img src="${imgUrl}" alt="Foto"
      style="width:100%;height:auto;max-height:220px;object-fit:cover;border-radius:10px;display:block;cursor:pointer"
      onclick="invAbrirFotoModalUrl('${imgUrl}')"
      onerror="this.parentElement.innerHTML='<span style=\\'color:#64748b;font-size:12px;padding:12px\\'>📷 Sin imagen</span>'">
      <div style="position:absolute;bottom:6px;right:8px;background:rgba(0,0,0,.5);border-radius:6px;padding:3px 7px;font-size:11px;color:#fff">🔍 Ver</div>`;
    el._driveImgUrl = imgUrl;
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
      el.innerHTML = `<span style="color:#64748b;font-size:12px;padding:12px">📷 ${fileName}</span>`;
      return;
    }
    const file = data.files[0];
    const imgUrl = file.thumbnailLink
      ? file.thumbnailLink.replace('=s220', '=s800')
      : `https://drive.google.com/thumbnail?id=${file.id}&sz=w800`;
    el.style.position = 'relative';
    el.innerHTML = `<img src="${imgUrl}" alt="Foto referencia"
      style="width:100%;height:auto;max-height:220px;object-fit:cover;border-radius:10px;display:block;cursor:pointer"
      onclick="invAbrirFotoModal('${fileName}')"
      onerror="this.parentElement.innerHTML='<span style=color:#64748b;font-size:12px;padding:12px>📷 ${fileName}</span>'">
      <div style="position:absolute;bottom:6px;right:8px;background:rgba(0,0,0,.5);border-radius:6px;padding:3px 7px;font-size:11px;color:#fff">🔍 Ver</div>`;
    el._driveImgUrl = imgUrl;
    el._driveFileId = file.id;
  } catch(e) {
    console.warn('[FOTO THUMB]', e.message);
    el.innerHTML = `<span style="color:#64748b;font-size:12px;padding:12px">📷 ${fileName}</span>`;
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
  const obs    = document.getElementById('inv-edit-obs').value;

  if (!row) return;

  const btn = document.querySelector('#panel-inv-edit .pnl-action');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }

  try {
    // Mapeo de columnas por módulo
    // Generadores:  I=estado(9) J=ubicacion(10) N=obs(14) O=imagen(15)
    // Maq. Menor:   H=estado(8) I=ubicacion(9)  J=obs(10) C=foto(3)
    // Herramientas: H=estado(8) I=ubicacion(9)  L=obs(12) C=registro(3)
    let colEstado, colUbic, colObs, colFoto, sheetName;

    if (modulo === 'generadores') {
      colEstado = 'I'; colUbic = 'J'; colObs = 'N'; colFoto = 'O';
      sheetName = SHEET_GENERADORES;
    } else if (modulo === 'maqmenor') {
      colEstado = 'H'; colUbic = 'I'; colObs = 'J'; colFoto = 'C';
      sheetName = SHEET_MAQ_MENOR;
    } else {
      colEstado = 'H'; colUbic = 'I'; colObs = 'L'; colFoto = 'C';
      sheetName = SHEET_HERRAMIENTAS;
    }

    toast('Guardando...');
    await Promise.all([
      writeSheet(`'${sheetName}'!${colEstado}${row}`, [[estado]]),
      writeSheet(`'${sheetName}'!${colUbic}${row}`,   [[ubic]]),
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
    return `<div class="card" onclick="contAbrirDetalle(${c.rowIndex})">
      <div class="card-icon" style="font-size:22px">${icon}</div>
      <div class="card-body">
        <div class="card-title">N° ${c.num} · ${c.tipo}</div>
        <div class="card-sub">${c.medidas}${c.equipamiento&&c.equipamiento!=='-'?' · '+c.equipamiento:''}</div>
        <span class="badge ${cls}" style="margin-top:4px;display:inline-block">${c.estado||'Sin estado'}</span>
      </div>
      <div class="card-right">
        <span class="card-arrow">›</span>
        <span style="font-size:11px;color:#aaa">${c.ubicacion||'—'}</span>
      </div>
    </div>`;
  }).join('') || '<div class="empty">Sin resultados</div>';

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
      ${c.obs?`<div class="ficha-obs">⚠️ ${c.obs}</div>`:''}
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

    <button class="action-btn" onclick="abrirMoverCont()" style="margin-top:8px;background:#fff3e0;color:#e65100;border:1px solid #ffd9a8">📦 Registrar movimiento</button>
    <button class="action-btn" onclick="contAbrirEditar()" style="margin-top:8px">✏️ Editar información</button>
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

async function contGuardar() {
  const row    = parseInt(document.getElementById('cont-edit-row').value);
  const estado = document.getElementById('cont-edit-estado').value;
  const ubic   = document.getElementById('cont-edit-ubicacion').value;
  const equip  = document.getElementById('cont-edit-equip').value;
  const obs    = document.getElementById('cont-edit-obs').value;
  if (!row) return;

  const btn = document.querySelector('#panel-cont-edit .pnl-action');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }

  try {
    // Containers: E=estado(5) G=ubicacion(7) I=equipamiento(9) J=obs(10) C=foto(3)
    toast('Guardando...');
    await Promise.all([
      writeSheet(`'${SHEET_CONTAINERS}'!E${row}`, [[estado]]),
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

function irAModulo(modulo) {
  const homeEl = document.getElementById('modulos-home');
  if (homeEl) homeEl.classList.add('hidden');

  document.getElementById('mod-inventario').classList.add('hidden');
  document.getElementById('mod-containers').classList.add('hidden');
  document.getElementById('mod-flota').classList.add('hidden');

  if (modulo === 'flota') {
    // Flota usa su propio sidebar desktop nativo
    _setDesktopSidebarFlota(true);
    document.getElementById('main').classList.remove('hidden');
    const hdr = document.querySelector('#main .header');
    if (hdr && !document.getElementById('flota-back-btn')) {
      const backBtn = document.createElement('button');
      backBtn.id = 'flota-back-btn';
      backBtn.className = 'header-btn';
      backBtn.style.cssText = 'font-size:20px;color:#4a8fc1;order:-1';
      backBtn.onclick = () => {
        document.getElementById('main').classList.add('hidden');
        document.getElementById('modulos-home').classList.remove('hidden');
      };
      backBtn.textContent = '‹';
      hdr.insertBefore(backBtn, hdr.firstChild);
    }
  } else if (modulo === 'containers') {
    // Ocultar sidebar de Flota para que no se superponga
    _setDesktopSidebarFlota(false);
    document.getElementById('mod-containers').classList.remove('hidden');
    _invActivarDesktop('containers');
    renderContainers();
  } else {
    // Inventario (generadores, maqmenor, herramientas)
    _setDesktopSidebarFlota(false);
    document.getElementById('mod-inventario').classList.remove('hidden');
    _invActivarDesktop('inventario');
    invSetModulo(modulo === 'generadores' ? 'generadores' : modulo === 'maqmenor' ? 'maqmenor' : 'herramientas');
  }

  history.pushState({ modulo }, '');
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
    const sidebar  = document.getElementById('cont-desktop-sidebar');
    const content  = document.getElementById('cont-desktop-content');
    const mHdr     = document.getElementById('cont-mobile-header');
    const mStats   = document.getElementById('cont-mobile-stats');
    const mSearch  = document.getElementById('cont-mobile-search');
    const mList    = document.getElementById('cont-mobile-list');
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
  document.getElementById('mod-inventario').classList.add('hidden');
  document.getElementById('mod-containers').classList.add('hidden');
  document.getElementById('mod-flota').classList.add('hidden');
  document.getElementById('main').classList.add('hidden');
  // Ocultar sidebar de Flota para que no quede sobre la home
  const s = document.getElementById('desktop-sidebar');
  const m = document.getElementById('desktop-main');
  if (s) s.classList.add('dt-oculto');
  if (m) m.classList.add('dt-oculto');
  document.getElementById('modulos-home').classList.remove('hidden');
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
  ['nuevo-marca','nuevo-modelo','nuevo-ubicacion','nuevo-potencia','nuevo-equipo-otro'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
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
  const codigo   = mod === 'generadores' ? document.getElementById('nuevo-codigo').value.trim().toUpperCase() : '';
  const potencia = mod === 'generadores' ? document.getElementById('nuevo-potencia').value.trim().toUpperCase() : '';

  if (!equipo || !estado) { toast('Completa los campos obligatorios', 'error'); return; }

  const btn = document.querySelector('#panel-nuevo-inv .pnl-action');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }

  try {
    let sheetName, fila;
    if (mod === 'generadores') {
      // Cols: A=N° B=EQUIPO C=CODIGO D=MARCA E=MODELO F=AÑO G=COLOR H=POTENCIA I=ESTADO J=UBICACION N=OBS
      sheetName = SHEET_GENERADORES;
      fila = [num, equipo, codigo, marca, modelo, '', '', potencia, estado, ubicacion, '', '', '', ''];
    } else if (mod === 'maqmenor') {
      // Cols: A=N° B=EQUIPO C=FOTO D=MARCA E=MODELO F=MOTOR G=COLOR H=ESTADO I=UBICACION J=OBS
      sheetName = SHEET_MAQ_MENOR;
      fila = [num, equipo, '', marca, modelo, '', '', estado, ubicacion, ''];
    } else {
      // Herramientas: A=N° B=EQUIPO C=REGISTRO D=MARCA E=MODELO F=MOTOR G=COLOR H=ESTADO I=UBICACION
      sheetName = SHEET_HERRAMIENTAS;
      fila = [num, equipo, '', marca, modelo, '', '', estado, ubicacion, '', '', '', ''];
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
        const codigoFoto = mod === 'generadores' ? (document.getElementById('nuevo-codigo')?.value || num) : num;
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
  ['cont-nuevo-ubicacion','cont-nuevo-equip','cont-nuevo-obs'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  document.getElementById('cont-nuevo-tipo').value   = 'OFICINA';
  document.getElementById('cont-nuevo-estado').value = 'REGULAR';
  document.getElementById('cont-nuevo-medidas').value= '6 METROS';

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
  const equip    = document.getElementById('cont-nuevo-equip').value.trim();
  const obs      = document.getElementById('cont-nuevo-obs').value.trim();

  if (!tipo || !estado) { toast('Completa los campos obligatorios', 'error'); return; }

  const btn = document.querySelector('#panel-nuevo-cont .pnl-action');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }

  try {
    // Cols: A=N° B=TIPO C=FOTO D=MEDIDAS E=ESTADO F=COLOR G=UBICACION H=FECHA I=EQUIPAMIENTO J=OBS
    const fila = [num, tipo, '', medidas, estado, '', ubicacion, '-', equip || '-', obs];
    await appendSheet(`'${SHEET_CONTAINERS}'!A:J`, [fila]);
    toast('✓ Container agregado');

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
//   K=ESTADO L=FECHA_RECEPCION M=RECIBE N=OBS_RECEPCION O=REGISTRADO_POR
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
      <div class="empty">Sin movimientos registrados</div>
    </div>`;
  }

  return `
    <div class="ficha-section">
      <div class="ficha-sec-title">Historial de movimientos</div>
      ${hist.map(m => `
        <div class="evento-card-mini">
          <div class="evento-tipo-icon">${m.estado === 'RECIBIDO' ? '✅' : '🚚'}</div>
          <div class="mant-body">
            <div class="mant-title">${m.origen||'—'} → ${m.destino||'—'}</div>
            <div class="mant-meta">${m.fechaSalida}${m.estado !== 'RECIBIDO' ? ' · En tránsito' : ' · Recibido '+m.fechaRecepcion}</div>
            ${m.traslada ? `<div class="evento-desc">Traslada: ${m.traslada}${m.autoriza?' · Autoriza: '+m.autoriza:''}</div>` : ''}
            ${m.obsSalida ? `<div class="evento-desc">📝 ${m.obsSalida}</div>` : ''}
          </div>
        </div>`).join('')}
    </div>`;
}

// Carga todos los movimientos (se usa para historial y pendientes)
async function loadMovimientos() {
  try {
    const rows = await fetchSheet(`'${SHEET_MOVIMIENTOS}'!A2:O2000`);
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
      estado: r[10] || 'EN_TRANSITO',
      fechaRecepcion: r[11] || '',
      recibe: r[12] || '',
      obsRecepcion: r[13] || '',
      registradoPor: r[14] || '',
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
  const autoriza = document.getElementById('mov-autoriza').value.trim();
  const traslada = document.getElementById('mov-traslada').value.trim();
  const obs      = document.getElementById('mov-obs-salida').value.trim();

  if (!destino || !fecha) { toast('Completa destino y fecha', 'error'); return; }

  const btn = document.querySelector('#panel-mover .pnl-action');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }

  try {
    const fechaFmt = "'" + fecha.split('-').reverse().join('/');
    const idMov = 'MOV-' + Date.now();
    const registradoPor = (typeof userEmail !== 'undefined' && userEmail) ? userEmail : '';

    // A=ID B=FECHA_SALIDA C=TIPO D=CODIGO E=NOMBRE F=ORIGEN G=DESTINO H=AUTORIZA
    // I=TRASLADA J=OBS_SALIDA K=ESTADO L=FECHA_RECEP M=RECIBE N=OBS_RECEP O=REGISTRADO_POR
    await appendSheet(`'${SHEET_MOVIMIENTOS}'!A:O`, [[
      idMov, fechaFmt, tipoEquipo, codigoEquipo, nombreEquipo,
      origen, destino, autoriza, traslada, obs,
      'EN_TRANSITO', '', '', '', registradoPor
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

    toast('✓ Movimiento registrado — pendiente de recepción');
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

// ── Movimientos pendientes (confirmar recepción) ──
async function abrirMovimientosPendientes() {
  await loadMovimientos();
  const pendientes = allMovimientos.filter(m => m.estado !== 'RECIBIDO').sort((a,b) => b.rowIndex - a.rowIndex);
  const cont = document.getElementById('movs-pendientes-lista');
  if (pendientes.length === 0) {
    cont.innerHTML = '<div class="empty">No hay movimientos pendientes de recepción 🎉</div>';
  } else {
    cont.innerHTML = pendientes.map(m => `
      <div class="evento-card-mini" style="cursor:pointer" onclick="abrirConfirmarRecepcion(${m.rowIndex})">
        <div class="evento-tipo-icon">🚚</div>
        <div class="mant-body">
          <div class="mant-title">${m.tipoEquipo} — ${m.nombreEquipo}</div>
          <div class="mant-meta">${m.origen||'—'} → ${m.destino||'—'} · ${m.fechaSalida}</div>
          ${m.traslada ? `<div class="evento-desc">Traslada: ${m.traslada}${m.autoriza?' · Autoriza: '+m.autoriza:''}</div>` : ''}
        </div>
      </div>`).join('');
  }
  openPanel('panel-movs-pendientes');
}

function abrirConfirmarRecepcion(rowIndex) {
  const m = allMovimientos.find(x => x.rowIndex === rowIndex);
  if (!m) return;
  document.getElementById('recibir-id-mov').value = m.id;
  document.getElementById('recibir-row-index').value = m.rowIndex;
  document.getElementById('recibir-nombre-equipo').textContent = `${m.tipoEquipo} — ${m.nombreEquipo}`;
  document.getElementById('recibir-destino').textContent = `Destino: ${m.destino}`;
  document.getElementById('recibir-recibe').value = '';
  document.getElementById('recibir-obs').value = '';
  openPanel('panel-mov-recibir');
}

async function guardarRecepcionMov() {
  const rowIndex = document.getElementById('recibir-row-index').value;
  const recibe   = document.getElementById('recibir-recibe').value.trim();
  const obs      = document.getElementById('recibir-obs').value.trim();

  if (!recibe) { toast('Indica quién recibe', 'error'); return; }

  const btn = document.querySelector('#panel-mov-recibir .pnl-action');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }

  try {
    const fechaRecepFmt = "'" + new Date().toLocaleDateString('es-CL');
    // K=ESTADO L=FECHA_RECEP M=RECIBE N=OBS_RECEP
    await writeSheet(`'${SHEET_MOVIMIENTOS}'!K${rowIndex}:N${rowIndex}`, [[
      'RECIBIDO', fechaRecepFmt, recibe, obs
    ]]);

    toast('✓ Recepción confirmada');
    _origClosePanel('panel-mov-recibir');
    let idx = _panelStack.lastIndexOf('panel-mov-recibir');
    if (idx !== -1) _panelStack.splice(idx, 1);

    await loadMovimientos();
    await abrirMovimientosPendientes();
  } catch (err) {
    toast('Error: ' + err.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Confirmar'; }
  }
}
