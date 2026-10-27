import type { QueryClient } from '@tanstack/react-query'
import type { NavigateFunction } from 'react-router-dom'
import { api, injetarIncidente } from '../api/client'
import type { Escopo } from '../api/types'

export interface Contexto { navigate: NavigateFunction; setEscopo: (e: Escopo) => void; qc: QueryClient; estado: { alerta?: number } }
export interface Passo { titulo: string; fala: string; seg: number; rota: string; acao?: (c: Contexto) => Promise<void> | void }


/** Roteiro do modo apresentação (3 minutos): cada passo navega, dispara o que precisa e traz a fala sugerida para o vídeo. */
export const ROTEIRO: Passo[] = [
  { titulo: 'A pergunta-guia', seg: 12, rota: '/central', acao: (c) => c.setEscopo({}),
    fala: 'Se algo estiver acontecendo na cidade agora, o PROMETHEUS percebe? Esta é a Central do F.O.G.O.: equipamentos, agentes e alertas num só mapa. Todos os dados são simulados.' },
  { titulo: 'Tempo real de verdade', seg: 18, rota: '/central', acao: (c) => c.setEscopo({ cidade: 'Marília', uf: 'SP' }),
    fala: 'Aproximo em Marília. Indicadores, mapa e alertas chegam por SSE; o selo "Ao vivo" mostra a latência do evento até a tela, medida em milissegundos.' },
  { titulo: 'Um incidente acontece', seg: 22, rota: '/central',
    acao: async (c) => {
      const { alerta } = await injetarIncidente('Fragata', 4)
      c.estado.alerta = alerta.id
      c.navigate(`/central?alerta=${alerta.id}`)
    },
    fala: 'Injeto um incidente crítico em Fragata. O alerta aparece no topo da lista, com severidade, prazo de SLA e o agente mais próximo já escolhido, com distância e ETA.' },
  { titulo: 'Despacho e ETA', seg: 22, rota: '/central',
    fala: 'O agente despachado se move no mapa até o local. Quando chega, o alerta passa a "em atendimento". Cada ação fica na trilha de auditoria.' },
  { titulo: 'Resolver e auditar', seg: 12, rota: '/central',
    acao: async (c) => {
      if (c.estado.alerta) await api(`/central/alertas/${c.estado.alerta}/resolver`, undefined, { method: 'POST' })
      await Promise.all(['/central/alertas', '/central/kpis', '/agentes'].map((k) => c.qc.invalidateQueries({ queryKey: [k] })))
    },
    fala: 'Resolvo o alerta: o agente volta à patrulha e os indicadores se atualizam sozinhos.' },
  { titulo: 'Replay das últimas 24 horas', seg: 14, rota: '/central?replay=1', fala: 'O replay reproduz as últimas 24 horas no mapa, com controle de velocidade, para entender o que aconteceu e quando.' },
  { titulo: 'Inventário completo', seg: 18, rota: '/inventario',
    fala: 'O cadastro cobre os 15 tipos do enunciado, com campos específicos por tipo, CEP com preenchimento automático, importação e exportação em CSV e GeoJSON validadas, e auditoria de alterações.' },
  { titulo: 'Cidade preditiva', seg: 24, rota: '/preditiva',
    fala: 'Risco por bairro e hora, explicável: cada pontuação mostra os fatores e o intervalo de confiança. Há reforço de agentes, anomalias, manutenção preditiva e a tendência de disponibilidade e utilização.' },
  { titulo: 'Prova: backtesting', seg: 24, rota: '/preditiva?foco=backtest',
    fala: 'Quão confiável é a previsão? Treinamos com o histórico até sete dias atrás e comparamos com o que realmente aconteceu: bairros previstos, falhas de equipamentos apontadas e o erro médio, sempre contra o acaso.' },
  { titulo: 'Briefing executivo', seg: 14, rota: '/briefing',
    fala: 'Por fim, o briefing em português: situação agora, três riscos das próximas seis horas e ações recomendadas, pronto para imprimir ou salvar em PDF.' },
]
export const DURACAO_TOTAL_S = ROTEIRO.reduce((t, p) => t + p.seg, 0)
