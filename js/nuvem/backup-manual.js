// -------------------------------------------------------------------------
// (separado de nuvem.js) Espaço usado na nuvem, baixar backup e restaurar backup da nuvem.
// -------------------------------------------------------------------------
const TABELAS_NUVEM = ['ops', 'pedidos', 'grade', 'prioridade_clientes', 'localizacao_completa', 'pedidos_todos'];

// Baixa uma cópia de TODOS os dados que estão hoje na nuvem, num arquivo só.
// O plano gratuito do Supabase não tem backup automático nenhum (só nos
// pagos) — esse é o "seguro" caseiro pros dados compartilhados. Não mexe no
// backup local de sexta-feira, que continua existindo separado (esse aqui é
// dos dados PUBLICADOS, que todo mundo vê — coisas diferentes).
// Plano gratuito do Supabase = 500MB, sem aviso nenhum quando está
// chegando perto do limite — essa função consulta o tamanho real do banco
// (via função obter_tamanho_banco(), criada no SQL) e mostra pro admin,
// evitando a surpresa de "parou de funcionar do nada" um dia.
const LIMITE_NUVEM_MB = 500;
async function verificarEspacoNuvem(mostrarSempreQueOk) {
    if (!exigirAdmin('verificar o espaço da nuvem')) return;
    if (!supabaseClient) { showToast('Conexão com a nuvem não foi iniciada.', true); return; }
    try {
        const { data, error } = await supabaseClient.rpc('obter_tamanho_banco');
        if (error) throw error;
        const usadoMB = data / (1024 * 1024);
        const percentual = Math.round((usadoMB / LIMITE_NUVEM_MB) * 1000) / 10;
        const mensagem = `<i class="fas fa-database"></i> Nuvem: ${usadoMB.toFixed(1)} MB de ${LIMITE_NUVEM_MB} MB usados (${percentual}%)`;
        if (percentual >= 80) {
            showToast(mensagem + ' — chegando perto do limite do plano gratuito!', true);
        } else if (mostrarSempreQueOk) {
            showToast(mensagem);
        }
        return { usadoMB, percentual };
    } catch (e) {
        registrarLogDebug('error', ['Falha ao consultar o tamanho do banco: ' + e.message]);
        if (mostrarSempreQueOk) showToast('<i class="fas fa-triangle-exclamation"></i> Não consegui consultar o espaço da nuvem — veja o console de depuração.', true);
    }
}

async function baixarBackupNuvem() {
    if (!exigirAdmin('baixar o backup da nuvem')) return;
    if (!supabaseClient) { showToast('Conexão com a nuvem não foi iniciada.', true); return; }
    showToast('<i class="fas fa-cloud-download-alt"></i> Baixando backup da nuvem...');
    try {
        const dados = {};
        for (const tabela of TABELAS_NUVEM) {
            dados[tabela] = await buscarTodasLinhasSupabase(tabela);
        }
        if (typeof coletarDadosNavegadorBackup === 'function') dados._navegador = coletarDadosNavegadorBackup();
        const dataHoje = new Date().toISOString().split('T')[0];
        const conteudoJSON = JSON.stringify(dados, null, 2);
        const blob = new Blob([conteudoJSON], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const linkDownload = document.createElement('a');
        linkDownload.href = url;
        linkDownload.download = `Backup_Nuvem_${dataHoje}.json`;
        linkDownload.click();
        URL.revokeObjectURL(url);
        showToast('<i class="fas fa-check"></i> Backup da nuvem baixado!');
    } catch (e) {
        registrarLogDebug('error', ['Falha ao baixar backup da nuvem: ' + e.message]);
        showToast('<i class="fas fa-triangle-exclamation"></i> Falha ao baixar backup. Veja o console de depuração.', true);
    }
}

// Restaura um arquivo baixado por baixarBackupNuvem() de volta pra nuvem —
// publica tabela por tabela, usando o mesmo mecanismo de sempre (upsert +
// remove o que não está no arquivo). Pede confirmação, porque SOBRESCREVE o
// que está publicado agora — é pra usar só se algo tiver dado errado.
async function restaurarBackupNuvem(e) {
    if (!exigirAdmin('restaurar um backup da nuvem')) { if (e && e.target) e.target.value = ''; return; }
    const input = e.target;
    if (!input.files[0]) return;
    if (!confirm('⚠️ Isso vai SUBSTITUIR os dados publicados na nuvem (que todo mundo vê) pelos desse arquivo de backup.\n\nTem certeza que deseja continuar?')) { input.value = ''; return; }

    const leitor = new FileReader();
    leitor.onload = async (ev) => {
        try {
            const dados = JSON.parse(ev.target.result);
            let resumo = [];
            for (const tabela of TABELAS_NUVEM) {
                if (dados[tabela] && dados[tabela].length) {
                    const r = await sincronizarTabelaSupabase(tabela, dados[tabela]);
                    resumo.push(`${r.publicados} em ${tabela}`);
                }
            }
            await supabaseClient.from('metadados_sistema').upsert({ id: 'global', ultima_publicacao: new Date().toISOString() });
            showToast(`<i class="fas fa-check"></i> Backup restaurado: ${resumo.join(' + ')}!`);
            // Dados que só existiam no navegador de quem fez o backup (histórico de lotes etc.): restaura só se a pessoa quiser
            const nav = dados._navegador && typeof dados._navegador === 'object' ? Object.keys(dados._navegador) : [];
            if (nav.length && confirm(`Esse backup também tem ${nav.length} item(ns) que ficam só no navegador (histórico de lotes, preferências, importações não publicadas...).\n\nRestaurar esses dados NESTE navegador também? Isso substitui o que existe aqui com o mesmo nome.`)) {
                nav.forEach(k => { try { localStorage.setItem(k, dados._navegador[k]); } catch (e) { /* ignora */ } });
                showToast('<i class="fas fa-check"></i> Dados do navegador restaurados. Recarregando...');
                setTimeout(() => location.reload(), 1500);
            }
        } catch (err) {
            registrarLogDebug('error', ['Falha ao restaurar backup da nuvem: ' + err.message]);
            showToast('<i class="fas fa-triangle-exclamation"></i> Falha ao restaurar. Arquivo pode estar corrompido ou não ser um backup da nuvem. Veja o console.', true);
        } finally {
            input.value = '';
        }
    };
    leitor.readAsText(input.files[0]);
}
