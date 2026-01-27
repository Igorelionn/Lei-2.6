# 🚨 AÇÕES URGENTES DE SEGURANÇA - LEIA AGORA!

**Data:** 27/01/2026  
**Prioridade:** 🔴 **CRÍTICA**  
**Tempo necessário:** 30-60 minutos

---

## ⚠️ SITUAÇÃO ATUAL

Encontrei **2 vulnerabilidades CRÍTICAS** relacionadas a APIs expostas:

```
┌─────────────────────────────────────────────────────────┐
│  🔴 CRÍTICO: AÇÃO IMEDIATA NECESSÁRIA                   │
│                                                         │
│  1. ❌ API Key do Resend exposta no navegador          │
│  2. ❌ Credenciais podem estar no histórico do Git     │
│  3. ⚠️  Project ID do Supabase público no GitHub       │
│                                                         │
│  📊 Risco: ALTO                                         │
│  🎯 Ação: Rotacionar credenciais + Edge Function       │
└─────────────────────────────────────────────────────────┘
```

---

## 🔴 PROBLEMA 1: API KEY DO RESEND EXPOSTA

### O Que Está Acontecendo?
A API key do Resend está sendo **enviada pelo navegador** para o servidor:

```typescript
// ❌ CÓDIGO VULNERÁVEL (src/hooks/use-email-notifications.ts)
body: JSON.stringify({
  to: destinatario,
  resendApiKey: config.resendApiKey, // ❌ API KEY EXPOSTA!
}),
```

### Por Que É Perigoso?
- ❌ **Qualquer usuário** pode abrir DevTools e ver a API key
- ❌ **Extensões maliciosas** podem capturar a key
- ❌ **Alguém pode roubar** e usar para enviar emails ilimitados
- ❌ **Você paga a conta!**

### Como Explorar (Teste):
```javascript
// No console do navegador (F12):
1. Ir para aba "Network"
2. Enviar um email de teste no sistema
3. Clicar na requisição "send-email"
4. Ver "Payload" ou "Request"
5. A API key está visível!
```

### ✅ Correção Aplicada:
**JÁ CORRIGI O CÓDIGO!** Removi a API key do body da requisição.

**Mas você AINDA PRECISA:**
1. ✅ Criar Edge Function segura (código fornecido)
2. ✅ Configurar secret no Supabase
3. ✅ Rotacionar a API key do Resend

---

## 🔴 PROBLEMA 2: CREDENCIAIS NO HISTÓRICO DO GIT

### O Que Pode Estar Exposto?
Com base nos commits analisados, **provavelmente** estas credenciais foram commitadas antes:

```
Commit: d29caf1 - "Correções de segurança e autenticação completas"
Commit: fba4d29 - "Preparando aplicação para deploy no Vercel"
```

**Possíveis credenciais expostas:**
- ⚠️ Supabase Anon Key
- ⚠️ Resend API Key (antiga)
- ⚠️ Outras configurações

### Como Verificar?
Execute os comandos do arquivo: `VERIFICACAO_GITHUB_MANUAL.md`

---

## 🎯 PLANO DE AÇÃO IMEDIATO

### ✅ FAZER AGORA (30-60 minutos)

Siga **na ordem**:

#### 1️⃣ ROTACIONAR RESEND API KEY (10 min)
```
📄 Guia detalhado: ROTACAO_CREDENCIAIS_PASSO_A_PASSO.md
📍 Seção: PASSO 2
```

#### 2️⃣ CONFIGURAR EDGE FUNCTION SEGURA (20 min)
```
📄 Código pronto: supabase_edge_function_send_email.ts
📍 Guia: ROTACAO_CREDENCIAIS_PASSO_A_PASSO.md - PASSO 5
```

#### 3️⃣ ROTACIONAR SUPABASE ANON KEY (10 min)
```
📄 Guia detalhado: ROTACAO_CREDENCIAIS_PASSO_A_PASSO.md
📍 Seção: PASSO 1
```

#### 4️⃣ ATUALIZAR VERCEL (10 min)
```
📄 Guia detalhado: ROTACAO_CREDENCIAIS_PASSO_A_PASSO.md
📍 Seção: PASSO 3
```

