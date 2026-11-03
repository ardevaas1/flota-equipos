// ═══════════════════════════════════════════════════════════════
// Datos de FABRICANTE para las fichas técnicas de Inventario.
// Recopilados de las fichas/páginas oficiales o de manuales publicados
// (la fuente de cada modelo va en "fuente"). Son datos de REFERENCIA del
// modelo: la unidad física puede variar (año, versión, voltaje). Si un
// modelo no aparece acá, la ficha trae un link para buscar su manual.
// Clave: MARCA|MODELO sin espacios, guiones ni puntos, en mayúsculas.
// ═══════════════════════════════════════════════════════════════
const FICHA_FABRICANTE = {
  'MAKITA|HM0810T': {
    specs: [['Impactos por minuto', '2.900'], ['Peso', '6,0 kg'], ['Largo total', '428 mm'], ['Clase de seguridad', 'II (doble aislamiento)'], ['Ruido', '92 dB(A) presión sonora · 103 dB(A) potencia'], ['Vibración (cincelado)', '14,0 m/s²']],
    recs: ['Usar protección auditiva (el manual declara 92 dB(A)).', 'Conectar solo a corriente alterna monofásica con el voltaje de la placa; el equipo es de doble aislamiento.', 'Leer el manual de instrucciones antes de usarlo.'],
    fuente: ['Manual Makita HM0810T (ManualsLib)', 'https://www.manualslib.com/manual/771920/Makita-Hm0810t.html'],
    manual: ['Manual de instrucciones HM0810T', 'https://manualmachine.com/makita/hm0810t/1280668-user-manual'],
  },
  'MAKITA|HM1203C': {
    specs: [['Potencia', '1.510 W / 14 A'], ['Energía de impacto', '19,1 J'], ['Impactos por minuto', '950 – 1.900'], ['Portaherramienta', 'SDS-MAX'], ['Peso', '9,7 kg'], ['Dimensiones (L×A×A)', '576 × 128 × 265 mm'], ['Otros', 'Control electrónico de velocidad · punta ajustable en 12 posiciones']],
    fuente: ['Ficha Makita México HM1203C', 'https://www.makita.com.mx/wp-content/uploads/2023/05/Ficha_HM1203C.pdf'],
    manual: ['Manual de instrucciones HM1203C', 'https://www.manualslib.de/manual/428824/Makita-Hm1203C.html'],
  },
  'MAKITA|HM1201': {
    specs: [],
    fuente: null,
    manual: ['Manual de instrucciones HM1201', 'https://manualmachine.com/makita/hm1201/20996874-instruction-manual'],
  },
  'MAKITA|BHX2500': {
    specs: [['Cilindrada', '24,5 cc (4 tiempos)'], ['Flujo máximo de aire', '8,91 m³/min'], ['Velocidad del aire', '64,6 m/s'], ['Peso', '4,4 kg (con tubo, sin combustible)'], ['Largo', '368 mm (sin tubos)'], ['Capacidad del estanque', '0,52 L']],
    fuente: ['Ficha Makita México BHX2500', 'https://www.makita.com.mx/wp-content/uploads/2021/08/Ficha_BHX2500.pdf'],
    manual: ['Manuales BHX2500', 'https://www.manualsdir.com/models/makita/bhx2500.html'],
  },
  'MAKITA|GA7020': {
    specs: [['Potencia', '2.200 W'], ['Diámetro de disco', '180 mm (7")'], ['Velocidad sin carga', '8.500 rpm'], ['Peso', '5,56 – 6,06 kg'], ['Dimensiones (L×A×A)', '473 × 200 × 140 mm']],
    fuente: ['Ficha Makita México GA7020', 'https://makita.com.mx/wp-content/uploads/2024/12/Ficha_GA7020.pdf'],
    manual: ['Manual GA7020', 'https://manualslib.mx/manual/129003/Makita-Ga7020R.html'],
  },
  'MAKITA|GA7082': {
    specs: [['Potencia', '2.700 W'], ['Diámetro de disco', '180 mm (7")'], ['Velocidad sin carga', '8.500 rpm'], ['Peso', '6,0 – 6,5 kg']],
    nota: 'En tu registro este equipo figura como esmeril de 9", pero la página de Makita lo lista con disco de 180 mm (7"). Conviene verificar la placa del equipo.',
    fuente: ['Makita India GA7082', 'https://makita.in/?p=7781'],
    manual: null,
  },
  'MAKITA|HP1630': {
    specs: [['Potencia', '710 W'], ['Capacidad concreto / acero / madera', '16 / 13 / 30 mm'], ['Velocidad sin carga', '0 – 3.200 rpm'], ['Impactos por minuto', '0 – 48.000'], ['Capacidad del mandril', '1,5 – 13 mm'], ['Peso', '2,1 kg']],
    fuente: ['Makita India HP1630', 'https://makita.in/product/hp1630/'],
    manual: ['Manual HP1630', 'https://manualslib.mx/manual/599550/Makita-Hp1630.html'],
  },
  'MAKITA|HP1641': {
    specs: [['Potencia', '680 W'], ['Velocidad sin carga', '0 – 2.800 rpm'], ['Impactos por minuto', '0 – 44.800'], ['Mandril', '1,5 – 13 mm, de acción rápida sin llave'], ['Capacidad concreto / acero / madera', '16 / 13 / 30 mm']],
    fuente: ['Ficha HP1641 (Servicios Palau)', 'https://shop.serviciospalau.es/wp-content/uploads/2024/08/hp1641k1x.pdf'],
    manual: ['Manual HP1641', 'https://manualshive.com/en/manual/makita/hp1641-hp1641k/4309458'],
  },
  'MAKITA|HR2230': {
    specs: [['Potencia', '710 W / 6,4 A'], ['Energía de impacto', '2,2 J'], ['Impactos por minuto', '0 – 4.050'], ['Velocidad sin carga', '0 – 1.050 rpm'], ['Capacidad concreto / acero / madera', '22 / 13 / 32 mm'], ['Portaherramienta', 'SDS-PLUS'], ['Peso', '2,6 kg'], ['Cable', '2,5 m']],
    fuente: ['Ficha Makita México HR2230', 'https://www.makita.com.mx/wp-content/uploads/2023/03/Ficha_HR2230.pdf'],
    manual: ['Manual HR2230', 'https://www.manualslib.com/manual/649884/Makita-Hr2230.html'],
  },
  'MAKITA|HR2600': {
    specs: [['Potencia', '800 W / 7,2 A'], ['Energía de impacto', '2,4 J'], ['Impactos por minuto', '0 – 4.600'], ['Velocidad sin carga', '0 – 1.200 rpm'], ['Capacidad concreto / acero / madera', '26 / 13 / 32 mm'], ['Portaherramienta', 'SDS-PLUS'], ['Peso', '3,0 – 3,4 kg']],
    fuente: ['Ficha Makita México HR2600', 'https://www.makita.com.mx/wp-content/uploads/2023/04/Ficha_HR2600.pdf'],
    manual: ['Manual HR2600', 'https://www.manualslib.com/manual/1131015/Makita-Hr2600.html'],
  },
  'MAKITA|HG5030': {
    specs: [['Consumo de corriente', '13 A'], ['Temperaturas del aire', '400 °C y 550 °C'], ['Caudal de aire', '200 L/min (bajo) · 400 L/min (alto)'], ['Peso', '0,56 kg'], ['Dimensiones', '233 × 80 × 208 mm']],
    fuente: ['Ficha Makita México HG5030', 'https://www.makita.com.mx/wp-content/uploads/2023/06/Ficha_HG5030.pdf'],
    manual: null,
  },
  'BOSCH|GWS17125S': {
    specs: [['Potencia', '1.700 W'], ['Velocidad en vacío', '2.800 – 11.500 rpm'], ['Diámetro de disco', '125 mm (5")'], ['Rosca del eje', '5/8"-11'], ['Peso', '2,2 kg'], ['Voltaje', '127 V (versión MX; verificar placa del equipo)']],
    fuente: ['Bosch Professional GWS 17-125 S', 'https://www.bosch-professional.com/mx/es/products/gws-17-125-s-06017D03G1'],
    manual: null,
  },
  'BOSCH|GCL215': {
    specs: [['Alcance', '15 m'], ['Precisión de nivelación', '± 0,3 mm/m'], ['Rango de autonivelación', '± 4°'], ['Láser', 'Clase 2 · 630–650 nm · < 1 mW'], ['Alimentación', '3 pilas AA de 1,5 V'], ['Autonomía máxima', '6 h (líneas cruzadas y puntos) · 16 h (solo líneas)'], ['Peso', '0,49 kg'], ['Rosca de trípode', '5/8" y 1/4"'], ['Protección', 'IP54'], ['Temperatura de trabajo', '-10 a 50 °C']],
    fuente: ['Bosch Professional GCL 2-15', 'https://www.bosch-professional.com/cl/es/products/gcl-2-15-0601066E02'],
    manual: null,
  },
  'BOSCH|GAS1225PL': {
    specs: [['Potencia', '1.250 W'], ['Caudal de aire', '65 l/s'], ['Depresión máxima', '200 mbar'], ['Capacidad del depósito', '21 l neto (25 l bruto)'], ['Peso', '9 kg'], ['Clase de polvo', 'L'], ['Voltaje', '230 V']],
    fuente: ['Bosch Professional GAS 12-25 PL', 'https://www.bosch-professional.com/cl/es/products/gas12-25-12-25ps-060197C1N0'],
    manual: ['Manual GAS 12-25', 'https://manualslib.mx/manual/502805/Bosch-Gas-12-25-Professional.html'],
  },
  'BOSCH|GAS15PS': {
    specs: [['Potencia', '1.100 W'], ['Flujo de aire', '53 l/s'], ['Depresión máxima', '270 mbar'], ['Depósito', '15 l bruto · 10 l neto (8 l para líquidos)'], ['Peso', '6 kg']],
    fuente: ['Bosch Professional GAS 15 PS', 'https://www.bosch-professional.com/cl/es/products/gas-15-ps-06019E51N0'],
    manual: ['Manual GAS 15', 'https://manualslib.mx/manual/129803/Bosch-Gas-15-Professional.html'],
  },
  'FLEX|VCE33LAC': {
    specs: [['Potencia', '1.200 W'], ['Caudal de aire', '4.500 l/min'], ['Vacío máximo', '25.000 Pa'], ['Depósito', '30 L'], ['Peso', '15,2 kg'], ['Clase de polvo', 'L'], ['Cable', '7,5 m']],
    fuente: ['Flex VCE 33 L AC', 'https://flex-tools.com/en/products/vacuum-cleaners-and-air-purifiers/safety-vacuum-cleaners/vce-33-l-ac-set'],
    manual: null,
  },
  'LUSTER|BF575': {
    specs: [['Potencia', '1.200 W (220 V / 50 Hz)'], ['Estanque', '30 L, acero inoxidable'], ['Caudal de aire', '191 m³/h'], ['Depresión', '2.000 mm columna de agua'], ['Ruido', '≤ 75 dB']],
    recs: ['Limpiar periódicamente el filtro de poliéster (es reutilizable).', 'El flotador evita que el estanque se rebalse al aspirar líquidos.'],
    nota: 'Los datos vienen de la ficha de la aspiradora Luster de 30 L; confirma que corresponde a tu modelo BF 575.',
    fuente: ['Ficha Luster aspiradora 30 L', 'https://cdn.shopify.com/s/files/1/0438/9083/5622/files/Aspiradora_30_Lts_LUSTER_BF575_1_motor.pdf'],
    manual: null,
  },
  'HONDA|WT40X': {
    specs: [['Motor', 'Honda GX390 · 4 tiempos · 389 cm³'], ['Potencia', '11,7 HP (8,7 kW) a 3.600 rpm'], ['Caudal máximo', '1.600 L/min'], ['Altura máxima de bombeo', '25 m'], ['Altura máxima de succión', '7,9 m'], ['Succión / descarga', '4" / 4"'], ['Tipo', 'Centrífuga autocebante para aguas sucias (trash)'], ['Combustible (capacidad)', '6,1 L'], ['Aceite (capacidad)', '1,1 L (con alerta de aceite)'], ['Peso en seco', '78 kg']],
    fuente: ['Ficha técnica Honda WT40X', 'https://pf.honda.com.ar/descargar/ficha_tecnica/Js6xwPyU1637317008.pdf'],
    manual: ['Folleto de bombas Honda', 'https://cdn.powerequipment.honda.com/pe/pdf/Brochures/pump_brochure.pdf?v=1'],
  },
  'CIMAR|CT65P2A': {
    specs: [['Motor (según tu registro)', 'Honda GX100'], ['Cilindrada del motor', '98 cm³'], ['Potencia neta del motor', '2,8 HP (2,1 kW) a 3.600 rpm'], ['Aceite del motor', '0,4 L'], ['Peso del motor en seco', '10,6 kg']],
    nota: 'No se encontró la ficha del apisonador Cimar CT65P-2A; arriba van los datos del motor Honda GX100 que lleva.',
    fuente: ['Ficha técnica Honda GX100', 'https://pf.honda.com.ar/descargar/ficha_tecnica/GX100KRW.pdf'],
    manual: null,
  },
  'ATLAS|LT6004': {
    specs: [['Motor (según tu registro)', 'Honda GX100'], ['Cilindrada del motor', '98 cm³'], ['Potencia neta del motor', '2,8 HP (2,1 kW) a 3.600 rpm'], ['Aceite del motor', '0,4 L'], ['Peso del motor en seco', '10,6 kg']],
    nota: 'No se encontró la ficha del apisonador Atlas (Copco) LT 6004; arriba van los datos del motor Honda GX100 que lleva.',
    fuente: ['Ficha técnica Honda GX100', 'https://pf.honda.com.ar/descargar/ficha_tecnica/GX100KRW.pdf'],
    manual: ['Despiece y manuales Atlas Copco LT6004', 'https://htsspares.com/catalogue/tool/vibration-compaction/upright-rammer-parts/atlas-copco-lt6004-upright-rammer-parts'],
  },
  'WACKER|DPU3750H': {
    specs: [['Tipo', 'Placa compactadora reversible, motor diésel (Hatz)'], ['Fuerza centrífuga', '37 kN'], ['Ancho de placa (según ficha)', '500 mm']],
    nota: 'La ficha consultada tenía el formato desordenado: verifica peso, frecuencia y velocidad en la ficha oficial.',
    fuente: ['Ficha técnica DPU3750H (BEKA)', 'https://www.beka.cl/wp-content/uploads/2026/04/Ficha_Tecnica_Placa_Compactadora_DPU3750H.pdf'],
    manual: null,
  },
  'HAULOTTE|COMPACT12': {
    specs: [['Altura de plataforma', '12 m'], ['Capacidad de carga', '300 kg'], ['Dimensiones (L×A×A)', '2.480 × 1.200 × 2.380 mm'], ['Plataforma', '2,4 × 1,2 m'], ['Peso', '2.630 kg'], ['Tipo', 'Tijera eléctrica']],
    nota: 'Datos de un aviso de arriendo de una unidad Compact 12 (2006); verificar con la placa y el manual de tu unidad.',
    fuente: ['Aviso Haulotte Compact 12 (GAM Rentals)', 'https://online.gamrentals.com/en/scissor-lift-electric/3937-2006-haulotte-compact-12'],
    manual: ['Manual Haulotte Compact 12', 'https://manualslib.mx/manual/202252/Haulotte-Compact-12-En-280.html'],
  },
  'PENTAX|AP224': {
    specs: [['Aumento', '24x, imagen derecha'], ['Apertura del objetivo', '30 mm'], ['Precisión', '2 mm por km de nivelación doble'], ['Compensador', 'Magnético, rango ±15\''], ['Distancia mínima de enfoque', '0,3 m'], ['Sensibilidad nivel circular', '8\' / 2 mm'], ['Peso', '1,25 kg'], ['Protección', 'IP55']],
    fuente: ['Ficha Pentax AP-224', 'https://cdn.shopify.com/s/files/1/0017/4171/7573/files/PENTAX_AP-224_24_x_optical_zoom_1km_levelling_run_2.0_mm.-001.pdf'],
    manual: null,
  },
  'GEOMAX|ZAL124': {
    specs: [['Aumento', '24x'], ['Apertura del objetivo', '36 mm'], ['Enfoque mínimo', '< 1,0 m'], ['Compensador', 'Automático con amortiguación por aire (±15\')'], ['Peso', '1,5 kg']],
    nota: 'Valores de la hoja de datos de la serie ZAL100; la precisión por km depende del modelo y no se pudo confirmar para el ZAL124.',
    fuente: ['Hoja de datos GeoMax serie ZAL100', 'https://cdn.shopify.com/s/files/1/0701/9433/files/GeoMax_ZAL100_DAT_en.pdf'],
    manual: null,
  },
  'GEOTECH|LDT202B': {
    specs: [['Telescopio', '30x, imagen derecha, objetivo 45 mm'], ['Lectura mínima', '1" (opcional 5")'], ['Precisión angular', '2"'], ['Compensador', '±3\''], ['Plomada láser', '1 mW, punto ≤ 2 mm'], ['Alimentación', 'Batería recargable o 4 pilas AA (≈ 45 h)'], ['Memoria', '1.000 registros'], ['Peso', '4,8 kg'], ['Temperatura de trabajo', '-20 a +50 °C']],
    fuente: ['LDT-202B (Tianjin Xing, DirectIndustry)', 'https://www.directindustry.com/prod/tianjin-xing-surveying-instrument-manufacture-co-ltd/product-169209-1972612.html'],
    manual: null,
  },
  'BERGER|32X': {
    specs: [['Aumento', '32x'], ['Alcance de trabajo', '400 ft (≈ 122 m)'], ['Compensador', 'Magnético amortiguado, con bloqueo para transporte']],
    nota: 'Datos de la línea CST/berger 55-SAL32ND (nivel automático 32x).',
    fuente: ['CST/berger 55-SAL32ND', 'https://sites.salsify.com/0b064b68-faac-4949-8b62-ca9ee1c6b803/61b4da66-d7c6-456f-a80a-f82d173323c4/product/55-SAL32ND/55-SAL32ND/'],
    manual: null,
  },
};

function _fabClave(marca, modelo) {
  const n = (s) => String(s == null ? '' : s).toUpperCase().replace(/[\s\-\.\/_]/g, '');
  return n(marca) + '|' + n(modelo);
}
// Normaliza la clave del diccionario igual que _fabClave (por si se escribió con espacios)
function fichaFabricanteDe(item) {
  const clave = _fabClave(item.marca, item.modelo);
  for (const k of Object.keys(FICHA_FABRICANTE)) {
    const [m, mo] = k.split('|');
    if (_fabClave(m, mo) === clave) return FICHA_FABRICANTE[k];
  }
  return null;
}
