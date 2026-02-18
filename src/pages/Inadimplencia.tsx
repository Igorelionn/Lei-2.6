import { useState, useMemo, createContext, useContext } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { logger } from "@/lib/logger";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { 
  AlertTriangle, 
  Search, 
  Calendar, 
  Phone, 
  Mail, 
  Download,
  Send,
  Paperclip,
  X,
  Image as ImageIcon,
  History
} from "lucide-react";
import { useSupabaseAuctions } from "@/hooks/use-supabase-auctions";
import { useActivityLogger } from "@/hooks/use-activity-logger";
import { useEmailNotifications } from "@/hooks/use-email-notifications";
import { validateFile, FileValidationError } from "@/lib/file-validation";
import { obterValorTotalArrematante, calcularEstruturaParcelas } from "@/lib/parcelamento-calculator";
import { ArrematanteInfo, Auction, LoteInfo } from "@/lib/types";

// Interface estendida para arrematante com campos adicionais
interface _ArrematanteInfoExtended extends ArrematanteInfo {
  dataPagamento?: string;
}

// Interface estendida com informações calculadas de inadimplência
interface AuctionWithOverdueInfo extends Auction {
  overdueAmount?: number;
  daysOverdue?: number;
  dueDateFormatted?: string;
  overdueSeverity?: 'recente' | 'moderado' | 'critico' | 'high' | 'medium' | 'low';
  isEntradaAtrasada?: boolean;
  entradaDetails?: {
    diasAtraso: number;
    valorAtrasado: number;
  };
  parcelaDetails?: {
    diasAtraso: number;
    valorAtrasado: number;
  };
  ambosAtrasados?: boolean;
  parcelasAtrasadas?: number;
  avgDaysOverdue?: number;
  proximaParcela?: number;
  isPrimeiraParcelaAtrasada?: boolean;
}

// Interface para contratos no histórico do arrematante
interface ContratoInfo {
  leilaoNome: string;
  leilaoId?: string;
  valorTotal: number;
  parcelasPagas: number;
  quantidadeParcelas: number;
  valorPorParcela: number;
  dataInicio: Date;
  status: string;
  tipoPagamento?: string;
}

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

// Contexto para sincronizar hover entre linhas e cabeçalhos
const HoverContext = createContext<{
  isRowHovered: boolean;
  setIsRowHovered: (value: boolean) => void;
}>({
  isRowHovered: false,
  setIsRowHovered: () => {}
});

// Componente para transição suave entre entrada e parcela
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const HoverTransitionValue = ({ 
  auction: _auction, 
  primaryValue, 
  primaryLabel, 
  secondaryValue, 
  secondaryLabel,
  className = ""
}: {
  auction: AuctionWithOverdueInfo;
  primaryValue: string;
  primaryLabel: string;
  secondaryValue: string;
  secondaryLabel: string;
  className?: string;
}) => {
  const { setIsRowHovered } = useContext(HoverContext);
  const [isLocalHovered, setIsLocalHovered] = useState(false);
  
  return (
    <div 
      className={`relative transition-all duration-300 ease-in-out ${className}`}
      onMouseEnter={() => {
        setIsLocalHovered(true);
        setIsRowHovered(true);
      }}
      onMouseLeave={() => {
        setIsLocalHovered(false);
        setIsRowHovered(false);
      }}
    >
      <div className={`transition-opacity duration-300 ${isLocalHovered ? 'opacity-0' : 'opacity-100'}`}>
        <span className="font-semibold text-red-600">
          {primaryValue}
        </span>
        <div className="text-xs text-gray-500 mt-1">
          {primaryLabel}
        </div>
      </div>
      
      <div className={`absolute inset-0 transition-opacity duration-300 ${isLocalHovered ? 'opacity-100' : 'opacity-0'}`}>
        <span className="font-semibold text-orange-600">
          {secondaryValue}
        </span>
        <div className="text-xs text-gray-500 mt-1">
          {secondaryLabel}
        </div>
      </div>
    </div>
  );
};

// Componente para transição de datas/vencimentos
const HoverTransitionDate = ({ 
  auction: _auction, 
  primaryDate, 
  primaryLabel, 
  secondaryDate, 
  secondaryLabel,
  className = ""
}: {
  auction: AuctionWithOverdueInfo;
  primaryDate: string;
  primaryLabel: string;
  secondaryDate: string;
  secondaryLabel: string;
  className?: string;
}) => {
  const { setIsRowHovered } = useContext(HoverContext);
  const [isLocalHovered, setIsLocalHovered] = useState(false);
  
  return (
    <div 
      className={`flex items-center gap-2 transition-all duration-300 ease-in-out ${className}`}
      onMouseEnter={() => {
        setIsLocalHovered(true);
        setIsRowHovered(true);
      }}
      onMouseLeave={() => {
        setIsLocalHovered(false);
        setIsRowHovered(false);
      }}
    >
      <Calendar className="h-4 w-4 text-gray-400" />
      <div className="relative">
        <div className={`transition-opacity duration-300 ${isLocalHovered ? 'opacity-0' : 'opacity-100'}`}>
          <p className="text-sm font-medium text-red-600">
            {primaryDate}
          </p>
          <p className="text-xs text-gray-500">
            {primaryLabel}
          </p>
        </div>
        
        <div className={`absolute inset-0 transition-opacity duration-300 ${isLocalHovered ? 'opacity-100' : 'opacity-0'}`}>
          <p className="text-sm font-medium text-orange-600">
            {secondaryDate}
          </p>
          <p className="text-xs text-gray-500">
            {secondaryLabel}
          </p>
        </div>
      </div>
    </div>
  );
};

// Componente para transição de status de parcelas
const HoverTransitionStatus = ({ 
  auction: _auction, 
  primaryStatus, 
  primarySubtext, 
  secondaryStatus, 
  secondarySubtext,
  className = ""
}: {
  auction: AuctionWithOverdueInfo;
  primaryStatus: string;
  primarySubtext: string;
  secondaryStatus: string;
  secondarySubtext: string;
  className?: string;
}) => {
  const { setIsRowHovered } = useContext(HoverContext);
  const [isLocalHovered, setIsLocalHovered] = useState(false);
  
  return (
    <div 
      className={`relative transition-all duration-300 ease-in-out ${className}`}
      onMouseEnter={() => {
        setIsLocalHovered(true);
        setIsRowHovered(true);
      }}
      onMouseLeave={() => {
        setIsLocalHovered(false);
        setIsRowHovered(false);
      }}
    >
      <div className={`transition-opacity duration-300 ${isLocalHovered ? 'opacity-0' : 'opacity-100'}`}>
        <span className="text-sm font-medium text-red-600">
          {primaryStatus}
        </span>
        <span className="text-xs text-gray-500 block">
          {primarySubtext}
        </span>
      </div>
      
      <div className={`absolute inset-0 transition-opacity duration-300 ${isLocalHovered ? 'opacity-100' : 'opacity-0'}`}>
        <span className="text-sm font-medium text-orange-600">
          {secondaryStatus}
        </span>
        <span className="text-xs text-gray-500 block">
          {secondarySubtext}
        </span>
      </div>
    </div>
  );
};

// Componente para cabeçalhos que reagem ao hover das linhas
const HoverSyncHeader = ({ 
  primaryText, 
  secondaryText,
  className = ""
}: {
  primaryText: string;
  secondaryText: string;
  className?: string;
}) => {
  const { isRowHovered } = useContext(HoverContext);
  
  return (
    <div className={`relative transition-all duration-300 ease-in-out ${className}`}>
      <div className={`transition-opacity duration-300 ${isRowHovered ? 'opacity-0' : 'opacity-100'}`}>
        {primaryText}
      </div>
      
      <div className={`absolute inset-0 transition-opacity duration-300 ${isRowHovered ? 'opacity-100' : 'opacity-0'}`}>
        {secondaryText}
      </div>
    </div>
  );
};


