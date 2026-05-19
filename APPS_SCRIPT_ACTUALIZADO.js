// ============================================================
// APPS SCRIPT ACTUALIZADO — pegar en Google Apps Script
// Menú: Extensiones → Apps Script → borrar todo → pegar esto
// Luego: Implementar → Administrar implementaciones → editar (lápiz) → Nueva versión → Implementar
// ============================================================

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const folderId = data.folderId;
    const fileName = data.fileName;
    const fileData = Utilities.base64Decode(data.fileData);
    const mimeType = data.mimeType;

    // Buscar o crear carpeta
    let folder;
    try {
      folder = DriveApp.getFolderById(folderId);
    } catch(err) {
      // Si no existe el folderId, usar carpeta raíz de Drive
      folder = DriveApp.getRootFolder();
    }

    // Si ya existe un archivo con ese nombre, reemplazarlo
    const existing = folder.getFilesByName(fileName);
    if (existing.hasNext()) {
      existing.next().setTrashed(true);
    }

    const blob = Utilities.newBlob(fileData, mimeType, fileName);
    const file = folder.createFile(blob);

    // Hacer el archivo accesible con el link (para poder verlo desde la app)
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    const response = JSON.stringify({
      success: true,
      id: file.getId(),
      name: file.getName(),
      link: file.getUrl()
    });

    return ContentService
      .createTextOutput(response)
      .setMimeType(ContentService.MimeType.JSON);

  } catch(err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok', message: 'LST Flota - Apps Script activo' }))
    .setMimeType(ContentService.MimeType.JSON);
}
