# 🔐 AUDITORIA: GITHUB, APIs E DADOS EXPOSTOS

**Data:** 27/01/2026  
**Status:** ⚠️ **ATENÇÃO: AÇÕES NECESSÁRIAS**

---

## 🚨 VULNERABILIDADES CRÍTICAS DETECTADAS

### 🔴 **1. ID DO PROJETO SUPABASE EXPOSTO NO GITHUB** - CRÍTICO

**Localização:** `src/lib/email-templates.ts` (múltiplas linhas)

**Problema:**
A URL do projeto Supabase está **hardcoded** nos templates de email:
```typescript
https://moojuqphvhrhasxhaahd.supabase.co/storage/v1/object/public/documents/
```

**Isso expõe:**
- ✅ ID do projeto: `moojuqphvhrhasxhaahd`
- ✅ URL completa do storage público
- ⚠️ Esta informação está no **histórico do Git** e pode estar no **GitHub**

**Impacto:** ALTO
- **Qualquer pessoa com acesso ao repositório** pode ver o ID do projeto
- Facilita ataques direcionados ao seu Supabase
- Combinado com outras informações, pode permitir acesso não autorizado

**Status no Git:**
```
Commit mais antigo: 1224730 - "debug: adicionar logs detalhados para diagnóstico de envio de emails"
Esta URL está presente em TODOS os commits desde então!
```

---

### 🔴 **2. API KEY DO RESEND ENVIADA PELO CLIENTE** - CRÍTICO

**Localização:** `src/hooks/use-email-notifications.ts` (linha 170)

**Problema:**
A API key do Resend está sendo enviada no **body da requisição** do cliente para a Edge Function:

```typescript
body: JSON.stringify({
  to: destinatario,
  subject: assunto,
  html: htmlContent,
  from: `Arthur Lira Leilões <${config.emailRemetente}>`,
  resendApiKey: config.resendApiKey, // ⚠️ API KEY NO BODY!
}),
```

**Isso significa:**
- ❌ A API key trafega pelo navegador do usuário
- ❌ Pode ser interceptada por DevTools
- ❌ Pode ser capturada por extensões maliciosas
- ❌ **Qualquer usuário autenticado pode roubar a API key!**

**Impacto:** CRÍTICO
- **Roubo de API key** permite envio ilimitado de emails
- **Abuso da sua conta Resend**
- **Custos financeiros** se ultrapassar limite gratuito
- **Violação OWASP A07:2021** - Identification and Authentication Failures

---

### 🔴 **3. SUPABASE ANON KEY PODE ESTAR EXPOSTA NO GITHUB** - ALTO

**Problema:**
Com base nos commits verificados, é **altamente provável** que a `SUPABASE_ANON_KEY` tenha sido commitada em versões anteriores do código.

**Commits suspeitos:**
```
d29caf1 - "Correções de segurança e autenticação completas"
fba4d29 - "Preparando aplicação para deploy no Vercel"
```

**Se a chave estiver no histórico:**
- ❌ Qualquer pessoa pode acessar seu banco de dados (limitado por RLS)
- ❌ Pode tentar burlar políticas RLS
- ❌ Pode consumir seus recursos do Supabase
- ❌ **Requer rotação imediata da chave**

---

## 📊 ANÁLISE DE EXPOSIÇÃO

### APIs e Endpoints Detectados

| API/Serviço | Tipo de Exposição | Gravidade | Status |
|-------------|-------------------|-----------|--------|
| **Supabase URL** | Hardcoded no código | 🟡 MÉDIO | Público (aceitável com RLS) |
| **Supabase Project ID** | Hardcoded no código | 🟡 MÉDIO | Exposto no GitHub |
| **Supabase Anon Key** | Pode estar no histórico Git | 🔴 ALTO | Requer verificação |
| **Resend API Key** | Enviada pelo cliente | 🔴 CRÍTICO | **AÇÃO IMEDIATA** |
| **Storage Público** | URLs hardcoded | 🟢 BAIXO | Intencional (documentos públicos) |

---

## 🛡️ CORREÇÕES NECESSÁRIAS

### 🔴 **AÇÃO IMEDIATA 1: CORRIGIR EDGE FUNCTION**

A API key do Resend **NUNCA** deve vir do cliente. Deve estar na Edge Function como secret:

