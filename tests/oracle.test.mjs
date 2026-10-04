import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateProject, parseProject, parseTSV, associations } from '../src/core.mjs';
import { exportFragment, exportHTML, toJSON } from '../src/export.mjs';

const oraclePath = fileURLToPath(new URL('./html_oracle.py', import.meta.url));
function runOracle(cases, shouldPass = true) {
  const run = spawnSync('python3', [oraclePath], {
    input: JSON.stringify(cases), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
  });
  assert.equal(run.error, undefined, run.error?.message);
  assert.equal(run.stderr, '', run.stderr);
  const results = JSON.parse(run.stdout);
  if (shouldPass) {
    const failed = results.filter(result => result.errors.length);
    assert.deepEqual(failed, [], JSON.stringify(failed.slice(0, 3), null, 2));
    assert.equal(run.status, 0);
  } else {
    assert.equal(run.status, 1);
    assert.ok(results.every(result => result.errors.length > 0), 'each mutation must be rejected');
  }
  return results;
}
const clone = x => JSON.parse(JSON.stringify(x));
function fixture(rows = 5, columns = 4) {
  return {
    schema: 'headermap.project.v1', id: 'example', caption: 'Independent oracle',
    rowHeaderLabel: 'Item', rowGroupLabel: 'Group',
    columns: Array.from({ length: columns }, (_, c) => ({ id: `c${c}`, label: `Column ${c}` })),
    rows: Array.from({ length: rows }, (_, r) => ({ id: `r${r}`, label: `Row ${r}`, values: Array.from({ length: columns }, (_, c) => `value-${r}-${c}`) })),
    columnGroups: [], rowGroups: [],
  };
}
function blocks(groups, axisLength) {
  if (!groups.length) return [{ id: null, label: null, start: 0, end: axisLength }];
  let start = 0;
  return groups.map(group => {
    const block = { ...group, start, end: start + group.span };
    start = block.end;
    return block;
  });
}
// This expectation builder uses only the source matrix and arithmetic ranges.
// In particular, it never calls production associations() or consumes its output.
function expectedCase(project, mode, html, name = '') {
  const rowBlocks = blocks(project.rowGroups, project.rows.length);
  const colBlocks = blocks(project.columnGroups, project.columns.length);
  const hasRG = project.rowGroups.length > 0;
  const hasCG = project.columnGroups.length > 0;
  const expected = [];
  const expectedHeaders = [];
  const seenHeaders = new Set();
  function header(id, text, scope, row, col, rowspan = 1, colspan = 1) {
    if (seenHeaders.has(id)) return;
    seenHeaders.add(id);
    expectedHeaders.push({ id, text, scope, row, col, rowspan, colspan });
  }
  for (const [r, row] of project.rows.entries()) {
    for (const [c, column] of project.columns.entries()) {
      const rb = rowBlocks.findIndex(block => block.start <= r && r < block.end);
      const cb = colBlocks.findIndex(block => block.start <= c && c < block.end);
      const rg = rowBlocks[rb], cg = colBlocks[cb];
      const split = mode === 'split';
      const prefix = split ? `${project.id}-s-${rb}-${cb}` : `${project.id}-g`;
      const headerIds = [], labels = [];
      const headerRows = split ? 1 : 1 + Number(hasCG);
      const labelColumns = split ? 1 : 1 + Number(hasRG);
      const gridRow = headerRows + r - (split ? rg.start : 0);
      const gridCol = labelColumns + c - (split ? cg.start : 0);
      if (!split && hasRG) {
        headerIds.push(`${prefix}-rg-${rg.id}`); labels.push(rg.label);
        header(`${prefix}-rg-${rg.id}`, rg.label, 'rowgroup', headerRows + rg.start, 0, rg.end - rg.start);
      }
      headerIds.push(`${prefix}-r-${row.id}`); labels.push(row.label);
      header(`${prefix}-r-${row.id}`, row.label, 'row', gridRow, split ? 0 : Number(hasRG));
      if (!split && hasCG) {
        headerIds.push(`${prefix}-cg-${cg.id}`); labels.push(cg.label);
        header(`${prefix}-cg-${cg.id}`, cg.label, 'colgroup', 0, labelColumns + cg.start, 1, cg.end - cg.start);
      }
      headerIds.push(`${prefix}-c-${column.id}`); labels.push(column.label);
      header(`${prefix}-c-${column.id}`, column.label, 'col', headerRows - 1, gridCol);
      expected.push({
        value: row.values[c], headers: labels, headerIds, rowId: row.id, colId: column.id,
        id: `${prefix}-v-${row.id}:${column.id}`,
        caption: split ? [project.caption, rg.label, cg.label].filter(x => x !== null).join(' / ') : project.caption,
        gridRow, gridCol,
        tableWidth: split ? 1 + cg.end - cg.start : labelColumns + project.columns.length,
        tableHeight: split ? 1 + rg.end - rg.start : headerRows + project.rows.length,
      });
    }
  }
  return { name, html, expected, expectedHeaders, tableCount: mode === 'split' ? rowBlocks.length * colBlocks.length : 1 };
}

