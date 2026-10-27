// ============================================================
// Checklist de inicio de jornada (Bitácora)
// Se completa al empezar a trabajar con una máquina o vehículo: cada punto
// se marca OK / Con falla / No aplica, y se pueden sacar fotos (de cada
// punto y generales). El checklist cambia según el tipo de equipo.
// Hoja: CHECKLIST (se crea sola). Fotos: Drive → [PATENTE]/Checklist.
// ============================================================

let allChecklist = []; // [{ rowIndex, id, fecha(ISO), hora, patente, tipoChk, chofer, medicion, resultado, nFallas, items[], fotosGenerales, obs, registradoPor }]
let _chkPatente = null;
let _chkTipo = null;
let _chkItems = [];        // [{ key, grupo, label, estado: ''|'OK'|'FALLA'|'NA', obs, fotos:[{b64,name,mimeType,previewUrl}] }]
let _chkFotosGenerales = [];
let _chkItemFoto = null;   // key del punto al que se le está sacando foto ('__gen' = generales)
let _chkGuardando = false;
let _chkLuegoViaje = false; // el checklist se abrió como paso previo para iniciar un viaje

const CHK_HEADERS = ['ID','FECHA','HORA','PATENTE','TIPO_CHECKLIST','CHOFER','KM_HORAS','RESULTADO','N_FALLAS','DETALLE','FOTOS_GENERALES','OBSERVACIONES','REGISTRADO_POR'];

