import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  Database, 
  Upload, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  Loader2,
  RefreshCw,
  Trash2
} from 'lucide-react';
import { 
  migrateLocalStorageToSupabase, 
  clearLocalStorage, 
  checkSupabaseConnection 
} from '@/lib/migrate-to-supabase';
import { db } from '@/lib/storage';

interface MigrationManagerProps {
  onMigrationComplete?: () => void;
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

interface DataCounts {
  auctions: number;
  bidders: number;
  lots: number;
  invoices: number;
}

export function MigrationManager({ onMigrationComplete }: MigrationManagerProps) {
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [migrationResult, setMigrationResult] = useState<MigrationResult | null>(null);
  const [localDataCounts, setLocalDataCounts] = useState<DataCounts | null>(null);

  // Verificar conexão com Supabase
  const handleCheckConnection = async () => {
    setIsChecking(true);
    try {
      const connected = await checkSupabaseConnection();
      setIsConnected(connected);
      
      // Contar dados locais
      const localData = db.getState();
      setLocalDataCounts({
        auctions: localData.auctions.length,
        bidders: localData.auctions.filter(a => a.arrematante).length,
        lots: localData.lots.length,
        invoices: localData.invoices.length,
      });
    } catch (error) {
      setIsConnected(false);
    } finally {
      setIsChecking(false);
    }
  };

  // Executar migração
  const handleMigrate = async () => {
    setIsMigrating(true);
    try {
      const result = await migrateLocalStorageToSupabase();
      setMigrationResult(result);
      
      if (result.success && onMigrationComplete) {
        setTimeout(() => {
          onMigrationComplete();
        }, 2000);
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido na migração';
      setMigrationResult({
        success: false,
        message: `Erro na migração: ${errorMessage}`,
        errors: [errorMessage],
        migratedCounts: { auctions: 0, bidders: 0, lots: 0, invoices: 0 }
      });
    } finally {
      setIsMigrating(false);
    }
  };

  // Limpar localStorage
  const handleClearLocal = async () => {
    if (confirm('Tem certeza que deseja limpar todos os dados locais? Esta ação não pode ser desfeita.')) {
      await clearLocalStorage();
      setLocalDataCounts(null);
      setMigrationResult(null);
      alert('Dados locais limpos com sucesso!');
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-3">
            <Database className="h-6 w-6 text-blue-600" />
            Migração para Supabase
          </CardTitle>
          <p className="text-gray-600">
            Migre seus dados do armazenamento local para o banco de dados Supabase para sincronização em tempo real.
          </p>
        </CardHeader>
        
        <CardContent className="space-y-6">
          {/* Status da Conexão */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Status da Conexão</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCheckConnection}
                disabled={isChecking}
              >
                {isChecking ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Verificar
              </Button>
            </div>
            
            {isConnected !== null && (
              <Alert>
                <div className="flex items-center gap-2">
                  {isConnected ? (
                    <>
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span className="text-green-800">Conectado ao Supabase com sucesso!</span>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-4 w-4 text-red-600" />
                      <span className="text-red-800">Falha na conexão com Supabase</span>
                    </>
                  )}
                </div>
              </Alert>
            )}
          </div>

          <Separator />

          {/* Dados Locais */}
          {localDataCounts && (
            <div className="space-y-3">
              <h3 className="text-lg font-semibold">Dados Locais Encontrados</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">{localDataCounts.auctions}</div>
                  <div className="text-sm text-gray-600">Leilões</div>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">{localDataCounts.bidders}</div>
                  <div className="text-sm text-gray-600">Arrematantes</div>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <div className="text-2xl font-bold text-purple-600">{localDataCounts.lots}</div>
                  <div className="text-sm text-gray-600">Lotes</div>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <div className="text-2xl font-bold text-orange-600">{localDataCounts.invoices}</div>
                  <div className="text-sm text-gray-600">Faturas</div>
                </div>
              </div>
            </div>
          )}

          <Separator />

          {/* Ações de Migração */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Ações</h3>
            
            <div className="flex flex-wrap gap-3">
              <Button
                onClick={handleMigrate}
                disabled={!isConnected || isMigrating || !localDataCounts}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {isMigrating ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                Migrar Dados
              </Button>

              <Button
                variant="outline"
                onClick={handleClearLocal}
                disabled={isMigrating || !localDataCounts}
                className="text-red-600 border-red-300 hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Limpar Dados Locais
              </Button>
            </div>

            {!isConnected && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Verifique a conexão com o Supabase antes de prosseguir com a migração.
                </AlertDescription>
              </Alert>
            )}
          </div>

          {/* Resultado da Migração */}
          {migrationResult && (
            <div className="space-y-3">
              <Separator />
              <h3 className="text-lg font-semibold">Resultado da Migração</h3>
              
              <Alert className={migrationResult.success ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}>
                <div className="flex items-start gap-2">
                  {migrationResult.success ? (
                    <CheckCircle className="h-4 w-4 text-green-600 mt-0.5" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-600 mt-0.5" />
                  )}
                  <div className="flex-1">
                    <AlertDescription className={migrationResult.success ? 'text-green-800' : 'text-red-800'}>
                      {migrationResult.message}
                    </AlertDescription>
                  </div>
                </div>
              </Alert>

              {migrationResult.success && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Badge variant="secondary" className="justify-center py-2">
                    {migrationResult.migratedCounts.auctions} Leilões
                  </Badge>
                  <Badge variant="secondary" className="justify-center py-2">
                    {migrationResult.migratedCounts.bidders} Arrematantes
                  </Badge>
                  <Badge variant="secondary" className="justify-center py-2">
                    {migrationResult.migratedCounts.lots} Lotes
                  </Badge>
                  <Badge variant="secondary" className="justify-center py-2">
                    {migrationResult.migratedCounts.invoices} Faturas
                  </Badge>
                </div>
              )}

              {migrationResult.errors && migrationResult.errors.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-medium text-red-800">Erros encontrados:</h4>
                  <ul className="space-y-1">
                    {migrationResult.errors.map((error: string, index: number) => (
                      <li key={index} className="text-sm text-red-700 bg-red-100 p-2 rounded">
                        {error}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
