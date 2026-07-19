// ============================================================
// APPS SCRIPT — LST Flota (versión GET — sin CORS)
// INSTRUCCIONES:
// 1. Extensiones → Apps Script → borrar todo → pegar esto
// 2. 💾 Guardar
// 3. Implementar → Administrar implementaciones → ✏️ → Nueva versión → Implementar
//    (Ejecutar como: "Yo" / Quién tiene acceso: "Cualquier usuario")
// ============================================================

// ID de la planilla — el mismo que SHEET_ID en config.js del lado del cliente.
const SHEET_ID = '1H95qzHeDfnJ0AWc5SK0jU_QkLGolg9_NzNbu4eTRIaw';
const SHEET_ANDAMIOS = 'ANDAMIOS';
const SHEET_USUARIOS = 'USUARIOS';
const SHEET_AND_HIST = 'AND-HISTORIAL'; // historial de cambios de cantidad de Andamios
const SHEET_AND_UBIC = 'AND-UBICACIONES'; // cantidad por pieza + ubicación (obra/bodega)

function doGet(e) {
  if (e.parameter && e.parameter.accion) {
    return manejarAccionAndamios(e.parameter);
  }

  // Ping simple
  if (!e.parameter || !e.parameter.fileName) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'ok' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // Subida de archivo via GET params
  try {
    const fileName = e.parameter.fileName;
    const folderId = e.parameter.folderId;
    const mimeType = e.parameter.mimeType || 'application/octet-stream';
    const fileData = e.parameter.fileData;

    console.log('doGet subida:', fileName, folderId, mimeType, 'bytes base64:', fileData ? fileData.length : 0);

    const fileBytes = Utilities.base64Decode(fileData);

    let folder;
    try {
      folder = DriveApp.getFolderById(folderId);
    } catch(err) {
      folder = DriveApp.getRootFolder();
    }

    // Eliminar versión anterior
    const existing = folder.getFilesByName(fileName);
    while (existing.hasNext()) existing.next().setTrashed(true);

    const blob = Utilities.newBlob(fileBytes, mimeType, fileName);
    const file  = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    console.log('Archivo creado:', file.getId());

    return ContentService
      .createTextOutput(JSON.stringify({
        success: true,
        id:   file.getId(),
        name: file.getName(),
        link: file.getUrl()
      }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch(err) {
    console.log('ERROR:', err.toString());
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  // Mantener POST también por compatibilidad
  try {
    const data = JSON.parse(e.postData.contents);
    const fakeGet = { parameter: data };
    return doGet(fakeGet);
  } catch(err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ============================================================
// ESCRITURA SERVER-SIDE PARA ANDAMIOS
// ------------------------------------------------------------
// Permite que alguien con rol 'admin' o 'andamios' en la hoja USUARIOS
// pueda contar/agregar/editar/eliminar piezas SIN necesitar permiso de
// Editor directo sobre la planilla — el script se ejecuta con los
// permisos del dueño (quien lo implementó), y valida el rol de quien
// llama antes de escribir nada.
//
// Verificación de identidad: el cliente manda su access_token de Google
// (el mismo que ya usa para leer datos). Este script le pregunta a Google
// mismo a quién pertenece ese token (UrlFetchApp a userinfo) — así el
// email no se puede falsificar desde el navegador, viene verificado por
// Google. Con ese email confirmado, se busca el rol en la hoja USUARIOS.
// ============================================================

function _jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// Le pregunta a Google a qué cuenta pertenece este access_token.
// Devuelve el email en minúsculas, o null si el token no es válido/expiró.
//
// Usa 'tokeninfo' primero (NO requiere que el token tenga scope de
// email/profile — funciona siempre con cualquier token válido, es el mismo
// método que ya usa el cliente para esto). 'userinfo' queda solo de
// respaldo, porque ese sí necesita scope adicional y puede fallar con
// "insufficient scope" aunque el token sea válido.
function _emailVerificadoDesdeToken(accessToken) {
  if (!accessToken) return null;
  try {
    const res = UrlFetchApp.fetch(
      'https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=' + encodeURIComponent(accessToken),
      { muteHttpExceptions: true }
    );
    if (res.getResponseCode() === 200) {
      const data = JSON.parse(res.getContentText());
      const email = (data.email || '').toLowerCase().trim();
      if (email) return email;
    }
  } catch (err) { /* sigue al respaldo */ }

  try {
    const res2 = UrlFetchApp.fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: 'Bearer ' + accessToken },
      muteHttpExceptions: true,
    });
    if (res2.getResponseCode() === 200) {
      const data2 = JSON.parse(res2.getContentText());
      return (data2.email || '').toLowerCase().trim() || null;
    }
  } catch (err) { /* nada más que intentar */ }

  return null;
}

// Busca el rol de un email en la hoja USUARIOS (col A=email, col B=rol).
function _rolDe(email) {
  const sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_USUARIOS);
  if (!sh || sh.getLastRow() < 2) return 'viewer';
  const filas = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues();
  const fila = filas.find(r => (r[0] || '').toString().toLowerCase().trim() === email);
  const rol = fila ? (fila[1] || '').toString().toLowerCase().trim() : '';
  return rol || 'viewer';
}

// Devuelve la hoja AND-HISTORIAL, creándola (con encabezados) la primera vez
// que se necesita — así no hay que crearla a mano en la planilla.
function _hojaHistorialAnd() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sh = ss.getSheetByName(SHEET_AND_HIST);
  if (!sh) {
    sh = ss.insertSheet(SHEET_AND_HIST);
    sh.appendRow(['Fecha', 'Fila', 'Tipo', 'Cantidad anterior', 'Cantidad nueva', 'Diferencia', 'Usuario', 'Campo']);
  } else if (!sh.getRange(1, 8).getValue()) {
    // Hojas creadas antes de agregar "Bajas": completa el encabezado que falta.
    sh.getRange(1, 8).setValue('Campo');
  }
  return sh;
}

// Registra un cambio en AND-HISTORIAL (una fila por cambio). "campo" indica
// si el cambio fue en la columna Cantidad (piezas buenas) o Bajas (piezas
// dadas de baja) — así ambos tipos de cambio quedan en la misma hoja pero
// se pueden distinguir. No registra nada si el valor no cambió realmente.
// Si falla el registro del historial, NO debe hacer fallar el guardado en
// sí — solo queda un warning en el log.
function _registrarHistorialAnd(row, tipo, anterior, nueva, email, campo) {
  if (anterior === nueva) return;
  try {
    const sh = _hojaHistorialAnd();
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const fecha = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'dd/MM/yyyy HH:mm');
    const diff = nueva - anterior;
    sh.appendRow([fecha, row, tipo || '', anterior, nueva, (diff > 0 ? '+' : '') + diff, email, campo || 'Cantidad']);
  } catch (err) {
    console.log('No se pudo registrar historial de Andamios:', err);
  }
}

