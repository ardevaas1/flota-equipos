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

// ─────────────────────────────────────────────────────────────
// Contenido ampliado por tipo de equipo (descripción, inspección previa,
// procedimiento, consumibles, almacenamiento). Referencia general: el manual
// del fabricante prevalece. `fuel` = equipo a combustión (agrega pasos de emergencia).
// ─────────────────────────────────────────────────────────────
const FICHA_TIPOS_EXTRA = [
  { re: /GENERADOR/, fuel: true, desc: 'Equipo que entrega energía eléctrica en obra cuando no hay red disponible o como respaldo. Se usa para alimentar herramientas, iluminación, bombas y faenas de campamento dentro de su potencia nominal.',
    insp: [['Nivel de aceite del motor', 'Entre marcas mín. y máx.; sin fugas'], ['Nivel de combustible', 'Suficiente para la jornada; sin derrames'], ['Filtro de aire', 'Limpio y bien instalado'], ['Tomas, cables y tablero', 'Sin daños; protección diferencial operativa'], ['Puesta a tierra', 'Conectada y continua'], ['Extintor cercano', 'Vigente y a mano']],
    consumibles: ['Aceite de motor del tipo indicado por el fabricante', 'Filtro de aire y de combustible', 'Bujía (motores bencineros)', 'Combustible limpio (sin agua)'],
    antes: ['Revisar aceite, combustible y filtro de aire.', 'Desconectar todas las cargas antes de partir.', 'Verificar la puesta a tierra y la ventilación del lugar.'],
    durante: ['Conectar las cargas de a una, sin superar la potencia nominal.', 'No cargar combustible con el motor en marcha o caliente.', 'Vigilar ruidos, vibración y temperatura anormales.'],
    despues: ['Desconectar las cargas y dejar enfriar unos minutos antes de apagar.', 'Apagar, cerrar la llave de combustible y limpiar el equipo.', 'Registrar horómetro y novedades en la app.'],
    almacen: ['Guardar en lugar seco, ventilado y bajo techo.', 'Si estará mucho tiempo detenido: vaciar o estabilizar el combustible.', 'Transportar sujeto, con el estanque cerrado y sin combustible suelto.'] },
  { re: /DEMOLEDOR|ROTOMARTILLO/, desc: 'Herramienta eléctrica de percusión para demoler, picar, perforar y abrir canales en hormigón, albañilería y roca. Se usa con puntas, cinceles o brocas SDS según el trabajo.',
    insp: [['Cable y enchufe', 'Sin cortes ni empalmes'], ['Carcasa y empuñaduras', 'Sin grietas; empuñadura lateral firme'], ['Portaherramienta', 'Sujeta bien la punta o broca'], ['Punta / broca / cincel', 'Afilada y sin deformaciones'], ['Rejillas de ventilación', 'Libres de polvo']],
    consumibles: ['Puntas, cinceles y brocas SDS (plus / max / hex según modelo)', 'Grasa para portaherramienta', 'Escobillas (carbones) de repuesto', 'Alargador con tierra de sección adecuada'],
    antes: ['Inspeccionar cable, carcasa y accesorio.', 'Confirmar que no hay cañerías ni cables ocultos en la zona.', 'Usar EPP completo y asegurar el material a trabajar.'],
    durante: ['Agarrar con ambas manos y apoyar el peso del equipo, sin forzarlo.', 'Hacer pausas para reducir la vibración sobre las manos.', 'No inclinar ni palanquear la punta atascada.'],
    despues: ['Desenchufar antes de sacar la punta.', 'Soplar el polvo de las rejillas y limpiar el equipo.', 'Guardar en su maleta, con la punta engrasada.'],
    almacen: ['Guardar en su maleta, en lugar seco.', 'Enrollar el cable sin dobleces fuertes.', 'No transportar colgando del cable.'] },
  { re: /TALADRO|PISTOLA IMPACTO|PERF/, desc: 'Herramienta eléctrica para perforar y atornillar en madera, metal y albañilería. El modo percutor se usa solo en hormigón y ladrillo.',
    insp: [['Cable y enchufe', 'Sin cortes ni empalmes'], ['Portabrocas', 'Cierra firme; sin juego'], ['Broca o accesorio', 'Del tipo y tamaño correcto; sin desgaste'], ['Interruptor y selector', 'Funcionan sin trabarse'], ['Carcasa y mango', 'Sin grietas']],
    consumibles: ['Brocas para metal, madera y hormigón', 'Puntas de atornillar', 'Escobillas (carbones)', 'Alargador con tierra'],
    antes: ['Revisar cable, portabrocas y broca.', 'Sujetar la pieza a trabajar.', 'Elegir velocidad y modo (giro / percusión) según el material.'],
    durante: ['Apoyar la broca antes de acelerar.', 'No forzar el equipo; retirar la broca para evacuar viruta.', 'Sujetar con ambas manos en perforaciones grandes.'],
    despues: ['Desenchufar y sacar la broca.', 'Limpiar el equipo y las rejillas.', 'Guardar en su maleta.'],
    almacen: ['Lugar seco y sin polvo.', 'No dejar brocas puestas al guardar.', 'Evitar golpes durante el transporte.'] },
  { re: /ESMERIL|PULIDORA/, desc: 'Herramienta eléctrica rotativa para cortar, desbastar, pulir y limpiar metal, hormigón y piedra, según el disco que se monte.',
    insp: [['Disco', 'Sin rajaduras; velocidad máxima ≥ la del equipo'], ['Protector del disco', 'Instalado y bien apretado'], ['Cable y enchufe', 'Sin cortes ni empalmes'], ['Mango auxiliar', 'Firme'], ['Tuerca / flange', 'Apretado con la llave, no a mano']],
    consumibles: ['Discos de corte, desbaste y pulido del tipo adecuado', 'Escobillas (carbones)', 'Llave de tuerca', 'Alargador con tierra'],
    antes: ['Revisar el disco y el protector.', 'Dejarlo girar en vacío unos segundos, apuntando lejos de las personas.', 'Asegurar la pieza y despejar el área de materiales inflamables.'],
    durante: ['Trabajar con el protector hacia el operador.', 'No presionar de más ni cortar de lado con discos de corte.', 'Esperar a que el disco se detenga antes de soltar el equipo.'],
    despues: ['Desenchufar y retirar el disco si no se seguirá usando.', 'Limpiar rejillas de ventilación.', 'Guardar el disco sobrante en su envase.'],
    almacen: ['Guardar discos en lugar seco y plano.', 'No apoyar el equipo sobre el disco.', 'Evitar humedad: los discos absorben agua.'] },
  { re: /ASPIRADORA|SOPLADOR/, fuel: false, desc: 'Equipo para aspirar o soplar polvo, escombro fino y líquidos (según modelo) en obra y bodega. Los sopladores a combustión se usan para limpiar superficies y hojas.',
    insp: [['Filtro', 'Limpio y sin roturas'], ['Estanque / bolsa', 'Vacío o con capacidad'], ['Manguera y acoples', 'Sin roturas ni fugas'], ['Cable y enchufe', 'Sin cortes'], ['Ruedas y tapa', 'En buen estado']],
    consumibles: ['Filtros de repuesto', 'Bolsas de recolección', 'Mangueras y boquillas', 'Mezcla combustible (sopladores a combustión)'],
    antes: ['Revisar filtro, estanque y manguera.', 'Usar el filtro correcto (seco o húmedo).', 'Conectar solo a tomas con protección.'],
    durante: ['No aspirar materiales calientes, inflamables ni explosivos.', 'Vaciar el estanque antes de que se llene.', 'Evitar doblar la manguera.'],
    despues: ['Apagar, desconectar y vaciar el estanque.', 'Limpiar o cambiar el filtro.', 'Enrollar manguera y cable.'],
    almacen: ['Guardar seca y con el estanque vacío.', 'Almacenar bajo techo.', 'Mantener el filtro limpio y seco.'] },
  { re: /HIDROLAVADORA/, desc: 'Equipo de agua a presión para limpiar maquinaria, superficies y moldajes. Se conecta a red de agua y a energía eléctrica.',
    insp: [['Manguera de alta presión', 'Sin cortes ni hernias'], ['Pistola y lanza', 'Sin fugas; gatillo con seguro'], ['Filtro de entrada de agua', 'Limpio'], ['Cable y enchufe', 'Sin cortes; protección diferencial'], ['Boquilla', 'Sin obstrucciones']],
    consumibles: ['Boquillas de repuesto', 'Mangueras y acoples rápidos', 'Filtro de entrada', 'Detergentes autorizados'],
    antes: ['Conectar el agua y purgar el aire con el gatillo abierto.', 'Revisar mangueras y conexiones.', 'Despejar el área de personas y equipos eléctricos.'],
    durante: ['Nunca apuntar el chorro a personas o animales.', 'Mantener el cable alejado del agua.', 'No dejar la pistola sola mientras está presurizada.'],
    despues: ['Cerrar el agua y descargar la presión disparando la pistola.', 'Desconectar y enrollar las mangueras.', 'Guardar protegida de heladas.'],
    almacen: ['Guardar vacía de agua y a resguardo de heladas.', 'Enrollar la manguera sin dobleces.', 'Mantener el equipo en posición vertical.'] },
  { re: /COMPRESOR/, desc: 'Equipo que entrega aire comprimido para herramientas neumáticas, limpieza y pintura. Acumula el aire en un estanque a presión.',
    insp: [['Nivel de aceite', 'En la marca (modelos lubricados)'], ['Válvula de seguridad', 'Libre y sin sellos rotos'], ['Manómetro', 'Marca correctamente'], ['Mangueras y acoples', 'Sin fugas ni grietas'], ['Purga del estanque', 'Sin exceso de condensado'], ['Filtro de aire', 'Limpio']],
    consumibles: ['Aceite para compresor', 'Filtro de aire', 'Mangueras y acoples rápidos', 'Correa de transmisión (si aplica)'],
    antes: ['Revisar aceite, mangueras y acoples.', 'Purgar el condensado del estanque.', 'Verificar la presión de trabajo de la herramienta a conectar.'],
    durante: ['No superar la presión máxima de la herramienta ni del equipo.', 'Vigilar sobrecalentamiento y ruidos.', 'No dirigir aire a presión hacia personas.'],
    despues: ['Apagar, descargar el aire y purgar el condensado.', 'Limpiar el equipo.', 'Dejarlo en posición estable.'],
    almacen: ['Guardar con el estanque purgado.', 'Lugar seco y ventilado.', 'Transportar sin presión y bien sujeto.'] },
  { re: /MOTOBOMBA|BOMBA/, fuel: true, desc: 'Equipo para trasvasijar o evacuar agua (limpia o con sólidos, según el modelo) en excavaciones, fundaciones y faenas.',
    insp: [['Aceite del motor', 'En nivel; sin fugas'], ['Combustible', 'Suficiente; estanque bien cerrado'], ['Mangueras y abrazaderas', 'Firmes y sin fugas'], ['Filtro / canastillo de succión', 'Limpio'], ['Cebado', 'Cuerpo de la bomba con agua']],
    consumibles: ['Aceite de motor', 'Bujía y filtro de aire', 'Mangueras de succión y descarga', 'Sello mecánico'],
    antes: ['Ubicar estable y cerca del agua.', 'Cebar la bomba antes de partir.', 'Revisar combustible, aceite y mangueras.'],
    durante: ['No dejar funcionar en seco.', 'Vigilar que la succión no se obstruya.', 'Cargar combustible solo con el motor apagado y frío.'],
    despues: ['Dejar funcionar con agua limpia para enjuagar y apagar.', 'Vaciar el cuerpo de la bomba.', 'Registrar el uso en la app.'],
    almacen: ['Guardar seca y bajo techo.', 'Vaciar el agua del cuerpo para evitar corrosión y heladas.', 'Estanque sin combustible o con estabilizador si estará detenida.'] },
  { re: /PLACA|VIBROAPISONADOR|RODILLO|APISONADOR/, fuel: true, desc: 'Equipo de compactación para suelos granulares, bases y rellenos de zanjas, mediante vibración generada por el motor.',
    insp: [['Aceite del motor y del vibrador', 'En nivel; sin fugas'], ['Combustible', 'Suficiente; sin derrames'], ['Pernos y base', 'Apretados; sin grietas'], ['Manubrio y amortiguadores', 'Firmes'], ['Filtro de aire', 'Limpio']],
    consumibles: ['Aceite de motor', 'Filtro de aire', 'Bujía', 'Correa o embrague (según modelo)'],
    antes: ['Revisar niveles y pernos.', 'Verificar que el terreno y los bordes sean estables.', 'Definir la ruta de compactación.'],
    durante: ['Mantener las manos en el manubrio y los pies lejos de la base.', 'No operar en pendientes sin control.', 'Detener el equipo para cargar combustible.'],
    despues: ['Apagar y limpiar la base de barro y material.', 'Revisar pernos tras el uso.', 'Registrar horas de uso.'],
    almacen: ['Guardar limpia y bajo techo.', 'Transportar sujeta y con el estanque cerrado.', 'Elevar solo con los puntos de levante indicados.'] },
  { re: /BETONERA|REVOLVEDOR/, desc: 'Equipo para mezclar hormigón y mortero en obra mediante un tambor giratorio o aspas, con motor eléctrico o a combustión.',
    insp: [['Tambor y paletas', 'Limpios y sin desgaste excesivo'], ['Resguardos y tapas', 'Instalados'], ['Cable y enchufe', 'Sin cortes; protección diferencial'], ['Ruedas y freno', 'Funcionando'], ['Corona y transmisión', 'Engrasadas']],
    consumibles: ['Grasa para corona y rodamientos', 'Paletas de repuesto', 'Correa de transmisión', 'Agua para lavado'],
    antes: ['Nivelar y calzar el equipo.', 'Revisar resguardos y cable.', 'Ubicar lejos de zonas de tránsito.'],
    durante: ['No introducir manos ni herramientas con el tambor en giro.', 'Cargar los materiales en el orden que indique el procedimiento.', 'Detener y desconectar antes de cualquier desatasco.'],
    despues: ['Lavar el tambor de inmediato para evitar fraguado.', 'Desconectar y enrollar el cable.', 'Revisar y engrasar la corona.'],
    almacen: ['Guardar limpia y seca.', 'Tambor inclinado hacia abajo para drenar.', 'Proteger el motor de la lluvia.'] },
  { re: /PLATAFORMA/, desc: 'Plataforma elevadora de personal tipo tijera para trabajos en altura sobre superficie firme y nivelada.',
    insp: [['Baranda y portón', 'Firmes y con seguro'], ['Controles (plataforma y base)', 'Responden; parada de emergencia operativa'], ['Neumáticos', 'Sin cortes; presión correcta'], ['Sistema hidráulico', 'Sin fugas; nivel de aceite correcto'], ['Baterías / combustible', 'Carga suficiente'], ['Alarmas y luces', 'Funcionando'], ['Placa de carga máxima', 'Legible']],
    consumibles: ['Aceite hidráulico', 'Baterías', 'Neumáticos', 'Fusibles y mangueras hidráulicas'],
    antes: ['Realizar la inspección diaria y llenar el registro.', 'Inspeccionar el área de trabajo: suelo, huecos, líneas eléctricas.', 'Usar arnés anclado al punto indicado.'],
    durante: ['Respetar la carga y el número de personas máximos.', 'No sacar la plataforma de nivel ni usarla con viento fuerte.', 'Mantener personas fuera del área de la tijera.'],
    despues: ['Bajar totalmente la plataforma antes de desplazar o estacionar.', 'Dejar cargando las baterías.', 'Informar cualquier falla; no operar con fallas.'],
    almacen: ['Estacionar en piso firme con la plataforma abajo.', 'Dejar desconectada la llave y los frenos puestos.', 'Transportar anclada, siguiendo el manual.'] },
  { re: /NIVEL|TAQUIMETRO|ESTACION|TEODOLITO/, desc: 'Instrumento topográfico para medir y trasladar niveles, ángulos y distancias en replanteos y control de obra.',
    insp: [['Burbuja / compensador', 'Calibrado y sin errores'], ['Lentes y ocular', 'Limpios, sin hongos ni rayas'], ['Trípode', 'Patas firmes y tornillos apretados'], ['Baterías', 'Carga suficiente (equipos electrónicos)'], ['Estuche', 'Completo y en buen estado']],
    consumibles: ['Baterías o pilas', 'Paño para lentes', 'Mira / prisma / plomada', 'Estuche y trípode'],
    antes: ['Revisar la calibración y las baterías.', 'Instalar el trípode estable y nivelar.', 'Proteger el instrumento del sol directo y la lluvia.'],
    durante: ['No dejar el instrumento sin vigilancia.', 'Evitar golpes y vibraciones.', 'Registrar las lecturas y verificar con un punto conocido.'],
    despues: ['Limpiar los lentes con el paño apropiado.', 'Guardar en su estuche, seco.', 'Anotar novedades o golpes en la app.'],
    almacen: ['Guardar en estuche, en lugar seco y sin polvo.', 'Retirar las baterías si estará mucho tiempo sin uso.', 'Transportar siempre en su estuche.'] },
];
const FICHA_EXTRA_GENERICO = {
  desc: 'Equipo de uso en obra registrado en el inventario de la empresa. Se debe usar solo para su función prevista y siguiendo el manual del fabricante.',
  insp: [['Estado general', 'Sin golpes ni piezas sueltas'], ['Cable y conexiones', 'Sin cortes ni empalmes'], ['Protecciones', 'Instaladas'], ['Accesorios', 'Completos y en buen estado']],
  consumibles: ['Repuestos y consumibles indicados por el fabricante', 'Elementos de protección personal'],
  antes: ['Leer el manual del fabricante.', 'Realizar la inspección previa.', 'Usar EPP.'], durante: ['Operar según lo previsto.', 'Detener el equipo ante ruidos o fallas.', 'No retirar protecciones.'],
  despues: ['Apagar y desconectar.', 'Limpiar y guardar.', 'Registrar novedades en la app.'], almacen: ['Guardar en lugar seco y seguro.', 'Proteger de golpes y humedad.'],
};
function fichaExtraDe(equipo) {
  const e = String(equipo || '').toUpperCase();
  return FICHA_TIPOS_EXTRA.find(t => t.re.test(e)) || FICHA_EXTRA_GENERICO;
}
// Emergencias (según energía del equipo)
function fichaEmergencias(extra) {
  const base = ['Ante cualquier accidente, detener el equipo, avisar al supervisor y a prevención de riesgos.', 'Cortes, golpes o quemaduras: primeros auxilios básicos y traslado a la mutualidad si corresponde.', 'Contacto eléctrico: no tocar a la persona; cortar la energía y llamar a emergencias.'];
  if (extra && extra.fuel) base.push('Incendio por combustible: usar extintor de polvo químico seco (ABC); no usar agua. Evacuar si no se controla.');
  return base;
}
