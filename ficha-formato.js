// ═══════════════════════════════════════════════════════════════
// Formato común de las fichas técnicas (vehículos e inventario).
// Diseño: cabecera con empresa / título / código-versión-fecha, portada con
// foto de referencia, secciones numeradas con tablas de encabezado azul.
// ═══════════════════════════════════════════════════════════════
function _ffEsc(s) {
  return (s == null ? '' : String(s)).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n+/g, '<br>');
}

const FICHA_CSS = `
  body { font-family: Calibri, Arial, sans-serif; color: #1f2d3a; font-size: 13px; line-height: 1.35; }
  p, div { margin: 0; padding: 0; }
  table { border-collapse: collapse; width: 100%; }
  table.cab td { border: 1px solid #1f3864; padding: 8px 10px; text-align: center; vertical-align: middle; }
  table.cab .emp { font-weight: bold; font-size: 13px; color: #1f3864; }
  table.cab .tit { background: #dde6f5; font-weight: bold; font-size: 13px; color: #1f3864; }
  table.cab .cod { font-size: 11px; text-align: left; }
  .t1 { text-align: center; font-size: 20px; font-weight: bold; color: #1f2d3a; margin-top: 16px; }
  .t2 { text-align: center; font-size: 14px; color: #44546a; margin-bottom: 10px; }
  .portada { text-align: center; margin: 8px 0 6px 0; }
  .portada .pie { font-size: 10px; color: #8697a8; font-style: italic; }
  h2.sec { font-size: 14px; color: #2e75b6; font-weight: bold; margin: 18px 0 6px 0; }
  table.g th { background: #1f3864; color: #ffffff; font-size: 12px; text-align: center; padding: 6px 8px; border: 1px solid #1f3864; }
  table.g td { border: 1px solid #1f3864; padding: 5px 8px; font-size: 12.5px; vertical-align: top; }
  table.g td.k { font-weight: bold; width: 28%; }
  .nota { font-size: 11px; color: #6b7c8f; font-style: italic; margin-top: 6px; text-align: center; }
  ul { margin: 4px 0 6px 18px; }
  li { font-size: 12.5px; margin-bottom: 2px; }
  .firma { text-align: center; font-size: 11px; color: #44546a; margin-top: 18px; }
  a { color: #1f3864; }
  .marcador { color: #b8641a; font-style: italic; }
`;

function fichaCabecera(tituloCab, codigo, fecha) {
  return `<table class="cab" width="100%" border="1" cellpadding="6" style="width:100%;border-collapse:collapse;border:1px solid #1f3864"><tr>
    <td class="emp" style="width:24%;border:1px solid #1f3864;text-align:center"><b>CONSTRUCTORA LST</b></td>
    <td class="tit" bgcolor="#dde6f5" style="border:1px solid #1f3864;text-align:center;background:#dde6f5"><b>${_ffEsc(tituloCab)}</b></td>
    <td class="cod" style="width:24%;border:1px solid #1f3864;font-size:11px">Código: ${_ffEsc(codigo)}<br>Versión: 00<br>Fecha: ${_ffEsc(fecha)}</td>
  </tr></table>`;
}
function fichaSec(n, titulo) { return `<h2 class="sec">${n}. ${_ffEsc(titulo)}</h2>`; }
function fichaTabla(heads, rows, claveNegrita) {
  const B = 'border:1px solid #1f3864;padding:5px 8px';
  const th = `<tr>${heads.map(h => `<th bgcolor="#1f3864" style="${B};background:#1f3864;color:#ffffff;text-align:center"><font color="#ffffff"><b>${_ffEsc(h)}</b></font></th>`).join('')}</tr>`;
  const tr = rows.map(r => `<tr>${r.map((c, i) => `<td style="${B};vertical-align:top">${(claveNegrita !== false && i === 0) ? '<b>' + (_ffEsc(c) || '&nbsp;') + '</b>' : (_ffEsc(c) || '&nbsp;')}</td>`).join('')}</tr>`).join('');
  return `<table class="g" width="100%" border="1" cellpadding="5" style="width:100%;border-collapse:collapse;border:1px solid #1f3864">${th}${tr}</table>`;
}
function fichaVinetas(items) { return `<ul>${items.map(i => `<li>${_ffEsc(i)}</li>`).join('')}</ul>`; }

