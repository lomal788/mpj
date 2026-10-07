import ghidra.app.decompiler.*;
import ghidra.app.script.GhidraScript;
import ghidra.program.model.listing.*;
import java.io.*;
import java.nio.file.*;
import java.util.regex.Pattern;

// Exact-name pattern was generated after checking existing INDEX.tsv/C outputs.
// Runs with -noanalysis -readOnly against a copy of the project.
public class mgmet_DecompileMissing extends GhidraScript {
    public void run() throws Exception {
        String[] args = getScriptArgs();
        String patterns = Files.readString(Path.of(args[1])).replace("\\~", "__MGMET_TILDE__");
        Pattern pat = Pattern.compile(String.join("|", patterns.split("~")).replace("__MGMET_TILDE__", "~"));
        DecompInterface ifc = new DecompInterface();
        ifc.setOptions(new DecompileOptions());
        ifc.openProgram(currentProgram);
        int count = 0;
        try (PrintWriter w = new PrintWriter(args[0], "UTF-8")) {
            FunctionIterator it = currentProgram.getFunctionManager().getFunctions(true);
            while (it.hasNext()) {
                Function f = it.next();
                if (f.isThunk() || f.isExternal() || !pat.matcher(f.getName(true)).matches()) continue;
                w.println("// ==== " + f.getEntryPoint() + " " + f.getName(true));
                DecompileResults r = ifc.decompileFunction(f, 120, monitor);
                w.println(r.decompileCompleted() ? r.getDecompiledFunction().getC() : "// decompile failed");
                count++;
            }
        } finally { ifc.dispose(); }
        println("picked=" + count + " -> " + args[0]);
    }
}
