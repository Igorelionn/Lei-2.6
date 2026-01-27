import { supabaseClient } from './supabase-client';
import { db } from './storage';
import { Auction, Bidder, Lot, Invoice, LoteInfo } from './types';
import { Database } from './database.types';

// 🔒 SEGURANÇA: Gerar UUID criptograficamente seguro
function generateUUID(): string {
  return crypto.randomUUID();
}

// Função para validar se uma string é um UUID válido
function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

interface MigrationResult {
  success: boolean;
  message: string;
  migratedCounts: {
    auctions: number;
    bidders: number;
    lots: number;
    invoices: number;
  };
  errors: string[];
}

export async function migrateLocalStorageToSupabase(): Promise<MigrationResult> {
  const result: MigrationResult = {
    success: false,
    message: '',
    migratedCounts: {
      auctions: 0,
      bidders: 0,
      lots: 0,
      invoices: 0,
    },
    errors: [],
  };

  try {
    // Obter dados do localStorage
    const localData = db.getState();
    
    console.log('Iniciando migração para Supabase...', {
      auctions: localData.auctions.length,
      bidders: localData.bidders.length,
      lots: localData.lots.length,
      invoices: localData.invoices.length,
    });

    // Log detalhado dos dados para debug
    console.log('Dados locais encontrados:', localData);

    // Criar mapa de IDs antigos para novos UUIDs (usado em todas as migrações)
    const auctionIdMap = new Map<string, string>();

    // Migrar leilões
    if (localData.auctions.length > 0) {
      console.log('Preparando migração de leilões...', localData.auctions);
      
      const auctionsToInsert = localData.auctions.map(auction => {
        console.log('Processando leilão:', auction);
        
        // Validar campos obrigatórios
        if (!auction.id || !auction.nome || !auction.dataInicio) {
          throw new Error(`Leilão inválido: campos obrigatórios faltando. ID: ${auction.id}, Nome: ${auction.nome}`);
        }
        
        // Gerar UUID válido se necessário
        let validId = auction.id;
        if (!isValidUUID(auction.id)) {
          validId = generateUUID();
          auctionIdMap.set(auction.id, validId);
          console.log(`ID inválido convertido: ${auction.id} -> ${validId}`);
        }
        
        // Validar enum values
        const validLocals = ['presencial', 'online', 'hibrido'];
        const validStatuses = ['agendado', 'em_andamento', 'finalizado'];
        
        const local = validLocals.includes(auction.local) ? auction.local : 'presencial';
        const status = validStatuses.includes(auction.status) ? auction.status : 'agendado';
        
        const mappedAuction = {
          id: validId,
          nome: auction.nome,
          identificacao: auction.identificacao || null,
          local: local as Database['public']['Enums']['location_type'],
          endereco: auction.endereco || null,
          data_inicio: auction.dataInicio,
          data_andamento: auction.status === 'em_andamento' ? auction.dataInicio : null,
          data_encerramento: auction.dataEncerramento || null,
          prazo_final_pagamento: auction.dataVencimentoVista || null,
          status: status as Database['public']['Enums']['auction_status'],
          custos_texto: auction.custos || null,
          custos_numerico: auction.custosNumerico || null,
          historico_notas: auction.historicoNotas || null,
          arquivado: auction.arquivado || false,
        };
        
        console.log('Leilão mapeado:', mappedAuction);
        return mappedAuction;
      });

      console.log('Enviando leilões para Supabase:', auctionsToInsert);

      const { data: insertedAuctions, error: auctionsError } = await supabaseClient
        .from('auctions')
        .upsert(auctionsToInsert, { onConflict: 'id' })
        .select();

      if (auctionsError) {
        console.error('Erro detalhado ao migrar leilões:', auctionsError);
        result.errors.push(`Erro ao migrar leilões: ${auctionsError.message} - Código: ${auctionsError.code} - Detalhes: ${auctionsError.details}`);
      } else {
        result.migratedCounts.auctions = insertedAuctions?.length || 0;
        
        // Migrar arrematantes (que estão dentro dos leilões)
        const biddersToInsert = [];
        for (const auction of localData.auctions) {
          if (auction.arrematante) {
            console.log('Processando arrematante do leilão:', auction.id, auction.arrematante);
            
            // Validar campos obrigatórios do arrematante
            if (!auction.arrematante.nome) {
              console.warn(`Arrematante inválido no leilão ${auction.id}: nome faltando`);
              continue; // Pular este arrematante
            }
            
            // Usar o ID correto do leilão (pode ter sido convertido)
            const correctAuctionId = auctionIdMap.get(auction.id) || auction.id;
            
            const mappedBidder = {
              auction_id: correctAuctionId,
              nome: auction.arrematante.nome,
              valor_pagar_texto: auction.arrematante.valorPagar || null,
              valor_pagar_numerico: auction.arrematante.valorPagarNumerico || null,
              data_pagamento: auction.arrematante.mesInicioPagamento || null,
              pago: auction.arrematante.pago || false,
              arquivado: auction.arquivado || false,
            };
            
            console.log('Arrematante mapeado:', mappedBidder);
            biddersToInsert.push(mappedBidder);
          }
        }

        if (biddersToInsert.length > 0) {
          console.log('Enviando arrematantes para Supabase:', biddersToInsert);
          
          const { data: insertedBidders, error: biddersError } = await supabaseClient
            .from('bidders')
            .upsert(biddersToInsert, { onConflict: 'auction_id' })
            .select();

          if (biddersError) {
            console.error('Erro detalhado ao migrar arrematantes:', biddersError);
            result.errors.push(`Erro ao migrar arrematantes: ${biddersError.message} - Código: ${biddersError.code} - Detalhes: ${biddersError.details}`);
          } else {
            result.migratedCounts.bidders = insertedBidders?.length || 0;
          }
        }
      }
    }

    // Migrar lotes
    if (localData.lots.length > 0) {
      const lotsToInsert = localData.lots.map(lot => {
        // Gerar UUID válido se necessário
        let validId = lot.id;
        if (!isValidUUID(lot.id)) {
          validId = generateUUID();
          console.log(`ID de lote inválido convertido: ${lot.id} -> ${validId}`);
        }
        
        // Usar o ID correto do leilão
        const correctAuctionId = auctionIdMap.get(lot.auctionId) || lot.auctionId;
        
        // Validar bidder_id se existir
        let validBidderId = lot.arrematanteId;
        if (lot.arrematanteId && !isValidUUID(lot.arrematanteId)) {
          validBidderId = null; // Remover se inválido
          console.warn(`ID de arrematante inválido removido do lote: ${lot.arrematanteId}`);
        }
        
        return {
          id: validId,
          auction_id: correctAuctionId,
          numero: lot.numero,
          descricao: lot.descricao,
          valor_inicial: lot.valorInicial,
          incremento_lance: lot.incrementoLance,
          bidder_id: validBidderId,
          arquivado: false,
        };
      });

      const { data: insertedLots, error: lotsError } = await supabaseClient
        .from('lots')
        .upsert(lotsToInsert, { onConflict: 'id' })
        .select();

      if (lotsError) {
        result.errors.push(`Erro ao migrar lotes: ${lotsError.message}`);
      } else {
        result.migratedCounts.lots = insertedLots?.length || 0;
      }
    }

    // Migrar faturas
    if (localData.invoices.length > 0) {
      const invoicesToInsert = localData.invoices.map(invoice => {
        // Gerar UUID válido se necessário
        let validId = invoice.id;
        if (!isValidUUID(invoice.id)) {
          validId = generateUUID();
          console.log(`ID de fatura inválido convertido: ${invoice.id} -> ${validId}`);
        }
        
        // Usar IDs corretos
        const correctAuctionId = auctionIdMap.get(invoice.auctionId) || invoice.auctionId;
        
        // Validar lot_id se existir
        let validLotId = invoice.lotId;
        if (invoice.lotId && !isValidUUID(invoice.lotId)) {
          validLotId = null;
          console.warn(`ID de lote inválido removido da fatura: ${invoice.lotId}`);
        }
        
        // Validar bidder_id se existir
        let validBidderId = invoice.arrematanteId;
        if (invoice.arrematanteId && !isValidUUID(invoice.arrematanteId)) {
          validBidderId = null;
          console.warn(`ID de arrematante inválido removido da fatura: ${invoice.arrematanteId}`);
        }
        
        // Validar status
        const validStatuses = ['em_aberto', 'pago', 'atrasado', 'cancelado'];
        const status = validStatuses.includes(invoice.status) ? invoice.status : 'em_aberto';
        
        return {
          id: validId,
          auction_id: correctAuctionId,
          lot_id: validLotId,
          bidder_id: validBidderId,
          numero_fatura: `INV-${validId.slice(-8)}`, // Gerar número único
          valor_arremate: invoice.valorArremate,
          comissao: invoice.comissao || 0,
          custos_adicionais: invoice.custosAdicionais || 0,
          valor_liquido: invoice.valorLiquido,
          data_vencimento: invoice.vencimento,
          status: status as Database['public']['Enums']['invoice_status'],
          arquivado: false,
        };
      });

      const { data: insertedInvoices, error: invoicesError } = await supabaseClient
        .from('invoices')
        .upsert(invoicesToInsert, { onConflict: 'id' })
        .select();

      if (invoicesError) {
        result.errors.push(`Erro ao migrar faturas: ${invoicesError.message}`);
      } else {
        result.migratedCounts.invoices = insertedInvoices?.length || 0;
      }
    }

    // Verificar se houve erros
    if (result.errors.length === 0) {
      result.success = true;
      result.message = `Migração concluída com sucesso! Migrados: ${result.migratedCounts.auctions} leilões, ${result.migratedCounts.bidders} arrematantes, ${result.migratedCounts.lots} lotes, ${result.migratedCounts.invoices} faturas.`;
    } else {
      result.message = `Migração concluída com ${result.errors.length} erros.`;
    }

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    result.errors.push(`Erro geral na migração: ${errorMessage}`);
    result.message = 'Falha na migração para Supabase.';
  }

  return result;
}

