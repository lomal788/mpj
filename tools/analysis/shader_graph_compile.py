"""노드 시험의 GLSL 컴파일·링크 전용 WGL 컨텍스트. 창 표시·그리기·화면 판독은 하지 않는다."""
import ctypes as c
import json
import sys
from ctypes import wintypes as w

sys.stdout.reconfigure(encoding="utf-8")
u = c.WinDLL("user32", use_last_error=True)
g = c.WinDLL("gdi32", use_last_error=True)
gl = c.WinDLL("opengl32", use_last_error=True)

class PFD(c.Structure):
    _fields_ = [("size", w.WORD), ("version", w.WORD), ("flags", w.DWORD), ("pixelType", w.BYTE), ("colorBits", w.BYTE),
                ("redBits", w.BYTE), ("redShift", w.BYTE), ("greenBits", w.BYTE), ("greenShift", w.BYTE),
                ("blueBits", w.BYTE), ("blueShift", w.BYTE), ("alphaBits", w.BYTE), ("alphaShift", w.BYTE),
                ("accumBits", w.BYTE), ("accumRedBits", w.BYTE), ("accumGreenBits", w.BYTE), ("accumBlueBits", w.BYTE),
                ("accumAlphaBits", w.BYTE), ("depthBits", w.BYTE), ("stencilBits", w.BYTE), ("auxBuffers", w.BYTE),
                ("layerType", w.BYTE), ("reserved", w.BYTE), ("layerMask", w.DWORD), ("visibleMask", w.DWORD), ("damageMask", w.DWORD)]

u.CreateWindowExW.argtypes = [w.DWORD, w.LPCWSTR, w.LPCWSTR, w.DWORD, c.c_int, c.c_int, c.c_int, c.c_int, w.HWND, w.HMENU, w.HINSTANCE, c.c_void_p]
u.CreateWindowExW.restype = w.HWND
u.GetDC.argtypes = [w.HWND]
u.GetDC.restype = w.HDC
u.ReleaseDC.argtypes = [w.HWND, w.HDC]
u.DestroyWindow.argtypes = [w.HWND]
g.ChoosePixelFormat.argtypes = [w.HDC, c.POINTER(PFD)]
g.SetPixelFormat.argtypes = [w.HDC, c.c_int, c.POINTER(PFD)]
gl.wglCreateContext.argtypes = [w.HDC]
gl.wglCreateContext.restype = c.c_void_p
gl.wglMakeCurrent.argtypes = [w.HDC, c.c_void_p]
gl.wglDeleteContext.argtypes = [c.c_void_p]
gl.wglGetProcAddress.argtypes = [c.c_char_p]
gl.wglGetProcAddress.restype = c.c_void_p
gl.glGetString.argtypes = [c.c_uint]
gl.glGetString.restype = c.c_char_p
hwnd = u.CreateWindowExW(0, "STATIC", "GLSL code compiler", 0, 0, 0, 1, 1, None, None, None, None)
if not hwnd:
    raise RuntimeError(f"GLSL 컴파일용 숨은 컨텍스트 생성 실패 {c.get_last_error()}")
dc = u.GetDC(hwnd)
ctx = None
try:
    pfd = PFD()
    pfd.size, pfd.version, pfd.flags, pfd.colorBits, pfd.depthBits = c.sizeof(PFD), 1, 0x24, 24, 24
    pix = g.ChoosePixelFormat(dc, c.byref(pfd))
    if not pix or not g.SetPixelFormat(dc, pix, c.byref(pfd)):
        raise RuntimeError("GLSL 컴파일용 PixelFormat 실패")
    ctx = gl.wglCreateContext(dc)
    if not ctx or not gl.wglMakeCurrent(dc, ctx):
        raise RuntimeError("WGL 컴파일 컨텍스트 바인딩 실패")
    def fn(name, result, *args):
        ptr = gl.wglGetProcAddress(name.encode())
        if not ptr or ptr in [1, 2, 3, -1]:
            raise RuntimeError(f"GLSL 함수 없음 {name}")
        return c.WINFUNCTYPE(result, *args)(ptr)
    create_shader = fn("glCreateShader", c.c_uint, c.c_uint)
    shader_source = fn("glShaderSource", None, c.c_uint, c.c_int, c.POINTER(c.c_char_p), c.POINTER(c.c_int))
    compile_shader = fn("glCompileShader", None, c.c_uint)
    shader_iv = fn("glGetShaderiv", None, c.c_uint, c.c_uint, c.POINTER(c.c_int))
    shader_log = fn("glGetShaderInfoLog", None, c.c_uint, c.c_int, c.POINTER(c.c_int), c.c_char_p)
    delete_shader = fn("glDeleteShader", None, c.c_uint)
    create_program = fn("glCreateProgram", c.c_uint)
    attach = fn("glAttachShader", None, c.c_uint, c.c_uint)
    link = fn("glLinkProgram", None, c.c_uint)
    program_iv = fn("glGetProgramiv", None, c.c_uint, c.c_uint, c.POINTER(c.c_int))
    program_log = fn("glGetProgramInfoLog", None, c.c_uint, c.c_int, c.POINTER(c.c_int), c.c_char_p)
    delete_program = fn("glDeleteProgram", None, c.c_uint)
    def log(handle, get_iv, get_log):
        length = c.c_int()
        get_iv(handle, 0x8B84, c.byref(length))
        buf = c.create_string_buffer(max(length.value, 1))
        get_log(handle, len(buf), None, buf)
        return buf.value.decode("utf-8", "replace")
    results = []
    for job in json.load(sys.stdin):
        shaders = []
        program = None
        errors = []
        try:
            for stage, kind in [("vs", 0x8B31), ("fs", 0x8B30)]:
                shader = create_shader(kind)
                shaders.append(shader)
                source = c.c_char_p(job[stage].encode("utf-8"))
                shader_source(shader, 1, c.byref(source), None)
                compile_shader(shader)
                passed = c.c_int()
                shader_iv(shader, 0x8B81, c.byref(passed))
                if not passed.value:
                    errors.append(stage + ": " + log(shader, shader_iv, shader_log))
            if not errors:
                program = create_program()
                for shader in shaders:
                    attach(program, shader)
                link(program)
                passed = c.c_int()
                program_iv(program, 0x8B82, c.byref(passed))
                if not passed.value:
                    errors.append("link: " + log(program, program_iv, program_log))
            results.append({"name": job["name"], "ok": not errors, "errors": errors})
        finally:
            if program:
                delete_program(program)
            for shader in shaders:
                delete_shader(shader)
    print(json.dumps({"renderer": gl.glGetString(0x1F01).decode(), "version": gl.glGetString(0x1F02).decode(), "results": results}, ensure_ascii=False))
finally:
    gl.wglMakeCurrent(None, None)
    if ctx:
        gl.wglDeleteContext(ctx)
    u.ReleaseDC(hwnd, dc)
    u.DestroyWindow(hwnd)
