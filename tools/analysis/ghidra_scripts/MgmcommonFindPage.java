import ghidra.app.script.GhidraScript;
import ghidra.program.model.listing.Instruction;
import ghidra.program.model.listing.InstructionIterator;
import ghidra.program.model.listing.Function;

import java.io.File;
import java.io.PrintWriter;

// args: out.txt pageHex offsetSubstring  -> adrp <page> 뒤 10명령 안에 offsetSubstring 이 나오는 곳 출력
public class MgmcommonFindPage extends GhidraScript {
    @Override
    protected void run() throws Exception {
        String[] args = getScriptArgs();
        String page = "0x" + args[1].toLowerCase();
        String sub = args[2];
        try (PrintWriter w = new PrintWriter(new File(args[0]), "UTF-8")) {
            InstructionIterator it = currentProgram.getListing().getInstructions(true);
            while (it.hasNext()) {
                Instruction ins = it.next();
                if (!ins.getMnemonicString().equals("adrp")) continue;
                if (!ins.toString().toLowerCase().contains(page)) continue;
                StringBuilder b = new StringBuilder();
                Instruction n = ins;
                boolean hit = false;
                for (int k = 0; k < 10 && n != null; k++) {
                    b.append("  ").append(n.getAddress()).append(" ").append(n.toString()).append("\n");
                    if (k > 0 && n.toString().contains(sub)) hit = true;
                    n = n.getNext();
                }
                if (hit) {
                    Function f = getFunctionContaining(ins.getAddress());
                    w.println("== " + ins.getAddress() + " in " + (f == null ? "-" : f.getName(true) + " @" + f.getEntryPoint()));
                    w.print(b);
                }
            }
        }
        println("findpage -> " + args[0]);
    }
}