// ── Plantillas por tipo de equipo ────────────────────────────
// Grupos reutilizables; cada tipo arma su lista con los grupos que le
// corresponden. Se pueden ajustar los textos acá sin tocar nada más (lo que
// se guarda en la hoja es el texto del punto tal como estaba al registrar).
const CHK_GRUPOS = {
  documentos: ['Documentos', [
    'Permiso de circulación, SOAP y revisión técnica al día',
    'Licencia del conductor / operador vigente',
  ]],
  carroceria: ['Exterior y carrocería', [
    'Sin golpes, abolladuras o daños nuevos (revisar los 4 costados)',
    'Parabrisas y vidrios sin trizaduras',
    'Espejos retrovisores completos y bien ajustados',
    'Patente visible y limpia',
  ]],
  luces: ['Luces y señales', [
    'Luces bajas y altas funcionan',
    'Luces de freno e intermitentes funcionan',
    'Luz de retroceso y baliza (si tiene) funcionan',
    'Bocina funciona',
  ]],
  neumaticosLiv: ['Neumáticos y ruedas', [
    'Presión y desgaste visibles correctos (sin cortes ni globos)',
    'Tuercas de ruedas completas y apretadas',
    'Rueda de repuesto, gata y llave de ruedas',
  ]],
  nivelesVeh: ['Niveles', [
    'Aceite de motor',
    'Refrigerante',
    'Líquido de frenos y de limpiaparabrisas',
    'Combustible suficiente para la jornada',
  ]],
  frenosDir: ['Frenos y dirección', [
    'Freno de servicio firme (pedal no se hunde)',
    'Freno de mano / de estacionamiento sujeta',
    'Dirección sin juego ni ruidos extraños',
  ]],
  seguridadVeh: ['Seguridad', [
    'Cinturones de seguridad funcionan',
    'Extintor cargado y vigente',
    'Botiquín, triángulos y conos',
    'Alarma de retroceso funciona',
  ]],
  cabina: ['Cabina y tablero', [
    'Tablero sin luces de alarma encendidas',
    'Cabina limpia y ordenada (sin objetos sueltos)',
    'Aire / calefacción / desempañador funcionan',
  ]],
  fluidosPesada: ['Niveles y fluidos', [
    'Aceite de motor',
    'Aceite hidráulico',
    'Refrigerante',
    'Combustible suficiente para la jornada',
    'Sin fugas de aceite, combustible o refrigerante bajo la máquina',
  ]],
  hidraulico: ['Sistema hidráulico', [
    'Mangueras y conexiones sin fugas ni cortes',
    'Cilindros sin fugas ni vástagos rayados',
    'Movimientos fluidos (sin tirones ni ruidos)',
  ]],
  ordugas: ['Tren de rodado (orugas)', [
    'Orugas con tensión correcta y sin zapatas sueltas o rotas',
    'Rodillos y ruedas guía sin fugas ni desgaste anormal',
  ]],
  ruedasPesada: ['Neumáticos y ruedas', [
    'Neumáticos sin cortes, presión correcta',
    'Tuercas completas y apretadas',
  ]],
  estructuraBalde: ['Estructura y herramienta de trabajo', [
    'Balde / cuchara: dientes o cuchilla en buen estado',
    'Pasadores y bujes del brazo y balde con seguro',
    'Sin grietas visibles en brazo, pluma o chasis',
  ]],
  seguridadPesada: ['Seguridad y cabina', [
    'Cinturón de seguridad funciona',
    'Alarma de retroceso y baliza funcionan',
    'Luces de trabajo funcionan',
    'Extintor cargado y vigente',
    'Parada de emergencia / bloqueo de palancas funcionan',
    'Espejos, vidrios y cabina limpios',
    'Escalas y pasamanos firmes (3 puntos de apoyo)',
  ]],
  motorGeneral: ['Motor y batería', [
    'Arranca y funciona sin ruidos ni humo anormal',
    'Batería y bornes firmes, sin sulfato',
    'Filtro de aire y radiador limpios',
    'Correas sin grietas ni holgura',
  ]],
  engrase: ['Mantenimiento diario', [
    'Puntos de engrase engrasados',
    'Horómetro / kilometraje anotado',
  ]],
  aireCamion: ['Frenos de aire y enganche', [
    'Presión de aire llega a la normal y no baja rápido (sin fugas)',
    'Mangueras y acoples de aire sin fugas',
    'Quinta rueda / enganche / pasador firmes (si aplica)',
  ]],
  tolva: ['Tolva / carrocería de carga', [
    'Cilindro de levante sin fugas y seguro de tolva funciona',
    'Portalón con cierres y bisagras en buen estado',
    'Lona o cubierta de carga en buen estado',
  ]],
  plumaGrua: ['Pluma / grúa / equipo de izaje', [
    'Estabilizadores extienden, bajan y no tienen fugas',
    'Cables, cadenas y ganchos sin daño; gancho con seguro',
    'Tabla de cargas visible y legible',
    'Limitadores y alarmas de la grúa funcionan',
  ]],
  cargaAmarres: ['Carga', [
    'Cadenas, eslingas y amarres disponibles y en buen estado',
  ]],
  rodillo: ['Rodillo / compactación', [
    'Tambor limpio, sin golpes ni abolladuras',
    'Sistema de riego y raspadores funcionan (si tiene)',
    'Vibración se activa y se desactiva bien',
  ]],
  generador: ['Generador', [
    'Nivel de aceite y refrigerante',
    'Combustible suficiente, sin derrames',
    'Tableros, interruptores y tomas sin daños',
    'Conexión a tierra instalada',
    'Extintor cercano y vigente',
    'Equipo estable, sobre superficie nivelada',
  ]],
  plataforma: ['Plataforma elevadora', [
    'Barandas y puerta de acceso firmes',
    'Comandos de plataforma y de suelo funcionan',
    'Parada de emergencia y descenso de emergencia funcionan',
    'Estabilizadores / base nivelada',
    'Alarmas y luces funcionan',
  ]],
};

