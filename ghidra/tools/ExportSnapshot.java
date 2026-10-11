// 프로그램 하나를 <db>/<프로젝트 안 경로>/ 텍스트로 내보낸다(git diff용). 인자: <db 폴더>
//   예: /exefs/main.nso → <db>/exefs/main.nso/, /romfs/nro/NX_Release/mg0108.nro → <db>/romfs/nro/NX_Release/mg0108.nro/
// 서버 안(/run_ghidra_script)과 헤드리스(snapshot.py export) 둘 다 이 스크립트를 쓴다.
//   meta.json                 모듈·경로·기준 주소·언어
//   functions/<구간>.tsv      addr size name namespace namesrc sigsrc thunk tags signature
//   calls/<구간>.tsv          caller → callee 목록(외부는 ext:이름)
//   comments/<구간>.jsonl     모든 주석(plate/pre/eol/post/repeatable)
//   signatures.jsonl          사용자 지정 시그니처(복원용 구조)
//   labels.tsv                사용자 라벨
//   data.jsonl                사용자 라벨 주소에 적용된 데이터 타입
//   vars.jsonl                사용자가 이름 붙인 지역 변수(저장 위치 직렬화)
//   types.jsonl               struct/union/enum/typedef/funcdef
// <구간> = 주소 1MB 단위 시작 주소(예: 7100100000). 바뀐 구간 파일만 내용이 달라진다.
// 파일은 임시 이름으로 쓴 뒤 바꿔 넣고, 이번에 안 쓴 구간 파일은 지운다. 같은 DB면 같은 바이트를 쓴다.
import com.google.gson.Gson;
import com.google.gson.GsonBuilder;
import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.data.*;
import ghidra.program.model.listing.*;
import ghidra.program.model.symbol.*;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.util.*;

public class ExportSnapshot extends GhidraScript {
    private static final Gson GSON = new GsonBuilder().disableHtmlEscaping().create();
    private static final CommentType[] COMMENT_TYPES = {
        CommentType.PLATE, CommentType.PRE, CommentType.EOL, CommentType.POST, CommentType.REPEATABLE };

    static String hex(Address a) {
        return Long.toHexString(a.getOffset());
    }

    static String src(SourceType s) {
        switch (s) {
            case USER_DEFINED: return "u";
            case IMPORTED: return "i";
            case ANALYSIS: return "a";
            default: return "d";
        }
    }

    static String clean(String s) {
        return s == null ? "" : s.replace("\\", "\\\\").replace("\t", "\\t").replace("\r", "\\r").replace("\n", "\\n");
    }

    static String nsPath(Namespace ns) {
        if (ns == null || ns.isGlobal()) return "";
        return ns.getName(true);
    }

    public static String moduleName(String programName) {
        int dot = programName.lastIndexOf('.');
        return dot > 0 ? programName.substring(0, dot) : programName;
    }

    static String shard(Address a) {
        return Long.toHexString((a.getOffset() >>> 20) << 20);
    }

    void writeSharded(File dir, String sub, String ext, String header, TreeMap<String, List<String>> shards) throws IOException {
        File d = new File(dir, sub);
        d.mkdirs();
        Set<String> keep = new HashSet<>();
        for (Map.Entry<String, List<String>> e : shards.entrySet()) {
            List<String> l = new ArrayList<>();
            if (header != null) l.add(header);
            l.addAll(e.getValue());
            write(d, e.getKey() + ext, l);
            keep.add(e.getKey() + ext);
        }
        File[] old = d.listFiles();
        if (old != null) for (File f : old) if (f.getName().endsWith(ext) && !keep.contains(f.getName())) f.delete();
    }

    void write(File dir, String name, List<String> lines) throws IOException {
        File tmp = new File(dir, name + ".tmp");
        StringBuilder sb = new StringBuilder();
        for (String l : lines) sb.append(l).append('\n');
        Files.writeString(tmp.toPath(), sb.toString(), StandardCharsets.UTF_8);
        Files.move(tmp.toPath(), new File(dir, name).toPath(), StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE);
    }

