// ═══════════════════════════════════════════════════════════════════════
// MÓDULO: ARRIENDOS
// ═══════════════════════════════════════════════════════════════════════
// Registra equipos ARRENDADOS DE TERCEROS (no propios) para usar en una
// obra: quién los arrienda, desde/hasta cuándo, en qué obra y qué trabajo
// suple mientras está el equipo propio de baja o no alcanza. Avisa cuando
// un arriendo está por vencer o ya venció, para poder devolverlo o
// renovarlo a tiempo.
//
// La hoja ARRIENDOS se crea sola la primera vez que se necesita (ver
// _arrAsegurarHoja) — no hace falta armarla a mano en el Sheet antes de
// usar el módulo.
//
// Columnas: A=ID B=EQUIPO C=CATEGORIA D=PROVEEDOR E=CONTACTO F=TELEFONO
// G=FECHA_INICIO H=FECHA_TERMINO I=OBRA J=TRABAJO_SUPLE K=COSTO
// L=PERIODO_COSTO M=ESTADO(ACTIVO/DEVUELTO) N=FECHA_DEVOLUCION
// O=OBSERVACIONES P=REGISTRADO_POR

let allArriendos    = [];
let _arrHojaLista    = false;
let _arrFiltroActual = 'todos'; // 'todos' | 'activos' | 'porvencer' | 'vencidos' | 'devueltos'
let _arrDetalleRow   = null;    // rowIndex del arriendo abierto en el panel de detalle

function _arrSoloLectura() {
  if (typeof userRole === 'undefined') return false;
  if (userRole === 'admin') return false;
  if (typeof userRoles !== 'undefined' && userRoles.includes('arriendos')) return false;
  return true;
}

// Crea la hoja ARRIENDOS (con su encabezado) si todavía no existe.
async function _arrAsegurarHoja() {
  if (_arrHojaLista) return;
  await ensureToken();
  try {
    const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SHEET_ID}`;
    const res = await fetch(metaUrl, { headers: authHeader() });
    if (!res.ok) return;
    const data = await res.json();
    const nombres = (data.sheets || []).map(s => s.properties.title);
    if (!nombres.includes(CONFIG.SHEET_ARRIENDOS)) {
      await fetch(`${metaUrl}:batchUpdate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({ requests: [{ addSheet: { properties: { title: CONFIG.SHEET_ARRIENDOS } } }] }),
      });
      await writeSheet(`'${CONFIG.SHEET_ARRIENDOS}'!A1:P1`, [[
        'ID','EQUIPO','CATEGORIA','PROVEEDOR','CONTACTO','TELEFONO',
        'FECHA_INICIO','FECHA_TERMINO','OBRA','TRABAJO_SUPLE','COSTO',
        'PERIODO_COSTO','ESTADO','FECHA_DEVOLUCION','OBSERVACIONES','REGISTRADO_POR',
      ]]);
    }
    _arrHojaLista = true;
  } catch(e) {
    console.warn('[ARRIENDOS] No se pudo verificar/crear la hoja:', e.message);
  }
}

async function loadArriendos(forzarRender) {
  try {
    const rows = await fetchSheet(`'${CONFIG.SHEET_ARRIENDOS}'!A2:P5000`);
    allArriendos = (rows || [])
      .map((r, i) => ({ r, rowIndex: i + 2 }))
      .filter(({ r }) => r[0])
      .map(({ r, rowIndex }) => ({
        rowIndex,
        id:              r[0]  || '',
        equipo:          r[1]  || '',
        categoria:       r[2]  || '',
        proveedor:       r[3]  || '',
        contacto:        r[4]  || '',
        telefono:        r[5]  || '',
        fechaInicio:     r[6]  || '',
        fechaTermino:    r[7]  || '',
        obra:            r[8]  || '',
        trabajoSuple:    r[9]  || '',
        costo:           r[10] || '',
        periodoCosto:    r[11] || '',
        estado:          (r[12] || 'ACTIVO').toUpperCase(),
        fechaDevolucion: r[13] || '',
        obs:             r[14] || '',
        registradoPor:   r[15] || '',
      }));
  } catch(e) {
    allArriendos = [];
    console.warn('[ARRIENDOS] No se pudo cargar (¿hoja no creada todavía?):', e.message);
  }
  if (forzarRender) arrRenderLista();
}

