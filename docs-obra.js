// ═══════════════════════════════════════════════════════
// DOCUMENTOS POR OBRA (solo admin)
// Elige una obra/ubicación y la app arma un zip con la ficha técnica,
// el manual, el PTS y el registro de difusión SOLO de los modelos de
// equipo que están en esa obra (una carpeta por modelo, sin repetidos).
// El zip lo arma el Apps Script (acción docs_obra) a partir del zip
// maestro "Manuales-y-PTS-LST.zip" que está en Drive.
// La relación equipo → carpeta está en docs-obra-indice.js.
// ═══════════════════════════════════════════════════════

const _dobraEsc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const _dobraNorm = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\.0$/, '').replace(/[^A-Z0-9]/g, '');
const _dobraClave = (i) => `${_dobraNorm(i.equipo)}|${_dobraNorm(i.marca)}|${_dobraNorm(i.modelo)}`;
const _dobraObraKey = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();

// Todas las listas de equipos que tienen documentos (Andamios y Containers no)
function _dobraFuentes() {
  return [
    { modulo: 'Flota',                lista: () => (typeof allEquipos !== 'undefined' ? allEquipos : []),           cod: i => i.patente },
    { modulo: 'Generadores',          lista: () => (typeof allGeneradores !== 'undefined' ? allGeneradores : []),   cod: i => i.codigo || i.num },
    { modulo: 'Maquinaria menor',     lista: () => (typeof allMaqMenor !== 'undefined' ? allMaqMenor : []),         cod: i => i.codigo || i.numIdent || i.num },
    { modulo: 'Herramientas',         lista: () => (typeof allHerramientas !== 'undefined' ? allHerramientas : []), cod: i => i.codigo || i.numIdent || i.num },
    { modulo: 'Equipos topográficos', lista: () => (typeof allTopografico !== 'undefined' ? allTopografico : []),   cod: i => i.codigo || i.numIdent || i.num },
  ];
}

// Equipos de una obra (key normalizada de la ubicación) → [{modulo,codigo,equipo,marca,modelo,carpeta}]
function _dobraEquiposDe(obraKey) {
  const out = [];
  _dobraFuentes().forEach(f => f.lista().forEach(i => {
    if (_dobraObraKey(i.ubicacion) !== obraKey) return;
    const carpeta = DOCS_OBRA_INDICE[_dobraClave(i)] || '';
    out.push({ modulo: f.modulo, codigo: String(f.cod(i) || ''), equipo: i.equipo || '', marca: i.marca || '', modelo: i.modelo || '', carpeta });
  }));
  return out;
}

function dobraAbrir() {
  if (userRole !== 'admin') { toast('Solo el administrador puede hacer esto', 'error'); return; }
  const obras = new Map();   // key → { label, n }
  _dobraFuentes().forEach(f => f.lista().forEach(i => {
    const lab = String(i.ubicacion || '').trim();
    if (!lab) return;
    const k = _dobraObraKey(lab);
    if (!obras.has(k)) obras.set(k, { label: lab, n: 0 });
    obras.get(k).n++;
  }));
  const sel = document.getElementById('dobra-obra');
  sel.innerHTML = '<option value="">Elige una obra o ubicación…</option>' +
    [...obras.entries()].sort((a, b) => a[1].label.localeCompare(b[1].label, 'es'))
      .map(([k, o]) => `<option value="${_dobraEsc(k)}">${_dobraEsc(o.label)} (${o.n})</option>`).join('');
  document.getElementById('dobra-resumen').innerHTML = '';
  document.getElementById('dobra-resultado').innerHTML = '';
  document.getElementById('dobra-btn').style.display = 'none';
  openPanel('panel-dobra');
}

function dobraElegir() {
  const k = document.getElementById('dobra-obra').value;
  const box = document.getElementById('dobra-resumen');
  document.getElementById('dobra-resultado').innerHTML = '';
  if (!k) { box.innerHTML = ''; document.getElementById('dobra-btn').style.display = 'none'; return; }
  const eq = _dobraEquiposDe(k);
  const con = eq.filter(e => e.carpeta), sin = eq.filter(e => !e.carpeta);
  const modelos = new Set(con.map(e => e.carpeta));
  const porMod = {};
  eq.forEach(e => { porMod[e.modulo] = (porMod[e.modulo] || 0) + 1; });
  box.innerHTML =
    `<div class="field-row"><span class="fl">Equipos en la obra</span><span class="fv">${eq.length}</span></div>` +
    Object.entries(porMod).map(([m, n]) => `<div class="field-row"><span class="fl">· ${_dobraEsc(m)}</span><span class="fv">${n}</span></div>`).join('') +
    `<div class="field-row"><span class="fl">Modelos distintos con documentos</span><span class="fv"><b style="color:#2e7d32">${modelos.size}</b></span></div>` +
    (sin.length ? `<div class="nota" style="margin-top:8px"><b style="color:#c62828">${sin.length} equipo${sin.length === 1 ? '' : 's'} sin documentos</b> (modelo no incluido en el zip maestro): ${sin.map(e => _dobraEsc((e.codigo ? e.codigo + ' · ' : '') + [e.equipo, e.marca, e.modelo].filter(Boolean).join(' '))).join('; ')}</div>` : '');
  document.getElementById('dobra-btn').style.display = modelos.size ? '' : 'none';
}

let _dobraCorriendo = false;
async function dobraGenerar() {
  if (_dobraCorriendo) return;
  if (userRole !== 'admin') { toast('Solo el administrador puede hacer esto', 'error'); return; }
  const sel = document.getElementById('dobra-obra');
  const k = sel.value;
  if (!k) return;
  const obra = sel.options[sel.selectedIndex].textContent.replace(/\s*\(\d+\)\s*$/, '');
  const eq = _dobraEquiposDe(k);
  const carpetas = [...new Set(eq.filter(e => e.carpeta).map(e => e.carpeta))];
  if (!carpetas.length) { toast('Esa obra no tiene equipos con documentos', 'error'); return; }
  const btn = document.getElementById('dobra-btn');
  const res = document.getElementById('dobra-resultado');
  _dobraCorriendo = true; btn.disabled = true;
  res.innerHTML = '<div class="nota">Armando el zip… puede tardar hasta un minuto. No cierres la app.</div>';
  try {
    const r = await _appsScriptCall('docs_obra', { obra, carpetas, items: eq });
    if (!r.success) throw new Error(r.error || 'No se pudo armar el zip');
    res.innerHTML =
      `<div class="nota" style="margin-bottom:8px">Listo: <b>${_dobraEsc(r.nombre)}</b> · ${r.modelos} modelo${r.modelos === 1 ? '' : 's'} · ${r.archivos} archivos</div>` +
      `<a class="action-btn" style="display:block;text-align:center;text-decoration:none;margin-bottom:8px" href="${_dobraEsc(r.downloadUrl)}" target="_blank" rel="noopener">Descargar zip</a>` +
      `<a class="action-btn" style="display:block;text-align:center;text-decoration:none" href="${_dobraEsc(r.url)}" target="_blank" rel="noopener">Abrir en Drive</a>` +
      (r.faltantes && r.faltantes.length ? `<div class="nota" style="margin-top:8px;color:#c62828">No se encontraron en el zip maestro las carpetas: ${r.faltantes.map(_dobraEsc).join(', ')}</div>` : '');
  } catch (e) {
    res.innerHTML = `<div class="nota" style="color:#c62828">${_dobraEsc(e.message || e)}</div>`;
  } finally {
    _dobraCorriendo = false; btn.disabled = false;
  }
}
