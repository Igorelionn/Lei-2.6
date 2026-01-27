# 🔒 GUIA DE SEGURANÇA - Aplicativo de Leilão

## 🚨 AÇÕES URGENTES NECESSÁRIAS

### ⚠️ PASSO 1: Rotacionar Credenciais do Supabase (CRÍTICO!)

As credenciais do Supabase estavam expostas no código. Você DEVE rotacioná-las AGORA:

1. **Acesse**: https://supabase.com/dashboard
2. **Navegue para**: Seu Projeto > Settings > API
3. **Clique em**: "Rotate" na chave `anon key`
4. **Copie** a nova chave e cole no arquivo `.env`:
   ```env
   VITE_SUPABASE_ANON_KEY=nova-chave-aqui
   ```
5. **Reinicie** o servidor de desenvolvimento

### ⚠️ PASSO 2: Aplicar Row Level Security (RLS)

Execute o script SQL fornecido no Supabase:

1. **Abra**: Painel do Supabase > SQL Editor
2. **Copie todo o conteúdo** de `supabase_rls_setup.sql`
3. **Execute** o script
4. **Verifique** que todas as tabelas têm RLS ativo

---

## ✅ O QUE FOI CORRIGIDO

### 1. Credenciais Hardcoded ✅
- ✅ Removidas do código-fonte
- ✅ Movidas para arquivo `.env`
- ✅ `.env` adicionado ao `.gitignore`
- ✅ `.env.example` criado para equipe

**Arquivo:** `src/lib/supabase-client.ts`

### 2. Componentes Seguros Criados ✅
- ✅ `ImagePlaceholderIcon.tsx` - SVG seguro
- ✅ `ImageWithFallback.tsx` - Componente com fallback
- ⏳ Integração parcial (continuar substituindo innerHTML)

### 3. .gitignore Atualizado ✅
- ✅ Arquivos `.env` não serão commitados
- ✅ Credenciais e secrets protegidos

---

## 📋 ARQUIVOS CRIADOS

```
auction-usher/
├── .env                                    # ⚠️ NUNCA COMMITAR!
├── .env.example                           # ✅ Template seguro
├── .gitignore                             # ✅ Atualizado
├── SECURITY_FIXES_REPORT.md              # 📊 Relatório detalhado
├── README_SECURITY.md                     # 📖 Este arquivo
├── supabase_rls_setup.sql                # 🔒 Script de RLS
└── src/
    ├── components/
    │   ├── ImagePlaceholderIcon.tsx      # ✅ Novo
    │   └── ImageWithFallback.tsx         # ✅ Novo
    └── lib/
        └── supabase-client.ts             # ✅ Corrigido
```

---

## 🔴 PRÓXIMAS CORREÇÕES (Por Prioridade)

### URGENTE (Hoje)
1. ⏳ Rotacionar chaves do Supabase
2. ⏳ Aplicar RLS no banco de dados
3. ⏳ Finalizar correção de XSS (substituir innerHTML restantes)

### ALTA PRIORIDADE (Esta Semana)
4. ⏳ Implementar rate limiting no login
5. ⏳ Adicionar validação de arquivos upload
6. ⏳ Otimizar N+1 queries

### MÉDIA PRIORIDADE (Este Mês)
7. ⏳ Migrar base64 para Supabase Storage
8. ⏳ Implementar CSRF protection
9. ⏳ Adicionar timeouts em requisições

### BAIXA PRIORIDADE (Backlog)
10. ⏳ Configurar Content Security Policy
11. ⏳ Remover console.log em produção
12. ⏳ Integrar Sentry para monitoramento

---

## 📚 DOCUMENTAÇÃO ADICIONAL

- **Relatório Completo**: Veja `SECURITY_FIXES_REPORT.md` para detalhes
- **Script SQL**: Veja `supabase_rls_setup.sql` para RLS
- **Guia de Contribuição**: Sempre verifique segurança antes de PR

---

## 🆘 PRECISA DE AJUDA?

### Para implementar correções:
```
"Implementar rate limiting no login"
"Corrigir N+1 queries em use-guest-lots"
"Adicionar validação de arquivos"
"Configurar headers de segurança"
```

### Para verificar status:
```
"Mostrar status das correções de segurança"
"Listar vulnerabilidades pendentes"
```

---

## ⚡ COMANDOS ÚTEIS

```bash
# Verificar se .env está configurado
npm run dev
# Se der erro, configure o .env

# Verificar dependências vulneráveis
npm audit
npm audit fix

# Verificar se .env está no gitignore
git check-ignore .env
# Deve retornar: .env
```

---

## 🎯 CHECKLIST DE SEGURANÇA

Antes de fazer deploy:

- [ ] Credenciais rotacionadas no Supabase
- [ ] RLS habilitado em todas as tabelas
- [ ] Arquivo `.env` configurado corretamente
- [ ] `.env` NÃO está no Git
- [ ] Todos os innerHTML substituídos
- [ ] Rate limiting implementado
- [ ] Validação de arquivos ativa
- [ ] Headers de segurança configurados
- [ ] Console.log removidos em produção
- [ ] Testes de segurança realizados

---

**Última Atualização**: 27 de Janeiro de 2026  
**Responsável**: Time de Desenvolvimento  
**Status**: 🟡 Em Andamento (4% concluído)

---

## 🚀 BOAS PRÁTICAS

### ✅ SEMPRE:
- Use variáveis de ambiente para credenciais
- Habilite RLS em novas tabelas
- Valide inputs do usuário
- Use HTTPS em produção
- Mantenha dependências atualizadas

### ❌ NUNCA:
- Commite arquivos `.env`
- Use `innerHTML` com dados de usuário
- Exponha credenciais no código
- Confie em validação só no frontend
- Ignore avisos de segurança
