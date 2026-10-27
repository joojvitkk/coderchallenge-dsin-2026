import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { importarInventario } from '../../api/client'
import type { RelatorioImportacao } from '../../api/types'
import { Arquivo } from '../../components/Campos'
import { Botao } from '../../components/Controles'
import { Dialogo } from '../../components/Painel'

/** Importação em duas etapas: valida o arquivo (relatório de erros por linha) e só grava, tudo ou nada, quando está sem erros. */
export function Importar({ onFim }: { onFim: () => void }) {
  const qc = useQueryClient()
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [rel, setRel] = useState<RelatorioImportacao | null>(null)
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)

  const rodar = (f: File, simular: boolean) => {
    setOcupado(true)
    setErro('')
    importarInventario(f, simular).then(
      (r) => {
        setRel(r)
        if (r.gravado) { void qc.invalidateQueries({ queryKey: ['/equipamentos'] }); onFim() }
      },
      (e: Error) => { setRel(null); setErro(e.message) },
    ).finally(() => setOcupado(false))
  }
  const escolher = (f?: File) => { setArquivo(f ?? null); setRel(null); if (f) rodar(f, true) }

  return (
    <Dialogo titulo="Importar inventário" onFechar={onFim}>
      <div className="importar">
        <p className="estado-texto">Envie um arquivo CSV (mesmas colunas da exportação; <code>atributos</code> em JSON) ou GeoJSON. Linhas com a mesma série atualizam o equipamento; as demais são criadas. Se houver qualquer erro, nada é gravado.</p>
        <div className="campo">
          <label htmlFor="arquivo-inv">Arquivo</label>
          <Arquivo id="arquivo-inv" accept=".csv,.json,.geojson,text/csv,application/json" arquivo={arquivo} onEscolher={escolher} />
        </div>
        <div aria-live="polite">
          {ocupado && <p className="estado-texto">Validando…</p>}
          {erro && <p className="estado-texto" role="alert">{erro}</p>}
          {rel && (
            <>
              <p><b>{rel.total}</b> linhas · <b>{rel.criados}</b> novas · <b>{rel.atualizados}</b> atualizações · <b>{rel.erros.length}</b> erro(s)</p>
              {rel.erros.length > 0 && (
                <div className="rolagem">
                  <table aria-label="Erros de importação">
                    <thead><tr><th>Linha</th><th>Série</th><th>Campo</th><th>Problema</th></tr></thead>
                    <tbody>{rel.erros.slice(0, 50).map((e, i) => <tr key={i}><td>{e.linha}</td><td>{e.serie ?? '—'}</td><td>{e.campo}</td><td className="quebra">{e.mensagem}</td></tr>)}</tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      </div>
      <div className="form-rodape">
        <span style={{ flex: 1 }} />
        <Botao onClick={onFim}>Cancelar</Botao>
        <Botao variante="primario" icone="enviar" disabled={!arquivo || !rel || rel.erros.length > 0 || rel.validos === 0} carregando={ocupado} onClick={() => arquivo && rodar(arquivo, false)}>Importar</Botao>
      </div>
    </Dialogo>
  )
}
