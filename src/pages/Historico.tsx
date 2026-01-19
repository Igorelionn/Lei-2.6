import { useState, useMemo, useEffect } from "react";
import { useSupabaseAuctions } from "@/hooks/use-supabase-auctions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Users,
  ArrowLeftRight,
  AlertCircle,
  Calendar,
  DollarSign,
  CheckCircle,
  Clock,
  Mail,
  Phone,
  MapPin,
  FileText,
  Package,
  TrendingUp,
  CreditCard,
  ArrowLeft,
  Download
} from "lucide-react";
import { Arrematante } from "@/lib/types";
import { calcularEstruturaParcelas, calcularJurosProgressivos, descreverEstruturaParcelas } from "@/lib/parcelamento-calculator";
import html2pdf from 'html2pdf.js';
import { useToast } from "@/hooks/use-toast";

export default function Historico() {
  const { auctions } = useSupabaseAuctions();
  const { toast } = useToast();
  const [searchText, setSearchText] = useState("");
  const [searchMode, setSearchMode] = useState<'cpf' | 'nome'>('cpf');
  const [showAllBidders, setShowAllBidders] = useState(false);
  const [selectedArrematante, setSelectedArrematante] = useState<Arrematante | null>(null);
  const [isHoveringButton, setIsHoveringButton] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

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
    
    const arrematantesMap = new Map<string, Arrematante & { leiloes: any[] }>();
    
    auctions.forEach(auction => {
      if (auction.arrematante && auction.arrematante.documento) {
        const doc = auction.arrematante.documento;
        
        if (arrematantesMap.has(doc)) {
          // Adicionar leilão à lista existente
          arrematantesMap.get(doc)!.leiloes.push({
            leilaoId: auction.id,
            leilaoNome: auction.nome,
            leilaoIdentificacao: auction.identificacao,
            leilaoData: auction.dataInicio,
            leilaoStatus: auction.status,
            ...auction.arrematante
          });
        } else {
          // Criar novo registro
          arrematantesMap.set(doc, {
            ...auction.arrematante,
            leiloes: [{
              leilaoId: auction.id,
              leilaoNome: auction.nome,
              leilaoIdentificacao: auction.identificacao,
              leilaoData: auction.dataInicio,
              leilaoStatus: auction.status,
              ...auction.arrematante
            }]
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
        margin: [0.5, 0.5, 0.5, 0.5],
        filename: `historico-${selectedArrematante.nome.replace(/\s+/g, '-')}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { 
          scale: 2,
          useCORS: true,
          letterRendering: true,
          windowWidth: 1200,
          scrollY: 0,
          scrollX: 0
        },
        jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
      };

      await html2pdf().set(opt).from(element).save();
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      toast({
        title: "Erro ao gerar PDF",
        description: "Não foi possível gerar o relatório. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  // Calcular estatísticas do arrematante
  const calcularEstatisticas = (arrematante: Arrematante & { leiloes: any[] }) => {
    const totalLeiloes = arrematante.leiloes.length;
    let totalArrematado = 0;
    let totalPago = 0;
    let totalPendente = 0;
    let leiloesQuitados = 0;

    arrematante.leiloes.forEach(leilao => {
      const valor = leilao.valorPagarNumerico || 0;
      totalArrematado += valor;

      if (leilao.pago) {
        totalPago += valor;
        leiloesQuitados++;
      } else {
        // Calcular valor pago parcialmente
        if ((leilao.parcelasPagas || 0) > 0) {
          const estrutura = calcularEstruturaParcelas(
            valor,
            leilao.parcelasTriplas || 0,
            leilao.parcelasDuplas || 0,
            leilao.parcelasSimples || 0
          );
          const pagoAteAgora = estrutura
            .slice(0, leilao.parcelasPagas)
            .reduce((sum, p) => sum + p.valor, 0);
          totalPago += pagoAteAgora;
          totalPendente += valor - pagoAteAgora;
        } else {
          totalPendente += valor;
        }
      }
    });

    const progressoPagamento = totalArrematado > 0 ? (totalPago / totalArrematado) * 100 : 0;

    return {
      totalLeiloes,
      totalArrematado,
      totalPago,
      totalPendente,
      leiloesQuitados,
      taxaQuitacao: totalLeiloes > 0 ? (leiloesQuitados / totalLeiloes) * 100 : 0,
      progressoPagamento
    };
  };

  // Analisar histórico de atrasos
  const analisarAtrasos = (arrematante: Arrematante & { leiloes: any[] }) => {
    const atrasos: Array<{
      leilaoNome: string;
      leilaoData: string;
      diasAtraso: number;
      dataVencimento: string;
    }> = [];

    const hoje = new Date();

    arrematante.leiloes.forEach(leilao => {
      if (!leilao.pago && leilao.mesInicioPagamento && leilao.diaVencimentoMensal) {
        const [ano, mes] = leilao.mesInicioPagamento.split('-').map(Number);
        const parcelasPagas = leilao.parcelasPagas || 0;
        const quantidadeParcelas = leilao.quantidadeParcelas || 1;

        // Verificar se há parcelas atrasadas
        for (let i = parcelasPagas; i < quantidadeParcelas; i++) {
          const dataVencimento = new Date(ano, mes - 1 + i, leilao.diaVencimentoMensal, 23, 59, 59);
          
          if (hoje > dataVencimento) {
            const diasAtraso = Math.floor((hoje.getTime() - dataVencimento.getTime()) / (1000 * 60 * 60 * 24));
            atrasos.push({
              leilaoNome: leilao.leilaoNome,
              leilaoData: leilao.leilaoData,
              diasAtraso,
              dataVencimento: dataVencimento.toLocaleDateString('pt-BR')
            });
            break; // Considerar apenas a primeira parcela atrasada por leilão
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
      <div className="p-8">
        <div className="max-w-4xl mx-auto space-y-8">
          {/* Botões de Ação */}
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              onClick={() => setSelectedArrematante(null)}
              className="hover:bg-gray-50 -ml-3"
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
          <div id="historico-content" className="space-y-8">
            {/* Cabeçalho com Nome */}
            <div className="border-b border-gray-200 pb-6">
              <h1 className="text-3xl font-light text-gray-900 mb-2">
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
            
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-8">
              {/* Total de Leilões */}
              <div>
                <p className="text-xs text-gray-500 mb-2">Total de Leilões</p>
                <p className="text-2xl font-light text-gray-900">{stats.totalLeiloes}</p>
              </div>

              {/* Total Arrematado */}
              <div>
                <p className="text-xs text-gray-500 mb-2">Total Arrematado</p>
                <p className="text-xl font-light text-gray-900">{formatCurrency(stats.totalArrematado)}</p>
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
                    O histórico de pagamentos do arrematante demonstra um perfil {stats.taxaQuitacao >= 70 ? 'positivo' : 'regular'} de adimplência,{' '}
                    {stats.taxaQuitacao >= 90 ? 'com excelente' : stats.taxaQuitacao >= 70 ? 'com bom' : 'com'} comprometimento{' '}
                    com as obrigações financeiras assumidas. O arrematante já concluiu integralmente o pagamento{' '}
                    {stats.leiloesQuitados === 1 ? 'de um leilão' : `de ${stats.leiloesQuitados} leilões`}, demonstrando capacidade de honrar{' '}
                    seus compromissos até a quitação final.
                  </>
                ) : stats.progressoPagamento > 0 ? (
                  <>
                    O arrematante possui {stats.totalLeiloes} {stats.totalLeiloes === 1 ? 'participação ativa' : 'participações ativas'}{' '}
                    no sistema, com pagamentos em andamento conforme os prazos estabelecidos. Embora ainda não tenha concluído{' '}
                    a quitação completa de nenhum leilão, já realizou o pagamento de <strong>{stats.progressoPagamento.toFixed(1)}%</strong>{' '}
                    do valor total arrematado, demonstrando comprometimento com as obrigações assumidas.
                  </>
                ) : (
                  <>
                    O arrematante possui {stats.totalLeiloes} {stats.totalLeiloes === 1 ? 'participação ativa' : 'participações ativas'}{' '}
                    no sistema, com pagamentos programados conforme os prazos estabelecidos nos respectivos contratos de arrematação.
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
                    {historicoAtrasos.quantidadeAtrasos === 1 ? 'registro de atraso' : 'registros de atraso'} em pagamentos.{' '}
                    {historicoAtrasos.quantidadeAtrasos === 1 
                      ? 'Este atraso está relacionado ao seguinte leilão:' 
                      : 'Estes atrasos estão relacionados aos seguintes leilões:'}
                  </p>

                  <div className="space-y-3 mt-4">
                    {historicoAtrasos.atrasos.map((atraso, index) => (
                      <div key={index} className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                        <div className="flex items-start justify-between mb-2">
                          <h3 className="text-sm font-medium text-gray-900">{atraso.leilaoNome}</h3>
                          <span className="text-xs text-red-600 font-medium bg-red-50 px-2 py-1 rounded">
                            {atraso.diasAtraso} {atraso.diasAtraso === 1 ? 'dia' : 'dias'} de atraso
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-xs text-gray-600">
                          <div>
                            <span className="text-gray-500">Data do Leilão:</span>
                            <span className="ml-1 text-gray-900">{formatDate(atraso.leilaoData)}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">Vencimento:</span>
                            <span className="ml-1 text-gray-900">{atraso.dataVencimento}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <p className="mt-4">
                    É importante destacar que {historicoAtrasos.quantidadeAtrasos === 1 ? 'este atraso pode' : 'estes atrasos podem'} impactar{' '}
                    a avaliação de crédito e o relacionamento comercial com o arrematante. Recomenda-se acompanhamento próximo{' '}
                    e comunicação regular para regularização das pendências e estabelecimento de acordos de pagamento quando necessário.
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
                A seguir, apresentamos o detalhamento cronológico de todas as participações do arrematante em leilões.{' '}
                Para cada evento, são fornecidas informações sobre o valor arrematado, a forma de pagamento acordada,{' '}
                o status atual do pagamento e o progresso de quitação. Estas informações permitem uma visão completa{' '}
                da trajetória do arrematante e do cumprimento de suas obrigações financeiras ao longo do tempo.
              </p>
            </div>

            <div className="space-y-6">
              {selectedArrematante.leiloes.map((leilao, index) => {
                const valorTotal = leilao.valorPagarNumerico || 0;
                const isPago = leilao.pago;
                
                let statusLabel;
                if (isPago) {
                  statusLabel = 'Quitado';
                } else if ((leilao.parcelasPagas || 0) > 0) {
                  statusLabel = 'Em Pagamento';
                } else {
                  statusLabel = 'Pendente';
                }

                const descricaoParcelas = descreverEstruturaParcelas(
                  leilao.parcelasTriplas || 0,
                  leilao.parcelasDuplas || 0,
                  leilao.parcelasSimples || 0,
                  valorTotal
                );

                return (
                  <div 
                    key={index}
                    className="border-b border-gray-200 pb-6"
                  >
                    {/* Cabeçalho */}
                    <div className="flex items-start justify-between mb-4">
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
                      </div>

                      <div>
                        <p className="text-xs text-gray-500 mb-1">Forma de Pagamento</p>
                        <p className="text-sm text-gray-900">
                          {leilao.quantidadeParcelas > 1 
                            ? descricaoParcelas
                            : 'À vista'}
                        </p>
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
          <div className="border-t border-gray-200 pt-8">
            <h2 className="text-base font-medium text-gray-900 mb-4">Considerações Finais</h2>
            <div className="space-y-4 text-sm text-gray-700 leading-relaxed">
              <p>
                Este documento constitui um registro oficial e completo do histórico de participações do arrematante
                {' '}<strong>{selectedArrematante.nome}</strong> na plataforma de leilões. Todas as informações aqui apresentadas 
                são baseadas nos dados cadastrais e transacionais registrados no sistema até a data de geração deste relatório.
              </p>
              
              <p>
                {selectedArrematante.email || selectedArrematante.telefone ? (
                  <>
                    Para contato com o arrematante, estão disponíveis os seguintes dados:
                    {selectedArrematante.email && <> e-mail: <strong>{selectedArrematante.email}</strong></>}
                    {selectedArrematante.email && selectedArrematante.telefone && ', '}
                    {selectedArrematante.telefone && <> telefone: <strong>{selectedArrematante.telefone}</strong></>}.
                  </>
                ) : (
                  'Os dados de contato do arrematante não estão disponíveis no cadastro atual.'
                )}
                {selectedArrematante.endereco && (
                  <> O endereço cadastrado é: <strong>{selectedArrematante.endereco}</strong>.</>
                )}
              </p>
              
              <p>
                O sistema mantém registro atualizado de todas as transações, pagamentos e status de cada participação,{' '}
                garantindo a transparência e rastreabilidade de todas as operações realizadas. Este relatório pode ser{' '}
                utilizado para fins de auditoria, controle financeiro, análise de crédito e acompanhamento de relacionamento{' '}
                com o arrematante.
              </p>
              
              <div className="mt-6 pt-6 border-t border-gray-100 text-xs text-gray-500 text-center">
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
    <div className="min-h-screen flex items-center justify-center px-8 md:px-20 py-16">
      <div className="w-full max-w-2xl space-y-12">
        {/* Título */}
        <div>
          <div className="flex items-center gap-4">
            <h1 className="text-3xl md:text-4xl font-normal text-gray-900 leading-tight">
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

        {/* Lista de Arrematantes */}
        {(searchText || showAllBidders) && arrematantesFiltrados.length > 0 && (
          <div className="space-y-3">
            {arrematantesFiltrados.map((arrematante, index) => (
              <div 
                key={index}
                onClick={() => setSelectedArrematante(arrematante)}
                className="group p-5 border border-gray-200 rounded-xl cursor-pointer hover:border-gray-400 hover:shadow-sm transition-all duration-200 bg-white"
              >
                <div className="flex items-center justify-between">
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
