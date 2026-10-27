import type { UseQueryResult } from '@tanstack/react-query'
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Area, CartesianGrid, ComposedChart, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { useAnomalias, useBacktest, useCenario, useCidades, useEquipamentos, useManutPred, useReforco, useRisco, useTendencias } from '../../api/client'
import { EVENTOS_CENARIO, type Anomalias, type Backtest, type Celula, type Equipamento, type Filtros as F, type ManutPred, type Previsao, type Reforco, type Risco, type Tendencias } from '../../api/types'
import { Comando } from '../../components/Comando'
import { Botao, Chip, Segmentado } from '../../components/Controles'
import { Estado } from '../../components/Estado'
import { Intervalo } from '../../components/Campos'
import { Icone } from '../../components/Icone'
import { Selecao, opcoesDe } from '../../components/Selecao'
import { Mapa, type Zona } from '../../components/Mapa'
import { Sparkline } from '../../components/Mini'
import { Painel } from '../../components/Painel'
import { Pilula } from '../../components/Pilula'
import { useEscopo } from '../../hooks/useEscopo'
import { useOpcoes } from '../../hooks/useOpcoes'
import { interpretar } from '../../lib/copilot'
import { SeletorCamada } from '../../components/Calor'
import type { Camada } from '../../lib/calor'
import { centroides, corRisco, nomeEq, pct, pontoEq, rotulo } from '../../lib/util'

const HORAS = 24
const ATALHOS = [0, 6, 12, 24]
const hora = (h: number) => (h === 0 ? 'agora' : `+${h}h`)
const relogio = (ts: string) => new Date(ts).toLocaleString('pt-BR', { weekday: 'short', hour: '2-digit', minute: '2-digit' })
const TOOLTIP = { background: 'var(--panel)', border: '1px solid var(--linha)', borderRadius: 8, fontSize: 12 }

type Agr = 'bairro' | 'cidade' | 'uf'
const AGRUPAR = [['bairro', 'Bairro'], ['cidade', 'Cidade'], ['uf', 'UF']] as const
interface Local { bairro: string; lat: number; lon: number; horas: Celula[] }

/** Faixa de risco com cor de texto AA (o fundo da célula usa a escala clara de corRisco). */
const nivel = (s: number): [string, string] => (s < 25 ? ['Baixo', 'var(--ok)'] : s < 50 ? ['Moderado', 'var(--info)'] : s < 75 ? ['Alto', 'var(--alerta)'] : ['Crítico', 'var(--crit)'])

/** "Dados usados" de qualquer previsão (P3.7: o que foi considerado). */
function DadosUsados({ dados }: { dados?: Record<string, number | string> }) {
  if (!dados) return null
  return (
    <details className="dados">
      <summary>Dados usados</summary>
      <dl>
        {Object.entries(dados).map(([k, v]) => (
          <div key={k}><dt>{rotulo(k)}: </dt><dd>{k === 'referencia' ? new Date(String(v).replace(' ', 'T') + 'Z').toLocaleString('pt-BR') : typeof v === 'number' ? v.toLocaleString('pt-BR') : v}</dd></div>
        ))}
      </dl>
    </details>
  )
}

/** Card padrão da página: título, "o que prevê", conteúdo, recomendação (como ajuda a decidir) e "dados usados" (P3.7). */
function Cartao<T extends Previsao<object>>({ titulo, q, vazio, className = '', semReco, preve, id, children }: {
  titulo: string; q: UseQueryResult<T>; vazio?: boolean; className?: string; semReco?: boolean; preve?: string; id?: string; children: ReactNode
}) {
  const r = q.data
  return (
    <Painel titulo={titulo} className={className} id={id}>
      {r && <p className="preve"><b>Prevê:</b> {preve ?? r.preve}</p>}
      <Estado q={q} vazio={vazio} linhas={5}>
        {children}
        {r && !semReco && <p className="reco"><Icone nome="info" tam={16} /><span><b>Como ajuda a decidir</b>{r.recomendacao}</span></p>}
      </Estado>
      <DadosUsados dados={r?.dados_usados} />
    </Painel>
  )
}