const CHK_TIPOS = {
  camioneta:     { nombre: 'Camioneta / vehículo liviano', grupos: ['documentos','carroceria','luces','neumaticosLiv','nivelesVeh','frenosDir','seguridadVeh','cabina'] },
  camion:        { nombre: 'Camión',                       grupos: ['documentos','carroceria','luces','neumaticosLiv','nivelesVeh','frenosDir','aireCamion','seguridadVeh','cabina','cargaAmarres'] },
  camionTolva:   { nombre: 'Camión tolva',                 grupos: ['documentos','carroceria','luces','neumaticosLiv','nivelesVeh','frenosDir','aireCamion','tolva','seguridadVeh','cabina'] },
  camionPluma:   { nombre: 'Camión pluma / grúa',          grupos: ['documentos','carroceria','luces','neumaticosLiv','nivelesVeh','frenosDir','aireCamion','plumaGrua','seguridadVeh','cabina'] },
  retro:         { nombre: 'Retroexcavadora',              grupos: ['fluidosPesada','hidraulico','ruedasPesada','estructuraBalde','motorGeneral','seguridadPesada','engrase'] },
  excavadora:    { nombre: 'Excavadora',                   grupos: ['fluidosPesada','hidraulico','ordugas','estructuraBalde','motorGeneral','seguridadPesada','engrase'] },
  cargador:      { nombre: 'Cargador frontal',             grupos: ['fluidosPesada','hidraulico','ruedasPesada','estructuraBalde','motorGeneral','seguridadPesada','engrase'] },
  minicargador:  { nombre: 'Minicargador',                 grupos: ['fluidosPesada','hidraulico','ruedasPesada','estructuraBalde','motorGeneral','seguridadPesada','engrase'] },
  motoniveladora:{ nombre: 'Motoniveladora',               grupos: ['fluidosPesada','hidraulico','ruedasPesada','estructuraBalde','motorGeneral','seguridadPesada','engrase'] },
  rodillo:       { nombre: 'Rodillo compactador',          grupos: ['fluidosPesada','hidraulico','rodillo','motorGeneral','seguridadPesada','engrase'] },
  grua:          { nombre: 'Grúa / Manitou',               grupos: ['fluidosPesada','hidraulico','ruedasPesada','plumaGrua','motorGeneral','seguridadPesada','engrase'] },
  plataforma:    { nombre: 'Plataforma elevadora',         grupos: ['fluidosPesada','hidraulico','ruedasPesada','plataforma','seguridadPesada','engrase'] },
  generador:     { nombre: 'Generador',                    grupos: ['generador','engrase'] },
  otro:          { nombre: 'Equipo general',               grupos: ['fluidosPesada','motorGeneral','seguridadPesada','engrase'] },
};

// Detecta el tipo de checklist a partir de lo que dice la ficha del equipo
// (columna "Equipo", marca y modelo). Sin tildes, en minúsculas.
function _chkDetectarTipo(eq) {
  const t = ((eq && [eq.equipo, eq.marca, eq.modelo].filter(Boolean).join(' ')) || '')
    .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const tiene = (...ps) => ps.some(p => t.includes(p));
  if (tiene('minicargador', 'mini cargador', 'bobcat', 'skid')) return 'minicargador';
  if (tiene('retroexcavadora', 'retro ')) return 'retro';
  if (tiene('excavadora')) return 'excavadora';
  if (tiene('motoniveladora', 'niveladora')) return 'motoniveladora';
  if (tiene('cargador')) return 'cargador';
  if (tiene('rodillo', 'compactador')) return 'rodillo';
  if (tiene('manitou', 'telehandler', 'grua')) return 'grua';
  if (tiene('plataforma', 'tijera', 'brazo articulado')) return 'plataforma';
  if (tiene('generador', 'grupo electrogeno')) return 'generador';
  if (tiene('tolva', 'batea')) return 'camionTolva';
  if (tiene('pluma', 'hiab', 'grua')) return 'camionPluma';
  if (tiene('camion', 'tracto')) return 'camion';
  if (tiene('camioneta', 'pick', 'furgon', 'suv', 'auto', 'jeep', 'van ', 'minibus')) return 'camioneta';
  return 'otro';
}

function _chkArmarItems(tipo) {
  const def = CHK_TIPOS[tipo] || CHK_TIPOS.otro;
  const items = [];
  def.grupos.forEach(g => {
    const [titulo, lista] = CHK_GRUPOS[g];
    lista.forEach((label, i) => items.push({ key: `${g}-${i}`, grupo: titulo, label, estado: '', obs: '', fotos: [] }));
  });
  return items;
}

