#!/usr/bin/env python3
"""공장 주문서(TJ300 양식) 채우기.

노션 주문서 DB 두 개의 내용을 그대로 엑셀에 옮긴다. openpyxl 은 쓰지 않는다 —
이 양식에는 vml/드로잉/이미지가 들어 있어서 openpyxl 로 열었다 저장하면 그게 날아간다.
그래서 xl/worksheets/sheet1.xml 과 xl/sharedStrings.xml 만 손대고 나머지 엔트리는
바이트 그대로 복사한다.

사용법:
    python3 fill.py <파일.xlsx> <사람들.json>
  사람들.json = [{"email": "...", "size": "M", "initial": "lofy"}, ...]
  순서는 신경쓰지 않아도 된다 — 공장 요구대로 S-M-L-XL-2XL-3XL-4XL-5XL 로 정렬해 넣는다.
"""
import json, re, shutil, sys, zipfile
from pathlib import Path

SIZES = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"]
QTY_ROW = 23           # 사이즈별 수량 행 (B=XS … J=5XL)
QTY_COLS = ["B", "C", "D", "E", "F", "G", "H", "I", "J"]
FIRST_ROW = 76         # 이니셜 목록 첫 행 (구분 1번)
LAST_ROW = 195         # 구분 120번
COL_EMAIL, COL_SIZE, COL_INITIAL = "B", "C", "D"


CELL_RE = re.compile(r'<c r="([A-Z]+)(\d+)"([^>]*?)(?:/>|>(.*?)</c>)', re.S)
ROW_RE = re.compile(r'(<row[^>]*?r="(\d+)"[^>]*?)(/>|>(.*?)</row>)', re.S)


def col_key(col):
    n = 0
    for ch in col:
        n = n * 26 + (ord(ch) - 64)
    return n


class Sheet:
    """행 단위로 셀을 파싱했다가 열 순서대로 다시 직렬화한다.

    문자열 치환만으로 셀을 끼워넣으면 열 순서가 깨지고 원래 셀의 s=(스타일)도
    날아간다 — 공장 양식은 테두리·서식이 살아 있어야 하므로 행을 통째로 다시 쓴다."""

    def __init__(self, xml, shared):
        self.shared = shared
        self.index = {s: i for i, s in enumerate(shared)}
        self.rows = {}          # row number -> {col: (attr, body or None)}
        self.xml = xml
        for m in ROW_RE.finditer(xml):
            r = int(m.group(2))
            cells = {}
            if m.group(4):
                for c in CELL_RE.finditer(m.group(4)):
                    cells[c.group(1)] = (c.group(3), c.group(4))
            self.rows[r] = cells

    def sid(self, text):
        if text not in self.index:
            self.index[text] = len(self.shared)
            self.shared.append(text)
        return self.index[text]

    def _attr(self, row, col, style_from=None):
        cur = self.rows.get(row, {}).get(col)
        if cur is not None:
            return re.sub(r'\s*t="\w+"', '', cur[0])
        if style_from is not None:
            src = self.rows.get(style_from, {}).get(col)
            if src is not None:
                return re.sub(r'\s*t="\w+"', '', src[0])
        return ''

    def set_text(self, col, row, text, style_from=None):
        attr = self._attr(row, col, style_from)
        self.rows.setdefault(row, {})[col] = (attr + ' t="s"', '<v>%d</v>' % self.sid(text))

    def set_number(self, col, row, value):
        attr = self._attr(row, col)
        if value is None:
            self.rows.setdefault(row, {})[col] = (attr, None)
        else:
            self.rows.setdefault(row, {})[col] = (attr, '<v>%s</v>' % value)

    def clear(self, col, row):
        cur = self.rows.get(row, {}).get(col)
        if cur is None:
            return
        self.rows[row][col] = (cur[0], None)

    def serialize(self):
        def repl(m):
            r = int(m.group(2))
            cells = self.rows.get(r)
            if cells is None:
                return m.group(0)
            body = ''.join(
                '<c r="%s%d"%s%s' % (col, r, cells[col][0],
                                     '/>' if cells[col][1] is None else '>%s</c>' % cells[col][1])
                for col in sorted(cells, key=col_key))
            head = m.group(1)
            if m.group(3) == '/>' and not body:
                return head + '/>'
            return head + '>' + body + '</row>'
        return ROW_RE.sub(repl, self.xml)


def load(path):
    z = zipfile.ZipFile(path)
    shared_xml = z.read("xl/sharedStrings.xml").decode("utf-8")
    shared = [re.sub(r"<.*?>", "", m) for m in re.findall(r"<si>(.*?)</si>", shared_xml, re.S)]
    sheet = z.read("xl/worksheets/sheet1.xml").decode("utf-8")
    return z, shared, sheet


def esc(s):
    return (s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


def save(src_path, sheet_xml, shared):
    tmp = Path(str(src_path) + ".tmp")
    src = zipfile.ZipFile(src_path)
    out = zipfile.ZipFile(tmp, "w", zipfile.ZIP_DEFLATED)
    si = "".join("<si><t xml:space=\"preserve\">%s</t></si>" % esc(s) for s in shared)
    shared_xml = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                  '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
                  'count="%d" uniqueCount="%d">%s</sst>' % (len(shared), len(shared), si))
    for item in src.infolist():
        data = src.read(item.filename)
        if item.filename == "xl/worksheets/sheet1.xml":
            data = sheet_xml.encode("utf-8")
        elif item.filename == "xl/sharedStrings.xml":
            data = shared_xml.encode("utf-8")
        out.writestr(item, data)
    out.close()
    src.close()
    shutil.move(tmp, src_path)


def main():
    path, people_json = sys.argv[1], sys.argv[2]
    people = json.loads(Path(people_json).read_text())
    people.sort(key=lambda p: (SIZES.index(p["size"]), p["initial"] or "", p["email"]))

    _z, shared, sheet_xml = load(path)
    sh = Sheet(sheet_xml, shared)

    counts = {s: 0 for s in SIZES}
    for p in people:
        counts[p["size"]] += 1
    for col, size in zip(QTY_COLS, SIZES):
        sh.set_number(col, QTY_ROW, counts[size] or None)

    for i in range(LAST_ROW - FIRST_ROW + 1):
        row = FIRST_ROW + i
        if i < len(people):
            p = people[i]
            sh.set_text(COL_EMAIL, row, p["email"], style_from=FIRST_ROW)
            sh.set_text(COL_SIZE, row, p["size"], style_from=FIRST_ROW)
            if p["initial"]:
                sh.set_text(COL_INITIAL, row, p["initial"], style_from=FIRST_ROW)
            else:
                sh.clear(COL_INITIAL, row)
        else:
            for col in (COL_EMAIL, COL_SIZE, COL_INITIAL):
                sh.clear(col, row)

    save(path, sh.serialize(), sh.shared)
    print("%s: %d명 (%s)" % (Path(path).name, len(people),
                            " ".join("%s=%d" % (s, counts[s]) for s in SIZES if counts[s])))


if __name__ == "__main__":
    main()
