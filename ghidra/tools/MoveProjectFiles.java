// 프로젝트 안 폴더의 파일을 다른 폴더로 옮긴다(프로젝트 안 경로 정리용). 인자: <원래 폴더> <대상 폴더>
// 예: /romfs/nro/NX_Release/NX_Release /romfs/nro/NX_Release  (폴더째 임포트로 한 단계 더 생긴 경우)
// 아무 프로그램 하나를 -process 로 열고 -noanalysis 로 돌린다. 원래 폴더가 비면 지운다.
import ghidra.app.script.GhidraScript;
import ghidra.framework.model.DomainFile;
import ghidra.framework.model.DomainFolder;
import ghidra.framework.model.ProjectData;

public class MoveProjectFiles extends GhidraScript {
    @Override
    protected void run() throws Exception {
        String[] a = getScriptArgs();
        ProjectData pd = state.getProject().getProjectData();
        DomainFolder from = pd.getFolder(a[0]);
        DomainFolder to = pd.getFolder(a[1]);
        if (from == null || to == null) {
            println("폴더 없음: " + (from == null ? a[0] : a[1]));
            return;
        }
        int moved = 0, skipped = 0;
        for (DomainFile f : from.getFiles()) {
            if (to.getFile(f.getName()) != null || f.isOpen()) {
                println("건너뜀(대상에 같은 이름이 있거나 열려 있음): " + f.getPathname());
                skipped++;
                continue;
            }
            f.moveTo(to);
            moved++;
        }
        if (from.getFiles().length == 0 && from.getFolders().length == 0) from.delete();
        println("옮김 " + moved + ", 건너뜀 " + skipped + " : " + a[0] + " -> " + a[1]);
    }
}
