import { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const requiredHeaders = ['event_date', 'shift_code', 'area', 'machine', 'line', 'category', 'start_time', 'end_time'];
const optionalHeaders = ['status', 'pic', 'root_cause', 'action_taken'];
const inputHeaders = [...requiredHeaders, ...optionalHeaders];

const exampleInputRow = ['2026-05-19', 'Shift 1', 'INJECTION', 'MESIN 01', 'LINE A', 'machine-trouble', '08:00', '08:45', 'open', 'Andi', 'Motor overheat', 'Replace bearing'];

const guideRows = [
  ['event_date', 'Wajib', '2026-05-19', 'Tanggal kejadian'],
  ['shift_code', 'Wajib', 'Shift 1', 'Kode shift'],
  ['area', 'Wajib', 'INJECTION', 'Area kerja'],
  ['machine', 'Wajib', 'MESIN 01', 'Nama mesin'],
  ['line', 'Wajib', 'LINE A', 'Line / prod line'],
  ['category', 'Wajib', 'machine-trouble', 'setup / machine-trouble / material / mould / electrical / qc-hold / waiting-order / cleaning / minor-stop / other'],
  ['start_time', 'Wajib', '08:00', 'Format HH:MM'],
  ['end_time', 'Wajib', '08:45', 'Format HH:MM'],
  ['status', 'Opsional', 'open', 'open / monitoring / closed'],
  ['pic', 'Opsional', 'Andi', 'Nama PIC'],
  ['root_cause', 'Opsional', 'Motor overheat', 'Akar masalah'],
  ['action_taken', 'Opsional', 'Replace bearing', 'Tindakan / follow up'],
  ['duration_minutes', 'Tidak perlu', '', 'Akan dihitung otomatis dari start/end'],
  ['estimated_loss_output', 'Tidak perlu', '', 'Akan dihitung dari sistem'],
];

function escapeXml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function colName(index: number) {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function xmlCell(ref: string, value: string, styleId?: number) {
  const styleAttr = styleId === undefined ? '' : ` s="${styleId}"`;
  return `<c r="${ref}"${styleAttr} t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
}

function xmlRow(rowNumber: number, values: string[], styleMap?: number[]) {
  const cells = values.map((value, index) => xmlCell(`${colName(index)}${rowNumber}`, value, styleMap?.[index]));
  return `<row r="${rowNumber}">${cells.join('')}</row>`;
}

function xmlSheet(rows: string[]) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>
    ${rows.join('')}
  </sheetData>
</worksheet>`;
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(value: number) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value & 0xffff, 0);
  return buffer;
}

function u32(value: number) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value >>> 0, 0);
  return buffer;
}

function makeZip(files: Array<{ name: string; data: Buffer }>) {
  const parts: Buffer[] = [];
  const centralDirectory: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBuffer = Buffer.from(file.name, 'utf8');
    const data = file.data;
    const crc = crc32(data);
    const localHeader = Buffer.concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(nameBuffer.length),
      u16(0),
      nameBuffer,
    ]);
    parts.push(localHeader, data);

    const centralHeader = Buffer.concat([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(nameBuffer.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      nameBuffer,
    ]);
    centralDirectory.push(centralHeader);
    offset += localHeader.length + data.length;
  }

  const central = Buffer.concat(centralDirectory);
  const end = Buffer.concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(central.length),
    u32(offset),
    u16(0),
  ]);
  return Buffer.concat([...parts, central, end]);
}

function buildStylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2">
    <font><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>
  </fonts>
  <fills count="4">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF59E0B"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFE5E7EB"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border><left style="thin"><color rgb="FFD1D5DB"/></left><right style="thin"><color rgb="FFD1D5DB"/></right><top style="thin"><color rgb="FFD1D5DB"/></top><bottom style="thin"><color rgb="FFD1D5DB"/></bottom><diagonal/></border>
  </borders>
  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>
  <cellXfs count="3">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
    <xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
  </cellXfs>
  <cellStyles count="1">
    <cellStyle name="Normal" xfId="0" builtinId="0"/>
  </cellStyles>
  <dxfs count="0"/>
  <tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/>
</styleSheet>`;
}

function buildXlsxTemplate() {
  const inputHeaderStyles = inputHeaders.map((header) => (requiredHeaders.includes(header) ? 1 : 2));
  const inputSheet = xmlSheet([
    xmlRow(1, inputHeaders, inputHeaderStyles),
    xmlRow(2, Array.from({ length: inputHeaders.length }, () => ''), Array.from({ length: inputHeaders.length }, () => 0)),
  ]);
  const exampleSheet = xmlSheet([
    xmlRow(1, inputHeaders, inputHeaderStyles),
    xmlRow(2, exampleInputRow, Array.from({ length: exampleInputRow.length }, () => 0)),
  ]);
  const guideHeader = ['Field', 'Status', 'Contoh', 'Catatan'];
  const guideSheet = xmlSheet([
    xmlRow(1, guideHeader, [2, 2, 2, 2]),
    ...guideRows.map((row, idx) => xmlRow(idx + 2, row, [0, 0, 0, 0])),
  ]);

  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Input" sheetId="1" r:id="rId1"/>
    <sheet name="Contoh" sheetId="2" r:id="rId2"/>
    <sheet name="Panduan" sheetId="3" r:id="rId3"/>
  </sheets>
</workbook>`;
  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/>
  <Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

  return makeZip([
    { name: '[Content_Types].xml', data: Buffer.from(contentTypes, 'utf8') },
    { name: '_rels/.rels', data: Buffer.from(rels, 'utf8') },
    { name: 'xl/workbook.xml', data: Buffer.from(workbook, 'utf8') },
    { name: 'xl/_rels/workbook.xml.rels', data: Buffer.from(workbookRels, 'utf8') },
    { name: 'xl/styles.xml', data: Buffer.from(buildStylesXml(), 'utf8') },
    { name: 'xl/worksheets/sheet1.xml', data: Buffer.from(inputSheet, 'utf8') },
    { name: 'xl/worksheets/sheet2.xml', data: Buffer.from(exampleSheet, 'utf8') },
    { name: 'xl/worksheets/sheet3.xml', data: Buffer.from(guideSheet, 'utf8') },
  ]);
}

export async function GET(request: NextRequest) {
  const format = request.nextUrl.searchParams.get('format') || 'csv';
  if (format === 'xlsx') {
    const buffer = buildXlsxTemplate();
    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="downtime-backfill-template.xlsx"',
        'Cache-Control': 'no-store',
      },
    });
  }

  const csv = `${inputHeaders.join(',')}\n`;
  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="downtime-backfill-template.csv"',
      'Cache-Control': 'no-store',
    },
  });
}
