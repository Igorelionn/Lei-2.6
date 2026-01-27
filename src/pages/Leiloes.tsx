import { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useSupabaseAuctions } from "@/hooks/use-supabase-auctions";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { useActivityLogger } from "@/hooks/use-activity-logger";
import { useClientPagination } from "@/hooks/use-pagination"; // ⚡ PERFORMANCE: Paginação
import { Pagination } from "@/components/Pagination"; // ⚡ PERFORMANCE: Componente de paginação
import { AuctionForm, AuctionFormValues, createEmptyAuctionForm } from "@/components/AuctionForm";
import { AuctionWizard } from "@/components/AuctionWizard";
import { ArrematanteWizard } from "@/components/ArrematanteWizard";
import { AuctionDetails } from "@/components/AuctionDetails";
import { PdfReport } from "@/components/PdfReport";
import { Auction, AuctionStatus, ArrematanteInfo, DocumentoInfo, LoteInfo } from "@/lib/types";
import { parseCurrencyToNumber } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StringDatePicker } from "@/components/ui/date-picker";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";
import { 
  Search, 
  Plus, 
  Edit, 
  Trash2, 
  Calendar, 
  MapPin, 
  DollarSign, 
  Filter,
  Download,
  Eye,
  MoreVertical,
  RefreshCw,
  Building,
  Globe,
  Users,
  Clock,
  UserPlus,
  Archive,
  Copy,
  UserCheck,
  Upload,
  File,
  X,
  Paperclip,
  Trash,
  FileText,
  Image,
  FileSpreadsheet,
  ArrowLeft,
  Loader2
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Calendar as CalendarIcon, CreditCard } from "lucide-react";

