import type { Equipamento, Situacao } from '../api/types'
import type { Ponto } from '../components/Mapa'

/** Cores por situação: tokens CSS (styles.css), todas com contraste AA sobre branco; sempre acompanhadas de ícone e texto. */
export const COR_SITUACAO: Record<Situacao, string> = {
  operacional: 'var(--ok)',
  mau_funcionamento: 'var(--alerta)',
  em_manutencao: 'var(--info)',
  desativado: 'var(--neutro)',
  furtado: 'var(--crit)',
  nao_instalado: 'var(--viol)',
}

export const COR_AGENTE = { ativo: 'var(--agente)', em_ocorrencia: 'var(--crit)', inativo: 'var(--neutro)' }

/** Palavras dos identificadores da API (snake_case sem acento) e sua grafia correta. */
const ACENTOS: Record<string, string> = {
  nao: 'não', manutencao: 'manutenção', situacao: 'situação', regiao: 'região', orgao: 'órgão', serie: 'série', referencia: 'referência',
  transito: 'trânsito', policia: 'polícia', ocorrencia: 'ocorrência', semaforo: 'semáforo', conversao: 'conversão', camera: 'câmera',
  balanca: 'balança', veiculo: 'veículo', veiculos: 'veículos', autonomo: 'autônomo', taxi: 'táxi', mototaxi: 'mototáxi',
  dinamica: 'dinâmica', estatica: 'estática', emergencia: 'emergência', tatica: 'tática', latencia: 'latência', resolucao: 'resolução',
  visao: 'visão', nivel: 'nível', alvara: 'alvará', taximetro: 'taxímetro', ate: 'até', patrimonio: 'patrimônio', corporacao: 'corporação',
  descricao: 'descrição', matricula: 'matrícula', proxima: 'próxima', estavel: 'estável', metricas: 'métricas', ptz: 'PTZ', cep: 'CEP', uf: 'UF', cidade: 'cidade',
}

/** "nao_instalado" -> "Não instalado"; usado para todo identificador exibido ao usuário. */
export const rotulo = (s: string) => {
  const t = s.split('_').map((w) => ACENTOS[w] ?? w).join(' ')
  return t.charAt(0).toUpperCase() + t.slice(1)
}

/** Escala de severidade 1-4 (Baixa..Crítica); cor + texto, nunca só cor. */
export const SEV = ['', 'Baixa', 'Média', 'Alta', 'Crítica']
export const COR_SEV = ['', 'var(--neutro)', 'var(--info)', 'var(--alerta)', 'var(--crit)']

/** O banco guarda UTC sem sufixo ("2026-10-17T18:00:00"); sem o Z o navegador leria como hora local. */
export const utc = (ts: string) => new Date(/(Z|[+-]\d\d:?\d\d)$/.test(ts) ? ts : `${ts.replace(' ', 'T')}Z`)
export const dataHora = (ts: string) => utc(ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

/** "há 5 min", "há 2 h". */
export function haQuanto(ts: string, agora = Date.now()): string {
  const min = Math.max(0, Math.round((agora - +utc(ts)) / 60000))
  return min < 60 ? `há ${min} min` : min < 1440 ? `há ${Math.round(min / 60)} h` : `há ${Math.round(min / 1440)} d`
}

/** Dias inteiros até uma data (YYYY-MM-DD) no calendário local; negativo = atrasada. */
export function diasAte(data: string, hoje = new Date()): number {
  const [a, m, d] = data.split('-').map(Number)
  return Math.round((new Date(a, m - 1, d).getTime() - new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate()).getTime()) / 86400000)
}

const JANELA_PROXIMA_DIAS = 7
/** Urgência de manutenção para destaque: imediata, próxima da data (até 7 dias ou atrasada) ou nenhuma. */
export function urgenciaManut(e: { manutencao_tipo: string; proxima_manutencao: string | null }, hoje = new Date()): 'imediata' | 'proxima' | null {
  if (e.manutencao_tipo === 'imediata') return 'imediata'
  return e.manutencao_tipo === 'agendada' && e.proxima_manutencao && diasAte(e.proxima_manutencao, hoje) <= JANELA_PROXIMA_DIAS ? 'proxima' : null
}

/** Distância em km (haversine) e ETA estimado, as mesmas fórmulas do backend (40 km/h, rota 30% mais longa). */
export function distanciaKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = (g: number) => (g * Math.PI) / 180
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2
  return 12742 * Math.asin(Math.sqrt(h))
}
export const etaMin = (km: number) => Math.max(1, Math.round(((km * 1.3) / 40) * 60))

export const nomeEq = (e: { tipo: string; serie: string }) => `${rotulo(e.tipo)} ${e.serie}`

/** Escala de risco 0-100 (verde → âmbar → vermelho, tons claros: texto escuro sobre a cor mantém contraste). */
export function corRisco(score: number): string {
  const t = Math.max(0, Math.min(100, score)) / 100
  return `hsl(${Math.round(135 * (1 - t))} 70% 62%)`
}

/** Substitui (ou insere) por id preservando a ordem; usado por eventos do SSE. */
export function mesclarPorId<T extends { id: number }>(lista: T[], patch: Partial<T> & { id: number }): T[] {
  return lista.some((x) => x.id === patch.id) ? lista.map((x) => (x.id === patch.id ? { ...x, ...patch } : x)) : lista
}

/** Pino de equipamento para o mapa (cor pela situação, ícone pelo tipo). */
export const pontoEq = (e: Equipamento, extra: Partial<Ponto> = {}): Ponto => {
  const anel = urgenciaManut(e) ?? undefined
  return {
    id: `e${e.id}`, lat: e.lat, lon: e.lon, cor: COR_SITUACAO[e.situacao], icone: e.tipo, anel,
    titulo: `${nomeEq(e)} — ${rotulo(e.situacao)}${anel ? ` — manutenção ${anel === 'imediata' ? 'imediata' : 'próxima'}` : ''}`, ...extra,
  }
}

/** Centroide dos equipamentos agrupados por um campo (bairro, cidade ou uf). */
export function centroides(eqs: Equipamento[], campo: 'bairro' | 'cidade' | 'uf'): Record<string, { lat: number; lon: number }> {
  const soma: Record<string, { lat: number; lon: number; n: number }> = {}
  for (const e of eqs) {
    const s = (soma[e[campo]] ??= { lat: 0, lon: 0, n: 0 })
    s.lat += e.lat; s.lon += e.lon; s.n++
  }
  return Object.fromEntries(Object.entries(soma).map(([k, s]) => [k, { lat: s.lat / s.n, lon: s.lon / s.n }]))
}

export const pct = (v: number) => `${Math.round(v)}%`
