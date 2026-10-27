import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import L from 'leaflet'
import App from './App'
import { abrir, instalarApi, type Chamada } from './test/fake'

vi.mock('leaflet.heat', () => ({})) // canvas não existe no jsdom: a camada real é coberta com uma fábrica falsa em Mapa.test

let chamadas: Chamada[]
beforeEach(() => { chamadas = instalarApi() })
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
const fez = (metodo: string, caminho: string) => chamadas.some((c) => c.metodo === metodo && c.caminho === caminho)

describe('Central', () => {
  it('mostra KPIs, alertas e detalhe; reconhece, despacha e resolve pelo ciclo de vida', async () => {
    abrir(<App />, '/central')
    expect(await screen.findByRole('heading', { name: 'Central de Operações' })).toBeTruthy()
    const lista = await screen.findByRole('list', { name: 'Alertas abertos' })
    fireEvent.click(within(lista).getByRole('button', { name: /Crítica: Falha/ }))
    expect((await screen.findAllByText(/SLA estourado/)).length).toBeGreaterThan(0)
    expect(await screen.findByText('Nenhum agente designado')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Reconhecer' }))
    await waitFor(() => expect(fez('POST', '/api/central/alertas/3/reconhecer')).toBe(true))
    fireEvent.click(screen.getByRole('button', { name: /Despachar agente mais próximo/ }))
    await waitFor(() => expect(fez('POST', '/api/central/alertas/3/despachar')).toBe(true))
    fireEvent.click(screen.getByRole('button', { name: 'Resolver' }))
    await waitFor(() => expect(fez('POST', '/api/central/alertas/3/resolver')).toBe(true))
  })

  it('troca de aba, filtra graves e injeta incidente', async () => {
    instalarApi({ 'POST /api/demo/incidente': { alerta: { id: 9, bairro: 'Centro', cidade: 'Marília', uf: 'SP' }, agente_acionado: 7, eta_min: 5 } })
    abrir(<App />, '/central')
    await screen.findByRole('list', { name: 'Alertas abertos' })
    fireEvent.click(screen.getByRole('button', { name: 'Alta e crítica' }))
    fireEvent.click(screen.getByRole('button', { name: /^Manutenção/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Agentes' }))
    expect(await screen.findByText(/Ana Silva/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Injetar incidente/ }))
    expect(await screen.findByText(/agente 7 a caminho, ETA ~5 min/)).toBeTruthy()
  })
})

describe('Central: mapa de calor', () => {
  it('liga o calor, troca o modo, lista os focos e não reenquadra o mapa', async () => {
    const fit = vi.spyOn(L.Map.prototype, 'fitBounds')
    abrir(<App />, '/central')
    await screen.findByRole('list', { name: 'Alertas abertos' })
    expect(chamadas.some((c) => c.caminho === '/api/central/calor')).toBe(false) // desligado até o usuário pedir
    await waitFor(() => expect(fit).toHaveBeenCalled())
    const antes = fit.mock.calls.length
    fireEvent.click(screen.getByRole('button', { name: 'Calor' }))
    fireEvent.click(screen.getByRole('button', { name: 'Indisponibilidade' }))
    await waitFor(() => expect(chamadas.some((c) => c.caminho === '/api/central/calor')).toBe(true))
    fireEvent.click(await screen.findByText('Maiores focos, dados usados e como ajuda'))
    expect(await screen.findByRole('list', { name: 'Maiores focos' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Ambos' }))
    expect(fit.mock.calls.length).toBe(antes)
  })
})

describe('Central: replay e detalhes', () => {
  it('replay reproduz, muda a velocidade, move o cursor e sai', async () => {
    abrir(<App />, '/central')
    fireEvent.click(await screen.findByRole('button', { name: /Replay 24 h/ }))
    const grupo = await screen.findByRole('group', { name: /Replay das últimas 24 horas/ })
    await waitFor(() => expect(fez('GET', '/api/central/replay')).toBe(true))
    fireEvent.click(within(grupo).getByRole('button', { name: '2 h/s' }))
    fireEvent.click(within(grupo).getByRole('button', { name: /Pausar|Reproduzir/ }))
    fireEvent.change(within(grupo).getByLabelText('Instante do replay'), { target: { value: String(Date.now() - 3600_000) } })
    fireEvent.click(within(grupo).getByRole('button', { name: 'Sair do replay' }))
    await waitFor(() => expect(screen.queryByRole('group', { name: /Replay das últimas/ })).toBeNull())
  })

  it('detalhe do equipamento (com histórico) e do agente a partir das listas', async () => {
    abrir(<App />, '/central')
    await screen.findByRole('list', { name: 'Alertas abertos' })
    fireEvent.click(screen.getByRole('button', { name: /^Manutenção/ }))
    fireEvent.click(await screen.findByRole('button', { name: /CM-00001/ }))
    expect(await screen.findByText('Marca / modelo')).toBeTruthy()
    fireEvent.click(screen.getByText('Histórico e auditoria'))
    await waitFor(() => expect(chamadas.some((c) => c.caminho === '/api/equipamentos/1/linha-do-tempo')).toBe(true))
    fireEvent.click(screen.getByRole('button', { name: 'Agentes' }))
    fireEvent.click(await screen.findByRole('button', { name: /Ana Silva/ }))
    expect(await screen.findAllByText(/Ana Silva/)).not.toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Fechar detalhe' }))
  })
})

describe('Preditiva', () => {
  it('renderiza risco, backtesting, tendências, manutenção, reforço e anomalias com a recomendação', async () => {
    abrir(<App />, '/preditiva')
    expect(await screen.findByText('Quão confiável é a previsão?')).toBeTruthy()
    expect(await screen.findByText(/Tendência/i)).toBeTruthy()
    expect((await screen.findAllByText('rec')).length).toBeGreaterThan(2)
    expect(fez('GET', '/api/previsao/backtest') && fez('GET', '/api/previsao/tendencias')).toBe(true)
    fireEvent.click(await screen.findByRole('button', { name: 'Cidade' }))
    await waitFor(() => expect(fez('GET', '/api/previsao/risco')).toBe(true))
  })
})

describe('Briefing, Importar e Tour', () => {
  it('Briefing mostra situação, riscos e ações e imprime', async () => {
    const imprimir = vi.spyOn(window, 'print').mockImplementation(() => {})
    abrir(<App />, '/briefing')
    expect(await screen.findByText('Briefing PROMETHEUS')).toBeTruthy()
    expect(screen.getByText(/risco 80\/100/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Imprimir/ }))
    expect(imprimir).toHaveBeenCalled()
  })

  it('Importar valida (simulação) e só habilita gravar sem erros; erros aparecem por linha', async () => {
    const rel = { total: 2, validos: 1, criados: 1, atualizados: 0, simulacao: true, gravado: false, erros: [{ linha: 3, serie: 'X', campo: 'cep', mensagem: 'inválido' }] }
    instalarApi({ 'POST /api/equipamentos/importar': () => rel })
    abrir(<App />, '/inventario')
    fireEvent.click(await screen.findByRole('button', { name: /^Importar/ }))
    const arq = new File(['serie\nX'], 'inv.csv', { type: 'text/csv' })
    fireEvent.change(await screen.findByLabelText('Arquivo'), { target: { files: [arq] } })
    expect(await screen.findByRole('table', { name: 'Erros de importação' })).toBeTruthy()
    const dialogo = screen.getByRole('dialog')
    expect((within(dialogo).getByRole('button', { name: 'Importar' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('Tour navega pelo roteiro, pausa e sai com Esc', async () => {
    abrir(<App />, '/central')
    fireEvent.click(await screen.findByRole('button', { name: /Apresentação/ }))
    expect(await screen.findByText('A pergunta-guia')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Próximo' }))
    expect(await screen.findByText('Tempo real de verdade')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Pausar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Anterior' }))
    expect(await screen.findByText('A pergunta-guia')).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByLabelText('Modo apresentação')).toBeNull())
  })

  it('rota desconhecida volta para a Central e o tema alterna', async () => {
    abrir(<App />, '/nada')
    expect(await screen.findByRole('heading', { name: 'Central de Operações' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Tema/ }))
    expect(document.documentElement.dataset.tema).toBeTruthy()
  })
})
