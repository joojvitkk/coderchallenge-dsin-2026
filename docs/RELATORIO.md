# Relatório — F.O.G.O.

> **Nota:** as capturas de tela citadas como evidência (`docs/evidencias/`) e os roteiros de trabalho (`GOAL`, `PROGRESSO`) não fazem parte deste repositório, que contém só o necessário para rodar e a documentação; o vídeo em `video/` mostra o sistema em uso.

Central de monitoramento de equipamentos e agentes de trânsito/segurança, no contexto do DSIN Coder Challenge (etapa bônus).
Este relatório só marca como verificado o que foi executado; cada item cita a evidência. Data da validação: 17/10/2026.
Observação: o checklist abaixo segue o escopo e o contrato da API (`docs/CONTRATO_API.md`).

## 1. Visão geral
Três partes numa única aplicação (FastAPI + SQLite no backend; React + Vite + TypeScript no frontend):
1. **Inventário** — CRUD de equipamentos (15 tipos, atributos específicos por tipo) e de agentes.
2. **Central de Operações** — dashboard em tempo real (SSE) com mapa, KPIs, filtros, alertas, manutenção e saúde por região/cidade/UF.
3. **Cidade Preditiva** — risco por local×hora com explicação, anomalias, manutenção preditiva, reforço de agentes, cenários what-if, lacunas de cobertura e um "Copilot" PROMETHEUS por regras (sem LLM externo).

O mapa é centrado em **Marília/SP** (sede da DSIN) com 10 bairros reais, 37 cidades reais no total e 200 equipamentos + 50 agentes **fictícios**.

## 2. Como rodar
- Docker: `docker compose up` (API em :8000, web em :5173).
- Sem Docker: `./run.sh` (cria `backend/.venv`, instala dependências, sobe API :8000 e web :5173).
- Variáveis: `FOGO_DB`, `FOGO_CORS`, `FOGO_SIM=0` (desliga o simulador). Detalhes no `README.md`.
- **Verificado**: `./run.sh` numa cópia limpa do repositório (sem `.venv`/`node_modules`), em portas alternativas: criou o venv, rodou `npm ci`, semeou o banco, `/api/health` -> `{"status":"ok"}`, web 200 e `/api/central/kpis` via proxy do Vite com 200 equipamentos.
- **Docker**: `docker compose config` OK; `docker build ./backend` OK; a imagem da API rodou em porta livre e ficou `healthy` (`/api/health` ok, `/api/central/kpis` com 200 equipamentos/50 agentes). **Não executado**: `docker compose up` completo (serviço `web`, `node:22-slim` + `npm ci`), porque as portas 8000 e 5173 da máquina estavam ocupadas por contêineres de outros projetos, que não foram derrubados.

## 3. Funcionalidade por parte
### Parte 1 — Inventário
- [x] Criar equipamento pelo navegador (câmera, atributos específicos Resolução/Leitura de placa/Visão noturna/PTZ gravados em `atributos`) — API confirmou o registro.
- [x] Editar (modelo e situação alterados) e excluir equipamento pelo navegador; contagem voltou a 200.
- [x] Criar, editar (status -> inativo) e excluir agente pelo navegador.
- [x] Validação: série duplicada -> mensagem "valor único já cadastrado" (409); formulário vazio bloqueado (`required`); erros 422 agora mostram "campo: mensagem".
- [x] Filtros combinados (tipo, situação, UF, cidade): contagem na tela igual à da API em 6 combinações (ex.: Marília+câmera+furtado = 1).
- [~] 15 tipos: `/api/tipos` devolve os 15 e o formulário é gerado do esquema; só o tipo câmera foi exercido no navegador (os demais por testes do esquema).
### Parte 2 — Central
- [x] Tempo real por SSE: indicador "Ao vivo · atualizado há 0s"; eventos `agente`, `telemetria`, `kpis`, `alerta` recebidos (ver 6).
- [x] Mapa com clusters (9 clusters, 55 marcadores no Brasil), KPIs, lista de alertas por severidade, lista de manutenção.
- [x] Botão "Injetar incidente": cria alerta (id mais recente subiu), aciona o agente mais próximo da UF; com filtro de bairro injeta no bairro (Fragata).
- [x] Seletor UF/cidade: PR -> 8 equipamentos, Maringá -> 2, iguais à API; mapa reenquadra.
- [x] Detalhe por clique ("ver no mapa" e clique direto no pino) abre o painel de detalhe.
- [x] Zoom persistente: após selecionar (zoom 16) o zoom continuou 16 após 18 s com o simulador rodando, e 16 s depois de clicar num pino.
- [~] Visão por região/cidade/UF: gráfico renderiza (screenshot); valores não conferidos um a um.
### Parte 3 — Preditiva
- [x] Slider de tempo (agora..+24h): funciona por teclado e por valor; cores das zonas mudam com o horizonte.
- [x] "Por que?": fatores com pontos (ex.: histórico do dia/hora +30, equipamentos degradados +5) e IC 95%.
- [x] What-if: chuva, evento no bairro e falha de equipamento retornam cobertura antes/depois e delta de risco.
- [x] Reforço (cobertura 35% -> 42% no Brasil; 97% -> 100% em Marília), manutenção preditiva e anomalias renderizam.
- [x] Copilot: "radares furtados em Garça daqui a 6 horas" -> tipos de radar + situação=furtado + cidade=Garça + +6h; "risco no Fragata daqui a 3 horas" -> bairro e horizonte.
- A **correção da qualidade das previsões** (calibração) não foi medida: os dados são sintéticos; só se verificou que os algoritmos rodam, são determinísticos e testados numericamente.

