import { SITUACOES, type Filtros } from '../api/types'

export interface Contexto { tipos: string[]; bairros: string[]; regioes: string[]; cidades?: string[] }
export interface Comando { filtros: Filtros; horas?: number; resumo: string }

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const stem = (p: string) => p.replace(/(e?s)$/, '')

const SITUACAO_PALAVRAS: [RegExp, string][] = [
  [/furtad/, 'furtado'], [/operacion|funcionando/, 'operacional'], [/mau.funcion|defeit|degradad|falh/, 'mau_funcionamento'],
  [/manutencao(?! imediata)/, 'em_manutencao'], [/desativad/, 'desativado'], [/nao.instalad/, 'nao_instalado'],
]

/** Interpreta um comando em português ("radares furtados no Centro daqui a 6 horas") em filtros e horizonte. */
export function interpretar(texto: string, ctx: Contexto): Comando {
  const t = norm(texto)
  const filtros: Filtros = {}
  const partes: string[] = []
  const achar = (lista: string[]) =>
    [...lista].sort((a, b) => b.length - a.length).find((x) => new RegExp(`\\b${norm(x)}\\b`).test(t))

  // tipo inteiro ("transporte escolar") ou, na falta, qualquer palavra do identificador
  // ("radares" -> todos os radar_*, separados por vírgula como o backend aceita)
  const inteiros = ctx.tipos.filter((x) => t.includes(stem(norm(x).replace(/_/g, ' '))))
  const tipos = inteiros.length ? inteiros : ctx.tipos.filter((x) => x.split('_').some((p) => p.length > 3 && t.includes(stem(p))))
  if (tipos.length) filtros.tipo = tipos.join(',')
  const manut = /manutencao imediata|precisa.*manutencao|urgente/.test(t)
  if (manut) filtros.precisa_manutencao = 'true'
  const sit = manut ? undefined : SITUACAO_PALAVRAS.find(([r]) => r.test(t))?.[1]
  if (sit && (SITUACOES as readonly string[]).includes(sit)) filtros.situacao = sit
  const bairro = achar(ctx.bairros)
  if (bairro) filtros.bairro = bairro
  const cidade = achar(ctx.cidades ?? [])
  if (cidade) filtros.cidade = cidade
  const regiao = achar(ctx.regioes)
  if (regiao && !bairro) filtros.regiao = regiao

  const h = t.match(/(?:daqui a|em|\+)\s*(\d{1,2})\s*h/)
  const horas = h ? Math.min(24, Number(h[1])) : /amanha/.test(t) ? 24 : /\bagora\b/.test(t) ? 0 : undefined

  for (const [k, v] of Object.entries(filtros)) partes.push(`${k}=${v}`)
  if (horas !== undefined) partes.push(`+${horas}h`)
  return { filtros, horas, resumo: partes.length ? partes.join(' · ') : 'nenhum filtro reconhecido' }
}
