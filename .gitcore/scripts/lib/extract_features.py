import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from load_lenient import load_lenient
d = load_lenient(sys.argv[1])
feats = d.get("features", [])
# Tolerar dict {id: feature} o list [feature, ...]
if isinstance(feats, dict):
    feats = list(feats.values())
for f in feats:
    if not isinstance(f, dict):
        continue
    def to_csv(v):
        if isinstance(v, list):
            return ",".join(str(x) for x in v)
        return str(v or "")
    reqs = to_csv(f.get("req_ids"))
    us = to_csv(f.get("user_stories"))
    impl = f.get("implemented_in", "") or ""
    tests = to_csv(f.get("tests"))
    print(f'{f["id"]}|{f.get("progress_pct",0)}|{reqs}|{us}|{impl}|{tests}')