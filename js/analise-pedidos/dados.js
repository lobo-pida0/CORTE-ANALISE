// =========================================================================
// 📦 ANÁLISE DE PEDIDOS — IMPORTAÇÃO E ARMAZENAMENTO
// Lê as duas bases (BASE PEDIDOS = relatório de pedidos com "Falta Estoque"; BASE OCUPAÇÃO = OPs por local
// com "Qt OP Local"). Aceita:
//   • a própria PLANILHA_ANALISE_PEDIDOS.xlsx (pega as abas "BASE PEDIDOS" e "BASE OCUPAÇÃO" de uma vez);
//   • os relatórios separados (.xlsx/.xls/.csv) — reconhece qual é qual pelo cabeçalho.
// As colunas são achadas pelo NOME do cabeçalho (sem acento/maiúscula), não pela posição.
// Guardado no IndexedDB do navegador (as bases têm dezenas de milhares de linhas — não cabem no localStorage).
// A configuração (campos amarelos da planilha) fica no localStorage 'configAnalisePedidos'.
// =========================================================================
const normCabAP = s => String(s === undefined || s === null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/\./g, ' ').replace(/\s+/g, ' ').trim();

const COLUNAS_PEDIDOS_AP = {
    pedido: ['PEDIDO'], nome: ['NOME'], coligador: ['COLIGADOR'], situacao: ['SITUACAO'], prior: ['PRIOR'], chegada: ['CHEGADA'],
    prevFat: ['PREV FAT'], necFat: ['NECESSIDADE FAT'], ref: ['REFERENCIA'], desc: ['DESCRICAO'], produto: ['PRODUTO'], cor: ['COR'], tam: ['TAM'],
    rsPendente: ['R$ PENDENTE'], pendente: ['PENDENTE'], fechaFisico: ['FECHA FISICO'], faltaEstoque: ['FALTA ESTOQUE'], restricao: ['RESTRICAO DE FATURAMENTO', 'RESTRICAO FATURAMENTO']
};
const OBRIGATORIAS_PEDIDOS_AP = ['pedido', 'situacao', 'ref', 'tam', 'pendente', 'faltaEstoque'];
const COLUNAS_OCUPACAO_AP = {
    empresa: ['EMPRESA', 'EMP'], ciclo: ['CICLO'], op: ['OP'], situacao: ['SITUACAO'], ref: ['REFERENCIA'], descRef: ['DESCRICAO REFERENCIA'],
    produto: ['PRODUTO'], cor: ['COR'], tam: ['TAM'], qtd: ['QT OP LOCAL'], entrada: ['ENTRADA'], local: ['DESCRICAO LOCAL'], diasLocal: ['DIAS LOCAL']
};
const OBRIGATORIAS_OCUPACAO_AP = ['ciclo', 'op', 'ref', 'tam', 'qtd', 'local'];
const CAMPOS_TEXTO_AP = ['pedido', 'nome', 'coligador', 'situacao', 'ref', 'desc', 'produto', 'cor', 'tam', 'restricao', 'empresa', 'ciclo', 'op', 'descRef', 'local'];
const CAMPOS_DATA_AP = ['chegada', 'prevFat', 'entrada'];
const NOMES_CAMPOS_AP = { pedido: 'Pedido', situacao: 'Situação', ref: 'Referência', tam: 'Tam', pendente: 'Pendente', faltaEstoque: 'Falta Estoque', ciclo: 'Ciclo', op: 'OP', qtd: 'Qt OP Local', local: 'Descrição Local' };

// Acha a linha de cabeçalho (nas 15 primeiras) e o índice de cada campo. null se não for essa base.
function mapearColunasAP(linhas, mapa, obrigatorias) {
    for (let r = 0; r < Math.min(linhas.length, 15); r++) {
        const cab = (linhas[r] || []).map(normCabAP);
        const idx = {};
        for (const [campo, nomes] of Object.entries(mapa)) { const i = cab.findIndex(c => nomes.includes(c)); if (i >= 0) idx[campo] = i; }
        const faltando = obrigatorias.filter(c => idx[c] === undefined);
        if (faltando.length <= 1 && Object.keys(idx).length >= obrigatorias.length) return { linhaCab: r, idx, faltando };
    }
    return null;
}
function converterLinhasAP(linhas, mapeamento) {
    const out = [];
    for (let r = mapeamento.linhaCab + 1; r < linhas.length; r++) {
        const l = linhas[r]; if (!l) continue;
        const o = {};
        for (const [campo, i] of Object.entries(mapeamento.idx)) {
            let v = l[i]; if (v === undefined || v === '') v = null;
            if (v !== null && CAMPOS_TEXTO_AP.includes(campo)) v = String(v).trim();
            if (v !== null && CAMPOS_DATA_AP.includes(campo) && typeof v === 'string') v = serialDeTextoAP(v);
            if (v instanceof Date) v = MotorAnalisePedidos.serialDeData(v);
            o[campo] = v;
        }
        out.push(o);
    }
    return out;
}
function serialDeTextoAP(s) {
    const m = String(s).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (!m) { const n = MotorAnalisePedidos.num(s); return n || null; }
    return Math.round((Date.UTC(+m[3], +m[2] - 1, +m[1]) - Date.UTC(1899, 11, 30)) / 86400000);
}

