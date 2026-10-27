import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { Flutuante } from './Flutuante'
import { Icone } from './Icone'

const pad = (n: number) => String(n).padStart(2, '0')
export const isoDe = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const lerIso = (s?: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s ?? ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null }
const fmt = (o: Intl.DateTimeFormatOptions, d: Date) => new Intl.DateTimeFormat('pt-BR', o).format(d)
const cap = (s: string) => s[0].toUpperCase() + s.slice(1)
const MESES = Array.from({ length: 12 }, (_, i) => cap(fmt({ month: 'long' }, new Date(2000, i, 1))))
const SEMANA = Array.from({ length: 7 }, (_, i) => new Date(2023, 0, 1 + i)) // 01/01/2023 foi domingo
const soDia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
/** Soma meses mantendo o dia dentro do mês de destino (31/01 + 1 mês = 28/02). */
const somaMes = (d: Date, n: number) => { const t = new Date(d.getFullYear(), d.getMonth() + n, 1); t.setDate(Math.min(d.getDate(), new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate())); return t }

/**
 * Seletor de data personalizado (valor ISO `aaaa-mm-dd`): calendário em grade com navegação por mês/ano,
 * "Hoje", "Limpar", limites `min`/`max` e teclado (setas, PgUp/PgDn, Home/End, Enter, Esc).
 */
