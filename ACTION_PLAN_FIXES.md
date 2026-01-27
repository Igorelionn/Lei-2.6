# 🎯 PLANO DE AÇÃO - CORREÇÕES E MELHORIAS
## Auction Usher - Roadmap de Implementação

**Data:** 27 de Janeiro de 2026  
**Prioridade:** Alta → Média → Baixa

---

## 🔴 PRIORIDADE ALTA (Implementar Imediatamente)

### 1. Adicionar Paginação nas Queries de Leilões

**Problema:** Query busca TODOS os leilões sem limite  
**Arquivo:** `src/hooks/use-supabase-auctions.ts:258`  
**Impacto:** Performance degradada com muitos dados  
**Esforço:** Médio (4-6 horas)

**Implementação:**

```typescript
// ANTES
const listQuery = useQuery({
  queryKey: AUCTIONS_KEY,
  queryFn: async () => {
    const { data, error } = await supabaseClient
      .from('auctions')
      .select(`...`);
    // ...
  }
});

// DEPOIS
interface PaginationParams {
  page: number;
  pageSize: number;
}

const listQuery = useQuery({
  queryKey: [...AUCTIONS_KEY, page, pageSize],
  queryFn: async ({ queryKey }) => {
    const [, , currentPage, currentPageSize] = queryKey;
    const offset = (currentPage as number - 1) * (currentPageSize as number);
    
    const { data, error, count } = await supabaseClient
      .from('auctions')
      .select(`...`, { count: 'exact' })
      .range(offset, offset + (currentPageSize as number) - 1)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    return {
      auctions: data,
      totalCount: count || 0,
      currentPage: currentPage as number,
      totalPages: Math.ceil((count || 0) / (currentPageSize as number))
    };
  }
});
```

**Componente de Paginação:**

```typescript
// components/Pagination.tsx
import { Button } from "./ui/button";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ currentPage, totalPages, onPageChange }: PaginationProps) {
  return (
    <div className="flex items-center justify-center gap-2 mt-4">
      <Button
        variant="outline"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
      >
        Anterior
      </Button>
      
      <span className="text-sm">
        Página {currentPage} de {totalPages}
      </span>
      
      <Button
        variant="outline"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
      >
        Próxima
      </Button>
    </div>
  );
}
```

**Uso no Componente:**

```typescript
// pages/Leiloes.tsx
const [page, setPage] = useState(1);
const PAGE_SIZE = 50;

const { data } = useSupabaseAuctions({ page, pageSize: PAGE_SIZE });

return (
  <div>
    {/* Lista de leilões */}
    <Pagination
      currentPage={page}
      totalPages={data?.totalPages || 1}
      onPageChange={setPage}
    />
  </div>
);
```

**Checklist:**
- [ ] Adicionar paginação no hook `useSupabaseAuctions`
- [ ] Criar componente `Pagination`
- [ ] Atualizar página `Leiloes.tsx`
- [ ] Testar com >100 leilões
- [ ] Verificar performance melhorada

---

### 2. Ajustar Configuração do React Query Cache

**Problema:** Cache completamente desabilitado (gcTime: 0)  
**Arquivo:** `src/hooks/use-supabase-auctions.ts:252-253`  
**Impacto:** Requisições desnecessárias ao servidor  
**Esforço:** Baixo (30 minutos)

**Implementação:**

```typescript
// ANTES
const listQuery = useQuery({
  queryKey: AUCTIONS_KEY,
  staleTime: 0,
  gcTime: 0, // ❌ Sem cache
  refetchOnWindowFocus: true,
  refetchOnMount: 'always',
});

// DEPOIS - Estratégia Equilibrada
const listQuery = useQuery({
  queryKey: AUCTIONS_KEY,
  staleTime: 30000, // ✅ 30 segundos - dados considerados "frescos"
  gcTime: 5 * 60 * 1000, // ✅ 5 minutos - mantém em cache
  refetchOnWindowFocus: true, // ✅ Atualiza ao focar janela
  refetchOnMount: 'always', // ✅ Sempre atualiza ao montar
  refetchInterval: false, // ❌ Sem polling (usar realtime)
});
```

**Explicação das Configurações:**

| Config | Valor | Razão |
|--------|-------|-------|
| `staleTime` | 30s | Dados não mudam a cada segundo |
| `gcTime` | 5min | Permite voltar para página sem refetch |
| `refetchOnWindowFocus` | true | Sincroniza ao voltar para app |
| `refetchOnMount` | always | Garante dados atuais |

