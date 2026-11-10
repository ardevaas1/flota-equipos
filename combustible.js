// ═══════════════════════════════════════════════════════════════════════
// MÓDULO: COMBUSTIBLE EN OBRA
// ═══════════════════════════════════════════════════════════════════════
// Lo usa el bodeguero (rol 'bodeguero') para anotar cada carga de combustible
// que despacha en una obra: a qué obra, a qué equipo (propio o de OTRA
// empresa), cuántos litros, km/horas y quién lo recibió.
//
// Es independiente del módulo Bitácora a propósito: las cargas de acá NO
// entran al cálculo de rendimiento (km/L) de Bitácora, así no se mezclan con
// las cargas que hace el chofer en la bencinera.
//
// Hojas (se crean solas desde el Apps Script la primera vez que se escribe):
//  COMB-OBRA:  A=ID B=FECHA C=OBRA D=ORIGEN(PROPIO/EXTERNO) E=IDENT
//              F=DESCRIPCION G=EMPRESA H=LITROS I=KM_HORAS J=RECIBIO
//              K=OBSERVACIONES L=REGISTRADO_POR M=HORA
//  EQUIPOS-EXTERNOS: A=ID B=EMPRESA C=TIPO D=IDENT E=DESCRIPCION F=OBRA
//              G=ESTADO(ACTIVO/RETIRADO) H=REGISTRADO_POR

const COMB_OBRAS_BASE = ['FENATS'];
const COMB_TIPOS_EXT = ['Camión', 'Camioneta', 'Retroexcavadora', 'Excavadora', 'Minicargador', 'Grúa', 'Rodillo', 'Generador', 'Otro'];

let allCombObra = [];
let allEqExternos = [];
let _combVista = 'cargas';      // 'cargas' | 'obra' | 'equipo' | 'externos'
let _combObraFiltro = '';
let _combEditExt = null;        // rowIndex del equipo externo en edición (o null)

function _combSoloLectura() {
  if (typeof userRole === 'undefined') return false;
  if (userRole === 'admin') return false;
  if (typeof userRoles !== 'undefined' && userRoles.includes('bodeguero')) return false;
  return true;
}
const _combEsc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const _combNum = (n) => (Math.round(n * 10) / 10).toLocaleString('es-CL');
const _combHoyISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// Todo se lee a través del Apps Script (el bodeguero no necesita acceso al Sheet)
async function _combLeer(range) {
  const d = await _appsScriptCall('sheet_read', { range });
  return d.values || [];
}
let _combEquiposCache = [];
async function loadCombEquipos() {
  try { const d = await _appsScriptCall('comb_equipos', {}); _combEquiposCache = d.equipos || []; }
  catch (e) { console.warn('[COMB] equipos:', e.message); toast('No se pudo cargar la lista de equipos: ' + e.message, 'error'); }
}

async function loadCombObra() {
  try {
    const rows = await _combLeer(`'COMB-OBRA'!A2:M5000`);
    allCombObra = (rows || []).map((r, i) => ({ r, rowIndex: i + 2 })).filter(({ r }) => r[0]).map(({ r, rowIndex }) => ({
      rowIndex, id: r[0], fecha: _bitFechaDesdeHoja(r[1]), obra: r[2] || '', origen: (r[3] || '').toUpperCase(),
      ident: (r[4] || '').toString().trim(), desc: r[5] || '', empresa: r[6] || '', litros: _parseNumeroSheet(r[7]) || 0,
      km: r[8] || '', recibio: r[9] || '', obs: r[10] || '', registradoPor: r[11] || '', hora: r[12] || '',
    }));
  } catch (e) { allCombObra = []; console.warn('[COMB-OBRA] sin datos todavía:', e.message); }
}
async function loadEqExternos() {
  try {
    const rows = await _combLeer(`'EQUIPOS-EXTERNOS'!A2:H2000`);
    allEqExternos = (rows || []).map((r, i) => ({ r, rowIndex: i + 2 })).filter(({ r }) => r[0]).map(({ r, rowIndex }) => ({
      rowIndex, id: r[0], empresa: r[1] || '', tipo: r[2] || '', ident: (r[3] || '').toString().trim(), desc: r[4] || '',
      obra: r[5] || '', estado: (r[6] || 'ACTIVO').toUpperCase(), registradoPor: r[7] || '',
    }));
  } catch (e) { allEqExternos = []; console.warn('[EQUIPOS-EXTERNOS] sin datos todavía:', e.message); }
}

