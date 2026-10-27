import { Loader2 } from 'lucide-react'
import type { ButtonHTMLAttributes, Ref } from 'react'
import { Icone } from './Icone'

type Variante = 'primario' | 'perigo' | 'sutil' | 'vidro'
type BotaoProps = ButtonHTMLAttributes<HTMLButtonElement> & { icone?: string; carregando?: boolean; variante?: Variante; pequeno?: boolean; soIcone?: boolean; ref?: Ref<HTMLButtonElement> }

/** Botão com ícone opcional e spinner enquanto a ação roda; `soIcone` exige aria-label. */
export function Botao({ icone, carregando, variante, pequeno, soIcone, className = '', children, ...rest }: BotaoProps) {
  const cls = ['btn', variante, pequeno && 'pequeno', soIcone && 'icone', className].filter(Boolean).join(' ')
  return (
    <button type="button" {...rest} className={cls} disabled={rest.disabled || carregando} aria-busy={carregando}>
      {carregando ? <Loader2 size={16} className="gira" aria-hidden="true" /> : icone && <Icone nome={icone} />}{children}
    </button>
  )
}

/** Chip de filtro (liga/desliga). */
export const Chip = ({ ativo, onClick, icone, children }: { ativo: boolean; onClick: () => void; icone?: string; children: React.ReactNode }) => (
  <button type="button" className="chip" aria-pressed={ativo} onClick={onClick}>{icone && <Icone nome={icone} tam={12} />}{children}</button>
)

/** Controle segmentado (escolha única entre poucas opções). */
export function Segmentado<T extends string>({ rotulo, opcoes, valor, onChange }: { rotulo: string; opcoes: readonly (readonly [T, string])[]; valor: T; onChange: (v: T) => void }) {
  return (
    <div className="segmentado" role="group" aria-label={rotulo}>
      {opcoes.map(([v, nome]) => <button key={v} type="button" aria-pressed={v === valor} onClick={() => onChange(v)}>{nome}</button>)}
    </div>
  )
}
