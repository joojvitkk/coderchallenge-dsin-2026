# AUDITORIA — requisitos do desafio x implementação x evidência

> **Nota:** as capturas de tela citadas como evidência (`docs/evidencias/`) e os roteiros de trabalho (`GOAL`, `PROGRESSO`) não fazem parte deste repositório, que contém só o necessário para rodar e a documentação; o vídeo em `video/` mostra o sistema em uso.

Legenda de evidência: **T** = teste automatizado (pytest/vitest), **N** = verificado no navegador (Chrome, API+Vite próprios, banco temporário), **C** = curl/API, **S** = screenshot em docs/evidencias/. Data: 17/10/2026.

## Parte 1 — Inventário
| Item | Implementação | Evidência |
|---|---|---|
| P1.1 tipos | 15 tipos em `backend/app/schemas.py` (`TIPOS`): radar velocidade, semáforo, **conversão/retorno proibido** (`conversao_proibida: esquerda/direita/retorno`), câmera, **balança**, **veículo autônomo de fiscalização**, cancela, táxi, mototáxi, escolar, **totem**, patinete, moto de agente, viatura GM/PM, outro. O formulário lê `/api/tipos` | T `test_tipos_cobrem_enunciado`; N select "Tipo" do formulário; S inventario-importar-exportar |
| P1.2 série/marca/modelo | `EquipamentoBase` (série única -> 409) | T `test_serie_duplicada_409`, `test_crud_equipamento` |
| P1.3 localização | CEP validado (`^\d{5}-?\d{3}$` no backend e `pattern` no formulário), bairro, cidade/UF, rua, **referência livre** (dica: "nº 181, oposto ao 181, KM 203, S/N, em frente ao Mercado do Tio"), lat/lon. **Novo:** autopreenchimento ViaCEP com fallback silencioso (`lib/cep.ts`) | T `test_validacoes_gerais`, `campeao.test.ts` (offline/erro/CEP inexistente devolvem null); N formulário |
| P1.4 situação | 6 situações (enum) | T `test_kpis_batem_com_banco`; N chips de situação |
| P1.5 manutenção | `manutencao_tipo` imediata/agendada/nenhuma + `proxima_manutencao` (agendada exige data) | T `test_validacoes_gerais` |
| P1.6 campos por tipo | esquema por tipo validado (câmera: resolução, visão noturna, leitura de placa, PTZ; radar: velocidade da via, modo, semáforo…) | T `test_validacao_por_tipo`; N formulário dinâmico |
| P1.7 agentes | CRUD de agentes (trânsito/guarda/polícia), no mapa e nos KPIs | T `test_crud_agente`; N aba Agentes |
| (extra) import/export | `/api/equipamentos/exportar` (CSV/GeoJSON) e `/importar` (valida linha a linha, relatório de erros, tudo ou nada) | T `test_exportar_e_importar_csv_com_relatorio_de_erros`, `test_geojson_ida_e_volta` |
| (extra) auditoria | tabela `auditoria` (criado/alterado com diff/excluído/importado) + `/api/auditoria` + linha do tempo por equipamento | T `test_auditoria_de_cadastro_e_linha_do_tempo` |

## Parte 2 — Central
| Item | Implementação | Evidência |
|---|---|---|
| P2.1 dashboard + mapa | Central: KPIs + mapa com equipamentos, agentes, alertas graves e rotas de despacho | N; S tour-central |
| P2.2 ícone por tipo | `Icone` (lucide) por tipo nos pinos SVG, lista e legenda; 15 tipos mapeados | N; T `lib.test.ts` (`icone`) |
| P2.3 situação simples | cor + ícone + texto (pílula) para as 6 situações; legenda | N; axe sem violações de contraste (claro e escuro) |
| P2.4 indicadores | total, por situação, disponibilidade %, alertas críticos/abertos/fora do SLA, manutenção imediata/7d, **agentes em atividade** (patrulha + ocorrência) | T `test_kpis_batem_com_banco`; C `/api/central/kpis` |
| P2.5 filtros | tipo, situação, bairro, região, **órgão responsável**, busca, "precisa manutenção" (`Filtros.tsx`) | N "Mais filtros"; T `test_filtros_e_paginacao` |
| P2.6 manutenção imediata **ou próxima** | aba Manutenção em 3 grupos (imediata / próxima da data: <= 7 dias ou atrasada / mais adiante) com "em 3 dias"/"atrasada há 2 dias"; no mapa anel pulsante (imediata) e tracejado (próxima) | T `campeao.test.ts` (`urgenciaManut`); N; legenda do mapa |
| P2.7 alertas críticos | severidade 1-4 (Baixa..Crítica) com cor+texto, mais graves primeiro, SLA, KPI de críticos, pino pulsante no mapa | T `test_alertas_e_manutencao` (4 níveis, críticos < 20%); C replay 24h: sev 1=343, 2=218, 3=127, 4=71 |
| P2.8 detalhes pelo mapa | clique em equipamento, **agente** (novo) ou alerta abre o painel de detalhe (equipamento com histórico/auditoria) | N |
| P2.9 visão consolidada | painel Saúde por região/cidade/UF com estado **Normal / Atenção / Crítico** (saúde >= 80 / >= 60 / abaixo) e resumo "N operam normalmente · M exigem atenção" | T `test_regioes_trazem_estado_normal_atencao_critico`; S replay-24h |
| P2.10 tempo real | SSE (agentes e telemetria a cada 1 s, alertas por evento). **Latência medida e visível** ("evento→tela 42 ms (p95 90)", `id` do quadro SSE = epoch ms de emissão) | T `test_sse_entrega_eventos_publicados`, `useStream.test.ts`; N 42–97 ms |

