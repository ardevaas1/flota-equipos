// ═══════════════════════════════════════════════════════════════
// Ficha técnica de VEHÍCULOS / MAQUINARIA (Flota) en el formato nuevo (.docx).
// _fvDocx(e, specsRows, costos, linkCarpeta, eventos) → {bytes, nombre}
//   specsRows: [[característica, valor]] (se conservan del Doc anterior)
//   costos:    { 'fecha|descripcion': costo }
//   eventos:   mantenciones de la patente [{fechaEvento, horometro, tipo, descripcion}]
// ═══════════════════════════════════════════════════════════════
function _fvDocx(e, specsRows, costos, linkCarpeta, eventos) {
  const ok = (v) => v !== undefined && v !== null && String(v).trim() !== '' && !/^[\s¿?\-]*$/.test(String(v));
  const hoy = new Date().toLocaleDateString('es-CL');
  const nombre = [e.equipo, e.marca, e.modelo].filter(Boolean).join(' ');
  const links = [];
  const lblP = (p, t) => _fdPara(_fdRun(p, { b: 1, sz: 21 }) + _fdRun(t, { sz: 21 }), { after: 60, before: 40, line: 264 });
  const sub = (t) => _fdPara(_fdRun(t, { b: 1, sz: 21 }), { keepNext: true, after: 40, before: 100 });
  const B = (a) => a.map(_fdBullet).join('');
  let n = 0; const H = (t) => _fdH2((++n) + '. ' + t);
  const tipoTxt = String(e.equipo || '').toUpperCase();
  const pesada = /CAMION(?!ETA)|CAMIÓN|RETRO|EXCAVADORA|MINICARGADOR|BOBCAT|GRUA|GRÚA|CARGADOR|RODILLO|MOTONIVELADORA|TRACTOR/.test(tipoTxt);
  const estado = (f) => { const d = (typeof diasRestantes === 'function') ? diasRestantes(f) : null; return d === null ? 'Sin dato' : (d < 0 ? 'VENCIDO' : 'VIGENTE'); };
  let b = _fdPortada('FICHA TÉCNICA DEL VEHÍCULO', nombre + (ok(e.patente) ? ' · ' + e.patente : ''));

  const id = [['Equipo', e.equipo], ['Patente / código', e.patente], ['Marca', e.marca], ['Modelo', e.modelo], ['Año', e.anio], ['Color', e.color], ['Propietario', e.propietario], ['RUT propietario', e.rut], ['Estado', e.estadoRaw || e.estado], ['Ubicación', e.ubicacion]]
    .filter(([, v]) => ok(v));
  b += H('Identificación') + _fdTabla4(id);

  b += H('Descripción y uso') + _fdTexto(pesada
    ? 'Maquinaria / vehículo pesado de la flota de la empresa. Debe ser operado solo por personal autorizado, con licencia y capacitación vigentes, y dentro de su capacidad nominal.'
    : 'Vehículo de la flota de la empresa para el traslado de personas, materiales y equipos entre obras y bodegas. Debe ser conducido solo por personal autorizado con licencia vigente.');

  b += H('Especificaciones técnicas');
  b += (specsRows && specsRows.length) ? _fdTabla([3300, 6672], ['Característica', 'Valor'], specsRows) : _fdTexto('Sin especificaciones técnicas registradas. Complete con la información de la placa o del manual del fabricante.');

  b += H('Documentación legal');
  b += _fdTabla([3300, 2800, 2000, 1872], ['Documento', 'Vencimiento', 'Estado', 'Obs.'],
    [['Revisión técnica', e.revision || 'Sin dato', estado(e.revision), ''], ['Permiso de circulación', e.permiso || 'Sin dato', estado(e.permiso), ''], ['SOAP', e.soap || 'Sin dato', estado(e.soap), '']]);

  b += H('Mantención programada');
  b += _fdTabla4([['Horómetro / km actual', e.horometro], ['Próxima mantención', e.proxMant], ['Última mantención', e.ultMant], ['Frecuencia', e.mantCada]].map(([a, v]) => [a, ok(v) ? v : 'Sin dato']));

  b += H('Inspección previa al uso (checklist)') + _fdTabla([3300, 4372, 1000, 1300], ['Punto a revisar', 'Criterio', 'Cumple', 'Obs.'],
    [['Luces, bocina y alarma de retroceso', 'Funcionando'], ['Neumáticos', 'Presión y desgaste correctos'], ['Niveles (aceite, refrigerante, frenos, combustible)', 'Entre mínimo y máximo; sin fugas'], ['Frenos y dirección', 'Responden sin juego'], ['Espejos, parabrisas y limpiaparabrisas', 'Limpios y sin daños'], ['Cinturones y asientos', 'Operativos'], ['Extintor, botiquín, triángulos y gata', 'Presentes y vigentes'], ['Documentos a bordo', 'Vigentes']].map(r => [r[0], r[1], '☐ Sí  ☐ No', '']))
    + _fdNota('Si algún punto no cumple, no usar el vehículo y avisar al supervisor.');

  b += H('Requisitos del operador') + B(pesada
    ? ['Licencia de conducir de la clase correspondiente, vigente.', 'Autorización escrita de la empresa para operar este equipo.', 'Capacitación en el equipo y en prevención de riesgos al día.', 'Examen de salud ocupacional vigente.']
    : ['Licencia de conducir de la clase correspondiente, vigente.', 'Autorización de la empresa para conducir vehículos de la flota.', 'No conducir bajo efectos de alcohol, drogas o fatiga.']);

  b += H('Procedimiento de operación segura')
    + sub('Antes de usar') + B(['Realizar la inspección previa y registrar novedades.', 'Ajustar asiento, espejos y cinturón.', 'Verificar la carga y su amarre.'])
    + sub('Durante el uso') + B(['Respetar velocidades, señalética y distancias de seguridad.', 'Usar siempre el cinturón; no usar el celular al conducir.', 'Detenerse ante ruidos, luces de falla o temperatura anormal.'])
    + sub('Después del uso') + B(['Estacionar en lugar seguro, con freno de mano y llave retirada.', 'Informar fallas y registrar horómetro / kilometraje.', 'Dejar el vehículo limpio y con combustible suficiente.']);

  b += H('Riesgos principales y EPP') + _fdTabla([3300, 6672], ['Riesgo', 'Control principal'],
    [['Choque / volcamiento', 'Conducción defensiva; respetar velocidad y capacidad'], ['Atropello', 'Alarma de retroceso, rutas señalizadas y apoyo de señalero'], ['Caída de carga', 'Amarre y distribución correcta de la carga'], ['Incendio', 'Extintor vigente; no cargar combustible con motor en marcha']])
    + lblP('EPP obligatorio: ', 'zapatos de seguridad, chaleco reflectante, casco y guantes según la faena.');

  b += H('Plan de mantención') + _fdTabla([2300, 5372, 2300], ['Frecuencia', 'Actividad', 'Responsable'],
    [['Antes de cada uso', 'Inspección previa: niveles, luces, neumáticos, frenos', 'Conductor / operador'], ['Según pauta del fabricante' + (ok(e.mantCada) ? ' (cada ' + e.mantCada + ')' : ''), 'Cambio de aceite y filtros; revisión de frenos y neumáticos', 'Taller / servicio técnico'], ['Anual', 'Revisión técnica, permiso de circulación y SOAP al día', 'Flota y Equipos']]);

  b += H('Registro de mantenciones y eventos mayores');
  const ev = (eventos || []);
  b += ev.length
    ? _fdTabla([1400, 1500, 1700, 3472, 1900], ['Fecha', 'Horómetro / km', 'Tipo', 'Descripción', 'Costo'],
        ev.map(x => [x.fechaEvento, x.horometro, x.tipo, x.descripcion, (costos && costos[(x.fechaEvento || '') + '|' + (x.descripcion || '')]) || '']), { primeraNegrita: false })
    : _fdTexto('Sin mantenciones registradas en la app todavía.');
  b += _fdEspacio() + _fdTabla([1500, 3000, 2272, 1700, 1500], ['Fecha', 'Trabajo realizado', 'Realizado por', 'Costo', 'Firma'], [['', '', '', '', ''], ['', '', '', '', '']], { primeraNegrita: false });

  b += H('Emergencias y primeros auxilios') + B(['Ante un accidente: detener el vehículo, señalizar, avisar al supervisor y a prevención de riesgos.', 'Lesionados: no moverlos si no es necesario; llamar a emergencias (131 / 133) y a la mutualidad.', 'Incendio: usar extintor ABC; no usar agua sobre combustible; evacuar si no se controla.']);

  b += H('Observaciones y fotos');
  b += lblP('Observaciones: ', ok(e.obs) ? String(e.obs) : 'Sin observaciones');
  b += linkCarpeta ? _fdPara(_fdRun('Registro fotográfico: ', { b: 1, sz: 21 }) + _fdLinkRun('abrir carpeta de fotos', links, linkCarpeta), { after: 60, before: 40 }) : lblP('Registro fotográfico: ', 'carpeta del vehículo en Drive');

  b += H('Control de cambios') + _fdTabla([1400, 1500, 4572, 2500], ['Versión', 'Fecha', 'Descripción', 'Elaboró'], [['00', hoy, 'Ficha generada / actualizada desde los datos de la app', 'Flota y Equipos']], { primeraNegrita: false });
  b += _fdFirma('Elaboró: Flota y Equipos – Constructora LST   ·   Aprobó: ______________________   ·   Fecha: ' + hoy);
  const codigo = 'FT-' + String(e.patente || e.rowIndex || '').replace(/\s+/g, '');
  return { bytes: _fdArmarDocx('FICHA TÉCNICA – ' + nombre.toUpperCase(), codigo, hoy, b, links), nombre: 'Ficha Técnica — ' + (e.patente || nombre) };
}

