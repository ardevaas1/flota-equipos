# Feature: Actualizar Ficha Técnica automáticamente (Flota)

## Estado: IMPLEMENTADO, sin probar contra la API real todavía

Código en `app-v2.js` (buscar `actualizarFichaTecnica`). Botón "🔄
Actualizar ficha técnica" en la ficha de cada vehículo, junto al de "Abrir
ficha técnica". Scope de Docs agregado en `config.js`.

**Antes de usarlo con todos los vehículos**: probarlo primero en UNO,
revisando a mano que el Doc haya quedado bien. La API de Google Docs no se
pudo probar en vivo al escribir este código.

**Si tira error 403**: cada usuario que ya había iniciado sesión antes de
este cambio tiene que cerrar sesión y volver a entrar, para que Google le
pida el permiso nuevo de Docs.

## Decisión clave: NO se migran los 26 Docs viejos a un archivo nuevo

Se evaluó recrear los 26 Docs desde una plantilla nueva, pero se descartó:
copiar contenido rico (tablas, formato) de un Doc a otro vía la API de
Google Docs es una tarea enorme y frágil (no hay un "copiar este rango" en
la API, hay que reconstruir todo a mano). En cambio, las funciones de
actualización buscan cada dato por el **texto de la etiqueta** ("REVISIÓN
TÉCNICA", "UBICACIÓN", "OPERATIVA", "REGISTRO FOTOGRÁFICO", etc.) — esas
etiquetas YA existen en los 26 Docs actuales porque comparten la plantilla
original. Por eso las funciones de Documentación, Ubicación, Fallas e
Historial **funcionan directo sobre los Docs existentes, sin migrar nada**.

Lo único que los Docs viejos no tenían era una sección de "Foto de
referencia" y un link clickeable a la carpeta de fotos — las funciones
correspondientes ahora detectan si falta esa sección y la **crean solas la
primera vez** que se corre el botón sobre ese vehículo (ver
`_actualizarFotoFicha` y `_actualizarLinkCarpetaFicha`, rama `else`/
fallback). No hace falta ningún paso de migración manual ni masivo.

## Estructura del Doc que las funciones esperan encontrar

No depende de un formato exacto, solo de que existan estos textos en algún
lado del documento (en tablas o párrafos sueltos, no importa el orden):

- Una tabla con una fila cuya primera celda contenga "PATENTE" o "EQUIPO"
  (tabla de datos generales) — ahí se busca también la fila "UBICACIÓN".
- Una tabla con una columna "FECHA DE VENCIMIENTO" y filas "REVISIÓN
  TÉCNICA" / "PERMISO DE CIRCULACIÓN" / "SEGURO OBLIGATORIO".
- Una tabla o celdas con el texto "OPERATIVA" y "ESTÉTICA" (fallas).
- Un párrafo o encabezado con el texto "REGISTRO FOTOGRÁFICO".
- Una tabla con "HISTORIAL DE EVENTOS" en el encabezado.

La plantilla nueva (para vehículos que se creen de acá en adelante) está
en Drive como Doc de ejemplo aprobado por el usuario — usa marcadores
`{{ASÍ}}` para las partes que la app llena la primera vez, pero después de
la primera corrida esos marcadores desaparecen y las funciones siguen
ubicando todo por el texto de las etiquetas, igual que en los Docs viejos.

## Qué actualiza cada corrida del botón

1. **Documentación**: fecha + estado (VIGENTE/VENCIDO) de SOAP, Permiso y
   Revisión Técnica — recalculado cada vez con `diasRestantes`.
2. **Ubicación**: la fila UBICACIÓN de la tabla de datos generales.
3. **Fallas detectadas**: reemplaza el valor de las celdas OPERATIVA/
   ESTÉTICA con lo que haya cargado en la ficha del vehículo en la app
   (campos nuevos `edit-falla-operativa` / `edit-falla-estetica`).
4. **Foto de referencia**: inserta/reemplaza la misma foto que se ve en la
   app (`fotoRef`), con un marcador de texto `[foto]` para poder ubicarla y
   reemplazarla en corridas futuras sin acumular fotos viejas.
5. **Link a la carpeta de fotos**: resuelve la carpeta real por patente
   (misma búsqueda que ya usa `abrirCarpetaDrive`) y la deja como link
   clickeable con el texto "Abrir carpeta de fotos".
6. **Historial de eventos mayores**: agrega las mantenciones de la hoja
   `MANTENCIONES` que todavía no aparecen en el Doc (dedupe por fecha).

Todo lo demás del Doc (N° de serie, código interno, specs del motor,
fallas detectadas *contenido libre*, especificaciones técnicas) sigue
siendo edición 100% manual — la app nunca lo toca.
