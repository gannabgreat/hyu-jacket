# -*- coding: utf-8 -*-
"""Re-attach the Korean fragments that the source strings carry alongside English."""
import io, json, re, sys

HAN = re.compile(u'[가-힣]')
KEYS = json.load(io.open("keys_live.json", encoding="utf-8"))

def parts(src):
    """Return (prefix, suffix) Korean fragments to wrap a translation with."""
    m = HAN.search(src)
    if not m:
        return "", ""
    i = m.start()
    if i == 0:
        m2 = re.match(u'^[가-힣\\s]+', src)
        return m2.group(0), ""
    j = i
    while j > 0 and src[j - 1] in u" ·/":
        j -= 1
    return "", src[j:]

FIX = {k: parts(s) for k, s in enumerate(KEYS) if HAN.search(s)}

for code in sys.argv[1:]:
    path = "lang_%s.json" % code
    d = json.load(io.open(path, encoding="utf-8"))
    b = d[code]
    for k, (pre, suf) in FIX.items():
        v = b["t"][str(k)]
        if HAN.search(v):
            continue
        b["t"][str(k)] = pre + v + suf
    io.open(path, "w", encoding="utf-8").write(json.dumps(d, ensure_ascii=False))
    print(code, "patched", len(FIX), "keys | sample 18:", b["t"]["18"], "| 60:", b["t"]["60"])
