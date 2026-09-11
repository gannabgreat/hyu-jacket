# -*- coding: utf-8 -*-
"""Splice the twelve strings of the second round into every language."""
import io, json, re, sys

PAGES = ("hyu-jacket/index.html", "hyu-jacket/artifact-source.html")
SPEC = json.load(io.open("new_strings2.json", encoding="utf-8"))

blocks = {}
for f in ("add2_1.json", "add2_2.json", "add2_3.json"):
    for code, b in json.load(io.open(f, encoding="utf-8")).items():
        blocks.setdefault(code, {}).update(b)
blocks["ko"] = {k: SPEC[k]["ko_only"] for k in SPEC}

DOM_KEYS = [k for k in SPEC if k != "K"]          # K lives in the share script's DONE map
SRC = {k: SPEC[k]["en"] + SPEC[k]["ko_tail"] for k in DOM_KEYS}

for path in PAGES:
    s = io.open(path, encoding="utf-8").read()

    i = s.index("var T = {")
    j = s.index("};", i)
    T = json.loads(s[i + len("var T = "):j + 1])

    for code in T:
        if code not in blocks:
            sys.exit("no translations for %s" % code)
        for letter in DOM_KEYS:
            v = blocks[code].get(letter)
            if not v:
                sys.exit("%s missing %s" % (code, letter))
            T[code][SRC[letter]] = v + (SPEC[letter]["ko_tail"] if code != "ko" else "")
    s = s[:i] + "var T = " + json.dumps(T, ensure_ascii=False) + s[j + 1:]

    m = re.search(r'var DONE = \{[^}]*\};', s)
    done = {"en": SPEC["K"]["en"]}
    for code in T:
        v = blocks[code].get("K")
        if not v:
            sys.exit("%s missing K" % code)
        done[code] = v
    s = s[:m.start()] + "var DONE = " + json.dumps(done, ensure_ascii=False) + ";" + s[m.end():]

    io.open(path, "w", encoding="utf-8").write(s)
    print("merged into", path, "| languages", len(T), "| DONE entries", len(done))
