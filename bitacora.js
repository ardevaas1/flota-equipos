// Respaldo: estas dos ayudas viven en app-v2.js; si por algún motivo se subió
// una versión de app-v2.js que todavía no las tiene, se definen acá para que
// los formularios de Bitácora no se queden "muertos".
if (typeof _parseNumeroSheet !== 'function') {
  window._parseNumeroSheet = function (v) {
    let s = (v == null ? '' : v).toString().trim();
    if (!s) return NaN;
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    else { const p = s.split('.'); if (p.length > 1 && !(p.length === 2 && p[1].length <= 2)) s = s.replace(/\./g, ''); }
    return parseFloat(s);
  };
}
if (typeof _numeroParaInput !== 'function') {
  window._numeroParaInput = function (v) { const n = _parseNumeroSheet(v); return isNaN(n) ? '' : String(n).replace('.', ','); };
}

// ═══════════════════════════════════════════════════════════════════════
// MÓDULO: BITÁCORA & CONSUMO DE COMBUSTIBLE
// ═══════════════════════════════════════════════════════════════════════
// Guarda dos cosas por vehículo de Flota: viajes (fecha, km inicial/final,
// destino, chofer) y cargas de combustible (fecha, km actual, litros).
// Con eso arma una métrica mensual simple por vehículo: km recorridos,
// litros cargados y rendimiento (km/L).
//
// Las hojas BITACORA y COMBUSTIBLE se crean solas la primera vez que se
// necesitan (ver _bitAsegurarHojas) — no hace falta armarlas a mano en el
// Sheet antes de usar el módulo.

let allBitacora    = []; // [{ rowIndex, id, fecha, patente, kmInicial, kmFinal, destino, chofer, registradoPor }]
let allCombustible  = []; // [{ rowIndex, id, fecha, patente, km, litros, chofer, registradoPor }]
let _bitPatenteActual   = null;
let _bitHojasListas     = false;
let _bitMesSeleccionado = null; // 'YYYY-MM' — se inicializa en bitInit() con el mes actual

// SVG del vehículo (mismo trazo que usa el ícono del módulo Flota en la
// pantalla de inicio) — nada de emoji, así queda consistente con el resto
// de la app.
const _BIT_ICONO_VEHICULO = '<svg viewBox="0 0 24 24" fill="none" class="equipo-svg"><path d="M2 17h1M3 17V8a1 1 0 0 1 1-1h7v10M11 17h7M18 17a2 2 0 1 0 4 0 2 2 0 1 0-4 0Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M11 11h5l3 3v3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 17a2 2 0 1 0 4 0 2 2 0 1 0-4 0Z" stroke="currentColor" stroke-width="1.8"/></svg>';

function _bitSoloLectura() {
  if (typeof userRole === 'undefined') return false;
  if (userRole === 'admin') return false;
  if (typeof userRoles !== 'undefined' && userRoles.includes('chofer')) return false;
  return true;
}

// ── Generadores en Bitácora (solo combustible y checklist) ────────────
// Los generadores viven en Inventario, no en Flota. Para reusar TODO lo que
// ya existe (cargas de combustible, rendimiento, historial, checklist) se
// los trata como un "equipo" más, identificado por su código (ej. GE-001) en
// el lugar de la patente, y siempre medido en horas.
let _bitVista = 'veh'; // 'veh' = vehículos de Flota · 'gen' = generadores
function _bitGenId(g) { return (g.codigo || '').toString().trim().toUpperCase() || ('GEN-' + g.num); }
function _bitGeneradoresComoEquipos() {
  return (typeof allGeneradores !== 'undefined' ? allGeneradores : []).map(g => ({
    patente: _bitGenId(g), equipo: g.equipo || 'GENERADOR', marca: g.marca, modelo: g.modelo,
    unidadUso: 'HORAS', esGenerador: true, horometro: g.horometro, potencia: g.potencia, fotoRef: '', imagen: g.imagen || '',
  }));
}
// Busca un equipo por su identificador (patente de Flota o código de generador)
function _bitEquipoPorId(id) {
  const v = (typeof allEquipos !== 'undefined' ? allEquipos : []).find(e => e.patente === id);
  if (v) return v;
  return _bitGeneradoresComoEquipos().find(e => e.patente === id);
}
// Foto del generador (columna "imagen" de Inventario): puede ser un nombre de
// archivo de Drive, un ID, o un link. Se resuelve a una URL de miniatura y se
// guarda en memoria para no volver a buscarla.
const _bitFotoGenCache = {};
async function _bitUrlFotoGen(imagen) {
  const v = (imagen || '').toString().trim();
  if (!v) return '';
  if (_bitFotoGenCache[v] !== undefined) return _bitFotoGenCache[v];
  let id = '';
  if (v.startsWith('http')) {
    const mPath = v.match(/\/file\/d\/([a-zA-Z0-9_-]+)/), mQ = v.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    id = (mPath && mPath[1]) || (mQ && mQ[1]) || '';
  } else if (!v.includes('.') && /^[a-zA-Z0-9_-]{20,}$/.test(v)) {
    id = v;
  } else {
    try {
      const cache = (typeof _fotoIdPorNombre !== 'undefined') ? _fotoIdPorNombre[v] : null;
      const data = cache ? { files: [cache] } : await driveSearch('inventario', `title = '${_qEsc(v)}' and trashed = false`, { orderBy: 'createdTime desc', pageSize: 1 });
      if (data.files && data.files[0]) {
        if (typeof _fotoIdPorNombre !== 'undefined') _fotoIdPorNombre[v] = data.files[0];
        id = data.files[0].id;
      }
    } catch (e) { console.warn('[BIT FOTO GEN]', e.message); }
  }
  const url = id ? `https://drive.google.com/thumbnail?id=${id}&sz=w800` : (v.startsWith('http') ? v : '');
  _bitFotoGenCache[v] = url;
  return url;
}
function _bitIdDom(s) { return 'bit-gfoto-' + String(s).replace(/[^a-zA-Z0-9]/g, '_'); }
// Pinta, en la lista de generadores, la foto de cada uno cuando ya se resolvió
function _bitPintarFotosGeneradores(lista) {
  lista.filter(e => e.esGenerador && e.imagen).forEach(async e => {
    const url = await _bitUrlFotoGen(e.imagen);
    if (!url) return;
    document.querySelectorAll('img[data-bit-gfoto="' + _bitIdDom(e.patente) + '"]').forEach(img => {
      img.onload = () => { img.style.display = ''; const ic = img.nextElementSibling; if (ic && ic.classList.contains('bit-gfoto-ph')) ic.style.display = 'none'; };
      img.src = url;
    });
  });
}
function bitCambiarVista(v) {
  _bitVista = v;
  bitRenderLista();
}
function _bitTabsVista() {
  return `<div class="bit-vista-tabs">
    <button type="button" class="${_bitVista === 'veh' ? 'on' : ''}" onclick="bitCambiarVista('veh')">Vehículos</button>
    <button type="button" class="${_bitVista === 'gen' ? 'on' : ''}" onclick="bitCambiarVista('gen')">Generadores</button>
  </div>`;
}

