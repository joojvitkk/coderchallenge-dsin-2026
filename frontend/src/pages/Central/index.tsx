import { useQueryClient, type UseQueryResult } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useAgora } from '../../hooks/useAgora'
import { Link, useSearchParams } from 'react-router-dom'
import { injetarIncidente, useAgentes, useAlertas, useCalor, useCidades, useEquipamentos, useGrupos, useKpis, useManutencao } from '../../api/client'
import type { Agente, Agrupamento, Alerta, Equipamento, Filtros as F, Kpis, ModoCalor, Telemetria } from '../../api/types'
import { PainelCalor } from '../../components/Calor'
import { AoVivo, type Latencia } from '../../components/AoVivo'
import { Comando } from '../../components/Comando'
import { Botao, Segmentado } from '../../components/Controles'
import { Estado } from '../../components/Estado'
import { Filtros } from '../../components/Filtros'
import { Icone } from '../../components/Icone'
import { Kpi, KpiSkeleton } from '../../components/Kpi'
import { Mapa, type Linha, type Ponto } from '../../components/Mapa'
import { Segmentos, Sparkline } from '../../components/Mini'
import { Painel } from '../../components/Painel'
import { useEscopo } from '../../hooks/useEscopo'
import { useOpcoes } from '../../hooks/useOpcoes'
import { useStream } from '../../hooks/useStream'
import { interpretar } from '../../lib/copilot'
import { MODOS, type Camada } from '../../lib/calor'
import { COR_AGENTE, COR_SEV, COR_SITUACAO, mesclarPorId, pct, pontoEq, rotulo, utc } from '../../lib/util'
import { Alertas, DetalheAlerta, tituloAlerta } from './Alertas'
import { AgentesLista, DetalheAgente, DetalheEq, Manutencao, Saude } from './Paineis'
import { ControleReplay, useReplayMapa } from './Replay'

type Sel = { tipo: 'eq' | 'alerta' | 'agente'; id: number } | null
const dentro = (p: { cidade?: string; uf?: string }, a: Alerta) => (!p.cidade || p.cidade === a.cidade) && (!p.uf || p.uf === a.uf)
const percentil = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(p * xs.length))]

/** Aplica eventos SSE aos caches do TanStack Query; registra quando chegou o último e a latência evento->tela. */
function useAoVivo() {
  const qc = useQueryClient()
  const [metricas, setMetricas] = useState<Record<number, Telemetria['metricas']>>({})
  const [ultimo, setUltimo] = useState<number | null>(null)
  const [latencia, setLatencia] = useState<Latencia | null>(null)
  const amostras = useRef<number[]>([])
  const ao = <T,>(f: (d: T) => void) => (d: T) => { f(d); setUltimo(Date.now()) }
  const status = useStream({
    telemetria: ao((ts) => {
      qc.setQueriesData<Equipamento[]>({ queryKey: ['/equipamentos'] }, (l) => l && ts.reduce((acc, t) => mesclarPorId(acc, { id: t.equipamento_id, situacao: t.situacao }), l))
      setMetricas((m) => ({ ...m, ...Object.fromEntries(ts.map((t) => [t.equipamento_id, t.metricas])) }))
    }),
    agente: ao((as: Agente[]) => qc.setQueriesData<Agente[]>({ queryKey: ['/agentes'] }, (l) => l && as.reduce(mesclarPorId, l))),
    alerta: ao((a: Alerta) => {
      void qc.invalidateQueries({ queryKey: ['/central/calor'] }) // o mapa de calor acompanha o ao vivo
      for (const q of qc.getQueryCache().findAll({ queryKey: ['/central/alertas'] }))
        if (dentro(q.queryKey[1] as object, a))
          qc.setQueryData<Alerta[]>(q.queryKey, (l) => [a, ...(l ?? []).filter((x) => x.id !== a.id)].filter((x) => x.status !== 'resolvido').slice(0, 50))
    }),
    kpis: ao((k: Kpis) => qc.setQueryData(['/central/kpis', {}], k)), // global; escopos menores atualizam por polling
  }, undefined, (ms) => { amostras.current = [...amostras.current.slice(-99), ms] })
  useEffect(() => {
    const t = setInterval(() => {
      const xs = amostras.current
      if (xs.length) setLatencia({ ultima: xs.at(-1)!, p50: percentil(xs, 0.5), p95: percentil(xs, 0.95), n: xs.length })
    }, 2000)
    return () => clearInterval(t)
  }, [])
  return { status, metricas, ultimo, latencia }
}

