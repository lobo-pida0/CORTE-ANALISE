// =========================================================================
// 📦 ANÁLISE DE PEDIDOS — MOTOR DE CÁLCULO (sem tela, sem DOM)
// Transposição da planilha "PLANILHA_ANALISE_PEDIDOS.xlsx" (abas CALC, ALOCAÇÃO OPs, PAINEL ATRASOS,
// FALTAS SEM OP, OPs A PROGRAMAR e CONSULTA PEDIDO). Mesmas regras, mesma ordem, mesmos números.
//
// Ideia: cada linha de pedido com FALTA DE ESTOQUE é uma "demanda"; cada linha da BASE OCUPAÇÃO (OP × ref ×
// cor × tam × local) é uma "oferta". As duas se casam pela CHAVE Referência|Cor|Tam (a cor vira "*" quando a
// opção "considerar cor" está desligada). Dentro de cada chave:
//   • demandas em fila pela data (Necessidade Fat., ou Prev. Fat.) — o pedido mais atrasado pega primeiro;
//   • ofertas gastas na ordem: etapa mais avançada → locais prioritários → ciclos preferenciais →
//     Em Andamento / Ag. Liberação → entrada mais antiga → OP.
// A alocação é feita por FAIXAS ACUMULADAS (igual às colunas "acum." e "anterior" da planilha): a demanda
// i ocupa o intervalo (L, K] da chave e a oferta j ocupa (AB, AA]; o que se sobrepõe é o que a OP j dá
// ao pedido i. Assim nenhuma peça é contada duas vezes.
//
// Datas: número de série do Excel (dias desde 30/12/1899), pra conta de dias ficar igual à planilha.
// Funciona no navegador (variável global MotorAnalisePedidos) e no Node (module.exports) — os testes
// comparam este motor com os resultados que o próprio Excel calculou.
// =========================================================================
const MotorAnalisePedidos = (() => {

    // ---------- utilidades que imitam o Excel ----------
    const txt = v => (v === undefined || v === null) ? '' : String(v);                 // valor & ""
    const up = v => txt(v).toUpperCase();                                              // Excel compara texto sem diferenciar maiúscula
    const eqi = (a, b) => up(a) === up(b);
    const num = v => {                                                                  // IFERROR(--v, 0)
        if (typeof v === 'number') return isFinite(v) ? v : 0;
        if (v === undefined || v === null || v === '' || typeof v === 'boolean') return 0;
        const s = String(v).trim().replace(/\s/g, '');
        if (s === '') return 0;
        const n = Number(/,\d{1,2}$/.test(s) && !/\.\d{3},/.test(s) ? s.replace(',', '.') : s.replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
        return isFinite(n) ? n : 0;
    };
    const somaNum = v => (typeof v === 'number' && isFinite(v)) ? v : 0;               // SUMIFS só soma o que é número
    // Comparação de ordenação do Excel: número < texto; texto sem diferenciar maiúscula
    function cmpExcel(a, b) {
        const na = typeof a === 'number', nb = typeof b === 'number';
        if (a === undefined || a === null || a === '') a = na ? a : '';
        if (b === undefined || b === null || b === '') b = nb ? b : '';
        if (na && nb) return a - b;
        if (na) return -1;
        if (nb) return 1;
        const x = up(a), y = up(b);
        return x < y ? -1 : (x > y ? 1 : 0);
    }
    // SORTBY estável com várias chaves: [[valores, 1|-1], ...]
    function ordenarIndices(n, criterios) {
        const idx = Array.from({ length: n }, (_, i) => i);
        idx.sort((i, j) => {
            for (const [vals, dir] of criterios) {
                const c = cmpExcel(vals[i], vals[j]);
                if (c !== 0) return c * dir;
            }
            return i - j;
        });
        return idx;
    }
    // TEXTSPLIT(TRIM(SUBSTITUTE(SUBSTITUTE(x,","," "),";"," "))," ",,TRUE)
    const listaDe = s => txt(s).replace(/[,;]/g, ' ').trim().split(/\s+/).filter(Boolean);
    const posNaLista = (v, lista) => { const u = up(v); const i = lista.findIndex(x => up(x) === u); return i < 0 ? 0 : i + 1; };
    // DATE(RIGHT(x,4), MID(x,4,2), LEFT(x,2)) → série do Excel (0 se não der)
    function serialDeDMY(s) {
        s = txt(s);
        const a = Number(s.slice(-4)), m = Number(s.slice(3, 5)), d = Number(s.slice(0, 2));
        if (!s || !isFinite(a) || !isFinite(m) || !isFinite(d) || s.slice(-4).trim() === '' || s.slice(3, 5).trim() === '' || s.slice(0, 2).trim() === '') return 0;
        const ms = Date.UTC(Math.trunc(a), Math.trunc(m) - 1, Math.trunc(d));
        const serial = Math.round((ms - Date.UTC(1899, 11, 30)) / 86400000);
        return serial > 0 ? serial : 0;
    }
    function serialDeData(d) { return Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(1899, 11, 30)) / 86400000); }
    function dataDeSerial(s) { if (!s) return null; const ms = Date.UTC(1899, 11, 30) + Math.round(s) * 86400000; const d = new Date(ms); return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); }
    // Necessidade Fat. (número ou texto dd/mm/aaaa) → se não tiver, Prev. Fat.
    function dataDoPedido(l) {
        const nx = l.necFat;
        const nd = typeof nx === 'number' ? nx : ((nx === null || nx === undefined || nx === '') ? 0 : serialDeDMY(nx));
        return nd > 0 ? nd : num(l.prevFat);
    }

    // ---------- configuração (os campos amarelos da planilha) ----------
    // Posição de cada local no processo (0–19): quanto MAIOR, mais perto de finalizar → a OP é gasta primeiro.
    // 0 = coringa (Compras, Fiscal, Bordado aguard. pedido). Local que não estiver aqui conta como 0.
    const ETAPAS_PADRAO = [
        ["FISCAL REVISAR OP.S",0], ["PNP AGUARD LIBERACAO OP",1], ["PNP AGUARD MATERIA PRIMA",3],
        ["PNP ALMOX. ANALISE DE MEDIDAS",5], ["PNP ALMOX. TECIDOS",8], ["PNP ANALISE DE MATERIA PRIMA",2],
        ["PNP CAD",6], ["PNP COMPRAS",0], ["PNP PPCP - PROGRAMACAO",4],
        ["PNP PPCP-PROGRAMACAO CORTE",7], ["AGRUP CORTE EXTERNO",9], ["EXT BORDADO BORD MAIS - RIO PRETO",12],
        ["EXT BORDADO KADOSH BORDADOS",12], ["EXT CORTE HODAK FRANCINEIDE GRAVATARIA",17], ["EXT MALHARIA NOVA VITORIA",17],
        ["PNP AGUARD DEFINICAO BORDADO",12], ["PNP BORDADO INTERNO",12], ["PNP BORDADO INTERNO - AGUARD PEDIDO",0],
        ["PNP CORTE",10], ["PNP ENFESTO",9], ["PNP ETIQ PROF/AMARR SOC/SEP LOG/SEP GLA",11],
        ["PNP FUSIONADEIRA LOGO",12], ["PNP INSPECAO LOGO/MARCA INDIRETO",12], ["PNP PREP GOLA E PUNHO",12],
        ["PNP PREP PARTES INF",12], ["PNP PREP PARTES SUP",12], ["PNP PREP. LOGO/MARCA INTERNA",12],
        ["PNP SEPARAR PECAS / UNIR CORPO E PTS",13], ["PNP SILK INTERNO",12], ["EXT COSTURA ADILSON ROCHA",17],
        ["EXT COSTURA ALAIANE ESPINOSA",17], ["EXT COSTURA ANGELA FREIRA (SP)",17], ["EXT COSTURA BONETEX (ANDERSON)",17],
        ["EXT COSTURA CARLOS ( ESPINOSA)",17], ["EXT COSTURA CINDYS CONF. - APUCARANA-PR",17], ["EXT COSTURA CLAYTON (ZINHO)",17],
        ["EXT COSTURA COSTURART (CAMILA)",17], ["EXT COSTURA GABRIELA (FILHA DA SELMA)",17], ["EXT COSTURA GILBERTO (JOSE BONIFACIO)",17],
        ["EXT COSTURA J.S CONFECCOES LTDA",17], ["EXT COSTURA JULIANA (KAIROS CONFECCO",17], ["EXT COSTURA JULIANA - SONIA",17],
        ["EXT COSTURA JULIO LAURENTINO DA ROCHA",17], ["EXT COSTURA LIMA DIAS (MALHARIA)",17], ["EXT COSTURA LUCIMARA SANTOS",17],
        ["EXT COSTURA MADALENA (IARAS)",17], ["EXT COSTURA MATEUS ALTO ALEGRE",17], ["EXT COSTURA MATHEUS VESTSIM (PARAGUA",17],
        ["EXT COSTURA PATCON CONFECCOES LTDA",17], ["EXT COSTURA REGINA (BR OLIVEIRA)",17], ["EXT COSTURA ROSA MARA (SEBASTIANOPOLIS)",17],
        ["EXT COSTURA SELMA CONFECCOES",17], ["EXT COSTURA SHIRLEI (PRESIDENTE V)",17], ["EXT COSTURA SILVIO M. (LINDALVA)",17],
        ["EXT COSTURA UNITREND CONFECCOES (NEUSA)",17], ["PNP AGRUP DE DISTRIBUICAO",14], ["PNP AGUARD BIP DISTRIBUICAO",12],
        ["PNP AGUARD DEFINICAO COST INF",16], ["PNP AGUARD DEFINICAO COST SUP",16], ["PNP COST CEL HIBRIDA",17],
        ["PNP COST INF CALCA",17], ["PNP COST SUP CAMISA",17], ["PNP COST SUP MALHA",17],
        ["PNP COST. INT CONSERTOS SUP",17], ["PNP DISTRIBUICAO EXT",15], ["PNP DISTRIBUICAO INT",15],
        ["PNP INT AGUARD. DISTRIBUICAO",14], ["PNP INT COST (2)",17], ["EXT SELVIRIA",16],
        ["EXT UNIFARDAS - SP",17], ["PNP ACABAMENTO",18], ["PNP ACABAMENTO TERCEIROS",19],
        ["PNP AGUARD FINALIZACAO",19], ["PNP QUAL - CONSERTOS",18], ["PNP QUAL - INSPECAO EXT",18],
        ["SLV ACABAMENTO",18], ["SLV AGUARD DEFINICAO COST SOC PROF SU",16], ["SLV AGUARD FINALIZACAO",19],
        ["SLV COST CEL PALETO",17], ["SLV COST INF CEL SOC",17], ["SLV COST SUP CEL 1",17],
        ["SLV COST SUP CEL 2",17], ["SLV COST SUP CEL 3",17], ["SLV QUAL - AGUARD DEFINICAO",18],
        ["SLV RECEB PENAPOLIS",16], ["PNP RECEB EXT",18], ["PNP AGUARD DEFINICAO SILK",12]
    ];
    const NOMES_POSICAO = ['Coringa (qualquer ponto)', 'Aguard liberação OP', 'Análise matéria-prima', 'Aguard matéria-prima', 'PPCP programação', 'Análise de medidas', 'CAD', 'PPCP programação corte', 'Almox tecidos', 'Enfesto / Agrup corte ext', 'Corte', 'Etiquetação', 'Preparação / bordado / silk', 'Separar peças', 'Agrup / aguard distribuição', 'Distribuição int/ext', 'Definição costura / trânsito SLV', 'Costura / oficinas', 'Acabamento / receb ext / qualidade', 'Aguard finalização'];
    const CONFIG_PADRAO = {
        ciclosPreferenciais: '211 811',
        incluirBloqueados: true,
        considerarCor: false,
        naoAlocaveisCicloLocal: { ciclos: '110 111', locais: ['PNP AGUARD LIBERACAO OP', 'PNP ANALISE DE MATERIA PRIMA', 'PNP INT AGUARD. DISTRIBUICAO', 'PNP PPCP - PROGRAMACAO'] },
        naoAlocaveisEmpresaCiclo: { empresa: '1', ciclos: '111' },
        ciclosExcluidos: '611',
        locaisPrioritarios: { ciclos: '211 811', locais: ['PNP ACABAMENTO', 'PNP ACABAMENTO TERCEIROS', 'PNP AGUARD DEFINICAO COST INF', 'PNP AGUARD DEFINICAO COST SUP', 'PNP AGUARD FINALIZACAO', 'PNP COST CEL HIBRIDA', 'PNP COST INF CALCA', 'PNP COST SUP CAMISA', 'PNP COST SUP MALHA', 'PNP DISTRIBUICAO INT', 'PNP QUAL - CONSERTOS', 'PNP QUAL - INSPECAO EXT', 'PNP RECEB EXT'] },
        etapas: ETAPAS_PADRAO,                     // [[descrição do local, posição 0–19], ...]
        atrasoMinimo: 1,
        faixas: [['1-7 dias', 1], ['8-15 dias', 8], ['16-30 dias', 16], ['31-60 dias', 31], ['+60 dias', 61]],
        posicaoDe: 0, posicaoAte: 19
    };

    function chave(ref, cor, tam, considerarCor) { return up(ref) + '|' + (considerarCor ? up(cor) : '*') + '|' + up(tam); }

    // =====================================================================
    // CÁLCULO PRINCIPAL
    // pedidos: [{ pedido, nome, coligador, situacao, prior, chegada, prevFat, necFat, ref, desc, produto, cor, tam,
    //             rsPendente, pendente, fechaFisico, faltaEstoque, restricao }]
    // ocupacao: [{ empresa, ciclo, op, situacao, ref, descRef, produto, cor, tam, qtd, entrada, local, diasLocal }]
    // hoje: série do Excel (número) — "Data base" do painel
    // =====================================================================
    function calcular(pedidos, ocupacao, cfgEntrada, hoje) {
        const cfg = { ...CONFIG_PADRAO, ...(cfgEntrada || {}) };
        const cc = !!cfg.considerarCor;
        const mapaEtapa = new Map(); (cfg.etapas || []).forEach(([loc, pos]) => { const k = up(loc); if (!mapaEtapa.has(k)) mapaEtapa.set(k, num(pos)); });
        const etapaDe = loc => mapaEtapa.has(up(loc)) ? mapaEtapa.get(up(loc)) : 0;

        // ---------- DEMANDA (CALC A:H) ----------
        const dem0 = [];
        for (const l of pedidos) {
            const f = num(l.faltaEstoque);
            if (!(f > 0) || txt(l.pedido) === '') continue;
            if (eqi(l.situacao, 'Bloqueado') && !cfg.incluirBloqueados) continue;
            dem0.push({ pedido: l.pedido, ref: l.ref, cor: l.cor, tam: l.tam, falta: f, prev: dataDoPedido(l), situacao: l.situacao, desc: l.desc });
        }
        const ordD = ordenarIndices(dem0.length, [[dem0.map(d => d.prev > 0 ? d.prev : 99999), 1], [dem0.map(d => d.pedido), 1]]);
        const dem = ordD.map(i => dem0[i]);
        const chavesDem = new Set();
        const acumD = new Map();
        dem.forEach((d, i) => {
            d.idx = i + 1; d.chave = chave(d.ref, d.cor, d.tam, cc); chavesDem.add(d.chave);
            const a = (acumD.get(d.chave) || 0) + d.falta; acumD.set(d.chave, a);
            d.demAcum = a; d.demAnt = a - d.falta;
        });
        const demandaPorChave = acumD;   // total por chave (AC)

        // ---------- OFERTA (CALC R:X) ----------
        const bcl = listaDe(cfg.naoAlocaveisCicloLocal.ciclos), blLoc = (cfg.naoAlocaveisCicloLocal.locais || []).filter(x => txt(x) !== '');
        const ecl = listaDe(cfg.naoAlocaveisEmpresaCiclo.ciclos), empBloq = txt(cfg.naoAlocaveisEmpresaCiclo.empresa);
        const xcl = listaDe(cfg.ciclosExcluidos), pl = listaDe(cfg.ciclosPreferenciais);
        const pcl = listaDe(cfg.locaisPrioritarios.ciclos), lpLocs = (cfg.locaisPrioritarios.locais || []).filter(x => txt(x) !== '');
        const of0 = [];
        for (const o of ocupacao) {
            const q = num(o.qtd);
            const k = chave(o.ref, o.cor, o.tam, cc);
            if (!chavesDem.has(k) || !(q > 0)) continue;
            const cic = txt(o.ciclo);
            if (posNaLista(cic, bcl) && posNaLista(o.local, blLoc)) continue;
            if (eqi(o.empresa, empBloq) && posNaLista(cic, ecl)) continue;
            if (posNaLista(cic, xcl)) continue;
            const cr = posNaLista(cic, pl) || 99;
            const lp = posNaLista(cic, pcl) ? (posNaLista(o.local, lpLocs) || 99) : 99;
            const sr = eqi(o.situacao, 'Em Andamento') ? 1 : (eqi(o.situacao, 'Ag. Liberação') ? 2 : 3);
            of0.push({ chave: k, ref: o.ref, cor: o.cor, tam: o.tam, ciclo: o.ciclo, op: o.op, situacao: o.situacao, qtd: q, entrada: o.entrada, local: o.local, et: etapaDe(o.local), lp, cr, sr });
        }
        const ordO = ordenarIndices(of0.length, [[of0.map(o => o.chave), 1], [of0.map(o => o.et), -1], [of0.map(o => o.lp), 1], [of0.map(o => o.cr), 1], [of0.map(o => o.sr), 1], [of0.map(o => o.entrada), 1], [of0.map(o => o.op), 1]]);
        const ofe = ordO.map(i => of0[i]);
        const acumO = new Map(), faixaO = new Map();   // chave → [ini, fim] índices em ofe
        ofe.forEach((o, i) => {
            o.idx = i + 1; o.rotulo = txt(o.ciclo) + '-' + txt(o.op);
            const a = (acumO.get(o.chave) || 0) + o.qtd; acumO.set(o.chave, a);
            o.ofAcum = a; o.ofAnt = a - o.qtd;
            const ac = demandaPorChave.get(o.chave) || 0;
            o.alocado = ac >= o.ofAcum ? o.qtd : (ac > o.ofAnt ? ac - o.ofAnt : 0);
            const fx = faixaO.get(o.chave); if (fx) fx[1] = i; else faixaO.set(o.chave, [i, i]);
        });

        // ---------- ALOCAÇÃO POR LINHA (CALC M:Q) ----------
        const faixaD = new Map();
        dem.forEach((d, i) => {
            const fx = faixaD.get(d.chave); if (fx) fx.push(i); else faixaD.set(d.chave, [i]);
            const m = acumO.get(d.chave) || 0;
            d.pecasOP = m;
            d.alocado = m >= d.demAcum ? d.falta : (m > d.demAnt ? m - d.demAnt : 0);
            d.descoberto = d.falta - d.alocado;
            d.opsUsadas = ''; d.locaisOps = '';
            if (d.alocado === 0) return;
            const fo = faixaO.get(d.chave); if (!fo) return;
            const porRot = new Map(), locs = [];
            for (let j = fo[0]; j <= fo[1]; j++) {
                const o = ofe[j];
                if (o.ofAnt >= d.demAcum) break;                 // ofertas já passaram desta demanda
                const q = Math.min(o.ofAcum, d.demAcum) - Math.max(o.ofAnt, d.demAnt);
                if (q > 0) {
                    porRot.set(o.rotulo, (porRot.get(o.rotulo) || 0) + q);
                    const r = o.rotulo + ': ' + txt(o.local) + ' [E' + o.et + ']';
                    if (!locs.includes(r)) locs.push(r);
                }
            }
            d.opsUsadas = [...porRot].map(([r, q]) => r + '-' + q).join(', ');
            d.locaisOps = locs.join(' | ');
        });
        // linhas atendidas por oferta (AE)
        ofe.forEach(o => {
            const ds = faixaD.get(o.chave) || []; let n = 0;
            for (const i of ds) { const d = dem[i]; if (d.demAcum > o.ofAnt && d.demAnt < o.ofAcum) n++; }
            o.linhas = n;
        });

        // ---------- lookups na base de pedidos ----------
        const primeiroPorPedido = new Map(), descPorRef = new Map();
        for (const l of pedidos) {
            const p = txt(l.pedido); if (p !== '' && !primeiroPorPedido.has(up(p))) primeiroPorPedido.set(up(p), l);
            const r = up(l.ref); if (r !== '' && !descPorRef.has(r)) descPorRef.set(r, l.desc);
        }
        const diasDe = prev => prev > 0 ? (hoje > prev ? hoje - prev : 0) : '';

        // ---------- ABA ALOCAÇÃO OPs ----------
        const alocacao = dem.map(d => {
            const p = primeiroPorPedido.get(up(d.pedido));
            return {
                pedido: d.pedido, cliente: p ? (p.coligador ?? '') : '', situacao: d.situacao, prev: d.prev, diasAtraso: diasDe(d.prev),
                ref: d.ref, desc: d.desc, cor: d.cor, tam: d.tam, falta: d.falta, alocado: d.alocado, descoberto: d.descoberto,
                status: d.descoberto === 0 ? 'Coberto' : (d.alocado > 0 ? 'Parcial' : 'Sem OP'),
                opsUsadas: d.opsUsadas, locaisOps: d.locaisOps
            };
        });
        // Resumo por OP (P:W)
        const porOP = new Map();
        ofe.forEach(o => {
            let r = porOP.get(up(o.rotulo));
            if (!r) { r = { ciclo: o.ciclo, op: o.op, situacao: o.situacao, qtd: 0, alocado: 0, linhas: 0, locais: [] }; porOP.set(up(o.rotulo), r); }
            r.qtd += o.qtd; r.alocado += o.alocado; r.linhas += o.linhas;
            if (!r.locais.some(x => eqi(x, o.local))) r.locais.push(o.local);
        });
        const resumo0 = [...porOP.values()].map(r => ({ ...r, sobra: r.qtd - r.alocado, locais: r.locais.map(txt).filter(Boolean).join(', '), cr: posNaLista(txt(r.ciclo), pl) || 99 }));
        const resumoOP = ordenarIndices(resumo0.length, [[resumo0.map(r => r.cr), 1], [resumo0.map(r => r.alocado), -1]]).map(i => resumo0[i]);

        let somaFalta = 0, somaAloc = 0, somaDesc = 0; dem.forEach(d => { somaFalta += d.falta; somaAloc += d.alocado; somaDesc += d.descoberto; });
        let somaOf = 0, somaOfAloc = 0; ofe.forEach(o => { somaOf += o.qtd; somaOfAloc += o.alocado; });
        let pecasBloqEmpresa = 0, pecasBloqCicloLocal = 0;
        for (const o of ocupacao) {
            const q = num(o.qtd), cic = txt(o.ciclo);
            if (eqi(o.empresa, empBloq) && posNaLista(cic, ecl)) pecasBloqEmpresa += q;
            if (posNaLista(cic, bcl) && posNaLista(o.local, blLoc)) pecasBloqCicloLocal += q;
        }
        const indicadores = {
            linhasEmFalta: dem.length, pecasEmFalta: somaFalta, pecasCobertas: somaAloc,
            coberturaReal: somaFalta ? somaAloc / somaFalta : 0, pecasDescobertas: somaDesc, pecasOPSobrando: somaOf - somaOfAloc,
            pecasBloqueadasEmpresaCiclo: pecasBloqEmpresa, pecasBloqueadasCicloLocal: pecasBloqCicloLocal
        };

        // ---------- ABA PAINEL ATRASOS ----------
        const porPedido = new Map(); const ordemPedidos = [];
        for (const l of pedidos) {
            const p = txt(l.pedido); if (p === '') continue;
            const k = up(p);
            let a = porPedido.get(k);
            if (!a) { a = { primeira: l, pend: 0, fis: 0, rs: 0, rsFalta: 0 }; porPedido.set(k, a); ordemPedidos.push(k); }
            a.pend += somaNum(l.pendente); a.fis += somaNum(l.fechaFisico); a.rs += somaNum(l.rsPendente);
            const v = num(l.pendente), w = num(l.fechaFisico), rs = num(l.rsPendente);
            a.rsFalta += v > 0 ? rs * (v - w > 0 ? v - w : 0) / v : 0;
        }
        const alocPorPedido = new Map(); dem.forEach(d => { const k = up(d.pedido); alocPorPedido.set(k, (alocPorPedido.get(k) || 0) + d.alocado); });
        const faixasOrd = [...cfg.faixas].sort((a, b) => num(a[1]) - num(b[1]));
        const faixaDe = dias => { let r = ''; for (const [nome, de] of faixasOrd) if (num(de) <= dias) r = nome; return r; };
        let naoAtendidos = 0; const painel0 = [];
        for (const k of ordemPedidos) {
            const a = porPedido.get(k), l = a.primeira;
            if (a.pend > a.fis) naoAtendidos++;
            const prev = dataDoPedido(l), dias = hoje - prev, falta = a.pend - a.fis;
            if (!(falta > 0 && prev > 0 && dias >= num(cfg.atrasoMinimo))) continue;
            const cob = alocPorPedido.get(k) || 0;
            painel0.push({
                pedido: l.pedido, cliente: l.coligador ?? '', situacao: l.situacao, prior: l.prior, chegada: l.chegada, prev, dias, faixa: faixaDe(dias),
                pendentes: a.pend, fechaFisico: a.fis, pctAtendido: a.pend ? a.fis / a.pend : 0, falta, rsTotal: a.rs, restricao: txt(l.restricao),
                cobertoOP: cob, pctComOPs: a.pend ? (a.fis + cob) / a.pend : 0,
                statusOPs: (eqi(l.situacao, 'Bloqueado') && !cfg.incluirBloqueados) ? 'Bloqueado (fora)' : (cob >= falta ? 'Coberto por OP' : (cob > 0 ? 'Parcial' : 'Sem OP')),
                rsFalta: a.rsFalta
            });
        }
        const painel = ordenarIndices(painel0.length, [[painel0.map(p => p.dias), -1]]).map(i => painel0[i]);
        const faixas = cfg.faixas.map(([nome, de]) => {
            const ps = painel.filter(p => p.faixa === nome);
            return { faixa: nome, aPartirDe: de, pedidos: ps.length, rsFalta: ps.reduce((s, p) => s + p.rsFalta, 0), pecasFalta: ps.reduce((s, p) => s + p.falta, 0), rsTotal: ps.reduce((s, p) => s + p.rsTotal, 0) };
        });
        const porCliente = new Map();
        painel.forEach(p => {
            const k = up(p.cliente); let c = porCliente.get(k);
            if (!c) { c = { cliente: p.cliente, pedidos: 0, rsFalta: 0, maiorAtraso: -Infinity }; porCliente.set(k, c); }
            c.pedidos++; c.rsFalta += p.rsFalta; if (p.dias > c.maiorAtraso) c.maiorAtraso = p.dias;
        });
        const cl = [...porCliente.values()];
        const top10 = ordenarIndices(cl.length, [[cl.map(c => c.rsFalta), -1]]).slice(0, 10).map(i => cl[i]);
        const indicadoresPainel = {
            naoAtendidos, atrasados: painel.length, pctAtrasados: naoAtendidos ? painel.length / naoAtendidos : 0,
            rsFaltaAtrasado: painel.reduce((s, p) => s + p.rsFalta, 0), pecasFaltaAtrasadas: painel.reduce((s, p) => s + p.falta, 0)
        };

        // ---------- ABA FALTAS SEM OP ----------
        const porChave = new Map(); const ordemChaves = [];
        dem.forEach(d => {
            let c = porChave.get(d.chave);
            if (!c) { c = { d, falta: 0, alocado: 0, n: 0, menorPrev: 0 }; porChave.set(d.chave, c); ordemChaves.push(d.chave); }
            c.falta += d.falta; c.alocado += d.alocado; c.n++;
            if (d.prev > 0 && (c.menorPrev === 0 || d.prev < c.menorPrev)) c.menorPrev = d.prev;
        });
        const faltas0 = [];
        for (const k of ordemChaves) {
            const c = porChave.get(k), d = c.d, des = c.falta - c.alocado;
            if (!(des > 0)) continue;
            faltas0.push({
                ref: d.ref, desc: d.desc, cor: cc ? d.cor : '(todas)', tam: d.tam, faltaTotal: c.falta, pecasOP: d.pecasOP, alocado: c.alocado,
                descoberto: des, pedidos: c.n, maiorAtraso: diasDe(c.menorPrev), situacao: d.pecasOP === 0 ? 'Sem nenhuma OP' : 'OP insuficiente'
            });
        }
        const faltasSemOP = ordenarIndices(faltas0.length, [[faltas0.map(f => f.descoberto), -1]]).map(i => faltas0[i]);
        const indicadoresFaltas = { itens: faltasSemOP.length, pecasDescobertas: faltasSemOP.reduce((s, f) => s + f.descoberto, 0), semNenhumaOP: faltasSemOP.filter(f => f.situacao === 'Sem nenhuma OP').length };

        // ---------- ABA OPs A PROGRAMAR ----------
        const corPorOPRefTam = new Map();
        for (const o of ocupacao) { const k = up(txt(o.ciclo) + '-' + txt(o.op) + '|' + txt(o.ref) + '|' + txt(o.tam)); if (!corPorOPRefTam.has(k)) corPorOPRefTam.set(k, o.cor); }
        const opp0 = [];
        ofe.forEach(o => {
            if (!(o.alocado > 0 && o.et >= num(cfg.posicaoDe) && o.et <= num(cfg.posicaoAte))) return;
            // ref/tam vêm da própria linha da OP; sem "considerar cor", a cor é a da 1ª linha dessa OP+ref+tam na base
            const refT = o.ref, tamT = o.tam;
            const cor = cc ? o.cor : (corPorOPRefTam.get(up(o.rotulo + '|' + txt(refT) + '|' + txt(tamT))) ?? '');
            const peds = [], pedSet = new Set(); let pv = 0;
            for (const i of (faixaD.get(o.chave) || [])) {
                const d = dem[i];
                if (d.demAcum > o.ofAnt && d.demAnt < o.ofAcum) {
                    const k = up(d.pedido); if (!pedSet.has(k)) { pedSet.add(k); peds.push(txt(d.pedido)); }
                    if (d.prev > 0 && (pv === 0 || d.prev < pv)) pv = d.prev;
                }
            }
            let tx = peds.join(', ');
            if (tx.length > 240) tx = peds.slice(0, 20).join(', ') + ' … (+' + (peds.length - 20) + ' pedidos)';
            opp0.push({
                ciclo: o.ciclo, op: o.op, situacao: o.situacao, local: o.local, posicao: o.et, ref: refT, desc: descPorRef.get(up(refT)) ?? '', cor, tam: tamT,
                qtd: o.qtd, alocado: o.alocado, sobra: o.qtd - o.alocado, linhas: o.linhas, pedidos: tx, pedidosLista: peds, prevMaisAntiga: pv || '', diasAtraso: pv ? hoje - pv : ''
            });
        });
        const opsAProgramar = ordenarIndices(opp0.length, [[opp0.map(o => o.prevMaisAntiga === '' ? 99999999 : o.prevMaisAntiga), 1], [opp0.map(o => o.op), 1]]).map((i, n) => ({ prioridade: n + 1, ...opp0[i] }));

        // locais da ocupação sem etapa cadastrada (aba ETAPAS, coluna F)
        const semEtapa = []; const vistos = new Set();
        for (const o of ocupacao) { const l = txt(o.local); if (l && !mapaEtapa.has(up(l)) && !vistos.has(up(l))) { vistos.add(up(l)); semEtapa.push(l); } }

        return { alocacao, resumoOP, indicadores, painel, faixas, top10, indicadoresPainel, faltasSemOP, indicadoresFaltas, opsAProgramar, locaisSemEtapa: semEtapa, _demanda: dem, _oferta: ofe };
    }

    // =====================================================================
    // CONSULTA DE UM PEDIDO (aba CONSULTA PEDIDO) — não depende da alocação: mostra TODAS as OPs que têm
    // a referência/tamanho dos itens em falta, ordenadas pelos ciclos preferenciais digitados.
    // =====================================================================
    function consultarPedido(pedidos, ocupacao, numeroPedido, ciclosPref, cfgEntrada) {
        const cfg = { ...CONFIG_PADRAO, ...(cfgEntrada || {}) }; const cc = !!cfg.considerarCor;
        const alvo = up(numeroPedido);
        const linhasPed = pedidos.filter(l => up(l.pedido) === alvo);
        const cab = linhasPed[0];
        const itens = linhasPed.filter(l => num(l.faltaEstoque) > 0).map(l => {
            const ops = ocupacao.filter(o => eqi(o.ref, l.ref) && eqi(o.cor, l.cor) && eqi(o.tam, l.tam));
            const emOPs = ops.reduce((s, o) => s + somaNum(o.qtd), 0), falta = num(l.faltaEstoque);
            return { ref: l.ref, desc: l.desc, produto: l.produto, cor: l.cor, tam: l.tam, pendente: num(l.pendente), falta, emOPs,
                faltaAposOPs: emOPs >= falta ? 0 : falta - emOPs, status: emOPs === 0 ? 'Sem OP' : (emOPs >= falta ? 'Fecha' : 'Parcial'), linhasOP: ops.length };
        });
        const faltaPorChave = new Map(); itens.forEach(i => { const k = chave(i.ref, i.cor, i.tam, cc); if (!faltaPorChave.has(k)) faltaPorChave.set(k, i.falta); });
        const pl = listaDe(ciclosPref);
        let ops = ocupacao.filter(o => txt(o.ref) !== '' && faltaPorChave.has(chave(o.ref, o.cor, o.tam, cc))).map(o => {
            const fi = faltaPorChave.get(chave(o.ref, o.cor, o.tam, cc)), q = o.qtd;
            return { ref: o.ref, cor: o.cor, tam: o.tam, ciclo: o.ciclo, op: o.op, situacao: o.situacao, qtd: q, local: o.local, diasLocal: o.diasLocal, entrada: o.entrada, produto: o.produto, faltaItem: fi, util: Math.min(num(q), fi) };
        });
        const pecasPorOP = new Map(); ops.forEach(o => { const k = up(txt(o.ciclo) + '-' + txt(o.op)); pecasPorOP.set(k, (pecasPorOP.get(k) || 0) + o.util); });
        const crDe = c => posNaLista(txt(c), pl) || 99;
        ops = ordenarIndices(ops.length, [[ops.map(o => crDe(o.ciclo)), 1], [ops.map(o => pecasPorOP.get(up(txt(o.ciclo) + '-' + txt(o.op)))), -1], [ops.map(o => o.ciclo), 1], [ops.map(o => o.op), 1], [ops.map(o => o.ref), 1], [ops.map(o => o.cor), 1], [ops.map(o => o.tam), 1]]).map(i => ops[i]);
        const res = new Map();
        ops.forEach(o => { const k = up(txt(o.ciclo) + '-' + txt(o.op) + '-' + txt(o.situacao)); let r = res.get(k); if (!r) { r = { ciclo: o.ciclo, op: o.op, situacao: o.situacao, pecas: 0, itens: 0 }; res.set(k, r); } r.pecas += o.util; r.itens++; });
        const r0 = [...res.values()];
        const resumo = ordenarIndices(r0.length, [[r0.map(r => crDe(r.ciclo)), 1], [r0.map(r => r.pecas), -1]]).map(i => r0[i]);
        const pecasFalta = itens.reduce((s, i) => s + i.falta, 0), cobertas = pecasFalta - itens.reduce((s, i) => s + i.faltaAposOPs, 0);
        return {
            encontrado: !!cab, cliente: cab ? cab.nome : '', situacao: cab ? cab.situacao : '',
            pecasFalta, pecasCobertas: cobertas, cobertura: pecasFalta ? cobertas / pecasFalta : 0,
            itensFecham: itens.filter(i => i.status === 'Fecha').length, itensTotal: itens.length, itens, ops, resumo
        };
    }

    return { calcular, consultarPedido, CONFIG_PADRAO, NOMES_POSICAO, serialDeData, dataDeSerial, num, listaDe, _cmpExcel: cmpExcel };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = MotorAnalisePedidos;
