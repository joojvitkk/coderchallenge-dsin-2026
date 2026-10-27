import { useBriefing } from '../../api/client'
import { Botao } from '../../components/Controles'
import { Estado } from '../../components/Estado'
import { dataHora } from '../../lib/util'

/** Briefing executivo PROMETHEUS em português: imprimível (CSS de impressão) ou salvo como PDF pelo navegador. */
export default function Briefing() {
  const q = useBriefing()
  const b = q.data
  return (
    <article className="briefing" aria-label="Briefing executivo">
      <div className="no-print acoes">
        <Botao variante="primario" icone="imprimir" onClick={() => window.print()}>Imprimir / salvar PDF</Botao>
        <small>Gerado por regras a partir dos mesmos dados da Central e da Preditiva (sem LLM).</small>
      </div>
      <Estado q={q} linhas={8}>
        {b && (
          <>
            <header>
              <h2 className="titulo-doc">Briefing PROMETHEUS</h2>
              <p className="meta">{b.escopo} · gerado em {dataHora(b.gerado_em)} · dados simulados</p>
            </header>
            <section><h3>Situação agora</h3><ul>{b.situacao.map((l) => <li key={l}>{l}</li>)}</ul></section>
            <section>
              <h3>Os 3 maiores riscos das próximas {b.janela_horas} horas</h3>
              <ol>{b.riscos.map((r) => <li key={r.local}><b>{r.local}</b> por volta das {r.quando}: risco {r.score}/100 (principal fator: {r.motivo}).</li>)}</ol>
            </section>
            <section><h3>Ações recomendadas</h3><ol>{b.acoes.map((a) => <li key={a}>{a}</li>)}</ol></section>
            <footer className="meta">Base: {b.base.eventos.toLocaleString('pt-BR')} eventos e {b.base.telemetria.toLocaleString('pt-BR')} leituras de telemetria; {b.base.regras}.</footer>
          </>
        )}
      </Estado>
    </article>
  )
}
