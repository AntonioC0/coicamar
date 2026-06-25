using System.Globalization;
using System.Text.Json.Nodes;
using COICamar.App.Models;

namespace COICamar.App.Services;

public sealed class OperationalDataService(ILocalDatabase database, ProcerApiService procerApi, ILogger<OperationalDataService> logger)
{
    private static readonly CultureInfo Brazil = CultureInfo.GetCultureInfo("pt-BR");

    public Task<OperationalState> LoadAsync(CancellationToken cancellationToken = default) =>
        database.LoadAsync(cancellationToken);

    public async Task<RefreshResult> RefreshOperationalAsync(bool force, CancellationToken cancellationToken = default)
    {
        var state = await database.LoadAsync(cancellationToken);

        try
        {
            var payload = await procerApi.GetProcerOperacionalAsync(force, cancellationToken);
            var queryDate = Text(payload, "requestDate") ?? DateTimeOffset.UtcNow.ToString("O");
            var requestDate = ParseProcerDate(queryDate);
            var storagePayload = payload["armazenagem"] as JsonObject;
            var climatePayload = payload["clima"] as JsonObject;
            var total = 0;
            var newReadings = 0;
            var storageApplied = false;
            var climateApplied = false;

            if (storagePayload?["dados"] is JsonArray dados)
            {
                var result = ApplyProcerAtalaiaData(state, dados, requestDate);
                total = result.Total;
                newReadings = result.NewReadingCount;
                storageApplied = true;
            }

            var climateNode = climatePayload?["dado"];
            if (climateNode is not null)
            {
                climateApplied = ApplyWeatherData(state, climateNode, queryDate);
            }

            if (!storageApplied && !climateApplied)
            {
                throw new InvalidOperationException("A API não retornou dados operacionais válidos para Atalaia.");
            }

            state.LastOperationalQueryAt = queryDate;
            state.LastOperationalQueryStatus = "success";
            await database.SaveAsync(state, cancellationToken);

            return new RefreshResult(true, total, newReadings, "Consulta concluída e banco local atualizado.");
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Falha ao atualizar dados operacionais");
            state.LastOperationalQueryAt = DateTimeOffset.UtcNow.ToString("O");
            state.LastOperationalQueryStatus = "error";
            await database.SaveAsync(state, cancellationToken);

            return new RefreshResult(false, 0, 0, ex.Message);
        }
    }

    public async Task<SupervisorAction> CreateSupervisorActionAsync(
        OperationalAttention? attention,
        string origin,
        string siloKey,
        string attentionText,
        string dueDate,
        string description,
        CancellationToken cancellationToken = default)
    {
        var state = await database.LoadAsync(cancellationToken);
        var next = state.SupervisorActions.Count + 1;
        var action = new SupervisorAction
        {
            Id = $"AC-{next:000}",
            Origin = string.IsNullOrWhiteSpace(origin) ? attention?.Origin ?? "Termometria" : origin,
            SiloKey = string.IsNullOrWhiteSpace(siloKey) ? attention?.SiloKey ?? "" : siloKey,
            Silo = OperationalRules.SiloDisplayName(string.IsNullOrWhiteSpace(siloKey) ? attention?.SiloKey ?? "" : siloKey),
            Attention = string.IsNullOrWhiteSpace(attentionText) ? attention?.Attention ?? "" : attentionText,
            Description = string.IsNullOrWhiteSpace(description)
                ? $"Verificar e corrigir: {(string.IsNullOrWhiteSpace(attentionText) ? attention?.Attention : attentionText)}"
                : description,
            Responsible = "Supervisor",
            DueDate = dueDate,
            Status = "Pendente",
            CreatedAt = DateTimeOffset.UtcNow.ToString("O"),
            SourceAttentionId = attention?.Id
        };

        state.SupervisorActions.Insert(0, action);
        await database.SaveAsync(state, cancellationToken);
        return action;
    }

    public async Task SaveStateAsync(OperationalState state, CancellationToken cancellationToken = default) =>
        await database.SaveAsync(state, cancellationToken);