async function arrInit() {
  await _arrAsegurarHoja();
  if (!allArriendos.length) await loadArriendos();
  arrRenderLista();
}

// ── Estado/alerta de un arriendo ─────────────────────────────
// Devuelve la info de badge + a qué balde de filtro pertenece, en un
// solo lugar para que la lista, los stats y los filtros usen siempre el
// mismo criterio.
function _arrInfoEstado(a) {
  if (a.estado === 'DEVUELTO') {
    return { badge: '<span class="badge gray">Devuelto</span>', filtro: 'devueltos', dias: null };
  }
  const dias = diasRestantes(a.fechaTermino);
  if (dias === null) {
    return { badge: '<span class="badge gray">Sin plazo definido</span>', filtro: 'activos', dias };
  }
  if (dias < 0) {
    return { badge: `<span class="badge red">Vencido ${Math.abs(dias)}d</span>`, filtro: 'vencidos', dias };
  }
  if (dias <= 7) {
    return { badge: `<span class="badge amber">Vence en ${dias}d</span>`, filtro: 'porvencer', dias };
  }
  return { badge: `<span class="badge blue">Activo · ${dias}d</span>`, filtro: 'activos', dias };
}

// Ícono por categoría — reutiliza los mismos SVG que ya existen para
// Flota/Inventario en vez de dibujar unos nuevos, así queda consistente.
function _arrIcono(categoria) {
  const map = {
    MAQUINARIA: 'excavadora',
    VEHICULO:   'camion',
    GENERADOR:  'generador',
  };
  if (typeof iconoEquipo === 'function') return iconoEquipo(map[categoria] || 'default');
  return '';
}

function arrSetFiltro(f) {
  _arrFiltroActual = f;
  ['todos','activos','porvencer','vencidos','devueltos'].forEach(k => {
    const m = document.getElementById('arr-filtro-' + k);
    const d = document.getElementById('arr-dt-filtro-' + k);
    if (m) m.classList.toggle('active', k === f);
    if (d) d.classList.toggle('active', k === f);
  });
  arrRenderLista();
}

// Sincronizar búsqueda desktop → móvil (arrRenderLista lee arr-search)
function arrSyncSearch() {
  const dtInput  = document.getElementById('arr-dt-search');
  const mobInput = document.getElementById('arr-search');
  if (dtInput && mobInput) mobInput.value = dtInput.value;
  arrRenderLista();
}

