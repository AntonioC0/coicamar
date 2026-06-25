namespace COICamar.App.Services;

public sealed class OperationalRefreshWorker(IServiceScopeFactory scopeFactory, ILogger<OperationalRefreshWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Delay(OperationalRules.OperationalRefreshInterval, stoppingToken);

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = scopeFactory.CreateScope();
                var service = scope.ServiceProvider.GetRequiredService<OperationalDataService>();
                await service.RefreshOperationalAsync(force: false, stoppingToken);
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception ex)
            {
                logger.LogWarning(ex, "Atualização automática operacional falhou");
            }

            await Task.Delay(OperationalRules.OperationalRefreshInterval, stoppingToken);
        }
    }
}
