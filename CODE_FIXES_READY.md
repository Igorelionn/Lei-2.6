# 💻 CÓDIGO PRONTO PARA IMPLEMENTAÇÃO
## Correções Copy-Paste

Este arquivo contém código pronto para copiar e colar nas correções mais importantes.

---

## 1. 📄 PAGINAÇÃO - Hook Completo

**Arquivo:** `src/hooks/use-auctions-pagination.ts` (NOVO)

```typescript
import { useState } from 'react';
import { useQuery, UseQueryResult } from '@tanstack/react-query';
import { supabaseClient } from '@/lib/supabase-client';
import { Auction } from '@/lib/types';

interface PaginationResult {
  auctions: Auction[];
  currentPage: number;
  totalPages: number;
  totalCount: number;
  isLoading: boolean;
  error: Error | null;
  nextPage: () => void;
  prevPage: () => void;
  goToPage: (page: number) => void;
}

interface UsePaginatedAuctionsOptions {
  pageSize?: number;
  filters?: {
    status?: string;
    archived?: boolean;
  };
}

export function usePaginatedAuctions(
  options: UsePaginatedAuctionsOptions = {}
): PaginationResult {
  const { pageSize = 50, filters } = options;
  const [page, setPage] = useState(1);

  const queryResult: UseQueryResult<{
    auctions: Auction[];
    totalCount: number;
  }> = useQuery({
    queryKey: ['auctions-paginated', page, pageSize, filters],
    staleTime: 30000, // 30 segundos
    gcTime: 5 * 60 * 1000, // 5 minutos
    queryFn: async () => {
      const offset = (page - 1) * pageSize;

      // Construir query
      let query = supabaseClient
        .from('auctions')
        .select(
          `
          id,
          nome,
          identificacao,
          local,
          endereco,
          data_inicio,
          data_encerramento,
          status,
          custos_texto,
          custos_numerico,
          arquivado,
          created_at
        `,
          { count: 'exact' }
        )
        .range(offset, offset + pageSize - 1)
        .order('created_at', { ascending: false });

      // Aplicar filtros
      if (filters?.status) {
        query = query.eq('status', filters.status);
      }
      if (filters?.archived !== undefined) {
        query = query.eq('arquivado', filters.archived);
      }

      const { data, error, count } = await query;

      if (error) throw error;

      return {
        auctions: data as Auction[],
        totalCount: count || 0,
      };
    },
  });

  const { data, isLoading, error } = queryResult;

  const totalPages = data ? Math.ceil(data.totalCount / pageSize) : 1;

  return {
    auctions: data?.auctions || [],
    currentPage: page,
    totalPages,
    totalCount: data?.totalCount || 0,
    isLoading,
    error: error as Error | null,
    nextPage: () => setPage((p) => Math.min(p + 1, totalPages)),
    prevPage: () => setPage((p) => Math.max(p - 1, 1)),
    goToPage: (newPage: number) => setPage(Math.max(1, Math.min(newPage, totalPages))),
  };
}
```

---

## 2. 🎨 COMPONENTE DE PAGINAÇÃO

**Arquivo:** `src/components/Pagination.tsx` (NOVO)