function Tempo({ h, onChange, ts }: { h: number; onChange: (h: number) => void; ts?: string }) {
  return (
    <div className="tempo flut">
      <header>
        <span><Icone nome="relogio" tam={14} /> Horizonte <b>{hora(h)}</b>{ts && ` · ${relogio(ts)}`}</span>
        <div className="chips" role="group" aria-label="Atalhos de horizonte">
          {ATALHOS.map((x) => <Chip key={x} ativo={h === x} onClick={() => onChange(x)}>{hora(x)}</Chip>)}
        </div>
      </header>
      <Intervalo min={0} max={HORAS} value={h} aria-label="Horizonte de previsão em horas" aria-valuetext={hora(h)} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  )
}

function Ranking({ ranking, h, sel, onSel }: { ranking: Local[]; h: number; sel?: string; onSel: (b: string) => void }) {
  return (
    <div>
      <h3 className="titulo-grupo">Maiores riscos · {hora(h)}</h3>
      <ol>
        {ranking.map((l) => {
          const sc = l.horas.find((x) => x.h === h)?.score ?? 0
          return (
            <li key={l.bairro}>
              <button type="button" className="linha" aria-pressed={l.bairro === sel} onClick={() => onSel(l.bairro)}>
                <span className="info"><b>{l.bairro}</b></span>
                <span style={{ width: 72 }}><Sparkline valores={l.horas.map((x) => x.score)} cor="var(--acc)" rotulo={`Risco de ${l.bairro} nas próximas ${HORAS} horas`} /></span>
                <Pilula cor={nivel(sc)[1]}>{Math.round(sc)}</Pilula>
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

const Evolucao = ({ dados, rotulo: r }: { dados: object[]; rotulo: string }) => (
  <div className="grafico" role="img" aria-label={r}>
    <ResponsiveContainer width="100%" height={140}>
      <LineChart data={dados} margin={{ left: -24, right: 4, top: 4 }}>
        <CartesianGrid stroke="var(--linha)" vertical={false} />
        <XAxis dataKey="h" tickFormatter={hora} stroke="var(--mud)" fontSize={11} />
        <YAxis domain={[0, 100]} stroke="var(--mud)" fontSize={11} />
        <Tooltip labelFormatter={(l) => hora(Number(l))} contentStyle={TOOLTIP} />
        <Line dataKey="ic_sup" name="IC máx." stroke="var(--crit)" strokeDasharray="4 4" dot={false} />
        <Line dataKey="score" name="Risco" stroke="var(--acc)" strokeWidth={2} dot={false} />
        <Line dataKey="ic_inf" name="IC mín." stroke="var(--ok)" strokeDasharray="4 4" dot={false} />
      </LineChart>
    </ResponsiveContainer>
  </div>
)

/** Sem local escolhido: visão geral (média de todos os locais por hora + maiores riscos). Com local: fatores do score. */
function PorQue({ b, h, locais, ranking, risco, onSel, onGeral }: { b?: Local; h: number; locais: Local[]; ranking: Local[]; risco: UseQueryResult<Risco>; onSel: (b: string) => void; onGeral: () => void }) {
  const geral = useMemo(() => Array.from({ length: HORAS + 1 }, (_, i) => {
    const xs = locais.map((l) => l.horas[i]).filter(Boolean)
    const m = (f: (c: Celula) => number) => xs.reduce((t, c) => t + f(c), 0) / (xs.length || 1)
    return { h: i, score: m((c) => c.score), ic_inf: m((c) => c.ic_inf), ic_sup: m((c) => c.ic_sup) }
  }), [locais])
  const c = b?.horas.find((x) => x.h === h) ?? b?.horas[0]
  if (!b || !c) {
    const atual = geral.find((x) => x.h === h) ?? geral[0]
    return (
      <Cartao titulo="Visão geral do risco" q={risco} className="c4" preve={`risco médio de ${locais.length} locais em ${hora(h)}, com intervalo de confiança de 95%.`}>
        <div className="grande-linha">
          <span className="grande" style={{ background: corRisco(atual.score), padding: '8px 12px', borderRadius: 12 }}>{Math.round(atual.score)}</span>
          <span><Pilula cor={nivel(atual.score)[1]}>{nivel(atual.score)[0]}</Pilula><br /><small>média dos locais · IC {Math.round(atual.ic_inf)}–{Math.round(atual.ic_sup)}</small></span>
        </div>
        <Evolucao dados={geral} rotulo={`Risco médio de todos os locais nas próximas ${HORAS} horas; linhas tracejadas: intervalo de confiança`} />
        <Ranking ranking={ranking} h={h} onSel={onSel} />
        <p className="estado-texto">Escolha um local no mapa, na tabela ou no ranking para ver por que ele tem esse risco.</p>
      </Cartao>
    )
  }
  const maxF = Math.max(1, ...c.fatores.map((f) => Math.abs(f.pontos)))
  const [texto, cor] = nivel(c.score)
  return (
    <Cartao titulo={`Por que ${b.bairro}?`} q={risco} className="c4" preve={`risco de ${hora(h)} (${relogio(c.ts)}) com intervalo de confiança de 95%.`}>
      <div className="grande-linha">
        <span className="grande" style={{ background: corRisco(c.score), padding: '8px 12px', borderRadius: 12 }}>{Math.round(c.score)}</span>
        <span><Pilula cor={cor}>{texto}</Pilula><br /><small>IC {Math.round(c.ic_inf)}–{Math.round(c.ic_sup)} · confiança {pct(100 - (c.ic_sup - c.ic_inf))}</small></span>
      </div>
      <ul className="fatores" aria-label="Fatores do risco">
        {c.fatores.map((f) => (
          <li key={f.fator}>
            <span>{f.fator}</span>
            <span className="trilho" aria-hidden="true"><i style={{ width: `${(Math.abs(f.pontos) / maxF) * 100}%`, '--c': f.pontos > 0 ? 'var(--crit)' : 'var(--ok)' } as CSSProperties} /></span>
            <b>{f.pontos > 0 ? '+' : ''}{f.pontos.toFixed(1)}</b>
          </li>
        ))}
      </ul>
      <Evolucao dados={b.horas} rotulo={`Evolução do risco em ${b.bairro} nas próximas ${HORAS} horas; linhas tracejadas: intervalo de confiança`} />
      <Botao pequeno variante="sutil" onClick={onGeral}>Voltar à visão geral</Botao>
      <Ranking ranking={ranking} h={h} sel={b.bairro} onSel={onSel} />
    </Cartao>
  )
}

function MapaDeCalor({ locais, atual, h, agrupar, q, onSel }: { locais: Local[]; atual?: Local; h: number; agrupar: Agr; q: UseQueryResult<Risco>; onSel: (b: string, h: number) => void }) {
  return (
    <Cartao titulo={`Risco por ${agrupar} e hora`} q={q} vazio={!locais.length} className="c8" preve="a pontuação de risco (0-100) de cada local em cada hora das próximas 24 h; clique numa célula para entender o porquê.">
      <div className="heat-wrap">
        <table className="heat">
          <thead><tr><th>Local \ hora</th>{locais[0]?.horas.map((c) => <th key={c.h} scope="col">{c.h}</th>)}</tr></thead>
          <tbody>
            {locais.map((b) => (
              <tr key={b.bairro}>
                <th scope="row">{b.bairro}</th>
                {b.horas.map((c) => (
                  <td key={c.h}><button type="button" style={{ background: corRisco(c.score) }} className={b.bairro === atual?.bairro && c.h === h ? 'sel' : ''}
                    aria-label={`${b.bairro} ${hora(c.h)}: risco ${Math.round(c.score)}`} onClick={() => onSel(b.bairro, c.h)}>{Math.round(c.score)}</button></td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Cartao>
  )
}

type PorId = Map<number, Equipamento>
const quem = (porId: PorId, id: number) => { const e = porId.get(id); return e ? { nome: nomeEq(e), onde: e.bairro } : { nome: `Equipamento ${id}`, onde: '' } }

function ManutPreditiva({ q, porId }: { q: UseQueryResult<ManutPred>; porId: PorId }) {
  return (
    <Cartao titulo="Manutenção preditiva" q={q} vazio={q.data?.ordens.length === 0} className="c4">
      <ol className="rolagem lista-sep" tabIndex={0} aria-label="Lista (role para ver mais)">
        {q.data?.ordens.slice(0, 10).map((o) => {
          const { nome, onde } = quem(porId, o.equipamento_id)
          return (
            <li key={o.equipamento_id} className="linha">
              {o.em_falha
                ? <Pilula cor="var(--crit)" tracejada icone="mau_funcionamento">Em falha</Pilula>
                : <Pilula cor={o.prob_falha_7d >= 0.7 ? 'var(--crit)' : o.prob_falha_7d >= 0.35 ? 'var(--alerta)' : 'var(--neutro)'}>{pct(o.prob_falha_7d * 100)}</Pilula>}
              <span className="info"><b>{nome}</b><small>{onde} · {o.em_falha ? 'já parou' : `OS ${o.prioridade}`}: {rotulo(o.causa_principal).toLowerCase()}</small></span>
            </li>
          )
        })}
      </ol>
    </Cartao>
  )
}

function ReforcoCard({ q }: { q: UseQueryResult<Reforco> }) {
  const plano = q.data?.plano
  const lacunas = q.data?.lacunas.length ?? 0
  return (
    <Cartao titulo="Reforço e lacunas (próx. 6h)" q={q} vazio={!plano} className="c4">
      {plano && (
        <>
          <div className="antes-depois">
            <span><small>Cobertura hoje</small><span className="num-grande">{pct(plano.cobertura_antes * 100)}</span></span>
            <Icone nome="abaixo" />
            <span><small>Com reforço</small><span className="num-grande" style={{ color: 'var(--ok)' }}>{pct(plano.cobertura_depois * 100)}</span></span>
          </div>
          <Pilula cor="var(--viol)" tracejada>{lacunas} pontos cegos (círculos tracejados no mapa)</Pilula>
          <ul className="rolagem lista-sep" tabIndex={0} aria-label="Lista (role para ver mais)">
            {plano.movimentos.map((m) => <li key={m.agente_id} className="linha"><Icone nome="agente" /><span className="info"><b>Agente {m.agente_id}</b><small>{m.de} → {m.para} · {m.km.toFixed(1)} km</small></span></li>)}
          </ul>
        </>
      )}
    </Cartao>
  )
}

function Anomalia({ q, porId }: { q: UseQueryResult<Anomalias>; porId: PorId }) {
  return (
    <Cartao titulo="Anomalias detectadas" q={q} vazio={q.data?.anomalias.length === 0} className="c4">
      <ul className="rolagem lista-sep" tabIndex={0} aria-label="Lista (role para ver mais)">
        {q.data?.anomalias.slice(0, 10).map((a) => {
          const { nome, onde } = quem(porId, a.equipamento_id)
          return (
            <li key={`${a.equipamento_id}-${a.metrica}`} className="linha">
              <Icone nome="mau_funcionamento" />
              <span className="info"><b>{nome}</b><small>{onde} · {rotulo(a.metrica)} {a.valor} (esperado ~{a.baseline.toFixed(2)}; z={a.z_ewma.toFixed(1)})</small></span>
            </li>
          )
        })}
      </ul>
    </Cartao>
  )
}

function Cenarios({ bairros, equipamentos }: { bairros: string[]; equipamentos: Equipamento[] }) {
  const [evento, setEvento] = useState<string>(EVENTOS_CENARIO[0])
  const [bairro, setBairro] = useState('')
  const [equip, setEquip] = useState('')
  const [params, setParams] = useState<Record<string, string> | null>({ evento: EVENTOS_CENARIO[0] })
  const q = useCenario(params)
  const r = q.data
  const falha = evento === 'falha_equipamento'
  return (
    <Cartao titulo="E se…? (what-if)" q={q} className="c4">
      <form className="what-if" onSubmit={(e) => { e.preventDefault(); setParams(falha ? { evento, equipamento_id: equip } : { evento, bairro }) }}>
        <div className="campo"><label htmlFor="wi-evento">Evento</label>
          <Selecao id="wi-evento" valor={evento} opcoes={opcoesDe(EVENTOS_CENARIO, rotulo)} onChange={setEvento} /></div>
        {falha ? (
          <div className="campo"><label htmlFor="wi-eq">Equipamento</label>
            <Selecao id="wi-eq" valor={equip} vazio="Escolha…" obrigatorio onChange={setEquip}
              opcoes={equipamentos.filter((e) => e.situacao === 'operacional').map((e) => ({ valor: String(e.id), rotulo: `${nomeEq(e)} · ${e.bairro}` }))} /></div>
        ) : (
          <div className="campo"><label htmlFor="wi-bairro">Bairro</label>
            <Selecao id="wi-bairro" valor={bairro} vazio={evento === 'chuva' ? 'Cidade toda' : 'Escolha…'} obrigatorio={evento === 'evento_bairro'} onChange={setBairro} opcoes={opcoesDe(bairros)} /></div>
        )}
        <Botao variante="primario" type="submit" carregando={q.isFetching} icone="preditiva">Simular</Botao>
      </form>
      {r && (
        <>
          <h3 className="titulo-grupo">Resultado: {rotulo(params?.evento ?? '')}</h3>
          <div className="antes-depois">
            <span><small>Cobertura base</small><span className="num-grande">{pct(r.cobertura_base * 100)}</span></span>
            <Icone nome="abaixo" />
            <span><small>No cenário</small><span className="num-grande">{pct(r.cobertura_cenario * 100)}</span><small>realocando: {pct(r.cobertura_cenario_realocada * 100)}</small></span>
          </div>
          <small>Pontos cegos: {r.lacunas_base} → {r.lacunas_cenario}</small>
          <ul className="rolagem lista-sep" tabIndex={0} aria-label="Lista (role para ver mais)">
            {Object.entries(r.delta_risco_medio).slice(0, 5).map(([b, d]) => <li key={b} className="linha"><span className="info"><b>{b}</b></span><Pilula cor={d > 0 ? 'var(--crit)' : 'var(--ok)'}>{d > 0 ? '+' : ''}{d}</Pilula></li>)}
          </ul>
        </>
      )}
    </Cartao>
  )
}

const num1 = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
const num2 = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const pc = (v: number) => `${Math.round(v * 100)}%`

/** Um número do backtest com o que ele significa e o ponto de comparação (acaso / média). */
const Metrica = ({ valor, rotulo: r, ref }: { valor: string; rotulo: string; ref?: string }) => (
  <div className="metrica"><b>{valor}</b><span>{r}</span>{ref && <Pilula cor="var(--neutro)">{ref}</Pilula>}</div>
)

/** Prova de que funciona: treina com o histórico até D-N e compara com os N dias que de fato aconteceram. */
function BacktestCard({ dias, onDias, q }: { dias: string; onDias: (d: string) => void; q: UseQueryResult<Backtest> }) {
  const r = q.data?.risco
  const m = q.data?.manutencao
  return (
    <Cartao titulo="Quão confiável é a previsão?" q={q} className="c8" id="backtest">
      <Segmentado rotulo="Treinar até" valor={dias as '7'} onChange={onDias} opcoes={[['3', 'D-3'], ['7', 'D-7'], ['14', 'D-14']]} />
      {r && m && (
        <div className="duas-col">
          <section aria-label="Resultado do risco por bairro e hora">
            <h3 className="titulo-grupo">Risco por bairro e hora</h3>
            <Metrica valor={`${r.acerto_top_bairros} de ${r.top_bairros}`} rotulo="bairros mais perigosos previstos corretamente" ref={`acaso: ${num1(r.acerto_aleatorio)}`} />
            <Metrica valor={num2(r.correlacao_bairros)} rotulo="correlação entre risco previsto e ocorrências reais por bairro" ref="1 = perfeito" />
            <Metrica valor={pc(r.ocorrencia_no_top20)} rotulo="das horas de maior risco previsto tiveram ocorrência" ref={`em geral: ${pc(r.ocorrencia_geral)}`} />
            <Metrica valor={`${num2(r.erro_medio_pp)} p.p.`} rotulo="erro médio da participação de cada bairro no total" />
          </section>
          <section aria-label="Resultado da manutenção preditiva">
            <h3 className="titulo-grupo">Manutenção preditiva</h3>
            {m.avaliados > 0 && m.precisao_topk !== undefined ? (
              <>
                <Metrica valor={pc(m.precisao_topk)} rotulo={`dos ${m.k} equipamentos mais arriscados realmente falharam`} ref={`acaso: ${pc(m.taxa_base ?? 0)}`} />
                <Metrica valor={m.recall_topk == null ? '—' : pc(m.recall_topk)} rotulo={`das ${m.falhas_reais} falhas reais estavam nessa lista`} />
                <Metrica valor={m.auc == null ? '—' : num2(m.auc)} rotulo="AUC: chance de ranquear um equipamento que falha acima de um que não falha" ref="0,5 = acaso" />
                <Metrica valor={pc(m.erro_medio ?? 0)} rotulo="erro médio da probabilidade informada" ref={`chute na média: ${pc(m.erro_medio_base ?? 0)}`} />
              </>
            ) : <p className="estado-texto">Poucos dados para avaliar a manutenção neste recorte.</p>}
          </section>
        </div>
      )}
      <p className="estado-texto">Teste cego: o modelo só vê dados até {q.data ? new Date(q.data.corte.replace(' ', 'T') + 'Z').toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'o corte'} e é cobrado pelo que veio depois. Os dados são sintéticos: o resultado prova que o método recupera os padrões da simulação, não o desempenho em campo.</p>
    </Cartao>
  )
}

/** Disponibilidade e utilização dos últimos 30 dias, projeção de 7 dias (faixa = incerteza) e tipos em queda. */
function TendenciasCard({ q }: { q: UseQueryResult<Tendencias> }) {
  const serie = useMemo(() => {
    const s = q.data?.serie ?? []
    const ultimoReal = s.findLastIndex((p) => !p.projetado)
    return s.map((p, i) => ({
      dia: p.dia.slice(5).split('-').reverse().join('/'),
      disp: p.projetado ? null : p.disponibilidade, uso: p.projetado ? null : p.utilizacao,
      dispProj: p.projetado || i === ultimoReal ? p.disponibilidade : null, usoProj: p.projetado || i === ultimoReal ? p.utilizacao : null,
      faixa: p.projetado && p.disponibilidade_inf != null ? [p.disponibilidade_inf, p.disponibilidade_sup] : null,
    }))
  }, [q.data])
  const d = q.data?.resumo.disponibilidade
  const u = q.data?.resumo.utilizacao
  const sinal = (v: number) => `${v > 0 ? '+' : ''}${num1(v)}`
  return (
    <Cartao titulo="Tendência de disponibilidade e utilização" q={q} vazio={serie.length === 0} className="c8">
      <div className="duas-col">
        <div className="grafico" role="img" aria-label="Disponibilidade e utilização diárias dos últimos 30 dias e projeção dos próximos 7; faixa: intervalo de incerteza da disponibilidade">
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart data={serie} margin={{ left: -20, right: 8, top: 8 }}>
              <CartesianGrid stroke="var(--linha)" vertical={false} />
              <XAxis dataKey="dia" stroke="var(--mud)" fontSize={11} interval="preserveStartEnd" minTickGap={24} />
              <YAxis domain={[0, 100]} stroke="var(--mud)" fontSize={11} unit="%" />
              <Tooltip contentStyle={TOOLTIP} formatter={(v) => (Array.isArray(v) ? `${num1(Number(v[0]))}–${num1(Number(v[1]))}%` : `${num1(Number(v))}%`)} />
              <Area dataKey="faixa" name="Incerteza (95%)" stroke="none" fill="var(--acc)" fillOpacity={0.15} isAnimationActive={false} />
              <Line dataKey="disp" name="Disponibilidade" stroke="var(--ok)" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
              <Line dataKey="dispProj" name="Disponibilidade (projeção)" stroke="var(--ok)" strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls isAnimationActive={false} />
              <Line dataKey="uso" name="Utilização" stroke="var(--acc)" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
              <Line dataKey="usoProj" name="Utilização (projeção)" stroke="var(--acc)" strokeWidth={2} strokeDasharray="5 4" dot={false} connectNulls isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
          <p className="legenda-graf"><span style={{ '--c': 'var(--ok)' } as CSSProperties}>Disponibilidade</span><span style={{ '--c': 'var(--acc)' } as CSSProperties}>Utilização</span><span>tracejado = projeção</span></p>
        </div>
        <div>
          {d && <Metrica valor={`${num1(d.atual)}%`} rotulo={`disponibilidade hoje; projeção em 7 dias: ${num1(d.projetado_7d)}%`} ref={`${sinal(d.variacao_pp_semana)} p.p./semana`} />}
          {u && <Metrica valor={`${num1(u.atual)}%`} rotulo={`utilização média hoje; projeção em 7 dias: ${num1(u.projetado_7d)}%`} ref={`${sinal(u.variacao_pp_semana)} p.p./semana`} />}
          <h3 className="titulo-grupo">Tipos com maior queda (7 dias)</h3>
          <ul className="lista-sep">
            {q.data?.por_tipo.slice(0, 4).map((t) => (
              <li key={t.tipo} className="linha">
                <span className="info"><b>{rotulo(t.tipo)}</b><small>{t.equipamentos} equip. · disp. {num1(t.disponibilidade)}%{t.utilizacao != null ? ` · uso ${num1(t.utilizacao)}%` : ''}</small></span>
                <Pilula cor={t.variacao_pp < -0.5 ? 'var(--crit)' : 'var(--neutro)'}>{sinal(t.variacao_pp)} p.p.</Pilula>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Cartao>
  )
}

/** Locais (bairro, cidade ou UF) com centroide conhecido, prontos para mapa e tabela. */
function useLocais(risco: Risco | undefined, centros: Record<string, { lat: number; lon: number }>): Local[] {
  return useMemo(() => Object.entries(risco?.matriz ?? {}).flatMap(([b, horas]) => (centros[b] ? [{ bairro: b, horas, ...centros[b] }] : [])), [risco, centros])
}

export default function Preditiva() {
  const [h, setH] = useState(0)
  const [local, setLocal] = useState('')
  const [escolha, setEscolha] = useState<Agr | null>(null)
  const [camada, setCamada] = useState<Camada>('ambos')
  const [filtros, setFiltros] = useState<F>({})
  const { escopo, setEscopo } = useEscopo()
  // granularidade natural: Brasil -> por UF, UF -> por cidade, cidade -> por bairro
  const agrupar: Agr = escolha ?? (escopo.cidade ? 'bairro' : escopo.uf ? 'cidade' : 'uf')
  const opcoes = useOpcoes()
  const cidades = useCidades().data
  const risco = useRisco(HORAS, agrupar)
  const [dias, setDias] = useState('7')
  const backtest = useBacktest(Number(dias))
  const tendencias = useTendencias()
  const [params] = useSearchParams()
  const foco = params.get('foco')
  useEffect(() => { if (foco && backtest.data) document.getElementById(foco)?.scrollIntoView({ behavior: 'smooth', block: 'center' }) }, [foco, backtest.data])
  const todos = useEquipamentos()
  const eqs = useEquipamentos(filtros)
  const reforco = useReforco(6)
  const [pred, anom] = [useManutPred(), useAnomalias()]
  const centros = useMemo(() => centroides(todos.data ?? [], agrupar), [todos.data, agrupar])
  const locais = useLocais(risco.data, centros)
  const atual = locais.find((b) => b.bairro === local) // sem escolha: visão geral (nada de "Por que AM?")
  const score = (b: Local, hh: number) => b.horas.find((x) => x.h === hh)?.score ?? 0
  const ranking = useMemo(() => [...locais].sort((a, b) => score(b, h) - score(a, h)).slice(0, 5), [locais, h])
  const porId = useMemo(() => new Map((todos.data ?? []).map((e) => [e.id, e])), [todos.data])

  const executar = (texto: string) => {
    const c = interpretar(texto, { ...opcoes, cidades: cidades?.map((x) => x.cidade) })
    const { bairro: b, cidade, ...resto } = c.filtros
    setFiltros(resto)
    if (cidade) setEscopo({ cidade, uf: cidades?.find((x) => x.cidade === cidade)?.uf })
    if (b) { setEscolha('bairro'); setLocal(b) }
    if (c.horas !== undefined) setH(c.horas)
    return c.resumo
  }

  const zonas: Zona[] = useMemo(() => [
    ...locais.map((b) => ({
      id: b.bairro, lat: b.lat, lon: b.lon, raio: 10 + score(b, h) / 5, cor: corRisco(score(b, h)),
      titulo: `${b.bairro}: risco ${Math.round(score(b, h))} (${hora(h)})`, onClick: () => setLocal(b.bairro),
    })),
    ...(reforco.data?.lacunas ?? []).map((l, i) => ({ id: `l${i}`, lat: l.lat, lon: l.lon, raio: 300, cor: 'var(--viol)', titulo: `Cobertura cega · ${l.bairro}`, tracejada: true })),
  ], [locais, reforco.data, h])
  const pontos = useMemo(() => (eqs.data ?? []).map((e) => pontoEq(e)), [eqs.data])
  const calor = useMemo(() => locais.map((b) => ({ lat: b.lat, lon: b.lon, peso: score(b, h) })), [locais, h]) // risco previsto no horizonte do slider

  return (
    <div className="bento">
      <Comando executar={executar} />
      <Cartao titulo="Mapa de risco previsto" q={risco} vazio={!locais.length} className="c8">
        <div className="palco compacto">
          <Mapa rotulo="Mapa de risco previsto e lacunas de cobertura" zonas={zonas} pontos={pontos} calor={calor} tetoCalor={80} camada={camada} chave={JSON.stringify([escopo, filtros, agrupar])} />
          <div className="cima-esq">
            <Segmentado rotulo="Agrupar risco por" opcoes={AGRUPAR} valor={agrupar} onChange={(v) => { setEscolha(v); setLocal('') }} />
            <SeletorCamada valor={camada} onChange={setCamada} />
          </div>
          <div className="escala" aria-hidden="true"><i /><div><span>baixo</span><span>alto</span></div><span className="tr"><s />cobertura cega</span></div>
          <Tempo h={h} onChange={setH} ts={(atual ?? locais[0])?.horas.find((x) => x.h === h)?.ts} />
        </div>
      </Cartao>
      <PorQue b={atual} h={h} locais={locais} ranking={ranking} risco={risco} onSel={setLocal} onGeral={() => setLocal('')} />
      <MapaDeCalor locais={locais} atual={atual} h={h} agrupar={agrupar} q={risco} onSel={(b, hh) => { setLocal(b); setH(hh) }} />
      <ManutPreditiva q={pred} porId={porId} />
      <BacktestCard dias={dias} onDias={setDias} q={backtest} />
      <ReforcoCard q={reforco} />
      <TendenciasCard q={tendencias} />
      <Anomalia q={anom} porId={porId} />
      <Cenarios key={JSON.stringify(escopo)} bairros={opcoes.bairros} equipamentos={todos.data ?? []} />
    </div>
  )
}
