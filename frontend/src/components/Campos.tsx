import { useEffect, useId, useRef, useState, type DragEvent, type InputHTMLAttributes } from 'react'
import { Icone } from './Icone'

const NUM = /^-?\d*[.,]?\d*$/

/** Campo numérico personalizado: texto filtrado + botões −/+ (sem as setas nativas), limites validados com mensagem própria. */
export function Numero({ id, valor, onChange, inteiro, min, max, obrigatorio, descrito }: {
  id?: string; valor: string; onChange: (v: string) => void; inteiro?: boolean; min?: number; max?: number; obrigatorio?: boolean; descrito?: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  const n = Number(valor.replace(',', '.'))
  const invalido = valor !== '' && (Number.isNaN(n) || (min !== undefined && n < min) || (max !== undefined && n > max))
  useEffect(() => { ref.current?.setCustomValidity(invalido ? `Informe um valor${min !== undefined ? ` a partir de ${min}` : ''}${max !== undefined ? ` até ${max}` : ''}` : '') }, [invalido, min, max])
  const passo = (d: 1 | -1) => {
    const base = Number.isNaN(n) || valor === '' ? (min ?? 0) - (d > 0 ? (inteiro ? 1 : 0.1) : 0) : n
    const prox = Number((base + d * (inteiro ? 1 : 0.1)).toFixed(6))
    onChange(String(Math.min(max ?? Infinity, Math.max(min ?? -Infinity, prox))))
  }
  return (
    <div className="num">
      <input ref={ref} id={id} inputMode={inteiro ? 'numeric' : 'decimal'} autoComplete="off" required={obrigatorio} aria-describedby={descrito} aria-invalid={invalido || undefined}
        value={valor} onChange={(e) => NUM.test(e.target.value) && onChange(e.target.value.replace(',', '.'))} />
      <span className="passos">
        <button type="button" tabIndex={-1} aria-label="Diminuir" onClick={() => passo(-1)}><Icone nome="menos" tam={14} /></button>
        <button type="button" tabIndex={-1} aria-label="Aumentar" onClick={() => passo(1)}><Icone nome="mais" tam={14} /></button>
      </span>
    </div>
  )
}

/** Interruptor (substitui o checkbox): role=switch, rótulo pelo `<label htmlFor>` do campo. */
export const Alternar = ({ id, ligado, onChange, descrito }: { id?: string; ligado: boolean; onChange: (v: boolean) => void; descrito?: string }) => (
  <button id={id} type="button" role="switch" className="sw" aria-checked={ligado} aria-describedby={descrito} onClick={() => onChange(!ligado)} />
)

/** Slider estilizado: a parte já percorrida da trilha é preenchida (variável CSS --p). */
export function Intervalo({ min = 0, max = 100, value, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { min: number; max: number; value: number }) {
  const p = max > min ? ((value - min) / (max - min)) * 100 : 0
  return <input {...rest} type="range" min={min} max={max} value={value} style={{ '--p': `${p}%` } as React.CSSProperties} />
}

const tamanho = (b: number) => (b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1048576).toFixed(1)} MB`)

/** Área de envio de arquivo: clique, teclado ou arrastar e soltar; mostra nome e tamanho do arquivo escolhido. */
export function Arquivo({ id, accept, arquivo, onEscolher }: { id?: string; accept: string; arquivo: File | null; onEscolher: (f?: File) => void }) {
  const gerado = useId()
  const uid = id ?? gerado
  const [sobre, setSobre] = useState(false)
  const soltar = (e: DragEvent) => { e.preventDefault(); setSobre(false); onEscolher(e.dataTransfer.files?.[0]) }
  return (
    <label htmlFor={uid} className={`drop${sobre ? ' sobre' : ''}`} onDragOver={(e) => { e.preventDefault(); setSobre(true) }} onDragLeave={() => setSobre(false)} onDrop={soltar}>
      <input id={uid} className="sr" type="file" accept={accept} onChange={(e) => onEscolher(e.target.files?.[0])} />
      <Icone nome={arquivo ? 'briefing' : 'enviar'} tam={24} />
      {arquivo ? <span><b>{arquivo.name}</b> · {tamanho(arquivo.size)}</span> : <span><b>Escolha um arquivo</b> ou arraste até aqui</span>}
      <small>{arquivo ? 'Clique para trocar' : 'CSV ou GeoJSON'}</small>
    </label>
  )
}
