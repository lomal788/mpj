"""Compare outside-file metadata with the read-only baseline saved before edits."""
import sys
sys.dont_write_bytecode = True
import os
from pathlib import Path
from common import ROOT, APP, read_json, write_json


def main():
    baseline = read_json(APP / ".cache/baseline.json", {})
    current = {}
    for parent, dirs, files in os.walk(ROOT):
        dirs[:] = [d for d in dirs if (Path(parent) / d).resolve() != APP]
        for name in files:
            path = Path(parent) / name
            try:
                stat = path.stat()
                current[path.relative_to(ROOT).as_posix()] = [stat.st_size, stat.st_mtime_ns]
            except OSError:
                pass
    report = {"baseline_files": len(baseline), "current_files": len(current),
              "added": sorted(set(current) - set(baseline)), "removed": sorted(set(baseline) - set(current)),
              "changed": [path for path in baseline.keys() & current.keys() if baseline[path] != current[path]],
              "comparison": "size + mtime_ns; this does not attribute changes to a process"}
    write_json(APP / "reports/isolation.json", report)
    print({k: (len(v) if isinstance(v, list) else v) for k, v in report.items()})


if __name__ == "__main__":
    main()
