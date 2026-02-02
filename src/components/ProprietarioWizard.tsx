import { useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { logger } from "@/lib/logger";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectGroup, SelectLabel } from "@/components/ui/select";
import { ChevronRight, Check, X, Upload, FileText, Trash2 } from "lucide-react";

// Componente de bandeira (SVG)
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
          <circle cx="13" cy="8" r="3" fill="#0047A0"/>
        </svg>
      );
    case '+86': // China
      return (
        <svg className={flagClass} viewBox="0 0 24 16" fill="none">
          <rect width="24" height="16" fill="#DE2910"/>
          <path d="M6 3 L7 6 L4 4 L8 4 L5 6 Z" fill="#FFDE00"/>
        </svg>
      );
    case '+91': // Índia
      return (
        <svg className={flagClass} viewBox="0 0 24 16" fill="none">
          <rect width="24" height="5.33" fill="#FF9933"/>
          <rect y="5.33" width="24" height="5.33" fill="white"/>
          <rect y="10.67" width="24" height="5.33" fill="#138808"/>
          <circle cx="12" cy="8" r="2" stroke="#000080" strokeWidth="0.3" fill="none"/>
        </svg>
      );
    case '+66': // Tailândia
      return (
        <svg className={flagClass} viewBox="0 0 24 16" fill="none">
          <rect width="24" height="2.67" fill="#ED1C24"/>
          <rect y="2.67" width="24" height="2.67" fill="white"/>
          <rect y="5.33" width="24" height="5.33" fill="#241D4F"/>
          <rect y="10.67" width="24" height="2.67" fill="white"/>
          <rect y="13.33" width="24" height="2.67" fill="#ED1C24"/>
        </svg>
      );
    case '+65': // Singapura
      return (
        <svg className={flagClass} viewBox="0 0 24 16" fill="none">
          <rect width="24" height="8" fill="#ED2939"/>
          <rect y="8" width="24" height="8" fill="white"/>
          <circle cx="6" cy="4" r="2.5" fill="white"/>
        </svg>
      );
    case '+60': // Malásia
      return (
        <svg className={flagClass} viewBox="0 0 24 16" fill="none">
          <rect width="24" height="1.14" fill="#CC0000"/>
          <rect y="2.28" width="24" height="1.14" fill="#CC0000"/>
          <rect y="4.56" width="24" height="1.14" fill="#CC0000"/>
          <rect y="6.84" width="24" height="1.14" fill="#CC0000"/>
          <rect y="9.12" width="24" height="1.14" fill="#CC0000"/>
          <rect y="11.4" width="24" height="1.14" fill="#CC0000"/>
          <rect y="13.68" width="24" height="2.32" fill="#CC0000"/>
          <rect width="12" height="8" fill="#010066"/>
        </svg>
      );
    case '+62': // Indonésia
      return (
        <svg className={flagClass} viewBox="0 0 24 16" fill="none">
          <rect width="24" height="8" fill="#FF0000"/>
          <rect y="8" width="24" height="8" fill="white"/>
        </svg>
      );
    case '+63': // Filipinas
      return (
        <svg className={flagClass} viewBox="0 0 24 16" fill="none">
          <path d="M0 0 L12 8 L0 16 Z" fill="white"/>
          <rect x="12" width="12" height="8" fill="#0038A8"/>
          <rect x="12" y="8" width="12" height="8" fill="#CE1126"/>
        </svg>
      );
    case '+84': // Vietnã
      return (
        <svg className={flagClass} viewBox="0 0 24 16" fill="none">
          <rect width="24" height="16" fill="#DA251D"/>
          <path d="M12 4 L13 7 L16 7 L13.5 9 L14.5 12 L12 10 L9.5 12 L10.5 9 L8 7 L11 7 Z" fill="#FFFF00"/>
        </svg>
      );
    default:
      return (
        <svg className={flagClass} viewBox="0 0 24 16" fill="none">
          <rect width="24" height="16" fill="#CCCCCC"/>
        </svg>
      );
  }
};

