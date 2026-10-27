export const SITUACOES = ['nao_instalado', 'operacional', 'mau_funcionamento', 'em_manutencao', 'desativado', 'furtado'] as const
export type Situacao = (typeof SITUACOES)[number]

export interface Equipamento {
  id: number
  tipo: string
  serie: string
  marca: string
  modelo: string
  orgao: string
  cep: string
  bairro: string
  regiao: string
  cidade: string
  uf: string
  rua: string
  referencia: string
  lat: number
  lon: number
  situacao: Situacao
  manutencao_tipo: 'imediata' | 'agendada' | 'nenhuma'
  proxima_manutencao: string | null
  atributos: Record<string, unknown>
}

export interface Agente {
  id: number
  nome: string
  matricula: string
  categoria: 'transito' | 'guarda' | 'policia'
  orgao: string
  status: 'ativo' | 'inativo' | 'em_ocorrencia'
  cidade: string
  uf: string
  lat: number
  lon: number
  /** Despacho: enquanto há `alerta_id` o agente segue para o destino (ou já está no local, sem destino). */
  alerta_id?: number | null
  destino_lat?: number | null
  destino_lon?: number | null
}

export interface CampoSchema {
  type?: string
  format?: string
  enum?: string[]
  minimum?: number
  maximum?: number
  exclusiveMinimum?: number
  default?: unknown
  items?: { type?: string }
  pattern?: string
}
interface EsquemaTipo { rotulo: string; schema: { properties?: Record<string, CampoSchema>; required?: string[] } }
export type Tipos = Record<string, EsquemaTipo>

export interface Kpis {
  equipamentos_total: number
  por_situacao: Record<Situacao, number>
  disponibilidade_pct: number
  agentes_total: number
  agentes_ativos: number
  agentes_em_ocorrencia: number
  alertas_criticos: number
  alertas_abertos: number
  alertas_sla_estourado: number
  manutencao_imediata: number
  manutencao_agendada_7d: number
}
export type Agrupamento = 'regiao' | 'cidade' | 'uf'
export interface Grupo {
  nome: string
  bairros: string[]
  por_situacao: Partial<Record<Situacao, number>>
  agentes_ativos: number
  alertas_criticos: number
  equipamentos: number
  disponibilidade_pct: number
  saude: number
  estado: 'normal' | 'atencao' | 'critico'
}
export type StatusAlerta = 'aberto' | 'reconhecido' | 'em_atendimento' | 'resolvido'
export interface Alerta {
  id: number
  ts: string
  inicio: string
  status: StatusAlerta
  ocorrencias: number
  agente_id: number | null
  reconhecido_em: string | null
  resolvido_em: string | null
  sla_prazo: string
  sla_estourado: boolean
  bairro: string
  regiao: string
  cidade: string
  uf: string
  tipo: string
  severidade: number
  equipamento_id: number | null
  equipamento: { serie: string; tipo: string } | null
  lat: number
  lon: number
}

/** Cidade do conjunto; `dsin` = presença respaldada por fonte pública (as demais são simulação). */
export interface Cidade { cidade: string; uf: string; regiao: string; lat: number; lon: number; dsin: boolean }
export interface Telemetria { equipamento_id: number; situacao: Situacao; ts: string; metricas: Record<string, number> }
export interface EventosStream { telemetria: Telemetria[]; agente: Agente[]; alerta: Alerta; kpis: Kpis }

