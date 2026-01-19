import { StatCard } from "@/components/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DollarSign,
  Gavel,
  Clock,
  AlertTriangle,
  TrendingUp,
  Calendar,
  Users,
  Package,
  ArrowRight,
  FileText,
  ChevronLeft,
  ChevronRight,
  Activity,
} from "lucide-react";
import { Invoice, ArrematanteInfo, Auction, LoteInfo } from "@/lib/types";
import { useAuth } from "@/hooks/use-auth";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useDashboardStats } from "@/hooks/use-dashboard-stats";
import { useSupabaseAuctions } from "@/hooks/use-supabase-auctions";
import { obterValorTotalArrematante, calcularEstruturaParcelas, calcularValorTotal, obterQuantidadeTotalParcelas, descreverEstruturaParcelas } from "@/lib/parcelamento-calculator";

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

// Função para converter string de moeda para número
const parseCurrencyToNumber = (currencyString: string): number => {
  if (!currencyString) return 0;
  // Remove R$, espaços, pontos (milhares) e converte vírgula para ponto decimal
  const cleanString = currencyString
    .replace(/[R$\s]/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  return parseFloat(cleanString) || 0;
};

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { auctions, isLoading } = useSupabaseAuctions();
  const { stats } = useDashboardStats();
  
  // Carrossel da agenda
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  
  const slides = [
    { id: 'leiloes', title: 'Próximos Leilões', icon: Calendar },
    { id: 'inadimplentes', title: 'Inadimplentes', icon: AlertTriangle },
    { id: 'arrematantes', title: 'Arrematantes', icon: Users },
  ];

  // Rotação automática
  useEffect(() => {
    if (isPaused) return;
    const interval = setInterval(() => {
      setIsTransitioning(true);
      setTimeout(() => {
        setCurrentSlide((prev) => (prev + 1) % slides.length);
        setTimeout(() => setIsTransitioning(false), 50);
      }, 300);
    }, 8000);
    return () => clearInterval(interval);
  }, [isPaused, slides.length]);

  const nextSlide = () => {
    setIsTransitioning(true);
    setTimeout(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length);
      setTimeout(() => setIsTransitioning(false), 50);
    }, 300);
  };
  
  const prevSlide = () => {
    setIsTransitioning(true);
    setTimeout(() => {
      setCurrentSlide((prev) => (prev - 1 + slides.length) % slides.length);
      setTimeout(() => setIsTransitioning(false), 50);
    }, 300);
  };

  // Filtrar apenas leilões não arquivados
  const activeAuctions = auctions.filter(auction => !auction.arquivado);

  // Função para verificar se um arrematante está inadimplente (considera tipos de pagamento por lote)
  const isOverdue = (arrematante: ArrematanteInfo, auction: Auction) => {
    if (arrematante.pago) return false;
    
    // Encontrar o lote arrematado para obter as configurações específicas de pagamento
    const loteArrematado = auction.lotes?.find((lote: LoteInfo) => lote.id === arrematante.loteId);
    if (!loteArrematado || !loteArrematado.tipoPagamento) return false;
    
    const tipoPagamento = loteArrematado.tipoPagamento;
    const now = new Date();
    
    switch (tipoPagamento) {
      case 'a_vista': {
        // CORREÇÃO: Evitar problema de fuso horário do JavaScript
        const dateStr = loteArrematado.dataVencimentoVista || new Date().toISOString().split('T')[0];
        const [year, month, day] = dateStr.split('-').map(Number);
        
        // Usar construtor Date(year, month, day) que ignora fuso horário
        const dueDate = new Date(year, month - 1, day); // month é zero-indexed
        dueDate.setHours(23, 59, 59, 999);
        return now > dueDate;
      }
      
      case 'entrada_parcelamento': {
        const parcelasPagas = arrematante.parcelasPagas || 0;
        const quantidadeParcelas = arrematante.quantidadeParcelas || 12;
        
        // Para entrada_parcelamento: entrada + parcelas
        // Se parcelasPagas >= (1 + quantidadeParcelas), está tudo pago
        if (parcelasPagas >= (1 + quantidadeParcelas)) return false;
        
        if (parcelasPagas === 0) {
          // Entrada não foi paga - verificar se está atrasada
          if (!loteArrematado.dataEntrada) return false;
          const entradaDueDate = new Date(loteArrematado.dataEntrada);
          entradaDueDate.setHours(23, 59, 59, 999);
          return now > entradaDueDate;
        } else {
          // Entrada foi paga - verificar se há parcelas atrasadas
          // PRIORIZAR dados do arrematante (mais específicos)
          const mesInicioPagamento = arrematante.mesInicioPagamento || loteArrematado.mesInicioPagamento;
          const diaVencimento = arrematante.diaVencimentoMensal || loteArrematado.diaVencimentoPadrao;
          
          if (!mesInicioPagamento || !diaVencimento) return false;
          
          let startYear, startMonth;
          
          // Verificar se mesInicioPagamento está no formato "YYYY-MM" ou só "MM"
          if (mesInicioPagamento.includes('-')) {
            const parts = mesInicioPagamento.split('-');
            if (parts.length !== 2) return false;
            [startYear, startMonth] = parts.map(Number);
          } else {
            // Se for só o mês, usar ano atual
            startYear = new Date().getFullYear();
            startMonth = Number(mesInicioPagamento);
          }
          
          // Verificar todas as parcelas que deveriam ter sido pagas até agora
          const parcelasEfetivasPagas = parcelasPagas - 1; // -1 porque a primeira "parcela paga" é a entrada
          
          for (let i = 0; i < quantidadeParcelas; i++) {
            const parcelaDate = new Date(startYear, startMonth - 1 + i, diaVencimento);
            parcelaDate.setHours(23, 59, 59, 999);
            
            if (now > parcelaDate && i >= parcelasEfetivasPagas) {
              return true; // Encontrou uma parcela em atraso
            }
          }
          
          return false; // Nenhuma parcela está atrasada
        }
      }
      
      case 'parcelamento':
      default: {
        // PRIORIZAR dados do arrematante (mais específicos)
        const mesInicioPagamento = arrematante.mesInicioPagamento || loteArrematado.mesInicioPagamento;
        const diaVencimento = arrematante.diaVencimentoMensal || loteArrematado.diaVencimentoPadrao;
        const quantidadeParcelas = arrematante.quantidadeParcelas || loteArrematado.parcelasPadrao || 12;
        
        if (!mesInicioPagamento || !diaVencimento) return false;
        
        let startYear, startMonth;
        
        // Verificar se mesInicioPagamento está no formato "YYYY-MM" ou só "MM" ou "YYYY-MM-DD"
        if (mesInicioPagamento.includes('-')) {
          const parts = mesInicioPagamento.split('-');
          if (parts.length < 2) return false;
          startYear = Number(parts[0]);
          startMonth = Number(parts[1]);
        } else {
          // Se for só o mês, usar ano atual
          startYear = new Date().getFullYear();
          startMonth = Number(mesInicioPagamento);
        }
        
        const parcelasPagas = arrematante.parcelasPagas || 0;
        
        if (parcelasPagas >= quantidadeParcelas) return false;
        
        const nextPaymentDate = new Date(startYear, startMonth - 1 + parcelasPagas, diaVencimento);
        nextPaymentDate.setHours(23, 59, 59, 999);
        return now > nextPaymentDate;
      }
    }
  };

  // Calcular total recebido localmente (valores parciais e totais) incluindo juros
  // Processar todos os arrematantes de todos os leilões
  const todosArrematantes = activeAuctions.flatMap(auction => {
    const arrematantes = auction.arrematantes || (auction.arrematante ? [auction.arrematante] : []);
    return arrematantes.map(arr => ({ auction, arrematante: arr }));
  });
  
  const localTotalRecebido = todosArrematantes
    .reduce((total, { auction, arrematante }) => {
      const parcelasPagas = arrematante?.parcelasPagas || 0;
      const now = new Date();
      
      // ⚠️ REMOVIDO: Não usar valorPagarNumerico direto quando pago === true
      // Sempre calcular parcela por parcela para considerar juros corretamente
      
      // Se parcialmente pago OU totalmente pago, calcular valor das parcelas pagas com juros
      if (parcelasPagas > 0) {
        const loteArrematado = auction.lotes?.find(lote => lote.id === arrematante.loteId);
        const tipoPagamento = loteArrematado?.tipoPagamento || auction.tipoPagamento;
        
        // NOVO: Usar função que considera fator multiplicador e comissão do leiloeiro
        const valorTotal = obterValorTotalArrematante({
          usaFatorMultiplicador: arrematante?.usaFatorMultiplicador,
          valorLance: arrematante?.valorLance,
          fatorMultiplicador: arrematante?.fatorMultiplicador || loteArrematado?.fatorMultiplicador,
          valorPagarNumerico: arrematante?.valorPagarNumerico || 0,
          percentualComissaoLeiloeiro: arrematante?.percentualComissaoLeiloeiro
        }, auction.percentualComissaoLeiloeiro);
        
        // Função helper para calcular juros progressivos
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
        
        if (tipoPagamento === 'entrada_parcelamento') {
          // Para entrada + parcelamento - usar estrutura real de parcelas
          const valorEntrada = arrematante?.valorEntrada ? 
            (typeof arrematante.valorEntrada === 'string' ? 
              parseFloat(arrematante.valorEntrada.replace(/[^\d,]/g, '').replace(',', '.')) : 
              arrematante.valorEntrada) : 
            valorTotal * 0.3;
          const quantidadeParcelas = arrematante?.quantidadeParcelas || 12;
          
          // Calcular estrutura real de parcelas (valorTotal já inclui comissão)
          const estruturaParcelas = calcularEstruturaParcelas(
            valorTotal,
            arrematante?.parcelasTriplas || 0,
            arrematante?.parcelasDuplas || 0,
            arrematante?.parcelasSimples || 0
          );
          
          let valorRecebido = 0;
          
          // Calcular valor recebido: entrada + parcelas pagas (com juros se atrasadas)
          if (parcelasPagas >= 1) {
            // Entrada foi paga - calcular com juros se estava atrasada
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
            const parcelasEfetivasPagas = Math.max(0, parcelasPagas - 1);
            if (parcelasEfetivasPagas > 0 && arrematante?.mesInicioPagamento && arrematante?.diaVencimentoMensal) {
              const [startYear, startMonth] = arrematante.mesInicioPagamento.split('-').map(Number);
              
              for (let i = 0; i < parcelasEfetivasPagas; i++) {
                const valorDaParcela = estruturaParcelas[i]?.valor || 0;
                const parcelaDate = new Date(startYear, startMonth - 1 + i, arrematante.diaVencimentoMensal, 23, 59, 59);
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
              for (let i = 0; i < parcelasEfetivasPagas; i++) {
                valorRecebido += estruturaParcelas[i]?.valor || 0;
              }
            }
            
            return total + valorRecebido;
          }
        } else if (tipoPagamento === 'parcelamento' || !tipoPagamento) {
          // Para parcelamento simples - calcular parcelas pagas com estrutura real (triplas, duplas, simples)
          const quantidadeParcelas = arrematante?.quantidadeParcelas || 1;
          
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
              const parcelaDate = new Date(startYear, startMonth - 1 + i, arrematante.diaVencimentoMensal, 23, 59, 59);
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
          
          return total + valorRecebido;
        } else if (tipoPagamento === 'a_vista') {
          // Para à vista, se parcelasPagas > 0, foi pago - calcular com juros se estava atrasado
          if (parcelasPagas > 0) {
            const dataVencimento = loteArrematado?.dataVencimentoVista || auction?.dataVencimentoVista;
            if (dataVencimento && arrematante?.percentualJurosAtraso) {
              const vencimento = new Date(dataVencimento + 'T23:59:59');
              if (now > vencimento) {
                const mesesAtraso = Math.max(0, Math.floor((now.getTime() - vencimento.getTime()) / (1000 * 60 * 60 * 24 * 30)));
                if (mesesAtraso >= 1) {
                  return total + calcularJurosProgressivos(valorTotal, arrematante.percentualJurosAtraso, mesesAtraso);
                }
              }
            }
            return total + valorTotal;
          }
        }
      }
      
      return total;
    }, 0);

  // Calcular total de patrocínios integralmente APENAS OS RECEBIDOS
  const totalPatrocinios = activeAuctions.reduce((total, auction) => {
    // Somar apenas patrocínios que foram confirmados como recebidos
    const patrociniosRecebidos = (auction.detalhePatrocinios || [])
      .filter(p => p.recebido === true)
      .reduce((sum, p) => sum + (p.valorNumerico || 0), 0);
    
    return total + patrociniosRecebidos;
  }, 0);

  // Calcular total de patrocínios PENDENTES (não recebidos)
  const totalPatrociniosPendentes = activeAuctions.reduce((total, auction) => {
    // Somar apenas patrocínios que NÃO foram confirmados como recebidos
    const patrociniosPendentes = (auction.detalhePatrocinios || [])
      .filter(p => p.recebido !== true)
      .reduce((sum, p) => sum + (p.valorNumerico || 0), 0);
    
    return total + patrociniosPendentes;
  }, 0);

  // Total recebido final = pagamentos dos arrematantes + patrocínios (integralmente)
  const totalRecebidoComSuperavit = localTotalRecebido + totalPatrocinios;

  // Calcular valor total da comissão do leiloeiro (a receber - não pagos)
  const totalComissaoAReceber = todosArrematantes
    .filter(({ arrematante }) => !arrematante.pago)
    .reduce((total, { auction, arrematante }) => {
      if (arrematante?.usaFatorMultiplicador && arrematante?.valorLance && arrematante?.fatorMultiplicador) {
        const loteArrematado = auction.lotes?.find(lote => lote.id === arrematante.loteId);
        const percentualComissao = arrematante?.percentualComissaoLeiloeiro ?? loteArrematado?.percentualComissaoLeiloeiro ?? auction.percentualComissaoLeiloeiro ?? 0;
        
        if (percentualComissao > 0) {
          const valorBase = arrematante.valorLance * arrematante.fatorMultiplicador;
          const valorComissao = valorBase * (percentualComissao / 100);
          return total + valorComissao;
        }
      }
      return total;
    }, 0);

  // Calcular valor total da comissão do leiloeiro (recebida - pagos)
  const totalComissaoRecebida = todosArrematantes
    .filter(({ arrematante }) => arrematante.pago || (arrematante.parcelasPagas && arrematante.parcelasPagas > 0))
    .reduce((total, { auction, arrematante }) => {
      if (arrematante?.usaFatorMultiplicador && arrematante?.valorLance && arrematante?.fatorMultiplicador) {
        const loteArrematado = auction.lotes?.find(lote => lote.id === arrematante.loteId);
        const percentualComissao = arrematante?.percentualComissaoLeiloeiro ?? loteArrematado?.percentualComissaoLeiloeiro ?? auction.percentualComissaoLeiloeiro ?? 0;
        
        if (percentualComissao > 0) {
          const valorBase = arrematante.valorLance * arrematante.fatorMultiplicador;
          const valorComissao = valorBase * (percentualComissao / 100);
          return total + valorComissao;
        }
      }
      return total;
    }, 0);

  // Calcular inadimplentes localmente com lógica correta
  const localOverdueCount = todosArrematantes
    .filter(({ auction, arrematante }) => isOverdue(arrematante, auction))
    .length;

  // Calcular leilões em andamento localmente (apenas não arquivados)
  // CORREÇÃO: Usar cálculo local para garantir que conte apenas leilões não arquivados
  const localActiveAuctionsCount = activeAuctions.filter(a => a.status === "em_andamento").length;

  // Calcular valores localmente para evitar duplicatas (incluindo juros de atraso)
  const localTotalAReceber = todosArrematantes
    .filter(({ arrematante }) => !arrematante.pago)
    .reduce((total, { auction, arrematante }) => {
      const loteArrematado = auction.lotes?.find(lote => lote.id === arrematante?.loteId);
      const tipoPagamento = loteArrematado?.tipoPagamento || auction.tipoPagamento || "parcelamento";
      
      // NOVO: Usar função que considera fator multiplicador e comissão do leiloeiro
      const valorTotal = obterValorTotalArrematante({
        usaFatorMultiplicador: arrematante?.usaFatorMultiplicador,
        valorLance: arrematante?.valorLance,
        fatorMultiplicador: arrematante?.fatorMultiplicador || loteArrematado?.fatorMultiplicador,
        valorPagarNumerico: arrematante?.valorPagarNumerico || 0,
        percentualComissaoLeiloeiro: arrematante?.percentualComissaoLeiloeiro
      }, auction.percentualComissaoLeiloeiro);
      
      const parcelasPagas = arrematante?.parcelasPagas || 0;
      const now = new Date();
      
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
      
      if (tipoPagamento === "a_vista") {
        // Para à vista, verificar se está atrasado e aplicar juros
        const dataVencimento = loteArrematado?.dataVencimentoVista || auction?.dataVencimentoVista;
        if (dataVencimento) {
          const vencimento = new Date(dataVencimento + 'T23:59:59');
          if (now > vencimento && arrematante?.percentualJurosAtraso) {
            const mesesAtraso = Math.max(0, Math.floor((now.getTime() - vencimento.getTime()) / (1000 * 60 * 60 * 24 * 30)));
            if (mesesAtraso >= 1) {
              return total + calcularJurosProgressivos(valorTotal, arrematante.percentualJurosAtraso, mesesAtraso);
            }
          }
        }
        return total + valorTotal;
      } else if (tipoPagamento === "entrada_parcelamento") {
        // Para entrada + parcelamento - usar estrutura real de parcelas
        const valorEntrada = arrematante?.valorEntrada ? 
          (typeof arrematante.valorEntrada === 'string' ? 
            parseFloat(arrematante.valorEntrada.replace(/[^\d.,]/g, '').replace(/\./g, '').replace(',', '.')) : 
            arrematante.valorEntrada) : 
          valorTotal * 0.3;
        const quantidadeParcelas = arrematante?.quantidadeParcelas || 12;
        
        // Calcular estrutura real de parcelas (valorTotal já inclui comissão)
        const estruturaParcelas = calcularEstruturaParcelas(
          valorTotal,
          arrematante?.parcelasTriplas || 0,
          arrematante?.parcelasDuplas || 0,
          arrematante?.parcelasSimples || 0
        );
        
        let valorAReceber = 0;
        
        // Verificar entrada se não foi paga
        if (parcelasPagas === 0) {
          if (loteArrematado?.dataEntrada) {
            const dataEntrada = new Date(loteArrematado.dataEntrada + 'T23:59:59');
            if (now > dataEntrada && arrematante?.percentualJurosAtraso) {
              const mesesAtraso = Math.max(0, Math.floor((now.getTime() - dataEntrada.getTime()) / (1000 * 60 * 60 * 24 * 30)));
              if (mesesAtraso >= 1) {
                valorAReceber += calcularJurosProgressivos(valorEntrada, arrematante.percentualJurosAtraso, mesesAtraso);
              } else {
                valorAReceber += valorEntrada;
              }
            } else {
              valorAReceber += valorEntrada;
            }
          } else {
            valorAReceber += valorEntrada;
          }
          
          // Calcular cada parcela mensal com estrutura real (juros se atrasada)
          if (arrematante?.mesInicioPagamento && arrematante?.diaVencimentoMensal) {
            const [startYear, startMonth] = arrematante.mesInicioPagamento.split('-').map(Number);
            
            for (let i = 0; i < quantidadeParcelas; i++) {
              const valorDaParcela = estruturaParcelas[i]?.valor || 0;
              const parcelaDate = new Date(startYear, startMonth - 1 + i, arrematante.diaVencimentoMensal, 23, 59, 59);
              if (now > parcelaDate && arrematante?.percentualJurosAtraso) {
                const mesesAtraso = Math.max(0, Math.floor((now.getTime() - parcelaDate.getTime()) / (1000 * 60 * 60 * 24 * 30)));
                if (mesesAtraso >= 1) {
                  valorAReceber += calcularJurosProgressivos(valorDaParcela, arrematante.percentualJurosAtraso, mesesAtraso);
                } else {
                  valorAReceber += valorDaParcela;
                }
              } else {
                valorAReceber += valorDaParcela;
              }
            }
          } else {
            // Sem data de vencimento mensal, somar todas as parcelas
            for (let i = 0; i < quantidadeParcelas; i++) {
              valorAReceber += estruturaParcelas[i]?.valor || 0;
            }
          }
        } else {
          // Entrada já paga, calcular parcelas restantes
          const parcelasEfetivasPagas = Math.max(0, parcelasPagas - 1);
          const parcelasRestantes = quantidadeParcelas - parcelasEfetivasPagas;
          
          // Verificar parcelas mensais com estrutura real (juros se atrasadas)
          if (arrematante?.mesInicioPagamento && arrematante?.diaVencimentoMensal) {
            const [startYear, startMonth] = arrematante.mesInicioPagamento.split('-').map(Number);
            
            for (let i = parcelasEfetivasPagas; i < quantidadeParcelas; i++) {
              const valorDaParcela = estruturaParcelas[i]?.valor || 0;
              const parcelaDate = new Date(startYear, startMonth - 1 + i, arrematante.diaVencimentoMensal, 23, 59, 59);
              if (now > parcelaDate && arrematante?.percentualJurosAtraso) {
                const mesesAtraso = Math.max(0, Math.floor((now.getTime() - parcelaDate.getTime()) / (1000 * 60 * 60 * 24 * 30)));
                if (mesesAtraso >= 1) {
                  valorAReceber += calcularJurosProgressivos(valorDaParcela, arrematante.percentualJurosAtraso, mesesAtraso);
                } else {
                  valorAReceber += valorDaParcela;
                }
              } else {
                valorAReceber += valorDaParcela;
              }
            }
          } else {
            // Sem data de vencimento mensal, somar parcelas restantes
            for (let i = parcelasEfetivasPagas; i < quantidadeParcelas; i++) {
              valorAReceber += estruturaParcelas[i]?.valor || 0;
            }
          }
        }
        
        return total + valorAReceber;
      } else {
        // Para parcelamento simples, calcular parcelas restantes com estrutura real (juros)
        const quantidadeParcelas = arrematante?.quantidadeParcelas || 1;
        const parcelasRestantes = quantidadeParcelas - parcelasPagas;
        
        // Calcular estrutura real de parcelas (valorTotal já inclui comissão)
        const estruturaParcelas = calcularEstruturaParcelas(
          valorTotal,
          arrematante?.parcelasTriplas || 0,
          arrematante?.parcelasDuplas || 0,
          arrematante?.parcelasSimples || 0
        );
        
        let valorAReceber = 0;
        
        if (arrematante?.mesInicioPagamento && arrematante?.diaVencimentoMensal) {
          const [startYear, startMonth] = arrematante.mesInicioPagamento.split('-').map(Number);
          
          for (let i = parcelasPagas; i < quantidadeParcelas; i++) {
            const valorDaParcela = estruturaParcelas[i]?.valor || 0;
            const parcelaDate = new Date(startYear, startMonth - 1 + i, arrematante.diaVencimentoMensal, 23, 59, 59);
            if (now > parcelaDate && arrematante?.percentualJurosAtraso) {
              const mesesAtraso = Math.max(0, Math.floor((now.getTime() - parcelaDate.getTime()) / (1000 * 60 * 60 * 24 * 30)));
              if (mesesAtraso >= 1) {
                valorAReceber += calcularJurosProgressivos(valorDaParcela, arrematante.percentualJurosAtraso, mesesAtraso);
              } else {
                valorAReceber += valorDaParcela;
              }
            } else {
              valorAReceber += valorDaParcela;
            }
          }
        } else {
          // Sem data de vencimento mensal, somar parcelas restantes
          for (let i = parcelasPagas; i < quantidadeParcelas; i++) {
            valorAReceber += estruturaParcelas[i]?.valor || 0;
          }
        }
        
        return total + valorAReceber;
      }
    }, 0);

  const localTotalArrematantes = todosArrematantes.length;

  // Usar cálculos locais para evitar duplicatas
  // ✅ Incluir patrocínios pendentes no total a receber
  const totalReceiverNumber = localTotalAReceber + totalPatrociniosPendentes;
  const auctionCostsNumber = stats?.total_custos || 0;
  const overdueCount = localOverdueCount;
  const totalRecebido = totalRecebidoComSuperavit;
  const activeAuctionsCount = localActiveAuctionsCount;
  const scheduledAuctionsCount = activeAuctions.filter(a => a.status === "agendado").length;
  const totalArrematantes = localTotalArrematantes;

  const todayString = new Date().toISOString().slice(0, 10);

  // Função para calcular próxima data de vencimento baseada nas configurações específicas do lote
  const calculateNextPaymentDate = (arrematante: ArrematanteInfo, auction: Auction) => {
    if (!arrematante || arrematante.pago) return null;
    
    const loteArrematado = auction.lotes?.find((lote: LoteInfo) => lote.id === arrematante.loteId);
    // ✅ PRIORIZAR tipoPagamento do arrematante (mais específico)
    const tipoPagamento = arrematante.tipoPagamento || loteArrematado?.tipoPagamento || 'parcelamento';
    
    switch (tipoPagamento) {
      case 'a_vista': {
        const dataVencimento = loteArrematado?.dataVencimentoVista;
        if (!dataVencimento) return null;
        
        // CORREÇÃO: Evitar problema de fuso horário do JavaScript
        const dateStr = dataVencimento || new Date().toISOString().split('T')[0];
        const parts = dateStr.split('-');
        if (parts.length !== 3) return null;
        
        const [year, month, day] = parts.map(Number);
        if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
        
        // Usar construtor Date(year, month, day) que ignora fuso horário
        return new Date(year, month - 1, day); // month é zero-indexed
      }
      
      case 'entrada_parcelamento': {
        const parcelasPagas = arrematante.parcelasPagas || 0;
        const quantidadeParcelas = arrematante.quantidadeParcelas || (loteArrematado?.parcelasPadrao || 1) + 1;
        
        if (parcelasPagas >= quantidadeParcelas) return null;
        
        if (parcelasPagas === 0) {
          // ✅ Comparar data da entrada com data da primeira parcela e retornar a mais próxima
          const dataEntradaStr = arrematante.dataEntrada || loteArrematado?.dataEntrada;
          const mesInicioPagamento = arrematante.mesInicioPagamento || loteArrematado?.mesInicioPagamento;
          const diaVencimentoPadrao = arrematante.diaVencimentoMensal || loteArrematado?.diaVencimentoPadrao;
          
          let dataEntrada: Date | null = null;
          let dataPrimeiraParcela: Date | null = null;
          
          // Calcular data da entrada
          if (dataEntradaStr) {
            const parts = dataEntradaStr.split('-');
            if (parts.length === 3) {
          const [year, month, day] = parts.map(Number);
              if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
                dataEntrada = new Date(year, month - 1, day);
              }
            }
          }
          
          // Calcular data da primeira parcela
          if (mesInicioPagamento && diaVencimentoPadrao) {
            let startYear, startMonth;
            if (mesInicioPagamento.includes('-')) {
              const parts = mesInicioPagamento.split('-');
              // ✅ Aceitar tanto "YYYY-MM" quanto "YYYY-MM-DD"
              if (parts.length >= 2) {
                startYear = Number(parts[0]);
                startMonth = Number(parts[1]);
              }
            } else {
              startYear = new Date().getFullYear();
              startMonth = Number(mesInicioPagamento);
            }
            
            const day = Number(diaVencimentoPadrao);
            if (startYear && startMonth && !isNaN(day)) {
              dataPrimeiraParcela = new Date(startYear, startMonth - 1, day);
            }
          }
          
          // Retornar a data mais próxima
          if (dataEntrada && dataPrimeiraParcela) {
            // Ambas definidas: retornar a mais próxima
            return dataEntrada < dataPrimeiraParcela ? dataEntrada : dataPrimeiraParcela;
          } else if (dataEntrada) {
            return dataEntrada;
          } else if (dataPrimeiraParcela) {
            return dataPrimeiraParcela;
          } else {
            return null;
          }
        } else {
          // Próximo pagamento é uma parcela após entrada
          // Priorizar dados do arrematante (mais confiáveis)
          const mesInicioPagamento = arrematante.mesInicioPagamento || loteArrematado?.mesInicioPagamento;
          const diaVencimentoPadrao = arrematante.diaVencimentoMensal || loteArrematado?.diaVencimentoPadrao;
          
          if (!mesInicioPagamento || !diaVencimentoPadrao) return null;
          
          let startYear, startMonth;
          
          // ✅ Aceitar tanto "YYYY-MM" quanto "YYYY-MM-DD"
          if (mesInicioPagamento.includes('-')) {
            const parts = mesInicioPagamento.split('-');
            if (parts.length < 2) return null;
            startYear = Number(parts[0]);
            startMonth = Number(parts[1]);
          } else {
            // Se for só o mês, usar ano atual
            startYear = new Date().getFullYear();
            startMonth = Number(mesInicioPagamento);
          }
          
          const day = Number(diaVencimentoPadrao);
          
          if (isNaN(startYear) || isNaN(startMonth) || isNaN(day)) return null;
          
          return new Date(startYear, startMonth - 1 + (parcelasPagas - 1), day);
        }
      }
      
      case 'parcelamento':
      default: {
        // Priorizar dados do arrematante (mais confiáveis)
        const mesInicioPagamento = arrematante.mesInicioPagamento || loteArrematado?.mesInicioPagamento;
        const diaVencimentoPadrao = arrematante.diaVencimentoMensal || loteArrematado?.diaVencimentoPadrao;
        
        if (!mesInicioPagamento || !diaVencimentoPadrao) {
          return null;
        }
        
        const parcelasPagas = arrematante.parcelasPagas || 0;
        const quantidadeParcelas = arrematante.quantidadeParcelas || loteArrematado?.parcelasPadrao || 1;
        
        if (parcelasPagas >= quantidadeParcelas) return null;
        
        let startYear, startMonth;
        
        // Verificar formato do mesInicioPagamento
        // Pode ser "YYYY-MM", "YYYY-MM-DD" ou só "MM"
        if (mesInicioPagamento.includes('-')) {
          const parts = mesInicioPagamento.split('-');
          if (parts.length >= 2) {
            startYear = Number(parts[0]);
            startMonth = Number(parts[1]);
          } else {
            return null;
          }
        } else {
          // Se for só o mês, usar ano atual
          startYear = new Date().getFullYear();
          startMonth = Number(mesInicioPagamento);
        }
        
        const day = Number(diaVencimentoPadrao);
        
        if (isNaN(startYear) || isNaN(startMonth) || isNaN(day)) {
          return null;
        }
        
        const dataVencimento = new Date(startYear, startMonth - 1 + parcelasPagas, day);
        
        return dataVencimento;
      }
    }
  };

  const getProximaDataVencimento = (arrematante: ArrematanteInfo, auction: Auction) => {
    const nextDate = calculateNextPaymentDate(arrematante, auction);
    if (!nextDate || isNaN(nextDate.getTime())) {
      return "—";
    }
    return nextDate.toLocaleDateString('pt-BR');
  };
  
  // Função auxiliar para identificar se o próximo vencimento é entrada ou parcela
  const getTipoProximoVencimento = (arrematante: ArrematanteInfo, auction: Auction) => {
    const parcelasPagas = arrematante.parcelasPagas || 0;
    if (parcelasPagas > 0) return null; // Já passou da entrada
    
    const loteArrematado = auction.lotes?.find((lote: LoteInfo) => lote.id === arrematante.loteId);
    const tipoPagamento = arrematante.tipoPagamento || loteArrematado?.tipoPagamento;
    
    if (tipoPagamento !== 'entrada_parcelamento') return null;
    
    // Comparar datas
    const dataEntradaStr = arrematante.dataEntrada || loteArrematado?.dataEntrada;
    const mesInicioPagamento = arrematante.mesInicioPagamento || loteArrematado?.mesInicioPagamento;
    const diaVencimentoPadrao = arrematante.diaVencimentoMensal || loteArrematado?.diaVencimentoPadrao;
    
    let dataEntrada: Date | null = null;
    let dataPrimeiraParcela: Date | null = null;
    
    if (dataEntradaStr) {
      const parts = dataEntradaStr.split('-');
      if (parts.length === 3) {
        const [year, month, day] = parts.map(Number);
        if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
          dataEntrada = new Date(year, month - 1, day);
        }
      }
    }
    
    if (mesInicioPagamento && diaVencimentoPadrao) {
      let startYear, startMonth;
      if (mesInicioPagamento.includes('-')) {
        const parts = mesInicioPagamento.split('-');
        // ✅ Aceitar tanto "YYYY-MM" quanto "YYYY-MM-DD"
        if (parts.length >= 2) {
          startYear = Number(parts[0]);
          startMonth = Number(parts[1]);
        }
      } else {
        startYear = new Date().getFullYear();
        startMonth = Number(mesInicioPagamento);
      }
      
      const day = Number(diaVencimentoPadrao);
      if (startYear && startMonth && !isNaN(day)) {
        dataPrimeiraParcela = new Date(startYear, startMonth - 1, day);
      }
    }
    
    if (dataEntrada && dataPrimeiraParcela) {
      return dataEntrada <= dataPrimeiraParcela ? 'entrada' : 'parcela';
    } else if (dataEntrada) {
      return 'entrada';
    } else if (dataPrimeiraParcela) {
      return 'parcela';
    }
    
    return null;
  };

  const nextAuctions = activeAuctions
    .filter((a) => a.dataInicio >= todayString || a.status === "em_andamento")
    .slice(0, 6);

  // Criar faturas fictícias a partir dos leilões com arrematantes para demonstração
  const recentInvoices: Array<{ 
    id: string; 
    bidder: string; 
    amount: string; 
    dueDate: string; 
    status: Invoice["status"];
    parcelas: string;
    leilao: string;
  }> = activeAuctions
    .flatMap((auction) => {
      // Obter todos os arrematantes (compatibilidade com estrutura antiga e nova)
      const arrematantes = auction.arrematantes || (auction.arrematante ? [auction.arrematante] : []);
      
      return arrematantes.map((arrematante) => {
      // Calcular valor por parcela baseado no tipo de pagamento específico do lote
      const loteArrematado = auction.lotes?.find((lote: LoteInfo) => lote.id === arrematante?.loteId);
      
      let valorPorParcela = 0;
      if (arrematante) {
        // ✅ Usar função que considera fator multiplicador e comissão do leiloeiro
        const valorTotal = obterValorTotalArrematante({
          usaFatorMultiplicador: arrematante?.usaFatorMultiplicador,
          valorLance: arrematante?.valorLance,
          fatorMultiplicador: arrematante?.fatorMultiplicador,
          valorPagarNumerico: arrematante?.valorPagarNumerico || 0,
          percentualComissaoLeiloeiro: arrematante?.percentualComissaoLeiloeiro
        }, auction.percentualComissaoLeiloeiro);
        
        // Se não tiver lote ou tipo de pagamento, assumir parcelamento simples
        const tipoPagamento = loteArrematado?.tipoPagamento || 'parcelamento';
        
        if (valorTotal > 0) {
        switch (tipoPagamento) {
          case 'a_vista':
            valorPorParcela = valorTotal;
            break;
          case 'entrada_parcelamento': {
            const parcelasPagas = arrematante.parcelasPagas || 0;
            const quantidadeParcelas = arrematante.quantidadeParcelas || (loteArrematado?.parcelasPadrao || 1) + 1;
            
            // ✅ Usar função parseCurrencyToNumber que é mais robusta
            const valorEntrada = arrematante.valorEntrada 
              ? parseCurrencyToNumber(arrematante.valorEntrada)
              : valorTotal * 0.3;
            
            if (parcelasPagas === 0) {
              // Valor da entrada
              valorPorParcela = valorEntrada;
            } else {
              // ✅ Calcular valor por parcela considerando sistema de parcelas triplas/duplas/simples
              const temEstruturaParcelas = arrematante?.usaFatorMultiplicador && 
                (arrematante?.parcelasTriplas != null || 
                 arrematante?.parcelasDuplas != null || 
                 arrematante?.parcelasSimples != null);
              
              if (temEstruturaParcelas) {
                // Sistema novo: calcular baseado na estrutura de parcelas
                const triplas = arrematante?.parcelasTriplas || 0;
                const duplas = arrematante?.parcelasDuplas || 0;
                const simples = arrematante?.parcelasSimples || 0;
                
                const estrutura = calcularEstruturaParcelas(valorTotal, triplas, duplas, simples);
                
                // Determinar qual parcela mostrar (baseado em parcelasPagas)
                const parcelaAtualIndex = Math.max(0, parcelasPagas - 1); // -1 porque entrada é a "parcela 1"
                valorPorParcela = estrutura[parcelaAtualIndex]?.valor || estrutura[0]?.valor || (valorTotal / quantidadeParcelas);
              } else {
                // Sistema antigo: divisão simples
              valorPorParcela = valorTotal / quantidadeParcelas;
              }
            }
            break;
          }
          case 'parcelamento':
          default: {
            const qtdParcelas = arrematante.quantidadeParcelas || loteArrematado?.parcelasPadrao || 1;
            
            // ✅ Calcular valor por parcela considerando sistema de parcelas triplas/duplas/simples
            const temEstruturaParcelas = arrematante?.usaFatorMultiplicador && 
              (arrematante?.parcelasTriplas != null || 
               arrematante?.parcelasDuplas != null || 
               arrematante?.parcelasSimples != null);
            
            if (temEstruturaParcelas) {
              // Sistema novo: calcular baseado na estrutura de parcelas
              const triplas = arrematante?.parcelasTriplas || 0;
              const duplas = arrematante?.parcelasDuplas || 0;
              const simples = arrematante?.parcelasSimples || 0;
              
              const estrutura = calcularEstruturaParcelas(valorTotal, triplas, duplas, simples);
              
              // Determinar qual parcela mostrar (baseado em parcelasPagas)
              const parcelasPagas = arrematante?.parcelasPagas || 0;
              const parcelaAtualIndex = Math.max(0, parcelasPagas); // Próxima parcela a vencer
              valorPorParcela = estrutura[parcelaAtualIndex]?.valor || estrutura[0]?.valor || (valorTotal / qtdParcelas);
            } else {
              // Sistema antigo: divisão simples
            valorPorParcela = valorTotal / qtdParcelas;
            }
            break;
          }
        }
        }
      }
      
      // Determinar status correto baseado no pagamento e atraso
      let status: Invoice["status"] = "em_aberto";
        if (arrematante?.pago) {
        status = "pago";
        } else if (isOverdue(arrematante, auction)) {
        status = "atrasado";
      }
      
      return {
          id: `invoice-${auction.id}-${arrematante.id || arrematante.nome}`,
          bidder: arrematante?.nome || "—",
        amount: currency.format(valorPorParcela),
          dueDate: getProximaDataVencimento(arrematante, auction),
        status,
        parcelas: (() => {
          if (!loteArrematado || !loteArrematado.tipoPagamento) {
              return `${arrematante?.parcelasPagas || 0}/${arrematante?.quantidadeParcelas || 1}`;
          }
          
            const parcelasPagas = arrematante?.parcelasPagas || 0;
          
          switch (loteArrematado.tipoPagamento) {
            case 'a_vista':
              return parcelasPagas > 0 ? "1/1" : "0/1"; // À vista é sempre 1 parcela total
            case 'entrada_parcelamento': {
              const quantidadeTotal = arrematante?.quantidadeParcelas || (loteArrematado.parcelasPadrao || 1) + 1; // +1 para entrada
              return `${parcelasPagas}/${quantidadeTotal}`;
            }
            case 'parcelamento':
            default:
              return `${parcelasPagas}/${arrematante?.quantidadeParcelas || loteArrematado.parcelasPadrao || 1}`;
          }
        })(),
        leilao: auction.nome
      };
    });
    })
    .slice(0, 6);

  // Dados para carrossel - arrematantes em atraso (usando lógica atualizada)
  const overdueAuctions = activeAuctions.flatMap(auction => {
    const arrematantes = auction.arrematantes || (auction.arrematante ? [auction.arrematante] : []);
    return arrematantes
      .filter(arr => isOverdue(arr, auction))
      .map(arr => ({ ...auction, arrematante: arr }));
  });
  const overdueArrematantes = overdueAuctions.slice(0, 6);
  const recentArrematantes = activeAuctions
    .flatMap(auction => {
      const arrematantes = auction.arrematantes || (auction.arrematante ? [auction.arrematante] : []);
      return arrematantes.map(arr => ({ ...auction, arrematante: arr }));
    })
    .slice(0, 6);
  

  const getStatusBadge = (status: string) => {
    const statusMap = {
      agendado: { label: "Agendado", variant: "secondary" as const },
      em_andamento: { label: "Em Andamento", variant: "default" as const },
      finalizado: { label: "Finalizado", variant: "outline" as const },
      em_aberto: { label: "Em Aberto", variant: "warning" as const },
      pago: { label: "Pago", variant: "success" as const },
      atrasado: { label: "Atrasado", variant: "destructive" as const },
    };
    
    return statusMap[status as keyof typeof statusMap] || { label: status, variant: "secondary" as const };
  };

  // Horário de Brasília sincronizado
  const brasiliaDate = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  const currentHour = brasiliaDate.getHours();
  const greeting = currentHour < 12 ? "Bom dia" : currentHour < 18 ? "Boa tarde" : "Boa noite";

  if (isLoading) {
    return (
      <div className="space-y-8">
        {/* Header - mantém visível durante carregamento */}
        <div className="pt-4 flex items-end justify-between">
          <div>
            <h1 className="text-4xl font-semibold tracking-tight text-foreground mb-2">
              {greeting}, {user?.full_name || user?.name || "Usuário"}!
            </h1>
            <p className="text-lg text-muted-foreground">Carregando resumo dos leilões...</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">Data atual</p>
            <p className="text-lg font-medium text-foreground">
              {brasiliaDate.toLocaleDateString("pt-BR", {
                weekday: "long",
                year: "numeric", 
                month: "long",
                day: "numeric"
              })}
            </p>
          </div>
        </div>

        {/* Layout Principal com Skeleton Loaders Premium */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Conteúdo Principal - 2 colunas */}
          <div className="lg:col-span-2 space-y-6">
            {/* Resumo Geral Skeleton */}
            <Card className="overflow-hidden">
              <CardHeader>
                <CardTitle className="flex items-center gap-3 text-xl">
                  <TrendingUp className="h-6 w-6 text-muted-foreground/70" />
                  <div className="h-6 bg-gradient-to-r from-muted via-muted/80 to-muted rounded-md w-32 animate-pulse"></div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {/* Primeira linha de estatísticas */}
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                  {[...Array(4)].map((_, i) => (
                    <div key={`stat-${i}`} className="text-center px-2 space-y-3">
                      <div className="h-3.5 bg-gradient-to-r from-muted via-muted/70 to-muted rounded-full mb-3 mx-auto w-24 animate-pulse" style={{ animationDelay: `${i * 100}ms` }}></div>
                      <div className="h-px w-16 bg-gradient-to-r from-transparent via-muted to-transparent mx-auto mb-4"></div>
                      <div className="h-9 bg-gradient-to-r from-muted/90 via-muted/70 to-muted/90 rounded-lg animate-pulse" style={{ animationDelay: `${i * 150}ms` }}></div>
                      <div className="h-3 bg-gradient-to-r from-muted/60 via-muted/40 to-muted/60 rounded-full w-20 mx-auto animate-pulse" style={{ animationDelay: `${i * 200}ms` }}></div>
                    </div>
                  ))}
                </div>

                {/* Separador */}
                <div className="mt-8 pt-6 border-t border-border/50">
                  <div className="flex items-center gap-2 mb-5">
                    <Package className="h-5 w-5 text-muted-foreground/70" />
                    <div className="h-5 bg-gradient-to-r from-muted via-muted/80 to-muted rounded-md w-36 animate-pulse"></div>
                  </div>
                  
                  {/* Segunda linha de estatísticas */}
                  <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                    {[...Array(4)].map((_, i) => (
                      <div key={`stat2-${i}`} className="text-center px-2 space-y-3">
                        <div className="h-3.5 bg-gradient-to-r from-muted via-muted/70 to-muted rounded-full mb-3 mx-auto w-20 animate-pulse" style={{ animationDelay: `${i * 100}ms` }}></div>
                        <div className="h-px w-16 bg-gradient-to-r from-transparent via-muted to-transparent mx-auto mb-4"></div>
                        <div className="h-9 bg-gradient-to-r from-muted/90 via-muted/70 to-muted/90 rounded-lg animate-pulse" style={{ animationDelay: `${i * 150}ms` }}></div>
                        <div className="h-3 bg-gradient-to-r from-muted/60 via-muted/40 to-muted/60 rounded-full w-24 mx-auto animate-pulse" style={{ animationDelay: `${i * 200}ms` }}></div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
            
            {/* Faturas Recentes Skeleton */}
            <Card className="flex-1 flex flex-col overflow-hidden">
              <CardHeader className="flex-shrink-0">
                <CardTitle className="flex items-center justify-between">
                  <div className="flex items-center gap-3 text-xl">
                    <FileText className="h-6 w-6 text-muted-foreground/70" />
                    <div className="h-6 bg-gradient-to-r from-muted via-muted/80 to-muted rounded-md w-36 animate-pulse"></div>
                  </div>
                  <div className="h-8 w-8 bg-gradient-to-br from-muted to-muted/70 rounded-md animate-pulse"></div>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col">
                <div className="flex-1 space-y-3 overflow-hidden">
                  {[...Array(6)].map((_, i) => (
                    <div key={`invoice-${i}`} className="flex items-start justify-between p-4 rounded-lg bg-muted/20 border border-border/30 animate-pulse" style={{ animationDelay: `${i * 50}ms` }}>
                      <div className="flex-1 space-y-2.5">
                        <div className="h-4 bg-gradient-to-r from-muted via-muted/70 to-muted rounded-md w-44 animate-pulse"></div>
                        <div className="h-3.5 bg-gradient-to-r from-muted/70 via-muted/50 to-muted/70 rounded-md w-56 animate-pulse"></div>
                        <div className="h-3 bg-gradient-to-r from-muted/50 via-muted/30 to-muted/50 rounded-md w-36 animate-pulse"></div>
                        <div className="h-3 bg-gradient-to-r from-muted/50 via-muted/30 to-muted/50 rounded-md w-28 animate-pulse"></div>
                      </div>
                      <div className="h-6 w-20 bg-gradient-to-r from-muted via-muted/80 to-muted rounded-full ml-3 animate-pulse"></div>
                    </div>
                  ))}
                </div>
                <div className="flex-shrink-0 pt-4 border-t border-border/30 mt-4">
                  <div className="h-11 bg-gradient-to-r from-muted/80 via-muted/60 to-muted/80 rounded-lg w-full animate-pulse"></div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Carrossel Skeleton - Lado direito */}
          <Card className="lg:row-span-3 h-[calc(100vh-150px)] flex flex-col overflow-hidden">
            <CardHeader className="flex-shrink-0">
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-3 text-xl">
                  <Calendar className="h-6 w-6 text-muted-foreground/70" />
                  <div className="h-6 bg-gradient-to-r from-muted via-muted/80 to-muted rounded-md w-36 animate-pulse"></div>
                </div>
                <div className="h-8 w-8 bg-gradient-to-br from-muted to-muted/70 rounded-md animate-pulse"></div>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col">
              <div className="flex-1 space-y-3.5 overflow-hidden">
                {[...Array(5)].map((_, i) => (
                  <div key={`carousel-${i}`} className="p-4 rounded-lg bg-muted/20 border border-border/30 animate-pulse" style={{ animationDelay: `${i * 80}ms` }}>
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 space-y-2.5">
                        <div className="h-4 bg-gradient-to-r from-muted via-muted/70 to-muted rounded-md w-36 animate-pulse"></div>
                        <div className="h-3.5 bg-gradient-to-r from-muted/70 via-muted/50 to-muted/70 rounded-md w-28 animate-pulse"></div>
                      </div>
                      <div className="h-6 w-20 bg-gradient-to-r from-muted via-muted/80 to-muted rounded-full ml-3 animate-pulse"></div>
                    </div>
                    <div className="h-3 bg-gradient-to-r from-muted/50 via-muted/30 to-muted/50 rounded-md w-full animate-pulse"></div>
                  </div>
                ))}
              </div>
              <div className="flex-shrink-0 pt-6 border-t border-border/30 mt-4">
                <div className="h-11 bg-gradient-to-r from-muted/80 via-muted/60 to-muted/80 rounded-lg w-full animate-pulse"></div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
          <div className="space-y-8">
        <div className="pt-4 flex items-end justify-between">
          <div>
            <h1 className="text-4xl font-semibold tracking-tight text-foreground mb-2">
              {greeting}, {user?.full_name || user?.name || "Usuário"}!
            </h1>
            <p className="text-lg text-muted-foreground">Aqui está o resumo dos leilões</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-muted-foreground">Data atual</p>
            <p className="text-lg font-medium text-foreground">
              {brasiliaDate.toLocaleDateString("pt-BR", {
                weekday: "long",
                year: "numeric", 
                month: "long",
                day: "numeric"
              })}
            </p>
          </div>
        </div>

      {/* Layout Principal: Conteúdo à esquerda, Agenda à direita */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Conteúdo Principal - 2 colunas */}
        <div className="lg:col-span-2 lg:min-h-[calc(100vh-150px)] flex flex-col space-y-6">
          {/* Resumo Geral - Layout Limpo */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-3 text-xl">
                <TrendingUp className="h-6 w-6" />
                Resumo Geral
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                <div className="text-center px-2">
                  <p className="text-xs font-semibold text-gray-700 uppercase tracking-[0.15em] mb-3 flex items-center justify-center gap-2">
                    <DollarSign className="h-4 w-4" />
                    Total a Receber
                  </p>
                  <div className="h-px w-20 bg-gray-300 mx-auto mb-4"></div>
                  <p className="text-[2.125rem] font-extralight text-gray-900 mb-2 tracking-tight">{currency.format(totalReceiverNumber)}</p>
                  {(() => {
                    // Verificar se há leilões com comissão do leiloeiro
                    const leiloesComComissao = activeAuctions.filter(a => 
                      (a.percentualComissaoLeiloeiro && a.percentualComissaoLeiloeiro > 0) ||
                      (a.arrematantes?.some(arr => arr.percentualComissaoLeiloeiro && arr.percentualComissaoLeiloeiro > 0))
                    );
                    
                    const temPatrociniosPendentes = totalPatrociniosPendentes > 0;
                    const temComissao = totalComissaoAReceber > 0;
                    
                    // Se tem ambos (patrocínios pendentes + comissão), combinar em um único texto
                    if (temPatrociniosPendentes && temComissao) {
                      return (
                        <p className="text-xs text-gray-500 mt-2">
                          Inclui {currency.format(totalPatrociniosPendentes)} de patrocínios e {currency.format(totalComissaoAReceber)} de comissão do leiloeiro
                        </p>
                      );
                    }
                    
                    // Se tem apenas comissão (sem patrocínios pendentes)
                    if (temComissao) {
                      return (
                        <p className="text-xs text-gray-500 mt-2">
                          Inclui {currency.format(totalComissaoAReceber)} de comissão do leiloeiro
                        </p>
                      );
                    }
                    
                    // Se tem apenas patrocínios pendentes (sem comissão)
                    if (temPatrociniosPendentes) {
                      return (
                        <p className="text-xs text-gray-500 mt-2">
                          Inclui {currency.format(totalPatrociniosPendentes)} de patrocínios
                        </p>
                      );
                    }
                    
                    return null;
                  })()}
                </div>

                <div className="text-center px-2">
                  <p className="text-xs font-semibold text-gray-700 uppercase tracking-[0.15em] mb-3 flex items-center justify-center gap-2">
                    <Users className="h-4 w-4" />
                    Arrematantes
                  </p>
                  <div className="h-px w-20 bg-gray-300 mx-auto mb-4"></div>
                  <p className="text-[2.125rem] font-extralight text-gray-900 mb-2 tracking-tight">{totalArrematantes}</p>
                </div>

                <div className="text-center px-2">
                  <p className="text-xs font-semibold text-red-600 uppercase tracking-[0.15em] mb-3 flex items-center justify-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    Inadimplentes
                  </p>
                  <div className="h-px w-20 bg-red-300 mx-auto mb-4"></div>
                  <p className="text-[2.125rem] font-extralight text-red-600 mb-2 tracking-tight">{overdueCount}</p>
                </div>

                <div className="text-center px-2">
                  <p className="text-xs font-semibold text-gray-700 uppercase tracking-[0.15em] mb-3 flex items-center justify-center gap-2">
                    <DollarSign className="h-4 w-4" />
                    Total Recebido
                  </p>
                  <div className="h-px w-20 bg-gray-300 mx-auto mb-4"></div>
                  <p className="text-[2.125rem] font-extralight text-gray-900 mb-2 tracking-tight">{currency.format(totalRecebido)}</p>
                  {(() => {
                    // Verificar se há leilões com comissão do leiloeiro
                    const leiloesComComissao = activeAuctions.filter(a => 
                      (a.percentualComissaoLeiloeiro && a.percentualComissaoLeiloeiro > 0) ||
                      (a.arrematantes?.some(arr => arr.percentualComissaoLeiloeiro && arr.percentualComissaoLeiloeiro > 0))
                    );
                    
                    const temPatrocinios = totalPatrocinios > 0;
                    const temComissao = totalComissaoRecebida > 0;
                    
                    // Se tem ambos, combinar em um único texto
                    if (temPatrocinios && temComissao) {
                      return (
                        <p className="text-xs text-gray-500 mt-2">
                          Inclui {currency.format(totalPatrocinios)} de patrocínios e {currency.format(totalComissaoRecebida)} de comissão do leiloeiro
                        </p>
                      );
                    }
                    
                    // Se tem apenas comissão (sem patrocínios)
                    if (temComissao) {
                      return (
                        <p className="text-xs text-gray-500 mt-2">
                          Inclui {currency.format(totalComissaoRecebida)} de comissão do leiloeiro
                        </p>
                      );
                    }
                    
                    // Se tem apenas patrocínios (sem comissão)
                    if (temPatrocinios) {
                      return (
                    <p className="text-xs text-gray-500 mt-2">
                      Inclui {currency.format(totalPatrocinios)} de patrocínios
                    </p>
                      );
                    }
                    
                    return null;
                  })()}
                </div>
              </div>

              <div className="mt-6 pt-6">
                <div className="flex items-center gap-2 mb-4">
                  <Package className="h-5 w-5 text-black" />
                  <span className="text-lg font-semibold text-black">Dados do Sistema</span>
                </div>
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                  <div className="text-center px-2">
                    <p className="text-xs font-semibold text-gray-700 uppercase tracking-[0.15em] mb-3">Total de Leilões</p>
                    <div className="h-px w-20 bg-gray-300 mx-auto mb-4"></div>
                    <p className="text-[2.125rem] font-extralight text-gray-900 mb-2 tracking-tight">{auctions.length}</p>
                    <p className="text-sm text-gray-600 font-medium">Eventos Cadastrados</p>
                  </div>
                  <div className="text-center px-2">
                    <p className="text-xs font-semibold text-gray-700 uppercase tracking-[0.15em] mb-3">Em Andamento</p>
                    <div className="h-px w-20 bg-gray-300 mx-auto mb-4"></div>
                    <p className="text-[2.125rem] font-extralight text-gray-900 mb-2 tracking-tight">{activeAuctionsCount}</p>
                    <p className="text-sm text-gray-600 font-medium">Leilões Em Andamento</p>
                  </div>
                  <div className="text-center px-2">
                    <p className="text-xs font-semibold text-gray-700 uppercase tracking-[0.15em] mb-3">Programados</p>
                    <div className="h-px w-20 bg-gray-300 mx-auto mb-4"></div>
                    <p className="text-[2.125rem] font-extralight text-gray-900 mb-2 tracking-tight">{scheduledAuctionsCount}</p>
                    <p className="text-sm text-gray-600 font-medium">Eventos Futuros</p>
                  </div>
                  <div className="text-center px-2">
                    <p className="text-xs font-semibold text-gray-700 uppercase tracking-[0.15em] mb-3">Despesas</p>
                    <div className="h-px w-20 bg-gray-300 mx-auto mb-4"></div>
                    <p className="text-[2.125rem] font-light text-gray-900 mb-2 tracking-tight">{currency.format(auctionCostsNumber)}</p>
                    <p className="text-sm text-gray-600 font-medium">Custos Totais</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
          
          {/* Faturas Recentes */}
          <Card className="flex-1 flex flex-col">
            <CardHeader className="flex-shrink-0">
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-3 text-xl">
                  <FileText className="h-6 w-6" />
                  Faturas Recentes
                </div>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => navigate("/faturas")}
                  className="hover:bg-gray-100 hover:text-gray-800 transition-all duration-200"
                >
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col">
              <div className="flex-1 overflow-y-auto">
                {recentInvoices.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
                    <FileText className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p className="text-lg font-medium">Nenhuma fatura encontrada</p>
                    <p className="text-sm">Ainda não há faturas emitidas no sistema.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {recentInvoices.map((invoice) => (
                      <div key={invoice.id} className="flex items-start justify-between p-4 rounded-lg bg-muted/30 border border-border/50 hover:bg-muted/50 hover:border-muted-foreground/20 transition-colors duration-200">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{invoice.bidder}</p>
                          <p className="text-sm text-muted-foreground mt-1 truncate">
                            {(() => {
                              // Adaptar exibição baseado no tipo de pagamento
                              const auction = activeAuctions.find(a => invoice.id.startsWith(`invoice-${a.id}-`));
                              if (!auction) return `Parcelas: ${invoice.parcelas} • ${invoice.amount}`;
                              
                              // Obter o arrematante correto do invoice
                              // ✅ Pegar os últimos 5 segmentos que formam o UUID do arrematante (formato: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)
                              const parts = invoice.id.split('-');
                              const arrematanteId = parts.slice(-5).join('-');
                              const arrematante = auction.arrematantes?.find(arr => arr.id === arrematanteId || arr.nome === arrematanteId) || auction.arrematante;
                              
                              if (!arrematante) return `Parcelas: ${invoice.parcelas} • ${invoice.amount}`;
                              
                              const loteArrematado = auction.lotes?.find((lote: LoteInfo) => lote.id === arrematante?.loteId);
                              
                              // Priorizar tipoPagamento do lote, mas usar do arrematante como fallback
                              const tipoPagamento = loteArrematado?.tipoPagamento || arrematante?.tipoPagamento || 'parcelamento';
                              
                              switch (tipoPagamento) {
                                case 'a_vista':
                                  return `Valor: ${invoice.amount} (à vista)`;
                                case 'entrada_parcelamento': {
                                  const parcelasPagas = arrematante?.parcelasPagas || 0;
                                  const quantidadeParcelasTotal = arrematante?.quantidadeParcelas || loteArrematado?.parcelasPadrao || 12;
                                  if (parcelasPagas === 0) {
                                    // Mostrar entrada + info das parcelas futuras (INDEPENDENTES)
                                    // ✅ Usar função que considera fator multiplicador e comissão do leiloeiro
                                    const valorTotal = obterValorTotalArrematante({
                                      usaFatorMultiplicador: arrematante?.usaFatorMultiplicador,
                                      valorLance: arrematante?.valorLance,
                                      fatorMultiplicador: arrematante?.fatorMultiplicador,
                                      valorPagarNumerico: arrematante?.valorPagarNumerico || 0,
                                      percentualComissaoLeiloeiro: arrematante?.percentualComissaoLeiloeiro
                                    }, auction.percentualComissaoLeiloeiro);
                                    
                                    // ✅ Calcular valor de entrada considerando string ou número
                                    const valorEntrada = arrematante?.valorEntrada 
                                      ? parseCurrencyToNumber(String(arrematante.valorEntrada))
                                      : valorTotal * 0.3;
                                    
                                    // ✅ Descrever estrutura de parcelas
                                    const temEstruturaParcelas = arrematante?.usaFatorMultiplicador && 
                                      (arrematante?.parcelasTriplas != null || 
                                       arrematante?.parcelasDuplas != null || 
                                       arrematante?.parcelasSimples != null);
                                    
                                    let descricaoParcelas = '';
                                    if (temEstruturaParcelas) {
                                      // Gerar descrição compacta: "10x R$ 3.000 + 3x R$ 1.000"
                                      const estrutura = calcularEstruturaParcelas(
                                        valorTotal,
                                        arrematante?.parcelasTriplas || 0,
                                        arrematante?.parcelasDuplas || 0,
                                        arrematante?.parcelasSimples || 0
                                      );
                                      
                                      const grupos: { [key: number]: number } = {};
                                      estrutura.forEach(parcela => {
                                        if (!grupos[parcela.valor]) {
                                          grupos[parcela.valor] = 0;
                                        }
                                        grupos[parcela.valor]++;
                                      });
                                      
                                      descricaoParcelas = Object.entries(grupos)
                                        .sort(([valorA], [valorB]) => Number(valorB) - Number(valorA))
                                        .map(([valor, qtd]) => `${qtd}x ${currency.format(Number(valor))}`)
                                        .join(' + ');
                                    } else {
                                      // Sistema antigo: divisão simples
                                    const valorPorParcela = valorTotal / quantidadeParcelasTotal;
                                      descricaoParcelas = `${quantidadeParcelasTotal} ${quantidadeParcelasTotal === 1 ? 'parcela' : 'parcelas'} de ${currency.format(valorPorParcela)}`;
                                    }
                                    
                                    return `Entrada 0/1 • ${currency.format(valorEntrada)} • Parcelas: 0/${quantidadeParcelasTotal} • ${descricaoParcelas}`;
                                  } else {
                                    const parcelasEfetivasPagas = Math.max(0, parcelasPagas - 1);
                                    const valorTotal = obterValorTotalArrematante({
                                      usaFatorMultiplicador: arrematante?.usaFatorMultiplicador,
                                      valorLance: arrematante?.valorLance,
                                      fatorMultiplicador: arrematante?.fatorMultiplicador,
                                      valorPagarNumerico: arrematante?.valorPagarNumerico || 0,
                                      percentualComissaoLeiloeiro: arrematante?.percentualComissaoLeiloeiro
                                    }, auction.percentualComissaoLeiloeiro);
                                    const valorEntrada = arrematante?.valorEntrada 
                                      ? parseCurrencyToNumber(String(arrematante.valorEntrada))
                                      : valorTotal * 0.3;
                                    
                                    // ✅ Descrever estrutura de parcelas
                                    const temEstruturaParcelas = arrematante?.usaFatorMultiplicador && 
                                      (arrematante?.parcelasTriplas != null || 
                                       arrematante?.parcelasDuplas != null || 
                                       arrematante?.parcelasSimples != null);
                                    
                                    let descricaoParcelas = '';
                                    if (temEstruturaParcelas) {
                                      // Gerar descrição compacta: "10x R$ 3.000 + 3x R$ 1.000"
                                      const estrutura = calcularEstruturaParcelas(
                                        valorTotal,
                                        arrematante?.parcelasTriplas || 0,
                                        arrematante?.parcelasDuplas || 0,
                                        arrematante?.parcelasSimples || 0
                                      );
                                      
                                      const grupos: { [key: number]: number } = {};
                                      estrutura.forEach(parcela => {
                                        if (!grupos[parcela.valor]) {
                                          grupos[parcela.valor] = 0;
                                        }
                                        grupos[parcela.valor]++;
                                      });
                                      
                                      descricaoParcelas = Object.entries(grupos)
                                        .sort(([valorA], [valorB]) => Number(valorB) - Number(valorA))
                                        .map(([valor, qtd]) => `${qtd}x ${currency.format(Number(valor))}`)
                                        .join(' + ');
                                    } else {
                                      descricaoParcelas = `${invoice.amount} por parcela`;
                                    }
                                    
                                    return `Entrada 1/1 • ${currency.format(valorEntrada)} • Parcelas: ${parcelasEfetivasPagas}/${quantidadeParcelasTotal} • ${descricaoParcelas}`;
                                  }
                                  }
                                case 'parcelamento':
                                default: {
                                  // ✅ Descrever estrutura de parcelas
                                  const auction = activeAuctions.find(a => invoice.id.startsWith(`invoice-${a.id}-`));
                                  if (!auction) return `Parcelas: ${invoice.parcelas} • ${invoice.amount} por parcela`;
                                  
                                  const parts = invoice.id.split('-');
                                  const arrematanteId = parts.slice(-5).join('-');
                                  const arrematante = auction.arrematantes?.find(arr => arr.id === arrematanteId || arr.nome === arrematanteId) || auction.arrematante;
                                  
                                  if (!arrematante) return `Parcelas: ${invoice.parcelas} • ${invoice.amount} por parcela`;
                                  
                                  const temEstruturaParcelas = arrematante?.usaFatorMultiplicador && 
                                    (arrematante?.parcelasTriplas != null || 
                                     arrematante?.parcelasDuplas != null || 
                                     arrematante?.parcelasSimples != null);
                                  
                                  if (temEstruturaParcelas) {
                                    const valorTotal = obterValorTotalArrematante({
                                      usaFatorMultiplicador: arrematante?.usaFatorMultiplicador,
                                      valorLance: arrematante?.valorLance,
                                      fatorMultiplicador: arrematante?.fatorMultiplicador,
                                      valorPagarNumerico: arrematante?.valorPagarNumerico || 0,
                                      percentualComissaoLeiloeiro: arrematante?.percentualComissaoLeiloeiro
                                    }, auction.percentualComissaoLeiloeiro);
                                    
                                    // Gerar descrição compacta: "10x R$ 3.000 + 3x R$ 1.000"
                                    const estrutura = calcularEstruturaParcelas(
                                      valorTotal,
                                      arrematante?.parcelasTriplas || 0,
                                      arrematante?.parcelasDuplas || 0,
                                      arrematante?.parcelasSimples || 0
                                    );
                                    
                                    // Agrupar parcelas por valor
                                    const grupos: { [key: number]: number } = {};
                                    estrutura.forEach(parcela => {
                                      if (!grupos[parcela.valor]) {
                                        grupos[parcela.valor] = 0;
                                      }
                                      grupos[parcela.valor]++;
                                    });
                                    
                                    // Criar descrição compacta: "10x R$ 3.000 + 3x R$ 1.000"
                                    const descricaoParcelas = Object.entries(grupos)
                                      .sort(([valorA], [valorB]) => Number(valorB) - Number(valorA))
                                      .map(([valor, qtd]) => `${qtd}x ${currency.format(Number(valor))}`)
                                      .join(' + ');
                                    
                                    return `Parcelas: ${invoice.parcelas} • ${descricaoParcelas}`;
                                  }
                                  
                                  return `Parcelas: ${invoice.parcelas} • ${invoice.amount} por parcela`;
                                }
                              }
                            })()}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1 font-medium">
                            {(() => {
                              // Adaptar texto de vencimento baseado no tipo de pagamento
                              const auction = activeAuctions.find(a => invoice.id.startsWith(`invoice-${a.id}-`));
                              if (!auction) return `Venc: ${invoice.dueDate}`;
                              
                              // Obter o arrematante correto do invoice
                              // ✅ Pegar os últimos 5 segmentos que formam o UUID do arrematante
                              const parts = invoice.id.split('-');
                              const arrematanteId = parts.slice(-5).join('-');
                              const arrematante = auction.arrematantes?.find(arr => arr.id === arrematanteId || arr.nome === arrematanteId) || auction.arrematante;
                              
                              if (!arrematante) return `Venc: ${invoice.dueDate}`;
                              
                              const loteArrematado = auction.lotes?.find((lote: LoteInfo) => lote.id === arrematante?.loteId);
                              const parcelasPagas = arrematante?.parcelasPagas || 0;
                              // ✅ Priorizar tipoPagamento do arrematante (mais específico)
                              const tipoPagamento = arrematante?.tipoPagamento || loteArrematado?.tipoPagamento;
                              
                              // Se o pagamento foi confirmado/quitado, mostrar mensagem de confirmação
                              if (arrematante?.pago) {
                                return 'Pagamento confirmado';
                              }
                              
                              if (tipoPagamento === 'a_vista') {
                                return `Data pagamento: ${invoice.dueDate}`;
                              } else if (tipoPagamento === 'entrada_parcelamento') {
                                  const quantidadeParcelasTotal = arrematante?.quantidadeParcelas || loteArrematado?.parcelasPadrao || 12;
                                  
                                  if (parcelasPagas === 0) {
                                    // Mostrar qual vence primeiro: entrada ou parcela
                                    const tipoVencimento = getTipoProximoVencimento(arrematante, auction);
                                    const sufixo = tipoVencimento === 'entrada' ? 'Entrada' : (tipoVencimento === 'parcela' ? '1ª parcela' : '');
                                    return sufixo ? `Próximo venc: ${invoice.dueDate} • ${sufixo}` : `Próximo venc: ${invoice.dueDate}`;
                                  } else if (parcelasPagas < quantidadeParcelasTotal + 1) {
                                    // Entrada já paga, mostrar próxima parcela mensal
                                    const parcelaNum = parcelasPagas;
                                    return `Próximo venc: ${invoice.dueDate} • ${parcelaNum}ª parcela`;
                                  } else {
                                    return `Próximo venc: ${invoice.dueDate}`;
                                  }
                              } else {
                                return `Próximo venc: ${invoice.dueDate}`;
                              }
                            })()}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Leilão: {invoice.leilao}
                          </p>
                        </div>
                        <Badge variant={getStatusBadge(invoice.status).variant} className="ml-2 flex-shrink-0">
                          {getStatusBadge(invoice.status).label}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
                <div className="flex-shrink-0 pt-4">
                  <Button className="w-full h-12 hover:bg-gray-100 hover:text-gray-800 transition-all duration-300 ease-out" variant="outline">
                    <span className="text-sm font-medium">Ver Todas as Faturas</span>
                  </Button>
                </div>
            </CardContent>
          </Card>
        </div>

        {/* Carrossel - Lado direito, altura alinhada */}
        <Card 
          className="flex flex-col relative group"
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
        >
          <CardHeader className="flex-shrink-0">
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-3 text-xl">
{(() => {
                  const IconComponent = slides[currentSlide].icon;
                  return <IconComponent className="h-6 w-6" />;
                })()}
                {slides[currentSlide].title}
              </div>
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => {
                  const routes = { leiloes: '/leiloes', inadimplentes: '/inadimplencia', arrematantes: '/arrematantes' };
                  navigate(routes[slides[currentSlide].id as keyof typeof routes]);
                }}
                className="hover:bg-gray-100 hover:text-gray-800 transition-all duration-200"
              >
                <ArrowRight className="h-4 w-4" />
              </Button>
            </CardTitle>
          </CardHeader>
          
          {/* Controles de navegação nas laterais - aparecem no hover */}
          <Button 
            variant="ghost" 
            size="sm"
            onClick={prevSlide}
            className="absolute left-2 top-1/2 -translate-y-1/2 z-10 opacity-0 group-hover:opacity-100 hover:bg-gray-100 hover:text-gray-800 transition-all duration-300"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          
          <Button 
            variant="ghost" 
            size="sm"
            onClick={nextSlide}
            className="absolute right-2 top-1/2 -translate-y-1/2 z-10 opacity-0 group-hover:opacity-100 hover:bg-gray-100 hover:text-gray-800 transition-all duration-300"
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
          <CardContent className="flex-1 flex flex-col">
            <div className="flex-1 relative overflow-hidden">
              <div className={`h-full transition-opacity duration-500 ease-out ${isTransitioning ? 'opacity-0' : 'opacity-100'}`}>
                {currentSlide === 0 && (
                  // Próximos Leilões
                  nextAuctions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
                      <Calendar className="h-16 w-16 mx-auto mb-4 opacity-50" />
                      <p className="text-lg">Nenhum leilão agendado</p>
                      <p className="text-sm">Cadastre um novo leilão para começar</p>
                    </div>
                  ) : (
                    <div className="space-y-4 overflow-y-auto max-h-full">
                      {nextAuctions.map((auction) => (
                        <div key={auction.id} className="p-4 rounded-lg bg-muted/30 border border-border/50 space-y-2 hover:bg-muted/50 hover:border-muted-foreground/20 transition-colors duration-200">
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-base truncate">{auction.nome}</p>
                              <p className="text-sm text-muted-foreground mt-1 truncate">
                                {auction.identificacao && `${auction.identificacao} • `}
                                {auction.dataInicio}
                              </p>
                            </div>
                            <Badge variant={getStatusBadge(auction.status).variant} className="ml-2 flex-shrink-0">
                              {getStatusBadge(auction.status).label}
                            </Badge>
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            Local: {String(auction.local)}{auction.endereco ? ` - ${auction.endereco}` : ""}
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                )}

                {currentSlide === 1 && (
                  // Inadimplentes
                  overdueArrematantes.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
                      <AlertTriangle className="h-16 w-16 mx-auto mb-4 opacity-50" />
                      <p className="text-lg">Nenhuma inadimplência</p>
                      <p className="text-sm">Todos os pagamentos em dia</p>
                    </div>
                  ) : (
                    <div className="space-y-4 overflow-y-auto max-h-full">
                      {overdueArrematantes.map((auction) => (
                        <div key={auction.id} className="p-4 rounded-lg bg-muted/30 border border-border/50 space-y-2 hover:bg-muted/50 hover:border-muted-foreground/20 transition-colors duration-200">
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-base truncate">
                                {auction.arrematante?.nome || "—"}
                              </p>
                              <p className="text-sm text-muted-foreground mt-1 truncate">
                                {(() => {
                                  // Adaptar texto baseado no tipo de pagamento
                                  const loteArrematado = auction.lotes?.find((lote: LoteInfo) => lote.id === auction.arrematante?.loteId);
                                  const dataVencimento = getProximaDataVencimento(auction.arrematante, auction);
                                  const parcelasPagas = auction.arrematante?.parcelasPagas || 0;
                                  // ✅ Priorizar tipoPagamento do arrematante (mais específico)
                                  const tipoPagamento = auction.arrematante?.tipoPagamento || loteArrematado?.tipoPagamento;
                                  
                                  // Se o pagamento foi confirmado/quitado, mostrar mensagem de confirmação
                                  if (auction.arrematante?.pago) {
                                    return 'Pagamento confirmado';
                                  }
                                  
                                  if (tipoPagamento === 'a_vista') {
                                    return `Data pagamento: ${dataVencimento}`;
                                  } else if (tipoPagamento === 'entrada_parcelamento') {
                                     if (parcelasPagas === 0) {
                                       // Mostrar qual vence primeiro: entrada ou parcela
                                       const tipoVencimento = getTipoProximoVencimento(auction.arrematante, auction);
                                       const sufixo = tipoVencimento === 'entrada' ? 'Entrada' : (tipoVencimento === 'parcela' ? '1ª parcela' : '');
                                       return sufixo ? `Próximo venc: ${dataVencimento} • ${sufixo}` : `Próximo venc: ${dataVencimento}`;
                                    } else {
                                      // Entrada já paga, mostrar próxima parcela mensal
                                      const parcelaNum = parcelasPagas;
                                      return `Próximo venc: ${dataVencimento} • ${parcelaNum}ª parcela`;
                                    }
                                  } else {
                                    return `Próximo venc: ${dataVencimento}`;
                                  }
                                })()} • {(() => {
                                  // Calcular valor por parcela baseado no tipo de pagamento do lote
                                  const loteArrematado = auction.lotes?.find((lote: LoteInfo) => lote.id === auction.arrematante?.loteId);
                                  
                                  // ✅ Usar função que considera fator multiplicador e comissão do leiloeiro
                                  const valorTotal = obterValorTotalArrematante({
                                    usaFatorMultiplicador: auction.arrematante?.usaFatorMultiplicador,
                                    valorLance: auction.arrematante?.valorLance,
                                    fatorMultiplicador: auction.arrematante?.fatorMultiplicador || loteArrematado?.fatorMultiplicador,
                                    valorPagarNumerico: auction.arrematante?.valorPagarNumerico || 0,
                                    percentualComissaoLeiloeiro: auction.arrematante?.percentualComissaoLeiloeiro
                                  }, auction.percentualComissaoLeiloeiro);
                                  
                                  // Priorizar tipoPagamento do lote, mas usar do arrematante como fallback
                                  const tipoPagamento = loteArrematado?.tipoPagamento || auction.arrematante?.tipoPagamento || 'parcelamento';
                                  
                                  let valorPorParcela = 0;
                                  switch (tipoPagamento) {
                                    case 'a_vista':
                                      return currency.format(valorTotal) + " (à vista)";
                                    case 'entrada_parcelamento': {
                                      const parcelasPagas = auction.arrematante?.parcelasPagas || 0;
                                      const quantidadeParcelasTotal = auction.arrematante?.quantidadeParcelas || loteArrematado?.parcelasPadrao || 12;
                                      const valorEntrada = auction.arrematante?.valorEntrada ? 
                                        parseCurrencyToNumber(auction.arrematante.valorEntrada) : 
                                        valorTotal * 0.3;
                                      
                                      // ✅ Calcular valor por parcela considerando estrutura
                                      const temEstruturaParcelas = auction.arrematante?.usaFatorMultiplicador && 
                                        (auction.arrematante?.parcelasTriplas != null || 
                                         auction.arrematante?.parcelasDuplas != null || 
                                         auction.arrematante?.parcelasSimples != null);
                                      
                                      if (temEstruturaParcelas) {
                                        const estrutura = calcularEstruturaParcelas(
                                          valorTotal,
                                          auction.arrematante?.parcelasTriplas || 0,
                                          auction.arrematante?.parcelasDuplas || 0,
                                          auction.arrematante?.parcelasSimples || 0
                                        );
                                        const parcelaAtualIndex = Math.max(0, parcelasPagas - 1);
                                        valorPorParcela = estrutura[parcelaAtualIndex]?.valor || estrutura[0]?.valor || (valorTotal / quantidadeParcelasTotal);
                                      } else {
                                        valorPorParcela = valorTotal / quantidadeParcelasTotal;
                                      }
                                      
                                      if (parcelasPagas === 0) {
                                        // Entrada pendente - mostrar entrada e info de parcelas (INDEPENDENTES)
                                        return `Entrada 0/1 • ${currency.format(valorEntrada)} • Parcelas: 0/${quantidadeParcelasTotal} • ${currency.format(valorPorParcela)} por parcela`;
                                      } else {
                                        // Entrada paga - mostrar parcelas (INDEPENDENTES da entrada)
                                        const parcelasEfetivasPagas = Math.max(0, parcelasPagas - 1);
                                        return `Entrada 1/1 • ${currency.format(valorEntrada)} • Parcelas: ${parcelasEfetivasPagas}/${quantidadeParcelasTotal} • ${currency.format(valorPorParcela)} por parcela`;
                                      }
                                    }
                                    case 'parcelamento':
                                    default: {
                                      const quantidadeParcelas = auction.arrematante?.quantidadeParcelas || loteArrematado?.parcelasPadrao || 1;
                                      const parcelasPagas = auction.arrematante?.parcelasPagas || 0;
                                      
                                      // ✅ Calcular valor por parcela considerando estrutura
                                      const temEstruturaParcelas = auction.arrematante?.usaFatorMultiplicador && 
                                        (auction.arrematante?.parcelasTriplas != null || 
                                         auction.arrematante?.parcelasDuplas != null || 
                                         auction.arrematante?.parcelasSimples != null);
                                      
                                      if (temEstruturaParcelas) {
                                        // Gerar descrição compacta da estrutura: "10x R$ 3.000 + 3x R$ 1.000"
                                        const estrutura = calcularEstruturaParcelas(
                                          valorTotal,
                                          auction.arrematante?.parcelasTriplas || 0,
                                          auction.arrematante?.parcelasDuplas || 0,
                                          auction.arrematante?.parcelasSimples || 0
                                        );
                                        
                                        // Agrupar parcelas por valor para criar descrição compacta
                                        const grupos: { [key: number]: number } = {};
                                        estrutura.forEach(parcela => {
                                          if (!grupos[parcela.valor]) {
                                            grupos[parcela.valor] = 0;
                                          }
                                          grupos[parcela.valor]++;
                                        });
                                        
                                        // Criar descrição: "10x R$ 3.000 + 3x R$ 1.000"
                                        const descricaoEstrutura = Object.entries(grupos)
                                          .sort(([valorA], [valorB]) => Number(valorB) - Number(valorA)) // Ordenar do maior para o menor
                                          .map(([valor, qtd]) => `${qtd}x ${currency.format(Number(valor))}`)
                                          .join(' + ');
                                        
                                        return `Parcelas: ${parcelasPagas}/${quantidadeParcelas} • ${descricaoEstrutura}`;
                                      } else {
                                        // Sistema antigo: divisão simples
                                      valorPorParcela = valorTotal / quantidadeParcelas;
                                      return `Parcelas: ${parcelasPagas}/${quantidadeParcelas} • ${currency.format(valorPorParcela)} por parcela`;
                                      }
                                    }
                                  }
                                })()}
                              </p>
                            </div>
                            <Badge variant="destructive" className="ml-2 flex-shrink-0">
                              Atrasado
                            </Badge>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Leilão: {auction.nome}
                          </div>
                        </div>
                      ))}
                    </div>
                  )
                )}

                {currentSlide === 2 && (
                  // Arrematantes
                  recentArrematantes.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
                      <Users className="h-16 w-16 mx-auto mb-4 opacity-50" />
                      <p className="text-lg font-medium">Nenhum arrematante encontrado</p>
                      <p className="text-sm">Ainda não há arrematantes cadastrados no sistema.</p>
                    </div>
                  ) : (
                    <div className="space-y-4 overflow-y-auto max-h-full">
                      {recentArrematantes.map((auction) => {
                        const proximoVencimento = getProximaDataVencimento(auction.arrematante, auction);
                        
                        return (
                          <div key={auction.id} className="p-4 rounded-lg bg-muted/30 border border-border/50 space-y-2 hover:bg-muted/50 hover:border-muted-foreground/20 transition-colors duration-200">
                            <div className="flex items-start justify-between">
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-base truncate">{auction.arrematante?.nome}</p>
                                <p className="text-sm text-muted-foreground mt-1 truncate">
                                  {(() => {
                                    // Adaptar exibição baseado no tipo de pagamento do lote
                                    const loteArrematado = auction.lotes?.find((lote: LoteInfo) => lote.id === auction.arrematante?.loteId);
                                    
                                    // ✅ Usar função que considera fator multiplicador e comissão do leiloeiro
                                    const valorTotal = obterValorTotalArrematante({
                                      usaFatorMultiplicador: auction.arrematante?.usaFatorMultiplicador,
                                      valorLance: auction.arrematante?.valorLance,
                                      fatorMultiplicador: auction.arrematante?.fatorMultiplicador || loteArrematado?.fatorMultiplicador,
                                      valorPagarNumerico: auction.arrematante?.valorPagarNumerico || 0,
                                      percentualComissaoLeiloeiro: auction.arrematante?.percentualComissaoLeiloeiro
                                    }, auction.percentualComissaoLeiloeiro);
                                    
                                    // Priorizar tipoPagamento do lote, mas usar do arrematante como fallback
                                    const tipoPagamento = loteArrematado?.tipoPagamento || auction.arrematante?.tipoPagamento || 'parcelamento';
                                    
                                    switch (tipoPagamento) {
                                      case 'a_vista':
                                        return `Valor total: ${currency.format(valorTotal)} (à vista)`;
                                      
                                      case 'entrada_parcelamento': {
                                        const parcelasPagas = auction.arrematante?.parcelasPagas || 0;
                                        const quantidadeParcelasTotal = auction.arrematante?.quantidadeParcelas || loteArrematado?.parcelasPadrao || 12;
                                        const valorEntrada = auction.arrematante?.valorEntrada ? 
                                          parseCurrencyToNumber(auction.arrematante.valorEntrada) : 
                                          valorTotal * 0.3; // fallback 30% se não definido
                                        
                                        // ✅ Calcular valor por parcela considerando estrutura
                                        let valorPorParcela = 0;
                                        const temEstruturaParcelas = auction.arrematante?.usaFatorMultiplicador && 
                                          (auction.arrematante?.parcelasTriplas != null || 
                                           auction.arrematante?.parcelasDuplas != null || 
                                           auction.arrematante?.parcelasSimples != null);
                                        
                                        if (temEstruturaParcelas) {
                                          const estrutura = calcularEstruturaParcelas(
                                            valorTotal,
                                            auction.arrematante?.parcelasTriplas || 0,
                                            auction.arrematante?.parcelasDuplas || 0,
                                            auction.arrematante?.parcelasSimples || 0
                                          );
                                          const parcelaAtualIndex = Math.max(0, parcelasPagas - 1);
                                          valorPorParcela = estrutura[parcelaAtualIndex]?.valor || estrutura[0]?.valor || (valorTotal / quantidadeParcelasTotal);
                                        } else {
                                          valorPorParcela = valorTotal / quantidadeParcelasTotal;
                                        }
                                        
                                        if (parcelasPagas === 0) {
                                          // Mostra entrada + info das parcelas futuras (INDEPENDENTES)
                                          return `Entrada 0/1 • ${currency.format(valorEntrada)} • Parcelas: 0/${quantidadeParcelasTotal} • ${currency.format(valorPorParcela)} por parcela`;
                                        } else {
                                          // Mostra parcelas após entrada (parcelasPagas-1 porque a primeira "parcela paga" é a entrada)
                                          const parcelasEfetivasPagas = Math.max(0, parcelasPagas - 1);
                                          return `Entrada 1/1 • ${currency.format(valorEntrada)} • Parcelas: ${parcelasEfetivasPagas}/${quantidadeParcelasTotal} • ${currency.format(valorPorParcela)} por parcela`;
                                        }
                                      }
                                      
                                      case 'parcelamento':
                                      default: {
                                        const quantidadeParcelas = auction.arrematante?.quantidadeParcelas || loteArrematado?.parcelasPadrao || 1;
                                        const parcelasPagas = auction.arrematante?.parcelasPagas || 0;
                                        
                                        // ✅ Calcular valor por parcela considerando estrutura
                                        const temEstruturaParcelas = auction.arrematante?.usaFatorMultiplicador && 
                                          (auction.arrematante?.parcelasTriplas != null || 
                                           auction.arrematante?.parcelasDuplas != null || 
                                           auction.arrematante?.parcelasSimples != null);
                                        
                                        if (temEstruturaParcelas) {
                                          // Gerar descrição compacta da estrutura: "10x R$ 3.000 + 3x R$ 1.000"
                                          const estrutura = calcularEstruturaParcelas(
                                            valorTotal,
                                            auction.arrematante?.parcelasTriplas || 0,
                                            auction.arrematante?.parcelasDuplas || 0,
                                            auction.arrematante?.parcelasSimples || 0
                                          );
                                          
                                          // Agrupar parcelas por valor para criar descrição compacta
                                          const grupos: { [key: number]: number } = {};
                                          estrutura.forEach(parcela => {
                                            if (!grupos[parcela.valor]) {
                                              grupos[parcela.valor] = 0;
                                            }
                                            grupos[parcela.valor]++;
                                          });
                                          
                                          // Criar descrição: "10x R$ 3.000 + 3x R$ 1.000"
                                          const descricaoEstrutura = Object.entries(grupos)
                                            .sort(([valorA], [valorB]) => Number(valorB) - Number(valorA)) // Ordenar do maior para o menor
                                            .map(([valor, qtd]) => `${qtd}x ${currency.format(Number(valor))}`)
                                            .join(' + ');
                                          
                                          return `Parcelas: ${parcelasPagas}/${quantidadeParcelas} • ${descricaoEstrutura}`;
                                        } else {
                                          // Sistema antigo: divisão simples
                                        const valorPorParcela = valorTotal / quantidadeParcelas;
                                        return `Parcelas: ${parcelasPagas}/${quantidadeParcelas} • ${currency.format(valorPorParcela)} por parcela`;
                                        }
                                      }
                                    }
                                  })()}
                                </p>
                                 <p className="text-xs text-muted-foreground mt-1 font-medium">
                                     {(() => {
                                       // Adaptar texto baseado no tipo de pagamento
                                       const loteArrematado = auction.lotes?.find((lote: LoteInfo) => lote.id === auction.arrematante?.loteId);
                                       const parcelasPagas = auction.arrematante?.parcelasPagas || 0;
                                       // ✅ Priorizar tipoPagamento do arrematante (mais específico)
                                       const tipoPagamento = auction.arrematante?.tipoPagamento || loteArrematado?.tipoPagamento;
                                       
                                       // Se o pagamento foi confirmado/quitado, mostrar mensagem de confirmação
                                       if (auction.arrematante?.pago) {
                                         return 'Pagamento confirmado';
                                       }
                                       
                                       // Se não conseguiu calcular a data, mostrar mensagem de configuração pendente
                                       if (proximoVencimento === "—") {
                                         if (tipoPagamento === 'entrada_parcelamento') {
                                           if (parcelasPagas === 0) {
                                             const tipoVencimento = getTipoProximoVencimento(auction.arrematante, auction);
                                             const sufixo = tipoVencimento === 'entrada' ? 'Entrada' : '1ª parcela';
                                             return `Venc: — • ${sufixo} (configurar data)`;
                                           } else {
                                             return "Venc: — • Parcela (configurar data)";
                                           }
                                         } else if (tipoPagamento === 'a_vista') {
                                           return "Venc: — • À vista (configurar data)";
                                         } else {
                                           return "Venc: — • Parcela (configurar data)";
                                         }
                                       }
                                       
                                       if (tipoPagamento === 'a_vista') {
                                         return `Venc: ${proximoVencimento} • Pagamento à vista`;
                                       } else if (tipoPagamento === 'entrada_parcelamento') {
                                           const quantidadeParcelasTotal = auction.arrematante?.quantidadeParcelas || loteArrematado?.parcelasPadrao || 12;
                                           
                                           if (parcelasPagas === 0) {
                                             // Mostrar qual vence primeiro: entrada ou parcela
                                             const tipoVencimento = getTipoProximoVencimento(auction.arrematante, auction);
                                             const sufixo = tipoVencimento === 'entrada' ? 'Entrada' : (tipoVencimento === 'parcela' ? '1ª parcela' : '');
                                             return sufixo ? `Venc: ${proximoVencimento} • ${sufixo}` : `Venc: ${proximoVencimento}`;
                                           } else if (parcelasPagas < quantidadeParcelasTotal + 1) {
                                             // Entrada já paga, calcular próxima parcela
                                             const proximaParcelaNum = parcelasPagas;
                                             return `Venc: ${proximoVencimento} • ${proximaParcelaNum}ª parcela`;
                                           } else {
                                             return `Venc: ${proximoVencimento} • Finalizado`;
                                           }
                                       } else {
                                         // Parcelamento simples
                                         const proximaParcelaNum = parcelasPagas + 1;
                                         return `Venc: ${proximoVencimento} • ${proximaParcelaNum}ª parcela`;
                                       }
                                     })()}
                                 </p>
                              </div>
                              <Badge 
                                variant={
                                  auction.arrematante?.pago 
                                    ? "success" 
                                    : isOverdue(auction.arrematante, auction) 
                                      ? "destructive" 
                                      : "warning"
                                } 
                                className="ml-2 flex-shrink-0"
                              >
                                {auction.arrematante?.pago 
                                  ? "Pago" 
                                  : isOverdue(auction.arrematante, auction) 
                                    ? "Atrasado" 
                                    : "Em Aberto"
                                }
                              </Badge>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              Leilão: {auction.nome}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )
                )}
              </div>
            </div>
            <div className="flex-shrink-0 pt-6">
              <Button 
                className="w-full h-12 hover:bg-gray-100 hover:text-gray-800 transition-all duration-300 ease-out" 
                variant="outline" 
                onClick={() => {
                  const routes = { leiloes: '/leiloes', inadimplentes: '/inadimplencia', arrematantes: '/arrematantes' };
                  navigate(routes[slides[currentSlide].id as keyof typeof routes]);
                }}
              >
                <span className="text-sm font-medium">Ver Todos os {slides[currentSlide].title}</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}