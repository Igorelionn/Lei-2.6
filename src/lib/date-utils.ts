/**
 * 🔒 SEGURANÇA: Utilitários para parsing e validação segura de datas
 * 
 * Centraliza toda a lógica de manipulação de datas para:
 * - Prevenir injection via datas malformadas
 * - Garantir consistência no formato
 * - Validar ranges e inputs
 */

import { format, parse, isValid, parseISO, addMonths, startOfMonth, endOfMonth, differenceInDays, isBefore, isAfter } from 'date-fns';

/**
 * Formatos de data aceitos pelo sistema
 */
export const DATE_FORMATS = {
  ISO: "yyyy-MM-dd",
  DISPLAY: "dd/MM/yyyy",
  DISPLAY_WITH_TIME: "dd/MM/yyyy HH:mm",
  MONTH_YEAR: "MM/yyyy",
  INPUT_DATE: "yyyy-MM-dd",
} as const;

/**
 * 🔒 Parse seguro de string ISO para Date
 * Valida e retorna null se inválida
 */
export function parseISOSafe(dateString: string | null | undefined): Date | null {
  if (!dateString) return null;
  
  try {
    const date = parseISO(dateString);
    return isValid(date) ? date : null;
  } catch {
    return null;
  }
}

/**
 * 🔒 Parse seguro de data no formato brasileiro (dd/MM/yyyy)
 */
export function parseBrazilianDate(dateString: string | null | undefined): Date | null {
  if (!dateString) return null;
  
  try {
    const date = parse(dateString, DATE_FORMATS.DISPLAY, new Date());
    return isValid(date) ? date : null;
  } catch {
    return null;
  }
}

/**
 * 🔒 Formata Date para string ISO com validação
 */
export function formatToISO(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  
  try {
    const dateObj = typeof date === 'string' ? parseISO(date) : date;
    return isValid(dateObj) ? format(dateObj, DATE_FORMATS.ISO) : null;
  } catch {
    return null;
  }
}

/**
 * 🔒 Formata Date para formato brasileiro com validação
 */
export function formatToBrazilian(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  
  try {
    const dateObj = typeof date === 'string' ? parseISO(date) : date;
    return isValid(dateObj) ? format(dateObj, DATE_FORMATS.DISPLAY) : null;
  } catch {
    return null;
  }
}

/**
 * 🔒 Formata Date para formato brasileiro com hora
 */
export function formatToBrazilianWithTime(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  
  try {
    const dateObj = typeof date === 'string' ? parseISO(date) : date;
    return isValid(dateObj) ? format(dateObj, DATE_FORMATS.DISPLAY_WITH_TIME) : null;
  } catch {
    return null;
  }
}

/**
 * 🔒 Valida se uma string é uma data válida
 */
export function isValidDateString(dateString: string | null | undefined): boolean {
  if (!dateString) return false;
  
  try {
    const date = parseISO(dateString);
    return isValid(date);
  } catch {
    return false;
  }
}

/**
 * 🔒 Valida se uma data está dentro de um range
 */
export function isDateInRange(
  date: Date | string,
  minDate: Date | string,
  maxDate: Date | string
): boolean {
  try {
    const dateObj = typeof date === 'string' ? parseISO(date) : date;
    const minDateObj = typeof minDate === 'string' ? parseISO(minDate) : minDate;
    const maxDateObj = typeof maxDate === 'string' ? parseISO(maxDate) : maxDate;
    
    if (!isValid(dateObj) || !isValid(minDateObj) || !isValid(maxDateObj)) {
      return false;
    }
    
    return !isBefore(dateObj, minDateObj) && !isAfter(dateObj, maxDateObj);
  } catch {
    return false;
  }
}

/**
 * 🔒 Calcula o número de dias entre duas datas com validação
 */
export function getDaysBetween(
  startDate: Date | string | null | undefined,
  endDate: Date | string | null | undefined
): number | null {
  if (!startDate || !endDate) return null;
  
  try {
    const start = typeof startDate === 'string' ? parseISO(startDate) : startDate;
    const end = typeof endDate === 'string' ? parseISO(endDate) : endDate;
    
    if (!isValid(start) || !isValid(end)) return null;
    
    return differenceInDays(end, start);
  } catch {
    return null;
  }
}

/**
 * 🔒 Adiciona meses a uma data com validação
 */
export function addMonthsSafe(
  date: Date | string | null | undefined,
  months: number
): Date | null {
  if (!date) return null;
  
  try {
    const dateObj = typeof date === 'string' ? parseISO(date) : date;
    if (!isValid(dateObj)) return null;
    
    return addMonths(dateObj, months);
  } catch {
    return null;
  }
}

/**
 * 🔒 Retorna o primeiro dia do mês de uma data
 */
export function getStartOfMonth(date: Date | string | null | undefined): Date | null {
  if (!date) return null;
  
  try {
    const dateObj = typeof date === 'string' ? parseISO(date) : date;
    if (!isValid(dateObj)) return null;
    
    return startOfMonth(dateObj);
  } catch {
    return null;
  }
}

/**
 * 🔒 Retorna o último dia do mês de uma data
 */
export function getEndOfMonth(date: Date | string | null | undefined): Date | null {
  if (!date) return null;
  
  try {
    const dateObj = typeof date === 'string' ? parseISO(date) : date;
    if (!isValid(dateObj)) return null;
    
    return endOfMonth(dateObj);
  } catch {
    return null;
  }
}

/**
 * 🔒 Sanitiza input de data do usuário
 * Remove caracteres não numéricos e valida formato
 */
export function sanitizeDateInput(input: string): string {
  // Remove tudo exceto números e separadores de data
  return input.replace(/[^\d/-]/g, '');
}

/**
 * 🔒 Converte MM/YYYY para Date (primeiro dia do mês)
 */
export function parseMonthYear(monthYear: string | null | undefined): Date | null {
  if (!monthYear) return null;
  
  try {
    const date = parse(monthYear, DATE_FORMATS.MONTH_YEAR, new Date());
    return isValid(date) ? date : null;
  } catch {
    return null;
  }
}

/**
 * 🔒 Formata Date para MM/YYYY
 */
export function formatToMonthYear(date: Date | string | null | undefined): string | null {
  if (!date) return null;
  
  try {
    const dateObj = typeof date === 'string' ? parseISO(date) : date;
    return isValid(dateObj) ? format(dateObj, DATE_FORMATS.MONTH_YEAR) : null;
  } catch {
    return null;
  }
}

/**
 * 🔒 Valida se uma data está no futuro
 */
export function isFutureDate(date: Date | string | null | undefined): boolean {
  if (!date) return false;
  
  try {
    const dateObj = typeof date === 'string' ? parseISO(date) : date;
    if (!isValid(dateObj)) return false;
    
    return isAfter(dateObj, new Date());
  } catch {
    return false;
  }
}

/**
 * 🔒 Valida se uma data está no passado
 */
export function isPastDate(date: Date | string | null | undefined): boolean {
  if (!date) return false;
  
  try {
    const dateObj = typeof date === 'string' ? parseISO(date) : date;
    if (!isValid(dateObj)) return false;
    
    return isBefore(dateObj, new Date());
  } catch {
    return false;
  }
}

/**
 * 🔒 Retorna a data atual em formato ISO
 */
export function getCurrentDateISO(): string {
  return format(new Date(), DATE_FORMATS.ISO);
}

/**
 * 🔒 Retorna a data atual em formato brasileiro
 */
export function getCurrentDateBrazilian(): string {
  return format(new Date(), DATE_FORMATS.DISPLAY);
}
