"""FSAR(.fsst) 안의 FSEQ 시퀀스 디스어셈블러 (리듬 박자 변수 추적용).

usage:
  python tools/rhythm_fseq.py <fsst> labels            FSEQ 별 라벨 목록
  python tools/rhythm_fseq.py <fsst> dis <label>       라벨부터 디스어셈블 (fin/jump 까지, 트랙 열기 따라감)
  python tools/rhythm_fseq.py <fsst> vars              모든 FSEQ 에서 변수 명령(전역 변수 16~31) 출현 위치

명령 표는 NW 계열 시퀀스 명령(공개 문서·오픈소스 구현 기준)이다. 이 게임의 FSEQ 는 다바이트 인자가 리틀 엔디언이다(오프셋이 라벨과 맞는 것으로 확인). 변수 번호 0~15 = 로컬, 16~31 = 전역(G0~G15), 32~47 = 트랙.
"""
import struct
import sys


def u16be(d, o):
    return d[o] | (d[o + 1] << 8)


def s16be(d, o):
    v = u16be(d, o)
    return v - 0x10000 if v & 0x8000 else v


def u24be(d, o):
    return d[o] | (d[o + 1] << 8) | (d[o + 2] << 16)


def vlq(d, o):
    v = 0
    while True:
        b = d[o]
        o += 1
        v = (v << 7) | (b & 0x7F)
        if not b & 0x80:
            return v, o


U8_NAMES = {
    0xB0: "timebase", 0xB1: "env_hold", 0xB2: "monophonic", 0xB3: "velocity_range", 0xB4: "biquad_type",
    0xB5: "biquad_value", 0xB6: "bank_select", 0xBD: "mod_phase", 0xBE: "mod_curve", 0xBF: "front_bypass",
    0xC0: "pan", 0xC1: "volume", 0xC2: "main_volume", 0xC3: "transpose", 0xC4: "pitch_bend", 0xC5: "bend_range",
    0xC6: "prio", 0xC7: "note_wait", 0xC8: "tie", 0xC9: "porta", 0xCA: "mod_depth", 0xCB: "mod_speed",
    0xCC: "mod_type", 0xCD: "mod_range", 0xCE: "porta_sw", 0xCF: "porta_time", 0xD0: "attack", 0xD1: "decay",
    0xD2: "sustain", 0xD3: "release", 0xD4: "loop_start", 0xD5: "volume2", 0xD6: "printvar", 0xD7: "span",
    0xD8: "lpf_cutoff", 0xD9: "fxsend_a", 0xDA: "fxsend_b", 0xDB: "mainsend", 0xDC: "init_pan",
    0xDD: "mute", 0xDE: "fxsend_c", 0xDF: "damper",
}
S16_NAMES = {0xE0: "mod_delay", 0xE1: "tempo", 0xE3: "sweep_pitch", 0xE4: "mod_period"}
EXT_VAR = {
    0x80: "setvar", 0x81: "addvar", 0x82: "subvar", 0x83: "mulvar", 0x84: "divvar", 0x85: "shiftvar",
    0x86: "randvar", 0x87: "andvar", 0x88: "orvar", 0x89: "xorvar", 0x8A: "notvar", 0x8B: "modvar",
    0x90: "cmp_eq", 0x91: "cmp_ge", 0x92: "cmp_gt", 0x93: "cmp_le", 0x94: "cmp_lt", 0x95: "cmp_ne",
}


def varname(v):
    if v < 16:
        return f"L{v}"
    if v < 32:
        return f"G{v - 16}"
    return f"T{v - 32}"


