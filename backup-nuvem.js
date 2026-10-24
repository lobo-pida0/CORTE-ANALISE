// =========================================================================
// ☁️ BACKUP AUTOMÁTICO NA NUVEM — uma cópia de TODAS as tabelas do sistema, comprimida, guardada na própria
// nuvem (tabela `backups_nuvem`, só admin/usuário logado enxerga). Roda sozinho quando o admin entra e o
// último backup tem 7+ dias; guarda os 8 mais recentes. Quando precisar, é só baixar um deles (o arquivo é
// o mesmo formato do "BAIXAR BACKUP DA NUVEM" e pode ser restaurado em "RESTAURAR BACKUP DA NUVEM").
// Cuidado: protege contra erro/apagão de DADOS (importou errado, limpou sem querer), não contra a perda do
// projeto Supabase inteiro — pra isso vale baixar um arquivo de vez em quando.
// =========================================================================
const TABELAS_BACKUP_NUVEM = ['ops', 'pedidos', 'grade', 'prioridade_clientes', 'localizacao_completa', 'pedidos_todos', 'movimentacoes_kpi',
    'ops_manuais_prioridade', 'por_op_costura_detalhado', 'urgencias_estado', 'local_producao_por_op', 'metadados_sistema',
    'eficiencia_costura_dias', 'ops_removidas_seq_costura', 'ordem_manual_enfesto', 'destino_producao'];
const DIAS_ENTRE_BACKUPS_NUVEM = 7;
const QTD_BACKUPS_NUVEM_GUARDADOS = 8;

// Tudo que o sistema guarda só no navegador (histórico de lotes, o que ainda não foi publicado, preferências...).
// Fica de fora: o log do console de depuração (ruído) e a sessão de login do Supabase.
function coletarDadosNavegadorBackup() {
    const dados = {};
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (!k || k === 'logsConsoleDebug' || /^sb-|supabase/i.test(k)) continue;
            dados[k] = localStorage.getItem(k);
        }
    } catch (e) { /* ignora */ }
    return dados;
}

async function comprimirTextoBackup(texto) {
    const bytes = new TextEncoder().encode(texto);
    let saida = bytes, prefixo = 'raw:';
    if (typeof CompressionStream !== 'undefined') {
        saida = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
        prefixo = 'gz:';
    }
    let bin = ''; const pedaco = 0x8000;
    for (let i = 0; i < saida.length; i += pedaco) bin += String.fromCharCode.apply(null, saida.subarray(i, i + pedaco));
    return prefixo + btoa(bin);
}
async function descomprimirTextoBackup(conteudo) {
    const comprimido = conteudo.startsWith('gz:');
    const bin = atob(conteudo.slice(comprimido ? 3 : 4));
    const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
    if (!comprimido) return new TextDecoder().decode(bytes);
    return await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
}

async function criarBackupNaNuvem(manual) {
    if (!supabaseClient || !sessaoAdminAtual) { if (manual) showToast('<i class="fas fa-lock"></i> Entre como admin para fazer o backup na nuvem.', true); return false; }
    if (manual && !exigirAdmin('fazer o backup na nuvem')) return false;
    if (manual) showToast('<i class="fas fa-cloud-arrow-up"></i> Fazendo backup na nuvem...');
    try {
        const dados = {}; let linhas = 0;
        for (const t of TABELAS_BACKUP_NUVEM) {
            try { dados[t] = await buscarTodasLinhasSupabase(t); linhas += dados[t].length; }
            catch (e) { registrarLogDebug('error', [`[BACKUP NUVEM] tabela "${t}" ignorada: ${e.message}`]); }
        }
        dados._navegador = coletarDadosNavegadorBackup();   // dados que só existem neste navegador
        const conteudo = await comprimirTextoBackup(JSON.stringify(dados));
        const id = new Date().toISOString().slice(0, 10);   // 1 por dia: refazer no mesmo dia substitui
        const { error } = await supabaseClient.from('backups_nuvem').upsert({ id, criado_em: new Date().toISOString(), tabelas: Object.keys(dados).length - 1, linhas, tamanho_bytes: conteudo.length, conteudo }, { onConflict: 'id' });
        if (error) throw error;
        const { data: lista } = await supabaseClient.from('backups_nuvem').select('id').order('id', { ascending: false });
        const velhos = (lista || []).slice(QTD_BACKUPS_NUVEM_GUARDADOS).map(x => x.id);
        if (velhos.length) await supabaseClient.from('backups_nuvem').delete().in('id', velhos);
        showToast(`<i class="fas fa-shield-halved"></i> Backup na nuvem feito (${linhas.toLocaleString('pt-BR')} linhas, ${(conteudo.length / 1048576).toFixed(1)} MB).`, false, 5000);
        return true;
    } catch (e) {
        registrarLogDebug('error', ['[BACKUP NUVEM] falhou: ' + e.message]);
        showToast('<i class="fas fa-triangle-exclamation"></i> Não consegui fazer o backup na nuvem (' + (e.message || 'erro') + ').', true, 8000);
        return false;
    }
}

