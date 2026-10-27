import { useState } from 'react'
import { useCidades } from '../api/client'
import type { Cidade } from '../api/types'
import { useEscopo } from '../hooks/useEscopo'
import { Icone } from './Icone'
import { Selecao, opcoesDe } from './Selecao'

const nome = (c: Cidade) => `${c.cidade} · ${c.uf}${c.dsin ? ' — DSIN' : ''}`
const porNome = (a: Cidade, b: Cidade) => a.cidade.localeCompare(b.cidade, 'pt-BR')

/** Seletor de UF e cidade no topo: reenquadra o mapa e filtra tudo; vazio = Brasil inteiro. */
export function SeletorLocal() {
  const { escopo, setEscopo } = useEscopo()
  const cidades = useCidades().data ?? []
  const ufs = [...new Set(cidades.map((c) => c.uf))].sort()
  const daUf = cidades.filter((c) => !escopo.uf || c.uf === escopo.uf).sort(porNome)
  return (
    <div className="local" role="group" aria-label="Local">
      <Icone nome="alvo" />
      <label className="sr" htmlFor="sel-uf">Estado</label>
      <Selecao id="sel-uf" compacto valor={escopo.uf ?? ''} opcoes={opcoesDe(ufs)} vazio="Brasil" onChange={(v) => setEscopo(v ? { uf: v } : {})} />
      <label className="sr" htmlFor="sel-cidade">Cidade</label>
      <Selecao id="sel-cidade" compacto valor={escopo.cidade ?? ''} vazio="Todas as cidades" opcoes={daUf.map((c) => ({ valor: c.cidade, rotulo: nome(c) }))}
        onChange={(v) => setEscopo(v ? { uf: cidades.find((c) => c.cidade === v)?.uf, cidade: v } : { uf: escopo.uf })} />
    </div>
  )
}

/** Selo "Dados simulados"; ao abrir, explica o que é fictício e quais cidades têm presença da DSIN em fontes públicas. */
export function SeloDados() {
  const [aberto, setAberto] = useState(false)
  const confirmadas = (useCidades().data ?? []).filter((c) => c.dsin)
  return (
    <div className="dados-ref">
      <button type="button" className="pilula" style={{ '--c': 'var(--alerta)', height: 28 } as React.CSSProperties} aria-expanded={aberto} aria-controls="sobre-dados" onClick={() => setAberto(!aberto)}>
        <Icone nome="info" tam={12} />Dados simulados
      </button>
      {aberto && (
        <div className="popover" id="sobre-dados" role="region" aria-label="Sobre os dados">
          <p><b>Dados simulados.</b> Todos os equipamentos e agentes são fictícios.</p>
          <p>Presença da DSIN respaldada por fontes públicas (docs/PESQUISA_DSIN.md): <b>{confirmadas.map((c) => `${c.cidade}/${c.uf}`).join(', ')}</b>.</p>
          <p>As demais cidades são simulações de demonstração, sem alegar clientes reais.</p>
        </div>
      )}
    </div>
  )
}
