import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { EscopoProvider } from '../hooks/useEscopo'

/** Dados mínimos, mas completos, de cada rota da API, para renderizar as páginas inteiras sem backend. */
const AGORA = new Date().toISOString().slice(0, 19)
const EQ = {
  id: 1, tipo: 'camera', serie: 'CM-00001', marca: 'Axis', modelo: 'Q1', orgao: 'Prefeitura', cep: '17500-000', bairro: 'Centro', regiao: 'Marília Centro',
  cidade: 'Marília', uf: 'SP', rua: 'Rua A', referencia: '', lat: -22.21, lon: -49.94, situacao: 'mau_funcionamento', manutencao_tipo: 'imediata',
  proxima_manutencao: null, atributos: { resolucao: 'HD' },
}
const AGENTE = { id: 7, nome: 'Ana Silva', matricula: 'AG0007', categoria: 'guarda', orgao: 'GM', status: 'ativo', cidade: 'Marília', uf: 'SP', lat: -22.2, lon: -49.9 }
const ALERTA = {
  id: 3, ts: AGORA, inicio: AGORA, status: 'aberto', ocorrencias: 2, agente_id: null, reconhecido_em: null, resolvido_em: null, sla_prazo: AGORA,
  sla_estourado: true, bairro: 'Centro', regiao: 'Marília Centro', cidade: 'Marília', uf: 'SP', tipo: 'falha', severidade: 4, equipamento_id: 1,
  equipamento: { serie: 'CM-00001', tipo: 'camera' }, lat: -22.21, lon: -49.94,
}
const celulas = (base: number) => Array.from({ length: 25 }, (_, h) => ({
  h, ts: `2026-10-17T${String(h % 24).padStart(2, '0')}:00:00`, score: base + h, ic_inf: base, ic_sup: base + 30, fatores: [{ fator: 'histórico às 18h', pontos: 12 }],
}))
const previsao = { preve: 'p', dados_usados: { eventos: 10 }, recomendacao: 'rec' }
const KPIS = {
  equipamentos_total: 1, por_situacao: { nao_instalado: 0, operacional: 0, mau_funcionamento: 1, em_manutencao: 0, desativado: 0, furtado: 0 },
  disponibilidade_pct: 70, agentes_total: 1, agentes_ativos: 1, agentes_em_ocorrencia: 0, alertas_criticos: 1, alertas_abertos: 1,
  alertas_sla_estourado: 1, manutencao_imediata: 1, manutencao_agendada_7d: 0,
}
const SERIE = Array.from({ length: 5 }, (_, i) => ({ dia: `2026-10-${10 + i}`, projetado: i > 2, disponibilidade: 80 - i, utilizacao: 50, disponibilidade_inf: 70, disponibilidade_sup: 85 }))

