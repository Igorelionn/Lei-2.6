import { useState, useMemo, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useSupabaseAuctions } from "@/hooks/use-supabase-auctions";
import { logger } from "@/lib/logger";
import { useActivityLogger } from "@/hooks/use-activity-logger";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Users,
  ArrowLeftRight,
  AlertCircle,
  Clock,
  ArrowLeft,
  Download
} from "lucide-react";
import { ArrematanteInfo, AuctionStatus } from "@/lib/types";

// 🔒 Tipo para histórico de leilões do arrematante
interface LeilaoHistorico extends ArrematanteInfo {
  leilaoId: string;
  leilaoNome: string;
  leilaoIdentificacao: string;
  leilaoData: string;
  leilaoStatus: AuctionStatus;
}

interface ArrematanteComHistorico extends ArrematanteInfo {
  leiloes: LeilaoHistorico[];
}
import { calcularEstruturaParcelas, descreverEstruturaParcelas } from "@/lib/parcelamento-calculator";
import html2pdf from 'html2pdf.js';

export default function Historico() {
  const [searchParams] = useSearchParams();
  const { auctions } = useSupabaseAuctions();
  const { logBidderAction, logReportAction } = useActivityLogger();
  const [searchText, setSearchText] = useState("");
  const [searchMode, setSearchMode] = useState<'cpf' | 'nome'>('cpf');
  const [showAllBidders, setShowAllBidders] = useState(false);
  const [selectedArrematante, setSelectedArrematante] = useState<ArrematanteComHistorico | null>(null);
  const [isHoveringButton, setIsHoveringButton] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const processedCpfRef = useRef(false);

  // Hook para detectar quando está digitando
  useEffect(() => {
    let timeout: NodeJS.Timeout;
    if (searchText) {
      setIsTyping(true);
      timeout = setTimeout(() => {
        setIsTyping(false);
      }, 500);
    }
    return () => clearTimeout(timeout);
  }, [searchText]);
  
  // Hook para buscar automaticamente quando CPF vem na URL
  useEffect(() => {
    if (processedCpfRef.current) return;
    
    const cpfFromUrl = searchParams.get('cpf');
    if (cpfFromUrl && todosArrematantes.length > 0) {
      setSearchMode('cpf');
      setSearchText(formatCpfCnpj(cpfFromUrl));
      processedCpfRef.current = true;
    }
  }, [todosArrematantes.length]);

  // Formatador CPF/CNPJ
  const formatCpfCnpj = (value: string) => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 11) {
      return numbers
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d{1,2})/, '$1-$2')
        .replace(/(-\d{2})\d+?$/, '$1');
    } else {
      return numbers
        .replace(/(\d{2})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1/$2')
        .replace(/(\d{4})(\d)/, '$1-$2')
        .replace(/(-\d{2})\d+?$/, '$1');
    }
  };

  // Coletar todos os arrematantes únicos de todos os leilões
  const todosArrematantes = useMemo(() => {
    if (!auctions) return [];
    
    const arrematantesMap = new Map<string, ArrematanteComHistorico>();
    
    auctions.forEach(auction => {
      if (auction.arrematante && auction.arrematante.documento) {
        const doc = auction.arrematante.documento;
        
        // Criar objeto com dados do leilão + arrematante
        const leilaoComDados = {
          leilaoId: auction.id,
          leilaoNome: auction.nome,
          leilaoIdentificacao: auction.identificacao,
          leilaoData: auction.dataInicio,
          leilaoStatus: auction.status,
          percentualJuros: auction.arrematante.percentualJurosAtraso || 5,
          ...auction.arrematante
        };
        
        if (arrematantesMap.has(doc)) {
          // Adicionar leilão à lista existente
          arrematantesMap.get(doc)!.leiloes.push(leilaoComDados);
        } else {
          // Criar novo registro
          arrematantesMap.set(doc, {
            ...auction.arrematante,
            leiloes: [leilaoComDados]
          });
        }
      }
    });
    
    return Array.from(arrematantesMap.values());
  }, [auctions]);

  // Filtrar arrematantes
  const arrematantesFiltrados = useMemo(() => {
    if (showAllBidders && !searchText) {
      return [...todosArrematantes].sort((a, b) => 
        (a.nome || '').localeCompare(b.nome || '', 'pt-BR')
      );
    }
    
    if (searchText) {
      let filtrados;
      
      if (searchMode === 'nome') {
        const buscaLimpa = searchText.toLowerCase().trim();
        filtrados = todosArrematantes.filter(arr => {
          const nomeLimpo = (arr.nome || '').toLowerCase();
          return nomeLimpo.startsWith(buscaLimpa);
        });
      } else {
        const cpfLimpo = searchText.replace(/\D/g, '');
        filtrados = todosArrematantes.filter(arr => {
          const docLimpo = arr.documento?.replace(/\D/g, '') || '';
          return docLimpo.startsWith(cpfLimpo);
        });
      }
      
      return filtrados.sort((a, b) => 
        (a.nome || '').localeCompare(b.nome || '', 'pt-BR')
      );
    }
    
    return [];
  }, [todosArrematantes, searchText, showAllBidders, searchMode]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('pt-BR');
    } catch {
      return 'Data inválida';
    }
  };

  // Função para baixar o histórico em PDF
  const handleDownloadPDF = async () => {
    if (!selectedArrematante) return;

    setIsGenerating(true);
    try {
      const element = document.getElementById('historico-content');
      if (!element) return;

      const opt = {
        margin: [0.5, 0.5, 0.8, 0.5] as [number, number, number, number],
        filename: `historico-${selectedArrematante.nome}.pdf`,
        image: { type: 'jpeg' as const, quality: 0.98 },
        html2canvas: { 
          scale: 2,
          useCORS: true,
          letterRendering: true,
          windowWidth: 1200,
          scrollY: 0,
          scrollX: 0,
          height: element.scrollHeight + 50
        },
        jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' as const },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
      };

      await html2pdf().set(opt).from(element).save();
      // Log da exportação do histórico em PDF
      try {
        await logReportAction('export', 'historico', `Baixou histórico do arrematante "${selectedArrematante.nome}"`, {
          metadata: { arrematante: selectedArrematante.nome, leiloes_count: selectedArrematante.leiloes?.length }
        });
      } catch { /* silenciar erro de log */ }
    } catch (error) {
      logger.error('Erro ao gerar PDF:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  // Função para calcular juros progressivos
  const calcularJurosProgressivos = (valorOriginal: number, dataVencimento: string, percentualJuros: number) => {
    if (!dataVencimento || !percentualJuros) {
      return valorOriginal;
    }
    
    const hoje = new Date();
    const vencimento = new Date(dataVencimento + 'T00:00:00');
    
    if (hoje <= vencimento) {
      return valorOriginal;
    }
    
    const diffTime = Math.abs(hoje.getTime() - vencimento.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const mesesAtraso = Math.floor(diffDays / 30);
    
    if (mesesAtraso < 1) {
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

  // Calcular estatísticas do arrematante
  const calcularEstatisticas = (arrematante: ArrematanteComHistorico) => {
    const totalLeiloes = arrematante.leiloes.length;
    let totalArrematado = 0;
    let totalArrematadoBase = 0;
    let totalPago = 0;
    let totalPendente = 0;
    let leiloesQuitados = 0;

    arrematante.leiloes.forEach((leilao) => {
      const valorBase = leilao.valorPagarNumerico || 0;
      const percentualJuros = leilao.percentualJuros || 5;
      
      totalArrematadoBase += valorBase;
      
      // Inferir tipo de pagamento
      const temEntrada = leilao.valorEntrada || leilao.dataEntrada;
      const tipoPagamento = leilao.tipoPagamento || (temEntrada ? 'entrada_parcelamento' : 'parcelamento');
      
      let valorTotalComJuros = 0;
      
      if (tipoPagamento === 'a_vista') {
        const dataVencimento = leilao.dataVencimentoVista;
        if (dataVencimento && !leilao.pago) {
          valorTotalComJuros = calcularJurosProgressivos(valorBase, dataVencimento, percentualJuros);
        } else {
          valorTotalComJuros = valorBase;
        }
      } else if (tipoPagamento === 'entrada_parcelamento') {
        const valorEntradaBase = parseFloat(leilao.valorEntrada as any) || 0;
        const valorParaParcelas = valorBase - valorEntradaBase;
        
        // Calcular juros da entrada
        const dataEntrada = leilao.dataEntrada;
        const valorEntradaComJuros = dataEntrada && !leilao.pago
          ? calcularJurosProgressivos(valorEntradaBase, dataEntrada, percentualJuros)
          : valorEntradaBase;
        
        // Calcular estrutura de parcelas
        const estruturaParcelas = calcularEstruturaParcelas(
          valorParaParcelas,
          leilao.parcelasTriplas || 0,
          leilao.parcelasDuplas || 0,
          leilao.parcelasSimples || 0,
          leilao.quantidadeParcelas
        );
        
        // Calcular juros de cada parcela
        let totalParcelasComJuros = 0;
        if (leilao.mesInicioPagamento && leilao.diaVencimentoMensal) {
          const [ano, mes] = leilao.mesInicioPagamento.split('-').map(Number);
          estruturaParcelas.forEach((parcela, idx) => {
            const dataVencimento = new Date(ano, mes - 1 + idx, leilao.diaVencimentoMensal!);
            const dataVencimentoStr = dataVencimento.toISOString().split('T')[0];
            const valorParcelaComJuros = leilao.pago ? parcela.valor : calcularJurosProgressivos(parcela.valor, dataVencimentoStr, percentualJuros);
            totalParcelasComJuros += valorParcelaComJuros;
          });
        } else {
          totalParcelasComJuros = valorParaParcelas;
        }
        
        valorTotalComJuros = Number(valorEntradaComJuros) + Number(totalParcelasComJuros);
      } else {
        // Parcelamento simples
        const estruturaParcelas = calcularEstruturaParcelas(
          valorBase,
          leilao.parcelasTriplas || 0,
          leilao.parcelasDuplas || 0,
          leilao.parcelasSimples || 0,
          leilao.quantidadeParcelas
        );
        
        if (leilao.mesInicioPagamento && leilao.diaVencimentoMensal) {
          const [ano, mes] = leilao.mesInicioPagamento.split('-').map(Number);
          estruturaParcelas.forEach((parcela, idx) => {
            const dataVencimento = new Date(ano, mes - 1 + idx, leilao.diaVencimentoMensal!);
            const dataVencimentoStr = dataVencimento.toISOString().split('T')[0];
            const valorParcelaComJuros = leilao.pago ? parcela.valor : calcularJurosProgressivos(parcela.valor, dataVencimentoStr, percentualJuros);
            valorTotalComJuros += valorParcelaComJuros;
          });
        } else {
          valorTotalComJuros = valorBase;
        }
      }
      
      totalArrematado += valorTotalComJuros;

      if (leilao.pago) {
        totalPago += valorTotalComJuros;
        leiloesQuitados++;
      } else {
        // Calcular valor pago parcialmente (sem juros progressivos)
        if ((leilao.parcelasPagas || 0) > 0) {
          const estrutura = calcularEstruturaParcelas(
            valorBase,
            leilao.parcelasTriplas || 0,
            leilao.parcelasDuplas || 0,
            leilao.parcelasSimples || 0,
            leilao.quantidadeParcelas
          );
          const pagoAteAgora = estrutura
            .slice(0, leilao.parcelasPagas)
            .reduce((sum, p) => sum + p.valor, 0);
          totalPago += pagoAteAgora;
          totalPendente += valorTotalComJuros - pagoAteAgora;
        } else {
          totalPendente += valorTotalComJuros;
        }
      }
    });

    const progressoPagamento = totalArrematado > 0 ? (totalPago / totalArrematado) * 100 : 0;
    const totalJurosAcumulados = totalArrematado - totalArrematadoBase;

    return {
      totalLeiloes,
      totalArrematado,
      totalArrematadoBase,
      totalJurosAcumulados,
      totalPago,
      totalPendente,
      leiloesQuitados,
      taxaQuitacao: totalLeiloes > 0 ? (leiloesQuitados / totalLeiloes) * 100 : 0,
      progressoPagamento
    };
  };

  // Analisar histórico de atrasos
  const analisarAtrasos = (arrematante: ArrematanteComHistorico) => {
    const atrasos: Array<{
      leilaoNome: string;
      leilaoData: string;
      diasAtraso: number;
      dataVencimento: string;
      tipo: 'atrasado' | 'pago_com_atraso';
    }> = [];

    const hoje = new Date();

    arrematante.leiloes.forEach(leilao => {
      // Inferir tipo de pagamento
      const temEntrada = leilao.valorEntrada || leilao.dataEntrada;
      const tipoPagamento = leilao.tipoPagamento || (temEntrada ? 'entrada_parcelamento' : 'parcelamento');
      
      // Se o leilão está quitado, verificar se foi pago com atraso
      if (leilao.pago) {
        let dataVencimento: Date;
        
        if (tipoPagamento === "a_vista") {
          // À vista - verificar data de vencimento
          const dataVencimentoStr = leilao.dataVencimentoVista;
          if (dataVencimentoStr) {
            dataVencimento = new Date(dataVencimentoStr + 'T23:59:59');
            // Se hoje é posterior ao vencimento, foi pago com atraso
            if (hoje > dataVencimento) {
              const diasAtraso = Math.floor((hoje.getTime() - dataVencimento.getTime()) / (1000 * 60 * 60 * 24));
              atrasos.push({
                leilaoNome: leilao.leilaoNome,
                leilaoData: leilao.leilaoData,
                diasAtraso,
                dataVencimento: dataVencimento.toLocaleDateString('pt-BR'),
                tipo: 'pago_com_atraso'
              });
            }
          }
        } else {
          // Parcelamento - verificar se última parcela foi paga após o vencimento
          if (leilao.mesInicioPagamento && leilao.diaVencimentoMensal) {
            const [ano, mes] = leilao.mesInicioPagamento.split('-').map(Number);
            const ultimaParcelaIndex = (leilao.quantidadeParcelas || 1) - 1;
            dataVencimento = new Date(ano, mes - 1 + ultimaParcelaIndex, leilao.diaVencimentoMensal, 23, 59, 59);
            
            // Se hoje é posterior ao vencimento da última parcela, foi quitado com atraso
            if (hoje > dataVencimento) {
              const diasAtraso = Math.floor((hoje.getTime() - dataVencimento.getTime()) / (1000 * 60 * 60 * 24));
              atrasos.push({
                leilaoNome: leilao.leilaoNome,
                leilaoData: leilao.leilaoData,
                diasAtraso,
                dataVencimento: dataVencimento.toLocaleDateString('pt-BR'),
                tipo: 'pago_com_atraso'
              });
            }
          }
        }
      } else {
        // Se não está quitado, verificar parcelas/entrada atrasadas atuais
        if (tipoPagamento === 'entrada_parcelamento' && leilao.dataEntrada) {
          // Verificar se entrada está atrasada
          const dataEntrada = new Date(leilao.dataEntrada + 'T23:59:59');
          if (hoje > dataEntrada) {
            const diasAtraso = Math.floor((hoje.getTime() - dataEntrada.getTime()) / (1000 * 60 * 60 * 24));
            atrasos.push({
              leilaoNome: leilao.leilaoNome,
              leilaoData: leilao.leilaoData,
              diasAtraso,
              dataVencimento: dataEntrada.toLocaleDateString('pt-BR'),
              tipo: 'atrasado'
            });
            return; // Não precisa verificar parcelas se entrada está atrasada
          }
        }
        
        // Verificar parcelas atrasadas
        if (leilao.mesInicioPagamento && leilao.diaVencimentoMensal) {
          const [ano, mes] = leilao.mesInicioPagamento.split('-').map(Number);
          const parcelasPagas = leilao.parcelasPagas || 0;
          const quantidadeParcelas = leilao.quantidadeParcelas || 1;

          // Verificar se há parcelas atrasadas (não pagas e vencidas)
          for (let i = parcelasPagas; i < quantidadeParcelas; i++) {
            const dataVencimento = new Date(ano, mes - 1 + i, leilao.diaVencimentoMensal, 23, 59, 59);
            
            if (hoje > dataVencimento) {
              const diasAtraso = Math.floor((hoje.getTime() - dataVencimento.getTime()) / (1000 * 60 * 60 * 24));
              atrasos.push({
                leilaoNome: leilao.leilaoNome,
                leilaoData: leilao.leilaoData,
                diasAtraso,
                dataVencimento: dataVencimento.toLocaleDateString('pt-BR'),
                tipo: 'atrasado'
              });
              break; // Considerar apenas a primeira parcela atrasada por leilão
            }
          }
        }
      }
    });

    return {
      temAtrasos: atrasos.length > 0,
      quantidadeAtrasos: atrasos.length,
      atrasos
    };
  };

  if (selectedArrematante) {
    const stats = calcularEstatisticas(selectedArrematante);
    const historicoAtrasos = analisarAtrasos(selectedArrematante);

    return (
      <div className="p-4 sm:p-6 lg:p-8">
        <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6 lg:space-y-8">
          {/* Botões de Ação */}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <Button
              variant="ghost"
              onClick={() => setSelectedArrematante(null)}
              className="hover:bg-gray-100 hover:text-gray-900 -ml-3"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Voltar
            </Button>
            
            <Button
              onClick={handleDownloadPDF}
              disabled={isGenerating}
              className="bg-gray-900 hover:bg-gray-800 text-white"
            >
              {isGenerating ? (
                <>
                  <Clock className="h-4 w-4 mr-2 animate-spin" />
                  Gerando PDF...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Baixar Histórico
                </>
              )}
            </Button>
          </div>

          {/* Conteúdo para PDF */}
          <div id="historico-content" className="space-y-4 sm:space-y-6 lg:space-y-8">
            {/* Cabeçalho com Nome */}
            <div className="border-b border-gray-200 pb-6">
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-light text-gray-900 mb-2">
                {selectedArrematante.nome}
              </h1>
              <p className="text-sm text-gray-500">
                Histórico completo de participações e dados financeiros
              </p>
            </div>

          {/* Dados de Contato */}
          <div className="border-b border-gray-200 pb-8">
            <h2 className="text-base font-medium text-gray-900 mb-6">Dados de Contato</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-5">
              {selectedArrematante.documento && (
                <div>
                  <p className="text-xs text-gray-500 mb-1.5">CPF/CNPJ</p>
                  <p className="text-sm text-gray-900">{formatCpfCnpj(selectedArrematante.documento)}</p>
                </div>
              )}
              
              {selectedArrematante.email && (
                <div>
                  <p className="text-xs text-gray-500 mb-1.5">E-mail</p>
                  <p className="text-sm text-gray-900">{selectedArrematante.email}</p>
                </div>
              )}
              
              {selectedArrematante.telefone && (
                <div>
                  <p className="text-xs text-gray-500 mb-1.5">Telefone</p>
                  <p className="text-sm text-gray-900">{selectedArrematante.telefone}</p>
                </div>
              )}
              
              {selectedArrematante.endereco && (
                <div className="md:col-span-2">
                  <p className="text-xs text-gray-500 mb-1.5">Endereço</p>
                  <p className="text-sm text-gray-900">{selectedArrematante.endereco}</p>
                </div>
              )}
            </div>
          </div>

          {/* Resumo Financeiro */}
          <div className="border-b border-gray-200 pb-8">
            <h2 className="text-base font-medium text-gray-900 mb-6">Resumo Financeiro</h2>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-8">
              {/* Total de Leilões */}
              <div>
                <p className="text-xs text-gray-500 mb-2">Total de Leilões</p>
                <p className="text-2xl font-light text-gray-900">{stats.totalLeiloes}</p>
              </div>

              {/* Total Arrematado */}
              <div>
                <p className="text-xs text-gray-500 mb-2">Total Arrematado</p>
                <p className="text-xl font-light text-gray-900">{formatCurrency(stats.totalArrematado)}</p>
                {stats.totalJurosAcumulados > 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    +{formatCurrency(stats.totalJurosAcumulados)} juros
                  </p>
                )}
              </div>

              {/* Total Pago */}
              <div>
                <p className="text-xs text-gray-500 mb-2">Total Pago</p>
                <p className="text-xl font-light text-gray-900">{formatCurrency(stats.totalPago)}</p>
              </div>

              {/* Valor Pendente */}
              <div>
                <p className="text-xs text-gray-500 mb-2">Valor Pendente</p>
                <p className="text-xl font-light text-gray-900">{formatCurrency(stats.totalPendente)}</p>
              </div>

              {/* Progresso de Pagamento */}
              <div>
                <p className="text-xs text-gray-500 mb-2">Progresso Pagamento</p>
                <p className="text-2xl font-light text-gray-900">{stats.progressoPagamento.toFixed(1)}%</p>
              </div>

              {/* Taxa de Quitação (Leilões Completos) */}
              <div>
                <p className="text-xs text-gray-500 mb-2">Leilões Quitados</p>
                <p className="text-2xl font-light text-gray-900">{stats.taxaQuitacao.toFixed(0)}%</p>
              </div>
            </div>
            
            {stats.totalJurosAcumulados > 0 && (
              <div className="mt-6 pt-6 border-t border-gray-100">
                <p className="text-xs text-gray-500 italic">
                  * O valor total arrematado inclui juros de mora de 5% ao mês sobre pagamentos em atraso. 
                  Valor base: {formatCurrency(stats.totalArrematadoBase)} + Juros acumulados: {formatCurrency(stats.totalJurosAcumulados)} = Total: {formatCurrency(stats.totalArrematado)}
                </p>
              </div>
            )}
          </div>

          {/* Análise Detalhada do Perfil */}
          <div className="border-b border-gray-200 pb-8">
            <h2 className="text-base font-medium text-gray-900 mb-4">Análise Detalhada do Perfil</h2>
            <div className="space-y-4 text-sm text-gray-700 leading-relaxed">
              <p>
                Este relatório apresenta um histórico completo e detalhado do arrematante <strong>{selectedArrematante.nome}</strong>,{' '}
                incluindo todas as suas participações em leilões realizados através da plataforma. O arrematante está cadastrado{' '}
                no sistema {selectedArrematante.documento && `sob o documento ${formatCpfCnpj(selectedArrematante.documento)}`},{' '}
                e possui um registro de <strong>{stats.totalLeiloes}</strong> {stats.totalLeiloes === 1 ? 'participação' : 'participações'}{' '}
                em eventos de leilão.
              </p>
              
              <p>
                Em termos financeiros, o arrematante acumulou um valor total de arrematações no montante de <strong>{formatCurrency(stats.totalArrematado)}</strong>.{' '}
                Deste valor, já foram pagos <strong>{formatCurrency(stats.totalPago)}</strong>, representando um progresso de pagamento{' '}
                de <strong>{stats.progressoPagamento.toFixed(1)}%</strong> do valor total arrematado. O saldo pendente atual é de <strong>{formatCurrency(stats.totalPendente)}</strong>,{' '}
                distribuído entre os leilões em que houve participação.
              </p>
              
              <p>
                Em relação à quitação completa de leilões, o arrematante possui <strong>{stats.leiloesQuitados}</strong> {stats.leiloesQuitados === 1 ? 'leilão completamente quitado' : 'leilões completamente quitados'}{' '}
                de um total de <strong>{stats.totalLeiloes}</strong> {stats.totalLeiloes === 1 ? 'participação' : 'participações'}, o que representa uma taxa de quitação{' '}
                de <strong>{stats.taxaQuitacao.toFixed(0)}%</strong>. É importante destacar que a taxa de quitação refere-se exclusivamente a leilões{' '}
                com pagamento 100% concluído, enquanto o progresso de pagamento considera parcelas pagas em andamento.
              </p>
              
              <p>
                {stats.leiloesQuitados > 0 ? (
                  <>
                    O histórico de pagamentos demonstra um perfil {stats.taxaQuitacao >= 70 ? 'positivo' : 'regular'} de adimplência,{' '}
                    {stats.taxaQuitacao >= 90 ? 'com excelente' : stats.taxaQuitacao >= 70 ? 'com bom' : 'com'} comprometimento{' '}
                    com as obrigações financeiras assumidas. {stats.leiloesQuitados === 1 ? 'O leilão foi' : `Os ${stats.leiloesQuitados} leilões foram`} integralmente quitados,{' '}
                    demonstrando capacidade de honrar compromissos até a conclusão final.
                  </>
                ) : stats.progressoPagamento > 0 ? (
                  <>
                    {stats.totalLeiloes === 1 ? 'A participação está' : 'As participações estão'} em andamento com pagamentos sendo realizados{' '}
                    conforme os prazos estabelecidos. O histórico atual demonstra comprometimento com o cumprimento das obrigações financeiras.
                  </>
                ) : (
                  <>
                    {stats.totalLeiloes === 1 ? 'A participação está' : 'As participações estão'} programada com pagamentos a serem realizados{' '}
                    conforme os prazos estabelecidos nos contratos de arrematação.
                  </>
                )}
              </p>
            </div>
          </div>

          {/* Histórico de Inadimplência */}
          <div className="border-b border-gray-200 pb-8">
            <h2 className="text-base font-medium text-gray-900 mb-4">Histórico de Inadimplência</h2>
            <div className="space-y-4 text-sm text-gray-700 leading-relaxed">
              {historicoAtrasos.temAtrasos ? (
                <>
                  <p>
                    Durante o histórico de participações do arrematante, foram identificados <strong>{historicoAtrasos.quantidadeAtrasos}</strong>{' '}
                    {historicoAtrasos.quantidadeAtrasos === 1 ? 'episódio de inadimplência' : 'episódios de inadimplência'}.{' '}
                    {historicoAtrasos.atrasos.map((atraso, index) => (
                      <span key={index}>
                        {index > 0 && index === historicoAtrasos.atrasos.length - 1 && ' e '}
                        {index > 0 && index < historicoAtrasos.atrasos.length - 1 && ', '}
                        {index === 0 && historicoAtrasos.quantidadeAtrasos === 1 ? 'Este episódio ocorreu' : index === 0 ? 'Os episódios ocorreram' : ''}
                        {index === 0 && ' '}no leilão <strong>{atraso.leilaoNome}</strong> realizado em <strong>{formatDate(atraso.leilaoData)}</strong>,{' '}
                        onde {atraso.tipo === 'atrasado' ? 'há pagamento pendente' : 'houve pagamento realizado'} com{' '}
                        <strong>{atraso.diasAtraso} {atraso.diasAtraso === 1 ? 'dia' : 'dias'} de atraso</strong> em relação{' '}
                        ao vencimento estabelecido para <strong>{atraso.dataVencimento}</strong>
                        {index === historicoAtrasos.atrasos.length - 1 && '.'}
                      </span>
                    ))}
                  </p>

                  <p>
                    {historicoAtrasos.atrasos.some(a => a.tipo === 'atrasado') ? (
                      <>
                        {historicoAtrasos.atrasos.filter(a => a.tipo === 'atrasado').length === 1 ? 'O pagamento em atraso requer' : 'Os pagamentos em atraso requerem'}{' '}
                        atenção imediata. Recomenda-se contato urgente para regularização das pendências, pois a inadimplência{' '}
                        pode impactar negativamente a avaliação de crédito e as condições de participação em futuros eventos.
                      </>
                    ) : (
                      <>
                        Embora {historicoAtrasos.quantidadeAtrasos === 1 ? 'o pagamento tenha sido realizado' : 'os pagamentos tenham sido realizados'} com atraso,{' '}
                        {historicoAtrasos.quantidadeAtrasos === 1 ? 'a obrigação foi eventualmente quitada' : 'as obrigações foram eventualmente quitadas'}.{' '}
                        Este histórico deve ser considerado em avaliações futuras de crédito e recomenda-se atenção especial{' '}
                        aos prazos estabelecidos em próximas transações.
                      </>
                    )}
                  </p>
                </>
              ) : (
                <p>
                  O arrematante não possui histórico de atrasos em pagamentos registrados no sistema. Todos os pagamentos realizados{' '}
                  foram efetuados dentro dos prazos estabelecidos, demonstrando pontualidade e comprometimento com as obrigações{' '}
                  financeiras assumidas. Este histórico positivo contribui para uma boa avaliação de crédito e fortalece o{' '}
                  relacionamento comercial.
                </p>
              )}
            </div>
          </div>

          {/* Histórico de Participações */}
          <div>
            <div className="mb-6">
              <h2 className="text-base font-medium text-gray-900 mb-1">
                Histórico de Participações
              </h2>
              <p className="text-xs text-gray-500">
                {selectedArrematante.leiloes.length} {selectedArrematante.leiloes.length === 1 ? 'leilão registrado' : 'leilões registrados'}
              </p>
            </div>
            
            <div className="text-sm text-gray-700 leading-relaxed mb-6">
              <p>
                Detalhamento cronológico de todas as participações, incluindo valores arrematados, formas de pagamento{' '}
                e progresso de quitação de cada evento.
              </p>
            </div>

            <div className="space-y-4 sm:space-y-6">
              {selectedArrematante.leiloes.map((leilao, index) => {
                const valorBase = leilao.valorPagarNumerico || 0;
                const percentualJuros = leilao.percentualJuros || 0;
                const isPago = leilao.pago;
                
                // Inferir tipo de pagamento
                const temEntrada = leilao.valorEntrada || leilao.dataEntrada;
                const tipoPagamento = leilao.tipoPagamento || (temEntrada ? 'entrada_parcelamento' : 'parcelamento');
                
                // Calcular valor total com juros
                let valorTotal = 0;
                
                if (tipoPagamento === 'a_vista') {
                  const dataVencimento = leilao.dataVencimentoVista;
                  if (dataVencimento && !isPago) {
                    valorTotal = calcularJurosProgressivos(valorBase, dataVencimento, percentualJuros);
                  } else {
                    valorTotal = valorBase;
                  }
                } else if (tipoPagamento === 'entrada_parcelamento') {
                  const valorEntradaBase = parseFloat(leilao.valorEntrada as any) || 0;
                  const valorParaParcelas = valorBase - valorEntradaBase;
                  
                  const dataEntrada = leilao.dataEntrada;
                  const valorEntradaComJuros = dataEntrada && !isPago
                    ? calcularJurosProgressivos(valorEntradaBase, dataEntrada, percentualJuros)
                    : valorEntradaBase;
                  
                  const estruturaParcelas = calcularEstruturaParcelas(
                    valorParaParcelas,
                    leilao.parcelasTriplas || 0,
                    leilao.parcelasDuplas || 0,
                    leilao.parcelasSimples || 0,
                    leilao.quantidadeParcelas
                  );
                  
                  let totalParcelasComJuros = 0;
                  if (leilao.mesInicioPagamento && leilao.diaVencimentoMensal) {
                    const [ano, mes] = leilao.mesInicioPagamento.split('-').map(Number);
                    estruturaParcelas.forEach((parcela, idx) => {
                      const dataVencimento = new Date(ano, mes - 1 + idx, leilao.diaVencimentoMensal!);
                      const dataVencimentoStr = dataVencimento.toISOString().split('T')[0];
                      const valorParcelaComJuros = isPago ? parcela.valor : calcularJurosProgressivos(parcela.valor, dataVencimentoStr, percentualJuros);
                      totalParcelasComJuros += valorParcelaComJuros;
                    });
                  } else {
                    totalParcelasComJuros = valorParaParcelas;
                  }
                  
                  valorTotal = Number(valorEntradaComJuros) + Number(totalParcelasComJuros);
                } else {
                  const estruturaParcelas = calcularEstruturaParcelas(
                    valorBase,
                    leilao.parcelasTriplas || 0,
                    leilao.parcelasDuplas || 0,
                    leilao.parcelasSimples || 0,
                    leilao.quantidadeParcelas
                  );
                  
                  if (leilao.mesInicioPagamento && leilao.diaVencimentoMensal) {
                    const [ano, mes] = leilao.mesInicioPagamento.split('-').map(Number);
                    estruturaParcelas.forEach((parcela, idx) => {
                      const dataVencimento = new Date(ano, mes - 1 + idx, leilao.diaVencimentoMensal!);
                      const dataVencimentoStr = dataVencimento.toISOString().split('T')[0];
                      const valorParcelaComJuros = isPago ? parcela.valor : calcularJurosProgressivos(parcela.valor, dataVencimentoStr, percentualJuros);
                      valorTotal += valorParcelaComJuros;
                    });
                  } else {
                    valorTotal = valorBase;
                  }
                }
                
                let statusLabel;
                if (isPago) {
                  statusLabel = 'Quitado';
                } else if ((leilao.parcelasPagas || 0) > 0) {
                  statusLabel = 'Em Pagamento';
                } else {
                  statusLabel = 'Pendente';
                }

                // Descrição da forma de pagamento
                let descricaoPagamento = '';
                if (tipoPagamento === 'a_vista') {
                  descricaoPagamento = 'À vista';
                } else if (tipoPagamento === 'entrada_parcelamento') {
                  const valorEntradaBase = parseFloat(leilao.valorEntrada as any) || 0;
                  const quantidadeParcelas = leilao.quantidadeParcelas || 0;
                  descricaoPagamento = `Entrada de ${formatCurrency(valorEntradaBase)} + ${quantidadeParcelas} parcelas`;
                } else {
                  const descricaoParcelas = descreverEstruturaParcelas(
                    leilao.parcelasTriplas || 0,
                    leilao.parcelasDuplas || 0,
                    leilao.parcelasSimples || 0,
                    valorBase
                  );
                  descricaoPagamento = descricaoParcelas;
                }

                return (
                  <div 
                    key={index}
                    className="border-b border-gray-200 pb-6"
                  >
                    {/* Cabeçalho */}
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between mb-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          {leilao.leilaoIdentificacao && (
                            <span className="text-xs text-gray-500">
                              #{leilao.leilaoIdentificacao}
                            </span>
                          )}
                          <span className="text-xs text-gray-400">•</span>
                          <span className="text-xs text-gray-500">
                            {formatDate(leilao.leilaoData)}
                          </span>
                          <span className="text-xs text-gray-400">•</span>
                          <span className="text-xs text-gray-600">
                            {statusLabel}
                          </span>
                        </div>
                        <h3 className="text-base font-normal text-gray-900">
                          {leilao.leilaoNome}
                        </h3>
                      </div>
                    </div>

                    {/* Informações */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-4 mt-4">
                      <div>
                        <p className="text-xs text-gray-500 mb-1">Valor Total</p>
                        <p className="text-2xl font-light text-gray-900">
                          {formatCurrency(valorTotal)}
                        </p>
                        {valorTotal > valorBase && (
                          <p className="text-xs text-gray-500 mt-1">
                            Base: {formatCurrency(valorBase)} + Juros: {formatCurrency(valorTotal - valorBase)}
                          </p>
                        )}
                      </div>

                      <div>
                        <p className="text-xs text-gray-500 mb-1">Forma de Pagamento</p>
                        <p className="text-sm text-gray-900">
                          {descricaoPagamento}
                        </p>
                        {percentualJuros > 0 && !isPago && (
                          <p className="text-xs text-gray-500 mt-1">
                            Juros: {percentualJuros}%/mês
                          </p>
                        )}
                      </div>

                      {!isPago && (
                        <div>
                          <p className="text-xs text-gray-500 mb-1">Progresso</p>
                          <p className="text-sm text-gray-900 mb-2">
                            {leilao.parcelasPagas || 0} de {leilao.quantidadeParcelas || 1} parcelas
                          </p>
                          <div className="w-full bg-gray-100 h-1">
                            <div 
                              className="bg-gray-900 h-1"
                              style={{ 
                                width: `${((leilao.parcelasPagas || 0) / (leilao.quantidadeParcelas || 1)) * 100}%` 
                              }}
                            ></div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Considerações Finais */}
          <div className="border-t border-gray-200 pt-4 sm:pt-6 lg:pt-8">
            <h2 className="text-base font-medium text-gray-900 mb-4">Considerações Finais</h2>
            <div className="space-y-4 text-sm text-gray-700 leading-relaxed">
              <p>
                Este documento constitui um registro oficial e completo do histórico de participações{' '}
                na plataforma de leilões. Todas as informações apresentadas são baseadas nos dados cadastrais{' '}
                e transacionais registrados no sistema até a data de geração deste relatório.
              </p>
              
              <p>
                O sistema mantém registro atualizado de todas as transações, pagamentos e status de cada participação,{' '}
                garantindo transparência e rastreabilidade das operações. Este relatório pode ser utilizado para{' '}
                fins de auditoria, controle financeiro, análise de crédito e acompanhamento do relacionamento comercial.
              </p>
              
              <div className="mt-6 pt-6 pb-8 border-t border-gray-100 text-xs text-gray-500 text-center">
                <p>Documento gerado automaticamente pelo sistema de gestão de leilões</p>
                <p className="mt-1">Data de geração: {new Date().toLocaleDateString('pt-BR', { 
                  day: '2-digit', 
                  month: '2-digit', 
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}</p>
              </div>
            </div>
          </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 sm:px-8 md:px-20 py-16">
      <div className="w-full max-w-2xl space-y-12">
        {/* Título */}
        <div>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-normal text-gray-900 leading-tight">
              Buscar Histórico
            </h1>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setShowAllBidders(!showAllBidders);
                  if (!showAllBidders) {
                    setSearchText('');
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
              : `Digite o ${searchMode === 'cpf' ? 'CPF ou CNPJ' : 'nome'} para buscar o histórico completo de um arrematante`
            }
          </p>
        </div>

        {/* Campo de Busca */}
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
                setSearchText('');
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
            value={searchText}
            onChange={(e) => {
              let formatted;
              if (searchMode === 'cpf') {
                formatted = formatCpfCnpj(e.target.value);
              } else {
                formatted = e.target.value.replace(/[0-9]/g, '');
              }
              setSearchText(formatted);
            }}
            className="h-14 text-base border-0 border-b-2 border-gray-200 rounded-none focus-visible:border-gray-800 focus-visible:ring-0 focus-visible:outline-none px-0 bg-transparent placeholder:text-gray-400"
          />
          {searchText && arrematantesFiltrados.length === 0 && (
            <p className="text-sm text-amber-600 flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              {searchMode === 'cpf' 
                ? 'Nenhum arrematante encontrado com este CPF/CNPJ'
                : 'Nenhum arrematante encontrado com este nome'
              }
            </p>
          )}
        </div>

        {/* Título dos Resultados */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-xl sm:text-2xl lg:text-3xl font-normal text-gray-900">
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

        {/* Lista de Arrematantes */}
        {(searchText || showAllBidders) && arrematantesFiltrados.length > 0 && (
          <div className="space-y-3">
            {arrematantesFiltrados.map((arrematante, index) => (
              <div 
                key={index}
                onClick={() => {
                  setSelectedArrematante(arrematante);
                  try {
                    logBidderAction('view', arrematante.nome, arrematante.leiloes?.[0]?.leilaoNome || 'Histórico', arrematante.leiloes?.[0]?.leilaoId || '', {
                      metadata: { context: 'historico', leiloes_count: arrematante.leiloes?.length }
                    });
                  } catch { /* silenciar erro de log */ }
                }}
                className="group p-5 border border-gray-200 rounded-xl cursor-pointer hover:border-gray-400 hover:shadow-sm transition-all duration-200 bg-white"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-medium text-gray-900 truncate group-hover:text-gray-950">{arrematante.nome}</h3>
                    <div className="mt-2 space-y-1">
                      {arrematante.documento && (
                        <p className="text-sm text-gray-600">{formatCpfCnpj(arrematante.documento)}</p>
                      )}
                      {arrematante.email && (
                        <p className="text-sm text-gray-500 truncate">{arrematante.email}</p>
                      )}
                    </div>
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Participações</p>
                      <p className="text-sm text-gray-600">{arrematante.leiloes.length} {arrematante.leiloes.length === 1 ? 'leilão' : 'leilões'}</p>
                    </div>
                  </div>
                  <div className="ml-4 flex-shrink-0">
                    <svg 
                      className="h-5 w-5 text-gray-400 group-hover:text-gray-900 group-hover:translate-x-0.5 transition-all" 
                      fill="none" 
                      viewBox="0 0 24 24" 
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
