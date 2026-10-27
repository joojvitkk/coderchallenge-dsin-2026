import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Botao, Chip } from './Controles'
import { Dialogo } from './Painel'

const EXEMPLOS = ['radares furtados em Garça', 'risco no Fragata daqui a 6 horas', 'câmeras em manutenção agora']

/**
 * Copilot como paleta de comando (⌘K / Ctrl+K). O botão de abrir vai para o topo (#topo-acoes);
 * `executar` aplica o texto à página atual e devolve um resumo do que foi entendido.
 */
export function Comando({ executar }: { executar: (texto: string) => string }) {
  const [aberto, setAberto] = useState(false)
  const [txt, setTxt] = useState('')
  const [resumo, setResumo] = useState('')
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setAberto((a) => !a) }
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [])
  const rodar = (t: string) => { setTxt(t); setResumo(executar(t)) }
  const alvo = document.getElementById('topo-acoes')
  return (
    <>
      {alvo && createPortal(
        <Botao icone="comando" onClick={() => setAberto(true)} aria-label="Abrir comando (Ctrl+K)" aria-keyshortcuts="Control+K Meta+K"><span className="sr-sm">PROMETHEUS</span><kbd>⌘K</kbd></Botao>, alvo)}
      {aberto && (
        <Dialogo titulo="Comando PROMETHEUS" lado="centro" cabecalho={false} onFechar={() => setAberto(false)}>
          <div className="comando">
            <form role="search" onSubmit={(e) => { e.preventDefault(); rodar(txt) }}>
              <input aria-label="Comando em português" value={txt} onChange={(e) => setTxt(e.target.value)} placeholder="Diga o que quer ver…" />
              <Botao variante="primario" type="submit" icone="preditiva">Executar</Botao>
            </form>
            <div className="chips" role="group" aria-label="Exemplos">{EXEMPLOS.map((x) => <Chip key={x} ativo={false} onClick={() => rodar(x)}>{x}</Chip>)}</div>
            <output className="resumo" hidden={!resumo}>{resumo}</output>
          </div>
        </Dialogo>
      )}
    </>
  )
}
