import type { Calor } from '../api/types'
import { CAMADAS, GRADIENTE, type Camada } from '../lib/calor'
import { Segmentado } from './Controles'

export const SeletorCamada = ({ valor, onChange }: { valor: Camada; onChange: (c: Camada) => void }) => (
  <Segmentado rotulo="Camadas do mapa" opcoes={CAMADAS} valor={valor} onChange={onChange} />
)

const FAIXA = `linear-gradient(90deg, ${Object.entries(GRADIENTE).sort(([a], [b]) => +a - +b).map(([, c]) => c).join(', ')})`

/** Painel do mapa de calor (padrão P3.7): o que mostra, dados usados, como ajuda a decidir e os maiores focos em texto. */
export function PainelCalor({ camada, onCamada, modos, calor }: { camada: Camada; onCamada: (c: Camada) => void; modos: React.ReactNode; calor?: Calor }) {
  return (
    <section className="calor-painel flut" aria-label="Mapa de calor">
      <div className="chips"><SeletorCamada valor={camada} onChange={onCamada} />{camada !== 'pinos' && modos}</div>
      {camada !== 'pinos' && calor && (
        <>
          <i className="faixa-calor" style={{ background: FAIXA }} aria-hidden="true" />
          <div className="rot-calor"><span>baixo</span><span>alto</span></div>
          <p className="preve"><b>O que mostra:</b> {calor.preve}</p>
          <details>
            <summary>Maiores focos, dados usados e como ajuda</summary>
            <ol aria-label="Maiores focos">{calor.focos.map((f) => <li key={f.local}>{f.local} ({f.peso})</li>)}</ol>
            <p><b>Dados usados:</b> {calor.dados_usados.registros} registros em {calor.dados_usados.pontos} pontos.</p>
            <p><b>Como ajuda a decidir:</b> {calor.recomendacao}</p>
          </details>
        </>
      )}
    </section>
  )
}
