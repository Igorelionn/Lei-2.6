import { useEffect, useRef } from 'react';
import { useEmailNotifications } from './use-email-notifications';
import { useSupabaseAuctions } from './use-supabase-auctions';
import { parseISO, differenceInDays, isAfter, isBefore } from 'date-fns';
import { logger } from '@/lib/logger';

/**
 * Hook para envio automático de emails de lembretes e cobranças
 * 
 * Funcionalidades:
 * - Envia lembretes X dias antes do vencimento (configurável)
 * - Envia cobranças X dias após o vencimento (configurável)
 * - Só envia para arrematantes que NÃO pagaram
 * - Respeita configurações da aba Configurações
 * - Previne envios duplicados no mesmo dia
 * - Executa verificação a cada 5 minutos
 */
export function useAutoEmailNotifications() {
  const { auctions } = useSupabaseAuctions();
  const { config, enviarLembrete, enviarCobranca, jaEnviouEmail } = useEmailNotifications();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const ultimaVerificacaoRef = useRef<string>('');
  
  // 🔒 FIX MEMORY LEAK: Usar refs para evitar recriação do interval
  const auctionsRef = useRef(auctions);
  const configRef = useRef(config);
  const enviarLembreteRef = useRef(enviarLembrete);
  const enviarCobrancaRef = useRef(enviarCobranca);
  const jaEnviouEmailRef = useRef(jaEnviouEmail);
  
  // Atualizar refs quando valores mudarem
  useEffect(() => {
    auctionsRef.current = auctions;
  }, [auctions]);
  
  useEffect(() => {
    configRef.current = config;
  }, [config]);
  
  useEffect(() => {
    enviarLembreteRef.current = enviarLembrete;
    enviarCobrancaRef.current = enviarCobranca;
    jaEnviouEmailRef.current = jaEnviouEmail;
  }, [enviarLembrete, enviarCobranca, jaEnviouEmail]);

  // Função para verificar e enviar emails automáticos
  const verificarEEnviarEmails = async () => {
    // 🔒 Usar valores das refs (sempre atualizados)
    const currentConfig = configRef.current;
    const currentAuctions = auctionsRef.current;
    const currentEnviarLembrete = enviarLembreteRef.current;
    const currentEnviarCobranca = enviarCobrancaRef.current;
    const currentJaEnviouEmail = jaEnviouEmailRef.current;
    
    // Só executa se o envio automático estiver ativado
    if (!currentConfig.enviarAutomatico) {
      return;
    }

    // Prevenir múltiplas verificações no mesmo minuto
    const agora = new Date().toISOString().substring(0, 16); // YYYY-MM-DDTHH:mm
    if (ultimaVerificacaoRef.current === agora) {
      return;
    }
    ultimaVerificacaoRef.current = agora;

    logger.info('Verificando pagamentos para envio automático de emails');

    const hoje = new Date();
    let lembretesEnviados = 0;
    let cobrancasEnviadas = 0;

    for (const auction of currentAuctions) {
      // Pular se já está arquivado
      if (auction.arquivado) {
        continue;
      }

      // Obter todos os arrematantes (compatibilidade com estrutura antiga e nova)
      const arrematantes = auction.arrematantes || (auction.arrematante ? [auction.arrematante] : []);
      
      // Pular se não tem arrematantes
      if (arrematantes.length === 0) {
        continue;
      }

      // Processar cada arrematante do leilão
      for (const arrematante of arrematantes) {
        // Pular se não tem email
        if (!arrematante.email) {
          continue;
        }

        // Pular se já pagou
        if (arrematante.pago) {
          continue;
        }

        // Encontrar o lote arrematado para verificar o tipo de pagamento
        const loteArrematado = arrematante.loteId 
          ? auction.lotes?.find(lote => lote.id === arrematante.loteId)
          : null;
        
        // Usar tipo de pagamento do lote ou do leilão
        const tipoPagamento = loteArrematado?.tipoPagamento || auction.tipoPagamento;

        // Determinar data de vencimento
        let dataVencimento: Date | null = null;

        // Para pagamento à vista
        if (tipoPagamento === 'a_vista') {
          const dataVista = loteArrematado?.dataVencimentoVista || auction.dataVencimentoVista;
          if (dataVista) {
            dataVencimento = parseISO(dataVista);
          }
        }
        // Para pagamento com entrada
        else if (tipoPagamento === 'entrada_parcelamento') {
          const dataEntrada = loteArrematado?.dataEntrada || arrematante.dataEntrada;
          if (dataEntrada) {
            dataVencimento = parseISO(dataEntrada);
          }
        }
        // Para parcelamento
        else if (arrematante.mesInicioPagamento && arrematante.diaVencimentoMensal) {
          const [ano, mes] = arrematante.mesInicioPagamento.split('-');
          dataVencimento = new Date(parseInt(ano), parseInt(mes) - 1, arrematante.diaVencimentoMensal);
        }

        // Se não tem data de vencimento, pular
        if (!dataVencimento) {
          continue;
        }

        const diasDiferenca = differenceInDays(dataVencimento, hoje);

        // Criar um objeto auction com o arrematante específico para os emails
        const auctionComArrematante = {
          ...auction,
          arrematante: arrematante
        };

        // LEMBRETE: Enviar X dias antes do vencimento
        if (diasDiferenca > 0 && diasDiferenca <= currentConfig.diasAntesLembrete) {
          // Verificar se já enviou lembrete hoje (usar ID do arrematante se disponível)
          const emailId = arrematante.id ? `${auction.id}_${arrematante.id}` : auction.id;
          const jaEnviou = await currentJaEnviouEmail(emailId, 'lembrete');
          
          if (jaEnviou) {
            logger.debug('Lembrete já enviado hoje, pulando', { nome: arrematante.nome });
            continue;
          }
          
          logger.info('Enviando lembrete', { nome: arrematante.nome, diasRestantes: diasDiferenca });
          
          const resultado = await currentEnviarLembrete(auctionComArrematante);
          if (resultado.success) {
            lembretesEnviados++;
            logger.info('Lembrete enviado com sucesso', { nome: arrematante.nome });
          } else {
            logger.error('Erro ao enviar lembrete', { nome: arrematante.nome, erro: resultado.message });
          }
        }

        // COBRANÇA: Enviar X dias após o vencimento
        if (diasDiferenca < 0 && Math.abs(diasDiferenca) >= currentConfig.diasDepoisCobranca) {
          // Verificar se já enviou cobrança hoje (usar ID do arrematante se disponível)
          const emailId = arrematante.id ? `${auction.id}_${arrematante.id}` : auction.id;
          const jaEnviou = await currentJaEnviouEmail(emailId, 'cobranca');
          
          if (jaEnviou) {
            logger.debug('Cobrança já enviada hoje, pulando', { nome: arrematante.nome });
            continue;
          }
          
          logger.warn('Enviando cobrança', { nome: arrematante.nome, diasAtraso: Math.abs(diasDiferenca) });
          
          const resultado = await currentEnviarCobranca(auctionComArrematante);
          if (resultado.success) {
            cobrancasEnviadas++;
            logger.info('Cobrança enviada com sucesso', { nome: arrematante.nome });
          } else {
            logger.error('Erro ao enviar cobrança', { nome: arrematante.nome, erro: resultado.message });
          }
        }
      }
    }

    if (lembretesEnviados > 0 || cobrancasEnviadas > 0) {
      logger.info('Emails enviados automaticamente', { lembretes: lembretesEnviados, cobrancas: cobrancasEnviadas });
    } else {
      logger.debug('Nenhum email precisou ser enviado neste momento');
    }
  };

  // Executar verificação ao montar o componente e a cada 5 minutos
  useEffect(() => {
    // 🔒 FIX MEMORY LEAK: Limpar interval ANTES de criar novo
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    
    // Só inicia se o envio automático estiver ativado
    if (!config.enviarAutomatico) {
      logger.info('Envio automático de emails está desativado');
      return;
    }

    logger.info('Sistema de envio automático de emails ATIVADO', {
      intervalo: '5 minutos',
      diasAntesLembrete: config.diasAntesLembrete,
      diasDepoisCobranca: config.diasDepoisCobranca
    });

    // Executar imediatamente
    verificarEEnviarEmails();

    // Executar a cada 5 minutos (300000 ms)
    intervalRef.current = setInterval(verificarEEnviarEmails, 300000);

    // Limpar intervalo ao desmontar
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
        logger.info('Sistema de envio automático desativado');
      }
    };
  }, [config.enviarAutomatico, config.diasAntesLembrete, config.diasDepoisCobranca]);
  // 🔒 FIX MEMORY LEAK: Remover 'auctions' das dependências (usar ref)

  return {
    verificando: config.enviarAutomatico,
  };
}

