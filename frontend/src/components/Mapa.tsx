import L from 'leaflet'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Circle, CircleMarker, MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import 'leaflet/dist/leaflet.css'
import 'react-leaflet-cluster/dist/assets/MarkerCluster.css'
import 'react-leaflet-cluster/dist/assets/MarkerCluster.Default.css'
import { renderToStaticMarkup } from 'react-dom/server'
import type { PontoCalor } from '../api/types'
import { GRADIENTE, intensidades, raioPorZoom, type Camada } from '../lib/calor'
import { Botao } from './Controles'
import { Flutuante } from './Flutuante'
import { Icone } from './Icone'

export interface Ponto {
  id: string
  lat: number
  lon: number
  cor: string
  icone: string
  titulo: string
  destaque?: boolean
  solto?: boolean // não agrupa em cluster (ex.: agentes em movimento)
  anel?: 'imediata' | 'proxima' // manutenção a destacar: anel pulsante (imediata) ou tracejado (próxima da data)
  pulsa?: boolean // alerta recém-chegado
  onClick?: () => void
}
export interface Linha { id: string; de: [number, number]; para: [number, number]; titulo: string }
export interface Zona { id: string; lat: number; lon: number; raio: number; cor: string; titulo: string; tracejada?: boolean; onClick?: () => void }

/**
 * Bases do mapa. "Mapa" e "Claro" são OpenStreetMap/CARTO dessaturados por filtro CSS (.base-mapa) para os dados saltarem do fundo;
 * "Satélite" é imagem Esri World Imagery com rótulos de ruas/cidades por cima.
 */
export type Base = 'mapa' | 'satelite' | 'escuro'
const BASES: { id: Base; nome: string; icone: string; url: string; rotulos?: string; credito: string }[] = [
  { id: 'mapa', nome: 'Mapa', icone: 'central', url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', credito: '&copy; OpenStreetMap' },
  { id: 'satelite', nome: 'Satélite', icone: 'camadas', credito: 'Imagens &copy; Esri, Maxar, Earthstar Geographics',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    rotulos: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}' },
  { id: 'escuro', nome: 'Escuro', icone: 'tema_escuro', url: 'https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', credito: '&copy; OpenStreetMap, &copy; CARTO' },
]
const chaveBase = 'fogo.mapa.base'
const baseSalva = (): Base => { try { const b = localStorage.getItem(chaveBase); return BASES.some((x) => x.id === b) ? (b as Base) : 'mapa' } catch { return 'mapa' } }
const BRASIL: L.LatLngBoundsExpression = [[-33.7, -73.9], [5.3, -34.8]]

/** Marcador de mapa: o mesmo ícone da UI como SVG em string (L.divIcon). */
const svgIcone = (nome: string) => renderToStaticMarkup(<Icone nome={nome} tam={14} />)

/** Escapa texto para atributo/HTML: o `html` do divIcon é string crua, então nada vindo de dados entra sem passar por aqui. */
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)

const icones = new Map<string, L.DivIcon>()
const iconeDe = (p: Ponto) => {
  const chave = `${p.icone}|${p.cor}|${!!p.destaque}|${p.anel ?? ''}|${!!p.pulsa}`
  let i = icones.get(chave)
  if (!i) {
    const cls = ['pino', p.destaque && 'sel', p.anel && `anel-${p.anel}`, p.pulsa && 'pulsa'].filter(Boolean).join(' ')
    i = L.divIcon({ className: '', html: `<span class="${esc(cls)}" style="--c:${esc(p.cor)}">${svgIcone(p.icone)}</span>`, iconSize: [26, 26], iconAnchor: [13, 13] })
    icones.set(chave, i)
  }
  return i
}

const marcador = (p: Ponto) => (
  // `solto` (agentes e alertas, que se sobrepõem a outros pinos) não entra na ordem de Tab: têm lista navegável equivalente
  <Marker key={p.id} position={[p.lat, p.lon]} icon={iconeDe(p)} title={p.titulo} keyboard={!p.solto} eventHandlers={{ click: () => p.onClick?.() }}>
    <Tooltip>{p.titulo}</Tooltip>
  </Marker>
)

interface HeatLayer extends L.Layer { setLatLngs(p: [number, number, number][]): void; setOptions(o: object): void }

