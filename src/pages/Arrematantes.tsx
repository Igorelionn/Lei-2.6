import { useState, useEffect, useRef, useCallback } from "react";
import { useSupabaseAuctions } from "@/hooks/use-supabase-auctions";
import { useGuestLots } from "@/hooks/use-guest-lots"; // ✅ NOVO: Import para lotes convidados
import { useClientPagination } from "@/hooks/use-pagination"; // ⚡ PERFORMANCE: Paginação
import { Pagination } from "@/components/Pagination"; // ⚡ PERFORMANCE: Componente de paginação
import { useActivityLogger } from "@/hooks/use-activity-logger";
import { useEmailNotifications } from "@/hooks/use-email-notifications";
import { parseCurrencyToNumber, openDocumentSafely } from "@/lib/utils";
import { logger } from "@/lib/logger";
import { supabase } from "@/lib/supabase";
import { useQueryClient } from "@tanstack/react-query";
import { ArrematanteInfo, DocumentoInfo, Auction, LoteInfo } from "@/lib/types";
import html2pdf from 'html2pdf.js';
import { obterValorTotalArrematante, descreverEstruturaParcelas, calcularEstruturaParcelas } from "@/lib/parcelamento-calculator";
import { ArrematanteWizard } from "@/components/ArrematanteWizard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { StringDatePicker } from "@/components/ui/date-picker";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { 
  Search, 
  Filter, 
  Eye, 
  Edit, 
  Trash2, 
  Download, 
  Users, 
  DollarSign, 
  Calendar, 
  Clock, 
  CheckCircle, 
  AlertCircle,
  FileText,
  Paperclip,
  Upload,
  File,
  Image,
  FileSpreadsheet,
  RefreshCw,
  Check,
  Archive,
  ArrowLeft,
  MoreVertical,
  CreditCard,
  X,
  CircleX,
  Loader2
} from "lucide-react";

interface ArrematanteExtendido extends ArrematanteInfo {
  id: string;
  leilaoNome: string;
  leilaoId: string;
  dataLeilao: string;
  statusPagamento: 'pago' | 'pendente' | 'atrasado';
  email?: string;
}

