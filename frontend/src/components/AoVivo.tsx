import { useEffect, useState } from 'react'
import type { StatusStream } from '../hooks/useStream'

const TEXTO = { online: 'Ao vivo', conectando: 'Conectando…', offline: 'Sem conexão' }
export interface Latencia { ultima: number; p50: number; p95: number; n: number }

/** Indicador do SSE: ponto pulsando, carimbo "atualizado há Xs" e a latência evento->tela (mediana e p95 das últimas leituras). */
export function AoVivo({ status, ultimo, latencia }: { status: StatusStream; ultimo: number | null; latencia?: Latencia | null }) {
  const [agora, setAgora] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const seg = ultimo ? Math.max(0, Math.round((agora - ultimo) / 1000)) : null
  return (
    <span className={`aovivo ${status}`} role="status">
      <i aria-hidden="true" />{TEXTO[status]}
      {latencia && <small title={`Tempo entre o servidor emitir o evento e a tela ser desenhada (${latencia.n} últimas leituras)`}> · evento→tela {Math.round(latencia.p50)} ms (p95 {Math.round(latencia.p95)})</small>}
      {seg !== null && <small> · há {seg}s</small>}
    </span>
  )
}