const paisesOptions = [
  { codigo: '+55', nome: 'Brasil' },
  { codigo: '+1', nome: 'EUA' },
  { codigo: '+1', nome: 'Canadá' },
  { codigo: '+54', nome: 'Argentina' },
  { codigo: '+52', nome: 'México' },
  { codigo: '+56', nome: 'Chile' },
  { codigo: '+57', nome: 'Colômbia' },
  { codigo: '+595', nome: 'Paraguai' },
  { codigo: '+598', nome: 'Uruguai' },
  { codigo: '+593', nome: 'Equador' },
  { codigo: '+51', nome: 'Peru' },
  { codigo: '+58', nome: 'Venezuela' },
  { codigo: '+591', nome: 'Bolívia' },
  { codigo: '+351', nome: 'Portugal' },
  { codigo: '+34', nome: 'Espanha' },
  { codigo: '+81', nome: 'Japão' },
  { codigo: '+82', nome: 'Coreia do Sul' },
  { codigo: '+86', nome: 'China' },
  { codigo: '+91', nome: 'Índia' },
  { codigo: '+66', nome: 'Tailândia' },
  { codigo: '+65', nome: 'Singapura' },
  { codigo: '+60', nome: 'Malásia' },
  { codigo: '+62', nome: 'Indonésia' },
  { codigo: '+63', nome: 'Filipinas' },
  { codigo: '+84', nome: 'Vietnã' },
];

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
    
    case '+66': // Tailândia
    case '+65': // Singapura
    case '+60': // Malásia
    case '+62': // Indonésia
    case '+63': // Filipinas
    case '+84': // Vietnã
      {
        const limited = numbers.slice(0, 10);
        // Formato: 000-000-0000
        return limited
          .replace(/(\d{3})(\d)/, '$1-$2')
          .replace(/(\d{3})(\d{1,4})$/, '$1-$2');
      }
    
    default:
      // Para países não especificados, limita a 15 dígitos e retorna sem formatação
      return numbers.slice(0, 15);
  }
};

interface DocumentoProprietario {
  nome: string;
  base64: string;
}

interface ProprietarioDataInternal {
  proprietario: string;
  codigoPais: string;
  celularProprietario: string;
  emailProprietario: string;
  documentos: DocumentoProprietario[];
}

interface ProprietarioData {
  proprietario: string;
  codigoPais: string;
  celularProprietario: string;
  emailProprietario: string;
  documentos: string[];
}

interface ProprietarioWizardProps {
  onSubmit: (data: ProprietarioData) => void;
  onCancel: () => void;
  initialData?: Partial<ProprietarioData>;
}

