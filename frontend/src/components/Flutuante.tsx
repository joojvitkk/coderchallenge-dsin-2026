import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'

/**
 * Painel ancorado a um elemento (select, calendário, camadas do mapa): vai para o <body> em posição fixa,
 * abre para cima se faltar espaço embaixo e fecha ao clicar fora, rolar a página ou redimensionar.
 */
export function Flutuante({ ancora, onFechar, altura = 280, largura, className = '', children, ...aria }: {
  ancora: RefObject<HTMLElement | null>; onFechar: () => void; altura?: number; largura?: number; className?: string; children: ReactNode
} & React.HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null)
  // a âncora já está montada quando o painel abre, então a posição sai direto do primeiro render
  const [estilo] = useState<CSSProperties>(() => {
    const r = ancora.current?.getBoundingClientRect()
    if (!r) return { position: 'fixed' }
    const abaixo = innerHeight - r.bottom - 12, acima = r.top - 12
    const sobe = abaixo < Math.min(altura, 220) && acima > abaixo
    const w = largura ?? Math.max(r.width, 240)
    const left = Math.max(8, Math.min(r.left, innerWidth - w - 8))
    return { position: 'fixed', left, width: w, maxHeight: Math.min(altura, sobe ? acima : abaixo), ...(sobe ? { bottom: innerHeight - r.top + 4 } : { top: r.bottom + 4 }) }
  })
  useEffect(() => {
    const fora = (e: Event) => { const t = e.target as Node; if (!ref.current?.contains(t) && !ancora.current?.contains(t)) onFechar() }
    const rolou = (e: Event) => { if (!ref.current?.contains(e.target as Node)) onFechar() }
    document.addEventListener('mousedown', fora)
    addEventListener('scroll', rolou, true)
    addEventListener('resize', onFechar)
    return () => { document.removeEventListener('mousedown', fora); removeEventListener('scroll', rolou, true); removeEventListener('resize', onFechar) }
  }, [ancora, onFechar])
  return createPortal(<div ref={ref} className={`flut ${className}`} style={estilo} {...aria}>{children}</div>, document.body)
}
