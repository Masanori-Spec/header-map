# Verification

## Hosted evidence

The release evidence was captured from `f7d113bebe28e64eb74a0c8a059eb319adcb077e` in [GitHub Actions run 37175506774](https://github.com/Masanori-Spec/header-map/actions/runs/37175506774). All five jobs passed: **99 Node tests in each Node 22 / 24 × UTC / Asia/Tokyo combination**, and **14 sandboxed Chromium scenarios**. The browser reported no uncaught errors.

The Node/Python checks include 293 valid rendered markup cases and 16 deliberately corrupted outputs, plus the independent review's 162 partition combinations and 240 structural operations. These are finite regression/property checks, not a proof for every input.

## Actual interaction and download checks

The browser exercised Japanese/English UI, explicit header references, keyboard navigation, staged edits, hostile text, invalid spans, structure changes, undo/redo, dialog cancellation, repeated JSON imports, malformed TSV and UTF-8 handling, and the 30 × 12 maximum matrix. It downloaded the sample JSON, grouped HTML, split HTML and split fragment.

An additional Python check compared those downloaded files against the original synthetic project. Both complete HTML forms and the split fragment preserve all 16 values and their intended heading context exactly once, with valid same-table references and span geometry. The maximum JSON preserves all 360 source values. No scripts, event handlers or external assets were found in the inspected exports.

## Visual and print review

- Desktop Japanese and English screenshots were inspected
- 768, 390 and 320-pixel layouts were inspected, including Japanese at 320 pixels
- Language buttons remain on one line; no page-wide horizontal overflow was found. Wide preview tables scroll within their own region, and the separate cell selectors remain usable
- The grouped and split sample PDFs were rendered and inspected. Short split tables stay with their contextual captions
- An oversized split-table PDF was checked for every one of its 360 unique values exactly once. Its caption context repeats on every data-bearing page; all six rendered pages were inspected (the first contains only the title and scope notice)

The first visual pass found a wrapped 320-pixel language label and a small split table divided between pages. Both were corrected, and regression coverage was added. The initial successful functional run alone was not treated as completion of visual review.

See [browser results](evidence/results.json), [download checks](evidence/download-verification.json), [oversized print check](evidence/oversized-print-check.json), and [CI summary](evidence/ci-summary.json). Screenshots, actual exported files and PDFs are in [evidence](evidence/).

## Limits

This verifies the specified Chromium version and viewport sizes, not physical mobile devices, all browsers, assistive-technology behavior or the final publishing system. The PDF checks are visual and textual, not tagged-PDF or accessibility certification. No screen-reader user study, WCAG conformance or legal-compliance claim is made.

The [independent review](independent-review.md) records the state before hosted browser testing. Its historical pending-browser statements are superseded by the evidence above; its model-review limits still apply.

The workflow uses read-only repository permissions and the Chromium sandbox. Ubuntu 22.04 is a compatibility baseline with announced retirement on 2027-04-17. Later documentation/evidence commits are checked separately at their exact heads; the linked capture run identifies the code used to produce the committed evidence.
