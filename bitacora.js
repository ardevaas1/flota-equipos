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

// Algunos equipos (generadores, cierta maquinaria) se miden por horómetro
// (horas), no por kilometraje — se marca por vehículo en la ficha de Flota
// (campo "Unidad de medida"). Todo lo que se muestra en Bitácora se adapta
// según esto: "Km inicial/final" vs "Horas inicial/final", "km recorridos"
// vs "horas trabajadas", etc. Por defecto (equipo no encontrado, o sin el
// campo cargado) se asume KM, que es el caso más común.
function _bitUnidad(patente) {
  const eq = (typeof allEquipos !== 'undefined' ? allEquipos : []).find(e => e.patente === patente);
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
        kmInicial:     parseFloat(r[3]) || 0,
        kmFinal:       parseFloat(r[4]) || 0,
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
        fecha:         r[1] || '',
        patente:       (r[2] || '').toUpperCase(),
        km:            parseFloat(r[3]) || 0,
        litros:        parseFloat(r[4]) || 0,
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
    await Promise.all([loadBitacora(), loadCombustible()]);
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
  let anclaIdx = 0;       // índice de la última carga usada como punto de referencia (llenado completo, o la primera carga del historial si todavía no hay ninguno)
  let litrosPendientes = 0; // litros acumulados desde el ancla, en espera de que llegue el próximo llenado completo
  for (let i = 1; i < todasLasCargas.length; i++) {
    const c = todasLasCargas[i];
    litrosPendientes += c.litros;
    if (!c.lleno) continue; // carga parcial: se suma a lo pendiente, pero todavía no se puede cerrar el tramo
    const anterior = todasLasCargas[anclaIdx];
    const delta = c.km - anterior.km;
    if (delta > 0 && (!mes || _bitEsDelMes(c.fecha, mes))) {
      kmEntreCargas += delta;
      litrosConDelta += litrosPendientes;
    }
    anclaIdx = i;
    litrosPendientes = 0;
  }
  const rendimiento = litrosConDelta > 0 ? (kmEntreCargas / litrosConDelta) : null;

  return { kmRecorridos, litros, rendimiento, nViajes: viajes.length, nCargas: cargasDelMes.length };
}

function bitRenderLista() {
  const cont   = document.getElementById('bit-lista');
  const contDt = document.getElementById('bit-dt-lista');
  if (!cont && !contDt) return;
  const txt = (document.getElementById('bit-search')?.value || '').toLowerCase();
  const mes = _bitMesSeleccionado || _bitMesActual();

  // Sin ordenar de nuevo: allEquipos ya viene en el mismo orden en que las
  // filas aparecen en la hoja MAQUINARIA (así se pidió específicamente).
  let vehiculos = (typeof allEquipos !== 'undefined' ? allEquipos : []).slice();
  if (txt) {
    vehiculos = vehiculos.filter(e => ((e.patente || '') + (e.marca || '') + (e.modelo || '')).toLowerCase().includes(txt));
  }

  let html;
  if (!vehiculos.length) {
    html = emptyState('Sin vehículos', 'No hay vehículos cargados en Flota todavía');
  } else {
    html = vehiculos.map(eq => {
      const m = _bitMetricasVehiculo(eq.patente, mes);
      const nombre = [eq.marca, eq.modelo].filter(Boolean).join(' ') || eq.equipo || eq.patente;
      return `<div class="card" onclick="bitAbrirFicha('${eq.patente}')">
        ${eq.fotoRef
          ? `<img class="card-photo" src="${eq.fotoRef}" alt="Foto de ${nombre}" loading="lazy">`
          : `<div class="card-icon">${_BIT_ICONO_VEHICULO}</div>`}
        <div class="card-body">
          <div class="card-title">${nombre}</div>
          <div class="card-sub card-sub--patente">${eq.patente}</div>
        </div>
        <div class="card-right">
          <span style="font-size: 13.5px;color:var(--ink-soft);text-align:right;line-height:1.5">${m.litros.toLocaleString('es-CL')} L<br>este mes</span>
        </div>
      </div>`;
    }).join('');
  }
  if (cont)   cont.innerHTML   = html;
  if (contDt) contDt.innerHTML = html;
  _actualizarContadorBuscador(['bit-search', 'bit-dt-search'], vehiculos.length);
}