/** Alertas por faixa de tempo (12 faixas iguais entre o mais antigo e o mais novo da lista). */
function ritmo(alertas: Alerta[] = []): number[] {
  if (alertas.length < 3) return []
  const ts = alertas.map((a) => +utc(a.ts))
  const [min, max] = [Math.min(...ts), Math.max(...ts)]
  const faixas = Array.from({ length: 12 }, () => 0)
  for (const t of ts) faixas[Math.min(11, Math.floor(((t - min) / (max - min || 1)) * 12))]++
  return faixas
}

function FaixaKpis({ q, alertas }: { q: UseQueryResult<Kpis>; alertas?: Alerta[] }) {
  const k = q.data
  const ativos = k ? (k.agentes_ativos / (k.agentes_total || 1)) * 100 : 0
  return (
    <Estado q={q} fallback={<div className="kpis">{Array.from({ length: 5 }, (_, i) => <KpiSkeleton key={i} />)}</div>}>
      {k && (
        <div className="kpis">
          <Kpi rotulo="Equipamentos" icone="inventario" valor={k.equipamentos_total}
            extra={<Segmentos rotulo="Equipamentos por situação" partes={Object.entries(k.por_situacao).map(([s, valor]) => ({ valor, cor: COR_SITUACAO[s as keyof typeof COR_SITUACAO] }))} />} />
          <Kpi rotulo="Disponibilidade" icone="operacional" valor={Math.round(k.disponibilidade_pct)} sufixo="%" tom={k.disponibilidade_pct < 80 ? 'alerta' : 'ok'}
            extra={<Segmentos rotulo={`Disponibilidade ${pct(k.disponibilidade_pct)}`} partes={[{ valor: k.disponibilidade_pct, cor: 'var(--ok)' }, { valor: 100 - k.disponibilidade_pct, cor: 'transparent' }]} />} />
          <Kpi rotulo="Alertas críticos" icone="alertas" valor={k.alertas_criticos} tom={k.alertas_criticos ? 'crit' : 'ok'}
            extra={<><Sparkline valores={ritmo(alertas)} cor="var(--crit)" rotulo="Ritmo dos últimos alertas" /><small>{k.alertas_abertos} abertos · {k.alertas_sla_estourado} fora do SLA</small></>} />
          <Kpi rotulo="Manutenção imediata" icone="manutencao" valor={k.manutencao_imediata} tom={k.manutencao_imediata ? 'alerta' : 'ok'}
            extra={<small>+ {k.manutencao_agendada_7d} agendadas em 7 dias</small>} />
          <Kpi rotulo="Agentes em atividade" icone="agentes" valor={k.agentes_ativos + k.agentes_em_ocorrencia} sufixo={` / ${k.agentes_total}`}
            extra={<Segmentos rotulo={`${k.agentes_ativos} em patrulha, ${k.agentes_em_ocorrencia} em ocorrência, de ${k.agentes_total} agentes`}
              partes={[{ valor: ativos, cor: 'var(--agente)' }, { valor: (k.agentes_em_ocorrencia / (k.agentes_total || 1)) * 100, cor: 'var(--crit)' }, { valor: 100 - ativos, cor: 'transparent' }]} />} />
        </div>
      )}
    </Estado>
  )
}

type Aba = 'alertas' | 'manutencao' | 'agentes'
const nAba = (q: UseQueryResult<unknown[]>) => (q.data ? ` ${q.data.length}` : '')

const Legenda = () => (
  <ul className="legenda" aria-label="Legenda do mapa">
    {Object.entries(COR_SITUACAO).map(([s, c]) => <li key={s} style={{ '--c': c } as React.CSSProperties}><i />{rotulo(s)}</li>)}
    <li style={{ '--c': 'var(--agente)' } as React.CSSProperties}><i />Agente</li>
    <li style={{ '--c': 'var(--crit)' } as React.CSSProperties}><i className="anel" />Manutenção imediata</li>
    <li style={{ '--c': 'var(--alerta)' } as React.CSSProperties}><i className="anel tr" />Próxima da data</li>
  </ul>
)

type Camadas = { eqs?: Equipamento[]; ags?: Agente[]; alertas?: Alerta[]; sel: Sel; setSel: (s: Sel) => void; replay: boolean; agora: number }

/** Camadas do mapa: pinos (equipamentos e agentes), alertas graves sobre o mapa e rotas dos agentes despachados.
 * Alertas e rotas ficam fora do enquadramento automático. */