function Arrematantes() {
  const { auctions, isLoading: isAuctionsLoading, updateAuction, archiveAuction, unarchiveAuction } = useSupabaseAuctions();
  const { guestLots } = useGuestLots(); // ✅ NOVO: Buscar lotes convidados
  const { logBidderAction, logPaymentAction, logReportAction, logDocumentAction } = useActivityLogger();
  const { enviarConfirmacao, enviarQuitacao } = useEmailNotifications();
  const queryClient = useQueryClient(); // ✅ NOVO: Para invalidar cache de guest_lots

  // ✅ Funções auxiliares para cálculo de datas (ajuste automático para meses com menos dias)
  const calcularDataComAjuste = (ano: number, mes: number, diaVencimento: number): Date => {
    // Criar data com dia 1 para evitar overflow
    const dataBase = new Date(ano, mes, 1);
    
    // Obter o último dia do mês
    const ultimoDiaDoMes = new Date(dataBase.getFullYear(), dataBase.getMonth() + 1, 0).getDate();
    
    // Usar o menor valor entre diaVencimento e ultimoDiaDoMes
    // Exemplos:
    // - Dia 30 em fevereiro/2024 (bissexto, 29 dias) → usa dia 29
    // - Dia 30 em fevereiro/2026 (normal, 28 dias) → usa dia 28
    // - Dia 29 em fevereiro/2026 (normal, 28 dias) → usa dia 28
    // - Dia 31 em abril (30 dias) → usa dia 30
    const diaFinal = Math.min(diaVencimento, ultimoDiaDoMes);
    
    // Criar a data final
    return new Date(dataBase.getFullYear(), dataBase.getMonth(), diaFinal);
  };

  // ✅ Função auxiliar para criar data com horário específico
  const calcularDataComAjusteEHorario = (ano: number, mes: number, diaVencimento: number, horas = 23, minutos = 59, segundos = 59): Date => {
    const data = calcularDataComAjuste(ano, mes, diaVencimento);
    data.setHours(horas, minutos, segundos, 0);
    return data;
  };

  // Função para calcular a próxima data de pagamento não paga
  const calculateNextPaymentDate = (arrematante: ArrematanteInfo) => {
    // Validar campos obrigatórios
    if (!arrematante.mesInicioPagamento || !arrematante.diaVencimentoMensal) {
      return null;
    }
    
    const [startYear, startMonth] = arrematante.mesInicioPagamento.split('-').map(Number);
    const parcelasPagas = arrematante.parcelasPagas || 0;
    
    // Se já quitou tudo, retorna null
    if (parcelasPagas >= arrematante.quantidadeParcelas || arrematante.pago) {
      return null;
    }
    
    // Calcula a data da próxima parcela não paga (parcelasPagas é o índice da próxima parcela)
    const nextPaymentDate = calcularDataComAjuste(startYear, startMonth - 1 + parcelasPagas, arrematante.diaVencimentoMensal);
    return nextPaymentDate;
  };

  // Função específica para calcular próxima data em entrada_parcelamento
  const calculateNextPaymentDateEntradaParcelamento = (arrematante: ArrematanteInfo, auction: Auction) => {
    const parcelasPagas = arrematante.parcelasPagas || 0;
    const loteArrematado = auction?.lotes?.find((lote: LoteInfo) => lote.id === arrematante.loteId);
    
    logger.debug('calculateNextPaymentDateEntradaParcelamento', {
      arrematante: arrematante.nome,
      parcelasPagas,
      arrematanteDataEntrada: arrematante.dataEntrada,
      loteDataEntrada: loteArrematado?.dataEntrada,
      auctionDataEntrada: auction?.dataEntrada
    });
    
    // Se já quitou tudo, retorna null
    if (arrematante.pago) {
      return null;
    }
    
    if (parcelasPagas === 0) {
      // Entrada pendente - mostrar data da entrada (priorizar arrematante)
      const dataEntrada = arrematante.dataEntrada || loteArrematado?.dataEntrada || auction?.dataEntrada;
      logger.debug('Data de entrada selecionada', { dataEntrada });
      return dataEntrada ? new Date(dataEntrada + 'T00:00:00') : null;
    } else {
      // Entrada paga, calcular próxima parcela
      const quantidadeParcelas = arrematante.quantidadeParcelas || 12;
      if (parcelasPagas > quantidadeParcelas) {
        return null; // Todas as parcelas pagas
      }
      
      // Validar campos obrigatórios para parcelas
      if (!arrematante.mesInicioPagamento || !arrematante.diaVencimentoMensal) {
        return null;
      }
      
      const [startYear, startMonth] = arrematante.mesInicioPagamento.split('-').map(Number);
      const proximaParcela = parcelasPagas - 1; // Descontar a entrada
      const nextPaymentDate = calcularDataComAjuste(startYear, startMonth - 1 + proximaParcela, arrematante.diaVencimentoMensal);
      return nextPaymentDate;
    }
  };

  // Função para formatar telefone automaticamente no formato brasileiro +55 (11) 99999-9999
  const formatPhoneNumber = (value: string) => {
    // Remove tudo que não é dígito
    const numbersOnly = value.replace(/[^\d]/g, '');
    
    // Remove o código do país se começar com 55
    let brazilianNumber = numbersOnly;
    if (brazilianNumber.startsWith('55') && brazilianNumber.length > 2) {
      brazilianNumber = brazilianNumber.substring(2);
    }
    
    // Limitar a 11 dígitos (DDD + 9 dígitos)
    brazilianNumber = brazilianNumber.substring(0, 11);
    
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
    
    return `+55 (${brazilianNumber.substring(0, 2)}) ${brazilianNumber.substring(2, 7)}-${brazilianNumber.substring(7, 11)}`;
  };

  // Função para lidar com mudanças no formulário de edição completa
  const handleFullEditFormChange = (field: string, value: unknown) => {
    const newForm = {
      ...fullEditForm,
      [field]: value
    };
    
    setFullEditForm(newForm);

    // 🔄 SINCRONIZAÇÃO EM TEMPO REAL: Disparar evento quando campos relevantes mudarem
    const relevantFields = ['diaVencimentoMensal', 'quantidadeParcelas', 'mesInicioPagamento'];
    
    if (relevantFields.includes(field) && selectedArrematanteForFullEdit) {
      const auction = auctions.find(a => a.id === selectedArrematanteForFullEdit.leilaoId);
      if (auction) {
        // Disparar evento para notificar formulário do leilão sobre mudanças em tempo real
        window.dispatchEvent(new CustomEvent('arrematanteFormChanged', {
          detail: {
            auctionId: auction.id,
            changes: {
              [field === 'diaVencimentoMensal' ? 'diaVencimentoPadrao' : 
               field === 'quantidadeParcelas' ? 'parcelasPadrao' : 
               field]: value
            }
          }
        }));

      }
    }
  };
  const [searchTerm, setSearchTerm] = useState("");
  const [searchInputValue, setSearchInputValue] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [showArchived, setShowArchived] = useState(false);
  const [showGuestBidders, setShowGuestBidders] = useState(false); // ✅ NOVO: Filtro para arrematantes de lotes convidados
  const [_isLoading, setIsLoading] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isSavingFullEdit, setIsSavingFullEdit] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isSavingPayments, setIsSavingPayments] = useState(false);
  const [_isStatusSelectOpen, setIsStatusSelectOpen] = useState(false);
  
  // Estados para o modal de exportação
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [selectedArrematanteForExport, setSelectedArrematanteForExport] = useState<string>("");
  const [_isExportSelectOpen, setIsExportSelectOpen] = useState(false);
  
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Set para rastrear URLs blob temporárias que precisam ser limpas
  const tempBlobUrlsRef = useRef(new Set<string>());
  // Refs para controle de sincronização robusta entre modais
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isUpdatingRef = useRef(false);


  // Função para gerar PDF do arrematante
  const generateArrematantePDF = async (arrematanteId: string) => {
    const arrematante = filteredArrematantes.find(a => a.id === arrematanteId);
    if (!arrematante) {
      return;
    }

    try {
      // Aguardar o componente renderizar
      await new Promise(resolve => setTimeout(resolve, 200));
      
      const element = document.getElementById('arrematante-pdf-content');
      if (!element) {
        throw new Error('Elemento PDF não encontrado');
      }

      // Usar html2pdf importado estaticamente

      const opt = {
        margin: [0.4, 0.4, 0.4, 0.4] as [number, number, number, number],
        filename: `relatorio_arrematante_${arrematante.nome.replace(/\s+/g, '_')}.pdf`,
        image: { type: 'jpeg' as const, quality: 0.98 },
        html2canvas: { 
          scale: 2,
          useCORS: true,
          logging: false,
          windowWidth: 1200,
          scrollY: 0,
          scrollX: 0
        },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' as const },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'], before: '.page-break-before', after: '.page-break-after', avoid: '.break-inside-avoid' }
      };

      await html2pdf().set(opt).from(element).save();
      
      // Log da geração do relatório
      await logReportAction('generate', 'arrematante', `Relatório do arrematante ${arrematante.nome}`, {
        metadata: {
          arrematante_id: arrematante.id,
          arrematante_name: arrematante.nome,
          auction_id: arrematante.leilaoId,
          report_format: 'pdf',
          generation_date: new Date().toISOString()
        }
      });
      
      setIsExportModalOpen(false);
    } catch (_error) {
      logger.error('Erro ao gerar PDF:', _error);
    }
  };
  
  // Estados do modal
  const [selectedArrematante, setSelectedArrematante] = useState<ArrematanteExtendido | null>(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedArrematanteForPayment, setSelectedArrematanteForPayment] = useState<ArrematanteExtendido | null>(null);
  const [paymentMonths, setPaymentMonths] = useState<{month: string, paid: boolean, dueDate: string, monthName: string, isEntrada?: boolean}[]>([]);
  const [isFullEditModalOpen, setIsFullEditModalOpen] = useState(false);
  const [selectedArrematanteForFullEdit, setSelectedArrematanteForFullEdit] = useState<ArrematanteExtendido | null>(null);
  const [fullEditForm, setFullEditForm] = useState({
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
    documentos: [] as DocumentoInfo[]
  });

  // 🔄 FUNÇÃO DE SINCRONIZAÇÃO ROBUSTA COM DEBOUNCE
  const syncDocumentsToDetails = useCallback((documentos: DocumentoInfo[], operation: 'add' | 'remove', docId?: string) => {
    // Cancelar sincronização anterior se ainda pendente
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }

    // Prevenir múltiplas atualizações simultâneas
    if (isUpdatingRef.current) {
      return;
    }

    // Agendar sincronização com pequeno debounce
    syncTimeoutRef.current = setTimeout(() => {
      isUpdatingRef.current = true;
      
      try {
        // Sincronização para o selectedArrematante (modal de detalhes)
        if (selectedArrematante) {
          setSelectedArrematante(prev => {
            if (!prev) return prev;
            
            const newDocs = operation === 'add' 
              ? [...(prev.documentos || []), ...documentos.filter(doc => 
                  !(prev.documentos || []).some(existing => existing.id === doc.id)
                )]
              : (prev.documentos || []).filter(doc => doc.id !== docId);
            
            return { ...prev, documentos: newDocs };
          });
        }

        // Sincronização para o selectedArrematanteForFullEdit (modal de edição completa)
        if (selectedArrematanteForFullEdit && selectedArrematante?.nome === selectedArrematanteForFullEdit.nome) {
          setSelectedArrematanteForFullEdit(prev => {
            if (!prev) return prev;
            
            const newDocs = operation === 'add' 
              ? [...(prev.documentos || []), ...documentos.filter(doc => 
                  !(prev.documentos || []).some(existing => existing.id === doc.id)
                )]
              : (prev.documentos || []).filter(doc => doc.id !== docId);
            
            return { ...prev, documentos: newDocs };
          });
        }
        
      } catch (_error) {
        // Erro silencioso durante sincronização
      } finally {
        isUpdatingRef.current = false;
        syncTimeoutRef.current = null;
      }
    }, 10); // Debounce muito pequeno, apenas para evitar conflitos

  }, [selectedArrematante, selectedArrematanteForFullEdit]);
  
  // Estados do formulário
  const [editForm, setEditForm] = useState({
    nome: "",
    email: "",
    valorPagar: "",
    documentos: [] as DocumentoInfo[]
  });

  // Limpar blob URLs quando componente desmontar
  useEffect(() => {
    // Capturar o valor atual do ref no corpo do efeito
    const currentBlobUrls = tempBlobUrlsRef.current;
    
    return () => {
      // Limpar timeouts pendentes
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
        syncTimeoutRef.current = null;
      }
      
      // Limpar todas as URLs blob temporárias usando a captura
      currentBlobUrls.forEach(url => {
        try {
          URL.revokeObjectURL(url);
        } catch (_error) {
          // Erro silencioso ao revogar URL
        }
      });
      currentBlobUrls.clear();
      
      // Resetar flags de controle
      isUpdatingRef.current = false;
    };
  }, []); // Array vazio = executa apenas no desmonte do componente

  // Debounce para busca automática
  useEffect(() => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    debounceTimeoutRef.current = setTimeout(() => {
      setSearchTerm(searchInputValue);
    }, 800);

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [searchInputValue]);

  // useEffect para carregar dados do arrematante no modal de edição completa
  useEffect(() => {
    if (selectedArrematanteForFullEdit) {
      const auction = auctions.find(a => a.id === selectedArrematanteForFullEdit.leilaoId);
      if (auction && auction.arrematante) {
        setFullEditForm({
          nome: auction.arrematante.nome || "",
          documento: auction.arrematante.documento || "",
          endereco: auction.arrematante.endereco || "",
          email: auction.arrematante.email || "",
          telefone: auction.arrematante.telefone || "",
          loteId: auction.arrematante.loteId || "",
          valorPagar: auction.arrematante.valorPagar || "",
          valorEntrada: auction.arrematante.valorEntrada || "",
          diaVencimentoMensal: auction.arrematante.diaVencimentoMensal || 15,
          quantidadeParcelas: auction.arrematante.quantidadeParcelas || 12,
          parcelasPagas: auction.arrematante.parcelasPagas || 0,
          mesInicioPagamento: auction.arrematante.mesInicioPagamento || new Date().toISOString().slice(0, 7),
          pago: auction.arrematante.pago || false,
          documentos: auction.arrematante.documentos || []
        });
      }
    }
  }, [selectedArrematanteForFullEdit, auctions]);

  // 🔧 SINCRONIZAÇÃO FORÇADA: Re-carregar dados quando arrematante é atualizado por outros formulários
  useEffect(() => {
    if (selectedArrematanteForFullEdit && isFullEditModalOpen) {
      const auction = auctions.find(a => a.id === selectedArrematanteForFullEdit.leilaoId);
      if (auction && auction.arrematante) {
        // Forçar atualização dos campos críticos que podem ter sido alterados
        setFullEditForm(prevForm => ({
          ...prevForm,
          documento: auction.arrematante.documento || prevForm.documento || "",
          endereco: auction.arrematante.endereco || prevForm.endereco || "",
          nome: auction.arrematante.nome || prevForm.nome || "",
          email: auction.arrematante.email || prevForm.email || "",
          telefone: auction.arrematante.telefone || prevForm.telefone || "",
          documentos: auction.arrematante.documentos || prevForm.documentos || []
        }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auctions, selectedArrematanteForFullEdit?.leilaoId, isFullEditModalOpen]);
  // Nota: selectedArrematanteForFullEdit completo não é incluído para evitar loops quando ele muda

  // 🔄 SINCRONIZAÇÃO BIDIRECIONAL: Escutar mudanças do formulário do leilão
  useEffect(() => {
    const handleAuctionFormChanged = (event: CustomEvent) => {
      const { auctionId, changedField, newValue } = event.detail;
      
      // 🔄 SINCRONIZAÇÃO GLOBAL: Atualizar dados do leilão nos auctions (sempre)
      const fieldMapping = {
        diaVencimentoPadrao: 'diaVencimentoPadrao',
        parcelasPadrao: 'parcelasPadrao', 
        mesInicioPagamento: 'mesInicioPagamento',
      } as const;
      
      // Atualizar o leilão nos dados globais (isso será refletido quando o modal for aberto)
      if (fieldMapping[changedField as keyof typeof fieldMapping]) {
        // Encontrar e atualizar o leilão nos dados globais
        const _updatedAuctions = auctions.map(auction => {
          if (auction.id === auctionId && auction.arrematante) {
            const arrematanteFieldMap = {
              diaVencimentoPadrao: 'diaVencimentoMensal',
              parcelasPadrao: 'quantidadeParcelas',
              mesInicioPagamento: 'mesInicioPagamento',
            } as const;
            
            const arrematanteField = arrematanteFieldMap[changedField as keyof typeof arrematanteFieldMap];
            if (arrematanteField) {
              return {
                ...auction,
                [changedField]: newValue, // Atualizar campo do leilão
                arrematante: {
                  ...auction.arrematante,
                  [arrematanteField]: newValue // Atualizar campo do arrematante
                }
              };
            }
          }
          return auction;
        });
        
        // Se os dados mudaram, força re-render (mas não dispara useEffect infinito)
        // Isso garantirá que quando o modal abrir, os dados já estarão sincronizados
      }
      
      // 🎯 SINCRONIZAÇÃO DO MODAL ATIVO: Se o modal estiver aberto, atualizar formulário
      if (selectedArrematanteForFullEdit && selectedArrematanteForFullEdit.leilaoId === auctionId && isFullEditModalOpen) {
        // Mapear campos do leilão para campos do arrematante
        const arrematanteFieldMapping = {
          diaVencimentoPadrao: 'diaVencimentoMensal',
          parcelasPadrao: 'quantidadeParcelas',
          mesInicioPagamento: 'mesInicioPagamento',
        } as const;
        
        // Atualizar o formulário se o campo é relevante
        const arrematanteField = arrematanteFieldMapping[changedField as keyof typeof arrematanteFieldMapping];
        if (arrematanteField) {
          setFullEditForm(prev => ({
            ...prev,
            [arrematanteField]: newValue
          }));
        }
      }
    };

    // Adicionar listener para o evento customizado (sempre ativo)
    window.addEventListener('auctionFormChanged', handleAuctionFormChanged as EventListener);
    
    // Limpar listener quando componente desmontar
    return () => {
      window.removeEventListener('auctionFormChanged', handleAuctionFormChanged as EventListener);
    };
  }, [selectedArrematanteForFullEdit, isFullEditModalOpen, auctions]);

  // 🔄 SINCRONIZAÇÃO INICIAL: Quando um arrematante é selecionado, sincronizar com valores atuais do leilão
  useEffect(() => {
    if (selectedArrematanteForFullEdit && auctions.length > 0 && isFullEditModalOpen) {
      const auction = auctions.find(a => a.id === selectedArrematanteForFullEdit.leilaoId);
      
      if (auction) {
        // Usar setTimeout para garantir que o formulário foi inicializado
        setTimeout(() => {
          setFullEditForm(prev => {
            const shouldUpdateDia = auction.diaVencimentoPadrao && prev.diaVencimentoMensal !== auction.diaVencimentoPadrao;
            const shouldUpdateParcelas = auction.parcelasPadrao && prev.quantidadeParcelas !== auction.parcelasPadrao;
            const shouldUpdateMes = auction.mesInicioPagamento && prev.mesInicioPagamento !== auction.mesInicioPagamento;

            if (shouldUpdateDia || shouldUpdateParcelas || shouldUpdateMes) {
              return {
                ...prev,
                diaVencimentoMensal: auction.diaVencimentoPadrao || prev.diaVencimentoMensal,
                quantidadeParcelas: auction.parcelasPadrao || prev.quantidadeParcelas,
                mesInicioPagamento: auction.mesInicioPagamento || prev.mesInicioPagamento
              };
            } else {
              return prev;
            }
          });
        }, 100); // Pequeno delay para garantir inicialização
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedArrematanteForFullEdit?.leilaoId, auctions.length, isFullEditModalOpen]);
  // Nota: auctions e selectedArrematanteForFullEdit completo não são incluídos para evitar loops infinitos

  // Animação de loading
  useEffect(() => {
    if (searchTerm !== searchInputValue || statusFilter) {
      setIsLoading(true);
      setIsTransitioning(true);
      
      const timer = setTimeout(() => {
        setIsLoading(false);
        setTimeout(() => setIsTransitioning(false), 150);
      }, 500);
      
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, statusFilter, showArchived]);
  // Nota: searchInputValue não é incluído intencionalmente para evitar loops infinitos de renderização

  // Processar arrematantes de todos os leilões
  const processedArrematantes = (): ArrematanteExtendido[] => {
    const now = new Date();

    // Processar múltiplos arrematantes por leilão
    const result: ArrematanteExtendido[] = [];
    
    // ✅ Se showGuestBidders estiver ativo, buscar arrematantes de lotes convidados
    if (showGuestBidders) {
      for (const guestLot of guestLots || []) {
        // Filtrar por arquivado
        if (showArchived ? !guestLot.arquivado : guestLot.arquivado) continue;
        
        const arrematantes = guestLot.arrematantes || [];
        
        if (arrematantes.length === 0) continue;
        
        for (const arrematante of arrematantes) {
          // Status de pagamento para lotes convidados (simplificado)
          const statusPagamento: 'pago' | 'pendente' | 'atrasado' = 
            arrematante.pago ? 'pago' : 'pendente';
          
          result.push({
            id: arrematante.id || `guest-${guestLot.id}-${arrematante.nome}`,
            leilaoNome: guestLot.leilao_nome || 'Lote Convidado',
            leilaoId: guestLot.leilao_id || '',
            dataLeilao: guestLot.created_at,
            statusPagamento,
            nome: arrematante.nome,
            documento: '',
            endereco: '',
            email: arrematante.email || '',
            telefone: arrematante.telefone || '',
            loteId: guestLot.id,
            valorPagar: '',
            valorPagarNumerico: 0,
            valorEntrada: '',
            diaVencimentoMensal: 15,
            quantidadeParcelas: 1,
            parcelasPagas: arrematante.pago ? 1 : 0,
            mesInicioPagamento: '',
            pago: arrematante.pago || false,
            documentos: [],
            tipoPagamento: 'a_vista' as const
          });
        }
      }
      
      return result;
    }
    
    // Lógica original para arrematantes de leilões normais
    for (const auction of auctions) {
      // Filtrar por arquivado
      if (showArchived ? !auction.arquivado : auction.arquivado) continue;
      
      // Obter arrematantes (novo array ou compatibilidade com antigo)
      const arrematantes = auction.arrematantes || (auction.arrematante ? [auction.arrematante] : []);
      
      if (arrematantes.length === 0) continue;
      
      for (const arrematante of arrematantes) {
        
        // Verificar tipo de pagamento (priorizar arrematante > lote > leilão)
        const loteArrematado = auction?.lotes?.find(lote => lote.id === arrematante.loteId);
        const tipoPagamento = arrematante.tipoPagamento || loteArrematado?.tipoPagamento || auction?.tipoPagamento || "parcelamento";
        
        let statusPagamento: 'pago' | 'pendente' | 'atrasado';
        
        if (arrematante.pago) {
          statusPagamento = 'pago';
        } else if (tipoPagamento === "a_vista") {
          // Lógica para pagamento à vista
          const dataVencimento = loteArrematado?.dataVencimentoVista || auction?.dataVencimentoVista;
          if (dataVencimento) {
            const vencimento = new Date(dataVencimento + 'T23:59:59');
            statusPagamento = now > vencimento ? 'atrasado' : 'pendente';
          } else {
            statusPagamento = 'pendente';
          }
        } else {
          // Lógica para parcelamento
          let proximoPagamento;
          
          if (tipoPagamento === "entrada_parcelamento") {
            proximoPagamento = calculateNextPaymentDateEntradaParcelamento(arrematante, auction);
          } else {
            proximoPagamento = calculateNextPaymentDate(arrematante);
          }
          
          if (!proximoPagamento) {
            statusPagamento = 'pago';
          } else {
            const endOfDueDate = new Date(proximoPagamento);
            endOfDueDate.setHours(23, 59, 59, 999);
            statusPagamento = now > endOfDueDate ? 'atrasado' : 'pendente';
          }
        }

        result.push({
          ...arrematante,
          id: arrematante.id || `${auction.id}-${arrematante.nome}`,
          leilaoNome: auction.nome,
          leilaoId: auction.id,
          dataLeilao: auction.dataInicio,
          statusPagamento
        });
      }
    }
    
    return [...result].sort((a, b) => {
        const _today = new Date();
        
        // Calcular próximas datas de pagamento para comparação
        const aDate = calculateNextPaymentDate(a);
        const bDate = calculateNextPaymentDate(b);
        
        // Se ambos são atrasados, ordenar pelos mais atrasados primeiro (data mais antiga)
        if (a.statusPagamento === 'atrasado' && b.statusPagamento === 'atrasado') {
          if (!aDate || !bDate) return 0;
          return aDate.getTime() - bDate.getTime();
        }
        
        // Se ambos são pendentes, ordenar pela data mais próxima primeiro
        if (a.statusPagamento === 'pendente' && b.statusPagamento === 'pendente') {
          if (!aDate || !bDate) return 0;
          return aDate.getTime() - bDate.getTime();
        }
        
        // Ordem geral: atrasados primeiro, depois pendentes, depois pagos
        const statusOrder = { atrasado: 0, pendente: 1, pago: 2 };
        if (statusOrder[a.statusPagamento] !== statusOrder[b.statusPagamento]) {
          return statusOrder[a.statusPagamento] - statusOrder[b.statusPagamento];
        }
        
        if (!aDate || !bDate) return 0;
        return aDate.getTime() - bDate.getTime();
      });
  };

  // Filtrar arrematantes
  const filteredArrematantes = processedArrematantes().filter(arrematante => {
    const matchesSearch = !searchTerm || 
      arrematante.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      arrematante.leilaoNome.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === "todos" || arrematante.statusPagamento === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  // ⚡ PERFORMANCE: Paginação client-side (50 arrematantes por página)
  const {
    items: paginatedArrematantes,
    currentPage,
    totalPages,
    setPage,
  } = useClientPagination(filteredArrematantes, 50);

  // Contar por status
  const getStatusCount = (status: string) => {
    if (status === "todos") return processedArrematantes().length;
    return processedArrematantes().filter(a => a.statusPagamento === status).length;
  };

  // Função para obter ícone de status
  const getStatusIcon = (status: 'pago' | 'pendente' | 'atrasado') => {
    switch (status) {
      case 'pago':
        return <CheckCircle className="h-4 w-4 text-gray-600" />;
      case 'pendente':
        return <Clock className="h-4 w-4 text-gray-600" />;
      case 'atrasado':
        return <AlertCircle className="h-4 w-4 text-gray-600" />;
    }
  };

  // Função para obter badge de status
  const getStatusBadge = (status: 'pago' | 'pendente' | 'atrasado') => {
    switch (status) {
      case 'pago':
        return <Badge variant="success">Pago</Badge>;
      case 'pendente':
        return <Badge variant="warning">Em Aberto</Badge>;
      case 'atrasado':
        return <Badge variant="destructive">Atrasado</Badge>;
    }
  };

  // Funções para ícones de arquivo
  const getFileIcon = (tipo: string) => {
    if (tipo.startsWith('image/')) return <Image className="h-4 w-4 text-blue-600" />;
    if (tipo.includes('spreadsheet') || tipo.includes('excel')) return <FileSpreadsheet className="h-4 w-4 text-green-600" />;
    if (tipo.includes('pdf')) return <FileText className="h-4 w-4 text-red-600" />;
    return <File className="h-4 w-4 text-gray-600" />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Funções do modal
  const handleViewArrematante = async (arrematante: ArrematanteExtendido) => {
    const auction = auctions.find(a => a.id === arrematante.leilaoId);
    if (auction && auction.arrematantes) {
      const arrematanteNoArray = auction.arrematantes.find(a => a.id === arrematante.id);
      if (arrematanteNoArray) {
      const arrematanteAtualizado = {
        ...arrematante,
          ...arrematanteNoArray,
          documentos: arrematanteNoArray.documentos || []
      };
      setSelectedArrematante(arrematanteAtualizado);
      } else {
        setSelectedArrematante(arrematante);
      }
    } else {
      setSelectedArrematante(arrematante);
    }
    setIsViewModalOpen(true);
    // Log da visualização de detalhes do arrematante
    try {
      await logBidderAction('view', arrematante.nome, arrematante.leilaoNome || '', arrematante.leilaoId, {
        metadata: { status_pago: arrematante.pago }
      });
    } catch { /* silenciar erro de log */ }
  };

  const handleEditArrematante = async (arrematante: ArrematanteExtendido) => {
    const auction = auctions.find(a => a.id === arrematante.leilaoId);
    let arrematanteAtualizado = arrematante;
    
    if (auction && auction.arrematantes) {
      const arrematanteNoArray = auction.arrematantes.find(a => a.id === arrematante.id);
      if (arrematanteNoArray) {
      arrematanteAtualizado = {
        ...arrematante,
          ...arrematanteNoArray,
          documentos: arrematanteNoArray.documentos || []
      };
      }
    }
    
    setSelectedArrematante(arrematanteAtualizado);
    setEditForm({
      nome: arrematanteAtualizado.nome,
      email: arrematanteAtualizado.email || "",
      valorPagar: arrematanteAtualizado.valorPagar,
      documentos: arrematanteAtualizado.documentos || []
    });
    setIsEditModalOpen(true);
    // Log da abertura de edição do arrematante
    try {
      await logBidderAction('open_edit', arrematante.nome, arrematante.leilaoNome || '', arrematante.leilaoId);
    } catch { /* silenciar erro de log */ }
  };

  const handleSaveEdit = async () => {
    if (!selectedArrematante) return;

    const auction = auctions.find(a => a.id === selectedArrematante.leilaoId);
    if (!auction) return;

    setIsSavingEdit(true);

    try {
      // 🔄 Converter documentos blob para base64 se necessário
      const documentosProcessados = await Promise.all(
        editForm.documentos.map(async (doc, _index) => {
          if (doc.url && doc.url.startsWith('blob:')) {
            // Verificar se a URL blob ainda existe no conjunto de URLs gerenciadas
            if (!tempBlobUrlsRef.current.has(doc.url)) {
              tempBlobUrlsRef.current.add(doc.url);
            }
            
            try {
              // Tentar fazer fetch da URL blob
              const response = await fetch(doc.url);
              
              if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
              }
              
              const blob = await response.blob();
              
              if (!blob || blob.size === 0) {
                throw new Error('Blob vazio ou inválido');
              }
              
              const base64 = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                  if (reader.result && typeof reader.result === 'string') {
                    resolve(reader.result);
                  } else {
                    reject(new Error('FileReader retornou resultado inválido'));
                  }
                };
                reader.onerror = () => reject(new Error('Erro no FileReader'));
                reader.readAsDataURL(blob);
              });
              
              // Limpar a URL blob após conversão bem-sucedida
              if (tempBlobUrlsRef.current.has(doc.url)) {
                URL.revokeObjectURL(doc.url);
                tempBlobUrlsRef.current.delete(doc.url);
              }
              
              return { ...doc, url: base64 };
            } catch (_error) {
              // Tentar limpar a URL mesmo com erro
              if (tempBlobUrlsRef.current.has(doc.url)) {
                try {
                  URL.revokeObjectURL(doc.url);
                  tempBlobUrlsRef.current.delete(doc.url);
                } catch (_cleanupError) {
                  // Erro silencioso ao limpar
                }
              }
              
              return { ...doc, url: null }; // Definir URL como null se conversão falhou
            }
          } else if (doc.url && doc.url.startsWith('data:')) {
            return doc;
          } else {
            return doc;
          }
        })
      );

      // Buscar o lote para copiar as datas de pagamento
      const loteArrematado = auction?.lotes?.find(lote => lote.id === selectedArrematante.loteId);

      // Atualizar arrematante específico no array
      const arrematantes = auction.arrematantes || (auction.arrematante ? [auction.arrematante] : []);
      const arrematanteAtualizado = {
        id: selectedArrematante.id,
          nome: editForm.nome,
          email: editForm.email,
        documento: selectedArrematante.documento || "",
        endereco: selectedArrematante.endereco || "",
          telefone: selectedArrematante.telefone,
          loteId: selectedArrematante.loteId,
          valorPagar: editForm.valorPagar,
          valorPagarNumerico: parseFloat(editForm.valorPagar.replace(/[R$\s.]/g, '').replace(',', '.')) || 0,
        valorEntrada: selectedArrematante.valorEntrada,
          diaVencimentoMensal: selectedArrematante.diaVencimentoMensal,
          quantidadeParcelas: selectedArrematante.quantidadeParcelas,
          parcelasPagas: selectedArrematante.parcelasPagas,
          mesInicioPagamento: selectedArrematante.mesInicioPagamento,
        dataEntrada: loteArrematado?.dataEntrada || selectedArrematante.dataEntrada,
        dataVencimentoVista: loteArrematado?.dataVencimentoVista || selectedArrematante.dataVencimentoVista,
          pago: selectedArrematante.pago,
        percentualJurosAtraso: selectedArrematante.percentualJurosAtraso,
        tipoJurosAtraso: selectedArrematante.tipoJurosAtraso,
          documentos: documentosProcessados
      };
      
      const arrematantesAtualizados = arrematantes.map(a => 
        a.id === selectedArrematante.id || (!a.id && a.nome === selectedArrematante.nome) 
          ? arrematanteAtualizado 
          : a
      );

      const updateData: Partial<Auction> = {
        arrematantes: arrematantesAtualizados
      };

      // 🔄 SINCRONIZAÇÃO BIDIRECIONAL: Verificar se devemos atualizar os padrões do leilão
      const shouldSyncToAuction = 
        selectedArrematante.diaVencimentoMensal !== auction.diaVencimentoPadrao ||
        selectedArrematante.quantidadeParcelas !== auction.parcelasPadrao ||
        selectedArrematante.mesInicioPagamento !== auction.mesInicioPagamento;

      if (shouldSyncToAuction) {
        updateData.diaVencimentoPadrao = selectedArrematante.diaVencimentoMensal;
        updateData.parcelasPadrao = selectedArrematante.quantidadeParcelas;
        updateData.mesInicioPagamento = selectedArrematante.mesInicioPagamento;
        
        // Disparar evento para notificar formulário do leilão sobre mudanças
        window.dispatchEvent(new CustomEvent('arrematanteFormChanged', {
          detail: {
            auctionId: auction.id,
            changes: {
              diaVencimentoPadrao: selectedArrematante.diaVencimentoMensal,
              parcelasPadrao: selectedArrematante.quantidadeParcelas,
              mesInicioPagamento: selectedArrematante.mesInicioPagamento
            }
          }
        }));

      }

      // Fechar modal imediatamente (atualização otimista)
      setIsEditModalOpen(false);
      
      // Atualizar no banco de dados em background
      await updateAuction({
        id: auction.id,
        data: updateData
      });

      // Log da edição rápida do arrematante
      try {
        await logBidderAction('update', selectedArrematante.nome, selectedArrematante.leilaoNome || '', selectedArrematante.leilaoId, {
          metadata: { edit_type: 'quick_edit' }
        });
      } catch { /* silenciar erro de log */ }
    } catch (_error) {
      logger.error('Erro ao salvar:', _error);
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Funções para upload de documentos
  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    const maxFiles = 20;
    if (files.length > maxFiles) {
      event.target.value = '';
      return;
    }

    const novosDocumentos: DocumentoInfo[] = [];
    const erros: string[] = [];

    for (const file of Array.from(files)) {
      try {
        // 🔒 VALIDAÇÃO
        const maxSize = 20 * 1024 * 1024;
        if (file.size > maxSize) throw new Error(`Arquivo muito grande (máx. 20MB)`);
        if (file.size === 0) throw new Error(`Arquivo vazio`);

        const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_').replace(/\.{2,}/g, '_').substring(0, 255);
        const blobUrl = URL.createObjectURL(file);
        const novoDocumento: DocumentoInfo = {
          id: crypto.randomUUID(),
          nome: safeName,
          tipo: file.type,
          tamanho: file.size,
          dataUpload: new Date().toISOString(),
          url: blobUrl
        };
        
        tempBlobUrlsRef.current.add(blobUrl);
        novosDocumentos.push(novoDocumento);
      } catch (error) {
        erros.push(`${file.name}: ${error instanceof Error ? error.message : 'Erro'}`);
      }
    }

    if (novosDocumentos.length > 0) {
      setEditForm(prev => ({
        ...prev,
        documentos: [...prev.documentos, ...novosDocumentos]
      }));
      syncDocumentsToDetails(novosDocumentos, 'add');
      // Log do upload de documentos
      for (const doc of novosDocumentos) {
        try {
          logDocumentAction('upload', doc.nome, 'bidder', selectedArrematante?.nome || '', selectedArrematante?.leilaoId || '');
        } catch { /* silenciar erro de log */ }
      }
    }

    if (erros.length > 0) {
      logger.warn('Alguns arquivos foram rejeitados:', erros);
    }

    event.target.value = '';
  }, [syncDocumentsToDetails]);

  const handleRemoveDocument = useCallback((id: string) => {
    const docToRemove = editForm.documentos.find(doc => doc.id === id);
    
    if (docToRemove?.url && docToRemove.url.startsWith('blob:') && tempBlobUrlsRef.current.has(docToRemove.url)) {
      try {
        URL.revokeObjectURL(docToRemove.url);
        tempBlobUrlsRef.current.delete(docToRemove.url);
      } catch (_error) {
        // Erro silencioso ao revogar
      }
    }
    
    setEditForm(prev => ({
      ...prev,
      documentos: prev.documentos.filter(doc => doc.id !== id)
    }));

    syncDocumentsToDetails([], 'remove', id);
    // Log da remoção de documento
    if (docToRemove) {
      try {
        logDocumentAction('delete', docToRemove.nome, 'bidder', selectedArrematante?.nome || '', selectedArrematante?.leilaoId || '');
      } catch { /* silenciar erro de log */ }
    }
  }, [editForm.documentos, syncDocumentsToDetails, logDocumentAction, selectedArrematante]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const files = Array.from(e.dataTransfer.files);
    const novosDocumentos: DocumentoInfo[] = [];

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
      novosDocumentos.push(novoDocumento);
    });

    // Atualizar formulário primeiro
    setEditForm(prev => ({
      ...prev,
      documentos: [...prev.documentos, ...novosDocumentos]
    }));

    // 🔄 SINCRONIZAÇÃO ROBUSTA com debounce
    syncDocumentsToDetails(novosDocumentos, 'add');
  }, [syncDocumentsToDetails]);

  // Funções para upload de documentos no modal completo
  const handleFullEditFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    const maxFiles = 20;
    if (files.length > maxFiles) {
      event.target.value = '';
      return;
    }

    const novosDocumentos: DocumentoInfo[] = [];
    const erros: string[] = [];

    for (const file of Array.from(files)) {
      try {
        const maxSize = 20 * 1024 * 1024;
        if (file.size > maxSize) throw new Error(`Muito grande (máx. 20MB)`);
        if (file.size === 0) throw new Error(`Arquivo vazio`);

        const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_').replace(/\.{2,}/g, '_').substring(0, 255);
        const blobUrl = URL.createObjectURL(file);
        const novoDocumento: DocumentoInfo = {
          id: crypto.randomUUID(),
          nome: safeName,
          tipo: file.type,
          tamanho: file.size,
          dataUpload: new Date().toISOString(),
          url: blobUrl
        };
        
        tempBlobUrlsRef.current.add(blobUrl);
        novosDocumentos.push(novoDocumento);
      } catch (error) {
        erros.push(`${file.name}: ${error instanceof Error ? error.message : 'Erro'}`);
      }
    }

    if (novosDocumentos.length > 0) {
      setFullEditForm(prev => ({
        ...prev,
        documentos: [...prev.documentos, ...novosDocumentos]
      }));
      syncDocumentsToDetails(novosDocumentos, 'add');
      // Log do upload de documentos (full edit)
      for (const doc of novosDocumentos) {
        try {
          logDocumentAction('upload', doc.nome, 'bidder', selectedArrematante?.nome || '', selectedArrematante?.leilaoId || '');
        } catch { /* silenciar erro de log */ }
      }
    }

    if (erros.length > 0) {
      logger.warn('Alguns arquivos foram rejeitados:', erros);
    }

    event.target.value = '';
  }, [syncDocumentsToDetails]);

  const handleRemoveFullEditDocument = useCallback((id: string) => {
    // Encontrar e limpar a blob URL do documento que será removido
    const docToRemove = fullEditForm.documentos.find(doc => doc.id === id);
    
    // Cleanup da URL blob
    if (docToRemove?.url && docToRemove.url.startsWith('blob:') && tempBlobUrlsRef.current.has(docToRemove.url)) {
      try {
        URL.revokeObjectURL(docToRemove.url);
        tempBlobUrlsRef.current.delete(docToRemove.url);
      } catch (_error) {
        // Erro silencioso ao revogar
      }
    }
    
    setFullEditForm(prev => ({
      ...prev,
      documentos: prev.documentos.filter(doc => doc.id !== id)
    }));

    syncDocumentsToDetails([], 'remove', id);
    // Log da remoção de documento (full edit)
    if (docToRemove) {
      try {
        logDocumentAction('delete', docToRemove.nome, 'bidder', selectedArrematante?.nome || '', selectedArrematante?.leilaoId || '');
      } catch { /* silenciar erro de log */ }
    }
  }, [fullEditForm.documentos, syncDocumentsToDetails, logDocumentAction, selectedArrematante]);

  const handleFullEditDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const files = Array.from(e.dataTransfer.files);
    const novosDocumentos: DocumentoInfo[] = [];

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
      novosDocumentos.push(novoDocumento);
    });

    // Atualizar formulário completo primeiro
    setFullEditForm(prev => ({
      ...prev,
      documentos: [...prev.documentos, ...novosDocumentos]
    }));

    // 🔄 SINCRONIZAÇÃO ROBUSTA com debounce
    syncDocumentsToDetails(novosDocumentos, 'add');
  }, [syncDocumentsToDetails]);

  // Função para calcular juros progressivos mês a mês
  const calcularJurosProgressivos = (valorOriginal: number, percentualJuros: number, mesesAtraso: number) => {
    if (mesesAtraso < 1 || !percentualJuros) {
      return valorOriginal;
    }

    let valorAtual = valorOriginal;
    const taxaMensal = percentualJuros / 100;
    
    // Aplicar juros mês a mês de forma progressiva
    for (let mes = 1; mes <= mesesAtraso; mes++) {
      const jurosMes = valorAtual * taxaMensal;
      valorAtual = valorAtual + jurosMes;
    }
    
    return Math.round(valorAtual * 100) / 100;
  };

  // Função para calcular juros compostos em parcelas atrasadas
  const calcularJurosAtraso = (arrematante: ArrematanteInfo, auction: Auction, valorParcela: number) => {
    const percentualJuros = (arrematante.percentualJurosAtraso || 0) / 100; // Converter % para decimal
    
    if (percentualJuros === 0) {
      return { valorComJuros: valorParcela, mesesAtraso: 0 };
    }

    const now = new Date();
    const loteArrematado = auction?.lotes?.find((lote: LoteInfo) => lote.id === arrematante.loteId);
    const tipoPagamento = arrematante.tipoPagamento || loteArrematado?.tipoPagamento || auction?.tipoPagamento || "parcelamento";
    
    // Para entrada_parcelamento, verificar se é entrada ou parcela mensal
    if (tipoPagamento === "entrada_parcelamento" && loteArrematado?.dataEntrada) {
      const dataEntrada = new Date(loteArrematado.dataEntrada + 'T23:59:59');
      if (now > dataEntrada) {
        // Calcular meses de atraso da entrada
        const mesesAtraso = Math.max(0, Math.floor((now.getTime() - dataEntrada.getTime()) / (1000 * 60 * 60 * 24 * 30)));
        if (mesesAtraso >= 1) {
          const valorComJuros = calcularJurosProgressivos(valorParcela, arrematante.percentualJurosAtraso || 0, mesesAtraso);
          return { valorComJuros, mesesAtraso };
        }
      }
    }

    // Para parcelas mensais (entrada_parcelamento ou parcelamento simples)
    if (arrematante.mesInicioPagamento && arrematante.diaVencimentoMensal) {
      const [startYear, startMonth] = arrematante.mesInicioPagamento.split('-').map(Number);
      const parcelasPagas = arrematante.parcelasPagas || 0;
      const quantidadeParcelas = arrematante.quantidadeParcelas || 1;
      
      // Para entrada_parcelamento, ajustar índice das parcelas
      const parcelasEfetivasPagas = tipoPagamento === "entrada_parcelamento" ? 
        Math.max(0, parcelasPagas - 1) : parcelasPagas;
      
      // Verificar cada parcela atrasada
      for (let i = parcelasEfetivasPagas; i < quantidadeParcelas; i++) {
        const parcelaDate = calcularDataComAjusteEHorario(startYear, startMonth - 1 + i, arrematante.diaVencimentoMensal, 23, 59, 59);
        if (now > parcelaDate) {
          const mesesAtraso = Math.max(0, Math.floor((now.getTime() - parcelaDate.getTime()) / (1000 * 60 * 60 * 24 * 30)));
          if (mesesAtraso >= 1) {
            const valorComJuros = calcularJurosProgressivos(valorParcela, arrematante.percentualJurosAtraso || 0, mesesAtraso);
            return { valorComJuros, mesesAtraso };
          }
        }
      }
    }

    // Se não há atraso de pelo menos 1 mês, retorna valor original
    return { valorComJuros: valorParcela, mesesAtraso: 0 };
  };

  // Função para calcular o valor total com juros das parcelas atrasadas
  const calcularValorTotalComJuros = (arrematante: ArrematanteExtendido) => {
    const auction = auctions.find(a => a.id === arrematante.leilaoId);
    if (!auction) {
      return obterValorTotalArrematante({
        usaFatorMultiplicador: arrematante?.usaFatorMultiplicador,
        valorLance: arrematante?.valorLance,
        fatorMultiplicador: arrematante?.fatorMultiplicador,
        valorPagarNumerico: arrematante.valorPagarNumerico || 0,
        percentualComissaoLeiloeiro: arrematante?.percentualComissaoLeiloeiro
      }, undefined); // auction não disponível aqui, usar comissão do arrematante
    }

    const loteArrematado = auction?.lotes?.find((lote: LoteInfo) => lote.id === arrematante.loteId);
    const tipoPagamento = arrematante.tipoPagamento || loteArrematado?.tipoPagamento || auction?.tipoPagamento || "parcelamento";
    
    // NOVO: Usar função que considera fator multiplicador e comissão do leiloeiro
    const valorTotal = obterValorTotalArrematante({
      usaFatorMultiplicador: arrematante?.usaFatorMultiplicador,
      valorLance: arrematante?.valorLance,
      fatorMultiplicador: arrematante?.fatorMultiplicador || loteArrematado?.fatorMultiplicador,
      valorPagarNumerico: arrematante.valorPagarNumerico || 0,
      percentualComissaoLeiloeiro: arrematante?.percentualComissaoLeiloeiro
    }, auction.percentualComissaoLeiloeiro);
    
    const now = new Date();
    const parcelasPagas = arrematante.parcelasPagas || 0;

    // 🔧 CORRIGIDO: Calcular valor total considerando juros das parcelas PAGAS (não pendentes)
    // Quando pago === true, calcular o valor real que foi pago com juros

    // À vista - calcular com juros se foi pago com atraso ou se está atrasado
    if (tipoPagamento === "a_vista") {
      // Se foi pago (parcelasPagas > 0), calcular com juros se estava atrasado
      if (parcelasPagas > 0 || arrematante.pago) {
        const dataVencimento = loteArrematado?.dataVencimentoVista || auction?.dataVencimentoVista;
        if (dataVencimento && arrematante.percentualJurosAtraso) {
          const vencimentoDate = new Date(dataVencimento + 'T23:59:59');
          if (now > vencimentoDate) {
            const mesesAtraso = Math.max(0, Math.floor((now.getTime() - vencimentoDate.getTime()) / (1000 * 60 * 60 * 24 * 30)));
            if (mesesAtraso >= 1) {
              return calcularJurosProgressivos(valorTotal, arrematante.percentualJurosAtraso, mesesAtraso);
            }
          }
        }
        return valorTotal;
      }
      
      // Se ainda não foi pago, calcular juros futuros se estiver atrasado
      const dataVencimento = loteArrematado?.dataVencimentoVista || auction?.dataVencimentoVista;
      if (!dataVencimento) return valorTotal;
      
      const vencimentoDate = new Date(dataVencimento + 'T23:59:59');
      if (now > vencimentoDate) {
        const mesesAtraso = Math.max(0, Math.floor((now.getTime() - vencimentoDate.getTime()) / (1000 * 60 * 60 * 24 * 30)));
        if (mesesAtraso >= 1) {
          return calcularJurosProgressivos(valorTotal, arrematante.percentualJurosAtraso || 0, mesesAtraso);
        }
      }
      return valorTotal;
    }

    // Entrada + Parcelamento (entrada e parcelas são INDEPENDENTES)
    if (tipoPagamento === "entrada_parcelamento") {
      const valorEntrada = arrematante.valorEntrada ? 
        (typeof arrematante.valorEntrada === 'string' ? 
          parseFloat(arrematante.valorEntrada.replace(/[^\d.,]/g, '').replace(/\./g, '').replace(',', '.')) : 
          arrematante.valorEntrada) : 
        valorTotal * 0.3;
      const quantidadeParcelas = arrematante.quantidadeParcelas || 12;
      // ✅ Valor da parcela = valorTotal / quantidade (SEM subtrair entrada)
      const valorPorParcela = Math.round((valorTotal / quantidadeParcelas) * 100) / 100;
      
      let valorTotalCalculado = 0;
      
      // 🔧 Se está totalmente pago, calcular o valor real que foi pago (com juros)
      if (arrematante.pago || parcelasPagas > 0) {
        // Calcular entrada com juros se foi paga com atraso
        if (parcelasPagas >= 1) {
          if (loteArrematado?.dataEntrada && arrematante.percentualJurosAtraso) {
            const dataEntrada = new Date(loteArrematado.dataEntrada + 'T23:59:59');
            if (now > dataEntrada) {
              const mesesAtraso = Math.max(0, Math.floor((now.getTime() - dataEntrada.getTime()) / (1000 * 60 * 60 * 24 * 30)));
              if (mesesAtraso >= 1) {
                valorTotalCalculado += calcularJurosProgressivos(valorEntrada, arrematante.percentualJurosAtraso, mesesAtraso);
              } else {
                valorTotalCalculado += valorEntrada;
              }
            } else {
              valorTotalCalculado += valorEntrada;
            }
          } else {
            valorTotalCalculado += valorEntrada;
          }
          
          // Calcular parcelas PAGAS com juros
          const parcelasEfetivasPagas = Math.max(0, parcelasPagas - 1);
          if (parcelasEfetivasPagas > 0 && arrematante.mesInicioPagamento && arrematante.diaVencimentoMensal) {
            const [startYear, startMonth] = arrematante.mesInicioPagamento.split('-').map(Number);
            
            for (let i = 0; i < parcelasEfetivasPagas; i++) {
              const parcelaDate = calcularDataComAjusteEHorario(startYear, startMonth - 1 + i, arrematante.diaVencimentoMensal, 23, 59, 59);
              if (now > parcelaDate && arrematante.percentualJurosAtraso) {
                const mesesAtraso = Math.max(0, Math.floor((now.getTime() - parcelaDate.getTime()) / (1000 * 60 * 60 * 24 * 30)));
                if (mesesAtraso >= 1) {
                  valorTotalCalculado += calcularJurosProgressivos(valorPorParcela, arrematante.percentualJurosAtraso, mesesAtraso);
                } else {
                  valorTotalCalculado += valorPorParcela;
                }
              } else {
                valorTotalCalculado += valorPorParcela;
              }
            }
          } else {
            valorTotalCalculado += parcelasEfetivasPagas * valorPorParcela;
          }
          
          // Se totalmente pago, adicionar as parcelas restantes
          if (arrematante.pago) {
            const parcelasFaltantes = quantidadeParcelas - parcelasEfetivasPagas;
            if (parcelasFaltantes > 0 && arrematante.mesInicioPagamento && arrematante.diaVencimentoMensal) {
              const [startYear, startMonth] = arrematante.mesInicioPagamento.split('-').map(Number);
              
              for (let i = parcelasEfetivasPagas; i < quantidadeParcelas; i++) {
                const parcelaDate = calcularDataComAjusteEHorario(startYear, startMonth - 1 + i, arrematante.diaVencimentoMensal, 23, 59, 59);
                if (now > parcelaDate && arrematante.percentualJurosAtraso) {
                  const mesesAtraso = Math.max(0, Math.floor((now.getTime() - parcelaDate.getTime()) / (1000 * 60 * 60 * 24 * 30)));
                  if (mesesAtraso >= 1) {
                    valorTotalCalculado += calcularJurosProgressivos(valorPorParcela, arrematante.percentualJurosAtraso, mesesAtraso);
                  } else {
                    valorTotalCalculado += valorPorParcela;
                  }
                } else {
                  valorTotalCalculado += valorPorParcela;
                }
              }
            } else {
              valorTotalCalculado += parcelasFaltantes * valorPorParcela;
            }
          }
        }
        
        // ✅ Retorna o valor total já calculado (entrada + parcelas pagas/total com juros)
        return Math.round(valorTotalCalculado * 100) / 100;
      }
      
      // Se NÃO está pago, calcular valor futuro com juros das parcelas atrasadas
      const valorTotalComJuros = valorTotal;
      let jurosAcumulados = 0;
      
      // Verificar se entrada está atrasada
      if (parcelasPagas === 0 && loteArrematado?.dataEntrada) {
        const dataEntrada = new Date(loteArrematado.dataEntrada + 'T23:59:59');
        if (now > dataEntrada) {
          const mesesAtraso = Math.max(0, Math.floor((now.getTime() - dataEntrada.getTime()) / (1000 * 60 * 60 * 24 * 30)));
          if (mesesAtraso >= 1) {
            const valorEntradaComJuros = calcularJurosProgressivos(valorEntrada, arrematante.percentualJurosAtraso || 0, mesesAtraso);
            jurosAcumulados += (valorEntradaComJuros - valorEntrada);
          }
        }
      }
      
      // Verificar parcelas mensais atrasadas (não pagas)
      if (arrematante.mesInicioPagamento && arrematante.diaVencimentoMensal) {
        const [startYear, startMonth] = arrematante.mesInicioPagamento.split('-').map(Number);
        const parcelasEfetivasPagas = Math.max(0, parcelasPagas - 1);
        
        for (let i = 0; i < quantidadeParcelas; i++) {
          const parcelaDate = calcularDataComAjusteEHorario(startYear, startMonth - 1 + i, arrematante.diaVencimentoMensal, 23, 59, 59);
          if (now > parcelaDate && i >= parcelasEfetivasPagas) {
            const mesesAtraso = Math.max(0, Math.floor((now.getTime() - parcelaDate.getTime()) / (1000 * 60 * 60 * 24 * 30)));
            if (mesesAtraso >= 1) {
              const valorParcelaComJuros = calcularJurosProgressivos(valorPorParcela, arrematante.percentualJurosAtraso || 0, mesesAtraso);
              jurosAcumulados += (valorParcelaComJuros - valorPorParcela);
            }
          }
        }
      }
      
      // ✅ TOTAL = valor das parcelas + entrada + juros acumulados
      return Math.round((valorTotalComJuros + valorEntrada + jurosAcumulados) * 100) / 100;
    }

    // Parcelamento simples
    if (tipoPagamento === "parcelamento") {
      const quantidadeParcelas = arrematante.quantidadeParcelas || 1;
      const valorPorParcela = valorTotal / quantidadeParcelas;
      
      // 🔧 Se está totalmente pago ou tem parcelas pagas, calcular o valor real que foi pago (com juros)
      if (arrematante.pago || parcelasPagas > 0) {
        let valorTotalCalculado = 0;
        
        if (arrematante.mesInicioPagamento && arrematante.diaVencimentoMensal) {
          const [startYear, startMonth] = arrematante.mesInicioPagamento.split('-').map(Number);
          
          // Calcular TODAS as parcelas (se pago) ou apenas as pagas
          const parcelasParaCalcular = arrematante.pago ? quantidadeParcelas : parcelasPagas;
          
          for (let i = 0; i < parcelasParaCalcular; i++) {
            const parcelaDate = calcularDataComAjusteEHorario(startYear, startMonth - 1 + i, arrematante.diaVencimentoMensal, 23, 59, 59);
            if (now > parcelaDate && arrematante.percentualJurosAtraso) {
              const mesesAtraso = Math.max(0, Math.floor((now.getTime() - parcelaDate.getTime()) / (1000 * 60 * 60 * 24 * 30)));
              if (mesesAtraso >= 1) {
                const valorComJuros = calcularJurosProgressivos(valorPorParcela, arrematante.percentualJurosAtraso, mesesAtraso);
                valorTotalCalculado += valorComJuros;
              } else {
                valorTotalCalculado += valorPorParcela;
              }
            } else {
              valorTotalCalculado += valorPorParcela;
            }
          }
        } else {
          // Sem datas configuradas, usar valor simples
          const parcelasParaCalcular = arrematante.pago ? quantidadeParcelas : parcelasPagas;
          valorTotalCalculado = parcelasParaCalcular * valorPorParcela;
        }
        
        return Math.round(valorTotalCalculado * 100) / 100;
      }
      
      // Se NÃO está pago, calcular valor futuro com juros das parcelas atrasadas
      const valorTotalComJuros = valorTotal;
      let jurosAcumulados = 0;
      
      if (arrematante.mesInicioPagamento && arrematante.diaVencimentoMensal) {
        const [startYear, startMonth] = arrematante.mesInicioPagamento.split('-').map(Number);
        
        for (let i = parcelasPagas; i < quantidadeParcelas; i++) {
          const parcelaDate = calcularDataComAjusteEHorario(startYear, startMonth - 1 + i, arrematante.diaVencimentoMensal, 23, 59, 59);
          if (now > parcelaDate) {
            const mesesAtraso = Math.max(0, Math.floor((now.getTime() - parcelaDate.getTime()) / (1000 * 60 * 60 * 24 * 30)));
            if (mesesAtraso >= 1) {
              const valorParcelaComJuros = calcularJurosProgressivos(valorPorParcela, arrematante.percentualJurosAtraso || 0, mesesAtraso);
              jurosAcumulados += (valorParcelaComJuros - valorPorParcela);
            }
          }
        }
      }
      
      return Math.round((valorTotalComJuros + jurosAcumulados) * 100) / 100;
    }

    return valorTotal;
  };

  // Calcular estatísticas
  const stats = {
    total: processedArrematantes().length,
    pago: processedArrematantes().filter(a => a.statusPagamento === 'pago').length,
    pendente: processedArrematantes().filter(a => a.statusPagamento === 'pendente').length,
    atrasado: processedArrematantes().filter(a => a.statusPagamento === 'atrasado').length,
    totalPagamentosRealizados: processedArrematantes()
      .reduce((sum, a) => {
        const auction = auctions.find(auction => auction.id === a.leilaoId);
        if (!auction || !auction.arrematante) return sum;
        
        const arrematante = auction.arrematante;
        const parcelasPagas = arrematante.parcelasPagas || 0;
        
        return sum + parcelasPagas;
      }, 0),
    totalReceita: processedArrematantes()
      .reduce((sum, a) => {
        const auction = auctions.find(auction => auction.id === a.leilaoId);
        if (!auction || !auction.arrematante) return sum;
        
        const arrematante = auction.arrematante;
        const loteArrematado = auction.lotes?.find(lote => lote.id === arrematante.loteId);
        const tipoPagamento = arrematante.tipoPagamento || loteArrematado?.tipoPagamento || auction.tipoPagamento || "parcelamento";
        const valorTotal = a.valorPagarNumerico || 0;
        const parcelasPagas = arrematante.parcelasPagas || 0;
        const now = new Date();
        
        if (parcelasPagas === 0) return sum; // Nenhum pagamento realizado
        
        if (tipoPagamento === "a_vista") {
          // Para à vista, se tem parcela paga, calcular com juros se estava atrasado
          if (parcelasPagas > 0) {
            const dataVencimento = loteArrematado?.dataVencimentoVista || auction?.dataVencimentoVista;
            if (dataVencimento && arrematante?.percentualJurosAtraso) {
              const vencimento = new Date(dataVencimento + 'T23:59:59');
              if (now > vencimento) {
                const mesesAtraso = Math.max(0, Math.floor((now.getTime() - vencimento.getTime()) / (1000 * 60 * 60 * 24 * 30)));
                if (mesesAtraso >= 1) {
                  return sum + calcularJurosProgressivos(valorTotal, arrematante.percentualJurosAtraso, mesesAtraso);
                }
              }
            }
            return sum + valorTotal;
          }
          return sum;
        } else if (tipoPagamento === "entrada_parcelamento") {
          // Para entrada + parcelamento - usar estrutura real de parcelas
          const valorEntrada = arrematante.valorEntrada ? 
            (typeof arrematante.valorEntrada === 'string' ? 
              parseFloat(arrematante.valorEntrada.replace(/[^\d.,]/g, '').replace(/\./g, '').replace(',', '.')) : 
              arrematante.valorEntrada) : 
            valorTotal * 0.3;
          const _quantidadeParcelas = arrematante.quantidadeParcelas || 12;
          
          // ✅ CORREÇÃO: Calcular estrutura apenas sobre o valor das parcelas (SEM entrada)
          const valorParaParcelas = valorTotal - valorEntrada;
          const estruturaParcelas = calcularEstruturaParcelas(
            valorParaParcelas,
            arrematante?.parcelasTriplas || 0,
            arrematante?.parcelasDuplas || 0,
            arrematante?.parcelasSimples || 0
          );
          
          console.log('📊 [Arrematantes - calcFinanceiro - totalPago]', {
            arrematante: arrematante.nome,
            valorTotal,
            valorEntrada,
            valorParaParcelas,
            estruturaParcelas,
            parcelasTriplas: arrematante?.parcelasTriplas,
            parcelasDuplas: arrematante?.parcelasDuplas,
            parcelasSimples: arrematante?.parcelasSimples
          });
          
          let valorRecebido = 0;
          if (parcelasPagas >= 1) {
            // Entrada paga - calcular com juros se estava atrasada
            if (loteArrematado?.dataEntrada && arrematante?.percentualJurosAtraso) {
              const dataEntrada = new Date(loteArrematado.dataEntrada + 'T23:59:59');
              if (now > dataEntrada) {
                const mesesAtraso = Math.max(0, Math.floor((now.getTime() - dataEntrada.getTime()) / (1000 * 60 * 60 * 24 * 30)));
                if (mesesAtraso >= 1) {
                  valorRecebido += calcularJurosProgressivos(valorEntrada, arrematante.percentualJurosAtraso, mesesAtraso);
                } else {
                  valorRecebido += valorEntrada;
                }
              } else {
                valorRecebido += valorEntrada;
              }
            } else {
              valorRecebido += valorEntrada;
            }
            
            // Parcelas mensais pagas - calcular cada uma com estrutura real (juros se atrasadas)
            const parcelasMensaisPagas = Math.max(0, parcelasPagas - 1);
            if (parcelasMensaisPagas > 0 && arrematante?.mesInicioPagamento && arrematante?.diaVencimentoMensal) {
              const [startYear, startMonth] = arrematante.mesInicioPagamento.split('-').map(Number);
              
              for (let i = 0; i < parcelasMensaisPagas; i++) {
                const valorDaParcela = estruturaParcelas[i]?.valor || 0;
                const parcelaDate = calcularDataComAjusteEHorario(startYear, startMonth - 1 + i, arrematante.diaVencimentoMensal, 23, 59, 59);
                if (now > parcelaDate && arrematante?.percentualJurosAtraso) {
                  const mesesAtraso = Math.max(0, Math.floor((now.getTime() - parcelaDate.getTime()) / (1000 * 60 * 60 * 24 * 30)));
                  if (mesesAtraso >= 1) {
                    valorRecebido += calcularJurosProgressivos(valorDaParcela, arrematante.percentualJurosAtraso, mesesAtraso);
                  } else {
                    valorRecebido += valorDaParcela;
                  }
                } else {
                  valorRecebido += valorDaParcela;
                }
              }
            } else {
              // Somar o valor real de cada parcela paga
              for (let i = 0; i < parcelasMensaisPagas; i++) {
                valorRecebido += estruturaParcelas[i]?.valor || 0;
              }
            }
          }
          
          return sum + valorRecebido;
        } else {
          // Para parcelamento simples, calcular parcelas pagas com estrutura real
          const _quantidadeParcelas = arrematante.quantidadeParcelas || 1;
          
          // Calcular estrutura real de parcelas
          const estruturaParcelas = calcularEstruturaParcelas(
            valorTotal,
            arrematante?.parcelasTriplas || 0,
            arrematante?.parcelasDuplas || 0,
            arrematante?.parcelasSimples || 0
          );
          
          let valorRecebido = 0;
          if (arrematante?.mesInicioPagamento && arrematante?.diaVencimentoMensal && arrematante?.percentualJurosAtraso) {
            const [startYear, startMonth] = arrematante.mesInicioPagamento.split('-').map(Number);
            
            for (let i = 0; i < parcelasPagas; i++) {
              const valorDaParcela = estruturaParcelas[i]?.valor || 0;
              const parcelaDate = calcularDataComAjusteEHorario(startYear, startMonth - 1 + i, arrematante.diaVencimentoMensal, 23, 59, 59);
              if (now > parcelaDate) {
                const mesesAtraso = Math.max(0, Math.floor((now.getTime() - parcelaDate.getTime()) / (1000 * 60 * 60 * 24 * 30)));
                if (mesesAtraso >= 1) {
                  valorRecebido += calcularJurosProgressivos(valorDaParcela, arrematante.percentualJurosAtraso, mesesAtraso);
                } else {
                  valorRecebido += valorDaParcela;
                }
              } else {
                valorRecebido += valorDaParcela;
              }
            }
          } else {
            // Somar o valor real de cada parcela paga
            for (let i = 0; i < parcelasPagas; i++) {
              valorRecebido += estruturaParcelas[i]?.valor || 0;
            }
          }
          
          return sum + valorRecebido;
        }
      }, 0),
    totalPendente: processedArrematantes()
      .filter(a => a.statusPagamento === 'pendente') // Apenas arrematantes com status pendente
      .reduce((sum, a) => {
        // Calcular valor das parcelas pendentes (dentro do prazo)
        const auction = auctions.find(auction => auction.id === a.leilaoId);
        if (!auction || !auction.arrematante) return sum;
        
        const arrematante = auction.arrematante;
        const loteArrematado = auction.lotes?.find(lote => lote.id === arrematante.loteId);
        const tipoPagamento = arrematante.tipoPagamento || loteArrematado?.tipoPagamento || auction.tipoPagamento || "parcelamento";
        const now = new Date();
        
        if (tipoPagamento === "a_vista") {
          // Para à vista, retornar valor completo (sem juros pois ainda não venceu)
          return sum + (a.valorPagarNumerico || 0);
        } else if (tipoPagamento === "entrada_parcelamento") {
          // Para entrada + parcelamento - usar estrutura real de parcelas
          const valorTotal = a.valorPagarNumerico || 0;
          const valorEntrada = arrematante.valorEntrada ? 
            (typeof arrematante.valorEntrada === 'string' ? 
              parseFloat(arrematante.valorEntrada.replace(/[^\d.,]/g, '').replace(/\./g, '').replace(',', '.')) : 
              arrematante.valorEntrada) : 
            valorTotal * 0.3;
          const quantidadeParcelas = arrematante.quantidadeParcelas || 12;
          
          // ✅ CORREÇÃO: Calcular estrutura apenas sobre o valor das parcelas (SEM entrada)
          const valorParaParcelas = valorTotal - valorEntrada;
          const estruturaParcelas = calcularEstruturaParcelas(
            valorParaParcelas,
            arrematante?.parcelasTriplas || 0,
            arrematante?.parcelasDuplas || 0,
            arrematante?.parcelasSimples || 0
          );
          
          console.log('📊 [Arrematantes - calcFinanceiro - totalPendente]', {
            arrematante: arrematante.nome,
            valorTotal,
            valorEntrada,
            valorParaParcelas,
            estruturaParcelas,
            parcelasTriplas: arrematante?.parcelasTriplas,
            parcelasDuplas: arrematante?.parcelasDuplas,
            parcelasSimples: arrematante?.parcelasSimples
          });
          
          const parcelasPagas = arrematante.parcelasPagas || 0;
          
          let valorPendente = 0;
          
          // Verificar entrada se não foi paga
          if (parcelasPagas === 0 && loteArrematado?.dataEntrada) {
            const dataEntrada = new Date(loteArrematado.dataEntrada + 'T23:59:59');
            if (now <= dataEntrada) {
              valorPendente += valorEntrada;
            }
          }
          
          // Verificar parcelas mensais pendentes com estrutura real (não vencidas)
          if (arrematante.mesInicioPagamento && arrematante.diaVencimentoMensal) {
            const [startYear, startMonth] = arrematante.mesInicioPagamento.split('-').map(Number);
            const parcelasEfetivasPagas = Math.max(0, parcelasPagas - 1);
            
            for (let i = 0; i < quantidadeParcelas; i++) {
              const valorDaParcela = estruturaParcelas[i]?.valor || 0;
              const parcelaDate = calcularDataComAjusteEHorario(startYear, startMonth - 1 + i, arrematante.diaVencimentoMensal, 23, 59, 59);
              // Se a parcela não foi paga E ainda não venceu
              if (i >= parcelasEfetivasPagas && now <= parcelaDate) {
                valorPendente += valorDaParcela;
              }
            }
          }
          
          return sum + valorPendente;
        } else {
          // Para parcelamento simples, calcular parcelas pendentes com estrutura real (não vencidas)
          const valorTotal = a.valorPagarNumerico || 0;
          const parcelasPagas = arrematante.parcelasPagas || 0;
          const quantidadeParcelas = arrematante.quantidadeParcelas || 1;
          
          // Calcular estrutura real de parcelas
          const estruturaParcelas = calcularEstruturaParcelas(
            valorTotal,
            arrematante?.parcelasTriplas || 0,
            arrematante?.parcelasDuplas || 0,
            arrematante?.parcelasSimples || 0
          );
          
          let valorPendente = 0;
          
          if (arrematante.mesInicioPagamento && arrematante.diaVencimentoMensal) {
            const [startYear, startMonth] = arrematante.mesInicioPagamento.split('-').map(Number);
            
            for (let i = parcelasPagas; i < quantidadeParcelas; i++) {
              const valorDaParcela = estruturaParcelas[i]?.valor || 0;
              const parcelaDate = calcularDataComAjusteEHorario(startYear, startMonth - 1 + i, arrematante.diaVencimentoMensal, 23, 59, 59);
              // Se a parcela ainda não venceu
              if (now <= parcelaDate) {
                valorPendente += valorDaParcela;
              }
            }
          }
          
          return sum + valorPendente;
        }
      }, 0),
    totalParcelasPendentes: processedArrematantes()
      .filter(a => a.statusPagamento === 'pendente') // Apenas arrematantes com status pendente
      .reduce((sum, a) => {
        // Calcular quantidade de parcelas pendentes (dentro do prazo)
        const auction = auctions.find(auction => auction.id === a.leilaoId);
        if (!auction || !auction.arrematante) return sum;
        
        const arrematante = auction.arrematante;
        const loteArrematado = auction.lotes?.find(lote => lote.id === arrematante.loteId);
        const tipoPagamento = arrematante.tipoPagamento || loteArrematado?.tipoPagamento || auction.tipoPagamento || "parcelamento";
        const now = new Date();
        
        if (tipoPagamento === "a_vista") {
          // Para à vista, contar como 1 pagamento pendente
          return sum + 1;
        } else if (tipoPagamento === "entrada_parcelamento") {
          // Para entrada + parcelamento, contar parcelas pendentes (não vencidas)
          const parcelasPagas = arrematante.parcelasPagas || 0;
          const quantidadeParcelas = arrematante.quantidadeParcelas || 12;
          let parcelasPendentes = 0;
          
          // Verificar entrada se não foi paga
          if (parcelasPagas === 0 && loteArrematado?.dataEntrada) {
            const dataEntrada = new Date(loteArrematado.dataEntrada + 'T23:59:59');
            if (now <= dataEntrada) {
              parcelasPendentes += 1;
            }
          }
          
          // Verificar parcelas mensais pendentes (não vencidas)
          if (arrematante.mesInicioPagamento && arrematante.diaVencimentoMensal) {
            const [startYear, startMonth] = arrematante.mesInicioPagamento.split('-').map(Number);
            const parcelasEfetivasPagas = Math.max(0, parcelasPagas - 1);
            
            for (let i = 0; i < quantidadeParcelas; i++) {
              const parcelaDate = calcularDataComAjusteEHorario(startYear, startMonth - 1 + i, arrematante.diaVencimentoMensal, 23, 59, 59);
              // Se a parcela não foi paga E ainda não venceu
              if (i >= parcelasEfetivasPagas && now <= parcelaDate) {
                parcelasPendentes += 1;
              }
            }
          }
          
          return sum + parcelasPendentes;
        } else {
          // Para parcelamento simples, contar parcelas pendentes (não vencidas)
          const parcelasPagas = arrematante.parcelasPagas || 0;
          const quantidadeParcelas = arrematante.quantidadeParcelas || 1;
          let parcelasPendentes = 0;
          
          if (arrematante.mesInicioPagamento && arrematante.diaVencimentoMensal) {
            const [startYear, startMonth] = arrematante.mesInicioPagamento.split('-').map(Number);
            
            for (let i = parcelasPagas; i < quantidadeParcelas; i++) {
              const parcelaDate = calcularDataComAjusteEHorario(startYear, startMonth - 1 + i, arrematante.diaVencimentoMensal, 23, 59, 59);
              // Se a parcela ainda não venceu
              if (now <= parcelaDate) {
                parcelasPendentes += 1;
              }
            }
          }
          
          return sum + parcelasPendentes;
        }
      }, 0),
    totalAtrasado: processedArrematantes()
      .filter(a => a.statusPagamento === 'atrasado')
      .reduce((sum, a) => {
        // Calcular apenas o valor das parcelas atrasadas, não o valor total
        const auction = auctions.find(auction => auction.id === a.leilaoId);
        if (!auction || !auction.arrematante) return sum;
        
        const arrematante = auction.arrematante;
        const loteArrematado = auction.lotes?.find(lote => lote.id === arrematante.loteId);
        const tipoPagamento = arrematante.tipoPagamento || loteArrematado?.tipoPagamento || auction.tipoPagamento || "parcelamento";
        
        if (tipoPagamento === "a_vista") {
          // Para à vista, aplicar juros se estiver atrasado há pelo menos 1 mês
          const valorTotal = a.valorPagarNumerico || 0;
          const dataVencimento = loteArrematado?.dataVencimentoVista || auction?.dataVencimentoVista;
          
          if (dataVencimento && arrematante.percentualJurosAtraso) {
            const now = new Date();
            const vencimento = new Date(dataVencimento + 'T23:59:59');
            
            if (now > vencimento) {
              const mesesAtraso = Math.max(0, Math.floor((now.getTime() - vencimento.getTime()) / (1000 * 60 * 60 * 24 * 30)));
              if (mesesAtraso >= 1) {
                const valorComJuros = calcularJurosProgressivos(valorTotal, arrematante.percentualJurosAtraso, mesesAtraso);
                return sum + valorComJuros;
              }
            }
          }
          
          return sum + valorTotal;
        } else if (tipoPagamento === "entrada_parcelamento") {
          // Para entrada + parcelamento - usar estrutura real de parcelas
          const valorTotal = a.valorPagarNumerico || 0;
          const valorEntrada = arrematante.valorEntrada ? 
            (typeof arrematante.valorEntrada === 'string' ? 
              parseFloat(arrematante.valorEntrada.replace(/[^\d.,]/g, '').replace(/\./g, '').replace(',', '.')) : 
              arrematante.valorEntrada) : 
            valorTotal * 0.3;
          const quantidadeParcelas = arrematante.quantidadeParcelas || 12;
          
          // ✅ CORREÇÃO: Calcular estrutura apenas sobre o valor das parcelas (SEM entrada)
          const valorParaParcelas = valorTotal - valorEntrada;
          const estruturaParcelas = calcularEstruturaParcelas(
            valorParaParcelas,
            arrematante?.parcelasTriplas || 0,
            arrematante?.parcelasDuplas || 0,
            arrematante?.parcelasSimples || 0
          );
          
          // Calcular quantas parcelas estão atrasadas
          const parcelasPagas = arrematante.parcelasPagas || 0;
          const now = new Date();
          let _parcelasAtrasadas = 0;
          let entradaAtrasada = false;
          
          // Verificar se entrada está atrasada
          // ✅ CORREÇÃO: Priorizar dataEntrada do arrematante
          if (parcelasPagas === 0) {
            const dataEntradaConfig = arrematante.dataEntrada || loteArrematado?.dataEntrada;
            if (dataEntradaConfig) {
              const dataEntrada = new Date(dataEntradaConfig + 'T23:59:59');
              if (now > dataEntrada) {
                entradaAtrasada = true;
              }
            }
          }
          
          // Verificar parcelas mensais atrasadas
          if (arrematante.mesInicioPagamento && arrematante.diaVencimentoMensal) {
            const [startYear, startMonth] = arrematante.mesInicioPagamento.split('-').map(Number);
            const parcelasEfetivasPagas = Math.max(0, parcelasPagas - 1);
            
            for (let i = 0; i < quantidadeParcelas; i++) {
              const parcelaDate = calcularDataComAjusteEHorario(startYear, startMonth - 1 + i, arrematante.diaVencimentoMensal, 23, 59, 59);
              if (now > parcelaDate && i >= parcelasEfetivasPagas) {
                _parcelasAtrasadas++;
              }
            }
          }
          
          let valorAtrasado = 0;
          
          // Aplicar juros na entrada se atrasada há pelo menos 1 mês
          if (entradaAtrasada) {
            const { valorComJuros } = calcularJurosAtraso(arrematante, auction, valorEntrada);
            valorAtrasado += valorComJuros;
          }
          
          // Aplicar juros nas parcelas mensais atrasadas há pelo menos 1 mês com estrutura real
          if (arrematante.mesInicioPagamento && arrematante.diaVencimentoMensal) {
            const [startYear, startMonth] = arrematante.mesInicioPagamento.split('-').map(Number);
            const parcelasEfetivasPagas = Math.max(0, parcelasPagas - 1);
            
            for (let i = 0; i < quantidadeParcelas; i++) {
              const valorDaParcela = estruturaParcelas[i]?.valor || 0;
              const parcelaDate = calcularDataComAjusteEHorario(startYear, startMonth - 1 + i, arrematante.diaVencimentoMensal, 23, 59, 59);
              if (now > parcelaDate && i >= parcelasEfetivasPagas) {
                // Calcular meses de atraso para esta parcela específica
                const mesesAtraso = Math.max(0, Math.floor((now.getTime() - parcelaDate.getTime()) / (1000 * 60 * 60 * 24 * 30)));
                if (mesesAtraso >= 1) {
                  const valorComJuros = calcularJurosProgressivos(valorDaParcela, arrematante.percentualJurosAtraso || 0, mesesAtraso);
                  valorAtrasado = Math.round((valorAtrasado + valorComJuros) * 100) / 100;
                } else {
                  // Se não tem 1 mês de atraso, soma valor original
                  valorAtrasado = Math.round((valorAtrasado + valorDaParcela) * 100) / 100;
                }
              }
            }
          }
          
          console.log('📊 [Arrematantes - calcFinanceiro - totalAtrasado]', {
            arrematante: arrematante.nome,
            valorTotal,
            valorEntrada,
            valorParaParcelas,
            valorAtrasado,
            estruturaParcelas,
            parcelasTriplas: arrematante?.parcelasTriplas,
            parcelasDuplas: arrematante?.parcelasDuplas,
            parcelasSimples: arrematante?.parcelasSimples
          });
          
          const novoSum = Math.round((sum + valorAtrasado) * 100) / 100;
          return novoSum;
        } else {
          // Para parcelamento simples - usar estrutura real de parcelas
          const valorTotal = a.valorPagarNumerico || 0;
          const quantidadeParcelas = arrematante.quantidadeParcelas || 1;
          
          // Calcular estrutura real de parcelas
          const estruturaParcelas = calcularEstruturaParcelas(
            valorTotal,
            arrematante?.parcelasTriplas || 0,
            arrematante?.parcelasDuplas || 0,
            arrematante?.parcelasSimples || 0
          );
          
          // Calcular valor das parcelas atrasadas com juros
          const parcelasPagas = arrematante.parcelasPagas || 0;
          const now = new Date();
          let valorAtrasado = 0;
          
          if (arrematante.mesInicioPagamento && arrematante.diaVencimentoMensal) {
            const [startYear, startMonth] = arrematante.mesInicioPagamento.split('-').map(Number);
            
            for (let i = parcelasPagas; i < quantidadeParcelas; i++) {
              const valorDaParcela = estruturaParcelas[i]?.valor || 0;
              const parcelaDate = calcularDataComAjusteEHorario(startYear, startMonth - 1 + i, arrematante.diaVencimentoMensal, 23, 59, 59);
              if (now > parcelaDate) {
                // Calcular meses de atraso para esta parcela específica
                const mesesAtraso = Math.max(0, Math.floor((now.getTime() - parcelaDate.getTime()) / (1000 * 60 * 60 * 24 * 30)));
                if (mesesAtraso >= 1) {
                  const valorComJuros = calcularJurosProgressivos(valorDaParcela, arrematante.percentualJurosAtraso || 0, mesesAtraso);
                  valorAtrasado = Math.round((valorAtrasado + valorComJuros) * 100) / 100;
                } else {
                  // Se não tem 1 mês de atraso, soma valor original
                  valorAtrasado = Math.round((valorAtrasado + valorDaParcela) * 100) / 100;
                }
              } else {
                break;
              }
            }
          }
          
          const novoSum = Math.round((sum + valorAtrasado) * 100) / 100;
          return novoSum;
        }
      }, 0)
  };

  // Função para abrir modal de edição completa
  const _handleOpenFullEdit = (arrematante: ArrematanteExtendido) => {
    // 🔧 SINCRONIZAÇÃO: Buscar dados mais recentes do arrematante no leilão
    const auction = auctions.find(a => a.id === arrematante.leilaoId);
    if (auction && auction.arrematantes) {
      // Buscar o arrematante específico no array de arrematantes
      const arrematanteNoArray = auction.arrematantes.find(a => a.id === arrematante.id);
      if (arrematanteNoArray) {
      // Criar objeto arrematante com dados mais recentes
      const updatedArrematante = {
        ...arrematante,
          documento: arrematanteNoArray.documento || arrematante.documento || "",
          endereco: arrematanteNoArray.endereco || arrematante.endereco || "",
          nome: arrematanteNoArray.nome || arrematante.nome || "",
          email: arrematanteNoArray.email || arrematante.email || "",
          telefone: arrematanteNoArray.telefone || arrematante.telefone || "",
          documentos: arrematanteNoArray.documentos || arrematante.documentos || []
      };
      
      setSelectedArrematanteForFullEdit(updatedArrematante);
      } else {
        setSelectedArrematanteForFullEdit(arrematante);
      }
    } else {
      setSelectedArrematanteForFullEdit(arrematante);
    }
    
    setIsFullEditModalOpen(true);
  };

  // Função para fechar modal de edição completa
  const handleCloseFullEdit = () => {
    setIsFullEditModalOpen(false);
    setSelectedArrematanteForFullEdit(null);
    setFullEditForm({
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
      documentos: []
    });
  };

  // Função para salvar edição completa
  const handleSaveFullEdit = async () => {
    if (!selectedArrematanteForFullEdit) return;

    const auction = auctions.find(a => a.id === selectedArrematanteForFullEdit.leilaoId);
    if (!auction) return;
    
    // Obter arrematantes (compatibilidade com antigo)
    const arrematantes = auction.arrematantes || (auction.arrematante ? [auction.arrematante] : []);
    if (arrematantes.length === 0) return;

    setIsSavingFullEdit(true);
    
    try {
      // Verificar se campos relevantes do arrematante diferem dos padrões do leilão
      const shouldSyncAuctionDefaults = (
        fullEditForm.diaVencimentoMensal !== auction.diaVencimentoPadrao ||
        fullEditForm.quantidadeParcelas !== auction.parcelasPadrao ||
        fullEditForm.mesInicioPagamento !== auction.mesInicioPagamento
      );

      // 🔄 Converter documentos blob para base64 se necessário (edição completa)
      const documentosProcessados = await Promise.all(
        fullEditForm.documentos.map(async (doc, _index) => {
          if (doc.url && doc.url.startsWith('blob:')) {
            // Verificar se a URL blob ainda existe no conjunto de URLs gerenciadas
            if (!tempBlobUrlsRef.current.has(doc.url)) {
              tempBlobUrlsRef.current.add(doc.url);
            }
            
            try {
              // Tentar fazer fetch da URL blob
              const response = await fetch(doc.url);
              
              if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
              }
              
              const blob = await response.blob();
              
              if (!blob || blob.size === 0) {
                throw new Error('Blob vazio ou inválido');
              }
              
              const base64 = await new Promise<string>((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => {
                  if (reader.result && typeof reader.result === 'string') {
                    resolve(reader.result);
                  } else {
                    reject(new Error('FileReader retornou resultado inválido'));
                  }
                };
                reader.onerror = () => reject(new Error('Erro no FileReader'));
                reader.readAsDataURL(blob);
              });
              
              // Limpar a URL blob após conversão bem-sucedida
              if (tempBlobUrlsRef.current.has(doc.url)) {
                URL.revokeObjectURL(doc.url);
                tempBlobUrlsRef.current.delete(doc.url);
              }
              
              return { ...doc, url: base64 };
            } catch (_error) {
              // Tentar limpar a URL mesmo com erro
              if (tempBlobUrlsRef.current.has(doc.url)) {
                try {
                  URL.revokeObjectURL(doc.url);
                  tempBlobUrlsRef.current.delete(doc.url);
                } catch (_cleanupError) {
                  // Erro silencioso
                }
              }
              
              return { ...doc, url: null }; // Definir URL como null se conversão falhou
            }
          } else if (doc.url && doc.url.startsWith('data:')) {
            return doc;
          } else {
            return doc;
          }
        })
      );

      // Buscar o lote para copiar as datas de pagamento
      const loteArrematado = auction.lotes?.find(lote => lote.id === fullEditForm.loteId);

      // Obter tipo de pagamento (arrematante > lote > leilão)
      const tipoPagamento = selectedArrematanteForFullEdit?.tipoPagamento || loteArrematado?.tipoPagamento || auction?.tipoPagamento || "parcelamento";

      // ✅ Calcular valorPagarNumerico com comissão se for à vista
      let valorPagarNumerico = parseFloat(fullEditForm.valorPagar.replace(/[R$\s.]/g, '').replace(',', '.')) || 0;
      
      if (tipoPagamento === "a_vista" && valorPagarNumerico > 0) {
        const percentualComissao = auction?.percentualComissaoLeiloeiro || 0;
        if (percentualComissao > 0) {
          valorPagarNumerico = valorPagarNumerico * (1 + percentualComissao / 100);
        }
      }

      // Preparar arrematante atualizado
      const arrematanteAtualizado = {
        id: selectedArrematanteForFullEdit.id,
          nome: fullEditForm.nome,
          documento: fullEditForm.documento,
          endereco: fullEditForm.endereco,
          email: fullEditForm.email,
          telefone: fullEditForm.telefone,
          loteId: fullEditForm.loteId,
          valorPagar: fullEditForm.valorPagar,
          valorPagarNumerico: valorPagarNumerico,
          valorEntrada: fullEditForm.valorEntrada,
          diaVencimentoMensal: fullEditForm.diaVencimentoMensal,
          quantidadeParcelas: fullEditForm.quantidadeParcelas,
          parcelasPagas: fullEditForm.parcelasPagas,
          mesInicioPagamento: fullEditForm.mesInicioPagamento,
        dataEntrada: loteArrematado?.dataEntrada,
        dataVencimentoVista: loteArrematado?.dataVencimentoVista,
          pago: fullEditForm.pago,
          documentos: documentosProcessados
      };
      
      // Atualizar no array
      const arrematantesAtualizados = arrematantes.map(a => 
        a.id === selectedArrematanteForFullEdit.id || (!a.id && a.nome === selectedArrematanteForFullEdit.nome)
          ? arrematanteAtualizado 
          : a
      );
      
      // Preparar dados para atualização
      const updateData: Partial<Auction> = {
        arrematantes: arrematantesAtualizados
      };

      // 🔄 SINCRONIZAÇÃO BIDIRECIONAL: Se valores do arrematante diferem, sincronizar leilão
      if (shouldSyncAuctionDefaults) {
        updateData.diaVencimentoPadrao = fullEditForm.diaVencimentoMensal;
        updateData.parcelasPadrao = fullEditForm.quantidadeParcelas;
        updateData.mesInicioPagamento = fullEditForm.mesInicioPagamento;
        
        // Disparar evento para notificar formulário do leilão sobre mudanças
        window.dispatchEvent(new CustomEvent('arrematanteFormChanged', {
          detail: {
            auctionId: auction.id,
            changes: {
              diaVencimentoPadrao: fullEditForm.diaVencimentoMensal,
              parcelasPadrao: fullEditForm.quantidadeParcelas,
              mesInicioPagamento: fullEditForm.mesInicioPagamento
            }
          }
        }));

      }
      
      await updateAuction({
        id: auction.id,
        data: updateData
      });
      
      // Log da edição do arrematante
      await logBidderAction('update', fullEditForm.nome, auction.nome, auction.id, {
        metadata: {
          changes: {
            nome: fullEditForm.nome !== auction.arrematante.nome,
            documento: fullEditForm.documento !== auction.arrematante.documento,
            endereco: fullEditForm.endereco !== auction.arrematante.endereco,
            email: fullEditForm.email !== auction.arrematante.email,
            telefone: fullEditForm.telefone !== auction.arrematante.telefone,
            loteId: fullEditForm.loteId !== auction.arrematante.loteId,
            valorPagar: fullEditForm.valorPagar !== auction.arrematante.valorPagar,
            quantidadeParcelas: fullEditForm.quantidadeParcelas !== auction.arrematante.quantidadeParcelas,
            parcelasPagas: fullEditForm.parcelasPagas !== auction.arrematante.parcelasPagas
          },
          sync_auction_defaults: shouldSyncAuctionDefaults
        }
      });
      
      // Aguardar um momento para os dados serem recarregados pelo React Query
      setTimeout(() => {
        // Buscar dados atualizados após reload
        const updatedAuction = auctions.find(a => a.id === selectedArrematanteForFullEdit?.leilaoId);
        if (updatedAuction && updatedAuction.arrematante) {
          logger.info('Dados atualizados encontrados após salvamento', {
            documentos: updatedAuction.arrematante.documentos?.length || 0,
            documentosList: updatedAuction.arrematante.documentos?.map(d => ({nome: d.nome, hasUrl: !!d.url})) || []
          });
          
          // Atualizar selectedArrematanteForFullEdit com dados mais recentes
          setSelectedArrematanteForFullEdit({
            ...selectedArrematanteForFullEdit!,
            ...updatedAuction.arrematante
          });
        } else {
          logger.warn('Dados atualizados não encontrados após salvamento');
        }
        
        // Fechar modal após sincronização
        handleCloseFullEdit();
      }, 1000); // Aguardar 1 segundo para garantir que React Query recarregou
    } catch (error) {
      logger.error('Erro ao salvar edição completa', { error });
    } finally {
      setIsSavingFullEdit(false);
    }
  };

  // Funções para as novas ações
  const handleConfirmPayment = (arrematante: ArrematanteExtendido) => {
    setSelectedArrematanteForPayment(arrematante);
    
    // 🔧 ADAPTAÇÃO: Priorizar tipo de pagamento do arrematante > lote > leilão
    const auction = auctions.find(a => a.id === arrematante.leilaoId);
    const loteArrematado = auction?.lotes?.find(lote => lote.id === arrematante.loteId);
    const tipoPagamento = arrematante.tipoPagamento || loteArrematado?.tipoPagamento || auction?.tipoPagamento || "parcelamento";
    
    logger.debug('Tipo de pagamento detectado', {
      tipoPagamento,
      arrematanteTipoPagamento: arrematante.tipoPagamento,
      loteTipoPagamento: loteArrematado?.tipoPagamento,
      auctionTipoPagamento: auction?.tipoPagamento,
      arrematanteDataEntrada: arrematante.dataEntrada,
      loteDataEntrada: loteArrematado?.dataEntrada,
      auctionDataEntrada: auction?.dataEntrada
    });
    
    if (tipoPagamento === "a_vista") {
      // 💰 PAGAMENTO À VISTA: Criar estrutura simples com uma única data de vencimento
      const dataVencimento = loteArrematado?.dataVencimentoVista || auction?.dataVencimentoVista;
      const vencimentoDate = dataVencimento ? new Date(dataVencimento + 'T00:00:00') : new Date();
      
      const months = [{
        month: vencimentoDate.toISOString().slice(0, 7),
        paid: arrematante.pago || false,
        dueDate: vencimentoDate.toLocaleDateString('pt-BR'),
        monthName: "Pagamento à Vista"
      }];
      
      setPaymentMonths(months);
    } else if (tipoPagamento === "entrada_parcelamento") {
      // 💳 ENTRADA + PARCELAMENTO: Criar estrutura com entrada separada + parcelas
      const dataEntrada = arrematante.dataEntrada || loteArrematado?.dataEntrada || auction?.dataEntrada;
      const entradaDate = dataEntrada ? new Date(dataEntrada + 'T00:00:00') : new Date();
      const parcelasPagas = arrematante.parcelasPagas || 0;
      
      const months = [];
      
      // Adicionar entrada como primeiro item
      months.push({
        month: entradaDate.toISOString().slice(0, 7),
        paid: parcelasPagas > 0, // Entrada paga se parcelasPagas > 0
        dueDate: entradaDate.toLocaleDateString('pt-BR'),
        monthName: "Entrada",
        isEntrada: true // Flag para identificar como entrada
      });
      
      // Adicionar parcelas
      const [startYear, startMonth] = arrematante.mesInicioPagamento.split('-').map(Number);
      for (let i = 0; i < arrematante.quantidadeParcelas; i++) {
        const currentDate = calcularDataComAjuste(startYear, startMonth - 1 + i, arrematante.diaVencimentoMensal);
        const monthString = currentDate.toISOString().slice(0, 7);
        const dueDate = currentDate.toLocaleDateString('pt-BR');
        const monthName = `${i + 1}ª Parcela - ${currentDate.toLocaleDateString('pt-BR', { 
          month: 'long', 
          year: 'numeric' 
        }).charAt(0).toUpperCase() + currentDate.toLocaleDateString('pt-BR', { 
          month: 'long', 
          year: 'numeric' 
        }).slice(1)}`;
        
        // Parcela paga se (parcelasPagas - 1) > i (descontando a entrada)
        const isPaid = parcelasPagas > 0 && (parcelasPagas - 1) > i;
        
        months.push({
          month: monthString,
          paid: isPaid,
          dueDate: dueDate,
          monthName: monthName,
          isEntrada: false
        });
      }
      
      setPaymentMonths(months);
    } else {
      // 📅 PARCELAMENTO SIMPLES: Gerar lista detalhada de meses de pagamento (código original)
      const [startYear, startMonth] = arrematante.mesInicioPagamento.split('-').map(Number);
      const months = [];
      
      for (let i = 0; i < arrematante.quantidadeParcelas; i++) {
        const currentDate = calcularDataComAjuste(startYear, startMonth - 1 + i, arrematante.diaVencimentoMensal);
        const monthString = currentDate.toISOString().slice(0, 7); // YYYY-MM
        const dueDate = currentDate.toLocaleDateString('pt-BR');
        const monthName = currentDate.toLocaleDateString('pt-BR', { 
          month: 'long', 
          year: 'numeric' 
        }).charAt(0).toUpperCase() + currentDate.toLocaleDateString('pt-BR', { 
          month: 'long', 
          year: 'numeric' 
        }).slice(1);
        const isPaid = i < (arrematante.parcelasPagas || 0);
        
        months.push({
          month: monthString,
          paid: isPaid,
          dueDate: dueDate,
          monthName: monthName,
          isEntrada: false
        });
      }
      
      setPaymentMonths(months);
    }
    
    setIsPaymentModalOpen(true);
    // Log da abertura do modal de pagamento
    try {
      logBidderAction('open_payment', arrematante.nome, arrematante.leilaoNome || '', arrematante.leilaoId, {
        metadata: { parcelas_pagas: arrematante.parcelasPagas, total_parcelas: arrematante.quantidadeParcelas }
      });
    } catch { /* silenciar erro de log */ }
  };

  const handlePaymentToggle = (monthIndex: number, paid: boolean) => {
    setPaymentMonths(prev => {
      // Se está desmarcando (paid = false)
      if (!paid) {
        // Encontrar o índice da última parcela paga
        let ultimaParcelaPaga = -1;
        for (let i = prev.length - 1; i >= 0; i--) {
          if (prev[i].paid) {
            ultimaParcelaPaga = i;
            break;
          }
        }
        
        // Só permite desmarcar se for a última parcela paga
        if (monthIndex !== ultimaParcelaPaga) {
          logger.warn('Você só pode desmarcar a última parcela paga', { indice: ultimaParcelaPaga });
          return prev; // Não faz nada
        }
        
        logger.info('Desmarcando última parcela', { indice: monthIndex });
      }
      
      // Se está marcando (paid = true)
      if (paid) {
        // Verificar se todas as anteriores estão pagas
        const todasAnterioresPagas = prev.slice(0, monthIndex).every(m => m.paid);
        
        if (!todasAnterioresPagas) {
          logger.warn('Você precisa marcar as parcelas anteriores primeiro');
          return prev; // Não faz nada
        }
        
        logger.info('Marcando parcela', { indice: monthIndex });
      }
      
      // Atualiza a parcela
      return prev.map((month, index) => 
        index === monthIndex ? { ...month, paid } : month
      );
    });
  };

  const handleSavePayments = async () => {
    if (!selectedArrematanteForPayment) return;

    const auction = auctions.find(a => a.id === selectedArrematanteForPayment.leilaoId);
    if (!auction) return;
    
    // Obter arrematantes (compatibilidade)
    const arrematantes = auction.arrematantes || (auction.arrematante ? [auction.arrematante] : []);
    if (arrematantes.length === 0) return;
    
    // Encontrar arrematante específico
    const arrematanteAtual = arrematantes.find(a => a.id === selectedArrematanteForPayment.id || a.nome === selectedArrematanteForPayment.nome);
    if (!arrematanteAtual) return;

    // 🔧 ADAPTAÇÃO: Verificar tipo de pagamento (priorizar arrematante > lote > leilão)
    const loteArrematado = auction?.lotes?.find(lote => lote.id === selectedArrematanteForPayment.loteId);
    const tipoPagamento = selectedArrematanteForPayment.tipoPagamento || loteArrematado?.tipoPagamento || auction?.tipoPagamento || "parcelamento";

    const paidMonths = paymentMonths.filter(m => m.paid).length;
    let isFullyPaid = false;
    let parcelasPagasValue = 0;

    if (tipoPagamento === "a_vista") {
      // 💰 PAGAMENTO À VISTA: Considera pago se o checkbox único estiver marcado
      isFullyPaid = paidMonths > 0;
      parcelasPagasValue = isFullyPaid ? 1 : 0;
    } else if (tipoPagamento === "entrada_parcelamento") {
      // 💳 ENTRADA + PARCELAMENTO: Lógica especial para entrada + parcelas
      const entradaPaga = paymentMonths.find(m => m.isEntrada)?.paid || false;
      const parcelasPagasCount = paymentMonths.filter(m => !m.isEntrada && m.paid).length;
      
      // parcelasPagas = 0 (nada pago), 1 (só entrada), 2+ (entrada + parcelas)
      if (entradaPaga) {
        parcelasPagasValue = 1 + parcelasPagasCount; // Entrada conta como 1 + parcelas pagas
      } else {
        parcelasPagasValue = 0; // Entrada não paga
      }
      
      // Totalmente pago se entrada + todas as parcelas estiverem pagas
      isFullyPaid = entradaPaga && parcelasPagasCount >= selectedArrematanteForPayment.quantidadeParcelas;
    } else {
      // 📅 PARCELAMENTO SIMPLES: Considera pago se todas as parcelas foram pagas
      parcelasPagasValue = paidMonths;
      isFullyPaid = paidMonths >= selectedArrematanteForPayment.quantidadeParcelas;
    }

    logger.info('Salvando pagamento', { 
      tipoPagamento, 
      paidMonths, 
      parcelasPagasValue,
      isFullyPaid 
    });

    setIsSavingPayments(true);
    
    try {
      // Buscar o lote para copiar as datas de pagamento
      const loteArrematado = auction?.lotes?.find(lote => lote.id === selectedArrematanteForPayment.loteId);
      
      // Atualizar arrematante específico no array
      const arrematantesAtualizados = arrematantes.map(a => 
        a.id === selectedArrematanteForPayment.id || (!a.id && a.nome === selectedArrematanteForPayment.nome)
          ? {
              ...a,
              parcelasPagas: parcelasPagasValue,
              pago: isFullyPaid,
              dataEntrada: loteArrematado?.dataEntrada || a.dataEntrada,
              dataVencimentoVista: loteArrematado?.dataVencimentoVista || a.dataVencimentoVista,
              mesInicioPagamento: a.mesInicioPagamento || loteArrematado?.mesInicioPagamento,
              diaVencimentoMensal: a.diaVencimentoMensal || loteArrematado?.diaVencimentoPadrao
            }
          : a
      );
      
      // Atualizar no banco de dados
      const updatePromise = updateAuction({
        id: auction.id,
        data: {
          arrematantes: arrematantesAtualizados
        }
      });
      
      // Log em paralelo (não bloquear UI)
      const oldParcelasPagas = arrematanteAtual.parcelasPagas || 0;
      const paymentDetails = `${oldParcelasPagas} → ${parcelasPagasValue} parcelas pagas${isFullyPaid ? ' (totalmente quitado)' : ''}`;
      
      const logPromise = logPaymentAction(
        parcelasPagasValue > oldParcelasPagas ? 'mark_paid' : 'mark_unpaid',
        selectedArrematanteForPayment.nome,
        auction.nome,
        auction.id,
        paymentDetails,
        {
          metadata: {
            tipo_pagamento: tipoPagamento,
            parcelas_antigas: oldParcelasPagas,
            parcelas_novas: parcelasPagasValue,
            totalmente_pago: isFullyPaid,
            valor_total: selectedArrematanteForPayment.valorPagarNumerico
          }
        }
      );
      
      // Aguardar apenas a atualização (log é em paralelo)
      await updatePromise;
      logPromise.catch(err => logger.error('Erro ao registrar log', { error: err }));
      
      // 📧 ENVIO DE EMAIL EM SEGUNDO PLANO (não bloqueia o fechamento do modal)
      // Executar em paralelo sem aguardar conclusão
      (async () => {
      if (parcelasPagasValue > oldParcelasPagas && auction.arrematante.email) {
        logger.info('Enviando emails de confirmação', { 
          de: oldParcelasPagas + 1, 
          ate: parcelasPagasValue,
          tipoPagamento 
        });
        
        // Função para calcular juros progressivos (EXATAMENTE igual ao modal)
        const calcularJurosProgressivos = (valorOriginal: number, percentualJuros: number, mesesAtraso: number) => {
          if (mesesAtraso < 1 || !percentualJuros) {
            return valorOriginal;
          }
          let valorAtual = valorOriginal;
          const taxaMensal = percentualJuros / 100;
          for (let mes = 1; mes <= mesesAtraso; mes++) {
            const jurosMes = valorAtual * taxaMensal;
            valorAtual = valorAtual + jurosMes;
          }
          return Math.round(valorAtual * 100) / 100;
        };
        
        // Enviar email para CADA parcela que foi marcada como paga nesta ação
        for (let numeroParcela = oldParcelasPagas + 1; numeroParcela <= parcelasPagasValue; numeroParcela++) {
          try {
            logger.debug('Processando email para parcela', { numeroParcela });
            
            // Calcular valor BASE da parcela (sem juros)
            let valorParcela = auction.arrematante.valorPagarNumerico;
            
            if (tipoPagamento === 'entrada_parcelamento' && numeroParcela === 1) {
              // Entrada
              const valorEntrada = auction.arrematante.valorEntrada 
                ? (typeof auction.arrematante.valorEntrada === 'string' 
                    ? parseFloat(auction.arrematante.valorEntrada.replace(/[^\d.,]/g, '').replace(/\./g, '').replace(',', '.')) 
                    : auction.arrematante.valorEntrada)
                : valorParcela * 0.3;
              valorParcela = valorEntrada;
            } else if (tipoPagamento === 'entrada_parcelamento' && numeroParcela > 1) {
              // Parcela após entrada
              const valorEntrada = auction.arrematante.valorEntrada 
                ? (typeof auction.arrematante.valorEntrada === 'string' 
                    ? parseFloat(auction.arrematante.valorEntrada.replace(/[^\d.,]/g, '').replace(/\./g, '').replace(',', '.')) 
                    : auction.arrematante.valorEntrada)
                : valorParcela * 0.3;
              const valorRestante = valorParcela - valorEntrada;
              valorParcela = valorRestante / auction.arrematante.quantidadeParcelas;
            } else if (tipoPagamento === 'parcelamento') {
              // Parcelamento simples
              valorParcela = valorParcela / auction.arrematante.quantidadeParcelas;
            }
            // Para 'a_vista', valorParcela já é o valor total
            
            // Calcular juros PROGRESSIVOS para esta parcela específica
            let valorFinalComJuros = valorParcela;
            
            // Buscar a parcela específica do array paymentMonths
            const indiceParcela = numeroParcela - 1;
            const parcelaPaga = paymentMonths[indiceParcela];
            
            logger.debug('Verificando juros para parcela', {
              numeroParcela,
              paymentMonthsExiste: !!paymentMonths,
              paymentMonthsLength: paymentMonths?.length || 0,
              parcelaPagaEncontrada: !!parcelaPaga,
              dueDate: parcelaPaga?.dueDate || 'não definida',
              percentualJurosAtraso: auction.arrematante.percentualJurosAtraso || 0
            });
            
            if (parcelaPaga && parcelaPaga.dueDate && auction.arrematante.percentualJurosAtraso && auction.arrematante.percentualJurosAtraso > 0) {
              // Converter data de vencimento do formato BR para Date
              const dueDate = new Date(parcelaPaga.dueDate.split('/').reverse().join('-') + 'T23:59:59');
              const hoje = new Date();
              
              // Calcular meses de atraso exatamente como no modal
              const mesesAtraso = Math.max(0, Math.floor((hoje.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24 * 30)));
              
              if (mesesAtraso >= 1) {
                valorFinalComJuros = calcularJurosProgressivos(valorParcela, auction.arrematante.percentualJurosAtraso, mesesAtraso);
                const valorJuros = valorFinalComJuros - valorParcela;
                
                logger.info('Juros progressivos aplicados', {
                  numeroParcela,
                  parcela: parcelaPaga.monthName,
                  dataVencimento: parcelaPaga.dueDate,
                  mesesAtraso,
                  valorBase: valorParcela.toFixed(2),
                  juros: valorJuros.toFixed(2),
                  valorFinal: valorFinalComJuros.toFixed(2)
                });
              } else {
                logger.info('Parcela paga em dia - sem juros', { 
                  numeroParcela, 
                  valor: valorParcela.toFixed(2) 
                });
              }
            }
            
            // Enviar email para esta parcela AGUARDANDO conclusão
            try {
              logger.info('Enviando email de confirmação para parcela', { numeroParcela, tipoPagamento });
              const result = await enviarConfirmacao(auction, numeroParcela, valorFinalComJuros);
              
              if (result.success) {
                logger.info('Email de confirmação enviado com sucesso', { numeroParcela });
                try { logReportAction('generate', 'email_confirmacao', `Enviou email de confirmação da parcela ${numeroParcela} para "${auction.arrematante?.nome || ''}"`); } catch { /* */ }
              } else {
                logger.warn('Falha ao enviar email de confirmação', { numeroParcela, message: result.message });
              }
            } catch (err) {
              logger.error('Erro ao enviar email de confirmação', { numeroParcela, error: err });
            }
            
            // Delay de 1 segundo entre emails (obrigatório para evitar sobrecarga)
            if (numeroParcela < parcelasPagasValue) {
              logger.debug('Aguardando 1 segundo antes da próxima parcela');
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          } catch (error) {
            logger.error('Erro ao processar email da parcela', { numeroParcela, error });
          }
        }
        
        logger.info('Processo de envio de emails iniciado', { 
          parcelas: parcelasPagasValue - oldParcelasPagas 
        });
      }
      
      // 🎉 ENVIAR EMAIL DE QUITAÇÃO se todas as parcelas foram pagas
      if (isFullyPaid && auction.arrematante.email) {
        logger.info('Todas as parcelas foram quitadas! Enviando email de quitação', { tipoPagamento });
        
        try {
          // Aguardar 3 segundos após os emails de confirmação para dar tempo de processar
          logger.debug('Aguardando 3 segundos antes de enviar email de quitação');
          await new Promise(resolve => setTimeout(resolve, 3000));
          
          // 🔧 CRIAR OBJETO COM VALORES ATUALIZADOS (não usar auction que está desatualizado)
          const arrematanteAtualizado = {
            ...auction.arrematante,
            parcelasPagas: parcelasPagasValue, // Usar valor NOVO
            pago: true // Usar valor NOVO
          };
          
          logger.debug('Dados para cálculo de quitação', {
            parcelasPagas: arrematanteAtualizado.parcelasPagas,
            quantidadeParcelas: arrematanteAtualizado.quantidadeParcelas,
            pago: arrematanteAtualizado.pago,
            valorPagarNumerico: arrematanteAtualizado.valorPagarNumerico
          });
          
          const arrematanteExtendido: ArrematanteExtendido = {
            ...arrematanteAtualizado,
            id: auction.id,
            leilaoNome: auction.nome,
            leilaoId: auction.id,
            dataLeilao: auction.dataInicio,
            statusPagamento: 'pago' as const
          };
          const valorTotalComJuros = calcularValorTotalComJuros(arrematanteExtendido);
          
          logger.info('Valor total com juros para email de quitação', { 
            valorTotal: valorTotalComJuros.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) 
          });
          
          // Criar objeto auction atualizado para enviar no email
          const auctionAtualizado = {
            ...auction,
            arrematante: arrematanteAtualizado
          };
          
          const result = await enviarQuitacao(auctionAtualizado, valorTotalComJuros);
          
          if (result.success) {
            logger.info('Email de quitação completa enviado com sucesso', { 
              email: auction.arrematante.email,
              parcelaFinal: parcelasPagasValue
            });
            try { logReportAction('generate', 'email_quitacao', `Enviou email de quitação para "${auction.arrematante?.nome || ''}" no leilão "${auction.nome || ''}"`); } catch { /* */ }
          } else {
            logger.warn('Falha ao enviar email de quitação', { message: result.message });
          }
        } catch (error) {
          logger.error('Erro ao enviar email de quitação', { error });
        }
      }
      })().catch(err => logger.error('Erro no processo de envio de emails', { error: err }));
      
      // Toast de sucesso removido - notificação silenciosa
    } catch (error) {
      logger.error('Erro ao salvar pagamentos', { error });
      // Em caso de erro, apenas resetar loading
      setIsSavingPayments(false);
      return;
    }
    
    // ✅ SUCESSO: FECHAR MODAL E RECARREGAR PÁGINA (F5)
    setIsSavingPayments(false);
    setIsPaymentModalOpen(false);
    setSelectedArrematanteForPayment(null);
    setPaymentMonths([]);
    
    // 🔄 RECARREGAR PÁGINA COMPLETAMENTE (equivalente a F5)
    window.location.reload();
  };

  const handleArchiveArrematante = async (arrematante: ArrematanteExtendido) => {
    try {
      await archiveAuction(arrematante.leilaoId);
      try {
        await logBidderAction('update', arrematante.nome, arrematante.leilaoNome || '', arrematante.leilaoId, {
          metadata: { action_detail: 'arquivou_leilao_do_arrematante' }
        });
      } catch { /* silenciar erro de log */ }
    } catch (error) {
      logger.error('Erro ao arquivar', { error });
    }
  };

  const handleUnarchiveArrematante = async (arrematante: ArrematanteExtendido) => {
    try {
      await unarchiveAuction(arrematante.leilaoId);
      try {
        await logBidderAction('update', arrematante.nome, arrematante.leilaoNome || '', arrematante.leilaoId, {
          metadata: { action_detail: 'desarquivou_leilao_do_arrematante' }
        });
      } catch { /* silenciar erro de log */ }
    } catch (error) {
      logger.error('Erro ao desarquivar', { error });
    }
  };

  const handleUnconfirmPayment = async (arrematante: ArrematanteExtendido) => {
    try {
      // Encontrar o leilão correspondente
      const auction = auctions.find(a => a.id === arrematante.leilaoId);
      if (!auction || !auction.arrematantes) {
        return;
      }

      // Buscar o arrematante específico no array
      const arrematanteNoArray = auction.arrematantes.find(a => a.id === arrematante.id);
      if (!arrematanteNoArray) {
        return;
      }

      // Buscar o lote para preservar as datas de pagamento
      const loteArrematado = auction?.lotes?.find(lote => lote.id === arrematante.loteId);

      // Desconfirmar APENAS a última parcela (não todas)
      const parcelasPagasAtual = arrematanteNoArray.parcelasPagas || 0;
      const novasParcelas = Math.max(0, parcelasPagasAtual - 1); // Remove apenas 1 parcela
      
      logger.info('Desconfirmando última parcela', { 
        de: parcelasPagasAtual, 
        para: novasParcelas 
      });
      
      const updatedArrematante = {
        ...arrematanteNoArray,
        pago: false, // Sempre desmarca o status "pago" completo
        parcelasPagas: novasParcelas, // Remove apenas a última parcela
        // Preservar datas de pagamento do lote
        dataEntrada: loteArrematado?.dataEntrada || arrematanteNoArray.dataEntrada,
        dataVencimentoVista: loteArrematado?.dataVencimentoVista || arrematanteNoArray.dataVencimentoVista,
        mesInicioPagamento: arrematanteNoArray.mesInicioPagamento || loteArrematado?.mesInicioPagamento,
        diaVencimentoMensal: arrematanteNoArray.diaVencimentoMensal || loteArrematado?.diaVencimentoPadrao
      };

      // Atualizar o array de arrematantes
      const arrematantesAtualizados = auction.arrematantes.map(a =>
        a.id === arrematante.id ? updatedArrematante : a
      );

      // Atualização no banco de dados (processamento em background)
      await updateAuction({
        id: arrematante.leilaoId,
        data: { arrematantes: arrematantesAtualizados }
      });

      // Log da desconfirmação de pagamento
      try {
        await logPaymentAction('mark_unpaid', arrematante.nome, arrematante.leilaoNome || '', arrematante.leilaoId,
          `Desconfirmou parcela ${parcelasPagasAtual} → ${novasParcelas}`
        );
      } catch { /* silenciar erro de log */ }
    } catch (error) {
      logger.error('Erro ao desconfirmar pagamento', { error });
    }
  };

  const handleDeleteArrematante = async (arrematante: ArrematanteExtendido) => {
    const auction = auctions.find(a => a.id === arrematante.leilaoId);
    if (!auction) return;

    try {
      // Filtrar o array de arrematantes para remover o arrematante específico
      const arrematantesAtualizados = (auction.arrematantes || []).filter(
        a => a.id !== arrematante.id
      );

      await updateAuction({
        id: auction.id,
        data: {
          arrematantes: arrematantesAtualizados.length > 0 ? arrematantesAtualizados : []
        }
      });
      
      // Log da exclusão do arrematante
      await logBidderAction('delete', arrematante.nome, auction.nome, auction.id, {
        metadata: {
          valor_total: arrematante.valorPagarNumerico,
          parcelas_pagas: arrematante.parcelasPagas || 0,
          estava_pago: arrematante.pago,
          lote_id: arrematante.loteId
        }
      });
    } catch (error) {
      logger.error('Erro ao excluir arrematante', { error });
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  };

  return (
    <div className="space-y-4 sm:space-y-6 lg:space-y-8 p-6 fade-simple">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900">Gestão de Arrematantes</h1>
            <p className="text-gray-600 mt-1">Gerencie todos os arrematantes e seus pagamentos</p>
          </div>
          <Button 
              className="bg-white hover:bg-gray-100 text-gray-700 border border-gray-300 btn-download-click"
            onClick={() => setIsExportModalOpen(true)}
          >
            <Download className="h-4 w-4 mr-2" />
            Exportar Relatório
          </Button>
        </div>
      </div>

      {/* Estatísticas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
        <div className="bg-white border-0 shadow-sm rounded-lg p-3 sm:p-4 lg:p-6">
          <div className="text-center">
            <div className="mb-4">
              <p className="text-xs font-semibold text-gray-700 uppercase tracking-[0.15em] mb-3">Arrematantes</p>
              <div className="h-px w-20 bg-gray-300 mx-auto mb-4"></div>
            </div>
            <p className="text-xl sm:text-2xl lg:text-3xl font-extralight text-gray-900 mb-2 tracking-tight">{stats.total}</p>
            <p className="text-sm text-gray-600 font-medium">Cadastrados</p>
          </div>
        </div>

        <div className="bg-white border-0 shadow-sm rounded-lg p-3 sm:p-4 lg:p-6">
          <div className="text-center">
            <div className="mb-4">
              <p className="text-xs font-semibold text-gray-700 uppercase tracking-[0.15em] mb-3">Pagamentos</p>
              <div className="h-px w-20 bg-gray-300 mx-auto mb-4"></div>
            </div>
            <p className="text-xl sm:text-2xl lg:text-3xl font-extralight text-gray-900 mb-2 tracking-tight">{stats.totalPagamentosRealizados}</p>
            <p className="text-sm text-gray-600 font-medium mb-2">pagamentos realizados</p>
            <p className="text-lg font-light text-gray-800">{formatCurrency(stats.totalReceita)}</p>
          </div>
        </div>

        <div className="bg-white border-0 shadow-sm rounded-lg p-3 sm:p-4 lg:p-6">
          <div className="text-center">
            <div className="mb-4">
              <p className="text-xs font-semibold text-gray-700 uppercase tracking-[0.15em] mb-3">Pendentes</p>
              <div className="h-px w-20 bg-gray-300 mx-auto mb-4"></div>
            </div>
             <p className="text-xl sm:text-2xl lg:text-3xl font-extralight text-gray-900 mb-2 tracking-tight">{stats.totalParcelasPendentes}</p>
             <p className="text-sm text-gray-600 font-medium mb-2">parcelas pendentes</p>
             <p className="text-lg font-light text-gray-800">{formatCurrency(stats.totalPendente)}</p>
          </div>
        </div>

        <div className="bg-white border-0 shadow-sm rounded-lg p-3 sm:p-4 lg:p-6">
          <div className="text-center">
            <div className="mb-4">
              <p className="text-xs font-semibold text-gray-700 uppercase tracking-[0.15em] mb-3">Atrasados</p>
              <div className="h-px w-20 bg-gray-300 mx-auto mb-4"></div>
            </div>
            <p className="text-xl sm:text-2xl lg:text-3xl font-extralight text-gray-900 mb-2 tracking-tight">{stats.atrasado}</p>
            <p className="text-sm text-gray-600 font-medium mb-2">Em Atraso</p>
            <p className="text-lg font-light text-gray-800">{formatCurrency(stats.totalAtrasado)}</p>
          </div>
        </div>
      </div>

      {/* Filtros e Busca */}
      <Card className="border-0 shadow-sm h-[calc(100vh-380px)]">
        <CardHeader className="pb-4">
          <div className="space-y-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <CardTitle className="flex items-center gap-2 text-xl font-semibold leading-tight text-gray-800">
              {showArchived ? <Archive className="h-5 w-5 text-gray-600 shrink-0" /> : <Users className="h-5 w-5 text-gray-600 shrink-0" />}
              {showArchived ? "Arrematantes Arquivados" : "Arrematantes Cadastrados"}
            </CardTitle>
              
              {/* Botão minimalista para arrematantes de convidados */}
              <button
                onClick={() => setShowGuestBidders(!showGuestBidders)}
                className={`
                  text-sm font-medium transition-all relative pb-1
                  ${showGuestBidders ? 'text-gray-900' : 'text-gray-600'}
                  hover:text-gray-900
                  after:content-[''] after:absolute after:bottom-0 after:left-0 after:right-0 
                  after:h-[1px] after:bg-gray-900 after:transition-all after:duration-300
                  after:opacity-0 hover:after:opacity-100
                `}
              >
                {showGuestBidders ? 'Exibir Arrematantes do Anfitrião' : 'Exibir Arrematantes de Convidados'}
              </button>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-4">
              {/* Barra de pesquisa à esquerda */}
              <div className="relative w-full max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Buscar arrematante ou leilão..."
                  value={searchInputValue}
                  onChange={(e) => setSearchInputValue(e.target.value)}
                  className="pl-10 h-11 border-gray-300 focus:border-gray-300 focus:ring-0 no-focus-outline"
                />
              </div>
              
              {/* Filtros à direita */}
              <div className="flex gap-3 lg:ml-auto">
                {showArchived && (
                  <Button
                    variant="outline"
                    onClick={() => setShowArchived(false)}
                    className="h-11 px-3 border-gray-300 text-gray-700 hover:text-black hover:bg-gray-50"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => setShowArchived(!showArchived)}
                  className="h-11 px-4 border-gray-300 text-gray-700 hover:text-black hover:bg-gray-50"
                >
                  <Archive className="h-4 w-4 mr-2" />
                  {showArchived ? "Ver Ativos" : `Ver Arquivados (${
                    auctions.filter(a => a.arquivado && (a.arrematantes?.length || 0) > 0).length +
                    (guestLots || []).filter(g => g.arquivado && (g.arrematantes?.length || 0) > 0).length
                  })`}
                </Button>
                
                <Select 
                  value={statusFilter} 
                  onValueChange={setStatusFilter}
                  onOpenChange={setIsStatusSelectOpen}
                >
                  <SelectTrigger 
                    className="w-48 h-11 border-gray-300 focus:!ring-0 focus:!ring-offset-0 focus:!border-gray-300 focus:!outline-none focus:!shadow-none"
                  >
                    <div className="flex items-center gap-2">
                      <Filter className="h-4 w-4 text-gray-500" />
                      <SelectValue />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos ({getStatusCount("todos")})</SelectItem>
                    <SelectItem value="pago">Pagos ({getStatusCount("pago")})</SelectItem>
                    <SelectItem value="pendente">Pendentes ({getStatusCount("pendente")})</SelectItem>
                    <SelectItem value="atrasado">Atrasados ({getStatusCount("atrasado")})</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0 h-[calc(100%-120px)] overflow-y-auto">
          {isAuctionsLoading ? (
            <div className="space-y-0">
              {[...Array(4)].map((_, index) => (
                <div
                  key={index}
                  className={`animate-pulse border-b border-gray-100 p-4 ${
                    index === 0 ? 'animate-delay-0' : 
                    index === 1 ? 'animate-delay-100' : 
                    index === 2 ? 'animate-delay-200' : 'animate-delay-300'
                  }`}
                >
                  <div className="flex-col gap-2 sm:flex-row sm:items-center sm:justify-between flex">
                    <div className="flex items-center gap-3 flex-1">
                      <div className="p-2 rounded-full bg-gray-200 w-10 h-10"></div>
                      <div className="flex-1">
                        <div className="h-4 bg-gray-200 rounded w-32 mb-2"></div>
                        <div className="h-3 bg-gray-200 rounded w-24"></div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="h-4 bg-gray-200 rounded w-28"></div>
                      <div className="h-4 bg-gray-200 rounded w-20"></div>
                      <div className="h-4 bg-gray-200 rounded w-16"></div>
                      <div className="h-6 bg-gray-200 rounded w-12"></div>
                      <div className="flex gap-1">
                        <div className="w-8 h-8 bg-gray-200 rounded"></div>
                        <div className="w-8 h-8 bg-gray-200 rounded"></div>
                        <div className="w-8 h-8 bg-gray-200 rounded"></div>
                        <div className="w-8 h-8 bg-gray-200 rounded"></div>
                        <div className="w-8 h-8 bg-gray-200 rounded"></div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : filteredArrematantes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-500">
              {showArchived ? <Archive className="h-12 w-12 mb-4 text-gray-300" /> : <Users className="h-12 w-12 mb-4 text-gray-300" />}
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {searchTerm && statusFilter !== "todos" 
                  ? `Nenhum arrematante ${statusFilter} encontrado`
                  : searchTerm 
                    ? "Nenhum arrematante encontrado"
                    : statusFilter !== "todos"
                      ? `Nenhum arrematante ${statusFilter}`
                      : showArchived 
                        ? "Nenhum arrematante arquivado"
                        : "Nenhum arrematante encontrado"}
              </h3>
              <p className="text-sm text-center max-w-md">
                {searchTerm && statusFilter !== "todos"
                  ? `Nenhum arrematante ${statusFilter} corresponde à busca "${searchTerm}".`
                  : searchTerm
                    ? `Nenhum resultado para "${searchTerm}". Tente outro termo.`
                    : statusFilter !== "todos"
                      ? `Não há arrematantes com status ${statusFilter} no momento.`
                      : showArchived 
                        ? "Não há arrematantes arquivados no momento."
                        : "Ainda não há arrematantes cadastrados no sistema."}
              </p>
            </div>
          ) : (
            <div className={`transition-opacity duration-300 ${isTransitioning ? 'opacity-0' : 'opacity-100'}`}>
              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-gray-200">
                    <TableHead className="font-semibold text-gray-700">Arrematante</TableHead>
                    <TableHead className="font-semibold text-gray-700 hidden sm:table-cell">Leilão</TableHead>
                    <TableHead className="font-semibold text-gray-700">Valor</TableHead>
                    <TableHead className="font-semibold text-gray-700 hidden sm:table-cell">Vencimento</TableHead>
                    <TableHead className="font-semibold text-gray-700 hidden sm:table-cell">Situação</TableHead>
                    <TableHead className="font-semibold text-gray-700">Status</TableHead>
                    <TableHead className="font-semibold text-gray-700 text-center">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedArrematantes.map((arrematante) => (
                    <TableRow key={arrematante.id} className="border-gray-100 hover:bg-gray-50/50">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-full ${
                            arrematante.statusPagamento === 'pago' 
                              ? 'bg-green-100' 
                              : arrematante.statusPagamento === 'atrasado'
                              ? 'bg-red-100'
                              : 'bg-yellow-100'
                          }`}>
                            {getStatusIcon(arrematante.statusPagamento)}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{arrematante.nome}</p>
                            <p className="text-sm text-gray-500">
                              {arrematante.documentos && arrematante.documentos.length > 0 
                                ? `${arrematante.documentos.length} documento(s)` 
                                : 'Sem documentos'}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <div>
                          <p className="font-medium text-gray-900">{arrematante.leilaoNome}</p>
                          <p className="text-sm text-gray-500">
                            {new Date(arrematante.dataLeilao + 'T12:00:00.000Z').toLocaleDateString("pt-BR", { timeZone: "UTC" })}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          {(() => {
                            const valorTotalComJuros = calcularValorTotalComJuros(arrematante);
                            const auction = auctions.find(a => a.id === arrematante.leilaoId);
                            const loteArrematado = auction?.lotes?.find(lote => lote.id === arrematante.loteId);
                            const tipoPagamento = arrematante.tipoPagamento || loteArrematado?.tipoPagamento || auction?.tipoPagamento || "parcelamento";
                            const now = new Date();
                            
                            // ✅ Se totalmente pago, exibir valor total quitado (sem valor de parcela avulso)
                            if (arrematante.pago) {
                              return (
                                <>
                                  <span className="font-semibold text-black">
                                    R$ {valorTotalComJuros.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </span>
                                  <span className="text-xs text-green-600">
                                    Quitado
                                  </span>
                                </>
                              );
                            }
                            
                            let valorParcelaExibir = valorTotalComJuros;
                            
                            if (tipoPagamento === 'parcelamento') {
                              // Parcelamento simples: calcular próxima parcela com juros se atrasada
                              const quantidadeParcelas = arrematante.quantidadeParcelas || 12;
                              const parcelasPagas = arrematante.parcelasPagas || 0;
                              
                              // Verificar se usa estrutura de parcelas (triplas/duplas/simples)
                              const temEstruturaParcelas = arrematante?.usaFatorMultiplicador && 
                                (arrematante?.parcelasTriplas != null || 
                                 arrematante?.parcelasDuplas != null || 
                                 arrematante?.parcelasSimples != null);
                              
                              let valorParcelaBase = 0;
                              if (temEstruturaParcelas) {
                                // Calcular estrutura e pegar valor da próxima parcela
                                const estrutura = calcularEstruturaParcelas(
                                  arrematante.valorPagarNumerico || 0,
                                  arrematante?.parcelasTriplas || 0,
                                  arrematante?.parcelasDuplas || 0,
                                  arrematante?.parcelasSimples || 0
                                );
                                valorParcelaBase = estrutura[parcelasPagas]?.valor || ((arrematante.valorPagarNumerico || 0) / quantidadeParcelas);
                              } else {
                                // Sistema antigo: divisão simples
                                valorParcelaBase = (arrematante.valorPagarNumerico || 0) / quantidadeParcelas;
                              }
                              
                              // Calcular valor da próxima parcela (com juros se atrasada)
                              if (!arrematante.pago && arrematante.mesInicioPagamento && arrematante.diaVencimentoMensal) {
                                const [startYear, startMonth] = arrematante.mesInicioPagamento.split('-').map(Number);
                                const proximaParcelaIndex = parcelasPagas;
                                const parcelaDate = calcularDataComAjusteEHorario(startYear, startMonth - 1 + proximaParcelaIndex, arrematante.diaVencimentoMensal);
                                
                                if (now > parcelaDate && arrematante.percentualJurosAtraso) {
                                  const mesesAtraso = Math.max(0, Math.floor((now.getTime() - parcelaDate.getTime()) / (1000 * 60 * 60 * 24 * 30)));
                                  logger.debug('Parcelamento Simples', {
                                    arrematanteNome: arrematante.nome,
                                    valorTotal: arrematante.valorPagarNumerico,
                                    quantidadeParcelas,
                                    valorParcelaBase,
                                    parcelaDate: parcelaDate.toISOString(),
                                    dataHoje: now.toISOString(),
                                    mesesAtraso,
                                    percentualJuros: arrematante.percentualJurosAtraso,
                                    valorSemJuros: valorParcelaBase,
                                    valorComJuros: mesesAtraso >= 1 ? calcularJurosProgressivos(valorParcelaBase, arrematante.percentualJurosAtraso, mesesAtraso) : valorParcelaBase
                                  });
                                  if (mesesAtraso >= 1) {
                                    valorParcelaExibir = calcularJurosProgressivos(valorParcelaBase, arrematante.percentualJurosAtraso, mesesAtraso);
                                  } else {
                                    valorParcelaExibir = valorParcelaBase;
                                  }
                                } else {
                                  valorParcelaExibir = valorParcelaBase;
                                }
                              } else {
                                valorParcelaExibir = valorParcelaBase;
                              }
                            } else if (tipoPagamento === 'entrada_parcelamento') {
                              // Entrada + Parcelamento: calcular próxima parcela com juros se atrasada
                              const valorEntrada = arrematante.valorEntrada 
                                ? (typeof arrematante.valorEntrada === 'string' 
                                  ? parseFloat(arrematante.valorEntrada.replace(/[^\d.,]/g, '').replace(/\./g, '').replace(',', '.'))
                                  : arrematante.valorEntrada)
                                : (arrematante.valorPagarNumerico || 0) * 0.3;
                              const quantidadeParcelas = arrematante.quantidadeParcelas || 12;
                              const parcelasPagas = arrematante.parcelasPagas || 0;
                              
                              // Verificar se usa estrutura de parcelas (triplas/duplas/simples)
                              const temEstruturaParcelas = arrematante?.usaFatorMultiplicador && 
                                (arrematante?.parcelasTriplas != null || 
                                 arrematante?.parcelasDuplas != null || 
                                 arrematante?.parcelasSimples != null);
                              
                              // ✅ Parcelas são calculadas sobre o valor das parcelas (SEM entrada)
                              let valorParcelaBase = 0;
                              if (temEstruturaParcelas) {
                                // ✅ CORREÇÃO: Calcular estrutura apenas sobre o valor das parcelas (SEM entrada)
                                const valorParaParcelas = (arrematante.valorPagarNumerico || 0) - valorEntrada;
                                const estrutura = calcularEstruturaParcelas(
                                  valorParaParcelas,
                                  arrematante?.parcelasTriplas || 0,
                                  arrematante?.parcelasDuplas || 0,
                                  arrematante?.parcelasSimples || 0
                                );
                                // Para entrada + parcelamento, se parcelasPagas > 0, a entrada já foi paga
                                const parcelaIndex = parcelasPagas > 0 ? parcelasPagas - 1 : 0;
                                valorParcelaBase = estrutura[parcelaIndex]?.valor || ((arrematante.valorPagarNumerico || 0) / quantidadeParcelas);
                                
                                console.log('📊 [Arrematantes - valorParcelaBase calculado]', {
                                  arrematante: arrematante.nome,
                                  valorPagarNumerico: arrematante.valorPagarNumerico,
                                  valorEntrada,
                                  valorParaParcelas,
                                  parcelaIndex,
                                  valorParcelaBase
                                });
                              } else {
                                // Sistema antigo: divisão simples
                                valorParcelaBase = (arrematante.valorPagarNumerico || 0) / quantidadeParcelas;
                              }
                              
                              if (parcelasPagas === 0) {
                                // Entrada ainda não foi paga - verificar se está atrasada
                                // ✅ CORREÇÃO: Priorizar dataEntrada do arrematante
                                const dataEntradaConfig = arrematante?.dataEntrada || loteArrematado?.dataEntrada;
                                
                                console.log('📊 [Arrematantes - valorParcelaExibir - entrada]', {
                                  arrematante: arrematante.nome,
                                  valorEntrada,
                                  dataEntradaConfig,
                                  dataEntradaArrematante: arrematante?.dataEntrada,
                                  dataEntradaLote: loteArrematado?.dataEntrada,
                                  percentualJurosAtraso: arrematante.percentualJurosAtraso
                                });
                                
                                if (!arrematante.pago && dataEntradaConfig) {
                                  const dataEntrada = new Date(dataEntradaConfig + 'T23:59:59');
                                  if (now > dataEntrada && arrematante.percentualJurosAtraso) {
                                    const mesesAtraso = Math.max(0, Math.floor((now.getTime() - dataEntrada.getTime()) / (1000 * 60 * 60 * 24 * 30)));
                                    if (mesesAtraso >= 1) {
                                      valorParcelaExibir = calcularJurosProgressivos(valorEntrada, arrematante.percentualJurosAtraso, mesesAtraso);
                                      console.log('📊 [Arrematantes - entrada COM juros]', {
                                        valorEntrada,
                                        mesesAtraso,
                                        valorComJuros: valorParcelaExibir
                                      });
                                    } else {
                                      valorParcelaExibir = valorEntrada;
                                    }
                                  } else {
                                    valorParcelaExibir = valorEntrada;
                                  }
                                } else {
                                  valorParcelaExibir = valorEntrada;
                                }
                              } else {
                                // Entrada paga, calcular próxima parcela mensal
                                if (!arrematante.pago && arrematante.mesInicioPagamento && arrematante.diaVencimentoMensal) {
                                  const [startYear, startMonth] = arrematante.mesInicioPagamento.split('-').map(Number);
                                  const parcelasEfetivasPagas = Math.max(0, parcelasPagas - 1);
                                  const proximaParcelaIndex = parcelasEfetivasPagas;
                                  const parcelaDate = calcularDataComAjusteEHorario(startYear, startMonth - 1 + proximaParcelaIndex, arrematante.diaVencimentoMensal);
                                  
                                  if (now > parcelaDate && arrematante.percentualJurosAtraso) {
                                    const mesesAtraso = Math.max(0, Math.floor((now.getTime() - parcelaDate.getTime()) / (1000 * 60 * 60 * 24 * 30)));
                                    if (mesesAtraso >= 1) {
                                      valorParcelaExibir = calcularJurosProgressivos(valorParcelaBase, arrematante.percentualJurosAtraso, mesesAtraso);
                                    } else {
                                      valorParcelaExibir = valorParcelaBase;
                                    }
                                  } else {
                                    valorParcelaExibir = valorParcelaBase;
                                  }
                                } else {
                                  valorParcelaExibir = valorParcelaBase;
                                }
                              }
                            }
                            // Para 'a_vista', valorParcelaExibir = valorTotalComJuros (já definido acima)
                            
                            // Calcular valor total pendente (não pago) usando estrutura de parcelas
                            let valorTotalPendente = 0;
                            if (arrematante.pago) {
                              valorTotalPendente = 0;
                            } else {
                              const quantidadeParcelas = arrematante.quantidadeParcelas || 12;
                              const parcelasPagas = arrematante.parcelasPagas || 0;
                              
                              // Verificar se usa estrutura de parcelas (triplas/duplas/simples)
                              const temEstruturaParcelas = arrematante?.usaFatorMultiplicador && 
                                (arrematante?.parcelasTriplas != null || 
                                 arrematante?.parcelasDuplas != null || 
                                 arrematante?.parcelasSimples != null);
                              
                              if (tipoPagamento === 'entrada_parcelamento') {
                                const valorEntrada = arrematante.valorEntrada 
                                  ? (typeof arrematante.valorEntrada === 'string' 
                                    ? parseFloat(arrematante.valorEntrada.replace(/[^\d.,]/g, '').replace(/\./g, '').replace(',', '.'))
                                    : arrematante.valorEntrada)
                                  : (arrematante.valorPagarNumerico || 0) * 0.3;
                                
                                if (parcelasPagas === 0) {
                                  // Entrada + todas as parcelas pendentes
                                  // ✅ Calcular entrada com juros se atrasada
                                  const dataEntradaConfig = arrematante?.dataEntrada || loteArrematado?.dataEntrada;
                                  if (dataEntradaConfig) {
                                    const dataEntrada = new Date(dataEntradaConfig + 'T23:59:59');
                                    if (now > dataEntrada && arrematante?.percentualJurosAtraso) {
                                      const mesesAtraso = Math.max(0, Math.floor((now.getTime() - dataEntrada.getTime()) / (1000 * 60 * 60 * 24 * 30)));
                                      if (mesesAtraso >= 1) {
                                        valorTotalPendente = calcularJurosProgressivos(valorEntrada, arrematante.percentualJurosAtraso, mesesAtraso);
                                      } else {
                                        valorTotalPendente = valorEntrada;
                                      }
                                    } else {
                                      valorTotalPendente = valorEntrada;
                                    }
                                  } else {
                                    valorTotalPendente = valorEntrada;
                                  }
                                  
                                  if (temEstruturaParcelas) {
                                    // ✅ CORREÇÃO: Calcular estrutura apenas sobre o valor das parcelas (SEM entrada)
                                    const valorParaParcelas = (arrematante.valorPagarNumerico || 0) - valorEntrada;
                                    const estrutura = calcularEstruturaParcelas(
                                      valorParaParcelas,
                                      arrematante?.parcelasTriplas || 0,
                                      arrematante?.parcelasDuplas || 0,
                                      arrematante?.parcelasSimples || 0
                                    );
                                    
                                    console.log('📊 [Arrematantes - display valorTotal - entrada não paga]', {
                                      arrematante: arrematante.nome,
                                      valorPagarNumerico: arrematante.valorPagarNumerico,
                                      valorEntrada,
                                      valorParaParcelas,
                                      estrutura
                                    });
                                    
                                    // ✅ Aplicar juros em cada parcela atrasada
                                    if (arrematante.mesInicioPagamento && arrematante.diaVencimentoMensal) {
                                      const [startYear, startMonth] = arrematante.mesInicioPagamento.split('-').map(Number);
                                      for (let i = 0; i < quantidadeParcelas; i++) {
                                        const valorDaParcela = estrutura[i]?.valor || 0;
                                        const parcelaDate = new Date(startYear, startMonth - 1 + i, arrematante.diaVencimentoMensal, 23, 59, 59);
                                        if (now > parcelaDate && arrematante?.percentualJurosAtraso) {
                                          const mesesAtraso = Math.max(0, Math.floor((now.getTime() - parcelaDate.getTime()) / (1000 * 60 * 60 * 24 * 30)));
                                          if (mesesAtraso >= 1) {
                                            valorTotalPendente += calcularJurosProgressivos(valorDaParcela, arrematante.percentualJurosAtraso, mesesAtraso);
                                          } else {
                                            valorTotalPendente += valorDaParcela;
                                          }
                                        } else {
                                          valorTotalPendente += valorDaParcela;
                                        }
                                      }
                                    } else {
                                      for (let i = 0; i < quantidadeParcelas; i++) {
                                        valorTotalPendente += estrutura[i]?.valor || 0;
                                      }
                                    }
                                  } else {
                                    // Somar apenas o valor das parcelas (sem a entrada)
                                    const valorRestante = (arrematante.valorPagarNumerico || 0) - valorEntrada;
                                    valorTotalPendente += valorRestante;
                                  }
                                } else {
                                  // Apenas parcelas pendentes (entrada já foi paga)
                                  if (temEstruturaParcelas) {
                                    // ✅ CORREÇÃO: Calcular estrutura apenas sobre o valor das parcelas (SEM entrada)
                                    const valorParaParcelas = (arrematante.valorPagarNumerico || 0) - valorEntrada;
                                    const estrutura = calcularEstruturaParcelas(
                                      valorParaParcelas,
                                      arrematante?.parcelasTriplas || 0,
                                      arrematante?.parcelasDuplas || 0,
                                      arrematante?.parcelasSimples || 0
                                    );
                                    const parcelasEfetivasPagas = parcelasPagas - 1; // -1 porque parcelasPagas inclui entrada
                                    
                                    // ✅ Aplicar juros em cada parcela atrasada
                                    if (arrematante.mesInicioPagamento && arrematante.diaVencimentoMensal) {
                                      const [startYear, startMonth] = arrematante.mesInicioPagamento.split('-').map(Number);
                                      for (let i = parcelasEfetivasPagas; i < quantidadeParcelas; i++) {
                                        const valorDaParcela = estrutura[i]?.valor || 0;
                                        const parcelaDate = new Date(startYear, startMonth - 1 + i, arrematante.diaVencimentoMensal, 23, 59, 59);
                                        if (now > parcelaDate && arrematante?.percentualJurosAtraso) {
                                          const mesesAtraso = Math.max(0, Math.floor((now.getTime() - parcelaDate.getTime()) / (1000 * 60 * 60 * 24 * 30)));
                                          if (mesesAtraso >= 1) {
                                            valorTotalPendente += calcularJurosProgressivos(valorDaParcela, arrematante.percentualJurosAtraso, mesesAtraso);
                                          } else {
                                            valorTotalPendente += valorDaParcela;
                                          }
                                        } else {
                                          valorTotalPendente += valorDaParcela;
                                        }
                                      }
                                    } else {
                                      for (let i = parcelasEfetivasPagas; i < quantidadeParcelas; i++) {
                                        valorTotalPendente += estrutura[i]?.valor || 0;
                                      }
                                    }
                                  } else {
                                    const valorPorParcela = (arrematante.valorPagarNumerico || 0) / quantidadeParcelas;
                                    valorTotalPendente = (quantidadeParcelas - (parcelasPagas - 1)) * valorPorParcela;
                                  }
                                }
                                
                                console.log('📊 [Arrematantes - display valorTotal - resultado]', {
                                  arrematante: arrematante.nome,
                                  valorTotalPendente
                                });
                              } else if (tipoPagamento === 'parcelamento') {
                                // Parcelamento simples: somar parcelas pendentes
                                if (temEstruturaParcelas) {
                                  const estrutura = calcularEstruturaParcelas(
                                    arrematante.valorPagarNumerico || 0,
                                    arrematante?.parcelasTriplas || 0,
                                    arrematante?.parcelasDuplas || 0,
                                    arrematante?.parcelasSimples || 0
                                  );
                                  for (let i = parcelasPagas; i < quantidadeParcelas; i++) {
                                    valorTotalPendente += estrutura[i]?.valor || 0;
                                  }
                                } else {
                                  const valorPorParcela = (arrematante.valorPagarNumerico || 0) / quantidadeParcelas;
                                  valorTotalPendente = (quantidadeParcelas - parcelasPagas) * valorPorParcela;
                                }
                              } else {
                                // À vista
                                valorTotalPendente = valorTotalComJuros;
                              }
                            }
                            
                            return (
                              <>
                                <span className="font-semibold text-black">
                                  R$ {valorParcelaExibir.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                </span>
                                <span className="text-xs text-gray-500">
                                  (Total: R$ {valorTotalPendente.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})
                                </span>
                              </>
                            );
                          })()}
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-gray-400" />
                          <span className={`text-sm font-medium ${(() => {
                              // Verificar se é um caso de pagamento com atraso para definir cor
                              const auction = auctions.find(a => a.id === arrematante.leilaoId);
                              const loteArrematado = auction?.lotes?.find(lote => lote.id === arrematante.loteId);
                              const tipoPagamento = arrematante.tipoPagamento || loteArrematado?.tipoPagamento || auction?.tipoPagamento || "parcelamento";
                              
                              if (arrematante.pago) {
                                const today = new Date();
                                let dueDate: Date;
                                
                                if (tipoPagamento === "a_vista") {
                                  const dataVencimento = loteArrematado?.dataVencimentoVista || auction?.dataVencimentoVista;
                                  dueDate = dataVencimento ? new Date(dataVencimento + 'T23:59:59') : new Date();
                                } else {
                                  const [startYear, startMonth] = arrematante.mesInicioPagamento.split('-').map(Number);
                                  const lastPaidIndex = Math.max(0, (arrematante.parcelasPagas || 1) - 1);
                                  dueDate = new Date(calcularDataComAjuste(startYear, startMonth - 1 + lastPaidIndex, arrematante.diaVencimentoMensal).setHours(23, 59, 59, 0));
                                }
                                
                                const isLate = today > dueDate;
                                return isLate ? 'text-red-600' : 'text-gray-900';
                              } else if (!arrematante.pago) {
                                // Verificar também se parcelamento sem pago flag está quitado com atraso
                                const proximoPagamento = calculateNextPaymentDate(arrematante);
                                if (!proximoPagamento) {
                                  const today = new Date();
                                  const [startYear, startMonth] = arrematante.mesInicioPagamento.split('-').map(Number);
                                  const lastPaidIndex = Math.max(0, (arrematante.parcelasPagas || 1) - 1);
                                  const dueDate = new Date(calcularDataComAjuste(startYear, startMonth - 1 + lastPaidIndex, arrematante.diaVencimentoMensal).setHours(23, 59, 59, 0));
                                  const isLate = today > dueDate;
                                  return isLate ? 'text-red-600' : 'text-gray-900';
                                }
                              }
                              return 'text-gray-900';
                            })()}`}>
                            {(() => {
                              // Obter leilão e lote para verificar tipo de pagamento
                              const auction = auctions.find(a => a.id === arrematante.leilaoId);
                              const loteArrematado = auction?.lotes?.find(lote => lote.id === arrematante.loteId);
                              const tipoPagamento = arrematante.tipoPagamento || loteArrematado?.tipoPagamento || auction?.tipoPagamento || "parcelamento";
                              
                              if (arrematante.pago) {
                                // 🔧 VERIFICAR SE PAGAMENTO FOI FEITO COM ATRASO
                                const today = new Date();
                                let dueDate: Date;
                                
                                if (tipoPagamento === "a_vista") {
                                  const dataVencimento = loteArrematado?.dataVencimentoVista || auction?.dataVencimentoVista;
                                  dueDate = dataVencimento ? new Date(dataVencimento + 'T23:59:59') : new Date();
                                } else {
                                  // Para parcelamento, verificar a data da última parcela paga
                                  const [startYear, startMonth] = arrematante.mesInicioPagamento.split('-').map(Number);
                                  const lastPaidIndex = Math.max(0, (arrematante.parcelasPagas || 1) - 1);
                                  dueDate = new Date(calcularDataComAjuste(startYear, startMonth - 1 + lastPaidIndex, arrematante.diaVencimentoMensal).setHours(23, 59, 59, 0));
                                }
                                
                                const isLate = today > dueDate;
                                return isLate ? "Quitado com atraso" : "Quitado";
                              }
                              
                              // Para pagamento à vista, mostrar data de vencimento específica
                              if (tipoPagamento === "a_vista") {
                                const dataVencimento = loteArrematado?.dataVencimentoVista || auction?.dataVencimentoVista;
                                return (
                                  <div>
                                    <div className="text-xs text-gray-500 mb-1">Vencimento à vista</div>
                                    <div className="font-medium">
                                      {dataVencimento ? 
                                        new Date(dataVencimento + 'T00:00:00').toLocaleDateString("pt-BR") : 
                                        'Não definida'}
                                    </div>
                                  </div>
                                );
                              }
                              
                              // Para entrada_parcelamento, tratar entrada separadamente
                              if (tipoPagamento === "entrada_parcelamento") {
                                const parcelasPagas = arrematante.parcelasPagas || 0;
                                
                                if (parcelasPagas === 0) {
                                  // Entrada pendente - mostrar data da entrada (priorizar arrematante)
                                  const dataEntrada = arrematante.dataEntrada || loteArrematado?.dataEntrada || auction?.dataEntrada;
                                  return (
                                    <div>
                                      <div className="text-xs text-gray-500 mb-1">Vencimento entrada</div>
                                      <div className="font-medium">
                                        {dataEntrada ? 
                                          new Date(dataEntrada + 'T00:00:00').toLocaleDateString("pt-BR") : 
                                          'Não definido'}
                                      </div>
                                    </div>
                                  );
                                } else {
                                  // Entrada paga, mostrar próxima parcela
                                  const proximoPagamento = calculateNextPaymentDateEntradaParcelamento(arrematante, auction);
                                  if (!proximoPagamento) {
                                    // Verificar se parcelamento foi quitado com atraso
                                    const today = new Date();
                                    const [startYear, startMonth] = arrematante.mesInicioPagamento.split('-').map(Number);
                                    const lastPaidIndex = Math.max(0, parcelasPagas - 1);
                                    const dueDate = new Date(calcularDataComAjuste(startYear, startMonth - 1 + lastPaidIndex, arrematante.diaVencimentoMensal).setHours(23, 59, 59, 0));
                                    const isLate = today > dueDate;
                                    return isLate ? "Quitado com atraso" : "Quitado";
                                  }
                                  const parcelaAtual = parcelasPagas; // Próxima parcela a ser paga
                                  return (
                                    <div>
                                      <div className="text-xs text-gray-500 mb-1">Venc. {parcelaAtual}ª parcela</div>
                                      <div className="font-medium">
                                        {proximoPagamento.toLocaleDateString("pt-BR")}
                                      </div>
                                    </div>
                                  );
                                }
                              }
                              
                              // Para parcelamento simples, usar lógica existente
                              const proximoPagamento = calculateNextPaymentDate(arrematante);
                              if (!proximoPagamento) {
                                // 🔧 VERIFICAR SE PARCELAMENTO FOI QUITADO COM ATRASO
                                const today = new Date();
                                const [startYear, startMonth] = arrematante.mesInicioPagamento.split('-').map(Number);
                                const lastPaidIndex = Math.max(0, (arrematante.parcelasPagas || 1) - 1);
                                const dueDate = new Date(calcularDataComAjuste(startYear, startMonth - 1 + lastPaidIndex, arrematante.diaVencimentoMensal).setHours(23, 59, 59, 0));
                                const isLate = today > dueDate;
                                return isLate ? "Quitado com atraso" : "Quitado";
                              }
                              const parcelaAtual = (arrematante.parcelasPagas || 0) + 1;
                              return (
                                <div>
                                  <div className="text-xs text-gray-500 mb-1">Venc. {parcelaAtual}ª parcela</div>
                                  <div className="font-medium">
                                    {proximoPagamento.toLocaleDateString("pt-BR")}
                                  </div>
                                </div>
                              );
                            })()}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <div className="flex flex-col">
                          {(() => {
                            // Obter leilão e lote para verificar tipo de pagamento
                            const auction = auctions.find(a => a.id === arrematante.leilaoId);
                            const loteArrematado = auction?.lotes?.find(lote => lote.id === arrematante.loteId);
                            const tipoPagamento = arrematante.tipoPagamento || loteArrematado?.tipoPagamento || auction?.tipoPagamento || "parcelamento";
                            
                            if (tipoPagamento === "a_vista") {
                              // Para pagamento à vista
                              return (
                                <>
                                  <span className={`text-sm font-medium ${
                                    arrematante.pago 
                                      ? (() => {
                                          // Verificar se pagamento à vista foi feito com atraso
                                          const today = new Date();
                                          const dataVencimento = loteArrematado?.dataVencimentoVista || auction?.dataVencimentoVista;
                                          const dueDate = dataVencimento ? new Date(dataVencimento + 'T23:59:59') : new Date();
                                          const isLate = today > dueDate;
                                          return isLate ? 'text-red-600' : 'text-green-700';
                                        })() 
                                      : 'text-gray-900'
                                  }`}>
                                    <div className="flex items-center gap-2">
                                      {arrematante.pago 
                                        ? (() => {
                                            // Verificar se pagamento à vista foi feito com atraso
                                            const today = new Date();
                                            const dataVencimento = loteArrematado?.dataVencimentoVista || auction?.dataVencimentoVista;
                                            const dueDate = dataVencimento ? new Date(dataVencimento + 'T23:59:59') : new Date();
                                            const isLate = today > dueDate;
                                            return (
                                              <>
                                                {isLate ? (
                                                  <CircleX className="h-4 w-4 text-red-500" />
                                                ) : (
                                                  <CheckCircle className="h-4 w-4 text-green-500" />
                                                )}
                                                {isLate ? "Pago à Vista com Atraso" : "Pago à Vista"}
                                              </>
                                            );
                                          })() 
                                        : "Pagamento à Vista"
                                      }
                                    </div>
                                  </span>
                                  <span className="text-xs text-gray-500">
                                    {arrematante.pago 
                                      ? (() => {
                                          // Verificar se pagamento à vista foi feito com atraso
                                          const today = new Date();
                                          const dataVencimento = loteArrematado?.dataVencimentoVista || auction?.dataVencimentoVista;
                                          const dueDate = dataVencimento ? new Date(dataVencimento + 'T23:59:59') : new Date();
                                          const isLate = today > dueDate;
                                          return isLate ? 'Pagamento com atraso confirmado' : 'Transação confirmada';
                                        })() 
                                      : 'Aguardando pagamento'
                                    }
                                  </span>
                                </>
                              );
                            } else {
                              // Para parcelamento (lógica original)
                              const loteArrematado = auction.lotes?.find((lote: LoteInfo) => lote.id === arrematante.loteId);
                              const tipoPagamento = arrematante.tipoPagamento || loteArrematado?.tipoPagamento || auction.tipoPagamento || "parcelamento";
                              const quantidadeParcelas = arrematante.quantidadeParcelas || 0;
                              const parcelasPagas = arrematante.parcelasPagas || 0;
                              
                              let totalParcelas;
                              if (tipoPagamento === "entrada_parcelamento") {
                                // Para entrada + parcelamento: total = 1 entrada + X parcelas
                                totalParcelas = 1 + quantidadeParcelas;
                              } else {
                                // Para parcelamento simples
                                totalParcelas = quantidadeParcelas;
                              }
                              
                              const restantes = totalParcelas - parcelasPagas;
                              return (
                                <>
                                  <span className={`text-sm font-medium ${
                                    restantes === 0 
                                      ? (() => {
                                          // Verificar se foi quitado com atraso
                                          const today = new Date();
                                          const [startYear, startMonth] = arrematante.mesInicioPagamento.split('-').map(Number);
                                          const lastPaidIndex = Math.max(0, (arrematante.parcelasPagas || 1) - 1);
                                          const dueDate = new Date(calcularDataComAjuste(startYear, startMonth - 1 + lastPaidIndex, arrematante.diaVencimentoMensal).setHours(23, 59, 59, 0));
                                          const isLate = today > dueDate;
                                          return isLate ? 'text-red-600' : 'text-green-700';
                                        })() 
                                      : 'text-gray-900'
                                  }`}>
                                    {(() => {
                                      if (restantes === 0) {
                                        // 🔧 VERIFICAR SE PARCELAMENTO FOI QUITADO COM ATRASO
                                        const today = new Date();
                                        const [startYear, startMonth] = arrematante.mesInicioPagamento.split('-').map(Number);
                                        const lastPaidIndex = Math.max(0, (arrematante.parcelasPagas || 1) - 1);
                                        const dueDate = new Date(calcularDataComAjuste(startYear, startMonth - 1 + lastPaidIndex, arrematante.diaVencimentoMensal).setHours(23, 59, 59, 0));
                                        const isLate = today > dueDate;
                                        return isLate ? "🔴 Quitado com Atraso" : "Quitado";
                                      }
                                      if (restantes === 1) return "Falta 1 parcela";
                                      return `Faltam ${restantes} parcelas`;
                                    })()}
                                  </span>
                                  <span className="text-xs text-gray-500">
                                    {(() => {
                                      const loteArrematado = auction.lotes?.find((lote: LoteInfo) => lote.id === arrematante.loteId);
                                      const tipoPagamento = arrematante.tipoPagamento || loteArrematado?.tipoPagamento || auction.tipoPagamento || "parcelamento";
                                      const parcelasPagas = arrematante.parcelasPagas || 0;
                                      const quantidadeParcelas = arrematante.quantidadeParcelas || 0;
                                      
                                      if (tipoPagamento === "entrada_parcelamento") {
                                        // Para entrada + parcelamento: total = 1 entrada + X parcelas
                                        const totalParcelas = 1 + quantidadeParcelas;
                                        return `${parcelasPagas}/${totalParcelas} pagas`;
                                      } else {
                                        // Para parcelamento simples ou à vista
                                        return `${parcelasPagas}/${quantidadeParcelas} pagas`;
                                      }
                                    })()}
                                  </span>
                                </>
                              );
                            }
                          })()}
                        </div>
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(arrematante.statusPagamento)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-1">
                          {/* Ações de Pagamento (Primeira prioridade) */}
                          {!arrematante.pago && !showArchived && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleConfirmPayment(arrematante)}
                              className="h-10 w-10 sm:h-8 sm:w-8 p-0 text-green-600 hover:text-green-700 hover:bg-green-50 btn-action-click"
                              title="Confirmar pagamento"
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                          )}
                          {arrematante.pago && !showArchived && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleUnconfirmPayment(arrematante)}
                              className="h-10 w-10 sm:h-8 sm:w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                              title="Desconfirmar pagamento"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                          
                          {/* Ações de Visualização */}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleViewArrematante(arrematante)}
                            className="h-10 w-10 sm:h-8 sm:w-8 p-0 text-gray-600 hover:text-black hover:bg-gray-100 btn-action-click"
                            title="Ver detalhes"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          
                          {/* Ações de Edição */}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditArrematante(arrematante)}
                            className="h-10 w-10 sm:h-8 sm:w-8 p-0 text-gray-600 hover:text-black hover:bg-gray-100 btn-action-click"
                            title="Editar"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          
                          {/* Dropdown com ações adicionais */}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-10 w-10 sm:h-8 sm:w-8 p-0 text-gray-600 hover:text-black hover:bg-gray-100"
                                title="Mais ações"
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              {showArchived ? (
                                <DropdownMenuItem 
                                  onClick={() => handleUnarchiveArrematante(arrematante)}
                                  className="hover:bg-gray-100 focus:bg-gray-100 hover:text-black focus:text-black"
                                >
                                  <RefreshCw className="h-4 w-4 mr-2" />
                                  <span>Desarquivar</span>
                                </DropdownMenuItem>
                              ) : (
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <DropdownMenuItem 
                                      onSelect={(e) => e.preventDefault()}
                                      className="hover:bg-gray-100 focus:bg-gray-100 hover:text-black focus:text-black"
                                    >
                                      <Archive className="h-4 w-4 mr-2" />
                                      <span>Arquivar</span>
                                    </DropdownMenuItem>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Arquivar Arrematante</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Tem certeza que deseja arquivar o arrematante "{arrematante.nome}"? Esta ação moverá o leilão para a seção de arquivados.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                      <AlertDialogAction 
                                        onClick={() => handleArchiveArrematante(arrematante)}
                                        className="bg-black hover:bg-gray-800 text-white btn-save-click"
                                      >
                                        Arquivar
                                      </AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              )}
                              
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <DropdownMenuItem 
                                    onSelect={(e) => e.preventDefault()} 
                                    className="text-red-600 focus:text-red-600 focus:bg-red-50"
                                  >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    <span>Excluir</span>
                                  </DropdownMenuItem>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Excluir Arrematante</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Tem certeza que deseja excluir o arrematante "{arrematante.nome}"? Esta ação não pode ser desfeita.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction 
                                      onClick={() => handleDeleteArrematante(arrematante)}
                                      className="bg-red-600 hover:bg-red-700 btn-save-click"
                                    >
                                      Excluir
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
              </div>

              {/* ⚡ PERFORMANCE: Paginação */}
              {filteredArrematantes.length > 0 && (
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={setPage}
                  showFirstLast={true}
                />
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal de Visualização */}
      <Dialog open={isViewModalOpen} onOpenChange={setIsViewModalOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-gray-900">
              Detalhes do Arrematante
            </DialogTitle>
            <DialogDescription>
              Visualize todas as informações detalhadas do arrematante
            </DialogDescription>
          </DialogHeader>

          {selectedArrematante && (
            <div className="space-y-4 sm:space-y-6">
              {(() => {
                // Obter o leilão e lote para verificar tipo de pagamento
                const auction = auctions.find(a => a.id === selectedArrematante.leilaoId);
                const loteArrematado = auction?.lotes?.find(lote => lote.id === selectedArrematante.loteId);
                const tipoPagamento = selectedArrematante.tipoPagamento || loteArrematado?.tipoPagamento || auction?.tipoPagamento || "parcelamento";
                
                return (
                  <>
                    {/* Informações básicas */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 lg:gap-6">
                      <div>
                        <Label className="text-sm font-medium text-gray-700">Nome do Arrematante</Label>
                        <p className="mt-1 p-3 bg-gray-50 border border-gray-200 rounded-md text-sm font-medium">
                          {selectedArrematante.nome}
                        </p>
                      </div>

                      <div>
                        <Label className="text-sm font-medium text-gray-700">Leilão</Label>
                        <p className="mt-1 p-3 bg-gray-50 border border-gray-200 rounded-md text-sm font-medium">
                          {selectedArrematante.leilaoNome}
                        </p>
                      </div>

                      <div>
                        <Label className="text-sm font-medium text-gray-700">Valor a Ser Pago</Label>
                        <p className="mt-1 p-3 bg-gray-50 border border-gray-200 rounded-md text-sm font-medium">
                          {new Intl.NumberFormat("pt-BR", { 
                            style: "currency", 
                            currency: "BRL" 
                          }).format(selectedArrematante.valorPagarNumerico || 0)}
                        </p>
                      </div>

                      {/* Próximo Pagamento - apenas para parcelamento ou entrada+parcelamento */}
                      {(tipoPagamento === "parcelamento" || tipoPagamento === "entrada_parcelamento") && (
                        <div>
                          <Label className="text-sm font-medium text-gray-700">Próximo Pagamento</Label>
                          <p className="mt-1 p-3 bg-gray-50 border border-gray-200 rounded-md text-sm">
                            {(() => {
                              let proximoPagamento;
                              if (tipoPagamento === "entrada_parcelamento") {
                                proximoPagamento = calculateNextPaymentDateEntradaParcelamento(selectedArrematante, auction);
                              } else {
                                proximoPagamento = calculateNextPaymentDate(selectedArrematante);
                              }
                              
                              if (!proximoPagamento) {
                                return "Quitado";
                              }
                              return proximoPagamento.toLocaleDateString("pt-BR");
                            })()}
                          </p>
                        </div>
                      )}

                      {/* Data de Vencimento À Vista - apenas para à vista */}
                      {tipoPagamento === "a_vista" && (
                        <div>
                          <Label className="text-sm font-medium text-gray-700">Data de Vencimento</Label>
                          <p className="mt-1 p-3 bg-gray-50 border border-gray-200 rounded-md text-sm">
                            {(loteArrematado?.dataVencimentoVista || auction?.dataVencimentoVista) ? 
                              new Date((loteArrematado?.dataVencimentoVista || auction?.dataVencimentoVista) + 'T00:00:00').toLocaleDateString('pt-BR') 
                              : 'Não definida'}
                          </p>
                        </div>
                      )}
                    </div>
                  </>
                );
              })()}

              {(() => {
                // Reutilizar a lógica de tipo de pagamento
                const auction = auctions.find(a => a.id === selectedArrematante.leilaoId);
                const loteArrematado = auction?.lotes?.find(lote => lote.id === selectedArrematante.loteId);
                const tipoPagamento = selectedArrematante.tipoPagamento || loteArrematado?.tipoPagamento || auction?.tipoPagamento || "parcelamento";
                
                return (
                  /* Status de pagamento formal */
                  <div>
                    <Label className="text-sm font-medium text-gray-700">Status do Pagamento</Label>
                    <div className="mt-1 p-4 border border-gray-200 rounded-lg bg-gray-50">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-full bg-gray-100">
                          {selectedArrematante.pago ? (
                            <svg className="h-5 w-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : selectedArrematante.statusPagamento === 'atrasado' ? (
                            <svg className="h-5 w-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                            </svg>
                          ) : (
                            <svg className="h-5 w-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          )}
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-semibold text-gray-800">
                            {selectedArrematante.pago 
                              ? 'Pagamento Realizado' 
                              : selectedArrematante.statusPagamento === 'atrasado'
                              ? 'Pagamento Atrasado'
                              : 'Aguardando Pagamento'}
                          </p>
                          <p className="text-xs text-gray-600">
                            {selectedArrematante.pago 
                              ? 'Transação confirmada com sucesso' 
                              : tipoPagamento === "a_vista"
                              ? `Vencimento: ${(loteArrematado?.dataVencimentoVista || auction?.dataVencimentoVista) ? 
                                  new Date((loteArrematado?.dataVencimentoVista || auction?.dataVencimentoVista) + 'T00:00:00').toLocaleDateString('pt-BR') 
                                  : 'Não definida'}`
                              : (() => {
                                  let proximoPagamento;
                                  if (tipoPagamento === "entrada_parcelamento") {
                                    proximoPagamento = calculateNextPaymentDateEntradaParcelamento(selectedArrematante, auction);
                                  } else {
                                    proximoPagamento = calculateNextPaymentDate(selectedArrematante);
                                  }
                                  
                                  if (!proximoPagamento) {
                                    return 'Todas as parcelas foram quitadas';
                                  }
                                  return `Próximo vencimento: ${proximoPagamento.toLocaleDateString('pt-BR')}`;
                                })()
                            }
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Documentos */}
              <div>
                <Label className="text-sm font-medium text-gray-700">Documentos</Label>
                <div className="mt-1 p-3 bg-gray-50 border border-gray-200 rounded-md min-h-[60px]">
                  {!selectedArrematante.documentos || selectedArrematante.documentos.length === 0 ? (
                    <p className="text-sm text-gray-500 italic">Nenhum documento adicionado</p>
                  ) : (
                    <div className="space-y-2">
                      {selectedArrematante.documentos.map((doc) => (
                        <div key={doc.id} className="flex items-center gap-3 p-2 bg-white border border-gray-200 rounded-md">
                          {getFileIcon(doc.tipo)}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">{doc.nome}</p>
                            <p className="text-xs text-gray-500">
                              {formatFileSize(doc.tamanho)}{(() => {
                                if (!doc.dataUpload) return '';
                                try {
                                  const date = new Date(doc.dataUpload);
                                  if (isNaN(date.getTime())) return '';
                                  return ` • ${date.toLocaleDateString('pt-BR')}`;
                                } catch {
                                  return '';
                                }
                              })()}
                            </p>
                          </div>
                          {doc.url && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                if (doc.url) {
                                  openDocumentSafely(doc.url, doc.nome || 'Documento');
                                }
                              }}
                              className="h-10 w-10 sm:h-8 sm:w-8 p-0 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                              title="Visualizar arquivo"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex justify-end pt-4 border-t border-gray-200">
                <Button
                  onClick={() => handleEditArrematante(selectedArrematante)}
                  className="h-11 px-6 bg-black hover:bg-gray-800 text-white font-medium"
                >
                  Editar Informações
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Wizard de Edição de Arrematante */}
      {isEditModalOpen && selectedArrematante && (() => {
        const auction = auctions.find(a => a.id === selectedArrematante.leilaoId);
        if (!auction) return null;

        return (
          <ArrematanteWizard
            initial={{
              arrematante: {
                // IDs e dados principais
                id: selectedArrematante.id,
                nome: selectedArrematante.nome,
                documento: selectedArrematante.documento,
                telefone: selectedArrematante.telefone,
                email: selectedArrematante.email,
                
                // Endereço (formato antigo + detalhado)
                endereco: selectedArrematante.endereco,
                cep: selectedArrematante.cep,
                rua: selectedArrematante.rua,
                numero: selectedArrematante.numero,
                complemento: selectedArrematante.complemento,
                bairro: selectedArrematante.bairro,
                cidade: selectedArrematante.cidade,
                estado: selectedArrematante.estado,
                
                // Lote e mercadoria
                loteId: selectedArrematante.loteId,
                mercadoriaId: selectedArrematante.mercadoriaId,
                
                // Valores e pagamento
                valorPagar: selectedArrematante.valorPagar,
                valorPagarNumerico: selectedArrematante.valorPagarNumerico,
                valorEntrada: selectedArrematante.valorEntrada,
                tipoPagamento: selectedArrematante.tipoPagamento,
                
                // Parcelamento
                quantidadeParcelas: selectedArrematante.quantidadeParcelas,
                mesInicioPagamento: selectedArrematante.mesInicioPagamento,
                diaVencimentoMensal: selectedArrematante.diaVencimentoMensal,
                parcelasPagas: selectedArrematante.parcelasPagas,
                
                // Datas específicas por tipo de pagamento
                dataEntrada: selectedArrematante.dataEntrada,
                dataVencimentoVista: selectedArrematante.dataVencimentoVista,
                
                // Juros e multas
                percentualJurosAtraso: selectedArrematante.percentualJurosAtraso,
                tipoJurosAtraso: selectedArrematante.tipoJurosAtraso,
                
                // Sistema de fator multiplicador e parcelas múltiplas
                valorLance: selectedArrematante.valorLance,
                fatorMultiplicador: selectedArrematante.fatorMultiplicador,
                usaFatorMultiplicador: selectedArrematante.usaFatorMultiplicador,
                parcelasTriplas: selectedArrematante.parcelasTriplas,
                parcelasDuplas: selectedArrematante.parcelasDuplas,
                parcelasSimples: selectedArrematante.parcelasSimples,
                
                // Status e documentos
                pago: selectedArrematante.pago,
                documentos: selectedArrematante.documentos,
                created_at: selectedArrematante.created_at,
              },
              lotes: auction.lotes || [],
              auctionName: auction.nome,
              auctionId: auction.id,
              auction: auction, // ✅ Passar o auction completo para acessar percentualComissaoLeiloeiro
              defaultDiaVencimento: auction.diaVencimentoPadrao,
              defaultQuantidadeParcelas: auction.parcelasPadrao,
              defaultMesInicio: auction.mesInicioPagamento,
            }}
            onSubmit={async (data) => {
              if (!selectedArrematante) return;
              
              setIsSavingEdit(true);
              try {
                // Processar documentos blob para base64
                const documentosProcessados = await Promise.all(
                  (data.documentos || []).map(async (doc) => {
                    if (doc.url && doc.url.startsWith('blob:')) {
                      try {
                        const response = await fetch(doc.url);
                        const blob = await response.blob();
                        const base64 = await new Promise<string>((resolve, reject) => {
                          const reader = new FileReader();
                          reader.onloadend = () => {
                            if (reader.result && typeof reader.result === 'string') {
                              resolve(reader.result);
                            } else {
                              reject(new Error('FileReader retornou resultado inválido'));
                            }
                          };
                          reader.onerror = () => reject(new Error('Erro no FileReader'));
                          reader.readAsDataURL(blob);
                        });
                        URL.revokeObjectURL(doc.url);
                        return { ...doc, url: base64 };
                      } catch (_error) {
                        return { ...doc, url: null };
                      }
                    }
                    return doc;
                  })
                );

                // Buscar o leilão atual para obter o array de arrematantes
                const currentAuction = auctions.find(a => a.id === selectedArrematante.leilaoId);
                if (!currentAuction) throw new Error('Leilão não encontrado');

                // Atualizar o arrematante específico no array
                const arrematantesAtualizados = (currentAuction.arrematantes || []).map(a =>
                  a.id === selectedArrematante.id
                    ? {
                      ...data,
                        id: selectedArrematante.id, // Manter o ID
                      nome: data.nome || selectedArrematante.nome, // Garantir que nome sempre existe
                      documentos: documentosProcessados
                    } as ArrematanteInfo
                    : a
                );

                await updateAuction({
                  id: selectedArrematante.leilaoId,
                  data: {
                    arrematantes: arrematantesAtualizados
                  }
                });

                // ✅ ATUALIZAR STATUS DO GUEST_LOT (se aplicável)
                if (data.loteId) {
                  const lote = currentAuction.lotes?.find(l => l.id === data.loteId);
                  logger.debug('📝 ARREMATANTES: Verificando lote', {
                    loteId: data.loteId,
                    lote,
                    guestLotId: lote?.guestLotId,
                    isConvidado: lote?.isConvidado,
                    numero: lote?.numero
                  });

                  if (lote) {
                    try {
                      let guestLotIdParaAtualizar = lote.guestLotId;

                      // Se não tem guestLotId mas é lote de convidado, buscar pelo número
                      if (!guestLotIdParaAtualizar && lote.isConvidado && lote.numero) {
                        logger.debug('🔍 ARREMATANTES: Buscando guest_lot pelo número', { numero: lote.numero });
                        const { data: guestLots } = await supabase
                          .from('guest_lots')
                          .select('id')
                          .eq('leilao_id', selectedArrematante.leilaoId)
                          .eq('numero', lote.numero)
                          .limit(1);

                        if (guestLots && guestLots.length > 0) {
                          guestLotIdParaAtualizar = guestLots[0].id;
                          logger.info('✅ ARREMATANTES: Guest_lot encontrado', { guestLotId: guestLotIdParaAtualizar });
                        }
                      }

                      if (guestLotIdParaAtualizar) {
                        const { error: guestLotError } = await supabase
                          .from('guest_lots')
                          .update({ status: 'arrematado' })
                          .eq('id', guestLotIdParaAtualizar);

                        if (guestLotError) {
                          logger.error('❌ ARREMATANTES: Erro ao atualizar guest_lot', { error: guestLotError });
                        } else {
                          logger.info('✅ ARREMATANTES: Status do guest_lot atualizado para arrematado');
                          await queryClient.invalidateQueries({ queryKey: ['guest-lots'] });
                        }
                      } else {
                        logger.debug('ℹ️ ARREMATANTES: Lote não é convidado ou guestLotId não encontrado');
                      }
                    } catch (error) {
                      logger.error('❌ ARREMATANTES: Erro ao atualizar guest_lot', { error });
                    }
                  }
                }

                setIsEditModalOpen(false);
                // Log da edição completa via wizard
                try {
                  await logBidderAction('update', data.nome || selectedArrematante.nome, selectedArrematante.leilaoNome || '', selectedArrematante.leilaoId, {
                    metadata: { edit_type: 'full_wizard_edit', has_documents: (data.documentos?.length || 0) > 0 }
                  });
                } catch { /* silenciar erro de log */ }
          setSelectedArrematante(null);
              } catch (error) {
                logger.error('Erro ao salvar', { error });
              } finally {
                setIsSavingEdit(false);
        }
            }}
            onCancel={() => {
              setIsEditModalOpen(false);
              setSelectedArrematante(null);
            }}
          />
        );
      })()}

      {/* Modal de Edição Antigo - REMOVIDO */}
      <Dialog open={false}>
        <DialogContent className="max-w-[95vw] sm:max-w-5xl max-h-[90vh] overflow-y-auto custom-scrollbar">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold text-gray-900">
              Editar Arrematante
            </DialogTitle>
            <DialogDescription>
              Edite as informações do arrematante
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 sm:space-y-6">
            {/* Formulário de edição */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 lg:gap-6">
              <div>
                <Label htmlFor="edit-nome" className="text-sm font-medium text-gray-700">
                  Nome do Arrematante
                </Label>
                <Input
                  id="edit-nome"
                  value={editForm.nome}
                  onChange={(e) => setEditForm(prev => ({ ...prev, nome: e.target.value }))}
                  className="mt-1 h-11 border-gray-300 bg-white no-focus-outline"
                  placeholder="Nome completo do arrematante"
                />
              </div>

              <div>
                <Label htmlFor="edit-email" className="text-sm font-medium text-gray-700">
                  Email (Opcional)
                </Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm(prev => ({ ...prev, email: e.target.value }))}
                  className="mt-1 h-11 border-gray-300 bg-white no-focus-outline"
                  placeholder="email@exemplo.com"
                />
              </div>

              <div>
                <Label htmlFor="edit-valor" className="text-sm font-medium text-gray-700">
                  Valor a Ser Pago
                </Label>
                <Input
                  id="edit-valor"
                  value={editForm.valorPagar}
                  onChange={(e) => setEditForm(prev => ({ ...prev, valorPagar: e.target.value }))}
                  className="mt-1 h-11 border-gray-300 bg-white no-focus-outline"
                  placeholder="R$ 0,00"
                />
              </div>
            </div>

            {/* Informações do Tipo de Pagamento */}
            {selectedArrematante && (() => {
              const auction = auctions.find(a => a.id === selectedArrematante.leilaoId);
              const loteArrematado = auction?.lotes?.find(lote => lote.id === selectedArrematante.loteId);
              const tipoPagamento = selectedArrematante.tipoPagamento || loteArrematado?.tipoPagamento || auction?.tipoPagamento || "parcelamento";
              
              return (
                <div className="border-t border-gray-200 pt-4">
                  <Label className="text-sm font-medium text-gray-700 mb-3 block">Informações de Pagamento</Label>
                  
                  {tipoPagamento === "a_vista" && (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <DollarSign className="h-5 w-5 text-gray-600" />
                        <span className="font-medium text-gray-800">Pagamento À Vista</span>
                      </div>
                      <p className="text-sm text-gray-700">
                        <strong>Data de vencimento:</strong> {' '}
                        {(loteArrematado?.dataVencimentoVista || auction?.dataVencimentoVista) ? 
                          new Date((loteArrematado?.dataVencimentoVista || auction?.dataVencimentoVista) + 'T00:00:00').toLocaleDateString('pt-BR') 
                          : 'Não definida'}
                      </p>
                    </div>
                  )}

                  {tipoPagamento === "entrada_parcelamento" && (
                    <div className="space-y-3">
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <CreditCard className="h-5 w-5 text-gray-600" />
                          <span className="font-medium text-gray-800">Entrada + Parcelamento</span>
                        </div>
                        <div className="space-y-1 text-sm text-gray-700">
                          <p><strong>Data da entrada:</strong> {(loteArrematado?.dataEntrada || auction?.dataEntrada) ? 
                            new Date((loteArrematado?.dataEntrada || auction?.dataEntrada) + 'T00:00:00').toLocaleDateString('pt-BR') 
                            : 'Não definida'}</p>
                          <p><strong>Parcelas:</strong> {(() => {
                            const valorTotal = selectedArrematante.valorPagarNumerico || 0;
                            const temEstruturaParcelas = selectedArrematante?.usaFatorMultiplicador && 
                              (selectedArrematante?.parcelasTriplas != null || 
                               selectedArrematante?.parcelasDuplas != null || 
                               selectedArrematante?.parcelasSimples != null);
                            
                            if (temEstruturaParcelas) {
                              return descreverEstruturaParcelas(
                                selectedArrematante?.parcelasTriplas || 0,
                                selectedArrematante?.parcelasDuplas || 0,
                                selectedArrematante?.parcelasSimples || 0,
                                valorTotal
                              );
                            } else {
                              // Sistema antigo: divisão simples
                            const valorPorParcela = valorTotal / selectedArrematante.quantidadeParcelas;
                              return `${selectedArrematante.quantidadeParcelas}x de R$ ${valorPorParcela.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                            }
                          })()} • Vence dia {selectedArrematante.diaVencimentoMensal}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {tipoPagamento === "parcelamento" && (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Calendar className="h-5 w-5 text-gray-600" />
                        <span className="font-medium text-gray-800">Parcelamento</span>
                      </div>
                      <div className="space-y-1 text-sm text-gray-700">
                        <p><strong>Parcelas:</strong> {(() => {
                          const valorTotal = selectedArrematante.valorPagarNumerico || 0;
                          const temEstruturaParcelas = selectedArrematante?.usaFatorMultiplicador && 
                            (selectedArrematante?.parcelasTriplas != null || 
                             selectedArrematante?.parcelasDuplas != null || 
                             selectedArrematante?.parcelasSimples != null);
                          
                          if (temEstruturaParcelas) {
                            return descreverEstruturaParcelas(
                              selectedArrematante?.parcelasTriplas || 0,
                              selectedArrematante?.parcelasDuplas || 0,
                              selectedArrematante?.parcelasSimples || 0,
                              valorTotal
                            );
                          } else {
                            // Sistema antigo: divisão simples
                            const valorPorParcela = valorTotal / selectedArrematante.quantidadeParcelas;
                            return `${selectedArrematante.quantidadeParcelas}x de R$ ${valorPorParcela.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                          }
                        })()}</p>
                        <p><strong>Vencimento:</strong> Todo dia {selectedArrematante.diaVencimentoMensal} • {(() => {
                          const auction = auctions.find(a => a.arrematante && a.arrematante.nome === selectedArrematante.nome);
                          const loteArrematado = auction?.lotes?.find((lote: LoteInfo) => lote.id === selectedArrematante.loteId);
                          const tipoPagamento = selectedArrematante.tipoPagamento || loteArrematado?.tipoPagamento || auction?.tipoPagamento || "parcelamento";
                          const parcelasPagas = selectedArrematante.parcelasPagas || 0;
                          const quantidadeParcelas = selectedArrematante.quantidadeParcelas || 0;
                          
                          if (tipoPagamento === "entrada_parcelamento") {
                            const totalParcelas = 1 + quantidadeParcelas;
                            return `${parcelasPagas} de ${totalParcelas} pagas`;
                          } else {
                            return `${parcelasPagas} de ${quantidadeParcelas} pagas`;
                          }
                        })()}</p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Documentos */}
            <div className="space-y-3">
              <Label className="text-sm font-medium text-gray-700">Documentos</Label>
              
              {/* Lista de documentos */}
              {editForm.documentos.length > 0 && (
                <div className="space-y-2 p-3 bg-gray-50 border border-gray-200 rounded-md max-h-40 overflow-y-auto">
                  {editForm.documentos.map((doc) => (
                    <div key={doc.id} className="flex items-center gap-3 p-2 bg-white border border-gray-200 rounded-md">
                      {getFileIcon(doc.tipo)}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{doc.nome}</p>
                        <p className="text-xs text-gray-500">
                          {formatFileSize(doc.tamanho)} • {new Date(doc.dataUpload).toLocaleDateString('pt-BR')}
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
                                openDocumentSafely(doc.url, doc.nome || 'Documento');
                              }
                            }}
                            className="h-7 w-7 p-0 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
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
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              {/* Área de upload */}
              <div 
                className="border-2 border-dashed border-gray-300 rounded-lg p-3 sm:p-4 lg:p-6 hover:border-gray-400 transition-colors"
                onDragOver={handleDragOver}
                onDrop={handleDrop}
              >
                <div className="text-center">
                  <Paperclip className="mx-auto h-10 w-10 sm:h-8 sm:w-8 text-gray-400 mb-2" />
                  <p className="text-sm font-medium text-gray-900 mb-1">Adicionar documentos</p>
                  <p className="text-xs text-gray-500 mb-3">
                    Arraste arquivos aqui ou clique para selecionar
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2 justify-center">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => document.getElementById('file-upload-edit')?.click()}
                      className="h-9 px-4 border-gray-300 hover:bg-gray-100 hover:text-gray-900 transition-colors"
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Selecionar Arquivos
                    </Button>
                  </div>
                  <input
                    id="file-upload-edit"
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
                onClick={() => setIsEditModalOpen(false)}
                className="h-11 px-6 border-gray-300 text-gray-700 hover:bg-gray-100 hover:text-black"
              >
                Cancelar
              </Button>
              <Button
                type="button"
                onClick={handleSaveEdit}
                disabled={isSavingEdit || !editForm.nome || !editForm.valorPagar}
                className="h-11 px-6 bg-black hover:bg-gray-800 text-white font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 btn-save-click"
              >
                {isSavingEdit ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <><span className="hidden sm:inline">Salvar Alterações</span><span className="sm:hidden">Salvar</span></>
                )}
              </Button>
            </div>
          </div>
          </DialogContent>
        </Dialog>

        {/* Modal de Confirmação de Pagamentos */}
        <Dialog 
          open={isPaymentModalOpen} 
          onOpenChange={(open) => {
            // Impedir fechamento do modal durante o salvamento
            if (!open && isSavingPayments) {
              return;
            }
            setIsPaymentModalOpen(open);
          }}
        >
          <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-hidden">
            <DialogHeader className="pb-4">
              <DialogTitle className="text-lg font-medium text-gray-900">
                Confirmação de Pagamentos
              </DialogTitle>
              <DialogDescription className="text-sm text-gray-600">
                {selectedArrematanteForPayment && (() => {
                  const auction = auctions.find(a => a.id === selectedArrematanteForPayment.leilaoId);
                  const loteArrematado = auction?.lotes?.find(lote => lote.id === selectedArrematanteForPayment.loteId);
                  const tipoPagamento = selectedArrematanteForPayment.tipoPagamento || loteArrematado?.tipoPagamento || auction?.tipoPagamento || "parcelamento";
                  
                  if (tipoPagamento === "a_vista") {
                    return `${selectedArrematanteForPayment.nome} • Pagamento à Vista`;
                  } else {
                    const auction = auctions.find(a => a.arrematante && a.arrematante.nome === selectedArrematanteForPayment.nome);
                    const loteArrematado = auction?.lotes?.find((lote: LoteInfo) => lote.id === selectedArrematanteForPayment.loteId);
                    const tipoPagamento = selectedArrematanteForPayment.tipoPagamento || loteArrematado?.tipoPagamento || auction?.tipoPagamento || "parcelamento";
                    
                    if (tipoPagamento === "entrada_parcelamento") {
                      // Para entrada + parcelamento, o total já inclui a entrada
                      return `${selectedArrematanteForPayment.nome} • ${paymentMonths.filter(m => m.paid).length}/${paymentMonths.length} pagas`;
                  } else {
                    return `${selectedArrematanteForPayment.nome} • ${paymentMonths.filter(m => m.paid).length}/${paymentMonths.length} pagas`;
                    }
                  }
                })()}
              </DialogDescription>
            </DialogHeader>

            {selectedArrematanteForPayment && (
              <div className="space-y-4">
                {/* Lista de Meses Minimalista */}
                <div className="space-y-1">
                  <div className="max-h-72 overflow-y-auto">
                    {paymentMonths.map((month, index) => (
                      <div key={index} 
                           className={`flex-col gap-2 sm:flex-row sm:items-center sm:justify-between flex p-3 border-b border-gray-100 last:border-b-0 ${
                             month.paid ? 'bg-gray-50' : 'bg-white'
                           }`}
                      >
                        <div className="flex items-center space-x-3">
                          <Checkbox
                            id={`month-${index}`}
                            checked={month.paid}
                            onCheckedChange={(checked) => handlePaymentToggle(index, checked as boolean)}
                          />
                          <div>
                            <Label 
                              htmlFor={`month-${index}`} 
                              className="text-sm font-medium text-gray-900 cursor-pointer"
                            >
                              {month.monthName}
                            </Label>
                            <p className="text-xs text-gray-500">
                              Vence em {month.dueDate}
                            </p>
                          </div>
                        </div>
                        
                        <div className="text-right">
                          <p className="text-sm font-medium text-gray-900">
                            R$ {(() => {
                              const auction = auctions.find(a => a.id === selectedArrematanteForPayment.leilaoId);
                              const loteArrematado = auction?.lotes?.find(lote => lote.id === selectedArrematanteForPayment.loteId);
                              const tipoPagamento = selectedArrematanteForPayment.tipoPagamento || loteArrematado?.tipoPagamento || auction?.tipoPagamento || "parcelamento";
                              
                              // Função para calcular juros progressivos
                              const calcularJurosProgressivos = (valorOriginal: number, percentualJuros: number, mesesAtraso: number) => {
                                if (mesesAtraso < 1 || !percentualJuros) {
                                  return valorOriginal;
                                }
                                let valorAtual = valorOriginal;
                                const taxaMensal = percentualJuros / 100;
                                for (let mes = 1; mes <= mesesAtraso; mes++) {
                                  const jurosMes = valorAtual * taxaMensal;
                                  valorAtual = valorAtual + jurosMes;
                                }
                                return Math.round(valorAtual * 100) / 100;
                              };
                              
                              // Verificar se a parcela está atrasada e aplicar juros
                              const now = new Date();
                              const dueDate = new Date(month.dueDate.split('/').reverse().join('-') + 'T23:59:59');
                              // Se a parcela foi paga com atraso, ainda deve mostrar o valor com juros
                              const wasOverdue = now > dueDate;
                              const _isOverdue = wasOverdue && !month.paid;
                              
                              if (tipoPagamento === "a_vista") {
                                // 💰 PAGAMENTO À VISTA: Valor total com juros se atrasado ou pago com atraso
                                let valorFinal = selectedArrematanteForPayment.valorPagarNumerico;
                                
                                if (wasOverdue && selectedArrematanteForPayment.percentualJurosAtraso) {
                                  const mesesAtraso = Math.max(0, Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24 * 30)));
                                  if (mesesAtraso >= 1) {
                                    valorFinal = calcularJurosProgressivos(valorFinal, selectedArrematanteForPayment.percentualJurosAtraso, mesesAtraso);
                                  }
                                }
                                
                                return valorFinal.toLocaleString('pt-BR', { 
                                  minimumFractionDigits: 2, 
                                  maximumFractionDigits: 2 
                                });
                              } else if (tipoPagamento === "entrada_parcelamento") {
                                // 💳 ENTRADA + PARCELAMENTO: Diferenciar entrada de parcelas
                                if (month.isEntrada) {
                                  // Valor da entrada com juros se atrasada
                                  let valorEntrada = selectedArrematanteForPayment.valorEntrada ? 
                                    parseCurrencyToNumber(selectedArrematanteForPayment.valorEntrada) : 0;
                                  
                                  if (wasOverdue && selectedArrematanteForPayment.percentualJurosAtraso) {
                                    const mesesAtraso = Math.max(0, Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24 * 30)));
                                    if (mesesAtraso >= 1) {
                                      valorEntrada = calcularJurosProgressivos(valorEntrada, selectedArrematanteForPayment.percentualJurosAtraso, mesesAtraso);
                                    }
                                  }
                                  
                                  return valorEntrada.toLocaleString('pt-BR', { 
                                    minimumFractionDigits: 2, 
                                    maximumFractionDigits: 2 
                                  });
                                } else {
                                  // ✅ Valor de cada parcela (entrada e parcelas são independentes)
                                  const valorTotal = selectedArrematanteForPayment.valorPagarNumerico;
                                  
                                  // Verificar se usa estrutura de parcelas (triplas/duplas/simples)
                                  const temEstruturaParcelas = selectedArrematanteForPayment?.usaFatorMultiplicador && 
                                    (selectedArrematanteForPayment?.parcelasTriplas != null || 
                                     selectedArrematanteForPayment?.parcelasDuplas != null || 
                                     selectedArrematanteForPayment?.parcelasSimples != null);
                                  
                                  let valorPorParcela = 0;
                                  if (temEstruturaParcelas) {
                                    // Calcular estrutura e pegar valor da parcela específica
                                    const estrutura = calcularEstruturaParcelas(
                                      valorTotal,
                                      selectedArrematanteForPayment?.parcelasTriplas || 0,
                                      selectedArrematanteForPayment?.parcelasDuplas || 0,
                                      selectedArrematanteForPayment?.parcelasSimples || 0
                                    );
                                    // Index - 1 porque a primeira entrada não está na estrutura
                                    const parcelaIndex = index - 1;
                                    valorPorParcela = estrutura[parcelaIndex]?.valor || (valorTotal / selectedArrematanteForPayment.quantidadeParcelas);
                                  } else {
                                    // Sistema antigo: divisão simples
                                    valorPorParcela = valorTotal / selectedArrematanteForPayment.quantidadeParcelas;
                                  }
                                  
                                  if (wasOverdue && selectedArrematanteForPayment.percentualJurosAtraso) {
                                    const mesesAtraso = Math.max(0, Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24 * 30)));
                                    if (mesesAtraso >= 1) {
                                      valorPorParcela = calcularJurosProgressivos(valorPorParcela, selectedArrematanteForPayment.percentualJurosAtraso, mesesAtraso);
                                    }
                                  }
                                  
                                  return valorPorParcela.toLocaleString('pt-BR', { 
                                    minimumFractionDigits: 2, 
                                    maximumFractionDigits: 2 
                                  });
                                }
                              } else {
                                // 📅 PARCELAMENTO SIMPLES: Valor dividido com juros se atrasado
                                const valorTotal = selectedArrematanteForPayment.valorPagarNumerico;
                                
                                // Verificar se usa estrutura de parcelas (triplas/duplas/simples)
                                const temEstruturaParcelas = selectedArrematanteForPayment?.usaFatorMultiplicador && 
                                  (selectedArrematanteForPayment?.parcelasTriplas != null || 
                                   selectedArrematanteForPayment?.parcelasDuplas != null || 
                                   selectedArrematanteForPayment?.parcelasSimples != null);
                                
                                let valorPorParcela = 0;
                                if (temEstruturaParcelas) {
                                  // Calcular estrutura e pegar valor da parcela específica
                                  const estrutura = calcularEstruturaParcelas(
                                    valorTotal,
                                    selectedArrematanteForPayment?.parcelasTriplas || 0,
                                    selectedArrematanteForPayment?.parcelasDuplas || 0,
                                    selectedArrematanteForPayment?.parcelasSimples || 0
                                  );
                                  valorPorParcela = estrutura[index]?.valor || (valorTotal / selectedArrematanteForPayment.quantidadeParcelas);
                                } else {
                                  // Sistema antigo: divisão simples
                                  valorPorParcela = valorTotal / selectedArrematanteForPayment.quantidadeParcelas;
                                }
                                
                                if (wasOverdue && selectedArrematanteForPayment.percentualJurosAtraso) {
                                  const mesesAtraso = Math.max(0, Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24 * 30)));
                                  if (mesesAtraso >= 1) {
                                    valorPorParcela = calcularJurosProgressivos(valorPorParcela, selectedArrematanteForPayment.percentualJurosAtraso, mesesAtraso);
                                  }
                                }
                                
                                return valorPorParcela.toLocaleString('pt-BR', { 
                                  minimumFractionDigits: 2, 
                                  maximumFractionDigits: 2 
                                });
                              }
                            })()}
                          </p>
                          {month.paid && (
                            <p className={`text-xs ${
                              (() => {
                                // Verificar se pagamento foi feito com atraso
                                const today = new Date();
                                const dueDate = new Date(month.dueDate.split('/').reverse().join('-') + 'T23:59:59');
                                const isLate = today > dueDate;
                                return isLate ? 'text-red-600' : 'text-green-600';
                              })()
                            }`}>
                              {(() => {
                                // Verificar se pagamento foi feito com atraso
                                const today = new Date();
                                const dueDate = new Date(month.dueDate.split('/').reverse().join('-') + 'T23:59:59');
                                const isLate = today > dueDate;
                                return isLate ? 'Pago com atraso' : 'Pago';
                              })()}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Rodapé Simples */}
                <div className="flex justify-between items-center pt-4 border-gray-200">
                  <div className="text-sm text-gray-600">
                    Total: {(() => {
                      // Calcular total considerando juros das parcelas atrasadas
                      const auction = auctions.find(a => a.id === selectedArrematanteForPayment.leilaoId);
                      const loteArrematado = auction?.lotes?.find(lote => lote.id === selectedArrematanteForPayment.loteId);
                      const tipoPagamento = selectedArrematanteForPayment.tipoPagamento || loteArrematado?.tipoPagamento || auction?.tipoPagamento || "parcelamento";
                      const now = new Date();
                      
                      // Função para calcular juros progressivos (mesma do modal)
                      const calcularJurosProgressivos = (valorOriginal: number, percentualJuros: number, mesesAtraso: number) => {
                        if (mesesAtraso < 1 || !percentualJuros) {
                          return valorOriginal;
                        }
                        let valorAtual = valorOriginal;
                        const taxaMensal = percentualJuros / 100;
                        for (let mes = 1; mes <= mesesAtraso; mes++) {
                          const jurosMes = valorAtual * taxaMensal;
                          valorAtual = valorAtual + jurosMes;
                        }
                        return Math.round(valorAtual * 100) / 100;
                      };
                      
                      let totalComJuros = 0;
                      
                      // Verificar se usa estrutura de parcelas (triplas/duplas/simples)
                      const temEstruturaParcelas = selectedArrematanteForPayment?.usaFatorMultiplicador && 
                        (selectedArrematanteForPayment?.parcelasTriplas != null || 
                         selectedArrematanteForPayment?.parcelasDuplas != null || 
                         selectedArrematanteForPayment?.parcelasSimples != null);
                      
                      let estruturaParcelas: Array<{ numero: number; tipo: string; valor: number; multiplicador: number }> = [];
                      if (temEstruturaParcelas) {
                        estruturaParcelas = calcularEstruturaParcelas(
                          selectedArrematanteForPayment.valorPagarNumerico,
                          selectedArrematanteForPayment?.parcelasTriplas || 0,
                          selectedArrematanteForPayment?.parcelasDuplas || 0,
                          selectedArrematanteForPayment?.parcelasSimples || 0
                        );
                      }
                      
                      paymentMonths.forEach((month, monthIndex) => {
                        const dueDate = new Date(month.dueDate.split('/').reverse().join('-') + 'T23:59:59');
                        const wasOverdue = now > dueDate;
                        const _isOverdue = wasOverdue && !month.paid;
                        
                        if (tipoPagamento === "a_vista") {
                          let valorFinal = selectedArrematanteForPayment.valorPagarNumerico;
                          if (wasOverdue && selectedArrematanteForPayment.percentualJurosAtraso) {
                            const mesesAtraso = Math.max(0, Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24 * 30)));
                            if (mesesAtraso >= 1) {
                              valorFinal = calcularJurosProgressivos(valorFinal, selectedArrematanteForPayment.percentualJurosAtraso, mesesAtraso);
                            }
                          }
                          totalComJuros += valorFinal;
                        } else if (tipoPagamento === "entrada_parcelamento") {
                          if (month.isEntrada) {
                            let valorEntrada = selectedArrematanteForPayment.valorEntrada ? 
                              parseCurrencyToNumber(selectedArrematanteForPayment.valorEntrada) : 0;
                            if (wasOverdue && selectedArrematanteForPayment.percentualJurosAtraso) {
                              const mesesAtraso = Math.max(0, Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24 * 30)));
                              if (mesesAtraso >= 1) {
                                valorEntrada = calcularJurosProgressivos(valorEntrada, selectedArrematanteForPayment.percentualJurosAtraso, mesesAtraso);
                              }
                            }
                            totalComJuros += valorEntrada;
                          } else {
                            const valorTotal = selectedArrematanteForPayment.valorPagarNumerico;
                            
                            // Calcular valor da parcela baseado na estrutura
                            let valorPorParcela = 0;
                            if (temEstruturaParcelas) {
                              const parcelaIndex = monthIndex - 1; // -1 porque entrada é o primeiro item
                              valorPorParcela = estruturaParcelas[parcelaIndex]?.valor || (valorTotal / selectedArrematanteForPayment.quantidadeParcelas);
                            } else {
                              valorPorParcela = valorTotal / selectedArrematanteForPayment.quantidadeParcelas;
                            }
                            
                            if (wasOverdue && selectedArrematanteForPayment.percentualJurosAtraso) {
                              const mesesAtraso = Math.max(0, Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24 * 30)));
                              if (mesesAtraso >= 1) {
                                valorPorParcela = calcularJurosProgressivos(valorPorParcela, selectedArrematanteForPayment.percentualJurosAtraso, mesesAtraso);
                              }
                            }
                            totalComJuros += valorPorParcela;
                          }
                        } else {
                          const valorTotal = selectedArrematanteForPayment.valorPagarNumerico;
                          
                          // Calcular valor da parcela baseado na estrutura
                          let valorPorParcela = 0;
                          if (temEstruturaParcelas) {
                            valorPorParcela = estruturaParcelas[monthIndex]?.valor || (valorTotal / selectedArrematanteForPayment.quantidadeParcelas);
                          } else {
                            valorPorParcela = valorTotal / selectedArrematanteForPayment.quantidadeParcelas;
                          }
                          
                          if (wasOverdue && selectedArrematanteForPayment.percentualJurosAtraso) {
                            const mesesAtraso = Math.max(0, Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24 * 30)));
                            if (mesesAtraso >= 1) {
                              valorPorParcela = calcularJurosProgressivos(valorPorParcela, selectedArrematanteForPayment.percentualJurosAtraso, mesesAtraso);
                            }
                          }
                          totalComJuros += valorPorParcela;
                        }
                      });
                      
                      return `R$ ${totalComJuros.toLocaleString('pt-BR', { 
                        minimumFractionDigits: 2, 
                        maximumFractionDigits: 2 
                      })}`;
                    })()}
                  </div>
                  
                  <div className="flex gap-3">
                    <Button 
                      variant="outline" 
                      onClick={() => {
                        setIsPaymentModalOpen(false);
                        setSelectedArrematanteForPayment(null);
                        setPaymentMonths([]);
                      }}
                      disabled={isSavingPayments}
                      className="hover:bg-gray-100 hover:text-gray-800"
                    >
                      Cancelar
                    </Button>
                    <Button 
                      onClick={handleSavePayments}
                      disabled={isSavingPayments}
                      className="bg-black hover:bg-gray-800 text-white disabled:opacity-50 disabled:cursor-not-allowed btn-save-click"
                    >
                      {isSavingPayments ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Confirmando...
                        </>
                      ) : (
                        "Confirmar"
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Modal de Edição Completa */}
        <Dialog open={isFullEditModalOpen} onOpenChange={(open) => {
          if (!open) {
            handleCloseFullEdit();
          }
        }}>
          <DialogContent 
            className="max-w-[95vw] sm:max-w-6xl max-h-[90vh] overflow-y-auto"
            onEscapeKeyDown={(_e) => {
              handleCloseFullEdit();
            }}
          >
            <DialogHeader>
              <DialogTitle className="text-xl font-semibold">
                Editar Arrematante - Informações Completas
              </DialogTitle>
              <DialogDescription className="text-sm text-gray-600">
                {selectedArrematanteForFullEdit && (
                  <span className="font-medium">
                    {auctions.find(a => a.id === selectedArrematanteForFullEdit.leilaoId)?.nome}
                  </span>
                )}
              </DialogDescription>
            </DialogHeader>
            
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
              
              <div className="arrematante-form">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Nome */}
                  <div>
                    <Label htmlFor="full-edit-nome" className="text-sm font-medium text-gray-700">Nome do Arrematante</Label>
                    <Input
                      id="full-edit-nome"
                      type="text"
                      value={fullEditForm.nome}
                      onChange={(e) => handleFullEditFormChange("nome", e.target.value)}
                      className="h-10"
                      placeholder="Digite o nome completo"
                    />
                  </div>

                  {/* Documento */}
                  <div>
                    <Label htmlFor="full-edit-documento" className="text-sm font-medium text-gray-700">Documento (CPF/CNPJ)</Label>
                    <Input
                      id="full-edit-documento"
                      type="text"
                      value={fullEditForm.documento}
                      onChange={(e) => handleFullEditFormChange("documento", e.target.value)}
                      className="h-10"
                      placeholder="Digite o CPF ou CNPJ"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Email */}
                  <div>
                    <Label htmlFor="full-edit-email" className="text-sm font-medium text-gray-700">Email</Label>
                    <Input
                      id="full-edit-email"
                      type="email"
                      value={fullEditForm.email}
                      onChange={(e) => handleFullEditFormChange("email", e.target.value)}
                      className="h-10"
                      placeholder="exemplo@email.com"
                    />
                  </div>

                  {/* Telefone */}
                  <div>
                    <Label htmlFor="full-edit-telefone" className="text-sm font-medium text-gray-700">Telefone</Label>
                    <Input
                      id="full-edit-telefone"
                      type="text"
                      value={fullEditForm.telefone}
                      onChange={(e) => {
                        const formatted = formatPhoneNumber(e.target.value);
                        handleFullEditFormChange("telefone", formatted);
                      }}
                      className="h-10"
                      placeholder="+55 (11) 99999-9999"
                    />
                  </div>
                </div>

                {/* Endereço */}
                <div>
                  <Label htmlFor="full-edit-endereco" className="text-sm font-medium text-gray-700">Endereço Completo</Label>
                  <Input
                    id="full-edit-endereco"
                    type="text"
                    value={fullEditForm.endereco}
                    onChange={(e) => handleFullEditFormChange("endereco", e.target.value)}
                    className="h-10"
                    placeholder="Rua, número, bairro, cidade, CEP"
                  />
                </div>

                {/* Lote Arrematado */}
                {selectedArrematanteForFullEdit && (
                  <div>
                    <Label className="text-sm font-medium text-gray-700">Lote Arrematado</Label>
                    <Select
                      value={fullEditForm.loteId}
                      onValueChange={(value) => handleFullEditFormChange("loteId", value)}
                    >
                      <SelectTrigger className="h-10 focus:!ring-0 focus:!ring-offset-0 focus:!border-gray-300 focus:!outline-none focus:!shadow-none">
                        <SelectValue placeholder="Selecione o lote arrematado" />
                      </SelectTrigger>
                      <SelectContent>
                        {auctions
                          .find(a => a.id === selectedArrematanteForFullEdit.leilaoId)?.lotes
                          ?.map((lote) => (
                            <SelectItem key={lote.id} value={lote.id}>
                              Lote {lote.numero} - {lote.descricao}
                            </SelectItem>
                          ))
                        }
                      </SelectContent>
                    </Select>
                  </div>
                )}

{/* Configurações de Pagamento baseadas no tipo do lote arrematado (prioridade) ou do leilão */}
                {(() => {
                  const currentAuction = selectedArrematanteForFullEdit ? 
                    auctions.find(a => a.id === selectedArrematanteForFullEdit.leilaoId) : null;
                  
                  // Obter o lote arrematado para verificar se tem configurações específicas
                  const loteArrematado = currentAuction?.lotes?.find(lote => lote.id === selectedArrematanteForFullEdit?.loteId);
                  
                  // Priorizar tipoPagamento do arrematante > lote > leilão
                  const tipoPagamento = selectedArrematanteForFullEdit?.tipoPagamento || loteArrematado?.tipoPagamento || currentAuction?.tipoPagamento || "parcelamento";

                  return (
                    <>
                      {/* Valor a Pagar */}
                      <div>
                        <Label htmlFor="full-edit-valor" className="text-sm font-medium text-gray-700">
                          Valor a Ser Pago
                        </Label>
                        <Input
                          id="full-edit-valor"
                          type="text"
                          value={fullEditForm.valorPagar}
                          onChange={(e) => handleFullEditFormChange("valorPagar", e.target.value)}
                          className="h-10"
                          placeholder="R$ 0,00"
                        />
                      </div>

                      {/* ✅ Card de comissão para pagamento à vista */}
                      {tipoPagamento === "a_vista" && fullEditForm.valorPagar && (() => {
                        const valorPagarParsed = parseCurrencyToNumber(fullEditForm.valorPagar);
                        if (valorPagarParsed && valorPagarParsed > 0) {
                          // Aplicar comissão do leiloeiro se houver
                          const percentualComissao = currentAuction?.percentualComissaoLeiloeiro || 0;
                          const valorComComissao = percentualComissao > 0 
                            ? valorPagarParsed * (1 + percentualComissao / 100)
                            : valorPagarParsed;
                          
                          return (
                            <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                              {percentualComissao > 0 && (
                                <p className="text-sm text-gray-600 italic mb-2">
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
                            </div>
                          );
                        }
                        return null;
                      })()}

                      {/* Configurações específicas por tipo de pagamento */}
                      {tipoPagamento === "a_vista" && (
                        <div className="border-t border-gray-200 pt-4">
                          <h3 className="text-lg font-medium text-gray-900 mb-4">Configuração de Pagamento À Vista</h3>
                          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                            <div className="flex items-center gap-2 mb-2">
                              <DollarSign className="h-5 w-5 text-gray-600" />
                              <span className="font-medium text-gray-800">Pagamento À Vista</span>
                            </div>
                            <p className="text-sm text-gray-700">
                              <strong>Data de vencimento:</strong> {' '}
                              <span className="font-semibold">
                                {(loteArrematado?.dataVencimentoVista || currentAuction?.dataVencimentoVista) ? 
                                  new Date((loteArrematado?.dataVencimentoVista || currentAuction?.dataVencimentoVista) + 'T00:00:00').toLocaleDateString('pt-BR') 
                                  : 'Não definida'}
                              </span>
                            </p>
                          </div>
                        </div>
                      )}

                      {tipoPagamento === "entrada_parcelamento" && (
                        <div className="border-t border-gray-200 pt-4">
                          <h3 className="text-lg font-medium text-gray-900 mb-4">Configuração de Entrada + Parcelamento</h3>
                          
                          {/* Configuração da entrada */}
                          <div className="space-y-4">
                            <div className="flex items-center gap-2">
                              <CreditCard className="h-5 w-5 text-gray-600" />
                              <h4 className="font-medium text-gray-800">Configuração da Entrada</h4>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <Label className="text-sm font-medium text-gray-700">Data de Vencimento da Entrada</Label>
                                <StringDatePicker
                                  value={(loteArrematado?.dataEntrada || currentAuction?.dataEntrada) || ""}
                                  onChange={(value) => {
                                    // Aqui você pode implementar a lógica para salvar a data de entrada
                                    // Por enquanto, vamos manter como read-only mostrando a data configurada
                                    logger.debug('Data de entrada alterada', { value });
                                  }}
                                  placeholder="dd/mm/aaaa"
                                  disabled={true} // Manter como read-only por enquanto
                                  className="bg-gray-100"
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                  Data configurada no leilão/lote
                                </p>
                              </div>
                              
                              <div>
                                <Label className="text-sm font-medium text-gray-700">Valor da Entrada</Label>
                                <Input
                                  type="text"
                                  value={fullEditForm.valorEntrada}
                                  onChange={(e) => {
                                    let value = e.target.value.replace(/[^\d]/g, '');
                                    if (value) {
                                      value = (parseInt(value) / 100).toLocaleString('pt-BR', {
                                        style: 'currency',
                                        currency: 'BRL'
                                      });
                                    }
                                    handleFullEditFormChange("valorEntrada", value);
                                  }}
                                  placeholder="R$ 0,00"
                                  className="w-full"
                                />
                              </div>
                            </div>
                          </div>

                          {/* Configurações das parcelas */}
                          <div className="space-y-4">
                            <h4 className="font-medium text-gray-800">Configuração das Parcelas (após entrada)</h4>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <Label className="text-sm font-medium text-gray-700">Dia Vencimento das Parcelas</Label>
                                <Select
                                  value={fullEditForm.diaVencimentoMensal.toString()}
                                  onValueChange={(value) => handleFullEditFormChange("diaVencimentoMensal", parseInt(value))}
                                >
                                  <SelectTrigger className="h-10 focus:!ring-0 focus:!ring-offset-0 focus:!border-gray-300 focus:!outline-none focus:!shadow-none">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                                      <SelectItem key={day} value={day.toString()}>
                                        Dia {day}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>

                              <div>
                                <Label className="text-sm font-medium text-gray-700">Mês de Início das Parcelas</Label>
                                <Select
                                  value={fullEditForm.mesInicioPagamento}
                                  onValueChange={(value) => handleFullEditFormChange("mesInicioPagamento", value)}
                                >
                                  <SelectTrigger className="h-10 focus:!ring-0 focus:!ring-offset-0 focus:!border-gray-300 focus:!outline-none focus:!shadow-none">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {Array.from({ length: 12 }, (_, i) => {
                                      const currentYear = new Date().getFullYear();
                                      const monthValue = `${currentYear}-${String(i + 1).padStart(2, '0')}`;
                                      const monthName = new Date(currentYear, i, 1).toLocaleDateString('pt-BR', { month: 'long' });
                                      return (
                                        <SelectItem key={monthValue} value={monthValue}>
                                          {monthName.charAt(0).toUpperCase() + monthName.slice(1)} de {currentYear}
                                        </SelectItem>
                                      );
                                    })}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              <div>
                                <Label htmlFor="full-edit-parcelas" className="text-sm font-medium text-gray-700">
                                  Quantidade de Parcelas (após entrada)
                                </Label>
                                <Input
                                  id="full-edit-parcelas"
                                  type="number"
                                  value={fullEditForm.quantidadeParcelas}
                                  onChange={(e) => handleFullEditFormChange("quantidadeParcelas", parseInt(e.target.value) || 1)}
                                  className="h-10"
                                  min="1"
                                  max="60"
                                />
                              </div>

                              <div>
                                <Label htmlFor="full-edit-pagas" className="text-sm font-medium text-gray-700">
                                  Parcelas Pagas
                                </Label>
                                <Input
                                  id="full-edit-pagas"
                                  type="number"
                                  value={fullEditForm.parcelasPagas}
                                  onChange={(e) => handleFullEditFormChange("parcelasPagas", parseInt(e.target.value) || 0)}
                                  className="h-10"
                                  min="0"
                                  max={fullEditForm.quantidadeParcelas}
                                />
                              </div>
                            </div>

                            {/* Valor por Parcela */}
                            <div>
                              <Label className="text-sm font-medium text-gray-700">Valor por Parcela</Label>
                              <div className="flex h-10 w-full items-center justify-between rounded-md border border-gray-300 bg-white px-3 py-2 text-sm">
                                <span>
                                  {fullEditForm.valorPagar && fullEditForm.quantidadeParcelas > 0 
                                    ? `R$ ${(() => {
                                      const valorTotal = parseCurrencyToNumber(fullEditForm.valorPagar);
                                      // ✅ Parcelas são calculadas sobre o valor TOTAL (entrada e parcelas são independentes)
                                      const valorPorParcela = valorTotal / fullEditForm.quantidadeParcelas;
                                      return valorPorParcela.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                                    })()}`
                                    : 'R$ 0,00'}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {tipoPagamento === "parcelamento" && (
                        <div className="border-t border-gray-200 pt-4">
                          <h3 className="text-lg font-medium text-gray-900 mb-4">Configuração de Parcelamento</h3>
                          
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            <div>
                              <Label className="text-sm font-medium text-gray-700">Dia Vencimento</Label>
                              <Select
                                value={fullEditForm.diaVencimentoMensal.toString()}
                                onValueChange={(value) => handleFullEditFormChange("diaVencimentoMensal", parseInt(value))}
                              >
                                <SelectTrigger className="h-10 focus:!ring-0 focus:!ring-offset-0 focus:!border-gray-300 focus:!outline-none focus:!shadow-none">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                                    <SelectItem key={day} value={day.toString()}>
                                      Dia {day}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>

                            <div>
                              <Label className="text-sm font-medium text-gray-700">Mês de Início do Pagamento</Label>
                              <Select
                                value={fullEditForm.mesInicioPagamento}
                                onValueChange={(value) => handleFullEditFormChange("mesInicioPagamento", value)}
                              >
                                <SelectTrigger className="h-10 focus:!ring-0 focus:!ring-offset-0 focus:!border-gray-300 focus:!outline-none focus:!shadow-none">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {Array.from({ length: 12 }, (_, i) => {
                                    const currentYear = new Date().getFullYear();
                                    const monthValue = `${currentYear}-${String(i + 1).padStart(2, '0')}`;
                                    const monthName = new Date(currentYear, i, 1).toLocaleDateString('pt-BR', { month: 'long' });
                                    return (
                                      <SelectItem key={monthValue} value={monthValue}>
                                        {monthName.charAt(0).toUpperCase() + monthName.slice(1)} de {currentYear}
                                      </SelectItem>
                                    );
                                  })}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            <div>
                              <Label htmlFor="full-edit-parcelas" className="text-sm font-medium text-gray-700">Quantidade de Parcelas</Label>
                              <Input
                                id="full-edit-parcelas"
                                type="number"
                                value={fullEditForm.quantidadeParcelas}
                                onChange={(e) => handleFullEditFormChange("quantidadeParcelas", parseInt(e.target.value) || 1)}
                                className="h-10"
                                min="1"
                                max="60"
                              />
                            </div>

                            <div>
                              <Label htmlFor="full-edit-pagas" className="text-sm font-medium text-gray-700">Parcelas Pagas</Label>
                              <Input
                                id="full-edit-pagas"
                                type="number"
                                value={fullEditForm.parcelasPagas}
                                onChange={(e) => handleFullEditFormChange("parcelasPagas", parseInt(e.target.value) || 0)}
                                className="h-10"
                                min="0"
                                max={fullEditForm.quantidadeParcelas}
                              />
                            </div>
                          </div>

                          {/* Valor por Parcela */}
                          <div>
                            <Label className="text-sm font-medium text-gray-700">Valor por Parcela</Label>
                            <div className="flex h-10 w-full items-center justify-between rounded-md border border-gray-300 bg-white px-3 py-2 text-sm">
                              <span>
                                {fullEditForm.valorPagar && fullEditForm.quantidadeParcelas > 0 
                                  ? `R$ ${(parseCurrencyToNumber(fullEditForm.valorPagar) / fullEditForm.quantidadeParcelas).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                  : 'R$ 0,00'}
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>

              {/* Documentos */}
              <div className="border-t border-gray-200 pt-6">
                <h3 className="text-lg font-medium text-gray-900 mb-4">Documentos do Arrematante</h3>
                
                {/* Lista de documentos */}
                {fullEditForm.documentos.length > 0 && (
                  <div className="space-y-2 p-3 bg-gray-50 border border-gray-200 rounded-md max-h-40 overflow-y-auto mb-4">
                    {fullEditForm.documentos.map((doc) => (
                      <div key={doc.id} className="flex items-center gap-3 p-2 bg-white border border-gray-200 rounded-md">
                        {getFileIcon(doc.tipo)}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{doc.nome}</p>
                          <p className="text-xs text-gray-500">
                            {formatFileSize(doc.tamanho)} • {new Date(doc.dataUpload).toLocaleDateString('pt-BR')}
                          </p>
                        </div>
                        <div className="flex gap-1">
                          {doc.url && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                if (doc.url) {
                                  openDocumentSafely(doc.url, doc.nome || 'Documento');
                                }
                              }}
                              className="h-10 w-10 sm:h-8 sm:w-8 p-0 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                              title="Visualizar documento"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveFullEditDocument(doc.id)}
                            className="h-10 w-10 sm:h-8 sm:w-8 p-0 text-red-600 hover:bg-red-50 hover:text-red-800"
                            title="Remover documento"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Área de Upload */}
                <div
                  className="mt-3 border-2 border-dashed border-gray-300 rounded-md p-3 sm:p-4 lg:p-6 text-center hover:border-gray-400 transition-colors"
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleFullEditDrop(e)}
                >
                  <Upload className="mx-auto h-12 w-12 text-gray-400" />
                  <div className="mt-4">
                    <label htmlFor="file-upload-full-edit" className="cursor-pointer">
                      <span className="text-sm font-medium text-gray-900">Arraste arquivos aqui ou clique para selecionar</span>
                    </label>
                    <input
                      id="file-upload-full-edit"
                      type="file"
                      multiple
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif"
                      onChange={handleFullEditFileUpload}
                      className="hidden"
                    />
                    <p className="text-xs text-gray-400 mt-2">
                      Formatos aceitos: PDF, DOC, DOCX, XLS, XLSX, JPG, PNG (máx. 10MB cada)
                    </p>
                  </div>
                </div>
              </div>

              {/* Botões */}
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                <Button 
                  variant="outline" 
                  onClick={handleCloseFullEdit}
                  className="border-gray-300 text-black hover:bg-gray-50 hover:text-black hover:border-gray-300 focus:ring-0 focus:ring-offset-0"
                >
                  Cancelar
                </Button>
                <Button 
                  onClick={handleSaveFullEdit}
                  disabled={isSavingFullEdit}
                  className="bg-black hover:bg-gray-800 text-white disabled:opacity-70 disabled:cursor-not-allowed transition-all duration-200"
                >
                  {isSavingFullEdit ? (
                    <div className="flex items-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Salvando...
                    </div>
                  ) : (
                    <><span className="hidden sm:inline">Salvar Alterações</span><span className="sm:hidden">Salvar</span></>
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Modal de Exportação */}
      <Dialog open={isExportModalOpen} onOpenChange={setIsExportModalOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-6xl max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold">Exportar Relatório de Arrematante</DialogTitle>
            <DialogDescription>
              Selecione um arrematante para gerar e baixar o relatório em PDF
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Seletor de Arrematante */}
            <div>
              <Label className="text-sm font-medium text-gray-700">Selecionar Arrematante:</Label>
              <Select 
                value={selectedArrematanteForExport} 
                onValueChange={setSelectedArrematanteForExport}
                onOpenChange={setIsExportSelectOpen}
              >
                <SelectTrigger 
                  className="w-full mt-2 focus:!ring-0 focus:!ring-offset-0 focus:!border-gray-300 focus:!outline-none focus:!shadow-none"
                >
                  <SelectValue placeholder="Escolha um arrematante para exportar" />
                </SelectTrigger>
                <SelectContent>
                  {filteredArrematantes.map((arrematante) => (
                    <SelectItem key={arrematante.id} value={arrematante.id}>
                      {arrematante.nome} - {arrematante.leilaoNome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Preview do PDF */}
            {selectedArrematanteForExport && (
              <div className="border rounded-lg max-h-[400px] overflow-y-auto">
                <ArrematantePdfReport 
                  arrematante={filteredArrematantes.find(a => a.id === selectedArrematanteForExport)!} 
                />
              </div>
            )}

            {/* Botões de Ação */}
            <div className="flex gap-3 pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setIsExportModalOpen(false);
                  setSelectedArrematanteForExport("");
                }}
                className="flex-1 hover:bg-gray-100 hover:text-gray-900"
              >
                Cancelar
              </Button>
              <Button
                onClick={() => generateArrematantePDF(selectedArrematanteForExport)}
                disabled={!selectedArrematanteForExport}
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

// Componente para o relatório PDF do arrematante
const ArrematantePdfReport = ({ arrematante }: { arrematante: ArrematanteExtendido }) => {
  // Função auxiliar para cálculo de datas (ajuste automático para meses com menos dias)
  const calcularDataComAjuste = (ano: number, mes: number, diaVencimento: number): Date => {
    // Criar data com dia 1 para evitar overflow
    const dataBase = new Date(ano, mes, 1);
    
    // Obter o último dia do mês
    const ultimoDiaDoMes = new Date(dataBase.getFullYear(), dataBase.getMonth() + 1, 0).getDate();
    
    // Usar o menor valor entre diaVencimento e ultimoDiaDoMes
    const diaFinal = Math.min(diaVencimento, ultimoDiaDoMes);
    
    // Criar a data final
    return new Date(dataBase.getFullYear(), dataBase.getMonth(), diaFinal);
  };
  
  // Função para calcular juros progressivos
  const calcularJurosProgressivos = (valorOriginal: number, dataVencimento: string, percentualJuros: number): number => {
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    
    const vencimento = new Date(dataVencimento + 'T00:00:00.000');
    vencimento.setHours(0, 0, 0, 0);
    
    if (hoje <= vencimento) {
      return valorOriginal;
    }
    
    const diffTime = hoje.getTime() - vencimento.getTime();
    const mesesAtraso = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 30));
    
    if (mesesAtraso <= 0) {
      return valorOriginal;
    }
    
    let valorComJuros = valorOriginal;
    for (let i = 0; i < mesesAtraso; i++) {
      valorComJuros = valorComJuros * (1 + percentualJuros / 100);
    }
    
    return valorComJuros;
  };

  const formatCurrency = (value: string | number | undefined) => {
    if (!value && value !== 0) return 'R$ 0,00';
    
    let numericValue: number;
    
    if (typeof value === 'string') {
      // Limpa a string e converte para número
      const cleanValue = value.replace(/[^\d.,]/g, '');
      
      // Se contém vírgula, assume formato brasileiro (ex: 90.000,00 ou 90000,00)
      if (cleanValue.includes(',')) {
        // Remove pontos (separadores de milhares) e troca vírgula por ponto
        numericValue = parseFloat(cleanValue.replace(/\./g, '').replace(',', '.'));
      } else {
        // Se não tem vírgula, assume formato americano ou número inteiro
        numericValue = parseFloat(cleanValue);
      }
      
      if (isNaN(numericValue)) return 'R$ 0,00';
    } else {
      numericValue = value;
    }
    
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(numericValue);
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'Não informado';
    try {
      const date = new Date(dateString + 'T00:00:00');
      return date.toLocaleDateString('pt-BR');
    } catch {
      return 'Data inválida';
    }
  };

  const getDocumentType = (documento: string) => {
    if (!documento) return 'Documento';
    const cleanDoc = documento.replace(/[^\d]/g, '');
    return cleanDoc.length === 11 ? 'CPF' : cleanDoc.length === 14 ? 'CNPJ' : 'Documento';
  };

  const formatMonthYear = (monthString: string) => {
    if (!monthString) return 'Não informado';
    const [year, month] = monthString.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  };

  return (
    <div id="arrematante-pdf-content" className="p-12 bg-white text-black" style={{ fontFamily: 'Inter, -apple-system, sans-serif', width: '100%', maxWidth: '1200px' }}>
      {/* Header */}
      <div className="text-center mb-12 break-inside-avoid" style={{ pageBreakInside: 'avoid', pageBreakAfter: 'avoid' }}>
        <div className="inline-block px-4 py-1 bg-gray-100 rounded-full mb-4">
          <span className="text-xs font-medium text-gray-600 uppercase tracking-wider">Relatório de Arrematante</span>
        </div>
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-light text-gray-900 mb-2 break-after-avoid" style={{ pageBreakAfter: 'avoid', fontWeight: '300' }}>
            {arrematante.nome}
        </h1>
        <p className="text-sm text-gray-400 mt-3">
          {new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })} • {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </p>
      </div>

      {/* Informações Pessoais */}
      <div className="mb-10 break-inside-avoid" style={{ pageBreakInside: 'avoid' }}>
        <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-4 break-after-avoid" style={{ pageBreakAfter: 'avoid', letterSpacing: '0.1em' }}>
          Dados Pessoais
        </h2>
        <div className="bg-gray-50 rounded-lg p-6" style={{ border: '1px solid #f3f4f6' }}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 lg:gap-6">
          <div>
              <div className="text-xs text-gray-500 mb-1">Nome Completo</div>
              <div className="font-light text-gray-900">{arrematante.nome || 'Não informado'}</div>
          </div>
          <div>
              <div className="text-xs text-gray-500 mb-1">{getDocumentType(arrematante.documento)}</div>
              <div className="font-light text-gray-900">{arrematante.documento || 'Não informado'}</div>
          </div>
          <div className="col-span-2">
              <div className="text-xs text-gray-500 mb-1">Endereço Completo</div>
              <div className="font-light text-gray-900">{arrematante.endereco || 'Não informado'}</div>
          </div>
          <div>
              <div className="text-xs text-gray-500 mb-1">E-mail</div>
              <div className="font-light text-gray-900">{arrematante.email || 'Não informado'}</div>
          </div>
          <div>
              <div className="text-xs text-gray-500 mb-1">Telefone</div>
              <div className="font-light text-gray-900">{arrematante.telefone || 'Não informado'}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Informações do Leilão */}
      <div className="mb-10 break-inside-avoid" style={{ pageBreakInside: 'avoid' }}>
        <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-4 break-after-avoid" style={{ pageBreakAfter: 'avoid', letterSpacing: '0.1em' }}>
          Dados do Leilão
        </h2>
        <div className="bg-gray-50 rounded-lg p-6" style={{ border: '1px solid #f3f4f6' }}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 lg:gap-6">
          <div>
              <div className="text-xs text-gray-500 mb-1">Nome do Leilão</div>
              <div className="font-light text-gray-900">{arrematante.leilaoNome || 'Não informado'}</div>
          </div>
          <div>
              <div className="text-xs text-gray-500 mb-1">Data de Realização</div>
              <div className="font-light text-gray-900">{formatDate(arrematante.dataLeilao)}</div>
          </div>
          <div className="col-span-2">
              <div className="text-xs text-gray-500 mb-1">Status do Pagamento</div>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${
                  arrematante.statusPagamento === 'pago' ? 'bg-green-500' : 
                  arrematante.statusPagamento === 'pendente' ? 'bg-yellow-500' : 'bg-red-500'
                }`}></div>
                <span className="font-light text-gray-900">
                  {arrematante.statusPagamento === 'pago' ? 'Quitado' :
                   arrematante.statusPagamento === 'pendente' ? 'Pendente' : 'Em Atraso'}
            </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Informações Financeiras */}
      <div className="mb-10 break-inside-avoid" style={{ pageBreakInside: 'avoid' }}>
        <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-4 break-after-avoid" style={{ pageBreakAfter: 'avoid', letterSpacing: '0.1em' }}>
          Informações Financeiras
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-white p-5 rounded-lg" style={{ border: '1px solid #e5e7eb' }}>
            <div className="text-xs text-gray-500 mb-2">Valor Total a Pagar</div>
            <span className="text-2xl font-light text-gray-900" style={{ fontWeight: '300' }}>
              {(() => {
                const valorTotal = arrematante.valorPagarNumerico || 0;
                const [startYear, startMonth] = (arrematante.mesInicioPagamento || '').split('-').map(Number);
                const percentualJuros = arrematante.percentualJurosAtraso || 0;
                
                if (!startYear || !startMonth) return formatCurrency(valorTotal);
                
                // Calcular estrutura de parcelas
                const estrutura = calcularEstruturaParcelas(
                  valorTotal,
                  arrematante.parcelasTriplas || 0,
                  arrematante.parcelasDuplas || 0,
                  arrematante.parcelasSimples || 0
                );
                
                let valorTotalComJuros = 0;
                estrutura.forEach((parcela, index) => {
                  const dataVencimento = calcularDataComAjuste(startYear, startMonth - 1 + index, arrematante.diaVencimentoMensal || 15);
                  const dataVencimentoStr = dataVencimento.toISOString().split('T')[0];
                  valorTotalComJuros += calcularJurosProgressivos(parcela.valor, dataVencimentoStr, percentualJuros);
                });
                
                return formatCurrency(valorTotalComJuros);
              })()}
            </span>
          </div>
          <div className="bg-white p-5 rounded-lg" style={{ border: '1px solid #e5e7eb' }}>
            <div className="text-xs text-gray-500 mb-2">Estrutura de Parcelas</div>
            <span className="text-sm font-light text-gray-900">
              {(() => {
                const triplas = arrematante.parcelasTriplas || 0;
                const duplas = arrematante.parcelasDuplas || 0;
                const simples = arrematante.parcelasSimples || 0;
                
                if (triplas === 0 && duplas === 0 && simples === 0) {
                  const valorTotal = arrematante.valorPagarNumerico || 0;
                  const qtd = arrematante.quantidadeParcelas || 1;
                  const valorParcela = valorTotal / qtd;
                  return `${qtd}x de ${formatCurrency(valorParcela)}`;
                }
                
                const partes = [];
                if (triplas > 0) partes.push(`${triplas}x triplas`);
                if (duplas > 0) partes.push(`${duplas}x duplas`);
                if (simples > 0) partes.push(`${simples}x simples`);
                
                return partes.join(' + ');
              })()}
            </span>
          </div>
          <div className="bg-white p-5 rounded-lg" style={{ border: '1px solid #e5e7eb' }}>
            <div className="text-xs text-gray-500 mb-2">Status de Quitação</div>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${arrematante.pago ? 'bg-green-500' : 'bg-orange-500'}`}></div>
              <span className="font-light text-gray-900">{arrematante.pago ? 'Quitado' : 'Em Aberto'}</span>
          </div>
          </div>
          <div className="bg-white p-5 rounded-lg" style={{ border: '1px solid #e5e7eb' }}>
            <div className="text-xs text-gray-500 mb-2">Valor Restante</div>
            <span className="text-2xl font-light text-gray-900" style={{ fontWeight: '300' }}>
            {arrematante.pago ? 
              'R$ 0,00' : 
              (() => {
                const valorTotal = arrematante.valorPagarNumerico || 0;
                const [startYear, startMonth] = (arrematante.mesInicioPagamento || '').split('-').map(Number);
                const percentualJuros = arrematante.percentualJurosAtraso || 0;
                const parcelasPagas = arrematante.parcelasPagas || 0;
                
                // Calcular estrutura de parcelas
                const estrutura = calcularEstruturaParcelas(
                  valorTotal,
                  arrematante.parcelasTriplas || 0,
                  arrematante.parcelasDuplas || 0,
                  arrematante.parcelasSimples || 0
                );
                
                if (!startYear || !startMonth) {
                  const valorRestante = estrutura
                    .slice(parcelasPagas)
                    .reduce((sum, p) => sum + p.valor, 0);
                  return formatCurrency(valorRestante);
                }
                
                let valorRestante = 0;
                estrutura.slice(parcelasPagas).forEach((parcela, index) => {
                  const dataVencimento = calcularDataComAjuste(startYear, startMonth - 1 + parcelasPagas + index, arrematante.diaVencimentoMensal || 15);
                  const dataVencimentoStr = dataVencimento.toISOString().split('T')[0];
                  valorRestante += calcularJurosProgressivos(parcela.valor, dataVencimentoStr, percentualJuros);
                });
                
                return formatCurrency(valorRestante);
              })()
            }
            </span>
          </div>
        </div>
      </div>

      {/* Configuração de Parcelas ou Forma de Pagamento */}
      <div className="mb-10 break-inside-avoid" style={{ pageBreakInside: 'avoid' }}>
        <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-4 break-after-avoid" style={{ pageBreakAfter: 'avoid', letterSpacing: '0.1em' }}>
          {arrematante.quantidadeParcelas && arrematante.quantidadeParcelas > 1 
            ? 'Parcelamento e Cronograma' 
            : 'Modalidade de Pagamento'}
        </h2>
        <div className="bg-gray-50 rounded-lg p-6" style={{ border: '1px solid #f3f4f6' }}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 lg:gap-6">
          {arrematante.quantidadeParcelas && arrematante.quantidadeParcelas > 1 ? (
            <>
              <div>
                <div className="text-xs text-gray-500 mb-1">Total de Parcelas</div>
                <div className="font-light text-gray-900">{arrematante.quantidadeParcelas}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">Parcelas Pagas</div>
                <div className="font-light text-gray-900">
                  {arrematante.parcelasPagas || 0} de {arrematante.quantidadeParcelas}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">Dia de Vencimento</div>
                <div className="font-light text-gray-900">Todo dia {arrematante.diaVencimentoMensal || 'Não definido'}</div>
              </div>
              <div>
                <div className="text-xs text-gray-500 mb-1">Mês de Início</div>
                <div className="font-light text-gray-900">{formatMonthYear(arrematante.mesInicioPagamento)}</div>
              </div>
              <div className="col-span-2 mt-2">
                <div className="flex justify-between items-center mb-2">
                  <div className="text-xs text-gray-500">Progresso do Pagamento</div>
                  <div className="text-xs font-medium text-gray-900">
                    {Math.round(((arrematante.parcelasPagas || 0) / (arrematante.quantidadeParcelas || 1)) * 100)}%
                  </div>
                </div>
                <div className="bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-gray-900 h-2 rounded-full transition-all duration-300"
                    style={{ 
                      width: `${((arrematante.parcelasPagas || 0) / (arrematante.quantidadeParcelas || 1)) * 100}%` 
                    }}
                  ></div>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="col-span-2">
                <strong>Forma de Pagamento:</strong> Pagamento à Vista
              </div>
              <div>
                <strong>Data de Vencimento:</strong>{' '}
                {arrematante.mesInicioPagamento && arrematante.diaVencimentoMensal
                  ? (() => {
                      const [year, month] = arrematante.mesInicioPagamento.split('-');
                      const date = calcularDataComAjuste(parseInt(year), parseInt(month) - 1, arrematante.diaVencimentoMensal);
                      return date.toLocaleDateString('pt-BR');
                    })()
                  : 'Não informado'}
              </div>
              <div>
                <strong>Status:</strong>{' '}
                <span className="font-semibold text-gray-900">
                  {arrematante.pago ? 'PAGO' : 'PENDENTE'}
                </span>
              </div>
            </>
          )}
        </div>
        </div>
      </div>

      {/* Detalhamento de Parcelas */}
      {(arrematante.quantidadeParcelas || 0) > 0 && arrematante.mesInicioPagamento && (
        <div className="mb-10" style={{ pageBreakBefore: 'auto' }}>
          <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-4 break-after-avoid" style={{ pageBreakAfter: 'avoid', letterSpacing: '0.1em' }}>
            Detalhamento de Parcelas
          </h2>
          <div>
            {(() => {
              const valorTotal = arrematante.valorPagarNumerico || 0;
              const [startYear, startMonth] = arrematante.mesInicioPagamento.split('-').map(Number);
              const percentualJuros = arrematante.percentualJurosAtraso || 0;
              
              // Calcular estrutura de parcelas
              const estrutura = calcularEstruturaParcelas(
                valorTotal,
                arrematante.parcelasTriplas || 0,
                arrematante.parcelasDuplas || 0,
                arrematante.parcelasSimples || 0
              );
              
              return estrutura.map((parcela, index) => {
                const isPaga = index < (arrematante.parcelasPagas || 0);
                const dataVencimento = calcularDataComAjuste(startYear, startMonth - 1 + index, arrematante.diaVencimentoMensal || 15);
                const dataVencimentoStr = dataVencimento.toISOString().split('T')[0];
                const valorComJuros = calcularJurosProgressivos(parcela.valor, dataVencimentoStr, percentualJuros);
                const temJuros = valorComJuros > parcela.valor;
                
                return (
                  <div key={index} className="bg-white rounded-lg p-3 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between flex break-inside-avoid" style={{ border: `1px solid ${isPaga ? '#d1fae5' : temJuros ? '#fecaca' : '#e5e7eb'}`, pageBreakInside: 'avoid', breakInside: 'avoid', marginBottom: '8px' }}>
                    <div className="flex items-center gap-3 flex-1">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isPaga ? 'bg-green-50' : temJuros ? 'bg-red-50' : 'bg-gray-50'}`}>
                        <span className={`text-xs font-medium ${isPaga ? 'text-green-700' : temJuros ? 'text-red-700' : 'text-gray-700'}`}>
                          {index + 1}
                        </span>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-light text-gray-900">{index + 1}ª Parcela</span>
                          <span className="text-xs text-gray-400">• {parcela.tipo}</span>
                        </div>
                        <div className="text-xs text-gray-500">
                          {dataVencimento.toLocaleDateString('pt-BR')}
                      </div>
                    </div>
                    </div>
                    <div className="text-right">
                      <div className="text-base font-light text-gray-900" style={{ fontWeight: '300' }}>
                        {formatCurrency(temJuros && !isPaga ? valorComJuros : parcela.valor)}
                      </div>
                      <div className="flex items-center justify-end gap-1">
                        <div className={`w-1.5 h-1.5 rounded-full ${isPaga ? 'bg-green-500' : temJuros ? 'bg-red-500' : 'bg-gray-400'}`}></div>
                        <span className={`text-xs font-light ${isPaga ? 'text-green-600' : temJuros ? 'text-red-600' : 'text-gray-600'}`}>
                          {isPaga ? 'Paga' : temJuros ? 'Atrasada' : 'Pendente'}
                      </span>
                      </div>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>
      )}

      {/* Histórico de Pagamentos */}
      {(arrematante.parcelasPagas || 0) > 0 && (
        <div className="mb-10 break-inside-avoid" style={{ pageBreakInside: 'avoid' }}>
          <h2 className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-4 break-after-avoid" style={{ pageBreakAfter: 'avoid', letterSpacing: '0.1em' }}>
            Resumo dos Pagamentos Realizados
          </h2>
          <div className="bg-gray-50 rounded-lg p-5" style={{ border: '1px solid #e5e7eb' }}>
                {(() => {
              const valorTotal = arrematante.valorPagarNumerico || 0;
              const estrutura = calcularEstruturaParcelas(
                valorTotal,
                arrematante.parcelasTriplas || 0,
                arrematante.parcelasDuplas || 0,
                arrematante.parcelasSimples || 0
              );
              
              const parcelasPagas = arrematante.parcelasPagas || 0;
              const parcelasPagasData = estrutura.slice(0, parcelasPagas);
              const totalPago = parcelasPagasData.reduce((sum, p) => sum + p.valor, 0);
              
              // Agrupar parcelas pagas por tipo
              const tiposContagem = parcelasPagasData.reduce((acc, p) => {
                acc[p.tipo] = (acc[p.tipo] || 0) + 1;
                return acc;
              }, {} as Record<string, number>);
              
              const descricaoTipos = Object.entries(tiposContagem)
                .map(([tipo, count]) => `${count}x ${tipo}`)
                .join(' + ');
              
              return (
                <div className="flex-col gap-2 sm:flex-row sm:items-center sm:justify-between flex">
                  <div className="text-sm font-light text-gray-600">
                    {parcelasPagas} {parcelasPagas > 1 ? 'parcelas quitadas' : 'parcela quitada'}{' '}
                    <span className="text-gray-400">({descricaoTipos})</span>
                  </div>
                  <div className="text-2xl font-light text-gray-900" style={{ fontWeight: '300' }}>
                    {formatCurrency(totalPago)}
                  </div>
                </div>
              );
                })()}
          </div>
        </div>
      )}

      {/* Informações Adicionais */}
            {arrematante.statusPagamento === 'atrasado' && (
        <div className="mb-10 break-inside-avoid" style={{ pageBreakInside: 'avoid' }}>
          <div className="bg-red-50 rounded-lg p-6" style={{ border: '1px solid #fecaca' }}>
            <div className="flex gap-3">
              <div className="flex-shrink-0">
                <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center">
                  <span className="text-red-600 text-sm font-bold">!</span>
                </div>
              </div>
              <div>
                <h3 className="text-sm font-medium text-red-900 mb-1">Atenção: Pagamento em Atraso</h3>
                <p className="text-sm text-red-700 font-light">
                  Este arrematante possui pagamentos em atraso. Recomenda-se contato imediato para regularização da situação financeira.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="mb-10 break-inside-avoid" style={{ pageBreakInside: 'avoid' }}>
        <div className="bg-gray-50 rounded-lg p-6" style={{ border: '1px solid #f3f4f6' }}>
          <p className="text-xs text-gray-500 leading-relaxed">
            Este relatório foi gerado com base nos dados cadastrais e transações registradas no sistema. Todas as informações financeiras estão atualizadas até a data de geração deste documento.
          </p>
        </div>
      </div>

      {/* Footer */}
      <div className="mt-12 pt-6 break-inside-avoid" style={{ pageBreakInside: 'avoid', borderTop: '1px solid #e5e7eb' }}>
        <div className="text-center space-y-4">
          <p className="text-xs text-gray-400">
            Documento oficial • Sistema de Gestão de Leilões
            </p>
          <div className="flex justify-center items-center gap-8 text-xs text-gray-400">
            <span>Página 1 de 1</span>
            <span>•</span>
            <span>{new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</span>
          </div>
        </div>
      </div>

      {/* Logos Elionx e Arthur Lira */}
      <div className="mt-10 flex justify-center items-center -ml-20 break-inside-avoid" style={{ pageBreakInside: 'avoid' }}>
        <img 
          src="/logo-elionx-softwares.png" 
          alt="Elionx Softwares" 
          className="max-h-80 object-contain opacity-90"
          style={{ maxHeight: '320px', maxWidth: '620px' }}
        />
        <img 
          src="/arthur-lira-logo.png" 
          alt="Arthur Lira Leilões" 
          className="max-h-14 object-contain opacity-90 -mt-2 -ml-16"
          style={{ maxHeight: '55px', maxWidth: '110px' }}
        />
      </div>
    </div>
  );
};

export default Arrematantes;