const ROTAS: Record<string, unknown> = {
  '/api/tipos': { camera: { rotulo: 'Câmera', schema: { properties: { resolucao: { type: 'string', enum: ['HD', '4K'] } }, required: ['resolucao'] } } },
  '/api/central/cidades': [{ cidade: 'Marília', uf: 'SP', regiao: 'Marília Centro', lat: -22.2, lon: -49.9, dsin: true }],
  '/api/equipamentos': [EQ],
  '/api/agentes': [AGENTE],
  '/api/central/kpis': KPIS,
  '/api/central/regioes': [{ nome: 'Marília Centro', bairros: ['Centro'], por_situacao: { mau_funcionamento: 1 }, agentes_ativos: 1, alertas_criticos: 1, equipamentos: 1, disponibilidade_pct: 70, saude: 65, estado: 'atencao' }],
  '/api/central/alertas': [ALERTA],
  '/api/central/replay': [ALERTA],
  '/api/central/calor': (url: string) => ({
    ...previsao, modo: new URLSearchParams(url.split('?')[1]).get('modo'), pontos: [{ lat: -22.21, lon: -49.94, peso: 4 }],
    focos: [{ local: 'Centro', peso: 4 }], dados_usados: { pontos: 1, registros: 2 },
  }),
  '/api/central/manutencao': [EQ],
  '/api/auditoria': [{ id: 1, ts: AGORA, entidade: 'alerta', entidade_id: 3, acao: 'despachado', detalhe: { agente: 'Ana Silva', eta_min: 4 } }],
  '/api/central/briefing': {
    gerado_em: AGORA, escopo: 'Brasil', janela_horas: 6, situacao: ['1 equipamento no escopo'], acoes: ['Tratar o alerta'], base: { eventos: 1500, telemetria: 9000, regras: 'por regras' },
    riscos: [{ local: 'Centro', quando: '18h', score: 80, motivo: 'histórico às 18h' }],
  },
  // a chave da matriz segue o agrupamento pedido (bairro, cidade ou uf), como no backend
  '/api/previsao/risco': (url: string) => {
    const chave = { bairro: 'Centro', cidade: 'Marília', uf: 'SP' }[new URLSearchParams(url.split('?')[1]).get('agrupar') ?? 'bairro']
    return { ...previsao, matriz: { [chave!]: celulas(40) } }
  },
  'POST /api/central/alertas/3/despachar': { alerta: ALERTA, agente: AGENTE, distancia_km: 2.5, eta_min: 4 },
  '/api/previsao/anomalias': { ...previsao, avaliadas: 1, anomalias: [{ equipamento_id: 1, metrica: 'latencia_ms', valor: 500, baseline: 80, z_ewma: 6, z_pico: 7 }] },
  '/api/previsao/manutencao-preditiva': {
    ...previsao, ordens: [{ ordem: 1, equipamento_id: 1, prob_falha_7d: 0.7, sinal: 3, em_falha: false, causa_principal: 'latência', prioridade: 'imediata' }],
  },
  '/api/previsao/reforco': {
    ...previsao, plano: { movimentos: [{ agente_id: 7, de: 'Fragata', para: 'Centro', km: 2 }], cobertura_antes: 0.4, cobertura_depois: 0.6 },
    lacunas: [{ lat: -22.3, lon: -49.9, bairro: 'Fragata' }],
  },
  '/api/previsao/backtest': {
    ...previsao, corte: AGORA, dias: 7,
    risco: { bairros: 47, horas: 168, celulas: 8000, acerto_top_bairros: 4, top_bairros: 5, acerto_aleatorio: 0.5, correlacao_bairros: 0.89, correlacao_celulas: 0.5, ocorrencia_no_top20: 0.4, ocorrencia_geral: 0.2, erro_medio_pp: 4 },
    manutencao: { avaliados: 100, falhas_reais: 8, taxa_base: 0.08, k: 10, precisao_topk: 1, recall_topk: 0.5, auc: 0.99, erro_medio: 0.04, erro_medio_base: 0.15 },
  },
  '/api/previsao/tendencias': {
    ...previsao, serie: SERIE, por_tipo: [{ tipo: 'camera', equipamentos: 5, disponibilidade: 80, utilizacao: 50, variacao_pp: -2 }],
    resumo: { disponibilidade: { atual: 80, variacao_pp_semana: -1, projetado_7d: 78 }, utilizacao: { atual: 50, variacao_pp_semana: 0, projetado_7d: 50 } },
  },
  '/api/previsao/cenario': { ...previsao, delta_risco_medio: { Centro: 5 }, cobertura_base: 0.5, cobertura_cenario: 0.4, cobertura_cenario_realocada: 0.45, lacunas_base: 1, lacunas_cenario: 2 },
}

export interface Chamada { metodo: string; caminho: string; corpo?: string }

/** Instala fetch/EventSource/ResizeObserver falsos. `extra` sobrescreve rotas (valor, ou função que decide a resposta). */
export function instalarApi(extra: Record<string, unknown> = {}) {
  const chamadas: Chamada[] = []
  const rotas = { ...ROTAS, ...extra }
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const caminho = url.split('?')[0]
    const metodo = init?.method ?? 'GET'
    chamadas.push({ metodo, caminho, corpo: init?.body as string | undefined })
    let corpo = rotas[`${metodo} ${caminho}`] ?? rotas[caminho] ?? (metodo === 'GET' ? [] : {})
    if (typeof corpo === 'function') corpo = corpo(url, init)
    return new Response(JSON.stringify(corpo), { status: 200 })
  }))
  vi.stubGlobal('EventSource', class { addEventListener() {} close() {} onopen = null; onerror = null; readyState = 0; static CLOSED = 2 })
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  Element.prototype.scrollIntoView = vi.fn()
  return chamadas
}

export function abrir(ui: ReactElement, rota = '/') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
  return render(<QueryClientProvider client={qc}><EscopoProvider><MemoryRouter initialEntries={[rota]}>{ui}</MemoryRouter></EscopoProvider></QueryClientProvider>)
}
