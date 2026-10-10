import sys
from pathlib import Path
sys.dont_write_bytecode = True
APP = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(APP / "scanner"))
import json
import tempfile
import unittest
from common import address, read_json, default_module
from scan_markdown import resolve_line
from scan_functions import parse_c
from build_progress import statistics, apply_overrides
from scan_web import checked_evidence
from watch import Snapshot


class ScannerTests(unittest.TestCase):
    def setUp(self):
        self.functions = {
            "main.nso:0x7100000010": {"module": "main.nso", "name": "Core::Tick"},
            "mg0912.nro:0x7100000010": {"module": "mg0912.nro", "name": "mg0912::Tick"}}
        self.names = {"Core::Tick": {"main.nso:0x7100000010"}, "mg0912::Tick": {"mg0912.nro:0x7100000010"}}
        self.addresses = {"0x7100000010": set(self.functions)}

    def test_normalized_address(self):
        self.assertEqual(address("0x00007100000010"), "0x7100000010")
        self.assertEqual(address("FUN_7100000010"), "0x7100000010")

    def test_same_address_without_module_is_not_guessed(self):
        self.assertEqual(resolve_line("@0x7100000010", None, self.functions, self.names, self.addresses), {})

    def test_explicit_main_overrides_minigame_default(self):
        self.assertEqual(set(resolve_line("main @0x7100000010", "mg0912.nro", self.functions, self.names, self.addresses)), {"main.nso:0x7100000010"})

    def test_minigame_default(self):
        self.assertEqual(set(resolve_line("Update @0x7100000010", "mg0912.nro", self.functions, self.names, self.addresses)), {"mg0912.nro:0x7100000010"})

    def test_minigame_declaration_is_not_overridden_by_main_reference(self):
        header = "주소는 기본 베이스 기준이다. 모듈을 따로 적지 않으면 mg0912.nro 다. **main 모듈 주소는 `main @0x…`로 적는다**."
        self.assertEqual(default_module(Path("mg0912.md"), header), "mg0912.nro")
        self.assertEqual(default_module(Path("01_core.md"), "이 문서의 주소는 따로 적지 않으면 모두 main NSO다."), "main.nso")

    def test_main_symbol_address_overrides_game_owner(self):
        self.assertEqual(set(resolve_line("main Core::Tick @0x7100000010", "mg0912.nro", self.functions, self.names, self.addresses)), {"main.nso:0x7100000010"})

    def test_unique_symbol(self):
        self.assertEqual(set(resolve_line("`Core::Tick` 판독", None, self.functions, self.names, self.addresses)), {"main.nso:0x7100000010"})

    def test_explicit_module_applies_to_address_list(self):
        found = resolve_line("main @0x7100000010 / 0x7100000010", "mg0912.nro", self.functions, self.names, self.addresses)
        self.assertEqual(set(found), {"main.nso:0x7100000010"})

    def test_c_header_and_direct_calls(self):
        with tempfile.TemporaryDirectory(dir=APP / ".cache") as folder:
            path = Path(folder) / "main.nso.c"
            path.write_text("// ==== 7100000010 Core::Tick\nvoid Tick(){ FUN_7100000020(); }\n// ==== 7100000020 Core::Next (dec)\nvoid Next(){}\n", encoding="utf8")
            records = parse_c(path)
            self.assertEqual(records[1]["line"], 3)
            self.assertEqual(records[1]["name"], "Core::Next")
            self.assertEqual(records[0]["calls"], ["0x7100000020"])

    def test_unsubstantiated_complete_override_is_pending(self):
        function = {"category":"unclassified", "analysis":"none"}
        warnings = apply_overrides({"test": function}, {"functions":{"test":{"analysis":"complete"}}}, {"unclassified"})
        self.assertEqual(function["analysis"], "pending")
        self.assertEqual(len(warnings), 1)

    def test_evidence_cannot_escape_workspace(self):
        self.assertEqual(checked_evidence([{"path":"C:/Windows/win.ini", "reason":"unrelated"}]), [])


class RealInventoryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.snap = Snapshot()

    def test_inventory_unique_and_matches_tsv(self):
        p = self.snap.progress
        self.assertTrue(p["audit"]["inventory_matches"])
        self.assertEqual(len(self.snap.by_id), p["stats"]["functions"])
        self.assertEqual(sum(x["unique"] for x in p["audit"]["indexes"]), p["stats"]["functions"])

    def test_category_primary_counts_do_not_duplicate(self):
        p = self.snap.progress
        self.assertEqual(sum(x["functions"] for x in p["categories"]), p["stats"]["functions"])

    def test_all_feature_links_exist_and_are_bidirectional(self):
        for feature in self.snap.features:
            for key in feature["functions"]:
                self.assertIn(feature["id"], self.snap.by_id[key]["features"])

    def test_no_verification_from_test_file_presence(self):
        for feature in self.snap.features:
            if feature["verification"] != "none":
                self.assertTrue(feature["verification_evidence"])

    def test_partial_auto_web_units_have_real_bodies_and_origin_links(self):
        checked = 0
        for feature in self.snap.features:
            if feature["origin"] == "auto_source_unit" and feature["implementation"] == "partial":
                checked += 1
                self.assertGreater(feature["structure"]["executable_members"], 0)
                self.assertTrue(feature["functions"])
                self.assertFalse(feature["stub"])
        self.assertGreater(checked, 0)

    def test_zero_completions_is_distinct_from_unknown_links(self):
        self.assertGreater(sum(f["implementation"] == "none" for f in self.snap.functions), 0)
        self.assertTrue(all(f["implementation"] in {"none","candidate","partial","complete","pending"} for f in self.snap.functions))

    def test_tree_does_not_drop_functions(self):
        total = self.snap.progress["stats"]["functions"]
        for view in ("module", "category"):
            tree = self.snap.tree({"view":view})
            self.assertEqual(sum(x["value"] for x in tree["nodes"]), total)
            self.assertEqual(tree["total"], total)

    def test_drill_all_the_way_to_real_cells(self):
        f = next(x for x in self.snap.functions if x["name"].startswith("mg0912::"))
        scope = [["category",f["category"]],["subgroup",f["subgroup"]],["subsystem",f["subsystem"]]]
        tree = self.snap.tree({"scope":json.dumps(scope)})
        while not tree["leaf"]:
            node = next(x for x in tree["nodes"] if x["key"] == (f["module"] if x["field"]=="module" else str(int(f["address"],16)//0x10000)))
            scope.append([node["field"],node["key"]])
            tree = self.snap.tree({"scope":json.dumps(scope)})
        self.assertIn(f["id"], {x["id"] for x in tree["nodes"]})
        self.assertTrue(all(x["value"] == 1 for x in tree["nodes"]))


if __name__ == "__main__":
    unittest.main()
