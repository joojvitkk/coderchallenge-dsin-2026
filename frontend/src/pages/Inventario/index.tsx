import { useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Importar } from './Importar'
import { qs, useAgentes, useCrud, useEquipamentos, useTipos, type Recurso } from '../../api/client'
import { SITUACOES, type Agente, type Equipamento, type Filtros as F } from '../../api/types'
import { Botao, Segmentado } from '../../components/Controles'
import { Estado } from '../../components/Estado'
import { Icone } from '../../components/Icone'
import { Dialogo } from '../../components/Painel'
import { Avatar, Pilula } from '../../components/Pilula'
import { Filtros } from '../../components/Filtros'
import { camposDe, FormularioDinamico, type CampoDef, type Valores } from '../../components/FormularioDinamico'
import { useEscopo } from '../../hooks/useEscopo'
import { useOpcoes } from '../../hooks/useOpcoes'
import { buscarCep } from '../../lib/cep'
import { COR_AGENTE, COR_SITUACAO, rotulo } from '../../lib/util'

const txt = (nome: string, obrigatorio = false): CampoDef => ({ nome, obrigatorio, type: 'string' })
const num = (nome: string): CampoDef => ({ nome, obrigatorio: true, type: 'number' })
const sel = (nome: string, valores: readonly string[], obrigatorio = true): CampoDef => ({ nome, obrigatorio, type: 'string', enum: [...valores] })

/** CEP validado (00000-000); ao sair do campo consulta o ViaCEP e preenche rua, bairro, cidade e UF (offline: nada acontece). */
const cep = (): CampoDef => ({
  ...txt('cep', true), pattern: '\\d{5}-?\\d{3}', dica: 'formato 00000-000; preenche rua, bairro, cidade e UF quando há rede',
  aoPerder: (valor, aplicar) => { void buscarCep(valor).then((e) => e && aplicar({ ...e })) },
})
const BASE_EQ = (tipos: string[]): CampoDef[] => [
  sel('tipo', tipos), txt('serie', true), txt('marca', true), txt('modelo', true), txt('orgao', true), cep(), txt('bairro', true),
  txt('regiao', true), txt('cidade', true), txt('uf', true), txt('rua', true), { ...txt('referencia'), dica: 'livre: nº 181, oposto ao 181, KM 203, S/N, em frente ao Mercado do Tio…' }, num('lat'), num('lon'), sel('situacao', SITUACOES),
  sel('manutencao_tipo', ['nenhuma', 'agendada', 'imediata']), { nome: 'proxima_manutencao', obrigatorio: false, type: 'string', format: 'date' },
]
const CAMPOS_AGENTE: CampoDef[] = [
  txt('nome', true), txt('matricula', true), sel('categoria', ['transito', 'guarda', 'policia']), txt('orgao', true),
  txt('cidade', true), txt('uf', true), sel('status', ['ativo', 'inativo', 'em_ocorrencia']), num('lat'), num('lon'),
]
const NOVO_EQ: Valores = { situacao: 'nao_instalado', manutencao_tipo: 'nenhuma', cidade: 'Marília', uf: 'SP' }

type Alvo = { recurso: Recurso; id?: number; inicial: Valores } | null

function Editor({ alvo, onFim }: { alvo: NonNullable<Alvo>; onFim: () => void }) {
  const tipos = useTipos().data ?? {}
  const { salvar } = useCrud(alvo.recurso)
  const eq = alvo.recurso === 'equipamentos'
  const attrs = (v: Valores) => camposDe(tipos[String(v.tipo)]?.schema.properties, tipos[String(v.tipo)]?.schema.required)
  const campos = (v: Valores) => (eq ? [...BASE_EQ(Object.keys(tipos)), ...attrs(v)] : CAMPOS_AGENTE)

  const enviar = (v: Valores) => {
    const nomesAttr = new Set(eq ? attrs(v).map((c) => c.nome) : [])
    const base: Valores = {}
    const atributos: Valores = {}
    for (const [k, x] of Object.entries(v)) if (x !== undefined) (nomesAttr.has(k) ? atributos : base)[k] = x
    salvar.mutate({ id: alvo.id, dados: eq ? { ...base, atributos } : base }, { onSuccess: onFim })
  }
  return (
    <Dialogo titulo={`${alvo.id ? 'Editar' : 'Novo'} ${eq ? 'equipamento' : 'agente'}`} onFechar={onFim}>
      <FormularioDinamico campos={campos} inicial={alvo.inicial} onSubmit={enviar} onCancel={onFim}
        erro={salvar.error?.message} salvando={salvar.isPending} />
    </Dialogo>
  )
}

interface Col<T> { cab: string; cel: (r: T) => ReactNode; sec?: 1 | 2 | 3 }

const sub = (...partes: string[]) => <small>{partes.filter(Boolean).join(' · ')}</small>
const COLS_EQ: Col<Equipamento>[] = [
  { cab: 'Equipamento', cel: (e) => <><Avatar icone={e.tipo} cor={COR_SITUACAO[e.situacao]} /><span className="info"><b>{e.serie}</b>{sub(rotulo(e.tipo), `${e.marca} ${e.modelo}`)}</span></> },
  { cab: 'Local', sec: 3, cel: (e) => <span className="info">{e.bairro}{sub(`${e.cidade}/${e.uf}`)}</span> },
  { cab: 'Órgão', sec: 1, cel: (e) => e.orgao },
  { cab: 'Situação', cel: (e) => <Pilula cor={COR_SITUACAO[e.situacao]} icone={e.situacao}>{rotulo(e.situacao)}</Pilula> },
  { cab: 'Manutenção', sec: 2, cel: (e) => (e.manutencao_tipo === 'nenhuma' ? '—' : `${rotulo(e.manutencao_tipo)}${e.proxima_manutencao ? ` · ${e.proxima_manutencao}` : ''}`) },
]
const COLS_AGENTE: Col<Agente>[] = [
  { cab: 'Agente', cel: (a) => <><Avatar icone="agente" cor={COR_AGENTE[a.status]} /><span className="info"><b>{a.nome}</b>{sub(a.matricula, rotulo(a.categoria))}</span></> },
  { cab: 'Cidade', sec: 3, cel: (a) => `${a.cidade}/${a.uf}` },
  { cab: 'Órgão', sec: 1, cel: (a) => a.orgao },
  { cab: 'Status', cel: (a) => <Pilula cor={COR_AGENTE[a.status]} icone="agente">{rotulo(a.status)}</Pilula> },
]

