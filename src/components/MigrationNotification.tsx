import React from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Database, 
  Upload, 
  CheckCircle, 
  XCircle, 
  Loader2,
  AlertTriangle,
  X
} from 'lucide-react';
import { useAutoMigration } from '@/hooks/use-auto-migration';

export function MigrationNotification() {
  const { migrationStatus, migrationResult, runAutoMigration } = useAutoMigration();
  const [isDismissed, setIsDismissed] = React.useState(false);

  // Auto-dispensar quando migração for bem-sucedida
  React.useEffect(() => {
    if (migrationResult?.success) {
      setTimeout(() => {
        setIsDismissed(true);
      }, 3000); // Fechar após 3 segundos
    }
  }, [migrationResult?.success]);

  // Não mostrar se foi dispensado ou se já foi completado
  if (isDismissed || migrationStatus === 'completed') {
    return null;
  }

  // Só mostrar se realmente há necessidade de migração, está verificando, ou há erro
  if (migrationStatus !== 'needed' && migrationStatus !== 'error' && migrationStatus !== 'checking') {
    return null;
  }

  return (
    <div className="fixed top-4 right-4 z-50 max-w-md">
      <Card className="border-blue-200 shadow-lg">
        <CardContent className="p-4">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5 text-blue-600" />
              <h4 className="font-semibold text-gray-900">Migração para Supabase</h4>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsDismissed(true)}
              className="h-6 w-6 p-0 text-gray-400 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {migrationStatus === 'checking' && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              Verificando dados locais...
            </div>
          )}

          {migrationStatus === 'needed' && (
            <div className="space-y-3">
              <Alert className="border-amber-200 bg-amber-50">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-amber-800">
                  Encontramos dados salvos localmente que podem ser migrados para o banco de dados.
                </AlertDescription>
              </Alert>
              
              <div className="flex gap-2">
                <Button
                  onClick={runAutoMigration}
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Migrar Agora
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsDismissed(true)}
                >
                  Depois
                </Button>
              </div>
            </div>
          )}

          {migrationStatus === 'error' && (
            <div className="space-y-3">
              <Alert className="border-red-200 bg-red-50">
                <XCircle className="h-4 w-4 text-red-600" />
                <AlertDescription className="text-red-800">
                  {migrationResult?.message || 'Erro na migração. Tente novamente.'}
                </AlertDescription>
              </Alert>
              
              <div className="flex gap-2">
                <Button
                  onClick={runAutoMigration}
                  size="sm"
                  variant="outline"
                >
                  Tentar Novamente
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsDismissed(true)}
                >
                  Fechar
                </Button>
              </div>
            </div>
          )}

          {migrationResult && migrationResult.success && (
            <div className="space-y-3">
              <Alert className="border-green-200 bg-green-50">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800">
                  Migração concluída com sucesso! Recarregando...
                </AlertDescription>
              </Alert>
              
              <div className="grid grid-cols-2 gap-2">
                <Badge variant="secondary" className="justify-center text-xs">
                  {migrationResult.migratedCounts.auctions} Leilões
                </Badge>
                <Badge variant="secondary" className="justify-center text-xs">
                  {migrationResult.migratedCounts.bidders} Arrematantes
                </Badge>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