// Devuelve la hoja AND-UBICACIONES, creándola (con encabezados) la primera
// vez que se necesita. Una fila por cada combinación pieza+ubicación.
function _hojaUbicacionesAnd() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sh = ss.getSheetByName(SHEET_AND_UBIC);
  if (!sh) {
    sh = ss.insertSheet(SHEET_AND_UBIC);
    sh.appendRow(['Fila', 'Tipo', 'Ubicación', 'Cantidad']);
  }
  return sh;
}

// Recalcula el total de una pieza (suma de todas sus ubicaciones) y lo
// deja escrito en la columna C de ANDAMIOS — así el resto de la app puede
// seguir leyendo un solo número sin tener que sumar nada del lado del
// cliente. Devuelve el total nuevo.
function _recalcularTotalAnd(shAndamios, row) {
  const shUbic = _hojaUbicacionesAnd();
  const datos = shUbic.getDataRange().getValues();
  let total = 0;
  for (let i = 1; i < datos.length; i++) {
    if (parseInt(datos[i][0], 10) === row) total += parseInt(datos[i][3], 10) || 0;
  }
  shAndamios.getRange(row, 3).setValue(total); // C = cantidad (total)
  return total;
}

// Fija la cantidad ABSOLUTA de una pieza en una ubicación puntual (crea la
// fila en AND-UBICACIONES si no existía) y recalcula el total. Es la base
// tanto de "and_set_cantidad" (ubicación fija "Bodega", para no romper el
// botón +/- que ya existía) como de la edición manual por ubicación.
function _fijarCantidadUbicacionAnd(shAndamios, row, ubicacion, nueva, tipoNombre, email) {
  const shUbic = _hojaUbicacionesAnd();
  const datos = shUbic.getDataRange().getValues();
  let filaSheet = -1;
  let anterior = 0;
  for (let i = 1; i < datos.length; i++) {
    if (parseInt(datos[i][0], 10) === row && (datos[i][2] || '').toString().trim().toLowerCase() === ubicacion.trim().toLowerCase()) {
      filaSheet = i + 1; // +1 porque getDataRange es 0-index y las filas de Sheets son 1-index
      anterior = parseInt(datos[i][3], 10) || 0;
      break;
    }
  }
  if (filaSheet === -1) {
    shUbic.appendRow([row, tipoNombre || '', ubicacion, nueva]);
  } else {
    shUbic.getRange(filaSheet, 4).setValue(nueva);
  }
  const total = _recalcularTotalAnd(shAndamios, row);
  if (anterior !== nueva) {
    _registrarHistorialAnd(row, tipoNombre, anterior, nueva, email, `Cantidad (${ubicacion})`);
  }
  return total;
}

