// Supabase Edge Function para enviar emails via Resend
// Esta função atua como intermediário seguro entre o frontend e o Resend API
// A API key do Resend deve estar configurada como secret: RESEND_API_KEY

// Declaração de tipo para Deno (disponível no runtime do Supabase Edge Functions)
declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
  env: {
    get: (key: string) => string | undefined;
  };
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface EmailRequest {
  to: string
  subject: string
  html: string
  from?: string
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { to, subject, html, from }: EmailRequest = await req.json()

    // Validar dados obrigatórios
    if (!to || !subject || !html) {
      return new Response(
        JSON.stringify({ 
          error: 'Campos obrigatórios faltando: to, subject, html' 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // 🔒 SEGURANÇA: Obter a chave API do Resend das variáveis de ambiente (Secrets)
    // Configure em: Supabase Dashboard > Edge Functions > Secrets > RESEND_API_KEY
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    
    if (!resendApiKey) {
      console.error('RESEND_API_KEY não configurada nas secrets')
      return new Response(
        JSON.stringify({ 
          error: 'Serviço de email não configurado. Entre em contato com o suporte.' 
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Email remetente padrão (domínio verificado)
    const fromEmail = from || 'Arthur Lira Leilões <notificacoes@grupoliraleiloes.com>'

    console.log('Enviando email para:', to)

    // Fazer a chamada ao Resend API
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [to],
        subject: subject,
        html: html,
      }),
    })

    const resendData = await resendResponse.json()

    if (!resendResponse.ok) {
      console.error('Erro do Resend:', resendData)
      return new Response(
        JSON.stringify({ 
          error: resendData.message || 'Erro ao enviar email',
          details: resendData
        }),
        { 
          status: resendResponse.status, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    console.log('Email enviado com sucesso:', resendData.id)

    return new Response(
      JSON.stringify({ 
        success: true,
        id: resendData.id,
        message: 'Email enviado com sucesso'
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Erro ao processar requisição:', error)
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Erro interno ao enviar email' 
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})

