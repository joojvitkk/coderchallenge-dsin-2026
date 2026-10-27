import { useEffect, useState } from 'react'

export type Tema = 'claro' | 'escuro'
const CHAVE = 'fogo-tema'

const lembrado = (): Tema | null => {
  try { const v = localStorage.getItem(CHAVE); return v === 'claro' || v === 'escuro' ? v : null } catch { return null }
}
const preferido = (): Tema => (typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro')

/** Tema claro/escuro: lembra a escolha (localStorage, que pode estar bloqueado) e senão segue o sistema. Aplica `data-tema` na raiz. */
export function useTema(): [Tema, () => void] {
  const [tema, setTema] = useState<Tema>(() => lembrado() ?? preferido())
  useEffect(() => { document.documentElement.dataset.tema = tema }, [tema])
  const alternar = () => setTema((t) => {
    const novo = t === 'claro' ? 'escuro' : 'claro'
    try { localStorage.setItem(CHAVE, novo) } catch { /* sem armazenamento: vale só nesta sessão */ }
    return novo
  })
  return [tema, alternar]
}
