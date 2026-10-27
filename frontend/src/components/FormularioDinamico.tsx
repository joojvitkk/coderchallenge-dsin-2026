import { useState } from 'react'
import type { CampoSchema } from '../api/types'
import { Alternar, Numero } from './Campos'
import { Botao } from './Controles'
import { Data } from './Data'
import { Selecao, opcoesDe } from './Selecao'
import { rotulo } from '../lib/util'

export type Valores = Record<string, unknown>

/** `dica` aparece sob o campo; `aoPerder` roda ao sair do campo e pode preencher outros (`aplicar`), como o CEP -> endereço. */
export interface CampoDef extends CampoSchema {
  nome: string
  obrigatorio: boolean
  dica?: string
  aoPerder?: (valor: string, aplicar: (patch: Valores) => void) => void
}

/** Converte propriedades de um JSON Schema em definições de campo. */
export function camposDe(props: Record<string, CampoSchema> = {}, required: string[] = []): CampoDef[] {
  return Object.entries(props).map(([nome, c]) => ({ ...c, nome, obrigatorio: required.includes(nome) }))
}

export function converter(c: CampoSchema, bruto: string | boolean): unknown {
  if (c.type === 'boolean') return bruto
  if (bruto === '') return undefined
  if (c.type === 'integer' || c.type === 'number') return Number(bruto)
  if (c.type === 'array') return String(bruto).split(',').map((x) => x.trim()).filter(Boolean)
  if (c.type === 'object') try { return JSON.parse(String(bruto)) } catch { return bruto }
  return bruto
}

const mostrar = (v: unknown) =>
  Array.isArray(v) ? v.join(', ') : v !== null && typeof v === 'object' ? JSON.stringify(v) : String(v ?? '')

function Campo({ c, valor, onChange, aplicar }: { c: CampoDef; valor: unknown; onChange: (v: unknown) => void; aplicar: (p: Valores) => void }) {
  const id = `f-${c.nome}`
  const dica = c.dica ?? (c.type === 'array' ? 'separe por vírgulas' : c.type === 'object' ? 'formato JSON' : undefined)
  const descrito = dica ? `${id}-d` : undefined
  const comum = { id, required: c.obrigatorio, 'aria-describedby': descrito }
  const texto = mostrar(valor)
  let input
  if (c.type === 'boolean') input = <Alternar id={id} ligado={Boolean(valor)} descrito={descrito} onChange={(v) => onChange(converter(c, v))} />
  else if (c.enum) input = <Selecao id={id} valor={String(valor ?? '')} opcoes={opcoesDe(c.enum, rotulo)} vazio="—" obrigatorio={c.obrigatorio} descrito={descrito} onChange={(v) => onChange(converter(c, v))} />
  else if (c.format === 'date') input = <Data id={id} valor={texto} obrigatorio={c.obrigatorio} descrito={descrito} onChange={(v) => onChange(converter(c, v))} />
  else if (c.type === 'integer' || c.type === 'number')
    input = <Numero id={id} valor={texto} inteiro={c.type === 'integer'} min={c.minimum ?? c.exclusiveMinimum} max={c.maximum} obrigatorio={c.obrigatorio} descrito={descrito} onChange={(v) => onChange(converter(c, v))} />
  else
    input = (
      <input {...comum} type="text" value={texto} pattern={c.pattern} title={c.pattern ? c.dica : undefined} onChange={(e) => onChange(converter(c, e.target.value))}
        onBlur={(e) => c.aoPerder?.(e.target.value, aplicar)} />
    )
  return (
    <div className={`campo${c.type === 'boolean' ? ' check' : ''}`}>
      <label htmlFor={id}>{rotulo(c.nome)}{c.obrigatorio && <abbr title="obrigatório"> *</abbr>}</label>
      {input}
      {dica && <small id={`${id}-d`}>{dica}</small>}
    </div>
  )
}

/** Formulário gerado a partir de campos (JSON Schema); estado local, devolve o objeto no submit. */
export function FormularioDinamico({ campos, inicial, onSubmit, onCancel, erro, salvando }: {
  campos: (v: Valores) => CampoDef[]; inicial: Valores; onSubmit: (v: Valores) => void; onCancel: () => void; erro?: string; salvando?: boolean
}) {
  const [v, setV] = useState<Valores>(inicial)
  return (
    <form className="form" onSubmit={(e) => { e.preventDefault(); onSubmit(v) }}>
      <div className="grade-form">
        {campos(v).map((c) => <Campo key={c.nome} c={c} valor={v[c.nome]} onChange={(x) => setV((p) => ({ ...p, [c.nome]: x }))} aplicar={(patch) => setV((p) => ({ ...p, ...patch }))} />)}
      </div>
      <div className="form-rodape">
        <p className="erro" role="alert">{erro}</p>
        <Botao onClick={onCancel}>Cancelar</Botao>
        <Botao type="submit" variante="primario" carregando={salvando}>Salvar</Botao>
      </div>
    </form>
  )
}