/** Camada de calor (leaflet.heat, carregado sob demanda: ele exige o `L` global). Só redesenha; nunca mexe no enquadramento. */
function CamadaCalor({ pontos, teto }: { pontos: PontoCalor[]; teto?: number }) {
  const map = useMap()
  const [pronto, setPronto] = useState(false)
  const camada = useRef<HeatLayer | null>(null)
  useEffect(() => {
    (globalThis as { L?: unknown }).L = L
    void import('leaflet.heat').then(() => setPronto(true))
  }, [])
  useEffect(() => {
    const fabrica = (L as unknown as { heatLayer?: (p: unknown[], o: object) => HeatLayer }).heatLayer
    if (!pronto || !fabrica) return
    const heat = fabrica([], { radius: raioPorZoom(map.getZoom()), blur: 22, max: 1, minOpacity: 0.3, gradient: GRADIENTE })
    heat.addTo(map)
    camada.current = heat
    const ajustar = () => heat.setOptions({ radius: raioPorZoom(map.getZoom()) })
    map.on('zoomend', ajustar)
    return () => { map.off('zoomend', ajustar); heat.remove(); camada.current = null }
  }, [pronto, map])
  useEffect(() => { camada.current?.setLatLngs(intensidades(pontos, teto)) }, [pontos, teto, pronto])
  return null
}

// sem animação: o timer de zoom do Leaflet disparava após o mapa ser desmontado (erro _leaflet_pos)
function enquadrar(map: L.Map, itens: { lat: number; lon: number }[]) {
  if (itens.length) map.fitBounds(L.latLngBounds(itens.map((p) => [p.lat, p.lon])), { padding: [30, 30], maxZoom: 14, animate: false })
}

/**
 * Mapa único das três páginas (pinos SVG por tipo, clusters, zonas de risco/lacunas).
 * Reenquadra sozinho SÓ quando o conjunto exibido (ids) ou o escopo (`chave`) muda — nunca por posição de
 * pontos móveis nem por seleção — e deixa de reenquadrar assim que o usuário mexe no mapa (até mudar o escopo
 * ou clicar em "Reenquadrar"). Sem pontos mostra o Brasil; o item `destaque` recebe flyTo uma vez.
 * `sobre` (alertas), `linhas` (rotas de despacho) e `rastro` (replay) são camadas que mudam o tempo todo e por isso
 * nunca entram no cálculo do enquadramento.
 */