async function combInit() {
  await Promise.all([loadCombObra(), loadEqExternos(), loadCombEquipos()]);
  combRender();
}
async function combRecargar() { toast('Actualizando...', 'loading'); await combInit(); toast('✓ Datos actualizados'); }

function _combObras() {
  const s = new Set(COMB_OBRAS_BASE);
  allCombObra.forEach(c => c.obra && s.add(c.obra.toUpperCase()));
  allEqExternos.forEach(e => e.obra && s.add(e.obra.toUpperCase()));
  return [...s].sort((a, b) => a.localeCompare(b, 'es'));
}

// ── Equipos que se pueden elegir al cargar ──────────────────────
function _combEquiposPropios() { return _combEquiposCache; }

// ── Pantalla principal ──────────────────────────────────────────
function combSetVista(v) {
  _combVista = v;
  ['cargas', 'obra', 'equipo', 'externos'].forEach(k => { const b = document.getElementById('comb-chip-' + k); if (b) b.classList.toggle('active', k === v); });
  combRender();
}
function combSetObra(v) { _combObraFiltro = v; combRender(); }

function _combFiltradas() {
  return allCombObra.filter(c => !_combObraFiltro || c.obra.toUpperCase() === _combObraFiltro);
}
function _combRenderStats(lista) {
  const hoy = _combHoyISO(), mes = hoy.slice(0, 7);
  const lt = (arr) => arr.reduce((a, c) => a + c.litros, 0);
  const el = (id, v) => { const x = document.getElementById(id); if (x) x.textContent = v; };
  el('comb-stat-hoy', _combNum(lt(lista.filter(c => c.fecha === hoy))));
  el('comb-stat-mes', _combNum(lt(lista.filter(c => (c.fecha || '').slice(0, 7) === mes))));
  el('comb-stat-n', lista.filter(c => c.fecha === hoy).length);
}

function combRender() {
  const sel = document.getElementById('comb-obra-sel');
  if (sel) {
    const obras = _combObras();
    sel.innerHTML = '<option value="">Todas las obras</option>' + obras.map(o => `<option value="${_combEsc(o)}"${o === _combObraFiltro ? ' selected' : ''}>${_combEsc(o)}</option>`).join('');
  }
  const lista = _combFiltradas();
  _combRenderStats(lista);
  const cont = document.getElementById('comb-lista');
  if (!cont) return;
  const fab = document.getElementById('comb-fab');
  if (fab) fab.dataset.vista = _combVista;
  if (_combVista === 'cargas') cont.innerHTML = _combHtmlCargas(lista);
  else if (_combVista === 'obra') cont.innerHTML = _combHtmlResumen(lista, 'obra');
  else if (_combVista === 'equipo') cont.innerHTML = _combHtmlResumen(lista, 'equipo');
  else cont.innerHTML = _combHtmlExternos();
}

