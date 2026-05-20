// ============================================================
// APPS SCRIPT — LST Flota (versión GET — sin CORS)
// INSTRUCCIONES:
// 1. Extensiones → Apps Script → borrar todo → pegar esto
// 2. 💾 Guardar
// 3. Implementar → Administrar implementaciones → ✏️ → Nueva versión → Implementar
// ============================================================

function doGet(e) {
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
