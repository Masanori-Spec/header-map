import test from 'node:test';
import assert from 'node:assert/strict';
import { createDOM, Element } from './dom-stub.mjs';
import { sample, small } from '../src/examples.mjs';
import { toJSON } from '../src/export.mjs';
let serial = 0;
async function app() {
  const dom = createDOM(); globalThis.document = dom.document; globalThis.window = dom.window;
  await import(`../src/app.mjs?domtest=${serial++}`);
  const $ = id => dom.document.getElementById(id);
  const find = selector => dom.document.querySelector(selector);
  async function input(id, value) { const el = $(id); el.value = value; await el.emit('input'); }
  async function change(id, value) { const el = $(id); el.value = value; await el.emit('change'); }
  return { ...dom, $, find, input, change };
}
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function fileEvent(ui, bodyPromise, name = 'import.json') {
  const input = ui.$('file'); input.files = [{ size: 100, name, arrayBuffer: () => bodyPromise.then(body=>new TextEncoder().encode(body).buffer) }]; return input.emit('change');
}

test('split-mode inspector highlights the actual split headers and exposes their IDs', async () => {
  const ui = await app();
  await ui.find('[data-mode="split"]').click();
  const selected = ui.document.querySelectorAll('#preview td[data-row]').find(td => td.classList.contains('selected-cell'));
  assert.ok(selected);
  const actualHeaders = selected.getAttribute('headers').split(' ');
  const highlighted = ui.document.querySelectorAll('#preview th').filter(th => th.classList.contains('associated-header')).map(th => th.id);
  assert.deepEqual(highlighted.sort(), [...actualHeaders].sort());
  const displayed = ui.$('heading-path').querySelectorAll('code').map(code => code.textContent);
  assert.deepEqual(displayed, actualHeaders);
});

test('draft cell, metadata, axis label, and invalid group span survive mode/language/axis rerenders', async () => {
  const ui = await app();
  await ui.input('cell-value', 'unsaved cell'); await ui.input('caption-input', 'unsaved caption');
  const label = ui.$('axis-list').querySelector('[data-label="0"]'); label.value = 'unsaved row'; await ui.$('axis-list').emit('input', { target: label });
  const span = ui.$('group-list').querySelector('[data-span="0"]');
  assert.ok(span, 'sample has row groups'); span.value = '0'; await ui.$('group-list').emit('input', { target: span });
  for (const selector of ['[data-lang="en"]', '[data-mode="split"]', '[data-axis="columns"]', '[data-axis="rows"]']) await ui.find(selector).click();
  assert.equal(ui.$('caption-input').value, 'unsaved caption'); assert.equal(ui.$('cell-value').value, 'unsaved cell');
  assert.equal(ui.$('axis-list').querySelector('[data-label="0"]').value, 'unsaved row');
  assert.equal(ui.$('group-list').querySelector('[data-span="0"]').value, '0');
  assert.equal(ui.$('dirty').hidden, false);
  assert.ok(ui.document.querySelectorAll('[data-export]').every(el => el.disabled));
  await ui.find('[data-apply]').click();
  assert.equal(ui.$('notice').getAttribute('role'), 'alert');
  assert.equal(ui.$('cell-value').value, 'unsaved cell');
});

test('moving selected coordinates preserves identity and draft values survive selection changes', async () => {
  const ui = await app();
  const firstRow = sample.rows[0].id, secondRow = sample.rows[1].id;
  await ui.input('cell-value', 'first row draft');
  await ui.change('selected-row', secondRow); await ui.input('cell-value', 'second row draft');
  await ui.change('selected-row', firstRow);
  assert.equal(ui.$('cell-value').value, 'first row draft');
  await ui.find('[data-apply]').click();
  const move = ui.$('axis-list').querySelector('[data-move="0"][data-direction="1"]');
  await ui.$('axis-list').emit('click', { target: move });
  assert.equal(ui.$('selected-row').value, firstRow);
  assert.equal(ui.$('cell-value').value, 'first row draft');
  await ui.change('selected-row', secondRow);
  assert.equal(ui.$('cell-value').value, 'second row draft');
});

test('undo first discards draft, then restores commit, and redo restores the committed matrix', async () => {
  const ui = await app(); const original = ui.$('cell-value').value;
  await ui.input('cell-value', 'committed'); await ui.find('[data-apply]').click();
  await ui.input('cell-value', 'uncommitted'); await ui.$('undo').click();
  assert.equal(ui.$('cell-value').value, 'committed');
  await ui.$('undo').click(); assert.equal(ui.$('cell-value').value, original);
  await ui.$('redo').click(); assert.equal(ui.$('cell-value').value, 'committed');
  await ui.$('undo').click(); await ui.input('cell-value', 'replacement'); await ui.find('[data-apply]').click();
  assert.equal(ui.$('redo').disabled, true);
});