    @Override
    protected void run() throws Exception {
        File dir = new File(getScriptArgs()[0], currentProgram.getDomainFile().getPathname().substring(1));
        dir.mkdirs();
        long t0 = System.currentTimeMillis();
        FunctionManager fm = currentProgram.getFunctionManager();
        Listing listing = currentProgram.getListing();

        JsonObject meta = new JsonObject();
        meta.addProperty("module", moduleName(currentProgram.getName()));
        meta.addProperty("path", currentProgram.getDomainFile().getPathname());
        meta.addProperty("imageBase", hex(currentProgram.getImageBase()));
        meta.addProperty("language", currentProgram.getLanguageID().getIdAsString());
        write(dir, "meta.json", List.of(GSON.toJson(meta)));

        TreeMap<String, List<String>> funcs = new TreeMap<>();
        TreeMap<String, List<String>> calls = new TreeMap<>();
        List<String> sigs = new ArrayList<>();
        int nFunc = 0;
        for (Function f : fm.getFunctions(true)) {
            monitor.checkCancelled();
            List<String> tags = new ArrayList<>();
            for (FunctionTag t : f.getTags()) tags.add(t.getName());
            Collections.sort(tags);
            nFunc++;
            funcs.computeIfAbsent(shard(f.getEntryPoint()), k -> new ArrayList<>()).add(String.join("\t", hex(f.getEntryPoint()), Long.toString(f.getBody().getNumAddresses()),
                clean(f.getName()), clean(nsPath(f.getParentNamespace())), src(f.getSymbol().getSource()),
                src(f.getSignatureSource()), f.isThunk() ? "1" : "0", String.join(",", tags),
                clean(f.getPrototypeString(false, false))));
            TreeSet<String> callees = new TreeSet<>();
            for (Function c : f.getCalledFunctions(monitor)) {
                callees.add(c.isExternal() ? "ext:" + c.getName(true) : hex(c.getEntryPoint()));
            }
            if (!callees.isEmpty()) calls.computeIfAbsent(shard(f.getEntryPoint()), k -> new ArrayList<>()).add(hex(f.getEntryPoint()) + "\t" + String.join(",", callees));
            if (f.getSignatureSource() == SourceType.USER_DEFINED) {
                JsonObject s = new JsonObject();
                s.addProperty("a", hex(f.getEntryPoint()));
                s.addProperty("cc", f.getCallingConventionName());
                s.addProperty("ret", f.getReturnType().getPathName());
                JsonArray ps = new JsonArray();
                for (Parameter p : f.getParameters()) {
                    if (p.isAutoParameter()) continue;
                    JsonArray pa = new JsonArray();
                    pa.add(p.getName());
                    pa.add(p.getDataType().getPathName());
                    ps.add(pa);
                }
                s.add("params", ps);
                s.addProperty("varargs", f.hasVarArgs());
                s.addProperty("noreturn", f.hasNoReturn());
                sigs.add(GSON.toJson(s));
            }
        }
        writeSharded(dir, "functions", ".tsv", "addr\tsize\tname\tnamespace\tnamesrc\tsigsrc\tthunk\ttags\tsignature", funcs);
        writeSharded(dir, "calls", ".tsv", "caller\tcallees", calls);
        write(dir, "signatures.jsonl", sigs);

        TreeMap<String, List<String>> comments = new TreeMap<>();
        int nCom = 0;
        var it = listing.getCommentAddressIterator(currentProgram.getMemory(), true);
        while (it.hasNext()) {
            Address a = it.next();
            for (CommentType ct : COMMENT_TYPES) {
                String c = listing.getComment(ct, a);
                if (c == null) continue;
                JsonObject o = new JsonObject();
                o.addProperty("a", hex(a));
                o.addProperty("t", ct.name().toLowerCase());
                o.addProperty("c", c);
                comments.computeIfAbsent(shard(a), k -> new ArrayList<>()).add(GSON.toJson(o));
                nCom++;
            }
        }
        writeSharded(dir, "comments", ".jsonl", null, comments);

        List<String> labels = new ArrayList<>();
        labels.add("addr\tname\tnamespace\tprimary");
        SymbolIterator si = currentProgram.getSymbolTable().getAllSymbols(true);
        TreeMap<String, String> lab = new TreeMap<>();
        while (si.hasNext()) {
            Symbol s = si.next();
            if (s.getSymbolType() != SymbolType.LABEL || s.getSource() != SourceType.USER_DEFINED || s.isExternal()) continue;
            String line = String.join("\t", hex(s.getAddress()), clean(s.getName()), clean(nsPath(s.getParentNamespace())), s.isPrimary() ? "1" : "0");
            lab.put(String.format("%016x", s.getAddress().getOffset()) + "\t" + s.getName() + "\t" + nsPath(s.getParentNamespace()), line);
        }
        labels.addAll(lab.values());
        write(dir, "labels.tsv", labels);

        List<String> data = new ArrayList<>();
        for (String key : lab.keySet()) {
            Address a = toAddr(Long.parseUnsignedLong(key.substring(0, 16), 16));
            Data d = listing.getDefinedDataAt(a);
            if (d == null) continue;
            JsonObject o = new JsonObject();
            o.addProperty("a", hex(a));
            o.addProperty("t", d.getDataType().getPathName());
            String line = GSON.toJson(o);
            if (data.isEmpty() || !data.get(data.size() - 1).equals(line)) data.add(line);
        }
        write(dir, "data.jsonl", data);

        List<String> vars = new ArrayList<>();
        for (Function f : fm.getFunctions(true)) {
            for (Variable v : f.getLocalVariables()) {
                if (v.getSource() != SourceType.USER_DEFINED) continue;
                JsonObject o = new JsonObject();
                o.addProperty("f", hex(f.getEntryPoint()));
                o.addProperty("n", v.getName());
                o.addProperty("t", v.getDataType().getPathName());
                o.addProperty("s", v.getVariableStorage().getSerializationString());
                o.addProperty("o", v.getFirstUseOffset());
                if (v.getComment() != null) o.addProperty("c", v.getComment());
                vars.add(GSON.toJson(o));
            }
        }
        write(dir, "vars.jsonl", vars);

        TreeMap<String, String> types = new TreeMap<>();
        Iterator<DataType> dts = currentProgram.getDataTypeManager().getAllDataTypes();
        while (dts.hasNext()) {
            DataType dt = dts.next();
            JsonObject o = typeJson(dt);
            if (o != null) types.put(dt.getPathName(), GSON.toJson(o));
        }
        write(dir, "types.jsonl", new ArrayList<>(types.values()));

        println(currentProgram.getName() + ": 함수 " + nFunc + ", 시그니처 " + sigs.size() + ", 주석 " + nCom
            + ", 라벨 " + (labels.size() - 1) + ", 타입 " + types.size() + " -> " + dir + " (" + (System.currentTimeMillis() - t0) + "ms)");
    }

