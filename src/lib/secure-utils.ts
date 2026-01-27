// 🔒 SEGURANÇA: Utilitários seguros para operações comuns

/**
 * 🔒 Gera ID único criptograficamente seguro
 * Substitui Math.random() que não é seguro para IDs
 */
export function generateSecureId(prefix: string = ''): string {
  // Usar crypto.randomUUID() (mais seguro que Math.random)
  const uuid = crypto.randomUUID();
  return prefix ? `${prefix}_${uuid}` : uuid;
}

/**
 * 🔒 Parse seguro de JSON com fallback
 * Evita crashes por JSON inválido
 */
export function safeJsonParse<T>(jsonString: string, fallback: T): T {
  try {
    const parsed = JSON.parse(jsonString);
    return parsed as T;
  } catch (error) {
    console.error('Erro ao fazer parse de JSON:', error);
    return fallback;
  }
}

/**
 * 🔒 Validação de email segura
 * Previne injeções e formatos inválidos
 */
export function isValidEmail(email: string): boolean {
  // Regex robusto para email
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  
  if (!email || email.length > 320) return false; // Limite RFC
  if (!emailRegex.test(email)) return false;
  
  // Verificações adicionais
  const parts = email.split('@');
  if (parts.length !== 2) return false;
  
  const [local, domain] = parts;
  if (local.length > 64) return false; // Limite RFC para parte local
  if (domain.length > 255) return false; // Limite RFC para domínio
  
  return true;
}

/**
 * 🔒 Sanitização de string para prevenir XSS
 * Remove caracteres perigosos
 */
export function sanitizeString(input: string): string {
  if (!input) return '';
  
  return input
    .replace(/[<>]/g, '') // Remove < e >
    .replace(/javascript:/gi, '') // Remove javascript:
    .replace(/on\w+=/gi, '') // Remove event handlers (onclick=, onerror=, etc)
    .trim();
}

/**
 * 🔒 Escape HTML para prevenir XSS
 * Converte caracteres especiais em entidades HTML
 * Uso: para inserir dados em innerHTML de forma segura
 */