    private static ProcerApplyResult ApplyProcerAtalaiaData(OperationalState state, JsonArray dados, DateTimeOffset requestDate)
    {
        var atalaiaItems = dados
            .Select(ParseStorageItem)
            .Where(item => IsAtalaia(item.Raw))
            .OrderBy(item => item.Numero ?? 0)
            .ToList();

        if (atalaiaItems.Count == 0)
        {
            throw new InvalidOperationException("A requisição não retornou silos da unidade Atalaia.");
        }

        var newReadingCount = 0;

        foreach (var item in atalaiaItems)
        {
            var launch = CreateProcerLaunch(item, requestDate);
            var existingLaunches = state.LaunchesBySilo.TryGetValue(launch.SiloKey, out var launches)
                ? launches.Where(existing => existing.Source != "placeholder").ToList()
                : [];

            var alreadySaved = existingLaunches.Any(existing =>
                existing.Id == launch.Id || (existing.Source == "Procer" && existing.Timestamp == launch.Timestamp));
            if (!alreadySaved)
            {
                newReadingCount++;
            }

            state.LaunchesBySilo[launch.SiloKey] = DedupeLaunches([launch, .. existingLaunches
                    .Where(existing => existing.Id != launch.Id && !(existing.Source == "Procer" && existing.Timestamp == launch.Timestamp))])
                .Take(5000)
                .ToList();

            RegisterAerationReading(state, item, requestDate);
        }

        var latestCommunicationDate = atalaiaItems
            .Select(item => ParseProcerDate(item.DataComunicacao ?? requestDate.ToString("O")))
            .DefaultIfEmpty(requestDate)
            .Max();

        var currentPeriod = $"{latestCommunicationDate.Year:0000}-{latestCommunicationDate.Month:00}";

        state.AerationData = atalaiaItems.Select(item =>
        {
            var siloName = item.Identificacao ?? $"Silo {item.Numero.GetValueOrDefault(1):00}";
            var siloKey = OperationalRules.SiloKey(siloName);
            var launch = OperationalRules.GetLatestLaunch(state, siloKey);
            var max = OperationalRules.Extrema(launch?.Matrix, true);
            var temperature = item.TemperaturaMedia ?? max.Value ?? 23.2;

            return new AerationItem
            {
                Name = OperationalRules.SiloDisplayName(siloName),
                SiloKey = siloKey,
                Status = item.AeracaoLigada == 1 ? "Ligada" : "Desligada",
                MonthlyHours = GetAerationHoursForPeriod(state, siloKey, currentPeriod),
                LastStart = GetAerationLastStartLabel(state, siloKey),
                MotorCount = OperationalRules.AerationMotorCount,
                Temperature = temperature,
                ReadingTimestamp = ParseProcerDate(item.DataComunicacao ?? requestDate.ToString("O")).ToString("O")
            };
        }).ToList();

        state.LastAerationUpdate = OperationalRules.FormatDateTime(latestCommunicationDate);
        if (newReadingCount > 0 || state.AerationHistory.Count == 0)
        {
            var snapshot = new AerationSnapshot
            {
                Id = $"aeration-{latestCommunicationDate.ToUnixTimeMilliseconds()}",
                Timestamp = latestCommunicationDate.ToString("O"),
                Date = OperationalRules.FormatDateTime(latestCommunicationDate),
                Items = state.AerationData.Select(CloneAerationItem).ToList()
            };

            state.AerationHistory = state.AerationHistory
                .Where(existing => existing.Id != snapshot.Id)
                .Prepend(snapshot)
                .Take(5000)
                .ToList();
        }

        return new ProcerApplyResult(atalaiaItems.Count, newReadingCount, latestCommunicationDate);
    }

    private static ThermometryLaunch CreateProcerLaunch(ProcerStorageItem item, DateTimeOffset requestDate)
    {
        var siloName = item.Identificacao ?? $"Silo {item.Numero.GetValueOrDefault(1):00}";
        var siloKey = OperationalRules.SiloKey(siloName);
        var sensorLevels = ParseSensorLevels(item.NivelSensores);
        var temperatureData = ParseTemperatureData(item.TemperaturaLeituras, sensorLevels);
        var offlineSensors = ProcerOfflineSensors(temperatureData.Matrix, temperatureData.AbsentSensors, temperatureData.MissingSensors);
        var communicationDate = item.DataComunicacao ?? requestDate.ToString("O");
        var communicationTimestamp = ParseProcerDate(communicationDate);

        var launch = new ThermometryLaunch
        {
            Id = $"procer-{siloKey}-{communicationTimestamp.ToUnixTimeMilliseconds()}",
            Date = OperationalRules.FormatDateTime(communicationTimestamp),
            Timestamp = communicationTimestamp.ToString("O"),
            RequestTimestamp = requestDate.ToString("O"),
            Responsible = "Integração Procer",
            Status = "Padrão",
            Trend = "Leitura Procer",
            Silo = OperationalRules.SiloDisplayName(siloName),
            SiloKey = siloKey,
            OfflineSensors = offlineSensors,
            AbsentSensors = temperatureData.AbsentSensors,
            MissingSensors = temperatureData.MissingSensors,
            Matrix = temperatureData.Matrix,
            Source = "Procer",
            Procer = CloneObject(item.Raw)
        };

        launch.Status = OperationalRules.StatusFromLaunch(launch);
        return launch;
    }

