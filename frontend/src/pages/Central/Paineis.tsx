import type { UseQueryResult } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLinhaDoTempo } from '../../api/client'
import type { Agente, Agrupamento, Alerta, Equipamento, Grupo, Telemetria } from '../../api/types'
import { Botao, Segmentado } from '../../components/Controles'
import { Estado } from '../../components/Estado'
import { Painel } from '../../components/Painel'
import { Avatar, Pilula } from '../../components/Pilula'
import { COR_AGENTE, COR_SITUACAO, corRisco, dataHora, diasAte, nomeEq, pct, rotulo, urgenciaManut } from '../../lib/util'
import { tituloAlerta } from './Alertas'

const AGRUPAR = [['regiao', 'Região'], ['cidade', 'Cidade'], ['uf', 'UF']] as const
const ESTADO = { normal: ['Normal', 'var(--ok)', 'operacional'], atencao: ['Atenção', 'var(--alerta)', 'mau_funcionamento'], critico: ['Crítico', 'var(--crit)', 'furtado'] } as const

/** Atributos aninhados (objetos) viram uma linha por chave; listas viram texto. */
const achatar = ([k, v]: [string, unknown]): [string, unknown][] =>
  v && typeof v === 'object' && !Array.isArray(v) ? Object.entries(v) : [[k, Array.isArray(v) ? v.join(', ') : v]]

/** "em 3 dias", "hoje", "atrasada há 2 dias" para uma data de manutenção. */
function prazoManut(data: string): { texto: string; cor: string } {
  const d = diasAte(data)
  if (d < 0) return { texto: `atrasada há ${-d} dia${d === -1 ? '' : 's'}`, cor: 'var(--crit)' }
  if (d === 0) return { texto: 'hoje', cor: 'var(--alerta)' }
  return { texto: `em ${d} dia${d === 1 ? '' : 's'}`, cor: d <= 7 ? 'var(--alerta)' : 'var(--neutro)' }
}

/** Linha do tempo do equipamento (alertas, mudanças de situação e alterações de cadastro); só consulta ao abrir. */
function Historico({ id }: { id: number }) {
  const [aberto, setAberto] = useState(false)
  const q = useLinhaDoTempo(aberto ? id : null)
  return (
    <details className="dados" onToggle={(e) => setAberto(e.currentTarget.open)}>
      <summary>Histórico e auditoria</summary>
      {aberto && (
        <Estado q={q} vazio={q.data?.length === 0} linhas={3}>
          <ul aria-label="Linha do tempo do equipamento">
            {q.data?.slice(0, 12).map((i, n) => (
              <li key={n} className="linha"><span className="info"><b>{i.titulo}</b><small>{dataHora(i.ts)} · {rotulo(i.tipo)}</small></span></li>
            ))}
          </ul>
        </Estado>
      )}
    </details>
  )
}

export function DetalheEq({ eq, metricas, onFechar, onIncidente }: { eq: Equipamento; metricas?: Telemetria['metricas']; onFechar: () => void; onIncidente: (bairro: string) => void }) {
  const prazo = eq.proxima_manutencao ? prazoManut(eq.proxima_manutencao) : null
  const itens: [string, unknown][] = [
    ['Marca / modelo', `${eq.marca} ${eq.modelo}`], ['Órgão', eq.orgao], ['CEP', eq.cep], ['Referência', eq.referencia],
    ['Manutenção', eq.manutencao_tipo === 'nenhuma' ? 'Nenhuma' : `${rotulo(eq.manutencao_tipo)} ${eq.proxima_manutencao ?? ''}${prazo ? ` (${prazo.texto})` : ''}`],
    ...Object.entries(eq.atributos).flatMap(achatar), ...Object.entries(metricas ?? {}).map(([k, v]): [string, unknown] => [`${rotulo(k)} (ao vivo)`, v]),
  ]
  return (
    <Painel titulo={nomeEq(eq)} className="flut auto" acoes={<Botao soIcone variante="sutil" icone="fechar" aria-label="Fechar detalhe" onClick={onFechar} />}>
      <div className="cab-detalhe">
        <Avatar icone={eq.tipo} cor={COR_SITUACAO[eq.situacao]} />
        <div className="info">
          <small>{eq.rua}, {eq.bairro} — {eq.cidade}/{eq.uf}</small>
          <Pilula cor={COR_SITUACAO[eq.situacao]} icone={eq.situacao}>{rotulo(eq.situacao)}</Pilula>
        </div>
      </div>
      <dl className="detalhe">{itens.filter(([, v]) => v).map(([k, v]) => <div key={k}><dt>{rotulo(k)}</dt><dd>{String(v)}</dd></div>)}</dl>
      <Historico id={eq.id} />
      <div className="acoes">
        <Link className="btn pequeno" to={`/inventario?q=${eq.serie}`}>Ver no inventário</Link>
        <Botao pequeno variante="perigo" icone="incidente" onClick={() => onIncidente(eq.bairro)}>Simular incidente aqui</Botao>
      </div>
    </Painel>
  )
}