// Traslada una cantidad de una ubicación a otra para una pieza — resta del
// origen y suma en el destino de forma atómica (las dos cosas se hacen o
// ninguna). Valida que el origen tenga stock suficiente antes de tocar nada.
function _trasladarUbicacionAnd(shAndamios, row, origen, destino, cantidad, tipoNombre, email) {
  const shUbic = _hojaUbicacionesAnd();
  const datos = shUbic.getDataRange().getValues();
  let filaOrigen = -1, cantidadOrigen = 0;
  let filaDestino = -1, cantidadDestino = 0;
  for (let i = 1; i < datos.length; i++) {
    if (parseInt(datos[i][0], 10) !== row) continue;
    const ubic = (datos[i][2] || '').toString().trim().toLowerCase();
    if (ubic === origen.trim().toLowerCase()) { filaOrigen = i + 1; cantidadOrigen = parseInt(datos[i][3], 10) || 0; }
    if (ubic === destino.trim().toLowerCase()) { filaDestino = i + 1; cantidadDestino = parseInt(datos[i][3], 10) || 0; }
  }
  if (cantidadOrigen < cantidad) {
    throw new Error(`No hay suficiente stock en "${origen}" (hay ${cantidadOrigen}, se pidió mover ${cantidad}).`);
  }

  if (filaOrigen !== -1) shUbic.getRange(filaOrigen, 4).setValue(cantidadOrigen - cantidad);
  if (filaDestino !== -1) {
    shUbic.getRange(filaDestino, 4).setValue(cantidadDestino + cantidad);
  } else {
    shUbic.appendRow([row, tipoNombre || '', destino, cantidad]);
  }

  _recalcularTotalAnd(shAndamios, row); // el total no cambia, pero se recalcula por las dudas
  _registrarHistorialAnd(row, tipoNombre, cantidadOrigen, cantidadOrigen - cantidad, email, `Traslado (${origen} → ${destino})`);
}

