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

const ALLOWED_DOCUMENT_MIMES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream',
]);

export function openDocumentSafely(url: string, nome: string) {
  if (!url) return;
  
  if (url.startsWith('data:')) {
    try {
      const [header, base64Data] = url.split(',');
      const mimeMatch = header.match(/data:(.*?)(;|$)/);
      const mimeType = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
      
      if (!ALLOWED_DOCUMENT_MIMES.has(mimeType)) {
        return;
      }
      
      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: mimeType });
      const blobUrl = URL.createObjectURL(blob);
      
      const newWindow = window.open(blobUrl, '_blank', 'noopener,noreferrer');
      if (newWindow) {
        setTimeout(() => URL.revokeObjectURL(blobUrl), 120000);
      } else {
        URL.revokeObjectURL(blobUrl);
      }
    } catch {
      // Silently fail for malformed data URIs
    }
  } else {
    if (url.startsWith('https://') || url.startsWith('http://localhost')) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }
}