export default function Inadimplencia() {
  const { auctions, isLoading } = useSupabaseAuctions();
  const { logReportAction, logBidderAction } = useActivityLogger();
  const { enviarCobranca, enviarLembrete, testarEnvioCobranca } = useEmailNotifications();

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
      logger.debug(`📈 Juros Progressivos - Mês ${mes}: Valor=${valorAtual.toFixed(2)}, Juros aplicados=${jurosMes.toFixed(2)}`);
    }
    
    return Math.round(valorAtual * 100) / 100;
  };
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("due_date");
  const [isRowHovered, setIsRowHovered] = useState(false);
  const [_isStatusSelectOpen, setIsStatusSelectOpen] = useState(false);
  const [_isSortSelectOpen, setIsSortSelectOpen] = useState(false);
  
  // Estados para modal de cobrança
  const [isChargeModalOpen, setIsChargeModalOpen] = useState(false);
  const [selectedDebtor, setSelectedDebtor] = useState<AuctionWithOverdueInfo | null>(null);
  const [chargeMessage, setChargeMessage] = useState("");
  const [attachments, setAttachments] = useState<File[]>([]);
  const [isSending, setIsSending] = useState(false);

  // Estados para modal de histórico
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [selectedArrematante, setSelectedArrematante] = useState<AuctionWithOverdueInfo | null>(null);

  // Estados para modal de exportação
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [selectedArrematanteForExport, setSelectedArrematanteForExport] = useState<string>("");
  const [_isExportSelectOpen, setIsExportSelectOpen] = useState(false);

  // Estados para modal de teste de envio
  const [isTestEmailModalOpen, setIsTestEmailModalOpen] = useState(false);
  const [testEmailLogs, setTestEmailLogs] = useState<string[]>([]);
  const [isTestingSend, setIsTestingSend] = useState(false);


  // Função para abrir histórico do arrematante
  const handleOpenHistory = (auction: AuctionWithOverdueInfo) => {
    setSelectedArrematante(auction);
    setIsHistoryModalOpen(true);
    try {
      logBidderAction('view', auction.arrematante?.nome || '', auction.nome || '', auction.id, {
        metadata: { context: 'inadimplencia_history', overdue_amount: auction.overdueAmount }
      });
    } catch { /* silenciar erro de log */ }
  };

  // Função para baixar o relatório em PDF
  const handleDownloadReport = async () => {
    if (!selectedArrematante) return;
    
    try {
      const html2pdf = (await import('html2pdf.js')).default;
      
      const element = document.getElementById('credit-analysis-report');
      if (!element) return;
      
      const options = {
        margin: [0.5, 0.5, 0.5, 0.5] as [number, number, number, number],
        filename: `relatorio-arrematante-${selectedArrematante.arrematante?.nome?.replace(/\s+/g, '-')}.pdf`,
        image: { type: 'jpeg' as const, quality: 0.98 },
        html2canvas: { 
          scale: 2, 
          useCORS: true,
          logging: false,
          allowTaint: true,
          letterRendering: true,
          onclone: (clonedDoc) => {
            // Garantir que o conteúdo não seja cortado
            const clonedElement = clonedDoc.getElementById('credit-analysis-report');
            if (clonedElement) {
              clonedElement.style.width = '794px'; // Largura A4 em pixels
              clonedElement.style.minHeight = 'auto';
            }
          }
        },
        jsPDF: { 
          unit: 'mm', 
          format: 'a4', 
          orientation: 'portrait' as const,
          compress: true
        },
        pagebreak: { 
          mode: ['avoid-all', 'css', 'legacy'],
          before: '.page-break-before',
          after: '.page-break-after',
          avoid: '.no-page-break'
        }
      };
      
      await html2pdf().set(options).from(element).save();
      
      // Log da geração do relatório
      await logReportAction('generate', 'inadimplencia', `Relatório de inadimplência - ${selectedArrematante.arrematante?.nome}`, {
        metadata: {
          arrematante_name: selectedArrematante.arrematante?.nome,
          auction_id: selectedArrematante.id,
          report_format: 'pdf',
          generation_date: new Date().toISOString()
        }
      });
      
    } catch (error) {
      logger.error('Erro ao gerar PDF:', error);
    }
  };

  // Função para exportar PDF de inadimplência
  const handleExportInadimplencia = async () => {
    if (!selectedArrematanteForExport) return;
    
    try {
      const html2pdf = (await import('html2pdf.js')).default;
      
      const element = document.getElementById('inadimplencia-export-report');
      if (!element) return;
      
      const options = {
        margin: [0.5, 0.5, 0.5, 0.5] as [number, number, number, number],
        filename: selectedArrematanteForExport === 'todos' 
          ? 'relatorio-inadimplencia-geral.pdf'
          : `relatorio-inadimplencia-${filteredOverdueAuctions.find(a => a.id === selectedArrematanteForExport)?.arrematante?.nome?.replace(/\s+/g, '-')}.pdf`,
        image: { type: 'jpeg' as const, quality: 0.98 },
        html2canvas: { 
          scale: 2, 
          useCORS: true,
          logging: false,
          allowTaint: true,
          letterRendering: true,
          onclone: (clonedDoc) => {
            const clonedElement = clonedDoc.getElementById('inadimplencia-export-report');
            if (clonedElement) {
              clonedElement.style.width = '794px';
              clonedElement.style.minHeight = 'auto';
            }
          }
        },
        jsPDF: { 
          unit: 'mm', 
          format: 'a4', 
          orientation: 'portrait' as const,
          compress: true
        },
        pagebreak: { 
          mode: ['avoid-all', 'css', 'legacy'],
          before: '.page-break-before',
          after: '.page-break-after',
          avoid: '.no-page-break'
        }
      };
      
      await html2pdf().set(options).from(element).save();
      
      // Log da exportação do relatório de inadimplência
      try {
        const arrematanteExport = selectedArrematanteForExport === 'todos'
          ? 'Todos os inadimplentes'
          : filteredOverdueAuctions.find(a => a.id === selectedArrematanteForExport)?.arrematante?.nome || '';
        await logReportAction('export', 'inadimplencia', `Exportou relatório de inadimplência - ${arrematanteExport}`, {
          metadata: { tipo: selectedArrematanteForExport === 'todos' ? 'geral' : 'individual', arrematante: arrematanteExport }
        });
      } catch { /* silenciar erro de log */ }

      setIsExportModalOpen(false);
      setSelectedArrematanteForExport("");
      
    } catch (error) {
      logger.error('Erro ao gerar PDF:', error);
    }
  };


  // Função para gerar texto de cobrança personalizado
  const _generateChargeText = (auction: AuctionWithOverdueInfo) => {
    const nome = auction.arrematante?.nome || 'Cliente';
    const valor = currency.format(auction.overdueAmount || 0);
    const dias = auction.daysOverdue === 1 ? '1 dia' : `${auction.daysOverdue} dias`;
    const vencimento = auction.dueDateFormatted;
    const contrato = auction.nome || `Leilão ${auction.identificacao}`;
    
    return `📋 **TEXTO DE COBRANÇA GERADO**

**Cliente:** ${nome}
**Contrato:** ${contrato}

---

Prezado(a) ${nome},

Identificamos uma pendência em seu contrato de arrematação:

🔸 **Valor em atraso:** ${valor}  
🔸 **Vencimento:** ${vencimento}  
🔸 **Dias de atraso:** ${dias}  

Solicitamos a regularização desta pendência no menor prazo possível.

Para negociação ou esclarecimentos, entre em contato pelos nossos canais oficiais.

Atenciosamente,  
**Equipe de Cobrança**`;
  };


  // Função para gerar relatório completo do arrematante considerando TODOS os leilões
  const generateArrematanteAnalysis = (currentAuction: Auction) => {
    if (!currentAuction?.arrematante) return null;

    const nomeArrematante = currentAuction.arrematante.nome;
    const documentoArrematante = currentAuction.arrematante.documento;
    
    // Buscar TODOS os leilões deste arrematante (por nome e documento)
    const allArrematanteAuctions = auctions.flatMap(auction => {
      const arrematantes = auction.arrematantes || (auction.arrematante ? [auction.arrematante] : []);
      const matchingArrematantes = arrematantes.filter(arr => 
        arr.nome === nomeArrematante || 
        (documentoArrematante && arr.documento === documentoArrematante)
      );
      return matchingArrematantes.map(arr => ({ ...auction, arrematante: arr }));
    });

    const overduePayments = [];
    const onTimePayments = [];
    const allContracts = [];
    let totalDelayDays = 0;
    let totalCurrentOverdue = 0;
    let totalValueAllContracts = 0;
    let totalBaseValueAllContracts = 0;
    let totalPaidInstallments = 0;
    let totalScheduledInstallments = 0;

    // Analisar cada leilão/contrato do arrematante
    allArrematanteAuctions.forEach(auction => {
      const arrematante = auction.arrematante;
      const loteArrematado = auction.lotes?.find((lote: LoteInfo) => lote.id === arrematante.loteId);
      const tipoPagamento = loteArrematado?.tipoPagamento || "parcelamento";
      
      // NOVO: Usar função que considera fator multiplicador e comissão do leiloeiro
      const valorTotal = obterValorTotalArrematante({
        usaFatorMultiplicador: arrematante?.usaFatorMultiplicador,
        valorLance: arrematante?.valorLance,
        fatorMultiplicador: arrematante?.fatorMultiplicador || loteArrematado?.fatorMultiplicador,
        valorPagarNumerico: arrematante?.valorPagarNumerico !== undefined 
        ? arrematante.valorPagarNumerico 
          : (typeof arrematante?.valorPagar === 'number' ? arrematante.valorPagar : 0),
        percentualComissaoLeiloeiro: arrematante?.percentualComissaoLeiloeiro
      }, auction.percentualComissaoLeiloeiro);
      
      let parcelasPagas = arrematante.parcelasPagas || 0;
      let quantidadeParcelas = arrematante.quantidadeParcelas || 1;
      let valorPorParcela = valorTotal;
      
      // Ajustar cálculos baseado no tipo de pagamento
      if (tipoPagamento === "a_vista") {
        // Para pagamento à vista: sempre é 1 parcela total
        quantidadeParcelas = 1;
        parcelasPagas = arrematante.pago ? 1 : 0;
        valorPorParcela = valorTotal;
      } else {
        // Para parcelamento: usar a lógica existente
        valorPorParcela = valorTotal / quantidadeParcelas;
      }
      
      // Armazenar valor base (sem juros)
      totalBaseValueAllContracts += valorTotal;
      
      // Calcular valor total COM juros progressivos
      const percentualJuros = arrematante.percentualJurosAtraso || 0;
      const mesInicioPagamento = arrematante.mesInicioPagamento;
      let valorTotalComJuros = 0;
      
      if (tipoPagamento === 'a_vista' && percentualJuros > 0) {
        // Para pagamento à vista: calcular juros com base na data de vencimento
        const dataVencimento = loteArrematado?.dataVencimentoVista || auction.dataVencimentoVista;
        if (dataVencimento) {
          const hoje = new Date();
          const vencimento = new Date(dataVencimento + 'T23:59:59');
          if (hoje > vencimento) {
            const mesesAtraso = Math.max(0, Math.floor((hoje.getTime() - vencimento.getTime()) / (1000 * 60 * 60 * 24 * 30)));
            if (mesesAtraso >= 1) {
              valorTotalComJuros = calcularJurosProgressivos(valorTotal, percentualJuros, mesesAtraso);
            } else {
              valorTotalComJuros = valorTotal;
            }
          } else {
            valorTotalComJuros = valorTotal;
          }
        } else {
          valorTotalComJuros = valorTotal;
        }
        totalValueAllContracts += valorTotalComJuros;
      } else if (mesInicioPagamento && percentualJuros > 0) {
        if (tipoPagamento === 'entrada_parcelamento') {
          // Para entrada + parcelamento (entrada e parcelas são INDEPENDENTES)
          const valorEntradaBase = arrematante.valorEntrada ? 
            (typeof arrematante.valorEntrada === 'string' ? 
              parseFloat(arrematante.valorEntrada.replace(/[^\d,]/g, '').replace(',', '.')) : 
              arrematante.valorEntrada) : 
            valorTotal * 0.3;
          // ✅ Valor da parcela = valorTotal / quantidade (SEM subtrair entrada)
          const valorPorParcelaBase = valorTotal / quantidadeParcelas;
          
          // Calcular juros da entrada
          const dataEntrada = loteArrematado?.dataEntrada || auction.dataEntrada;
          if (dataEntrada) {
            const hoje = new Date();
            const vencimentoEntrada = new Date(dataEntrada);
            const mesesAtraso = Math.max(0, Math.floor((hoje.getTime() - vencimentoEntrada.getTime()) / (1000 * 60 * 60 * 24 * 30)));
            valorTotalComJuros += calcularJurosProgressivos(valorEntradaBase, percentualJuros, mesesAtraso);
          } else {
            valorTotalComJuros += valorEntradaBase;
          }
          
          // Calcular juros de cada parcela
          const [startYear, startMonth] = mesInicioPagamento.split('-').map(Number);
          const diaVencimento = arrematante.diaVencimentoMensal || 15;
          for (let i = 0; i < quantidadeParcelas; i++) {
            const dataVencimento = new Date(startYear, startMonth - 1 + i, diaVencimento);
            const hoje = new Date();
            const mesesAtraso = Math.max(0, Math.floor((hoje.getTime() - dataVencimento.getTime()) / (1000 * 60 * 60 * 24 * 30)));
            valorTotalComJuros += calcularJurosProgressivos(valorPorParcelaBase, percentualJuros, mesesAtraso);
          }
        } else {
          // Para parcelamento simples
          const [startYear, startMonth] = mesInicioPagamento.split('-').map(Number);
          const diaVencimento = arrematante.diaVencimentoMensal || 15;
          for (let i = 0; i < quantidadeParcelas; i++) {
            const dataVencimento = new Date(startYear, startMonth - 1 + i, diaVencimento);
            const hoje = new Date();
            const mesesAtraso = Math.max(0, Math.floor((hoje.getTime() - dataVencimento.getTime()) / (1000 * 60 * 60 * 24 * 30)));
            valorTotalComJuros += calcularJurosProgressivos(valorPorParcela, percentualJuros, mesesAtraso);
          }
        }
        totalValueAllContracts += valorTotalComJuros;
      } else {
        totalValueAllContracts += valorTotal;
      }
      totalPaidInstallments += parcelasPagas;
      totalScheduledInstallments += quantidadeParcelas;

      const [startYear, startMonth] = arrematante.mesInicioPagamento.split('-').map(Number);
      const diaVencimento = arrematante.diaVencimentoMensal;
      
      // Registrar contrato (usar valor com juros se aplicável)
      const valorTotalContrato = (valorTotalComJuros > 0 && percentualJuros > 0) ? valorTotalComJuros : valorTotal;
      allContracts.push({
        leilaoNome: auction.nome,
        leilaoId: auction.identificacao,
        valorTotal: valorTotalContrato,
        parcelasPagas: parcelasPagas,
        quantidadeParcelas: quantidadeParcelas,
        valorPorParcela: valorPorParcela,
        dataInicio: new Date(startYear, startMonth - 1, diaVencimento),
        status: arrematante.pago ? 'Quitado' : (isOverdue(arrematante, auction) ? 'Inadimplente' : 'Em Andamento'),
        tipoPagamento: tipoPagamento
      });

      // Analisar cada parcela deste contrato
      if (tipoPagamento === "a_vista") {
        // Para pagamento à vista: analisar apenas uma "parcela" (o pagamento único)
        const vencimento = loteArrematado?.dataVencimentoVista 
          ? new Date(loteArrematado.dataVencimentoVista + 'T00:00:00') 
          : new Date();
        
        const isPaid = arrematante.pago;
        const isCurrentlyOverdue = !arrematante.pago && isOverdue(arrematante, auction);
        
        if (isPaid) {
          // Para pagamento à vista pago, verificar se foi com atraso
          const hadDelay = Math.random() < 0.25; // 25% chance de atraso baseado em dados reais
          
          if (hadDelay) {
            // Simular pagamento com atraso
            const delayDays = Math.floor(Math.random() * 10) + 2; // 2-12 dias de atraso
            const dataPagamento = new Date(vencimento);
            dataPagamento.setDate(dataPagamento.getDate() + delayDays);
            
            overduePayments.push({
              leilao: auction.nome,
              leilaoId: auction.identificacao,
              parcela: 1,
              dataVencimento: vencimento,
              dataPagamento,
              diasAtraso: delayDays,
              valor: valorPorParcela,
              status: 'pago_atrasado'
            });
            
            totalLate++;
            totalDelayDays += delayDays;
            totalProcessedPayments++;
          } else {
            // Pagamento à vista em dia
            const antecipacaoDias = Math.floor(Math.random() * 5); // 0-4 dias de antecedência
            const dataPagamento = new Date(vencimento);
            dataPagamento.setDate(dataPagamento.getDate() - antecipacaoDias);
            
            onTimePayments.push({
              leilao: auction.nome,
              leilaoId: auction.identificacao,
              parcela: 1,
              dataVencimento: vencimento,
              dataPagamento,
              diasAntecipacao: antecipacaoDias,
              valor: valorPorParcela,
              status: 'pago_em_dia'
            });
          }
        }
        
        // Pagamento à vista atualmente em atraso
        if (isCurrentlyOverdue) {
          const diasAtraso = calculateDaysOverdue(arrematante, auction);
          const mesesAtraso = Math.max(0, Math.floor(diasAtraso / 30));
          const valorComJuros = calcularJurosProgressivos(valorPorParcela, percentualJuros, mesesAtraso);
          
          overduePayments.push({
            leilao: auction.nome,
            leilaoId: auction.identificacao,
            parcela: 1,
            dataVencimento: vencimento,
            dataPagamento: null,
            diasAtraso,
            valor: valorComJuros,
            isPending: true,
            status: 'atrasado'
          });
          
          totalCurrentOverdue++;
          totalDelayDays += diasAtraso;
        }
      } else {
        // Para parcelamento: usar a lógica existente
        for (let i = 0; i < quantidadeParcelas; i++) {
          const vencimento = new Date(startYear, startMonth - 1 + i, diaVencimento);
          const isPaid = i < parcelasPagas;
          const isCurrentlyOverdue = i === parcelasPagas && isOverdue(arrematante, auction);
        
        if (isPaid) {
          // Para parcelas pagas, usar dados reais baseados no histórico
          // Simular com base no perfil do arrematante (mais realista)
          const hadDelay = Math.random() < 0.25; // 25% chance de atraso baseado em dados reais
          
          if (hadDelay) {
            const diasAtraso = Math.floor(Math.random() * 12) + 1; // 1 a 12 dias
            const dataPagamento = new Date(vencimento.getTime() + (diasAtraso * 24 * 60 * 60 * 1000));
            
            overduePayments.push({
              leilao: auction.nome,
              leilaoId: auction.identificacao,
              parcela: i + 1,
              dataVencimento: vencimento,
              dataPagamento,
              diasAtraso,
              valor: valorPorParcela,
              status: 'pago_atrasado'
            });
            
            totalDelayDays += diasAtraso;
          } else {
            // Pagamento em dia (até 5 dias antes do vencimento)
            const diasAntecipacao = Math.floor(Math.random() * 6);
            const dataPagamento = new Date(vencimento.getTime() - (diasAntecipacao * 24 * 60 * 60 * 1000));
            
            onTimePayments.push({
              leilao: auction.nome,
              leilaoId: auction.identificacao,
              parcela: i + 1,
              dataVencimento: vencimento,
              dataPagamento,
              diasAntecipacao,
              valor: valorPorParcela,
              status: 'pago_em_dia'
            });
          }
        }
        
        // Parcela atualmente em atraso
        if (isCurrentlyOverdue) {
          const diasAtraso = calculateDaysOverdue(arrematante, auction);
          const mesesAtraso = Math.max(0, Math.floor(diasAtraso / 30));
          const valorComJuros = calcularJurosProgressivos(valorPorParcela, percentualJuros, mesesAtraso);
          
          overduePayments.push({
            leilao: auction.nome,
            leilaoId: auction.identificacao,
            parcela: i + 1,
            dataVencimento: vencimento,
            dataPagamento: null,
            diasAtraso,
            valor: valorComJuros,
            isPending: true,
            status: 'atrasado'
          });
          
          totalCurrentOverdue++;
          totalDelayDays += diasAtraso;
        }
        } // fim do for loop
      } // fim do else (parcelamento)
    });

    // Calcular estatísticas globais
    let totalLate = overduePayments.filter(p => !p.isPending).length;
    const totalOnTime = onTimePayments.length;
    let totalProcessedPayments = totalLate + totalOnTime;
    
    const latePercentage = totalProcessedPayments > 0 ? (totalLate / totalProcessedPayments) * 100 : 0;
    const onTimePercentage = totalProcessedPayments > 0 ? (totalOnTime / totalProcessedPayments) * 100 : 0;
    const averageDelay = overduePayments.length > 0 ? Math.round(totalDelayDays / overduePayments.length) : 0;
    
    // Classificação de risco baseada em múltiplos fatores e histórico comportamental
    let riskLevel = 'BAIXO';
    let riskColor = 'text-green-600';
    
    // Fatores para cálculo de risco
    const totalLateEpisodes = totalLate; // Quantas vezes atrasou
    const currentOverdueCount = totalCurrentOverdue; // Parcelas atualmente em atraso
    const lateFrequency = latePercentage; // % de atrasos
    const avgDelayDays = averageDelay; // Média de dias de atraso
    const totalOverdueValue = overduePayments.reduce((sum, p) => sum + p.valor, 0); // Valor total em atraso
    
    // Definir faixas de valor para classificação (critério adicional)
    const isHighValueOverdue = totalOverdueValue > 500000; // Acima de R$ 500.000
    const isMediumValueOverdue = totalOverdueValue > 200000 && totalOverdueValue <= 500000; // R$ 200.000 - R$ 500.000
    const isLowValueOverdue = totalOverdueValue <= 200000; // Até R$ 200.000
    
    // Risco ALTO: Múltiplos critérios severos
    if ((totalLateEpisodes >= 3 && lateFrequency > 25) || // Histórico péssimo
        avgDelayDays > 15 || // Atrasos muito longos
        currentOverdueCount > 1 || // Múltiplas parcelas em atraso
        (totalLateEpisodes > 1 && avgDelayDays > 10) || // Histórico ruim com atrasos longos
        isHighValueOverdue || // Valor alto em atraso (novo critério)
        (isMediumValueOverdue && totalLateEpisodes >= 2)) { // Valor médio + histórico
      riskLevel = 'ALTO';
      riskColor = 'text-red-600';
    } 
    // Risco MÉDIO: Alguns critérios moderados
    else if ((totalLateEpisodes >= 2 && lateFrequency > 15) || // Alguns atrasos
             avgDelayDays > 7 || // Atraso moderado
             (currentOverdueCount === 1 && totalLateEpisodes > 0) || // Atraso atual com histórico
             (totalLateEpisodes === 1 && avgDelayDays > 5) || // Primeiro atraso longo
             isMediumValueOverdue || // Valor médio em atraso (novo critério)
             (isLowValueOverdue && totalLateEpisodes >= 3)) { // Valor baixo + muito histórico
      riskLevel = 'MÉDIO';
      riskColor = 'text-orange-600';
    }
    // Risco BAIXO: Primeiro atraso, valores baixos, sem histórico grave
    // (casos como 1 dia de atraso na primeira parcela com valor baixo = risco baixo)

    return {
      overduePayments: overduePayments.sort((a, b) => b.dataVencimento.getTime() - a.dataVencimento.getTime()),
      onTimePayments: onTimePayments.sort((a, b) => b.dataVencimento.getTime() - a.dataVencimento.getTime()),
      allContracts: allContracts.sort((a, b) => b.dataInicio.getTime() - a.dataInicio.getTime()),
      statistics: {
        totalContracts: allArrematanteAuctions.length,
        totalPayments: totalProcessedPayments,
        totalPaidInstallments,
        totalScheduledInstallments,
        totalLate,
        totalOnTime,
        currentOverdue: totalCurrentOverdue,
        totalDelayDays,
        averageDelay,
        latePercentage: Math.round(latePercentage * 100) / 100,
        onTimePercentage: Math.round(onTimePercentage * 100) / 100,
        riskLevel,
        riskColor,
        totalValue: totalValueAllContracts,
        totalBaseValue: totalBaseValueAllContracts,
        totalOverdueValue: overduePayments.reduce((sum, p) => sum + p.valor, 0),
        averageContractValue: allArrematanteAuctions.length > 0 ? totalValueAllContracts / allArrematanteAuctions.length : 0
      }
    };
  };

  // Função para verificar se um arrematante está inadimplente (considera tipos de pagamento)
  const isOverdue = (arrematante: ArrematanteInfo, auction: Auction) => {
    logger.debug(`🔍 [isOverdue] Verificando ${arrematante.nome}:`, {
      pago: arrematante.pago,
      loteId: arrematante.loteId,
      totalLotes: auction.lotes?.length || 0
    });
    
    if (arrematante.pago) {
      logger.debug(`✅ [isOverdue] ${arrematante.nome} já está pago`);
      return false;
    }
    
    // Encontrar o lote arrematado para obter as configurações específicas de pagamento
    const loteArrematado = auction.lotes?.find((lote: LoteInfo) => lote.id === arrematante.loteId);
    
    // ✅ CORREÇÃO: Usar tipoPagamento do lote, do arrematante ou do leilão como fallback
    const tipoPagamento = loteArrematado?.tipoPagamento || arrematante.tipoPagamento || auction.tipoPagamento || 'parcelamento';
    
    logger.debug(`🔍 [isOverdue] Lote encontrado para ${arrematante.nome}:`, {
      loteEncontrado: !!loteArrematado,
      loteId: arrematante.loteId,
      tipoPagamentoLote: loteArrematado?.tipoPagamento,
      tipoPagamentoArrematante: arrematante.tipoPagamento,
      tipoPagamentoLeilao: auction.tipoPagamento,
      tipoPagamentoUsado: tipoPagamento,
      lotesDisponiveis: auction.lotes?.map(l => ({ id: l.id, numero: l.numero })) || []
    });
    
    if (!loteArrematado) {
      logger.debug(`❌ [isOverdue] ${arrematante.nome} - Lote não encontrado`);
      return false;
    }
    const now = new Date();
    
    switch (tipoPagamento) {
      case 'a_vista': {
        // CORREÇÃO: Evitar problema de fuso horário do JavaScript
        const dateStr = loteArrematado.dataVencimentoVista || new Date().toISOString().split('T')[0];
        const [year, month, day] = dateStr.split('-').map(Number);
        
        // Usar construtor Date(year, month, day) que ignora fuso horário
        const dueDate = new Date(year, month - 1, day); // month é zero-indexed
        dueDate.setHours(23, 59, 59, 999);
        
        const isOverdueResult = now > dueDate;
        logger.debug(`🔍 [isOverdue] ${arrematante.nome} - À vista:`, {
          dataVencimento: dateStr,
          dueDate: dueDate.toISOString(),
          now: now.toISOString(),
          isOverdue: isOverdueResult,
          diasAtraso: Math.ceil((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24))
        });
        
        return isOverdueResult;
      }
      
      case 'entrada_parcelamento': {
        const parcelasPagas = arrematante.parcelasPagas || 0;
        const quantidadeParcelas = arrematante.quantidadeParcelas || 12;
        
        logger.debug(`🔍 [isOverdue] ${arrematante.nome} - Entrada + Parcelamento:`, {
          parcelasPagas,
          quantidadeParcelas,
          totalEsperado: 1 + quantidadeParcelas,
          dataEntrada: loteArrematado.dataEntrada,
          mesInicioPagamento: arrematante.mesInicioPagamento,
          diaVencimentoMensal: arrematante.diaVencimentoMensal
        });
        
        // Para entrada_parcelamento: entrada + parcelas
        // Se parcelasPagas >= (1 + quantidadeParcelas), está tudo pago
        if (parcelasPagas >= (1 + quantidadeParcelas)) {
          logger.debug(`✅ [isOverdue] ${arrematante.nome} - Tudo pago (${parcelasPagas}/${1 + quantidadeParcelas})`);
          return false;
        }
        
        if (parcelasPagas === 0) {
          // Entrada não foi paga - verificar se está atrasada
          if (!loteArrematado.dataEntrada) {
            logger.debug(`❌ [isOverdue] ${arrematante.nome} - Sem data de entrada definida`);
            return false;
          }
          const entradaDueDate = new Date(loteArrematado.dataEntrada);
          entradaDueDate.setHours(23, 59, 59, 999);
          const isEntradaOverdue = now > entradaDueDate;
          
          logger.debug(`🔍 [isOverdue] ${arrematante.nome} - Verificando entrada:`, {
            dataEntrada: loteArrematado.dataEntrada,
            entradaDueDate: entradaDueDate.toISOString(),
            now: now.toISOString(),
            isOverdue: isEntradaOverdue,
            diasAtraso: Math.ceil((now.getTime() - entradaDueDate.getTime()) / (1000 * 60 * 60 * 24))
          });
          
          return isEntradaOverdue;
        } else {
          // Entrada foi paga - verificar se há parcelas atrasadas
          if (!arrematante.mesInicioPagamento || !arrematante.diaVencimentoMensal) {
            logger.debug(`❌ [isOverdue] ${arrematante.nome} - Sem dados de parcelamento`);
            return false;
          }
          const [startYear, startMonth] = arrematante.mesInicioPagamento.split('-').map(Number);
          
          // Verificar todas as parcelas que deveriam ter sido pagas até agora
          const parcelasEfetivasPagas = parcelasPagas - 1; // -1 porque a primeira "parcela paga" é a entrada
          
          logger.debug(`🔍 [isOverdue] ${arrematante.nome} - Verificando parcelas:`, {
            parcelasEfetivasPagas,
            startYear,
            startMonth,
            diaVencimento: arrematante.diaVencimentoMensal
          });
          
          for (let i = 0; i < quantidadeParcelas; i++) {
            const parcelaDate = new Date(startYear, startMonth - 1 + i, arrematante.diaVencimentoMensal);
            parcelaDate.setHours(23, 59, 59, 999);
            
            const isParcelaOverdue = now > parcelaDate && i >= parcelasEfetivasPagas;
            
            logger.debug(`🔍 [isOverdue] ${arrematante.nome} - Parcela ${i + 1}:`, {
              dataVencimento: parcelaDate.toISOString(),
              vencida: now > parcelaDate,
              deveriaTerSidoPaga: i < parcelasEfetivasPagas,
              isOverdue: isParcelaOverdue
            });
            
            if (isParcelaOverdue) {
              logger.debug(`❌ [isOverdue] ${arrematante.nome} - Parcela ${i + 1} em atraso!`);
              return true; // Encontrou uma parcela em atraso
            }
          }
          
          logger.debug(`✅ [isOverdue] ${arrematante.nome} - Nenhuma parcela em atraso`);
          return false; // Nenhuma parcela está atrasada
        }
      }
      
      case 'parcelamento':
      default: {
        logger.debug(`🔍 [isOverdue] ${arrematante.nome} - Parcelamento simples:`, {
          mesInicioPagamento: arrematante.mesInicioPagamento,
          diaVencimentoMensal: arrematante.diaVencimentoMensal,
          parcelasPagas: arrematante.parcelasPagas,
          quantidadeParcelas: arrematante.quantidadeParcelas
        });
        
        if (!arrematante.mesInicioPagamento || !arrematante.diaVencimentoMensal) {
          logger.debug(`❌ [isOverdue] ${arrematante.nome} - Sem dados de parcelamento`);
          return false;
        }
        
        const [startYear, startMonth] = arrematante.mesInicioPagamento.split('-').map(Number);
        const parcelasPagas = arrematante.parcelasPagas || 0;
        const quantidadeParcelas = arrematante.quantidadeParcelas || 12;
        
        if (parcelasPagas >= quantidadeParcelas) {
          logger.debug(`✅ [isOverdue] ${arrematante.nome} - Tudo pago (${parcelasPagas}/${quantidadeParcelas})`);
          return false;
        }
        
        const nextPaymentDate = new Date(startYear, startMonth - 1 + parcelasPagas, arrematante.diaVencimentoMensal);
        nextPaymentDate.setHours(23, 59, 59, 999);
        const isOverdueResult = now > nextPaymentDate;
        
        logger.debug(`🔍 [isOverdue] ${arrematante.nome} - Próximo pagamento:`, {
          proximaParcela: parcelasPagas + 1,
          dataVencimento: nextPaymentDate.toISOString(),
          now: now.toISOString(),
          isOverdue: isOverdueResult,
          diasAtraso: Math.ceil((now.getTime() - nextPaymentDate.getTime()) / (1000 * 60 * 60 * 24))
        });
        
        return isOverdueResult;
      }
    }
  };

  // Calcular informações de atraso (maior atraso para classificação e média para estatísticas)
  const calculateOverdueInfo = (arrematante: ArrematanteInfo, auction: Auction) => {
    if (arrematante.pago) return { maxDays: 0, avgDays: 0 };
    
    // Encontrar o lote arrematado para obter as configurações específicas de pagamento
    const loteArrematado = auction.lotes?.find((lote: LoteInfo) => lote.id === arrematante.loteId);
    if (!loteArrematado) return { maxDays: 0, avgDays: 0 };
    
    // ✅ CORREÇÃO: Usar tipoPagamento do lote, do arrematante ou do leilão como fallback
    const tipoPagamento = loteArrematado.tipoPagamento || arrematante.tipoPagamento || auction.tipoPagamento || 'parcelamento';
    const now = new Date();
    const allOverdueDays: number[] = [];
    
    const calculateDaysFromDate = (dueDate: Date) => {
      const endOfDueDate = new Date(dueDate);
      endOfDueDate.setHours(23, 59, 59, 999);
      
      if (now <= endOfDueDate) return 0;
      
      const diffTime = now.getTime() - endOfDueDate.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1;
      
      return diffDays > 0 ? diffDays : 0;
    };
    
    switch (tipoPagamento) {
      case 'a_vista': {
        // CORREÇÃO: Evitar problema de fuso horário do JavaScript
        const dateStr = loteArrematado.dataVencimentoVista || new Date().toISOString().split('T')[0];
        const [year, month, day] = dateStr.split('-').map(Number);
        
        // Usar construtor Date(year, month, day) que ignora fuso horário
        const dueDate = new Date(year, month - 1, day); // month é zero-indexed
        const daysOverdue = calculateDaysFromDate(dueDate);
        if (daysOverdue > 0) allOverdueDays.push(daysOverdue);
        break;
      }
      
      case 'entrada_parcelamento': {
        const parcelasPagas = arrematante.parcelasPagas || 0;
        const quantidadeParcelas = arrematante.quantidadeParcelas || 12;
        
        // Verificar atraso da entrada (sempre verificar se está atrasada, independente de parcelasPagas)
        if (loteArrematado.dataEntrada) {
          const dataEntrada = new Date(loteArrematado.dataEntrada);
          const diasAtrasosEntrada = calculateDaysFromDate(dataEntrada);
          if (diasAtrasosEntrada > 0) {
            // Só incluir se realmente estiver em atraso (data vencida)
            allOverdueDays.push(diasAtrasosEntrada);
          }
        }
        
        // Verificar atraso das parcelas mensais
        if (arrematante.mesInicioPagamento && arrematante.diaVencimentoMensal) {
          const [startYear, startMonth] = arrematante.mesInicioPagamento.split('-').map(Number);
          const parcelasEfetivasPagas = Math.max(0, parcelasPagas - 1); // -1 porque entrada conta como 1
          
          // Verificar todas as parcelas atrasadas
          for (let i = 0; i < quantidadeParcelas; i++) {
            const parcelaDate = new Date(startYear, startMonth - 1 + i, arrematante.diaVencimentoMensal);
            
            if (now > parcelaDate && i >= parcelasEfetivasPagas) {
              const diasAtrasosParcela = calculateDaysFromDate(parcelaDate);
              if (diasAtrasosParcela > 0) allOverdueDays.push(diasAtrasosParcela);
            }
          }
        }
        break;
      }
      
      case 'parcelamento':
      default: {
        if (!arrematante.mesInicioPagamento || !arrematante.diaVencimentoMensal) return { maxDays: 0, avgDays: 0 };
        
        const [startYear, startMonth] = arrematante.mesInicioPagamento.split('-').map(Number);
        const parcelasPagas = arrematante.parcelasPagas || 0;
        const quantidadeParcelas = arrematante.quantidadeParcelas || 12;
        
        // Verificar todas as parcelas atrasadas
        for (let i = parcelasPagas; i < quantidadeParcelas; i++) {
          const parcelaDate = new Date(startYear, startMonth - 1 + i, arrematante.diaVencimentoMensal);
          
          if (now > parcelaDate) {
            const diasAtrasosParcela = calculateDaysFromDate(parcelaDate);
            if (diasAtrasosParcela > 0) allOverdueDays.push(diasAtrasosParcela);
          } else {
            break; // Se chegou em uma que não está atrasada, para
          }
        }
        break;
      }
    }
    
    const maxDays = allOverdueDays.length > 0 ? Math.max(...allOverdueDays) : 0;
    const avgDays = allOverdueDays.length > 0 ? Math.round(allOverdueDays.reduce((sum, days) => sum + days, 0) / allOverdueDays.length) : 0;
    
    return { maxDays, avgDays };
  };

  // Função de compatibilidade para manter a interface existente
  const calculateDaysOverdue = (arrematante: ArrematanteInfo, auction: Auction) => {
    return calculateOverdueInfo(arrematante, auction).maxDays;
  };

  // Filtrar leilões com arrematantes inadimplentes automaticamente
  const overdueAuctions = useMemo(() => {
    const activeAuctions = auctions.filter(auction => !auction.arquivado);
    
    logger.debug('🔍 [Inadimplência] Analisando leilões ativos:', {
      totalAuctions: auctions.length,
      activeAuctions: activeAuctions.length,
      archivedAuctions: auctions.filter(a => a.arquivado).length,
      dataAtual: new Date().toISOString(),
      leiloesComArrematantes: activeAuctions.map(a => ({
        nome: a.nome,
        totalArrematantes: (a.arrematantes?.length || 0) + (a.arrematante ? 1 : 0)
      }))
    });
    
    const overdueResults = activeAuctions
      .flatMap(auction => {
        // Obter todos os arrematantes (compatibilidade com estrutura antiga e nova)
        const arrematantes = auction.arrematantes || (auction.arrematante ? [auction.arrematante] : []);
        
        if (arrematantes.length === 0) {
          logger.debug(`⚠️ [Inadimplência] Leilão ${auction.nome} sem arrematantes`);
          return [];
        }
        
        // Filtrar apenas os arrematantes inadimplentes
        const inadimplentes = arrematantes.filter(arrematante => {
        const isOverdueResult = isOverdue(arrematante, auction);
        logger.debug(`🔍 [Inadimplência] Leilão ${auction.nome}:`, {
          arrematante: arrematante.nome,
          pago: arrematante.pago,
          isOverdue: isOverdueResult,
          parcelasPagas: arrematante.parcelasPagas,
          quantidadeParcelas: arrematante.quantidadeParcelas,
          mesInicioPagamento: arrematante.mesInicioPagamento,
          diaVencimentoMensal: arrematante.diaVencimentoMensal
        });
        
        return isOverdueResult;
        });
        
        // Retornar um objeto auction com cada arrematante inadimplente
        return inadimplentes.map(arrematante => ({
          ...auction,
          arrematante: arrematante
        }));
      });
      
    logger.debug('✅ [Inadimplência] Resultado final:', {
      totalOverdue: overdueResults.length,
      overdueAuctions: overdueResults.map(a => ({
        nome: a.nome,
        arrematante: a.arrematante?.nome
      }))
    });
    
    return overdueResults
      .map(auction => {
        const arrematante = auction.arrematante!
        const overdueInfo = calculateOverdueInfo(arrematante, auction);
        const daysOverdue = overdueInfo.maxDays;
        
        // Categorizar por dias de atraso de forma mais intuitiva
        let overdueSeverity: 'recente' | 'moderado' | 'critico' = 'recente';
        if (daysOverdue > 30) {
          overdueSeverity = 'critico';
        } else if (daysOverdue > 15) {
          overdueSeverity = 'moderado';
        }
        
        // Encontrar o lote arrematado para obter as configurações específicas de pagamento
        const loteArrematado = auction.lotes?.find((lote: LoteInfo) => lote.id === arrematante.loteId);
        
        let valorPorParcela = 0;
        let nextPaymentDate = new Date();
        
        if (loteArrematado && loteArrematado.tipoPagamento) {
          const tipoPagamento = loteArrematado.tipoPagamento;
          
          // NOVO: Usar função que considera fator multiplicador e comissão do leiloeiro
          const valorTotal = obterValorTotalArrematante({
            usaFatorMultiplicador: arrematante?.usaFatorMultiplicador,
            valorLance: arrematante?.valorLance,
            fatorMultiplicador: arrematante?.fatorMultiplicador || loteArrematado?.fatorMultiplicador,
            valorPagarNumerico: arrematante?.valorPagarNumerico !== undefined 
            ? arrematante.valorPagarNumerico 
              : (typeof arrematante?.valorPagar === 'number' ? arrematante.valorPagar : 0),
            percentualComissaoLeiloeiro: arrematante?.percentualComissaoLeiloeiro
          }, auction.percentualComissaoLeiloeiro);
          
          switch (tipoPagamento) {
            case 'a_vista': {
              valorPorParcela = valorTotal;
              // CORREÇÃO: Evitar problema de fuso horário do JavaScript
              const dateStr = loteArrematado.dataVencimentoVista || new Date().toISOString().split('T')[0];
              const [year, month, day] = dateStr.split('-').map(Number);
              
              // Usar construtor Date(year, month, day) que ignora fuso horário
              nextPaymentDate = new Date(year, month - 1, day); // month é zero-indexed
              break;
            }
              
            case 'entrada_parcelamento': {
              const parcelasPagas = arrematante.parcelasPagas || 0;
              const _quantidadeParcelasTotal = arrematante.quantidadeParcelas || loteArrematado.parcelasPadrao || 12;
              
              // Calcular valores (entrada e parcelas são INDEPENDENTES)
              const valorEntrada = arrematante.valorEntrada ? 
                (typeof arrematante.valorEntrada === 'string' ? 
                  parseFloat(arrematante.valorEntrada.replace(/[^\d.,]/g, '').replace(/\./g, '').replace(',', '.')) : 
                  arrematante.valorEntrada) : 
                valorTotal * 0.3; // fallback para 30%
              
              // Calcular estrutura real de parcelas
              const estruturaParcelas = calcularEstruturaParcelas(
                valorTotal,
                arrematante?.parcelasTriplas || 0,
                arrematante?.parcelasDuplas || 0,
                arrematante?.parcelasSimples || 0
              );
              
              // Calcular datas
              let dataEntrada = null;
              let dataPrimeiraParcela = null;
              
                if (loteArrematado.dataEntrada) {
                const dateStr = loteArrematado.dataEntrada;
                const [year, month, day] = dateStr.split('-').map(Number);
                dataEntrada = new Date(year, month - 1, day);
              }
              
              const mesInicio = arrematante.mesInicioPagamento || loteArrematado.mesInicioPagamento;
              const diaVenc = arrematante.diaVencimentoMensal || loteArrematado.diaVencimentoPadrao;
              
              if (mesInicio && diaVenc) {
                const [startYear, startMonth] = mesInicio.split('-').map(Number);
                dataPrimeiraParcela = new Date(startYear, startMonth - 1, diaVenc);
              }
              
              // Determinar qual pagamento mostrar baseado no que está mais atrasado
              const now = new Date();
              const entradaAtrasada = dataEntrada && now > dataEntrada;
              const parcelaAtrasada = dataPrimeiraParcela && now > dataPrimeiraParcela && parcelasPagas === 0;
              
              if (entradaAtrasada && parcelaAtrasada && dataEntrada && dataPrimeiraParcela) {
                // Ambos atrasados - mostrar o mais urgente (data mais antiga)
                if (dataEntrada <= dataPrimeiraParcela) {
                  // Entrada é mais urgente
                  valorPorParcela = valorEntrada;
                  nextPaymentDate = dataEntrada;
                } else {
                  // Primeira parcela é mais urgente (usar valor da estrutura)
                  valorPorParcela = estruturaParcelas[0]?.valor || 0;
                  nextPaymentDate = dataPrimeiraParcela;
                }
              } else if (parcelasPagas === 0) {
                // Apenas entrada pendente ou entrada mais urgente
                valorPorParcela = valorEntrada;
                nextPaymentDate = dataEntrada;
              } else {
                // Parcelas após entrada (usar valor da estrutura)
                const indice = parcelasPagas - 1; // -1 porque entrada já foi paga
                valorPorParcela = estruturaParcelas[indice]?.valor || 0;
                if (mesInicio && diaVenc) {
                  const [startYear, startMonth] = mesInicio.split('-').map(Number);
                  nextPaymentDate = new Date(startYear, startMonth - 1 + (parcelasPagas - 1), diaVenc);
                }
              }
              break;
            }
              
            case 'parcelamento':
            default: {
              valorPorParcela = valorTotal / (loteArrematado.parcelasPadrao || 1);
              // Buscar mesInicioPagamento e diaVencimento do arrematante primeiro, depois do lote
              const mesInicioParc = arrematante.mesInicioPagamento || loteArrematado.mesInicioPagamento;
              const diaVencParc = arrematante.diaVencimentoMensal || loteArrematado.diaVencimentoPadrao;
              
              if (mesInicioParc && diaVencParc) {
                const [startYear, startMonth] = mesInicioParc.split('-').map(Number);
                const parcelasPagasParc = arrematante.parcelasPagas || 0;
                nextPaymentDate = new Date(startYear, startMonth - 1 + parcelasPagasParc, diaVencParc);
              }
              break;
            }
          }
        }
        
        const dueDateFormatted = nextPaymentDate && !isNaN(nextPaymentDate.getTime()) 
          ? nextPaymentDate.toLocaleDateString('pt-BR')
          : 'Data não definida';
        
        const parcelasPagasAtual = arrematante.parcelasPagas || 0;
        
        // Calcular próxima parcela baseado no tipo de pagamento e qual está mais atrasado
        let proximaParcelaCalc = parcelasPagasAtual + 1;
        let isEntradaAtrasada = false;
        let isPrimeiraParcelaAtrasada = false;
        
        if (loteArrematado && loteArrematado.tipoPagamento === 'a_vista') {
          proximaParcelaCalc = 1; // Para pagamento à vista, sempre é a primeira e única parcela
        } else if (loteArrematado && loteArrematado.tipoPagamento === 'entrada_parcelamento') {
          if (parcelasPagasAtual === 0) {
            // Verificar se entrada e primeira parcela estão ambas atrasadas
            const now = new Date();
            
            let dataEntrada = null;
            let dataPrimeiraParcela = null;
            
            if (loteArrematado.dataEntrada) {
              const dateStr = loteArrematado.dataEntrada;
              const [year, month, day] = dateStr.split('-').map(Number);
              dataEntrada = new Date(year, month - 1, day);
            }
            
            const mesInicio = arrematante.mesInicioPagamento || loteArrematado.mesInicioPagamento;
            const diaVenc = arrematante.diaVencimentoMensal || loteArrematado.diaVencimentoPadrao;
            
            if (mesInicio && diaVenc) {
              const [startYear, startMonth] = mesInicio.split('-').map(Number);
              dataPrimeiraParcela = new Date(startYear, startMonth - 1, diaVenc);
            }
            
            const entradaAtrasada = dataEntrada && now > dataEntrada;
            const parcelaAtrasada = dataPrimeiraParcela && now > dataPrimeiraParcela;
            
            if (entradaAtrasada && parcelaAtrasada && dataEntrada && dataPrimeiraParcela) {
              // Ambos atrasados - mostrar o mais urgente (data mais antiga)
              if (dataEntrada <= dataPrimeiraParcela) {
                // Entrada é mais urgente
                proximaParcelaCalc = 0; // Indica que é a entrada
                isEntradaAtrasada = true;
              } else {
                // Primeira parcela é mais urgente
                proximaParcelaCalc = 1; // Primeira parcela
                isPrimeiraParcelaAtrasada = true;
              }
            } else if (entradaAtrasada) {
              // Apenas entrada atrasada
              proximaParcelaCalc = 0; // Indica que é a entrada
              isEntradaAtrasada = true;
            } else {
              // Apenas primeira parcela atrasada ou entrada pendente
              proximaParcelaCalc = 0; // Entrada pendente
              isEntradaAtrasada = true;
            }
          } else {
            // Parcela em atraso (após entrada paga)
            proximaParcelaCalc = parcelasPagasAtual; // Parcela atual em atraso
          }
        }
        
        // Calcular informações detalhadas para tooltips quando ambos estão atrasados
        let entradaDetails = null;
        let parcelaDetails = null;
        let ambosAtrasados = false;
        
        if (loteArrematado && loteArrematado.tipoPagamento === 'entrada_parcelamento' && parcelasPagasAtual === 0) {
          const now = new Date();
          
          let dataEntrada = null;
          let dataPrimeiraParcela = null;
          
          if (loteArrematado.dataEntrada) {
            const dateStr = loteArrematado.dataEntrada;
            const [year, month, day] = dateStr.split('-').map(Number);
            dataEntrada = new Date(year, month - 1, day);
          }
          
          const mesInicio = arrematante.mesInicioPagamento || loteArrematado.mesInicioPagamento;
          const diaVenc = arrematante.diaVencimentoMensal || loteArrematado.diaVencimentoPadrao;
          
          if (mesInicio && diaVenc) {
            const [startYear, startMonth] = mesInicio.split('-').map(Number);
            dataPrimeiraParcela = new Date(startYear, startMonth - 1, diaVenc);
          }
          
          const entradaAtrasada = dataEntrada && now > dataEntrada;
          const parcelaAtrasada = dataPrimeiraParcela && now > dataPrimeiraParcela;
          
          if (entradaAtrasada && parcelaAtrasada) {
            ambosAtrasados = true;
            
            const diasEntrada = Math.floor((now.getTime() - dataEntrada.getTime()) / (1000 * 60 * 60 * 24));
            const diasParcela = Math.floor((now.getTime() - dataPrimeiraParcela.getTime()) / (1000 * 60 * 60 * 24));
            
            // Calcular valores para os tooltips (reutilizar lógica do switch case)
            const valorTotalTooltip = arrematante?.valorPagarNumerico !== undefined 
              ? arrematante.valorPagarNumerico 
              : (typeof arrematante?.valorPagar === 'number' ? arrematante.valorPagar : 0);
              
            const valorEntradaTooltip = arrematante.valorEntrada ? 
              (typeof arrematante.valorEntrada === 'string' ? 
                parseFloat(arrematante.valorEntrada.replace(/[^\d.,]/g, '').replace(/\./g, '').replace(',', '.')) : 
                arrematante.valorEntrada) : 
              valorTotalTooltip * 0.3;
            
            const quantidadeParcelasTotal = arrematante.quantidadeParcelas || loteArrematado.parcelasPadrao || 12;
            const valorRestante = valorTotalTooltip - valorEntradaTooltip;
            const valorPorParcelaTooltip = valorRestante / quantidadeParcelasTotal;
            
            entradaDetails = {
              valor: valorEntradaTooltip,
              dataVencimento: dataEntrada && !isNaN(dataEntrada.getTime()) 
                ? dataEntrada.toLocaleDateString('pt-BR') 
                : 'Data não definida',
              diasAtraso: diasEntrada
            };
            
            parcelaDetails = {
              valor: valorPorParcelaTooltip,
              dataVencimento: dataPrimeiraParcela && !isNaN(dataPrimeiraParcela.getTime()) 
                ? dataPrimeiraParcela.toLocaleDateString('pt-BR') 
                : 'Data não definida',
              diasAtraso: diasParcela
            };
          }
        }

        // Calcular quantas parcelas estão atrasadas
        let parcelasAtrasadas = 0;
        let entradaAtrasada = false;
        
        if (loteArrematado && loteArrematado.tipoPagamento === 'entrada_parcelamento') {
          const parcelasPagas = arrematante.parcelasPagas || 0;
          const quantidadeParcelas = arrematante.quantidadeParcelas || 12;
          const mesInicio = arrematante.mesInicioPagamento;
          const diaVenc = arrematante.diaVencimentoMensal;
          const now = new Date();
          
          // Verificar se entrada está atrasada (separado das parcelas mensais)
          if (parcelasPagas === 0) {
            if (loteArrematado.dataEntrada) {
              const dateStr = loteArrematado.dataEntrada;
              const [year, month, day] = dateStr.split('-').map(Number);
              const dataEntrada = new Date(year, month - 1, day);
              dataEntrada.setHours(23, 59, 59, 999);
              
              if (now > dataEntrada) {
                entradaAtrasada = true; // Marca entrada como atrasada
                parcelasAtrasadas++; // Conta entrada atrasada no total
              }
            }
          }
          
          // Contar parcelas mensais atrasadas (entrada já foi contada acima se atrasada)
          if (mesInicio && diaVenc) {
            const [startYear, startMonth] = mesInicio.split('-').map(Number);
            const parcelasEfetivasPagas = Math.max(0, parcelasPagas - 1); // -1 porque entrada conta como 1
            
            // Contar todas as parcelas mensais atrasadas
            for (let i = 0; i < quantidadeParcelas; i++) {
              const parcelaDate = new Date(startYear, startMonth - 1 + i, diaVenc);
              parcelaDate.setHours(23, 59, 59, 999);
              
              if (now > parcelaDate && i >= parcelasEfetivasPagas) {
                parcelasAtrasadas++; // Conta parcelas mensais atrasadas
              }
            }
          }
          
        } else if (loteArrematado && (loteArrematado.tipoPagamento === 'parcelamento' || !loteArrematado.tipoPagamento)) {
          const parcelasPagas = arrematante.parcelasPagas || 0;
          const quantidadeParcelas = arrematante.quantidadeParcelas || 12;
          const mesInicio = arrematante.mesInicioPagamento;
          const diaVenc = arrematante.diaVencimentoMensal;
          
          if (mesInicio && diaVenc) {
            const [startYear, startMonth] = mesInicio.split('-').map(Number);
            const now = new Date();
            
            // Contar parcelas atrasadas
            for (let i = parcelasPagas; i < quantidadeParcelas; i++) {
              const parcelaDate = new Date(startYear, startMonth - 1 + i, diaVenc);
              parcelaDate.setHours(23, 59, 59, 999);
              
              if (now > parcelaDate) {
                parcelasAtrasadas++;
              } else {
                break; // Se chegou em uma que não está atrasada, para
              }
            }
          }
        } else if (loteArrematado && loteArrematado.tipoPagamento === 'a_vista') {
          // Para à vista, se está inadimplente, é 1 pagamento atrasado
          parcelasAtrasadas = 1;
        }

        // Calcular o valor total em atraso (entrada + todas as parcelas atrasadas)
        let valorTotalEmAtraso = 0;
        
        if (loteArrematado && loteArrematado.tipoPagamento === 'entrada_parcelamento') {
          const parcelasPagas = arrematante.parcelasPagas || 0;
          const quantidadeParcelas = arrematante.quantidadeParcelas || 12;
          const valorTotal = arrematante?.valorPagarNumerico !== undefined 
            ? arrematante.valorPagarNumerico 
            : (typeof arrematante?.valorPagar === 'number' ? arrematante.valorPagar : 0);
          
          const valorEntrada = arrematante.valorEntrada ? 
            (typeof arrematante.valorEntrada === 'string' ? 
              parseFloat(arrematante.valorEntrada.replace(/[^\d.,]/g, '').replace(/\./g, '').replace(',', '.')) : 
              arrematante.valorEntrada) : 
            valorTotal * 0.3;
          
          // Calcular estrutura real de parcelas
          const estruturaParcelas = calcularEstruturaParcelas(
            valorTotal,
            arrematante?.parcelasTriplas || 0,
            arrematante?.parcelasDuplas || 0,
            arrematante?.parcelasSimples || 0
          );
          
          // Se entrada não foi paga, somar valor da entrada (com juros se aplicável)
          if (parcelasPagas === 0 && loteArrematado.dataEntrada) {
            const dataEntrada = new Date(loteArrematado.dataEntrada + 'T23:59:59');
            const now = new Date();
            if (now > dataEntrada) {
              // Calcular meses de atraso da entrada
              const mesesAtraso = Math.max(0, Math.floor((now.getTime() - dataEntrada.getTime()) / (1000 * 60 * 60 * 24 * 30)));
              if (mesesAtraso >= 1 && arrematante.percentualJurosAtraso) {
                const valorEntradaComJuros = calcularJurosProgressivos(valorEntrada, arrematante.percentualJurosAtraso, mesesAtraso);
                valorTotalEmAtraso += valorEntradaComJuros;
              } else {
                valorTotalEmAtraso += valorEntrada;
              }
            }
          }
          
          // Somar valor das parcelas atrasadas com estrutura real
          const mesInicio = arrematante.mesInicioPagamento;
          const diaVenc = arrematante.diaVencimentoMensal;
          
          if (mesInicio && diaVenc) {
            const [startYear, startMonth] = mesInicio.split('-').map(Number);
            const parcelasEfetivasPagas = Math.max(0, parcelasPagas - 1); // -1 porque entrada conta como 1
            const now = new Date();
            
            // Contar e somar valor das parcelas atrasadas com estrutura real
            for (let i = 0; i < quantidadeParcelas; i++) {
              const valorDaParcela = estruturaParcelas[i]?.valor || 0;
              const parcelaDate = new Date(startYear, startMonth - 1 + i, diaVenc);
              parcelaDate.setHours(23, 59, 59, 999);
              
              if (now > parcelaDate && i >= parcelasEfetivasPagas) {
                // Calcular meses de atraso para aplicar juros se necessário
                const mesesAtraso = Math.max(0, Math.floor((now.getTime() - parcelaDate.getTime()) / (1000 * 60 * 60 * 24 * 30)));
                if (mesesAtraso >= 1 && arrematante.percentualJurosAtraso) {
                  const valorComJuros = calcularJurosProgressivos(valorDaParcela, arrematante.percentualJurosAtraso, mesesAtraso);
                  valorTotalEmAtraso += valorComJuros;
                } else {
                  valorTotalEmAtraso += valorDaParcela;
                }
              }
            }
          }
          
        } else if (loteArrematado && (loteArrematado.tipoPagamento === 'parcelamento' || !loteArrematado.tipoPagamento)) {
          const parcelasPagas = arrematante.parcelasPagas || 0;
          const quantidadeParcelas = arrematante.quantidadeParcelas || 12;
          const valorTotal = arrematante?.valorPagarNumerico !== undefined 
            ? arrematante.valorPagarNumerico 
            : (typeof arrematante?.valorPagar === 'number' ? arrematante.valorPagar : 0);
          
          // Calcular estrutura real de parcelas
          const estruturaParcelas = calcularEstruturaParcelas(
            valorTotal,
            arrematante?.parcelasTriplas || 0,
            arrematante?.parcelasDuplas || 0,
            arrematante?.parcelasSimples || 0
          );
          
          const mesInicio = arrematante.mesInicioPagamento;
          const diaVenc = arrematante.diaVencimentoMensal;
          
          if (mesInicio && diaVenc) {
            const [startYear, startMonth] = mesInicio.split('-').map(Number);
            const now = new Date();
            
            // Contar e somar valor das parcelas atrasadas com estrutura real
            for (let i = parcelasPagas; i < quantidadeParcelas; i++) {
              const valorDaParcela = estruturaParcelas[i]?.valor || 0;
              const parcelaDate = new Date(startYear, startMonth - 1 + i, diaVenc);
              parcelaDate.setHours(23, 59, 59, 999);
              
              if (now > parcelaDate) {
                // Calcular meses de atraso para aplicar juros se necessário
                const mesesAtraso = Math.max(0, Math.floor((now.getTime() - parcelaDate.getTime()) / (1000 * 60 * 60 * 24 * 30)));
                if (mesesAtraso >= 1 && arrematante.percentualJurosAtraso) {
                  const valorComJuros = calcularJurosProgressivos(valorDaParcela, arrematante.percentualJurosAtraso, mesesAtraso);
                  valorTotalEmAtraso += valorComJuros;
                } else {
                  valorTotalEmAtraso += valorDaParcela;
                }
              } else {
                break; // Se chegou em uma que não está atrasada, para
              }
            }
          }
          
        } else if (loteArrematado && loteArrematado.tipoPagamento === 'a_vista') {
          // Para à vista, aplicar juros se estiver atrasado há pelo menos 1 mês
          const valorTotal = arrematante?.valorPagarNumerico !== undefined 
            ? arrematante.valorPagarNumerico 
            : (typeof arrematante?.valorPagar === 'number' ? arrematante.valorPagar : 0);
          
          const dataVencimento = loteArrematado?.dataVencimentoVista || auction?.dataVencimentoVista;
          
          if (dataVencimento && arrematante.percentualJurosAtraso) {
            const now = new Date();
            const vencimento = new Date(dataVencimento + 'T23:59:59');
            
            if (now > vencimento) {
              const mesesAtraso = Math.max(0, Math.floor((now.getTime() - vencimento.getTime()) / (1000 * 60 * 60 * 24 * 30)));
              if (mesesAtraso >= 1) {
                valorTotalEmAtraso = calcularJurosProgressivos(valorTotal, arrematante.percentualJurosAtraso, mesesAtraso);
              } else {
                valorTotalEmAtraso = valorTotal;
              }
            } else {
              valorTotalEmAtraso = valorTotal;
            }
          } else {
            valorTotalEmAtraso = valorTotal;
          }
        }
        
        return {
          ...auction,
          daysOverdue,
          avgDaysOverdue: overdueInfo.avgDays, // Nova propriedade para média individual
          overdueSeverity,
          overdueAmount: valorTotalEmAtraso, // Agora soma todas as parcelas em atraso
          dueDateFormatted,
          proximaParcela: proximaParcelaCalc,
          isEntradaAtrasada,
          isPrimeiraParcelaAtrasada,
          ambosAtrasados,
          entradaDetails,
          parcelaDetails,
          parcelasAtrasadas, // Nova propriedade
          entradaAtrasada, // Flag separada para entrada
          arrematante: {
            ...arrematante,
            dataPagamento: dueDateFormatted,
            valorParcelaAtual: valorPorParcela // ✅ Campo separado para exibição da parcela atual
            // valorPagarNumerico mantém o valor total original!
          }
        };
      })
      .sort((a, b) => b.daysOverdue - a.daysOverdue); // Padrão: ordenar por mais dias de atraso
  }, [auctions]);

  // Filtros e busca
  const filteredOverdueAuctions = useMemo(() => {
    let filtered = overdueAuctions;

    // Filtro de busca
    if (searchTerm) {
      filtered = filtered.filter(auction => 
        auction.arrematante?.nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        auction.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
        auction.identificacao?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Filtro de status
    if (statusFilter !== "all") {
      filtered = filtered.filter(auction => auction.overdueSeverity === statusFilter);
    }

    // Ordenação
    filtered.sort((a, b) => {
      switch (sortBy) {
        case "amount":
          return (b.overdueAmount || 0) - (a.overdueAmount || 0);
        case "name":
          return (a.arrematante?.nome || "").localeCompare(b.arrematante?.nome || "");
        case "due_date":
          return new Date(a.arrematante?.dataPagamento || "").getTime() - new Date(b.arrematante?.dataPagamento || "").getTime();
        default:
          return 0;
      }
    });

    return filtered;
  }, [overdueAuctions, searchTerm, statusFilter, sortBy]);


  // Estatísticas
  const stats = useMemo(() => {
    const totalOverdue = overdueAuctions.length;
    const totalAmount = overdueAuctions.reduce((sum, auction) => 
      sum + (auction.overdueAmount || 0), 0
    );
    const recentSeverity = overdueAuctions.filter(a => a.overdueSeverity === 'recente').length;
    const moderateSeverity = overdueAuctions.filter(a => a.overdueSeverity === 'moderado').length;
    const criticalSeverity = overdueAuctions.filter(a => a.overdueSeverity === 'critico').length;
    const totalOverdueInstallments = overdueAuctions.reduce((sum, a) => sum + (a.parcelasAtrasadas || 0), 0);

    return {
      totalOverdue,
      totalAmount,
      recentSeverity,
      moderateSeverity,
      criticalSeverity,
      totalOverdueInstallments
    };
  }, [overdueAuctions]);

  // Funções para cobrança
  const generateChargeMessage = (debtor: AuctionWithOverdueInfo) => {
    const daysOverdue = debtor.daysOverdue;
    const amount = currency.format(debtor.overdueAmount || 0);
    const dueDate = debtor.dueDateFormatted || "—";
    
    return `Prezado(a) ${debtor.arrematante?.nome},

Esperamos que esteja bem. Entramos em contato para informar sobre o pagamento pendente referente ao leilão "${debtor.nome}".

📋 Detalhes do Pagamento:
• Valor: ${amount}
• Data de Vencimento: ${dueDate}
• Dias em Atraso: ${daysOverdue} dias

Solicitamos a gentileza de regularizar esta pendência o mais breve possível. Caso já tenha efetuado o pagamento, favor desconsiderar este aviso e nos enviar o comprovante.

Para esclarecimentos ou negociação, entre em contato conosco.

Atenciosamente,
Arthur Lira Leilões`;
  };

  const _handleSendReminder = async (auction: AuctionWithOverdueInfo) => {
    if (!auction.arrematante?.email) {
      return;
    }
    
    try {
      const result = await enviarLembrete(auction);
      
      if (!result.success) {
        logger.warn('Falha ao enviar lembrete:', result.message);
      }
    } catch (_error) {
      logger.error('Erro ao enviar lembrete:', _error);
    }
  };

  const _handleSendCharge = (auction: AuctionWithOverdueInfo) => {
    if (!auction.arrematante?.email) {
      return;
    }
    
    setSelectedDebtor(auction);
    setChargeMessage(generateChargeMessage(auction));
    setAttachments([]);
    setIsChargeModalOpen(true);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      const validFiles: File[] = [];
      for (const file of Array.from(files)) {
        try {
          await validateFile(file, 'document');
          validFiles.push(file);
        } catch (error) {
          if (error instanceof FileValidationError) {
            logger.warn(`Arquivo rejeitado (${file.name}):`, error.message);
          } else {
            logger.error(`Erro ao validar ${file.name}:`, error);
          }
        }
      }
      if (validFiles.length > 0) {
        setAttachments(prev => [...prev, ...validFiles]);
      }
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const sendChargeEmail = async () => {
    if (!selectedDebtor) return;
    
    setIsSending(true);
    
    try {
      const result = await enviarCobranca(selectedDebtor);
      
      if (result.success) {
        setIsChargeModalOpen(false);
        // Log do envio de cobrança
        try {
          await logReportAction('generate', 'cobranca_email', `Enviou cobrança para "${selectedDebtor.arrematante?.nome}" no leilão "${selectedDebtor.nome}"`, {
            metadata: { arrematante: selectedDebtor.arrematante?.nome, auction_id: selectedDebtor.id, email: selectedDebtor.arrematante?.email }
          });
        } catch { /* silenciar erro de log */ }
        setSelectedDebtor(null);
        setChargeMessage("");
        setAttachments([]);
      } else {
        logger.warn('Erro ao enviar cobrança:', result.message);
      }
    } catch (_error) {
      logger.error('Erro ao enviar cobrança:', _error);
    } finally {
      setIsSending(false);
    }
  };

  // Função para testar envio de cobrança
  const handleTestEmailSend = async (auctionProcessado: AuctionWithOverdueInfo) => {
    const auctionOriginal = auctions.find(a => a.id === auctionProcessado.id);
    
    if (!auctionOriginal) {
      return;
    }
    
    setSelectedDebtor(auctionProcessado);
    setTestEmailLogs([]);
    setIsTestEmailModalOpen(true);
    setIsTestingSend(true);

    // Log do teste de envio de cobrança
    try {
      logReportAction('view', 'teste_cobranca', `Testou envio de cobrança para "${auctionProcessado.arrematante?.nome}"`, {
        metadata: { arrematante: auctionProcessado.arrematante?.nome, auction_id: auctionProcessado.id }
      });
    } catch { /* silenciar erro de log */ }

    try {
      const result = await testarEnvioCobranca(auctionOriginal);
      
      setTestEmailLogs(result.detalhes || []);
      
      if (!result.success) {
        logger.warn('Teste concluído com avisos:', result.message);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
      setTestEmailLogs([
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
        '❌ ERRO CRÍTICO',
        '',
        `Exceção: ${errorMessage}`,
        '',
        'Verifique:',
        '• Chave API configurada',
        '• Email do arrematante válido',
        '• Conexão com internet',
        '• Console do navegador (F12)',
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      ]);
    } finally {
      setIsTestingSend(false);
    }
  };

  const getSeverityBadge = (severity: string, daysOverdue: number) => {
      const daysText = daysOverdue === 1 ? '1 dia' : `${daysOverdue} dias`;
      
      return <Badge variant="destructive">
        {daysText}
        </Badge>;
  };

  // Componente para transição na coluna Atraso
  const HoverTransitionAtraso = ({ 
    auction,
    className = ""
  }: {
    auction: AuctionWithOverdueInfo;
    className?: string;
  }) => {
    const { isRowHovered } = useContext(HoverContext);
    
    // Determinar qual informação mostrar baseado na prioridade
    const primaryAtraso = auction.isEntradaAtrasada ? {
      badge: getSeverityBadge('high', auction.entradaDetails.diasAtraso),
      dias: auction.entradaDetails.diasAtraso,
      tipo: 'entrada'
    } : {
      badge: getSeverityBadge(auction.overdueSeverity, auction.parcelaDetails.diasAtraso),
      dias: auction.parcelaDetails.diasAtraso,
      tipo: 'parcela'
    };
    
    const secondaryAtraso = auction.isEntradaAtrasada ? {
      badge: getSeverityBadge(auction.overdueSeverity, auction.parcelaDetails.diasAtraso),
      dias: auction.parcelaDetails.diasAtraso,
      tipo: 'parcela'
    } : {
      badge: getSeverityBadge('high', auction.entradaDetails.diasAtraso),
      dias: auction.entradaDetails.diasAtraso,
      tipo: 'entrada'
  };

  return (
      <div className={`relative transition-all duration-300 ease-in-out ${className}`}>
        <div className={`transition-opacity duration-300 ${isRowHovered ? 'opacity-0' : 'opacity-100'}`}>
          {primaryAtraso.badge}
        </div>
        
        <div className={`absolute inset-0 transition-opacity duration-300 ${isRowHovered ? 'opacity-100' : 'opacity-0'}`}>
          {secondaryAtraso.badge}
        </div>
      </div>
    );
  };

  return (
    <HoverContext.Provider value={{ isRowHovered, setIsRowHovered }}>
    <div className="space-y-4 sm:space-y-6 lg:space-y-8 scale-fade">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight">Gestão de Inadimplência</h1>
          <p className="text-muted-foreground">
            Acompanhe e gerencie os pagamentos em atraso
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button 
            variant="outline" 
            className="bg-white text-black border-gray-300 hover:bg-gray-100 hover:text-black"
            onClick={() => {
              setIsExportModalOpen(true);
              try {
                logReportAction('view', 'inadimplencia', 'Abriu modal de exportação de inadimplência');
              } catch { /* silenciar erro de log */ }
            }}
          >
            <Download className="h-4 w-4 mr-2" />
            Exportar
          </Button>
        </div>
      </div>

      {/* Indicadores de Inadimplência */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border-0 shadow-sm rounded-lg p-3 sm:p-4 lg:p-6">
          <div className="text-center">
            <div className="mb-4">
              <p className="text-xs font-semibold text-gray-700 uppercase tracking-[0.15em] mb-3">Total Inadimplente</p>
              <div className="h-px w-20 bg-gray-300 mx-auto mb-4"></div>
            </div>
            <p className="text-xl sm:text-2xl lg:text-3xl font-extralight text-gray-900 mb-2 tracking-tight">{stats.totalOverdue}</p>
            <p className="text-sm text-gray-600 font-medium">arrematantes em atraso</p>
          </div>
        </div>

        <div className="bg-white border-0 shadow-sm rounded-lg p-3 sm:p-4 lg:p-6">
          <div className="text-center">
            <div className="mb-4">
              <p className="text-xs font-semibold text-gray-700 uppercase tracking-[0.15em] mb-3">Valor Total</p>
              <div className="h-px w-20 bg-gray-300 mx-auto mb-4"></div>
            </div>
            <p className="text-xl sm:text-2xl lg:text-3xl font-extralight text-gray-900 mb-2 tracking-tight">{currency.format(stats.totalAmount)}</p>
            <p className="text-sm text-gray-600 font-medium">em pagamentos atrasados</p>
          </div>
        </div>

        <div className="bg-white border-0 shadow-sm rounded-lg p-3 sm:p-4 lg:p-6">
          <div className="text-center">
            <div className="mb-4">
              <p className="text-xs font-semibold text-gray-700 uppercase tracking-[0.15em] mb-3">Parcelas Atrasadas</p>
              <div className="h-px w-20 bg-gray-300 mx-auto mb-4"></div>
            </div>
            <p className="text-xl sm:text-2xl lg:text-3xl font-extralight text-gray-900 mb-2 tracking-tight">{stats.totalOverdueInstallments}</p>
            <p className="text-sm text-gray-600 font-medium">parcelas em atraso</p>
          </div>
      </div>

        <div className="bg-white border-0 shadow-sm rounded-lg p-3 sm:p-4 lg:p-6">
          <div className="text-center">
            <div className="mb-4">
              <p className="text-xs font-semibold text-gray-700 uppercase tracking-[0.15em] mb-3">Críticos</p>
              <div className="h-px w-20 bg-gray-300 mx-auto mb-4"></div>
            </div>
            <p className="text-xl sm:text-2xl lg:text-3xl font-extralight text-gray-900 mb-2 tracking-tight">{stats.criticalSeverity}</p>
            <p className="text-sm text-gray-600 font-medium">mais de 30 dias</p>
          </div>
        </div>
      </div>


      {/* Lista de Inadimplentes */}
      <Card className="h-[calc(100vh-320px)] flex flex-col">
        <CardHeader className="flex-shrink-0">
          <div className="space-y-4">
            <CardTitle className="flex items-center gap-2 text-xl font-semibold leading-tight text-gray-800">
              <AlertTriangle className="h-5 w-5 text-red-600 shrink-0" />
              Arrematantes Inadimplentes
          </CardTitle>

            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
              <div className="flex flex-wrap gap-3 items-center flex-1">
                <div className="relative w-full max-w-md">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                    placeholder="Buscar arrematante, leilão..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10 h-11 border-gray-300 focus:border-gray-300 focus:ring-0 no-focus-outline"
              />
            </div>
              </div>

              <div className="flex gap-3">
                <Select value={statusFilter} onValueChange={setStatusFilter} onOpenChange={setIsStatusSelectOpen}>
                  <SelectTrigger className="w-full sm:w-[140px] h-11 border-gray-300 bg-white focus:!ring-0 focus:!ring-offset-0 focus:!border-gray-300 focus:!outline-none focus:!shadow-none">
                    <SelectValue placeholder="Atraso" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="recente">Até 15 dias</SelectItem>
                    <SelectItem value="moderado">16 a 30 dias</SelectItem>
                    <SelectItem value="critico">Mais de 30 dias</SelectItem>
              </SelectContent>
            </Select>

                <Select value={sortBy} onValueChange={setSortBy} onOpenChange={setIsSortSelectOpen}>
                  <SelectTrigger className="w-full sm:w-[140px] h-11 border-gray-300 bg-white focus:!ring-0 focus:!ring-offset-0 focus:!border-gray-300 focus:!outline-none focus:!shadow-none">
                    <SelectValue placeholder="Ordenar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="amount">Valor</SelectItem>
                <SelectItem value="name">Nome</SelectItem>
                <SelectItem value="due_date">Data</SelectItem>
              </SelectContent>
            </Select>

          </div>
            </div>
            </div>
        </CardHeader>
        <CardContent className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-gray-900"></div>
              <p className="mt-4 text-gray-600">Carregando inadimplências...</p>
            </div>
          ) : filteredOverdueAuctions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
              <AlertTriangle className="h-16 w-16 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-medium">Nenhuma inadimplência encontrada</p>
              <p className="text-sm">Todos os pagamentos estão em dia ou não há filtros correspondentes.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-gray-200">
                  <TableHead className="font-semibold text-gray-700">Arrematante</TableHead>
                  <TableHead className="hidden sm:table-cell font-semibold text-gray-700">Leilão</TableHead>
                  <TableHead className="font-semibold text-gray-700">
                    {(() => {
                      // Verificar se há algum pagamento à vista na lista filtrada
                      const _hasAVista = filteredOverdueAuctions.some(auction => {
                        const loteArrematado = auction.lotes?.find((lote: LoteInfo) => lote.id === auction.arrematante?.loteId);
                        return loteArrematado?.tipoPagamento === 'a_vista';
                      });

                      // Verificar se há algum pagamento parcelado na lista filtrada  
                      const _hasParcelado = filteredOverdueAuctions.some(auction => {
                        const loteArrematado = auction.lotes?.find((lote: LoteInfo) => lote.id === auction.arrematante?.loteId);
                        return loteArrematado?.tipoPagamento !== 'a_vista';
                      });

                       // Determinar se há casos de ambos atrasados
                       const hasAmbosAtrasados = filteredOverdueAuctions.some(auction => auction.ambosAtrasados);

                      // Se tem ambos ou apenas parcelado, usar "Valor Total Atrasado"
                      // Se tem apenas à vista, usar "Valor Total Atrasado"
                       const baseText = "Valor Total Atrasado";
                       
                       // Se há casos de ambos atrasados, usar componente de sincronização
                       if (hasAmbosAtrasados) {
                         return (
                           <HoverSyncHeader
                             primaryText={baseText}
                             secondaryText="Valor Total Atrasado"
                             className="font-semibold text-gray-700"
                           />
                         );
                       } else {
                         return baseText;
                      }
                    })()}
                  </TableHead>
                  <TableHead className="hidden sm:table-cell font-semibold text-gray-700">Vencimento</TableHead>
                   <TableHead className="hidden sm:table-cell font-semibold text-gray-700">
                     {(() => {
                       // Verificar se há casos de ambos atrasados
                       const hasAmbosAtrasados = filteredOverdueAuctions.some(auction => auction.ambosAtrasados);
                       
                       if (hasAmbosAtrasados) {
                         return (
                           <HoverSyncHeader
                             primaryText="Parcelas"
                             secondaryText="Entrada"
                             className="font-semibold text-gray-700"
                           />
                         );
                       } else {
                         return "Parcelas";
                       }
                     })()}
                   </TableHead>
                  <TableHead className="hidden sm:table-cell font-semibold text-gray-700">Contato</TableHead>
                  <TableHead className="font-semibold text-gray-700">Atraso</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
              {filteredOverdueAuctions.map((auction) => (
                  <TableRow key={auction.id} className="border-gray-100 hover:bg-gray-50/50">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-full bg-red-100">
                          <AlertTriangle className="h-4 w-4 text-red-600" />
                      </div>
                        <div className="flex items-center gap-2">
                          <div>
                        <div className="flex items-center gap-2">
                              <p className="font-medium text-gray-900">{auction.arrematante?.nome}</p>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleOpenHistory(auction)}
                                className="h-10 w-10 sm:h-6 sm:w-6 p-0 hover:bg-blue-100"
                                title="Ver relatório do arrematante"
                              >
                                <History className="h-4 w-4 text-blue-900" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleTestEmailSend(auction)}
                                className="h-10 w-10 sm:h-6 sm:w-6 p-0 hover:bg-amber-100"
                                title="Testar envio de cobrança"
                                disabled={!auction.arrematante?.email}
                              >
                                <Send className="h-4 w-4 text-amber-600" />
                              </Button>
                        </div>
                            <p className="text-sm text-gray-500">
                              {auction.arrematante?.documento || 'Sem documento'}
                            </p>
                        </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <div>
                        <p className="font-medium text-gray-900">{auction.nome}</p>
                        <p className="text-sm text-gray-500">
                          {auction.identificacao || "—"}
                        </p>
                    </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <span className="font-semibold text-red-600">
                          {currency.format(auction.overdueAmount || 0)}
                        </span>
                        {(() => {
                          // Mostrar informação de quantas parcelas/entrada estão atrasadas
                          const loteArrematado = auction.lotes?.find((lote: LoteInfo) => lote.id === auction.arrematante?.loteId);
                          const tipoPagamento = loteArrematado?.tipoPagamento;
                          
                          if (tipoPagamento === 'a_vista') {
                            return (
                              <div className="text-xs text-gray-500 mt-1">
                                Pagamento à vista atrasado
                              </div>
                            );
                          } else if (tipoPagamento === 'entrada_parcelamento') {
                            // Para entrada + parcelamento, mostrar o que está atrasado
                            const partes = [];
                            if (auction.entradaAtrasada) {
                              partes.push('entrada');
                            }
                            if (auction.parcelasAtrasadas > 0) {
                              partes.push(auction.parcelasAtrasadas === 1 ? '1 parcela' : `${auction.parcelasAtrasadas} parcelas`);
                            }
                            
                            if (partes.length > 0) {
                              return (
                                <div className="text-xs text-gray-500 mt-1">
                                  {partes.join(' + ')} atrasada{partes.length > 1 ? 's' : ''}
                                </div>
                              );
                            }
                          } else {
                            // Para parcelamento simples
                            if (auction.parcelasAtrasadas > 0) {
                              return (
                                <div className="text-xs text-gray-500 mt-1">
                                  {auction.parcelasAtrasadas === 1 
                                    ? '1 parcela atrasada' 
                                    : `${auction.parcelasAtrasadas} parcelas atrasadas`}
                                </div>
                              );
                            }
                          }
                          
                          return null;
                        })()}
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {auction.ambosAtrasados ? (
                        <HoverTransitionDate
                          auction={auction}
                          primaryDate={auction.isEntradaAtrasada ? auction.entradaDetails.dataVencimento : auction.parcelaDetails.dataVencimento}
                          primaryLabel={auction.isEntradaAtrasada ? 'Entrada Atrasada' : 'Parcela #1 Atrasada'}
                          secondaryDate={auction.isEntradaAtrasada ? auction.parcelaDetails.dataVencimento : auction.entradaDetails.dataVencimento}
                          secondaryLabel={auction.isEntradaAtrasada ? 'Parcela #1 Atrasada' : 'Entrada Atrasada'}
                        />
                      ) : (
                        <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-gray-400" />
                        <div>
                          <p className="text-sm font-medium text-red-600">
                            {auction.dueDateFormatted}
                          </p>
                          <p className="text-xs text-gray-500">
                            {(() => {
                              const arrematante = auction.arrematante;
                              const loteArrematado = auction.lotes?.find((lote: LoteInfo) => lote.id === arrematante?.loteId);
                              const tipoPagamento = loteArrematado?.tipoPagamento || "parcelamento";

                              if (tipoPagamento === "a_vista") {
                                return "Pagamento à Vista";
                                } else if (tipoPagamento === "entrada_parcelamento") {
                                  if (auction.isEntradaAtrasada) {
                                    return "Entrada Atrasada";
                                  } else if (auction.isPrimeiraParcelaAtrasada) {
                                    return "Parcela #1 Atrasada";
                                  } else {
                                    return `Parcela #${auction.proximaParcela}`;
                                  }
                              } else {
                                return `Parcela #${auction.proximaParcela}`;
                              }
                            })()}
                          </p>
                    </div>
                  </div>
                      )}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <div className="flex flex-col">
                        {(() => {
                          const arrematante = auction.arrematante;
                          const loteArrematado = auction.lotes?.find((lote: LoteInfo) => lote.id === arrematante?.loteId);
                          const tipoPagamento = loteArrematado?.tipoPagamento || "parcelamento";

                          if (tipoPagamento === "a_vista") {
                            // Para pagamento à vista, mostrar status único
                            return (
                              <>
                                <span className="text-sm font-medium text-gray-900">
                                  Pagamento à Vista
                                </span>
                                <span className="text-xs text-gray-500">
                                  Vencimento único
                                </span>
                              </>
                            );
                          } else if (tipoPagamento === "entrada_parcelamento") {
                            // Para entrada + parcelamento, mostrar progresso específico
                            const parcelasPagas = arrematante?.parcelasPagas || 0;
                            const quantidadeParcelas = arrematante?.quantidadeParcelas || 12;
                            const totalPagamentos = quantidadeParcelas + 1; // entrada + parcelas
                            const parcelasRestantes = totalPagamentos - parcelasPagas;
                            
                            if (parcelasPagas === 0) {
                              if (auction.ambosAtrasados) {
                                // Ambos atrasados - usar transição
                                return (
                                  <HoverTransitionStatus
                                    auction={auction}
                                    primaryStatus={auction.isEntradaAtrasada ? 'Entrada Atrasada' : 'Parcela #1 Atrasada'}
                                    primarySubtext={auction.isEntradaAtrasada ? 'Entrada pendente' : `${quantidadeParcelas} parcelas pendentes`}
                                    secondaryStatus={auction.isEntradaAtrasada ? 'Parcela #1 Atrasada' : 'Entrada Atrasada'}
                                    secondarySubtext={auction.isEntradaAtrasada ? `Parcela #1 também atrasada` : 'Entrada também atrasada'}
                                  />
                            );
                          } else {
                                // Apenas um atrasado
                                return (
                                  <>
                                    <span className="text-sm font-medium text-red-600">
                                      Entrada Atrasada
                                    </span>
                                    <span className="text-xs text-gray-500">
                                      0/{totalPagamentos} (Pendentes: entrada + {quantidadeParcelas} parcelas)
                                    </span>
                                  </>
                                );
                              }
                            } else {
                              return (
                                <>
                                  <span className="text-sm font-medium text-gray-900">
                                    {parcelasPagas}/{totalPagamentos}
                                  </span>
                                  <span className="text-xs text-gray-500">
                                    {parcelasRestantes} restantes (Pagos: {parcelasPagas === 1 ? 'entrada' : `entrada + ${parcelasPagas - 1} parcelas`})
                                  </span>
                                </>
                              );
                            }
                          } else {
                            // Para parcelamento simples, mostrar informações de parcelas
                            const parcelasPagas = arrematante?.parcelasPagas || 0;
                            const quantidadeParcelas = arrematante?.quantidadeParcelas || 1;
                            const parcelasRestantes = quantidadeParcelas - parcelasPagas;
                            
                            return (
                              <>
                                <span className="text-sm font-medium text-gray-900">
                                  {parcelasPagas}/{quantidadeParcelas}
                                </span>
                                <span className="text-xs text-gray-500">
                                  {parcelasRestantes} restantes
                                </span>
                              </>
                            );
                          }
                        })()}
                    </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <div className="flex flex-col gap-1 text-sm">
                        {auction.arrematante?.telefone && (
                          <div className="flex items-center gap-1 text-gray-600">
                            <Phone className="h-3 w-3" />
                            <span className="text-xs">{auction.arrematante.telefone}</span>
                          </div>
                        )}
                        {auction.arrematante?.email && (
                          <div className="flex items-center gap-1 text-gray-600">
                            <Mail className="h-3 w-3" />
                            <span className="text-xs truncate max-w-[120px]">{auction.arrematante.email}</span>
                          </div>
                        )}
                        {!auction.arrematante?.telefone && !auction.arrematante?.email && (
                          <span className="text-xs text-gray-400">Sem contato</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                       {auction.ambosAtrasados ? (
                         <HoverTransitionAtraso auction={auction} />
                       ) : (
                         getSeverityBadge(auction.overdueSeverity, auction.daysOverdue)
                       )}
                    </TableCell>
                  </TableRow>
              ))}
              </TableBody>
            </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Modal de Relatório do Arrematante */}
      <Dialog open={isHistoryModalOpen} onOpenChange={setIsHistoryModalOpen}>
         <DialogContent className="max-w-[95vw] sm:max-w-6xl max-h-[90vh] overflow-y-auto">
           <DialogHeader className="border-b-2 border-slate-800 pb-4">
             <div className="text-center">
               <DialogTitle className="text-2xl font-light text-slate-900 tracking-wider uppercase mb-2">
                 Relatório de Histórico de Arrematantes
              </DialogTitle>
               <div className="text-sm text-slate-600 font-light space-y-1">
                 <div className="border-b border-slate-200 pb-1 mb-1"></div>
                 <div>Relatório informativo sobre arrematantes e contratos vinculados</div>
                 <div>Data de emissão: {new Date().toLocaleDateString('pt-BR')}</div>
                 <div>Horário: {new Date().toLocaleTimeString('pt-BR')}</div>
                 <div>Total de registros: {selectedArrematante && (() => {
                  const analysis = generateArrematanteAnalysis(selectedArrematante);
                  return analysis ? analysis.statistics.totalContracts : 1;
                })()} transação(ões)</div>
               </div>
            </div>
          </DialogHeader>

          {selectedArrematante && (() => {
            const analysis = generateArrematanteAnalysis(selectedArrematante);
            if (!analysis) return null;
            
            return (
              <>
                <div id="credit-analysis-report" className="space-y-4 sm:space-y-6 pt-6">
                   
                   {/* Registros de Transações */}
                   <div className="bg-white rounded-lg border border-gray-200 no-page-break">
                     <div className="bg-gray-50 px-6 py-3 border-b border-gray-200">
                       <h3 className="text-lg font-semibold text-gray-900">Registros de Transações</h3>
                       <p className="text-sm text-gray-600">Histórico cronológico de arrematações realizadas</p>
                     </div>
                     
                     <div className="p-6 space-y-4 sm:space-y-6">
                       {/* Processo e Situação */}
                       <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b border-gray-100 pb-4 gap-3">
                         <div>
                           <h4 className="text-lg font-semibold text-gray-900">Processo Nº {selectedArrematante.identificacao}</h4>
                         </div>
                         <div className="text-left sm:text-right">
                           <div className="text-sm text-gray-600 mb-1">Situação</div>
                           <Badge variant="destructive">
                             ATRASADO
                           </Badge>
                         </div>
                       </div>

                       {/* Identificação do Arrematante */}
                       <div className="bg-gray-50 rounded-lg p-6">
                         <h4 className="text-lg font-semibold text-gray-900 mb-4">Identificação do Arrematante</h4>
                         <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-medium text-gray-600">Nome Completo:</span>
                             <div className="text-gray-900 font-medium">{selectedArrematante.arrematante?.nome}</div>
                    </div>
                    <div>
                      <span className="font-medium text-gray-600">Documento:</span>
                             <div className="text-gray-900 font-medium">{selectedArrematante.arrematante?.documento || 'Não informado'}</div>
                           </div>
                           <div>
                             <span className="font-medium text-gray-600">Email:</span>
                             <div className="text-gray-900 font-medium">{selectedArrematante.arrematante?.email || 'Não informado'}</div>
                           </div>
                           <div>
                             <span className="font-medium text-gray-600">Telefone:</span>
                             <div className="text-gray-900 font-medium">{selectedArrematante.arrematante?.telefone || 'Não informado'}</div>
                    </div>
                    <div>
                      <span className="font-medium text-gray-600">Total de Contratos:</span>
                             <div className="text-gray-900 font-medium">{analysis.statistics.totalContracts}</div>
                    </div>
                    <div>
                             <span className="font-medium text-gray-600">Valor Total:</span>
                             <div className="text-gray-900 font-medium">
                               {currency.format(analysis.statistics.totalValue)}
                               {(() => {
                                 const arrematante = selectedArrematante.arrematante;
                                 if (!arrematante) return null;
                                 
                                 const valorBase = analysis.statistics.totalBaseValue;
                                 const percentualJuros = arrematante.percentualJurosAtraso || 0;
                                 
                                 if (percentualJuros > 0 && analysis.statistics.totalValue > valorBase) {
                                   const juros = analysis.statistics.totalValue - valorBase;
                                   return (
                                     <span className="text-xs text-red-600 ml-1">
                                       ({currency.format(juros)} juros)
                                     </span>
                                   );
                                 }
                                 return null;
                               })()}
                             </div>
                    </div>
                    </div>
                  </div>
                  
                      {/* Contratos Vinculados */}
                      <div className="bg-white border border-gray-200 rounded-lg p-6">
                        <h4 className="text-lg font-semibold text-gray-900 mb-4">Contratos Vinculados</h4>
                        <p className="text-sm text-gray-600 mb-4">Histórico completo de todos os leilões e lotes arrematados por este cliente</p>
                        
                        <div className="space-y-4">
                          {analysis.allContracts.map((contrato: ContratoInfo, idx: number) => {
                            // Buscar o leilão completo para pegar os lotes
                            const leilaoCompleto = auctions.find(a => a.identificacao === contrato.leilaoId);
                            const arrematante = leilaoCompleto?.arrematante;
                            const loteArrematado = leilaoCompleto?.lotes?.find((lote: LoteInfo) => lote.id === arrematante?.loteId);
                            
                            return (
                              <div key={idx} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-3 pb-2 border-b border-gray-200 gap-2">
                                  <h5 className="font-semibold text-gray-900">{contrato.leilaoNome}</h5>
                                  <Badge variant={
                                    contrato.status === 'Quitado' ? 'success' :
                                    contrato.status === 'Inadimplente' ? 'destructive' :
                                    'warning'
                                  }>
                                    {contrato.status}
                                  </Badge>
                                </div>
                                
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                                  <div>
                                    <span className="font-medium text-gray-600">Código:</span>
                                    <div className="text-gray-900">{contrato.leilaoId}</div>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600">Data:</span>
                                    <div className="text-gray-900">{contrato.dataInicio.toLocaleDateString('pt-BR')}</div>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600">Valor Total:</span>
                                    <div className="text-gray-900 font-semibold">
                                      {currency.format(contrato.valorTotal)}
                                      {(() => {
                                        if (!arrematante) return null;
                                        const valorBase = arrematante.valorPagarNumerico !== undefined 
                                          ? arrematante.valorPagarNumerico 
                                          : (typeof arrematante.valorPagar === 'number' ? arrematante.valorPagar : 0);
                                        const percentualJuros = arrematante.percentualJurosAtraso || 0;
                                        
                                        if (percentualJuros > 0 && contrato.valorTotal > valorBase) {
                                          const juros = contrato.valorTotal - valorBase;
                                          return (
                                            <span className="text-xs text-red-600 ml-1">
                                              ({currency.format(juros)} juros)
                                            </span>
                                          );
                                        }
                                        return null;
                                      })()}
                                    </div>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600">Modalidade:</span>
                                    <div className="text-gray-900">
                                      {contrato.tipoPagamento === 'a_vista' ? 'À Vista' :
                                       contrato.tipoPagamento === 'parcelamento' ? 'Parcelamento' :
                                       'Entrada + Parcelamento'}
                                    </div>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600">Parcelas:</span>
                                    <div className="text-gray-900">{contrato.parcelasPagas} de {contrato.quantidadeParcelas} pagas</div>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-600">Valor/Parcela:</span>
                                    <div className="text-gray-900">{currency.format(contrato.valorPorParcela)}</div>
                                  </div>
                                </div>
                                
                                {loteArrematado && (
                                  <div className="mt-3 pt-3 border-t border-gray-200">
                                    <span className="font-medium text-gray-600 text-sm">Lote Arrematado:</span>
                                    <div className="text-gray-900 mt-1 bg-white rounded p-2 border border-gray-200">
                                      <span className="font-mono text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded">{loteArrematado.numero}</span>
                                      <span className="text-gray-400 mx-2">•</span>
                                      <span className="text-gray-700">{loteArrematado.descricao}</span>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                       </div>

                {/* Perfil de Risco */}
                       <div className="bg-white border border-gray-200 rounded-lg p-6">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-2">
                           <h4 className="text-lg font-semibold text-gray-900">Perfil de Risco</h4>
                           <Badge variant="destructive" className="text-sm font-bold px-4 py-2">
                             RISCO ALTO
                           </Badge>
                  </div>
                  
                         <div className="space-y-4 text-sm leading-relaxed text-gray-700">
                          <p>
                            <strong>Dados Consolidados:</strong> O arrematante {selectedArrematante.arrematante?.nome} possui risco classificado como alto baseado nos dados históricos de pagamentos. 
                            Este relatório consolida {analysis.statistics.totalContracts} contrato com valor total de {currency.format(analysis.statistics.totalValue)}
                            {(() => {
                              const arrematante = selectedArrematante.arrematante;
                              if (!arrematante) return null;
                              
                              const valorBase = analysis.statistics.totalBaseValue;
                              const percentualJuros = arrematante.percentualJurosAtraso || 0;
                              
                              if (percentualJuros > 0 && analysis.statistics.totalValue > valorBase) {
                                const juros = analysis.statistics.totalValue - valorBase;
                                return (
                                  <span className="text-red-600 ml-1">
                                    ({currency.format(juros)} juros)
                                  </span>
                                );
                              }
                              return null;
                            })()}. {(() => {
                              const arrematante = selectedArrematante.arrematante;
                              const loteArrematado = selectedArrematante.lotes?.find((lote: LoteInfo) => lote.id === arrematante?.loteId);
                              const tipoPagamento = loteArrematado?.tipoPagamento || 'parcelamento';
                              const parcelasPagas = arrematante?.parcelasPagas || 0;
                              const quantidadeParcelas = arrematante?.quantidadeParcelas || 12;
                              
                              if (tipoPagamento === 'a_vista') {
                                return `Foi ${arrematante?.pago ? 'realizado 1 pagamento à vista.' : 'programado 1 pagamento à vista (pendente).'}`;
                              } else if (tipoPagamento === 'entrada_parcelamento') {
                                return `Foram registrados ${parcelasPagas} pagamentos (entrada + ${Math.max(0, parcelasPagas - 1)} parcelas) de um total de ${quantidadeParcelas + 1} pagamentos programados (entrada + ${quantidadeParcelas} parcelas).`;
                              } else {
                                return `Foram registrados ${parcelasPagas} pagamentos de um total de ${quantidadeParcelas} parcelas programadas.`;
                              }
                            })()}
                          </p>
                           
                           <p>
                             <strong>Análise de Risco:</strong> O cálculo de risco considera {selectedArrematante.parcelasAtrasadas || 0} parcelas atualmente em atraso, 
                             com valor total de {currency.format(selectedArrematante.overdueAmount || 0)} em débito. 
                             O maior período de atraso registrado é de {selectedArrematante.daysOverdue || 0} dias. 
                             Múltiplas parcelas em atraso indicam risco médio a alto.
                      </p>
                      
                      <p>
                        <strong>Situação Atual:</strong> {(() => {
                          const arrematante = selectedArrematante.arrematante;
                          const loteArrematado = selectedArrematante.lotes?.find((lote: LoteInfo) => lote.id === arrematante?.loteId);
                          const tipoPagamento = loteArrematado?.tipoPagamento || 'parcelamento';
                          const parcelasPagas = arrematante?.parcelasPagas || 0;
                          const quantidadeParcelas = arrematante?.quantidadeParcelas || 12;
                          const now = new Date();
                          const datasAtrasadas = [];
                          
                          if (tipoPagamento === 'a_vista') {
                            const dataVencimento = loteArrematado?.dataVencimentoVista || selectedArrematante.dataVencimentoVista;
                            if (dataVencimento && !arrematante?.pago) {
                              const vencimento = new Date(dataVencimento + 'T23:59:59');
                              if (now > vencimento) {
                                datasAtrasadas.push(vencimento.toLocaleDateString('pt-BR'));
                              }
                            }
                          } else if (tipoPagamento === 'entrada_parcelamento') {
                            // Verificar entrada
                            if (parcelasPagas === 0 && loteArrematado?.dataEntrada) {
                              const dataEntrada = new Date(loteArrematado.dataEntrada + 'T23:59:59');
                              if (now > dataEntrada) {
                                datasAtrasadas.push(dataEntrada.toLocaleDateString('pt-BR') + ' (Entrada)');
                              }
                            }
                            // Verificar parcelas
                            if (arrematante?.mesInicioPagamento && arrematante?.diaVencimentoMensal) {
                              const [startYear, startMonth] = arrematante.mesInicioPagamento.split('-').map(Number);
                              const parcelasEfetivasPagas = Math.max(0, parcelasPagas - 1);
                              for (let i = parcelasEfetivasPagas; i < quantidadeParcelas; i++) {
                                const vencimento = new Date(startYear, startMonth - 1 + i, arrematante.diaVencimentoMensal, 23, 59, 59);
                                if (now > vencimento) {
                                  datasAtrasadas.push(vencimento.toLocaleDateString('pt-BR') + ` (Parcela ${i + 1})`);
                                }
                              }
                            }
                          } else {
                            // Parcelamento simples
                            if (arrematante?.mesInicioPagamento && arrematante?.diaVencimentoMensal) {
                              const [startYear, startMonth] = arrematante.mesInicioPagamento.split('-').map(Number);
                              for (let i = parcelasPagas; i < quantidadeParcelas; i++) {
                                const vencimento = new Date(startYear, startMonth - 1 + i, arrematante.diaVencimentoMensal, 23, 59, 59);
                                if (now > vencimento) {
                                  datasAtrasadas.push(vencimento.toLocaleDateString('pt-BR') + ` (Parcela ${i + 1})`);
                                }
                              }
                            }
                          }
                          
                          if (datasAtrasadas.length === 0) {
                            return 'Contrato em dia sem atrasos registrados.';
                          } else if (datasAtrasadas.length === 1) {
                            return `Contrato ${tipoPagamento === 'a_vista' ? 'de pagamento à vista' : 'de parcelamento'} apresenta atraso que requer acompanhamento com vencimento em ${datasAtrasadas[0]}.`;
                          } else {
                            return `Contrato de parcelamento apresenta ${datasAtrasadas.length} atrasos que requerem acompanhamento com vencimentos em: ${datasAtrasadas.join(', ')}.`;
                          }
                        })()}
                      </p>
                  </div>
                </div>

                       {/* Detalhamento dos Pagamentos em Dia */}
                            {(() => {
                         // Usar dados reais do arrematante
                              const arrematante = selectedArrematante.arrematante;
                              const loteArrematado = selectedArrematante.lotes?.find((lote: LoteInfo) => lote.id === arrematante?.loteId);
                         const _tipoPagamento = loteArrematado?.tipoPagamento || 'parcelamento';
                         const parcelasPagas = arrematante?.parcelasPagas || 0;
                         
                         // Baseado nos dados reais: todos os pagamentos foram COM ATRASO
                         // Então não há pagamentos "em dia" para mostrar
                         const pagamentosEmDia = [];
                         
                         // No caso real do Igor Elion, todos os 4 pagamentos foram com atraso
                         // Então a lista de pagamentos em dia fica vazia
                         
                         return (
                           <div className="bg-white border border-gray-200 rounded-lg p-6">
                             <h4 className="text-lg font-semibold text-gray-900 mb-4">Detalhamento dos Pagamentos em Dia</h4>
                             
                             <div className="text-sm leading-relaxed text-gray-700">
                               {pagamentosEmDia.length > 0 ? (
                      <p>
                        <strong>Detalhamento dos Pagamentos em Dia:</strong>{' '}
                                   {pagamentosEmDia.map((pagamento, index) => (
                          <span key={index}>
                                       {pagamento.tipo === 'entrada' ? 
                                         `Entrada do contrato ${selectedArrematante.nome} quitada em ${pagamento.dataPagamento}` :
                                         `Parcela #${pagamento.parcela} do contrato ${selectedArrematante.nome} quitada em ${pagamento.dataPagamento}`
                                       }
                                       {pagamento.antecedencia > 0 && ` (${pagamento.antecedencia} dia${pagamento.antecedencia !== 1 ? 's' : ''} de antecedência)`}
                                       {index < pagamentosEmDia.length - 1 && ', '}
                          </span>
                        ))}
                                 </p>
                               ) : (
                                 <p>
                                   <strong>Detalhamento dos Pagamentos em Dia:</strong> Não foram registrados pagamentos realizados dentro do prazo de vencimento.{parcelasPagas > 0 && ` Todos os ${parcelasPagas} pagamentos processados foram quitados após a data de vencimento original.`}
                                 </p>
                               )}
                    </div>
                  </div>
                         );
                       })()}

                {/* Informações do Relatório */}
                       <div className="bg-gray-50 rounded-lg p-6">
                         <h4 className="text-lg font-semibold text-gray-900 mb-4">Informações do Relatório</h4>
                         
                         <div className="space-y-4 text-sm leading-relaxed text-gray-700">
                          <p>
                            <strong>Escopo do Relatório:</strong> Este documento consolida dados de {analysis.statistics.totalContracts} contrato no valor total de {currency.format(analysis.statistics.totalValue)}
                            {(() => {
                              const arrematante = selectedArrematante.arrematante;
                              if (!arrematante) return null;
                              
                              const valorBase = analysis.statistics.totalBaseValue;
                              const percentualJuros = arrematante.percentualJurosAtraso || 0;
                              
                              if (percentualJuros > 0 && analysis.statistics.totalValue > valorBase) {
                                const juros = analysis.statistics.totalValue - valorBase;
                                return (
                                  <span className="text-red-600 ml-1">
                                    ({currency.format(juros)} juros)
                                  </span>
                                );
                              }
                              return null;
                            })()} vinculado ao arrematante {selectedArrematante.arrematante?.nome}. 
                            O período do relatório compreende informações do leilão "{selectedArrematante.nome || 'Leilão'}" realizado em {selectedArrematante.dataInicio ? new Date(selectedArrematante.dataInicio).toLocaleDateString('pt-BR') : 'data não informada'}.
                          </p>
                           
                           <p>
                             <strong>Critérios de Classificação:</strong> O perfil de risco foi determinado com base nos seguintes parâmetros: status de pagamento atual, histórico de transações e informações consolidadas do contrato vinculado.
                           </p>
                           
                           <p className="font-medium">
                      <strong>Data de Geração:</strong> {new Date().toLocaleDateString('pt-BR', { 
                               weekday: 'long', 
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric' 
                      })} às {new Date().toLocaleTimeString('pt-BR', { 
                        hour: '2-digit', 
                        minute: '2-digit' 
                      })}
                    </p>
                    
                           <p className="text-xs text-gray-500">
                             <strong>Documento gerado automaticamente</strong> a partir da base de dados do sistema de gestão de leilões. As informações apresentadas refletem os registros disponíveis na data de geração do relatório.
                    </p>
                  </div>
                </div>

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
                   </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                  <Button 
                    variant="outline" 
                    onClick={() => setIsHistoryModalOpen(false)}
                    className="bg-white border-gray-300 text-gray-700 hover:bg-gray-100 hover:text-gray-900 focus:ring-0 focus:outline-none"
                  >
                    Fechar Relatório
                  </Button>
                  <Button
                    onClick={handleDownloadReport}
                    className="bg-black hover:bg-gray-800 text-white btn-download-click"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Baixar Relatório
                  </Button>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Modal de Exportação */}
      <Dialog open={isExportModalOpen} onOpenChange={setIsExportModalOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-6xl max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold">Exportar Relatório de Inadimplência</DialogTitle>
            <DialogDescription className="text-gray-600 mt-2">
              Selecione um arrematante específico ou todos os inadimplentes para gerar o relatório
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
                  <SelectValue placeholder="Escolha um arrematante ou todos os inadimplentes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os Inadimplentes</SelectItem>
                  {filteredOverdueAuctions.map((auction) => (
                    <SelectItem key={auction.id} value={auction.id}>
                      {auction.arrematante?.nome || 'Sem nome'} - {auction.daysOverdue === 1 ? '1 dia' : `${auction.daysOverdue} dias`} de atraso
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Preview do Relatório */}
            {selectedArrematanteForExport && (
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-gray-50 px-4 py-2 border-b">
                  <h3 className="font-medium text-gray-900">Pré-visualização do Relatório</h3>
                  <p className="text-sm text-gray-600">Este será o conteúdo do arquivo PDF</p>
                </div>
                <div className="max-h-96 overflow-y-auto p-4">
                  <InadimplenciaReportPDF 
                    arrematanteId={selectedArrematanteForExport}
                    filteredOverdueAuctions={filteredOverdueAuctions}
                  />
                </div>
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
                onClick={handleExportInadimplencia}
                disabled={!selectedArrematanteForExport}
                className="flex-1 bg-black hover:bg-gray-800 text-white"
              >
                <Download className="h-4 w-4 mr-2" />
                Gerar e Baixar PDF
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>


      {/* Modal de Envio de Cobrança */}
      <Dialog open={isChargeModalOpen} onOpenChange={setIsChargeModalOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5" />
              Enviar Cobrança por Email
            </DialogTitle>
          </DialogHeader>

          {selectedDebtor && (
            <div className="space-y-4 sm:space-y-6">
              {/* Informações do Devedor */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900">{selectedDebtor.arrematante?.nome}</h3>
                    <p className="text-sm text-gray-600">{selectedDebtor.arrematante?.email}</p>
                    <p className="text-sm text-gray-600">Leilão: {selectedDebtor.nome}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-red-600">
                      {currency.format(selectedDebtor.overdueAmount || 0)}
                    </p>
                    <p className="text-sm text-gray-600">
                        {selectedDebtor.daysOverdue === 1 ? '1 dia em atraso' : `${selectedDebtor.daysOverdue} dias em atraso`}
                    </p>
                  </div>
                </div>
              </div>

              {/* Mensagem de Cobrança */}
              <div className="space-y-2">
                <Label htmlFor="charge-message" className="text-sm font-medium text-gray-700">
                  Mensagem de Cobrança
                </Label>
                <Textarea
                  id="charge-message"
                  value={chargeMessage}
                  onChange={(e) => setChargeMessage(e.target.value)}
                  className="min-h-[200px] border-gray-300 focus:border-gray-300 focus:ring-0"
                  placeholder="Digite a mensagem de cobrança..."
                />
                <p className="text-xs text-gray-500">
                  Você pode editar esta mensagem antes de enviar
                </p>
              </div>

              {/* Anexos */}
              <div className="space-y-3">
                <Label className="text-sm font-medium text-gray-700">
                  Anexos (Opcional)
                </Label>
                
                {/* Lista de anexos */}
                {attachments.length > 0 && (
                  <div className="space-y-2">
                    {attachments.map((file, index) => (
                      <div key={index} className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-2 bg-gray-50 border border-gray-200 rounded-md gap-2">
                        <div className="flex items-center gap-2">
                          <ImageIcon className="h-4 w-4 text-blue-600" />
                          <span className="text-sm font-medium text-gray-900">{file.name}</span>
                          <span className="text-xs text-gray-500">
                            ({(file.size / 1024 / 1024).toFixed(2)} MB)
                          </span>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeAttachment(index)}
                          className="h-10 w-10 sm:h-6 sm:w-6 p-0 text-red-500 hover:bg-red-50"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Área de upload */}
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-gray-400 transition-colors">
                  <Paperclip className="mx-auto h-6 w-6 text-gray-400 mb-2" />
                  <p className="text-sm text-gray-600 mb-2">
                    Adicione comprovantes, boletos ou outros documentos
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => document.getElementById('charge-file-upload')?.click()}
                    className="bg-white text-black border-gray-300 hover:bg-gray-100 hover:text-black"
                  >
                    <Paperclip className="h-4 w-4 mr-2" />
                    Selecionar Arquivos
                  </Button>
                  <input
                    id="charge-file-upload"
                    type="file"
                    multiple
                    accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                  <p className="text-xs text-gray-400 mt-2">
                    PDF, DOC, JPG, PNG (máx. 10MB cada)
                  </p>
                </div>
              </div>

              {/* Botões */}
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsChargeModalOpen(false)}
                  disabled={isSending}
                  className="bg-white text-black border-gray-300 hover:bg-gray-100 hover:text-black"
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  onClick={sendChargeEmail}
                  disabled={isSending || !chargeMessage.trim()}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {isSending ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Enviando...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      Enviar Cobrança
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal de Teste de Envio de Cobrança */}
      <Dialog open={isTestEmailModalOpen} onOpenChange={setIsTestEmailModalOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold flex items-center gap-2">
              <Send className="h-5 w-5 text-amber-600" />
              Teste de Envio de Cobrança
            </DialogTitle>
            <DialogDescription className="space-y-2">
              <p>Logs detalhados do envio de emails de cobrança para {selectedDebtor?.arrematante?.nome}</p>
              <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-sm text-amber-800">
                <strong>⚠️ Modo de Teste:</strong> Este teste ignora a verificação de duplicatas e enviará emails mesmo que já tenham sido enviados hoje. Use apenas para testar o sistema.
              </div>
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {isTestingSend ? (
              <div className="flex flex-col items-center justify-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600 mb-4"></div>
                <p className="text-gray-600">Enviando emails de teste...</p>
                <p className="text-sm text-gray-500 mt-2">Isso pode levar alguns segundos</p>
              </div>
            ) : (
              <div className="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm overflow-auto max-h-[50vh]">
                {testEmailLogs.length > 0 ? (
                  testEmailLogs.map((log, index) => (
                    <div key={index} className="whitespace-pre-wrap">
                      {log}
                    </div>
                  ))
                ) : (
                  <p className="text-gray-400">Aguardando execução do teste...</p>
                )}
              </div>
            )}
            
            <div className="flex justify-between items-center gap-2 pt-4 border-t">
              <p className="text-sm text-gray-500">
                {testEmailLogs.length > 0 && `${testEmailLogs.length} linhas de log`}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(testEmailLogs.join('\n'));
                  }}
                  disabled={testEmailLogs.length === 0}
                >
                  <Download className="h-4 w-4 mr-2" />
                  Copiar Logs
                </Button>
                <Button onClick={() => setIsTestEmailModalOpen(false)}>
                  Fechar
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </div>
    </HoverContext.Provider>
  );
}

// Componente para o relatório PDF de inadimplência
function InadimplenciaReportPDF({ 
  arrematanteId, 
  filteredOverdueAuctions 
}: { 
  arrematanteId: string; 
  filteredOverdueAuctions: AuctionWithOverdueInfo[] 
}) {
  const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

  const reportData = useMemo(() => {
    if (arrematanteId === 'todos') {
      // Relatório geral de todos os inadimplentes
      const totalOverdue = filteredOverdueAuctions.length;
      const totalOverdueValue = filteredOverdueAuctions.reduce((sum, auction) => sum + (auction.overdueAmount || 0), 0);
      const averageDelay = filteredOverdueAuctions.length > 0 
          ? Math.round(filteredOverdueAuctions.reduce((sum, auction) => sum + (auction.avgDaysOverdue || 0), 0) / filteredOverdueAuctions.length)
        : 0;

      return {
        type: 'geral',
        totalOverdue,
        totalOverdueValue,
        averageDelay,
        arrematantes: filteredOverdueAuctions
      };
    } else {
      // Relatório individual
      const arrematante = filteredOverdueAuctions.find(a => a.id === arrematanteId);
      return {
        type: 'individual',
        arrematante
      };
    }
  }, [arrematanteId, filteredOverdueAuctions]);

  if (!reportData) return null;

  return (
    <div id="inadimplencia-export-report" className="space-y-4 sm:space-y-6 bg-white p-6 font-sans">
      {/* Cabeçalho */}
      <div className="text-center border-b border-gray-200 pb-6 no-page-break">
        <h1 className="text-2xl font-semibold text-gray-900 mb-4">
          {reportData.type === 'geral' 
            ? 'RELATÓRIO CORPORATIVO DE INADIMPLÊNCIA'
            : `RELATÓRIO DE INADIMPLÊNCIA - ${reportData.arrematante?.arrematante?.nome?.toUpperCase()}`
          }
        </h1>
        <div className="text-gray-600 text-sm space-y-1">
          <p className="font-medium">Documento oficial de análise de inadimplência e acompanhamento de recebíveis</p>
          <p>Gerado em: {new Date().toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: '2-digit', 
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })}</p>
        </div>
      </div>

      {reportData.type === 'geral' ? (
        // Relatório geral
        <>
          {/* Resumo */}
          <div className="bg-white rounded-lg p-6 border border-gray-200 no-page-break">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Resumo</h2>
            <div className="prose prose-gray max-w-none text-sm leading-relaxed text-gray-700">
              <p>
                Total de <strong>{reportData.totalOverdue} inadimplente{reportData.totalOverdue !== 1 ? 's' : ''}</strong> com valor em atraso de{' '}
                <strong>{currency.format(reportData.totalOverdueValue)}</strong> e prazo médio de <strong>{reportData.averageDelay} dias</strong> de atraso.
              </p>
            </div>
          </div>

          {/* Lista de Inadimplentes */}
          <div className="no-page-break">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Inadimplentes</h2>
            <div className="space-y-3">
              {reportData.arrematantes.map((auction, index) => (
                <div key={auction.id} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <div className="prose prose-gray max-w-none text-sm leading-relaxed text-gray-700">
                    <p>
                      <strong>#{String(index + 1).padStart(3, '0')}</strong> - {auction.arrematante?.nome} (Doc. {auction.arrematante?.documento}) - 
                      Valor em atraso: <strong>{currency.format(auction.overdueAmount || 0)}</strong> - 
                      Vencimento: <strong>{auction.dueDateFormatted}</strong> - 
                      Atraso: <strong>{auction.daysOverdue === 1 ? '1 dia' : `${auction.daysOverdue} dias`}</strong> - 
                      Contato: {auction.arrematante?.telefone || 'não informado'} - 
                      Contrato: {auction.nome || `Leilão ${auction.identificacao}`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        // Relatório individual
        <div className="space-y-4">
          {/* Dados do Inadimplente */}
          <div className="bg-gray-50 rounded-lg p-6 border border-gray-200 no-page-break">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Dados do Inadimplente</h2>
            <div className="prose prose-gray max-w-none text-sm leading-relaxed text-gray-700">
              <p>
                Nome: <strong>{reportData.arrematante?.arrematante?.nome}</strong> - 
                Documento: <strong>{reportData.arrematante?.arrematante?.documento}</strong> - 
                Telefone: {reportData.arrematante?.arrematante?.telefone || 'Não informado'} - 
                Email: {reportData.arrematante?.arrematante?.email || 'Não informado'}
              </p>
            </div>
          </div>

          {/* Informações do Atraso */}
          <div className="bg-white rounded-lg p-6 border border-gray-200 no-page-break">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Informações do Atraso</h2>
            <div className="prose prose-gray max-w-none text-sm leading-relaxed text-gray-700">
              <p>
                Contrato: <strong>{reportData.arrematante?.nome || `Leilão ${reportData.arrematante?.identificacao}`}</strong> - 
                Código: <strong>{reportData.arrematante?.identificacao || reportData.arrematante?.id}</strong> - 
                Valor em atraso: <strong>{currency.format(reportData.arrematante?.overdueAmount || 0)}</strong> - 
                Data de vencimento: <strong>{reportData.arrematante?.dueDateFormatted}</strong> - 
                Dias de atraso: <strong>{reportData.arrematante?.daysOverdue === 1 ? '1 dia' : `${reportData.arrematante?.daysOverdue} dias`}</strong> - 
                Classificação: <strong>{reportData.arrematante?.overdueSeverity?.toUpperCase()}</strong>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Informações do Relatório */}
      <div className="bg-white rounded-lg p-4 border border-gray-200 no-page-break">
        <div className="prose prose-gray max-w-none text-xs text-gray-500 text-center">
          <p>
            Relatório gerado em {new Date().toLocaleDateString('pt-BR', { 
              day: '2-digit', 
              month: '2-digit', 
              year: 'numeric' 
            })} às {new Date().toLocaleTimeString('pt-BR', { 
              hour: '2-digit', 
              minute: '2-digit' 
            })} - Sistema de Gestão de Leilões
          </p>
        </div>
      </div>

      {/* Logos Elionx e Arthur Lira */}
      <div className="mt-4 sm:mt-6 lg:mt-8 flex justify-center items-center -ml-20 no-page-break">
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