export function escapeHtml(text: string | undefined | null): string {
  if (!text) return '';
  
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * 🔒 Escape HTML alternativo (sem usar DOM)
 * Útil para ambientes sem DOM ou para maior performance
 */
export function escapeHtmlFast(text: string | undefined | null): string {
  if (!text) return '';
  
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
}

/**
 * 🔒 Validação de URL segura
 * Previne javascript:, data: e outros protocolos perigosos
 */
export function isSecureUrl(url: string): boolean {
  if (!url) return false;
  
  try {
    const parsed = new URL(url);
    
    // Apenas permitir protocolos seguros
    const allowedProtocols = ['http:', 'https:', 'blob:'];
    if (!allowedProtocols.includes(parsed.protocol)) {
      return false;
    }
    
    // Bloquear URLs suspeitas
    const suspicious = ['javascript:', 'data:text/html', 'vbscript:', 'file:'];
    for (const sus of suspicious) {
      if (url.toLowerCase().includes(sus)) {
        return false;
      }
    }
    
    return true;
  } catch {
    // Se não é URL válida, verificar se é data: image (permitido para imagens)
    return url.startsWith('data:image/');
  }
}

/**
 * 🔒 Fetch com timeout automático
 * Previne requisições travadas
 */
export async function fetchWithTimeout(
  url: string, 
  options: RequestInit = {}, 
  timeoutMs: number = 30000
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Requisição excedeu o tempo limite de ${timeoutMs}ms`);
    }
    throw error;
  }
}

/**
 * 🔒 Abre URL de forma segura em nova janela
 * Valida URL antes de abrir
 */
export function safeWindowOpen(url: string, target: string = '_blank'): Window | null {
  // Validar URL
  if (!isSecureUrl(url)) {
    console.error('URL não segura bloqueada:', url);
    throw new Error('URL não é segura e foi bloqueada');
  }
  
  // Abrir com configurações seguras
  const newWindow = window.open(url, target);
  
  // Prevenir tabnabbing
  if (newWindow) {
    newWindow.opener = null;
  }
  
  return newWindow;
}

/**
 * 🔒 Valida CPF (apenas formato, não dígito verificador)
 */
export function isValidCPFFormat(cpf: string): boolean {
  if (!cpf) return false;
  
  // Remover caracteres não numéricos
  const numbersOnly = cpf.replace(/\D/g, '');
  
  // CPF deve ter 11 dígitos
  if (numbersOnly.length !== 11) return false;
  
  // CPFs inválidos conhecidos (todos dígitos iguais)
  const invalidCPFs = [
    '00000000000', '11111111111', '22222222222', '33333333333',
    '44444444444', '55555555555', '66666666666', '77777777777',
    '88888888888', '99999999999'
  ];
  
  if (invalidCPFs.includes(numbersOnly)) return false;
  
  return true;
}

/**
 * 🔒 Valida CNPJ (apenas formato, não dígito verificador)
 */
export function isValidCNPJFormat(cnpj: string): boolean {
  if (!cnpj) return false;
  
  // Remover caracteres não numéricos
  const numbersOnly = cnpj.replace(/\D/g, '');
  
  // CNPJ deve ter 14 dígitos
  if (numbersOnly.length !== 14) return false;
  
  // CNPJs inválidos conhecidos
  const invalidCNPJs = [
    '00000000000000', '11111111111111', '22222222222222',
    '33333333333333', '44444444444444', '55555555555555',
    '66666666666666', '77777777777777', '88888888888888',
    '99999999999999'
  ];
  
  if (invalidCNPJs.includes(numbersOnly)) return false;
  
  return true;
}

/**
 * 🔒 Limita tamanho de string para prevenir DoS
 */
export function limitString(str: string, maxLength: number = 1000): string {
  if (!str) return '';
  return str.slice(0, maxLength);
}

/**
 * 🔒 Sanitiza nome de arquivo
 * Remove caracteres perigosos de nomes de arquivo
 */
export function sanitizeFilename(filename: string): string {
  if (!filename) return 'arquivo';
  
  return filename
    .replace(/[^a-zA-Z0-9\-_\.]/g, '_') // Apenas alfanuméricos, hífens, underscores e pontos
    .replace(/\.{2,}/g, '.') // Remove múltiplos pontos consecutivos
    .replace(/^\.+/, '') // Remove pontos do início
    .slice(0, 255); // Limite de sistema de arquivos
}

/**
 * 🔒 Debounce seguro
 * Útil para limitar rate de chamadas
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  waitMs: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  
  return function(this: any, ...args: Parameters<T>) {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
    
    timeoutId = setTimeout(() => {
      func.apply(this, args);
    }, waitMs);
  };
}

/**
 * 🔒 Rate limiter simples
 * Previne spam de ações
 */
export class RateLimiter {
  private attempts: Map<string, { count: number; resetAt: number }> = new Map();
  
  constructor(
    private maxAttempts: number = 5,
    private windowMs: number = 60000 // 1 minuto
  ) {}
  
  check(key: string): boolean {
    const now = Date.now();
    const record = this.attempts.get(key);
    
    // Se não existe ou janela expirou, resetar
    if (!record || now > record.resetAt) {
      this.attempts.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    
    // Se excedeu limite, bloquear
    if (record.count >= this.maxAttempts) {
      return false;
    }
    
    // Incrementar tentativas
    record.count++;
    return true;
  }
  
  reset(key: string): void {
    this.attempts.delete(key);
  }
  
  getRemainingTime(key: string): number {
    const record = this.attempts.get(key);
    if (!record) return 0;
    
    const remaining = record.resetAt - Date.now();
    return Math.max(0, remaining);
  }
}
