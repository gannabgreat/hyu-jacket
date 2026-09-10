# -*- coding: utf-8 -*-
"""Splice language blocks into the page's T/C tables.

Usage: python3 add_lang.py <json file> ...
Each file: {"code": {"name": "...", "html": "...", "t": {"<index>": "..."}, "c": {"KR": "..."}}}
Indices refer to keys_live.json.
"""
import io, json, sys, re

KEYS = json.load(io.open("keys_live.json", encoding="utf-8"))
PAGES = ("hyu-jacket/index.html", "hyu-jacket/artifact-source.html")

def load_table(s, var):
    i = s.index("var %s = {" % var)
    j = s.index("};", i)
    return i, j, json.loads(s[i + len("var %s = " % var):j + 1])

blocks = {}
for f in sys.argv[1:]:
    blocks.update(json.load(io.open(f, encoding="utf-8")))

for path in PAGES:
    s = io.open(path, encoding="utf-8").read()

    i, j, T = load_table(s, "T")
    for code, b in blocks.items():
        T[code] = {KEYS[int(k)]: v for k, v in b["t"].items()}
    s = s[:i] + "var T = " + json.dumps(T, ensure_ascii=False) + s[j + 1:]

    i, j, C = load_table(s, "C")
    for code, b in blocks.items():
        if b.get("c"):
            C[code] = b["c"]
    s = s[:i] + "var C = " + json.dumps(C, ensure_ascii=False) + s[j + 1:]

    m = re.search(r'var HTMLLANG = (\{[^}]*\});', s)
    hl = dict(re.findall(r'(\w+):"([^"]+)"', m.group(1)))
    for code, b in blocks.items():
        hl[code] = b.get("html", code)
    s = s[:m.start()] + "var HTMLLANG = {" + ", ".join('%s:"%s"' % kv for kv in hl.items()) + "};" + s[m.end():]

    m = re.search(r'var LANGS = (\[.*?\]);', s, re.S)
    langs = json.loads(m.group(1))
    have = {l[0] for l in langs}
    for code, b in blocks.items():
        if code not in have:
            langs.append([code, b["name"]])
    s = s[:m.start()] + "var LANGS = " + json.dumps(langs, ensure_ascii=False) + ";" + s[m.end():]

    io.open(path, "w", encoding="utf-8").write(s)

print("added:", ", ".join(sorted(blocks)))
for code, b in blocks.items():
    missing = [k for k in range(len(KEYS)) if str(k) not in b["t"]]
    print("  %s: %s" % (code, "all %d keys" % len(KEYS) if not missing else "MISSING %d -> %s" % (len(missing), missing[:12])))
