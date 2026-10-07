import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileOptions;
import ghidra.app.decompiler.DecompileResults;
import ghidra.app.script.GhidraScript;
import ghidra.program.model.listing.Function;
import ghidra.program.model.symbol.Reference;
import ghidra.program.model.symbol.Symbol;
import ghidra.program.model.symbol.SymbolIterator;

import java.io.File;
import java.io.PrintWriter;
import java.util.LinkedHashSet;
import java.util.Set;

// args: out.c 부분문자열 [decompile=1]  -> 이름에 부분문자열이 든 심볼(외부 포함)과 그 참조, 참조 함수 디컴파일
public class MgmcommonSymRefs extends GhidraScript {
    @Override
    protected void run() throws Exception {
        String[] args = getScriptArgs();
        boolean dec = args.length < 3 || !args[2].equals("0");
        Set<Function> funcs = new LinkedHashSet<>();
        try (PrintWriter w = new PrintWriter(new File(args[0]), "UTF-8")) {
            SymbolIterator it = currentProgram.getSymbolTable().getAllSymbols(true);
            while (it.hasNext()) {
                Symbol s = it.next();
                if (!s.getName(true).contains(args[1])) continue;
                w.println("// symbol " + s.getName(true) + " @" + s.getAddress() + " external=" + s.isExternal());
                for (Reference r : s.getReferences()) {
                    Function f = getFunctionContaining(r.getFromAddress());
                    w.println("//   ref from " + r.getFromAddress() + " " + r.getReferenceType() + " in " + (f == null ? "-" : f.getName(true)));
                    if (f != null) funcs.add(f);
                    else {
                        // GOT 같은 데이터 칸이면 그 칸을 참조하는 곳도
                        for (Reference r2 : getReferencesTo(r.getFromAddress())) {
                            Function f2 = getFunctionContaining(r2.getFromAddress());
                            w.println("//     ref2 from " + r2.getFromAddress() + " in " + (f2 == null ? "-" : f2.getName(true)));
                            if (f2 != null) funcs.add(f2);
                        }
                    }
                }
            }
            if (!dec) return;
            DecompInterface ifc = new DecompInterface();
            ifc.setOptions(new DecompileOptions());
            ifc.openProgram(currentProgram);
            for (Function f : funcs) {
                w.println("// ==== " + f.getEntryPoint() + " " + f.getName(true));
                DecompileResults r = ifc.decompileFunction(f, 120, monitor);
                w.println(r != null && r.decompileCompleted() ? r.getDecompiledFunction().getC() : "// decompile failed");
            }
            ifc.dispose();
        }
        println("symrefs " + funcs.size() + " -> " + args[0]);
    }
}