function useCamadas({ eqs, ags, alertas, sel, setSel, replay, agora }: Camadas) {
  const doTipo = (tipo: 'eq' | 'alerta' | 'agente', id: number) => sel?.tipo === tipo && sel.id === id
  const pontos: Ponto[] = useMemo(() => [
    ...(eqs ?? []).map((e) => pontoEq(e, { destaque: doTipo('eq', e.id), onClick: () => setSel({ tipo: 'eq', id: e.id }) })),
    ...(ags ?? []).flatMap((a) => a.lat == null || a.lon == null ? [] : [{
      id: `a${a.id}`, lat: a.lat, lon: a.lon, cor: COR_AGENTE[a.status], icone: 'agente', solto: true, titulo: `Agente ${a.nome} — ${rotulo(a.status)}`,
      destaque: doTipo('agente', a.id), onClick: () => setSel({ tipo: 'agente', id: a.id }),
    }]),
  ], [eqs, ags, sel]) // eslint-disable-line react-hooks/exhaustive-deps
  const sobre: Ponto[] = useMemo(() => replay ? [] : (alertas ?? []).filter((a) => a.severidade >= 3 || doTipo('alerta', a.id)).map((a) => ({
    id: `al${a.id}`, lat: a.lat, lon: a.lon, cor: COR_SEV[a.severidade], icone: 'alertas', solto: true, pulsa: agora - +utc(a.ts) < 30_000,
    titulo: `${tituloAlerta(a)} — ${a.bairro}`, destaque: doTipo('alerta', a.id), onClick: () => setSel({ tipo: 'alerta', id: a.id }),
  })), [alertas, sel, replay]) // eslint-disable-line react-hooks/exhaustive-deps
  const linhas: Linha[] = useMemo(() => (ags ?? []).flatMap((a) => a.destino_lat == null || a.destino_lon == null ? [] : [{
    id: `rota${a.id}`, de: [a.lat, a.lon] as [number, number], para: [a.destino_lat, a.destino_lon] as [number, number], titulo: `${a.nome} a caminho do alerta`,
  }]), [ags])
  return { pontos, sobre, linhas }
}

