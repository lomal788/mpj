// camera_probe: FRES scene anim (.fsnb) camera/light/fog dump + container-shader model (env/dir_light/post) params.
//   scan <root dir> <out.json>          every .fsnb under root: cameras/lights/fogs summary (no per-frame data)
//   cam  <out.json> <x.fsnb>...         full dump: base, raw curves, per-frame baked tracks, three.js view
//   env  <out.json> <x.fmdb>...         material shader assign + params + render info of "container" models
// Curve evaluation follows nn::g3d AnimCurve (same layout BfresLibrary uses):
//   cubic  v = (k0 + k1 t + k2 t^2 + k3 t^3) * scale + offset, t = (f - f_i)/(f_{i+1} - f_i)
//   linear v = (k0 + k1 t) * scale + offset;  step/baked: k0 * scale + offset
// Camera (judged from main FUN_71006c1120 / FUN_71007758a4 / FUN_7100775b90, see web/docs/engine/07_camera_lighting.md):
//   flags & 0x400 Perspective -> SetProjectionPerspectiveFovy(fovy(rad, full vertical), aspect, near, far)
//   flags & 0x100 EulerZXY    -> rotation = Ry*Rx*Rz (three.js Euler order 'YXZ'); else Aim mode (rot = aim point, twist = roll)
using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;
using BfresLibrary;

static class P
{
    static JsonNode F(float v) => float.IsFinite(v) ? JsonValue.Create(v) : JsonValue.Create(v.ToString(CultureInfo.InvariantCulture));
    static JsonArray A(IEnumerable<float> v) => new JsonArray(v.Select(F).ToArray());

    static float Eval(AnimCurve c, float frame)
    {
        var fr = c.Frames;
        int n = fr.Length;
        if (n == 0) return 0;
        float s = c.Scale == 0 ? 1f : c.Scale;
        bool isInt = c.CurveType == AnimCurveType.StepInt || c.CurveType == AnimCurveType.BakedInt;
        float o = isInt ? (int)c.Offset : (float)c.Offset;
        int i = 0;
        if (frame > fr[0]) while (i + 1 < n && fr[i + 1] <= frame) i++;
        switch (c.CurveType)
        {
            case AnimCurveType.StepBool:
            case AnimCurveType.BakedBool:
                if (c.KeyStepBoolData != null && i < c.KeyStepBoolData.Length) return c.KeyStepBoolData[i] ? 1 : 0;
                return c.Keys[i, 0] != 0 ? 1 : 0;
            case AnimCurveType.StepInt:
            case AnimCurveType.BakedInt:
                return (int)c.Keys[i, 0] + (int)o;
            case AnimCurveType.BakedFloat:
                return c.Keys[i, 0] * s + o;
        }
        if (frame <= fr[0]) return c.Keys[0, 0] * s + o;
        if (i >= n - 1) return c.Keys[n - 1, 0] * s + o;
        float span = fr[i + 1] - fr[i];
        float t = span > 0 ? (frame - fr[i]) / span : 0;
        if (c.CurveType == AnimCurveType.Cubic)
            return (c.Keys[i, 0] + (c.Keys[i, 1] + (c.Keys[i, 2] + c.Keys[i, 3] * t) * t) * t) * s + o;
        return (c.Keys[i, 0] + c.Keys[i, 1] * t) * s + o;
    }

    static JsonObject Curve(AnimCurve c)
    {
        var keys = new JsonArray();
        for (int i = 0; i < c.Frames.Length; i++)
        {
            var k = new JsonArray();
            for (int j = 0; j < c.Keys.GetLength(1); j++) k.Add(F(c.Keys[i, j]));
            keys.Add(new JsonObject { ["frame"] = F(c.Frames[i]), ["k"] = k });
        }
        return new JsonObject
        {
            ["animDataOffset"] = "0x" + c.AnimDataOffset.ToString("X2"),
            ["type"] = c.CurveType.ToString(),
            ["frameType"] = c.FrameType.ToString(),
            ["keyType"] = c.KeyType.ToString(),
            ["preWrap"] = c.PreWrap.ToString(),
            ["postWrap"] = c.PostWrap.ToString(),
            ["start"] = F(c.StartFrame),
            ["end"] = F(c.EndFrame),
            ["scale"] = F(c.Scale),
            ["offset"] = F((float)c.Offset),
            ["delta"] = F(c.Delta),
            ["keys"] = keys,
        };
    }

    static readonly string[] CamField = { "near", "far", "aspect", "fovy", "posX", "posY", "posZ", "rotX", "rotY", "rotZ", "twist" };

