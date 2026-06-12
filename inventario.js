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
    .filter(r => r[0] && !isNaN(parseInt(r[0])))
    .map((r, i) => ({
      rowIndex:  i + 3, // datos desde fila 3 (2 filas de header)
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
    .filter(r => r[0] && !isNaN(parseInt(r[0])))
    .map((r, i) => ({
      rowIndex:  i + 3,
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
    .filter(r => r[0] && !isNaN(parseInt(r[0])))
    .map((r, i) => ({
      rowIndex:  i + 3,
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
    .filter(r => r[0] && !isNaN(parseInt(r[0])))
    .map((r, i) => ({
      rowIndex:     i + 2,
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
    const tA = ([a.marca, a.modelo].filter(Boolean).join(' ') || a.equipo).toLowerCase();
    const tB = ([b.marca, b.modelo].filter(Boolean).join(' ') || b.equipo).toLowerCase();
    return tA.localeCompare(tB, 'es');
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
      <div style="padding:8px 0" onclick="invAbrirFotoModal('${imgSrc.replace(/'/g,"\\'")}')">
        <div id="inv-foto-thumb-${rowIndex}" style="background:#1e293b;border-radius:10px;overflow:hidden;cursor:pointer;position:relative;min-height:60px;display:flex;align-items:center;justify-content:center">
          <span style="color:#64748b;font-size:13px;padding:12px">⏳ Cargando foto...</span>
        </div>
      </div>
    </div>` : ''}

    ${secEventos}

    <button class="action-btn" onclick="invAbrirEditar()" style="margin-top:8px">✏️ Editar información</button>
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
  if (!el) return;
  try {
    // Buscar el archivo en Drive por nombre exacto
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

    el.innerHTML = `<img src="${imgUrl}" alt="Foto referencia"
      style="width:100%;height:auto;max-height:220px;object-fit:cover;border-radius:10px;display:block;cursor:pointer"
      onclick="invAbrirFotoModal('${fileName}')"
      onerror="this.parentElement.innerHTML='<span style=color:#64748b;font-size:12px;padding:12px>📷 ${fileName}</span>'">
      <div style="position:absolute;bottom:6px;right:8px;background:rgba(0,0,0,.5);border-radius:6px;padding:3px 7px;font-size:11px;color:#fff">🔍 Ver</div>`;
    el.style.position = 'relative';

    // Guardar URL para el modal
    el._driveImgUrl = imgUrl;
    el._driveFileId = file.id;
  } catch(e) {
    console.warn('[FOTO THUMB]', e.message);
    el.innerHTML = `<span style="color:#64748b;font-size:12px;padding:12px">📷 ${fileName}</span>`;
  }
}

// ── Modal foto pantalla completa ───────────────────────────────
async function invAbrirFotoModal(fileName) {
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

  // Limpiar foto previa
  _invFotoRef = null;
  document.getElementById('inv-edit-foto-preview').innerHTML = '';
  document.getElementById('inv-edit-foto-preview').style.display = 'none';

  openPanel('panel-inv-edit');
}

// Foto de referencia para edición inventario
let _invFotoRef = null;

function onInvFotoSelected(input) {
  if (!input.files || !input.files.length) return;
  const file = input.files[0];
  const reader = new FileReader();
  reader.onload = () => {
    _invFotoRef = {
      b64:      reader.result.split(',')[1],
      name:     file.name,
      mimeType: file.type || 'image/jpeg',
      previewUrl: reader.result,
    };
    const prev = document.getElementById('inv-edit-foto-preview');
    prev.style.display = 'block';
    prev.innerHTML = `<div class="foto-thumb-wrap" style="margin-top:8px">
      <img src="${reader.result}" class="foto-thumb" style="width:100%;height:auto;max-height:180px;object-fit:cover">
    </div>`;
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

    // Subir foto de referencia si hay una nueva
    if (_invFotoRef) {
      if (btn) btn.textContent = 'Subiendo foto...';
      toast('Subiendo foto de referencia...');
      try {
        // Usar carpeta exclusiva de Inventario & Containers
        let folderId = DRIVE_INV_FOLDER;
        try { folderId = await findOrCreateFolder(sheetName, DRIVE_INV_FOLDER); } catch(fe) {}

        const ext      = _invFotoRef.name.split('.').pop() || 'jpg';
        const codigo   = invItem.codigo || invItem.num || row;
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

    const fechaReg = new Date().toLocaleDateString('es-CL');
    const fechaFmt = fecha.split('-').reverse().join('/');
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
      <div style="padding:8px 0" onclick="invAbrirFotoModal('${c.foto.replace(/'/g,"\\'")}')">
        <div id="cont-foto-thumb-${c.rowIndex}" style="background:#1e293b;border-radius:10px;overflow:hidden;cursor:pointer;position:relative;min-height:60px;display:flex;align-items:center;justify-content:center">
          <span style="color:#64748b;font-size:13px;padding:12px">⏳ Cargando foto...</span>
        </div>
      </div>
    </div>`:''}

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

function invAbrirNuevo() {
  const mod = invModulo;
  const tipos = mod === 'generadores' ? TIPOS_GENERADOR
              : mod === 'maqmenor'    ? TIPOS_MAQ_MENOR
              : TIPOS_HERRAMIENTA;

  // Poblar select de tipo
  const sel = document.getElementById('nuevo-equipo');
  sel.innerHTML = tipos.map(t => `<option value="${t}">${t}</option>`).join('');

  // Mostrar/ocultar campo código (solo generadores)
  document.getElementById('nuevo-codigo-row').style.display = mod === 'generadores' ? '' : 'none';
  document.getElementById('nuevo-potencia-row').style.display = mod === 'generadores' ? '' : 'none';

  // Limpiar campos
  ['nuevo-marca','nuevo-modelo','nuevo-ubicacion','nuevo-codigo','nuevo-potencia'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = '';
  });
  document.getElementById('nuevo-estado').value = 'OPERATIVO';
  document.getElementById('nuevo-modulo').value = mod;

  // Calcular número siguiente
  const datos = mod === 'generadores' ? allGeneradores : mod === 'maqmenor' ? allMaqMenor : allHerramientas;
  const nextNum = datos.length > 0 ? Math.max(...datos.map(i => parseInt(i.num)||0)) + 1 : 1;
  document.getElementById('nuevo-num').value = nextNum;

  openPanel('panel-nuevo-inv');
}

async function invGuardarNuevo() {
  const mod      = document.getElementById('nuevo-modulo').value;
  const num      = document.getElementById('nuevo-num').value;
  const equipo   = document.getElementById('nuevo-equipo').value;
  const marca    = document.getElementById('nuevo-marca').value.trim().toUpperCase();
  const modelo   = document.getElementById('nuevo-modelo').value.trim().toUpperCase();
  const estado   = document.getElementById('nuevo-estado').value;
  const ubicacion= document.getElementById('nuevo-ubicacion').value.trim().toUpperCase();
  const codigo   = document.getElementById('nuevo-codigo').value.trim().toUpperCase();
  const potencia = document.getElementById('nuevo-potencia').value.trim().toUpperCase();

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
