import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import html2pdf from 'html2pdf.js';
import {
  ArrowLeft,
  FileText,
  Download,
  Calendar,
  Filter,
  BarChart3,
  PieChart,
  TrendingUp,
  DollarSign,
  Users,
  Package,
  Gavel,
  Clock,
  FileSpreadsheet,
  Printer,
  Mail,
  Eye,
  CreditCard
} from "lucide-react";
import { useSupabaseAuctions } from "@/hooks/use-supabase-auctions";
import { useToast } from "@/hooks/use-toast";
import { useActivityLogger } from "@/hooks/use-activity-logger";
import { StringDatePicker } from "@/components/ui/date-picker";
import { PdfReport } from "@/components/PdfReport";
import { ArrematanteInfo, Auction, LoteInfo, MercadoriaInfo, ItemCustoInfo, ItemPatrocinioInfo } from "@/lib/types";

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
      // ✅ Valor da parcela = valorBase / quantidade (SEM subtrair entrada - são independentes)
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
      valorTotalComJuros = valorBase;
    }
  } else {
    // Para parcelamento simples
    const quantidadeParcelas = arrematante.quantidadeParcelas || 1;
    const mesInicioPagamento = arrematante.mesInicioPagamento;
    
    if (mesInicioPagamento && quantidadeParcelas > 0) {
      const valorPorParcela = valorBase / quantidadeParcelas;
      const [startYear, startMonth] = mesInicioPagamento.split('-').map(Number);
      
      for (let i = 0; i < quantidadeParcelas; i++) {
        const dataVencimento = new Date(startYear, startMonth - 1 + i, arrematante.diaVencimentoMensal || 15);
        const dataVencimentoStr = dataVencimento.toISOString().split('T')[0];
        valorTotalComJuros += calcularJurosProgressivos(valorPorParcela, dataVencimentoStr, percentualJuros);
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
  const { auctions, isLoading } = useSupabaseAuctions();
  const { toast } = useToast();
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
  
  // Estado para o gráfico de evolução
  const [hoveredPoint, setHoveredPoint] = useState<{ x: number; y: number; label: string; index: number; faturamento: number; despesas: number; mes?: string } | null>(null);
  
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
  const stats = {
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

  const formatCurrency = (value: number) => {
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
    console.log('🔍 Iniciando geração do relatório de leilões...');
    console.log('📊 Leilões disponíveis:', auctions?.length);

    if (!auctions || auctions.length === 0) {
      toast({
        title: "Erro",
        description: "Nenhum leilão encontrado para gerar o relatório.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsGenerating(true);
      
      // Filtrar apenas leilões não arquivados
      const leiloesAtivos = auctions.filter(a => !a.arquivado);
      console.log('📈 Leilões ativos (não arquivados):', leiloesAtivos.length);
      
      if (leiloesAtivos.length === 0) {
        toast({
          title: "Aviso",
          description: "Nenhum leilão ativo encontrado para gerar o relatório.",
          variant: "destructive",
        });
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

      console.log('📄 Elemento encontrado:', element);
      console.log('📐 Dimensões:', element.offsetWidth, 'x', element.offsetHeight);

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

      console.log('🔄 Iniciando conversão para PDF...');
      
      // 5. Gerar PDF do elemento renderizado pelo React (mesmo método que funciona)
      await html2pdf().set(opt).from(element).save();
      
      console.log('✅ PDF gerado com sucesso!');
      
      toast({
        title: "✅ Relatório Gerado com Sucesso!",
        description: `Relatório de leilão ${leiloesAtivos[0].identificacao || leiloesAtivos[0].id} foi baixado.`,
        duration: 4000,
      });
      
    } catch (error) {
      console.error('❌ Erro ao gerar relatório:', error);
      toast({
        title: "Erro ao Gerar Relatório",
        description: "Ocorreu um erro ao gerar o relatório. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
      // Sempre fechar o modal no final
      setIsExportModalOpen(false);
      setSelectedAuctionForExport("");
    }
  };

  // Função auxiliar para criar conteúdo PDF de um leilão específico
  const createPdfContentForAuction = (auction: Auction) => {
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

  const handleGerarRelatorio = async () => {
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
  const generateGenericReport = async (type: 'inadimplencia' | 'historico' | 'faturas') => {
    if (!auctions || auctions.length === 0) {
      toast({
        title: "Erro",
        description: "Nenhum leilão encontrado para gerar o relatório.",
        variant: "destructive",
      });
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
              console.error('Erro ao calcular inadimplência:', error);
            }
          }
          
          return false;
        });
        
        dadosRelatorio = inadimplentes.map(auction => `
          <div style="margin-bottom: 20px; border: 1px solid #ddd; border-radius: 8px; padding: 15px; page-break-inside: avoid;">
            <h3 style="font-size: 16px; font-weight: bold; margin-bottom: 10px; color: #dc2626;">
              ${auction.identificacao ? `#${auction.identificacao}` : auction.nome || 'Leilão sem nome'}
            </h3>
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; font-size: 12px;">
              <div><strong>Arrematante:</strong> ${auction.arrematante?.nome || 'N/A'}</div>
              <div><strong>CPF/CNPJ:</strong> ${auction.arrematante?.documento || 'N/A'}</div>
              <div><strong>Telefone:</strong> ${auction.arrematante?.telefone || 'N/A'}</div>
              <div><strong>Valor Total:</strong> ${auction.arrematante?.valorPagar || 'N/A'}</div>
              <div><strong>Data do Leilão:</strong> ${auction.dataInicio ? new Date(auction.dataInicio + 'T00:00:00').toLocaleDateString('pt-BR') : 'N/A'}</div>
              <div><strong>Parcelas Pagas:</strong> ${auction.arrematante?.parcelasPagas || 0} de ${auction.arrematante?.quantidadeParcelas || 0}</div>
            </div>
          </div>
        `).join('') || '<p style="text-align: center; color: #666; font-style: italic;">Nenhuma inadimplência encontrada.</p>';
        
      } else if (type === 'historico') {
        titulo = 'RELATÓRIO DE HISTÓRICO';
        const comArrematante = auctions.filter(a => a.arrematante && !a.arquivado);
        
        dadosRelatorio = comArrematante.map(auction => `
          <div style="margin-bottom: 20px; border: 1px solid #ddd; border-radius: 8px; padding: 15px; page-break-inside: avoid;">
            <h3 style="font-size: 16px; font-weight: bold; margin-bottom: 10px;">
              ${auction.identificacao ? `#${auction.identificacao}` : auction.nome || 'Leilão sem nome'}
            </h3>
            <div style="font-size: 12px;">
              <div style="margin-bottom: 10px;">
                <strong>Arrematante:</strong> ${auction.arrematante?.nome || 'N/A'}<br>
                <strong>Data:</strong> ${auction.dataInicio ? new Date(auction.dataInicio + 'T00:00:00').toLocaleDateString('pt-BR') : 'N/A'}<br>
                <strong>Status:</strong> ${auction.arrematante?.pago ? 'Pago' : (isOverdue(auction.arrematante, auction) ? 'ATRASADO' : 'Pendente')}
              </div>
              ${auction.historicoNotas && auction.historicoNotas.length > 0 ? `
                <div style="background: #f5f5f5; padding: 8px; border-radius: 4px;">
                  <strong>Observações:</strong><br>
                  ${auction.historicoNotas.map(nota => `• ${nota}`).join('<br>')}
                </div>
              ` : ''}
            </div>
          </div>
        `).join('') || '<p style="text-align: center; color: #666; font-style: italic;">Nenhum histórico encontrado.</p>';
        
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
              Fatura - ${auction.identificacao ? `#${auction.identificacao}` : auction.nome || 'Leilão sem nome'}
            </h3>
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; font-size: 12px;">
              <div><strong>Cliente:</strong> ${arrematante?.nome || 'N/A'}</div>
              <div><strong>CPF/CNPJ:</strong> ${arrematante?.documento || 'N/A'}</div>
                <div><strong>Valor Total:</strong> ${valorTotalStr}${detalhamentoJuros}</div>
              <div><strong>Status:</strong> ${arrematante?.pago ? 'Pago' : (isOverdue(arrematante, auction) ? 'ATRASADO' : 'Pendente')}</div>
              <div><strong>Data Leilão:</strong> ${auction.dataInicio ? new Date(auction.dataInicio + 'T00:00:00').toLocaleDateString('pt-BR') : 'N/A'}</div>
              <div><strong>Parcelas:</strong> ${arrematante?.parcelasPagas || 0}/${arrematante?.quantidadeParcelas || 0}</div>
            </div>
            ${mercadoriaComprada ? `
              <div style="margin-top: 10px; padding: 8px; background: #f9fafb; border-radius: 4px; font-size: 11px; border-left: 3px solid #6b7280;">
                <strong>Mercadoria Arrematada:</strong> ${mercadoriaComprada.titulo || mercadoriaComprada.tipo || 'Mercadoria'}<br>
                <strong>Lote:</strong> Lote ${loteComprado.numero} - ${loteComprado.descricao || 'Sem descrição'}
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
      element.innerHTML = `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: black;">
          <div style="text-align: center; margin-bottom: 40px; border-bottom: 2px solid #333; padding-bottom: 20px;">
            <h1 style="font-size: 24px; font-weight: bold; color: #1a1a1a; margin-bottom: 10px;">
              ${titulo}
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
      
      toast({
        title: "Relatório Gerado com Sucesso!",
        description: `Relatório de ${type} foi baixado.`,
        duration: 4000,
      });
      
    } catch (error) {
      console.error('Erro ao gerar relatório:', error);
      toast({
        title: "Erro ao Gerar Relatório",
        description: "Ocorreu um erro ao gerar o relatório. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePreviewRelatorio = () => {
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
    console.log(`🔍 Iniciando geração do relatório de ${reportType}...`);

    if (!auctions || auctions.length === 0) {
      toast({
        title: "Erro",
        description: "Nenhum leilão encontrado para gerar o relatório.",
        variant: "destructive",
      });
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

      console.log('📄 Elemento encontrado:', element);
      console.log('📐 Dimensões:', element.offsetWidth, 'x', element.offsetHeight);

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

      console.log('🔄 Iniciando conversão para PDF...');
      
      // 5. Gerar PDF do elemento renderizado pelo React
      await html2pdf().set(opt).from(element).save();
      
      console.log('✅ PDF gerado com sucesso!');
      
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
      
      toast({
        title: "✅ Relatório Gerado com Sucesso!",
        description: `Relatório de ${typeNames[reportType]} foi baixado.`,
        duration: 4000,
      });
      
    } catch (error) {
      console.error('❌ Erro ao gerar relatório:', error);
      toast({
        title: "Erro ao Gerar Relatório",
        description: "Ocorreu um erro ao gerar o relatório. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
      // Sempre fechar o modal no final
      setIsExportModalOpen(false);
      setSelectedAuctionForExport("");
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-8 slide-in-bottom">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">Central de Relatórios</h1>
            <p className="text-muted-foreground mt-2">Gere relatórios detalhados e análises profissionais dos seus leilões</p>
          </div>
        </div>

        <div className="space-y-6">
          <div>
            <div className="h-7 bg-gray-200 rounded animate-pulse w-48 mb-2"></div>
            <div className="h-4 bg-gray-200 rounded animate-pulse w-80"></div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="relative p-8 animate-pulse">
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
    <div className="space-y-8 slide-in-bottom">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Central de Relatórios</h1>
          <p className="text-muted-foreground mt-2">Gere relatórios detalhados e análises profissionais dos seus leilões</p>
        </div>
      </div>

      {/* Cards de Relatórios Rápidos */}
      <div className="space-y-6">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900 mb-2">
            <FileText className="h-5 w-5 text-gray-600" />
            Relatórios Rápidos
          </h2>
          <p className="text-muted-foreground text-sm">
            Baixe relatórios específicos com um clique
          </p>
        </div>
        
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Card Relatório de Leilões */}
            <div className="relative p-8 hover:bg-gray-50/50 transition-colors group">
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
            <div className="relative p-8 hover:bg-gray-50/50 transition-colors group">
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
            <div className="relative p-8 hover:bg-gray-50/50 transition-colors group">
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
            <div className="relative p-8 hover:bg-gray-50/50 transition-colors group">
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
          <Card className="min-h-[480px]">
            <CardContent className="p-8">
              <div>
                {/* Gráfico */}
                <div>
                  <div className="bg-white p-4 h-full">
                    <div className="flex items-center justify-between">
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

                {/* Legenda */}
                <div className="flex items-center gap-6 mt-3 mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-indigo-500 rounded-full"></div>
                    <span className="text-sm text-gray-600 font-medium">Faturamento</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-gray-400 rounded-full"></div>
                    <span className="text-sm text-gray-600 font-medium">Despesas</span>
                  </div>
                </div>

                
                    <div className="h-96 mt-4">
                      <svg width="100%" height="100%" viewBox="0 0 1400 420" style={{ cursor: 'crosshair' }}>
                        {/* Grid horizontal - linhas sutis */}
                        {[0, 1, 2, 3, 4, 5, 6, 7].map((line) => (
                          <line
                            key={line}
                            x1="30"
                            y1={25 + line * 50}
                            x2="1380"
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
                          const espacamentoX = quantidadePeriodos > 1 ? (1400 - 60) / (quantidadePeriodos - 1) : 0;
                          
                          return labelsData.map((label, i) => (
                            <text
                              key={i}
                              x={30 + (i * espacamentoX)}
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
                            
                            const meses = [];
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
                          const adjustedMax = Math.max(maxValue, 7); // Mesma escala ajustada dos labels
                          
                          return (
                            <>
                              
                              
                              {/* Gráfico com áreas preenchidas e tooltips */}
                              {(() => {
                                // Calcular dados de faturamento e despesas REAIS baseado no período selecionado
                                const dadosGrafico = [];
                                const tipoGrafico = config.periodo.inicio || 'mensal';
                                
                                
                                // Função para calcular valores de um período específico
                                const calcularDadosPeriodo = (dataInicio, dataFim, label) => {
                                   // FATURAMENTO = Total já recebido (incluindo pagamentos parciais)
                                  const faturamentoPeriodo = auctions?.reduce((sum, auction) => {
                                    if (auction.arrematante && !auction.arquivado) {
                                      // Corrigir problema de fuso horário - forçar interpretação como data local
                                      const dataLeilao = new Date(auction.dataInicio + 'T00:00:00.000');
                                      if (dataLeilao >= dataInicio && dataLeilao <= dataFim) {
                                        const arrematante = auction.arrematante;
                                        const parcelasPagas = arrematante?.parcelasPagas || 0;
                                        
                                        // Se totalmente pago, contar valor total
                                        if (arrematante?.pago) {
                                          const valorTotal = arrematante?.valorPagarNumerico || 0;
                                        return sum + valorTotal;
                                        }
                                        
                                        // Se parcialmente pago, calcular valor das parcelas pagas
                                        if (parcelasPagas > 0) {
                                          const loteArrematado = auction.lotes?.find(lote => lote.id === arrematante.loteId);
                                          const tipoPagamento = loteArrematado?.tipoPagamento || auction.tipoPagamento;
                                          const valorTotal = arrematante?.valorPagarNumerico || 0;
                                          
                                          if (tipoPagamento === 'entrada_parcelamento') {
                                            // Para entrada + parcelamento (entrada e parcelas são INDEPENDENTES)
                                            const valorEntrada = arrematante?.valorEntrada ? 
                                              (typeof arrematante.valorEntrada === 'string' ? 
                                                parseFloat(arrematante.valorEntrada.replace(/[^\d,]/g, '').replace(',', '.')) : 
                                                arrematante.valorEntrada) : 
                                              valorTotal * 0.3;
                                            const quantidadeParcelas = arrematante?.quantidadeParcelas || 12;
                                            // ✅ Valor da parcela = valorTotal / quantidade (SEM subtrair entrada)
                                            const valorPorParcela = valorTotal / quantidadeParcelas;
                                            
                                            // Calcular valor recebido: entrada + parcelas pagas
                                            if (parcelasPagas >= 1) {
                                              const parcelasEfetivasPagas = Math.max(0, parcelasPagas - 1);
                                              return sum + valorEntrada + (parcelasEfetivasPagas * valorPorParcela);
                                            }
                                          } else if (tipoPagamento === 'parcelamento' || !tipoPagamento) {
                                            // Para parcelamento simples
                                            const quantidadeParcelas = arrematante?.quantidadeParcelas || 1;
                                            const valorPorParcela = valorTotal / quantidadeParcelas;
                                            return sum + (parcelasPagas * valorPorParcela);
                                          } else if (tipoPagamento === 'a_vista') {
                                            // Para à vista, se parcelasPagas > 0, foi pago
                                            return sum + (parcelasPagas > 0 ? valorTotal : 0);
                                          }
                                        }
                                      }
                                    }
                                    return sum;
                                  }, 0) || 0;
                                  
                                  // Adicionar patrocínios ao faturamento (total recebido de patrocinadores)
                                  // ✅ Considerar APENAS patrocínios confirmados como recebidos
                                  const totalPatrocinios = auctions?.reduce((sum, auction) => {
                                    if (!auction.arquivado) {
                                      const dataLeilao = new Date(auction.dataInicio + 'T00:00:00.000');
                                      if (dataLeilao >= dataInicio && dataLeilao <= dataFim) {
                                        // Somar apenas patrocínios que foram confirmados como recebidos
                                        const patrociniosRecebidos = (auction.detalhePatrocinios || [])
                                          .filter(p => p.recebido === true)
                                          .reduce((sumPatrocinios, p) => sumPatrocinios + (p.valorNumerico || 0), 0);
                                        return sum + patrociniosRecebidos;
                                      }
                                    }
                                    return sum;
                                  }, 0) || 0;
                                  
                                  const faturamentoTotalPeriodo = faturamentoPeriodo + totalPatrocinios;
                                  
                                  // DESPESAS = Custos de todos os leilões com custos definidos (passados ou futuros)
                                  const despesasPeriodo = auctions?.reduce((sum, auction) => {
                                    if (!auction.arquivado) {
                                      // Corrigir problema de fuso horário - forçar interpretação como data local
                                      const dataLeilao = new Date(auction.dataInicio + 'T00:00:00.000');
                                      if (dataLeilao >= dataInicio && dataLeilao <= dataFim) {
                                        // Tentar múltiplas fontes de dados para custos
                                        let custos = 0;
                                        if (auction.custosNumerico !== undefined && auction.custosNumerico > 0) {
                                          custos = auction.custosNumerico;
                                        } else if (typeof auction.custos === 'number' && auction.custos > 0) {
                                          custos = auction.custos;
                                        } else if (typeof auction.custos === 'string' && auction.custos) {
                                          const parsed = parseFloat(auction.custos.replace(/[^\d,]/g, '').replace(',', '.')) || 0;
                                          custos = parsed;
                                        }
                                        
                                        // Incluir despesas se há custos definidos, independente de ser passado ou futuro
                                        if (custos > 0) {
                                          return sum + custos;
                                        }
                                      }
                                    }
                                    return sum;
                                  }, 0) || 0;
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
                                const larguraDisponivel = 1400 - 60; // Total menos margens
                                const larguraSegmento = larguraDisponivel / quantidadePeriodos;
                                const larguraBarra = Math.min(larguraSegmento * 0.3, 50); // Cada barra individual
                                const espacamentoBarra = 6; // Espaço entre faturamento e despesas
                                
                                // Função para calcular posição X das barras
                                const calcularXBarra = (indicePeriodo, tipoFaturamento = true) => {
                                  const centroSegmento = 30 + (indicePeriodo * larguraSegmento) + (larguraSegmento / 2);
                                  const larguraConjunto = (larguraBarra * 2) + espacamentoBarra;
                                  const inicioConjunto = centroSegmento - (larguraConjunto / 2);
                                  
                                  return tipoFaturamento 
                                    ? inicioConjunto 
                                    : inicioConjunto + larguraBarra + espacamentoBarra;
                                };
                                
                                // Para posicionamento de tooltips e linha vertical
                                const calcularCentroPeriodo = (indicePeriodo) => {
                                  return 30 + (indicePeriodo * larguraSegmento) + (larguraSegmento / 2);
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
                                    {/* Barras de Faturamento */}
                                    {dadosMensais.map((dados, i) => {
                                      const alturaFaturamento = 375 - valorParaY(dados.faturamento);
                                      return (
                                        <rect
                                          key={`faturamento-${i}`}
                                          x={calcularXBarra(i, true)}
                                          y={valorParaY(dados.faturamento)}
                                          width={larguraBarra}
                                          height={Math.max(alturaFaturamento, 3)} // Altura mínima de 3px para hover
                                          fill="#6366F1"
                                          fillOpacity={alturaFaturamento < 3 ? "0.3" : "1"} // Transparente se altura mínima
                                          rx="4"
                                          ry="4"
                                          stroke="none"
                                          onMouseEnter={() => setHoveredPoint({ index: i, ...dados })}
                                          onMouseLeave={() => setHoveredPoint(null)}
                                          style={{ cursor: 'crosshair' }}
                                        />
                                      );
                                    })}
                                    
                                    {/* Barras de Despesas */}
                                    {dadosMensais.map((dados, i) => {
                                      const alturaDespesas = 375 - valorParaY(dados.despesas);
                                      return (
                                        <rect
                                          key={`despesas-${i}`}
                                          x={calcularXBarra(i, false)}
                                          y={valorParaY(dados.despesas)}
                                          width={larguraBarra}
                                          height={Math.max(alturaDespesas, 3)} // Altura mínima de 3px para hover
                                          fill="#9CA3AF"
                                          fillOpacity={alturaDespesas < 3 ? "0.3" : "1"} // Transparente se altura mínima
                                          rx="4"
                                          ry="4"
                                          stroke="none"
                                          onMouseEnter={() => setHoveredPoint({ index: i, ...dados })}
                                          onMouseLeave={() => setHoveredPoint(null)}
                                          style={{ cursor: 'crosshair' }}
                                        />
                                      );
                                    })}
                                    
                                    
                                    {/* Áreas interativas para hover */}
                                    {dadosMensais.map((dados, i) => (
                                      <g key={i}>
                                        {/* Área invisível para hover cobrindo todo o segmento do período */}
                                        <rect
                                          x={30 + (i * larguraSegmento)}
                                          y="25"
                                          width={larguraSegmento}
                                          height="350"
                                          fill="transparent"
                                          onMouseEnter={() => setHoveredPoint({ index: i, ...dados })}
                                          onMouseLeave={() => setHoveredPoint(null)}
                                          style={{ cursor: 'crosshair' }}
                                        />
                                      </g>
                                    ))}
                                    
                                    {/* Linha vertical no hover */}
                                    {hoveredPoint && (
                                      <line
                                        x1={calcularCentroPeriodo(hoveredPoint.index)}
                                        y1="25"
                                        x2={calcularCentroPeriodo(hoveredPoint.index)}
                                        y2="375"
                                        stroke="#9CA3AF"
                                        strokeWidth="1.5"
                                        strokeDasharray="4,4"
                                      />
                                    )}
                                    
                                    {/* Tooltip */}
                                    {hoveredPoint && (
                                      <g>
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
                                              <rect
                                                x={tooltipX}
                                                y="4"
                                                width="200"
                                                height={alturaTooltip}
                                                rx="8"
                                                fill="white"
                                                fillOpacity="0.85"
                                                stroke="#E5E7EB"
                                                strokeWidth="1"
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
                                    x="15"
                                    y={25 + tick * 50 + 4}
                                    fill="#64748b"
                                    fontSize="14"
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
            </CardContent>
          </Card>
        </div>

      </div>
      
      {/* Modal de Preview de Relatórios - igual ao da página Leilões */}
      <Dialog open={isPreviewModalOpen} onOpenChange={setIsPreviewModalOpen}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Exportar Relatório - {previewType === 'leiloes' ? 'Leilões' : previewType === 'inadimplencia' ? 'Inadimplência' : previewType === 'historico' ? 'Histórico' : 'Faturas'}</DialogTitle>
            <p className="text-sm text-gray-600">
              Visualize como ficará o relatório antes de baixar
            </p>
          </DialogHeader>
          
          <div className="space-y-6">
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
    
    // Calcular estatísticas
    const totalLeiloes = leiloesAtivos.length;
    const emAndamento = leiloesAtivos.filter(a => a.status === 'em_andamento').length;
    const finalizados = leiloesAtivos.filter(a => a.status === 'finalizado').length;
    const leiloesAgendados = leiloesAtivos.filter(a => a.status === 'agendado').length;
    
    return (
      <div className="bg-white min-h-[600px]" style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', pageBreakInside: 'auto', orphans: 3, widows: 3 }}>
        {/* Cabeçalho Minimalista Corporativo */}
        <div className="text-center pb-6 mb-8" style={{ borderBottom: '1px solid #e2e8f0', pageBreakAfter: 'avoid' }}>
          <div className="mb-4">
            <h1 className="text-3xl font-light text-slate-900 tracking-tight mb-2" style={{ letterSpacing: '0.02em' }}>
            Relatório de Leilões
          </h1>
            <div className="h-px bg-slate-300 w-24 mx-auto"></div>
            </div>
          <div className="text-sm text-slate-600 space-y-1" style={{ fontWeight: 300 }}>
            <div className="flex items-center justify-center gap-6 text-xs uppercase tracking-wider">
              <span>Data: {new Date().toLocaleDateString('pt-BR')}</span>
              <span>•</span>
              <span>Horário: {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <div className="text-xs text-slate-500 mt-2">
              Relatório Gerencial de Leilões Ativos
            </div>
          </div>
        </div>

        {/* Indicadores Executivos */}
        {totalLeiloes > 0 && (
          <div className="mb-8 p-6" style={{ background: 'linear-gradient(to bottom, #f8fafc, #ffffff)', border: '1px solid #e2e8f0', borderRadius: '4px', pageBreakInside: 'avoid' }}>
            <h2 className="text-sm font-medium text-slate-700 uppercase tracking-wider mb-4" style={{ letterSpacing: '0.1em', pageBreakAfter: 'avoid' }}>
              Resumo Executivo
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div className="text-center">
                <div className="text-3xl font-light text-slate-900 mb-1">{totalLeiloes}</div>
                <div className="text-xs text-slate-600 uppercase tracking-wider" style={{ fontWeight: 300 }}>Total de Leilões</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-light text-slate-700 mb-1">{emAndamento}</div>
                <div className="text-xs text-slate-600 uppercase tracking-wider" style={{ fontWeight: 300 }}>Em Andamento</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-light text-slate-700 mb-1">{finalizados}</div>
                <div className="text-xs text-slate-600 uppercase tracking-wider" style={{ fontWeight: 300 }}>Finalizados</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-light text-slate-700 mb-1">{leiloesAgendados}</div>
                <div className="text-xs text-slate-600 uppercase tracking-wider" style={{ fontWeight: 300 }}>Agendados</div>
              </div>
            </div>
          </div>
        )}

        {/* Lista Detalhada dos Leilões */}
        <div className="space-y-12">
          {leiloesAtivos.map((auction, index) => (
            <div key={auction.id} style={{ pageBreakBefore: index > 0 ? 'always' : 'avoid', pageBreakInside: 'avoid' }}>
              {/* Separador visual entre leilões */}
              {index > 0 && (
                <div className="mb-8 pb-4" style={{ borderBottom: '2px solid #cbd5e1' }} />
              )}

              {/* Cabeçalho do Leilão */}
              <div className="mb-6 pb-4" style={{ borderBottom: '1px solid #e2e8f0', pageBreakAfter: 'avoid' }}>
                <div className="mb-2">
                  <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                    Leilão #{String(index + 1).padStart(2, '0')}
                        </span>
                    </div>
                <h2 className="text-2xl font-light text-slate-900 mb-1">
                      {auction.identificacao || auction.nome || `Leilão ${index + 1}`}
                </h2>
                    {auction.nome && auction.identificacao && (
                  <p className="text-sm text-slate-600">{auction.nome}</p>
                    )}
                  </div>

              {/* Identificação do Leilão */}
              <div className="mb-6 break-inside-avoid" style={{ pageBreakInside: 'avoid' }}>
                <h3 className="text-xs font-medium text-slate-700 uppercase tracking-wider mb-3" style={{ letterSpacing: '0.1em' }}>
                  Identificação do Leilão
                </h3>
                <div className="p-4" style={{ background: 'linear-gradient(to bottom, #f8fafc, #ffffff)', border: '1px solid #e2e8f0', borderRadius: '4px' }}>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Código de Identificação</div>
                      <div className="text-base font-medium text-slate-900">{auction.identificacao || 'Não informado'}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Status do Leilão</div>
                      <div className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                        auction.status === 'finalizado' ? 'bg-red-600 text-white border border-red-700' :
                        auction.status === 'em_andamento' ? 'bg-green-50 text-green-700 border border-green-200' :
                        'bg-slate-100 text-slate-700 border border-slate-200'
                      }`}>
                        {getStatusLabel(auction.status)}
                      </div>
                    </div>
                    <div className="col-span-2" style={{ borderTop: '1px solid #e2e8f0', paddingTop: '12px', marginTop: '8px' }}>
                      <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Nome do Evento</div>
                      <div className="text-base font-medium text-slate-900">{auction.nome || 'Não informado'}</div>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Cronograma e Local */}
              <div className="mb-6 break-inside-avoid" style={{ pageBreakInside: 'avoid' }}>
                <h3 className="text-xs font-medium text-slate-700 uppercase tracking-wider mb-3" style={{ letterSpacing: '0.1em' }}>
                  Cronograma e Local do Evento
                </h3>
                <div className="p-4" style={{ background: 'linear-gradient(to bottom, #f8fafc, #ffffff)', border: '1px solid #e2e8f0', borderRadius: '4px' }}>
                  <div className="grid grid-cols-3 gap-4 mb-3 text-sm">
                <div>
                      <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Data de Início</div>
                      <div className="text-base font-medium text-slate-900">{formatDate(auction.dataInicio)}</div>
                      </div>
                    <div>
                      <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Data de Encerramento</div>
                      <div className="text-base font-medium text-slate-900">{formatDate(auction.dataEncerramento || '')}</div>
                      </div>
                    <div>
                      <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Modalidade</div>
                      <div className="text-base font-medium text-slate-900">{getLocalLabel(auction.local)}</div>
                      </div>
                    </div>
                  <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '12px' }}>
                    <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">Endereço do Evento</div>
                    <div className="text-sm text-slate-900">{auction.endereco || 'Não informado'}</div>
                    </div>
                  {auction.historicoNotas?.join('; ') && (
                    <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '12px', marginTop: '12px' }}>
                      <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">Observações</div>
                      <div className="text-sm text-slate-900 p-2 rounded" style={{ backgroundColor: '#fafafa', border: '1px solid #e2e8f0' }}>
                        {auction.historicoNotas?.join('; ') || 'Não informado'}
                      </div>
                      </div>
                  )}
                </div>
              </div>

              {/* Informações Financeiras */}
              <div className="mb-6 break-inside-avoid" style={{ pageBreakInside: 'avoid' }}>
                <h3 className="text-xs font-medium text-slate-700 uppercase tracking-wider mb-3" style={{ letterSpacing: '0.1em' }}>
                  Informações Financeiras
                </h3>
                <div className="p-4" style={{ background: 'linear-gradient(to bottom, #f8fafc, #ffffff)', border: '1px solid #e2e8f0', borderRadius: '4px' }}>
                  <div>
                    <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Custos do Leilão</div>
                    <div className="text-lg font-medium text-slate-900">
                      {formatCurrency(auction.custosNumerico || auction.custos)}
                    </div>
                    </div>
                  </div>
                </div>

                {/* Especificação dos Custos */}
                {auction.detalheCustos && auction.detalheCustos.length > 0 && (
                <div className="mb-6 break-inside-avoid" style={{ pageBreakInside: 'avoid' }}>
                  <h3 className="text-xs font-medium text-slate-700 uppercase tracking-wider mb-3" style={{ letterSpacing: '0.1em' }}>
                      Especificação dos Gastos
                  </h3>
                  <div className="p-4 break-inside-avoid" style={{ background: 'linear-gradient(to bottom, #f8fafc, #ffffff)', border: '1px solid #e2e8f0', borderRadius: '4px', pageBreakInside: 'avoid' }}>
                    <div className="space-y-2">
                      {auction.detalheCustos.map((item: ItemCustoInfo, index: number) => (
                        <div key={item.id || index} className="flex justify-between items-center py-2 px-3 bg-gray-50 rounded border border-gray-200">
                          <div className="flex items-center gap-3">
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded bg-gray-200 text-xs font-semibold text-gray-700">
                              {String(index + 1).padStart(2, '0')}
                            </span>
                            <span className="text-sm text-gray-700">
                              {item.descricao || 'Item de custo'}
                            </span>
                          </div>
                          <span className="text-sm font-medium text-gray-900">
                            {formatCurrency(item.valorNumerico)}
                          </span>
                        </div>
                      ))}
                    </div>
                    </div>
                  </div>
                )}

                {/* Patrocínios Recebidos */}
                {auction.detalhePatrocinios && auction.detalhePatrocinios.length > 0 && (() => {
                  // ✅ Filtrar apenas patrocínios recebidos
                  const patrociniosRecebidos = auction.detalhePatrocinios.filter(p => p.recebido === true);
                  
                  // Se não houver patrocínios recebidos, não mostrar a seção
                  if (patrociniosRecebidos.length === 0) return null;
                  
                  // Calcular total de patrocínios recebidos
                  const totalRecebido = patrociniosRecebidos.reduce((sum, p) => sum + (p.valorNumerico || 0), 0);
                  
                  return (
                <div className="mb-6 break-inside-avoid" style={{ pageBreakInside: 'avoid' }}>
                  <h3 className="text-xs font-medium text-slate-700 uppercase tracking-wider mb-3" style={{ letterSpacing: '0.1em' }}>
                      Patrocínios Recebidos
                  </h3>
                  <div className="p-4 break-inside-avoid" style={{ background: 'linear-gradient(to bottom, #f8fafc, #ffffff)', border: '1px solid #e2e8f0', borderRadius: '4px', pageBreakInside: 'avoid' }}>
                        {/* Total de Patrocínios Recebidos */}
                    <div className="mb-4 pb-3 border-b border-gray-200">
                      <div className="flex justify-between items-center">
                            <div className="text-xs text-slate-500 uppercase tracking-wider" style={{ fontWeight: 500 }}>Total de Patrocínios Recebidos</div>
                        <div className="text-lg font-light text-slate-900 tracking-tight">
                              {formatCurrency(totalRecebido)}
                        </div>
                      </div>
                    </div>

                        {/* Lista de Patrocinadores que pagaram */}
                    <div className="border-t border-gray-200 pt-4">
                      <div className="text-xs font-medium text-gray-600 uppercase tracking-wide mb-3">Patrocinadores</div>
                      <div className="space-y-2">
                            {patrociniosRecebidos.map((item: ItemPatrocinioInfo, index: number) => (
                        <div key={item.id || index} className="flex justify-between items-center py-2 px-3 bg-gray-50 rounded border border-gray-200">
                          <div className="flex items-center gap-3">
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded bg-gray-200 text-xs font-semibold text-gray-700">
                              {String(index + 1).padStart(2, '0')}
                            </span>
                            <span className="text-sm text-gray-700">
                              {item.nomePatrocinador || 'Patrocinador'}
                            </span>
                          </div>
                          <span className="text-sm font-medium text-gray-900">
                            {formatCurrency(item.valorNumerico)}
                          </span>
                        </div>
                      ))}
                    </div>
                    </div>
                  </div>
                </div>
                  );
                })()}

              {/* Configurações de Pagamento por Mercadoria */}
              <div className="mb-6 break-inside-avoid" style={{ pageBreakInside: 'avoid' }}>
                <h3 className="text-xs font-medium text-slate-700 uppercase tracking-wider mb-3" style={{ letterSpacing: '0.1em' }}>
                  Configurações de Pagamento por Mercadoria
                </h3>
                
                {auction.lotes && auction.lotes.length > 0 ? (
                        <div className="space-y-3">
                    {auction.lotes.map((lote, loteIndex) => {
                      if (!lote.mercadorias || lote.mercadorias.length === 0) {
                        return (
                          <div key={lote.id || loteIndex} className="p-3" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '4px' }}>
                            <div className="mb-2">
                              <h4 className="font-medium text-slate-800 text-sm">Lote {lote.numero}</h4>
                          </div>
                            {lote.descricao && <p className="text-xs text-slate-600 mb-2">{lote.descricao}</p>}
                            <div className="bg-gray-100 border border-gray-300 p-2 rounded">
                              <p className="text-gray-600 text-xs text-center">Nenhuma mercadoria cadastrada neste lote</p>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div key={lote.id || loteIndex} className="p-3" style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '4px' }}>
                          <div className="mb-2">
                            <h4 className="font-medium text-slate-800 text-sm">Lote {lote.numero}</h4>
                          </div>
                          
                          {lote.descricao && <p className="text-xs text-slate-600 mb-3">{lote.descricao}</p>}

                          <div className="space-y-2 mt-2">
                            {lote.mercadorias.map((mercadoria, mercIndex) => {
                              const arrematante = auction.arrematantes?.find(arr => arr.mercadoriaId === mercadoria.id);

                              return (
                                <div key={mercadoria.id || mercIndex} className="bg-white border border-gray-300 p-2 rounded">
                                  <div className="mb-2 pb-1 border-b border-gray-200">
                                    <h5 className="text-xs font-medium text-gray-800">
                                      {mercadoria.titulo || mercadoria.tipo || 'Mercadoria'} 
                                      {mercadoria.quantidade && <span className="text-xs text-gray-500 ml-2">(Qtd: {mercadoria.quantidade})</span>}
                                    </h5>
                                    {mercadoria.descricao && <p className="text-xs text-gray-600 mt-1">{mercadoria.descricao}</p>}
                            </div>

                                  {arrematante && arrematante.tipoPagamento ? (
                                    <div>
                                      <p className="text-xs font-medium text-gray-700 mb-1">
                                        Arrematante: {arrematante.nome || 'Não informado'}
                                      </p>
                                      <div className="bg-blue-50 border border-blue-200 p-2 rounded">
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-1 text-xs">
                                          <div>
                                            <strong className="text-gray-700">Tipo:</strong>{' '}
                                            <span className="text-gray-900">
                                              {arrematante.tipoPagamento === 'a_vista' ? 'À Vista' :
                                               arrematante.tipoPagamento === 'parcelamento' ? 'Parcelamento' :
                                               arrematante.tipoPagamento === 'entrada_parcelamento' ? 'Entrada + Parcelamento' :
                                               'Não definido'}
                                            </span>
                          </div>

                                          {arrematante.tipoPagamento === 'a_vista' && arrematante.dataVencimentoVista && (
                                            <div>
                                              <strong className="text-gray-700">Data de Pagamento:</strong>{' '}
                                              <span className="text-gray-900">{formatDate(arrematante.dataVencimentoVista)}</span>
                      </div>
                    )}

                                          {arrematante.tipoPagamento === 'entrada_parcelamento' && arrematante.dataEntrada && (
                                            <div>
                                              <strong className="text-gray-700">Data da Entrada:</strong>{' '}
                                              <span className="text-gray-900">{formatDate(arrematante.dataEntrada)}</span>
                  </div>
                )}

                                          {(arrematante.tipoPagamento === 'parcelamento' || arrematante.tipoPagamento === 'entrada_parcelamento') && (
                                            <>
                                              {arrematante.mesInicioPagamento && (
                                                <div>
                                                  <strong className="text-gray-700">Mês de Início:</strong>{' '}
                                                  <span className="text-gray-900">
                            {(() => {
                                                      const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
                                                                    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
                                                      return meses[parseInt(arrematante.mesInicioPagamento) - 1] || arrematante.mesInicioPagamento;
                            })()}
                            </span>
                        </div>
                      )}
                                              
                                              {arrematante.diaVencimentoMensal && (
                                                <div>
                                                  <strong className="text-gray-700">Dia do Vencimento:</strong>{' '}
                                                  <span className="text-gray-900">Dia {arrematante.diaVencimentoMensal}</span>
                  </div>
                )}

                                              {arrematante.quantidadeParcelas && (
                                                <div>
                                                  <strong className="text-gray-700">Parcelas:</strong>{' '}
                                                  <span className="text-gray-900">
                                                    {arrematante.quantidadeParcelas}x
                                                    {arrematante.tipoPagamento === 'entrada_parcelamento' ? ' (após entrada)' : ''}
                              </span>
                                                </div>
                                              )}
                                            </>
                            )}
                          </div>
                            </div>
                                    </div>
                                  ) : (
                                    <div className="bg-white border border-gray-300 p-2 rounded">
                                      <p className="text-gray-600 text-xs text-center">
                                        Configurações de pagamento não definidas para esta mercadoria
                                      </p>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                              </div>
                          </div>
                      );
                    })}
                        </div>
                ) : (
                  <div className="p-3 bg-gray-50 rounded border border-gray-200">
                    <p className="text-gray-600 text-center text-sm">Nenhum lote cadastrado neste leilão</p>
                  </div>
                )}
              </div>
            </div>
          ))}
          
          {leiloesAtivos.length > 3 && (
            <div className="text-center py-6 px-8 mt-6" style={{ background: 'linear-gradient(to bottom, #f8fafc, #ffffff)', border: '1px solid #e2e8f0', borderRadius: '4px' }}>
              <div className="text-base font-medium text-slate-900 mb-2" style={{ letterSpacing: '0.02em' }}>
                Visualização Parcial
              </div>
              <div className="text-sm text-slate-600 leading-relaxed" style={{ fontWeight: 300 }}>
                Esta pré-visualização apresenta os primeiros 3 processos.
                <br />
                O documento PDF completo incluirá todos os {leiloesAtivos.length} processos licitatórios.
              </div>
            </div>
          )}
        </div>

        {/* Rodapé Corporativo */}
        <div className="mt-12 pt-6" style={{ borderTop: '1px solid #e2e8f0', pageBreakInside: 'avoid' }}>
          <div className="text-center mb-6">
            <p className="text-xs text-slate-500 mb-4" style={{ fontWeight: 300, lineHeight: '1.6' }}>
              Este documento foi gerado automaticamente pelo sistema de gestão de leilões.<br />
              Informações atualizadas em {new Date().toLocaleDateString('pt-BR')} às {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.
            </p>
          </div>

        {/* Logos Elionx e Arthur Lira */}
          <div className="flex justify-center items-center mt-6 -ml-20">
          <img 
            src="/logo-elionx-softwares.png" 
            alt="Elionx Softwares" 
              className="object-contain opacity-80"
            style={{ maxHeight: '320px', maxWidth: '620px' }}
          />
          <img 
            src="/arthur-lira-logo.png" 
            alt="Arthur Lira Leilões" 
              className="object-contain opacity-80 -mt-2 -ml-16"
            style={{ maxHeight: '55px', maxWidth: '110px' }}
          />
        </div>
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
            console.error('Erro ao calcular inadimplência de parcela:', error);
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
          console.error('Erro ao calcular inadimplência:', error);
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
        // ✅ Valor da parcela = valorTotal / quantidade (SEM subtrair entrada - são independentes)
        const valorPorParcela = valorTotal / quantidadeParcelas;
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
                // Aplicar juros progressivos na parcela atrasada
                const valorParcelaComJuros = calcularJurosProgressivos(valorPorParcela, dataVencimentoStr, percentualJuros);
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
            console.error('Erro ao calcular vencimento de parcela:', error);
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
            const valorPorParcela = valorTotal / quantidadeParcelas;
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
                // Aplicar juros progressivos na parcela atrasada
                const valorParcelaComJuros = calcularJurosProgressivos(valorPorParcela, dataVencimentoStr, percentualJuros);
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
            console.error('Erro ao calcular detalhes de inadimplência:', error);
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

    return (
      <div className="bg-white min-h-[600px]" style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', pageBreakInside: 'auto', orphans: 3, widows: 3 }}>
        {/* Cabeçalho Minimalista Corporativo */}
        <div className="text-center pb-6 mb-8" style={{ borderBottom: '1px solid #e2e8f0', pageBreakAfter: 'avoid' }}>
          <div className="mb-4">
            <h1 className="text-3xl font-light text-slate-900 tracking-tight mb-2" style={{ letterSpacing: '0.02em' }}>
              Relatório de Inadimplência {paymentTypeFilter !== 'todos' && 
                `• ${paymentTypeFilter === 'a_vista' ? 'À Vista' : 
                   paymentTypeFilter === 'parcelamento' ? 'Parcelamento' : 
                   'Entrada + Parcelamento'}`
            }
          </h1>
            <div className="h-px bg-slate-300 w-24 mx-auto"></div>
            </div>
          <div className="text-sm text-slate-600 space-y-1" style={{ fontWeight: 300 }}>
            <div className="flex items-center justify-center gap-6 text-xs uppercase tracking-wider">
              <span>Data: {new Date().toLocaleDateString('pt-BR')}</span>
              <span>•</span>
              <span>Horário: {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <div className="text-xs text-slate-500 mt-2">
              Análise de Pendências Financeiras e Pagamentos em Atraso
            </div>
          </div>
        </div>

        {/* Indicadores Executivos */}
        {inadimplentes.length > 0 && (
          <div className="mb-8 p-6" style={{ background: 'linear-gradient(to bottom, #f8fafc, #ffffff)', border: '1px solid #e2e8f0', borderRadius: '4px', pageBreakInside: 'avoid' }}>
            <h2 className="text-sm font-medium text-slate-700 uppercase tracking-wider mb-6" style={{ letterSpacing: '0.1em', pageBreakAfter: 'avoid' }}>
              Resumo Executivo
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8" style={{ gap: '2rem', alignItems: 'start' }}>
              <div className="text-center" style={{ minWidth: '120px', padding: '0.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'flex-start' }}>
                <div className="text-2xl font-light text-red-700" style={{ fontSize: '1.75rem', lineHeight: '1.2', marginBottom: '0.5rem', height: '2.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {inadimplentes.length}
                </div>
                <div className="text-xs text-slate-600 uppercase tracking-wider" style={{ fontWeight: 300, fontSize: '0.7rem', lineHeight: '1.3', whiteSpace: 'nowrap' }}>
                  Total Casos
                </div>
              </div>
              <div className="text-center" style={{ minWidth: '140px', padding: '0.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'flex-start' }}>
                <div className="text-2xl font-light text-red-700" style={{ fontSize: '1.5rem', lineHeight: '1.2', marginBottom: '0.5rem', height: '2.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center', wordBreak: 'keep-all' }}>
                  {formatCurrency(valorTotalInadimplencia)}
                </div>
                <div className="text-xs text-slate-600 uppercase tracking-wider" style={{ fontWeight: 300, fontSize: '0.7rem', lineHeight: '1.3', whiteSpace: 'nowrap' }}>
                  Valor em Atraso
                </div>
              </div>
              <div className="text-center" style={{ minWidth: '120px', padding: '0.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'flex-start' }}>
                <div className="text-2xl font-light text-red-700" style={{ fontSize: '1.75rem', lineHeight: '1.2', marginBottom: '0.5rem', height: '2.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {Math.round(diasAtrasoMedio)}
                </div>
                <div className="text-xs text-slate-600 uppercase tracking-wider" style={{ fontWeight: 300, fontSize: '0.7rem', lineHeight: '1.3', whiteSpace: 'nowrap' }}>
                  Dias Médio Atraso
                </div>
              </div>
              <div className="text-center" style={{ minWidth: '120px', padding: '0.5rem', display: 'flex', flexDirection: 'column', justifyContent: 'flex-start' }}>
                <div className="text-2xl font-light text-red-700" style={{ fontSize: '1.75rem', lineHeight: '1.2', marginBottom: '0.5rem', height: '2.1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {inadimplentes.filter(a => a.detalhesInadimplencia?.diasAtraso > 30).length}
                </div>
                <div className="text-xs text-slate-600 uppercase tracking-wider" style={{ fontWeight: 300, fontSize: '0.7rem', lineHeight: '1.3', whiteSpace: 'nowrap' }}>
                  Casos Críticos (+30d)
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Lista Detalhada de Inadimplentes */}
        {inadimplentes.length > 0 ? (
          <div className="space-y-6">
            <div className="pb-3 mb-4" style={{ borderBottom: '1px solid #cbd5e1', pageBreakAfter: 'avoid' }}>
              <h2 className="text-lg font-medium text-slate-900 tracking-tight">
                Análise Detalhada dos Casos
              </h2>
              <p className="text-sm text-slate-600 mt-1" style={{ fontWeight: 300 }}>
                Informações completas sobre cada devedor e status dos pagamentos em atraso
              </p>
            </div>
            
            {inadimplentes.slice(0, 3).map((auction, index) => (
              <div key={auction.id} className="mb-6" style={{ pageBreakBefore: index > 0 ? 'auto' : 'avoid', border: '1px solid #cbd5e1', borderRadius: '4px', overflow: 'hidden' }}>
                {/* Cabeçalho do Caso */}
                <div className="px-6 py-4" style={{ background: 'linear-gradient(to right, #fef2f2, #ffffff)', borderBottom: '1px solid #fee2e2', pageBreakAfter: 'avoid' }}>
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-lg font-light text-slate-900 mb-2">
                        {auction.identificacao ? `Processo Nº ${auction.identificacao}` : (auction.nome || 'Processo sem identificação')}
                      </h3>
                      <p className="text-sm text-red-700 font-medium">
                        {auction.detalhesInadimplencia?.tipoAtraso} • 
                        {auction.detalhesInadimplencia?.diasAtraso} dias de atraso
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-slate-500 uppercase tracking-wider">Gravidade</div>
                      <div className={`text-sm font-medium mt-1 ${
                        auction.detalhesInadimplencia?.diasAtraso > 60 ? 'text-red-900' :
                        auction.detalhesInadimplencia?.diasAtraso > 30 ? 'text-red-700' :
                        'text-red-600'
                      }`}>
                        {auction.detalhesInadimplencia?.diasAtraso > 60 ? 'CRÍTICA' :
                         auction.detalhesInadimplencia?.diasAtraso > 30 ? 'ALTA' : 'MODERADA'}
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="px-6 py-5 space-y-5">
                  {/* Informações do Devedor */}
                  <div>
                    <h4 className="text-xs font-medium text-slate-700 uppercase tracking-wider mb-3" style={{ letterSpacing: '0.1em', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px', pageBreakAfter: 'avoid' }}>
                      Identificação do Devedor
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm" style={{ fontWeight: 300 }}>
                      <div className="space-y-2">
                        <div className="flex items-start">
                          <span className="text-slate-500 min-w-[110px]">Nome:</span>
                          <span className="text-slate-900 font-medium">{auction.arrematante?.nome || 'Não informado'}</span>
                      </div>
                        <div className="flex items-start">
                          <span className="text-slate-500 min-w-[110px]">Documento:</span>
                          <span className="text-slate-900">{auction.arrematante?.documento || 'Não informado'}</span>
                        </div>
                        <div className="flex items-start">
                          <span className="text-slate-500 min-w-[110px]">Telefone:</span>
                          <span className="text-slate-900">{auction.arrematante?.telefone || 'Não informado'}</span>
                        </div>
                        <div className="flex items-start">
                          <span className="text-slate-500 min-w-[110px]">Email:</span>
                          <span className="text-slate-900">{auction.arrematante?.email || 'Não informado'}</span>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-start">
                          <span className="text-slate-500 min-w-[110px]">Data Leilão:</span>
                          <span className="text-slate-900">{formatDate(auction.dataInicio)}</span>
                        </div>
                        <div className="flex items-start">
                          <span className="text-slate-500 min-w-[110px]">Valor Total:</span>
                          <span className="text-slate-900 font-medium">
                          {(() => {
                            const arrematante = auction.arrematante;
                            if (!arrematante) return formatCurrency(0);
                            
                            const valorBase = arrematante.valorPagarNumerico || parseFloat(arrematante.valorPagar?.replace(/[^\d,]/g, '').replace(',', '.') || '0');
                            const loteComprado = arrematante.loteId 
                              ? auction.lotes?.find(lote => lote.id === arrematante.loteId)
                              : null;
                            const tipoPagamento = loteComprado?.tipoPagamento || auction.tipoPagamento;
                            
                            // Para pagamento à vista
                            if (tipoPagamento === 'a_vista') {
                              // Para à vista, usar o valor em atraso que já inclui juros
                              const detalhes = auction.detalhesInadimplencia;
                              if (detalhes && detalhes.valorEmAtraso > 0) {
                                return formatCurrency(detalhes.valorEmAtraso);
                              }
                              return formatCurrency(valorBase);
                            }
                            
                            // Usar o valor já calculado de detalhesInadimplencia
                            const detalhes = auction.detalhesInadimplencia;
                            if (detalhes && detalhes.valorEmAtraso > 0) {
                              // Calcular quantas parcelas ainda faltam pagar (futuras, não atrasadas)
                              const quantidadeParcelas = arrematante.quantidadeParcelas || 0;
                              const parcelasPagas = arrematante.parcelasPagas || 0;
                              const parcelasAtrasadas = detalhes.parcelasAtrasadas || 0;
                              const valorParcela = detalhes.valorParcela || 0;
                              
                              // Para entrada_parcelamento: parcelasPagas inclui a entrada
                              // Total de parcelas pendentes (não pagas)
                              let totalParcelasPendentes = 0;
                              if (tipoPagamento === 'entrada_parcelamento') {
                                // Se parcelasPagas = 0, entrada não foi paga
                                // parcelasPendentes = 1 (entrada) + quantidadeParcelas (parcelas mensais)
                                if (parcelasPagas === 0) {
                                  totalParcelasPendentes = 1 + quantidadeParcelas;
                                } else {
                                  // Entrada foi paga, resta: quantidadeParcelas - (parcelasPagas - 1)
                                  totalParcelasPendentes = quantidadeParcelas - (parcelasPagas - 1);
                                }
                              } else {
                                // Para parcelamento simples
                                totalParcelasPendentes = quantidadeParcelas - parcelasPagas;
                              }
                              
                              // Parcelas futuras = total pendentes - atrasadas
                              const parcelasFuturas = Math.max(0, totalParcelasPendentes - parcelasAtrasadas);
                              
                              // Total = valor em atraso (já com juros) + parcelas futuras (sem juros)
                              const valorTotal = detalhes.valorEmAtraso + (parcelasFuturas * valorParcela);
                              
                              return formatCurrency(valorTotal);
                            }
                            
                            // Fallback: calcular manualmente
                            let valorTotalComJuros = 0;
                            const percentualJuros = arrematante.percentualJurosAtraso || 0;
                            const hoje = new Date();
                            hoje.setHours(0, 0, 0, 0);
                            
                            if (tipoPagamento === 'entrada_parcelamento') {
                              const percentualEntrada = 30; // Padrão de 30% para entrada
                              const valorEntrada = (valorBase * percentualEntrada) / 100;
                              const dataEntrada = arrematante.dataEntrada ? new Date(arrematante.dataEntrada + 'T00:00:00') : null;
                              
                              if (dataEntrada && dataEntrada < hoje) {
                                const dataEntradaStr = arrematante.dataEntrada || '';
                                valorTotalComJuros += calcularJurosProgressivos(valorEntrada, dataEntradaStr, percentualJuros);
                              } else {
                                valorTotalComJuros += valorEntrada;
                              }
                              
                              const valorRestante = valorBase - valorEntrada;
                              const quantidadeParcelas = arrematante.quantidadeParcelas || 0;
                              const valorParcela = quantidadeParcelas > 0 ? valorRestante / quantidadeParcelas : 0;
                              const parcelasPagas = arrematante.parcelasPagas || 0;
                              const mesInicioParcelas = arrematante.mesInicioPagamento;
                              const diaVencimento = arrematante.diaVencimentoMensal || 1;
                              
                              for (let i = parcelasPagas; i < quantidadeParcelas; i++) {
                                if (mesInicioParcelas) {
                                  const [ano, mes] = mesInicioParcelas.split('-').map(Number);
                                  const dataVencimentoParcela = new Date(ano, mes - 1 + i, diaVencimento);
                                  
                                  if (dataVencimentoParcela < hoje) {
                                    const dataVencimentoParcelaStr = dataVencimentoParcela.toISOString().split('T')[0];
                                    valorTotalComJuros += calcularJurosProgressivos(valorParcela, dataVencimentoParcelaStr, percentualJuros);
                                  } else {
                                    valorTotalComJuros += valorParcela;
                                  }
                                } else {
                                  valorTotalComJuros += valorParcela;
                                }
                              }
                            } else if (tipoPagamento === 'parcelamento') {
                              const quantidadeParcelas = arrematante.quantidadeParcelas || 0;
                              const valorParcela = quantidadeParcelas > 0 ? valorBase / quantidadeParcelas : 0;
                              const parcelasPagas = arrematante.parcelasPagas || 0;
                              const mesInicioParcelas = arrematante.mesInicioPagamento;
                              const diaVencimento = arrematante.diaVencimentoMensal || 1;
                              
                              for (let i = parcelasPagas; i < quantidadeParcelas; i++) {
                                if (mesInicioParcelas) {
                                  const [ano, mes] = mesInicioParcelas.split('-').map(Number);
                                  const dataVencimentoParcela = new Date(ano, mes - 1 + i, diaVencimento);
                                  
                                  if (dataVencimentoParcela < hoje) {
                                    const dataVencimentoParcelaStr = dataVencimentoParcela.toISOString().split('T')[0];
                                    valorTotalComJuros += calcularJurosProgressivos(valorParcela, dataVencimentoParcelaStr, percentualJuros);
                                  } else {
                                    valorTotalComJuros += valorParcela;
                                  }
                                } else {
                                  valorTotalComJuros += valorParcela;
                                }
                              }
                            }
                            
                            return formatCurrency(valorTotalComJuros > 0 ? valorTotalComJuros : valorBase);
                          })()}
                        </span></div>
                        {(() => {
                          const loteComprado = auction.arrematante?.loteId 
                            ? auction.lotes?.find(lote => lote.id === auction.arrematante.loteId)
                            : null;
                          return loteComprado ? (
                            <div className="flex items-start">
                              <span className="text-slate-500 min-w-[110px]">Lote:</span>
                              <span className="text-slate-900">#{loteComprado.numero} - {loteComprado.descricao || 'Sem descrição'}</span>
                            </div>
                          ) : null;
                        })()}
                        <div className="flex items-start">
                          <span className="text-slate-500 min-w-[110px]">Modalidade:</span>
                          <span className="text-slate-900">
                          {(() => {
                            const loteComprado = auction.arrematante?.loteId 
                              ? auction.lotes?.find(lote => lote.id === auction.arrematante.loteId)
                              : null;
                            const tipoPagamento = loteComprado?.tipoPagamento || auction.tipoPagamento;
                            switch (tipoPagamento) {
                              case 'a_vista': return 'À vista';
                              case 'parcelamento': return 'Parcelamento';
                              case 'entrada_parcelamento': return 'Entrada + Parcelamento';
                              default: return 'Não definido';
                            }
                          })()}
                        </span></div>
                      </div>
                    </div>
                  </div>

                  {/* Detalhes da Inadimplência */}
                  <div className="pt-5" style={{ borderTop: '1px solid #e2e8f0', pageBreakInside: 'avoid' }}>
                    <h4 className="text-xs font-medium text-slate-700 uppercase tracking-wider mb-3" style={{ letterSpacing: '0.1em', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px', pageBreakAfter: 'avoid' }}>
                      Análise da Inadimplência
                    </h4>
                    <div className="p-4" style={{ background: 'linear-gradient(to bottom, #fef2f2, #ffffff)', border: '1px solid #fecaca', borderRadius: '4px' }}>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm mb-3">
                        <div>
                          <div className="text-xs text-slate-500 uppercase tracking-wider mb-1" style={{ fontWeight: 500 }}>Valor em Atraso</div>
                          <div className="text-lg font-medium text-red-700">
                            {formatCurrency(auction.detalhesInadimplencia?.valorEmAtraso)}
                          </div>
                          {auction.arrematante?.percentualJurosAtraso && auction.arrematante.percentualJurosAtraso > 0 && (
                            <div className="text-xs text-red-600 mt-1" style={{ fontWeight: 300, color: '#dc2626', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                              Inclui juros de {auction.arrematante.percentualJurosAtraso}%/mês
                            </div>
                          )}
                        </div>
                        <div>
                          <div className="text-xs text-slate-500 uppercase tracking-wider mb-1" style={{ fontWeight: 500 }}>Data de Vencimento</div>
                          <div className="text-lg font-medium text-slate-900">
                            {auction.detalhesInadimplencia?.dataVencimento ? 
                              formatDate(auction.detalhesInadimplencia.dataVencimento) : 'N/A'}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-500 uppercase tracking-wider mb-1" style={{ fontWeight: 500 }}>Dias em Atraso</div>
                          <div className="text-lg font-medium text-slate-900">
                            {auction.detalhesInadimplencia?.diasAtraso} dias
                          </div>
                        </div>
                      </div>
                      {auction.detalhesInadimplencia?.parcelasAtrasadas > 1 && (
                        <div className="pt-3" style={{ borderTop: '1px solid #fecaca' }}>
                          <div className="text-xs text-slate-600" style={{ fontWeight: 300 }}>
                            <span className="font-medium">Total de Pendências:</span> {auction.detalhesInadimplencia.parcelasAtrasadas} pagamento(s) em atraso
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Informações de Pagamento Específicas */}
                  {(() => {
                    const loteComprado = auction.arrematante?.loteId 
                      ? auction.lotes?.find(lote => lote.id === auction.arrematante.loteId)
                      : null;
                    const tipoPagamento = loteComprado?.tipoPagamento || auction.tipoPagamento;
                    
                    if (tipoPagamento === 'entrada_parcelamento') {
                      // Obter dados necessários
                      const parcelasPagas = auction.arrematante?.parcelasPagas || 0;
                      const quantidadeParcelas = auction.arrematante?.quantidadeParcelas || 12;
                      
                      // Determinar status da entrada
                      const dataEntrada = loteComprado?.dataEntrada || auction.dataEntrada;
                      const hoje = new Date();
                      let statusEntrada = 'Não informado';
                      let corStatusEntrada = 'text-slate-900';
                      
                      if (dataEntrada) {
                        const vencimentoEntrada = new Date(dataEntrada);
                        vencimentoEntrada.setHours(23, 59, 59, 999);
                        
                        // Verificar se entrada foi paga (parcelasPagas > 0)
                        if (parcelasPagas > 0) {
                          statusEntrada = 'Pago';
                          corStatusEntrada = 'text-green-700';
                        } else if (hoje > vencimentoEntrada) {
                          statusEntrada = 'ATRASADO';
                          corStatusEntrada = 'text-red-700';
                        } else {
                          statusEntrada = 'Pendente';
                          corStatusEntrada = 'text-orange-600';
                        }
                      }
                      
                      // Calcular próximo vencimento de parcela
                      const mesInicio = auction.arrematante?.mesInicioPagamento;
                      const diaVencimento = auction.arrematante?.diaVencimentoMensal || 15;
                      let proximaParcelaData = 'N/A';
                      let statusProximaParcela = 'Aguardando entrada';
                      
                      if (mesInicio) {
                        try {
                          const [ano, mes] = mesInicio.split('-').map(Number);
                          
                          if (parcelasPagas === 0) {
                            // Entrada ainda não foi paga, verificar se primeira parcela também está em atraso
                            const dataPrimeiraParcela = new Date(ano, mes - 1, diaVencimento);
                            proximaParcelaData = formatDate(dataPrimeiraParcela.toISOString().split('T')[0]);
                            
                            // Verificar se ambos estão em atraso
                            if (statusEntrada === 'ATRASADO' && hoje > dataPrimeiraParcela) {
                              statusProximaParcela = 'ATRASADO';
                            } else if (statusEntrada === 'ATRASADO') {
                              statusProximaParcela = 'Aguardando entrada (em atraso)';
                            } else if (hoje > dataPrimeiraParcela) {
                              statusProximaParcela = 'ATRASADO';
                            } else {
                              statusProximaParcela = 'Aguardando entrada';
                            }
                          } else {
                            // Entrada foi paga, calcular próxima parcela
                            const proximaParcelaIndex = parcelasPagas - 1; // -1 porque parcelasPagas inclui entrada
                            
                            if (proximaParcelaIndex < quantidadeParcelas) {
                              const dataProximaParcela = new Date(ano, mes - 1 + proximaParcelaIndex, diaVencimento);
                              proximaParcelaData = formatDate(dataProximaParcela.toISOString().split('T')[0]);
                              
                              if (hoje > dataProximaParcela) {
                                statusProximaParcela = 'ATRASADO';
                              } else {
                                statusProximaParcela = 'Pendente';
                              }
                            } else {
                              proximaParcelaData = 'Todas pagas';
                              statusProximaParcela = 'Concluído';
                            }
                          }
                        } catch (error) {
                          console.error('Erro ao calcular próxima parcela:', error);
                        }
                      }

                      return (
                        <div className="pt-5" style={{ borderTop: '1px solid #e2e8f0', pageBreakInside: 'avoid' }}>
                          <h4 className="text-xs font-medium text-slate-700 uppercase tracking-wider mb-3" style={{ letterSpacing: '0.1em', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px', pageBreakAfter: 'avoid' }}>
                            Detalhamento Entrada + Parcelamento
                          </h4>
                          
                          {/* Informações da Entrada - só mostrar se estiver atrasada */}
                          {statusEntrada !== 'Pago' && (
                            <div className="p-4 mb-4" style={{ background: 'linear-gradient(to bottom, #f8fafc, #ffffff)', border: '1px solid #e2e8f0', borderRadius: '4px', pageBreakInside: 'avoid' }}>
                              <h5 className="text-sm font-medium text-slate-800 mb-3" style={{ borderBottom: '1px solid #e2e8f0', paddingBottom: '8px', pageBreakAfter: 'avoid' }}>
                                Status da Entrada
                              </h5>
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                                <div>
                                  <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Valor da Entrada</div>
                                  <div className="text-base font-medium text-slate-900">
                                    {formatCurrency(auction.detalhesInadimplencia?.valorEntrada)}
                                    {statusEntrada === 'ATRASADO' && auction.arrematante?.percentualJurosAtraso && auction.arrematante.percentualJurosAtraso > 0 && (
                                      <span className="block text-xs text-red-600 mt-1" style={{ display: 'block', color: '#dc2626', fontSize: '0.75rem', marginTop: '0.25rem' }}>
                                        (com juros de {auction.arrematante.percentualJurosAtraso}%/mês)
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Data de Vencimento</div>
                                  <div className="text-base font-medium text-slate-900">
                                    {dataEntrada ? formatDate(dataEntrada) : 'N/A'}
                                  </div>
                                </div>
                                <div>
                                  <div className="text-xs text-slate-500 uppercase tracking-wider mb-1">Status da Entrada</div>
                                  <div className={`text-base font-medium ${corStatusEntrada}`}>
                                    {statusEntrada}
                                    {statusEntrada === 'ATRASADO' && dataEntrada && (
                                      <span className="block text-xs text-slate-500 mt-1">
                                        {calcularDiasAtraso(dataEntrada)} dias de atraso
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Informações das Parcelas */}
                          <div className="bg-slate-50 border border-slate-300 rounded-lg p-4" style={{ pageBreakInside: 'avoid' }}>
                            <h5 className="text-sm font-medium text-slate-800 mb-3 border-b border-slate-200 pb-1" style={{ pageBreakAfter: 'avoid' }}>
                              Status das Parcelas (após entrada)
                            </h5>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                              <div className="space-y-3">
                                <div className="flex">
                                  <span className="text-slate-500 w-32">Valor por Parcela:</span>
                                  <span className="text-slate-900 font-medium">
                                    {formatCurrency(auction.detalhesInadimplencia?.valorParcela)}
                                    {statusProximaParcela === 'ATRASADO' && ' (base)'}
                                  </span>
                                </div>
                                <div className="flex"><span className="text-slate-500 w-32">Total de Parcelas:</span> <span className="text-slate-900">{auction.arrematante?.quantidadeParcelas || 0} parcelas</span></div>
                                <div className="flex"><span className="text-slate-500 w-32">Dia Vencimento:</span> <span className="text-slate-900">Dia {auction.arrematante?.diaVencimentoMensal || 'N/A'}</span></div>
                              </div>
                              <div className="space-y-3">
                                <div className="flex"><span className="text-slate-500 w-32">Parcelas Pagas:</span> <span className="text-slate-900">{(auction.arrematante?.parcelasPagas || 0) > 0 ? (auction.arrematante.parcelasPagas - 1) : 0} de {auction.arrematante?.quantidadeParcelas || 0}</span></div>
                                <div className="flex"><span className="text-slate-500 w-32">Parcelas Restantes:</span> <span className="text-slate-900">{auction.arrematante?.quantidadeParcelas - ((auction.arrematante?.parcelasPagas || 0) > 0 ? (auction.arrematante.parcelasPagas - 1) : 0) || 0}</span></div>
                                <div className="flex"><span className="text-slate-500 w-32">Próxima Parcela:</span> <span className="text-slate-900">{proximaParcelaData}</span></div>
                                <div className="flex"><span className="text-slate-500 w-32">Status:</span> <span className={`${statusProximaParcela === 'ATRASADO' ? 'text-red-700' : statusProximaParcela === 'Pendente' ? 'text-orange-600' : statusProximaParcela === 'Concluído' ? 'text-green-700' : 'text-slate-900'}`}>{statusProximaParcela}</span></div>
                                {statusProximaParcela === 'ATRASADO' && auction.detalhesInadimplencia?.parcelasAtrasadas > 1 && (
                                  <div className="flex">
                                    <span className="text-slate-500 w-32">Parcelas Atrasadas:</span>
                                    <span className="text-red-700 font-medium">
                                      {auction.detalhesInadimplencia.parcelasAtrasadas - (statusEntrada === 'ATRASADO' ? 1 : 0)} parcela(s)
                                    </span>
                              </div>
                                )}
                            </div>
                            </div>
                            {statusProximaParcela === 'ATRASADO' && auction.detalhesInadimplencia?.parcelasAtrasadas > 0 && (
                              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded" style={{ marginTop: '1rem', padding: '0.75rem', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '0.375rem' }}>
                                <div className="text-xs text-red-700 font-medium mb-1" style={{ fontSize: '0.75rem', color: '#b91c1c', fontWeight: 500, marginBottom: '0.25rem' }}>⚠️ Informação Importante:</div>
                                <div className="text-xs text-red-600" style={{ fontSize: '0.75rem', color: '#dc2626' }}>
                                  O valor acima é o valor base da parcela. {auction.arrematante?.percentualJurosAtraso && auction.arrematante.percentualJurosAtraso > 0 ? `Com juros de ${auction.arrematante.percentualJurosAtraso}% ao mês aplicados sobre cada parcela atrasada, ` : ''}o valor total em atraso já está calculado com todos os juros progressivos acumulados.
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    } else if (tipoPagamento === 'parcelamento') {
                      // Calcular próxima parcela para parcelamento simples
                      const mesInicio = auction.arrematante?.mesInicioPagamento;
                      const diaVencimento = auction.arrematante?.diaVencimentoMensal || 15;
                      const parcelasPagas = auction.arrematante?.parcelasPagas || 0;
                      const quantidadeParcelas = auction.arrematante?.quantidadeParcelas || 12;
                      let proximaParcelaData = 'N/A';
                      let statusProximaParcela = 'N/A';
                      
                      if (mesInicio) {
                        try {
                          const [ano, mes] = mesInicio.split('-').map(Number);
                          
                          if (parcelasPagas < quantidadeParcelas) {
                            const dataProximaParcela = new Date(ano, mes - 1 + parcelasPagas, diaVencimento);
                            proximaParcelaData = formatDate(dataProximaParcela.toISOString().split('T')[0]);
                            
                            const hoje = new Date();
                            if (hoje > dataProximaParcela) {
                              statusProximaParcela = 'ATRASADO';
                            } else {
                              statusProximaParcela = 'Pendente';
                            }
                          } else {
                            proximaParcelaData = 'Todas pagas';
                            statusProximaParcela = 'Concluído';
                          }
                        } catch (error) {
                          console.error('Erro ao calcular próxima parcela:', error);
                        }
                      }
                      
                      return (
                        <div className="pt-5" style={{ borderTop: '1px solid #e2e8f0', pageBreakInside: 'avoid' }}>
                          <h4 className="text-xs font-medium text-slate-700 uppercase tracking-wider mb-3" style={{ letterSpacing: '0.1em', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px', pageBreakAfter: 'avoid' }}>
                            Status do Parcelamento
                          </h4>
                          <div className="p-4" style={{ background: 'linear-gradient(to bottom, #f8fafc, #ffffff)', border: '1px solid #e2e8f0', borderRadius: '4px', pageBreakInside: 'avoid' }}>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
                              <div className="space-y-3">
                                <div className="flex"><span className="text-slate-500 w-32">Valor por Parcela:</span> <span className="text-slate-900 font-medium">{formatCurrency(auction.detalhesInadimplencia?.valorParcela)}</span></div>
                                <div className="flex"><span className="text-slate-500 w-32">Parcelas Pagas:</span> <span className="text-slate-900">{auction.arrematante?.parcelasPagas || 0} de {auction.arrematante?.quantidadeParcelas || 0}</span></div>
                                <div className="flex"><span className="text-slate-500 w-32">Próxima Parcela:</span> <span className="text-slate-900">{proximaParcelaData}</span></div>
                              </div>
                              <div className="space-y-3">
                                <div className="flex"><span className="text-slate-500 w-32">Dia Vencimento:</span> <span className="text-slate-900">Dia {auction.arrematante?.diaVencimentoMensal || 'N/A'}</span></div>
                                <div className="flex"><span className="text-slate-500 w-32">Mês Início:</span> <span className="text-slate-900">{auction.arrematante?.mesInicioPagamento || 'N/A'}</span></div>
                                <div className="flex"><span className="text-slate-500 w-32">Status:</span> <span className={`${statusProximaParcela === 'ATRASADO' ? 'text-red-700' : statusProximaParcela === 'Pendente' ? 'text-orange-600' : statusProximaParcela === 'Concluído' ? 'text-green-700' : 'text-slate-900'}`}>{statusProximaParcela}</span></div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    }
                    return null;
                  })()}

                </div>
              </div>
            ))}
            
            {inadimplentes.length > 3 && (
              <div className="text-center p-8" style={{ background: 'linear-gradient(to bottom, #f8fafc, #ffffff)', border: '1px solid #e2e8f0', borderRadius: '4px' }}>
                <div className="text-lg font-medium text-slate-900 tracking-tight">
                  Documento Completo - Análise Detalhada
                </div>
                <div className="text-sm text-slate-600 mt-3" style={{ fontWeight: 300, lineHeight: '1.6' }}>
                  Esta visualização apresenta os primeiros 3 casos com análise detalhada.
                  <br />
                  O relatório completo incluirá todos os {inadimplentes.length} casos identificados com o mesmo nível de detalhamento.
                  <br />
                  <span className="text-xs text-slate-500 mt-2 block">
                    Total em atraso: {formatCurrency(valorTotalInadimplencia)} • 
                    Média de atraso: {Math.round(diasAtrasoMedio)} dias • 
                    Casos críticos: {inadimplentes.filter(a => a.detalhesInadimplencia?.diasAtraso > 30).length}
                  </span>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center p-12" style={{ background: 'linear-gradient(to bottom, #f0fdf4, #ffffff)', border: '1px solid #bbf7d0', borderRadius: '4px' }}>
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

        {/* Rodapé Corporativo */}
        <div className="mt-12 pt-6" style={{ borderTop: '1px solid #e2e8f0', pageBreakInside: 'avoid' }}>
          <div className="text-center mb-6">
            <p className="text-xs text-slate-500 mb-4" style={{ fontWeight: 300, lineHeight: '1.6' }}>
              Este documento foi gerado automaticamente pelo sistema de gestão de leilões.<br />
              Informações atualizadas em {new Date().toLocaleDateString('pt-BR')} às {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.
            </p>
          </div>

        {/* Logos Elionx e Arthur Lira */}
          <div className="flex justify-center items-center mt-6 -ml-20">
          <img 
            src="/logo-elionx-softwares.png" 
            alt="Elionx Softwares" 
              className="object-contain opacity-80"
            style={{ maxHeight: '320px', maxWidth: '620px' }}
          />
          <img 
            src="/arthur-lira-logo.png" 
            alt="Arthur Lira Leilões" 
              className="object-contain opacity-80 -mt-2 -ml-16"
            style={{ maxHeight: '55px', maxWidth: '110px' }}
          />
          </div>
        </div>
      </div>
    );
  }

  if (type === 'historico') {
    const comHistorico = auctions.filter(a => a.arrematante && !a.arquivado);
    const totalTransacoes = comHistorico.reduce((sum, a) => sum + (a.historicoNotas?.length || 0), 0);
    const valorTotalNegociado = comHistorico.reduce((sum, a) => {
       // Incluir apenas valores já recebidos (contratos pagos)
       if (a.arrematante?.pago) {
         const valor = a.arrematante?.valorPagarNumerico || 
           parseFloat(a.arrematante?.valorPagar?.replace(/[^\d,]/g, '').replace(',', '.') || '0');
      return sum + valor;
       }
       return sum;
    }, 0);

    return (
      <div className="bg-white min-h-[600px]" style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', pageBreakInside: 'auto', orphans: 3, widows: 3 }}>
        {/* Cabeçalho Minimalista Corporativo */}
        <div className="text-center pb-6 mb-8" style={{ borderBottom: '1px solid #e2e8f0', pageBreakAfter: 'avoid' }}>
          <div className="mb-4">
            <h1 className="text-3xl font-light text-slate-900 tracking-tight mb-2" style={{ letterSpacing: '0.02em' }}>
              Relatório de Histórico
          </h1>
            <div className="h-px bg-slate-300 w-24 mx-auto"></div>
            </div>
          <div className="text-sm text-slate-600 space-y-1" style={{ fontWeight: 300 }}>
            <div className="flex items-center justify-center gap-6 text-xs uppercase tracking-wider">
              <span>Data: {new Date().toLocaleDateString('pt-BR')}</span>
              <span>•</span>
              <span>Horário: {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <div className="text-xs text-slate-500 mt-2">
              Histórico Detalhado de Arrematantes e Contratos Vinculados
            </div>
          </div>
        </div>

        {/* Histórico de Transações */}
        {comHistorico.length > 0 ? (
          <div className="space-y-6">
            <div className="pb-3 mb-4" style={{ borderBottom: '1px solid #cbd5e1', pageBreakAfter: 'avoid' }}>
              <h2 className="text-lg font-medium text-slate-900 tracking-tight">
                Registros de Transações
              </h2>
              <p className="text-sm text-slate-600 mt-1" style={{ fontWeight: 300 }}>
                Histórico cronológico de arrematações realizadas
              </p>
            </div>
            
              {comHistorico.slice(0, 3).map((auction, index) => (
                <div key={auction.id} className="mb-6" style={{ pageBreakBefore: index > 0 ? 'auto' : 'avoid', border: '1px solid #cbd5e1', borderRadius: '4px', overflow: 'hidden' }}>
                  <div className="px-6 py-4" style={{ background: 'linear-gradient(to right, #f1f5f9, #ffffff)', borderBottom: '1px solid #e2e8f0', pageBreakAfter: 'avoid' }}>
                  <div className="flex justify-between items-start">
                    <div>
                        <h3 className="text-lg font-medium text-slate-900 mb-2">
                        {auction.identificacao ? `Processo Nº ${auction.identificacao}` : (auction.nome || 'Processo sem identificação')}
                      </h3>
                    </div>
                    <div className="text-right">
                        <div className="text-xs text-slate-500 uppercase tracking-wider" style={{ fontWeight: 500 }}>Situação</div>
                        <div className={`inline-block px-3 py-1 rounded-full text-xs font-medium mt-1 ${
                        auction.arrematante?.pago 
                            ? 'bg-green-50 text-green-700 border border-green-200' 
                          : isOverdue(auction.arrematante, auction) 
                              ? 'bg-red-50 text-red-700 border border-red-200' 
                              : 'bg-slate-100 text-slate-700 border border-slate-300'
                      }`}>
                        {auction.arrematante?.pago 
                          ? 'Quitado' 
                          : isOverdue(auction.arrematante, auction) 
                              ? 'Atrasado' 
                            : 'Pendente'
                        }
                      </div>
                    </div>
                  </div>
                </div>
                
                  <div className="px-6 py-5 space-y-5">
                    {/* Identificação do Arrematante */}
                    <div style={{ pageBreakInside: 'avoid' }}>
                      <h4 className="text-xs font-medium text-slate-700 uppercase tracking-wider mb-3" style={{ letterSpacing: '0.1em', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px', pageBreakAfter: 'avoid' }}>
                        Identificação do Arrematante
                      </h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm" style={{ fontWeight: 300 }}>
                        <div className="space-y-2">
                          <div className="flex items-start">
                            <span className="text-slate-500 min-w-[130px]">Nome Completo:</span>
                            <span className="text-slate-900 font-medium">{auction.arrematante?.nome || 'Não informado'}</span>
                        </div>
                          <div className="flex items-start">
                            <span className="text-slate-500 min-w-[130px]">Documento:</span>
                            <span className="text-slate-900">{auction.arrematante?.documento || 'Não informado'}</span>
                        </div>
                          <div className="flex items-start">
                            <span className="text-slate-500 min-w-[130px]">Email:</span>
                            <span className="text-slate-900">{auction.arrematante?.email || 'Não informado'}</span>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-start">
                            <span className="text-slate-500 min-w-[130px]">Telefone:</span>
                            <span className="text-slate-900">{auction.arrematante?.telefone || 'Não informado'}</span>
                          </div>
                          <div className="flex items-start">
                            <span className="text-slate-500 min-w-[130px]">Total de Contratos:</span>
                            <span className="text-slate-900">1</span>
                          </div>
                          <div className="flex items-start">
                            <span className="text-slate-500 min-w-[130px]">Valor Total:</span>
                            <span className="text-slate-900 font-medium">
                            {(() => {
                              const valorComJuros = calcularValorTotalComJuros(auction.arrematante, auction);
                              const valorBase = auction.arrematante?.valorPagarNumerico || parseFloat(auction.arrematante?.valorPagar?.replace(/[^\d,]/g, '').replace(',', '.') || '0');
                              const valorJuros = valorComJuros - valorBase;
                              
                              return (
                                <>
                                  {formatCurrency(valorComJuros)}
                                  {valorJuros > 0 && (
                                    <span className="text-xs text-red-600 ml-1" style={{ color: '#dc2626', fontSize: '0.75rem', marginLeft: '0.25rem' }}>
                                      ({formatCurrency(valorJuros)} juros)
                                    </span>
                                  )}
                                </>
                              );
                            })()}
                          </span></div>
                        </div>
                      </div>
                    </div>

                    {/* Contrato Vinculado */}
                    <div className="border-t border-slate-200 pt-6" style={{ pageBreakInside: 'avoid' }}>
                      <h4 className="text-sm font-light text-slate-700 uppercase tracking-wider mb-4 border-b border-slate-200 pb-2">
                        Contrato Vinculado
                      </h4>
                      <div className="bg-slate-50 border border-slate-200 p-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm font-light">
                          <div className="space-y-3">
                            <div><span className="text-slate-500">Leilão:</span><br /><span className="text-slate-900 font-medium">{auction.nome || 'Nome não informado'}</span></div>
                            <div><span className="text-slate-500">Código:</span><br /><span className="text-slate-900">{auction.identificacao || 'Não informado'}</span></div>
                            <div><span className="text-slate-500">Data do Leilão:</span><br /><span className="text-slate-900">{formatDate(auction.dataInicio)}</span></div>
                          </div>
                          <div className="space-y-3">
                            <div><span className="text-slate-500">Valor Total:</span><br /><span className="text-slate-900 font-medium">
                              {(() => {
                                const valorComJuros = calcularValorTotalComJuros(auction.arrematante, auction);
                                const valorBase = auction.arrematante?.valorPagarNumerico || parseFloat(auction.arrematante?.valorPagar?.replace(/[^\d,]/g, '').replace(',', '.') || '0');
                                const valorJuros = valorComJuros - valorBase;
                                
                                return (
                                  <>
                                    {formatCurrency(valorComJuros)}
                                    {valorJuros > 0 && (
                                      <span className="text-xs text-red-600 ml-1">
                                        ({formatCurrency(valorJuros)} juros)
                                      </span>
                                    )}
                                  </>
                                );
                              })()}
                            </span></div>
                            <div><span className="text-slate-500">Status:</span><br /><span className={`font-medium ${auction.arrematante?.pago ? 'text-green-700' : isOverdue(auction.arrematante, auction) ? 'text-red-700' : 'text-yellow-600'}`}>{auction.arrematante?.pago ? 'Quitado' : isOverdue(auction.arrematante, auction) ? 'Inadimplente' : 'Pendente'}</span></div>
                            <div><span className="text-slate-500">Modalidade:</span><br /><span className="text-slate-900">{(() => {
                              const loteArrematado = auction.arrematante?.loteId 
                                ? auction.lotes?.find(lote => lote.id === auction.arrematante.loteId)
                                : null;
                              const tipoPagamento = loteArrematado?.tipoPagamento || auction.tipoPagamento;
                              
                              switch (tipoPagamento) {
                                case 'a_vista':
                                  return 'Pagamento à Vista';
                                case 'entrada_parcelamento':
                                  return 'Entrada + Parcelamento';
                                case 'parcelamento':
                                  return 'Parcelamento';
                                default:
                                  return 'Não definido';
                              }
                            })()}</span></div>
                          </div>
                        </div>
                        {(() => {
                          const loteComprado = auction.arrematante?.loteId 
                            ? auction.lotes?.find(lote => lote.id === auction.arrematante.loteId)
                            : null;
                          const mercadoriaComprada = loteComprado && auction.arrematante?.mercadoriaId
                            ? loteComprado.mercadorias?.find(m => m.id === auction.arrematante.mercadoriaId)
                            : null;
                          
                          return loteComprado ? (
                            <div className="mt-4 pt-4 border-t border-slate-300">
                              <div className="text-sm font-light space-y-2">
                                {mercadoriaComprada && (
                                  <div>
                                    <span className="text-slate-500">Mercadoria Arrematada:</span><br />
                                    <span className="text-slate-900">{mercadoriaComprada.titulo || mercadoriaComprada.tipo || 'Mercadoria'}</span>
                                  </div>
                                )}
                                <div>
                                  <span className="text-slate-500">Lote:</span><br />
                                <span className="text-slate-900">Lote {loteComprado.numero} - {loteComprado.descricao || 'Sem descrição'}</span>
                                </div>
                              </div>
                            </div>
                          ) : null;
                        })()}
                      </div>
                    </div>

                    {/* Perfil de Risco */}
                    <div className="border-t border-slate-200 pt-6" style={{ pageBreakInside: 'avoid' }}>
                      <h4 className="text-sm font-light text-slate-700 uppercase tracking-wider mb-4 border-b border-slate-200 pb-2">
                        Perfil de Risco
                      </h4>
                      <div className="bg-slate-50 border border-slate-200 p-4">
                        {(() => {
                          // Lógica de cálculo de risco similar à inadimplência, incluindo valor em atraso
                          const arrematante = auction.arrematante;
                          const parcelasPagas = arrematante?.parcelasPagas || 0;
                          const quantidadeParcelas = arrematante?.quantidadeParcelas || 1;
                          
                          // Verificar se está em atraso (usando função isOverdue completa)
                          const isCurrentlyOverdue = isOverdue(arrematante, auction);
                          const isNewContract = parcelasPagas === 0; // Contrato novo/inicial
                          
                          // Calcular valor em atraso baseado no tipo de pagamento e parcelas específicas atrasadas
                          const valorTotal = arrematante?.valorPagarNumerico || 
                            (typeof arrematante?.valorPagar === 'number' ? arrematante.valorPagar : 
                             (typeof arrematante?.valorPagar === 'string' ? parseFloat(arrematante.valorPagar.replace(/[^\d,]/g, '').replace(',', '.')) || 0 : 0));
                          
                          const percentualJuros = arrematante?.percentualJurosAtraso || 0;
                          
                          let valorEmAtraso = 0;
                          let parcelasAtrasadasCount = 0;
                          let diasAtrasoMaximo = 0;
                          
                          if (isCurrentlyOverdue) {
                            const loteArrematado = arrematante?.loteId 
                              ? auction.lotes?.find(lote => lote.id === arrematante.loteId)
                              : null;
                            const tipoPagamento = loteArrematado?.tipoPagamento || auction.tipoPagamento;
                            const hoje = new Date();
                            
                            if (tipoPagamento === 'a_vista') {
                              // Aplicar juros progressivos ao valor à vista em atraso
                              const dataVencimento = loteArrematado?.dataVencimentoVista || auction.dataVencimentoVista;
                              if (dataVencimento) {
                                valorEmAtraso = calcularJurosProgressivos(valorTotal, dataVencimento, percentualJuros);
                                const vencimento = new Date(dataVencimento);
                                diasAtrasoMaximo = Math.floor((hoje.getTime() - vencimento.getTime()) / (1000 * 60 * 60 * 24));
                              } else {
                                valorEmAtraso = valorTotal;
                              }
                              parcelasAtrasadasCount = 1;
                            } else if (tipoPagamento === 'entrada_parcelamento') {
                              // Para entrada + parcelamento (entrada e parcelas são INDEPENDENTES)
                              const valorEntrada = arrematante?.valorEntrada ? 
                                (typeof arrematante.valorEntrada === 'string' ? 
                                  parseFloat(arrematante.valorEntrada.replace(/[^\d,]/g, '').replace(',', '.')) : 
                                  arrematante.valorEntrada) : 
                                valorTotal * 0.3;
                              // ✅ Valor da parcela = valorTotal / quantidade (SEM subtrair entrada)
                              const valorPorParcela = valorTotal / quantidadeParcelas;
                              
                              // Verificar se entrada está atrasada
                              if (parcelasPagas === 0) {
                                const dataEntrada = loteArrematado?.dataEntrada || auction.dataEntrada;
                                if (dataEntrada) {
                                  const vencimentoEntrada = new Date(dataEntrada);
                                  if (hoje > vencimentoEntrada) {
                                    // Aplicar juros progressivos à entrada
                                    valorEmAtraso += calcularJurosProgressivos(valorEntrada, dataEntrada, percentualJuros);
                                    parcelasAtrasadasCount++;
                                    diasAtrasoMaximo = Math.max(diasAtrasoMaximo, 
                                      Math.floor((hoje.getTime() - vencimentoEntrada.getTime()) / (1000 * 60 * 60 * 24)));
                                  }
                                }
                            } else {
                                // Entrada paga, verificar parcelas atrasadas
                                const mesInicio = arrematante?.mesInicioPagamento;
                                const diaVencimento = arrematante?.diaVencimentoMensal;
                                
                                if (mesInicio && diaVencimento) {
                                  const [startYear, startMonth] = mesInicio.split('-').map(Number);
                                  const parcelasEfetivasPagas = parcelasPagas - 1; // -1 porque entrada conta
                                  
                                  for (let i = 0; i < quantidadeParcelas; i++) {
                                    const parcelaDate = new Date(startYear, startMonth - 1 + i, diaVencimento);
                                    parcelaDate.setHours(23, 59, 59, 999);
                                    
                                    if (hoje > parcelaDate && i >= parcelasEfetivasPagas) {
                                      // Aplicar juros progressivos à parcela atrasada
                                      const dataVencimentoStr = parcelaDate.toISOString().split('T')[0];
                                      valorEmAtraso += calcularJurosProgressivos(valorPorParcela, dataVencimentoStr, percentualJuros);
                                      parcelasAtrasadasCount++;
                                      const diasAtraso = Math.floor((hoje.getTime() - parcelaDate.getTime()) / (1000 * 60 * 60 * 24));
                                      diasAtrasoMaximo = Math.max(diasAtrasoMaximo, diasAtraso);
                                    }
                                  }
                                }
                              }
                            } else {
                              // Para parcelamento simples
                              const valorPorParcela = valorTotal / quantidadeParcelas;
                              const mesInicio = arrematante?.mesInicioPagamento;
                              const diaVencimento = arrematante?.diaVencimentoMensal;
                              
                              if (mesInicio && diaVencimento) {
                                const [startYear, startMonth] = mesInicio.split('-').map(Number);
                                
                                for (let i = parcelasPagas; i < quantidadeParcelas; i++) {
                                  const parcelaDate = new Date(startYear, startMonth - 1 + i, diaVencimento);
                                  parcelaDate.setHours(23, 59, 59, 999);
                                  
                                  if (hoje > parcelaDate) {
                                    // Aplicar juros progressivos à parcela atrasada
                                    const dataVencimentoStr = parcelaDate.toISOString().split('T')[0];
                                    valorEmAtraso += calcularJurosProgressivos(valorPorParcela, dataVencimentoStr, percentualJuros);
                                    parcelasAtrasadasCount++;
                                    const diasAtraso = Math.floor((hoje.getTime() - parcelaDate.getTime()) / (1000 * 60 * 60 * 24));
                                    diasAtrasoMaximo = Math.max(diasAtrasoMaximo, diasAtraso);
                                  } else {
                                    break; // Para quando encontra uma não atrasada
                                  }
                                }
                              }
                            }
                          }
                          
                          // Calcular valor total com juros para exibir no relatório
                          let valorTotalComJuros = 0;
                          const loteArrematado = arrematante?.loteId 
                            ? auction.lotes?.find(lote => lote.id === arrematante.loteId)
                            : null;
                          const tipoPagamento = loteArrematado?.tipoPagamento || auction.tipoPagamento;
                          const mesInicioPagamento = arrematante?.mesInicioPagamento;
                          
                          if (tipoPagamento === 'entrada_parcelamento' && mesInicioPagamento) {
                            const valorEntrada = arrematante?.valorEntrada ? 
                              (typeof arrematante.valorEntrada === 'string' ? 
                                parseFloat(arrematante.valorEntrada.replace(/[^\d,]/g, '').replace(',', '.')) : 
                                arrematante.valorEntrada) : 
                              valorTotal * 0.3;
                            // ✅ Valor da parcela = valorTotal / quantidade (SEM subtrair entrada - são independentes)
                            const valorPorParcelaBase = valorTotal / quantidadeParcelas;
                            
                            // Calcular juros da entrada
                            const dataEntrada = loteArrematado?.dataEntrada || auction.dataEntrada;
                            if (dataEntrada) {
                              valorTotalComJuros += calcularJurosProgressivos(valorEntrada, dataEntrada, percentualJuros);
                            } else {
                              valorTotalComJuros += valorEntrada;
                            }
                            
                            // Calcular juros de cada parcela
                            const [startYear, startMonth] = mesInicioPagamento.split('-').map(Number);
                            for (let i = 0; i < quantidadeParcelas; i++) {
                              const dataVencimento = new Date(startYear, startMonth - 1 + i, arrematante?.diaVencimentoMensal || 15);
                              const dataVencimentoStr = dataVencimento.toISOString().split('T')[0];
                              valorTotalComJuros += calcularJurosProgressivos(valorPorParcelaBase, dataVencimentoStr, percentualJuros);
                            }
                          } else if (tipoPagamento === 'parcelamento' && mesInicioPagamento) {
                            const valorPorParcela = valorTotal / quantidadeParcelas;
                            const [startYear, startMonth] = mesInicioPagamento.split('-').map(Number);
                            
                            for (let i = 0; i < quantidadeParcelas; i++) {
                              const dataVencimento = new Date(startYear, startMonth - 1 + i, arrematante?.diaVencimentoMensal || 15);
                              const dataVencimentoStr = dataVencimento.toISOString().split('T')[0];
                              valorTotalComJuros += calcularJurosProgressivos(valorPorParcela, dataVencimentoStr, percentualJuros);
                            }
                          } else {
                            valorTotalComJuros = valorTotal;
                          }
                          
                          // Usar dados reais de parcelas atrasadas para classificação de risco
                          const totalLateEpisodes = parcelasAtrasadasCount; // Número atual de parcelas atrasadas
                          const avgDelayDays = diasAtrasoMaximo; // Maior número de dias de atraso entre as parcelas
                          
                          // Definir faixas de valor para classificação
                          const isHighValueOverdue = valorEmAtraso > 500000; // Acima de R$ 500.000
                          const isMediumValueOverdue = valorEmAtraso > 200000 && valorEmAtraso <= 500000; // R$ 200.000 - R$ 500.000
                          const isLowValueOverdue = valorEmAtraso <= 200000; // Até R$ 200.000
                          
                          let riskLevel = 'BAIXO';
                          let riskClass = 'bg-slate-50 border-slate-300 text-slate-700';
                          let riskText = 'baixo';
                          
                          if (isCurrentlyOverdue) {
                            // Risco ALTO: Múltiplos critérios severos baseados em parcelas atrasadas
                            if (isHighValueOverdue || // Valor alto em atraso
                                parcelasAtrasadasCount >= 3 || // 3 ou mais parcelas atrasadas
                                (parcelasAtrasadasCount >= 2 && avgDelayDays > 30) || // 2+ parcelas com atraso longo
                                (isMediumValueOverdue && parcelasAtrasadasCount >= 2) || // Valor médio + múltiplas parcelas
                                avgDelayDays > 60) { // Atraso muito longo (mais de 2 meses)
                              riskLevel = 'ALTO';
                              riskClass = 'bg-slate-200 border-slate-500 text-slate-900';
                              riskText = 'alto';
                            }
                            // Risco MÉDIO: Critérios moderados baseados em parcelas atrasadas
                            else if (isMediumValueOverdue || // Valor médio em atraso
                                     parcelasAtrasadasCount >= 2 || // 2 ou mais parcelas atrasadas
                                     (parcelasAtrasadasCount >= 1 && avgDelayDays > 30) || // 1 parcela com atraso longo
                                     (isLowValueOverdue && avgDelayDays > 15)) { // Valor baixo mas atraso significativo
                              riskLevel = 'MÉDIO';
                              riskClass = 'bg-slate-100 border-slate-400 text-slate-800';
                              riskText = 'médio';
                            }
                            // Risco BAIXO: Primeira parcela atrasada, valores baixos, atrasos curtos
                            else {
                              riskLevel = 'BAIXO';
                              riskClass = 'bg-slate-50 border-slate-300 text-slate-700';
                              riskText = 'baixo';
                            }
                          } else {
                            // Se está quitado, risco baixo
                            riskLevel = 'BAIXO';
                            riskClass = 'bg-slate-50 border-slate-300 text-slate-700';
                            riskText = 'baixo';
                          }
                          
                          return (
                            <>
                              <div className={`text-center py-2 px-4 rounded mb-4 text-sm font-medium border font-mono tracking-wider ${riskClass}`}>
                                RISCO {riskLevel}
                              </div>
                              <div className="text-sm font-light text-slate-700 leading-relaxed">
                                <p className="mb-4">
                                  <strong>Dados Consolidados:</strong> O arrematante {arrematante?.nome || 'identificado'} possui risco classificado como {riskText} baseado nos dados históricos de pagamentos. Este relatório consolida 1 contrato com valor total de {(() => {
                                    const valorFinal = valorTotalComJuros > 0 ? valorTotalComJuros : valorTotal;
                                    const valorJuros = valorFinal - valorTotal;
                                    if (valorJuros > 0) {
                                      return `${formatCurrency(valorFinal)} (${formatCurrency(valorJuros)} juros)`;
                                    }
                                    return formatCurrency(valorFinal);
                                  })()}.{' '}
                                  {(() => {
                                    // Verificar tipo de pagamento
                                    const loteArrematado = arrematante?.loteId 
                                      ? auction.lotes?.find(lote => lote.id === arrematante.loteId)
                                      : null;
                                    const tipoPagamento = loteArrematado?.tipoPagamento || auction.tipoPagamento;
                                    
                                    if (tipoPagamento === 'a_vista') {
                                      return parcelasPagas > 0 ? 
                                        'Pagamento à vista foi processado' : 
                                        'Pagamento à vista ainda não processado, em período de vencimento';
                                    } else {
                                      if (tipoPagamento === 'entrada_parcelamento') {
                                        if (parcelasPagas > 0) {
                                          return `Foram registrados ${parcelasPagas} pagamentos (entrada + ${parcelasPagas - 1} parcela${parcelasPagas > 2 ? 's' : ''}) de um total de ${quantidadeParcelas + 1} pagamentos programados (entrada + ${quantidadeParcelas} parcelas)`;
                                        } else {
                                          return `Foram processados entrada e ${quantidadeParcelas} parcelas para pagamento, porém nenhum pagamento foi registrado até o momento`;
                                        }
                                    } else {
                                      return parcelasPagas > 0 ? 
                                        `Foram registrados ${parcelasPagas} pagamentos de um total de ${quantidadeParcelas} parcelas programadas` : 
                                          `Foram processadas ${quantidadeParcelas} parcelas para pagamento, porém nenhum pagamento foi registrado até o momento`;
                                      }
                                    }
                                  })()}.
                                </p>
                                
                                {/* Informações sobre parcelas atrasadas para cálculo de risco */}
                                {isCurrentlyOverdue && (
                                  <p className="mb-4">
                                    <strong>Análise de Risco:</strong> O cálculo de risco considera {parcelasAtrasadasCount} parcela{parcelasAtrasadasCount > 1 ? 's' : ''} atualmente em atraso, com valor total de {formatCurrency(valorEmAtraso)} em débito.{' '}
                                    {diasAtrasoMaximo > 0 && (
                                      <>O maior período de atraso registrado é de {diasAtrasoMaximo} dias. </>
                                    )}
                                    {parcelasAtrasadasCount >= 3 ? 
                                      'O elevado número de parcelas em atraso resulta em classificação de risco alto.' :
                                      parcelasAtrasadasCount >= 2 ?
                                        'Múltiplas parcelas em atraso indicam risco médio a alto.' :
                                        diasAtrasoMaximo > 30 ?
                                          'Atraso prolongado indica necessidade de atenção.' :
                                          'Situação de atraso recente com risco controlado.'
                                    }
                                  </p>
                                )}
                                <p>
                                  <strong>Situação Atual:</strong> {(() => {
                                    // Verificar tipo de pagamento para texto adaptativo
                                    const loteArrematado = arrematante?.loteId 
                                      ? auction.lotes?.find(lote => lote.id === arrematante.loteId)
                                      : null;
                                    const tipoPagamento = loteArrematado?.tipoPagamento || auction.tipoPagamento;
                                    
                                    // Função para calcular data de vencimento baseada no tipo de pagamento
                                    const getVencimentoDate = () => {
                                      try {
                                        switch (tipoPagamento) {
                                          case 'a_vista': {
                                            const dataVencimento = loteArrematado?.dataVencimentoVista || auction.dataVencimentoVista;
                                            if (dataVencimento) {
                                              const [year, month, day] = dataVencimento.split('-').map(Number);
                                              return new Date(year, month - 1, day).toLocaleDateString('pt-BR');
                                            }
                                            return null;
                                          }
                                          case 'entrada_parcelamento': {
                                            if (parcelasPagas === 0) {
                                              // Primeira parcela (entrada)
                                              const dataEntrada = loteArrematado?.dataEntrada || auction.dataEntrada;
                                              if (dataEntrada) {
                                                const [year, month, day] = dataEntrada.split('-').map(Number);
                                                return new Date(year, month - 1, day).toLocaleDateString('pt-BR');
                                              }
                                            } else {
                                              // Parcelas regulares após entrada
                                              const mesInicio = arrematante?.mesInicioPagamento || auction.mesInicioPagamento;
                                              const diaVencimento = arrematante?.diaVencimentoMensal || auction.diaVencimentoPadrao;
                                              if (mesInicio && diaVencimento) {
                                                const [startYear, startMonth] = mesInicio.split('-').map(Number);
                                                const vencimentoDate = new Date(startYear, startMonth - 1 + (parcelasPagas - 1), diaVencimento);
                                                return vencimentoDate.toLocaleDateString('pt-BR');
                                              }
                                            }
                                            return null;
                                          }
                                          case 'parcelamento':
                                          default: {
                                            const mesInicio = arrematante?.mesInicioPagamento || auction.mesInicioPagamento;
                                            const diaVencimento = arrematante?.diaVencimentoMensal || auction.diaVencimentoPadrao;
                                            if (mesInicio && diaVencimento) {
                                              const [startYear, startMonth] = mesInicio.split('-').map(Number);
                                              const vencimentoDate = new Date(startYear, startMonth - 1 + parcelasPagas, diaVencimento);
                                              return vencimentoDate.toLocaleDateString('pt-BR');
                                            }
                                            return null;
                                          }
                                        }
                                      } catch (error) {
                                        console.error('Erro ao calcular data de vencimento:', error);
                                        return null;
                                      }
                                    };
                                    
                                    const dataVencimento = getVencimentoDate();
                                    const vencimentoText = dataVencimento ? ` com vencimento em ${dataVencimento}` : '';
                                    
                                    if (arrematante?.pago) {
                                      return tipoPagamento === 'a_vista' ? 
                                        `Pagamento à vista foi quitado dentro do prazo estabelecido${dataVencimento ? ` (vencimento: ${dataVencimento})` : ''}.` :
                                        'Todos os pagamentos parcelados foram processados com sucesso.';
                                    } else if (isNewContract) {
                                      if (tipoPagamento === 'a_vista') {
                                        const status = !arrematante?.pago && isCurrentlyOverdue ? 'em atraso' : 'pendente';
                                        // Usar o valor em atraso que já inclui juros se aplicável
                                        const valorExibir = valorEmAtraso > 0 ? valorEmAtraso : (arrematante?.valorPagarNumerico || parseFloat(arrematante?.valorPagar?.replace(/[^\d,]/g, '').replace(',', '.') || '0'));
                                        const valorBase = arrematante?.valorPagarNumerico || parseFloat(arrematante?.valorPagar?.replace(/[^\d,]/g, '').replace(',', '.') || '0');
                                        const valorJuros = valorExibir - valorBase;
                                        const valorTexto = valorJuros > 0 
                                          ? `${formatCurrency(valorExibir)} (${formatCurrency(valorJuros)} juros)` 
                                          : formatCurrency(valorExibir);
                                        return `O pagamento à vista de ${valorTexto} encontra-se ${status}${vencimentoText}.`;
                                      } else {
                                        const status = !arrematante?.pago && isCurrentlyOverdue ? 'em atraso' : 'pendente de quitação';
                                        // Calcular valor correto considerando múltiplas parcelas em atraso
                                        const valorTotal = arrematante?.valorPagarNumerico || 
                                          (typeof arrematante?.valorPagar === 'number' ? arrematante.valorPagar : 
                                           (typeof arrematante?.valorPagar === 'string' ? parseFloat(arrematante.valorPagar.replace(/[^\d,]/g, '').replace(',', '.')) || 0 : 0));
                                        
                                        const loteArrematado = arrematante?.loteId 
                                          ? auction.lotes?.find(lote => lote.id === arrematante.loteId)
                                          : null;
                                        const tipoPagamento = loteArrematado?.tipoPagamento || auction.tipoPagamento;
                                        
                                        if (tipoPagamento === 'entrada_parcelamento') {
                                          const valorEntrada = arrematante?.valorEntrada ? 
                                            (typeof arrematante.valorEntrada === 'string' ? 
                                              parseFloat(arrematante.valorEntrada.replace(/[^\d,]/g, '').replace(',', '.')) : 
                                              arrematante.valorEntrada) : 
                                            valorTotal * 0.3;
                                          // ✅ Valor da parcela = valorTotal / quantidade (SEM subtrair entrada - são independentes)
                                          const valorPorParcela = valorTotal / quantidadeParcelas;
                                          
                                          // Calcular quantas parcelas estão em atraso
                                          let parcelasEmAtraso = 0;
                                          let entradaEmAtraso = false;
                                          
                                          try {
                                            const hoje = new Date();
                                            
                                            // Verificar entrada
                                            const dataEntrada = loteArrematado?.dataEntrada || auction.dataEntrada;
                                            if (dataEntrada && parcelasPagas === 0) {
                                              const vencimentoEntrada = new Date(dataEntrada);
                                              vencimentoEntrada.setHours(23, 59, 59, 999);
                                              entradaEmAtraso = hoje > vencimentoEntrada;
                                            }
                                            
                                            // Verificar parcelas
                                            if (arrematante?.mesInicioPagamento && arrematante?.diaVencimentoMensal) {
                                              const [year, month] = arrematante.mesInicioPagamento.split('-').map(Number);
                                              const parcelaInicioIndex = parcelasPagas > 0 ? parcelasPagas - 1 : 0;
                                              
                                              for (let i = parcelaInicioIndex; i < quantidadeParcelas; i++) {
                                                const parcelaDate = new Date(year, month - 1 + i, arrematante.diaVencimentoMensal);
                                                parcelaDate.setHours(23, 59, 59, 999);
                                                
                                                if (hoje > parcelaDate) {
                                                  parcelasEmAtraso++;
                                                } else {
                                                  break;
                                                }
                                              }
                                            }
                                          } catch (error) {
                                            console.error('Erro ao calcular parcelas em atraso:', error);
                                          }
                                          
                                          if (entradaEmAtraso && parcelasEmAtraso > 0) {
                                            const valorTotalEmAtraso = valorEntrada + (parcelasEmAtraso * valorPorParcela);
                                            return `O contrato de entrada + parcelamento encontra-se em período crítico. Registra-se a entrada (${formatCurrency(valorEntrada)}) e ${parcelasEmAtraso} parcela${parcelasEmAtraso > 1 ? 's' : ''} (${formatCurrency(parcelasEmAtraso * valorPorParcela)}) em atraso, totalizando ${formatCurrency(valorTotalEmAtraso)} ${status}.`;
                                          } else if (entradaEmAtraso) {
                                            return `O contrato de entrada + parcelamento encontra-se em período inicial. Registra-se a entrada com valor de ${formatCurrency(valorEntrada)} ${status}.`;
                                          } else if (parcelasEmAtraso > 0) {
                                            return `O contrato de entrada + parcelamento encontra-se em período crítico. Registra-se ${parcelasEmAtraso} parcela${parcelasEmAtraso > 1 ? 's' : ''} com valor total de ${formatCurrency(parcelasEmAtraso * valorPorParcela)} ${status}.`;
                                          } else {
                                            return `O contrato de entrada + parcelamento encontra-se em período inicial. Próximo vencimento${vencimentoText} com valor de ${formatCurrency(parcelasPagas === 0 ? valorEntrada : valorPorParcela)} ${status}.`;
                                          }
                                        } else {
                                          // Parcelamento simples
                                          const valorPorParcela = valorTotal / quantidadeParcelas;
                                          
                                          // Calcular quantas parcelas estão em atraso
                                          let parcelasEmAtraso = 0;
                                          
                                          try {
                                            const hoje = new Date();
                                            if (arrematante?.mesInicioPagamento && arrematante?.diaVencimentoMensal) {
                                              const [year, month] = arrematante.mesInicioPagamento.split('-').map(Number);
                                              
                                              for (let i = parcelasPagas; i < quantidadeParcelas; i++) {
                                                const parcelaDate = new Date(year, month - 1 + i, arrematante.diaVencimentoMensal);
                                                parcelaDate.setHours(23, 59, 59, 999);
                                                
                                                if (hoje > parcelaDate) {
                                                  parcelasEmAtraso++;
                                                } else {
                                                  break;
                                                }
                                              }
                                            }
                                          } catch (error) {
                                            console.error('Erro ao calcular parcelas em atraso:', error);
                                          }
                                          
                                          if (parcelasEmAtraso > 1) {
                                            return `O contrato de parcelamento encontra-se em período crítico. Registram-se ${parcelasEmAtraso} parcelas com valor total de ${formatCurrency(parcelasEmAtraso * valorPorParcela)} ${status}.`;
                                          } else if (parcelasEmAtraso === 1) {
                                            return `O contrato de parcelamento encontra-se em período inicial. Registra-se a Parcela #${parcelasPagas + 1}${vencimentoText} com valor de ${formatCurrency(valorPorParcela)} ${status}.`;
                                          } else {
                                            return `O contrato de parcelamento encontra-se em período inicial. Próxima Parcela #${parcelasPagas + 1}${vencimentoText} com valor de ${formatCurrency(valorPorParcela)} ${status}.`;
                                          }
                                        }
                                      }
                                    } else {
                                      const statusTexto = isCurrentlyOverdue ? 
                                        { vista: 'atraso que deve ser regularizado', parcelamento: 'atrasos que requerem acompanhamento' } :
                                        { vista: 'pendência que deve ser regularizada', parcelamento: 'pendências que requerem acompanhamento' };
                                      return tipoPagamento === 'a_vista' ?
                                        `Pagamento à vista apresenta ${statusTexto.vista}${vencimentoText}.` :
                                        `Contrato de parcelamento apresenta ${statusTexto.parcelamento}${vencimentoText}.`;
                                    }
                                  })()}
                                </p>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  

                  {/* Informações do Relatório */}
                  <div className="border-t border-slate-200 pt-6">
                    <h4 className="text-sm font-light text-slate-700 uppercase tracking-wider mb-4 border-b border-slate-200 pb-2">
                      Informações do Relatório
                    </h4>
                    <div className="bg-slate-50 border border-slate-200 p-4 text-sm font-light text-slate-700 leading-relaxed">
                      <p className="mb-3">
                        <strong>Escopo do Relatório:</strong> Este documento consolida dados de 1 contrato no valor total de {(() => {
                          const valorComJuros = calcularValorTotalComJuros(auction.arrematante, auction);
                          const valorBase = auction.arrematante?.valorPagarNumerico || parseFloat(auction.arrematante?.valorPagar?.replace(/[^\d,]/g, '').replace(',', '.') || '0');
                          const valorJuros = valorComJuros - valorBase;
                          
                          if (valorJuros > 0) {
                            return `${formatCurrency(valorComJuros)} (${formatCurrency(valorJuros)} juros)`;
                          }
                          return formatCurrency(valorComJuros);
                        })()} vinculado ao arrematante {auction.arrematante?.nome || 'identificado'}. O período do relatório compreende informações do leilão realizado em {formatDate(auction.dataInicio)}.
                      </p>
                      <p className="mb-3">
                        <strong>Critérios de Classificação:</strong> O perfil de risco foi determinado com base nos seguintes parâmetros: status de pagamento atual, histórico de transações e informações consolidadas do contrato vinculado.
                      </p>
                      <p className="text-xs text-slate-500">
                        <strong>Data de Geração:</strong> {new Date().toLocaleDateString('pt-BR', { 
                          weekday: 'long', 
                          year: 'numeric', 
                          month: 'long', 
                          day: 'numeric' 
                        })} às {new Date().toLocaleTimeString('pt-BR', { 
                          hour: '2-digit', 
                          minute: '2-digit' 
                        })}
                        <br />
                        Documento gerado automaticamente a partir da base de dados do sistema de gestão de leilões. As informações apresentadas refletem os registros disponíveis na data de geração do relatório.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            
            {comHistorico.length > 3 && (
              <div className="text-center bg-slate-50 border-2 border-slate-300 p-8 font-sans">
                <div className="text-lg font-light text-slate-900 tracking-wide">
                  Documento Completo
                </div>
                <div className="text-sm text-slate-600 font-light mt-3 leading-relaxed">
                  Esta visualização apresenta os primeiros 3 registros.
                  <br />
                  O documento final compreenderá o histórico de todas as {comHistorico.length} transações.
                </div>
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
        <div className="mt-8 flex justify-center items-center -ml-20">
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
    
    const faturasPagas = todasFaturas.filter(f => f.arrematante?.pago);
    const faturasReceber = todasFaturas.filter(f => !f.arrematante?.pago);
    
    // Calcular valor total a receber COM juros progressivos
    const valorTotalReceber = faturasReceber.reduce((sum, f) => {
      return sum + calcularValorTotalComJuros(f.arrematante, f.auction);
    }, 0);
    
    const valorTotalRecebido = faturasPagas.reduce((sum, f) => {
      const valor = parseFloat(f.arrematante?.valorPagar?.replace(/[^\d,]/g, '').replace(',', '.') || '0');
      return sum + valor;
    }, 0);

    return (
      <div className="bg-white min-h-[600px]" style={{ fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif', pageBreakInside: 'auto', orphans: 3, widows: 3 }}>
        {/* Cabeçalho Minimalista Corporativo */}
        <div className="text-center pb-6 mb-8" style={{ borderBottom: '1px solid #e2e8f0', pageBreakAfter: 'avoid' }}>
          <div className="mb-4">
            <h1 className="text-3xl font-light text-slate-900 tracking-tight mb-2" style={{ letterSpacing: '0.02em' }}>
            Relatório Financeiro
          </h1>
            <div className="h-px bg-slate-300 w-24 mx-auto"></div>
            </div>
          <div className="text-sm text-slate-600 space-y-1" style={{ fontWeight: 300 }}>
            <div className="flex items-center justify-center gap-6 text-xs uppercase tracking-wider">
              <span>Data: {new Date().toLocaleDateString('pt-BR')}</span>
              <span>•</span>
              <span>Horário: {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            <div className="text-xs text-slate-500 mt-2">
              Controle e Posicionamento de Contas a Receber
            </div>
          </div>
        </div>

        {/* Controle de Faturas */}
        {todasFaturas.length > 0 ? (
          <div className="space-y-6">
            <div className="pb-3 mb-4" style={{ borderBottom: '1px solid #cbd5e1', pageBreakAfter: 'avoid' }}>
              <h2 className="text-lg font-medium text-slate-900 tracking-tight">
                Controle de Recebíveis
              </h2>
              <p className="text-sm text-slate-600 mt-1" style={{ fontWeight: 300 }}>
                Posicionamento detalhado das obrigações financeiras
              </p>
            </div>
            
            {todasFaturas.slice(0, 10).map(({ auction, arrematante }, index) => (
              <div key={`${auction.id}-${arrematante.id || index}`} className="mb-6" style={{ pageBreakBefore: index > 0 ? 'auto' : 'avoid', border: '1px solid #cbd5e1', borderRadius: '4px', overflow: 'hidden' }}>
                <div className="px-6 py-4" style={{ background: 'linear-gradient(to right, #f1f5f9, #ffffff)', borderBottom: '1px solid #e2e8f0', pageBreakAfter: 'avoid' }}>
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Fatura #{String(index + 1).padStart(3, '0')}</span>
                      </div>
                      <h3 className="text-lg font-medium text-slate-900">
                        {auction.identificacao ? `Processo Nº ${auction.identificacao}` : (auction.nome || 'Sem identificação')}
                      </h3>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-slate-500 uppercase tracking-wider mb-1" style={{ fontWeight: 500 }}>Situação</div>
                      <div className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${
                        arrematante?.pago 
                          ? 'bg-green-50 text-green-700 border border-green-200' 
                          : isOverdue(arrematante, auction) 
                            ? 'bg-red-50 text-red-700 border border-red-200' 
                            : 'bg-slate-100 text-slate-700 border border-slate-300'
                      }`}>
                        {arrematante?.pago 
                          ? 'Quitada' 
                          : isOverdue(arrematante, auction) 
                            ? 'Atrasado' 
                            : 'Em Aberto'
                        }
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="px-8 py-6 space-y-6">
                  <div style={{ pageBreakInside: 'avoid' }}>
                    <h4 className="text-sm font-light text-slate-700 uppercase tracking-wider mb-4 border-b border-slate-200 pb-2">
                      Dados da Obrigação
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm font-light">
                      <div className="space-y-3">
                        <div className="flex"><span className="text-slate-500 w-24">Cliente:</span> <span className="text-slate-900">{arrematante?.nome || 'Não informado'}</span></div>
                        <div className="flex"><span className="text-slate-500 w-24">Documento:</span> <span className="text-slate-900">{arrematante?.documento || 'Não informado'}</span></div>
                        <div className="flex"><span className="text-slate-500 w-24">Data:</span> <span className="text-slate-900">{formatDate(auction.dataInicio)}</span></div>
                        <div className="flex"><span className="text-slate-500 w-24">Telefone:</span> <span className="text-slate-900">{arrematante?.telefone || 'Não informado'}</span></div>
                        {(() => {
                          const loteComprado = arrematante?.loteId 
                            ? auction.lotes?.find(lote => lote.id === arrematante.loteId)
                            : null;
                          const mercadoriaComprada = loteComprado && arrematante?.mercadoriaId
                            ? loteComprado.mercadorias?.find(m => m.id === arrematante.mercadoriaId)
                            : null;
                          
                          return (
                            <>
                              {mercadoriaComprada && (
                                <div className="flex"><span className="text-slate-500 w-24">Mercadoria:</span> <span className="text-slate-900">{mercadoriaComprada.titulo || mercadoriaComprada.tipo || 'Mercadoria'}</span></div>
                              )}
                              {loteComprado && (
                            <div className="flex"><span className="text-slate-500 w-24">Lote:</span> <span className="text-slate-900">Lote {loteComprado.numero} - {loteComprado.descricao || 'Sem descrição'}</span></div>
                              )}
                            </>
                          );
                        })()}
                      </div>
                      <div className="space-y-3">
                        <div className="flex"><span className="text-slate-500 w-24">Valor:</span> <span className="text-slate-900 font-medium">
                          {(() => {
                            const valorComJuros = calcularValorTotalComJuros(arrematante, auction);
                            const valorBase = arrematante?.valorPagarNumerico || parseFloat(arrematante?.valorPagar?.replace(/[^\d,]/g, '').replace(',', '.') || '0');
                            const temJuros = valorComJuros > valorBase;
                            
                            if (temJuros) {
                              return (
                                <>
                                  {formatCurrency(valorComJuros)}
                                  <span className="text-xs text-red-600 ml-1" style={{ color: '#dc2626', fontSize: '0.75rem', marginLeft: '0.25rem' }}>
                                    ({formatCurrency(valorComJuros - valorBase)} juros)
                                  </span>
                                </>
                              );
                            }
                            return formatCurrency(valorBase);
                          })()}
                        </span></div>
                        <div className="flex"><span className="text-slate-500 w-24">Modalidade:</span> <span className="text-slate-900">{(() => {
                          const loteArrematado = arrematante?.loteId 
                            ? auction.lotes?.find(lote => lote.id === arrematante.loteId)
                            : null;
                          const tipoPagamento = loteArrematado?.tipoPagamento || auction.tipoPagamento;
                          
                          switch (tipoPagamento) {
                            case 'a_vista':
                              return 'Pagamento à Vista';
                            case 'entrada_parcelamento':
                              return 'Entrada + Parcelamento';
                            case 'parcelamento':
                              return 'Parcelamento';
                            default:
                              return 'Não definido';
                          }
                        })()}</span></div>
                        {(() => {
                          const loteComprado = arrematante?.loteId 
                            ? auction.lotes?.find(lote => lote.id === arrematante.loteId)
                            : null;
                          const tipoPagamento = loteComprado?.tipoPagamento || auction.tipoPagamento;
                          
                          if (tipoPagamento === 'a_vista') {
                            return null; // Não mostrar parcelas para pagamento à vista
                          }
                          
                          const valorTotal = arrematante?.valorPagarNumerico || 
                            (typeof arrematante?.valorPagar === 'number' ? arrematante.valorPagar : 
                             (typeof arrematante?.valorPagar === 'string' ? parseFloat(arrematante.valorPagar.replace(/[^\d,]/g, '').replace(',', '.')) || 0 : 0));
                          const quantidadeParcelas = arrematante?.quantidadeParcelas || 12;
                          const parcelasPagas = arrematante?.parcelasPagas || 0;
                          
                          if (tipoPagamento === 'entrada_parcelamento') {
                            // Para entrada + parcelamento (entrada e parcelas são INDEPENDENTES)
                            const valorEntradaBase = arrematante?.valorEntrada ? 
                              (typeof arrematante.valorEntrada === 'string' ? 
                                parseFloat(arrematante.valorEntrada.replace(/[^\d,]/g, '').replace(',', '.')) : 
                                arrematante.valorEntrada) : 
                              valorTotal * 0.3;
                            // ✅ Valor da parcela = valorTotal / quantidade (SEM subtrair entrada)
                            const valorPorParcelaBase = valorTotal / quantidadeParcelas;
                            
                            // Calcular valor da entrada com juros se atrasada
                            const dataEntrada = loteComprado?.dataEntrada || auction.dataEntrada;
                            const percentualJuros = arrematante?.percentualJurosAtraso || 0;
                            let valorEntradaComJuros = valorEntradaBase;
                            let entradaAtrasada = false;
                            
                            if (dataEntrada && parcelasPagas === 0 && percentualJuros > 0) {
                              valorEntradaComJuros = calcularJurosProgressivos(valorEntradaBase, dataEntrada, percentualJuros);
                              entradaAtrasada = valorEntradaComJuros > valorEntradaBase;
                            }
                            
                            // Calcular quantas parcelas estão atrasadas
                            let parcelasAtrasadas = 0;
                            let parcelasPendentes = 0;
                            const mesInicio = arrematante?.mesInicioPagamento;
                            const diaVencimento = arrematante?.diaVencimentoMensal || 15;
                            const hoje = new Date();
                            
                            if (mesInicio) {
                              try {
                                const [startYear, startMonth] = mesInicio.split('-').map(Number);
                                const parcelasEfetivasPagas = Math.max(0, parcelasPagas - 1); // -1 porque entrada conta
                                
                                for (let i = 0; i < quantidadeParcelas; i++) {
                                  if (i < parcelasEfetivasPagas) continue; // Pula parcelas já pagas
                                  
                                  const dataVencimento = new Date(startYear, startMonth - 1 + i, diaVencimento);
                                  dataVencimento.setHours(23, 59, 59, 999);
                                  
                                  if (hoje > dataVencimento) {
                                    parcelasAtrasadas++;
                                  } else {
                                    parcelasPendentes++;
                                  }
                                }
                              } catch (error) {
                                console.error('Erro ao calcular parcelas atrasadas:', error);
                              }
                            }
                            
                            return (
                              <>
                                <div className="flex"><span className="text-slate-500 w-24">Entrada:</span> <span className="text-slate-900 font-medium">
                                  {formatCurrency(entradaAtrasada ? valorEntradaComJuros : valorEntradaBase)}
                                  {' '}{parcelasPagas > 0 ? '(Paga)' : '(Pendente)'}
                                </span></div>
                                <div className="flex"><span className="text-slate-500 w-24">Parcelas:</span> <span className="text-slate-900">
                                  {quantidadeParcelas} parcelas
                                </span></div>
                                <div className="flex"><span className="text-slate-500 w-24">Pagas:</span> <span className="text-slate-900">{Math.max(0, parcelasPagas - 1)} de {quantidadeParcelas} parcelas</span></div>
                              </>
                            );
                          } else {
                            // Para parcelamento simples
                            const valorPorParcelaBase = valorTotal / quantidadeParcelas;
                            const percentualJuros = auction.arrematante?.percentualJurosAtraso || 0;
                            
                            // Calcular quantas parcelas estão atrasadas
                            let parcelasAtrasadas = 0;
                            let parcelasPendentes = 0;
                            const mesInicio = auction.arrematante?.mesInicioPagamento;
                            const diaVencimento = auction.arrematante?.diaVencimentoMensal || 15;
                            const hoje = new Date();
                            
                            if (mesInicio && percentualJuros > 0) {
                              try {
                                const [startYear, startMonth] = mesInicio.split('-').map(Number);
                                
                                for (let i = parcelasPagas; i < quantidadeParcelas; i++) {
                                  const dataVencimento = new Date(startYear, startMonth - 1 + i, diaVencimento);
                                  dataVencimento.setHours(23, 59, 59, 999);
                                  
                                  if (hoje > dataVencimento) {
                                    parcelasAtrasadas++;
                                  } else {
                                    parcelasPendentes++;
                                  }
                                }
                              } catch (error) {
                                console.error('Erro ao calcular parcelas atrasadas:', error);
                              }
                            }
                            
                            return (
                              <>
                                <div className="flex"><span className="text-slate-500 w-24">Parcelas:</span> <span className="text-slate-900">
                                  {quantidadeParcelas} parcelas
                                </span></div>
                                <div className="flex"><span className="text-slate-500 w-24">Pagas:</span> <span className="text-slate-900">{parcelasPagas} de {quantidadeParcelas}</span></div>
                              </>
                            );
                          }
                        })()}
                      </div>
                    </div>
                  </div>
                  
                  {/* Detalhamento das Parcelas */}
                  {(() => {
                    const loteComprado = arrematante?.loteId 
                      ? auction.lotes?.find(lote => lote.id === arrematante.loteId)
                      : null;
                    const tipoPagamento = loteComprado?.tipoPagamento || auction.tipoPagamento;
                    
                    // Só mostrar detalhamento para modalidades com parcelamento
                    if (tipoPagamento === 'a_vista') return null;
                    
                    if (!arrematante) return null;
                    
                    const valorTotal = arrematante.valorPagarNumerico || 
                      (typeof arrematante.valorPagar === 'number' ? arrematante.valorPagar : 
                       (typeof arrematante.valorPagar === 'string' ? parseFloat(arrematante.valorPagar.replace(/[^\d,]/g, '').replace(',', '.')) || 0 : 0));
                    const quantidadeParcelas = arrematante.quantidadeParcelas || 12;
                    const parcelasPagas = arrematante.parcelasPagas || 0;
                    const percentualJuros = arrematante.percentualJurosAtraso || 0;
                    const mesInicio = arrematante.mesInicioPagamento;
                    const diaVencimento = arrematante.diaVencimentoMensal || 15;
                    
                    if (!mesInicio) return null;
                    
                    const detalhamentoParcelas: { numero: string | number; vencimento: string; valor?: number; status?: string; valorBase?: number; valorComJuros?: number; isPaga?: boolean; isAtrasada?: boolean; temJuros?: boolean }[] = [];
                    
                    try {
                      if (tipoPagamento === 'entrada_parcelamento') {
                        const valorEntradaBase = arrematante.valorEntrada ? 
                          (typeof arrematante.valorEntrada === 'string' ? 
                            parseFloat(arrematante.valorEntrada.replace(/[^\d,]/g, '').replace(',', '.')) : 
                            arrematante.valorEntrada) : 
                          valorTotal * 0.3;
                        // ✅ Valor da parcela = valorTotal / quantidade (SEM subtrair entrada - são independentes)
                        const valorPorParcelaBase = valorTotal / quantidadeParcelas;
                        const dataEntrada = loteComprado?.dataEntrada || auction.dataEntrada;
                        
                        // Adicionar entrada
                        if (dataEntrada) {
                          const valorEntradaComJuros = calcularJurosProgressivos(valorEntradaBase, dataEntrada, percentualJuros);
                          const isPaga = parcelasPagas > 0;
                          const isAtrasada = !isPaga && new Date() > new Date(dataEntrada + 'T23:59:59');
                          
                          detalhamentoParcelas.push({
                            numero: 'Entrada',
                            vencimento: new Date(dataEntrada).toLocaleDateString('pt-BR'),
                            valorBase: valorEntradaBase,
                            valorComJuros: valorEntradaComJuros,
                            isPaga,
                            isAtrasada,
                            temJuros: valorEntradaComJuros > valorEntradaBase
                          });
                        }
                        
                        // Adicionar parcelas
                        const [startYear, startMonth] = mesInicio.split('-').map(Number);
                        for (let i = 0; i < quantidadeParcelas; i++) {
                          const dataVencimento = new Date(startYear, startMonth - 1 + i, diaVencimento);
                          const dataVencimentoStr = dataVencimento.toISOString().split('T')[0];
                          const valorComJuros = calcularJurosProgressivos(valorPorParcelaBase, dataVencimentoStr, percentualJuros);
                          const isPaga = (i + 1) < parcelasPagas; // i+1 porque entrada já foi contada
                          const isAtrasada = !isPaga && new Date() > dataVencimento;
                          
                          detalhamentoParcelas.push({
                            numero: `${i + 1}ª Parcela`,
                            vencimento: dataVencimento.toLocaleDateString('pt-BR'),
                            valorBase: valorPorParcelaBase,
                            valorComJuros,
                            isPaga,
                            isAtrasada,
                            temJuros: valorComJuros > valorPorParcelaBase
                          });
                        }
                      } else {
                        // Parcelamento simples
                        const valorPorParcelaBase = valorTotal / quantidadeParcelas;
                        const [startYear, startMonth] = mesInicio.split('-').map(Number);
                        
                        for (let i = 0; i < quantidadeParcelas; i++) {
                          const dataVencimento = new Date(startYear, startMonth - 1 + i, diaVencimento);
                          const dataVencimentoStr = dataVencimento.toISOString().split('T')[0];
                          const valorComJuros = calcularJurosProgressivos(valorPorParcelaBase, dataVencimentoStr, percentualJuros);
                          const isPaga = i < parcelasPagas;
                          const isAtrasada = !isPaga && new Date() > dataVencimento;
                          
                          detalhamentoParcelas.push({
                            numero: `${i + 1}ª Parcela`,
                            vencimento: dataVencimento.toLocaleDateString('pt-BR'),
                            valorBase: valorPorParcelaBase,
                            valorComJuros,
                            isPaga,
                            isAtrasada,
                            temJuros: valorComJuros > valorPorParcelaBase
                          });
                        }
                      }
                    } catch (error) {
                      console.error('Erro ao calcular detalhamento de parcelas:', error);
                      return null;
                    }
                    
                    if (detalhamentoParcelas.length === 0) return null;
                    
                    return (
                      <div className="border-t border-slate-200 pt-6" style={{ pageBreakInside: 'avoid' }}>
                        <h4 className="text-sm font-light text-slate-700 uppercase tracking-wider mb-4 border-b border-slate-200 pb-2">
                          Detalhamento de Parcelas
                        </h4>
                        <div className="space-y-2">
                          {detalhamentoParcelas.map((parcela, idx) => (
                            <div key={idx} className={`text-xs p-3 rounded border ${
                              parcela.isPaga 
                                ? 'bg-green-50 border-green-200' 
                                : parcela.isAtrasada 
                                  ? 'bg-red-50 border-red-200' 
                                  : 'bg-slate-50 border-slate-200'
                            }`} style={{ pageBreakInside: 'avoid' }}>
                              <div className="flex justify-between items-center">
                                <span className="font-medium text-slate-700">
                                  {parcela.numero} - Vence em {parcela.vencimento}
                                </span>
                                <div className="text-right">
                                  <span className={`font-semibold ${
                                    parcela.isPaga 
                                      ? 'text-green-700' 
                                      : parcela.isAtrasada 
                                        ? 'text-red-700' 
                                        : 'text-slate-900'
                                  }`}>
                                    {formatCurrency(parcela.isAtrasada && parcela.temJuros ? parcela.valorComJuros : parcela.valorBase)}
                                  </span>
                                  <span className={`block text-xs mt-1 ${
                                    parcela.isPaga 
                                      ? 'text-green-600' 
                                      : parcela.isAtrasada 
                                        ? 'text-red-600' 
                                        : 'text-slate-500'
                                  }`}>
                                    {parcela.isPaga ? '✓ Paga' : parcela.isAtrasada ? '✗ Atrasada' : '○ Pendente'}
                                  </span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                  
                  {arrematante?.endereco && (
                    <div className="border-t border-slate-200 pt-6" style={{ pageBreakInside: 'avoid' }}>
                      <h4 className="text-sm font-light text-slate-700 uppercase tracking-wider mb-3 border-b border-slate-200 pb-2">
                        Endereço de Cobrança
                      </h4>
                      <div className="bg-slate-50 border border-slate-200 p-4 text-sm font-light text-slate-800">
                        {arrematante.endereco}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
            
            {todasFaturas.length > 10 && (
              <div className="text-center bg-slate-50 border-2 border-slate-300 p-8 font-sans">
                <div className="text-lg font-light text-slate-900 tracking-wide">
                  Documento Completo
                </div>
                <div className="text-sm text-slate-600 font-light mt-3 leading-relaxed">
                  Esta visualização apresenta as primeiras 10 faturas.
                  <br />
                  O documento final compreenderá todas as {todasFaturas.length} obrigações financeiras.
                </div>
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
        <div className="mt-8 flex justify-center items-center -ml-20">
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
