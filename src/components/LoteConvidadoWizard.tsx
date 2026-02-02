import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { logger } from "@/lib/logger";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from "@/components/ui/select";
import { AlertCircle, ChevronRight, ChevronLeft, Check, Plus, Trash2, X, Phone, Mail, Package, Edit } from "lucide-react";
import { useGuestLots } from "@/hooks/use-guest-lots";
import { LoteConvidadoFormData, MercadoriaInfo } from "@/lib/types";

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

interface LoteConvidadoWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave?: (data: LoteConvidadoFormData) => void;
  initialData?: Partial<LoteConvidadoFormData>;
  leiloes?: Array<{ id: string; nome: string }>;
}

export default function LoteConvidadoWizard({ 
  open, 
  onOpenChange, 
  onSave,
  initialData,
  leiloes = []
}: LoteConvidadoWizardProps) {
  const { createGuestLot, updateGuestLot } = useGuestLots();
  const [currentStep, setCurrentStep] = useState(0);
  const [attemptedNext, setAttemptedNext] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [documentFiles, setDocumentFiles] = useState<{ name: string; url: string; type: string }[]>([]);
  const [documentMetadata, setDocumentMetadata] = useState<{ name: string; type: string }[]>([]);
  
  // Detectar se está em modo de edição
  const isEditMode = !!(initialData && (initialData as any).id);
  
  const [values, setValues] = useState<LoteConvidadoFormData>({
    numero: "",
    descricao: "",
    proprietario: "",
    codigoPais: "+55",
    celularProprietario: "",
    emailProprietario: "",
    mercadorias: [],
    documentos: [],
    imagens: [],
    leilaoId: "",
    observacoes: "",
    ...initialData
  });

  const [currentMercadoria, setCurrentMercadoria] = useState<MercadoriaInfo>({
    id: crypto.randomUUID(),
    nome: "",
    descricao: "",
    quantidade: 1,
    valorEstimado: undefined
  });
  
  const [selectedMercadoriaIndex, setSelectedMercadoriaIndex] = useState(0);
  const [editingMercadoriaId, setEditingMercadoriaId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      if (initialData) {
        // Modo de edição: carregar dados existentes
        logger.debug('🔍 [LoteConvidadoWizard] Carregando initialData:', initialData);
        logger.debug('📦 [LoteConvidadoWizard] Mercadorias recebidas:', initialData.mercadorias);
        const newValues = {
          numero: "",
          descricao: "",
          proprietario: "",
          codigoPais: "+55",
          celularProprietario: "",
          emailProprietario: "",
          mercadorias: [],
          documentos: [],
          imagens: [],
          leilaoId: "",
          observacoes: "",
          ...initialData
        };
        logger.debug('✅ [LoteConvidadoWizard] newValues calculados:', newValues);
        logger.debug('✅ [LoteConvidadoWizard] newValues.mercadorias:', newValues.mercadorias);
        setValues(newValues);
      } else {
        // Modo de criação: resetar valores
        logger.debug('➕ [LoteConvidadoWizard] Modo criação - resetando valores');
        setValues({
          numero: "",
          descricao: "",
          proprietario: "",
          codigoPais: "+55",
          celularProprietario: "",
          emailProprietario: "",
          mercadorias: [],
          documentos: [],
          imagens: [],
          leilaoId: "",
          observacoes: "",
        });
        setDocumentFiles([]);
        setDocumentMetadata([]);
      }
      setCurrentStep(0);
      setAttemptedNext(false);
      setSelectedMercadoriaIndex(0);
    }
  }, [open, initialData]);

  // Log para debug quando values mudar
  useEffect(() => {
    logger.debug('📊 [LoteConvidadoWizard] values atualizados:', values);
    logger.debug('📊 [LoteConvidadoWizard] values.mercadorias:', values.mercadorias);
  }, [values]);


  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Limpar URLs de objetos quando o componente for desmontado
  useEffect(() => {
    return () => {
      documentFiles.forEach(file => {
        URL.revokeObjectURL(file.url);
      });
    };
  }, [documentFiles]);

  const updateField = <K extends keyof LoteConvidadoFormData>(field: K, value: LoteConvidadoFormData[K]) => {
    setValues(prev => ({ ...prev, [field]: value }));
  };

  const formatPhoneNumber = (value: string): string => {
    // Remove tudo que não é número
    const numbers = value.replace(/\D/g, '');
    
    // Limita a 11 dígitos (DDD + 9 dígitos)
    const limited = numbers.slice(0, 11);
    
    // Aplica a formatação: (XX) XXXXX-XXXX ou (XX) XXXX-XXXX
    if (limited.length <= 2) {
      return limited;
    } else if (limited.length <= 7) {
      return `(${limited.slice(0, 2)}) ${limited.slice(2)}`;
    } else if (limited.length <= 11) {
      const ddd = limited.slice(0, 2);
      const firstPart = limited.slice(2, 7);
      const secondPart = limited.slice(7);
      return `(${ddd}) ${firstPart}${secondPart ? `-${secondPart}` : ''}`;
    }
    
    return limited;
  };

  const addMercadoria = () => {
    if (!currentMercadoria.nome.trim() || !currentMercadoria.descricao?.trim() || !currentMercadoria.quantidade || currentMercadoria.quantidade < 1) return;
    
    if (editingMercadoriaId) {
      // Modo de edição: atualizar mercadoria existente
      setValues(prev => {
        const updatedMercadorias = prev.mercadorias.map(m => 
          m.id === editingMercadoriaId 
            ? { ...currentMercadoria, quantidade: currentMercadoria.quantidade || 1 }
            : m
        );
        return {
          ...prev,
          mercadorias: updatedMercadorias
        };
      });
      
      // Sair do modo de edição
      setEditingMercadoriaId(null);
    } else {
      // Modo de adição: adicionar nova mercadoria
      setValues(prev => {
        const newMercadorias = [...prev.mercadorias, { 
          ...currentMercadoria,
          quantidade: currentMercadoria.quantidade || 1 // Garante que nunca seja undefined
        }];
        setSelectedMercadoriaIndex(newMercadorias.length - 1);
        return {
          ...prev,
          mercadorias: newMercadorias
        };
      });
    }
    
    // Limpar formulário
    setCurrentMercadoria({
      id: crypto.randomUUID(),
      nome: "",
      descricao: "",
      quantidade: 1,
      valorEstimado: undefined
    });
  };

  const handleEditMercadoria = (mercadoria: MercadoriaInfo) => {
    setCurrentMercadoria(mercadoria);
    setEditingMercadoriaId(mercadoria.id);
    // Scroll para o topo do formulário
    const mercadoriasSection = document.querySelector('[data-step="mercadorias"]');
    if (mercadoriasSection) {
      mercadoriasSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleCancelEdit = () => {
    setEditingMercadoriaId(null);
    setCurrentMercadoria({
      id: crypto.randomUUID(),
      nome: "",
      descricao: "",
      quantidade: 1,
      valorEstimado: undefined
    });
  };

  const removeMercadoria = (id: string) => {
    setValues(prev => ({
      ...prev,
      mercadorias: prev.mercadorias.filter(m => m.id !== id)
    }));
  };

  const steps = [
    {
      id: "informacoes",
      title: "Informações Básicas",
      content: (
        <div className="space-y-8">
          <div className="space-y-3">
            <Label className="text-lg font-normal text-gray-600">Número do Lote</Label>
            <Input
              type="text"
              placeholder="Ex: 001"
              value={values.numero}
              onChange={(e) => updateField("numero", e.target.value)}
              className="wizard-input h-14 text-base border-0 border-b-2 border-gray-200 rounded-none focus-visible:border-gray-800 focus-visible:ring-0 focus-visible:outline-none px-0 bg-transparent placeholder:text-gray-400"
            />
            {!values.numero && attemptedNext && (
              <p className="text-sm text-red-600">Por favor, preencha o número do lote.</p>
            )}
          </div>

          <div className="space-y-3">
            <Label className="text-lg font-normal text-gray-600">Descrição do Lote</Label>
            <Textarea
              placeholder="Descreva o lote de forma clara e objetiva..."
              value={values.descricao}
              onChange={(e) => updateField("descricao", e.target.value)}
              className="wizard-input min-h-[120px] text-base border border-gray-300 rounded-md focus-visible:border-gray-800 focus-visible:ring-0 focus-visible:outline-none p-3 bg-white placeholder:text-gray-400 resize-none"
            />
            {!values.descricao && attemptedNext && (
              <p className="text-sm text-red-600">Por favor, preencha a descrição do lote.</p>
            )}
          </div>

          <div className="space-y-3">
            <Label className="text-lg font-normal text-gray-600">Nome do Proprietário da Mercadoria</Label>
            <Input
              type="text"
              placeholder="Ex: João Silva"
              value={values.proprietario}
              onChange={(e) => updateField("proprietario", e.target.value)}
              className="wizard-input h-14 text-base border-0 border-b-2 border-gray-200 rounded-none focus-visible:border-gray-800 focus-visible:ring-0 focus-visible:outline-none px-0 bg-transparent placeholder:text-gray-400"
            />
            {!values.proprietario && attemptedNext && (
              <p className="text-sm text-red-600">Por favor, preencha o nome do proprietário.</p>
            )}
          </div>

          <div className="space-y-3">
            <Label className="text-lg font-normal text-gray-600">Celular do Proprietário da Mercadoria</Label>
            <div className="flex gap-3">
              <Select
                value={values.codigoPais || '+55'}
                onValueChange={(v) => updateField('codigoPais', v)}
              >
                <SelectTrigger className="w-[180px] h-14 text-base border-0 border-b-2 border-gray-200 rounded-none focus:border-black focus-visible:border-black focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none px-0 bg-transparent [&>span]:flex [&>span]:items-center [&>span]:gap-2">
                  <SelectValue>
                    <FlagIcon countryCode={values.codigoPais || '+55'} />
                    <span>{values.codigoPais || '+55'}</span>
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
                type="tel"
                placeholder="(11) 98765-4321"
                value={values.celularProprietario}
                onChange={(e) => {
                  const formatted = formatPhoneNumber(e.target.value);
                  updateField("celularProprietario", formatted);
                }}
                className="wizard-input flex-1 h-14 text-base border-0 border-b-2 border-gray-200 rounded-none focus-visible:border-gray-800 focus-visible:ring-0 focus-visible:outline-none px-0 bg-transparent placeholder:text-gray-400"
              />
            </div>
            {!values.celularProprietario && attemptedNext && (
              <p className="text-sm text-red-600">Por favor, preencha o celular do proprietário.</p>
            )}
          </div>

          <div className="space-y-3">
            <Label className="text-lg font-normal text-gray-600">E-mail do Proprietário da Mercadoria</Label>
            <Input
              type="email"
              placeholder="Ex: joao.silva@email.com"
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
      id: "mercadorias",
      title: "Mercadorias",
      content: (
        <div className="space-y-8">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-lg font-normal text-gray-600">
                {editingMercadoriaId ? "Editar Mercadoria" : "Adicionar Mercadoria"}
              </Label>
              <p className="text-sm text-gray-500">
                Adicione as mercadorias que compõem este lote
              </p>
            </div>
             <button
               type="button"
               onClick={addMercadoria}
               disabled={!currentMercadoria.nome.trim() || !currentMercadoria.descricao?.trim() || !currentMercadoria.quantidade || currentMercadoria.quantidade < 1}
               className="w-8 h-8 flex items-center justify-center text-gray-900 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
               title={editingMercadoriaId ? "Salvar alterações" : "Adicionar mercadoria"}
             >
               {editingMercadoriaId ? <Check className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
             </button>
          </div>

          {/* Formulário de adição */}
          <div className="space-y-8">
            <div className="space-y-3">
              <Label className="text-lg font-normal text-gray-600">Nome da Mercadoria</Label>
              <Input
                type="text"
                placeholder="Ex: Gado Nelore"
                value={currentMercadoria.nome}
                onChange={(e) => setCurrentMercadoria(prev => ({ ...prev, nome: e.target.value }))}
                className="wizard-input h-14 text-base border-0 border-b-2 border-gray-200 rounded-none focus-visible:border-gray-800 focus-visible:ring-0 focus-visible:outline-none px-0 bg-transparent placeholder:text-gray-400"
              />
            </div>

            <div className="space-y-3">
              <Label className="text-lg font-normal text-gray-600">Descrição</Label>
              <Textarea
                placeholder="Detalhes sobre a mercadoria..."
                value={currentMercadoria.descricao}
                onChange={(e) => setCurrentMercadoria(prev => ({ ...prev, descricao: e.target.value }))}
                className="wizard-input min-h-[160px] text-base border border-gray-300 rounded-md focus-visible:border-gray-800 focus-visible:ring-0 focus-visible:outline-none p-3 bg-white placeholder:text-gray-400 resize-y"
              />
            </div>

            <div className="space-y-3">
              <Label className="text-lg font-normal text-gray-600">Quantidade</Label>
              <Input
                type="number"
                min="1"
                placeholder="1"
                value={currentMercadoria.quantidade === undefined ? "" : currentMercadoria.quantidade}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === "") {
                    setCurrentMercadoria(prev => ({ ...prev, quantidade: undefined }));
                  } else {
                    const numValue = parseInt(value);
                    if (!isNaN(numValue) && numValue >= 1) {
                      setCurrentMercadoria(prev => ({ ...prev, quantidade: numValue }));
                    }
                  }
                }}
                onBlur={(e) => {
                  // Se o campo estiver vazio ao sair, define como 1
                  if (!e.target.value || currentMercadoria.quantidade === undefined || currentMercadoria.quantidade < 1) {
                    setCurrentMercadoria(prev => ({ ...prev, quantidade: 1 }));
                  }
                }}
                className="wizard-input h-14 text-base border-0 border-b-2 border-gray-200 rounded-none focus-visible:border-gray-800 focus-visible:ring-0 focus-visible:outline-none px-0 bg-transparent placeholder:text-gray-400"
              />
            </div>
          </div>

          {/* Seletor e visualização de mercadorias adicionadas */}
          {values.mercadorias.length > 0 && (
            <div className="space-y-6">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1">
                  <Label className="text-lg font-normal text-gray-600">
                    Mercadorias Adicionadas ({values.mercadorias.length})
                  </Label>
                </div>
                <div className="flex-1">
                  <Select
                    value={selectedMercadoriaIndex.toString()}
                    onValueChange={(value) => {
                      // Cancelar edição ao trocar de mercadoria
                      if (editingMercadoriaId) {
                        handleCancelEdit();
                      }
                      setSelectedMercadoriaIndex(parseInt(value));
                    }}
                  >
                    <SelectTrigger className="h-14 text-base border-0 border-b-2 border-gray-200 rounded-none focus:border-gray-800 focus-visible:ring-0 focus-visible:outline-none focus:ring-0 focus:ring-offset-0 focus-visible:border-gray-800 px-0 bg-transparent">
                      <SelectValue placeholder="Selecione uma mercadoria" />
                    </SelectTrigger>
                    <SelectContent position="popper" sideOffset={5} className="bg-white z-[100000]">
                      {values.mercadorias.map((mercadoria, index) => (
                        <SelectItem key={mercadoria.id} value={index.toString()}>
                          {mercadoria.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Detalhes da mercadoria selecionada */}
              {values.mercadorias[selectedMercadoriaIndex] && (
                <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex items-start justify-between mb-3">
                    <p className="font-medium text-gray-900 text-lg">
                      {values.mercadorias[selectedMercadoriaIndex].nome}
                    </p>
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEditMercadoria(values.mercadorias[selectedMercadoriaIndex])}
                        className="text-gray-600 hover:text-black hover:bg-gray-100"
                        title="Editar mercadoria"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          removeMercadoria(values.mercadorias[selectedMercadoriaIndex].id);
                          if (selectedMercadoriaIndex >= values.mercadorias.length - 1) {
                            setSelectedMercadoriaIndex(Math.max(0, values.mercadorias.length - 2));
                          }
                        }}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        title="Deletar mercadoria"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-sm text-gray-600 mb-3">
                    {values.mercadorias[selectedMercadoriaIndex].descricao}
                  </p>
                  <div className="flex gap-4 text-sm text-gray-500">
                    <span>Quantidade: {values.mercadorias[selectedMercadoriaIndex].quantidade}</span>
                    {values.mercadorias[selectedMercadoriaIndex].valorEstimado && 
                     values.mercadorias[selectedMercadoriaIndex].valorEstimado > 0 && (
                      <span>Valor Estimado: R$ {values.mercadorias[selectedMercadoriaIndex].valorEstimado.toFixed(2)}</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {values.mercadorias.length === 0 && attemptedNext && (
            <p className="text-sm text-red-600 flex items-center gap-1">
              <AlertCircle className="h-4 w-4" />
              Adicione pelo menos uma mercadoria ao lote.
            </p>
          )}
        </div>
      )
    },
    {
      id: "documentos",
      title: "Documentações",
      content: (
        <div className="space-y-8">
          <div className="space-y-3">
            <Label className="text-lg font-normal text-gray-600">Adicionar Documentos</Label>
            <p className="text-sm text-gray-500">Faça upload de documentos relacionados ao lote (contratos, laudos, certidões, etc.)</p>
            
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-gray-400 transition-colors">
              <input
                type="file"
                id="documentos-upload"
                multiple
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                onChange={async (e) => {
                  const files = Array.from(e.target.files || []);
                  
                  // Converter arquivos para base64
                  const convertedFiles = await Promise.all(
                    files.map(async (file) => {
                      return new Promise<{ name: string; url: string; type: string; data: string }>((resolve) => {
                        const reader = new FileReader();
                        reader.onload = (event) => {
                          const base64 = event.target?.result as string;
                          resolve({
                            name: file.name,
                            url: URL.createObjectURL(file), // Para preview temporário
                            type: file.type,
                            data: base64 // Base64 para salvar no banco
                          });
                        };
                        reader.readAsDataURL(file);
                      });
                    })
                  );
                  
                  // Atualizar estado temporário (para preview)
                  const newFiles = convertedFiles.map(f => ({
                    name: f.name,
                    url: f.url,
                    type: f.type
                  }));
                  setDocumentFiles([...documentFiles, ...newFiles]);
                  
                  // Atualizar metadados
                  const newMetadata = convertedFiles.map(f => ({
                    name: f.name,
                    type: f.type
                  }));
                  setDocumentMetadata([...documentMetadata, ...newMetadata]);
                  
                  // Salvar base64 no estado do formulário
                  const base64Docs = convertedFiles.map(f => f.data);
                  const updatedDocs = [...(values.documentos || []), ...base64Docs];
                  updateField("documentos", updatedDocs);
                }}
                className="hidden"
              />
              <label 
                htmlFor="documentos-upload" 
                className="cursor-pointer flex flex-col items-center gap-3"
              >
                <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-600">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                    <polyline points="17 8 12 3 7 8"/>
                    <line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                </div>
                <div>
                  <p className="text-base font-medium text-gray-700">Clique para fazer upload</p>
                  <p className="text-sm text-gray-500 mt-1">PDF, DOC, DOCX, JPG, PNG (até 10MB cada)</p>
                </div>
              </label>
            </div>

            {values.documentos && values.documentos.length > 0 && (
              <div className="space-y-2 mt-4">
                <p className="text-sm font-medium text-gray-700">Documentos adicionados:</p>
                <div className="space-y-2">
                  {values.documentos.map((doc, index) => {
                    const metadata = documentMetadata[index];
                    const isBase64 = doc.startsWith('data:');
                    const isImage = metadata?.type?.startsWith('image/') || /^data:image/.test(doc);
                    
                    return (
                      <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                        <button
                          type="button"
                          onClick={() => {
                            // Converter base64 para blob URL antes de abrir
                            if (isBase64) {
                              try {
                                const matches = doc.match(/^data:([^;]+);base64,(.+)$/);
                                if (matches) {
                                  const mimeType = matches[1];
                                  const base64Data = matches[2];
                                  const byteCharacters = atob(base64Data);
                                  const byteNumbers = new Array(byteCharacters.length);
                                  for (let i = 0; i < byteCharacters.length; i++) {
                                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                                  }
                                  const byteArray = new Uint8Array(byteNumbers);
                                  const blob = new Blob([byteArray], { type: mimeType });
                                  const blobUrl = URL.createObjectURL(blob);
                                  
                                  // Para PDFs, usar iframe
                                  if (mimeType === 'application/pdf') {
                                    const newWindow = window.open('', '_blank');
                                    if (newWindow) {
                                      newWindow.document.write(`
                                        <!DOCTYPE html>
                                        <html>
                                          <head>
                                            <title>${metadata?.name || 'Documento'}</title>
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
                                      setTimeout(() => URL.revokeObjectURL(blobUrl), 120000);
                                    }
                                  } else {
                                    // Para outros tipos, abrir diretamente
                                    window.open(blobUrl, '_blank');
                                    setTimeout(() => URL.revokeObjectURL(blobUrl), 120000);
                                  }
                                }
                              } catch (error) {
                                logger.error('Erro ao abrir documento:', error);
                              }
                            } else {
                              window.open(doc, '_blank');
                            }
                          }}
                          className="flex items-center gap-3 flex-1 text-left"
                        >
                          <div className="w-8 h-8 rounded bg-blue-100 flex items-center justify-center flex-shrink-0">
                            {isImage ? (
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-600">
                                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                                <circle cx="8.5" cy="8.5" r="1.5"/>
                                <polyline points="21 15 16 10 5 21"/>
                              </svg>
                            ) : (
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-600">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                <polyline points="14 2 14 8 20 8"/>
                              </svg>
                            )}
                          </div>
                          <div className="flex-1">
                            <span className="text-sm text-gray-700 hover:text-blue-600">
                              {metadata?.name || `Documento ${index + 1}`}
                            </span>
                            <p className="text-xs text-gray-500 mt-0.5">Clique para visualizar</p>
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            const newDocs = values.documentos?.filter((_, i) => i !== index) || [];
                            const newMetadata = documentMetadata.filter((_, i) => i !== index);
                            const newFiles = documentFiles.filter((_, i) => i !== index);
                            setDocumentFiles(newFiles);
                            setDocumentMetadata(newMetadata);
                            updateField("documentos", newDocs);
                          }}
                          className="text-red-500 hover:text-red-700 transition-colors ml-2 flex-shrink-0"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                            <line x1="10" y1="11" x2="10" y2="17"/>
                            <line x1="14" y1="11" x2="14" y2="17"/>
                          </svg>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <p className="text-xs text-gray-500 italic">Esta etapa é opcional. Você pode pular se não tiver documentos para adicionar.</p>
          </div>
        </div>
      )
    },
    {
      id: "leilao",
      title: "Vincular ao Leilão",
      content: (
        <div className="space-y-8">
          <div className="space-y-3">
            <Label className="text-lg font-normal text-gray-600">Selecione o Leilão</Label>
            <p className="text-sm text-gray-500">Escolha em qual leilão este lote será incluído</p>
            <Select
              value={values.leilaoId}
              onValueChange={(value) => updateField("leilaoId", value)}
            >
              <SelectTrigger className="h-14 text-base border-0 border-b-2 border-gray-200 rounded-none focus:border-gray-800 focus-visible:ring-0 focus-visible:outline-none focus:outline-none active:outline-none outline-none ring-0 px-0 bg-transparent [&:focus]:ring-0 [&:active]:ring-0">
                <SelectValue placeholder="Selecione um leilão" />
              </SelectTrigger>
              <SelectContent position="popper" sideOffset={5} className="bg-white z-[100000]">
                {leiloes.map((leilao) => (
                  <SelectItem key={leilao.id} value={leilao.id}>
                    {leilao.nome}
                  </SelectItem>
                ))}
                {leiloes.length === 0 && (
                  <div className="p-4 text-sm text-gray-500 text-center">
                    Nenhum leilão disponível
                  </div>
                )}
              </SelectContent>
            </Select>
            {!values.leilaoId && attemptedNext && (
              <p className="text-sm text-red-600">Por favor, selecione um leilão.</p>
            )}
          </div>

          <div className="space-y-3">
            <Label className="text-lg font-normal text-gray-600">Observações (Opcional)</Label>
            <Textarea
              placeholder="Informações adicionais sobre este lote..."
              value={values.observacoes}
              onChange={(e) => updateField("observacoes", e.target.value)}
              className="wizard-input min-h-[120px] text-base border border-gray-300 rounded-md focus-visible:border-gray-800 focus-visible:ring-0 focus-visible:outline-none p-3 bg-white placeholder:text-gray-400 resize-none"
            />
          </div>
        </div>
      )
    },
    {
      id: "confirmacao",
      title: "Confirmação",
      content: (
        <div className="space-y-8">
          {/* Número do Lote */}
          <div className="pb-6 border-b border-gray-100">
            <p className="text-xs uppercase tracking-wider text-gray-500 mb-2">Número do Lote</p>
            <p className="text-2xl font-light text-gray-900">#{values.numero}</p>
          </div>

          {/* Descrição */}
          <div className="pb-6 border-b border-gray-100">
            <p className="text-xs uppercase tracking-wider text-gray-500 mb-2">Descrição</p>
            <p className="text-base text-gray-700 leading-relaxed">{values.descricao}</p>
          </div>

          {/* Proprietário */}
          <div className="pb-6 border-b border-gray-100">
            <p className="text-xs uppercase tracking-wider text-gray-500 mb-3">
              {values.mercadorias.length === 1 ? 'Proprietário da Mercadoria' : 'Proprietário das Mercadorias'}
            </p>
            <p className="text-lg font-medium text-gray-900 mb-3">{values.proprietario}</p>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Phone className="h-4 w-4" />
                <span>{values.codigoPais} {values.celularProprietario}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Mail className="h-4 w-4" />
                <span>{values.emailProprietario}</span>
              </div>
            </div>
          </div>

          {/* Mercadorias */}
          <div className="pb-6 border-b border-gray-100">
            <div className="flex items-center gap-2 mb-4">
              <Package className="h-4 w-4 text-gray-500" />
              <p className="text-xs uppercase tracking-wider text-gray-500">
                Mercadorias ({values.mercadorias.length})
              </p>
            </div>
            <div className="space-y-4">
              {values.mercadorias.map((mercadoria, index) => (
                <div key={mercadoria.id} className="pl-6">
                  <p className="text-base font-medium text-gray-900 mb-1">{mercadoria.nome}</p>
                  <p className="text-sm text-gray-600 mb-2 leading-relaxed">{mercadoria.descricao}</p>
                  <p className="text-xs text-gray-500">Quantidade: {mercadoria.quantidade}</p>
                  {index < values.mercadorias.length - 1 && (
                    <div className="mt-4 border-t border-gray-50"></div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Documentos */}
          {values.documentos && values.documentos.length > 0 && (
            <div className="pb-6 border-b border-gray-100">
              <p className="text-xs uppercase tracking-wider text-gray-500 mb-3">Documentos ({values.documentos.length})</p>
              <div className="space-y-2">
                {values.documentos.map((doc, index) => {
                  const metadata = documentMetadata[index];
                  const isImage = metadata?.type?.startsWith('image/') || /^data:image/.test(doc);
                  
                  return (
                    <button
                      key={index}
                      type="button"
                      onClick={() => {
                        // Converter base64 para blob URL antes de abrir
                        const isBase64 = doc.startsWith('data:');
                        if (isBase64) {
                          try {
                            const matches = doc.match(/^data:([^;]+);base64,(.+)$/);
                            if (matches) {
                              const mimeType = matches[1];
                              const base64Data = matches[2];
                              const byteCharacters = atob(base64Data);
                              const byteNumbers = new Array(byteCharacters.length);
                              for (let i = 0; i < byteCharacters.length; i++) {
                                byteNumbers[i] = byteCharacters.charCodeAt(i);
                              }
                              const byteArray = new Uint8Array(byteNumbers);
                              const blob = new Blob([byteArray], { type: mimeType });
                              const blobUrl = URL.createObjectURL(blob);
                              
                              // Para PDFs, usar iframe
                              if (mimeType === 'application/pdf') {
                                const newWindow = window.open('', '_blank');
                                if (newWindow) {
                                  newWindow.document.write(`
                                    <!DOCTYPE html>
                                    <html>
                                      <head>
                                        <title>${metadata?.name || 'Documento'}</title>
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
                                  setTimeout(() => URL.revokeObjectURL(blobUrl), 120000);
                                }
                              } else {
                                // Para outros tipos, abrir diretamente
                                window.open(blobUrl, '_blank');
                                setTimeout(() => URL.revokeObjectURL(blobUrl), 120000);
                              }
                            }
                          } catch (error) {
                            logger.error('Erro ao abrir documento:', error);
                          }
                        } else {
                          window.open(doc, '_blank');
                        }
                      }}
                      className="flex items-center gap-3 text-sm text-gray-700 hover:text-blue-600 transition-colors w-full text-left"
                    >
                      <div className="w-6 h-6 rounded bg-blue-100 flex items-center justify-center flex-shrink-0">
                        {isImage ? (
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-600">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                            <circle cx="8.5" cy="8.5" r="1.5"/>
                            <polyline points="21 15 16 10 5 21"/>
                          </svg>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-600">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                            <polyline points="14 2 14 8 20 8"/>
                          </svg>
                        )}
                      </div>
                      <span className="truncate">{metadata?.name || `Documento ${index + 1}`}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Leilão */}
          <div className="pb-6 border-b border-gray-100">
            <p className="text-xs uppercase tracking-wider text-gray-500 mb-2">Leilão Vinculado</p>
            <p className="text-base text-gray-700">
              {leiloes.find(l => l.id === values.leilaoId)?.nome || (
                <span className="text-gray-400 italic">Não vinculado</span>
              )}
            </p>
          </div>

          {/* Observações */}
          {values.observacoes && (
            <div className="pb-6 border-b border-gray-100">
              <p className="text-xs uppercase tracking-wider text-gray-500 mb-2">Observações</p>
              <p className="text-base text-gray-700 leading-relaxed">{values.observacoes}</p>
            </div>
          )}

          {/* Aviso */}
          <div className="pt-2">
            <p className="text-sm text-gray-500 text-center">
              Revise as informações antes de finalizar
            </p>
          </div>
        </div>
      )
    }
  ];

  const currentStepData = steps[currentStep];

  // Valida se uma etapa específica está completa
  const isStepComplete = (stepIndex: number) => {
    switch (stepIndex) {
      case 0: // Informações básicas
        return values.numero.trim() !== "" && 
               values.descricao.trim() !== "" && 
               values.proprietario.trim() !== "" &&
               values.celularProprietario.trim() !== "" &&
               values.emailProprietario.trim() !== "" &&
               values.emailProprietario.includes('@');
      case 1: // Mercadorias
        return values.mercadorias.length > 0;
      case 2: // Documentos (opcional)
        return true; // Sempre pode avançar, pois é opcional
      case 3: // Leilão
        return values.leilaoId !== "";
      case 4: // Confirmação
        return true;
      default:
        return false;
    }
  };

  const canProceed = () => {
    return isStepComplete(currentStep);
  };

  const handleNext = () => {
    setAttemptedNext(true);
    if (canProceed()) {
      if (currentStep < steps.length - 1) {
        setCurrentStep(prev => prev + 1);
        setAttemptedNext(false);
      }
    }
  };

  const handleSubmit = async () => {
    // Prevenir múltiplos cliques
    if (isSubmitting) return;
    
    if (canProceed()) {
      setIsSubmitting(true);
      try {
        // Preparar dados para salvar
        const dataToSave = {
          numero: values.numero,
          descricao: values.descricao,
          proprietario: values.proprietario,
          codigo_pais: values.codigoPais,
          celular_proprietario: values.celularProprietario,
          email_proprietario: values.emailProprietario,
          leilao_id: values.leilaoId || undefined,
          imagens: values.imagens || [],
          documentos: values.documentos || [],
          observacoes: values.observacoes || undefined,
          mercadorias: values.mercadorias.map(m => ({
            nome: m.nome || '',
            descricao: m.descricao,
            quantidade: m.quantidade || 1,
            valor_estimado: m.valorEstimado && m.valorEstimado > 0 ? m.valorEstimado : undefined,
          })),
        };

        // Salvar no banco de dados (criar ou atualizar)
        if (isEditMode) {
          await updateGuestLot({ 
            id: (initialData as any).id, 
            data: dataToSave 
          });
        } else {
          await createGuestLot(dataToSave);
        }

        // Chamar callback opcional
        await onSave?.(values);

        handleClose();
      } catch (error) {
        logger.error('Erro ao salvar lote:', error);
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      // Limpar URLs dos documentos
      documentFiles.forEach(file => {
        URL.revokeObjectURL(file.url);
      });
      setDocumentFiles([]);
      setDocumentMetadata([]);
      
      // Cancelar edição de mercadoria se estiver editando
      setEditingMercadoriaId(null);
      
      setCurrentStep(0);
      setAttemptedNext(false);
      setSelectedMercadoriaIndex(0);
      setValues({
        numero: "",
        descricao: "",
        proprietario: "",
        codigoPais: "+55",
        celularProprietario: "",
        emailProprietario: "",
        mercadorias: [],
        documentos: [],
        imagens: [],
        leilaoId: "",
        observacoes: ""
      });
      setCurrentMercadoria({
        id: crypto.randomUUID(),
        nome: "",
        descricao: "",
        quantidade: 1,
        valorEstimado: undefined
      });
      setIsClosing(false);
      onOpenChange(false);
    }, 300);
  };

  const goToStep = (index: number) => {
    // Sempre permite voltar
    if (index < currentStep) {
      setCurrentStep(index);
      setAttemptedNext(false);
      return;
    }
    
    // Para avançar, verifica se todas as etapas anteriores estão completas
    if (index > currentStep) {
      let canAdvance = true;
      
      // Verifica se todas as etapas entre a atual e a desejada estão completas
      for (let i = currentStep; i < index; i++) {
        if (!isStepComplete(i)) {
          canAdvance = false;
          break;
        }
      }
      
      if (canAdvance) {
        setCurrentStep(index);
        setAttemptedNext(false);
      } else {
        // Mostra feedback visual de que não pode avançar
        setAttemptedNext(true);
      }
    }
  };

  if (!open) return null;

  return createPortal(
    <div className={`fixed inset-0 z-[9999] bg-white transition-opacity duration-300 ${isClosing ? "opacity-0" : "opacity-100"} overflow-hidden`}>
      {/* Botão de Fechar/Voltar */}
      <div className="absolute top-8 left-8 z-50">
        <Button
          onClick={() => {
            // Cancelar edição de mercadoria se estiver editando
            if (editingMercadoriaId) {
              handleCancelEdit();
            }
            
            if (currentStep === 0) {
              handleClose();
            } else {
              setCurrentStep(currentStep - 1);
              setAttemptedNext(false);
            }
          }}
          variant="ghost"
          size="sm"
          className="h-10 w-10 rounded-full hover:bg-gray-100 text-gray-900 hover:text-gray-900 p-0"
        >
          {currentStep === 0 ? (
            <X className="h-5 w-5" />
          ) : (
            <ChevronLeft className="h-5 w-5" />
          )}
        </Button>
      </div>

      <div className="h-full flex">
        {/* Indicadores de Etapas - Lateral Esquerda */}
        <div className="hidden md:flex flex-col justify-center w-80 px-12 flex-shrink-0">
          <div className="space-y-4">
            {steps.map((step, index) => {
              // Verifica se pode navegar para esta etapa
              const canNavigate = index <= currentStep || (() => {
                for (let i = currentStep; i < index; i++) {
                  if (!isStepComplete(i)) return false;
                }
                return true;
              })();
              
              return (
                <div
                  key={index}
                  onClick={() => goToStep(index)}
                  className={`text-lg font-normal transition-all duration-200 ${
                    canNavigate ? 'cursor-pointer' : 'cursor-not-allowed'
                  } ${
                    index === currentStep
                      ? "text-gray-900 font-medium"
                      : index < currentStep
                      ? "text-gray-500 hover:text-gray-700"
                      : canNavigate
                      ? "text-gray-400 hover:text-gray-600"
                      : "text-gray-300"
                  }`}
                >
                  {step.title}
                </div>
              );
            })}
          </div>
        </div>

        {/* Conteúdo Principal */}
        <div className="flex-1 overflow-y-auto">
          <div className="min-h-full flex items-center justify-center px-8 md:px-20 py-16">
            <div className="w-full max-w-2xl space-y-12">
              {/* Título da Etapa */}
              <div>
                <h1 className="text-3xl md:text-4xl font-normal text-gray-900 leading-tight">
                  {currentStepData.title}
                </h1>
              </div>

              {/* Conteúdo da Etapa */}
              <div>{currentStepData.content}</div>

              {/* Botão de Avançar */}
              <div className="pt-4 pb-8">
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
                    {isSubmitting ? "Salvando..." : (isEditMode ? "Atualizar" : "Concluir")}
                    {!isSubmitting && <Check className="h-5 w-5 ml-2" />}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
