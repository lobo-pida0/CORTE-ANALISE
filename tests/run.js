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
  {   // Excel do mês do KPI: linhas de total em destaque
    await p.evaluate(() => { definirVisaoKPI('fabrica'); const s = document.getElementById('seletorMesKPI') || document.querySelector('select[id*="MesKPI"]'); if (s) { s.innerHTML = '<option value="2026-10">x</option>'; s.value = '2026-10'; } });
    const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 20000 }), p.evaluate(() => baixarMesKPIExcel('2026-10'))]);
    const arq = path.join(os.tmpdir(), 'corte-pro-kpi.xlsx'); await dl.saveAs(arq);
    const ExcelJSnode = require('exceljs'); const wb = new ExcelJSnode.Workbook(); await wb.xlsx.readFile(arq);
    const destaque = [];
    wb.eachSheet(ws => ws.eachRow(r => { if (['TOTAL DO SETOR', 'TOTAL DO MÊS'].includes(r.getCell(2).value)) destaque.push(r.getCell(1).fill && r.getCell(1).fill.fgColor && r.getCell(1).fill.fgColor.argb); }));
    igual('Excel do mês (KPI): linhas de total em destaque azul', destaque.length > 0 && destaque.every(c => c === 'FFBDD7EE'), true);
  }


  // ---------- 10. Backup na nuvem (compressão) ----------
  const bk = await p.evaluate(async () => { const txt = JSON.stringify({ a: Array.from({ length: 3000 }, (_, i) => ({ i, t: 'ÁÇÃO ' + i })) }); const c = await comprimirTextoBackup(txt); return [await descomprimirTextoBackup(c) === txt, c.length < txt.length]; });
  igual('compressão do backup volta idêntica e menor', bk, [true, true]);

  // ---------- 10b. Plano da costura ----------
  await p.evaluate(() => {
    localStorage.removeItem('planoCostura'); localStorage.removeItem('eficienciaCostura');
    const base = { local: 'PNP COST INF CALCA', ref: '', descRef: 'CALCA TESTE', cor: '', tempoPecaCostura: 1, diasLocal: 1, tipoProduto: '', prioridade: 99, minutosCostura: 10, minutosAcabamento: 0, dataFinalizacao: null };
    localStorage.setItem('porOPCosturaDetalhado', JSON.stringify([{ ...base, op: '101', ciclo: '211', qtd: 100, dataFinalizacao: '2026-10-20T12:00:00.000Z' }, { ...base, op: '102', ciclo: '211', qtd: 80 }, { ...base, op: '103', ciclo: '211', qtd: 60 }]));
    abrirAba(null, 'aba-plano-costura'); $('planoCosturaData').value = '2026-10-23'; renderizarPlanoCostura();   // sexta-feira
  });
  igual('acabamento, enfesto e etiquetação ficam fora do plano', await p.evaluate(() => opsDisponiveisPlanoCostura().map(g => g.chave).filter(c => ['ACABAMENTO', 'ENFESTO', 'ETIQUETACAO'].includes(c))), []);
  await p.evaluate(() => { abrirAba(null, 'aba-seq-costura'); renderizarSequenciamentoCostura(); document.querySelectorAll('.check-imprimir-seq').forEach(c => { c.checked = true; }); });
  igual('botão SALVAR NO PLANO existe', await p.evaluate(() => !!document.getElementById('btnPlanoSeqCostura')), true);
  await p.evaluate(async () => { await adicionarMarcadasAoPlanoCostura(); });
  igual('marcadas entram no plano de hoje', await p.evaluate(() => ['101', '102', '103'].every(o => opEstaNoPlanoCostura(o, '211'))), true);
  await p.evaluate(async () => { await tirarOPDoPlanoCostura('102', '211'); });
  igual('TIRAR remove a OP do plano', await p.evaluate(() => opEstaNoPlanoCostura('102', '211')), false);
  await p.evaluate(async () => { renderizarSequenciamentoCostura(); document.querySelectorAll('.check-imprimir-seq').forEach(c => { c.checked = true; }); await adicionarMarcadasAoPlanoCostura(); });
  igual('plano guarda a data de finalização do dia em que foi salvo', await p.evaluate(() => obterPlanosCostura()[hojeISOLocalPlanoCostura()].ops.every(o => 'fin' in o)), true);
  igual('data de finalização salva aparece no plano', await p.evaluate(() => { renderizarPlanoCostura(); return obterPlanosCostura()[hojeISOLocalPlanoCostura()].ops.find(o => o.op === '101').fin.startsWith('2026-10-20'); }), true);
  igual('se a data mudar na sequência, o plano avisa', await p.evaluate(() => { const l = JSON.parse(localStorage.getItem('porOPCosturaDetalhado')); l.find(x => x.op === '101').dataFinalizacao = '2026-10-25T12:00:00.000Z'; localStorage.setItem('porOPCosturaDetalhado', JSON.stringify(l)); const o = obterPlanosCostura()[hojeISOLocalPlanoCostura()].ops.find(x => x.op === '101'); return /agora/.test(htmlFinalizacaoPlanoCostura(o, mapaFinAtualPlanoCostura()));
  }), true);
  igual('plano guarda pessoas e eficiência do dia', await p.evaluate(() => { const c = obterPlanosCostura()[hojeISOLocalPlanoCostura()].cap; return !!c && c.pessoas === (parseFloat(document.getElementById('seqCostPessoas').value) || 0) && c.ef > 0; }), true);
  igual('balanço da costura mostra a referência da OP', await p.evaluate(() => { const r = compararSeqCostura([{ op: '9', ciclo: '1', local: 'X', descRef: 'CORTE CAMISA MASC LONGA NOME', ref: 'HSTC012', qtd: 5 }], []); return r.saidaTotal[0].codRef; }), 'HSTC012');
  {   // sincronização: local "AGRUP CORTE EXTERNO" não pode virar etapa CORTE
    const linhaSinc = (op, loc) => { const c = Array(41).fill(''); c[3] = 'CORTE CAMISA TESTE'; c[4] = '211'; c[5] = op; c[6] = '10'; c[21] = loc; c[25] = '1'; c[26] = '1005989'; c[27] = 'TECIDO X'; c[28] = 'segp031'; return c.join(';'); };
    const fs2 = path.join(os.tmpdir(), 'corte-pro-sinc.csv');
    fs.writeFileSync(fs2, Array(41).fill('X').map((v, i) => i === 0 ? 'CHAVE' : i === 26 ? 'CODIGO M.P' : i === 27 ? 'DESCRIÇÃO M.P' : i === 28 ? 'REFERENCIA' : v).join(';') + '\n' + linhaSinc('7001', 'PNP CORTE') + '\n' + linhaSinc('7002', 'PNP AGRUP CORTE EXTERNO') + '\n');
    await p.setInputFiles('#inputExcel', fs2);
    await p.evaluate(() => { processarExcel(); }); await p.waitForTimeout(800);
    igual('local externo (AGRUP CORTE EXTERNO) não vira etapa CORTE na sincronização', await p.evaluate(() => [bancoDadosOPs.some(o => o.id === '7001' && o.etapa === 7), bancoDadosOPs.some(o => o.id === '7002')]), [true, false]);
  }
  igual('sincronização lê referência e matéria-prima pelo título (colunas mudaram de lugar)', await p.evaluate(() => { const o = bancoDadosOPs.find(x => x.id === '7001'); return [o.referencia, o.codigoMP]; }), ['SEGP031', '1005989']);
  {   // sincronização no layout novo (sem T.E./Dublado; colunas deslocadas) — tudo lido pelo título
    const cab = ['CHAVE','Sequencia','DT.REVIS.','DESCRIÇÃO','Ciclo','Num. Op','Qtde Peças','Liberação pcp','Local','Local atual','Dt corte Programada','Dias local','CODIGO M.P','DESCRIÇÃO M.P','REFERENCIA','PRODUTO'];
    const lin = (op, loc) => ['x','1','','CORTE CALCA NOVA','211', op, '33','2026-01-01','GILBERTO CORTE/ INT', loc,'','4','1005990','TECIDO Y','HSTC031','CALCA'].join(';');
    const f3 = path.join(os.tmpdir(), 'corte-pro-sinc-novo.csv');
    fs.writeFileSync(f3, 'BANDA;;;;;;;;;;\n' + cab.join(';') + '\n' + lin('7101', 'PNP ENFESTO') + '\n');
    await p.setInputFiles('#inputExcel', f3);
    await p.evaluate(() => { processarExcel(); }); await p.waitForTimeout(800);
    igual('sincronização lê o layout novo pelo título (sem T.E./Dublado)', await p.evaluate(() => { const o = bancoDadosOPs.find(x => x.id === '7101'); return o ? [o.ciclo, o.qtd, o.etapa, o.localDestino, o.diasLocal, o.referencia, o.tempoCorte, o.temDublado] : null; }), ['211', 33, 6, 'GILBERTO CORTE/ INT', 4, 'HSTC031', 0, false]);
  }
  {   // aba META CORTE (paletó/blazer)
    const r = await p.evaluate(() => {
      const dias = diasDaSemanaMetaCorte(0), seg = dias[0];
      const mv = {}; mv[`211-8001|${seg}`] = { op: '8001', ciclo: '211', data: seg + 'T12:00:00Z', qtd: 300, ds: 'CORTE PALETO MASC TESTE', of: 'INT' };   // 300 do KPI = 100 reais (x3)
      mv[`211-8002|${seg}`] = { op: '8002', ciclo: '211', data: seg + 'T12:00:00Z', qtd: 50, ds: 'CORTE CALCA TESTE', of: 'INT' };   // calça não conta
      localStorage.setItem('movimentacoesPorSetorKPI', JSON.stringify({ CORTE: mv }));
      const ant = bancoDadosOPs; bancoDadosOPs = [
        { id: '9001', ciclo: '211', desc: 'CORTE BLAZER A', qtd: 20, etapa: 4, dataInclusao: '2026-09-01', diasLocal: 3 },
        { id: '9002', ciclo: '211', desc: 'CORTE BLAZER B', qtd: 30, etapa: 7, dataInclusao: '2026-10-01', diasLocal: 1 },
        { id: '9003', ciclo: '211', desc: 'CORTE BLAZER C', qtd: 25, etapa: 7, dataInclusao: '2026-09-15', diasLocal: 2 },
        { id: '9004', ciclo: '211', desc: 'CORTE CALCA X', qtd: 99, etapa: 7, dataInclusao: '2026-08-01', diasLocal: 9 }];
      const c = calcularCortadoMetaCorte(dias), ordem = sugerirOPsMetaCorte().map(o => o.id);
      abrirAba(null, 'aba-urgencias'); renderizarMetaCorte(); bancoDadosOPs = ant;
      return { total: c.total, ordem, txt: document.getElementById('metaCorteConteudo').innerText };
    });
    igual('meta corte: conta só paletó/blazer em peças reais', r.total, 100);
    igual('meta corte: sugestão = etapa mais perto, depois mais antiga', r.ordem, ['9003', '9002', '9001']);
    igual('meta corte: tela mostra progresso', /100\s+de\s+400/.test(r.txt.replace(/\n/g, ' ')) && /faltam 300/.test(r.txt), true);
  }
  igual('elaboração: só empresa 02 nos locais certos', await p.evaluate(() => {
    const cab = ['Emp', 'Local', 'Descrição Local', 'Referência', 'Descrição Referência', 'Cor', 'Ciclo', 'OP', 'Qt OP Local', 'Tipo Produto'];
    const l = (emp, loc, op, tipo, q) => [emp, '1', loc, 'R', 'DESC ' + tipo, 'AZ', '111', op, q || 10, tipo];
    const rows = [cab, l('2', 'SLV COST CEL PALETO', 'A', 'BLAZER', 100), l('1', 'SLV COST CEL PALETO', 'B', 'BLAZER'), l('2', 'SLV ACABAMENTO', 'D', 'PALETO'), l('2', 'SLV RECEB PENAPOLIS', 'E', 'PALETO', 120), l('2', 'SLV RECEB PENAPOLIS', 'F', 'CALCA', 50), l('2', 'SLV RECEB PENAPOLIS', 'G', 'CAMISA POLO', 70), l('2', 'SLV COST SUP CEL 1', 'H', 'JALECO', 30), ['Total']];
    const lista = extrairOPsElaboracaoDasLinhas(rows);
    const res = Object.fromEntries(GRUPOS_ELABORACAO_COSTURA.map(g => [g.chave, calcularResumoGrupoElab(g, lista).pecas]));
    localStorage.setItem('mediasElaboracaoCostura', JSON.stringify({ PALETOS: 110 }));
    const pal = calcularResumoGrupoElab(GRUPOS_ELABORACAO_COSTURA[2], lista);
    return [lista.map(o => o.op).join(''), res, Math.round(pal.dias * 10) / 10, !!pal.dataPrevista];
  }), ['AEFGH', { CAMISAS: 30, MALHA: 0, PALETOS: 220, CALCA: 50 }, 2, true]);
  igual('reposição do paletó: avisa quando a elaboração baixa e sugere o que mandar', await p.evaluate(() => {
    localStorage.setItem('porOPElaboracaoCostura', JSON.stringify([{ op: '1', ciclo: '1', local: 'SLV COST CEL PALETO', qtd: 220, tipoProduto: 'BLAZER', descRef: 'BLAZER X' }]));   // 220 / 110 = 2 dias
    localStorage.setItem('mediasElaboracaoCostura', JSON.stringify({ PALETOS: 110 })); localStorage.removeItem('configReposicaoPaleto');
    localStorage.setItem('porOPPaletoEmp1', JSON.stringify([
      { op: '10', ciclo: '1', local: 'PNP ETIQ PROF/AMARR SOC/SEP LOG/SEP GLA', qtd: 600, descRef: 'BLAZER A', dataInclusao: '2026-09-01' },
      { op: '11', ciclo: '1', local: 'PNP QUAL - INSPECAO EXT', qtd: 500, descRef: 'BLAZER B' }, { op: '12', ciclo: '1', local: 'EXT COSTURA FULANO', qtd: 400, descRef: 'BLAZER C' },
      { op: '13', ciclo: '1', local: 'PNP BORDADO INTERNO', qtd: 900, descRef: 'BLAZER D', dataInclusao: '2026-09-10' }]));
    renderizarElaboracaoCostura();
    const rp = calcularReposicaoPaleto(obterPorOPElab()), bn = document.getElementById('alertaReposicaoPaleto');
    return [rp.nivel, rp.faltam, rp.candidatos.filter(c => c.pegar).map(c => c.op), bn.style.display, /baixando|CRÍTICA/.test(bn.innerText)];
  }), ['vermelho', 1430, ['10', '13'], 'block', true]);
  igual('salvar de novo soma sem duplicar', await p.evaluate(() => obterPlanosCostura()[hojeISOLocalPlanoCostura()].ops.length), 3);
  await p.evaluate(() => { const h = hojeISOLocalPlanoCostura(), pl = obterPlanosCostura(); pl['2026-10-23'] = pl[h]; delete pl[h]; salvarPlanosCostura(pl); abrirAba(null, 'aba-plano-costura'); $('planoCosturaData').value = '2026-10-23'; renderizarPlanoCostura(); });
  igual('aba do plano lista só as OPs adicionadas', await p.evaluate(() => document.querySelectorAll('#planoCosturaLista strong').length >= 3 && /101/.test(document.getElementById('planoCosturaLista').innerText)), true);
  await p.waitForTimeout(300);
  igual('plano salvo com 3 OPs / 240 peças', await p.evaluate(() => { const pl = obterPlanosCostura()['2026-10-23']; return pl && [pl.ops.length, pl.ops.reduce((t, o) => t + o.qtd, 0)]; }), [3, 240]);
  igual('próximo dia útil de sexta é segunda', await p.evaluate(() => proximoDiaUtilPlanoCostura('2026-10-23')), '2026-10-26');
  igual('sem relatório do dia, fica aguardando', await p.evaluate(() => compararPlanoCostura('2026-10-23').estado), 'aguardando');
  const CABEF = 'Empresa;Grupo Local;Ds. Descricao;Tp Produto;Cd Local;Ds Local;Ref.;Ciclo;Op;Dt. Movimento;Qt. Movimento;Cod. Tempo;Cod. Tempolocal;Tipo Mov\n';
  const lef = (ciclo, op, qtd, dt) => `1;x;desc;CALCA;1;PNP COST INF CALCA;REF;${ciclo};${op};${dt};${qtd};1,5;1,5;NORMAL\n`;
  const fef = path.join(os.tmpdir(), 'corte-pro-ef.csv');
  fs.writeFileSync(fef, CABEF + lef(211, 101, 100, '26/10/2026') + lef(211, 102, 30, '26/10/2026') + lef(211, 999, 50, '26/10/2026') + lef(211, 103, 60, '27/10/2026'));   // 103 saiu no dia ERRADO (terça)
  await p.setInputFiles('#inputEfCostura', fef); await p.waitForTimeout(700);
  igual('costura guarda a produção por grupo de produto (pelo Tp Produto quando a descrição não diz)', await p.evaluate(() => { const g = obterEficienciaCostura()['2026-10-26'].grupos; return [g['CALÇA'].p, g['CALÇA'].o]; }), [180, 3]);
  igual('baixar mês da costura: aba PRODUÇÃO POR GRUPO com total do mês', await p.evaluate(() => { const d = montarDadosMesEfCostura('2026-10'); const lin = d.producaoGrupo.find(r => r[0] === 'CALÇA'); const tot = d.producaoGrupo.find(r => r[0] === 'TOTAL DO MÊS'); return [d.temGrupos, lin[1], tot[1] >= lin[1]]; }), [true, 240, true]);
  igual('dia antigo (só opsMov) tem o grupo deduzido pela descrição da OP', await p.evaluate(() => {
    const ef = obterEficienciaCostura(); ef['2026-09-01'] = { locais: {}, opsTotal: 2, opsMov: { '211-5001': { q: 40, l: [] }, '211-5002': { q: 10, l: [] } }, pessoasLocal: {} };
    localStorage.setItem('eficienciaCostura', JSON.stringify(ef));
    const ant = bancoDadosOPs; bancoDadosOPs = [{ id: '5001', ciclo: '211', desc: 'CORTE BERMUDA MASC TESTE', qtd: 40, etapa: 7 }];
    const g = obterEficienciaCosturaComGrupos()['2026-09-01'].grupos; bancoDadosOPs = ant;
    delete ef['2026-09-01']; localStorage.setItem('eficienciaCostura', JSON.stringify(ef));
    return [g['BERMUDA'].p, g['SEM PRODUTO'].p];
  }), [40, 10]);
  igual('aba produção por grupo: soma o período e mostra a tela', await p.evaluate(() => {
    const r = somarGruposProducao(obterEficienciaCostura(), ['2026-10-26', '2026-10-27']);
    visaoProducaoGrupo = 'semana'; ancoraProducaoGrupo = '2026-10-26'; abrirAba(null, 'aba-producao-grupo'); renderizarProducaoGrupo();
    return [r.grupos['CALÇA'].p, /CALÇA/.test(document.getElementById('producaoGrupoConteudo').innerText), /TOTAL/.test(document.getElementById('producaoGrupoConteudo').innerText)];
  }), [240, true, true]);
  const conf = await p.evaluate(() => { const r = compararPlanoCostura('2026-10-23'); return { estado: r.estado, st: r.itens.map(x => [x.op, x.status, x.saiu]).sort(), pct: r.pct, cump: r.pecasCumpridas, prog: r.pecasProgramadas, extras: r.extras.map(x => [x.chave, x.saiu]) }; });
  igual('conferência: completo, parcial e não saiu (saída em outro dia não vale)', [conf.estado, conf.st], ['conferido', [['101', 'completa', 100], ['102', 'parcial', 30], ['103', 'nao', 0]]]);
  igual('percentual cumprido (130 de 240)', [conf.cump, conf.prog, conf.pct], [130, 240, 54]);
  igual('saiu sem estar no plano', conf.extras, [['211-999', 50]]);
  igual('tela de conferência mostra o plano', await p.evaluate(() => /54% cumprido/.test(document.getElementById('planoCosturaConferencia').innerText)), true);

  // ---------- 11. Fumaça: todas as abas abrem sem erro ----------
  const abas = await p.evaluate(() => [...document.querySelectorAll('[id^=aba-]')].map(e => e.id));
  for (const a of abas) { try { await p.evaluate(id => abrirAba(null, id), a); } catch (e) { falhas.push('abrir aba ' + a + ': ' + e.message.slice(0, 100)); } }
  verdade('todas as abas abrem', abas.length >= 8, 'abas encontradas: ' + abas.length);
  igual('nenhum erro de JavaScript na página', errosPagina, []);

  await b.close();
  console.log(`\n${ok} verificações passaram, ${falhas.length} falharam.`);
  if (falhas.length) { console.log('\nFALHAS:\n- ' + falhas.join('\n- ')); process.exit(1); }
})().catch(e => { console.error('Erro ao rodar os testes:', e); process.exit(2); });
