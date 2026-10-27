import { useEffect, useState } from 'react'

/** Relógio que reavalia a cada `ms` (SLA e "há X min" andam sozinhos, sem depender de novos dados). */
export function useAgora(ms = 15_000): number {
  const [agora, setAgora] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return agora
}
