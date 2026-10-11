// <db>/<프로젝트 안 경로>/ 스냅샷을 프로그램에 맞춰 넣는다(복원). 인자: <db 폴더> [tags.json]
// 순서: 태그 정의 → 타입 → 함수 생성 → 사용자 이름·네임스페이스 → 태그 → 시그니처 → 주석 → 라벨 → 데이터 타입 → 지역 변수
// 주석·라벨·태그는 스냅샷과 같아지도록 맞춘다(없는 것은 지움). 여러 번 돌려도 결과가 같다.
import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import ghidra.app.cmd.function.CreateFunctionCmd;
import ghidra.app.script.GhidraScript;
import ghidra.app.util.NamespaceUtils;
import ghidra.program.model.address.Address;
import ghidra.program.model.data.*;
import ghidra.program.model.listing.*;
import ghidra.program.model.symbol.*;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class ApplySnapshot extends GhidraScript {
    private static final Pattern PTR = Pattern.compile("^(.*) \\*(\\d*)$");
    private static final Pattern ARR = Pattern.compile("^(.*?)\\[(\\d+)\\](.*)$");
    private DataTypeManager dtm;
    private final List<String> problems = new ArrayList<>();

    Address addr(String hex) {
        return currentProgram.getAddressFactory().getDefaultAddressSpace().getAddress(Long.parseUnsignedLong(hex, 16));
    }

    static String unclean(String s) {
        StringBuilder b = new StringBuilder();
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '\\' && i + 1 < s.length()) {
                char n = s.charAt(++i);
                b.append(n == 't' ? '\t' : n == 'n' ? '\n' : n == 'r' ? '\r' : n);
            } else {
                b.append(c);
            }
        }
        return b.toString();
    }

    List<String> lines(File f) throws Exception {
        if (!f.exists()) return List.of();
        List<String> out = new ArrayList<>();
        for (String l : Files.readAllLines(f.toPath(), StandardCharsets.UTF_8)) if (!l.isEmpty()) out.add(l);
        return out;
    }

    List<String> shardLines(File dir, String sub, String ext, boolean header) throws Exception {
        File[] fs = new File(dir, sub).listFiles((d, n) -> n.endsWith(ext));
        List<String> out = new ArrayList<>();
        if (fs == null) return out;
        Arrays.sort(fs);
        for (File f : fs) {
            List<String> l = lines(f);
            out.addAll(header ? l.subList(Math.min(1, l.size()), l.size()) : l);
        }
        return out;
    }

    DataType resolve(String path) {
        if (path.equals("/undefined")) return DataType.DEFAULT;
        DataType dt = dtm.getDataType(path);
        if (dt != null) return dt;
        DataType b = BuiltInDataTypeManager.getDataTypeManager().getDataType(path);
        if (b != null) return b;
        int slash = path.lastIndexOf('/');
        String cat = path.substring(0, slash + 1), name = path.substring(slash + 1);
        Matcher m = PTR.matcher(name);
        if (m.matches()) {
            DataType base = resolve(cat + m.group(1));
            if (base == null) return null;
            return m.group(2).isEmpty() ? new PointerDataType(base, dtm) : new PointerDataType(base, Integer.parseInt(m.group(2)) / 8, dtm);
        }
        m = ARR.matcher(name);
        if (m.matches()) {
            DataType elem = resolve(cat + m.group(1) + m.group(3));
            if (elem == null) return null;
            return new ArrayDataType(elem, Integer.parseInt(m.group(2)), elem.getLength(), dtm);
        }
        return null;
    }

    DataType need(String path, String where) {
        DataType dt = resolve(path);
        if (dt == null) {
            problems.add("타입 없음 " + path + " (" + where + ")");
            return Undefined1DataType.dataType;
        }
        return dt;
    }

    static CategoryPath catOf(String path) {
        int slash = path.lastIndexOf('/');
        return slash <= 0 ? CategoryPath.ROOT : new CategoryPath(path.substring(0, slash));
    }

    static String nameOf(String path) {
        return path.substring(path.lastIndexOf('/') + 1);
    }

    static void syncDesc(DataType dt, JsonObject o) {
        String want = o.has("desc") ? o.get("desc").getAsString() : "";
        String cur = dt.getDescription() == null ? "" : dt.getDescription();
        if (!want.equals(cur)) dt.setDescription(want);
    }

    void setPacking(Composite c, JsonObject o) {
        String pack = o.get("pack").getAsString();
        if (pack.equals("off")) c.setPackingEnabled(false);
        else if (pack.equals("default")) c.setToDefaultPacking();
        else c.setExplicitPackingValue(Integer.parseInt(pack));
        String align = o.get("align").getAsString();
        if (align.equals("machine")) c.setToMachineAligned();
        else if (align.equals("default")) c.setToDefaultAligned();
        else c.setExplicitMinimumAlignment(Integer.parseInt(align));
    }

    void applyTypes(List<JsonObject> types) throws Exception {
        for (JsonObject o : types) {
            String p = o.get("p").getAsString(), k = o.get("k").getAsString();
            if (dtm.getDataType(p) != null) continue;
            DataType dt = switch (k) {
                case "struct" -> new StructureDataType(catOf(p), nameOf(p), 0, dtm);
                case "union" -> new UnionDataType(catOf(p), nameOf(p), dtm);
                case "enum" -> new EnumDataType(catOf(p), nameOf(p), o.get("size").getAsInt(), dtm);
                default -> null;
            };
            if (dt != null) dtm.addDataType(dt, DataTypeConflictHandler.KEEP_HANDLER);
        }
        for (JsonObject o : types) {
            String p = o.get("p").getAsString(), k = o.get("k").getAsString();
            if (k.equals("typedef") && dtm.getDataType(p) == null) {
                dtm.addDataType(new TypedefDataType(catOf(p), nameOf(p), need(o.get("t").getAsString(), p), dtm), DataTypeConflictHandler.KEEP_HANDLER);
            } else if (k.equals("funcdef")) {
                FunctionDefinitionDataType fd = new FunctionDefinitionDataType(catOf(p), nameOf(p), dtm);
                fd.setReturnType(need(o.get("ret").getAsString(), p));
                List<ParameterDefinition> ps = new ArrayList<>();
                for (JsonElement e : o.getAsJsonArray("params")) {
                    JsonArray a = e.getAsJsonArray();
                    ps.add(new ParameterDefinitionImpl(a.get(0).getAsString(), need(a.get(1).getAsString(), p), null));
                }
                fd.setArguments(ps.toArray(new ParameterDefinition[0]));
                fd.setVarArgs(o.get("varargs").getAsBoolean());
                fd.setNoReturn(o.get("noreturn").getAsBoolean());
                if (o.has("cc")) fd.setCallingConvention(o.get("cc").getAsString());
                DataType cur = dtm.getDataType(p);
                if (cur == null) dtm.addDataType(fd, DataTypeConflictHandler.KEEP_HANDLER);
                else if (!cur.isEquivalent(fd)) cur.replaceWith(fd);
            }
        }
        for (JsonObject o : types) {
            String p = o.get("p").getAsString(), k = o.get("k").getAsString();
            DataType cur = dtm.getDataType(p);
            if (k.equals("struct") && cur instanceof Structure s) {
                StructureDataType want = new StructureDataType(catOf(p), nameOf(p), 0, dtm);
                setPacking(want, o);
                boolean packed = want.isPackingEnabled();
                if (!packed && o.get("size").getAsInt() > 0) want.growStructure(o.get("size").getAsInt());
                for (JsonElement e : o.getAsJsonArray("f")) {
                    JsonObject f = e.getAsJsonObject();
                    String n = f.has("n") ? f.get("n").getAsString() : null, c = f.has("c") ? f.get("c").getAsString() : null;
                    DataType ft = need(f.get("t").getAsString(), p);
                    if (f.has("bs")) {
                        if (packed) want.addBitField(ft, f.get("bs").getAsInt(), n, c);
                        else want.insertBitFieldAt(f.get("o").getAsInt(), f.get("l").getAsInt(), f.get("bo").getAsInt(), ft, f.get("bs").getAsInt(), n, c);
                    } else if (packed) {
                        want.add(ft, f.get("l").getAsInt(), n, c);
                    } else {
                        want.replaceAtOffset(f.get("o").getAsInt(), ft, f.get("l").getAsInt(), n, c);
                    }
                }
                if (o.has("desc")) want.setDescription(o.get("desc").getAsString());
                if (!s.isEquivalent(want)) s.replaceWith(want);
                syncDesc(s, o);
            } else if (k.equals("union") && cur instanceof Union u) {
                UnionDataType want = new UnionDataType(catOf(p), nameOf(p), dtm);
                setPacking(want, o);
                for (JsonElement e : o.getAsJsonArray("f")) {
                    JsonObject f = e.getAsJsonObject();
                    String n = f.has("n") ? f.get("n").getAsString() : null, c = f.has("c") ? f.get("c").getAsString() : null;
                    DataType ft = need(f.get("t").getAsString(), p);
                    if (f.has("bs")) want.addBitField(ft, f.get("bs").getAsInt(), n, c);
                    else want.add(ft, f.get("l").getAsInt(), n, c);
                }
                if (o.has("desc")) want.setDescription(o.get("desc").getAsString());
                if (!u.isEquivalent(want)) u.replaceWith(want);
                syncDesc(u, o);
            } else if (k.equals("enum") && cur instanceof ghidra.program.model.data.Enum en) {
                EnumDataType want = new EnumDataType(catOf(p), nameOf(p), o.get("size").getAsInt(), dtm);
                for (JsonElement e : o.getAsJsonArray("v")) {
                    JsonArray v = e.getAsJsonArray();
                    want.add(v.get(0).getAsString(), v.get(1).getAsLong(), v.size() > 2 ? v.get(2).getAsString() : null);
                }
                if (o.has("desc")) want.setDescription(o.get("desc").getAsString());
                if (!en.isEquivalent(want)) en.replaceWith(want);
                syncDesc(en, o);
            }
        }
    }

    @Override
    protected void run() throws Exception {
        String[] args = getScriptArgs();
        File dir = new File(args[0], currentProgram.getDomainFile().getPathname().substring(1));
        if (!dir.isDirectory()) {
            println(currentProgram.getName() + ": 스냅샷 없음 " + dir);
            return;
        }
        dtm = currentProgram.getDataTypeManager();
        FunctionManager fm = currentProgram.getFunctionManager();
        SymbolTable st = currentProgram.getSymbolTable();
        Listing listing = currentProgram.getListing();
        int tx = currentProgram.startTransaction("ApplySnapshot");
        boolean ok = false;
        int nCreated = 0, nNamed = 0, nTags = 0, nSigs = 0, nCom = 0, nComDel = 0, nLab = 0, nData = 0, nVars = 0;
        try {
            FunctionTagManager tm = fm.getFunctionTagManager();
            if (args.length > 1) {
                JsonObject tags = JsonParser.parseString(Files.readString(new File(args[1]).toPath(), StandardCharsets.UTF_8)).getAsJsonObject().getAsJsonObject("tags");
                for (Map.Entry<String, JsonElement> e : tags.entrySet()) {
                    String desc = e.getValue().getAsJsonObject().has("desc") ? e.getValue().getAsJsonObject().get("desc").getAsString() : "";
                    FunctionTag t = tm.getFunctionTag(e.getKey());
                    if (t == null) tm.createFunctionTag(e.getKey(), desc);
                    else if (!desc.equals(t.getComment())) t.setComment(desc);
                }
            }

            List<JsonObject> types = new ArrayList<>();
            for (String l : lines(new File(dir, "types.jsonl"))) types.add(JsonParser.parseString(l).getAsJsonObject());
            applyTypes(types);

            for (String l : shardLines(dir, "functions", ".tsv", true)) {
                monitor.checkCancelled();
                String[] c = l.split("\t", -1);
                Address a = addr(c[0]);
                Function f = fm.getFunctionAt(a);
                if (f == null) {
                    CreateFunctionCmd cmd = new CreateFunctionCmd(a);
                    if (!cmd.applyTo(currentProgram) || (f = fm.getFunctionAt(a)) == null) {
                        problems.add("함수 생성 실패 " + c[0]);
                        continue;
                    }
                    nCreated++;
                }
                if (c[4].equals("u")) {
                    String name = unclean(c[2]), ns = unclean(c[3]);
                    Namespace parent = ns.isEmpty() ? currentProgram.getGlobalNamespace()
                        : NamespaceUtils.createNamespaceHierarchy(ns, null, currentProgram, SourceType.USER_DEFINED);
                    if (!f.getName().equals(name) || !f.getParentNamespace().equals(parent) || f.getSymbol().getSource() != SourceType.USER_DEFINED) {
                        f.getSymbol().setNameAndNamespace(name, parent, SourceType.USER_DEFINED);
                        nNamed++;
                    }
                }
                Set<String> want = new TreeSet<>();
                if (!c[7].isEmpty()) want.addAll(Arrays.asList(c[7].split(",")));
                Set<String> have = new TreeSet<>();
                for (FunctionTag t : f.getTags()) have.add(t.getName());
                if (!want.equals(have)) {
                    for (String t : have) if (!want.contains(t)) f.removeTag(t);
                    for (String t : want) if (!have.contains(t)) f.addTag(t);
                    nTags++;
                }
            }

            for (String l : lines(new File(dir, "signatures.jsonl"))) {
                JsonObject s = JsonParser.parseString(l).getAsJsonObject();
                Function f = fm.getFunctionAt(addr(s.get("a").getAsString()));
                if (f == null) {
                    problems.add("시그니처 대상 함수 없음 " + s.get("a").getAsString());
                    continue;
                }
                String where = s.get("a").getAsString();
                List<Variable> ps = new ArrayList<>();
                for (JsonElement e : s.getAsJsonArray("params")) {
                    JsonArray pa = e.getAsJsonArray();
                    ps.add(new ParameterImpl(pa.get(0).getAsString(), need(pa.get(1).getAsString(), where), currentProgram));
                }
                String cc = s.has("cc") && !s.get("cc").isJsonNull() ? s.get("cc").getAsString() : null;
                f.updateFunction(cc, new ReturnParameterImpl(need(s.get("ret").getAsString(), where), currentProgram),
                    ps, Function.FunctionUpdateType.DYNAMIC_STORAGE_ALL_PARAMS, true, SourceType.USER_DEFINED);
                if (s.has("varargs")) f.setVarArgs(s.get("varargs").getAsBoolean());
                if (s.has("noreturn")) f.setNoReturn(s.get("noreturn").getAsBoolean());
                nSigs++;
            }

            Map<String, String> wantCom = new HashMap<>();
            for (String l : shardLines(dir, "comments", ".jsonl", false)) {
                JsonObject o = JsonParser.parseString(l).getAsJsonObject();
                wantCom.put(o.get("a").getAsString() + "|" + o.get("t").getAsString(), o.get("c").getAsString());
            }
            CommentType[] cts = { CommentType.PLATE, CommentType.PRE, CommentType.EOL, CommentType.POST, CommentType.REPEATABLE };
            var it = listing.getCommentAddressIterator(currentProgram.getMemory(), true);
            List<Address> withCom = new ArrayList<>();
            while (it.hasNext()) withCom.add(it.next());
            for (Address a : withCom) {
                for (CommentType ct : cts) {
                    String key = Long.toHexString(a.getOffset()) + "|" + ct.name().toLowerCase();
                    if (listing.getComment(ct, a) != null && !wantCom.containsKey(key)) {
                        listing.setComment(a, ct, null);
                        nComDel++;
                    }
                }
            }
            for (Map.Entry<String, String> e : wantCom.entrySet()) {
                String[] k = e.getKey().split("\\|");
                Address a = addr(k[0]);
                CommentType ct = CommentType.valueOf(k[1].toUpperCase());
                if (!e.getValue().equals(listing.getComment(ct, a))) {
                    listing.setComment(a, ct, e.getValue());
                    nCom++;
                }
            }

            Set<String> wantLab = new HashSet<>();
            List<String> ll = lines(new File(dir, "labels.tsv"));
            for (String l : ll.subList(Math.min(1, ll.size()), ll.size())) {
                String[] c = l.split("\t", -1);
                String name = unclean(c[1]), ns = unclean(c[2]);
                wantLab.add(c[0] + "\t" + name + "\t" + ns);
                Address a = addr(c[0]);
                Namespace parent = ns.isEmpty() ? currentProgram.getGlobalNamespace()
                    : NamespaceUtils.createNamespaceHierarchy(ns, null, currentProgram, SourceType.USER_DEFINED);
                Symbol s = st.getSymbol(name, a, parent);
                if (s == null) {
                    s = st.createLabel(a, name, parent, SourceType.USER_DEFINED);
                    nLab++;
                }
                if (c[3].equals("1") && !s.isPrimary()) s.setPrimary();
            }
            List<Symbol> drop = new ArrayList<>();
            SymbolIterator si = st.getAllSymbols(true);
            while (si.hasNext()) {
                Symbol s = si.next();
                if (s.getSymbolType() != SymbolType.LABEL || s.getSource() != SourceType.USER_DEFINED || s.isExternal()) continue;
                String ns = s.getParentNamespace().isGlobal() ? "" : s.getParentNamespace().getName(true);
                if (!wantLab.contains(Long.toHexString(s.getAddress().getOffset()) + "\t" + s.getName() + "\t" + ns)) drop.add(s);
            }
            for (Symbol s : drop) s.delete();

            for (String l : lines(new File(dir, "data.jsonl"))) {
                JsonObject o = JsonParser.parseString(l).getAsJsonObject();
                Address a = addr(o.get("a").getAsString());
                DataType dt = resolve(o.get("t").getAsString());
                if (dt == null) {
                    problems.add("데이터 타입 없음 " + o.get("t").getAsString() + " @" + o.get("a").getAsString());
                    continue;
                }
                Data cur = listing.getDefinedDataAt(a);
                if (cur != null && cur.getDataType().isEquivalent(dt)) continue;
                try {
                    listing.clearCodeUnits(a, a.add(Math.max(dt.getLength(), 1) - 1), false);
                    listing.createData(a, dt);
                    nData++;
                } catch (Exception e) {
                    problems.add("데이터 적용 실패 @" + o.get("a").getAsString() + ": " + e.getMessage());
                }
            }

            for (String l : lines(new File(dir, "vars.jsonl"))) {
                JsonObject o = JsonParser.parseString(l).getAsJsonObject();
                Function f = fm.getFunctionAt(addr(o.get("f").getAsString()));
                if (f == null) {
                    problems.add("변수 대상 함수 없음 " + o.get("f").getAsString());
                    continue;
                }
                try {
                    VariableStorage storage = VariableStorage.deserialize(currentProgram, o.get("s").getAsString());
                    DataType dt = need(o.get("t").getAsString(), o.get("f").getAsString());
                    String name = o.get("n").getAsString();
                    Variable cur = null;
                    for (Variable v : f.getLocalVariables()) if (v.getVariableStorage().equals(storage)) cur = v;
                    if (cur == null) {
                        cur = f.addLocalVariable(new LocalVariableImpl(name, o.get("o").getAsInt(), dt, storage, currentProgram), SourceType.USER_DEFINED);
                        nVars++;
                    } else if (!cur.getName().equals(name) || !cur.getDataType().isEquivalent(dt) || cur.getSource() != SourceType.USER_DEFINED) {
                        cur.setName(name, SourceType.USER_DEFINED);
                        cur.setDataType(dt, SourceType.USER_DEFINED);
                        nVars++;
                    }
                    if (o.has("c")) cur.setComment(o.get("c").getAsString());
                } catch (Exception e) {
                    problems.add("변수 적용 실패 " + o.get("f").getAsString() + " " + o.get("n").getAsString() + ": " + e.getMessage());
                }
            }
            ok = true;
        } finally {
            currentProgram.endTransaction(tx, ok);
        }
        println(currentProgram.getName() + ": 함수 생성 " + nCreated + ", 이름 " + nNamed + ", 태그 " + nTags + ", 시그니처 " + nSigs
            + ", 주석 " + nCom + "(삭제 " + nComDel + "), 라벨 " + nLab + ", 데이터 " + nData + ", 변수 " + nVars + ", 문제 " + problems.size());
        for (String p : problems.subList(0, Math.min(50, problems.size()))) println("  문제: " + p);
    }
}
