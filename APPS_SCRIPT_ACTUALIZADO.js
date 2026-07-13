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
    sh.appendRow(['Fecha', 'Fila', 'Tipo', 'Cantidad anterior', 'Cantidad nueva', 'Diferencia', 'Usuario']);
  }
  return sh;
}

// Registra un cambio de cantidad en AND-HISTORIAL (una fila por cambio).
// No registra nada si la cantidad no cambió realmente (ej: se guardó el
// mismo valor). Si falla el registro del historial, NO debe hacer fallar
// el guardado de la cantidad en sí — solo queda un warning en el log.
function _registrarHistorialAnd(row, tipo, anterior, nueva, email) {
  if (anterior === nueva) return;
  try {
    const sh = _hojaHistorialAnd();
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const fecha = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'dd/MM/yyyy HH:mm');
    const diff = nueva - anterior;
    sh.appendRow([fecha, row, tipo || '', anterior, nueva, (diff > 0 ? '+' : '') + diff, email]);
  } catch (err) {
    console.log('No se pudo registrar historial de Andamios:', err);
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

      // Cambiar solo la cantidad (botones +/- y tap-to-edit)
      case 'and_set_cantidad': {
        const row = parseInt(p.row, 10);
        if (!row || row < 2) return _jsonOut({ success: false, error: 'Fila inválida' });
        const anterior = parseInt(sh.getRange(row, 3).getValue(), 10) || 0;
        const nueva = parseInt(p.cantidad, 10) || 0;
        const tipo = sh.getRange(row, 1).getValue();
        sh.getRange(row, 3).setValue(nueva); // C = cantidad
        _registrarHistorialAnd(row, tipo, anterior, nueva, email);
        return _jsonOut({ success: true });
      }

      // Agregar un tipo de pieza nuevo (sin foto todavía; la foto se agrega después con and_set_foto)
      case 'and_nuevo': {
        sh.appendRow([
          p.tipo || '',
          '', // foto se completa después si corresponde
          parseInt(p.cantidad, 10) || 0,
          p.obs || '',
          p.sistema || 'Europeo',
        ]);
        return _jsonOut({ success: true, row: sh.getLastRow() });
      }

      // Completar el nombre del archivo de foto en una fila ya creada
      case 'and_set_foto': {
        const row = parseInt(p.row, 10);
        if (!row || row < 2) return _jsonOut({ success: false, error: 'Fila inválida' });
        sh.getRange(row, 2).setValue(p.foto || ''); // B = foto
        return _jsonOut({ success: true });
      }

      // Editar un tipo existente (nombre, cantidad, obs, sistema)
      case 'and_editar': {
        const row = parseInt(p.row, 10);
        if (!row || row < 2) return _jsonOut({ success: false, error: 'Fila inválida' });
        const anterior = parseInt(sh.getRange(row, 3).getValue(), 10) || 0;
        const nueva = parseInt(p.cantidad, 10) || 0;
        sh.getRange(row, 1).setValue(p.tipo || '');
        sh.getRange(row, 3).setValue(nueva);
        sh.getRange(row, 4).setValue(p.obs || '');
        sh.getRange(row, 5).setValue(p.sistema || 'Europeo');
        if (p.foto) sh.getRange(row, 2).setValue(p.foto);
        _registrarHistorialAnd(row, p.tipo || '', anterior, nueva, email);
        return _jsonOut({ success: true });
      }

      // Eliminar un tipo (vaciar la fila completa)
      case 'and_eliminar': {
        const row = parseInt(p.row, 10);
        if (!row || row < 2) return _jsonOut({ success: false, error: 'Fila inválida' });
        sh.getRange(row, 1, 1, 5).setValues([['', '', '', '', '']]);
        return _jsonOut({ success: true });
      }

      // Vaciar TODO el catálogo (botón "Vaciar catálogo completo")
      case 'and_vaciar': {
        const last = sh.getLastRow();
        if (last >= 2) sh.getRange(2, 1, last - 1, 5).clearContent();
        return _jsonOut({ success: true });
      }

      default:
        return _jsonOut({ success: false, error: 'Acción desconocida: ' + p.accion });
    }
  } catch (err) {
    return _jsonOut({ success: false, error: String(err) });
  }
}
