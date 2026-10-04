# Verification status

## Executed locally

- Node v24.19.0; Python standard-library oracle
- Aggregate `npm run check`: syntax, no-network-call guard, Node tests, and static build
- Independent HTMLParser fixtures: 293 valid rendered cases; 16 corrupt outputs correctly rejected
- Grouped/split matrix geometry, same-table header references, exact source-derived paths, coordinate/value-once coverage, escaping, strict input and ID collision regression
- Structure operations and event-state tests

The final machine-readable result and source hashes are produced with the release package. Do not substitute a historical test count for the latest aggregate result.

## Browser tests authored, not locally executed

The sandboxed Chromium harness has 14 scenarios covering:

- Japanese / English interface, explicit header references, unique IDs
- Keyboard skip link, cell navigation and editing
- Escaped cell text, dirty-state export lock, apply / undo / redo
- Invalid spans preserving the valid preview
- Adding, moving and deleting structure, cancellation and restoration
- Actual split-mode associations and coordinate preservation
- JSON / grouped HTML / split HTML / fragment downloads
- Print PDF and screenshot output, plus 360 unique values and repeated caption context checked across an oversized split PDF
- Malformed TSV / UTF-8 rejection, legitimate U+FFFD preservation, close/reopen, repeated file import and language switching
- Maximum 30 × 12 matrix
- 768 / 390 / 320-pixel screenshots and viewport overflow checks
- No external application requests or uncaught errors

The development environment’s browser restrictions were respected. No local browser launch or sandbox bypass was attempted. Hosted CI and pixel review remain necessary before claiming these scenarios passed. No screen-reader test or WCAG/legal compliance claim is made.

## CI

Read-only workflow permissions. Model matrix: Node 22 / 24 × UTC / Asia/Tokyo. Python is installed for the independent oracle. Browser job: Ubuntu 22.04, Playwright 1.56.0, Chromium sandbox enabled. Failed and successful browser runs upload screenshots, real exports, print PDFs and a results JSON.
