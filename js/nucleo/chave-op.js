// =========================================================================
// 🔑 IDENTIDADE DA OP NA PRIORIDADE: CICLO + NÚMERO
// O mesmo número de OP existe em ciclos diferentes (ex: 111 e 211 — são OPs
// distintas). Tudo que guarda estado de prioridade (Destino, mês, número,
// local, OPs automáticas, manuais, estrela) usa a chave "ciclo-OP" ("211-4293");
// OP sem ciclo gravado usa só o número. Antes era só o número, e uma OP
// herdava a prioridade/mês/local da OP de OUTRO ciclo com o mesmo número.
// =========================================================================
function normalizarParteChaveOP(v) { return (v === undefined || v === null) ? '' : String(v).trim().replace(/\.0+$/, ''); }
function montarChaveOP(ciclo, op) { const c = normalizarParteChaveOP(ciclo), o = normalizarParteChaveOP(op); return c ? `${c}-${o}` : o; }
function chaveDaOP(o) { return o ? montarChaveOP(o.ciclo, o.id) : ''; }
// "211-4293" → { ciclo: "211", op: "4293" }; "4293" → { ciclo: "", op: "4293" } (ciclo = 3 dígitos)
function separarChaveOP(chave) { const m = String(chave).match(/^(\d{3})-(.+)$/); return m ? { ciclo: m[1], op: m[2] } : { ciclo: '', op: String(chave) }; }
// Acha a OP da Sincronização pelo número + ciclo. Sem ciclo informado, só devolve se o número for ÚNICO.
function acharOPNaSincronizacao(opId, ciclo) {
    const c = normalizarParteChaveOP(ciclo), id = String(opId);
    if (c) return bancoDadosOPs.find(o => o.id === id && normalizarParteChaveOP(o.ciclo) === c) || bancoDadosOPs.find(o => o.id === id && !normalizarParteChaveOP(o.ciclo)) || null;
    const mesmas = bancoDadosOPs.filter(o => o.id === id);
    return mesmas.length === 1 ? mesmas[0] : null;
}
// Id que vai pra nuvem: "ciclo-OP". Ao voltar, tira o prefixo do ciclo (a tabela `ops` já tem coluna ciclo; a de OPs manuais não, aí o ciclo viaja dentro do id).
function numeroDaChaveNuvem(id, ciclo) { const s = String(id), c = normalizarParteChaveOP(ciclo); return (c && s.startsWith(c + '-')) ? s.slice(c.length + 1) : s; }

// Roda UMA vez (e só com a lista de OPs carregada): converte o que já estava salvo
// pelo número pro formato "ciclo-OP". Número que existe em UM único ciclo na lista
// atual vira a chave dessa OP; número que não está mais na lista (a OP já saiu) ou
// que existe em 2+ ciclos (não dá pra saber de qual era) é DESCARTADO — mantê-lo
// faria a prioridade antiga "grudar" numa OP nova que reaproveite o número.
// Não mexe nas OPs automáticas/manuais cadastradas (têm o dado todo dentro delas).
function migrarPrioridadesParaChaveComposta() {
    if (localStorage.getItem('prioridadeChaveV2')) return;
    if (!bancoDadosOPs.length) return;
    const porNumero = new Map();
    bancoDadosOPs.forEach(o => { const n = String(o.id); if (!porNumero.has(n)) porNumero.set(n, new Set()); porNumero.get(n).add(chaveDaOP(o)); });
    const convertidas = new Set(), descartadas = new Set();   // OPs DISTINTAS (a mesma OP aparece em várias listas)
    const converter = k => {
        k = String(k);
        if (separarChaveOP(k).ciclo) return k;                       // já está no formato novo
        const cand = porNumero.get(k);
        if (cand && cand.size === 1) { convertidas.add(k); return [...cand][0]; }
        descartadas.add(k); return null;
    };
    const ler = (nome, padrao) => { try { return JSON.parse(localStorage.getItem(nome) || padrao); } catch (e) { return JSON.parse(padrao); } };
    ['prioridadesDestino', 'prioridadesManuais', 'opsDestacadasPrioridade'].forEach(nome => {
        const novo = []; ler(nome, '[]').forEach(k => { const n = converter(k); if (n && !novo.includes(n)) novo.push(n); });
        localStorage.setItem(nome, JSON.stringify(novo));
    });
    ['opsMesDestino', 'numerosPrioridade', 'locaisDestinoPorOP'].forEach(nome => {
        const novo = {}; Object.entries(ler(nome, '{}')).forEach(([k, v]) => { const n = converter(k); if (n) novo[n] = v; });
        localStorage.setItem(nome, JSON.stringify(novo));
    });
    localStorage.setItem('prioridadeChaveV2', '1');
    if (convertidas.size || descartadas.size) {
        showToast(`<i class="fas fa-key"></i> Prioridades atualizadas pro novo formato (OP + ciclo): ${convertidas.size} OP(s) mantida(s)${descartadas.size ? `, ${descartadas.size} descartada(s) (já saíram da Sincronização ou o número existe em 2 ciclos — reimporte o Destino se faltar alguma)` : ''}.`, false, 9000);
    }
}