// Contenido de seguridad/uso/mantención por TIPO de equipo (referencia general;
// el manual del fabricante manda ante cualquier diferencia).
const FICHA_TIPOS = [
  { re: /GENERADOR/, uso: ['Ubicar sobre superficie firme y nivelada, ventilada y lejos de materiales inflamables.', 'Si es a combustión: nunca operar en espacios cerrados (gases de escape).', 'Conectar a tierra y usar cables en buen estado; no sobrepasar la potencia nominal.', 'Cargar combustible con el equipo apagado y frío.'],
    riesgos: [['Intoxicación por gases', 'Operar siempre al aire libre y ventilado'], ['Contacto eléctrico', 'Puesta a tierra, protección diferencial, cables en buen estado'], ['Incendio por combustible', 'Apagar y enfriar antes de cargar; extintor cercano'], ['Ruido y partes calientes', 'Protector auditivo; no tocar escape/motor']],
    epp: 'zapatos de seguridad, guantes, protector auditivo y lentes de seguridad.',
    mant: [['Antes de cada uso', 'Revisar nivel de aceite y combustible, filtro de aire, fugas y cables', 'Operador'], ['Cada 100 h o según manual', 'Cambio de aceite y revisión de bujía/filtros', 'Mantención'], ['Anual', 'Revisión general del motor y del alternador', 'Servicio técnico']] },
  { re: /DEMOLEDOR|ROTOMARTILLO|TALADRO|PISTOLA IMPACTO|PERF/, uso: ['Conectar solo al voltaje de la placa, con enchufe a tierra y alargador en buen estado.', 'Usar la empuñadura lateral y herramientas/brocas adecuadas y en buen estado.', 'Verificar que no haya cañerías o cables eléctricos en la zona a intervenir.', 'Desenchufar para cambiar herramientas o hacer mantención.'],
    riesgos: [['Vibración y ruido', 'Protector auditivo; pausas de trabajo; guantes antivibración'], ['Proyección de partículas', 'Lentes de seguridad y careta; mascarilla por polvo'], ['Contacto eléctrico', 'Cable y enchufe en buen estado; protección diferencial'], ['Atrapamiento / golpes', 'Agarrar con ambas manos; ropa ajustada']],
    epp: 'lentes de seguridad, protector auditivo, mascarilla contra polvo, guantes y zapatos de seguridad.',
    mant: [['Antes de cada uso', 'Revisar cable, carcasa, empuñadura y portaherramienta', 'Operador'], ['Mensual', 'Limpiar rejillas de ventilación; engrasar portaherramienta', 'Operador'], ['Según desgaste', 'Cambio de carbones y revisión del motor', 'Servicio técnico']] },
  { re: /ESMERIL|PULIDORA/, uso: ['Montar solo discos del diámetro y velocidad adecuados; verificar que no estén rajados.', 'Mantener siempre el protector de disco colocado.', 'Esperar a que el disco alcance su velocidad antes de trabajar.', 'Desenchufar para cambiar el disco.'],
    riesgos: [['Rotura de disco / proyección', 'Disco en buen estado, protector colocado, careta facial'], ['Cortes y atrapamiento', 'Guantes ajustados, sin ropa suelta'], ['Chispas e incendio', 'Alejar inflamables; extintor cercano'], ['Ruido y polvo', 'Protector auditivo y mascarilla']],
    epp: 'careta facial y lentes de seguridad, protector auditivo, mascarilla, guantes y zapatos de seguridad.',
    mant: [['Antes de cada uso', 'Revisar disco, protector, cable y empuñadura', 'Operador'], ['Mensual', 'Limpiar ventilación del motor', 'Operador'], ['Según desgaste', 'Cambio de carbones y rodamientos', 'Servicio técnico']] },
  { re: /ASPIRADORA|SOPLADOR/, uso: ['Usar sobre superficie estable; no aspirar materiales incandescentes ni inflamables.', 'Revisar filtro y estanque antes de usar.', 'Si es a combustión: no usar en lugares cerrados.', 'Mantener cables y mangueras sin tensión ni daños.'],
    riesgos: [['Polvo en suspensión', 'Filtro adecuado y mascarilla'], ['Ruido', 'Protector auditivo'], ['Contacto eléctrico (modelos eléctricos)', 'Cable en buen estado; no usar con manos húmedas'], ['Proyección de partículas (sopladores)', 'Lentes de seguridad']],
    epp: 'lentes de seguridad, protector auditivo, mascarilla y guantes.',
    mant: [['Antes de cada uso', 'Revisar filtro, manguera y cable', 'Operador'], ['Semanal', 'Vaciar y limpiar estanque; limpiar o cambiar filtro', 'Operador'], ['Según desgaste', 'Revisión del motor / carbones', 'Servicio técnico']] },
  { re: /HIDROLAVADORA/, uso: ['Conectar a agua limpia y a red eléctrica con protección diferencial.', 'No dirigir el chorro a personas, cables ni equipos eléctricos.', 'Purgar el aire de la manguera antes de presionar el gatillo.', 'Despresurizar y desconectar al terminar.'],
    riesgos: [['Chorro a alta presión', 'Nunca apuntar a personas; mantener el seguro del gatillo'], ['Contacto eléctrico', 'Protección diferencial; conexiones secas'], ['Resbalones', 'Mantener el área de trabajo drenada'], ['Proyección de partículas', 'Lentes de seguridad']],
    epp: 'lentes de seguridad, guantes, botas antideslizantes y ropa impermeable.',
    mant: [['Antes de cada uso', 'Revisar manguera, pistola, conexiones y cable', 'Operador'], ['Mensual', 'Limpiar filtro de entrada de agua y boquilla', 'Operador'], ['Anual', 'Revisión de bomba y sellos', 'Servicio técnico']] },
  { re: /COMPRESOR/, uso: ['Ubicar en superficie firme y ventilada, con espacio libre alrededor.', 'Purgar el estanque de condensado antes y después de usar.', 'No exceder la presión máxima del equipo; verificar válvula de seguridad.', 'Despresurizar antes de cualquier mantención.'],
    riesgos: [['Aire a presión / mangueras sueltas', 'Acoples y mangueras en buen estado; despresurizar'], ['Ruido', 'Protector auditivo'], ['Superficies calientes', 'No tocar cabezal ni cañerías durante el uso'], ['Contacto eléctrico', 'Cable y tablero en buen estado']],
    epp: 'protector auditivo, lentes de seguridad, guantes y zapatos de seguridad.',
    mant: [['Antes de cada uso', 'Revisar nivel de aceite, mangueras y acoples', 'Operador'], ['Semanal', 'Purgar condensado; limpiar filtro de aire', 'Operador'], ['Cada 500 h o anual', 'Cambio de aceite y revisión de válvulas', 'Servicio técnico']] },
  { re: /MOTOBOMBA|BOMBA/, uso: ['Ubicar la motobomba estable, cerca del agua y ventilada.', 'Cebar la bomba antes de partir (si corresponde).', 'Verificar mangueras y abrazaderas; evitar dobleces.', 'Si es a combustión: cargar combustible con el motor apagado y frío.'],
    riesgos: [['Gases de escape', 'Operar al aire libre'], ['Superficies calientes', 'No tocar motor ni escape'], ['Contacto eléctrico (bombas sumergibles)', 'Cable en buen estado; desconectar antes de manipular'], ['Ruido', 'Protector auditivo']],
    epp: 'guantes, zapatos de seguridad, protector auditivo y lentes de seguridad.',
    mant: [['Antes de cada uso', 'Revisar aceite, combustible, mangueras y filtro de succión', 'Operador'], ['Mensual', 'Limpiar filtro y revisar sellos', 'Operador'], ['Anual', 'Cambio de aceite, bujía y revisión de impulsor', 'Servicio técnico']] },
  { re: /PLACA|VIBROAPISONADOR|RODILLO|APISONADOR/, uso: ['Verificar que el terreno y los bordes sean seguros; no operar cerca de excavaciones inestables.', 'Cargar combustible con el motor apagado y frío.', 'Mantener las manos en el manubrio y los pies fuera de la base.', 'Transportar sujeta con el equipo apagado.'],
    riesgos: [['Vibración', 'Pausas de trabajo; guantes antivibración'], ['Ruido', 'Protector auditivo'], ['Atrapamiento de pies', 'Zapatos de seguridad con puntera'], ['Gases de escape / incendio', 'Operar ventilado; combustible lejos de fuego']],
    epp: 'zapatos de seguridad, protector auditivo, guantes antivibración y lentes de seguridad.',
    mant: [['Antes de cada uso', 'Revisar aceite del motor, combustible, pernos y base', 'Operador'], ['Semanal', 'Limpiar filtro de aire; revisar vibrador', 'Operador'], ['Cada 100 h', 'Cambio de aceite y bujía', 'Servicio técnico']] },
  { re: /BETONERA|REVOLVEDOR/, uso: ['Instalar nivelada y estable; frenar o calzar las ruedas.', 'No introducir las manos ni herramientas con el tambor en movimiento.', 'Conectar a tierra con protección diferencial (modelos eléctricos).', 'Limpiar el tambor inmediatamente después de usar.'],
    riesgos: [['Atrapamiento por tambor/aspas', 'Resguardos instalados; no meter las manos'], ['Contacto eléctrico', 'Protección diferencial y cable en buen estado'], ['Salpicaduras de cemento', 'Lentes de seguridad y guantes'], ['Sobreesfuerzo', 'Cargar con ayuda mecánica o entre dos personas']],
    epp: 'lentes de seguridad, guantes de goma, zapatos de seguridad y mascarilla.',
    mant: [['Después de cada uso', 'Lavar el tambor y revisar paletas', 'Operador'], ['Semanal', 'Engrasar rodamientos y revisar corona/transmisión', 'Mantención'], ['Anual', 'Revisión de motor y partes eléctricas', 'Servicio técnico']] },
  { re: /PLATAFORMA/, uso: ['Operar solo personal capacitado y autorizado.', 'Usar sobre superficie firme y nivelada; respetar la carga máxima.', 'Usar arnés anclado según el manual y mantener las barandas cerradas.', 'Revisar el área aérea (líneas eléctricas) antes de elevar.'],
    riesgos: [['Caída de altura', 'Barandas, arnés y no trepar sobre ellas'], ['Volcamiento', 'Terreno nivelado; respetar carga y pendientes'], ['Aplastamiento por tijera', 'Mantener personas fuera del área de la tijera'], ['Contacto con líneas eléctricas', 'Mantener distancias de seguridad']],
    epp: 'arnés de seguridad, casco, zapatos de seguridad y guantes.',
    mant: [['Antes de cada turno', 'Inspección diaria: controles, barandas, frenos, fugas', 'Operador'], ['Mensual', 'Revisión de batería y sistema hidráulico', 'Mantención'], ['Anual', 'Inspección y certificación según normativa', 'Servicio técnico autorizado']] },
  { re: /NIVEL|TAQUIMETRO|ESTACION|TEODOLITO/, uso: ['Instalar sobre trípode estable y nivelar antes de medir.', 'Proteger el equipo de golpes, lluvia y sol directo; transportar en su estuche.', 'No apuntar el láser a los ojos de personas.', 'Calibrar según el plan de calibración y registrar la fecha.'],
    riesgos: [['Daño por caída o golpe (pierde calibración)', 'Transportar en estuche; trípode firme'], ['Radiación láser (equipos láser)', 'No mirar el haz; no apuntar a personas'], ['Condiciones climáticas', 'Proteger de lluvia y humedad'], ['Tránsito en terreno', 'Chaleco reflectante y señalización']],
    epp: 'chaleco reflectante, casco, zapatos de seguridad y protector solar.',
    mant: [['Antes de cada uso', 'Revisar nivel de burbuja, lentes y baterías', 'Operador'], ['Semestral / anual', 'Verificación y calibración', 'Servicio técnico / laboratorio'], ['Después de uso en terreno', 'Limpiar lentes con paño adecuado y guardar en estuche', 'Operador']] },
];
const FICHA_TIPO_GENERICO = {
  uso: ['Leer el manual del fabricante antes de operar.', 'Revisar el estado del equipo, cables y protecciones antes de cada uso.', 'Usar solo para el fin previsto y por personal capacitado.', 'Desconectar o apagar antes de cualquier mantención.'],
  riesgos: [['Contacto eléctrico / partes en movimiento', 'Revisar cables y protecciones; no operar con resguardos retirados'], ['Ruido y polvo', 'Protección auditiva y respiratoria'], ['Proyección de partículas', 'Lentes de seguridad'], ['Golpes y atrapamientos', 'Ropa ajustada; guantes adecuados']],
  epp: 'lentes de seguridad, protector auditivo, guantes y zapatos de seguridad.',
  mant: [['Antes de cada uso', 'Inspección visual general y limpieza', 'Operador'], ['Mensual', 'Revisión de cables, fijaciones y desgaste', 'Operador'], ['Ante falla', 'Revisión por técnico autorizado', 'Servicio técnico']],
};
function fichaTipoDe(equipo) {
  const e = String(equipo || '').toUpperCase();
  return FICHA_TIPOS.find(t => t.re.test(e)) || FICHA_TIPO_GENERICO;
}