**Para Dados Realtime (Opcional):**

```typescript
// Adicionar subscription Supabase para updates automáticos
useEffect(() => {
  const subscription = supabaseClient
    .channel('auctions-changes')
    .on('postgres_changes', 
      { 
        event: '*', 
        schema: 'public', 
        table: 'auctions' 
      }, 
      () => {
        queryClient.invalidateQueries({ queryKey: AUCTIONS_KEY });
      }
    )
    .subscribe();

  return () => {
    subscription.unsubscribe();
  };
}, [queryClient]);
```

**Checklist:**
- [ ] Ajustar staleTime e gcTime
- [ ] Testar navegação entre páginas
- [ ] Verificar redução de requests (Network tab)
- [ ] (Opcional) Adicionar realtime subscription

---

### 3. Adicionar Error Boundaries

**Problema:** Erros não tratados podem quebrar a aplicação  
**Arquivos:** `src/App.tsx`, `src/main.tsx`  
**Impacto:** Melhora UX e estabilidade  
**Esforço:** Baixo (1-2 horas)

**Implementação:**

```typescript
// components/ErrorBoundary.tsx
import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "./ui/button";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught error:", error, errorInfo);
    
    // Opcional: Enviar para serviço de monitoramento (Sentry, etc)
    // logErrorToService(error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center min-h-screen p-4">
          <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
            <div className="flex items-center gap-3 mb-4">
              <AlertCircle className="w-8 h-8 text-red-500" />
              <h2 className="text-xl font-bold">Algo deu errado</h2>
            </div>
            
            <p className="text-gray-600 dark:text-gray-300 mb-4">
              Ocorreu um erro inesperado. Por favor, tente novamente.
            </p>
            
            {import.meta.env.DEV && this.state.error && (
              <pre className="bg-gray-100 dark:bg-gray-900 p-3 rounded text-xs overflow-auto mb-4">
                {this.state.error.toString()}
              </pre>
            )}
            
            <div className="flex gap-2">
              <Button onClick={this.handleReset} className="flex-1">
                Tentar Novamente
              </Button>
              <Button 
                variant="outline" 
                onClick={() => window.location.href = '/'}
                className="flex-1"
              >
                Ir para Início
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
```

**Uso no App:**

```typescript
// main.tsx
import { ErrorBoundary } from "./components/ErrorBoundary";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>
);
```

**Error Boundaries em Seções Específicas:**

```typescript
// App.tsx
<Routes>
  <Route path="/leiloes" element={
    <ErrorBoundary fallback={<LeiloesErrorFallback />}>
      <Leiloes />
    </ErrorBoundary>
  } />
  
  <Route path="/dashboard" element={
    <ErrorBoundary>
      <Dashboard />
    </ErrorBoundary>
  } />
</Routes>
```

**Checklist:**
- [ ] Criar componente ErrorBoundary
- [ ] Adicionar no nível raiz (main.tsx)
- [ ] Adicionar em rotas críticas
- [ ] Testar com erro forçado
- [ ] (Opcional) Integrar com Sentry

---

## 🟡 PRIORIDADE MÉDIA (Implementar em 2-4 semanas)

### 4. Refatorar Hook Grande (1520 linhas)

**Problema:** `use-supabase-auctions.ts` muito grande  
**Impacto:** Manutenibilidade e testes  
**Esforço:** Alto (2-3 dias)

**Estratégia de Refatoração:**

```typescript
// hooks/auctions/use-auctions-query.ts
export function useAuctionsQuery(options?: QueryOptions) {
  return useQuery({
    queryKey: AUCTIONS_KEY,
    queryFn: async () => {
      // Query logic
    },
    ...options
  });
}

// hooks/auctions/use-auction-mutations.ts
export function useAuctionMutations() {
  const queryClient = useQueryClient();
  
  const createMutation = useMutation({
    mutationFn: async (data: AuctionInsert) => {
      // Create logic
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: AUCTIONS_KEY });
    }
  });
  
  const updateMutation = useMutation({
    // Update logic
  });
  
  const deleteMutation = useMutation({
    // Delete logic
  });
  
  return { createMutation, updateMutation, deleteMutation };
}

// hooks/auctions/use-bidders.ts
export function useBidders(auctionId: string) {
  // Bidder operations
}

// hooks/auctions/use-documents.ts
export function useAuctionDocuments(auctionId: string) {
  // Document upload logic
}

// hooks/auctions/index.ts (Façade Pattern)
export function useSupabaseAuctions() {
  const query = useAuctionsQuery();
  const mutations = useAuctionMutations();
  const bidders = useBidders();
  const documents = useAuctionDocuments();
  
  return {
    ...query,
    ...mutations,
    bidders,
    documents
  };
}
```

