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
  await p.evaluate(() => { papelUsuarioAtual = 'admin'; sessaoAdminAtual = {}; aplicarRestricaoDeAbaVisitante(); aplicarTelaDeLogin(); abrirAba(null, 'aba-kpi'); });

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

  igual('lupa da Sequência: acha a OP em qualquer grupo, mostra posição e leva até a linha', await p.evaluate(() => {
    const base = { local: 'PNP COST INF CALCA', ref: 'REF9', descRef: 'CALCA TESTE', cor: '', tempoPecaCostura: 1, diasLocal: 1, tipoProduto: '', prioridade: 99, minutosCostura: 10, minutosAcabamento: 0, dataFinalizacao: null };
    localStorage.setItem('porOPCosturaDetalhado', JSON.stringify([{ ...base, op: '9101', ciclo: '211', qtd: 50 }, { ...base, op: '9102', ciclo: '211', qtd: 70 }, { ...base, local: 'PNP COST SUP CAMISA', op: '9200', ciclo: '211', qtd: 20, descRef: 'CAMISA X' }]));
    abrirAba(null, 'aba-seq-costura'); $('seqCostGrupo').value = 'CAMISA'; renderizarSequenciamentoCostura();
    const inp = $('seqCostBusca'); inp.value = '9102'; renderizarBuscaSequenciaCostura();
    const r1 = $('seqCostBuscaResultado').innerText, ach = buscarOPNaSequenciaCostura('9102');
    irParaOPNaSequenciaCostura(ach[0].grupo, chaveOPCostura('9102', '211'));
    const r = [ach.length, ach[0].grupo, /Calça/i.test(r1), /fila/.test(r1), $('seqCostGrupo').value, !!document.querySelector('#seqCostListaOPs tr[data-seq-chave="9102|211"]')];
    inp.value = 'zzzz'; renderizarBuscaSequenciaCostura(); r.push(/Nenhuma OP/.test($('seqCostBuscaResultado').innerText), buscarOPNaSequenciaCostura('9').length);
    inp.value = ''; renderizarBuscaSequenciaCostura(); r.push($('seqCostBuscaResultado').style.display); return r;
  }), [1, 'CALCA', true, true, 'CALCA', true, true, 0, 'none']);
  igual('limpar mês da eficiência: apaga local e na nuvem, e o dia não volta ao reabrir a aba', await p.evaluate(async () => {
    const velho = supabaseClient, velhaSessao = sessaoAdminAtual, velhoPapel = papelUsuarioAtual, velhoConfirm = window.confirm;
    const nuvem = { '2026-09-10': { locais: { 'PNP COST SUP CEL 2': { pecas: 5, minutos: 50, ops: 1, semTempo: 0 } }, pessoasLocal: {} }, '2026-10-05': { locais: { 'PNP COST SUP CEL 2': { pecas: 9, minutos: 90, ops: 1, semTempo: 0 } }, pessoasLocal: {} } };
    supabaseClient = { from: () => ({
      upsert: rows => { (Array.isArray(rows) ? rows : [rows]).forEach(r => { nuvem[r.id] = r.dados; }); return Promise.resolve({ error: null }); },
      select: () => { const res = Promise.resolve({ data: Object.entries(nuvem).map(([id, dados]) => ({ id, dados })), error: null }); res.in = () => res; return res; } }) };
    sessaoAdminAtual = { user: { email: 'admin@x.com' } }; papelUsuarioAtual = 'admin'; window.confirm = () => true;
    localStorage.setItem('eficienciaCostura', JSON.stringify({ ...nuvem })); localStorage.removeItem('eficienciaCosturaPendentes');
    popularSeletorMesEfCostura(); $('seletorMesEfCostura').value = '2026-09';
    limparMesEfCostura(); await new Promise(r => setTimeout(r, 100));
    const aposLimpar = Object.keys(obterEficienciaCostura());
    await carregarEfCosturaDaNuvem();
    const r = [aposLimpar.join(), Object.keys(obterEficienciaCostura()).join(), nuvem['2026-09-10'].apagado === true, '2026-10-05' in nuvem && !nuvem['2026-10-05'].apagado];
    // gráficos de um mês sem dados não podem ficar na tela
    graficoEfCosturaInstance = new Chart($('graficoEfCostura'), { type: 'line', data: { labels: ['a'], datasets: [{ data: [1] }] } }); $('graficoEfCosturaJuntoWrap').style.display = '';
    $('seletorMesEfCostura').value = '2026-09'; renderizarEficienciaCostura();
    r.push(graficoEfCosturaInstance === null, $('graficoEfCosturaJuntoWrap').style.display);
    supabaseClient = velho; sessaoAdminAtual = velhaSessao; papelUsuarioAtual = velhoPapel; window.confirm = velhoConfirm; localStorage.removeItem('eficienciaCostura'); return r;
  }), ['2026-10-05', '2026-10-05', true, true, true, 'none']);
  igual('grupo Híbrida na Sequência: existe no seletor, pega o local da célula e só ele', await p.evaluate(() => {
    const base = { ref: 'RH', descRef: 'JALECO HIBRIDO', cor: '', tempoPecaCostura: 2, diasLocal: 1, tipoProduto: '', prioridade: 99, minutosCostura: 40, minutosAcabamento: 0, dataFinalizacao: null, ciclo: '211' };
    const bak = localStorage.getItem('porOPCosturaDetalhado'), grupoBak = $('seqCostGrupo').value;
    localStorage.setItem('porOPCosturaDetalhado', JSON.stringify([{ ...base, op: '9301', local: 'PNP COST CEL HIBRIDA', qtd: 20 }, { ...base, op: '9302', local: 'PNP COST INF CALCA', qtd: 30 }]));
    abrirAba(null, 'aba-seq-costura'); const sel = $('seqCostGrupo'); sel.value = 'HIBRIDA'; renderizarSequenciamentoCostura();
    const fila = montarFilaSequenciamentoCostura('HIBRIDA'), cal = montarFilaSequenciamentoCostura('CALCA');
    const r = [[...sel.options].some(o => o.value === 'HIBRIDA'), fila.map(o => o.op).join(), cal.map(o => o.op).join(), !!document.querySelector('#seqCostListaOPs tr[data-seq-chave="9301|211"]'), buscarOPNaSequenciaCostura('9301')[0].rotulo];
    localStorage.setItem('porOPCosturaDetalhado', bak); sel.value = grupoBak; renderizarSequenciamentoCostura(); return r;
  }), [true, '9301', '9302', true, 'Híbrida']);
  igual('eficiência no cantinho da Sequência: quem só abre a Sequência (Luis) recebe da nuvem', await p.evaluate(async () => {
    const velho = supabaseClient, velhaS = sessaoAdminAtual, velhoP = papelUsuarioAtual, bak = localStorage.getItem('eficienciaCostura');
    const hoje = new Date(); const dia = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-05`;
    supabaseClient = { from: () => ({ select: () => Promise.resolve({ data: [{ id: dia, dados: { locais: { 'PNP COST INF CALCA': { pecas: 10, minutos: 264, ops: 1, semTempo: 0 } }, pessoasLocal: { 'PNP COST INF CALCA': 1 } } }], error: null }) }) };
    sessaoAdminAtual = { user: { email: 'luis@x.com' } }; papelUsuarioAtual = 'sequencia'; localStorage.removeItem('eficienciaCostura');
    abrirAba(null, 'aba-seq-costura'); $('seqCostGrupo').value = 'CALCA';
    document.getElementById('abrirAba-aba-seq-costura').click(); await new Promise(r => setTimeout(r, 500));
    const txt = $('seqCostEfKpi').innerText;
    supabaseClient = velho; sessaoAdminAtual = velhaS; papelUsuarioAtual = velhoP; if (bak) localStorage.setItem('eficienciaCostura', bak); else localStorage.removeItem('eficienciaCostura');
    return /50/.test(txt);
  }), true);
  igual('dias extras trabalhados: sábado vira dia útil no cronograma e nos prazos', await p.evaluate(() => {
    const bak = localStorage.getItem('diasExtrasSeqProducao'), bakF = localStorage.getItem('feriadosSeqProducao');
    localStorage.removeItem('diasExtrasSeqProducao'); localStorage.setItem('feriadosSeqProducao', '[]');
    const sex = new Date(2026, 10, 13), iso = d => d.toISOString().slice(0, 10), r = [];
    r.push(iso(proximoDiaUtilCostura(sex)), iso(somarDiasUteisCostura(sex, 1)), iso(subtrairDiasUteisCostura(new Date(2026, 10, 16), 1)));   // sem extra: pula o fim de semana
    localStorage.setItem('diasExtrasSeqProducao', JSON.stringify(['2026-11-14']));
    r.push(iso(proximoDiaUtilCostura(sex)), iso(somarDiasUteisCostura(sex, 1)), iso(subtrairDiasUteisCostura(new Date(2026, 10, 16), 1)));   // com sábado extra: conta o sábado
    localStorage.setItem('feriadosSeqProducao', JSON.stringify(['2026-11-14'])); r.push(ehDiaDeTrabalhoCostura(new Date(2026, 10, 14)));   // extra vale até se também for feriado
    adicionarDiaExtra('2026-11-21'); r.push(obterDiasExtras().join()); removerDiaExtra('2026-11-21'); r.push(obterDiasExtras().join(), /sábado/.test((renderizarModalDiasExtras(), $('modalDiasExtras').innerText)));
    if (bak) localStorage.setItem('diasExtrasSeqProducao', bak); else localStorage.removeItem('diasExtrasSeqProducao'); if (bakF) localStorage.setItem('feriadosSeqProducao', bakF); else localStorage.removeItem('feriadosSeqProducao');
    return r;
  }), ['2026-11-16', '2026-11-16', '2026-11-13', '2026-11-14', '2026-11-14', '2026-11-14', true, '2026-11-14,2026-11-21', '2026-11-14', true]);
  igual('calendário na nuvem: dia extra e feriado cadastrados chegam a outro navegador; nuvem vazia sobe o que já existe', await p.evaluate(async () => {
    const velho = supabaseClient, velhaS = sessaoAdminAtual, velhoP = papelUsuarioAtual, bakE = localStorage.getItem('diasExtrasSeqProducao'), bakF = localStorage.getItem('feriadosSeqProducao');
    const nuvem = {};
    supabaseClient = { from: () => ({ select: () => ({ eq: (_c, id) => ({ maybeSingle: () => Promise.resolve({ data: nuvem[id] ? { dados: nuvem[id] } : null, error: null }) }) }),
      upsert: row => { nuvem[row.id] = row.dados; return Promise.resolve({ error: null }); } }) };
    sessaoAdminAtual = { user: { email: 'admin@x.com' } }; papelUsuarioAtual = 'admin';
    localStorage.setItem('feriadosSeqProducao', JSON.stringify(['2026-12-25'])); localStorage.removeItem('diasExtrasSeqProducao');
    await carregarCalendarioProducaoDaNuvem();                       // nuvem vazia → sobe o feriado que já existia
    const r = [JSON.stringify(nuvem.calendario_producao)];
    adicionarDiaExtra('2026-11-14'); await new Promise(x => setTimeout(x, 80)); r.push(nuvem.calendario_producao.extras.join());
    localStorage.clear(); papelUsuarioAtual = 'sequencia';          // outro navegador (Luis) sem nada local
    await carregarCalendarioProducaoDaNuvem(); r.push(obterDiasExtras().join(), obterFeriados().join());
    papelUsuarioAtual = 'admin'; removerDiaExtra('2026-11-14'); await new Promise(x => setTimeout(x, 80)); r.push(nuvem.calendario_producao.extras.length, obterDiasExtras().length);
    supabaseClient = velho; sessaoAdminAtual = velhaS; papelUsuarioAtual = velhoP;
    if (bakE) localStorage.setItem('diasExtrasSeqProducao', bakE); else localStorage.removeItem('diasExtrasSeqProducao'); if (bakF) localStorage.setItem('feriadosSeqProducao', bakF); else localStorage.removeItem('feriadosSeqProducao');
    return r;
  }), ['{"feriados":["2026-12-25"],"extras":[]}', '2026-11-14', '2026-11-14', '2026-12-25', 0, 0]);
  igual('papel sequencia: vê o botão DIAS EXTRAS e consegue cadastrar/remover (feriados continuam fechados)', await p.evaluate(() => {
    const velhaS = sessaoAdminAtual, velhoP = papelUsuarioAtual, bak = localStorage.getItem('diasExtrasSeqProducao');
    sessaoAdminAtual = { user: { email: 'luis@x.com' } }; papelUsuarioAtual = 'sequencia'; document.body.classList.add('modo-sequencia', 'modo-visitante'); abrirAba(null, 'aba-seq-costura');
    const vis = id => { const b = document.getElementById(id); return !!b && getComputedStyle(b).display !== 'none'; };
    const r = [vis('btnGerenciarDiasExtras'), vis('btnGerenciarFeriados')];
    renderizarModalDiasExtras(); $('modalDiasExtras').style.display = 'flex'; r.push(vis('inputNovoDiaExtra'));
    adicionarDiaExtra('2026-12-06'); r.push(obterDiasExtras().includes('2026-12-06')); renderizarModalDiasExtras(); removerDiaExtra('2026-12-06'); r.push(!obterDiasExtras().includes('2026-12-06'));
    $('modalDiasExtras').style.display = 'none'; sessaoAdminAtual = velhaS; papelUsuarioAtual = velhoP; document.body.classList.remove('modo-sequencia', 'modo-visitante'); aplicarRestricaoDeAbaVisitante();
    if (bak) localStorage.setItem('diasExtrasSeqProducao', bak); else localStorage.removeItem('diasExtrasSeqProducao'); return r;
  }), [true, false, true, true, true]);
  igual('papel sequencia: acessa Sequência, KPI (só eficiência da costura), Plano da costura e Produção por grupo; o resto continua fechado', await p.evaluate(() => {
    const velhaS = sessaoAdminAtual, velhoP = papelUsuarioAtual, velhoSel = document.querySelector('.aba-conteudo.ativa').id;
    sessaoAdminAtual = { user: { email: 'luis@x.com' } }; papelUsuarioAtual = 'sequencia'; document.body.classList.add('modo-sequencia', 'modo-visitante');
    const liberada = ['aba-seq-costura', 'aba-kpi', 'aba-plano-costura', 'aba-prioridades', 'aba-preparacao', 'aba-programacao', 'aba-producao-grupo'].map(abaLiberadaAgora);
    abrirAba(null, 'aba-kpi'); const vis = sel => { const b = document.querySelector(sel); return !!b && getComputedStyle(b).display !== 'none'; };
    const r = [liberada.join(), vis('#aba-kpi > .secao:not(#secaoEficienciaCostura)'), vis('#secaoEficienciaCostura'), vis('#btnBaixarMesEfCostura'), vis('#btnLimparMesEfCostura'), vis('#btnPlanoSeqCostura')];
    r.push(exigirLogadoNaSequencia('x'));
    document.body.classList.remove('modo-sequencia', 'modo-visitante'); sessaoAdminAtual = velhaS; papelUsuarioAtual = velhoP; abrirAba(null, velhoSel); return r;
  }), ['true,true,true,false,false,false,true', false, true, true, false, true, true]);
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
  {   // aba PREPARAÇÃO: janelas por local, ordem por finalização, plano do dia
    const cab = 'Emp;Descrição Local;Ciclo;OP;Descrição Referência;Qt OP Local;Data Finalização;Dias Local;Local Obs.\n';
    const lin = (loc, op, qtd, fin, dias) => `1;${loc};211;${op};CORTE CALCA X;${qtd};${fin};${dias};GILBERTO\n`;
    const fp = path.join(os.tmpdir(), 'corte-pro-prep.csv');
    fs.writeFileSync(fp, cab + lin('PNP PREP PARTES SUP', '1', 10, '2026-11-05', 3) + lin('PNP PREP PARTES SUP', '2', 20, '2026-11-01', 1) + lin('PNP PREP GOLA E PUNHO', '3', 5, '2026-11-02', 2) + lin('PNP SILK INTERNO', '4', 7, '', 9) + lin('PNP DISTRIBUICAO INT', '5', 9, '2026-11-03', 1) + lin('PNP CORTE', '6', 99, '2026-11-03', 1) + lin('PNP COSTURA PROGAMADA', '9', 30, '2026-11-04', 2) + lin('PNP COSTURA PROGRAMADA', '10', 5, '2026-11-04', 2));
    await p.setInputFiles('#inputPorOPPreparacao', fp);
    await p.evaluate(() => { processarPorOPPreparacao(); }); await p.waitForTimeout(800);
    igual('grafias PROGAMADA e PROGRAMADA caem na mesma janela', await p.evaluate(() => obterOPsPreparacao().filter(o => o.local === 'PNP COSTURA PROGAMADA').map(o => o.op).sort()), ['10', '9']);
    igual('preparação guarda só as OPs dos locais da preparação', await p.evaluate(() => obterOPsPreparacao().map(o => o.op).sort()), ['1', '10', '2', '3', '4', '5', '9']);
    {   // balanço da preparação: reimporta com mudanças (1 saiu, 4 mudou de janela, 6 nova)
      fs.writeFileSync(fp, cab + lin('PNP PREP PARTES SUP', '1', 10, '2026-11-05', 3) + lin('PNP PREP PARTES SUP', '2', 12, '2026-11-01', 1) + lin('PNP PREP GOLA E PUNHO', '3', 5, '2026-11-02', 2) + lin('PNP BORDADO INTERNO', '4', 7, '', 9) + lin('PNP DISTRIBUICAO INT', '5', 9, '2026-11-03', 1) + lin('PNP PREP PARTES INF', '8', 40, '2026-11-09', 0));
      await p.setInputFiles('#inputPorOPPreparacao', fp); await p.waitForTimeout(800);   // o próprio evento 'change' importa
      const b = await p.evaluate(() => { const t = document.getElementById('modalBalancoSincronizacao').innerText; return { titulo: /BALANÇO DA PREPARAÇÃO/.test(t), parcial: /saiu 8 de 20/i.test(t), novas: /NOVAS NA PREPARAÇÃO/i.test(t), local: /Silk[^\n]*Bordado/i.test(t) }; });
      igual('reimportar a preparação mostra o balanço (parcial, nova, mudou de janela)', b, { titulo: true, parcial: true, novas: true, local: true });
      await p.evaluate(() => fecharModais());
    }
    await p.evaluate(() => { abrirAba(null, 'aba-preparacao'); renderizarPreparacao(); });
    igual('janela ordena pela finalização mais próxima', await p.evaluate(() => Array.from(document.querySelectorAll('.check-prep')).slice(0, 2).map(c => c.dataset.chave)), ['211-2', '211-1']);
    {   // setinhas ▲▼: ordem manual por janela
      igual('setas: aparecem em cada linha; a 1ª não sobe e a última não desce', await p.evaluate(() => { const t = [...document.querySelectorAll('#prepJanela-SUP-0 tbody tr')]; return [t[0].querySelectorAll('.prep-seta')[0].disabled, t[0].querySelectorAll('.prep-seta')[1].disabled, t[t.length - 1].querySelectorAll('.prep-seta')[1].disabled, document.querySelectorAll('.prep-seta').length > 2]; }), [true, false, true, true]);
      await p.evaluate(() => { localStorage.removeItem('ordemPreparacao'); window.__ini = Array.from(document.querySelectorAll('#prepJanela-SUP-0 tbody tr')).map(tr => tr.dataset.prepLinha); document.querySelector('#prepJanela-SUP-0 tbody tr .prep-seta:nth-child(2)').click(); });
      igual('setas: ▼ na 1ª troca com a 2ª e fica guardado', await p.evaluate(() => [Array.from(document.querySelectorAll('#prepJanela-SUP-0 tbody tr')).slice(0, 2).map(tr => tr.dataset.prepLinha).join() === [window.__ini[1], window.__ini[0]].join(), (obterOrdemPrep()['PNP PREP PARTES SUP'] || []).length === window.__ini.length]), [true, true]);
      igual('setas: aparece o botão ORDEM AUTOMÁTICA só na janela mexida', await p.evaluate(() => [/ORDEM AUTOMÁTICA/.test(document.getElementById('prepJanela-SUP-0').innerText), /ORDEM AUTOMÁTICA/.test(document.getElementById('prepJanela-SUP-1').innerText)]), [true, false]);
      igual('setas: ▲ desfaz', await p.evaluate(() => { document.querySelectorAll('#prepJanela-SUP-0 tbody tr')[1].querySelectorAll('.prep-seta')[0].click(); return Array.from(document.querySelectorAll('#prepJanela-SUP-0 tbody tr')).map(tr => tr.dataset.prepLinha).join() === window.__ini.join(); }), true);
      igual('setas: OP marcada urgente com ordem manual vai pro topo da janela', await p.evaluate(async () => {
        const ult = window.__ini[window.__ini.length - 1], ch = ult.split('|')[0], vel = localStorage.getItem('urgentesPreparacao');
        await alternarUrgentePreparacao(ch);
        const topo = document.querySelector('#prepJanela-SUP-0 tbody tr').dataset.prepLinha === ult;
        localStorage.setItem('urgentesPreparacao', vel || '[]'); return topo;
      }), true);
      igual('setas: com filtro "só partes" ou OP nova, a ordem manual continua valendo e OP fora da lista vai pro fim', await p.evaluate(() => {
        const todas = obterOrdemPrep(); todas['PNP PREP PARTES SUP'] = todas['PNP PREP PARTES SUP'].slice(0, 1); salvarOrdemPrepLocal(todas);   // só a 1ª está "guardada"
        renderizarPreparacao(); const lin = Array.from(document.querySelectorAll('#prepJanela-SUP-0 tbody tr')).map(tr => tr.dataset.prepLinha);
        return lin[0] === todas['PNP PREP PARTES SUP'][0] && lin.length === window.__ini.length;
      }), true);
      igual('setas: ORDEM AUTOMÁTICA devolve a ordem original', await p.evaluate(() => { const v = window.confirm; window.confirm = () => true; voltarOrdemAutomaticaPrep('PNP PREP PARTES SUP'); window.confirm = v; return [Array.from(document.querySelectorAll('#prepJanela-SUP-0 tbody tr')).map(tr => tr.dataset.prepLinha).join() === window.__ini.join(), !obterOrdemPrep()['PNP PREP PARTES SUP']]; }), [true, true]);
      igual('setas: ordem sobe e desce da nuvem (outro navegador recebe, só a janela mexida)', await p.evaluate(async () => {
        const velho = supabaseClient, velhaS = sessaoAdminAtual; const nuvem = {};
        supabaseClient = { from: () => ({ upsert: row => { nuvem[row.id] = row; return Promise.resolve({ error: null }); }, select: () => ({ eq: (_c, id) => ({ maybeSingle: () => Promise.resolve({ data: nuvem[id] ? { dados: nuvem[id].dados } : null, error: null }) }) }) }) };
        sessaoAdminAtual = { user: { email: 'raquel@x.com' } };
        localStorage.removeItem('ordemPreparacao'); document.querySelector('#prepJanela-SUP-0 tbody tr .prep-seta:nth-child(2)').click(); await new Promise(r => setTimeout(r, 150));
        const gravou = Object.keys((nuvem.ordem_preparacao || { dados: { ordem: {} } }).dados.ordem);
        const guardada = obterOrdemPrep(); localStorage.removeItem('ordemPreparacao'); await carregarOrdemPreparacaoDaNuvem();
        const r = [gravou.join(), JSON.stringify(obterOrdemPrep()) === JSON.stringify(guardada)];
        localStorage.removeItem('ordemPreparacao'); supabaseClient = velho; sessaoAdminAtual = velhaS; renderizarPreparacao(); return r;
      }), ['PNP PREP PARTES SUP', true]);
    }
    await p.evaluate(() => { document.querySelectorAll('.check-prep').forEach(c => { if (['211-2', '211-3'].includes(c.dataset.chave)) c.checked = true; }); salvarMarcadasNoPlanoPreparacao(); });
    igual('plano da preparação salva as marcadas', await p.evaluate(() => obterPlanosPreparacao()[hojePreparacao()].ops.map(o => o.op).sort()), ['2', '3']);
    await p.evaluate(() => abrirSubabaPreparacao('LOGO'));
    igual('sub-aba mostra só o grupo escolhido', await p.evaluate(() => [/Silk/.test(document.getElementById('preparacaoConteudo').innerText), document.querySelectorAll('.check-prep').length]), [true, 1]);
    igual('coluna mês destino mostra o mês da OP', await p.evaluate(() => { localStorage.setItem('opsMesDestino', JSON.stringify({ '211-4': '2026-11' })); renderizarPreparacao(); return /NOV\/2026/.test(document.getElementById('preparacaoConteudo').innerText); }), true);
    igual('tempos da preparação: lê a planilha (ciclo desce nas linhas, linha só de local é ignorada)', await p.evaluate(() => {
      const m = extrairTemposPreparacaoDasLinhas([['Tipo de Operacao', null, null, 'PREP PARTES SUPERIOR', 'PREP SEPARACAO'], ['Empresa', 'Ciclo', 'OP', 'Tempo Peca OP Local', 'Tempo Peca OP Local'], ['1', '211', '1', 6, 0.5], [null, null, null, 6, 0.5], [null, null, '7', 2.5, null]]);
      return [m['211-1']['PREP PARTES SUPERIOR'], m['211-7']['PREP PARTES SUPERIOR'], '211-7' in m && !('PREP SEPARACAO' in m['211-7']), Object.keys(m).length];
    }), [6, 2.5, true, 4]);
    igual('tempos da preparação: janela mostra min/peça e tempo total da OP', await p.evaluate(() => {
      temposPreparacaoCache = { '211-1': { 'PREP PARTES SUPERIOR': 2 } }; abrirSubabaPreparacao('SUP');
      const j = document.getElementById('prepJanela-SUP-0'), op = obterOPsPreparacao().find(o => o.ciclo === '211' && o.op === '1');
      return [/Min\/peça/.test(j.innerText), j.innerText.includes(fmtMinPrep(op.qtd * 2)), fmtMinPrep(150)];
    }), [true, true, '2h30']);
    igual('pessoas por grupo: calcula disponível/dia, fila e dias para zerar', await p.evaluate(() => {
      temposPreparacaoCache = { '211-1': { 'PREP PARTES SUPERIOR': 60 }, '211-2': { 'PREP PARTES SUPERIOR': 60 } }; abrirSubabaPreparacao('SUP');
      definirPessoasPreparacao('SUP', '2');
      const c = document.getElementById('preparacaoConteudo').innerText, qtd = obterOPsPreparacao().filter(o => o.local === 'PNP PREP PARTES SUP' && ['1', '2'].includes(o.op)).reduce((s, o) => s + o.qtd, 0);
      const ok = [/Disponível por dia:\s*17h36/.test(c), c.includes('Zera em'), c.includes(fmtMinPrep(qtd * 60))];
      definirPessoasPreparacao('SUP', '0'); return [...ok, !/Zera em/.test(document.getElementById('preparacaoConteudo').innerText), fmtDiasPrep(0.5)];
    }), [true, true, true, true, '0,5 dia']);
    igual('observação por OP: salva, aparece no campo e persiste ao redesenhar', await p.evaluate(async () => {
      abrirSubabaPreparacao('SUP'); const o1 = obterOPsPreparacao().find(o => o.ciclo === '211' && o.op === '1'), k1 = chaveLinhaPrep(o1); await salvarObsPreparacao(k1, '  falta botão  '); renderizarPreparacao();
      const inp = [...document.querySelectorAll('#prepJanela-SUP-0 tr')].find(tr => tr.querySelector('.check-prep') && tr.querySelector('.check-prep').dataset.chave === '211-1').querySelector('.prep-obs');
      const r = [inp.value, obterObsPreparacao()[k1]]; await salvarObsPreparacao(k1, ''); return [...r, k1 in obterObsPreparacao()];
    }), ['falta botão', 'falta botão', false]);
    igual('partes: reconhece as 2 abas, marca PARTE e guarda onde está a outra metade', await p.evaluate(() => {
      const ab = abasInteirasEPartesPreparacao(['sem partes', 'somente partes']), um = abasInteirasEPartesPreparacao(['Planilha1']);
      const cab = ['Descrição Local', 'Ciclo', 'OP', 'Qt OP Local'], todas = [];
      const inteiras = extrairOPsPreparacaoDasLinhas([cab, ['PNP SEPARAR PECAS / UNIR CORPO E PTS', '211', '9001', 10]], false, todas);
      const partes = extrairOPsPreparacaoDasLinhas([cab, ['PNP PREP GOLA E PUNHO', '211', '9001', 10], ['EXT BORDADO X', '211', '9001', 10]], true, todas);
      const lista = [...inteiras, ...partes]; anexarOutrasMetadesPreparacao(lista, todas);
      return [ab.partes.join(), ab.inteiras.join(), um.partes.length, um.inteiras.join(), inteiras[0].parte, partes[0].parte, lista[0].outros.length, lista[1].outros.map(x => x[1] + x[0]).join('|'), paraBalancoPrep(partes[0]).op];
    }), ['somente partes', 'sem partes', 0, 'Planilha1', false, true, 2, '0PNP SEPARAR PECAS / UNIR CORPO E PTS|1EXT BORDADO X', '9001 (parte)']);
    igual('partes: selo PARTE e filtro Só partes / Só inteiras', await p.evaluate(() => {
      const bak = obterOPsPreparacao(); const mk = (op, parte) => ({ op, ciclo: '300', local: 'PNP PREP GOLA E PUNHO', parte, ref: '', descRef: 'X', cor: '', qtd: 5, tipo: '', localProd: '', fin: null, dias: 1, outros: parte ? [['PNP SEPARAR PECAS / UNIR CORPO E PTS', 0, 5]] : undefined });
      localStorage.setItem('porOPPreparacao', JSON.stringify([mk('A1', false), mk('A2', true)])); abrirSubabaPreparacao('SUP');
      const n = () => document.querySelectorAll('#prepJanela-SUP-1 .check-prep').length, selos = () => document.querySelectorAll('#prepJanela-SUP-1 .selo-parte').length;
      const r = [n(), selos(), /inteira em SEPARAR PECAS/.test(document.getElementById('preparacaoConteudo').innerText)];
      definirFiltroTipoPreparacao('partes'); r.push(n()); definirFiltroTipoPreparacao('inteiras'); r.push(n()); definirFiltroTipoPreparacao('todas');
      localStorage.setItem('porOPPreparacao', JSON.stringify(bak)); renderizarPreparacao(); return r;
    }), [2, 1, true, 1, 1]);
    igual('marcar urgente não joga a rolagem da janela pro topo', await p.evaluate(async () => {
      const bak = localStorage.getItem('porOPPreparacao'), L = [];
      for (let i = 0; i < 60; i++) L.push({ op: 'R' + i, ciclo: '400', local: 'PNP PREP PARTES SUP', parte: false, ref: '', descRef: 'X', cor: '', qtd: 1, tipo: '', localProd: '', fin: '2026-12-' + String(1 + (i % 28)).padStart(2, '0'), dias: 1 });
      localStorage.setItem('porOPPreparacao', JSON.stringify(L)); abrirSubabaPreparacao('SUP');
      const r0 = document.querySelector('#prepJanela-SUP-0 .prep-rolagem'); r0.scrollTop = 300; const antes = r0.scrollTop;
      await alternarUrgentePreparacao('400-R30'); const depois = document.querySelector('#prepJanela-SUP-0 .prep-rolagem').scrollTop;
      await alternarUrgentePreparacao('400-R30'); localStorage.setItem('porOPPreparacao', bak); renderizarPreparacao(); return [antes > 0, depois === antes];
    }), [true, true]);
    igual('lupa da Preparação: acha OP inteira e parte, troca de sub-aba e destaca a linha', await p.evaluate(() => {
      const bak = localStorage.getItem('porOPPreparacao'), mk = (op, local, parte) => ({ op, ciclo: '500', local, parte, ref: 'RF1', descRef: 'JALECO TESTE', cor: 'BR', qtd: 7, tipo: '', localProd: '', fin: null, dias: 1 });
      localStorage.setItem('porOPPreparacao', JSON.stringify([mk('7777', 'PNP PREP PARTES INF', false), mk('7777', 'PNP PREP GOLA E PUNHO', true), mk('8888', 'PNP SILK INTERNO', false)]));
      abrirSubabaPreparacao('SUP'); $('prepBusca').value = '7777'; renderizarBuscaPreparacao();
      const box = $('prepBuscaResultado').innerText, ach = buscarOPNaPreparacao('7777');
      const gola = ach.find(a => a.o.parte); irParaOPNaPreparacao(gola.grupo.chave, gola.ij, chaveLinhaPrep(gola.o));
      const r = [ach.length, /PARTE/.test(box), subabaPreparacao, !!document.querySelector('#prepJanela-SUP-1 tr[data-prep-linha]')];
      $('prepBusca').value = 'zzzz'; renderizarBuscaPreparacao(); r.push(/Nenhuma OP/.test($('prepBuscaResultado').innerText));
      $('prepBusca').value = ''; renderizarBuscaPreparacao(); r.push($('prepBuscaResultado').style.display);
      localStorage.setItem('porOPPreparacao', bak); renderizarPreparacao(); return r;
    }), [2, true, 'SUP', true, true, 'none']);
    await p.evaluate(() => abrirSubabaPreparacao('SUP'));
    {   // impressão de uma janela só, só com as marcadas
      await p.evaluate(() => { abrirSubabaPreparacao('SUP'); window.print = () => { window.dispatchEvent(new Event('beforeprint')); }; });
      const r = await p.evaluate(() => { const j = document.getElementById('prepJanela-SUP-0'); j.querySelectorAll('.check-prep').forEach(c => { c.checked = c.dataset.chave === '211-1'; }); imprimirJanelaPreparacao('prepJanela-SUP-0'); const a = document.getElementById('areaImpressaoGenerica'); const tr = [...a.querySelectorAll('tbody tr')]; const out = { janela: /Partes superiores/.test(a.innerText), outra: /Gola e punho/.test(a.innerText), escondidas: tr.filter(x => x.classList.contains('imprimir-esconder')).length, total: tr.length }; window.dispatchEvent(new Event('afterprint')); return out; });
      igual('imprimir janela: só a janela escolhida, só as marcadas', r, { janela: true, outra: false, escondidas: 1, total: 2 });
    }
    {   // Destino compartilhado: quem importa publica, os outros baixam
      const r = await p.evaluate(async () => {
        let linha = null; const velho = supabaseClient, velhaSessao = sessaoAdminAtual, velhoPapel = papelUsuarioAtual;
        supabaseClient = { from: () => ({ upsert: row => { linha = row; return Promise.resolve({ error: null }); }, select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: linha, error: null }) }) }) }) };
        sessaoAdminAtual = { user: { email: 'admin@x.com' } }; papelUsuarioAtual = 'admin';
        localStorage.setItem('opsMesDestino', JSON.stringify({ '211-4': '2026-12' })); localStorage.setItem('prioridadesDestino', JSON.stringify(['211-4']));
        const pub = await publicarDestinoNuvem();
        localStorage.removeItem('opsMesDestino'); localStorage.removeItem('prioridadesDestino'); localStorage.removeItem('destinoNuvemEm');   // "outro computador"
        papelUsuarioAtual = 'usuario'; await carregarDestinoDaNuvem();
        const out = { pub, linha: linha && linha.id, mes: obterOpsMesDestino()['211-4'], prio: obterPrioridadesDestino().has('211-4') };
        supabaseClient = velho; sessaoAdminAtual = velhaSessao; papelUsuarioAtual = velhoPapel; return out;
      });
      igual('Destino publicado na nuvem aparece para outro usuário', r, { pub: true, linha: 'global', mes: '2026-12', prio: true });
    }
    {   // nova janela, local de produção e urgência
      igual('janela "Costura programada" aceita as duas grafias (PROGAMADA e PROGRAMADA)', await p.evaluate(() => { renderizarPreparacao(); const t = document.getElementById('preparacaoConteudo').innerText; return [/Costura programada/i.test(t), /GILBERTO/.test(t)]; }), [true, true]);
      await p.evaluate(() => alternarUrgentePreparacao('211-1')); await p.waitForTimeout(100);
      igual('marcar urgente: vai pro topo da janela e fica salvo', await p.evaluate(() => [Array.from(document.querySelectorAll('#prepJanela-SUP-0 .check-prep'))[0].dataset.chave, JSON.parse(localStorage.getItem('urgentesPreparacao'))]), ['211-1', ['211-1']]);
      await p.evaluate(() => alternarUrgentePreparacao('211-1')); await p.waitForTimeout(100);
      igual('tirar urgência volta à ordem normal', await p.evaluate(() => [Array.from(document.querySelectorAll('#prepJanela-SUP-0 .check-prep'))[0].dataset.chave, JSON.parse(localStorage.getItem('urgentesPreparacao')).length]), ['211-2', 0]);
    }
    igual('plano mostra grupo e janela', await p.evaluate(() => /Gola e punho/.test(document.getElementById('preparacaoConteudo').innerText)), true);
    await p.evaluate(() => tirarOPDoPlanoPreparacao('211-3'));
    igual('tirar do plano remove só a OP', await p.evaluate(() => obterPlanosPreparacao()[hojePreparacao()].ops.map(o => o.op)), ['2']);
  }
  {   // sincronização no layout novo (sem T.E./Dublado; colunas deslocadas) — tudo lido pelo título
    const cab = ['CHAVE','Sequencia','DT.REVIS.','DESCRIÇÃO','Ciclo','Num. Op','Qtde Peças','Liberação pcp','Local','Local atual','Dt corte Programada','Dias local','CODIGO M.P','DESCRIÇÃO M.P','REFERENCIA','PRODUTO','Tipo'];
    const lin = (op, loc, tp = 'PEDIDO') => ['x','1','','CORTE CALCA NOVA','211', op, '33','2026-01-01','GILBERTO CORTE/ INT', loc,'','4','1005990','TECIDO Y','HSTC031','CALCA', tp].join(';');
    const f3 = path.join(os.tmpdir(), 'corte-pro-sinc-novo.csv');
    fs.writeFileSync(f3, 'BANDA;;;;;;;;;;\n' + cab.join(';') + '\n' + lin('7101', 'PNP ENFESTO') + '\n' + lin('7102', 'PNP PPCP - PROGRAMACAO') + '\n' + lin('7103', 'PNP AGUARD MATERIA PRIMA', 'REPOSICAO') + '\n');
    await p.setInputFiles('#inputExcel', f3);
    await p.evaluate(() => { processarExcel(); }); await p.waitForTimeout(800);
    igual('sincronização lê o layout novo pelo título (sem T.E./Dublado)', await p.evaluate(() => { const o = bancoDadosOPs.find(x => x.id === '7101'); return o ? [o.ciclo, o.qtd, o.etapa, o.localDestino, o.diasLocal, o.referencia, o.tempoCorte, o.temDublado] : null; }), ['211', 33, 6, 'GILBERTO CORTE/ INT', 4, 'HSTC031', 0, false]);
    igual('agrupar OPs por referência mostra o tipo (inclui aguardando matéria-prima)', await p.evaluate(() => { cacheGruposPorReferencia = null; abrirAgrupamentoReferencia(); const txt = document.body.innerText; return [/REPOSICAO/.test(txt), /PEDIDO/.test(txt)]; }), [true, true]);
    igual('sincronização guarda o tipo (reposição/pedido) e a Programação mostra', await p.evaluate(() => { const o = bancoDadosOPs.find(x => x.id === '7101'); etapasSelecionadas = [6]; renderizarTudoImediato(); return [o.tipoOP, /PEDIDO/.test(document.getElementById('listaDespacho').innerText)]; }), ['PEDIDO', true]);
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
      { op: '10', ciclo: '1', local: 'PNP SEPARAR PECAS / UNIR CORPO E PTS', qtd: 600, descRef: 'BLAZER A', dataInclusao: '2026-09-01' },
      { op: '11', ciclo: '1', local: 'PNP QUAL - INSPECAO EXT', qtd: 500, descRef: 'BLAZER B' }, { op: '12', ciclo: '1', local: 'EXT COSTURA FULANO', qtd: 400, descRef: 'BLAZER C' },
      { op: '13', ciclo: '1', local: 'PNP AGUARD BIP DISTRIBUICAO', qtd: 900, descRef: 'BLAZER D', dataInclusao: '2026-09-10', localProd: 'MS' },
      { op: '14', ciclo: '1', local: 'PNP ETIQ PROF/AMARR SOC/SEP LOG/SEP GLA', qtd: 700, descRef: 'BLAZER E' }, { op: '16', ciclo: '1', local: 'PNP DISTRIBUICAO EXT', qtd: 100, descRef: 'BLAZER G', dataInclusao: '2026-10-01', diasLocal: 4 }, { op: '15', ciclo: '1', local: 'PNP BORDADO INTERNO', qtd: 300, descRef: 'BLAZER F' }]));
    renderizarElaboracaoCostura();
    const rp = calcularReposicaoPaleto(obterPorOPElab()), bn = document.getElementById('alertaReposicaoPaleto');
    return [rp.nivel, rp.faltam, rp.candidatos.filter(c => c.pegar).map(c => c.op), bn.style.display, /baixando|CRÍTICA/.test(bn.innerText)];
  }), ['vermelho', 1430, ['16', '13', '10'], 'block', true]);
  igual('reposição: OPs com MS no local de produção vêm primeiro e a coluna aparece', await p.evaluate(() => { const rp = calcularReposicaoPaleto(obterPorOPElab()); return [rp.candidatos[0].op, rp.candidatos[1].op, rp.candidatos[1].prod, /LOCAL DE PRODUÇÃO/.test(document.getElementById('reposicaoPaletoConteudo').innerHTML)]; }), ['16', '13', 'MS', true]);
  igual('reposição: coluna DIAS LOCAL aparece e traz os dias da OP', await p.evaluate(() => { const rp = calcularReposicaoPaleto(obterPorOPElab()); return [/DIAS LOCAL/.test(document.getElementById('reposicaoPaletoConteudo').innerHTML), rp.candidatos.filter(o => o.situacao === 'JÁ CORTADA').every(o => o.dias === null || typeof o.dias === 'number'), rp.candidatos.some(o => o.dias != null)]; }), [true, true, true]);
  igual('reposição do paletó: lê tudo que está nos locais de "já cortada" (qualquer produto) da empresa 01', await p.evaluate(() => {
    const rows = [['Emp', 'Descrição Local', 'OP', 'Ciclo', 'Descrição Referência', 'Qt OP Local', 'Tipo Produto', 'Local Obs.'],
      [1, 'PNP SEPARAR PECAS / UNIR CORPO E PTS', 20, 211, 'CALCA X', 10, 'CALCA', 'ms'], [1, 'PNP AGUARD BIP DISTRIBUICAO', 21, 211, 'BLAZER Y', 5, 'PALETO'],
      [1, 'PNP BORDADO INTERNO', 22, 211, 'BLAZER Z', 5, 'PALETO'], [1, 'PNP PREP PARTES INF', 24, 211, 'CALCA V', 5, 'CALCA'], [2, 'PNP SEPARAR PECAS / UNIR CORPO E PTS', 23, 211, 'CALCA W', 5, 'CALCA']];
    const l = extrairOPsPaletoEmp1DasLinhas(rows); return [l.map(o => o.op).sort(), l.find(o => o.op === '20').localProd];
  }), [['20', '21', '24'], 'MS']);
  {   // papel "sequencia": só a aba Sequência da costura, sem ações de admin/usuário
    const r = await p.evaluate(() => {
      const velhoP = papelUsuarioAtual, velhaS = sessaoAdminAtual;
      sessaoAdminAtual = { user: { email: 'luis@x.com' } }; papelUsuarioAtual = 'sequencia'; atualizarIndicadorLogin();
      const visiveis = [...document.querySelectorAll('[id^="abrirAba-"]')].filter(b => b.style.display !== 'none').map(b => b.id.replace('abrirAba-', ''));
      const ativa = document.querySelector('.aba-conteudo.ativa').id;
      const out = { visiveis, ativa, usuario: exigirAdminOuUsuario('x'), admin: exigirAdmin('x'), visitante: document.body.classList.contains('modo-visitante') };
      papelUsuarioAtual = velhoP; sessaoAdminAtual = velhaS; aplicarRestricaoDeAbaVisitante(); return out;
    });
    igual('papel "sequencia": Sequência, KPI e Plano da costura, sem ações de admin ou usuário', r, { visiveis: ['aba-kpi', 'aba-seq-costura', 'aba-plano-costura', 'aba-producao-grupo'], ativa: 'aba-seq-costura', usuario: false, admin: false, visitante: true });
    const fSeq = path.join(os.tmpdir(), 'corte-pro-seq-role.csv');
    fs.writeFileSync(fSeq, 'Descricao Local;OP;Ciclo;Qt OP Local\nPNP COST INF CALCA;9901;211;40\n');
    await p.evaluate(() => { localStorage.removeItem('porOPCosturaDetalhado'); sessaoAdminAtual = { user: { email: 'luis@x.com' } }; papelUsuarioAtual = 'sequencia'; atualizarIndicadorLogin(); });
    const visivelBtn = await p.evaluate(() => { const l = document.getElementById('inputPorOPCostura').closest('label'); return getComputedStyle(l).display !== 'none'; });
    await p.evaluate(() => { document.querySelector('#abrirAba-aba-seq-costura') && document.querySelector('#abrirAba-aba-seq-costura').click(); });
    await p.setInputFiles('#inputPorOPCostura', fSeq); await p.waitForTimeout(800);
    igual('papel "sequencia": vê o botão de importar a POR_OP e consegue importar', [visivelBtn, await p.evaluate(() => JSON.parse(localStorage.getItem('porOPCosturaDetalhado') || '[]').map(o => o.op))], [true, ['9901']]);
    igual('papel "sequencia": vê e usa ocultar/remover/reexibir/restaurar da Sequência', await p.evaluate(() => {
      const lista = JSON.parse(localStorage.getItem('porOPCosturaDetalhado') || '[]'); if (!lista.length) return 'sem OPs';
      const a = lista[0], visivel = sel => { const b = document.querySelector(sel); return !!b && getComputedStyle(b).display !== 'none'; };
      const velhoConfirm = window.confirm, velhoPrompt = window.prompt; window.confirm = () => true; window.prompt = () => 'teste';
      document.getElementById('seqCostGrupo').value = ['CALCA', 'CAMISA', 'MALHA', 'JAQUETA_GANDOLA_PARKA', 'ACABAMENTO', 'ENFESTO', 'ETIQUETACAO'].find(g => montarFilaSequenciamentoCostura(g).length); renderizarSequenciamentoCostura();
      const r = [visivel('#seqCostListaOPs button[onclick^="ocultarOPDaSequenciaCostura"]'), visivel('#seqCostListaOPs button[onclick^="removerOPDaSequenciaCostura"]')];
      ocultarOPDaSequenciaCostura(a.op, a.ciclo || ''); const chave = chaveOPCostura(a.op, a.ciclo || ''); r.push(!!obterOpsOcultasSeqCostura()[chave]);
      renderizarOpsOcultasSeqCostura(); r.push(visivel('#seqCostListaOcultas button'));
      reexibirOPOcultaSeqCostura(chave); r.push(!obterOpsOcultasSeqCostura()[chave]);
      removerOPDaSequenciaCostura(a.op, a.ciclo || ''); r.push(!!obterOpsRemovidasSeqCostura()[chave]);
      renderizarOpsRemovidasSeqCostura(); r.push(visivel('#seqCostListaRemovidas button'));
      window.confirm = velhoConfirm; window.prompt = velhoPrompt; return r;
    }), [true, true, true, true, true, true, true]);
    await p.evaluate(() => { papelUsuarioAtual = 'admin'; sessaoAdminAtual = {}; localStorage.removeItem('porOPCosturaImportadaLocal'); aplicarRestricaoDeAbaVisitante(); });
  }
  igual('máquinas de enfesto: coluna FINALIZAÇÃO mostra a data de finalização da OP', await p.evaluate(() => {
    bancoDadosOPs = [{ id: '8001', ciclo: '211', desc: 'CORTE CALCA X', qtd: 10, etapa: 6, tempoCorte: 0, localDestino: 'INT', dataFinalizacao: '2026-11-06T12:00:00.000Z', referencia: 'R1', diasLocal: 1 }];
    dadosProgramacaoVisiveis = bancoDadosOPs.slice(); const por = classificarOPsPorMaquinaEnfesto(dadosProgramacaoVisiveis); maquinaEnfestoSelecionada = ['1','2','SEM'].find(m => por[m].length); abrirSubabaProgramacao('maquinas');
    const th = [...document.querySelectorAll('#listaMaquinaEnfesto')][0].closest('table').querySelector('thead').innerText;
    return [/FINALIZA/i.test(th), !/CORTE\s*$/i.test(th.trim()), /06\/11\/2026/.test(document.getElementById('listaMaquinaEnfesto').innerText)];
  }), [true, true, true]);
  igual('salvar de novo soma sem duplicar', await p.evaluate(() => obterPlanosCostura()[hojeISOLocalPlanoCostura()].ops.length), 3);
  await p.evaluate(() => { const h = hojeISOLocalPlanoCostura(), pl = obterPlanosCostura(); if (h !== '2026-10-26') { pl['2026-10-26'] = pl[h]; delete pl[h]; } salvarPlanosCostura(pl); abrirAba(null, 'aba-plano-costura'); $('planoCosturaData').value = '2026-10-26'; renderizarPlanoCostura(); });
  igual('aba do plano lista só as OPs adicionadas', await p.evaluate(() => document.querySelectorAll('#planoCosturaLista strong').length >= 3 && /101/.test(document.getElementById('planoCosturaLista').innerText)), true);
  await p.waitForTimeout(300);
  igual('plano salvo com 3 OPs / 240 peças', await p.evaluate(() => { const pl = obterPlanosCostura()['2026-10-26']; return pl && [pl.ops.length, pl.ops.reduce((t, o) => t + o.qtd, 0)]; }), [3, 240]);
  igual('plano é conferido com a saída do próprio dia', await p.evaluate(() => compararPlanoCostura('2026-10-26').dataConf), '2026-10-26');
  igual('sem relatório do dia, fica aguardando', await p.evaluate(() => compararPlanoCostura('2026-10-26').estado), 'aguardando');
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
  const conf = await p.evaluate(() => { const r = compararPlanoCostura('2026-10-26'); return { estado: r.estado, st: r.itens.map(x => [x.op, x.status, x.saiu]).sort(), pct: r.pct, cump: r.pecasCumpridas, prog: r.pecasProgramadas, extras: r.extras.map(x => [x.chave, x.saiu]) }; });
  igual('conferência: completo, parcial e não saiu (saída em outro dia não vale)', [conf.estado, conf.st], ['conferido', [['101', 'completa', 100], ['102', 'parcial', 30], ['103', 'nao', 0]]]);
  igual('percentual cumprido (130 de 240)', [conf.cump, conf.prog, conf.pct], [130, 240, 54]);
  igual('saiu sem estar no plano', conf.extras, [['211-999', 50]]);
  igual('tela de conferência mostra o plano', await p.evaluate(() => /54% cumprido/.test(document.getElementById('planoCosturaConferencia').innerText)), true);

  // ---------- 10b. Eficiência do ACABAMENTO (KPI): 1 local só, PNP ACABAMENTO ----------
  {
    const CABAC = 'Empresa;Grupo Local;Ds. Descricao;Tp Produto;Cd Local;Ds Local;Ref.;Ciclo;Op;Dt. Movimento;Qt. Movimento;Cod. Tempo;Cod. Tempolocal;Tipo Mov\n';
    const lac = (local, ciclo, op, qtd, dt, tempo, tipo) => `1;x;desc;CAMISA;1;${local};REF;${ciclo};${op};${dt};${qtd};${tempo};${tempo};${tipo || 'NORMAL'}\n`;
    const fac = path.join(os.tmpdir(), 'corte-pro-acab.csv');
    fs.writeFileSync(fac, CABAC + lac('PNP ACABAMENTO', 211, 701, 100, '26/10/2026', '4,5') + lac('PNP ACABAMENTO', 211, 702, 10, '26/10/2026', '') + lac('PNP ACABAMENTO', 211, 703, 50, '27/10/2026', '2')
      + lac('PNP ACABAMENTO TERCEIROS', 211, 704, 999, '26/10/2026', '9') + lac('SLV ACABAMENTO', 211, 705, 999, '26/10/2026', '9') + lac('PNP ACABAMENTO', 211, 706, 999, '26/10/2026', '9', 'PARTE') + lac('PNP COST SUP CAMISA', 211, 707, 999, '26/10/2026', '9'));
    await p.evaluate(() => { papelUsuarioAtual = 'admin'; sessaoAdminAtual = sessaoAdminAtual || { user: { email: 'admin@x.com' } }; localStorage.removeItem('eficienciaAcabamento'); });
    await p.setInputFiles('#inputEfAcab', fac); await p.waitForTimeout(700);
    igual('acabamento: só o local PNP ACABAMENTO (sem terceiros, Selvíria, parte nem costura)', await p.evaluate(() => { const e = obterEfAcab(); return [Object.keys(e).sort().join(), e['2026-10-26'].pecas, e['2026-10-26'].minutos, e['2026-10-26'].ops, e['2026-10-26'].semTempo, e['2026-10-27'].pecas, e['2026-10-27'].minutos]; }), ['2026-10-26,2026-10-27', 110, 450, 2, 10, 50, 100]);
    igual('acabamento: eficiência = minutos ÷ (pessoas × 528) e aparece na tela com gráfico', await p.evaluate(() => {
      popularSeletorMesEfAcab('2026-10'); $('seletorMesEfAcab').value = '2026-10'; definirPessoasEfAcab('2026-10-26', '1');
      const m = calcularMesEfAcab('2026-10', 528);
      return [Math.round(m.linhas[0].efic * 10) / 10, m.linhas[1].efic, Math.round(m.tot.efic * 10) / 10, /85,2%/.test($('efAcabCorpo').innerText), graficoEfAcabInstance !== null];
    }), [85.2, null, 85.2, true, true]);
    await p.setInputFiles('#inputEfAcab', fac); await p.waitForTimeout(700);
    igual('acabamento: reimportar o dia mantém as pessoas digitadas', await p.evaluate(() => obterEfAcab()['2026-10-26'].pessoas), 1);
    igual('acabamento: importar a COSTURA leva o acabamento junto', await p.evaluate(async () => {
      localStorage.removeItem('eficienciaAcabamento'); return 1;
    }), 1);
    await p.setInputFiles('#inputEfCostura', fac); await p.waitForTimeout(700);
    igual('acabamento: o mesmo CSV importado pelo botão da costura alimenta o acabamento', await p.evaluate(() => [obterEfAcab()['2026-10-26'] && obterEfAcab()['2026-10-26'].pecas, Object.keys(obterEfAcab()).length]), [110, 2]);
    igual('acabamento na nuvem: sobe só o dia, outro navegador recebe, LIMPAR MÊS vira marca e some de quem abre depois', await p.evaluate(async () => {
      const velho = supabaseClient, velhaSessao = sessaoAdminAtual, velhoPapel = papelUsuarioAtual, velhoConfirm = window.confirm, bak = localStorage.getItem('eficienciaAcabamento');
      const nuvem = {};
      supabaseClient = { from: () => ({
        upsert: row => { nuvem[row.id] = row; return Promise.resolve({ error: null }); },
        select: () => ({ eq: (_c, id) => ({ maybeSingle: () => Promise.resolve({ data: nuvem[id] ? { dados: nuvem[id].dados } : null, error: null }) }) }) }) };
      sessaoAdminAtual = { user: { email: 'admin@x.com' } }; papelUsuarioAtual = 'admin'; window.confirm = () => true;
      localStorage.setItem('eficienciaAcabamento', JSON.stringify({ '2026-10-26': { pecas: 110, minutos: 450, ops: 2, semTempo: 10, pessoas: 0 }, '2026-11-02': { pecas: 5, minutos: 20, ops: 1, semTempo: 0, pessoas: 0 } }));
      localStorage.removeItem('eficienciaAcabamentoPend'); localStorage.removeItem('eficienciaAcabamentoApagPend');
      definirPessoasEfAcab('2026-10-26', '2'); await new Promise(r => setTimeout(r, 100));
      const r = [nuvem['eficiencia_acabamento'].dados.dias['2026-10-26'].pessoas, '2026-11-02' in nuvem['eficiencia_acabamento'].dados.dias];
      // outro navegador (vazio) abre a aba e recebe o dia
      localStorage.setItem('eficienciaAcabamento', '{}'); await carregarEfAcabDaNuvem(); r.push(Object.keys(obterEfAcab()).join());
      // limpar outubro
      popularSeletorMesEfAcab('2026-10'); $('seletorMesEfAcab').value = '2026-10'; limparMesEfAcab(); await new Promise(r => setTimeout(r, 100));
      r.push(Object.keys(obterEfAcab()).length, nuvem['eficiencia_acabamento'].dados.dias['2026-10-26'].apagado === true);
      // um navegador antigo ainda com outubro: ao abrir a aba, outubro some
      localStorage.setItem('eficienciaAcabamento', JSON.stringify({ '2026-10-26': { pecas: 1, minutos: 1, ops: 1, semTempo: 0, pessoas: 0 } })); await carregarEfAcabDaNuvem(); r.push(Object.keys(obterEfAcab()).length);
      // gráfico de mês sem dados não fica na tela
      $('seletorMesEfAcab').value = '2026-10'; renderizarEficienciaAcabamento(); r.push(graficoEfAcabInstance === null);
      supabaseClient = velho; sessaoAdminAtual = velhaSessao; papelUsuarioAtual = velhoPapel; window.confirm = velhoConfirm; if (bak) localStorage.setItem('eficienciaAcabamento', bak); else localStorage.removeItem('eficienciaAcabamento'); return r;
    }), [2, false, '2026-10-26', 0, true, 0, true]);
    igual('acabamento: o usuário "sequencia" (Luis) vê o bloco, importa, informa pessoas e baixa o mês, mas não limpa o mês', await p.evaluate(() => {
      const velho = papelUsuarioAtual; papelUsuarioAtual = 'sequencia'; document.body.classList.add('modo-sequencia', 'modo-visitante');
      const vis = id => getComputedStyle($(id)).display !== 'none';
      const r = [vis('secaoEficienciaAcabamento'), vis('btnBaixarMesEfAcab'), vis('btnLimparMesEfAcab'), vis('secaoEficienciaCostura'), [...document.querySelectorAll('#aba-kpi > .secao')].filter(e => e.id !== 'secaoEficienciaCostura' && e.id !== 'secaoEficienciaAcabamento').every(e => getComputedStyle(e).display === 'none')];
      localStorage.setItem('eficienciaAcabamento', JSON.stringify({ '2026-10-26': { pecas: 10, minutos: 40, ops: 1, semTempo: 0, pessoas: 0 } })); popularSeletorMesEfAcab('2026-10');
      definirPessoasEfAcab('2026-10-26', '2'); r.push(obterEfAcab()['2026-10-26'].pessoas);
      papelUsuarioAtual = velho; document.body.classList.remove('modo-sequencia', 'modo-visitante'); localStorage.removeItem('eficienciaAcabamento'); return r;
    }), [true, true, false, true, true, 2]);
  }

  // ---------- 10c. Plano do ACABAMENTO (sub-aba do plano da costura) ----------
  {
    const hoje = await p.evaluate(() => hojeISOLocalPlanoCostura());
    const CABP = 'Empresa;Grupo Local;Ds. Descricao;Tp Produto;Cd Local;Ds Local;Ref.;Ciclo;Op;Dt. Movimento;Qt. Movimento;Cod. Tempo;Cod. Tempolocal;Tipo Mov\n';
    const lp = (op, qtd) => `1;x;desc;CAMISA;1;PNP ACABAMENTO;REF;211;${op};${hoje.split('-').reverse().join('/')};${qtd};3;3;NORMAL\n`;
    await p.evaluate(() => {
      window.__bakPOC = localStorage.getItem('porOPCosturaDetalhado'); localStorage.removeItem('planoAcabamento'); localStorage.removeItem('eficienciaAcabamento');
      const base = { local: 'PNP ACABAMENTO', ref: '', descRef: 'CAMISA TESTE', cor: '', tempoPecaCostura: 1, diasLocal: 1, tipoProduto: '', prioridade: 99, minutosCostura: 0, minutosAcabamento: 5, dataFinalizacao: '2026-10-30T12:00:00.000Z' };
      localStorage.setItem('porOPCosturaDetalhado', JSON.stringify([{ ...base, op: '801', ciclo: '211', qtd: 100 }, { ...base, op: '802', ciclo: '211', qtd: 60 }]));
      papelUsuarioAtual = 'admin'; sessaoAdminAtual = sessaoAdminAtual || { user: { email: 'admin@x.com' } };
      abrirAba(null, 'aba-seq-costura'); $('seqCostGrupo').value = 'ACABAMENTO'; renderizarSequenciamentoCostura();
    });
    const planoAntes = await p.evaluate(() => JSON.stringify(obterPlanosCostura()));
    await p.evaluate(async () => { document.querySelectorAll('.check-imprimir-seq').forEach(c => { c.checked = true; }); await adicionarMarcadasAoPlanoCostura(); });
    igual('plano do acabamento: OPs marcadas com o grupo ACABAMENTO vão pra sub-aba do acabamento e não pro plano da costura', await p.evaluate(() => [obterPlanosCostura('acabamento')[hojeISOLocalPlanoCostura()].ops.map(o => o.op).sort(), obterPlanosCostura('acabamento')[hojeISOLocalPlanoCostura()].ops[0].grupo, opEstaNoPlanoCostura('801', '211')]), [['801', '802'], 'Acabamento', true]);
    igual('plano da costura não foi mexido', await p.evaluate(() => JSON.stringify(obterPlanosCostura())), planoAntes);
    await p.setInputFiles('#inputEfAcab', await (async () => { const f = path.join(os.tmpdir(), 'corte-pro-planoacab.csv'); fs.writeFileSync(f, CABP + lp(801, 100) + lp(802, 20) + lp(899, 7)); return f; })()); await p.waitForTimeout(700);
    igual('plano do acabamento: conferido com a saída do PNP ACABAMENTO (completa, parcial, sem estar no plano)', await p.evaluate(() => { const r = compararPlanoCostura(hojeISOLocalPlanoCostura(), 'acabamento'); return [r.estado, r.itens.map(x => [x.op, x.status, x.saiu]).sort(), r.pecasCumpridas, r.pecasProgramadas, r.pct, r.extras.map(x => [x.chave, x.saiu])]; }), ['conferido', [['801', 'completa', 100], ['802', 'parcial', 20]], 120, 160, 75, [['211-899', 7]]]);
    igual('sub-aba ACABAMENTO aparece e mostra o plano e a conferência', await p.evaluate(() => {
      abrirAba(null, 'aba-plano-costura'); abrirSubabaPlano('acabamento');
      const v = [getComputedStyle($('subaba-plano-acabamento')).display !== 'none', getComputedStyle($('subaba-plano-costura')).display === 'none', /801/.test($('planoAcabLista').innerText), /75% cumprido/.test($('planoAcabConferencia').innerText), $('planoCosturaLista').innerText.includes('801')];
      abrirSubabaPlano('costura'); return v.concat([getComputedStyle($('subaba-plano-costura')).display !== 'none']);
    }), [true, true, true, true, false, true]);
    igual('plano do acabamento: sobe e desce da nuvem com o id acab-AAAA-MM-DD sem misturar com o da costura', await p.evaluate(async () => {
      const velho = supabaseClient, velhaS = sessaoAdminAtual; const gravado = {}; const dia = hojeISOLocalPlanoCostura();
      supabaseClient = { from: () => ({ upsert: row => { gravado[row.id] = row.dados; return Promise.resolve({ error: null }); }, select: () => ({ range: () => Promise.resolve({ data: [{ id: 'acab-2026-01-05', dados: { ops: [{ op: '9', ciclo: '211', grupo: 'Acabamento', qtd: 5, desc: 'x' }], salvoEm: '2026-01-05T10:00:00Z' } }, { id: '2026-01-06', dados: { ops: [{ op: '8', ciclo: '211', grupo: 'Calça', qtd: 4, desc: 'y' }], salvoEm: '2026-01-06T10:00:00Z' } }], error: null }) }) }) };
      sessaoAdminAtual = { user: { email: 'a@x.com' } };
      await publicarPlanoCosturaNuvem(dia, 'acabamento'); await carregarPlanosCosturaDaNuvem();
      const r = [Object.keys(gravado)[0] === 'acab-' + dia, !!obterPlanosCostura('acabamento')['2026-01-05'], !!obterPlanosCostura()['2026-01-05'], !!obterPlanosCostura()['2026-01-06'], !!obterPlanosCostura('acabamento')['2026-01-06']];
      supabaseClient = velho; sessaoAdminAtual = velhaS; return r;
    }), [true, true, false, true, false]);
    igual('exportar planejado x realizado do acabamento: linhas por OP, fora do plano e resumo do dia', await p.evaluate(() => {
      const m = montarPlanoXRealizado('acabamento'); const dia = formatarChaveDataBR(hojeISOLocalPlanoCostura());
      const l = m.detalhe.filter(r => r[0] === dia).map(r => [r[2], r[6], r[7], r[8], r[9], r[10]]);
      return [l, m.resumo.find(r => r[0] === dia).slice(1, 10), !!document.getElementById('btnExportarPlanoAcab'), !!document.getElementById('btnExportarPlanoCostura')];
    }), [[['801', 100, 100, 0, 100, 'SAIU POR COMPLETO'], ['802', 60, 20, 40, 33, 'SAIU PARCIAL'], ['899', 0, 7, '', '', 'SAIU SEM ESTAR NO PLANO']], [2, 160, 120, 75, 1, 1, 0, 1, 7], true, true]);
    igual('excluir plano: some do navegador, grava marca na nuvem, e navegador antigo também remove ao abrir (sem reenviar)', await p.evaluate(async () => {
      const velho = supabaseClient, velhaS = sessaoAdminAtual, velhoC = window.confirm, velhoP = papelUsuarioAtual; const nuvem = {};
      supabaseClient = { from: () => ({ upsert: row => { nuvem[row.id] = row; return Promise.resolve({ error: null }); }, select: () => ({ range: () => Promise.resolve({ data: Object.values(nuvem).map(r => ({ id: r.id, dados: r.dados })), error: null }) }) }) };
      sessaoAdminAtual = { user: { email: 'luis@x.com' } }; papelUsuarioAtual = 'sequencia'; window.confirm = () => true;
      const pl = obterPlanosCostura(); pl['2026-11-14'] = { ops: [{ op: '4856', ciclo: '211', grupo: 'Camisa', qtd: 54, desc: 'x' }], salvoEm: '2026-11-14T13:24:28.676Z' }; salvarPlanosCostura(pl);
      await excluirPlanoCostura('2026-11-14');
      const r = [!obterPlanosCostura()['2026-11-14'], nuvem['2026-11-14'].dados.apagado === true];
      // outro navegador ainda com o plano antigo
      const pl2 = obterPlanosCostura(); pl2['2026-11-14'] = { ops: [{ op: '4856', ciclo: '211', grupo: 'Camisa', qtd: 54, desc: 'x' }], salvoEm: '2026-11-14T13:24:28.676Z' }; salvarPlanosCostura(pl2);
      await carregarPlanosCosturaDaNuvem();
      r.push(!obterPlanosCostura()['2026-11-14'], nuvem['2026-11-14'].dados.apagado === true);
      // alguém salva o dia de novo DEPOIS da exclusão: vale o novo
      const pl3 = obterPlanosCostura(); pl3['2026-11-14'] = { ops: [{ op: '1', ciclo: '211', grupo: 'Camisa', qtd: 5, desc: 'y' }], salvoEm: new Date(Date.now() + 60000).toISOString() }; salvarPlanosCostura(pl3);
      await carregarPlanosCosturaDaNuvem(); r.push(!!obterPlanosCostura()['2026-11-14']);
      const pl4 = obterPlanosCostura(); delete pl4['2026-11-14']; salvarPlanosCostura(pl4);
      supabaseClient = velho; sessaoAdminAtual = velhaS; window.confirm = velhoC; papelUsuarioAtual = velhoP; return r;
    }), [true, true, true, true, true]);
    await p.evaluate(async () => { await tirarOPDoPlanoCostura('801', '211', 'acabamento'); });
    igual('TIRAR no plano do acabamento tira só dele', await p.evaluate(() => obterPlanosCostura('acabamento')[hojeISOLocalPlanoCostura()].ops.map(o => o.op)), ['802']);
    await p.evaluate(() => { if (window.__bakPOC) localStorage.setItem('porOPCosturaDetalhado', window.__bakPOC); else localStorage.removeItem('porOPCosturaDetalhado'); localStorage.removeItem('planoAcabamento'); $('seqCostGrupo').value = 'CALCA'; });
  }

  // ---------- 10b. Texto da planilha com aspas/< não quebra o HTML ----------
  igual('escHtml escapa aspas e tags', await p.evaluate(() => escHtml('TECIDO 1,50" <LISO> & \'X\'')), 'TECIDO 1,50&quot; &lt;LISO&gt; &amp; &#39;X&#39;');
  igual('escHtml com vazio/null', await p.evaluate(() => [escHtml(null), escHtml(undefined), escHtml(0)]), ['', '', '0']);

  // ---------- 10c. Estabilidade: dado corrompido e espaço cheio ----------
  igual('lerJSONLocal: corrompido devolve o padrão e NÃO apaga o valor', await p.evaluate(() => {
    localStorage.setItem('__testeCorrompido', '{quebrado'); const v = lerJSONLocal('__testeCorrompido', []);
    const r = [v, localStorage.getItem('__testeCorrompido'), lerJSONLocal('__naoExiste', { a: 1 }), lerJSONLocal('__testeCorrompido2', 5)];
    localStorage.removeItem('__testeCorrompido'); return r;
  }), [[], '{quebrado', { a: 1 }, 5]);
  igual('espaço cheio: avisa na tela e continua lançando o erro', await p.evaluate(() => {
    const orig = Object.getPrototypeOf(localStorage).setItem; let avisou = false; const velhoToast = showToast;
    showToast = (h, err) => { avisou = /cheio/i.test(h) && err; }; ultimoAvisoEspacoCheio = 0;
    let lancou = false;
    try { localStorage.setItem('__grande', 'x'.repeat(12 * 1024 * 1024)); } catch (e) { lancou = ehErroDeEspacoCheio(e); }
    showToast = velhoToast; localStorage.removeItem('__grande'); return [lancou, avisou, Object.getPrototypeOf(localStorage).setItem === orig];
  }), [true, true, true]);
  igual('ExcelJS sob demanda: já carregado devolve true', await p.evaluate(() => garantirExcelJS()), true);

  // ---------- 10e. Análise de pedidos (falta de estoque × OPs) ----------
  {
    const ExcelJSnode = require('exceljs'); const wb = new ExcelJSnode.Workbook();
    const d = (dia, mes) => new Date(Date.UTC(2026, mes - 1, dia));
    const wp = wb.addWorksheet('BASE PEDIDOS');
    wp.addRow(['Cliente', 'Nome', 'Emp', 'Pedido', 'Situação', 'Bandeira', 'Prior', 'Inclusão', 'Chegada', 'Prev. Fat.', 'NECESSIDADE FAT.', 'Estimativa Fat.', 'Referência', 'Descrição', 'Produto', 'Cor', 'Tam', 'R$ Pendente', 'Pendente', 'Fecha Fisico', '% Fecha', 'Status', 'Falta Estoque', '% Falta Estoque', 'Fecha OP', '% Fecha OP', 'Falta OP', '% Falta OP', 'OPs Fecha', 'Finalizacao OP Origem', 'OPs do Pedido', 'Coligador', 'RESTRICAO DE FATURAMENTO']);
    const ped = (p, sit, prev, nec, ref, tam, pend, fis, falta, cli) => wp.addRow(['1', cli, '2', p, sit, '', 0, d(1, 7), d(1, 7), prev, nec, '', ref, 'DESC ' + ref, '9', 'AZ', tam, pend * 10, pend, fis, '', '', falta, '', '', '', '', '', '', '', '', cli, '']);
    ped('900001', 'Em andamento', d(1, 10), null, 'REFA', 'M', 5, 0, 5, 'CLIENTE UM');
    ped('900002', 'Em andamento', d(1, 11), '15/09/2026', 'REFA', 'M', 4, 0, 4, 'CLIENTE DOIS');   // Necessidade Fat. (texto) vale mais que a Prev. Fat.
    ped('900003', 'Bloqueado', d(1, 8), null, 'REFA', 'M', 3, 0, 3, 'CLIENTE TRES');
    ped('900004', 'Em andamento', d(1, 9), null, 'REFB', 'G', 2, 0, 2, 'CLIENTE UM');
    const wo = wb.addWorksheet('BASE OCUPAÇÃO');
    wo.addRow(['Empresa', 'Ciclo', 'OP', 'Inclusão', 'Situacao', 'Prioridade', 'Referência', 'Descrição Referência', 'Produto', 'Cor', 'Tam', 'Unid', 'Qt OP Local', 'Entrada', 'Local', 'Descrição Local', 'Dias Local', 'Tipo Produto']);
    const op = (cic, n, qtd, loc) => wo.addRow(['1', cic, n, d(1, 6), 'Em Andamento', '99', 'REFA', 'DESC REFA', '9', 'AZ', 'M', 'UNI', qtd, d(1, 9), '1', loc, 3, 'CAMISA']);
    op('211', '100', 6, 'PNP CORTE');              // etapa 10
    op('211', '200', 4, 'PNP ACABAMENTO');         // etapa 18 → gasta primeiro
    op('110', '300', 50, 'PNP PPCP - PROGRAMACAO'); // ciclo 110 + local da lista → não alocável
    op('611', '400', 50, 'PNP AGUARD FINALIZACAO'); // ciclo excluído
    const arqAP = path.join(os.tmpdir(), 'corte-pro-analise-pedidos.xlsx'); await wb.xlsx.writeFile(arqAP);
    await p.evaluate(() => { localStorage.removeItem('configAnalisePedidos'); $('abrirAba-aba-analise-pedidos').click(); });
    await p.waitForTimeout(400);
    await p.setInputFiles('#inputAnalisePedidos', arqAP);
    await p.waitForFunction(() => estadoAP.resultado && estadoAP.resultado.alocacao.length === 4, null, { timeout: 15000 });
    const resumoAP = () => p.evaluate(() => { const R = estadoAP.resultado; return { linhas: R.alocacao.map(a => [a.pedido, a.alocado, a.status, a.opsUsadas]), ind: [R.indicadores.pecasEmFalta, R.indicadores.pecasCobertas, R.indicadores.pecasDescobertas], faltas: R.faltasSemOP.map(f => [f.ref, f.descoberto, f.situacao]), ops: R.opsAProgramar.map(o => [o.op, o.alocado, o.pedidos]) }; });
    igual('análise de pedidos: fila pela data, etapa mais avançada primeiro, sem contar peça duas vezes', await resumoAP(), {
      linhas: [['900003', 3, 'Coberto', '211-200-3'], ['900004', 0, 'Sem OP', ''], ['900002', 4, 'Coberto', '211-200-1, 211-100-3'], ['900001', 3, 'Parcial', '211-100-3']],
      ind: [14, 10, 4], faltas: [['REFA', 2, 'OP insuficiente'], ['REFB', 2, 'Sem nenhuma OP']], ops: [['200', 4, '900003, 900002'], ['100', 6, '900002, 900001']] });
    await p.evaluate(() => { const c = obterConfigAnalisePedidos(); c.incluirBloqueados = false; salvarConfigAnalisePedidos(c); recalcularAnalisePedidos(); });
    igual('análise de pedidos: sem os bloqueados, as OPs vão pros liberados', (await resumoAP()).linhas, [['900004', 0, 'Sem OP', ''], ['900002', 4, 'Coberto', '211-200-4'], ['900001', 5, 'Coberto', '211-100-5']]);
    igual('análise de pedidos: consulta mostra todas as OPs do item (sem alocação)', await p.evaluate(() => { const r = MotorAnalisePedidos.consultarPedido(estadoAP.pedidos, estadoAP.ocupacao, '900001', '211 811'); return [r.encontrado, r.cliente, r.itens[0].emOPs, r.itens[0].status, r.resumo.map(x => x.op)]; }), [true, 'CLIENTE UM', 110, 'Fecha', ['100', '200', '300', '400']]);
    await p.evaluate(() => { localStorage.removeItem('configAnalisePedidos'); for (const v of ['painel', 'alocacao', 'faltas', 'ops', 'consulta', 'config']) { estadoAP.visao = v; renderizarAnalisePedidos(); } estadoAP.visao = 'painel'; });
    igual('simulação: saldo físico vai primeiro pro mais urgente (Nec. Fat.), não pra quem chegou antes', await p.evaluate(() => {
      const s = d => Math.round((Date.UTC(2026, d[1] - 1, d[0]) - Date.UTC(1899, 11, 30)) / 864e5);
      const L = (pedido, produto, pend, fecha, prev, nec, cheg, sit) => ({ pedido, produto, ref: 'R' + produto, cor: 'AZ', tam: 'M', pendente: pend, fechaFisico: fecha, faltaEstoque: pend - fecha, prevFat: s(prev), necFat: nec, chegada: s(cheg), inclusao: s(cheg), prior: 99, situacao: sit || 'Em andamento', coligador: 'C' + pedido, rsPendente: pend * 10 });
      const peds = [L('1', 'S1', 5, 5, [10, 12], null, [1, 9]), L('2', 'S1', 4, 0, [20, 12], '15/11/2026', [1, 10]), L('3', 'S2', 3, 2, [1, 12], null, [1, 9], 'Bloqueado'), L('4', 'S1', 2, 0, [30, 12], null, [2, 10])];
      const r = MotorAnalisePedidos.simularEstoque(peds, [{ produto: 'S1', estoque: 6 }], {});
      return { linhas: r.pedidos.map(l => [l.pedido, l.fechaFisico, l.faltaEstoque, l.erpFecha]), mudancas: r.comparacao.map(c => [c.pedido, c.mudanca]), estimados: r.estimados, usado: r.resumo.fechaSim };
    }), { linhas: [['1', 2, 3, 5], ['2', 4, 0, 0], ['3', 2, 1, 2], ['4', 0, 2, 0]], mudancas: [['1', 'Deixa de fechar'], ['2', 'Passa a fechar'], ['3', 'Igual'], ['4', 'Igual']], estimados: ['S2'], usado: 8 });
    {
      const wbS = new ExcelJSnode.Workbook(), ws = wbS.addWorksheet('Export');
      ws.addRow(['Referência', 'Produto', 'Descrição', 'Qt Vendas', '% Partic', 'Média Vendas', 'Estoque Minimo', 'Estoque Físico']);
      ws.addRow(['REFA', '9', 'DESC REFA', 10, 0.1, 1, 0, 7]); ws.addRow(['REFB', '8', 'DESC REFB', 5, 0.1, 1, 0, 1]); ws.addRow(['Total', '', '', 15, 1, 2, 0, 8]); ws.addRow([]); ws.addRow(['Filtros aplicados:\nTipo Saldo é 1 - FISICO']);
      const arqS = path.join(os.tmpdir(), 'corte-pro-saldo.xlsx'); await wbS.xlsx.writeFile(arqS);
      await p.setInputFiles('#inputAnalisePedidos', arqS);
      await p.waitForFunction(() => estadoAP.simulacao, null, { timeout: 15000 });
      igual('simulação: importa o saldo (sem a linha Total/filtros) e liga a simulação sozinho', await p.evaluate(() => [estadoAP.saldo.map(s => [s.produto, s.estoque]), modoEfetivoAP(), getComputedStyle($('apNavComparacao')).display !== 'none']), [[['9', 7], ['8', 1]], 'simulacao', true]);
      await p.evaluate(() => { estadoAP.visao = 'comparacao'; renderizarAnalisePedidos(); $('apModo').querySelector('[data-modo=erp]').click(); });
      igual('simulação: voltar pro modo ERP esconde a comparação e usa a falta do ERP', await p.evaluate(() => [modoEfetivoAP(), estadoAP.visao, estadoAP.resultado.indicadores.pecasEmFalta]), ['erp', 'painel', 14]);
      await p.evaluate(() => { estadoAP.modo = null; recalcularAnalisePedidos(); });
    }
    igual('análise de pedidos: só admin e quem tem a liberação individual veem a aba', await p.evaluate(() => {
      const r = [], velhoP = papelUsuarioAtual, velhoV = veAnalisePedidosAtual;
      for (const [papel, libera] of [['admin', false], ['usuario', true], ['usuario', false], ['sequencia', true], ['sequencia', false], ['tv', true]]) { papelUsuarioAtual = papel; veAnalisePedidosAtual = papel === 'admin' || libera; r.push(abaLiberadaAgora('aba-analise-pedidos')); }
      papelUsuarioAtual = velhoP; veAnalisePedidosAtual = velhoV; return r;
    }), [true, true, false, true, false, false]);
    igual('análise de pedidos: admin publica, quem só vê baixa da nuvem e chega no mesmo resultado', await p.evaluate(async () => {
      const velho = supabaseClient, velhaS = sessaoAdminAtual, velhoP = papelUsuarioAtual; let guardado = null;
      const consulta = cols => ({ eq: () => ({ maybeSingle: async () => ({ data: guardado && { ...guardado }, error: null }), single: async () => ({ data: guardado && { ...guardado }, error: null }) }) });
      supabaseClient = { from: () => ({ upsert: async l => { guardado = { ...l }; return { error: null }; }, update: v => ({ eq: async () => { Object.assign(guardado, v); return { error: null }; } }), select: consulta }) };
      sessaoAdminAtual = { user: { email: 'admin@x.com' } }; papelUsuarioAtual = 'admin';
      localStorage.removeItem('configAnalisePedidos'); recalcularAnalisePedidos();
      const esperado = JSON.stringify(estadoAP.resultado.alocacao);
      estadoAP.meta.basesEm = new Date().toISOString();
      await publicarAnalisePedidosAP('tudo');
      const publicado = [estadoAP.nuvem, guardado.pedidos.startsWith('gz:'), guardado.publicado_por, !!guardado.meta.basesEm];
      // quem só vê, num computador sem nada salvo
      papelUsuarioAtual = 'usuario'; estadoAP.pedidos = null; estadoAP.ocupacao = null; estadoAP.meta = {}; estadoAP.configNuvem = null;
      await atualizarAnalisePedidosDaNuvem();
      const igualAoAdmin = JSON.stringify(estadoAP.resultado.alocacao) === esperado;
      const computadorDoUsuario = { pedidos: estadoAP.pedidos, ocupacao: estadoAP.ocupacao, meta: estadoAP.meta, configNuvem: estadoAP.configNuvem };
      // admin muda a config e publica só a config: quem vê recalcula sem baixar as bases de novo
      papelUsuarioAtual = 'admin'; const c = obterConfigAnalisePedidos(); c.incluirBloqueados = false; salvarConfigAnalisePedidos(c);
      await new Promise(r => setTimeout(r, 5)); await publicarAnalisePedidosAP('config');
      recalcularAnalisePedidos(); const doAdmin = JSON.stringify(estadoAP.resultado.alocacao);
      papelUsuarioAtual = 'usuario'; Object.assign(estadoAP, computadorDoUsuario); const basesAntes = estadoAP.pedidos; await atualizarAnalisePedidosDaNuvem();
      const r = [publicado, igualAoAdmin, estadoAP.pedidos === basesAntes, JSON.stringify(estadoAP.resultado.alocacao) === doAdmin && !!(estadoAP.saldo && estadoAP.saldo.length) && modoEfetivoAP() === 'simulacao'];
      localStorage.removeItem('configAnalisePedidos'); supabaseClient = velho; sessaoAdminAtual = velhaS; papelUsuarioAtual = velhoP; return r;
    }), [['ok', true, 'admin', true], true, true, true]);
  }

  // ---------- 10d. Login obrigatório e papel TV ----------
  {
    const p2 = await b.newPage({ viewport: { width: 1400, height: 1000 } });
    await p2.goto('file://' + path.join(RAIZ, 'index.html')); await p2.waitForTimeout(1200);
    igual('sem login: só a tela de login aparece, nenhuma aba liberada', await p2.evaluate(() => [
      document.body.classList.contains('sem-login'), getComputedStyle($('telaLogin')).display, getComputedStyle(document.querySelector('.header-main')).display,
      abaLiberadaAgora('aba-prioridades'), abaLiberadaAgora('aba-fila')]), [true, 'flex', 'none', false, false]);
    verdade('sem a biblioteca da nuvem, a tela de login explica o problema', await p2.evaluate(() => /conectar/i.test($('telaLoginErro').textContent)));
    await p2.close();
  }
  igual('papel vem da tabela; sem cadastro ou com erro vira TV (antes virava admin)', await p.evaluate(async () => {
    const velho = supabaseClient, velhaS = sessaoAdminAtual, r = [];
    const fake = resp => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => resp }) }) }) });
    sessaoAdminAtual = { user: { email: 'x@y.com' } };
    for (const resp of [{ data: { papel: 'admin' } }, { data: { papel: 'usuario' } }, { data: null }, { data: { papel: 'qualquer' } }, { error: { message: 'falhou' } }]) {
      supabaseClient = fake(resp); try { await verificarPapelUsuario(); } catch (e) { /* loaders da nuvem não existem no fake */ } r.push(papelUsuarioAtual);
    }
    supabaseClient = velho; sessaoAdminAtual = velhaS; papelUsuarioAtual = 'admin'; return r;
  }), ['admin', 'usuario', 'tv', 'tv', 'tv']);
  igual('papel TV: entra direto no modo TV fixo e não abre outras abas', await p.evaluate(() => {
    papelUsuarioAtual = 'tv'; aplicarRestricaoDeAbaVisitante(); aplicarTelaDeLogin();
    abrirAba(null, 'aba-kpi');
    const r = [document.body.classList.contains('modo-tv'), document.body.classList.contains('modo-tv-fixo'), document.querySelector('.aba-conteudo.ativa').id,
      getComputedStyle($('controles-tv')).display, abaLiberadaAgora('aba-prioridades')];
    clearInterval(scInt); clearInterval(relogioTVInt); document.body.classList.remove('modo-tv', 'modo-tv-fixo');
    papelUsuarioAtual = 'admin'; aplicarRestricaoDeAbaVisitante(); return r;
  }), [true, true, 'aba-fila', 'flex', false]);

  // ---------- 11. Fumaça: todas as abas abrem sem erro ----------
  const abas = await p.evaluate(() => [...document.querySelectorAll('[id^=aba-]')].map(e => e.id));
  for (const a of abas) { try { await p.evaluate(id => abrirAba(null, id), a); } catch (e) { falhas.push('abrir aba ' + a + ': ' + e.message.slice(0, 100)); } }
  verdade('todas as abas abrem', abas.length >= 8, 'abas encontradas: ' + abas.length);
  igual('nenhum erro de JavaScript na página', errosPagina, []);

  await b.close();
  console.log(`\n${ok} verificações passaram, ${falhas.length} falharam.`);
  if (falhas.length) { console.log('\nFALHAS:\n- ' + falhas.join('\n- ')); process.exit(1); }
})().catch(e => { console.error('Erro ao rodar os testes:', e); process.exit(2); });
