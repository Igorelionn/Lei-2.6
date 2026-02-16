import { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import { ArrematanteInfo, LoteInfo, DocumentoInfo, Auction } from "@/lib/types";
import { logger } from "@/lib/logger";
import { useActivityLogger } from "@/hooks/use-activity-logger";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from "@/components/ui/select";
import { ChevronLeft, ChevronRight, Check, X as XIcon, Upload, Trash2, Plus, AlertCircle, Eye, Users, ArrowLeftRight } from "lucide-react";
import { StringDatePicker } from "@/components/ui/date-picker";
import { parseCurrencyToNumber, openDocumentSafely } from "@/lib/utils";
import { calcularValorTotal, obterQuantidadeTotalParcelas } from "@/lib/parcelamento-calculator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/lib/supabase";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogPortal,
  AlertDialogOverlay,
} from "@/components/ui/alert-dialog";

// Helper para interpretar números com formato brasileiro
// 1.000 = mil, 1.000,50 = mil e cinquenta centavos
const parseBrazilianNumber = (value: string): number | undefined => {
  if (value === "") return undefined;
  // Remove espaços
  let cleaned = value.trim();
  // Substitui vírgula por ponto (vírgula é decimal no Brasil)
  // Mas primeiro, remove pontos (separadores de milhar)
  cleaned = cleaned.replace(/\./g, '');
  cleaned = cleaned.replace(/,/g, '.');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? undefined : parsed;
};

// Helper para formatar CPF ou CNPJ automaticamente
const formatCpfCnpj = (value: string): string => {
  // Remove tudo que não é dígito
  const numbers = value.replace(/\D/g, '');
  
  // Limita a 14 dígitos (tamanho do CNPJ)
  const limited = numbers.slice(0, 14);
  
  // Se tem até 11 dígitos, formata como CPF
  if (limited.length <= 11) {
    // CPF: 000.000.000-00
    return limited
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  }
  
  // Se tem mais de 11 dígitos, formata como CNPJ
  // CNPJ: 00.000.000/0000-00
  return limited
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
};

// Helper para formatar telefone automaticamente
const formatTelefone = (value: string, codigoPais: string): string => {
  // Remove tudo que não é dígito
  const numbers = value.replace(/\D/g, '');
  
  switch (codigoPais) {
    case '+55': // Brasil
      {
        const limited = numbers.slice(0, 11);
        // Celular (11 dígitos): (00) 00000-0000
        if (limited.length > 10) {
          return limited
            .replace(/(\d{2})(\d)/, '($1) $2')
            .replace(/(\d{5})(\d{1,4})$/, '$1-$2');
        }
        // Fixo (10 dígitos): (00) 0000-0000
        return limited
          .replace(/(\d{2})(\d)/, '($1) $2')
          .replace(/(\d{4})(\d{1,4})$/, '$1-$2');
      }
    
    case '+1': // EUA/Canadá
      {
        const limited = numbers.slice(0, 10);
        // Formato: (000) 000-0000
        return limited
          .replace(/(\d{3})(\d)/, '($1) $2')
          .replace(/(\d{3})(\d{1,4})$/, '$1-$2');
      }
    
    case '+54': // Argentina
      {
        const limited = numbers.slice(0, 10);
        // Formato: (000) 000-0000
        return limited
          .replace(/(\d{2,4})(\d)/, '($1) $2')
          .replace(/(\d{4})(\d{1,4})$/, '$1-$2');
      }
    
    case '+52': // México
      {
        const limited = numbers.slice(0, 10);
        // Formato: (000) 000-0000
        return limited
          .replace(/(\d{3})(\d)/, '($1) $2')
          .replace(/(\d{3})(\d{1,4})$/, '$1-$2');
      }
    
    case '+56': // Chile
      {
        const limited = numbers.slice(0, 9);
        // Formato: 0 0000-0000
        return limited
          .replace(/(\d{1})(\d)/, '$1 $2')
          .replace(/(\d{4})(\d{1,4})$/, '$1-$2');
      }
    
    case '+57': // Colômbia
      {
        const limited = numbers.slice(0, 10);
        // Formato: (000) 000-0000
        return limited
          .replace(/(\d{3})(\d)/, '($1) $2')
          .replace(/(\d{3})(\d{1,4})$/, '$1-$2');
      }
    
    case '+595': // Paraguai
    case '+598': // Uruguai
      {
        const limited = numbers.slice(0, 9);
        // Formato: (00) 000-000
        return limited
          .replace(/(\d{2})(\d)/, '($1) $2')
          .replace(/(\d{3})(\d{1,3})$/, '$1-$2');
      }
    
    case '+351': // Portugal
    case '+34': // Espanha
      {
        const limited = numbers.slice(0, 9);
        // Formato: 000 000 000
        return limited
          .replace(/(\d{3})(\d)/, '$1 $2')
          .replace(/(\d{3})(\d{1,3})$/, '$1 $2');
      }
    
    case '+33': // França
      {
        const limited = numbers.slice(0, 9);
        // Formato: 00 00 00 00 00
        return limited
          .replace(/(\d{2})(\d)/, '$1 $2')
          .replace(/(\d{2})(\d)/, '$1 $2')
          .replace(/(\d{2})(\d)/, '$1 $2')
          .replace(/(\d{2})(\d{1,2})$/, '$1 $2');
      }
    
    case '+49': // Alemanha
      {
        const limited = numbers.slice(0, 11);
        // Formato: 0000 00000000
        return limited
          .replace(/(\d{4})(\d{1,7})$/, '$1 $2');
      }
    
    case '+44': // Reino Unido
      {
        const limited = numbers.slice(0, 10);
        // Formato: 0000 000000
        return limited
          .replace(/(\d{4})(\d{1,6})$/, '$1 $2');
      }
    
    case '+86': // China
    case '+81': // Japão
    case '+82': // Coreia do Sul
      {
        const limited = numbers.slice(0, 11);
        // Formato: 000-0000-0000
        return limited
          .replace(/(\d{3})(\d)/, '$1-$2')
          .replace(/(\d{4})(\d{1,4})$/, '$1-$2');
      }
    
    case '+91': // Índia
      {
        const limited = numbers.slice(0, 10);
        // Formato: 00000-00000
        return limited
          .replace(/(\d{5})(\d{1,5})$/, '$1-$2');
      }
    
    default:
      // Para países não especificados, limita a 15 dígitos e retorna sem formatação
      return numbers.slice(0, 15);
  }
};

// Helper para formatar CEP automaticamente
const formatCep = (value: string): string => {
  // Remove tudo que não é dígito
  const numbers = value.replace(/\D/g, '');
  
  // Limita a 8 dígitos
  const limited = numbers.slice(0, 8);
  
  // Formata como CEP: 00000-000
  return limited.replace(/(\d{5})(\d{1,3})$/, '$1-$2');
};

// Valida formato de e-mail
const isValidEmail = (email: string): boolean => {
  if (!email) return false;
  // Regex padrão para validação de e-mail
  const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email);
};

// Componente de bandeira SVG
const FlagIcon = ({ countryCode, countryName }: { countryCode: string; countryName?: string }) => {
  const flagClass = "w-6 h-4 rounded-sm overflow-hidden flex-shrink-0";
  
  // Para +1, diferenciar entre EUA e Canadá pelo nome
  if (countryCode === '+1' && countryName === 'Canadá') {
    return (
      <svg className={flagClass} viewBox="0 0 24 16" fill="none">
        <rect width="6" height="16" fill="#FF0000"/>
        <rect x="6" width="12" height="16" fill="white"/>
        <rect x="18" width="6" height="16" fill="#FF0000"/>
        <path d="M12 5 L13 7 L11.5 7.5 L13 8 L12 10 L11.5 8.5 L10 8 L11.5 7.5 Z" fill="#FF0000"/>
      </svg>
    );
  }
  
  switch (countryCode) {
    case '+55': // Brasil
      return (
        <svg className={flagClass} viewBox="0 0 24 16" fill="none">
          <rect width="24" height="16" fill="#009B3A"/>
          <path d="M12 2 L22 8 L12 14 L2 8 Z" fill="#FFDF00"/>
          <circle cx="12" cy="8" r="3.5" fill="#002776"/>
        </svg>
      );
    case '+1': // EUA
      return (
        <svg className={flagClass} viewBox="0 0 24 16" fill="none">
          <rect width="24" height="16" fill="#B22234"/>
          <rect y="1.2" width="24" height="1.2" fill="white"/>
          <rect y="3.6" width="24" height="1.2" fill="white"/>
          <rect y="6" width="24" height="1.2" fill="white"/>
          <rect y="8.4" width="24" height="1.2" fill="white"/>
          <rect y="10.8" width="24" height="1.2" fill="white"/>
          <rect y="13.2" width="24" height="1.2" fill="white"/>
          <rect width="10" height="8.4" fill="#3C3B6E"/>
        </svg>
      );
    case '+54': // Argentina
      return (
        <svg className={flagClass} viewBox="0 0 24 16" fill="none">
          <rect width="24" height="5.33" fill="#74ACDF"/>
          <rect y="5.33" width="24" height="5.33" fill="white"/>
          <rect y="10.67" width="24" height="5.33" fill="#74ACDF"/>
          <circle cx="12" cy="8" r="2" fill="#F6B40E" stroke="#85340A" strokeWidth="0.3"/>
        </svg>
      );
    case '+52': // México
      return (
        <svg className={flagClass} viewBox="0 0 24 16" fill="none">
          <rect width="8" height="16" fill="#006847"/>
          <rect x="8" width="8" height="16" fill="white"/>
          <rect x="16" width="8" height="16" fill="#CE1126"/>
        </svg>
      );
    case '+56': // Chile
      return (
        <svg className={flagClass} viewBox="0 0 24 16" fill="none">
          <rect width="24" height="8" fill="white"/>
          <rect y="8" width="24" height="8" fill="#D52B1E"/>
          <rect width="8" height="8" fill="#0039A6"/>
          <path d="M4 3 L5 5 L3.5 5.5 L5 6 L4 8 L3.5 6.5 L2 6 L3.5 5.5 Z" fill="white"/>
        </svg>
      );
    case '+57': // Colômbia
      return (
        <svg className={flagClass} viewBox="0 0 24 16" fill="none">
          <rect width="24" height="8" fill="#FCD116"/>
          <rect y="8" width="24" height="4" fill="#003893"/>
          <rect y="12" width="24" height="4" fill="#CE1126"/>
        </svg>
      );
    case '+595': // Paraguai
      return (
        <svg className={flagClass} viewBox="0 0 24 16" fill="none">
          <rect width="24" height="5.33" fill="#D52B1E"/>
          <rect y="5.33" width="24" height="5.33" fill="white"/>
          <rect y="10.67" width="24" height="5.33" fill="#0038A8"/>
        </svg>
      );
    case '+598': // Uruguai
      return (
        <svg className={flagClass} viewBox="0 0 24 16" fill="none">
          <rect width="24" height="16" fill="white"/>
          <rect y="0" width="24" height="1.8" fill="#0038A8"/>
          <rect y="3.6" width="24" height="1.8" fill="#0038A8"/>
          <rect y="7.2" width="24" height="1.8" fill="#0038A8"/>
          <rect y="10.8" width="24" height="1.8" fill="#0038A8"/>
          <rect y="14.4" width="24" height="1.6" fill="#0038A8"/>
          <rect width="8" height="8" fill="white"/>
          <circle cx="4" cy="4" r="2" fill="#FCD116"/>
        </svg>
      );
    case '+593': // Equador
      return (
        <svg className={flagClass} viewBox="0 0 24 16" fill="none">
          <rect width="24" height="8" fill="#FFD100"/>
          <rect y="8" width="24" height="4" fill="#0072CE"/>
          <rect y="12" width="24" height="4" fill="#EF3340"/>
        </svg>
      );
    case '+51': // Peru
      return (
        <svg className={flagClass} viewBox="0 0 24 16" fill="none">
          <rect width="8" height="16" fill="#D91023"/>
          <rect x="8" width="8" height="16" fill="white"/>
          <rect x="16" width="8" height="16" fill="#D91023"/>
        </svg>
      );
    case '+58': // Venezuela
      return (
        <svg className={flagClass} viewBox="0 0 24 16" fill="none">
          <rect width="24" height="5.33" fill="#FFCC00"/>
          <rect y="5.33" width="24" height="5.33" fill="#00247D"/>
          <rect y="10.67" width="24" height="5.33" fill="#CF142B"/>
        </svg>
      );
    case '+591': // Bolívia
      return (
        <svg className={flagClass} viewBox="0 0 24 16" fill="none">
          <rect width="24" height="5.33" fill="#D52B1E"/>
          <rect y="5.33" width="24" height="5.33" fill="#F9E300"/>
          <rect y="10.67" width="24" height="5.33" fill="#007A3D"/>
        </svg>
      );
    case '+351': // Portugal
      return (
        <svg className={flagClass} viewBox="0 0 24 16" fill="none">
          <rect width="10" height="16" fill="#006600"/>
          <rect x="10" width="14" height="16" fill="#FF0000"/>
        </svg>
      );
    case '+34': // Espanha
      return (
        <svg className={flagClass} viewBox="0 0 24 16" fill="none">
          <rect width="24" height="4" fill="#AA151B"/>
          <rect y="4" width="24" height="8" fill="#F1BF00"/>
          <rect y="12" width="24" height="4" fill="#AA151B"/>
        </svg>
      );
    case '+33': // França
      return (
        <svg className={flagClass} viewBox="0 0 24 16" fill="none">
          <rect width="8" height="16" fill="#002395"/>
          <rect x="8" width="8" height="16" fill="white"/>
          <rect x="16" width="8" height="16" fill="#ED2939"/>
        </svg>
      );
    case '+49': // Alemanha
      return (
        <svg className={flagClass} viewBox="0 0 24 16" fill="none">
          <rect width="24" height="5.33" fill="#000000"/>
          <rect y="5.33" width="24" height="5.33" fill="#DD0000"/>
          <rect y="10.67" width="24" height="5.33" fill="#FFCE00"/>
        </svg>
      );
    case '+44': // Reino Unido
      return (
        <svg className={flagClass} viewBox="0 0 24 16" fill="none">
          <rect width="24" height="16" fill="#012169"/>
          <path d="M0 0 L24 16 M24 0 L0 16" stroke="white" strokeWidth="3"/>
          <path d="M0 0 L24 16 M24 0 L0 16" stroke="#C8102E" strokeWidth="2"/>
          <path d="M12 0 V16 M0 8 H24" stroke="white" strokeWidth="5"/>
          <path d="M12 0 V16 M0 8 H24" stroke="#C8102E" strokeWidth="3"/>
        </svg>
      );
    case '+39': // Itália
      return (
        <svg className={flagClass} viewBox="0 0 24 16" fill="none">
          <rect width="8" height="16" fill="#009246"/>
          <rect x="8" width="8" height="16" fill="white"/>
          <rect x="16" width="8" height="16" fill="#CE2B37"/>
        </svg>
      );
    case '+86': // China
      return (
        <svg className={flagClass} viewBox="0 0 24 16" fill="none">
          <rect width="24" height="16" fill="#DE2910"/>
          <path d="M4 3 L5 5.5 L2.5 4 L5.5 4 L3 5.5 Z" fill="#FFDE00"/>
        </svg>
      );
    case '+81': // Japão
      return (
        <svg className={flagClass} viewBox="0 0 24 16" fill="none">
          <rect width="24" height="16" fill="white"/>
          <circle cx="12" cy="8" r="4" fill="#BC002D"/>
        </svg>
      );
    case '+82': // Coreia do Sul
      return (
        <svg className={flagClass} viewBox="0 0 24 16" fill="none">
          <rect width="24" height="16" fill="white"/>
          <circle cx="12" cy="8" r="4" fill="#CD2E3A"/>
          <circle cx="12" cy="8" r="4" fill="#0047A0" clipPath="url(#half)"/>
        </svg>
      );
    case '+91': // Índia
      return (
        <svg className={flagClass} viewBox="0 0 24 16" fill="none">
          <rect width="24" height="5.33" fill="#FF9933"/>
          <rect y="5.33" width="24" height="5.33" fill="white"/>
          <rect y="10.67" width="24" height="5.33" fill="#138808"/>
          <circle cx="12" cy="8" r="2" fill="transparent" stroke="#000080" strokeWidth="0.5"/>
        </svg>
      );
    default:
      // Bandeira genérica cinza
      return (
        <svg className={flagClass} viewBox="0 0 24 16" fill="none">
          <rect width="24" height="16" fill="#e5e7eb"/>
        </svg>
      );
  }
};

// Lista de códigos de países para telefone organizados por região
const COUNTRY_CODES = [
  {
    region: "América do Sul",
    countries: [
      { code: "+55", country: "Brasil" },
      { code: "+54", country: "Argentina" },
      { code: "+56", country: "Chile" },
      { code: "+57", country: "Colômbia" },
      { code: "+593", country: "Equador" },
      { code: "+595", country: "Paraguai" },
      { code: "+51", country: "Peru" },
      { code: "+598", country: "Uruguai" },
      { code: "+58", country: "Venezuela" },
      { code: "+591", country: "Bolívia" },
    ],
  },
  {
    region: "América do Norte",
    countries: [
      { code: "+1", country: "Estados Unidos" },
      { code: "+1", country: "Canadá" },
      { code: "+52", country: "México" },
    ],
  },
  {
    region: "Europa",
    countries: [
      { code: "+351", country: "Portugal" },
      { code: "+34", country: "Espanha" },
      { code: "+33", country: "França" },
      { code: "+49", country: "Alemanha" },
      { code: "+44", country: "Reino Unido" },
      { code: "+39", country: "Itália" },
    ],
  },
  {
    region: "Ásia",
    countries: [
      { code: "+86", country: "China" },
      { code: "+81", country: "Japão" },
      { code: "+82", country: "Coreia do Sul" },
      { code: "+91", country: "Índia" },
    ],
  },
];

interface ArrematanteWizardProps {
  initial: {
    arrematante?: ArrematanteInfo;
    lotes: LoteInfo[];
    auctionName: string;
    auctionId: string;
    auction?: Auction; // Adicionado para acessar arrematantes existentes
    defaultDiaVencimento?: number;
    defaultQuantidadeParcelas?: number;
    defaultMesInicio?: string;
  };
  onSubmit: (values: Partial<ArrematanteInfo>) => Promise<void> | void;
  onCancel?: () => void;
  onDeleteArrematante?: (arrematanteId: string) => Promise<void> | void;
  isNewArrematante?: boolean; // Indica se está criando novo (não editando)
}

// Interface para resposta da API ViaCEP
interface ViaCepResponse {
  cep: string;
  logradouro: string;
  complemento: string;
  bairro: string;
  localidade: string;
  uf: string;
  erro?: boolean;
}

// Interface para resposta da BrasilAPI
interface BrasilApiResponse {
  cep: string;
  state: string;
  city: string;
  neighborhood: string;
  street: string;
  service: string;
}

interface FormValues {
  id?: string; // ID do arrematante quando estiver editando
  nome: string;
  documento: string;
  telefone: string;
  codigoPais: string;
  email: string;
  endereco: string;
  cep: string;
  rua: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  estado: string;
  loteId: string;
  mercadoriaId: string;
  tipoPagamento: "a_vista" | "parcelamento" | "entrada_parcelamento";
  valorPagar: string;
  valorEntrada: string;
  quantidadeParcelas: number;
  mesInicioPagamento: string;
  diaVencimentoMensal: number;
  parcelasPagas: number;
  percentualJurosAtraso: number;
  tipoJurosAtraso: "simples" | "composto";
  documentos: DocumentoInfo[];
  pago: boolean;
  dataVencimentoVista?: string;
  dataEntrada?: string;
  // Campos do novo sistema de pagamento
  valorLance?: string;
  fatorMultiplicador?: string;
  usaFatorMultiplicador?: boolean;
  parcelasTriplas?: number;
  parcelasDuplas?: number;
  parcelasSimples?: number;
}

