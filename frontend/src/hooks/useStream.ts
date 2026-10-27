import { useEffect, useRef, useState } from 'react'
import type { EventosStream } from '../api/types'

export type StatusStream = 'conectando' | 'online' | 'offline'
type Handlers = { [K in keyof EventosStream]?: (dado: EventosStream[K]) => void }

/**
 * Assina o SSE /api/stream; reconexão é nativa do EventSource.
 * `onLatencia(ms)` recebe, a cada evento, o tempo entre a emissão no servidor (campo `id` do quadro SSE, epoch ms)
 * e a atualização da interface (commit do React logo após o handler): a métrica "evento -> tela" (relógios do servidor e do navegador na mesma máquina/NTP).
 */
export function useStream(handlers: Handlers, url = '/api/stream', onLatencia?: (ms: number) => void): StatusStream {
  const [status, setStatus] = useState<StatusStream>('conectando')
  const ref = useRef({ handlers, onLatencia })
  useEffect(() => { ref.current = { handlers, onLatencia } })

  useEffect(() => {
    const es = new EventSource(url)
    es.onopen = () => setStatus('online')
    es.onerror = () => setStatus(es.readyState === EventSource.CLOSED ? 'offline' : 'conectando')
    const nomes: (keyof EventosStream)[] = ['telemetria', 'agente', 'alerta', 'kpis']
    for (const nome of nomes) {
      es.addEventListener(nome, (e) => {
        const m = e as MessageEvent<string>
        const h = ref.current.handlers[nome] as ((d: unknown) => void) | undefined
        try { h?.(JSON.parse(m.data)) } catch { /* evento malformado é ignorado */ return }
        const emitido = Number(m.lastEventId)
        if (emitido && ref.current.onLatencia) setTimeout(() => ref.current.onLatencia?.(Date.now() - emitido), 0) // depois do commit do React (rAF é estrangulado em abas ocultas)
      })
    }
    return () => es.close()
  }, [url])

  return status
}