test('newer file selection wins when earlier asynchronous read resolves last', async () => {
  const ui = await app(), first = deferred(), second = deferred();
  const a = fileEvent(ui, first.promise, 'first.json'), b = fileEvent(ui, second.promise, 'second.tsv');
  second.resolve('Item\tA\nrow\tnewer'); await b;
  first.resolve(toJSON(small)); await a;
  assert.equal(ui.$('import-text').value, 'Item\tA\nrow\tnewer');
  assert.equal(ui.$('import-format').value, 'tsv');
});

for (const cancellation of ['typed import', 'close import', 'edited project', 'changed format']) {
  test(`stale file read cannot overwrite after ${cancellation}`, async () => {
    const ui = await app(), pending = deferred();
    await ui.input('import-text', 'original import draft');
    const operation = fileEvent(ui, pending.promise);
    if (cancellation === 'typed import') await ui.input('import-text', 'new typed draft');
    if (cancellation === 'close import') await ui.$('close-import').click();
    if (cancellation === 'edited project') await ui.input('caption-input', 'new project draft');
    if (cancellation === 'changed format') await ui.change('import-format', 'tsv');
    pending.resolve(toJSON(small)); await operation;
    assert.equal(ui.$('import-text').value, cancellation === 'typed import' ? 'new typed draft' : 'original import draft');
  });
}

test('canceling replacement keeps the entire draft and later confirmation is undoable', async () => {
  const ui = await app(); await ui.input('caption-input', 'keep this draft');
  let replacement = ui.change('sample', 'small');
  assert.equal(ui.$('confirm-dialog').open, true);
  await ui.$('confirm-dialog').close('cancel'); await replacement;
  assert.equal(ui.$('caption-input').value, 'keep this draft'); assert.equal(ui.$('dirty').hidden, false);
  replacement = ui.change('sample', 'small');
  await ui.$('confirm-dialog').close('confirm'); await replacement;
  assert.equal(ui.$('caption-input').value, small.caption);
  await ui.$('undo').click(); assert.equal(ui.$('caption-input').value, sample.caption);
});

test('canceling deletion leaves axis intact and deleting selected entry resets to a valid selection', async () => {
  const ui = await app();
  const originalRows = ui.$('selected-row').querySelectorAll('option').map(option => option.value);
  const button = ui.$('axis-list').querySelector('[data-delete="0"]');
  let operation = ui.$('axis-list').emit('click', { target: button });
  await ui.$('confirm-dialog').close('cancel'); await operation;
  assert.deepEqual(ui.$('selected-row').querySelectorAll('option').map(option => option.value), originalRows);
  operation = ui.$('axis-list').emit('click', { target: button });
  await ui.$('confirm-dialog').close('confirm'); await operation;
  assert.equal(ui.$('selected-row').value, originalRows[1]);
  assert.equal(ui.$('selected-row').querySelectorAll('option').length, originalRows.length - 1);
  assert.ok(ui.$('heading-path').textContent.length);
});

function checkSelectedPath(ui) {
  const cell = ui.document.querySelectorAll('#preview td[data-row]').find(td => td.classList.contains('selected-cell'));
  assert.ok(cell);
  const ids = cell.getAttribute('headers').split(' ');
  assert.deepEqual(ui.$('heading-path').querySelectorAll('code').map(code => code.textContent), ids);
  assert.deepEqual(ui.document.querySelectorAll('#preview th').filter(th => th.classList.contains('associated-header')).map(th => th.id).sort(), [...ids].sort());
  const table = cell.closest('table');
  assert.equal(ui.$('context-caption').textContent, table.querySelector('caption').textContent);
}

test('every selectable coordinate exposes its actual grouped or split header path and caption', async () => {
  const ui = await app();
  for (const mode of ['grouped', 'split']) {
    await ui.find(`[data-mode="${mode}"]`).click();
    for (const row of sample.rows) for (const column of sample.columns) {
      await ui.change('selected-row', row.id); await ui.change('selected-column', column.id);
      checkSelectedPath(ui);
    }
  }
});

test('row and column boundary moves change grouping while preserving selected cell data', async () => {
  const ui = await app();
  await ui.change('selected-row', sample.rows[1].id);
  await ui.change('selected-column', sample.columns[1].id);
  const value = ui.$('cell-value').value;
  let move = ui.$('axis-list').querySelector('[data-move="1"][data-direction="1"]');
  await ui.$('axis-list').emit('click', { target: move });
  assert.equal(ui.$('cell-value').value, value);
  assert.ok(ui.$('heading-path').textContent.includes('Practice'));
  assert.ok(!ui.$('heading-path').textContent.includes('Foundations'));
  checkSelectedPath(ui);
  await ui.find('[data-axis="columns"]').click();
  move = ui.$('axis-list').querySelector('[data-move="1"][data-direction="1"]');
  await ui.$('axis-list').emit('click', { target: move });
  assert.equal(ui.$('cell-value').value, value);
  assert.ok(ui.$('heading-path').textContent.includes('Afternoon'));
  assert.ok(!ui.$('heading-path').textContent.includes('Morning'));
  checkSelectedPath(ui);
  await ui.find('[data-mode="split"]').click(); checkSelectedPath(ui);
});

