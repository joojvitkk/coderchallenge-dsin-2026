import { useIsFetching } from '@tanstack/react-query'
import { lazy, Suspense, useState, type CSSProperties } from 'react'
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Skeleton } from './components/Estado'
import { Botao } from './components/Controles'
import { Icone } from './components/Icone'
import { Tour } from './components/Tour'
import { useTema } from './hooks/useTema'
import { SeletorLocal, SeloDados } from './components/SeletorLocal'

// uma página por chunk: o mapa/gráficos só são baixados ao abrir a rota
const ROTAS = [
  { to: '/central', eyebrow: 'Monitoramento em tempo real', nome: 'Central de Operações', curto: 'Central', icone: 'central', Pagina: lazy(() => import('./pages/Central')) },
  { to: '/preditiva', eyebrow: 'Previsão explicável', nome: 'Cidade Preditiva', curto: 'Preditiva', icone: 'preditiva', Pagina: lazy(() => import('./pages/Preditiva')) },
  { to: '/inventario', eyebrow: 'Cadastro de equipamentos e agentes', nome: 'Inventário', curto: 'Inventário', icone: 'inventario', Pagina: lazy(() => import('./pages/Inventario')) },
  { to: '/briefing', eyebrow: 'Resumo executivo', nome: 'Briefing executivo', curto: 'Briefing', icone: 'briefing', Pagina: lazy(() => import('./pages/Briefing')) },
]

export default function App() {
  const buscando = useIsFetching() > 0
  const [apresentando, setApresentando] = useState(false)
  const [tema, alternarTema] = useTema()
  const { pathname, search } = useLocation()
  const indice = Math.max(0, ROTAS.findIndex((r) => pathname.startsWith(r.to)))
  const atual = ROTAS[indice]
  return (
    <div className="app">
      <div className="aurora" aria-hidden="true"><i /><i /><i /></div>
      <a className="skip" href="#principal">Ir para o conteúdo</a>
      <div className={`progresso${buscando ? ' ativo' : ''}`} role="progressbar" aria-label="Carregando dados" aria-hidden={!buscando} />
      <aside className="rail">
        <div className="rail-in">
          <div className="marca"><i><Icone nome="logo" tam={22} /></i><span><b>F.O.G.O.</b><small>Challenge DSIN</small></span></div>
          <p className="rotulo">Painéis</p>
          <nav className="lateral" aria-label="Principal" style={{ '--i': indice } as CSSProperties}>
            <i className="ind" aria-hidden="true" />
            {ROTAS.map((r) => <NavLink key={r.to} to={r.to} title={r.nome}><Icone nome={r.icone} tam={20} /><span>{r.curto}</span></NavLink>)}
          </nav>
          <div className="rail-pe">
            <button type="button" className="tema" data-escuro={tema === 'escuro' ? '' : undefined} onClick={alternarTema}
              aria-label={`Tema ${tema}: mudar para ${tema === 'claro' ? 'escuro' : 'claro'}`} title="Alternar tema claro/escuro">
              <Icone nome={tema === 'claro' ? 'tema_escuro' : 'tema_claro'} tam={20} /><span>Tema {tema}</span><span className="trilho-tema" aria-hidden="true" />
            </button>
          </div>
        </div>
      </aside>
      <div className="conteudo">
        <header className="barra">
          <div className="titulo"><div className="sobre-titulo"><p className="eyebrow">{atual.eyebrow}</p><SeloDados /></div><h1>{atual.nome}</h1></div>
          <SeletorLocal />
          <div id="topo-acoes" className="topo-acoes" />
          <Botao icone="apresentar" onClick={() => setApresentando(true)} title="Tour guiado de 3 minutos"><span className="sr-sm">Apresentação</span></Botao>
        </header>
        <main id="principal" tabIndex={-1}>
          <Suspense fallback={<Skeleton linhas={6} alto={24} />}>
            <Routes>
              {ROTAS.map(({ to, Pagina }) => <Route key={to} path={to} element={<Pagina key={to === '/central' ? search : to} />} />)}
              <Route path="*" element={<Navigate to="/central" replace />} />
            </Routes>
          </Suspense>
        </main>
      </div>
      {apresentando && <Tour onSair={() => setApresentando(false)} />}
    </div>
  )
}