// Algunos equipos (generadores, cierta maquinaria) se miden por horómetro
// (horas), no por kilometraje — se marca por vehículo en la ficha de Flota
// (campo "Unidad de medida"). Todo lo que se muestra en Bitácora se adapta
// según esto: "Km inicial/final" vs "Horas inicial/final", "km recorridos"
// vs "horas trabajadas", etc. Por defecto (equipo no encontrado, o sin el
// campo cargado) se asume KM, que es el caso más común.
function _bitUnidad(patente) {
  const eq = _bitEquipoPorId(patente);
  return (eq && eq.unidadUso === 'HORAS') ? 'HORAS' : 'KM';
}
function _bitEsHoras(patente) { return _bitUnidad(patente) === 'HORAS'; }
// Textos según unidad, en varias formas gramaticales para no armar frases feas
function _bitTextos(patente) {
  const horas = _bitEsHoras(patente);
  return {
    unidadCorta:   horas ? 'h'      : 'km',
    unidadLarga:   horas ? 'horas'  : 'km',
    unidadLargaCap:horas ? 'Horas'  : 'Km',
    rendimiento:   horas ? 'h / litro' : 'km / litro',
    recorridoLabel:horas ? 'horas trabajadas' : 'km recorridos',
  };
}

// Crea las hojas BITACORA / COMBUSTIBLE (con sus encabezados) si todavía
// no existen en el Sheet. Se corre una sola vez por sesión.
async function _bitAsegurarHojas() {
  if (_bitHojasListas) return;
  await ensureToken();
  try {
    const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SHEET_ID}`;
    const res = await fetch(metaUrl, { headers: authHeader() });
    if (!res.ok) return;
    const data = await res.json();
    const nombres = (data.sheets || []).map(s => s.properties.title);
    const faltantes = [];
    if (!nombres.includes(CONFIG.SHEET_BITACORA))    faltantes.push(CONFIG.SHEET_BITACORA);
    if (!nombres.includes(CONFIG.SHEET_COMBUSTIBLE))  faltantes.push(CONFIG.SHEET_COMBUSTIBLE);

    if (faltantes.length) {
      await fetch(`${metaUrl}:batchUpdate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({ requests: faltantes.map(nombre => ({ addSheet: { properties: { title: nombre } } })) }),
      });
      if (faltantes.includes(CONFIG.SHEET_BITACORA)) {
        await writeSheet(`'${CONFIG.SHEET_BITACORA}'!A1:H1`, [['ID','FECHA','PATENTE','KM_INICIAL','KM_FINAL','DESTINO','CHOFER','REGISTRADO_POR']]);
      }
      if (faltantes.includes(CONFIG.SHEET_COMBUSTIBLE)) {
        await writeSheet(`'${CONFIG.SHEET_COMBUSTIBLE}'!A1:H1`, [['ID','FECHA','PATENTE','KM','LITROS','CHOFER','REGISTRADO_POR','LLENO']]);
      }
    }
    _bitHojasListas = true;
  } catch(e) {
    console.warn('[BITACORA] No se pudo verificar/crear las hojas:', e.message);
  }
}

async function loadBitacora() {
  try {
    const rows = await fetchSheet(`'${CONFIG.SHEET_BITACORA}'!A2:H5000`);
    allBitacora = (rows || [])
      .map((r, i) => ({ r, rowIndex: i + 2 }))
      .filter(({ r }) => r[0])
      .map(({ r, rowIndex }) => ({
        rowIndex,
        id:            r[0] || '',
        fecha:         r[1] || '',
        patente:       (r[2] || '').toUpperCase(),
        kmInicial:     _parseNumeroSheet(r[3]) || 0,
        kmFinal:       _parseNumeroSheet(r[4]) || 0,
        // Viaje en curso = se registró el inicio y todavía no se cerró (km final vacío)
        enCurso:       r[4] === undefined || r[4] === null || r[4].toString().trim() === '',
        destino:       r[5] || '',
        chofer:        r[6] || '',
        registradoPor: r[7] || '',
      }));
  } catch(e) {
    allBitacora = [];
    console.warn('[BITACORA] No se pudo cargar (¿hoja no creada todavía?):', e.message);
  }
}

async function loadCombustible() {
  try {
    const rows = await fetchSheet(`'${CONFIG.SHEET_COMBUSTIBLE}'!A2:H5000`);
    allCombustible = (rows || [])
      .map((r, i) => ({ r, rowIndex: i + 2 }))
      .filter(({ r }) => r[0])
      .map(({ r, rowIndex }) => ({
        rowIndex,
        id:            r[0] || '',
        fecha:         _bitFechaDesdeHoja(r[1]),
        patente:       (r[2] || '').toUpperCase(),
        km:            _parseNumeroSheet(r[3]) || 0,
        litros:        _parseNumeroSheet(r[4]) || 0,
        chofer:        r[5] || '',
        registradoPor: r[6] || '',
        // Columna nueva (H) — si una carga es vacía/ausente (registros
        // viejos, de antes de que existiera esta columna) se asume LLENO,
        // que es como se venía calculando el rendimiento hasta ahora.
        lleno:         (r[7] === undefined || r[7] === '' || r[7] === null) ? true : (r[7] === true || r[7] === 'SI' || r[7] === 'TRUE'),
      }));
  } catch(e) {
    allCombustible = [];
    console.warn('[COMBUSTIBLE] No se pudo cargar (¿hoja no creada todavía?):', e.message);
  }
}

async function bitInit() {
  await _bitAsegurarHojas();
  if (!allBitacora.length && !allCombustible.length) {
    await Promise.all([loadBitacora(), loadCombustible(), (typeof loadChecklist === 'function' ? loadChecklist() : Promise.resolve())]);
  }
  if (!_bitMesSeleccionado) _bitMesSeleccionado = _bitMesActual();
  _bitRenderSelectoresMes();
  bitRenderLista();
}

// Últimos 12 meses (incluye el actual), más reciente primero
function _bitOpcionesMeses() {
  const meses = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const valor = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    let label = d.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });
    label = label.charAt(0).toUpperCase() + label.slice(1);
    meses.push({ valor, label });
  }
  return meses;
}

function _bitRenderSelectoresMes() {
  const opciones = _bitOpcionesMeses()
    .map(m => `<option value="${m.valor}" ${m.valor === _bitMesSeleccionado ? 'selected' : ''}>${m.label}</option>`)
    .join('');
  ['bit-mes-select', 'bit-dt-mes-select', 'bit-ficha-mes-select'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = opciones;
  });
}

function bitCambiarMes(valor) {
  _bitMesSeleccionado = valor;
  _bitRenderSelectoresMes();
  bitRenderLista();
  if (_bitPatenteActual) bitRenderMetricasYHistorial();
}

function bitSyncSearch() {
  const dt  = document.getElementById('bit-dt-search');
  const mob = document.getElementById('bit-search');
  if (dt && mob) mob.value = dt.value;
  bitRenderLista();
}