```typescript
import { Button } from "./ui/button";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  onPageChange: (page: number) => void;
  itemsPerPage?: number;
}

export function Pagination({
  currentPage,
  totalPages,
  totalCount,
  onPageChange,
  itemsPerPage = 50,
}: PaginationProps) {
  const startItem = (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalCount);

  // Calcular páginas para mostrar
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisible = 5;

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      if (currentPage <= 3) {
        pages.push(1, 2, 3, 4, '...', totalPages);
      } else if (currentPage >= totalPages - 2) {
        pages.push(1, '...', totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
      } else {
        pages.push(1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages);
      }
    }

    return pages;
  };

  return (
    <div className="flex items-center justify-between px-4 py-3 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 sm:px-6">
      <div className="flex items-center justify-between w-full">
        <div className="flex items-center gap-2">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Mostrando{' '}
            <span className="font-medium">{startItem}</span>
            {' até '}
            <span className="font-medium">{endItem}</span>
            {' de '}
            <span className="font-medium">{totalCount}</span>
            {' resultados'}
          </p>
        </div>

        <div className="flex items-center gap-1">
          {/* Primeira página */}
          <Button
            variant="outline"
            size="icon"
            onClick={() => onPageChange(1)}
            disabled={currentPage === 1}
            className="h-8 w-8"
          >
            <ChevronsLeft className="h-4 w-4" />
          </Button>

          {/* Página anterior */}
          <Button
            variant="outline"
            size="icon"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className="h-8 w-8"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>

          {/* Números das páginas */}
          {getPageNumbers().map((page, index) =>
            typeof page === 'number' ? (
              <Button
                key={index}
                variant={currentPage === page ? 'default' : 'outline'}
                onClick={() => onPageChange(page)}
                className="h-8 w-8"
              >
                {page}
              </Button>
            ) : (
              <span key={index} className="px-2 text-gray-500">
                {page}
              </span>
            )
          )}

          {/* Próxima página */}
          <Button
            variant="outline"
            size="icon"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className="h-8 w-8"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>

          {/* Última página */}
          <Button
            variant="outline"
            size="icon"
            onClick={() => onPageChange(totalPages)}
            disabled={currentPage === totalPages}
            className="h-8 w-8"
          >
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
```

---

## 3. 📄 USO NO COMPONENTE LEILÕES

**Arquivo:** `src/pages/Leiloes.tsx` (MODIFICAR)

```typescript
// ADICIONAR IMPORTS
import { usePaginatedAuctions } from "@/hooks/use-auctions-pagination";
import { Pagination } from "@/components/Pagination";

// DENTRO DO COMPONENTE
export function Leiloes() {
  // SUBSTITUIR hook antigo por:
  const {
    auctions,
    currentPage,
    totalPages,
    totalCount,
    isLoading,
    error,
    goToPage,
  } = usePaginatedAuctions({
    pageSize: 50,
    filters: {
      archived: false, // Mostrar apenas não arquivados
    },
  });

  // ... resto do código

  return (
    <div>
      {/* ... seu conteúdo atual ... */}
      
      {/* Lista de leilões */}
      {auctions.map(auction => (
        // ... renderizar leilão
      ))}

      {/* ADICIONAR NO FINAL */}
      {totalPages > 1 && (
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalCount={totalCount}
          onPageChange={goToPage}
          itemsPerPage={50}
        />
      )}
    </div>
  );
}
```

---

## 4. 🛡️ ERROR BOUNDARY COMPLETO

**Arquivo:** `src/components/ErrorBoundary.tsx` (NOVO)

```typescript
import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertCircle, Home, RefreshCw } from "lucide-react";
import { Button } from "./ui/button";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error?: Error;
  errorInfo?: ErrorInfo;
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
    console.error("🚨 ErrorBoundary capturou erro:", {
      error,
      componentStack: errorInfo.componentStack,
      timestamp: new Date().toISOString(),
    });

    this.setState({ errorInfo });

    // TODO: Enviar para serviço de monitoramento
    // if (import.meta.env.PROD) {
    //   Sentry.captureException(error, { contexts: { react: errorInfo } });
    // }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
    this.props.onReset?.();
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
          <div className="max-w-lg w-full bg-white dark:bg-gray-800 rounded-xl shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="bg-red-500 dark:bg-red-600 px-6 py-4 flex items-center gap-3">
              <AlertCircle className="w-8 h-8 text-white" />
              <div>
                <h2 className="text-xl font-bold text-white">
                  Algo deu errado
                </h2>
                <p className="text-red-100 text-sm">
                  Ocorreu um erro inesperado na aplicação
                </p>
              </div>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4">
              <p className="text-gray-600 dark:text-gray-300">
                Não se preocupe, seus dados estão seguros. Por favor, tente
                uma das opções abaixo:
              </p>

              {/* Detalhes do erro (apenas em DEV) */}
              {import.meta.env.DEV && this.state.error && (
                <details className="bg-gray-100 dark:bg-gray-900 rounded-lg p-4">
                  <summary className="cursor-pointer font-semibold text-sm text-gray-700 dark:text-gray-300 mb-2">
                    Detalhes técnicos (DEV only)
                  </summary>
                  <div className="space-y-2">
                    <div>
                      <p className="text-xs font-mono text-red-600 dark:text-red-400">
                        {this.state.error.name}: {this.state.error.message}
                      </p>
                    </div>
                    {this.state.error.stack && (
                      <pre className="text-xs overflow-auto p-2 bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700">
                        {this.state.error.stack}
                      </pre>
                    )}
                  </div>
                </details>
              )}

              {/* Ações */}
              <div className="flex gap-3 pt-2">
                <Button
                  onClick={this.handleReset}
                  className="flex-1 gap-2"
                  size="lg"
                >
                  <RefreshCw className="w-4 h-4" />
                  Tentar Novamente
                </Button>
                <Button
                  variant="outline"
                  onClick={this.handleGoHome}
                  className="flex-1 gap-2"
                  size="lg"
                >
                  <Home className="w-4 h-4" />
                  Ir para Início
                </Button>
              </div>

              {/* Dica */}
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                <p className="text-xs text-blue-800 dark:text-blue-200">
                  <strong>💡 Dica:</strong> Se o problema persistir, tente limpar
                  o cache do navegador ou entre em contato com o suporte.
                </p>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
```

