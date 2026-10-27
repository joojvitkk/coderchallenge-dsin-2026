import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useEscopo } from '../hooks/useEscopo'
import { ROTEIRO, type Contexto } from '../lib/roteiro'
import { Botao } from './Controles'

const PASSO_MS = 250

/** Modo apresentação: percorre o roteiro de 3 minutos (navega, dispara o incidente, abre o backtesting) com a fala sugerida na tela. */
export function Tour({ onSair }: { onSair: () => void }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { setEscopo } = useEscopo()
  const [est, setEst] = useState({ i: 0, ms: 0 }) // passo atual e milissegundos decorridos nele
  const [pausado, setPausado] = useState(false)
  const [erro, setErro] = useState('')
  const executado = useRef(-1)
  const ctx = useRef<Contexto>({ navigate, setEscopo, qc, estado: {} })
  const { i, ms: decorrido } = est
  const passo = ROTEIRO[i]

  useEffect(() => {
    if (executado.current === i) return // StrictMode monta duas vezes: a ação roda uma só
    executado.current = i
    navigate(passo.rota)
    Promise.resolve(passo.acao?.(ctx.current)).catch((e: Error) => setErro(e.message))
  }, [i, passo, navigate])

  useEffect(() => {
    if (pausado) return
    const t = setInterval(() => setEst((e) => (e.ms + PASSO_MS >= ROTEIRO[e.i].seg * 1000 ? (e.i + 1 < ROTEIRO.length ? { i: e.i + 1, ms: 0 } : e) : { ...e, ms: e.ms + PASSO_MS })), PASSO_MS)
    return () => clearInterval(t)
  }, [pausado])
  const ultimo = i + 1 === ROTEIRO.length
  useEffect(() => { if (ultimo && decorrido >= passo.seg * 1000 - PASSO_MS) onSair() }, [ultimo, decorrido, passo, onSair])
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === 'Escape' && onSair()
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [onSair])

  const ir = (n: number) => { setErro(''); setEst({ i: Math.max(0, Math.min(ROTEIRO.length - 1, n)), ms: 0 }) }
  return (
    <aside className="tour" aria-label="Modo apresentação">
      <div className="tour-cab"><b>{passo.titulo}</b><small>Passo {i + 1} de {ROTEIRO.length}</small></div>
      <p aria-live="polite">{passo.fala}</p>
      {erro && <p className="estado-texto" role="alert">{erro}</p>}
      <div className="trilho" role="progressbar" aria-label="Progresso do passo" aria-valuemin={0} aria-valuemax={passo.seg} aria-valuenow={Math.round(decorrido / 1000)}>
        <i style={{ width: `${Math.min(100, (decorrido / (passo.seg * 1000)) * 100)}%` }} />
      </div>
      <div className="acoes">
        <Botao pequeno icone="abaixo" className="gira-90" onClick={() => ir(i - 1)} disabled={i === 0}>Anterior</Botao>
        <Botao pequeno icone={pausado ? 'play' : 'pause'} onClick={() => setPausado(!pausado)}>{pausado ? 'Continuar' : 'Pausar'}</Botao>
        <Botao pequeno onClick={() => ir(i + 1)}>{i + 1 < ROTEIRO.length ? 'Próximo' : 'Concluir'}</Botao>
        <Botao pequeno variante="sutil" icone="fechar" onClick={onSair}>Sair</Botao>
      </div>
    </aside>
  )
}
