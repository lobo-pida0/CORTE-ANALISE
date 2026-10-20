// Testes automáticos do Corte Pro: abrem o index.html num Chromium headless e exercitam as regras de negócio
// (importação do KPI, ciclo+OP, externo x fábrica, grupos de produto, tempo no setor, nuvem, backup).
// Rodar:  cd tests && npm install && CHROMIUM_PATH=/caminho/do/chrome node run.js
const { chromium } = require('playwright-core');
const fs = require('fs'), os = require('os'), path = require('path');

const RAIZ = path.resolve(__dirname, '..');
const CHROME = process.env.CHROMIUM_PATH || process.env.CH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const CAB = 'Emp;Ciclo;Nr. Op;Cod. Localorigem;Ds. Localorigem;Cod. Localdestino;Ds. Localdestino;Dt. Movimento;Qt. Movimento;Ds. Ult Nivel;Ds. Produto;Tipo;Cod. Nome Do Operador;Cod. Loc Prod Cost\n';
// linha de relatório: (ciclo, op, origem, destino, data, qtd, produto, colunaN)
const L = (c, op, o, d, dt, q, prod = '', n = 'INT') => `1;${c};${op};1;${o};2;${d};${dt};${q};x;${prod};;;${n}\n`;
const ALMOX = 'PNP ALMOX. TECIDOS', PCP = 'PNP PPCP-PROGRAMACAO CORTE', AM = 'PNP ALMOX. ANALISE DE MEDIDAS', CAD = 'PNP CAD', ENF = 'PNP ENFESTO', CORTE = 'PNP CORTE';

let ok = 0, falhas = [];
function igual(nome, obtido, esperado) {
  const a = JSON.stringify(obtido), b = JSON.stringify(esperado);
  if (a === b) ok++; else falhas.push(`${nome}\n    esperado: ${b}\n    obtido:   ${a}`);
}
function verdade(nome, cond, detalhe) { if (cond) ok++; else falhas.push(`${nome}${detalhe ? '\n    ' + detalhe : ''}`); }

