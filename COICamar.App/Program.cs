using COICamar.App.Components;
using COICamar.App.Models;
using COICamar.App.Services;
using Microsoft.AspNetCore.DataProtection;

var builder = WebApplication.CreateBuilder(args);

builder.Logging.ClearProviders();
builder.Logging.AddConsole();
builder.Logging.AddDebug();

// Add services to the container.
builder.Services.AddRazorComponents()
    .AddInteractiveServerComponents();
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy => policy
        .AllowAnyOrigin()
        .AllowAnyHeader()
        .AllowAnyMethod());
});
builder.Services.AddHttpClient("procer", client =>
{
    client.BaseAddress = new Uri("https://dados.procer.com.br/");
    client.Timeout = TimeSpan.FromSeconds(70);
});
builder.Services.AddSingleton<ILocalDatabase, JsonLocalDatabase>();
builder.Services.AddSingleton<ProcerApiService>();
builder.Services.AddScoped<OperationalDataService>();
builder.Services.AddHostedService<OperationalRefreshWorker>();
builder.Services.AddDataProtection()
    .PersistKeysToFileSystem(new DirectoryInfo(Path.Combine(builder.Environment.ContentRootPath, "Data", "keys")));

var app = builder.Build();

// Configure the HTTP request pipeline.
if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Error", createScopeForErrors: true);
    // The default HSTS value is 30 days. You may want to change this for production scenarios, see https://aka.ms/aspnetcore-hsts.
    app.UseHsts();
}
app.UseStatusCodePagesWithReExecute("/not-found", createScopeForStatusCodePages: true);
app.UseHttpsRedirection();
app.UseCors();

app.UseAntiforgery();

app.MapGet("/api/health", (ILocalDatabase database, IWebHostEnvironment environment) => Results.Json(new
{
    ok = true,
    application = "COICamar.App",
    database = database.DatabasePath,
    apiHistory = Path.Combine(environment.ContentRootPath, "Data", "api-history.jsonl")
}));

app.MapGet("/api/termometria-db", async (ILocalDatabase database, CancellationToken cancellationToken) =>
    Results.Json(await database.LoadAsync(cancellationToken)));

app.MapPost("/api/termometria-db", async (OperationalState state, ILocalDatabase database, CancellationToken cancellationToken) =>
{
    await database.SaveAsync(state, cancellationToken);
    return Results.Json(new { ok = true, path = database.DatabasePath });
});

app.MapGet("/api/procer-atalaia", async (bool? force, ProcerApiService procer, CancellationToken cancellationToken) =>
    Results.Json(await procer.GetProcerArmazenagemAsync(force ?? false, cancellationToken)));

app.MapGet("/api/clima-atalaia", async (bool? force, ProcerApiService procer, CancellationToken cancellationToken) =>
    Results.Json(await procer.GetProcerClimaAsync(force ?? false, cancellationToken)));

app.MapGet("/api/operacional-atalaia", async (bool? force, ProcerApiService procer, CancellationToken cancellationToken) =>
    Results.Json(await procer.GetProcerOperacionalAsync(force ?? false, cancellationToken)));

app.MapStaticAssets();
app.MapRazorComponents<App>()
    .AddInteractiveServerRenderMode();

app.Run();
