using System.Globalization;
using COICamar.App.Models;

namespace COICamar.App.Services;

public static class OperationalRules
{
    public const double NormalMax = 27;
    public const double AttentionMax = 30;
    public const string UnitKey = "atalaia";
    public const int DefaultWireCount = 5;
    public const int DefaultSensorCount = 5;
    public const int AerationMotorCount = 2;
    public static readonly TimeSpan OperationalRefreshInterval = TimeSpan.FromMinutes(15);

    private static readonly CultureInfo Brazil = CultureInfo.GetCultureInfo("pt-BR");

    public static IReadOnlyList<SiloConfig> GetSilos(OperationalState state)
    {
        var keys = state.LaunchesBySilo.Keys
            .Concat(state.AerationData.Select(item => item.SiloKey))
            .Where(key => !string.IsNullOrWhiteSpace(key))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .OrderBy(key => SiloDisplayName(key), StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (keys.Count == 0)
        {
            keys.AddRange(["atalaia::Silo 01", "atalaia::Silo 02", "atalaia::Silo 03", "atalaia::Silo 04"]);
        }

        return keys.Select(key => new SiloConfig
        {
            Key = key,
            Name = SiloDisplayName(key),
            Unit = key.Contains("::", StringComparison.Ordinal) ? key.Split("::")[0] : UnitKey
        }).ToList();
    }

    public static string SiloKey(string siloNameOrKey) =>
        siloNameOrKey.Contains("::", StringComparison.Ordinal) ? siloNameOrKey : $"{UnitKey}::{siloNameOrKey}";

    public static string SiloDisplayName(string siloNameOrKey) =>
        siloNameOrKey.Contains("::", StringComparison.Ordinal) ? siloNameOrKey.Split("::").Last() : siloNameOrKey;

    public static ThermometryLaunch? GetLatestLaunch(OperationalState state, string siloNameOrKey)
    {
        var key = SiloKey(siloNameOrKey);
        return state.LaunchesBySilo.TryGetValue(key, out var launches)
            ? launches.OrderByDescending(LaunchDateKey).FirstOrDefault()
            : null;
    }

    public static int MatrixRowCount(IReadOnlyList<List<double?>>? matrix) =>
        matrix?.Count > 0 ? matrix.Count : DefaultSensorCount;

    public static int MatrixColCount(IReadOnlyList<List<double?>>? matrix) =>
        matrix is { Count: > 0 } ? Math.Max(DefaultWireCount, matrix.Max(line => line.Count)) : DefaultWireCount;

    public static bool HasMatrixValue(IReadOnlyList<List<double?>>? matrix) =>
        matrix?.Any(line => line.Any(value => value.HasValue && !double.IsNaN(value.Value))) == true;

    public static string StatusClassByValue(double? value)
    {
        if (!value.HasValue || double.IsNaN(value.Value))
        {
            return "offline";
        }

        if (value > AttentionMax)
        {
            return "critical";
        }

        return value >= NormalMax ? "attention" : "normal";
    }

    public static string BadgeClass(string? status) => NormalizeStatus(status) switch
    {
        "Crítico" => "badge-critical",
        "Atenção" => "badge-attention",
        _ => "badge-normal"
    };

    public static string StatusFromTemperature(double? value)
    {
        if (!value.HasValue)
        {
            return "Padrão";
        }

        if (value > AttentionMax)
        {
            return "Crítico";
        }

        return value >= NormalMax ? "Atenção" : "Padrão";
    }

    public static string StatusFromLaunch(ThermometryLaunch? launch)
    {
        if (launch is null || !HasMatrixValue(launch.Matrix))
        {
            return "Atenção";
        }

        return StatusFromTemperature(Extrema(launch.Matrix, true).Value);
    }

    public static ExtremaResult Extrema(IReadOnlyList<List<double?>>? matrix, bool max)
    {
        var best = max ? double.NegativeInfinity : double.PositiveInfinity;
        var found = false;
        var rowResult = 0;
        var colResult = 0;

        if (matrix is not null)
        {
            for (var row = 0; row < matrix.Count; row++)
            {
                for (var col = 0; col < matrix[row].Count; col++)
                {
                    var value = matrix[row][col];
                    if (!value.HasValue)
                    {
                        continue;
                    }

                    if ((max && value.Value > best) || (!max && value.Value < best))
                    {
                        best = value.Value;
                        rowResult = row;
                        colResult = col;
                        found = true;
                    }
                }
            }
        }

        return found
            ? new ExtremaResult(best, $"Sensor {rowResult + 1} - Fio {colResult + 1}", rowResult, colResult)
            : new ExtremaResult(null, "Sem leitura", 0, 0);
    }

    public static string FormatExtrema(ExtremaResult result) =>
        result.Value.HasValue ? $"{result.Value.Value.ToString("0.0", Brazil)}°C" : "--";

    public static string FormatTemperature(double? value) =>
        value.HasValue ? $"{value.Value.ToString("0.0", Brazil)}°C" : "--";

    public static string FormatDateTime(DateTimeOffset value) =>
        value.ToLocalTime().ToString("dd/MM/yyyy - HH:mm", Brazil);

    public static string FormatDateTime(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return "--";
        }

        return TryParseDate(value, out var date) ? FormatDateTime(date) : value;
    }

