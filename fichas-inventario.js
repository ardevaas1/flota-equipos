// ═══════════════════════════════════════════════════════════════
// FICHAS TÉCNICAS — Inventario (Generadores, Maq. Menor, Herramientas,
// Equipos Topográficos). Un Google Doc por equipo, guardado en
//   Inventario / Fichas Técnicas / <módulo> /
// Se crean con el mismo mecanismo que las fichas de vehículos
// (acción 'drive_create_google_doc' del Apps Script): NO requiere cambios
// en el Apps Script. Si la ficha de un equipo ya existe no se duplica.
// ═══════════════════════════════════════════════════════════════

const FICHA_INV_MODULOS = [
  { id: 'generadores',  label: 'Generadores',          lista: () => allGeneradores },
  { id: 'maqmenor',     label: 'Maquinaria Menor',     lista: () => allMaqMenor },
  { id: 'herramientas', label: 'Herramientas',         lista: () => allHerramientas },
  { id: 'topografico',  label: 'Equipos Topográficos', lista: () => allTopografico },
];
const FICHA_INV_PREFIJO = 'Ficha técnica';

function _fiEsc(s) {
  return (s == null ? '' : String(s)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n+/g, '<br>');
}
function _fiIdent(item) {
  return (item.codigo || item.numIdent || ('N° ' + (item.num || item.rowIndex))).toString().trim();
}
function _fiNombreDoc(modLabel, item) {
  const desc = [item.equipo, item.marca, item.modelo].filter(Boolean).join(' ');
  // Los "/" no van en nombres de archivo
  return `${FICHA_INV_PREFIJO} - ${modLabel} - ${_fiIdent(item)} - ${desc}`.replace(/[\/\\]/g, '-').replace(/'/g, '’');
}
function _fiPrefijoBusqueda(modLabel, item) {
  return `${FICHA_INV_PREFIJO} - ${modLabel} - ${_fiIdent(item)} - `.replace(/[\/\\]/g, '-').replace(/'/g, '’');
}

function _fiFilas(modId, item) {
  const f = [];
  const add = (l, v) => { if (v !== undefined && v !== null && String(v).trim() !== '') f.push([l, v]); };
  add('EQUIPO', item.equipo);
  add(modId === 'generadores' ? 'CÓDIGO' : 'N° DE IDENTIFICACIÓN', modId === 'generadores' ? item.codigo : item.numIdent);
  add('N° INTERNO', item.num);
  add('MARCA', item.marca);
  add('MODELO', item.modelo);
  if (modId === 'topografico') add('N° DE SERIE', item.motor);
  else if (modId !== 'generadores') add('MOTOR / POTENCIA', item.motor);
  if (modId === 'generadores') { add('POTENCIA', item.potencia); add('AÑO', item.anio); }
  add('COLOR', item.color);
  add('ESTADO', item.estado);
  add('UBICACIÓN', item.ubicacion);
  if (modId === 'generadores') {
    add('HORÓMETRO', item.horometro);
    add('PRÓXIMA MANTENCIÓN', item.proxMant);
    add('ÚLTIMA MANTENCIÓN', item.ultMant);
  }
  if (modId === 'topografico') {
    add('PRÓXIMA CALIBRACIÓN', item.proxCal);
    add('ÚLTIMA CALIBRACIÓN', item.ultCal);
  }
  return f;
}

function _fiHtml(modId, modLabel, item, linkCarpeta) {
  const filas = _fiFilas(modId, item).map(([l, v]) =>
    `<tr><td class="etiqueta">${_fiEsc(l)}</td><td class="valor">${_fiEsc(v)}</td></tr>`).join('');
  const nombre = [item.equipo, item.marca, item.modelo].filter(Boolean).join(' ');
  const eventos = (modId === 'generadores' && typeof allGenEventos !== 'undefined')
    ? allGenEventos.filter(e => e.codigo && e.codigo === item.codigo) : [];
  const filasEv = eventos.length
    ? eventos.map(e => `<tr><td>${_fiEsc(e.fechaEvento)}</td><td>${_fiEsc(e.horometro)}</td><td>${_fiEsc(e.tipo)}</td><td>${_fiEsc(e.descripcion)}</td></tr>`).join('')
    : `<tr><td colspan="4" style="text-align:center;color:#93a5b6">Sin eventos registrados todavía</td></tr>`;
  const hoy = new Date().toLocaleDateString('es-CL');
  // ── Datos del fabricante (fichas-datos-fabricante.js) ──
  const fab = (typeof fichaFabricanteDe === 'function') ? fichaFabricanteDe(item) : null;
  const marcaOk = item.marca && !/^[\s¿?\-]*$/.test(item.marca);
  const modeloOk = item.modelo && !/^[\s¿?\-]*$/.test(item.modelo) && !/^\d+(\.0)?$/.test(item.modelo);
  const lnk = (t, u) => `<a href="${_fiEsc(u)}">${_fiEsc(t)}</a>`;
  const busqueda = (marcaOk && modeloOk)
    ? 'https://www.google.com/search?q=' + encodeURIComponent(`${item.marca} ${item.modelo} ${item.equipo} manual PDF ficha técnica`)
    : '';
  let htmlFab = '';
  if (fab && fab.specs && fab.specs.length) {
    htmlFab = `<table class="datos-tabla">${fab.specs.map(([l, v]) => `<tr><td class="etiqueta">${_fiEsc(l)}</td><td class="valor">${_fiEsc(v)}</td></tr>`).join('')}</table>`
      + (fab.nota ? `<div class="obs-caja" style="margin-top:8px">⚠ ${_fiEsc(fab.nota)}</div>` : '')
      + (fab.fuente ? `<div class="nota">Fuente: ${lnk(fab.fuente[0], fab.fuente[1])}. Datos de referencia del modelo: verifica con la placa de tu equipo.</div>` : '');
  } else {
    htmlFab = `<div class="obs-caja">${fab && fab.nota ? _fiEsc(fab.nota) : 'No se encontraron especificaciones publicadas por el fabricante para este modelo.'}</div>`
      + (busqueda ? `<div class="nota">${lnk('Buscar especificaciones en internet', busqueda)}</div>` : '');
  }
  const recs = (fab && fab.recs && fab.recs.length) ? `<ul>${fab.recs.map(r => `<li>${_fiEsc(r)}</li>`).join('')}</ul>` : '';
  const manualLink = fab && fab.manual ? `<div class="link-caja">📘 Manual: ${lnk(fab.manual[0], fab.manual[1])}</div>`
    : (busqueda ? `<div class="link-caja">📘 Manual del fabricante: ${lnk('buscar manual en internet', busqueda)}</div>` : '<div class="obs-caja">Sin información de marca/modelo para buscar el manual.</div>');
  const htmlManual = recs + manualLink
    + `<div class="nota">Revisa siempre el manual del fabricante para el plan de mantención y las normas de seguridad del equipo.</div>`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  body { font-family: 'Trebuchet MS', Arial, sans-serif; color: #263646; font-size: 14px; line-height: 1.4; }
  p, div { margin: 0; padding: 0; }
  table.header-tabla { width: 100%; border-collapse: collapse; }
  table.header-tabla td { background: #0f3d66; color: #ffffff; text-align: center; padding: 16px 20px; border: none; }
  .header-tabla .empresa { font-size: 12.5px; letter-spacing: 3px; color: #9fc3e8; font-weight: bold; margin-bottom: 4px; }
  .header-tabla .titulo { font-size: 19px; font-weight: bold; letter-spacing: 1px; }
  .header-tabla .subtitulo { font-size: 12.5px; color: #cfe3f5; margin-top: 3px; letter-spacing: 1px; }
  .datos-tabla { width: 100%; border-collapse: collapse; border: 1px solid #d7e2ec; }
  .datos-tabla td { border: 1px solid #e3ebf3; padding: 8px 12px; font-size: 13.5px; }
  .datos-tabla .etiqueta { background: #eef5fc; font-weight: bold; color: #0f3d66; width: 38%; letter-spacing: 0.3px; }
  .datos-tabla .valor { background: #ffffff; color: #1f2d3a; font-weight: bold; }
  .seccion { margin-top: 22px; margin-bottom: 9px; border-bottom: 2px solid #0f3d66; padding-bottom: 5px; }
  .seccion .num { color: #6f8aa3; font-weight: bold; font-size: 13.5px; }
  .seccion .txt { color: #0f3d66; font-weight: bold; font-size: 14.5px; letter-spacing: 0.5px; }
  table.grilla { width: 100%; border-collapse: collapse; }
  table.grilla th { background: #0f3d66; color: #fff; font-size: 12px; text-align: left; padding: 8px 11px; }
  table.grilla td { border: 1px solid #e3ebf3; padding: 8px 11px; font-size: 13.5px; }
  .obs-caja { background: #fff2e2; border: 1px solid #f3d3a8; border-radius: 6px; padding: 11px 13px; font-size: 13.5px; }
  .link-caja { background: #eef5fc; border: 1px solid #cfe0f0; border-radius: 6px; padding: 11px 13px; font-size: 13.5px; }
  .link-caja a { color: #0f3d66; font-weight: bold; text-decoration: underline; }
  ul { margin: 6px 0 8px 18px; font-size: 13.5px; }
  .nota { font-size: 12px; color: #8697a8; margin-top: 12px; font-style: italic; }
  </style></head><body>
  <table class="header-tabla"><tr><td>
    <div class="empresa">CONSTRUCTORA LST</div>
    <div class="titulo">FICHA TÉCNICA — ${_fiEsc(modLabel.toUpperCase())}</div>
    <div class="subtitulo">${_fiEsc(nombre)}</div>
  </td></tr></table>
  <div class="seccion" style="margin-top:20px"><span class="num">01&nbsp;&nbsp;·&nbsp;&nbsp;</span><span class="txt">DATOS DEL EQUIPO</span></div>
  <table class="datos-tabla">${filas}</table>
  <div class="seccion"><span class="num">02&nbsp;&nbsp;·&nbsp;&nbsp;</span><span class="txt">ESPECIFICACIONES DEL FABRICANTE</span></div>
  ${htmlFab}
  <div class="seccion"><span class="num">03&nbsp;&nbsp;·&nbsp;&nbsp;</span><span class="txt">MANUAL Y RECOMENDACIONES</span></div>
  ${htmlManual}
  <div class="seccion"><span class="num">04&nbsp;&nbsp;·&nbsp;&nbsp;</span><span class="txt">OBSERVACIONES</span></div>
  <div class="obs-caja">${item.obs ? _fiEsc(item.obs) : 'Sin observaciones'}</div>
  <div class="seccion"><span class="num">05&nbsp;&nbsp;·&nbsp;&nbsp;</span><span class="txt">REGISTRO FOTOGRÁFICO</span></div>
  <div class="link-caja">📁 ${linkCarpeta ? `<a href="${_fiEsc(linkCarpeta)}">Abrir carpeta de fotos</a>` : 'Las fotos de este equipo están en la carpeta de Inventario en Drive.'}</div>
  ${modId === 'generadores' ? `
  <div class="seccion"><span class="num">06&nbsp;&nbsp;·&nbsp;&nbsp;</span><span class="txt">HISTORIAL DE EVENTOS</span></div>
  <table class="grilla">
    <tr><th>FECHA</th><th>HORÓMETRO</th><th>TIPO</th><th>DESCRIPCIÓN</th></tr>
    ${filasEv}
  </table>` : ''}
  <div class="nota">Ficha generada desde la app Flota y Equipos el ${hoy}. Los datos reflejan lo registrado en esa fecha.</div>
  </body></html>`;
}

// Carpeta "Fichas Técnicas / <módulo>" dentro de la carpeta de Inventario
async function _fiCarpetaModulo(modLabel) {
  const raiz = await findOrCreateFolder('inventario', 'Fichas Técnicas', DRIVE_INV_FOLDER);
  return findOrCreateFolder('inventario', modLabel, raiz);
}

async function _fiListarExistentes(carpetaId) {
  const d = await driveSearch('inventario', `'${carpetaId}' in parents and mimeType='application/vnd.google-apps.document' and trashed=false`);
  return d.files || [];
}

// Crea (o devuelve la ya existente) la ficha de UN equipo
async function _fiCrearUna(modulo, item, existentes) {
  const carpetaId = await _fiCarpetaModulo(modulo.label);
  const prefijo = _fiPrefijoBusqueda(modulo.label, item);
  const lista = existentes || await _fiListarExistentes(carpetaId);
  const ya = lista.find(f => (f.name || f.title || '').startsWith(prefijo));
  if (ya) return { id: ya.id, creada: false };
  const linkCarpeta = `https://drive.google.com/drive/folders/${DRIVE_INV_FOLDER}`;
  const file = await _crearDocDesdeHtml(_fiNombreDoc(modulo.label, item), _fiHtml(modulo.id, modulo.label, item, linkCarpeta), carpetaId);
  if (existentes) existentes.push({ id: file.id, name: _fiNombreDoc(modulo.label, item) });
  return { id: file.id, creada: true };
}

// Botón "Ficha técnica" dentro del detalle de un equipo: abre la ficha si
// existe y, si no, la crea en ese momento.
async function invFichaTecnica() {
  if (!invItem) return;
  const modulo = FICHA_INV_MODULOS.find(m => m.id === invItem._modulo);
  if (!modulo) { toast('Este tipo de equipo no tiene ficha técnica', 'error'); return; }
  // Se abre la pestaña ANTES del await para que el navegador no la bloquee
  const ventana = window.open('', '_blank');
  toast('Preparando ficha técnica...', 'loading');
  try {
    const r = await _fiCrearUna(modulo, invItem);
    const url = `https://docs.google.com/document/d/${r.id}/edit`;
    if (ventana) ventana.location.href = url; else window.location.href = url;
    toast(r.creada ? '✓ Ficha técnica creada' : '✓ Ficha técnica abierta');
  } catch (err) {
    if (ventana) ventana.close();
    console.error('[FICHA INV]', err);
    toast('No se pudo preparar la ficha: ' + err.message, 'error');
  }
}

// Genera las fichas de TODOS los equipos (de a una; las que ya existen se
// saltan, así que se puede volver a correr sin duplicar nada).
let _fichasInvCorriendo = false;
async function invGenerarTodasLasFichas() {
  if (_fichasInvCorriendo) return;
  if (userRole !== 'admin') { toast('Solo el administrador puede hacer esto', 'error'); return; }
  if (!allGeneradores.length && !allMaqMenor.length && !allHerramientas.length && !allTopografico.length) {
    toast('Primero espera a que carguen los equipos', 'error'); return;
  }
  const total = FICHA_INV_MODULOS.reduce((n, m) => n + m.lista().length, 0);
  if (!confirm(`Se van a crear las fichas técnicas de ${total} equipos (generadores, maquinaria menor, herramientas y equipos topográficos), cada una como un Google Doc dentro de Inventario › Fichas Técnicas. Las que ya existan no se duplican. Tarda varios minutos: no cierres la app mientras corre. ¿Seguir?`)) return;

  _fichasInvCorriendo = true;
  const btns = [...document.querySelectorAll('.btn-fichas-inv')];
  const textoOriginal = 'Crear fichas técnicas de todos los equipos';
  const setBtns = (txt, dis) => btns.forEach(b => { b.disabled = dis; b.textContent = txt; });
  let creadas = 0, yaExistian = 0, hechos = 0;
  const fallas = [];
  try {
    for (const modulo of FICHA_INV_MODULOS) {
      const items = modulo.lista();
      if (!items.length) continue;
      const carpetaId = await _fiCarpetaModulo(modulo.label);
      const existentes = await _fiListarExistentes(carpetaId);
      for (const item of items) {
        hechos++;
        setBtns(`Fichas ${hechos} de ${total}… (${modulo.label})`, true);
        try {
          const r = await _fiCrearUna(modulo, item, existentes);
          r.creada ? creadas++ : yaExistian++;
        } catch (err) {
          console.error('[FICHAS INV]', modulo.label, _fiIdent(item), err);
          fallas.push(`${modulo.label} ${_fiIdent(item)}`);
          if (/403|permiso/i.test(err.message)) throw err;
        }
        await new Promise(r => setTimeout(r, 700));
      }
    }
  } catch (err) {
    toast('Se detuvo: ' + err.message, 'error');
  } finally {
    _fichasInvCorriendo = false;
    setBtns(textoOriginal, false);
  }
  if (!fallas.length) toast(`✓ ${creadas} fichas creadas${yaExistian ? ` (${yaExistian} ya existían)` : ''}`);
  else toast(`${creadas} creadas, ${yaExistian} ya existían. Fallaron ${fallas.length}: ${fallas.slice(0, 5).join(', ')}${fallas.length > 5 ? '…' : ''}`, 'error');
}
