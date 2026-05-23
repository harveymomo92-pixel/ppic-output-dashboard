import assert from 'node:assert/strict';

const baseUrl = process.env.WA_PARSER_BASE_URL || 'http://127.0.0.1:3000';

const fixtures = [
  {
    name: 'downtime-family-borche',
    text: `18 Mei 2026
Shift 1
Borche 02
Problem
(07:15 - 07:45 = 30 menit) Preform macet
Action: cek heater dan bersihkan jalur`,
    expect: {
      parsedRows: 1,
      matchCode: 'family:borche',
      matchSource: 'family:borche',
      warningIncludes: 'timing:explicit',
      condition: 'downtime',
    },
  },
  {
    name: 'downtime-family-direct',
    text: `19 Mei 2026
Shift 2
HF 03
Problem
Jam 16.00 - 16.20 gangguan panel listrik
Action: reset panel`,
    expect: {
      parsedRows: 1,
      matchCode: 'family:direct',
      warningIncludes: 'timing:explicit',
    },
  },
  {
    name: 'downtime-lancar-state',
    text: `20 Mei 2026
Shift 3
V-FINE 1
Problem
Lancar`,
    expect: {
      parsedRows: 0,
      structuredRows: 1,
      warningIncludes: 'state:lancar',
      condition: 'lancar',
    },
  },
  {
    name: 'production-summary',
    text: `TOTAL HASIL PRINTING
OMSO 1: Hasil = 12000
Reject print = 45
Produktivitas = 92.5%`,
    manualOnly: true,
  },
];

async function runFixture(fixture) {
  const response = await fetch(`${baseUrl}/api/downtime-events/import/wa`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      text: fixture.text,
      parserMode: 'rules',
      aiProvider: 'gemini',
      import: false,
    }),
  });

  assert.ok(response.ok, `${fixture.name}: http ${response.status}`);
  const payload = await response.json();
  const data = payload.data || {};

  assert.equal(data.parserContractVersion, 'wa-downtime-v4', `${fixture.name}: contract version`);

  if (fixture.manualOnly) {
    return {
      name: fixture.name,
      parsedRows: data.parsedRows || 0,
      structuredRows: data.parserMeta?.structuredRowCount || 0,
      productionRows: data.parserMeta?.productionRowCount || 0,
      duplicateHintCount: data.parserMeta?.duplicateHintCount || 0,
      manualOnly: true,
    };
  }

  if (fixture.expect.parsedRows !== undefined) {
    assert.equal(data.parsedRows, fixture.expect.parsedRows, `${fixture.name}: parsedRows`);
  }
  if (fixture.expect.structuredRows !== undefined) {
    assert.equal(data.parserMeta?.structuredRowCount, fixture.expect.structuredRows, `${fixture.name}: structuredRows`);
  }
  if (fixture.expect.productionRows !== undefined) {
    assert.equal(data.parserMeta?.productionRowCount, fixture.expect.productionRows, `${fixture.name}: productionRows`);
  }

  const firstRow = data.rows?.[0] || data.structuredRows?.[0] || data.productionRows?.[0] || null;
  if (fixture.expect.matchCode && firstRow) {
    assert.equal(firstRow.match_code, fixture.expect.matchCode, `${fixture.name}: match_code`);
  }
  if (fixture.expect.matchSource && firstRow) {
    assert.equal(firstRow.match_source, fixture.expect.matchSource, `${fixture.name}: match_source`);
  }
  if (fixture.expect.warningIncludes && data.rows?.[0]) {
    assert.ok(String(data.rows[0].warning_code || '').includes(fixture.expect.warningIncludes), `${fixture.name}: warning_code includes ${fixture.expect.warningIncludes}`);
  }
  if (fixture.expect.condition && data.rows?.[0]) {
    assert.equal(data.rows[0].condition, fixture.expect.condition, `${fixture.name}: condition`);
  }
  if (fixture.expect.area && data.productionRows?.[0]) {
    assert.equal(data.productionRows[0].area, fixture.expect.area, `${fixture.name}: area`);
  }

  return {
    name: fixture.name,
    parsedRows: data.parsedRows || 0,
    structuredRows: data.parserMeta?.structuredRowCount || 0,
    productionRows: data.parserMeta?.productionRowCount || 0,
    duplicateHintCount: data.parserMeta?.duplicateHintCount || 0,
  };
}

const results = [];
for (const fixture of fixtures) {
  results.push(await runFixture(fixture));
}

console.log(JSON.stringify({ ok: true, results }, null, 2));
