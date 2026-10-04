"""Independent HTML table oracle. Only Python's standard HTML parser is used.

stdin is a JSON list of cases. Each case provides html and expected data cells:
  {name, html, expected: [{value, headers: [header text, ...]}]}
The JavaScript fixture author supplies expectations directly from source schema;
this module does not import the production compiler or reuse its header paths.
"""
from collections import Counter
from dataclasses import dataclass, field
from html.parser import HTMLParser
import json
import sys


@dataclass
class Cell:
    kind: str
    attrs: dict
    row: int
    section: str
    chunks: list = field(default_factory=list)
    col: int = -1
    rowspan: int = 1
    colspan: int = 1

    @property
    def text(self):
        return ''.join(self.chunks)


@dataclass
class Table:
    attrs: dict
    rows: list = field(default_factory=list)
    cells: list = field(default_factory=list)
    caption: list = field(default_factory=list)
    grid: dict = field(default_factory=dict)
    width: int = 0
    colgroups: list = field(default_factory=list)


class TableReader(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tables = []
        self.table = None
        self.cell = None
        self.caption = False
        self.section = 'implicit'
        self.section_count = 0
        self.ids = set()
        self.errors = []

    def check(self, condition, message):
        if not condition:
            self.errors.append(message)

    def handle_starttag(self, tag, attrs):
        attr = dict(attrs)
        self.check(len(attrs) == len(attr), f'duplicate attributes on {tag}')
        if 'id' in attr:
            self.check(bool(attr['id']), 'empty document ID')
            self.check(attr['id'] not in self.ids, f'duplicate document ID {attr["id"]!r}')
            self.ids.add(attr['id'])
        self.check(tag not in {'script', 'iframe', 'object', 'embed', 'foreignobject', 'img', 'audio', 'video'}, f'active element {tag}')
        self.check(not any(name.lower().startswith('on') for name in attr), f'event handler on {tag}')
        if tag == 'table':
            self.check(self.table is None, 'nested table')
            self.table = Table(attr)
            self.tables.append(self.table)
            self.section = 'implicit'
        elif self.table is not None:
            if tag in {'thead', 'tbody', 'tfoot'}:
                self.section_count += 1
                self.section = f'{tag}:{self.section_count}'
            elif tag == 'colgroup':
                raw = attr.get('span', '1')
                try:
                    span = int(raw)
                except (ValueError, TypeError):
                    self.errors.append(f'invalid colgroup span {raw!r}')
                    span = 1
                self.check(1 <= span <= 64, f'invalid colgroup span {span}')
                self.table.colgroups.append(span)
            elif tag == 'caption':
                self.caption = True
            elif tag == 'tr':
                self.check(self.cell is None, 'new row before prior cell was closed')
                self.table.rows.append((self.section, []))
            elif tag in {'th', 'td'}:
                self.check(self.cell is None, 'nested table cell')
                self.check(bool(self.table.rows), 'cell outside a row')
                self.cell = Cell(tag, attr, len(self.table.rows) - 1, self.section)
                self.table.cells.append(self.cell)
                if self.table.rows:
                    self.table.rows[-1][1].append(self.cell)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        self.handle_endtag(tag)

    def handle_endtag(self, tag):
        if tag in {'th', 'td'}:
            self.check(self.cell is not None and self.cell.kind == tag, f'unbalanced {tag}')
            self.cell = None
        elif tag == 'caption':
            self.caption = False
        elif tag == 'table':
            self.check(self.table is not None, 'unbalanced table')
            self.table = None
        elif tag in {'thead', 'tbody', 'tfoot'}:
            self.section = 'implicit'

    def handle_data(self, data):
        if self.cell is not None:
            self.cell.chunks.append(data)
        elif self.caption and self.table is not None:
            self.table.caption.append(data)


def build_grid(table, errors):
    for row_index, (section, cells) in enumerate(table.rows):
        column = 0
        for cell in cells:
            while (row_index, column) in table.grid:
                column += 1
            for name in ['rowspan', 'colspan']:
                raw = cell.attrs.get(name, '1')
                try:
                    value = int(raw)
                except (ValueError, TypeError):
                    errors.append(f'invalid {name} {raw!r}')
                    value = 1
                if not (1 <= value <= 64):
                    errors.append(f'out-of-bounds {name} {value}')
                    value = 1
                setattr(cell, name, value)
            cell.col = column
            for r in range(row_index, row_index + cell.rowspan):
                if r >= len(table.rows):
                    errors.append(f'rowspan beyond table at row {row_index}')
                    continue
                if table.rows[r][0] != section:
                    errors.append(f'rowspan crosses row group at row {row_index}')
                for c in range(column, column + cell.colspan):
                    if (r, c) in table.grid:
                        errors.append(f'overlapping spans at {r}, {c}')
                    table.grid[r, c] = cell
            column += cell.colspan
            table.width = max(table.width, column)
    for row in range(len(table.rows)):
        for col in range(table.width):
            if (row, col) not in table.grid:
                errors.append(f'ragged grid: missing row {row}, column {col}')


def verify(case):
    parser = TableReader()
    parser.feed(case['html'])
    parser.close()
    errors = parser.errors
    if parser.table is not None or parser.cell is not None:
        errors.append('unclosed table or cell')
    if not parser.tables:
        errors.append('no table found')
    observed = Counter()
    observed_cells = {}
    all_headers = {}
    for table in parser.tables:
        build_grid(table, errors)
        headers = {cell.attrs.get('id'): cell for cell in table.cells if cell.kind == 'th' and cell.attrs.get('id')}
        all_headers.update(headers)
        colgroup_ranges = []
        start = 0
        for span in table.colgroups:
            colgroup_ranges.append((start, start + span))
            start += span
        if table.colgroups and start != table.width:
            errors.append(f'colgroup widths total {start}, expected {table.width}')
        for header in headers.values():
            if header.attrs.get('scope') == 'colgroup':
                if (header.col, header.col + header.colspan) not in colgroup_ranges:
                    errors.append(f'colgroup header {header.text!r} does not match a column group')
            elif header.attrs.get('scope') == 'rowgroup':
                covered = [i for i, (section, _) in enumerate(table.rows) if section == header.section]
                if covered != list(range(header.row, header.row + header.rowspan)):
                    errors.append(f'rowgroup header {header.text!r} does not match its complete row section')
        if not ''.join(table.caption).strip():
            errors.append('missing or empty caption')
        for cell in table.cells:
            if cell.kind != 'td':
                continue
            if cell.rowspan != 1 or cell.colspan != 1:
                errors.append('matrix data value spans multiple grid slots')
            raw = cell.attrs.get('headers', '')
            ids = raw.split()
            if not ids:
                errors.append(f'data value {cell.text!r} has no explicit headers')
            if len(ids) != len(set(ids)):
                errors.append(f'duplicate header tokens for {cell.text!r}')
            associated = []
            for identifier in ids:
                header = headers.get(identifier)
                if header is None:
                    errors.append(f'{cell.text!r} references non-TH or different-table ID {identifier!r}')
                    continue
                associated.append(header.text)
                scope = header.attrs.get('scope')
                if scope in {'col', 'colgroup'}:
                    if not (header.col <= cell.col < header.col + header.colspan):
                        errors.append(f'column header {header.text!r} does not cover {cell.text!r}')
                elif scope in {'row', 'rowgroup'}:
                    if not (header.row <= cell.row < header.row + header.rowspan):
                        errors.append(f'row header {header.text!r} does not cover {cell.text!r}')
                else:
                    errors.append(f'header {header.text!r} has no recognized scope')
            observed[(cell.text, tuple(associated))] += 1
            identity = (cell.attrs.get('data-row'), cell.attrs.get('data-col'))
            if identity in observed_cells:
                errors.append(f'duplicate source matrix coordinate {identity!r}')
            observed_cells[identity] = {
                'value': cell.text, 'headers': associated, 'headerIds': ids,
                'rowId': identity[0], 'colId': identity[1],
                'id': cell.attrs.get('id'), 'tableId': table.attrs.get('id'),
                'caption': ''.join(table.caption),
                'gridRow': cell.row, 'gridCol': cell.col,
                'tableWidth': table.width, 'tableHeight': len(table.rows),
            }
    expected = Counter((item['value'], tuple(item['headers'])) for item in case['expected'])
    if observed != expected:
        missing = expected - observed
        extra = observed - expected
        if missing:
            errors.append(f'missing/wrong association data: {list(missing.items())[:8]!r}')
        if extra:
            errors.append(f'extra/wrong association data: {list(extra.items())[:8]!r}')
    for wanted in case['expected']:
        if 'rowId' not in wanted:
            continue
        identity = (wanted['rowId'], wanted['colId'])
        got = observed_cells.get(identity)
        if got is None:
            errors.append(f'missing source matrix coordinate {identity!r}')
            continue
        for key, value in wanted.items():
            if got.get(key) != value:
                errors.append(f'{identity!r} {key}: expected {value!r}, got {got.get(key)!r}')
    for wanted in case.get('expectedHeaders', []):
        got = all_headers.get(wanted['id'])
        if got is None:
            errors.append(f'missing expected header {wanted["id"]!r}')
            continue
        actual = {'id': got.attrs.get('id'), 'text': got.text, 'scope': got.attrs.get('scope'),
                  'row': got.row, 'col': got.col, 'rowspan': got.rowspan, 'colspan': got.colspan}
        for key, value in wanted.items():
            if actual.get(key) != value:
                errors.append(f'header {wanted["id"]!r} {key}: expected {value!r}, got {actual.get(key)!r}')
    if 'tableCount' in case and len(parser.tables) != case['tableCount']:
        errors.append(f'expected {case["tableCount"]} tables, saw {len(parser.tables)}')
    return {'name': case.get('name'), 'tables': len(parser.tables), 'dataCells': sum(observed.values()), 'errors': errors}


if __name__ == '__main__':
    cases = json.load(sys.stdin)
    output = [verify(case) for case in cases]
    json.dump(output, sys.stdout, ensure_ascii=True)
    sys.stdout.write('\n')
    sys.exit(1 if any(item['errors'] for item in output) else 0)