// Chamado quando o admin entra: se o último backup tem 7+ dias (ou não existe), faz outro.
async function verificarBackupNuvemAutomatico() {
    if (!supabaseClient || !sessaoAdminAtual || papelUsuarioAtual !== 'admin') return;
    try {
        const { data, error } = await supabaseClient.from('backups_nuvem').select('id,criado_em').order('criado_em', { ascending: false }).limit(1);
        if (error) throw error;
        const ultimo = data && data[0] ? new Date(data[0].criado_em) : null;
        if (!ultimo || (Date.now() - ultimo.getTime()) / 86400000 >= DIAS_ENTRE_BACKUPS_NUVEM) await criarBackupNaNuvem(false);
    } catch (e) { registrarLogDebug('error', ['[BACKUP NUVEM] não consegui verificar o último backup: ' + e.message]); }
}

async function baixarBackupGuardadoNuvem(id) {
    if (!exigirAdmin('baixar um backup guardado')) return;
    try {
        showToast('<i class="fas fa-cloud-arrow-down"></i> Baixando backup de ' + id + '...');
        const { data, error } = await supabaseClient.from('backups_nuvem').select('conteudo').eq('id', id).single();
        if (error) throw error;
        const texto = await descomprimirTextoBackup(data.conteudo);
        const url = URL.createObjectURL(new Blob([texto], { type: 'application/json' }));
        const a = document.createElement('a'); a.href = url; a.download = `Backup_Nuvem_${id}.json`; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) {
        registrarLogDebug('error', ['[BACKUP NUVEM] falha ao baixar: ' + e.message]);
        showToast('<i class="fas fa-triangle-exclamation"></i> Não consegui baixar esse backup (' + (e.message || 'erro') + ').', true);
    }
}

async function abrirBackupsNuvem() {
    if (!exigirAdmin('ver os backups da nuvem')) return;
    let lista = [], erro = '';
    try {
        const { data, error } = await supabaseClient.from('backups_nuvem').select('id,criado_em,tabelas,linhas,tamanho_bytes').order('criado_em', { ascending: false });
        if (error) throw error; lista = data || [];
    } catch (e) { erro = e.message || 'erro'; }
    const linhas = lista.map(b => `<tr><td><strong>${new Date(b.criado_em).toLocaleDateString('pt-BR')}</strong> <span style="font-size:11px; color:var(--texto-secundario);">${new Date(b.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span></td>
        <td style="text-align:right;">${(b.linhas || 0).toLocaleString('pt-BR')}</td><td style="text-align:right;">${((b.tamanho_bytes || 0) / 1048576).toFixed(1)} MB</td>
        <td style="text-align:right;"><button class="btn" style="padding:4px 10px; background:#35505C; color:white;" onclick="baixarBackupGuardadoNuvem('${b.id}')"><i class="fas fa-download"></i> BAIXAR</button></td></tr>`).join('');
    $('modalBalancoSincronizacao').innerHTML = `
        <div class="modal-card" style="width:620px; max-width:92vw; border-top:5px solid #35505C; max-height:85vh;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; border-bottom:2px solid var(--borda-cor); padding-bottom:10px;">
                <h2 style="margin:0; font-size:16px;"><i class="fas fa-shield-halved"></i> BACKUPS NA NUVEM</h2>
                <button onclick="fecharModais()" class="modal-fechar-btn"><i class="fas fa-times"></i></button>
            </div>
            <div style="overflow-y:auto; flex:1;">
                <div style="font-size:12px; color:var(--texto-secundario); margin-bottom:10px;">Uma cópia de todas as tabelas (e dos dados guardados só no navegador de quem fez o backup, como o histórico de lotes) é guardada sozinha toda semana (quando o admin entra) e ficam as ${QTD_BACKUPS_NUVEM_GUARDADOS} mais recentes. Para voltar um deles, baixe e use <strong>RESTAURAR BACKUP DA NUVEM</strong> no menu Sistema.</div>
                ${erro ? `<div style="color:var(--cor-alerta); font-size:12px; padding:10px;">Não consegui listar: ${erro}</div>` : (lista.length ? `<table class="tabela-dados" style="width:100%;"><thead><tr><th>DATA</th><th style="text-align:right;">LINHAS</th><th style="text-align:right;">TAMANHO</th><th></th></tr></thead><tbody>${linhas}</tbody></table>` : '<div style="padding:16px; text-align:center; color:var(--texto-secundario);">Ainda não há backups guardados.</div>')}
            </div>
            <div style="display:flex; justify-content:space-between; border-top:1px solid var(--borda-cor); padding-top:12px; margin-top:10px;">
                <button class="btn" style="background:#2E7D5B; color:white;" onclick="criarBackupNaNuvem(true).then(abrirBackupsNuvem)"><i class="fas fa-cloud-arrow-up"></i> FAZER BACKUP AGORA</button>
                <button onclick="fecharModais()" class="btn" style="background:var(--borda-cor); color:var(--texto-cor);">FECHAR</button>
            </div>
        </div>`;
    $('modalBalancoSincronizacao').style.display = 'flex';
}
