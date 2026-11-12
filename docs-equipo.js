// ════════════════════════════════════════════════════════════════════
// DOCUMENTOS DEL EQUIPO — Manual de uso y PTS (Procedimiento de Trabajo Seguro)
// ────────────────────────────────────────────────────────────────────
// Los documentos se hacen UNA vez (en Word, con su formato) y se suben al equipo;
// después cualquiera puede verlos desde su ficha. Se guardan TAL CUAL (sin convertir),
// así el formato no cambia. Viven en Drive, en la carpeta "Documentos del equipo",
// con el nombre:  "Manual de uso - <identificador> - <descripción>.docx"
//                 "PTS - <identificador> - <descripción>.docx"
// Solo el administrador sube/reemplaza; todos los que ven el equipo pueden abrirlos.
// ════════════════════════════════════════════════════════════════════
const DOCS_EQ_TIPOS = [
  { id: 'MAN', prefijo: 'Manual de uso', titulo: 'Manual de uso', ayuda: 'Cómo usar y mantener el equipo' },
  { id: 'PTS', prefijo: 'PTS', titulo: 'PTS · Procedimiento de trabajo seguro', ayuda: 'Pasos seguros, EPP y riesgos' },
];
const DOCS_EQ_MIME = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pdf: 'application/pdf',
};
let _docsEqCtx = null;   // { modulo: 'inventario'|'flota', ident, desc, raiz }

const _deEsc = s => (s == null ? '' : String(s)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const _deLimpio = s => (s == null ? '' : String(s)).replace(/[\/\\]/g, '-').replace(/'/g, '’').trim();

async function _docsEqCarpeta() {
  return findOrCreateFolder(_docsEqCtx.modulo, 'Documentos del equipo', _docsEqCtx.raiz);
}

// HTML de la sección (se rellena sola con docsEqCargar)
function docsEqSeccion(ctx) {
  _docsEqCtx = ctx;
  const admin = typeof userRole !== 'undefined' && userRole === 'admin';
  return `<div class="ficha-section" id="docs-eq-sec">
    <div class="ficha-sec-title">Documentos del equipo</div>
    ${DOCS_EQ_TIPOS.map(t => `<div class="docs-eq-fila" id="docs-eq-${t.id}">
      <div class="docs-eq-ic"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2h9l3 3v17H6Z"/><path d="M9 11h6M9 15h6M9 7h3"/></svg></div>
      <div class="docs-eq-txt"><b>${_deEsc(t.titulo)}</b><small data-estado>Buscando…</small></div>
      <div class="docs-eq-acc">
        <button type="button" class="docs-eq-ver" data-ver style="display:none" onclick="docsEqVer('${t.id}')">Ver</button>
        ${admin ? `<label class="docs-eq-subir" data-subir>Subir<input type="file" accept=".docx,.pdf" style="display:none" onchange="docsEqSubir('${t.id}', this)"></label>` : ''}
      </div>
    </div>`).join('')}
  </div>`;
}

const _docsEqArchivos = {};   // id de tipo → { id, name }

async function docsEqCargar() {
  const ctx = _docsEqCtx; if (!ctx) return;
  DOCS_EQ_TIPOS.forEach(t => delete _docsEqArchivos[t.id]);
  try {
    const carpeta = await _docsEqCarpeta();
    const d = await driveSearch(ctx.modulo, `'${carpeta}' in parents and trashed=false`);
    if (_docsEqCtx !== ctx) return;   // el usuario ya abrió otro equipo
    const lista = (d.files || []);
    DOCS_EQ_TIPOS.forEach(t => {
      const pre = `${t.prefijo} - ${_deLimpio(ctx.ident)} - `;
      const hit = lista.filter(f => (f.name || f.title || '').startsWith(pre))
        .sort((a, b) => new Date(b.createdTime || 0) - new Date(a.createdTime || 0))[0];
      if (hit) _docsEqArchivos[t.id] = { id: hit.id, name: hit.name || hit.title };
      _docsEqPintar(t.id);
    });
  } catch (e) {
    console.warn('[DOCS EQ]', e.message);
    DOCS_EQ_TIPOS.forEach(t => _docsEqPintar(t.id, 'No se pudo consultar'));
  }
}

function _docsEqPintar(id, msg) {
  const fila = document.getElementById('docs-eq-' + id); if (!fila) return;
  const a = _docsEqArchivos[id];
  fila.querySelector('[data-estado]').textContent = msg || (a ? 'Disponible' : 'Aún no cargado');
  fila.querySelector('[data-ver]').style.display = a ? '' : 'none';
  const sub = fila.querySelector('[data-subir]'); if (sub) sub.firstChild.nodeValue = a ? 'Reemplazar' : 'Subir';
  fila.classList.toggle('ok', !!a);
}

function docsEqVer(id) {
  const a = _docsEqArchivos[id]; if (!a) return;
  // Vista previa de Drive: muestra el Word/PDF con su formato original
  window.open(`https://drive.google.com/file/d/${a.id}/view`, '_blank', 'noopener');
}

async function docsEqSubir(id, input) {
  const ctx = _docsEqCtx, file = input.files && input.files[0]; input.value = '';
  if (!ctx || !file) return;
  if (typeof userRole === 'undefined' || userRole !== 'admin') { toast('Solo el administrador puede subir documentos', 'error'); return; }
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  if (!DOCS_EQ_MIME[ext]) { toast('El archivo debe ser Word (.docx) o PDF', 'error'); return; }
  if (file.size > 15 * 1024 * 1024) { toast('El archivo pesa más de 15 MB', 'error'); return; }
  const tipo = DOCS_EQ_TIPOS.find(t => t.id === id);
  const nombre = `${tipo.prefijo} - ${_deLimpio(ctx.ident)} - ${_deLimpio(ctx.desc)}`.slice(0, 150) + '.' + ext;
  toast('Subiendo documento...', 'loading');
  try {
    const b64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1]); r.onerror = () => rej(new Error('No se pudo leer el archivo')); r.readAsDataURL(file); });
    const carpeta = await _docsEqCarpeta();
    // Si ya había uno de este tipo con otro nombre/extensión, va a la papelera (queda solo el nuevo)
    const previo = _docsEqArchivos[id];
    const subido = await driveUpload(ctx.modulo, carpeta, nombre, DOCS_EQ_MIME[ext], b64, true);
    if (previo && previo.id !== subido.id) { try { await driveTrash(ctx.modulo, previo.id); } catch (e) { console.warn(e.message); } }
    _docsEqArchivos[id] = { id: subido.id, name: nombre };
    _docsEqPintar(id);
    toast('✓ Documento guardado');
  } catch (e) {
    console.error('[DOCS EQ]', e);
    toast('No se pudo subir: ' + e.message, 'error');
  }
}
