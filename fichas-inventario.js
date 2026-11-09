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
const FICHA_INV_PREFIJO = 'Ficha técnica v2';       // formato nuevo
const FICHA_INV_PREFIJO_VIEJO = 'Ficha técnica';    // formato anterior (se manda a la papelera al crear la nueva)

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


// Arma el .docx de la ficha de un equipo de inventario (formato igual al modelo)
function _fiDocx(modId, modLabel, item, linkCarpeta) {
  const nombre = [item.equipo, item.marca, item.modelo].filter(Boolean).join(' ');
  const hoy = new Date().toLocaleDateString('es-CL');
  const ok = (v) => v !== undefined && v !== null && String(v).trim() !== '' && !/^[\s¿?\-]*$/.test(String(v));
  const fab = (typeof fichaFabricanteDe === 'function') ? fichaFabricanteDe(item) : null;
  const tipo = fichaTipoDe(item.equipo);
  const extra = fichaExtraDe(item.equipo);
  const links = [];
  const marcaOk = ok(item.marca), modeloOk = ok(item.modelo) && !/^\d+(\.0)?$/.test(item.modelo);
  const busqueda = (marcaOk && modeloOk)
    ? 'https://www.google.com/search?q=' + encodeURIComponent(`${item.marca} ${item.modelo} ${item.equipo} manual PDF ficha técnica`) : '';
  const lnkP = (pref, texto, url) => _fdPara(_fdRun(pref, { b: 1, sz: 21 }) + _fdLinkRun(texto, links, url), { after: 60, before: 40, line: 264 });
  const lblP = (pref, txt) => _fdPara(_fdRun(pref, { b: 1, sz: 21 }) + _fdRun(txt, { sz: 21 }), { after: 60, before: 40, line: 264 });
  let n = 0; const H = (t) => _fdH2((++n) + '. ' + t);
  const sub = (t) => _fdPara(_fdRun(t, { b: 1, sz: 21 }), { keepNext: true, after: 40, before: 100 });
  const B = (arr) => arr.map(_fdBullet).join('');
  let b = '';
  b += _fdPortada('FICHA TÉCNICA DEL EQUIPO', nombre);

  // Identificación (4 columnas)
  const ident = _fiFilas(modId, item).map(([l, v]) => [l.charAt(0) + l.slice(1).toLowerCase(), v]);
  ident.push(['Módulo', modLabel]);
  b += H('Identificación') + _fdTabla4(ident);

  // Descripción y aplicación
  b += H('Descripción y aplicación') + _fdTexto(extra.desc);

  // Datos técnicos
  let filasTec = [];
  if (fab && fab.specs && fab.specs.length) filasTec = fab.specs.map(([l, v]) => [l, v, 'Fabricante']);
  const reg = (l, v) => { if (ok(v)) filasTec.push([l, v, 'Registro en la app']); };
  if (!filasTec.length) {
    if (modId === 'generadores') { reg('Potencia', item.potencia); reg('Año', item.anio); reg('Horómetro actual', item.horometro); }
    else if (modId === 'topografico') { reg('N° de serie', item.motor); reg('Última calibración', item.ultCal); reg('Próxima calibración', item.proxCal); }
    else reg('Motor / potencia', item.motor);
    reg('Color', item.color);
  }
  b += H('Datos técnicos');
  b += filasTec.length ? _fdTabla([3300, 4372, 2300], ['Característica', 'Valor', 'Fuente'], filasTec) : _fdTexto('Este equipo no tiene características técnicas registradas.');
  if (fab && fab.nota) b += _fdNota('⚠ ' + fab.nota);
  b += _fdNota(fab && fab.specs && fab.specs.length ? 'Datos de referencia del modelo' + (fab.fuente ? ' (fuente: ' + fab.fuente[0] + ')' : '') + ': confirmar con la placa del equipo.'
    : 'No se encontraron especificaciones publicadas por el fabricante; se muestra lo registrado en la app.');

  // Requisitos
  b += H('Requisitos de instalación y uso') + B([...(fab && fab.recs ? fab.recs : []), ...tipo.uso]);

  // Accesorios y consumibles
  b += H('Accesorios y consumibles recomendados') + B(extra.consumibles);

  // Inspección previa
  b += H('Inspección previa al uso (checklist)')
    + _fdTabla([3300, 4372, 1000, 1300], ['Punto a revisar', 'Criterio', 'Cumple', 'Obs.'], extra.insp.map(r => [r[0], r[1], '☐ Sí  ☐ No', '']))
    + _fdNota('Si algún punto no cumple, no usar el equipo y avisar al supervisor.');

  // Procedimiento seguro
  b += H('Procedimiento de operación segura')
    + sub('Antes de usar') + B(extra.antes) + sub('Durante el uso') + B(extra.durante) + sub('Después del uso') + B(extra.despues);

  // Riesgos y EPP
  b += H('Riesgos principales y EPP') + _fdTabla([3300, 6672], ['Riesgo', 'Control principal'], tipo.riesgos)
    + lblP('EPP obligatorio: ', tipo.epp);

  // Plan de mantención
  b += H('Plan de mantención') + _fdTabla([2300, 5372, 2300], ['Frecuencia', 'Actividad', 'Responsable'], tipo.mant);

  // Registro de mantenciones (hoja de vida en blanco) o eventos de generadores
  b += H('Registro de mantenciones y reparaciones');
  const ev = (modId === 'generadores' && typeof allGenEventos !== 'undefined') ? allGenEventos.filter(e => e.codigo && e.codigo === item.codigo) : [];
  if (ev.length) {
    b += _fdTabla([1500, 1500, 1800, 5172], ['Fecha', 'Horómetro', 'Tipo', 'Descripción'], ev.map(e => [e.fechaEvento, e.horometro, e.tipo, e.descripcion]), { primeraNegrita: false });
  } else {
    b += _fdTexto(modId === 'generadores' ? 'Sin eventos registrados en la app todavía. Use la tabla para anotar a mano.' : 'Use la tabla para anotar las mantenciones y reparaciones del equipo.');
  }
  b += _fdTabla([1500, 3000, 2272, 1700, 1500], ['Fecha', 'Trabajo realizado', 'Realizado por', 'Costo', 'Firma'], [['', '', '', '', ''], ['', '', '', '', ''], ['', '', '', '', '']], { primeraNegrita: false });

  // Historial de traslados
  const movs = (typeof allMovimientos !== 'undefined' ? allMovimientos : [])
    .filter(m => m.codigoEquipo === _fiIdent(item) && m.tipoEquipo === ({ generadores: 'Generador', maqmenor: 'Maq. Menor', topografico: 'Equipo Topográfico', herramientas: 'Herramienta' })[modId])
    .sort((a, c) => c.rowIndex - a.rowIndex).slice(0, 12);
  b += H('Historial de traslados');
  b += movs.length
    ? _fdTabla([1500, 2300, 2300, 2000, 1872], ['Fecha', 'Origen', 'Destino', 'Traslada', 'Estado'], movs.map(m => [m.fechaSalida, m.origen, m.destino, m.traslada, m.estado === 'recibido' ? 'Recibido' : 'En tránsito']), { primeraNegrita: false })
    : _fdTexto('Este equipo no ha sido trasladado desde que se usa la app.');
  b += lblP('Ubicación actual: ', ok(item.ubicacion) ? item.ubicacion : 'sin registro');

  // Transporte y almacenamiento
  b += H('Transporte y almacenamiento') + B(extra.almacen);

  // Emergencias
  b += H('Emergencias y primeros auxilios') + B(fichaEmergencias(extra));

  // Manual y observaciones
  b += H('Manual, observaciones y fotos');
  b += (fab && fab.manual) ? lnkP('Manual del fabricante: ', fab.manual[0], fab.manual[1])
    : (busqueda ? lnkP('Manual del fabricante: ', 'buscar el manual en internet', busqueda) : lblP('Manual del fabricante: ', 'sin información de marca/modelo'));
  b += lblP('Observaciones: ', item.obs ? String(item.obs) : 'Sin observaciones');
  b += linkCarpeta ? lnkP('Fotos del equipo: ', 'abrir carpeta de fotos', linkCarpeta) : lblP('Fotos del equipo: ', 'en la carpeta de Inventario en Drive');

  // Control de cambios
  b += H('Control de cambios')
    + _fdTabla([1400, 1500, 4572, 2500], ['Versión', 'Fecha', 'Descripción', 'Elaboró'], [['00', hoy, 'Ficha generada / actualizada desde los datos de la app', 'Flota y Equipos']], { primeraNegrita: false });

  b += _fdFirma('Elaboró: Flota y Equipos – Constructora LST   ·   Aprobó: ______________________   ·   Fecha: ' + hoy);
  b += _fdNota('Los requisitos, riesgos y plan de mantención son de referencia general del tipo de equipo: el manual del fabricante prevalece.');
  const codigo = 'FT-' + _fiIdent(item).replace(/\s+/g, '');
  return { bytes: _fdArmarDocx('FICHA TÉCNICA – ' + nombre.toUpperCase(), codigo, hoy, b, links), nombre: _fiNombreDoc(modLabel, item) };
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

// Crea o ACTUALIZA (regenera en el mismo Doc) la ficha de UN equipo
async function _fiCrearUna(modulo, item, existentes) {
  const carpetaId = await _fiCarpetaModulo(modulo.label);
  const prefijo = _fiPrefijoBusqueda(modulo.label, item);
  const lista = existentes || await _fiListarExistentes(carpetaId);
  const ya = lista.find(f => (f.name || f.title || '').startsWith(prefijo));
  const prefViejo = prefijo.replace(FICHA_INV_PREFIJO, FICHA_INV_PREFIJO_VIEJO);
  const linkCarpeta = `https://drive.google.com/drive/folders/${DRIVE_INV_FOLDER}`;
  const d = _fiDocx(modulo.id, modulo.label, item, linkCarpeta);
  const r = await fichaSubirDocx('inventario', d.nombre, d.bytes, carpetaId, ya ? ya.id : '');
  try { await fichaInsertarPortada(r.id, (typeof fichaImagenDe === 'function') ? fichaImagenDe(item) : ''); }
  catch (e) { console.warn('[FICHA INV] portada:', e.message); }
  // Si el Doc anterior no se pudo reemplazar, el viejo va a la papelera (queda el nuevo)
  if (ya && ya.id !== r.id) { try { await driveTrash('inventario', ya.id); } catch (e) { console.warn(e.message); } }
  for (const v of lista.filter(f => (f.name || f.title || '').startsWith(prefViejo))) {
    try { await driveTrash('inventario', v.id); } catch (e) { console.warn('[FICHA INV] ficha vieja:', e.message); }
  }
  const idx = lista.findIndex(f => ya && f.id === ya.id);
  if (existentes) { if (idx >= 0) existentes.splice(idx, 1); existentes.push({ id: r.id, name: d.nombre }); }
  return { id: r.id, creada: !ya };
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
    toast(r.creada ? '✓ Ficha técnica creada' : '✓ Ficha técnica actualizada');
  } catch (err) {
    if (ventana) ventana.close();
    console.error('[FICHA INV]', err);
    toast('No se pudo preparar la ficha: ' + err.message, 'error');
  }
}

