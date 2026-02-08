import { useEffect, useRef } from 'react';
import { useEmailNotifications } from './use-email-notifications';
import { useSupabaseAuctions } from './use-supabase-auctions';
import { parseISO, differenceInDays, addDays, getDaysInMonth } from 'date-fns';
import { logger } from '@/lib/logger';

/**
 * Hook para envio automático de emails de lembretes e cobranças
 * 
 * Lógica de envio:
 * 
 * LEMBRETE (preventivo):
 * - Enviado X dias antes do vencimento da próxima parcela não paga
 * - Verificação diária (1x por dia por parcela)
 * - Padrão: 3 dias antes do vencimento
 * 
 * COBRANÇA (inadimplência):
 * - Enviado MENSALMENTE no dia correto: (dia do vencimento + diasDepoisCobranca)
 * - Exemplo: Vencimento dia 20, diasDepoisCobranca=1 → cobrança dia 21 de cada mês
 * - Se não pagar em fevereiro, receberá novamente dia 21 de março, abril, etc.
 * - Enviado para CADA parcela em atraso individualmente
 * - Verificação mensal (1x por mês por parcela)
 * 
 * CONFIRMAÇÃO DE PAGAMENTO:
 * - Enviada automaticamente ao confirmar pagamento (via tela de Arrematantes)
 * - NÃO é processada por este hook (é acionada manualmente pelo usuário)
 * 
 * Executa verificação a cada 5 minutos
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
  useEffect(() => { auctionsRef.current = auctions; }, [auctions]);
  useEffect(() => { configRef.current = config; }, [config]);
  useEffect(() => {
    enviarLembreteRef.current = enviarLembrete;
    enviarCobrancaRef.current = enviarCobranca;
    jaEnviouEmailRef.current = jaEnviouEmail;
  }, [enviarLembrete, enviarCobranca, jaEnviouEmail]);

  /**
   * Verifica se hoje é dia de enviar cobrança mensal para uma parcela específica.
   * 
   * A cobrança é enviada no dia (vencimento + diasDepoisCobranca) de cada mês.
   * Se o mês atual tem menos dias, ajusta para o último dia do mês.
   * Se o sistema estiver offline no dia exato, envia ao voltar (se ainda no mesmo mês).
   * 
   * Exemplo com vencimento dia 20 e diasDepoisCobranca=1:
   * - Fev 21: envia ✓
   * - Fev 22: já enviou em fev → pula ✓
   * - Mar 21: envia ✓ (novo mês)
   * - Mar 22: já enviou em mar → pula ✓
   */
  const ehDiaDeCobrancaMensal = (dataVencimento: Date, diasDepoisCobranca: number, hoje: Date): boolean => {
    // Calcular a primeira data de cobrança
    const primeiraCobranca = addDays(dataVencimento, diasDepoisCobranca);
    
    // Se ainda não chegou na primeira data de cobrança, não enviar
    if (hoje < primeiraCobranca) return false;
    
    // Dia do mês em que a cobrança deve ser enviada
    const diaCobranca = primeiraCobranca.getDate();
    
    // Ajustar para meses com menos dias (ex: fev tem 28 dias, dia 31 → dia 28)
    const diasNoMes = getDaysInMonth(hoje);
    const diaEfetivo = Math.min(diaCobranca, diasNoMes);
    
    // Verificar se hoje é o dia de cobrança ou posterior (caso sistema estivesse offline)
    return hoje.getDate() >= diaEfetivo;
  };

  // Função principal de verificação
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

    logger.info('🔍 Verificando pagamentos para envio automático de emails');

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    let lembretesEnviados = 0;
    let cobrancasEnviadas = 0;

    for (const auction of currentAuctions) {
      // Pular se já está arquivado
      if (auction.arquivado) continue;

      // Obter todos os arrematantes (compatibilidade com estrutura antiga e nova)
      const arrematantes = auction.arrematantes || (auction.arrematante ? [auction.arrematante] : []);
      if (arrematantes.length === 0) continue;

      // Processar cada arrematante do leilão
      for (const arrematante of arrematantes) {
        // Pular se não tem email ou já pagou tudo
        if (!arrematante.email || arrematante.pago) continue;

        // Encontrar o lote arrematado
        const lote = arrematante.loteId 
          ? auction.lotes?.find(l => l.id === arrematante.loteId) 
          : null;
        const tipoPagamento = lote?.tipoPagamento || auction.tipoPagamento;
        const parcelasPagas = arrematante.parcelasPagas || 0;
        const totalParcelas = arrematante.quantidadeParcelas || lote?.parcelasPadrao || 0;

        // Criar um objeto auction com o arrematante específico para os emails
        const auctionComArrematante = {
          ...auction,
          arrematante: arrematante
        };

        // ==========================================
        // PAGAMENTO À VISTA
        // ==========================================
        if (tipoPagamento === 'a_vista') {
          const dataStr = lote?.dataVencimentoVista || auction.dataVencimentoVista;
          if (!dataStr) continue;
          
          const [year, month, day] = dataStr.split('-').map(Number);
          const dataVencimento = new Date(year, month - 1, day, 0, 0, 0);
          const diasDiferenca = differenceInDays(dataVencimento, hoje);

          // LEMBRETE: X dias antes do vencimento (verificação diária)
          if (diasDiferenca > 0 && diasDiferenca <= currentConfig.diasAntesLembrete) {
            const jaEnviou = await currentJaEnviouEmail(auction.id, 'lembrete', 1);
            if (!jaEnviou) {
              logger.info('📨 Enviando lembrete (à vista)', { 
                nome: arrematante.nome, 
                diasRestantes: diasDiferenca 
              });
              const resultado = await currentEnviarLembrete(auctionComArrematante);
              if (resultado.success) lembretesEnviados++;
            }
          }

          // COBRANÇA MENSAL: No dia correto de cada mês (verificação mensal)
          if (diasDiferenca < 0 && ehDiaDeCobrancaMensal(dataVencimento, currentConfig.diasDepoisCobranca, hoje)) {
            const jaEnviou = await currentJaEnviouEmail(auction.id, 'cobranca', 1, 'mes');
            if (!jaEnviou) {
              logger.warn('📨 Enviando cobrança mensal (à vista)', { 
                nome: arrematante.nome, 
                diasAtraso: Math.abs(diasDiferenca)
              });
              const resultado = await currentEnviarCobranca(auctionComArrematante, 1);
              if (resultado.success) cobrancasEnviadas++;
            }
          }
        }
        // ==========================================
        // ENTRADA + PARCELAMENTO
        // ==========================================
        else if (tipoPagamento === 'entrada_parcelamento') {
          // --- ENTRADA (parcela 1) ---
          if (parcelasPagas === 0 && arrematante.dataEntrada) {
            const dataVencEntrada = parseISO(arrematante.dataEntrada);
            const diasDiferenca = differenceInDays(dataVencEntrada, hoje);

            // Lembrete para entrada
            if (diasDiferenca > 0 && diasDiferenca <= currentConfig.diasAntesLembrete) {
              const jaEnviou = await currentJaEnviouEmail(auction.id, 'lembrete', 1);
              if (!jaEnviou) {
                logger.info('📨 Enviando lembrete (entrada)', { 
                  nome: arrematante.nome, 
                  diasRestantes: diasDiferenca 
                });
                const resultado = await currentEnviarLembrete(auctionComArrematante);
                if (resultado.success) lembretesEnviados++;
              }
            }

            // Cobrança mensal para entrada
            if (diasDiferenca < 0 && ehDiaDeCobrancaMensal(dataVencEntrada, currentConfig.diasDepoisCobranca, hoje)) {
              const jaEnviou = await currentJaEnviouEmail(auction.id, 'cobranca', 1, 'mes');
              if (!jaEnviou) {
                logger.warn('📨 Enviando cobrança mensal (entrada)', { 
                  nome: arrematante.nome, 
                  diasAtraso: Math.abs(diasDiferenca) 
                });
                const resultado = await currentEnviarCobranca(auctionComArrematante, 1);
                if (resultado.success) cobrancasEnviadas++;
              }
            }
          }

          // --- PARCELAS após entrada (parcela 2, 3, 4...) ---
          if (arrematante.mesInicioPagamento && arrematante.diaVencimentoMensal) {
            const [startYear, startMonth] = arrematante.mesInicioPagamento.split('-').map(Number);
            
            for (let i = Math.max(1, parcelasPagas); i < totalParcelas; i++) {
              const numParcela = i + 1; // Número da parcela (2, 3, 4...)
              const parcelaIndex = i - 1; // Índice 0-based para calcular data
              const dataVencimento = new Date(
                startYear, 
                startMonth - 1 + parcelaIndex, 
                arrematante.diaVencimentoMensal, 
                0, 0, 0
              );
              const diasDiferenca = differenceInDays(dataVencimento, hoje);

              // LEMBRETE - Apenas para a PRÓXIMA parcela não paga
              if (i === Math.max(1, parcelasPagas) && diasDiferenca > 0 && diasDiferenca <= currentConfig.diasAntesLembrete) {
                const jaEnviou = await currentJaEnviouEmail(auction.id, 'lembrete', numParcela);
                if (!jaEnviou) {
                  logger.info('📨 Enviando lembrete (parcela)', { 
                    nome: arrematante.nome, 
                    parcela: `${numParcela}/${totalParcelas}`,
                    diasRestantes: diasDiferenca 
                  });
                  const resultado = await currentEnviarLembrete(auctionComArrematante);
                  if (resultado.success) lembretesEnviados++;
                }
              }

              // COBRANÇA MENSAL - Para CADA parcela em atraso
              if (diasDiferenca < 0 && ehDiaDeCobrancaMensal(dataVencimento, currentConfig.diasDepoisCobranca, hoje)) {
                const jaEnviou = await currentJaEnviouEmail(auction.id, 'cobranca', numParcela, 'mes');
                if (!jaEnviou) {
                  logger.warn('📨 Enviando cobrança mensal', { 
                    nome: arrematante.nome, 
                    parcela: `${numParcela}/${totalParcelas}`,
                    diasAtraso: Math.abs(diasDiferenca)
                  });
                  const resultado = await currentEnviarCobranca(auctionComArrematante, numParcela);
                  if (resultado.success) cobrancasEnviadas++;
                }
              }
            }
          }
        }
        // ==========================================
        // PARCELAMENTO SIMPLES
        // ==========================================
        else {
          if (!arrematante.mesInicioPagamento || !arrematante.diaVencimentoMensal) continue;
          
          const [startYear, startMonth] = arrematante.mesInicioPagamento.split('-').map(Number);
          
          for (let i = parcelasPagas; i < totalParcelas; i++) {
            const numParcela = i + 1; // Parcela 1, 2, 3...
            const dataVencimento = new Date(
              startYear, 
              startMonth - 1 + i, 
              arrematante.diaVencimentoMensal, 
              0, 0, 0
            );
            const diasDiferenca = differenceInDays(dataVencimento, hoje);

            // LEMBRETE - Apenas para a PRÓXIMA parcela não paga
            if (i === parcelasPagas && diasDiferenca > 0 && diasDiferenca <= currentConfig.diasAntesLembrete) {
              const jaEnviou = await currentJaEnviouEmail(auction.id, 'lembrete', numParcela);
              if (!jaEnviou) {
                logger.info('📨 Enviando lembrete (parcela)', { 
                  nome: arrematante.nome, 
                  parcela: `${numParcela}/${totalParcelas}`,
                  diasRestantes: diasDiferenca 
                });
                const resultado = await currentEnviarLembrete(auctionComArrematante);
                if (resultado.success) lembretesEnviados++;
              }
            }

            // COBRANÇA MENSAL - Para CADA parcela em atraso
            if (diasDiferenca < 0 && ehDiaDeCobrancaMensal(dataVencimento, currentConfig.diasDepoisCobranca, hoje)) {
              const jaEnviou = await currentJaEnviouEmail(auction.id, 'cobranca', numParcela, 'mes');
              if (!jaEnviou) {
                logger.warn('📨 Enviando cobrança mensal', { 
                  nome: arrematante.nome, 
                  parcela: `${numParcela}/${totalParcelas}`,
                  diasAtraso: Math.abs(diasDiferenca)
                });
                const resultado = await currentEnviarCobranca(auctionComArrematante, numParcela);
                if (resultado.success) cobrancasEnviadas++;
              }
            }
          }
        }
      }
    }

    if (lembretesEnviados > 0 || cobrancasEnviadas > 0) {
      logger.info('✅ Emails enviados automaticamente', { 
        lembretes: lembretesEnviados, 
        cobrancas: cobrancasEnviadas 
      });
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

    logger.info('✅ Sistema de envio automático de emails ATIVADO', {
      intervalo: '5 minutos',
      diasAntesLembrete: config.diasAntesLembrete,
      diasDepoisCobranca: config.diasDepoisCobranca,
      logica: `Lembrete: ${config.diasAntesLembrete} dia(s) antes | Cobrança: dia ${config.diasDepoisCobranca} após vencimento, mensalmente`
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
