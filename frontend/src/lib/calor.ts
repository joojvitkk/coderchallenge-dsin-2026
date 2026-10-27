import type { Foco, ModoCalor, PontoCalor } from '../api/types'

export type Camada = 'pinos' | 'calor' | 'ambos'
export const CAMADAS = [['pinos', 'Pinos'], ['calor', 'Calor'], ['ambos', 'Ambos']] as const
export const MODOS = [['alertas', 'Alertas'], ['indisponibilidade', 'Indisponibilidade'], ['cobertura', 'Cobertura']] as const satisfies readonly (readonly [ModoCalor, string])[]

/** Mesma escala verde → âmbar → vermelho do risco (`corRisco`), em pontos de parada da camada de calor. */
export const GRADIENTE = { 0.2: 'hsl(135 70% 62%)', 0.55: 'hsl(68 70% 58%)', 1: 'hsl(0 70% 52%)' }

/** Pesos -> intensidade 0..1 ([lat, lon, intensidade], formato do leaflet.heat), relativa ao maior foco ou a um `teto` fixo
 * (ex.: 80 no risco previsto, para o calor não inflar quando todos os locais têm risco parecido); sem pesos positivos, nada. */
export function intensidades(pontos: PontoCalor[], teto?: number): [number, number, number][] {
  const max = teto ?? Math.max(0, ...pontos.map((p) => p.peso))
  return max > 0 ? pontos.filter((p) => p.peso > 0).map((p) => [p.lat, p.lon, Math.min(1, p.peso / max)]) : []
}

/** Raio do ponto em pixels por nível de zoom: mais fechado quando se aproxima, para o foco seguir o território e não a tela. */
export const raioPorZoom = (zoom: number) => Math.round(Math.max(18, Math.min(48, 12 + zoom * 3)))

/** Os `n` maiores focos (alternativa textual ao mapa de calor), do maior para o menor peso. */
export const maioresFocos = (itens: Foco[], n = 5): Foco[] => [...itens].sort((a, b) => b.peso - a.peso).slice(0, n)
