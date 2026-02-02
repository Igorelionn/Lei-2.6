// Supabase Edge Function para enviar emails via Resend
// Esta função atua como intermediário seguro entre o frontend e o Resend API
// Configuração: verify_jwt = false (permite acesso público com chave API)

// Declaração de tipo para Deno (disponível no runtime do Supabase Edge Functions)
declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
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
  resendApiKey?: string
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { to, subject, html, from, resendApiKey }: EmailRequest = await req.json()

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

    // Validar que a chave API do Resend foi fornecida
    // Esta é a nossa camada de segurança já que verify_jwt está desabilitado
    if (!resendApiKey) {
      return new Response(
        JSON.stringify({ 
          error: 'Chave API do Resend é obrigatória' 
        }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Validar formato básico da chave Resend (deve começar com re_)
    if (!resendApiKey.startsWith('re_')) {
      return new Response(
        JSON.stringify({ 
          error: 'Chave API do Resend inválida' 
        }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    const apiKey = resendApiKey

    // Email remetente padrão (domínio verificado)
    const fromEmail = from || 'Arthur Lira Leilões <notificacoes@grupoliraleiloes.com>'

    console.log('Enviando email para:', to)

    // Fazer a chamada ao Resend API
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
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

