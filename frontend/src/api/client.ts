import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEscopo } from '../hooks/useEscopo'
import type {
  Agente, Agrupamento, Alerta, Anomalias, Auditoria, Backtest, Briefing, Calor, Cenario, Cidade, Despacho, Equipamento, Grupo, Incidente, ItemTempo, Kpis,
  ManutPred, Reforco, RelatorioImportacao, Risco, Tendencias, Tipos,
} from './types'

type Params = Record<string, string | number | boolean | undefined | null>

export function qs(params: Params = {}): string {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v))
  const s = p.toString()
  return s ? `?${s}` : ''
}

/** Item de erro 422 do FastAPI -> "campo: mensagem". */
const erroCampo = (e: { loc?: unknown[]; msg?: string }) => `${e.loc?.slice(1).join('.') ?? ''}: ${e.msg ?? 'inválido'}`

export async function api<T>(path: string, params?: Params, init?: RequestInit): Promise<T> {
  const r = await fetch(`/api${path}${qs(params)}`, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
  })
  if (!r.ok) {
    const corpo = await r.json().catch(() => ({}))
    const d = (corpo as { detail?: unknown }).detail
    throw new Error(typeof d === 'string' ? d : Array.isArray(d) ? d.map(erroCampo).join('; ') : `HTTP ${r.status}`)
  }
  return r.status === 204 ? (undefined as T) : r.json()
}

/** GET em cache; `escopo` (padrão) acrescenta a cidade/UF escolhidas no topo aos parâmetros. */
function useGet<T>(path: string, params?: Params, { enabled = true, escopo = true } = {}) {
  const e = useEscopo().escopo
  const p = escopo ? { ...params, ...e } : params
  return useQuery({ queryKey: [path, p ?? {}], queryFn: () => api<T>(path, p), enabled, refetchInterval: escopo && (e.cidade || e.uf) ? 5000 : false })
}

export const useTipos = () => useGet<Tipos>('/tipos', undefined, { escopo: false })
export const useCidades = () => useGet<Cidade[]>('/central/cidades', undefined, { escopo: false })
export const useEquipamentos = (f: Params = {}) => useGet<Equipamento[]>('/equipamentos', { limit: 500, ...f })
export const useAgentes = () => useGet<Agente[]>('/agentes', { limit: 500 })
export const useKpis = () => useGet<Kpis>('/central/kpis')
export const useGrupos = (por: Agrupamento) => useGet<Grupo[]>('/central/regioes', { por })
export const useAlertas = () => useGet<Alerta[]>('/central/alertas')
export const useManutencao = () => useGet<Equipamento[]>('/central/manutencao')
export const useRisco = (horas = 24, agrupar = 'bairro') => useGet<Risco>('/previsao/risco', { horas, agrupar })
export const useAnomalias = () => useGet<Anomalias>('/previsao/anomalias')
export const useManutPred = () => useGet<ManutPred>('/previsao/manutencao-preditiva')
export const useReforco = (horas = 6) => useGet<Reforco>('/previsao/reforco', { horas })
export const useBacktest = (dias = 7) => useGet<Backtest>('/previsao/backtest', { dias })
export const useTendencias = () => useGet<Tendencias>('/previsao/tendencias')
export const useCalor = (params: Params, ativo: boolean) => useGet<Calor>('/central/calor', params, { enabled: ativo })
export const useBriefing = () => useGet<Briefing>('/central/briefing')
export const useReplay = (ativo: boolean) => useGet<Alerta[]>('/central/replay', { horas: 24 }, { enabled: ativo })
export const useAuditoria = (entidade: string, id: number | null) =>
  useGet<Auditoria[]>('/auditoria', { entidade, entidade_id: id, limit: 20 }, { enabled: id !== null, escopo: false })
export const useLinhaDoTempo = (id: number | null) =>
  useGet<ItemTempo[]>(`/equipamentos/${id}/linha-do-tempo`, undefined, { enabled: id !== null, escopo: false })
export const useCenario = (params: Params | null) => useGet<Cenario>('/previsao/cenario', params ?? undefined, { enabled: params !== null })

export type Recurso = 'equipamentos' | 'agentes'

/** Salvar (POST/PUT) e excluir; invalida a lista do recurso. */
export function useCrud(recurso: Recurso) {
  const qc = useQueryClient()
  const opts = { onSuccess: () => qc.invalidateQueries({ queryKey: [`/${recurso}`] }) }
  const salvar = useMutation({
    mutationFn: ({ id, dados }: { id?: number; dados: object }) =>
      api<unknown>(id ? `/${recurso}/${id}` : `/${recurso}`, undefined, { method: id ? 'PUT' : 'POST', body: JSON.stringify(dados) }),
    ...opts,
  })
  const excluir = useMutation({ mutationFn: (id: number) => api<void>(`/${recurso}/${id}`, undefined, { method: 'DELETE' }), ...opts })
  return { salvar, excluir }
}

export const injetarIncidente = (bairro: string, severidade = 4) =>
  api<Incidente>('/demo/incidente', undefined, { method: 'POST', body: JSON.stringify({ bairro, severidade }) })

/** Ações do ciclo de vida de um alerta; depois de cada uma os caches de alertas, KPIs e agentes são revalidados. */
export function useAlertaAcoes() {
  const qc = useQueryClient()
  const revalidar = () => ['/central/alertas', '/central/kpis', '/agentes', '/central/regioes'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }))
  const post = <T,>(id: number, acao: string, params?: Params) => api<T>(`/central/alertas/${id}/${acao}`, params, { method: 'POST' })
  const opts = { onSuccess: revalidar }
  return {
    reconhecer: useMutation({ mutationFn: (id: number) => post<Alerta>(id, 'reconhecer'), ...opts }),
    despachar: useMutation({ mutationFn: ({ id, agente }: { id: number; agente?: number }) => post<Despacho>(id, 'despachar', { agente_id: agente }), ...opts }),
    resolver: useMutation({ mutationFn: (id: number) => post<Alerta>(id, 'resolver'), ...opts }),
  }
}

/** Importa CSV/GeoJSON do inventário; `simular` só valida e devolve o relatório. */
export async function importarInventario(arquivo: File, simular: boolean): Promise<RelatorioImportacao> {
  const formato = arquivo.name.toLowerCase().match(/\.(geo)?json$/) ? 'geojson' : 'csv'
  const r = await fetch(`/api/equipamentos/importar${qs({ formato, simular })}`, { method: 'POST', body: await arquivo.text() })
  const corpo = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(typeof corpo.detail === 'string' ? corpo.detail : `HTTP ${r.status}`)
  return corpo
}
