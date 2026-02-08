import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useEmailNotifications } from '@/hooks/use-email-notifications';
import { useAuth } from '@/hooks/use-auth';
import { Mail, CheckCircle, Check, Trash2, Send, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { logger } from '@/lib/logger';
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
  const { config, saveConfig, carregarLogs, emailLogs, limparHistorico, enviarEmailTeste } = useEmailNotifications();
  const { user } = useAuth();
  const [localConfig, setLocalConfig] = useState({
    emailRemetente: 'notificacoes@grupoliraleiloes.com',
    diasAntesLembrete: config.diasAntesLembrete,
    diasDepoisCobranca: config.diasDepoisCobranca,
    enviarAutomatico: true,
  });

  // Controle para pausar o recarregamento automático após limpar
  const pauseAutoRefreshRef = useRef(false);

  // Carregar logs ao montar e periodicamente
  useEffect(() => {
    carregarLogs(20);

    const interval = setInterval(() => {
      // Não recarregar se o auto-refresh estiver pausado (após limpar)
      if (!pauseAutoRefreshRef.current) {
        carregarLogs(20);
      }
    }, 10000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [clearMessage, setClearMessage] = useState<{ success: boolean; text: string } | null>(null);

  // Estado do teste de email
  const [emailTeste, setEmailTeste] = useState('');
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; text: string } | null>(null);

  // Verificar se usuário é administrador
  const isAdmin = user?.role === 'admin' || user?.permissions?.can_manage_users === true;

  const handleSaveConfig = () => {
    setIsSaving(true);
    saveConfig(localConfig);
    
    setTimeout(() => {
      setIsSaving(false);
      setIsSaved(true);
      
      setTimeout(() => {
        setIsSaved(false);
      }, 1500);
    }, 800);
  };

  const handleEnviarTeste = async () => {
    if (!emailTeste || !emailTeste.includes('@')) {
      setTestResult({ success: false, text: 'Digite um email válido para o teste' });
      setTimeout(() => setTestResult(null), 4000);
      return;
    }

    setIsSendingTest(true);
    setTestResult(null);

    const result = await enviarEmailTeste(emailTeste);

    setTestResult({ success: result.success, text: result.message });
    setIsSendingTest(false);

    // Limpar resultado após alguns segundos
    setTimeout(() => setTestResult(null), result.success ? 5000 : 8000);
  };

  const handleLimparHistorico = async () => {
    setIsClearing(true);
    setClearMessage(null);
    
    // Pausar auto-refresh para não recarregar os dados do banco
    pauseAutoRefreshRef.current = true;
    
    const result = await limparHistorico();
    
    if (result.success) {
      setClearMessage({ success: true, text: result.message });
      // Recarregar após 3 segundos para confirmar que foi limpo
      setTimeout(() => {
        pauseAutoRefreshRef.current = false;
        carregarLogs(20);
        setClearMessage(null);
      }, 3000);
    } else {
      logger.error('Erro ao limpar histórico:', result.message);
      setClearMessage({ success: false, text: result.message });
      pauseAutoRefreshRef.current = false;
      // Limpar mensagem de erro após 5 segundos
      setTimeout(() => setClearMessage(null), 5000);
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

      {/* Teste de Envio de Email */}
      <Card className="border-gray-200 shadow-sm">
        <CardHeader className="bg-gradient-to-r from-gray-50 to-white border-b border-gray-100 pb-6">
          <div>
            <CardTitle className="text-xl text-gray-900">Teste de Envio de Email</CardTitle>
            <CardDescription className="text-gray-600 mt-2">
              Envie um email de teste para verificar se toda a configuração está funcionando corretamente
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1">
              <Input
                type="email"
                placeholder="Digite o email de destino para o teste"
                value={emailTeste}
                onChange={(e) => setEmailTeste(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !isSendingTest) handleEnviarTeste();
                }}
                className="focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus:outline-none focus-visible:outline-none focus:border-gray-800"
                disabled={isSendingTest}
              />
            </div>
            <Button
              onClick={handleEnviarTeste}
              disabled={isSendingTest || !emailTeste}
              className="bg-gray-800 hover:bg-black text-white px-6 transition-all duration-300 whitespace-nowrap"
            >
              {isSendingTest ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Enviar Teste
                </>
              )}
            </Button>
          </div>

          {/* Resultado do teste */}
          {testResult && (
            <div className={`p-4 rounded-lg border transition-all duration-300 ${
              testResult.success 
                ? 'bg-green-50 border-green-200 text-green-800' 
                : 'bg-red-50 border-red-200 text-red-800'
            }`}>
              <p className="text-sm font-medium">
                {testResult.text}
              </p>
              {testResult.success && (
                <p className="text-xs mt-1 opacity-75">
                  Verifique a caixa de entrada (e spam) do email informado.
                </p>
              )}
            </div>
          )}

          <p className="text-xs text-gray-500">
            O email de teste será enviado usando as mesmas configurações do sistema (Resend + Edge Function). 
            Isso ajuda a confirmar que tudo está operacional antes de ativar o envio automático.
          </p>
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
          {/* Mensagem de feedback após limpar */}
          {clearMessage && (
            <div className={`mb-4 p-4 rounded-lg border ${
              clearMessage.success 
                ? 'bg-green-50 border-green-200 text-green-800' 
                : 'bg-red-50 border-red-200 text-red-800'
            }`}>
              <p className="text-sm font-medium">
                {clearMessage.success ? '✅' : '❌'} {clearMessage.text}
              </p>
            </div>
          )}
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
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-5 gap-2 sm:gap-3 rounded-lg border bg-white border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all"
                >
                  <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
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
                  <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0 ml-6 sm:ml-0">
                    <span
                      className={`px-2 sm:px-3 py-1 rounded text-xs font-semibold uppercase tracking-wide ${
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

