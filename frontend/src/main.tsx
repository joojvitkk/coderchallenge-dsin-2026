import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { EscopoProvider } from './hooks/useEscopo'
import '@fontsource-variable/plus-jakarta-sans'
import '@fontsource-variable/fraunces'
import './styles.css'

const client = new QueryClient({ defaultOptions: { queries: { staleTime: 10_000, retry: 1 } } })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <EscopoProvider><BrowserRouter><App /></BrowserRouter></EscopoProvider>
    </QueryClientProvider>
  </StrictMode>,
)