export function ArrematanteWizard({ initial, onSubmit, onCancel, onDeleteArrematante, isNewArrematante = false }: ArrematanteWizardProps) {
  const { logDocumentAction } = useActivityLogger();
  // Verificar se deve mostrar seleção de arrematante
  const arrematantesExistentes = useMemo(() => initial.auction?.arrematantes || [], [initial.auction?.arrematantes]);
  
  // ✅ Mostrar tela de seleção quando:
  // - Há 1 ou mais arrematantes existentes
  // - NÃO há arrematante pré-selecionado (initial.arrematante)
  // - NÃO está criando novo arrematante (isNewArrematante)
  const shouldShowSelection = arrematantesExistentes.length >= 1 && !initial.arrematante && !isNewArrematante;
  
  logger.debug('🔍 [ArrematanteWizard] Verificando seleção:', {
    qtdArrematantes: arrematantesExistentes.length,
    hasArrematanteInicial: !!initial.arrematante,
    isNewArrematante,
    shouldShowSelection,
    startStep: shouldShowSelection ? -1 : 0
  });
  
  const [currentStep, setCurrentStep] = useState(shouldShowSelection ? -1 : 0); // -1 = etapa de seleção
  const [selectedArrematanteId, setSelectedArrematanteId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [selectedDocIndex, setSelectedDocIndex] = useState(0);
  const [loadingCep, setLoadingCep] = useState(false);
  const [cepError, setCepError] = useState<string | null>(null);
  const [attemptedNext, setAttemptedNext] = useState(false);
  const [tentouDataIncompativel, setTentouDataIncompativel] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [searchCpf, setSearchCpf] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [showAllBidders, setShowAllBidders] = useState(false);
  const [searchMode, setSearchMode] = useState<'cpf' | 'nome'>('cpf');
  const [isHoveringButton, setIsHoveringButton] = useState(false);
  
  // Estados para o wizard de divisão de mercadoria
  const [showDivisaoWizard, setShowDivisaoWizard] = useState(false);
  const [showCancelDivisaoModal, setShowCancelDivisaoModal] = useState(false);
  const [tipoDivisao, setTipoDivisao] = useState<'quantidade' | 'valor' | 'percentual'>('quantidade');
  const [numeroArrematantes, setNumeroArrematantes] = useState(1);
  const [numeroArrematantesInput, setNumeroArrematantesInput] = useState('1'); // String para permitir edição livre
  const [divisaoStep, setDivisaoStep] = useState(0); // 0 = config inicial, 1+ = config de cada arrematante, final = preview
  const [arrematantesDivisao, setArrematantesDivisao] = useState<Array<{
    nome: string;
    documento?: string;
    email?: string;
    codigoPais?: string;
    telefone?: string;
    cep?: string;
    rua?: string;
    numero?: string;
    complemento?: string;
    bairro?: string;
    cidade?: string;
    estado?: string;
    quantidade?: number;
    valor?: number;
    percentual?: number;
    tipoPagamento?: string;
    valorPagar?: string;
    dataVencimentoVista?: string;
    valorEntrada?: string;
    dataEntrada?: string;
    valorLance?: string;
    fatorMultiplicador?: string;
    usaFatorMultiplicador?: boolean;
    parcelasTriplas?: number;
    parcelasDuplas?: number;
    parcelasSimples?: number;
    documentos?: DocumentoInfo[];
  }>>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [arrematanteSubStep, setArrematanteSubStep] = useState(0); // Controla a subetapa dentro de cada arrematante
  const [showImportModalDivisao, setShowImportModalDivisao] = useState(false);
  const [searchCpfDivisao, setSearchCpfDivisao] = useState("");
  const [showAllBiddersDivisao, setShowAllBiddersDivisao] = useState(false);
  const [isHoveringButtonDivisao, setIsHoveringButtonDivisao] = useState(false);
  const [searchModeDivisao, setSearchModeDivisao] = useState<'cpf' | 'nome'>('cpf');
  const [loadingCepDivisao, setLoadingCepDivisao] = useState(false);
  const [cepErrorDivisao, setCepErrorDivisao] = useState<string | null>(null);
  const [selectedDocIndexDivisao, setSelectedDocIndexDivisao] = useState(0);
  const [arrematantesExistentesDivisao, setArrematantesExistentesDivisao] = useState<ArrematanteInfo[]>([]);
  const [showGerenciarDivisao, setShowGerenciarDivisao] = useState(false);
  
  // Definir as subetapas do formulário de arrematante
  const arrematanteSubSteps = [
    { id: 'identificacao', title: 'Identificação' },
    { id: 'contato', title: 'Contato' },
    { id: 'endereco', title: 'Endereço' },
    { id: 'pagamento', title: 'Condições de Pagamento' },
    { id: 'documentos', title: 'Documentos' }
  ];
  
  // Estados para busca na etapa de seleção
  const [searchCpfSelection, setSearchCpfSelection] = useState("");
  const [isTypingSelection, setIsTypingSelection] = useState(false);
  const [showAllBiddersSelection, setShowAllBiddersSelection] = useState(false);
  const [searchModeSelection, setSearchModeSelection] = useState<'cpf' | 'nome'>('cpf');
  const [isHoveringButtonSelection, setIsHoveringButtonSelection] = useState(false);
  
  // Declarar values primeiro
  const [values, setValues] = useState<FormValues>(() => {
    const arr = initial.arrematante;
    
    logger.debug('📥 CONDIÇÕES DE PAGAMENTO - Carregando do banco:', {
      tipoPagamento: arr?.tipoPagamento,
      dataVencimentoVista: arr?.dataVencimentoVista,
      dataEntrada: arr?.dataEntrada,
      valorLance: arr?.valorLance,
      fatorMultiplicador: arr?.fatorMultiplicador,
      usaFatorMultiplicador: arr?.usaFatorMultiplicador,
      parcelasTriplas: arr?.parcelasTriplas,
      parcelasDuplas: arr?.parcelasDuplas,
      parcelasSimples: arr?.parcelasSimples
    });
    
    // ✅ Separar código país do telefone se existir
    let telefoneNum = arr?.telefone || "";
    let codigoPaisVal = "+55"; // Padrão Brasil
    if (telefoneNum && telefoneNum.startsWith("+")) {
      const match = telefoneNum.match(/^(\+\d+)\s+(.+)$/);
      if (match) {
        codigoPaisVal = match[1]; // Ex: "+55"
        telefoneNum = match[2];    // Ex: "(11) 98765-4321"
      }
    }
    
    // ✅ PRIORIZAR campos separados do banco (novos campos)
    // Se não existirem, tentar parsear do endereço completo (compatibilidade com dados antigos)
    const cepVal = arr?.cep || "";
    let ruaVal = arr?.rua || "";
    let numeroVal = arr?.numero || "";
    let complementoVal = arr?.complemento || "";
    let bairroVal = arr?.bairro || "";
    let cidadeVal = arr?.cidade || "";
    let estadoVal = arr?.estado || "";
    
    // ⚠️ FALLBACK: Se os campos separados não existirem, tentar parsear do endereço completo (dados antigos)
    if (!ruaVal && !bairroVal && !cidadeVal && arr?.endereco) {
      logger.debug('⚠️ Usando fallback - parseando endereço completo');
      
      // Tentar extrair informações do endereço salvo
      // Formato esperado: "Rua X, nº Y, Complemento, Bairro, Cidade - UF"
      const enderecoPartes = arr.endereco.split(',').map(p => p.trim());
      
      if (enderecoPartes.length >= 1) {
        ruaVal = enderecoPartes[0];
      }
      
      // Procurar número (nº X)
      const numeroParte = enderecoPartes.find(p => p.startsWith('nº '));
      if (numeroParte) {
        numeroVal = numeroParte.replace('nº ', '');
      }
      
      // Última parte geralmente é "Cidade - UF"
      const ultimaParte = enderecoPartes[enderecoPartes.length - 1];
      const cidadeEstadoMatch = ultimaParte?.match(/^(.+?)\s*-\s*([A-Z]{2})$/);
      if (cidadeEstadoMatch) {
        cidadeVal = cidadeEstadoMatch[1].trim();
        estadoVal = cidadeEstadoMatch[2].trim();
        
        // Penúltima parte é o bairro
        if (enderecoPartes.length >= 2) {
          bairroVal = enderecoPartes[enderecoPartes.length - 2];
        }
      }
      
      // Parte do meio pode ser complemento (se existir mais de 3 partes e não for número)
      if (enderecoPartes.length > 3) {
        const complementoPossivel = enderecoPartes.slice(1, -2).find(p => !p.startsWith('nº '));
        if (complementoPossivel) {
          complementoVal = complementoPossivel;
        }
      }
    }
    
    return {
      id: arr?.id, // ID do arrematante quando estiver editando
      nome: arr?.nome || "",
      documento: arr?.documento || "",
      telefone: telefoneNum,
      codigoPais: codigoPaisVal,
      email: arr?.email || "",
      endereco: arr?.endereco || "",
      cep: cepVal,
      rua: ruaVal,
      numero: numeroVal,
      complemento: complementoVal,
      bairro: bairroVal,
      cidade: cidadeVal,
      estado: estadoVal,
      loteId: arr?.loteId || "",
      mercadoriaId: arr?.mercadoriaId || "", // ✅ CORRIGIDO: agora carrega do arr
      tipoPagamento: arr?.tipoPagamento || "parcelamento",
      valorPagar: arr?.valorPagar || "",
      valorEntrada: arr?.valorEntrada || "",
      quantidadeParcelas: arr?.quantidadeParcelas || initial.defaultQuantidadeParcelas || 12,
      mesInicioPagamento: arr?.mesInicioPagamento || initial.defaultMesInicio || new Date().toISOString().slice(0, 10),
      diaVencimentoMensal: arr?.diaVencimentoMensal || initial.defaultDiaVencimento || 15,
      parcelasPagas: arr?.parcelasPagas || 0,
      percentualJurosAtraso: arr?.percentualJurosAtraso || 0,
      tipoJurosAtraso: arr?.tipoJurosAtraso || "composto",
      documentos: arr?.documentos || [],
      pago: arr?.pago || false,
      dataVencimentoVista: arr?.dataVencimentoVista,
      dataEntrada: arr?.dataEntrada,
      // Campos do novo sistema
      valorLance: arr?.valorLance ? String(arr.valorLance) : undefined,
      fatorMultiplicador: arr?.fatorMultiplicador ? String(arr.fatorMultiplicador) : undefined,
      usaFatorMultiplicador: arr?.usaFatorMultiplicador,
      parcelasTriplas: arr?.parcelasTriplas,
      parcelasDuplas: arr?.parcelasDuplas,
      parcelasSimples: arr?.parcelasSimples,
    };
  });

  // Informações do lote selecionado para exibição
  const infoLoteSelecionado = useMemo(() => {
    if (!values.loteId) return null;
    
    const lote = initial.lotes.find(l => l.id === values.loteId);
    if (!lote) return null;

    return { lote };
  }, [values.loteId, initial.lotes]);

  // Calcular automaticamente a quantidade total de parcelas baseado nas configurações
  const quantidadeParcelasCalculada = useMemo(() => {
    return obterQuantidadeTotalParcelas(
      values.parcelasTriplas || 0,
      values.parcelasDuplas || 0,
      values.parcelasSimples || 0
    );
  }, [values.parcelasTriplas, values.parcelasDuplas, values.parcelasSimples]);

  const updateField = <K extends keyof FormValues>(field: K, value: FormValues[K]) => {
    setValues(prev => ({ ...prev, [field]: value }));
  };

  // ✅ Sincronizar mesInicioPagamento com diaVencimentoMensal
  useEffect(() => {
    // Se tem mesInicioPagamento e diaVencimentoMensal, ajustar o dia
    if (values.mesInicioPagamento && values.diaVencimentoMensal) {
      // Parse da data ISO ignorando fuso horário
      const [ano, mes, dia] = values.mesInicioPagamento.split('-').map(Number);
      const diaAtual = dia;
      
      // Se o dia for diferente do diaVencimentoMensal, ajustar
      if (diaAtual !== values.diaVencimentoMensal) {
        // Criar nova data com o dia correto (mes-1 porque Date usa 0-11 para meses)
        const novaData = new Date(ano, mes - 1, values.diaVencimentoMensal);
        const novaDataISO = novaData.toISOString().slice(0, 10);
        
        // Atualizar apenas se for diferente (previne loop infinito)
        if (novaDataISO !== values.mesInicioPagamento) {
          setValues(prev => ({ ...prev, mesInicioPagamento: novaDataISO }));
        }
      }
    }
    // Incluir ambas as dependências: o efeito precisa rodar quando qualquer uma mudar
  }, [values.diaVencimentoMensal, values.mesInicioPagamento]);

  // ✅ Detectar quando está digitando no campo de busca
  useEffect(() => {
    if (searchCpf && !showAllBidders) {
      setIsTyping(true);
      const timer = setTimeout(() => {
        setIsTyping(false);
      }, 800); // Espera 800ms após parar de digitar
      
      return () => clearTimeout(timer);
    } else {
      setIsTyping(false);
    }
  }, [searchCpf, showAllBidders]);

  // ✅ Detectar quando está digitando no campo de busca da seleção
  useEffect(() => {
    if (searchCpfSelection) {
      setIsTypingSelection(true);
      const timer = setTimeout(() => {
        setIsTypingSelection(false);
      }, 800);
      return () => clearTimeout(timer);
    } else {
      setIsTypingSelection(false);
    }
  }, [searchCpfSelection]);

  // ✅ Atualizar endereço completo sempre que os campos de endereço mudarem
  useEffect(() => {
    if (values.rua || values.numero || values.bairro || values.cidade || values.estado) {
      const partes = [
        values.rua,
        values.numero ? `nº ${values.numero}` : null,
        values.complemento || null,
        values.bairro,
        values.cidade && values.estado ? `${values.cidade} - ${values.estado}` : null
      ].filter(Boolean);
      
      const enderecoCompleto = partes.join(', ');
      
      // Atualizar o campo endereco se houver mudanças
      if (enderecoCompleto && enderecoCompleto !== values.endereco) {
        setValues(prev => ({ ...prev, endereco: enderecoCompleto }));
      }
    }
  }, [values.rua, values.numero, values.complemento, values.bairro, values.cidade, values.estado, values.endereco]);

  // Buscar CEP usando API mundial (OpenCEP + BrasilAPI como fallback)
  const buscarCep = async (cep: string) => {
    const cepNumeros = cep.replace(/\D/g, '');
    
    if (cepNumeros.length !== 8) return;
    
    setLoadingCep(true);
    setCepError(null);
    
    try {
      let data: ViaCepResponse | null = null;
      
      // Tentar com BrasilAPI (API mais mundial e moderna)
      try {
        const response = await fetch(`https://brasilapi.com.br/api/cep/v1/${cepNumeros}`);
        
        if (response.ok) {
          const brasilData: BrasilApiResponse = await response.json();
          
          // Converter para formato padrão
          data = {
            cep: brasilData.cep,
            logradouro: brasilData.street || "",
            complemento: "",
            bairro: brasilData.neighborhood || "",
            localidade: brasilData.city || "",
            uf: brasilData.state || ""
          };
        }
      } catch (error) {
        logger.warn('BrasilAPI falhou, tentando ViaCEP');
      }
      
      // Fallback: ViaCEP
      if (!data) {
      const response = await fetch(`https://viacep.com.br/ws/${cepNumeros}/json/`);
        if (response.ok) {
          data = await response.json();
        }
      }
      
      // Se nenhuma API funcionou
      if (!data) {
        setCepError("Não foi possível conectar aos serviços de CEP. Preencha manualmente.");
        return;
      }
      
      // Verifica se o CEP foi encontrado
      if (data.erro) {
        setCepError("CEP não encontrado. Por favor, verifique o CEP digitado.");
        return;
      }
      
      // Monta o endereço completo
      const enderecoCompleto = [
        data.logradouro,
        data.bairro,
        data.localidade,
        data.uf
      ]
        .filter(parte => parte && parte.trim())
        .join(", ");
      
      // Atualiza os campos
        setValues(prev => ({
          ...prev,
          rua: data.logradouro || "",
          bairro: data.bairro || "",
          cidade: data.localidade || "",
          estado: data.uf || "",
        endereco: enderecoCompleto
        }));
      
      logger.debug("✅ CEP encontrado com sucesso:", cepNumeros);
      setCepError(null);
    } catch (error) {
      logger.error("❌ Erro ao buscar CEP:", error);
      setCepError("Erro ao buscar CEP. Por favor, preencha manualmente.");
    } finally {
      setLoadingCep(false);
    }
  };

  const validateCurrentStep = (): boolean => {
    switch (currentStep) {
      case 0: // Nome e Documento
        return !!(values.nome && values.documento);
      case 1: // Telefone e Email
        return !!(values.telefone && values.email && isValidEmail(values.email));
      case 2: // Endereço
        return !!(values.cep && values.rua && values.numero && values.bairro && values.cidade && values.estado);
      case 3: { // Lote
        if (!values.loteId) return false;
        // Verificar se o lote existe
        const lote = initial.lotes.find(l => l.id === values.loteId);
        if (!lote) return false;
        return true;
      }
      case 4: // Condições de Pagamento
        if (!values.tipoPagamento) return false;
        
        // À vista: validar valor e data
        if (values.tipoPagamento === "a_vista") {
          if (!values.dataVencimentoVista) return false;
          if (!values.valorPagar) return false;
          const valorParsed = parseCurrencyToNumber(values.valorPagar);
          if (!valorParsed || valorParsed <= 0) return false;
        }
        
        // Parcelamento: validar fator multiplicador
        if (values.tipoPagamento === "parcelamento") {
          if (!values.valorLance || !values.fatorMultiplicador) return false;
          
          const valorLanceParsed = parseBrazilianNumber(values.valorLance);
          const fatorParsed = parseBrazilianNumber(values.fatorMultiplicador);
          
          if (!valorLanceParsed || !fatorParsed) return false;
          if (valorLanceParsed <= 0 || fatorParsed <= 0) return false;
          
          // Validar compatibilidade das parcelas se configuradas
          const triplas = values.parcelasTriplas || 0;
          const duplas = values.parcelasDuplas || 0;
          const simples = values.parcelasSimples || 0;
          const totalParcelas = triplas + duplas + simples;
          
          if (totalParcelas > 0) {
            const somaCalculada = (triplas * 3) + (duplas * 2) + (simples * 1);
            
            // ✅ Calcular valor total em reais (parcelas + comissão)
            const valorTotalParcelas = calcularValorTotal(valorLanceParsed, fatorParsed);
            const percentualComissao = initial.auction?.percentualComissaoLeiloeiro || 0;
            const valorComissao = percentualComissao > 0 ? valorTotalParcelas * (percentualComissao / 100) : 0;
            const valorTotalGeral = valorTotalParcelas + valorComissao;
            
            // ✅ Calcular parcelas necessárias (permitindo parcela residual)
            const parcelasCompletas = Math.floor(valorTotalGeral / valorLanceParsed);
            const valorResidual = valorTotalGeral - (parcelasCompletas * valorLanceParsed);
            const parcelasNecessarias = valorResidual > 0 ? parcelasCompletas + 1 : parcelasCompletas;
            
            if (somaCalculada !== parcelasNecessarias) return false;
          }
        }
        
        // Entrada + Parcelamento: validar data, entrada e fator
        if (values.tipoPagamento === "entrada_parcelamento") {
          if (!values.dataEntrada) return false;
          if (!values.valorEntrada) return false;
          if (!values.valorLance || !values.fatorMultiplicador) return false;
          
          const valorLanceParsed = parseBrazilianNumber(values.valorLance);
          const fatorParsed = parseBrazilianNumber(values.fatorMultiplicador);
          
          if (!valorLanceParsed || !fatorParsed) return false;
          if (valorLanceParsed <= 0 || fatorParsed <= 0) return false;
          
          // Validar compatibilidade das parcelas se configuradas
          const triplas = values.parcelasTriplas || 0;
          const duplas = values.parcelasDuplas || 0;
          const simples = values.parcelasSimples || 0;
          const totalParcelas = triplas + duplas + simples;
          
          if (totalParcelas > 0) {
            const somaCalculada = (triplas * 3) + (duplas * 2) + (simples * 1);
            
            // ✅ Calcular valor total em reais (entrada + parcelas + comissão)
            const valorTotalParcelas = calcularValorTotal(valorLanceParsed, fatorParsed);
            const valorEntradaParsed = parseBrazilianNumber(values.valorEntrada);
            const valorEntrada = valorEntradaParsed && valorEntradaParsed > 0 ? valorEntradaParsed : 0;
            const valorTotalMercadoria = valorTotalParcelas + valorEntrada;
            
            const percentualComissao = initial.auction?.percentualComissaoLeiloeiro || 0;
            const valorComissao = percentualComissao > 0 ? valorTotalMercadoria * (percentualComissao / 100) : 0;
            const valorTotalGeral = valorTotalMercadoria + valorComissao;
            
            // ✅ Calcular parcelas necessárias (permitindo parcela residual)
            const parcelasCompletas = Math.floor(valorTotalGeral / valorLanceParsed);
            const valorResidual = valorTotalGeral - (parcelasCompletas * valorLanceParsed);
            const parcelasNecessarias = valorResidual > 0 ? parcelasCompletas + 1 : parcelasCompletas;
            
            logger.debug('🔍 [VALIDAÇÃO ENTRADA+PARCELAMENTO - RESIDUAL]', {
              valorLanceParsed,
              fatorParsed,
              valorEntrada,
              valorTotalMercadoria,
              valorComissao,
              valorTotalGeral,
              parcelasCompletas,
              valorResidual,
              parcelasNecessarias,
              somaCalculada,
              valido: somaCalculada === parcelasNecessarias,
              triplas,
              duplas,
              simples
            });
            
            if (somaCalculada !== parcelasNecessarias) return false;
          }
        }
        
        return true;
      case 5: { // Parcelas e Dia (só se não for à vista)
        if (values.tipoPagamento === "a_vista") return true; // Pular validação se for à vista
        // Validar quantidade calculada OU manual (compatibilidade)
        const qtdParcelas = quantidadeParcelasCalculada > 0 ? quantidadeParcelasCalculada : values.quantidadeParcelas;
        // ✅ Validar que o dia esteja entre 1 e 31
        const diaValido = values.diaVencimentoMensal && values.diaVencimentoMensal >= 1 && values.diaVencimentoMensal <= 31;
        return !!(qtdParcelas > 0 && diaValido);
      }
      case 6: { // Mês de Início (só se não for à vista)
        if (values.tipoPagamento === "a_vista") return true; // Pular validação se for à vista
        
        // Validar se a data existe
        if (!values.mesInicioPagamento) return false;
        
        // ✅ Validar compatibilidade: dia da data deve ser igual ao dia do vencimento mensal
        // Parse da data ISO ignorando fuso horário
        const [ano, mes, dia] = values.mesInicioPagamento.split('-').map(Number);
        const diaDataInicio = dia;
        
        if (diaDataInicio !== values.diaVencimentoMensal) {
          return false; // Incompatibilidade!
        }
        
        return true;
      }
      case 7: // Status do Pagamento (Parcelas Pagas)
        return values.parcelasPagas !== undefined; // Validar se foi preenchido
      case 8: // Juros em Caso de Atraso
        return values.percentualJurosAtraso !== undefined; // Validar se foi preenchido
      case 9: // Documentos
        return true; // Opcional
      default:
        return true;
    }
  };

  const handleNext = () => {
    setAttemptedNext(true);
    
    if (!validateCurrentStep()) {
      // Não avança - a validação já mostra o indicador visual
      return;
    }
    
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
      setAttemptedNext(false); // Reset ao avançar com sucesso
    }
  };

  const goToStep = (stepIndex: number) => {
    setCurrentStep(stepIndex);
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
      setAttemptedNext(false); // Reset ao voltar
    }
  };

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      if (onCancel) onCancel();
    }, 300);
  };

  const handleSubmit = async () => {
    // Prevenir múltiplos cliques
    if (isSubmitting) return;
    
    setIsSubmitting(true);
    try {
      // Calcular valorPagar baseado no tipo de pagamento
      let valorPagarFinal = values.valorPagar;
      
      if (values.tipoPagamento === "parcelamento" || values.tipoPagamento === "entrada_parcelamento") {
        // Calcular automaticamente pelo fator multiplicador
        if (values.valorLance && values.fatorMultiplicador) {
          const valorLanceParsed = parseBrazilianNumber(values.valorLance);
          const fatorParsed = parseBrazilianNumber(values.fatorMultiplicador);
          if (valorLanceParsed && fatorParsed) {
            let valorCalculado = calcularValorTotal(valorLanceParsed, fatorParsed);
            
            // ✅ Para entrada + parcelamento, adicionar a entrada ao cálculo da comissão
            if (values.tipoPagamento === "entrada_parcelamento" && values.valorEntrada) {
              const valorEntradaParsed = parseBrazilianNumber(values.valorEntrada);
              if (valorEntradaParsed && valorEntradaParsed > 0) {
                valorCalculado = valorCalculado + valorEntradaParsed;
              }
            }
            
            // ✅ Aplicar comissão sobre o valor total (entrada + parcelas)
            const percentualComissao = initial.auction?.percentualComissaoLeiloeiro || 0;
            if (percentualComissao > 0) {
              valorCalculado = valorCalculado * (1 + percentualComissao / 100);
            }
            
            valorPagarFinal = valorCalculado.toFixed(2);
          }
        }
      } else if (values.tipoPagamento === "a_vista") {
        // ✅ Aplicar comissão também para pagamento à vista
        if (values.valorPagar) {
          const valorPagarParsed = parseBrazilianNumber(values.valorPagar);
          if (valorPagarParsed && valorPagarParsed > 0) {
            let valorCalculado = valorPagarParsed;
            
            // Aplicar comissão do leiloeiro se houver
            const percentualComissao = initial.auction?.percentualComissaoLeiloeiro || 0;
            if (percentualComissao > 0) {
              valorCalculado = valorCalculado * (1 + percentualComissao / 100);
            }
            
            valorPagarFinal = valorCalculado.toFixed(2);
          }
        }
      }

      // Usar quantidade de parcelas calculada automaticamente
      const quantidadeParcelasFinal = quantidadeParcelasCalculada > 0 
        ? quantidadeParcelasCalculada 
        : values.quantidadeParcelas;

      logger.debug('💾 CONDIÇÕES DE PAGAMENTO - Values:', {
        tipoPagamento: values.tipoPagamento,
        dataVencimentoVista: values.dataVencimentoVista,
        dataEntrada: values.dataEntrada,
        valorLance: values.valorLance,
        fatorMultiplicador: values.fatorMultiplicador,
        usaFatorMultiplicador: values.usaFatorMultiplicador,
        parcelasTriplas: values.parcelasTriplas,
        parcelasDuplas: values.parcelasDuplas,
        parcelasSimples: values.parcelasSimples
      });

      const arrematanteData: Partial<ArrematanteInfo> = {
        id: selectedArrematanteId || initial.arrematante?.id || undefined, // ✅ Incluir ID do arrematante selecionado
        nome: values.nome,
        documento: values.documento || undefined,
        telefone: values.telefone ? `${values.codigoPais} ${values.telefone}` : undefined,
        email: values.email || undefined,
        endereco: values.endereco || undefined,
        // ✅ Campos de endereço detalhados
        cep: values.cep || undefined,
        rua: values.rua || undefined,
        numero: values.numero || undefined,
        complemento: values.complemento || undefined,
        bairro: values.bairro || undefined,
        cidade: values.cidade || undefined,
        estado: values.estado || undefined,
        loteId: values.loteId || undefined,
        mercadoriaId: undefined, // Arrematante arremata o lote completo
        tipoPagamento: values.tipoPagamento,
        valorPagar: valorPagarFinal,
        valorPagarNumerico: parseCurrencyToNumber(valorPagarFinal),
        valorEntrada: values.valorEntrada || undefined,
        quantidadeParcelas: quantidadeParcelasFinal, // ✅ Usando valor calculado
        mesInicioPagamento: values.mesInicioPagamento,
        diaVencimentoMensal: values.diaVencimentoMensal,
        parcelasPagas: values.parcelasPagas,
        percentualJurosAtraso: values.percentualJurosAtraso,
        tipoJurosAtraso: "composto", // Sempre juros compostos
        documentos: values.documentos,
        pago: values.pago,
        dataVencimentoVista: values.dataVencimentoVista,
        dataEntrada: values.dataEntrada,
        // Campos do sistema de fator multiplicador (para parcelamento e entrada_parcelamento)
        ...((values.tipoPagamento === "parcelamento" || values.tipoPagamento === "entrada_parcelamento") && {
          valorLance: parseBrazilianNumber(values.valorLance),
          fatorMultiplicador: parseBrazilianNumber(values.fatorMultiplicador),
          usaFatorMultiplicador: true,
          // ✅ CORREÇÃO: Garantir que sejam números válidos ou undefined (nunca strings ou arrays)
          parcelasTriplas: typeof values.parcelasTriplas === 'number' ? values.parcelasTriplas : undefined,
          parcelasDuplas: typeof values.parcelasDuplas === 'number' ? values.parcelasDuplas : undefined,
          parcelasSimples: typeof values.parcelasSimples === 'number' ? values.parcelasSimples : undefined,
        }),
      };
      
      logger.debug('💾 CONDIÇÕES DE PAGAMENTO - arrematanteData:', {
        tipoPagamento: arrematanteData.tipoPagamento,
        dataVencimentoVista: arrematanteData.dataVencimentoVista,
        dataEntrada: arrematanteData.dataEntrada,
        valorLance: arrematanteData.valorLance,
        fatorMultiplicador: arrematanteData.fatorMultiplicador,
        usaFatorMultiplicador: arrematanteData.usaFatorMultiplicador,
        parcelasTriplas: arrematanteData.parcelasTriplas,
        parcelasDuplas: arrematanteData.parcelasDuplas,
        parcelasSimples: arrematanteData.parcelasSimples
      });
      
      logger.debug('📋 DADOS COMPLETOS DO ARREMATANTE:', arrematanteData);
      
      await onSubmit(arrematanteData);
      
      logger.debug('✅ [Wizard] onSubmit concluído com sucesso');
      
      // ✅ NÃO chamar handleClose() - o componente pai vai fechar
      // handleClose() pode causar conflitos com o fechamento do pai
    } catch (error) {
      logger.error('❌ [Wizard] Erro ao submeter formulário:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    const maxFiles = 20;
    if (files.length > maxFiles) {
      event.target.value = '';
      return;
    }

    const newDocs: DocumentoInfo[] = [];
    const erros: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const maxSize = 20 * 1024 * 1024;
        if (file.size > maxSize) throw new Error(`Muito grande (máx. 20MB)`);
        if (file.size === 0) throw new Error(`Arquivo vazio`);

        const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_').replace(/\.{2,}/g, '_').substring(0, 255);
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
        
        newDocs.push({
          id: Date.now().toString() + i,
          nome: safeName,
          tipo: file.type,
          tamanho: file.size,
          dataUpload: new Date().toISOString(),
          url: base64,
        });
      } catch (error) {
        erros.push(`${file.name}: ${error instanceof Error ? error.message : 'Erro'}`);
      }
    }

    if (newDocs.length > 0) {
      updateField("documentos", [...values.documentos, ...newDocs]);
    }

    if (erros.length > 0) {
      logger.warn('Alguns arquivos foram rejeitados:', erros);
    }

    event.target.value = '';
  };

  const removeDocument = (id: string) => {
    const doc = values.documentos.find(d => d.id === id);
    // ✅ Não precisa mais revogar blob URLs, pois agora usamos Base64
    if (doc?.url && doc.url.startsWith('blob:')) {
      URL.revokeObjectURL(doc.url);
    }
    updateField("documentos", values.documentos.filter(d => d.id !== id));
  };

  // Funções para upload e remoção de documentos na divisão
  const handleFileUploadDivisao = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    const maxFiles = 20;
    if (files.length > maxFiles) {
      event.target.value = '';
      return;
    }

    const newDocs: DocumentoInfo[] = [];
    const erros: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const maxSize = 20 * 1024 * 1024;
        if (file.size > maxSize) throw new Error(`Muito grande (máx. 20MB)`);
        if (file.size === 0) throw new Error(`Arquivo vazio`);

        const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_').replace(/\.{2,}/g, '_').substring(0, 255);
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
        
        newDocs.push({
          id: Date.now().toString() + i,
          nome: safeName,
          tipo: file.type,
          tamanho: file.size,
          dataUpload: new Date().toISOString(),
          url: base64,
        });
      } catch (error) {
        erros.push(`${file.name}: ${error instanceof Error ? error.message : 'Erro'}`);
      }
    }

    // Atualizar documentos do arrematante atual na divisão
    setArrematantesDivisao(prev => {
      const updated = [...prev];
      const currentArr = updated[divisaoStep - 1];
      if (currentArr) {
        currentArr.documentos = [...(currentArr.documentos || []), ...newDocs];
      }
      return updated;
    });
    
    event.target.value = '';
  };

  const removeDocumentDivisao = (id: string) => {
    setArrematantesDivisao(prev => {
      const updated = [...prev];
      const currentArr = updated[divisaoStep - 1];
      if (currentArr) {
        const doc = currentArr.documentos?.find(d => d.id === id);
        if (doc?.url && doc.url.startsWith('blob:')) {
          URL.revokeObjectURL(doc.url);
        }
        currentArr.documentos = (currentArr.documentos || []).filter(d => d.id !== id);
      }
      return updated;
    });
  };

  // Função para finalizar a divisão e salvar todos os arrematantes
  const handleFinalizarDivisao = async () => {
    setIsSubmitting(true);
    try {
      // Array para armazenar todos os arrematantes (principal + divisão)
      const todosArrematantes: Partial<ArrematanteInfo>[] = [];

      // Verificar se o arrematante principal já foi salvo (existe no banco)
      const arrematantePrincipalJaSalvo = initial.auction?.arrematantes?.some(
        arr => arr.mercadoriaId === values.mercadoriaId && arr.id === (selectedArrematanteId || initial.arrematante?.id)
      );

      // 1. Adicionar o arrematante principal (que está sendo preenchido no formulário) apenas se ainda não foi salvo
      const valorPagarPrincipal = values.tipoPagamento === "parcelamento" || values.tipoPagamento === "entrada_parcelamento"
        ? (() => {
            if (values.valorLance && values.fatorMultiplicador) {
              const valorLanceParsed = parseBrazilianNumber(values.valorLance);
              const fatorParsed = parseBrazilianNumber(values.fatorMultiplicador);
              if (valorLanceParsed && fatorParsed) {
                let valorCalculado = calcularValorTotal(valorLanceParsed, fatorParsed);
                
                // Aplicar comissão do leiloeiro se houver
                const percentualComissao = initial.auction?.percentualComissaoLeiloeiro || 0;
                if (percentualComissao > 0) {
                  valorCalculado = valorCalculado * (1 + percentualComissao / 100);
                }
                
                return valorCalculado.toFixed(2);
              }
            }
            return values.valorPagar;
          })()
        : values.valorPagar;

      const quantidadeParcelasPrincipal = obterQuantidadeTotalParcelas(
        values.parcelasTriplas,
        values.parcelasDuplas,
        values.parcelasSimples
      );

      const arrematantePrincipal: Partial<ArrematanteInfo> = {
        id: selectedArrematanteId || initial.arrematante?.id || undefined,
        nome: values.nome,
        documento: values.documento || undefined,
        telefone: values.telefone ? `${values.codigoPais} ${values.telefone}` : undefined,
        email: values.email || undefined,
        cep: values.cep || undefined,
        rua: values.rua || undefined,
        numero: values.numero || undefined,
        complemento: values.complemento || undefined,
        bairro: values.bairro || undefined,
        cidade: values.cidade || undefined,
        estado: values.estado || undefined,
        loteId: values.loteId || undefined,
        mercadoriaId: undefined, // Arrematante arremata o lote completo
        tipoPagamento: values.tipoPagamento,
        valorPagar: valorPagarPrincipal,
        valorPagarNumerico: parseCurrencyToNumber(valorPagarPrincipal),
        valorEntrada: values.valorEntrada || undefined,
        quantidadeParcelas: quantidadeParcelasPrincipal > 0 ? quantidadeParcelasPrincipal : values.quantidadeParcelas,
        mesInicioPagamento: values.mesInicioPagamento,
        diaVencimentoMensal: values.diaVencimentoMensal,
        parcelasPagas: values.parcelasPagas,
        percentualJurosAtraso: values.percentualJurosAtraso,
        tipoJurosAtraso: "composto",
        documentos: values.documentos,
        pago: values.pago,
        dataVencimentoVista: values.dataVencimentoVista,
        dataEntrada: values.dataEntrada,
        ...((values.tipoPagamento === "parcelamento" || values.tipoPagamento === "entrada_parcelamento") && {
          valorLance: parseBrazilianNumber(values.valorLance),
          fatorMultiplicador: parseBrazilianNumber(values.fatorMultiplicador),
          usaFatorMultiplicador: true,
          parcelasTriplas: typeof values.parcelasTriplas === 'number' ? values.parcelasTriplas : undefined,
          parcelasDuplas: typeof values.parcelasDuplas === 'number' ? values.parcelasDuplas : undefined,
          parcelasSimples: typeof values.parcelasSimples === 'number' ? values.parcelasSimples : undefined,
        }),
      };

      // Só adiciona o arrematante principal se ele ainda não foi salvo
      if (!arrematantePrincipalJaSalvo) {
        todosArrematantes.push(arrematantePrincipal);
      }

      // 2. Adicionar os arrematantes da divisão (sempre adiciona, pois são novos)
      for (const arrDivisao of arrematantesDivisao) {
        const valorPagarDivisao = arrDivisao.tipoPagamento === "parcelamento" || arrDivisao.tipoPagamento === "entrada_parcelamento"
          ? (() => {
              if (arrDivisao.valorLance && arrDivisao.fatorMultiplicador) {
                const valorLanceParsed = parseBrazilianNumber(arrDivisao.valorLance);
                const fatorParsed = parseBrazilianNumber(arrDivisao.fatorMultiplicador);
                if (valorLanceParsed && fatorParsed) {
                  let valorCalculado = calcularValorTotal(valorLanceParsed, fatorParsed);
                  
                  // Aplicar comissão do leiloeiro se houver
                  const percentualComissao = initial.auction?.percentualComissaoLeiloeiro || 0;
                  if (percentualComissao > 0) {
                    valorCalculado = valorCalculado * (1 + percentualComissao / 100);
                  }
                  
                  return valorCalculado.toFixed(2);
                }
              }
              return arrDivisao.valorPagar || '';
            })()
          : arrDivisao.valorPagar || '';

        const quantidadeParcelasDivisao = obterQuantidadeTotalParcelas(
          arrDivisao.parcelasTriplas,
          arrDivisao.parcelasDuplas,
          arrDivisao.parcelasSimples
        );

        const arrematante: Partial<ArrematanteInfo> = {
          nome: arrDivisao.nome,
          documento: arrDivisao.documento || undefined,
          telefone: arrDivisao.telefone ? `${arrDivisao.codigoPais || '+55'} ${arrDivisao.telefone}` : undefined,
          email: arrDivisao.email || undefined,
          cep: arrDivisao.cep || undefined,
          rua: arrDivisao.rua || undefined,
          numero: arrDivisao.numero || undefined,
          complemento: arrDivisao.complemento || undefined,
          bairro: arrDivisao.bairro || undefined,
          cidade: arrDivisao.cidade || undefined,
          estado: arrDivisao.estado || undefined,
          loteId: values.loteId || undefined, // Mesmo lote/mercadoria que o principal
          mercadoriaId: undefined, // Arrematante arremata o lote completo
          tipoPagamento: (arrDivisao.tipoPagamento as "a_vista" | "parcelamento" | "entrada_parcelamento") || "parcelamento",
          valorPagar: valorPagarDivisao,
          valorPagarNumerico: parseCurrencyToNumber(valorPagarDivisao),
          valorEntrada: arrDivisao.valorEntrada || undefined,
          quantidadeParcelas: quantidadeParcelasDivisao > 0 ? quantidadeParcelasDivisao : 12,
          mesInicioPagamento: values.mesInicioPagamento, // Usar mesmo mês que o principal
          diaVencimentoMensal: values.diaVencimentoMensal, // Usar mesmo dia que o principal
          parcelasPagas: 0,
          percentualJurosAtraso: values.percentualJurosAtraso, // Usar mesmo percentual que o principal
          tipoJurosAtraso: "composto",
          documentos: arrDivisao.documentos || [],
          pago: false,
          dataVencimentoVista: arrDivisao.dataVencimentoVista,
          dataEntrada: arrDivisao.dataEntrada,
          ...((arrDivisao.tipoPagamento === "parcelamento" || arrDivisao.tipoPagamento === "entrada_parcelamento") && {
            valorLance: parseBrazilianNumber(arrDivisao.valorLance),
            fatorMultiplicador: parseBrazilianNumber(arrDivisao.fatorMultiplicador),
            usaFatorMultiplicador: true,
            parcelasTriplas: typeof arrDivisao.parcelasTriplas === 'number' ? arrDivisao.parcelasTriplas : undefined,
            parcelasDuplas: typeof arrDivisao.parcelasDuplas === 'number' ? arrDivisao.parcelasDuplas : undefined,
            parcelasSimples: typeof arrDivisao.parcelasSimples === 'number' ? arrDivisao.parcelasSimples : undefined,
          }),
        };

        todosArrematantes.push(arrematante);
      }

      logger.debug('💾 Salvando divisão com arrematantes:', todosArrematantes);

      // 3. Salvar todos os arrematantes
      for (const arrematante of todosArrematantes) {
        await onSubmit(arrematante);
      }

      logger.debug('✅ Divisão finalizada com sucesso!');
      
      // Fechar wizard de divisão
      setShowDivisaoWizard(false);
      setDivisaoStep(0);
      setArrematantesDivisao([]);
      setShowPreview(false);
      setArrematanteSubStep(0);
      setSelectedDocIndexDivisao(0);
      
      // Mensagem de sucesso
      const totalArrematantes = arrematantesExistentesDivisao.length + todosArrematantes.length;
      if (todosArrematantes.length > 0) {
        alert(`✅ ${todosArrematantes.length} ${todosArrematantes.length === 1 ? 'novo arrematante adicionado' : 'novos arrematantes adicionados'}! Total: ${totalArrematantes} arrematantes nesta mercadoria.`);
      } else {
        alert('✅ Divisão atualizada com sucesso!');
      }
      
      // Fechar o wizard principal para recarregar a lista de arrematantes
      if (onCancel) {
        onCancel();
      }
      
    } catch (error) {
      logger.error('❌ Erro ao finalizar divisão:', error);
      alert('❌ Erro ao salvar a divisão. Por favor, tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const allSteps = [
    {
      id: "nome-documento",
      title: "Identificação",
      content: (
        <div className="space-y-8">
          {/* Botão Importar (apenas se for novo arrematante E existirem arrematantes) */}
          {isNewArrematante && initial.auction?.arrematantes && initial.auction.arrematantes.length > 0 && (
            <div className="pb-4">
              <button
                type="button"
                onClick={() => setShowImportModal(true)}
                className="text-gray-700 hover:text-gray-900 font-medium text-sm hover:underline decoration-gray-700 underline-offset-4 transition-all"
              >
                Importar Dados de Arrematante Existente
              </button>
            </div>
          )}
          
          <div className="space-y-3">
            <Label className="text-lg font-normal text-gray-600">Qual o nome do arrematante?</Label>
            <Input
              type="text"
              placeholder="Ex: João Silva"
              value={values.nome}
              onChange={(e) => updateField("nome", e.target.value)}
              className="wizard-input h-14 text-base border-0 border-b-2 border-gray-200 rounded-none focus-visible:border-gray-800 focus-visible:ring-0 focus-visible:outline-none px-0 bg-transparent placeholder:text-gray-400"
            />
          </div>

          <div className="space-y-3">
            <Label className="text-lg font-normal text-gray-600">CPF ou CNPJ</Label>
            <Input
              type="text"
              placeholder="Ex: 000.000.000-00 ou 00.000.000/0000-00"
              value={values.documento}
              onChange={(e) => {
                const formatted = formatCpfCnpj(e.target.value);
                updateField("documento", formatted);
              }}
              className="wizard-input h-14 text-base border-0 border-b-2 border-gray-200 rounded-none focus-visible:border-gray-800 focus-visible:ring-0 focus-visible:outline-none px-0 bg-transparent placeholder:text-gray-400"
            />
          </div>
        </div>
      )
    },
    {
      id: "contato",
      title: "Contato",
      content: (
        <div className="space-y-8">
          <div className="space-y-3">
            <Label className="text-lg font-normal text-gray-600">Telefone</Label>
            <div className="flex items-end gap-3">
              <Select
                value={values.codigoPais}
                onValueChange={(v) => updateField("codigoPais", v)}
              >
                <SelectTrigger className="w-[180px] h-14 text-base border-0 border-b-2 border-gray-200 rounded-none focus:border-black focus-visible:border-black focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none px-0 bg-transparent [&>span]:flex [&>span]:items-center [&>span]:gap-2">
                  <SelectValue>
                    <FlagIcon countryCode={values.codigoPais} />
                    <span>{values.codigoPais}</span>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent 
                  position="popper" 
                  sideOffset={5} 
                  className="z-[100000] max-h-[300px] overflow-auto [&_*[role=option]>span]:flex [&_*[role=option]>span]:items-center [&_*[role=option]>span]:gap-2 [&_*[role=option]>span]:justify-start"
                >
                  {COUNTRY_CODES.map((region) => (
                    <SelectGroup key={region.region}>
                      <SelectLabel className="ps-2 text-xs font-semibold text-gray-500">
                        {region.region}
                      </SelectLabel>
                      {region.countries.map((country) => (
                        <SelectItem 
                          key={`${country.code}-${country.country}`} 
                          value={country.code}
                          data-country={country.country}
                        >
                          <FlagIcon countryCode={country.code} countryName={country.country} />
                          <span className="truncate">{country.code} - {country.country}</span>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
                </SelectContent>
              </Select>
              
            <Input
              type="text"
                placeholder={(() => {
                  switch(values.codigoPais) {
                    case '+55': return "(11) 98765-4321";
                    case '+1': return "(555) 123-4567";
                    case '+54': return "(11) 1234-5678";
                    case '+52': return "(55) 1234-5678";
                    case '+56': return "9 8765-4321";
                    case '+57': return "(300) 123-4567";
                    case '+595': return "(21) 123-456";
                    case '+598': return "(99) 123-456";
                    case '+351': return "912 345 678";
                    case '+34': return "612 345 678";
                    case '+33': return "06 12 34 56 78";
                    case '+49': return "1511 1234567";
                    case '+44': return "7700 123456";
                    case '+86': return "138-0000-0000";
                    case '+81': return "090-1234-5678";
                    case '+82': return "010-1234-5678";
                    case '+91': return "98765-43210";
                    default: return "Digite o número";
                  }
                })()}
              value={values.telefone}
                onChange={(e) => {
                  const formatted = formatTelefone(e.target.value, values.codigoPais);
                  updateField("telefone", formatted);
                }}
                className="flex-1 wizard-input h-14 text-base border-0 border-b-2 border-gray-200 rounded-none focus-visible:border-gray-800 focus-visible:ring-0 focus-visible:outline-none px-0 bg-transparent placeholder:text-gray-400"
            />
            </div>
          </div>

          <div className="space-y-3">
            <Label className="text-lg font-normal text-gray-600">E-mail</Label>
            <Input
              type="email"
              placeholder="Ex: joao@email.com"
              value={values.email}
              onChange={(e) => updateField("email", e.target.value)}
              className="wizard-input h-14 text-base border-0 border-b-2 border-gray-200 rounded-none focus-visible:border-gray-800 focus-visible:ring-0 focus-visible:outline-none px-0 bg-transparent placeholder:text-gray-400"
            />
            {attemptedNext && values.email && !isValidEmail(values.email) && (
              <p className="text-sm text-red-600 flex items-center gap-1">
                <AlertCircle className="h-4 w-4" />
                E-mail inválido. Use o formato: exemplo@dominio.com
              </p>
            )}
          </div>
        </div>
      )
    },
    {
      id: "endereco",
      title: "Endereço",
      content: (
        <div className="space-y-6">
          <div className="space-y-3">
            <Label className="text-lg font-normal text-gray-600">CEP</Label>
            <Input
              type="text"
              placeholder="Ex: 12345-678"
              value={values.cep}
              onChange={(e) => {
                const formatted = formatCep(e.target.value);
                updateField("cep", formatted);
                setCepError(null);
                if (formatted.replace(/\D/g, '').length === 8) {
                  buscarCep(formatted);
                }
              }}
              disabled={loadingCep}
              className="wizard-input h-14 text-base border-0 border-b-2 border-gray-200 rounded-none focus-visible:border-gray-800 focus-visible:ring-0 focus-visible:outline-none px-0 bg-transparent placeholder:text-gray-400"
            />
            {loadingCep && <p className="text-sm text-gray-500">Buscando CEP...</p>}
            {cepError && (
              <p className="text-sm text-red-600 flex items-center gap-1">
                <AlertCircle className="h-4 w-4" />
                {cepError}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-3 col-span-2">
              <Label className="text-lg font-normal text-gray-600">Rua</Label>
              <Input
                type="text"
                placeholder="Ex: Rua das Flores"
                value={values.rua}
                onChange={(e) => updateField("rua", e.target.value)}
                className="wizard-input h-14 text-base border-0 border-b-2 border-gray-200 rounded-none focus-visible:border-gray-800 focus-visible:ring-0 focus-visible:outline-none px-0 bg-transparent placeholder:text-gray-400"
              />
            </div>

            <div className="space-y-3">
              <Label className="text-lg font-normal text-gray-600">Número</Label>
              <Input
                type="text"
                placeholder="Ex: 123"
                value={values.numero}
                onChange={(e) => updateField("numero", e.target.value)}
                className="wizard-input h-14 text-base border-0 border-b-2 border-gray-200 rounded-none focus-visible:border-gray-800 focus-visible:ring-0 focus-visible:outline-none px-0 bg-transparent placeholder:text-gray-400"
              />
            </div>

            <div className="space-y-3">
              <Label className="text-lg font-normal text-gray-600">Complemento</Label>
              <Input
                type="text"
                placeholder="Ex: Apto 101 (opcional)"
                value={values.complemento}
                onChange={(e) => updateField("complemento", e.target.value)}
                className="wizard-input h-14 text-base border-0 border-b-2 border-gray-200 rounded-none focus-visible:border-gray-800 focus-visible:ring-0 focus-visible:outline-none px-0 bg-transparent placeholder:text-gray-400"
              />
            </div>

            <div className="space-y-3">
              <Label className="text-lg font-normal text-gray-600">Bairro</Label>
              <Input
                type="text"
                placeholder="Ex: Centro"
                value={values.bairro}
                onChange={(e) => updateField("bairro", e.target.value)}
                className="wizard-input h-14 text-base border-0 border-b-2 border-gray-200 rounded-none focus-visible:border-gray-800 focus-visible:ring-0 focus-visible:outline-none px-0 bg-transparent placeholder:text-gray-400"
              />
            </div>

            <div className="space-y-3">
              <Label className="text-lg font-normal text-gray-600">Cidade</Label>
              <Input
                type="text"
                placeholder="Ex: São Paulo"
                value={values.cidade}
                onChange={(e) => updateField("cidade", e.target.value)}
                className="wizard-input h-14 text-base border-0 border-b-2 border-gray-200 rounded-none focus-visible:border-gray-800 focus-visible:ring-0 focus-visible:outline-none px-0 bg-transparent placeholder:text-gray-400"
              />
            </div>

            <div className="space-y-3">
              <Label className="text-lg font-normal text-gray-600">Estado</Label>
              <Input
                type="text"
                placeholder="Ex: SP"
                value={values.estado}
                onChange={(e) => updateField("estado", e.target.value.toUpperCase())}
                maxLength={2}
                className="wizard-input h-14 text-base border-0 border-b-2 border-gray-200 rounded-none focus-visible:border-gray-800 focus-visible:ring-0 focus-visible:outline-none px-0 bg-transparent placeholder:text-gray-400"
              />
            </div>
          </div>
        </div>
      )
    },
    {
      id: "lote",
      title: "Lote Arrematado",
      content: (
        <div className="space-y-8">
          <div className="space-y-3">
            <Label className="text-lg font-normal text-gray-600">Selecione o lote</Label>
            <Select
              value={values.loteId}
              onValueChange={(v) => {
                updateField("loteId", v);
              }}
            >
              <SelectTrigger className="h-14 text-base border-0 border-b-2 border-gray-200 rounded-none focus:border-gray-800 focus-visible:ring-0 focus-visible:outline-none focus:outline-none active:outline-none outline-none ring-0 px-0 bg-transparent [&:focus]:ring-0 [&:active]:ring-0">
                <SelectValue placeholder="Selecione o lote" />
              </SelectTrigger>
              <SelectContent position="popper" sideOffset={5} className="z-[100000] max-h-[300px] overflow-auto">
                {initial.lotes.map((lote) => (
                  <SelectItem key={lote.id} value={lote.id}>
                    Lote {lote.numero} - {lote.descricao || "Sem descrição"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {values.loteId && infoLoteSelecionado && (() => {
            // Verificar se o LOTE já foi arrematado (não mercadorias individuais)
            const arrematantesExistentes = initial.auction?.arrematantes || [];
            const arrematanteAtualId = values.id || initial.arrematante?.id || selectedArrematanteId;
            
            // Verificar se outro arrematante já arrematou este lote
            const loteJaArrematado = arrematantesExistentes
              .filter(arr => {
                // Se estiver editando, permitir o próprio arrematante
                if (arrematanteAtualId) {
                  return arr.id !== arrematanteAtualId;
                }
                return true;
              })
              .some(arr => arr.loteId === values.loteId);
            
            // Se lote já foi arrematado
            if (loteJaArrematado) {
              return (
                <p className="text-sm text-red-600">
                  Este lote já foi arrematado por outro participante. Por favor, selecione outro lote ou edite o arrematante existente.
                </p>
              );
            }
            
            // Lote disponível - não mostrar nada aqui (informações aparecem no card de resumo abaixo)
            return null;
          })()}

          {values.loteId && infoLoteSelecionado && (
            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div className="space-y-3 text-sm text-gray-600">
                <p>
                  <span className="font-medium">Leilão:</span> {initial.auctionName}
                </p>
                <p>
                  <span className="font-medium">Lote:</span> {infoLoteSelecionado.lote.numero} - {infoLoteSelecionado.lote.descricao}
                </p>
                {infoLoteSelecionado.lote.mercadorias && infoLoteSelecionado.lote.mercadorias.length > 0 && (
                  <div>
                    <span className="font-medium">Mercadorias incluídas ({infoLoteSelecionado.lote.mercadorias.length}):</span>
                    <ul className="mt-2 space-y-1 list-disc list-inside ml-2">
                      {infoLoteSelecionado.lote.mercadorias.map((merc, idx) => (
                        <li key={idx}>
                          {merc.titulo || merc.descricao}
                          {merc.quantidade && ` (${merc.quantidade} unidades)`}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )
    },
    {
      id: "condicoes-pagamento",
      title: "Condições de Pagamento",
      content: (
        <div className="space-y-8">
          <div className="space-y-3">
            <Label className="text-lg font-normal text-gray-600">Como deseja pagar?</Label>
            <Select
              value={values.tipoPagamento}
              onValueChange={(v) => updateField("tipoPagamento", v as "a_vista" | "parcelamento" | "entrada_parcelamento")}
            >
              <SelectTrigger className="h-14 text-base border-0 border-b-2 border-gray-200 rounded-none focus:border-gray-800 focus-visible:ring-0 focus-visible:outline-none focus:outline-none active:outline-none outline-none ring-0 px-0 bg-transparent [&:focus]:ring-0 [&:active]:ring-0">
                <SelectValue placeholder="Selecione o tipo de pagamento" />
              </SelectTrigger>
              <SelectContent position="popper" sideOffset={5} className="z-[100000]">
                <SelectItem value="a_vista">À Vista</SelectItem>
                <SelectItem value="parcelamento">Parcelamento</SelectItem>
                <SelectItem value="entrada_parcelamento">Entrada + Parcelamento</SelectItem>
              </SelectContent>
            </Select>
          </div>


          {/* À Vista */}
          {values.tipoPagamento === "a_vista" && (
            <>
              <div className="space-y-3">
                <Label className="text-lg font-normal text-gray-600">Valor a Pagar</Label>
            <Input
              type="text"
              placeholder="Ex: R$ 50.000,00"
              value={values.valorPagar}
              onChange={(e) => updateField("valorPagar", e.target.value)}
              className="wizard-input h-14 text-base border-0 border-b-2 border-gray-200 rounded-none focus-visible:border-gray-800 focus-visible:ring-0 focus-visible:outline-none px-0 bg-transparent placeholder:text-gray-400"
            />
          </div>

          {/* ✅ Card de comissão para pagamento à vista */}
          {values.valorPagar && (() => {
            const valorPagarParsed = parseBrazilianNumber(values.valorPagar);
            if (valorPagarParsed && valorPagarParsed > 0) {
              // Aplicar comissão do leiloeiro se houver
              const percentualComissao = initial.auction?.percentualComissaoLeiloeiro || 0;
              const valorComComissao = percentualComissao > 0 
                ? valorPagarParsed * (1 + percentualComissao / 100)
                : valorPagarParsed;
              
              return (
                <>
                  {percentualComissao > 0 && (
                    <p className="text-sm text-gray-600 italic">
                      Comissão do leiloeiro de {percentualComissao}% já incluída no valor total
                    </p>
                  )}
                  
                  <div className="space-y-1 text-sm text-gray-600">
                    <div className="flex justify-between">
                      <span>Mercadoria</span>
                      <span>{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valorPagarParsed)}</span>
                    </div>
                    {percentualComissao > 0 && (
                      <div className="flex justify-between">
                        <span>Comissão de Compra ({percentualComissao}%)</span>
                        <span>+{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valorComComissao - valorPagarParsed)}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-medium text-gray-900 pt-1 border-t border-gray-200">
                      <span>Total</span>
                      <span>{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valorComComissao)}</span>
                    </div>
                  </div>
                </>
              );
            }
            return null;
          })()}

          <div className="space-y-3">
                <Label className="text-lg font-normal text-gray-600">Data de Pagamento</Label>
                <StringDatePicker
                  value={values.dataVencimentoVista || ""}
                  onChange={(v) => updateField("dataVencimentoVista", v)}
                  placeholder="Selecione a data"
                  className="wizard-input h-14 text-base border-0 border-b-2 border-gray-200 rounded-none focus-visible:border-gray-800 focus-visible:ring-0 focus-visible:outline-none px-0 bg-transparent"
                />
              </div>
            </>
          )}

          {/* Entrada + Parcelamento */}
          {values.tipoPagamento === "entrada_parcelamento" && (
            <>
              <div className="space-y-3">
                <Label className="text-lg font-normal text-gray-600">Valor da Entrada</Label>
            <Input
              type="text"
              placeholder="Ex: R$ 5.000,00"
              value={values.valorEntrada}
              onChange={(e) => updateField("valorEntrada", e.target.value)}
              className="wizard-input h-14 text-base border-0 border-b-2 border-gray-200 rounded-none focus-visible:border-gray-800 focus-visible:ring-0 focus-visible:outline-none px-0 bg-transparent placeholder:text-gray-400"
            />
          </div>

              <div className="space-y-3">
                <Label className="text-lg font-normal text-gray-600">Data de pagamento da entrada</Label>
                <StringDatePicker
                  value={values.dataEntrada || ""}
                  onChange={(v) => updateField("dataEntrada", v)}
                  placeholder="Selecione a data"
                  className="wizard-input h-14 text-base border-0 border-b-2 border-gray-200 rounded-none focus-visible:border-gray-800 focus-visible:ring-0 focus-visible:outline-none px-0 bg-transparent"
                />
              </div>
            </>
          )}

          {/* Sistema de Fator Multiplicador - Para parcelamento e entrada_parcelamento */}
          {(values.tipoPagamento === "parcelamento" || values.tipoPagamento === "entrada_parcelamento") && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-3">
                  <Label className="text-lg font-normal text-gray-600">Valor do Lance (R$)</Label>
                  <Input
                    type="text"
                    placeholder="Ex: 1.000,00"
                    value={values.valorLance || ""}
                    onChange={(e) => updateField("valorLance", e.target.value)}
                    className="wizard-input h-14 text-base border-0 border-b-2 border-gray-200 rounded-none focus-visible:border-gray-800 focus-visible:ring-0 focus-visible:outline-none px-0 bg-transparent placeholder:text-gray-400"
                  />
                  {values.valorLance && (() => {
                    const parsed = parseBrazilianNumber(values.valorLance);
                    if (parsed !== undefined && parsed <= 0) {
                      return (
                        <p className="text-sm text-red-600 flex items-center gap-1">
                          <AlertCircle className="h-4 w-4" />
                          O valor do lance deve ser maior que zero
                        </p>
                      );
                    }
                    return null;
                  })()}
                </div>

                <div className="space-y-3">
                  <Label className="text-lg font-normal text-gray-600">Fator Multiplicador</Label>
                  <Input
                    type="text"
                    placeholder="Ex: 30"
                    value={values.fatorMultiplicador || ""}
                    onChange={(e) => updateField("fatorMultiplicador", e.target.value)}
                    className="wizard-input h-14 text-base border-0 border-b-2 border-gray-200 rounded-none focus-visible:border-gray-800 focus-visible:ring-0 focus-visible:outline-none px-0 bg-transparent placeholder:text-gray-400"
                  />
                  {values.fatorMultiplicador && (() => {
                    const parsed = parseBrazilianNumber(values.fatorMultiplicador);
                    if (parsed !== undefined && parsed <= 0) {
                      return (
                        <p className="text-sm text-red-600 flex items-center gap-1">
                          <AlertCircle className="h-4 w-4" />
                          O fator multiplicador deve ser maior que zero
                        </p>
                      );
                    }
                    return null;
                  })()}
                </div>
              </div>

              {values.valorLance && values.fatorMultiplicador && (() => {
                const valorLanceParsed = parseBrazilianNumber(values.valorLance);
                const fatorParsed = parseBrazilianNumber(values.fatorMultiplicador);
                if (valorLanceParsed && fatorParsed && valorLanceParsed > 0 && fatorParsed > 0) {
                  const valorTotalParcelas = calcularValorTotal(valorLanceParsed, fatorParsed);
                  const valorEntrada = values.valorEntrada ? parseBrazilianNumber(values.valorEntrada) : 0;
                  
                  // ✅ Calcular valor total da mercadoria (entrada + parcelas)
                  const valorTotalMercadoria = valorTotalParcelas + (values.tipoPagamento === 'entrada_parcelamento' ? valorEntrada : 0);
                  
                  // ✅ Aplicar comissão sobre o valor total (entrada + parcelas)
                  const percentualComissao = initial.auction?.percentualComissaoLeiloeiro || 0;
                  const valorComissao = percentualComissao > 0 
                    ? valorTotalMercadoria * (percentualComissao / 100)
                    : 0;
                  const valorTotalComComissao = valorTotalMercadoria + valorComissao;
                  
                  return (
                    <>
                      {percentualComissao > 0 && (
                        <p className="text-sm text-gray-600 italic">
                          Comissão de compra de {percentualComissao}% aplicada sobre o valor total
                        </p>
                      )}
                      
                      <div className="space-y-1 text-sm text-gray-600">
                        {values.tipoPagamento === 'entrada_parcelamento' && valorEntrada > 0 && (
                          <div className="flex justify-between">
                            <span>Entrada</span>
                            <span>{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valorEntrada)}</span>
                    </div>
                        )}
                        
                        <div className="flex justify-between">
                          <span>Parcelas</span>
                          <span>{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valorTotalParcelas)}</span>
                        </div>
                        
                        <div className="flex justify-between font-medium text-gray-900 pt-1 border-t border-gray-200">
                          <span>Subtotal Mercadoria</span>
                          <span>{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valorTotalMercadoria)}</span>
                        </div>
                        
                        {percentualComissao > 0 && (
                          <div className="flex justify-between">
                            <span>Comissão de Compra ({percentualComissao}%)</span>
                            <span>+{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valorComissao)}</span>
                          </div>
                        )}
                        
                        <div className="flex justify-between font-medium text-gray-900 pt-1 border-t border-gray-200">
                          <span>Total Geral</span>
                          <span>{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valorTotalComComissao)}</span>
                    </div>
                      </div>
                    </>
                  );
                }
                return null;
              })()}

              <div className="space-y-4">
                <Label className="text-lg font-normal text-gray-900">Configuração de Parcelas</Label>
                
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm text-gray-600">Parcelas Triplas</Label>
                    <Input
                      type="number"
                      min="0"
                      placeholder="0"
                      value={values.parcelasTriplas || ""}
                      onChange={(e) => {
                        const value = e.target.value === "" ? undefined : parseInt(e.target.value);
                        updateField("parcelasTriplas", value);
                      }}
                      className="h-12 text-sm focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus:border-black focus-visible:border-black"
                    />
                    <p className="text-xs text-gray-400">Valor × 3</p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm text-gray-600">Parcelas Duplas</Label>
                    <Input
                      type="number"
                      min="0"
                      placeholder="0"
                      value={values.parcelasDuplas || ""}
                      onChange={(e) => {
                        const value = e.target.value === "" ? undefined : parseInt(e.target.value);
                        updateField("parcelasDuplas", value);
                      }}
                      className="h-12 text-sm focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus:border-black focus-visible:border-black"
                    />
                    <p className="text-xs text-gray-400">Valor × 2</p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm text-gray-600">Parcelas Simples</Label>
                    <Input
                      type="number"
                      min="0"
                      placeholder="0"
                      value={values.parcelasSimples || ""}
                      onChange={(e) => {
                        const value = e.target.value === "" ? undefined : parseInt(e.target.value);
                        updateField("parcelasSimples", value);
                      }}
                      className="h-12 text-sm focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus:border-black focus-visible:border-black"
                    />
                    <p className="text-xs text-gray-400">Valor × 1</p>
                  </div>
                </div>

                {/* Validação de compatibilidade das parcelas */}
                {values.valorLance && values.fatorMultiplicador && (() => {
                  const valorLanceParsed = parseBrazilianNumber(values.valorLance);
                  const fatorParsed = parseBrazilianNumber(values.fatorMultiplicador);
                  if (!valorLanceParsed || !fatorParsed) return null;
                  
                  // ✅ Calcular valor total em reais
                  const valorTotalParcelas = calcularValorTotal(valorLanceParsed, fatorParsed);
                  const valorEntradaParsed = values.valorEntrada ? parseBrazilianNumber(values.valorEntrada) : 0;
                  const valorEntrada = valorEntradaParsed && valorEntradaParsed > 0 ? valorEntradaParsed : 0;
                  const valorTotalMercadoria = valorTotalParcelas + (values.tipoPagamento === 'entrada_parcelamento' ? valorEntrada : 0);
                  
                  const percentualComissao = initial.auction?.percentualComissaoLeiloeiro || 0;
                  const valorComissao = percentualComissao > 0 ? valorTotalMercadoria * (percentualComissao / 100) : 0;
                  const valorTotalGeral = valorTotalMercadoria + valorComissao;
                  
                  // ✅ Calcular parcelas necessárias (permitindo parcela residual)
                  const parcelasCompletas = Math.floor(valorTotalGeral / valorLanceParsed);
                  const valorResidual = valorTotalGeral - (parcelasCompletas * valorLanceParsed);
                  const parcelasNecessarias = valorResidual > 0 ? parcelasCompletas + 1 : parcelasCompletas;
                  
                  const triplas = values.parcelasTriplas || 0;
                  const duplas = values.parcelasDuplas || 0;
                  const simples = values.parcelasSimples || 0;
                  const totalParcelas = triplas + duplas + simples;
                  const somaCalculada = (triplas * 3) + (duplas * 2) + (simples * 1);
                  
                  const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
                  
                  if (totalParcelas > 0 && somaCalculada !== parcelasNecessarias) {
                    return (
                      <p className="text-sm text-red-600">
                        A configuração de parcelas não está compatível. O total calculado ({somaCalculada}) precisa ser igual a {parcelasNecessarias} parcelas
                        <span className="block text-xs mt-1 text-gray-600">
                          Total Geral: {currency.format(valorTotalGeral)} ÷ Lance: {currency.format(valorLanceParsed)} = {parcelasCompletas} parcelas completas
                          {valorResidual > 0 && (
                            <span> + 1 parcela residual de {currency.format(valorResidual)}</span>
                          )}
                        </span>
                      </p>
                    );
                  }
                  
                  // ✅ Mostrar informação sobre parcela residual se houver
                  if (totalParcelas > 0 && valorResidual > 0) {
                    return (
                      <p className="text-sm text-green-700">
                        ✓ Configuração válida: {parcelasCompletas} parcelas de {currency.format(valorLanceParsed)} + 1 parcela residual de {currency.format(valorResidual)}
                      </p>
                    );
                  }
                  
                  return null;
                })()}
              </div>
            </>
          )}
        </div>
      )
    },
    {
      id: "parcelas",
      title: "Parcelamento",
      show: values.tipoPagamento !== "a_vista", // Não mostrar se for à vista
      content: (
        <div className="space-y-8">
          <div className="space-y-3">
            <Label className="text-lg font-normal text-gray-600">Quantidade de parcelas</Label>
            <div className="relative">
            <Input
              type="number"
              min="1"
                value={quantidadeParcelasCalculada || values.quantidadeParcelas}
                readOnly
                disabled
                className="wizard-input h-14 text-base border-0 border-b-2 border-gray-300 rounded-none px-0 bg-gray-50 text-gray-600 cursor-not-allowed"
              />
              {quantidadeParcelasCalculada > 0 && (
                <p className="text-xs text-gray-500 mt-1">
                  Calculado automaticamente: {values.parcelasTriplas || 0} triplas + {values.parcelasDuplas || 0} duplas + {values.parcelasSimples || 0} simples
                </p>
              )}
              {quantidadeParcelasCalculada === 0 && (
                <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  Configure as parcelas na etapa "Condições de Pagamento"
                </p>
              )}
            </div>
          </div>

          <div className="space-y-3">
            <Label className="text-lg font-normal text-gray-600">Dia do vencimento mensal</Label>
            <p className="text-sm text-gray-500 -mt-1">Este dia será usado automaticamente para o início do pagamento</p>
            <Input
              type="number"
              min="1"
              max="31"
              placeholder="Ex: 15"
              value={values.diaVencimentoMensal || ""}
              onChange={(e) => {
                const inputValue = e.target.value;
                
                // Se estiver vazio, permitir (será tratado no onBlur)
                if (inputValue === "") {
                  updateField("diaVencimentoMensal", undefined);
                  return;
                }
                
                const numValue = parseInt(inputValue);
                
                // ✅ Validar se está entre 1 e 31
                if (!isNaN(numValue)) {
                  if (numValue < 1) {
                    updateField("diaVencimentoMensal", 1);
                  } else if (numValue > 31) {
                    updateField("diaVencimentoMensal", 31);
                  } else {
                    updateField("diaVencimentoMensal", numValue);
                  }
                }
              }}
              onBlur={(e) => {
                // Se o campo estiver vazio ao sair, definir valor padrão
                if (!e.target.value || !values.diaVencimentoMensal) {
                  updateField("diaVencimentoMensal", 15);
                }
              }}
              className="wizard-input h-14 text-base border-0 border-b-2 border-gray-200 rounded-none focus-visible:border-gray-800 focus-visible:ring-0 focus-visible:outline-none px-0 bg-transparent placeholder:text-gray-400"
            />
            {!values.diaVencimentoMensal && attemptedNext && (
              <p className="text-sm text-red-600">
                Por favor, preencha o dia do vencimento mensal.
              </p>
            )}
            {values.diaVencimentoMensal && (values.diaVencimentoMensal < 1 || values.diaVencimentoMensal > 31) && (
              <p className="text-sm text-red-600">
                O dia deve estar entre 1 e 31.
              </p>
            )}
          </div>
        </div>
      )
    },
    {
      id: "inicio",
      title: "Data de Início",
      show: values.tipoPagamento !== "a_vista", // Não mostrar se for à vista
      content: (
        <div className="space-y-8">
          <div className="space-y-3">
            <Label className="text-lg font-normal text-gray-600">Quando inicia o pagamento das parcelas?</Label>
            <StringDatePicker
              value={values.mesInicioPagamento || ""}
              onChange={(v) => {
                if (v && values.diaVencimentoMensal) {
                  // Parse da data ISO ignorando fuso horário
                  const [ano, mes, dia] = v.split('-').map(Number);
                  
                  // ✅ Verificar se o dia selecionado é compatível
                  if (dia !== values.diaVencimentoMensal) {
                    // ❌ Data incompatível - mostrar aviso e NÃO atualizar
                    setTentouDataIncompativel(true);
                    // Limpar aviso após 5 segundos
                    setTimeout(() => setTentouDataIncompativel(false), 5000);
                    return; // Não atualiza o campo
                  }
                  
                  // ✅ Data compatível - atualizar normalmente
                  setTentouDataIncompativel(false);
                  const novaData = new Date(ano, mes - 1, values.diaVencimentoMensal);
                  const novaDataISO = novaData.toISOString().slice(0, 10);
                  updateField("mesInicioPagamento", novaDataISO);
                } else {
                  updateField("mesInicioPagamento", v);
                }
              }}
              placeholder="Ex: 01/01/2024"
              className="wizard-input h-14 text-base border-0 border-b-2 border-gray-200 rounded-none focus-visible:border-gray-800 focus-visible:ring-0 focus-visible:outline-none px-0 bg-transparent"
            />
            {tentouDataIncompativel && (
              <p className="text-sm text-red-600 mt-2">
                Data incompatível. O dia de vencimento mensal está definido como dia {values.diaVencimentoMensal}.
              </p>
            )}
            {values.mesInicioPagamento && (() => {
              // Parse da data ISO ignorando fuso horário
              const [ano, mes, dia] = values.mesInicioPagamento.split('-').map(Number);
              const diaDataInicio = dia;
              const incompativel = diaDataInicio !== values.diaVencimentoMensal;
              
              return incompativel ? (
                <p className="text-sm text-red-600 mt-2">
                  Por favor, selecione uma data que use o dia {values.diaVencimentoMensal} ou volte e altere o dia de vencimento mensal.
                </p>
              ) : null;
            })()}
          </div>
        </div>
      )
    },
    {
      id: "status",
      title: "Status do Pagamento",
      content: (
        <div className="space-y-8">
          <div className="space-y-3">
            <Label className="text-lg font-normal text-gray-600">Parcelas já pagas</Label>
            <Input
              type="number"
              min="0"
              placeholder="Ex: 0"
              value={values.parcelasPagas ?? ""}
              onChange={(e) => {
                const value = e.target.value === "" ? undefined : parseInt(e.target.value);
                updateField("parcelasPagas", value);
              }}
              onBlur={(e) => {
                // Se o campo estiver vazio ao sair, definir valor padrão
                if (!e.target.value || values.parcelasPagas === undefined) {
                  updateField("parcelasPagas", 0);
                }
              }}
              className="wizard-input h-14 text-base border-0 border-b-2 border-gray-200 rounded-none focus-visible:border-gray-800 focus-visible:ring-0 focus-visible:outline-none px-0 bg-transparent placeholder:text-gray-400"
            />
            <p className="text-sm text-gray-500">Informe quantas parcelas já foram pagas pelo arrematante</p>
            {values.parcelasPagas === undefined && attemptedNext && (
              <p className="text-sm text-red-600">
                Por favor, preencha a quantidade de parcelas já pagas.
              </p>
            )}
          </div>
        </div>
      )
    },
    {
      id: "juros",
      title: "Juros em Caso de Atraso",
      content: (
        <div className="space-y-8">
          <div className="space-y-3">
            <Label className="text-lg font-normal text-gray-600">Percentual de Juros (%)</Label>
            <Input
              type="number"
              min="0"
              max="100"
              step="0.1"
              placeholder="Ex: 2.5"
              value={values.percentualJurosAtraso ?? ""}
              onChange={(e) => {
                const value = e.target.value === "" ? undefined : parseFloat(e.target.value);
                updateField("percentualJurosAtraso", value);
              }}
              onBlur={(e) => {
                // Se o campo estiver vazio ao sair, definir valor padrão
                if (!e.target.value || values.percentualJurosAtraso === undefined) {
                  updateField("percentualJurosAtraso", 0);
                }
              }}
              className="wizard-input h-14 text-base border-0 border-b-2 border-gray-200 rounded-none focus-visible:border-gray-800 focus-visible:ring-0 focus-visible:outline-none px-0 bg-transparent placeholder:text-gray-400"
            />
            <p className="text-sm text-gray-500">Juros compostos aplicados mensalmente em caso de atraso no pagamento</p>
            {values.percentualJurosAtraso === undefined && attemptedNext && (
              <p className="text-sm text-red-600">
                Por favor, preencha o percentual de juros.
              </p>
            )}
          </div>
        </div>
      )
    },
    {
      id: "documentos",
      title: "Documentos",
      content: (
        <div className="space-y-8">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-lg font-normal text-gray-600">Documentos anexados</Label>
              <label className="cursor-pointer">
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    const input = e.currentTarget.parentElement?.querySelector('input[type="file"]') as HTMLInputElement;
                    input?.click();
                  }}
                  className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <Plus className="h-5 w-5" />
                </button>
                <input
                  type="file"
                  multiple
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>
            
            {values.documentos.length === 0 ? (
              <p className="text-sm text-gray-400 py-4">Nenhum documento adicionado</p>
            ) : values.documentos.length <= 3 ? (
              // Mostrar lista simples para até 3 documentos
              <div className="space-y-2">
                {values.documentos.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors">
                    <button
                      type="button"
                      onClick={() => {
                        logger.debug('📄 Abrindo documento:', { nome: doc.nome, url: doc.url?.substring(0, 50) + '...' });
                        try { logDocumentAction('view', doc.nome || 'documento', 'bidder', initial.auction?.nome || '', initial.auction?.id || ''); } catch { /* */ }
                        if (doc.url) {
                          openDocumentSafely(doc.url, doc.nome || 'Documento');
                        }
                      }}
                      className="text-sm text-gray-700 truncate flex-1 text-left hover:text-blue-600 transition-colors"
                    >
                      {doc.nome}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        removeDocument(doc.id);
                        setSelectedDocIndex(0);
                      }}
                      className="ml-2 text-gray-400 hover:text-red-600 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              // Usar seletor para mais de 3 documentos
              <>
                 <div className="flex items-center gap-3">
                   <Select
                     value={selectedDocIndex.toString()}
                     onValueChange={(v) => setSelectedDocIndex(parseInt(v))}
                   >
                     <SelectTrigger className="h-11 flex-1 border-gray-200 focus:ring-0 focus:outline-none focus-visible:ring-0">
                       <SelectValue>
                         Documento {selectedDocIndex + 1} de {values.documentos.length}
                       </SelectValue>
                     </SelectTrigger>
                     <SelectContent position="popper" sideOffset={5} className="z-[100000] max-h-[300px] overflow-auto">
                       {values.documentos.map((doc, index) => (
                         <SelectItem key={doc.id} value={index.toString()}>
                           {doc.nome}
                         </SelectItem>
                       ))}
                     </SelectContent>
                   </Select>
                  
                  <button
                    type="button"
                    onClick={() => {
                      const doc = values.documentos[selectedDocIndex];
                      logger.debug('📄 Abrindo documento:', { nome: doc?.nome, url: doc?.url?.substring(0, 50) + '...' });
                      try { logDocumentAction('view', doc?.nome || 'documento', 'bidder', initial.auction?.nome || '', initial.auction?.id || ''); } catch { /* */ }
                      if (doc?.url) {
                        openDocumentSafely(doc.url, doc.nome || 'Documento');
                      }
                    }}
                    className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                    title="Visualizar documento"
                  >
                    <Eye className="h-4 w-4" />
                  </button>
                  
                  <button
                    type="button"
                    onClick={() => {
                      const doc = values.documentos[selectedDocIndex];
                      if (doc) {
                        removeDocument(doc.id);
                        setSelectedDocIndex(Math.max(0, selectedDocIndex - 1));
                      }
                    }}
                    className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Remover documento"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {values.documentos[selectedDocIndex] && (
                  <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <p className="text-sm text-gray-700">{values.documentos[selectedDocIndex].nome}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {values.documentos[selectedDocIndex].tipo || "Tipo desconhecido"}
                    </p>
                  </div>
                )}

                <div className="flex justify-between items-center pt-4 border-t border-gray-100">
                  <span className="text-sm text-gray-400">
                    {values.documentos.length} {values.documentos.length === 1 ? 'documento' : 'documentos'}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      )
    },
  ];

  // Filtrar steps baseado nas condições (ex: esconder Parcelamento se for à vista)
  const steps = allSteps.filter(step => step.show !== false);

  // Handler para selecionar arrematante na etapa de seleção
  const handleSelectArrematante = async (arrematanteId: string) => {
    const arrematante = arrematantesExistentes.find(a => a.id === arrematanteId);
    if (!arrematante) return;
    
    setSelectedArrematanteId(arrematanteId);
    
    try {
      // ✅ Buscar dados completos do arrematante no banco
      const { data: arrematanteCompleto, error } = await supabase
        .from('bidders')
        .select('*')
        .eq('id', arrematanteId)
        .single();
      
      if (error) {
        logger.error('❌ Erro ao buscar arrematante:', error);
        return;
      }
      
      // ✅ Usar dados completos do banco (type cast para acessar propriedades)
      const arr = arrematanteCompleto as Record<string, unknown>;
      let telefoneNum = (arr?.telefone as string) || "";
    let codigoPaisVal = "+55";
    if (telefoneNum && telefoneNum.startsWith("+")) {
      const match = telefoneNum.match(/^(\+\d+)\s+(.+)$/);
      if (match) {
        codigoPaisVal = match[1];
        telefoneNum = match[2];
      }
    }
    
    setValues({
        id: (arr?.id as string) || "",
        nome: (arr?.nome as string) || "",
        documento: (arr?.documento as string) || "",
      telefone: telefoneNum,
      codigoPais: codigoPaisVal,
        email: (arr?.email as string) || "",
        endereco: (arr?.endereco as string) || "",
        cep: (arr?.cep as string) || "",
        rua: (arr?.rua as string) || "",
        numero: (arr?.numero as string) || "",
        complemento: (arr?.complemento as string) || "",
        bairro: (arr?.bairro as string) || "",
        cidade: (arr?.cidade as string) || "",
        estado: (arr?.estado as string) || "",
        loteId: (arr?.lote_id as string) || "",
        mercadoriaId: (arr?.mercadoria_id as string) || "",
        tipoPagamento: (arr?.tipo_pagamento as "a_vista" | "parcelamento" | "entrada_parcelamento") || "parcelamento",
        valorPagar: (arr?.valor_pagar_texto as string) || "",
        valorEntrada: (arr?.valor_entrada_texto as string) || "",
        quantidadeParcelas: (arr?.quantidade_parcelas as number) || initial.defaultQuantidadeParcelas || 12,
        mesInicioPagamento: (arr?.mes_inicio_pagamento as string) || initial.defaultMesInicio || "",
        diaVencimentoMensal: (arr?.dia_vencimento_mensal as number) || initial.defaultDiaVencimento || 15,
        parcelasPagas: (arr?.parcelas_pagas as number) || 0,
        percentualJurosAtraso: (arr?.percentual_juros_atraso as number) || 0,
        tipoJurosAtraso: (arr?.tipo_juros_atraso as "simples" | "composto") || "composto",
        documentos: ((arr?.documentos as unknown[]) || []).map((doc, idx) => {
          if (typeof doc === 'string') {
            return { 
              id: `doc-${idx}`, 
              url: doc, 
              tipo: 'outro' as const,
              nome: `Documento ${idx + 1}`,
              tamanho: 0,
              dataUpload: new Date().toISOString()
            };
          }
          return doc as DocumentoInfo;
        }),
        pago: (arr?.pago as boolean) || false,
        dataVencimentoVista: (arr?.data_vencimento_vista as string) || undefined,
        dataEntrada: (arr?.data_entrada as string) || undefined,
        valorLance: ((arr?.valor_lance as number)?.toString()) || "",
        fatorMultiplicador: ((arr?.fator_multiplicador as number)?.toString()) || "",
        usaFatorMultiplicador: (arr?.usa_fator_multiplicador as boolean) || false,
        parcelasTriplas: (arr?.parcelas_triplas as number) || 0,
        parcelasDuplas: (arr?.parcelas_duplas as number) || 0,
        parcelasSimples: (arr?.parcelas_simples as number) || 0,
    });
      
      setCurrentStep(0); // Ir para primeira etapa após carregar dados
      
    } catch (error) {
      logger.error('❌ Erro ao buscar arrematante:', error);
    }
  };

  // Filtrar arrematantes na etapa de seleção
  const arrematantesFiltradosSelection = useMemo(() => {
    if (!arrematantesExistentes || arrematantesExistentes.length === 0) return [];
    
    // Se está mostrando todos, retorna todos ordenados alfabeticamente
    if (showAllBiddersSelection && !searchCpfSelection) {
      return [...arrematantesExistentes].sort((a, b) => 
        (a.nome || '').localeCompare(b.nome || '', 'pt-BR')
      );
    }
    
    // Se tem busca
    if (searchCpfSelection) {
      let filtrados;
      
      if (searchModeSelection === 'nome') {
        // Busca por nome (começa com o texto digitado)
        const buscaLimpa = searchCpfSelection.toLowerCase().trim();
        filtrados = arrematantesExistentes.filter(arr => {
          const nomeLimpo = (arr.nome || '').toLowerCase();
          return nomeLimpo.startsWith(buscaLimpa);
        });
      } else {
        // Busca por CPF/CNPJ (começando com os dígitos digitados)
      const cpfLimpo = searchCpfSelection.replace(/\D/g, '');
        filtrados = arrematantesExistentes.filter(arr => {
        const docLimpo = arr.documento?.replace(/\D/g, '') || '';
          return docLimpo.startsWith(cpfLimpo);
      });
      }
      
      // Ordenar alfabeticamente por nome
      return filtrados.sort((a, b) => 
        (a.nome || '').localeCompare(b.nome || '', 'pt-BR')
      );
    }
    
    return [];
  }, [arrematantesExistentes, searchCpfSelection, showAllBiddersSelection, searchModeSelection]);

  // Etapa de seleção de arrematante (quando currentStep === -1)
  const selectionStep = {
    id: "selecao",
    title: "Buscar Arrematante",
    content: (
      <div className="space-y-8">
        {/* Descrição */}
        <p className="text-gray-600">
          {showAllBiddersSelection 
            ? `Navegue pela lista completa ou use a busca por ${searchModeSelection === 'cpf' ? 'CPF/CNPJ' : 'nome'} para filtrar`
            : `Digite o ${searchModeSelection === 'cpf' ? 'CPF ou CNPJ' : 'nome'} para buscar o arrematante que deseja editar`
          }
        </p>

        {/* Campo de Busca por CPF/CNPJ */}
        <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Label className="text-lg font-normal text-gray-600">
                <span 
                  key={searchModeSelection}
                  className="inline-block animate-in fade-in slide-in-from-top-1 duration-200"
                >
                  {searchModeSelection === 'cpf' ? 'CPF ou CNPJ' : 'Nome'}
                </span>
              </Label>
            <button
              type="button"
              onClick={() => {
                setSearchModeSelection(searchModeSelection === 'cpf' ? 'nome' : 'cpf');
                setSearchCpfSelection('');
              }}
              className="group flex items-center gap-1.5 transition-all"
              title={searchModeSelection === 'cpf' ? 'Buscar por nome' : 'Buscar por CPF/CNPJ'}
            >
              <ArrowLeftRight className="h-4 w-4 text-gray-400 group-hover:text-gray-700 transition-colors" />
              <span className="text-sm text-gray-400 group-hover:text-gray-700 transition-colors">
                {searchModeSelection === 'cpf' ? 'Nome' : 'CPF/CNPJ'}
              </span>
            </button>
          </div>
          <Input
            type="text"
            placeholder={searchModeSelection === 'cpf' ? 'Digite o CPF ou CNPJ para buscar' : 'Digite o nome para buscar'}
            value={searchCpfSelection}
            onChange={(e) => {
              let formatted;
              if (searchModeSelection === 'cpf') {
                formatted = formatCpfCnpj(e.target.value);
              } else {
                // Remove números quando estiver no modo nome
                formatted = e.target.value.replace(/[0-9]/g, '');
              }
              setSearchCpfSelection(formatted);
            }}
            className="h-14 text-base border-0 border-b-2 border-gray-200 rounded-none focus-visible:border-gray-800 focus-visible:ring-0 focus-visible:outline-none px-0 bg-transparent placeholder:text-gray-400"
          />
          {searchCpfSelection && arrematantesFiltradosSelection.length === 0 && (
            <p className="text-sm text-amber-600 flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              {searchModeSelection === 'cpf' 
                ? 'Nenhum arrematante encontrado com este CPF/CNPJ'
                : 'Nenhum arrematante encontrado com este nome'
              }
            </p>
          )}
        </div>

        {/* Título - Sempre visível quando há busca ou showAll */}
        {(searchCpfSelection || showAllBiddersSelection) && (
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-normal text-gray-900">
              {isTypingSelection ? (
                <>
                  Buscando Arrematante
                  <span className="inline-flex ml-1">
                    <span className="animate-bounce" style={{ animationDelay: '0ms', animationDuration: '1s' }}>.</span>
                    <span className="animate-bounce" style={{ animationDelay: '150ms', animationDuration: '1s' }}>.</span>
                    <span className="animate-bounce" style={{ animationDelay: '300ms', animationDuration: '1s' }}>.</span>
                  </span>
                </>
              ) : (
                `Arrematantes Encontrados ${arrematantesFiltradosSelection.length > 0 ? `(${arrematantesFiltradosSelection.length})` : ''}`
              )}
            </h2>
          </div>
        )}
        
        {/* Lista de Arrematantes - Aparece quando há busca ou showAll */}
        {(searchCpfSelection || showAllBiddersSelection) && arrematantesFiltradosSelection.length > 0 && (
          <div className="space-y-3">
            {arrematantesFiltradosSelection.map((arrematante, index) => {
              const lote = initial.lotes?.find(l => l.id === arrematante.loteId);
              
              return (
                <div
                  key={arrematante.id || index}
                  className="group relative p-5 border border-gray-200 rounded-xl cursor-pointer hover:border-gray-400 hover:shadow-sm transition-all duration-200 bg-white"
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm(`Tem certeza que deseja excluir o arrematante "${arrematante.nome}"?\n\nEsta ação não pode ser desfeita.`)) {
                        onDeleteArrematante?.(arrematante.id || '');
                      }
                    }}
                    className="absolute top-4 right-4 p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors z-10"
                    title="Excluir arrematante"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                  <div 
                    onClick={() => handleSelectArrematante(arrematante.id || '')}
                    className="flex items-center justify-between pr-8"
                  >
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-medium text-gray-900 truncate group-hover:text-gray-950">{arrematante.nome}</h3>
                      <div className="mt-2 space-y-1">
                        {arrematante.documento && (
                          <p className="text-sm text-gray-600">{arrematante.documento}</p>
                        )}
                        {arrematante.email && (
                          <p className="text-sm text-gray-500 truncate">{arrematante.email}</p>
                        )}
                      </div>
                      {lote && (
                        <div className="mt-3 pt-3 border-t border-gray-100">
                          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Lote Arrematado</p>
                          <p className="text-sm text-gray-700 font-medium">
                            Lote {lote.numero} - {lote.descricao}
                          </p>
                          {lote.mercadorias && lote.mercadorias.length > 0 && (
                            <p className="text-xs text-gray-500 mt-1">
                              {lote.mercadorias.length} mercadorias incluídas
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                    <ChevronRight className="h-6 w-6 text-gray-300 group-hover:text-gray-600 transition-colors flex-shrink-0 ml-4" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    ),
  };

  const currentStepData = currentStep === -1 ? selectionStep : steps[currentStep];

  // Handler para importar dados de arrematante existente
  const handleImportArrematante = (arrematanteId: string) => {
    const arrematante = initial.auction?.arrematantes?.find(a => a.id === arrematanteId);
    if (!arrematante) return;
    
    // Importar APENAS dados pessoais (não lote, mercadoria, valores, etc)
    setValues(prev => ({
      ...prev,
      nome: arrematante.nome,
      documento: arrematante.documento || "",
      telefone: arrematante.telefone?.replace(/^\+\d+\s+/, "") || "", // Remover código país
      codigoPais: arrematante.telefone?.match(/^(\+\d+)/)?.[1] || "+55",
      email: arrematante.email || "",
      cep: arrematante.cep || "",
      rua: arrematante.rua || "",
      numero: arrematante.numero || "",
      complemento: arrematante.complemento || "",
      bairro: arrematante.bairro || "",
      cidade: arrematante.cidade || "",
      estado: arrematante.estado || "",
      endereco: arrematante.endereco || "",
    }));
    
    setShowImportModal(false);
    setSearchCpf(""); // Limpar busca ao fechar
  };

  // Filtrar arrematantes por CPF/CNPJ ou Nome (modal de importação)
  const arrematantesFiltrados = useMemo(() => {
    if (!initial.auction?.arrematantes) return [];
    
    // Se está mostrando todos, retorna todos ordenados alfabeticamente
    if (showAllBidders && !searchCpf) {
      return [...initial.auction.arrematantes].sort((a, b) => 
        (a.nome || '').localeCompare(b.nome || '', 'pt-BR')
      );
    }
    
    // Se tem busca
    if (searchCpf) {
      let filtrados;
      
      if (searchMode === 'nome') {
        // Busca por nome (começa com o texto digitado)
        const buscaLimpa = searchCpf.toLowerCase().trim();
        filtrados = initial.auction.arrematantes.filter(arr => {
          const nomeLimpo = (arr.nome || '').toLowerCase();
          return nomeLimpo.startsWith(buscaLimpa);
        });
      } else {
        // Busca por CPF/CNPJ (começando com os dígitos digitados)
      const cpfLimpo = searchCpf.replace(/\D/g, '');
        filtrados = initial.auction.arrematantes.filter(arr => {
        const docLimpo = arr.documento?.replace(/\D/g, '') || '';
          return docLimpo.startsWith(cpfLimpo);
      });
      }
      
      // Ordenar alfabeticamente por nome
      return filtrados.sort((a, b) => 
        (a.nome || '').localeCompare(b.nome || '', 'pt-BR')
      );
    }
    
    return [];
  }, [initial.auction?.arrematantes, searchCpf, showAllBidders, searchMode]);

  return (
    <>
      {createPortal(
    <>
      {/* Wizard de Importação em Tela Cheia */}
      {showImportModal && (
        <div 
          className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-white overflow-auto transition-opacity duration-300 opacity-100"
          style={{ 
            animation: 'wizardFadeIn 0.3s ease-out', 
            margin: 0, 
            padding: 0,
            zIndex: 100000
          }}
        >
          {/* Botão Fechar - Canto Superior Esquerdo */}
          <div className="fixed top-8 left-8 z-20">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowImportModal(false)}
              className="rounded-full w-12 h-12 bg-gray-100 hover:bg-gray-200 text-gray-700 hover:text-gray-700"
            >
              <XIcon className="h-6 w-6" />
            </Button>
          </div>

          <div className="min-h-screen flex">
            {/* Conteúdo Principal */}
            <div className="flex-1 flex items-center justify-center px-8 md:px-20 py-16">
              <div className="w-full max-w-2xl space-y-12">
                {/* Título */}
                <div>
                  <div className="flex items-center gap-4">
                    <h1 className="text-3xl md:text-4xl font-normal text-gray-900 leading-tight">
                      Buscar Arrematante
                    </h1>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setShowAllBidders(!showAllBidders);
                          if (!showAllBidders) {
                            setSearchCpf(''); // Limpar busca ao mostrar todos
                          }
                        }}
                        onMouseEnter={() => setIsHoveringButton(true)}
                        onMouseLeave={() => setIsHoveringButton(false)}
                        className={`p-2.5 rounded-lg transition-all duration-200 ${
                          showAllBidders 
                            ? 'bg-gray-900 text-white hover:bg-gray-800' 
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        <Users className="h-5 w-5" />
                      </button>
                      <span 
                        className={`text-sm font-medium whitespace-nowrap transition-all duration-200 ${
                          isHoveringButton 
                            ? 'opacity-100 translate-x-0' 
                            : 'opacity-0 -translate-x-2 pointer-events-none'
                        } ${showAllBidders ? 'text-gray-900' : 'text-gray-600'}`}
                      >
                        {showAllBidders ? 'Ocultar lista' : 'Mostrar todos arrematantes'}
                      </span>
                    </div>
                  </div>
                  <p className="text-lg text-gray-600 mt-4">
                    {showAllBidders 
                      ? `Navegue pela lista completa ou use a busca por ${searchMode === 'cpf' ? 'CPF/CNPJ' : 'nome'} para filtrar`
                      : `Digite o ${searchMode === 'cpf' ? 'CPF ou CNPJ' : 'nome'} para buscar e importar os dados pessoais de um arrematante existente`
                    }
                  </p>
                </div>

                {/* Campo de Busca por CPF/CNPJ */}
                <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Label className="text-lg font-normal text-gray-600">
                        <span 
                          key={searchMode}
                          className="inline-block animate-in fade-in slide-in-from-top-1 duration-200"
                        >
                          {searchMode === 'cpf' ? 'CPF ou CNPJ' : 'Nome'}
                        </span>
                      </Label>
                    <button
                      type="button"
                      onClick={() => {
                        setSearchMode(searchMode === 'cpf' ? 'nome' : 'cpf');
                        setSearchCpf('');
                      }}
                      className="group flex items-center gap-1.5 transition-all"
                      title={searchMode === 'cpf' ? 'Buscar por nome' : 'Buscar por CPF/CNPJ'}
                    >
                      <ArrowLeftRight className="h-4 w-4 text-gray-400 group-hover:text-gray-700 transition-colors" />
                      <span className="text-sm text-gray-400 group-hover:text-gray-700 transition-colors">
                        {searchMode === 'cpf' ? 'Nome' : 'CPF/CNPJ'}
                      </span>
                    </button>
                  </div>
                  <Input
                    type="text"
                    placeholder={searchMode === 'cpf' ? 'Digite o CPF ou CNPJ para buscar' : 'Digite o nome para buscar'}
                    value={searchCpf}
                    onChange={(e) => {
                      let formatted;
                      if (searchMode === 'cpf') {
                        formatted = formatCpfCnpj(e.target.value);
                      } else {
                        // Remove números quando estiver no modo nome
                        formatted = e.target.value.replace(/[0-9]/g, '');
                      }
                      setSearchCpf(formatted);
                    }}
                    className="h-14 text-base border-0 border-b-2 border-gray-200 rounded-none focus-visible:border-gray-800 focus-visible:ring-0 focus-visible:outline-none px-0 bg-transparent placeholder:text-gray-400"
                  />
                  {searchCpf && arrematantesFiltrados.length === 0 && (
                    <p className="text-sm text-amber-600 flex items-center gap-2">
                      <AlertCircle className="h-4 w-4" />
                      {searchMode === 'cpf' 
                        ? 'Nenhum arrematante encontrado com este CPF/CNPJ'
                        : 'Nenhum arrematante encontrado com este nome'
                      }
                    </p>
                  )}
                </div>

                {/* Título - Sempre visível */}
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-normal text-gray-900">
                    {isTyping ? (
                      <>
                        Buscando Arrematante
                        <span className="inline-flex ml-1">
                          <span className="animate-bounce" style={{ animationDelay: '0ms', animationDuration: '1s' }}>.</span>
                          <span className="animate-bounce" style={{ animationDelay: '150ms', animationDuration: '1s' }}>.</span>
                          <span className="animate-bounce" style={{ animationDelay: '300ms', animationDuration: '1s' }}>.</span>
                        </span>
                      </>
                    ) : (
                      `Arrematantes Encontrados ${arrematantesFiltrados.length > 0 ? `(${arrematantesFiltrados.length})` : ''}`
                    )}
                  </h2>
                </div>

                {/* Lista de Arrematantes - Aparece quando há busca ou quando showAllBidders está ativo */}
                {(searchCpf || showAllBidders) && arrematantesFiltrados.length > 0 && (
                  <div className="space-y-3">
                    {arrematantesFiltrados.map((arrematante, index) => {
                    const lote = initial.auction?.lotes?.find(l => l.id === arrematante.loteId);
                    
                    return (
                      <div 
                        key={arrematante.id || index}
                        className="group relative p-5 border border-gray-200 rounded-xl cursor-pointer hover:border-gray-400 hover:shadow-sm transition-all duration-200 bg-white"
                      >
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm(`Tem certeza que deseja excluir o arrematante "${arrematante.nome}"?\n\nEsta ação não pode ser desfeita.`)) {
                              onDeleteArrematante?.(arrematante.id || '');
                            }
                          }}
                          className="absolute top-4 right-4 p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors z-10"
                          title="Excluir arrematante"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                        <div 
                          onClick={() => handleImportArrematante(arrematante.id || '')}
                          className="flex items-center justify-between pr-8"
                        >
                          <div className="flex-1 min-w-0">
                            <h3 className="text-lg font-medium text-gray-900 truncate group-hover:text-gray-950">{arrematante.nome}</h3>
                            <div className="mt-2 space-y-1">
                              {arrematante.documento && (
                                <p className="text-sm text-gray-600">{arrematante.documento}</p>
                              )}
                              {arrematante.email && (
                                <p className="text-sm text-gray-500 truncate">{arrematante.email}</p>
                              )}
                            </div>
                            {lote && (
                              <div className="mt-3 pt-3 border-t border-gray-100">
                                <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Lote Arrematado</p>
                                <p className="text-sm text-gray-600 truncate">Lote {lote.numero} - {lote.descricao}</p>
                                {arrematante.mercadorias && arrematante.mercadorias.length > 0 && (
                                  <p className="text-xs text-gray-500 mt-1">{arrematante.mercadorias.length} {arrematante.mercadorias.length === 1 ? 'mercadoria incluída' : 'mercadorias incluídas'}</p>
                                )}
                              </div>
                            )}
                          </div>
                          <ChevronRight className="h-5 w-5 text-gray-300 group-hover:text-gray-600 flex-shrink-0 ml-4 transition-colors" />
                        </div>
                      </div>
                    );
                  })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Wizard Principal */}
    <div 
      className={`fixed inset-0 top-0 left-0 right-0 bottom-0 bg-white overflow-auto transition-opacity duration-300 ${
        isClosing ? 'opacity-0' : 'opacity-100'
      }`}
      style={{ 
        animation: isClosing ? 'none' : 'wizardFadeIn 0.3s ease-out', 
        margin: 0, 
        padding: 0,
        zIndex: 99999
      }}
    >
      {/* Botão Voltar/Fechar - Canto Superior Esquerdo */}
      <div className="fixed top-8 left-8 z-20">
        <Button
          variant="ghost"
          size="icon"
          onClick={currentStep === -1 || currentStep === 0 ? handleClose : handleBack}
          className="rounded-full w-12 h-12 bg-gray-100 hover:bg-gray-200 text-gray-700 hover:text-gray-700"
        >
          {currentStep === -1 || currentStep === 0 ? (
            <XIcon className="h-6 w-6" />
          ) : (
            <ChevronLeft className="h-6 w-6" />
          )}
        </Button>
      </div>

      <div className="min-h-screen flex">
        {/* Indicadores de Etapas - Lateral Esquerda */}
        {currentStep !== -1 && (
        <div className="hidden md:flex flex-col justify-center w-80 px-12">
          <div className="space-y-4">
            {steps.map((step, index) => (
              <div
                key={index}
                onClick={() => goToStep(index)}
                className={`text-lg font-normal transition-colors duration-200 cursor-pointer hover:text-gray-600 ${
                  index === currentStep
                    ? "text-gray-700"
                    : index < currentStep
                    ? "text-gray-400"
                    : "text-gray-300"
                }`}
              >
                {step.title}
              </div>
            ))}
          </div>
        </div>
        )}

        {/* Conteúdo Principal */}
        <div className="flex-1 flex items-center justify-center px-8 md:px-20 py-16">
          <div className="w-full max-w-2xl space-y-12">
            {/* Título da Etapa */}
            <div>
              {currentStep === -1 ? (
                // Título com botão para etapa de seleção
                <div className="flex items-center gap-4">
              <h1 className="text-3xl md:text-4xl font-normal text-gray-900 leading-tight">
                {currentStepData.title}
              </h1>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setShowAllBiddersSelection(!showAllBiddersSelection);
                        if (!showAllBiddersSelection) {
                          setSearchCpfSelection(''); // Limpar busca ao mostrar todos
                        }
                      }}
                      onMouseEnter={() => setIsHoveringButtonSelection(true)}
                      onMouseLeave={() => setIsHoveringButtonSelection(false)}
                      className={`p-2.5 rounded-lg transition-all duration-200 ${
                        showAllBiddersSelection 
                          ? 'bg-gray-900 text-white hover:bg-gray-800' 
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      <Users className="h-5 w-5" />
                    </button>
                    <span 
                      className={`text-sm font-medium whitespace-nowrap transition-all duration-200 ${
                        isHoveringButtonSelection 
                          ? 'opacity-100 translate-x-0' 
                          : 'opacity-0 -translate-x-2 pointer-events-none'
                      } ${showAllBiddersSelection ? 'text-gray-900' : 'text-gray-600'}`}
                    >
                      {showAllBiddersSelection ? 'Ocultar lista' : 'Mostrar todos arrematantes'}
                    </span>
                  </div>
                </div>
              ) : (
                // Título normal para outras etapas
                <div className="flex items-baseline justify-between">
                <h1 className="text-3xl md:text-4xl font-normal text-gray-900 leading-tight">
                  {currentStepData.title}
                </h1>
                  {currentStepData.id === "condicoes-pagamento" && (
                    <button
                      type="button"
                      onClick={() => {
                        // Buscar arrematantes existentes para esta mercadoria
                        const arrematantesExistentes = initial.auction?.arrematantes?.filter(
                          arr => arr.mercadoriaId === values.mercadoriaId && arr.mercadoriaId
                        ) || [];
                        
                        if (arrematantesExistentes.length > 0) {
                          // Já existe divisão - mostrar tela de gerenciamento
                          setArrematantesExistentesDivisao(arrematantesExistentes);
                          setShowGerenciarDivisao(true);
                        } else {
                          // Nova divisão - abrir wizard normal
                          setShowDivisaoWizard(true);
                        }
                      }}
                      className="flex items-center gap-2 text-sm text-gray-700 hover:text-gray-900 hover:underline underline-offset-4 transition-all"
                    >
                      <Users className="h-4 w-4" />
                      <span>Dividir Mercadoria</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Conteúdo da Etapa */}
            <div>{currentStepData.content}</div>

            {/* Botão de Avançar - não mostrar na etapa de seleção */}
            {currentStep !== -1 && (
            <div className="pt-4">
              {currentStep < steps.length - 1 ? (
                <Button
                  onClick={handleNext}
                  className="w-full h-14 text-base font-normal bg-gray-700 hover:bg-gray-800 text-white rounded-lg transition-all duration-200"
                  size="lg"
                >
                  Avançar
                  <ChevronRight className="h-5 w-5 ml-2" />
                </Button>
              ) : (
                <Button
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="w-full h-14 text-base font-normal bg-gray-800 hover:bg-gray-900 text-white rounded-lg transition-all duration-200"
                  size="lg"
                >
                  {isSubmitting ? "Salvando..." : "Concluir"}
                  {!isSubmitting && <Check className="h-5 w-5 ml-2" />}
                </Button>
              )}
            </div>
            )}
          </div>
        </div>
      </div>
    </div>

    {/* Wizard de Divisão de Mercadoria */}
    {showDivisaoWizard && (
      <div className="fixed inset-0 bg-white z-[100000] overflow-auto">
        {/* Botão Voltar/Fechar - Canto Superior Esquerdo */}
        <div className="fixed top-8 left-8 z-20">
          <Button
            variant="ghost"
            size="icon"
                  onClick={() => {
              if (divisaoStep === 0 && !showPreview) {
                setShowCancelDivisaoModal(true);
              } else {
                // Voltar
                if (showPreview) {
                      setShowPreview(false);
                } else {
                  setDivisaoStep(divisaoStep - 1);
                }
                    }
                  }}
            className="rounded-full w-12 h-12 bg-gray-100 hover:bg-gray-200 text-gray-700 hover:text-gray-700"
          >
            {divisaoStep === 0 && !showPreview ? (
              <XIcon className="h-6 w-6" />
            ) : (
              <ChevronLeft className="h-6 w-6" />
            )}
          </Button>
        </div>

        <div className="min-h-screen flex">
          {/* Indicadores de Etapas - Lateral Esquerda */}
          <div className="hidden md:flex flex-col justify-center w-80 px-12">
            <div className="space-y-4">
              <div
                onClick={() => {
                  if (showPreview || divisaoStep > 0) {
                    setShowPreview(false);
                    setDivisaoStep(0);
                    setArrematanteSubStep(0);
                  }
                }}
                className={`text-lg font-normal transition-colors duration-200 cursor-pointer hover:text-gray-600 ${
                  divisaoStep === 0 && !showPreview
                    ? "text-gray-700"
                    : "text-gray-400"
                }`}
              >
                Configuração
                </div>
              {Array.from({ length: numeroArrematantes }, (_, i) => {
                const isCurrentArrematante = divisaoStep === i + 1 && !showPreview;
                const isArrematantePreenchido = arrematantesDivisao.length > i && arrematantesDivisao[i].nome;
                
                return (
                  <div key={i}>
                    <div
                      onClick={() => {
                        // Só permite navegar para etapas já preenchidas
                        if (isArrematantePreenchido) {
                          setShowPreview(false);
                          setDivisaoStep(i + 1);
                          setArrematanteSubStep(0);
                          setSelectedDocIndexDivisao(0);
                        }
                      }}
                      className={`text-lg font-normal transition-colors duration-200 ${
                        isArrematantePreenchido
                          ? "cursor-pointer hover:text-gray-600"
                          : "cursor-not-allowed"
                      } ${
                        isCurrentArrematante
                          ? "text-gray-700"
                          : divisaoStep > i + 1 || showPreview
                          ? "text-gray-400"
                          : "text-gray-300"
                      }`}
                    >
                      Arrematante {i + 1}
              </div>

                    {/* Subsessões quando está no arrematante atual */}
                    {isCurrentArrematante && (
                      <div className="ml-4 mt-2 space-y-2">
                        {arrematanteSubSteps.map((subStep, subIndex) => (
                          <div
                            key={subStep.id}
                            onClick={() => setArrematanteSubStep(subIndex)}
                            className={`text-sm font-normal transition-colors duration-200 cursor-pointer hover:text-gray-600 ${
                              arrematanteSubStep === subIndex
                                ? "text-gray-700"
                                : "text-gray-400"
                            }`}
                          >
                            {subStep.title}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              <div
                onClick={() => {
                  // Só permite ir para o resumo se todos os arrematantes foram preenchidos
                  if (arrematantesDivisao.length === numeroArrematantes) {
                    const todosPreenchidos = arrematantesDivisao.every(arr => arr.nome && arr.nome.trim());
                    if (todosPreenchidos) {
                      setShowPreview(true);
                      setArrematanteSubStep(0);
                    }
                  }
                }}
                className={`text-lg font-normal transition-colors duration-200 ${
                  arrematantesDivisao.length === numeroArrematantes && 
                  arrematantesDivisao.every(arr => arr.nome && arr.nome.trim())
                    ? "cursor-pointer hover:text-gray-600"
                    : "cursor-not-allowed"
                } ${
                  showPreview
                    ? "text-gray-700"
                    : divisaoStep > numeroArrematantes
                    ? "text-gray-400"
                    : "text-gray-300"
                }`}
              >
                Resumo
              </div>
            </div>
          </div>

          {/* Conteúdo Principal */}
          <div className="flex-1 flex items-center justify-center px-8 md:px-20 py-16">
            <div className="w-full max-w-2xl space-y-12">
              {showPreview ? (
                // Tela de Preview Final
                <div className="space-y-8">
                  <div>
                    <h1 className="text-3xl md:text-4xl font-normal text-gray-900 leading-tight mb-3">
                      Resumo da Divisão
                    </h1>
                    <p className="text-base text-gray-600">
                      Revise as informações antes de finalizar
                    </p>
                  </div>

                  {/* Total */}
                  <div className="flex items-center justify-between py-3 border-b border-gray-200">
                    <span className="text-sm text-gray-600">Total de arrematantes</span>
                    <span className="text-lg font-medium text-gray-900">{numeroArrematantes + 1}</span>
                    </div>

                  {/* Arrematante Principal */}
                  <div className="space-y-4">
                    <p className="text-xs text-gray-500 uppercase tracking-wider">Arrematante Principal</p>
                    
                    <div className="flex items-start gap-3 pb-4 border-b border-gray-100">
                      <span className="text-sm text-gray-400 font-medium">1.</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-base text-gray-900">{values.nome || 'Não informado'}</p>
                        <p className="text-xs text-gray-400 mt-1">Formulário principal</p>
                        {values.documento && (
                          <p className="text-sm text-gray-600 mt-2">
                            {values.documento}
                          </p>
                        )}
                    </div>
                  </div>
                </div>

                  {/* Arrematantes Adicionais */}
                  <div className="space-y-4">
                    <p className="text-xs text-gray-500 uppercase tracking-wider">
                      Arrematantes Adicionais ({numeroArrematantes})
                    </p>
                    
                <div className="space-y-3">
                  {arrematantesDivisao.map((arr, index) => (
                        <div key={index} className="flex items-start gap-3 pb-3 border-b border-gray-100 last:border-0 last:pb-0">
                          <span className="text-sm text-gray-400 font-medium">{index + 2}.</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-base text-gray-900">{arr.nome}</p>
                            {arr.documento && (
                              <p className="text-sm text-gray-600 mt-2">
                                {arr.documento}
                              </p>
                            )}
                      </div>
                    </div>
                  ))}
                </div>
                  </div>
              </div>
              ) : divisaoStep === 0 ? (
                // Etapa inicial: Configuração da divisão
                <div className="space-y-8">
                  <div>
                    <h1 className="text-3xl md:text-4xl font-normal text-gray-900 leading-tight mb-3">
                      Dividir Mercadoria
                    </h1>
                    <p className="text-base text-gray-600">
                      Configure como deseja dividir a mercadoria entre os arrematantes
                    </p>
                  </div>

                  {/* Número de Arrematantes */}
                  <div className="space-y-3">
                    <Label className="text-lg font-normal text-gray-600">Número de Arrematantes Adicionais</Label>
                    <Input
                      type="text"
                      value={numeroArrematantesInput}
                      onChange={(e) => {
                        const value = e.target.value;
                        // Permite apenas números
                        if (value === '' || /^\d+$/.test(value)) {
                          setNumeroArrematantesInput(value);
                          // Atualiza o número real se for válido
                          if (value !== '') {
                            const num = parseInt(value);
                            if (!isNaN(num) && num >= 1) {
                              setNumeroArrematantes(num);
                            }
                          }
                        }
                      }}
                      onBlur={(e) => {
                        // Ao sair do campo, garante que tem um valor válido
                        const value = e.target.value;
                        if (value === '' || parseInt(value) < 1) {
                          setNumeroArrematantesInput('1');
                          setNumeroArrematantes(1);
                        }
                      }}
                      placeholder="Digite o número de arrematantes adicionais"
                      className="wizard-input h-14 text-base border-0 border-b-2 border-gray-200 rounded-none focus-visible:border-gray-800 focus-visible:ring-0 focus-visible:outline-none px-0 bg-transparent placeholder:text-gray-400"
                    />
                    <p className="text-sm text-gray-500">
                      Além do arrematante principal já cadastrado
                    </p>
                  </div>

                {/* Informação */}
                <div className="text-sm text-gray-600">
                  {numeroArrematantes === 1 
                    ? `Após continuar, você poderá configurar o arrematante adicional com suas condições de pagamento.`
                    : `Após continuar, você poderá configurar cada um dos ${numeroArrematantes} arrematantes adicionais individualmente com suas condições de pagamento.`
                  }
                </div>
              </div>
            ) : (
              // Etapas de configuração de cada arrematante
              (() => {
                const arrIndex = divisaoStep - 1;
                const currentArr = arrematantesDivisao[arrIndex] || { nome: '' };
                
                // Função helper para atualizar campos do arrematante
                const updateArrematanteField = (field: string, value: string | number | boolean | undefined) => {
                  const newArr = [...arrematantesDivisao];
                  newArr[arrIndex] = { ...currentArr, [field]: value };
                  setArrematantesDivisao(newArr);
                };
                
                // Função para buscar CEP
                const buscarCepDivisao = async (cep: string) => {
                  const cepNumeros = cep.replace(/\D/g, '');
                  
                  if (cepNumeros.length !== 8) return;
                  
                  setLoadingCepDivisao(true);
                  setCepErrorDivisao(null);
                  
                  try {
                    // Definir tipos para as respostas das APIs de CEP
                    type ViaCEPResponse = {
                      cep: string;
                      logradouro: string;
                      complemento: string;
                      bairro: string;
                      localidade: string;
                      uf: string;
                      erro?: boolean;
                    };
                    
                    type BrasilAPIResponse = {
                      cep: string;
                      state: string;
                      city: string;
                      neighborhood: string;
                      street: string;
                    };
                    
                    let data: ViaCEPResponse | null = null;
                    
                    // Tentar com BrasilAPI
                    try {
                      const response = await fetch(`https://brasilapi.com.br/api/cep/v1/${cepNumeros}`);
                      
                      if (response.ok) {
                        const brasilData: BrasilAPIResponse = await response.json();
                        
                        data = {
                          cep: brasilData.cep,
                          logradouro: brasilData.street || "",
                          complemento: "",
                          bairro: brasilData.neighborhood || "",
                          localidade: brasilData.city || "",
                          uf: brasilData.state || ""
                        };
                      }
                    } catch (error) {
                      logger.debug('BrasilAPI falhou, tentando ViaCEP...');
                    }
                    
                    // Fallback para ViaCEP
                    if (!data) {
                      const response = await fetch(`https://viacep.com.br/ws/${cepNumeros}/json/`);
                      if (response.ok) {
                        data = await response.json();
                      }
                    }
                    
                    if (!data) {
                      setCepErrorDivisao("Não foi possível conectar aos serviços de CEP. Preencha manualmente.");
                      return;
                    }
                    
                    if (data.erro) {
                      setCepErrorDivisao("CEP não encontrado. Por favor, verifique o CEP digitado.");
                      return;
                    }
                    
                    // Atualiza os campos
                    const newArr = [...arrematantesDivisao];
                    newArr[arrIndex] = {
                      ...currentArr,
                      rua: data.logradouro || currentArr.rua || '',
                      bairro: data.bairro || currentArr.bairro || '',
                      cidade: data.localidade || currentArr.cidade || '',
                      estado: data.uf || currentArr.estado || ''
                    };
                    setArrematantesDivisao(newArr);
                  } catch (error) {
                    logger.error('Erro ao buscar CEP:', error);
                    setCepErrorDivisao("Erro ao buscar CEP. Por favor, preencha manualmente.");
                  } finally {
                    setLoadingCepDivisao(false);
                  }
                };
                
                // Função para importar dados de arrematante existente
                const handleImportArrematante = (arrematanteExistente: ArrematanteInfo) => {
                  const newArr = [...arrematantesDivisao];
                  newArr[arrIndex] = {
                    ...newArr[arrIndex],
                    nome: arrematanteExistente.nome || '',
                    documento: arrematanteExistente.documento || '',
                    email: arrematanteExistente.email || '',
                    codigoPais: '+55', // Padrão Brasil
                    telefone: arrematanteExistente.telefone || '',
                    cep: arrematanteExistente.cep || '',
                    rua: arrematanteExistente.rua || '',
                    numero: arrematanteExistente.numero || '',
                    complemento: arrematanteExistente.complemento || '',
                    bairro: arrematanteExistente.bairro || '',
                    cidade: arrematanteExistente.cidade || '',
                    estado: arrematanteExistente.estado || ''
                  };
                  setArrematantesDivisao(newArr);
                };
                
                return (
                  <div className="space-y-8">
                    <div>
                      <h1 className="text-3xl md:text-4xl font-normal text-gray-900 leading-tight mb-3">
                        Arrematante {divisaoStep} de {numeroArrematantes}
                      </h1>
                      <p className="text-base text-gray-600">
                        Configure as informações e a divisão deste arrematante
                      </p>
                      
                      {/* Botão Importar Dados - apenas na identificação */}
                      {arrematanteSubStep === 0 && (
                        <div className="mt-4">
                          <button
                            type="button"
                            onClick={() => setShowImportModalDivisao(true)}
                            className="text-gray-700 hover:text-gray-900 font-medium text-sm hover:underline decoration-gray-700 underline-offset-4 transition-all"
                          >
                            Importar Dados de Arrematante Existente
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Formulário do arrematante com subsessões */}
                    <div className="space-y-8">
                      {/* Subsessão 0: Identificação */}
                      {arrematanteSubStep === 0 && (
                        <>
                      <div className="space-y-3">
                            <Label className="text-lg font-normal text-gray-600">Nome Completo</Label>
                        <Input
                          type="text"
                              value={currentArr.nome || ''}
                              onChange={(e) => updateArrematanteField('nome', e.target.value)}
                          placeholder="Digite o nome completo"
                          className="wizard-input h-14 text-base border-0 border-b-2 border-gray-200 rounded-none focus-visible:border-gray-800 focus-visible:ring-0 focus-visible:outline-none px-0 bg-transparent placeholder:text-gray-400"
                        />
                      </div>

                        <div className="space-y-3">
                            <Label className="text-lg font-normal text-gray-600">CPF/CNPJ</Label>
                          <Input
                              type="text"
                              value={currentArr.documento || ''}
                            onChange={(e) => {
                                const formatted = formatCpfCnpj(e.target.value);
                                updateArrematanteField('documento', formatted);
                            }}
                              placeholder="000.000.000-00"
                            className="wizard-input h-14 text-base border-0 border-b-2 border-gray-200 rounded-none focus-visible:border-gray-800 focus-visible:ring-0 focus-visible:outline-none px-0 bg-transparent placeholder:text-gray-400"
                          />
                        </div>
                        </>
                      )}

                      {/* Subsessão 1: Contato */}
                      {arrematanteSubStep === 1 && (
                        <>
                        <div className="space-y-3">
                            <Label className="text-lg font-normal text-gray-600">E-mail</Label>
                          <Input
                              type="email"
                              value={currentArr.email || ''}
                              onChange={(e) => updateArrematanteField('email', e.target.value)}
                              placeholder="email@exemplo.com"
                            className="wizard-input h-14 text-base border-0 border-b-2 border-gray-200 rounded-none focus-visible:border-gray-800 focus-visible:ring-0 focus-visible:outline-none px-0 bg-transparent placeholder:text-gray-400"
                          />
                        </div>

                        <div className="space-y-3">
                            <Label className="text-lg font-normal text-gray-600">Telefone</Label>
                            <div className="flex items-end gap-3">
                              <Select
                                value={currentArr.codigoPais || '+55'}
                                onValueChange={(v) => updateArrematanteField('codigoPais', v)}
                              >
                                <SelectTrigger className="w-[180px] h-14 text-base border-0 border-b-2 border-gray-200 rounded-none focus:border-black focus-visible:border-black focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none px-0 bg-transparent [&>span]:flex [&>span]:items-center [&>span]:gap-2">
                                  <SelectValue>
                                    <FlagIcon countryCode={currentArr.codigoPais || '+55'} />
                                    <span>{currentArr.codigoPais || '+55'}</span>
                                  </SelectValue>
                                </SelectTrigger>
                                <SelectContent 
                                  position="popper" 
                                  sideOffset={5} 
                                  className="z-[100000] max-h-[300px] overflow-auto [&_*[role=option]>span]:flex [&_*[role=option]>span]:items-center [&_*[role=option]>span]:gap-2 [&_*[role=option]>span]:justify-start"
                                >
                                  {COUNTRY_CODES.map((region) => (
                                    <SelectGroup key={region.region}>
                                      <SelectLabel className="ps-2 text-xs font-semibold text-gray-500">
                                        {region.region}
                                      </SelectLabel>
                                      {region.countries.map((country) => (
                                        <SelectItem 
                                          key={`${country.code}-${country.country}`} 
                                          value={country.code}
                                          data-country={country.country}
                                        >
                                          <FlagIcon countryCode={country.code} countryName={country.country} />
                                          <span className="truncate">{country.code} - {country.country}</span>
                                        </SelectItem>
                                      ))}
                                    </SelectGroup>
                                  ))}
                                </SelectContent>
                              </Select>

                          <Input
                              type="text"
                              value={currentArr.telefone || ''}
                            onChange={(e) => {
                                const formatted = formatTelefone(e.target.value, currentArr.codigoPais || '+55');
                                updateArrematanteField('telefone', formatted);
                              }}
                              placeholder={(() => {
                                switch(currentArr.codigoPais || '+55') {
                                  case '+55': return "(11) 98765-4321";
                                  case '+1': return "(555) 123-4567";
                                  case '+54': return "(11) 1234-5678";
                                  case '+52': return "(55) 1234-5678";
                                  case '+56': return "9 8765-4321";
                                  case '+57': return "(300) 123-4567";
                                  case '+595': return "(21) 123-456";
                                  case '+598': return "(99) 123-456";
                                  case '+351': return "912 345 678";
                                  case '+34': return "612 345 678";
                                  case '+33': return "06 12 34 56 78";
                                  case '+49': return "1511 1234567";
                                  case '+44': return "7700 123456";
                                  case '+86': return "138-0000-0000";
                                  case '+81': return "090-1234-5678";
                                  case '+82': return "010-1234-5678";
                                  case '+91': return "98765-43210";
                                  default: return "Digite o número";
                                }
                              })()}
                            className="flex-1 wizard-input h-14 text-base border-0 border-b-2 border-gray-200 rounded-none focus-visible:border-gray-800 focus-visible:ring-0 focus-visible:outline-none px-0 bg-transparent placeholder:text-gray-400"
                          />
                        </div>
                        </div>
                        </>
                      )}

                      {/* Subsessão 2: Endereço */}
                      {arrematanteSubStep === 2 && (
                        <>
                        <div className="space-y-3">
                            <Label className="text-lg font-normal text-gray-600">CEP</Label>
                          <Input
                              type="text"
                              value={currentArr.cep || ''}
                            onChange={(e) => {
                                const formatted = formatCep(e.target.value);
                                updateArrematanteField('cep', formatted);
                                setCepErrorDivisao(null);
                                if (formatted.replace(/\D/g, '').length === 8) {
                                  buscarCepDivisao(formatted);
                                }
                              }}
                              disabled={loadingCepDivisao}
                              placeholder="00000-000"
                            className="wizard-input h-14 text-base border-0 border-b-2 border-gray-200 rounded-none focus-visible:border-gray-800 focus-visible:ring-0 focus-visible:outline-none px-0 bg-transparent placeholder:text-gray-400"
                          />
                            {loadingCepDivisao && <p className="text-sm text-gray-500">Buscando CEP...</p>}
                            {cepErrorDivisao && (
                              <p className="text-sm text-red-600 flex items-center gap-1">
                                <AlertCircle className="h-4 w-4" />
                                {cepErrorDivisao}
                              </p>
                            )}
                        </div>
                          
                          <div className="space-y-3">
                            <Label className="text-lg font-normal text-gray-600">Rua</Label>
                            <Input
                              type="text"
                              value={currentArr.rua || ''}
                              onChange={(e) => updateArrematanteField('rua', e.target.value)}
                              placeholder="Ex: Rua das Flores"
                              className="wizard-input h-14 text-base border-0 border-b-2 border-gray-200 rounded-none focus-visible:border-gray-800 focus-visible:ring-0 focus-visible:outline-none px-0 bg-transparent placeholder:text-gray-400"
                            />
                      </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-3">
                              <Label className="text-lg font-normal text-gray-600">Número</Label>
                              <Input
                                type="text"
                                value={currentArr.numero || ''}
                                onChange={(e) => updateArrematanteField('numero', e.target.value)}
                                placeholder="123"
                                className="wizard-input h-14 text-base border-0 border-b-2 border-gray-200 rounded-none focus-visible:border-gray-800 focus-visible:ring-0 focus-visible:outline-none px-0 bg-transparent placeholder:text-gray-400"
                              />
                            </div>
                            
                            <div className="space-y-3">
                              <Label className="text-lg font-normal text-gray-600">Complemento</Label>
                              <Input
                                type="text"
                                value={currentArr.complemento || ''}
                                onChange={(e) => updateArrematanteField('complemento', e.target.value)}
                                placeholder="Apto 101"
                                className="wizard-input h-14 text-base border-0 border-b-2 border-gray-200 rounded-none focus-visible:border-gray-800 focus-visible:ring-0 focus-visible:outline-none px-0 bg-transparent placeholder:text-gray-400"
                              />
                            </div>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-3">
                              <Label className="text-lg font-normal text-gray-600">Cidade</Label>
                              <Input
                                type="text"
                                value={currentArr.cidade || ''}
                                onChange={(e) => updateArrematanteField('cidade', e.target.value)}
                                placeholder="São Paulo"
                                className="wizard-input h-14 text-base border-0 border-b-2 border-gray-200 rounded-none focus-visible:border-gray-800 focus-visible:ring-0 focus-visible:outline-none px-0 bg-transparent placeholder:text-gray-400"
                              />
                            </div>
                            
                            <div className="space-y-3">
                              <Label className="text-lg font-normal text-gray-600">Estado</Label>
                              <Input
                                type="text"
                                value={currentArr.estado || ''}
                                onChange={(e) => updateArrematanteField('estado', e.target.value.toUpperCase())}
                                placeholder="SP"
                                maxLength={2}
                                className="wizard-input h-14 text-base border-0 border-b-2 border-gray-200 rounded-none focus-visible:border-gray-800 focus-visible:ring-0 focus-visible:outline-none px-0 bg-transparent placeholder:text-gray-400"
                              />
                            </div>
                              </div>
                        </>
                            )}
                      
                      {/* Subsessão 3: Condições de Pagamento */}
                      {arrematanteSubStep === 3 && (
                        <>
                          <div className="space-y-3">
                            <Label className="text-lg font-normal text-gray-600">Como deseja pagar?</Label>
                            <Select
                              value={currentArr.tipoPagamento || ''}
                              onValueChange={(v) => updateArrematanteField('tipoPagamento', v)}
                            >
                              <SelectTrigger className="h-14 text-base border-0 border-b-2 border-gray-200 rounded-none focus:border-gray-800 focus-visible:ring-0 focus-visible:outline-none focus:outline-none active:outline-none outline-none ring-0 px-0 bg-transparent [&:focus]:ring-0 [&:active]:ring-0">
                                <SelectValue placeholder="Selecione o tipo de pagamento" />
                              </SelectTrigger>
                              <SelectContent position="popper" sideOffset={5} className="z-[100000]">
                                <SelectItem value="a_vista">À Vista</SelectItem>
                                <SelectItem value="parcelamento">Parcelamento</SelectItem>
                                <SelectItem value="entrada_parcelamento">Entrada + Parcelamento</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          {/* À Vista */}
                          {currentArr.tipoPagamento === "a_vista" && (
                            <>
                              <div className="space-y-3">
                                <Label className="text-lg font-normal text-gray-600">Valor a Pagar</Label>
                                <Input
                                  type="text"
                                  placeholder="Ex: R$ 50.000,00"
                                  value={currentArr.valorPagar || ''}
                                  onChange={(e) => updateArrematanteField('valorPagar', e.target.value)}
                                  className="wizard-input h-14 text-base border-0 border-b-2 border-gray-200 rounded-none focus-visible:border-gray-800 focus-visible:ring-0 focus-visible:outline-none px-0 bg-transparent placeholder:text-gray-400"
                                />
                              </div>

                              <div className="space-y-3">
                                <Label className="text-lg font-normal text-gray-600">Data de Pagamento</Label>
                                <StringDatePicker
                                  value={currentArr.dataVencimentoVista || ""}
                                  onChange={(v) => updateArrematanteField('dataVencimentoVista', v)}
                                  placeholder="Selecione a data"
                                  className="wizard-input h-14 text-base border-0 border-b-2 border-gray-200 rounded-none focus-visible:border-gray-800 focus-visible:ring-0 focus-visible:outline-none px-0 bg-transparent"
                                />
                              </div>
                            </>
                          )}
                          
                          {/* Entrada + Parcelamento */}
                          {currentArr.tipoPagamento === "entrada_parcelamento" && (
                            <>
                              <div className="space-y-3">
                                <Label className="text-lg font-normal text-gray-600">Valor da Entrada</Label>
                                <Input
                                  type="text"
                                  placeholder="Ex: R$ 5.000,00"
                                  value={currentArr.valorEntrada || ''}
                                  onChange={(e) => updateArrematanteField('valorEntrada', e.target.value)}
                                  className="wizard-input h-14 text-base border-0 border-b-2 border-gray-200 rounded-none focus-visible:border-gray-800 focus-visible:ring-0 focus-visible:outline-none px-0 bg-transparent placeholder:text-gray-400"
                                />
                        </div>

                              <div className="space-y-3">
                                <Label className="text-lg font-normal text-gray-600">Data de pagamento da entrada</Label>
                                <StringDatePicker
                                  value={currentArr.dataEntrada || ""}
                                  onChange={(v) => updateArrematanteField('dataEntrada', v)}
                                  placeholder="Selecione a data"
                                  className="wizard-input h-14 text-base border-0 border-b-2 border-gray-200 rounded-none focus-visible:border-gray-800 focus-visible:ring-0 focus-visible:outline-none px-0 bg-transparent"
                                />
                      </div>
                            </>
                          )}

                          {/* Sistema de Fator Multiplicador - Para parcelamento e entrada_parcelamento */}
                          {(currentArr.tipoPagamento === "parcelamento" || currentArr.tipoPagamento === "entrada_parcelamento") && (
                            <>
                              {initial.auction?.percentualComissaoLeiloeiro && initial.auction.percentualComissaoLeiloeiro > 0 && (
                                <p className="text-sm text-gray-600 italic">
                                  Comissão do leiloeiro de {initial.auction.percentualComissaoLeiloeiro}% já incluída no valor total
                            </p>
                          )}
                              
                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-3">
                                  <Label className="text-lg font-normal text-gray-600">Valor do Lance (R$)</Label>
                                  <Input
                                    type="text"
                                    placeholder="Ex: 1.000,00"
                                    value={currentArr.valorLance || ""}
                                    onChange={(e) => updateArrematanteField('valorLance', e.target.value)}
                                    className="wizard-input h-14 text-base border-0 border-b-2 border-gray-200 rounded-none focus-visible:border-gray-800 focus-visible:ring-0 focus-visible:outline-none px-0 bg-transparent placeholder:text-gray-400"
                                  />
                                </div>

                                <div className="space-y-3">
                                  <Label className="text-lg font-normal text-gray-600">Fator Multiplicador</Label>
                                  <Input
                                    type="text"
                                    placeholder="Ex: 30"
                                    value={currentArr.fatorMultiplicador || ""}
                                    onChange={(e) => updateArrematanteField('fatorMultiplicador', e.target.value)}
                                    className="wizard-input h-14 text-base border-0 border-b-2 border-gray-200 rounded-none focus-visible:border-gray-800 focus-visible:ring-0 focus-visible:outline-none px-0 bg-transparent placeholder:text-gray-400"
                                  />
                        </div>
                      </div>

                              <div className="space-y-4">
                                <Label className="text-lg font-normal text-gray-900">Configuração de Parcelas</Label>
                                
                                <div className="grid grid-cols-3 gap-4">
                                  <div className="space-y-2">
                                    <Label className="text-sm text-gray-600">Parcelas Triplas</Label>
                                    <Input
                                      type="number"
                                      min="0"
                                      placeholder="0"
                                      value={currentArr.parcelasTriplas || ""}
                                      onChange={(e) => {
                                        const value = e.target.value === "" ? undefined : parseInt(e.target.value);
                                        updateArrematanteField('parcelasTriplas', value);
                                      }}
                                      className="h-12 text-sm focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus:border-black focus-visible:border-black"
                                    />
                                    <p className="text-xs text-gray-400">Valor × 3</p>
                            </div>

                                  <div className="space-y-2">
                                    <Label className="text-sm text-gray-600">Parcelas Duplas</Label>
                                    <Input
                                      type="number"
                                      min="0"
                                      placeholder="0"
                                      value={currentArr.parcelasDuplas || ""}
                                      onChange={(e) => {
                                        const value = e.target.value === "" ? undefined : parseInt(e.target.value);
                                        updateArrematanteField('parcelasDuplas', value);
                                      }}
                                      className="h-12 text-sm focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus:border-black focus-visible:border-black"
                                    />
                                    <p className="text-xs text-gray-400">Valor × 2</p>
                              </div>

                                  <div className="space-y-2">
                                    <Label className="text-sm text-gray-600">Parcelas Simples</Label>
                                    <Input
                                      type="number"
                                      min="0"
                                      placeholder="0"
                                      value={currentArr.parcelasSimples || ""}
                                      onChange={(e) => {
                                        const value = e.target.value === "" ? undefined : parseInt(e.target.value);
                                        updateArrematanteField('parcelasSimples', value);
                                      }}
                                      className="h-12 text-sm focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus:border-black focus-visible:border-black"
                                    />
                                    <p className="text-xs text-gray-400">Valor × 1</p>
                            </div>
                              </div>
                              
                              {/* Exibir resumo com comissão */}
                              {currentArr.valorLance && currentArr.fatorMultiplicador && (() => {
                                const valorLanceParsed = parseBrazilianNumber(currentArr.valorLance);
                                const fatorParsed = parseBrazilianNumber(currentArr.fatorMultiplicador);
                                if (valorLanceParsed && fatorParsed && valorLanceParsed > 0 && fatorParsed > 0) {
                                  const valorTotalParcelas = calcularValorTotal(valorLanceParsed, fatorParsed);
                                  const valorEntrada = currentArr.valorEntrada ? parseBrazilianNumber(currentArr.valorEntrada) : 0;
                                  
                                  // Aplicar comissão do leiloeiro se houver
                                  const percentualComissao = initial.auction?.percentualComissaoLeiloeiro || 0;
                                  const valorComComissao = percentualComissao > 0 
                                    ? valorTotalParcelas * (1 + percentualComissao / 100)
                                    : valorTotalParcelas;

                        return (
                                    <div className="space-y-2 mt-6">
                                      <div className="space-y-1 text-sm text-gray-600">
                                        <div className="flex justify-between">
                                          <span>Mercadoria</span>
                                          <span>{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valorTotalParcelas)}</span>
                            </div>
                                        
                                        {percentualComissao > 0 && (
                                          <div className="flex justify-between">
                                            <span>Comissão de Compra ({percentualComissao}%)</span>
                                            <span>+{new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valorComComissao - valorTotalParcelas)}</span>
                                          </div>
                                        )}
                                        
                                        <div className="flex justify-between font-medium text-gray-900 pt-1 border-t border-gray-200">
                                          <span>Total</span>
                                          <span>
                                            {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valorComComissao)}
                                            {currentArr.tipoPagamento === 'entrada_parcelamento' && valorEntrada > 0 && (
                                              <span className="text-gray-600 font-normal">
                                                {" + "}
                                                {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valorEntrada)}
                                                {" entrada"}
                                </span>
                                            )}
                                </span>
                              </div>
                                      </div>
                          </div>
                        );
                                }
                                return null;
                      })()}
                    </div>
                            </>
                          )}
                        </>
                      )}

                      {/* Subsessão 4: Documentos */}
                      {arrematanteSubStep === 4 && (
                        <div className="space-y-8">
                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                              <Label className="text-lg font-normal text-gray-600">Documentos anexados</Label>
                              <label className="cursor-pointer">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    const input = e.currentTarget.parentElement?.querySelector('input[type="file"]') as HTMLInputElement;
                                    input?.click();
                                  }}
                                  className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors"
                                >
                                  <Plus className="h-5 w-5" />
                                </button>
                                <input
                                  type="file"
                                  multiple
                                  onChange={handleFileUploadDivisao}
                                  className="hidden"
                                />
                              </label>
          </div>

                            {(!currentArr.documentos || currentArr.documentos.length === 0) ? (
                              <p className="text-sm text-gray-400 py-4">Nenhum documento adicionado</p>
                            ) : currentArr.documentos.length <= 3 ? (
                              // Mostrar lista simples para até 3 documentos
                              <div className="space-y-2">
                                {currentArr.documentos.map((doc) => (
                                  <div key={doc.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors">
                                    <button
                                      type="button"
                  onClick={() => {
                                        try { logDocumentAction('view', doc.nome || 'documento', 'bidder', initial.auction?.nome || '', initial.auction?.id || ''); } catch { /* */ }
                                        if (doc.url) {
                                          openDocumentSafely(doc.url, doc.nome || 'Documento');
                                        }
                  }}
                                      className="text-sm text-gray-700 truncate flex-1 text-left hover:text-blue-600 transition-colors"
                                    >
                                      {doc.nome}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => removeDocumentDivisao(doc.id)}
                                      className="ml-2 text-gray-400 hover:text-red-600 transition-colors"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              // Usar seletor para mais de 3 documentos
                              <>
                                 <div className="flex items-center gap-3">
                                   <Select
                                     value={selectedDocIndexDivisao.toString()}
                                     onValueChange={(v) => setSelectedDocIndexDivisao(parseInt(v))}
                                   >
                                     <SelectTrigger className="h-11 flex-1 border-gray-200 focus:ring-0 focus:outline-none focus-visible:ring-0">
                                       <SelectValue>
                                         Documento {selectedDocIndexDivisao + 1} de {currentArr.documentos.length}
                                       </SelectValue>
                                     </SelectTrigger>
                                     <SelectContent position="popper" sideOffset={5} className="z-[100000] max-h-[300px] overflow-auto">
                                       {currentArr.documentos.map((doc, index) => (
                                         <SelectItem key={doc.id} value={index.toString()}>
                                           {doc.nome}
                                         </SelectItem>
                                       ))}
                                     </SelectContent>
                                   </Select>
                                  
                                  <button
                                    type="button"
                onClick={() => {
                                      const doc = currentArr.documentos?.[selectedDocIndexDivisao];
                                      try { logDocumentAction('view', doc?.nome || 'documento', 'bidder', initial.auction?.nome || '', initial.auction?.id || ''); } catch { /* */ }
                                      if (doc?.url) {
                                        openDocumentSafely(doc.url, doc?.nome || 'Documento');
                                      }
                }}
                                    className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                    title="Visualizar documento"
                                  >
                                    <Eye className="h-4 w-4" />
                                  </button>
                                  
                                  <button
                                    type="button"
                onClick={() => {
                                      const doc = currentArr.documentos?.[selectedDocIndexDivisao];
                                      if (doc) {
                                        removeDocumentDivisao(doc.id);
                                        setSelectedDocIndexDivisao(Math.max(0, selectedDocIndexDivisao - 1));
                                      }
                                    }}
                                    className="w-10 h-10 flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                    title="Remover documento"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </div>

                                {currentArr.documentos[selectedDocIndexDivisao] && (
                                  <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                                    <p className="text-sm text-gray-700">{currentArr.documentos[selectedDocIndexDivisao].nome}</p>
                                    <p className="text-xs text-gray-500 mt-1">
                                      {currentArr.documentos[selectedDocIndexDivisao].tipo || "Tipo desconhecido"}
                                    </p>
                                  </div>
                                )}

                                <div className="flex justify-between items-center pt-4 border-t border-gray-100">
                                  <span className="text-sm text-gray-400">
                                    {currentArr.documentos.length} {currentArr.documentos.length === 1 ? 'documento' : 'documentos'}
                                  </span>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()
              )}

              {/* Botões de Navegação */}
              <div className="pt-8 flex gap-3">
              <Button
                onClick={async () => {
                  if (showPreview) {
                    // Finalizar - salvar todos os arrematantes
                    await handleFinalizarDivisao();
                  } else if (divisaoStep === 0) {
                    // Inicializar array de arrematantes
                    const newArr = Array.from({ length: numeroArrematantes }, () => ({ nome: '', documentos: [] }));
                    setArrematantesDivisao(newArr);
                    setDivisaoStep(1);
                  } else if (divisaoStep > 0 && divisaoStep <= numeroArrematantes) {
                    // Navegar entre subetapas do arrematante atual
                    if (arrematanteSubStep < 4) {
                      // Avançar para próxima subetapa
                      setArrematanteSubStep(arrematanteSubStep + 1);
                    } else {
                      // Validar antes de avançar para próximo arrematante
                    const currentArr = arrematantesDivisao[divisaoStep - 1];
                    if (!currentArr.nome.trim()) {
                      alert('Por favor, informe o nome do arrematante');
                      return;
                    }
                    
                      // Resetar subetapa e avançar para próximo arrematante ou preview
                      setArrematanteSubStep(0);
                      setSelectedDocIndexDivisao(0);
                      
                      if (divisaoStep < numeroArrematantes) {
                    setDivisaoStep(divisaoStep + 1);
                  } else {
                    // Ir para preview
                    setShowPreview(true);
                      }
                    }
                  }
                }}
                disabled={isSubmitting}
                className="w-full h-14 text-base font-normal bg-gray-800 hover:bg-gray-900 text-white rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                size="lg"
              >
                {showPreview && (
                  isSubmitting ? (
                    <>
                      Salvando...
                      <div className="ml-2 h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    </>
                  ) : (
                  <>
                    Confirmar Divisão
                    <Check className="h-5 w-5 ml-2" />
                  </>
                  )
                )}
                {!showPreview && divisaoStep === 0 && (
                  <>
                    Continuar
                    <ChevronRight className="h-5 w-5 ml-2" />
                  </>
                )}
                {!showPreview && divisaoStep > 0 && arrematanteSubStep < 4 && (
                  <>
                    Continuar
                    <ChevronRight className="h-5 w-5 ml-2" />
                  </>
                )}
                {!showPreview && divisaoStep > 0 && arrematanteSubStep === 4 && divisaoStep < numeroArrematantes && (
                  <>
                    Próximo Arrematante
                    <ChevronRight className="h-5 w-5 ml-2" />
                  </>
                )}
                {!showPreview && divisaoStep > 0 && arrematanteSubStep === 4 && divisaoStep === numeroArrematantes && (
                  <>
                    Ver Resumo
                    <ChevronRight className="h-5 w-5 ml-2" />
                  </>
                )}
              </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )}
    
    {/* Modal de Gerenciamento de Divisão Existente */}
    {showGerenciarDivisao && createPortal(
      <div className="fixed inset-0 bg-white z-[200000] overflow-auto">
        <div className="min-h-screen flex items-center justify-center px-8 py-16">
          <div className="w-full max-w-2xl">
            {/* Cabeçalho */}
            <div className="mb-10">
              <button
                onClick={() => setShowGerenciarDivisao(false)}
                className="fixed top-8 left-8 rounded-full w-12 h-12 bg-gray-50 hover:bg-gray-100 text-gray-600 hover:text-gray-700 flex items-center justify-center transition-all z-10"
              >
                <XIcon className="h-5 w-5" />
              </button>
              
              <h1 className="text-3xl font-normal text-gray-900 leading-tight mb-2">
                Divisão de Mercadoria
              </h1>
              <p className="text-sm text-gray-400">
                {arrematantesExistentesDivisao.length} {arrematantesExistentesDivisao.length === 1 ? 'arrematante cadastrado' : 'arrematantes cadastrados'}
              </p>
            </div>

            {/* Lista de Arrematantes Existentes */}
            <div className="space-y-3 mb-10">
              {arrematantesExistentesDivisao.map((arr, index) => (
                <div key={arr.id || index} className="p-5 bg-gray-50/50 rounded-xl border border-gray-100 hover:border-gray-200 transition-all">
                  <div className="flex items-start justify-between gap-6">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2 mb-3">
                        <span className="text-xs text-gray-400 font-medium">{index + 1}.</span>
                        <h3 className="text-base font-medium text-gray-900">{arr.nome}</h3>
                      </div>
                      <div className="space-y-1.5 text-sm text-gray-500 pl-4">
                        {arr.documento && (
                          <p>{arr.documento}</p>
                        )}
                        {arr.email && (
                          <p>{arr.email}</p>
                        )}
                        {arr.telefone && (
                          <p>{arr.telefone}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 text-sm">
                      <button
                        onClick={() => {
                          // Fechar modal de gerenciamento
                          setShowGerenciarDivisao(false);
                          
                          // Carregar dados do arrematante no formulário
                          const arrematante = arr;
                          let telefoneNum = arrematante?.telefone || "";
                          let codigoPaisVal = "+55";
                          if (telefoneNum && telefoneNum.startsWith("+")) {
                            const match = telefoneNum.match(/^(\+\d+)\s+(.+)$/);
                            if (match) {
                              codigoPaisVal = match[1];
                              telefoneNum = match[2];
                            }
                          }
                          
                          // Atualizar valores do formulário com dados do arrematante
                          setValues({
                            ...values,
                            id: arrematante?.id || "",
                            nome: arrematante?.nome || "",
                            documento: arrematante?.documento || "",
                            telefone: telefoneNum,
                            codigoPais: codigoPaisVal,
                            email: arrematante?.email || "",
                            cep: arrematante?.cep || "",
                            rua: arrematante?.rua || "",
                            numero: arrematante?.numero || "",
                            complemento: arrematante?.complemento || "",
                            bairro: arrematante?.bairro || "",
                            cidade: arrematante?.cidade || "",
                            estado: arrematante?.estado || "",
                            tipoPagamento: (arrematante?.tipoPagamento as "a_vista" | "parcelamento" | "entrada_parcelamento") || "parcelamento",
                            valorPagar: arrematante?.valorPagar || "",
                            valorEntrada: arrematante?.valorEntrada || "",
                            dataEntrada: arrematante?.dataEntrada || "",
                            dataVencimentoVista: arrematante?.dataVencimentoVista || "",
                            valorLance: arrematante?.valorLance?.toString() || "",
                            fatorMultiplicador: arrematante?.fatorMultiplicador?.toString() || "",
                            parcelasTriplas: arrematante?.parcelasTriplas,
                            parcelasDuplas: arrematante?.parcelasDuplas,
                            parcelasSimples: arrematante?.parcelasSimples,
                            documentos: arrematante?.documentos || [],
                          });
                          
                          // Definir ID do arrematante selecionado para modo de edição
                          setSelectedArrematanteId(arrematante?.id || null);
                          
                          // Voltar para o início do wizard principal
                          setCurrentStep(0);
                        }}
                        className="text-gray-500 hover:text-gray-900 transition-colors text-right"
                      >
                        Editar
                      </button>
                      <button
                        onClick={async () => {
                          if (confirm(`Deseja realmente remover ${arr.nome} da divisão?`)) {
                            try {
                              // Remover arrematante via hook (arquivar)
                              if (arr.id) {
                                await onSubmit({ id: arr.id, arquivado: true } as Partial<ArrematanteInfo>);
                                
                                // Atualizar lista local
                                const novosArrematantes = arrematantesExistentesDivisao.filter(a => a.id !== arr.id);
                                setArrematantesExistentesDivisao(novosArrematantes);
                                
                                // Se não sobrou nenhum arrematante, fechar o modal
                                if (novosArrematantes.length === 0) {
                                  setShowGerenciarDivisao(false);
                                  alert('Último arrematante removido. A divisão foi cancelada.');
                                } else {
                                  alert(`Arrematante removido! Restam ${novosArrematantes.length} arrematante(s).`);
                                }
                              }
                            } catch (error) {
                              logger.error('Erro ao remover arrematante:', error);
                              alert('Erro ao remover arrematante. Tente novamente.');
                            }
                          }
                        }}
                        className="text-gray-400 hover:text-red-500 transition-colors text-right"
                      >
                        Remover
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Botão de Adicionar */}
            <button
              onClick={() => {
                // Adicionar mais arrematantes
                setShowGerenciarDivisao(false);
                setShowDivisaoWizard(true);
              }}
              className="w-full py-4 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg hover:bg-gray-50 transition-all"
            >
              + Adicionar mais arrematantes
            </button>
          </div>
        </div>
      </div>,
    document.body
    )}
    
    {/* Modal de Importação para Divisão de Mercadoria */}
    {showImportModalDivisao && (
      <div 
        className="fixed inset-0 top-0 left-0 right-0 bottom-0 bg-white overflow-auto transition-opacity duration-300 opacity-100"
        style={{ 
          animation: 'wizardFadeIn 0.3s ease-out', 
          margin: 0, 
          padding: 0,
          zIndex: 100001
        }}
      >
        {/* Botão Fechar */}
        <div className="fixed top-8 left-8 z-20">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setShowImportModalDivisao(false);
              setSearchCpfDivisao("");
              setShowAllBiddersDivisao(false);
            }}
            className="rounded-full w-12 h-12 bg-gray-100 hover:bg-gray-200 text-gray-700 hover:text-gray-700"
          >
            <XIcon className="h-6 w-6" />
          </Button>
        </div>

        <div className="min-h-screen flex">
          {/* Conteúdo Principal */}
          <div className="flex-1 flex items-center justify-center px-8 md:px-20 py-16">
            <div className="w-full max-w-2xl space-y-12">
              {/* Título */}
              <div>
                <div className="flex items-center gap-4">
                  <h1 className="text-3xl md:text-4xl font-normal text-gray-900 leading-tight">
                    Buscar Arrematante
                  </h1>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setShowAllBiddersDivisao(!showAllBiddersDivisao);
                        if (!showAllBiddersDivisao) {
                          setSearchCpfDivisao('');
                        }
                      }}
                      onMouseEnter={() => setIsHoveringButtonDivisao(true)}
                      onMouseLeave={() => setIsHoveringButtonDivisao(false)}
                      className={`p-2.5 rounded-lg transition-all duration-200 ${
                        showAllBiddersDivisao 
                          ? 'bg-gray-900 text-white hover:bg-gray-800' 
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      <Users className="h-5 w-5" />
                    </button>
                    <span 
                      className={`text-sm font-medium whitespace-nowrap transition-all duration-200 ${
                        isHoveringButtonDivisao 
                          ? 'opacity-100 translate-x-0' 
                          : 'opacity-0 -translate-x-2 pointer-events-none'
                      } ${showAllBiddersDivisao ? 'text-gray-900' : 'text-gray-600'}`}
                    >
                      {showAllBiddersDivisao ? 'Ocultar lista' : 'Mostrar todos arrematantes'}
                    </span>
                  </div>
                </div>
                <p className="text-lg text-gray-600 mt-4">
                  {showAllBiddersDivisao 
                    ? `Navegue pela lista completa ou use a busca por ${searchModeDivisao === 'cpf' ? 'CPF/CNPJ' : 'nome'} para filtrar`
                    : `Digite o ${searchModeDivisao === 'cpf' ? 'CPF ou CNPJ' : 'nome'} para buscar e importar os dados pessoais de um arrematante existente`
                  }
                </p>
              </div>

              {/* Campo de Busca por CPF/CNPJ */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Label className="text-lg font-normal text-gray-600">
                      <span 
                        key={searchModeDivisao}
                        className="inline-block animate-in fade-in slide-in-from-top-1 duration-200"
                      >
                        {searchModeDivisao === 'cpf' ? 'CPF ou CNPJ' : 'Nome'}
                      </span>
                    </Label>
                  <button
                    type="button"
                    onClick={() => {
                      setSearchModeDivisao(searchModeDivisao === 'cpf' ? 'nome' : 'cpf');
                      setSearchCpfDivisao('');
                    }}
                    className="group flex items-center gap-1.5 transition-all"
                    title={searchModeDivisao === 'cpf' ? 'Buscar por nome' : 'Buscar por CPF/CNPJ'}
                  >
                    <ArrowLeftRight className="h-4 w-4 text-gray-400 group-hover:text-gray-700 transition-colors" />
                    <span className="text-sm text-gray-400 group-hover:text-gray-700 transition-colors">
                      {searchModeDivisao === 'cpf' ? 'Nome' : 'CPF/CNPJ'}
                    </span>
                  </button>
                </div>
                <Input
                  type="text"
                  placeholder={searchModeDivisao === 'cpf' ? 'Digite o CPF ou CNPJ para buscar' : 'Digite o nome para buscar'}
                  value={searchCpfDivisao}
                  onChange={(e) => {
                    let formatted;
                    if (searchModeDivisao === 'cpf') {
                      formatted = formatCpfCnpj(e.target.value);
                    } else {
                      // Remove números quando estiver no modo nome
                      formatted = e.target.value.replace(/[0-9]/g, '');
                    }
                    setSearchCpfDivisao(formatted);
                  }}
                  className="h-14 text-base border-0 border-b-2 border-gray-200 rounded-none focus-visible:border-gray-800 focus-visible:ring-0 focus-visible:outline-none px-0 bg-transparent placeholder:text-gray-400"
                />
                {searchCpfDivisao && (() => {
                  const arrematantesExistentes = initial.auction?.arrematantes || [];
                  const filtered = arrematantesExistentes.filter(arr => {
                    if (!searchCpfDivisao) return true;
                    
                    if (searchModeDivisao === 'nome') {
                      const buscaLimpa = searchCpfDivisao.toLowerCase().trim();
                      const nomeLimpo = (arr.nome || '').toLowerCase();
                      return nomeLimpo.startsWith(buscaLimpa);
                    } else {
                      return arr.documento?.includes(searchCpfDivisao.replace(/\D/g, ''));
                    }
                  });
                  return filtered.length === 0 ? (
                    <p className="text-sm text-amber-600 flex items-center gap-2">
                      <AlertCircle className="h-4 w-4" />
                      {searchModeDivisao === 'cpf' 
                        ? 'Nenhum arrematante encontrado com este CPF/CNPJ'
                        : 'Nenhum arrematante encontrado com este nome'
                      }
                    </p>
                  ) : null;
                })()}
              </div>

              {/* Título - Sempre visível */}
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-normal text-gray-900">
                  {(() => {
                    const arrematantesExistentes = initial.auction?.arrematantes || [];
                    const filtered = arrematantesExistentes.filter(arr => {
                      if (!searchCpfDivisao && !showAllBiddersDivisao) return false;
                      if (!searchCpfDivisao) return true;
                      
                      if (searchModeDivisao === 'nome') {
                        const buscaLimpa = searchCpfDivisao.toLowerCase().trim();
                        const nomeLimpo = (arr.nome || '').toLowerCase();
                        return nomeLimpo.startsWith(buscaLimpa);
                      } else {
                        return arr.documento?.includes(searchCpfDivisao.replace(/\D/g, ''));
                      }
                    });
                    return `Arrematantes Encontrados ${filtered.length > 0 ? `(${filtered.length})` : ''}`;
                  })()}
                </h2>
              </div>

              {/* Lista de Arrematantes */}
              {(searchCpfDivisao || showAllBiddersDivisao) && (() => {
                const arrematantesExistentes = initial.auction?.arrematantes || [];
                const filtered = arrematantesExistentes.filter(arr => {
                  if (!searchCpfDivisao) return true;
                  
                  if (searchModeDivisao === 'nome') {
                    const buscaLimpa = searchCpfDivisao.toLowerCase().trim();
                    const nomeLimpo = (arr.nome || '').toLowerCase();
                    return nomeLimpo.includes(buscaLimpa);
                  } else {
                    return arr.documento?.includes(searchCpfDivisao.replace(/\D/g, ''));
                  }
                });

                if (filtered.length === 0) return null;

                return (
                  <div className="space-y-3">
                    {filtered.map((arr, index) => {
                      const lote = initial.auction?.lotes?.find(l => l.id === arr.loteId);
                      
                      return (
                        <div
                          key={arr.id || index}
                          onClick={() => {
                            const arrIndex = divisaoStep - 1;
                            const newArr = [...arrematantesDivisao];
                            newArr[arrIndex] = {
                              ...newArr[arrIndex],
                              nome: arr.nome || '',
                              documento: arr.documento || '',
                              email: arr.email || '',
                              telefone: arr.telefone?.replace(/^\+\d+\s+/, '') || '',
                              codigoPais: arr.telefone?.match(/^(\+\d+)/)?.[1] || '+55',
                              cep: arr.cep || '',
                              rua: arr.rua || '',
                              numero: arr.numero || '',
                              complemento: arr.complemento || '',
                              bairro: arr.bairro || '',
                              cidade: arr.cidade || '',
                              estado: arr.estado || '',
                              documentos: arr.documentos ? [...arr.documentos] : []
                            };
                            setArrematantesDivisao(newArr);
                            setShowImportModalDivisao(false);
                            setSearchCpfDivisao("");
                            setShowAllBiddersDivisao(false);
                          }}
                          className="group p-5 border border-gray-200 rounded-xl cursor-pointer hover:border-gray-400 hover:shadow-sm transition-all duration-200 bg-white"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1 min-w-0">
                              <h3 className="text-lg font-medium text-gray-900 truncate group-hover:text-gray-950">
                                {arr.nome}
                              </h3>
                              <div className="mt-2 space-y-1">
                                {arr.documento && (
                                  <p className="text-sm text-gray-600">{arr.documento}</p>
                                )}
                                {arr.email && (
                                  <p className="text-sm text-gray-500 truncate">{arr.email}</p>
                                )}
                              </div>
                              {lote && (
                                <div className="mt-3 pt-3 border-t border-gray-100">
                                  <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Lote Arrematado</p>
                                  <p className="text-sm text-gray-600 truncate">Lote {lote.numero} - {lote.descricao}</p>
                                </div>
                              )}
                            </div>
                            <ChevronRight className="h-5 w-5 text-gray-300 group-hover:text-gray-600 flex-shrink-0 ml-4 transition-colors" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      </div>
    )}

    </>,
        document.body
      )}

      {/* Modal de Confirmação para Cancelar Divisão */}
      <AlertDialog open={showCancelDivisaoModal} onOpenChange={setShowCancelDivisaoModal}>
        <AlertDialogPortal>
          <AlertDialogOverlay className="z-[300000]" />
          <AlertDialogPrimitive.Content className="fixed left-[50%] top-[50%] z-[300001] grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-white p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg">
            <AlertDialogHeader>
              <AlertDialogTitle>Cancelar divisão de mercadoria?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta ação não pode ser desfeita. Todas as informações de divisão e dados dos arrematantes adicionais serão permanentemente descartados.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Voltar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  setShowDivisaoWizard(false);
                  setDivisaoStep(0);
                  setArrematantesDivisao([]);
                  setShowPreview(false);
                  setArrematanteSubStep(0);
                  setSelectedDocIndexDivisao(0);
                  setNumeroArrematantes(1);
                  setNumeroArrematantesInput('1');
                }}
                className="bg-black text-white hover:bg-black/90"
              >
                Confirmar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogPrimitive.Content>
        </AlertDialogPortal>
      </AlertDialog>
    </>
  );
}