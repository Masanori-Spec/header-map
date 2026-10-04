# Independent review

Date: 2026-10-04 UTC. HeaderMap 0.1.0.

## Recommendation

Proceed to authorized publication and sandbox-enabled hosted CI after final source/archive hash reconciliation. There is no remaining blocking model, export, or tested state-handler finding in the reviewed scope.

**Browser interactions, downloaded files, screenshots, print PDFs, and assistive-technology behavior remain unverified.** This review does not certify accessibility, WCAG conformance, legal compliance, spoken reading order, or equivalence across screen readers.

## Executed evidence

Independent review reran `npm run check` after the repair: syntax/no-network-call checks, all **97 Node tests**, and the static build passed. Ten tests were added in `tests/reviewer.test.mjs`.

The existing Python HTMLParser oracle checks 293 valid rendered cases and rejects 16 deliberately altered outputs. The reviewer added a separate Python ElementTree-based fragment check, without reusing the production association helper or the existing oracle. All **162 combinations** of four-row/four-column contiguous partitions, including ungrouped axes, across grouped and split modes passed. Checks cover:

- Each source row/column coordinate appears exactly once
- Values, including blanks, surrounding spaces, literal entity-looking text, formula-looking text, Japanese, and supplementary Unicode, remain exact
- Every data-cell header reference resolves to a unique header in the same table
- Actual scope/identity sets match the source row, column, and applicable groups
- Rowspan/colspan geometry has no overlap or hole and no span crosses a table section
- Split-table count matches the Cartesian product of source group blocks

Additional tests exercise a 240-step seeded structural sequence, surviving identity/value preservation, immutable inputs, group-boundary moves, maximum 360-table split output, JSON reimport, duplicate decoded keys, sparse arrays, strict Unicode/prototype boundaries, and literal TSV interpretation.

The real application handlers were exercised through the existing small DOM test double. Added state checks cover malformed-byte import, legitimate replacement-character text, an old asynchronous read superseded by an oversized selection, and the 50-snapshot Undo/Redo boundary with an unapplied draft. A DOM test double is not browser, rendering, or accessibility evidence.

## Corrected finding: lossy file decoding

File import formerly used `File.text()`. Malformed UTF-8 bytes inside a JSON string could silently become U+FFFD and then pass the project validator as altered data.

Import now reads a size-bounded `arrayBuffer`, checks the generation and actual byte length, then uses a fatal UTF-8 decoder before staging any text. On failure, the previous import draft and applied table remain intact. A regression uses a real Blob containing byte `0xFF`; it is rejected. A separate valid UTF-8 file that intentionally contains U+FFFD remains accepted and preserved.

The distinction is also included in the authored browser suite, now **14 scenarios**. Those scenarios have not been run by this reviewer.

## Semantic basis and limits

- [WHATWG HTML tables](https://html.spec.whatwg.org/multipage/tables.html) defines `headers` as unique references to `th` elements in the same table. The tool's displayed path order is a deterministic authoring convention, not a standards-mandated spoken sequence
- [W3C WAI multi-level table guidance](https://www.w3.org/WAI/tutorials/tables/multi-level/) illustrates explicit header references and restructuring complex information into smaller tables
- [W3C WAI irregular-header guidance](https://www.w3.org/WAI/tutorials/tables/irregular/) explains structural row/column groups and related scope values
- [W3C H43](https://www.w3.org/WAI/WCAG21/Techniques/html/H43) provides relevant association guidance, but using the technique alone does not establish conformance

The reviewed representation preserves source values and contextual labels. In split mode, group context moves into captions while data cells reference the actual flat row and column headers of their own table. That is not a promise of identical assistive-technology output.

These are finite regression/property checks and source review, not a formal proof of every possible input or behavior.

## Remaining release gates

1. Verify the final remote commit, source/static ZIPs, generated build, and manifests agree
2. Run the authored Node/Python matrix and all 14 browser scenarios with Chromium's sandbox enabled
3. Inspect actual desktop/mobile screenshots, exported grouped/split HTML and fragments, and both print PDFs
4. Confirm file-picker behavior, malformed UTF-8 handling, real downloads, dirty-state locks, Undo/Redo, repeated imports, dialog cancellation, and keyboard focus in the real browser
5. Test integration in the intended publishing system and appropriate assistive technologies before making any behavior claims

No shared browser, publication, hosted CI, or external contact was used during this review.
