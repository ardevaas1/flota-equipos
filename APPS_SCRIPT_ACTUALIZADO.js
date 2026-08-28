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
    if (e.parameter.accion === 'sheet_write' || e.parameter.accion === 'sheet_append') {
      return manejarEscrituraGenerica(e.parameter);
    }
    if (e.parameter.accion.indexOf('drive_') === 0) {
      return manejarDriveGenerico(e.parameter);
    }
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

// ============================================================
// ESCRITURA SERVER-SIDE GENÉRICA — PARA TODA LA APP
// ------------------------------------------------------------
// Lo mismo que ya se hacía solo para Andamios (más abajo), pero
// generalizado: writeSheet()/appendSheet() del cliente (usadas por TODOS
// los módulos: Flota, Inventario, Containers, Movimientos, Bitácora,
// Arriendos) mandan la escritura acá en vez de escribir directo a
// Sheets con el token de quien esté usando la app — así nadie necesita
// que le compartan la planilla como Editor para poder guardar nada,
// solo necesita su rol correspondiente cargado en la hoja USUARIOS.
//
// El cliente sigue armando el mismo "range" de siempre, con la hoja
// entre comillas simples (ej. "'ARRIENDOS'!A5:P5") — acá se separa el
// nombre de hoja de ese range para saber contra qué rol de módulo
// validar. Si el día de mañana se agrega una hoja nueva, agregar su
// nombre a este mapeo (si no está, por seguridad NO se deja escribir).
const ROL_REQUERIDO_POR_HOJA = {
  'MAQUINARIA':            'flota',
  'MANTENCIONES':          'flota',
  'GENERADORES':           'inventario',
  'MAQUINARIA MENOR':      'inventario',
  'HERRAMIENTAS':          'inventario',
  'EQUIPOS TOPOGRAFICOS':  'inventario',
  'MANT-GEN':              'inventario', // eventos de generadores
  'CONTENEDORES':          'containers',
  'MOVIMIENTOS':           'mover',
  'BITACORA':              'chofer',
  'COMBUSTIBLE':           'chofer',
  'ARRIENDOS':             'arriendos',
  'ANDAMIOS':              'andamios',
  'AND-UBICACIONES':       'andamios',
  'AND-HISTORIAL':         'andamios',
};

// Mismo criterio que ya usa el cliente para decidir qué puede hacer cada
// persona (ver checkUserRole en app-v2.js): la celda de rol puede traer
// varios roles separados por coma ("flota,containers"), "admin" pasa
// cualquier chequeo, y cualquier otro rol solo pasa el que sea el suyo.
function _tienePermisoParaHoja(email, sheetName) {
  // DATOS (ajuste de valor real por GPS) es un caso aparte, admin
  // únicamente sin excepción — ya lo era del lado del cliente, esto solo
  // lo respalda del lado del servidor.
  if (sheetName === 'DATOS') return _esAdmin(email);

  const rolNecesario = ROL_REQUERIDO_POR_HOJA[sheetName];
  if (!rolNecesario) return false; // hoja no reconocida: por las dudas, no se deja escribir
  return _tienePermisoParaModulo(email, rolNecesario);
}

// Lee la celda de rol de una persona (col A=email, col B=rol) y la separa
// en tokens — la celda puede traer varios roles separados por coma
// ("flota,containers"). Se usa tanto para hojas (_tienePermisoParaHoja)
// como para Drive (_tienePermisoParaModulo) — una sola fuente de verdad.
function _tokensDeRol(email) {
  const sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_USUARIOS);
  if (!sh || sh.getLastRow() < 2) return [];
  const filas = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues();
  const fila = filas.find(r => (r[0] || '').toString().toLowerCase().trim() === email);
  const celda = fila ? (fila[1] || '').toString().toLowerCase().trim() : '';
  return celda.split(',').map(t => t.trim()).filter(Boolean);
}
function _esAdmin(email) { return _tokensDeRol(email).includes('admin'); }

// Mismo criterio que ya usa el cliente para decidir qué puede hacer cada
// persona (ver checkUserRole en app-v2.js): "admin" pasa cualquier
// chequeo, cualquier otro rol solo pasa el que sea el suyo. Se usa para
// Drive (subir/buscar/mover fotos) — para hojas de cálculo ver
// _tienePermisoParaHoja, que además sabe traducir nombre de hoja -> rol.
function _tienePermisoParaModulo(email, modulo) {
  const tokens = _tokensDeRol(email);
  if (tokens.includes('admin')) return true;
  if (!modulo) return false;
  return tokens.includes(modulo.toLowerCase());
}

