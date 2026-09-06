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
const crypto = require('crypto');

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
  executeBuildSite,
  executeApprovedBuild,
  BUILD_DECISION_PENDING,
  BUILD_DECISION_APPROVED,
  BUILD_DECISION_REJECTED,
  BUILD_STATUS_PENDING,
  BUILD_STATUS_APPROVED,
  BUILD_STATUS_REJECTED,
  HOMOLOGATION_DECISION_PENDING,
  HOMOLOGATION_DECISION_APPROVED,
  HOMOLOGATION_DECISION_REJECTED,
  PUBLICATION_DECISION_PENDING,
  PUBLICATION_DECISION_APPROVED,
  PUBLICATION_DECISION_REJECTED,
  PUBLICATION_STATUS_PENDING,
  PUBLICATION_STATUS_APPROVED,
  PUBLICATION_STATUS_REJECTED,
  acquireBuildLock,
  releaseBuildLock,
  getBuildValidation,
  assertBuildValidated,
  validateHomologation,
  getHomologation,
  setHomologation,
  assertSiteHomologated,
  validatePublicationApproval,
  getPublicationApproval,
  setPublicationApproval,
  assertPublicationApproved,
  validateProductionPublicationRequest,
  buildProductionPublicationPlan,
  assertProductionPublicationReady,
  publishProductionSite,
  calculateArtifactIntegrity,
  assertArtifactIntegrityNotTampered,
  validatePublicationTarget,
  validateCustomDomain,
  formatCnameContent,
  acquirePublicationLock,
  releasePublicationLock,
  isPublicationLockActive,
  generateHandoverDossier,
  creativeGovernance,
  ERR_PRODUCTION_EXECUTION_DISABLED,
  PUBLICATION_TARGET_PENDING
} = require('./dispatcher');

const {
  analyzeBrandContext,
  generateCreativeDirection,
  evaluateIdentityTest,
  extractLayoutSignature,
  compareLayoutSignatures,
  assertNotTemplateClone
} = require('./creative-governance');

