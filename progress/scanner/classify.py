import re
from common import ROOT, tsv


def classify(functions, config):
    catalog = {r["code"]: r for r in tsv(ROOT / "analysis/minigame_catalog.tsv")} if (ROOT / "analysis/minigame_catalog.tsv").exists() else {}
    categories = config["categories"]
    rules = [(c, re.compile(c["pattern"], re.I)) for c in categories if c["id"] != "unclassified"]
    subrules = [(x["name"], re.compile(x["pattern"], re.I)) for x in config["subsystems"]]
    for f in functions.values():
        symbol = f["name"]
        matches = [(c, regex) for c, regex in rules if regex.search(symbol)]
        namespace = symbol.split("::", 1)[0] if "::" in symbol else None
        game = namespace if namespace in catalog else None
        # A module's name by itself is insufficient: common runtime/library symbols
        # inside a minigame remain classified by their own symbols or unknown.
        if game:
            category = "minigames"
            evidence = f"확인된 카탈로그 {game} + 함수 네임스페이스"
            confidence = .98
        elif matches:
            category = matches[0][0]["id"]
            evidence = f'함수 심볼 패턴: {matches[0][0]["pattern"]}'
            confidence = .85 if len(matches) == 1 else .65
        else:
            category, evidence, confidence = "unclassified", "기능을 특정할 근거 부족", 0
        subsystem = next((name for name, regex in subrules if regex.search(symbol)), "기타 확인된 심볼" if category != "unclassified" else "판독 대기")
        f.update(category=category, subgroup=game or subsystem, subsystem=subsystem,
                 tags=sorted({c["id"] for c, _ in matches if c["id"] != category}),
                 confidence=confidence, classification=evidence, minigame=game)
    return catalog