function _combEtiquetaEquipo(c) {
  const ext = c.origen === 'EXTERNO';
  return `${_combEsc(c.ident)}${c.desc ? ' · ' + _combEsc(c.desc) : ''}${ext && c.empresa ? ` <span class="badge amber" style="margin-left:4px">${_combEsc(c.empresa)}</span>` : ''}`;
}
function _combHtmlCargas(lista) {
  if (!lista.length) return emptyState('Sin cargas', 'Toca + para registrar la primera carga de combustible');
  const ord = [...lista].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '') || b.rowIndex - a.rowIndex).slice(0, 150);
  let diaActual = '', html = '';
  ord.forEach(c => {
    if (c.fecha !== diaActual) {
      diaActual = c.fecha;
      const tot = lista.filter(x => x.fecha === c.fecha).reduce((a, x) => a + x.litros, 0);
      html += `<div style="font-weight:700;font-size:13px;color:var(--ink-soft);margin:14px 2px 6px;text-transform:uppercase;letter-spacing:.4px">${_combEsc(_bitFormatearFecha(c.fecha))} · ${_combNum(tot)} L</div>`;
    }
    html += `<div class="comb-card" style="margin-bottom:8px">
      <div class="comb-t" style="display:flex;justify-content:space-between;gap:8px"><span>${_combEtiquetaEquipo(c)}</span><b>${_combNum(c.litros)} L</b></div>
      <div class="comb-m">${_combEsc(c.obra)}${c.km ? ' · ' + _combEsc(c.km) : ''}${c.recibio ? ' · Recibió: ' + _combEsc(c.recibio) : ''}${c.hora ? ' · ' + _combEsc(c.hora) : ''}</div>
      ${c.obs ? `<div class="comb-m">${_combEsc(c.obs)}</div>` : ''}
    </div>`;
  });
  return html;
}
function _combHtmlResumen(lista, por) {
  if (!lista.length) return emptyState('Sin datos', 'Todavía no hay cargas registradas');
  const g = {};
  lista.forEach(c => {
    const k = por === 'obra' ? (c.obra || 'Sin obra') : `${c.ident}|${c.origen}|${c.empresa}`;
    if (!g[k]) g[k] = { litros: 0, n: 0, mes: 0, c };
    g[k].litros += c.litros; g[k].n++;
    if ((c.fecha || '').slice(0, 7) === _combHoyISO().slice(0, 7)) g[k].mes += c.litros;
  });
  const filas = Object.entries(g).sort((a, b) => b[1].litros - a[1].litros);
  const total = filas.reduce((a, [, v]) => a + v.litros, 0);
  return `<div class="comb-card" style="margin-bottom:10px"><div class="comb-t" style="display:flex;justify-content:space-between"><span>Total${_combObraFiltro ? ' · ' + _combEsc(_combObraFiltro) : ''}</span><b>${_combNum(total)} L</b></div></div>`
    + filas.map(([k, v]) => `<div class="comb-card" style="margin-bottom:8px">
      <div class="comb-t" style="display:flex;justify-content:space-between;gap:8px"><span>${por === 'obra' ? _combEsc(k) : _combEtiquetaEquipo(v.c)}</span><b>${_combNum(v.litros)} L</b></div>
      <div class="comb-m">${v.n} carga${v.n === 1 ? '' : 's'} · este mes: ${_combNum(v.mes)} L</div></div>`).join('');
}
function _combHtmlExternos() {
  const lista = allEqExternos.filter(e => !_combObraFiltro || (e.obra || '').toUpperCase() === _combObraFiltro);
  const btn = _combSoloLectura() ? '' : `<button class="action-btn" style="width:100%;margin-bottom:10px" onclick="combAbrirExterno()">+ Agregar equipo de otra empresa</button>`;
  if (!lista.length) return btn + emptyState('Sin equipos externos', 'Aquí se registran camiones y máquinas de otras empresas');
  const litrosDe = (e) => allCombObra.filter(c => c.origen === 'EXTERNO' && c.ident.toUpperCase() === e.ident.toUpperCase() && (c.empresa || '').toUpperCase() === (e.empresa || '').toUpperCase()).reduce((a, c) => a + c.litros, 0);
  return btn + lista.sort((a, b) => a.empresa.localeCompare(b.empresa, 'es') || a.ident.localeCompare(b.ident)).map(e => `<div class="comb-card" style="margin-bottom:8px" onclick="combAbrirExterno(${e.rowIndex})">
    <div class="comb-t" style="display:flex;justify-content:space-between;gap:8px"><span>${_combEsc(e.ident)} · ${_combEsc(e.tipo)}</span>${e.estado === 'RETIRADO' ? '<span class="badge gray">Retirado</span>' : '<span class="badge blue">Activo</span>'}</div>
    <div class="comb-m">${_combEsc(e.empresa)}${e.desc ? ' · ' + _combEsc(e.desc) : ''}${e.obra ? ' · ' + _combEsc(e.obra) : ''}</div>
    <div class="comb-m">Combustible entregado: <b>${_combNum(litrosDe(e))} L</b></div></div>`).join('');
}

