// -------------------------------------------------------------------------
// (separado de ops-prioridades.js) Utilitários de data (Excel, dias úteis) e checagem da biblioteca de Excel.
// -------------------------------------------------------------------------
// GESTÃO DE DADOS EXCEL E TEMPO
function extrairDataExcel(valorData) {
    if (!valorData) return null;
    if (valorData instanceof Date) { if (valorData.getFullYear() > 2000) return valorData; return null; }
    if (typeof valorData === 'number' && valorData > 40000 && valorData < 60000) {
        let dt = new Date(Math.round((valorData - 25569) * 86400 * 1000));
        dt = new Date(dt.getTime() + dt.getTimezoneOffset() * 60000);
        if (dt.getFullYear() > 2000) return dt; return null;
    }
    if (typeof valorData === 'string') {
        let v = valorData.trim();
        let m1 = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (m1) { let dt = new Date(parseInt(m1[1]), parseInt(m1[2]) - 1, parseInt(m1[3])); if (dt.getFullYear() > 2000) return dt; }
        let m2 = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
        if (m2) { let ano = parseInt(m2[3]); if (ano < 100) ano += 2000; let dt = new Date(ano, parseInt(m2[2]) - 1, parseInt(m2[1])); if (dt.getFullYear() > 2000) return dt; }
    }
    return null;
}

function adicionarDiasUteis(dataOriginal, diasUteis) {
    let d = new Date(dataOriginal.getTime()), dias = 0;
    while (dias < diasUteis) { d.setUTCDate(d.getUTCDate() + 1); let diaSemana = d.getUTCDay(); if (diaSemana !== 0 && diaSemana !== 6) dias++; }
    return d;
}

function diffDiasCorridos(d1, d2) {
    if (!d1 || !d2) return null;
    let diff = new Date(d2).setUTCHours(0, 0, 0, 0) - new Date(d1).setUTCHours(0, 0, 0, 0);
    return Math.max(0, Math.round(diff / (1000 * 60 * 60 * 24)));
}

// Confere se a biblioteca de leitura de Excel carregou antes de tentar usar
// — sem isso, o erro que aparecia era um "XLSX is not defined" cru, sem
// explicação nenhuma. CDN às vezes falha por um instante; recarregar a
// página (F5) quase sempre resolve.
function exigirBibliotecaExcel() {
    if (typeof XLSX !== 'undefined') return true;
    registrarLogDebug('error', ['Tentativa de ler planilha sem a biblioteca de Excel carregada (XLSX indefinido).']);
    showToast('<i class="fas fa-triangle-exclamation"></i> A biblioteca de leitura de planilhas não carregou. Recarregue a página (F5) e tente de novo.', true);
    return false;
}