function arrRenderLista() {
  const searchEl = document.getElementById('arr-search');
  const txt = searchEl ? searchEl.value.toLowerCase().trim() : '';

  const filtrados = allArriendos
    .map(a => ({ a, info: _arrInfoEstado(a) }))
    .filter(({ a, info }) => {
      if (_arrFiltroActual !== 'todos' && info.filtro !== _arrFiltroActual) return false;
      if (!txt) return true;
      return (a.equipo + a.proveedor + a.obra + a.contacto).toLowerCase().includes(txt);
    })
    .sort((x, y) => {
      // Vencidos y por vencer primero (menor `dias` primero), sin plazo/devuelto al final
      const dx = x.info.dias === null ? Infinity : x.info.dias;
      const dy = y.info.dias === null ? Infinity : y.info.dias;
      if (x.a.estado === 'DEVUELTO' && y.a.estado !== 'DEVUELTO') return 1;
      if (y.a.estado === 'DEVUELTO' && x.a.estado !== 'DEVUELTO') return -1;
      return dx - dy;
    });

  const html = filtrados.map(({ a, info }) => `
    <div class="card" onclick="arrAbrirDetalle(${a.rowIndex})">
      <div class="card-icon" style="font-size:22px">${_arrIcono(a.categoria)}</div>
      <div class="card-body">
        <div class="card-title">${a.equipo || 'Equipo sin nombre'}</div>
        <div class="card-sub">${a.proveedor || 'Sin proveedor'}${a.obra ? ' · ' + a.obra : ''}</div>
      </div>
      <div class="card-right">
        ${info.badge}
        <span style="font-size:11px;color:#aaa">${a.fechaTermino ? 'Hasta ' + a.fechaTermino : ''}</span>
      </div>
    </div>`).join('') || emptyState('Sin arriendos', 'No hay arriendos que coincidan con este filtro');

  const lista   = document.getElementById('arr-lista');
  const listaDt = document.getElementById('arr-dt-lista');
  if (lista)   lista.innerHTML   = html;
  if (listaDt) listaDt.innerHTML = html;

  // Stats
  const activos    = allArriendos.filter(a => _arrInfoEstado(a).filtro === 'activos').length;
  const porVencer  = allArriendos.filter(a => _arrInfoEstado(a).filtro === 'porvencer').length;
  const vencidos   = allArriendos.filter(a => _arrInfoEstado(a).filtro === 'vencidos').length;
  const el = id => document.getElementById(id);
  if (el('arr-stat-activos'))   el('arr-stat-activos').textContent   = activos + porVencer;
  if (el('arr-stat-porvencer')) el('arr-stat-porvencer').textContent = porVencer;
  if (el('arr-stat-vencidos'))  el('arr-stat-vencidos').textContent  = vencidos;
}