// ── Registrar carga ─────────────────────────────────────────────
function _combPoblarEquipos(valorSel) {
  const sel = document.getElementById('comb-equipo');
  const propios = _combEquiposPropios(), grupos = {};
  propios.forEach(p => { (grupos[p.grupo] = grupos[p.grupo] || []).push(p); });
  let html = '<option value="">Elige el equipo…</option>';
  Object.entries(grupos).forEach(([g, arr]) => {
    html += `<optgroup label="${_combEsc(g)}">` + arr.sort((a, b) => a.ident.localeCompare(b.ident, 'es', { numeric: true })).map(p => `<option value="P|${_combEsc(p.ident)}">${_combEsc(p.ident)} — ${_combEsc(p.desc)}</option>`).join('') + '</optgroup>';
  });
  const ext = allEqExternos.filter(e => e.estado !== 'RETIRADO');
  if (ext.length) html += '<optgroup label="Otras empresas">' + ext.map(e => `<option value="X|${e.rowIndex}">${_combEsc(e.ident)} — ${_combEsc(e.empresa)} (${_combEsc(e.tipo)})</option>`).join('') + '</optgroup>';
  html += '<option value="NUEVO">＋ Equipo de otra empresa (nuevo)…</option>';
  sel.innerHTML = html;
  if (valorSel) sel.value = valorSel;
}
function _combPoblarListas() {
  const dl = document.getElementById('comb-obras-lista'); if (dl) dl.innerHTML = _combObras().map(o => `<option value="${_combEsc(o)}"></option>`).join('');
  const nombres = {}; allCombObra.forEach(c => { const n = (c.recibio || '').trim(); if (n) nombres[n.toLowerCase()] = nombres[n.toLowerCase()] || n; });
  const dr = document.getElementById('comb-recibio-lista'); if (dr) dr.innerHTML = Object.values(nombres).sort((a, b) => a.localeCompare(b, 'es')).map(n => `<option value="${_combEsc(n)}"></option>`).join('');
}
function combAbrirNueva() {
  if (_combSoloLectura()) { toast('Sin permisos para registrar', 'error'); return; }
  _combPoblarEquipos(); _combPoblarListas();
  document.getElementById('comb-fecha').value = _combHoyISO();
  document.getElementById('comb-obra').value = _combObraFiltro || (localStorage.getItem('comb_ultima_obra') || COMB_OBRAS_BASE[0]);
  ['comb-litros', 'comb-km', 'comb-recibio', 'comb-obs'].forEach(id => { document.getElementById(id).value = ''; });
  document.getElementById('comb-km-label').textContent = 'Km u horas del equipo (opcional)';
  openPanel('panel-comb-form');
}
function combEquipoCambio() {
  const v = document.getElementById('comb-equipo').value;
  if (v === 'NUEVO') { document.getElementById('comb-equipo').value = ''; combAbrirExterno(null, true); return; }
  const p = v.startsWith('P|') ? _combEquiposPropios().find(x => x.ident === v.slice(2)) : null;
  document.getElementById('comb-km-label').textContent = p ? (p.uso === 'horas' ? 'Horas actuales (opcional)' : 'Km actual (opcional)') : 'Km u horas del equipo (opcional)';
}

async function combGuardar() {
  const fecha = document.getElementById('comb-fecha').value;
  const obra = document.getElementById('comb-obra').value.trim().toUpperCase();
  const eq = document.getElementById('comb-equipo').value;
  const litros = _parseNumeroSheet(document.getElementById('comb-litros').value);
  const km = document.getElementById('comb-km').value.trim();
  const recibio = document.getElementById('comb-recibio').value.trim();
  const obs = document.getElementById('comb-obs').value.trim();
  if (!fecha) { toast('La fecha es obligatoria', 'error'); return; }
  if (!obra) { toast('Indica la obra', 'error'); return; }
  if (!eq) { toast('Elige el equipo', 'error'); return; }
  if (isNaN(litros) || litros <= 0) { toast('Completa los litros', 'error'); return; }
  if (!recibio) { toast('Indica quién recibió el combustible', 'error'); return; }
  let origen = 'PROPIO', ident = '', desc = '', empresa = '';
  if (eq.startsWith('P|')) { const p = _combEquiposPropios().find(x => x.ident === eq.slice(2)); ident = eq.slice(2); desc = p ? p.desc : ''; }
  else { const e = allEqExternos.find(x => String(x.rowIndex) === eq.slice(2)); if (!e) { toast('No se encontró el equipo externo', 'error'); return; } origen = 'EXTERNO'; ident = e.ident; desc = [e.tipo, e.desc].filter(Boolean).join(' '); empresa = e.empresa; }
  const btn = document.querySelector('#panel-comb-form .pnl-action');
  if (btn) btnEstado(btn, 'cargando');
  try {
    const ahora = new Date();
    const hora = `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`;
    await appendSheet(`'COMB-OBRA'!A:M`, [['CO-' + Date.now(), _bitFechaParaGuardar(fecha), obra, origen, (/^\d+$/.test(ident) ? "'" + ident : ident), desc, empresa, litros, km, recibio, obs, (typeof userEmail !== 'undefined' ? userEmail : ''), hora]]);
    try { localStorage.setItem('comb_ultima_obra', obra); } catch (e) { /* sin storage */ }
    toast(`✓ ${_combNum(litros)} L registrados`);
    if (btn) btnEstado(btn, 'ok');
    closePanel('panel-comb-form');
    await loadCombObra(); combRender();
  } catch (e) { toast('Error: ' + e.message, 'error'); }
  finally { if (btn) btnEstado(btn, 'reset'); }
}