(async () => {
  const b = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 1400, height: 1000 } });
  const errosPagina = [];
  p.on('pageerror', e => errosPagina.push(e.message.slice(0, 160)));
  p.on('dialog', d => d.accept());
  await p.addInitScript(fs.readFileSync(path.join(__dirname, 'node_modules', 'chart.js', 'dist', 'chart.umd.js'), 'utf8') + ';window.ChartDataLabels={};window.Hammer=function(){};window.html2canvas=()=>{};');
  await p.addInitScript(fs.readFileSync(path.join(__dirname, 'node_modules', 'exceljs', 'dist', 'exceljs.min.js'), 'utf8'));
  await p.goto('file://' + path.join(RAIZ, 'index.html'));
  await p.waitForTimeout(1500);
  await p.evaluate(() => { papelUsuarioAtual = 'admin'; sessaoAdminAtual = {}; aplicarRestricaoDeAbaVisitante(); abrirAba(null, 'aba-kpi'); });

  const reset = () => p.evaluate(() => { ['movimentacoesPorSetorKPI', 'kpiVisaoExterno', 'oficinasKPIClassificacao', 'bancoOPs'].forEach(k => localStorage.removeItem(k)); bancoDadosOPs = []; });
  const importar = async (seletor, csv) => { const f = path.join(os.tmpdir(), 'corte-pro-teste.csv'); fs.writeFileSync(f, CAB + csv); await p.setInputFiles(seletor, f); await p.waitForTimeout(500); };
  const normal = csv => importar('#inputMovimentacaoKPI', csv);
  const externo = csv => importar('#inputExternoAlmoxKPI', csv);
  const bruto = () => p.evaluate(() => obterMovimentacoesPorSetorBruto());
  const chaves = async setor => Object.keys((await bruto())[setor] || {}).sort();
  const total = async (setor, modo) => p.evaluate(([s, m]) => Object.values(obterMovimentacoesPorSetor(m)[s] || {}).reduce((a, x) => a + x.qtd, 0), [setor, modo]);

  // ---------- 1. Ciclo + OP ----------
  await reset();
  await normal(L(211, 3855, ALMOX, ENF, '07/10/2026', 100, 'AVENTAL') + L(111, 3855, ALMOX, ENF, '07/10/2026', 40, 'CALCADO'));
  igual('mesma OP em 2 ciclos no mesmo dia/setor ficam as duas', await chaves('ALMOX TECIDO'), ['111-3855|2026-10-07', '211-3855|2026-10-07']);
  await normal(L(211, 3855, ALMOX, ENF, '07/10/2026', 100, 'AVENTAL') + L(111, 3855, ALMOX, ENF, '07/10/2026', 40, 'CALCADO'));
  igual('reimportar não duplica', (await chaves('ALMOX TECIDO')).length, 2);
  await p.evaluate(() => { const t = obterMovimentacoesPorSetorBruto(); t['ALMOX TECIDO'] = { '3855|2026-10-07': { op: '3855', ciclo: '211', data: '2026-10-07T03:00:00.000Z', qtd: 100 } }; salvarMovimentacoesPorSetor(t); });
  await normal(L(211, 3855, ALMOX, ENF, '07/10/2026', 100, 'AVENTAL'));
  igual('importação remove a chave antiga (sem ciclo) da mesma OP', await chaves('ALMOX TECIDO'), ['211-3855|2026-10-07']);
  igual('OPs distintas contam por ciclo', await p.evaluate(() => { const s = new Set(); Object.values(obterMovimentacoesPorSetorBruto()['ALMOX TECIDO']).forEach(m => s.add(idOPKPI(m))); return [...s]; }), ['211-3855']);

  // ---------- 2. Regras da importação normal ----------
  await reset();
  await normal(
    L(211, 1, ENF, CORTE, '07/10/2026', 10, 'PALETO MASC') +          // multiplicador x3 no Enfesto
    L(211, 2, ENF, CORTE, '07/10/2026', 10, 'JAQUETA UNX') +          // x2
    L(211, 3, ENF, CORTE, '07/10/2026', 10, 'CALCA UNX') +            // x1
    L(211, 4, CORTE, ENF, '07/10/2026', 50, 'CALCA') +                // voltou pra trás: ignora
    L(211, 5, CORTE, '', '07/10/2026', 50, 'CALCA') +                 // sem destino: ignora
    L(211, 6, 'LOCAL QUE NAO EXISTE', CORTE, '07/10/2026', 50, 'CALCA'));   // origem desconhecida: ignora
  igual('multiplicador de camadas no Enfesto (paletó 3x, jaqueta 2x, calça 1x)', await total('ENFESTO', 'juntos'), 30 + 20 + 10);
  igual('retrocesso, sem destino e origem desconhecida são ignorados', await chaves('CORTE'), []);
  await reset();
  await normal(L(211, 1, CORTE, 'PNP ETIQ PROF/AMARR SOC/SEP LOG/SEP GLA', '07/10/2026', 10, 'PALETO'));
  igual('multiplicador NÃO vale fora de Enfesto/Corte? (Corte também multiplica)', await total('CORTE', 'juntos'), 30);

  // ---------- 3. Classificação de oficinas ----------
  const ext = t => p.evaluate(x => oficinaEhExternaKPI(x), t);
  igual('INT é fábrica', await ext('INT'), false);
  igual('vazio é fábrica', await ext(''), false);
  igual('texto com CORTE é externo', await ext('GILBERTO CORTE E PRODUCAO'), true);
  igual('ANDERSON é externo', await ext('ANDERSON'), true);
  igual('MATHEUS-MG é externo', await ext('MATHEUS-MG'), true);
  igual('ARI como palavra é externo', await ext('ARI'), true);
  igual('MARIA NÃO é externo (ARI só como palavra inteira)', await ext('MARIA'), false);
  igual('REGINA não é externo', await ext('REGINA'), false);
  await p.evaluate(() => localStorage.setItem('oficinasKPIClassificacao', JSON.stringify({ 'REGINA': 'EXT', 'GILBERTO CORTE E PRODUCAO': 'INT' })));
  igual('override manual EXT vale', await ext('REGINA'), true);
  igual('override manual INT vence a palavra CORTE', await ext('GILBERTO CORTE E PRODUCAO'), false);

  // ---------- 4. Fábrica x externo nas visões ----------
  await reset();
  await normal(L(211, 1, CORTE, 'PNP ETIQ PROF/AMARR SOC/SEP LOG/SEP GLA', '07/10/2026', 100, 'CALCA', 'INT') + L(211, 2, CORTE, 'PNP ETIQ PROF/AMARR SOC/SEP LOG/SEP GLA', '07/10/2026', 40, 'CALCA', 'GILBERTO CORTE'));
  igual('visão fábrica não conta externo', await total('CORTE', 'fabrica'), 100);
  igual('visão externo só conta externo', await total('CORTE', 'externo'), 40);
  igual('visão juntos conta tudo', await total('CORTE', 'juntos'), 140);
  // destino externo no Almox (regra do importador normal)
  await reset();
  await normal(L(211, 1, ALMOX, 'AGRUP CORTE EXTERNO', '07/10/2026', 70, 'JAQUETA') + L(211, 2, ENF.replace('ENFESTO', 'CAD'), 'AGRUP CORTE EXTERNO', '07/10/2026', 30, 'CALCA'));
  igual('Almox com destino EXTERNO vira externo na importação normal', await total('ALMOX TECIDO', 'externo'), 70);

  // ---------- 5. Importar externo (ALMOX) ----------
  await reset();
  await externo(
    L(211, 10, ALMOX, 'AGRUP CORTE EXTERNO', '05/10/2026', 100, 'CORTE CALCA UNX') +
    L(211, 11, PCP, 'AGRUP CORTE EXTERNO', '05/10/2026', 200, 'CORTE CAMISA POLO') +
    L(211, 12, AM, 'AGRUP CORTE EXTERNO', '06/10/2026', 300, 'CORTE BONE') +
    L(211, 13, CAD, 'AGRUP CORTE EXTERNO', '06/10/2026', 50, 'CORTE BLUSA') +
    L(211, 14, ENF, 'AGRUP CORTE EXTERNO', '06/10/2026', 999, 'CORTE CALCA') +           // origem DEPOIS do Almox: ignora
    L(211, 15, ALMOX, 'ENFESTO', '06/10/2026', 999, 'CORTE CALCA'));                       // destino não é externo: ignora
  igual('externo do Almox: só Almox', (await chaves('ALMOX TECIDO')).filter(k => k.startsWith('211-10|')).length, 1);
  igual('externo vindo do PCP conta no PCP', await total('PCP PROGRAMACAO-CORTE', 'externo'), 200 + 300 + 50);
  igual('externo vindo da Análise de Medidas conta em Análise, CAD, PCP e Almox', [await total('ANALISE DE MEDIDAS', 'externo'), await total('CAD', 'externo'), await total('ALMOX TECIDO', 'externo')], [300, 300 + 50, 100 + 200 + 300 + 50]);
  igual('origem depois do Almox (Enfesto) é ignorada', await total('ENFESTO', 'juntos'), 0);
  igual('nada disso entra na visão fábrica', [await total('ALMOX TECIDO', 'fabrica'), await total('PCP PROGRAMACAO-CORTE', 'fabrica')], [0, 0]);
  await externo(L(211, 10, ALMOX, 'AGRUP CORTE EXTERNO', '05/10/2026', 100, 'CORTE CALCA UNX'));
  igual('reimportar externo não duplica', (await chaves('ALMOX TECIDO')).filter(k => k.startsWith('211-10|')).length, 1);

  // ---------- 6. Grupos de produto ----------
  const g = d => p.evaluate(x => grupoProdutoKPI(x), d);
  igual('CORTE CALCA ... = CALÇA', await g('CORTE CALCA UNX CARGO SARJA OPER. MELI007'), 'CALÇA');
  igual('SEMI - ACABADO CORTE CAMISA POLO = CAMISA POLO', await g('SEMI - ACABADO CORTE CAMISA POLO UNX MC MALHA SEGP232'), 'CAMISA POLO');
  igual('CAMISETA não vira CAMISA', await g('CORTE CAMISETA UNISSEX MC MALHA UNIV. SDXB004'), 'CAMISETA');
  igual('CAMISA FEM = CAMISA', await g('CAMISA FEM ML MICROFIBRA C/ LOGO PAIR503'), 'CAMISA');
  igual('JAQUETA', await g('CORTE JAQUETA UNX C/ FX. MICROFIBRA'), 'JAQUETA');
  igual('BERMUDA', await g('CORTE BERMUDA UNX CARGO SARJA'), 'BERMUDA');
  igual('BLUSA', await g('BLUSA FEM ML MICROFIBRA'), 'BLUSA');
  igual('CAPA DE COLETE = COLETE', await g('CORTE CAPA DE COLETE MASC C/ LOGO'), 'COLETE');
  igual('PALETÓ / BLAZER', await g('PALETO MASC'), 'PALETÓ / BLAZER');
  igual('vazio = SEM PRODUTO', await g(''), 'SEM PRODUTO');
  igual('desconhecido = OUTROS', await g('XPTO QUALQUER'), 'OUTROS');

  // ---------- 7. Tempo no setor ----------
  await reset();
  await normal(
    L(211, 1, PCP, ALMOX, '01/10/2026', 100, 'CALCA') + L(211, 1, ALMOX, ENF, '05/10/2026', 100, 'CALCA') +      // qui -> seg = 2 dias úteis
    L(211, 2, PCP, ALMOX, '02/10/2026', 50, 'CAMISA') + L(211, 2, ALMOX, ENF, '14/10/2026', 50, 'CAMISA') +      // sex -> qua = 8
    L(111, 2, ALMOX, ENF, '14/10/2026', 30, 'SEM ENTRADA'));                                                       // sem entrada registrada
  await externo(L(211, 3, PCP, 'AGRUP CORTE EXTERNO', '06/10/2026', 70, 'CORTE JAQUETA'));                         // externo não entra
  const t = await p.evaluate(() => { const r = calcularTempoNoSetorKPI('ALMOX TECIDO', '2026-10'); return { itens: r.itens.map(x => [x.op, x.ciclo, x.dias]).sort(), media: r.media, mediana: r.mediana, sem: r.semEntrada, ant: r.anterior }; });
  igual('tempo no setor em dias úteis (2 e 8)', t.itens, [['1', '211', 2], ['2', '211', 8]]);
  igual('média e mediana', [t.media, t.mediana], [5, 5]);
  igual('OP sem entrada é contada à parte; externo não entra', [t.sem, t.ant], [1, 'PCP PROGRAMACAO-CORTE']);
  igual('dias úteis: sex -> seg = 1', await p.evaluate(() => diasUteisEntreKPI('2026-10-02', '2026-10-05')), 1);
  igual('dias úteis: mesmo dia = 0', await p.evaluate(() => diasUteisEntreKPI('2026-10-05', '2026-10-05')), 0);

  // ---------- 8. Nuvem: ids com ciclo e volta ----------
  await reset();
  await normal(L(211, 7, ALMOX, ENF, '07/10/2026', 100, 'CALCA UNX', 'GILBERTO CORTE'));
  const nuvem = await p.evaluate(() => {
    const linhas = movimentacoesParaLinhasSupabase();
    const volta = linhasSupabaseParaMovimentacoes(linhas);
    const m = volta['ALMOX TECIDO']['211-7|2026-10-07'];
    return { id: linhas[0].id, produto: linhas[0].produto, oficina: linhas[0].oficina, restaurado: m && [m.ds, m.of, m.qtd, m.ciclo] };
  });
  igual('id na nuvem inclui o ciclo', nuvem.id, 'ALMOX TECIDO|211-7|2026-10-07');
  igual('produto e oficina vão para a nuvem', [nuvem.produto, nuvem.oficina], ['CALCA UNX', 'GILBERTO CORTE']);
  igual('e voltam da nuvem', nuvem.restaurado, ['CALCA UNX', 'GILBERTO CORTE', 100, '211']);

  // ---------- 9. Planilhas do mês (Excel) ----------
  await reset();
  await normal(L(211, 1, ALMOX, ENF, '07/10/2026', 100, 'CORTE CALCA UNX', 'INT') + L(211, 2, ALMOX, ENF, '07/10/2026', 40, 'CORTE CAMISA POLO', 'GILBERTO CORTE'));
  const plan = await p.evaluate(() => { definirVisaoKPI('juntos'); const d = montarPlanilhasMesKPI('2026-10'); return { produtos: d.produtos.filter(r => r[0] === 'ALMOX TECIDO').map(r => r.slice(0, 7)), cab: d.movimentacoes[0], tipo: d.movimentacoes.slice(1).map(r => r[5]).sort() }; });
  igual('aba PRODUTOS em fábrica+externo', plan.produtos, [['ALMOX TECIDO', 'CALÇA', 100, '71%', 1, 100, ''], ['ALMOX TECIDO', 'CAMISA POLO', 40, '29%', 1, 0, 40], ['ALMOX TECIDO', 'TOTAL DO SETOR', 140, '100%', 2, 100, 40]]);
  igual('MOVIMENTAÇÕES traz TIPO e grupo de produto', [plan.cab.includes('TIPO'), plan.cab.includes('GRUPO DE PRODUTO'), plan.tipo], [true, true, ['EXTERNO', 'FÁBRICA']]);

  // ---------- 10. Backup na nuvem (compressão) ----------
  const bk = await p.evaluate(async () => { const txt = JSON.stringify({ a: Array.from({ length: 3000 }, (_, i) => ({ i, t: 'ÁÇÃO ' + i })) }); const c = await comprimirTextoBackup(txt); return [await descomprimirTextoBackup(c) === txt, c.length < txt.length]; });
  igual('compressão do backup volta idêntica e menor', bk, [true, true]);

  // ---------- 11. Fumaça: todas as abas abrem sem erro ----------
  const abas = await p.evaluate(() => [...document.querySelectorAll('[id^=aba-]')].map(e => e.id));
  for (const a of abas) { try { await p.evaluate(id => abrirAba(null, id), a); } catch (e) { falhas.push('abrir aba ' + a + ': ' + e.message.slice(0, 100)); } }
  verdade('todas as abas abrem', abas.length >= 8, 'abas encontradas: ' + abas.length);
  igual('nenhum erro de JavaScript na página', errosPagina, []);

  await b.close();
  console.log(`\n${ok} verificações passaram, ${falhas.length} falharam.`);
  if (falhas.length) { console.log('\nFALHAS:\n- ' + falhas.join('\n- ')); process.exit(1); }
})().catch(e => { console.error('Erro ao rodar os testes:', e); process.exit(2); });
