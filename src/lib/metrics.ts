/**
 * Sistema de Métricas e Performance Monitoring
 * 
 * Coleta métricas detalhadas sobre:
 * - Performance de queries
 * - Tempo de renderização de componentes
 * - Erros e exceções
 * - Ações do usuário
 * - Estado da aplicação
 */

import { logger } from './logger';

interface PerformanceMetric {
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  metadata?: Record<string, unknown>;
}

interface ErrorMetric {
  error: Error;
  context: string;
  componentStack?: string;
  timestamp: number;
  userAction?: string;
  metadata?: Record<string, unknown>;
}

interface QueryMetric {
  table: string;
  operation: 'select' | 'insert' | 'update' | 'delete';
  duration: number;
  rowCount?: number;
  filters?: Record<string, unknown>;
  timestamp: number;
}

class MetricsCollector {
  private performances: Map<string, PerformanceMetric> = new Map();
  private errors: ErrorMetric[] = [];
  private queries: QueryMetric[] = [];
  private userActions: Array<{ action: string; timestamp: number; metadata?: Record<string, unknown> }> = [];

  // Performance Tracking
  startPerformance(name: string, metadata?: Record<string, unknown>): void {
    const metric: PerformanceMetric = {
      name,
      startTime: performance.now(),
      metadata
    };
    this.performances.set(name, metric);
    
    logger.debug(`📊 [METRICS] Performance Start: ${name}`, metadata);
  }

  endPerformance(name: string): number | null {
    const metric = this.performances.get(name);
    if (!metric) {
      logger.warn(`⚠️ [METRICS] No performance metric found for: ${name}`);
      return null;
    }

    metric.endTime = performance.now();
    metric.duration = metric.endTime - metric.startTime;

    const color = metric.duration > 1000 ? '🔴' : metric.duration > 500 ? '🟡' : '🟢';
    logger.info(`${color} [METRICS] Performance End: ${name}`, {
      duration: `${metric.duration.toFixed(2)}ms`,
      ...metric.metadata
    });

    // Limpar após 5 minutos
    setTimeout(() => this.performances.delete(name), 5 * 60 * 1000);

    return metric.duration;
  }

  // Error Tracking
  trackError(error: Error, context: string, metadata?: Record<string, unknown>): void {
    const errorMetric: ErrorMetric = {
      error,
      context,
      timestamp: Date.now(),
      metadata
    };

    this.errors.push(errorMetric);

    logger.error(`❌ [METRICS] Error Tracked`, {
      context,
      message: error.message,
      stack: error.stack,
      ...metadata
    });

    // Manter apenas últimos 100 erros
    if (this.errors.length > 100) {
      this.errors.shift();
    }
  }

  // Query Tracking
  trackQuery(metric: Omit<QueryMetric, 'timestamp'>): void {
    const queryMetric: QueryMetric = {
      ...metric,
      timestamp: Date.now()
    };

    this.queries.push(queryMetric);

    const color = metric.duration > 1000 ? '🔴' : metric.duration > 500 ? '🟡' : '🟢';
    logger.debug(`${color} [METRICS] Query: ${metric.operation.toUpperCase()} ${metric.table}`, {
      duration: `${metric.duration.toFixed(2)}ms`,
      rowCount: metric.rowCount,
      filters: metric.filters
    });

    // Manter apenas últimas 50 queries
    if (this.queries.length > 50) {
      this.queries.shift();
    }
  }

  // User Action Tracking
  trackUserAction(action: string, metadata?: Record<string, unknown>): void {
    const actionMetric = {
      action,
      timestamp: Date.now(),
      metadata
    };

    this.userActions.push(actionMetric);

    logger.info(`👤 [METRICS] User Action: ${action}`, metadata);

    // Manter apenas últimas 50 ações
    if (this.userActions.length > 50) {
      this.userActions.shift();
    }
  }

  // Component Render Tracking
  trackRender(componentName: string, props?: Record<string, unknown>): void {
    logger.debug(`🎨 [METRICS] Component Render: ${componentName}`, {
      props: this.sanitizeProps(props)
    });
  }