// Portada: marcador que luego se reemplaza por la imagen (ver fichaInsertarPortada)
function fichaPortadaHtml(tieneFoto) {
  return `<div class="portada"><span class="marcador">{{FOTO_PORTADA}}</span><br><span class="pie">${tieneFoto ? 'Imagen de referencia del modelo' : ''}</span></div>`;
}

// Reemplaza {{FOTO_PORTADA}} por la imagen (URL pública). Si no hay foto o
// Google no puede descargarla, deja el texto "Sin foto de referencia".
async function fichaInsertarPortada(docId, url, ancho) {
  const doc = await docsApiFetch('GET', docId);
  let rango = null;
  (function buscar(content) {
    (content || []).forEach(item => {
      if (item.paragraph) (item.paragraph.elements || []).forEach(el => {
        if (!rango && el.textRun) {
          const i = el.textRun.content.indexOf('{{FOTO_PORTADA}}');
          if (i >= 0) rango = { startIndex: el.startIndex + i, endIndex: el.startIndex + i + '{{FOTO_PORTADA}}'.length };
        }
      });
      if (item.table) item.table.tableRows.forEach(r => r.tableCells.forEach(c => buscar(c.content)));
    });
  })(doc.body.content);
  if (!rango) return false;
  const reqs = [{ deleteContentRange: { range: rango } }];
  if (url) reqs.push({ insertInlineImage: { location: { index: rango.startIndex }, uri: url, objectSize: { width: { magnitude: ancho || 260, unit: 'PT' } } } });
  else reqs.push({ insertText: { location: { index: rango.startIndex }, text: 'Sin foto de referencia' } });
  try {
    await docsApiFetch('POST', `${docId}:batchUpdate`, { requests: reqs });
    return !!url;
  } catch (e) {
    // La imagen no se pudo descargar: se deja el texto en su lugar
    await docsApiFetch('POST', `${docId}:batchUpdate`, { requests: [reqs[0], { insertText: { location: { index: rango.startIndex }, text: 'Sin foto de referencia' } }] });
    return false;
  }
}
