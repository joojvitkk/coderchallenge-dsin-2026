import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { Botao } from './Controles'

/** Cartão com título; `className="flut"` o faz flutuar (vidro) sobre o mapa. */
export function Painel({ titulo, acoes, children, className = '', id }: { titulo: string; acoes?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={`painel ${className}`} aria-label={titulo}>
      <header><h2>{titulo}</h2>{acoes}</header>
      <div className="corpo" {...(className.includes('flut') ? { tabIndex: 0, role: 'group', 'aria-label': titulo } : {})}>{children}</div>
    </section>
  )
}

const FOCAVEL = 'a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea,[tabindex]:not([tabindex="-1"])'

/** Diálogo modal (gaveta lateral ou paleta central): Esc fecha, Tab circula, foco inicial no primeiro campo. */
export function Dialogo({ titulo, lado = 'direita', cabecalho = true, onFechar, children }: { titulo: string; lado?: 'direita' | 'centro'; cabecalho?: boolean; onFechar: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null
    ref.current?.querySelector<HTMLElement>('input:not([type=hidden]),[role=combobox],textarea')?.focus()
    return () => anterior?.focus()
  }, [])
  const teclas = (e: KeyboardEvent) => {
    if (e.key === 'Escape') return onFechar()
    if (e.key !== 'Tab') return
    const itens = [...ref.current!.querySelectorAll<HTMLElement>(FOCAVEL)]
    const [primeiro, ultimo] = [itens[0], itens.at(-1)!]
    if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo.focus() }
    else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus() }
  }
  return (
    <div className="fundo" onMouseDown={(e) => e.target === e.currentTarget && onFechar()}>
      <div ref={ref} className={`dialogo ${lado}`} role="dialog" aria-modal="true" aria-label={titulo} onKeyDown={teclas}>
        {cabecalho && <header><h2>{titulo}</h2><Botao soIcone variante="sutil" icone="fechar" aria-label="Fechar" onClick={onFechar} /></header>}
        <div className="corpo-dialogo">{children}</div>
      </div>
    </div>
  )
}
