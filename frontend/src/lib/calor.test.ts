import { describe, expect, it } from 'vitest'
import { intensidades, maioresFocos, raioPorZoom } from './calor'

describe('calor: pesos, escala e focos', () => {
  const pts = [{ lat: 1, lon: 2, peso: 4 }, { lat: 3, lon: 4, peso: 2 }, { lat: 5, lon: 6, peso: 0 }]
  it('normaliza pelo maior foco e descarta pesos nulos', () => {
    expect(intensidades(pts)).toEqual([[1, 2, 1], [3, 4, 0.5]])
    expect(intensidades([])).toEqual([])
    expect(intensidades([{ lat: 0, lon: 0, peso: 0 }])).toEqual([])
  })
  it('com teto fixo a intensidade é absoluta e limitada a 1', () => {
    expect(intensidades([{ lat: 0, lon: 0, peso: 50 }, { lat: 1, lon: 1, peso: 150 }], 100)).toEqual([[0, 0, 0.5], [1, 1, 1]])
  })
  it('o raio cresce com o zoom dentro de limites', () => {
    expect(raioPorZoom(0)).toBe(18)
    expect(raioPorZoom(10)).toBeGreaterThan(raioPorZoom(5))
    expect(raioPorZoom(30)).toBe(48)
  })
  it('lista os 5 maiores focos em ordem decrescente sem alterar a entrada', () => {
    const f = Array.from({ length: 8 }, (_, i) => ({ local: `L${i}`, peso: (i * 7) % 8 }))
    const top = maioresFocos(f)
    expect(top).toHaveLength(5)
    expect(top.map((x) => x.peso)).toEqual([...top.map((x) => x.peso)].sort((a, b) => b - a))
    expect(f[0].local).toBe('L0')
  })
})