### Interface (redesign)
Direção "mapa protagonista" (docs/DESIGN_SPEC.md): na Central o mapa ocupa o cartão inteiro e os painéis (busca + chips, alertas/manutenção, saúde ou detalhe do item) flutuam sobre ele; KPIs em faixa bento com mini visuais; sidebar de ícones colapsável; no celular a sidebar vira barra inferior e os painéis viram bottom sheet. Inventário: tabela densa, ações no hover/foco, gaveta lateral para criar/editar. Preditiva: bento com mapa de risco + slider de tempo flutuante, "por que?", mapa de calor, manutenção, reforço/lacunas, what-if e anomalias, cada card com "prevê / dados usados / recomendação". Copilot virou paleta de comando (Ctrl/⌘+K). Screenshots: `docs/evidencias/redesign-{desktop,tablet,celular}-*.png`, `redesign-desktop-{central-detalhe,comando,gaveta}.png`, `redesign-celular-central-sheet.png`.

## 4. Diferenciais (PLAN.md)
Gêmeo digital com viagem no tempo; previsão explicável com IC; manutenção preditiva com OS sugerida; reforço otimizado (guloso, antes/depois); what-if; cobertura cega (lacunas); Copilot sem LLM; modo demonstração (injetar incidente); seletor UF/cidade com escopo em todas as APIs. Todos exercidos no navegador, exceto a camada de lacunas no mapa (círculos tracejados), vista só em screenshot.

## 5. Arquitetura
- Backend: `app/{main,db,models,schemas,crud,geo,seed}.py`, `routers/{equipamentos,agentes,central,demo,stream,previsao}`, `services/{kpis,alertas,telemetria,stream}`, `predict/{risco,anomalia,manutencao,reforco,cenarios,dados,comum}`, `simulator/sim.py` (tarefa de fundo, tick de 2 s, publica no barramento SSE).
- Um `CRUD` genérico atende equipamentos e agentes; o esquema por tipo (`TIPOS`) valida e alimenta o formulário dinâmico via `/api/tipos`.
- Algoritmos preditivos em numpy/pandas puros, lendo DataFrames de um adaptador SQL (`predict/dados.py`).
- Frontend: 3 páginas carregadas sob demanda (lazy), `Mapa`, `Filtros`, `FormularioDinamico`, `useStream` reutilizados; TanStack Query; tema por tokens CSS.

## 6. Desempenho (medido nesta máquina, 16 núcleos, banco com ~76 mil leituras e ~24,7 mil eventos)
| Endpoint | frio | quente (mediana de 10) |
|---|---|---|
| risco (uf) | 414 ms | 59 ms |
| anomalias | 538 ms | 217 ms |
| manutencao-preditiva | 518 ms | 221 ms |
| reforco | 574 ms | 253 ms |
| cenario (chuva) | 845 ms | 526 ms |
| central/kpis, equipamentos, alertas | 5–15 ms | — |
- **Gargalo achado e corrigido**: a página Preditiva dispara 5 previsões em paralelo e cada uma relia toda a telemetria; as 5 juntas levavam **~10,2 s**. Com cache de 5 s por escopo (com trava) levam **1,9 s**.
- SSE: com 1, 50 e 200 clientes simultâneos por 20 s, cada cliente recebeu ~9–10 ciclos de `agente`/`telemetria`/`kpis` (tick de 2 s) e ~140–154 KB; `/api/central/kpis` durante a carga: mediana ~14 ms, p95 ~18 ms, máx. 94 ms (200 clientes).