## Parte 3 — Preditiva
| Item | Implementação | Evidência |
|---|---|---|
| P3.1 regiões/dias/horários | `/previsao/risco`: bairro x hora (24 h), com sazonalidade dia-da-semana x hora (8 semanas) | T `test_predict_*`; N heatmap |
| P3.2 reforço | `/previsao/reforco`: realocação gulosa, cobertura antes/depois, lacunas | T `test_predict_reforco_cenarios.py` |
| P3.3 anomalias | EWMA + z-score robusto (MAD) | T `test_predict_anomalia_manutencao.py` |
| P3.4 tendências | **novo** `/previsao/tendencias`: disponibilidade e utilização diárias (30 d) + projeção de 7 dias com faixa de incerteza e tipos em queda | T `test_endpoints_de_previsao_novos`; N card "Tendência…" |
| P3.5 índices de risco | score 0-100 com nível Baixo/Moderado/Alto/Crítico por bairro/cidade/UF e hora | N |
| P3.6 alertas preventivos | manutenção preditiva (OS preventivas), recomendações em todo card, briefing | T `test_probabilidade_de_falha_calibrada_e_nao_saturada`, `test_briefing_*` |
| P3.7 clareza | **todo** card traz "Prevê", "Como ajuda a decidir" e "Dados usados" (inclusive Por que?, visão geral e heatmap, que antes não tinham) | N |

## Lacunas encontradas e corrigidas
1. Severidade saturada: todo alerta ao vivo era "Crítica" (equipamento degradado re-alertava a cada leitura). Agora: degradação por equipamento com rampa, alerta só quando um equipamento *cadastrado como operacional* piora, **agrupamento** de repetições (×N) e eventos de fundo com a distribuição 45/30/17/8 %.
2. Probabilidade de falha 100 %: sigmoide sobre o log do sinal, calibrada no backtest D-14→D-7, limites 1–97 %; quem já falhou é marcado `em_falha` e vai ao fim; ordenação pelo sinal bruto.
3. "Por que AM?": visão geral por padrão.
4. Heatmap com zeros fora de Marília: histórico das cidades 2x mais denso e janela de 8 semanas.
5. axe: `target-size` (marcadores de agentes/alertas sobrepostos) -> fora da ordem de Tab (existe lista equivalente) e `scrollable-region-focusable` -> regiões roláveis focáveis. Resultado: 0 violações em Central, Preditiva, Inventário e Briefing (claro e escuro).
6. Retenção: leituras > 7 dias agregadas por equipamento em baldes de 6 h (`services/telemetria.compactar`); gravação ao vivo no máx. 1 leitura/10 min por equipamento. Índices: `evento(bairro, ts)`, `telemetria(equipamento_id, ts)`, `auditoria(entidade, entidade_id, ts)`.
7. Bug latente: o SSE `telemetria` é uma *lista* e o front tratava como objeto (métricas ao vivo nunca apareciam). Corrigido.
8. Horário: timestamps UTC eram lidos como hora local no navegador e os perfis horários usavam UTC; agora `utc()` no front e hora de Brasília (UTC-3) no simulador.
9. `pytest` quebrava com ordenação de `limit` + severidade em testes; ajustados.

## Revisão final e mapa de calor (17/10/2026)
| Item | Implementação | Evidência |
|---|---|---|
| Mapa de calor geográfico (Central e Preditiva) | `/api/central/calor`, `components/Calor.tsx`, camada em `Mapa.tsx`, `lib/calor.ts` | T `test_calor_por_modo_respeita_escopo_e_filtros`, `lib/calor.test.ts`, `Mapa.test.tsx`, `App.test.tsx`; S `calor-*.png` |
| Importação segura (tamanho, linhas, fórmula, GeoJSON) | `routers/inventario_io.py` | T `tests/test_seguranca.py` |
| Limite de escrita | `limite.py` (429) | T `test_limite_de_escrita_por_ip_ignora_leituras` |
| Cobertura de testes | backend 99 %, frontend 88,8 % das linhas | pytest-cov / vitest --coverage |
