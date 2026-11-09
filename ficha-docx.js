// ═══════════════════════════════════════════════════════════════
// Generador del archivo .docx de la ficha técnica — MISMA estructura que la
// ficha modelo (cabecera con logo + código/versión/fecha/página, título,
// portada con foto, secciones numeradas con tablas azul marino, viñetas, pie).
// Se arma en el navegador, se sube al Apps Script (acción
// 'drive_docx_to_doc') y Google lo convierte a Doc. Para actualizar una
// ficha se vuelve a generar y se reemplaza el contenido del mismo Doc.
// Depende de ficha-docx-base.js (FD_BASE, FD_LOGO_B64).
// ═══════════════════════════════════════════════════════════════
const _FD_RF = '<w:rFonts w:ascii="Calibri" w:cs="Calibri" w:eastAsia="Calibri" w:hAnsi="Calibri"/>';
function _fdEsc(s) {
  return String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function _fdRun(text, o) {
  o = o || {};
  const sz = o.sz || 21;
  return `<w:r><w:rPr>${_FD_RF}${o.b ? '<w:b/><w:bCs/>' : ''}${o.i ? '<w:i/><w:iCs/>' : ''}${o.color ? `<w:color w:val="${o.color}"/>` : ''}<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr><w:t xml:space="preserve">${_fdEsc(text)}</w:t></w:r>`;
}
function _fdPara(runs, o) {
  o = o || {};
  const sp = (o.after !== undefined || o.before !== undefined || o.line)
    ? `<w:spacing${o.after !== undefined ? ` w:after="${o.after}"` : ''}${o.before !== undefined ? ` w:before="${o.before}"` : ''}${o.line ? ` w:line="${o.line}"` : ''}/>` : '';
  const num = o.num ? `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="${o.num}"/></w:numPr>` : '';
  return `<w:p><w:pPr>${o.style ? `<w:pStyle w:val="${o.style}"/>` : ''}${o.keepNext ? '<w:keepNext/>' : ''}${num}${sp}${o.jc ? `<w:jc w:val="${o.jc}"/>` : ''}</w:pPr>${Array.isArray(runs) ? runs.join('') : runs}</w:p>`;
}
const _FD_BORD = '<w:tcBorders><w:top w:val="single" w:color="000000" w:sz="4"/><w:left w:val="single" w:color="000000" w:sz="4"/><w:bottom w:val="single" w:color="000000" w:sz="4"/><w:right w:val="single" w:color="000000" w:sz="4"/></w:tcBorders>';
const _FD_MAR = '<w:tcMar><w:top w:type="dxa" w:w="40"/><w:left w:type="dxa" w:w="80"/><w:bottom w:type="dxa" w:w="40"/><w:right w:type="dxa" w:w="80"/></w:tcMar>';
function _fdCell(w, parasXml, fill, valign) {
  return `<w:tc><w:tcPr><w:tcW w:type="dxa" w:w="${w}"/>${_FD_BORD}${fill ? `<w:shd w:fill="${fill}" w:color="auto" w:val="clear"/>` : ''}${_FD_MAR}<w:vAlign w:val="${valign || 'top'}"/></w:tcPr>${parasXml}</w:tc>`;
}
const _FD_TBLPR = (total) => `<w:tblPr><w:tblW w:type="dxa" w:w="${total}"/><w:tblBorders><w:top w:val="single" w:color="auto" w:sz="4"/><w:left w:val="single" w:color="auto" w:sz="4"/><w:bottom w:val="single" w:color="auto" w:sz="4"/><w:right w:val="single" w:color="auto" w:sz="4"/><w:insideH w:val="single" w:color="auto" w:sz="4"/><w:insideV w:val="single" w:color="auto" w:sz="4"/></w:tblBorders></w:tblPr>`;
const _fdCeldaTexto = (txt, o) => String(txt == null ? '' : txt).split('\n').map(l => _fdPara(_fdRun(l, { b: o && o.b, sz: 18 }), { after: 20, before: 20, jc: (o && o.jc) || 'left' })).join('');
// Tabla estándar: encabezado azul marino + filas. La 1.ª columna va en negrita.
function _fdTabla(widths, heads, rows, opts) {
  opts = opts || {};
  const total = widths.reduce((a, b) => a + b, 0);
  const th = `<w:tr><w:trPr><w:tblHeader/></w:trPr>${heads.map((h, i) => _fdCell(widths[i],
    _fdPara(_fdRun(h, { b: 1, color: 'FFFFFF', sz: 18 }), { after: 20, before: 20, jc: 'center' }), '1F3864', 'center')).join('')}</w:tr>`;
  const tr = rows.map(r => `<w:tr><w:trPr><w:cantSplit/></w:trPr>${r.map((c, i) =>
    _fdCell(widths[i], _fdCeldaTexto(c, { b: i === 0 && opts.primeraNegrita !== false }), null, 'top')).join('')}</w:tr>`).join('');
  return `<w:tbl>${_FD_TBLPR(total)}<w:tblGrid>${widths.map(w => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>${th}${tr}</w:tbl>`;
}
// Tabla de 4 columnas (Campo/Dato/Campo/Dato), como la hoja de vida modelo: más compacta.
function _fdTabla4(pares) {
  const W = [1900, 3086, 1900, 3086];
  const head = ['Campo', 'Dato', 'Campo', 'Dato'];
  const filas = [];
  for (let i = 0; i < pares.length; i += 2) {
    const a = pares[i], b = pares[i + 1] || ['', ''];
    filas.push([a[0], a[1], b[0], b[1]]);
  }
  const th = `<w:tr><w:trPr><w:tblHeader/></w:trPr>${head.map((h, i) => _fdCell(W[i], _fdPara(_fdRun(h, { b: 1, color: 'FFFFFF', sz: 18 }), { after: 20, before: 20, jc: 'center' }), '1F3864', 'center')).join('')}</w:tr>`;
  const tr = filas.map(r => `<w:tr><w:trPr><w:cantSplit/></w:trPr>${r.map((c, i) => _fdCell(W[i], _fdCeldaTexto(c, { b: i % 2 === 0 }), null, 'top')).join('')}</w:tr>`).join('');
  return `<w:tbl>${_FD_TBLPR(9972)}<w:tblGrid>${W.map(w => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>${th}${tr}</w:tbl>`;
}
const _fdH2 = (t) => _fdPara(_fdRun(t, { b: 1, sz: 22 }), { style: 'Heading2', keepNext: true, after: 60, before: 160 });
const _fdEspacio = () => '<w:p><w:pPr><w:spacing w:after="80"/></w:pPr></w:p>';
const _fdBullet = (t) => _fdPara(_fdRun(t, { sz: 21 }), { style: 'ListParagraph', num: 2, after: 60, before: 20, jc: 'both' });
const _fdTexto = (t, o) => _fdPara(_fdRun(t, { sz: 21, ...(o || {}) }), { after: 80, before: 40, line: 264, jc: 'both' });

function _fdCabecera(tituloCab, codigo, fecha) {
  const r16 = (t, b) => _fdRun(t, { b, sz: 16 });
  const campo = (k, v) => `<w:p>${r16(k, 1)}${r16(v, 0)}</w:p>`;
  const fld = (instr) => `<w:r><w:rPr>${_FD_RF}<w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr><w:fldChar w:fldCharType="begin"/><w:instrText xml:space="preserve">${instr}</w:instrText><w:fldChar w:fldCharType="separate"/><w:t>1</w:t><w:fldChar w:fldCharType="end"/></w:r>`;
  const logo = `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="530000" cy="424000"/><wp:effectExtent t="0" r="0" b="0" l="0"/><wp:docPr id="1" name="Logo" descr="Logo"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="0" name="logo.jpg"/><pic:cNvPicPr><a:picLocks noChangeAspect="1" noChangeArrowheads="1"/></pic:cNvPicPr></pic:nvPicPr><pic:blipFill><a:blip r:embed="rId1" cstate="none"/><a:srcRect/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr bwMode="auto"><a:xfrm><a:off x="0" y="0"/><a:ext cx="530000" cy="424000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
  const c1 = _fdCell(2393,
    `<w:p><w:pPr><w:spacing w:after="20" w:before="0"/><w:jc w:val="center"/></w:pPr>${logo}</w:p>`
    + _fdPara(r16('CONSTRUCTORA LST', 1), { jc: 'center' })
    + _fdPara(r16('Flota y Equipos', 0), { jc: 'center' }), null, 'center');
  const c2 = _fdCell(4787, _fdPara(_fdRun(tituloCab, { b: 1, sz: 18 }), { jc: 'center' }), 'D9E2F3', 'center');
  const c3 = _fdCell(2792, campo('Código: ', codigo) + campo('Versión: ', '00') + campo('Fecha: ', fecha)
    + `<w:p>${r16('Página ', 1)}${fld('PAGE')}${r16(' de ', 0)}${fld('NUMPAGES')}</w:p>`, null, 'center');
  return `${FD_BASE.hdrRoot}<w:tbl>${_FD_TBLPR(9972)}<w:tblGrid><w:gridCol w:w="2393"/><w:gridCol w:w="4787"/><w:gridCol w:w="2792"/></w:tblGrid><w:tr>${c1}${c2}${c3}</w:tr></w:tbl><w:p/></w:hdr>`;
}
function _fdPie(texto) {
  return `${FD_BASE.ftrRoot}<w:p><w:pPr><w:pBdr><w:top w:val="single" w:color="808080" w:sz="4" w:space="2"/></w:pBdr></w:pPr>${_fdRun(texto, { color: '595959', sz: 14 })}</w:p></w:ftr>`;
}

// ── ZIP (sin compresión) ───────────────────────────────────────
const _FD_CRC = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function _fdCrc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = _FD_CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function _fdZip(files) { // files: [{name, data:Uint8Array}]
  const enc = new TextEncoder(); const parts = []; const central = []; let offset = 0;
  const u16 = (v) => [v & 255, (v >>> 8) & 255]; const u32 = (v) => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
  files.forEach(f => {
    const nm = enc.encode(f.name); const crc = _fdCrc32(f.data); const sz = f.data.length;
    const lh = new Uint8Array([0x50, 0x4b, 3, 4, ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(sz), ...u32(sz), ...u16(nm.length), ...u16(0)]);
    parts.push(lh, nm, f.data);
    central.push(new Uint8Array([0x50, 0x4b, 1, 2, ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(sz), ...u32(sz), ...u16(nm.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)]), nm);
    offset += lh.length + nm.length + sz;
  });
  const cdSize = central.reduce((a, p) => a + p.length, 0);
  const end = new Uint8Array([0x50, 0x4b, 5, 6, ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(cdSize), ...u32(offset), ...u16(0)]);
  const all = [...parts, ...central, end]; const out = new Uint8Array(all.reduce((a, p) => a + p.length, 0));
  let o = 0; all.forEach(p => { out.set(p, o); o += p.length; }); return out;
}
function _fdB64aBytes(b64) { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; }
function _fdBytesAB64(u) { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); }

// Arma el .docx. cuerpo = XML de los elementos del body (sin sectPr).
function _fdArmarDocx(tituloCab, codigo, fecha, cuerpo, links) {
  const enc = new TextEncoder(); const T = (s) => enc.encode(s);
  links = links || [];
  const relsLinks = links.map((u, i) => `<Relationship Id="rIdL${i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${_fdEsc(u)}" TargetMode="External"/>`).join('');
  const NS = 'http://schemas.openxmlformats.org/package/2006/relationships'; const RT = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const sect = '<w:sectPr><w:headerReference w:type="default" r:id="rId7"/><w:footerReference w:type="default" r:id="rId8"/><w:pgSz w:w="12240" w:h="15840" w:orient="portrait"/><w:pgMar w:top="1300" w:right="1134" w:bottom="1000" w:left="1134" w:header="450" w:footer="400" w:gutter="0"/><w:pgNumType/><w:docGrid w:linePitch="360"/></w:sectPr>';
  const hoy = new Date().toLocaleDateString('es-CL');
  return _fdZip([
    { name: '[Content_Types].xml', data: T('<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default ContentType="image/png" Extension="png"/><Default ContentType="image/jpeg" Extension="jpg"/><Default ContentType="application/vnd.openxmlformats-package.relationships+xml" Extension="rels"/><Default ContentType="application/xml" Extension="xml"/><Override ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml" PartName="/word/document.xml"/><Override ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml" PartName="/word/styles.xml"/><Override ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml" PartName="/word/numbering.xml"/><Override ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml" PartName="/word/settings.xml"/><Override ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml" PartName="/word/header1.xml"/><Override ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml" PartName="/word/footer1.xml"/></Types>') },
    { name: '_rels/.rels', data: T(`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="${NS}"><Relationship Id="rId1" Type="${RT}/officeDocument" Target="word/document.xml"/></Relationships>`) },
    { name: 'word/_rels/document.xml.rels', data: T(`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="${NS}"><Relationship Id="rId1" Type="${RT}/styles" Target="styles.xml"/><Relationship Id="rId2" Type="${RT}/numbering" Target="numbering.xml"/><Relationship Id="rId5" Type="${RT}/settings" Target="settings.xml"/><Relationship Id="rId7" Type="${RT}/header" Target="header1.xml"/><Relationship Id="rId8" Type="${RT}/footer" Target="footer1.xml"/>${relsLinks}</Relationships>`) },
    { name: 'word/document.xml', data: T(`<?xml version="1.0" encoding="UTF-8"?>${FD_BASE.docRoot}<w:body>${cuerpo}${sect}</w:body></w:document>`) },
    { name: 'word/styles.xml', data: T(FD_BASE.styles) },
    { name: 'word/numbering.xml', data: T(FD_BASE.numbering) },
    { name: 'word/settings.xml', data: T(FD_BASE.settings) },
    { name: 'word/header1.xml', data: T(`<?xml version="1.0" encoding="UTF-8"?>${_fdCabecera(tituloCab, codigo, fecha || hoy)}`) },
    { name: 'word/_rels/header1.xml.rels', data: T(`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="${NS}"><Relationship Id="rId1" Type="${RT}/image" Target="media/logo.jpg"/></Relationships>`) },
    { name: 'word/footer1.xml', data: T(`<?xml version="1.0" encoding="UTF-8"?>${_fdPie('Constructora LST · Ficha generada desde la app Flota y Equipos · Los datos reflejan lo registrado en la app a la fecha de la ficha')}`) },
    { name: 'word/media/logo.jpg', data: _fdB64aBytes(FD_LOGO_B64) },
  ]);
}

// Título + subtítulo + portada (marcador de la foto, que luego reemplaza la imagen)
function _fdPortada(titulo, subtitulo) {
  return _fdPara(_fdRun(titulo, { b: 1, sz: 28 }), { after: 40, before: 40, line: 264, jc: 'center' })
    + _fdPara(_fdRun(subtitulo, { sz: 22 }), { after: 160, before: 40, line: 264, jc: 'center' })
    + _fdPara(_fdRun('{{FOTO_PORTADA}}', { sz: 18, color: '808080' }), { jc: 'center' });
}
const _fdNota = (t) => _fdPara(_fdRun(t, { sz: 16 }), { after: 100, before: 40, line: 264, jc: 'center' });
const _fdFirma = (t) => _fdPara(_fdRun(t, { sz: 16 }), { after: 100, before: 200, line: 264, jc: 'center' });
function _fdLinkRun(texto, links, url) {
  links.push(url);
  return `<w:hyperlink r:id="rIdL${links.length - 1}">${_fdRun(texto, { sz: 21, color: '0563C1' })}</w:hyperlink>`;
}

// Sube el .docx al Apps Script → Doc de Google. Con fileId intenta reemplazar
// el contenido de ESE Doc (el link no cambia); si no se puede, crea uno nuevo
// y lo devuelve (reemplazado:false) para que se actualice el link.
async function fichaSubirDocx(modulo, nombre, bytes, parentId, fileId) {
  const data = await _driveCall('drive_docx_to_doc', modulo, {
    name: nombre, parentId: parentId || '', fileId: fileId || '', docxB64: _fdBytesAB64(bytes),
  });
  return { id: data.file.id, reemplazado: !!data.replaced };
}