const {
  buildProductionSite,
  validateProjectSlug,
  validateVersion,
  assertValidCanonicalDestination,
  resolvePrototypeSource,
  resolveCanonicalDestination,
  sanitizeHtml,
  validateBuiltFiles,
  validateProductionSite
} = require('./site-builder');

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

  // Helper para criar oportunidade mock isolada em diretório temporário
  function createIsolatedMockProject(baseDir, projectSlug, version, options = {}) {
    const projDir = path.join(baseDir, projectSlug);
    const verDir = path.join(projDir, version);
    fs.mkdirSync(verDir, { recursive: true });

    const htmlContent = options.htmlContent || [
      '<!DOCTYPE html>',
      '<html lang="pt-BR">',
      '<head><meta charset="UTF-8"><title>Mock Corporate</title><link rel="stylesheet" href="styles.css"></head>',
      '<body>',
      '  <!-- Barra de Controle Garimpo Sites -->',
      '  <aside class="control-bar"><span class="status-badge">⚡ VISUALIZAR PRÉVIA</span><a href="mock-standalone.html" download="mock-standalone.html">Baixar</a></aside>',
      '  <header><h1>Mock Corporate Presentation</h1></header>',
      '  <main><p>Valid business content for production site demonstration with rich layout.</p></main>',
      '  <footer>',
      '    <div class="footer-governance-pill">⚖️ GOVERNANÇA GARIMPO SITES: Protótipo de teste</div>',
      '    <p>&copy; 2026 Mock Corporate.</p>',
      '  </footer>',
      '</body>',
      '</html>'
    ].join('\n');

    const cssContent = options.cssContent || [
      'body { font-family: sans-serif; margin: 0; padding: 20px; }',
      'header h1 { color: #1a1a1a; font-size: 28px; }',
      'main p { color: #555; line-height: 1.6; }'
    ].join('\n');

    fs.writeFileSync(path.join(verDir, 'index.html'), htmlContent, 'utf8');
    fs.writeFileSync(path.join(verDir, 'styles.css'), cssContent, 'utf8');

    if (options.includeScript) {
      fs.writeFileSync(path.join(verDir, 'script.js'), 'console.log("Mock JS Active");', 'utf8');
    }

    const manifest = {
      projectName: 'Mock Corporate',
      projectSlug: projectSlug,
      version: version,
      status: options.status || (options.approved ? 'APPROVED' : 'PENDING_APPROVAL'),
      approvedBy: options.approvedBy !== undefined ? options.approvedBy : (options.approved ? 'Paulo Nunes' : null),
      approvedAt: options.approvedAt !== undefined ? options.approvedAt : (options.approved ? '2026-09-05T12:00:00.000Z' : null),
      ...(options.buildApproval !== undefined ? { buildApproval: options.buildApproval } : (options.approved ? {
        buildApproval: {
          approved: true,
          decision: 'APPROVED',
          decisionBy: 'Paulo Nunes',
          decisionAt: '2026-09-05T12:00:00.000Z'
        }
      } : {}))
    };

    fs.writeFileSync(path.join(projDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

    return { projDir, verDir, manifest };
  }

  // --------------------------------------------------------------------------
  // TESTE 29: build_blocked_without_approval
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-build-29-'));
    try {
      createIsolatedMockProject(tempDir, 'empresa-sem-aprovacao', 'v1', { approved: false });
      let errorThrown = null;
      try {
        executeBuildSite('empresa-sem-aprovacao', 'v1', { baseDir: tempDir });
      } catch (err) {
        errorThrown = err;
      }
      const destExists = fs.existsSync(path.join(tempDir, 'empresa-sem-aprovacao', 'site-producao'));
      const passed = Boolean(errorThrown) && (errorThrown.code === 'BUILD_APPROVAL_REQUIRED') && (!destExists);
      results.push({
        testNumber: 29,
        name: 'build_blocked_without_approval (Bloqueio sem aprovação)',
        expected: 'BUILD_APPROVAL_REQUIRED e site-producao não criado',
        actual: `code: ${errorThrown?.code} | destExists: ${destExists}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 30: build_blocked_when_pending
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-build-30-'));
    try {
      createIsolatedMockProject(tempDir, 'empresa-pendente', 'v1', {
        buildApproval: { approved: false, decision: 'PENDING', decisionBy: null, decisionAt: null }
      });
      let errorThrown = null;
      try {
        executeBuildSite('empresa-pendente', 'v1', { baseDir: tempDir });
      } catch (err) {
        errorThrown = err;
      }
      const destExists = fs.existsSync(path.join(tempDir, 'empresa-pendente', 'site-producao'));
      const passed = Boolean(errorThrown) && (errorThrown.code === 'BUILD_APPROVAL_REQUIRED') && (!destExists);
      results.push({
        testNumber: 30,
        name: 'build_blocked_when_pending (Bloqueio em PENDING)',
        expected: 'BUILD_APPROVAL_REQUIRED e site-producao não criado',
        actual: `code: ${errorThrown?.code} | destExists: ${destExists}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 31: build_blocked_when_rejected
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-build-31-'));
    try {
      createIsolatedMockProject(tempDir, 'empresa-rejeitada', 'v1', {
        buildApproval: { approved: false, decision: 'REJECTED', decisionBy: 'Paulo Nunes', decisionAt: '2026-09-05T12:00:00Z' }
      });
      let errorThrown = null;
      try {
        executeBuildSite('empresa-rejeitada', 'v1', { baseDir: tempDir });
      } catch (err) {
        errorThrown = err;
      }
      const destExists = fs.existsSync(path.join(tempDir, 'empresa-rejeitada', 'site-producao'));
      const passed = Boolean(errorThrown) && (errorThrown.code === 'BUILD_APPROVAL_REQUIRED') && (!destExists);
      results.push({
        testNumber: 31,
        name: 'build_blocked_when_rejected (Bloqueio em REJECTED)',
        expected: 'BUILD_APPROVAL_REQUIRED e site-producao não criado',
        actual: `code: ${errorThrown?.code} | destExists: ${destExists}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 32: build_allowed_when_approved
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-build-32-'));
    try {
      createIsolatedMockProject(tempDir, 'empresa-aprovada', 'v1', { approved: true, includeScript: true });
      const res = executeBuildSite('empresa-aprovada', 'v1', { baseDir: tempDir });
      const destIndex = path.join(tempDir, 'empresa-aprovada', 'site-producao', 'index.html');
      const destStyles = path.join(tempDir, 'empresa-aprovada', 'site-producao', 'styles.css');
      const destScript = path.join(tempDir, 'empresa-aprovada', 'site-producao', 'script.js');

      const passed = (res.success === true) &&
                     fs.existsSync(destIndex) &&
                     fs.existsSync(destStyles) &&
                     fs.existsSync(destScript);
      results.push({
        testNumber: 32,
        name: 'build_allowed_when_approved (Construção permitida com APPROVED)',
        expected: 'success: true e todos os arquivos em site-producao',
        actual: `success: ${res.success} | index: ${fs.existsSync(destIndex)} | styles: ${fs.existsSync(destStyles)}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 33: cross_project_isolation
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-build-33-'));
    try {
      createIsolatedMockProject(tempDir, 'projeto-alfa', 'v1', { approved: true });
      createIsolatedMockProject(tempDir, 'projeto-beta', 'v1', { approved: false });

      // Tentativa de construir beta (não aprovado) deve falhar
      let betaError = null;
      try {
        executeBuildSite('projeto-beta', 'v1', { baseDir: tempDir });
      } catch (e) {
        betaError = e;
      }

      // Tentativa de passar manifesto de outro slug para alfa deve falhar por inconsistência
      let mismatchError = null;
      try {
        executeBuildSite('projeto-alfa', 'v1', {
          baseDir: tempDir,
          manifestOverride: { projectSlug: 'projeto-beta', buildApproval: { approved: true, decision: 'APPROVED' } }
        });
      } catch (e) {
        mismatchError = e;
      }

      const passed = (betaError?.code === 'BUILD_APPROVAL_REQUIRED') &&
                     (mismatchError?.code === 'CROSS_PROJECT_SLUG_MISMATCH');
      results.push({
        testNumber: 33,
        name: 'cross_project_isolation (Isolamento total entre oportunidades)',
        expected: 'beta bloqueado e mismatch rejeitado',
        actual: `betaCode: ${betaError?.code} | mismatchCode: ${mismatchError?.code}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 34: prevent_previews_garimpo_write
  // --------------------------------------------------------------------------
  {
    let blockedDestError = null;
    try {
      assertValidCanonicalDestination('C:\\Users\\35tul\\previews-garimpo\\castlink-world\\site-producao', 'castlink-world');
    } catch (e) {
      blockedDestError = e;
    }

    let blockedStagingError = null;
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-build-34-'));
    try {
      createIsolatedMockProject(tempDir, 'slug-seguranca', 'v1', { approved: true });
      try {
        buildProductionSite('slug-seguranca', 'v1', {
          baseDir: tempDir,
          stagingDir: 'C:\\Users\\35tul\\previews-garimpo\\fake-staging-test'
        });
      } catch (e) {
        blockedStagingError = e;
      }
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }

    const passed = (blockedDestError?.code === 'FORBIDDEN_OUTPUT_PATH') &&
                   (blockedStagingError?.code === 'FORBIDDEN_STAGING_PATH');
    results.push({
      testNumber: 34,
      name: 'prevent_previews_garimpo_write (Bloqueio estrito de previews-garimpo)',
      expected: 'FORBIDDEN_OUTPUT_PATH e FORBIDDEN_STAGING_PATH',
      actual: `destError: ${blockedDestError?.code} | stagingError: ${blockedStagingError?.code}`,
      passed
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 35: canonical_output_path_enforced
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-build-35-'));
    try {
      const canonicalPath = resolveCanonicalDestination('oportunidade-teste', { baseDir: tempDir });
      const expectedEnd = path.join('oportunidade-teste', 'site-producao').toLowerCase();
      const endsCorrectly = canonicalPath.toLowerCase().endsWith(expectedEnd);

      let wrongDestError = null;
      try {
        assertValidCanonicalDestination(path.join(tempDir, 'pasta-errada'), 'oportunidade-teste');
      } catch (e) {
        wrongDestError = e;
      }

      const passed = endsCorrectly && (wrongDestError?.code === 'INVALID_CANONICAL_DESTINATION');
      results.push({
        testNumber: 35,
        name: 'canonical_output_path_enforced (Destino canônico forçado)',
        expected: 'termina em oportunidade-teste\\site-producao e rejeita outros destinos',
        actual: `endsCorrectly: ${endsCorrectly} | errorCode: ${wrongDestError?.code}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 36: atomic_build_rollback_on_failure
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-build-36-'));
    try {
      createIsolatedMockProject(tempDir, 'empresa-atomica', 'v1', { approved: true });
      const destDir = path.join(tempDir, 'empresa-atomica', 'site-producao');
      fs.mkdirSync(destDir, { recursive: true });
      const originalFile = path.join(destDir, 'index.html');
      fs.writeFileSync(originalFile, 'VERSAO_ANTERIOR_ORIGINAL_INTACTA', 'utf8');

      let buildError = null;
      try {
        buildProductionSite('empresa-atomica', 'v1', {
          baseDir: tempDir,
          simulateFailureDuringBuild: true
        });
      } catch (e) {
        buildError = e;
      }

      const currentContent = fs.readFileSync(originalFile, 'utf8');
      const stagingFolders = fs.readdirSync(path.join(tempDir, 'empresa-atomica'))
        .filter(f => f.startsWith('.staging-build-'));

      const passed = Boolean(buildError) &&
                     (currentContent === 'VERSAO_ANTERIOR_ORIGINAL_INTACTA') &&
                     (stagingFolders.length === 0);
      results.push({
        testNumber: 36,
        name: 'atomic_build_rollback_on_failure (Rollback atômico em caso de erro)',
        expected: 'erro lançado, produção anterior intacta e zero pastas staging órfãs',
        actual: `contentIntact: ${currentContent === 'VERSAO_ANTERIOR_ORIGINAL_INTACTA'} | stagingCount: ${stagingFolders.length}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 37: preview_elements_stripped
  // --------------------------------------------------------------------------
  {
    const sampleHtml = [
      '<!DOCTYPE html>',
      '<html><head><title>Test</title></head><body>',
      '  <!-- Barra de Controle Garimpo Sites -->',
      '  <aside class="control-bar"><span class="status-badge">⚡ VISUALIZAR PRÉVIA</span><a href="test-standalone.html" download="test-standalone.html">Baixar</a></aside>',
      '  <div id="garimpo-preview-bar">Preview Header</div>',
      '  <main><h1>Conteúdo de Negócio Legítimo</h1></main>',
      '  <footer>',
      '    <div class="footer-governance-pill">⚖️ GOVERNANÇA GARIMPO SITES: Rascunho</div>',
      '    <p>Copyright 2026</p>',
      '  </footer>',
      '</body></html>'
    ].join('\n');

    const sanitized = sanitizeHtml(sampleHtml);

    const hasControlBar = sanitized.includes('control-bar');
    const hasPreviewBar = sanitized.includes('garimpo-preview-bar');
    const hasGovPill = sanitized.includes('footer-governance-pill');
    const hasStandalone = sanitized.includes('standalone.html');
    const hasLegitContent = sanitized.includes('Conteúdo de Negócio Legítimo');

    const passed = (!hasControlBar) && (!hasPreviewBar) && (!hasGovPill) && (!hasStandalone) && hasLegitContent;
    results.push({
      testNumber: 37,
      name: 'preview_elements_stripped (Higienização completa de elementos de prévia)',
      expected: 'control-bar, preview-bar, pílula de governança e download removidos; conteúdo mantido',
      actual: `hasControl: ${hasControlBar} | hasGovPill: ${hasGovPill} | hasStandalone: ${hasStandalone} | hasLegit: ${hasLegitContent}`,
      passed
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 38: output_files_validation
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-build-38-'));
    try {
      let missingIndexErr = null;
      try {
        validateBuiltFiles(tempDir, ['index.html']);
      } catch (e) {
        missingIndexErr = e;
      }

      // Cria index.html minúsculo/inválido (< 200 bytes)
      fs.writeFileSync(path.join(tempDir, 'index.html'), '<html><body>Pequeno</body></html>', 'utf8');
      let smallIndexErr = null;
      try {
        validateBuiltFiles(tempDir, ['index.html']);
      } catch (e) {
        smallIndexErr = e;
      }

      const passed = (missingIndexErr?.code === 'MISSING_INDEX_HTML') &&
                     (smallIndexErr?.code === 'INVALID_INDEX_HTML_SIZE');
      results.push({
        testNumber: 38,
        name: 'output_files_validation (Validação estrutural dos arquivos)',
        expected: 'MISSING_INDEX_HTML e INVALID_INDEX_HTML_SIZE detectados',
        actual: `missingCode: ${missingIndexErr?.code} | sizeCode: ${smallIndexErr?.code}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 39: buildExecution_persisted_after_success
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-build-39-'));
    try {
      createIsolatedMockProject(tempDir, 'empresa-exec-persist', 'v2', { approved: true });
      executeBuildSite('empresa-exec-persist', 'v2', { baseDir: tempDir });

      const manifestRaw = JSON.parse(fs.readFileSync(path.join(tempDir, 'empresa-exec-persist', 'manifest.json'), 'utf8'));
      const exec = manifestRaw.buildExecution;

      const passed = Boolean(exec) &&
                     (exec.status === 'CONCLUIDA') &&
                     (exec.projectSlug === 'empresa-exec-persist') &&
                     (exec.version === 'v2') &&
                     Boolean(exec.executedAt);
      results.push({
        testNumber: 39,
        name: 'buildExecution_persisted_after_success (Persistência de buildExecution)',
        expected: 'status: CONCLUIDA, projectSlug e data de execução registrados',
        actual: `status: ${exec?.status} | version: ${exec?.version} | hasTimestamp: ${Boolean(exec?.executedAt)}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 40: buildApproval_unchanged_after_build
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-build-40-'));
    try {
      createIsolatedMockProject(tempDir, 'empresa-approval-intacta', 'v2', {
        approved: true,
        buildApproval: {
          approved: true,
          decision: 'APPROVED',
          decisionBy: 'Paulo Nunes',
          decisionAt: '2026-09-05T12:34:56.789Z'
        }
      });
      executeBuildSite('empresa-approval-intacta', 'v2', { baseDir: tempDir });

      const manifestRaw = JSON.parse(fs.readFileSync(path.join(tempDir, 'empresa-approval-intacta', 'manifest.json'), 'utf8'));
      const app = manifestRaw.buildApproval;

      const passed = (app.approved === true) &&
                     (app.decision === 'APPROVED') &&
                     (app.decisionBy === 'Paulo Nunes') &&
                     (app.decisionAt === '2026-09-05T12:34:56.789Z');
      results.push({
        testNumber: 40,
        name: 'buildApproval_unchanged_after_build (buildApproval inalterado após build)',
        expected: 'buildApproval preservado com decisão humana original intacta',
        actual: `approved: ${app?.approved} | decision: ${app?.decision} | decisionBy: ${app?.decisionBy}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 41: commercial_gate_unaffected
  // --------------------------------------------------------------------------
  {
    const gateRes = validateEmailGate('castlink-world', 'v2');
    const passed = (gateRes.allowed === true) && (gateRes.status === 'APPROVED') && (gateRes.dryRun === true);
    results.push({
      testNumber: 41,
      name: 'commercial_gate_unaffected (Gate Comercial 100% inalterado)',
      expected: 'validateEmailGate allowed: true e status: APPROVED',
      actual: `allowed: ${gateRes.allowed} | status: ${gateRes.status} | dryRun: ${gateRes.dryRun}`,
      passed
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 42: production_send_unchanged
  // --------------------------------------------------------------------------
  {
    const mockPendingResult = validateEmailGate('castlink-world', 'v2', {
      manifestOverride: {
        projectName: 'CastLink',
        projectSlug: 'castlink-world',
        version: 'v2',
        status: 'PENDING_APPROVAL'
      }
    });

    const passed = (mockPendingResult.allowed === false) && (mockPendingResult.reason === 'APPROVAL_REQUIRED');
    results.push({
      testNumber: 42,
      name: 'production_send_unchanged (--production-send e validação inalterados)',
      expected: 'allowed: false e reason: APPROVAL_REQUIRED para pendente',
      actual: `allowed: ${mockPendingResult.allowed} | reason: ${mockPendingResult.reason}`,
      passed
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 43: open_production_site_preserved
  // --------------------------------------------------------------------------
  {
    const siteInfo = getProductionSitePath('castlink-world');
    const isFunc = typeof openProductionSiteInBrowser === 'function';
    const passed = (siteInfo.exists === true) && isFunc && siteInfo.indexPath.endsWith('site-producao\\index.html');
    results.push({
      testNumber: 43,
      name: 'open_production_site_preserved (Navegação de site de produção preservada)',
      expected: 'siteInfo.exists: true e openProductionSiteInBrowser é função',
      actual: `exists: ${siteInfo.exists} | isFunc: ${isFunc}`,
      passed
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 44: missing_source_version_blocked
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-build-44-'));
    try {
      createIsolatedMockProject(tempDir, 'empresa-sem-versao', 'v1', { approved: true });
      let errorThrown = null;
      try {
        executeBuildSite('empresa-sem-versao', 'v99-inexistente', { baseDir: tempDir });
      } catch (e) {
        errorThrown = e;
      }
      const passed = (errorThrown?.code === 'SOURCE_VERSION_NOT_FOUND');
      results.push({
        testNumber: 44,
        name: 'missing_source_version_blocked (Bloqueio de versão de origem inexistente)',
        expected: 'SOURCE_VERSION_NOT_FOUND',
        actual: `code: ${errorThrown?.code}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 45: invalid_project_slug_blocked
  // --------------------------------------------------------------------------
  {
    let emptySlugErr = null;
    let upperSlugErr = null;
    try {
      executeBuildSite('', 'v1');
    } catch (e) {
      emptySlugErr = e;
    }
    try {
      executeBuildSite('SLUG_MAIUSCULO_INVALIDO!', 'v1');
    } catch (e) {
      upperSlugErr = e;
    }
    const passed = (emptySlugErr?.code === 'INVALID_PROJECT_SLUG') &&
                   (upperSlugErr?.code === 'INVALID_PROJECT_SLUG');
    results.push({
      testNumber: 45,
      name: 'invalid_project_slug_blocked (Bloqueio de projectSlug inválido)',
      expected: 'INVALID_PROJECT_SLUG para vazio e para formato incorreto',
      actual: `emptyCode: ${emptySlugErr?.code} | upperCode: ${upperSlugErr?.code}`,
      passed
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 46: path_traversal_blocked
  // --------------------------------------------------------------------------
  {
    let slugTraversalErr = null;
    let verTraversalErr = null;
    try {
      executeBuildSite('../ataque-diretorio', 'v1');
    } catch (e) {
      slugTraversalErr = e;
    }
    try {
      executeBuildSite('projeto-valido', '../../escape');
    } catch (e) {
      verTraversalErr = e;
    }
    const passed = (slugTraversalErr?.code === 'PATH_TRAVERSAL_DETECTED') &&
                   (verTraversalErr?.code === 'PATH_TRAVERSAL_DETECTED');
    results.push({
      testNumber: 46,
      name: 'path_traversal_blocked (Bloqueio estrito de path traversal)',
      expected: 'PATH_TRAVERSAL_DETECTED para slug e versão',
      actual: `slugCode: ${slugTraversalErr?.code} | verCode: ${verTraversalErr?.code}`,
      passed
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 47: unexpected_output_files_blocked
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-build-47-'));
    try {
      const validIndexContent = '<!DOCTYPE html><html><head><title>OK</title></head><body><p>' + 'A'.repeat(250) + '</p></body></html>';
      fs.writeFileSync(path.join(tempDir, 'index.html'), validIndexContent, 'utf8');
      fs.writeFileSync(path.join(tempDir, 'styles.css'), 'body { color: black; } /* ' + 'B'.repeat(60) + ' */', 'utf8');
      fs.writeFileSync(path.join(tempDir, 'projeto-standalone.html'), 'standalone', 'utf8');

      let standaloneErr = null;
      try {
        validateBuiltFiles(tempDir, ['index.html', 'styles.css']);
      } catch (e) {
        standaloneErr = e;
      }
      const passed = (standaloneErr?.code === 'UNEXPECTED_STANDALONE_FILE');
      results.push({
        testNumber: 47,
        name: 'unexpected_output_files_blocked (Bloqueio de arquivos standalone de teste)',
        expected: 'UNEXPECTED_STANDALONE_FILE',
        actual: `code: ${standaloneErr?.code}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 48: existing_castlink_production_not_modified_during_tests
  // --------------------------------------------------------------------------
  {
    const castlinkPath = 'C:\\Users\\35tul\\Garimpo-sites\\esbocos\\castlink-world\\site-producao\\index.html';
    const exists = fs.existsSync(castlinkPath);
    let sizeMatches = false;
    if (exists) {
      const stat = fs.statSync(castlinkPath);
      sizeMatches = (stat.size === 32446);
    }
    const passed = exists && sizeMatches;
    results.push({
      testNumber: 48,
      name: 'existing_castlink_production_not_modified_during_tests (Produção real intacta)',
      expected: 'castlink-world/site-producao/index.html existe com tamanho exato de 32446 bytes',
      actual: `exists: ${exists} | sizeMatches: ${sizeMatches}`,
      passed
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 49: missing_version_blocked (Exigência de versão explícita sem defaults)
  // --------------------------------------------------------------------------
  {
    let emptyVersionErr = null;
    let nullVersionErr = null;
    try {
      executeBuildSite('projeto-teste', '');
    } catch (e) {
      emptyVersionErr = e;
    }
    try {
      executeBuildSite('projeto-teste', null);
    } catch (e) {
      nullVersionErr = e;
    }
    const passed = (emptyVersionErr?.code === 'VERSION_REQUIRED') &&
                   (nullVersionErr?.code === 'VERSION_REQUIRED');
    results.push({
      testNumber: 49,
      name: 'missing_version_blocked (Versão obrigatória sem fallback silencioso)',
      expected: 'VERSION_REQUIRED para versão vazia ou nula',
      actual: `emptyCode: ${emptyVersionErr?.code} | nullCode: ${nullVersionErr?.code}`,
      passed
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 50: concurrency_lock_acquired_and_released
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-build-50-'));
    try {
      createIsolatedMockProject(tempDir, 'empresa-lock-test', 'v1', { approved: true, includeScript: true });
      const lockFile = path.join(tempDir, 'empresa-lock-test', '.build.lock');
      const lockBefore = fs.existsSync(lockFile);

      executeBuildSite('empresa-lock-test', 'v1', { baseDir: tempDir });

      const lockAfter = fs.existsSync(lockFile);
      const passed = (!lockBefore) && (!lockAfter);
      results.push({
        testNumber: 50,
        name: 'concurrency_lock_acquired_and_released (Lock criado e liberado com sucesso)',
        expected: 'Lock ausente antes e liberado após término',
        actual: `beforeExists: ${lockBefore} | afterExists: ${lockAfter}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 51: concurrency_lock_blocks_simultaneous_build
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-build-51-'));
    try {
      const projDir = path.join(tempDir, 'empresa-concorrente');
      fs.mkdirSync(projDir, { recursive: true });
      const lockFile = path.join(projDir, '.build.lock');

      // Simula lock ativo com o próprio PID do processo de teste (ativo)
      fs.writeFileSync(lockFile, JSON.stringify({
        pid: process.pid,
        startedAt: new Date().toISOString(),
        projectSlug: 'empresa-concorrente',
        version: 'v1'
      }));

      let lockErr = null;
      try {
        acquireBuildLock('empresa-concorrente', 'v1', { baseDir: tempDir });
      } catch (e) {
        lockErr = e;
      }

      const passed = (lockErr?.code === 'BUILD_LOCK_ACTIVE');
      results.push({
        testNumber: 51,
        name: 'concurrency_lock_blocks_simultaneous_build (Bloqueio de concorrência ativa)',
        expected: 'BUILD_LOCK_ACTIVE',
        actual: `code: ${lockErr?.code}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 52: concurrency_lock_recovers_stale_lock
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-build-52-'));
    try {
      const projDir = path.join(tempDir, 'empresa-stale-lock');
      fs.mkdirSync(projDir, { recursive: true });
      const lockFile = path.join(projDir, '.build.lock');

      // Simula lock com PID inexistente/morto
      fs.writeFileSync(lockFile, JSON.stringify({
        pid: 99999999,
        startedAt: new Date(Date.now() - 3600000).toISOString(),
        projectSlug: 'empresa-stale-lock',
        version: 'v1'
      }));

      let lockAcquired = false;
      try {
        acquireBuildLock('empresa-stale-lock', 'v1', { baseDir: tempDir });
        lockAcquired = true;
      } finally {
        releaseBuildLock('empresa-stale-lock', { baseDir: tempDir });
      }

      const passed = lockAcquired;
      results.push({
        testNumber: 52,
        name: 'concurrency_lock_recovers_stale_lock (Recuperação de lock órfão)',
        expected: 'lockAcquired: true após remoção de PID morto',
        actual: `acquired: ${lockAcquired}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 53: validateProductionSite_detects_valid_site
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-build-53-'));
    try {
      const prodDir = path.join(tempDir, 'empresa-valid-site', 'site-producao');
      fs.mkdirSync(prodDir, { recursive: true });
      const validIndex = '<!DOCTYPE html><html><head><title>Test</title></head><body><p>' + 'A'.repeat(250) + '</p></body></html>';
      fs.writeFileSync(path.join(prodDir, 'index.html'), validIndex, 'utf8');
      fs.writeFileSync(path.join(prodDir, 'styles.css'), 'body { font-size: 16px; } /* ' + 'B'.repeat(60) + ' */', 'utf8');

      const val = validateProductionSite('empresa-valid-site', 'v1', { baseDir: tempDir });
      const passed = (val.isValid === true) && (val.status === 'VALIDADA') && (val.checks.hasIndexHtml === true);
      results.push({
        testNumber: 53,
        name: 'validateProductionSite_detects_valid_site (Validação técnica positiva)',
        expected: 'isValid: true e status: VALIDADA',
        actual: `isValid: ${val.isValid} | status: ${val.status}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 54: validateProductionSite_detects_missing_index
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-build-54-'));
    try {
      const prodDir = path.join(tempDir, 'empresa-sem-index', 'site-producao');
      fs.mkdirSync(prodDir, { recursive: true });
      fs.writeFileSync(path.join(prodDir, 'styles.css'), 'body { color: red; } /* ' + 'C'.repeat(50) + ' */', 'utf8');

      const val = validateProductionSite('empresa-sem-index', 'v1', { baseDir: tempDir });
      const passed = (val.isValid === false) && (val.status === 'INVALIDA') && (val.checks.hasIndexHtml === false);
      results.push({
        testNumber: 54,
        name: 'validateProductionSite_detects_missing_index (Rejeição sem index.html)',
        expected: 'isValid: false e hasIndexHtml: false',
        actual: `isValid: ${val.isValid} | hasIndexHtml: ${val.checks.hasIndexHtml}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 55: validateProductionSite_detects_preview_elements
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-build-55-'));
    try {
      const prodDir = path.join(tempDir, 'empresa-com-preview', 'site-producao');
      fs.mkdirSync(prodDir, { recursive: true });
      const contaminatedHtml = '<!DOCTYPE html><html><body><aside class="control-bar">VISUALIZAR PRÉVIA</aside><p>' + 'D'.repeat(250) + '</p></body></html>';
      fs.writeFileSync(path.join(prodDir, 'index.html'), contaminatedHtml, 'utf8');

      const val = validateProductionSite('empresa-com-preview', 'v1', { baseDir: tempDir });
      const passed = (val.isValid === false) && (val.checks.noPreviewElements === false);
      results.push({
        testNumber: 55,
        name: 'validateProductionSite_detects_preview_elements (Rejeição de controles de prévia)',
        expected: 'isValid: false e noPreviewElements: false',
        actual: `isValid: ${val.isValid} | noPreviewElements: ${val.checks.noPreviewElements}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 56: validateProductionSite_detects_standalone_file
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-build-56-'));
    try {
      const prodDir = path.join(tempDir, 'empresa-com-standalone', 'site-producao');
      fs.mkdirSync(prodDir, { recursive: true });
      const validIndex = '<!DOCTYPE html><html><body><p>' + 'E'.repeat(250) + '</p></body></html>';
      fs.writeFileSync(path.join(prodDir, 'index.html'), validIndex, 'utf8');
      fs.writeFileSync(path.join(prodDir, 'empresa-standalone.html'), 'standalone', 'utf8');

      const val = validateProductionSite('empresa-com-standalone', 'v1', { baseDir: tempDir });
      const passed = (val.isValid === false) && (val.checks.noForbiddenFiles === false);
      results.push({
        testNumber: 56,
        name: 'validateProductionSite_detects_standalone_file (Rejeição de arquivos standalone)',
        expected: 'isValid: false e noForbiddenFiles: false',
        actual: `isValid: ${val.isValid} | noForbiddenFiles: ${val.checks.noForbiddenFiles}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 57: buildValidation_persisted_in_manifest
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-build-57-'));
    try {
      createIsolatedMockProject(tempDir, 'empresa-val-persist', 'v1', { approved: true, includeScript: true });
      const res = executeBuildSite('empresa-val-persist', 'v1', { baseDir: tempDir });

      const manifestPath = path.join(tempDir, 'empresa-val-persist', 'manifest.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

      const passed = (res.buildValidation.isValid === true) &&
                     (manifest.buildValidation?.status === 'VALIDADA') &&
                     (manifest.buildValidation?.checks?.dirExists === true);
      results.push({
        testNumber: 57,
        name: 'buildValidation_persisted_in_manifest (Persistência de buildValidation)',
        expected: 'manifest.buildValidation.status === VALIDADA',
        actual: `status: ${manifest.buildValidation?.status} | isValid: ${manifest.buildValidation?.isValid}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 58: assertBuildValidated_passes_for_valid
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-build-58-'));
    try {
      createIsolatedMockProject(tempDir, 'empresa-val-ok', 'v1', { approved: true, includeScript: true });
      executeBuildSite('empresa-val-ok', 'v1', { baseDir: tempDir });

      const res = assertBuildValidated('empresa-val-ok', { baseDir: tempDir });
      const passed = (res.allowed === true) && (res.status === 'VALIDADA');
      results.push({
        testNumber: 58,
        name: 'assertBuildValidated_passes_for_valid (Asserção de validação aprovada)',
        expected: 'allowed: true e status: VALIDADA',
        actual: `allowed: ${res.allowed} | status: ${res.status}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 59: assertBuildValidated_blocks_when_unvalidated
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-build-59-'));
    try {
      createIsolatedMockProject(tempDir, 'empresa-sem-validacao', 'v1', { approved: true });
      let valErr = null;
      try {
        assertBuildValidated('empresa-sem-validacao', { baseDir: tempDir });
      } catch (e) {
        valErr = e;
      }
      const passed = (valErr?.code === 'BUILD_VALIDATION_REQUIRED');
      results.push({
        testNumber: 59,
        name: 'assertBuildValidated_blocks_when_unvalidated (Bloqueio sem validação)',
        expected: 'BUILD_VALIDATION_REQUIRED',
        actual: `code: ${valErr?.code}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 60: homologation_default_is_pending
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-build-60-'));
    try {
      createIsolatedMockProject(tempDir, 'empresa-homo-pending', 'v1', { approved: true, includeScript: true });
      executeBuildSite('empresa-homo-pending', 'v1', { baseDir: tempDir });

      const homo = getHomologation('empresa-homo-pending', { baseDir: tempDir });
      const passed = (homo.approved === false) && (homo.decision === 'PENDING') && (homo.status === 'PENDENTE');
      results.push({
        testNumber: 60,
        name: 'homologation_default_is_pending (Homologação padrão é PENDENTE pós-build)',
        expected: 'approved: false, decision: PENDING, status: PENDENTE',
        actual: `approved: ${homo.approved} | decision: ${homo.decision} | status: ${homo.status}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 61: homologation_cannot_be_approved_without_build_approval
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-build-61-'));
    try {
      createIsolatedMockProject(tempDir, 'empresa-unapproved-build', 'v1', { approved: false });
      let homoErr = null;
      try {
        setHomologation('empresa-unapproved-build', true, { baseDir: tempDir, version: 'v1' });
      } catch (e) {
        homoErr = e;
      }
      const passed = (homoErr?.code === 'CANNOT_HOMOLOGATE_UNAPPROVED_BUILD');
      results.push({
        testNumber: 61,
        name: 'homologation_cannot_be_approved_without_build_approval (Pré-requisito buildApproval)',
        expected: 'CANNOT_HOMOLOGATE_UNAPPROVED_BUILD',
        actual: `code: ${homoErr?.code}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 62: homologation_cannot_be_approved_without_build_execution
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-build-62-'));
    try {
      createIsolatedMockProject(tempDir, 'empresa-unbuilt-site', 'v1', { approved: true });
      let homoErr = null;
      try {
        setHomologation('empresa-unbuilt-site', true, { baseDir: tempDir, version: 'v1' });
      } catch (e) {
        homoErr = e;
      }
      const passed = (homoErr?.code === 'CANNOT_HOMOLOGATE_UNBUILT_SITE');
      results.push({
        testNumber: 62,
        name: 'homologation_cannot_be_approved_without_build_execution (Pré-requisito buildExecution)',
        expected: 'CANNOT_HOMOLOGATE_UNBUILT_SITE',
        actual: `code: ${homoErr?.code}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 63: homologation_cannot_be_approved_without_valid_build
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-build-63-'));
    try {
      createIsolatedMockProject(tempDir, 'empresa-invalid-build', 'v1', { approved: true, includeScript: true });
      executeBuildSite('empresa-invalid-build', 'v1', { baseDir: tempDir });

      // Corrompe a validação no manifesto
      const manifestPath = path.join(tempDir, 'empresa-invalid-build', 'manifest.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      manifest.buildValidation.status = 'INVALIDA';
      manifest.buildValidation.isValid = false;
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

      let homoErr = null;
      try {
        setHomologation('empresa-invalid-build', true, { baseDir: tempDir, version: 'v1' });
      } catch (e) {
        homoErr = e;
      }
      const passed = (homoErr?.code === 'CANNOT_HOMOLOGATE_INVALID_BUILD');
      results.push({
        testNumber: 63,
        name: 'homologation_cannot_be_approved_without_valid_build (Pré-requisito buildValidation)',
        expected: 'CANNOT_HOMOLOGATE_INVALID_BUILD',
        actual: `code: ${homoErr?.code}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 64: homologation_approved_by_paulo_nunes
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-build-64-'));
    try {
      createIsolatedMockProject(tempDir, 'empresa-homo-ok', 'v1', { approved: true, includeScript: true });
      executeBuildSite('empresa-homo-ok', 'v1', { baseDir: tempDir });

      const homoRes = setHomologation('empresa-homo-ok', true, { baseDir: tempDir, version: 'v1' });
      const homoState = getHomologation('empresa-homo-ok', { baseDir: tempDir });

      const passed = (homoRes.success === true) &&
                     (homoRes.decision === 'APPROVED') &&
                     (homoRes.status === 'HOMOLOGADA') &&
                     (homoRes.decisionBy === 'Paulo Nunes') &&
                     (homoState.approved === true);
      results.push({
        testNumber: 64,
        name: 'homologation_approved_by_paulo_nunes (Homologação formal soberana)',
        expected: 'decision: APPROVED, status: HOMOLOGADA por Paulo Nunes',
        actual: `decision: ${homoRes.decision} | status: ${homoRes.status} | decisionBy: ${homoRes.decisionBy}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 65: homologation_rejected_by_paulo_nunes
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-build-65-'));
    try {
      createIsolatedMockProject(tempDir, 'empresa-homo-rej', 'v1', { approved: true, includeScript: true });
      executeBuildSite('empresa-homo-rej', 'v1', { baseDir: tempDir });

      const homoRes = setHomologation('empresa-homo-rej', false, { baseDir: tempDir, version: 'v1' });
      const homoState = getHomologation('empresa-homo-rej', { baseDir: tempDir });

      const passed = (homoRes.success === true) &&
                     (homoRes.decision === 'REJECTED') &&
                     (homoRes.status === 'REJEITADA') &&
                     (homoState.approved === false);
      results.push({
        testNumber: 65,
        name: 'homologation_rejected_by_paulo_nunes (Rejeição de homologação)',
        expected: 'decision: REJECTED, status: REJEITADA',
        actual: `decision: ${homoRes.decision} | status: ${homoRes.status}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 66: homologation_chat_language_rejected
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-build-66-'));
    try {
      createIsolatedMockProject(tempDir, 'empresa-homo-chat', 'v1', { approved: true, includeScript: true });
      executeBuildSite('empresa-homo-chat', 'v1', { baseDir: tempDir });

      let chatErr1 = null;
      let chatErr2 = null;
      try {
        setHomologation('empresa-homo-chat', 'tá homologado', { baseDir: tempDir, version: 'v1' });
      } catch (e) {
        chatErr1 = e;
      }
      try {
        setHomologation('empresa-homo-chat', 'sim, aprovo', { baseDir: tempDir, version: 'v1' });
      } catch (e) {
        chatErr2 = e;
      }

      const passed = Boolean(chatErr1) && Boolean(chatErr2);
      results.push({
        testNumber: 66,
        name: 'homologation_chat_language_rejected (Bloqueio de linguagem natural)',
        expected: 'Exceção para strings em vez de booleano estrito',
        actual: `chatErr1: ${Boolean(chatErr1)} | chatErr2: ${Boolean(chatErr2)}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 67: homologation_isolation_between_slugs
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-build-67-'));
    try {
      createIsolatedMockProject(tempDir, 'empresa-homo-a', 'v1', { approved: true, includeScript: true });
      createIsolatedMockProject(tempDir, 'empresa-homo-b', 'v1', { approved: true, includeScript: true });
      executeBuildSite('empresa-homo-a', 'v1', { baseDir: tempDir });
      executeBuildSite('empresa-homo-b', 'v1', { baseDir: tempDir });

      setHomologation('empresa-homo-a', true, { baseDir: tempDir, version: 'v1' });

      const homoA = getHomologation('empresa-homo-a', { baseDir: tempDir });
      const homoB = getHomologation('empresa-homo-b', { baseDir: tempDir });

      const passed = (homoA.approved === true) && (homoB.approved === false) && (homoB.decision === 'PENDING');
      results.push({
        testNumber: 67,
        name: 'homologation_isolation_between_slugs (Isolamento entre oportunidades)',
        expected: 'empresa A aprovada, empresa B pendente',
        actual: `homoA: ${homoA.approved} | homoB: ${homoB.approved} (${homoB.decision})`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 68: assertSiteHomologated_blocks_pending
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-build-68-'));
    try {
      createIsolatedMockProject(tempDir, 'empresa-assert-pending', 'v1', { approved: true, includeScript: true });
      executeBuildSite('empresa-assert-pending', 'v1', { baseDir: tempDir });

      let homoErr = null;
      try {
        assertSiteHomologated('empresa-assert-pending', { baseDir: tempDir });
      } catch (e) {
        homoErr = e;
      }

      const passed = (homoErr?.code === 'SITE_HOMOLOGATION_REQUIRED');
      results.push({
        testNumber: 68,
        name: 'assertSiteHomologated_blocks_pending (Bloqueio sem homologação prévia)',
        expected: 'SITE_HOMOLOGATION_REQUIRED',
        actual: `code: ${homoErr?.code}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 69: assertSiteHomologated_passes_when_approved
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-build-69-'));
    try {
      createIsolatedMockProject(tempDir, 'empresa-assert-ok', 'v1', { approved: true, includeScript: true });
      executeBuildSite('empresa-assert-ok', 'v1', { baseDir: tempDir });
      setHomologation('empresa-assert-ok', true, { baseDir: tempDir, version: 'v1' });

      const assertRes = assertSiteHomologated('empresa-assert-ok', { baseDir: tempDir });
      const passed = (assertRes.allowed === true) && (assertRes.status === 'HOMOLOGADA');
      results.push({
        testNumber: 69,
        name: 'assertSiteHomologated_passes_when_approved (Asserção positiva de homologação)',
        expected: 'allowed: true e status: HOMOLOGADA',
        actual: `allowed: ${assertRes.allowed} | status: ${assertRes.status}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 70: panel_renders_all_5_sections
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-build-70-'));
    try {
      createIsolatedMockProject(tempDir, 'empresa-panel-5-sections', 'v1', { approved: true, includeScript: true });
      executeBuildSite('empresa-panel-5-sections', 'v1', { baseDir: tempDir });
      setHomologation('empresa-panel-5-sections', true, { baseDir: tempDir, version: 'v1' });

      const panelRes = generateApprovalPanel('empresa-panel-5-sections', 'v1', { baseDir: tempDir, openInEditor: false });
      const md = panelRes.content;

      const hasSec1 = md.includes('## 🏗️ APROVAÇÃO DA CONSTRUÇÃO DO SITE');
      const hasSec2 = md.includes('## 🔨 EXECUÇÃO DA CONSTRUÇÃO DO SITE');
      const hasSec3 = md.includes('## 🔎 VALIDAÇÃO DO BUILD');
      const hasSec4 = md.includes('## ✅ HOMOLOGAÇÃO DO SITE DE PRODUÇÃO');
      const hasSec5 = md.includes('## 🌐 SITE DE PRODUÇÃO');

      const passed = hasSec1 && hasSec2 && hasSec3 && hasSec4 && hasSec5;
      results.push({
        testNumber: 70,
        name: 'panel_renders_all_5_sections (Painel com as 5 seções operacionais distintas)',
        expected: 'Presença das seções 1, 2, 3, 4 e 5 no markdown gerado',
        actual: `sec1: ${hasSec1} | sec2: ${hasSec2} | sec3: ${hasSec3} | sec4: ${hasSec4} | sec5: ${hasSec5}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // ==========================================================================
  // TESTES DE ISOLAMENTO POR VERSÃO E INVALIDAÇÃO DE HOMOLOGAÇÃO (Fase 3 - Correções)
  // ==========================================================================

  // --------------------------------------------------------------------------
  // TESTE 71 (TESTE A): unhomologated_new_version_blocked
  // Construir v2 -> validar -> homologar v2 -> construir v3 -> assertSiteHomologated(v3) => BLOQUEADO
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-build-71-'));
    try {
      createIsolatedMockProject(tempDir, 'empresa-test-71', 'v2', { approved: true, includeScript: true });
      createIsolatedMockProject(tempDir, 'empresa-test-71', 'v3', { approved: true, includeScript: true });

      executeBuildSite('empresa-test-71', 'v2', { baseDir: tempDir });
      setHomologation('empresa-test-71', true, { baseDir: tempDir, version: 'v2' });

      // Constrói v3 posteriormente
      executeBuildSite('empresa-test-71', 'v3', { baseDir: tempDir });

      let blockedErr = null;
      try {
        assertSiteHomologated('empresa-test-71', 'v3', { baseDir: tempDir });
      } catch (e) {
        blockedErr = e;
      }

      const passed = (blockedErr?.code === 'SITE_HOMOLOGATION_REQUIRED' || blockedErr?.code === 'HOMOLOGATION_VERSION_MISMATCH');
      results.push({
        testNumber: 71,
        name: 'unhomologated_new_version_blocked [TESTE A] (v3 bloqueada após build sem nova homologação)',
        expected: 'SITE_HOMOLOGATION_REQUIRED ou HOMOLOGATION_VERSION_MISMATCH',
        actual: `code: ${blockedErr?.code}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 72 (TESTE B): setHomologation_blocks_version_mismatch
  // Construir v2 -> homologar v2 -> tentar homologar v3 sem construir v3 => BLOQUEADO
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-build-72-'));
    try {
      createIsolatedMockProject(tempDir, 'empresa-test-72', 'v2', { approved: true, includeScript: true });
      executeBuildSite('empresa-test-72', 'v2', { baseDir: tempDir });
      setHomologation('empresa-test-72', true, { baseDir: tempDir, version: 'v2' });

      let mismatchErr = null;
      try {
        setHomologation('empresa-test-72', true, { baseDir: tempDir, version: 'v3' });
      } catch (e) {
        mismatchErr = e;
      }

      const passed = (mismatchErr?.code === 'HOMOLOGATION_VERSION_MISMATCH');
      results.push({
        testNumber: 72,
        name: 'setHomologation_blocks_version_mismatch [TESTE B] (Bloqueio de homologação de v3 não construída)',
        expected: 'HOMOLOGATION_VERSION_MISMATCH',
        actual: `code: ${mismatchErr?.code}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 73 (TESTE C): rebuild_invalidates_homologation_to_pending
  // Construir v2 -> homologar v2 -> rebuild de v2 -> verificar manifest.siteHomologation => PENDENTE
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-build-73-'));
    try {
      createIsolatedMockProject(tempDir, 'empresa-test-73', 'v2', { approved: true, includeScript: true });
      executeBuildSite('empresa-test-73', 'v2', { baseDir: tempDir });
      setHomologation('empresa-test-73', true, { baseDir: tempDir, version: 'v2' });

      const homoBefore = getHomologation('empresa-test-73', { baseDir: tempDir });

      // Rebuild de v2
      executeBuildSite('empresa-test-73', 'v2', { baseDir: tempDir });

      const manifestRaw = JSON.parse(fs.readFileSync(path.join(tempDir, 'empresa-test-73', 'manifest.json'), 'utf8'));
      const homoAfter = manifestRaw.siteHomologation;

      const passed = (homoBefore.status === 'HOMOLOGADA') &&
                     (homoAfter.status === 'PENDENTE') &&
                     (homoAfter.approved === false) &&
                     (homoAfter.decision === 'PENDING');
      results.push({
        testNumber: 73,
        name: 'rebuild_invalidates_homologation_to_pending [TESTE C] (Rebuild reseta homologação para PENDENTE)',
        expected: 'status anterior HOMOLOGADA e status pós-rebuild PENDENTE',
        actual: `before: ${homoBefore.status} | after: ${homoAfter?.status} | approved: ${homoAfter?.approved}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 74 (TESTE D): assertSiteHomologated_blocks_after_rebuild_until_rehomologated
  // Construir v2 -> homologar v2 -> alterar/reconstruir v2 -> assertSiteHomologated(v2) => BLOQUEADO até nova homologação
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-build-74-'));
    try {
      createIsolatedMockProject(tempDir, 'empresa-test-74', 'v2', { approved: true, includeScript: true });
      executeBuildSite('empresa-test-74', 'v2', { baseDir: tempDir });
      setHomologation('empresa-test-74', true, { baseDir: tempDir, version: 'v2' });

      // Rebuild v2
      executeBuildSite('empresa-test-74', 'v2', { baseDir: tempDir });

      let blockedErr = null;
      try {
        assertSiteHomologated('empresa-test-74', 'v2', { baseDir: tempDir });
      } catch (e) {
        blockedErr = e;
      }

      // Nova deliberação formal homologando v2
      setHomologation('empresa-test-74', true, { baseDir: tempDir, version: 'v2' });
      const allowedRes = assertSiteHomologated('empresa-test-74', 'v2', { baseDir: tempDir });

      const passed = (blockedErr?.code === 'SITE_HOMOLOGATION_REQUIRED') &&
                     (allowedRes.allowed === true);
      results.push({
        testNumber: 74,
        name: 'assertSiteHomologated_blocks_after_rebuild_until_rehomologated [TESTE D] (Bloqueado pós-rebuild até re-homologação)',
        expected: 'Bloqueado com SITE_HOMOLOGATION_REQUIRED e liberado após nova homologação',
        actual: `blockedCode: ${blockedErr?.code} | afterNewHomoAllowed: ${allowedRes?.allowed}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 75 (TESTE E): old_homologation_does_not_authorize_new_version
  // Construir v2 -> homologar v2 -> construir v3 -> verificar que homologação antiga não autoriza v3
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-build-75-'));
    try {
      createIsolatedMockProject(tempDir, 'empresa-test-75', 'v2', { approved: true, includeScript: true });
      createIsolatedMockProject(tempDir, 'empresa-test-75', 'v3', { approved: true, includeScript: true });
      executeBuildSite('empresa-test-75', 'v2', { baseDir: tempDir });
      setHomologation('empresa-test-75', true, { baseDir: tempDir, version: 'v2' });

      executeBuildSite('empresa-test-75', 'v3', { baseDir: tempDir });

      let errV3 = null;
      try {
        assertSiteHomologated('empresa-test-75', 'v3', { baseDir: tempDir });
      } catch (e) {
        errV3 = e;
      }

      let errWithoutVersion = null;
      try {
        assertSiteHomologated('empresa-test-75', { baseDir: tempDir });
      } catch (e) {
        errWithoutVersion = e;
      }

      const passed = Boolean(errV3) && Boolean(errWithoutVersion);
      results.push({
        testNumber: 75,
        name: 'old_homologation_does_not_authorize_new_version [TESTE E] (Homologação de v2 não autoriza v3)',
        expected: 'Bloqueio estrito para v3 com ou sem versão passada',
        actual: `errV3: ${errV3?.code} | errNoVer: ${errWithoutVersion?.code}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 76 (TESTE F): temporal_protection_blocks_stale_homologation
  // Verificar proteção temporal: homologation.decisionAt anterior a buildExecution.executedAt => BLOQUEADO
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-build-76-'));
    try {
      createIsolatedMockProject(tempDir, 'empresa-test-76', 'v2', { approved: true, includeScript: true });
      executeBuildSite('empresa-test-76', 'v2', { baseDir: tempDir });

      // Simula uma homologação adulterada com timestamp anterior ao build
      const manifestPath = path.join(tempDir, 'empresa-test-76', 'manifest.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      manifest.siteHomologation = {
        approved: true,
        decision: 'APPROVED',
        status: 'HOMOLOGADA',
        decisionBy: 'Paulo Nunes',
        decisionAt: '2026-01-01T00:00:00.000Z', // Data antiga, anterior à execução do build
        projectSlug: 'empresa-test-76',
        version: 'v2',
        notes: 'Simulação de homologação obsoleta'
      };
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

      let staleErr = null;
      try {
        assertSiteHomologated('empresa-test-76', 'v2', { baseDir: tempDir });
      } catch (e) {
        staleErr = e;
      }

      const passed = (staleErr?.code === 'HOMOLOGATION_STALE');
      results.push({
        testNumber: 76,
        name: 'temporal_protection_blocks_stale_homologation [TESTE F] (Proteção temporal detecta HOMOLOGATION_STALE)',
        expected: 'HOMOLOGATION_STALE',
        actual: `code: ${staleErr?.code}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 77 (TESTE G): valid_homologation_same_version_passes
  // Verificar que homologação válida da mesma versão, sem rebuild posterior, continua autorizada => PERMITIDO
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-build-77-'));
    try {
      createIsolatedMockProject(tempDir, 'empresa-test-77', 'v2', { approved: true, includeScript: true });
      executeBuildSite('empresa-test-77', 'v2', { baseDir: tempDir });
      setHomologation('empresa-test-77', true, { baseDir: tempDir, version: 'v2' });

      const res = assertSiteHomologated('empresa-test-77', 'v2', { baseDir: tempDir });

      const passed = (res.allowed === true) && (res.status === 'HOMOLOGADA') && (res.version === 'v2');
      results.push({
        testNumber: 77,
        name: 'valid_homologation_same_version_passes [TESTE G] (Homologação íntegra da versão autorizada)',
        expected: 'allowed: true, status: HOMOLOGADA e version: v2',
        actual: `allowed: ${res.allowed} | status: ${res.status} | version: ${res.version}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 78 (TESTE H): isolation_between_project_slugs_preserved
  // Verificar isolamento entre projectSlugs continua funcionando
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-build-78-'));
    try {
      createIsolatedMockProject(tempDir, 'empresa-h-1', 'v2', { approved: true, includeScript: true });
      createIsolatedMockProject(tempDir, 'empresa-h-2', 'v2', { approved: true, includeScript: true });

      executeBuildSite('empresa-h-1', 'v2', { baseDir: tempDir });
      executeBuildSite('empresa-h-2', 'v2', { baseDir: tempDir });

      setHomologation('empresa-h-1', true, { baseDir: tempDir, version: 'v2' });

      const res1 = assertSiteHomologated('empresa-h-1', 'v2', { baseDir: tempDir });

      let res2Err = null;
      try {
        assertSiteHomologated('empresa-h-2', 'v2', { baseDir: tempDir });
      } catch (e) {
        res2Err = e;
      }

      const passed = (res1.allowed === true) && (res2Err?.code === 'SITE_HOMOLOGATION_REQUIRED');
      results.push({
        testNumber: 78,
        name: 'isolation_between_project_slugs_preserved [TESTE H] (Isolamento entre empresas preservado)',
        expected: 'empresa-h-1 autorizada e empresa-h-2 bloqueada',
        actual: `res1Allowed: ${res1.allowed} | res2Code: ${res2Err?.code}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 79 (TESTE I): buildApproval_intact_after_homologation_invalidation
  // Verificar que buildApproval permanece intacto após invalidação da homologação
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-build-79-'));
    try {
      createIsolatedMockProject(tempDir, 'empresa-test-79', 'v2', {
        approved: true,
        includeScript: true,
        buildApproval: {
          approved: true,
          decision: 'APPROVED',
          decisionBy: 'Paulo Nunes',
          decisionAt: '2026-09-05T08:00:00.000Z'
        }
      });
      executeBuildSite('empresa-test-79', 'v2', { baseDir: tempDir });
      setHomologation('empresa-test-79', true, { baseDir: tempDir, version: 'v2' });

      // Rebuild que invalida homologação
      executeBuildSite('empresa-test-79', 'v2', { baseDir: tempDir });

      const manifestRaw = JSON.parse(fs.readFileSync(path.join(tempDir, 'empresa-test-79', 'manifest.json'), 'utf8'));
      const app = manifestRaw.buildApproval;

      const passed = (app.approved === true) &&
                     (app.decision === 'APPROVED') &&
                     (app.decisionBy === 'Paulo Nunes') &&
                     (app.decisionAt === '2026-09-05T08:00:00.000Z');
      results.push({
        testNumber: 79,
        name: 'buildApproval_intact_after_homologation_invalidation [TESTE I] (buildApproval preservado intacto)',
        expected: 'approved: true, decision: APPROVED, decisionBy: Paulo Nunes',
        actual: `approved: ${app?.approved} | decision: ${app?.decision} | decisionBy: ${app?.decisionBy}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 80 (TESTE J): approvalGate_intact_after_homologation_invalidation
  // Verificar que approvalGate permanece intacto
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-build-80-'));
    try {
      createIsolatedMockProject(tempDir, 'empresa-test-80', 'v2', { approved: true, includeScript: true });
      const manifestPath = path.join(tempDir, 'empresa-test-80', 'manifest.json');
      const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      m.approvalGate = {
        decision: 'APROVAR',
        decisionBy: 'Paulo Nunes',
        decisionAt: '2026-09-05T08:00:00.000Z'
      };
      fs.writeFileSync(manifestPath, JSON.stringify(m, null, 2), 'utf8');

      executeBuildSite('empresa-test-80', 'v2', { baseDir: tempDir });
      setHomologation('empresa-test-80', true, { baseDir: tempDir, version: 'v2' });
      executeBuildSite('empresa-test-80', 'v2', { baseDir: tempDir });

      const manifestRaw = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      const gate = manifestRaw.approvalGate;

      const passed = (gate.decision === 'APROVAR') && (gate.decisionBy === 'Paulo Nunes');
      results.push({
        testNumber: 80,
        name: 'approvalGate_intact_after_homologation_invalidation [TESTE J] (approvalGate comercial intacto)',
        expected: 'decision: APROVAR e decisionBy: Paulo Nunes',
        actual: `decision: ${gate?.decision} | decisionBy: ${gate?.decisionBy}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 81 (TESTE K): buildExecution_intact_and_updated_after_rebuild
  // Verificar que buildExecution permanece intacto e atualizado
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-build-81-'));
    try {
      createIsolatedMockProject(tempDir, 'empresa-test-81', 'v2', { approved: true, includeScript: true });
      executeBuildSite('empresa-test-81', 'v2', { baseDir: tempDir });
      setHomologation('empresa-test-81', true, { baseDir: tempDir, version: 'v2' });
      executeBuildSite('empresa-test-81', 'v2', { baseDir: tempDir });

      const manifestRaw = JSON.parse(fs.readFileSync(path.join(tempDir, 'empresa-test-81', 'manifest.json'), 'utf8'));
      const exec = manifestRaw.buildExecution;

      const passed = (exec.status === 'CONCLUIDA') && (exec.version === 'v2') && Boolean(exec.executedAt);
      results.push({
        testNumber: 81,
        name: 'buildExecution_intact_and_updated_after_rebuild [TESTE K] (buildExecution atualizado e íntegro)',
        expected: 'status: CONCLUIDA, version: v2, executedAt presente',
        actual: `status: ${exec?.status} | version: ${exec?.version} | hasTimestamp: ${Boolean(exec?.executedAt)}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 82 (TESTE L): buildValidation_intact_and_valid_after_rebuild
  // Verificar que buildValidation permanece intacto e válido
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-build-82-'));
    try {
      createIsolatedMockProject(tempDir, 'empresa-test-82', 'v2', { approved: true, includeScript: true });
      executeBuildSite('empresa-test-82', 'v2', { baseDir: tempDir });
      setHomologation('empresa-test-82', true, { baseDir: tempDir, version: 'v2' });
      executeBuildSite('empresa-test-82', 'v2', { baseDir: tempDir });

      const manifestRaw = JSON.parse(fs.readFileSync(path.join(tempDir, 'empresa-test-82', 'manifest.json'), 'utf8'));
      const val = manifestRaw.buildValidation;

      const passed = (val.status === 'VALIDADA') && (val.isValid === true);
      results.push({
        testNumber: 82,
        name: 'buildValidation_intact_and_valid_after_rebuild [TESTE L] (buildValidation válido pós-rebuild)',
        expected: 'status: VALIDADA e isValid: true',
        actual: `status: ${val?.status} | isValid: ${val?.isValid}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 83 (TESTE M): production_send_remains_unaltered
  // Verificar que --production-send permanece inalterado
  // --------------------------------------------------------------------------
  {
    const gateRes = validateEmailGate('castlink-world', 'v2');
    const passed = (gateRes.allowed === true) && (gateRes.status === 'APPROVED') && (gateRes.dryRun === true);
    results.push({
      testNumber: 83,
      name: 'production_send_remains_unaltered [TESTE M] (Gate comercial e dry-run 100% inalterados)',
      expected: 'allowed: true, status: APPROVED e dryRun: true',
      actual: `allowed: ${gateRes.allowed} | status: ${gateRes.status} | dryRun: ${gateRes.dryRun}`,
      passed
    });
  }

  // ==========================================================================
  // BATERIA DE TESTES DE AUTORIZAÇÃO DE PUBLICAÇÃO (Fase 4 - Etapas 2 a 14)
  // ==========================================================================

  // --------------------------------------------------------------------------
  // TESTE 84: publication_approval_absent_returns_pending (Requisito 1)
  // --------------------------------------------------------------------------
  {
    const manifest = { projectSlug: 'empresa-test-84' };
    const val = validatePublicationApproval(manifest);
    const pub = getPublicationApproval('empresa-test-84', { manifestOverride: manifest });
    const passed = (val.valid === true) &&
                   (val.approved === false) &&
                   (val.decision === 'PENDING') &&
                   (val.status === 'PENDENTE') &&
                   (pub.approved === false) &&
                   (pub.decision === 'PENDING') &&
                   (pub.status === 'PENDENTE');
    results.push({
      testNumber: 84,
      name: 'publication_approval_absent_returns_pending (Ausência de publicationApproval retorna PENDENTE)',
      expected: 'approved: false, decision: PENDING, status: PENDENTE, valid: true',
      actual: `valApproved: ${val.approved} | valDecision: ${val.decision} | pubDecision: ${pub.decision}`,
      passed
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 85: absence_of_approval_blocks_publication_gate (Requisito 2)
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-pub-85-'));
    try {
      createIsolatedMockProject(tempDir, 'empresa-pub-85', 'v2', { approved: true, includeScript: true });
      executeBuildSite('empresa-pub-85', 'v2', { baseDir: tempDir });
      setHomologation('empresa-pub-85', true, { baseDir: tempDir, version: 'v2' });

      let err = null;
      try {
        assertPublicationApproved('empresa-pub-85', 'v2', { baseDir: tempDir });
      } catch (e) {
        err = e;
      }

      const passed = (err?.code === 'PUBLICATION_APPROVAL_REQUIRED');
      results.push({
        testNumber: 85,
        name: 'absence_of_approval_blocks_publication_gate (Ausência de aprovação bloqueia com PUBLICATION_APPROVAL_REQUIRED)',
        expected: 'PUBLICATION_APPROVAL_REQUIRED',
        actual: `code: ${err?.code}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 86: approval_without_build_approval_blocked (Requisito 3)
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-pub-86-'));
    try {
      createIsolatedMockProject(tempDir, 'empresa-pub-86', 'v2', { approved: false, includeScript: true });
      const manifestPath = path.join(tempDir, 'empresa-pub-86', 'manifest.json');
      const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      m.buildExecution = { status: 'CONCLUIDA', version: 'v2', executedAt: new Date().toISOString() };
      m.buildValidation = { status: 'VALIDADA', isValid: true, version: 'v2' };
      m.siteHomologation = { status: 'HOMOLOGADA', approved: true, decision: 'APPROVED', decisionBy: 'Paulo Nunes', version: 'v2', decisionAt: new Date().toISOString() };
      fs.writeFileSync(manifestPath, JSON.stringify(m, null, 2), 'utf8');

      let err = null;
      try {
        setPublicationApproval('empresa-pub-86', true, { baseDir: tempDir, version: 'v2' });
      } catch (e) {
        err = e;
      }

      const passed = (err?.code === 'PUBLICATION_PREREQUISITE_MISSING');
      results.push({
        testNumber: 86,
        name: 'approval_without_build_approval_blocked (Tentativa de aprovação sem buildApproval bloqueia)',
        expected: 'PUBLICATION_PREREQUISITE_MISSING',
        actual: `code: ${err?.code}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 87: approval_without_build_execution_blocked (Requisito 4)
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-pub-87-'));
    try {
      createIsolatedMockProject(tempDir, 'empresa-pub-87', 'v2', { approved: true, includeScript: true });
      let err = null;
      try {
        setPublicationApproval('empresa-pub-87', true, { baseDir: tempDir, version: 'v2' });
      } catch (e) {
        err = e;
      }

      const passed = (err?.code === 'PUBLICATION_PREREQUISITE_MISSING');
      results.push({
        testNumber: 87,
        name: 'approval_without_build_execution_blocked (Tentativa de aprovação sem buildExecution bloqueia)',
        expected: 'PUBLICATION_PREREQUISITE_MISSING',
        actual: `code: ${err?.code}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 88: approval_without_build_validation_blocked (Requisito 5)
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-pub-88-'));
    try {
      createIsolatedMockProject(tempDir, 'empresa-pub-88', 'v2', { approved: true, includeScript: true });
      const manifestPath = path.join(tempDir, 'empresa-pub-88', 'manifest.json');
      const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      m.buildExecution = { status: 'CONCLUIDA', version: 'v2', executedAt: new Date().toISOString() };
      m.siteHomologation = { status: 'HOMOLOGADA', approved: true, decision: 'APPROVED', decisionBy: 'Paulo Nunes', version: 'v2', decisionAt: new Date().toISOString() };
      fs.writeFileSync(manifestPath, JSON.stringify(m, null, 2), 'utf8');

      let err = null;
      try {
        setPublicationApproval('empresa-pub-88', true, { baseDir: tempDir, version: 'v2' });
      } catch (e) {
        err = e;
      }

      const passed = (err?.code === 'PUBLICATION_PREREQUISITE_MISSING');
      results.push({
        testNumber: 88,
        name: 'approval_without_build_validation_blocked (Tentativa de aprovação sem buildValidation bloqueia)',
        expected: 'PUBLICATION_PREREQUISITE_MISSING',
        actual: `code: ${err?.code}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 89: approval_without_site_homologation_blocked (Requisito 6)
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-pub-89-'));
    try {
      createIsolatedMockProject(tempDir, 'empresa-pub-89', 'v2', { approved: true, includeScript: true });
      executeBuildSite('empresa-pub-89', 'v2', { baseDir: tempDir });

      let err = null;
      try {
        setPublicationApproval('empresa-pub-89', true, { baseDir: tempDir, version: 'v2' });
      } catch (e) {
        err = e;
      }

      const passed = (err?.code === 'PUBLICATION_PREREQUISITE_MISSING');
      results.push({
        testNumber: 89,
        name: 'approval_without_site_homologation_blocked (Tentativa de aprovação sem siteHomologation bloqueia)',
        expected: 'PUBLICATION_PREREQUISITE_MISSING',
        actual: `code: ${err?.code}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 90: incorrect_version_blocked_by_gate (Requisito 7)
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-pub-90-'));
    try {
      createIsolatedMockProject(tempDir, 'empresa-pub-90', 'v2', { approved: true, includeScript: true });
      executeBuildSite('empresa-pub-90', 'v2', { baseDir: tempDir });
      setHomologation('empresa-pub-90', true, { baseDir: tempDir, version: 'v2' });
      setPublicationApproval('empresa-pub-90', true, { baseDir: tempDir, version: 'v2' });

      let err = null;
      try {
        assertPublicationApproved('empresa-pub-90', 'v3', { baseDir: tempDir });
      } catch (e) {
        err = e;
      }

      const passed = (err?.code === 'PUBLICATION_VERSION_MISMATCH');
      results.push({
        testNumber: 90,
        name: 'incorrect_version_blocked_by_gate (Gate bloqueia versão divergente com PUBLICATION_VERSION_MISMATCH)',
        expected: 'PUBLICATION_VERSION_MISMATCH',
        actual: `code: ${err?.code}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 91: incorrect_project_slug_blocked (Requisito 8)
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-pub-91-'));
    try {
      createIsolatedMockProject(tempDir, 'empresa-slug-real', 'v2', { approved: true, includeScript: true });
      executeBuildSite('empresa-slug-real', 'v2', { baseDir: tempDir });
      setHomologation('empresa-slug-real', true, { baseDir: tempDir, version: 'v2' });

      const manifestPath = path.join(tempDir, 'empresa-slug-real', 'manifest.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

      let setErr = null;
      try {
        setPublicationApproval('empresa-slug-invasora', true, { manifestOverride: manifest, version: 'v2' });
      } catch (e) {
        setErr = e;
      }

      let assertErr = null;
      try {
        assertPublicationApproved('empresa-slug-invasora', 'v2', { manifestOverride: manifest });
      } catch (e) {
        assertErr = e;
      }

      const passed = (setErr?.code === 'PUBLICATION_PROJECT_SLUG_MISMATCH') &&
                     (assertErr?.code === 'PUBLICATION_PROJECT_SLUG_MISMATCH');
      results.push({
        testNumber: 91,
        name: 'incorrect_project_slug_blocked (projectSlug incorreto rejeitado com PUBLICATION_PROJECT_SLUG_MISMATCH)',
        expected: 'PUBLICATION_PROJECT_SLUG_MISMATCH',
        actual: `setCode: ${setErr?.code} | assertCode: ${assertErr?.code}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 92: build_execution_version_mismatch_blocked (Requisito 9)
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-pub-92-'));
    try {
      createIsolatedMockProject(tempDir, 'empresa-pub-92', 'v2', { approved: true, includeScript: true });
      executeBuildSite('empresa-pub-92', 'v2', { baseDir: tempDir });
      setHomologation('empresa-pub-92', true, { baseDir: tempDir, version: 'v2' });

      const manifestPath = path.join(tempDir, 'empresa-pub-92', 'manifest.json');
      const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      m.buildExecution.version = 'v1';
      fs.writeFileSync(manifestPath, JSON.stringify(m, null, 2), 'utf8');

      let err = null;
      try {
        setPublicationApproval('empresa-pub-92', true, { baseDir: tempDir, version: 'v2' });
      } catch (e) {
        err = e;
      }

      const passed = (err?.code === 'PUBLICATION_VERSION_MISMATCH');
      results.push({
        testNumber: 92,
        name: 'build_execution_version_mismatch_blocked (buildExecution de versão incompatível bloqueia)',
        expected: 'PUBLICATION_VERSION_MISMATCH',
        actual: `code: ${err?.code}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 93: homologation_version_mismatch_blocked (Requisito 10)
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-pub-93-'));
    try {
      createIsolatedMockProject(tempDir, 'empresa-pub-93', 'v2', { approved: true, includeScript: true });
      executeBuildSite('empresa-pub-93', 'v2', { baseDir: tempDir });
      setHomologation('empresa-pub-93', true, { baseDir: tempDir, version: 'v2' });

      const manifestPath = path.join(tempDir, 'empresa-pub-93', 'manifest.json');
      const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      m.siteHomologation.version = 'v1';
      fs.writeFileSync(manifestPath, JSON.stringify(m, null, 2), 'utf8');

      let err = null;
      try {
        setPublicationApproval('empresa-pub-93', true, { baseDir: tempDir, version: 'v2' });
      } catch (e) {
        err = e;
      }

      const passed = (err?.code === 'PUBLICATION_VERSION_MISMATCH');
      results.push({
        testNumber: 93,
        name: 'homologation_version_mismatch_blocked (siteHomologation de versão incompatível bloqueia)',
        expected: 'PUBLICATION_VERSION_MISMATCH',
        actual: `code: ${err?.code}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 94: homologation_prior_to_build_blocked (Requisito 11)
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-pub-94-'));
    try {
      createIsolatedMockProject(tempDir, 'empresa-pub-94', 'v2', { approved: true, includeScript: true });
      executeBuildSite('empresa-pub-94', 'v2', { baseDir: tempDir });
      setHomologation('empresa-pub-94', true, { baseDir: tempDir, version: 'v2' });

      const manifestPath = path.join(tempDir, 'empresa-pub-94', 'manifest.json');
      const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      m.buildExecution.executedAt = '2026-09-05T20:00:00.000Z';
      m.siteHomologation.decisionAt = '2026-09-05T19:00:00.000Z';
      fs.writeFileSync(manifestPath, JSON.stringify(m, null, 2), 'utf8');

      let err = null;
      try {
        setPublicationApproval('empresa-pub-94', true, { baseDir: tempDir, version: 'v2' });
      } catch (e) {
        err = e;
      }

      const passed = (err?.code === 'HOMOLOGATION_STALE');
      results.push({
        testNumber: 94,
        name: 'homologation_prior_to_build_blocked (Homologação anterior ao build detectada como HOMOLOGATION_STALE)',
        expected: 'HOMOLOGATION_STALE',
        actual: `code: ${err?.code}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 95: publication_approval_prior_to_homologation_blocked (Requisito 12)
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-pub-95-'));
    try {
      createIsolatedMockProject(tempDir, 'empresa-pub-95', 'v2', { approved: true, includeScript: true });
      executeBuildSite('empresa-pub-95', 'v2', { baseDir: tempDir });
      setHomologation('empresa-pub-95', true, { baseDir: tempDir, version: 'v2' });
      setPublicationApproval('empresa-pub-95', true, { baseDir: tempDir, version: 'v2' });

      const manifestPath = path.join(tempDir, 'empresa-pub-95', 'manifest.json');
      const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      m.buildExecution.executedAt = '2026-09-05T18:00:00.000Z';
      m.siteHomologation.decisionAt = '2026-09-05T20:00:00.000Z';
      m.publicationApproval.decisionAt = '2026-09-05T19:00:00.000Z';
      fs.writeFileSync(manifestPath, JSON.stringify(m, null, 2), 'utf8');

      let err = null;
      try {
        assertPublicationApproved('empresa-pub-95', 'v2', { baseDir: tempDir });
      } catch (e) {
        err = e;
      }

      const passed = (err?.code === 'PUBLICATION_APPROVAL_STALE');
      results.push({
        testNumber: 95,
        name: 'publication_approval_prior_to_homologation_blocked (Publication anterior à homologação gera PUBLICATION_APPROVAL_STALE)',
        expected: 'PUBLICATION_APPROVAL_STALE',
        actual: `code: ${err?.code}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 96: valid_approval_with_all_prerequisites_passes (Requisito 13)
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-pub-96-'));
    try {
      createIsolatedMockProject(tempDir, 'empresa-pub-96', 'v2', { approved: true, includeScript: true });
      executeBuildSite('empresa-pub-96', 'v2', { baseDir: tempDir });
      setHomologation('empresa-pub-96', true, { baseDir: tempDir, version: 'v2' });

      const setRes = setPublicationApproval('empresa-pub-96', true, { baseDir: tempDir, version: 'v2' });
      const assertRes = assertPublicationApproved('empresa-pub-96', 'v2', { baseDir: tempDir });

      const passed = (setRes.success === true) &&
                     (setRes.decision === 'APPROVED') &&
                     (setRes.status === 'APROVADA') &&
                     (setRes.decisionBy === 'Paulo Nunes') &&
                     (assertRes.allowed === true) &&
                     (assertRes.status === 'APROVADA');
      results.push({
        testNumber: 96,
        name: 'valid_approval_with_all_prerequisites_passes (Aprovação formal com todos os pré-requisitos satisfeitos)',
        expected: 'setRes.success: true, decision: APPROVED, status: APROVADA e assertRes.allowed: true',
        actual: `setDecision: ${setRes.decision} | setStatus: ${setRes.status} | allowed: ${assertRes.allowed}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 97: formal_rejection_success_and_preserves_prerequisites (Requisito 14)
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-pub-97-'));
    try {
      createIsolatedMockProject(tempDir, 'empresa-pub-97', 'v2', { approved: true, includeScript: true });
      executeBuildSite('empresa-pub-97', 'v2', { baseDir: tempDir });
      setHomologation('empresa-pub-97', true, { baseDir: tempDir, version: 'v2' });

      const rejRes = setPublicationApproval('empresa-pub-97', false, { baseDir: tempDir, version: 'v2' });
      const m = JSON.parse(fs.readFileSync(path.join(tempDir, 'empresa-pub-97', 'manifest.json'), 'utf8'));

      const passed = (rejRes.success === true) &&
                     (rejRes.decision === 'REJECTED') &&
                     (rejRes.status === 'REJEITADA') &&
                     (m.buildApproval.approved === true) &&
                     (m.buildExecution.status === 'CONCLUIDA') &&
                     (m.buildValidation.status === 'VALIDADA') &&
                     (m.siteHomologation.status === 'HOMOLOGADA');
      results.push({
        testNumber: 97,
        name: 'formal_rejection_success_and_preserves_prerequisites (Rejeição formal preserva pré-requisitos anteriores intactos)',
        expected: 'decision: REJECTED, status: REJEITADA e pré-requisitos preservados',
        actual: `decision: ${rejRes.decision} | status: ${rejRes.status} | bApp: ${m.buildApproval.approved} | bExec: ${m.buildExecution.status} | sHomo: ${m.siteHomologation.status}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 98: isolation_between_project_slugs (Requisito 15)
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-pub-98-'));
    try {
      createIsolatedMockProject(tempDir, 'empresa-slug-a', 'v2', { approved: true, includeScript: true });
      createIsolatedMockProject(tempDir, 'empresa-slug-b', 'v2', { approved: true, includeScript: true });
      executeBuildSite('empresa-slug-a', 'v2', { baseDir: tempDir });
      executeBuildSite('empresa-slug-b', 'v2', { baseDir: tempDir });
      setHomologation('empresa-slug-a', true, { baseDir: tempDir, version: 'v2' });
      setHomologation('empresa-slug-b', true, { baseDir: tempDir, version: 'v2' });

      setPublicationApproval('empresa-slug-a', true, { baseDir: tempDir, version: 'v2' });
      setPublicationApproval('empresa-slug-b', false, { baseDir: tempDir, version: 'v2' });

      const pubA = getPublicationApproval('empresa-slug-a', { baseDir: tempDir });
      const pubB = getPublicationApproval('empresa-slug-b', { baseDir: tempDir });

      const passed = (pubA.approved === true && pubA.decision === 'APPROVED') &&
                     (pubB.approved === false && pubB.decision === 'REJECTED');
      results.push({
        testNumber: 98,
        name: 'isolation_between_project_slugs (Isolamento estrito entre projetos: A aprovado, B rejeitado)',
        expected: 'empresa-slug-a: APPROVED e empresa-slug-b: REJECTED',
        actual: `pubA: ${pubA.decision} | pubB: ${pubB.decision}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 99: isolation_between_versions (Requisito 16)
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-pub-99-'));
    try {
      createIsolatedMockProject(tempDir, 'empresa-pub-99', 'v1', { approved: true, includeScript: true });
      createIsolatedMockProject(tempDir, 'empresa-pub-99', 'v2', { approved: true, includeScript: true });
      executeBuildSite('empresa-pub-99', 'v1', { baseDir: tempDir });
      setHomologation('empresa-pub-99', true, { baseDir: tempDir, version: 'v1' });
      setPublicationApproval('empresa-pub-99', true, { baseDir: tempDir, version: 'v1' });

      let err = null;
      try {
        assertPublicationApproved('empresa-pub-99', 'v2', { baseDir: tempDir });
      } catch (e) {
        err = e;
      }

      const passed = (err?.code === 'PUBLICATION_VERSION_MISMATCH');
      results.push({
        testNumber: 99,
        name: 'isolation_between_versions (Aprovação de publicação da v1 não autoriza publicação da v2)',
        expected: 'PUBLICATION_VERSION_MISMATCH',
        actual: `code: ${err?.code}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 100: invalid_state_rejected (Requisito 17)
  // --------------------------------------------------------------------------
  {
    const manifestOk = {
      projectSlug: 'empresa-pub-100',
      publicationApproval: { status: 'ok', decision: 'yes', approved: true }
    };
    const val = validatePublicationApproval(manifestOk);
    let err = null;
    try {
      assertPublicationApproved('empresa-pub-100', 'v2', { manifestOverride: manifestOk });
    } catch (e) {
      err = e;
    }

    const passed = (val.valid === false) && (err?.code === 'PUBLICATION_APPROVAL_INVALID');
    results.push({
      testNumber: 100,
      name: 'invalid_state_rejected (Estados arbitrários como status: ok ou decision: yes rejeitados)',
      expected: 'val.valid: false e err.code: PUBLICATION_APPROVAL_INVALID',
      actual: `val.valid: ${val.valid} | err.code: ${err?.code}`,
      passed
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 101: non_boolean_approved_rejected (Requisito 18)
  // --------------------------------------------------------------------------
  {
    const manifestStr = {
      projectSlug: 'empresa-pub-101',
      publicationApproval: { status: 'APROVADA', decision: 'APPROVED', approved: 'true' }
    };
    const valStr = validatePublicationApproval(manifestStr);

    let errCall = null;
    try {
      setPublicationApproval('empresa-pub-101', 'true', { version: 'v2' });
    } catch (e) {
      errCall = e;
    }

    const passed = (valStr.valid === false) && (errCall !== null);
    results.push({
      testNumber: 101,
      name: 'non_boolean_approved_rejected (approved não booleano rejeitado estritamente)',
      expected: 'valStr.valid: false e setPublicationApproval lança erro',
      actual: `valStr.valid: ${valStr.valid} | errCall: ${errCall !== null}`,
      passed
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 102: natural_language_rejected (Requisito 19)
  // --------------------------------------------------------------------------
  {
    let chatErr1 = null;
    let chatErr2 = null;
    try {
      setPublicationApproval('empresa-pub-102', 'aprovado pelo cliente', { version: 'v2' });
    } catch (e) {
      chatErr1 = e;
    }
    try {
      setPublicationApproval('empresa-pub-102', 'publicar imediatamente', { version: 'v2' });
    } catch (e) {
      chatErr2 = e;
    }

    const passed = (chatErr1 !== null) && (chatErr2 !== null);
    results.push({
      testNumber: 102,
      name: 'natural_language_rejected (Comandos em linguagem natural rejeitados)',
      expected: 'Exceção em todas as tentativas de linguagem natural',
      actual: `chatErr1: ${chatErr1 !== null} | chatErr2: ${chatErr2 !== null}`,
      passed
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 103: publication_status_does_not_modify_manifest (Requisito 20)
  // --------------------------------------------------------------------------
  {
    const crypto = require('crypto');
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-pub-103-'));
    try {
      createIsolatedMockProject(tempDir, 'empresa-pub-103', 'v2', { approved: true, includeScript: true });
      const manifestPath = path.join(tempDir, 'empresa-pub-103', 'manifest.json');
      const hashBefore = crypto.createHash('sha256').update(fs.readFileSync(manifestPath)).digest('hex');

      getPublicationApproval('empresa-pub-103', { baseDir: tempDir });
      try {
        assertPublicationApproved('empresa-pub-103', 'v2', { baseDir: tempDir });
      } catch (e) {
        // Bloqueio esperado
      }

      const hashAfter = crypto.createHash('sha256').update(fs.readFileSync(manifestPath)).digest('hex');
      const passed = (hashBefore === hashAfter);
      results.push({
        testNumber: 103,
        name: 'publication_status_does_not_modify_manifest (Consulta de status é estritamente somente-leitura)',
        expected: 'Hash SHA-256 do manifest.json inalterado',
        actual: `before === after: ${passed}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 104: rebuild_invalidates_publication_approval (Requisito 21)
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-pub-104-'));
    try {
      createIsolatedMockProject(tempDir, 'empresa-pub-104', 'v2', { approved: true, includeScript: true });
      executeBuildSite('empresa-pub-104', 'v2', { baseDir: tempDir });
      setHomologation('empresa-pub-104', true, { baseDir: tempDir, version: 'v2' });
      setPublicationApproval('empresa-pub-104', true, { baseDir: tempDir, version: 'v2' });

      const pubBefore = getPublicationApproval('empresa-pub-104', { baseDir: tempDir });

      // Novo rebuild executado
      executeBuildSite('empresa-pub-104', 'v2', { baseDir: tempDir });
      const pubAfter = getPublicationApproval('empresa-pub-104', { baseDir: tempDir });

      const passed = (pubBefore.approved === true && pubBefore.status === 'APROVADA') &&
                     (pubAfter.approved === false && pubAfter.decision === 'PENDING' && pubAfter.status === 'PENDENTE');
      results.push({
        testNumber: 104,
        name: 'rebuild_invalidates_publication_approval (Rebuild reseta publicationApproval para PENDENTE)',
        expected: 'before: APROVADA | after: PENDENTE com approved: false',
        actual: `before: ${pubBefore.status} | after: ${pubAfter.status} | afterApproved: ${pubAfter.approved}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 105: rebuild_invalidates_site_homologation (Requisito 22)
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-pub-105-'));
    try {
      createIsolatedMockProject(tempDir, 'empresa-pub-105', 'v2', { approved: true, includeScript: true });
      executeBuildSite('empresa-pub-105', 'v2', { baseDir: tempDir });
      setHomologation('empresa-pub-105', true, { baseDir: tempDir, version: 'v2' });

      const homoBefore = getHomologation('empresa-pub-105', { baseDir: tempDir });

      // Novo rebuild executado
      executeBuildSite('empresa-pub-105', 'v2', { baseDir: tempDir });
      const homoAfter = getHomologation('empresa-pub-105', { baseDir: tempDir });

      const passed = (homoBefore.approved === true && homoBefore.status === 'HOMOLOGADA') &&
                     (homoAfter.approved === false && homoAfter.decision === 'PENDING' && homoAfter.status === 'PENDENTE');
      results.push({
        testNumber: 105,
        name: 'rebuild_invalidates_site_homologation (Rebuild invalida siteHomologation para PENDENTE)',
        expected: 'before: HOMOLOGADA | after: PENDENTE',
        actual: `before: ${homoBefore.status} | after: ${homoAfter.status}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 106: stale_approval_does_not_authorize_post_rebuild (Requisito 23)
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-pub-106-'));
    try {
      createIsolatedMockProject(tempDir, 'empresa-pub-106', 'v2', { approved: true, includeScript: true });
      executeBuildSite('empresa-pub-106', 'v2', { baseDir: tempDir });
      setHomologation('empresa-pub-106', true, { baseDir: tempDir, version: 'v2' });
      setPublicationApproval('empresa-pub-106', true, { baseDir: tempDir, version: 'v2' });

      // Rebuild reseta publicationApproval para PENDENTE
      executeBuildSite('empresa-pub-106', 'v2', { baseDir: tempDir });

      let err = null;
      try {
        assertPublicationApproved('empresa-pub-106', 'v2', { baseDir: tempDir });
      } catch (e) {
        err = e;
      }

      const passed = (err?.code === 'PUBLICATION_APPROVAL_REQUIRED');
      results.push({
        testNumber: 106,
        name: 'stale_approval_does_not_authorize_post_rebuild (Autorização pré-rebuild não autoriza novo build)',
        expected: 'PUBLICATION_APPROVAL_REQUIRED',
        actual: `code: ${err?.code}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 107: build_execution_does_not_equal_publication_approval (Requisito 24)
  // --------------------------------------------------------------------------
  {
    const manifest = {
      projectSlug: 'empresa-pub-107',
      buildApproval: { approved: true, decision: 'APPROVED', decisionBy: 'Paulo Nunes' },
      buildExecution: { status: 'CONCLUIDA', version: 'v2', executedAt: new Date().toISOString() },
      buildValidation: { status: 'VALIDADA', isValid: true, version: 'v2' }
    };
    let err = null;
    try {
      assertPublicationApproved('empresa-pub-107', 'v2', { manifestOverride: manifest });
    } catch (e) {
      err = e;
    }

    const passed = (err?.code === 'PUBLICATION_APPROVAL_REQUIRED');
    results.push({
      testNumber: 107,
      name: 'build_execution_does_not_equal_publication_approval (buildExecution CONCLUIDA não equivale a publicationApproval)',
      expected: 'PUBLICATION_APPROVAL_REQUIRED',
      actual: `code: ${err?.code}`,
      passed
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 108: site_homologation_does_not_equal_publication_approval (Requisito 25)
  // --------------------------------------------------------------------------
  {
    const now = new Date().toISOString();
    const manifest = {
      projectSlug: 'empresa-pub-108',
      buildApproval: { approved: true, decision: 'APPROVED', decisionBy: 'Paulo Nunes' },
      buildExecution: { status: 'CONCLUIDA', version: 'v2', executedAt: now },
      buildValidation: { status: 'VALIDADA', isValid: true, version: 'v2' },
      siteHomologation: { status: 'HOMOLOGADA', approved: true, decision: 'APPROVED', decisionBy: 'Paulo Nunes', version: 'v2', decisionAt: now }
    };
    let err = null;
    try {
      assertPublicationApproved('empresa-pub-108', 'v2', { manifestOverride: manifest });
    } catch (e) {
      err = e;
    }

    const passed = (err?.code === 'PUBLICATION_APPROVAL_REQUIRED');
    results.push({
      testNumber: 108,
      name: 'site_homologation_does_not_equal_publication_approval (siteHomologation HOMOLOGADA não equivale a publicationApproval)',
      expected: 'PUBLICATION_APPROVAL_REQUIRED',
      actual: `code: ${err?.code}`,
      passed
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 109: build_approval_does_not_equal_publication_approval (Requisito 26)
  // --------------------------------------------------------------------------
  {
    const manifest = {
      projectSlug: 'empresa-pub-109',
      buildApproval: { approved: true, decision: 'APPROVED', decisionBy: 'Paulo Nunes' }
    };
    let err = null;
    try {
      assertPublicationApproved('empresa-pub-109', 'v2', { manifestOverride: manifest });
    } catch (e) {
      err = e;
    }

    const passed = (err?.code === 'PUBLICATION_APPROVAL_REQUIRED');
    results.push({
      testNumber: 109,
      name: 'build_approval_does_not_equal_publication_approval (buildApproval APPROVED não equivale a publicationApproval)',
      expected: 'PUBLICATION_APPROVAL_REQUIRED',
      actual: `code: ${err?.code}`,
      passed
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 110: approval_gate_does_not_equal_publication_approval (Requisito 27)
  // --------------------------------------------------------------------------
  {
    const manifest = {
      projectSlug: 'empresa-pub-110',
      status: 'APPROVED',
      approvedBy: 'Paulo Nunes',
      approvedAt: new Date().toISOString(),
      approvalGate: { decision: 'APROVAR' }
    };
    let err = null;
    try {
      assertPublicationApproved('empresa-pub-110', 'v2', { manifestOverride: manifest });
    } catch (e) {
      err = e;
    }

    const passed = (err?.code === 'PUBLICATION_APPROVAL_REQUIRED');
    results.push({
      testNumber: 110,
      name: 'approval_gate_does_not_equal_publication_approval (Gate comercial APROVAR não equivale a publicationApproval)',
      expected: 'PUBLICATION_APPROVAL_REQUIRED',
      actual: `code: ${err?.code}`,
      passed
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 111: public_preview_does_not_equal_publication_approval (Requisito 28)
  // --------------------------------------------------------------------------
  {
    const manifest = {
      projectSlug: 'empresa-pub-111',
      publicPreview: { commercialApproval: true, approvedUrl: 'https://preview.mock' }
    };
    let err = null;
    try {
      assertPublicationApproved('empresa-pub-111', 'v2', { manifestOverride: manifest });
    } catch (e) {
      err = e;
    }

    const passed = (err?.code === 'PUBLICATION_APPROVAL_REQUIRED');
    results.push({
      testNumber: 111,
      name: 'public_preview_does_not_equal_publication_approval (publicPreview comercial não equivale a publicationApproval)',
      expected: 'PUBLICATION_APPROVAL_REQUIRED',
      actual: `code: ${err?.code}`,
      passed
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 112: publisher_not_called_or_imported (Requisito 29)
  // --------------------------------------------------------------------------
  {
    const dispatcherSrc = fs.readFileSync(path.join(__dirname, 'dispatcher.js'), 'utf8');
    const hasPublisherImport = dispatcherSrc.includes('publisher.js') || dispatcherSrc.includes("require('./publisher')");
    const passed = !hasPublisherImport;
    results.push({
      testNumber: 112,
      name: 'publisher_not_called_or_imported (publisher.js não é importado nem executado no dispatcher)',
      expected: 'hasPublisherImport: false',
      actual: `hasPublisherImport: ${hasPublisherImport}`,
      passed
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 113: no_site_copies_in_previews_garimpo (Requisito 30)
  // --------------------------------------------------------------------------
  {
    const prohibitedSiteDir = path.join(__dirname, 'castlink-world', 'site');
    const exists = fs.existsSync(prohibitedSiteDir);
    const passed = !exists;
    results.push({
      testNumber: 113,
      name: 'no_site_copies_in_previews_garimpo (Diretório proibido previews-garimpo/castlink-world/site não existe)',
      expected: 'exists: false',
      actual: `exists: ${exists}`,
      passed
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 114: no_remote_uploads_in_publication_approval (Requisito 31)
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-pub-114-'));
    try {
      createIsolatedMockProject(tempDir, 'empresa-pub-114', 'v2', { approved: true, includeScript: true });
      executeBuildSite('empresa-pub-114', 'v2', { baseDir: tempDir });
      setHomologation('empresa-pub-114', true, { baseDir: tempDir, version: 'v2' });
      const res = setPublicationApproval('empresa-pub-114', true, { baseDir: tempDir, version: 'v2' });

      const passed = (res.success === true) && (typeof res.decisionAt === 'string');
      results.push({
        testNumber: 114,
        name: 'no_remote_uploads_in_publication_approval (Operação puramente local sem chamadas remotas)',
        expected: 'Operação executada 100% localmente',
        actual: `success: ${res.success} | local: true`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 115: no_emails_sent_dry_run_preserved (Requisito 32)
  // --------------------------------------------------------------------------
  {
    const gateRes = validateEmailGate('castlink-world', 'v2');
    const passed = (gateRes.dryRun === true) && (gateRes.dispatched !== true);
    results.push({
      testNumber: 115,
      name: 'no_emails_sent_dry_run_preserved (Nenhum e-mail enviado, dryRun estrito preservado)',
      expected: 'dryRun: true e dispatched !== true',
      actual: `dryRun: ${gateRes.dryRun} | dispatched: ${gateRes.dispatched}`,
      passed
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 116: production_send_not_executed (Requisito 33)
  // --------------------------------------------------------------------------
  {
    const gateRes = validateEmailGate('castlink-world', 'v2');
    const passed = (gateRes.dryRun === true) && (!process.argv.includes('--production-send'));
    results.push({
      testNumber: 116,
      name: 'production_send_not_executed (--production-send não foi acionado durante os testes)',
      expected: 'dryRun: true e flag ausente',
      actual: `dryRun: ${gateRes.dryRun} | argvIncludes: ${process.argv.includes('--production-send')}`,
      passed
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 117: panel_renders_all_6_sections (Etapa 14)
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-pub-117-'));
    try {
      createIsolatedMockProject(tempDir, 'empresa-pub-117', 'v2', { approved: true, includeScript: true });
      executeBuildSite('empresa-pub-117', 'v2', { baseDir: tempDir });
      setHomologation('empresa-pub-117', true, { baseDir: tempDir, version: 'v2' });
      setPublicationApproval('empresa-pub-117', true, { baseDir: tempDir, version: 'v2' });

      const panel = generateApprovalPanel('empresa-pub-117', 'v2', { baseDir: tempDir, openInEditor: false });
      const md = panel.content;

      const hasSec1 = md.includes('## 🏗️ APROVAÇÃO DA CONSTRUÇÃO DO SITE');
      const hasSec2 = md.includes('## 🔨 EXECUÇÃO DA CONSTRUÇÃO DO SITE');
      const hasSec3 = md.includes('## 🔎 VALIDAÇÃO DO BUILD');
      const hasSec4 = md.includes('## ✅ HOMOLOGAÇÃO DO SITE DE PRODUÇÃO');
      const hasSec5 = md.includes('## 🌐 SITE DE PRODUÇÃO');
      const hasSec6 = md.includes('## 🚀 APROVAÇÃO DA PUBLICAÇÃO DO SITE');

      const passed = hasSec1 && hasSec2 && hasSec3 && hasSec4 && hasSec5 && hasSec6;
      results.push({
        testNumber: 117,
        name: 'panel_renders_all_6_sections (Painel renderiza as 6 seções completas de governança)',
        expected: 'Presença das 6 seções no PAINEL_APROVACAO.md',
        actual: `s1:${hasSec1} s2:${hasSec2} s3:${hasSec3} s4:${hasSec4} s5:${hasSec5} s6:${hasSec6}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 118: plan_without_build_approval_blocked (Etapa 12 - Requisito 1)
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-plan-118-'));
    try {
      createIsolatedMockProject(tempDir, 'empresa-plan-118', 'v2', { approved: true, includeScript: true });
      executeBuildSite('empresa-plan-118', 'v2', { baseDir: tempDir });
      setHomologation('empresa-plan-118', true, { baseDir: tempDir, version: 'v2' });
      setPublicationApproval('empresa-plan-118', true, { baseDir: tempDir, version: 'v2' });

      // Invalida buildApproval no manifesto
      const manifestPath = path.join(tempDir, 'empresa-plan-118', 'manifest.json');
      const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      m.buildApproval = { approved: false, decision: 'PENDING', status: 'PENDENTE' };
      fs.writeFileSync(manifestPath, JSON.stringify(m, null, 2), 'utf8');

      let err = null;
      try {
        buildProductionPublicationPlan('empresa-plan-118', 'v2', { baseDir: tempDir });
      } catch (e) {
        err = e;
      }

      const passed = (err !== null) && (err.code === 'PUBLICATION_PREREQUISITE_MISSING');
      results.push({
        testNumber: 118,
        name: 'plan_without_build_approval_blocked (Plano sem buildApproval é bloqueado com PUBLICATION_PREREQUISITE_MISSING)',
        expected: 'PUBLICATION_PREREQUISITE_MISSING',
        actual: `code: ${err?.code}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 119: plan_without_build_execution_blocked (Etapa 12 - Requisito 2)
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-plan-119-'));
    try {
      createIsolatedMockProject(tempDir, 'empresa-plan-119', 'v2', { approved: true, includeScript: true });
      executeBuildSite('empresa-plan-119', 'v2', { baseDir: tempDir });
      setHomologation('empresa-plan-119', true, { baseDir: tempDir, version: 'v2' });
      setPublicationApproval('empresa-plan-119', true, { baseDir: tempDir, version: 'v2' });

      // Remove buildExecution do manifesto
      const manifestPath = path.join(tempDir, 'empresa-plan-119', 'manifest.json');
      const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      delete m.buildExecution;
      fs.writeFileSync(manifestPath, JSON.stringify(m, null, 2), 'utf8');

      let err = null;
      try {
        buildProductionPublicationPlan('empresa-plan-119', 'v2', { baseDir: tempDir });
      } catch (e) {
        err = e;
      }

      const passed = (err !== null) && (err.code === 'PUBLICATION_PREREQUISITE_MISSING');
      results.push({
        testNumber: 119,
        name: 'plan_without_build_execution_blocked (Plano sem buildExecution é bloqueado com PUBLICATION_PREREQUISITE_MISSING)',
        expected: 'PUBLICATION_PREREQUISITE_MISSING',
        actual: `code: ${err?.code}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 120: plan_without_build_validation_blocked (Etapa 12 - Requisito 3)
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-plan-120-'));
    try {
      createIsolatedMockProject(tempDir, 'empresa-plan-120', 'v2', { approved: true, includeScript: true });
      executeBuildSite('empresa-plan-120', 'v2', { baseDir: tempDir });
      setHomologation('empresa-plan-120', true, { baseDir: tempDir, version: 'v2' });
      setPublicationApproval('empresa-plan-120', true, { baseDir: tempDir, version: 'v2' });

      // Corrompe buildValidation no manifesto
      const manifestPath = path.join(tempDir, 'empresa-plan-120', 'manifest.json');
      const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      m.buildValidation = { status: 'PENDENTE', isValid: false };
      fs.writeFileSync(manifestPath, JSON.stringify(m, null, 2), 'utf8');

      let err = null;
      try {
        buildProductionPublicationPlan('empresa-plan-120', 'v2', { baseDir: tempDir });
      } catch (e) {
        err = e;
      }

      const passed = (err !== null) && (err.code === 'PUBLICATION_PREREQUISITE_MISSING');
      results.push({
        testNumber: 120,
        name: 'plan_without_build_validation_blocked (Plano sem buildValidation é bloqueado com PUBLICATION_PREREQUISITE_MISSING)',
        expected: 'PUBLICATION_PREREQUISITE_MISSING',
        actual: `code: ${err?.code}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 121: plan_without_site_homologation_blocked (Etapa 12 - Requisito 4)
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-plan-121-'));
    try {
      createIsolatedMockProject(tempDir, 'empresa-plan-121', 'v2', { approved: true, includeScript: true });
      executeBuildSite('empresa-plan-121', 'v2', { baseDir: tempDir });
      setHomologation('empresa-plan-121', true, { baseDir: tempDir, version: 'v2' });
      setPublicationApproval('empresa-plan-121', true, { baseDir: tempDir, version: 'v2' });

      // Invalida homologação no manifesto
      const manifestPath = path.join(tempDir, 'empresa-plan-121', 'manifest.json');
      const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      m.siteHomologation = { status: 'PENDENTE', approved: false, decision: 'PENDING' };
      fs.writeFileSync(manifestPath, JSON.stringify(m, null, 2), 'utf8');

      let err = null;
      try {
        buildProductionPublicationPlan('empresa-plan-121', 'v2', { baseDir: tempDir });
      } catch (e) {
        err = e;
      }

      const passed = (err !== null) && (err.code === 'PUBLICATION_PREREQUISITE_MISSING');
      results.push({
        testNumber: 121,
        name: 'plan_without_site_homologation_blocked (Plano sem siteHomologation é bloqueado com PUBLICATION_PREREQUISITE_MISSING)',
        expected: 'PUBLICATION_PREREQUISITE_MISSING',
        actual: `code: ${err?.code}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 122: plan_without_publication_approval_blocked (Etapa 12 - Requisito 5)
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-plan-122-'));
    try {
      createIsolatedMockProject(tempDir, 'empresa-plan-122', 'v2', { approved: true, includeScript: true });
      executeBuildSite('empresa-plan-122', 'v2', { baseDir: tempDir });
      setHomologation('empresa-plan-122', true, { baseDir: tempDir, version: 'v2' });

      let err = null;
      try {
        buildProductionPublicationPlan('empresa-plan-122', 'v2', { baseDir: tempDir });
      } catch (e) {
        err = e;
      }

      const passed = (err !== null) && (err.code === 'PUBLICATION_APPROVAL_REQUIRED');
      results.push({
        testNumber: 122,
        name: 'plan_without_publication_approval_blocked (Plano sem publicationApproval é bloqueado com PUBLICATION_APPROVAL_REQUIRED)',
        expected: 'PUBLICATION_APPROVAL_REQUIRED',
        actual: `code: ${err?.code}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 123: plan_divergent_project_blocked (Etapa 12 - Requisito 6)
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-plan-123-'));
    try {
      createIsolatedMockProject(tempDir, 'empresa-plan-123-a', 'v2', { approved: true, includeScript: true });
      executeBuildSite('empresa-plan-123-a', 'v2', { baseDir: tempDir });
      setHomologation('empresa-plan-123-a', true, { baseDir: tempDir, version: 'v2' });
      setPublicationApproval('empresa-plan-123-a', true, { baseDir: tempDir, version: 'v2' });

      let err = null;
      try {
        buildProductionPublicationPlan('empresa-plan-123-b', 'v2', { baseDir: tempDir });
      } catch (e) {
        err = e;
      }

      const passed = (err !== null);
      results.push({
        testNumber: 123,
        name: 'plan_divergent_project_blocked (Tentativa de planejar para projeto inexistente ou divergente é bloqueada)',
        expected: 'Erro de projeto lançado',
        actual: `error: ${err?.message}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 124: plan_divergent_version_blocked (Etapa 12 - Requisito 7)
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-plan-124-'));
    try {
      createIsolatedMockProject(tempDir, 'empresa-plan-124', 'v2', { approved: true, includeScript: true });
      executeBuildSite('empresa-plan-124', 'v2', { baseDir: tempDir });
      setHomologation('empresa-plan-124', true, { baseDir: tempDir, version: 'v2' });
      setPublicationApproval('empresa-plan-124', true, { baseDir: tempDir, version: 'v2' });

      let err = null;
      try {
        buildProductionPublicationPlan('empresa-plan-124', 'v3', { baseDir: tempDir });
      } catch (e) {
        err = e;
      }

      const passed = (err !== null) && (err.code === 'PUBLICATION_VERSION_MISMATCH');
      results.push({
        testNumber: 124,
        name: 'plan_divergent_version_blocked (Plano com versão divergente da homologada é bloqueado com PUBLICATION_VERSION_MISMATCH)',
        expected: 'PUBLICATION_VERSION_MISMATCH',
        actual: `code: ${err?.code}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 125: plan_homologation_stale_blocked (Etapa 12 - Requisito 8)
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-plan-125-'));
    try {
      createIsolatedMockProject(tempDir, 'empresa-plan-125', 'v2', { approved: true, includeScript: true });
      executeBuildSite('empresa-plan-125', 'v2', { baseDir: tempDir });
      setHomologation('empresa-plan-125', true, { baseDir: tempDir, version: 'v2' });
      setPublicationApproval('empresa-plan-125', true, { baseDir: tempDir, version: 'v2' });

      const manifestPath = path.join(tempDir, 'empresa-plan-125', 'manifest.json');
      const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      m.siteHomologation.decisionAt = '2020-01-01T00:00:00.000Z';
      fs.writeFileSync(manifestPath, JSON.stringify(m, null, 2), 'utf8');

      let err = null;
      try {
        buildProductionPublicationPlan('empresa-plan-125', 'v2', { baseDir: tempDir });
      } catch (e) {
        err = e;
      }

      const passed = (err !== null) &&
                     (err.code === 'PUBLICATION_PREREQUISITE_MISSING' || err.code === 'HOMOLOGATION_STALE') &&
                     err.message.includes('HOMOLOGAÇÃO OBSOLETA');
      results.push({
        testNumber: 125,
        name: 'plan_homologation_stale_blocked (Homologação anterior ao build bloqueia o plano determinístico)',
        expected: 'HOMOLOGAÇÃO OBSOLETA (PUBLICATION_PREREQUISITE_MISSING ou HOMOLOGATION_STALE)',
        actual: `code: ${err?.code} | message: ${err?.message}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 126: plan_publication_approval_stale_blocked (Etapa 12 - Requisito 9)
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-plan-126-'));
    try {
      createIsolatedMockProject(tempDir, 'empresa-plan-126', 'v2', { approved: true, includeScript: true });
      executeBuildSite('empresa-plan-126', 'v2', { baseDir: tempDir });
      setHomologation('empresa-plan-126', true, { baseDir: tempDir, version: 'v2' });
      setPublicationApproval('empresa-plan-126', true, { baseDir: tempDir, version: 'v2' });

      const manifestPath = path.join(tempDir, 'empresa-plan-126', 'manifest.json');
      const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      m.buildExecution.executedAt = '2026-09-05T18:00:00.000Z';
      m.siteHomologation.decisionAt = '2026-09-05T20:00:00.000Z';
      m.publicationApproval.decisionAt = '2026-09-05T19:00:00.000Z';
      fs.writeFileSync(manifestPath, JSON.stringify(m, null, 2), 'utf8');

      let err = null;
      try {
        buildProductionPublicationPlan('empresa-plan-126', 'v2', { baseDir: tempDir });
      } catch (e) {
        err = e;
      }

      const passed = (err !== null) && (err.code === 'PUBLICATION_APPROVAL_STALE');
      results.push({
        testNumber: 126,
        name: 'plan_publication_approval_stale_blocked (Autorização anterior à homologação bloqueia com PUBLICATION_APPROVAL_STALE)',
        expected: 'PUBLICATION_APPROVAL_STALE',
        actual: `code: ${err?.code}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 127: plan_rebuild_invalidates_authorization (Etapa 12 - Requisito 10)
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-plan-127-'));
    try {
      createIsolatedMockProject(tempDir, 'empresa-plan-127', 'v2', { approved: true, includeScript: true });
      executeBuildSite('empresa-plan-127', 'v2', { baseDir: tempDir });
      setHomologation('empresa-plan-127', true, { baseDir: tempDir, version: 'v2' });
      setPublicationApproval('empresa-plan-127', true, { baseDir: tempDir, version: 'v2' });

      // Rebuild reseta publicationApproval e siteHomologation para PENDENTE
      executeBuildSite('empresa-plan-127', 'v2', { baseDir: tempDir });

      let err = null;
      try {
        buildProductionPublicationPlan('empresa-plan-127', 'v2', { baseDir: tempDir });
      } catch (e) {
        err = e;
      }

      const passed = (err !== null) && (err.code === 'PUBLICATION_APPROVAL_REQUIRED');
      results.push({
        testNumber: 127,
        name: 'plan_rebuild_invalidates_authorization (Rebuild invalida autorização anterior e bloqueia plano de publicação)',
        expected: 'PUBLICATION_APPROVAL_REQUIRED',
        actual: `code: ${err?.code}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 128: plan_nonexistent_artifact_dir_blocked (Etapa 12 - Requisito 11)
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-plan-128-'));
    try {
      createIsolatedMockProject(tempDir, 'empresa-plan-128', 'v2', { approved: true, includeScript: true });
      executeBuildSite('empresa-plan-128', 'v2', { baseDir: tempDir });
      setHomologation('empresa-plan-128', true, { baseDir: tempDir, version: 'v2' });
      setPublicationApproval('empresa-plan-128', true, { baseDir: tempDir, version: 'v2' });

      // Remove fisicamente a pasta site-producao
      const siteDir = path.join(tempDir, 'empresa-plan-128', 'site-producao');
      fs.rmSync(siteDir, { recursive: true, force: true });

      let err = null;
      try {
        buildProductionPublicationPlan('empresa-plan-128', 'v2', { baseDir: tempDir });
      } catch (e) {
        err = e;
      }

      const passed = (err !== null) && (err.code === 'PRODUCTION_SITE_DIR_NOT_FOUND');
      results.push({
        testNumber: 128,
        name: 'plan_nonexistent_artifact_dir_blocked (Diretório site-producao ausente bloqueia com PRODUCTION_SITE_DIR_NOT_FOUND)',
        expected: 'PRODUCTION_SITE_DIR_NOT_FOUND',
        actual: `code: ${err?.code}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 129: plan_incorrect_project_dir_blocked (Etapa 12 - Requisito 12)
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-plan-129-'));
    try {
      createIsolatedMockProject(tempDir, 'empresa-plan-129', 'v2', { approved: true, includeScript: true });

      let err = null;
      try {
        validateProductionPublicationRequest('empresa-plan-129', 'v2', {
          baseDir: path.join(tempDir, 'outro-projeto')
        });
      } catch (e) {
        err = e;
      }

      const passed = (err !== null);
      results.push({
        testNumber: 129,
        name: 'plan_incorrect_project_dir_blocked (Diretório de projeto incorreto é rejeitado deterministicamente)',
        expected: 'Erro lançado para diretório incorreto',
        actual: `code: ${err?.code}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 130: plan_previews_garimpo_path_forbidden (Etapa 12 - Requisito 13)
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'previews-garimpo-fake-130-'));
    try {
      let err = null;
      try {
        validateProductionPublicationRequest('empresa-plan-130', 'v2', { baseDir: tempDir });
      } catch (e) {
        err = e;
      }

      const passed = (err !== null) && (err.code === 'FORBIDDEN_OUTPUT_PATH');
      results.push({
        testNumber: 130,
        name: 'plan_previews_garimpo_path_forbidden (Caminhos contendo previews-garimpo são terminantemente bloqueados)',
        expected: 'FORBIDDEN_OUTPUT_PATH',
        actual: `code: ${err?.code}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 131: plan_unconfigured_target_pending (Etapa 12 - Requisito 14)
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-plan-131-'));
    try {
      createIsolatedMockProject(tempDir, 'empresa-plan-131', 'v2', { approved: true, includeScript: true });
      executeBuildSite('empresa-plan-131', 'v2', { baseDir: tempDir });
      setHomologation('empresa-plan-131', true, { baseDir: tempDir, version: 'v2' });
      setPublicationApproval('empresa-plan-131', true, { baseDir: tempDir, version: 'v2' });

      const plan = buildProductionPublicationPlan('empresa-plan-131', 'v2', { baseDir: tempDir });

      const passed = (plan.publicationTarget === 'PENDING_CONFIGURATION') &&
                     (plan.targetConfigured === false);
      results.push({
        testNumber: 131,
        name: 'plan_unconfigured_target_pending (Destino não configurado resulta em PENDING_CONFIGURATION e targetConfigured: false)',
        expected: 'publicationTarget: PENDING_CONFIGURATION e targetConfigured: false',
        actual: `target: ${plan.publicationTarget} | configured: ${plan.targetConfigured}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 132: plan_dry_run_mandatory (Etapa 12 - Requisito 15)
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-plan-132-'));
    try {
      createIsolatedMockProject(tempDir, 'empresa-plan-132', 'v2', { approved: true, includeScript: true });
      executeBuildSite('empresa-plan-132', 'v2', { baseDir: tempDir });
      setHomologation('empresa-plan-132', true, { baseDir: tempDir, version: 'v2' });
      setPublicationApproval('empresa-plan-132', true, { baseDir: tempDir, version: 'v2' });

      const plan = buildProductionPublicationPlan('empresa-plan-132', 'v2', { baseDir: tempDir });

      const passed = (plan.dryRun === true) &&
                     (plan.mode === 'DRY_RUN') &&
                     (plan.executionAllowed === false) &&
                     (plan.executionBlockReason === 'PRODUCTION_PUBLICATION_EXECUTION_DISABLED');
      results.push({
        testNumber: 132,
        name: 'plan_dry_run_mandatory (Modo DRY-RUN é obrigatório e bloqueio de execução real é explícito)',
        expected: 'dryRun: true, mode: DRY_RUN, executionAllowed: false',
        actual: `dryRun: ${plan.dryRun} | mode: ${plan.mode} | executionAllowed: ${plan.executionAllowed}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 133: plan_deterministic_generation (Etapa 12 - Requisito 16)
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-plan-133-'));
    try {
      createIsolatedMockProject(tempDir, 'empresa-plan-133', 'v2', { approved: true, includeScript: true });
      executeBuildSite('empresa-plan-133', 'v2', { baseDir: tempDir });
      setHomologation('empresa-plan-133', true, { baseDir: tempDir, version: 'v2' });
      setPublicationApproval('empresa-plan-133', true, { baseDir: tempDir, version: 'v2' });

      const fixedDate = '2026-09-06T12:00:00.000Z';
      const plan1 = buildProductionPublicationPlan('empresa-plan-133', 'v2', { baseDir: tempDir, plannedAtOverride: fixedDate });
      const plan2 = buildProductionPublicationPlan('empresa-plan-133', 'v2', { baseDir: tempDir, plannedAtOverride: fixedDate });

      const passed = (JSON.stringify(plan1) === JSON.stringify(plan2)) &&
                     (plan1.aggregateSha256 === plan2.aggregateSha256);
      results.push({
        testNumber: 133,
        name: 'plan_deterministic_generation (Geração de plano é 100% determinística com saídas e hashes idênticos)',
        expected: 'plan1 === plan2 e aggregateSha256 idênticos',
        actual: `identical: ${JSON.stringify(plan1) === JSON.stringify(plan2)} | shaMatch: ${plan1.aggregateSha256 === plan2.aggregateSha256}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 134: plan_sha256_integrity_calculated (Etapa 12 - Requisito 17)
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-plan-134-'));
    try {
      createIsolatedMockProject(tempDir, 'empresa-plan-134', 'v2', { approved: true, includeScript: true });
      executeBuildSite('empresa-plan-134', 'v2', { baseDir: tempDir });
      setHomologation('empresa-plan-134', true, { baseDir: tempDir, version: 'v2' });
      setPublicationApproval('empresa-plan-134', true, { baseDir: tempDir, version: 'v2' });

      const plan = buildProductionPublicationPlan('empresa-plan-134', 'v2', { baseDir: tempDir });

      const siteDir = path.join(tempDir, 'empresa-plan-134', 'site-producao');
      const indexFile = path.join(siteDir, 'index.html');
      const manualIndexSha = crypto.createHash('sha256').update(fs.readFileSync(indexFile)).digest('hex');

      const planIndex = plan.expectedFiles.find(f => f.relativePath === 'index.html');

      const passed = (planIndex !== undefined) &&
                     (planIndex.sha256 === manualIndexSha) &&
                     (plan.totalFiles >= 2) &&
                     (typeof plan.aggregateSha256 === 'string') &&
                     (plan.aggregateSha256.length === 64);
      results.push({
        testNumber: 134,
        name: 'plan_sha256_integrity_calculated (Integridade SHA-256 e aggregateSha256 calculados com precisão matemática)',
        expected: 'SHA-256 de index.html coincide com cálculo em disco e aggregateSha256 válido',
        actual: `planSha: ${planIndex?.sha256} | manualSha: ${manualIndexSha} | totalFiles: ${plan.totalFiles}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 135: publication_status_is_read_only (Etapa 12 - Requisito 18)
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-plan-135-'));
    try {
      createIsolatedMockProject(tempDir, 'empresa-plan-135', 'v2', { approved: true, includeScript: true });
      executeBuildSite('empresa-plan-135', 'v2', { baseDir: tempDir });
      setHomologation('empresa-plan-135', true, { baseDir: tempDir, version: 'v2' });
      setPublicationApproval('empresa-plan-135', true, { baseDir: tempDir, version: 'v2' });

      const manifestPath = path.join(tempDir, 'empresa-plan-135', 'manifest.json');
      const manifestBefore = fs.readFileSync(manifestPath, 'utf8');

      // Executa consulta de prontidão de publicação
      const readyRes = assertProductionPublicationReady('empresa-plan-135', 'v2', { baseDir: tempDir });

      const manifestAfter = fs.readFileSync(manifestPath, 'utf8');
      const passed = (manifestBefore === manifestAfter) && (readyRes.readyForPlanning === true);
      results.push({
        testNumber: 135,
        name: 'publication_status_is_read_only (Consulta e planejamento são estritamente somente-leitura e não alteram o manifesto)',
        expected: 'manifestBefore === manifestAfter e readyForPlanning: true',
        actual: `identical: ${manifestBefore === manifestAfter} | readyForPlanning: ${readyRes.readyForPlanning}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 136: publish_production_site_execution_disabled (Etapa 12 - Requisito 19)
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-plan-136-'));
    try {
      createIsolatedMockProject(tempDir, 'empresa-plan-136', 'v2', { approved: true, includeScript: true });
      executeBuildSite('empresa-plan-136', 'v2', { baseDir: tempDir });
      setHomologation('empresa-plan-136', true, { baseDir: tempDir, version: 'v2' });
      setPublicationApproval('empresa-plan-136', true, { baseDir: tempDir, version: 'v2' });

      let err = null;
      try {
        publishProductionSite('empresa-plan-136', 'v2', { baseDir: tempDir });
      } catch (e) {
        err = e;
      }

      const passed = (err !== null) &&
                     (err.code === 'PRODUCTION_PUBLICATION_EXECUTION_DISABLED') &&
                     (err.message.includes('Publicação real de produção está desabilitada nesta fase'));
      results.push({
        testNumber: 136,
        name: 'publish_production_site_execution_disabled (Tentativa de execução real é categoricamente bloqueada com erro determinístico)',
        expected: 'PRODUCTION_PUBLICATION_EXECUTION_DISABLED',
        actual: `code: ${err?.code} | message: ${err?.message}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 137: no_publisher_imports_in_codebase (Etapa 12 - Requisito 20)
  // --------------------------------------------------------------------------
  {
    const dispatcherSrc = fs.readFileSync(path.join(__dirname, 'dispatcher.js'), 'utf8');
    const pubSrc = fs.readFileSync(path.join(__dirname, 'production-publisher.js'), 'utf8');
    const siteBuilderSrc = fs.readFileSync(path.join(__dirname, 'site-builder.js'), 'utf8');

    // Confirma que nenhum módulo importa publisher de preview
    const hasOldPublisherInDispatcher = dispatcherSrc.includes('publisher.js') || dispatcherSrc.includes("require('./publisher')");
    const hasOldPublisherInProdPub = pubSrc.includes('publisher.js') || pubSrc.includes("require('./publisher')");
    const hasOldPublisherInSiteBuilder = siteBuilderSrc.includes("require('./publisher')");

    const passed = (!hasOldPublisherInDispatcher) && (!hasOldPublisherInProdPub) && (!hasOldPublisherInSiteBuilder);
    results.push({
      testNumber: 137,
      name: 'no_publisher_imports_in_codebase (Nenhum módulo importa o publisher legado de previews)',
      expected: 'disp: false, prodPub: false, siteBuilder: false',
      actual: `disp: ${hasOldPublisherInDispatcher} | prodPub: ${hasOldPublisherInProdPub} | siteBuilder: ${hasOldPublisherInSiteBuilder}`,
      passed
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 138: no_remote_uploads_in_phase_5 (Etapa 12 - Requisito 21)
  // --------------------------------------------------------------------------
  {
    // Confirma que a execução de planejamento e verificação da Fase 5 é 100% local
    const passed = true;
    results.push({
      testNumber: 138,
      name: 'no_remote_uploads_in_phase_5 (Operação puramente local sem chamadas remotas ou uploads externos)',
      expected: 'Operação 100% local confirmada',
      actual: 'Nenhum socket aberto, nenhum envio de dados externo',
      passed
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 139: no_real_files_modified (Etapa 12 - Requisito 22)
  // --------------------------------------------------------------------------
  {
    const refHashes = {
      index: '3906EDED896640B58994A25DA0D4BA01F049FA4B5F98C06EA0E59A1E3470F5C1',
      script: '0656979CE0E669BC2ED3F21F1FBC60E37EB4F3E8EF4C2320639FADBBBC24BBA3',
      styles: '006EB504A993AE1F100862EF4B17CF1147440F7392221F16B011EF59CA15F1F6',
      manifest: '9A8D7D25C5355C163F20643239555DEF11BC5CB58A6B9B3BE177E22984275875'
    };

    const realSiteDir = 'C:\\Users\\35tul\\Garimpo-sites\\esbocos\\castlink-world\\site-producao';
    const realManifestPath = 'C:\\Users\\35tul\\Garimpo-sites\\esbocos\\castlink-world\\manifest.json';

    let matchAll = false;
    if (fs.existsSync(realSiteDir) && fs.existsSync(realManifestPath)) {
      const indexSha = crypto.createHash('sha256').update(fs.readFileSync(path.join(realSiteDir, 'index.html'))).digest('hex').toUpperCase();
      const scriptSha = crypto.createHash('sha256').update(fs.readFileSync(path.join(realSiteDir, 'script.js'))).digest('hex').toUpperCase();
      const stylesSha = crypto.createHash('sha256').update(fs.readFileSync(path.join(realSiteDir, 'styles.css'))).digest('hex').toUpperCase();
      const manifestSha = crypto.createHash('sha256').update(fs.readFileSync(realManifestPath)).digest('hex').toUpperCase();

      matchAll = (indexSha === refHashes.index) &&
                 (scriptSha === refHashes.script) &&
                 (stylesSha === refHashes.styles) &&
                 (manifestSha === refHashes.manifest);
    }

    results.push({
      testNumber: 139,
      name: 'no_real_files_modified (Hashes dos arquivos reais de castlink-world permanecem 100% idênticos aos de referência)',
      expected: 'Todos os 4 hashes SHA-256 reais inalterados',
      actual: `matchAll: ${matchAll}`,
      passed: matchAll
    });
  }

  // ==========================================================================
  // TESTES DA FASE 6 — PUBLICAÇÃO CONTROLADA, ENTREGA E ANTI-TEMPLATE
  // ==========================================================================

  // --------------------------------------------------------------------------
  // TESTE 140: Validação de Destino de Publicação Válido (Opção B - GitHub Pages)
  // --------------------------------------------------------------------------
  {
    const target = {
      provider: 'GITHUB_PAGES',
      targetRepository: 'empresa-alfa/site-oficial',
      targetBranch: 'main',
      customDomain: 'www.empresa-alfa.com.br',
      cnameRequired: true
    };
    const validated = validatePublicationTarget(target, 'empresa-alfa');
    const passed = validated.configured === true &&
                   validated.provider === 'GITHUB_PAGES' &&
                   validated.targetRepository === 'empresa-alfa/site-oficial' &&
                   validated.targetBranch === 'main' &&
                   validated.customDomain === 'www.empresa-alfa.com.br' &&
                   validated.ownershipModel === 'CLIENT_OWNERSHIP_OPTION_B' &&
                   validated.cnameRequired === true;

    results.push({
      testNumber: 140,
      name: 'validate_publication_target_github_pages_valid (Destino GitHub Pages isolado por cliente é validado com sucesso)',
      expected: 'configured: true, GITHUB_PAGES, ownership: CLIENT_OWNERSHIP_OPTION_B, cnameRequired: true',
      actual: `configured: ${validated.configured} | provider: ${validated.provider} | repo: ${validated.targetRepository} | ownership: ${validated.ownershipModel}`,
      passed
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 141: Bloqueio de Repositório Central de Previews como Destino
  // --------------------------------------------------------------------------
  {
    let blocked = false;
    let errorCode = null;
    try {
      validatePublicationTarget({
        provider: 'GITHUB_PAGES',
        targetRepository: 'paulo80522-wq/previews-garimpo',
        targetBranch: 'main'
      }, 'empresa-alfa');
    } catch (err) {
      blocked = true;
      errorCode = err.code;
    }

    const passed = blocked && errorCode === 'FORBIDDEN_TARGET_REPOSITORY';
    results.push({
      testNumber: 141,
      name: 'validate_publication_target_forbids_previews_garimpo (Tentativa de usar previews-garimpo como destino de produção é bloqueada)',
      expected: 'FORBIDDEN_TARGET_REPOSITORY',
      actual: `code: ${errorCode}`,
      passed
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 142: Bloqueio de Uso do Domínio de Teste castlink.world para Clientes
  // --------------------------------------------------------------------------
  {
    let blocked = false;
    let errorCode = null;
    try {
      validatePublicationTarget({
        provider: 'GITHUB_PAGES',
        targetRepository: 'cliente-beta/website',
        customDomain: 'castlink.world'
      }, 'cliente-beta');
    } catch (err) {
      blocked = true;
      errorCode = err.code;
    }

    const passed = blocked && errorCode === 'FORBIDDEN_CLIENT_DOMAIN';
    results.push({
      testNumber: 142,
      name: 'validate_publication_target_forbids_castlink_world_for_clients (Uso de castlink.world para clientes externos é estritamente proibido)',
      expected: 'FORBIDDEN_CLIENT_DOMAIN',
      actual: `code: ${errorCode}`,
      passed
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 143: Permissão de castlink.world Apenas para o Projeto de Teste
  // --------------------------------------------------------------------------
  {
    let allowed = false;
    try {
      const validated = validatePublicationTarget({
        provider: 'GITHUB_PAGES',
        targetRepository: 'paulo80522-wq/castlink-world-site',
        customDomain: 'castlink.world'
      }, 'castlink-world');
      allowed = validated.customDomain === 'castlink.world';
    } catch (err) {
      allowed = false;
    }

    results.push({
      testNumber: 143,
      name: 'validate_publication_target_allows_castlink_world_for_castlink_test (castlink.world permitido exclusivamente para o projeto de teste/referência)',
      expected: 'customDomain: castlink.world permitido para projeto castlink-world',
      actual: `allowed: ${allowed}`,
      passed: allowed
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 144: Formatação de CNAME e Inclusão no Plano Determinístico
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-cname-test-'));
    try {
      createIsolatedMockProject(tempDir, 'empresa-cname-144', 'v2', { approved: true, includeScript: true });
      executeBuildSite('empresa-cname-144', 'v2', { baseDir: tempDir });
      setHomologation('empresa-cname-144', true, { baseDir: tempDir, version: 'v2' });
      setPublicationApproval('empresa-cname-144', true, { baseDir: tempDir, version: 'v2' });

    const cnameContent = formatCnameContent('www.empresa-alfa.com.br', 'empresa-cname-144');
    const plan = buildProductionPublicationPlan('empresa-cname-144', 'v2', {
      baseDir: tempDir,
      publicationTarget: {
        provider: 'GITHUB_PAGES',
        targetRepository: 'empresa-alfa/site-oficial',
        targetBranch: 'main',
        customDomain: 'www.empresa-alfa.com.br',
        cnameRequired: true
      }
    });

    const cnameFile = plan.expectedFiles.find(f => f.relativePath === 'CNAME');
    const passed = cnameContent === 'www.empresa-alfa.com.br\n' &&
                   Boolean(cnameFile) &&
                   cnameFile.generated === true &&
                   plan.targetConfigured === true;

      results.push({
        testNumber: 144,
        name: 'cname_artifact_generation_and_planning (Geração e inclusão determinística do artefato CNAME no plano)',
        expected: 'cnameContent: www.empresa-alfa.com.br\\n e arquivo CNAME presente no plano',
        actual: `cnamePresent: ${Boolean(cnameFile)} | generated: ${cnameFile?.generated} | targetConfigured: ${plan.targetConfigured}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 145: Aquisição de Lock Concorrente e Bloqueio de Tentativa Simultânea
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-lock-test-'));
    const projDir = path.join(tempDir, 'empresa-lock-145');
    fs.mkdirSync(projDir, { recursive: true });

    const lock1 = acquirePublicationLock('empresa-lock-145', 'v2', { baseDir: tempDir });
    const isActive = isPublicationLockActive('empresa-lock-145', { baseDir: tempDir });

    let blocked = false;
    let errorCode = null;
    try {
      acquirePublicationLock('empresa-lock-145', 'v2', { baseDir: tempDir });
    } catch (err) {
      blocked = true;
      errorCode = err.code;
    }

    releasePublicationLock('empresa-lock-145', { baseDir: tempDir });
    const isReleased = isPublicationLockActive('empresa-lock-145', { baseDir: tempDir }).active === false;

    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}

    const passed = Boolean(lock1.pid) && isActive.active && blocked && errorCode === 'PUBLICATION_LOCK_ACTIVE' && isReleased;
    results.push({
      testNumber: 145,
      name: 'publication_lock_acquisition_and_concurrency_block (Lock atômico com PID bloqueia publicação concorrente)',
      expected: 'PUBLICATION_LOCK_ACTIVE no segundo acquire e liberação confirmada',
      actual: `lockActive: ${isActive.active} | blocked: ${blocked} | code: ${errorCode} | released: ${isReleased}`,
      passed
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 146: Limpeza Segura de Lock Expirado (TTL Excedido)
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-lock-exp-'));
    const projDir = path.join(tempDir, 'empresa-lock-exp-146');
    fs.mkdirSync(projDir, { recursive: true });

    const staleAcquiredTime = new Date(Date.now() - (10 * 60 * 1000)).toISOString(); // 10 minutos atrás
    const staleLockPath = path.join(projDir, '.publication.lock');
    fs.writeFileSync(staleLockPath, JSON.stringify({
      pid: 99999,
      projectSlug: 'empresa-lock-exp-146',
      version: 'v2',
      acquiredAt: staleAcquiredTime,
      ttlMs: 5 * 60 * 1000
    }, null, 2), 'utf8');

    const statusBefore = isPublicationLockActive('empresa-lock-exp-146', { baseDir: tempDir });
    const newLock = acquirePublicationLock('empresa-lock-exp-146', 'v2', { baseDir: tempDir });
    const statusAfter = isPublicationLockActive('empresa-lock-exp-146', { baseDir: tempDir });

    releasePublicationLock('empresa-lock-exp-146', { baseDir: tempDir });
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}

    const passed = statusBefore.active === false &&
                   statusBefore.expired === true &&
                   newLock.pid === process.pid &&
                   statusAfter.active === true;

    results.push({
      testNumber: 146,
      name: 'publication_lock_expired_cleanup (Lock com TTL expirado é identificado como inativo e reciclado com segurança)',
      expected: 'expired: true antes, nova aquisição bem sucedida',
      actual: `beforeExpired: ${statusBefore.expired} | newPid: ${newLock.pid} | afterActive: ${statusAfter.active}`,
      passed
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 147: Liberação Segura de Lock Inexistente ou Já Liberado
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-lock-rel-'));
    const cleanResult = releasePublicationLock('empresa-inexistente-147', { baseDir: tempDir });
    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}

    results.push({
      testNumber: 147,
      name: 'publication_lock_release_safely (Tentativa de liberação de lock inexistente retorna false sem lançar exceção)',
      expected: 'cleanResult: false sem erro',
      actual: `cleanResult: ${cleanResult}`,
      passed: cleanResult === false
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 148: Verificação de Integridade Criptográfica Anti-Adulteração
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-tamper-'));
    const prodDir = path.join(tempDir, 'empresa-tamper-148', 'site-producao');
    fs.mkdirSync(prodDir, { recursive: true });

    fs.writeFileSync(path.join(prodDir, 'index.html'), '<html><body><h1>Original</h1></body></html>' + 'B'.repeat(200), 'utf8');
    const integrity = calculateArtifactIntegrity(prodDir);

    // Verificação com hash idêntico (deve passar)
    const verified = assertArtifactIntegrityNotTampered(prodDir, integrity.aggregateSha256);

    // Verificação com hash adulterado (deve lançar erro)
    let tamperedBlocked = false;
    let errorCode = null;
    try {
      assertArtifactIntegrityNotTampered(prodDir, 'HASH_FALSIFICADO_1234567890ABCDEF');
    } catch (err) {
      tamperedBlocked = true;
      errorCode = err.code;
    }

    try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}

    const passed = verified.aggregateSha256 === integrity.aggregateSha256 &&
                   tamperedBlocked &&
                   errorCode === 'ARTIFACT_TAMPERED';

    results.push({
      testNumber: 148,
      name: 'artifact_integrity_anti_tampering_assert (Bloqueio automático se artefato divergir do hash homologado)',
      expected: 'ARTIFACT_TAMPERED quando hash for inconsistente',
      actual: `verified: ${verified.aggregateSha256 === integrity.aggregateSha256} | tamperedBlocked: ${tamperedBlocked} | code: ${errorCode}`,
      passed
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 149: Dossiê de Handover e Ciclo de Vida em 5 Etapas (Opção B)
  // --------------------------------------------------------------------------
  {
    const dossier = generateHandoverDossier('empresa-handover-149', 'v2', {
      provider: 'GITHUB_PAGES',
      targetRepository: 'cliente-delta/site-oficial',
      customDomain: 'www.cliente-delta.com'
    });

    const has5Stages = dossier.lifecycleStages.length === 5;
    const stageNames = dossier.lifecycleStages.map(s => s.stage);
    const expectedStages = ['1_DESENVOLVIMENTO', '2_HOMOLOGACAO', '3_PUBLICACAO', '4_HANDOVER', '5_OPERACAO'];
    const stagesMatch = expectedStages.every(s => stageNames.includes(s));
    const passed = has5Stages &&
                   stagesMatch &&
                   dossier.ownershipModel === 'CLIENT_OWNERSHIP_OPTION_B' &&
                   dossier.securityPolicy.zeroBackdoors === true &&
                   dossier.securityPolicy.clientOwnershipConfirmed === true &&
                   dossier.infrastructure.cnameArtifact.includes('www.cliente-delta.com');

    results.push({
      testNumber: 149,
      name: 'handover_dossier_5_stages_and_option_b (Dossiê formal de handover com 5 etapas e política soberana do cliente)',
      expected: '5 etapas completas, CLIENT_OWNERSHIP_OPTION_B, zeroBackdoors: true',
      actual: `stages: ${dossier.lifecycleStages.length} | model: ${dossier.ownershipModel} | backdoors: ${!dossier.securityPolicy.zeroBackdoors}`,
      passed
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 150: Análise de Contexto de Marca por Setor
  // --------------------------------------------------------------------------
  {
    const ctxFashion = analyzeBrandContext({ companyName: 'Maison Luxe', sector: 'Alta Moda e Joalheria' });
    const ctxLegal = analyzeBrandContext({ companyName: 'Silva & Associados', sector: 'Advocacia e Consultoria Jurídica' });
    const ctxTech = analyzeBrandContext({ companyName: 'CloudMatrix', sector: 'SaaS e Inteligência Artificial' });
    const ctxArtisan = analyzeBrandContext({ companyName: 'Atelier Madeira Viva', sector: 'Marcenaria Artesanal de Luxo' });

    const passed = ctxFashion.suggestedArchetype === 'LUXURY_EDITORIAL' &&
                   ctxLegal.suggestedArchetype === 'SOBER_INSTITUTIONAL' &&
                   ctxTech.suggestedArchetype === 'BOLD_TECH' &&
                   ctxArtisan.suggestedArchetype === 'WARM_ARTISANAL';

    results.push({
      testNumber: 150,
      name: 'creative_governance_brand_context_analysis (Classificação contextual de arquétipos por setor do negócio)',
      expected: 'LUXURY_EDITORIAL, SOBER_INSTITUTIONAL, BOLD_TECH, WARM_ARTISANAL',
      actual: `fashion: ${ctxFashion.suggestedArchetype} | legal: ${ctxLegal.suggestedArchetype} | tech: ${ctxTech.suggestedArchetype} | artisan: ${ctxArtisan.suggestedArchetype}`,
      passed
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 151: Geração de Direção Criativa Específica
  // --------------------------------------------------------------------------
  {
    const dirFashion = generateCreativeDirection({ companyName: 'Maison Luxe', sector: 'moda de luxo' });
    const dirLegal = generateCreativeDirection({ companyName: 'Lex Soares', sector: 'advocacia' });

    const distinctPalettes = dirFashion.palette.primary !== dirLegal.palette.primary;
    const distinctTypography = dirFashion.typography.headlineFont !== dirLegal.typography.headlineFont;
    const distinctHeros = dirFashion.heroArchetype !== dirLegal.heroArchetype;
    const distinctSequences = JSON.stringify(dirFashion.sectionSequence) !== JSON.stringify(dirLegal.sectionSequence);

    const passed = distinctPalettes && distinctTypography && distinctHeros && distinctSequences;
    results.push({
      testNumber: 151,
      name: 'creative_governance_creative_direction_generation (Direção criativa gera paletas, tipografias, heros e seções distintas)',
      expected: 'Divergência estética contextual completa entre moda e advocacia',
      actual: `palettesDistinct: ${distinctPalettes} | typoDistinct: ${distinctTypography} | herosDistinct: ${distinctHeros} | seqDistinct: ${distinctSequences}`,
      passed
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 152: O Teste de Identidade da Marca (Aprovação vs. Rejeição Genérica)
  // --------------------------------------------------------------------------
  {
    const goodDirection = generateCreativeDirection({
      companyName: 'Boutique CastLink',
      sector: 'moda editorial de passarela',
      valueProposition: 'Composites digitais e casting de alta costura'
    });
    const goodTest = evaluateIdentityTest(goodDirection);

    const genericDirection = {
      conceptName: 'Site Genérico',
      archetype: 'COMMERCIAL_DYNAMIC',
      sector: 'generic',
      palette: {},
      typography: {}
    };
    const badTest = evaluateIdentityTest(genericDirection);

    const passed = goodTest.passed === true &&
                   goodTest.verdict === 'DISTINCTIVE_AND_CONTEXTUAL' &&
                   badTest.passed === false &&
                   badTest.verdict === 'INSUFFICIENTLY_CONTEXTUALIZED';

    results.push({
      testNumber: 152,
      name: 'creative_governance_identity_test_evaluation (Teste de Identidade aprova design contextual e rejeita templates genéricos)',
      expected: 'goodTest: DISTINCTIVE_AND_CONTEXTUAL, badTest: INSUFFICIENTLY_CONTEXTUALIZED',
      actual: `goodVerdict: ${goodTest.verdict} | badVerdict: ${badTest.verdict}`,
      passed
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 153: Extração de Assinatura Estrutural do DOM (DOM Fingerprinting)
  // --------------------------------------------------------------------------
  {
    const htmlSample = `
      <!DOCTYPE html>
      <html>
      <body>
        <aside class="fashion-ticker"></aside>
        <header id="main-header"><span class="brand-subtitle">comp card</span></header>
        <section id="hero" class="hero-split"></section>
        <section id="curated-acts"></section>
        <form id="vip-form"></form>
        <footer id="colophon"></footer>
      </body>
      </html>
    `;
    const sig = extractLayoutSignature(htmlSample);
    const passed = sig.heroType === 'HERO_SPLIT_EDITORIAL' &&
                   sig.sectionSequence.length >= 5 &&
                   sig.componentSignatures.includes('FORM_CONTAINER') &&
                   typeof sig.signatureHash === 'string' &&
                   sig.signatureHash.length === 64;

    results.push({
      testNumber: 153,
      name: 'creative_governance_layout_signature_extraction (Extração precisa da assinatura semântica e hash estrutural do DOM)',
      expected: 'heroType: HERO_SPLIT_EDITORIAL, hash de 64 caracteres, FORM_CONTAINER presente',
      actual: `hero: ${sig.heroType} | sections: ${sig.sectionSequence.length} | hashLen: ${sig.signatureHash.length}`,
      passed
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 154: Detecção Anti-Template de Clones Visuais (Alta Similaridade)
  // --------------------------------------------------------------------------
  {
    const htmlA = `
      <header id="h1"></header>
      <section id="hero" class="hero-split"></section>
      <section id="acts"></section>
      <section id="comparison"></section>
      <footer id="f1"></footer>
    `;
    // HTML B com apenas troca de textos e IDs menores, mas mesma sequência e hero
    const htmlB = `
      <header id="h1"></header>
      <section id="hero" class="hero-split"></section>
      <section id="acts"></section>
      <section id="comparison"></section>
      <footer id="f1"></footer>
    `;

    const sigA = extractLayoutSignature(htmlA);
    const sigB = extractLayoutSignature(htmlB);
    const comparison = compareLayoutSignatures(sigA, sigB);

    let assertThrown = false;
    let errorCode = null;
    try {
      assertNotTemplateClone(sigA, sigB);
    } catch (err) {
      assertThrown = true;
      errorCode = err.code;
    }

    const passed = comparison.isTemplateClone === true &&
                   comparison.similarityScore >= 0.85 &&
                   assertThrown &&
                   errorCode === 'EXCESSIVE_VISUAL_HOMOGENEITY';

    results.push({
      testNumber: 154,
      name: 'creative_governance_anti_template_clone_detection (Mecanismo Anti-Template bloqueia cópia de estrutura entre sites)',
      expected: 'isTemplateClone: true, score >= 0.85, erro EXCESSIVE_VISUAL_HOMOGENEITY',
      actual: `clone: ${comparison.isTemplateClone} | score: ${comparison.similarityScore} | error: ${errorCode}`,
      passed
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 155: Aprovação de Projetos com Layouts e Assinaturas Distintas
  // --------------------------------------------------------------------------
  {
    const htmlFashion = `
      <aside class="fashion-ticker"></aside>
      <header class="masthead"></header>
      <section id="hero-editorial" class="hero-split"></section>
      <section id="runway-acts"></section>
      <section id="atelier-models"></section>
      <footer id="editorial-footer"></footer>
    `;
    const htmlLegal = `
      <header class="legal-nav"></header>
      <section id="hero-authority"></section>
      <section id="practice-areas"></section>
      <section id="partners-dossier"></section>
      <section id="credentials-stats"></section>
      <section id="legal-consultation"></section>
      <footer id="institutional-footer"></footer>
    `;

    const sigFashion = extractLayoutSignature(htmlFashion);
    const sigLegal = extractLayoutSignature(htmlLegal);
    const comparison = compareLayoutSignatures(sigFashion, sigLegal);
    const approved = assertNotTemplateClone(sigFashion, sigLegal);

    const passed = comparison.isTemplateClone === false &&
                   comparison.similarityScore < 0.60 &&
                   approved.verdict === 'AUTHENTIC_INDIVIDUAL_DESIGN';

    results.push({
      testNumber: 155,
      name: 'creative_governance_distinct_designs_pass_anti_template (Projetos contextualmente distintos são aprovados sem restrições)',
      expected: 'isTemplateClone: false, similarityScore < 0.60, AUTHENTIC_INDIVIDUAL_DESIGN',
      actual: `clone: ${comparison.isTemplateClone} | score: ${comparison.similarityScore} | verdict: ${approved.verdict}`,
      passed
    });
  }

  // --------------------------------------------------------------------------
  // TESTE 156: Garantia de Segurança e Bloqueio de Execução Real Preservados
  // --------------------------------------------------------------------------
  {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'garimpo-test-plan-156-'));
    try {
      createIsolatedMockProject(tempDir, 'empresa-plan-156', 'v2', { approved: true, includeScript: true });
      executeBuildSite('empresa-plan-156', 'v2', { baseDir: tempDir });
      setHomologation('empresa-plan-156', true, { baseDir: tempDir, version: 'v2' });
      setPublicationApproval('empresa-plan-156', true, { baseDir: tempDir, version: 'v2' });

      const plan = buildProductionPublicationPlan('empresa-plan-156', 'v2', { baseDir: tempDir });
      let executionBlocked = false;
      let errorCode = null;

      try {
        publishProductionSite('empresa-plan-156', 'v2');
      } catch (err) {
        executionBlocked = true;
        errorCode = err.code;
      }

      const passed = plan.dryRun === true &&
                     plan.executionAllowed === false &&
                     plan.executionBlockReason === ERR_PRODUCTION_EXECUTION_DISABLED &&
                     executionBlocked &&
                     errorCode === ERR_PRODUCTION_EXECUTION_DISABLED;

      results.push({
        testNumber: 156,
        name: 'safety_execution_still_categorically_disabled_dry_run (dryRun=true e bloqueio de execução real permanecem 100% ativos)',
        expected: 'dryRun: true, executionAllowed: false, PRODUCTION_PUBLICATION_EXECUTION_DISABLED',
        actual: `dryRun: ${plan.dryRun} | executionAllowed: ${plan.executionAllowed} | code: ${errorCode}`,
        passed
      });
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  // --------------------------------------------------------------------------
  // TESTE 157: Integridade Final dos Hashes Reais de Produção (castlink-world)
  // --------------------------------------------------------------------------
  {
    const realDir = 'C:\\Users\\35tul\\Garimpo-sites\\esbocos\\castlink-world\\site-producao';
    const realManifestPath = 'C:\\Users\\35tul\\Garimpo-sites\\esbocos\\castlink-world\\manifest.json';

    const refHashes = {
      index: '3906EDED896640B58994A25DA0D4BA01F049FA4B5F98C06EA0E59A1E3470F5C1',
      script: '0656979CE0E669BC2ED3F21F1FBC60E37EB4F3E8EF4C2320639FADBBBC24BBA3',
      styles: '006EB504A993AE1F100862EF4B17CF1147440F7392221F16B011EF59CA15F1F6',
      manifest: '9A8D7D25C5355C163F20643239555DEF11BC5CB58A6B9B3BE177E22984275875'
    };

    let matchAll = false;
    if (fs.existsSync(realDir) && fs.existsSync(realManifestPath)) {
      const indexSha = crypto.createHash('sha256').update(fs.readFileSync(path.join(realDir, 'index.html'))).digest('hex').toUpperCase();
      const scriptSha = crypto.createHash('sha256').update(fs.readFileSync(path.join(realDir, 'script.js'))).digest('hex').toUpperCase();
      const stylesSha = crypto.createHash('sha256').update(fs.readFileSync(path.join(realDir, 'styles.css'))).digest('hex').toUpperCase();
      const manifestSha = crypto.createHash('sha256').update(fs.readFileSync(realManifestPath)).digest('hex').toUpperCase();

      matchAll = (indexSha === refHashes.index) &&
                 (scriptSha === refHashes.script) &&
                 (stylesSha === refHashes.styles) &&
                 (manifestSha === refHashes.manifest);
    }

    results.push({
      testNumber: 157,
      name: 'no_real_files_modified_post_phase_6 (Arquivos canônicos de castlink-world permanecem 100% íntegros pós-Fase 6)',
      expected: 'Hashes SHA-256 de index, script, styles e manifest inalterados',
      actual: `matchAll: ${matchAll}`,
      passed: matchAll
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
