/**
 * 🔍 LOGGER ESTRUTURADO
 * Sistema de logs profissional com níveis e controle de ambiente
 * 
 * Níveis:
 * - debug: Informações detalhadas (apenas DEV)
 * - info: Informações gerais
 * - warn: Avisos
 * - error: Erros
 * 
 * Uso:
 * ```typescript
 * import { logger } from '@/lib/logger';
 * 
 * logger.debug('Processando dados', { count: 10 });
 * logger.info('Usuário autenticado', { userId: '123' });
 * logger.warn('Cache expirado', { key: 'auctions' });
 * logger.error('Falha na requisição', { error });
 * ```
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LoggerConfig {
  enabled: boolean;
  minLevel: LogLevel;
  showTimestamp: boolean;
  showEmoji: boolean;
}

class Logger {
  private config: LoggerConfig;
  private isDev: boolean;

  constructor() {
    this.isDev = import.meta.env.DEV;
    this.config = {
      enabled: true,
      minLevel: this.isDev ? 'debug' : 'warn',
      showTimestamp: true,
      showEmoji: true,
    };
  }

  /**
   * Obter emoji para o nível de log
   */
  private getEmoji(level: LogLevel): string {
    if (!this.config.showEmoji) return '';
    
    const emojis = {
      debug: '🔍',
      info: 'ℹ️',
      warn: '⚠️',
      error: '❌',
    };
    
    return emojis[level] + ' ';
  }

  /**
   * Obter timestamp formatado
   */
  private getTimestamp(): string {
    if (!this.config.showTimestamp) return '';
    
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const ms = String(now.getMilliseconds()).padStart(3, '0');
    
    return `[${hours}:${minutes}:${seconds}.${ms}]`;
  }

  /**
   * Verificar se deve logar esse nível
   */
  private shouldLog(level: LogLevel): boolean {
    if (!this.config.enabled) return false;
    
    const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
    const currentLevelIndex = levels.indexOf(level);
    const minLevelIndex = levels.indexOf(this.config.minLevel);
    
    return currentLevelIndex >= minLevelIndex;
  }

  /**
   * Formatar dados para exibição
   */
  private formatData(data?: unknown): string {
    if (data === undefined) return '';
    
    // Se for um objeto, formatar como JSON
    if (typeof data === 'object' && data !== null) {
      try {
        // Verificar se tem propriedades relevantes
        const hasRelevantProps = Object.keys(data).length > 0;
        if (!hasRelevantProps) return '';
        
        return JSON.stringify(data, null, 2);
      } catch (error) {
        return String(data);
      }
    }
    
    return String(data);
  }

  /**
   * Método genérico de log
   */
  private log(level: LogLevel, message: string, data?: unknown): void {
    if (!this.shouldLog(level)) return;
    
    const emoji = this.getEmoji(level);
    const timestamp = this.getTimestamp();
    const levelTag = `[${level.toUpperCase()}]`;
    const prefix = `${timestamp} ${levelTag} ${emoji}`;
    
    // Formatar dados
    const formattedData = this.formatData(data);
    const hasData = formattedData.length > 0;
    
    // Escolher método de console
    const consoleMethod = level === 'error' ? console.error :
                         level === 'warn' ? console.warn :
                         level === 'info' ? console.info :
                         console.log;
    
    // Log com ou sem dados
    if (hasData) {
      consoleMethod(`${prefix}${message}`, formattedData);
    } else {
      consoleMethod(`${prefix}${message}`);
    }
  }

  /**
   * 🔍 DEBUG - Informações detalhadas (apenas DEV)
   * Usado para debugging e desenvolvimento
   */
  debug(message: string, data?: unknown): void {
    this.log('debug', message, data);
  }

  /**
   * ℹ️ INFO - Informações gerais
   * Usado para logs informativos importantes
   */
  info(message: string, data?: unknown): void {
    this.log('info', message, data);
  }

  /**
   * ⚠️ WARN - Avisos
   * Usado para situações que precisam atenção
   */
  warn(message: string, data?: unknown): void {
    this.log('warn', message, data);
  }

  /**
   * ❌ ERROR - Erros
   * Usado para erros que precisam investigação
   */
  error(message: string, data?: unknown): void {
    this.log('error', message, data);
  }

  /**
   * Configurar o logger
   */
  configure(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Desabilitar todos os logs
   */
  disable(): void {
    this.config.enabled = false;
  }

  /**
   * Habilitar logs
   */
  enable(): void {
    this.config.enabled = true;
  }

  /**
   * Verificar se está em modo DEV
   */
  get isDevMode(): boolean {
    return this.isDev;
  }
}

// Exportar instância singleton
export const logger = new Logger();

// Exportar tipo para uso externo
export type { LogLevel };
