import { el, button, input, field, select } from "../../../editor/dom";
import type { EditorContext } from "../../../editor/extensions";
import { props, type Action } from "../schema";
export function mountData(host: HTMLElement, ctx: EditorContext) {
  const tabs = el("div", "row"),
    body = el("div", "data-body");
  let mode = "data";
  tabs.append(
    button("데이터", () => {
      mode = "data";
      render();
    }),
    button("동작 연결", () => {
      mode = "actions";
      render();
    }),
    button("입력 정책", () => {
      mode = "input";
      render();
    }),
    button("미리보기 로그", () => {
      mode = "log";
      render();
    }),
  );
  host.append(tabs, body);
  const logs: unknown[] = [];
  const event = (e: Event) => {
    logs.unshift((e as CustomEvent).detail);
    logs.length = Math.min(100, logs.length);
    if (mode === "log") render();
  };
  window.addEventListener("builder-event", event);
  function render() {
    body.replaceChildren();
    if (mode === "log") {
      body.append(
        el(
          "pre",
          "event-log",
          logs.map((x) => JSON.stringify(x)).join("\n") ||
            "미리보기 입력을 기다립니다.",
        ),
      );
      return;
    }
    if (mode === "data") {
      const area = el("textarea", "data-json");
      area.value = JSON.stringify(
        ctx.store.document.settings.datasets ?? {},
        null,
        2,
      );
      area.setAttribute("aria-label", "데이터 JSON");
      body.append(
        area,
        button("데이터 적용", () => {
          const data = JSON.parse(area.value);
          if (
            !data ||
            Array.isArray(data) ||
            typeof data !== "object" ||
            !Object.values(data).every(
              (x) =>
                Array.isArray(x) &&
                x.length <= 200 &&
                x.every((v) => v && typeof v === "object" && !Array.isArray(v)),
            )
          )
            throw Error("이름 → 객체 배열 형식이며 목록당 최대 200개입니다.");
          ctx.store.execute("데이터 변경", (d) => (d.settings.datasets = data));
        }),
      );
      return;
    }
    if (mode === "input") {
      const p =
        (ctx.store.document.settings.input as Record<string, unknown>) ?? {};
      for (const [key, label, def] of [
        ["wrap", "누름 끝 돌아가기", true],
        ["repeatWrap", "반복 끝 돌아가기", false],
        ["multi", "다인 점유 검사", false],
      ] as const) {
        const check = el("input");
        check.type = "checkbox";
        check.checked = Boolean(p[key] ?? def);
        check.onchange = () =>
          ctx.store.execute("입력 정책", (d) => {
            d.settings.input = { ...p, [key]: check.checked };
          });
        body.append(field(label, check));
      }
      for (const [key, label, def] of [
        ["players", "플레이어 수 (1~4)", 1],
        ["repeatDelay", "반복 대기 프레임", 24],
        ["repeatInterval", "반복 간격 프레임", 6],
      ] as const)
        body.append(
          field(
            label,
            input(
              String(p[key] ?? def),
              (v) =>
                ctx.store.execute(
                  "입력 정책",
                  (d) =>
                    (d.settings.input = {
                      ...p,
                      [key]: Math.max(
                        1,
                        Math.min(key === "players" ? 4 : 600, Number(v) || def),
                      ),
                    }),
                ),
              "number",
            ),
          ),
        );
      body.append(
        el(
          "p",
          "hint",
          "고정 60Hz. 반복 24/6f는 기존 웹 근사입니다. 새 화면용 목록/격자 정책이며 원본 화면 전체 상태기계를 대체하지 않습니다.",
        ),
      );
      return;
    }
    const n = ctx.store.selected;
    if (!n) {
      body.append(el("p", "hint", "부품을 선택하세요."));
      return;
    }
    const actions = props(n).actions ?? [];
    actions.forEach((a, i) => {
      const row = el("div", "action-row");
      const change = (v: Partial<Action>) =>
        ctx.store.update(n.id, (n) => Object.assign(props(n).actions![i], v));
      row.append(
        select(
          ["focus", "decide", "cancel"].map((value) => ({
            value,
            label: value,
          })),
          a.event,
          (v) => change({ event: v as Action["event"] }),
        ),
        select(
          ["sound", "vibrate", "work", "call", "return"].map((value) => ({
            value,
            label: value,
          })),
          a.kind,
          (v) => change({ kind: v as Action["kind"] }),
        ),
        input(a.target, (v) => change({ target: v })),
        input(a.value ?? "", (v) => change({ value: v })),
        button("×", () =>
          ctx.store.update(n.id, (n) => props(n).actions!.splice(i, 1)),
        ),
      );
      body.append(row);
    });
    body.append(
      button("동작 +", () =>
        ctx.store.update(n.id, (n) =>
          (props(n).actions ??= []).push({
            event: "decide",
            kind: "call",
            target: "party.round",
            value: "$item",
          }),
        ),
      ),
      el(
        "p",
        "hint",
        "target = 소리 라벨 / Work 키 / 장면 ID. value=$item이면 선택한 자료를 전달합니다. 미리보기 Work·call·return·진동은 로그에만 기록됩니다.",
      ),
    );
  }
  const off = ctx.store.subscribe(render);
  render();
  return () => {
    off();
    window.removeEventListener("builder-event", event);
  };
}
