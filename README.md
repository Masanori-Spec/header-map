# HeaderMap

**Give every value its heading context.**

HeaderMap is a local, bounded authoring tool for grouped data tables. Define row and column groups, select any value to inspect its explicit associated headings, and export either one grouped HTML table or simpler split tables with the same values and contextual labels.

This is **not a screen-reader simulation, accessibility audit, or conformance certificate**. It makes no guarantee of screen-reader behavior, WCAG conformance, or legal compliance. Review content and test the final published page with appropriate assistive technology.

## 日本語

行・列のグループを定義し、選んだ値に関連付けられる見出しを確認する、小さなHTML表作成ツールです。

- 最大30行 × 12データ列、行ラベル、各軸1段の連続グループ
- 日本語 / 英語UI。モバイルでは行・列の選択欄からセルを編集
- 明示的なHTML `headers` / `id` と、`scope`・`rowspan`・`colspan` を生成
- グループ表と分割表を同じデータから出力。分割時はグループの文脈をキャプションに保持
- JSON / TSV読み込み、構造の追加・削除・移動、50件までの元に戻す / やり直す
- HTML・フラグメント・プロジェクトJSONを書き出し。自動保存や送信なし

表示する「関連見出し」は読み上げ順を予測するものではありません。アクセシビリティ適合や法的適合を保証せず、実際の掲載先と支援技術による検証が必要です。

## Run

Node 22+; Python 3.10+ for the independent oracle:

```sh
npm run build
npm run serve
# Open http://127.0.0.1:4173
```

The application has zero runtime dependencies and no application network calls. Serve `dist/` from a static host; the module-based editor is not intended for direct `file://` loading. Exported complete HTML opens independently and contains no scripts or external assets.

```sh
npm ci --ignore-scripts
npm run check
npm run test:oracle
# In a Chromium-sandbox-compatible environment:
npx playwright install --with-deps chromium
npm run build
npm run serve
# Second terminal:
npm run test:browser
```

Do not disable Chromium’s sandbox. The browser CI job uses Ubuntu 22.04 with `chromiumSandbox: true`. Its runner compatibility baseline needs maintenance before the announced 2027-04-17 retirement. Model CI covers Node 22 / 24 and UTC / Asia/Tokyo.

## Workflow

1. Start with the synthetic attendance example, or import a JSON project / plain TSV
2. Select a value in the preview or the row/column selectors. In the preview, arrow keys move between values; Enter focuses the cell editor
3. Inspect the associated headings and the table caption. Grouped view shows up to four headings. Split view shows the actual flat row and column headings, with group context in its caption
4. Edit labels, values, or group spans. Until you apply, the preview remains the previous applied revision and export/structure actions are locked
5. Add, remove, or move rows and columns. Values move with their stable row/column identities. Crossing a group boundary changes the associated group
6. Export complete grouped HTML, complete split HTML, the current-view fragment, or project JSON

Undo first discards an unapplied draft. Otherwise it restores an applied snapshot, up to 50 edits. Redo is disabled while a draft is pending. Deleting a row/column asks for confirmation; applying an invalid draft never replaces the previous valid table. There is no autosave: export JSON to retain your work.

## Bounded project model

See `examples/sample.json` and `examples/small.json`.

```json
{
  "schema": "headermap.project.v1",
  "id": "example",
  "caption": "Synthetic materials",
  "rowHeaderLabel": "Material",
  "rowGroupLabel": "Group",
  "columns": [{"id": "c1", "label": "Quantity"}],
  "rows": [{"id": "r1", "label": "Paper", "values": ["12"]}],
  "columnGroups": [],
  "rowGroups": []
}
```

- 1–30 rows, 1–12 data columns, exactly one string value at every coordinate
- IDs: 1–24 ASCII letters/digits/`_`/`-`, starting with a letter; unique across the entire project
- Caption: 1–120 UTF-16 code units; heading/group labels: 1–80; values: 0–240
- Labels have no surrounding whitespace. Cell-value whitespace is preserved
- Unicode NFC required; control/bidi-control characters, line separators, unpaired surrogates, and U+FFFE/U+FFFF are rejected
- Unknown fields, sparse arrays, duplicate IDs, duplicate JSON keys, unknown schema versions, ragged matrices, and inconsistent spans are errors
- File imports require valid UTF-8 and reject malformed bytes instead of inserting replacement characters. Legitimate U+FFFD text remains valid
- JSON / TSV: maximum 1,000,000 UTF-8 bytes. JSON depth limit: 20
- A group is `{ "id": "cg1", "label": "Morning", "span": 2 }`. The spans partition the complete ordered axis, or an empty group list disables that axis’s grouping. Partially grouped axes are intentionally unsupported
- Groups are contiguous by construction and have exactly one level. No arbitrary cell merging, nested tables, formulas, images, links, or rich HTML

### TSV contract

Plain tab-delimited text only: first row contains column labels, first column contains row labels, and the top-left field becomes the row-heading column label. LF and CRLF, a leading BOM, and one final newline are supported. The matrix must be rectangular. There are no quoted multiline fields or CSV quoting rules; quotes are literal text. Formula-like values are retained as plain text and never evaluated. TSV creates an ungrouped project with new stable IDs.

## Output semantics

Grouped HTML uses native `table`, `caption`, `colgroup`, `thead`, `tbody`, `th`, and `td` elements. Each nonempty group axis gets its own group header. Every data cell has explicit `headers` tokens identifying its row group (if any), row label, column group (if any), and column label. Corresponding groups are represented by spans and structural row/column groups.

Split HTML partitions the matrix into the Cartesian product of row-group and column-group ranges. Every source coordinate appears exactly once. Each simpler table has flat row/column headers and a caption containing the original caption and relevant group labels. This preserves data and contextual labels; it does not promise equivalent spoken output across assistive technologies.

Generated header IDs are stable for unchanged project IDs and structural identities. Composite cell IDs use `rowID:columnID`; `:` is excluded from input IDs, so delimiter-bearing IDs cannot collide. A grouped and split export can coexist because their prefixes differ. Repeated copies of the same export require distinct project ID prefixes. Publishing systems may strip markup; inspect the final output.

All user text is escaped. Complete HTML contains a scope disclaimer and print styling. Fragments intentionally contain only table markup; styling, surrounding explanation, document language, and final-page behavior are the integrator’s responsibility. Direct printing of the editor is marked as a screen view and can include unapplied edits; use exported HTML for distribution.

## Verification

- Independent Python `HTMLParser` reconstructs rendered cell grids and spans from actual generated markup
- It verifies same-table `th` references, exact intended paths, stable IDs, contiguous group boundaries, source coordinates, and each value exactly once
- Oracle fixtures cover 293 valid rendered cases and 16 deliberately corrupted outputs that must be rejected
- Additional tests cover structure operations, state transitions, strict input, hostile text, and deterministic exports
- Sandboxed Chromium CI scenarios cover keyboard, mobile, dirty-state locking, undo/redo, import interruptions, actual downloads and print PDFs

Browser scenarios are authored but not executed in this development environment. Do not treat them as passed until the hosted run succeeds for the exact commit. No screen-reader user study has been performed.

[Research and comparison](docs/comparison.md) · [Engineering explanation](docs/engineering.md) · [Verification status](docs/verification.md) · [Independent review](docs/independent-review.md)
