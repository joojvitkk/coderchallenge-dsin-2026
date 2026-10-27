export interface EnderecoCep { rua: string; bairro: string; cidade: string; uf: string }

/** CEP no formato 00000-000 (ou 8 dígitos). */
export const CEP_VALIDO = /^\d{5}-?\d{3}$/

/**
 * Consulta o ViaCEP. Nunca quebra: sem rede, CEP inexistente, resposta inesperada ou demora > 2,5 s devolvem null
 * e o formulário simplesmente segue com o preenchimento manual.
 */
export async function buscarCep(cep: string, fetcher: typeof fetch = fetch): Promise<EnderecoCep | null> {
  if (!CEP_VALIDO.test(cep)) return null
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), 2500)
  try {
    const r = await fetcher(`https://viacep.com.br/ws/${cep.replace('-', '')}/json/`, { signal: ctl.signal })
    if (!r.ok) return null
    const d = (await r.json()) as { erro?: unknown; logradouro?: string; bairro?: string; localidade?: string; uf?: string }
    if (d.erro || !d.localidade || !d.uf) return null
    return { rua: d.logradouro ?? '', bairro: d.bairro ?? '', cidade: d.localidade, uf: d.uf }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