class Seq:
    def __init__(self, data, labels):
        self.d = data
        self.labels = labels

    def decode(self, o):
        """returns (text, next_offset, kind, target) kind in {None,'jump','call','open','fin','ret'}"""
        d = self.d
        start = o
        prefix = []
        while d[o] in (0xA0, 0xA1, 0xA2, 0xA3, 0xA4, 0xA5):
            prefix.append(d[o])
            o += 1
        op = d[o]
        o += 1
        argmode = None
        if 0xA1 in prefix:
            argmode = "var"
        elif 0xA0 in prefix:
            argmode = "rand"

        def last_arg(kind):
            nonlocal o
            if argmode == "var":
                v = d[o]
                o += 1
                return varname(v)
            if argmode == "rand":
                a, b = s16be(d, o), s16be(d, o + 2)
                o += 4
                return f"rand({a},{b})"
            if kind == "u8":
                v = d[o]
                o += 1
                return str(v)
            if kind == "s16":
                v = s16be(d, o)
                o += 2
                return str(v)
            if kind == "u16":
                v = u16be(d, o)
                o += 2
                return f"0x{v:x}"
            if kind == "vlq":
                v, o = vlq(d, o)
                return str(v)
            raise ValueError(kind)

        kind, target = None, None
        if op < 0x80:
            vel = d[o]
            o += 1
            ln = last_arg("vlq")
            txt = f"note {op} vel={vel} len={ln}"
        elif op == 0x80:
            txt = f"wait {last_arg('vlq')}"
        elif op == 0x81:
            txt = f"prg {last_arg('vlq')}"
        elif op == 0x88:
            tr = d[o]
            target = u24be(d, o + 1)
            o += 4
            txt, kind = f"opentrack {tr} -> 0x{target:x}", "open"
        elif op == 0x89:
            target = u24be(d, o)
            o += 3
            txt, kind = f"jump 0x{target:x}", "jump"
        elif op == 0x8A:
            target = u24be(d, o)
            o += 3
            txt, kind = f"call 0x{target:x}", "call"
        elif op in U8_NAMES:
            txt = f"{U8_NAMES[op]} {last_arg('u8')}"
        elif op in S16_NAMES:
            txt = f"{S16_NAMES[op]} {last_arg('s16')}"
        elif op == 0xF0:
            sub = d[o]
            o += 1
            if sub in EXT_VAR:
                var = d[o]
                o += 1
                txt = f"{EXT_VAR[sub]} {varname(var)}, {last_arg('s16')}"
            elif sub == 0xE0:
                txt = f"userproc {last_arg('u16')}"
            elif 0xE1 <= sub <= 0xE6:
                txt = f"ext_{sub:02x} {last_arg('u8')}"
            else:
                txt = f"ext_{sub:02x} ?"
        elif op == 0xFB:
            txt = "env_reset"
        elif op == 0xFC:
            txt = "loop_end"
        elif op == 0xFD:
            txt, kind = "ret", "ret"
        elif op == 0xFE:
            txt = f"alloctrack 0x{u16be(d, o):04x}"
            o += 2
        elif op == 0xFF:
            txt, kind = "fin", "fin"
        else:
            txt = f"?? 0x{op:02x}"
            kind = "fin"
        if 0xA3 in prefix:
            txt += f" [time {s16be(d, o)}]"
            o += 2
        if 0xA4 in prefix:
            txt += f" [time rand {s16be(d, o)},{s16be(d, o + 2)}]"
            o += 4
        if 0xA5 in prefix:
            txt += f" [time {varname(d[o])}]"
            o += 1
        if 0xA2 in prefix:
            txt = "if " + txt
            if kind in ("jump", "fin", "ret"):
                kind = "cond_" + kind
        return txt, o, kind, target

    def disasm(self, start, maxn=4000, follow=True):
        seen = set()
        work = [start]
        out = []
        while work:
            o = work.pop(0)
            if o in seen:
                continue
            lab = [n for n, v in self.labels.items() if v == o]
            out.append(f"--- 0x{o:x} {' '.join(lab)}")
            n = 0
            while o < len(self.d) and n < maxn:
                if o in seen:
                    out.append(f"  (merge 0x{o:x})")
                    break
                seen.add(o)
                txt, no, kind, tgt = self.decode(o)
                lab = [nm for nm, v in self.labels.items() if v == o]
                out.append(f"  {o:05x}: {txt}" + (f"    <{','.join(lab)}>" if lab else ""))
                o = no
                n += 1
                if follow and kind in ("open", "call", "cond_jump") and tgt is not None:
                    work.append(tgt)
                if kind == "jump":
                    if follow:
                        work.append(tgt)
                    break
                if kind in ("fin", "ret"):
                    break
        return out


def parse_fsar(path):
    data = open(path, "rb").read()
    seqs = []
    pos = 0
    while True:
        pos = data.find(b"FSEQ\xff\xfe", pos)
        if pos < 0:
            break
        size = struct.unpack_from("<I", data, pos + 0xC)[0]
        nblk = struct.unpack_from("<H", data, pos + 0x10)[0]
        blocks = {}
        for i in range(nblk):
            typ, _, off, sz = struct.unpack_from("<HHII", data, pos + 0x14 + i * 12)
            blocks[typ] = (pos + off, sz)
        dstart = blocks[0x5000][0] + 8
        dsize = blocks[0x5000][1] - 8
        lpos = blocks[0x5001][0]
        cnt = struct.unpack_from("<I", data, lpos + 8)[0]
        labels = {}
        for i in range(cnt):
            _, _, eoff = struct.unpack_from("<HHI", data, lpos + 0xC + i * 8)
            e = lpos + 8 + eoff
            _, _, doff, nlen = struct.unpack_from("<HHII", data, e)
            name = data[e + 12:e + 12 + nlen].decode()
            labels[name] = doff
        seqs.append((pos, Seq(data[dstart:dstart + dsize], labels)))
        pos += size
    return seqs


def main():
    path, cmd = sys.argv[1], sys.argv[2]
    seqs = parse_fsar(path)
    if cmd == "labels":
        for pos, s in seqs:
            print(f"# FSEQ @0x{pos:x} data={len(s.d)}")
            for n, v in sorted(s.labels.items(), key=lambda x: x[1]):
                print(f"  0x{v:05x} {n}")
    elif cmd == "dis":
        for pos, s in seqs:
            if sys.argv[3] in s.labels:
                print(f"# FSEQ @0x{pos:x}")
                print("\n".join(s.disasm(s.labels[sys.argv[3]])))
    elif cmd == "vars":
        for pos, s in seqs:
            lines = []
            for start in sorted(set(s.labels.values())):
                for ln in s.disasm(start, follow=True):
                    if " G" in ln:
                        lines.append(ln)
            print(f"# FSEQ @0x{pos:x} labels={','.join(sorted(s.labels))[:300]}")
            for ln in sorted(set(lines)):
                print(ln)


if __name__ == "__main__":
    main()
