import {
  Bike, Bot, CalendarDays, Check, ChevronLeft, ChevronRight, Layers, Bus, Camera, ChevronDown, Clock, Command, Bell, Flame, Info, Locate, Minus, PanelLeft, Plus, Search, SlidersHorizontal, Trash2, X,
  Car, CircleCheck, CircleDashed, CircleDot, CornerUpLeft, Fence, Gauge, LayoutDashboard, Navigation, Pencil, ExternalLink,
  PowerOff, Scale, ShieldAlert, Siren, TabletSmartphone, TrafficCone, TrendingUp, TriangleAlert, UserRound, Users, Wrench, Zap, Database,
  Download, FileText, Moon, Pause, Play, Presentation, Printer, Sun, Upload, History,
  type LucideIcon,
} from 'lucide-react'
import { createElement } from 'react'

/** Único catálogo de ícones: tipos de equipamento, situações, agentes e navegação (todos SVG, mesmo traço). */
const ICONES = {
  radar_velocidade: Gauge, radar_semaforo: TrafficCone, radar_conversao_proibida: CornerUpLeft, camera: Camera, balanca: Scale,
  veiculo_autonomo: Bot, cancela: Fence, taxi: Car, mototaxi: Bike, transporte_escolar: Bus, totem: TabletSmartphone, patinete: Zap,
  moto_agente: Navigation, viatura: Siren, outro: CircleDot,
  operacional: CircleCheck, mau_funcionamento: TriangleAlert, em_manutencao: Wrench, desativado: PowerOff, furtado: ShieldAlert,
  nao_instalado: CircleDashed,
  agente: UserRound, agentes: Users, central: LayoutDashboard, preditiva: TrendingUp, inventario: Database, equipamentos: Database,
  editar: Pencil, excluir: Trash2, fechar: X, buscar: Search, filtros: SlidersHorizontal, mais: Plus, menos: Minus, abaixo: ChevronDown, alvo: Locate,
  comando: Command, alertas: Bell, relogio: Clock, info: Info, incidente: Zap, logo: Flame, menu: PanelLeft, abrir: ExternalLink, manutencao: Wrench,
  play: Play, pause: Pause, tema_escuro: Moon, tema_claro: Sun, imprimir: Printer, baixar: Download, enviar: Upload, briefing: FileText,
  apresentar: Presentation, replay: History, confirmar: Check, esquerda: ChevronLeft, direita: ChevronRight, calendario: CalendarDays, camadas: Layers,
} satisfies Record<string, LucideIcon>

export type NomeIcone = keyof typeof ICONES
export const icone = (nome: string): LucideIcon => ICONES[nome as NomeIcone] ?? CircleDot

/** Ícone SVG; decorativo (aria-hidden) a menos que receba `titulo`. */
export function Icone({ nome, tam = 16, titulo }: { nome: string; tam?: number; titulo?: string }) {
  return createElement(icone(nome), titulo ? { size: tam, role: 'img', 'aria-label': titulo } : { size: tam, 'aria-hidden': true })
}
