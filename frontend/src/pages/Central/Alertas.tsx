import type { UseQueryResult } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useAlertaAcoes, useAuditoria } from '../../api/client'
import type { Agente, Alerta, StatusAlerta } from '../../api/types'
import { Botao, Segmentado } from '../../components/Controles'
import { Estado } from '../../components/Estado'
import { Painel } from '../../components/Painel'
import { Avatar, Pilula } from '../../components/Pilula'
import { useAgora } from '../../hooks/useAgora'
import { COR_SEV, dataHora, distanciaKm, etaMin, haQuanto, nomeEq, rotulo, SEV, utc } from '../../lib/util'

const ICONE_ALERTA: Record<string, string> = { falha: 'mau_funcionamento', ocorrencia: 'alertas', alerta: 'alertas' }
const COR_STATUS: Record<StatusAlerta, string> = { aberto: 'var(--crit)', reconhecido: 'var(--info)', em_atendimento: 'var(--alerta)', resolvido: 'var(--ok)' }
const TXT_STATUS: Record<StatusAlerta, string> = { aberto: 'Aberto', reconhecido: 'Reconhecido', em_atendimento: 'Em atendimento', resolvido: 'Resolvido' }

/** Situação do prazo de reconhecimento (SLA): só importa enquanto o alerta está aberto. */
function textoSla(a: Alerta, agora: number): { texto: string; estourado: boolean } | null {
  if (a.status !== 'aberto') return null
  const min = Math.ceil((+utc(a.sla_prazo) - agora) / 60000)
  return min <= 0 ? { texto: `SLA estourado há ${-min} min`, estourado: true } : { texto: `SLA: reconhecer em ${min} min`, estourado: false }
}

export const tituloAlerta = (a: Alerta) => `${rotulo(a.tipo)}${a.equipamento ? ` · ${nomeEq(a.equipamento)}` : ''}`

