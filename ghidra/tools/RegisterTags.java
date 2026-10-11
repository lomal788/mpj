// web/ghidra/db/tags.json 의 태그를 프로그램에 등록하고 설명(desc)을 맞춘다. 인자: <tags.json 경로>
// analyzeHeadless <프로젝트폴더> <프로젝트> -process -recursive -noanalysis -scriptPath web/ghidra/tools -postScript RegisterTags.java <tags.json>
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import ghidra.app.script.GhidraScript;
import ghidra.program.model.listing.FunctionTag;
import ghidra.program.model.listing.FunctionTagManager;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

public class RegisterTags extends GhidraScript {
    @Override
    protected void run() throws Exception {
        JsonObject root = JsonParser.parseString(
                Files.readString(Path.of(getScriptArgs()[0]), StandardCharsets.UTF_8)).getAsJsonObject();
        FunctionTagManager tm = currentProgram.getFunctionManager().getFunctionTagManager();
        int created = 0, updated = 0;
        for (Map.Entry<String, com.google.gson.JsonElement> e : root.getAsJsonObject("tags").entrySet()) {
            JsonObject t = e.getValue().getAsJsonObject();
            String desc = t.has("desc") ? t.get("desc").getAsString() : "";
            FunctionTag tag = tm.getFunctionTag(e.getKey());
            if (tag == null) {
                tm.createFunctionTag(e.getKey(), desc);
                created++;
            } else if (!desc.equals(tag.getComment())) {
                tag.setComment(desc);
                updated++;
            }
        }
        println(currentProgram.getName() + ": 태그 생성 " + created + ", 설명 갱신 " + updated);
    }
}