// Lê um arquivo e devolve { pedidos?, ocupacao? } com o que achou nele.
async function lerArquivoAnalisePedidosAP(arquivo) {
    const buf = await arquivo.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array', cellDates: false, cellFormula: false, cellHTML: false, cellStyles: false, raw: /\.csv$/i.test(arquivo.name) ? true : undefined });   // CSV: lê tudo como texto (senão 26/11 vira data americana)
    const achado = {};
    const ler = ws => XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: false });
    const nomes = wb.SheetNames;
    const porNome = n => nomes.find(x => normCabAP(x) === n);
    const ordem = [porNome('BASE PEDIDOS'), porNome('BASE OCUPACAO'), ...nomes].filter((x, i, a) => x && a.indexOf(x) === i);
    for (const nome of ordem) {
        if (achado.pedidos && achado.ocupacao) break;
        const ws = wb.Sheets[nome]; if (!ws || !ws['!ref']) continue;
        const linhas = ler(ws);
        if (!achado.pedidos) {
            const m = mapearColunasAP(linhas, COLUNAS_PEDIDOS_AP, OBRIGATORIAS_PEDIDOS_AP);
            if (m && !m.faltando.length) { achado.pedidos = converterLinhasAP(linhas, m).filter(l => l.pedido); achado.abaPedidos = nome; continue; }
            if (m && m.faltando.length && /PEDIDO/.test(normCabAP(nome))) achado.erroPedidos = m.faltando;
        }
        if (!achado.ocupacao) {
            const m = mapearColunasAP(linhas, COLUNAS_OCUPACAO_AP, OBRIGATORIAS_OCUPACAO_AP);
            if (m && !m.faltando.length) { achado.ocupacao = converterLinhasAP(linhas, m).filter(l => l.ref || l.ciclo || l.op); achado.abaOcupacao = nome; continue; }
            if (m && m.faltando.length) achado.erroOcupacao = m.faltando;
        }
    }
    return achado;
}

// ---------- IndexedDB ----------
function abrirIDBAnalisePedidos() {
    return new Promise((ok, erro) => {
        const r = indexedDB.open('corte-pro-analise-pedidos', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('kv');
        r.onsuccess = () => ok(r.result); r.onerror = () => erro(r.error);
    });
}
async function salvarBaseAnalisePedidos(chave, valor) {
    const db = await abrirIDBAnalisePedidos();
    return new Promise((ok, erro) => { const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(valor, chave); tx.oncomplete = () => ok(); tx.onerror = () => erro(tx.error); });
}
async function lerBaseAnalisePedidos(chave) {
    try {
        const db = await abrirIDBAnalisePedidos();
        return await new Promise((ok, erro) => { const r = db.transaction('kv').objectStore('kv').get(chave); r.onsuccess = () => ok(r.result || null); r.onerror = () => erro(r.error); });
    } catch (e) { registrarLogDebug('error', ['Análise de pedidos: não consegui ler o banco do navegador: ' + e.message]); return null; }
}

// ---------- configuração ----------
function obterConfigAnalisePedidos() {
    const salvo = lerJSONLocal('configAnalisePedidos', {});
    const p = MotorAnalisePedidos.CONFIG_PADRAO;
    return {
        ...p, ...salvo,
        naoAlocaveisCicloLocal: { ...p.naoAlocaveisCicloLocal, ...(salvo.naoAlocaveisCicloLocal || {}) },
        naoAlocaveisEmpresaCiclo: { ...p.naoAlocaveisEmpresaCiclo, ...(salvo.naoAlocaveisEmpresaCiclo || {}) },
        locaisPrioritarios: { ...p.locaisPrioritarios, ...(salvo.locaisPrioritarios || {}) }
    };
}
function salvarConfigAnalisePedidos(cfg) { localStorage.setItem('configAnalisePedidos', JSON.stringify(cfg)); }
