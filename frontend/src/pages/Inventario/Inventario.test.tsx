import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Inventario from '.'

const CAMERA = {
  id: 1, tipo: 'camera', serie: 'CM-00001', marca: 'Axis', modelo: 'Q1', orgao: 'Prefeitura', cep: '88010-400', bairro: 'Centro', regiao: 'Centro',
  cidade: 'Marília', uf: 'SP', rua: 'Rua A', referencia: '', lat: -27.59, lon: -48.54, situacao: 'operacional', manutencao_tipo: 'nenhuma',
  proxima_manutencao: null, atributos: { resolucao: 'HD', leitura_placa: false },
}
const AGENTE = { id: 7, nome: 'Ana Silva', matricula: 'AG0007', categoria: 'guarda', orgao: 'Guarda Municipal', status: 'ativo', lat: -27.5, lon: -48.5 }
const TIPOS = {
  camera: {
    rotulo: 'Câmera',
    schema: { properties: { resolucao: { type: 'string', enum: ['HD', '4K'] }, leitura_placa: { type: 'boolean' } }, required: ['resolucao'] },
  },
}

interface Chamada { metodo: string; caminho: string; corpo?: Record<string, unknown> }
let chamadas: Chamada[]
let falha: { status: number; detail: string } | null

const resposta = (corpo: unknown, status = 200) => new Response(status === 204 ? null : JSON.stringify(corpo), { status })

beforeEach(() => {
  chamadas = []
  falha = null
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const metodo = init?.method ?? 'GET'
    const caminho = url.split('?')[0]
    chamadas.push({ metodo, caminho, corpo: init?.body ? JSON.parse(String(init.body)) : undefined })
    if (metodo !== 'GET') return falha ? resposta({ detail: falha.detail }, falha.status) : resposta({}, metodo === 'DELETE' ? 204 : 200)
    if (caminho === '/api/tipos') return resposta(TIPOS)
    return resposta(caminho === '/api/agentes' ? [AGENTE] : [CAMERA])
  }))
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const abrir = () => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><Inventario /></MemoryRouter></QueryClientProvider>,
)
const sem = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
/** Digita em campo de texto ou escolhe a opção de um select personalizado (clica no combobox e depois na opção). */
const escrever = (painel: HTMLElement, campo: RegExp, valor: string) => {
  const el = within(painel).getByLabelText(campo)
  if (el.getAttribute('role') !== 'combobox') return fireEvent.change(el, { target: { value: valor } })
  fireEvent.click(el)
  fireEvent.click(screen.getAllByRole('option').find((o) => sem(o.textContent ?? '') === sem(valor))!)
}
const escritas = () => chamadas.filter((c) => c.metodo !== 'GET')

describe('Inventário: CRUD', () => {
  it('cria equipamento com atributos do tipo agrupados em "atributos"', async () => {
    abrir()
    await screen.findByText('CM-00001')
    fireEvent.click(screen.getByRole('button', { name: 'Novo equipamento' }))
    const form = await screen.findByRole('dialog', { name: 'Novo equipamento' })
    escrever(form, /^Tipo/, 'camera')
    for (const [campo, valor] of [['Série', 'CM-NOVO'], ['Marca', 'Hik'], ['Modelo', 'X'], ['Órgão', 'DETRAN'], ['CEP', '88010-400'], ['Bairro', 'Centro'],
      ['Região', 'Centro'], ['Rua', 'Rua B'], ['Lat', '-27.5'], ['Lon', '-48.5']]) escrever(form, new RegExp(`^${campo}`), valor)
    escrever(form, /^Resolução/, '4K')
    fireEvent.click(within(form).getByLabelText(/^Leitura placa/))
    fireEvent.click(within(form).getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(escritas()).toHaveLength(1))
    const { metodo, caminho, corpo } = escritas()[0]
    expect([metodo, caminho]).toEqual(['POST', '/api/equipamentos'])
    expect(corpo).toMatchObject({ tipo: 'camera', serie: 'CM-NOVO', lat: -27.5, situacao: 'nao_instalado', atributos: { resolucao: '4K', leitura_placa: true } })
    expect(corpo).not.toHaveProperty('resolucao')
  })

  it('edita com PUT mantendo o resto do cadastro', async () => {
    abrir()
    fireEvent.click(await screen.findByRole('button', { name: 'Editar CM-00001' }))
    const form = await screen.findByRole('dialog', { name: 'Editar equipamento' })
    expect(within(form).getByLabelText(/^Resolução/).textContent).toBe('HD')
    escrever(form, /^Marca/, 'Intelbras')
    fireEvent.click(within(form).getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(escritas()).toHaveLength(1))
    expect(escritas()[0]).toMatchObject({ metodo: 'PUT', caminho: '/api/equipamentos/1', corpo: { marca: 'Intelbras', serie: 'CM-00001', atributos: { resolucao: 'HD' } } })
  })

  it('mostra o erro da API (409) e mantém o formulário aberto', async () => {
    falha = { status: 409, detail: 'valor único já cadastrado (serie/matricula)' }
    abrir()
    fireEvent.click(await screen.findByRole('button', { name: 'Editar CM-00001' }))
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Editar equipamento' })).getByRole('button', { name: 'Salvar' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/já cadastrado/)
    expect(screen.getByRole('dialog', { name: 'Editar equipamento' })).toBeTruthy()
  })

  it('exclui só depois de confirmar', async () => {
    const confirmar = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    abrir()
    const botao = await screen.findByRole('button', { name: 'Excluir CM-00001' })
    fireEvent.click(botao)
    expect(escritas()).toHaveLength(0)
    fireEvent.click(botao)
    await waitFor(() => expect(escritas()).toEqual([{ metodo: 'DELETE', caminho: '/api/equipamentos/1', corpo: undefined }]))
    confirmar.mockRestore()
  })

  it('cria e exclui agentes na aba Agentes', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    abrir()
    fireEvent.click(await screen.findByRole('button', { name: /^Agentes/ }))
    await screen.findByText(/AG0007/)
    fireEvent.click(screen.getByRole('button', { name: 'Novo agente' }))
    const form = await screen.findByRole('dialog', { name: 'Novo agente' })
    for (const [campo, valor] of [['Nome', 'Bia Lima'], ['Matrícula', 'AG0100'], ['Órgão', 'Guarda Municipal'], ['Cidade', 'Marília'], ['UF', 'SP'], ['Lat', '-22.2'], ['Lon', '-49.9']]) escrever(form, new RegExp(`^${campo}`), valor)
    fireEvent.click(within(form).getByRole('button', { name: 'Salvar' }))
    await waitFor(() => expect(escritas()).toHaveLength(1))
    expect(escritas()[0]).toMatchObject({ metodo: 'POST', caminho: '/api/agentes', corpo: { nome: 'Bia Lima', matricula: 'AG0100', categoria: 'transito', status: 'ativo', lat: -22.2, lon: -49.9 } })
    fireEvent.click(screen.getByRole('button', { name: 'Excluir Ana Silva' }))
    await waitFor(() => expect(escritas().at(-1)).toMatchObject({ metodo: 'DELETE', caminho: '/api/agentes/7' }))
  })
})