export function ProprietarioWizard({ onSubmit, onCancel, initialData }: ProprietarioWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isClosing, setIsClosing] = useState(false);
  const [attemptedNext, setAttemptedNext] = useState(false); // Para mostrar erros de validação
  
  const [values, setValues] = useState<ProprietarioDataInternal>({
    proprietario: initialData?.proprietario || "",
    codigoPais: initialData?.codigoPais || "+55",
    celularProprietario: initialData?.celularProprietario || "",
    emailProprietario: initialData?.emailProprietario || "",
    documentos: initialData?.documentos?.map(doc => ({
      nome: `documento_${crypto.randomUUID().split('-')[0]}.pdf`, // 🔒 SEGURANÇA: ID seguro
      base64: doc
    })) || [],
  });

  const updateField = <K extends keyof ProprietarioDataInternal>(field: K, value: ProprietarioDataInternal[K]) => {
    setValues(prev => ({ ...prev, [field]: value }));
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    
    for (const file of fileArray) {
      try {
        const reader = new FileReader();
        reader.onload = (event) => {
          const base64 = event.target?.result as string;
          setValues(prev => ({
            ...prev,
            documentos: [...prev.documentos, { nome: file.name, base64 }]
          }));
        };
        reader.readAsDataURL(file);
      } catch (error) {
        logger.error("Erro ao processar arquivo:", error);
      }
    }
  };

  const removeDocumento = (index: number) => {
    setValues(prev => ({
      ...prev,
      documentos: prev.documentos.filter((_, i) => i !== index)
    }));
  };

  const openDocumento = (doc: DocumentoProprietario, _index: number) => {
    logger.debug('📄 Tentando abrir documento:', doc.nome);
    
    const isBase64 = doc.base64.startsWith('data:');
    const isUrl = doc.base64.startsWith('http://') || doc.base64.startsWith('https://');
    const canOpen = isBase64 || isUrl;
    
    logger.debug('Clicou no documento:', doc.nome);
    logger.debug('É base64?', isBase64);
    logger.debug('É URL?', isUrl);
    logger.debug('Pode abrir?', canOpen);
    
    if (!canOpen) {
      return;
    }

    if (isBase64) {
      try {
        logger.debug('🔄 Convertendo base64 para blob...');
        const base64Match = doc.base64.match(/^data:(.+);base64,(.+)$/);
        if (base64Match) {
          const mimeType = base64Match[1];
          const base64Data = base64Match[2];
          
          logger.debug('✅ MIME type:', mimeType);
          logger.debug('✅ Base64 length:', base64Data.length);
          
          const byteCharacters = atob(base64Data);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const blob = new Blob([byteArray], { type: mimeType });
          logger.debug('✅ Blob criado:', blob.size, 'bytes');
          
          const blobUrl = URL.createObjectURL(blob);
          logger.debug('✅ Blob URL criado:', blobUrl);
          
          // Para PDFs, criar página HTML com iframe
          if (mimeType === 'application/pdf') {
            logger.debug('📄 Abrindo PDF em iframe...');
            const newWindow = window.open('', '_blank');
            if (newWindow) {
              newWindow.document.write(`
                <!DOCTYPE html>
                <html>
                  <head>
                    <title>${doc.nome}</title>
                    <meta charset="UTF-8">
                    <style>
                      * { margin: 0; padding: 0; }
                      html, body { height: 100%; overflow: hidden; }
                      iframe { width: 100%; height: 100%; border: none; }
                    </style>
                  </head>
                  <body>
                    <iframe src="${blobUrl}" type="application/pdf"></iframe>
                  </body>
                </html>
              `);
              newWindow.document.close();
              
              setTimeout(() => {
                URL.revokeObjectURL(blobUrl);
              }, 120000);
            } else {
              URL.revokeObjectURL(blobUrl);
            }
          } else {
            // Para outros tipos (imagens, DOC, etc), abrir diretamente
            const newWindow = window.open(blobUrl, '_blank');
            
            if (newWindow) {
              setTimeout(() => {
                URL.revokeObjectURL(blobUrl);
              }, 120000);
            } else {
              URL.revokeObjectURL(blobUrl);
            }
          }
        } else {
          logger.error('❌ Formato base64 inválido');
        }
      } catch (error) {
        logger.error('❌ Erro ao abrir base64:', error);
      }
    } else {
      // Para URLs normais
      window.open(doc.base64, '_blank');
    }
  };

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      onCancel();
    }, 300);
  };

  const handleNext = () => {
    setAttemptedNext(true); // Marcar que tentou avançar
    
    // Validação do step atual
    if (currentStep === 0) {
      // Validar todos os campos obrigatórios
      if (!values.proprietario.trim() || !values.celularProprietario.trim() || !values.emailProprietario.trim() || !values.emailProprietario.includes('@')) {
        // Não avança se houver erros
        return;
      }
    }
    
    // Se passou na validação, limpar attemptedNext e avançar
    setAttemptedNext(false);
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setAttemptedNext(false);
      setCurrentStep(currentStep - 1);
    }
  };

  const goToStep = (stepIndex: number) => {
    // Permitir navegar apenas para trás ou para a etapa atual
    if (stepIndex <= currentStep) {
      setAttemptedNext(false);
      setCurrentStep(stepIndex);
    }
  };

  const handleSubmit = () => {
    setAttemptedNext(true);
    
    // Validar todos os campos obrigatórios
    if (!values.proprietario.trim() || !values.celularProprietario.trim() || !values.emailProprietario.trim() || !values.emailProprietario.includes('@')) {
      // Voltar para a primeira etapa se houver erros
      setCurrentStep(0);
      return;
    }

    // Converter documentos de volta para string[] para manter compatibilidade
    const dataToSubmit: ProprietarioData = {
      proprietario: values.proprietario,
      codigoPais: values.codigoPais,
      celularProprietario: values.celularProprietario,
      emailProprietario: values.emailProprietario,
      documentos: values.documentos.map(doc => doc.base64),
    };

    onSubmit(dataToSubmit);
    handleClose();
  };

  const steps = [
    {
      id: "proprietario",
      title: "Informações do Proprietário",
      content: (
        <div className="space-y-8">
          <div className="space-y-3">
            <Label className="text-lg font-normal text-gray-600">
              Nome do Proprietário da Mercadoria <span className="text-red-500">*</span>
            </Label>
            <Input
              type="text"
              placeholder="Digite o nome completo"
              value={values.proprietario}
              onChange={(e) => updateField("proprietario", e.target.value)}
              className="wizard-input h-14 text-base border-0 border-b-2 border-gray-200 rounded-none focus-visible:border-gray-800 focus-visible:ring-0 focus-visible:outline-none px-0 bg-transparent placeholder:text-gray-400"
            />
            {!values.proprietario && attemptedNext && (
              <p className="text-sm text-red-600">Por favor, preencha o nome do proprietário.</p>
            )}
          </div>

          <div className="space-y-3">
            <Label className="text-lg font-normal text-gray-600">
              Celular do Proprietário da Mercadoria <span className="text-red-500">*</span>
            </Label>
            <div className="flex gap-3">
              <Select
                value={values.codigoPais}
                onValueChange={(value) => {
                  // Extrair código e nome do valor selecionado
                  const pais = paisesOptions.find(p => p.codigo === value || `${p.codigo}-${p.nome}` === value);
                  if (pais) {
                    updateField("codigoPais", pais.codigo);
                  }
                }}
              >
                <SelectTrigger className="w-[140px] h-14 text-base border-0 border-b-2 border-gray-200 rounded-none focus:border-gray-800 outline-none [&:focus]:ring-0 [&:focus]:outline-none">
                  <div className="flex items-center gap-2">
                    <FlagIcon 
                      countryCode={values.codigoPais} 
                      countryName={paisesOptions.find(p => p.codigo === values.codigoPais)?.nome}
                    />
                    <span>{values.codigoPais}</span>
                  </div>
                </SelectTrigger>
                <SelectContent className="bg-white z-[100000]">
                  <SelectGroup>
                    <SelectLabel>Américas</SelectLabel>
                    {paisesOptions.filter(p => ['+55', '+1', '+54', '+52', '+56', '+57', '+595', '+598', '+593', '+51', '+58', '+591'].includes(p.codigo)).map((pais, index) => (
                      <SelectItem key={`${pais.codigo}-${pais.nome}-${index}`} value={`${pais.codigo}-${pais.nome}`}>
                        <div className="flex items-center gap-2">
                          <FlagIcon countryCode={pais.codigo} countryName={pais.nome} />
                          <span className="text-sm">{pais.nome} ({pais.codigo})</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                  <SelectGroup>
                    <SelectLabel>Europa</SelectLabel>
                    {paisesOptions.filter(p => ['+351', '+34'].includes(p.codigo)).map((pais, index) => (
                      <SelectItem key={`${pais.codigo}-${pais.nome}-${index}`} value={`${pais.codigo}-${pais.nome}`}>
                        <div className="flex items-center gap-2">
                          <FlagIcon countryCode={pais.codigo} countryName={pais.nome} />
                          <span className="text-sm">{pais.nome} ({pais.codigo})</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                  <SelectGroup>
                    <SelectLabel>Ásia</SelectLabel>
                    {paisesOptions.filter(p => ['+81', '+82', '+86', '+91', '+66', '+65', '+60', '+62', '+63', '+84'].includes(p.codigo)).map((pais, index) => (
                      <SelectItem key={`${pais.codigo}-${pais.nome}-${index}`} value={`${pais.codigo}-${pais.nome}`}>
                        <div className="flex items-center gap-2">
                          <FlagIcon countryCode={pais.codigo} countryName={pais.nome} />
                          <span className="text-sm">{pais.nome} ({pais.codigo})</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Input
                type="tel"
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
                    case '+86': return "138-0000-0000";
                    case '+81': return "090-1234-5678";
                    case '+82': return "010-1234-5678";
                    case '+91': return "98765-43210";
                    case '+66': return "081-234-5678";
                    case '+65': return "812-3456";
                    case '+60': return "012-345-6789";
                    case '+62': return "812-345-6789";
                    case '+63': return "917-123-4567";
                    case '+84': return "091-234-5678";
                    default: return "Digite o número";
                  }
                })()}
                value={values.celularProprietario}
                onChange={(e) => {
                  const formatted = formatTelefone(e.target.value, values.codigoPais || '+55');
                  updateField("celularProprietario", formatted);
                }}
                className="flex-1 wizard-input h-14 text-base border-0 border-b-2 border-gray-200 rounded-none focus-visible:border-gray-800 focus-visible:ring-0 focus-visible:outline-none px-0 bg-transparent placeholder:text-gray-400"
              />
            </div>
            {!values.celularProprietario && attemptedNext && (
              <p className="text-sm text-red-600">Por favor, preencha o celular do proprietário.</p>
            )}
          </div>

          <div className="space-y-3">
            <Label className="text-lg font-normal text-gray-600">
              E-mail do Proprietário da Mercadoria <span className="text-red-500">*</span>
            </Label>
            <Input
              type="email"
              placeholder="exemplo@email.com"
              value={values.emailProprietario}
              onChange={(e) => updateField("emailProprietario", e.target.value)}
              className="wizard-input h-14 text-base border-0 border-b-2 border-gray-200 rounded-none focus-visible:border-gray-800 focus-visible:ring-0 focus-visible:outline-none px-0 bg-transparent placeholder:text-gray-400"
            />
            {!values.emailProprietario && attemptedNext && (
              <p className="text-sm text-red-600">Por favor, preencha o e-mail do proprietário.</p>
            )}
            {values.emailProprietario && !values.emailProprietario.includes('@') && attemptedNext && (
              <p className="text-sm text-red-600">O e-mail deve conter o símbolo @</p>
            )}
          </div>
        </div>
      )
    },
    {
      id: "documentacoes",
      title: "Documentações",
      content: (
        <div className="space-y-8">
          <div className="space-y-4">
            <Label className="text-lg font-normal text-gray-600">
              Adicionar Documentos (Opcional)
            </Label>
            <p className="text-sm text-gray-500">
              Você pode adicionar documentos relacionados ao lote convidado (contratos, certificados, etc.)
            </p>

            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-gray-400 transition-colors">
              <input
                type="file"
                id="file-upload"
                className="hidden"
                multiple
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                onChange={handleFileSelect}
              />
              <label
                htmlFor="file-upload"
                className="cursor-pointer flex flex-col items-center gap-3"
              >
                <Upload className="h-12 w-12 text-gray-400" />
                <div>
                  <p className="text-base font-medium text-gray-700">
                    Clique para adicionar documentos
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    PDF, DOC, DOCX, JPG, PNG (máx. 10MB cada)
                  </p>
                </div>
              </label>
            </div>

            {values.documentos.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-700">
                  Documentos adicionados ({values.documentos.length})
                </Label>
                <div className="space-y-2">
                  {values.documentos.map((doc, index) => {
                    const fileType = doc.base64.split(';')[0].split(':')[1];
                    const _isImage = fileType?.startsWith('image/');
                    const _isPDF = fileType === 'application/pdf';

                    return (
                      <div
                        key={index}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors group"
                      >
                        <button
                          type="button"
                          onClick={() => openDocumento(doc, index)}
                          className="flex items-center gap-3 flex-1 text-left"
                        >
                          <FileText className="h-5 w-5 text-gray-500" />
                          <div>
                            <span className="text-sm text-gray-700 font-medium">
                              {doc.nome}
                            </span>
                            <p className="text-xs text-gray-500 mt-0.5">
                              Clique para visualizar
                            </p>
                          </div>
                        </button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeDocumento(index)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )
    },
    {
      id: "confirmacao",
      title: "Confirmação",
      content: (
        <div className="space-y-8">
          <div className="space-y-6">
            <div>
              <h3 className="text-xl font-medium text-gray-900 mb-4">
                Revise as informações antes de finalizar
              </h3>
              <p className="text-sm text-gray-500">
                Verifique se todos os dados estão corretos. Você poderá editar essas informações posteriormente na aba "Lotes Convidados".
              </p>
            </div>

            <div className="space-y-4 p-6 bg-gray-50 rounded-lg border border-gray-200">
              <div>
                <Label className="text-sm text-gray-500">Proprietário</Label>
                <p className="text-base font-medium text-gray-900 mt-1">
                  {values.proprietario || "-"}
                </p>
              </div>

              {values.celularProprietario && (
                <div>
                  <Label className="text-sm text-gray-500">Celular</Label>
                  <p className="text-base font-medium text-gray-900 mt-1">
                    {values.codigoPais} {values.celularProprietario}
                  </p>
                </div>
              )}

              {values.emailProprietario && (
                <div>
                  <Label className="text-sm text-gray-500">E-mail</Label>
                  <p className="text-base font-medium text-gray-900 mt-1">
                    {values.emailProprietario}
                  </p>
                </div>
              )}

              {values.documentos.length > 0 && (
                <div>
                  <Label className="text-sm text-gray-500">Documentos</Label>
                  <div className="mt-2 space-y-1">
                    {values.documentos.map((doc, index) => (
                      <p key={index} className="text-sm text-gray-700">
                        • {doc.nome}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )
    },
  ];

  const currentStepData = steps[currentStep];

  return createPortal(
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
          onClick={currentStep === 0 ? handleClose : handleBack}
          className="rounded-full w-12 h-12 bg-gray-100 hover:bg-gray-200 text-gray-900 hover:text-gray-900"
        >
          {currentStep === 0 ? (
            <X className="h-6 w-6" />
          ) : (
            <ChevronRight className="h-6 w-6 rotate-180" />
          )}
        </Button>
      </div>

      <div className="min-h-screen flex">
        {/* Indicadores de Etapas - Lateral Esquerda */}
        <div className="hidden md:flex flex-col justify-center w-80 px-12">
          <div className="space-y-4">
            {steps.map((step, index) => (
              <div
                key={index}
                onClick={() => goToStep(index)}
                className={`text-lg font-normal transition-colors duration-200 ${
                  index <= currentStep ? 'cursor-pointer' : 'cursor-not-allowed'
                } ${
                  index === currentStep
                    ? "text-gray-700"
                    : index < currentStep
                    ? "text-gray-400 hover:text-gray-700"
                    : "text-gray-300"
                }`}
              >
                {step.title}
              </div>
            ))}
          </div>
        </div>

        {/* Conteúdo Principal */}
        <div className="flex-1 flex items-center justify-center px-8 md:px-20 py-16">
          <div className="w-full max-w-2xl space-y-12">
            {/* Título da Etapa */}
            <div>
              <h1 className="text-3xl md:text-4xl font-normal text-gray-900 leading-tight">
                {currentStepData.title}
              </h1>
            </div>

            {/* Conteúdo da Etapa */}
            <div>{currentStepData.content}</div>

            {/* Botões de Navegação */}
            <div className="flex items-center justify-end pt-4">
              {currentStep < steps.length - 1 ? (
                <Button
                  type="button"
                  onClick={handleNext}
                  className="bg-black hover:bg-gray-800 text-white px-8 h-12"
                >
                  Avançar
                  <ChevronRight className="h-5 w-5 ml-1" />
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={handleSubmit}
                  className="bg-black hover:bg-gray-800 text-white px-8 h-12"
                >
                  <Check className="h-5 w-5 mr-2" />
                  Confirmar
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes wizardFadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
      `}</style>
    </div>,
    document.body
  );
}
