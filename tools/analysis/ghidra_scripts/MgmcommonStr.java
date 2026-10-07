import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import java.io.File;
import java.io.PrintWriter;

// args: out.txt item...   item = hexaddr:len (len 0 = C 문자열) | p:hexaddr (8바이트 포인터 값) | h:hexaddr:len (16진 바이트)
public class MgmcommonStr extends GhidraScript {
    @Override
    protected void run() throws Exception {
        String[] args = getScriptArgs();
        try (PrintWriter w = new PrintWriter(new File(args[0]), "UTF-8")) {
            for (int i = 1; i < args.length; i++) {
                String[] p = args[i].split(":");
                if (p[0].equals("h")) {
                    Address a = toAddr(Long.parseUnsignedLong(p[1], 16));
                    StringBuilder b = new StringBuilder();
                    for (int k = 0; k < Integer.parseInt(p[2]); k++) b.append(String.format("%02x ", getByte(a.add(k)) & 0xff));
                    w.println(args[i] + " = " + b);
                    continue;
                }
                if (p[0].equals("p")) {
                    Address a = toAddr(Long.parseUnsignedLong(p[1], 16));
                    w.println(args[i] + " = " + Long.toHexString(getLong(a)));
                    continue;
                }
                Address a = toAddr(Long.parseUnsignedLong(p[0], 16));
                int n = Integer.parseInt(p[1]);
                StringBuilder b = new StringBuilder();
                for (int k = 0; k < (n == 0 ? 200 : n); k++) {
                    int c = getByte(a.add(k)) & 0xff;
                    if (n == 0 && c == 0) break;
                    b.append(c >= 32 && c < 127 ? (char) c : '.');
                }
                w.println(args[i] + " = \"" + b + "\"");
            }
        }
        println("str -> " + args[0]);
    }
}
