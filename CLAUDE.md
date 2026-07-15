# LST Constructora — Flota & Equipos

App interna para inventariar y trasladar equipos entre obras/bodega (flota de
vehículos, generadores, maquinaria menor, herramientas, containers/módulos y
andamios). La usa gente en terreno desde el celular, no solo desarrolladores
— cualquier bug se nota rápido y en producción.

## Qué es esto (arquitectura)

App vanilla JS, sin build ni framework, sin backend propio. Es una PWA
estática (index.html + app.js/app-v2.js/inventario.js + style.css) servida
tal cual (ej. GitHub Pages).

- **Datos**: un único Google Sheet (`SHEET_ID` en `config.js`), una pestaña
  por "tabla". Ver sección de hojas más abajo.
- **Auth**: OAuth2 directo con Google desde el navegador (`CLIENT_ID` en
  `config.js`). El token vive solo en el navegador, dura ~1h, y no hay
  refresh token porque no hay backend — por eso pide re-login seguido. Esto
  es una limitación arquitectónica conocida y aceptada, no un bug a "arreglar".
- **Lectura**: siempre directo desde el navegador con `fetchSheet()`, usando
  el token del propio usuario (requiere que tenga al menos rol Viewer en el
  Sheet).
- **Escritura**: depende del módulo — **esto es importante y no es
  consistente entre módulos, a propósito**:
  - Flota, Generadores, Maq Menor, Herramientas, Containers → escritura
    directa desde el navegador (`writeSheet`/`appendSheet`) con el token del
    usuario.
  - **Andamios → escritura EXCLUSIVAMENTE vía Apps Script** desplegado como
    Web App (`APPS_SCRIPT_ACTUALIZADO.js`). El navegador nunca escribe
    directo a `ANDAMIOS` ni a `AND-HISTORIAL`. Es deliberado: el Apps Script
    valida el email real del usuario del lado del servidor en vez de confiar
    en lo que mande el navegador. **Cuando se edita
    `APPS_SCRIPT_ACTUALIZADO.js` hay que volver a implementarlo a mano en
    Google** (Extensiones → Apps Script → pegar → Implementar → Nueva
    versión) — el archivo del repo no se autodespliega, y es fácil olvidarlo
    y quedar probando contra la versión vieja del script.
- **Fotos**: Google Drive (`DRIVE_ROOT_FOLDER` / `DRIVE_INV_FOLDER` en
  `config.js`/`inventario.js`), con subcarpetas por módulo. Ver "Trampas
  conocidas" #3 — es la parte más frágil de toda la app.

## Roles

4 roles vía hoja `USUARIOS` + clases en `<body>`: `admin`, `viewer`,
`mover`, `andamios`. `viewer-mode` oculta todo `.action-btn` /
`.pnl-action` / `.and-btn` por CSS. `andamios-mode` habilita escritura en
Andamios. `admin-only-btn` son controles reservados para admin (hoy no hay
ninguno visible — ver Pendientes).

## Hojas del Sheet (nombres reales de pestaña, no siempre obvios)

| Constante | Nombre real de pestaña | Contenido |
|---|---|---|
| `SHEET_MAQUINARIA` | `MAQUINARIA` | Flota (vehículos). Col V = `fotoRef` |
| `SHEET_MANTENCIONES` | `MANTENCIONES` | Mantenciones de Flota |
| `SHEET_GENERADORES` | `GENERADORES` | Inventario con ubicación por equipo |
| `SHEET_MAQ_MENOR` | `MAQUINARIA MENOR` | ídem |
| `SHEET_HERRAMIENTAS` | `HERRAMIENTAS` | ídem |
| `SHEET_GEN_EVENTOS` | `MANT-GEN` | Mantenciones de Generadores (¡ojo, NO "MANTENCIONES_GEN"!) |
| `SHEET_CONTAINERS` | `CONTENEDORES` | Containers/módulos — el nombre real de pestaña está en español |
| `SHEET_ANDAMIOS` | `ANDAMIOS` | Catálogo de piezas: A=Tipo B=Foto C=Cantidad D=Obs E=Sistema F=Bajas |
| `SHEET_AND_HIST` | `AND-HISTORIAL` | Historial de cambios de Cantidad/Bajas (la crea sola el Apps Script). Cols: Fecha, Fila, Tipo, CantidadAnterior, CantidadNueva, Diferencia, Usuario, Campo |
| `SHEET_MOVIMIENTOS` | `MOVIMIENTOS` | Traslados entre obras/bodega — cruza todos los módulos EXCEPTO Andamios |
| `SHEET_USUARIOS` | `USUARIOS` | Roles |

En `ANDAMIOS`: **Cantidad** = piezas buenas. **Bajas** = piezas dadas de
baja, contador **independiente** por pieza — no resta de Cantidad. Fue
decisión explícita del usuario, no asumir que "dar de baja" debería
descontar del stock bueno.

## Trampas conocidas (patrones de bug que ya se repitieron más de una vez)