function _bitMesActual() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}
function _bitEsDelMes(fechaStr, mes) {
  return (fechaStr || '').slice(0, 7) === mes;
}
// El input type="date" guarda/entrega "yyyy-mm-dd" (para que ordene y
// filtre bien por mes), pero para MOSTRARLA se prefiere "dd/mm/yyyy" —
// solo cambia cómo se ve, el dato de fondo sigue guardado igual.
function _bitFormatearFecha(fechaISO) {
  const partes = (fechaISO || '').split('-');
  if (partes.length !== 3) return fechaISO || '';
  const [anio, mes, dia] = partes;
  return `${dia}/${mes}/${anio}`;
}
// Para que la fecha también se vea "dd/mm/yyyy" al abrir la hoja de
// cálculo directamente (no solo en la app), se guarda en ese formato en
// la columna B de COMBUSTIBLE (con comilla adelante para que Sheets no la
// intente interpretar como número/fecha propia y la deje tal cual texto).
function _bitFechaParaGuardar(fechaISO) {
  return "'" + _bitFormatearFecha(fechaISO);
}
// Y al revés: lo que se lee de la hoja puede venir en "dd/mm/yyyy" (cargas
// nuevas) o en "yyyy-mm-dd" (cargas viejas, de antes de este cambio) —
// esto normaliza cualquiera de los dos formatos a ISO para adentro de la
// app, así todo el resto del código (orden cronológico, filtro por mes)
// sigue funcionando exactamente igual sin importar en qué formato haya
// quedado guardada cada fila.
function _bitFechaDesdeHoja(valor) {
  const v = (valor || '').toString().trim();
  if (!v) return '';
  if (v.includes('/')) {
    const [dia, mes, anio] = v.split('/');
    if (dia && mes && anio) return `${anio.padStart(4, '0')}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
  }
  return v; // ya viene en ISO
}

// Viaje abierto (inicio registrado, sin km final todavía) de un vehículo.
function _bitViajeEnCurso(patente) {
  return allBitacora.filter(b => b.patente === patente && b.enCurso)
    .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '') || b.rowIndex - a.rowIndex)[0] || null;
}

// ── Visor de uso (horas trabajadas / km recorridos de viajes ya cerrados) ──
function _bitFmt(n) { return (Math.round(n * 100) / 100).toLocaleString('es-CL', { maximumFractionDigits: 2 }); }
function _bitFechaLocalISO(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

function _bitRenderUso(patente, t) {
  const el = document.getElementById('bit-ficha-uso');
  if (!el) return;
  if ((_bitEquipoPorId(patente) || {}).esGenerador) { el.innerHTML = ''; return; } // los generadores solo llevan combustible
  const cerrados = allBitacora.filter(b => b.patente === patente && !b.enCurso)
    .map(b => ({ ...b, usado: Math.max(0, b.kmFinal - b.kmInicial) }));
  const ahora = new Date();
  const hoy = _bitFechaLocalISO(ahora);
  const lunes = new Date(ahora); lunes.setDate(ahora.getDate() - ((ahora.getDay() + 6) % 7));
  const lunesISO = _bitFechaLocalISO(lunes);
  const mes = hoy.slice(0, 7);
  const suma = f => cerrados.filter(f).reduce((s, b) => s + b.usado, 0);
  const uHoy = suma(b => b.fecha === hoy);
  const uSem = suma(b => b.fecha >= lunesISO && b.fecha <= hoy);
  const uMes = suma(b => (b.fecha || '').slice(0, 7) === mes);
  const uTot = suma(() => true);

  // Detalle por día (últimos 14 días con registros)
  const porDia = {};
  cerrados.forEach(b => { (porDia[b.fecha] = porDia[b.fecha] || []).push(b); });
  const dias = Object.keys(porDia).sort().reverse().slice(0, 14);
  const detalle = dias.map(d => {
    const lista = porDia[d];
    const total = lista.reduce((s, b) => s + b.usado, 0);
    const choferes = [...new Set(lista.map(b => b.chofer).filter(Boolean))].join(', ');
    return `<div class="uso-fila"><span>${_bitFormatearFecha(d)}${choferes ? ' · ' + choferes : ''}</span><strong>${_bitFmt(total)} ${t.unidadCorta}</strong></div>`;
  }).join('');

  const etiqueta = t.recorridoLabel.charAt(0).toUpperCase() + t.recorridoLabel.slice(1);
  el.innerHTML = `<div class="ficha-section">
    <div class="ficha-sec-title">${etiqueta} (viajes cerrados)</div>
    <div class="uso-grid">
      <div class="uso-tile"><div class="uso-num">${_bitFmt(uHoy)}</div><div class="uso-lbl">Hoy</div></div>
      <div class="uso-tile"><div class="uso-num">${_bitFmt(uSem)}</div><div class="uso-lbl">Esta semana</div></div>
      <div class="uso-tile"><div class="uso-num">${_bitFmt(uMes)}</div><div class="uso-lbl">Este mes</div></div>
      <div class="uso-tile"><div class="uso-num">${_bitFmt(uTot)}</div><div class="uso-lbl">Total registrado</div></div>
    </div>
    ${detalle ? `<details class="uso-detalle"><summary>Ver detalle por día</summary>${detalle}</details>` : '<div style="font-size:13.5px;color:var(--ink-soft);margin-top:8px">Todavía no hay viajes cerrados.</div>'}
  </div>`;
}

function _bitMetricasVehiculo(patente, mes) {
  const viajes = allBitacora.filter(b => b.patente === patente && (!mes || _bitEsDelMes(b.fecha, mes)));
  const cargasDelMes = allCombustible.filter(c => c.patente === patente && (!mes || _bitEsDelMes(c.fecha, mes)));
  const kmRecorridos = viajes.reduce((sum, v) => sum + Math.max(0, v.kmFinal - v.kmInicial), 0);
  const litros = cargasDelMes.reduce((sum, c) => sum + c.litros, 0);

  // Rendimiento: SIEMPRE entre un llenado COMPLETO del estanque y el
  // siguiente llenado completo (como corresponde calcularlo de verdad),
  // nunca "km del mes ÷ litros del mes" — un litro cargado el día 2
  // todavía no se gastó, así que ese cálculo por mes calendario daba "—"
  // cada vez que el mes arrancaba con una carga. Tampoco se compara contra
  // la carga inmediatamente anterior sin más: si esa carga anterior NO
  // dejó el estanque lleno (alguien echó poco y no completó), los litros
  // de esa carga parcial se ARRASTRAN y se suman a la próxima carga que sí
  // complete el estanque — si no, la carga que completa el estanque
  // parece "rendir pésimo" (más litros para los mismos km) cuando en
  // realidad solo está compensando lo que faltó cargar la vez anterior.
  const todasLasCargas = allCombustible
    .filter(c => c.patente === patente && c.km > 0)
    .sort((a, b) => a.km - b.km);

  let kmEntreCargas = 0, litrosConDelta = 0;
  let tramosCerrados = 0, tramosDelMes = 0, tramosKmMalo = 0;
  let anclaIdx = 0;       // índice de la última carga usada como punto de referencia (llenado completo, o la primera carga del historial si todavía no hay ninguno)
  let litrosPendientes = 0; // litros acumulados desde el ancla, en espera de que llegue el próximo llenado completo
  for (let i = 1; i < todasLasCargas.length; i++) {
    const c = todasLasCargas[i];
    litrosPendientes += c.litros;
    if (!c.lleno) continue; // carga parcial: se suma a lo pendiente, pero todavía no se puede cerrar el tramo
    const anterior = todasLasCargas[anclaIdx];
    const delta = c.km - anterior.km;
    tramosCerrados++;
    if (!mes || _bitEsDelMes(c.fecha, mes)) tramosDelMes++;
    if (delta <= 0) tramosKmMalo++;
    if (delta > 0 && (!mes || _bitEsDelMes(c.fecha, mes))) {
      kmEntreCargas += delta;
      litrosConDelta += litrosPendientes;
    }
    anclaIdx = i;
    litrosPendientes = 0;
  }
  const rendimiento = litrosConDelta > 0 ? (kmEntreCargas / litrosConDelta) : null;

  // Si no hay rendimiento, se explica por qué (se muestra en la ficha)
  let motivoSinRendimiento = '';
  if (rendimiento === null) {
    if (todasLasCargas.length < 2) motivoSinRendimiento = 'Se necesitan al menos 2 cargas de combustible con km/horas registrados para calcular el rendimiento.';
    else if (!tramosCerrados) motivoSinRendimiento = 'Ninguna carga posterior completó el estanque: el rendimiento se calcula cuando se vuelve a llenar el estanque completo.';
    else if (!tramosDelMes) motivoSinRendimiento = 'En este mes ninguna carga completó el estanque. Prueba con otro mes (el rendimiento se cuenta en el mes en que se completa el estanque).';
    else if (tramosKmMalo) motivoSinRendimiento = 'Hay cargas cuyo km/horas es igual o menor al de la carga anterior: revisa que estén bien escritos.';
  }
  return { motivoSinRendimiento, kmRecorridos, litros, rendimiento, nViajes: viajes.length, nCargas: cargasDelMes.length };
}

function bitRenderLista() {
  const cont   = document.getElementById('bit-lista');
  const contDt = document.getElementById('bit-dt-lista');
  if (!cont && !contDt) return;
  const txt = (document.getElementById('bit-search')?.value || '').toLowerCase();
  const mes = _bitMesSeleccionado || _bitMesActual();

  // Sin ordenar de nuevo: allEquipos ya viene en el mismo orden en que las
  // filas aparecen en la hoja MAQUINARIA (así se pidió específicamente).
  let vehiculos = _bitVista === 'gen' ? _bitGeneradoresComoEquipos() : (typeof allEquipos !== 'undefined' ? allEquipos : []).slice();
  if (txt) {
    vehiculos = vehiculos.filter(e => ((e.patente || '') + (e.marca || '') + (e.modelo || '')).toLowerCase().includes(txt));
  }

  let html;
  if (!vehiculos.length) {
    html = _bitVista === 'gen' ? emptyState('Sin generadores', 'No hay generadores cargados en Inventario todavía') : emptyState('Sin vehículos', 'No hay vehículos cargados en Flota todavía');
  } else {
    html = vehiculos.map(eq => {
      const m = _bitMetricasVehiculo(eq.patente, mes);
      const nombre = [eq.marca, eq.modelo].filter(Boolean).join(' ') || eq.equipo || eq.patente;
      return `<div class="card" onclick="bitAbrirFicha('${eq.patente}')">
        ${eq.fotoRef
          ? `<img class="card-photo" src="${eq.fotoRef}" alt="Foto de ${nombre}" loading="lazy">`
          : (eq.esGenerador && eq.imagen
              ? `<img class="card-photo" data-bit-gfoto="${_bitIdDom(eq.patente)}" alt="Foto de ${nombre}" style="display:none"><div class="card-icon bit-gfoto-ph">${_BIT_ICONO_VEHICULO}</div>`
              : `<div class="card-icon">${_BIT_ICONO_VEHICULO}</div>`)}
        <div class="card-body">
          <div class="card-title">${nombre}</div>
          <div class="card-sub card-sub--patente">${eq.patente}</div>
          ${_bitViajeEnCurso(eq.patente) ? '<div class="bit-en-curso-chip">● Viaje en curso</div>' : ''}
        </div>
        <div class="card-right">
          <div class="card-stat-num">${eq.esGenerador ? '' : m.kmRecorridos.toLocaleString('es-CL') + ' ' + _bitTextos(eq.patente).unidadCorta + '<br>'}${m.litros.toLocaleString('es-CL')} L</div>
          <div class="card-stat-label">Este mes</div>
        </div>
      </div>`;
    }).join('');
  }
  const tabs = _bitTabsVista();
  if (cont)   cont.innerHTML   = tabs + html;
  if (contDt) contDt.innerHTML = tabs + html;
  _actualizarContadorBuscador(['bit-search', 'bit-dt-search'], vehiculos.length);
  if (_bitVista === 'gen') _bitPintarFotosGeneradores(vehiculos);
}

function bitAbrirFicha(patente) {
  _bitPatenteActual = patente;
  const eq = _bitEquipoPorId(patente);
  const btnViaje = document.getElementById('bit-btn-viaje');
  if (btnViaje) btnViaje.style.display = (eq && eq.esGenerador) ? 'none' : '';
  const btnChk = document.getElementById('bit-btn-chk');
  if (btnChk) btnChk.style.display = (eq && eq.esGenerador) ? 'none' : '';
  const nombre = eq ? ([eq.marca, eq.modelo].filter(Boolean).join(' ') || eq.equipo) : patente;
  const esHoras = _bitEsHoras(patente);

  document.getElementById('bit-ficha-header').innerHTML = `
    ${eq && eq.fotoRef ? `
    <div class="ficha-section" style="padding:0;overflow:hidden;border-radius:14px;cursor:pointer;margin-bottom:12px" onclick="abrirFotoRefModal('${patente}')">
      <img src="${eq.fotoRef}" alt="Foto de referencia" style="width:100%;height:190px;object-fit:cover;display:block;border-radius:14px">
    </div>` : ''}
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <div style="font-size: 19px;font-weight:800;color:var(--ink)">${nombre}</div>
      ${esHoras ? `<span style="background:var(--accent-soft);color:var(--accent-dark);border-radius:99px;padding:2px 9px;font-size: 12px;font-weight:700">Se mide en horas</span>` : ''}
    </div>
    <div style="font-size: 14.5px;color:var(--ink-soft);margin-bottom:4px">${patente}</div>
  `;
  // Generador con foto: se arma el mismo bloque de foto que tienen los vehículos
  if (eq && eq.esGenerador && eq.imagen) {
    _bitUrlFotoGen(eq.imagen).then(url => {
      if (!url || _bitPatenteActual !== patente) return;
      const hdr = document.getElementById('bit-ficha-header');
      const bloque = document.createElement('div');
      bloque.className = 'ficha-section';
      bloque.style.cssText = 'padding:0;overflow:hidden;border-radius:14px;cursor:pointer;margin-bottom:12px';
      bloque.onclick = () => invAbrirFotoModal(eq.imagen);
      bloque.innerHTML = `<img src="${url}" alt="Foto de referencia" style="width:100%;height:190px;object-fit:cover;display:block;border-radius:14px">`;
      hdr.insertBefore(bloque, hdr.firstChild);
    });
  }

  const selFicha = document.getElementById('bit-ficha-mes-select');
  if (selFicha) selFicha.value = _bitMesSeleccionado || _bitMesActual();

  bitRenderMetricasYHistorial();
  openPanel('panel-bit-ficha');
}

function bitRenderMetricasYHistorial() {
  const patente = _bitPatenteActual;
  if (!patente) return;
  const mes = _bitMesSeleccionado || _bitMesActual();
  const m = _bitMetricasVehiculo(patente, mes);
  const t = _bitTextos(patente);
  const [anio, mesNum] = mes.split('-');
  let nombreMes = new Date(parseInt(anio), parseInt(mesNum) - 1, 1).toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });
  nombreMes = nombreMes.charAt(0).toUpperCase() + nombreMes.slice(1);

  document.getElementById('bit-ficha-metricas').innerHTML = `
    <div class="ficha-section">
      <div class="ficha-sec-title">${nombreMes}</div>
      <div style="display:flex;gap:10px;margin-top:6px">
        ${(_bitEquipoPorId(patente) || {}).esGenerador ? '' : `<div style="flex:1;background:var(--accent-soft);border-radius:12px;padding:12px;text-align:center">
          <div style="font-size: 22px;font-weight:800;color:var(--accent-dark)">${m.kmRecorridos.toLocaleString('es-CL')}</div>
          <div style="font-size: 12.5px;color:var(--ink-soft)">${t.unidadLarga} recorridos</div>
        </div>`}
        <div style="flex:1;background:var(--accent-soft);border-radius:12px;padding:12px;text-align:center">
          <div style="font-size: 22px;font-weight:800;color:var(--accent-dark)">${m.litros.toLocaleString('es-CL')}</div>
          <div style="font-size: 12.5px;color:var(--ink-soft)">litros cargados</div>
        </div>
        <div style="flex:1;background:var(--accent-soft);border-radius:12px;padding:12px;text-align:center">
          <div style="font-size: 22px;font-weight:800;color:var(--accent-dark)">${m.rendimiento ? m.rendimiento.toFixed(1) : '—'}</div>
          <div style="font-size: 12.5px;color:var(--ink-soft)">${t.rendimiento}</div>
        </div>
      </div>
      ${m.rendimiento === null && m.motivoSinRendimiento ? `<div style="font-size:13px;color:var(--ink-soft);margin-top:8px">ℹ️ ${m.motivoSinRendimiento}</div>` : ''}
    </div>
  `;

  const bannerEl = document.getElementById('bit-ficha-en-curso');
  if (bannerEl) {
    const vc = _bitViajeEnCurso(patente);
    bannerEl.innerHTML = vc ? `<div class="bit-banner-curso">
      <div><strong>Viaje en curso</strong>${vc.destino ? ' a ' + vc.destino : ''}</div>
      <div style="font-size:13.5px;margin:2px 0 8px">Desde ${_bitFormatearFecha(vc.fecha)} · ${t.unidadLargaCap} inicial: ${vc.kmInicial.toLocaleString('es-CL')}${vc.chofer ? ' · ' + vc.chofer : ''}</div>
      <button class="action-btn" style="margin-top:0;width:100%;background:var(--accent);color:#fff;border:none" onclick="bitAbrirCerrarViaje(${vc.rowIndex})">Cerrar recorrido</button>
    </div>` : '';
  }
  if (typeof chkRenderBanner === 'function') chkRenderBanner(patente);
  _bitRenderUso(patente, t);
  const viajesVehiculo = allBitacora.filter(b => b.patente === patente);
  const kmDeViajes = viajesVehiculo.map(v => Math.max(0, v.kmFinal - v.kmInicial)).filter(k => k > 0);
  const kmPromedioViajes = kmDeViajes.length ? kmDeViajes.reduce((x, y) => x + y, 0) / kmDeViajes.length : 0;
  const eventos = [
    ...viajesVehiculo.map(b => ({ ...b, _tipo: 'viaje' })),
    ...allCombustible.filter(c => c.patente === patente).map(c => ({ ...c, _tipo: 'combustible' })),
    ...(typeof allChecklist !== 'undefined' ? allChecklist : []).filter(c => c.patente === patente).map(c => ({ ...c, _tipo: 'checklist' }))
  ].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '') || b.rowIndex - a.rowIndex);

  const cont = document.getElementById('bit-ficha-historial');
  if (!eventos.length) {
    cont.innerHTML = emptyState('Sin registros', 'Todavía no hay viajes ni cargas de combustible para este vehículo');
    return;
  }

  // Rendimiento de CADA llenado COMPLETO del estanque (el tramo desde el
  // llenado completo anterior, sumando los litros de cualquier carga
  // parcial que haya quedado en el medio) — mismo método que
  // _bitMetricasVehiculo(), pero guardando el resultado de cada tramo
  // para mostrarlo en el historial. Las cargas parciales (estanque no
  // quedó lleno) no tienen un rendimiento propio — se muestran solo como
  // "carga parcial", sin numerito, porque calcularles uno individual
  // sería inventar un dato que no se puede saber.
  const cargasOrdenadas = allCombustible.filter(c => c.patente === patente && c.km > 0).sort((a, b) => a.km - b.km);
  const rendimientoPorCarga = {}; // rowIndex del llenado completo -> { delta, litros, rendimiento }
  const rendimientosValidos = [];
  let anclaIdx = 0;
  let litrosPendientes = 0;
  for (let i = 1; i < cargasOrdenadas.length; i++) {
    const c = cargasOrdenadas[i];
    litrosPendientes += c.litros;
    if (!c.lleno) continue; // parcial: se acumula, se cierra el tramo más adelante
    const anterior = cargasOrdenadas[anclaIdx];
    const delta = c.km - anterior.km;
    if (delta > 0 && litrosPendientes > 0) {
      const rendimiento = delta / litrosPendientes;
      rendimientoPorCarga[c.rowIndex] = { delta, litros: litrosPendientes, rendimiento };
      rendimientosValidos.push(rendimiento);
    }
    anclaIdx = i;
    litrosPendientes = 0;
  }
  const rendimientoPromedioGeneral = rendimientosValidos.length
    ? rendimientosValidos.reduce((a, b) => a + b, 0) / rendimientosValidos.length
    : 0;

  cont.innerHTML = eventos.map(ev => {
    if (ev._tipo === 'checklist') {
      const okChk = ev.nFallas === 0;
      return `<div class="evento-card-mini" style="cursor:pointer" onclick="chkAbrirDetalle(${ev.rowIndex})">
      <div class="evento-tipo-icon" style="background:linear-gradient(135deg,${okChk ? '#16a34a,#15803d' : '#dc2626,#b91c1c'})">
        <svg viewBox="0 0 24 24" fill="none" class="equipo-svg"><path d="M5 12.5l4.2 4.2L19 7" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </div>
      <div class="mant-body">
        <div class="mant-title">Checklist de inicio <span class="badge ${okChk ? 'green' : 'red'}" style="margin-left:6px;vertical-align:middle">${okChk ? 'Todo OK' : ev.nFallas + (ev.nFallas === 1 ? ' falla' : ' fallas')}</span></div>
        <div class="mant-meta">${_bitFormatearFecha(ev.fecha)} ${ev.hora || ''}${ev.medicion !== '' && ev.medicion != null ? ' · ' + ev.medicion + ' ' + t.unidadCorta : ''}</div>
        ${ev.chofer ? `<div class="evento-desc">Hecho por: ${ev.chofer}</div>` : ''}
      </div>
    </div>`;
    }
    if (ev._tipo === 'viaje' && ev.enCurso) {
      return `<div class="evento-card-mini">
      <div class="evento-tipo-icon" style="background:linear-gradient(135deg,#16a34a,#15803d)">
        <svg viewBox="0 0 24 24" fill="none" class="equipo-svg"><path d="M12 21s-6-5.5-6-10a6 6 0 0 1 12 0c0 4.5-6 10-6 10z" stroke="white" stroke-width="1.7" stroke-linejoin="round"/><circle cx="12" cy="11" r="2" stroke="white" stroke-width="1.7"/></svg>
      </div>
      <div class="mant-body">
        <div class="mant-title">Viaje${ev.destino ? ' a ' + ev.destino : ''} <span class="badge green" style="margin-left:6px;vertical-align:middle">En curso</span></div>
        <div class="mant-meta">${_bitFormatearFecha(ev.fecha)} · desde ${ev.kmInicial.toLocaleString('es-CL')} ${t.unidadCorta} · falta registrar el final</div>
        ${ev.chofer ? `<div class="evento-desc">Chofer: ${ev.chofer}</div>` : ''}
      </div>
    </div>`;
    }
    if (ev._tipo === 'viaje') {
      const recorrido = Math.max(0, ev.kmFinal - ev.kmInicial);
      const largo = kmPromedioViajes > 0 && kmDeViajes.length >= 3 && recorrido >= kmPromedioViajes * 1.5;
      return `<div class="evento-card-mini">
      <div class="evento-tipo-icon" style="background:linear-gradient(135deg,#3b82f6,#1d4ed8)">
        <svg viewBox="0 0 24 24" fill="none" class="equipo-svg"><path d="M12 21s-6-5.5-6-10a6 6 0 0 1 12 0c0 4.5-6 10-6 10z" stroke="white" stroke-width="1.7" stroke-linejoin="round"/><circle cx="12" cy="11" r="2" stroke="white" stroke-width="1.7"/></svg>
      </div>
      <div class="mant-body">
        <div class="mant-title">Viaje${ev.destino ? ' a ' + ev.destino : ''}
          <span style="font-weight:800;color:var(--accent-dark)">· ${recorrido.toLocaleString('es-CL')} ${t.unidadCorta}</span>
          ${largo ? `<span class="badge" style="margin-left:6px;vertical-align:middle">Más largo de lo normal</span>` : ''}
        </div>
        <div class="mant-meta">${_bitFormatearFecha(ev.fecha)} · ${ev.kmInicial.toLocaleString('es-CL')} → ${ev.kmFinal.toLocaleString('es-CL')} ${t.unidadCorta}</div>
        ${ev.chofer ? `<div class="evento-desc">Chofer: ${ev.chofer}</div>` : ''}
      </div>
    </div>`;
    }
    // Rendimiento de ESTE llenado completo (contra el llenado completo
    // anterior, arrastrando lo que se cargó en el medio) — si rindió
    // bastante menos que el promedio del vehículo (70% o menos), se marca
    // en rojo.
    const rc = rendimientoPorCarga[ev.rowIndex];
    const rindeMalEstaCarga = rc && rendimientoPromedioGeneral > 0 && rc.rendimiento <= rendimientoPromedioGeneral * 0.7;
    const esParcial = ev.lleno === false;
    return `<div class="evento-card-mini">
      <div class="evento-tipo-icon" style="background:linear-gradient(135deg,#f59e0b,#d97706)">
        <svg viewBox="0 0 24 24" fill="none" class="equipo-svg"><path d="M6 21V7a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v14" stroke="white" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 10h1.5a1 1 0 0 1 1 1v2.5a1.5 1.5 0 0 0 3 0V9.5L17 7" stroke="white" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 21h12" stroke="white" stroke-width="1.7" stroke-linecap="round"/></svg>
      </div>
      <div class="mant-body">
        <div class="mant-title">Carga de combustible
          ${rc ? `<span style="font-weight:800;color:${rindeMalEstaCarga ? '#c0392b' : 'var(--accent-dark)'}">· ${rc.rendimiento.toFixed(1)} ${t.unidadCorta}/L</span>` : ''}
          ${rindeMalEstaCarga ? `<span class="badge red" style="margin-left:6px;vertical-align:middle">Rindió poco</span>` : ''}
          ${esParcial ? `<span class="badge" style="margin-left:6px;vertical-align:middle;background:#eef0f3;color:var(--ink-soft)">Estanque no quedó lleno</span>` : ''}
        </div>
        <div class="mant-meta">${_bitFormatearFecha(ev.fecha)} · ${ev.km.toLocaleString('es-CL')} ${t.unidadCorta} · ${ev.litros} L${
          rc ? ` · ${rc.delta.toLocaleString('es-CL')} ${t.unidadCorta} desde el llenado completo anterior (${rc.litros} L en total, incluye cargas parciales en el medio)`
          : (esParcial ? ' · rendimiento se calcula cuando se complete el estanque de nuevo' : ' · primera carga registrada, sin anterior con qué comparar')
        }</div>
        ${ev.chofer ? `<div class="evento-desc">${(_bitEquipoPorId(patente) || {}).esGenerador ? 'Persona encargada' : 'Chofer'}: ${ev.chofer}</div>` : ''}
      </div>
    </div>`;
  }).join('');
}

// Último km conocido de un vehículo (el más reciente entre el fin de su
// último viaje y su última carga), para precargar el km inicial del
// próximo viaje o el km actual de la próxima carga.
function _bitUltimoKmConocido(patente) {
  const viajes = allBitacora.filter(b => b.patente === patente).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '') || b.rowIndex - a.rowIndex);
  const cargas = allCombustible.filter(c => c.patente === patente).sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '') || b.rowIndex - a.rowIndex);
  const candidatos = [];
  if (viajes[0]) candidatos.push({ fecha: viajes[0].fecha, km: viajes[0].enCurso ? viajes[0].kmInicial : viajes[0].kmFinal });
  if (cargas[0]) candidatos.push({ fecha: cargas[0].fecha, km: cargas[0].km });
  if (!candidatos.length) {
    // Sin registros todavía: para un generador se parte del horómetro de su ficha de Inventario
    const eqG = _bitEquipoPorId(patente);
    return (eqG && eqG.esGenerador) ? (_parseNumeroSheet(eqG.horometro) || 0) : 0;
  }
  candidatos.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  return candidatos[0].km;
}

// ── Registrar viaje ──────────────────────────────────────────
// ── Cerrar un viaje en curso ─────────────────────────────────
function bitAbrirCerrarViaje(rowIndex) {
  if (_bitSoloLectura()) { toast('Sin permisos para registrar', 'error'); return; }
  const v = allBitacora.find(b => b.rowIndex === rowIndex);
  if (!v) return;
  const t = _bitTextos(v.patente);
  document.getElementById('bit-cerrar-row').value = rowIndex;
  document.getElementById('bit-cerrar-resumen').textContent = `${v.patente} · desde ${_bitFormatearFecha(v.fecha)} · ${t.unidadLarga} inicial: ${v.kmInicial.toLocaleString('es-CL')}`;
  document.getElementById('bit-cerrar-kmf-label').textContent = `${t.unidadLargaCap} final`;
  document.getElementById('bit-cerrar-kmf').value = '';
  document.getElementById('bit-cerrar-kmf').placeholder = t.unidadLarga === 'horas' ? 'Ej: 1215,5' : 'Ej: 45350';
  document.getElementById('bit-cerrar-destino').value = v.destino || '';
  openPanel('panel-bit-cerrar');
}

async function bitGuardarCierreViaje() {
  const rowIndex = parseInt(document.getElementById('bit-cerrar-row').value);
  const kmf = _parseNumeroSheet(document.getElementById('bit-cerrar-kmf').value);
  const destino = document.getElementById('bit-cerrar-destino').value.trim();
  const btn = document.querySelector('#panel-bit-cerrar .pnl-action');
  if (btn && btn.disabled) return;
  if (btn) btnEstado(btn, 'cargando');
  try {
    // Se vuelve a leer la hoja antes de cerrar: por si otra persona ya lo cerró.
    await loadBitacora();
    const v = allBitacora.find(b => b.rowIndex === rowIndex);
    if (!v) throw new Error('No se encontró el viaje');
    if (!v.enCurso) throw new Error('Este viaje ya fue cerrado por otra persona');
    if (isNaN(kmf)) throw new Error('Escribe el valor final');
    if (kmf < v.kmInicial) throw new Error('El valor final no puede ser menor al inicial (' + v.kmInicial.toLocaleString('es-CL') + ')');
    await writeSheet(`'${CONFIG.SHEET_BITACORA}'!E${rowIndex}:F${rowIndex}`, [[kmf, destino]]);
    toast('✓ Viaje cerrado');
    if (btn) btnEstado(btn, 'ok');
    _origClosePanel('panel-bit-cerrar');
    const idx = _panelStack.lastIndexOf('panel-bit-cerrar');
    if (idx !== -1) _panelStack.splice(idx, 1);
    await loadBitacora();
    bitRenderMetricasYHistorial();
    bitRenderLista();
  } catch(e) {
    toast('Error: ' + e.message, 'error');
  } finally {
    if (btn) btnEstado(btn, 'reset');
  }
}

function bitAbrirViaje(checklistRecienHecho) {
  if (_bitSoloLectura()) { toast('Sin permisos para registrar', 'error'); return; }
  const patente = _bitPatenteActual;
  // Antes de iniciar un viaje / trabajo se revisa el estado del vehículo:
  // si hoy todavía no tiene checklist, se hace primero (y al guardarlo se
  // abre el formulario del viaje).
  if (!checklistRecienHecho && typeof chkRequerido === 'function' && chkRequerido(patente)) {
    toast('Primero haz el checklist de inicio', 'info');
    chkAbrir({ luegoViaje: true });
    return;
  }
  const eq = _bitEquipoPorId(patente);
  const nombre = eq ? ([eq.marca, eq.modelo].filter(Boolean).join(' ') || eq.equipo) : patente;
  const t = _bitTextos(patente);

  document.getElementById('bit-viaje-patente').value = patente;
  document.getElementById('bit-viaje-vehiculo').textContent = `${nombre} — ${patente}`;
  document.getElementById('bit-viaje-fecha').value = new Date().toISOString().slice(0, 10);
  document.getElementById('bit-viaje-kmi').value = _numeroParaInput(_bitUltimoKmConocido(patente));
  document.getElementById('bit-viaje-kmf').value = '';
  document.getElementById('bit-viaje-destino').value = '';
  document.getElementById('bit-viaje-chofer').value = '';
  document.getElementById('bit-viaje-kmi-label').textContent = `${t.unidadLargaCap} inicial`;
  document.getElementById('bit-viaje-kmf-label').innerHTML = `${t.unidadLargaCap} final <span style="font-weight:400;color:var(--ink-soft)">(déjalo vacío si el viaje sigue en curso)</span>`;
  document.getElementById('bit-viaje-kmi').placeholder = t.unidadLarga === 'horas' ? 'Ej: 1200,5' : 'Ej: 45200';
  document.getElementById('bit-viaje-kmf').placeholder = t.unidadLarga === 'horas' ? 'Ej: 1215,5' : 'Ej: 45350';

  openPanel('panel-bit-viaje');
}

async function bitGuardarViaje() {
  const patente = document.getElementById('bit-viaje-patente').value;
  const fecha   = document.getElementById('bit-viaje-fecha').value;
  const kmi     = _parseNumeroSheet(document.getElementById('bit-viaje-kmi').value);
  const kmf     = _parseNumeroSheet(document.getElementById('bit-viaje-kmf').value);
  const destino = document.getElementById('bit-viaje-destino').value.trim();
  const chofer  = document.getElementById('bit-viaje-chofer').value.trim();

  if (!fecha)               { toast('La fecha es obligatoria', 'error'); return; }
  const sinFinal = isNaN(kmf);
  if (isNaN(kmi)) { toast('Completa el valor inicial', 'error'); return; }
  if (!sinFinal && kmf < kmi) { toast('El valor final no puede ser menor al inicial', 'error'); return; }
  if (sinFinal && _bitViajeEnCurso(patente)) { toast('Este vehículo ya tiene un viaje en curso: ciérralo primero (botón "Cerrar recorrido")', 'error'); return; }
  if (!chofer)               { toast('Indica quién maneja', 'error'); return; }

  const btn = document.querySelector('#panel-bit-viaje .pnl-action');
  if (btn) btnEstado(btn, 'cargando');
  try {
    await _bitAsegurarHojas();
    const id = 'BIT-' + Date.now();
    await appendSheet(`'${CONFIG.SHEET_BITACORA}'!A:H`, [[id, fecha, patente, kmi, sinFinal ? '' : kmf, destino, chofer, (typeof userEmail !== 'undefined' ? userEmail : '')]]);
    toast(sinFinal ? '✓ Viaje iniciado: queda en curso hasta que registres el final' : '✓ Viaje registrado');
    if (btn) btnEstado(btn, 'ok');
    _origClosePanel('panel-bit-viaje');
    const idx = _panelStack.lastIndexOf('panel-bit-viaje');
    if (idx !== -1) _panelStack.splice(idx, 1);
    await loadBitacora();
    bitRenderMetricasYHistorial();
    bitRenderLista();
  } catch(e) {
    toast('Error: ' + e.message, 'error');
  } finally {
    if (btn) btnEstado(btn, 'reset');
  }
}

// ── Registrar combustible ────────────────────────────────────
// Junta los nombres de chofer ya usados en cargas anteriores (de este
// vehículo y de cualquier otro) para sugerirlos al escribir — así, si
// alguien ya escribió "Carlos Breve" antes, la próxima vez alcanza con
// tocar la sugerencia en vez de tipear el nombre de nuevo (y arriesgarse
// a escribirlo con una letra distinta, lo que después hace difícil
// filtrar por esa persona en la planilla). Si para la misma persona hay
// variantes distintas guardadas de antes (typos ya cometidos), se sugiere
// la que más veces se usó — así un error ocasional no le gana a la forma
// correcta.
function _bitPoblarChoferesConocidos() {
  const porClave = {}; // nombre en minúsculas -> { 'Forma exacta': cantidad de veces }
  (allCombustible || []).forEach(c => {
    const nombre = (c.chofer || '').toString().trim();
    if (!nombre) return;
    const clave = nombre.toLowerCase();
    if (!porClave[clave]) porClave[clave] = {};
    porClave[clave][nombre] = (porClave[clave][nombre] || 0) + 1;
  });
  const nombres = Object.values(porClave)
    .map(variantes => Object.entries(variantes).sort((a, b) => b[1] - a[1])[0][0])
    .sort((a, b) => a.localeCompare(b, 'es'));

  const dl = document.getElementById('bit-comb-choferes-lista');
  if (dl) dl.innerHTML = nombres.map(n => `<option value="${n.replace(/"/g, '&quot;')}"></option>`).join('');
}