// Handler genérico de "sheet_write" / "sheet_append" — reemplaza escribir
// directo a la API de Sheets con el token del usuario.
function manejarEscrituraGenerica(p) {
  try {
    const email = _emailVerificadoDesdeToken(p.accessToken);
    if (!email) {
      return _jsonOut({ success: false, error: 'Sesión de Google inválida o expirada. Vuelve a intentar.' });
    }

    const m = (p.range || '').match(/^'([^']+)'!(.+)$/);
    if (!m) return _jsonOut({ success: false, error: 'Rango inválido: ' + p.range });
    const sheetName = m[1];
    const celda = m[2];

    if (!_tienePermisoParaHoja(email, sheetName)) {
      return _jsonOut({ success: false, error: 'Tu cuenta (' + email + ') no tiene permiso para modificar "' + sheetName + '".' });
    }

    const sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(sheetName);
    if (!sh) return _jsonOut({ success: false, error: 'No se encontró la hoja "' + sheetName + '".' });

    let values;
    try { values = JSON.parse(p.values); } catch (e) { return _jsonOut({ success: false, error: 'Valores inválidos' }); }
    if (!Array.isArray(values) || !values.length) {
      return _jsonOut({ success: false, error: 'Sin valores para guardar' });
    }

    if (p.accion === 'sheet_write') {
      sh.getRange(celda).setValues(values);
      return _jsonOut({ success: true });
    }

    if (p.accion === 'sheet_append') {
      // Mismo comportamiento que "append" de la API de Sheets: agrega
      // DESPUÉS de la última fila con contenido real — el rango puntual
      // que mandó el cliente (ej. "A:P") solo sirve acá para saber la
      // hoja, no la posición exacta.
      const filaLibre = sh.getLastRow() + 1;
      sh.getRange(filaLibre, 1, values.length, values[0].length).setValues(values);
      // Se devuelve la fila real donde quedó escrito (algún lugar del
      // cliente la necesita para, por ejemplo, subir después una foto al
      // container recién creado sin adivinar en qué fila cayó).
      return _jsonOut({ success: true, row: filaLibre });
    }

    return _jsonOut({ success: false, error: 'Acción de escritura desconocida: ' + p.accion });
  } catch (err) {
    return _jsonOut({ success: false, error: String(err) });
  }
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

// ============================================================
// DRIVE SERVER-SIDE GENÉRICO — PARA TODA LA APP (fotos/carpetas)
// ------------------------------------------------------------
// Mismo problema que las escrituras a Sheets, pero para archivos: antes
// cada módulo subía/buscaba/movía fotos en Drive con el token de Google
// de quien estuviera usando la app, lo que exige que esa persona tenga
// acceso directo a la carpeta de Drive. Ahora pasa por acá — se usa
// DriveApp (el servicio nativo de Apps Script), que actúa con los
// permisos de quien implementó el script, después de validar el rol de
// quien llama contra la hoja USUARIOS (mismo criterio que las hojas).
// ============================================================

// Link de miniatura/vista pública — se arma a mano en vez de depender del
// campo "thumbnailLink" de la API de Drive (que DriveApp no expone
// directo); funciona igual de bien porque el archivo ya queda compartido
// "cualquiera con el link puede ver" al subirlo (ver drive_upload).
function _thumbUrl(fileId) { return 'https://drive.google.com/thumbnail?id=' + fileId + '&sz=w1000'; }
function _viewUrl(fileId)  { return 'https://drive.google.com/uc?export=view&id=' + fileId; }

function _archivoAObjeto(file) {
  return {
    id: file.getId(),
    name: file.getName(),
    thumbnailLink: _thumbUrl(file.getId()),
    webContentLink: _viewUrl(file.getId()),
    webViewLink: file.getUrl(),
    createdTime: file.getDateCreated().toISOString(),
  };
}

