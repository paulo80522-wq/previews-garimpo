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

const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  validateEmailGate,
  getProductionSitePath,
  openProductionSiteInBrowser,
  generateApprovalPanel,
  getBuildApproval,
  setBuildApproval,
  validateBuildApproval,
  assertBuildApproved,
  normalizeBuildDecision,
  BUILD_DECISION_PENDING,
  BUILD_DECISION_APPROVED,
  BUILD_DECISION_REJECTED,
  BUILD_STATUS_PENDING,
  BUILD_STATUS_APPROVED,
  BUILD_STATUS_REJECTED
} = require('./dispatcher');

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
  // TESTE 11: Ausência de buildApproval no manifesto => PENDENTE (decision: 'PENDING')
  // --------------------------------------------------------------------------
  {
    const mockManifest = getBaseApprovedManifest();
    mockManifest.projectSlug = 'projeto-teste-aurora';
    delete mockManifest.buildApproval;

    const approval = getBuildApproval('projeto-teste-aurora', {
      manifestOverride: mockManifest
    });

    const passed = (approval.approved === false) && (approval.decision === 'PENDING') && (approval.status === 'PENDENTE') && (approval.decisionBy === null);
    results.push({
      testNumber: 11,
      name: 'Ausência de buildApproval => PENDENTE (decision: PENDING)',
      expected: 'approved: false, decision: PENDING, status: PENDENTE, decisionBy: null',
      actual: `approved: ${approval.approved} | decision: ${approval.decision} | status: ${approval.status} | decisionBy: ${approval.decisionBy}`,
      passed
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 12: Aprovação explícita => APPROVED (decision: 'APPROVED', status: 'APROVADA')
  // --------------------------------------------------------------------------
  {
    const mockManifest = getBaseApprovedManifest();
    mockManifest.projectSlug = 'projeto-teste-aurora';
    const res = setBuildApproval('projeto-teste-aurora', 'APPROVED', {
      manifestOverride: mockManifest,
      approver: 'Paulo Nunes',
      timestamp: '2026-09-05T20:00:00.000Z',
      updatePanel: false
    });

    const mockManifestBool = getBaseApprovedManifest();
    mockManifestBool.projectSlug = 'projeto-teste-aurora';
    const resBool = setBuildApproval('projeto-teste-aurora', true, {
      manifestOverride: mockManifestBool,
      approver: 'Paulo Nunes',
      timestamp: '2026-09-05T20:00:00.000Z',
      updatePanel: false
    });

    const passed = (res.approved === true) && (res.decision === 'APPROVED') && (res.status === 'APROVADA') && (res.decisionBy === 'Paulo Nunes') &&
                   (resBool.approved === true) && (resBool.decision === 'APPROVED') && (resBool.status === 'APROVADA');
    results.push({
      testNumber: 12,
      name: 'Aprovação explícita (--approve-build ou true) => APPROVED / APROVADA',
      expected: 'approved: true, decision: APPROVED, status: APROVADA, decisionBy: Paulo Nunes',
      actual: `approved: ${res.approved} | decision: ${res.decision} | status: ${res.status} | boolApproved: ${resBool.approved}`,
      passed
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 13: Rejeição explícita => REJECTED (decision: 'REJECTED', status: 'REJEITADA')
  // --------------------------------------------------------------------------
  {
    const mockManifest = getBaseApprovedManifest();
    mockManifest.projectSlug = 'projeto-teste-aurora';
    const res = setBuildApproval('projeto-teste-aurora', 'REJECTED', {
      manifestOverride: mockManifest,
      approver: 'Paulo Nunes',
      timestamp: '2026-09-05T20:01:00.000Z',
      updatePanel: false
    });

    const mockManifestBool = getBaseApprovedManifest();
    mockManifestBool.projectSlug = 'projeto-teste-aurora';
    const resBool = setBuildApproval('projeto-teste-aurora', false, {
      manifestOverride: mockManifestBool,
      approver: 'Paulo Nunes',
      timestamp: '2026-09-05T20:01:00.000Z',
      updatePanel: false
    });

    const passed = (res.approved === false) && (res.decision === 'REJECTED') && (res.status === 'REJEITADA') && (res.decisionBy === 'Paulo Nunes') &&
                   (resBool.approved === false) && (resBool.decision === 'REJECTED') && (resBool.status === 'REJEITADA');
    results.push({
      testNumber: 13,
      name: 'Rejeição explícita (--reject-build ou false) => REJECTED / REJEITADA',
      expected: 'approved: false, decision: REJECTED, status: REJEITADA, decisionBy: Paulo Nunes',
      actual: `approved: ${res.approved} | decision: ${res.decision} | status: ${res.status} | boolRejected: ${!resBool.approved}`,
      passed
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 14: Persistência real no manifest.json (gravação e leitura física em disco temporário)
  // --------------------------------------------------------------------------
  {
    const tmpBaseDir = path.join(__dirname, 'scratch_test_persistence');
    const testSlug = 'teste-persistencia-temp';
    const testProjectDir = path.join(tmpBaseDir, testSlug);
    const testManifestPath = path.join(testProjectDir, 'manifest.json');

    let passed = false;
    let actualMsg = '';

    try {
      if (!fs.existsSync(testProjectDir)) {
        fs.mkdirSync(testProjectDir, { recursive: true });
      }

      const initialManifest = {
        projectName: 'Teste Persistência',
        projectSlug: testSlug,
        version: 'v1'
      };
      fs.writeFileSync(testManifestPath, JSON.stringify(initialManifest, null, 2), 'utf8');

      // Grava aprovação no disco real
      setBuildApproval(testSlug, 'APPROVED', {
        baseDir: tmpBaseDir,
        approver: 'Paulo Nunes',
        timestamp: '2026-09-05T21:00:00.000Z',
        updatePanel: false
      });

      // Leitura física do arquivo gravado
      const rawWritten = JSON.parse(fs.readFileSync(testManifestPath, 'utf8'));
      const persistedInRaw = (rawWritten.buildApproval && rawWritten.buildApproval.decision === 'APPROVED' && rawWritten.buildApproval.approved === true);

      // Leitura via getBuildApproval apontando para baseDir
      const readApproval = getBuildApproval(testSlug, { baseDir: tmpBaseDir });
      const readMatches = (readApproval.approved === true && readApproval.decision === 'APPROVED' && readApproval.decisionBy === 'Paulo Nunes');

      passed = persistedInRaw && readMatches;
      actualMsg = `persistedInRaw: ${persistedInRaw} | readMatches: ${readMatches} | decision: ${readApproval.decision}`;
    } catch (err) {
      actualMsg = `Erro no teste de persistência: ${err.message}`;
    } finally {
      // Limpeza estrita do diretório temporário após o teste
      if (fs.existsSync(tmpBaseDir)) {
        fs.rmSync(tmpBaseDir, { recursive: true, force: true });
      }
    }

    results.push({
      testNumber: 14,
      name: 'Persistência no manifest.json (gravação e leitura física em disco temporário)',
      expected: 'persistedInRaw: true, decision: APPROVED, approved: true',
      actual: actualMsg,
      passed
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 15: Isolamento estrito entre dois projectSlugs (empresa-a vs empresa-b)
  // --------------------------------------------------------------------------
  {
    const manifestA = getBaseApprovedManifest();
    manifestA.projectSlug = 'empresa-a';
    delete manifestA.buildApproval;

    const manifestB = getBaseApprovedManifest();
    manifestB.projectSlug = 'empresa-b';
    delete manifestB.buildApproval;

    // Aprova exclusivamente empresa-a
    setBuildApproval('empresa-a', 'APPROVED', {
      manifestOverride: manifestA,
      approver: 'Paulo Nunes',
      updatePanel: false
    });

    // Consulta empresa-b
    const approvalB = getBuildApproval('empresa-b', {
      manifestOverride: manifestB
    });

    const passed = (manifestA.buildApproval.approved === true) &&
                   (manifestA.buildApproval.decision === 'APPROVED') &&
                   (approvalB.approved === false) &&
                   (approvalB.decision === 'PENDING');

    results.push({
      testNumber: 15,
      name: 'Isolamento estrito entre dois projectSlugs (empresa-a vs empresa-b)',
      expected: 'empresa-a: APPROVED, empresa-b: PENDING (zero contaminação cruzada)',
      actual: `empresa-a: ${manifestA.buildApproval.decision} | empresa-b: ${approvalB.decision} (approved: ${approvalB.approved})`,
      passed
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 16: Estado inválido rejeitado determinísticamente
  // --------------------------------------------------------------------------
  {
    const mockManifest = getBaseApprovedManifest();
    mockManifest.projectSlug = 'projeto-teste-aurora';
    delete mockManifest.buildApproval;

    let rejected = false;
    try {
      setBuildApproval('projeto-teste-aurora', 'ESTADO_INVALIDO_XYZ', {
        manifestOverride: mockManifest,
        updatePanel: false
      });
    } catch (err) {
      rejected = true;
    }

    const passed = (rejected === true) && (mockManifest.buildApproval === undefined);
    results.push({
      testNumber: 16,
      name: 'Estado inválido => rejeitado determinísticamente',
      expected: 'Lançamento de erro e manifest inalterado',
      actual: `rejected: ${rejected} | manifestHasApproval: ${Boolean(mockManifest.buildApproval)}`,
      passed
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 17: validateBuildApproval() retorna estrutura determinística
  // --------------------------------------------------------------------------
  {
    const mockManifest = getBaseApprovedManifest();
    mockManifest.projectSlug = 'projeto-teste-aurora';
    mockManifest.buildApproval = {
      approved: true,
      decision: 'APPROVED',
      decisionBy: 'Paulo Nunes',
      decisionAt: '2026-09-05T20:00:00.000Z'
    };

    const val = validateBuildApproval('projeto-teste-aurora', {
      manifestOverride: mockManifest
    });

    const passed = (val.valid === true) && (val.approved === true) && (val.decision === 'APPROVED') &&
                   (val.status === 'APROVADA') && (val.decisionBy === 'Paulo Nunes') && (val.projectSlug === 'projeto-teste-aurora');

    results.push({
      testNumber: 17,
      name: 'validateBuildApproval() retorna estrutura determinística completa',
      expected: 'valid: true, approved: true, decision: APPROVED, status: APROVADA, decisionBy: Paulo Nunes',
      actual: `valid: ${val.valid} | approved: ${val.approved} | decision: ${val.decision} | status: ${val.status}`,
      passed
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 18: Renderização no Painel em estado PENDENTE
  // --------------------------------------------------------------------------
  {
    const mockManifest = getBaseApprovedManifest();
    mockManifest.projectSlug = 'projeto-teste-painel';
    delete mockManifest.buildApproval;

    const panelRes = generateApprovalPanel('projeto-teste-painel', 'v1', {
      openInEditor: false,
      manifestOverride: mockManifest,
      gateResult: {
        allowed: false,
        status: 'PENDING_APPROVAL',
        manifest: mockManifest,
        recipient: 'teste@dominio.com',
        sender: 'paulonunes.consultoriadigital@gmail.com',
        subject: 'Assunto Teste',
        previewUrl: 'https://preview.exemplo.com',
        minutaPath: 'in-memory',
        bodyText: 'Mensagem teste',
        audit: {
          approvedBy: null,
          decision: 'PENDENTE'
        }
      }
    });

    const hasSection = panelRes.content.includes('## 🏗️ APROVAÇÃO DA CONSTRUÇÃO DO SITE');
    const hasPendingBadge = panelRes.content.includes('⏳ PENDENTE DE APROVAÇÃO');
    const hasPendingDecision = panelRes.content.includes('`PENDING`');
    const hasCommands = panelRes.content.includes('--approve-build') && panelRes.content.includes('--reject-build');

    const passed = hasSection && hasPendingBadge && hasPendingDecision && hasCommands;
    results.push({
      testNumber: 18,
      name: 'Painel reflete estado PENDENTE (⏳ PENDENTE DE APROVAÇÃO, PENDING e comandos)',
      expected: 'seção presente, badge ⏳ PENDENTE DE APROVAÇÃO, decisão PENDING e comandos CLI',
      actual: `section: ${hasSection} | pendingBadge: ${hasPendingBadge} | decision: ${hasPendingDecision} | commands: ${hasCommands}`,
      passed
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 19: Renderização no Painel em estado APROVADA
  // --------------------------------------------------------------------------
  {
    const mockManifest = getBaseApprovedManifest();
    mockManifest.projectSlug = 'projeto-teste-painel';
    mockManifest.buildApproval = {
      approved: true,
      decision: 'APPROVED',
      decisionBy: 'Paulo Nunes',
      decisionAt: '2026-09-05T20:00:00.000Z'
    };

    const panelRes = generateApprovalPanel('projeto-teste-painel', 'v1', {
      openInEditor: false,
      manifestOverride: mockManifest,
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
          decision: 'APROVAR'
        }
      }
    });

    const hasSection = panelRes.content.includes('## 🏗️ APROVAÇÃO DA CONSTRUÇÃO DO SITE');
    const hasApprovedBadge = panelRes.content.includes('🟢 APROVADA');
    const hasApprovedDecision = panelRes.content.includes('`APPROVED`');
    const hasApprover = panelRes.content.includes('Paulo Nunes');

    const passed = hasSection && hasApprovedBadge && hasApprovedDecision && hasApprover;
    results.push({
      testNumber: 19,
      name: 'Painel reflete estado APROVADA (🟢 APROVADA, APPROVED e Paulo Nunes)',
      expected: 'seção presente, badge 🟢 APROVADA, decisão APPROVED e aprovador Paulo Nunes',
      actual: `section: ${hasSection} | approvedBadge: ${hasApprovedBadge} | decision: ${hasApprovedDecision} | approver: ${hasApprover}`,
      passed
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 20: Renderização no Painel em estado REJEITADA
  // --------------------------------------------------------------------------
  {
    const mockManifest = getBaseApprovedManifest();
    mockManifest.projectSlug = 'projeto-teste-painel';
    mockManifest.buildApproval = {
      approved: false,
      decision: 'REJECTED',
      decisionBy: 'Paulo Nunes',
      decisionAt: '2026-09-05T20:01:00.000Z'
    };

    const panelRes = generateApprovalPanel('projeto-teste-painel', 'v1', {
      openInEditor: false,
      manifestOverride: mockManifest,
      gateResult: {
        allowed: false,
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
          decision: 'APROVAR'
        }
      }
    });

    const hasSection = panelRes.content.includes('## 🏗️ APROVAÇÃO DA CONSTRUÇÃO DO SITE');
    const hasRejectedBadge = panelRes.content.includes('🔴 REJEITADA');
    const hasRejectedDecision = panelRes.content.includes('`REJECTED`');

    const passed = hasSection && hasRejectedBadge && hasRejectedDecision;
    results.push({
      testNumber: 20,
      name: 'Painel reflete estado REJEITADA (🔴 REJEITADA e REJECTED)',
      expected: 'seção presente, badge 🔴 REJEITADA e decisão REJECTED',
      actual: `section: ${hasSection} | rejectedBadge: ${hasRejectedBadge} | decision: ${hasRejectedDecision}`,
      passed
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 21: Ausência de aprovação NÃO autoriza construção
  // --------------------------------------------------------------------------
  {
    const mockManifest = getBaseApprovedManifest();
    mockManifest.projectSlug = 'projeto-teste-aurora';
    delete mockManifest.buildApproval;

    const approval = getBuildApproval('projeto-teste-aurora', { manifestOverride: mockManifest });
    let blocked = false;
    try {
      assertBuildApproved('projeto-teste-aurora', { manifestOverride: mockManifest });
    } catch (e) {
      blocked = true;
    }

    const passed = (approval.approved === false) && (blocked === true);
    results.push({
      testNumber: 21,
      name: 'Ausência de aprovação NÃO autoriza construção (bloqueio determinístico)',
      expected: 'approved: false e bloqueio em assertBuildApproved',
      actual: `approved: ${approval.approved} | blocked: ${blocked}`,
      passed
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 22: assertBuildApproved bloqueia PENDENTE
  // --------------------------------------------------------------------------
  {
    const mockManifest = getBaseApprovedManifest();
    mockManifest.projectSlug = 'projeto-teste-aurora';
    mockManifest.buildApproval = {
      approved: false,
      decision: 'PENDING',
      decisionBy: null,
      decisionAt: null
    };

    let blocked = false;
    let errorCode = null;

    try {
      assertBuildApproved('projeto-teste-aurora', {
        manifestOverride: mockManifest
      });
    } catch (err) {
      blocked = true;
      errorCode = err.code;
    }

    const passed = (blocked === true) && (errorCode === 'BUILD_APPROVAL_REQUIRED');
    results.push({
      testNumber: 22,
      name: 'assertBuildApproved bloqueia status PENDENTE',
      expected: 'Lançamento de erro BUILD_APPROVAL_REQUIRED com bloqueio',
      actual: `blocked: ${blocked} | errorCode: ${errorCode}`,
      passed
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 23: assertBuildApproved bloqueia REJEITADA
  // --------------------------------------------------------------------------
  {
    const mockManifest = getBaseApprovedManifest();
    mockManifest.projectSlug = 'projeto-teste-aurora';
    mockManifest.buildApproval = {
      approved: false,
      decision: 'REJECTED',
      decisionBy: 'Paulo Nunes',
      decisionAt: '2026-09-05T20:00:00.000Z'
    };

    let blocked = false;
    let errorCode = null;

    try {
      assertBuildApproved('projeto-teste-aurora', {
        manifestOverride: mockManifest
      });
    } catch (err) {
      blocked = true;
      errorCode = err.code;
    }

    const passed = (blocked === true) && (errorCode === 'BUILD_APPROVAL_REQUIRED');
    results.push({
      testNumber: 23,
      name: 'assertBuildApproved bloqueia status REJEITADA',
      expected: 'Lançamento de erro BUILD_APPROVAL_REQUIRED com bloqueio',
      actual: `blocked: ${blocked} | errorCode: ${errorCode}`,
      passed
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 24: assertBuildApproved permite APROVADA
  // --------------------------------------------------------------------------
  {
    const mockManifest = getBaseApprovedManifest();
    mockManifest.projectSlug = 'projeto-teste-aurora';
    mockManifest.buildApproval = {
      approved: true,
      decision: 'APPROVED',
      decisionBy: 'Paulo Nunes',
      decisionAt: '2026-09-05T20:00:00.000Z'
    };

    let res = null;
    let errorOccurred = false;

    try {
      res = assertBuildApproved('projeto-teste-aurora', {
        manifestOverride: mockManifest
      });
    } catch (err) {
      errorOccurred = true;
    }

    const passed = (!errorOccurred) && (res && res.allowed === true) && (res.status === 'APROVADA') && (res.decision === 'APPROVED');
    results.push({
      testNumber: 24,
      name: 'assertBuildApproved permite status APROVADA',
      expected: 'allowed: true, status: APROVADA, decision: APPROVED, sem erros',
      actual: `allowed: ${res?.allowed} | status: ${res?.status} | decision: ${res?.decision} | error: ${errorOccurred}`,
      passed
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 25: Linguagem natural não altera aprovação (rejeição explícita)
  // --------------------------------------------------------------------------
  {
    const naturalPhrases = [
      'pode construir',
      'pode começar',
      'cliente aprovou',
      'pode implementar',
      'comece o site',
      'vamos construir',
      'pode avançar',
      'cliente autorizou'
    ];

    let allRejected = true;
    const mockManifest = getBaseApprovedManifest();
    mockManifest.projectSlug = 'projeto-teste-aurora';
    mockManifest.buildApproval = {
      approved: false,
      decision: 'PENDING',
      decisionBy: null,
      decisionAt: null
    };

    naturalPhrases.forEach(phrase => {
      try {
        setBuildApproval('projeto-teste-aurora', phrase, {
          manifestOverride: mockManifest,
          updatePanel: false
        });
        allRejected = false; // Se não lançou erro, falhou a proteção
      } catch (err) {
        // Sucesso: deve lançar erro bloqueando linguagem natural
      }
    });

    // Confirma que o manifesto NÃO foi alterado
    const unchanged = (mockManifest.buildApproval.approved === false) && (mockManifest.buildApproval.decision === 'PENDING');
    const passed = (allRejected === true) && unchanged;

    results.push({
      testNumber: 25,
      name: 'Proteção contra linguagem natural (frases do chat são bloqueadas)',
      expected: 'Todas as frases de chat bloqueadas e manifest inalterado (PENDING)',
      actual: `allRejected: ${allRejected} | manifestUnchanged: ${unchanged}`,
      passed
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 26: Regressão do Gate Comercial (--production-send e DRY-RUN intactos)
  // --------------------------------------------------------------------------
  {
    const gateRes = validateEmailGate('castlink-world', 'v2');
    const dryRunRes = (gateRes.allowed === true) && (gateRes.dryRun === true) && (gateRes.sender === 'paulonunes.consultoriadigital@gmail.com');

    const passed = dryRunRes;
    results.push({
      testNumber: 26,
      name: 'Regressão do Gate Comercial (DRY-RUN e regras de e-mail 100% intactas)',
      expected: 'allowed: true, dryRun: true, sender oficial preservado',
      actual: `allowed: ${gateRes.allowed} | dryRun: ${gateRes.dryRun} | sender: ${gateRes.sender}`,
      passed
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 27: Preservação funcional de --open-site
  // --------------------------------------------------------------------------
  {
    const siteInfo = getProductionSitePath('castlink-world');
    const hasHtml = fs.existsSync(siteInfo.indexPath);
    const passed = (siteInfo.exists === true) && hasHtml;
    results.push({
      testNumber: 27,
      name: 'Preservação funcional de --open-site',
      expected: 'exists: true com resolução física do index.html canônico',
      actual: `exists: ${siteInfo.exists} | path: ${siteInfo.indexPath}`,
      passed
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 28: Preservação funcional de --open-production-site
  // --------------------------------------------------------------------------
  {
    const siteInfo = getProductionSitePath('castlink-world');
    const passed = (typeof openProductionSiteInBrowser === 'function') && (siteInfo.exists === true);
    results.push({
      testNumber: 28,
      name: 'Preservação funcional de --open-production-site',
      expected: 'openProductionSiteInBrowser exportada e resolvendo caminho canônico',
      actual: `isFunction: ${typeof openProductionSiteInBrowser === 'function'} | exists: ${siteInfo.exists}`,
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
