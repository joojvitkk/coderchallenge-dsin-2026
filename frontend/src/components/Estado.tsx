import type { ReactNode } from 'react'
import { Botao } from './Controles'

interface Q { isLoading: boolean; error: Error | null; refetch: () => unknown }

export const Skeleton = ({ linhas = 3, alto = 16 }: { linhas?: number; alto?: number }) => (
  <div className="skeletons" role="status" aria-label="Carregando">
    {Array.from({ length: linhas }, (_, i) => <span key={i} className="skeleton" style={{ height: alto, width: `${100 - (i % 3) * 12}%` }} />)}
  </div>
)

const Ilustracao = ({ erro }: { erro?: boolean }) => (
  <svg width="64" height="48" viewBox="0 0 64 48" fill="none" aria-hidden="true">
    <rect x="6" y="10" width="52" height="30" rx="6" stroke="currentColor" strokeWidth="2" opacity=".35" />
    <path d={erro ? 'M24 20l16 12M40 20L24 32' : 'M18 30h10l4-8 6 14 4-6h6'} stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

/** Estados padrão de uma consulta: carregando (skeleton), erro (com nova tentativa), vazio e conteúdo. */
export function Estado({ q, vazio, linhas, fallback, children }: { q: Q; vazio?: boolean; linhas?: number; fallback?: ReactNode; children: ReactNode }) {
  if (q.isLoading) return <>{fallback ?? <Skeleton linhas={linhas} />}</>
  if (q.error)
    return (
      <div className="estado erro" role="alert">
        <Ilustracao erro />
        <p>Falha ao carregar: {q.error.message}</p>
        <Botao onClick={() => q.refetch()}>Tentar de novo</Botao>
      </div>
    )
  if (vazio)
    return (
      <div className="estado">
        <Ilustracao />
        <p>Nada para mostrar.</p>
      </div>
    )
  return <>{children}</>
}