// xorshift32 is seeded here; no production code or random generator is reused.
function rng(seed) {
  let x = seed >>> 0;
  return max => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) % max; };
}
function randomGroups(n, prefix, random) {
  const groups = []; let remaining = n;
  while (remaining > 0) {
    const span = 1 + random(remaining);
    groups.push({ id: `${prefix}${groups.length}`, label: `${prefix} label ${groups.length}`, span });
    remaining -= span;
  }
  return groups;
}

test('independent HTMLParser oracle covers all group-axis combinations and matrix bounds', () => {
  const cases = [];
  for (const [rowCount, colCount] of [[1, 1], [1, 12], [30, 1], [30, 12], [5, 4]]) {
    for (const groupRows of [false, true]) for (const groupColumns of [false, true]) {
      const project = fixture(rowCount, colCount);
      if (groupRows) project.rowGroups = rowCount === 1 ? [{ id: 'rg0', label: 'Only group', span: 1 }] : [{ id: 'rg0', label: 'First group', span: 1 }, { id: 'rg1', label: 'Rest group', span: rowCount - 1 }];
      if (groupColumns) project.columnGroups = colCount === 1 ? [{ id: 'cg0', label: 'Only columns', span: 1 }] : [{ id: 'cg0', label: 'First columns', span: colCount - 1 }, { id: 'cg1', label: 'Last columns', span: 1 }];
      for (const mode of ['grouped', 'split']) cases.push(expectedCase(project, mode, exportFragment(project, mode), `${rowCount}x${colCount}:${groupRows}:${groupColumns}:${mode}`));
    }
  }
  runOracle(cases);
});

test('seeded properties verify exact source coordinates, every header path, spans, and split coverage', () => {
  const random = rng(0x48EADE);
  const cases = [];
  for (let i = 0; i < 120; i++) {
    const project = fixture(1 + random(30), 1 + random(12));
    project.id = `case${i}`;
    if (random(3)) project.rowGroups = randomGroups(project.rows.length, 'rg', random);
    if (random(3)) project.columnGroups = randomGroups(project.columns.length, 'cg', random);
    for (const mode of ['grouped', 'split']) {
      const output = exportFragment(project, mode);
      assert.equal(exportFragment(clone(project), mode), output, 'identical source has byte-stable output');
      cases.push(expectedCase(project, mode, output, `seed-${i}:${mode}`));
    }
  }
  runOracle(cases);
});

test('full HTML and fragments preserve adversarial text as literal text', () => {
  const project = fixture(2, 2);
  project.caption = '<script>"caption"</script> & 日本語';
  project.rowHeaderLabel = '<img src=x onerror=alert(1)>';
  project.rowGroupLabel = 'Group < & > " \'';
  project.rows[0].label = '</th><script>alert(1)</script>';
  project.columns[0].label = '<svg onload="alert(1)"> & é';
  project.rows[0].values = ['</td><img src=x onerror=alert(1)>', '&amp; &#39; " < >'];
  project.rows[1].values = ['日本語 🔌', 'same value'];
  project.rowGroups = [{ id: 'rg0', label: 'Row <group> & "', span: 2 }];
  project.columnGroups = [{ id: 'cg0', label: 'Column </th> & \'', span: 2 }];
  runOracle(['grouped', 'split'].flatMap(mode => [
    expectedCase(project, mode, exportFragment(project, mode), `hostile fragment ${mode}`),
    expectedCase(project, mode, exportHTML(project, mode), `hostile full ${mode}`),
  ]));
});

