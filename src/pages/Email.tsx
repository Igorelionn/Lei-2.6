import { EmailNotificationSettings } from '@/components/EmailNotificationSettings';
import { ArrowLeft, Mail } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export default function Email() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header da Página */}
        <div className="mb-8">
          <Button
            variant="ghost"
            onClick={() => navigate('/configuracoes')}
            className="mb-4 text-gray-600 hover:text-gray-900 hover:bg-gray-100"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar para Configurações
          </Button>

          <div className="flex items-center gap-4 mb-2">
            <div className="p-3 bg-gray-100 rounded-lg">
              <Mail className="h-8 w-8 text-gray-700" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Sistema de Notificações por Email
              </h1>
              <p className="text-gray-600 mt-1">
                Gerencie as configurações automáticas de envio de lembretes e cobranças aos arrematantes
              </p>
            </div>
          </div>
        </div>

        {/* Conteúdo Principal */}
        <EmailNotificationSettings />
      </div>
    </div>
  );
}

