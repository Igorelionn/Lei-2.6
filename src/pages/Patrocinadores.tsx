import { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { logger } from "@/lib/logger";
import { Handshake, Plus, Search, Eye, Edit, Archive, DollarSign, TrendingUp, Building2, Check, X, ChevronRight, AlertCircle, Gavel } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useSupabaseAuctions } from "@/hooks/use-supabase-auctions";
import { useToast } from "@/hooks/use-toast";

interface PatrocinadorAgregado {
  id: string;
  empresa: string;
  totalInvestido: number;
  leiloesPatrocinados: number;
  leiloes: Set<string>;
  leiloesIds: string[]; // IDs dos leilões para navegação
  status: 'ativo' | 'inativo';
  recebido?: boolean; // Indica se o patrocínio foi recebido
  valorMedio: number; // Valor médio investido por leilão
  statusPagamento: 'pago' | 'atrasado' | 'pendente'; // Status geral de pagamento
  proximoVencimento: string | null; // Data do próximo vencimento (mais próximo)
  patrocinios: Array<{ // Array de patrocínios individuais
    leilaoId: string;
    leilaoNome: string;
    valor: number;
    recebido: boolean;
    formaPagamento?: 'a_vista' | 'parcelado' | 'entrada_parcelamento';
    dataVencimento?: string;
    dataVencimentoDate?: Date; // Para ordenação
  }>;
}