export function Data({ id, valor, onChange, min, max, obrigatorio, descrito }: {
  id?: string; valor: string; onChange: (v: string) => void; min?: string; max?: string; obrigatorio?: boolean; descrito?: string
}) {
  const gerado = useId()
  const uid = id ?? gerado
  const sel = lerIso(valor)
  const [aberto, setAberto] = useState(false)
  const [cursor, setCursor] = useState(() => sel ?? soDia(new Date()))
  const [modo, setModo] = useState<'dias' | 'meses'>('dias')
  const botao = useRef<HTMLButtonElement>(null)
  const grade = useRef<HTMLTableElement>(null)
  const moveu = useRef(false)
  const hoje = soDia(new Date())
  const [lo, hi] = [lerIso(min), lerIso(max)]
  const fora = (d: Date) => (lo && d < lo) || (hi && d > hi) || false

  useEffect(() => {
    if (aberto && modo === 'dias') { grade.current?.querySelector<HTMLElement>('button[tabindex="0"]')?.focus({ preventScroll: true }); moveu.current = false }
  }, [aberto, modo, cursor.getMonth(), cursor.getFullYear()]) // eslint-disable-line react-hooks/exhaustive-deps

  const abrir = () => { setCursor(sel ?? hoje); setModo('dias'); setAberto(true) }
  const fechar = (foco = true) => { setAberto(false); if (foco) botao.current?.focus() }
  const escolher = (d: Date) => { if (fora(d)) return; onChange(isoDe(d)); fechar() }
  const mover = (d: Date) => { moveu.current = true; setCursor(d) }

  const teclar = (e: KeyboardEvent) => {
    const { key, shiftKey } = e
    const [a, m, d] = [cursor.getFullYear(), cursor.getMonth(), cursor.getDate()]
    const alvo: Record<string, Date> = {
      ArrowLeft: new Date(a, m, d - 1), ArrowRight: new Date(a, m, d + 1), ArrowUp: new Date(a, m, d - 7), ArrowDown: new Date(a, m, d + 7),
      Home: new Date(a, m, d - cursor.getDay()), End: new Date(a, m, d + 6 - cursor.getDay()),
      PageUp: somaMes(cursor, shiftKey ? -12 : -1), PageDown: somaMes(cursor, shiftKey ? 12 : 1),
    }
    if (key === 'Escape') { e.preventDefault(); e.stopPropagation(); fechar() }
    else if (key === 'Tab') { e.preventDefault(); fechar() }
    else if (alvo[key]) { e.preventDefault(); mover(alvo[key]) }
  }

  const primeiro = new Date(cursor.getFullYear(), cursor.getMonth(), 1)
  const inicio = new Date(primeiro.getFullYear(), primeiro.getMonth(), 1 - primeiro.getDay())
  const semanas = Array.from({ length: 6 }, (_, w) => Array.from({ length: 7 }, (_, i) => new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + w * 7 + i)))
  const titulo = `${MESES[cursor.getMonth()]} de ${cursor.getFullYear()}`
  return (
    <span className="selw">
      <button ref={botao} id={uid} type="button" className="sel" aria-haspopup="dialog" aria-expanded={aberto} aria-describedby={descrito}
        onClick={() => (aberto ? fechar(false) : abrir())} onKeyDown={(e) => { if (e.key === 'ArrowDown' && !aberto) { e.preventDefault(); abrir() } }}>
        <span className={sel ? undefined : 'ph'}>{sel ? fmt({ day: '2-digit', month: '2-digit', year: 'numeric' }, sel) : 'dd/mm/aaaa'}</span>
        <Icone nome="calendario" tam={14} />
      </button>
      {obrigatorio && <input className="sr" tabIndex={-1} aria-hidden="true" required value={valor} onChange={() => undefined} onFocus={() => botao.current?.focus()} />}
      {aberto && (
        <Flutuante ancora={botao} onFechar={() => setAberto(false)} altura={400} largura={296} className="cal" role="dialog" aria-label="Escolher data" onKeyDown={teclar}>
          <div className="cal-cab">
            <button type="button" className="btn sutil icone" aria-label={modo === 'dias' ? 'Mês anterior' : 'Ano anterior'} onClick={() => mover(somaMes(cursor, modo === 'dias' ? -1 : -12))}><Icone nome="esquerda" /></button>
            <button type="button" className="cal-titulo" aria-live="polite" onClick={() => setModo(modo === 'dias' ? 'meses' : 'dias')}>
              {modo === 'dias' ? titulo : cursor.getFullYear()}<Icone nome="abaixo" tam={12} />
            </button>
            <button type="button" className="btn sutil icone" aria-label={modo === 'dias' ? 'Próximo mês' : 'Próximo ano'} onClick={() => mover(somaMes(cursor, modo === 'dias' ? 1 : 12))}><Icone nome="direita" /></button>
          </div>
          {modo === 'meses' ? (
            <div className="cal-meses">
              {MESES.map((nome, i) => (
                <button key={nome} type="button" aria-pressed={i === cursor.getMonth()} onClick={() => { setCursor(somaMes(new Date(cursor.getFullYear(), i, cursor.getDate()), 0)); setModo('dias') }}>{nome.slice(0, 3)}</button>
              ))}
            </div>
          ) : (
            <table ref={grade} role="grid" aria-label={titulo}>
              <thead><tr>{SEMANA.map((d) => <th key={d.getDay()} scope="col" abbr={cap(fmt({ weekday: 'long' }, d))}>{cap(fmt({ weekday: 'narrow' }, d))}</th>)}</tr></thead>
              <tbody>
                {semanas.map((sem) => (
                  <tr key={sem[0].getTime()}>
                    {sem.map((d) => {
                      const foco = isoDe(d) === isoDe(cursor)
                      const escolhido = !!sel && isoDe(d) === isoDe(sel)
                      return (
                        <td key={d.getTime()} role="gridcell" aria-selected={escolhido}>
                          <button type="button" tabIndex={foco ? 0 : -1} disabled={fora(d)} aria-label={fmt({ dateStyle: 'full' }, d)} aria-current={isoDe(d) === isoDe(hoje) ? 'date' : undefined}
                            className={`dia${d.getMonth() === cursor.getMonth() ? '' : ' fora'}${escolhido ? ' sel-dia' : ''}`} onClick={() => escolher(d)}>{d.getDate()}</button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="cal-rodape">
            <button type="button" className="btn sutil pequeno" disabled={fora(hoje)} onClick={() => escolher(hoje)}>Hoje</button>
            {!obrigatorio && valor && <button type="button" className="btn sutil pequeno" onClick={() => { onChange(''); fechar() }}>Limpar</button>}
          </div>
        </Flutuante>
      )}
    </span>
  )
}