---

## 5. 🎯 INTEGRAR ERROR BOUNDARY NO APP

**Arquivo:** `src/main.tsx` (MODIFICAR)

```typescript
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "./hooks/use-auth";
import { ErrorBoundary } from "./components/ErrorBoundary"; // ADICIONAR
import App from "./App";
import "./index.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000, // ✅ AJUSTADO: 30 segundos
      gcTime: 5 * 60 * 1000, // ✅ AJUSTADO: 5 minutos
      refetchOnWindowFocus: true,
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary> {/* ✅ ADICIONAR */}
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary> {/* ✅ ADICIONAR */}
  </StrictMode>
);
```

---

## 6. 📊 LOGGER PERSONALIZADO

**Arquivo:** `src/lib/logger.ts` (NOVO)

```typescript
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogData {
  message: string;
  level: LogLevel;
  timestamp: string;
  data?: unknown;
}

class Logger {
  private isDev = import.meta.env.DEV;
  private logs: LogData[] = [];
  private maxLogs = 100;

  private formatMessage(level: LogLevel, message: string, data?: unknown): void {
    const emoji = {
      debug: '🐛',
      info: 'ℹ️',
      warn: '⚠️',
      error: '❌',
    };

    const timestamp = new Date().toISOString();
    const logData: LogData = { message, level, timestamp, data };
    
    // Armazenar log
    this.logs.push(logData);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // Logs de debug apenas em DEV
    if (level === 'debug' && !this.isDev) return;

    // Console
    const consoleMethod = level === 'debug' ? 'log' : level;
    const prefix = `${emoji[level]} [${timestamp}]`;
    
    if (data !== undefined) {
      console[consoleMethod](prefix, message, data);
    } else {
      console[consoleMethod](prefix, message);
    }
  }

  debug(message: string, data?: unknown) {
    this.formatMessage('debug', message, data);
  }

  info(message: string, data?: unknown) {
    this.formatMessage('info', message, data);
  }

  warn(message: string, data?: unknown) {
    this.formatMessage('warn', message, data);
  }

  error(message: string, data?: unknown) {
    this.formatMessage('error', message, data);
    
    // TODO: Enviar para serviço de monitoramento em produção
    // if (!this.isDev) {
    //   sendToMonitoring({ message, data });
    // }
  }

  // Método para exportar logs (útil para debug)
  exportLogs(): LogData[] {
    return [...this.logs];
  }

  // Limpar logs
  clearLogs(): void {
    this.logs = [];
  }
}

export const logger = new Logger();

// Helper para usar no window (debug)
if (import.meta.env.DEV) {
  (window as any).logger = logger;
}
```

**USO:**

```typescript
// ANTES
console.log('🔍 Buscando usuário:', email);
console.error('Erro ao salvar:', error);

// DEPOIS
import { logger } from '@/lib/logger';

logger.debug('Buscando usuário:', { email });
logger.error('Erro ao salvar:', { error, context: 'save-auction' });
```

---

## 7. ⚡ LAZY LOADING DE ROTAS

**Arquivo:** `src/App.tsx` (MODIFICAR)