/** Lista de alertas abertos: mais graves primeiro, com repetições agrupadas (×N), status e SLA. */
export function Alertas({ q, sel, onSel }: { q: UseQueryResult<Alerta[]>; sel: number | null; onSel: (id: number) => void }) {
  const [graves, setGraves] = useState(false)
  const agora = useAgora()
  const lista = useMemo(
    () => (q.data ?? []).filter((a) => !graves || a.severidade >= 3).sort((a, b) => b.severidade - a.severidade || +utc(b.ts) - +utc(a.ts)),
    [q.data, graves],
  )
  return (
    <>
      <Segmentado rotulo="Gravidade" valor={graves ? 'graves' : 'todos'} onChange={(v) => setGraves(v === 'graves')} opcoes={[['todos', 'Todos'], ['graves', 'Alta e crítica']]} />
      <Estado q={q} vazio={lista.length === 0} linhas={4}>
        <ul className="lista-sep" aria-label="Alertas abertos">
          {lista.map((a) => {
            const sla = textoSla(a, agora)
            return (
              <li key={a.id} className="novo">
                <button type="button" className="linha" aria-pressed={sel === a.id} onClick={() => onSel(a.id)} aria-label={`${SEV[a.severidade]}: ${tituloAlerta(a)} em ${a.bairro}`}>
                  <Avatar icone={ICONE_ALERTA[a.tipo] ?? 'alertas'} cor={COR_SEV[a.severidade]} />
                  <span className="info">
                    <b>{tituloAlerta(a)}{a.ocorrencias > 1 && <span className="rep" title={`${a.ocorrencias} ocorrências agrupadas`}> ×{a.ocorrencias}</span>}</b>
                    <small>{a.bairro} · {haQuanto(a.ts, agora)}{sla?.estourado ? ' · SLA estourado' : ''}</small>
                  </span>
                  <span className="lado">
                    <Pilula cor={COR_SEV[a.severidade]}>{SEV[a.severidade]}</Pilula>
                    <small style={{ color: COR_STATUS[a.status] }}>{TXT_STATUS[a.status]}</small>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </Estado>
    </>
  )
}

/** Detalhe de um alerta com as ações do ciclo de vida: reconhecer, despachar (ETA) e resolver, mais a trilha de auditoria. */
export function DetalheAlerta({ a, agentes, onFechar, onMsg }: { a: Alerta; agentes: Agente[]; onFechar: () => void; onMsg: (m: string) => void }) {
  const agora = useAgora(5000)
  const { reconhecer, despachar, resolver } = useAlertaAcoes()
  const trilha = useAuditoria('alerta', a.id)
  const agente = agentes.find((x) => x.id === a.agente_id)
  const km = agente ? distanciaKm(agente, a) : null
  const sla = textoSla(a, agora)
  const falha = [reconhecer, despachar, resolver].find((m) => m.error)?.error?.message
  return (
    <Painel titulo={tituloAlerta(a)} className="flut auto" acoes={<Botao soIcone variante="sutil" icone="fechar" aria-label="Fechar detalhe" onClick={onFechar} />}>
      <div className="cab-detalhe">
        <Avatar icone={ICONE_ALERTA[a.tipo] ?? 'alertas'} cor={COR_SEV[a.severidade]} />
        <div className="info">
          <small>{a.bairro} — {a.cidade}/{a.uf}</small>
          <span className="chips">
            <Pilula cor={COR_SEV[a.severidade]}>{SEV[a.severidade]}</Pilula>
            <Pilula cor={COR_STATUS[a.status]}>{TXT_STATUS[a.status]}</Pilula>
            {sla && <Pilula cor={sla.estourado ? 'var(--crit)' : 'var(--neutro)'} icone="relogio">{sla.texto}</Pilula>}
          </span>
        </div>
      </div>
      <dl className="detalhe">
        <div><dt>Início</dt><dd>{dataHora(a.inicio)}</dd></div>
        <div><dt>Ocorrências</dt><dd>{a.ocorrencias}{a.ocorrencias > 1 ? ' (agrupadas)' : ''}</dd></div>
        <div className="larga"><dt>Despacho</dt><dd>
          {!agente ? 'Nenhum agente designado'
            : a.status === 'em_atendimento' ? `${agente.nome} está no local`
            : `${agente.nome} a ${km!.toFixed(1)} km · ETA ~${etaMin(km!)} min`}
        </dd></div>
      </dl>
      <div className="acoes">
        {a.status === 'aberto' && <Botao pequeno icone="info" carregando={reconhecer.isPending} onClick={() => reconhecer.mutate(a.id, { onSuccess: () => onMsg('Alerta reconhecido') })}>Reconhecer</Botao>}
        {a.status !== 'em_atendimento' && (
          <Botao pequeno variante="primario" icone="agente" carregando={despachar.isPending}
            onClick={() => despachar.mutate({ id: a.id }, { onSuccess: (d) => onMsg(`${d.agente.nome} despachado: ${d.distancia_km.toFixed(1)} km, ETA ~${d.eta_min} min`) })}>
            {agente ? 'Redespachar' : 'Despachar agente mais próximo'}
          </Botao>
        )}
        <Botao pequeno icone="operacional" carregando={resolver.isPending} onClick={() => resolver.mutate(a.id, { onSuccess: () => { onMsg('Alerta resolvido'); onFechar() } })}>Resolver</Botao>
      </div>
      {falha && <p className="estado-texto" role="alert">{falha}</p>}
      <div>
        <h3 className="titulo-grupo">Auditoria</h3>
        <ul aria-label="Auditoria do alerta">
          {(trilha.data ?? []).map((t) => (
            <li key={t.id} className="linha"><span className="info"><b>{rotulo(t.acao)}</b><small>{dataHora(t.ts)}{'agente' in t.detalhe ? ` · ${String(t.detalhe.agente)}` : ''}{'eta_min' in t.detalhe ? ` · ETA ${String(t.detalhe.eta_min)} min` : ''}</small></span></li>
          ))}
          {trilha.data?.length === 0 && <li className="estado-texto">Sem ações registradas ainda.</li>}
        </ul>
      </div>
    </Painel>
  )
}