function bitAbrirCombustible() {
  if (_bitSoloLectura()) { toast('Sin permisos para registrar', 'error'); return; }
  const patente = _bitPatenteActual;
  const eq = _bitEquipoPorId(patente);
  const nombre = eq ? ([eq.marca, eq.modelo].filter(Boolean).join(' ') || eq.equipo) : patente;
  const t = _bitTextos(patente);

  document.getElementById('bit-comb-patente').value = patente;
  document.getElementById('bit-comb-vehiculo').textContent = `${nombre} — ${patente}`;
  document.getElementById('bit-comb-fecha').value = new Date().toISOString().slice(0, 10);
  document.getElementById('bit-comb-km').value = _numeroParaInput(_bitUltimoKmConocido(patente));
  document.getElementById('bit-comb-litros').value = '';
  document.getElementById('bit-comb-chofer').value = '';
  const esGenC = !!(eq && eq.esGenerador);
  document.getElementById('bit-comb-chofer-label').textContent = esGenC ? 'Persona encargada' : 'Chofer';
  document.getElementById('bit-comb-chofer').placeholder = esGenC ? 'Nombre de la persona encargada' : 'Nombre de quien maneja';
  document.getElementById('bit-comb-lleno').checked = true;
  document.getElementById('bit-comb-km-label').textContent = `${t.unidadLargaCap} actual`;
  document.getElementById('bit-comb-km').placeholder = t.unidadLarga === 'horas' ? 'Ej: 1215' : 'Ej: 45350';
  _bitPoblarChoferesConocidos();

  openPanel('panel-bit-combustible');
}