```typescript
import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Loader2 } from 'lucide-react';

// ✅ Páginas que precisam carregar imediatamente
import Login from './pages/Login';
import ProtectedRoute from './components/ProtectedRoute';

// ✅ Lazy load para páginas grandes
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Leiloes = lazy(() => import('./pages/Leiloes'));
const Lotes = lazy(() => import('./pages/Lotes'));
const LotesConvidados = lazy(() => import('./pages/LotesConvidados'));
const Arrematantes = lazy(() => import('./pages/Arrematantes'));
const Patrocinadores = lazy(() => import('./pages/Patrocinadores'));
const Faturas = lazy(() => import('./pages/Faturas'));
const Inadimplencia = lazy(() => import('./pages/Inadimplencia'));
const Relatorios = lazy(() => import('./pages/Relatorios'));
const Historico = lazy(() => import('./pages/Historico'));
const Configuracoes = lazy(() => import('./pages/Configuracoes'));
const Email = lazy(() => import('./pages/Email'));

// Componente de loading
function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Carregando...
        </p>
      </div>
    </div>
  );
}

// Wrapper para Suspense
function SuspenseRoute({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<PageLoader />}>{children}</Suspense>;
}

export default function App() {
  return (
    <Routes>
      {/* Login sem lazy (precisa ser rápido) */}
      <Route path="/login" element={<Login />} />

      {/* Rotas protegidas com lazy loading */}
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <SuspenseRoute>
              <Dashboard />
            </SuspenseRoute>
          </ProtectedRoute>
        }
      />

      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <SuspenseRoute>
              <Dashboard />
            </SuspenseRoute>
          </ProtectedRoute>
        }
      />

      <Route
        path="/leiloes"
        element={
          <ProtectedRoute>
            <SuspenseRoute>
              <Leiloes />
            </SuspenseRoute>
          </ProtectedRoute>
        }
      />

      {/* ... repetir para outras rotas ... */}
    </Routes>
  );
}
```

---

## 8. 📦 ANALISAR BUNDLE SIZE

**Arquivo:** `vite.config.ts` (MODIFICAR)

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';
import { visualizer } from 'rollup-plugin-visualizer'; // npm install --save-dev rollup-plugin-visualizer

export default defineConfig({
  plugins: [
    react(),
    
    // ✅ ADICIONAR: Analisador de bundle
    visualizer({
      filename: './dist/stats.html',
      open: true, // Abre automaticamente após build
      gzipSize: true,
      brotliSize: true,
      template: 'treemap', // ou 'sunburst', 'network'
    }),
  ],
  
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  
  // ✅ Otimizações
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // Separar vendor chunks
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'ui-vendor': ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu'],
          'query-vendor': ['@tanstack/react-query'],
          'supabase-vendor': ['@supabase/supabase-js'],
        },
      },
    },
    // Aumentar limite de warning (se necessário)
    chunkSizeWarningLimit: 1000,
  },
});
```

**Comandos:**

```bash
# Instalar plugin
npm install --save-dev rollup-plugin-visualizer

# Build e analisar
npm run build
# Abre stats.html automaticamente com visualização do bundle
```

---

## ✅ CHECKLIST DE IMPLEMENTAÇÃO

```
FASE 1 (Hoje/Amanhã):
☐ Criar hooks/use-auctions-pagination.ts
☐ Criar components/Pagination.tsx
☐ Atualizar pages/Leiloes.tsx
☐ Criar components/ErrorBoundary.tsx
☐ Atualizar main.tsx com ErrorBoundary
☐ Ajustar QueryClient defaults em main.tsx
☐ Testar tudo funcionando

FASE 2 (Esta Semana):
☐ Criar lib/logger.ts
☐ Substituir console.log por logger
☐ Adicionar lazy loading no App.tsx
☐ Configurar visualizer no vite.config.ts
☐ Rodar build e analisar bundle

FASE 3 (Próximas Semanas):
☐ Refatorar hook grande
☐ Substituir 'any'
☐ Adicionar testes
```

---

## 🎯 RESULTADO ESPERADO

Após implementar estes códigos:

- ✅ Performance 30-50% melhor
- ✅ Menos requisições ao Supabase
- ✅ Melhor UX com paginação
- ✅ Aplicação mais estável com Error Boundaries
- ✅ Bundle menor com lazy loading
- ✅ Logs organizados e úteis

**Tempo Total de Implementação:** 4-6 horas

---

**Boa codificação! 🚀**