export default function Central() {
  const [params] = useSearchParams()
  const [filtros, setFiltros] = useState<F>({})
  const [sel, setSel] = useState<Sel>(() => (params.get('alerta') ? { tipo: 'alerta', id: Number(params.get('alerta')) } : null))
  const [msg, setMsg] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [por, setPor] = useState<Agrupamento>('regiao')
  const [aba, setAba] = useState<Aba>('alertas')
  const [folha, setFolha] = useState(false) // bottom sheet (só no celular)
  const [camada, setCamada] = useState<Camada>('pinos')
  const [modo, setModo] = useState<ModoCalor>('alertas')
  const { escopo, setEscopo } = useEscopo()
  const { status, metricas, ultimo, latencia } = useAoVivo()
  const opcoes = useOpcoes()
  const cidades = useCidades().data
  const eqs = useEquipamentos(filtros)
  const ags = useAgentes()
  const [kpis, alertas, manut, grupos] = [useKpis(), useAlertas(), useManutencao(), useGrupos(por)]
  const calor = useCalor({ modo, horas: 24, ...filtros }, camada !== 'pinos')
  const rep = useReplayMapa(params.get('replay') === '1') // ?alerta=ID e ?replay=1 vêm do modo apresentação (a rota é remontada ao mudar a URL)
  const replay = rep.ativo
  const agora = useAgora(5000)

  const eqSel = sel?.tipo === 'eq' ? eqs.data?.find((e) => e.id === sel.id) : undefined
  const alertaSel = sel?.tipo === 'alerta' ? alertas.data?.find((a) => a.id === sel.id) : undefined
  const agenteSel = sel?.tipo === 'agente' ? ags.data?.find((a) => a.id === sel.id) : undefined
  const ver = (s: NonNullable<Sel>) => { setSel(s); setFolha(true) }

  const incidente = (bairro?: string) => {
    const alvo = bairro ?? filtros.bairro ?? opcoes.bairros[Math.floor(Math.random() * opcoes.bairros.length)]
    setEnviando(true)
    injetarIncidente(alvo).then(
      ({ alerta, agente_acionado, eta_min }) => {
        setMsg(`Incidente em ${alerta.bairro} (${alerta.cidade}/${alerta.uf}); ${agente_acionado ? `agente ${agente_acionado} a caminho, ETA ~${eta_min} min` : 'sem agente disponível na UF'}`)
        setSel({ tipo: 'alerta', id: alerta.id })
      },
      (e: Error) => setMsg(e.message),
    ).finally(() => setEnviando(false))
  }

  const executar = (texto: string) => {
    const { filtros: f, resumo } = interpretar(texto, { ...opcoes, cidades: cidades?.map((x) => x.cidade) })
    const { cidade, ...resto } = f
    setFiltros(resto)
    if (cidade) setEscopo({ cidade, uf: cidades?.find((x) => x.cidade === cidade)?.uf })
    return resumo
  }

  const { pontos, sobre, linhas } = useCamadas({ eqs: eqs.data, ags: ags.data, alertas: alertas.data, sel, setSel, replay, agora })
  const abertoAttr: Record<string, string> = folha ? { 'data-aberto': '' } : {}
  const resumoFolha = alertas.data ? `${alertas.data.length} alertas · ${eqs.data?.length ?? 0} equipamentos` : 'Filtros e alertas'
  const alertaDoAgente = agenteSel?.alerta_id ? alertas.data?.find((a) => a.id === agenteSel.alerta_id) : undefined
  return (
    <>
      <Comando executar={executar} />
      <FaixaKpis q={kpis} alertas={alertas.data} />
      <div className="palco central">
        <Estado q={eqs} linhas={8}>
          <Mapa rotulo="Mapa de equipamentos e agentes" pontos={pontos} sobre={sobre} linhas={linhas} rastro={rep.rastro} calor={calor.data?.pontos} camada={camada} chave={JSON.stringify([escopo, filtros])} />
        </Estado>
        <div className="barra-topo">
          <AoVivo status={status} ultimo={ultimo} latencia={latencia} />
          <Botao variante="vidro" icone="incidente" carregando={enviando} onClick={() => incidente()}>Injetar incidente{filtros.bairro ? ` em ${filtros.bairro}` : ''}</Botao>
          <Botao variante="vidro" icone="replay" aria-pressed={replay} onClick={replay ? rep.parar : rep.iniciar}>Replay 24 h</Botao>
          <Link className="btn vidro" to="/briefing"><Icone nome="briefing" />Briefing</Link>
          <span aria-live="polite" className="msg" hidden={!msg}>{msg}</span>
        </div>
        <Legenda />
        <PainelCalor camada={camada} onCamada={setCamada} calor={calor.data}
          modos={<Segmentado rotulo="Modo do calor" opcoes={MODOS} valor={modo} onChange={setModo} />} />
        {replay && <ControleReplay r={rep} />}
        <div className="folha" {...abertoAttr}>
          <button type="button" className="alca" aria-expanded={folha} onClick={() => setFolha(!folha)}>{resumoFolha}<Icone nome="abaixo" /></button>
          <div className="col esq">
            <section className="painel flut fixo" aria-label="Busca e filtros"><Filtros valor={filtros} onChange={setFiltros} opcoes={opcoes} /></section>
            <Painel titulo="Operação" className="flut rola" acoes={
              <Segmentado rotulo="Lista" valor={aba} onChange={setAba} opcoes={[['alertas', `Alertas${nAba(alertas)}`], ['manutencao', `Manutenção${nAba(manut)}`], ['agentes', 'Agentes']]} />}>
              {aba === 'alertas' && <Alertas q={alertas} sel={sel?.tipo === 'alerta' ? sel.id : null} onSel={(id) => ver({ tipo: 'alerta', id })} />}
              {aba === 'manutencao' && <Manutencao q={manut} onVer={(id) => ver({ tipo: 'eq', id })} />}
              {aba === 'agentes' && <AgentesLista q={ags} onVer={(id) => ver({ tipo: 'agente', id })} />}
            </Painel>
          </div>
          <div className="col dir">
            {alertaSel ? <DetalheAlerta a={alertaSel} agentes={ags.data ?? []} onFechar={() => setSel(null)} onMsg={setMsg} />
              : eqSel ? <DetalheEq eq={eqSel} metricas={metricas[eqSel.id]} onFechar={() => setSel(null)} onIncidente={incidente} />
              : agenteSel ? <DetalheAgente ag={agenteSel} alerta={alertaDoAgente} onFechar={() => setSel(null)} onVerAlerta={(id) => setSel({ tipo: 'alerta', id })} />
              : <Saude q={grupos} por={por} onPor={setPor} />}
          </div>
        </div>
      </div>
    </>
  )
}
