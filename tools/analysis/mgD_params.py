"""mgD: Params::createInstance 의 저장 명령(디컴파일 순서 그대로)을 바이트 배열에 재생해 필드 기본값을 뽑는다.
출력: analysis/mgD_params.json"""
import json, struct
from pathlib import Path

def run(size, stores):
    b = bytearray(size)
    for off, width, val in stores:
        b[off:off + width] = (val & ((1 << (8 * width)) - 1)).to_bytes(width, "little")
    return b

def f(b, o): return struct.unpack_from("<f", b, o)[0]
def i(b, o): return struct.unpack_from("<i", b, o)[0]

# mg0119::Scene::Params::createInstance @0x7100024c88 (operator_new 0xf0), plVar2 = long*
S = [(0x8,4,0x1e),(0xc,8,0x3f00000041880000),(0x14,8,0x402000003e800000),(0x1c,8,0x4040000040a00000),(0x2c,8,0x4120000041200000),
     (0x28,2,0),(0xe6,1,0),(0x24,4,0x3f800000),(0x4c,8,0x3f800000),(0xac,8,0x3c23d70a3f000000),(0xb4,8,0x3d4ccccd),(0x3c,8,0xffffffffffffffff),
     (0xbc,8,0x3f80000000000000),(0x34,4,0x42480000),(0x38,1,1),(0x48,1,1),(0x54,8,0x3f66666600000000),(0xc4,8,0x3f0000003fe66666),
     (0x5c,8,0x3f3333333dcccccd),(0xcc,8,0x3f00000000000000),(0x64,8,0x3d4ccccd3f000000),(0x6c,8,0x408000003d4ccccd),(0x74,8,0x40a00000),
     (0xd4,8,0x3d4ccccd3ba3d70a),(0x7c,8,0x3dcccccd3f800000),(0x44,4,0xffffffff),(0x84,8,0x3f0000003ee66666),(0xe4,2,0x100),
     (0x8c,8,0x3d4ccccd3ccccccd),(0xec,2,0),(0x94,8,0x40a0000000000000),(0x9c,8,0x3f99999a40800000),(0xa4,8,0x3f000000),(0xdc,8,0x3f000000),(0xe8,4,0x3f000000)]
b = run(0xf0, S)
mg0119 = {
 "TimeLimit(int)+0x08": i(b,0x8), "MaxAngleDeg+0x0C": f(b,0xc), "GyroRate+0x10": f(b,0x10), "MoveThreshold+0x14": f(b,0x14),
 "TestSum+0x18": f(b,0x18), "ImpulseForce+0x1C": f(b,0x1c), "GravityScale+0x20": f(b,0x20), "RotateCoef+0x24": f(b,0x24),
 "IsArbitraryTimingRespawnEnabled(u8)+0x28": b[0x28], "DampingGreen+0x2C": f(b,0x2c), "DampingFairway+0x30": f(b,0x30), "DampingBunker+0x34": f(b,0x34),
 "StageParams?(u8)+0x38": b[0x38], "StageRound1(enum)+0x3C": i(b,0x3c), "StageRound2+0x40": i(b,0x40), "StageRound3+0x44": i(b,0x44),
 "AiConfigGroup?(u8)+0x48": b[0x48],
 "AiRotateCoef+0xDC": f(b,0xdc), "ShowComTarget(u8)+0xE4": b[0xe4], "Debug(u8)+0xE5": b[0xe5], "UseStick(u8)+0xE6": b[0xe6],
 "StickCoef+0xE8": f(b,0xe8), "ShowCollisionModel(u8)+0xEC": b[0xec], "OpeningSkip(u8)+0xED": b[0xed],
}
# AiParam_t 4개(0x24 B씩) 위치 후보: GetAiParamEasy.. 판독 전이므로 0x4C 부터 0x24 간격으로 풀어 본다
ai = {}
for k, base in enumerate([0x4c, 0x70, 0x94, 0xb8]):
    ai[["Easy?","Normal?","Hard?","Master?"][k] + f"@0x{base:X}"] = {
        "PathSelectRatio[0..2]": [f(b, base), f(b, base+4), f(b, base+8)], "BallSpeed": f(b, base+0xc),
        "BallSpeedVariance": f(b, base+0x10), "MissRate": f(b, base+0x14), "Pid(P,I,D)": [f(b, base+0x18), f(b, base+0x1c), f(b, base+0x20)]}
# AiParam_t::createInstance @0x71000243f8 (0x24 B)
a = run(0x24, [(0,8,0x3f8000003f800000),(8,8,0x3f8000003f800000),(0x10,8,0x3dcccccd),(0x18,8,0x3c23d70a3f000000),(0x20,4,0x3d4ccccd)])
aidef = {"PathSelectRatio[0..2]": [f(a,0),f(a,4),f(a,8)], "BallSpeed": f(a,0xc), "BallSpeedVariance": f(a,0x10), "MissRate": f(a,0x14),
         "Pid(P,I,D)": [f(a,0x18), f(a,0x1c), f(a,0x20)]}
# mg1002::Scene::Params::createInstance @0x7100018170 (0x20 B)
m = run(0x20, [(8,8,0x4188000041700000),(0x10,8,0x404000003f000000),(0x18,8,(-0xbee00000) & (2**64-1))])
mg1002 = {"TimeLimit+0x08": f(m,8), "MaxAngleDeg+0x0C": f(m,0xc), "GyroRate+0x10": f(m,0x10), "GravityScale+0x14": f(m,0x14),
          "StageDamping+0x18": f(m,0x18), "StageVariation(int)+0x1C": i(m,0x1c)}
out = {"mg1002": mg1002, "mg0119": mg0119, "mg0119_AiParams_inScene": ai, "mg0119_AiParam_t_default": aidef}
Path("analysis/mgD_params.json").write_text(json.dumps(out, indent=1, ensure_ascii=False), encoding="utf-8")
print(json.dumps(out, indent=1, ensure_ascii=False))