    private static TemperatureParseResult ParseTemperatureData(string? temperatureReadings, IReadOnlyList<int> sensorLevels)
    {
        var rawColumns = (temperatureReadings ?? "")
            .Split('|', StringSplitOptions.None)
            .Select(column => column.Split(';', StringSplitOptions.None).Select(item => item.Trim()).ToList())
            .ToList();
        var columns = rawColumns.Select(column => column.Select(ParseProcerNumber).ToList()).ToList();
        var colCount = Math.Max(Math.Max(columns.Count, sensorLevels.Count), OperationalRules.DefaultWireCount);
        var columnLengths = Enumerable.Range(0, colCount)
            .Select(col => rawColumns.ElementAtOrDefault(col)?.Count ?? 0);
        var rowCount = Math.Max(Math.Max(sensorLevels.DefaultIfEmpty(0).Max(), columnLengths.DefaultIfEmpty(0).Max()), OperationalRules.DefaultSensorCount);

        if (string.IsNullOrWhiteSpace(temperatureReadings) && sensorLevels.Count == 0)
        {
            return new TemperatureParseResult(CreateEmptyMatrix(), [], []);
        }

        var matrix = Enumerable.Range(0, rowCount)
            .Select(row => Enumerable.Range(0, colCount)
                .Select(col => columns.ElementAtOrDefault(col)?.ElementAtOrDefault(row))
                .ToList())
            .ToList();

        var absentSensors = new List<SensorPosition>();
        var missingSensors = new List<SensorPosition>();

        for (var row = 0; row < rowCount; row++)
        {
            for (var col = 0; col < colCount; col++)
            {
                var value = matrix[row][col];
                if (value.HasValue)
                {
                    continue;
                }

                var raw = rawColumns.ElementAtOrDefault(col)?.ElementAtOrDefault(row);
                if (raw is null)
                {
                    missingSensors.Add(new SensorPosition { Row = row, Col = col });
                }
                else if (raw.Length == 0 || raw.All(character => character == '-'))
                {
                    absentSensors.Add(new SensorPosition { Row = row, Col = col });
                }
            }
        }

        return new TemperatureParseResult(matrix, absentSensors, missingSensors);
    }

    private static List<SensorPosition> ProcerOfflineSensors(
        IReadOnlyList<List<double?>> matrix,
        IReadOnlyList<SensorPosition> absentSensors,
        IReadOnlyList<SensorPosition> missingSensors)
    {
        var rowCount = OperationalRules.MatrixRowCount(matrix);
        var colCount = OperationalRules.MatrixColCount(matrix);
        var missingSet = OperationalRules.SensorPositionSet(missingSensors, rowCount, colCount);
        var forcedOfflineSet = OperationalRules.SensorPositionSet(absentSensors, rowCount, colCount);
        var offline = new List<SensorPosition>();

        for (var row = 0; row < rowCount; row++)
        {
            for (var col = 0; col < colCount; col++)
            {
                var key = $"{row}:{col}";
                if (missingSet.Contains(key))
                {
                    continue;
                }

                if (!matrix.ElementAtOrDefault(row)?.ElementAtOrDefault(col).HasValue == true || forcedOfflineSet.Contains(key))
                {
                    offline.Add(new SensorPosition { Row = row, Col = col });
                }
            }
        }

        return offline;
    }

