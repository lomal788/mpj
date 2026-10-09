import ghidra.app.decompiler.*;
import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Function;
import java.io.*;

// Read-only headless project: materialize pointer-verified missing functions
// only in the transient program, then export C. args: output.c address...
public class CharacterFtrgMissing extends GhidraScript {
    public void run() throws Exception {
        String[] a = getScriptArgs();
        DecompInterface d = new DecompInterface();
        d.setOptions(new DecompileOptions());
        d.openProgram(currentProgram);
        try (PrintWriter w = new PrintWriter(a[0], "UTF-8")) {
            for (int i = 1; i < a.length; i++) {
                Address p = toAddr(Long.parseUnsignedLong(a[i], 16));
                Function f = getFunctionAt(p);
                if (f == null) { disassemble(p); f = createFunction(p, null); }
                if (f == null) { w.println("// no function at " + p); continue; }
                w.println("// ==== " + f.getEntryPoint() + " " + f.getName(true));
                DecompileResults r = d.decompileFunction(f, 120, monitor);
                w.println(r.decompileCompleted() ? r.getDecompiledFunction().getC() : "// decompile failed");
            }
        } finally { d.dispose(); }
    }
}