// Regenera la ficha de UN vehículo con el formato nuevo, a partir de los datos
// de la app + lo que ya había en el Doc anterior (especificaciones y costos).
// Reemplaza el contenido del MISMO Doc (el link no cambia); si Drive no lo
// permite, crea uno nuevo, actualiza el link (col T) y manda el viejo a la papelera.
async function fichaVehiculoRegenerar(e) {
  const oldId = _extraerDocId(e.linkFicha);
  if (!oldId) throw new Error('no se pudo leer el link de la ficha');
  const oldDoc = await docsApiFetch('GET', oldId);

  const specsRows = _extraerFilasTablaSpecs(_docTablaEntre(oldDoc, 'ESPECIFICACIONES TÉCNICAS', 'DOCUMENTACIÓN'))
    .filter(r => !/^(CARACTER[ÍI]STICA|CAMPO)$/i.test(r.label) && !/^(VALOR|DATO)$/i.test(r.value))
    .map(r => [r.label, r.value]);

  // Costos ya anotados en el historial anterior: clave fecha|descripción
  const costos = {};
  const tabla = _docTablaEntre(oldDoc, 'HISTORIAL DE EVENTOS') || _docTablaEntre(oldDoc, 'REGISTRO DE MANTENCIONES');
  if (tabla) tabla.table.tableRows.forEach((row, i) => {
    const c = row.tableCells;
    if (i === 0 || c.length < 5) return;
    const t = (k) => _docCeldaTexto(c[k]).replace(/\n/g, ' ').trim();
    const costo = t(c.length - 1);
    if (costo && !/^sin eventos/i.test(t(0))) costos[t(0) + '|' + t(3)] = costo;
  });

  if (!allEventos.length) await loadEventos();
  const eventos = allEventos.filter(ev => ev.patente === e.patente);

  let linkCarpeta = '';
  try {
    const q = `mimeType='application/vnd.google-apps.folder' and title = '${_qEsc(e.patente)}' and '${CONFIG.DRIVE_ROOT_FOLDER}' in parents and trashed=false`;
    const data = await driveSearch('flota', q, { pageSize: 1 });
    if (data.files && data.files.length) linkCarpeta = `https://drive.google.com/drive/folders/${data.files[0].id}`;
  } catch (err) { console.warn('[FICHA VEH] carpeta de fotos:', err.message); }

  const d = _fvDocx(e, specsRows, costos, linkCarpeta, eventos);
  const parentId = await _obtenerCarpetaPadre(oldId);
  const r = await fichaSubirDocx('flota', d.nombre, d.bytes, parentId, oldId);
  try { await fichaInsertarPortada(r.id, e.fotoRef || ''); }
  catch (err) { console.warn('[FICHA VEH] portada:', err.message); }

  if (r.id !== oldId) {
    const url = `https://docs.google.com/document/d/${r.id}/edit`;
    const rows = await fetchSheet(`'${CONFIG.SHEET_MAQUINARIA}'!E2:E500`);
    const idx = (rows || []).findIndex(x => (x[0] || '').trim().toUpperCase() === String(e.patente).toUpperCase());
    if (idx === -1) throw new Error('ficha nueva creada pero no se encontró la fila para actualizar el link: ' + url);
    await writeSheet(`'${CONFIG.SHEET_MAQUINARIA}'!T${idx + 2}`, [[url]]);
    e.linkFicha = url;
    try { await driveTrash('flota', oldId); } catch (err) { console.warn('[FICHA VEH] no se pudo enviar a papelera la ficha vieja:', err.message); }
  }
  return r;
}
