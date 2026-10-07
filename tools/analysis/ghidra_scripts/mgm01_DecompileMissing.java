import ghidra.app.decompiler.*;
import ghidra.app.script.GhidraScript;
import ghidra.program.model.listing.*;
import java.io.*;
import java.nio.file.*;
import java.util.regex.Pattern;
public class mgm01_DecompileMissing extends GhidraScript {
 public void run() throws Exception {
  String[] a=getScriptArgs();
  String pats=Files.readString(Path.of(a[1])).replace("\\~","__TILDE__");
  Pattern pat=Pattern.compile(String.join("|",pats.split("~")).replace("__TILDE__","~"));
  DecompInterface d=new DecompInterface(); d.setOptions(new DecompileOptions()); d.openProgram(currentProgram); int n=0;
  try(PrintWriter w=new PrintWriter(a[0],"UTF-8")) {
   FunctionIterator it=currentProgram.getFunctionManager().getFunctions(true);
   while(it.hasNext()) {Function f=it.next(); if(f.isThunk()||f.isExternal()||!pat.matcher(f.getName(true)).matches())continue;
    w.println("// ==== "+f.getEntryPoint()+" "+f.getName(true)); DecompileResults r=d.decompileFunction(f,120,monitor);
    w.println(r.decompileCompleted()?r.getDecompiledFunction().getC():"// decompile failed"); n++;
   }
  } finally {d.dispose();} println("picked="+n+" -> "+a[0]);
 }
}
