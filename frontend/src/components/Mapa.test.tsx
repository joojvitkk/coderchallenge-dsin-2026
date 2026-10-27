import { act, render } from '@testing-library/react'
import L from 'leaflet'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Mapa, type Ponto } from './Mapa'

vi.mock('leaflet.heat', () => ({}))

const eq = (id: number, lat: number): Ponto => ({ id: `e${id}`, lat, lon: -50, cor: 'red', icone: 'camera', titulo: `eq ${id}` })
const agente = (lat: number): Ponto => ({ id: 'a1', lat, lon: -50, cor: 'blue', icone: 'agente', titulo: 'ag', solto: true })

describe('Mapa: reenquadramento', () => {
  afterEach(() => vi.restoreAllMocks())
  const espiao = () => vi.spyOn(L.Map.prototype, 'fitBounds')

  it('só reenquadra quando o conjunto (ids) ou o escopo mudam, nunca por posição de agentes ou seleção', () => {
    const fit = espiao()
    const base = [eq(1, -22), eq(2, -23)]
    const { rerender } = render(<Mapa rotulo="m" chave="a" pontos={[...base, agente(-22.1)]} />)
    const inicial = fit.mock.calls.length
    expect(inicial).toBeGreaterThan(0)
    expect(fit.mock.calls.at(-1)?.[1]).toMatchObject({ animate: false }) // regressão: timer de zoom pós-desmontagem (_leaflet_pos)
    // agente se mexe (SSE a cada ~2s) e um equipamento é selecionado: nenhum fitBounds novo
    rerender(<Mapa rotulo="m" chave="a" pontos={[...base, agente(-22.2)]} />)
    rerender(<Mapa rotulo="m" chave="a" pontos={[{ ...base[0], destaque: true }, base[1], agente(-22.3)]} />)
    expect(fit).toHaveBeenCalledTimes(inicial)
    // o conjunto filtrado mudou: reenquadra
    rerender(<Mapa rotulo="m" chave="a" pontos={[base[0], agente(-22.3)]} />)
    expect(fit).toHaveBeenCalledTimes(inicial + 1)
  })

  it('depois que o usuário mexe no mapa só reenquadra ao mudar o escopo', () => {
    const fit = espiao()
    const { rerender, container } = render(<Mapa rotulo="m" chave="a" pontos={[eq(1, -22)]} />)
    const n = fit.mock.calls.length
    act(() => { container.querySelector('.leaflet-container')!.dispatchEvent(new Event('pointerdown', { bubbles: true })) })
    rerender(<Mapa rotulo="m" chave="a" pontos={[eq(1, -22), eq(2, -23)]} />)
    expect(fit).toHaveBeenCalledTimes(n)
    rerender(<Mapa rotulo="m" chave="b" pontos={[eq(1, -22), eq(2, -23)]} />)
    expect(fit).toHaveBeenCalledTimes(n + 1)
  })
})

describe('Mapa: texto de usuário não vira HTML', () => {
  it('escapa cor/ícone no divIcon e mostra títulos como texto', () => {
    const ataque = '"><img src=x onerror=alert(1)>'
    const { container } = render(<Mapa rotulo="m" pontos={[{ ...eq(1, -22), cor: ataque, titulo: ataque, solto: true }]} />)
    expect(container.querySelector('.leaflet-marker-icon img')).toBeNull()
    expect(container.querySelector('.leaflet-marker-icon')?.getAttribute('title')).toBe(ataque) // atributo, não HTML
    expect(container.querySelector('.leaflet-marker-icon .pino')?.getAttribute('style')).toBe(`--c:${ataque}`) // continua dado, não marcação
  })
})

describe('Mapa: camada de calor', () => {
  it('cria a camada, atualiza os pontos sem reenquadrar e ajusta o raio ao zoom; "calor" esconde os pinos', async () => {
    const heat = { addTo: vi.fn(), remove: vi.fn(), setLatLngs: vi.fn(), setOptions: vi.fn() }
    ;(L as unknown as { heatLayer: unknown }).heatLayer = vi.fn(() => heat)
    const fit = vi.spyOn(L.Map.prototype, 'fitBounds')
    const pts = [{ lat: -22, lon: -50, peso: 2 }, { lat: -23, lon: -50, peso: 1 }]
    const { rerender, container } = render(<Mapa rotulo="m" camada="ambos" calor={pts} pontos={[{ ...eq(1, -22), solto: true }]} />)
    await vi.waitFor(() => expect(heat.addTo).toHaveBeenCalled())
    await vi.waitFor(() => expect(heat.setLatLngs).toHaveBeenLastCalledWith([[-22, -50, 1], [-23, -50, 0.5]]))
    const n = fit.mock.calls.length
    rerender(<Mapa rotulo="m" camada="ambos" calor={[{ lat: -22, lon: -50, peso: 3 }]} pontos={[{ ...eq(1, -22), solto: true }]} />)
    await vi.waitFor(() => expect(heat.setLatLngs).toHaveBeenLastCalledWith([[-22, -50, 1]]))
    expect(fit.mock.calls.length).toBe(n) // novos pesos não reenquadram (nada de zoom voltando)
    expect(container.querySelector('.leaflet-marker-icon')).not.toBeNull()
    rerender(<Mapa rotulo="m" camada="calor" calor={pts} pontos={[{ ...eq(1, -22), solto: true }]} />)
    expect(container.querySelector('.leaflet-marker-icon')).toBeNull()
    delete (L as unknown as { heatLayer?: unknown }).heatLayer
  })
})
