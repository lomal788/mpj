import fs from "node:fs/promises";
import path from "node:path";
export function projectName(name) {
  if (
    !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(name) ||
    /^(con|prn|aux|nul|com\d|lpt\d)$/i.test(name)
  )
    throw Error("이름은 영문·숫자·-·_ 1~64자로 입력하세요.");
  return name;
}
export function createProjects(root) {
  const dir = path.join(root, "assets/custom");
  return {
    async list() {
      try {
        return (await fs.readdir(dir))
          .filter((n) => n.endsWith(".json"))
          .map((n) => n.slice(0, -5));
      } catch (e) {
        if (e.code === "ENOENT") return [];
        throw e;
      }
    },
    async read(name) {
      return JSON.parse(
        await fs.readFile(path.join(dir, `${projectName(name)}.json`), "utf8"),
      );
    },
    async save(name, doc) {
      projectName(name);
      if (
        doc?.format !== "mpj-editor-document" ||
        doc?.version !== 1 ||
        !Array.isArray(doc.entities)
      )
        throw Error("지원하는 편집기 문서가 아닙니다.");
      await fs.mkdir(dir, { recursive: true });
      const target = path.join(dir, `${name}.json`);
      try {
        await fs.copyFile(target, `${target}.bak`);
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }
      await fs.writeFile(`${target}.tmp`, JSON.stringify(doc, null, 2) + "\n");
      await fs.rename(`${target}.tmp`, target);
      return { name, path: `dev/uibuilder/assets/custom/${name}.json` };
    },
  };
}
