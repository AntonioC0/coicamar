using System.Text.Json;
using COICamar.App.Models;

namespace COICamar.App.Services;

public interface ILocalDatabase
{
    string DatabasePath { get; }
    Task<OperationalState> LoadAsync(CancellationToken cancellationToken = default);
    Task SaveAsync(OperationalState state, CancellationToken cancellationToken = default);
}

public sealed class JsonLocalDatabase(IWebHostEnvironment environment, IConfiguration configuration) : ILocalDatabase
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true,
        PropertyNameCaseInsensitive = true
    };

    private readonly SemaphoreSlim gate = new(1, 1);

    public string DatabasePath { get; } = ResolveDatabasePath(environment, configuration);

    public async Task<OperationalState> LoadAsync(CancellationToken cancellationToken = default)
    {
        await gate.WaitAsync(cancellationToken);
        try
        {
            EnsureDatabaseFile();
            await using var stream = File.OpenRead(DatabasePath);
            var state = await JsonSerializer.DeserializeAsync<OperationalState>(stream, JsonOptions, cancellationToken);
            return Normalize(state);
        }
        finally
        {
            gate.Release();
        }
    }

    public async Task SaveAsync(OperationalState state, CancellationToken cancellationToken = default)
    {
        await gate.WaitAsync(cancellationToken);
        try
        {
            EnsureDatabaseFile();
            state.SavedAt = DateTimeOffset.UtcNow.ToString("O");

            var temporaryPath = $"{DatabasePath}.tmp";
            await using (var stream = File.Create(temporaryPath))
            {
                await JsonSerializer.SerializeAsync(stream, Normalize(state), JsonOptions, cancellationToken);
            }

            File.Move(temporaryPath, DatabasePath, true);
        }
        finally
        {
            gate.Release();
        }
    }

    private static string ResolveDatabasePath(IWebHostEnvironment environment, IConfiguration configuration)
    {
        var configured = configuration["LocalDatabase:Path"];
        if (!string.IsNullOrWhiteSpace(configured))
        {
            return Path.GetFullPath(configured, environment.ContentRootPath);
        }

        return Path.Combine(environment.ContentRootPath, "Data", "termometria-db.json");
    }

    private void EnsureDatabaseFile()
    {
        Directory.CreateDirectory(Path.GetDirectoryName(DatabasePath)!);
        if (File.Exists(DatabasePath))
        {
            return;
        }

        var empty = new OperationalState
        {
            CurrentUnit = "atalaia",
            LaunchesBySilo = DefaultSilos().ToDictionary(silo => silo.Key, _ => new List<ThermometryLaunch>()),
            AerationData = DefaultSilos().Select(silo => new AerationItem
            {
                Name = silo.Name,
                SiloKey = silo.Key,
                Status = "Desligada",
                MotorCount = 2,
                Temperature = 23.2
            }).ToList()
        };

        File.WriteAllText(DatabasePath, JsonSerializer.Serialize(empty, JsonOptions));
    }

    private static OperationalState Normalize(OperationalState? state)
    {
        state ??= new OperationalState();
        state.CurrentUnit = string.IsNullOrWhiteSpace(state.CurrentUnit) ? "atalaia" : state.CurrentUnit;
        state.LaunchesBySilo ??= [];
        state.AerationData ??= [];
        state.AerationHistory ??= [];
        state.AerationRuntime ??= [];
        state.WeatherData ??= new WeatherData();
        state.SampleLaunchesBySilo ??= [];
        state.SupervisorActions ??= [];

        foreach (var silo in DefaultSilos())
        {
            state.LaunchesBySilo.TryAdd(silo.Key, []);
            if (state.AerationData.All(item => item.SiloKey != silo.Key))
            {
                state.AerationData.Add(new AerationItem
                {
                    Name = silo.Name,
                    SiloKey = silo.Key,
                    Status = "Desligada",
                    MotorCount = 2,
                    Temperature = 23.2
                });
            }
        }

        return state;
    }

    private static IReadOnlyList<SiloConfig> DefaultSilos() =>
    [
        new() { Name = "Silo 01", Key = "atalaia::Silo 01" },
        new() { Name = "Silo 02", Key = "atalaia::Silo 02" },
        new() { Name = "Silo 03", Key = "atalaia::Silo 03" },
        new() { Name = "Silo 04", Key = "atalaia::Silo 04" }
    ];
}
