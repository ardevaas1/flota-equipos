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
  return typeof userRole !== 'undefined' && userRole !== 'admin' && userRole !== 'chofer';
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
        await writeSheet(`'${CONFIG.SHEET_COMBUSTIBLE}'!A1:G1`, [['ID','FECHA','PATENTE','KM','LITROS','CHOFER','REGISTRADO_POR']]);
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
    const rows = await fetchSheet(`'${CONFIG.SHEET_COMBUSTIBLE}'!A2:G5000`);
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
  const cargas = allCombustible.filter(c => c.patente === patente && (!mes || _bitEsDelMes(c.fecha, mes)));
  const kmRecorridos = viajes.reduce((sum, v) => sum + Math.max(0, v.kmFinal - v.kmInicial), 0);
  const litros = cargas.reduce((sum, c) => sum + c.litros, 0);
  const rendimiento = litros > 0 ? (kmRecorridos / litros) : null;
  return { kmRecorridos, litros, rendimiento, nViajes: viajes.length, nCargas: cargas.length };
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
        <div class="card-icon">${_BIT_ICONO_VEHICULO}</div>
        <div class="card-body">
          <div class="card-title">${nombre}</div>
          <div class="card-sub">${eq.patente}</div>
        </div>
        <div class="card-right">
          <span style="font-size:12px;color:var(--ink-soft);text-align:right;line-height:1.5">${m.kmRecorridos.toLocaleString('es-CL')} km<br>${m.litros.toLocaleString('es-CL')} L</span>
        </div>
      </div>`;
    }).join('');
  }
  if (cont)   cont.innerHTML   = html;
  if (contDt) contDt.innerHTML = html;
}

function bitAbrirFicha(patente) {
  _bitPatenteActual = patente;
  const eq = (typeof allEquipos !== 'undefined' ? allEquipos : []).find(e => e.patente === patente);
  const nombre = eq ? ([eq.marca, eq.modelo].filter(Boolean).join(' ') || eq.equipo) : patente;

  document.getElementById('bit-ficha-header').innerHTML = `
    ${eq && eq.fotoRef ? `
    <div class="ficha-section" style="padding:0;overflow:hidden;border-radius:14px;cursor:pointer;margin-bottom:12px" onclick="abrirFotoRefModal('${patente}')">
      <img src="${eq.fotoRef}" alt="Foto de referencia" style="width:100%;height:190px;object-fit:cover;display:block;border-radius:14px">
    </div>` : ''}
    <div style="font-size:18px;font-weight:800;color:var(--ink)">${nombre}</div>
    <div style="font-size:13px;color:var(--ink-soft);margin-bottom:4px">${patente}</div>
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
  const [anio, mesNum] = mes.split('-');
  let nombreMes = new Date(parseInt(anio), parseInt(mesNum) - 1, 1).toLocaleDateString('es-CL', { month: 'long', year: 'numeric' });
  nombreMes = nombreMes.charAt(0).toUpperCase() + nombreMes.slice(1);

  document.getElementById('bit-ficha-metricas').innerHTML = `
    <div class="ficha-section">
      <div class="ficha-sec-title">${nombreMes}</div>
      <div style="display:flex;gap:10px;margin-top:6px">
        <div style="flex:1;background:var(--accent-soft);border-radius:12px;padding:12px;text-align:center">
          <div style="font-size:21px;font-weight:800;color:var(--accent-dark)">${m.kmRecorridos.toLocaleString('es-CL')}</div>
          <div style="font-size:11px;color:var(--ink-soft)">km recorridos</div>
        </div>
        <div style="flex:1;background:var(--accent-soft);border-radius:12px;padding:12px;text-align:center">
          <div style="font-size:21px;font-weight:800;color:var(--accent-dark)">${m.litros.toLocaleString('es-CL')}</div>
          <div style="font-size:11px;color:var(--ink-soft)">litros cargados</div>
        </div>
        <div style="flex:1;background:var(--accent-soft);border-radius:12px;padding:12px;text-align:center">
          <div style="font-size:21px;font-weight:800;color:var(--accent-dark)">${m.rendimiento ? m.rendimiento.toFixed(1) : '—'}</div>
          <div style="font-size:11px;color:var(--ink-soft)">km / litro</div>
        </div>
      </div>
    </div>
  `;

  const eventos = [
    ...allBitacora.filter(b => b.patente === patente).map(b => ({ ...b, _tipo: 'viaje' })),
    ...allCombustible.filter(c => c.patente === patente).map(c => ({ ...c, _tipo: 'combustible' })),
  ].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '') || b.rowIndex - a.rowIndex);

  const cont = document.getElementById('bit-ficha-historial');
  if (!eventos.length) {
    cont.innerHTML = emptyState('Sin registros', 'Todavía no hay viajes ni cargas de combustible para este vehículo');
    return;
  }

  cont.innerHTML = eventos.map(ev => {
    if (ev._tipo === 'viaje') {
      const km = Math.max(0, ev.kmFinal - ev.kmInicial);
      return `<div class="evento-card-mini">
        <div class="evento-tipo-icon" style="background:linear-gradient(135deg,#6d28d9,#4c1d95)">
          <svg viewBox="0 0 24 24" fill="none" class="equipo-svg"><path d="M3 16V7a1 1 0 0 1 1-1h8v10" stroke="white" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M12 11h4l3.5 3.2V16H12" stroke="white" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><circle cx="7" cy="17" r="1.8" stroke="white" stroke-width="1.7"/><circle cx="17" cy="17" r="1.8" stroke="white" stroke-width="1.7"/></svg>
        </div>
        <div class="mant-body">
          <div class="mant-title">Viaje a ${ev.destino || '—'}</div>
          <div class="mant-meta">${ev.fecha} · ${ev.kmInicial.toLocaleString('es-CL')} → ${ev.kmFinal.toLocaleString('es-CL')} km (${km.toLocaleString('es-CL')} km)</div>
          ${ev.chofer ? `<div class="evento-desc">Chofer: ${ev.chofer}</div>` : ''}
        </div>
      </div>`;
    }
    return `<div class="evento-card-mini">
      <div class="evento-tipo-icon" style="background:linear-gradient(135deg,#f59e0b,#d97706)">
        <svg viewBox="0 0 24 24" fill="none" class="equipo-svg"><path d="M6 21V7a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v14" stroke="white" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 10h1.5a1 1 0 0 1 1 1v2.5a1.5 1.5 0 0 0 3 0V9.5L17 7" stroke="white" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 21h12" stroke="white" stroke-width="1.7" stroke-linecap="round"/></svg>
      </div>
      <div class="mant-body">
        <div class="mant-title">Carga de combustible</div>
        <div class="mant-meta">${ev.fecha} · ${ev.km.toLocaleString('es-CL')} km · ${ev.litros} L</div>
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

  document.getElementById('bit-viaje-patente').value = patente;
  document.getElementById('bit-viaje-vehiculo').textContent = `${nombre} — ${patente}`;
  document.getElementById('bit-viaje-fecha').value = new Date().toISOString().slice(0, 10);
  document.getElementById('bit-viaje-kmi').value = _bitUltimoKmConocido(patente) || '';
  document.getElementById('bit-viaje-kmf').value = '';
  document.getElementById('bit-viaje-destino').value = '';
  document.getElementById('bit-viaje-chofer').value = '';

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
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }
  try {
    await _bitAsegurarHojas();
    const id = 'BIT-' + Date.now();
    await appendSheet(`'${CONFIG.SHEET_BITACORA}'!A:H`, [[id, fecha, patente, kmi, kmf, destino, chofer, (typeof userEmail !== 'undefined' ? userEmail : '')]]);
    toast('✓ Viaje registrado');
    _origClosePanel('panel-bit-viaje');
    const idx = _panelStack.lastIndexOf('panel-bit-viaje');
    if (idx !== -1) _panelStack.splice(idx, 1);
    await loadBitacora();
    bitRenderMetricasYHistorial();
    bitRenderLista();
  } catch(e) {
    toast('Error: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Guardar'; }
  }
}

// ── Registrar combustible ────────────────────────────────────
function bitAbrirCombustible() {
  if (_bitSoloLectura()) { toast('Sin permisos para registrar', 'error'); return; }
  const patente = _bitPatenteActual;
  const eq = (typeof allEquipos !== 'undefined' ? allEquipos : []).find(e => e.patente === patente);
  const nombre = eq ? ([eq.marca, eq.modelo].filter(Boolean).join(' ') || eq.equipo) : patente;

  document.getElementById('bit-comb-patente').value = patente;
  document.getElementById('bit-comb-vehiculo').textContent = `${nombre} — ${patente}`;
  document.getElementById('bit-comb-fecha').value = new Date().toISOString().slice(0, 10);
  document.getElementById('bit-comb-km').value = _bitUltimoKmConocido(patente) || '';
  document.getElementById('bit-comb-litros').value = '';
  document.getElementById('bit-comb-chofer').value = '';

  openPanel('panel-bit-combustible');
}

async function bitGuardarCombustible() {
  const patente = document.getElementById('bit-comb-patente').value;
  const fecha   = document.getElementById('bit-comb-fecha').value;
  const km      = parseFloat(document.getElementById('bit-comb-km').value);
  const litros  = parseFloat(document.getElementById('bit-comb-litros').value);
  const chofer  = document.getElementById('bit-comb-chofer').value.trim();

  if (!fecha)                    { toast('La fecha es obligatoria', 'error'); return; }
  if (isNaN(km))                 { toast('Completa el km actual', 'error'); return; }
  if (isNaN(litros) || litros <= 0) { toast('Completa los litros cargados', 'error'); return; }
  if (!chofer)                   { toast('Indica quién maneja', 'error'); return; }

  const btn = document.querySelector('#panel-bit-combustible .pnl-action');
  if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }
  try {
    await _bitAsegurarHojas();
    const id = 'COMB-' + Date.now();
    await appendSheet(`'${CONFIG.SHEET_COMBUSTIBLE}'!A:G`, [[id, fecha, patente, km, litros, chofer, (typeof userEmail !== 'undefined' ? userEmail : '')]]);
    toast('✓ Carga de combustible registrada');
    _origClosePanel('panel-bit-combustible');
    const idx = _panelStack.lastIndexOf('panel-bit-combustible');
    if (idx !== -1) _panelStack.splice(idx, 1);
    await loadCombustible();
    bitRenderMetricasYHistorial();
    bitRenderLista();
  } catch(e) {
    toast('Error: ' + e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Guardar'; }
  }
}