// ── Equipos de otras empresas ───────────────────────────────────
function combAbrirExterno(rowIndex, desdeCarga) {
  if (_combSoloLectura()) { toast('Sin permisos para registrar', 'error'); return; }
  _combEditExt = rowIndex || null;
  const e = rowIndex ? allEqExternos.find(x => x.rowIndex === rowIndex) : null;
  document.getElementById('comb-ext-tipo').innerHTML = COMB_TIPOS_EXT.map(t => `<option>${t}</option>`).join('');
  const dl = document.getElementById('comb-empresas-lista'); const emp = new Set(allEqExternos.map(x => x.empresa).filter(Boolean));
  dl.innerHTML = [...emp].sort((a, b) => a.localeCompare(b, 'es')).map(x => `<option value="${_combEsc(x)}"></option>`).join('');
  _combPoblarListas();
  document.getElementById('comb-ext-titulo').textContent = e ? 'Equipo de otra empresa' : 'Nuevo equipo externo';
  document.getElementById('comb-ext-empresa').value = e ? e.empresa : '';
  document.getElementById('comb-ext-tipo').value = e ? e.tipo : 'Camión';
  document.getElementById('comb-ext-ident').value = e ? e.ident : '';
  document.getElementById('comb-ext-desc').value = e ? e.desc : '';
  document.getElementById('comb-ext-obra').value = e ? e.obra : (_combObraFiltro || COMB_OBRAS_BASE[0]);
  document.getElementById('comb-ext-retirado').checked = !!(e && e.estado === 'RETIRADO');
  document.getElementById('comb-ext-retirado-wrap').style.display = e ? '' : 'none';
  openPanel('panel-comb-ext');
}
async function combGuardarExterno() {
  const empresa = document.getElementById('comb-ext-empresa').value.trim();
  const tipo = document.getElementById('comb-ext-tipo').value;
  const ident = document.getElementById('comb-ext-ident').value.trim().toUpperCase();
  const desc = document.getElementById('comb-ext-desc').value.trim();
  const obra = document.getElementById('comb-ext-obra').value.trim().toUpperCase();
  const estado = document.getElementById('comb-ext-retirado').checked ? 'RETIRADO' : 'ACTIVO';
  if (!empresa) { toast('Indica la empresa dueña del equipo', 'error'); return; }
  if (!ident) { toast('Indica la patente o identificación', 'error'); return; }
  if (!_combEditExt && allEqExternos.some(x => x.ident.toUpperCase() === ident && x.empresa.toUpperCase() === empresa.toUpperCase())) { toast('Ese equipo ya está registrado para esa empresa', 'error'); return; }
  const btn = document.querySelector('#panel-comb-ext .pnl-action');
  if (btn) btnEstado(btn, 'cargando');
  try {
    const fila = [_combEditExt ? (allEqExternos.find(x => x.rowIndex === _combEditExt) || {}).id : 'EX-' + Date.now(), empresa, tipo, (/^\d+$/.test(ident) ? "'" + ident : ident), desc, obra, estado, (typeof userEmail !== 'undefined' ? userEmail : '')];
    if (_combEditExt) await writeSheet(`'EQUIPOS-EXTERNOS'!A${_combEditExt}:H${_combEditExt}`, [fila]);
    else await appendSheet(`'EQUIPOS-EXTERNOS'!A:H`, [fila]);
    toast('✓ Equipo guardado');
    if (btn) btnEstado(btn, 'ok');
    closePanel('panel-comb-ext');
    await loadEqExternos(); combRender();
    if (document.getElementById('panel-comb-form') && !document.getElementById('panel-comb-form').classList.contains('hidden')) {
      _combPoblarEquipos(); const nuevo = allEqExternos.find(x => x.ident === ident && x.empresa === empresa);
      if (nuevo) document.getElementById('comb-equipo').value = 'X|' + nuevo.rowIndex;
    }
  } catch (e) { toast('Error: ' + e.message, 'error'); }
  finally { if (btn) btnEstado(btn, 'reset'); }
}
