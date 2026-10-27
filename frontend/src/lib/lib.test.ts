import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, qs } from '../api/client'
import { interpretar } from './copilot'
import type { Equipamento } from '../api/types'
import { icone } from '../components/Icone'
import { converter } from '../components/FormularioDinamico'
import { centroides, corRisco, mesclarPorId, nomeEq, rotulo } from './util'

const ctx = { tipos: ['radar_velocidade', 'radar_semaforo', 'camera', 'transporte_escolar'], bairros: ['Centro', 'Estreito', 'Lagoa da Conceição'], regioes: ['Continente', 'Norte', 'Sul'], cidades: ['Marília', 'Garça'] }

describe('qs', () => {
  it('omite vazios e codifica', () => {
    expect(qs({ a: 1, b: '', c: undefined, d: 'x y' })).toBe('?a=1&d=x+y')
    expect(qs()).toBe('')
  })
})

describe('api', () => {
  afterEach(() => vi.unstubAllGlobals())
  const simular = (corpo: unknown, status: number) => vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(corpo), { status })))
  it('devolve o JSON e lança a mensagem de erro da API', async () => {
    simular({ a: 1 }, 200)
    expect(await api('/x')).toEqual({ a: 1 })
    simular({ detail: 'Equipamento 9 não encontrado' }, 404)
    await expect(api('/x')).rejects.toThrow('Equipamento 9 não encontrado')
    simular({ detail: [{ loc: ['body', 'lat'], msg: 'campo obrigatório' }] }, 422)
    await expect(api('/x')).rejects.toThrow('lat: campo obrigatório')
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>', { status: 502 })))
    await expect(api('/x')).rejects.toThrow('HTTP 502')
  })
})

describe('interpretar (copilot)', () => {
  it('reconhece a cidade (sem acento, sem artigo)', () => {
    expect(interpretar('cameras operacionais em marilia', ctx).filtros).toEqual({ tipo: 'camera', situacao: 'operacional', cidade: 'Marília' })
  })
  it('extrai tipo, situação e bairro', () => {
    const c = interpretar('Mostre radares furtados no Centro', ctx)
    expect(c.filtros).toEqual({ tipo: 'radar_velocidade,radar_semaforo', situacao: 'furtado', bairro: 'Centro' })
  })
  it('entende acentos, horizonte e região', () => {
    const c = interpretar('risco no Continente daqui a 6 horas', ctx)
    expect(c.filtros.regiao).toBe('Continente')
    expect(c.horas).toBe(6)
    expect(interpretar('transportes escolares na Lagoa da Conceição', ctx).filtros).toMatchObject({ tipo: 'transporte_escolar', bairro: 'Lagoa da Conceição' })
  })
  it('região só casa palavra inteira', () => {
    expect(interpretar('Pântano do Sul', { ...ctx, bairros: ['Pântano do Sul'] }).filtros).toEqual({ bairro: 'Pântano do Sul' })
  })
  it('manutenção imediata vira flag, não situação', () => {
    expect(interpretar('câmeras que precisam de manutenção', ctx).filtros).toEqual({ tipo: 'camera', precisa_manutencao: 'true' })
  })
  it('"agora" vira horizonte 0', () => {
    expect(interpretar('risco agora no Centro', ctx).horas).toBe(0)
  })
  it('amanhã = +24h e limita horas', () => {
    expect(interpretar('amanhã', ctx).horas).toBe(24)
    expect(interpretar('em 99h', ctx).horas).toBe(24)
    expect(interpretar('blá', ctx).resumo).toMatch(/nenhum/)
  })
})

describe('util', () => {
  it('rotulo restaura acentos dos identificadores', () => {
    expect(rotulo('nao_instalado')).toBe('Não instalado')
    expect(rotulo('radar_semaforo')).toBe('Radar semáforo')
    expect(rotulo('em_manutencao')).toBe('Em manutenção')
    expect(rotulo('leitura_placa')).toBe('Leitura placa')
    expect(nomeEq({ tipo: 'camera', serie: 'CM-1' })).toBe('Câmera CM-1')
  })
  it('mesclarPorId atualiza só o existente', () => {
    const l = [{ id: 1, s: 'a' }, { id: 2, s: 'b' }]
    expect(mesclarPorId(l, { id: 2, s: 'z' })).toEqual([{ id: 1, s: 'a' }, { id: 2, s: 'z' }])
    expect(mesclarPorId(l, { id: 9, s: 'z' })).toBe(l)
  })
  it('corRisco satura nos extremos', () => {
    expect(corRisco(-5)).toBe(corRisco(0))
    expect(corRisco(500)).toBe(corRisco(100))
    expect(corRisco(0)).not.toBe(corRisco(100))
  })
  it('ícone de tipo desconhecido cai no padrão', () => {
    expect(icone('camera')).not.toBe(icone('xyz'))
    expect(icone('xyz')).toBe(icone('outro'))
  })
  it('centroides agrupa por cidade', () => {
    const e = (cidade: string, lat: number, lon: number) => ({ cidade, lat, lon }) as Equipamento
    expect(centroides([e('A', 0, 0), e('A', 2, 4), e('B', 1, 1)], 'cidade')).toEqual({ A: { lat: 1, lon: 2 }, B: { lat: 1, lon: 1 } })
  })
  it('converter respeita tipos do schema', () => {
    expect(converter({ type: 'integer' }, '5')).toBe(5)
    expect(converter({ type: 'number' }, '')).toBeUndefined()
    expect(converter({ type: 'boolean' }, true)).toBe(true)
    expect(converter({ type: 'string' }, 'x')).toBe('x')
    expect(converter({ type: 'array' }, 'a, b,')).toEqual(['a', 'b'])
    expect(converter({ type: 'object' }, '{"k":1}')).toEqual({ k: 1 })
  })
})
