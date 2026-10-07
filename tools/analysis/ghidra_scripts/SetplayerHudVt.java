import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileOptions;
import ghidra.app.decompiler.DecompileResults;
import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Function;
import ghidra.program.model.symbol.Reference;

import java.io.File;
import java.io.PrintWriter;

// args: out.c typedesc_hex/got_hex:slot_hex+slot_hex ...  (vtable 0번 = GetTypeDesc 가 typedesc 를 돌려주는 HUD 의 지정 슬롯 디컴파일)
public class SetplayerHudVt extends GhidraScript {
    @Override
    protected void run() throws Exception {
        String[] args = getScriptArgs();
        DecompInterface ifc = new DecompInterface();
        ifc.setOptions(new DecompileOptions());
        ifc.openProgram(currentProgram);
        try (PrintWriter w = new PrintWriter(new File(args[0]), "UTF-8")) {
            for (int i = 1; i < args.length; i++) {
                String[] p = args[i].split(":");
                java.util.List<Reference> refs = new java.util.ArrayList<>();
                for (String a : p[0].split("/")) {
                    for (Reference r0 : getReferencesTo(toAddr(Long.parseUnsignedLong(a, 16)))) refs.add(r0);
                }
                w.println("// ######## typedesc " + p[0] + " refs " + refs.size());
                for (Reference r : refs) {
                    Function f = getFunctionContaining(r.getFromAddress());
                    w.println("// ref " + r.getFromAddress() + " " + r.getReferenceType() + " " + (f == null ? "-" : f.getName(true) + " " + f.getBody().getNumAddresses()));
                    if (f == null || f.getBody().getNumAddresses() > 16) continue;
                    w.println("// gettypedesc " + f.getEntryPoint());
                    for (Reference vr : getReferencesTo(f.getEntryPoint())) {
                        Address vt = vr.getFromAddress();
                        if (getFunctionContaining(vt) != null) continue;
                        w.println("// vtable " + vt);
                        for (String s : p[1].split("[+]")) {
                            long off = Long.parseLong(s, 16);
                            Address slot = vt.add(off);
                            long tgt = getLong(slot);
                            Address ta = toAddr(tgt);
                            Function tf = getFunctionAt(ta);
                            w.println("// ==== slot +0x" + s + " -> " + ta + " " + (tf == null ? "(none)" : tf.getName(true)));
                            if (tf != null) {
                                DecompileResults dr = ifc.decompileFunction(tf, 120, monitor);
                                w.println(dr != null && dr.decompileCompleted() ? dr.getDecompiledFunction().getC() : "// fail");
                            }
                        }
                    }
                }
            }
        } finally {
            ifc.dispose();
        }
    }
}
