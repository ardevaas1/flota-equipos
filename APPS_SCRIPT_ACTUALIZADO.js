// ============================================================
// APPS SCRIPT — LST Flota (versión final con CORS)
// 
// INSTRUCCIONES:
// 1. Abre Google Sheets → Extensiones → Apps Script
// 2. Borra TODO el código existente
// 3. Pega este código completo
// 4. Clic en 💾 Guardar
// 5. Clic en "Implementar" → "Administrar implementaciones"
// 6. Clic en el lápiz ✏️ de tu implementación actual
// 7. Versión: selecciona "Nueva versión"
// 8. Clic en "Implementar"
// 9. La URL NO cambia, la misma sigue funcionando
// ============================================================

function doPost(e) {
  try {
    const data     = JSON.parse(e.postData.contents);
    const folderId = data.folderId;
    const fileName = data.fileName;
    const fileData = Utilities.base64Decode(data.fileData);
    const mimeType = data.mimeType || 'application/octet-stream';

    // Obtener carpeta destino
    let folder;
    try {
      folder = DriveApp.getFolderById(folderId);
    } catch(err) {
      folder = DriveApp.getRootFolder();
    }

    // Eliminar versión anterior si existe
    const existing = folder.getFilesByName(fileName);
    while (existing.hasNext()) {
      existing.next().setTrashed(true);
    }

    // Crear el archivo
    const blob = Utilities.newBlob(fileData, mimeType, fileName);
    const file  = folder.createFile(blob);

    // Dar acceso de lectura a cualquiera con el link
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    const output = JSON.stringify({
      success: true,
      id:      file.getId(),
      name:    file.getName(),
      link:    file.getUrl()
    });

    return ContentService
      .createTextOutput(output)
      .setMimeType(ContentService.MimeType.JSON);

  } catch(err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok' }))
    .setMimeType(ContentService.MimeType.JSON);
}
