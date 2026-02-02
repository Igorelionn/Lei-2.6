import { useAuth } from './use-auth';
import { useCallback } from 'react';

export interface ActivityLogOptions {
  targetType?: string;
  targetId?: string;
  metadata?: Record<string, unknown>; // Objeto indexado por string com valores de qualquer tipo
  oldValue?: unknown; // Valor anterior em atualizações (pode ser qualquer tipo)
  newValue?: unknown; // Valor novo em atualizações (pode ser qualquer tipo)
}

export function useActivityLogger() {
  const { logUserAction } = useAuth();

  // Logging para leilões
  const logAuctionAction = useCallback(async (
    action: 'create' | 'update' | 'delete' | 'archive' | 'unarchive' | 'duplicate',
    auctionName: string,
    auctionId: string,
    options?: ActivityLogOptions
  ) => {
    const actionDescriptions = {
      create: `Criou o leilão "${auctionName}"`,
      update: `Editou o leilão "${auctionName}"`,
      delete: `Excluiu o leilão "${auctionName}"`,
      archive: `Arquivou o leilão "${auctionName}"`,
      unarchive: `Desarquivou o leilão "${auctionName}"`,
      duplicate: `Duplicou o leilão "${auctionName}"`
    };

    await logUserAction(
      `auction_${action}`,
      actionDescriptions[action],
      'auction',
      auctionId,
      options?.metadata
    );
  }, [logUserAction]);

  // Logging para arrematantes
  const logBidderAction = useCallback(async (
    action: 'create' | 'update' | 'delete' | 'payment_update',
    bidderName: string,
    auctionName: string,
    auctionId: string,
    options?: ActivityLogOptions
  ) => {
    const actionDescriptions = {
      create: `Adicionou arrematante "${bidderName}" ao leilão "${auctionName}"`,
      update: `Editou dados do arrematante "${bidderName}" no leilão "${auctionName}"`,
      delete: `Removeu arrematante "${bidderName}" do leilão "${auctionName}"`,
      payment_update: `Atualizou pagamentos do arrematante "${bidderName}" no leilão "${auctionName}"`
    };

    await logUserAction(
      `bidder_${action}`,
      actionDescriptions[action],
      'bidder',
      auctionId,
      {
        bidder_name: bidderName,
        auction_name: auctionName,
        ...options?.metadata
      }
    );
  }, [logUserAction]);

  // Logging para documentos
  const logDocumentAction = useCallback(async (
    action: 'upload' | 'delete' | 'view',
    documentName: string,
    targetType: 'auction' | 'bidder',
    targetName: string,
    targetId: string,
    options?: ActivityLogOptions
  ) => {
    const actionDescriptions = {
      upload: `Fez upload do documento "${documentName}" em ${targetType === 'auction' ? 'leilão' : 'arrematante'} "${targetName}"`,
      delete: `Removeu o documento "${documentName}" de ${targetType === 'auction' ? 'leilão' : 'arrematante'} "${targetName}"`,
      view: `Visualizou o documento "${documentName}" de ${targetType === 'auction' ? 'leilão' : 'arrematante'} "${targetName}"`
    };

    await logUserAction(
      `document_${action}`,
      actionDescriptions[action],
      'document',
      targetId,
      {
        document_name: documentName,
        target_type: targetType,
        target_name: targetName,
        ...options?.metadata
      }
    );
  }, [logUserAction]);

  // Logging para pagamentos
  const logPaymentAction = useCallback(async (
    action: 'mark_paid' | 'mark_unpaid' | 'update_installments',
    bidderName: string,
    auctionName: string,
    auctionId: string,
    details: string,
    options?: ActivityLogOptions
  ) => {
    const actionDescriptions = {
      mark_paid: `Marcou parcela como paga para "${bidderName}" no leilão "${auctionName}" - ${details}`,
      mark_unpaid: `Marcou parcela como não paga para "${bidderName}" no leilão "${auctionName}" - ${details}`,
      update_installments: `Atualizou parcelas de "${bidderName}" no leilão "${auctionName}" - ${details}`
    };

    await logUserAction(
      `pagamento_${action === 'mark_paid' ? 'marcar_pago' : action === 'mark_unpaid' ? 'marcar_nao_pago' : 'atualizar_parcelas'}`,
      actionDescriptions[action],
      'pagamento',
      auctionId,
      {
        bidder_name: bidderName,
        auction_name: auctionName,
        payment_details: details,
        ...options?.metadata
      }
    );
  }, [logUserAction]);

  // Logging para lotes
  const logLotAction = useCallback(async (
    action: 'create' | 'update' | 'delete' | 'archive' | 'unarchive',
    lotNumber: string,
    auctionName: string,
    auctionId: string,
    options?: ActivityLogOptions
  ) => {
    const actionDescriptions = {
      create: `Adicionou lote ${lotNumber} ao leilão "${auctionName}"`,
      update: `Editou lote ${lotNumber} do leilão "${auctionName}"`,
      delete: `Removeu lote ${lotNumber} do leilão "${auctionName}"`,
      archive: `Arquivou lote ${lotNumber} do leilão "${auctionName}"`,
      unarchive: `Desarquivou lote ${lotNumber} do leilão "${auctionName}"`
    };

    await logUserAction(
      `lot_${action}`,
      actionDescriptions[action],
      'lot',
      auctionId,
      {
        lot_number: lotNumber,
        auction_name: auctionName,
        ...options?.metadata
      }
    );
  }, [logUserAction]);

  // Logging para mercadorias
  const logMerchandiseAction = useCallback(async (
    action: 'create' | 'update' | 'delete',
    merchandiseName: string,
    lotNumber: string,
    auctionName: string,
    auctionId: string,
    options?: ActivityLogOptions
  ) => {
    const actionDescriptions = {
      create: `Adicionou mercadoria "${merchandiseName}" ao lote ${lotNumber} do leilão "${auctionName}"`,
      update: `Editou mercadoria "${merchandiseName}" do lote ${lotNumber} do leilão "${auctionName}"`,
      delete: `Removeu mercadoria "${merchandiseName}" do lote ${lotNumber} do leilão "${auctionName}"`
    };

    await logUserAction(
      `merchandise_${action}`,
      actionDescriptions[action],
      'merchandise',
      auctionId,
      {
        merchandise_name: merchandiseName,
        lot_number: lotNumber,
        auction_name: auctionName,
        ...options?.metadata
      }
    );
  }, [logUserAction]);

  // Logging para relatórios
  const logReportAction = useCallback(async (
    action: 'generate' | 'export' | 'view',
    reportType: string,
    reportName: string,
    options?: ActivityLogOptions
  ) => {
    const actionDescriptions = {
      generate: `Gerou relatório de ${reportType}: "${reportName}"`,
      export: `Exportou relatório de ${reportType}: "${reportName}"`,
      view: `Visualizou relatório de ${reportType}: "${reportName}"`
    };

    await logUserAction(
      `report_${action}`,
      actionDescriptions[action],
      'report',
      undefined,
      {
        report_type: reportType,
        report_name: reportName,
        ...options?.metadata
      }
    );
  }, [logUserAction]);

  // Logging para configurações
  const logConfigAction = useCallback(async (
    action: 'update' | 'backup' | 'restore',
    configType: string,
    details: string,
    options?: ActivityLogOptions
  ) => {
    const actionDescriptions = {
      update: `Atualizou configuração de ${configType}: ${details}`,
      backup: `Fez backup das configurações de ${configType}`,
      restore: `Restaurou configurações de ${configType}: ${details}`
    };

    await logUserAction(
      `config_${action}`,
      actionDescriptions[action],
      'config',
      undefined,
      {
        config_type: configType,
        config_details: details,
        ...options?.metadata
      }
    );
  }, [logUserAction]);

  return {
    logAuctionAction,
    logBidderAction,
    logDocumentAction,
    logPaymentAction,
    logLotAction,
    logMerchandiseAction,
    logReportAction,
    logConfigAction
  };
}