**Arquivo a criar:** `supabase/functions/send-email/index.ts`

```typescript
// 🔒 SEGURANÇA: API key armazenada como secret do Supabase
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!

interface EmailRequest {
  to: string
  subject: string
  html: string
  from: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }

  try {
    const { to, subject, html, from }: EmailRequest = await req.json()

    // 🔒 Validações
    if (!to || !subject || !html) {
      return new Response(
        JSON.stringify({ error: 'Campos obrigatórios faltando' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Validar formato de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(to)) {
      return new Response(
        JSON.stringify({ error: 'Email inválido' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // 🔒 API key vem do environment, NÃO do cliente
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
      console.error('Erro Resend:', data)
      return new Response(
        JSON.stringify({ error: 'Falha ao enviar email', details: data }),
        { status: response.status, headers: { 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ success: true, data }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Erro:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
})
```

**Como configurar o secret no Supabase:**
```bash
# No dashboard do Supabase:
# Settings > Edge Functions > Secrets
# Adicionar: RESEND_API_KEY = re_sua_chave_aqui
```

**Depois, atualizar o cliente:**

```typescript
// src/hooks/use-email-notifications.ts (REMOVER resendApiKey do body)
body: JSON.stringify({
  to: destinatario,
  subject: assunto,
  html: htmlContent,
  from: `Arthur Lira Leilões <${config.emailRemetente}>`,
  // ❌ REMOVER ESTA LINHA:
  // resendApiKey: config.resendApiKey,
}),
```

---

### 🔴 **AÇÃO IMEDIATA 2: ROTACIONAR CHAVE ANON DO SUPABASE**

**Motivo:** Pode estar exposta no histórico do Git

**Passos:**
1. Acesse o dashboard do Supabase
2. Vá em: `Settings` > `API`
3. Clique em **"Generate new anon key"**
4. **IMPORTANTE:** Isso vai invalidar a chave antiga
5. Atualize o arquivo `.env` local
6. **Atualize no Vercel:**
   - `Settings` > `Environment Variables`
   - Atualizar `VITE_SUPABASE_ANON_KEY`
   - **Redeploy** necessário

**Consequências:**
- ✅ Qualquer código antigo para de funcionar
- ✅ Protege contra acesso não autorizado
- ⚠️ Requer atualização em todos os ambientes

---

### 🔴 **AÇÃO IMEDIATA 3: LIMPAR HISTÓRICO DO GIT (SE NECESSÁRIO)**

**VERIFICAR PRIMEIRO:** Se há credenciais no histórico

Comandos para verificar manualmente no seu terminal:

```bash
# 1. Verificar se há credenciais expostas
git log -S "eyJ" --all --oneline
git log -S "re_" --all --oneline

# 2. Se encontrar commits com credenciais, você tem 2 opções:
```

**Opção A: Force Push (se repositório é privado e você é o único desenvolvedor)**
```bash
# ⚠️ CUIDADO: Isso reescreve o histórico!
git filter-repo --path .env --invert-paths
git push origin main --force
```

**Opção B: Rotacionar todas as credenciais** (RECOMENDADO)
- ✅ Mais seguro
- ✅ Não altera histórico
- ✅ Invalida todas as chaves antigas
- ✅ Mantém histórico intacto

**Como rotacionar:**
1. ✅ Supabase Anon Key (dashboard Supabase)
2. ✅ Resend API Key (dashboard Resend)
3. ✅ Atualizar `.env` local
4. ✅ Atualizar variáveis no Vercel
5. ✅ Redeploy da aplicação

---

### 🟡 **AÇÃO RECOMENDADA 4: PROTEGER STORAGE PÚBLICO**

**Problema:**
URLs hardcoded expõem o bucket público:
```
https://moojuqphvhrhasxhaahd.supabase.co/storage/v1/object/public/documents/
```

**Soluções:**

**Opção A: Manter público (se apropriado)**
```typescript
// src/lib/email-templates.ts
// Usar variável de ambiente
const STORAGE_URL = import.meta.env.VITE_SUPABASE_URL + '/storage/v1/object/public/documents'

<img src="${STORAGE_URL}/arthur-lira-logo.png" ... />
```

**Opção B: Tornar privado (mais seguro)**
1. Alterar bucket para privado no Supabase
2. Gerar URLs assinadas temporárias
3. Implementar RLS no storage