export function Mapa({ pontos = [], zonas = [], sobre = [], linhas = [], rastro = [], calor, tetoCalor, camada = 'pinos', rotulo, chave = '' }: {
  pontos?: Ponto[]; zonas?: Zona[]; sobre?: Ponto[]; linhas?: Linha[]; rastro?: Zona[]; calor?: PontoCalor[]; tetoCalor?: number; camada?: Camada; rotulo: string; chave?: string
}) {
  const pinos = camada !== 'calor'
  const [base, setBase] = useState<Base>(baseSalva)
  const [camadasAbertas, setCamadasAbertas] = useState(false)
  const botaoCamadas = useRef<HTMLButtonElement>(null)
  const atual = BASES.find((b) => b.id === base)!
  const trocar = (b: Base) => { setBase(b); setCamadasAbertas(false); try { localStorage.setItem(chaveBase, b) } catch { /* sem armazenamento: vale só nesta sessão */ } }
  const [map, setMap] = useState<L.Map | null>(null)
  const itens = useMemo(() => [...pontos, ...zonas], [pontos, zonas])
  const ids = useMemo(() => itens.map((i) => i.id).sort().join(','), [itens])
  const destaque = [...pontos, ...sobre].find((p) => p.destaque)?.id
  const estado = useRef({ itens, destacaveis: [] as { id: string; lat: number; lon: number }[], chave: null as string | null, ids: '', tocou: false })
  useEffect(() => { estado.current.itens = itens; estado.current.destacaveis = [...pontos, ...sobre] })

  useEffect(() => {
    if (!map) return
    const marcar = () => { estado.current.tocou = true }
    const el = map.getContainer()
    const eventos = ['pointerdown', 'wheel', 'keydown'] as const
    eventos.forEach((e) => el.addEventListener(e, marcar))
    return () => eventos.forEach((e) => el.removeEventListener(e, marcar))
  }, [map])

  useEffect(() => {
    const e = estado.current
    if (!map || !e.itens.length) return
    const mudouEscopo = e.chave !== chave
    if (mudouEscopo) e.tocou = false
    if (!mudouEscopo && e.ids === ids) return
    e.chave = chave
    e.ids = ids
    if (!e.tocou) enquadrar(map, e.itens)
  }, [map, ids, chave])

  useEffect(() => {
    const p = estado.current.destacaveis.find((i) => i.id === destaque)
    if (map && p) map.flyTo([p.lat, p.lon], Math.max(map.getZoom(), 16))
  }, [map, destaque])

  // zoom pelos botões conta como interação do usuário: deixa de reenquadrar sozinho até mudar o escopo
  const zoom = (d: 1 | -1) => { estado.current.tocou = true; map?.setZoom(map.getZoom() + d) }
  return (
    <div className={`mapa base-${base}`} role="region" aria-label={rotulo}>
      <MapContainer ref={setMap} bounds={BRASIL} scrollWheelZoom keyboard zoomControl={false}>
        <TileLayer key={base} attribution={atual.credito} url={atual.url} maxZoom={19} />
        {atual.rotulos && <TileLayer key={`${base}-r`} url={atual.rotulos} maxZoom={19} className="tiles-rotulos" />}
        {calor && camada !== 'pinos' && <CamadaCalor pontos={calor} teto={tetoCalor} />}
        {pinos && zonas.map((z) =>
          z.tracejada ? (
            <Circle key={z.id} center={[z.lat, z.lon]} radius={z.raio} pathOptions={{ color: '#6b4fa3', dashArray: '6 6', fillOpacity: 0.08 }}>
              <Tooltip>{z.titulo}</Tooltip>
            </Circle>
          ) : (
            <CircleMarker key={z.id} center={[z.lat, z.lon]} radius={z.raio} pathOptions={{ color: '#fff', weight: 1.5, fillColor: z.cor, fillOpacity: 0.8 }}
              eventHandlers={{ click: () => z.onClick?.() }}>
              <Tooltip>{z.titulo}</Tooltip>
            </CircleMarker>
          ),
        )}
        {pinos && (
          <>
            <MarkerClusterGroup chunkedLoading maxClusterRadius={45} disableClusteringAtZoom={16}>
              {pontos.filter((p) => !p.solto).map(marcador)}
            </MarkerClusterGroup>
            {[...pontos.filter((p) => p.solto), ...sobre].map(marcador)}
          </>
        )}
        {linhas.map((l) => (
          <Polyline key={l.id} positions={[l.de, l.para]} pathOptions={{ color: '#3c4448', weight: 3, dashArray: '8 8' }}><Tooltip sticky>{l.titulo}</Tooltip></Polyline>
        ))}
        {rastro.map((z) => <CircleMarker key={z.id} center={[z.lat, z.lon]} radius={z.raio} interactive={false} pathOptions={{ color: '#fff', weight: 1, fillColor: z.cor, fillOpacity: 0.75 }} />)}
      </MapContainer>
      <div className="ctrl-mapa" role="group" aria-label="Controles do mapa">
        <Botao soIcone variante="sutil" icone="mais" aria-label="Aproximar" onClick={() => zoom(1)} />
        <Botao soIcone variante="sutil" icone="menos" aria-label="Afastar" onClick={() => zoom(-1)} />
        <Botao ref={botaoCamadas} soIcone variante="sutil" icone="camadas" aria-label="Tipo de mapa" aria-haspopup="menu" aria-expanded={camadasAbertas} title="Tipo de mapa" onClick={() => setCamadasAbertas(!camadasAbertas)} />
        <Botao soIcone variante="sutil" icone="alvo" aria-label="Reenquadrar" title="Reenquadrar" onClick={() => { estado.current.tocou = false; if (map) enquadrar(map, estado.current.itens) }} />
      </div>
      {camadasAbertas && (
        <Flutuante ancora={botaoCamadas} onFechar={() => setCamadasAbertas(false)} largura={172} altura={220} className="menu-base" role="menu" aria-label="Tipo de mapa"
          onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setCamadasAbertas(false); botaoCamadas.current?.focus() } }}>
          {BASES.map((b) => (
            <button key={b.id} type="button" role="menuitemradio" aria-checked={b.id === base} className={`amostra a-${b.id}`} onClick={() => trocar(b.id)}>
              <i aria-hidden="true" /><span>{b.nome}</span>{b.id === base && <Icone nome="confirmar" tam={14} />}
            </button>
          ))}
        </Flutuante>
      )}
    </div>
  )
}