1. **`rowIndex` reusado entre módulos/hojas sin verificar a cuál pertenece
   realmente.** Ya causó dos bugs reales: (a) el detalle de un Container
   abierto desde Movimientos mostraba el equipo equivocado porque la función
   de routing no sabía de `'cont'` y caía a buscar ese número de fila en el
   array de Herramientas; (b) al crear un Container nuevo con foto, la fila
   se **adivinaba** en el cliente (`max(rowIndex) + 1`) en vez de
   confirmarse — si la lista local estaba desactualizada, la foto se
   escribía encima de otro container ya existente. **Regla: nunca asumir
   que un rowIndex es válido para un array/hoja sin confirmarlo contra la
   fuente real** (idealmente parseando la respuesta de la propia API de
   `append`, no calculándolo en el cliente).

2. **Reglas CSS que alcanzan a un módulo pero se olvidan de un panel
   hermano.** Pasó con Andamios: `panel-and-nuevo` y `panel-and-edit` están
   en el HTML **fuera** de `#mod-andamios` (son hermanos, no descendientes).
   Si agregás un panel nuevo para un rol con permisos restringidos, revisar
   TODAS las reglas `body.XXX-mode #mod-YYY .clase` — si el panel no es
   descendiente de `#mod-YYY`, hace falta un selector aparte.

3. **Fotos: nunca reimplementar la lógica de abrir/cargar una foto en un
   `onclick` nuevo.** Las celdas de "foto" pueden tener 3 formatos y hay que
   soportar los tres: (a) nombre de archivo viejo → se busca por
   `name = 'X'` en la API de Drive — frágil, los nombres no son únicos y si
   el archivo solo tiene permiso "cualquiera con el link" (sin colaborador
   explícito) la búsqueda por nombre puede no encontrarlo; (b) ID de Drive
   directo (sin punto) → formato nuevo, usado por Andamios, evita el
   problema anterior; (c) link completo pegado a mano
   (`.../file/d/ID/view?usp=drive_link`) → hay que extraer el ID con regex y
   convertirlo a URL de imagen servible (`uc?export=view` o
   `thumbnail?id=`), **nunca** usar el link "de ver" tal cual en un
   `<img src>`. Ya hubo un bug real por tener DOS `onclick` superpuestos (uno
   en la miniatura, con la lógica completa, y otro en el `<div>` que la
   envolvía, con lógica vieja/incompleta que pisaba la imagen correcta).
   **Única función que debe abrir una foto en grande: `invAbrirFotoModal()`
   en `inventario.js`** (y `invCargarMiniatura()` / las versiones
   `_Andamio` para miniaturas). No reimplementar.

4. **Nombre de hoja hardcodeado que no calza con la pestaña real** → error
   400 "Unable to parse range" (`appendSheet`/`fetchSheet` NO crean pestañas
   nuevas). Pasó con `MANT-GEN` (estaba como `MANTENCIONES_GEN` en el
   código). Ante un 400 en cualquier módulo, lo primero es comparar la
   constante `SHEET_XXX` contra el nombre real de la pestaña.

5. **Los resúmenes de chats anteriores no son 100% confiables.** Ya se
   encontró código a medio hacer, dejado sin conectar de sesiones previas,
   que ningún resumen mencionaba (un chip roto "🚫 Dados de baja" sin lógica
   detrás, un botón "🔧 Reparar fotos desincronizadas" sin terminar de
   integrar). Antes de asumir "esto ya está implementado", revisar el código
   real.

## Decisiones de diseño ya tomadas (para no repreguntar)

- Se sacaron **a propósito**, por accidentes reales que ocurrieron: "Vaciar
  catálogo completo" y "Eliminar pieza" de Andamios. No reintroducir sin que
  el usuario lo pida explícitamente.
- Andamios **no está** en Movimientos: el catálogo es un total global por
  tipo de pieza, sin ubicación por obra (a diferencia de los demás módulos).
  Pendiente definir con el usuario si alguna vez hace falta.

## Pendientes / temas abiertos

- **Feature en carpeta**: generar/actualizar automáticamente la Ficha
  Técnica (Google Doc por vehículo) desde la app. Ya hay un spec completo
  con la estructura real del Doc, qué campos mapean y qué falta —
  ver `FICHA-TECNICA-FEATURE.md`.
- Andamios en Movimientos (necesita definición del usuario primero: ¿solo
  registro histórico o afecta el total? ¿necesita ubicación por obra?).
- Fotos viejas de Andamios (formato nombre, pre-migración a ID) siguen
  necesitando compartir la carpeta a mano por email a cada usuario nuevo.
- `contRepararFotos()` sigue en `inventario.js` pero sin botón visible en
  ningún lado (se ocultó a pedido explícito, no se borró la función).
- De chats más viejos, sin tocar: logo de la app, limpiar emojis de
  `toast()`, encabezados de columnas L→Q en `MOVIMIENTOS`, si "Autoriza"
  debe ser obligatorio, QR por equipo, notificaciones de vencimientos,
  dashboard de métricas, soporte offline completo.

## Cómo probar cambios

No hay tests automatizados ni entorno de desarrollo — es una PWA estática
que se prueba en el celular real del usuario, en producción. Cualquier
cambio no trivial: pedirle al usuario que lo pruebe en vivo y confirme antes
de darlo por resuelto.