function Leiloes() {
  const location = useLocation();
  const queryClient = useQueryClient();
  const { auctions, isLoading, createAuction, updateAuction, deleteAuction, archiveAuction, unarchiveAuction, duplicateAuction } = useSupabaseAuctions();
  const { toast } = useToast();
  const { logAuctionAction, logBidderAction, logLotAction, logMerchandiseAction, logDocumentAction, logReportAction } = useActivityLogger();
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<AuctionStatus | "todos">("todos");
  const [localFilter, setLocalFilter] = useState<string>("todos");
  const [showArchived, setShowArchived] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [editingAuction, setEditingAuction] = useState<Auction | null>(null);
  const [viewingAuction, setViewingAuction] = useState<Auction | null>(null);
  const [viewingVersion, setViewingVersion] = useState(0);
  const [isStatusFilterOpen, setIsStatusFilterOpen] = useState(false);
  const [isLocalFilterOpen, setIsLocalFilterOpen] = useState(false);
  const [isLoadingResults, setIsLoadingResults] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [searchInputValue, setSearchInputValue] = useState("");
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Set para rastrear URLs blob temporárias que precisam ser limpas
  const tempBlobUrlsRef = useRef(new Set<string>());
  const [addingArrematanteFor, setAddingArrematanteFor] = useState<Auction | null>(null);
  const wizardClosedIntentionally = useRef(false); // Flag para evitar reabertura automática
  const [arrematanteMode, setArrematanteMode] = useState<'view' | 'edit'>('view');
  const [editingArrematanteId, setEditingArrematanteId] = useState<string | null>(null);
  const [showArrematanteSelector, setShowArrematanteSelector] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [isSavingArrematante, setIsSavingArrematante] = useState(false);
  const [selectedAuctionForPayment, setSelectedAuctionForPayment] = useState<Auction | null>(null);
  const [isFormBeingEdited, setIsFormBeingEdited] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [initialStep, setInitialStep] = useState<number | undefined>(undefined);
  const [initialLoteIndex, setInitialLoteIndex] = useState<number | undefined>(undefined);
  
  // 🔍 LOG: Monitorar mudanças no editingAuction
  useEffect(() => {
    console.log('🔄 [Leiloes.tsx] editingAuction mudou:', {
      hasEditingAuction: !!editingAuction,
      auctionId: editingAuction?.id,
      auctionNome: editingAuction?.nome,
      auctionIdentificacao: editingAuction?.identificacao,
      qtdLotes: editingAuction?.lotes?.length || 0
    });
  }, [editingAuction]);

  // 🔍 LOG: Monitorar mudanças no initialStep e initialLoteIndex
  useEffect(() => {
    console.log('🔄 [Leiloes.tsx] initialStep/initialLoteIndex mudaram:', {
      initialStep,
      initialLoteIndex,
      hasEditingAuction: !!editingAuction
    });
  }, [initialStep, initialLoteIndex, editingAuction]);
  
  // Estados para o modal de exportação
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [selectedAuctionForExport, setSelectedAuctionForExport] = useState<string>("");
  const [isExportSelectOpen, setIsExportSelectOpen] = useState(false);
  
  // Estado para sincronização bidirecional entre leilão e arrematante
  const [auctionFormChanges, setAuctionFormChanges] = useState<Partial<AuctionFormValues>>({});
  
  // 🔄 Detectar navegação da página de Lotes para editar lote específico
  useEffect(() => {
    const state = location.state as { 
      editAuctionId?: string; 
      editLoteIndex?: number; 
      openStep?: number;
      openTab?: string; // ✅ NOVO: Suporte para abrir em aba específica
      createNewLote?: boolean; // ✅ NOVO: Flag para criar novo lote
    } | null;
    
    if (state?.editAuctionId && auctions) {
      const auction = auctions.find(a => a.id === state.editAuctionId);
      if (auction) {
        console.log("📍 Abrindo formulário do leilão:", {
          auctionId: state.editAuctionId,
          loteIndex: state.editLoteIndex,
          step: state.openStep,
          tab: state.openTab,
          createNewLote: state.createNewLote
        });
        
        // Mapear openTab para o step correto
        let stepToOpen = state.openStep;
        if (state.openTab === 'custos-patrocinios') {
          stepToOpen = 5; // "Custos e Patrocínios" é o step 5 (índice começa em 0)
        } else if (state.openTab === 'lotes') {
          stepToOpen = 4; // "Configuração de Lotes" é o step 4 (índice começa em 0)
        }
        
        // ✅ Se createNewLote for true, preparar um novo lote vazio
        let auctionToEdit = auction;
        let loteIndexToOpen = state.editLoteIndex;
        
        if (state.createNewLote) {
          const novoLote = {
            id: crypto.randomUUID(), // 🔒 SEGURANÇA: ID criptograficamente seguro
            numero: String((auction.lotes || []).length + 1).padStart(3, '0'),
            descricao: "",
            mercadorias: [],
            status: 'disponivel' as const
          };
          
          console.log("✨ Criando novo lote automaticamente:", novoLote);
          
          // Adicionar o novo lote temporariamente ao auction
          auctionToEdit = {
            ...auction,
            lotes: [...(auction.lotes || []), novoLote]
          };
          
          // Selecionar o último lote (o recém-criado)
          loteIndexToOpen = (auctionToEdit.lotes?.length || 1) - 1;
        }
        
        console.log('✨ [Leiloes.tsx] Setando editingAuction (navigation state):', {
          auctionId: auctionToEdit.id,
          auctionNome: auctionToEdit.nome,
          stepToOpen,
          loteIndexToOpen,
          createNewLote: state.createNewLote
        });

        setEditingAuction(auctionToEdit);
        setInitialStep(stepToOpen);
        setInitialLoteIndex(loteIndexToOpen);
        setIsCreateModalOpen(true);
        
        // Limpar o estado de navegação
        window.history.replaceState({}, document.title);
      }
    }
  }, [location.state, auctions]);
  
  // 🔄 SINCRONIZAÇÃO BIDIRECIONAL: Escutar mudanças do formulário do leilão para atualizar arrematante
  useEffect(() => {
    const handleAuctionFormChanged = (event: CustomEvent) => {
      const { auctionId, changedField, newValue } = event.detail;
      
      // Verificar se o arrematante pertence ao leilão que foi alterado
      if (addingArrematanteFor && addingArrematanteFor.id === auctionId) {
        // Mapear campos do leilão para campos do arrematante
        const fieldMapping = {
          diaVencimentoPadrao: 'diaVencimentoMensal',
          parcelasPadrao: 'quantidadeParcelas',
          mesInicioPagamento: 'mesInicioPagamento',
        } as const;
        
        // Atualizar o formulário do arrematante se o campo é relevante
        const arrematanteField = fieldMapping[changedField as keyof typeof fieldMapping];
        if (arrematanteField) {
          setArrematanteForm(prev => ({
            ...prev,
            [arrematanteField]: newValue
          }));
          
          toast({
            title: "🔄 Sincronização em Tempo Real",
            description: `Campo "${arrematanteField}" do arrematante foi atualizado automaticamente baseado na mudança do leilão.`,
            duration: 3000,
          });
        }
      } else {
        console.log(`ℹ️ Evento ignorado - não corresponde ao arrematante atual ou modal não está aberto`);
      }
    };

    // Adicionar listener para o evento customizado (sempre ativo)
    window.addEventListener('auctionFormChanged', handleAuctionFormChanged as EventListener);
    
    // Limpar listener quando componente desmontar
    return () => {
      window.removeEventListener('auctionFormChanged', handleAuctionFormChanged as EventListener);
    };
  }, [addingArrematanteFor, toast]);

  // 🔄 SINCRONIZAÇÃO ADICIONAL: Listener sempre ativo para capturar mudanças mesmo quando modal não está focado
  useEffect(() => {
    const handleGlobalAuctionFormChanged = (event: CustomEvent) => {
      const { auctionId, changedField, newValue } = event.detail;
      
      console.log(`🌐 GLOBAL - Evento auctionFormChanged capturado:`, {
        auctionId,
        changedField,
        newValue,
        hasArrematante: !!addingArrematanteFor,
        arrematanteId: addingArrematanteFor?.id
      });
      
      // Se existe um modal de arrematante aberto para este leilão
      if (addingArrematanteFor && addingArrematanteFor.id === auctionId) {
        const fieldMapping = {
          diaVencimentoPadrao: 'diaVencimentoMensal',
          parcelasPadrao: 'quantidadeParcelas',
          mesInicioPagamento: 'mesInicioPagamento',
        } as const;
        
        const arrematanteField = fieldMapping[changedField as keyof typeof fieldMapping];
        if (arrematanteField) {
          console.log(`🌐 GLOBAL - Sincronizando ${arrematanteField} = ${newValue}`);
          
          setArrematanteForm(prev => ({
            ...prev,
            [arrematanteField]: newValue
          }));
        }
      }
    };

    // Listener global que não depende de outras variáveis
    window.addEventListener('auctionFormChanged', handleGlobalAuctionFormChanged as EventListener);
    
    return () => {
      window.removeEventListener('auctionFormChanged', handleGlobalAuctionFormChanged as EventListener);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // addingArrematanteFor é intencionalmen te acessado via closure - incluí-lo causaria recriação do listener
  
  const [arrematanteForm, setArrematanteForm] = useState({
    nome: "",
    documento: "",
    endereco: "",
    email: "",
    telefone: "",
    loteId: "",
    valorPagar: "",
    valorEntrada: "",
    diaVencimentoMensal: 15,
    quantidadeParcelas: 12,
    parcelasPagas: 0,
    mesInicioPagamento: new Date().toISOString().slice(0, 7), // YYYY-MM formato
    pago: false,
    documentos: [] as DocumentoInfo[],
    percentualJurosAtraso: 0,
    tipoJurosAtraso: "composto" as "simples" | "composto"
  });
  const [documentType, setDocumentType] = useState<'CPF' | 'CNPJ'>('CPF');

  // Função para formatar CPF automaticamente: XXX.XXX.XXX-XX
  const formatCPF = (value: string) => {
    const numbersOnly = value.replace(/[^\d]/g, '');
    const limitedNumbers = numbersOnly.substring(0, 11);
    
    if (limitedNumbers.length <= 3) {
      return limitedNumbers;
    } else if (limitedNumbers.length <= 6) {
      return `${limitedNumbers.substring(0, 3)}.${limitedNumbers.substring(3)}`;
    } else if (limitedNumbers.length <= 9) {
      return `${limitedNumbers.substring(0, 3)}.${limitedNumbers.substring(3, 6)}.${limitedNumbers.substring(6)}`;
    } else {
      return `${limitedNumbers.substring(0, 3)}.${limitedNumbers.substring(3, 6)}.${limitedNumbers.substring(6, 9)}-${limitedNumbers.substring(9)}`;
    }
  };

  // Função para formatar CNPJ automaticamente: XX.XXX.XXX/XXXX-XX
  const formatCNPJ = (value: string) => {
    const numbersOnly = value.replace(/[^\d]/g, '');
    const limitedNumbers = numbersOnly.substring(0, 14);
    
    if (limitedNumbers.length <= 2) {
      return limitedNumbers;
    } else if (limitedNumbers.length <= 5) {
      return `${limitedNumbers.substring(0, 2)}.${limitedNumbers.substring(2)}`;
    } else if (limitedNumbers.length <= 8) {
      return `${limitedNumbers.substring(0, 2)}.${limitedNumbers.substring(2, 5)}.${limitedNumbers.substring(5)}`;
    } else if (limitedNumbers.length <= 12) {
      return `${limitedNumbers.substring(0, 2)}.${limitedNumbers.substring(2, 5)}.${limitedNumbers.substring(5, 8)}/${limitedNumbers.substring(8)}`;
    } else {
      return `${limitedNumbers.substring(0, 2)}.${limitedNumbers.substring(2, 5)}.${limitedNumbers.substring(5, 8)}/${limitedNumbers.substring(8, 12)}-${limitedNumbers.substring(12)}`;
    }
  };

  // Função para detectar automaticamente se é CPF ou CNPJ
  const detectDocumentType = (value: string) => {
    const numbersOnly = value.replace(/[^\d]/g, '');
    
    // Se tem mais de 11 dígitos, é CNPJ
    if (numbersOnly.length > 11) {
      return 'CNPJ';
    }
    
    // Se tem exatamente 11 dígitos, é CPF
    if (numbersOnly.length === 11) {
      return 'CPF';
    }
    
    // Se tem formatação típica de CNPJ (barra /)
    if (value.includes('/')) {
      return 'CNPJ';
    }
    
    // Se tem formatação típica de CPF (hífen no final)
    if (value.includes('-') && !value.includes('/')) {
      return 'CPF';
    }
    
    // Se tem muitos pontos (formato CNPJ: XX.XXX.XXX vs CPF: XXX.XXX)
    const pontos = (value.match(/\./g) || []).length;
    if (pontos >= 2) {
      return numbersOnly.length > 9 ? 'CNPJ' : 'CPF';
    }
    
    // Para textos mais longos sem formatação, provavelmente CNPJ
    if (numbersOnly.length >= 12) {
      return 'CNPJ';
    }
    
    // Para textos menores ou iguais a 11, provavelmente CPF
    if (numbersOnly.length >= 8) {
      return 'CPF';
    }
    
    // Se não conseguir detectar, mantém o tipo atual
    return documentType;
  };

  // Função para formatar documento baseado no tipo selecionado
  const formatDocument = (value: string) => {
    return documentType === 'CPF' ? formatCPF(value) : formatCNPJ(value);
  };

  // Função para formatar telefone automaticamente no formato brasileiro +55 (11) 99999-9999
  const formatPhoneNumber = (value: string) => {
    // Remove todos os caracteres não numéricos
    const numbersOnly = value.replace(/[^\d]/g, '');
    
    // Se não tem números, retorna vazio
    if (!numbersOnly) return '';
    
    // Remove código 55 se já estiver presente no início
    let brazilianNumber = numbersOnly;
    if (brazilianNumber.startsWith('55') && brazilianNumber.length > 2) {
      brazilianNumber = brazilianNumber.substring(2);
    }
    
    // Limita a 11 dígitos (DDD + 9 dígitos do celular)
    brazilianNumber = brazilianNumber.substring(0, 11);
    
    // Aplica formatação brasileira progressiva
    if (brazilianNumber.length === 0) {
      return '+55';
    } else if (brazilianNumber.length <= 2) {
      return `+55 (${brazilianNumber}`;
    } else if (brazilianNumber.length <= 7) {
      return `+55 (${brazilianNumber.substring(0, 2)}) ${brazilianNumber.substring(2)}`;
    } else if (brazilianNumber.length <= 11) {
      const ddd = brazilianNumber.substring(0, 2);
      const firstPart = brazilianNumber.substring(2, brazilianNumber.length - 4);
      const lastPart = brazilianNumber.substring(brazilianNumber.length - 4);
      return `+55 (${ddd}) ${firstPart}-${lastPart}`;
    }
    
    // Fallback para casos extremos
    return `+55 (${brazilianNumber.substring(0, 2)}) ${brazilianNumber.substring(2, 7)}-${brazilianNumber.substring(7, 11)}`;
  };

  // 🔄 SINCRONIZAÇÃO INTELIGENTE DE DADOS
  // Este useEffect garante que quando um leilão é editado externamente,
  // as mudanças sejam refletidas nos modais de VISUALIZAÇÃO e ARREMATANTE,
  // mas NÃO interfere nos modais de EDIÇÃO para preservar as mudanças do usuário.
  useEffect(() => {
    if (auctions) {
      // Sincronizar leilão do modal de arrematante (sempre seguro quando não há edição ativa)
      // ✅ MAS NÃO se o wizard foi fechado intencionalmente
      if (addingArrematanteFor && !isFormBeingEdited && !wizardClosedIntentionally.current) {
        const updatedAuction = auctions.find(a => a.id === addingArrematanteFor.id);
        if (updatedAuction) {
          setAddingArrematanteFor(updatedAuction);
        }
      }

      // Sincronizar leilão em visualização - SEMPRE, mesmo durante edição
      // para que as mudanças apareçam imediatamente no "Ver Detalhes"
      if (viewingAuction) {
        const updatedAuction = auctions.find(a => a.id === viewingAuction.id);
        if (updatedAuction) {
          setViewingAuction(updatedAuction);
        }
      }

      // Sincronizar leilão do modal de pagamento (sempre seguro quando não há edição ativa)
      if (selectedAuctionForPayment && !isFormBeingEdited) {
        const updatedAuction = auctions.find(a => a.id === selectedAuctionForPayment.id);
        if (updatedAuction) {
          setSelectedAuctionForPayment(updatedAuction);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auctions, addingArrematanteFor?.id, viewingAuction?.id, selectedAuctionForPayment?.id, isFormBeingEdited]);
  // Estados completos não incluídos para evitar loops - apenas IDs são suficientes para sincronização

  // Carregar dados do arrematante quando abrir modal
  useEffect(() => {
    if (addingArrematanteFor && editingArrematanteId) {
      // Modo de edição: buscar arrematante específico pelo ID
      const arrematante = addingArrematanteFor.arrematantes?.find(a => a.id === editingArrematanteId);
      
      if (arrematante) {
        const documento = arrematante.documento || "";
      setArrematanteForm({
          nome: arrematante.nome,
        documento: documento,
          endereco: arrematante.endereco || "",
          email: arrematante.email || "",
          telefone: arrematante.telefone || "",
          loteId: arrematante.loteId || "",
          valorPagar: arrematante.valorPagar,
          valorEntrada: arrematante.valorEntrada || "",
          diaVencimentoMensal: arrematante.diaVencimentoMensal,
          quantidadeParcelas: arrematante.quantidadeParcelas,
          parcelasPagas: arrematante.parcelasPagas || 0,
          mesInicioPagamento: arrematante.mesInicioPagamento 
            ? (arrematante.mesInicioPagamento.includes('-') 
                ? arrematante.mesInicioPagamento 
                : `${new Date().getFullYear()}-${arrematante.mesInicioPagamento}`)
          : new Date().toISOString().slice(0, 7),
          pago: arrematante.pago || false,
          documentos: arrematante.documentos || [],
          percentualJurosAtraso: arrematante.percentualJurosAtraso || 0,
          tipoJurosAtraso: arrematante.tipoJurosAtraso || "composto"
      });
      
      // Detectar tipo de documento automaticamente
      if (documento) {
        setDocumentType(detectDocumentType(documento));
      } else {
        setDocumentType('CPF'); // Padrão
      }
      
      setArrematanteMode('view');
      }
    } else if (addingArrematanteFor && !editingArrematanteId) {
      // Para novo arrematante, usar valores padrão do leilão
      // Converter mês do leilão (MM) para formato YYYY-MM
      const currentYear = new Date().getFullYear();
      const mesLeilao = addingArrematanteFor.mesInicioPagamento 
        ? `${currentYear}-${addingArrematanteFor.mesInicioPagamento}` 
        : new Date().toISOString().slice(0, 7);
      
      setArrematanteForm({
        nome: "",
        documento: "",
        endereco: "",
        email: "",
        telefone: "",
        loteId: "",
        valorPagar: "",
        valorEntrada: "",
        diaVencimentoMensal: 15, // Valor padrão, será atualizado quando lote for selecionado
        quantidadeParcelas: 12, // Valor padrão, será atualizado quando lote for selecionado
        parcelasPagas: 0,
        mesInicioPagamento: mesLeilao,
        pago: false,
        documentos: [],
        percentualJurosAtraso: 0,
        tipoJurosAtraso: "composto" as "simples" | "composto"
      });
      setDocumentType('CPF'); // Resetar para CPF como padrão
      setArrematanteMode('edit');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addingArrematanteFor, editingArrematanteId]);
  // detectDocumentType não é memoizado - incluí-lo causaria recriação do effect

  // Função para transição suave
  const handleSmoothTransition = (callback: () => void) => {
    setIsTransitioning(true);
    setIsLoadingResults(true);
    
    setTimeout(() => {
      callback();
      setTimeout(() => {
        setIsLoadingResults(false);
        setTimeout(() => {
          setIsTransitioning(false);
        }, 100);
      }, 1000);
    }, 200);
  };

  // Função de debounce para busca
  const handleSearchChange = (value: string) => {
    setSearchInputValue(value);
    
    // Limpa o timeout anterior se existir
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }
    
    // Se o campo está vazio, aplica imediatamente
    if (value.trim() === "") {
      handleSmoothTransition(() => {
        setSearchTerm("");
      });
      return;
    }
    
    // Define um novo timeout para executar a busca após 800ms
    debounceTimeoutRef.current = setTimeout(() => {
      handleSmoothTransition(() => {
        setSearchTerm(value);
      });
    }, 800);
  };

  // Sincroniza o valor inicial do input com searchTerm
  useEffect(() => {
    setSearchInputValue(searchTerm);
  }, [searchTerm]);

  // Limpa o timeout e blob URLs quando o componente é desmontado
  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
      // Limpar todas as URLs blob temporárias - copiado para variável local conforme best practice
      // eslint-disable-next-line react-hooks/exhaustive-deps
      const urlsToRevoke = tempBlobUrlsRef.current;
      urlsToRevoke.forEach(url => {
        URL.revokeObjectURL(url);
      });
      urlsToRevoke.clear();
    };
  }, []);

  // Função para lidar com mudanças no formulário de arrematante
  // Função para atualizar formulário baseado no lote selecionado
  const updateFormBasedOnLote = (loteId: string) => {
    if (!addingArrematanteFor || !loteId) return;
    
    const loteSelecionado = addingArrematanteFor.lotes?.find(lote => lote.id === loteId);
    if (!loteSelecionado) return;
    
    // Atualizar campos baseados no tipo de pagamento do lote
    const updates: Partial<typeof arrematanteForm> = {};
    
    if (loteSelecionado.diaVencimentoPadrao) {
      updates.diaVencimentoMensal = loteSelecionado.diaVencimentoPadrao;
    }
    
    if (loteSelecionado.parcelasPadrao) {
      updates.quantidadeParcelas = loteSelecionado.parcelasPadrao;
    }
    
    if (loteSelecionado.mesInicioPagamento) {
      // Converter para formato YYYY-MM se necessário
      const mesFormatado = loteSelecionado.mesInicioPagamento.includes('-') 
        ? loteSelecionado.mesInicioPagamento 
        : `${new Date().getFullYear()}-${loteSelecionado.mesInicioPagamento}`;
      updates.mesInicioPagamento = mesFormatado;
    }
    
    // Aplicar atualizações se houver alguma
    if (Object.keys(updates).length > 0) {
      setArrematanteForm(prev => ({ ...prev, ...updates }));
    }
  };

  const handleArrematanteFormChange = (field: string, value: string | boolean | number) => {
    const newForm = {
      ...arrematanteForm,
      [field]: value
    };
    
    // Se o lote foi alterado, atualizar campos baseados no novo lote
    if (field === 'loteId' && typeof value === 'string') {
      updateFormBasedOnLote(value);
    }
    
    setArrematanteForm(newForm);

    // 🔄 SINCRONIZAÇÃO BIDIRECIONAL: Quando campos relevantes do arrematante mudarem, atualizar leilão
    const relevantFields = ['diaVencimentoMensal', 'quantidadeParcelas', 'mesInicioPagamento'];
    
    if (relevantFields.includes(field) && addingArrematanteFor) {
      // Mapear campos do arrematante para campos do leilão
      const fieldMapping = {
        diaVencimentoMensal: 'diaVencimentoPadrao',
        quantidadeParcelas: 'parcelasPadrao',
        mesInicioPagamento: 'mesInicioPagamento',
      } as const;
      
      const auctionField = fieldMapping[field as keyof typeof fieldMapping];
      if (auctionField) {
        
        // Atualizar o leilão que está sendo editado (se estiver aberto)
        if (editingAuction && editingAuction.id === addingArrematanteFor.id) {
          setEditingAuction(prev => {
            if (!prev) return prev;
            return {
              ...prev,
              [auctionField]: value
            };
          });
          
          toast({
            title: "🔄 Sincronização Bidirecional",
            description: `Campo "${auctionField}" do leilão foi atualizado automaticamente.`,
            duration: 3000,
          });
        }
        
        // Disparar evento para notificar outros componentes
        window.dispatchEvent(new CustomEvent('arrematanteFormChanged', {
          detail: {
            auctionId: addingArrematanteFor.id,
            changes: {
              [auctionField]: value
            }
          }
        }));
      }
    }
  };

  // Função para obter ícone baseado no tipo de arquivo
  const getFileIcon = (tipo: string) => {
    if (tipo.startsWith('image/')) return <Image className="h-4 w-4 text-blue-600" />;
    if (tipo.includes('spreadsheet') || tipo.includes('excel')) return <FileSpreadsheet className="h-4 w-4 text-green-600" />;
    if (tipo.includes('pdf')) return <FileText className="h-4 w-4 text-red-600" />;
    return <File className="h-4 w-4 text-gray-600" />;
  };

  // Função para formatar tamanho do arquivo
  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Função para formatar data de upload
  const formatUploadDate = (dateString: string): string => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return '';
      return date.toLocaleDateString('pt-BR');
    } catch {
      return '';
    }
  };

  // Função para lidar com upload de arquivo
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      const blobUrl = URL.createObjectURL(file);
      const novoDocumento: DocumentoInfo = {
        id: crypto.randomUUID(), // 🔒 SEGURANÇA: ID criptograficamente seguro
        nome: file.name,
        tipo: file.type,
        tamanho: file.size,
        dataUpload: new Date().toISOString(),
        url: blobUrl // Para preview local
      };
      
      // Adicionar URL ao set de URLs temporárias
      tempBlobUrlsRef.current.add(blobUrl);

      setArrematanteForm(prev => ({
        ...prev,
        documentos: [...prev.documentos, novoDocumento]
      }));
    });

    // Limpar input
    event.target.value = '';
  };

  // Função para remover documento
  const handleRemoveDocument = (id: string) => {
    // Encontrar e limpar a blob URL do documento que será removido
    const docToRemove = arrematanteForm.documentos.find(doc => doc.id === id);
    if (docToRemove?.url && tempBlobUrlsRef.current.has(docToRemove.url)) {
      URL.revokeObjectURL(docToRemove.url);
      tempBlobUrlsRef.current.delete(docToRemove.url);
    }
    
    setArrematanteForm(prev => ({
      ...prev,
      documentos: prev.documentos.filter(doc => doc.id !== id)
    }));
  };

  // Função para lidar com drag & drop
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const files = Array.from(e.dataTransfer.files);
    files.forEach((file) => {
      const blobUrl = URL.createObjectURL(file);
      const novoDocumento: DocumentoInfo = {
        id: crypto.randomUUID(), // 🔒 SEGURANÇA: ID criptograficamente seguro
        nome: file.name,
        tipo: file.type,
        tamanho: file.size,
        dataUpload: new Date().toISOString(),
        url: blobUrl
      };
      
      // Adicionar URL ao set de URLs temporárias
      tempBlobUrlsRef.current.add(blobUrl);

      setArrematanteForm(prev => ({
        ...prev,
        documentos: [...prev.documentos, novoDocumento]
      }));
    });
  };

  // Função para submeter o formulário de arrematante
  const handleAddArrematante = async () => {
    if (!addingArrematanteFor || 
        !arrematanteForm.nome || 
        !arrematanteForm.valorPagar ||
        !arrematanteForm.quantidadeParcelas ||
        arrematanteForm.quantidadeParcelas < 1 ||
        arrematanteForm.parcelasPagas === null ||
        arrematanteForm.parcelasPagas === undefined ||
        arrematanteForm.parcelasPagas < 0) {
      return;
    }

    try {
      setIsSavingArrematante(true);

      const arrematanteData: ArrematanteInfo = {
        id: editingArrematanteId || undefined, // Manter ID se estiver editando
        nome: arrematanteForm.nome,
        documento: arrematanteForm.documento || undefined,
        endereco: arrematanteForm.endereco || undefined,
        email: arrematanteForm.email || undefined,
        telefone: arrematanteForm.telefone || undefined,
        loteId: arrematanteForm.loteId || undefined,
        valorPagar: arrematanteForm.valorPagar,
        valorPagarNumerico: parseCurrencyToNumber(arrematanteForm.valorPagar),
        valorEntrada: arrematanteForm.valorEntrada || undefined,
        diaVencimentoMensal: arrematanteForm.diaVencimentoMensal,
        quantidadeParcelas: arrematanteForm.quantidadeParcelas,
        parcelasPagas: typeof arrematanteForm.parcelasPagas === 'number' ? arrematanteForm.parcelasPagas : 0,
        mesInicioPagamento: arrematanteForm.mesInicioPagamento,
        pago: arrematanteForm.pago,
        documentos: arrematanteForm.documentos,
        percentualJurosAtraso: arrematanteForm.percentualJurosAtraso,
        tipoJurosAtraso: arrematanteForm.tipoJurosAtraso
      };

      // Preparar os lotes atualizados se um lote foi arrematado
      let lotesAtualizados = addingArrematanteFor.lotes || [];
      
      // Se um lote específico foi selecionado, marcar como arrematado
      if (arrematanteForm.loteId) {
        lotesAtualizados = lotesAtualizados.map(lote => 
          lote.id === arrematanteForm.loteId 
            ? { ...lote, status: 'arrematado' as const }
            : lote
        );
      }

      // Obter array atual de arrematantes
      const arrematantesAtuais = addingArrematanteFor.arrematantes || [];
      
      // Se estiver editando, substituir no array; senão, adicionar
      let novosArrematantes: ArrematanteInfo[];
      if (editingArrematanteId) {
        novosArrematantes = arrematantesAtuais.map(a => 
          a.id === editingArrematanteId ? arrematanteData : a
        );
      } else {
        novosArrematantes = [...arrematantesAtuais, arrematanteData];
      }

      // Atualizar o leilão com TODOS os arrematantes
      await updateAuction({
        id: addingArrematanteFor.id,
        data: { 
          arrematantes: novosArrematantes,
          lotes: lotesAtualizados
        }
      });

      // ⚡ CRUCIAL: Aguardar um momento para o React Query atualizar o cache
      await new Promise(resolve => setTimeout(resolve, 500));

      // ⚡ Atualizar o estado local com os dados mais recentes
      const leilaoAtualizado = auctions.find(a => a.id === addingArrematanteFor.id);
      if (leilaoAtualizado) {
        setAddingArrematanteFor(leilaoAtualizado);
        console.log('✅ Estado sincronizado - Arrematantes atuais:', leilaoAtualizado.arrematantes?.length || 0);
      }

      // Log da criação/edição do arrematante
      const isEditing = !!editingArrematanteId;
      await logBidderAction(
        isEditing ? 'update' : 'create', 
        arrematanteData.nome, 
        addingArrematanteFor.nome, 
        addingArrematanteFor.id,
        {
          metadata: {
            valor_total: arrematanteData.valorPagarNumerico,
            quantidade_parcelas: arrematanteData.quantidadeParcelas,
            parcelas_pagas: arrematanteData.parcelasPagas,
            percentual_juros_atraso: arrematanteData.percentualJurosAtraso,
            tipo_juros: arrematanteData.tipoJurosAtraso,
            lote_id: arrematanteData.loteId,
            has_documents: (arrematanteData.documentos?.length || 0) > 0
          }
        }
      );
    } catch (error) {
      console.error('Erro ao salvar arrematante:', error);
      toast({
        title: "Erro ao salvar",
        description: "Ocorreu um erro ao salvar as alterações. Tente novamente.",
        variant: "destructive",
      });
      return;
    } finally {
      setIsSavingArrematante(false);
    }
    
    setArrematanteForm({
      nome: "",
      documento: "",
      endereco: "",
      email: "",
      telefone: "",
      loteId: "",
      valorPagar: "",
      valorEntrada: "",
      diaVencimentoMensal: 15,
      quantidadeParcelas: 12,
      parcelasPagas: 0,
      mesInicioPagamento: new Date().toISOString().slice(0, 7),
      pago: false,
      documentos: [],
      percentualJurosAtraso: 0,
      tipoJurosAtraso: "composto" as "simples" | "composto"
    });
    setAddingArrematanteFor(null);
    setEditingArrematanteId(null);
  };

  // Função para cancelar adição de arrematante
  const handleCancelArrematante = () => {
    setArrematanteForm({
      nome: "",
      documento: "",
      endereco: "",
      email: "",
      telefone: "",
      loteId: "",
      valorPagar: "",
      valorEntrada: "",
      diaVencimentoMensal: 15,
      quantidadeParcelas: 12,
      parcelasPagas: 0,
      mesInicioPagamento: new Date().toISOString().slice(0, 7),
      pago: false,
      documentos: [],
      percentualJurosAtraso: 0,
      tipoJurosAtraso: "composto" as "simples" | "composto"
    });
    setDocumentType('CPF'); // Resetar tipo de documento
    setAddingArrematanteFor(null);
    setEditingArrematanteId(null);
    setShowArrematanteSelector(false);
  };

  // Filtrar leilões ativos/arquivados
  const activeAuctions = auctions.filter(auction => showArchived ? auction.arquivado : !auction.arquivado);

  // Contadores para filtros
  const getStatusCount = (status: AuctionStatus | "todos") => {
    if (status === "todos") return activeAuctions.length;
    return activeAuctions.filter(auction => auction.status === status).length;
  };

  const getLocalCount = (local: string) => {
    if (local === "todos") return activeAuctions.length;
    return activeAuctions.filter(auction => auction.local === local).length;
  };

  // Filtros aplicados
  const filteredAuctions = activeAuctions.filter((auction) => {
    const matchesSearch = auction.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         auction.identificacao?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         auction.endereco?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === "todos" || auction.status === statusFilter;
    const matchesLocal = localFilter === "todos" || auction.local === localFilter;
    
    return matchesSearch && matchesStatus && matchesLocal;
  });

  // ⚡ PERFORMANCE: Paginação client-side (50 leilões por página)
  const {
    items: paginatedAuctions,
    currentPage,
    totalPages,
    setPage,
  } = useClientPagination(filteredAuctions, 50);

  const handleCreateAuction = async (values: AuctionFormValues) => {
    try {
      // ✅ Separar lotes de convidados dos lotes normais
      const lotesAnfitriao = (values.lotes || []).filter(l => !l.isConvidado);
      const lotesConvidados = (values.lotes || []).filter(l => l.isConvidado);
      
      console.log('📊 Separação de lotes:', {
        total: values.lotes?.length || 0,
        anfitriao: lotesAnfitriao.length,
        convidados: lotesConvidados.length
      });
      
      // ✅ Criar leilão com TODOS os lotes para aparecerem no formulário
      // Lotes convidados também ficam no array para serem editáveis
      const valuesParaLeilao = {
        ...values,
        lotes: values.lotes // Manter todos os lotes
      };
      
      const newAuction = await createAuction(valuesParaLeilao);
      
      // ✅ Criar lotes de convidados separadamente na tabela guest_lots
      if (lotesConvidados.length > 0) {
        console.log('🎯 Processando lotes de convidados:', lotesConvidados.length);
        
        // Filtrar apenas lotes que ainda não foram salvos como guest_lots
        const lotesNovos = lotesConvidados.filter(l => !l.guestLotId);
        console.log('📝 Lotes novos para criar:', lotesNovos.length);
        
        for (const loteConvidado of lotesNovos) {
          try {
            console.log('📝 Criando lote de convidado:', loteConvidado.numero);
            
            // Criar o lote de convidado no Supabase
            // Nota: guest_lots table não está no database.types.ts gerado
            const { data: guestLot, error: guestLotError} = await supabase
              .from('guest_lots')
              .insert({
                numero: loteConvidado.numero,
                descricao: loteConvidado.descricao,
                leilao_id: newAuction.id,
                status: 'disponivel',
                proprietario: loteConvidado.proprietario || '',
                codigo_pais: loteConvidado.codigoPais || '+55',
                celular_proprietario: loteConvidado.celularProprietario || '',
                email_proprietario: loteConvidado.emailProprietario || '',
                imagens: loteConvidado.imagens || [],
                documentos: loteConvidado.documentos || [],
                observacoes: '',
                arquivado: false,
              })
              .select()
              .single();
            
            if (guestLotError) {
              console.error('❌ Erro ao criar lote de convidado:', guestLotError);
              throw guestLotError;
            }
            
            console.log('✅ Lote de convidado criado:', guestLot.id);
            
            // Atualizar o lote no array values.lotes com o guestLotId
            // Isso será refletido no próximo save
            loteConvidado.guestLotId = guestLot.id;
            
            // Criar as mercadorias do lote
            if (loteConvidado.mercadorias && loteConvidado.mercadorias.length > 0) {
              const mercadoriasParaInserir = loteConvidado.mercadorias.map(m => ({
                guest_lot_id: guestLot.id,
                nome: m.titulo || m.tipo || m.nome || '',
                descricao: m.descricao || '',
                quantidade: m.quantidade || 1,
                valor_estimado: m.valorNumerico || 0,
              }));
              
              // Nota: guest_lot_merchandise table não está no database.types.ts gerado
              const { error: mercadoriaError } = await supabase
                .from('guest_lot_merchandise')
                .insert(mercadoriasParaInserir);
              
              if (mercadoriaError) {
                console.error('❌ Erro ao criar mercadorias:', mercadoriaError);
              } else {
                console.log(`✅ ${mercadoriasParaInserir.length} mercadorias criadas`);
              }
            }
            
            console.log(`✅ Lote de convidado ${loteConvidado.numero} criado com sucesso`);
          } catch (error) {
            console.error(`❌ Erro ao criar lote de convidado ${loteConvidado.numero}:`, error);
            toast({
              title: "Aviso",
              description: `Não foi possível criar o lote de convidado ${loteConvidado.numero}. Você pode criá-lo manualmente depois.`,
              variant: "destructive",
            });
          }
        }
        
        toast({
          title: "Lotes de convidados criados",
          description: `${lotesConvidados.length} lote(s) de convidado(s) foram criados e estão disponíveis na aba "Lotes de Convidados".`,
        });
      }
      
      // Log da criação do leilão
      await logAuctionAction('create', values.nome, newAuction.id, {
        metadata: {
          local: values.local,
          data_inicio: values.dataInicio,
          status: values.status,
          total_lotes: lotesAnfitriao.length,
          lotes_convidados: lotesConvidados.length
        }
      });
      
      setIsCreateModalOpen(false);
    } catch (error) {
      console.error("Erro ao criar leilão:", error);
      toast({
        title: "Erro ao criar",
        description: "Não foi possível criar o leilão.",
        variant: "destructive",
      });
    }
  };

  const handleEditAuction = async (values: AuctionFormValues) => {
    if (!editingAuction) return;
    
    // Ativar estado de carregamento
    setIsRefreshing(true);
    
    try {
      console.log('🔄 [Leiloes.tsx] Iniciando atualização do leilão:', editingAuction.id);
      const auctionId = editingAuction.id;
      
      // ✅ Detectar lotes que mudaram de Convidado → Anfitrião
      const lotesOriginais = editingAuction.lotes || [];
      const lotesAtuais = values.lotes || [];
      
      // Encontrar lotes que eram convidados e agora são anfitriões
      const lotesMudadosParaAnfitriao = lotesAtuais.filter(loteAtual => {
        // Encontrar o lote correspondente nos dados originais
        const loteOriginal = lotesOriginais.find(
          lo => lo.id === loteAtual.id || lo.guestLotId === loteAtual.guestLotId
        );
        
        // Verificar se era convidado antes e agora é anfitrião
        return loteOriginal?.isConvidado && !loteAtual.isConvidado && loteOriginal.guestLotId;
      });
      
      console.log('🔄 Lotes mudados para Anfitrião:', lotesMudadosParaAnfitriao.length);
      
      // Deletar esses lotes da tabela guest_lots
      for (const lote of lotesMudadosParaAnfitriao) {
        if (lote.guestLotId) {
          try {
            console.log(`🗑️ Deletando lote convidado #${lote.numero} (guestLotId: ${lote.guestLotId})`);
            
            // Primeiro, deletar arrematantes vinculados a este lote
            const { error: biddersError } = await supabase
              .from('bidders')
              .delete()
              .eq('guest_lot_id', lote.guestLotId);
            
            if (biddersError) {
              console.error('❌ Erro ao deletar arrematantes do lote:', biddersError);
            } else {
              console.log(`✅ Arrematantes do lote #${lote.numero} deletados`);
            }
            
            // Depois, deletar o lote convidado
            // Nota: guest_lots table não está no database.types.ts gerado
            const { error: deleteError } = await supabase
              .from('guest_lots')
              .delete()
              .eq('id', lote.guestLotId);
            
            if (deleteError) {
              console.error('❌ Erro ao deletar lote convidado:', deleteError);
            } else {
              console.log(`✅ Lote convidado #${lote.numero} deletado com sucesso`);
              // Remover o guestLotId do lote
              delete lote.guestLotId;
              delete lote.isConvidado;
            }
          } catch (error) {
            console.error(`❌ Erro ao processar deleção do lote ${lote.numero}:`, error);
          }
        }
      }
      
      // ✅ Separar lotes de convidados dos lotes normais
      const lotesAnfitriao = (values.lotes || []).filter(l => !l.isConvidado);
      const lotesConvidados = (values.lotes || []).filter(l => l.isConvidado);
      
      console.log('📊 Separação de lotes na edição:', {
        total: values.lotes?.length || 0,
        anfitriao: lotesAnfitriao.length,
        convidados: lotesConvidados.length,
        mudadosParaAnfitriao: lotesMudadosParaAnfitriao.length
      });
      
      // ✅ Atualizar leilão com TODOS os lotes para aparecerem no formulário
      // Lotes convidados também ficam no array para serem editáveis
      const valuesParaLeilao = {
        ...values,
        lotes: values.lotes // Manter todos os lotes
      };
      
      // Salvar no banco de dados
      const updated = await updateAuction({ id: auctionId, data: valuesParaLeilao });
      console.log('✅ [Leiloes.tsx] Leilão atualizado no banco:', updated);
      
      // ✅ Processar lotes de convidados (criar apenas novos)
      if (lotesConvidados.length > 0) {
        console.log('🎯 Processando lotes de convidados:', lotesConvidados.length);
        
        // Filtrar apenas lotes que ainda não foram salvos como guest_lots
        const lotesNovos = lotesConvidados.filter(l => !l.guestLotId);
        console.log('📝 Lotes novos para criar:', lotesNovos.length);
        
        for (const loteConvidado of lotesNovos) {
          try {
            console.log('📝 Criando lote de convidado:', loteConvidado.numero);
            
            // Criar o lote de convidado no Supabase
            // Nota: guest_lots table não está no database.types.ts gerado
            const { data: guestLot, error: guestLotError} = await supabase
              .from('guest_lots')
              .insert({
                numero: loteConvidado.numero,
                descricao: loteConvidado.descricao,
                leilao_id: auctionId,
                status: 'disponivel',
                proprietario: loteConvidado.proprietario || '',
                codigo_pais: loteConvidado.codigoPais || '+55',
                celular_proprietario: loteConvidado.celularProprietario || '',
                email_proprietario: loteConvidado.emailProprietario || '',
                imagens: loteConvidado.imagens || [],
                documentos: loteConvidado.documentos || [],
                observacoes: '',
                arquivado: false,
              })
              .select()
              .single();
            
            if (guestLotError) {
              console.error('❌ Erro ao criar lote de convidado:', guestLotError);
              throw guestLotError;
            }
            
            console.log('✅ Lote de convidado criado:', guestLot.id);
            
            // Atualizar o lote no array values.lotes com o guestLotId
            loteConvidado.guestLotId = guestLot.id;
            
            // Criar as mercadorias do lote
            if (loteConvidado.mercadorias && loteConvidado.mercadorias.length > 0) {
              const mercadoriasParaInserir = loteConvidado.mercadorias.map(m => ({
                guest_lot_id: guestLot.id,
                nome: m.titulo || m.tipo || m.nome || '',
                descricao: m.descricao || '',
                quantidade: m.quantidade || 1,
                valor_estimado: m.valorNumerico || 0,
              }));
              
              // Nota: guest_lot_merchandise table não está no database.types.ts gerado
              const { error: mercadoriaError } = await supabase
                .from('guest_lot_merchandise')
                .insert(mercadoriasParaInserir);
              
              if (mercadoriaError) {
                console.error('❌ Erro ao criar mercadorias:', mercadoriaError);
              } else {
                console.log(`✅ ${mercadoriasParaInserir.length} mercadorias criadas`);
              }
            }
            
            console.log(`✅ Lote de convidado ${loteConvidado.numero} criado com sucesso`);
          } catch (error) {
            console.error(`❌ Erro ao criar lote de convidado ${loteConvidado.numero}:`, error);
          }
        }
        
        if (lotesConvidados.length > 0) {
          toast({
            title: "Lotes de convidados criados",
            description: `${lotesConvidados.length} lote(s) de convidado(s) foram criados e estão disponíveis na aba "Lotes de Convidados".`,
          });
        }
      }
      
      // Log da edição do leilão
      await logAuctionAction('update', values.nome, auctionId, {
        metadata: {
          local: values.local,
          data_inicio: values.dataInicio,
          status: values.status,
          total_lotes: lotesAnfitriao.length,
          lotes_convidados: lotesConvidados.length,
          changes: auctionFormChanges
        }
      });
      
      console.log('✅ [Leiloes.tsx] Atualização completa! Fechando modal...');
      
      // Desativar estado de carregamento
      setIsRefreshing(false);
      
      // Fechar modal e limpar estado
      console.log('✨ [Leiloes.tsx] handleEditAuction - Limpando editingAuction após salvar');
      setEditingAuction(null);
      setIsFormBeingEdited(false);
      setAuctionFormChanges({});
      
      // Forçar reload da página para garantir que todos os dados sejam atualizados
      console.log('🔄 [Leiloes.tsx] Recarregando página...');
      window.location.reload();
    } catch (error) {
      console.error("❌ [Leiloes.tsx] Erro ao atualizar leilão:", error);
      
      // Desativar estado de carregamento
      setIsRefreshing(false);
      
      toast({
        title: "Erro ao atualizar",
        description: "Não foi possível salvar as alterações.",
        variant: "destructive",
      });
      // Manter modal aberto em caso de erro
    }
  };

  // Função para capturar mudanças em tempo real no formulário do leilão
  const handleAuctionFormChange = (values: AuctionFormValues, changedField?: keyof AuctionFormValues) => {
    if (!editingAuction) {
      return;
    }
    
    // Armazenar apenas os campos que afetam o arrematante (EXCLUINDO lotes para evitar duplicação)
    const relevantFields: (keyof AuctionFormValues)[] = [
      'tipoPagamento', 
      'diaVencimentoPadrao', 
      'parcelasPadrao', 
      'mesInicioPagamento',
      'dataEntrada',
      'dataVencimentoVista'
      // Removido 'lotes' para evitar duplicação - lotes só são salvos no handleEditAuction
    ];
    
    if (changedField && relevantFields.includes(changedField)) {
      setAuctionFormChanges(prev => ({
        ...prev,
        [changedField]: values[changedField]
      }));
      
      // NOVA: Sincronizar viewingAuction em tempo real se for o mesmo leilão
      if (viewingAuction && viewingAuction.id === editingAuction.id) {
        setViewingAuction(prev => {
          if (!prev) return prev;
          
          // Criar objeto atualizado com as mudanças do formulário
          const updatedAuction: Auction = {
            ...prev,
          };

          // Atualizar campo específico
          if (changedField === 'lotes') {
            updatedAuction.lotes = values.lotes;
          } else {
            // Atualização dinâmica de propriedade baseada no campo alterado
            (updatedAuction as unknown as Record<string, unknown>)[changedField] = values[changedField];
          }

          return updatedAuction;
        });
      }
      
      // Disparar evento customizado para notificar outros componentes sobre a mudança
      window.dispatchEvent(new CustomEvent('auctionFormChanged', {
        detail: {
          auctionId: editingAuction.id,
          changedField,
          newValue: values[changedField],
          allValues: values
        }
      }));
    }
  };

  // Função para cancelar edição e limpar estado
  const handleCancelEdit = () => {
    console.log('❌ [Leiloes.tsx] handleCancelEdit - Limpando editingAuction');
    setEditingAuction(null);
    setIsFormBeingEdited(false);
    setAuctionFormChanges({}); // Limpar mudanças ao cancelar
  };

  // Função para iniciar edição de leilão
  const startEditingAuction = (auction: Auction) => {
    console.log('✏️ [Leiloes.tsx] startEditingAuction chamado:', {
      auctionId: auction.id,
      auctionNome: auction.nome,
      auctionIdentificacao: auction.identificacao
    });
    setEditingAuction(auction);
    setIsFormBeingEdited(true);
  };

  const handleRefresh = async () => {
    if (isRefreshing) return;
    
    setIsRefreshing(true);
    
    // Simular tempo de carregamento para mostrar a animação
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    setIsRefreshing(false);
  };

  // Função para gerar PDF diretamente (sem modal)
  const generatePDFDirect = async (auctionId: string) => {
    const auction = auctions.find(a => a.id === auctionId);
    if (!auction) {
      toast({
        title: "Erro",
        description: "Leilão não encontrado.",
        variant: "destructive",
      });
      return;
    }

    try {
      // Abrir modal temporariamente em background
      setSelectedAuctionForExport(auctionId);
      setIsExportModalOpen(true);
      
      // Aguardar o componente renderizar
      await new Promise(resolve => setTimeout(resolve, 200));
      
      const element = document.getElementById('pdf-content');
      if (!element) {
        throw new Error('Elemento PDF não encontrado');
      }

      // Importar html2pdf dinamicamente
      const html2pdf = (await import('html2pdf.js')).default;

      const opt = {
        margin: [10, 10, 10, 10] as [number, number, number, number],
        filename: `leilao_${auction.identificacao || auction.id}.pdf`,
        image: { type: 'jpeg' as const, quality: 0.98 },
        html2canvas: { 
          scale: 2,
          useCORS: true,
          letterRendering: true
        },
        jsPDF: { 
          unit: 'mm', 
          format: 'a4', 
          orientation: 'portrait' as const
        }
      };

      await html2pdf().set(opt).from(element).save();
      
      // Log da geração do relatório
      await logReportAction('generate', 'leilao', `Relatório do leilão ${auction.nome}`, {
        metadata: {
          auction_id: auction.id,
          auction_name: auction.nome,
          auction_status: auction.status,
          report_format: 'pdf',
          generation_date: new Date().toISOString()
        }
      });
      
      toast({
        title: "PDF Gerado com Sucesso!",
        description: `Relatório do leilão ${auction.identificacao || auction.id} foi baixado.`,
        duration: 4000,
      });
      
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      toast({
        title: "Erro ao Gerar PDF",
        description: "Ocorreu um erro ao gerar o relatório. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      // Sempre fechar o modal no final
      setIsExportModalOpen(false);
      setSelectedAuctionForExport("");
    }
  };

  // Função para gerar PDF (via modal)
  const generatePDF = async (auctionId: string) => {
    const auction = auctions.find(a => a.id === auctionId);
    if (!auction) {
      toast({
        title: "Erro",
        description: "Leilão não encontrado.",
        variant: "destructive",
      });
      return;
    }

    try {
      // Importar html2pdf dinamicamente
      const html2pdf = (await import('html2pdf.js')).default;
      
      // Aguardar um pouco para garantir que o componente renderizou
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const element = document.getElementById('pdf-content');
      if (!element) {
        throw new Error('Elemento PDF não encontrado');
      }

      const opt = {
        margin: [10, 10, 10, 10] as [number, number, number, number],
        filename: `leilao_${auction.identificacao || auction.id}.pdf`,
        image: { type: 'jpeg' as const, quality: 0.98 },
        html2canvas: { 
          scale: 2,
          useCORS: true,
          letterRendering: true
        },
        jsPDF: { 
          unit: 'mm', 
          format: 'a4', 
          orientation: 'portrait' as const
        }
      };

      await html2pdf().set(opt).from(element).save();
      
      toast({
        title: "PDF Gerado com Sucesso!",
        description: `Relatório do leilão ${auction.identificacao || auction.id} foi baixado.`,
        duration: 4000,
      });
      
      setIsExportModalOpen(false);
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      toast({
        title: "Erro ao Gerar PDF",
        description: "Ocorreu um erro ao gerar o relatório. Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteAuction = async (id: string) => {
    try {
      const auction = auctions.find(a => a.id === id);
      if (auction) {
        console.log('🗑️ Deletando leilão e seus lotes convidados:', id);
        
        // ✅ PASSO 1: Deletar lotes convidados associados ao leilão
        try {
          // Buscar lotes convidados usando query dinâmica para evitar erro de tipagem
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const fetchResult: any = await (supabase as any)
            .from('guest_lots')
            .select('id, numero')
            .eq('leilao_id', id);
          
          const guestLots = fetchResult.data as Array<{ id: string; numero: string }> | null;
          const fetchError = fetchResult.error;
          
          if (fetchError) {
            console.error('❌ Erro ao buscar lotes convidados:', fetchError);
          } else if (guestLots && guestLots.length > 0) {
            console.log(`🗑️ Encontrados ${guestLots.length} lote(s) convidado(s) para deletar:`, guestLots.map(l => l.numero));
            
            // Deletar arrematantes de todos os lotes convidados associados
            for (const guestLot of guestLots) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const biddersDeleteResult: any = await supabase
                .from('bidders')
                .delete()
                .eq('guest_lot_id', guestLot.id);
              
              if (biddersDeleteResult.error) {
                console.error(`❌ Erro ao deletar arrematantes do lote ${guestLot.numero}:`, biddersDeleteResult.error);
              } else {
                console.log(`✅ Arrematantes do lote ${guestLot.numero} deletados`);
              }
            }
            
            // Deletar todos os lotes convidados associados
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const deleteResult: any = await (supabase as any)
              .from('guest_lots')
              .delete()
              .eq('leilao_id', id);
            
            const deleteError = deleteResult.error;
            
            if (deleteError) {
              console.error('❌ Erro ao deletar lotes convidados:', deleteError);
            } else {
              console.log(`✅ ${guestLots.length} lote(s) convidado(s) deletado(s) com sucesso`);
            }
          } else {
            console.log('ℹ️ Nenhum lote convidado associado a este leilão');
          }
        } catch (error) {
          console.error('❌ Erro ao processar lotes convidados:', error);
          // Continuar com a exclusão do leilão mesmo se houver erro
        }
        
        // ✅ PASSO 2: Deletar arrematantes vinculados diretamente ao leilão
        try {
          const { error: auctionBiddersError } = await supabase
            .from('bidders')
            .delete()
            .eq('auction_id', id);
          
          if (auctionBiddersError) {
            console.error('❌ Erro ao deletar arrematantes do leilão:', auctionBiddersError);
          } else {
            console.log('✅ Arrematantes do leilão deletados');
          }
        } catch (error) {
          console.error('❌ Erro ao processar arrematantes do leilão:', error);
        }
        
        // ✅ PASSO 3: Deletar o leilão
        await deleteAuction(id);
        
        // Log da exclusão do leilão
        await logAuctionAction('delete', auction.nome, id, {
          metadata: {
            local: auction.local,
            status: auction.status,
            total_lotes: auction.lotes?.length || 0,
            had_bidder: !!auction.arrematante
          }
        });
        
        toast({
          title: "Leilão excluído",
          description: `O leilão "${auction.nome}" e seus lotes convidados foram excluídos com sucesso.`,
        });
      }
    } catch (error) {
      console.error("Erro ao excluir leilão:", error);
      toast({
        title: "Erro ao excluir leilão",
        description: "Não foi possível excluir o leilão. Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const handleArchiveAuction = async (id: string) => {
    try {
      const auction = auctions.find(a => a.id === id);
      if (auction) {
        await archiveAuction(id);
        
        // Log do arquivamento do leilão
        await logAuctionAction('archive', auction.nome, id, {
          metadata: {
            local: auction.local,
            status: auction.status,
            total_lotes: auction.lotes?.length || 0
          }
        });
        
        toast({
          title: "Leilão arquivado",
          description: `O leilão "${auction.nome}" foi arquivado com sucesso.`,
        });
      }
    } catch (error) {
      console.error("Erro ao arquivar leilão:", error);
      toast({
        title: "Erro ao arquivar leilão",
        description: "Não foi possível arquivar o leilão. Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const handleUnarchiveAuction = async (id: string) => {
    try {
      const auction = auctions.find(a => a.id === id);
      if (auction) {
        await unarchiveAuction(id);
        
        // Log do desarquivamento do leilão
        await logAuctionAction('unarchive', auction.nome, id, {
          metadata: {
            local: auction.local,
            status: auction.status,
            total_lotes: auction.lotes?.length || 0
          }
        });
        
        toast({
          title: "Leilão desarquivado",
          description: `O leilão "${auction.nome}" foi desarquivado com sucesso.`,
        });
      }
    } catch (error) {
      console.error("Erro ao desarquivar leilão:", error);
      toast({
        title: "Erro ao desarquivar leilão",
        description: "Não foi possível desarquivar o leilão. Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const handleDuplicateAuction = async (auction: Auction) => {
    try {
      const duplicatedAuction = await duplicateAuction(auction);
      
      // Log da duplicação do leilão
      await logAuctionAction('duplicate', auction.nome, duplicatedAuction.id, {
        metadata: {
          original_auction_id: auction.id,
          local: auction.local,
          status: auction.status,
          total_lotes: auction.lotes?.length || 0
        }
      });
      
      toast({
        title: "Leilão duplicado",
        description: `O leilão "${auction.nome}" foi duplicado com sucesso.`,
      });
    } catch (error) {
      console.error("Erro ao duplicar leilão:", error);
      toast({
        title: "Erro ao duplicar leilão",
        description: "Não foi possível duplicar o leilão. Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const getStatusBadge = (status: AuctionStatus) => {
    const variants = {
      agendado: "secondary",
      em_andamento: "default", 
      finalizado: "outline"
    } as const;
    
    const labels = {
      agendado: "Agendado",
      em_andamento: "Em Andamento",
      finalizado: "Finalizado"
    };

    const colors = {
      agendado: "text-gray-700 bg-gray-100 hover:bg-gray-100",
      em_andamento: "text-green-700 bg-green-100 hover:bg-green-100",
      finalizado: "text-gray-800 bg-gray-200 hover:bg-gray-200"
    };

    return (
      <Badge variant={variants[status] || "secondary"} className={colors[status]}>
        {labels[status]}
      </Badge>
    );
  };

  const formatCurrency = (value: number | undefined) => {
    if (!value) return "R$ 0,00";
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL"
    }).format(value);
  };

  const formatDate = (dateString: string) => {
    // Adiciona o horário UTC para evitar problemas de fuso horário
    const date = new Date(dateString + 'T12:00:00.000Z');
    return date.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit", 
      year: "numeric",
      timeZone: "UTC"
    });
  };

  const getLocalIcon = (local: string) => {
    switch (local) {
      case "presencial": return <Building className="h-4 w-4 text-blue-600" />;
      case "online": return <Globe className="h-4 w-4 text-green-600" />;
      case "hibrido": return <Users className="h-4 w-4 text-purple-600" />;
      default: return <MapPin className="h-4 w-4 text-gray-600" />;
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-sm text-muted-foreground">Carregando leilões...</p>
      </div>
    </div>
  );
}

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Gestão de Leilões</h1>
          <p className="text-muted-foreground">
            Gerencie e monitore todos os leilões da plataforma
          </p>
        </div>
        
        <div className="flex gap-2">
           <Button 
             variant="outline" 
             className="gap-2 bg-white text-black border-gray-300 hover:bg-gray-100 hover:text-black transition-all duration-200"
             onClick={handleRefresh}
             disabled={isRefreshing}
           >
             <RefreshCw className={`h-4 w-4 transition-all duration-500 ${isRefreshing ? 'animate-spin' : ''}`} />
             {isRefreshing ? 'Atualizando...' : 'Atualizar'}
          </Button>
          
          <Button 
            className="gap-2 bg-black hover:bg-gray-800"
            onClick={() => setIsCreateModalOpen(true)}
          >
                <Plus className="h-4 w-4" />
                Novo Leilão
              </Button>

          {/* Wizard de Criação em Tela Cheia */}
          {isCreateModalOpen && (
            <AuctionWizard
                initial={createEmptyAuctionForm()}
                onSubmit={handleCreateAuction}
                onCancel={() => setIsCreateModalOpen(false)}
              />
          )}
        </div>
      </div>

             {/* Painel de Indicadores */}
       <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
         <div className="px-8 py-7">
           <div className="flex items-center justify-between mb-8">
             <div>
               <h2 className="text-xl font-semibold text-gray-900 tracking-tight">Indicadores Gerais</h2>
               <p className="text-sm text-gray-600 mt-1">Visão geral dos leilões cadastrados</p>
             </div>
             <div className="text-xs text-gray-500 font-medium">
               Última atualização: {new Date().toLocaleDateString("pt-BR", { 
                 day: "2-digit", 
                 month: "2-digit", 
                 year: "numeric"
               })} às {new Date().toLocaleTimeString("pt-BR", { 
                 hour: "2-digit", 
                 minute: "2-digit" 
               })}
             </div>
           </div>
           
           <div className="grid grid-cols-4 divide-x divide-gray-200">
             <div className="text-center px-6">
               <div className="mb-4">
                 <p className="text-xs font-semibold text-gray-700 uppercase tracking-[0.15em] mb-3">Total de Leilões</p>
                 <div className="h-px w-20 bg-gray-300 mx-auto mb-4"></div>
               </div>
               <p className="text-4xl font-extralight text-gray-900 mb-2 tracking-tight">{auctions.length}</p>
               <p className="text-sm text-gray-600 font-medium">Eventos Cadastrados</p>
             </div>
             
             <div className="text-center px-6">
               <div className="mb-4">
                 <p className="text-xs font-semibold text-gray-700 uppercase tracking-[0.15em] mb-3">Em Andamento</p>
                 <div className="h-px w-20 bg-gray-300 mx-auto mb-4"></div>
               </div>
               <p className="text-4xl font-extralight text-gray-900 mb-2 tracking-tight">
                 {auctions.filter(a => a.status === "em_andamento").length}
               </p>
               <p className="text-sm text-gray-600 font-medium">Leilões Ativos</p>
             </div>
             
             <div className="text-center px-6">
               <div className="mb-4">
                 <p className="text-xs font-semibold text-gray-700 uppercase tracking-[0.15em] mb-3">Programados</p>
                 <div className="h-px w-20 bg-gray-300 mx-auto mb-4"></div>
               </div>
               <p className="text-4xl font-extralight text-gray-900 mb-2 tracking-tight">
                 {auctions.filter(a => a.status === "agendado").length}
               </p>
               <p className="text-sm text-gray-600 font-medium">Eventos Futuros</p>
             </div>
             
             <div className="text-center px-6">
               <div className="mb-4">
                 <p className="text-xs font-semibold text-gray-700 uppercase tracking-[0.15em] mb-3">Investimento</p>
                 <div className="h-px w-20 bg-gray-300 mx-auto mb-4"></div>
               </div>
               <p className="text-3xl font-extralight text-gray-900 mb-2 tracking-tight">
                 {formatCurrency(auctions.reduce((sum, a) => {
                   if (a.custosNumerico !== undefined) {
                     return sum + a.custosNumerico;
                   }
                   // Fallback para leilões antigos com custos como number
                   if (typeof a.custos === 'number') {
                     return sum + a.custos;
                   }
                   return sum;
                 }, 0))}
               </p>
               <p className="text-sm text-gray-600 font-medium">Custos Totais</p>
             </div>
           </div>
         </div>
       </div>

      {/* Tabela de Leilões */}
      <Card className="shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-xl font-semibold text-gray-900">Leilões Cadastrados</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  {filteredAuctions.length} de {auctions.length} leilões
                </p>
              </div>
              <Button 
                variant="outline" 
                className="gap-2 h-11 px-4 min-w-[120px] hover:bg-gray-100 hover:text-gray-900"
                onClick={() => setIsExportModalOpen(true)}
              >
                 <Download className="h-4 w-4" />
                 Exportar
               </Button>
            </div>
            
                         {/* Controles de Filtro */}
             <div className="flex items-center justify-between gap-4">
               {/* Barra de Pesquisa */}
               <div className="relative flex-1 max-w-md">
                 <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                 <Input
                   placeholder="Buscar leilões..."
                   value={searchInputValue}
                   onChange={(e) => {
                     handleSearchChange(e.target.value);
                   }}
                   className="pl-10 h-10 border-gray-300 focus:border-gray-300 focus:ring-0 no-focus-outline bg-white"
                 />
               </div>
               
               {/* Filtros à Direita */}
               <div className="flex items-center gap-3">
                 <div className="text-sm font-medium text-gray-700">Filtrar:</div>
                 
                 <Select 
                   value={statusFilter} 
                   onValueChange={(v) => {
                     handleSmoothTransition(() => {
                       setStatusFilter(v as AuctionStatus | "todos");
                     });
                   }}
                   onOpenChange={setIsStatusFilterOpen}
                 >
                   <SelectTrigger className="h-10 w-48 border-gray-300 bg-white text-sm focus:!ring-0 focus:!ring-offset-0 focus:!border-gray-300 focus:!outline-none focus:!shadow-none">
                     <SelectValue placeholder="Status" />
                   </SelectTrigger>
                   <SelectContent>
                     <SelectItem value="todos">Todos ({getStatusCount("todos")})</SelectItem>
                     <SelectItem value="agendado">Agendado ({getStatusCount("agendado")})</SelectItem>
                     <SelectItem value="em_andamento">Em Andamento ({getStatusCount("em_andamento")})</SelectItem>
                     <SelectItem value="finalizado">Finalizado ({getStatusCount("finalizado")})</SelectItem>
                   </SelectContent>
                 </Select>
                 
                 <Select 
                   value={localFilter} 
                   onValueChange={(v) => {
                     handleSmoothTransition(() => {
                       setLocalFilter(v);
                     });
                   }}
                   onOpenChange={setIsLocalFilterOpen}
                 >
                  <SelectTrigger className="h-10 w-44 border-gray-300 bg-white text-sm focus:!ring-0 focus:!ring-offset-0 focus:!border-gray-300 focus:!outline-none focus:!shadow-none">
                    <SelectValue placeholder="Modalidade" />
                  </SelectTrigger>
                   <SelectContent>
                     <SelectItem value="todos">Todos ({getLocalCount("todos")})</SelectItem>
                     <SelectItem value="presencial">Presencial ({getLocalCount("presencial")})</SelectItem>
                     <SelectItem value="online">Online ({getLocalCount("online")})</SelectItem>
                     <SelectItem value="hibrido">Híbrido ({getLocalCount("hibrido")})</SelectItem>
                   </SelectContent>
                 </Select>

                 {showArchived && (
                   <Button
                     variant="outline"
                     onClick={() => {
                       handleSmoothTransition(() => {
                         setShowArchived(false);
                       });
                     }}
                     className="h-10 px-3 border-gray-300 bg-white text-sm hover:bg-gray-100 hover:text-black"
                   >
                     <ArrowLeft className="h-4 w-4" />
                   </Button>
                 )}
                 <Button
                   variant="outline"
                   onClick={() => {
                     handleSmoothTransition(() => {
                       setShowArchived(!showArchived);
                     });
                   }}
                   className="h-10 px-4 border-gray-300 bg-white text-black text-sm hover:bg-gray-100 hover:text-black"
                 >
                   <Archive className="h-4 w-4 mr-2" />
                   {showArchived ? "Ver Ativos" : `Ver Arquivados (${auctions.filter(a => a.arquivado).length})`}
                 </Button>
               </div>
             </div>
          </div>
                 </CardHeader>
         <CardContent className="h-[calc(100vh-550px)]">
                     {isLoadingResults ? (
           <div className={`space-y-4 ${isTransitioning ? 'slide-in-left' : ''}`}>
             {/* Skeleton Cards */}
             {[...Array(3)].map((_, index) => (
               <div key={index} className="animate-pulse-slow transform-none">
                 <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm transition-none transform-none">
                   <div className="flex items-center justify-between">
                     <div className="flex items-center space-x-4 flex-1">
                       {/* Avatar skeleton */}
                       <div className="w-12 h-12 bg-gray-200 rounded-full animate-shimmer"></div>
                       
                       {/* Content skeleton */}
                       <div className="flex-1 space-y-2">
                         <div className="h-4 rounded w-3/4 animate-shimmer" style={{animationDelay: `${index * 0.2}s`}}></div>
                         <div className="h-3 rounded w-1/2 animate-shimmer" style={{animationDelay: `${index * 0.3}s`}}></div>
                       </div>
                     </div>
                     
                     {/* Status and actions skeleton */}
                     <div className="flex items-center space-x-4">
                       <div className="h-6 rounded-full w-20 animate-shimmer" style={{animationDelay: `${index * 0.4}s`}}></div>
                       <div className="h-6 rounded-full w-16 animate-shimmer" style={{animationDelay: `${index * 0.5}s`}}></div>
                       <div className="flex space-x-2">
                         <div className="w-8 h-8 rounded animate-shimmer" style={{animationDelay: `${index * 0.6}s`}}></div>
                         <div className="w-8 h-8 rounded animate-shimmer" style={{animationDelay: `${index * 0.7}s`}}></div>
                         <div className="w-8 h-8 rounded animate-shimmer" style={{animationDelay: `${index * 0.8}s`}}></div>
                       </div>
                     </div>
                   </div>
                   
                   {/* Bottom info skeleton */}
                   <div className="mt-4 flex items-center justify-between">
                     <div className="flex space-x-6">
                       <div className="h-3 rounded w-24 animate-shimmer" style={{animationDelay: `${index * 0.9}s`}}></div>
                       <div className="h-3 rounded w-20 animate-shimmer" style={{animationDelay: `${index * 1.0}s`}}></div>
                       <div className="h-3 rounded w-28 animate-shimmer" style={{animationDelay: `${index * 1.1}s`}}></div>
                     </div>
                     <div className="h-4 rounded w-20 animate-shimmer" style={{animationDelay: `${index * 1.2}s`}}></div>
                   </div>
                 </div>
               </div>
             ))}
           </div>
          ) : filteredAuctions.length === 0 ? (
           <div className={`text-center py-16 ${!isLoadingResults ? 'fade-in' : ''}`}>
             <div className="h-24 w-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
               <Calendar className="h-12 w-12 text-gray-400" />
             </div>
             <h3 className="text-lg font-semibold mb-2 text-gray-900">Nenhum leilão encontrado</h3>
             <p className="text-muted-foreground mb-6 max-w-md mx-auto">
               {searchTerm || statusFilter !== "todos" || localFilter !== "todos" 
                 ? "Nenhum leilão corresponde aos filtros aplicados. Tente ajustar os critérios de busca."
                 : "Ainda não há leilões cadastrados no sistema. Comece criando seu primeiro leilão."
               }
             </p>
             {!searchTerm && statusFilter === "todos" && localFilter === "todos" && (
               <Dialog open={isCreateModalOpen} onOpenChange={setIsCreateModalOpen}>
                 <DialogTrigger asChild>
                   <Button className="gap-2 bg-blue-600 hover:bg-blue-700">
                     <Plus className="h-4 w-4" />
                     Criar Primeiro Leilão
                   </Button>
                 </DialogTrigger>
               </Dialog>
             )}
           </div>
          ) : (
                        <div className={`${!isLoadingResults ? 'fade-in' : ''} overflow-y-auto max-h-full custom-scrollbar`}>
              <Table>
               <TableHeader className="sticky top-0 bg-white z-10">
                 <TableRow className="bg-muted/30">
                   <TableHead className="font-semibold text-gray-700">Nome do Evento</TableHead>
                   <TableHead className="font-semibold text-gray-700">Identificação</TableHead>
                   <TableHead className="font-semibold text-gray-700">Status</TableHead>
                   <TableHead className="font-semibold text-gray-700">Modalidade</TableHead>
                   <TableHead className="font-semibold text-gray-700">Data de Início</TableHead>
                   <TableHead className="font-semibold text-gray-700">Custos</TableHead>
                   <TableHead className="font-semibold text-gray-700 text-center">Ações</TableHead>
                 </TableRow>
               </TableHeader>
                <TableBody>
                  {paginatedAuctions.map((auction) => (
                    <TableRow key={auction.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell className="font-medium">
                        <div>
                          <p className="font-semibold text-gray-900">{auction.nome}</p>
                          {auction.endereco && (
                            <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                              <MapPin className="h-3 w-3" />
                              {auction.endereco.length > 50 ? auction.endereco.substring(0, 47) + "..." : auction.endereco}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        {auction.identificacao ? (
                          <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
                            {auction.identificacao}
                          </code>
                        ) : (
                          <span className="text-xs text-muted-foreground">Não informado</span>
                        )}
                      </TableCell>
                      <TableCell>{getStatusBadge(auction.status)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="capitalize">
                          {auction.local}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-medium">{formatDate(auction.dataInicio)}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-semibold text-black">
                          {(() => {
                            // Priorizar custosNumerico se disponível
                            if (auction.custosNumerico && auction.custosNumerico > 0) {
                              return formatCurrency(auction.custosNumerico);
                            }
                            
                            // Fallback para custos como string
                            if (auction.custos && auction.custos.trim() !== "") {
                              if (typeof auction.custos === 'string') {
                                return auction.custos.startsWith('R$') ? auction.custos : `R$ ${auction.custos}`;
                              } else {
                                return `R$ ${(auction.custos as number).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                              }
                            }
                            
                            return "R$ 0,00";
                          })()}
                        </span>
                      </TableCell>
                                                 <TableCell>
                             <div className="flex items-center justify-center gap-1">
                               {(() => {
                                 const arrematantesCount = auction.arrematantes?.length || 0;
                                 
                                if (arrematantesCount === 0) {
                                  // Sem arrematantes: mostrar botão "Adicionar Arrematante"
                                  return (
                               <Button
                                 variant="ghost"
                                 size="sm"
                                      onClick={async () => {
                                        wizardClosedIntentionally.current = false; // Resetar flag ao abrir
                                        
                                        // 🔄 Recarregar dados do leilão para garantir que temos guestLotId atualizado
                                        await queryClient.invalidateQueries({ queryKey: ['auctions'] });
                                        await new Promise(resolve => setTimeout(resolve, 100));
                                        const auctionAtualizado = auctions.find(a => a.id === auction.id) || auction;
                                        
                                        setAddingArrematanteFor(auctionAtualizado);
                                        setEditingArrematanteId('__NEW__'); // ✅ Flag especial para indicar "adicionar novo"
                                        setShowArrematanteSelector(false);
                                      }}
                                      className="h-8 w-8 p-0 hover:bg-gray-100 btn-action-click"
                                      title="Adicionar Arrematante"
                                    >
                                      <UserPlus className="h-4 w-4 text-gray-600" />
                                    </Button>
                                  );
                                } else {
                                  // Com arrematantes: mostrar ambos os botões
                                  return (
                                    <>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={async () => {
                                          wizardClosedIntentionally.current = false; // Resetar flag ao abrir
                                          
                                          // 🔄 Recarregar dados do leilão para garantir que temos guestLotId atualizado
                                          await queryClient.invalidateQueries({ queryKey: ['auctions'] });
                                          await new Promise(resolve => setTimeout(resolve, 100));
                                          const auctionAtualizado = auctions.find(a => a.id === auction.id) || auction;
                                          
                                          setAddingArrematanteFor(auctionAtualizado);
                                          setShowArrematanteSelector(false); // ✅ Não abrir popup - ir direto pro wizard
                                          setEditingArrematanteId(null); // ✅ Não pré-selecionar - wizard mostrará etapa de seleção
                                        }}
                                        className="h-8 w-8 p-0 hover:bg-gray-100 relative btn-action-click"
                                        title={`Ver/Editar Arrematantes (${arrematantesCount})`}
                                      >
                                   <UserCheck className="h-4 w-4 text-gray-600" />
                                        <span className="absolute -top-1 -right-1 bg-gray-600 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-bold">
                                          {arrematantesCount}
                                        </span>
                                      </Button>
                                      
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={async () => {
                                          wizardClosedIntentionally.current = false; // Resetar flag ao abrir
                                          
                                          // 🔄 Recarregar dados do leilão para garantir que temos guestLotId atualizado
                                          await queryClient.invalidateQueries({ queryKey: ['auctions'] });
                                          await new Promise(resolve => setTimeout(resolve, 100));
                                          const auctionAtualizado = auctions.find(a => a.id === auction.id) || auction;
                                          
                                          setAddingArrematanteFor(auctionAtualizado);
                                          setEditingArrematanteId('__NEW__'); // ✅ Flag especial para indicar "adicionar novo"
                                          setShowArrematanteSelector(false);
                                        }}
                                        className="h-8 w-8 p-0 hover:bg-gray-100 btn-action-click"
                                        title="Adicionar Novo Arrematante"
                                      >
                                   <UserPlus className="h-4 w-4 text-gray-600" />
                               </Button>
                                     </>
                                   );
                                 }
                               })()}

                               <Button
                                 variant="ghost"
                                 size="sm"
                                 onClick={() => {
                                   // Forçar nova instância para garantir remontagem do componente
                                   setViewingAuction(auction);
                                   setViewingVersion(prev => prev + 1);
                                 }}
                                 className="h-8 w-8 p-0 hover:bg-gray-100 btn-action-click"
                                 title="Ver detalhes"
                               >
                                 <Eye className="h-4 w-4 text-black" />
                               </Button>
                               
                               <Button
                                 variant="ghost"
                                 size="sm"
                                 onClick={() => startEditingAuction(auction)}
                                 className="h-8 w-8 p-0 hover:bg-gray-100 btn-action-click"
                                 title="Editar"
                               >
                                 <Edit className="h-4 w-4 text-gray-600" />
                               </Button>
                          
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 hover:bg-gray-100">
                                <MoreVertical className="h-4 w-4 text-gray-600" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem 
                                className="gap-2 focus:bg-gray-100 focus:text-gray-900"
                                onClick={() => {
                                  setSelectedAuctionForExport(auction.id);
                                  setIsExportModalOpen(true);
                                }}
                              >
                                <Download className="h-4 w-4" />
                                Exportar PDF
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                className="gap-2 focus:bg-gray-100 focus:text-gray-900"
                                onClick={() => handleDuplicateAuction(auction)}
                              >
                                <Copy className="h-4 w-4" />
                                Duplicar Leilão
                              </DropdownMenuItem>
                              {showArchived ? (
                                <DropdownMenuItem 
                                  className="gap-2 focus:bg-gray-100 focus:text-gray-900"
                                  onClick={() => handleUnarchiveAuction(auction.id)}
                                >
                                  <RefreshCw className="h-4 w-4" />
                                  Desarquivar Leilão
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem 
                                  className="gap-2 focus:bg-gray-100 focus:text-gray-900"
                                  onClick={() => handleArchiveAuction(auction.id)}
                                >
                                  <Archive className="h-4 w-4" />
                                  Arquivar Leilão
                                </DropdownMenuItem>
                              )}
                              <Separator className="my-1" />
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <DropdownMenuItem 
                                    className="gap-2 text-red-600 focus:text-red-600 focus:bg-red-50"
                                    onSelect={(e) => e.preventDefault()}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                    Excluir Leilão
                                  </DropdownMenuItem>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Tem certeza que deseja excluir o leilão <strong>"{auction.nome}"</strong>? 
                                      <br />
                                      Esta ação é irreversível e todos os dados relacionados serão perdidos.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => handleDeleteAuction(auction.id)}
                                      className="bg-red-600 hover:bg-red-700 btn-save-click"
                                    >
                                      Confirmar Exclusão
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* ⚡ PERFORMANCE: Paginação */}
              {filteredAuctions.length > 0 && (
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={setPage}
                  showFirstLast={true}
                  disabled={isLoadingResults}
                />
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Wizard de Edição */}
          {editingAuction && (() => {
            const initialData = {
                nome: editingAuction.nome,
                identificacao: editingAuction.identificacao,
                local: editingAuction.local,
                endereco: editingAuction.endereco,
                dataInicio: editingAuction.dataInicio,
                dataEncerramento: editingAuction.dataEncerramento,
                tipoPagamento: editingAuction.tipoPagamento,
                mesInicioPagamento: editingAuction.mesInicioPagamento,
                diaVencimentoPadrao: editingAuction.diaVencimentoPadrao,
                dataEntrada: editingAuction.dataEntrada,
                dataVencimentoVista: editingAuction.dataVencimentoVista,
                parcelasPadrao: editingAuction.parcelasPadrao,
                status: editingAuction.status,
                custos: editingAuction.custos,
                custosNumerico: editingAuction.custosNumerico,
                detalheCustos: editingAuction.detalheCustos || [],
                detalhePatrocinios: editingAuction.detalhePatrocinios || [],
                patrociniosTotal: editingAuction.patrociniosTotal,
              percentualComissaoLeiloeiro: editingAuction.percentualComissaoLeiloeiro,
              percentualComissaoVenda: editingAuction.percentualComissaoVenda,
                lotes: editingAuction.lotes || [],
            fotosMercadoria: editingAuction.fotosMercadoria || [],
            documentos: editingAuction.documentos || [],
                historicoNotas: editingAuction.historicoNotas || [],
                arquivado: editingAuction.arquivado || false
            };

            console.log('🏗️ [Leiloes.tsx] Renderizando AuctionWizard de Edição:', {
              hasEditingAuction: !!editingAuction,
              editingAuctionId: editingAuction?.id,
              editingAuctionNome: editingAuction?.nome,
              initialStep,
              initialLoteIndex,
              initialData: {
                nome: initialData.nome,
                identificacao: initialData.identificacao,
                qtdLotes: initialData.lotes.length
              }
            });

            return (
              <AuctionWizard
                initial={initialData}
              initialStep={initialStep}
              initialLoteIndex={initialLoteIndex}
              onSubmit={handleEditAuction}
              onCancel={handleCancelEdit}
            />
            );
          })()}

      {/* Modal de Visualização de Detalhes */}
      <Dialog open={!!viewingAuction} onOpenChange={(open) => !open && setViewingAuction(null)}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden p-0">
          {/* Header Fixo */}
          <div className="sticky top-0 bg-white z-50 px-6 py-4 border-b border-gray-200 shadow-sm">
          <DialogHeader>
              <DialogTitle className="text-xl font-semibold text-gray-900 pr-8">Detalhes do Leilão</DialogTitle>
              <DialogDescription>
                Visualize todas as informações detalhadas do leilão
              </DialogDescription>
          </DialogHeader>
            <button
              onClick={() => setViewingAuction(null)}
              className="absolute top-4 right-4 p-2 hover:bg-gray-100 rounded-full transition-colors z-60 focus:!ring-0 focus:!ring-offset-0 focus:!border-gray-400 focus:!outline-none focus:!shadow-none"
              aria-label="Fechar"
            >
              <X className="h-5 w-5 text-gray-500" />
            </button>
          </div>
          
          {/* Conteúdo com Scroll */}
          <div className="overflow-y-auto max-h-[calc(90vh-80px)] scrollbar-thin scrollbar-track-gray-100 scrollbar-thumb-gray-300">
          {viewingAuction && (
              <div className="p-6">
            <AuctionDetails 
              key={`auction-details-${viewingAuction.id}-${viewingVersion}`}
              auction={viewingAuction} 
            />
              </div>
          )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal Seletor de Arrematantes */}
      <Dialog open={showArrematanteSelector && !!addingArrematanteFor} onOpenChange={(open) => {
        if (!open) {
          setShowArrematanteSelector(false);
          setAddingArrematanteFor(null);
          setEditingArrematanteId(null);
        }
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold">
              Selecione o Arrematante
            </DialogTitle>
            <DialogDescription className="text-sm text-gray-600">
              Escolha qual arrematante deseja visualizar ou editar
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {addingArrematanteFor?.arrematantes?.map((arrematante, index) => {
              const lote = addingArrematanteFor.lotes?.find(l => l.id === arrematante.loteId);
              const mercadoria = lote?.mercadorias?.find(m => m.id === arrematante.mercadoriaId);
              
              return (
                <div 
                  key={arrematante.id || index}
                  onClick={() => {
                    setEditingArrematanteId(arrematante.id || null);
                    setShowArrematanteSelector(false);
                  }}
                  className="p-4 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50 hover:border-gray-300 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900">{arrematante.nome}</h3>
                      {arrematante.documento && (
                        <p className="text-sm text-gray-600 mt-1">{arrematante.documento}</p>
                      )}
                      {mercadoria && (
                        <p className="text-sm text-gray-600 mt-1">
                          <span className="font-medium">Mercadoria:</span> {mercadoria.titulo || mercadoria.descricao}
                        </p>
                      )}
                      {lote && (
                        <p className="text-sm text-gray-600">
                          <span className="font-medium">Lote:</span> {lote.numero} - {lote.descricao}
                        </p>
                      )}
                      <p className="text-sm text-gray-900 font-medium mt-2">
                        Valor: {arrematante.valorPagar?.startsWith('R$') ? arrematante.valorPagar : `R$ ${arrematante.valorPagar}`}
                      </p>
                    </div>
                    <div className="text-right">
                      {arrematante.pago ? (
                        <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
                          Pago
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-amber-700 border-amber-700">
                          Pendente
                        </Badge>
                      )}
                      {arrematante.quantidadeParcelas && arrematante.parcelasPagas !== undefined && (
                        <p className="text-xs text-gray-500 mt-1">
                          {arrematante.parcelasPagas}/{arrematante.quantidadeParcelas} parcelas
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button 
              variant="outline" 
              onClick={() => {
                setShowArrematanteSelector(false);
                setAddingArrematanteFor(null);
              }}
              className="hover:bg-gray-100 hover:text-gray-900 transition-colors"
            >
              Cancelar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Wizard de Arrematante */}
      {addingArrematanteFor && !showArrematanteSelector && (() => {
        // ✅ Se houver exatamente 1 arrematante e não estiver editando um específico, carregar automaticamente
        const arrematanteAutoLoad = (!editingArrematanteId || editingArrematanteId === null) && 
                                    addingArrematanteFor.arrematantes?.length === 1
          ? addingArrematanteFor.arrematantes[0]
          : undefined;
        
        const arrematanteParaEditar = (editingArrematanteId && editingArrematanteId !== '__SELECT__' && editingArrematanteId !== '__NEW__')
          ? addingArrematanteFor.arrematantes?.find(a => a.id === editingArrematanteId)
          : arrematanteAutoLoad;
        
        // ✅ Determinar se é novo arrematante:
        // - Se editingArrematanteId === '__NEW__' → TRUE (botão adicionar novo foi clicado)
        // - Se editingArrematanteId === null E HÁ arrematantes existentes → FALSE (vai selecionar no wizard ou auto-carregar)
        // - Se editingArrematanteId === null E NÃO há arrematantes → TRUE (novo)
        // - Se editingArrematanteId tem valor real → FALSE (editando)
        const hasArrematantes = (addingArrematanteFor.arrematantes?.length || 0) >= 1;
        const isNewArrematante = editingArrematanteId === '__NEW__' || (editingArrematanteId === null && !hasArrematantes);
        
        console.log('📝 [Leiloes.tsx] Abrindo wizard:', {
          editingArrematanteId,
          qtdArrematantes: addingArrematanteFor.arrematantes?.length,
          hasArrematantes: hasArrematantes,
          isNew: isNewArrematante,
          hasArrematante: !!arrematanteParaEditar,
          autoLoaded: !!arrematanteAutoLoad
        });
        
        return (
        <ArrematanteWizard
          initial={{
              arrematante: arrematanteParaEditar,
            lotes: addingArrematanteFor.lotes || [],
            auctionName: addingArrematanteFor.nome,
            auctionId: addingArrematanteFor.id,
            auction: addingArrematanteFor, // Passar objeto completo para validações
            defaultDiaVencimento: addingArrematanteFor.diaVencimentoPadrao,
            defaultQuantidadeParcelas: addingArrematanteFor.parcelasPadrao,
            defaultMesInicio: addingArrematanteFor.mesInicioPagamento,
          }}
            isNewArrematante={isNewArrematante}
          onDeleteArrematante={async (arrematanteId) => {
            if (!addingArrematanteFor) return;
            
            try {
              // Remover arrematante do array
              const arrematantesAtualizados = (addingArrematanteFor.arrematantes || []).filter(
                a => a.id !== arrematanteId
              );
              
              // Encontrar o lote do arrematante para atualizar status se necessário
              const arrematanteRemovido = addingArrematanteFor.arrematantes?.find(a => a.id === arrematanteId);
              const loteId = arrematanteRemovido?.loteId;
              
              // Verificar se ainda há outros arrematantes para este lote
              const outrosArrematantesDoLote = arrematantesAtualizados.filter(a => a.loteId === loteId);
              
              // Atualizar status do lote para disponível se não houver mais arrematantes
              const lotesAtualizados = (addingArrematanteFor.lotes || []).map(lote => 
                lote.id === loteId && outrosArrematantesDoLote.length === 0
                  ? { ...lote, status: 'disponivel' as const }
                  : lote
              );
              
              await updateAuction({
                id: addingArrematanteFor.id,
                data: {
                  arrematantes: arrematantesAtualizados,
                  lotes: lotesAtualizados,
                },
              });
              
              // ✅ ATUALIZAR STATUS DO LOTE DE CONVIDADO (se aplicável)
              if (loteId && outrosArrematantesDoLote.length === 0) {
                const lote = addingArrematanteFor.lotes?.find(l => l.id === loteId);
                if (lote && lote.guestLotId) {
                  try {
                    const { error: guestLotError } = await supabase
                      .from('guest_lots')
                      .update({ status: 'disponivel' })
                      .eq('id', lote.guestLotId);
                    
                    if (guestLotError) {
                      console.error('Erro ao atualizar status do lote de convidado:', guestLotError);
                    } else {
                      console.log('✅ Status do lote de convidado atualizado para "disponível"');
                      await queryClient.invalidateQueries({ queryKey: ['guest-lots'] });
                    }
                  } catch (error) {
                    console.error('Erro ao atualizar lote de convidado:', error);
                  }
                }
              }
              
              await queryClient.invalidateQueries({ queryKey: ['auctions'] });
              
              await logBidderAction(
                'delete',
                arrematanteRemovido?.nome || '',
                addingArrematanteFor.nome,
                addingArrematanteFor.id,
                {
                  metadata: {
                    lote_id: loteId
                  }
                }
              );
              
              toast({
                title: "Arrematante excluído",
                description: `${arrematanteRemovido?.nome || 'Arrematante'} foi excluído com sucesso.`,
              });
            } catch (error) {
              console.error('Erro ao excluir arrematante:', error);
              toast({
                title: "Erro ao excluir",
                description: "Não foi possível excluir o arrematante.",
                variant: "destructive",
              });
            }
          }}
          onSubmit={async (data) => {
            if (!addingArrematanteFor) return;
            
            try {
              setIsSavingArrematante(true);
              
              // ✅ Garantir que __NEW__ não seja usado como ID real
              const realEditingId = (editingArrematanteId === '__NEW__' || editingArrematanteId === null) 
                ? undefined 
                : editingArrematanteId;
              
              const arrematanteData: ArrematanteInfo = {
                ...data,
                id: data.id || realEditingId || undefined,
                nome: data.nome || "",
                valorPagar: data.valorPagar || "",
                valorPagarNumerico: parseCurrencyToNumber(data.valorPagar || ""),
                diaVencimentoMensal: data.diaVencimentoMensal || 15,
                quantidadeParcelas: data.quantidadeParcelas || 1,
                mesInicioPagamento: data.mesInicioPagamento || "",
              };
              
              // Obter arrematantes existentes
              const arrematantesExistentes = addingArrematanteFor.arrematantes || [];
              
              // Se está editando (tem ID no data), atualizar; senão, adicionar novo
              const isEditing = !!(data.id || realEditingId);
              const editId = data.id || realEditingId;
              
              // 🔄 Detectar se o lote foi alterado durante edição
              let loteAntigoId: string | undefined;
              if (isEditing) {
                const arrematanteAntigo = arrematantesExistentes.find(a => a.id === editId);
                loteAntigoId = arrematanteAntigo?.loteId;
              }
              
              const arrematantesAtualizados = isEditing
                ? arrematantesExistentes.map(a => 
                    a.id === editId
                      ? arrematanteData
                      : a
                  )
                : [...arrematantesExistentes, arrematanteData];
              
              // 🔄 Atualizar status dos lotes
              const lotesAtualizados = (addingArrematanteFor.lotes || []).map(lote => {
                // Novo lote selecionado → marcar como arrematado
                if (lote.id === data.loteId) {
                  return { ...lote, status: 'arrematado' as const };
                }
                
                // Se o lote foi alterado durante edição, verificar se o lote antigo ainda tem arrematantes
                if (isEditing && loteAntigoId && lote.id === loteAntigoId && loteAntigoId !== data.loteId) {
                  // Verificar se ainda há outros arrematantes para o lote antigo
                  const outrosArrematantesDoLoteAntigo = arrematantesAtualizados.filter(a => a.loteId === loteAntigoId);
                  if (outrosArrematantesDoLoteAntigo.length === 0) {
                    return { ...lote, status: 'disponivel' as const };
                  }
                }
                
                return lote;
              });
              
              await updateAuction({
                id: addingArrematanteFor.id,
                data: {
                  arrematantes: arrematantesAtualizados,
                  lotes: lotesAtualizados,
                },
              });
              
              // ✅ ATUALIZAR STATUS DO LOTE DE CONVIDADO ANTIGO (se o lote foi alterado)
              if (isEditing && loteAntigoId && loteAntigoId !== data.loteId) {
                const loteAntigo = (addingArrematanteFor.lotes || []).find(l => l.id === loteAntigoId);
                console.log('🔍 [Leiloes.tsx] Verificando lote antigo:', { loteAntigoId, loteAntigo, guestLotId: loteAntigo?.guestLotId });
                
                // Verificar se ainda há outros arrematantes para o lote antigo
                const outrosArrematantesDoLoteAntigo = arrematantesAtualizados.filter(a => a.loteId === loteAntigoId);
                
                if (outrosArrematantesDoLoteAntigo.length === 0) {
                  if (loteAntigo && loteAntigo.guestLotId) {
                    try {
                      const { error: guestLotError } = await supabase
                        .from('guest_lots')
                        .update({ status: 'disponivel' })
                        .eq('id', loteAntigo.guestLotId);
                      
                      if (guestLotError) {
                        console.error('Erro ao atualizar status do lote de convidado antigo:', guestLotError);
                      } else {
                        console.log('✅ Status do lote de convidado antigo atualizado para "disponível"');
                      }
                    } catch (error) {
                      console.error('Erro ao atualizar lote de convidado antigo:', error);
                    }
                  } else if (loteAntigo && loteAntigo.isConvidado && !loteAntigo.guestLotId) {
                    // 🔧 Lote antigo é convidado mas sem guestLotId - tentar encontrar pelo número
                    console.log('🔧 [Leiloes.tsx] Lote antigo é convidado mas sem guestLotId, buscando pelo número...');
                    const { data: guestLots } = await supabase
                      .from('guest_lots')
                      .select('id')
                      .eq('leilao_id', addingArrematanteFor.id)
                      .eq('numero', loteAntigo.numero)
                      .limit(1);
                    
                    if (guestLots && guestLots.length > 0) {
                      const guestLotId = guestLots[0].id;
                      console.log('✅ [Leiloes.tsx] Lote de convidado antigo encontrado pelo número:', guestLotId);
                      
                      const { error: guestLotError } = await supabase
                        .from('guest_lots')
                        .update({ status: 'disponivel' })
                        .eq('id', guestLotId);
                      
                      if (!guestLotError) {
                        console.log('✅ Status do lote de convidado antigo atualizado para "disponível" (via número)');
                      }
                    }
                  }
                }
              }
              
              // ✅ ATUALIZAR STATUS DO NOVO LOTE DE CONVIDADO (se aplicável)
              const loteArrematado = (addingArrematanteFor.lotes || []).find(l => l.id === data.loteId);
              console.log('🔍 [Leiloes.tsx] Verificando novo lote:', { 
                loteId: data.loteId, 
                loteArrematado, 
                guestLotId: loteArrematado?.guestLotId,
                todosOsLotes: addingArrematanteFor.lotes?.map(l => ({ id: l.id, numero: l.numero, guestLotId: l.guestLotId }))
              });
              
              if (loteArrematado && loteArrematado.guestLotId) {
                try {
                  const { error: guestLotError } = await supabase
                    .from('guest_lots')
                    .update({ status: 'arrematado' })
                    .eq('id', loteArrematado.guestLotId);
                  
                  if (guestLotError) {
                    console.error('Erro ao atualizar status do lote de convidado:', guestLotError);
                  } else {
                    console.log('✅ Status do lote de convidado atualizado para "arrematado"');
                    // Invalidar cache dos lotes de convidados
                    await queryClient.invalidateQueries({ queryKey: ['guest-lots'] });
                  }
                } catch (error) {
                  console.error('Erro ao atualizar lote de convidado:', error);
                }
              } else if (loteArrematado && !loteArrematado.guestLotId) {
                // 🔍 Se não temos guestLotId no objeto, tentar buscar diretamente do banco
                console.log('⚠️ [Leiloes.tsx] guestLotId não encontrado no objeto do lote, buscando no banco...');
                try {
                  // Buscar o lote no banco para verificar se tem guestLotId
                  const { data: auctionData, error: fetchError } = await supabase
                    .from('auctions')
                    .select('lotes')
                    .eq('id', addingArrematanteFor.id)
                    .single();
                  
                  if (!fetchError && auctionData && auctionData.lotes) {
                    const loteNoBanco = (auctionData.lotes as unknown as LoteInfo[]).find(l => l.id === data.loteId);
                    console.log('🔍 [Leiloes.tsx] Lote encontrado no banco:', { 
                      loteNoBanco, 
                      id: loteNoBanco?.id, 
                      numero: loteNoBanco?.numero,
                      guestLotId: loteNoBanco?.guestLotId,
                      hasGuestLotId: !!loteNoBanco?.guestLotId,
                      isConvidado: loteNoBanco?.isConvidado
                    });
                    
                    if (loteNoBanco && loteNoBanco.guestLotId) {
                      console.log('🚀 [Leiloes.tsx] Atualizando guest_lots com ID:', loteNoBanco.guestLotId);
                      const { error: guestLotError } = await supabase
                        .from('guest_lots')
                        .update({ status: 'arrematado' })
                        .eq('id', loteNoBanco.guestLotId);
                      
                      if (guestLotError) {
                        console.error('❌ Erro ao atualizar status do lote de convidado:', guestLotError);
                      } else {
                        console.log('✅ Status do lote de convidado atualizado para "arrematado" (via banco)');
                        await queryClient.invalidateQueries({ queryKey: ['guest-lots'] });
                      }
                    } else if (loteNoBanco && loteNoBanco.isConvidado) {
                      // 🔧 Lote marcado como convidado mas sem guestLotId - tentar encontrar pelo número
                      console.log('🔧 [Leiloes.tsx] Lote é convidado mas sem guestLotId, buscando pelo número...');
                      const { data: guestLots } = await supabase
                        .from('guest_lots')
                        .select('id')
                        .eq('leilao_id', addingArrematanteFor.id)
                        .eq('numero', loteNoBanco.numero)
                        .limit(1);
                      
                      if (guestLots && guestLots.length > 0) {
                        const guestLotId = guestLots[0].id;
                        console.log('✅ [Leiloes.tsx] Lote de convidado encontrado pelo número:', guestLotId);
                        
                        // Atualizar o status do lote de convidado
                        const { error: guestLotError } = await supabase
                          .from('guest_lots')
                          .update({ status: 'arrematado' })
                          .eq('id', guestLotId);
                        
                        if (!guestLotError) {
                          console.log('✅ Status do lote de convidado atualizado para "arrematado" (via número)');
                          
                          // 🔧 IMPORTANTE: Atualizar o array de lotes para incluir o guestLotId
                          const lotesAtualizadosComId = (auctionData.lotes as unknown as LoteInfo[]).map(l =>
                            l.id === data.loteId ? { ...l, guestLotId } : l
                          );
                          
                          await supabase
                            .from('auctions')
                            .update({ lotes: JSON.parse(JSON.stringify(lotesAtualizadosComId)) })
                            .eq('id', addingArrematanteFor.id);
                          
                          console.log('✅ guestLotId adicionado ao array de lotes');
                          await queryClient.invalidateQueries({ queryKey: ['guest-lots'] });
                          await queryClient.invalidateQueries({ queryKey: ['auctions'] });
                        }
                      } else {
                        console.warn('⚠️ [Leiloes.tsx] Nenhum lote de convidado encontrado com este número');
                      }
                    } else {
                      console.warn('⚠️ [Leiloes.tsx] Lote não é um lote de convidado ou guestLotId não encontrado no banco');
                    }
                  } else {
                    console.error('❌ [Leiloes.tsx] Erro ao buscar lote no banco:', fetchError);
                  }
                } catch (error) {
                  console.error('Erro ao buscar lote no banco:', error);
                }
              }
              
              // ✅ PASSO 1: Fechar o wizard ANTES de invalidar cache
              wizardClosedIntentionally.current = true;
              setAddingArrematanteFor(null);
              setEditingArrematanteId(null);
              setShowArrematanteSelector(false);
              
              // ✅ PASSO 2: Aguardar o wizard desmontar completamente
              await new Promise(resolve => setTimeout(resolve, 300));
              
              // ✅ PASSO 3: Invalidar cache para forçar atualização
              await queryClient.invalidateQueries({ queryKey: ['auctions'] });
              
              // ✅ PASSO 4: Resetar a flag após um tempo (5s para garantir)
              setTimeout(() => {
                wizardClosedIntentionally.current = false;
              }, 5000);
              
              await logBidderAction(
                isEditing ? 'update' : 'create', 
                data.nome || '', 
                addingArrematanteFor.nome, 
                addingArrematanteFor.id,
                {
                  metadata: {
                    lote_id: data.loteId,
                    valor_total: arrematanteData.valorPagarNumerico,
                    parcelas: data.quantidadeParcelas,
                    mes_inicio: data.mesInicioPagamento,
                    dia_vencimento: data.diaVencimentoMensal,
                    percentual_juros: data.percentualJurosAtraso,
                    tipo_juros: data.tipoJurosAtraso,
                    has_documents: (data.documentos?.length || 0) > 0
                  }
                }
              );
            } catch (error) {
              console.error('Erro ao salvar arrematante:', error);
              
              // ✅ Tratamento de erros
              const errorObj = error as { code?: string; message?: string };
              if (errorObj?.message) {
                alert(`❌ Erro ao salvar arrematante: ${errorObj.message}`);
              } else {
                alert('❌ Erro ao salvar arrematante. Por favor, tente novamente.');
              }
              
              // Não propagar o erro para não fechar o modal
              // throw error; 
            } finally {
              setIsSavingArrematante(false);
            }
          }}
          onCancel={() => {
            wizardClosedIntentionally.current = true;
            setAddingArrematanteFor(null);
            setEditingArrematanteId(null);
            setShowArrematanteSelector(false);
            setTimeout(() => {
              wizardClosedIntentionally.current = false;
            }, 5000);
          }}
        />
        );
      })()}

      {/* Nota: O formulário de arrematante agora usa o ArrematanteWizard (renderizado acima) */}

      {/* Modal de Pagamento Mensal - REMOVIDO DIALOG ANTIGO */}
      <Dialog open={false}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold">
              {editingArrematanteId ? "Editar Arrematante" : "Adicionar Arrematante"}
            </DialogTitle>
            <DialogDescription className="text-sm text-gray-600">
              <span className="font-medium">{addingArrematanteFor?.nome}</span>
            </DialogDescription>
          </DialogHeader>
          
          {arrematanteMode === 'view' ? (
            /* Modo de Visualização */
            <div className="space-y-4">
              <div className="grid gap-4">
                {/* Nome e Documento - Layout em 2 colunas */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium text-gray-700">Nome do Arrematante</Label>
                  <p className="mt-1 p-3 bg-gray-50 border border-gray-200 rounded-md text-sm">
                    {arrematanteForm.nome}
                  </p>
                  </div>

                  <div>
                     <Label className="text-sm font-medium text-gray-700">
                       Documento ({arrematanteForm.documento ? 
                         detectDocumentType(arrematanteForm.documento) : 
                         'CPF/CNPJ'})
                     </Label>
                     <p className="mt-1 p-3 bg-gray-50 border border-gray-200 rounded-md text-sm">
                       {arrematanteForm.documento || "Não informado"}
                     </p>
                  </div>
                </div>

                {/* Lote e Endereço - Layout em 2 colunas */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium text-gray-700">Lote Arrematado</Label>
                    <p className="mt-1 p-3 bg-gray-50 border border-gray-200 rounded-md text-sm">
                      {arrematanteForm.loteId ? (() => {
                        const lote = (addingArrematanteFor?.lotes || []).find(l => l.id === arrematanteForm.loteId);
                        return lote ? `Lote ${lote.numero} - ${lote.descricao}` : "Lote não encontrado";
                      })() : "Não informado"}
                    </p>
                  </div>

                  <div>
                    <Label className="text-sm font-medium text-gray-700">Endereço Completo</Label>
                    <p className="mt-1 p-3 bg-gray-50 border border-gray-200 rounded-md text-sm">
                      {arrematanteForm.endereco || "Não informado"}
                    </p>
                  </div>
                </div>

                {/* Email e Telefone - Layout em 2 colunas */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium text-gray-700">Email</Label>
                    <p className="mt-1 p-3 bg-gray-50 border border-gray-200 rounded-md text-sm">
                      {arrematanteForm.email || "Não informado"}
                    </p>
                  </div>

                  <div>
                    <Label className="text-sm font-medium text-gray-700">Telefone</Label>
                    <p className="mt-1 p-3 bg-gray-50 border border-gray-200 rounded-md text-sm">
                      {arrematanteForm.telefone || "Não informado"}
                    </p>
                  </div>
                </div>

                <div>
                  <Label className="text-sm font-medium text-gray-700">Valor a Ser Pago</Label>
                  <p className="mt-1 p-3 bg-gray-50 border border-gray-200 rounded-md text-sm font-medium">
                    {arrematanteForm.valorPagar ? (
                      typeof arrematanteForm.valorPagar === 'string'
                        ? (arrematanteForm.valorPagar.startsWith('R$') ? arrematanteForm.valorPagar : `R$ ${arrematanteForm.valorPagar}`)
                        : `R$ ${arrematanteForm.valorPagar}`
                    ) : "R$ 0,00"}
                  </p>
                </div>

{/* Configuração de Pagamento baseada no tipo do lote selecionado */}
                {(() => {
                  const currentAuction = addingArrematanteFor;
                  const loteId = arrematanteForm.loteId;
                  const loteSelecionado = currentAuction?.lotes?.find(lote => lote.id === loteId);
                  const tipoPagamento = loteSelecionado?.tipoPagamento || "parcelamento";

                  if (tipoPagamento === "a_vista") {
                    return (
                <div>
                        <Label className="text-sm font-medium text-gray-700">Configuração de Pagamento</Label>
                  <div className="mt-1 p-3 bg-gray-50 border border-gray-200 rounded-md text-sm space-y-2">
                          <div className="flex items-center gap-2 mb-2">
                            <DollarSign className="h-4 w-4 text-gray-600" />
                            <span className="font-medium text-gray-800">Pagamento À Vista</span>
                  </div>
                          <p><strong>Data de vencimento:</strong> {' '}
                            {loteSelecionado?.dataVencimentoVista ? 
                              new Date(loteSelecionado.dataVencimentoVista + 'T00:00:00').toLocaleDateString('pt-BR')
                              : 'Não definida'}
                          </p>
                          <p><strong>Percentual de Juros por Atraso:</strong> {arrematanteForm.percentualJurosAtraso || 0}% ao mês</p>
                          <p><strong>Status:</strong> {arrematanteForm.pago ? 'Pago' : 'Pendente'}</p>
                </div>
                      </div>
                    );
                  } else if (tipoPagamento === "entrada_parcelamento") {
                    return (
                <div>
                        <Label className="text-sm font-medium text-gray-700">Configuração de Pagamento</Label>
                        <div className="mt-1 space-y-3">
                          {/* Data de Pagamento Entrada */}
                          <div className="p-3 bg-gray-50 border border-gray-200 rounded-md text-sm">
                            <div className="flex items-center gap-2 mb-2">
                              <CreditCard className="h-4 w-4 text-gray-600" />
                              <span className="font-medium text-gray-800">Entrada</span>
                      </div>
                            <div className="space-y-1">
                              <p><strong>Data de vencimento:</strong> {' '}
                                {(loteSelecionado?.dataEntrada || currentAuction?.dataEntrada) ? 
                                  new Date((loteSelecionado?.dataEntrada || currentAuction?.dataEntrada) + 'T00:00:00').toLocaleDateString('pt-BR')
                                  : 'Não definida'}
                              </p>
                              <p><strong>Valor da entrada:</strong> {' '}
                                {arrematanteForm.valorEntrada ? 
                                  `R$ ${parseCurrencyToNumber(arrematanteForm.valorEntrada).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                  : 'Não definido'}
                              </p>
                     </div>
                          </div>
                          
                          {/* Parcelas */}
                          <div className="p-3 bg-gray-50 border border-gray-200 rounded-md text-sm space-y-2">
                            <h4 className="font-medium text-gray-800">Parcelas (após entrada)</h4>
                            <p><strong>Dia do vencimento:</strong> Todo dia {arrematanteForm.diaVencimentoMensal}</p>
                            <p><strong>Total de parcelas:</strong> {arrematanteForm.quantidadeParcelas}</p>
                            <p><strong>Parcelas pagas:</strong> {arrematanteForm.parcelasPagas} de {arrematanteForm.quantidadeParcelas}</p>
                            <p><strong>Valor por parcela:</strong> R$ {(() => {
                              const valorTotal = parseCurrencyToNumber(arrematanteForm.valorPagar);
                              const valorEntrada = arrematanteForm.valorEntrada ? parseCurrencyToNumber(arrematanteForm.valorEntrada) : 0;
                              const valorParcelas = valorTotal - valorEntrada;
                              const valorPorParcela = valorParcelas / (arrematanteForm.quantidadeParcelas || 1);
                              return valorPorParcela.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                            })()}</p>
                            <p><strong>Percentual de Juros por Atraso:</strong> {arrematanteForm.percentualJurosAtraso || 0}% ao mês</p>
                      </div>
                  </div>
                </div>
                    );
                  } else {
                    // Parcelamento padrão
                    return (
                <div>
                  <Label className="text-sm font-medium text-gray-700">Configuração de Parcelas</Label>
                  <div className="mt-1 p-3 bg-gray-50 border border-gray-200 rounded-md text-sm space-y-2">
                    <p><strong>Dia do vencimento:</strong> Todo dia {arrematanteForm.diaVencimentoMensal}</p>
                    <p><strong>Total de parcelas:</strong> {arrematanteForm.quantidadeParcelas}</p>
                    <p><strong>Parcelas pagas:</strong> {arrematanteForm.parcelasPagas} de {arrematanteForm.quantidadeParcelas}</p>
                    <p><strong>Valor por parcela:</strong> R$ {arrematanteForm.valorPagar && arrematanteForm.quantidadeParcelas ? 
                      (parseCurrencyToNumber(arrematanteForm.valorPagar) / arrematanteForm.quantidadeParcelas).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                      : '0,00'}</p>
                    <p><strong>Percentual de Juros por Atraso:</strong> {arrematanteForm.percentualJurosAtraso || 0}% ao mês</p>
                  </div>
                </div>
                    );
                  }
                })()}


                {arrematanteForm.documentos.length > 0 && (
                <div>
                    <Label className="text-sm font-medium text-gray-700">Documentos Anexados</Label>
                    <div className="mt-1 p-3 bg-gray-50 border border-gray-200 rounded-md">
                      <div className="space-y-2">
                        {arrematanteForm.documentos.map((doc) => (
                          <div key={doc.id} className="flex items-center justify-between p-3 bg-white border border-gray-200 rounded-md">
                            <div className="flex items-center gap-3">
                            {getFileIcon(doc.tipo)}
                              <div>
                                <p className="text-sm font-medium text-gray-900">{doc.nome}</p>
                              <p className="text-xs text-gray-500">
                                {formatFileSize(doc.tamanho)}{formatUploadDate(doc.dataUpload) && ` • ${formatUploadDate(doc.dataUpload)}`}
                              </p>
                              </div>
                            </div>
                            {doc.url && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  if (doc.url) {
                                    // Se é documento com base64, abrir em nova aba com viewer
                                    if (doc.url.startsWith('data:')) {
                                      const newWindow = window.open();
                                      if (newWindow) {
                                        newWindow.document.write(`
                                          <html>
                                            <head><title>${doc.nome}</title></head>
                                            <body style="margin:0; display:flex; justify-content:center; align-items:center; min-height:100vh; background:#f0f0f0;">
                                              ${doc.url.includes('pdf') ? 
                                                `<embed src="${doc.url}" width="100%" height="100%" type="application/pdf" />` :
                                                `<img src="${doc.url}" style="max-width:100%; max-height:100%; object-fit:contain;" alt="${doc.nome}" />`
                                              }
                                            </body>
                                          </html>
                                        `);
                                      }
                                    } else {
                                      // Para outros tipos, tentar abrir ou baixar
                                      window.open(doc.url, '_blank');
                                    }
                                  }
                                }}
                                className="h-8 w-8 p-0 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                                title="Visualizar arquivo"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                  </div>
                </div>
                )}
              </div>

               <div className="flex justify-end pt-4 border-t border-gray-200">
                <Button
                  type="button"
                  onClick={() => setArrematanteMode('edit')}
                   className="h-11 px-6 bg-black hover:bg-gray-800 text-white font-medium"
                >
                  Editar Informações
                </Button>
              </div>
            </div>
          ) : (
            /* Modo de Edição */
            <div className="space-y-4">
              <style>{`
                .arrematante-form input:focus {
                  border-color: #111827 !important;
                  box-shadow: none !important;
                  outline: none !important;
                }
                .arrematante-form [data-radix-select-trigger]:focus {
                  border-color: #d1d5db !important;
                  box-shadow: none !important;
                  outline: none !important;
                }
                .arrematante-form *:focus {
                  box-shadow: none !important;
                }
              `}</style>
              {/* Linha 1: Nome e Documento (CPF/CNPJ) - Layout em 2 colunas */}
              <div className="arrematante-form grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                  <div className="flex items-center h-8">
                <Label htmlFor="nomeArrematante" className="text-sm font-medium text-gray-700">
                  Nome do Arrematante
                </Label>
                  </div>
                <Input
                  id="nomeArrematante"
                  value={arrematanteForm.nome}
                  onChange={(e) => handleArrematanteFormChange("nome", e.target.value)}
                  placeholder="Digite o nome completo"
                    className="h-10 border-gray-300 focus:!border-gray-900 focus:!ring-0 focus:!outline-none bg-white"
                  required
                />
              </div>

                  <div className="space-y-2">
                   <div className="flex items-center gap-4 h-8">
                     <Label className="text-sm font-medium text-gray-700">Documento:</Label>
                     <div className="flex items-center gap-3">
                       <button
                         type="button"
                         onClick={() => {
                           setDocumentType('CPF');
                           // Limpar o campo quando mudar o tipo
                           handleArrematanteFormChange("documento", "");
                         }}
                         className={`text-sm font-medium transition-all ${
                           documentType === 'CPF' 
                             ? 'text-gray-900 border-b-2 border-gray-900 pb-1' 
                             : 'text-gray-500 hover:text-gray-700 pb-1'
                         }`}
                       >
                         CPF
                       </button>
                       <span className="text-gray-400">|</span>
                       <button
                         type="button"
                         onClick={() => {
                           setDocumentType('CNPJ');
                           // Limpar o campo quando mudar o tipo
                           handleArrematanteFormChange("documento", "");
                         }}
                         className={`text-sm font-medium transition-all ${
                           documentType === 'CNPJ' 
                             ? 'text-gray-900 border-b-2 border-gray-900 pb-1' 
                             : 'text-gray-500 hover:text-gray-700 pb-1'
                         }`}
                       >
                         CNPJ
                       </button>
                     </div>
                   </div>
                   <Input
                     id="documentoArrematante"
                     value={arrematanteForm.documento}
                     onChange={(e) => {
                       const inputValue = e.target.value;
                       
                       // Detectar automaticamente o tipo
                       let typeToUse = documentType;
                       
                       // Se foi um paste (mais de 1 caractere adicionado) ou se tem formatação típica
                       if (inputValue.length > arrematanteForm.documento.length + 1 || 
                           inputValue.includes('/') || 
                           (inputValue.includes('-') && inputValue.includes('.')) ||
                           inputValue.replace(/[^\d]/g, '').length >= 11) {
                         const detectedType = detectDocumentType(inputValue);
                         if (detectedType !== documentType) {
                           setDocumentType(detectedType);
                           typeToUse = detectedType;
                         }
                       }
                       
                       // Formatar baseado no tipo correto (detectado ou atual)
                       const formatted = typeToUse === 'CPF' ? formatCPF(inputValue) : formatCNPJ(inputValue);
                       handleArrematanteFormChange("documento", formatted);
                     }}
                     placeholder={documentType === 'CPF' ? '000.000.000-00' : '00.000.000/0000-00'}
                     className="h-10 border-gray-300 focus:!border-gray-900 focus:!ring-0 focus:!outline-none bg-white"
                   />
                  </div>
              </div>

              {/* Linha 2: Lote e Endereço - Layout em 2 colunas */}
              <div className="arrematante-form grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="loteArrematante" className="text-sm font-medium text-gray-700">
                    Lote Arrematado
                  </Label>
                  <Select value={arrematanteForm.loteId || ""} onValueChange={(value) => handleArrematanteFormChange("loteId", value)}>
                    <SelectTrigger className="h-10 border-gray-300 focus:!ring-0 focus:!outline-none focus:!shadow-none bg-white">
                      <SelectValue placeholder="Selecione o lote" />
                    </SelectTrigger>
                    <SelectContent>
                      {(addingArrematanteFor?.lotes || []).map((lote) => (
                        <SelectItem key={lote.id} value={lote.id}>
                          Lote {lote.numero} - {lote.descricao}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="enderecoArrematante" className="text-sm font-medium text-gray-700">
                    Endereço Completo
                  </Label>
                  <Input
                    id="enderecoArrematante"
                    value={arrematanteForm.endereco}
                    onChange={(e) => handleArrematanteFormChange("endereco", e.target.value)}
                    placeholder="Rua, número, bairro, cidade, CEP"
                    className="h-10 border-gray-300 focus:!border-gray-900 focus:!ring-0 focus:!outline-none bg-white"
                  />
                </div>
              </div>

              {/* Linha 3: Email e Telefone - Layout em 2 colunas */}
              <div className="arrematante-form grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="emailArrematante" className="text-sm font-medium text-gray-700">
                    Email (Opcional)
                  </Label>
                  <Input
                    id="emailArrematante"
                    type="email"
                    value={arrematanteForm.email}
                    onChange={(e) => handleArrematanteFormChange("email", e.target.value)}
                    placeholder="email@exemplo.com"
                    className="h-10 border-gray-300 focus:!border-gray-900 focus:!ring-0 focus:!outline-none bg-white"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="telefoneArrematante" className="text-sm font-medium text-gray-700">
                    Telefone (Opcional)
                  </Label>
                  <Input
                    id="telefoneArrematante"
                    type="tel"
                    value={arrematanteForm.telefone}
                    onChange={(e) => {
                      const formatted = formatPhoneNumber(e.target.value);
                      handleArrematanteFormChange("telefone", formatted);
                    }}
                    placeholder="+55 (11) 99999-9999"
                    className="h-10 border-gray-300 focus:!border-gray-900 focus:!ring-0 focus:!outline-none bg-white"
                  />
                </div>
              </div>

              {/* Linha 4: Valor a Ser Pago e Status do Pagamento - Layout em 2 colunas */}
              <div className="arrematante-form grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="valorPagar" className="text-sm font-medium text-gray-700">
                  Valor a Ser Pago
                </Label>
                <div className="relative">
                    <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-xs font-medium text-gray-500">
                    R$
                  </span>
                  <Input
                    id="valorPagar"
                    type="text"
                    value={arrematanteForm.valorPagar}
                    onChange={(e) => {
                      const value = e.target.value;
                      // Permitir apenas números, pontos e vírgulas
                      if (/^[\d.,]*$/.test(value)) {
                        handleArrematanteFormChange("valorPagar", value);
                      }
                    }}
                    placeholder="0,00"
                      className="h-10 pl-10 border-gray-300 focus:!border-gray-900 focus:!ring-0 focus:!outline-none bg-white text-sm"
                  />
                </div>
              </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium text-gray-700">Status do Pagamento</Label>
                  <Select 
                    value={(() => {
                      if (arrematanteForm.pago) return "pago";
                      
                      // Verificar se está atrasado baseado no tipo de pagamento do lote
                      const loteId = arrematanteForm.loteId;
                      const loteSelecionado = addingArrematanteFor?.lotes?.find(lote => lote.id === loteId);
                      const tipoPagamento = loteSelecionado?.tipoPagamento || "parcelamento";
                      
                      if (tipoPagamento === "a_vista" && loteSelecionado?.dataVencimentoVista) {
                        const now = new Date();
                        const dueDate = new Date(loteSelecionado.dataVencimentoVista);
                        dueDate.setHours(23, 59, 59, 999);
                        
                        if (now > dueDate) {
                          return "atrasado";
                        }
                      }
                      
                      return "pendente";
                    })()} 
                    onValueChange={(value) => handleArrematanteFormChange("pago", value === "pago")}
                  >
                    <SelectTrigger className="h-10 border-gray-300 focus:!ring-0 focus:!outline-none focus:!shadow-none bg-white text-sm">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pendente">Pendente</SelectItem>
                      <SelectItem value="atrasado">Atrasado</SelectItem>
                      <SelectItem value="pago">Pago</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Linha 5: Configurações de Parcela baseadas no tipo de pagamento do lote selecionado */}
              {(() => {
                // Buscar o tipo de pagamento do lote selecionado
                const loteId = arrematanteForm.loteId;
                const lotesSelecionado = addingArrematanteFor?.lotes?.find(lote => lote.id === loteId);
                const tipoPagamento = lotesSelecionado?.tipoPagamento || "parcelamento";
                
                // Para À Vista, não mostrar campos de parcelas
                if (tipoPagamento === "a_vista") {
                  return null;
                }
                
                // Para Entrada + Parcelamento, layout especial mais compacto
                if (tipoPagamento === "entrada_parcelamento") {
                  return (
                    <div className="arrematante-form space-y-1.5">
                      {/* Primeira linha: Data de Pagamento Entrada + Valor da Entrada + Mês de Início + Dia Vencimento */}
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                        <div className="space-y-0.5">
                          <Label className="text-sm font-medium text-gray-700">Data de Pagamento Entrada</Label>
                          <StringDatePicker
                            value={lotesSelecionado?.dataEntrada || ""}
                            onChange={(value) => {
                              if (addingArrematanteFor && loteId) {
                                // Atualizar o lote específico com a data de entrada
                                const lotesAtualizados = addingArrematanteFor.lotes?.map(lote => 
                                  lote.id === loteId ? { ...lote, dataEntrada: value } : lote
                                ) || [];
                                updateAuction({
                                  id: addingArrematanteFor.id,
                                  data: { lotes: lotesAtualizados }
                                });
                              }
                            }}
                            className="h-10"
                          />
                        </div>

                        <div className="space-y-0.5">
                          <Label htmlFor="valorEntrada" className="text-sm font-medium text-gray-700">Valor da Entrada</Label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500 text-sm">R$</span>
                            <Input
                              id="valorEntrada"
                              type="text"
                              value={arrematanteForm.valorEntrada || ""}
                              onChange={(e) => handleArrematanteFormChange("valorEntrada", e.target.value)}
                              placeholder="0,00"
                              className="h-10 pl-10 border-gray-300 focus:!border-gray-900 focus:!ring-0 focus:!outline-none bg-white text-sm"
                            />
                          </div>
                        </div>

                        <div className="space-y-0.5">
                          <Label htmlFor="mesInicioParcelas" className="text-sm font-medium text-gray-700">Mês de Início das Parcelas</Label>
                          <Select
                            value={arrematanteForm.mesInicioPagamento || lotesSelecionado?.mesInicioPagamento || ""}
                            onValueChange={(value) => handleArrematanteFormChange("mesInicioPagamento", value)}
                          >
                            <SelectTrigger className="h-10 border-gray-300 focus:!ring-0 focus:!outline-none focus:!shadow-none bg-white">
                              <SelectValue placeholder="Selecione o mês" />
                            </SelectTrigger>
                            <SelectContent>
                              {(() => {
                                const months = [];
                                const currentDate = new Date();
                                const startYear = currentDate.getFullYear() - 1; // Permitir ano anterior
                                const endYear = currentDate.getFullYear() + 2;
                                
                                for (let year = startYear; year <= endYear; year++) {
                                  for (let month = 0; month < 12; month++) {
                                    const date = new Date(year, month, 1);
                                    const value = date.toISOString().slice(0, 7);
                                    const label = date.toLocaleDateString('pt-BR', { 
                                      month: 'long', 
                                      year: 'numeric' 
                                    });
                                    months.push({ value, label });
                                  }
                                }
                                
                                return months.map(({ value, label }) => (
                                  <SelectItem key={value} value={value}>
                                    {label.charAt(0).toUpperCase() + label.slice(1)}
                                  </SelectItem>
                                ));
                              })()}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-0.5">
                          <Label htmlFor="diaVencimentoParcelas" className="text-sm font-medium text-gray-700">Dia Vencimento das Parcelas</Label>
                  <Select 
                    value={(arrematanteForm.diaVencimentoMensal || lotesSelecionado?.diaVencimentoPadrao || 15).toString()} 
                    onValueChange={(v) => handleArrematanteFormChange("diaVencimentoMensal", parseInt(v))}
                  >
                    <SelectTrigger className="h-10 border-gray-300 focus:!ring-0 focus:!outline-none focus:!shadow-none bg-white text-sm">
                      <SelectValue placeholder="Dia" />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                        <SelectItem key={day} value={day.toString()}>
                          Dia {day}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                        </div>
                </div>

                      {/* Segunda linha: Qtd Parcelas + Parcelas Pagas + Valor por Parcela */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                        <div className="space-y-0.5">
                          <Label htmlFor="quantidadeParcelasEntrada" className="text-sm font-medium text-gray-700">Qtd. Parcelas (após entrada)</Label>
                  <Input
                            id="quantidadeParcelasEntrada"
                    type="number"
                    min="1"
                    max="60"
                    value={arrematanteForm.quantidadeParcelas || lotesSelecionado?.parcelasPadrao || ""}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === "") {
                        handleArrematanteFormChange("quantidadeParcelas", "");
                      } else {
                        const numValue = parseInt(value);
                        if (!isNaN(numValue) && numValue >= 1 && numValue <= 60) {
                          handleArrematanteFormChange("quantidadeParcelas", numValue);
                        }
                      }
                    }}
                    className="h-10 border-gray-300 focus:!border-gray-900 focus:!ring-0 focus:!outline-none bg-white text-sm"
                    required
                  />
                </div>

                        <div className="space-y-0.5">
                          <Label htmlFor="parcelasPagasEntrada" className="text-sm font-medium text-gray-700">Parcelas Pagas</Label>
                  <Input
                            id="parcelasPagasEntrada"
                    type="number"
                    min="0"
                    max={arrematanteForm.quantidadeParcelas || 60}
                    value={arrematanteForm.parcelasPagas === null || arrematanteForm.parcelasPagas === undefined ? '' : arrematanteForm.parcelasPagas}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === "") {
                        handleArrematanteFormChange("parcelasPagas", null);
                      } else {
                        const numValue = parseInt(value);
                        if (!isNaN(numValue) && numValue >= 0) {
                          const maxParcelas = typeof arrematanteForm.quantidadeParcelas === 'number' ? arrematanteForm.quantidadeParcelas : 60;
                          const valorLimitado = Math.min(numValue, maxParcelas);
                          handleArrematanteFormChange("parcelasPagas", valorLimitado);
                          handleArrematanteFormChange("pago", valorLimitado >= maxParcelas);
                        }
                      }
                    }}
                    onBlur={(e) => {
                      if (e.target.value === '' || arrematanteForm.parcelasPagas === null || arrematanteForm.parcelasPagas === undefined) {
                        handleArrematanteFormChange("parcelasPagas", 0);
                      }
                    }}
                    placeholder="0"
                    className="h-10 border-gray-300 focus:!border-gray-900 focus:!ring-0 focus:!outline-none bg-white text-sm"
                  />
                </div>

                        <div className="space-y-0.5">
                          <Label className="text-sm font-medium text-gray-700">Valor por Parcela (após entrada)</Label>
                          <div className="flex h-10 w-full items-center justify-between rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-sm">
                            <span className="font-medium">
                              R$ {arrematanteForm.valorPagar ? (() => {
                                const valorTotal = parseCurrencyToNumber(arrematanteForm.valorPagar);
                                const valorEntrada = arrematanteForm.valorEntrada ? parseCurrencyToNumber(arrematanteForm.valorEntrada) : 0;
                                const valorParcelas = valorTotal - valorEntrada;
                                const valorPorParcela = valorParcelas / (arrematanteForm.quantidadeParcelas || 1);
                                return valorPorParcela.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                              })() : '0,00'}
                            </span>
              </div>
                        </div>
                      </div>

                      {/* Terceira linha: Campo de Juros por Atraso */}
                      <div className="grid grid-cols-1 gap-2">
                        <div className="space-y-0.5">
                          <Label htmlFor="percentualJurosAtrasoEntrada" className="text-sm font-medium text-gray-700">
                            Percentual de Juros por Atraso (% ao mês) - Juros Compostos
                          </Label>
                          <Input
                            id="percentualJurosAtrasoEntrada"
                            type="number"
                            min="0"
                            max="100"
                            step="0.1"
                            value={arrematanteForm.percentualJurosAtraso || ""}
                            onChange={(e) => {
                              const value = e.target.value;
                              if (value === "") {
                                handleArrematanteFormChange("percentualJurosAtraso", 0);
                              } else {
                                const numValue = parseFloat(value);
                                if (!isNaN(numValue) && numValue >= 0 && numValue <= 100) {
                                  handleArrematanteFormChange("percentualJurosAtraso", numValue);
                                }
                              }
                            }}
                            placeholder="0.0"
                            className="h-10 border-gray-300 focus:!border-gray-900 focus:!ring-0 focus:!outline-none bg-white text-sm"
                          />
                        </div>
                      </div>
                    </div>
                  );
                }

                // Para Parcelamento padrão - layout com duas linhas
                return (
                  <div className="arrematante-form space-y-4">
                    {/* Primeira linha: Mês de Início, Dia Vencimento, Qtd. Parcelas, Parcelas Pagas */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="mesInicioPagamentoParcelamento" className="text-sm font-medium text-gray-700">Mês de Início</Label>
                        <Select
                          value={arrematanteForm.mesInicioPagamento || lotesSelecionado?.mesInicioPagamento || ""}
                          onValueChange={(value) => handleArrematanteFormChange("mesInicioPagamento", value)}
                        >
                          <SelectTrigger className="h-10 border-gray-300 focus:!ring-0 focus:!outline-none focus:!shadow-none bg-white text-sm">
                            <SelectValue placeholder="Mês/Ano" />
                          </SelectTrigger>
                          <SelectContent>
                            {Array.from({ length: 36 }, (_, i) => {
                              const date = new Date();
                              // Começar 12 meses no passado e ir até 23 meses no futuro
                              date.setMonth(date.getMonth() + (i - 12));
                              const year = date.getFullYear();
                              const month = String(date.getMonth() + 1).padStart(2, '0');
                              const monthName = date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
                              return (
                                <SelectItem key={`${year}-${month}`} value={`${year}-${month}`}>
                                  {monthName.charAt(0).toUpperCase() + monthName.slice(1)}
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="diaVencimentoMensal" className="text-sm font-medium text-gray-700">Dia Vencimento</Label>
                        <Select
                          value={(arrematanteForm.diaVencimentoMensal || lotesSelecionado?.diaVencimentoPadrao || 15).toString()} 
                          onValueChange={(v) => handleArrematanteFormChange("diaVencimentoMensal", parseInt(v))}
                        >
                          <SelectTrigger className="h-10 border-gray-300 focus:!ring-0 focus:!outline-none focus:!shadow-none bg-white text-sm">
                            <SelectValue placeholder="Dia" />
                          </SelectTrigger>
                          <SelectContent>
                            {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                              <SelectItem key={day} value={day.toString()}>
                                Dia {day}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="quantidadeParcelas" className="text-sm font-medium text-gray-700">Qtd. Parcelas</Label>
                        <Input
                          id="quantidadeParcelas"
                          type="number"
                          min="1"
                          max="60"
                          value={arrematanteForm.quantidadeParcelas || lotesSelecionado?.parcelasPadrao || ""}
                          onChange={(e) => {
                            const value = e.target.value;
                            if (value === "") {
                              handleArrematanteFormChange("quantidadeParcelas", "");
                            } else {
                              const numValue = parseInt(value);
                              if (!isNaN(numValue) && numValue >= 1 && numValue <= 60) {
                                handleArrematanteFormChange("quantidadeParcelas", numValue);
                              }
                            }
                          }}
                          className="h-10 border-gray-300 focus:!border-gray-900 focus:!ring-0 focus:!outline-none bg-white text-sm"
                          required
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="parcelasPagas" className="text-sm font-medium text-gray-700">Parcelas Pagas</Label>
                        <Input
                          id="parcelasPagas"
                          type="number"
                          min="0"
                          max={arrematanteForm.quantidadeParcelas || 60}
                          value={arrematanteForm.parcelasPagas === null || arrematanteForm.parcelasPagas === undefined ? '' : arrematanteForm.parcelasPagas}
                          onChange={(e) => {
                            const value = e.target.value;
                            if (value === "") {
                              handleArrematanteFormChange("parcelasPagas", null);
                            } else {
                              const numValue = parseInt(value);
                              if (!isNaN(numValue) && numValue >= 0) {
                                const maxParcelas = typeof arrematanteForm.quantidadeParcelas === 'number' ? arrematanteForm.quantidadeParcelas : 60;
                                const valorLimitado = Math.min(numValue, maxParcelas);
                                handleArrematanteFormChange("parcelasPagas", valorLimitado);
                                handleArrematanteFormChange("pago", valorLimitado >= maxParcelas);
                              }
                            }
                          }}
                          onBlur={(e) => {
                            if (e.target.value === '' || arrematanteForm.parcelasPagas === null || arrematanteForm.parcelasPagas === undefined) {
                              handleArrematanteFormChange("parcelasPagas", 0);
                            }
                          }}
                          placeholder="0"
                          className="h-10 border-gray-300 focus:!border-gray-900 focus:!ring-0 focus:!outline-none bg-white text-sm"
                        />
                      </div>
                    </div>

                    {/* Segunda linha: Campo de Juros por Atraso */}
                    <div className="space-y-2">
                      <Label htmlFor="percentualJurosAtraso" className="text-sm font-medium text-gray-700">
                        Percentual de Juros por Atraso (% ao mês) - Juros Compostos
                      </Label>
                      <Input
                        id="percentualJurosAtraso"
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                    value={arrematanteForm.percentualJurosAtraso || ""}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value === "") {
                        handleArrematanteFormChange("percentualJurosAtraso", 0);
                      } else {
                        const numValue = parseFloat(value);
                        if (!isNaN(numValue) && numValue >= 0 && numValue <= 100) {
                          handleArrematanteFormChange("percentualJurosAtraso", numValue);
                        }
                      }
                    }}
                    placeholder="0.0"
                    className="h-10 border-gray-300 focus:!border-gray-900 focus:!ring-0 focus:!outline-none bg-white text-sm"
                  />
                </div>
              </div>
                );
              })()}

              {/* Campo adicional para À Vista - Data de Vencimento */}
              {(() => {
                const loteId = arrematanteForm.loteId;
                const lotesSelecionado = addingArrematanteFor?.lotes?.find(lote => lote.id === loteId);
                const tipoPagamento = lotesSelecionado?.tipoPagamento || "parcelamento";
                
                if (tipoPagamento === "a_vista") {
                  return (
                    <div className="arrematante-form grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium text-gray-700">Data de Vencimento</Label>
                        <StringDatePicker
                          value={lotesSelecionado?.dataVencimentoVista || ""}
                          onChange={(value) => {
                            if (addingArrematanteFor && loteId) {
                              // Atualizar o lote específico com a data de vencimento à vista
                              const lotesAtualizados = addingArrematanteFor.lotes?.map(lote => 
                                lote.id === loteId ? { ...lote, dataVencimentoVista: value } : lote
                              ) || [];
                              updateAuction({
                                id: addingArrematanteFor.id,
                                data: { lotes: lotesAtualizados }
                              });
                            }
                          }}
                          className="h-10"
                        />
                      </div>
                      
                      {/* Campo de Juros por Atraso */}
                      <div className="space-y-2">
                        <Label htmlFor="percentualJurosAtrasoVista" className="text-sm font-medium text-gray-700">
                          Percentual de Juros por Atraso (% ao mês) - Juros Compostos
                        </Label>
                        <Input
                          id="percentualJurosAtrasoVista"
                          type="number"
                          min="0"
                          max="100"
                          step="0.1"
                          value={arrematanteForm.percentualJurosAtraso || ""}
                          onChange={(e) => {
                            const value = e.target.value;
                            if (value === "") {
                              handleArrematanteFormChange("percentualJurosAtraso", 0);
                            } else {
                              const numValue = parseFloat(value);
                              if (!isNaN(numValue) && numValue >= 0 && numValue <= 100) {
                                handleArrematanteFormChange("percentualJurosAtraso", numValue);
                              }
                            }
                          }}
                          placeholder="0.0"
                          className="h-10 border-gray-300 focus:!border-gray-900 focus:!ring-0 focus:!outline-none bg-white text-sm"
                        />
                      </div>
                    </div>
                  );
                }
                
                return null;
              })()}

              {/* Documentos */}
              <div className="space-y-3">
                <Label className="text-sm font-medium text-gray-700">Documentos</Label>
                
                {/* Lista de documentos */}
                {arrematanteForm.documentos.length > 0 && (
                  <div className="space-y-2 p-3 bg-gray-50 border border-gray-200 rounded-md max-h-40 overflow-y-auto">
                    {arrematanteForm.documentos.map((doc) => (
                      <div key={doc.id} className="flex items-center gap-3 p-2 bg-white border border-gray-200 rounded-md">
                        {getFileIcon(doc.tipo)}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{doc.nome}</p>
                          <p className="text-xs text-gray-500">
                            {formatFileSize(doc.tamanho)}{formatUploadDate(doc.dataUpload) && ` • ${formatUploadDate(doc.dataUpload)}`}
                          </p>
                        </div>
                        <div className="flex gap-1">
                          {doc.url && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                if (doc.url) {
                                  // Se é documento com base64, abrir em nova aba com viewer
                                  if (doc.url.startsWith('data:')) {
                                    const newWindow = window.open();
                                    if (newWindow) {
                                      newWindow.document.write(`
                                        <html>
                                          <head><title>${doc.nome}</title></head>
                                          <body style="margin:0; display:flex; justify-content:center; align-items:center; min-height:100vh; background:#f0f0f0;">
                                            ${doc.url.includes('pdf') ? 
                                              `<embed src="${doc.url}" width="100%" height="100%" type="application/pdf" />` :
                                              `<img src="${doc.url}" style="max-width:100%; max-height:100%; object-fit:contain;" alt="${doc.nome}" />`
                                            }
                                          </body>
                                        </html>
                                      `);
                                    }
                                  } else {
                                    // Para outros tipos, tentar abrir ou baixar
                                    window.open(doc.url, '_blank');
                                  }
                                }
                              }}
                              className="h-7 w-7 p-0 text-black hover:bg-gray-100 hover:text-black"
                              title="Visualizar arquivo"
                            >
                              <Eye className="h-3 w-3" />
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveDocument(doc.id)}
                            className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                            title="Remover arquivo"
                          >
                            <Trash className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                {/* Área de upload */}
                <div 
                  className="border-2 border-dashed border-gray-300 rounded-lg p-6 hover:border-gray-400 transition-colors"
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                >
                  <div className="text-center">
                    <Paperclip className="mx-auto h-8 w-8 text-gray-400 mb-2" />
                    <p className="text-sm font-medium text-gray-900 mb-1">Adicionar documentos</p>
                    <p className="text-xs text-gray-500 mb-3">
                      Arraste arquivos aqui ou clique para selecionar
                    </p>
                    <div className="flex flex-col sm:flex-row gap-2 justify-center">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => document.getElementById('file-upload-arrematante')?.click()}
                        className="h-9 px-4 border-gray-300 hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-colors"
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        Selecionar Arquivos
                      </Button>
                    </div>
                    <input
                      id="file-upload-arrematante"
                      type="file"
                      multiple
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                    <p className="text-xs text-gray-400 mt-2">
                      Formatos aceitos: PDF, DOC, DOCX, XLS, XLSX, JPG, PNG (máx. 10MB cada)
                    </p>
                  </div>
                </div>
              </div>

              {/* Botões */}
              <div className="flex justify-end gap-3 pt-6 border-t border-gray-200">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCancelArrematante}
                  className="h-11 px-6 border-gray-300 text-gray-700 hover:bg-gray-100 hover:text-gray-800"
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  onClick={handleAddArrematante}
                  disabled={isSavingArrematante || 
                           !arrematanteForm.nome || 
                           !arrematanteForm.valorPagar || 
                           !arrematanteForm.quantidadeParcelas ||
                           arrematanteForm.quantidadeParcelas < 1 ||
                           arrematanteForm.parcelasPagas === null ||
                           arrematanteForm.parcelasPagas === undefined ||
                           arrematanteForm.parcelasPagas < 0}
                  className="h-11 px-6 text-white font-medium bg-black hover:bg-gray-800 btn-save-click disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSavingArrematante ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    editingArrematanteId ? "Salvar Alterações" : "Adicionar Arrematante"
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal de Pagamento Mensal */}
      <Dialog open={paymentModalOpen} onOpenChange={setPaymentModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Registrar Pagamento Mensal
            </DialogTitle>
            <DialogDescription>
              Selecione os meses em que {selectedAuctionForPayment?.arrematante?.nome} realizou o pagamento
            </DialogDescription>
          </DialogHeader>
          
          {selectedAuctionForPayment?.arrematante && (
            <PaymentMonthsSelector 
              arrematante={selectedAuctionForPayment.arrematante}
              onConfirm={(paidMonths) => {
                // Atualizar parcelas pagas baseado nos meses pagos
                const updatedArrematante = {
                  ...selectedAuctionForPayment.arrematante!,
                  parcelasPagas: paidMonths,
                  pago: paidMonths >= selectedAuctionForPayment.arrematante!.quantidadeParcelas
                };
                
                updateAuction({
                  id: selectedAuctionForPayment.id,
                  data: { arrematante: updatedArrematante }
                });
                
                setPaymentModalOpen(false);
                setSelectedAuctionForPayment(null);
              }}
              onCancel={() => {
                setPaymentModalOpen(false);
                setSelectedAuctionForPayment(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Modal de Exportação */}
      <Dialog open={isExportModalOpen} onOpenChange={setIsExportModalOpen}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold">Exportar Relatório de Leilão</DialogTitle>
            <DialogDescription>
              Selecione um leilão para gerar e baixar o relatório em PDF
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Seletor de Leilão */}
            <div>
              <Label className="text-sm font-medium text-gray-700">Selecionar Leilão:</Label>
              <Select 
                value={selectedAuctionForExport} 
                onValueChange={setSelectedAuctionForExport}
                onOpenChange={setIsExportSelectOpen}
              >
                <SelectTrigger 
                  className="w-full mt-2 focus:!ring-0 focus:!ring-offset-0 focus:!border-gray-300 focus:!outline-none focus:!shadow-none"
                >
                  <SelectValue placeholder="Escolha um leilão para exportar" />
                </SelectTrigger>
                <SelectContent>
                  {auctions.map((auction) => (
                    <SelectItem key={auction.id} value={auction.id}>
                      {auction.identificacao ? 
                        `Leilão ${auction.identificacao} - ${auction.nome || 'Sem nome'}` :
                        `${auction.nome || 'Sem nome'} - ${new Date(auction.dataInicio || '').toLocaleDateString('pt-BR')}`
                      }
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Preview do Relatório */}
            {selectedAuctionForExport && (
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-4 py-2 border-b">
                  <h3 className="font-medium text-gray-900">Pré-visualização do Relatório</h3>
                  <p className="text-sm text-gray-600">Este será o conteúdo do arquivo PDF</p>
                </div>
                <div className="max-h-96 overflow-y-auto p-4">
                  <PdfReport auction={auctions.find(a => a.id === selectedAuctionForExport)!} />
                </div>
              </div>
            )}

            {/* Botões de Ação */}
              <div className="flex gap-3 pt-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsExportModalOpen(false);
                    setSelectedAuctionForExport("");
                  }}
                  className="flex-1 hover:bg-gray-100 hover:text-gray-900"
                >
                  Cancelar
                </Button>
                <Button
                  onClick={() => generatePDF(selectedAuctionForExport)}
                  disabled={!selectedAuctionForExport}
                  className="flex-1 bg-black hover:bg-gray-800 text-white btn-download-click"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Gerar e Baixar PDF
                </Button>
              </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Componente para seleção de meses de pagamento
function PaymentMonthsSelector({ 
  arrematante, 
  onConfirm, 
  onCancel 
}: {
  arrematante: ArrematanteInfo;
  onConfirm: (paidMonths: number) => void;
  onCancel: () => void;
}) {
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
  
  // Gerar lista de meses baseado no mês de início e quantidade de parcelas
  const generateMonths = () => {
    const months = [];
    const startDate = new Date(arrematante.mesInicioPagamento + '-01');
    
    for (let i = 0; i < arrematante.quantidadeParcelas; i++) {
      const monthDate = new Date(startDate.getFullYear(), startDate.getMonth() + i, 1);
      const monthKey = monthDate.toISOString().slice(0, 7); // YYYY-MM
      const monthLabel = monthDate.toLocaleDateString('pt-BR', { 
        month: 'long', 
        year: 'numeric' 
      });
      months.push({ key: monthKey, label: monthLabel, index: i });
    }
    
    return months;
  };
  
  const months = generateMonths();
  
  // Inicializar meses já pagos
  useEffect(() => {
    const paidMonthsCount = arrematante.parcelasPagas || 0;
    const initialPaidMonths = months.slice(0, paidMonthsCount).map(m => m.key);
    setSelectedMonths(initialPaidMonths);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Executa apenas uma vez na montagem - arrematante.parcelasPagas e months são estáveis
  
  const toggleMonth = (monthKey: string) => {
    setSelectedMonths(prev => 
      prev.includes(monthKey) 
        ? prev.filter(m => m !== monthKey)
        : [...prev, monthKey].sort()
    );
  };
  
  return (
    <div className="space-y-4">
      <div className="text-sm text-gray-600">
        <p><strong>Arrematante:</strong> {arrematante.nome}</p>
        <p><strong>Valor por parcela:</strong> R$ {(arrematante.valorPagarNumerico / arrematante.quantidadeParcelas).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
      </div>
      
      <div className="max-h-60 overflow-y-auto space-y-2">
        {months.map((month) => (
          <div 
            key={month.key}
            className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-colors ${
              selectedMonths.includes(month.key)
                ? 'bg-green-50 border-green-200'
                : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
            }`}
            onClick={() => toggleMonth(month.key)}
          >
            <span className="font-medium capitalize">
              {month.label}
            </span>
            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
              selectedMonths.includes(month.key)
                ? 'bg-green-500 border-green-500'
                : 'border-gray-300'
            }`}>
              {selectedMonths.includes(month.key) && (
                <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
            </div>
          </div>
        ))}
      </div>
      
      <div className="text-sm text-gray-600 bg-blue-50 p-3 rounded-lg">
        <p><strong>Parcelas selecionadas:</strong> {selectedMonths.length} de {arrematante.quantidadeParcelas}</p>
        <p><strong>Valor total pago:</strong> R$ {(selectedMonths.length * (arrematante.valorPagarNumerico / arrematante.quantidadeParcelas)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
      </div>
      
      <div className="flex gap-3 pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          className="flex-1"
        >
          Cancelar
        </Button>
        <Button
          type="button"
          onClick={() => onConfirm(selectedMonths.length)}
          className="flex-1 bg-green-600 hover:bg-green-700 btn-save-click"
        >
          Confirmar Pagamentos
        </Button>
      </div>
    </div>
  );
}

export default Leiloes;

// CSS para scrollbar que aparece apenas no hover
const scrollbarStyles = `
  .custom-scrollbar {
    scrollbar-width: none;
    -ms-overflow-style: none;
  }
  
  .custom-scrollbar::-webkit-scrollbar {
    width: 0px;
    background: transparent;
  }
  
  .custom-scrollbar:hover {
    scrollbar-width: thin;
    scrollbar-color: #9ca3af #f3f4f6;
  }
  
  .custom-scrollbar:hover::-webkit-scrollbar {
    width: 8px;
  }
  
  .custom-scrollbar:hover::-webkit-scrollbar-track {
    background: #f3f4f6;
    border-radius: 4px;
  }
  
  .custom-scrollbar:hover::-webkit-scrollbar-thumb {
    background: #9ca3af;
    border-radius: 4px;
  }
  
  .custom-scrollbar:hover::-webkit-scrollbar-thumb:hover {
    background: #6b7280;
  }
`;

// Forçar aplicação dos estilos
if (typeof document !== 'undefined') {
  // Remover estilo anterior se existir
  const existingStyle = document.getElementById('custom-scrollbar-styles');
  if (existingStyle) {
    existingStyle.remove();
  }
  
  // Adicionar novo estilo
  const styleElement = document.createElement('style');
  styleElement.id = 'custom-scrollbar-styles';
  styleElement.textContent = scrollbarStyles;
  document.head.appendChild(styleElement);
  
  // Forçar re-render
  setTimeout(() => {
    const scrollContainers = document.querySelectorAll('.custom-scrollbar');
    scrollContainers.forEach(container => {
      if (container instanceof HTMLElement) {
        container.style.scrollbarWidth = 'none';
        void container.offsetHeight; // Trigger reflow
      }
    });
  }, 100);
}



