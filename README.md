# Corte Pro — Sistema Integrado

Sistema web (HTML + JavaScript puro, sem build) para acompanhar as OPs do **corte**, da **costura** e os **KPIs** da
fábrica. Os dados vêm das planilhas exportadas do sistema da empresa e ficam no navegador (`localStorage`), com
publicação na nuvem (Supabase) para todo mundo ver o mesmo.

Para usar: abra o `index.html` no navegador (ou publique a pasta como site estático — hoje é na Vercel).

## Organização das pastas

```
index.html              a página (todas as abas e modais)
vercel.json             cabeçalhos de segurança do site publicado
favicon.svg
css/style.css           todo o visual
js/lib/                 bibliotecas de terceiros guardadas no projeto (SheetJS para ler Excel)
js/nucleo/              base do sistema, usada por todas as telas
js/nuvem/               tudo que conversa com o Supabase
js/importacao/          leitura das planilhas principais (Sincronização, Grade, Pedidos, Destino)
js/corte/               telas e regras do corte (fila, enfesto, prioridades, pedidos...)
js/costura/             telas e regras da costura (sequência, plano, preparação, calendário...)
js/kpi/                 KPI por setor e eficiência da costura/acabamento
tests/                  testes automáticos (ver tests/README.md)
```

### js/nucleo
| arquivo | o que faz |
|---|---|
| `base.js` | atalhos `$`/`$$`, console de depuração, `escHtml`, datas BR, indicadores de "última atualização", `debounce` |
| `estado.js` | variáveis globais (`bancoDadosOPs`, seleções, undo/redo) e plugins do Chart.js |
| `interface.js` | desfazer/refazer, `showToast`, tooltip da OP, `fecharModais` |
| `menus-e-busca.js` | busca global, menu de contexto da OP, menus suspensos |
| `datas-e-excel.js` | datas do Excel, dias úteis, checagem da biblioteca de Excel |
| `chave-op.js` | identidade da OP = **ciclo + número** (`"211-4293"`) |
| `colunas-fixas.js` | colunas grudadas à esquerda nas tabelas largas |
| `init.js` | liga os botões/eventos e inicia o sistema — **tem que ser o último script** |

### js/nuvem
| arquivo | o que faz |
|---|---|
| `conexao.js` | cliente Supabase, sessão, papel do usuário (admin / usuario / sequencia), abas liberadas, login |
| `publicar-carregar.js` | publicar tudo (admin) e carregar da nuvem (visitante) |
| `permissoes.js` | `exigirAdmin`, `exigirAdminOuUsuario`, `exigirLogadoNaSequencia` |
| `backup-manual.js` | espaço usado, baixar e restaurar backup |
| `backup-automatico.js` | backup semanal guardado na própria nuvem |

### js/importacao
`sincronizacao.js` (OPs + balanço do que mudou), `grades.js` (grade P/M/G por OP), `pedidos-pendentes.js`,
`destino-producao.js` (prioridades/estrelas, mês e local, também na nuvem).

### js/corte
`fila-corte.js` (planilha POR_OP → fila por setor) e `fila-corte-tela.js` (tela/imagem da fila e ordem do Enfesto),
`enfesto.js`, `etapas-op.js` (avançar etapa, fracionar lote), `prioridade-clientes.js`, `prioridades-manual.js`,
`busca-pedido.js`, `sugestao-sequencia.js`, `agrupamento-referencia.js`, `meta-corte.js`, `painel-grade.js`,
`ritmo-gargalo.js`.

### js/costura
`sequenciamento-costura.js`, `cronograma-costura.js`, `busca-sequencia-costura.js`, `calendario-producao.js`
(feriados e dias extras), `plano-costura.js`, `preparacao.js`, `producao-grupo.js`, `elaboracao-costura.js`.

### js/analise-pedidos
Transposição da **PLANILHA_ANALISE_PEDIDOS.xlsx** (aba ANÁLISE PEDIDOS): itens de pedido com falta de
estoque × OPs que atendem, com alocação sem contar a mesma peça duas vezes.