// Genera las fichas de TODOS los equipos (de a una; las que ya existen se
// regeneran en el mismo Doc, sin duplicar).
let _fichasInvCorriendo = false;
async function invGenerarTodasLasFichas() {
  if (_fichasInvCorriendo) return;
  if (userRole !== 'admin') { toast('Solo el administrador puede hacer esto', 'error'); return; }
  if (!allGeneradores.length && !allMaqMenor.length && !allHerramientas.length && !allTopografico.length) {
    toast('Primero espera a que carguen los equipos', 'error'); return;
  }
  const total = FICHA_INV_MODULOS.reduce((n, m) => n + m.lista().length, 0);
  if (!confirm(`Se van a crear las fichas técnicas de ${total} equipos (generadores, maquinaria menor, herramientas y equipos topográficos), cada una como un Google Doc dentro de Inventario › Fichas Técnicas. Las que ya existen se actualizan con los datos actuales; las del formato anterior se mandan a la papelera de Drive (se pueden recuperar). Tarda varios minutos: no cierres la app mientras corre. ¿Seguir?`)) return;

  _fichasInvCorriendo = true;
  const btns = [...document.querySelectorAll('.btn-fichas-inv')];
  const textoOriginal = 'Crear o actualizar fichas técnicas de todos los equipos';
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
