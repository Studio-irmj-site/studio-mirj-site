# Studio I.R — V2 integrada ao Supabase

## O que foi preparado
- Painel ADM com login de demonstração.
- CRUD de serviços.
- Painel tenta carregar/salvar serviços no Supabase quando `supabase-config.js` estiver preenchido.
- Site público tenta carregar os serviços ativos do banco e, se o banco não estiver configurado, mantém o catálogo atual.

## Para ativar a sincronização
1. Crie um projeto no Supabase.
2. No SQL Editor, execute `supabase-schema.sql`.
3. Em Authentication > Users, crie o usuário ADM.
4. Copie a Project URL e a chave `anon/public`.
5. Preencha `supabase-config.js`.
6. Publique o conteúdo no GitHub Pages.

### Segurança
Nunca use `service_role`/chave secreta no navegador. A V2 deve usar apenas a chave pública `anon` e políticas RLS. Antes de publicar, o login do painel deve ser trocado do modo demonstração para `supabase.auth.signInWithPassword`.