/** Resposta padrão de /api/previsao/*: o que prevê, dados usados e recomendação, mais o corpo específico. */
export type Previsao<T> = T & { preve: string; dados_usados: Record<string, number | string>; recomendacao: string }
interface Fator { fator: string; pontos: number }
export interface Celula { h: number; ts: string; score: number; ic_inf: number; ic_sup: number; fatores: Fator[] }
export type Risco = Previsao<{ matriz: Record<string, Celula[]> }>
interface Anomalia { equipamento_id: number; metrica: string; valor: number; baseline: number; z_ewma: number; z_pico: number }
export type Anomalias = Previsao<{ anomalias: Anomalia[]; avaliadas: number }>
interface Ordem {
  ordem: number; equipamento_id: number; prob_falha_7d: number; sinal: number; em_falha: boolean
  causa_principal: string; prioridade: 'imediata' | 'agendada' | 'monitorar'
}
export type ManutPred = Previsao<{ ordens: Ordem[] }>
interface Movimento { agente_id: number; de: string; para: string; km: number }
interface Lacuna { lat: number; lon: number; bairro: string }
export type Reforco = Previsao<{
  plano: { movimentos: Movimento[]; cobertura_antes: number; cobertura_depois: number }
  lacunas: Lacuna[]
}>
export const EVENTOS_CENARIO = ['chuva', 'evento_bairro', 'falha_equipamento'] as const
export type Cenario = Previsao<{
  delta_risco_medio: Record<string, number>
  cobertura_base: number
  cobertura_cenario: number
  cobertura_cenario_realocada: number
  lacunas_base: number
  lacunas_cenario: number
}>
export interface Incidente { alerta: Alerta; agente_acionado: number | null; eta_min: number | null }
export interface Despacho { alerta: Alerta; agente: Agente; distancia_km: number; eta_min: number }
export interface Auditoria { id: number; ts: string; entidade: string; entidade_id: number; acao: string; detalhe: Record<string, unknown> }
export interface ItemTempo { ts: string; tipo: 'auditoria' | 'alerta' | 'situacao'; titulo: string; detalhe: Record<string, unknown> }

interface BacktestRisco {
  bairros: number; horas: number; celulas: number; acerto_top_bairros: number; top_bairros: number; acerto_aleatorio: number
  correlacao_bairros: number; correlacao_celulas: number; ocorrencia_no_top20: number; ocorrencia_geral: number; erro_medio_pp: number
}
interface BacktestManut {
  avaliados: number; falhas_reais: number; taxa_base?: number; k?: number; precisao_topk?: number; recall_topk?: number | null
  auc?: number | null; erro_medio?: number; erro_medio_base?: number
}
export type Backtest = Previsao<{ corte: string; dias: number; risco: BacktestRisco; manutencao: BacktestManut }>

interface PontoSerie {
  dia: string; projetado: boolean; disponibilidade: number | null; utilizacao: number | null
  disponibilidade_inf?: number; disponibilidade_sup?: number; utilizacao_inf?: number; utilizacao_sup?: number
}
interface ResumoSerie { atual: number; variacao_pp_semana: number; projetado_7d: number }
interface TipoTendencia { tipo: string; equipamentos: number; disponibilidade: number; utilizacao: number | null; variacao_pp: number }
export type Tendencias = Previsao<{ serie: PontoSerie[]; resumo: { disponibilidade?: ResumoSerie; utilizacao?: ResumoSerie }; por_tipo: TipoTendencia[] }>

export interface Briefing {
  gerado_em: string; escopo: string; janela_horas: number; situacao: string[]; acoes: string[]
  riscos: { local: string; quando: string; score: number; motivo: string }[]
  base: { eventos: number; telemetria: number; regras: string }
}
export interface RelatorioImportacao {
  total: number; validos: number; criados: number; atualizados: number; simulacao: boolean; gravado: boolean
  erros: { linha: number; serie?: string; campo: string; mensagem: string }[]
}

export type Escopo = { cidade?: string; uf?: string }
export type Filtros = {
  tipo?: string
  situacao?: string
  bairro?: string
  regiao?: string
  cidade?: string
  uf?: string
  orgao?: string
  q?: string
  precisa_manutencao?: string
}

export interface PontoCalor { lat: number; lon: number; peso: number }
export interface Foco { local: string; peso: number }
export type ModoCalor = 'alertas' | 'indisponibilidade' | 'cobertura'
export type Calor = Previsao<{ modo: ModoCalor; pontos: PontoCalor[]; focos: Foco[] }>
