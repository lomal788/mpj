// 프로그램을 <폴더>/<프로젝트 안 경로>.gzf 로 통째로 내보낸다(완전 복원용 백업·기준본). 인자: <폴더>
// 프로젝트에 저장된 내용을 묶는다(저장 안 된 변경은 들어가지 않는다).
import ghidra.app.script.GhidraScript;

import java.io.File;

public class ExportGzf extends GhidraScript {
    @Override
    protected void run() throws Exception {
        File out = new File(getScriptArgs()[0], currentProgram.getDomainFile().getPathname().substring(1) + ".gzf");
        out.getParentFile().mkdirs();
        out.delete();
        currentProgram.getDomainFile().packFile(out, monitor);
        println(currentProgram.getName() + ": gzf -> " + out + " (" + out.length() / 1048576 + " MB)");
    }
}
