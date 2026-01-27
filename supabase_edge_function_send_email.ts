// 🔒 EDGE FUNCTION SEGURA PARA ENVIO DE EMAILS
// Arquivo: supabase/functions/send-email/index.ts
//
// Esta função DEVE ser deployada no Supabase para proteger a API key do Resend
// A API key NUNCA deve ser enviada pelo cliente!

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

// 🔒 SEGURANÇA: API key armazenada como secret do Supabase
// Configure no dashboard: Settings > Edge Functions > Secrets > RESEND_API_KEY
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

interface EmailRequest {
  to: string
  subject: string
  html: string
  from: string
}

serve(async (req) => {
  // CORS headers
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  try {
    // Parse request body
    const { to, subject, html, from }: EmailRequest = await req.json()

    // 🔒 SEGURANÇA: Validações de entrada
    if (!to || !subject || !html) {
      return new Response(
        JSON.stringify({ error: 'Campos obrigatórios faltando (to, subject, html)' }),
        { 
          status: 400, 
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          } 
        }
      )
    }

    // Validar formato de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(to)) {
      return new Response(
        JSON.stringify({ error: 'Email destinatário inválido' }),
        { 
          status: 400, 
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          } 
        }
      )
    }

    // Validar que from tem formato correto
    if (!from || !from.includes('<') || !from.includes('>')) {
      return new Response(
        JSON.stringify({ error: 'Campo "from" deve estar no formato: Nome <email@example.com>' }),
        { 
          status: 400, 
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          } 
        }
      )
    }

    // 🔒 SEGURANÇA: Verificar se API key está configurada
    if (!RESEND_API_KEY) {
      console.error('❌ RESEND_API_KEY não está configurada!')
      return new Response(
        JSON.stringify({ error: 'Servidor não configurado corretamente' }),
        { 
          status: 500, 
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          } 
        }
      )
    }

    // 🔒 SEGURANÇA: API key vem do environment do servidor, NÃO do cliente!
    console.log(`📧 Enviando email para: ${to}`)
    
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from,
        to,
        subject,
        html,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      console.error('❌ Erro Resend:', data)
      return new Response(
        JSON.stringify({ 
          error: 'Falha ao enviar email', 
          details: data 
        }),
        { 
          status: response.status, 
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          } 
        }
      )
    }

    console.log(`✅ Email enviado com sucesso para: ${to}`)
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        data,
        message: 'Email enviado com sucesso' 
      }),
      { 
        status: 200, 
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        } 
      }
    )

  } catch (error) {
    console.error('❌ Erro ao processar requisição:', error)
    return new Response(
      JSON.stringify({ 
        error: 'Erro interno do servidor',
        message: error.message 
      }),
      { 
        status: 500, 
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        } 
      }
    )
  }
})

// 📋 INSTRUÇÕES DE DEPLOY:
//
// 1. Criar a função no Supabase CLI:
//    supabase functions new send-email
//
// 2. Copiar este código para:
//    supabase/functions/send-email/index.ts
//
// 3. Configurar o secret no Supabase:
//    supabase secrets set RESEND_API_KEY=re_sua_chave_aqui
//    
//    OU via dashboard:
//    Settings > Edge Functions > Secrets > Add Secret
//    Name: RESEND_API_KEY
//    Value: re_sua_chave_aqui
//
// 4. Deploy da função:
//    supabase functions deploy send-email
//
// 5. Testar:
//    curl -X POST https://seu-projeto.supabase.co/functions/v1/send-email \
//      -H "apikey: sua-anon-key" \
//      -H "Content-Type: application/json" \
//      -d '{"to":"test@example.com","subject":"Test","html":"<p>Test</p>","from":"Name <email@example.com>"}'
//
// 6. Atualizar o cliente (remover resendApiKey do body)