test('group splits, ungroups, and group-boundary span edits remain undoable without value loss', async () => {
  const ui = await app();
  await ui.change('selected-row', sample.rows[1].id);
  const originalValue = ui.$('cell-value').value;
  const spans = ui.$('group-list').querySelectorAll('[data-span]');
  spans[0].value = '1'; await ui.$('group-list').emit('input', { target: spans[0] });
  spans[1].value = '3'; await ui.$('group-list').emit('input', { target: spans[1] });
  await ui.find('[data-apply]').click();
  assert.ok(ui.$('heading-path').textContent.includes('Practice')); checkSelectedPath(ui);
  await ui.$('add-group').click();
  assert.equal(ui.$('group-list').querySelectorAll('[data-span]').length, 3); checkSelectedPath(ui);
  await ui.$('ungroup').click();
  assert.equal(ui.$('heading-path').querySelectorAll('code').length, 3); checkSelectedPath(ui);
  assert.equal(ui.$('cell-value').value, originalValue);
  await ui.$('undo').click(); assert.equal(ui.$('group-list').querySelectorAll('[data-span]').length, 3); checkSelectedPath(ui);
  await ui.$('undo').click(); assert.equal(ui.$('group-list').querySelectorAll('[data-span]').length, 2); checkSelectedPath(ui);
});

test('keyboard arrows cross split tables, clamp boundaries, and Enter focuses the editor', async () => {
  const ui = await app(); await ui.find('[data-mode="split"]').click();
  await ui.change('selected-column', sample.columns[1].id);
  let selected = ui.document.querySelectorAll('#preview td[data-row]').find(td => td.classList.contains('selected-cell'));
  const moved = await ui.$('preview').emit('keydown', { target: selected, key: 'ArrowRight' });
  assert.equal(moved.defaultPrevented, true);
  assert.equal(ui.$('selected-column').value, sample.columns[2].id);
  assert.equal(ui.document.activeElement.dataset.col, sample.columns[2].id);
  checkSelectedPath(ui);
  selected = ui.document.querySelectorAll('#preview td[data-row]').find(td => td.classList.contains('selected-cell'));
  await ui.$('preview').emit('keydown', { target: selected, key: 'ArrowUp' });
  assert.equal(ui.$('selected-row').value, sample.rows[0].id);
  await ui.$('preview').emit('keydown', { target: selected, key: 'Enter' });
  assert.equal(ui.document.activeElement, ui.$('cell-value'));
});

test('late read failures are silent after cancellation and current read errors preserve project/draft', async () => {
  const ui = await app(), old = deferred();
  const pending = fileEvent(ui, old.promise);
  await ui.input('caption-input', 'preserved');
  old.reject(new Error('stale failure')); await pending;
  assert.equal(ui.$('notice').getAttribute('role'), 'status');
  const current = deferred(); const failed = fileEvent(ui, current.promise);
  current.reject(new Error('current failure')); await failed;
  assert.equal(ui.$('notice').getAttribute('role'), 'alert');
  assert.ok(ui.$('notice').textContent.includes('current failure'));
  assert.equal(ui.$('caption-input').value, 'preserved');
  assert.equal(ui.$('dirty').hidden, false);
});

test('invalid imports never replace current project and import drafts survive rerenders', async () => {
  const ui = await app(); await ui.input('import-text', '{broken json');
  await ui.$('import-now').click();
  assert.equal(ui.$('notice').getAttribute('role'), 'alert');
  assert.equal(ui.$('caption-input').value, sample.caption);
  await ui.find('[data-lang="en"]').click(); await ui.find('[data-mode="split"]').click();
  assert.equal(ui.$('import-text').value, '{broken json');
  await ui.change('import-format', 'tsv'); await ui.input('import-text', 'Item\tQuantity\nOne\t7');
  await ui.$('import-now').click();
  assert.equal(ui.$('caption-input').value, 'Imported table');
  assert.equal(ui.$('cell-value').value, '7');
  await ui.$('undo').click(); assert.equal(ui.$('caption-input').value, sample.caption);
});

test('manually edited import text gets unload protection even before it becomes a project', async () => {
  const ui = await app();
  const untouched = await ui.window.emit('beforeunload');
  assert.notEqual(untouched.defaultPrevented, true);
  await ui.input('import-text', 'manually prepared import draft');
  const edited = await ui.window.emit('beforeunload');
  assert.equal(edited.defaultPrevented, true, 'typed import-only work must not silently disappear on unload');
});