export function DetalheAgente({ ag, alerta, onFechar, onVerAlerta }: { ag: Agente; alerta?: Alerta; onFechar: () => void; onVerAlerta: (id: number) => void }) {
  const itens: [string, string][] = [['Matrícula', ag.matricula], ['Categoria', rotulo(ag.categoria)], ['Órgão', ag.orgao], ['Cidade', `${ag.cidade}/${ag.uf}`]]
  return (
    <Painel titulo={ag.nome} className="flut auto" acoes={<Botao soIcone variante="sutil" icone="fechar" aria-label="Fechar detalhe" onClick={onFechar} />}>
      <div className="cab-detalhe">
        <Avatar icone="agente" cor={COR_AGENTE[ag.status]} />
        <div className="info"><small>{ag.lat.toFixed(4)}, {ag.lon.toFixed(4)}</small><Pilula cor={COR_AGENTE[ag.status]} icone="agente">{rotulo(ag.status)}</Pilula></div>
      </div>
      <dl className="detalhe">{itens.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
      {alerta && <Botao pequeno icone="alertas" onClick={() => onVerAlerta(alerta.id)}>Atendendo: {tituloAlerta(alerta)}</Botao>}
    </Painel>
  )
}

/** Manutenção: imediatas, depois as próximas da data (até 7 dias ou atrasadas), depois as agendadas mais adiante. */
export function Manutencao({ q, onVer }: { q: UseQueryResult<Equipamento[]>; onVer: (id: number) => void }) {
  const grupos = [
    ['Imediata', (e: Equipamento) => urgenciaManut(e) === 'imediata'],
    ['Próxima da data (7 dias)', (e: Equipamento) => urgenciaManut(e) === 'proxima'],
    ['Agendada mais adiante', (e: Equipamento) => urgenciaManut(e) === null],
  ] as const
  return (
    <Estado q={q} vazio={q.data?.length === 0} linhas={4}>
      {grupos.map(([nome, ok]) => {
        const l = q.data?.filter(ok) ?? []
        return l.length > 0 && (
          <div key={nome}>
            <h3 className="titulo-grupo">{nome} ({l.length})</h3>
            <ul>
              {l.map((e) => {
                const prazo = e.proxima_manutencao ? prazoManut(e.proxima_manutencao) : null
                return (
                  <li key={e.id}>
                    <button type="button" className="linha" onClick={() => onVer(e.id)}>
                      <Avatar icone={e.tipo} cor={COR_SITUACAO[e.situacao]} />
                      <span className="info"><b>{nomeEq(e)}</b><small>{e.bairro}, {e.cidade}</small></span>
                      {prazo ? <Pilula cor={prazo.cor} icone="relogio">{prazo.texto}</Pilula> : <Pilula cor="var(--crit)" icone="manutencao">imediata</Pilula>}
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
    </Estado>
  )
}

/** Agentes em atividade: ativos e em ocorrência primeiro; o clique leva ao agente no mapa. */
export function AgentesLista({ q, onVer }: { q: UseQueryResult<Agente[]>; onVer: (id: number) => void }) {
  const lista = useMemo(() => (q.data ?? []).filter((a) => a.status !== 'inativo').sort((a, b) => Number(b.status === 'em_ocorrencia') - Number(a.status === 'em_ocorrencia')), [q.data])
  return (
    <Estado q={q} vazio={lista.length === 0} linhas={4}>
      <ul aria-label="Agentes em atividade">
        {lista.slice(0, 60).map((a) => (
          <li key={a.id}>
            <button type="button" className="linha" onClick={() => onVer(a.id)} aria-label={`Ver agente ${a.nome} no mapa`}>
              <Avatar icone="agente" cor={COR_AGENTE[a.status]} />
              <span className="info"><b>{a.nome}</b><small>{rotulo(a.categoria)} · {a.cidade}/{a.uf}</small></span>
              <Pilula cor={COR_AGENTE[a.status]}>{rotulo(a.status)}</Pilula>
            </button>
          </li>
        ))}
      </ul>
    </Estado>
  )
}

/** Visão consolidada: cada região/cidade/UF aparece como Normal, Atenção ou Crítico (e as que exigem atenção vêm primeiro). */
export function Saude({ q, por, onPor }: { q: UseQueryResult<Grupo[]>; por: Agrupamento; onPor: (p: Agrupamento) => void }) {
  const dados = useMemo(() => [...(q.data ?? [])].sort((a, b) => a.saude - b.saude), [q.data]) // piores primeiro
  const atencao = dados.filter((g) => g.estado !== 'normal').length
  return (
    <Painel titulo="Saúde" className="flut auto" acoes={<Segmentado rotulo="Agrupar por" opcoes={AGRUPAR} valor={por} onChange={onPor} />}>
      <Estado q={q} vazio={dados.length === 0} linhas={4}>
        <p className="estado-texto" aria-live="polite">
          {atencao === 0 ? 'Todas operam normalmente.' : `${dados.length - atencao} operam normalmente · ${atencao} exigem atenção`}
        </p>
        <ul aria-label={`Saúde por ${por}, em porcentagem`}>
          {dados.map((g) => {
            const [txt, cor, icone] = ESTADO[g.estado]
            return (
              <li key={g.nome} className="barra-h com-estado">
                <span title={`${g.nome}: ${g.alertas_criticos} alerta(s) grave(s) aberto(s), ${pct(g.disponibilidade_pct)} disponível`}>{g.nome}</span>
                <span className="trilho" aria-hidden="true"><i style={{ width: `${g.saude}%`, '--c': corRisco(100 - g.saude) } as React.CSSProperties} /></span>
                <b>{pct(Math.floor(g.saude))}</b>
                <Pilula cor={cor} icone={icone}>{txt}</Pilula>
              </li>
            )
          })}
        </ul>
      </Estado>
    </Painel>
  )
}