// ── Detalle ────────────────────────────────────────────────
function arrAbrirDetalle(rowIndex) {
  const a = allArriendos.find(x => x.rowIndex === rowIndex);
  if (!a) return;
  _arrDetalleRow = rowIndex;
  const info = _arrInfoEstado(a);

  const costoTxt = a.costo
    ? `$${Number(a.costo).toLocaleString('es-CL')} ${({DIA:'/ día', SEMANA:'/ semana', MES:'/ mes', TOTAL:'total'}[a.periodoCosto] || '')}`
    : '—';

  document.getElementById('arr-detalle-body').innerHTML = `
    <div class="ficha-hero">
      <div class="ficha-hero-icon" style="font-size:36px">${_arrIcono(a.categoria)}</div>
      <div class="ficha-hero-info">
        <div class="ficha-hero-type">${a.categoria || 'ARRIENDO'}</div>
        <div class="ficha-hero-name">${a.equipo || 'Equipo sin nombre'}</div>
        <span style="margin-top:6px;display:inline-block">${info.badge}</span>
      </div>
    </div>

    <div class="ficha-section">
      <div class="ficha-sec-title">Proveedor</div>
      <div class="field-row"><span class="fl">Empresa</span><span class="fv">${a.proveedor || '—'}</span></div>
      <div class="field-row"><span class="fl">Contacto</span><span class="fv">${a.contacto || '—'}</span></div>
      <div class="field-row"><span class="fl">Teléfono</span><span class="fv">${a.telefono ? `<a href="tel:${a.telefono}" style="color:var(--accent)">${a.telefono}</a>` : '—'}</span></div>
    </div>

    <div class="ficha-section">
      <div class="ficha-sec-title">Plazo</div>
      <div class="field-row"><span class="fl">Inicio</span><span class="fv">${a.fechaInicio || '—'}</span></div>
      <div class="field-row"><span class="fl">Término pactado</span><span class="fv">${a.fechaTermino || '—'}</span></div>
      ${a.estado === 'DEVUELTO' ? `<div class="field-row"><span class="fl">Devuelto el</span><span class="fv">${a.fechaDevolucion || '—'}</span></div>` : ''}
    </div>

    <div class="ficha-section">
      <div class="ficha-sec-title">Destino</div>
      <div class="field-row"><span class="fl">Obra / faena</span><span class="fv">${a.obra || '—'}</span></div>
      ${a.trabajoSuple ? `<div class="field-row" style="align-items:flex-start"><span class="fl">Trabajo que suple</span><span class="fv">${a.trabajoSuple}</span></div>` : ''}
    </div>

    <div class="ficha-section">
      <div class="ficha-sec-title">Costo</div>
      <div class="field-row"><span class="fl">Valor</span><span class="fv">${costoTxt}</span></div>
    </div>

    ${a.obs ? `<div class="ficha-obs"><svg viewBox="0 0 24 24" fill="none" class="inline-ic"><path d="M12 3 3 19h18Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M12 10v3.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="16.3" r="0.9" fill="currentColor"/></svg> ${a.obs}</div>` : ''}

    ${a.estado !== 'DEVUELTO' ? `<button class="action-btn viewer-hidden" style="margin-top:16px;background:#2e7d32;color:#fff;border:none" onclick="arrMarcarDevuelto(${a.rowIndex})">✓ Marcar como devuelto</button>` : ''}
  `;

  openPanel('panel-arr-detalle');
}

// ── Nuevo / Editar ────────────────────────────────────────────
function arrAbrirNuevo() {
  if (_arrSoloLectura()) { toast('Sin permisos para registrar', 'error'); return; }
  document.getElementById('arr-form-titulo').textContent = 'Nuevo arriendo';
  document.getElementById('arr-form-row').value = '';
  document.getElementById('arr-equipo').value = '';
  document.getElementById('arr-categoria').value = '';
  document.getElementById('arr-proveedor').value = '';
  document.getElementById('arr-contacto').value = '';
  document.getElementById('arr-telefono').value = '';
  document.getElementById('arr-fecha-inicio').value = new Date().toISOString().slice(0, 10);
  document.getElementById('arr-fecha-termino').value = '';
  document.getElementById('arr-obra').value = '';
  document.getElementById('arr-trabajo').value = '';
  document.getElementById('arr-costo').value = '';
  document.getElementById('arr-periodo-costo').value = 'DIA';
  document.getElementById('arr-obs').value = '';
  openPanel('panel-arr-form');
}

// Convierte dd/mm/aaaa (como está guardado en el Sheet) a aaaa-mm-dd (formato de <input type=date>)
function _arrFechaAInput(s) {
  if (!s) return '';
  const p = s.split('/');
  if (p.length === 3) return `${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`;
  return '';
}
// Y al revés: aaaa-mm-dd (del input) a dd/mm/aaaa (para guardar en el Sheet, como el resto de la app)
function _arrFechaDeInput(s) {
  if (!s) return '';
  const p = s.split('-');
  if (p.length === 3) return `${p[2]}/${p[1]}/${p[0]}`;
  return '';
}

function arrAbrirEditar(rowIndex) {
  if (_arrSoloLectura()) { toast('Sin permisos para editar', 'error'); return; }
  const a = allArriendos.find(x => x.rowIndex === rowIndex);
  if (!a) return;

  document.getElementById('arr-form-titulo').textContent = 'Editar arriendo';
  document.getElementById('arr-form-row').value = a.rowIndex;
  document.getElementById('arr-equipo').value = a.equipo;
  document.getElementById('arr-categoria').value = a.categoria;
  document.getElementById('arr-proveedor').value = a.proveedor;
  document.getElementById('arr-contacto').value = a.contacto;
  document.getElementById('arr-telefono').value = a.telefono;
  document.getElementById('arr-fecha-inicio').value = _arrFechaAInput(a.fechaInicio);
  document.getElementById('arr-fecha-termino').value = _arrFechaAInput(a.fechaTermino);
  document.getElementById('arr-obra').value = a.obra;
  document.getElementById('arr-trabajo').value = a.trabajoSuple;
  document.getElementById('arr-costo').value = a.costo;
  document.getElementById('arr-periodo-costo').value = a.periodoCosto || 'DIA';
  document.getElementById('arr-obs').value = a.obs;

  closePanel('panel-arr-detalle');
  openPanel('panel-arr-form');
}

async function arrGuardar() {
  const rowIndex   = document.getElementById('arr-form-row').value;
  const equipo     = document.getElementById('arr-equipo').value.trim();
  const categoria  = document.getElementById('arr-categoria').value;
  const proveedor  = document.getElementById('arr-proveedor').value.trim();
  const contacto   = document.getElementById('arr-contacto').value.trim();
  const telefono   = document.getElementById('arr-telefono').value.trim();
  const fechaIni   = _arrFechaDeInput(document.getElementById('arr-fecha-inicio').value);
  const fechaTer   = _arrFechaDeInput(document.getElementById('arr-fecha-termino').value);
  const obra       = document.getElementById('arr-obra').value.trim();
  const trabajo    = document.getElementById('arr-trabajo').value.trim();
  const costo      = document.getElementById('arr-costo').value;
  const periodo    = document.getElementById('arr-periodo-costo').value;
  const obs        = document.getElementById('arr-obs').value.trim();

  if (!equipo)    { toast('Indica qué equipo se arrienda', 'error'); return; }
  if (!proveedor) { toast('Indica el proveedor', 'error'); return; }
  if (!fechaIni)  { toast('La fecha de inicio es obligatoria', 'error'); return; }

  const btn = document.querySelector('#panel-arr-form .pnl-action');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }
  try {
    await _arrAsegurarHoja();
    const registradoPor = (typeof userEmail !== 'undefined' ? userEmail : '');

    if (rowIndex) {
      // Editar existente — mantiene ID/ESTADO/FECHA_DEVOLUCION/REGISTRADO_POR originales
      const existente = allArriendos.find(x => x.rowIndex === +rowIndex);
      await writeSheet(`'${CONFIG.SHEET_ARRIENDOS}'!A${rowIndex}:P${rowIndex}`, [[
        existente.id, equipo, categoria, proveedor, contacto, telefono,
        fechaIni, fechaTer, obra, trabajo, costo, periodo,
        existente.estado, existente.fechaDevolucion, obs, existente.registradoPor,
      ]]);
      toast('✓ Arriendo actualizado');
    } else {
      const id = 'ARR-' + Date.now();
      await appendSheet(`'${CONFIG.SHEET_ARRIENDOS}'!A:P`, [[
        id, equipo, categoria, proveedor, contacto, telefono,
        fechaIni, fechaTer, obra, trabajo, costo, periodo,
        'ACTIVO', '', obs, registradoPor,
      ]]);
      toast('✓ Arriendo registrado');
    }

    closePanel('panel-arr-form');
    await loadArriendos();
    arrRenderLista();
  } catch(e) {
    toast('Error: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Guardar'; }
  }
}

// ── Marcar como devuelto ──────────────────────────────────────
async function arrMarcarDevuelto(rowIndex) {
  if (_arrSoloLectura()) { toast('Sin permisos', 'error'); return; }
  const a = allArriendos.find(x => x.rowIndex === rowIndex);
  if (!a) return;

  try {
    const hoy = new Date();
    const fechaDevolucion = `${String(hoy.getDate()).padStart(2,'0')}/${String(hoy.getMonth()+1).padStart(2,'0')}/${hoy.getFullYear()}`;
    await writeSheet(`'${CONFIG.SHEET_ARRIENDOS}'!M${rowIndex}:N${rowIndex}`, [['DEVUELTO', fechaDevolucion]]);
    toast('✓ Marcado como devuelto');
    closePanel('panel-arr-detalle');
    await loadArriendos();
    arrRenderLista();
  } catch(e) {
    toast('Error: ' + e.message, 'error');
  }
}
