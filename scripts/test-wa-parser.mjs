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
    name: 'downtime-hengfeng-compact-state',
    text: `20 Mei 2026
Shift 1
Hengfeng 3
Problem
Lancar`,
    parserMode: 'hybrid',
    expect: {
      parsedRows: 1,
      structuredRows: 1,
      matchCode: 'ai:catalog-exact',
      matchSource: 'ai:catalog-exact',
      warningIncludes: 'state:lancar',
      condition: 'lancar',
      aiUsed: true,
    },
  },
  {
    name: 'downtime-lancar-zero-duration',
    text: `23 Mei 2026
Shift 1
Borche 02
Problem
Lancar`,
    expect: {
      parsedRows: 0,
      structuredRows: 1,
      warningIncludes: 'state:lancar',
      condition: 'lancar',
      startTime: '07:00',
      endTime: '07:00',
      durationMinutes: 0,
    },
  },
  {
    name: 'downtime-off-full-shift',
    text: `23 Mei 2026
Shift 3
V-FINE 1
Problem
Off`,
    expect: {
      parsedRows: 0,
      structuredRows: 1,
      warningIncludes: 'state:off',
      condition: 'off',
      startTime: '23:00',
      endTime: '07:00',
      durationMinutes: 480,
    },
  },
  {
    name: 'downtime-standby-state',
    text: `23 Mei 2026
Shift 2
HF 03
Problem
Waiting order`,
    expect: {
      parsedRows: 0,
      structuredRows: 1,
      warningIncludes: 'state:standby',
      condition: 'standby',
    },
  },
  {
    name: 'downtime-duration-inferred-from-shift-start',
    text: `24 Mei 2026
Shift 2
Hengfeng 3
Problem
(30 menit) sensor macet di conveyor`,
    expect: {
      parsedRows: 1,
      structuredRows: 1,
      warningIncludes: 'timing:duration_inferred',
      condition: 'downtime',
      startTime: '15:00',
      endTime: '15:30',
      durationMinutes: 30,
    },
  },
  {
    name: 'downtime-raw-machine-review-gate',
    text: `25 Mei 2026
Shift 1
XYZ 99
Problem
Macet`,
    expect: {
      parsedRows: 1,
      structuredRows: 1,
      condition: 'unknown',
      reviewRequired: true,
      qualityRisk: 'medium',
    },
  },
  {
    name: 'downtime-ai-reason-action-format',
    text: `21 Mei 2026
Shift 2
Hengfeng 3
Problem
(09:10 - 09:40 = 30 menit) Sensor outfeed error karena botol nyangkut di conveyor
Action: MTC reset sensor dan bersihkan jalur outfeed`,
    parserMode: 'hybrid',
    expect: {
      parsedRows: 1,
      structuredRows: 1,
      matchCode: 'ai:catalog-exact',
      matchSource: 'ai:catalog-exact',
      aiUsed: true,
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
      parserMode: fixture.parserMode || 'rules',
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
  if (firstRow && !fixture.manualOnly) {
    assert.ok(String(firstRow.match_reason || '').trim(), `${fixture.name}: match_reason populated`);
    assert.ok(String(firstRow.warning_code || '').trim() || String(firstRow.warning || '').trim(), `${fixture.name}: warning populated`);
  }
  if (fixture.expect.warningIncludes && data.rows?.[0]) {
    assert.ok(String(data.rows[0].warning_code || '').includes(fixture.expect.warningIncludes), `${fixture.name}: warning_code includes ${fixture.expect.warningIncludes}`);
  }
  if (fixture.expect.condition && data.rows?.[0]) {
    assert.equal(data.rows[0].condition, fixture.expect.condition, `${fixture.name}: condition`);
  }
  if (fixture.expect.startTime) {
    const targetRow = data.rows?.[0] || data.structuredRows?.[0] || null;
    const actualStart = targetRow ? (targetRow.start_time || targetRow.start || '') : '';
    assert.equal(actualStart, fixture.expect.startTime, `${fixture.name}: startTime`);
  }
  if (fixture.expect.endTime) {
    const targetRow = data.rows?.[0] || data.structuredRows?.[0] || null;
    const actualEnd = targetRow ? (targetRow.end_time || targetRow.end || '') : '';
    assert.equal(actualEnd, fixture.expect.endTime, `${fixture.name}: endTime`);
  }
  if (fixture.expect.durationMinutes !== undefined) {
    const targetRow = data.rows?.[0] || data.structuredRows?.[0] || null;
    const actualDuration = targetRow ? (targetRow.duration_minutes ?? targetRow.durasi_menit ?? 0) : 0;
    assert.equal(actualDuration, fixture.expect.durationMinutes, `${fixture.name}: durationMinutes`);
  }
  if (fixture.expect.reviewRequired !== undefined) {
    assert.equal(Boolean(data.quality?.reviewRequired), fixture.expect.reviewRequired, `${fixture.name}: reviewRequired`);
  }
  if (fixture.expect.qualityRisk) {
    assert.equal(data.quality?.riskLevel, fixture.expect.qualityRisk, `${fixture.name}: quality risk`);
  }
  if (fixture.name === 'downtime-ai-reason-action-format' && data.rows?.[0]) {
    const root = (data.rows[0].root_cause || '').toLowerCase();
    const action = (data.rows[0].action_taken || '').toLowerCase();
    assert.ok(!/^(problem|issue|gangguan|trouble|macet|mesin mati|stop)\b/i.test(root), `${fixture.name}: root_cause not generic`);
    assert.ok(/sensor|conveyor|botol|outfeed/i.test(root), `${fixture.name}: root_cause specific`);
    assert.ok(/reset|bersih|cek/i.test(action), `${fixture.name}: action specific`);
    assert.ok(!/^(korektif|preventif|pic)\s*:/i.test(action), `${fixture.name}: action natural`);
  }
  if (fixture.expect.aiUsed !== undefined) {
    assert.equal(data.aiUsed, fixture.expect.aiUsed, `${fixture.name}: aiUsed`);
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
