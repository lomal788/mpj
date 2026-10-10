import ghidra.app.decompiler.*;
import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.*;
import ghidra.program.model.listing.Function;
import java.io.*;

public class ActorEntryDecomp extends GhidraScript {
    public void run() throws Exception {
        Address entry = toAddr(0x7100004e00L);
        Function previous = getFunctionContaining(entry);
        if (previous != null && !previous.getEntryPoint().equals(entry)) {
            previous.setBody(new AddressSet(previous.getEntryPoint(), entry.subtract(1)));
        }
        Function function = getFunctionAt(entry);
        if (function == null) function = createFunction(entry, "ActorModuleRegister");
        if (function == null) throw new IllegalStateException("Cannot create verified actor initializer");
        function.setBody(new AddressSet(entry, toAddr(0x7100004e57L)));
        DecompInterface decompiler = new DecompInterface();
        decompiler.setOptions(new DecompileOptions());
        decompiler.openProgram(currentProgram);
        try (PrintWriter writer = new PrintWriter(getScriptArgs()[0], "UTF-8")) {
            writer.println("// ==== " + entry + " " + function.getName(true) + " (created)");
            DecompileResults result = decompiler.decompileFunction(function, 120, monitor);
            if (!result.decompileCompleted()) throw new IllegalStateException(result.getErrorMessage());
            writer.println(result.getDecompiledFunction().getC());
        } finally {
            decompiler.dispose();
        }
    }
}
