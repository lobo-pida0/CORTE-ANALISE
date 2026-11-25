-- =========================================================================
-- 🔒 LOGIN OBRIGATÓRIO + PAPÉIS NO BANCO (Supabase)
-- Acompanha a tela de login do site. Sem isto, a tela de login só esconde a
-- tela: com a chave pública (que fica no código do site) qualquer pessoa ainda
-- conseguiria LER as tabelas direto, e qualquer conta logada conseguiria GRAVAR.
--
-- Depois de aplicar:
--   • sem login (anon): não lê nem grava NADA;
--   • logado (qualquer papel, inclusive 'tv' e conta sem papel): só LÊ;
--   • gravar: só 'admin', 'usuario' e 'sequencia' (igual ao que o site já faz hoje);
--   • backups: só 'admin' e 'usuario';
--   • papeis_usuario: cada um só enxerga a PRÓPRIA linha.
--
-- ⚠️ ANTES de aplicar: a conta do admin precisa ter a linha 'admin' em
-- papeis_usuario (hoje ela não tem — o site antigo tratava "sem papel" como
-- admin). O passo 1 abaixo faz isso; confira o e-mail antes.
-- Tudo roda numa transação: se algo falhar, nada muda.
-- ✅ APLICADO no Supabase em 24/11/2026 (migração "seguranca_login_obrigatorio"; admin cadastrado antes).
-- =========================================================================
begin;

-- 1) Admin cadastrado explicitamente (troque pelo e-mail do admin)
-- insert into public.papeis_usuario (email, papel) values ('EMAIL-DO-ADMIN', 'admin')
--   on conflict (email) do update set papel = excluded.papel;

-- 2) Novo papel 'tv' (só vê o modo TV)
alter table public.papeis_usuario drop constraint if exists papeis_usuario_papel_check;
alter table public.papeis_usuario add constraint papeis_usuario_papel_check
  check (papel in ('admin', 'usuario', 'sequencia', 'tv'));

-- 3) Papel de quem está logado (lido no banco, não no navegador)
create or replace function public.papel_atual() returns text
  language sql stable security definer set search_path = ''
as $$
  select p.papel from public.papeis_usuario p
  where lower(p.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  limit 1
$$;
revoke execute on function public.papel_atual() from public, anon;
grant execute on function public.papel_atual() to authenticated;

-- 4) Regras das tabelas de dados: troca todas as políticas antigas por duas
do $$
declare
  t text; pol record;
  tabelas text[] := array[
    'destino_producao', 'eficiencia_costura_dias', 'grade', 'local_producao_por_op',
    'localizacao_completa', 'metadados_sistema', 'movimentacoes_kpi', 'ops',
    'ops_manuais_prioridade', 'ops_removidas_seq_costura', 'ordem_manual_enfesto',
    'pedidos', 'pedidos_todos', 'plano_costura', 'por_op_costura_detalhado',
    'prioridade_clientes', 'urgencias_estado'];
begin
  foreach t in array tabelas loop
    for pol in select policyname from pg_policies where schemaname = 'public' and tablename = t loop
      execute format('drop policy %I on public.%I', pol.policyname, t);
    end loop;
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy "logado lê" on public.%I for select to authenticated using (true)', t);
    execute format($p$create policy "equipe grava" on public.%I for all to authenticated
                     using (public.papel_atual() in ('admin', 'usuario', 'sequencia'))
                     with check (public.papel_atual() in ('admin', 'usuario', 'sequencia'))$p$, t);
  end loop;
end $$;

-- 5) Backups: só admin e usuário
do $$ declare pol record; begin
  for pol in select policyname from pg_policies where schemaname = 'public' and tablename = 'backups_nuvem' loop
    execute format('drop policy %I on public.backups_nuvem', pol.policyname);
  end loop;
end $$;
create policy "admin e usuário veem e gravam backups" on public.backups_nuvem for all to authenticated
  using (public.papel_atual() in ('admin', 'usuario'))
  with check (public.papel_atual() in ('admin', 'usuario'));

-- 6) Papéis: cada um só vê a própria linha (antes qualquer logado via a lista de e-mails)
drop policy if exists "logado pode ver os papéis" on public.papeis_usuario;
create policy "cada um vê o próprio papel" on public.papeis_usuario for select to authenticated
  using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));

-- 7) Funções que o próprio Supabase apontou como abertas demais
revoke execute on function public.obter_tamanho_banco() from public, anon;
grant execute on function public.obter_tamanho_banco() to authenticated;
alter function public.obter_tamanho_banco() set search_path = '';
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
alter function public.urgencias_carimbo() set search_path = '';
alter function public.eficiencia_costura_carimbo() set search_path = '';

commit;
