# CONTRATO DA API — F.O.G.O.

> **Nota:** as capturas de tela citadas como evidência (`docs/evidencias/`) e os roteiros de trabalho (`GOAL`, `PROGRESSO`) não fazem parte deste repositório, que contém só o necessário para rodar e a documentação; o vídeo em `video/` mostra o sistema em uso.

## Stack
- Backend: Python 3.12+, FastAPI, SQLModel + SQLite, SSE (`/api/stream`), pytest, ruff. Preditivo em numpy/pandas puro (sem serviços externos, sem API key).
- Frontend: React + Vite + TypeScript, react-leaflet (OSM), Recharts, TanStack Query. Sem biblioteca de UI pesada.
- Geografia (docs/PESQUISA_DSIN.md): **Marília/SP é o ponto central e a maior densidade** (10 bairros reais: Centro, Palmital, Santa Antonieta, Fragata, Cascata, Nova Marília, Somenzari, Alto Cafezal, Jardim Itaipu, Jardim Maria Izabel, em 5 regiões "Marília Centro/Norte/Sul/Leste/Oeste"), cidades da região de Marília e 37 cidades reais (poucos equipamentos cada) espalhadas pelo Brasil. Presença da DSIN respaldada por fontes públicas só em Marília, Indaiatuba, Olímpia (SP), Maringá, Londrina, Toledo (PR) e Várzea Grande (MT) (`geo.CONFIRMADAS`); o resto é simulação de demonstração. **Todos os equipamentos e agentes são fictícios** (selo "Dados simulados" e aviso fixo na UI). Fora de Marília o "bairro" é o centro da cidade, chamado `Centro de <cidade>`.

## Estrutura
```
fogo/
  backend/app/{main.py,models.py,schemas.py,db.py,seed.py,
               routers/{equipamentos,agentes,central,previsao}.py,
               services/{telemetria.py,alertas.py,kpis.py},
               predict/{risco.py,anomalia.py,manutencao.py,reforco.py,cenarios.py}}
  backend/simulator/sim.py      # gera telemetria/posição + histórico sintético (semente fixa)
  backend/tests/
  frontend/src/{api/,components/,pages/{Inventario,Central,Preditiva}/,hooks/}
  docs/ (documentação)
  docker-compose.yml  run.sh  README.md
```

## Modelo de dados (uma tabela base + atributos flexíveis)
- `Equipamento`: id, tipo(enum), serie(unique), marca, modelo, orgao, cep, bairro, regiao, **cidade, uf**, rua, referencia, lat, lon, situacao(enum: nao_instalado, operacional, mau_funcionamento, em_manutencao, desativado, furtado), manutencao_tipo(imediata|agendada|nenhuma), proxima_manutencao(date|null), atributos(JSON validado por esquema do tipo).
- `Agente`: id, nome, matricula(unique), categoria(transito|guarda|policia), orgao, status(ativo|inativo|em_ocorrencia), **cidade, uf**, lat, lon, atualizado_em.
- `Telemetria`: id, equipamento_id, ts, metricas(JSON: latencia_ms, temperatura, taxa_erro, bateria…), situacao.
- `Evento`: id, ts, bairro, tipo(falha|ocorrencia|alerta), severidade(1-4), equipamento_id?
- Esquemas por tipo em `schemas.py` (registro `TIPOS = {tipo: ModeloAtributos}`) — um único lugar define campos específicos e valida; frontend lê `/api/tipos` para gerar formulário dinâmico (zero formulário por tipo hardcoded).

## API (contrato)
- `GET/POST /api/equipamentos`, `GET/PUT/DELETE /api/equipamentos/{id}`; filtros: tipo, situacao, bairro, regiao, orgao, q, precisa_manutencao.
- `GET/POST /api/agentes`, `GET/PUT/DELETE /api/agentes/{id}`.
- `GET /api/tipos` → esquema JSON dos atributos por tipo (para o form dinâmico).
- `GET /api/central/kpis`, `/api/central/regioes` (saúde por região), `/api/central/alertas`, `/api/central/manutencao`.
- `GET /api/stream` (SSE): eventos `telemetria`, `agente`, `alerta`, `kpis`.
- `GET /api/previsao/risco?horas=24` (matriz bairro×hora com score 0-100 e fatores), `/anomalias`, `/manutencao-preditiva`, `/reforco?horas=6`, `/cenario?bairro=&evento=` (simulação what-if).
- `GET /api/health`. Erros padronizados `{detail}`; paginação `limit/offset`.

