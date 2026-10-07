import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Data;
import ghidra.program.model.listing.DataIterator;
import ghidra.program.model.listing.Function;
import ghidra.program.model.symbol.Reference;
import java.io.File;
import java.io.PrintWriter;

// Read-only data and cross-reference evidence; deliberately does not decompile.
public class mgm01_DataRefs extends GhidraScript {
    void refs(PrintWriter w, Address a) {
        for (Reference r : getReferencesTo(a)) {
            Function f = getFunctionContaining(r.getFromAddress());
            w.println("  ref " + r.getFromAddress() + " " + r.getReferenceType() + " function=" +
                (f == null ? "-" : f.getEntryPoint() + " " + f.getName(true)));
        }
    }
    String cstr(Address a) throws Exception {
        StringBuilder b = new StringBuilder();
        for (int i=0; i<300; i++) { int c=getByte(a.add(i))&255; if(c==0) break; b.append((char)c); }
        return b.toString();
    }
    public void run() throws Exception {
        String[] args=getScriptArgs();
        try(PrintWriter w=new PrintWriter(new File(args[0]), "UTF-8")) {
            for(int i=1; i<args.length; i++) {
                String[] p=args[i].split(":",2);
                if(p[0].equals("scan")) {
                    DataIterator it=currentProgram.getListing().getDefinedData(true);
                    while(it.hasNext()) {
                        Data d=it.next(); Object v=d.getValue();
                        if(v instanceof String && ((String)v).contains(p[1])) {
                            w.println("string " + d.getAddress() + " " + v); refs(w,d.getAddress());
                        }
                    }
                } else {
                    Address a=toAddr(Long.parseUnsignedLong(p[1],16));
                    if(p[0].equals("str")) w.println("string " + a + " " + cstr(a));
                    refs(w,a);
                }
            }
        }
    }
}