// ── Carga de datos ───────────────────────────────────────────
async function loadChecklist() {
  try {
    const rows = await fetchSheet(`'${CONFIG.SHEET_CHECKLIST || 'CHECKLIST'}'!A2:M5000`);
    allChecklist = (rows || [])
      .map((r, i) => ({ r, rowIndex: i + 2 }))
      .filter(({ r }) => r[0])
      .map(({ r, rowIndex }) => {
        let items = [];
        try { items = JSON.parse(r[9] || '[]'); } catch (e) { items = []; }
        return {
          rowIndex,
          id: r[0] || '',
          fecha: _bitFechaDesdeHoja(r[1] || ''),
          hora: r[2] || '',
          patente: (r[3] || '').toUpperCase(),
          tipoChk: r[4] || '',
          chofer: r[5] || '',
          medicion: r[6] || '',
          resultado: r[7] || '',
          nFallas: parseInt(r[8]) || 0,
          items,
          fotosGenerales: r[10] || '',
          obs: r[11] || '',
          registradoPor: r[12] || '',
        };
      });
  } catch (e) {
    allChecklist = [];
    console.warn('[CHECKLIST] No se pudo cargar (¿hoja no creada todavía?):', e.message);
  }
}

function _chkDeHoy(patente) {
  // Fecha local (toISOString usa UTC y de noche se equivocaría de día)
  const d = new Date(); const local = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  return allChecklist.filter(c => c.patente === patente && c.fecha === local)
    .sort((a, b) => (b.hora || '').localeCompare(a.hora || '') || b.rowIndex - a.rowIndex);
}

// ¿Falta el checklist de hoy para este vehículo? (se pide antes de iniciar un viaje)
function chkRequerido(patente) { return _chkDeHoy(patente).length === 0; }

// Banner "checklist de hoy" arriba de la ficha del vehículo
function chkRenderBanner(patente) {
  const el = document.getElementById('bit-ficha-chk-estado');
  if (!el) return;
  const eqB = (typeof _bitEquipoPorId === 'function') ? _bitEquipoPorId(patente) : null;
  if (eqB && eqB.esGenerador) { el.innerHTML = ''; return; } // los generadores no llevan checklist
  const hechos = _chkDeHoy(patente);
  if (!hechos.length) {
    el.innerHTML = `<div class="chk-banner chk-banner--pend">
      <div><strong>Checklist de hoy pendiente</strong><div style="font-size:13.5px">Revisa el estado antes de empezar a trabajar.</div></div>
      <button class="action-btn" style="margin-top:0;white-space:nowrap" onclick="chkAbrir()">Hacer checklist</button>
    </div>`;
    return;
  }
  const u = hechos[0];
  const ok = u.nFallas === 0;
  el.innerHTML = `<div class="chk-banner ${ok ? 'chk-banner--ok' : 'chk-banner--falla'}" onclick="chkAbrirDetalle(${u.rowIndex})" style="cursor:pointer">
    <div><strong>${ok ? 'Checklist de hoy: todo OK' : `Checklist de hoy: ${u.nFallas} ${u.nFallas === 1 ? 'falla' : 'fallas'}`}</strong>
    <div style="font-size:13.5px">${u.hora || ''}${u.chofer ? ' · ' + u.chofer : ''} · toca para ver el detalle</div></div>
  </div>`;
}

// ── Formulario ───────────────────────────────────────────────
function chkAbrir(opts) {
  _chkLuegoViaje = !!(opts && opts.luegoViaje);
  if (typeof _bitSoloLectura === 'function' && _bitSoloLectura()) { toast('Sin permisos para registrar', 'error'); return; }
  const patente = _bitPatenteActual;
  const eq = (typeof _bitEquipoPorId === 'function') ? _bitEquipoPorId(patente) : (typeof allEquipos !== 'undefined' ? allEquipos : []).find(e => e.patente === patente);
  if (!eq) return;
  _chkPatente = patente;
  _chkTipo = _chkDetectarTipo(eq);
  _chkItems = _chkArmarItems(_chkTipo);
  _chkFotosGenerales = [];
  _chkGuardando = false;
  const nombre = [eq.marca, eq.modelo].filter(Boolean).join(' ') || eq.equipo || patente;
  const t = _bitTextos(patente);

  const aviso = document.getElementById('bit-chk-aviso');
  if (aviso) aviso.style.display = _chkLuegoViaje ? 'block' : 'none';
  document.getElementById('bit-chk-vehiculo').textContent = `${nombre} — ${patente}`;
  const sel = document.getElementById('bit-chk-tipo');
  sel.innerHTML = Object.entries(CHK_TIPOS).map(([k, v]) => `<option value="${k}" ${k === _chkTipo ? 'selected' : ''}>${v.nombre}</option>`).join('');
  document.getElementById('bit-chk-chofer').value = '';
  document.getElementById('bit-chk-medicion-label').textContent = `${t.unidadLargaCap} actual`;
  document.getElementById('bit-chk-medicion').value = _numeroParaInput(typeof _bitUltimoKmConocido === 'function' ? _bitUltimoKmConocido(patente) : '');
  document.getElementById('bit-chk-obs').value = '';
  if (typeof _bitPoblarChoferesConocidos === 'function') {
    _bitPoblarChoferesConocidos();
    const dl = document.getElementById('bit-comb-choferes-lista');
    const dl2 = document.getElementById('bit-chk-choferes-lista');
    if (dl && dl2) dl2.innerHTML = dl.innerHTML;
  }
  chkRenderItems();
  openPanel('panel-bit-checklist');
}