## Diferenciais (inovação)
1. **Gêmeo digital com viagem no tempo**: slider no mapa (agora → +24h) que recolore bairros pelo risco previsto e mostra onde reforçar.
2. **Previsão explicável**: cada score vem com fatores (ex.: "+18 histórico sexta 18h, +12 3 equipamentos degradados") e intervalo de confiança; painel "por que?".
3. **Manutenção preditiva**: estima probabilidade de falha em 7 dias por equipamento (deriva de latência/erro/temperatura via EWMA + tendência), gera ordem de serviço sugerida priorizada.
4. **Reforço otimizado**: recomenda realocação de agentes (guloso por distância × déficit de cobertura) e mostra ganho de cobertura antes/depois.
5. **Cenários what-if**: "e se a câmera X falhar / chover / evento no bairro Y?" recalcula risco e cobertura.
6. **Cobertura cega**: detecta áreas sem equipamento operacional ou agente em raio R (lacunas) e as plota.
7. **Copilot PROMETHEUS sem LLM externo**: caixa de comandos em português (regras/regex) — "mostre radares furtados no Centro" aplica filtros; opcional, barato.
8. Modo demonstração: botão "injetar incidente" para a banca ver alertas e previsões reagirem ao vivo.

## Qualidade e enxugamento
- Um `CRUDRouter` genérico reutilizado por equipamentos e agentes.
- Uma função `filtrar(query, params)` compartilhada por API e Copilot.
- Frontend: um `useStream` hook, um `<Filtros/>`, um `<Mapa/>` reutilizados nas 3 páginas; formulário gerado pelo esquema.
- Lint: ruff + vulture (backend), tsc strict + eslint (frontend). Limite de função ~40 linhas.

## Papéis dos agentes
1. **arquiteto-backend**: models, CRUD, seed, simulador, SSE, central.
2. **preditivo**: pacote `predict/` + testes numéricos + endpoint de previsão.
3. **frontend**: 3 páginas, mapa, filtros, time-travel.
4. **revisor-qualidade** (loop): lint, testes, duplicação, linhas, contrato vs. implementação; devolve lista de correções.
5. **validador-e2e**: sobe tudo, exerce a API e a UI (browser), mede, coleta evidências para o relatório.
6. **relator**: gera `docs/RELATORIO.md` a partir de evidências reais.

## Formatos de resposta (adendo — alinhado ao backend implementado; frontend consome exatamente isto)
- Listas (`/equipamentos`, `/agentes`, `/central/manutencao`): array puro; total em header `X-Total-Count`; `limit` máx. 500; parâmetros desconhecidos dão 422 (`extra=forbid`).
- `/api/tipos` → `{tipo: {rotulo, schema}}` (schema = pydantic JSON Schema; campos string/integer/number/boolean/enum/date/array de string/object).
- `/central/kpis` → `{equipamentos_total, por_situacao, disponibilidade_pct, agentes_total, agentes_ativos, agentes_em_ocorrencia, alertas_criticos, manutencao_imediata, manutencao_agendada_7d}`.
- `/central/regioes` (ver "Contrato geo-tema": campo `nome`, `?por=`) → `[{regiao, bairros, por_situacao, agentes_ativos, alertas_criticos, equipamentos, disponibilidade_pct, saude}]`.
- `/central/alertas` → `[{id, ts, bairro, regiao, tipo, severidade, equipamento_id, equipamento:{serie,tipo}|null, lat, lon}]`.
- SSE: `telemetria` `{equipamento_id, situacao, ts, metricas}`; `agente` **lista** de Agente; `alerta` Alerta; `kpis` Kpis.
- `POST /api/demo/incidente` `{bairro}` (bairro obrigatório sem equipamento_id) → `{alerta, agente_acionado}`.
- `/previsao/*` → envelope `{preve, dados_usados, recomendacao, ...}`: risco `matriz{bairro:[{h,ts,score,ic_inf,ic_sup,fatores[{fator,pontos}]}]}` (h=0..N; h=0 é "agora", hora cheia corrente); anomalias `anomalias[]`; manutencao-preditiva `ordens[]`; reforco `plano{movimentos,cobertura_antes,cobertura_depois}` + `lacunas[{lat,lon,bairro}]` (coberturas em 0-1); cenario `?evento=chuva|evento_bairro|falha_equipamento&bairro=&equipamento_id=`.
- Copilot em português é interpretado no frontend (`lib/copilot.ts`); só gera filtros/horizonte.

## Contratos adicionais (backend)
- Listagens `GET /api/equipamentos|agentes`: corpo = lista; total no header `X-Total-Count`. Query desconhecida -> 422. `PUT` substitui o recurso inteiro (mesmo corpo do POST). Série/matrícula duplicada -> 409.
- `GET /api/central/alertas?horas=24&sev_min=3&limit=50` -> lista `{id, ts, bairro, regiao, tipo, severidade, equipamento_id, equipamento:{serie,tipo}|null, lat, lon}`.
- `GET /api/central/manutencao` aceita os filtros de equipamentos; devolve equipamentos (imediatas primeiro, depois por data).
- `GET /api/tipos` -> `{tipo: {rotulo, schema(JSON Schema dos atributos)}}`; 15 tipos.
- SSE `/api/stream` (comentário inicial `: conectado`, heartbeat `: hb` a cada 15s). Eventos (data = JSON): `agente` = lista de agentes completos (a cada ~2s); `telemetria` = lista `{equipamento_id, ts, metricas, situacao}`; `alerta` = um alerta (mesmo formato de /central/alertas); `kpis` = mesmo corpo de /central/kpis.
- `POST /api/demo/incidente` body `{bairro? | equipamento_id?, tipo=ocorrencia|falha|alerta, severidade=1..4}` -> 201 `{alerta, agente_acionado}`; falha em equipamento o torna `mau_funcionamento` com manutenção imediata e aciona o agente ativo mais próximo.

