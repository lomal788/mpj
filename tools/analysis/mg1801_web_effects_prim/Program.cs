// mg1801 이펙트 프리미티브 BFRES 의 모든 모델 정점을 JSON 으로 낸다(tools/mg1801_web_effects.py 가 glb 로 묶는다).
// graphics_bfres2gltf 의 gltf 명령은 첫 모델만 내므로 따로 둔다. 값은 BfresLibrary VertexBufferHelper 가 푼 그대로다.
//   dotnet run -c Release -- <primitives.bfres> <out.json>
using System.Text.Json;
using BfresLibrary;
using BfresLibrary.Helpers;

var res = new ResFile(args[0]);
var models = new List<object>();
foreach (var m in res.Models.Values)
{
    var shapes = new List<object>();
    foreach (var s in m.Shapes.Values)
    {
        var vb = m.VertexBuffers[s.VertexBufferIndex];
        var h = new VertexBufferHelper(vb, res.ByteOrder);
        var attrs = new Dictionary<string, object>();
        foreach (var a in h.Attributes)
            attrs[a.Name] = new { format = a.Format.ToString(), data = a.Data.Select(v => new[] { v.X, v.Y, v.Z, v.W }).ToArray() };
        var lod = s.Meshes[0];
        var idx = lod.GetIndices().Select(x => (long)x + lod.FirstVertex).ToArray();
        shapes.Add(new { name = s.Name, material = m.Materials[s.MaterialIndex].Name, vertexCount = vb.VertexCount, primitive = lod.PrimitiveType.ToString(), indices = idx, attributes = attrs });
    }
    models.Add(new { name = m.Name, shapes });
}
File.WriteAllText(args[1], JsonSerializer.Serialize(new { source = Path.GetFileName(args[0]), models }, new JsonSerializerOptions { WriteIndented = false }));
Console.WriteLine($"{args[0]}: {models.Count} models -> {args[1]}");
