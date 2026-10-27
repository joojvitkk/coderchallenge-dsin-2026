import { useId, type ReactNode } from 'react'
import { SITUACOES, type Filtros as F } from '../api/types'
import { rotulo } from '../lib/util'
import { Botao, Chip } from './Controles'
import { Icone } from './Icone'
import { Selecao, opcoesDe } from './Selecao'

export interface Opcoes { tipos: string[]; bairros: string[]; regioes: string[]; orgaos: string[] }

const Sel = ({ nome, valor, opcoes, onChange, barra }: { barra: boolean; nome: string; valor?: string; opcoes: string[]; onChange: (v: string) => void }) => {
  const id = useId()
  return (
    <div className="campo">
      <label htmlFor={id}>{rotulo(nome)}</label>
      <Selecao id={id} valor={valor ?? ''} opcoes={opcoesDe(opcoes, rotulo)} vazio={barra ? `${rotulo(nome)}: todos` : 'Todos'} onChange={onChange} />
    </div>
  )
}

/**
 * Busca + chips de situação + selects (compartilhado por Central e Inventário).
 * `painel`: selects recolhidos em "Mais filtros" (cabe num painel flutuante); `barra`: tudo numa linha (toolbar).
 */
export function Filtros({ valor, onChange, opcoes, variante = 'painel' }: { valor: F; onChange: (f: F) => void; opcoes: Opcoes; variante?: 'painel' | 'barra' }) {
  const set = (k: keyof F) => (v: string) => onChange({ ...valor, [k]: v || undefined })
  const alterna = (k: keyof F, v: string) => set(k)(valor[k] === v ? '' : v)
  const ativos = Object.entries(valor).filter(([k, v]) => v && k !== 'q').length
  const limpar = Object.values(valor).some(Boolean) ? () => onChange({}) : null
  const selects = (
    <div className="selects">
      <Sel barra={variante === 'barra'} nome="tipo" valor={valor.tipo} opcoes={opcoes.tipos} onChange={set('tipo')} />
      <Sel barra={variante === 'barra'} nome="regiao" valor={valor.regiao} opcoes={opcoes.regioes} onChange={set('regiao')} />
      <Sel barra={variante === 'barra'} nome="bairro" valor={valor.bairro} opcoes={opcoes.bairros} onChange={set('bairro')} />
      <Sel barra={variante === 'barra'} nome="orgao" valor={valor.orgao} opcoes={opcoes.orgaos} onChange={set('orgao')} />
    </div>
  )
  const chips: ReactNode = (
    <div className="chips" role="group" aria-label="Situação">
      {SITUACOES.map((s) => <Chip key={s} ativo={valor.situacao === s} icone={s} onClick={() => alterna('situacao', s)}>{rotulo(s)}</Chip>)}
      <Chip ativo={valor.precisa_manutencao === 'true'} icone="manutencao" onClick={() => alterna('precisa_manutencao', 'true')}>Precisa manutenção</Chip>
    </div>
  )
  return (
    <form className={`filtros v-${variante}`} role="search" aria-label="Filtros" onSubmit={(e) => e.preventDefault()}>
      <div className="linha-busca">
        <div className="busca">
          <Icone nome="buscar" />
          <input type="search" aria-label="Buscar" value={valor.q ?? ''} placeholder="Buscar série, marca, rua…" onChange={(e) => set('q')(e.target.value)} />
          {valor.q && <button type="button" className="limpa-busca" aria-label="Limpar busca" onClick={() => set('q')('')}><Icone nome="fechar" tam={14} /></button>}
        </div>
        {variante === 'painel' && limpar && <Botao soIcone variante="sutil" icone="fechar" aria-label="Limpar filtros" title="Limpar filtros" onClick={limpar} />}
      </div>
      {chips}
      {variante === 'barra' ? (
        <>{selects}{limpar && <Botao variante="sutil" pequeno icone="fechar" onClick={limpar}>Limpar</Botao>}</>
      ) : (
        <details className="mais">
          <summary><Icone nome="filtros" tam={14} />Mais filtros{ativos > 0 && ` (${ativos})`}<Icone nome="abaixo" tam={14} /></summary>
          {selects}
        </details>
      )}
    </form>
  )
}

