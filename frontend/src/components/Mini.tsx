import type { CSSProperties } from 'react'

/** Linha de tendência em SVG (sem eixos); `valores` em ordem cronológica. */
export function Sparkline({ valores, cor = 'var(--acc)', rotulo }: { valores: number[]; cor?: string; rotulo: string }) {
  if (valores.length < 2) return null
  const [min, max] = [Math.min(...valores), Math.max(...valores)]
  const pt = valores.map((v, i): [number, number] => [(i / (valores.length - 1)) * 100, 22 - ((v - min) / (max - min || 1)) * 20])
  const linha = pt.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  return (
    <svg className="spark" viewBox="0 0 100 24" preserveAspectRatio="none" role="img" aria-label={rotulo}>
      <polygon points={`0,24 ${linha} 100,24`} fill={cor} opacity=".12" />
      <polyline points={linha} fill="none" stroke={cor} strokeWidth="1.8" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

/** Barra empilhada: cada parte com sua cor (distribuição por situação, progresso, etc.). */
export const Segmentos = ({ partes, rotulo }: { partes: { valor: number; cor: string }[]; rotulo: string }) => (
  <div className="barra-mini" role="img" aria-label={rotulo}>
    {partes.filter((p) => p.valor > 0).map((p, i) => <i key={i} style={{ flexGrow: p.valor, '--c': p.cor } as CSSProperties} />)}
  </div>
)
