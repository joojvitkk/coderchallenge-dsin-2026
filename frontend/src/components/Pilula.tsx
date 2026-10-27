import type { CSSProperties, ReactNode } from 'react'
import { Icone } from './Icone'

/** Pílula de status: cor + ícone (opcional) + texto, nunca só cor. */
export const Pilula = ({ cor, icone, tracejada, children }: { cor: string; icone?: string; tracejada?: boolean; children: ReactNode }) => (
  <span className={`pilula${tracejada ? ' tracejada' : ''}`} style={{ '--c': cor } as CSSProperties}>{icone && <Icone nome={icone} tam={12} />}{children}</span>
)

/** Ícone do tipo/situação num quadrado arredondado tingido pela cor de status. */
export const Avatar = ({ icone, cor }: { icone: string; cor?: string }) => (
  <span className="avatar" style={cor ? ({ '--c': cor } as CSSProperties) : undefined}><Icone nome={icone} /></span>
)