function bitAbrirFicha(patente) {
  _bitPatenteActual = patente;
  const eq = (typeof allEquipos !== 'undefined' ? allEquipos : []).find(e => e.patente === patente);
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
        <div style="flex:1;background:var(--accent-soft);border-radius:12px;padding:12px;text-align:center">
          <div style="font-size: 22px;font-weight:800;color:var(--accent-dark)">${m.litros.toLocaleString('es-CL')}</div>
          <div style="font-size: 12.5px;color:var(--ink-soft)">litros cargados</div>
        </div>
        <div style="flex:1;background:var(--accent-soft);border-radius:12px;padding:12px;text-align:center">
          <div style="font-size: 22px;font-weight:800;color:var(--accent-dark)">${m.rendimiento ? m.rendimiento.toFixed(1) : '—'}</div>
          <div style="font-size: 12.5px;color:var(--ink-soft)">${t.rendimiento}</div>
        </div>
      </div>
    </div>
  `;

  // La parte de "viajes" (Bitácora propiamente dicha) está escondida por
  // ahora — no se estaba usando. Se deja allBitacora/bitAbrirViaje() sin
  // tocar por si se retoma más adelante; acá simplemente no se incluyen
  // esos registros en el historial ni en las métricas.
  const eventos = allCombustible.filter(c => c.patente === patente)
    .map(c => ({ ...c, _tipo: 'combustible' }))
    .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '') || b.rowIndex - a.rowIndex);

  const cont = document.getElementById('bit-ficha-historial');
  if (!eventos.length) {
    cont.innerHTML = emptyState('Sin registros', 'Todavía no hay cargas de combustible para este vehículo');
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
        <div class="mant-meta">${ev.fecha} · ${ev.km.toLocaleString('es-CL')} ${t.unidadCorta} · ${ev.litros} L${
          rc ? ` · ${rc.delta.toLocaleString('es-CL')} ${t.unidadCorta} desde el llenado completo anterior (${rc.litros} L en total, incluye cargas parciales en el medio)`
          : (esParcial ? ' · rendimiento se calcula cuando se complete el estanque de nuevo' : ' · primera carga registrada, sin anterior con qué comparar')
        }</div>
        ${ev.chofer ? `<div class="evento-desc">Chofer: ${ev.chofer}</div>` : ''}
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
  if (viajes[0]) candidatos.push({ fecha: viajes[0].fecha, km: viajes[0].kmFinal });
  if (cargas[0]) candidatos.push({ fecha: cargas[0].fecha, km: cargas[0].km });
  if (!candidatos.length) return 0;
  candidatos.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
  return candidatos[0].km;
}

// ── Registrar viaje ──────────────────────────────────────────
function bitAbrirViaje() {
  if (_bitSoloLectura()) { toast('Sin permisos para registrar', 'error'); return; }
  const patente = _bitPatenteActual;
  const eq = (typeof allEquipos !== 'undefined' ? allEquipos : []).find(e => e.patente === patente);
  const nombre = eq ? ([eq.marca, eq.modelo].filter(Boolean).join(' ') || eq.equipo) : patente;
  const t = _bitTextos(patente);

  document.getElementById('bit-viaje-patente').value = patente;
  document.getElementById('bit-viaje-vehiculo').textContent = `${nombre} — ${patente}`;
  document.getElementById('bit-viaje-fecha').value = new Date().toISOString().slice(0, 10);
  document.getElementById('bit-viaje-kmi').value = _bitUltimoKmConocido(patente) || '';
  document.getElementById('bit-viaje-kmf').value = '';
  document.getElementById('bit-viaje-destino').value = '';
  document.getElementById('bit-viaje-chofer').value = '';
  document.getElementById('bit-viaje-kmi-label').textContent = `${t.unidadLargaCap} inicial`;
  document.getElementById('bit-viaje-kmf-label').textContent = `${t.unidadLargaCap} final`;
  document.getElementById('bit-viaje-kmi').placeholder = t.unidadLarga === 'horas' ? 'Ej: 1200' : 'Ej: 45200';
  document.getElementById('bit-viaje-kmf').placeholder = t.unidadLarga === 'horas' ? 'Ej: 1215' : 'Ej: 45350';

  openPanel('panel-bit-viaje');
}

async function bitGuardarViaje() {
  const patente = document.getElementById('bit-viaje-patente').value;
  const fecha   = document.getElementById('bit-viaje-fecha').value;
  const kmi     = parseFloat(document.getElementById('bit-viaje-kmi').value);
  const kmf     = parseFloat(document.getElementById('bit-viaje-kmf').value);
  const destino = document.getElementById('bit-viaje-destino').value.trim();
  const chofer  = document.getElementById('bit-viaje-chofer').value.trim();

  if (!fecha)               { toast('La fecha es obligatoria', 'error'); return; }
  if (isNaN(kmi) || isNaN(kmf)) { toast('Completa el km inicial y final', 'error'); return; }
  if (kmf < kmi)             { toast('El km final no puede ser menor al km inicial', 'error'); return; }
  if (!chofer)               { toast('Indica quién maneja', 'error'); return; }

  const btn = document.querySelector('#panel-bit-viaje .pnl-action');
  if (btn) btnEstado(btn, 'cargando');
  try {
    await _bitAsegurarHojas();
    const id = 'BIT-' + Date.now();
    await appendSheet(`'${CONFIG.SHEET_BITACORA}'!A:H`, [[id, fecha, patente, kmi, kmf, destino, chofer, (typeof userEmail !== 'undefined' ? userEmail : '')]]);
    toast('✓ Viaje registrado');
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
  const eq = (typeof allEquipos !== 'undefined' ? allEquipos : []).find(e => e.patente === patente);
  const nombre = eq ? ([eq.marca, eq.modelo].filter(Boolean).join(' ') || eq.equipo) : patente;
  const t = _bitTextos(patente);

  document.getElementById('bit-comb-patente').value = patente;
  document.getElementById('bit-comb-vehiculo').textContent = `${nombre} — ${patente}`;
  document.getElementById('bit-comb-fecha').value = new Date().toISOString().slice(0, 10);
  document.getElementById('bit-comb-km').value = _bitUltimoKmConocido(patente) || '';
  document.getElementById('bit-comb-litros').value = '';
  document.getElementById('bit-comb-chofer').value = '';
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
  const km      = parseFloat(document.getElementById('bit-comb-km').value);
  const litros  = parseFloat(document.getElementById('bit-comb-litros').value);
  const choferEscrito = document.getElementById('bit-comb-chofer').value.trim();
  const chofer  = choferEscrito ? _bitNombreCanonicoChofer(choferEscrito) : '';
  const lleno   = document.getElementById('bit-comb-lleno').checked;

  if (!fecha)                    { toast('La fecha es obligatoria', 'error'); return; }
  if (isNaN(km))                 { toast('Completa el km actual', 'error'); return; }
  if (isNaN(litros) || litros <= 0) { toast('Completa los litros cargados', 'error'); return; }
  if (!chofer)                   { toast('Indica quién maneja', 'error'); return; }

  const btn = document.querySelector('#panel-bit-combustible .pnl-action');
  if (btn) btnEstado(btn, 'cargando');
  try {
    await _bitAsegurarHojas();
    const id = 'COMB-' + Date.now();
    await appendSheet(`'${CONFIG.SHEET_COMBUSTIBLE}'!A:H`, [[id, fecha, patente, km, litros, chofer, (typeof userEmail !== 'undefined' ? userEmail : ''), lleno ? 'SI' : 'NO']]);
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