    static String packing(Composite c) {
        if (!c.isPackingEnabled()) return "off";
        return c.hasExplicitPackingValue() ? Integer.toString(c.getExplicitPackingValue()) : "default";
    }

    static String alignment(Composite c) {
        if (c.isMachineAligned()) return "machine";
        return c.hasExplicitMinimumAlignment() ? Integer.toString(c.getExplicitMinimumAlignment()) : "default";
    }

    static JsonArray fields(Composite c, boolean withOffset) {
        JsonArray fs = new JsonArray();
        for (DataTypeComponent d : c.getDefinedComponents()) {
            JsonObject f = new JsonObject();
            if (withOffset) f.addProperty("o", d.getOffset());
            f.addProperty("l", d.getLength());
            if (d.isBitFieldComponent()) {
                BitFieldDataType bf = (BitFieldDataType) d.getDataType();
                f.addProperty("t", bf.getBaseDataType().getPathName());
                f.addProperty("bs", bf.getDeclaredBitSize());
                f.addProperty("bo", bf.getBitOffset());
            } else {
                f.addProperty("t", d.getDataType().getPathName());
            }
            if (d.getFieldName() != null) f.addProperty("n", d.getFieldName());
            if (d.getComment() != null) f.addProperty("c", d.getComment());
            fs.add(f);
        }
        return fs;
    }

    static JsonObject typeJson(DataType dt) {
        JsonObject o = new JsonObject();
        o.addProperty("p", dt.getPathName());
        if (dt instanceof Structure s) {
            o.addProperty("k", "struct");
            o.addProperty("size", s.isZeroLength() ? 0 : s.getLength());
            o.addProperty("pack", packing(s));
            o.addProperty("align", alignment(s));
            o.add("f", fields(s, true));
        } else if (dt instanceof Union u) {
            o.addProperty("k", "union");
            o.addProperty("pack", packing(u));
            o.addProperty("align", alignment(u));
            o.add("f", fields(u, false));
        } else if (dt instanceof ghidra.program.model.data.Enum e) {
            o.addProperty("k", "enum");
            o.addProperty("size", e.getLength());
            JsonArray vs = new JsonArray();
            String[] names = e.getNames();
            Arrays.sort(names, Comparator.comparingLong((String n) -> e.getValue(n)).thenComparing(n -> n));
            for (String n : names) {
                JsonArray v = new JsonArray();
                v.add(n);
                v.add(e.getValue(n));
                String c = e.getComment(n);
                if (c != null && !c.isEmpty()) v.add(c);
                vs.add(v);
            }
            o.add("v", vs);
        } else if (dt instanceof TypeDef td) {
            o.addProperty("k", "typedef");
            o.addProperty("t", td.getDataType().getPathName());
        } else if (dt instanceof FunctionDefinition fd) {
            o.addProperty("k", "funcdef");
            o.addProperty("cc", fd.getCallingConventionName());
            o.addProperty("ret", fd.getReturnType().getPathName());
            JsonArray ps = new JsonArray();
            for (ParameterDefinition p : fd.getArguments()) {
                JsonArray pa = new JsonArray();
                pa.add(p.getName());
                pa.add(p.getDataType().getPathName());
                ps.add(pa);
            }
            o.add("params", ps);
            o.addProperty("varargs", fd.hasVarArgs());
            o.addProperty("noreturn", fd.hasNoReturn());
        } else {
            return null;
        }
        if (dt.getDescription() != null && !dt.getDescription().isEmpty()) o.addProperty("desc", dt.getDescription());
        return o;
    }
}