export async function clearLocalStorage(): Promise<void> {
  localStorage.removeItem('auction-usher.db');
  localStorage.removeItem('auction-usher.auth');
}

export async function checkSupabaseConnection(): Promise<boolean> {
  try {
    // Testar conexão com múltiplas tabelas
    const tests = await Promise.all([
      supabaseClient.from('auctions').select('count', { count: 'exact', head: true }),
      supabaseClient.from('bidders').select('count', { count: 'exact', head: true }),
      supabaseClient.from('lots').select('count', { count: 'exact', head: true }),
      supabaseClient.from('invoices').select('count', { count: 'exact', head: true }),
    ]);
    
    // Verificar se algum teste falhou
    const hasErrors = tests.some(test => test.error);
    if (hasErrors) {
      console.error('Erros nos testes de conexão:', tests.map(t => t.error).filter(Boolean));
      return false;
    }
    
    console.log('Conexão Supabase OK - Contadores:', {
      auctions: tests[0].count,
      bidders: tests[1].count,
      lots: tests[2].count,
      invoices: tests[3].count,
    });
    
    return true;
  } catch (error) {
    console.error('Erro na verificação de conexão:', error);
    return false;
  }
}

// Nova função para migrar configurações de pagamento globais para configurações específicas por lote
export async function migratePaymentSettingsToLots(): Promise<{ success: boolean; message: string; migratedAuctionIds: string[]; errors: string[] }> {
  const result = {
    success: false,
    message: '',
    migratedAuctionIds: [] as string[],
    errors: [] as string[],
  };

  try {
    console.log('Iniciando migração de configurações de pagamento para lotes...');

    // Buscar todos os leilões que têm configurações de pagamento globais
    const { data: auctionsWithGlobalPayment, error: fetchError } = await supabaseClient
      .from('auctions')
      .select('*')
      .or('tipo_pagamento.is.not.null,mes_inicio_pagamento.is.not.null,dia_vencimento_padrao.is.not.null,data_entrada.is.not.null,data_vencimento_vista.is.not.null,parcelas_padrao.is.not.null');

    if (fetchError) {
      result.errors.push(`Erro ao buscar leilões: ${fetchError.message}`);
      return result;
    }

    if (!auctionsWithGlobalPayment || auctionsWithGlobalPayment.length === 0) {
      result.message = 'Nenhum leilão com configurações globais de pagamento encontrado para migrar.';
      result.success = true;
      return result;
    }

    console.log(`Encontrados ${auctionsWithGlobalPayment.length} leilões com configurações globais de pagamento`);

    const auctionsToUpdate = [];

    for (const auction of auctionsWithGlobalPayment) {
      try {
        // Se o leilão não tem lotes, pular
        if (!auction.lotes || !Array.isArray(auction.lotes) || auction.lotes.length === 0) {
          console.log(`Leilão ${auction.id} não tem lotes, pulando migração.`);
          continue;
        }

        const lotes = auction.lotes as unknown as LoteInfo[];
        let hasChanges = false;

        // Migrar configurações de pagamento para cada lote que não tenha configurações específicas
        const updatedLotes = lotes.map(lote => {
          // Se o lote já tem configurações específicas, não alterar
          if (lote.tipoPagamento) {
            return lote;
          }

          // Aplicar configurações globais do leilão para este lote
          const updatedLote: LoteInfo = {
            ...lote,
            tipoPagamento: auction.tipo_pagamento as "a_vista" | "parcelamento" | "entrada_parcelamento" | undefined,
            mesInicioPagamento: auction.mes_inicio_pagamento || undefined,
            diaVencimentoPadrao: auction.dia_vencimento_padrao || undefined,
            dataEntrada: auction.data_entrada || undefined,
            dataVencimentoVista: auction.data_vencimento_vista || undefined,
            parcelasPadrao: auction.parcelas_padrao || undefined,
          };

          hasChanges = true;
          return updatedLote;
        });

        if (hasChanges) {
          auctionsToUpdate.push({
            id: auction.id,
            lotes: updatedLotes,
            // Limpar configurações globais de pagamento
            tipo_pagamento: null,
            mes_inicio_pagamento: null,
            dia_vencimento_padrao: null,
            data_entrada: null,
            data_vencimento_vista: null,
            parcelas_padrao: null,
          });

          console.log(`Preparado para atualizar leilão ${auction.id} com ${updatedLotes.length} lotes`);
        }
      } catch (loteError) {
        console.error(`Erro ao processar lotes do leilão ${auction.id}:`, loteError);
        result.errors.push(`Erro ao processar leilão ${auction.id}: ${loteError instanceof Error ? loteError.message : 'Erro desconhecido'}`);
      }
    }

    if (auctionsToUpdate.length === 0) {
      result.message = 'Todos os leilões já possuem configurações específicas por lote ou não precisam de migração.';
      result.success = true;
      return result;
    }

    // Executar atualizações em lotes
    console.log(`Iniciando atualização de ${auctionsToUpdate.length} leilões...`);
    
    for (const auctionUpdate of auctionsToUpdate) {
      try {
        const { error: updateError } = await supabaseClient
          .from('auctions')
          .update({
            lotes: auctionUpdate.lotes,
            tipo_pagamento: auctionUpdate.tipo_pagamento,
            mes_inicio_pagamento: auctionUpdate.mes_inicio_pagamento,
            dia_vencimento_padrao: auctionUpdate.dia_vencimento_padrao,
            data_entrada: auctionUpdate.data_entrada,
            data_vencimento_vista: auctionUpdate.data_vencimento_vista,
            parcelas_padrao: auctionUpdate.parcelas_padrao,
          })
          .eq('id', auctionUpdate.id);

        if (updateError) {
          console.error(`Erro ao atualizar leilão ${auctionUpdate.id}:`, updateError);
          result.errors.push(`Erro ao atualizar leilão ${auctionUpdate.id}: ${updateError.message}`);
        } else {
          result.migratedAuctionIds.push(auctionUpdate.id);
          console.log(`Leilão ${auctionUpdate.id} atualizado com sucesso`);
        }
      } catch (individualError) {
        console.error(`Erro ao processar atualização individual do leilão ${auctionUpdate.id}:`, individualError);
        result.errors.push(`Erro individual leilão ${auctionUpdate.id}: ${individualError instanceof Error ? individualError.message : 'Erro desconhecido'}`);
      }
    }

    result.success = result.migratedAuctionIds.length > 0;
    result.message = result.success 
      ? `Migração concluída com sucesso. ${result.migratedAuctionIds.length} leilões migrados.`
      : 'Migração falhou. Verifique os erros.';

    console.log(`Migração de configurações de pagamento concluída. Sucessos: ${result.migratedAuctionIds.length}, Erros: ${result.errors.length}`);

  } catch (error) {
    console.error('Erro na migração de configurações de pagamento:', error);
    result.errors.push(`Erro geral: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    result.message = 'Migração de configurações de pagamento falhou com erro';
    result.success = false;
  }

  return result;
}
