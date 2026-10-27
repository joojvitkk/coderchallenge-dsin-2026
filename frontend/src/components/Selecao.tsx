import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Flutuante } from './Flutuante'
import { Icone } from './Icone'

export interface Opcao { valor: string; rotulo: string; sub?: string }

const LIMITE_BUSCA = 8 // acima disso a lista ganha um campo de busca
const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/**
 * Select personalizado (padrão WAI-ARIA combobox + listbox): lista estilizada, busca em listas longas,
 * teclado completo (setas, Home/End, Enter, Esc, digitar a inicial) e abre para cima quando falta espaço.
 * `vazio` acrescenta a opção de valor "" com esse texto.
 */
export function Selecao({ id, valor, opcoes, onChange, vazio, obrigatorio, descrito, compacto }: {
  id?: string; valor: string; opcoes: readonly Opcao[]; onChange: (v: string) => void; vazio?: string; obrigatorio?: boolean; descrito?: string; compacto?: boolean
}) {
  const gerado = useId()
  const uid = id ?? gerado
  const todas = useMemo(() => (vazio === undefined ? opcoes : [{ valor: '', rotulo: vazio }, ...opcoes]), [opcoes, vazio])
  const [aberto, setAberto] = useState(false)
  const [busca, setBusca] = useState('')
  const [ativo, setAtivo] = useState(0)
  const botao = useRef<HTMLButtonElement>(null)
  const campo = useRef<HTMLInputElement>(null)
  const lista = useRef<HTMLUListElement>(null)
  const buscavel = todas.length > LIMITE_BUSCA
  const vistas = useMemo(() => { const q = norm(busca); return q ? todas.filter((o) => norm(o.rotulo).includes(q)) : todas }, [todas, busca])
  const atual = todas.find((o) => o.valor === valor)

  useEffect(() => { if (aberto && buscavel) campo.current?.focus() }, [aberto, buscavel])
  useEffect(() => { lista.current?.children[ativo]?.scrollIntoView?.({ block: 'nearest' }) }, [ativo, aberto])

  const abrir = () => { setBusca(''); setAtivo(Math.max(0, todas.findIndex((o) => o.valor === valor))); setAberto(true) }
  const fechar = (foco = true) => { setAberto(false); if (foco) botao.current?.focus() }
  const escolher = (o?: Opcao) => { if (o) onChange(o.valor); fechar() }

  const teclar = (e: KeyboardEvent) => {
    const n = vistas.length
    const vai = (i: number) => { e.preventDefault(); setAtivo(Math.max(0, Math.min(n - 1, i))) }
    if (!aberto) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); abrir() }
      return
    }
    if (e.key === 'ArrowDown') vai(ativo + 1)
    else if (e.key === 'ArrowUp') vai(ativo - 1)
    else if (e.key === 'Home') vai(0)
    else if (e.key === 'End') vai(n - 1)
    else if (e.key === 'Enter' || (e.key === ' ' && !buscavel)) { e.preventDefault(); escolher(vistas[ativo]) }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); fechar() }
    else if (e.key === 'Tab') setAberto(false)
    else if (!buscavel && e.key.length === 1) {
      const i = [...vistas.slice(ativo + 1), ...vistas.slice(0, ativo + 1)].findIndex((o) => norm(o.rotulo).startsWith(norm(e.key)))
      if (i >= 0) vai((ativo + 1 + i) % n)
    }
  }
  const lid = `${uid}-lista`
  const opId = (i: number) => `${uid}-o${i}`
  return (
    <span className="selw">
      <button ref={botao} id={uid} type="button" role="combobox" className={`sel${compacto ? ' compacto' : ''}`} aria-haspopup="listbox" aria-expanded={aberto}
        aria-controls={aberto ? lid : undefined} aria-describedby={descrito} aria-required={obrigatorio}
        aria-activedescendant={aberto && !buscavel && vistas[ativo] ? opId(ativo) : undefined}
        onClick={() => (aberto ? fechar(false) : abrir())} onKeyDown={teclar}>
        <span className={atual && atual.valor !== '' ? undefined : 'ph'}>{atual?.rotulo ?? (valor || vazio || 'Selecione')}</span>
        <Icone nome="abaixo" tam={14} />
      </button>
      {obrigatorio && <input className="sr" tabIndex={-1} aria-hidden="true" required value={valor} onChange={() => undefined} onFocus={() => botao.current?.focus()} />}
      {aberto && (
        <Flutuante ancora={botao} onFechar={() => setAberto(false)} altura={buscavel ? 340 : 280}>
          {buscavel && (
            <div className="flut-busca">
              <Icone nome="buscar" tam={14} />
              <input ref={campo} aria-label="Filtrar opções" aria-controls={lid} aria-activedescendant={vistas[ativo] ? opId(ativo) : undefined} placeholder="Buscar…" value={busca}
                onChange={(e) => { setBusca(e.target.value); setAtivo(0) }} onKeyDown={teclar} />
            </div>
          )}
          <ul ref={lista} id={lid} role="listbox" aria-label="Opções">
            {vistas.map((o, i) => (
              <li key={o.valor || '_vazio'} id={opId(i)} role="option" className="opcao" aria-selected={o.valor === valor} data-ativo={i === ativo || undefined}
                onMouseMove={() => i !== ativo && setAtivo(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => escolher(o)}>
                <span>{o.rotulo}</span>{o.sub && <small>{o.sub}</small>}{o.valor === valor && <Icone nome="confirmar" tam={14} />}
              </li>
            ))}
          </ul>
          {!vistas.length && <p className="flut-vazio">Nada encontrado</p>}
        </Flutuante>
      )}
    </span>
  )
}

/** Atalho: opções a partir de uma lista de textos (valor = texto) ou de um rótulo calculado. */
export const opcoesDe = (valores: readonly string[], rotulo: (v: string) => string = (v) => v): Opcao[] => valores.map((v) => ({ valor: v, rotulo: rotulo(v) }))
