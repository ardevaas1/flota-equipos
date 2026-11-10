// ═══════════════════════════════════════════════════════════════════════
// CÓDIGOS Y ETIQUETAS (Inventario)
// ═══════════════════════════════════════════════════════════════════════
// 1) Asigna un código único a los equipos que no tienen (usa el mismo
//    generador de códigos de la app, _nextCodigo: DM-021, BET-004, etc.).
//    NUNCA cambia un código que ya existe.
// 2) Imprime etiquetas con QR para pegar en cada equipo. El QR abre la app
//    directamente en la ficha de ese equipo (ver etqAbrirPendiente).
// ═══════════════════════════════════════════════════════════════════════

const ETQ_MODULOS = [
  { id: 'generadores',  label: 'Generadores',          hoja: () => SHEET_GENERADORES,  col: 'C', get: i => i.codigo,   set: (i, v) => { i.codigo = v; },   lista: () => allGeneradores },
  { id: 'maqmenor',     label: 'Maquinaria menor',     hoja: () => SHEET_MAQ_MENOR,    col: 'K', get: i => i.numIdent, set: (i, v) => { i.numIdent = v; }, lista: () => allMaqMenor },
  { id: 'herramientas', label: 'Herramientas',         hoja: () => SHEET_HERRAMIENTAS, col: 'K', get: i => i.numIdent, set: (i, v) => { i.numIdent = v; }, lista: () => allHerramientas },
  { id: 'topografico',  label: 'Equipos topográficos', hoja: () => SHEET_TOPOGRAFICO,  col: 'M', get: i => i.numIdent, set: (i, v) => { i.numIdent = v; }, lista: () => allTopografico },
];
const _etqEsc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const _etqCodigo = (m, i) => String(m.get(i) || '').trim();

// ── Enlace desde el QR: ?eq=herramientas:DM-001 ─────────────────
(function () {
  try {
    const eq = new URLSearchParams(location.search).get('eq');
    if (eq) { sessionStorage.setItem('lst_eq_pend', eq); history.replaceState(null, '', location.pathname); }
  } catch (e) { /* sin storage: el QR igual abre la app, solo no salta a la ficha */ }
})();

function etqAbrirPendiente() {
  let eq = null;
  try { eq = sessionStorage.getItem('lst_eq_pend'); sessionStorage.removeItem('lst_eq_pend'); } catch (e) { return; }
  if (!eq) return;
  const [modId, ...resto] = eq.split(':');
  const codigo = decodeURIComponent(resto.join(':')).trim().toUpperCase();
  const m = ETQ_MODULOS.find(x => x.id === modId);
  if (!m || !codigo) return;
  if (typeof _moduloPermitidoBusqueda === 'function' && !_moduloPermitidoBusqueda('inventario')) { toast('Tu cuenta no tiene acceso a Inventario', 'error'); return; }
  const item = m.lista().find(i => _etqCodigo(m, i).toUpperCase() === codigo);
  if (!item) { toast(`No se encontró el equipo ${codigo}`, 'error'); return; }
  irAModulo('inventario');
  setTimeout(() => { invSetModulo(m.id); invAbrirDetalle(m.id, item.rowIndex); }, 380);
}

// ── Panel ───────────────────────────────────────────────────────
function etqAbrir() {
  if (userRole !== 'admin') { toast('Solo el administrador puede hacer esto', 'error'); return; }
  etqRefrescar();
  openPanel('panel-etq');
}
function etqRefrescar() {
  const filas = ETQ_MODULOS.map(m => {
    const lista = m.lista();
    const sin = lista.filter(i => !_etqCodigo(m, i)).length;
    return `<div class="field-row"><span class="fl">${m.label}</span><span class="fv">${lista.length} equipos · <b style="color:${sin ? '#c62828' : '#2e7d32'}">${sin ? sin + ' sin código' : 'todos con código'}</b></span></div>`;
  }).join('');
  document.getElementById('etq-resumen').innerHTML = filas;
  const sel = document.getElementById('etq-ubic');
  const ubics = new Set();
  ETQ_MODULOS.forEach(m => m.lista().forEach(i => { if (i.ubicacion) ubics.add(String(i.ubicacion).trim()); }));
  sel.innerHTML = '<option value="">Todas las ubicaciones</option>' + [...ubics].sort((a, b) => a.localeCompare(b, 'es')).map(u => `<option>${_etqEsc(u)}</option>`).join('');
}

