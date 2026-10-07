import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.symbol.Symbol;

import java.io.File;
import java.io.PrintWriter;

// args: out.txt item...
//   ptrs:hexaddr:n   -> n 개 8바이트 포인터와 가리키는 C 문자열
//   offs:hexaddr:n   -> n 개 s32 오프셋(기준 = hexaddr)과 그 위치 C 문자열 (MGM_BGM 표 형식)
//   f32:hexaddr:n    -> n 개 f32
//   sym:name         -> 심볼 주소와 첫 16바이트
public class MgmcommonData extends GhidraScript {
    String cstr(Address a) throws Exception {
        StringBuilder b = new StringBuilder();
        for (int i = 0; i < 200; i++) {
            int c = getByte(a.add(i)) & 0xff;
            if (c == 0) break;
            b.append((char) c);
        }
        return b.toString();
    }
    @Override
    protected void run() throws Exception {
        String[] args = getScriptArgs();
        try (PrintWriter w = new PrintWriter(new File(args[0]), "UTF-8")) {
            for (int i = 1; i < args.length; i++) {
                String[] p = args[i].split(":");
                w.println("## " + args[i]);
                if (p[0].equals("sym")) {
                    for (Symbol s : currentProgram.getSymbolTable().getSymbols(p[1])) {
                        Address a = s.getAddress();
                        StringBuilder h = new StringBuilder();
                        for (int k = 0; k < 16; k++) h.append(String.format("%02x ", getByte(a.add(k)) & 0xff));
                        w.println(a + " " + h + " f32: " + getFloat(a) + " " + getFloat(a.add(4)) + " " + getFloat(a.add(8)));
                    }
                    continue;
                }
                Address base = toAddr(Long.parseUnsignedLong(p[1], 16));
                int n = Integer.parseInt(p[2]);
                for (int k = 0; k < n; k++) {
                    if (p[0].equals("ptrs")) {
                        long v = getLong(base.add(8L * k));
                        String s = v == 0 ? "" : cstr(toAddr(v));
                        w.println("[" + k + "] " + Long.toHexString(v) + " \"" + s + "\"");
                    } else if (p[0].equals("offs")) {
                        int o = getInt(base.add(4L * k));
                        w.println("[" + k + "] +" + o + " \"" + cstr(base.add(o)) + "\"");
                    } else if (p[0].equals("f32")) {
                        w.println("[" + k + "] " + getFloat(base.add(4L * k)));
                    }
                }
            }
        }
        println("data -> " + args[0]);
    }
}
