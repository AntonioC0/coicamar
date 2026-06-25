using System.Text.Json;
using System.Text.Json.Nodes;

namespace COICamar.App.Services;

public sealed class ProcerApiService(
    IHttpClientFactory httpClientFactory,
    IWebHostEnvironment environment,
    ILocalDatabase database,
    ILogger<ProcerApiService> logger)
{
    private const int MaxRequestsPerHour = 10;
    private static readonly TimeSpan AutoCacheAge = TimeSpan.FromMinutes(15);
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true,
        PropertyNameCaseInsensitive = true
    };

    private readonly string rateStatePath = Path.Combine(environment.ContentRootPath, "Data", "api-rate-state.json");
    private readonly string apiHistoryPath = Path.Combine(environment.ContentRootPath, "Data", "api-history.jsonl");
    private readonly SemaphoreSlim gate = new(1, 1);

    public async Task<JsonObject> GetProcerArmazenagemAsync(bool force, CancellationToken cancellationToken = default)
    {
        await gate.WaitAsync(cancellationToken);
        try
        {
            var state = await LoadRateStateAsync(cancellationToken);
            var bucket = state.Ensure("armazenagem");
            bucket.RequestTimes = RecentRequestTimes(bucket.RequestTimes);

            if (bucket.Cache is not null && !force && CacheAge(bucket.Cache) < AutoCacheAge)
            {
                await SaveRateStateAsync(state, cancellationToken);
                return SetCacheFlags(CloneObject(bucket.Cache), cached: true, rateLimited: false, throttled: false);
            }

            if (bucket.RequestTimes.Count >= MaxRequestsPerHour)
            {
                if (bucket.Cache is not null)
                {
                    await SaveRateStateAsync(state, cancellationToken);
                    return SetCacheFlags(CloneObject(bucket.Cache), cached: true, rateLimited: true, throttled: false);
                }

                throw new InvalidOperationException($"Limite de {MaxRequestsPerHour} requisições por hora atingido para armazenagem.");
            }

            RegisterAttempt(bucket);

            try
            {
                var client = httpClientFactory.CreateClient("procer");
                using var response = await client.GetAsync("armazenagem?api_key=CLI78853192055FCFB3FAAB6D75", cancellationToken);
                response.EnsureSuccessStatusCode();

                var payload = await response.Content.ReadFromJsonAsync<JsonObject>(JsonOptions, cancellationToken);
                var items = SelectAtalaiaItems(payload?["dados"] as JsonArray);
                var now = DateTimeOffset.UtcNow.ToString("O");
                var cache = new JsonObject
                {
                    ["requestDate"] = now,
                    ["cached"] = false,
                    ["rateLimited"] = false,
                    ["throttled"] = false,
                    ["dados"] = new JsonArray(items.Select(CloneNode).ToArray())
                };

                bucket.Cache = CloneObject(cache);
                bucket.LastSuccessAt = now;
                bucket.LastError = null;
                await SaveRateStateAsync(state, cancellationToken);
                return cache;
            }
            catch (Exception ex)
            {
                bucket.LastError = ex.Message;
                await SaveRateStateAsync(state, cancellationToken);

                if (bucket.Cache is not null)
                {
                    return SetCacheFlags(CloneObject(bucket.Cache), cached: true, rateLimited: true, throttled: false);
                }

                throw;
            }
        }
        finally
        {
            gate.Release();
        }
    }

    public async Task<JsonObject> GetProcerClimaAsync(bool force, CancellationToken cancellationToken = default)
    {
        await gate.WaitAsync(cancellationToken);
        try
        {
            var state = await LoadRateStateAsync(cancellationToken);
            var bucket = state.Ensure("clima");
            bucket.RequestTimes = RecentRequestTimes(bucket.RequestTimes);

            if (bucket.Cache is not null && !force && CacheAge(bucket.Cache) < AutoCacheAge)
            {
                await SaveRateStateAsync(state, cancellationToken);
                return SetCacheFlags(CloneObject(bucket.Cache), cached: true, rateLimited: false, throttled: false);
            }

            if (bucket.RequestTimes.Count >= MaxRequestsPerHour)
            {
                if (bucket.Cache is not null)
                {
                    await SaveRateStateAsync(state, cancellationToken);
                    return SetCacheFlags(CloneObject(bucket.Cache), cached: true, rateLimited: true, throttled: false);
                }

                throw new InvalidOperationException($"Limite de {MaxRequestsPerHour} requisições por hora atingido para clima.");
            }

            RegisterAttempt(bucket);

            try
            {
                var client = httpClientFactory.CreateClient("procer");
                using var response = await client.GetAsync("clima?api_key=CLI78853192055FCFB3FAAB6D75", cancellationToken);
                response.EnsureSuccessStatusCode();

                var payload = await response.Content.ReadFromJsonAsync<JsonObject>(JsonOptions, cancellationToken);
                var item = SelectAtalaiaItems(payload?["dados"] as JsonArray).FirstOrDefault();
                var now = DateTimeOffset.UtcNow.ToString("O");
                var cache = new JsonObject
                {
                    ["requestDate"] = now,
                    ["cached"] = false,
                    ["rateLimited"] = false,
                    ["throttled"] = false,
                    ["dado"] = CloneNode(item)
                };

                bucket.Cache = CloneObject(cache);
                bucket.LastSuccessAt = now;
                bucket.LastError = null;
                await SaveRateStateAsync(state, cancellationToken);
                return cache;
            }
            catch (Exception ex)
            {
                bucket.LastError = ex.Message;
                await SaveRateStateAsync(state, cancellationToken);

                if (bucket.Cache is not null)
                {
                    return SetCacheFlags(CloneObject(bucket.Cache), cached: true, rateLimited: true, throttled: false);
                }

                var localState = await database.LoadAsync(cancellationToken);
                if (localState.WeatherData.Temperature.HasValue)
                {
                    return new JsonObject
                    {
                        ["requestDate"] = DateTimeOffset.UtcNow.ToString("O"),
                        ["cached"] = true,
                        ["rateLimited"] = true,
                        ["throttled"] = false,
                        ["dado"] = new JsonObject
                        {
                            ["filial"] = "Cocamar: Atalaia - PR",
                            ["cidade"] = "Atalaia",
                            ["UF"] = "PR",
                            ["temperatura"] = localState.WeatherData.Temperature.Value,
                            ["data_comunicacao"] = localState.WeatherData.CommunicationDate
                        }
                    };
                }

                throw;
            }
        }
        finally
        {
            gate.Release();
        }
    }

    public async Task<JsonObject> GetProcerOperacionalAsync(bool force, CancellationToken cancellationToken = default)
    {
        JsonObject? armazenagem = null;
        JsonObject? clima = null;
        var errors = new JsonArray();

        try
        {
            armazenagem = await GetProcerArmazenagemAsync(force, cancellationToken);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Falha ao consultar Procer armazenagem");
            errors.Add($"Armazenagem: {ex.Message}");
        }

        try
        {
            clima = await GetProcerClimaAsync(force, cancellationToken);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Falha ao consultar Procer clima");
            errors.Add($"Clima: {ex.Message}");
        }

        if (armazenagem is null && clima is null)
        {
            throw new InvalidOperationException(string.Join(" | ", errors.Select(item => item?.GetValue<string>())));
        }

        var historySaved = await SaveOperationalApiHistoryAsync(armazenagem, clima, cancellationToken);

        return new JsonObject
        {
            ["requestDate"] = DateTimeOffset.UtcNow.ToString("O"),
            ["armazenagem"] = CloneNode(armazenagem),
            ["clima"] = CloneNode(clima),
            ["rateLimited"] = BoolFlag(armazenagem, "rateLimited") || BoolFlag(clima, "rateLimited"),
            ["cached"] = BoolFlag(armazenagem, "cached") || BoolFlag(clima, "cached"),
            ["throttled"] = BoolFlag(armazenagem, "throttled") || BoolFlag(clima, "throttled"),
            ["freshArmazenagem"] = armazenagem is not null && !BoolFlag(armazenagem, "cached"),
            ["freshClima"] = clima is not null && !BoolFlag(clima, "cached"),
            ["historySaved"] = historySaved,
            ["errors"] = errors
        };
    }

    private async Task<bool> SaveOperationalApiHistoryAsync(JsonObject? armazenagem, JsonObject? clima, CancellationToken cancellationToken)
    {
        var freshArmazenagem = armazenagem is not null && !BoolFlag(armazenagem, "cached");
        var freshClima = clima is not null && !BoolFlag(clima, "cached");
        if (!freshArmazenagem && !freshClima)
        {
            return false;
        }

        Directory.CreateDirectory(Path.GetDirectoryName(apiHistoryPath)!);
        var record = new JsonObject
        {
            ["id"] = Guid.NewGuid().ToString("N"),
            ["unit"] = "atalaia",
            ["savedAt"] = DateTimeOffset.UtcNow.ToString("O"),
            ["freshArmazenagem"] = freshArmazenagem,
            ["freshClima"] = freshClima,
            ["armazenagem"] = CloneNode(armazenagem),
            ["clima"] = CloneNode(clima)
        };

        await File.AppendAllTextAsync(apiHistoryPath, record.ToJsonString(JsonOptions) + Environment.NewLine, cancellationToken);
        return true;
    }

    private async Task<ApiRateState> LoadRateStateAsync(CancellationToken cancellationToken)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(rateStatePath)!);
        if (!File.Exists(rateStatePath))
        {
            return new ApiRateState();
        }

        await using var stream = File.OpenRead(rateStatePath);
        return await JsonSerializer.DeserializeAsync<ApiRateState>(stream, JsonOptions, cancellationToken) ?? new ApiRateState();
    }

    private async Task SaveRateStateAsync(ApiRateState state, CancellationToken cancellationToken)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(rateStatePath)!);
        var temporaryPath = $"{rateStatePath}.tmp";
        await using (var stream = File.Create(temporaryPath))
        {
            await JsonSerializer.SerializeAsync(stream, state, JsonOptions, cancellationToken);
        }

        File.Move(temporaryPath, rateStatePath, true);
    }

    private static void RegisterAttempt(ApiRateBucket bucket)
    {
        var now = DateTimeOffset.UtcNow.ToString("O");
        bucket.RequestTimes.Add(now);
        bucket.LastAttemptAt = now;
    }

    private static List<string> RecentRequestTimes(IEnumerable<string> times)
    {
        var cutoff = DateTimeOffset.UtcNow.AddHours(-1);
        return times
            .Select(value => DateTimeOffset.TryParse(value, out var date) ? date : (DateTimeOffset?)null)
            .Where(date => date.HasValue && date > cutoff)
            .Select(date => date!.Value.ToString("O"))
            .ToList();
    }

    private static TimeSpan CacheAge(JsonObject cache)
    {
        return DateTimeOffset.TryParse(cache["requestDate"]?.GetValue<string>(), out var date)
            ? DateTimeOffset.UtcNow - date
            : TimeSpan.MaxValue;
    }

    private static JsonObject SetCacheFlags(JsonObject cache, bool cached, bool rateLimited, bool throttled)
    {
        cache["cached"] = cached;
        cache["rateLimited"] = rateLimited;
        cache["throttled"] = throttled;
        return cache;
    }

    private static List<JsonNode?> SelectAtalaiaItems(JsonArray? items)
    {
        if (items is null)
        {
            return [];
        }

        return items
            .Where(item =>
            {
                var city = Text(item, "cidade");
                var name = Text(item, "nome");
                var branch = Text(item, "filial");
                return city.Equals("atalaia", StringComparison.OrdinalIgnoreCase)
                    || name.Contains("atalaia", StringComparison.OrdinalIgnoreCase)
                    || branch.Contains("atalaia", StringComparison.OrdinalIgnoreCase);
            })
            .Select(CloneNode)
            .ToList();
    }

    private static string Text(JsonNode? node, string property) =>
        node?[property]?.GetValue<string>() ?? "";

    private static bool BoolFlag(JsonObject? node, string property) =>
        node?[property]?.GetValue<bool>() == true;

    private static JsonNode? CloneNode(JsonNode? node) =>
        node is null ? null : JsonNode.Parse(node.ToJsonString());

    private static JsonObject CloneObject(JsonObject node) =>
        (JsonObject)CloneNode(node)!;
}

public sealed class ApiRateState
{
    public ApiRateBucket Armazenagem { get; set; } = new();
    public ApiRateBucket Clima { get; set; } = new();

    public ApiRateBucket Ensure(string name) => name switch
    {
        "clima" => Clima ??= new ApiRateBucket(),
        _ => Armazenagem ??= new ApiRateBucket()
    };
}

public sealed class ApiRateBucket
{
    public List<string> RequestTimes { get; set; } = [];
    public JsonObject? Cache { get; set; }
    public string? LastAttemptAt { get; set; }
    public string? LastSuccessAt { get; set; }
    public string? LastError { get; set; }
}
