// 프로그램의 외부 라이브러리를 프로젝트 안 대상 프로그램으로 연결한다. 인자: <대상 프로젝트 경로>
// snapshot.py link 가 config.json 의 link_target 으로 부른다.
import ghidra.app.script.GhidraScript;
import ghidra.program.model.symbol.ExternalManager;

public class LinkExternal extends GhidraScript {
    @Override
    protected void run() throws Exception {
        String target = getScriptArgs()[0];
        if (currentProgram.getDomainFile().getPathname().equals(target)) {
            println(currentProgram.getName() + ": 대상 자신이라 건너뜀");
            return;
        }
        ExternalManager em = currentProgram.getExternalManager();
        String[] libs = em.getExternalLibraryNames();
        if (libs.length == 0) {
            println(currentProgram.getName() + ": 외부 라이브러리 없음");
            return;
        }
        for (String lib : libs) {
            String before = em.getExternalLibraryPath(lib);
            em.setExternalPath(lib, target, true);
            println(currentProgram.getName() + ": " + lib + " -> " + target + (before != null ? " (이전 " + before + ")" : ""));
        }
    }
}
