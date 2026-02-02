import { useEffect, useState } from 'react';
import { checkSupabaseConnection, migrateLocalStorageToSupabase } from '@/lib/migrate-to-supabase';
import { db } from '@/lib/storage';
import { logger } from '@/lib/logger';

// Chave para marcar migração como concluída
const MIGRATION_COMPLETED_KEY = 'auction-usher.migration-completed';

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

export function useAutoMigration() {
  const [migrationStatus, setMigrationStatus] = useState<'checking' | 'needed' | 'completed' | 'error'>('checking');
  const [migrationResult, setMigrationResult] = useState<MigrationResult | null>(null);

  useEffect(() => {
    checkMigrationNeeded();
  }, []);

  const checkMigrationNeeded = async () => {
    try {
      // Verificar se a migração já foi marcada como concluída
      const migrationCompleted = localStorage.getItem(MIGRATION_COMPLETED_KEY);
      if (migrationCompleted === 'true') {
        setMigrationStatus('completed');
        return;
      }

      // Verificar se há dados locais
      const localData = db.getState();
      const hasLocalData = localData.auctions.length > 0 || 
                          localData.lots.length > 0 || 
                          localData.bidders.length > 0 || 
                          localData.invoices.length > 0;

      // Se não há dados locais, marcar como concluído
      if (!hasLocalData) {
        localStorage.setItem(MIGRATION_COMPLETED_KEY, 'true');
        setMigrationStatus('completed');
        return;
      }

      // Verificar conexão com Supabase
      const isConnected = await checkSupabaseConnection();

      if (hasLocalData && isConnected) {
        setMigrationStatus('needed');
      } else {
        setMigrationStatus('completed');
      }
    } catch (error) {
      logger.error('Erro ao verificar migração:', error);
      setMigrationStatus('error');
    }
  };

  const runAutoMigration = async () => {
    try {
      setMigrationStatus('checking');
      const result = await migrateLocalStorageToSupabase();
      setMigrationResult(result);
      
      if (result.success) {
        // Marcar migração como concluída
        localStorage.setItem(MIGRATION_COMPLETED_KEY, 'true');
        setMigrationStatus('completed');
        
        // Limpar dados locais após migração bem-sucedida
        localStorage.removeItem('auction-usher.db');
        
        // Recarregar a página para usar os dados do Supabase
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      } else {
        setMigrationStatus('error');
      }
    } catch (error) {
      logger.error('Erro na migração automática:', error);
      setMigrationStatus('error');
    }
  };

  // Função para resetar status de migração (útil para desenvolvimento)
  const resetMigrationStatus = () => {
    localStorage.removeItem(MIGRATION_COMPLETED_KEY);
    setMigrationStatus('checking');
    checkMigrationNeeded();
  };

  return {
    migrationStatus,
    migrationResult,
    runAutoMigration,
    checkMigrationNeeded,
    resetMigrationStatus,
  };
}
