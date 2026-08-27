import json, sys
sys.path.insert(0, "/app/.gitcore/scripts/lib")
from load_lenient import load_lenient
d = load_lenient(sys.argv[1])
for f in d.get("features", []):
    reqs = ",".join(f.get("req_ids", []))
    us = ",".join(f.get("user_stories", []))
    ev = f.get("evidence", [])
    if isinstance(ev, list):
        ev_str = ",".join(ev)
    else:
        ev_str = str(ev or "")
    impl = f.get("implemented_in", "") or ev_str
    tests = ",".join(f.get("tests", [])) if isinstance(f.get("tests"), list) else str(f.get("tests", ""))
    print(f'{f["id"]}|{f.get("progress_pct",0)}|{reqs}|{us}|{impl}|{tests}')