export default function Patrocinadores() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const [searchInputValue, setSearchInputValue] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("todos");
  const [showArchived, setShowArchived] = useState(false);
  
  // Estados para o modal de confirmação de pagamento
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedPatrocinadorForPayment, setSelectedPatrocinadorForPayment] = useState<PatrocinadorAgregado | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<Array<{leilaoId: string, leilaoNome: string, paid: boolean, dueDate: string, valor: number, tipo?: string, numeroParcela?: number}>>([]);
  
  // Estados para o wizard de seleção de leilão
  const [isSelectAuctionModalOpen, setIsSelectAuctionModalOpen] = useState(false);
  const [auctionSearchTerm, setAuctionSearchTerm] = useState("");
  const [isTypingAuction, setIsTypingAuction] = useState(false);
  const [showAllAuctions, setShowAllAuctions] = useState(false);
  const [isHoveringAuctionButton, setIsHoveringAuctionButton] = useState(false);
  
  // Estado para o modal de visualização de detalhes
  const [viewingPatrocinador, setViewingPatrocinador] = useState<PatrocinadorAgregado | null>(null);

  // Buscar leilões do banco
  const { auctions, isLoading, updateAuction } = useSupabaseAuctions();
  const { toast } = useToast();

  // Função para abrir modal de confirmação de pagamento
  const handleConfirmReceipt = (patrocinador: PatrocinadorAgregado) => {
    setSelectedPatrocinadorForPayment(patrocinador);
    
    // Criar array de status de pagamento, desmembrando entrada + parcelas quando necessário
    const statusArray: Array<{leilaoId: string, leilaoNome: string, paid: boolean, dueDate: string, valor: number, tipo?: string, numeroParcela?: number}> = [];
    
    patrocinador.patrocinios.forEach((pat) => {
      // Buscar detalhes completos do patrocínio no leilão
      const auction = auctions.find(a => a.id === pat.leilaoId);
      const detalhesPatrocinio = auction?.detalhePatrocinios?.find(
        p => p.nomePatrocinador === patrocinador.empresa
      );
      
      if (pat.formaPagamento === 'entrada_parcelamento' && detalhesPatrocinio) {
        // Desmembrar em entrada + parcelas
        const valorEntrada = detalhesPatrocinio.valorEntradaNumerico || 0;
        const dataEntrada = detalhesPatrocinio.dataEntrada || '';
        
        // Adicionar entrada
        const dataEntradaFormatada = dataEntrada ? new Date(dataEntrada + 'T00:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) : '';
        const nomeEntrada = dataEntradaFormatada ? `${dataEntradaFormatada.charAt(0).toUpperCase() + dataEntradaFormatada.slice(1)} (Entrada)` : 'Entrada';
        
        // Formatar data da entrada para exibição
        const dataEntradaFormatadaCompleta = dataEntrada ? new Date(dataEntrada + 'T00:00:00').toLocaleDateString('pt-BR') : '';
        
        statusArray.push({
          leilaoId: pat.leilaoId,
          leilaoNome: nomeEntrada,
          paid: detalhesPatrocinio.parcelasRecebidas ? detalhesPatrocinio.parcelasRecebidas > 0 : false,
          dueDate: dataEntradaFormatadaCompleta,
          valor: valorEntrada,
          tipo: 'entrada',
          numeroParcela: 0
        });
        
        // Calcular e adicionar parcelas
        const valorLance = detalhesPatrocinio.valorLanceNumerico || 0;
        const fator = detalhesPatrocinio.fatorMultiplicador || 1;
        const triplas = detalhesPatrocinio.parcelasTriplas || 0;
        const duplas = detalhesPatrocinio.parcelasDuplas || 0;
        const simples = detalhesPatrocinio.parcelasSimples || 0;
        let mesInicio = detalhesPatrocinio.mesInicioPagamento || '';
        const diaVencimento = detalhesPatrocinio.diaVencimentoMensal || 15;
        const parcelasRecebidas = detalhesPatrocinio.parcelasRecebidas || 0;
        
        // ✅ CORREÇÃO: Para entrada + parcelamento, calcular mês seguinte à entrada
        if (dataEntrada && mesInicio) {
          // Normalizar mesInicio para formato YYYY-MM
          if (mesInicio.includes('-')) {
            const partes = mesInicio.split('-');
            if (partes.length === 3) {
              // Se veio como YYYY-MM-DD, pegar apenas ano e mês
              mesInicio = `${partes[0]}-${partes[1]}`;
            }
          }
          
          // Calcular o mês seguinte ao da entrada
          const [anoEntrada, mesEntrada] = dataEntrada.split('-').map(Number);
          // ✅ Usar dia 1 para evitar problemas com meses que não têm 29/30/31 dias
          const dataProximoMes = new Date(anoEntrada, mesEntrada - 1 + 1, 1); // Dia 1 do próximo mês
          const anoProximoMes = dataProximoMes.getFullYear();
          const mesProximoMes = String(dataProximoMes.getMonth() + 1).padStart(2, '0');
          mesInicio = `${anoProximoMes}-${mesProximoMes}`;
        }
        
        // ✅ CORREÇÃO: Calcular valor total e distribuir entre as parcelas
        const totalParcelas = valorLance * fator; // Total a ser parcelado
        const totalParcelasSimples = (triplas * 3) + (duplas * 2) + (simples * 1); // Quantidade equivalente de parcelas simples
        const valorParcelaBase = totalParcelasSimples > 0 ? totalParcelas / totalParcelasSimples : 0; // Valor de uma parcela simples
        
        let numeroParcelaAtual = 1;
        
        // Adicionar parcelas triplas
        for (let i = 0; i < triplas; i++) {
          const dataVencimento = calcularDataVencimento(mesInicio, diaVencimento, numeroParcelaAtual);
          const nomeParcela = formatarNomeParcela(mesInicio, diaVencimento, numeroParcelaAtual);
          statusArray.push({
            leilaoId: pat.leilaoId,
            leilaoNome: nomeParcela,
            paid: numeroParcelaAtual <= parcelasRecebidas,
            dueDate: dataVencimento,
            valor: valorParcelaBase * 3, // ✅ Parcela tripla = base × 3
            tipo: 'parcela',
            numeroParcela: numeroParcelaAtual
          });
          numeroParcelaAtual++;
        }
        
        // Adicionar parcelas duplas
        for (let i = 0; i < duplas; i++) {
          const dataVencimento = calcularDataVencimento(mesInicio, diaVencimento, numeroParcelaAtual);
          const nomeParcela = formatarNomeParcela(mesInicio, diaVencimento, numeroParcelaAtual);
          
          statusArray.push({
            leilaoId: pat.leilaoId,
            leilaoNome: nomeParcela,
            paid: numeroParcelaAtual <= parcelasRecebidas,
            dueDate: dataVencimento,
            valor: valorParcelaBase * 2, // ✅ Parcela dupla = base × 2
            tipo: 'parcela',
            numeroParcela: numeroParcelaAtual
          });
          numeroParcelaAtual++;
        }
        
        // Adicionar parcelas simples
        for (let i = 0; i < simples; i++) {
          const dataVencimento = calcularDataVencimento(mesInicio, diaVencimento, numeroParcelaAtual);
          const nomeParcela = formatarNomeParcela(mesInicio, diaVencimento, numeroParcelaAtual);
          statusArray.push({
            leilaoId: pat.leilaoId,
            leilaoNome: nomeParcela,
            paid: numeroParcelaAtual <= parcelasRecebidas,
            dueDate: dataVencimento,
            valor: valorParcelaBase, // ✅ Parcela simples = base × 1
            tipo: 'parcela',
            numeroParcela: numeroParcelaAtual
          });
          numeroParcelaAtual++;
        }
      } else {
        // À vista ou parcelamento simples - tratar como único pagamento
        statusArray.push({
          leilaoId: pat.leilaoId,
          leilaoNome: pat.leilaoNome,
          paid: pat.recebido,
          dueDate: pat.dataVencimentoDate ? pat.dataVencimentoDate.toLocaleDateString('pt-BR') : '',
          valor: pat.valor
        });
      }
    });
    
    setPaymentStatus(statusArray);
    setIsPaymentModalOpen(true);
  };
  
  // Função auxiliar para calcular data de vencimento de parcela
  const calcularDataVencimento = (mesInicio: string, diaVencimento: number, numeroParcela: number): string => {
    if (!mesInicio) return '';
    
    try {
      const [ano, mes] = mesInicio.split('-').map(Number);
      // ✅ Calcular o mês alvo
      const mesAlvo = mes - 1 + (numeroParcela - 1);
      
      // ✅ Criar data com dia 1 para evitar overflow
      const dataBase = new Date(ano, mesAlvo, 1);
      
      // ✅ Obter o último dia do mês
      const ultimoDiaDoMes = new Date(dataBase.getFullYear(), dataBase.getMonth() + 1, 0).getDate();
      
      // ✅ Usar o menor valor entre diaVencimento e ultimoDiaDoMes
      // Exemplos:
      // - Dia 30 em fevereiro/2024 (bissexto, 29 dias) → usa dia 29
      // - Dia 30 em fevereiro/2026 (normal, 28 dias) → usa dia 28
      // - Dia 29 em fevereiro/2026 (normal, 28 dias) → usa dia 28
      // - Dia 31 em abril (30 dias) → usa dia 30
      const diaFinal = Math.min(diaVencimento, ultimoDiaDoMes);
      
      // ✅ Criar a data final
      const dataFinal = new Date(dataBase.getFullYear(), dataBase.getMonth(), diaFinal);
      
      return dataFinal.toLocaleDateString('pt-BR');
    } catch {
      return '';
    }
  };
  
  // Função auxiliar para formatar nome da parcela (ex: "Janeiro de 2026")
  const formatarNomeParcela = (mesInicio: string, diaVencimento: number, numeroParcela: number): string => {
    if (!mesInicio) return '';
    
    try {
      const [ano, mes] = mesInicio.split('-').map(Number);
      // ✅ Calcular o mês alvo
      const mesAlvo = mes - 1 + (numeroParcela - 1);
      
      // ✅ Criar data com dia 1 para evitar overflow
      const dataBase = new Date(ano, mesAlvo, 1);
      
      const nomeMes = dataBase.toLocaleDateString('pt-BR', { month: 'long' });
      const anoFormatado = dataBase.getFullYear();
      
      return `${nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1)} de ${anoFormatado}`;
    } catch {
      return '';
    }
  };

  // Função para desmarcar recebimento do patrocínio (fecha modal)
  const handleUnconfirmReceipt = (patrocinador: PatrocinadorAgregado) => {
    handleConfirmReceipt(patrocinador); // Abre o modal normalmente
  };

  // Função para alternar status de pagamento
  const handlePaymentToggle = (index: number, checked: boolean) => {
    setPaymentStatus(prev => {
      const newStatus = [...prev];
      newStatus[index] = { ...newStatus[index], paid: checked };
      return newStatus;
    });
  };

  // ✅ NOVA: Função para editar patrocinador (navegar para o leilão)
  const handleEditPatrocinador = (patrocinador: PatrocinadorAgregado) => {
    // Pegar o primeiro leilão que este patrocinador está vinculado
    const primeiroLeilaoId = Array.from(patrocinador.leiloes)[0];
    
    if (primeiroLeilaoId) {
      // Navegar para a página de leilões com o leilão selecionado
      // O parâmetro de estado indica que deve abrir o wizard na aba "Custos e Patrocínios"
      navigate('/leiloes', { 
        state: { 
          editAuctionId: primeiroLeilaoId,
          openTab: 'custos-patrocinios' 
        } 
      });
    }
  };

  // Função para salvar pagamentos dos patrocínios
  const handleSavePayments = async () => {
    if (!selectedPatrocinadorForPayment) return;

    try {
      // Agrupar status de pagamento por leilão
      const leiloesMap = new Map<string, typeof paymentStatus>();
      paymentStatus.forEach(status => {
        const existing = leiloesMap.get(status.leilaoId) || [];
        existing.push(status);
        leiloesMap.set(status.leilaoId, existing);
      });

      // Atualizar cada leilão
      for (const [leilaoId, statusDoLeilao] of leiloesMap.entries()) {
        const auction = auctions.find(a => a.id === leilaoId);
        if (!auction) continue;

        // Atualizar o status de recebido do patrocínio
        const updatedPatrocinios = (auction.detalhePatrocinios || []).map((p) => {
          if (p.nomePatrocinador === selectedPatrocinadorForPayment.empresa) {
            // Verificar se é entrada + parcelamento
            if (p.formaPagamento === 'entrada_parcelamento') {
              // Contar quantas parcelas foram marcadas como pagas (excluindo entrada)
              const parcelasPagas = statusDoLeilao.filter(s => s.tipo === 'parcela' && s.paid).length;
              const entradaPaga = statusDoLeilao.find(s => s.tipo === 'entrada')?.paid || false;
              
              // Calcular total de parcelas
              const totalParcelas = (p.parcelasTriplas || 0) + (p.parcelasDuplas || 0) + (p.parcelasSimples || 0);
              
              // Se entrada foi paga, adicionar 1 ao contador de parcelasRecebidas
              const parcelasRecebidas = entradaPaga ? parcelasPagas + 1 : parcelasPagas;
              
              // Marcar como recebido se entrada + todas as parcelas foram pagas
              const recebido = entradaPaga && parcelasPagas === totalParcelas;
              
              return {
                ...p,
                parcelasRecebidas,
                recebido
              };
            } else {
              // À vista ou parcelamento simples - usar primeiro status
              const paid = statusDoLeilao[0]?.paid || false;
              return {
                ...p,
                recebido: paid
              };
            }
          }
          return p;
        });

        // Atualizar o leilão
        await updateAuction({
          id: auction.id,
          data: {
            detalhePatrocinios: updatedPatrocinios
          }
        });
      }

      // Toast de sucesso removido - notificação silenciosa

      setIsPaymentModalOpen(false);
      setSelectedPatrocinadorForPayment(null);
      setPaymentStatus([]);
    } catch (error) {
      logger.error('Erro ao salvar pagamentos:', error);
      toast({
        title: "Erro ao salvar",
        description: "Não foi possível atualizar os pagamentos. Tente novamente.",
        variant: "destructive"
      });
    }
  };

  // Função para abrir o wizard de seleção de leilão
  const handleNovoPatrocinador = () => {
    setAuctionSearchTerm("");
    setIsSelectAuctionModalOpen(true);
  };

  // Função para selecionar um leilão e navegar para custos e patrocínios
  const handleSelectAuction = (auctionId: string) => {
    setIsSelectAuctionModalOpen(false);
    navigate('/leiloes', {
      state: {
        editAuctionId: auctionId,
        openTab: 'custos-patrocinios' // Abre diretamente na aba de custos e patrocínios
      }
    });
  };

  // Debounce para a busca
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchTerm(searchInputValue);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInputValue]);

  // ✅ Detectar quando está digitando no campo de busca de leilão
  useEffect(() => {
    if (auctionSearchTerm) {
      setIsTypingAuction(true);
      const timer = setTimeout(() => {
        setIsTypingAuction(false);
      }, 800); // Espera 800ms após parar de digitar
      
      return () => clearTimeout(timer);
    } else {
      setIsTypingAuction(false);
    }
  }, [auctionSearchTerm]);

  // Processar patrocinadores a partir dos leilões
  const patrocinadores = useMemo(() => {
    if (!auctions || auctions.length === 0) return [];

    const patrocinadorMap = new Map<string, PatrocinadorAgregado>();
    const now = new Date();

    auctions.forEach((auction) => {
      // Filtrar por arquivado
      if (showArchived ? !auction.arquivado : auction.arquivado) return;
      
      if (auction.detalhePatrocinios && auction.detalhePatrocinios.length > 0) {
        auction.detalhePatrocinios.forEach((patrocinio) => {
          const nomeKey = patrocinio.nomePatrocinador.trim().toLowerCase();
          
          // ✅ Calcular valor total baseado na forma de pagamento
          let valorAConsiderar = 0;
          if (patrocinio.formaPagamento === 'entrada_parcelamento') {
            // Para entrada + parcelamento: soma entrada + total de parcelas
            const valorEntrada = patrocinio.valorEntradaNumerico || 0;
            const valorLance = patrocinio.valorLanceNumerico || 0;
            const fator = patrocinio.fatorMultiplicador || 1;
            const totalParcelas = valorLance * fator;
            valorAConsiderar = valorEntrada + totalParcelas;
          } else {
            // Para à vista ou parcelamento simples
            valorAConsiderar = patrocinio.valorNumerico || 0;
          }
          
          // Parse da data de vencimento baseado na forma de pagamento
          let dataVencimentoDate: Date | undefined;
          let dataVencimentoString: string | undefined;
          
          // Determinar qual campo de data usar baseado na forma de pagamento
          if (patrocinio.formaPagamento === 'a_vista' && patrocinio.dataVencimentoVista) {
            dataVencimentoString = patrocinio.dataVencimentoVista;
          } else if (patrocinio.formaPagamento === 'entrada_parcelamento' && patrocinio.dataEntrada) {
            dataVencimentoString = patrocinio.dataEntrada;
          } else if (patrocinio.formaPagamento === 'parcelamento' && patrocinio.mesInicioPagamento) {
            // Para parcelamento, calcular primeira data de vencimento
            const diaVencimento = patrocinio.diaVencimentoMensal || 15;
            dataVencimentoString = `${patrocinio.mesInicioPagamento}-${String(diaVencimento).padStart(2, '0')}`;
          }
          
          // Parse da data
          if (dataVencimentoString) {
            // Tentar diferentes formatos de data
            try {
              // Se for YYYY-MM-DD
              if (dataVencimentoString.includes('-')) {
                dataVencimentoDate = new Date(dataVencimentoString + 'T00:00:00');
              } 
              // Se for DD/MM/YYYY
              else if (dataVencimentoString.includes('/')) {
                const [dia, mes, ano] = dataVencimentoString.split('/');
                dataVencimentoDate = new Date(`${ano}-${mes}-${dia}T00:00:00`);
              }
            } catch (error) {
              logger.warn('Erro ao parsear data de vencimento:', dataVencimentoString, error);
            }
          }
          
          const patrocinioObj = {
            leilaoId: auction.id,
            leilaoNome: auction.nome,
            valor: valorAConsiderar,
            recebido: patrocinio.recebido || false,
            formaPagamento: patrocinio.formaPagamento,
            dataVencimento: dataVencimentoString,
            dataVencimentoDate
          };
          
          if (patrocinadorMap.has(nomeKey)) {
            const existing = patrocinadorMap.get(nomeKey)!;
            existing.totalInvestido += valorAConsiderar;
            existing.leiloes.add(auction.id);
            existing.leiloesIds.push(auction.id);
            existing.leiloesPatrocinados = existing.leiloes.size;
            existing.valorMedio = existing.totalInvestido / existing.leiloesPatrocinados;
            existing.patrocinios.push(patrocinioObj);
            
            // Atualizar status de recebido
            if (!patrocinio.recebido) {
              existing.recebido = false;
            }
          } else {
            patrocinadorMap.set(nomeKey, {
              id: nomeKey,
              empresa: patrocinio.nomePatrocinador,
              totalInvestido: valorAConsiderar,
              leiloesPatrocinados: 1,
              leiloes: new Set([auction.id]),
              leiloesIds: [auction.id],
              valorMedio: valorAConsiderar,
              status: 'ativo',
              recebido: patrocinio.recebido || false,
              statusPagamento: 'pendente',
              proximoVencimento: null,
              patrocinios: [patrocinioObj]
            });
          }
        });
      }
    });

    // Calcular status de pagamento e próximo vencimento para cada patrocinador
    patrocinadorMap.forEach((patrocinador) => {
      const patrociniosPendentes = patrocinador.patrocinios.filter(p => !p.recebido);
      
      // Calcular status de pagamento
      if (patrocinador.patrocinios.every(p => p.recebido)) {
        patrocinador.statusPagamento = 'pago';
      } else {
        // Verificar se algum patrocínio está atrasado
        const temAtrasado = patrociniosPendentes.some(p => {
          if (p.dataVencimentoDate) {
            return p.dataVencimentoDate < now;
          }
          return false;
        });
        
        patrocinador.statusPagamento = temAtrasado ? 'atrasado' : 'pendente';
      }
      
      // Calcular próximo vencimento (mais próximo entre os pendentes)
      if (patrociniosPendentes.length > 0) {
        const vencimentos = patrociniosPendentes
          .filter(p => p.dataVencimentoDate)
          .sort((a, b) => a.dataVencimentoDate!.getTime() - b.dataVencimentoDate!.getTime());
        
        if (vencimentos.length > 0) {
          patrocinador.proximoVencimento = vencimentos[0].dataVencimentoDate!.toLocaleDateString('pt-BR');
        }
      }
    });

    return Array.from(patrocinadorMap.values());
  }, [auctions, showArchived]);

  // Estatísticas
  const stats = useMemo(() => {
    const total = patrocinadores.length;
    const ativos = patrocinadores.filter(p => p.status === 'ativo').length;
    const totalInvestido = patrocinadores.reduce((sum, p) => sum + p.totalInvestido, 0);
    const leiloesPatrocinados = new Set(patrocinadores.flatMap(p => Array.from(p.leiloes))).size;
    const valorMedioGeral = leiloesPatrocinados > 0 ? totalInvestido / leiloesPatrocinados : 0;
    
    // Calcular total recebido (apenas patrocínios confirmados)
    const totalRecebido = patrocinadores.reduce((sum, p) => {
      const valorRecebido = p.patrocinios
        .filter(pat => pat.recebido)
        .reduce((total, pat) => total + pat.valor, 0);
      return sum + valorRecebido;
    }, 0);

    return {
      total,
      ativos,
      totalInvestido,
      totalRecebido,
      leiloesPatrocinados,
      valorMedioGeral
    };
  }, [patrocinadores]);

  // Filtrar patrocinadores
  const filteredPatrocinadores = useMemo(() => {
    return patrocinadores.filter((patrocinador) => {
      const matchesSearch = searchTerm === "" || 
        patrocinador.empresa?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStatus = statusFilter === "todos" || patrocinador.status === statusFilter;
      
      return matchesSearch && matchesStatus;
    });
  }, [patrocinadores, searchTerm, statusFilter]);

  // Filtrar leilões para o wizard de seleção
  const filteredAuctions = useMemo(() => {
    if (!auctions || auctions.length === 0) return [];
    
    return auctions
      .filter(auction => {
        if (auctionSearchTerm === "") return true;
        
        const searchLower = auctionSearchTerm.toLowerCase().trim();
        const nomeLower = auction.nome?.toLowerCase() || '';
        
        // ✅ Se a busca tem espaços, buscar a sequência completa no início do nome
        if (searchLower.includes(' ')) {
          return nomeLower.startsWith(searchLower);
        }
        
        // ✅ Se não tem espaços, buscar por início de qualquer palavra
        const palavras = nomeLower.split(/\s+/);
        return palavras.some(palavra => palavra.startsWith(searchLower));
      })
      .sort((a, b) => {
        // Ordenar por data (mais recentes primeiro)
        const dateA = new Date(a.dataInicio || a.created_at || 0);
        const dateB = new Date(b.dataInicio || b.created_at || 0);
        return dateB.getTime() - dateA.getTime();
      });
  }, [auctions, auctionSearchTerm]);

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'ativo':
        return 'bg-green-100 text-green-800 border-green-200 hover:bg-green-100 hover:text-green-800 hover:border-green-200';
      case 'inativo':
        return 'bg-gray-100 text-gray-800 border-gray-200 hover:bg-gray-100 hover:text-gray-800 hover:border-gray-200';
      case 'arquivado':
        return 'bg-red-100 text-red-800 border-red-200 hover:bg-red-100 hover:text-red-800 hover:border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200 hover:bg-gray-100 hover:text-gray-800 hover:border-gray-200';
    }
  };

  const getStatusPagamentoBadge = (status: string) => {
    switch (status) {
      case 'pago':
        return <Badge variant="success">Pago</Badge>;
      case 'atrasado':
        return <Badge variant="destructive">Atrasado</Badge>;
      case 'pendente':
        return <Badge variant="warning">Pendente</Badge>;
      default:
        return <Badge variant="warning">Pendente</Badge>;
    }
  };

  const getStatusRecebimentoBadge = (recebido: boolean) => {
    return recebido 
      ? <Badge variant="success">Recebido</Badge>
      : <Badge variant="warning">Pendente</Badge>;
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'ativo':
        return 'Ativo';
      case 'inativo':
        return 'Inativo';
      case 'arquivado':
        return 'Arquivado';
      default:
        return status;
    }
  };

  return (
    <div className="space-y-6 p-6 slide-in-right">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Patrocinadores</h1>
          <p className="text-gray-600 mt-1">Gerencie empresas e organizações que apoiam seus leilões</p>
        </div>
      </div>

      {/* Indicadores Gerais */}
      <div className="bg-white border border-gray-200 shadow-sm rounded-lg p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="text-center">
            <div className="mb-4">
              <p className="text-xs font-semibold text-gray-700 uppercase tracking-[0.15em] mb-3">Total de Patrocinadores</p>
              <div className="h-px w-20 bg-gray-300 mx-auto mb-4"></div>
            </div>
            <p className="text-3xl font-extralight text-gray-900 mb-2 tracking-tight">{stats.total}</p>
            <p className="text-sm text-gray-600 font-medium">Empresas cadastradas</p>
          </div>

          <div className="text-center">
            <div className="mb-4">
              <p className="text-xs font-semibold text-gray-700 uppercase tracking-[0.15em] mb-3">Total Recebido</p>
              <div className="h-px w-20 bg-gray-300 mx-auto mb-4"></div>
            </div>
            <p className="text-3xl font-extralight text-gray-900 mb-2 tracking-tight">
              {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(stats.totalRecebido)}
            </p>
            <p className="text-sm text-gray-600 font-medium">Patrocínios confirmados</p>
          </div>

          <div className="text-center">
            <div className="mb-4">
              <p className="text-xs font-semibold text-gray-700 uppercase tracking-[0.15em] mb-3">Total Investido</p>
              <div className="h-px w-20 bg-gray-300 mx-auto mb-4"></div>
            </div>
            <p className="text-3xl font-extralight text-gray-900 mb-2 tracking-tight">
              {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(stats.totalInvestido)}
            </p>
            <p className="text-sm text-gray-600 font-medium">Em patrocínios</p>
          </div>

          <div className="text-center">
            <div className="mb-4">
              <p className="text-xs font-semibold text-gray-700 uppercase tracking-[0.15em] mb-3">Valor Médio Investido</p>
              <div className="h-px w-20 bg-gray-300 mx-auto mb-4"></div>
            </div>
            <p className="text-3xl font-extralight text-gray-900 mb-2 tracking-tight">
              {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(stats.valorMedioGeral)}
            </p>
            <p className="text-sm text-gray-600 font-medium">Por leilão</p>
          </div>
        </div>
      </div>

      {/* Card de Patrocinadores */}
      <Card className="border border-gray-200 shadow-sm h-[calc(100vh-320px)]">
        <CardHeader className="pb-4">
          <div className="space-y-4">
            <CardTitle className="flex items-center gap-3 text-xl font-semibold text-gray-800">
              <div className="p-2 bg-gray-100 rounded-lg">
                {showArchived ? <Archive className="h-5 w-5 text-gray-600" /> : <Handshake className="h-5 w-5 text-gray-600" />}
              </div>
              {showArchived ? "Patrocinadores Arquivados" : "Patrocinadores Cadastrados"}
            </CardTitle>

            <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="relative flex-1 min-w-0 max-w-md">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Buscar por patrocinador..."
                    value={searchInputValue}
                    onChange={(e) => setSearchInputValue(e.target.value)}
                    className="pl-10 h-11 border-gray-300 focus:border-gray-300 focus:ring-0 no-focus-outline w-full"
                  />
                </div>
              </div>

              <div className="flex gap-2 flex-shrink-0">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[140px] h-11 border-gray-300 bg-white focus:!ring-0 focus:!ring-offset-0 focus:!border-gray-300 focus:!outline-none focus:!shadow-none">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos ({stats.total})</SelectItem>
                    <SelectItem value="ativo">Ativos ({stats.ativos})</SelectItem>
                    <SelectItem value="inativo">Inativos (0)</SelectItem>
                  </SelectContent>
                </Select>

                <Button
                  variant="outline"
                  onClick={() => setShowArchived(!showArchived)}
                  className="h-11 px-4 border-gray-300 text-gray-700 hover:text-black hover:bg-gray-50"
                >
                  {showArchived ? "Ver Ativos" : `Ver Arquivados (${
                    (() => {
                      const patrocinadorMapArquivados = new Map();
                      auctions.filter(a => a.arquivado).forEach(auction => {
                        if (auction.detalhePatrocinios && auction.detalhePatrocinios.length > 0) {
                          auction.detalhePatrocinios.forEach(patrocinio => {
                            patrocinadorMapArquivados.set(patrocinio.nomePatrocinador.trim().toLowerCase(), true);
                          });
                        }
                      });
                      return patrocinadorMapArquivados.size;
                    })()
                  })`}
                </Button>

                <Button onClick={handleNovoPatrocinador} className="h-11 bg-black hover:bg-gray-800 text-white">
                  <Plus className="h-4 w-4 mr-2" />
                  Novo Patrocinador
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0 h-[calc(100%-120px)] overflow-y-auto">
          {isLoading ? (
            <div className="space-y-4">
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
          ) : filteredPatrocinadores.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-500 px-6">
              {showArchived ? <Archive className="h-12 w-12 mb-4 text-gray-300" /> : <Handshake className="h-12 w-12 mb-4 text-gray-300" />}
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {searchTerm && statusFilter !== "todos" 
                  ? `Nenhum patrocinador ${statusFilter} encontrado`
                  : searchTerm 
                    ? "Nenhum patrocinador encontrado"
                    : statusFilter !== "todos"
                      ? `Nenhum patrocinador ${statusFilter}`
                      : showArchived 
                        ? "Nenhum patrocinador arquivado"
                        : "Nenhum patrocinador cadastrado"}
              </h3>
              <p className="text-sm text-center text-gray-500 max-w-md">
                {searchTerm && statusFilter !== "todos"
                  ? `Nenhum patrocinador ${statusFilter} corresponde à busca "${searchTerm}".`
                  : searchTerm 
                    ? `Nenhum resultado para "${searchTerm}". Tente outro termo.`
                    : statusFilter !== "todos"
                      ? `Não há patrocinadores com status ${statusFilter} no momento.`
                      : showArchived 
                        ? "Não há patrocinadores arquivados no momento."
                        : "Comece cadastrando patrocínios nos leilões para vê-los aqui."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-50/50 border-gray-200">
                    <TableHead className="font-semibold text-gray-700">Patrocinador</TableHead>
                    <TableHead className="font-semibold text-gray-700">Total Investido</TableHead>
                    <TableHead className="font-semibold text-gray-700">Próximo Vencimento</TableHead>
                    <TableHead className="font-semibold text-gray-700">Status de Pagamento</TableHead>
                    <TableHead className="font-semibold text-gray-700 text-center">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPatrocinadores.map((patrocinador) => (
                    <TableRow key={patrocinador.id} className="border-gray-100 hover:bg-gray-50/50 transition-colors">
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0 border border-gray-200">
                            <Handshake className="h-5 w-5 text-gray-600" />
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900">{patrocinador.empresa}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm font-medium text-gray-900">
                          {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(patrocinador.totalInvestido)}
                        </span>
                      </TableCell>
                      <TableCell>
                        {patrocinador.proximoVencimento ? (
                          <div className="flex flex-col">
                            <span className="text-sm font-medium text-gray-900">{patrocinador.proximoVencimento}</span>
                            <span className="text-xs text-gray-500">
                              {(() => {
                                const vencimento = patrocinador.patrocinios
                                  .filter(p => !p.recebido && p.dataVencimentoDate)
                                  .sort((a, b) => a.dataVencimentoDate!.getTime() - b.dataVencimentoDate!.getTime())[0];
                                
                                if (!vencimento || !vencimento.dataVencimentoDate) return '';
                                
                                const now = new Date();
                                const diff = Math.ceil((vencimento.dataVencimentoDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                                
                                if (diff < 0) return `${Math.abs(diff)} dia(s) de atraso`;
                                if (diff === 0) return 'Vence hoje';
                                if (diff === 1) return 'Vence amanhã';
                                return `Vence em ${diff} dia(s)`;
                              })()}
                            </span>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-400">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {getStatusPagamentoBadge(patrocinador.statusPagamento)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-1">
                          {!patrocinador.recebido && !showArchived && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleConfirmReceipt(patrocinador)}
                              className="h-8 w-8 p-0 text-green-600 hover:text-green-700 hover:bg-green-50"
                              title="Confirmar recebimento"
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                          )}
                          {patrocinador.recebido && !showArchived && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleUnconfirmReceipt(patrocinador)}
                              className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                              title="Desmarcar recebimento"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setViewingPatrocinador(patrocinador)}
                            className="h-8 w-8 p-0 text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
                            title="Ver detalhes"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEditPatrocinador(patrocinador)}
                            className="h-8 w-8 p-0 text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
                            title="Editar"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
                            title={showArchived ? "Desarquivar" : "Arquivar"}
                          >
                            <Archive className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal de Visualização de Detalhes */}
      <Dialog open={!!viewingPatrocinador} onOpenChange={(open) => !open && setViewingPatrocinador(null)}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden p-0">
          {/* Header Fixo */}
          <div className="sticky top-0 bg-white z-50 px-6 py-4 border-b border-gray-200 shadow-sm">
            <DialogHeader>
              <DialogTitle className="text-xl font-semibold text-gray-900 pr-8">Detalhes do Patrocinador</DialogTitle>
              <DialogDescription>
                Visualize todas as informações detalhadas do patrocinador
              </DialogDescription>
            </DialogHeader>
            <button
              onClick={() => setViewingPatrocinador(null)}
              className="absolute top-4 right-4 p-2 hover:bg-gray-100 rounded-full transition-colors z-60 focus:!ring-0 focus:!ring-offset-0 focus:!border-gray-400 focus:!outline-none focus:!shadow-none"
              aria-label="Fechar"
            >
              <X className="h-5 w-5 text-gray-500" />
            </button>
          </div>
          
          {/* Conteúdo com Scroll */}
          <div className="overflow-y-auto max-h-[calc(90vh-80px)] scrollbar-thin scrollbar-track-gray-100 scrollbar-thumb-gray-300">
            {viewingPatrocinador && (
              <div className="p-6 space-y-6">
                {/* Informações Gerais */}
                <div className="bg-white border border-gray-200 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-gray-600" />
                    Informações Gerais
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Nome do Patrocinador</p>
                      <p className="text-base text-gray-900 mt-1">{viewingPatrocinador.empresa}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-600">Total Investido</p>
                      <p className="text-base text-gray-900 mt-1 font-semibold">
                        {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(viewingPatrocinador.totalInvestido)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-600">Valor Médio por Leilão</p>
                      <p className="text-base text-gray-900 mt-1">
                        {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(viewingPatrocinador.valorMedio)}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-600">Leilões Patrocinados</p>
                      <p className="text-base text-gray-900 mt-1">{viewingPatrocinador.leiloesPatrocinados}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-600">Status de Pagamento</p>
                      <div className="mt-1">
                        {getStatusPagamentoBadge(viewingPatrocinador.statusPagamento)}
                      </div>
                    </div>
                    {viewingPatrocinador.proximoVencimento && (
                      <div>
                        <p className="text-sm font-medium text-gray-600">Próximo Vencimento</p>
                        <p className="text-base text-gray-900 mt-1">{viewingPatrocinador.proximoVencimento}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Lista de Patrocínios por Leilão */}
                <div className="bg-white border border-gray-200 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <Gavel className="h-5 w-5 text-gray-600" />
                    Patrocínios por Leilão
                  </h3>
                  <div className="space-y-4">
                    {viewingPatrocinador.patrocinios.map((patrocinio, index) => (
                      <div key={index} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex-1">
                            <h4 className="text-base font-semibold text-gray-900">{patrocinio.leilaoNome}</h4>
                            {patrocinio.dataVencimento && (
                              <p className="text-sm text-gray-600 mt-1">
                                Vencimento: {patrocinio.dataVencimentoDate?.toLocaleDateString('pt-BR') || patrocinio.dataVencimento}
                              </p>
                            )}
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-semibold text-gray-900">
                              {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(patrocinio.valor)}
                            </p>
                            <div className="mt-1">
                              {getStatusRecebimentoBadge(patrocinio.recebido)}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 text-sm">
                          <div className="flex-1">
                            <p className="text-gray-600">Forma de Pagamento</p>
                            <p className="text-gray-900 font-medium mt-1">
                              {patrocinio.formaPagamento === 'a_vista' ? 'À Vista' : 
                               patrocinio.formaPagamento === 'parcelado' ? 'Parcelado' : 
                               patrocinio.formaPagamento === 'entrada_parcelamento' ? 'Entrada + Parcelamento' : 
                               'Não especificado'}
                            </p>
                          </div>
                          <div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => navigate('/leiloes', { 
                                state: { 
                                  editAuctionId: patrocinio.leilaoId,
                                  openTab: 'custos-patrocinios' 
                                } 
                              })}
                              className="h-8 text-xs border-gray-300 text-gray-700 hover:bg-gray-50 hover:text-gray-900 hover:border-gray-400"
                            >
                              <Eye className="h-3 w-3 mr-1" />
                              Ver no Leilão
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal de Confirmação de Pagamento - Igual ao de Arrematantes */}
      <Dialog open={isPaymentModalOpen} onOpenChange={setIsPaymentModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden">
          <DialogHeader className="pb-4">
            <DialogTitle className="text-lg font-medium text-gray-900">
              Confirmação de Pagamentos
            </DialogTitle>
            <DialogDescription className="text-sm text-gray-600">
              {selectedPatrocinadorForPayment && (
                <span>{selectedPatrocinadorForPayment.empresa} • {paymentStatus.filter(p => p.paid).length}/{paymentStatus.length} pagos</span>
              )}
            </DialogDescription>
          </DialogHeader>

          {selectedPatrocinadorForPayment && (
            <div className="space-y-4">
              {/* Lista de Leilões Minimalista */}
              <div className="space-y-1">
                <div className="max-h-72 overflow-y-auto">
                  {paymentStatus.map((status, index) => (
                    <div 
                      key={index} 
                      className={`flex items-center justify-between p-3 border-b border-gray-100 last:border-b-0 ${
                        status.paid ? 'bg-gray-50' : 'bg-white'
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <Checkbox
                          id={`leilao-${index}`}
                          checked={status.paid}
                          onCheckedChange={(checked) => handlePaymentToggle(index, checked as boolean)}
                        />
                        <div>
                          <Label 
                            htmlFor={`leilao-${index}`} 
                            className="text-sm font-medium text-gray-900 cursor-pointer"
                          >
                            {status.leilaoNome}
                          </Label>
                          {status.dueDate && (
                            <p className="text-xs text-gray-500">
                              Vence em {status.dueDate}
                            </p>
                          )}
                        </div>
                      </div>
                      
                      <div className="text-right">
                        <p className="text-sm font-medium text-gray-900">
                          R$ {status.valor.toLocaleString('pt-BR', { 
                            minimumFractionDigits: 2, 
                            maximumFractionDigits: 2 
                          })}
                        </p>
                        {status.paid && (
                          <p className={`text-xs ${
                            (() => {
                              // Verificar se pagamento foi feito com atraso
                              if (!status.dueDate) return 'text-green-600';
                              const today = new Date();
                              const dueDate = new Date(status.dueDate.split('/').reverse().join('-') + 'T23:59:59');
                              const isLate = today > dueDate;
                              return isLate ? 'text-red-600' : 'text-green-600';
                            })()
                          }`}>
                            {(() => {
                              // Verificar se pagamento foi feito com atraso
                              if (!status.dueDate) return 'Pago';
                              const today = new Date();
                              const dueDate = new Date(status.dueDate.split('/').reverse().join('-') + 'T23:59:59');
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
                  Total: R$ {paymentStatus.reduce((sum, s) => sum + s.valor, 0).toLocaleString('pt-BR', { 
                    minimumFractionDigits: 2, 
                    maximumFractionDigits: 2 
                  })}
                </div>
                
                <div className="flex gap-3">
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      setIsPaymentModalOpen(false);
                      setSelectedPatrocinadorForPayment(null);
                      setPaymentStatus([]);
                    }}
                    className="hover:bg-gray-100 hover:text-gray-800"
                  >
                    Cancelar
                  </Button>
                  <Button 
                    onClick={handleSavePayments}
                    className="bg-black text-white hover:bg-gray-800"
                  >
                    Confirmar Pagamentos
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Wizard de Seleção de Leilão em Tela Cheia */}
      {isSelectAuctionModalOpen && createPortal(
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
              onClick={() => setIsSelectAuctionModalOpen(false)}
              className="rounded-full w-12 h-12 bg-gray-100 hover:bg-gray-200 text-gray-700 hover:text-gray-700"
            >
              <X className="h-6 w-6" />
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
                      Selecione um Leilão
                    </h1>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setShowAllAuctions(!showAllAuctions);
                          if (!showAllAuctions) {
                            setAuctionSearchTerm(''); // Limpar busca ao mostrar todos
                          }
                        }}
                        onMouseEnter={() => setIsHoveringAuctionButton(true)}
                        onMouseLeave={() => setIsHoveringAuctionButton(false)}
                        className={`p-2.5 rounded-lg transition-all duration-200 ${
                          showAllAuctions 
                            ? 'bg-gray-900 text-white hover:bg-gray-800' 
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        <Gavel className="h-5 w-5" />
                      </button>
                      <span 
                        className={`text-sm font-medium whitespace-nowrap transition-all duration-200 ${
                          isHoveringAuctionButton 
                            ? 'opacity-100 translate-x-0' 
                            : 'opacity-0 -translate-x-2 pointer-events-none'
                        } ${showAllAuctions ? 'text-gray-900' : 'text-gray-600'}`}
                      >
                        {showAllAuctions ? 'Ocultar lista' : 'Mostrar todos leilões'}
                      </span>
                    </div>
                  </div>
                  <p className="text-lg text-gray-600 mt-4">
                    {showAllAuctions 
                      ? 'Navegue pela lista completa ou use a busca por nome para filtrar'
                      : 'Digite o nome do leilão para buscar ou clique no ícone para ver todos'
                    }
                  </p>
                </div>

                {/* Campo de Busca */}
                <div className="space-y-3">
                  <Label className="text-lg font-normal text-gray-600">
                    Nome do Leilão
                  </Label>
                  <Input
                    type="text"
                    placeholder="Buscar leilão por nome..."
                    value={auctionSearchTerm}
                    onChange={(e) => setAuctionSearchTerm(e.target.value)}
                    className="h-14 text-base border-0 border-b-2 border-gray-200 rounded-none focus-visible:border-gray-800 focus-visible:ring-0 focus-visible:outline-none px-0 bg-transparent placeholder:text-gray-400"
                  />
                  {auctionSearchTerm && filteredAuctions.length === 0 && (
                    <p className="text-sm text-amber-600 flex items-center gap-2">
                      <AlertCircle className="h-4 w-4" />
                      Nenhum leilão encontrado com este nome
                    </p>
                  )}
                </div>

                {/* Título da Lista - Só aparece quando há busca ou showAllAuctions */}
                {(auctionSearchTerm || showAllAuctions) && (
                  <div className="flex items-center justify-between">
                    <h2 className="text-2xl font-normal text-gray-900">
                      {isLoading ? (
                        <>
                          Carregando
                          <span className="inline-flex ml-1">
                            <span className="animate-bounce" style={{ animationDelay: '0ms', animationDuration: '1s' }}>.</span>
                            <span className="animate-bounce" style={{ animationDelay: '150ms', animationDuration: '1s' }}>.</span>
                            <span className="animate-bounce" style={{ animationDelay: '300ms', animationDuration: '1s' }}>.</span>
                          </span>
                        </>
                      ) : isTypingAuction ? (
                        <>
                          Buscando Leilão
                          <span className="inline-flex ml-1">
                            <span className="animate-bounce" style={{ animationDelay: '0ms', animationDuration: '1s' }}>.</span>
                            <span className="animate-bounce" style={{ animationDelay: '150ms', animationDuration: '1s' }}>.</span>
                            <span className="animate-bounce" style={{ animationDelay: '300ms', animationDuration: '1s' }}>.</span>
                          </span>
                        </>
                      ) : (
                        `Leilões ${auctionSearchTerm ? 'Encontrados' : 'Disponíveis'} ${filteredAuctions.length > 0 ? `(${filteredAuctions.length})` : ''}`
                      )}
                    </h2>
                  </div>
                )}

                {/* Lista de Leilões - Só aparece quando há busca ou showAllAuctions */}
                {(auctionSearchTerm || showAllAuctions) && (isLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="text-center">
                      <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-black border-r-transparent"></div>
                    </div>
                  </div>
                ) : filteredAuctions.length === 0 ? (
                  <div className="text-center py-12">
                    <Gavel className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                    <p className="text-gray-600">
                      {auctionSearchTerm ? 'Nenhum leilão encontrado' : 'Nenhum leilão disponível'}
                    </p>
                    {auctionSearchTerm && (
                      <p className="text-sm text-gray-500 mt-2">
                        Tente buscar com outros termos
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {filteredAuctions.map((auction) => {
                      const dataLeilao = auction.dataInicio 
                        ? new Date(auction.dataInicio).toLocaleDateString('pt-BR')
                        : 'Data não definida';
                      
                      const totalPatrocinios = auction.detalhePatrocinios?.length || 0;
                      const totalLotes = auction.lotes?.length || 0;

                      return (
                        <div
                          key={auction.id}
                          onClick={() => handleSelectAuction(auction.id)}
                          className="group p-5 border border-gray-200 rounded-xl cursor-pointer hover:border-gray-400 hover:shadow-sm transition-all duration-200 bg-white"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1 min-w-0">
                              <h3 className="text-lg font-medium text-gray-900 truncate group-hover:text-gray-950">
                                {auction.nome}
                              </h3>
                              <div className="mt-2 flex items-center gap-4 text-sm text-gray-500">
                                <span>
                                  {totalPatrocinios} {totalPatrocinios === 1 ? 'patrocinador' : 'patrocinadores'}
                                </span>
                                <span>•</span>
                                <span>
                                  {totalLotes} {totalLotes === 1 ? 'lote' : 'lotes'}
                                </span>
                                <span>•</span>
                                <span>{dataLeilao}</span>
                              </div>
                            </div>
                            <ChevronRight className="h-5 w-5 text-gray-300 group-hover:text-gray-600 flex-shrink-0 ml-4 transition-colors" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