## Contrato geo-tema (cidade/UF)
- Escopo `?cidade=&uf=` (opcional, combinável) em `/central/{kpis,regioes,alertas,manutencao}`, `/previsao/*`, `/equipamentos` e `/agentes`; escopo sem equipamentos em `/previsao/*` -> 404.
- `GET /api/central/regioes?por=regiao|cidade|uf` -> `[{nome, bairros, por_situacao, agentes_ativos, alertas_criticos, equipamentos, disponibilidade_pct, saude}]` (o campo `regiao` virou `nome`).
- `GET /api/central/cidades` -> `[{cidade, uf, regiao, lat, lon, dsin}]` (`dsin` = presença respaldada por fonte pública).
- Alerta ganha `cidade` e `uf`. `GET /api/previsao/risco?agrupar=bairro|cidade|uf` (média dos bairros do grupo; a chave `matriz` passa a ser o grupo).
- Demo: o incidente aciona o agente ativo mais próximo **da mesma UF** (pode vir `agente_acionado: null`). Reforço: cada agente é movido no máximo uma vez e até 60 km; lacunas calculadas cidade a cidade.
- Seed: 200 equipamentos (>= 1 por bairro/cidade; ~58% em Marília) e 50 agentes; histórico de 90 dias determinístico (semente fixa).
- Frontend: seletor UF/cidade no topo (padrão Brasil; mapa reenquadra), tema claro por tokens CSS, ícones lucide, skeletons/estados, `Mapa` só reenquadra quando o conjunto ou o escopo mudam (nunca por agentes em movimento) e para de reenquadrar depois que o usuário mexe no mapa.

## Contrato campeão (adendo)
- Alerta (`Evento`): `status` aberto|reconhecido|em_atendimento|resolvido, `ocorrencias` (repetições agrupadas do mesmo equipamento em 6 h), `inicio`, `agente_id`, `reconhecido_em`, `resolvido_em`; serialização acrescenta `sla_prazo` (15/30/120/480 min por severidade 4..1) e `sla_estourado`.
- `GET /api/central/alertas?status=abertos|todos|<status>&sev_min=1` (padrão: abertos, mais graves primeiro). `POST /api/central/alertas/{id}/reconhecer|resolver`; `POST .../despachar?agente_id=` -> `{alerta, agente, distancia_km, eta_min}` (ETA = km x 1,3 / 40 km/h; o simulador move o agente até o local e o alerta passa a em_atendimento). `POST /api/demo/incidente` agora também despacha e devolve `eta_min`.
- `GET /api/central/replay?horas=24` (cronológico), `GET /api/central/briefing` (situação, 3 riscos em 6 h, ações; por regras).
- KPIs: `alertas_criticos` (sev 4 abertos 24 h), `alertas_abertos`, `alertas_sla_estourado`. Regiões: `estado` normal|atencao|critico.
- `GET /api/previsao/backtest?dias=7` (risco: top-5 bairros, correlação, ocorrência no top 20 %, erro em p.p.; manutenção: precisão/recall top-K, AUC, erro médio vs. baseline), `GET /api/previsao/tendencias`. Manutenção preditiva: `sinal`, `em_falha`.
- `GET /api/auditoria`, `GET /api/equipamentos/{id}/linha-do-tempo`; `GET /api/equipamentos/exportar?formato=csv|geojson`, `POST /api/equipamentos/importar?formato=&simular=`.
- SSE: cada quadro traz `id: <epoch ms de emissão>` (latência evento->tela no cliente).

## Contrato mapa de calor e revisão final (adendo)
- `GET /api/central/calor?modo=alertas|indisponibilidade|cobertura&horas=24&raio_km=` (+ `cidade`, `uf`, filtros de equipamento para `indisponibilidade`) -> `{modo, preve, dados_usados{pontos,registros,referencia}, recomendacao, pontos[{lat,lon,peso}], focos[{local,peso}]}` (até 5.000 registros, pesos somados por posição com 4 casas; `cobertura` sem equipamentos no escopo -> 404).
- Frontend: `<Mapa calor camada tetoCalor>`; `camada` = pinos|calor|ambos; Preditiva usa o risco do horizonte do slider (teto 80).
- Importação: corpo <= 5 MB (413), <= 5.000 linhas (413), relatório <= 200 erros (`erros_truncados`), tudo-ou-nada. Escrita (POST/PUT/DELETE) limitada por IP: `FOGO_RATE` (padrão 120/min, 0 desliga) -> 429.