function chkCambiarTipo(tipo) {
  const hayRespuestas = _chkItems.some(i => i.estado || i.obs || i.fotos.length);
  if (hayRespuestas && !confirm('Al cambiar el tipo de checklist se pierde lo que ya marcaste. ¿Continuar?')) {
    document.getElementById('bit-chk-tipo').value = _chkTipo;
    return;
  }
  _chkTipo = tipo;
  _chkItems = _chkArmarItems(tipo);
  chkRenderItems();
}

function _chkEsc(s) { return (s == null ? '' : String(s)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

function chkRenderItems() {
  let html = '';
  let grupoActual = null;
  _chkItems.forEach(it => {
    if (it.grupo !== grupoActual) {
      grupoActual = it.grupo;
      html += `<div class="form-sec">${_chkEsc(grupoActual)}</div>`;
    }
    html += `<div class="chk-item chk-item--${it.estado || 'vacio'}" id="chk-item-${it.key}">
      <div class="chk-item-label">${_chkEsc(it.label)}</div>
      <div class="chk-seg">
        <button type="button" class="chk-seg-btn ${it.estado === 'OK' ? 'on-ok' : ''}" onclick="chkMarcar('${it.key}','OK')">OK</button>
        <button type="button" class="chk-seg-btn ${it.estado === 'FALLA' ? 'on-falla' : ''}" onclick="chkMarcar('${it.key}','FALLA')">Falla</button>
        <button type="button" class="chk-seg-btn ${it.estado === 'NA' ? 'on-na' : ''}" onclick="chkMarcar('${it.key}','NA')">No aplica</button>
      </div>
      ${it.estado === 'FALLA' ? `<input type="text" class="chk-obs" placeholder="Describe la falla (opcional)" value="${_chkEsc(it.obs)}" oninput="chkSetObs('${it.key}', this.value)">
      <button type="button" class="action-btn chk-foto-falla" onclick="chkTomarFoto('${it.key}')">${it.fotos.length ? '+ Agregar otra foto' : '📷 Sacar foto de la falla (opcional)'}</button>` : ''}
      ${it.estado === 'FALLA' && it.fotos.length ? `<div class="chk-fotos">${it.fotos.map((f, i) => `<div class="chk-foto"><img src="${f.previewUrl}" alt="Foto"><button type="button" onclick="chkQuitarFoto('${it.key}', ${i})" aria-label="Quitar foto">✕</button></div>`).join('')}</div>` : ''}
    </div>`;
  });
  document.getElementById('bit-chk-items').innerHTML = html;
  _chkRenderGenerales();
  _chkRenderProgreso();
}

function _chkRenderGenerales() {
  const cont = document.getElementById('bit-chk-fotos-generales');
  if (!cont) return;
  cont.innerHTML = _chkFotosGenerales.map((f, i) => `<div class="chk-foto"><img src="${f.previewUrl}" alt="Foto"><button type="button" onclick="chkQuitarFoto('__gen', ${i})" aria-label="Quitar foto">✕</button></div>`).join('');
}

function _chkRenderProgreso() {
  const total = _chkItems.length;
  const resp = _chkItems.filter(i => i.estado).length;
  const fallas = _chkItems.filter(i => i.estado === 'FALLA').length;
  const el = document.getElementById('bit-chk-progreso');
  if (el) el.textContent = `${resp} de ${total} puntos revisados${fallas ? ` · ${fallas} con falla` : ''}`;
}

function chkMarcar(key, estado) {
  const it = _chkItems.find(i => i.key === key);
  if (!it) return;
  it.estado = it.estado === estado ? '' : estado; // tocar de nuevo desmarca
  if (it.estado !== 'FALLA') { it.fotos = []; it.obs = ''; } // la foto y la descripción son solo para fallas
  _chkRenderConScroll();
}
// Vuelve a dibujar la lista sin perder el lugar donde estaba el scroll
function _chkRenderConScroll() {
  const panelBody = document.querySelector('#panel-bit-checklist .panel-body');
  const top = panelBody ? panelBody.scrollTop : 0;
  chkRenderItems();
  if (panelBody) panelBody.scrollTop = top;
}
function chkSetObs(key, v) {
  const it = _chkItems.find(i => i.key === key);
  if (it) it.obs = v;
}
function chkTodoOk() {
  _chkItems.forEach(i => { if (!i.estado) i.estado = 'OK'; });
  _chkRenderConScroll();
}

function chkTomarFoto(key) {
  _chkItemFoto = key;
  const inp = document.getElementById('bit-chk-file');
  if (inp) inp.click();
}
function chkFotoElegida(input) {
  if (!input.files || !input.files.length) return;
  const files = Array.from(input.files);
  const key = _chkItemFoto;
  Promise.all(files.map(f => _comprimirImagen(f))).then(list => {
    list.forEach(c => {
      const foto = { b64: c.b64, name: c.name, mimeType: c.mimeType, previewUrl: c.previewUrl };
      if (key === '__gen') _chkFotosGenerales.push(foto);
      else { const it = _chkItems.find(i => i.key === key); if (it) it.fotos.push(foto); }
    });
    _chkRenderConScroll();
  }).catch(e => { console.error('[CHK FOTO]', e.message); toast('No se pudo procesar la foto', 'error'); });
  input.value = '';
}
function chkQuitarFoto(key, idx) {
  if (key === '__gen') _chkFotosGenerales.splice(idx, 1);
  else { const it = _chkItems.find(i => i.key === key); if (it) it.fotos.splice(idx, 1); }
  _chkRenderConScroll();
}

// Carpeta de Drive [PATENTE]/Checklist (se crea si no existe). Usa el módulo
// "chofer" porque es el permiso que tiene quien registra en Bitácora.
async function _chkCarpeta(patente) {
  const raiz = await findOrCreateFolder('chofer', patente, CONFIG.DRIVE_ROOT_FOLDER);
  return findOrCreateFolder('chofer', 'Checklist', raiz);
}

async function chkGuardar() {
  if (_chkGuardando) return;
  const chofer = document.getElementById('bit-chk-chofer').value.trim();
  const medicionTxt = document.getElementById('bit-chk-medicion').value;
  const medicion = _parseNumeroSheet(medicionTxt);
  const obsGeneral = document.getElementById('bit-chk-obs').value.trim();
  if (!chofer) { toast('Indica quién hace el checklist', 'error'); return; }
  const sinResp = _chkItems.filter(i => !i.estado);
  if (sinResp.length) {
    toast(`Faltan ${sinResp.length} puntos por revisar (puedes usar "Marcar lo que falta como OK")`, 'error');
    const el = document.getElementById('chk-item-' + sinResp[0].key);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }

  _chkGuardando = true;
  const btn = document.querySelector('#panel-bit-checklist .pnl-action');
  if (btn) btnEstado(btn, 'cargando');
  try {
    const ahora = new Date();
    const fechaISO = ahora.getFullYear() + '-' + String(ahora.getMonth() + 1).padStart(2, '0') + '-' + String(ahora.getDate()).padStart(2, '0');
    const hora = String(ahora.getHours()).padStart(2, '0') + ':' + String(ahora.getMinutes()).padStart(2, '0');
    const sello = fechaISO.replace(/-/g, '') + '_' + hora.replace(':', '');

    // Fotos: se suben todas (de a pocas a la vez) y se anota el nombre de cada una
    const subidas = []; // { destino:'__gen'|key, nombre }
    const pendientes = [];
    _chkItems.forEach((it, n) => it.fotos.forEach((f, j) => pendientes.push({ destino: it.key, f, nombre: `CHK_${_chkPatente}_${sello}_${n + 1}_${j + 1}.jpg` })));
    _chkFotosGenerales.forEach((f, j) => pendientes.push({ destino: '__gen', f, nombre: `CHK_${_chkPatente}_${sello}_general_${j + 1}.jpg` }));
    let fallidas = 0;
    if (pendientes.length) {
      toast(`Subiendo ${pendientes.length} foto(s)...`, 'loading');
      const carpeta = await _chkCarpeta(_chkPatente);
      let hechas = 0;
      const cola = pendientes.slice();
      const worker = async () => {
        while (cola.length) {
          const p = cola.shift();
          try {
            const r = await driveUpload('chofer', carpeta, p.nombre, p.f.mimeType, p.f.b64, false);
            subidas.push({ destino: p.destino, nombre: (r && r.name) || p.nombre });
          } catch (e) { fallidas++; console.error('[CHK FOTO]', e.message); }
          hechas++;
          if (btn) btn.textContent = `Subiendo fotos ${hechas}/${pendientes.length}...`;
        }
      };
      await Promise.all([worker(), worker(), worker()]);
    }
    if (fallidas) {
      if (!confirm(`${fallidas} foto(s) no se pudieron subir. ¿Guardar el checklist igual, sin esas fotos?`)) throw new Error('Cancelado: reintenta para subir todas las fotos');
    }

    const detalle = _chkItems.map(it => ({
      g: it.grupo, p: it.label, e: it.estado, o: it.obs.trim(),
      f: subidas.filter(s => s.destino === it.key).map(s => s.nombre),
    }));
    const nFallas = detalle.filter(d => d.e === 'FALLA').length;
    const generales = subidas.filter(s => s.destino === '__gen').map(s => s.nombre).join(' | ');
    const resultado = nFallas ? `${nFallas} CON FALLA` : 'OK';
    const email = (typeof userEmail !== 'undefined' ? userEmail : '');
    const id = 'CHK-' + Date.now();

    await _chkAsegurarHoja();
    await appendSheet(`'${CONFIG.SHEET_CHECKLIST || 'CHECKLIST'}'!A:M`, [[
      id, _bitFechaParaGuardar(fechaISO), hora, _chkPatente, _chkTipo, chofer,
      isNaN(medicion) ? '' : medicion, resultado, nFallas, JSON.stringify(detalle), generales, obsGeneral, email,
    ]]);

    toast(nFallas ? `✓ Checklist guardado con ${nFallas} falla(s)` : '✓ Checklist guardado: todo OK');
    if (btn) btnEstado(btn, 'ok');
    _origClosePanel('panel-bit-checklist');
    const idx = _panelStack.lastIndexOf('panel-bit-checklist');
    if (idx !== -1) _panelStack.splice(idx, 1);
    await loadChecklist();
    // Por si la lectura de la hoja todavía no trae la fila recién guardada
    if (!allChecklist.some(c => c.id === id)) {
      allChecklist.push({ rowIndex: 999999, id, fecha: fechaISO, hora, patente: _chkPatente, tipoChk: _chkTipo, chofer,
        medicion: isNaN(medicion) ? '' : medicion, resultado, nFallas, items: detalle, fotosGenerales: generales, obs: obsGeneral, registradoPor: email });
    }
    bitRenderMetricasYHistorial();
    // Si el checklist era el paso previo para iniciar un viaje, se sigue con el viaje
    if (_chkLuegoViaje) { _chkLuegoViaje = false; bitAbrirViaje(true); }
  } catch (e) {
    toast('Error: ' + e.message, 'error');
  } finally {
    _chkGuardando = false;
    if (btn) btnEstado(btn, 'reset');
  }
}

// Si la hoja no existe todavía, la crea (quien tenga permiso de editar la
// planilla). Si no se puede, el Apps Script también la crea al primer guardado.
let _chkHojaLista = false;
async function _chkAsegurarHoja() {
  if (_chkHojaLista) return;
  try {
    await ensureToken();
    const metaUrl = `https://sheets.googleapis.com/v4/spreadsheets/${CONFIG.SHEET_ID}`;
    const res = await fetch(metaUrl, { headers: authHeader() });
    if (res.ok) {
      const data = await res.json();
      const nombre = CONFIG.SHEET_CHECKLIST || 'CHECKLIST';
      if (!(data.sheets || []).some(s => s.properties.title === nombre)) {
        await fetch(`${metaUrl}:batchUpdate`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeader() },
          body: JSON.stringify({ requests: [{ addSheet: { properties: { title: nombre } } }] }),
        });
        await writeSheet(`'${nombre}'!A1:M1`, [CHK_HEADERS]);
      }
    }
  } catch (e) { /* el Apps Script la crea si no se pudo acá */ }
  _chkHojaLista = true;
}

