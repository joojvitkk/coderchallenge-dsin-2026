import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useTema } from '../hooks/useTema'
import { buscarCep, CEP_VALIDO } from './cep'
import { DURACAO_TOTAL_S, ROTEIRO } from './roteiro'
import { diasAte, distanciaKm, etaMin, haQuanto, urgenciaManut, utc } from './util'

describe('CEP / ViaCEP', () => {
  it('valida o formato e preenche o endereço', async () => {
    expect(CEP_VALIDO.test('17500-000') && CEP_VALIDO.test('17500000')).toBe(true)
    expect(CEP_VALIDO.test('1750-000')).toBe(false)
    const ok = vi.fn<(u: string) => Promise<Response>>(async () => new Response(JSON.stringify({ logradouro: 'Av. Brasil', bairro: 'Centro', localidade: 'Marília', uf: 'SP' })))
    expect(await buscarCep('17500-000', ok as unknown as typeof fetch)).toEqual({ rua: 'Av. Brasil', bairro: 'Centro', cidade: 'Marília', uf: 'SP' })
    expect(String(ok.mock.calls[0][0])).toContain('/ws/17500000/json/')
  })
  it('nunca quebra: sem rede, erro HTTP, CEP inexistente ou formato inválido devolvem null', async () => {
    const semRede = vi.fn(async () => { throw new TypeError('Failed to fetch') })
    expect(await buscarCep('17500-000', semRede as unknown as typeof fetch)).toBeNull()
    expect(await buscarCep('17500-000', (async () => new Response('x', { status: 500 })) as unknown as typeof fetch)).toBeNull()
    expect(await buscarCep('99999-999', (async () => new Response('{"erro":true}')) as unknown as typeof fetch)).toBeNull()
    const naoChamado = vi.fn()
    expect(await buscarCep('abc', naoChamado as unknown as typeof fetch)).toBeNull()
    expect(naoChamado).not.toHaveBeenCalled()
  })
})

describe('datas, manutenção próxima e ETA', () => {
  const hoje = new Date(2026, 9, 17)
  it('diasAte e urgência: imediata, próxima da data (<= 7 dias ou atrasada) e agendada distante', () => {
    expect(diasAte('2026-10-20', hoje)).toBe(3)
    expect(diasAte('2026-10-10', hoje)).toBe(-7)
    expect(urgenciaManut({ manutencao_tipo: 'imediata', proxima_manutencao: null }, hoje)).toBe('imediata')
    expect(urgenciaManut({ manutencao_tipo: 'agendada', proxima_manutencao: '2026-10-24' }, hoje)).toBe('proxima')
    expect(urgenciaManut({ manutencao_tipo: 'agendada', proxima_manutencao: '2026-10-12' }, hoje)).toBe('proxima')
    expect(urgenciaManut({ manutencao_tipo: 'agendada', proxima_manutencao: '2026-11-20' }, hoje)).toBeNull()
    expect(urgenciaManut({ manutencao_tipo: 'nenhuma', proxima_manutencao: null }, hoje)).toBeNull()
  })
  it('timestamps do banco são UTC e ETA usa 40 km/h com rota 30% maior', () => {
    expect(utc('2026-10-17T18:00:00').toISOString()).toBe('2026-10-17T18:00:00.000Z')
    expect(utc('2026-10-17T18:00:00Z').getTime()).toBe(utc('2026-10-17T18:00:00').getTime())
    expect(haQuanto('2026-10-17T18:00:00', Date.UTC(2026, 9, 17, 18, 5))).toBe('há 5 min')
    expect(etaMin(10)).toBe(20) // 10 km * 1,3 / 40 km/h = 19,5 min
    expect(distanciaKm({ lat: -22.2, lon: -49.9 }, { lat: -22.2, lon: -49.9 })).toBe(0)
    expect(distanciaKm({ lat: -22.2, lon: -49.9 }, { lat: -22.3, lon: -49.9 })).toBeCloseTo(11.1, 0)
  })
})

describe('roteiro do modo apresentação', () => {
  it('dura 3 minutos e todo passo tem fala e rota', () => {
    expect(DURACAO_TOTAL_S).toBe(180)
    expect(ROTEIRO.every((p) => p.fala.length > 20 && p.rota.startsWith('/'))).toBe(true)
  })
})

describe('tema', () => {
  afterEach(() => { localStorage.clear(); delete document.documentElement.dataset.tema })
  it('alterna, aplica data-tema e lembra a escolha', () => {
    const { result } = renderHook(() => useTema())
    const inicial = result.current[0]
    act(() => result.current[1]())
    expect(result.current[0]).not.toBe(inicial)
    expect(document.documentElement.dataset.tema).toBe(result.current[0])
    expect(localStorage.getItem('fogo-tema')).toBe(result.current[0])
  })
})
