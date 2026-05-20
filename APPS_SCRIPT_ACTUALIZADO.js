// ============================================================
// APPS SCRIPT — LST Flota (versión diagnóstico + robusta)
// INSTRUCCIONES:
// 1. Extensiones → Apps Script → borrar todo → pegar esto
// 2. 💾 Guardar
// 3. Implementar → Administrar implementaciones → ✏️ → Nueva versión → Implementar
// ============================================================

function doPost(e) {
  try {
    // LOG para diagnóstico — ver en Apps Script → Ejecuciones
    console.log('doPost llamado');
    console.log('postData type:', e.postData ? e.postData.type : 'null');
    console.log('postData length:', e.postData ? e.postData.contents.length : 0);

    // Parsear el body — funciona con text/plain y application/json
    let data;
    try {
      data = JSON.parse(e.postData.contents);
    } catch(parseErr) {
      // Intento alternativo: parámetros de formulario
      data = {
        folderId: e.parameter.folderId,
        fileName: e.parameter.fileName,
        fileData: e.parameter.fileData,
        mimeType: e.parameter.mimeType
      };
    }

    if (!data.fileName || !data.fileData) {
      throw new Error('Faltan datos: fileName=' + data.fileName + ' fileData length=' + (data.fileData ? data.fileData.length : 0));
    }

    console.log('fileName:', data.fileName);
    console.log('folderId:', data.folderId);
    console.log('mimeType:', data.mimeType);
    console.log('fileData length:', data.fileData.length);

    const folderId = data.folderId;
    const fileName = data.fileName;
    const mimeType = data.mimeType || 'application/octet-stream';

    // Decodificar base64
    const fileBytes = Utilities.base64Decode(data.fileData);
    
    // Obtener carpeta
    let folder;
    try {
      folder = DriveApp.getFolderById(folderId);
      console.log('Carpeta encontrada:', folder.getName());
    } catch(folderErr) {
      console.log('Carpeta no encontrada, usando raíz');
      folder = DriveApp.getRootFolder();
    }

    // Eliminar versión anterior si existe
    const existing = folder.getFilesByName(fileName);
    while (existing.hasNext()) {
      existing.next().setTrashed(true);
    }

    // Crear archivo
    const blob = Utilities.newBlob(fileBytes, mimeType, fileName);
    const file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    console.log('Archivo creado:', file.getId());

    return ContentService
      .createTextOutput(JSON.stringify({
        success: true,
        id: file.getId(),
        name: file.getName(),
        link: file.getUrl()
      }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch(err) {
    console.log('ERROR:', err.toString());
    return ContentService
      .createTextOutput(JSON.stringify({
        success: false,
        error: err.toString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok', msg: 'LST Flota Apps Script activo' }))
    .setMimeType(ContentService.MimeType.JSON);
}

// Función de prueba — ejecutar manualmente desde el editor para verificar permisos
function testSubida() {
  const testData = {
    folderId: '1l9YwEquhfKlP-DA86h3wPzF72vVXt0_l',
    fileName: 'TEST_conexion.txt',
    fileData: Utilities.base64Encode('Prueba LST Flota ' + new Date()),
    mimeType: 'text/plain'
  };
  
  const fakeEvent = {
    postData: {
      contents: JSON.stringify(testData),
      type: 'text/plain'
    },
    parameter: {}
  };
  
  const result = doPost(fakeEvent);
  Logger.log('Resultado:', result.getContent());
}