// Devuelve la forma "oficial" ya guardada de un nombre de chofer si existe
// una coincidencia (sin importar mayúsculas/tildes exactas) en el
// historial, o el nombre tal cual si es nuevo. Se usa al guardar para que
// aunque alguien no haya tocado la sugerencia y haya escrito el nombre a
// mano, igual quede guardado con el mismo formato que ya se venía usando.
function _bitNombreCanonicoChofer(nombreEscrito) {
  const clave = nombreEscrito.toLowerCase();
  const variantes = {};
  (allCombustible || []).forEach(c => {
    const nombre = (c.chofer || '').toString().trim();
    if (nombre.toLowerCase() === clave) variantes[nombre] = (variantes[nombre] || 0) + 1;
  });
  const opciones = Object.entries(variantes).sort((a, b) => b[1] - a[1]);
  return opciones.length ? opciones[0][0] : nombreEscrito;
}

async function bitGuardarCombustible() {
  const patente = document.getElementById('bit-comb-patente').value;
  const fecha   = document.getElementById('bit-comb-fecha').value;
  const km      = _parseNumeroSheet(document.getElementById('bit-comb-km').value);
  const litros  = _parseNumeroSheet(document.getElementById('bit-comb-litros').value);
  const choferEscrito = document.getElementById('bit-comb-chofer').value.trim();
  const chofer  = choferEscrito ? _bitNombreCanonicoChofer(choferEscrito) : '';
  const lleno   = document.getElementById('bit-comb-lleno').checked;

  if (!fecha)                    { toast('La fecha es obligatoria', 'error'); return; }
  if (isNaN(km))                 { toast('Completa el km actual', 'error'); return; }
  if (isNaN(litros) || litros <= 0) { toast('Completa los litros cargados', 'error'); return; }
  if (!chofer)                   { toast((_bitEquipoPorId(patente) || {}).esGenerador ? 'Indica la persona encargada' : 'Indica quién maneja', 'error'); return; }

  const btn = document.querySelector('#panel-bit-combustible .pnl-action');
  if (btn) btnEstado(btn, 'cargando');
  try {
    await _bitAsegurarHojas();
    const id = 'COMB-' + Date.now();
    await appendSheet(`'${CONFIG.SHEET_COMBUSTIBLE}'!A:H`, [[id, _bitFechaParaGuardar(fecha), patente, km, litros, chofer, (typeof userEmail !== 'undefined' ? userEmail : ''), lleno ? 'SI' : 'NO']]);
    toast('✓ Carga de combustible registrada');
    if (btn) btnEstado(btn, 'ok');
    _origClosePanel('panel-bit-combustible');
    const idx = _panelStack.lastIndexOf('panel-bit-combustible');
    if (idx !== -1) _panelStack.splice(idx, 1);
    await loadCombustible();
    bitRenderMetricasYHistorial();
    bitRenderLista();
  } catch(e) {
    toast('Error: ' + e.message, 'error');
  } finally {
    if (btn) btnEstado(btn, 'reset');
  }
}
