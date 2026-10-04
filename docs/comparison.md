# Research and comparison

Reviewed 2026-10-04. These are documentation-based comparisons, not hands-on evaluations or an exhaustive market survey. No novelty or validated-demand claim is made.

## Existing tools and guidance

- [CKEditor 5 table documentation](https://ckeditor.com/docs/ckeditor5/latest/features/tables/tables.html) describes general table authoring, row/column changes, cell merging/splitting, captions and header-cell types. HeaderMap is a much narrower standalone workflow for bounded grouped tables, inspecting explicit associations and producing two representations from one model. It does not replace a rich-text editor
- [DOFIW Accessible Table Generator](https://dofiw.com/accessible-table-generator/) provides a browser-based captioned table workflow, editable cells, scoped headers and HTML output. Its documented scope is simple tables; it explicitly calls out complex spans as requiring additional design/testing. HeaderMap focuses on one bounded group level per axis, stable IDs, a selected-cell association inspector and partitioned simpler tables
- [Deque’s design discussion](https://www.deque.com/blog/design-before-code-part-2/) asks whether complex data tables can be simplified or split and recommends understanding how users interpret them. HeaderMap makes a split representation available for comparison, but does not establish that one representation is better for a particular audience

## Primary semantic references

- [W3C WAI: irregular headers](https://www.w3.org/WAI/tutorials/tables/irregular/) explains row/column group structure and the associated scope values. HeaderMap limits grouping to contiguous spans and emits the structural groups explicitly
- [W3C WAI: multi-level headers](https://www.w3.org/WAI/tutorials/tables/multi-level/) discusses explicit `id` / `headers` associations and the option to simplify tables. HeaderMap exposes its generated associations rather than predicting what a screen reader will say
- [WHATWG HTML: table cell attributes](https://html.spec.whatwg.org/multipage/tables.html#attr-tdth-headers) defines the header-reference mechanism. Generated references target header cells in the same table. The independent oracle checks those structural relationships

## Usefulness hypothesis

A writer or developer already holding small, labelled tabular data may benefit from seeing which heading context reaches a particular value and exporting either grouped or split markup without retyping the data. This is a testable workflow hypothesis. No customer outreach, demand validation, assistive-technology interoperability study, or usability study has been completed.

## Important boundaries

The tool cannot judge whether a heading is meaningful, whether a group reflects the intended data, whether a table is the right presentation, or whether downstream software preserves the markup. Structural tests do not establish WCAG or legal compliance. Actual browser, zoom/reflow, keyboard, assistive-technology, and end-user testing remain necessary in the final publishing context.
