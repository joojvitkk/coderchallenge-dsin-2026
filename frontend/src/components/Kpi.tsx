import { useState, type ReactNode } from 'react'
import { Icone } from './Icone'

/** Cartão de KPI: rótulo, número grande (pisca quando muda ao vivo) e um mini visual (sparkline/barra) opcional. */
export function Kpi({ rotulo, valor, sufixo, tom, icone, extra }: { rotulo: string; valor: string | number; sufixo?: string; tom?: 'ok' | 'alerta' | 'crit'; icone: string; extra?: ReactNode }) {
  const [antes, setAntes] = useState(valor)
  const [mudou, setMudou] = useState(false)
  if (antes !== valor) { setAntes(valor); setMudou(true) }  // ajuste de estado durante o render (padrão do React)
  return (
    <div className={`kpi ${tom ?? ''}`}>
      <span className="kpi-rot"><Icone nome={icone} tam={14} />{rotulo}</span>
      <strong key={String(valor)} className={mudou ? 'muda' : ''}>{valor}{sufixo && <small>{sufixo}</small>}</strong>
      <div className="kpi-extra">{extra}</div>
    </div>
  )
}

export const KpiSkeleton = () => (
  <div className="kpi"><span className="skeleton" style={{ height: 12, width: '60%' }} /><span className="skeleton" style={{ height: 28, width: '40%' }} /><span className="skeleton" style={{ height: 6 }} /></div>
)
