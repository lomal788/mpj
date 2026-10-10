import { blankDocument, type EditorDocument } from "../../../editor/document";
import { partEntity, createEntity, type Catalog } from "../schema";
export const BASIC_TEMPLATES = [
  { id: "select-menu", name: "모드 메뉴" },
  { id: "dialog", name: "대화상자" },
  { id: "message", name: "메시지 창" },
  { id: "telop", name: "텔롭" },
  { id: "icon-popup", name: "아이콘 알림" },
  { id: "result-table", name: "결과표" },
];
export function makeBasicTemplate(id: string, catalog: Catalog): EditorDocument {
  const d = blankDocument();
  d.tool = "ui-builder";
  d.settings = { screen: [1920, 1080], datasets: {}, work: {} };
  d.id = id;
  d.title = BASIC_TEMPLATES.find((x) => x.id === id)?.name ?? "새 화면";
  d.settings.input = {
    wrap: true,
    repeatWrap: false,
    multi: false,
    players: 1,
    repeatDelay: 24,
    repeatInterval: 6,
  };
  const add = (name: string, x = 0, y = 0) => {
    const part = catalog.entries.find((p) => p.layout === name && !p.readonly);
    if (!part) return null;
    const n = partEntity(part);
    n.transform.x = x;
    n.transform.y = y;
    d.entities.push(n);
    return n;
  };
  const bind = (n: ReturnType<typeof add>, pane: string, text: string) => {
    if (n) n.props.bindings = [{ pane, kind: "text", value: text }];
  };
  const bg = add("sys_bg_set_00");
  if (bg) bg.locked = true;
  if (id === "select-menu") {
    const base = add("mn01_base_map_00");
    if (base)
      base.props.bindings = [
        ...Array.from({ length: 9 }, (_, i) => ({
          pane: `x_btn_0${i}`,
          kind: "visible",
          value: "false",
        })),
        ...Array.from({ length: 9 }, (_, i) => ({
          pane: `x_parts_map/x_win_0${i}`,
          kind: "visible",
          value: "false",
        })),
        ...Array.from({ length: 8 }, (_, i) => ({
          pane: `x_parts_map/x_icon_mode_0${i}`,
          kind: "visible",
          value: "false",
        })),
      ];
    const n = add("mn01_btn_map_00", -490, 364);
    if (n) {
      n.props = {
        ...n.props,
        dataset: "modes",
        columns: 1,
        gapY: 91,
        interactive: true,
        bindings: [{ pane: "x_text_00", kind: "text", field: "name" }],
        actions: [
          {
            event: "decide",
            kind: "work",
            target: "party.mode",
            value: "$item",
          },
          {
            event: "decide",
            kind: "call",
            target: "party.round",
            value: "$item",
          },
        ],
      };
    }
    d.settings.datasets = {
      modes: [
        { name: "10턴 파티", id: "party" },
        { name: "미니게임 선택", id: "freeplay" },
        { name: "캐릭터 선택", id: "characters" },
      ],
    };
  } else if (id === "dialog") {
    const base = add("sys_dialog_00");
    if (base)
      base.props.bindings = [
        { pane: "x_text", kind: "text", value: "파티를 시작할까요?" },
        ...[
          "x_choise_00",
          "x_choise_01",
          "x_choise_02",
          "x_loadingicon",
          "x_parts_face_00",
          "x_parts_face_01",
          "x_arrowicon",
        ].map((pane) => ({ pane, kind: "visible" as const, value: "false" })),
      ];
    for (const [i, label] of ["시작", "취소"].entries()) {
      const n = add("sys_dialog_arrowchoices_00", i === 0 ? -258 : 258, -120);
      bind(n, "x_text_dialog", label);
      if (n) n.props.interactive = true;
    }
    d.settings.input = { ...(d.settings.input as object), wrap: false };
  } else if (id === "message") {
    bind(add("sys_meswin_00", 0, -270), "x_text", "다음 라운드를 시작합니다.");
  } else if (id === "telop") {
    bind(add("sys_connect_tlp_00"), "x_text_title_00", "라운드 1 / 10");
  } else if (id === "icon-popup") {
    add("sys_notice_00");
    bind(add("sys_notice_01"), "x_text_00", "새 파티에 참가했습니다.");
  } else if (id === "result-table") {
    bind(add("mgm01_history_00"), "x_text_00", "이번 파티 결과");
    add("mgm01_history_01");
  }
  // Demo actions make confirmation/cancellation observable while keeping application services injected.
  for (const n of d.entities.filter((n) => !n.locked)) {
    const actions = (n.props.actions ??= []) as import("../schema").Action[];
    if (!actions.some((a) => a.event === "decide"))
      actions.push({
        event: "decide",
        kind: "return",
        target: "",
        value: "$item",
      });
    actions.push({
      event: "cancel",
      kind: "return",
      target: "",
      value: "cancel",
    });
  }
  return d;
}
export function sceneRegion() {
  const n = createEntity("ui.scene3d", "3D 장면 영역", 900, 500);
  n.props.sceneService = "character-preview";
  return n;
}
