import { useEffect, useRef } from 'react';
import { useEmailNotifications } from './use-email-notifications';
import { useSupabaseAuctions } from './use-supabase-auctions';
import { Auction } from '@/lib/types';
import { logger } from '@/lib/logger';

/**
 * Hook para monitorar mudanças de status de pagamento e enviar confirmações automáticas
 * 
 * Funcionalidade:
 * - Detecta quando um arrematante é marcado como pago
 * - Envia email de confirmação automaticamente
 * - Previne envios duplicados
 */
export function usePaymentEmailWatcher() {
  const { auctions } = useSupabaseAuctions();
  const { enviarConfirmacao, jaEnviouEmail } = useEmailNotifications();
  const pagosPreviousRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    // Log para debug
    logger.debug('PaymentWatcher: Verificando pagamentos', {
      totalAuctions: auctions.length,
      comArrematante: auctions.filter(a => a.arrematante).length,
      pagos: auctions.filter(a => a.arrematante?.pago).length
    });

    // Criar um Set dos IDs dos leilões cujos arrematantes já foram pagos
    const pagosAtuais = new Set<string>();
    const novoPagos: Auction[] = [];

    auctions.forEach(auction => {
      if (auction.arrematante?.pago && auction.arrematante?.email) {
        pagosAtuais.add(auction.id);
        
        // Se não estava no set anterior, é um novo pagamento
        if (!pagosPreviousRef.current.has(auction.id)) {
          logger.info('PaymentWatcher: Novo pagamento detectado', {
            arrematante: auction.arrematante.nome,
            email: auction.arrematante.email,
            auctionId: auction.id
          });
          novoPagos.push(auction);
        }
      }
    });

    // Enviar confirmações para novos pagamentos
    if (novoPagos.length > 0) {
      logger.info('PaymentWatcher: Detectados novos pagamentos, enviando confirmações', { quantidade: novoPagos.length });
      
      // Processar cada pagamento sequencialmente
      (async () => {
        for (const auction of novoPagos) {
          try {
            // Verificar se já enviou (segurança extra)
            const jaEnviou = await jaEnviouEmail(auction.id, 'confirmacao');
            
            if (jaEnviou) {
              logger.debug('PaymentWatcher: Confirmação já enviada, pulando', { nome: auction.arrematante?.nome });
              continue;
            }

            logger.info('PaymentWatcher: Enviando confirmação de pagamento', { nome: auction.arrematante?.nome });
            const resultado = await enviarConfirmacao(auction);
            
            if (resultado.success) {
              logger.info('PaymentWatcher: Confirmação enviada com sucesso', { nome: auction.arrematante?.nome });
            } else {
              logger.error('PaymentWatcher: Erro ao enviar confirmação', { nome: auction.arrematante?.nome, erro: resultado.message });
            }
          } catch (error) {
            logger.error('PaymentWatcher: Erro ao processar pagamento', { error });
          }
        }
      })();
    }

    // Atualizar referência
    pagosPreviousRef.current = pagosAtuais;
  }, [auctions, enviarConfirmacao, jaEnviouEmail]);

  return {};
}

