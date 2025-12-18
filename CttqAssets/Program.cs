using System.Text.Json;
using System.Text.Json.Nodes;

var builder = WebApplication.CreateBuilder(args);

// 开发环境下允许任意来源
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAny", policy =>
    {
        policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod();
    });
});

var app = builder.Build();

app.UseCors("AllowAny");

// 启用静态文件（wwwroot）
app.UseDefaultFiles();
app.UseStaticFiles();

// 将数据文件放在用户本地 AppData 下，避免权限问题
string appDataDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "CttqAssets");
Directory.CreateDirectory(appDataDir); // 确保目录存在
const string DefaultFileName = "assets.json";
string DataFile = Path.Combine(appDataDir, DefaultFileName);

object fileLock = new();

JsonObject GetSampleData()
{
    var sample = new JsonObject
    {
        ["groups"] = new JsonArray
        {
            new JsonObject
            {
                ["id"] = "nsclc-negative",
                ["title"] = "NSCLC",
                ["subtitle"] = "Driver Gene Negative",
                ["est"] = "44%, 470K",
                ["type"] = "singleRow",
                ["columns"] = new JsonObject
                {
                    ["neo"] = new JsonArray { new JsonObject { ["name"] = "示例 Neo", ["phase"] = "3", ["modality"] = "bio", ["desc"] = "示例数据" } },
                    ["first"] = new JsonArray { new JsonObject { ["name"] = "示例 First", ["phase"] = "appr", ["modality"] = "bio" } },
                    ["second"] = new JsonArray(),
                    ["third"] = new JsonArray()
                }
            }
        }
    };

    return sample;
}

// 从磁盘读取（若失败返回示例并记录原因）
JsonObject ReadData()
{
    lock (fileLock)
    {
        try
        {
            if (!File.Exists(DataFile))
            {
                var sample = GetSampleData();
                // 尝试写入，若写入失败则也返回 sample，但不崩溃
                try
                {
                    File.WriteAllText(DataFile, sample.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
                }
                catch (Exception wex)
                {
                    Console.Error.WriteLine($"Warning: cannot create data file '{DataFile}': {wex.Message}");
                }
                return sample;
            }

            var txt = File.ReadAllText(DataFile);
            var node = JsonNode.Parse(txt) as JsonObject;
            if (node == null) return GetSampleData();
            return node;
        }
        catch (IOException ioex)
        {
            Console.Error.WriteLine($"IO error reading '{DataFile}': {ioex.Message}");
            return GetSampleData();
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"Unexpected error reading '{DataFile}': {ex.Message}");
            return GetSampleData();
        }
    }
}

// GET /api/assets
app.MapGet("/api/assets", () =>
{
    var data = ReadData();
    return Results.Json(data);
});

app.MapPost("/api/assets", async (HttpRequest req) =>
{
    try
    {
        // 读取请求体为字符串
        using var sr = new StreamReader(req.Body);
        var bodyText = await sr.ReadToEndAsync();
        if (string.IsNullOrWhiteSpace(bodyText))
            return Results.BadRequest(new { error = "Empty request body" });

        JsonNode? parsed;
        try
        {
            parsed = JsonNode.Parse(bodyText);
        }
        catch (Exception ex)
        {
            return Results.BadRequest(new { error = "Invalid JSON: " + ex.Message });
        }

        if (!(parsed is JsonObject obj) || !obj.TryGetPropertyValue("groups", out var groupsNode) || groupsNode is not JsonArray)
            return Results.BadRequest(new { error = "Payload must contain a top-level 'groups' array" });

        // 写入磁盘，捕获 IOException 并返回 500
        try
        {
            lock (fileLock)
            {
                File.WriteAllText(DataFile, obj.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
            }
            return Results.Ok(new { ok = true });
        }
        catch (IOException ioex)
        {
            // 记录到控制台供调试
            Console.Error.WriteLine($"IO exception when writing '{DataFile}': {ioex.Message}");
            // 使用 Results.Json 并传入 statusCode 参数（StatusCode 没有接受 body 的重载）
            return Results.Json(new { error = "Storage IO error: " + ioex.Message }, statusCode: 500);
        }
        catch (UnauthorizedAccessException uex)
        {
            Console.Error.WriteLine($"Access denied writing '{DataFile}': {uex.Message}");
            return Results.Json(new { error = "Access denied writing data file." }, statusCode: 500);
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"Unexpected error writing '{DataFile}': {ex.Message}");
            return Results.Json(new { error = "Unexpected server error." }, statusCode: 500);
        }
    }
    catch (Exception ex)
    {
        Console.Error.WriteLine($"Unhandled error in POST handler: {ex.Message}");
        return Results.Problem(detail: ex.Message, statusCode: 500);
    }
});

app.MapGet("/health", () => Results.Ok(new { status = "ok", dataFile = DataFile }));

app.Run();