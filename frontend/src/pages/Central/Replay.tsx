import { useEffect, useMemo, useState } from 'react'
import { useReplay } from '../../api/client'
import type { Alerta } from '../../api/types'
import { Botao, Segmentado } from '../../components/Controles'
import { Intervalo } from '../../components/Campos'
import { Icone } from '../../components/Icone'
import type { Zona } from '../../components/Mapa'
import { COR_SEV, utc } from '../../lib/util'

const VELOCIDADES = [['600', '10 min/s'], ['3600', '1 h/s'], ['7200', '2 h/s']] as const
const JANELA_MS = 3 * 3600_000 // eventos exibidos: as 3 últimas horas do relógio do replay
const DIA_MS = 24 * 3600_000
const PASSO_MS = 100

interface Janela { ini: number; fim: number; t: number }

/** Instante do replay (24 h até agora), reprodução com velocidade e os eventos visíveis como círculos no mapa. */
export function useReplayMapa(iniciado = false) {
  const nova = (): Janela => { const fim = Date.now(); return { ini: fim - DIA_MS, fim, t: fim - DIA_MS } }
  const [janela, setJanela] = useState<Janela | null>(() => (iniciado ? nova() : null))
  const [pausado, setPausado] = useState(false)
  const [vel, setVel] = useState<number>(3600)
  const ativo = janela !== null
  const eventos = useReplay(ativo)
  const tocando = ativo && !pausado && janela.t < janela.fim
  useEffect(() => {
    if (!tocando) return
    const id = setInterval(() => setJanela((j) => j && { ...j, t: Math.min(j.fim, j.t + vel * PASSO_MS) }), PASSO_MS)
    return () => clearInterval(id)
  }, [tocando, vel])

  const t = janela?.t ?? 0
  const ordenados = useMemo(() => (eventos.data ?? []).map((a): [number, Alerta] => [+utc(a.ts), a]), [eventos.data])
  const visiveis = useMemo(() => ordenados.filter(([ts]) => ts <= t && ts > t - JANELA_MS).map(([, a]) => a), [ordenados, t])
  const rastro: Zona[] = useMemo(() => visiveis.map((a) => ({
    id: `r${a.id}`, lat: a.lat, lon: a.lon, raio: 3 + 2.5 * a.severidade, cor: COR_SEV[a.severidade], titulo: a.bairro,
  })), [visiveis])
  return {
    ativo, janela, t, tocando, vel, setVel, rastro, visiveis, carregando: eventos.isLoading, total: ordenados.length, erro: eventos.error,
    iniciar: () => { setJanela(nova()); setPausado(false) }, parar: () => setJanela(null),
    ir: (x: number) => { setPausado(true); setJanela((j) => j && { ...j, t: x }) },
    alternar: () => setPausado(tocando), // pausa se tocando, retoma se parado
    reiniciar: () => { setJanela((j) => j && { ...j, t: j.ini }); setPausado(false) },
  }
}

type Replay = ReturnType<typeof useReplayMapa>

/** Controle flutuante do replay: reproduzir/pausar, velocidade, linha do tempo e contagem de eventos. */
export function ControleReplay({ r }: { r: Replay }) {
  if (!r.janela) return null
  const graves = r.visiveis.filter((a) => a.severidade >= 3).length
  const relogio = new Date(r.t).toLocaleString('pt-BR', { weekday: 'short', hour: '2-digit', minute: '2-digit' })
  return (
    <div className="tempo flut" role="group" aria-label="Replay das últimas 24 horas">
      <header>
        <span><Icone nome="replay" tam={14} /> Replay 24 h · <b>{relogio}</b></span>
        <div className="chips">
          <Botao pequeno icone={r.tocando ? 'pause' : 'play'} onClick={r.t >= r.janela.fim ? r.reiniciar : r.alternar}>{r.tocando ? 'Pausar' : r.t >= r.janela.fim ? 'Rever' : 'Reproduzir'}</Botao>
          <Segmentado rotulo="Velocidade" opcoes={VELOCIDADES} valor={String(r.vel) as '3600'} onChange={(v) => r.setVel(Number(v))} />
          <Botao pequeno variante="sutil" icone="fechar" onClick={r.parar}>Sair do replay</Botao>
        </div>
      </header>
      <Intervalo min={r.janela.ini} max={r.janela.fim} step={60_000} value={r.t} aria-label="Instante do replay"
        aria-valuetext={relogio} onChange={(e) => r.ir(Number(e.target.value))} />
      <small aria-live="off">{r.carregando ? 'Carregando eventos…' : r.erro ? 'Falha ao carregar o replay' : `${r.visiveis.length} eventos nas 3 h anteriores a este instante (${graves} altos ou críticos) · ${r.total} no período`}</small>
    </div>
  )
}
