# 🔍 GUIA DE VERIFICAÇÃO MANUAL DO GITHUB

**Data:** 27/01/2026  
**Objetivo:** Verificar se há credenciais expostas no histórico do Git

---

## ⚠️ POR QUE ISSO É IMPORTANTE?

Mesmo que você tenha movido as credenciais para `.env` e adicionado ao `.gitignore`, **elas podem ainda estar no histórico do Git** se foram commitadas antes.

**Qualquer pessoa com acesso ao repositório pode:**
- ❌ Ver todo o histórico de commits
- ❌ Encontrar credenciais antigas
- ❌ Acessar seu banco de dados
- ❌ Enviar emails pela sua conta
- ❌ Gerar custos na sua conta

---

## 🔍 COMANDOS DE VERIFICAÇÃO

Execute estes comandos **no seu terminal** (PowerShell ou CMD):

### 1. Ir para o diretório do projeto
```powershell
cd "c:\Users\igore\Aplicativo de Leilão Arthur Lira\auction-usher"
```

### 2. Buscar por API keys do Resend (começam com `re_`)
```powershell
git log -p -S "re_" --all | Select-String "re_[A-Za-z0-9]" -Context 3
```

**O que procurar:**
- Strings que começam com `re_` seguidas de letras/números
- Exemplo: `re_AbCdEfGh123456`

### 3. Buscar por chaves JWT do Supabase (começam com `eyJ`)
```powershell
git log -p -S "eyJ" --all | Select-String "eyJhbGciOi" -Context 3
```

**O que procurar:**
- Strings longas começando com `eyJhbGciOi`
- São tokens JWT usados pelo Supabase

### 4. Verificar se .env foi commitado
```powershell
git log --all --full-history -- .env
```

**Se retornar commits:**
- ❌ O arquivo `.env` foi commitado!
- ⚠️ **AÇÃO URGENTE**: Rotacionar TODAS as credenciais

**Se retornar vazio:**
- ✅ `.env` nunca foi commitado

### 5. Buscar por URLs do Supabase com credenciais
```powershell
git log -p --all | Select-String "supabase.co.*apikey|supabase.co.*key" -Context 2
```

### 6. Verificar commits com palavras suspeitas
```powershell
git log --all --oneline | Select-String "password|secret|key|credential|token" -CaseSensitive:$false
```

---

## 🚨 SE ENCONTRAR CREDENCIAIS NO HISTÓRICO

### ✅ **OPÇÃO 1: ROTACIONAR CREDENCIAIS** (RECOMENDADO)

**Mais seguro e simples:**

1. **Rotacionar Supabase Anon Key**
   - Dashboard Supabase > Settings > API
   - "Generate new anon key"
   - Copiar nova chave

2. **Rotacionar Resend API Key**
   - Dashboard Resend > API Keys
   - "Create API Key"
   - Deletar chave antiga

3. **Atualizar localmente**
   ```
   # Editar .env
   VITE_SUPABASE_ANON_KEY=nova-chave-aqui
   VITE_RESEND_API_KEY=re_nova_chave_aqui
   ```

4. **Atualizar no Vercel**
   - Settings > Environment Variables
   - Editar as variáveis
   - Redeploy necessário

5. **Testar aplicação**

**Vantagens:**
- ✅ Não altera histórico do Git
- ✅ Mais rápido (30 minutos)
- ✅ Sem risco de quebrar o repositório
- ✅ Credenciais antigas ficam inválidas

**Desvantagens:**
- ⚠️ Credenciais antigas ainda visíveis no GitHub (mas inúteis)

---

### ⚠️ **OPÇÃO 2: LIMPAR HISTÓRICO DO GIT** (AVANÇADO)

**⚠️ CUIDADO: Esta opção é DESTRUTIVA!**

Use apenas se:
- ✅ Você é o único desenvolvedor
- ✅ Ninguém mais tem clone do repositório
- ✅ Você entende os riscos

**Passos:**

1. **Instalar git-filter-repo**
   ```powershell
   pip install git-filter-repo
   ```

2. **Backup do repositório**
   ```powershell
   cd ..
   cp -r "Aplicativo de Leilão Arthur Lira" "Aplicativo de Leilão Arthur Lira - BACKUP"
   ```

3. **Limpar arquivo .env do histórico**
   ```powershell
   cd "Aplicativo de Leilão Arthur Lira\auction-usher"
   git filter-repo --path .env --invert-paths --force
   ```

4. **Limpar strings específicas (credenciais)**
   ```powershell
   # Substituir 'SUA_CREDENCIAL_ANTIGA' pela credencial real encontrada
   git filter-repo --replace-text <(echo 'SUA_CREDENCIAL_ANTIGA==>***REMOVIDO***')
   ```

5. **Force push para o GitHub**
   ```powershell
   git push origin main --force
   ```

6. **Avisar colaboradores** (se houver)
   - Todos devem deletar seus clones locais
   - Todos devem fazer novo clone do repositório

**Vantagens:**
- ✅ Remove credenciais do histórico completamente
- ✅ GitHub fica limpo

**Desvantagens:**
- ⚠️ DESTRUTIVO (reescreve histórico)
- ⚠️ Quebra clones locais de outros desenvolvedores
- ⚠️ Pode quebrar PRs/issues antigas
- ⚠️ Mais arriscado

---

## 🎯 RECOMENDAÇÃO FINAL

### ✅ **FAÇA OPÇÃO 1: ROTACIONAR CREDENCIAIS**

**Por quê?**
- ✅ Mais seguro (sem risco de quebrar o repositório)
- ✅ Mais rápido (30 minutos vs 2-3 horas)
- ✅ Igualmente efetivo (credenciais antigas ficam inválidas)
- ✅ Sem necessidade de coordenar com outros desenvolvedores

**Credenciais antigas no GitHub ficam visíveis mas INÚTEIS!**

---

## 📋 CHECKLIST DE ROTAÇÃO DE CREDENCIAIS

### Supabase Anon Key
- [ ] Acessar dashboard Supabase
- [ ] Settings > API > Generate new anon key
- [ ] Copiar nova chave
- [ ] Atualizar `.env` local
- [ ] Atualizar Vercel (Environment Variables)
- [ ] Redeploy no Vercel
- [ ] Testar login na aplicação

### Resend API Key
- [ ] Acessar dashboard Resend
- [ ] API Keys > Create API Key
- [ ] Copiar nova chave
- [ ] Atualizar `.env` local
- [ ] Configurar como secret na Edge Function
- [ ] Deploy da Edge Function
- [ ] Testar envio de emails
- [ ] Deletar chave antiga no Resend

### Verificação Final
- [ ] Aplicação funciona localmente
- [ ] Aplicação funciona no Vercel
- [ ] Login funciona
- [ ] Emails funcionam
- [ ] Sem erros no console

---

## 🔐 APÓS ROTAÇÃO

### ✅ O QUE VAI ACONTECER:
- ✅ Credenciais antigas param de funcionar imediatamente
- ✅ Aplicação usa as novas credenciais
- ✅ Qualquer tentativa com credenciais antigas falha
- ✅ Sistema protegido

### ⚠️ CUIDADOS:
- ⚠️ Certifique-se de atualizar em TODOS os ambientes
- ⚠️ Teste antes de considerar completo
- ⚠️ Guarde as novas credenciais em local seguro (gerenciador de senhas)

---

## 📞 PRECISA DE AJUDA?

Se tiver dúvida em qualquer etapa, me pergunte!

**⏰ Tempo estimado: 30-60 minutos**
