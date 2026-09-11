# -*- coding: utf-8 -*-
"""Splice the six new strings into every language's T table."""
import io, json, sys

PAGES = ("hyu-jacket/index.html", "hyu-jacket/artifact-source.html")
SPEC = json.load(io.open("new_strings.json", encoding="utf-8"))

blocks = {}
for f in ("new_add_1.json", "new_add_2.json", "new_add_3.json"):
    for code, b in json.load(io.open(f, encoding="utf-8")).items():
        blocks.setdefault(code, {}).update(b)
blocks["ko"] = {k: SPEC[k]["ko_only"] for k in SPEC}

KEYS = {k: SPEC[k]["en"] + SPEC[k]["ko_tail"] for k in SPEC}

for path in PAGES:
    s = io.open(path, encoding="utf-8").read()
    i = s.index("var T = {")
    j = s.index("};", i)
    T = json.loads(s[i + len("var T = "):j + 1])

    missing = [c for c in T if c not in blocks]
    if missing:
        sys.exit("no translations for: %s" % missing)

    for code, b in blocks.items():
        if code not in T:
            sys.exit("unknown language %s" % code)
        for letter, src in KEYS.items():
            v = b.get(letter)
            if not v:
                sys.exit("%s missing %s" % (code, letter))
            T[code][src] = v + (SPEC[letter]["ko_tail"] if code != "ko" else "")

    s = s[:i] + "var T = " + json.dumps(T, ensure_ascii=False) + s[j + 1:]
    io.open(path, "w", encoding="utf-8").write(s)
    print("merged into", path, "| languages", len(T))
