import React, { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { logger } from "@/lib/logger";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import html2pdf from 'html2pdf.js';
import { escapeHtml } from "@/lib/secure-utils"; // 🔒 SEGURANÇA: Escape HTML para prevenir XSS
import {
  ArrowLeft,
  FileText,
  Download,
  Calendar,
  BarChart3,
  TrendingUp,
  DollarSign,
  Users,
  Package,
  Gavel,
  Clock,
  CreditCard
} from "lucide-react";
import { useSupabaseAuctions } from "@/hooks/use-supabase-auctions";
import { useActivityLogger } from "@/hooks/use-activity-logger";
import { StringDatePicker } from "@/components/ui/date-picker";
import { ArrematanteInfo, Auction, LoteInfo, MercadoriaInfo, ItemCustoInfo, ItemPatrocinioInfo } from "@/lib/types";
import { calcularEstruturaParcelas } from "@/lib/parcelamento-calculator";

// Função para verificar se um arrematante está inadimplente (considera tipos de pagamento)
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
      if (parcelasPagas >= (1 + quantidadeParcelas)) return false;
      
      if (parcelasPagas === 0) {
        // Entrada não foi paga - verificar se está atrasada
        if (!loteArrematado.dataEntrada) return false;
        const dateStr = loteArrematado.dataEntrada;
        const [year, month, day] = dateStr.split('-').map(Number);
        const entradaDueDate = new Date(year, month - 1, day);
        entradaDueDate.setHours(23, 59, 59, 999);
        return now > entradaDueDate;
      } else {
        // Entrada foi paga - verificar se há parcelas atrasadas
        if (!arrematante.mesInicioPagamento || !arrematante.diaVencimentoMensal) return false;
        const [startYear, startMonth] = arrematante.mesInicioPagamento.split('-').map(Number);
        
        // Verificar todas as parcelas que deveriam ter sido pagas até agora
        const parcelasEfetivasPagas = parcelasPagas - 1; // -1 porque a primeira "parcela paga" é a entrada
        
        for (let i = 0; i < quantidadeParcelas; i++) {
          const parcelaDate = new Date(startYear, startMonth - 1 + i, arrematante.diaVencimentoMensal);
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
      if (!arrematante.mesInicioPagamento || !arrematante.diaVencimentoMensal) return false;
      
      const [startYear, startMonth] = arrematante.mesInicioPagamento.split('-').map(Number);
      const parcelasPagas = arrematante.parcelasPagas || 0;
      const quantidadeParcelas = arrematante.quantidadeParcelas || 12;
      
      if (parcelasPagas >= quantidadeParcelas) return false;
      
      const nextPaymentDate = new Date(startYear, startMonth - 1 + parcelasPagas, arrematante.diaVencimentoMensal);
      nextPaymentDate.setHours(23, 59, 59, 999);
      return now > nextPaymentDate;
    }
  }
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

// Função auxiliar para calcular valor total com juros
const calcularValorTotalComJuros = (arrematante: ArrematanteInfo, auction: Auction): number => {
  if (!arrematante) return 0;
  
  const valorBase = arrematante.valorPagarNumerico || parseFloat(arrematante.valorPagar?.replace(/[^\d,]/g, '').replace(',', '.') || '0');
  const percentualJuros = arrematante.percentualJurosAtraso || 0;
  
  if (percentualJuros === 0) {
    return valorBase;
  }
  
  const loteArrematado = arrematante?.loteId 
    ? auction.lotes?.find(lote => lote.id === arrematante.loteId)
    : null;
  const tipoPagamento = loteArrematado?.tipoPagamento || auction.tipoPagamento;
  
  let valorTotalComJuros = 0;
  
  if (tipoPagamento === 'a_vista') {
    // Para pagamento à vista
    const dataVencimento = loteArrematado?.dataVencimentoVista || auction?.dataVencimentoVista;
    if (dataVencimento) {
      valorTotalComJuros = calcularJurosProgressivos(valorBase, dataVencimento, percentualJuros);
    } else {
      valorTotalComJuros = valorBase;
    }
  } else if (tipoPagamento === 'entrada_parcelamento') {
    // Para entrada + parcelamento
    const quantidadeParcelas = arrematante.quantidadeParcelas || 12;
    const mesInicioPagamento = arrematante.mesInicioPagamento;
    
    if (mesInicioPagamento) {
      const valorEntradaBase = arrematante.valorEntrada ? 
        (typeof arrematante.valorEntrada === 'string' ? 
          parseFloat(arrematante.valorEntrada.replace(/[^\d,]/g, '').replace(',', '.')) : 
          arrematante.valorEntrada) : 
        valorBase * 0.3;
      
      // Calcular estrutura de parcelas usando configuração real (triplas, duplas, simples)
      const estruturaParcelas = calcularEstruturaParcelas(
        valorBase,
        arrematante.parcelasTriplas || 0,
        arrematante.parcelasDuplas || 0,
        arrematante.parcelasSimples || 0
      );
      
      // Calcular juros da entrada
      const dataEntrada = loteArrematado?.dataEntrada || auction.dataEntrada;
      if (dataEntrada) {
        valorTotalComJuros += calcularJurosProgressivos(valorEntradaBase, dataEntrada, percentualJuros);
      } else {
        valorTotalComJuros += valorEntradaBase;
      }
      
      // Calcular juros de cada parcela usando valor real da estrutura
      const [startYear, startMonth] = mesInicioPagamento.split('-').map(Number);
      for (let i = 0; i < quantidadeParcelas; i++) {
        const dataVencimento = new Date(startYear, startMonth - 1 + i, arrematante.diaVencimentoMensal || 15);
        const dataVencimentoStr = dataVencimento.toISOString().split('T')[0];
        const valorRealParcela = estruturaParcelas[i]?.valor || 0;
        valorTotalComJuros += calcularJurosProgressivos(valorRealParcela, dataVencimentoStr, percentualJuros);
      }
    } else {
      valorTotalComJuros = valorBase;
    }
  } else {
    // Para parcelamento simples
    const quantidadeParcelas = arrematante.quantidadeParcelas || 1;
    const mesInicioPagamento = arrematante.mesInicioPagamento;
    
    if (mesInicioPagamento && quantidadeParcelas > 0) {
      // Calcular estrutura de parcelas usando configuração real (triplas, duplas, simples)
      const estruturaParcelas = calcularEstruturaParcelas(
        valorBase,
        arrematante.parcelasTriplas || 0,
        arrematante.parcelasDuplas || 0,
        arrematante.parcelasSimples || 0
      );
      
      const [startYear, startMonth] = mesInicioPagamento.split('-').map(Number);
      
      for (let i = 0; i < quantidadeParcelas; i++) {
        const dataVencimento = new Date(startYear, startMonth - 1 + i, arrematante.diaVencimentoMensal || 15);
        const dataVencimentoStr = dataVencimento.toISOString().split('T')[0];
        const valorRealParcela = estruturaParcelas[i]?.valor || 0;
        valorTotalComJuros += calcularJurosProgressivos(valorRealParcela, dataVencimentoStr, percentualJuros);
      }
    } else {
      valorTotalComJuros = valorBase;
    }
  }
  
  return valorTotalComJuros;
};

interface RelatorioConfig {
  tipo: string;
  periodo: {
    inicio: string;
    fim: string;
  };
  filtros: {
    status?: string;
    local?: string;
    incluirArquivados?: boolean;
    dataInicio?: string;
    dataFim?: string;
  };
  formato: 'pdf' | 'excel' | 'csv';
}

function Relatorios() {
  const _navigate = useNavigate();
  const { auctions, isLoading } = useSupabaseAuctions();
  const { logReportAction } = useActivityLogger();
  const [config, setConfig] = useState<RelatorioConfig>({
    tipo: "",
    periodo: {
      inicio: "",
      fim: ""
    },
    filtros: {
      status: "todos",
      local: "todos",
      incluirArquivados: false
    },
    formato: 'pdf'
  });
  const [isGenerating, setIsGenerating] = useState(false);
  
  // Estados para o modal de preview
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [previewType, setPreviewType] = useState<'leiloes' | 'inadimplencia' | 'historico' | 'faturas'>('leiloes');
  const [paymentTypeFilter, setPaymentTypeFilter] = useState<'todos' | 'a_vista' | 'parcelamento' | 'entrada_parcelamento'>('todos');
  
  // Filtros de consideração do gráfico (toggles)
  const [considerarComissaoCompra, setConsiderarComissaoCompra] = useState(true); // Comissão de compra (leiloeiro/assessor) nas despesas
  const [considerarComissaoVenda, setConsiderarComissaoVenda] = useState(true); // Apenas comissão de venda para lotes de convidados
  const [considerarPatrocinios, setConsiderarPatrocinios] = useState(true); // Patrocínios no faturamento
  
  // Estado para o gráfico de evolução
  const [hoveredPoint, setHoveredPoint] = useState<{ x: number; y: number; label: string; index: number; faturamento: number; despesas: number; mes?: string } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const dadosGraficoRef = useRef<Array<{ faturamento: number; despesas: number; mes: string; x?: number; y?: number; label?: string }>>([]);
  
  // Handler fluido de mouse para o gráfico
  const handleChartMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg || dadosGraficoRef.current.length === 0) return;
    
    const rect = svg.getBoundingClientRect();
    const scaleX = 1450 / rect.width;
    const mouseX = (e.clientX - rect.left) * scaleX;
    
    const dados = dadosGraficoRef.current;
    const quantidadePeriodos = dados.length;
    const larguraDisponivel = 1430 - 80;
    const larguraSegmento = larguraDisponivel / quantidadePeriodos;
    
    // Descobrir em qual segmento o mouse está
    const segmentoIndex = Math.floor((mouseX - 80) / larguraSegmento);
    
    if (segmentoIndex >= 0 && segmentoIndex < quantidadePeriodos && mouseX >= 80 && mouseX <= 1430) {
      const d = dados[segmentoIndex];
      // Só atualizar se mudou de índice para evitar re-renders desnecessários
      if (!hoveredPoint || hoveredPoint.index !== segmentoIndex) {
        setHoveredPoint({ index: segmentoIndex, ...d });
      }
    } else {
      if (hoveredPoint) setHoveredPoint(null);
    }
  }, [hoveredPoint]);
  
  const handleChartMouseLeave = useCallback(() => {
    setHoveredPoint(null);
  }, []);
  
  // Estados para o modal de PDF temporário (invisível)
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [selectedAuctionForExport, setSelectedAuctionForExport] = useState<string>("");

  // Tipos de relatórios disponíveis
  const tiposRelatorio = [
    { id: 'leiloes', nome: 'Leilões', icon: Gavel, descricao: 'Lista completa de leilões com detalhes e status', categoria: 'Operacional' },
    { id: 'financeiro', nome: 'Financeiro', icon: DollarSign, descricao: 'Receitas, custos e análise de lucros', categoria: 'Financeiro' },
    { id: 'arrematantes', nome: 'Arrematantes', icon: Users, descricao: 'Perfil dos compradores e histórico de pagamentos', categoria: 'Clientes' },
    { id: 'lotes', nome: 'Lotes', icon: Package, descricao: 'Inventário completo e status dos itens', categoria: 'Operacional' },
    { id: 'performance', nome: 'Performance', icon: TrendingUp, descricao: 'Métricas de desempenho e análise de tendências', categoria: 'Análise' },
    { id: 'agenda', nome: 'Agenda', icon: Calendar, descricao: 'Cronograma de eventos e planejamento', categoria: 'Planejamento' }
  ];

  // Estatísticas rápidas
  const _stats = {
    totalLeiloes: auctions?.filter(a => !a.arquivado).length || 0,
    leiloesAtivos: auctions?.filter(a => a.status === 'em_andamento').length || 0,
    totalReceita: auctions?.reduce((sum, a) => {
      const custos = typeof a.custos === 'string' ? 
        parseFloat(a.custos.replace(/[^\d,]/g, '').replace(',', '.')) || 0 : 
        a.custos || 0;
      return sum + custos;
    }, 0) || 0,
    totalArrematantes: auctions?.reduce((sum, a) => {
      if (a.arquivado) return sum;
      const arrematantes = a.arrematantes || (a.arrematante ? [a.arrematante] : []);
      return sum + arrematantes.length;
    }, 0) || 0
  };

  const _formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  // Função para abrir preview de relatório de leilões
  const openLeiloesPreview = () => {
    setPreviewType('leiloes');
    setIsPreviewModalOpen(true);
  };

  // Função para abrir preview de outros relatórios
  const openGenericPreview = (type: 'inadimplencia' | 'historico' | 'faturas') => {
    setPreviewType(type);
    setIsPreviewModalOpen(true);
  };

  // Função para gerar PDF de todos os leilões - usando o mesmo método que funciona
  const generateLeiloesReport = async () => {
    logger.debug('🔍 Iniciando geração do relatório de leilões...');
    logger.debug(`📊 Leilões disponíveis: ${auctions?.length}`);

    if (!auctions || auctions.length === 0) {
      return;
    }

    try {
      setIsGenerating(true);
      
      // Filtrar apenas leilões não arquivados
      const leiloesAtivos = auctions.filter(a => !a.arquivado);
      logger.debug('📈 Leilões ativos (não arquivados):', leiloesAtivos.length);
      
      if (leiloesAtivos.length === 0) {
        return;
      }

      // Usar o mesmo método que funciona na página leilões
      // 1. Abrir modal temporário com o primeiro leilão
      setSelectedAuctionForExport(leiloesAtivos[0].id);
      setIsExportModalOpen(true);
      
      // 2. Aguardar renderização do componente React
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // 3. Pegar o elemento que foi renderizado pelo React
      const element = document.getElementById('pdf-content');
      if (!element) {
        throw new Error('Elemento PDF não encontrado - modal não renderizou');
      }

      logger.debug('📄 Elemento encontrado:', element);
      logger.debug(`📐 Dimensões: ${element.offsetWidth} x ${element.offsetHeight}`);

      // 4. Usar html2pdf importado estaticamente

      const opt = {
        margin: [10, 10, 10, 10] as [number, number, number, number],
        filename: `relatorio-completo-leiloes-${new Date().toISOString().split('T')[0]}.pdf`,
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

      logger.debug('🔄 Iniciando conversão para PDF...');
      
      // 5. Gerar PDF do elemento renderizado pelo React (mesmo método que funciona)
      await html2pdf().set(opt).from(element).save();
      
    } catch (error) {
      logger.error('❌ Erro ao gerar relatório:', error);
    } finally {
      setIsGenerating(false);
      // Sempre fechar o modal no final
      setIsExportModalOpen(false);
      setSelectedAuctionForExport("");
    }
  };

  // Função auxiliar para criar conteúdo PDF de um leilão específico
  const _createPdfContentForAuction = (auction: Auction) => {
    const formatDate = (dateString?: string) => {
      if (!dateString) return 'Não informado';
      try {
        return new Date(dateString + 'T00:00:00').toLocaleDateString('pt-BR');
      } catch {
        return 'Data inválida';
      }
    };

    const getStatusLabel = (status: string) => {
      switch (status) {
        case 'agendado': return 'Agendado';
        case 'em_andamento': return 'Em Andamento';
        case 'finalizado': return 'Finalizado';
        default: return status || 'Não informado';
      }
    };

    const getLocalLabel = (local: string) => {
      switch (local) {
        case 'presencial': return 'Presencial';
        case 'online': return 'Online';
        case 'hibrido': return 'Híbrido';
        default: return local || 'Não informado';
      }
    };

    const formatCurrency = (value: string | number | undefined) => {
      if (!value && value !== 0) return 'R$ 0,00';
      
      if (typeof value === 'number') {
        return new Intl.NumberFormat('pt-BR', {
          style: 'currency',
          currency: 'BRL'
        }).format(value);
      }
      
      if (typeof value === 'string') {
        if (value.startsWith('R$')) return value;
        const cleanValue = value.replace(/[^\d.,]/g, '');
        if (cleanValue.includes(',')) {
          const numericValue = parseFloat(cleanValue.replace(/\./g, '').replace(',', '.'));
          if (!isNaN(numericValue)) {
            return new Intl.NumberFormat('pt-BR', {
              style: 'currency',
              currency: 'BRL'
            }).format(numericValue);
          }
        } else if (cleanValue) {
          const numericValue = parseFloat(cleanValue);
          if (!isNaN(numericValue)) {
            return new Intl.NumberFormat('pt-BR', {
              style: 'currency',
              currency: 'BRL'
            }).format(numericValue);
          }
        }
        return `R$ ${value}`;
      }
      
      return 'R$ 0,00';
    };
    
    // Calcular valor com juros para o arrematante se houver
    const getValorArrematanteComJuros = () => {
      if (!auction.arrematante) return '';
      
      const valorComJuros = calcularValorTotalComJuros(auction.arrematante, auction);
      const valorBase = auction.arrematante.valorPagarNumerico || parseFloat(auction.arrematante.valorPagar?.replace?.(/[^\d,]/g, '')?.replace(',', '.') || '0');
      const valorJuros = valorComJuros - valorBase;
      
      if (valorJuros > 0) {
        return `${formatCurrency(valorComJuros)} (${formatCurrency(valorJuros)} juros)`;
      }
      return formatCurrency(valorComJuros);
    };

    return `
      <div style="background: white; color: black;">
        <!-- Identificação do Leilão -->
        <div style="margin-bottom: 20px;">
          <h2 style="font-size: 16px; font-weight: bold; color: #1a1a1a; margin-bottom: 15px; border-bottom: 1px solid #ddd; padding-bottom: 8px;">
            📋 IDENTIFICAÇÃO DO LEILÃO
          </h2>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
            <div><strong>Código:</strong> ${auction.identificacao || 'Não informado'}</div>
            <div><strong>Nome:</strong> ${auction.nome || 'Não informado'}</div>
            <div><strong>Status:</strong> ${getStatusLabel(auction.status)}</div>
            <div><strong>Local:</strong> ${getLocalLabel(auction.local)}</div>
            <div style="grid-column: 1 / -1;"><strong>Endereço:</strong> ${auction.endereco || 'Não informado'}</div>
          </div>
        </div>

        <!-- Cronograma -->
        <div style="margin-bottom: 20px;">
          <h2 style="font-size: 16px; font-weight: bold; color: #1a1a1a; margin-bottom: 15px; border-bottom: 1px solid #ddd; padding-bottom: 8px;">
            📅 CRONOGRAMA
          </h2>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
            <div><strong>Data de Início:</strong> ${formatDate(auction.dataInicio)}</div>
            <div><strong>Data de Encerramento:</strong> ${formatDate(auction.dataEncerramento)}</div>
          </div>
        </div>

        ${auction.arrematante ? `
        <!-- Arrematante -->
        <div style="margin-bottom: 20px; background: #e8f5e8; padding: 15px; border-radius: 8px;">
          <h2 style="font-size: 16px; font-weight: bold; color: #2d5016; margin-bottom: 15px; border-bottom: 1px solid #c3e6c3; padding-bottom: 8px;">
            👤 ARREMATANTE
          </h2>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
            <div><strong>Nome:</strong> ${auction.arrematante.nome || 'Não informado'}</div>
            <div><strong>CPF/CNPJ:</strong> ${auction.arrematante.documento || 'Não informado'}</div>
            <div><strong>Email:</strong> ${auction.arrematante.email || 'Não informado'}</div>
            <div><strong>Telefone:</strong> ${auction.arrematante.telefone || 'Não informado'}</div>
            <div><strong>Valor Total:</strong> ${getValorArrematanteComJuros()}</div>
            <div><strong>Status Pagamento:</strong> ${auction.arrematante.pago ? '✅ Pago' : (isOverdue(auction.arrematante, auction) ? '🔴 ATRASADO' : '⏳ Pendente')}</div>
            ${auction.arrematante.endereco ? `<div style="grid-column: 1 / -1;"><strong>Endereço:</strong> ${auction.arrematante.endereco}</div>` : ''}
          </div>
        </div>
        ` : ''}

        ${auction.lotes && auction.lotes.length > 0 ? `
        <!-- Lotes -->
        <div style="margin-bottom: 20px;">
          <h2 style="font-size: 16px; font-weight: bold; color: #1a1a1a; margin-bottom: 15px; border-bottom: 1px solid #ddd; padding-bottom: 8px;">
            📦 LOTES (${auction.lotes.length})
          </h2>
          <div style="space-y: 15px;">
            ${auction.lotes.map((lote: LoteInfo) => `
              <div style="background: #f8f9fa; padding: 12px; border-radius: 8px; margin-bottom: 10px;">
                <h3 style="font-size: 14px; font-weight: bold; margin-bottom: 8px;">Lote ${lote.numero}</h3>
                <p style="font-size: 12px; color: #666; margin-bottom: 8px;">${lote.descricao || 'Sem descrição'}</p>
                ${lote.mercadorias && lote.mercadorias.length > 0 ? `
                  <div style="font-size: 11px; color: #555;">
                    <strong>Mercadorias (${lote.mercadorias.length}):</strong><br>
                    ${lote.mercadorias.map((m: MercadoriaInfo) => `• ${m.nome || m.tipo} - ${m.descricao || 'Sem descrição'} ${m.valorNumerico ? `(${formatCurrency(m.valorNumerico)})` : ''}`).join('<br>')}
                  </div>
                ` : ''}
              </div>
            `).join('')}
          </div>
        </div>
        ` : ''}

        ${auction.historicoNotas && auction.historicoNotas.length > 0 ? `
        <!-- Observações -->
        <div style="margin-bottom: 20px;">
          <h2 style="font-size: 16px; font-weight: bold; color: #1a1a1a; margin-bottom: 15px; border-bottom: 1px solid #ddd; padding-bottom: 8px;">
            📝 OBSERVAÇÕES
          </h2>
          <div style="background: #f8f9fa; padding: 12px; border-radius: 8px;">
            ${auction.historicoNotas.map((nota: string) => `<div style="margin-bottom: 8px; font-size: 12px;">• ${nota}</div>`).join('')}
          </div>
        </div>
        ` : ''}
      </div>
    `;
  };

  const _handleGerarRelatorio = async () => {
    if (!config.tipo) {
      alert("Selecione um tipo de relatório");
      return;
    }

    setIsGenerating(true);
    
    // Simular geração de relatório
    setTimeout(() => {
      setIsGenerating(false);
      alert(`Relatório ${tiposRelatorio.find(t => t.id === config.tipo)?.nome} gerado com sucesso!`);
    }, 2000);
  };

  // Função para gerar outros tipos de relatórios
  const _generateGenericReport = async (type: 'inadimplencia' | 'historico' | 'faturas') => {
    if (!auctions || auctions.length === 0) {
      return;
    }

    try {
      setIsGenerating(true);
      
      let titulo = '';
      let dadosRelatorio = '';
      
      if (type === 'inadimplencia') {
        titulo = 'RELATÓRIO DE INADIMPLÊNCIA';
        const inadimplentes = auctions.filter(auction => {
          if (!auction.arrematante || auction.arrematante.pago) return false;
          
          const now = new Date();
          
          // Verificar se está atrasado baseado no tipo de pagamento
          const loteArrematado = auction.arrematante?.loteId 
            ? auction.lotes?.find(lote => lote.id === auction.arrematante.loteId)
            : null;
          
          const tipoPagamento = loteArrematado?.tipoPagamento || auction.tipoPagamento;
          
          if (tipoPagamento === 'a_vista') {
            const dataVencimento = loteArrematado?.dataVencimentoVista || auction.dataVencimentoVista;
            if (dataVencimento) {
              const dueDate = new Date(dataVencimento);
              dueDate.setHours(23, 59, 59, 999);
              return now > dueDate;
            }
          }
          
          if (tipoPagamento === 'entrada_parcelamento') {
            const dataEntrada = loteArrematado?.dataEntrada || auction.dataEntrada;
            if (dataEntrada) {
              const entryDueDate = new Date(dataEntrada);
              entryDueDate.setHours(23, 59, 59, 999);
              if (now > entryDueDate) return true;
            }
          }
          
          // Para parcelamento, verificar primeira parcela
          if (auction.arrematante.mesInicioPagamento && auction.arrematante.diaVencimentoMensal) {
            try {
              let year: number, month: number;
              
              if (auction.arrematante.mesInicioPagamento.includes('-')) {
                [year, month] = auction.arrematante.mesInicioPagamento.split('-').map(Number);
              } else {
                year = new Date().getFullYear();
                month = parseInt(auction.arrematante.mesInicioPagamento);
              }
              
              const firstPaymentDate = new Date(year, month - 1, auction.arrematante.diaVencimentoMensal);
              firstPaymentDate.setHours(23, 59, 59, 999);
              
              if (now > firstPaymentDate && (auction.arrematante.parcelasPagas || 0) === 0) {
                return true;
              }
            } catch (error) {
              logger.error('Erro ao calcular inadimplência:', error);
            }
          }
          
          return false;
        });
        
        dadosRelatorio = inadimplentes.map(auction => `
          <div style="margin-bottom: 20px; border: 1px solid #ddd; border-radius: 8px; padding: 15px; page-break-inside: avoid;">
            <h3 style="font-size: 16px; font-weight: bold; margin-bottom: 10px; color: #dc2626;">
              ${escapeHtml(auction.identificacao ? `#${auction.identificacao}` : auction.nome || 'Leilão sem nome')}
            </h3>
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; font-size: 12px;">
              <div><strong>Arrematante:</strong> ${escapeHtml(auction.arrematante?.nome) || 'N/A'}</div>
              <div><strong>CPF/CNPJ:</strong> ${escapeHtml(auction.arrematante?.documento) || 'N/A'}</div>
              <div><strong>Telefone:</strong> ${escapeHtml(auction.arrematante?.telefone) || 'N/A'}</div>
              <div><strong>Valor Total:</strong> ${escapeHtml(auction.arrematante?.valorPagar) || 'N/A'}</div>
              <div><strong>Data do Leilão:</strong> ${auction.dataInicio ? new Date(auction.dataInicio + 'T00:00:00').toLocaleDateString('pt-BR') : 'N/A'}</div>
              <div><strong>Parcelas Pagas:</strong> ${auction.arrematante?.parcelasPagas || 0} de ${auction.arrematante?.quantidadeParcelas || 0}</div>
            </div>
          </div>
        `).join('') || '<p style="text-align: center; color: #666; font-style: italic;">Nenhuma inadimplência encontrada.</p>';
        
      } else if (type === 'historico') {
        titulo = 'RELATÓRIO DE HISTÓRICO';
        const comArrematante = auctions.filter(a => a.arrematante && !a.arquivado);
        
        dadosRelatorio = comArrematante.map(auction => {
          const arr = auction.arrematante;
          const statusLabel = arr?.pago ? 'Quitado' : (isOverdue(arr, auction) ? 'Atrasado' : 'Pendente');
          const loteArr = arr?.loteId ? auction.lotes?.find(l => l.id === arr.loteId) : null;
          const tp = loteArr?.tipoPagamento || auction.tipoPagamento;
          const tpLabel = tp === 'a_vista' ? 'À vista' : tp === 'parcelamento' ? 'Parcelamento' : tp === 'entrada_parcelamento' ? 'Entrada + Parcelamento' : 'N/D';
          const vComJ = calcularValorTotalComJuros(arr, auction);
          const vBase = arr?.valorPagarNumerico || parseFloat(arr?.valorPagar?.replace(/[^\d,]/g, '').replace(',', '.') || '0');
          const vJuros = vComJ - vBase;
          const valorStr = vComJ.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
          const jurosStr = vJuros > 0 ? ` <span style="color:#dc2626;font-size:10px">(${vJuros.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} juros)</span>` : '';
          const mercadoria = loteArr && arr?.mercadoriaId ? loteArr.mercadorias?.find(m => m.id === arr.mercadoriaId) : null;
          
          return `
          <div style="page-break-inside:avoid;margin-bottom:24px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
              <span style="font-size:14px;font-weight:600;color:#1a1a1a">${escapeHtml(auction.identificacao ? `Processo Nº ${auction.identificacao}` : auction.nome || 'Processo sem identificação')}</span>
              <span style="font-size:10px;font-weight:600;padding:2px 8px;border-radius:3px;border:1px solid #ddd;color:#666">${statusLabel}</span>
            </div>
            <table style="width:100%;font-size:11px;border-collapse:collapse">
              <tr><td style="color:#999;padding:2px 12px 2px 0;width:110px">Arrematante</td><td style="color:#1a1a1a;font-weight:500;padding:2px 0">${escapeHtml(arr?.nome) || 'N/I'}</td></tr>
              <tr><td style="color:#999;padding:2px 12px 2px 0">Documento</td><td style="color:#1a1a1a;font-family:monospace;padding:2px 0">${escapeHtml(arr?.documento) || 'N/I'}</td></tr>
              <tr><td style="color:#999;padding:2px 12px 2px 0">Data</td><td style="color:#1a1a1a;padding:2px 0">${auction.dataInicio ? new Date(auction.dataInicio + 'T00:00:00').toLocaleDateString('pt-BR') : 'N/I'}</td></tr>
              <tr><td style="color:#999;padding:2px 12px 2px 0">Valor</td><td style="color:#1a1a1a;font-weight:500;padding:2px 0">${valorStr}${jurosStr}</td></tr>
              <tr><td style="color:#999;padding:2px 12px 2px 0">Modalidade</td><td style="color:#1a1a1a;padding:2px 0">${tpLabel}</td></tr>
              <tr><td style="color:#999;padding:2px 12px 2px 0">Parcelas</td><td style="color:#1a1a1a;padding:2px 0">${arr?.parcelasPagas || 0}/${arr?.quantidadeParcelas || 0}</td></tr>
            </table>
            ${mercadoria ? `<div style="margin-top:6px;font-size:10px;color:#999">${escapeHtml(mercadoria.titulo || mercadoria.tipo || 'Mercadoria')} · Lote ${loteArr?.numero} - ${escapeHtml(loteArr?.descricao) || 'Sem descrição'}</div>` : ''}
            ${auction.historicoNotas && auction.historicoNotas.length > 0 ? `<div style="margin-top:8px;font-size:10px;color:#666"><strong style="color:#999">Observações:</strong><br>${auction.historicoNotas.map(nota => `· ${escapeHtml(nota)}`).join('<br>')}</div>` : ''}
            <hr style="border:none;border-top:1px solid #eee;margin:16px 0 0 0">
          </div>`;
        }).join('') || '<p style="text-align: center; color: #999; font-size: 13px;">Nenhum histórico encontrado.</p>';
        
      } else if (type === 'faturas') {
        titulo = 'RELATÓRIO DE FATURAS';
        
        // Obter todas as faturas (múltiplos arrematantes por leilão)
        const todasFaturas: Array<{auction: Auction, arrematante: ArrematanteInfo}> = [];
        
        auctions.forEach(auction => {
          if (auction.arquivado) return;
          
          // Verificar se há múltiplos arrematantes
          if (auction.arrematantes && auction.arrematantes.length > 0) {
            auction.arrematantes.forEach(arr => {
              todasFaturas.push({ auction, arrematante: arr });
            });
          } else if (auction.arrematante) {
            // Suporte para formato antigo
            todasFaturas.push({ auction, arrematante: auction.arrematante });
          }
        });
        
        dadosRelatorio = todasFaturas.map(({ auction, arrematante }) => {
          // Calcular valor total com juros
          let valorTotalStr = arrematante?.valorPagar || 'N/A';
          const detalhamentoJuros = '';
          
          if (arrematante) {
            const valorBase = parseFloat(arrematante.valorPagar?.replace(/[^\d,]/g, '').replace(',', '.') || '0');
            const percentualJuros = arrematante.percentualJurosAtraso || 0;
            const quantidadeParcelas = arrematante.quantidadeParcelas || 1;
            const mesInicioPagamento = arrematante.mesInicioPagamento;
            
            // Verificar o tipo de pagamento
            const loteArrematado = arrematante?.loteId 
              ? auction.lotes?.find(lote => lote.id === arrematante.loteId)
              : null;
            const tipoPagamento = loteArrematado?.tipoPagamento || auction.tipoPagamento;
            
            let valorTotalComJuros = 0;
            
            if (tipoPagamento === 'a_vista') {
              // Para pagamento à vista, aplicar juros se estiver atrasado
              const dataVencimento = loteArrematado?.dataVencimentoVista || auction?.dataVencimentoVista;
              if (dataVencimento && percentualJuros > 0) {
                valorTotalComJuros = calcularJurosProgressivos(valorBase, dataVencimento, percentualJuros);
                if (valorTotalComJuros > valorBase) {
                  valorTotalStr = valorTotalComJuros.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
                }
              }
            } else if (mesInicioPagamento && quantidadeParcelas > 0 && percentualJuros > 0) {
              if (tipoPagamento === 'entrada_parcelamento') {
                // Para entrada + parcelamento (entrada e parcelas são INDEPENDENTES)
                const valorEntradaBase = arrematante.valorEntrada ? 
                  (typeof arrematante.valorEntrada === 'string' ? 
                    parseFloat(arrematante.valorEntrada.replace(/[^\d,]/g, '').replace(',', '.')) : 
                    arrematante.valorEntrada) : 
                  valorBase * 0.3;
                // ✅ Valor da parcela = valorBase / quantidade (SEM subtrair entrada)
                const valorPorParcelaBase = valorBase / quantidadeParcelas;
                
                // Calcular juros da entrada
                const dataEntrada = loteArrematado?.dataEntrada || auction.dataEntrada;
                if (dataEntrada) {
                  valorTotalComJuros += calcularJurosProgressivos(valorEntradaBase, dataEntrada, percentualJuros);
                } else {
                  valorTotalComJuros += valorEntradaBase;
                }
                
                // Calcular juros de cada parcela
                const [startYear, startMonth] = mesInicioPagamento.split('-').map(Number);
                for (let i = 0; i < quantidadeParcelas; i++) {
                  const dataVencimento = new Date(startYear, startMonth - 1 + i, arrematante.diaVencimentoMensal || 15);
                  const dataVencimentoStr = dataVencimento.toISOString().split('T')[0];
                  valorTotalComJuros += calcularJurosProgressivos(valorPorParcelaBase, dataVencimentoStr, percentualJuros);
                }
              } else {
                // Para parcelamento simples
                const valorPorParcela = valorBase / quantidadeParcelas;
                const [startYear, startMonth] = mesInicioPagamento.split('-').map(Number);
                
                for (let i = 0; i < quantidadeParcelas; i++) {
                  const dataVencimento = new Date(startYear, startMonth - 1 + i, arrematante.diaVencimentoMensal || 15);
                  const dataVencimentoStr = dataVencimento.toISOString().split('T')[0];
                  valorTotalComJuros += calcularJurosProgressivos(valorPorParcela, dataVencimentoStr, percentualJuros);
                }
              }
              
              if (valorTotalComJuros > valorBase) {
                valorTotalStr = valorTotalComJuros.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
              }
            }
          }
          
          // Obter informações da mercadoria
          const loteComprado = arrematante?.loteId 
            ? auction.lotes?.find(lote => lote.id === arrematante.loteId)
            : null;
          const mercadoriaComprada = loteComprado && arrematante?.mercadoriaId
            ? loteComprado.mercadorias?.find(m => m.id === arrematante.mercadoriaId)
            : null;
          
          return `
          <div style="margin-bottom: 20px; border: 1px solid #ddd; border-radius: 8px; padding: 15px; page-break-inside: avoid;">
            <h3 style="font-size: 16px; font-weight: bold; margin-bottom: 10px;">
              Fatura - ${escapeHtml(auction.identificacao ? `#${auction.identificacao}` : auction.nome || 'Leilão sem nome')}
            </h3>
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; font-size: 12px;">
              <div><strong>Cliente:</strong> ${escapeHtml(arrematante?.nome) || 'N/A'}</div>
              <div><strong>CPF/CNPJ:</strong> ${escapeHtml(arrematante?.documento) || 'N/A'}</div>
                <div><strong>Valor Total:</strong> ${escapeHtml(valorTotalStr)}${escapeHtml(detalhamentoJuros)}</div>
              <div><strong>Status:</strong> ${arrematante?.pago ? 'Pago' : (isOverdue(arrematante, auction) ? 'ATRASADO' : 'Pendente')}</div>
              <div><strong>Data Leilão:</strong> ${auction.dataInicio ? new Date(auction.dataInicio + 'T00:00:00').toLocaleDateString('pt-BR') : 'N/A'}</div>
              <div><strong>Parcelas:</strong> ${arrematante?.parcelasPagas || 0}/${arrematante?.quantidadeParcelas || 0}</div>
            </div>
            ${mercadoriaComprada ? `
              <div style="margin-top: 10px; padding: 8px; background: #f9fafb; border-radius: 4px; font-size: 11px; border-left: 3px solid #6b7280;">
                <strong>Mercadoria Arrematada:</strong> ${escapeHtml(mercadoriaComprada.titulo || mercadoriaComprada.tipo) || 'Mercadoria'}<br>
                <strong>Lote:</strong> Lote ${loteComprado.numero} - ${escapeHtml(loteComprado.descricao) || 'Sem descrição'}
              </div>
            ` : ''}
            ${arrematante?.valorPagarNumerico && arrematante?.quantidadeParcelas ? `
              <div style="margin-top: 10px; padding: 8px; background: #f0f9ff; border-radius: 4px; font-size: 11px;">
                <strong>Detalhamento:</strong><br>
                  Valor por parcela base: ${(arrematante.valorPagarNumerico / arrematante.quantidadeParcelas).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}<br>
                  Dia vencimento: ${arrematante?.diaVencimentoMensal || 'N/A'}${arrematante?.percentualJurosAtraso ? `<br>Juros de atraso: ${arrematante.percentualJurosAtraso}% ao mês` : ''}
              </div>
            ` : ''}
          </div>
          `;
        }).join('') || '<p style="text-align: center; color: #666; font-style: italic;">Nenhuma fatura encontrada.</p>';
      }
      
      // Criar o elemento HTML para o relatório
      const element = document.createElement('div');
      element.style.position = 'absolute';
      element.style.left = '-9999px';
      // 🔒 SEGURANÇA: Escape do título (que pode conter texto fornecido pelo usuário)
      const tituloSeguro = escapeHtml(titulo);
      
      element.innerHTML = `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: black;">
          <div style="text-align: center; margin-bottom: 40px; border-bottom: 2px solid #333; padding-bottom: 20px;">
            <h1 style="font-size: 24px; font-weight: bold; color: #1a1a1a; margin-bottom: 10px;">
              ${tituloSeguro}
            </h1>
            <p style="color: #666; font-size: 12px;">
              Gerado em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}
            </p>
          </div>
          
          ${dadosRelatorio}
          
          <div style="margin-top: 40px; padding-top: 20px; border-top: 2px solid #333; text-align: center;">
            <div style="font-size: 10px; color: #666;">
              Página 1 de 1 - Data: ${new Date().toLocaleDateString('pt-BR')} - ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        </div>
      `;
      
      document.body.appendChild(element);
      
      // Importar html2pdf dinamicamente
      const html2pdf = (await import('html2pdf.js')).default;

      const opt = {
        margin: [10, 10, 10, 10] as [number, number, number, number],
        filename: `relatorio_${type}_${new Date().toISOString().split('T')[0]}.pdf`,
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
      
      // Limpar elemento temporário
      document.body.removeChild(element);
      
    } catch (error) {
      logger.error('Erro ao gerar relatório:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const _handlePreviewRelatorio = () => {
    if (!config.tipo) {
      alert("Selecione um tipo de relatório");
      return;
    }
    
    alert(`Visualizando preview do relatório: ${tiposRelatorio.find(t => t.id === config.tipo)?.nome}`);
  };

  // Função para fazer download a partir do preview
  const handleDownloadFromPreview = async () => {
    setIsPreviewModalOpen(false);
    
    // Usar sempre o mesmo método que funciona para todos os tipos
    if (previewType === 'leiloes') {
      await generateLeiloesReport();
    } else {
      // Para inadimplência, histórico e faturas, usar o mesmo método
      await generateAnyReport(previewType);
    }
  };

  // Função unificada para gerar qualquer tipo de relatório usando o método que funciona
  const generateAnyReport = async (reportType: 'leiloes' | 'inadimplencia' | 'historico' | 'faturas') => {
    logger.debug(`🔍 Iniciando geração do relatório de ${reportType}...`);

    if (!auctions || auctions.length === 0) {
      return;
    }

    try {
      setIsGenerating(true);

      // 1. Abrir modal temporário invisível
      setSelectedAuctionForExport(auctions[0]?.id || "temp");
      setIsExportModalOpen(true);
      
      // 2. Aguardar renderização do componente React
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // 3. Pegar o elemento que foi renderizado pelo React
      const element = document.getElementById('pdf-content');
      if (!element) {
        throw new Error('Elemento PDF não encontrado - modal não renderizou');
      }

      logger.debug('📄 Elemento encontrado:', element);
      logger.debug(`📐 Dimensões: ${element.offsetWidth} x ${element.offsetHeight}`);

      // 4. Usar html2pdf importado estaticamente

      const opt = {
        margin: [10, 10, 10, 10] as [number, number, number, number],
        filename: `relatorio-${reportType}-${new Date().toISOString().split('T')[0]}.pdf`,
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

      logger.debug('🔄 Iniciando conversão para PDF...');
      
      // 5. Gerar PDF do elemento renderizado pelo React
      await html2pdf().set(opt).from(element).save();
      
      const typeNames = {
        'leiloes': 'leilões',
        'inadimplencia': 'inadimplência',
        'historico': 'histórico',
        'faturas': 'faturas'
      };
      
      // Log da geração do relatório
      await logReportAction('generate', reportType, `Relatório de ${typeNames[reportType]}`, {
        metadata: {
          total_auctions: auctions.length,
          report_format: 'pdf',
          generation_date: new Date().toISOString()
        }
      });
      
    } catch (error) {
      logger.error('❌ Erro ao gerar relatório:', error);
    } finally {
      setIsGenerating(false);
      // Sempre fechar o modal no final
      setIsExportModalOpen(false);
      setSelectedAuctionForExport("");
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4 sm:space-y-6 lg:space-y-8 slide-in-bottom">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-gray-900">Central de Relatórios</h1>
            <p className="text-muted-foreground mt-2">Gere relatórios detalhados e análises profissionais dos seus leilões</p>
          </div>
        </div>

        <div className="space-y-4 sm:space-y-6">
          <div>
            <div className="h-7 bg-gray-200 rounded animate-pulse w-48 mb-2"></div>
            <div className="h-4 bg-gray-200 rounded animate-pulse w-80"></div>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 lg:gap-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="relative p-4 sm:p-6 lg:p-8 animate-pulse">
                <div className="absolute -top-1 -left-1 w-3 h-3 border-l-2 border-t-2 border-gray-300 border-dashed"></div>
                <div className="absolute -top-1 -right-1 w-3 h-3 border-r-2 border-t-2 border-gray-300 border-dashed"></div>
                <div className="absolute -bottom-1 -left-1 w-3 h-3 border-l-2 border-b-2 border-gray-300 border-dashed"></div>
                <div className="absolute -bottom-1 -right-1 w-3 h-3 border-r-2 border-b-2 border-gray-300 border-dashed"></div>
                <div className="text-center space-y-4">
                  <div className="mx-auto w-12 h-12 bg-gray-200 rounded"></div>
                  <div>
                    <div className="h-5 bg-gray-200 rounded mx-auto w-24 mb-2"></div>
                    <div className="h-3 bg-gray-200 rounded mx-auto w-32"></div>
                  </div>
                  <div className="h-9 bg-gray-200 rounded"></div>
                </div>
              </div>
            ))}
          </div>
          
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-gray-900"></div>
            <p className="ml-4 text-gray-600">Carregando relatórios...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 lg:space-y-8 slide-in-bottom">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight text-gray-900">Central de Relatórios</h1>
          <p className="text-muted-foreground mt-2">Gere relatórios detalhados e análises profissionais dos seus leilões</p>
        </div>
      </div>

      {/* Cards de Relatórios Rápidos */}
      <div className="space-y-6">
        <div className="flex items-start justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900 mb-2">
            <FileText className="h-5 w-5 text-gray-600" />
            Relatórios Rápidos
          </h2>
          <p className="text-muted-foreground text-sm">
            Baixe relatórios específicos com um clique
          </p>
          </div>
        </div>
        
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 lg:gap-6">
            {/* Card Relatório de Leilões */}
            <div className="relative p-4 sm:p-6 lg:p-8 hover:bg-gray-50/50 transition-colors group">
              {/* Pontos nos cantos */}
              <div className="absolute -top-1 -left-1 w-3 h-3 border-l-2 border-t-2 border-gray-400 border-dashed"></div>
              <div className="absolute -top-1 -right-1 w-3 h-3 border-r-2 border-t-2 border-gray-400 border-dashed"></div>
              <div className="absolute -bottom-1 -left-1 w-3 h-3 border-l-2 border-b-2 border-gray-400 border-dashed"></div>
              <div className="absolute -bottom-1 -right-1 w-3 h-3 border-r-2 border-b-2 border-gray-400 border-dashed"></div>
              <div className="text-center space-y-4">
                <div className="mx-auto w-12 h-12 flex items-center justify-center">
                  <Gavel className="h-6 w-6 text-gray-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">Leilões</h3>
                  <p className="text-xs text-gray-600">Relatório completo dos leilões</p>
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  className="w-full bg-white border-gray-300 text-gray-700 hover:bg-gray-50 hover:text-gray-700"
                  onClick={() => openLeiloesPreview()}
                  disabled={isGenerating}
                >
                  <Download className="h-4 w-4 mr-2" />
                  {isGenerating ? 'Gerando...' : 'Baixar Relatório'}
                </Button>
              </div>
            </div>

            {/* Card Relatório de Inadimplência */}
            <div className="relative p-4 sm:p-6 lg:p-8 hover:bg-gray-50/50 transition-colors group">
              {/* Pontos nos cantos */}
              <div className="absolute -top-1 -left-1 w-3 h-3 border-l-2 border-t-2 border-gray-400 border-dashed"></div>
              <div className="absolute -top-1 -right-1 w-3 h-3 border-r-2 border-t-2 border-gray-400 border-dashed"></div>
              <div className="absolute -bottom-1 -left-1 w-3 h-3 border-l-2 border-b-2 border-gray-400 border-dashed"></div>
              <div className="absolute -bottom-1 -right-1 w-3 h-3 border-r-2 border-b-2 border-gray-400 border-dashed"></div>
              <div className="text-center space-y-4">
                <div className="mx-auto w-12 h-12 flex items-center justify-center">
                  <Clock className="h-6 w-6 text-gray-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">Inadimplência</h3>
                  <p className="text-xs text-gray-600">Status de pagamentos em atraso</p>
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  className="w-full bg-white border-gray-300 text-gray-700 hover:bg-gray-50 hover:text-gray-700"
                  onClick={() => openGenericPreview('inadimplencia')}
                  disabled={isGenerating}
                >
                  <Download className="h-4 w-4 mr-2" />
                  {isGenerating ? 'Gerando...' : 'Baixar Relatório'}
                </Button>
              </div>
            </div>

            {/* Card Relatório de Histórico */}
            <div className="relative p-4 sm:p-6 lg:p-8 hover:bg-gray-50/50 transition-colors group">
              {/* Pontos nos cantos */}
              <div className="absolute -top-1 -left-1 w-3 h-3 border-l-2 border-t-2 border-gray-400 border-dashed"></div>
              <div className="absolute -top-1 -right-1 w-3 h-3 border-r-2 border-t-2 border-gray-400 border-dashed"></div>
              <div className="absolute -bottom-1 -left-1 w-3 h-3 border-l-2 border-b-2 border-gray-400 border-dashed"></div>
              <div className="absolute -bottom-1 -right-1 w-3 h-3 border-r-2 border-b-2 border-gray-400 border-dashed"></div>
              <div className="text-center space-y-4">
                <div className="mx-auto w-12 h-12 flex items-center justify-center">
                  <BarChart3 className="h-6 w-6 text-gray-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">Histórico</h3>
                  <p className="text-xs text-gray-600">Histórico detalhado por cliente</p>
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  className="w-full bg-white border-gray-300 text-gray-700 hover:bg-gray-50 hover:text-gray-700"
                  onClick={() => openGenericPreview('historico')}
                  disabled={isGenerating}
                >
                  <Download className="h-4 w-4 mr-2" />
                  {isGenerating ? 'Gerando...' : 'Baixar Relatório'}
                </Button>
              </div>
            </div>

            {/* Card Relatório de Faturas */}
            <div className="relative p-4 sm:p-6 lg:p-8 hover:bg-gray-50/50 transition-colors group">
              {/* Pontos nos cantos */}
              <div className="absolute -top-1 -left-1 w-3 h-3 border-l-2 border-t-2 border-gray-400 border-dashed"></div>
              <div className="absolute -top-1 -right-1 w-3 h-3 border-r-2 border-t-2 border-gray-400 border-dashed"></div>
              <div className="absolute -bottom-1 -left-1 w-3 h-3 border-l-2 border-b-2 border-gray-400 border-dashed"></div>
              <div className="absolute -bottom-1 -right-1 w-3 h-3 border-r-2 border-b-2 border-gray-400 border-dashed"></div>
              <div className="text-center space-y-4">
                <div className="mx-auto w-12 h-12 flex items-center justify-center">
                  <DollarSign className="h-6 w-6 text-gray-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 mb-1">Faturas</h3>
                  <p className="text-xs text-gray-600">Controle financeiro e cobrança</p>
                </div>
                <Button 
                  variant="outline" 
                  size="sm"
                  className="w-full bg-white border-gray-300 text-gray-700 hover:bg-gray-50 hover:text-gray-700"
                  onClick={() => openGenericPreview('faturas')}
                  disabled={isGenerating}
                >
                  <Download className="h-4 w-4 mr-2" />
                  {isGenerating ? 'Gerando...' : 'Baixar Relatório'}
                </Button>
              </div>
            </div>
          </div>
                  </div>
                  
      <div>
        {/* Dashboard de Análise */}
        <div>
          <Card>
            <CardContent className="p-4 sm:p-6 lg:p-8">
              <div>
                {/* Gráfico */}
                <div>
                  <div className="bg-white p-4 h-full">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <h3 className="text-xl font-medium text-gray-900 flex items-center" style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', height: '40px' }}>
                        {config.periodo.inicio === 'trimestral' ? 'Faturamento & Despesas por Trimestre' : 
                         config.periodo.inicio === 'anual' ? 'Faturamento & Despesas' : 
                         config.periodo.inicio === 'personalizado' ? 'Faturamento & Despesas - Período Personalizado' :
                         'Faturamento & Despesas por Mês'}
                          </h3>

                      {config.periodo.inicio === 'personalizado' ? (
                        <div className="flex items-center bg-gray-100 rounded-lg p-2 gap-3" style={{ height: '48px' }}>
                          <button
                            className="flex items-center gap-1 px-2 py-1 rounded-md text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-200 transition-colors"
                            onClick={() => setConfig({
                              ...config,
                              periodo: { inicio: 'mensal', fim: 'mensal' },
                              filtros: { ...config.filtros, dataInicio: undefined, dataFim: undefined }
                            })}
                          >
                            <ArrowLeft className="h-4 w-4" />
                            Voltar
                          </button>
                          <div className="flex items-center gap-2">
                            <Label className="text-sm font-medium text-gray-700">De:</Label>
                    <StringDatePicker
                              value={config.filtros.dataInicio || ''}
                      onChange={(value) => setConfig({
                        ...config,
                                filtros: { ...config.filtros, dataInicio: value }
                      })}
                              placeholder="Data inicial"
                              className="text-sm h-8"
                    />
                  </div>
                          <div className="flex items-center gap-2">
                            <Label className="text-sm font-medium text-gray-700">Até:</Label>
                    <StringDatePicker
                              value={config.filtros.dataFim || ''}
                      onChange={(value) => setConfig({
                        ...config,
                                filtros: { ...config.filtros, dataFim: value }
                      })}
                              placeholder="Data final"
                              className="text-sm h-8"
                    />
                  </div>
                </div>
                      ) : (
                        <div className="flex items-center bg-gray-100 rounded-lg p-1" style={{ height: '40px' }}>
                          <button
                            className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                              config.periodo.inicio === 'mensal' || !config.periodo.inicio
                                ? 'bg-white text-gray-900 shadow-sm'
                                : 'text-gray-600 hover:text-gray-900'
                            }`}
                            onClick={() => setConfig({
                              ...config,
                              periodo: { inicio: 'mensal', fim: 'mensal' }
                            })}
                          >
                            Mensal
                          </button>
                          <button
                            className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                              config.periodo.inicio === 'trimestral'
                                ? 'bg-white text-gray-900 shadow-sm'
                                : 'text-gray-600 hover:text-gray-900'
                            }`}
                            onClick={() => setConfig({
                              ...config,
                              periodo: { inicio: 'trimestral', fim: 'trimestral' }
                            })}
                          >
                            Trimestral
                          </button>
                          <button
                            className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                              config.periodo.inicio === 'anual'
                                ? 'bg-white text-gray-900 shadow-sm'
                                : 'text-gray-600 hover:text-gray-900'
                            }`}
                            onClick={() => setConfig({
                        ...config,
                              periodo: { inicio: 'anual', fim: 'anual' }
                            })}
                          >
                            Anual
                          </button>
                          <button
                            className={`px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                              config.periodo.inicio === 'personalizado'
                                ? 'bg-white text-gray-900 shadow-sm'
                                : 'text-gray-600 hover:text-gray-900'
                            }`}
                            onClick={() => setConfig({
                        ...config,
                              periodo: { inicio: 'personalizado', fim: 'personalizado' }
                            })}
                          >
                            Personalizado
                          </button>
                  </div>
                      )}
                </div>

                {/* Legenda + Filtros de consideração */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mt-3 mb-2 gap-2">
                  {/* Legenda (esquerda) */}
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 bg-indigo-500 rounded-full"></div>
                      <span className="text-xs text-gray-500">Faturamento</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2.5 h-2.5 bg-gray-400 rounded-full"></div>
                      <span className="text-xs text-gray-500">Despesas</span>
                    </div>
                  </div>
                  
                  {/* Toggles (direita) */}
                  <div className="flex items-center gap-1">
                    {[
                      { key: 'venda', label: '% Venda', active: considerarComissaoVenda, toggle: () => setConsiderarComissaoVenda(!considerarComissaoVenda) },
                      { key: 'compra', label: '% Compra', active: considerarComissaoCompra, toggle: () => setConsiderarComissaoCompra(!considerarComissaoCompra) },
                      { key: 'patrocinios', label: 'Patrocínios', active: considerarPatrocinios, toggle: () => setConsiderarPatrocinios(!considerarPatrocinios) },
                    ].map(item => (
                      <button
                        key={item.key}
                        onClick={item.toggle}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all duration-200 border ${
                          item.active
                            ? 'bg-gray-900 text-white border-gray-900'
                            : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300 hover:text-gray-500'
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                
                    <div className="mt-4 overflow-x-auto overflow-y-hidden">
                      <div className="min-w-full" style={{ aspectRatio: '1450 / 420' }}>
                        <svg 
                          ref={svgRef}
                          width="100%" 
                          height="100%" 
                          viewBox="0 0 1450 420" 
                          preserveAspectRatio="xMidYMid meet" 
                          style={{ cursor: 'crosshair', display: 'block' }}
                          onMouseMove={handleChartMouseMove}
                          onMouseLeave={handleChartMouseLeave}
                        >
                        {/* Grid horizontal - linhas sutis */}
                        {[0, 1, 2, 3, 4, 5, 6, 7].map((line) => (
                          <line
                            key={line}
                            x1="80"
                            y1={25 + line * 50}
                            x2="1430"
                            y2={25 + line * 50}
                            stroke="#d1d5db"
                            strokeWidth="1"
                          />
                        ))}
                        
                        {/* Períodos - Labels dinâmicos baseados no tipo de gráfico */}
                        {(() => {
                          // Usar os mesmos dados calculados no gráfico
                          const tipoGrafico = config.periodo.inicio || 'mensal';
                          const labelsData = [];
                          
                          if (tipoGrafico === 'personalizado') {
                            const dataInicio = config.filtros.dataInicio ? new Date(config.filtros.dataInicio) : new Date(new Date().getTime() - (6 * 30 * 24 * 60 * 60 * 1000));
                            const dataFim = config.filtros.dataFim ? new Date(config.filtros.dataFim) : new Date();
                            
                            const start = new Date(dataInicio.getFullYear(), dataInicio.getMonth(), 1);
                            const end = new Date(dataFim.getFullYear(), dataFim.getMonth(), 1);
                            
                            const current = new Date(start);
                            while (current <= end) {
                              labelsData.push(current.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }));
                              current.setMonth(current.getMonth() + 1);
                            }
                          } else if (tipoGrafico === 'trimestral') {
                            const currentQuarter = Math.floor(new Date().getMonth() / 3);
                            for (let i = 7; i >= 0; i--) {
                              let quarter = currentQuarter - i;
                              let year = new Date().getFullYear();
                              
                              while (quarter < 0) {
                                quarter += 4;
                                year -= 1;
                              }
                              
                              labelsData.push(`${quarter + 1}º trim./${year.toString().slice(2)}`);
                            }
                          } else if (tipoGrafico === 'anual') {
                            const now = new Date();
                            for (let i = 9; i >= 0; i--) {
                              labelsData.push((now.getFullYear() - i).toString());
                            }
                          } else {
                            // Mensal
                            const now = new Date();
                            for (let i = 11; i >= 0; i--) {
                              const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
                              labelsData.push(monthStart.toLocaleDateString('pt-BR', { month: 'short' }));
                            }
                          }
                          
                          const quantidadePeriodos = labelsData.length;
                          const espacamentoX = quantidadePeriodos > 1 ? (1430 - 80) / (quantidadePeriodos - 1) : 0;
                          
                          return labelsData.map((label, i) => (
                            <text
                              key={i}
                              x={80 + (i * espacamentoX)}
                              y="405"
                              fill="#6B7280"
                              fontSize="14"
                              textAnchor="middle"
                              fontWeight="500"
                            >
                              {label}
                            </text>
                          ));
                        })()}
                        
                        {/* Dados do gráfico */}
                        {(() => {
                          const chartData = [];
                          const now = new Date();
                          const tipoGrafico = config.periodo.inicio || 'mensal';
                          
                          if (tipoGrafico === 'personalizado') {
                            // Período personalizado - por meses dentro do intervalo
                            const dataInicio = config.filtros.dataInicio ? new Date(config.filtros.dataInicio) : new Date(now.getTime() - (6 * 30 * 24 * 60 * 60 * 1000));
                            const dataFim = config.filtros.dataFim ? new Date(config.filtros.dataFim) : now;
                            
                            const _meses = [];
                            const start = new Date(dataInicio.getFullYear(), dataInicio.getMonth(), 1);
                            const end = new Date(dataFim.getFullYear(), dataFim.getMonth(), 1);
                            
                            const current = new Date(start);
                            while (current <= end) {
                              const monthStart = new Date(current.getFullYear(), current.getMonth(), 1);
                              const monthEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0);
                              
                              const monthAuctions = (auctions || []).filter(auction => {
                                const auctionDate = new Date(auction.dataInicio);
                                return auctionDate >= monthStart && auctionDate <= monthEnd && auctionDate >= dataInicio && auctionDate <= dataFim;
                              });
                              
                              chartData.push({
                                count: monthAuctions.length,
                                month: monthStart.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
                              });
                              
                              current.setMonth(current.getMonth() + 1);
                            }
                          } else if (tipoGrafico === 'trimestral') {
                            // Últimos 8 trimestres para linha mais larga
                            const currentQuarter = Math.floor(now.getMonth() / 3);
                            
                            for (let i = 7; i >= 0; i--) {
                              let quarter = currentQuarter - i;
                              let year = now.getFullYear();
                              
                              while (quarter < 0) {
                                quarter += 4;
                                year -= 1;
                              }
                              
                              const quarterStart = new Date(year, quarter * 3, 1);
                              const quarterEnd = new Date(year, (quarter + 1) * 3, 0);
                              
                              const quarterAuctions = (auctions || []).filter(auction => {
                                const auctionDate = new Date(auction.dataInicio);
                                return auctionDate >= quarterStart && auctionDate <= quarterEnd;
                              });
                              
                              chartData.push({
                                count: quarterAuctions.length,
                                month: `${quarter + 1}º trim./${year.toString().slice(2)}`
                              });
                            }
                          } else if (tipoGrafico === 'anual') {
                            // Últimos 10 anos para linha mais larga
                            for (let i = 9; i >= 0; i--) {
                              const yearStart = new Date(now.getFullYear() - i, 0, 1);
                              const yearEnd = new Date(now.getFullYear() - i + 1, 0, 0);
                              
                              const yearAuctions = (auctions || []).filter(auction => {
                                const auctionDate = new Date(auction.dataInicio);
                                return auctionDate >= yearStart && auctionDate <= yearEnd;
                              });
                              
                              chartData.push({
                                count: yearAuctions.length,
                                month: yearStart.getFullYear().toString()
                              });
                            }
                          } else {
                            // Mensal (padrão) - últimos 12 meses para linha mais larga
                            for (let i = 11; i >= 0; i--) {
                              const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
                              const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
                              
                              const monthAuctions = (auctions || []).filter(auction => {
                                const auctionDate = new Date(auction.dataInicio);
                                return auctionDate >= monthStart && auctionDate <= monthEnd;
                              });
                              
                              chartData.push({
                                count: monthAuctions.length,
                                month: monthStart.toLocaleDateString('pt-BR', { month: 'short' })
                              });
                            }
                          }
                          
                          const maxValue = Math.max(...chartData.map(d => d.count), 1);
                          const _adjustedMax = Math.max(maxValue, 7); // Mesma escala ajustada dos labels
                          
                          return (
                            <>
                              
                              
                              {/* Gráfico com áreas preenchidas e tooltips */}
                              {(() => {
                                // Calcular dados de faturamento e despesas REAIS baseado no período selecionado
                                const dadosGrafico = [];
                                const tipoGrafico = config.periodo.inicio || 'mensal';
                                
                                
                                // Função auxiliar para calcular o valor efetivamente pago por um arrematante
                                const calcularValorPago = (arrematante, auction) => {
                                  const parcelasPagas = arrematante?.parcelasPagas || 0;
                                  const valorTotal = arrematante?.valorPagarNumerico || 0;
                                  
                                  // Se totalmente pago, retornar valor total
                                  if (arrematante?.pago) {
                                    return valorTotal;
                                  }
                                  
                                  // Se não pagou nada, retornar 0
                                  if (parcelasPagas <= 0) {
                                    return 0;
                                  }
                                  
                                  // Se parcialmente pago, calcular valor das parcelas pagas
                                  const loteArrematado = auction.lotes?.find(lote => lote.id === arrematante.loteId);
                                  const tipoPagamento = loteArrematado?.tipoPagamento || auction.tipoPagamento;
                                  
                                  if (tipoPagamento === 'entrada_parcelamento') {
                                    const valorEntrada = arrematante?.valorEntrada ? 
                                      (typeof arrematante.valorEntrada === 'string' ? 
                                        parseFloat(arrematante.valorEntrada.replace(/[^\d,]/g, '').replace(',', '.')) : 
                                        arrematante.valorEntrada) : 
                                      valorTotal * 0.3;
                                    
                                    const estrutura = calcularEstruturaParcelas(
                                      valorTotal,
                                      arrematante.parcelasTriplas || 0,
                                      arrematante.parcelasDuplas || 0,
                                      arrematante.parcelasSimples || 0
                                    );
                                    
                                    if (parcelasPagas >= 1) {
                                      const parcelasEfetivasPagas = Math.max(0, parcelasPagas - 1);
                                      const valorParcelasPagas = estrutura
                                        .slice(0, parcelasEfetivasPagas)
                                        .reduce((s, p) => s + p.valor, 0);
                                      return valorEntrada + valorParcelasPagas;
                                    }
                                    return 0;
                                  } else if (tipoPagamento === 'parcelamento' || !tipoPagamento) {
                                    const estrutura = calcularEstruturaParcelas(
                                      valorTotal,
                                      arrematante.parcelasTriplas || 0,
                                      arrematante.parcelasDuplas || 0,
                                      arrematante.parcelasSimples || 0
                                    );
                                    
                                    return estrutura
                                      .slice(0, parcelasPagas)
                                      .reduce((s, p) => s + p.valor, 0);
                                  } else if (tipoPagamento === 'a_vista') {
                                    return parcelasPagas > 0 ? valorTotal : 0;
                                  }
                                  
                                  return 0;
                                };
                                
                                // Função para calcular valores de um período específico
                                const calcularDadosPeriodo = (dataInicio, dataFim, label) => {
                                  // FATURAMENTO = Total já recebido, distinguindo lotes próprios de convidados
                                  let faturamentoPeriodo = 0;
                                  let comissaoCompraTotal = 0; // Comissão de compra (leiloeiro/assessor) como despesa
                                  
                                  auctions?.forEach(auction => {
                                    if (auction.arrematante && !auction.arquivado) {
                                      const dataLeilao = new Date(auction.dataInicio + 'T00:00:00.000');
                                      if (dataLeilao >= dataInicio && dataLeilao <= dataFim) {
                                        const arrematante = auction.arrematante;
                                        const valorPago = calcularValorPago(arrematante, auction);
                                        
                                        if (valorPago > 0) {
                                          // Identificar o lote do arrematante
                                          const loteArrematado = auction.lotes?.find(lote => lote.id === arrematante.loteId);
                                          
                                          if (loteArrematado?.isConvidado && considerarComissaoVenda) {
                                            // LOTE DE CONVIDADO com toggle ativo: faturamento = apenas comissão de venda
                                            const percVenda = loteArrematado.percentualComissaoVenda 
                                              || arrematante.percentualComissaoVenda 
                                              || auction.percentualComissaoVenda 
                                              || 5; // Default 5%
                                            faturamentoPeriodo += valorPago * (percVenda / 100);
                                          } else if (loteArrematado?.isConvidado && !considerarComissaoVenda) {
                                            // LOTE DE CONVIDADO com toggle desativado: considerar valor total
                                            faturamentoPeriodo += valorPago;
                                          } else {
                                            // LOTE PRÓPRIO: faturamento = valor total pago
                                            faturamentoPeriodo += valorPago;
                                          }
                                          
                                          // Comissão de compra (leiloeiro/assessor) = despesa (se toggle ativo)
                                          if (considerarComissaoCompra) {
                                            const percCompra = loteArrematado?.percentualComissaoLeiloeiro 
                                              || arrematante.percentualComissaoLeiloeiro 
                                              || auction.percentualComissaoLeiloeiro 
                                              || 0;
                                            if (percCompra > 0) {
                                              comissaoCompraTotal += valorPago * (percCompra / 100);
                                            }
                                          }
                                        }
                                      }
                                    }
                                  });
                                  
                                  // Adicionar patrocínios ao faturamento (se toggle ativo)
                                  let totalPatrocinios = 0;
                                  if (considerarPatrocinios) {
                                    totalPatrocinios = auctions?.reduce((sum, auction) => {
                                      if (!auction.arquivado) {
                                        const dataLeilao = new Date(auction.dataInicio + 'T00:00:00.000');
                                        if (dataLeilao >= dataInicio && dataLeilao <= dataFim) {
                                          const patrociniosRecebidos = (auction.detalhePatrocinios || [])
                                            .filter(p => p.recebido === true)
                                            .reduce((sumPatrocinios, p) => sumPatrocinios + (p.valorNumerico || 0), 0);
                                          return sum + patrociniosRecebidos;
                                        }
                                      }
                                      return sum;
                                    }, 0) || 0;
                                  }
                                  
                                  const faturamentoTotalPeriodo = faturamentoPeriodo + totalPatrocinios;
                                  
                                  // DESPESAS = Custos cadastrados + comissões de compra (se toggle ativo)
                                  const custosCadastrados = auctions?.reduce((sum, auction) => {
                                    if (!auction.arquivado) {
                                      const dataLeilao = new Date(auction.dataInicio + 'T00:00:00.000');
                                      if (dataLeilao >= dataInicio && dataLeilao <= dataFim) {
                                        let custos = 0;
                                        if (auction.custosNumerico !== undefined && auction.custosNumerico > 0) {
                                          custos = auction.custosNumerico;
                                        } else if (typeof auction.custos === 'number' && auction.custos > 0) {
                                          custos = auction.custos;
                                        } else if (typeof auction.custos === 'string' && auction.custos) {
                                          const parsed = parseFloat(auction.custos.replace(/[^\d,]/g, '').replace(',', '.')) || 0;
                                          custos = parsed;
                                        }
                                        
                                        if (custos > 0) {
                                          return sum + custos;
                                        }
                                      }
                                    }
                                    return sum;
                                  }, 0) || 0;
                                  
                                  const despesasPeriodo = custosCadastrados + comissaoCompraTotal;
                                  
                                  return {
                                    mes: label,
                                    faturamento: faturamentoTotalPeriodo,
                                    despesas: despesasPeriodo
                                  };
                                };
                                
                                // Preparar dados baseado no tipo de gráfico
                                const now = new Date();
                                if (tipoGrafico === 'personalizado') {
                                  // Período personalizado - por meses dentro do intervalo
                                  const dataInicio = config.filtros.dataInicio ? new Date(config.filtros.dataInicio) : new Date(now.getTime() - (6 * 30 * 24 * 60 * 60 * 1000));
                                  const dataFim = config.filtros.dataFim ? new Date(config.filtros.dataFim) : now;
                                  
                                  const start = new Date(dataInicio.getFullYear(), dataInicio.getMonth(), 1);
                                  const end = new Date(dataFim.getFullYear(), dataFim.getMonth(), 1);
                                  
                                  const current = new Date(start);
                                  while (current <= end) {
                                    const monthStart = new Date(current.getFullYear(), current.getMonth(), 1);
                                    const monthEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0);
                                    const label = monthStart.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
                                    
                                    dadosGrafico.push(calcularDadosPeriodo(monthStart, monthEnd, label));
                                    current.setMonth(current.getMonth() + 1);
                                  }
                                } else if (tipoGrafico === 'trimestral') {
                                  // Trimestres dinâmicos baseados nos leilões
                                  let dataMinima = new Date();
                                  let dataMaxima = new Date();
                                  
                                  if (auctions && auctions.length > 0) {
                                    // Corrigir problema de fuso horário na geração de períodos trimestrais
                                    const datasLeiloes = auctions.map(a => new Date(a.dataInicio + 'T00:00:00.000'));
                                    dataMinima = new Date(Math.min(...datasLeiloes.map(d => d.getTime())));
                                    dataMaxima = new Date(Math.max(...datasLeiloes.map(d => d.getTime())));
                                    
                                    // Garantir pelo menos 8 trimestres no passado
                                    const oitoTrimestresAtras = new Date(now.getFullYear() - 2, now.getMonth(), 1);
                                    if (dataMinima > oitoTrimestresAtras) dataMinima = oitoTrimestresAtras;
                                    
                                    // Garantir que inclua pelo menos o trimestre atual
                                    const trimestreAtual = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
                                    if (dataMaxima < trimestreAtual) dataMaxima = trimestreAtual;
                                  } else {
                                    // Fallback: últimos 8 trimestres
                                    dataMinima = new Date(now.getFullYear() - 2, now.getMonth(), 1);
                                    dataMaxima = now;
                                  }
                                  
                                  // Gerar trimestres do mínimo ao máximo
                                  const startQuarter = Math.floor(dataMinima.getMonth() / 3);
                                  const endQuarter = Math.floor(dataMaxima.getMonth() / 3);
                                  const startYear = dataMinima.getFullYear();
                                  const endYear = dataMaxima.getFullYear();
                                  
                                  for (let year = startYear; year <= endYear; year++) {
                                    const firstQ = (year === startYear) ? startQuarter : 0;
                                    const lastQ = (year === endYear) ? endQuarter : 3;
                                    
                                    for (let quarter = firstQ; quarter <= lastQ; quarter++) {
                                      const quarterStart = new Date(year, quarter * 3, 1);
                                      const quarterEnd = new Date(year, (quarter + 1) * 3, 0);
                                      const label = `${quarter + 1}º trim./${year.toString().slice(2)}`;
                                      
                                      dadosGrafico.push(calcularDadosPeriodo(quarterStart, quarterEnd, label));
                                    }
                                  }
                                } else if (tipoGrafico === 'anual') {
                                  // Últimos 10 anos
                                  for (let i = 9; i >= 0; i--) {
                                    const yearStart = new Date(now.getFullYear() - i, 0, 1);
                                    const yearEnd = new Date(now.getFullYear() - i + 1, 0, 0);
                                    const label = yearStart.getFullYear().toString();
                                    
                                    dadosGrafico.push(calcularDadosPeriodo(yearStart, yearEnd, label));
                                  }
                                } else {
                                  // Mensal - período dinâmico baseado nos leilões existentes
                                  // Encontrar a data mais antiga e mais recente dos leilões
                                  let dataMinima = new Date();
                                  let dataMaxima = new Date();
                                  
                                  if (auctions && auctions.length > 0) {
                                    // Corrigir problema de fuso horário na geração de períodos
                                    const datasLeiloes = auctions.map(a => new Date(a.dataInicio + 'T00:00:00.000'));
                                    dataMinima = new Date(Math.min(...datasLeiloes.map(d => d.getTime())));
                                    dataMaxima = new Date(Math.max(...datasLeiloes.map(d => d.getTime())));
                                    
                                    // Garantir pelo menos 12 meses de visualização
                                    const dozesMesesAtras = new Date(now.getFullYear(), now.getMonth() - 11, 1);
                                    if (dataMinima > dozesMesesAtras) dataMinima = dozesMesesAtras;
                                    
                                    // Garantir que inclua pelo menos o mês atual se há leilões futuros
                                    const mesAtual = new Date(now.getFullYear(), now.getMonth(), 1);
                                    if (dataMaxima < mesAtual) dataMaxima = mesAtual;
                                  } else {
                                    // Fallback: últimos 12 meses se não há leilões
                                    dataMinima = new Date(now.getFullYear(), now.getMonth() - 11, 1);
                                    dataMaxima = now;
                                  }
                                  
                                  // Gerar períodos mensais do mínimo ao máximo
                                  const startMonth = new Date(dataMinima.getFullYear(), dataMinima.getMonth(), 1);
                                  const endMonth = new Date(dataMaxima.getFullYear(), dataMaxima.getMonth(), 1);
                                  
                                  const current = new Date(startMonth);
                                  const mesesParaMostrar = [];
                                  
                                  while (current <= endMonth) {
                                    const monthStart = new Date(current.getFullYear(), current.getMonth(), 1);
                                    const monthEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0);
                                    const label = monthStart.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
                                    
                                    mesesParaMostrar.push({ start: monthStart, end: monthEnd, label });
                                    current.setMonth(current.getMonth() + 1);
                                  }
                                  
                                  // Limitar a 24 períodos para não ficar muito longo
                                  const mesesLimitados = mesesParaMostrar.slice(-24);
                                  
                                  for (const periodo of mesesLimitados) {
                                    dadosGrafico.push(calcularDadosPeriodo(periodo.start, periodo.end, periodo.label));
                                  }
                                }
                                
                                // Usar dadosGrafico ao invés de dadosMensais
                                const dadosMensais = dadosGrafico;
                                
                                // Salvar dados na ref para o handler de mouse fluido
                                dadosGraficoRef.current = dadosMensais;
                                
                                // Função para converter valor em coordenada Y baseada na nova escala
                                const valorParaY = (valor) => {
                                  // Pontos de referência da escala: [valor, posição Y]
                                  const pontos = [
                                    [8000000, 25],   // R$ 8M → topo
                                    [6000000, 75],   // R$ 6M
                                    [4000000, 125],  // R$ 4M  
                                    [3000000, 175],  // R$ 3M
                                    [2000000, 225],  // R$ 2M
                                    [1000000, 275],  // R$ 1M
                                    [500000, 325],   // R$ 500k
                                    [0, 375]         // R$ 0 → base
                                  ];
                                  
                                  // Se o valor é exatamente um dos pontos de referência
                                  for (let i = 0; i < pontos.length; i++) {
                                    if (valor === pontos[i][0]) {
                                      return pontos[i][1];
                                    }
                                  }
                                  
                                  // Interpolação linear entre os pontos mais próximos
                                  for (let i = 0; i < pontos.length - 1; i++) {
                                    const [valorSuperior, ySuperior] = pontos[i];
                                    const [valorInferior, yInferior] = pontos[i + 1];
                                    
                                    if (valor <= valorSuperior && valor >= valorInferior) {
                                      const proporcao = (valor - valorInferior) / (valorSuperior - valorInferior);
                                      return yInferior - proporcao * (yInferior - ySuperior);
                                    }
                                  }
                                  
                                  // Se valor está acima de 8M, usar o topo
                                  if (valor > 8000000) return 25;
                                  
                                  // Se valor está abaixo de 0, usar a base
                                  return 375;
                                };
                                
                                // Configuração das barras baseado na quantidade de períodos
                                const quantidadePeriodos = dadosMensais.length;
                                const larguraDisponivel = 1430 - 80; // Total menos margens
                                const larguraSegmento = larguraDisponivel / quantidadePeriodos;
                                const larguraBarra = Math.min(larguraSegmento * 0.3, 50); // Cada barra individual
                                const espacamentoBarra = 6; // Espaço entre faturamento e despesas
                                
                                // Função para calcular posição X das barras
                                const calcularXBarra = (indicePeriodo, tipoFaturamento = true) => {
                                  const centroSegmento = 80 + (indicePeriodo * larguraSegmento) + (larguraSegmento / 2);
                                  const larguraConjunto = (larguraBarra * 2) + espacamentoBarra;
                                  const inicioConjunto = centroSegmento - (larguraConjunto / 2);
                                  
                                  return tipoFaturamento 
                                    ? inicioConjunto 
                                    : inicioConjunto + larguraBarra + espacamentoBarra;
                                };
                                
                                // Para posicionamento de tooltips e linha vertical
                                const calcularCentroPeriodo = (indicePeriodo) => {
                                  return 80 + (indicePeriodo * larguraSegmento) + (larguraSegmento / 2);
                                };
                                
                                
                                const formatCurrency = (value) => {
                                  return new Intl.NumberFormat('pt-BR', {
                                    style: 'currency',
                                    currency: 'BRL',
                                    minimumFractionDigits: 0,
                                    maximumFractionDigits: 0
                                  }).format(value);
                                };
                                
                                return (
                                  <>
                                    {/* Highlight de fundo no segmento ativo - cor baseada no resultado */}
                                    {hoveredPoint && (() => {
                                      const lucroHover = hoveredPoint.faturamento - hoveredPoint.despesas;
                                      const corHighlight = lucroHover > 0 ? "#22C55E" : lucroHover < 0 ? "#EF4444" : "#9CA3AF";
                                      return (
                                        <rect
                                          x={80 + (hoveredPoint.index * larguraSegmento)}
                                          y="25"
                                          width={larguraSegmento}
                                          height="350"
                                          fill={corHighlight}
                                          fillOpacity="0.06"
                                          style={{ pointerEvents: 'none', transition: 'x 0.15s ease-out, opacity 0.15s ease-out' }}
                                        />
                                      );
                                    })()}
                                    
                                    {/* Barras de Faturamento */}
                                    {dadosMensais.map((dados, i) => {
                                      const alturaFaturamento = 375 - valorParaY(dados.faturamento);
                                      const isActive = hoveredPoint?.index === i;
                                      return (
                                        <rect
                                          key={`faturamento-${i}`}
                                          x={calcularXBarra(i, true)}
                                          y={valorParaY(dados.faturamento)}
                                          width={larguraBarra}
                                          height={Math.max(alturaFaturamento, 3)}
                                          fill={isActive ? "#4F46E5" : "#6366F1"}
                                          fillOpacity={alturaFaturamento < 3 ? "0.3" : isActive ? "1" : "0.85"}
                                          rx="4"
                                          ry="4"
                                          stroke="none"
                                          style={{ pointerEvents: 'none', transition: 'fill 0.15s ease, fill-opacity 0.15s ease' }}
                                        />
                                      );
                                    })}
                                    
                                    {/* Barras de Despesas */}
                                    {dadosMensais.map((dados, i) => {
                                      const alturaDespesas = 375 - valorParaY(dados.despesas);
                                      const isActive = hoveredPoint?.index === i;
                                      return (
                                        <rect
                                          key={`despesas-${i}`}
                                          x={calcularXBarra(i, false)}
                                          y={valorParaY(dados.despesas)}
                                          width={larguraBarra}
                                          height={Math.max(alturaDespesas, 3)}
                                          fill={isActive ? "#6B7280" : "#9CA3AF"}
                                          fillOpacity={alturaDespesas < 3 ? "0.3" : isActive ? "1" : "0.85"}
                                          rx="4"
                                          ry="4"
                                          stroke="none"
                                          style={{ pointerEvents: 'none', transition: 'fill 0.15s ease, fill-opacity 0.15s ease' }}
                                        />
                                      );
                                    })}
                                    
                                    {/* Linha vertical no hover */}
                                    {hoveredPoint && (
                                      <line
                                        x1={calcularCentroPeriodo(hoveredPoint.index)}
                                        y1="25"
                                        x2={calcularCentroPeriodo(hoveredPoint.index)}
                                        y2="375"
                                        stroke="#9CA3AF"
                                        strokeWidth="1"
                                        strokeDasharray="4,4"
                                        style={{ pointerEvents: 'none', transition: 'x1 0.1s ease-out, x2 0.1s ease-out' }}
                                      />
                                    )}
                                    
                                    {/* Tooltip */}
                                    {hoveredPoint && (
                                      <g style={{ pointerEvents: 'none' }}>
                                        {(() => {
                                          const pontoX = calcularCentroPeriodo(hoveredPoint.index);
                                          const larguraGrafico = 1400;
                                          const metadeGrafico = larguraGrafico / 2;
                                          const larguraTooltip = 200;
                                          const alturaTooltip = 150; // Aumentado para acomodar lucro
                                          
                                          // Calcular lucro
                                          const lucro = hoveredPoint.faturamento - hoveredPoint.despesas;
                                          const corBolaLucro = lucro >= 0 ? "#059669" : "#DC2626"; // Verde escuro se positivo, vermelho escuro se negativo
                                          
                                          // Se estiver na metade direita, posicionar à esquerda do ponto
                                          const estaDoLadoDireito = pontoX > metadeGrafico;
                                          const tooltipX = estaDoLadoDireito 
                                            ? pontoX - larguraTooltip - 15  // À esquerda do ponto
                                            : pontoX + 5;                   // À direita do ponto
                                          
                                          const textoPrincipalX = tooltipX + (estaDoLadoDireito ? 175 : 25);
                                          const textoCirculoX = tooltipX + (estaDoLadoDireito ? 175 : 25);
                                          const textoLabelX = tooltipX + (estaDoLadoDireito ? 165 : 35);
                                          const textAnchor = estaDoLadoDireito ? "end" : "start";
                                          
                                          return (
                                            <>
                                              {/* Sombra do tooltip */}
                                              <rect
                                                x={tooltipX + 2}
                                                y="7"
                                                width="200"
                                                height={alturaTooltip}
                                                rx="10"
                                                fill="black"
                                                fillOpacity="0.06"
                                                style={{ filter: 'blur(6px)' }}
                                              />
                                              <rect
                                                x={tooltipX}
                                                y="4"
                                                width="200"
                                                height={alturaTooltip}
                                                rx="10"
                                                fill="white"
                                                fillOpacity="0.95"
                                                stroke="#E5E7EB"
                                                strokeWidth="0.5"
                                              />
                                              <text
                                                x={textoPrincipalX}
                                                y="35"
                                                fill="#111827"
                                                fontSize="15"
                                                fontWeight="600"
                                                textAnchor={textAnchor}
                                              >
                                                {hoveredPoint.mes}
                                              </text>
                                              <g>
                                                <circle
                                                  cx={textoCirculoX}
                                                  cy="60"
                                                  r="4"
                                                  fill="#6366F1"
                                                />
                                                <text
                                                  x={textoLabelX}
                                                  y="65"
                                                  fill="#111827"
                                                  fontSize="14"
                                                  fontWeight="500"
                                                  textAnchor={textAnchor}
                                                >
                                                  Faturamento: {formatCurrency(hoveredPoint.faturamento)}
                                                </text>
                                              </g>
                                              <g>
                                                <circle
                                                  cx={textoCirculoX}
                                                  cy="90"
                                                  r="4"
                                                  fill="#9CA3AF"
                                                />
                                                <text
                                                  x={textoLabelX}
                                                  y="95"
                                                  fill="#111827"
                                                  fontSize="14"
                                                  fontWeight="500"
                                                  textAnchor={textAnchor}
                                                >
                                                  Despesas: {formatCurrency(hoveredPoint.despesas)}
                                                </text>
                                              </g>
                                              <g>
                                                <circle
                                                  cx={textoCirculoX}
                                                  cy="120"
                                                  r="4"
                                                  fill={corBolaLucro}
                                                />
                                                <text
                                                  x={textoLabelX}
                                                  y="125"
                                                  fill="#111827"
                                                  fontSize="14"
                                                  fontWeight="600"
                                                  textAnchor={textAnchor}
                                                >
                                                  {lucro >= 0 ? 'Lucro' : 'Prejuízo'}: {formatCurrency(Math.abs(lucro))}
                                                </text>
                                              </g>
                                            </>
                                          );
                                        })()}
                                      </g>
                                    )}
                                  </>
                                );
                              })()}
                              
                              {/* Labels do eixo Y */}
                              {[0, 1, 2, 3, 4, 5, 6, 7].map((tick) => {
                                // Valores com incrementos de 500k até 8M
                                const valoresFixos = ['R$ 0', 'R$ 500k', 'R$ 1M', 'R$ 2M', 'R$ 3M', 'R$ 4M', 'R$ 6M', 'R$ 8M'];
                                const value = valoresFixos[7 - tick]; // Inverter ordem para crescente
                                
                                return (
                                  <text
                                    key={tick}
                                    x="72"
                                    y={25 + tick * 50 + 4}
                                    fill="#64748b"
                                    fontSize="12"
                                    textAnchor="end"
                                  >
                                    {value}
                                  </text>
                                );
                              })}
                            </>
                          );
                        })()}
                      </svg>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

      </div>
      
      {/* Modal de Preview de Relatórios - igual ao da página Leilões */}
      <Dialog open={isPreviewModalOpen} onOpenChange={setIsPreviewModalOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Exportar Relatório - {previewType === 'leiloes' ? 'Leilões' : previewType === 'inadimplencia' ? 'Inadimplência' : previewType === 'historico' ? 'Histórico' : 'Faturas'}</DialogTitle>
            <p className="text-sm text-gray-600">
              Visualize como ficará o relatório antes de baixar
            </p>
          </DialogHeader>
          
          <div className="space-y-4 sm:space-y-6">
            {/* Tipo de Relatório */}
            <div>
              <Label htmlFor="report-type">Tipo de Relatório</Label>
              <Select value={previewType} onValueChange={(value) => setPreviewType(value as ('leiloes' | 'inadimplencia' | 'historico' | 'faturas'))}>
                <SelectTrigger className="focus:ring-0 focus:ring-offset-0 focus:outline-none">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="leiloes">
                    <div className="flex items-center gap-2">
                      <Gavel className="h-4 w-4" />
                      Relatório de Leilões
                    </div>
                  </SelectItem>
                  <SelectItem value="inadimplencia">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Relatório de Inadimplência
                    </div>
                  </SelectItem>
                  <SelectItem value="historico">
                    <div className="flex items-center gap-2">
                      <BarChart3 className="h-4 w-4" />
                      Relatório de Histórico
                    </div>
                  </SelectItem>
                  <SelectItem value="faturas">
                    <div className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4" />
                      Relatório de Faturas
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Filtro por Tipo de Pagamento (apenas para inadimplência) */}
            {previewType === 'inadimplencia' && (
              <div>
                <Label htmlFor="payment-type-filter">Filtrar por Tipo de Pagamento</Label>
                <Select value={paymentTypeFilter} onValueChange={(value) => setPaymentTypeFilter(value as ('todos' | 'a_vista' | 'parcelamento' | 'entrada_parcelamento'))}>
                  <SelectTrigger className="focus:ring-0 focus:ring-offset-0 focus:outline-none">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">
                      <div className="flex items-center gap-2">
                        <CreditCard className="h-4 w-4" />
                        Todos os tipos
                      </div>
                    </SelectItem>
                    <SelectItem value="a_vista">
                      <div className="flex items-center gap-2">
                        <CreditCard className="h-4 w-4" />
                        À vista
                      </div>
                    </SelectItem>
                    <SelectItem value="parcelamento">
                      <div className="flex items-center gap-2">
                        <CreditCard className="h-4 w-4" />
                        Parcelamento
                      </div>
                    </SelectItem>
                    <SelectItem value="entrada_parcelamento">
                      <div className="flex items-center gap-2">
                        <CreditCard className="h-4 w-4" />
                        Entrada + Parcelamento
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Preview do Relatório */}
            <div className="border rounded-lg overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 border-b">
                <h3 className="font-medium text-gray-900">Pré-visualização do Relatório</h3>
                <p className="text-sm text-gray-600">Este será o conteúdo do arquivo PDF</p>
              </div>
              <div className="max-h-96 overflow-y-auto p-4">
                <ReportPreview type={previewType} auctions={auctions || []} paymentTypeFilter={paymentTypeFilter} />
              </div>
            </div>

            {/* Botões de Ação */}
            <div className="flex gap-3 pt-4">
              <Button
                variant="outline"
                onClick={() => setIsPreviewModalOpen(false)}
                className="flex-1 hover:bg-gray-100 hover:text-gray-900"
              >
                Cancelar
              </Button>
              <Button
                onClick={() => handleDownloadFromPreview()}
                disabled={isGenerating}
                className="flex-1 bg-black hover:bg-gray-800 text-white btn-download-click"
              >
                <Download className="h-4 w-4 mr-2" />
                {isGenerating ? 'Gerando...' : 'Gerar e Baixar PDF'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modal temporário invisível para geração de PDF */}
      <Dialog open={isExportModalOpen} onOpenChange={() => {}}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto" style={{ display: 'none', visibility: 'hidden' }}>
          <DialogHeader style={{ display: 'none' }}>
            <DialogTitle>Gerando Relatório...</DialogTitle>
          </DialogHeader>
          
          {/* Renderizar ReportPreview para ter o mesmo layout do preview */}
          {selectedAuctionForExport && auctions && (
            <div id="pdf-content" style={{ display: 'block', visibility: 'visible' }}>
              <ReportPreview type={previewType} auctions={auctions.filter(a => !a.arquivado)} paymentTypeFilter={paymentTypeFilter} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Componente de Preview do Relatório
const ReportPreview = ({ type, auctions, paymentTypeFilter = 'todos' }: { 
  type: 'leiloes' | 'inadimplencia' | 'historico' | 'faturas', 
  auctions: Auction[], 
  paymentTypeFilter?: 'todos' | 'a_vista' | 'parcelamento' | 'entrada_parcelamento' 
}) => {
  if (!auctions || auctions.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500 border-2 border-dashed border-gray-200 rounded-lg">
        <div className="text-sm">Nenhum leilão encontrado para gerar o relatório.</div>
        <div className="text-xs text-gray-400 mt-2">Verifique se existem leilões cadastrados no sistema.</div>
      </div>
    );
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Não informado';
    try {
      return new Date(dateString + 'T00:00:00').toLocaleDateString('pt-BR');
    } catch {
      return 'Data inválida';
    }
  };

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

  const formatCurrency = (value: string | number | undefined) => {
    if (!value && value !== 0) return 'R$ 0,00';
    
    if (typeof value === 'number') {
      return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
      }).format(value);
    }
    
    if (typeof value === 'string') {
      // Se já tem formatação R$, usa parseCurrencyToNumber para converter corretamente
      if (value.startsWith('R$')) {
        const numericValue = parseCurrencyToNumber(value);
          return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
          }).format(numericValue);
        }
      
      // Para strings sem R$, tenta converter diretamente
      const numericValue = parseCurrencyToNumber(`R$ ${value}`);
      if (!isNaN(numericValue) && numericValue > 0) {
          return new Intl.NumberFormat('pt-BR', {
            style: 'currency',
            currency: 'BRL'
          }).format(numericValue);
        }
      
      // Se não conseguiu converter, adiciona R$ se não tiver
      return `R$ ${value}`;
    }
    
    return 'R$ 0,00';
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'agendado': return 'AGENDADO';
      case 'em_andamento': return 'EM ANDAMENTO';
      case 'finalizado': return 'FINALIZADO';
      default: return status?.toUpperCase() || 'NÃO INFORMADO';
    }
  };

  const getLocalLabel = (local: string) => {
    switch (local) {
      case 'presencial': return 'PRESENCIAL';
      case 'online': return 'ONLINE';
      case 'hibrido': return 'HÍBRIDO';
      default: return local?.toUpperCase() || 'NÃO INFORMADO';
    }
  };

  if (type === 'leiloes') {
    const leiloesAtivos = auctions.filter(a => !a.arquivado);
    const totalLeiloes = leiloesAtivos.length;
    const emAndamento = leiloesAtivos.filter(a => a.status === 'em_andamento').length;
    const finalizados = leiloesAtivos.filter(a => a.status === 'finalizado').length;
    const leiloesAgendados = leiloesAtivos.filter(a => a.status === 'agendado').length;

    const sLabel = { fontSize: '11px', fontWeight: 600, color: '#999', textTransform: 'uppercase' as const, letterSpacing: '0.08em', margin: '0 0 4px 0' } as React.CSSProperties;
    const sValue = { fontSize: '14px', color: '#1a1a1a', margin: 0, fontWeight: 500 } as React.CSSProperties;
    const sValueLg = { fontSize: '22px', fontWeight: 300, color: '#1a1a1a', margin: 0, letterSpacing: '-0.02em' } as React.CSSProperties;
    const sSep = { border: 'none', borderTop: '1px solid #eee', margin: '28px 0' } as React.CSSProperties;
    const sSection = { fontSize: '11px', fontWeight: 600, color: '#999', textTransform: 'uppercase' as const, letterSpacing: '0.08em', margin: '0 0 16px 0' } as React.CSSProperties;

    const getTipoPagLabel = (tipo: string) => {
      const l: Record<string, string> = { a_vista: 'À vista', parcelamento: 'Parcelamento', entrada_parcelamento: 'Entrada + Parcelamento' };
      return l[tipo] || tipo;
    };

    const getMesLbl = (mesStr: string) => {
      const meses = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
      if (mesStr.includes('-')) { const [ano, mes] = mesStr.split('-'); return `${meses[parseInt(mes) - 1]}/${ano}`; }
      return meses[parseInt(mesStr) - 1] || mesStr;
    };

    return (
      <div style={{ background: 'white', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", padding: '48px 40px', fontSize: '13px', lineHeight: '1.6', color: '#1a1a1a' }}>
        
        {/* Cabeçalho */}
        <div style={{ marginBottom: '8px' }}>
          <h1 style={{ fontSize: '26px', fontWeight: 600, color: '#1a1a1a', margin: '0 0 4px 0', letterSpacing: '-0.02em' }}>
            Relatório de Leilões
          </h1>
          <p style={{ fontSize: '12px', color: '#999', margin: 0 }}>
            {new Date().toLocaleDateString('pt-BR')} &middot; {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>

        <hr style={sSep} />

        {/* Resumo */}
        {totalLeiloes > 0 && (
          <div style={{ pageBreakInside: 'avoid' }}>
            <p style={sSection}>Resumo</p>
            <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 100px' }}>
                <p style={sLabel}>Total</p>
                <p style={sValueLg}>{totalLeiloes}</p>
              </div>
              <div style={{ flex: '1 1 100px' }}>
                <p style={sLabel}>Em Andamento</p>
                <p style={sValueLg}>{emAndamento}</p>
              </div>
              <div style={{ flex: '1 1 100px' }}>
                <p style={sLabel}>Finalizados</p>
                <p style={sValueLg}>{finalizados}</p>
              </div>
              <div style={{ flex: '1 1 100px' }}>
                <p style={sLabel}>Agendados</p>
                <p style={sValueLg}>{leiloesAgendados}</p>
              </div>
            </div>
          </div>
        )}

        {/* Lista de Leilões */}
        {leiloesAtivos.map((auction, index) => (
          <div key={auction.id} style={{ pageBreakBefore: index > 0 ? 'always' : 'avoid' }}>
            <hr style={{ ...sSep, margin: '36px 0' }} />

            {/* Header do leilão */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px', pageBreakInside: 'avoid' }}>
              <div>
                <h2 style={{ fontSize: '20px', fontWeight: 600, color: '#1a1a1a', margin: '0 0 2px 0', letterSpacing: '-0.01em' }}>
                  {auction.nome}
                </h2>
                <p style={{ fontSize: '12px', color: '#999', margin: 0 }}>
                  {auction.identificacao && <span style={{ fontFamily: 'monospace' }}>#{auction.identificacao} &middot; </span>}
                  {formatDate(auction.dataInicio)}
                  {auction.dataEncerramento && <span> &mdash; {formatDate(auction.dataEncerramento)}</span>}
                  {' '}&middot; {getLocalLabel(auction.local).charAt(0) + getLocalLabel(auction.local).slice(1).toLowerCase()}
                  {auction.endereco && ` &middot; ${auction.endereco}`}
                </p>
              </div>
              <span style={{
                padding: '3px 10px',
                borderRadius: '4px',
                fontSize: '10px',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                background: auction.status === 'em_andamento' ? '#f0fdf4' : auction.status === 'finalizado' ? '#f3f4f6' : '#fafafa',
                color: auction.status === 'em_andamento' ? '#16a34a' : '#666',
                border: `1px solid ${auction.status === 'em_andamento' ? '#bbf7d0' : '#e5e7eb'}`,
                whiteSpace: 'nowrap',
                flexShrink: 0,
              }}>
                {getStatusLabel(auction.status)}
              </span>
            </div>

            {/* Financeiro do leilão */}
            <div style={{ marginTop: '20px', pageBreakInside: 'avoid' }}>
              <p style={sSection}>Financeiro</p>
              <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 180px' }}>
                  <p style={sLabel}>Investimento</p>
                  <p style={sValueLg}>{formatCurrency(auction.custosNumerico || auction.custos)}</p>
                </div>
                {auction.detalhePatrocinios && auction.detalhePatrocinios.filter(p => p.recebido === true).length > 0 && (
                  <div style={{ flex: '1 1 180px' }}>
                    <p style={sLabel}>Patrocínios Recebidos</p>
                    <p style={sValueLg}>
                      {formatCurrency(auction.detalhePatrocinios.filter(p => p.recebido === true).reduce((sum, p) => sum + (p.valorNumerico || 0), 0))}
                    </p>
                  </div>
                )}
              </div>

              {/* Custos */}
              {auction.detalheCustos && auction.detalheCustos.length > 0 && (
                <div style={{ marginTop: '16px' }}>
                  <p style={{ ...sLabel, marginBottom: '6px' }}>Especificação dos Gastos</p>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <tbody>
                      {auction.detalheCustos.map((item: ItemCustoInfo, i: number) => (
                        <tr key={item.id || i} style={{ borderBottom: '1px solid #f5f5f5' }}>
                          <td style={{ padding: '5px 0', color: '#666' }}>{item.descricao || 'Item de custo'}</td>
                          <td style={{ padding: '5px 0', textAlign: 'right', fontWeight: 500, color: '#1a1a1a' }}>{formatCurrency(item.valorNumerico)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Patrocinadores */}
              {auction.detalhePatrocinios && (() => {
                const recebidos = auction.detalhePatrocinios.filter(p => p.recebido === true);
                if (recebidos.length === 0) return null;
                return (
                  <div style={{ marginTop: '16px' }}>
                    <p style={{ ...sLabel, marginBottom: '6px' }}>Patrocinadores</p>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                      <tbody>
                        {recebidos.map((item: ItemPatrocinioInfo, i: number) => (
                          <tr key={item.id || i} style={{ borderBottom: '1px solid #f5f5f5' }}>
                            <td style={{ padding: '5px 0', color: '#666' }}>{item.nomePatrocinador || 'Patrocinador'}</td>
                            <td style={{ padding: '5px 0', textAlign: 'right', fontWeight: 500, color: '#1a1a1a' }}>{formatCurrency(item.valorNumerico)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </div>

            {/* Lotes */}
            {auction.lotes && auction.lotes.length > 0 && (
              <div style={{ marginTop: '24px', pageBreakInside: 'avoid' }}>
                <p style={sSection}>Lotes ({auction.lotes.length})</p>
                {auction.lotes.map((lote, li) => {
                  const arrematante = auction.arrematantes?.find(arr => arr.loteId === lote.id);
                  return (
                    <div key={lote.id || li} style={{ padding: '12px 0', borderBottom: li < auction.lotes!.length - 1 ? '1px solid #f0f0f0' : 'none', pageBreakInside: 'avoid' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <p style={{ fontSize: '13px', fontWeight: 600, color: '#1a1a1a', margin: '0 0 2px 0' }}>Lote {lote.numero}</p>
                          {lote.descricao && <p style={{ fontSize: '12px', color: '#999', margin: 0 }}>{lote.descricao}</p>}
                        </div>
                        {lote.tipoPagamento && (
                          <span style={{ fontSize: '11px', color: '#999' }}>{getTipoPagLabel(lote.tipoPagamento)}</span>
                        )}
                      </div>

                      {/* Mercadorias */}
                      {lote.mercadorias && lote.mercadorias.length > 0 && (
                        <div style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>
                          {lote.mercadorias.map((m, mi) => (
                            <p key={m.id || mi} style={{ margin: '1px 0' }}>
                              {m.titulo || m.tipo || 'Mercadoria'}
                              {m.descricao && ` — ${m.descricao}`}
                              {m.quantidade && <span style={{ color: '#ccc' }}> (Qtd: {m.quantidade})</span>}
                            </p>
                          ))}
                        </div>
                      )}

                      {/* Arrematante + Pagamento */}
                      {arrematante && arrematante.tipoPagamento && (
                        <div style={{ marginTop: '8px', fontSize: '12px', color: '#666' }}>
                          <span style={{ fontWeight: 500 }}>Arrematante:</span> {arrematante.nome || 'Não informado'}
                          <span style={{ margin: '0 6px', color: '#ddd' }}>|</span>
                          <span>{getTipoPagLabel(arrematante.tipoPagamento)}</span>
                          {arrematante.quantidadeParcelas && arrematante.quantidadeParcelas > 1 && (
                            <span> &middot; {arrematante.quantidadeParcelas} parcelas</span>
                          )}
                          {arrematante.mesInicioPagamento && (
                            <span> &middot; Início: {getMesLbl(arrematante.mesInicioPagamento)}</span>
                          )}
                          {arrematante.diaVencimentoMensal && (
                            <span> &middot; Venc. dia {arrematante.diaVencimentoMensal}</span>
                          )}
                          {arrematante.dataVencimentoVista && (
                            <span> &middot; Venc. {formatDate(arrematante.dataVencimentoVista)}</span>
                          )}
                          {arrematante.dataEntrada && (
                            <span> &middot; Entrada: {formatDate(arrematante.dataEntrada)}</span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}

        {leiloesAtivos.length > 3 && (
          <div style={{ textAlign: 'center', padding: '24px 0', marginTop: '24px' }}>
            <p style={{ fontSize: '12px', color: '#999', margin: 0 }}>
              Pré-visualização parcial &middot; O PDF completo incluirá todos os {leiloesAtivos.length} leilões.
            </p>
          </div>
        )}

        {/* Logos Elionx e Arthur Lira */}
        <div className="mt-4 sm:mt-6 lg:mt-8 flex justify-center items-center -ml-20">
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
  }

  if (type === 'inadimplencia') {
    // Função para calcular dias de atraso
    const calcularDiasAtraso = (dataVencimento: string) => {
      const hoje = new Date();
      const vencimento = new Date(dataVencimento);
      vencimento.setHours(23, 59, 59, 999);
      
      if (hoje <= vencimento) return 0;
      
      const diffTime = hoje.getTime() - vencimento.getTime();
      return Math.floor(diffTime / (1000 * 60 * 60 * 24));
    };

    // Lógica de inadimplência aprimorada para preview
    const inadimplentes = auctions.filter(auction => {
      if (!auction.arrematante || auction.arrematante.pago) return false;
      
      const now = new Date();
      const loteArrematado = auction.arrematante?.loteId 
        ? auction.lotes?.find(lote => lote.id === auction.arrematante.loteId)
        : null;
      
      const tipoPagamento = loteArrematado?.tipoPagamento || auction.tipoPagamento;
      
      // Aplicar filtro por tipo de pagamento
      if (paymentTypeFilter !== 'todos' && tipoPagamento !== paymentTypeFilter) {
        return false;
      }
      
      if (tipoPagamento === 'a_vista') {
        const dataVencimento = loteArrematado?.dataVencimentoVista || auction.dataVencimentoVista;
        if (dataVencimento) {
          const dueDate = new Date(dataVencimento);
          dueDate.setHours(23, 59, 59, 999);
          return now > dueDate;
        }
      }
      
      if (tipoPagamento === 'entrada_parcelamento') {
        const dataEntrada = loteArrematado?.dataEntrada || auction.dataEntrada;
        const parcelasPagas = auction.arrematante?.parcelasPagas || 0;
        let isEntradaAtrasada = false;
        let isParcelaAtrasada = false;
        
        // Verificar entrada (só se não foi paga)
        if (dataEntrada && parcelasPagas === 0) {
          const entryDueDate = new Date(dataEntrada);
          entryDueDate.setHours(23, 59, 59, 999);
          isEntradaAtrasada = now > entryDueDate;
      }
      
        // Verificar primeira parcela (independente da entrada)
      if (auction.arrematante.mesInicioPagamento && auction.arrematante.diaVencimentoMensal) {
        try {
          let year: number, month: number;
          
          if (auction.arrematante.mesInicioPagamento.includes('-')) {
            [year, month] = auction.arrematante.mesInicioPagamento.split('-').map(Number);
          } else {
            year = new Date().getFullYear();
            month = parseInt(auction.arrematante.mesInicioPagamento);
          }
          
            const quantidadeParcelas = auction.arrematante?.quantidadeParcelas || 12;
            
            // Determinar a partir de qual parcela verificar
            let parcelaInicioIndex = 0;
            if (parcelasPagas > 0) {
              // Entrada foi paga, verificar a partir da próxima parcela não paga
              parcelaInicioIndex = parcelasPagas - 1; // -1 porque parcelasPagas inclui a entrada
            }
            
            // Verificar se há pelo menos uma parcela em atraso
            for (let i = parcelaInicioIndex; i < quantidadeParcelas; i++) {
              const parcelaDate = new Date(year, month - 1 + i, auction.arrematante.diaVencimentoMensal);
              parcelaDate.setHours(23, 59, 59, 999);
              
              if (now > parcelaDate) {
                isParcelaAtrasada = true;
                break; // Encontrou pelo menos uma parcela em atraso
              } else {
                // Se chegou em uma parcela que não está atrasada, para de verificar
                break;
              }
            }
          } catch (error) {
            logger.error('Erro ao calcular inadimplência de parcela:', error);
          }
        }
        
        // Se entrada foi paga e não há parcelas atrasadas, não é inadimplente
        if (parcelasPagas > 0 && !isParcelaAtrasada) {
          return false;
        }
        
        return isEntradaAtrasada || isParcelaAtrasada;
      }
      
      // Para parcelamento simples
      if (tipoPagamento === 'parcelamento' && auction.arrematante.mesInicioPagamento && auction.arrematante.diaVencimentoMensal) {
        try {
          let year: number, month: number;
          
          if (auction.arrematante.mesInicioPagamento.includes('-')) {
            [year, month] = auction.arrematante.mesInicioPagamento.split('-').map(Number);
          } else {
            year = new Date().getFullYear();
            month = parseInt(auction.arrematante.mesInicioPagamento);
          }
          
          const parcelasPagas = auction.arrematante?.parcelasPagas || 0;
          const quantidadeParcelas = auction.arrematante?.quantidadeParcelas || 12;
          
          // Verificar se há pelo menos uma parcela em atraso
          for (let i = parcelasPagas; i < quantidadeParcelas; i++) {
            const parcelaDate = new Date(year, month - 1 + i, auction.arrematante.diaVencimentoMensal);
            parcelaDate.setHours(23, 59, 59, 999);
            
            if (now > parcelaDate) {
              return true; // Encontrou pelo menos uma parcela em atraso
            } else {
              // Se chegou em uma parcela que não está atrasada, para de verificar
              break;
            }
          }
        } catch (error) {
          logger.error('Erro ao calcular inadimplência:', error);
        }
      }
      
      return false;
    }).map(auction => {
      // Enriquecer dados com informações de inadimplência
      const loteArrematado = auction.arrematante?.loteId 
        ? auction.lotes?.find(lote => lote.id === auction.arrematante.loteId)
        : null;
      
      const tipoPagamento = loteArrematado?.tipoPagamento || auction.tipoPagamento;
      const valorTotal = auction.arrematante?.valorPagarNumerico || 
        (auction.arrematante?.valorPagar ? parseCurrencyToNumber(auction.arrematante.valorPagar) : 0);
      
      let detalhesInadimplencia = {
        tipoAtraso: '',
        valorEmAtraso: 0,
        dataVencimento: '',
        diasAtraso: 0,
        proximoVencimento: '',
        valorEntrada: 0,
        valorParcela: 0,
        parcelasAtrasadas: 0
      };

      if (tipoPagamento === 'a_vista') {
        const dataVencimento = loteArrematado?.dataVencimentoVista || auction.dataVencimentoVista;
        if (dataVencimento) {
          // Calcular valor com juros progressivos para pagamento à vista
          const percentualJuros = auction.arrematante?.percentualJurosAtraso || 0;
          const valorComJuros = percentualJuros > 0 
            ? calcularJurosProgressivos(valorTotal, dataVencimento, percentualJuros)
            : valorTotal;
          
          detalhesInadimplencia = {
            tipoAtraso: 'Pagamento à Vista',
            valorEmAtraso: valorComJuros,
            dataVencimento: dataVencimento,
            diasAtraso: calcularDiasAtraso(dataVencimento),
            proximoVencimento: dataVencimento,
            valorEntrada: 0,
            valorParcela: 0,
            parcelasAtrasadas: 1
          };
        }
      } else if (tipoPagamento === 'entrada_parcelamento') {
        const dataEntrada = loteArrematado?.dataEntrada || auction.dataEntrada;
        const valorEntrada = auction.arrematante?.valorEntrada ? 
          (typeof auction.arrematante.valorEntrada === 'string' ? 
            parseCurrencyToNumber(auction.arrematante.valorEntrada) : 
            auction.arrematante.valorEntrada) : 
          valorTotal * 0.3;
        
        const quantidadeParcelas = auction.arrematante?.quantidadeParcelas || 12;
        
        // Calcular estrutura de parcelas usando configuração real (triplas, duplas, simples)
        const estruturaParcelas = calcularEstruturaParcelas(
          valorTotal,
          auction.arrematante?.parcelasTriplas || 0,
          auction.arrematante?.parcelasDuplas || 0,
          auction.arrematante?.parcelasSimples || 0
        );
        
        // Valor da primeira parcela como referência (para exibição)
        const valorPorParcela = estruturaParcelas[0]?.valor || (valorTotal / quantidadeParcelas);
        const parcelasPagas = auction.arrematante?.parcelasPagas || 0;
        
        const hoje = new Date();
        let isEntradaAtrasada = false;
        let isParcelaAtrasada = false;
        let dataVencimentoParcela = '';
        
        // Verificar se entrada está atrasada (só se não foi paga)
        if (dataEntrada && parcelasPagas === 0) {
          const vencimentoEntrada = new Date(dataEntrada);
          vencimentoEntrada.setHours(23, 59, 59, 999);
          isEntradaAtrasada = hoje > vencimentoEntrada;
        }
        
        // Verificar quantas parcelas estão atrasadas
        let parcelasAtrasadasCount = 0;
        let valorTotalParcelasAtrasadas = 0;
        let dataPrimeiraParcelaAtrasada = '';
        const percentualJuros = auction.arrematante?.percentualJurosAtraso || 0;
        
        if (auction.arrematante?.mesInicioPagamento && auction.arrematante?.diaVencimentoMensal) {
          try {
            let year: number, month: number;
            
            if (auction.arrematante.mesInicioPagamento.includes('-')) {
              [year, month] = auction.arrematante.mesInicioPagamento.split('-').map(Number);
            } else {
              year = new Date().getFullYear();
              month = parseInt(auction.arrematante.mesInicioPagamento);
            }
            
            // Determinar a partir de qual parcela verificar
            let parcelaInicioIndex = 0;
            if (parcelasPagas > 0) {
              // Entrada foi paga, verificar a partir da próxima parcela não paga
              parcelaInicioIndex = parcelasPagas - 1; // -1 porque parcelasPagas inclui a entrada
            }
            
            // Verificar todas as parcelas que deveriam ter sido pagas até hoje
            for (let i = parcelaInicioIndex; i < quantidadeParcelas; i++) {
              const parcelaDate = new Date(year, month - 1 + i, auction.arrematante.diaVencimentoMensal);
              parcelaDate.setHours(23, 59, 59, 999);
              
              if (hoje > parcelaDate) {
                parcelasAtrasadasCount++;
                const dataVencimentoStr = parcelaDate.toISOString().split('T')[0];
                // Usar valor real da parcela baseado na estrutura (tripla, dupla, simples)
                const valorRealParcela = estruturaParcelas[i]?.valor || valorPorParcela;
                // Aplicar juros progressivos na parcela atrasada
                const valorParcelaComJuros = calcularJurosProgressivos(valorRealParcela, dataVencimentoStr, percentualJuros);
                valorTotalParcelasAtrasadas += valorParcelaComJuros;
                
                // Guardar a data da primeira parcela atrasada
                if (parcelasAtrasadasCount === 1) {
                  dataPrimeiraParcelaAtrasada = parcelaDate.toISOString().split('T')[0];
                }
              } else {
                // Se chegou em uma parcela que não está atrasada, para de contar
                break;
              }
            }
            
            if (parcelasAtrasadasCount > 0) {
              isParcelaAtrasada = true;
              dataVencimentoParcela = dataPrimeiraParcelaAtrasada;
            }
          } catch (error) {
            logger.error('Erro ao calcular vencimento de parcela:', error);
          }
        }
        
        // Calcular valor da entrada com juros se atrasada
        const valorEntradaComJuros = (isEntradaAtrasada && dataEntrada && percentualJuros > 0) 
          ? calcularJurosProgressivos(valorEntrada, dataEntrada, percentualJuros) 
          : valorEntrada;
        
        // Determinar qual atraso priorizar e calcular valor total em atraso
        if (isEntradaAtrasada && isParcelaAtrasada) {
          // Ambos em atraso - somar entrada + todas as parcelas atrasadas
          const dataEntradaDate = new Date(dataEntrada);
          const dataParcelaDate = new Date(dataVencimentoParcela);
          const dataMaisAntiga = dataEntradaDate < dataParcelaDate ? dataEntrada : dataVencimentoParcela;
          
          detalhesInadimplencia = {
            tipoAtraso: `Entrada + ${parcelasAtrasadasCount} Parcela${parcelasAtrasadasCount > 1 ? 's' : ''} em Atraso`,
            valorEmAtraso: valorEntradaComJuros + valorTotalParcelasAtrasadas,
            dataVencimento: dataMaisAntiga,
            diasAtraso: calcularDiasAtraso(dataMaisAntiga),
            proximoVencimento: dataMaisAntiga,
            valorEntrada: valorEntradaComJuros,
            valorParcela: valorPorParcela,
            parcelasAtrasadas: 1 + parcelasAtrasadasCount // entrada + parcelas
          };
        } else if (isEntradaAtrasada) {
          detalhesInadimplencia = {
            tipoAtraso: 'Entrada em Atraso',
            valorEmAtraso: valorEntradaComJuros,
            dataVencimento: dataEntrada,
            diasAtraso: calcularDiasAtraso(dataEntrada),
            proximoVencimento: dataEntrada,
            valorEntrada: valorEntradaComJuros,
            valorParcela: valorPorParcela,
            parcelasAtrasadas: 1
          };
        } else if (isParcelaAtrasada && dataVencimentoParcela) {
          detalhesInadimplencia = {
            tipoAtraso: `${parcelasAtrasadasCount} Parcela${parcelasAtrasadasCount > 1 ? 's' : ''} em Atraso`,
            valorEmAtraso: valorTotalParcelasAtrasadas,
            dataVencimento: dataVencimentoParcela,
            diasAtraso: calcularDiasAtraso(dataVencimentoParcela),
            proximoVencimento: dataVencimentoParcela,
            valorEntrada: valorEntrada,
            valorParcela: valorPorParcela,
            parcelasAtrasadas: parcelasAtrasadasCount
          };
        }
      } else {
        // Parcelamento simples
        if (auction.arrematante.mesInicioPagamento && auction.arrematante.diaVencimentoMensal) {
          try {
            let year: number, month: number;
            
            if (auction.arrematante.mesInicioPagamento.includes('-')) {
              [year, month] = auction.arrematante.mesInicioPagamento.split('-').map(Number);
            } else {
              year = new Date().getFullYear();
              month = parseInt(auction.arrematante.mesInicioPagamento);
            }
            
            const parcelasPagas = auction.arrematante?.parcelasPagas || 0;
            const quantidadeParcelas = auction.arrematante?.quantidadeParcelas || 12;
            
            // Calcular estrutura de parcelas usando configuração real (triplas, duplas, simples)
            const estruturaParcelas = calcularEstruturaParcelas(
              valorTotal,
              auction.arrematante?.parcelasTriplas || 0,
              auction.arrematante?.parcelasDuplas || 0,
              auction.arrematante?.parcelasSimples || 0
            );
            
            // Valor da primeira parcela como referência (para exibição)
            const valorPorParcela = estruturaParcelas[0]?.valor || (valorTotal / quantidadeParcelas);
            const percentualJuros = auction.arrematante?.percentualJurosAtraso || 0;
            
            // Contar todas as parcelas em atraso
            let parcelasAtrasadasCount = 0;
            let valorTotalParcelasAtrasadas = 0;
            let dataPrimeiraParcelaAtrasada = '';
            
            const hoje = new Date();
            
            // Verificar todas as parcelas que deveriam ter sido pagas até hoje
            for (let i = parcelasPagas; i < quantidadeParcelas; i++) {
              const parcelaDate = new Date(year, month - 1 + i, auction.arrematante.diaVencimentoMensal);
              parcelaDate.setHours(23, 59, 59, 999);
              
              if (hoje > parcelaDate) {
                parcelasAtrasadasCount++;
                const dataVencimentoStr = parcelaDate.toISOString().split('T')[0];
                // Usar valor real da parcela baseado na estrutura (tripla, dupla, simples)
                const valorRealParcela = estruturaParcelas[i]?.valor || valorPorParcela;
                // Aplicar juros progressivos na parcela atrasada
                const valorParcelaComJuros = calcularJurosProgressivos(valorRealParcela, dataVencimentoStr, percentualJuros);
                valorTotalParcelasAtrasadas += valorParcelaComJuros;
                
                // Guardar a data da primeira parcela atrasada
                if (parcelasAtrasadasCount === 1) {
                  dataPrimeiraParcelaAtrasada = parcelaDate.toISOString().split('T')[0];
                }
              } else {
                // Se chegou em uma parcela que não está atrasada, para de contar
                break;
              }
            }
            
            if (parcelasAtrasadasCount > 0) {
              detalhesInadimplencia = {
                tipoAtraso: `${parcelasAtrasadasCount} Parcela${parcelasAtrasadasCount > 1 ? 's' : ''} em Atraso`,
                valorEmAtraso: valorTotalParcelasAtrasadas,
                dataVencimento: dataPrimeiraParcelaAtrasada,
                diasAtraso: calcularDiasAtraso(dataPrimeiraParcelaAtrasada),
                proximoVencimento: dataPrimeiraParcelaAtrasada,
                valorEntrada: 0,
                valorParcela: valorPorParcela,
                parcelasAtrasadas: parcelasAtrasadasCount
              };
            }
          } catch (error) {
            logger.error('Erro ao calcular detalhes de inadimplência:', error);
          }
        }
      }

      return {
        ...auction,
        detalhesInadimplencia
      };
    });

    // Calcular estatísticas gerais
    const valorTotalInadimplencia = inadimplentes.reduce((sum, auction) => 
      sum + (auction.detalhesInadimplencia?.valorEmAtraso || 0), 0);
    
    const diasAtrasoMedio = inadimplentes.length > 0 ? 
      inadimplentes.reduce((sum, auction) => sum + (auction.detalhesInadimplencia?.diasAtraso || 0), 0) / inadimplentes.length : 0;

    const sLabel = { fontSize: '11px', fontWeight: 600, color: '#999', textTransform: 'uppercase' as const, letterSpacing: '0.08em', margin: '0 0 4px 0' } as React.CSSProperties;
    const sValueLg = { fontSize: '22px', fontWeight: 300, color: '#1a1a1a', margin: 0, letterSpacing: '-0.02em' } as React.CSSProperties;
    const sSep = { border: 'none', borderTop: '1px solid #eee', margin: '28px 0' } as React.CSSProperties;
    const sSection = { fontSize: '11px', fontWeight: 600, color: '#999', textTransform: 'uppercase' as const, letterSpacing: '0.08em', margin: '0 0 16px 0' } as React.CSSProperties;
    const sRow = { display: 'flex', fontSize: '12px', padding: '4px 0' } as React.CSSProperties;
    const sRowLabel = { color: '#999', width: '120px', flexShrink: 0 } as React.CSSProperties;
    const sRowValue = { color: '#1a1a1a', fontWeight: 500 } as React.CSSProperties;

    const getTipoPagLabel = (tipo: string) => {
      const l: Record<string, string> = { a_vista: 'À vista', parcelamento: 'Parcelamento', entrada_parcelamento: 'Entrada + Parcelamento' };
      return l[tipo] || tipo;
    };

    return (
      <div style={{ background: 'white', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", padding: '48px 40px', fontSize: '13px', lineHeight: '1.6', color: '#1a1a1a' }}>

        {/* Cabeçalho */}
        <div style={{ marginBottom: '8px' }}>
          <h1 style={{ fontSize: '26px', fontWeight: 600, color: '#1a1a1a', margin: '0 0 4px 0', letterSpacing: '-0.02em' }}>
            Relatório de Inadimplência
            {paymentTypeFilter !== 'todos' && (
              <span style={{ fontSize: '16px', fontWeight: 300, color: '#999' }}>
                {' '}&middot; {paymentTypeFilter === 'a_vista' ? 'À Vista' : paymentTypeFilter === 'parcelamento' ? 'Parcelamento' : 'Entrada + Parcelamento'}
              </span>
            )}
          </h1>
          <p style={{ fontSize: '12px', color: '#999', margin: 0 }}>
            {new Date().toLocaleDateString('pt-BR')} &middot; {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>

        <hr style={sSep} />

        {/* Resumo */}
        {inadimplentes.length > 0 && (
          <div style={{ pageBreakInside: 'avoid' }}>
            <p style={sSection}>Resumo</p>
            <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 100px' }}>
                <p style={sLabel}>Casos</p>
                <p style={{ ...sValueLg, color: '#dc2626' }}>{inadimplentes.length}</p>
              </div>
              <div style={{ flex: '1 1 140px' }}>
                <p style={sLabel}>Valor em Atraso</p>
                <p style={{ ...sValueLg, color: '#dc2626' }}>{formatCurrency(valorTotalInadimplencia)}</p>
              </div>
              <div style={{ flex: '1 1 100px' }}>
                <p style={sLabel}>Dias Médio</p>
                <p style={{ ...sValueLg, color: '#dc2626' }}>{Math.round(diasAtrasoMedio)}</p>
              </div>
              <div style={{ flex: '1 1 100px' }}>
                <p style={sLabel}>Críticos (+30d)</p>
                <p style={{ ...sValueLg, color: '#dc2626' }}>{inadimplentes.filter(a => a.detalhesInadimplencia?.diasAtraso > 30).length}</p>
              </div>
            </div>
          </div>
        )}

        {/* Lista de Inadimplentes */}
        {inadimplentes.length > 0 ? (
          <div>
            {inadimplentes.slice(0, 3).map((auction, index) => {
              const loteComprado = auction.arrematante?.loteId ? auction.lotes?.find(lote => lote.id === auction.arrematante.loteId) : null;
              const tipoPagamento = loteComprado?.tipoPagamento || auction.tipoPagamento;
              const gravidade = auction.detalhesInadimplencia?.diasAtraso > 60 ? 'Crítica' : auction.detalhesInadimplencia?.diasAtraso > 30 ? 'Alta' : 'Moderada';

              // Cálculo do valor total (mantido intacto)
              const calcValorTotal = () => {
                const arrematante = auction.arrematante;
                if (!arrematante) return formatCurrency(0);
                const valorBase = arrematante.valorPagarNumerico || parseFloat(arrematante.valorPagar?.replace(/[^\d,]/g, '').replace(',', '.') || '0');
                if (tipoPagamento === 'a_vista') {
                  const detalhes = auction.detalhesInadimplencia;
                  return formatCurrency(detalhes && detalhes.valorEmAtraso > 0 ? detalhes.valorEmAtraso : valorBase);
                }
                const detalhes = auction.detalhesInadimplencia;
                if (detalhes && detalhes.valorEmAtraso > 0) {
                  const estruturaParcelas = calcularEstruturaParcelas(valorBase, arrematante.parcelasTriplas || 0, arrematante.parcelasDuplas || 0, arrematante.parcelasSimples || 0);
                  const quantidadeParcelas = arrematante.quantidadeParcelas || 0;
                  const parcelasPagas = arrematante.parcelasPagas || 0;
                  let primeiraParcelaPendente = 0;
                  if (tipoPagamento === 'entrada_parcelamento') {
                    if (parcelasPagas === 0) {
                      let valorParcelasFuturas = 0;
                      for (let i = 0; i < quantidadeParcelas; i++) {
                        const mesInicio = arrematante.mesInicioPagamento;
                        if (mesInicio) {
                          const [year, month] = mesInicio.split('-').map(Number);
                          const parcelaDate = new Date(year, month - 1 + i, arrematante.diaVencimentoMensal || 15);
                          if (new Date() <= parcelaDate) valorParcelasFuturas += estruturaParcelas[i]?.valor || 0;
                        }
                      }
                      return formatCurrency(detalhes.valorEmAtraso + valorParcelasFuturas);
                    } else { primeiraParcelaPendente = parcelasPagas - 1; }
                  } else { primeiraParcelaPendente = parcelasPagas; }
                  let valorParcelasFuturas = 0;
                  for (let i = primeiraParcelaPendente; i < quantidadeParcelas; i++) {
                    const mesInicio = arrematante.mesInicioPagamento;
                    if (mesInicio) {
                      const [year, month] = mesInicio.split('-').map(Number);
                      const parcelaDate = new Date(year, month - 1 + i, arrematante.diaVencimentoMensal || 15);
                      if (new Date() <= parcelaDate) valorParcelasFuturas += estruturaParcelas[i]?.valor || 0;
                    }
                  }
                  return formatCurrency(detalhes.valorEmAtraso + valorParcelasFuturas);
                }
                // Fallback
                let valorTotalComJuros = 0;
                const percentualJuros = arrematante.percentualJurosAtraso || 0;
                const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
                if (tipoPagamento === 'entrada_parcelamento') {
                  const valorEntrada = (valorBase * 30) / 100;
                  const dataEntrada = arrematante.dataEntrada ? new Date(arrematante.dataEntrada + 'T00:00:00') : null;
                  valorTotalComJuros += (dataEntrada && dataEntrada < hoje) ? calcularJurosProgressivos(valorEntrada, arrematante.dataEntrada || '', percentualJuros) : valorEntrada;
                  const valorRestante = valorBase - valorEntrada;
                  const qp = arrematante.quantidadeParcelas || 0;
                  const vp = qp > 0 ? valorRestante / qp : 0;
                  for (let i = (arrematante.parcelasPagas || 0); i < qp; i++) {
                    if (arrematante.mesInicioPagamento) {
                      const [ano, mes] = arrematante.mesInicioPagamento.split('-').map(Number);
                      const d = new Date(ano, mes - 1 + i, arrematante.diaVencimentoMensal || 1);
                      valorTotalComJuros += d < hoje ? calcularJurosProgressivos(vp, d.toISOString().split('T')[0], percentualJuros) : vp;
                    } else { valorTotalComJuros += vp; }
                  }
                } else if (tipoPagamento === 'parcelamento') {
                  const qp = arrematante.quantidadeParcelas || 0;
                  const vp = qp > 0 ? valorBase / qp : 0;
                  for (let i = (arrematante.parcelasPagas || 0); i < qp; i++) {
                    if (arrematante.mesInicioPagamento) {
                      const [ano, mes] = arrematante.mesInicioPagamento.split('-').map(Number);
                      const d = new Date(ano, mes - 1 + i, arrematante.diaVencimentoMensal || 1);
                      valorTotalComJuros += d < hoje ? calcularJurosProgressivos(vp, d.toISOString().split('T')[0], percentualJuros) : vp;
                    } else { valorTotalComJuros += vp; }
                  }
                }
                return formatCurrency(valorTotalComJuros > 0 ? valorTotalComJuros : valorBase);
              };

              // Calcular status de entrada e parcelas para entrada_parcelamento
              const calcEntradaParcelamento = () => {
                const parcelasPagas = auction.arrematante?.parcelasPagas || 0;
                const quantidadeParcelas = auction.arrematante?.quantidadeParcelas || 12;
                const dataEntrada = loteComprado?.dataEntrada || auction.dataEntrada;
                const hoje = new Date();
                let statusEntrada = 'N/A'; let corEntrada = '#1a1a1a';
                if (dataEntrada) {
                  const v = new Date(dataEntrada); v.setHours(23, 59, 59, 999);
                  if (parcelasPagas > 0) { statusEntrada = 'Pago'; corEntrada = '#16a34a'; }
                  else if (hoje > v) { statusEntrada = 'ATRASADO'; corEntrada = '#dc2626'; }
                  else { statusEntrada = 'Pendente'; corEntrada = '#d97706'; }
                }
                const mesInicio = auction.arrematante?.mesInicioPagamento;
                const diaVenc = auction.arrematante?.diaVencimentoMensal || 15;
                let proxData = 'N/A'; let statusProx = 'Aguardando';
                if (mesInicio) {
                  try {
                    const [ano, mes] = mesInicio.split('-').map(Number);
                    if (parcelasPagas === 0) {
                      const d = new Date(ano, mes - 1, diaVenc);
                      proxData = formatDate(d.toISOString().split('T')[0]);
                      statusProx = (statusEntrada === 'ATRASADO' && hoje > d) ? 'ATRASADO' : statusEntrada === 'ATRASADO' ? 'Aguardando entrada' : hoje > d ? 'ATRASADO' : 'Aguardando entrada';
                    } else {
                      const idx = parcelasPagas - 1;
                      if (idx < quantidadeParcelas) {
                        const d = new Date(ano, mes - 1 + idx, diaVenc);
                        proxData = formatDate(d.toISOString().split('T')[0]);
                        statusProx = hoje > d ? 'ATRASADO' : 'Pendente';
                      } else { proxData = 'Todas pagas'; statusProx = 'Concluído'; }
                    }
                  } catch { /* ignore */ }
                }
                return { statusEntrada, corEntrada, dataEntrada, proxData, statusProx, parcelasPagas, quantidadeParcelas };
              };

              // Calcular status parcelas simples
              const calcParcelamento = () => {
                const mesInicio = auction.arrematante?.mesInicioPagamento;
                const diaVenc = auction.arrematante?.diaVencimentoMensal || 15;
                const pp = auction.arrematante?.parcelasPagas || 0;
                const qp = auction.arrematante?.quantidadeParcelas || 12;
                let proxData = 'N/A'; let statusProx = 'N/A';
                if (mesInicio) {
                  try {
                    const [ano, mes] = mesInicio.split('-').map(Number);
                    if (pp < qp) {
                      const d = new Date(ano, mes - 1 + pp, diaVenc);
                      proxData = formatDate(d.toISOString().split('T')[0]);
                      statusProx = new Date() > d ? 'ATRASADO' : 'Pendente';
                    } else { proxData = 'Todas pagas'; statusProx = 'Concluído'; }
                  } catch { /* ignore */ }
                }
                return { proxData, statusProx, pp, qp };
              };

              const statusColor = (s: string) => s === 'ATRASADO' ? '#dc2626' : s === 'Pendente' ? '#d97706' : s === 'Concluído' || s === 'Pago' ? '#16a34a' : '#1a1a1a';

              return (
                <div key={auction.id} style={{ pageBreakBefore: index > 0 ? 'auto' : 'avoid' }}>
                  <hr style={{ ...sSep, margin: '32px 0' }} />

                  {/* Header do caso */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px', pageBreakInside: 'avoid' }}>
                    <div>
                      <p style={{ fontSize: '16px', fontWeight: 600, color: '#1a1a1a', margin: '0 0 2px 0' }}>
                        {auction.identificacao ? `Processo Nº ${auction.identificacao}` : (auction.nome || 'Processo sem identificação')}
                      </p>
                      <p style={{ fontSize: '12px', color: '#dc2626', margin: 0, fontWeight: 500 }}>
                        {auction.detalhesInadimplencia?.tipoAtraso} &middot; {auction.detalhesInadimplencia?.diasAtraso} dias de atraso
                      </p>
                    </div>
                    <span style={{
                      fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '3px 10px', borderRadius: '4px', flexShrink: 0,
                      color: gravidade === 'Crítica' ? '#7f1d1d' : gravidade === 'Alta' ? '#991b1b' : '#b45309',
                      background: gravidade === 'Crítica' ? '#fef2f2' : gravidade === 'Alta' ? '#fff7ed' : '#fffbeb',
                      border: `1px solid ${gravidade === 'Crítica' ? '#fecaca' : gravidade === 'Alta' ? '#fed7aa' : '#fde68a'}`,
                    }}>
                      {gravidade}
                    </span>
                  </div>

                  {/* Devedor */}
                  <div style={{ marginTop: '16px', pageBreakInside: 'avoid' }}>
                    <p style={sSection}>Devedor</p>
                    <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
                      <div style={{ flex: '1 1 220px' }}>
                        <div style={sRow}><span style={sRowLabel}>Nome</span><span style={sRowValue}>{auction.arrematante?.nome || 'N/I'}</span></div>
                        <div style={sRow}><span style={sRowLabel}>Documento</span><span style={{ ...sRowValue, fontFamily: 'monospace' }}>{auction.arrematante?.documento || 'N/I'}</span></div>
                        <div style={sRow}><span style={sRowLabel}>Telefone</span><span style={sRowValue}>{auction.arrematante?.telefone || 'N/I'}</span></div>
                        <div style={sRow}><span style={sRowLabel}>Email</span><span style={sRowValue}>{auction.arrematante?.email || 'N/I'}</span></div>
                      </div>
                      <div style={{ flex: '1 1 220px' }}>
                        <div style={sRow}><span style={sRowLabel}>Data Leilão</span><span style={sRowValue}>{formatDate(auction.dataInicio)}</span></div>
                        <div style={sRow}><span style={sRowLabel}>Valor Total</span><span style={sRowValue}>{calcValorTotal()}</span></div>
                        {loteComprado && (
                          <div style={sRow}><span style={sRowLabel}>Lote</span><span style={sRowValue}>#{loteComprado.numero} - {loteComprado.descricao || 'Sem descrição'}</span></div>
                        )}
                        <div style={sRow}><span style={sRowLabel}>Modalidade</span><span style={sRowValue}>{getTipoPagLabel(tipoPagamento || '')}</span></div>
                      </div>
                    </div>
                  </div>

                  {/* Inadimplência */}
                  <div style={{ marginTop: '20px', pageBreakInside: 'avoid' }}>
                    <p style={sSection}>Inadimplência</p>
                    <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
                      <div style={{ flex: '1 1 140px' }}>
                        <p style={sLabel}>Valor em Atraso</p>
                        <p style={{ ...sValueLg, fontSize: '18px', color: '#dc2626' }}>{formatCurrency(auction.detalhesInadimplencia?.valorEmAtraso)}</p>
                        {auction.arrematante?.percentualJurosAtraso && auction.arrematante.percentualJurosAtraso > 0 && (
                          <p style={{ fontSize: '11px', color: '#dc2626', margin: '2px 0 0 0' }}>Inclui juros de {auction.arrematante.percentualJurosAtraso}%/mês</p>
                        )}
                      </div>
                      <div style={{ flex: '1 1 140px' }}>
                        <p style={sLabel}>Vencimento</p>
                        <p style={{ fontSize: '14px', fontWeight: 500, color: '#1a1a1a', margin: 0 }}>
                          {auction.detalhesInadimplencia?.dataVencimento ? formatDate(auction.detalhesInadimplencia.dataVencimento) : 'N/A'}
                        </p>
                      </div>
                      <div style={{ flex: '1 1 100px' }}>
                        <p style={sLabel}>Dias Atraso</p>
                        <p style={{ fontSize: '14px', fontWeight: 500, color: '#1a1a1a', margin: 0 }}>{auction.detalhesInadimplencia?.diasAtraso} dias</p>
                      </div>
                    </div>
                    {auction.detalhesInadimplencia?.parcelasAtrasadas > 1 && (
                      <p style={{ fontSize: '11px', color: '#666', margin: '8px 0 0 0' }}>
                        Total de pendências: {auction.detalhesInadimplencia.parcelasAtrasadas} pagamento(s) em atraso
                      </p>
                    )}
                  </div>

                  {/* Detalhamento por tipo de pagamento */}
                  {tipoPagamento === 'entrada_parcelamento' && (() => {
                    const ep = calcEntradaParcelamento();
                    return (
                      <div style={{ marginTop: '20px', pageBreakInside: 'avoid' }}>
                        <p style={sSection}>Entrada + Parcelamento</p>
                        {ep.statusEntrada !== 'Pago' && (
                          <div style={{ marginBottom: '12px' }}>
                            <p style={{ ...sLabel, marginBottom: '6px' }}>Entrada</p>
                            <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap', fontSize: '12px' }}>
                              <div style={sRow}><span style={sRowLabel}>Valor</span><span style={sRowValue}>{formatCurrency(auction.detalhesInadimplencia?.valorEntrada)}{ep.statusEntrada === 'ATRASADO' && auction.arrematante?.percentualJurosAtraso ? ` (c/ juros ${auction.arrematante.percentualJurosAtraso}%/mês)` : ''}</span></div>
                              <div style={sRow}><span style={sRowLabel}>Vencimento</span><span style={sRowValue}>{ep.dataEntrada ? formatDate(ep.dataEntrada) : 'N/A'}</span></div>
                              <div style={sRow}><span style={sRowLabel}>Status</span><span style={{ ...sRowValue, color: ep.corEntrada }}>{ep.statusEntrada}{ep.statusEntrada === 'ATRASADO' && ep.dataEntrada ? ` (${calcularDiasAtraso(ep.dataEntrada)}d)` : ''}</span></div>
                            </div>
                          </div>
                        )}
                        <p style={{ ...sLabel, marginBottom: '6px' }}>Parcelas</p>
                        <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
                          <div style={{ flex: '1 1 220px' }}>
                            <div style={sRow}><span style={sRowLabel}>Valor/Parcela</span><span style={sRowValue}>{formatCurrency(auction.detalhesInadimplencia?.valorParcela)}{ep.statusProx === 'ATRASADO' ? ' (base)' : ''}</span></div>
                            <div style={sRow}><span style={sRowLabel}>Total Parcelas</span><span style={sRowValue}>{ep.quantidadeParcelas}</span></div>
                            <div style={sRow}><span style={sRowLabel}>Dia Vencimento</span><span style={sRowValue}>Dia {auction.arrematante?.diaVencimentoMensal || 'N/A'}</span></div>
                          </div>
                          <div style={{ flex: '1 1 220px' }}>
                            <div style={sRow}><span style={sRowLabel}>Pagas</span><span style={sRowValue}>{ep.parcelasPagas > 0 ? ep.parcelasPagas - 1 : 0} de {ep.quantidadeParcelas}</span></div>
                            <div style={sRow}><span style={sRowLabel}>Restantes</span><span style={sRowValue}>{ep.quantidadeParcelas - (ep.parcelasPagas > 0 ? ep.parcelasPagas - 1 : 0)}</span></div>
                            <div style={sRow}><span style={sRowLabel}>Próxima</span><span style={sRowValue}>{ep.proxData}</span></div>
                            <div style={sRow}><span style={sRowLabel}>Status</span><span style={{ ...sRowValue, color: statusColor(ep.statusProx) }}>{ep.statusProx}</span></div>
                            {ep.statusProx === 'ATRASADO' && auction.detalhesInadimplencia?.parcelasAtrasadas > 1 && (
                              <div style={sRow}><span style={sRowLabel}>Atrasadas</span><span style={{ ...sRowValue, color: '#dc2626' }}>{auction.detalhesInadimplencia.parcelasAtrasadas - (ep.statusEntrada === 'ATRASADO' ? 1 : 0)} parcela(s)</span></div>
                            )}
                          </div>
                        </div>
                        {ep.statusProx === 'ATRASADO' && auction.arrematante?.percentualJurosAtraso && auction.arrematante.percentualJurosAtraso > 0 && (
                          <p style={{ fontSize: '11px', color: '#dc2626', margin: '10px 0 0 0' }}>
                            Valor base da parcela. Juros de {auction.arrematante.percentualJurosAtraso}%/mês aplicados progressivamente. Valor total em atraso já inclui juros acumulados.
                          </p>
                        )}
                      </div>
                    );
                  })()}

                  {tipoPagamento === 'parcelamento' && (() => {
                    const p = calcParcelamento();
                    return (
                      <div style={{ marginTop: '20px', pageBreakInside: 'avoid' }}>
                        <p style={sSection}>Parcelamento</p>
                        <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
                          <div style={{ flex: '1 1 220px' }}>
                            <div style={sRow}><span style={sRowLabel}>Valor/Parcela</span><span style={sRowValue}>{formatCurrency(auction.detalhesInadimplencia?.valorParcela)}</span></div>
                            <div style={sRow}><span style={sRowLabel}>Pagas</span><span style={sRowValue}>{p.pp} de {p.qp}</span></div>
                            <div style={sRow}><span style={sRowLabel}>Próxima</span><span style={sRowValue}>{p.proxData}</span></div>
                          </div>
                          <div style={{ flex: '1 1 220px' }}>
                            <div style={sRow}><span style={sRowLabel}>Dia Vencimento</span><span style={sRowValue}>Dia {auction.arrematante?.diaVencimentoMensal || 'N/A'}</span></div>
                            <div style={sRow}><span style={sRowLabel}>Mês Início</span><span style={sRowValue}>{auction.arrematante?.mesInicioPagamento || 'N/A'}</span></div>
                            <div style={sRow}><span style={sRowLabel}>Status</span><span style={{ ...sRowValue, color: statusColor(p.statusProx) }}>{p.statusProx}</span></div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              );
            })}

            {inadimplentes.length > 3 && (
              <div style={{ textAlign: 'center', padding: '24px 0', marginTop: '24px' }}>
                <p style={{ fontSize: '12px', color: '#999', margin: 0 }}>
                  Pré-visualização parcial &middot; O PDF completo incluirá todos os {inadimplentes.length} casos.
                </p>
                <p style={{ fontSize: '11px', color: '#bbb', margin: '4px 0 0 0' }}>
                  Total: {formatCurrency(valorTotalInadimplencia)} &middot; Média: {Math.round(diasAtrasoMedio)}d &middot; Críticos: {inadimplentes.filter(a => a.detalhesInadimplencia?.diasAtraso > 30).length}
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center p-12" style={{ background: 'linear-gradient(to bottom, #f0fdf4, #ffffff)', border: '1px solid #bbf7d0', borderRadius: '8px' }}>
            <div className="text-lg font-medium text-green-900 tracking-tight">✓ Situação Regularizada</div>
            <div className="text-sm text-green-700 mt-3" style={{ fontWeight: 300, lineHeight: '1.6' }}>
              Nenhuma inadimplência identificada no sistema.
              <br />
              Todos os compromissos financeiros encontram-se em situação regular.
              <br />
              <span className="text-xs text-green-600 mt-2 block">
                Sistema analisado em {new Date().toLocaleDateString('pt-BR')} às {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>
        )}

        {/* Logos Elionx e Arthur Lira */}
        <div className="mt-4 sm:mt-6 lg:mt-8 flex justify-center items-center -ml-20">
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
  }

  if (type === 'historico') {
    const comHistorico = auctions.filter(a => a.arrematante && !a.arquivado);
    const totalRegistros = comHistorico.length;
    const quitados = comHistorico.filter(a => a.arrematante?.pago).length;
    const pendentes = comHistorico.filter(a => !a.arrematante?.pago && !isOverdue(a.arrematante, a)).length;
    const atrasados = comHistorico.filter(a => !a.arrematante?.pago && isOverdue(a.arrematante, a)).length;

    const sLabel = { fontSize: '11px', fontWeight: 600, color: '#999', textTransform: 'uppercase' as const, letterSpacing: '0.08em', margin: '0 0 4px 0' } as React.CSSProperties;
    const sValue = { fontSize: '14px', color: '#1a1a1a', margin: 0, fontWeight: 500 } as React.CSSProperties;
    const sValueLg = { fontSize: '22px', fontWeight: 300, color: '#1a1a1a', margin: 0, letterSpacing: '-0.02em' } as React.CSSProperties;
    const sSep = { border: 'none', borderTop: '1px solid #eee', margin: '28px 0' } as React.CSSProperties;
    const sSection = { fontSize: '11px', fontWeight: 600, color: '#999', textTransform: 'uppercase' as const, letterSpacing: '0.08em', margin: '0 0 16px 0' } as React.CSSProperties;

    const getTipoPagLabel = (tipo: string) => {
      const l: Record<string, string> = { a_vista: 'À vista', parcelamento: 'Parcelamento', entrada_parcelamento: 'Entrada + Parcelamento' };
      return l[tipo] || 'Não definido';
    };

    return (
      <div style={{ background: 'white', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", padding: '48px 40px', fontSize: '13px', lineHeight: '1.6', color: '#1a1a1a' }}>

        {/* Cabeçalho */}
        <div style={{ marginBottom: '8px' }}>
          <h1 style={{ fontSize: '26px', fontWeight: 600, color: '#1a1a1a', margin: '0 0 4px 0', letterSpacing: '-0.02em' }}>
            Relatório de Histórico
          </h1>
          <p style={{ fontSize: '12px', color: '#999', margin: 0 }}>
            {new Date().toLocaleDateString('pt-BR')} &middot; {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>

        <hr style={sSep} />

        {/* Resumo */}
        {totalRegistros > 0 && (
          <div style={{ pageBreakInside: 'avoid' }}>
            <p style={sSection}>Resumo</p>
            <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 100px' }}>
                <p style={sLabel}>Total</p>
                <p style={sValueLg}>{totalRegistros}</p>
              </div>
              <div style={{ flex: '1 1 100px' }}>
                <p style={sLabel}>Quitados</p>
                <p style={sValueLg}>{quitados}</p>
              </div>
              <div style={{ flex: '1 1 100px' }}>
                <p style={sLabel}>Pendentes</p>
                <p style={sValueLg}>{pendentes}</p>
              </div>
              <div style={{ flex: '1 1 100px' }}>
                <p style={sLabel}>Atrasados</p>
                <p style={sValueLg}>{atrasados}</p>
              </div>
            </div>
          </div>
        )}

        {/* Lista de Registros */}
        {comHistorico.length > 0 ? (
          <div>
            {comHistorico.slice(0, 3).map((auction, index) => {
              const arrematante = auction.arrematante;
              const loteArrematado = arrematante?.loteId ? auction.lotes?.find(lote => lote.id === arrematante.loteId) : null;
              const tipoPagamento = loteArrematado?.tipoPagamento || auction.tipoPagamento;
              const mercadoriaComprada = loteArrematado && arrematante?.mercadoriaId ? loteArrematado.mercadorias?.find(m => m.id === arrematante.mercadoriaId) : null;
              const parcelasPagas = arrematante?.parcelasPagas || 0;
              const quantidadeParcelas = arrematante?.quantidadeParcelas || 1;
              const isCurrentlyOverdue = isOverdue(arrematante, auction);
              const isNewContract = parcelasPagas === 0;
              const valorComJuros = calcularValorTotalComJuros(arrematante, auction);
              const valorBase = arrematante?.valorPagarNumerico || parseFloat(arrematante?.valorPagar?.replace(/[^\d,]/g, '').replace(',', '.') || '0');
              const valorJuros = valorComJuros - valorBase;
              const valorTotal = valorBase;
              const percentualJuros = arrematante?.percentualJurosAtraso || 0;

              // Calcular risco (lógica completa)
              let valorEmAtraso = 0; let parcelasAtrasadasCount = 0; let diasAtrasoMaximo = 0;
              if (isCurrentlyOverdue) {
                const hoje = new Date();
                if (tipoPagamento === 'a_vista') {
                  const dv = loteArrematado?.dataVencimentoVista || auction.dataVencimentoVista;
                  if (dv) { valorEmAtraso = calcularJurosProgressivos(valorTotal, dv, percentualJuros); diasAtrasoMaximo = Math.floor((hoje.getTime() - new Date(dv).getTime()) / 86400000); } else { valorEmAtraso = valorTotal; }
                  parcelasAtrasadasCount = 1;
                } else if (tipoPagamento === 'entrada_parcelamento') {
                  const ve = arrematante?.valorEntrada ? (typeof arrematante.valorEntrada === 'string' ? parseFloat(arrematante.valorEntrada.replace(/[^\d,]/g, '').replace(',', '.')) : arrematante.valorEntrada) : valorTotal * 0.3;
                  const vpp = valorTotal / quantidadeParcelas;
                  if (parcelasPagas === 0) {
                    const de = loteArrematado?.dataEntrada || auction.dataEntrada;
                    if (de && hoje > new Date(de)) { valorEmAtraso += calcularJurosProgressivos(ve, de, percentualJuros); parcelasAtrasadasCount++; diasAtrasoMaximo = Math.max(diasAtrasoMaximo, Math.floor((hoje.getTime() - new Date(de).getTime()) / 86400000)); }
                  } else {
                    const mi = arrematante?.mesInicioPagamento; const dv = arrematante?.diaVencimentoMensal;
                    if (mi && dv) { const [sy, sm] = mi.split('-').map(Number); const pep = parcelasPagas - 1;
                      for (let i = 0; i < quantidadeParcelas; i++) { const pd = new Date(sy, sm - 1 + i, dv); pd.setHours(23,59,59,999); if (hoje > pd && i >= pep) { valorEmAtraso += calcularJurosProgressivos(vpp, pd.toISOString().split('T')[0], percentualJuros); parcelasAtrasadasCount++; diasAtrasoMaximo = Math.max(diasAtrasoMaximo, Math.floor((hoje.getTime() - pd.getTime()) / 86400000)); } } }
                  }
                } else {
                  const vpp = valorTotal / quantidadeParcelas; const mi = arrematante?.mesInicioPagamento; const dv = arrematante?.diaVencimentoMensal;
                  if (mi && dv) { const [sy, sm] = mi.split('-').map(Number);
                    for (let i = parcelasPagas; i < quantidadeParcelas; i++) { const pd = new Date(sy, sm - 1 + i, dv); pd.setHours(23,59,59,999); if (hoje > pd) { valorEmAtraso += calcularJurosProgressivos(vpp, pd.toISOString().split('T')[0], percentualJuros); parcelasAtrasadasCount++; diasAtrasoMaximo = Math.max(diasAtrasoMaximo, Math.floor((hoje.getTime() - pd.getTime()) / 86400000)); } else break; } }
                }
              }

              // Calcular valor total com juros
              let valorTotalComJuros = 0;
              const mip = arrematante?.mesInicioPagamento;
              if (tipoPagamento === 'entrada_parcelamento' && mip) {
                const ve = arrematante?.valorEntrada ? (typeof arrematante.valorEntrada === 'string' ? parseFloat(arrematante.valorEntrada.replace(/[^\d,]/g, '').replace(',', '.')) : arrematante.valorEntrada) : valorTotal * 0.3;
                const vpb = valorTotal / quantidadeParcelas;
                const de = loteArrematado?.dataEntrada || auction.dataEntrada;
                valorTotalComJuros += de ? calcularJurosProgressivos(ve, de, percentualJuros) : ve;
                const [sy, sm] = mip.split('-').map(Number);
                for (let i = 0; i < quantidadeParcelas; i++) { const d = new Date(sy, sm - 1 + i, arrematante?.diaVencimentoMensal || 15); valorTotalComJuros += calcularJurosProgressivos(vpb, d.toISOString().split('T')[0], percentualJuros); }
              } else if (tipoPagamento === 'parcelamento' && mip) {
                const vpp = valorTotal / quantidadeParcelas; const [sy, sm] = mip.split('-').map(Number);
                for (let i = 0; i < quantidadeParcelas; i++) { const d = new Date(sy, sm - 1 + i, arrematante?.diaVencimentoMensal || 15); valorTotalComJuros += calcularJurosProgressivos(vpp, d.toISOString().split('T')[0], percentualJuros); }
              } else { valorTotalComJuros = valorTotal; }

              const avgDelayDays = diasAtrasoMaximo;
              const isHVO = valorEmAtraso > 500000; const isMVO = valorEmAtraso > 200000 && valorEmAtraso <= 500000; const isLVO = valorEmAtraso <= 200000;
              let riskLevel = 'BAIXO'; let riskBg = '#fafafa'; let riskBorder = '#e5e7eb'; let riskColor = '#666';
              if (isCurrentlyOverdue) {
                if (isHVO || parcelasAtrasadasCount >= 3 || (parcelasAtrasadasCount >= 2 && avgDelayDays > 30) || (isMVO && parcelasAtrasadasCount >= 2) || avgDelayDays > 60) { riskLevel = 'ALTO'; riskBg = '#fef2f2'; riskBorder = '#fecaca'; riskColor = '#991b1b'; }
                else if (isMVO || parcelasAtrasadasCount >= 2 || (parcelasAtrasadasCount >= 1 && avgDelayDays > 30) || (isLVO && avgDelayDays > 15)) { riskLevel = 'MÉDIO'; riskBg = '#fffbeb'; riskBorder = '#fde68a'; riskColor = '#b45309'; }
              }

              // Texto de situação atual (lógica completa)
              const getSituacaoText = () => {
                const getVencDate = () => { try {
                  if (tipoPagamento === 'a_vista') { const dv = loteArrematado?.dataVencimentoVista || auction.dataVencimentoVista; return dv ? new Date(dv.split('-').map(Number)[0], dv.split('-').map(Number)[1] - 1, dv.split('-').map(Number)[2]).toLocaleDateString('pt-BR') : null; }
                  if (tipoPagamento === 'entrada_parcelamento') { if (parcelasPagas === 0) { const de = loteArrematado?.dataEntrada || auction.dataEntrada; return de ? new Date(de.split('-').map(Number)[0], de.split('-').map(Number)[1] - 1, de.split('-').map(Number)[2]).toLocaleDateString('pt-BR') : null; } else { const mi = arrematante?.mesInicioPagamento; const dv = arrematante?.diaVencimentoMensal; if (mi && dv) { const [sy, sm] = mi.split('-').map(Number); return new Date(sy, sm - 1 + (parcelasPagas - 1), dv).toLocaleDateString('pt-BR'); } return null; } }
                  const mi = arrematante?.mesInicioPagamento; const dv = arrematante?.diaVencimentoMensal; if (mi && dv) { const [sy, sm] = mi.split('-').map(Number); return new Date(sy, sm - 1 + parcelasPagas, dv).toLocaleDateString('pt-BR'); } return null;
                } catch { return null; } };
                const vd = getVencDate(); const vt = vd ? ` com vencimento em ${vd}` : '';
                if (arrematante?.pago) return tipoPagamento === 'a_vista' ? `Pagamento à vista quitado${vd ? ` (venc. ${vd})` : ''}.` : 'Todos os pagamentos processados com sucesso.';
                if (isNewContract) {
                  if (tipoPagamento === 'a_vista') { const st = isCurrentlyOverdue ? 'em atraso' : 'pendente'; const vx = valorEmAtraso > 0 ? valorEmAtraso : valorBase; const vj = vx - valorBase; return `Pagamento à vista de ${vj > 0 ? `${formatCurrency(vx)} (${formatCurrency(vj)} juros)` : formatCurrency(vx)} ${st}${vt}.`; }
                  const st = isCurrentlyOverdue ? 'em atraso' : 'pendente de quitação';
                  if (tipoPagamento === 'entrada_parcelamento') {
                    const ve = arrematante?.valorEntrada ? (typeof arrematante.valorEntrada === 'string' ? parseFloat(arrematante.valorEntrada.replace(/[^\d,]/g, '').replace(',', '.')) : arrematante.valorEntrada) : valorTotal * 0.3;
                    const ep = calcularEstruturaParcelas(valorTotal, arrematante?.parcelasTriplas || 0, arrematante?.parcelasDuplas || 0, arrematante?.parcelasSimples || 0);
                    let pea = 0; let eea = false; let vtpa = 0;
                    try { const h = new Date(); const de = loteArrematado?.dataEntrada || auction.dataEntrada; if (de && parcelasPagas === 0) { const v = new Date(de); v.setHours(23,59,59,999); eea = h > v; }
                      if (arrematante?.mesInicioPagamento && arrematante?.diaVencimentoMensal) { const [y, m] = arrematante.mesInicioPagamento.split('-').map(Number); const pi = parcelasPagas > 0 ? parcelasPagas - 1 : 0;
                        for (let i = pi; i < quantidadeParcelas; i++) { const d = new Date(y, m - 1 + i, arrematante.diaVencimentoMensal); d.setHours(23,59,59,999); if (h > d) { pea++; vtpa += ep[i]?.valor || 0; } else break; } }
                    } catch { /* ignore */ }
                    const ppi = parcelasPagas > 0 ? parcelasPagas - 1 : 0; const vpp = ep[ppi]?.valor || 0;
                    if (eea && pea > 0) return `Entrada (${formatCurrency(ve)}) e ${pea} parcela${pea > 1 ? 's' : ''} (${formatCurrency(vtpa)}) ${st}, total ${formatCurrency(ve + vtpa)}.`;
                    if (eea) return `Entrada de ${formatCurrency(ve)} ${st}.`;
                    if (pea > 0) return `${pea} parcela${pea > 1 ? 's' : ''} (${formatCurrency(vtpa)}) ${st}.`;
                    return `Próximo vencimento${vt} de ${formatCurrency(parcelasPagas === 0 ? ve : vpp)} ${st}.`;
                  }
                  const ep = calcularEstruturaParcelas(valorTotal, arrematante?.parcelasTriplas || 0, arrematante?.parcelasDuplas || 0, arrematante?.parcelasSimples || 0);
                  let pea = 0; let vtpa = 0;
                  try { const h = new Date(); if (arrematante?.mesInicioPagamento && arrematante?.diaVencimentoMensal) { const [y, m] = arrematante.mesInicioPagamento.split('-').map(Number);
                    for (let i = parcelasPagas; i < quantidadeParcelas; i++) { const d = new Date(y, m - 1 + i, arrematante.diaVencimentoMensal); d.setHours(23,59,59,999); if (h > d) { pea++; vtpa += ep[i]?.valor || 0; } else break; } }
                  } catch { /* ignore */ }
                  const vpp = ep[parcelasPagas]?.valor || 0;
                  if (pea > 1) return `${pea} parcelas (${formatCurrency(vtpa)}) ${st}.`;
                  if (pea === 1) return `Parcela #${parcelasPagas + 1}${vt} de ${formatCurrency(vpp)} ${st}.`;
                  return `Próxima Parcela #${parcelasPagas + 1}${vt} de ${formatCurrency(vpp)} ${st}.`;
                }
                if (tipoPagamento === 'a_vista') return `Pagamento à vista ${isCurrentlyOverdue ? 'em atraso' : 'pendente'}${vt}.`;
                return `Parcelamento ${isCurrentlyOverdue ? 'com atrasos' : 'com pendências'}${vt}.`;
              };

              const statusLabel = arrematante?.pago ? 'Quitado' : isCurrentlyOverdue ? 'Atrasado' : 'Pendente';
              const statusBg = arrematante?.pago ? '#f0fdf4' : isCurrentlyOverdue ? '#fef2f2' : '#fafafa';
              const statusColor = arrematante?.pago ? '#16a34a' : isCurrentlyOverdue ? '#dc2626' : '#666';
              const statusBorder = arrematante?.pago ? '#bbf7d0' : isCurrentlyOverdue ? '#fecaca' : '#e5e7eb';

              return (
                <div key={auction.id} style={{ pageBreakBefore: index > 0 ? 'always' : 'avoid' }}>
                  <hr style={{ ...sSep, margin: '36px 0' }} />

                  {/* Header do registro */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px', pageBreakInside: 'avoid' }}>
                    <div>
                      <h2 style={{ fontSize: '20px', fontWeight: 600, color: '#1a1a1a', margin: '0 0 2px 0', letterSpacing: '-0.01em' }}>
                        {auction.identificacao ? `Processo Nº ${auction.identificacao}` : (auction.nome || 'Processo sem identificação')}
                      </h2>
                      <p style={{ fontSize: '12px', color: '#999', margin: 0 }}>
                        {auction.nome && auction.identificacao && <span>{auction.nome} &middot; </span>}
                        {formatDate(auction.dataInicio)}
                        {arrematante?.nome && <span> &middot; {arrematante.nome}</span>}
                      </p>
                    </div>
                    <span style={{
                      padding: '3px 10px',
                      borderRadius: '4px',
                      fontSize: '10px',
                      fontWeight: 600,
                      textTransform: 'uppercase' as const,
                      letterSpacing: '0.05em',
                      background: statusBg,
                      color: statusColor,
                      border: `1px solid ${statusBorder}`,
                      whiteSpace: 'nowrap',
                      flexShrink: 0,
                    }}>
                      {statusLabel}
                    </span>
                  </div>

                  {/* Financeiro */}
                  <div style={{ marginTop: '20px', pageBreakInside: 'avoid' }}>
                    <p style={sSection}>Financeiro</p>
                    <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
                      <div style={{ flex: '1 1 180px' }}>
                        <p style={sLabel}>Valor Total</p>
                        <p style={sValueLg}>
                          {formatCurrency(valorComJuros)}
                          {valorJuros > 0 && <span style={{ fontSize: '12px', color: '#dc2626', marginLeft: '6px' }}>({formatCurrency(valorJuros)} juros)</span>}
                        </p>
                      </div>
                      <div style={{ flex: '1 1 180px' }}>
                        <p style={sLabel}>Modalidade</p>
                        <p style={sValue}>{getTipoPagLabel(tipoPagamento || '')}</p>
                      </div>
                      <div style={{ flex: '1 1 180px' }}>
                        <p style={sLabel}>Parcelas</p>
                        <p style={sValue}>{parcelasPagas} / {quantidadeParcelas}</p>
                      </div>
                    </div>

                    {/* Detalhes em tabela */}
                    <div style={{ marginTop: '16px' }}>
                      <p style={{ ...sLabel, marginBottom: '6px' }}>Identificação do Arrematante</p>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                        <tbody>
                          <tr style={{ borderBottom: '1px solid #f5f5f5' }}>
                            <td style={{ padding: '5px 0', color: '#666' }}>Nome Completo</td>
                            <td style={{ padding: '5px 0', textAlign: 'right', fontWeight: 500, color: '#1a1a1a' }}>{arrematante?.nome || 'Não informado'}</td>
                          </tr>
                          <tr style={{ borderBottom: '1px solid #f5f5f5' }}>
                            <td style={{ padding: '5px 0', color: '#666' }}>Documento</td>
                            <td style={{ padding: '5px 0', textAlign: 'right', fontWeight: 500, color: '#1a1a1a', fontFamily: 'monospace' }}>{arrematante?.documento || 'Não informado'}</td>
                          </tr>
                          <tr style={{ borderBottom: '1px solid #f5f5f5' }}>
                            <td style={{ padding: '5px 0', color: '#666' }}>Email</td>
                            <td style={{ padding: '5px 0', textAlign: 'right', fontWeight: 500, color: '#1a1a1a' }}>{arrematante?.email || 'Não informado'}</td>
                          </tr>
                          <tr style={{ borderBottom: '1px solid #f5f5f5' }}>
                            <td style={{ padding: '5px 0', color: '#666' }}>Telefone</td>
                            <td style={{ padding: '5px 0', textAlign: 'right', fontWeight: 500, color: '#1a1a1a' }}>{arrematante?.telefone || 'Não informado'}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Contrato Vinculado */}
                  <div style={{ marginTop: '24px', pageBreakInside: 'avoid' }}>
                    <p style={sSection}>Contrato Vinculado</p>
                    <div style={{ padding: '12px 0', borderBottom: '1px solid #f0f0f0', pageBreakInside: 'avoid' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <p style={{ fontSize: '13px', fontWeight: 600, color: '#1a1a1a', margin: '0 0 2px 0' }}>{auction.nome || 'Leilão sem nome'}</p>
                          <p style={{ fontSize: '12px', color: '#999', margin: 0 }}>
                            {auction.identificacao && <span style={{ fontFamily: 'monospace' }}>#{auction.identificacao} &middot; </span>}
                            {formatDate(auction.dataInicio)}
                          </p>
                        </div>
                        <span style={{ fontSize: '11px', color: '#999' }}>{getTipoPagLabel(tipoPagamento || '')}</span>
                      </div>

                      {/* Mercadoria e Lote */}
                      {loteArrematado && (
                        <div style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>
                          {mercadoriaComprada && (
                            <p style={{ margin: '1px 0' }}>
                              {mercadoriaComprada.titulo || mercadoriaComprada.tipo || 'Mercadoria'}
                            </p>
                          )}
                          <p style={{ margin: '1px 0' }}>Lote {loteArrematado.numero} - {loteArrematado.descricao || 'Sem descrição'}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Perfil de Risco */}
                  <div style={{ marginTop: '24px', pageBreakInside: 'avoid' }}>
                    <p style={sSection}>Perfil de Risco</p>
                    <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap', marginBottom: '16px' }}>
                      <div style={{ flex: '1 1 180px' }}>
                        <p style={sLabel}>Classificação</p>
                        <p style={{ fontSize: '14px', fontWeight: 600, margin: 0, padding: '3px 10px', borderRadius: '4px', display: 'inline-block', background: riskBg, color: riskColor, border: `1px solid ${riskBorder}`, letterSpacing: '0.05em' }}>
                          RISCO {riskLevel}
                        </p>
                      </div>
                      {isCurrentlyOverdue && valorEmAtraso > 0 && (
                        <div style={{ flex: '1 1 180px' }}>
                          <p style={sLabel}>Valor em Atraso</p>
                          <p style={{ ...sValue, color: '#dc2626' }}>{formatCurrency(valorEmAtraso)}</p>
                        </div>
                      )}
                      {diasAtrasoMaximo > 0 && (
                        <div style={{ flex: '1 1 180px' }}>
                          <p style={sLabel}>Dias de Atraso</p>
                          <p style={sValue}>{diasAtrasoMaximo} dias</p>
                        </div>
                      )}
                    </div>

                    {/* Análise textual */}
                    <div style={{ fontSize: '12px', color: '#666', lineHeight: '1.7' }}>
                      <p style={{ margin: '0 0 8px 0' }}>
                        <strong style={{ color: '#1a1a1a' }}>Dados Consolidados:</strong> O arrematante {arrematante?.nome || 'identificado'} possui risco classificado como {riskLevel.toLowerCase()} baseado nos dados históricos de pagamentos. Este relatório consolida 1 contrato com valor total de {(() => { const vf = valorTotalComJuros > 0 ? valorTotalComJuros : valorTotal; const vj = vf - valorTotal; return vj > 0 ? `${formatCurrency(vf)} (${formatCurrency(vj)} juros)` : formatCurrency(vf); })()}.{' '}
                        {tipoPagamento === 'a_vista' ? (parcelasPagas > 0 ? 'Pagamento à vista foi processado.' : 'Pagamento à vista ainda não processado, em período de vencimento.') :
                         tipoPagamento === 'entrada_parcelamento' ? (parcelasPagas > 0 ? `Foram registrados ${parcelasPagas} pagamentos (entrada + ${parcelasPagas - 1} parcela${parcelasPagas > 2 ? 's' : ''}) de um total de ${quantidadeParcelas + 1} pagamentos programados (entrada + ${quantidadeParcelas} parcelas).` : `Foram processados entrada e ${quantidadeParcelas} parcelas para pagamento, porém nenhum pagamento foi registrado até o momento.`) :
                         (parcelasPagas > 0 ? `Foram registrados ${parcelasPagas} pagamentos de um total de ${quantidadeParcelas} parcelas programadas.` : `Foram processadas ${quantidadeParcelas} parcelas para pagamento, porém nenhum pagamento foi registrado até o momento.`)}
                      </p>
                      {isCurrentlyOverdue && (
                        <p style={{ margin: '0 0 8px 0' }}>
                          <strong style={{ color: '#1a1a1a' }}>Análise de Risco:</strong> O cálculo de risco considera {parcelasAtrasadasCount} parcela{parcelasAtrasadasCount > 1 ? 's' : ''} atualmente em atraso, com valor total de {formatCurrency(valorEmAtraso)} em débito.{diasAtrasoMaximo > 0 ? ` O maior período de atraso registrado é de ${diasAtrasoMaximo} dias.` : ''}{' '}
                          {parcelasAtrasadasCount >= 3 ? 'O elevado número de parcelas em atraso resulta em classificação de risco alto.' : parcelasAtrasadasCount >= 2 ? 'Múltiplas parcelas em atraso indicam risco médio a alto.' : diasAtrasoMaximo > 30 ? 'Atraso prolongado indica necessidade de atenção.' : 'Situação de atraso recente com risco controlado.'}
                        </p>
                      )}
                      <p style={{ margin: 0 }}>
                        <strong style={{ color: '#1a1a1a' }}>Situação Atual:</strong> {getSituacaoText()}
                      </p>
                    </div>
                  </div>

                  {/* Informações do Relatório */}
                  <div style={{ marginTop: '24px', pageBreakInside: 'avoid' }}>
                    <p style={sSection}>Informações do Relatório</p>
                    <div style={{ fontSize: '12px', color: '#666', lineHeight: '1.7' }}>
                      <p style={{ margin: '0 0 6px 0' }}>
                        <strong style={{ color: '#1a1a1a' }}>Escopo:</strong> 1 contrato no valor total de {(() => { const vf = valorTotalComJuros > 0 ? valorTotalComJuros : valorTotal; const vj = vf - valorTotal; return vj > 0 ? `${formatCurrency(vf)} (${formatCurrency(vj)} juros)` : formatCurrency(vf); })()} vinculado ao arrematante {arrematante?.nome || 'identificado'}. Leilão realizado em {formatDate(auction.dataInicio)}.
                      </p>
                      <p style={{ margin: 0, fontSize: '11px', color: '#999' }}>
                        Perfil de risco determinado com base em: status de pagamento atual, histórico de transações e informações consolidadas do contrato vinculado.
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}

            {comHistorico.length > 3 && (
              <div style={{ textAlign: 'center', padding: '24px 0', marginTop: '24px' }}>
                <p style={{ fontSize: '12px', color: '#999', margin: 0 }}>
                  Pré-visualização parcial &middot; O PDF completo incluirá todos os {comHistorico.length} registros.
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center bg-slate-50 border-2 border-slate-300 p-12 font-sans">
            <div className="text-lg font-light text-slate-900 tracking-wide">Nenhum Histórico Encontrado</div>
            <div className="text-sm text-slate-600 font-light mt-3 leading-relaxed">
              Não há transações com arrematantes registradas no sistema.
            </div>
          </div>
        )}

        {/* Logos Elionx e Arthur Lira */}
        <div className="mt-4 sm:mt-6 lg:mt-8 flex justify-center items-center -ml-20">
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
  }

  if (type === 'faturas') {
    // Obter todas as faturas (múltiplos arrematantes por leilão)
    const todasFaturas: Array<{auction: Auction, arrematante: ArrematanteInfo}> = [];
    auctions.forEach(auction => {
      if (auction.arquivado) return;
      if (auction.arrematantes && auction.arrematantes.length > 0) { auction.arrematantes.forEach(arr => { todasFaturas.push({ auction, arrematante: arr }); }); }
      else if (auction.arrematante) { todasFaturas.push({ auction, arrematante: auction.arrematante }); }
    });

    const faturasPagas = todasFaturas.filter(f => f.arrematante?.pago);
    const faturasReceber = todasFaturas.filter(f => !f.arrematante?.pago);
    const faturasAtrasadas = faturasReceber.filter(f => isOverdue(f.arrematante, f.auction));
    const valorTotalReceber = faturasReceber.reduce((sum, f) => sum + calcularValorTotalComJuros(f.arrematante, f.auction), 0);
    const valorTotalRecebido = faturasPagas.reduce((sum, f) => sum + (f.arrematante?.valorPagarNumerico || parseFloat(f.arrematante?.valorPagar?.replace(/[^\d,]/g, '').replace(',', '.') || '0')), 0);

    const sLabel = { fontSize: '11px', fontWeight: 600, color: '#999', textTransform: 'uppercase' as const, letterSpacing: '0.08em', margin: '0 0 4px 0' } as React.CSSProperties;
    const sValue = { fontSize: '14px', color: '#1a1a1a', margin: 0, fontWeight: 500 } as React.CSSProperties;
    const sValueLg = { fontSize: '22px', fontWeight: 300, color: '#1a1a1a', margin: 0, letterSpacing: '-0.02em' } as React.CSSProperties;
    const sSep = { border: 'none', borderTop: '1px solid #eee', margin: '28px 0' } as React.CSSProperties;
    const sSection = { fontSize: '11px', fontWeight: 600, color: '#999', textTransform: 'uppercase' as const, letterSpacing: '0.08em', margin: '0 0 16px 0' } as React.CSSProperties;

    const getTipoPagLabel = (tipo: string) => {
      const l: Record<string, string> = { a_vista: 'À vista', parcelamento: 'Parcelamento', entrada_parcelamento: 'Entrada + Parcelamento' };
      return l[tipo] || 'Não definido';
    };

    return (
      <div style={{ background: 'white', fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", padding: '48px 40px', fontSize: '13px', lineHeight: '1.6', color: '#1a1a1a' }}>

        {/* Cabeçalho */}
        <div style={{ marginBottom: '8px' }}>
          <h1 style={{ fontSize: '26px', fontWeight: 600, color: '#1a1a1a', margin: '0 0 4px 0', letterSpacing: '-0.02em' }}>
            Relatório Financeiro
          </h1>
          <p style={{ fontSize: '12px', color: '#999', margin: 0 }}>
            {new Date().toLocaleDateString('pt-BR')} &middot; {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>

        <hr style={sSep} />

        {/* Resumo */}
        {todasFaturas.length > 0 && (
          <div style={{ pageBreakInside: 'avoid' }}>
            <p style={sSection}>Resumo</p>
            <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 100px' }}>
                <p style={sLabel}>Total</p>
                <p style={sValueLg}>{todasFaturas.length}</p>
              </div>
              <div style={{ flex: '1 1 100px' }}>
                <p style={sLabel}>Quitadas</p>
                <p style={sValueLg}>{faturasPagas.length}</p>
              </div>
              <div style={{ flex: '1 1 100px' }}>
                <p style={sLabel}>Em Aberto</p>
                <p style={sValueLg}>{faturasReceber.length - faturasAtrasadas.length}</p>
              </div>
              <div style={{ flex: '1 1 100px' }}>
                <p style={sLabel}>Atrasadas</p>
                <p style={sValueLg}>{faturasAtrasadas.length}</p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap', marginTop: '16px' }}>
              <div style={{ flex: '1 1 180px' }}>
                <p style={sLabel}>Total Recebido</p>
                <p style={sValueLg}>{formatCurrency(valorTotalRecebido)}</p>
              </div>
              <div style={{ flex: '1 1 180px' }}>
                <p style={sLabel}>Total a Receber</p>
                <p style={sValueLg}>{formatCurrency(valorTotalReceber)}</p>
              </div>
            </div>
          </div>
        )}

        {/* Lista de Faturas */}
        {todasFaturas.length > 0 ? (
          <div>
            {todasFaturas.slice(0, 10).map(({ auction, arrematante }, index) => {
              const loteArrematado = arrematante?.loteId ? auction.lotes?.find(lote => lote.id === arrematante.loteId) : null;
              const tipoPagamento = loteArrematado?.tipoPagamento || auction.tipoPagamento;
              const mercadoriaComprada = loteArrematado && arrematante?.mercadoriaId ? loteArrematado.mercadorias?.find(m => m.id === arrematante.mercadoriaId) : null;
              const valorComJuros = calcularValorTotalComJuros(arrematante, auction);
              const valorBase = arrematante?.valorPagarNumerico || parseFloat(arrematante?.valorPagar?.replace(/[^\d,]/g, '').replace(',', '.') || '0');
              const valorJuros = valorComJuros - valorBase;
              const parcelasPagas = arrematante?.parcelasPagas || 0;
              const quantidadeParcelas = arrematante?.quantidadeParcelas || 1;
              const isCurrentlyOverdue = isOverdue(arrematante, auction);

              const statusLabel = arrematante?.pago ? 'Quitada' : isCurrentlyOverdue ? 'Atrasada' : 'Em Aberto';
              const statusBg = arrematante?.pago ? '#f0fdf4' : isCurrentlyOverdue ? '#fef2f2' : '#fafafa';
              const statusColor = arrematante?.pago ? '#16a34a' : isCurrentlyOverdue ? '#dc2626' : '#666';
              const statusBorder = arrematante?.pago ? '#bbf7d0' : isCurrentlyOverdue ? '#fecaca' : '#e5e7eb';

              // Detalhamento de parcelas
              const buildParcelas = () => {
                if (tipoPagamento === 'a_vista' || !arrematante) return [];
                const vt = arrematante.valorPagarNumerico || (typeof arrematante.valorPagar === 'number' ? arrematante.valorPagar : (typeof arrematante.valorPagar === 'string' ? parseFloat(arrematante.valorPagar.replace(/[^\d,]/g, '').replace(',', '.')) || 0 : 0));
                const qp = arrematante.quantidadeParcelas || 12;
                const pp = arrematante.parcelasPagas || 0;
                const pj = arrematante.percentualJurosAtraso || 0;
                const mi = arrematante.mesInicioPagamento;
                const dv = arrematante.diaVencimentoMensal || 15;
                if (!mi) return [];
                const result: { numero: string; vencimento: string; valorBase: number; valorComJuros: number; isPaga: boolean; isAtrasada: boolean; temJuros: boolean }[] = [];
                try {
                  const ep = calcularEstruturaParcelas(vt, arrematante.parcelasTriplas || 0, arrematante.parcelasDuplas || 0, arrematante.parcelasSimples || 0);
                  if (tipoPagamento === 'entrada_parcelamento') {
                    const veb = arrematante.valorEntrada ? (typeof arrematante.valorEntrada === 'string' ? parseFloat(arrematante.valorEntrada.replace(/[^\d,]/g, '').replace(',', '.')) : arrematante.valorEntrada) : vt * 0.3;
                    const de = loteArrematado?.dataEntrada || auction.dataEntrada;
                    if (de) { const vcj = calcularJurosProgressivos(veb, de, pj); const ip = pp > 0; const ia = !ip && new Date() > new Date(de + 'T23:59:59'); result.push({ numero: 'Entrada', vencimento: new Date(de).toLocaleDateString('pt-BR'), valorBase: veb, valorComJuros: vcj, isPaga: ip, isAtrasada: ia, temJuros: vcj > veb }); }
                    const [sy, sm] = mi.split('-').map(Number);
                    for (let i = 0; i < qp; i++) { const vpd = ep[i]?.valor || 0; const d = new Date(sy, sm - 1 + i, dv); const ds = d.toISOString().split('T')[0]; const vcj = calcularJurosProgressivos(vpd, ds, pj); const ip = (i + 1) < pp; const ia = !ip && new Date() > d; result.push({ numero: `${i + 1}ª Parcela`, vencimento: d.toLocaleDateString('pt-BR'), valorBase: vpd, valorComJuros: vcj, isPaga: ip, isAtrasada: ia, temJuros: vcj > vpd }); }
                  } else {
                    const [sy, sm] = mi.split('-').map(Number);
                    for (let i = 0; i < qp; i++) { const vpd = ep[i]?.valor || 0; const d = new Date(sy, sm - 1 + i, dv); const ds = d.toISOString().split('T')[0]; const vcj = calcularJurosProgressivos(vpd, ds, pj); const ip = i < pp; const ia = !ip && new Date() > d; result.push({ numero: `${i + 1}ª Parcela`, vencimento: d.toLocaleDateString('pt-BR'), valorBase: vpd, valorComJuros: vcj, isPaga: ip, isAtrasada: ia, temJuros: vcj > vpd }); }
                  }
                } catch { /* ignore */ }
                return result;
              };
              const parcelas = buildParcelas();

              return (
                <div key={`${auction.id}-${arrematante.id || index}`} style={{ pageBreakBefore: index > 0 ? 'always' : 'avoid' }}>
                  <hr style={{ ...sSep, margin: '36px 0' }} />

                  {/* Header da fatura */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px', pageBreakInside: 'avoid' }}>
                    <div>
                      <h2 style={{ fontSize: '20px', fontWeight: 600, color: '#1a1a1a', margin: '0 0 2px 0', letterSpacing: '-0.01em' }}>
                        {auction.identificacao ? `Fatura - Processo Nº ${auction.identificacao}` : `Fatura - ${auction.nome || 'Sem identificação'}`}
                      </h2>
                      <p style={{ fontSize: '12px', color: '#999', margin: 0 }}>
                        {arrematante?.nome || 'Cliente não informado'}
                        {' '}&middot; {formatDate(auction.dataInicio)}
                        {arrematante?.documento && <span> &middot; {arrematante.documento}</span>}
                      </p>
                    </div>
                    <span style={{
                      padding: '3px 10px', borderRadius: '4px', fontSize: '10px', fontWeight: 600,
                      textTransform: 'uppercase' as const, letterSpacing: '0.05em',
                      background: statusBg, color: statusColor, border: `1px solid ${statusBorder}`,
                      whiteSpace: 'nowrap', flexShrink: 0,
                    }}>
                      {statusLabel}
                    </span>
                  </div>

                  {/* Financeiro */}
                  <div style={{ marginTop: '20px', pageBreakInside: 'avoid' }}>
                    <p style={sSection}>Financeiro</p>
                    <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
                      <div style={{ flex: '1 1 180px' }}>
                        <p style={sLabel}>Valor Total</p>
                        <p style={sValueLg}>
                          {formatCurrency(valorComJuros)}
                          {valorJuros > 0 && <span style={{ fontSize: '12px', color: '#dc2626', marginLeft: '6px' }}>({formatCurrency(valorJuros)} juros)</span>}
                        </p>
                      </div>
                      <div style={{ flex: '1 1 180px' }}>
                        <p style={sLabel}>Modalidade</p>
                        <p style={sValue}>{getTipoPagLabel(tipoPagamento || '')}</p>
                      </div>
                      {tipoPagamento !== 'a_vista' && (
                        <div style={{ flex: '1 1 180px' }}>
                          <p style={sLabel}>Parcelas</p>
                          <p style={sValue}>{parcelasPagas} / {quantidadeParcelas}{tipoPagamento === 'entrada_parcelamento' ? ' + entrada' : ''}</p>
                        </div>
                      )}
                    </div>

                    {/* Dados do cliente */}
                    <div style={{ marginTop: '16px' }}>
                      <p style={{ ...sLabel, marginBottom: '6px' }}>Dados do Cliente</p>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                        <tbody>
                          <tr style={{ borderBottom: '1px solid #f5f5f5' }}>
                            <td style={{ padding: '5px 0', color: '#666' }}>Nome</td>
                            <td style={{ padding: '5px 0', textAlign: 'right', fontWeight: 500, color: '#1a1a1a' }}>{arrematante?.nome || 'Não informado'}</td>
                          </tr>
                          <tr style={{ borderBottom: '1px solid #f5f5f5' }}>
                            <td style={{ padding: '5px 0', color: '#666' }}>Documento</td>
                            <td style={{ padding: '5px 0', textAlign: 'right', fontWeight: 500, color: '#1a1a1a', fontFamily: 'monospace' }}>{arrematante?.documento || 'Não informado'}</td>
                          </tr>
                          <tr style={{ borderBottom: '1px solid #f5f5f5' }}>
                            <td style={{ padding: '5px 0', color: '#666' }}>Email</td>
                            <td style={{ padding: '5px 0', textAlign: 'right', fontWeight: 500, color: '#1a1a1a' }}>{arrematante?.email || 'Não informado'}</td>
                          </tr>
                          <tr style={{ borderBottom: '1px solid #f5f5f5' }}>
                            <td style={{ padding: '5px 0', color: '#666' }}>Telefone</td>
                            <td style={{ padding: '5px 0', textAlign: 'right', fontWeight: 500, color: '#1a1a1a' }}>{arrematante?.telefone || 'Não informado'}</td>
                          </tr>
                          {arrematante?.endereco && (
                            <tr style={{ borderBottom: '1px solid #f5f5f5' }}>
                              <td style={{ padding: '5px 0', color: '#666' }}>Endereço</td>
                              <td style={{ padding: '5px 0', textAlign: 'right', fontWeight: 500, color: '#1a1a1a' }}>{arrematante.endereco}</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Lote / Mercadoria */}
                  {loteArrematado && (
                    <div style={{ marginTop: '24px', pageBreakInside: 'avoid' }}>
                      <p style={sSection}>Lote Arrematado</p>
                      <div style={{ padding: '12px 0', borderBottom: '1px solid #f0f0f0' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div>
                            <p style={{ fontSize: '13px', fontWeight: 600, color: '#1a1a1a', margin: '0 0 2px 0' }}>Lote {loteArrematado.numero}</p>
                            {loteArrematado.descricao && <p style={{ fontSize: '12px', color: '#999', margin: 0 }}>{loteArrematado.descricao}</p>}
                          </div>
                          <span style={{ fontSize: '11px', color: '#999' }}>{getTipoPagLabel(tipoPagamento || '')}</span>
                        </div>
                        {mercadoriaComprada && (
                          <div style={{ fontSize: '12px', color: '#999', marginTop: '4px' }}>
                            <p style={{ margin: '1px 0' }}>{mercadoriaComprada.titulo || mercadoriaComprada.tipo || 'Mercadoria'}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Detalhamento de Parcelas */}
                  {parcelas.length > 0 && (
                    <div style={{ marginTop: '24px', pageBreakInside: 'avoid' }}>
                      <p style={sSection}>Detalhamento de Parcelas</p>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                            <td style={{ padding: '6px 0', color: '#999', fontWeight: 600, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Parcela</td>
                            <td style={{ padding: '6px 0', color: '#999', fontWeight: 600, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Vencimento</td>
                            <td style={{ padding: '6px 0', color: '#999', fontWeight: 600, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>Valor</td>
                            <td style={{ padding: '6px 0', color: '#999', fontWeight: 600, fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>Status</td>
                          </tr>
                        </thead>
                        <tbody>
                          {parcelas.map((p, idx) => (
                            <tr key={idx} style={{ borderBottom: '1px solid #f5f5f5' }}>
                              <td style={{ padding: '5px 0', color: '#1a1a1a', fontWeight: 500 }}>{p.numero}</td>
                              <td style={{ padding: '5px 0', color: '#666' }}>{p.vencimento}</td>
                              <td style={{ padding: '5px 0', textAlign: 'right', fontWeight: 500, color: '#1a1a1a' }}>
                                {formatCurrency(p.isAtrasada && p.temJuros ? p.valorComJuros : p.valorBase)}
                                {p.isAtrasada && p.temJuros && <span style={{ color: '#dc2626', fontSize: '10px', marginLeft: '4px' }}>(+juros)</span>}
                              </td>
                              <td style={{ padding: '5px 0', textAlign: 'right' }}>
                                <span style={{
                                  fontSize: '10px', fontWeight: 600, padding: '2px 8px', borderRadius: '3px',
                                  background: p.isPaga ? '#f0fdf4' : p.isAtrasada ? '#fef2f2' : '#fafafa',
                                  color: p.isPaga ? '#16a34a' : p.isAtrasada ? '#dc2626' : '#666',
                                  border: `1px solid ${p.isPaga ? '#bbf7d0' : p.isAtrasada ? '#fecaca' : '#e5e7eb'}`,
                                }}>
                                  {p.isPaga ? 'Paga' : p.isAtrasada ? 'Atrasada' : 'Pendente'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}

            {todasFaturas.length > 10 && (
              <div style={{ textAlign: 'center', padding: '24px 0', marginTop: '24px' }}>
                <p style={{ fontSize: '12px', color: '#999', margin: 0 }}>
                  Pré-visualização parcial &middot; O PDF completo incluirá todas as {todasFaturas.length} faturas.
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center bg-slate-50 border-2 border-slate-300 p-12 font-sans">
            <div className="text-lg font-light text-slate-900 tracking-wide">Nenhuma Fatura Encontrada</div>
            <div className="text-sm text-slate-600 font-light mt-3 leading-relaxed">
              Não há obrigações financeiras registradas no sistema.
            </div>
          </div>
        )}

        {/* Logos Elionx e Arthur Lira */}
        <div className="mt-4 sm:mt-6 lg:mt-8 flex justify-center items-center -ml-20">
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
  }

  return null;
};

export default Relatorios;