**Benefícios:**
- ✅ Cada hook com responsabilidade única
- ✅ Facilita testes unitários
- ✅ Permite reutilização
- ✅ Melhora legibilidade

**Checklist:**
- [ ] Criar estrutura de pastas `hooks/auctions/`
- [ ] Extrair queries para arquivo separado
- [ ] Extrair mutations para arquivo separado
- [ ] Extrair lógica de bidders
- [ ] Extrair lógica de documentos
- [ ] Criar façade (index.ts)
- [ ] Atualizar imports nos componentes
- [ ] Testar todas as funcionalidades

---

### 5. Substituir `any` por Tipos Específicos

**Problema:** 35 usos de `any` no código  
**Arquivos:** 11 arquivos  
**Esforço:** Médio (1-2 dias)

**Exemplos de Correção:**

```typescript
// ANTES
const untypedSupabase = supabase as any;
const result = await untypedSupabase.rpc('verify_password', {
  user_email: email,
  user_password: password
});

// DEPOIS
type VerifyPasswordParams = {
  user_email: string;
  user_password: string;
};

type VerifyPasswordResponse = boolean;

const verifyPassword = async (
  params: VerifyPasswordParams
): Promise<VerifyPasswordResponse> => {
  const { data, error } = await supabase.rpc('verify_password', params);
  if (error) throw error;
  return data as boolean;
};
```

```typescript
// ANTES
function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  // ...
}

// DEPOIS
function debounce<T extends (...args: never[]) => unknown>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  // ... (ou usar unknown ao invés de any)
}
```

**Checklist:**
- [ ] Identificar todos os `any` no código
- [ ] Criar tipos específicos para cada uso
- [ ] Atualizar funções e variáveis
- [ ] Verificar erros do TypeScript
- [ ] Testar compilação

---

### 6. Implementar Code Splitting e Lazy Loading

**Problema:** Bundle único grande  
**Impacto:** Performance de carregamento inicial  
**Esforço:** Médio (1 dia)

**Implementação:**

```typescript
// App.tsx - ANTES
import Dashboard from './pages/Dashboard';
import Leiloes from './pages/Leiloes';
import Lotes from './pages/Lotes';
// ... outros imports

// App.tsx - DEPOIS
import { lazy, Suspense } from 'react';
import { Loader2 } from 'lucide-react';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Leiloes = lazy(() => import('./pages/Leiloes'));
const Lotes = lazy(() => import('./pages/Lotes'));
const Arrematantes = lazy(() => import('./pages/Arrematantes'));
const Relatorios = lazy(() => import('./pages/Relatorios'));
// ... outros lazy imports

// Loading Component
function PageLoading() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
      <span className="ml-2">Carregando...</span>
    </div>
  );
}

// Rotas com Suspense
<Routes>
  <Route path="/dashboard" element={
    <Suspense fallback={<PageLoading />}>
      <Dashboard />
    </Suspense>
  } />
  
  <Route path="/leiloes" element={
    <Suspense fallback={<PageLoading />}>
      <Leiloes />
    </Suspense>
  } />
  
  {/* ... outras rotas */}
</Routes>
```

**Análise de Bundle:**

```bash
# Instalar plugin
npm install --save-dev rollup-plugin-visualizer

# vite.config.ts
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig({
  plugins: [
    react(),
    visualizer({
      filename: './dist/stats.html',
      open: true,
      gzipSize: true,
      brotliSize: true,
    })
  ]
});

# Build e analisar
npm run build
# Abre stats.html automaticamente
```

**Checklist:**
- [ ] Converter imports para lazy
- [ ] Adicionar Suspense nas rotas
- [ ] Criar componente de loading
- [ ] Analisar bundle com visualizer
- [ ] Verificar chunks gerados
- [ ] Testar performance (Lighthouse)

---

## 🟢 PRIORIDADE BAIXA (Melhorias Futuras)

### 7. Adicionar Testes Automatizados

**Impacto:** Qualidade e confiança no código  
**Esforço:** Alto (1-2 semanas)

**Estrutura Sugerida:**