function manejarAccionAndamios(p) {
  try {
    const email = _emailVerificadoDesdeToken(p.accessToken);
    if (!email) {
      return _jsonOut({ success: false, error: 'Sesión de Google inválida o expirada. Vuelve a intentar.' });
    }

    const rol = _rolDe(email);
    if (rol !== 'admin' && rol !== 'andamios') {
      return _jsonOut({ success: false, error: 'Tu cuenta (' + email + ') no tiene permiso para modificar Andamios.' });
    }

    const sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_ANDAMIOS);
    if (!sh) return _jsonOut({ success: false, error: 'No se encontró la hoja ANDAMIOS.' });

    switch (p.accion) {

      // Cambiar solo la cantidad (botones +/- y tap-to-edit) — a partir de
      // ahora esto ajusta específicamente lo que hay en "Bodega" (el resto
      // de las ubicaciones se manejan con and_set_ubicacion/and_mover_ubicacion).
      // El total (columna C) queda siempre como la suma de todas las
      // ubicaciones, recalculado automáticamente.
      case 'and_set_cantidad': {
        const row = parseInt(p.row, 10);
        if (!row || row < 2) return _jsonOut({ success: false, error: 'Fila inválida' });
        const tipo = sh.getRange(row, 1).getValue();
        const nueva = parseInt(p.cantidad, 10) || 0;
        const total = _fijarCantidadUbicacionAnd(sh, row, 'COLIMA', nueva, tipo, email);
        return _jsonOut({ success: true, total });
      }

      // Fijar la cantidad absoluta de una pieza en una ubicación puntual
      // (para corregir un conteo, o cargar el stock inicial de una obra)
      case 'and_set_ubicacion': {
        const row = parseInt(p.row, 10);
        if (!row || row < 2) return _jsonOut({ success: false, error: 'Fila inválida' });
        const ubicacion = (p.ubicacion || '').trim();
        if (!ubicacion) return _jsonOut({ success: false, error: 'Falta la ubicación' });
        const tipo = sh.getRange(row, 1).getValue();
        const nueva = parseInt(p.cantidad, 10) || 0;
        const total = _fijarCantidadUbicacionAnd(sh, row, ubicacion, nueva, tipo, email);
        return _jsonOut({ success: true, total });
      }

      // Trasladar cantidad de una ubicación a otra (resta del origen, suma
      // en el destino) — usado desde Movimientos.
      case 'and_mover_ubicacion': {
        const row = parseInt(p.row, 10);
        if (!row || row < 2) return _jsonOut({ success: false, error: 'Fila inválida' });
        const origen = (p.origen || '').trim();
        const destino = (p.destino || '').trim();
        const cantidad = parseInt(p.cantidad, 10) || 0;
        if (!origen || !destino) return _jsonOut({ success: false, error: 'Falta origen o destino' });
        if (cantidad <= 0) return _jsonOut({ success: false, error: 'La cantidad a mover debe ser mayor a 0' });
        const tipo = sh.getRange(row, 1).getValue();
        try {
          _trasladarUbicacionAnd(sh, row, origen, destino, cantidad, tipo, email);
          return _jsonOut({ success: true });
        } catch (errMov) {
          return _jsonOut({ success: false, error: errMov.message });
        }
      }

      // Agregar un tipo de pieza nuevo (sin foto todavía; la foto se agrega después con and_set_foto)
      case 'and_nuevo': {
        const cantidadInicial = parseInt(p.cantidad, 10) || 0;
        sh.appendRow([
          p.tipo || '',
          '', // foto se completa después si corresponde
          cantidadInicial,
          p.obs || '',
          p.sistema || 'Europeo',
          0, // F = bajas, siempre arranca en 0 para una pieza nueva
        ]);
        const filaNueva = sh.getLastRow();
        // Toda la cantidad inicial arranca en Bodega — de ahí se traslada
        // como cualquier otro movimiento. Si no se registra acá, el total
        // se recalcularía a 0 la primera vez que se toque alguna ubicación.
        if (cantidadInicial > 0) {
          _hojaUbicacionesAnd().appendRow([filaNueva, p.tipo || '', 'COLIMA', cantidadInicial]);
        }
        return _jsonOut({ success: true, row: filaNueva });
      }

      // Completar el nombre del archivo de foto en una fila ya creada
      case 'and_set_foto': {
        const row = parseInt(p.row, 10);
        if (!row || row < 2) return _jsonOut({ success: false, error: 'Fila inválida' });
        sh.getRange(row, 2).setValue(p.foto || ''); // B = foto
        return _jsonOut({ success: true });
      }

      // Cambiar solo las bajas (botones +/- y tap-to-edit, en la vista "Dados de baja")
      case 'and_set_baja': {
        const row = parseInt(p.row, 10);
        if (!row || row < 2) return _jsonOut({ success: false, error: 'Fila inválida' });
        const anterior = parseInt(sh.getRange(row, 6).getValue(), 10) || 0;
        const nueva = parseInt(p.bajas, 10) || 0;
        const tipo = sh.getRange(row, 1).getValue();
        sh.getRange(row, 6).setValue(nueva); // F = bajas
        _registrarHistorialAnd(row, tipo, anterior, nueva, email, 'Baja');
        return _jsonOut({ success: true });
      }

      // Editar un tipo existente (nombre, cantidad, obs, sistema)
      case 'and_editar': {
        const row = parseInt(p.row, 10);
        if (!row || row < 2) return _jsonOut({ success: false, error: 'Fila inválida' });
        sh.getRange(row, 1).setValue(p.tipo || '');
        sh.getRange(row, 4).setValue(p.obs || '');
        sh.getRange(row, 5).setValue(p.sistema || 'Europeo');
        if (p.foto) sh.getRange(row, 2).setValue(p.foto);
        // La "cantidad" del panel de editar ajusta específicamente Bodega,
        // igual que el botón +/- — el total (col C) se recalcula solo.
        const nueva = parseInt(p.cantidad, 10) || 0;
        const total = _fijarCantidadUbicacionAnd(sh, row, 'COLIMA', nueva, p.tipo || '', email);
        return _jsonOut({ success: true, total });
      }

      // Migración de una sola vez: para cada pieza que todavía no tenga
      // ninguna fila en AND-UBICACIONES, carga su cantidad actual (columna
      // C) como stock inicial en "Bodega". Es seguro correrla más de una
      // vez — se saltea las piezas que ya tengan alguna ubicación cargada.
      case 'and_migrar_ubicaciones': {
        const shUbic = _hojaUbicacionesAnd();
        const datosAnd = sh.getDataRange().getValues();
        const datosUbic = shUbic.getDataRange().getValues();
        const filasConUbicacion = new Set();
        for (let i = 1; i < datosUbic.length; i++) {
          filasConUbicacion.add(parseInt(datosUbic[i][0], 10));
        }
        let migradas = 0;
        for (let i = 1; i < datosAnd.length; i++) {
          const row = i + 1;
          const tipo = datosAnd[i][0];
          const cantidad = parseInt(datosAnd[i][2], 10) || 0;
          if (!tipo || filasConUbicacion.has(row)) continue;
          if (cantidad > 0) {
            shUbic.appendRow([row, tipo, 'COLIMA', cantidad]);
            migradas++;
          }
        }
        return _jsonOut({ success: true, migradas });
      }

      // Renombra una ubicación a otro nombre en TODAS las piezas (ej: la
      // migración anterior cargó todo como "Bodega" y hay que pasarlo a
      // "COLIMA") — si la pieza ya tenía algo cargado con el nombre nuevo,
      // suma las cantidades en vez de duplicar la fila.
      case 'and_renombrar_ubicacion': {
        const desde = (p.desde || '').trim().toLowerCase();
        const hacia = (p.hacia || '').trim();
        if (!desde || !hacia) return _jsonOut({ success: false, error: 'Falta el nombre de origen o destino' });

        const shUbic = _hojaUbicacionesAnd();
        const datos = shUbic.getDataRange().getValues();
        const filasABorrar = [];
        let renombradas = 0;

        for (let i = 1; i < datos.length; i++) {
          const ubic = (datos[i][2] || '').toString().trim().toLowerCase();
          if (ubic !== desde) continue;
          const row = parseInt(datos[i][0], 10);
          const tipo = datos[i][1];
          const cantidad = parseInt(datos[i][3], 10) || 0;

          // ¿Ya existe una fila con el nombre nuevo para esta misma pieza?
          let filaDestino = -1, cantidadDestino = 0;
          for (let j = 1; j < datos.length; j++) {
            if (parseInt(datos[j][0], 10) === row && (datos[j][2] || '').toString().trim().toLowerCase() === hacia.toLowerCase()) {
              filaDestino = j + 1;
              cantidadDestino = parseInt(datos[j][3], 10) || 0;
              break;
            }
          }
          if (filaDestino !== -1) {
            shUbic.getRange(filaDestino, 4).setValue(cantidadDestino + cantidad);
            filasABorrar.push(i + 1);
          } else {
            shUbic.getRange(i + 1, 3).setValue(hacia);
          }
          renombradas++;
        }
        // Borrar de abajo hacia arriba para no correr los índices de las que faltan
        filasABorrar.sort((a, b) => b - a).forEach(f => shUbic.deleteRow(f));

        return _jsonOut({ success: true, renombradas });
      }

      default:
        return _jsonOut({ success: false, error: 'Acción desconocida: ' + p.accion });
    }
  } catch (err) {
    return _jsonOut({ success: false, error: String(err) });
  }
}
