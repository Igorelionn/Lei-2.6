import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Função para parsear valores monetários preservando o formato
export function parseCurrencyToNumber(value: string): number {
  // Remove "R$" e espaços, mantém números, pontos e vírgulas
  const cleaned = value.replace(/[R$\s]/g, '');
  
  // Se vazio, retorna 0
  if (!cleaned) return 0;
  
  // Se tem vírgula, assume que é separador decimal brasileiro
  if (cleaned.includes(',')) {
    // Substitui pontos por nada (milhares) e vírgula por ponto (decimal)
    const normalized = cleaned.replace(/\./g, '').replace(',', '.');
    return parseFloat(normalized) || 0;
  }
  
  // Se só tem pontos, verifica se é decimal ou milhares
  if (cleaned.includes('.')) {
    const parts = cleaned.split('.');
    // Se último grupo tem 3 dígitos ou mais, assume que pontos são milhares
    if (parts[parts.length - 1].length >= 3) {
      return parseFloat(cleaned.replace(/\./g, '')) || 0;
    }
    // Se último grupo tem 1-2 dígitos, assume que é decimal
    else {
      return parseFloat(cleaned) || 0;
    }
  }
  
  // Se só números, converte direto
  return parseFloat(cleaned) || 0;
}

// Função para formatar número para exibição monetária
export function formatCurrencyDisplay(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(value);
}