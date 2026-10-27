import { useMemo } from 'react'
import { useEquipamentos, useTipos } from '../api/client'
import type { Opcoes } from '../components/Filtros'

const unicos = (xs: string[]) => [...new Set(xs.filter(Boolean))].sort()

/** Opções dos filtros, derivadas do esquema de tipos e do inventário (já restrito à cidade/UF escolhida). */
export function useOpcoes(): Opcoes {
  const tipos = useTipos().data
  const eqs = useEquipamentos().data
  return useMemo(() => {
    const lista = eqs ?? []
    return {
      tipos: Object.keys(tipos ?? {}),
      bairros: unicos(lista.map((e) => e.bairro)),
      regioes: unicos(lista.map((e) => e.regiao)),
      orgaos: unicos(lista.map((e) => e.orgao)),
    }
  }, [tipos, eqs])
}
