import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Auction } from '@/lib/types';
import { logger } from '@/lib/logger';
import { getLembreteEmailTemplate, getCobrancaEmailTemplate, getConfirmacaoPagamentoEmailTemplate, getQuitacaoCompletaEmailTemplate } from '@/lib/email-templates';
import { format, parseISO, differenceInDays, addDays, getDaysInMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { obterValorTotalArrematante } from '@/lib/parcelamento-calculator';
import { fetchWithTimeout } from '@/lib/secure-utils'; // 🔒 SEGURANÇA: Fetch com timeout para prevenir travamentos

interface EmailConfig {
  emailRemetente: string;
  diasAntesLembrete: number;
  diasDepoisCobranca: number;
  enviarAutomatico: boolean;
}

interface EmailLog {
  id: string;
  auction_id: string;
  arrematante_nome: string;
  tipo_email: 'lembrete' | 'cobranca' | 'confirmacao';
  email_destinatario: string;
  data_envio: string;
  sucesso: boolean;
  erro?: string;
}

// 🔒 SEGURANÇA: API key do Resend está configurada como secret na Edge Function
const DEFAULT_CONFIG: EmailConfig = {
  emailRemetente: 'notificacoes@grupoliraleiloes.com',
  diasAntesLembrete: 3,
  diasDepoisCobranca: 1,
  enviarAutomatico: true,
};

export function useEmailNotifications() {
  const [config, setConfig] = useState<EmailConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(false);
  const [emailLogs, setEmailLogs] = useState<EmailLog[]>([]);

  useEffect(() => {
    const savedConfig = localStorage.getItem('email_config');
    if (savedConfig) {
      try {
        const parsed = JSON.parse(savedConfig);
        setConfig({ ...DEFAULT_CONFIG, ...parsed });
      } catch (error) {
        logger.error('Erro ao carregar configurações de email:', error);
      }
    }
  }, []);

  const saveConfig = (newConfig: Partial<EmailConfig>) => {
    const updated = { ...config, ...newConfig };
    setConfig(updated);
    localStorage.setItem('email_config', JSON.stringify(updated));
  };

  const jaEnviouEmail = async (
    auctionId: string,
    tipoEmail: 'lembrete' | 'cobranca' | 'confirmacao',
    parcelaNumero?: number,
    periodo: 'dia' | 'mes' = 'dia'
  ): Promise<boolean> => {
    const agora = new Date();
    
    // Determinar data de início do período de verificação
    let dataInicio: string;
    if (periodo === 'mes') {
      // Verificar se já enviou neste mês (para cobranças mensais)
      const ano = agora.getFullYear();
      const mes = String(agora.getMonth() + 1).padStart(2, '0');
      dataInicio = `${ano}-${mes}-01`;
    } else {
      // Verificar se já enviou hoje (para lembretes e confirmações)
      dataInicio = agora.toISOString().split('T')[0];
    }
    
    // Construir identificador do log
    const logIdentifier = parcelaNumero !== undefined 
      ? `${auctionId}-${tipoEmail}-parcela-${parcelaNumero}`
      : `${auctionId}-${tipoEmail}`;
    
    const { data, error } = await supabase
      .from('email_logs')
      .select('id')
      .eq('auction_id', logIdentifier)
      .eq('tipo_email', tipoEmail)
      .gte('data_envio', dataInicio)
      .eq('sucesso', true)
      .limit(1);

    if (error) {
      logger.error('Erro ao verificar emails enviados:', error);
      return false;
    }

    return (data?.length ?? 0) > 0;
  };

  const registrarLog = async (log: Omit<EmailLog, 'id'>) => {
    const { error } = await supabase
      .from('email_logs')
      .insert([log]);

    if (error) {
      logger.error('Erro ao registrar log de email:', error);
    }
  };

  const calcularValorComJuros = (
    valorOriginal: number,
    diasAtraso: number,
    percentualJuros: number = 0,
    tipoJuros: 'simples' | 'composto' = 'simples'
  ): { valorJuros: number; valorTotal: number } => {
    if (diasAtraso <= 0 || percentualJuros <= 0 || valorOriginal <= 0) {
      return { valorJuros: 0, valorTotal: valorOriginal };
    }

    if (diasAtraso > 1825) {
      logger.warn('Dias de atraso muito alto, limitando a 1825 dias', { diasAtraso });
      diasAtraso = 1825;
    }

    const taxaMensal = percentualJuros / 100;
    const mesesAtraso = diasAtraso / 30;

    let valorJuros = 0;
    
    if (tipoJuros === 'simples') {
      valorJuros = valorOriginal * taxaMensal * mesesAtraso;
    } else {
      const valorTotal = valorOriginal * Math.pow(1 + taxaMensal, mesesAtraso);
      valorJuros = valorTotal - valorOriginal;
    }

    return {
      valorJuros: Math.round(valorJuros * 100) / 100,
      valorTotal: Math.round((valorOriginal + valorJuros) * 100) / 100,
    };
  };

  const enviarEmail = async (
    destinatario: string,
    assunto: string,
    htmlContent: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      // 🔒 SEGURANÇA: Usar apenas variáveis de ambiente
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      
      if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error('Configuração do Supabase não encontrada');
      }
      
      const edgeFunctionUrl = `${supabaseUrl}/functions/v1/send-email`;

      // 🔒 SEGURANÇA: Fetch com timeout de 30s para prevenir travamentos
      // A API key do Resend está configurada como secret na Edge Function
      const response = await fetchWithTimeout(edgeFunctionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseAnonKey,
          'Authorization': `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({
          to: destinatario,
          subject: assunto,
          html: htmlContent,
          from: `Arthur Lira Leilões <${config.emailRemetente}>`,
        }),
      }, 30000); // 30 segundos de timeout

      const responseData = await response.json();

      if (!response.ok) {
        // Log detalhado do erro para debugging
        logger.error('❌ ERRO AO ENVIAR EMAIL:', {
          status: response.status,
          statusText: response.statusText,
          erro: responseData.error,
          detalhes: responseData.details,
          destinatario: destinatario
        });

        // Mensagens de erro mais específicas
        let mensagemErro = 'Erro ao enviar email';
        
        if (response.status === 401 || response.status === 403) {
          mensagemErro = '🔑 Chave API do Resend inválida ou expirada. Verifique em Configurações.';
        } else if (response.status === 400) {
          mensagemErro = '📧 Email inválido ou dados incorretos';
        } else if (response.status === 429) {
          mensagemErro = '⏳ Limite de envios excedido. Aguarde alguns minutos.';
        } else if (responseData.error) {
          mensagemErro = responseData.error;
        }
        
        throw new Error(mensagemErro);
      }

      logger.debug('✅ Email enviado com sucesso:', {
        destinatario,
        id: responseData.id
      });

      return { success: true };
    } catch (error) {
      logger.error('❌ ERRO COMPLETO:', error);
      
      let mensagemErro = 'Erro ao enviar email';
      
      if (error instanceof Error) {
        mensagemErro = error.message;
      }
      
      // Se o erro for de rede/conexão
      if (mensagemErro.includes('Failed to fetch') || mensagemErro.includes('NetworkError')) {
        mensagemErro = '🌐 Erro de conexão. Verifique sua internet ou se a Edge Function está deployada.';
      }
      
      return {
        success: false,
        error: mensagemErro,
      };
    }
  };

  const enviarLembrete = async (auction: Auction): Promise<{ success: boolean; message: string }> => {
    if (!auction.arrematante?.email) {
      return { success: false, message: 'Arrematante não possui email cadastrado' };
    }

    const jaEnviou = await jaEnviouEmail(auction.id, 'lembrete');
    if (jaEnviou) {
      return { success: false, message: 'Lembrete já foi enviado hoje para este arrematante' };
    }

    let dataVencimento: Date;
    if (auction.tipoPagamento === 'a_vista' && auction.dataVencimentoVista) {
      dataVencimento = parseISO(auction.dataVencimentoVista);
    } else if (auction.arrematante.dataEntrada) {
      dataVencimento = parseISO(auction.arrematante.dataEntrada);
    } else if (auction.arrematante.mesInicioPagamento && auction.arrematante.diaVencimentoMensal) {
      const [ano, mes] = auction.arrematante.mesInicioPagamento.split('-');
      dataVencimento = new Date(parseInt(ano), parseInt(mes) - 1, auction.arrematante.diaVencimentoMensal);
    } else {
      return { success: false, message: 'Data de vencimento não configurada' };
    }

    const hoje = new Date();
    const diasRestantes = differenceInDays(dataVencimento, hoje);

    const lote = auction.lotes?.find(l => l.id === auction.arrematante?.loteId);
    const tipoPagamento = lote?.tipoPagamento || auction.tipoPagamento;
    const parcelaAtual = (auction.arrematante.parcelasPagas || 0) + 1;
    const totalParcelas = auction.arrematante.quantidadeParcelas || lote?.parcelasPadrao || 0;

    // NOVO: Calcular valor total considerando fator multiplicador e comissão do leiloeiro
    const valorTotalCalculado = obterValorTotalArrematante({
      usaFatorMultiplicador: auction.arrematante?.usaFatorMultiplicador,
      valorLance: auction.arrematante?.valorLance,
      fatorMultiplicador: auction.arrematante?.fatorMultiplicador || lote?.fatorMultiplicador,
      valorPagarNumerico: auction.arrematante.valorPagarNumerico,
      percentualComissaoLeiloeiro: auction.arrematante?.percentualComissaoLeiloeiro
    }, auction.percentualComissaoLeiloeiro);

    const templateData = {
      arrematanteNome: auction.arrematante.nome,
      leilaoNome: auction.nome,
      loteNumero: auction.lotes?.[0]?.numero,
      valorPagar: auction.arrematante.valorPagar || `R$ ${valorTotalCalculado.toFixed(2)}`,
      dataVencimento: format(dataVencimento, "dd 'de' MMMM 'de' yyyy", { locale: ptBR }),
      diasRestantes,
      tipoPagamento,
      parcelaAtual,
      totalParcelas,
    };

    const { subject, html } = getLembreteEmailTemplate(templateData);
    const result = await enviarEmail(auction.arrematante.email, subject, html);

    await registrarLog({
      auction_id: auction.id,
      arrematante_nome: auction.arrematante.nome,
      tipo_email: 'lembrete',
      email_destinatario: auction.arrematante.email,
      data_envio: new Date().toISOString(),
      sucesso: result.success,
      erro: result.error,
    });

    return {
      success: result.success,
      message: result.success
        ? `Lembrete enviado com sucesso para ${auction.arrematante.email}`
        : `Erro ao enviar lembrete: ${result.error}`,
    };
  };

  const enviarCobranca = async (auction: Auction, parcelaEspecifica?: number, forcarEnvio?: boolean): Promise<{ success: boolean; message: string }> => {
    if (!auction.arrematante?.email) {
      return { success: false, message: 'Arrematante não possui email cadastrado' };
    }

    const arrematante = auction.arrematante;
    const lote = auction.lotes?.find(l => l.id === arrematante?.loteId);
    const tipoPagamento = lote?.tipoPagamento || auction.tipoPagamento;
    const parcelasPagas = arrematante.parcelasPagas || 0;
    const parcelaAtual = parcelaEspecifica !== undefined ? parcelaEspecifica : (parcelasPagas + 1);
    const totalParcelas = arrematante.quantidadeParcelas || lote?.parcelasPadrao || 0;
    const valorTotalArrematante = arrematante.valorPagarNumerico;

    // Verificar se já enviou email para esta parcela específica hoje (a menos que seja teste forçado)
    if (!forcarEnvio) {
      const jaEnviou = await jaEnviouEmail(auction.id, 'cobranca', parcelaAtual);
      if (jaEnviou) {
        return { success: false, message: `Cobrança da parcela ${parcelaAtual} já foi enviada hoje` };
      }
    }
    
    // Função para calcular juros progressivos (IGUAL ao email de confirmação)
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

    let dataVencimento: Date;
    let valorParcela: number;
    let diasAtraso: number;

    // PAGAMENTO À VISTA
    if (tipoPagamento === 'a_vista') {
      if (!auction.dataVencimentoVista && !lote?.dataVencimentoVista) {
        return { success: false, message: 'Data de vencimento à vista não configurada' };
      }
      
      const dateStr = lote?.dataVencimentoVista || auction.dataVencimentoVista || new Date().toISOString().split('T')[0];
      const [year, month, day] = dateStr.split('-').map(Number);
      dataVencimento = new Date(year, month - 1, day, 23, 59, 59);
      valorParcela = valorTotalArrematante;
      
      const hoje = new Date();
      diasAtraso = differenceInDays(hoje, dataVencimento);
      
      if (diasAtraso <= 0) {
        return { success: false, message: 'Pagamento à vista ainda não está em atraso' };
      }
      
    // ENTRADA + PARCELAMENTO
    } else if (tipoPagamento === 'entrada_parcelamento') {
      if (parcelaAtual === 1) {
        // Email para a ENTRADA
        if (!arrematante.dataEntrada) {
          return { success: false, message: 'Data de entrada não configurada' };
        }
        dataVencimento = parseISO(arrematante.dataEntrada);
        valorParcela = Number(arrematante.valorEntrada) || 0;
      } else {
        // Email para PARCELAS após a entrada
        if (!arrematante.mesInicioPagamento || !arrematante.diaVencimentoMensal) {
          return { success: false, message: 'Mês de início ou dia de vencimento não configurado' };
        }
        
        const [startYear, startMonth] = arrematante.mesInicioPagamento.split('-').map(Number);
        const parcelaIndex = parcelaAtual - 2; // -1 pela entrada, -1 pois é 0-based
        dataVencimento = new Date(startYear, startMonth - 1 + parcelaIndex, arrematante.diaVencimentoMensal, 23, 59, 59);
        
        const totalParcelasRestantes = totalParcelas - 1;
        const valorRestante = valorTotalArrematante - (Number(arrematante.valorEntrada) || 0);
        valorParcela = valorRestante / totalParcelasRestantes;
      }
      
      const hoje = new Date();
      diasAtraso = differenceInDays(hoje, dataVencimento);
      
      if (diasAtraso <= 0) {
        return { success: false, message: `Parcela ${parcelaAtual} ainda não está em atraso` };
      }
      
    // PARCELAMENTO SIMPLES
    } else {
      if (!arrematante.mesInicioPagamento || !arrematante.diaVencimentoMensal) {
        return { success: false, message: 'Mês de início ou dia de vencimento não configurado' };
      }
      
      const [startYear, startMonth] = arrematante.mesInicioPagamento.split('-').map(Number);
      const parcelaIndex = parcelaAtual - 1; // 0-based (parcela 1 = índice 0)
      dataVencimento = new Date(startYear, startMonth - 1 + parcelaIndex, arrematante.diaVencimentoMensal, 0, 0, 0);
      
      // CORREÇÃO: Calcular o valor BASE sem juros
      // O valorTotalArrematante pode conter juros de parcelas já vencidas
      // Precisamos calcular o valor original base e dividir pelas parcelas
      let valorBase = valorTotalArrematante;
      
      // Se há juros configurados, recalcular o valor base removendo juros das parcelas vencidas
      if (arrematante.percentualJurosAtraso && arrematante.percentualJurosAtraso > 0) {
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        
        // Calcular quantas parcelas estão com juros aplicados
        let valorTotalComJurosCalculado = 0;
        const valorParcelaBase = valorTotalArrematante / totalParcelas; // Primeira estimativa
        
        for (let i = 0; i < totalParcelas; i++) {
          const dataVencParcela = new Date(startYear, startMonth - 1 + i, arrematante.diaVencimentoMensal, 23, 59, 59);
          dataVencParcela.setHours(0, 0, 0, 0);
          
          if (hoje > dataVencParcela) {
            const diffTime = hoje.getTime() - dataVencParcela.getTime();
            const mesesAtraso = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 30));
            
            if (mesesAtraso >= 1) {
              const parcelaComJuros = calcularJurosProgressivos(valorParcelaBase, arrematante.percentualJurosAtraso, mesesAtraso);
              valorTotalComJurosCalculado += parcelaComJuros;
            } else {
              valorTotalComJurosCalculado += valorParcelaBase;
            }
          } else {
            valorTotalComJurosCalculado += valorParcelaBase;
          }
        }
        
        // ✅ CORREÇÃO: Só ajustar se o valor informado for MAIOR que o calculado
        // Isso indica que o valor informado JÁ INCLUI os juros das parcelas vencidas
        if (valorTotalArrematante > valorTotalComJurosCalculado + 1) {
          
          // Fazer iteração para encontrar o valor base correto
          let tentativaBase = valorTotalArrematante / 1.1; // Estimativa inicial
          let iteracoes = 0;
          
          while (iteracoes < 10) {
            valorTotalComJurosCalculado = 0;
            const valorParcalaTentativa = tentativaBase / totalParcelas;
            
            for (let i = 0; i < totalParcelas; i++) {
              const dataVencParcela = new Date(startYear, startMonth - 1 + i, arrematante.diaVencimentoMensal, 23, 59, 59);
              dataVencParcela.setHours(0, 0, 0, 0);
              
              if (hoje > dataVencParcela) {
                const diffTime = hoje.getTime() - dataVencParcela.getTime();
                const mesesAtraso = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 30));
                
                if (mesesAtraso >= 1) {
                  valorTotalComJurosCalculado += calcularJurosProgressivos(valorParcalaTentativa, arrematante.percentualJurosAtraso, mesesAtraso);
                } else {
                  valorTotalComJurosCalculado += valorParcalaTentativa;
                }
              } else {
                valorTotalComJurosCalculado += valorParcalaTentativa;
              }
            }
            
            const diferenca = valorTotalArrematante - valorTotalComJurosCalculado;
            if (Math.abs(diferenca) < 1) break;
            
            tentativaBase += diferenca * 0.5;
            iteracoes++;
          }
          
          valorBase = tentativaBase;
        }
      }
      
      valorParcela = valorBase / totalParcelas;
      
      const hoje = new Date();
      diasAtraso = differenceInDays(hoje, dataVencimento);
      
      if (diasAtraso <= 0) {
        return { success: false, message: `Parcela ${parcelaAtual} ainda não está em atraso` };
      }
    }

    // Calcular juros progressivos se houver atraso
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0); // Zerar horas para comparação precisa
    
    const dataVencimentoSemHora = new Date(dataVencimento);
    dataVencimentoSemHora.setHours(0, 0, 0, 0);
    
    let valorComJuros = valorParcela;
    let valorJurosAplicado = 0;
    let avisoJurosFuturos: { diasRestantes: number; percentualJuros: number; valorJurosFuturo: string } | undefined;
    
    if (hoje > dataVencimentoSemHora && arrematante.percentualJurosAtraso) {
      // Calcular meses de atraso de forma mais precisa
      const diffTime = hoje.getTime() - dataVencimentoSemHora.getTime();
      const diasAtrasoAtual = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      const mesesAtraso = Math.floor(diffTime / (1000 * 60 * 60 * 24 * 30));
      
      if (mesesAtraso >= 1) {
        valorComJuros = calcularJurosProgressivos(valorParcela, arrematante.percentualJurosAtraso, mesesAtraso);
        valorJurosAplicado = valorComJuros - valorParcela;
      } else {
        // Se ainda não completou 1 mês (30 dias), calcular aviso de juros futuros
        const diasAte30Dias = 30 - diasAtrasoAtual;
        const valorJurosQuandoAplicado = valorParcela * (arrematante.percentualJurosAtraso / 100);
        
        avisoJurosFuturos = {
          diasRestantes: diasAte30Dias,
          percentualJuros: arrematante.percentualJurosAtraso,
          valorJurosFuturo: `R$ ${valorJurosQuandoAplicado.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        };
      }
    }

    const templateData = {
      arrematanteNome: arrematante.nome,
      leilaoNome: auction.nome,
      loteNumero: auction.lotes?.[0]?.numero,
      valorPagar: `R$ ${valorParcela.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      dataVencimento: format(dataVencimento, "dd 'de' MMMM 'de' yyyy", { locale: ptBR }),
      diasAtraso,
      valorJuros: valorJurosAplicado > 0 ? `R$ ${valorJurosAplicado.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : undefined,
      valorTotal: valorJurosAplicado > 0 ? `R$ ${valorComJuros.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : undefined,
      tipoPagamento,
      parcelaAtual,
      totalParcelas,
      avisoJurosFuturos,
    };

    const { subject, html } = getCobrancaEmailTemplate(templateData);
    const result = await enviarEmail(arrematante.email, subject, html);

    // Registrar log com identificador único por parcela
    const logIdentifier = `${auction.id}-cobranca-parcela-${parcelaAtual}`;
    await registrarLog({
      auction_id: logIdentifier,
      arrematante_nome: arrematante.nome,
      tipo_email: 'cobranca',
      email_destinatario: arrematante.email,
      data_envio: new Date().toISOString(),
      sucesso: result.success,
      erro: result.error,
    });

    return {
      success: result.success,
      message: result.success
        ? `Cobrança da parcela ${parcelaAtual}/${totalParcelas} enviada com sucesso para ${arrematante.email}`
        : `Erro ao enviar cobrança: ${result.error}`,
    };
  };

  const enviarConfirmacao = async (
    auction: Auction, 
    parcelaEspecifica?: number,
    valorEspecifico?: number
  ): Promise<{ success: boolean; message: string }> => {
    if (!auction.arrematante?.email) {
      return { success: false, message: 'Arrematante não possui email cadastrado' };
    }

    const lote = auction.lotes?.find(l => l.id === auction.arrematante?.loteId);
    const tipoPagamento = lote?.tipoPagamento || auction.tipoPagamento;
    const parcelaAtual = parcelaEspecifica !== undefined ? parcelaEspecifica : (auction.arrematante.parcelasPagas || 0);
    const totalParcelas = auction.arrematante.quantidadeParcelas || lote?.parcelasPadrao || 0;
    
    const valorFinal = valorEspecifico 
      ? `R$ ${valorEspecifico.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : (auction.arrematante.valorPagar || `R$ ${auction.arrematante.valorPagarNumerico.toFixed(2)}`);

    const templateData = {
      arrematanteNome: auction.arrematante.nome,
      leilaoNome: auction.nome,
      loteNumero: auction.lotes?.[0]?.numero,
      valorPagar: valorFinal,
      dataVencimento: '',
      tipoPagamento,
      parcelaAtual,
      totalParcelas,
    };

    const { subject, html } = getConfirmacaoPagamentoEmailTemplate(templateData);
    const result = await enviarEmail(auction.arrematante.email, subject, html);

    await registrarLog({
      auction_id: auction.id,
      arrematante_nome: auction.arrematante.nome,
      tipo_email: 'confirmacao',
      email_destinatario: auction.arrematante.email,
      data_envio: new Date().toISOString(),
      sucesso: result.success,
      erro: result.error,
    });

    return {
      success: result.success,
      message: result.success
        ? `Confirmação enviada com sucesso para ${auction.arrematante.email}`
        : `Erro ao enviar confirmação: ${result.error}`,
    };
  };

  const enviarQuitacao = async (
    auction: Auction,
    valorTotalPago?: number
  ): Promise<{ success: boolean; message: string }> => {
    if (!auction.arrematante?.email) {
      return { success: false, message: 'Arrematante não possui email cadastrado' };
    }

    const lote = auction.lotes?.find(l => l.id === auction.arrematante?.loteId);
    const tipoPagamento = lote?.tipoPagamento || auction.tipoPagamento;
    const totalParcelas = auction.arrematante.quantidadeParcelas || lote?.parcelasPadrao || 0;
    
    const valorTotal = valorTotalPago 
      ? `R$ ${valorTotalPago.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : (auction.arrematante.valorPagar || `R$ ${auction.arrematante.valorPagarNumerico.toFixed(2)}`);

    const templateData = {
      arrematanteNome: auction.arrematante.nome,
      leilaoNome: auction.nome,
      loteNumero: auction.lotes?.[0]?.numero,
      valorTotal: valorTotal,
      valorPagar: '', // Não usado no template de quitação
      dataVencimento: '', // Não usado no template de quitação
      tipoPagamento,
      totalParcelas: tipoPagamento === 'a_vista' ? undefined : totalParcelas,
    };

    const { subject, html } = getQuitacaoCompletaEmailTemplate(templateData);
    const result = await enviarEmail(auction.arrematante.email, subject, html);

    await registrarLog({
      auction_id: auction.id,
      arrematante_nome: auction.arrematante.nome,
      tipo_email: 'confirmacao', // Usar 'confirmacao' para quitação também
      email_destinatario: auction.arrematante.email,
      data_envio: new Date().toISOString(),
      sucesso: result.success,
      erro: result.error,
    });

    logger.debug(`🎉 Email de quitação completa ${result.success ? 'enviado' : 'falhou'} para ${auction.arrematante.email}`);

    return {
      success: result.success,
      message: result.success
        ? `Email de quitação enviado com sucesso para ${auction.arrematante.email}`
        : `Erro ao enviar email de quitação: ${result.error}`,
    };
  };

  /**
   * Verifica se hoje é dia de enviar cobrança mensal para uma parcela específica.
   * 
   * A cobrança é enviada no dia (vencimento + diasDepoisCobranca) de cada mês.
   * Ex: Vencimento dia 20, diasDepoisCobranca=1 → cobrança dia 21 de cada mês.
   * Se não pagar, receberá novamente no dia 21 do mês seguinte, e assim por diante.
   */
  const ehDiaDeCobrancaMensal = (dataVencimento: Date, diasDepoisCobranca: number, hoje: Date): boolean => {
    const primeiraCobranca = addDays(dataVencimento, diasDepoisCobranca);
    if (hoje < primeiraCobranca) return false;
    
    const diaCobranca = primeiraCobranca.getDate();
    const diasNoMes = getDaysInMonth(hoje);
    const diaEfetivo = Math.min(diaCobranca, diasNoMes);
    
    return hoje.getDate() >= diaEfetivo;
  };

  const verificarEEnviarAutomatico = async (auctions: Auction[]) => {
    if (!config.enviarAutomatico) return;

    setLoading(true);
    
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const resultados = {
      lembretes: 0,
      cobrancas: 0,
      erros: 0,
    };

    for (const auction of auctions) {
      if (!auction.arrematante?.email || auction.arrematante.pago || auction.arquivado) {
        continue;
      }

      const arrematante = auction.arrematante;
      const lote = auction.lotes?.find(l => l.id === arrematante?.loteId);
      const tipoPagamento = lote?.tipoPagamento || auction.tipoPagamento;
      const parcelasPagas = arrematante.parcelasPagas || 0;
      const totalParcelas = arrematante.quantidadeParcelas || lote?.parcelasPadrao || 0;

      // Para pagamento à vista
      if (tipoPagamento === 'a_vista') {
        if (!auction.dataVencimentoVista && !lote?.dataVencimentoVista) continue;
        
        const dateStr = lote?.dataVencimentoVista || auction.dataVencimentoVista || '';
        const [year, month, day] = dateStr.split('-').map(Number);
        const dataVencimento = new Date(year, month - 1, day, 0, 0, 0);
        const diasDiferenca = differenceInDays(dataVencimento, hoje);

        // Lembrete (verificação diária)
        if (diasDiferenca > 0 && diasDiferenca <= config.diasAntesLembrete) {
          const jaEnviou = await jaEnviouEmail(auction.id, 'lembrete', 1);
          if (!jaEnviou) {
            const result = await enviarLembrete(auction);
            if (result.success) resultados.lembretes++;
            else resultados.erros++;
          }
        }

        // Cobrança mensal (no dia correto de cada mês)
        if (diasDiferenca < 0 && ehDiaDeCobrancaMensal(dataVencimento, config.diasDepoisCobranca, hoje)) {
          const jaEnviou = await jaEnviouEmail(auction.id, 'cobranca', 1, 'mes');
          if (!jaEnviou) {
            const result = await enviarCobranca(auction, 1);
            if (result.success) resultados.cobrancas++;
            else resultados.erros++;
          }
        }
      }
      // Para entrada + parcelamento
      else if (tipoPagamento === 'entrada_parcelamento') {
        // Verificar entrada (parcela 1)
        if (parcelasPagas === 0 && arrematante.dataEntrada) {
          const dataVencimento = parseISO(arrematante.dataEntrada);
          const diasDiferenca = differenceInDays(dataVencimento, hoje);

          if (diasDiferenca > 0 && diasDiferenca <= config.diasAntesLembrete) {
            const jaEnviou = await jaEnviouEmail(auction.id, 'lembrete', 1);
            if (!jaEnviou) {
              const result = await enviarLembrete(auction);
              if (result.success) resultados.lembretes++;
              else resultados.erros++;
            }
          }

          if (diasDiferenca < 0 && ehDiaDeCobrancaMensal(dataVencimento, config.diasDepoisCobranca, hoje)) {
            const jaEnviou = await jaEnviouEmail(auction.id, 'cobranca', 1, 'mes');
            if (!jaEnviou) {
              const result = await enviarCobranca(auction, 1);
              if (result.success) resultados.cobrancas++;
              else resultados.erros++;
            }
          }
        }

        // Verificar parcelas após entrada (parcelas 2 em diante)
        if (arrematante.mesInicioPagamento && arrematante.diaVencimentoMensal) {
          const [startYear, startMonth] = arrematante.mesInicioPagamento.split('-').map(Number);
          
          for (let i = Math.max(1, parcelasPagas); i < totalParcelas; i++) {
            const numParcela = i + 1;
            const parcelaIndex = i - 1;
            const dataVencimento = new Date(startYear, startMonth - 1 + parcelaIndex, arrematante.diaVencimentoMensal, 0, 0, 0);
            const diasDiferenca = differenceInDays(dataVencimento, hoje);

            // Lembrete - apenas para a próxima parcela não paga
            if (diasDiferenca > 0 && diasDiferenca <= config.diasAntesLembrete && i === Math.max(1, parcelasPagas)) {
              const jaEnviou = await jaEnviouEmail(auction.id, 'lembrete', numParcela);
              if (!jaEnviou) {
                const result = await enviarLembrete(auction);
                if (result.success) resultados.lembretes++;
                else resultados.erros++;
              }
            }

            // Cobrança mensal - para CADA parcela em atraso
            if (diasDiferenca < 0 && ehDiaDeCobrancaMensal(dataVencimento, config.diasDepoisCobranca, hoje)) {
              const jaEnviou = await jaEnviouEmail(auction.id, 'cobranca', numParcela, 'mes');
              if (!jaEnviou) {
                logger.debug(`📧 Enviando cobrança mensal da parcela ${numParcela}/${totalParcelas}`);
                const result = await enviarCobranca(auction, numParcela);
                if (result.success) {
                  resultados.cobrancas++;
                  logger.debug(`✅ Cobrança da parcela ${numParcela} enviada com sucesso`);
                } else {
                  resultados.erros++;
                  logger.debug(`❌ Erro ao enviar cobrança da parcela ${numParcela}: ${result.message}`);
                }
              }
            }
          }
        }
      }
      // Para parcelamento simples
      else {
        if (!arrematante.mesInicioPagamento || !arrematante.diaVencimentoMensal) continue;
        
        const [startYear, startMonth] = arrematante.mesInicioPagamento.split('-').map(Number);
        
        for (let i = parcelasPagas; i < totalParcelas; i++) {
          const numParcela = i + 1;
          const dataVencimento = new Date(startYear, startMonth - 1 + i, arrematante.diaVencimentoMensal, 0, 0, 0);
          const diasDiferenca = differenceInDays(dataVencimento, hoje);

          // Lembrete - apenas para a próxima parcela não paga
          if (diasDiferenca > 0 && diasDiferenca <= config.diasAntesLembrete && i === parcelasPagas) {
            const jaEnviou = await jaEnviouEmail(auction.id, 'lembrete', numParcela);
            if (!jaEnviou) {
              const result = await enviarLembrete(auction);
              if (result.success) resultados.lembretes++;
              else resultados.erros++;
            }
          }

          // Cobrança mensal - para CADA parcela em atraso
          if (diasDiferenca < 0 && ehDiaDeCobrancaMensal(dataVencimento, config.diasDepoisCobranca, hoje)) {
            const jaEnviou = await jaEnviouEmail(auction.id, 'cobranca', numParcela, 'mes');
            if (!jaEnviou) {
              logger.debug(`📧 Enviando cobrança mensal da parcela ${numParcela}/${totalParcelas}`);
              const result = await enviarCobranca(auction, numParcela);
              if (result.success) {
                resultados.cobrancas++;
                logger.debug(`✅ Cobrança da parcela ${numParcela} enviada com sucesso`);
              } else {
                resultados.erros++;
                logger.debug(`❌ Erro ao enviar cobrança da parcela ${numParcela}: ${result.message}`);
              }
            }
          }
        }
      }
    }

    setLoading(false);
    return resultados;
  };

  const carregarLogs = async (limit: number = 50) => {
    const { data, error } = await supabase
      .from('email_logs')
      .select('*')
      .eq('sucesso', true)
      .order('data_envio', { ascending: false })
      .limit(limit);

    if (error) {
      logger.error('Erro ao carregar logs:', error);
      return;
    }

    setEmailLogs((data || []) as EmailLog[]);
  };

  const limparHistorico = async (): Promise<{ success: boolean; message: string }> => {
    try {
      // Usar função RPC (SECURITY DEFINER) para contornar RLS
      const { error: rpcError } = await supabase.rpc('limpar_email_logs');
      
      if (!rpcError) {
        logger.info('Histórico limpo via RPC com sucesso');
        setEmailLogs([]);
        return {
          success: true,
          message: 'Histórico limpo com sucesso'
        };
      }

      // Fallback: tentar DELETE direto (pode falhar se RLS não permitir)
      logger.warn('RPC falhou, tentando DELETE direto:', rpcError);
      
      const { error: deleteError } = await supabase
        .from('email_logs')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');

      if (deleteError) {
        logger.error('Erro ao limpar histórico:', deleteError);
        return {
          success: false,
          message: 'Erro ao limpar histórico. Verifique as permissões no Supabase.'
        };
      }

      // Verificar se realmente deletou
      const { data: remaining } = await supabase
        .from('email_logs')
        .select('id')
        .limit(1);

      if (remaining && remaining.length > 0) {
        logger.error('DELETE executou mas não removeu registros (RLS bloqueando)');
        return {
          success: false,
          message: 'Não foi possível limpar. Execute o SQL no Supabase: SELECT limpar_email_logs();'
        };
      }

      setEmailLogs([]);
      return {
        success: true,
        message: 'Histórico limpo com sucesso'
      };
    } catch (error) {
      logger.error('Erro ao limpar histórico:', error);
      return {
        success: false,
        message: 'Erro inesperado ao limpar histórico'
      };
    }
  };

  const testarEnvioCobranca = async (auction: Auction): Promise<{ success: boolean; message: string; detalhes?: string[] }> => {
    if (!auction.arrematante?.email) {
      return { success: false, message: 'Arrematante não possui email cadastrado' };
    }

    const arrematante = auction.arrematante;
    const lote = auction.lotes?.find(l => l.id === arrematante?.loteId);
    const tipoPagamento = lote?.tipoPagamento || auction.tipoPagamento;
    const parcelasPagas = arrematante.parcelasPagas || 0;
    const totalParcelas = arrematante.quantidadeParcelas || lote?.parcelasPadrao || 0;

    const detalhes: string[] = [];
    let totalEnviados = 0;
    let totalErros = 0;
    const errosDetalhados: string[] = [];

    detalhes.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    detalhes.push(`🔍 TESTE DE COBRANÇA - ${arrematante.nome}`);
    detalhes.push(`📧 Email: ${arrematante.email}`);
    detalhes.push(`📊 Tipo: ${tipoPagamento}`);
    detalhes.push(`💰 Parcelas Pagas: ${parcelasPagas}/${totalParcelas}`);
    detalhes.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    detalhes.push('');

    const hoje = new Date();

    // Para pagamento à vista
    if (tipoPagamento === 'a_vista') {
      if (!auction.dataVencimentoVista && !lote?.dataVencimentoVista) {
        const erro = '❌ Data de vencimento à vista não configurada';
        detalhes.push(erro);
        errosDetalhados.push(erro);
        logger.error(erro);
        return { success: false, message: 'Configuração incompleta', detalhes };
      }

      const dateStr = lote?.dataVencimentoVista || auction.dataVencimentoVista || '';
      const [year, month, day] = dateStr.split('-').map(Number);
      const dataVencimento = new Date(year, month - 1, day, 0, 0, 0); // ✅ CORRIGIDO
      const diasDiferenca = differenceInDays(hoje, dataVencimento); // ✅ CORRIGIDO

      detalhes.push(`💳 PAGAMENTO À VISTA:`);
      detalhes.push(`   📅 Vencimento: ${dataVencimento.toLocaleDateString('pt-BR')}`);
      detalhes.push(`   ⏰ Status: ${diasDiferenca > 0 ? `⚠️ ${diasDiferenca} dias de atraso` : diasDiferenca === 0 ? `⚠️ Vence hoje` : `✅ Vence em ${Math.abs(diasDiferenca)} dias`}`);

      if (diasDiferenca >= 0) { // ✅ CORRIGIDO
        detalhes.push('   📧 Enviando email de cobrança...');
        logger.debug('📧 Enviando cobrança à vista...');
        
        try {
          const result = await enviarCobranca(auction, 1, true); // forcarEnvio = true para teste
          if (result.success) {
            totalEnviados++;
            detalhes.push(`   ✅ ${result.message}`);
            logger.debug('✅ Cobrança à vista enviada:', result.message);
          } else {
            totalErros++;
            const erro = `   ❌ ERRO: ${result.message}`;
            detalhes.push(erro);
            errosDetalhados.push(`À Vista - ${result.message}`);
            logger.error('❌ Erro ao enviar cobrança à vista:', result.message);
          }
        } catch (error) {
          totalErros++;
          const mensagemErro = error instanceof Error ? error.message : 'Erro desconhecido';
          const erro = `   ❌ EXCEÇÃO: ${mensagemErro}`;
          detalhes.push(erro);
          errosDetalhados.push(`À Vista - ${mensagemErro}`);
          logger.error('❌ Exceção ao enviar cobrança à vista:', error);
        }
      } else {
        detalhes.push('   ℹ️ Pagamento não está em atraso ainda');
        logger.debug('ℹ️ À vista não está em atraso');
      }
      detalhes.push('');
    }
    // Para entrada + parcelamento
    else if (tipoPagamento === 'entrada_parcelamento') {
      // Verificar entrada
      if (parcelasPagas === 0 && arrematante.dataEntrada) {
        const dataVencimento = parseISO(arrematante.dataEntrada);
        const diasDiferenca = differenceInDays(hoje, dataVencimento); // ✅ CORRIGIDO
        
        detalhes.push(`💰 ENTRADA (Parcela 1):`);
        detalhes.push(`   📅 Vencimento: ${dataVencimento.toLocaleDateString('pt-BR')}`);
        detalhes.push(`   ⏰ Status: ${diasDiferenca > 0 ? `⚠️ ${diasDiferenca} dias de atraso` : diasDiferenca === 0 ? `⚠️ Vence hoje` : `✅ Vence em ${Math.abs(diasDiferenca)} dias`}`);

        if (diasDiferenca >= 0) { // ✅ CORRIGIDO
          detalhes.push('   📧 Enviando email de cobrança...');
          logger.debug('📧 Enviando cobrança da entrada...');
          
          try {
            const result = await enviarCobranca(auction, 1, true); // forcarEnvio = true para teste
            if (result.success) {
              totalEnviados++;
              detalhes.push(`   ✅ ${result.message}`);
              logger.debug('✅ Cobrança da entrada enviada:', result.message);
            } else {
              totalErros++;
              const erro = `   ❌ ERRO: ${result.message}`;
              detalhes.push(erro);
              errosDetalhados.push(`Entrada - ${result.message}`);
              logger.error('❌ Erro ao enviar cobrança da entrada:', result.message);
            }
          } catch (error) {
            totalErros++;
            const mensagemErro = error instanceof Error ? error.message : 'Erro desconhecido';
            const erro = `   ❌ EXCEÇÃO: ${mensagemErro}`;
            detalhes.push(erro);
            errosDetalhados.push(`Entrada - ${mensagemErro}`);
            logger.error('❌ Exceção ao enviar cobrança da entrada:', error);
          }
        } else {
          detalhes.push('   ℹ️ Entrada não está em atraso ainda');
        }
        detalhes.push('');
      }

      // Verificar parcelas
      if (arrematante.mesInicioPagamento && arrematante.diaVencimentoMensal) {
        const [startYear, startMonth] = arrematante.mesInicioPagamento.split('-').map(Number);
        
        for (let i = Math.max(1, parcelasPagas); i < totalParcelas; i++) {
          const numParcela = i + 1;
          const parcelaIndex = i - 1;
          const dataVencimento = new Date(startYear, startMonth - 1 + parcelaIndex, arrematante.diaVencimentoMensal, 0, 0, 0); // ✅ CORRIGIDO
          const diasDiferenca = differenceInDays(hoje, dataVencimento); // ✅ CORRIGIDO

          detalhes.push(`📦 PARCELA ${numParcela - 1}/${totalParcelas - 1} (Parcela ${numParcela} do sistema):`);
          detalhes.push(`   📅 Vencimento: ${dataVencimento.toLocaleDateString('pt-BR')}`);
          detalhes.push(`   ⏰ Status: ${diasDiferenca > 0 ? `⚠️ ${diasDiferenca} dias de atraso` : diasDiferenca === 0 ? `⚠️ Vence hoje` : `✅ Vence em ${Math.abs(diasDiferenca)} dias`}`);

          if (diasDiferenca >= 0) { // ✅ CORRIGIDO
            detalhes.push('   📧 Enviando email de cobrança...');
            logger.debug(`📧 Enviando cobrança da parcela ${numParcela}...`);
            
            try {
              const result = await enviarCobranca(auction, numParcela, true); // forcarEnvio = true para teste
              if (result.success) {
                totalEnviados++;
                detalhes.push(`   ✅ ${result.message}`);
                logger.debug(`✅ Cobrança da parcela ${numParcela} enviada:`, result.message);
              } else {
                totalErros++;
                const erro = `   ❌ ERRO: ${result.message}`;
                detalhes.push(erro);
                errosDetalhados.push(`Parcela ${numParcela} - ${result.message}`);
                logger.error(`❌ Erro ao enviar cobrança da parcela ${numParcela}:`, result.message);
              }
            } catch (error) {
              totalErros++;
              const mensagemErro = error instanceof Error ? error.message : 'Erro desconhecido';
              const erro = `   ❌ EXCEÇÃO: ${mensagemErro}`;
              detalhes.push(erro);
              errosDetalhados.push(`Parcela ${numParcela} - ${mensagemErro}`);
              logger.error(`❌ Exceção ao enviar cobrança da parcela ${numParcela}:`, error);
            }
          } else {
            detalhes.push(`   ℹ️ Parcela não está em atraso ainda`);
          }
          detalhes.push('');
        }
      }
    }
    // Para parcelamento simples
    else {
      if (!arrematante.mesInicioPagamento || !arrematante.diaVencimentoMensal) {
        const erro = '❌ Mês de início ou dia de vencimento não configurado';
        detalhes.push(erro);
        errosDetalhados.push(erro);
        logger.error(erro);
        return { success: false, message: 'Configuração incompleta', detalhes };
      }

      const [startYear, startMonth] = arrematante.mesInicioPagamento.split('-').map(Number);
      
      for (let i = parcelasPagas; i < totalParcelas; i++) {
        const numParcela = i + 1;
        const dataVencimento = new Date(startYear, startMonth - 1 + i, arrematante.diaVencimentoMensal, 0, 0, 0);
        const diasDiferenca = differenceInDays(hoje, dataVencimento); // ✅ CORRIGIDO: hoje primeiro, depois vencimento

        detalhes.push(`📦 PARCELA ${numParcela}/${totalParcelas}:`);
        detalhes.push(`   📅 Vencimento: ${dataVencimento.toLocaleDateString('pt-BR')}`);
        detalhes.push(`   ⏰ Status: ${diasDiferenca > 0 ? `⚠️ ${diasDiferenca} dias de atraso` : diasDiferenca === 0 ? `⚠️ Vence hoje` : `✅ Vence em ${Math.abs(diasDiferenca)} dias`}`);

        if (diasDiferenca >= 0) { // ✅ CORRIGIDO: >= 0 para incluir "vence hoje"
          detalhes.push('   📧 Enviando email de cobrança...');
          logger.debug(`📧 Enviando cobrança da parcela ${numParcela}/${totalParcelas}...`);
          
          try {
            const result = await enviarCobranca(auction, numParcela, true); // forcarEnvio = true para teste
            if (result.success) {
              totalEnviados++;
              detalhes.push(`   ✅ ${result.message}`);
              logger.debug(`✅ Cobrança da parcela ${numParcela} enviada:`, result.message);
            } else {
              totalErros++;
              const erro = `   ❌ ERRO: ${result.message}`;
              detalhes.push(erro);
              errosDetalhados.push(`Parcela ${numParcela} - ${result.message}`);
              logger.error(`❌ Erro ao enviar cobrança da parcela ${numParcela}:`, result.message);
            }
          } catch (error) {
            totalErros++;
            const mensagemErro = error instanceof Error ? error.message : 'Erro desconhecido';
            const erro = `   ❌ EXCEÇÃO: ${mensagemErro}`;
            detalhes.push(erro);
            errosDetalhados.push(`Parcela ${numParcela} - ${mensagemErro}`);
            logger.error(`❌ Exceção ao enviar cobrança da parcela ${numParcela}:`, error);
          }
        } else {
          detalhes.push(`   ℹ️ Parcela não está em atraso ainda`);
        }
        detalhes.push('');
      }
    }

    detalhes.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    detalhes.push(`📊 RESUMO DO TESTE:`);
    detalhes.push(`   ✅ Emails enviados: ${totalEnviados}`);
    detalhes.push(`   ❌ Erros: ${totalErros}`);
    
    if (errosDetalhados.length > 0) {
      detalhes.push('');
      detalhes.push('❌ DETALHES DOS ERROS:');
      errosDetalhados.forEach(erro => {
        detalhes.push(`   • ${erro}`);
      });
    }
    
    detalhes.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    logger.debug('📊 RESUMO DO TESTE:', {
      totalEnviados,
      totalErros,
      erros: errosDetalhados
    });

    return {
      success: totalEnviados > 0,
      message: totalEnviados > 0 
        ? `✅ ${totalEnviados} email(s) de cobrança enviado(s) com sucesso!`
        : totalErros > 0
          ? `❌ Erro ao enviar emails. Total de erros: ${totalErros}`
          : 'ℹ️ Nenhuma parcela em atraso encontrada',
      detalhes
    };
  };

  return {
    config,
    loading,
    emailLogs,
    saveConfig,
    enviarLembrete,
    enviarCobranca,
    enviarConfirmacao,
    enviarQuitacao,
    verificarEEnviarAutomatico,
    carregarLogs,
    limparHistorico,
    jaEnviouEmail,
    testarEnvioCobranca,
  };
}