    private static void RegisterAerationReading(OperationalState state, ProcerStorageItem item, DateTimeOffset requestDate)
    {
        var siloName = item.Identificacao ?? $"Silo {item.Numero.GetValueOrDefault(1):00}";
        var siloKey = OperationalRules.SiloKey(siloName);
        var readingDate = ParseProcerDate(item.DataComunicacao ?? requestDate.ToString("O"));
        var readingTimestamp = readingDate.ToString("O");
        var requestTimestamp = requestDate.ToString("O");
        var currentState = item.AeracaoLigada == 1 ? "Ligada" : "Desligada";

        if (!state.AerationRuntime.TryGetValue(siloKey, out var previous) || string.IsNullOrWhiteSpace(previous.LastReadingTimestamp))
        {
            state.AerationRuntime[siloKey] = new AerationRuntimeState
            {
                SiloKey = siloKey,
                LastState = currentState,
                LastReadingTimestamp = readingTimestamp,
                LastRequestTimestamp = requestTimestamp,
                LastStartTimestamp = currentState == "Ligada" ? readingTimestamp : null
            };
            return;
        }

        var previousTimestamp = ParseProcerDate(previous.LastReadingTimestamp);
        if (readingDate <= previousTimestamp)
        {
            previous.LastRequestTimestamp = requestTimestamp;
            return;
        }

        if (previous.LastState == "Ligada")
        {
            var intervalId = $"{siloKey}|{previousTimestamp:O}|{readingTimestamp}";
            if (previous.Intervals.All(interval => interval.Id != intervalId))
            {
                previous.Intervals.Add(new AerationInterval
                {
                    Id = intervalId,
                    Start = previousTimestamp.ToString("O"),
                    End = readingTimestamp,
                    DurationSeconds = Math.Max(0, (int)Math.Round((readingDate - previousTimestamp).TotalSeconds))
                });
            }
        }

        if (previous.LastState != "Ligada" && currentState == "Ligada")
        {
            previous.LastStartTimestamp = readingTimestamp;
        }
        else if (previous.LastState == "Ligada" && currentState != "Ligada")
        {
            previous.LastStartTimestamp = null;
        }
        else if (currentState == "Ligada" && string.IsNullOrWhiteSpace(previous.LastStartTimestamp))
        {
            previous.LastStartTimestamp = readingTimestamp;
        }

        previous.LastState = currentState;
        previous.LastReadingTimestamp = readingTimestamp;
        previous.LastRequestTimestamp = requestTimestamp;
    }

    private static double GetAerationHoursForPeriod(OperationalState state, string siloKey, string period)
    {
        if (!state.AerationRuntime.TryGetValue(siloKey, out var runtime))
        {
            return 0;
        }

        var bounds = GetMonthBounds(period);
        var seconds = runtime.Intervals.Sum(interval => OverlapSeconds(interval.Start, interval.End, bounds.Start, bounds.End));
        if (runtime.LastState == "Ligada" && !string.IsNullOrWhiteSpace(runtime.LastReadingTimestamp))
        {
            var readingDate = ParseProcerDate(runtime.LastReadingTimestamp);
            var now = DateTimeOffset.Now;
            if (now > readingDate && now - readingDate <= OperationalRules.OperationalRefreshInterval * 2)
            {
                seconds += OverlapSeconds(readingDate.ToString("O"), now.ToString("O"), bounds.Start, bounds.End);
            }
        }

        return Math.Round(Math.Max(0, seconds) / 3600d, 2);
    }

    private static string GetAerationLastStartLabel(OperationalState state, string siloKey)
    {
        return state.AerationRuntime.TryGetValue(siloKey, out var runtime) && !string.IsNullOrWhiteSpace(runtime.LastStartTimestamp)
            ? OperationalRules.FormatDateTime(runtime.LastStartTimestamp)
            : "--";
    }

    private static (DateTimeOffset Start, DateTimeOffset End) GetMonthBounds(string period)
    {
        var now = DateTimeOffset.Now;
        var year = now.Year;
        var month = now.Month;
        var parts = period.Split('-', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length == 2 && int.TryParse(parts[0], out var parsedYear) && int.TryParse(parts[1], out var parsedMonth))
        {
            year = parsedYear;
            month = parsedMonth;
        }

        var start = new DateTimeOffset(year, month, 1, 0, 0, 0, now.Offset);
        return (start, start.AddMonths(1));
    }

    private static int OverlapSeconds(string startValue, string endValue, DateTimeOffset rangeStart, DateTimeOffset rangeEnd)
    {
        var start = ParseProcerDate(startValue);
        var end = ParseProcerDate(endValue);
        var overlapStart = start > rangeStart ? start : rangeStart;
        var overlapEnd = end < rangeEnd ? end : rangeEnd;
        return overlapEnd > overlapStart ? (int)Math.Round((overlapEnd - overlapStart).TotalSeconds) : 0;
    }

    private static bool ApplyWeatherData(OperationalState state, JsonNode item, string requestDate)
    {
        var temperature = Number(item, "temperatura", "temperature");
        if (!temperature.HasValue)
        {
            return false;
        }

        state.WeatherData = new WeatherData
        {
            Temperature = temperature,
            CommunicationDate = Text(item, "data_comunicacao", "communicationDate") ?? requestDate,
            SavedAt = DateTimeOffset.UtcNow.ToString("O")
        };

        return true;
    }

