/**
 * 🔧 Utilidade para corrigir status de guest_lots
 * 
 * Corrige lotes que estão marcados como "arrematado" mas não têm arrematantes vinculados
 */

import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/logger';

export async function fixGuestLotsStatus() {
  try {
    logger.info('🔧 Iniciando correção de status de guest_lots...');

    // 1. Buscar todos os guest_lots com status "arrematado"
    const { data: guestLots, error: fetchError } = await supabase
      .from('guest_lots')
      .select('id, numero, descricao, status')
      .eq('status', 'arrematado');

    if (fetchError) {
      logger.error('❌ Erro ao buscar guest_lots', { error: fetchError });
      throw fetchError;
    }

    if (!guestLots || guestLots.length === 0) {
      logger.info('✅ Nenhum guest_lot com status "arrematado" encontrado');
      return { fixed: 0, checked: 0 };
    }

    logger.info(`🔍 Verificando ${guestLots.length} guest_lots...`);

    let fixedCount = 0;

    // 2. Para cada guest_lot, verificar se tem arrematantes
    for (const lot of guestLots) {
      const { data: bidders, error: biddersError } = await supabase
        .from('bidders')
        .select('id')
        .eq('guest_lot_id', lot.id);

      if (biddersError) {
        logger.error(`❌ Erro ao buscar arrematantes do lote ${lot.numero}`, { error: biddersError });
        continue;
      }

      const hasBidders = bidders && bidders.length > 0;

      if (!hasBidders) {
        // Lote arrematado mas sem arrematantes - CORRIGIR
        logger.warn(`⚠️ Lote ${lot.numero} está "arrematado" mas não tem arrematantes. Corrigindo...`);

        const { error: updateError } = await supabase
          .from('guest_lots')
          .update({ 
            status: 'disponivel',
            updated_at: new Date().toISOString()
          })
          .eq('id', lot.id);

        if (updateError) {
          logger.error(`❌ Erro ao atualizar lote ${lot.numero}`, { error: updateError });
        } else {
          logger.info(`✅ Lote ${lot.numero} atualizado para "disponível"`);
          fixedCount++;
        }
      } else {
        logger.debug(`✓ Lote ${lot.numero} tem ${bidders.length} arrematante(s) - OK`);
      }
    }

    const result = {
      checked: guestLots.length,
      fixed: fixedCount
    };

    logger.info(`🎉 Correção concluída:`, result);

    return result;
  } catch (error) {
    logger.error('❌ Erro fatal na correção de status', { error });
    throw error;
  }
}

/**
 * Verifica se há guest_lots com status inconsistente
 */
export async function checkGuestLotsStatus() {
  try {
    const { data: guestLots, error } = await supabase
      .from('guest_lots')
      .select('id, numero, status')
      .eq('status', 'arrematado');

    if (error) throw error;

    if (!guestLots || guestLots.length === 0) {
      return { inconsistent: [] };
    }

    const inconsistent = [];

    for (const lot of guestLots) {
      const { data: bidders } = await supabase
        .from('bidders')
        .select('id')
        .eq('guest_lot_id', lot.id);

      if (!bidders || bidders.length === 0) {
        inconsistent.push(lot);
      }
    }

    return { inconsistent };
  } catch (error) {
    logger.error('Erro ao verificar status', { error });
    throw error;
  }
}
