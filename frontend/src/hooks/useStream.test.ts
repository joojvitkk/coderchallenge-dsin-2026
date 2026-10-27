import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStream } from './useStream'

class FakeES {
  static last: FakeES
  static CLOSED = 2
  readyState = 0
  onopen: (() => void) | null = null
  onerror: (() => void) | null = null
  closed = false
  listeners: Record<string, (e: MessageEvent<string>) => void> = {}
  constructor(public url: string) { FakeES.last = this }
  addEventListener(n: string, f: (e: MessageEvent<string>) => void) { this.listeners[n] = f }
  close() { this.closed = true }
}

beforeEach(() => vi.stubGlobal('EventSource', FakeES))
afterEach(() => vi.unstubAllGlobals())

describe('useStream', () => {
  it('muda status, despacha eventos JSON, ignora malformados e fecha ao desmontar', () => {
    const kpis = vi.fn()
    const { result, unmount } = renderHook(() => useStream({ kpis }))
    expect(result.current).toBe('conectando')
    act(() => FakeES.last.onopen?.())
    expect(result.current).toBe('online')
    act(() => FakeES.last.listeners.kpis({ data: '{"total":3}' } as MessageEvent<string>))
    expect(kpis).toHaveBeenCalledWith({ total: 3 })
    act(() => FakeES.last.listeners.kpis({ data: 'xx' } as MessageEvent<string>))
    expect(kpis).toHaveBeenCalledTimes(1)
    FakeES.last.readyState = 2
    act(() => FakeES.last.onerror?.())
    expect(result.current).toBe('offline')
    unmount()
    expect(FakeES.last.closed).toBe(true)
  })
})

describe('useStream: latência evento -> tela', () => {
  it('mede o tempo desde o id (epoch ms de emissão) até o quadro seguinte', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(10_000)
    const onLatencia = vi.fn()
    renderHook(() => useStream({ kpis: () => {} }, '/api/stream', onLatencia))
    act(() => FakeES.last.listeners.kpis({ data: '{}', lastEventId: '9950' } as MessageEvent<string>))
    await vi.advanceTimersByTimeAsync(50)
    expect(onLatencia).toHaveBeenCalledTimes(1)
    expect(onLatencia.mock.calls[0][0]).toBeGreaterThanOrEqual(50)
    act(() => FakeES.last.listeners.kpis({ data: '{}', lastEventId: '' } as MessageEvent<string>)) // sem id: não mede
    await vi.advanceTimersByTimeAsync(50)
    expect(onLatencia).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })
})