    public static string FormatDateOnly(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return "--";
        }

        return TryParseDate(value, out var date) ? date.ToLocalTime().ToString("dd/MM/yyyy", Brazil) : value.Split(" - ")[0];
    }

    public static string FormatDueDate(string? value)
    {
        if (DateOnly.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.None, out var date))
        {
            return date.ToString("dd/MM/yyyy", Brazil);
        }

        return string.IsNullOrWhiteSpace(value) ? "--" : value;
    }

    public static string FormatDuration(double hoursValue)
    {
        var totalMinutes = Math.Max(0, (int)Math.Round(hoursValue * 60));
        var hours = totalMinutes / 60;
        var minutes = totalMinutes % 60;

        if (hours == 0)
        {
            return $"{minutes} min";
        }

        return minutes == 0 ? $"{hours} h" : $"{hours} h {minutes:00} min";
    }

    public static IReadOnlySet<string> SensorPositionSet(IEnumerable<SensorPosition>? sensors, int rowCount, int colCount) =>
        NormalizeSensors(sensors, rowCount, colCount).Select(sensor => $"{sensor.Row}:{sensor.Col}").ToHashSet();

    public static List<SensorPosition> NormalizeSensors(IEnumerable<SensorPosition>? sensors, int rowCount, int colCount)
    {
        return (sensors ?? [])
            .Where(sensor => sensor.Row >= 0 && sensor.Row < rowCount && sensor.Col >= 0 && sensor.Col < colCount)
            .GroupBy(sensor => $"{sensor.Row}:{sensor.Col}")
            .Select(group => group.First())
            .OrderBy(sensor => sensor.Col)
            .ThenBy(sensor => sensor.Row)
            .ToList();
    }

    public static int OfflineSensorCount(ThermometryLaunch? launch)
    {
        var rowCount = MatrixRowCount(launch?.Matrix);
        var colCount = MatrixColCount(launch?.Matrix);
        var missing = SensorPositionSet(launch?.MissingSensors, rowCount, colCount);

        return NormalizeSensors(launch?.OfflineSensors, rowCount, colCount)
            .Count(sensor => !missing.Contains($"{sensor.Row}:{sensor.Col}"));
    }

    public static string OfflineSummary(ThermometryLaunch? launch)
    {
        var count = OfflineSensorCount(launch);
        if (count == 0)
        {
            return "Sem sensores off";
        }

        var rowCount = MatrixRowCount(launch?.Matrix);
        var colCount = MatrixColCount(launch?.Matrix);
        var missing = SensorPositionSet(launch?.MissingSensors, rowCount, colCount);
        var wires = NormalizeSensors(launch?.OfflineSensors, rowCount, colCount)
            .Where(sensor => !missing.Contains($"{sensor.Row}:{sensor.Col}"))
            .Select(sensor => sensor.Col)
            .Distinct()
            .Count();

        return count == 1 ? "1 sensor sem leitura" : $"{count} sensores sem leitura em {wires} {(wires == 1 ? "fio" : "fios")}";
    }

    public static List<SensorPoint> GetColumnSensorPositions(IReadOnlyList<List<double?>> matrix, int col, IReadOnlySet<string> missingSet)
    {
        return Enumerable.Range(0, MatrixRowCount(matrix))
            .Where(row => !missingSet.Contains($"{row}:{col}"))
            .Select(row => new SensorPoint(row, col, matrix.ElementAtOrDefault(row)?.ElementAtOrDefault(col)))
            .ToList();
    }

    public static int GetBaseSensorRowCount(IReadOnlyList<List<double?>> matrix, IEnumerable<SensorPosition>? missingSensors = null)
    {
        var rowCount = MatrixRowCount(matrix);
        var colCount = MatrixColCount(matrix);
        var missingSet = SensorPositionSet(missingSensors, rowCount, colCount);
        var counts = Enumerable.Range(0, colCount)
            .Select(col => GetColumnSensorPositions(matrix, col, missingSet).Count)
            .Where(count => count > 0)
            .ToList();

        if (counts.Count == 0)
        {
            return rowCount;
        }

        return counts.GroupBy(count => count)
            .OrderByDescending(group => group.Count())
            .ThenBy(group => group.Key)
            .First()
            .Key;
    }

    public static (List<SensorPoint> Roof, List<SensorPoint> Body) SplitColumnSensorPositions(List<SensorPoint> positions, int baseRowCount)
    {
        var extra = Math.Max(0, positions.Count - baseRowCount);
        return extra == 0
            ? ([], positions)
            : (positions.TakeLast(extra).ToList(), positions.Take(positions.Count - extra).ToList());
    }

    public static double SensorTopPosition(int index, int total) =>
        total <= 1 ? 50 : Math.Round(index / (double)(total - 1) * 100, 3);

    public static DashboardSummary BuildDashboardSummary(OperationalState state, IReadOnlyList<OperationalAttention> attentions)
    {
        var today = DateOnly.FromDateTime(DateTime.Now);
        return new DashboardSummary
        {
            SiloCount = GetSilos(state).Count,
            AttentionCount = attentions.Count,
            PendingActions = state.SupervisorActions.Count(action => GetActionRuntimeStatus(action, today) == "Pendente"),
            LateActions = state.SupervisorActions.Count(action => GetActionRuntimeStatus(action, today) == "Atrasada"),
            WeatherTemperature = FormatTemperature(state.WeatherData.Temperature),
            WeatherSource = "Estação Atalaia"
        };
    }

    public static List<OperationalAttention> BuildOperationalAttentions(OperationalState state)
    {
        var silos = GetSilos(state);
        var termometry = silos.Select(silo =>
        {
            var launch = GetLatestLaunch(state, silo.Key);
            if (launch is null)
            {
                return null;
            }

            var status = StatusFromLaunch(launch);
            var offCount = OfflineSensorCount(launch);
            if (status == "Padrão" && offCount == 0)
            {
                return null;
            }

            var max = Extrema(launch.Matrix, true);
            return new OperationalAttention
            {
                Id = $"termometria-{silo.Key}",
                Origin = "Termometria",
                Silo = silo.Name,
                SiloKey = silo.Key,
                Severity = offCount > 0 && status == "Padrão" ? "Atenção" : status,
                Attention = !HasMatrixValue(launch.Matrix)
                    ? "Sem leitura de termometria"
                    : offCount > 0 ? OfflineSummary(launch) : $"Temperatura máxima em {FormatExtrema(max)}",
                DateTime = launch.Date
            };
        }).Where(item => item is not null).Cast<OperationalAttention>();

        var aeration = state.AerationData.Select(item =>
        {
            var temperatureStatus = StatusFromTemperature(item.Temperature);
            if (item.Status == "Falha")
            {
                return new OperationalAttention
                {
                    Id = $"aeracao-{item.SiloKey}",
                    Origin = "Aeração",
                    Silo = item.Name,
                    SiloKey = item.SiloKey,
                    Severity = "Crítico",
                    Attention = $"Falha no sistema de aeração com {FormatTemperature(item.Temperature)}",
                    DateTime = state.LastAerationUpdate
                };
            }

            if (temperatureStatus == "Padrão")
            {
                return null;
            }

            return new OperationalAttention
            {
                Id = $"aeracao-{item.SiloKey}",
                Origin = "Aeração",
                Silo = item.Name,
                SiloKey = item.SiloKey,
                Severity = temperatureStatus,
                Attention = item.Status == "Desligada"
                    ? $"Aeração desligada e temperatura ambiente em {FormatTemperature(item.Temperature)}"
                    : $"Temperatura ambiente em {FormatTemperature(item.Temperature)}",
                DateTime = state.LastAerationUpdate
            };
        }).Where(item => item is not null).Cast<OperationalAttention>();

        return termometry.Concat(aeration)
            .OrderBy(item => item.Severity == "Crítico" ? 0 : 1)
            .ThenBy(item => item.Origin, StringComparer.CurrentCultureIgnoreCase)
            .ToList();
    }

    public static string GetActionRuntimeStatus(SupervisorAction action, DateOnly today)
    {
        if (action.Status == "Entregue")
        {
            return "Entregue";
        }

        if (DateOnly.TryParse(action.DueDate, CultureInfo.InvariantCulture, DateTimeStyles.None, out var dueDate) && dueDate < today)
        {
            return "Atrasada";
        }

        return "Pendente";
    }

    public static string ActionBadgeClass(string status) => status switch
    {
        "Atrasada" => "badge-critical",
        "Entregue" => "badge-normal",
        _ => "badge-attention"
    };

    public static string AerationStatusClass(string status) => status switch
    {
        "Falha" => "failure",
        "Desligada" => "off",
        _ => "on"
    };

    public static string NormalizeStatus(string? value)
    {
        return value switch
        {
            "Crítico" => "Crítico",
            "Atenção" => "Atenção",
            "Padrão" => "Padrão",
            "CrÃ­tico" => "Crítico",
            "AtenÃ§Ã£o" => "Atenção",
            "PadrÃ£o" => "Padrão",
            _ => string.IsNullOrWhiteSpace(value) ? "Padrão" : value
        };
    }

    public static DateTimeOffset LaunchDateKey(ThermometryLaunch launch)
    {
        if (TryParseDate(launch.Timestamp, out var timestamp))
        {
            return timestamp;
        }

        if (TryParseDate(launch.Date, out var date))
        {
            return date;
        }

        return DateTimeOffset.MinValue;
    }

    public static bool TryParseDate(string? value, out DateTimeOffset date)
    {
        if (DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AssumeLocal, out date))
        {
            return true;
        }

        if (DateTimeOffset.TryParse(value?.Replace(" - ", " ", StringComparison.Ordinal), Brazil, DateTimeStyles.AssumeLocal, out date))
        {
            return true;
        }

        if (DateTimeOffset.TryParse(value?.Replace(' ', 'T'), CultureInfo.InvariantCulture, DateTimeStyles.AssumeLocal, out date))
        {
            return true;
        }

        date = default;
        return false;
    }
}

public sealed record ExtremaResult(double? Value, string Location, int Row, int Col);

public sealed record SensorPoint(int Row, int Col, double? Value);
