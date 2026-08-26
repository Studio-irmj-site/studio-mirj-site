# Studio I.R — V3

A V3 troca o login de demonstração pelo Supabase Auth.

## Configuração
1. Em `supabase-config.js`, substitua apenas `COLE_AQUI_A_CHAVE_ANON_PUBLICA` pela chave **anon/public** do projeto.
2. Nunca coloque `service_role` nesse arquivo.
3. Publique os arquivos do painel e do site no GitHub Pages.
4. O usuário `iarytsaraquel1504@gmail.com` já foi vinculado à tabela `public.admins` no banco.

## Fluxo
Login Supabase → verifica tabela `admins` → painel → CRUD em `services`.

O site público pode ler apenas serviços ativos; a ADM pode inserir/editar/excluir.
