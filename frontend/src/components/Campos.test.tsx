import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { Numero } from './Campos'
import { Data } from './Data'
import { Selecao, opcoesDe } from './Selecao'

afterEach(cleanup)

function Sel({ n = 3 }: { n?: number }) {
  const [v, setV] = useState('')
  return <><label htmlFor="s">Cor</label><Selecao id="s" valor={v} vazio="Todas" opcoes={opcoesDe(Array.from({ length: n }, (_, i) => `Cor ${i + 1}`))} onChange={setV} /><output>{v}</output></>
}

describe('Selecao', () => {
  it('abre, navega por teclado, escolhe com Enter e devolve o foco', () => {
    render(<Sel />)
    const cb = screen.getByRole('combobox', { name: 'Cor' })
    fireEvent.keyDown(cb, { key: 'ArrowDown' })
    expect(cb.getAttribute('aria-expanded')).toBe('true')
    fireEvent.keyDown(cb, { key: 'ArrowDown' })
    fireEvent.keyDown(cb, { key: 'Enter' })
    expect(screen.getByRole('status').textContent).toBe('Cor 1')
    expect(cb.textContent).toBe('Cor 1')
    expect(screen.queryByRole('listbox')).toBeNull()
  })
  it('Esc fecha sem alterar e listas longas ganham busca sem acento', () => {
    render(<Sel n={12} />)
    const cb = screen.getByRole('combobox')
    fireEvent.click(cb)
    const busca = screen.getByLabelText('Filtrar opções')
    fireEvent.change(busca, { target: { value: 'cor 12' } })
    expect(screen.getAllByRole('option')).toHaveLength(1)
    fireEvent.change(busca, { target: { value: 'zzz' } })
    expect(screen.getByText('Nada encontrado')).toBeTruthy()
    fireEvent.keyDown(busca, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).toBeNull()
    expect(screen.getByRole('status').textContent).toBe('')
  })
})

describe('Data', () => {
  it('escolhe um dia no calendário, navega de mês e limpa', () => {
    let valor = '2026-10-17'
    const { rerender } = render(<Data valor={valor} onChange={(v) => { valor = v }} />)
    fireEvent.click(screen.getByRole('button', { name: /17\/10\/2026/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Próximo mês' }))
    fireEvent.click(screen.getByRole('button', { name: /(^| )5 de novembro de 2026/ }))
    expect(valor).toBe('2026-11-05')
    rerender(<Data valor={valor} onChange={(v) => { valor = v }} />)
    fireEvent.click(screen.getByRole('button', { name: /05\/11\/2026/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Limpar' }))
    expect(valor).toBe('')
  })
  it('respeita min/max e fecha com Esc', () => {
    render(<Data valor="" min="2026-10-10" max="2026-10-20" onChange={() => undefined} />)
    fireEvent.click(screen.getByRole('button', { name: /dd\/mm/ }))
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('Numero', () => {
  it('filtra caracteres, usa vírgula como ponto e limita pelos botões', () => {
    let v = '5'
    render(<Numero valor={v} min={0} max={6} inteiro onChange={(x) => { v = x }} />)
    const campo = screen.getByRole('textbox')
    fireEvent.change(campo, { target: { value: 'abc' } })
    expect(v).toBe('5')
    fireEvent.change(campo, { target: { value: '1,5' } })
    expect(v).toBe('1.5')
    fireEvent.click(screen.getByRole('button', { name: 'Aumentar' }))
    expect(v).toBe('6')
  })
})