  // Sanitize props para logging (remover funções e valores sensíveis)
  private sanitizeProps(props?: Record<string, unknown>): Record<string, unknown> | undefined {
    if (!props) return undefined;

    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(props)) {
      if (typeof value === 'function') {
        sanitized[key] = '[Function]';
      } else if (key.toLowerCase().includes('password') || key.toLowerCase().includes('token')) {
        sanitized[key] = '[REDACTED]';
      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        sanitized[key] = '[Object]';
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  // Get Summaries
  getPerformanceSummary(): Record<string, unknown> {
    const active: Record<string, number> = {};
    const completed: Record<string, number> = {};

    this.performances.forEach((metric, name) => {
      if (metric.duration !== undefined) {
        completed[name] = metric.duration;
      } else {
        active[name] = performance.now() - metric.startTime;
      }
    });

    return { active, completed };
  }

  getErrorSummary(): { total: number; recent: ErrorMetric[] } {
    return {
      total: this.errors.length,
      recent: this.errors.slice(-10)
    };
  }

  getQuerySummary(): {
    total: number;
    byTable: Record<string, number>;
    avgDuration: number;
    slowQueries: QueryMetric[];
  } {
    const byTable: Record<string, number> = {};
    let totalDuration = 0;

    this.queries.forEach(q => {
      byTable[q.table] = (byTable[q.table] || 0) + 1;
      totalDuration += q.duration;
    });

    const slowQueries = this.queries
      .filter(q => q.duration > 500)
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 10);

    return {
      total: this.queries.length,
      byTable,
      avgDuration: this.queries.length > 0 ? totalDuration / this.queries.length : 0,
      slowQueries
    };
  }

  getUserActionSummary(): { total: number; recent: typeof this.userActions } {
    return {
      total: this.userActions.length,
      recent: this.userActions.slice(-10)
    };
  }

  // Dump all metrics to console (only if there's data)
  dumpMetrics(): void {
    const perfSummary = this.getPerformanceSummary();
    const errorSummary = this.getErrorSummary();
    const querySummary = this.getQuerySummary();
    const actionSummary = this.getUserActionSummary();
    
    const hasData = 
      Object.keys(perfSummary.active).length > 0 ||
      Object.keys(perfSummary.completed).length > 0 ||
      errorSummary.total > 0 ||
      querySummary.total > 0 ||
      actionSummary.total > 0;
    
    if (!hasData) {
      console.log('📊 Nenhuma métrica coletada ainda. Use o sistema normalmente e tente novamente.');
      return;
    }
    
    console.group('📊 METRICS DUMP');
    
    if (Object.keys(perfSummary.active).length > 0 || Object.keys(perfSummary.completed).length > 0) {
      console.log('⏱️ Performance:', perfSummary);
    }
    
    if (errorSummary.total > 0) {
      console.log('❌ Errors:', errorSummary);
    }
    
    if (querySummary.total > 0) {
      console.log('🗃️ Queries:', querySummary);
    }
    
    if (actionSummary.total > 0) {
      console.log('👤 User Actions:', actionSummary);
    }
    
    console.groupEnd();
  }

  // Clear all metrics
  clear(): void {
    this.performances.clear();
    this.errors = [];
    this.queries = [];
    this.userActions = [];
    logger.info('🧹 [METRICS] All metrics cleared');
  }
}

// Singleton instance
export const metrics = new MetricsCollector();

// Helper functions
export const withPerformance = async <T>(
  name: string,
  fn: () => Promise<T>,
  metadata?: Record<string, unknown>
): Promise<T> => {
  metrics.startPerformance(name, metadata);
  try {
    const result = await fn();
    metrics.endPerformance(name);
    return result;
  } catch (error) {
    metrics.endPerformance(name);
    metrics.trackError(error as Error, name, metadata);
    throw error;
  }
};

export const withQuery = async <T>(
  table: string,
  operation: QueryMetric['operation'],
  fn: () => Promise<T>,
  filters?: Record<string, unknown>
): Promise<T> => {
  const startTime = performance.now();
  try {
    const result = await fn();
    const duration = performance.now() - startTime;
    
    metrics.trackQuery({
      table,
      operation,
      duration,
      rowCount: Array.isArray(result) ? result.length : undefined,
      filters
    });
    
    return result;
  } catch (error) {
    const duration = performance.now() - startTime;
    metrics.trackQuery({
      table,
      operation,
      duration,
      filters
    });
    metrics.trackError(error as Error, `Query ${operation} on ${table}`, { filters });
    throw error;
  }
};
