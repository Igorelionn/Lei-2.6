import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { logger } from "@/lib/logger";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus, Search, Eye, Edit, Trash2, Mail, Archive, ArrowLeft, Package, Phone, FileText, UserCheck, MoreVertical, ChevronDown
} from "lucide-react";
import LoteConvidadoWizard from "@/components/LoteConvidadoWizard";
import { ArrematanteWizard } from "@/components/ArrematanteWizard";
import { ImageWithFallback } from "@/components/ImageWithFallback"; // 🔒 SEGURANÇA: Componente seguro para evitar XSS
import { supabase } from "@/lib/supabase";
import { useGuestLots, GuestLot, GuestLotMerchandise, GuestLotArrematante } from "@/hooks/use-guest-lots";
import { LoteConvidadoFormData, ArrematanteInfo, LoteInfo, Auction } from "@/lib/types";
import { parseCurrencyToNumber } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

export default function LotesConvidados() {
  const navigate = useNavigate();
  const { guestLots, isLoading, archiveGuestLot, unarchiveGuestLot, deleteGuestLot } = useGuestLots();
  const queryClient = useQueryClient();
  const [searchInputValue, setSearchInputValue] = useState("");
  const [searchTerm, _setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("todos");
  const [showArchived, setShowArchived] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [isLoadingResults, setIsLoadingResults] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editingLote, setEditingLote] = useState<Partial<LoteConvidadoFormData> | null>(null);
  const [leiloes, setLeiloes] = useState<Array<{ id: string; nome: string }>>([]);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [selectedLote, setSelectedLote] = useState<GuestLot | null>(null);
  
  // Estados para gerenciar arrematantes
  const [addingArrematanteFor, setAddingArrematanteFor] = useState<GuestLot | null>(null);
  const [editingArrematanteId, setEditingArrematanteId] = useState<string | null>(null);
  const [_isSavingArrematante, setIsSavingArrematante] = useState(false);
  
  // Estado para controlar popovers de mercadorias abertos (animação do chevron)
  const [openPopovers, setOpenPopovers] = useState<Record<string, boolean>>({});

  // Calcular estatísticas dos lotes
  const stats = {
    total: guestLots.filter(l => !l.arquivado).length,
    disponiveis: guestLots.filter(l => !l.arquivado && l.status === 'disponivel').length,
    arrematados: guestLots.filter(l => !l.arquivado && l.status === 'arrematado').length,
    arquivados: guestLots.filter(l => l.arquivado).length,
    totalMercadorias: guestLots.filter(l => !l.arquivado).reduce((total, lote) => {
      return total + lote.mercadorias.length;
    }, 0)
  };

  // Buscar leilões do Supabase
  useEffect(() => {
    const fetchLeiloes = async () => {
      try {
        const { data, error } = await supabase
          .from('auctions')
          .select('id, nome')
          .or('arquivado.is.null,arquivado.eq.false')
          .order('data_inicio', { ascending: false });

        if (error) {
          logger.error('Erro ao buscar leilões:', error);
          throw error;
        }

        if (data) {
          setLeiloes(data.map(leilao => ({
            id: leilao.id,
            nome: leilao.nome
          })));
          logger.debug('Leilões carregados:', data.length);
        }
      } catch (error) {
        logger.error('Erro ao buscar leilões:', error);
      }
    };

    fetchLeiloes();
  }, []);

  const filteredLotes = guestLots.filter(lote => {
    const matchesSearch = !searchTerm || 
      lote.numero.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lote.descricao.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lote.proprietario.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (lote.leilao_nome && lote.leilao_nome.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesStatus = statusFilter === "todos" || lote.status === statusFilter;
    const matchesArchived = showArchived ? lote.arquivado : !lote.arquivado;
    
    return matchesSearch && matchesStatus && matchesArchived;
  });

  const handleSmoothTransition = (callback: () => void) => {
    setIsTransitioning(true);
    setIsLoadingResults(true);
    setTimeout(() => {
      callback();
      setTimeout(() => {
        setIsTransitioning(false);
        setIsLoadingResults(false);
      }, 50);
    }, 150);
  };

  const handleEdit = (lote: GuestLot) => {
    logger.debug('🔧 [LotesConvidados] handleEdit chamado para lote:', lote.numero);
    logger.debug('📦 [LotesConvidados] Mercadorias do lote:', lote.mercadorias);
    
    // Preparar dados do lote para o formato do wizard
    const dadosParaWizard = {
      id: lote.id,
      numero: lote.numero,
      descricao: lote.descricao,
      proprietario: lote.proprietario,
      codigoPais: lote.codigo_pais,
      celularProprietario: lote.celular_proprietario,
      emailProprietario: lote.email_proprietario,
      mercadorias: lote.mercadorias.map((m: GuestLotMerchandise) => ({
        id: m.id,
        // ✅ Deixar vazio se não tiver nome (usuário precisa preencher novamente)
        nome: m.nome || '',
        descricao: m.descricao,
        quantidade: m.quantidade,
        valorEstimado: m.valor_estimado || undefined,
      })),
      documentos: lote.documentos || [],
      imagens: lote.imagens || [],
      leilaoId: lote.leilao_id || "",
      observacoes: lote.observacoes || "",
    };
    
    logger.debug('✅ [LotesConvidados] Dados preparados para o wizard:', dadosParaWizard);
    logger.debug('✅ [LotesConvidados] Mercadorias mapeadas:', dadosParaWizard.mercadorias);
    
    setEditingLote(dadosParaWizard);
    setWizardOpen(true);
    
    logger.debug('🚀 [LotesConvidados] Wizard aberto!');
  };

  const _handleAddArrematante = async (lote: GuestLot) => {
    // Se o lote tem leilão vinculado, buscar os arrematantes desse leilão
    if (lote.leilao_id) {
      try {
        logger.debug('🔍 Buscando arrematantes do leilão:', lote.leilao_id);
        
        const { data: leilaoData, error } = await supabase
          .from('auctions')
          .select(`
            *,
            bidders (
              id,
              nome,
              documento,
              telefone,
              email,
              cep,
              rua,
              numero,
              complemento,
              bairro,
              cidade,
              estado,
              foto,
              endereco
            )
          `)
          .eq('id', lote.leilao_id)
          .single();
        
        if (error) {
          logger.error('❌ Erro ao buscar leilão:', error);
        } else if (leilaoData) {
          logger.debug(`✅ Leilão encontrado com ${leilaoData.bidders?.length || 0} arrematantes`);
          
          // Adicionar os arrematantes do leilão ao lote temporariamente
          const loteComArrematantes = {
            ...lote,
            leilao_arrematantes: leilaoData.bidders || []
          };
          
          setAddingArrematanteFor(loteComArrematantes as unknown as GuestLot);
          setEditingArrematanteId('__NEW__');
          return;
        }
      } catch (error) {
        logger.error('❌ Erro ao buscar arrematantes do leilão:', error);
      }
    }
    
    // Se não tiver leilão vinculado ou houver erro, continuar normalmente
    setAddingArrematanteFor(lote);
    setEditingArrematanteId('__NEW__'); // Flag para indicar "adicionar novo"
  };

  const handleViewArrematantes = async (lote: GuestLot) => {
    try {
      // ✅ Buscar arrematantes completos do banco de dados
      const { data: arrematantes, error } = await supabase
        .from('bidders')
        .select('*')
        .eq('guest_lot_id', lote.id)
        .order('nome', { ascending: true });
      
      if (error) {
        logger.error('❌ Erro ao buscar arrematantes:', error);
        return;
      }
      
      if (!arrematantes || arrematantes.length === 0) {
        return;
      }
      
      // ✅ Mapear arrematantes para o formato GuestLotArrematante
      const arrematantesMapeados: GuestLotArrematante[] = arrematantes.map((arr: Partial<GuestLotArrematante> & { id: string }) => ({
        id: arr.id,
        nome: arr.nome || '',
        email: arr.email,
        telefone: arr.telefone,
        pago: arr.pago || false,
        valor_pagar_numerico: arr.valor_pagar_numerico || 0,
      }));
      
      // ✅ Atualizar o lote com os arrematantes completos
      const loteComArrematantes: GuestLot = {
        ...lote,
        arrematantes: arrematantesMapeados
      };
      
      setAddingArrematanteFor(loteComArrematantes);
      setEditingArrematanteId(null); // ✅ null para mostrar tela de seleção
      
    } catch (error) {
      logger.error('❌ Erro:', error);
    }
  };

  const _handleConfirmPayment = async (_lote: GuestLot, _arrematanteId: string) => {
    try {
      // TODO: Implementar lógica de confirmação de pagamento no backend
    } catch (_error) {
      logger.error('Erro ao confirmar pagamento:', _error);
    }
  };

  const handleCloseWizard = () => {
    setWizardOpen(false);
    setEditingLote(null);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'disponivel':
        return <Badge variant="default">Disponível</Badge>;
      case 'arrematado':
        return <Badge variant="destructive">Arrematado</Badge>;
      case 'arquivado':
        return <Badge variant="secondary">Arquivado</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };


  return (
    <div className="space-y-4 sm:space-y-6 p-6 slide-in-right">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900">Lotes de Convidados</h1>
          <p className="text-gray-600 mt-1">Gerencie lotes de terceiros que participam dos leilões do anfitrião</p>
        </div>
      </div>

      {/* Indicadores Gerais */}
      <div className="bg-white border border-gray-200 shadow-sm rounded-lg p-3 sm:p-4 lg:p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
          <div className="text-center">
            <div className="mb-4">
              <p className="text-xs font-semibold text-gray-700 uppercase tracking-[0.15em] mb-3">Total de Lotes</p>
              <div className="h-px w-20 bg-gray-300 mx-auto mb-4"></div>
            </div>
            <p className="text-xl sm:text-2xl lg:text-3xl font-extralight text-gray-900 mb-2 tracking-tight">{stats.total}</p>
            <p className="text-sm text-gray-600 font-medium">De convidados</p>
          </div>

          <div className="text-center">
            <div className="mb-4">
              <p className="text-xs font-semibold text-gray-700 uppercase tracking-[0.15em] mb-3">Disponíveis</p>
              <div className="h-px w-20 bg-gray-300 mx-auto mb-4"></div>
            </div>
            <p className="text-xl sm:text-2xl lg:text-3xl font-extralight text-gray-900 mb-2 tracking-tight">{stats.disponiveis}</p>
            <p className="text-sm text-gray-600 font-medium">Para leilão</p>
          </div>

          <div className="text-center">
            <div className="mb-4">
              <p className="text-xs font-semibold text-gray-700 uppercase tracking-[0.15em] mb-3">Arrematados</p>
              <div className="h-px w-20 bg-gray-300 mx-auto mb-4"></div>
            </div>
            <p className="text-xl sm:text-2xl lg:text-3xl font-extralight text-gray-900 mb-2 tracking-tight">{stats.arrematados}</p>
            <p className="text-sm text-gray-600 font-medium">Vendidos</p>
          </div>

          <div className="text-center">
            <div className="mb-4">
              <p className="text-xs font-semibold text-gray-700 uppercase tracking-[0.15em] mb-3">Mercadorias</p>
              <div className="h-px w-20 bg-gray-300 mx-auto mb-4"></div>
            </div>
            <p className="text-xl sm:text-2xl lg:text-3xl font-extralight text-gray-900 mb-2 tracking-tight">{stats.totalMercadorias}</p>
            <p className="text-sm text-gray-600 font-medium">Cadastradas</p>
          </div>
        </div>
      </div>

      {/* Card Principal */}
      <Card className="border border-gray-200 shadow-sm h-[calc(100vh-320px)]">
        <CardHeader className="pb-4">
          <div className="space-y-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="flex items-center gap-3 text-xl font-semibold text-gray-800">
                <div className="p-2 bg-gray-100 rounded-lg">
                  {showArchived ? <Archive className="h-5 w-5 text-gray-600" /> : <Package className="h-5 w-5 text-gray-600" />}
                </div>
                {showArchived ? "Lotes Arquivados" : "Lotes de Convidados"}
              </CardTitle>
              
              <button
                onClick={() => navigate('/valores-convidados')}
                className={`
                  text-sm font-medium transition-all relative pb-1
                  text-gray-600 hover:text-gray-900
                  after:content-[''] after:absolute after:bottom-0 after:left-0 after:right-0 
                  after:h-[1px] after:bg-gray-900 after:transition-all after:duration-300
                  after:opacity-0 hover:after:opacity-100
                `}
              >
                Exibir detalhes dos valores
              </button>
            </div>

            <div className="flex flex-col sm:flex-row lg:flex-row gap-4 items-start sm:items-center lg:items-center justify-between">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="relative flex-1 min-w-0 max-w-md">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Buscar por lote, proprietário ou leilão..."
                    value={searchInputValue}
                    onChange={(e) => setSearchInputValue(e.target.value)}
                    className="pl-10 h-11 border-gray-300 focus:border-gray-300 focus:ring-0 no-focus-outline w-full"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2 flex-shrink-0 w-full sm:w-auto">
                <Select 
                  value={statusFilter} 
                  onValueChange={(value) => {
                    setIsLoadingResults(true);
                    setIsTransitioning(true);
                    
                    setTimeout(() => {
                      setStatusFilter(value);
                      setIsLoadingResults(false);
                      setTimeout(() => setIsTransitioning(false), 150);
                    }, 500);
                  }}
                >
                  <SelectTrigger 
                    className="w-full sm:w-[140px] h-11 border-gray-300 bg-white focus:!ring-0 focus:!ring-offset-0 focus:!border-gray-300 focus:!outline-none focus:!shadow-none"
                  >
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos ({stats.total})</SelectItem>
                    <SelectItem value="disponivel">Disponível ({stats.disponiveis})</SelectItem>
                    <SelectItem value="arrematado">Arrematado ({stats.arrematados})</SelectItem>
                  </SelectContent>
                </Select>

                <div className="flex items-center gap-2">
                  {showArchived && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        handleSmoothTransition(() => {
                          setShowArchived(false);
                        });
                      }}
                      className="h-11 px-3 border-gray-300 bg-white text-gray-700 hover:bg-gray-100 hover:text-black"
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
                    className="h-11 px-3 sm:px-4 border-gray-300 text-gray-700 hover:text-black hover:bg-gray-50 text-sm sm:text-base"
                  >
                    {showArchived ? "Ver Ativos" : `Ver Arquivados (${stats.arquivados})`}
                  </Button>
                </div>

                <Button 
                  onClick={() => setWizardOpen(true)}
                  className="h-11 bg-black hover:bg-gray-800 text-white w-full sm:w-auto"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  <span className="hidden sm:inline">Cadastrar Lote</span>
                  <span className="sm:hidden">Cadastrar</span>
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0 h-[calc(100%-120px)] overflow-y-auto">
          {isLoading || isLoadingResults ? (
            <div className={`space-y-4 ${isTransitioning ? 'slide-in-right' : ''}`}>
              {[...Array(3)].map((_, index) => (
                <div key={index} className="animate-pulse-slow transform-none">
                  <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm transition-none transform-none">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4 flex-1">
                        <div className="w-12 h-12 bg-gray-200 rounded-full animate-shimmer"></div>
                        <div className="flex-1 space-y-2">
                          <div className="h-4 rounded w-3/4 animate-shimmer" style={{animationDelay: `${index * 0.2}s`}}></div>
                          <div className="h-3 rounded w-1/2 animate-shimmer" style={{animationDelay: `${index * 0.3}s`}}></div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-4">
                        <div className="h-6 rounded-full w-20 animate-shimmer" style={{animationDelay: `${index * 0.4}s`}}></div>
                        <div className="h-6 rounded-full w-16 animate-shimmer" style={{animationDelay: `${index * 0.5}s`}}></div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : filteredLotes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-500 px-6">
              {showArchived ? <Archive className="h-12 w-12 mb-4 text-gray-300" /> : <Package className="h-12 w-12 mb-4 text-gray-300" />}
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {searchTerm && statusFilter !== "todos" 
                  ? `Nenhum lote ${statusFilter} encontrado`
                  : searchTerm 
                    ? "Nenhum lote encontrado"
                    : statusFilter !== "todos"
                      ? `Nenhum lote ${statusFilter}`
                      : showArchived 
                        ? "Nenhum lote arquivado"
                        : "Nenhum lote encontrado"}
              </h3>
              <p className="text-sm text-center max-w-md">
                {searchTerm && statusFilter !== "todos"
                  ? `Nenhum lote ${statusFilter} corresponde à busca "${searchTerm}".`
                  : searchTerm 
                    ? `Nenhum resultado para "${searchTerm}". Tente outro termo.`
                    : statusFilter !== "todos"
                      ? `Não há lotes de convidados com status ${statusFilter} no momento.`
                      : showArchived 
                        ? "Não há lotes arquivados no momento."
                        : "Ainda não há lotes de convidados cadastrados no sistema."}
              </p>
            </div>
          ) : (
            <div className={`transition-opacity duration-300 ${isTransitioning ? 'opacity-0' : 'opacity-100'}`}>
              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-gray-200">
                    <TableHead className="font-semibold text-gray-700">Número do Lote</TableHead>
                    <TableHead className="font-semibold text-gray-700">Descrição</TableHead>
                    <TableHead className="hidden sm:table-cell font-semibold text-gray-700">Proprietário da Mercadoria</TableHead>
                    <TableHead className="hidden sm:table-cell font-semibold text-gray-700">Mercadorias</TableHead>
                    <TableHead className="hidden sm:table-cell font-semibold text-gray-700">Leilão</TableHead>
                    <TableHead className="font-semibold text-gray-700">Status</TableHead>
                    <TableHead className="font-semibold text-gray-700 text-center">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLotes.map((lote) => (
                    <TableRow key={lote.id} className="border-gray-100 hover:bg-gray-50/50">
                      <TableCell>
                        <span className="font-semibold text-gray-900">#{lote.numero}</span>
                      </TableCell>
                      <TableCell>
                        <div className="max-w-xs">
                          <p className="font-medium text-gray-900 truncate">{lote.descricao}</p>
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <div>
                          <p className="text-sm font-medium text-gray-900">{lote.proprietario}</p>
                          <p className="text-xs text-gray-500">{lote.celular_proprietario}</p>
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <Popover 
                          open={openPopovers[lote.id] || false}
                          onOpenChange={(isOpen) => setOpenPopovers(prev => ({ ...prev, [lote.id]: isOpen }))}
                        >
                          <PopoverTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 px-2 hover:bg-gray-100 focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                            >
                              <span className="text-sm text-gray-600">
                                {lote.mercadorias.length} {lote.mercadorias.length === 1 ? 'item' : 'itens'}
                              </span>
                              <ChevronDown 
                                className={`h-3 w-3 ml-1 text-gray-400 transition-transform duration-200 ease-in-out ${
                                  openPopovers[lote.id] ? 'rotate-180' : 'rotate-0'
                                }`} 
                              />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-80 p-0" align="start">
                            <div className="max-h-[300px] overflow-y-auto">
                              <div className="px-4 py-3 border-b border-gray-200">
                                <h4 className="text-sm font-semibold text-gray-900">
                                  Mercadorias do Lote #{lote.numero}
                                </h4>
                              </div>
                              <div className="p-2">
                                {lote.mercadorias.map((mercadoria: GuestLotMerchandise, index: number) => (
                                  <div
                                    key={mercadoria.id || index}
                                    className="px-3 py-2 hover:bg-gray-50 rounded-md transition-colors"
                                  >
                                    <div className="flex items-start justify-between mb-1">
                                      <p className="text-sm font-medium text-gray-900 flex-1">
                                        {mercadoria.nome || `Mercadoria ${index + 1}`}
                                      </p>
                                      {mercadoria.quantidade && (
                                        <Badge variant="outline" className="ml-2 text-xs">
                                          Qtd: {mercadoria.quantidade}
                                        </Badge>
                                      )}
                                    </div>
                                      {mercadoria.descricao && (
                                        <p className="text-xs text-gray-600 line-clamp-2">{mercadoria.descricao}</p>
                                      )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          </PopoverContent>
                        </Popover>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <span className="text-sm text-gray-600">{lote.leilao_nome || 'Não vinculado'}</span>
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(lote.status)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-1">
                          {/* 1. Ver Arrematantes (se houver) */}
                          {(() => {
                            const arrematantesCount = lote.arrematantes?.length || 0;
                            
                            if (arrematantesCount > 0) {
                              return (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleViewArrematantes(lote)}
                                  className="h-10 w-10 sm:h-8 sm:w-8 p-0 hover:bg-gray-100 relative focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                                  title={`Ver Arrematantes (${arrematantesCount})`}
                                >
                                  <UserCheck className="h-4 w-4 text-gray-600" />
                                  <span className="absolute -top-1 -right-1 bg-gray-600 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-bold">
                                    {arrematantesCount}
                                  </span>
                                </Button>
                              );
                            } else {
                              // Não mostrar nada se não houver arrematantes
                              return null;
                            }
                          })()}

                          {/* 2. Ver Detalhes */}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedLote(lote);
                              setIsViewModalOpen(true);
                            }}
                            className="h-10 w-10 sm:h-8 sm:w-8 p-0 text-gray-600 hover:bg-gray-100 hover:text-gray-900 focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                            title="Ver detalhes"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>

                          {/* 3. Editar Lote */}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(lote)}
                            className="h-10 w-10 sm:h-8 sm:w-8 p-0 text-gray-600 hover:bg-gray-100 hover:text-gray-900 focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                            title="Editar lote"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>

                          {/* 4. Arquivar/Desarquivar */}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={async () => {
                              try {
                                if (showArchived) {
                                  await unarchiveGuestLot(lote.id);
                                } else {
                                  await archiveGuestLot(lote.id);
                                }
                              } catch (_error) {
                                logger.error('Erro ao alterar status do lote:', _error);
                              }
                            }}
                            className="h-10 w-10 sm:h-8 sm:w-8 p-0 text-gray-600 hover:bg-gray-100 hover:text-gray-900 focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                            title={showArchived ? "Desarquivar" : "Arquivar"}
                          >
                            <Archive className="h-4 w-4" />
                          </Button>

                          {/* 5. Menu de 3 pontos (apenas Deletar) */}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-10 w-10 sm:h-8 sm:w-8 p-0 text-gray-600 hover:bg-gray-100 hover:text-gray-900 focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                                title="Mais ações"
                              >
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              {/* Deletar */}
                              <DropdownMenuItem
                                className="text-red-600 focus:text-red-600 focus:bg-red-50"
                                onClick={async () => {
                                  if (window.confirm(`Tem certeza que deseja deletar permanentemente o lote #${lote.numero}?\n\nEsta ação não pode ser desfeita.`)) {
                                    try {
                                      await deleteGuestLot(lote.id);
                                    } catch (error) {
                                      logger.error('Erro ao deletar lote:', error);
                                    }
                                  }
                                }}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                Deletar Lote
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Wizard de Cadastro/Edição */}
      <LoteConvidadoWizard
        open={wizardOpen}
        onOpenChange={handleCloseWizard}
        initialData={editingLote}
        leiloes={leiloes}
      />

      {/* Modal de Visualização de Detalhes */}
      <Dialog open={isViewModalOpen} onOpenChange={setIsViewModalOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Detalhes do Lote #{selectedLote?.numero}
            </DialogTitle>
            <DialogDescription>
              Visualize todas as informações detalhadas do lote de convidado
            </DialogDescription>
          </DialogHeader>
          {selectedLote && (
            <div className="space-y-4 sm:space-y-6">
              {/* Informações Básicas */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium text-gray-700">Número do Lote</Label>
                  <p className="mt-1 text-sm font-semibold text-gray-900">#{selectedLote.numero}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-700">Status</Label>
                  <div className="mt-1">
                    {getStatusBadge(selectedLote.status)}
                  </div>
                </div>
              </div>

              {/* Descrição */}
              <div>
                <Label className="text-sm font-medium text-gray-700">Descrição do lote</Label>
                <p className="mt-1 p-3 bg-gray-50 border border-gray-200 rounded-md text-sm">
                  {selectedLote.descricao}
                </p>
              </div>

              {/* Proprietário */}
              <div>
                <Label className="text-sm font-medium text-gray-700">
                  {selectedLote.mercadorias?.length === 1 ? 'Proprietário da Mercadoria' : 'Proprietário das Mercadorias'}
                </Label>
                <div className="mt-2 p-4 bg-gray-50 border border-gray-200 rounded-md">
                  <p className="text-sm font-semibold text-gray-900 mb-2">{selectedLote.proprietario}</p>
                  <div className="space-y-1 text-sm text-gray-600">
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4" />
                      <span>{selectedLote.codigo_pais} {selectedLote.celular_proprietario}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4" />
                      <span>{selectedLote.email_proprietario}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Mercadorias */}
              {selectedLote.mercadorias && selectedLote.mercadorias.length > 0 && (
                <div>
                  <Label className="text-sm font-medium text-gray-700 mb-3 block">
                    Mercadorias ({selectedLote.mercadorias.length})
                  </Label>
                  <div className="space-y-3">
                    {selectedLote.mercadorias.map((mercadoria: GuestLotMerchandise, index: number) => (
                      <div key={mercadoria.id || index} className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
                        <div className="flex items-start justify-between mb-2">
                          <h4 className="text-sm font-semibold text-gray-900">{mercadoria.nome}</h4>
                          {mercadoria.quantidade && (
                            <Badge variant="outline" className="ml-2">
                              Qtd: {mercadoria.quantidade}
                            </Badge>
                          )}
                        </div>
                        {mercadoria.descricao && (
                          <p className="text-sm text-gray-700 mb-2">{mercadoria.descricao}</p>
                        )}
                        {mercadoria.valor_estimado && (
                          <p className="text-sm text-gray-600">
                            <span className="font-medium">Valor Estimado:</span> R$ {mercadoria.valor_estimado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Imagens do Lote */}
              {selectedLote.imagens && selectedLote.imagens.length > 0 && (
                <div>
                  <Label className="text-sm font-medium text-gray-700 mb-3 block">
                    Imagens do Lote ({selectedLote.imagens.length})
                  </Label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {selectedLote.imagens.map((img: string, index: number) => (
                      <div 
                        key={index} 
                        className="group relative aspect-square rounded-lg overflow-hidden border-2 border-gray-200 hover:border-gray-400 transition-all cursor-pointer"
                        onClick={() => {
                          const isBase64 = img.startsWith('data:');
                          
                          if (isBase64) {
                            try {
                              const matches = img.match(/^data:([^;]+);base64,(.+)$/);
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
                                window.open(blobUrl, '_blank');
                                setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
                              }
                            } catch (error) {
                              logger.error('Erro ao abrir imagem:', error);
                            }
                          } else {
                            window.open(img, '_blank');
                          }
                        }}
                      >
                        {/* 🔒 SEGURANÇA: Usando componente seguro sem innerHTML */}
                        <ImageWithFallback
                          src={img}
                          alt={`Imagem ${index + 1}`}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                          containerClassName="w-full h-full"
                          showZoomOverlay={false}
                        />
                        <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-10 transition-all duration-200 flex items-center justify-center">
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-white rounded-full p-2 shadow-lg">
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-700">
                              <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7"/>
                            </svg>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Documentos */}
              <div>
                <Label className="text-sm font-medium text-gray-700 mb-3 block">
                  Documentos {selectedLote.documentos && selectedLote.documentos.length > 0 && `(${selectedLote.documentos.length})`}
                </Label>
                {selectedLote.documentos && selectedLote.documentos.length > 0 ? (
                  <div>
                    {/* Imagens dos documentos */}
                    {selectedLote.documentos.some((doc: string) => 
                      /^data:image/.test(doc) || 
                      (/\.(jpg|jpeg|png|gif|webp)$/i.test(doc) && 
                      (doc.startsWith('http://') || doc.startsWith('https://') || doc.startsWith('blob:')))
                    ) && (
                      <div className="mb-4">
                        <p className="text-xs font-medium text-gray-600 mb-2">Imagens</p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                          {selectedLote.documentos
                            .filter((doc: string) => 
                              /^data:image/.test(doc) || 
                              (/\.(jpg|jpeg|png|gif|webp)$/i.test(doc) && 
                              (doc.startsWith('http://') || doc.startsWith('https://') || doc.startsWith('blob:')))
                            )
                            .map((doc: string, index: number) => (
                              <div 
                                key={index}
                                className="group relative aspect-square rounded-lg overflow-hidden border-2 border-gray-200 hover:border-gray-400 transition-all cursor-pointer"
                                onClick={() => {
                                  logger.debug('🖼️ Clicou na imagem:', `Documento ${index + 1}`);
                                  const isBase64 = doc.startsWith('data:');
                                  logger.debug('📄 É base64:', isBase64);
                                  
                                  if (isBase64) {
                                    try {
                                      logger.debug('🔄 Processando imagem base64...');
                                      const matches = doc.match(/^data:([^;]+);base64,(.+)$/);
                                      if (matches) {
                                        const mimeType = matches[1];
                                        const base64Data = matches[2];
                                        logger.debug(`✅ MIME: ${mimeType} Size: ${base64Data.length}`);
                                        
                                        const byteCharacters = atob(base64Data);
                                        const byteNumbers = new Array(byteCharacters.length);
                                        for (let i = 0; i < byteCharacters.length; i++) {
                                          byteNumbers[i] = byteCharacters.charCodeAt(i);
                                        }
                                        const byteArray = new Uint8Array(byteNumbers);
                                        const blob = new Blob([byteArray], { type: mimeType });
                                        const blobUrl = URL.createObjectURL(blob);
                                        logger.debug('✅ Blob URL criado:', blobUrl);
                                        
                                        const newWindow = window.open(blobUrl, '_blank');
                                        logger.debug('🚀 Janela aberta:', newWindow !== null);
                                        
                                        if (newWindow) {
                                          // Limpar URL após 2 minutos (consistente com docs)
                                          setTimeout(() => {
                                            URL.revokeObjectURL(blobUrl);
                                            logger.debug('🧹 Blob URL da imagem limpo');
                                          }, 120000);
                                        } else {
                                          logger.error('❌ Popup bloqueado');
                                          URL.revokeObjectURL(blobUrl);
                                        }
                                      }
                                    } catch (error) {
                                      logger.error('❌ Erro ao abrir imagem:', error);
                                    }
                                  } else {
                                    logger.debug('🌐 Abrindo URL da imagem:', doc.substring(0, 100));
                                    window.open(doc, '_blank');
                                  }
                                }}
                              >
                                {/* 🔒 SEGURANÇA: Usando componente seguro sem innerHTML */}
                                <ImageWithFallback
                                  src={doc}
                                  alt={`Documento ${index + 1}`}
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                                  containerClassName="w-full h-full"
                                  showZoomOverlay={false}
                                />
                                <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-10 transition-all duration-200 flex items-center justify-center">
                                  <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-white rounded-full p-2 shadow-lg">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-700">
                                      <path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7"/>
                                    </svg>
                                  </div>
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
                    
                    {/* Outros documentos (não-imagens) */}
                    {selectedLote.documentos.some((doc: string) => 
                      !(/^data:image/.test(doc) || 
                      (/\.(jpg|jpeg|png|gif|webp)$/i.test(doc) && 
                      (doc.startsWith('http://') || doc.startsWith('https://') || doc.startsWith('blob:'))))
                    ) && (
                      <div>
                        {selectedLote.documentos.some((doc: string) => 
                          /^data:image/.test(doc) || 
                          (/\.(jpg|jpeg|png|gif|webp)$/i.test(doc) && 
                          (doc.startsWith('http://') || doc.startsWith('https://') || doc.startsWith('blob:')))
                        ) && <p className="text-xs font-medium text-gray-600 mb-2">Outros Documentos</p>}
                        <div className="space-y-2">
                          {selectedLote.documentos
                            .filter((doc: string) => 
                              !(/^data:image/.test(doc) || 
                              (/\.(jpg|jpeg|png|gif|webp)$/i.test(doc) && 
                              (doc.startsWith('http://') || doc.startsWith('https://') || doc.startsWith('blob:'))))
                            )
                            .map((doc: string, index: number) => {
                              const isBase64 = doc.startsWith('data:');
                              const isURL = doc.startsWith('http://') || doc.startsWith('https://') || doc.startsWith('blob:');
                              const canOpen = isBase64 || isURL;
                              
                              // Extrair nome do arquivo do base64 (se possível)
                              let fileName = `Documento ${index + 1}`;
                              if (isBase64) {
                                // Tentar extrair extensão do tipo MIME
                                const mimeMatch = doc.match(/^data:([^;]+);/);
                                if (mimeMatch) {
                                  const mime = mimeMatch[1];
                                  const ext = mime.split('/')[1];
                                  fileName = `documento.${ext}`;
                                }
                              } else if (isURL) {
                                fileName = doc.split('/').pop() || fileName;
                              } else {
                                fileName = doc;
                              }
                              
                              return (
                                <button
                                  key={index}
                                  type="button"
                                  onClick={() => {
                                    logger.debug('🔍 Clicou no documento:', fileName);
                                    logger.debug('📄 Tipo:', { isBase64, isURL, canOpen });
                                    logger.debug('📝 Preview do doc:', doc.substring(0, 100));
                                    
                                    if (canOpen) {
                                      // Para base64, criar um blob e abrir
                                      if (isBase64) {
                                        try {
                                          logger.debug('🔄 Processando base64...');
                                          // Extrair o tipo MIME e os dados
                                          const matches = doc.match(/^data:([^;]+);base64,(.+)$/);
                                          if (matches) {
                                            const mimeType = matches[1];
                                            const base64Data = matches[2];
                                            logger.debug('✅ MIME Type:', mimeType);
                                            logger.debug('✅ Base64 length:', base64Data.length);
                                            
                                            // Converter base64 para blob
                                            const byteCharacters = atob(base64Data);
                                            const byteNumbers = new Array(byteCharacters.length);
                                            for (let i = 0; i < byteCharacters.length; i++) {
                                              byteNumbers[i] = byteCharacters.charCodeAt(i);
                                            }
                                            const byteArray = new Uint8Array(byteNumbers);
                                            const blob = new Blob([byteArray], { type: mimeType });
                                            logger.debug(`✅ Blob criado: ${blob.size} bytes`);
                                            
                                            // Criar Blob URL (funciona para todos os tipos)
                                            const blobUrl = URL.createObjectURL(blob);
                                            logger.debug('✅ Blob URL criado:', blobUrl);
                                            logger.debug('✅ Blob type:', blob.type);
                                            logger.debug(`✅ Blob size: ${blob.size} bytes`);
                                            
                                            // Para PDFs, criar página HTML com iframe
                                            if (mimeType === 'application/pdf') {
                                              logger.debug('📄 Abrindo PDF em iframe...');
                                              const newWindow = window.open('', '_blank');
                                              if (newWindow) {
                                                newWindow.document.write(`
                                                  <!DOCTYPE html>
                                                  <html>
                                                    <head>
                                                      <title>${fileName}</title>
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
                                                logger.debug('✅ PDF aberto com sucesso');
                                                
                                                // Limpar blob URL após 2 minutos
                                                setTimeout(() => {
                                                  URL.revokeObjectURL(blobUrl);
                                                  logger.debug('🧹 Blob URL limpo');
                                                }, 120000);
                                              } else {
                                                logger.error('❌ Popup bloqueado');
                                                URL.revokeObjectURL(blobUrl);
                                              }
                                            } else {
                                              // Para outros tipos (imagens, DOC, etc), abrir diretamente
                                              logger.debug('📄 Abrindo arquivo diretamente...');
                                              const newWindow = window.open(blobUrl, '_blank');
                                              
                                              if (newWindow) {
                                                logger.debug('✅ Arquivo aberto com sucesso');
                                                // Limpar URL após 2 minutos
                                                setTimeout(() => {
                                                  URL.revokeObjectURL(blobUrl);
                                                  logger.debug('🧹 Blob URL limpo');
                                                }, 120000);
                                              } else {
                                                logger.error('❌ Popup bloqueado');
                                                URL.revokeObjectURL(blobUrl);
                                              }
                                            }
                                          } else {
                                            logger.error('❌ Formato base64 inválido');
                                            logger.error('Doc string:', doc.substring(0, 200));
                                          }
                                        } catch (error) {
                                          logger.error('❌ Erro ao abrir base64:', error);
                                        }
                                      } else {
                                        // Para URLs normais
                                        logger.debug('🌐 Abrindo URL:', doc);
                                        window.open(doc, '_blank');
                                      }
                                    } else {
                                      logger.warn('⚠️ Documento não pode ser aberto:', doc);
                                    }
                                  }}
                                  className="w-full flex items-center gap-3 p-3 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 hover:border-gray-300 transition-colors text-left"
                                >
                                  <div className="w-8 h-8 rounded bg-blue-100 flex items-center justify-center flex-shrink-0">
                                    <FileText className="h-4 w-4 text-blue-600" />
                                  </div>
                                  <div className="flex-1">
                                    <span className="text-sm text-gray-700 font-medium">{fileName}</span>
                                    <p className="text-xs text-gray-500 mt-0.5">
                                      {canOpen ? 'Clique para visualizar' : 'Nome do arquivo'}
                                    </p>
                                  </div>
                                </button>
                              );
                            })}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-6 border-2 border-dashed border-gray-200 rounded-lg">
                    <FileText className="h-8 w-8 mx-auto text-gray-300 mb-2" />
                    <p className="text-sm text-gray-500">Nenhum documento anexado</p>
                  </div>
                )}
              </div>

              {/* Leilão Vinculado */}
              <div>
                <Label className="text-sm font-medium text-gray-700">Leilão Vinculado</Label>
                <p className="mt-1 p-3 bg-gray-50 border border-gray-200 rounded-md text-sm">
                  {selectedLote.leilao_nome || (
                    <span className="text-gray-400 italic">Não vinculado a nenhum leilão</span>
                  )}
                </p>
              </div>

              {/* Observações */}
              {selectedLote.observacoes && (
                <div>
                  <Label className="text-sm font-medium text-gray-700">Observações</Label>
                  <p className="mt-1 p-3 bg-gray-50 border border-gray-200 rounded-md text-sm">
                    {selectedLote.observacoes}
                  </p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Wizard de Arrematantes */}
      {addingArrematanteFor && (() => {
        const isNewArrematante = editingArrematanteId === '__NEW__';
        
        // Buscar arrematante para editar (se houver ID válido)
        let arrematanteParaEditar: ArrematanteInfo | undefined;
        if (editingArrematanteId && editingArrematanteId !== '__NEW__' && editingArrematanteId !== null) {
          // ✅ Buscar nos arrematantes do lote
          const arrematanteSimples = (addingArrematanteFor.arrematantes || []).find(
            (arr) => arr.id === editingArrematanteId
          );
          
          // ✅ Se encontrou, buscar dados completos do banco
          if (arrematanteSimples) {
            // Nota: Aqui poderíamos fazer uma query para buscar dados completos,
            // mas por ora vamos usar os dados básicos e o wizard vai completar
            arrematanteParaEditar = {
              id: arrematanteSimples.id,
              nome: arrematanteSimples.nome,
              email: arrematanteSimples.email,
              telefone: arrematanteSimples.telefone,
              // Outros campos serão carregados pelo wizard conforme necessário
            } as ArrematanteInfo;
          }
        }

        // Converter mercadorias do lote para o formato esperado pelo wizard
        const lotesForWizard: LoteInfo[] = [{
          id: addingArrematanteFor.id,
          numero: addingArrematanteFor.numero,
          descricao: addingArrematanteFor.descricao,
          mercadorias: addingArrematanteFor.mercadorias.map(m => ({
            id: m.id,
            nome: m.nome,
            descricao: m.descricao,
            quantidade: m.quantidade,
            valorEstimado: m.valor_estimado,
          }))
        }];

        // ✅ Buscar arrematantes do LOTE DE CONVIDADO para passar ao wizard
        const arrematantesDoLote: ArrematanteInfo[] = (addingArrematanteFor.arrematantes || []).map(arr => {
          // Extrair código país do telefone
          let telefoneNum = arr.telefone || '';
          let codigoPaisVal = '+55';
          if (telefoneNum && telefoneNum.startsWith('+')) {
            const match = telefoneNum.match(/^(\+\d+)\s+(.+)$/);
            if (match) {
              codigoPaisVal = match[1];
              telefoneNum = match[2];
            }
          }
          
          // ✅ Criar objeto parcial com campos mínimos necessários
          return {
            id: arr.id,
            nome: arr.nome || '',
            telefone: telefoneNum,
            codigoPais: codigoPaisVal,
            email: arr.email,
            pago: arr.pago || false,
            // Campos obrigatórios com valores padrão
            valorPagar: '',
            valorPagarNumerico: 0,
            diaVencimentoMensal: 15,
            quantidadeParcelas: 1,
            mesInicioPagamento: '',
            tipoPagamento: 'a_vista' as const,
            // Outros campos opcionais
            documento: '',
            endereco: '',
            cep: '',
            loteId: '',
            mercadoriaId: '',
            valorEntrada: '',
            valorEntradaTexto: '',
            parcelasPagas: 0,
            percentualJurosAtraso: 0,
            tipoJurosAtraso: 'composto' as const,
            documentos: [],
            dataVencimentoVista: undefined,
            dataEntrada: undefined,
          } as ArrematanteInfo;
        });

        logger.debug('📋 Arrematantes do lote disponíveis:', arrematantesDoLote.length);

        return (
          <ArrematanteWizard
            initial={{
              arrematante: arrematanteParaEditar,
              lotes: lotesForWizard,
              auctionName: `Lote ${addingArrematanteFor.numero}`,
              auctionId: addingArrematanteFor.id,
              defaultDiaVencimento: 15,
              defaultQuantidadeParcelas: 1,
              defaultMesInicio: new Date().toISOString().slice(0, 7),
              // ✅ Passar arrematantes do lote para o wizard
              auction: arrematantesDoLote.length > 0 ? {
                id: addingArrematanteFor.id,
                nome: `Lote ${addingArrematanteFor.numero}`,
                arrematantes: arrematantesDoLote
              } as unknown as Auction : undefined,
            }}
            isNewArrematante={isNewArrematante}
            onSubmit={async (data) => {
              if (!addingArrematanteFor) return;
              
              try {
                setIsSavingArrematante(true);
                
                // Garantir que __NEW__ não seja usado como ID real
                const realEditingId = (editingArrematanteId === '__NEW__' || editingArrematanteId === null) 
                  ? undefined 
                  : editingArrematanteId;
                
                // Verificar se está editando ou criando novo
                const isEditing = !!(data.id || realEditingId);
                
                const arrematanteData: Record<string, unknown> = {
                  // ✅ Só incluir ID se estiver editando
                  ...(isEditing ? { id: data.id || realEditingId } : {}),
                  auction_id: null, // Não vincular a leilão
                  guest_lot_id: addingArrematanteFor.id, // ✅ Vincular ao lote de convidado
                  nome: data.nome || "",
                  documento: data.documento || null,
                  endereco: data.endereco || null,
                  cep: data.cep || null,
                  rua: data.rua || null,
                  numero: data.numero || null,
                  complemento: data.complemento || null,
                  bairro: data.bairro || null,
                  cidade: data.cidade || null,
                  estado: data.estado || null,
                  telefone: data.telefone || null,
                  email: data.email || null,
                  lote_id: data.loteId || null,
                  mercadoria_id: data.mercadoriaId || null,
                  tipo_pagamento: data.tipoPagamento || 'a_vista',
                  valor_pagar_texto: data.valorPagar || "",
                  valor_pagar_numerico: parseCurrencyToNumber(data.valorPagar || ""),
                  valor_entrada_texto: data.valorEntrada || null,
                  dia_vencimento_mensal: data.diaVencimentoMensal || 15,
                  quantidade_parcelas: data.quantidadeParcelas || 1,
                  parcelas_pagas: data.parcelasPagas || 0,
                  mes_inicio_pagamento: data.mesInicioPagamento || "",
                  data_entrada: data.dataEntrada || null,
                  data_vencimento_vista: data.dataVencimentoVista || null,
                  pago: data.pago || false,
                  percentual_juros_atraso: data.percentualJurosAtraso || 0,
                  tipo_juros_atraso: data.tipoJurosAtraso || 'composto',
                  valor_lance: data.valorLance || null,
                  fator_multiplicador: data.fatorMultiplicador || null,
                  usa_fator_multiplicador: data.usaFatorMultiplicador || false,
                  parcelas_triplas: typeof data.parcelasTriplas === 'number' ? data.parcelasTriplas : null,
                  parcelas_duplas: typeof data.parcelasDuplas === 'number' ? data.parcelasDuplas : null,
                  parcelas_simples: typeof data.parcelasSimples === 'number' ? data.parcelasSimples : null,
                };

                if (isEditing) {
                  // Atualizar arrematante existente
                  const { error } = await (supabase as unknown as { from: (table: string) => { update: (data: Record<string, unknown>) => { eq: (column: string, value?: string) => Promise<{ error?: Error }> } } })
                    .from('bidders')
                    .update(arrematanteData)
                    .eq('id', data.id || realEditingId);

                  if (error) throw error;

                  // Toast de sucesso removido - notificação silenciosa
                } else {
                  // Criar novo arrematante
                  const { error } = await (supabase as unknown as { from: (table: string) => { insert: (data: Record<string, unknown>[]) => Promise<{ error?: Error }> } })
                    .from('bidders')
                    .insert([arrematanteData]);

                  if (error) throw error;
                }

                // Atualizar status do lote para "arrematado" se ainda não estiver
                if (addingArrematanteFor.status !== 'arrematado') {
                  type SupabaseClient = { from: (table: string) => { update: (data: Record<string, unknown>) => { eq: (column: string, value: string) => Promise<{ error?: Error }> } } };
                  const { error: statusError } = await (supabase as unknown as SupabaseClient)
                    .from('guest_lots')
                    .update({ status: 'arrematado' })
                    .eq('id', addingArrematanteFor.id);

                  if (statusError) logger.error('Erro ao atualizar status:', statusError);
                }

                // ✅ Invalidar cache para atualizar a lista de lotes
                await queryClient.invalidateQueries({ queryKey: ['guest-lots'] });

                // Fechar wizard
                setAddingArrematanteFor(null);
                setEditingArrematanteId(null);
                
              } catch (error) {
                logger.error("Erro ao salvar arrematante:", error);
              } finally {
                setIsSavingArrematante(false);
              }
            }}
            onCancel={() => {
              setAddingArrematanteFor(null);
              setEditingArrematanteId(null);
            }}
          />
        );
      })()}
    </div>
  );
}
