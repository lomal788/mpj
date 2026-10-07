import ghidra.app.script.GhidraScript;
import ghidra.program.model.listing.Function;
import ghidra.program.model.listing.Instruction;
import ghidra.program.model.listing.InstructionIterator;

import java.io.File;
import java.io.PrintWriter;
import java.util.LinkedHashMap;
import java.util.Map;

// args: out.txt 부분문자열~부분문자열 ...  -> 명령 텍스트에 부분문자열이 든 곳(함수별 묶음)
public class MgmcommonInsnSearch extends GhidraScript {
    @Override
    protected void run() throws Exception {
        String[] args = getScriptArgs();
        String[] subs = args[1].split("~");
        Map<String, StringBuilder> by = new LinkedHashMap<>();
        InstructionIterator it = currentProgram.getListing().getInstructions(true);
        while (it.hasNext()) {
            Instruction ins = it.next();
            String t = ins.toString();
            for (String s : subs) {
                if (t.contains(s)) {
                    Function f = getFunctionContaining(ins.getAddress());
                    String k = f == null ? "-" : f.getName(true) + " @" + f.getEntryPoint();
                    by.computeIfAbsent(k, x -> new StringBuilder()).append("  ").append(ins.getAddress()).append(" ").append(t).append("\n");
                    break;
                }
            }
        }
        try (PrintWriter w = new PrintWriter(new File(args[0]), "UTF-8")) {
            for (Map.Entry<String, StringBuilder> e : by.entrySet()) { w.println("== " + e.getKey()); w.print(e.getValue()); }
        }
        println("insn " + by.size() + " -> " + args[0]);
    }
}