    static float[][] CamTracks(CameraAnim c)
    {
        int n = Math.Max(c.FrameCount, 0);
        var b = c.BaseData;
        float[] baseV = { b.ClipNear, b.ClipFar, b.AspectRatio, b.FieldOfView, b.Position.X, b.Position.Y, b.Position.Z, b.Rotation.X, b.Rotation.Y, b.Rotation.Z, b.Twist };
        var tr = new float[baseV.Length][];
        for (int k = 0; k < baseV.Length; k++) { tr[k] = new float[n + 1]; Array.Fill(tr[k], baseV[k]); }
        foreach (var cv in c.Curves)
        {
            int k = (int)cv.AnimDataOffset / 4;
            if (k < 0 || k >= tr.Length) continue;
            for (int f = 0; f <= n; f++) tr[k][f] = Eval(cv, f);
        }
        return tr;
    }

    static JsonObject ThreeView(CameraAnim c, float[][] tr, int f)
    {
        bool euler = c.Flags.HasFlag(CameraAnimFlags.EulerZXY);
        var o = new JsonObject
        {
            ["position"] = A(new[] { tr[4][f], tr[5][f], tr[6][f] }),
            ["fovDeg"] = F((float)(tr[3][f] * 180.0 / Math.PI)),
            ["near"] = F(tr[0][f]),
            ["far"] = F(tr[1][f]),
        };
        if (euler) { o["eulerYXZ"] = A(new[] { tr[7][f], tr[8][f], tr[9][f] }); }
        else
        {
            o["target"] = A(new[] { tr[7][f], tr[8][f], tr[9][f] });
            o["rollRad"] = F(tr[10][f]);
            float dx = tr[4][f] - tr[7][f], dy = tr[5][f] - tr[8][f], dz = tr[6][f] - tr[9][f];
            o["distance"] = F(MathF.Sqrt(dx * dx + dy * dy + dz * dz));
            o["pitchDeg"] = F((float)(Math.Atan2(-dy, Math.Sqrt(dx * dx + dz * dz)) * 180.0 / Math.PI));
        }
        return o;
    }

    static JsonObject Cam(CameraAnim c, bool frames)
    {
        var b = c.BaseData;
        var tr = CamTracks(c);
        var o = new JsonObject
        {
            ["name"] = c.Name,
            ["frameCount"] = c.FrameCount,
            ["flags"] = "0x" + ((ushort)c.Flags).ToString("X4") + " " + c.Flags,
            ["loop"] = c.Flags.HasFlag(CameraAnimFlags.Looping),
            ["rotationMode"] = c.Flags.HasFlag(CameraAnimFlags.EulerZXY) ? "EulerZXY" : "Aim",
            ["projection"] = c.Flags.HasFlag(CameraAnimFlags.Perspective) ? "Perspective" : "Ortho",
            ["base"] = new JsonObject
            {
                ["near"] = F(b.ClipNear), ["far"] = F(b.ClipFar), ["aspect"] = F(b.AspectRatio), ["fovyRad"] = F(b.FieldOfView),
                ["pos"] = A(new[] { b.Position.X, b.Position.Y, b.Position.Z }),
                ["rotOrAim"] = A(new[] { b.Rotation.X, b.Rotation.Y, b.Rotation.Z }),
                ["twist"] = F(b.Twist),
            },
            ["animatedFields"] = new JsonArray(c.Curves.Select(x => (JsonNode)JsonValue.Create(((int)x.AnimDataOffset / 4) < CamField.Length ? CamField[(int)x.AnimDataOffset / 4] : "0x" + x.AnimDataOffset.ToString("X"))).ToArray()),
            ["userData"] = new JsonArray((c.UserData?.Keys ?? Enumerable.Empty<string>()).Select(k => (JsonNode)JsonValue.Create(k)).ToArray()),
            ["threeAtFrame0"] = ThreeView(c, tr, 0),
        };
        if (frames)
        {
            o["curves"] = new JsonArray(c.Curves.Select(x => (JsonNode)Curve(x)).ToArray());
            if (c.FrameCount > 0)
            {
                var baked = new JsonObject();
                for (int k = 0; k < CamField.Length; k++) baked[CamField[k]] = A(tr[k]);
                o["bakedPerFrame"] = baked;
            }
        }
        return o;
    }

