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
  const nombre = [item.equipo, item.marca, item.modelo].filter(Boolean).join(' ');
  const hoy = new Date().toLocaleDateString('es-CL');
  const ok = (v) => v !== undefined && v !== null && String(v).trim() !== '' && !/^[\s¿?\-]*$/.test(String(v));
  const fab = (typeof fichaFabricanteDe === 'function') ? fichaFabricanteDe(item) : null;
  const tipo = fichaTipoDe(item.equipo);
  const lnk = (t, u) => `<a href="${_fiEsc(u)}">${_fiEsc(t)}</a>`;
  const marcaOk = ok(item.marca), modeloOk = ok(item.modelo) && !/^\d+(\.0)?$/.test(item.modelo);
  const busqueda = (marcaOk && modeloOk)
    ? 'https://www.google.com/search?q=' + encodeURIComponent(`${item.marca} ${item.modelo} ${item.equipo} manual PDF ficha técnica`) : '';

  // 1. Identificación
  const ident = _fiFilas(modId, item).map(([l, v]) => [l.charAt(0) + l.slice(1).toLowerCase(), v]);
  const tIdent = fichaTabla(['Campo', 'Dato'], ident);

  // 2. Datos técnicos (Característica / Valor / Fuente)
  let filasTec = [];
  if (fab && fab.specs && fab.specs.length) filasTec = fab.specs.map(([l, v]) => [l, v, 'Fabricante']);
  const reg = (l, v) => { if (ok(v)) filasTec.push([l, v, 'Registro en la app']); };
  if (!filasTec.length) {
    if (modId === 'generadores') { reg('Potencia', item.potencia); reg('Año', item.anio); reg('Horómetro actual', item.horometro); }
    else if (modId === 'topografico') { reg('N° de serie', item.motor); reg('Última calibración', item.ultCal); reg('Próxima calibración', item.proxCal); }
    else reg('Motor / potencia', item.motor);
    reg('Color', item.color);
  }
  const tTec = filasTec.length
    ? fichaTabla(['Característica', 'Valor', 'Fuente'], filasTec)
    : `<p>Este equipo no tiene características técnicas registradas.</p>`;
  const notaTec = (fab && fab.nota ? `<p class="nota">⚠ ${_fiEsc(fab.nota)}</p>` : '')
    + `<p class="nota">${fab && fab.specs && fab.specs.length ? 'Datos de referencia del modelo' + (fab.fuente ? ' (fuente: ' + lnk(fab.fuente[0], fab.fuente[1]) + ')' : '') + ': confirmar con la placa del equipo.' : 'No se encontraron especificaciones publicadas por el fabricante; se muestra lo registrado en la app.' + (busqueda ? ' ' + lnk('Buscar en internet', busqueda) : '')}</p>`;

  // 3. Requisitos de instalación y uso
  const requisitos = [...(fab && fab.recs ? fab.recs : []), ...tipo.uso];
  // 4. Riesgos y EPP
  const tRiesgos = fichaTabla(['Riesgo', 'Control principal'], tipo.riesgos);
  // 5. Plan de mantención
  const tMant = fichaTabla(['Frecuencia', 'Actividad', 'Responsable'], tipo.mant);
  // 6. Manual
  const manual = fab && fab.manual ? lnk(fab.manual[0], fab.manual[1])
    : (busqueda ? lnk('buscar el manual en internet', busqueda) : 'sin información de marca/modelo');

  // Historial (solo generadores)
  let histo = '';
  if (modId === 'generadores') {
    const ev = (typeof allGenEventos !== 'undefined') ? allGenEventos.filter(e => e.codigo && e.codigo === item.codigo) : [];
    histo = fichaSec(7, 'Historial de eventos') + (ev.length
      ? fichaTabla(['Fecha', 'Horómetro', 'Tipo', 'Descripción'], ev.map(e => [e.fechaEvento, e.horometro, e.tipo, e.descripcion]), false)
      : '<p>Sin eventos registrados todavía.</p>');
  }
  const codigo = 'FT-' + _fiIdent(item).replace(/\s+/g, '');
  const foto = (typeof fichaImagenDe === 'function') ? fichaImagenDe(item) : '';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${FICHA_CSS}</style></head><body>
  ${fichaCabecera('FICHA TÉCNICA – ' + nombre.toUpperCase(), codigo, hoy)}
  <div class="t1">FICHA TÉCNICA DEL EQUIPO</div>
  <div class="t2">${_fiEsc(nombre)}</div>
  ${fichaPortadaHtml(!!foto)}
  ${fichaSec(1, 'Identificación')}${tIdent}
  ${fichaSec(2, 'Datos técnicos')}${tTec}${notaTec}
  ${fichaSec(3, 'Requisitos de instalación y uso')}${fichaVinetas(requisitos)}
  ${fichaSec(4, 'Riesgos principales y EPP')}${tRiesgos}
  <p style="margin-top:6px"><b>EPP obligatorio:</b> ${_fiEsc(tipo.epp)}</p>
  ${fichaSec(5, 'Plan de mantención')}${tMant}
  ${fichaSec(6, 'Manual y observaciones')}
  <p><b>Manual del fabricante:</b> ${manual}</p>
  <p><b>Observaciones:</b> ${item.obs ? _fiEsc(item.obs) : 'Sin observaciones'}</p>
  <p><b>Fotos del equipo:</b> ${linkCarpeta ? lnk('abrir carpeta de fotos', linkCarpeta) : 'en la carpeta de Inventario en Drive'}</p>
  ${histo}
  <p class="firma">Elaboró: ______________________ · Aprobó: ______________________ · Fecha: ${hoy}</p>
  <p class="nota">Ficha generada desde la app Flota y Equipos. Los requisitos, riesgos y plan de mantención son de referencia general del tipo de equipo: el manual del fabricante prevalece.</p>
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
  try { await fichaInsertarPortada(file.id, (typeof fichaImagenDe === 'function') ? fichaImagenDe(item) : ''); }
  catch (e) { console.warn('[FICHA INV] portada:', e.message); }
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
