# Feature: Actualizar Ficha Técnica automáticamente (Flota)

## Estado: IMPLEMENTADO, sin probar contra la API real todavía

Código en `app-v2.js` (buscar `actualizarFichaTecnica`). Botón "🔄
Actualizar ficha técnica" en la ficha de cada vehículo, junto al de "Abrir
ficha técnica". Scope de Docs agregado en `config.js`.

**Antes de usarlo con todos los vehículos**: probarlo primero en UNO,
revisando a mano que el Doc haya quedado bien (fechas/estado correctos, la
foto se vea bien posicionada, la fila de historial nueva tenga los datos en
las columnas correctas). La API de Google Docs no se pudo probar en vivo al
escribir este código — solo se armó con la estructura real leída de un Doc
de ejemplo, así que hay margen de error en cómo ubica las celdas.

**Si tira error 403**: cada usuario que ya había iniciado sesión antes de
este cambio tiene que cerrar sesión y volver a entrar, para que Google le
pida el permiso nuevo de Docs.

## Estructura real del Doc (confirmada leyendo un ejemplo real)

Título: **"HOJA DE VIDA DE MAQUINARIA — REGISTRO TÉCNICO Y ADMINISTRATIVO"**

1. **Tabla de encabezado**: EQUIPO, CÓDIGO, MARCA / MODELO, N° DE SERIE,
   AÑO, PATENTE, UBICACIÓN, ENCARGADO
2. **1. ESPECIFICACIONES TÉCNICAS**: MOTOR/MODELO, FILTROS (aceite,
   combustible, aire), ACEITE MOTOR, CAPACIDAD ESTANQUE, MEDIDA
   NEUMÁTICOS/ORUGAS
3. **2. DOCUMENTACIÓN**: tabla con REVISIÓN TÉCNICA / PERMISO DE
   CIRCULACIÓN / SEGURO OBLIGATORIO, cada uno con fecha de vencimiento y
   estado (VIGENTE/VENCIDO)
4. **3. FALLAS DETECTADAS**: OPERATIVA (texto libre) / ESTÉTICA (texto
   libre)
5. **4. REGISTRO FOTOGRÁFICO**: link a la carpeta de Drive de fotos de ese
   vehículo, identificada porque el texto del link es la patente
6. **5. HISTORIAL DE EVENTOS MAYORES**: tabla con Fecha, Horómetro/Odómetro,
   Tipo de evento, Descripción, Costo

## Alcance confirmado con el usuario (no re-preguntar)

- La hoja "RE" (otra lista de vehículos con links de ficha técnica,
  encontrada al revisar el Drive) es un respaldo viejo — la fuente real es
  **`MAQUINARIA.linkFicha`** (columna T, índice 19), que es la que usa la
  app en vivo.
- El botón actualiza SOLO 3 cosas en el Doc existente de cada vehículo:
  1. **Documentación**: fecha + estado (VIGENTE/VENCIDO) de SOAP, Permiso
     de Circulación y Revisión Técnica — mismo cálculo que ya usa la app
     (`diasRestantes`/`parsearFecha`).
  2. **Registro fotográfico**: inserta la MISMA foto de referencia
     (`fotoRef`) que se ve en la app, dentro de la celda que ya tiene el
     link a la carpeta — sin tocar ese link ni agregar el resto de fotos.
     Si ya había una foto de una corrida anterior, la reemplaza (no
     acumula fotos viejas).
  3. **Historial de eventos mayores**: agrega las mantenciones de la hoja
     `MANTENCIONES` que todavía no aparecen en el Doc (dedupe por fecha).
- Todo lo demás del Doc (N° de serie, código interno, specs del motor,
  fallas detectadas) sigue siendo edición manual — no se tocó ni se agregó
  nada a la app para esos campos.

## Cómo ubica las cosas dentro del Doc (para debug futuro)

No usa posiciones fijas — cada vez que corre, lee el Doc entero
(`documents.get`) y busca por texto:
- Las 3 filas de documentación, buscando la etiqueta ("REVISIÓN TÉCNICA",
  etc.) y tomando los próximos 2 fragmentos de texto no vacíos (fecha,
  estado).
- La celda de la foto, buscando cuál celda de tabla contiene la patente.
- La tabla de historial, buscando cuál tabla tiene "HISTORIAL DE EVENTOS"
  en su encabezado.

Si algún Doc tiene una estructura distinta a la plantilla estándar (otro
orden de columnas, otra redacción de las etiquetas), esa parte
simplemente no se actualiza — no debería romper nada, pero tampoco va a
avisar que se saltó algo. Si un vehículo puntual no se actualiza bien,
lo primero a revisar es si su Doc calza con la plantilla.