**Dois modos de cálculo** (botões "BASE DO CÁLCULO" na aba):
- **ERP (planilha original):** usa a "Falta Estoque" que o ERP calculou (o ERP reserva o estoque pela Chegada → Prioridade →
  Inclusão) e distribui as OPs pela Necessidade Fat. Igual ao Excel, validado linha a linha.
- **Simulação:** com o **saldo físico** importado (relatório POR_REFERENCIA_PRODUTO, exportado com "in_matprima é F ou T"
  para trazer a revenda), ignora o Fecha Físico do ERP e redistribui o saldo (todas as empresas somadas, porque dá para
  transferir) entre todos os pedidos pendentes pela **Necessidade Fat.** (ou Prev. Fat.; empate pela ordem do ERP). O que
  continua faltando vai para as OPs na mesma ordem. A visão SIMULAÇÃO × ERP lista os pedidos que passam a fechar ou deixam de
  fechar. Produto que não vier no saldo usa o Fecha Físico do ERP como estimativa. Exporte os 3 relatórios no mesmo momento.

**Acesso:** o admin importa, configura e publica (tabela `analise_pedidos` no Supabase, bases compactadas ~0,5 MB).
Quem tem `ve_analise_pedidos = true` em `papeis_usuario` só vê (hoje Luis e Raquel). A regra está no banco (RLS):
ninguém mais lê, e só o admin grava. Para liberar outra pessoa:
`update papeis_usuario set ve_analise_pedidos = true where email = '...';`

| arquivo | o que faz |
|---|---|
| `motor.js` | todo o cálculo, sem tela (CALC, ALOCAÇÃO, PAINEL ATRASOS, FALTAS SEM OP, OPs A PROGRAMAR, CONSULTA). Funciona no navegador e no Node. Validado contra os resultados do Excel: todas as abas iguais, linha por linha |
| `dados.js` | importa as bases (a planilha inteira ou os dois relatórios), acha as colunas pelo nome e guarda no IndexedDB; configuração no localStorage |
| `tela.js` | as visões, busca, BAIXAR EXCEL, consulta de pedido e a tela de configuração (campos amarelos + etapas) |

### js/kpi
`kpi.js` (movimentação por setor), `kpi-detalhe.js` (detalhe do setor), `eficiencia-costura.js`,
`eficiencia-acabamento.js`.

## Regras importantes ao mexer no código

- **Não há módulos:** todos os arquivos compartilham o mesmo escopo global. A **ordem dos `<script>` no
  `index.html` importa** — um arquivo só pode usar, *ao carregar*, o que os de cima já criaram. Funções
  chamadas depois (ao clicar, ao importar) podem estar em qualquer arquivo.
- Texto que vem de planilha ou da nuvem e vai para `innerHTML` deve passar por `escHtml(...)`.
- Ações que mudam dado começam com `exigirAdmin(...)` (ou a variante do papel certo). Isso só esconde/bloqueia
  na tela — a proteção real dos dados é a regra de acesso (RLS) no Supabase (`supabase/seguranca-login-obrigatorio.sql`).

## Acesso e papéis

Ninguém vê nada sem login: o site abre na tela de login (`body.sem-login`). Depois de entrar, o papel vem da
tabela `papeis_usuario` (pelo e-mail):

| papel | vê |
|---|---|
| `admin` | tudo |
| `usuario` | Prioridades, KPI, Sequência da costura, Urgências, Produção por grupo, Preparação (importa planilhas) |
| `sequencia` | Sequência da costura, KPI, Plano da costura, Produção por grupo |
| `tv` — e qualquer conta **sem papel** | só o **modo TV** (Fila Geral em tela cheia, atualiza a cada 3 min) |

Para dar acesso a alguém: crie a conta em Supabase → Authentication → Users e cadastre o e-mail em `papeis_usuario`.
- **`vercel.json` define os cabeçalhos de segurança** (CSP e outros). Se acrescentar uma biblioteca ou serviço
  de outro endereço, inclua o endereço lá (`script-src`, `style-src`, `font-src` ou `connect-src`), senão o navegador
  bloqueia. Os bloqueios aparecem no console do navegador como "Content Security Policy".
- Rode os testes antes de publicar:

```bash
cd tests && npm install && CHROMIUM_PATH=/caminho/do/chrome node run.js
```
