import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import type { Escopo } from '../api/types'

interface Ctx { escopo: Escopo; setEscopo: (e: Escopo) => void }
const Contexto = createContext<Ctx>({ escopo: {}, setEscopo: () => {} })

/** Cidade/UF escolhidas no topo: valem para mapa, KPIs, alertas, previsões e inventário. Vazio = Brasil (todo o conjunto). */
export function EscopoProvider({ children }: { children: ReactNode }) {
  const [escopo, setEscopo] = useState<Escopo>({})
  const valor = useMemo(() => ({ escopo, setEscopo }), [escopo])
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}

export const useEscopo = () => useContext(Contexto)
