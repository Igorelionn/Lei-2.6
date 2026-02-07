import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useEmailNotifications } from '@/hooks/use-email-notifications';
import { useAuth } from '@/hooks/use-auth';
import { Mail, CheckCircle, Check, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

export function EmailNotificationSettings() {
  const { config, saveConfig, carregarLogs, emailLogs, limparHistorico } = useEmailNotifications();
  const { user } = useAuth();
  const [localConfig, setLocalConfig] = useState({
    emailRemetente: 'notificacoes@grupoliraleiloes.com', // Email remetente padrão fixo
    diasAntesLembrete: config.diasAntesLembrete,
    diasDepoisCobranca: config.diasDepoisCobranca,
    enviarAutomatico: true, // Sempre automático
  });

  // Carregar logs ao montar e periodicamente
  useEffect(() => {
    // Carregar imediatamente
    carregarLogs(20);

    // Recarregar a cada 10 segundos
    const interval = setInterval(() => {
      carregarLogs(20);
    }, 10000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Intencionalmente vazio: queremos apenas UM interval, criado na montagem

  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  // Verificar se usuário é administrador
  const isAdmin = user?.role === 'admin' || user?.permissions?.can_manage_users === true;

  const handleSaveConfig = () => {
    // Fase 1: Carregamento
    setIsSaving(true);
    saveConfig(localConfig);
    
    // Fase 2: Confirmação (após 800ms)
    setTimeout(() => {
      setIsSaving(false);
      setIsSaved(true);
      
      // Fase 3: Volta ao normal (após mais 1.5s)
      setTimeout(() => {
        setIsSaved(false);
      }, 1500);
    }, 800);
  };

  const handleLimparHistorico = async () => {
    setIsClearing(true);
    
    const result = await limparHistorico();
    
    if (!result.success) {
      logger.error('Erro ao limpar histórico:', result.message);
    }
    
    setIsClearing(false);
  };

  return (
    <div className="space-y-6">
      {/* Configurações Gerais */}
      <Card className="border-gray-200 shadow-sm">
        <CardHeader className="bg-gradient-to-r from-gray-50 to-white border-b border-gray-100 pb-6">
          <div>
            <CardTitle className="text-xl text-gray-900">Parametrização de Notificações Automáticas</CardTitle>
            <CardDescription className="text-gray-600 mt-2">
              Defina os períodos de envio automático de lembretes e notificações de cobrança aos arrematantes
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-6 pt-8">
          {/* Dias antes do vencimento */}
          <div className="space-y-3 bg-white p-6 rounded-lg border border-gray-200">
            <Label htmlFor="dias-antes" className="text-sm font-semibold text-gray-800">
              Prazo Antecipado para Notificação Preventiva
            </Label>
            <Input
              id="dias-antes"
              type="number"
              min="1"
              max="30"
              value={localConfig.diasAntesLembrete}
              onChange={(e) => setLocalConfig({ ...localConfig, diasAntesLembrete: parseInt(e.target.value) || 3 })}
              className="max-w-xs focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus:outline-none focus-visible:outline-none focus:border-gray-800"
            />
            <p className="text-xs text-gray-600 leading-relaxed bg-blue-50 p-3 rounded border-l-4 border-blue-400">
              O sistema enviará automaticamente uma notificação de lembrete <strong>{localConfig.diasAntesLembrete} dia(s)</strong> antes da data de vencimento do compromisso financeiro.
            </p>
          </div>

          {/* Dias depois do vencimento */}
          <div className="space-y-3 bg-white p-6 rounded-lg border border-gray-200">
            <Label htmlFor="dias-depois" className="text-sm font-semibold text-gray-800">
              Prazo para Notificação de Inadimplência
            </Label>
            <Input
              id="dias-depois"
              type="number"
              min="0"
              max="30"
              value={localConfig.diasDepoisCobranca}
              onChange={(e) => setLocalConfig({ ...localConfig, diasDepoisCobranca: parseInt(e.target.value) || 1 })}
              className="max-w-xs focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus:outline-none focus-visible:outline-none focus:border-gray-800"
            />
            <p className="text-xs text-gray-600 leading-relaxed bg-amber-50 p-3 rounded border-l-4 border-amber-400">
              Notificações de cobrança serão enviadas a partir de <strong>{localConfig.diasDepoisCobranca} dia(s)</strong> após o vencimento, caso o pagamento não tenha sido identificado no sistema.
            </p>
          </div>

          {/* Botão Salvar */}
          <div className="flex gap-3 pt-6 border-t">
            <Button 
              onClick={handleSaveConfig} 
              disabled={isSaving || isSaved}
              className="bg-gray-800 hover:bg-black text-white px-8 transition-all duration-400"
            >
              <span className="flex items-center transition-opacity duration-300">
                {isSaving ? (
                  <>
                    <svg 
                      className="w-4 h-4 mr-2 animate-spin" 
                      viewBox="0 0 24 24" 
                      fill="none"
                    >
                      <circle 
                        cx="12" 
                        cy="12" 
                        r="9" 
                        stroke="currentColor" 
                        strokeWidth="2.5" 
                        strokeDasharray="15 50"
                        strokeLinecap="round"
                        opacity="0.8"
                      />
                    </svg>
                    Salvando...
                  </>
                ) : isSaved ? (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    Salvo
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    Aplicar Configurações
                  </>
                )}
              </span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Histórico de Emails */}
      <Card className="border-gray-200 shadow-sm">
        <CardHeader className="bg-gradient-to-r from-gray-50 to-white border-b border-gray-100 pb-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <CardTitle className="text-xl text-gray-900">Registro de Comunicações Enviadas</CardTitle>
              <CardDescription className="text-gray-600 mt-2">
                Histórico das últimas 20 notificações enviadas com sucesso pelo sistema
              </CardDescription>
            </div>
            {isAdmin && emailLogs.length > 0 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-red-200 text-red-700 hover:bg-red-600 hover:text-white hover:border-red-600 transition-colors flex-shrink-0"
                    disabled={isClearing}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Limpar Histórico
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Confirmar limpeza do histórico</AlertDialogTitle>
                    <AlertDialogDescription>
                      Esta ação irá remover permanentemente todos os registros de comunicações enviadas.
                      Esta operação não pode ser desfeita. Deseja continuar?
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleLimparHistorico}
                      className="bg-red-600 hover:bg-red-700 text-white"
                    >
                      {isClearing ? 'Limpando...' : 'Sim, limpar histórico'}
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          {emailLogs.length === 0 ? (
            <div className="text-center text-gray-500 py-16 bg-gray-50 rounded-lg">
              <div className="p-4 bg-white rounded-full w-20 h-20 mx-auto mb-4 flex items-center justify-center shadow-sm">
                <Mail className="h-10 w-10 text-gray-300" />
              </div>
              <p className="font-semibold text-gray-700 text-lg">Nenhuma notificação registrada</p>
              <p className="text-sm text-gray-500 mt-2">O histórico de envios aparecerá aqui automaticamente</p>
            </div>
          ) : (
            <div className="space-y-3">
              {emailLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-center justify-between p-5 rounded-lg border bg-white border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all"
                >
                  <div className="flex items-center gap-3 flex-1">
                    <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {log.arrematante_nome}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {log.email_destinatario}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span
                      className={`px-3 py-1 rounded text-xs font-semibold uppercase tracking-wide ${
                        log.tipo_email === 'lembrete'
                          ? 'bg-blue-100 text-blue-800'
                          : log.tipo_email === 'cobranca'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-green-100 text-green-800'
                      }`}
                    >
                      {log.tipo_email === 'lembrete' ? 'Lembrete' : log.tipo_email === 'cobranca' ? 'Cobrança' : 'Confirmação'}
                    </span>
                    <span className="text-xs text-gray-500 whitespace-nowrap">
                      {format(new Date(log.data_envio), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  );
}