// ── 1) Asignar códigos faltantes ─────────────────────────────────
let _etqCorriendo = false;
async function etqAsignarCodigos() {
  if (_etqCorriendo) return;
  if (userRole !== 'admin') { toast('Solo el administrador puede hacer esto', 'error'); return; }
  // Se calculan todos los códigos primero (sin escribir nada) para mostrarlos antes de confirmar
  const plan = [];
  ETQ_MODULOS.forEach(m => {
    [...m.lista()].sort((a, b) => a.rowIndex - b.rowIndex).forEach(i => {
      if (_etqCodigo(m, i)) return;
      const tipo = String(i.equipo || '').trim().toUpperCase();
      if (!tipo) return;
      const codigo = _nextCodigo(tipo);
      m.set(i, codigo);               // reservado en memoria para que el siguiente no repita
      plan.push({ m, i, codigo, tipo });
    });
  });
  const revertir = () => plan.forEach(p => p.m.set(p.i, ''));
  if (!plan.length) { toast('Todos los equipos ya tienen código'); return; }
  const muestra = plan.slice(0, 8).map(p => `${p.codigo} → ${p.i.equipo}${p.i.marca ? ' ' + p.i.marca : ''}${p.i.modelo ? ' ' + p.i.modelo : ''}`).join('\n');
  if (!confirm(`Se van a asignar códigos a ${plan.length} equipos que no tienen. Los que ya tienen código NO se tocan.\n\nEjemplos:\n${muestra}${plan.length > 8 ? '\n…' : ''}\n\nTarda un poco (se guardan de a uno). ¿Seguir?`)) { revertir(); return; }

  _etqCorriendo = true;
  const btn = document.getElementById('etq-btn-asignar');
  let hechos = 0; const fallas = [];
  try {
    for (const p of plan) {
      if (btn) { btn.disabled = true; btn.textContent = `Guardando ${hechos + 1} de ${plan.length}…`; }
      try {
        await writeSheet(`'${p.m.hoja()}'!${p.m.col}${p.i.rowIndex}`, [[p.codigo]]);
        p._ok = true; hechos++;
      } catch (e) {
        fallas.push(p.codigo + ': ' + e.message);
        if (/permiso|sesi/i.test(e.message)) break;
      }
    }
  } finally {
    _etqCorriendo = false;
    if (btn) { btn.disabled = false; btn.textContent = 'Asignar códigos a los equipos sin código'; }
    // Los que no se alcanzaron a guardar vuelven a quedar sin código en memoria
    plan.forEach(p => { if (!p._ok) p.m.set(p.i, ''); });
  }
  etqRefrescar();
  if (typeof renderInvLista === 'function') renderInvLista();
  toast(fallas.length ? `${hechos} códigos guardados, fallaron ${fallas.length}: ${fallas[0]}` : `✓ ${hechos} códigos asignados`, fallas.length ? 'error' : undefined);
}

// ── 2) Etiquetas con QR ──────────────────────────────────────────
function _etqUrlBase() {
  return location.origin + location.pathname.replace(/index\.html$/, '');
}
function _etqQrSvg(texto) {
  const qr = qrcode(0, 'M');
  qr.addData(texto);
  qr.make();
  return qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
}
function etqImprimir() {
  if (typeof qrcode !== 'function') { toast('No se cargó el generador de QR. Recarga la app.', 'error'); return; }
  const modSel = document.getElementById('etq-mod').value;
  const ubic = document.getElementById('etq-ubic').value;
  const items = [];
  ETQ_MODULOS.filter(m => !modSel || m.id === modSel).forEach(m => {
    m.lista().forEach(i => {
      const cod = _etqCodigo(m, i);
      if (!cod) return;
      if (ubic && String(i.ubicacion || '').trim() !== ubic) return;
      items.push({ m, i, cod });
    });
  });
  if (!items.length) { toast('No hay equipos con código para esas opciones', 'error'); return; }
  items.sort((a, b) => a.cod.localeCompare(b.cod, 'es', { numeric: true }));
  const base = _etqUrlBase();
  const etiquetas = items.map(({ m, i, cod }) => {
    const url = `${base}?eq=${m.id}:${encodeURIComponent(cod)}`;
    const desc = [i.equipo, i.marca, i.modelo].filter(Boolean).join(' ');
    return `<div class="et"><div class="qr">${_etqQrSvg(url)}</div><div class="tx"><div class="lst">LST · Constructora</div><div class="cod">${_etqEsc(cod)}</div><div class="ds">${_etqEsc(desc)}</div></div></div>`;
  }).join('');
  const w = window.open('', '_blank');
  if (!w) { toast('El navegador bloqueó la ventana. Permite ventanas emergentes e inténtalo de nuevo.', 'error'); return; }
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Etiquetas LST (${items.length})</title><style>
    @page { size: A4; margin: 0 }
    * { box-sizing: border-box }
    body { margin: 0; font-family: Arial, Helvetica, sans-serif; }
    .barra { padding: 10px 14px; background: #fff3d6; font-size: 13px; position: sticky; top: 0 }
    .barra button { font-size: 14px; padding: 6px 14px; margin-right: 10px }
    .hoja { display: grid; grid-template-columns: repeat(3, 70mm); grid-auto-rows: 36mm; width: 210mm; margin: 0 auto; }
    .et { display: flex; align-items: center; gap: 2.5mm; padding: 2.5mm; border: 0.2mm dashed #aaa; overflow: hidden; break-inside: avoid }
    .qr { width: 27mm; height: 27mm; flex-shrink: 0 } .qr svg { width: 100%; height: 100% }
    .tx { min-width: 0; flex: 1 }
    .lst { font-size: 6.5pt; letter-spacing: .3px; color: #555; font-weight: 700 }
    .cod { font-size: 17pt; font-weight: 800; line-height: 1.1; margin: 1mm 0; word-break: break-all }
    .ds { font-size: 7.5pt; line-height: 1.2; color: #222; max-height: 12mm; overflow: hidden }
    @media print { .barra { display: none } }
  </style></head><body>
  <div class="barra"><button onclick="window.print()">Imprimir</button> ${items.length} etiquetas (24 por hoja A4, 70×36 mm). Imprime al 100%, sin "ajustar a la página". Se pueden usar hojas de stickers o papel normal y recortar por la línea punteada.</div>
  <div class="hoja">${etiquetas}</div></body></html>`);
  w.document.close();
}