    private static ProcerStorageItem ParseStorageItem(JsonNode? node)
    {
        var raw = CloneObject(node as JsonObject ?? []);
        return new ProcerStorageItem
        {
            Nome = Text(raw, "nome"),
            Cidade = Text(raw, "cidade"),
            Uf = Text(raw, "uf", "UF"),
            Numero = Int(raw, "numero"),
            Identificacao = Text(raw, "identificacao"),
            Chapas = Int(raw, "chapas"),
            Diametro = Number(raw, "diametro"),
            CapacidadeSacas = Number(raw, "capacidade_sacas"),
            EstoqueSacas = Number(raw, "estoque_sacas"),
            ProgramaAeracao = Text(raw, "programa_aeracao"),
            NomeProduto = Text(raw, "nome_produto"),
            NomeGrao = Text(raw, "nome_grao"),
            TeorUmidade = Number(raw, "teor_umidade"),
            PainelStatus = Int(raw, "painel_status"),
            AeracaoLigada = Int(raw, "aeracao_ligada"),
            NivelSensores = Text(raw, "nivel_sensores"),
            TemperaturaLeituras = Text(raw, "temperatura_leituras"),
            TemperaturaMedia = Number(raw, "temperatura_media"),
            Descricao = Text(raw, "descricao"),
            DataComunicacao = Text(raw, "data_comunicacao"),
            Raw = raw
        };
    }

    private static bool IsAtalaia(JsonNode? node)
    {
        var city = Text(node, "cidade") ?? "";
        var name = Text(node, "nome") ?? "";
        var branch = Text(node, "filial") ?? "";
        return city.Equals("atalaia", StringComparison.OrdinalIgnoreCase)
            || name.Contains("atalaia", StringComparison.OrdinalIgnoreCase)
            || branch.Contains("atalaia", StringComparison.OrdinalIgnoreCase);
    }

    private static List<int> ParseSensorLevels(string? value)
    {
        return (value ?? "")
            .Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(part => int.TryParse(part, NumberStyles.Integer, CultureInfo.InvariantCulture, out var number) ? number : (int?)null)
            .Where(number => number.HasValue)
            .Select(number => number!.Value)
            .ToList();
    }

    private static double? ParseProcerNumber(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        return double.TryParse(value.Trim().Replace(',', '.'), NumberStyles.Any, CultureInfo.InvariantCulture, out var number)
            ? number
            : null;
    }

    private static DateTimeOffset ParseProcerDate(string value)
    {
        return OperationalRules.TryParseDate(value, out var date) ? date : DateTimeOffset.Now;
    }

    private static List<List<double?>> CreateEmptyMatrix(int rowCount = OperationalRules.DefaultSensorCount, int colCount = OperationalRules.DefaultWireCount)
    {
        return Enumerable.Range(0, rowCount)
            .Select(_ => Enumerable.Range(0, colCount).Select(_ => (double?)null).ToList())
            .ToList();
    }

    private static List<ThermometryLaunch> DedupeLaunches(IEnumerable<ThermometryLaunch> launches)
    {
        return launches
            .GroupBy(launch => launch.Source == "Procer" && !string.IsNullOrWhiteSpace(launch.Timestamp)
                ? $"procer:{launch.Timestamp}"
                : launch.Id)
            .Select(group => group.First())
            .OrderByDescending(OperationalRules.LaunchDateKey)
            .ToList();
    }

    private static AerationItem CloneAerationItem(AerationItem item) => new()
    {
        Name = item.Name,
        SiloKey = item.SiloKey,
        Status = item.Status,
        MonthlyHours = item.MonthlyHours,
        LastStart = item.LastStart,
        MotorCount = item.MotorCount,
        Temperature = item.Temperature,
        ReadingTimestamp = item.ReadingTimestamp
    };

    private static string? Text(JsonNode? node, params string[] names)
    {
        foreach (var name in names)
        {
            if (node?[name] is JsonValue value)
            {
                return value.ToString();
            }
        }

        return null;
    }

    private static double? Number(JsonNode? node, params string[] names)
    {
        var value = Text(node, names);
        if (value is null)
        {
            return null;
        }

        return ParseProcerNumber(value);
    }

    private static int? Int(JsonNode? node, params string[] names)
    {
        var number = Number(node, names);
        return number.HasValue ? Convert.ToInt32(number.Value) : null;
    }

    private static JsonObject CloneObject(JsonObject node) =>
        (JsonObject)JsonNode.Parse(node.ToJsonString())!;
}

public sealed record RefreshResult(bool Success, int Total, int NewReadingCount, string Message);

public sealed record ProcerApplyResult(int Total, int NewReadingCount, DateTimeOffset LatestCommunicationDate);

internal sealed record TemperatureParseResult(
    List<List<double?>> Matrix,
    List<SensorPosition> AbsentSensors,
    List<SensorPosition> MissingSensors);