    static JsonObject Light(LightAnim l, bool frames)
    {
        var b = l.BaseData;
        var o = new JsonObject
        {
            ["name"] = l.Name,
            ["frameCount"] = l.FrameCount,
            ["type"] = l.LightTypeName,
            ["distAttnFunc"] = l.DistanceAttnFuncName,
            ["angleAttnFunc"] = l.AngleAttnFuncName,
            ["flags"] = l.Flags.ToString(),
            ["fields"] = l.AnimatedFields.ToString(),
            ["base"] = new JsonObject
            {
                ["enable"] = b.Enable,
                ["pos"] = A(new[] { b.Position.X, b.Position.Y, b.Position.Z }),
                ["rot"] = A(new[] { b.Rotation.X, b.Rotation.Y, b.Rotation.Z }),
                ["distAttn"] = A(new[] { b.DistanceAttn.X, b.DistanceAttn.Y }),
                ["angleAttn"] = A(new[] { b.AngleAttn.X, b.AngleAttn.Y }),
                ["color0"] = A(new[] { b.Color0.X, b.Color0.Y, b.Color0.Z }),
                ["color1"] = A(new[] { b.Color1.X, b.Color1.Y, b.Color1.Z }),
            },
            ["curveCount"] = l.Curves.Count,
        };
        if (frames) o["curves"] = new JsonArray(l.Curves.Select(x => (JsonNode)Curve(x)).ToArray());
        return o;
    }

    static JsonObject Fog(FogAnim f, bool frames)
    {
        var b = f.BaseData;
        var o = new JsonObject
        {
            ["name"] = f.Name,
            ["frameCount"] = f.FrameCount,
            ["distAttnFunc"] = f.DistanceAttnFuncName,
            ["base"] = new JsonObject { ["distAttn"] = A(new[] { b.DistanceAttn.X, b.DistanceAttn.Y }), ["color"] = A(new[] { b.Color.X, b.Color.Y, b.Color.Z }) },
            ["curveCount"] = f.Curves.Count,
        };
        if (frames) o["curves"] = new JsonArray(f.Curves.Select(x => (JsonNode)Curve(x)).ToArray());
        return o;
    }

    static JsonObject Scene(string path, string rel, bool frames)
    {
        var res = new ResFile(path);
        var scenes = new JsonArray();
        foreach (var s in res.SceneAnims.Values)
            scenes.Add(new JsonObject
            {
                ["name"] = s.Name,
                ["cameras"] = new JsonArray(s.CameraAnims.Values.Select(c => (JsonNode)Cam(c, frames)).ToArray()),
                ["lights"] = new JsonArray(s.LightAnims.Values.Select(l => (JsonNode)Light(l, frames)).ToArray()),
                ["fogs"] = new JsonArray(s.FogAnims.Values.Select(f => (JsonNode)Fog(f, frames)).ToArray()),
            });
        return new JsonObject { ["file"] = rel, ["scenes"] = scenes };
    }

    static JsonNode ParamValue(ShaderParam p)
    {
        try
        {
            object v = p.DataValue;
            return v switch
            {
                float f => F(f),
                int i => JsonValue.Create(i),
                uint u => JsonValue.Create(u),
                bool bo => JsonValue.Create(bo),
                float[] fa => A(fa),
                int[] ia => new JsonArray(ia.Select(x => (JsonNode)JsonValue.Create(x)).ToArray()),
                uint[] ua => new JsonArray(ua.Select(x => (JsonNode)JsonValue.Create(x)).ToArray()),
                bool[] ba => new JsonArray(ba.Select(x => (JsonNode)JsonValue.Create(x)).ToArray()),
                _ => JsonValue.Create(v?.ToString()),
            };
        }
        catch (Exception e) { return JsonValue.Create("ERR " + e.Message); }
    }

