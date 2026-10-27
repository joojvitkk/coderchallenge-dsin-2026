# F.O.G.O. — Ferramenta Onisciente de Gestão e Operações

Solução da **Etapa Bônus (Operação Next)** do **DSIN Coder Challenge 2026 — Protocolo PROMETHEUS**.
Central de monitoramento de equipamentos e agentes de trânsito e segurança, centrada em **Marília/SP** (sede da DSIN) e com cidades de todo o Brasil.

> **Dados simulados.** Todos os equipamentos, agentes, eventos e telemetria são fictícios e gerados por semente fixa. Só a presença da DSIN em Marília, Indaiatuba e Olímpia (SP), Maringá, Londrina e Toledo (PR) e Várzea Grande (MT) tem respaldo em fontes públicas (`docs/PESQUISA_DSIN.md`).

## Créditos
- **Autor e responsável pelo projeto: [@joojvitkk](https://github.com/joojvitkk).** Definiu o escopo, todas as regras de negócio e de previsão, **revisou todo o código e aprovou cada parte** antes da entrega.
- **Ferramenta de IA utilizada:** Claude Code (Anthropic), para escrever e revisar código a partir das regras definidas pelo autor. O produto em si **não chama nenhuma IA externa**: o "Copilot PROMETHEUS" é feito de regras e expressões regulares.

## Vídeo de demonstração
[`video/fogo-apresentacao.mp4`](video/fogo-apresentacao.mp4) (2 min 49 s, Full HD 1920×1080).

## O que o sistema faz
| Parte do desafio | O que foi entregue |
|---|---|
| **1. Inventário Inteligente** | CRUD de equipamentos (15 tipos, campos específicos por tipo) e de agentes; CEP com preenchimento automático (ViaCEP), referência livre, GPS; situação e manutenção (imediata/agendada); importação e exportação CSV/GeoJSON; auditoria e linha do tempo por equipamento |
| **2. Central de Operações** | Mapa em tempo real (SSE) com ícones por tipo e situação, KPIs, filtros, alertas com SLA e despacho do agente mais próximo, manutenção imediata e próxima, saúde por região/cidade/UF, mapa de calor, replay das últimas 24 h, briefing imprimível |
| **3. Cidade Preditiva** | Risco por local × hora com explicação ("por quê?") e intervalo de confiança, anomalias, manutenção preditiva, reforço de agentes, cenários *what-if*, lacunas de cobertura, tendências e backtesting |

## Como rodar
Pré-requisitos: **Docker** (Compose v2) *ou* **Python 3.12+** e **Node 20+**.

```bash
# Opção 1 — Docker
docker compose up
# Opção 2 — sem Docker (cria o venv, instala dependências e sobe tudo)
./run.sh
```
Depois abra **http://localhost:5173** (interface) e **http://localhost:8000/docs** (API interativa).
Na primeira subida o banco SQLite é criado e semeado (leva alguns segundos; o frontend instala dependências, ~1 min no Docker).

Portas ocupadas? `API_PORT=18000 WEB_PORT=15173 docker compose up` (ou o mesmo com `./run.sh`).

Só o backend:
```bash
cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt && .venv/bin/uvicorn app.main:app
```

Variáveis de ambiente (todas opcionais): `FOGO_DB`, `FOGO_CORS`, `FOGO_SIM`, `FOGO_RATE`, `API_PORT`, `WEB_PORT`, `VITE_API`. Veja a seção 11 da documentação.

## Testes
```bash
cd backend && .venv/bin/pip install -r requirements-dev.txt && .venv/bin/pytest -q && .venv/bin/ruff check .
cd frontend && npm ci && npx tsc --noEmit && npx eslint src && npx vitest run && npm run build
```

## Documentação
- **[Documentação completa (PDF)](docs/DOCUMENTACAO.pdf)** e a versão em Markdown, [`docs/DOCUMENTACAO.md`](docs/DOCUMENTACAO.md): arquitetura, modelo de dados, referência da API, módulo preditivo, frontend, testes e limitações.
- [`docs/CONTRATO_API.md`](docs/CONTRATO_API.md): contratos de resposta da API, passo a passo do que foi decidido.
- [`docs/RELATORIO.md`](docs/RELATORIO.md): relatório de validação (testes, desempenho, acessibilidade, bugs encontrados).
- [`docs/AUDITORIA.md`](docs/AUDITORIA.md): matriz requisito do desafio × implementação × evidência.
- [`docs/PESQUISA_DSIN.md`](docs/PESQUISA_DSIN.md): fontes públicas sobre a presença da DSIN.

## Estrutura do repositório
```
backend/      API FastAPI, simulador, módulo preditivo e testes (pytest)
frontend/     React + Vite + TypeScript (mapa, gráficos, testes vitest)
docs/         documentação (Markdown e PDF)
video/        vídeo de demonstração
docker-compose.yml, run.sh   formas de subir o projeto
```
