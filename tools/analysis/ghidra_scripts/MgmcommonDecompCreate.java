import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileOptions;
import ghidra.app.decompiler.DecompileResults;
import ghidra.app.cmd.function.CreateFunctionCmd;
import ghidra.app.cmd.disassemble.DisassembleCommand;
import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.address.AddressSet;
import ghidra.program.model.listing.Function;

import java.io.File;
import java.io.PrintWriter;

// args: out.c hexaddr...   (함수가 없으면 그 주소에서 디스어셈블 + 함수 생성 후 디컴파일; 프로젝트는 readOnly 라 저장 안 됨)
public class MgmcommonDecompCreate extends GhidraScript {
    @Override
    protected void run() throws Exception {
        String[] args = getScriptArgs();
        File out = new File(args[0]);
        out.getParentFile().mkdirs();
        DecompInterface ifc = new DecompInterface();
        ifc.setOptions(new DecompileOptions());
        ifc.openProgram(currentProgram);
        try (PrintWriter w = new PrintWriter(out, "UTF-8")) {
            for (int i = 1; i < args.length; i++) {
                Address a = toAddr(Long.parseUnsignedLong(args[i], 16));
                Function f = getFunctionAt(a);
                boolean made = false;
                if (f == null) {
                    if (getInstructionAt(a) == null) {
                        new DisassembleCommand(a, null, true).applyTo(currentProgram, monitor);
                    }
                    Function c = getFunctionContaining(a);
                    if (c != null && !c.getEntryPoint().equals(a)) {
                        w.println("// note: " + a + " was inside " + c.getName(true) + " @" + c.getEntryPoint());
                    }
                    CreateFunctionCmd cmd = new CreateFunctionCmd(a);
                    cmd.applyTo(currentProgram, monitor);
                    f = getFunctionAt(a);
                    made = true;
                }
                if (f == null) { w.println("// ==== " + a + " (no function)"); continue; }
                w.println("// ==== " + f.getEntryPoint() + " " + f.getName(true) + (made ? " (created)" : ""));
                DecompileResults r = ifc.decompileFunction(f, 120, monitor);
                w.println(r != null && r.decompileCompleted() ? r.getDecompiledFunction().getC() : "// decompile failed");
            }
        } finally {
            ifc.dispose();
        }
        println("done -> " + out);
    }
}
