# COICamar

Aplicacao web local para Dashboard Operacional, Termometria de Silos e Aeracao.

## Tecnologia

- C# / .NET / ASP.NET Core
- Blazor Web App com interatividade server-side
- Banco local em `COICamar.App/Data/termometria-db.json`
- Endpoints locais preservados:
  - `GET /api/health`
  - `GET /api/termometria-db`
  - `POST /api/termometria-db`
  - `GET /api/operacional-atalaia`
  - `GET /api/procer-atalaia`
  - `GET /api/clima-atalaia`
- `BackgroundService` para atualizacao operacional automatica a cada 15 minutos
- `IHttpClientFactory` para consultas Procer/clima

## Desenvolvimento local

```powershell
.\COICamar.App\Iniciar-COICamar.ps1
```

Abra:

```text
http://localhost:5095
```

Para encerrar:

```powershell
.\COICamar.App\Encerrar-COICamar.ps1
```

## Proxima etapa de banco

A persistencia esta isolada em `ILocalDatabase`. Para migrar para SQL Server/Entity Framework Core, substituir a implementacao atual `JsonLocalDatabase` por um repositorio EF Core mantendo os mesmos servicos e telas.