```bash
src/
  ├── __tests__/
  │   ├── unit/
  │   │   ├── hooks/
  │   │   │   ├── use-auth.test.ts
  │   │   │   └── use-auctions-query.test.ts
  │   │   └── lib/
  │   │       ├── secure-utils.test.ts
  │   │       └── file-validation.test.ts
  │   ├── integration/
  │   │   └── auction-flow.test.tsx
  │   └── e2e/
  │       └── complete-auction.spec.ts
```

**Setup Vitest:**

```bash
npm install --save-dev vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
  },
});
```

**Exemplo de Teste:**

```typescript
// __tests__/unit/lib/secure-utils.test.ts
import { describe, it, expect } from 'vitest';
import { sanitizeString, isValidEmail, generateSecureId } from '@/lib/secure-utils';

describe('sanitizeString', () => {
  it('deve remover tags HTML', () => {
    expect(sanitizeString('<script>alert("xss")</script>'))
      .toBe('scriptalert("xss")/script');
  });
  
  it('deve remover javascript:', () => {
    expect(sanitizeString('javascript:alert(1)'))
      .toBe('alert(1)');
  });
});

describe('isValidEmail', () => {
  it('deve validar email correto', () => {
    expect(isValidEmail('teste@exemplo.com')).toBe(true);
  });
  
  it('deve rejeitar email inválido', () => {
    expect(isValidEmail('invalid')).toBe(false);
  });
});
```

**Checklist:**
- [ ] Configurar Vitest
- [ ] Escrever testes para `secure-utils`
- [ ] Escrever testes para `file-validation`
- [ ] Testar hooks críticos
- [ ] Configurar CI/CD para rodar testes
- [ ] Adicionar badge de cobertura

---

### 8. Logging Condicional para Produção

**Problema:** console.log em produção  
**Esforço:** Baixo (2 horas)

**Implementação:**

```typescript
// lib/logger.ts
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

class Logger {
  private isDev = import.meta.env.DEV;
  
  private log(level: LogLevel, message: string, ...args: unknown[]) {
    if (!this.isDev && level === 'debug') return;
    
    const emoji = {
      debug: '🐛',
      info: 'ℹ️',
      warn: '⚠️',
      error: '❌'
    };
    
    console[level === 'debug' ? 'log' : level](
      `${emoji[level]} ${message}`,
      ...args
    );
  }
  
  debug(message: string, ...args: unknown[]) {
    this.log('debug', message, ...args);
  }
  
  info(message: string, ...args: unknown[]) {
    this.log('info', message, ...args);
  }
  
  warn(message: string, ...args: unknown[]) {
    this.log('warn', message, ...args);
  }
  
  error(message: string, ...args: unknown[]) {
    this.log('error', message, ...args);
  }
}

export const logger = new Logger();
```

**Uso:**

```typescript
// ANTES
console.log('🔍 Buscando usuário:', email);

// DEPOIS
import { logger } from '@/lib/logger';
logger.debug('Buscando usuário:', email);
```

**Checklist:**
- [ ] Criar classe Logger
- [ ] Substituir console.log por logger.debug
- [ ] Manter console.error para erros críticos
- [ ] Testar em dev e prod

---

## 📊 CRONOGRAMA SUGERIDO

### Semana 1-2
- ✅ Paginação nas queries
- ✅ Ajustar React Query cache
- ✅ Error Boundaries

### Semana 3-4
- ✅ Refatorar hook grande
- ✅ Substituir `any` por tipos

### Semana 5-6
- ✅ Code splitting
- ✅ Logging condicional

### Mês 2-3 (Opcional)
- ✅ Testes automatizados
- ✅ Monitoramento (Sentry)
- ✅ Otimizações de bundle

---

## 🎯 MÉTRICAS DE SUCESSO

| Métrica | Antes | Meta | Como Medir |
|---------|-------|------|------------|
| Tempo de carregamento inicial | ? | <3s | Lighthouse |
| Tamanho do bundle | ? | <500KB gzipped | Build analysis |
| Requests desnecessários | Alto | -50% | Network tab |
| Cobertura de testes | 0% | >70% | Vitest coverage |
| Erros em produção | ? | -80% | Error tracking |

---

## 📝 NOTAS FINAIS

1. **Priorize performance:** Paginação e cache têm impacto imediato
2. **Refatoração incremental:** Hook grande pode ser feito aos poucos
3. **Testes são investimento:** Valem a pena no longo prazo
4. **Monitore produção:** Adicionar Sentry/LogRocket quando possível

**Boa sorte com as implementações! 🚀**
