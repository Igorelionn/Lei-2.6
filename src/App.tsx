import { lazy, Suspense, Component, ReactNode } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Layout } from "./components/Layout";
import { useRealtimeSync } from "@/hooks/use-realtime-sync";
import { useAutoEmailNotifications } from "@/hooks/use-auto-email-notifications";
import { usePaymentEmailWatcher } from "@/hooks/use-payment-email-watcher";
import ProtectedRoute from "./components/ProtectedRoute";
import { AuthProvider } from "@/hooks/use-auth";
import { MigrationNotification } from "@/components/MigrationNotification";
import { SpeedInsights } from '@vercel/speed-insights/react';
import { Analytics } from '@vercel/analytics/react';

// Error boundary para componentes de analytics que podem falhar em mobile (ad blockers, etc.)
class SafeAnalytics extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch() {
    // Silenciar erros de analytics - não devem impedir o uso do app
  }
  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

// ⚡ PERFORMANCE: Lazy loading de páginas para reduzir bundle inicial
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Leiloes = lazy(() => import("./pages/Leiloes"));
const Arrematantes = lazy(() => import("./pages/Arrematantes"));
const Lotes = lazy(() => import("./pages/Lotes"));
const LotesConvidados = lazy(() => import("./pages/LotesConvidados"));
const ValoresConvidados = lazy(() => import("./pages/ValoresConvidados"));
const Patrocinadores = lazy(() => import("./pages/Patrocinadores"));
const Faturas = lazy(() => import("./pages/Faturas"));
const Relatorios = lazy(() => import("./pages/Relatorios"));
const Inadimplencia = lazy(() => import("./pages/Inadimplencia"));
const Historico = lazy(() => import("./pages/Historico"));
const Configuracoes = lazy(() => import("./pages/Configuracoes"));
const Email = lazy(() => import("./pages/Email"));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage"));
const Login = lazy(() => import("./pages/Login"));
const MigrationManager = lazy(() => import("@/components/MigrationManager").then(module => ({ default: module.MigrationManager })));

// ⚡ PERFORMANCE: Cache otimizado conforme auditoria
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000, // 30 segundos - balance entre atualização e performance
      gcTime: 5 * 60 * 1000, // 5 minutos - mantém cache mas libera memória
      refetchOnWindowFocus: false, // Evita refetch desnecessários
      retry: 1, // Apenas 1 retry para falhas
    },
  },
});

// Componente wrapper para sincronização em tempo real e emails automáticos
function AppWithRealtime({ children }: { children: React.ReactNode }) {
  useRealtimeSync();
  useAutoEmailNotifications(); // Sistema de envio automático de emails (lembretes e cobranças)
  usePaymentEmailWatcher(); // Sistema de envio de confirmação de pagamento
  return <>{children}</>;
}

// ⚡ PERFORMANCE: Loading fallback component
const LoadingFallback = () => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="flex flex-col items-center gap-2">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      <p className="text-sm text-muted-foreground">Carregando...</p>
    </div>
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <SafeAnalytics>
        <SpeedInsights />
        <Analytics />
      </SafeAnalytics>
      <AuthProvider>
              <AppWithRealtime>
                <MigrationNotification />
                <BrowserRouter future={{
                  v7_startTransition: true,
                  v7_relativeSplatPath: true
                }}>
            <Suspense fallback={<LoadingFallback />}>
              <Routes>
                <Route path="/login" element={<Login />} />

              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <Layout><Dashboard /></Layout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/leiloes"
                element={
                  <ProtectedRoute>
                    <Layout><Leiloes /></Layout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/lotes"
                element={
                  <ProtectedRoute>
                    <Layout><Lotes /></Layout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/lotes-convidados"
                element={
                  <ProtectedRoute>
                    <Layout><LotesConvidados /></Layout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/valores-convidados"
                element={
                  <ProtectedRoute>
                    <Layout><ValoresConvidados /></Layout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/patrocinadores"
                element={
                  <ProtectedRoute>
                    <Layout><Patrocinadores /></Layout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/arrematantes"
                element={
                  <ProtectedRoute>
                    <Layout><Arrematantes /></Layout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/faturas"
                element={
                  <ProtectedRoute>
                    <Layout><Faturas /></Layout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/inadimplencia"
                element={
                  <ProtectedRoute>
                    <Layout><Inadimplencia /></Layout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/historico"
                element={
                  <ProtectedRoute>
                    <Layout><Historico /></Layout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/relatorios"
                element={
                  <ProtectedRoute>
                    <Layout><Relatorios /></Layout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/configuracoes"
                element={
                  <ProtectedRoute>
                    <Layout><Configuracoes /></Layout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/email"
                element={
                  <ProtectedRoute>
                    <Layout><Email /></Layout>
                  </ProtectedRoute>
                }
              />
              <Route
                path="/migracao"
                element={
                  <ProtectedRoute>
                    <Layout><MigrationManager /></Layout>
                  </ProtectedRoute>
                }
              />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
            </Suspense>
          </BrowserRouter>
        </AppWithRealtime>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