/** Tabela densa: linha clicável abre a gaveta de edição; ações de editar/excluir aparecem no hover/foco. */
function Tabela<T extends { id: number }>({ recurso, q, colunas, nome, inicial, onEditar, plural }: {
  recurso: Recurso; q: { data?: T[]; isLoading: boolean; error: Error | null; refetch: () => unknown }
  colunas: Col<T>[]; nome: (r: T) => string; inicial: (r: T) => Valores; onEditar: (a: NonNullable<Alvo>) => void; plural: string
}) {
  const { excluir } = useCrud(recurso)
  return (
    <section className="painel tabela-card" aria-label={plural}>
      <Estado q={q} vazio={q.data?.length === 0} linhas={8}>
        <div className="tabela-wrap"><table>
          <thead><tr>{colunas.map((c) => <th key={c.cab} className={c.sec ? `sec-${c.sec}` : ''}>{c.cab}</th>)}<th><span className="sr">Ações</span></th></tr></thead>
          <tbody>
            {q.data?.map((r) => {
              const editar = () => onEditar({ recurso, id: r.id, inicial: inicial(r) })
              return (
                <tr key={r.id} onClick={editar}>
                  {colunas.map((c, i) => <td key={c.cab} className={c.sec ? `sec-${c.sec}` : ''}>{i === 0 ? <div className="principal">{c.cel(r)}</div> : c.cel(r)}</td>)}
                  <td onClick={(e) => e.stopPropagation()}>
                    <div className="acoes-linha">
                      <Botao soIcone variante="sutil" icone="editar" onClick={editar} aria-label={`Editar ${nome(r)}`} title="Editar" />
                      <Botao soIcone variante="sutil" icone="excluir" aria-label={`Excluir ${nome(r)}`} title="Excluir"
                        onClick={() => window.confirm(`Excluir ${nome(r)}?`) && excluir.mutate(r.id)} />
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table></div>
        <p className="rodape-tabela">{q.data?.length} {plural.toLowerCase()}</p>
      </Estado>
    </section>
  )
}

export default function Inventario() {
  const [params] = useSearchParams()
  const [aba, setAba] = useState<Recurso>('equipamentos')
  const [filtros, setFiltros] = useState<F>(() => (params.get('q') ? { q: params.get('q')! } : {}))
  const [alvo, setAlvo] = useState<Alvo>(null)
  const [importando, setImportando] = useState(false)
  const { escopo } = useEscopo()
  const opcoes = useOpcoes()
  const eqs = useEquipamentos(filtros)
  const ags = useAgentes()
  const novo = () => setAlvo({ recurso: aba, inicial: aba === 'equipamentos' ? NOVO_EQ : { categoria: 'transito', status: 'ativo' } })
  const conta = (n?: number) => (n === undefined ? '' : ` ${n}`)

  return (
    <>
      <div className="toolbar">
        <Segmentado rotulo="Recurso" valor={aba} onChange={(a) => { setAba(a); setAlvo(null) }}
          opcoes={[['equipamentos', `Equipamentos${conta(eqs.data?.length)}`], ['agentes', `Agentes${conta(ags.data?.length)}`]]} />
        <div className="acoes empurra">
          {aba === 'equipamentos' && (
            <>
              <a className="btn" href={`/api/equipamentos/exportar${qs({ ...filtros, ...escopo, formato: 'csv' })}`} download><Icone nome="baixar" />CSV</a>
              <a className="btn" href={`/api/equipamentos/exportar${qs({ ...filtros, ...escopo, formato: 'geojson' })}`} download><Icone nome="baixar" />GeoJSON</a>
              <Botao icone="enviar" onClick={() => setImportando(true)}>Importar</Botao>
            </>
          )}
          <Botao variante="primario" icone="mais" onClick={novo}>Novo {aba === 'equipamentos' ? 'equipamento' : 'agente'}</Botao>
        </div>
      </div>
      {aba === 'equipamentos' && <Filtros variante="barra" valor={filtros} onChange={setFiltros} opcoes={opcoes} />}
      {importando && <Importar onFim={() => setImportando(false)} />}
      {alvo && <Editor key={`${alvo.recurso}-${alvo.id ?? 'novo'}`} alvo={alvo} onFim={() => setAlvo(null)} />}
      {aba === 'equipamentos' ? (
        <Tabela recurso="equipamentos" plural="Equipamentos" q={eqs} colunas={COLS_EQ} nome={(e) => e.serie} inicial={(e) => ({ ...e, ...e.atributos })} onEditar={setAlvo} />
      ) : (
        <Tabela recurso="agentes" plural="Agentes" q={ags} colunas={COLS_AGENTE} nome={(a) => a.nome} inicial={(a) => ({ ...a })} onEditar={setAlvo} />
      )}
    </>
  )
}
