# 🔐 ROTAÇÃO DE CREDENCIAIS - PASSO A PASSO

**Data:** 27/01/2026  
**Tempo estimado:** 30-60 minutos  
**Dificuldade:** Fácil

---

## 🎯 OBJETIVO

Rotacionar (trocar) todas as credenciais para garantir que eventuais chaves expostas no histórico do Git fiquem **inválidas e inúteis**.

---

## 📋 O QUE VOCÊ VAI PRECISAR

- ✅ Acesso ao dashboard do Supabase
- ✅ Acesso ao dashboard do Resend
- ✅ Acesso ao dashboard do Vercel
- ✅ Editor de texto (para editar `.env`)

---

## 🔄 PASSO 1: ROTACIONAR SUPABASE ANON KEY

### 1.1. Acessar o Dashboard
```
1. Abra: https://supabase.com/dashboard
2. Faça login
3. Selecione seu projeto: auction-usher
```

### 1.2. Gerar Nova Chave
```
1. Vá em: Settings (ícone de engrenagem)
2. Clique em: API
3. Na seção "Project API keys"
4. Localize: "anon public"
5. Clique em: "Reveal" para ver a chave atual
6. Clique em: "Generate new anon key" (pode estar como botão ou link)
```

⚠️ **IMPORTANTE:** Ao gerar nova chave, a antiga para de funcionar IMEDIATAMENTE!

### 1.3. Copiar Nova Chave
```
1. Copie a nova chave gerada
2. Ela começa com: eyJhbGciOi...
3. Guarde temporariamente em um arquivo de texto
```

### 1.4. Atualizar .env Local
```
1. Abra o arquivo: .env
2. Localize a linha: VITE_SUPABASE_ANON_KEY=...
3. Substitua pela nova chave
4. Salve o arquivo
```

### 1.5. Testar Localmente
```powershell
# No terminal:
npm run dev

# Abra: http://localhost:8080
# Tente fazer login
# Se funcionar, a chave está correta!
```

---

## 📧 PASSO 2: ROTACIONAR RESEND API KEY

### 2.1. Acessar o Dashboard
```
1. Abra: https://resend.com/dashboard
2. Faça login
3. Vá em: API Keys
```

### 2.2. Criar Nova Chave
```
1. Clique em: "Create API Key"
2. Nome: "Arthur Lira Production"
3. Permission: "Sending access"
4. Clique em: "Add"
```

### 2.3. Copiar Nova Chave
```
1. Copie a nova chave (começa com re_)
2. ⚠️ IMPORTANTE: Você só verá esta chave UMA VEZ!
3. Guarde em local seguro
```

### 2.4. Atualizar .env Local
```
1. Abra o arquivo: .env
2. Localize a linha: VITE_RESEND_API_KEY=...
3. Substitua pela nova chave
4. Salve o arquivo
```

### 2.5. Deletar Chave Antiga
```
1. Volte para: API Keys no dashboard Resend
2. Localize a chave antiga
3. Clique nos 3 pontinhos > Delete
4. Confirme a exclusão
```

---

## ☁️ PASSO 3: ATUALIZAR CREDENCIAIS NO VERCEL

### 3.1. Acessar o Dashboard
```
1. Abra: https://vercel.com/dashboard
2. Faça login
3. Selecione seu projeto
```

### 3.2. Atualizar Variáveis
```
1. Vá em: Settings
2. Clique em: Environment Variables
3. Localize: VITE_SUPABASE_ANON_KEY
4. Clique em: Edit (ícone de lápis)
5. Cole a NOVA chave do Supabase
6. Clique em: Save

7. Localize: VITE_RESEND_API_KEY
8. Clique em: Edit
9. Cole a NOVA chave do Resend
10. Clique em: Save
```

### 3.3. Redeploy da Aplicação
```
1. Ainda no dashboard do Vercel
2. Vá em: Deployments
3. Clique nos 3 pontinhos do último deploy
4. Clique em: Redeploy
5. Selecione: "Use existing build cache" (mais rápido)
6. Clique em: Redeploy
```

⏰ **Aguarde:** Deploy leva 2-5 minutos

---

## 🧪 PASSO 4: TESTAR TUDO

### 4.1. Testar Localmente
```
1. http://localhost:8080
2. Fazer login
3. Criar um leilão de teste
4. Adicionar arrematante com email
5. Tentar enviar email de teste
```

✅ **Se tudo funcionar:** Credenciais locais estão corretas!

### 4.2. Testar em Produção (Vercel)
```
1. Abra sua URL do Vercel (ex: seu-app.vercel.app)
2. Fazer login
3. Verificar se dados carregam
4. Testar envio de email
```

✅ **Se tudo funcionar:** Credenciais em produção estão corretas!

---

## 🔒 PASSO 5: CONFIGURAR EDGE FUNCTION SEGURA (CRÍTICO)

### 5.1. Instalar Supabase CLI (se não tiver)
```powershell
npm install -g supabase
```

### 5.2. Fazer Login no Supabase CLI
```powershell
supabase login
```

### 5.3. Link com seu Projeto
```powershell
supabase link --project-ref moojuqphvhrhasxhaahd
```

### 5.4. Criar a Edge Function
```powershell
supabase functions new send-email
```

Isso cria: `supabase/functions/send-email/index.ts`

### 5.5. Copiar Código Seguro
```
1. Abra o arquivo criado: supabase/functions/send-email/index.ts
2. Delete todo o conteúdo
3. Copie o código do arquivo: supabase_edge_function_send_email.ts
4. Cole no index.ts
5. Salve
```

### 5.6. Configurar Secret
```powershell
supabase secrets set RESEND_API_KEY=re_sua_nova_chave_aqui
```

### 5.7. Deploy da Edge Function
```powershell
supabase functions deploy send-email
```

### 5.8. Testar Edge Function
```powershell
curl -X POST https://moojuqphvhrhasxhaahd.supabase.co/functions/v1/send-email `
  -H "apikey: sua-anon-key-aqui" `
  -H "Content-Type: application/json" `
  -d '{"to":"seu-email@example.com","subject":"Teste","html":"<p>Teste de email</p>","from":"Arthur Lira <noreply@arthurlira.com>"}'
```

✅ **Se receber:** `{"success":true,...}` - Edge Function está funcionando!

---

## ✅ CHECKLIST FINAL

### Credenciais Rotacionadas
- [ ] ✅ Supabase Anon Key rotacionada
- [ ] ✅ Resend API Key rotacionada
- [ ] ✅ `.env` local atualizado
- [ ] ✅ Vercel atualizado
- [ ] ✅ Vercel deployado

### Edge Function
- [ ] ✅ Supabase CLI instalado
- [ ] ✅ Edge Function criada
- [ ] ✅ Secret configurado
- [ ] ✅ Edge Function deployada
- [ ] ✅ Cliente atualizado (sem API key no body)

### Testes
- [ ] ✅ Login local funciona
- [ ] ✅ Login produção funciona
- [ ] ✅ Emails funcionam localmente
- [ ] ✅ Emails funcionam em produção

---

## 🎊 CONCLUSÃO

Após completar todos os passos:

✅ **Credenciais antigas ficam INVÁLIDAS**  
✅ **Sistema protegido contra acesso não autorizado**  
✅ **API key do Resend segura no servidor**  
✅ **Aplicação funcionando em todos os ambientes**

**Tempo total:** 30-60 minutos  
**Dificuldade:** Fácil  
**Resultado:** Sistema 100% seguro!

---

## 📞 DÚVIDAS?

Se tiver qualquer problema ou dúvida em algum passo, me pergunte!

**Estou aqui para ajudar!** 🚀