test('duplicate display text and duplicate matrix values retain distinct source coverage', () => {
  const project = fixture(3, 3);
  project.rows.forEach(row => { row.label = 'Same'; row.values = ['value', 'value', 'value']; });
  project.columns.forEach(column => { column.label = 'Same'; });
  project.rowGroups = [{ id: 'rg0', label: 'Same', span: 1 }, { id: 'rg1', label: 'Same', span: 2 }];
  project.columnGroups = [{ id: 'cg0', label: 'Same', span: 2 }, { id: 'cg1', label: 'Same', span: 1 }];
  runOracle(['grouped', 'split'].map(mode => expectedCase(project, mode, exportFragment(project, mode), `duplicates ${mode}`)));
});

test('delimiter-bearing IDs never create duplicate rendered IDs', () => {
  const project = fixture(2, 2);
  project.rows[0].id = 'a-b'; project.rows[1].id = 'a';
  project.columns[0].id = 'c'; project.columns[1].id = 'b-c';
  runOracle(['grouped', 'split'].map(mode => expectedCase(project, mode, exportFragment(project, mode), `ambiguous IDs ${mode}`)));
});

test('oracle self-check rejects broken references, source coverage, span geometry, and unsafe markup', () => {
  const project = fixture(2, 2);
  project.rowGroups = [{ id: 'rg0', label: 'Group row', span: 2 }];
  project.columnGroups = [{ id: 'cg0', label: 'Group col', span: 2 }];
  const source = exportFragment(project);
  runOracle([expectedCase(project, 'grouped', source, 'mutation control')]);
  const mutations = [
    ['missing headers', source.replace(/ headers="[^"]+"/, '')],
    ['missing target', source.replace(/headers="[^"]+"/, 'headers="missing-id"')],
    ['duplicate header token', source.replace(/headers="([^"]+)"/, (_, path) => `headers="${path} ${path.split(' ')[0]}"`)],
    ['wrong path order', source.replace(/headers="([^"]+)"/, (_, path) => `headers="${path.split(' ').reverse().join(' ')}"`)],
    ['short row span', source.replace('scope="rowgroup" rowspan="2"', 'scope="rowgroup" rowspan="1"')],
    ['long row span', source.replace('scope="rowgroup" rowspan="2"', 'scope="rowgroup" rowspan="3"')],
    ['wrong col span', source.replace('scope="colgroup" colspan="2"', 'scope="colgroup" colspan="1"')],
    ['wrong column group', source.replace('<colgroup span="2"></colgroup><colgroup span="2">', '<colgroup span="1"></colgroup><colgroup span="3">')],
    ['missing cell', source.replace(/<td\b[^>]*>[^<]*<\/td>/, '')],
    ['duplicate cell', source.replace(/(<td\b[^>]*>[^<]*<\/td>)/, '$1$1')],
    ['wrong matrix coordinate', source.replace('data-row="r0"', 'data-row="r1"')],
    ['changed data', source.replace('value-0-0', 'CORRUPTED')],
    ['active user markup', source.replace('value-0-0', '<img src=x onerror=alert(1)>')],
    ['duplicate attribute', source.replace('data-row="r0"', 'data-row="r0" data-row="r1"')],
  ];
  runOracle(mutations.map(([name, html]) => expectedCase(project, 'grouped', html, name)), false);

  const splitProject = fixture(2, 2);
  splitProject.rowGroups = [{ id: 'rg0', label: 'First', span: 1 }, { id: 'rg1', label: 'Second', span: 1 }];
  const split = exportFragment(splitProject, 'split');
  const wrongTable = split.replace('headers="example-s-1-0-r-r1 example-s-1-0-c-c0"', 'headers="example-s-0-0-r-r0 example-s-0-0-c-c0"');
  runOracle([expectedCase(splitProject, 'split', wrongTable, 'cross-table reference')], false);
  const mergedBody = exportFragment(splitProject).replace('</tbody><tbody>', '');
  runOracle([expectedCase(splitProject, 'grouped', mergedBody, 'row groups merged in one tbody')], false);
});

test('production associations agree with source-derived paths for each source coordinate', () => {
  const project = fixture(6, 5);
  project.rowGroups = [{ id: 'rg0', label: 'Group A', span: 2 }, { id: 'rg1', label: 'Group B', span: 4 }];
  project.columnGroups = [{ id: 'cg0', label: 'Col A', span: 3 }, { id: 'cg1', label: 'Col B', span: 2 }];
  const expected = expectedCase(project, 'grouped', '').expected;
  for (const cell of expected) {
    const path = associations(project, cell.rowId, cell.colId);
    assert.deepEqual(path.map(header => header.id), cell.headerIds);
    assert.deepEqual(path.map(header => header.label), cell.headers);
    assert.deepEqual(path.map(header => header.kind), ['rowgroup', 'row', 'colgroup', 'column']);
  }
  assert.throws(() => associations(project, 'missing', project.columns[0].id));
  assert.throws(() => associations(project, project.rows[0].id, 'missing'));
});

test('JSON round-trip is exact and export/validation never mutate input', () => {
  const project = fixture(2, 3);
  project.rows[0].values = ['', '  keep surrounding spaces  ', '<&"日本語>'];
  const original = clone(project);
  const checked = validateProject(project);
  checked.rows[1].values[0] = 'mutated copy';
  assert.deepEqual(project, original);
  assert.deepEqual(parseProject(toJSON(project)), project);
  for (const mode of ['grouped', 'split']) {
    exportHTML(project, mode); exportFragment(project, mode);
  }
  assert.deepEqual(project, original);
  runOracle(['grouped', 'split'].map(mode => expectedCase(project, mode, exportFragment(project, mode), `empty and whitespace ${mode}`)));
});

const invalidProjectCases = [
  ['unknown schema', p => { p.schema = 'headermap.project.v999'; }],
  ['unknown root field', p => { p.unknown = true; }],
  ['missing root field', p => { delete p.rowGroupLabel; }],
  ['empty rows', p => { p.rows = []; }],
  ['empty columns', p => { p.columns = []; }],
  ['too many rows', p => { p.rows = fixture(31, 2).rows; }],
  ['too many columns', p => { p.columns = fixture(2, 13).columns; p.rows = fixture(2, 13).rows; }],
  ['ragged rows', p => { p.rows[0].values.pop(); }],
  ['numeric value', p => { p.rows[0].values[0] = 4; }],
  ['null value', p => { p.rows[0].values[0] = null; }],
  ['long value', p => { p.rows[0].values[0] = 'x'.repeat(241); }],
  ['long caption', p => { p.caption = 'x'.repeat(121); }],
  ['empty caption', p => { p.caption = ''; }],
  ['whitespace caption', p => { p.caption = '  '; }],
  ['surrounding label whitespace', p => { p.columns[0].label = ' spaced '; }],
  ['long label', p => { p.rows[0].label = 'x'.repeat(81); }],
  ['non-NFC label', p => { p.columns[0].label = 'e\u0301'; }],
  ['bidi control', p => { p.rows[0].values[0] = 'a\u202eb'; }],
  ['null control', p => { p.rows[0].values[0] = 'a\u0000b'; }],
  ['newline in a cell', p => { p.rows[0].values[0] = 'a\nb'; }],
  ['lone surrogate', p => { p.rows[0].values[0] = '\ud800'; }],
  ['XML noncharacter', p => { p.rows[0].values[0] = '\uffff'; }],
  ['unknown column field', p => { p.columns[0].extra = true; }],
  ['unknown row field', p => { p.rows[0].extra = true; }],
  ['duplicate row ID', p => { p.rows[1].id = p.rows[0].id; }],
  ['row-column ID collision', p => { p.rows[0].id = p.columns[0].id; }],
  ['project-row ID collision', p => { p.rows[0].id = p.id; }],
  ['numeric ID', p => { p.id = 123; }],
  ['colon ID', p => { p.rows[0].id = 'x:y'; }],
  ['non-letter initial ID', p => { p.rows[0].id = '1row'; }],
  ['long ID', p => { p.rows[0].id = 'r'.repeat(25); }],
  ['sparse rows', p => { delete p.rows[0]; }],
  ['sparse values', p => { delete p.rows[0].values[0]; }],
  ['wrong group sum', p => { p.rowGroups = [{ id: 'rg0', label: 'A', span: 1 }]; }],
  ['too large group', p => { p.columnGroups = [{ id: 'cg0', label: 'A', span: 3 }]; }],
  ['zero group span', p => { p.rowGroups = [{ id: 'rg0', label: 'A', span: 0 }, { id: 'rg1', label: 'B', span: 2 }]; }],
  ['negative group span', p => { p.rowGroups = [{ id: 'rg0', label: 'A', span: -1 }]; }],
  ['fractional group span', p => { p.rowGroups = [{ id: 'rg0', label: 'A', span: 0.5 }, { id: 'rg1', label: 'B', span: 1.5 }]; }],
  ['string group span', p => { p.rowGroups = [{ id: 'rg0', label: 'A', span: '2' }]; }],
  ['group-axis ID collision', p => { p.rowGroups = [{ id: p.rows[0].id, label: 'A', span: 2 }]; }],
  ['group-group ID collision', p => { p.rowGroups = [{ id: 'g', label: 'A', span: 2 }]; p.columnGroups = [{ id: 'g', label: 'B', span: 2 }]; }],
  ['unknown group field', p => { p.rowGroups = [{ id: 'rg0', label: 'A', span: 2, extra: true }]; }],
];
for (const [name, mutate] of invalidProjectCases) {
  test(`strict boundary: rejects ${name}`, () => {
    const project = fixture(2, 2); mutate(project);
    assert.throws(() => validateProject(project));
    assert.throws(() => exportFragment(project));
    assert.throws(() => exportHTML(project));
    assert.throws(() => toJSON(project));
  });
}

test('strict JSON rejects duplicate keys, malformed syntax, and invalid top-level values', () => {
  const raw = toJSON(fixture());
  assert.throws(() => parseProject(raw.replace('"caption":', '"id":"duplicate", "caption":')));
  assert.throws(() => parseProject(raw.replace('"caption":', '"\\u0069d":"duplicate", "caption":')));
  for (const text of ['', 'null', '[]', '{}', 'true', '{', raw + '{}']) assert.throws(() => parseProject(text));
});

test('TSV imports rectangular bounded text, BOM, CRLF, blanks, and exact cell whitespace', () => {
  const raw = '\ufeffItem\tA\tB\r\nOne\t\t  padded  \r\nTwo\t<&>\t日本語\r\n';
  const project = parseTSV(raw);
  assert.equal(project.rowHeaderLabel, 'Item');
  assert.deepEqual(project.columns.map(c => c.label), ['A', 'B']);
  assert.deepEqual(project.rows.map(r => r.values), [['', '  padded  '], ['<&>', '日本語']]);
  runOracle(['grouped', 'split'].map(mode => expectedCase(project, mode, exportFragment(project, mode), `TSV ${mode}`)));
  for (const input of ['', 'Header', 'Header\tA', 'Header\tA\nOne', 'Header\tA\nOne\tx\ty', 'Header\tA\rOne\tx', 'Header\tA\nOne\tx\n\n']) assert.throws(() => parseTSV(input));
});

test('largest valid Unicode project exports and reimports without exceeding parser capacity', () => {
  const project = fixture(30, 12);
  project.caption = '日'.repeat(120);
  project.columns.forEach(column => { column.label = '日'.repeat(80); });
  project.rows.forEach(row => { row.label = '日'.repeat(80); row.values = row.values.map(() => '日'.repeat(240)); });
  assert.deepEqual(parseProject(toJSON(project)), project);
});

test('invalid export modes cannot silently select a different representation', () => {
  for (const mode of ['', 'invalid', '__proto__']) {
    assert.throws(() => exportFragment(fixture(), mode));
    assert.throws(() => exportHTML(fixture(), mode));
  }
});