    static JsonObject Env(string path)
    {
        var res = new ResFile(path);
        var models = new JsonArray();
        foreach (var m in res.Models.Values)
        {
            var bones = new JsonArray(m.Skeleton.Bones.Values.Select(b => (JsonNode)new JsonObject
            {
                ["name"] = b.Name,
                ["S"] = A(new[] { b.Scale.X, b.Scale.Y, b.Scale.Z }),
                ["R"] = A(new[] { b.Rotation.X, b.Rotation.Y, b.Rotation.Z, b.Rotation.W }),
                ["T"] = A(new[] { b.Position.X, b.Position.Y, b.Position.Z }),
            }).ToArray());
            var mats = new JsonArray();
            foreach (var mat in m.Materials.Values)
            {
                var prm = new JsonObject();
                foreach (var kv in mat.ShaderParams) prm[kv.Key] = ParamValue(kv.Value);
                var ri = new JsonObject();
                foreach (var kv in mat.RenderInfos)
                {
                    var r = kv.Value;
                    ri[kv.Key] = r.Type switch
                    {
                        RenderInfoType.Int32 => new JsonArray(r.GetValueInt32s().Select(x => (JsonNode)JsonValue.Create(x)).ToArray()),
                        RenderInfoType.Single => A(r.GetValueSingles()),
                        _ => new JsonArray(r.GetValueStrings().Select(x => (JsonNode)JsonValue.Create(x)).ToArray()),
                    };
                }
                var sa = mat.ShaderAssign;
                mats.Add(new JsonObject
                {
                    ["name"] = mat.Name,
                    ["shaderArchive"] = sa?.ShaderArchiveName,
                    ["shadingModel"] = sa?.ShadingModelName,
                    ["options"] = new JsonObject(sa?.ShaderOptions?.Keys.Select(k => new KeyValuePair<string, JsonNode>(k, JsonValue.Create(sa.ShaderOptions[k].ToString()))) ?? Enumerable.Empty<KeyValuePair<string, JsonNode>>()),
                    ["samplerAssign"] = new JsonObject(sa?.SamplerAssigns?.Keys.Select(k => new KeyValuePair<string, JsonNode>(k, JsonValue.Create(sa.SamplerAssigns[k].ToString()))) ?? Enumerable.Empty<KeyValuePair<string, JsonNode>>()),
                    ["textures"] = new JsonArray((mat.TextureRefs ?? new List<TextureRef>()).Select(t => (JsonNode)JsonValue.Create(t.Name)).ToArray()),
                    ["samplers"] = new JsonArray(mat.Samplers.Keys.Select(k => (JsonNode)JsonValue.Create(k)).ToArray()),
                    ["renderInfo"] = ri,
                    ["params"] = prm,
                });
            }
            var verts = new JsonArray();
            foreach (var vb in m.VertexBuffers)
            {
                if (vb.VertexCount > 64) continue;
                var h = new BfresLibrary.Helpers.VertexBufferHelper(vb, res.ByteOrder);
                if (!h.Contains("_p0")) continue;
                verts.Add(new JsonArray(h["_p0"].Data.Select(v => (JsonNode)A(new[] { v.X, v.Y, v.Z })).ToArray()));
            }
            var idx = new JsonArray();
            foreach (var sh in m.Shapes.Values)
            {
                var mesh = sh.Meshes[0];
                if (mesh.IndexCount > 192) continue;
                idx.Add(new JsonArray(mesh.GetIndices().Select(i => (JsonNode)JsonValue.Create((int)i)).ToArray()));
            }
            models.Add(new JsonObject { ["name"] = m.Name, ["bones"] = bones, ["materials"] = mats, ["smallVertexPositions"] = verts, ["smallIndices"] = idx });
        }
        return new JsonObject { ["file"] = Path.GetFileName(path), ["models"] = models };
    }

    static void Write(string outPath, JsonNode n)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(outPath)));
        File.WriteAllText(outPath, n.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
    }

    static int Main(string[] args)
    {
        CultureInfo.DefaultThreadCurrentCulture = CultureInfo.InvariantCulture;
        if (args.Length < 3) { Console.Error.WriteLine("usage: scan <root> <out.json> | cam <out.json> <fsnb>... | env <out.json> <fmdb>..."); return 1; }
        switch (args[0])
        {
            case "scan":
                {
                    var root = Path.GetFullPath(args[1]);
                    var files = Directory.EnumerateFiles(root, "*.fsnb", SearchOption.AllDirectories).OrderBy(x => x, StringComparer.Ordinal).ToList();
                    var arr = new JsonArray();
                    int fail = 0, cams = 0, lights = 0, fogs = 0;
                    foreach (var f in files)
                    {
                        var rel = Path.GetRelativePath(root, f).Replace('\\', '/');
                        try
                        {
                            var o = Scene(f, rel, false);
                            foreach (var s in o["scenes"].AsArray()) { cams += s["cameras"].AsArray().Count; lights += s["lights"].AsArray().Count; fogs += s["fogs"].AsArray().Count; }
                            arr.Add(o);
                        }
                        catch (Exception e) { fail++; arr.Add(new JsonObject { ["file"] = rel, ["error"] = e.GetType().Name + ": " + e.Message }); }
                    }
                    Write(args[2], new JsonObject { ["root"] = root.Replace('\\', '/'), ["files"] = files.Count, ["failed"] = fail, ["cameras"] = cams, ["lights"] = lights, ["fogs"] = fogs, ["items"] = arr });
                    Console.WriteLine($"scan: {files.Count} fsnb, failed {fail}, cameras {cams}, lights {lights}, fogs {fogs} -> {args[2]}");
                    return 0;
                }
            case "cam":
                {
                    var arr = new JsonArray(args.Skip(2).Select(f => (JsonNode)Scene(f, Path.GetFileName(f), true)).ToArray());
                    Write(args[1], arr);
                    Console.WriteLine($"cam: {args.Length - 2} files -> {args[1]}");
                    return 0;
                }
            case "env":
                {
                    var arr = new JsonArray(args.Skip(2).Select(f => (JsonNode)Env(f)).ToArray());
                    Write(args[1], arr);
                    Console.WriteLine($"env: {args.Length - 2} files -> {args[1]}");
                    return 0;
                }
        }
        return 1;
    }
}
