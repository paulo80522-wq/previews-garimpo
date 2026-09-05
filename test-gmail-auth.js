/**
 * BATERIA DE TESTES DE AUTENTICAÇÃO GMAIL E INTEGRAÇÃO DO DISPATCHER
 * Garimpo Sites - Validação Controlada Local (SEM ENVIO REAL DE E-MAILS)
 * 
 * Executa rigorosamente os 10 testes solicitados:
 * A. Credenciais inexistentes
 * B. Credenciais inválidas
 * C. Token inexistente
 * D. Token válido (mock/simulado)
 * E. Escopo incorreto
 * F. Manifest PENDING_APPROVAL
 * G. Manifest APPROVED
 * H. Dry-run por padrão
 * I. Tentativa sem --production-send
 * J. Tentativa com --production-send mas Gate inválido (DEVE BLOQUEAR)
 */

const path = require('path');
const fs = require('fs');
const {
  REQUIRED_SCOPE,
  OFFICIAL_SENDER,
  checkCredentialsStatus,
  loadCredentials,
  loadToken,
  buildRfc2822Message,
  sendViaGmailApi
} = require('./gmail-client');

const { executeDispatcher, validateEmailGate } = require('./dispatcher');

async function runGmailAuthTestSuite() {
  console.log('========================================================================');
  console.log(' BATERIA DE TESTES: AUTENTICAÇÃO GMAIL & GATE DISPATCHER (A a J)');
  console.log(' Diretriz de Segurança: NENHUM E-MAIL REAL SERÁ ENVIADO');
  console.log('========================================================================\n');

  const results = [];

  function getBaseApprovedManifest() {
    return {
      projectName: 'CastLink',
      projectSlug: 'castlink-world',
      version: 'v2',
      status: 'APPROVED',
      approvedBy: 'Paulo Nunes',
      approvedAt: '2026-09-04T22:19:10.000Z',
      referenceEmail: 'castlink.agency@gmail.com',
      approvalGate: {
        decision: 'APROVAR',
        decisionBy: 'Paulo Nunes',
        decisionAt: '2026-09-04T22:19:10.000Z'
      },
      publicPreview: {
        isAvailable: true,
        commercialApproval: true,
        url: 'https://paulo80522-wq.github.io/previews-garimpo/castlink-world/v2/'
      }
    };
  }

  const validMinutaContent = `
# Minuta de Abordagem Estratégica (v2)
- E-mail de Referência: castlink.agency@gmail.com
- E-mail Oficial: paulonunes.consultoriadigital@gmail.com
**Assunto:** Proposta de Modernização CastLink World
**Mensagem:**
Prezados, segue proposta com base no protótipo visual v2 homologado.
`;

  // --------------------------------------------------------------------------
  // TESTE A: Credenciais inexistentes
  // --------------------------------------------------------------------------
  {
    const fakeDir = path.join(__dirname, 'temp_non_existent_credentials_dir');
    const status = checkCredentialsStatus({ credentialsDir: fakeDir });
    let errorCaught = false;
    try {
      loadCredentials({ credentialsDir: fakeDir });
    } catch (err) {
      errorCaught = true;
    }

    const passed = (status.credentialsExists === false) && errorCaught;
    results.push({
      id: 'A',
      name: 'Credenciais inexistentes',
      expected: 'credentialsExists: false e loadCredentials lança erro',
      actual: `credentialsExists: ${status.credentialsExists} | erroCapturado: ${errorCaught}`,
      passed
    });
  }

  // --------------------------------------------------------------------------
  // TESTE B: Credenciais inválidas
  // --------------------------------------------------------------------------
  {
    let errorCaught = false;
    try {
      loadCredentials({
        credentialsOverride: {
          installed: { client_id: '' } // ausência de client_secret e client_id vazio
        }
      });
    } catch (err) {
      errorCaught = true;
    }

    const status = checkCredentialsStatus({
      credentialsOverride: { installed: { invalid: true } }
    });

    const passed = errorCaught && (status.hasValidClientId === false);
    results.push({
      id: 'B',
      name: 'Credenciais inválidas',
      expected: 'Rejeição de credenciais sem client_id ou client_secret',
      actual: `hasValidClientId: ${status.hasValidClientId} | erroCapturado: ${errorCaught}`,
      passed
    });
  }

  // --------------------------------------------------------------------------
  // TESTE C: Token inexistente
  // --------------------------------------------------------------------------
  {
    const fakeDir = path.join(__dirname, 'temp_non_existent_token_dir');
    const status = checkCredentialsStatus({ credentialsDir: fakeDir });
    let errorCaught = false;
    try {
      loadToken({ credentialsDir: fakeDir });
    } catch (err) {
      errorCaught = true;
    }

    const passed = (status.tokenExists === false) && errorCaught;
    results.push({
      id: 'C',
      name: 'Token inexistente',
      expected: 'tokenExists: false e loadToken lança erro',
      actual: `tokenExists: ${status.tokenExists} | erroCapturado: ${errorCaught}`,
      passed
    });
  }

  // --------------------------------------------------------------------------
  // TESTE D: Token válido (mock seguro)
  // --------------------------------------------------------------------------
  {
    const validMockToken = {
      access_token: 'ya29.mock_valid_token_test_only',
      refresh_token: '1//0g_mock_refresh_token_test_only',
      scope: REQUIRED_SCOPE,
      token_type: 'Bearer',
      expiry_date: Date.now() + 3600000
    };

    const status = checkCredentialsStatus({ tokenOverride: validMockToken });
    const loaded = loadToken({ tokenOverride: validMockToken });

    const passed = (status.hasValidScope === true) &&
                   (status.hasRefreshToken === true) &&
                   (loaded.access_token === validMockToken.access_token);

    results.push({
      id: 'D',
      name: 'Token válido (mock seguro)',
      expected: 'hasValidScope: true, hasRefreshToken: true e token carregado',
      actual: `hasValidScope: ${status.hasValidScope} | hasRefreshToken: ${status.hasRefreshToken}`,
      passed
    });
  }

  // --------------------------------------------------------------------------
  // TESTE E: Escopo incorreto
  // --------------------------------------------------------------------------
  {
    const invalidScopeToken = {
      access_token: 'mock_token',
      refresh_token: 'mock_refresh',
      scope: 'https://www.googleapis.com/auth/gmail.readonly' // Escopo proibido / incorreto
    };

    const status = checkCredentialsStatus({ tokenOverride: invalidScopeToken });
    let errorCaught = false;
    try {
      loadToken({ tokenOverride: invalidScopeToken });
    } catch (err) {
      errorCaught = true;
    }

    const passed = (status.hasValidScope === false) && errorCaught;
    results.push({
      id: 'E',
      name: 'Escopo incorreto (não é gmail.send)',
      expected: 'hasValidScope: false e rejeição pelo loadToken',
      actual: `hasValidScope: ${status.hasValidScope} | escopos: ${status.scopesFound.join(', ')} | erroCapturado: ${errorCaught}`,
      passed
    });
  }

  // --------------------------------------------------------------------------
  // TESTE F: Manifest PENDING_APPROVAL -> Bloqueado pelo Gate
  // --------------------------------------------------------------------------
  {
    const pendingManifest = getBaseApprovedManifest();
    pendingManifest.status = 'PENDING_APPROVAL';
    pendingManifest.approvedBy = null;
    pendingManifest.approvedAt = null;

    const res = await executeDispatcher('castlink-world', 'v2', {
      manifestOverride: pendingManifest,
      minutaOverride: validMinutaContent
    });

    const passed = (res.allowed === false) &&
                   (res.dispatched === false) &&
                   (res.blockedByGate === true) &&
                   (res.reason === 'APPROVAL_REQUIRED');

    results.push({
      id: 'F',
      name: 'Manifest PENDING_APPROVAL',
      expected: 'allowed: false, dispatched: false, reason: APPROVAL_REQUIRED',
      actual: `allowed: ${res.allowed} | dispatched: ${res.dispatched} | reason: ${res.reason}`,
      passed
    });
  }

  // --------------------------------------------------------------------------
  // TESTE G: Manifest APPROVED -> Permitido pelo Gate
  // --------------------------------------------------------------------------
  {
    const approvedManifest = getBaseApprovedManifest();

    const res = await executeDispatcher('castlink-world', 'v2', {
      manifestOverride: approvedManifest,
      minutaOverride: validMinutaContent
    });

    const passed = (res.allowed === true) &&
                   (res.status === 'APPROVED') &&
                   (res.recipient === 'castlink.agency@gmail.com') &&
                   (res.sender === OFFICIAL_SENDER);

    results.push({
      id: 'G',
      name: 'Manifest APPROVED',
      expected: 'allowed: true, status: APPROVED, remetente e destinatário validados',
      actual: `allowed: ${res.allowed} | status: ${res.status} | sender: ${res.sender} | recipient: ${res.recipient}`,
      passed
    });
  }

  // --------------------------------------------------------------------------
  // TESTE H: Dry-run por padrão
  // --------------------------------------------------------------------------
  {
    const approvedManifest = getBaseApprovedManifest();

    // Sem especificar nada de produção
    const res = await executeDispatcher('castlink-world', 'v2', {
      manifestOverride: approvedManifest,
      minutaOverride: validMinutaContent
    });

    const passed = (res.allowed === true) &&
                   (res.dryRun === true) &&
                   (res.dispatched === false) &&
                   (res.dispatchMode === 'DRY_RUN_ONLY');

    results.push({
      id: 'H',
      name: 'Dry-run mantido como padrão',
      expected: 'dryRun: true, dispatched: false, mode: DRY_RUN_ONLY',
      actual: `dryRun: ${res.dryRun} | dispatched: ${res.dispatched} | mode: ${res.dispatchMode}`,
      passed
    });
  }

  // --------------------------------------------------------------------------
  // TESTE I: Tentativa sem --production-send
  // --------------------------------------------------------------------------
  {
    const approvedManifest = getBaseApprovedManifest();

    const res = await executeDispatcher('castlink-world', 'v2', {
      manifestOverride: approvedManifest,
      minutaOverride: validMinutaContent,
      productionSend: false // Explicitamente sem flag de produção
    });

    const passed = (res.allowed === true) &&
                   (res.dryRun === true) &&
                   (res.dispatched === false);

    results.push({
      id: 'I',
      name: 'Tentativa sem --production-send (permanece em dry-run)',
      expected: 'dryRun: true, dispatched: false (nunca envia sem flag)',
      actual: `dryRun: ${res.dryRun} | dispatched: ${res.dispatched}`,
      passed
    });
  }

  // --------------------------------------------------------------------------
  // TESTE J: Tentativa com --production-send mas Gate inválido (DEVE BLOQUEAR)
  // --------------------------------------------------------------------------
  {
    const pendingManifest = getBaseApprovedManifest();
    pendingManifest.status = 'PENDING_APPROVAL'; // Gate não aprovado!
    pendingManifest.approvedBy = null;

    const res = await executeDispatcher('castlink-world', 'v2', {
      manifestOverride: pendingManifest,
      minutaOverride: validMinutaContent,
      productionSend: true, // Usuário ou processo tentou forçar envio de produção
      dryRun: false
    });

    // CRÍTICO: Deve ser terminantemente bloqueado pelo Gate, antes do Gmail Client!
    const passed = (res.allowed === false) &&
                   (res.dispatched === false) &&
                   (res.blockedByGate === true) &&
                   (res.reason === 'APPROVAL_REQUIRED');

    results.push({
      id: 'J',
      name: 'Tentativa com --production-send mas Gate inválido (DEVE BLOQUEAR)',
      expected: 'BLOQUEIO TOTAL: allowed: false, dispatched: false, blockedByGate: true',
      actual: `allowed: ${res.allowed} | dispatched: ${res.dispatched} | blockedByGate: ${res.blockedByGate} | reason: ${res.reason}`,
      passed
    });
  }

  // --------------------------------------------------------------------------
  // TESTE K: Conformidade RFC 2047 no header From (Display Name com acentos)
  // --------------------------------------------------------------------------
  {
    const rfcMsg = buildRfc2822Message({
      to: 'destinatario@exemplo.com',
      subject: 'Teste de Validação RFC 2047',
      bodyText: 'Corpo de teste.'
    });

    const lines = rfcMsg.rawMessage.split('\r\n');
    const fromLine = lines.find(l => l.startsWith('From:'));
    const expectedBase64 = Buffer.from('Paulo Nunes | Consultoria de Presença Digital', 'utf8').toString('base64');
    const expectedHeader = `From: =?UTF-8?B?${expectedBase64}?= <${OFFICIAL_SENDER}>`;

    const matchEncodedWord = fromLine.match(/=\?UTF-8\?B\?([^\?]+)\?=/i);
    let decodedName = null;
    if (matchEncodedWord) {
      decodedName = Buffer.from(matchEncodedWord[1], 'base64').toString('utf8');
    }

    const passed = (fromLine === expectedHeader) &&
                   (decodedName === 'Paulo Nunes | Consultoria de Presença Digital');

    results.push({
      id: 'K',
      name: 'Codificação RFC 2047 no header From (preservação de "Presença")',
      expected: `From codificado com RFC 2047 decodificando para 'Paulo Nunes | Consultoria de Presença Digital'`,
      actual: `fromLine: ${fromLine} | decodificado: '${decodedName}'`,
      passed
    });
  }

  // --------------------------------------------------------------------------
  // EXIBIÇÃO CONSOLIDADA DOS RESULTADOS
  // --------------------------------------------------------------------------
  console.log('\n========================================================================');
  console.log(' RESULTADOS DA BATERIA DE TESTES DE AUTENTICAÇÃO GMAIL (A a K):');
  console.log('========================================================================');

  let totalPassed = 0;
  results.forEach(t => {
    const statusSymbol = t.passed ? '✓ PASSOU' : '✗ FALHOU';
    if (t.passed) totalPassed++;
    console.log(`[TESTE ${t.id}] ${t.name}`);
    console.log(`  Resultado: ${statusSymbol}`);
    console.log(`  Esperado:  ${t.expected}`);
    console.log(`  Obtido:    ${t.actual}\n`);
  });

  console.log('------------------------------------------------------------------------');
  console.log(`CONSOLIDAÇÃO: ${totalPassed} de ${results.length} testes passaram com sucesso.`);
  console.log('SEGURANÇA CONFIRMADA: NENHUM E-MAIL REAL FOI ENVIADO.');
  console.log('========================================================================\n');

  return {
    total: results.length,
    passed: totalPassed,
    allPassed: (totalPassed === results.length),
    results
  };
}

if (require.main === module) {
  runGmailAuthTestSuite().then(summary => {
    if (!summary.allPassed) {
      process.exitCode = 1;
    }
  }).catch(err => {
    console.error('Erro na execução da suíte de testes:', err);
    process.exitCode = 1;
  });
}

module.exports = { runGmailAuthTestSuite };