#### 5️⃣ TESTAR TUDO (10 min)
```
- ✅ Login local
- ✅ Login produção
- ✅ Envio de email
```

---

## 📊 IMPACTO DA NÃO AÇÃO

### Se NÃO rotacionar as credenciais:

| Risco | Probabilidade | Impacto | Gravidade |
|-------|---------------|---------|-----------|
| Roubo de API key Resend | 🔴 ALTA | Custos financeiros | 🔴 CRÍTICO |
| Acesso não autorizado ao banco | 🟡 MÉDIA | Vazamento de dados | 🔴 ALTO |
| Envio massivo de emails | 🟡 MÉDIA | Ban da conta Resend | 🔴 ALTO |
| Consumo de recursos Supabase | 🟡 MÉDIA | Custos financeiros | 🟡 MÉDIO |

### Se rotacionar as credenciais:

| Benefício | Resultado |
|-----------|-----------|
| Credenciais antigas inválidas | ✅ Sistema protegido |
| API key segura no servidor | ✅ Sem exposição |
| Acesso controlado | ✅ RLS funcionando |
| Custos controlados | ✅ Sem surpresas |

---

## 🎯 RESUMO EXECUTIVO

### O QUE FAZER AGORA:

```
┌─────────────────────────────────────────────────────────┐
│  AÇÕES OBRIGATÓRIAS (HOJE)                              │
│                                                         │
│  1️⃣  Rotacionar Resend API Key          [10 min]        │
│  2️⃣  Criar Edge Function segura         [20 min]        │
│  3️⃣  Rotacionar Supabase Anon Key       [10 min]        │
│  4️⃣  Atualizar Vercel                   [10 min]        │
│  5️⃣  Testar tudo                        [10 min]        │
│                                                         │
│  ⏰ Total: 60 minutos                                    │
│  📄 Guias: ROTACAO_CREDENCIAIS_PASSO_A_PASSO.md         │
└─────────────────────────────────────────────────────────┘
```

---

## 📚 DOCUMENTOS CRIADOS

Para te ajudar, criei **3 documentos detalhados**:

1. 📄 **`AUDITORIA_GITHUB_APIS.md`**
   - Análise completa de exposição
   - Vulnerabilidades detectadas
   - Explicação técnica

2. 📄 **`ROTACAO_CREDENCIAIS_PASSO_A_PASSO.md`**
   - Guia passo a passo com screenshots
   - Comandos prontos para copiar
   - Checklist completa

3. 📄 **`VERIFICACAO_GITHUB_MANUAL.md`**
   - Comandos para verificar Git
   - Como limpar histórico (se necessário)
   - Opções e recomendações

4. 📄 **`supabase_edge_function_send_email.ts`**
   - Código completo da Edge Function segura
   - Pronto para copiar e colar
   - Com comentários explicativos

---

## 💡 NÃO SABE POR ONDE COMEÇAR?

### Siga esta ordem:

```
1. Leia: ROTACAO_CREDENCIAIS_PASSO_A_PASSO.md
2. Execute: Todos os passos na ordem
3. Se tiver dúvida: Me pergunte!
```

---

## 🆘 PRECISA DE AJUDA?

**Estou aqui para:**
- ✅ Responder dúvidas sobre cada passo
- ✅ Debugar problemas durante a rotação
- ✅ Verificar se tudo está funcionando
- ✅ Criar scripts ou comandos específicos

**Basta me perguntar!** 🚀

---

## ⏰ PRAZO

**Recomendação:** Fazer **HOJE**

**Por quê?**
- 🔴 API key exposta no navegador (qualquer usuário pode ver)
- 🔴 Credenciais podem estar no GitHub (acesso público)
- 🔴 Risco de abuso e custos financeiros

**Quanto antes rotacionar, mais seguro fica!**

---

**🎯 FOCO:** Rotacionar credenciais + Edge Function segura  
**⏰ TEMPO:** 60 minutos  
**📄 GUIA:** ROTACAO_CREDENCIAIS_PASSO_A_PASSO.md

**Vamos começar?** 💪