## 7. Acessibilidade e responsividade
- Sem rolagem horizontal em 390, 768 e 1440 px nas 3 páginas (`scrollWidth <= clientWidth`), após duas correções (ver 9).
- axe-core 4.x (WCAG 2.0/2.1/2.2 A+AA + boas práticas): Preditiva 0 violações; Inventário 0; Central 1 (`target-size`: marcadores de agentes sobrepostos no mapa; **não corrigido**).
- Contraste AA medido pelo axe: após escurecer `--ok` (#166534) e `--alerta` (#92400e) não restam violações de `color-contrast`.
- Teclado: ordem de Tab lógica (skip-link, navegação, seletor, ações, filtros); "Ir para o conteúdo" leva o foco a `main`; Enter abre o formulário; slider operável por setas; foco visível. **Não verificado**: leitor de tela real, tema escuro (não existe), zoom 200%.
- Screenshots em `docs/evidencias/` (desktop-*, tablet-*, celular-*, val-*, inventario-form-desktop).

## 8. Qualidade
Revisão final (17/10/2026), saídas reais:
- Backend: `pytest -q` -> **99 passed** (era 86); `ruff check .` -> All checks passed; `vulture` -> exit 0 (também limpo com `--min-confidence 60` salvo rotas/campos do framework).
- Frontend: `tsc --noEmit` ok; `eslint src` ok; `vitest run` -> **7 arquivos, 46 testes passed** (era 5 / 30); `npm run build` ok (maior chunk: mapa 408 kB, gráficos 365 kB; index 316 kB; sem aviso). `knip` (código não usado): limpo após remover 5 exports e 10 `export` de tipos desnecessários; `jscpd` (duplicação, mín. 3 linhas/35 tokens): 0 clones.
- **Cobertura real** (pytest-cov / vitest --coverage com `include: src/**`): backend **99 %** das instruções (1.558 instruções, 22 sem cobrir); frontend **88,8 % das linhas**, 83,4 % das instruções, 73,9 % dos ramos, 77,8 % das funções (antes, medida só nos arquivos importados pelos testes: 38,5 % das linhas quando se contam todos os arquivos).
- Tempo da suíte backend: 38 s -> 10-20 s (o banco semeado é criado uma vez por duração e cada teste recebe uma cópia em memória via `sqlite3.backup`; variação conforme a carga da máquina). Frontend: ~3 s.
- Linhas (`wc -l`): backend app 2.331 -> 2.494; simulador 255 -> 255; testes backend 905 -> 1.131; frontend src (ts/tsx/css, incluindo testes e fixtures) 3.293 -> 3.720. O código de produção cresceu por funcionalidades da revisão (mapa de calor, limite de escrita, endurecimento da importação, mensagem de banco antigo); não foi encontrada duplicação a remover (0 clones), então a redução ficou em constantes únicas (`TZ_BR`), `useCamadas` extraído do componente Central e `importar` dividido em `_ler_corpo`/`_validar`.
- Correções de correção/segurança: importação com limite de 5 MB lido em fluxo (413 sem carregar tudo), máx. 5.000 linhas, relatório limitado a 200 erros, GeoJSON malformado -> 422 (antes 500), CSV com neutralização de injeção de fórmula (`=`, `+`, `-`, `@`) na exportação e restauração na importação, transação única; despacho recusa agente já ocupado (409); limite de escrita por IP (120/min, `FOGO_RATE`, 429); `divIcon` do mapa escapa cor/classe (texto de usuário nunca vira HTML; tooltips são texto React); banco de versão anterior falha com instrução clara em vez de erro SQL; `ResourceWarning` de conexões não fechadas nos testes eliminado.
- Defeitos visuais corrigidos pelos screenshots (1440/1000/820/390): rótulos das abas "Alertas 50" quebrando em duas linhas; botões da barra do mapa escondidos atrás dos painéis laterais; legenda de risco sobre os controles de zoom no celular; saúde "80 %" marcada como Atenção (arredondamento; agora trunca).
- Docker (cópia limpa extraída do zip, `API_PORT=18960 WEB_PORT=15960 docker compose up -d --build`): imagem da API construída, healthcheck "healthy", web respondendo e proxy `/api` ok; `./run.sh` (portas 18950/15950) subiu de primeira numa cópia limpa e os testes passaram nela (99 backend, 46 frontend).
- Console do navegador: 0 erros (1 aviso do canvas do leaflet.heat, `willReadFrequently`, da biblioteca). Zoom do mapa persistente: 4 -> 6 pelos botões e 6 após 20 s com o simulador rodando.

## 9. Bugs encontrados na validação e correções
1. **Docker: API não subia** (`unable to open database file`): `/data` não existia na imagem. Fix: `RUN mkdir -p /data` no Dockerfile. Verificado com `docker run` -> healthy.
2. **Criar agente falhava** na UI: lat/lon eram opcionais no formulário, mas obrigatórios na API (422 com JSON cru). Fix: campos obrigatórios + `api()` formata erros 422 como "campo: mensagem". Teste atualizado (`Inventario.test.tsx`, `lib.test.ts`).
3. **Erro de JS `_leaflet_pos`** ao filtrar/limpar rápido: o timer de animação de zoom do Leaflet disparava após o mapa ser desmontado. Fix: `fitBounds(..., { animate: false })`; teste de regressão em `Mapa.test.tsx`. Console limpo em 3 repetições.
4. **Previsões lentas em paralelo** (10 s): cache TTL de 5 s com trava em `predict/dados.py::carregar_cache` (devolve cópias). Teste `test_carregar_cache_reusa_e_isola_copias`.
5. **`/previsao/anomalias` 500** em escopo sem leituras suficientes (ex.: Garça/SP): `KeyError: z_ewma` porque a coluna `anomalo` vazia era `object`. Fix: `astype(bool)`; teste falha sem o fix e passa com ele.
6. **What-if reexecutado com escopo antigo** (422 ao trocar cidade depois de simular): `Cenarios` agora é reiniciado quando o escopo muda.
7. **Rolagem horizontal** no celular (seletor de cidade com 419 px) e em todos os tamanhos no Inventário (elemento `.sr` absoluto escapava do `overflow` da tabela). Fix de CSS.
8. **Acessibilidade**: `role=tablist` continha um botão que não é aba (axe crítico) -> botão movido para fora; contraste 4,38:1 -> escurecidas as cores `--ok`/`--alerta`; `main` ganhou `tabIndex=-1` para o skip-link.

## 10. Autoria e uso de IA
**Autor e responsável: @joojvitkk**, que definiu o escopo e todas as regras de negócio e de previsão, revisou todo o código e aprovou cada parte. Desenvolvimento com **Claude Code** orquestrando agentes com papéis separados (um por diretório, contrato em `docs/PLAN.md`): arquiteto-backend (modelos, CRUD, seed, simulador, SSE, central), preditivo (pacote `predict/`), frontend (páginas, mapa, filtros), revisor (lint, duplicação, contrato vs. código), geo-tema (geografia real, cidade/UF, tema visual) e validador (este relatório e as correções da seção 9). O produto em si **não chama nenhuma IA externa**: o "Copilot" é regex/regras.

### Como explicar cada módulo (para a banca; o autor deve conseguir refazer isto ao vivo)
- **Modelo de dados/CRUD**: uma tabela de equipamento com `atributos` JSON validado por um esquema pydantic por tipo; um router genérico evita repetir CRUD. Pergunta provável: "por que JSON e não uma tabela por tipo?" — 15 tipos com poucos campos, mudança de tipo sem migração; custo: sem índice nos atributos.
- **Simulador/SSE**: tarefa assíncrona a cada 2 s move agentes, grava telemetria e publica num barramento em memória; cada cliente SSE tem uma fila. Limite: um único processo.
- **Central**: KPIs e alertas vêm de consultas simples; o SSE atualiza os caches do TanStack Query. O mapa só reenquadra quando muda o conjunto/escopo — por isso o zoom persiste.
- **Risco**: contagem histórica de eventos por bairro/dia da semana/hora + fatores (equipamentos degradados, tendência), IC por piso de Poisson; cada ponto devolve seus fatores (é o "por que?").
- **Anomalias/manutenção**: EWMA + z-score robusto (MAD) sobre a telemetria; probabilidade de falha em 7 dias a partir da deriva.
- **Reforço/lacunas**: heurística gulosa (distância × déficit de cobertura), cada agente se move uma vez, até 60 km; lacunas = pontos sem equipamento/agente num raio.
- **What-if**: recalcula risco/cobertura com a mudança aplicada e compara com a base.
- **Copilot**: regras em `lib/copilot.ts` que traduzem português em filtros + horizonte.

## 11. Limitações e dados simulados
- **Todos os equipamentos, agentes, eventos e telemetria são fictícios** (semente fixa; selo e rodapé na UI).
- **Só SP, PR e MT têm respaldo público de presença da DSIN** (Marília, Indaiatuba, Olímpia/SP; Maringá, Londrina, Toledo/PR; Várzea Grande/MT — `docs/PESQUISA_DSIN.md`). As outras cidades (AM, BA, CE, DF…) são simulação de demonstração, sem alegar clientes. Há indício, não confirmado, de um 4º estado.
- Coordenadas de bairros de Marília são aproximadas, não conferidas em mapa oficial.
- Previsões sobre dados sintéticos: não há validação contra a realidade.
- A tabela de telemetria cresce sem limite (~2 linhas/s observadas em ~30 min de execução); sem política de retenção, as previsões ficarão mais lentas com os dias. Cache de 5 s é por processo.
- Um único processo/SQLite; sem autenticação.
- Mapa depende de rede (tiles OSM). No celular a lista de alertas é longa (sem limite de altura).
- Aviso do starlette sobre `httpx` (deprecação) nos testes.
- Marcadores de agentes sobrepostos ainda falham o critério `target-size` do axe.

## 12. Não verificado
leitor de tela; zoom 200%; celular físico (só viewport 390 px emulado); formulários dos 14 tipos além de câmera; correção estatística das previsões; comportamento com dias de execução contínua.

## 13. Próximos passos
Retenção/agregação da telemetria; WAL no SQLite e fila de escrita; calibrar previsões com dados reais anonimizados; fechar a lista de clientes via PNCP; testes E2E automatizados (os scripts de validação usaram Playwright e podem virar suíte); agrupar marcadores de agentes no mapa; tema escuro.

## 14. Matriz de requisitos e diferenciais (rodada "campeão")
A matriz completa P1.1-P3.7 -> implementação -> evidência está em docs/AUDITORIA.md (todos os itens atendidos e verificados; lacunas encontradas e corrigidas listadas ali).

Diferenciais: (1) **backtesting** (`/previsao/backtest`): treino até D-7, comparado aos 7 dias seguintes; nos dados sintéticos: 4 de 5 bairros mais perigosos previstos (acaso 0,53), correlação de postos 0,89, 59 % das horas do top 20 % tiveram ocorrência (33 % em geral), manutenção com precisão top-10 de 100 % (taxa-base 8 %) e erro médio 4 % contra 15 % de quem chuta a média; (2) alertas com status, SLA e despacho com ETA, agente em movimento, auditoria; (3) briefing por regras, imprimível; (4) replay 24 h; (5) import/export com relatório de erros; (6) ViaCEP offline-safe; (7) modo apresentação e tema escuro; (8) latência evento→tela (medida 42-97 ms na máquina de teste).

Limitações honestas: os dados são sintéticos, então o backtest mostra que o método recupera a estrutura embutida na simulação, não desempenho em campo; o tempo do despacho no mapa é comprimido (o ETA mostrado é o realista, 40 km/h); a latência assume relógios de servidor e navegador sincronizados (mesma máquina).


## 15. Mapa de calor geográfico
- `GET /api/central/calor?modo=alertas|indisponibilidade|cobertura&horas=24` (+ `cidade`, `uf` e filtros de equipamento; `raio_km` na cobertura) -> `{modo, preve, dados_usados, recomendacao, pontos[{lat,lon,peso}], focos[5]}`. Alertas: peso = severidade; indisponibilidade: equipamentos em mau funcionamento/manutenção/furtados; cobertura: lacunas sem equipamento nem agente num raio.
- `<Mapa>` ganhou `calor`/`camada` (`pinos`, `calor`, `ambos`) com `leaflet.heat@0.2.0` carregado sob demanda; raio por zoom (`raioPorZoom`), intensidade relativa ao maior foco (Central) ou teto fixo (risco previsto). A camada só redesenha: nunca entra no cálculo de enquadramento (teste prova que fitBounds não roda ao mudar pesos ou camada).
- Central: painel "Mapa de calor" com camadas, modos, escala baixo->alto, "o que mostra", maiores focos em texto (alternativa acessível), dados usados e como ajuda a decidir; atualiza com o SSE de alertas. Preditiva: calor do risco previsto acompanha o slider de horizonte.
- Evidências: `docs/evidencias/calor-*.png`. Testes: `test_calor_por_modo_respeita_escopo_e_filtros`, `lib/calor.test.ts`, Mapa (camada falsa) e Central (liga, troca modo, focos).
- Não verificado: o desenho real do canvas só foi visto em screenshots (jsdom não tem canvas); desempenho com dezenas de milhares de pontos (limite de 5.000 por consulta).
