# Engineering explanation

## One-minute summary

HeaderMap models a small table as a rectangular matrix with persistent row and column identities. Optional positive group spans partition each ordered axis. The compiler emits a grouped table with explicit header references or a Cartesian partition of simpler tables with group context moved into captions. The data is never inferred or evaluated.

The key engineering work is correctness around the representation change: preserving each source coordinate once, keeping references local to their tables, preventing ID collisions, validating before replacing state, and testing output through an independent parser.

## Decisions

1. **Contiguous spans, not arbitrary merges.** One group level per axis bounds the authoring problem and makes incomplete or overlapping groups impossible after validation
2. **Stable identities.** Reordering a row or column moves its data and identity together. Composite cell IDs use a delimiter forbidden in input IDs, avoiding ambiguous concatenation
3. **Explicit associations.** The grouped output uses a deterministic row-group / row / column-group / column header list. Split output uses its own actual row/column IDs. The inspector shows this tool’s ordering, not a promised spoken order
4. **Independent representation checks.** A Python HTMLParser expands rowspan/colspan into a grid and checks header targets and source-cell coverage. This is independent of the JavaScript compiler’s own association function
5. **Staged editing.** Drafts cannot be exported. Invalid draft changes preserve the last valid preview. Undo snapshots restore applied structure and values; an initial Undo clears an unapplied draft
6. **No hidden execution.** All values are strings, escaped at export. No HTML import, formula engine, remote service, or application network calls
7. **Two representations, one data model.** Split tables are generated from group-range intersections, so no manual copying or aggregation is needed

## Cost and bounds

The model has at most 360 values. Grouped compilation emits one table; split compilation emits at most 360 one-cell tables in the most fragmented case. Every value occurs once in either representation. The deliberately small bound permits full validation and snapshot history without a complex state-management framework. History holds at most 50 applied projects.

## What the verification does not prove

The parser proves properties of generated markup under this supported model. It does not emulate browser accessibility APIs, screen-reader heuristics or human comprehension. Browser scenarios separately inspect the real DOM, interactions, screenshots and print output. Neither category supplies an accessibility conformance certificate.

## 日本語の説明

行・列に安定したIDを持たせ、グループを連続する範囲として表現しました。グループ表と分割表を生成するときに、各値を一度だけ残し、同じ表の見出しだけを参照することを、別言語のHTMLパーサーで検証しています。見た目の確認と構造の検証、実際の支援技術による検証を混同しない設計です。
