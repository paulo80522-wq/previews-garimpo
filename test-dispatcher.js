/**
 * BATERIA DE TESTES CONTROLADOS - EXECUTOR DE E-MAIL (GATE DETERMINÍSTICO)
 * Garimpo Sites - Testes Obrigatórios de Segurança e Governança
 * 
 * Executa os 8 testes obrigatórios:
 * TESTE 1: PENDING_APPROVAL -> BLOQUEADO
 * TESTE 2: DRAFT -> BLOQUEADO
 * TESTE 3: APPROVED sem approvedBy correto -> BLOQUEADO
 * TESTE 4: APPROVED sem approvalGate.decision === "APROVAR" -> BLOQUEADO
 * TESTE 5: APPROVED + aprovação humana completa -> PERMITIDO EM DRY-RUN
 * TESTE 6: Destinatário ausente -> BLOQUEADO
 * TESTE 7: Minuta inexistente -> BLOQUEADO
 * TESTE 8: Remetente diferente de paulonunes.consultoriadigital@gmail.com -> BLOQUEADO
 */

const { validateEmailGate, getProductionSitePath, generateApprovalPanel } = require('./dispatcher');

function runTestSuite() {
  console.log('========================================================================');
  console.log(' INICIANDO BATERIA DE TESTES CONTROLADOS - EXECUTOR DE E-MAIL (GATE)');
  console.log('========================================================================\n');

  const results = [];

  // Helper para construir um manifest aprovado base
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
  // TESTE 1: PENDING_APPROVAL -> Resultado esperado: BLOQUEADO
  // --------------------------------------------------------------------------
  {
    const manifest = getBaseApprovedManifest();
    manifest.status = 'PENDING_APPROVAL';
    manifest.approvedBy = null;
    manifest.approvedAt = null;

    const res = validateEmailGate('castlink-world', 'v2', {
      manifestOverride: manifest,
      minutaOverride: validMinutaContent
    });

    const passed = (res.allowed === false) && (res.status === 'PENDING_APPROVAL');
    results.push({
      testNumber: 1,
      name: 'PENDING_APPROVAL',
      expected: 'BLOQUEADO (allowed: false, status: PENDING_APPROVAL)',
      actual: `allowed: ${res.allowed} | status: ${res.status} | reason: ${res.reason}`,
      passed
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 2: DRAFT -> Resultado esperado: BLOQUEADO
  // --------------------------------------------------------------------------
  {
    const manifest = getBaseApprovedManifest();
    manifest.status = 'DRAFT';
    manifest.approvedBy = null;
    manifest.approvedAt = null;
    manifest.approvalGate = { decision: 'PENDING_DECISION' };
    manifest.publicPreview.commercialApproval = false;

    const res = validateEmailGate('castlink-world', 'v2', {
      manifestOverride: manifest,
      minutaOverride: validMinutaContent
    });

    const passed = (res.allowed === false) && (res.status === 'DRAFT');
    results.push({
      testNumber: 2,
      name: 'DRAFT',
      expected: 'BLOQUEADO (allowed: false, status: DRAFT)',
      actual: `allowed: ${res.allowed} | status: ${res.status} | reason: ${res.reason}`,
      passed
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 3: APPROVED sem approvedBy correto -> Resultado: BLOQUEADO
  // --------------------------------------------------------------------------
  {
    const manifest = getBaseApprovedManifest();
    manifest.approvedBy = 'Agente LLM Não Autorizado';

    const res = validateEmailGate('castlink-world', 'v2', {
      manifestOverride: manifest,
      minutaOverride: validMinutaContent
    });

    const passed = (res.allowed === false) && (res.reason === 'INVALID_OR_MISSING_APPROVER');
    results.push({
      testNumber: 3,
      name: 'APPROVED sem approvedBy correto',
      expected: 'BLOQUEADO (reason: INVALID_OR_MISSING_APPROVER)',
      actual: `allowed: ${res.allowed} | reason: ${res.reason}`,
      passed
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 4: APPROVED sem approvalGate.decision === "APROVAR" -> Resultado: BLOQUEADO
  // --------------------------------------------------------------------------
  {
    const manifest = getBaseApprovedManifest();
    manifest.approvalGate.decision = 'PENDING_DECISION';

    const res = validateEmailGate('castlink-world', 'v2', {
      manifestOverride: manifest,
      minutaOverride: validMinutaContent
    });

    const passed = (res.allowed === false) && (res.reason === 'GATE_DECISION_NOT_APPROVED');
    results.push({
      testNumber: 4,
      name: 'APPROVED sem decision === APROVAR',
      expected: 'BLOQUEADO (reason: GATE_DECISION_NOT_APPROVED)',
      actual: `allowed: ${res.allowed} | reason: ${res.reason}`,
      passed
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 5: APPROVED + aprovação humana completa -> Resultado: PERMITIDO EM DRY-RUN
  // Testado com o artefato real castlink-world/v2
  // --------------------------------------------------------------------------
  {
    const res = validateEmailGate('castlink-world', 'v2');

    const passed = (res.allowed === true) && (res.dryRun === true) && (res.status === 'APPROVED');
    results.push({
      testNumber: 5,
      name: 'APPROVED + aprovação humana completa',
      expected: 'PERMITIDO EM DRY-RUN (allowed: true, dryRun: true, status: APPROVED)',
      actual: `allowed: ${res.allowed} | dryRun: ${res.dryRun} | status: ${res.status} | sender: ${res.sender} | recipient: ${res.recipient}`,
      passed
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 6: Destinatário ausente -> Resultado: BLOQUEADO
  // --------------------------------------------------------------------------
  {
    const manifest = getBaseApprovedManifest();
    manifest.referenceEmail = null;
    if (manifest.commercialReference) {
      delete manifest.commercialReference.recipientEmail;
    }

    const minutaSemDestinatario = `
# Minuta de Abordagem
- E-mail Oficial: paulonunes.consultoriadigital@gmail.com
**Assunto:** Proposta de Modernização
**Mensagem:**
Prezados, segue minuta sem indicação de e-mail de destino.
`;

    const res = validateEmailGate('castlink-world', 'v2', {
      manifestOverride: manifest,
      minutaOverride: minutaSemDestinatario
    });

    const passed = (res.allowed === false) && (res.reason === 'MISSING_OR_INVALID_RECIPIENT');
    results.push({
      testNumber: 6,
      name: 'Destinatário ausente',
      expected: 'BLOQUEADO (reason: MISSING_OR_INVALID_RECIPIENT)',
      actual: `allowed: ${res.allowed} | reason: ${res.reason}`,
      passed
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 7: Minuta inexistente -> Resultado: BLOQUEADO
  // --------------------------------------------------------------------------
  {
    const manifest = getBaseApprovedManifest();
    manifest.projectSlug = 'slug-sem-minuta-inexistente';

    const res = validateEmailGate('slug-sem-minuta-inexistente', 'v2', {
      manifestOverride: manifest,
      minutaOverride: '' // Minuta vazia / inexistente
    });

    const passed = (res.allowed === false) && (res.reason === 'MINUTA_NOT_FOUND_OR_EMPTY');
    results.push({
      testNumber: 7,
      name: 'Minuta inexistente ou vazia',
      expected: 'BLOQUEADO (reason: MINUTA_NOT_FOUND_OR_EMPTY)',
      actual: `allowed: ${res.allowed} | reason: ${res.reason}`,
      passed
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 8: Remetente diferente de paulonunes.consultoriadigital@gmail.com -> Resultado: BLOQUEADO
  // --------------------------------------------------------------------------
  {
    const manifest = getBaseApprovedManifest();

    const minutaComRemetenteInvalido = `
# Minuta de Abordagem
- E-mail de Referência: castlink.agency@gmail.com
- E-mail Oficial: hacker_ou_outro@dominio.com
**Assunto:** Proposta com Remetente Não Autorizado
**Mensagem:**
Prezados, mensagem de teste tentando usar remetente arbitrário.
`;

    const res = validateEmailGate('castlink-world', 'v2', {
      manifestOverride: manifest,
      minutaOverride: minutaComRemetenteInvalido,
      senderOverride: 'hacker_ou_outro@dominio.com'
    });

    const passed = (res.allowed === false) && (res.reason === 'UNAUTHORIZED_SENDER');
    results.push({
      testNumber: 8,
      name: 'Remetente diferente do oficial',
      expected: 'BLOQUEADO (reason: UNAUTHORIZED_SENDER)',
      actual: `allowed: ${res.allowed} | reason: ${res.reason}`,
      passed
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 9: Detecção de Site de Produção Existente (castlink-world)
  // --------------------------------------------------------------------------
  {
    const siteInfo = getProductionSitePath('castlink-world');
    const panelRes = generateApprovalPanel('castlink-world', 'v2', { openInEditor: false });

    const containsSiteSection = panelRes.content.includes('## 🌐 SITE DE PRODUÇÃO');
    const containsOpenLink = panelRes.content.includes('[ABRIR SITE DE PRODUÇÃO]');
    const containsCanonicalPath = panelRes.content.includes(siteInfo.indexPath);

    const passed = siteInfo.exists === true && containsSiteSection && containsOpenLink && containsCanonicalPath;
    results.push({
      testNumber: 9,
      name: 'Site de Produção Existente (castlink-world)',
      expected: 'exists: true, seção ## 🌐 SITE DE PRODUÇÃO e link dinâmico [ABRIR SITE DE PRODUÇÃO]',
      actual: `exists: ${siteInfo.exists} | section: ${containsSiteSection} | openLink: ${containsOpenLink}`,
      passed
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 10: Detecção de Site de Produção Ausente (oportunidade genérica sem site)
  // --------------------------------------------------------------------------
  {
    const siteInfo = getProductionSitePath('projeto-teste-sem-producao');
    const mockManifest = getBaseApprovedManifest();
    mockManifest.projectSlug = 'projeto-teste-sem-producao';

    const panelRes = generateApprovalPanel('projeto-teste-sem-producao', 'v1', {
      openInEditor: false,
      gateResult: {
        allowed: true,
        status: 'APPROVED',
        manifest: mockManifest,
        recipient: 'teste@dominio.com',
        sender: 'paulonunes.consultoriadigital@gmail.com',
        subject: 'Assunto Teste',
        previewUrl: 'https://preview.exemplo.com',
        minutaPath: 'in-memory',
        bodyText: 'Mensagem teste',
        audit: {
          approvedBy: 'Paulo Nunes',
          approvedAt: '2026-09-04T22:19:10.000Z',
          decision: 'APROVAR',
          commercialApproval: true
        }
      }
    });

    const containsSiteSection = panelRes.content.includes('## 🌐 SITE DE PRODUÇÃO');
    const containsUnavailableMsg = panelRes.content.includes('⚪ SITE DE PRODUÇÃO AINDA NÃO DISPONÍVEL');
    const doesNotContainOpenLink = !panelRes.content.includes('[ABRIR SITE DE PRODUÇÃO]');

    const passed = (siteInfo.exists === false) && containsSiteSection && containsUnavailableMsg && doesNotContainOpenLink;
    results.push({
      testNumber: 10,
      name: 'Site de Produção Ausente (genérico sem hardcode)',
      expected: 'exists: false, aviso de indisponibilidade e zero links quebrados',
      actual: `exists: ${siteInfo.exists} | unavailableMsg: ${containsUnavailableMsg} | noBrokenLink: ${doesNotContainOpenLink}`,
      passed
    });
  }

  // --------------------------------------------------------------------------
  // EXIBIÇÃO DO RELATÓRIO DOS TESTES
  // --------------------------------------------------------------------------
  let totalPassed = 0;
  console.log('RESULTADOS INDIVIDUAIS DOS TESTES:');
  console.log('------------------------------------------------------------------------');

  results.forEach(t => {
    const statusSymbol = t.passed ? '✓ PASSOU' : '✗ FALHOU';
    if (t.passed) totalPassed++;
    console.log(`[TESTE ${t.testNumber}] ${t.name}`);
    console.log(`  Resultado: ${statusSymbol}`);
    console.log(`  Esperado:  ${t.expected}`);
    console.log(`  Obtido:    ${t.actual}\n`);
  });

  console.log('------------------------------------------------------------------------');
  console.log(`CONSOLIDAÇÃO: ${totalPassed} de ${results.length} testes passaram com sucesso.`);
  console.log('========================================================================\n');

  return {
    total: results.length,
    passed: totalPassed,
    allPassed: (totalPassed === results.length),
    results
  };
}

if (require.main === module) {
  const summary = runTestSuite();
  if (!summary.allPassed) {
    process.exitCode = 1;
  }
}

module.exports = { runTestSuite };
