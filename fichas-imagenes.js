// ═══════════════════════════════════════════════════════════════
// Imágenes de REFERENCIA por modelo para la portada de las fichas.
// Clave: MARCA|MODELO (misma normalización que _fabClave). Son fotos
// publicadas por fabricantes/tiendas: sirven de referencia visual del
// modelo, no son la foto de la unidad. Para agregar una, sumar una línea.
// Si un modelo no está acá, la ficha usa la foto registrada en la app
// (si existe) o muestra "Sin foto de referencia".
// ═══════════════════════════════════════════════════════════════
const FICHA_IMAGENES = {
  'MAKITA|HM0810T': 'https://www.makita.com.hk/img/?hash=de26ddf138faf2b7369fa860174cd274.jpg',
  'MAKITA|HM1203C': 'https://cdn.makitatools.com/apps/cms/img/hm1/100683f3-d96e-4a71-8af9-1e3c27193cc7_hm1203c_k_500px.png',
  'MAKITA|HM1201': 'https://easycl.vteximg.com.br/arquivos/ids/5105234/1464790-0000-001.jpg?v=638863650382470000',
  'MAKITA|BHX2500': 'https://techno.my/cdn/shop/products/BHX2500.jpg?v=1770655812',
  'MAKITA|GA7020': 'https://easycl.vteximg.com.br/arquivos/ids/7294674/1727358405948-GA70201.png?v=639215074814570000',
  'MAKITA|GA7082': 'https://cdn.makitatools.com/apps/cms/img/ga7/9d30c301-caf8-451b-b120-6196271eb9fb_ga7082_p_500px.png',
  'MAKITA|HP1630': 'https://makita.in/wp-content/uploads/2020/01/HP1630-1.jpg',
  'MAKITA|HR2230': 'https://easycl.vteximg.com.br/arquivos/ids/4824217/1171788-0000-001.jpg?v=638733520085870000',
  'MAKITA|HR2600': 'https://easycl.vteximg.com.br/arquivos/ids/4821007/1128745-0000-001.jpg?v=638733513798670000',
  'MAKITA|HG5030': 'https://easycl.vteximg.com.br/arquivos/ids/4836614/1269037-0000-001.jpg?v=638733540653500000',
  'BOSCH|GWS17125S': 'https://www.bosch-professional.com/binary/ocsmedia/optimized/750x422/o362164v54_GWS_17-125_S_dyn.png',
  'BOSCH|GCL215': 'https://easycl.vteximg.com.br/arquivos/ids/4944541/1281004-0000-001.jpg?v=638987226733830000',
  'BOSCH|GAS1225PL': 'https://www.bosch-professional.com/binary/ocsmedia/optimized/750x422/o296646v54_gas_12-25_pl_06019E5100_Sunrise_FCP.png',
  'BOSCH|GAS15PS': 'https://www.bosch-professional.com/binary/ocsmedia/optimized/750x422/o455245v54_GAS_15_PS_Hose_Dyn.png',
  'FLEX|VCE33LAC': 'https://cdn.nonpaints.com/p/ProductImages/flex_vce_33_l_ac_kit_industrie_schuurstofzuiger_1400_watt_met_30_liter_ketel_en_automatische_filterreiniging_inclusief_accessoires-1_1.jpg',
  'KRAFTER|ACK100LTS': 'https://easycl.vteximg.com.br/arquivos/ids/7584875/1713300028763-CompresorACK100.png?v=639213938015570000',
  'HONDA|WT40X': 'https://www.infoagro.com/instrumentos_medida/images/productos/motobomba_aguas_sucias_honda_wt_40_x.jpg',
  'WACKER|DPU3750H': 'https://www.norwit.pl/19782-large_default/wacker-neuson-dpu-3750-h-reversible-compactor.jpg',
  'DYNAMIC|HZR90': 'https://www.dynamic-eq.com/uploads/15.jpg',
  'ATLAS|LT6004': 'https://www.htsspares.com/media/product/image/lt6004.jpg',
  // Agregados: fotos del mismo modelo o de la misma familia (ej. HP1641K = HP1641 con maletín; D25133K = D25133)
  'KRAFTER|50LTS': 'https://krafter.cl/wp-content/uploads/2021/01/compresor-krafter-24-2coma5hp.jpg',
  'LUSTER|BF57530LTS': 'https://maktotal.cl/media/catalog/product/7/0/7021000000575_2.jpg',
  'MAKITA|HP1641': 'https://www.datapowertools.co.uk/media/catalog/product/cache/4b0f43059f25bb008a92757e8b03f7c9/c/o/config93hp1641k_1.jpg',
  'DEWALT|D25133B2C': 'https://assets.dewalt.co.uk/EMEA/PRODUCT/IMAGES/HIRES/WHITEBG/D25133K_1.jpg',
};
// Referencia por TIPO de equipo (cuando la marca/modelo no es un modelo real)
const FICHA_IMAGENES_TIPO = {
  'BETONERA': 'https://easycl.vteximg.com.br/arquivos/ids/209529/1272460-0000-001.jpg?v=638863971495330000',
  // Fotos de equipos de la misma familia, para unidades sin marca/modelo o sin foto propia del modelo
  'COMPRESOR': 'https://easycl.vteximg.com.br/arquivos/ids/7584875/1713300028763-CompresorACK100.png?v=639213938015570000',
  'MOTOBOMBA': 'https://www.infoagro.com/instrumentos_medida/images/productos/motobomba_aguas_sucias_honda_wt_40_x.jpg',
  'PLACA COMPACTADORA': 'https://www.dynamic-eq.com/uploads/15.jpg',
  'VIBROAPISONADOR': 'https://www.htsspares.com/media/product/image/lt6004.jpg',
  'ASPIRADORA': 'https://cdn.nonpaints.com/p/ProductImages/flex_vce_33_l_ac_kit_industrie_schuurstofzuiger_1400_watt_met_30_liter_ketel_en_automatische_filterreiniging_inclusief_accessoires-1_1.jpg',
  'SOPLADOR': 'https://techno.my/cdn/shop/products/BHX2500.jpg?v=1770655812',
  'DEMOLEDOR': 'https://www.makita.com.hk/img/?hash=de26ddf138faf2b7369fa860174cd274.jpg',
  'ROTOMARTILLO': 'https://easycl.vteximg.com.br/arquivos/ids/4821007/1128745-0000-001.jpg?v=638733513798670000',
  'TALADRO': 'https://makita.in/wp-content/uploads/2020/01/HP1630-1.jpg',
};

// Devuelve la URL de la foto de portada: modelo → tipo → foto registrada en la app.
function fichaImagenDe(item) {
  const clave = _fabClave(item.marca, item.modelo);
  for (const k of Object.keys(FICHA_IMAGENES)) {
    const [m, mo] = k.split('|');
    if (_fabClave(m, mo) === clave) return FICHA_IMAGENES[k];
  }
  const eq = String(item.equipo || '').toUpperCase();
  for (const t of Object.keys(FICHA_IMAGENES_TIPO)) if (eq.includes(t)) return FICHA_IMAGENES_TIPO[t];
  // Foto registrada en la app: solo si es un ID o link de Drive (el nombre suelto no se puede resolver)
  const f = String(item.imagen || item.foto || '').trim();
  const m = f.match(/\/d\/([-\w]{20,})/) || f.match(/[?&]id=([-\w]{20,})/) || (/^[-\w]{25,}$/.test(f) ? [null, f] : null);
  return m ? `https://drive.google.com/thumbnail?id=${m[1]}&sz=w800` : '';
}
