using System.Text.Json.Nodes;

namespace COICamar.App.Models;

public sealed class OperationalState
{
    public int Version { get; set; } = 1;
    public string? SavedAt { get; set; }
    public string CurrentUnit { get; set; } = "atalaia";
    public Dictionary<string, List<ThermometryLaunch>> LaunchesBySilo { get; set; } = [];
    public List<AerationItem> AerationData { get; set; } = [];
    public List<AerationSnapshot> AerationHistory { get; set; } = [];
    public Dictionary<string, AerationRuntimeState> AerationRuntime { get; set; } = [];
    public string? LastAerationUpdate { get; set; }
    public string? LastOperationalQueryAt { get; set; }
    public string LastOperationalQueryStatus { get; set; } = "idle";
    public WeatherData WeatherData { get; set; } = new();
    public Dictionary<string, List<SampleLaunch>> SampleLaunchesBySilo { get; set; } = [];
    public List<SupervisorAction> SupervisorActions { get; set; } = [];
}

public sealed class ThermometryLaunch
{
    public string Id { get; set; } = "";
    public string Date { get; set; } = "";
    public string? Timestamp { get; set; }
    public string? RequestTimestamp { get; set; }
    public string Responsible { get; set; } = "";
    public string Status { get; set; } = "Padrão";
    public string? Trend { get; set; }
    public string Silo { get; set; } = "";
    public string SiloKey { get; set; } = "";
    public List<SensorPosition> OfflineSensors { get; set; } = [];
    public List<SensorPosition> AbsentSensors { get; set; } = [];
    public List<SensorPosition> MissingSensors { get; set; } = [];
    public List<List<double?>> Matrix { get; set; } = [];
    public string? Source { get; set; }
    public JsonNode? Procer { get; set; }
}

public sealed class SensorPosition
{
    public int Row { get; set; }
    public int Col { get; set; }
}

public sealed class AerationItem
{
    public string Name { get; set; } = "";
    public string SiloKey { get; set; } = "";
    public string Status { get; set; } = "Desligada";
    public double MonthlyHours { get; set; }
    public string LastStart { get; set; } = "--";
    public int MotorCount { get; set; } = 2;
    public double Temperature { get; set; }
    public string? ReadingTimestamp { get; set; }
}

public sealed class AerationSnapshot
{
    public string Id { get; set; } = "";
    public string? Timestamp { get; set; }
    public string Date { get; set; } = "";
    public List<AerationItem> Items { get; set; } = [];
}

public sealed class AerationRuntimeState
{
    public string SiloKey { get; set; } = "";
    public string LastState { get; set; } = "Desligada";
    public string? LastReadingTimestamp { get; set; }
    public string? LastRequestTimestamp { get; set; }
    public string? LastStartTimestamp { get; set; }
    public List<AerationInterval> Intervals { get; set; } = [];
}

public sealed class AerationInterval
{
    public string Id { get; set; } = "";
    public string Start { get; set; } = "";
    public string End { get; set; } = "";
    public int DurationSeconds { get; set; }
}

public sealed class WeatherData
{
    public double? Temperature { get; set; }
    public string? CommunicationDate { get; set; }
    public string? SavedAt { get; set; }
}

public sealed class SupervisorAction
{
    public string Id { get; set; } = "";
    public string Origin { get; set; } = "Termometria";
    public string Silo { get; set; } = "";
    public string SiloKey { get; set; } = "";
    public string Attention { get; set; } = "";
    public string Description { get; set; } = "";
    public string Responsible { get; set; } = "Supervisor";
    public string DueDate { get; set; } = "";
    public string Status { get; set; } = "Pendente";
    public string? CreatedAt { get; set; }
    public string? SourceAttentionId { get; set; }
}

public sealed class SampleLaunch
{
    public string Id { get; set; } = "";
    public string Silo { get; set; } = "";
    public string SiloKey { get; set; } = "";
    public string? Timestamp { get; set; }
    public string Date { get; set; } = "";
    public int PointCount { get; set; }
    public string Status { get; set; } = "";
    public string Responsible { get; set; } = "";
    public string Role { get; set; } = "";
    public List<JsonObject> Points { get; set; } = [];
}

public sealed class SiloConfig
{
    public string Name { get; set; } = "";
    public string Key { get; set; } = "";
    public string Unit { get; set; } = "atalaia";
}

public sealed class OperationalAttention
{
    public string Id { get; set; } = "";
    public string Origin { get; set; } = "";
    public string Silo { get; set; } = "";
    public string SiloKey { get; set; } = "";
    public string Severity { get; set; } = "Padrão";
    public string Attention { get; set; } = "";
    public string? DateTime { get; set; }
}

public sealed class DashboardSummary
{
    public int SiloCount { get; set; }
    public int AttentionCount { get; set; }
    public int PendingActions { get; set; }
    public int LateActions { get; set; }
    public string WeatherTemperature { get; set; } = "--";
    public string WeatherSource { get; set; } = "Estação Atalaia";
}

public sealed class ProcerStorageItem
{
    public string? Nome { get; set; }
    public string? Cidade { get; set; }
    public string? Uf { get; set; }
    public int? Numero { get; set; }
    public string? Identificacao { get; set; }
    public int? Chapas { get; set; }
    public double? Diametro { get; set; }
    public double? CapacidadeSacas { get; set; }
    public double? EstoqueSacas { get; set; }
    public string? ProgramaAeracao { get; set; }
    public string? NomeProduto { get; set; }
    public string? NomeGrao { get; set; }
    public double? TeorUmidade { get; set; }
    public int? PainelStatus { get; set; }
    public int? AeracaoLigada { get; set; }
    public string? NivelSensores { get; set; }
    public string? TemperaturaLeituras { get; set; }
    public double? TemperaturaMedia { get; set; }
    public string? Descricao { get; set; }
    public string? DataComunicacao { get; set; }
    public JsonObject Raw { get; set; } = [];
}

public sealed class ProcerClimateItem
{
    public string? Filial { get; set; }
    public string? Cidade { get; set; }
    public string? Uf { get; set; }
    public double? Temperatura { get; set; }
    public string? DataComunicacao { get; set; }
    public JsonObject Raw { get; set; } = [];
}