function manejarDriveGenerico(p) {
  try {
    const email = _emailVerificadoDesdeToken(p.accessToken);
    if (!email) {
      return _jsonOut({ success: false, error: 'Sesión de Google inválida o expirada. Vuelve a intentar.' });
    }
    if (!_tienePermisoParaModulo(email, p.modulo)) {
      return _jsonOut({ success: false, error: 'Tu cuenta (' + email + ') no tiene permiso para modificar archivos de "' + (p.modulo || '') + '".' });
    }

    switch (p.accion) {

      case 'drive_find_or_create_folder': {
        const parent = DriveApp.getFolderById(p.parentId);
        const existentes = parent.getFoldersByName(p.name);
        if (existentes.hasNext()) return _jsonOut({ success: true, id: existentes.next().getId() });
        const nueva = parent.createFolder(p.name);
        return _jsonOut({ success: true, id: nueva.getId() });
      }

      case 'drive_upload': {
        const folder = DriveApp.getFolderById(p.folderId);
        if (String(p.replaceExisting) === 'true') {
          const existentes = folder.getFilesByName(p.fileName);
          while (existentes.hasNext()) existentes.next().setTrashed(true);
        }
        const bytes = Utilities.base64Decode(p.fileData);
        const blob = Utilities.newBlob(bytes, p.mimeType || 'application/octet-stream', p.fileName);
        const file = folder.createFile(blob);
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        return _jsonOut({ success: true, file: _archivoAObjeto(file) });
      }

      // Acepta la MISMA sintaxis de búsqueda que ya usaba el cliente
      // directo con la API de Drive (el parámetro "q") — DriveApp.searchFiles
      // entiende el mismo lenguaje, así que no hace falta traducir nada de
      // las búsquedas que ya estaban armadas en cada módulo.
      case 'drive_search': {
        const it = DriveApp.searchFiles(p.q);
        const archivos = [];
        while (it.hasNext() && archivos.length < 1000) archivos.push(_archivoAObjeto(it.next()));
        if (p.orderBy === 'createdTime desc') {
          archivos.sort((a, b) => new Date(b.createdTime) - new Date(a.createdTime));
        }
        const pageSize = parseInt(p.pageSize, 10) || archivos.length;
        return _jsonOut({ success: true, files: archivos.slice(0, pageSize) });
      }

      case 'drive_trash': {
        DriveApp.getFileById(p.fileId).setTrashed(true);
        return _jsonOut({ success: true });
      }

      case 'drive_move': {
        const file = DriveApp.getFileById(p.fileId);
        if (p.addParentId)    DriveApp.getFolderById(p.addParentId).addFile(file);
        if (p.removeParentId) DriveApp.getFolderById(p.removeParentId).removeFile(file);
        return _jsonOut({ success: true });
      }

      case 'drive_rename': {
        DriveApp.getFileById(p.fileId).setName(p.newName);
        return _jsonOut({ success: true });
      }

      // Crear un Google Doc NATIVO a partir de HTML (para la Ficha Técnica) —
      // DriveApp no soporta la conversión automática HTML→Doc, así que este
      // caso puntual usa la API REST de Drive directo, pero con el token
      // DEL SCRIPT (ScriptApp.getOAuthToken()), nunca con el de quien llama.
      case 'drive_create_google_doc': {
        const boundary = 'lst_ficha_' + new Date().getTime();
        const metadata = JSON.stringify({
          name: p.name,
          mimeType: 'application/vnd.google-apps.document',
          parents: p.parentId ? [p.parentId] : undefined,
        });
        const body = [
          '--' + boundary, 'Content-Type: application/json; charset=UTF-8', '', metadata,
          '--' + boundary, 'Content-Type: text/html; charset=UTF-8', '', p.html,
          '--' + boundary + '--',
        ].join('\r\n');
        const res = UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
          method: 'post',
          contentType: 'multipart/related; boundary=' + boundary,
          headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
          payload: body,
          muteHttpExceptions: true,
        });
        const status = res.getResponseCode();
        if (status < 200 || status >= 300) {
          return _jsonOut({ success: false, error: 'Drive API error ' + status + ': ' + res.getContentText().slice(0, 300) });
        }
        return _jsonOut({ success: true, file: JSON.parse(res.getContentText()) });
      }

      case 'drive_get_parents': {
        const file = DriveApp.getFileById(p.fileId);
        const parents = [];
        const it = file.getParents();
        while (it.hasNext()) parents.push(it.next().getId());
        return _jsonOut({ success: true, parents });
      }

      default:
        return _jsonOut({ success: false, error: 'Acción de Drive desconocida: ' + p.accion });
    }
  } catch (err) {
    return _jsonOut({ success: false, error: String(err) });
  }
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

      // Editar un tipo existente (nombre, obs, sistema, foto). La cantidad
      // YA NO se toca desde acá — el total es exclusivamente la suma de
      // AND-UBICACIONES (ver _recalcularTotalAnd), y se edita ubicación por
      // ubicación ("Ver ubicaciones") o moviendo stock entre obras. Antes
      // esto llamaba a _forzarTotalPiezaAnd, que ponía en 0 el stock de
      // cualquier ubicación que no fuera "COLIMA" y pisaba el total con lo
      // que hubiera en el campo Cantidad del panel de editar — si ese campo
      // mostraba solo el stock de COLIMA (no el total) y alguien guardaba
      // sin darse cuenta, el stock de las demás obras se borraba y el total
      // quedaba mal. Ese era el origen exacto de que "el total" y "el total
      // en ubicaciones" mostraran números distintos.
      case 'and_editar': {
        const row = parseInt(p.row, 10);
        if (!row || row < 2) return _jsonOut({ success: false, error: 'Fila inválida' });
        sh.getRange(row, 1).setValue(p.tipo || '');
        sh.getRange(row, 4).setValue(p.obs || '');
        sh.getRange(row, 5).setValue(p.sistema || 'Europeo');
        if (p.foto) sh.getRange(row, 2).setValue(p.foto);
        const total = _recalcularTotalAnd(sh, row);
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

      // Limpia filas DUPLICADAS en AND-UBICACIONES (misma pieza + misma
      // ubicación repetida varias veces) — se quedan con el ÚLTIMO valor
      // cargado para cada combinación (el más reciente, más abajo en la
      // hoja) y borran las filas viejas. Con p.dryRun='true' NO escribe
      // nada — solo devuelve el reporte de qué encontraría, para poder
      // revisarlo antes de aplicar el cambio de verdad.
      case 'and_limpiar_duplicados_ubicaciones': {
        const dryRun = String(p.dryRun) === 'true';
        const shUbic = _hojaUbicacionesAnd();
        const datos = shUbic.getDataRange().getValues();

        // Agrupa por "fila|ubicación" (normalizado) manteniendo el orden de aparición
        const grupos = {}; // clave -> [{ fila, tipo, ubicacion, cantidad, filaSheet }]
        for (let i = 1; i < datos.length; i++) {
          const fila = parseInt(datos[i][0], 10);
          if (!fila) continue;
          const tipo = datos[i][1] || '';
          const ubicacion = (datos[i][2] || '').toString().trim();
          const cantidad = parseInt(datos[i][3], 10) || 0;
          const clave = fila + '|' + ubicacion.toLowerCase();
          if (!grupos[clave]) grupos[clave] = [];
          grupos[clave].push({ fila, tipo, ubicacion, cantidad, filaSheet: i + 1 });
        }

        const reporte = [];
        const filasABorrar = [];
        const filasAActualizar = []; // por si el valor a conservar no es el que ya está en esa fila (no debería pasar, pero por las dudas)
        const filasAndamiosARecalcular = new Set();

        Object.values(grupos).forEach(grupo => {
          if (grupo.length < 2) return; // sin duplicados, no hay nada que hacer
          const conservar = grupo[grupo.length - 1]; // el último (más reciente) de la hoja
          const descartar = grupo.slice(0, -1);
          reporte.push({
            fila: conservar.fila,
            tipo: conservar.tipo,
            ubicacion: conservar.ubicacion,
            valores_encontrados: grupo.map(g => g.cantidad),
            valor_que_queda: conservar.cantidad,
          });
          descartar.forEach(d => filasABorrar.push(d.filaSheet));
          filasAndamiosARecalcular.add(conservar.fila);
        });

        if (!dryRun && filasABorrar.length) {
          // Borrar de abajo hacia arriba para no correr los índices de las que faltan
          filasABorrar.sort((a, b) => b - a).forEach(f => shUbic.deleteRow(f));
          const shAndamios = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_ANDAMIOS);
          filasAndamiosARecalcular.forEach(fila => _recalcularTotalAnd(shAndamios, fila));
        }

        return _jsonOut({
          success: true,
          dryRun,
          piezas_con_duplicados: reporte.length,
          filas_borradas: filasABorrar.length,
          reporte,
        });
      }

      default:
        return _jsonOut({ success: false, error: 'Acción desconocida: ' + p.accion });
    }
  } catch (err) {
    return _jsonOut({ success: false, error: String(err) });
  }
}