// ── Detalle de un checklist ya guardado ──────────────────────
function chkAbrirDetalle(rowIndex) {
  const c = allChecklist.find(x => x.rowIndex === rowIndex);
  if (!c) return;
  const ok = c.nFallas === 0;
  const tipoNombre = (CHK_TIPOS[c.tipoChk] || {}).nombre || 'Checklist';
  const t = _bitTextos(c.patente);
  let grupoActual = null;
  const filas = (c.items || []).map(it => {
    let h = '';
    if (it.g !== grupoActual) { grupoActual = it.g; h += `<div class="form-sec">${_chkEsc(grupoActual)}</div>`; }
    const est = it.e === 'OK' ? ['OK', 'green'] : it.e === 'FALLA' ? ['Falla', 'red'] : ['No aplica', ''];
    h += `<div class="chk-det-item">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start">
        <div>${_chkEsc(it.p)}</div><span class="badge ${est[1]}" style="white-space:nowrap">${est[0]}</span>
      </div>
      ${it.o ? `<div class="evento-desc">${_chkEsc(it.o)}</div>` : ''}
      ${(it.f && it.f.length) ? `<div>${it.f.map(n => `<button class="evento-ver-foto-btn" onclick="chkAbrirFoto('${_chkEsc(n)}')">Ver foto</button>`).join(' ')}</div>` : ''}
    </div>`;
    return h;
  }).join('');
  const gen = (c.fotosGenerales || '').split('|').map(s => s.trim()).filter(Boolean);
  document.getElementById('bit-chk-det-body').innerHTML = `
    <div class="chk-banner ${ok ? 'chk-banner--ok' : 'chk-banner--falla'}">
      <div><strong>${ok ? 'Todo OK' : `${c.nFallas} ${c.nFallas === 1 ? 'punto con falla' : 'puntos con falla'}`}</strong>
      <div style="font-size:13.5px">${c.patente} · ${_bitFormatearFecha(c.fecha)} ${c.hora || ''}</div></div>
    </div>
    <div class="field-row"><span class="fl">Tipo</span><span class="fv">${_chkEsc(tipoNombre)}</span></div>
    <div class="field-row"><span class="fl">Hecho por</span><span class="fv">${_chkEsc(c.chofer || '—')}</span></div>
    ${c.medicion !== '' ? `<div class="field-row"><span class="fl">${t.unidadLargaCap} al inicio</span><span class="fv">${_chkEsc(c.medicion)}</span></div>` : ''}
    ${c.obs ? `<div class="ficha-obs">${_chkEsc(c.obs)}</div>` : ''}
    ${gen.length ? `<div class="form-sec">Fotos generales</div><div>${gen.map(n => `<button class="evento-ver-foto-btn" onclick="chkAbrirFoto('${_chkEsc(n)}')">Ver foto</button>`).join(' ')}</div>` : ''}
    ${filas}`;
  openPanel('panel-bit-chk-detalle');
}

async function chkAbrirFoto(nombre) {
  toast('Buscando foto...', 'loading');
  try {
    await ensureToken();
    const data = await driveSearch('chofer', `title = '${_qEsc(nombre)}' and trashed=false`, { pageSize: 1 });
    if (data.files && data.files.length) {
      window.open(`https://drive.google.com/file/d/${data.files[0].id}/view`, '_blank');
      toast('Foto abierta ✓');
    } else toast('No se encontró la foto (¿se movió o se borró en Drive?)', 'error');
  } catch (e) { toast('Error: ' + e.message, 'error'); }
}
