import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * Error Boundary para capturar erros do React e mostrar UI amigável
 * 
 * @example
 * <ErrorBoundary>
 *   <MeuComponente />
 * </ErrorBoundary>
 * 
 * @example Com fallback customizado
 * <ErrorBoundary fallback={<MeuErroCustomizado />}>
 *   <MeuComponente />
 * </ErrorBoundary>
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    // Atualizar state para mostrar UI de fallback
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log do erro
    logger.error('🚨 Error Boundary capturou erro:', error);
    logger.error('📍 Component Stack:', errorInfo.componentStack);

    this.setState({
      errorInfo,
    });

    // Callback customizado
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // Aqui você pode enviar para serviço de monitoramento (Sentry, etc)
    // sendToErrorTracking(error, errorInfo);
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      // Usar fallback customizado se fornecido
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // UI padrão de erro
      return (
        <div className="flex items-center justify-center min-h-screen p-4 bg-background">
          <Card className="max-w-2xl w-full p-8">
            <div className="flex flex-col items-center text-center space-y-6">
              {/* Ícone */}
              <div className="rounded-full bg-destructive/10 p-4">
                <AlertCircle className="h-12 w-12 text-destructive" />
              </div>

              {/* Título */}
              <div className="space-y-2">
                <h1 className="text-2xl font-bold text-foreground">
                  Algo deu errado
                </h1>
                <p className="text-muted-foreground">
                  Ocorreu um erro inesperado ao carregar esta página.
                </p>
              </div>

              {/* Detalhes do Erro (apenas em desenvolvimento) */}
              {import.meta.env.DEV && this.state.error && (
                <div className="w-full">
                  <details className="text-left">
                    <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
                      Detalhes técnicos (clique para expandir)
                    </summary>
                    <div className="mt-4 p-4 bg-muted rounded-md">
                      <p className="text-sm font-mono text-destructive break-all">
                        <strong>Erro:</strong> {this.state.error.toString()}
                      </p>
                      {this.state.errorInfo && (
                        <pre className="mt-2 text-xs overflow-auto max-h-40">
                          {this.state.errorInfo.componentStack}
                        </pre>
                      )}
                    </div>
                  </details>
                </div>
              )}

              {/* Ações */}
              <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                <Button
                  onClick={this.handleReset}
                  variant="default"
                  className="w-full sm:w-auto"
                >
                  Tentar Novamente
                </Button>
                <Button
                  onClick={this.handleReload}
                  variant="outline"
                  className="w-full sm:w-auto"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Recarregar Página
                </Button>
              </div>

              {/* Informações Adicionais */}
              <p className="text-sm text-muted-foreground">
                Se o problema persistir, entre em contato com o suporte.
              </p>
            </div>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Hook para usar Error Boundary de forma funcional
 * Nota: Este é um workaround, pois Error Boundaries devem ser componentes de classe
 */
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  fallback?: ReactNode
) {
  return function WithErrorBoundaryWrapper(props: P) {
    return (
      <ErrorBoundary fallback={fallback}>
        <Component {...props} />
      </ErrorBoundary>
    );
  };
}