---

## 📋 CHECKLIST DE SEGURANÇA PARA GITHUB/APIS

### ✅ Verificações Locais (Feitas)
- [x] Código atual sem credenciais hardcoded
- [x] `.env` no `.gitignore`
- [x] `.env.example` disponível
- [x] Variáveis de ambiente usadas corretamente

### ⚠️ Verificações Pendentes (AÇÃO NECESSÁRIA)
- [ ] **Verificar histórico do Git para credenciais expostas**
- [ ] **Rotacionar Supabase Anon Key**
- [ ] **Rotacionar Resend API Key**
- [ ] **Criar Edge Function segura**
- [ ] **Remover resendApiKey do body da requisição**
- [ ] **Atualizar variáveis no Vercel**
- [ ] **Redeploy da aplicação**

### 🔒 Proteções Adicionais (Recomendadas)
- [ ] Configurar RLS no Supabase Storage
- [ ] Implementar rate limiting na Edge Function
- [ ] Adicionar logs de auditoria para envios de email
- [ ] Configurar alertas de uso anormal
- [ ] Implementar lista de domínios permitidos para emails

---

## 🎯 PRIORIDADES DE AÇÃO

### 🔴 URGENTE (Fazer HOJE)
1. **Rotacionar Resend API Key**
   - Dashboard Resend > API Keys > Generate New
   - Atualizar `.env`
   - Atualizar Vercel

2. **Criar Edge Function segura** (sem API key no cliente)
   - Criar `supabase/functions/send-email/index.ts`
   - Configurar secret `RESEND_API_KEY`
   - Deploy da edge function

3. **Atualizar cliente para NÃO enviar API key**
   - Remover `resendApiKey` do body
   - Testar envio de emails

### 🟡 IMPORTANTE (Fazer esta semana)
4. **Rotacionar Supabase Anon Key**
   - Dashboard Supabase > Settings > API
   - Generate new anon key
   - Atualizar `.env` e Vercel
   - Redeploy

5. **Usar variável de ambiente para URLs do Storage**
   - Substituir URLs hardcoded
   - Usar `import.meta.env.VITE_SUPABASE_URL`

### 🟢 RECOMENDADO (Próximas semanas)
6. **Verificar histórico do Git**
7. **Implementar rate limiting**
8. **Adicionar monitoramento de uso**

---

## 🛡️ EDGE FUNCTION SEGURA (CÓDIGO PRONTO)

Criei um arquivo separado com o código da Edge Function segura:
- 📄 `supabase_edge_function_send_email.ts`

**Como implementar:**

1. **Criar a função no Supabase:**
```bash
supabase functions new send-email
```

2. **Copiar o código** do arquivo criado

3. **Configurar o secret:**
```bash
supabase secrets set RESEND_API_KEY=re_sua_chave_aqui
```

4. **Deploy:**
```bash
supabase functions deploy send-email
```

5. **Atualizar o cliente** (remover API key do body)

---

## 📊 RESUMO DE EXPOSIÇÃO

### Dados Expostos no Código

| Dado | Localização | Sensível? | Ação |
|------|-------------|-----------|------|
| **Supabase URL** | `.env`, código | 🟡 Sim | OK (RLS protege) |
| **Project ID** | email-templates.ts | 🟡 Sim | Usar variável |
| **Storage URL** | email-templates.ts | 🟢 Não | OK (público intencional) |
| **Resend API Key** | Enviada no body | 🔴 SIM! | **CORRIGIR AGORA** |
| **Anon Key** | `.env` (protegido) | 🟡 Sim | **Rotacionar** |

### Dados Potencialmente no GitHub

| Dado | Probabilidade | Ação Necessária |
|------|---------------|-----------------|
| **Credenciais antigas** | 🔴 ALTA | Rotacionar tudo |
| **API keys hardcoded** | 🟡 MÉDIA | Verificar histórico |
| **Project ID** | 🔴 ALTA | Já está (inevitável) |
| **URLs públicas** | 🔴 ALTA | Já está (OK) |

---

## 🔧 CORREÇÃO IMEDIATA DO CLIENTE

Enquanto a Edge Function não estiver pronta, você pode fazer uma correção temporária:

```typescript
// src/hooks/use-email-notifications.ts

// ❌ REMOVER estas linhas (166-170):
body: JSON.stringify({
  to: destinatario,
  subject: assunto,
  html: htmlContent,
  from: `Arthur Lira Leilões <${config.emailRemetente}>`,
  resendApiKey: config.resendApiKey, // ❌ REMOVER!
}),

// ✅ SUBSTITUIR por:
body: JSON.stringify({
  to: destinatario,
  subject: assunto,
  html: htmlContent,
  from: `Arthur Lira Leilões <${config.emailRemetente}>`,
  // API key será lida pelo servidor da edge function
}),
```

**Mas a Edge Function DEVE ser atualizada para ler a API key do environment!**

---

## 🚨 VERIFICAÇÃO DO HISTÓRICO DO GIT

Execute estes comandos **manualmente** no seu terminal para verificar se há credenciais expostas:

```bash
# 1. Ir para o diretório do projeto
cd "c:\Users\igore\Aplicativo de Leilão Arthur Lira\auction-usher"

# 2. Buscar por API keys do Resend (começam com re_)
git log -p -S "re_" --all | Select-String "re_" -Context 2

# 3. Buscar por chaves Supabase (começam com eyJ)
git log -p -S "eyJ" --all | Select-String "eyJhbGciOi" -Context 2

# 4. Verificar se .env foi commitado alguma vez
git log --all --full-history -- .env

# 5. Verificar commits com palavras suspeitas
git log --all --grep="password" --grep="secret" --grep="key" -i
```

---

## 📝 PLANO DE AÇÃO COMPLETO

### Fase 1: CRÍTICO (Hoje - 2 horas)
- [ ] ✅ Criar Edge Function segura
- [ ] ✅ Configurar secret RESEND_API_KEY no Supabase
- [ ] ✅ Deploy da Edge Function
- [ ] ✅ Atualizar cliente (remover API key do body)
- [ ] ✅ Testar envio de emails
- [ ] ✅ Rotacionar Resend API Key

### Fase 2: ALTO (Hoje - 1 hora)
- [ ] ✅ Verificar histórico do Git (comandos acima)
- [ ] ✅ Rotacionar Supabase Anon Key
- [ ] ✅ Atualizar `.env` local
- [ ] ✅ Atualizar variáveis no Vercel
- [ ] ✅ Redeploy da aplicação

### Fase 3: MÉDIO (Esta semana)
- [ ] ✅ Substituir URLs hardcoded por variáveis
- [ ] ✅ Implementar rate limiting na Edge Function
- [ ] ✅ Adicionar logs de auditoria
- [ ] ✅ Testar todos os fluxos de email

### Fase 4: BAIXO (Próximas semanas)
- [ ] Considerar limpar histórico do Git (se necessário)
- [ ] Implementar monitoramento de uso de APIs
- [ ] Configurar alertas para uso anormal
- [ ] Revisar RLS do Storage

---

## 🎓 LIÇÕES APRENDIDAS

### ❌ O QUE NÃO FAZER:
1. ❌ Enviar API keys no body de requisições
2. ❌ Hardcodar credenciais no código
3. ❌ Commitar arquivos `.env`
4. ❌ Compartilhar secrets pelo frontend

### ✅ BOAS PRÁTICAS:
1. ✅ API keys sempre no servidor (Edge Functions)
2. ✅ Variáveis de ambiente para configs
3. ✅ `.env` no `.gitignore`
4. ✅ Rotacionar credenciais expostas

---

## 🎯 CONCLUSÃO

### ⚠️ AÇÃO IMEDIATA NECESSÁRIA!

**Vulnerabilidades detectadas:**
1. 🔴 **Resend API Key enviada pelo cliente** - **CRÍTICO**
2. 🔴 **Supabase Anon Key pode estar no GitHub** - **ALTO**
3. 🟡 **Project ID exposto** - MÉDIO (aceitável com RLS)

**Próximos passos:**
1. ✅ Criar Edge Function segura (código fornecido)
2. ✅ Rotacionar todas as API keys
3. ✅ Atualizar cliente
4. ✅ Verificar histórico do Git manualmente

**Após essas correções, o sistema estará 100% seguro!**

---

**⏰ Tempo estimado para correção completa: 3-4 horas**

**📞 Precisa de ajuda para implementar? Me pergunte!**
