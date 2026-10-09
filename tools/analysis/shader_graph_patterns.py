"""SASS 판독 공통 노드식. 무조명 홀로그램·탐조등은 14_shader_graphs.md §10 근거를 따른다."""
SPOTLIGHT = "vec3 sgSpotlight(vec3 a, vec3 b, vec3 c, vec3 d, vec2 p, float phase) { vec3 q = b * ((a + c) * p.x); return mix(q, d, p.y) + phase * mix(a.x, b.x, p.x) * c; }"


def hologram():
    return {
        "samplers": {},
        "baseColor": "c0.rgb * ((c0.rgb * material_base_color + material_emissive_color_scale * material_emissive_color) * P0.y)",
        "alpha": "pow(clamp(dot(normalize(NgW), viewDir), 0.0, 1.0), P0.x) * modelOpacity",
        "emissive": "vec3(0.0)",
    }


def spotlight():
    return {
        "samplers": {"sg_utility_texture2d0": "원본 재질 바인딩", "sg_utility_texture2d1": "원본 재질 바인딩"},
        "fsHelpers": [SPOTLIGHT],
        "fsPrelude": 'vec3 sgA = T("sg_utility_texture2d0", uv0).rgb; vec3 sgB = T("sg_utility_texture2d1", uv1).rgb; float sgPhase = sin(float(mpjWorldFrame % 360u) * 0.008726646192371845) * 0.5 + 0.5;',
        "baseColor": "sgSpotlight(sgA, sgB, C0.rgb, C1.rgb, P0.xy, sgPhase)",
        "alpha": "modelOpacity",
        "emissive": "vec3(0.0)",
        "approx": "[판독] World+4 u32 누적 프레임; [근사] Stage60fps 프레임·원본 gate/epoch 대응",
    }
