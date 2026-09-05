/**
 * EXECUTOR DE E-MAIL (COMPONENTE DETERMINÍSTICO DE GATE)
 * Garimpo Sites - Esboços & Comunicação
 * 
 * ARQUITETURA:
 * GARIMPO -> MAESTRO -> AGENTE DE COMUNICAÇÃO -> MINUTA -> PENDING_APPROVAL -> (Aprovação Humana) -> APPROVED -> EXECUTOR DE E-MAIL -> Futuro Gmail
 * 
 * REGRAS OBRIGATÓRIAS DO GATE (TODAS DEVEM SER VERDADEIRAS):
 * 1. O manifest.json existe e é válido.
 * 2. A versão/oportunidade corresponde ao artefato que será enviado.
 * 3. status === "APPROVED"
 * 4. approvedBy === "Paulo Nunes"
 * 5. approvedAt existe e é uma data ISO válida.
 * 6. approvalGate.decision === "APROVAR"
 * 7. publicPreview.commercialApproval === true
 * 8. Existe uma minuta válida correspondente à oportunidade.
 * 9. O destinatário está explicitamente definido e é válido.
 * 10. O remetente corresponde ao endereço oficial: paulonunes.consultoriadigital@gmail.com
 * 
 * Se qualquer condição falhar: ABORTAR.
 * NUNCA tentar enviar.
 * NUNCA alterar automaticamente o manifest para APPROVED.
 * NUNCA interpretar DRAFT, REVIEW ou PENDING_APPROVAL como aprovação.
 * NUNCA aceitar "aprovado" apenas porque foi escrito por LLM.
 * 
 * MODO DESTA ETAPA: DRY-RUN ESTRITO (Sem chamadas externas, sem HTTP, sem SMTP, sem OAuth).
 */

const fs = require('fs');
const path = require('path');
const { sendViaGmailApi } = require('./gmail-client');
const {
  buildProductionSite,
  validateProductionSite,
  validateProjectSlug,
  validateVersion,
  resolveCanonicalDestination,
  assertValidCanonicalDestination
} = require('./site-builder');

const OFFICIAL_SENDER = 'paulonunes.consultoriadigital@gmail.com';
const REQUIRED_APPROVER = 'Paulo Nunes';
const REQUIRED_DECISION = 'APROVAR';
const REQUIRED_STATUS = 'APPROVED';

const BUILD_DECISION_PENDING = 'PENDING';
const BUILD_DECISION_APPROVED = 'APPROVED';
const BUILD_DECISION_REJECTED = 'REJECTED';
const VALID_BUILD_DECISIONS = [BUILD_DECISION_PENDING, BUILD_DECISION_APPROVED, BUILD_DECISION_REJECTED];

const BUILD_STATUS_PENDING = 'PENDENTE';
const BUILD_STATUS_APPROVED = 'APROVADA';
const BUILD_STATUS_REJECTED = 'REJEITADA';
const VALID_BUILD_STATUSES = [BUILD_STATUS_PENDING, BUILD_STATUS_APPROVED, BUILD_STATUS_REJECTED];

const HOMOLOGATION_DECISION_PENDING = 'PENDING';
const HOMOLOGATION_DECISION_APPROVED = 'APPROVED';
const HOMOLOGATION_DECISION_REJECTED = 'REJECTED';
const VALID_HOMOLOGATION_DECISIONS = [HOMOLOGATION_DECISION_PENDING, HOMOLOGATION_DECISION_APPROVED, HOMOLOGATION_DECISION_REJECTED];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Lê e analisa JSON de forma segura, removendo UTF-8 BOM se presente.
 */
function readJsonSafely(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(content.replace(/^\uFEFF/, ''));
}

/**
 * Localiza o arquivo de minuta correspondente ao projeto e versão.
 */
function findMinutaFile(projectDir, projectSlug, version) {
  const possibleNames = [
    `minuta_abordagem_${projectSlug}_${version}.md`,
    `minuta_abordagem_${projectSlug}.md`,
    `minuta_${projectSlug}_${version}.md`,
    `minuta_${projectSlug}.md`
  ];

  for (const name of possibleNames) {
    const filePath = path.join(projectDir, name);
    if (fs.existsSync(filePath)) {
      return filePath;
    }
  }

  // Busca genérica por arquivos que iniciem com 'minuta' e terminem com '.md'
  if (fs.existsSync(projectDir)) {
    const files = fs.readdirSync(projectDir);
    const minuta = files.find(f => f.toLowerCase().startsWith('minuta') && f.toLowerCase().endsWith('.md'));
    if (minuta) {
      return path.join(projectDir, minuta);
    }
  }

  return null;
}

/**
 * Extrai campos estruturados do arquivo de minuta Markdown.
 */
function parseMinuta(content) {
  if (!content || typeof content !== 'string') {
    return {
      recipient: null,
      sender: null,
      subject: null,
      bodyText: null,
      hasContent: false
    };
  }

  let recipient = null;
  let sender = null;
  let subject = null;

  // Extrai E-mail de Referência / Destinatário
  const recipientMatch = content.match(/(?:E-mail de Referência|Destinatário|Para):\s*([^\r\n]+)/i);
  if (recipientMatch) {
    const candidate = recipientMatch[1].trim();
    const emailMatch = candidate.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (emailMatch) {
      recipient = emailMatch[0].trim();
    }
  }

  // Extrai E-mail Oficial / Remetente
  const senderMatch = content.match(/(?:E-mail Oficial|Remetente):\s*([^\r\n]+)/i);
  if (senderMatch) {
    const candidate = senderMatch[1].trim();
    const emailMatch = candidate.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (emailMatch) {
      sender = emailMatch[0].trim();
    }
  }

  // Extrai Assunto
  const subjectMatch = content.match(/\*\*Assunto:\*\*\s*([^\r\n]+)/i) || content.match(/Assunto:\s*([^\r\n]+)/i);
  if (subjectMatch) {
    subject = subjectMatch[1].trim();
  }

  // Extrai corpo principal (seção 3 de abordagem consultiva ou texto após o assunto)
  let bodyText = '';
  const bodyIndex = content.indexOf('**Mensagem:**');
  if (bodyIndex !== -1) {
    bodyText = content.substring(bodyIndex + '**Mensagem:**'.length).trim();
    const endSectionIndex = bodyText.indexOf('### 4.');
    if (endSectionIndex !== -1) {
      bodyText = bodyText.substring(0, endSectionIndex).trim();
    }
  } else {
    bodyText = content.trim();
  }

  return {
    recipient,
    sender,
    subject,
    bodyText,
    hasContent: content.trim().length > 50
  };
}

/**
 * Validação Determinística do Gate de Aprovação para Envio de E-mail.
 * Retorna resultado estruturado indicando se é permitido ou bloqueado, com o motivo exato.
 */
function validateEmailGate(projectSlug, version, options = {}) {
  // Por padrão busca no diretório esbocos de Garimpo-sites, ou relativo
  const defaultGarimpoDir = 'C:\\Users\\35tul\\Garimpo-sites\\esbocos';
  const baseDir = options.baseDir || (fs.existsSync(defaultGarimpoDir) ? defaultGarimpoDir : path.join(__dirname, '..', 'esbocos'));
  const projectDir = path.join(baseDir, projectSlug);
  const manifestPath = path.join(projectDir, 'manifest.json');

  const validationLog = [];
  const errors = [];

  function recordCheck(name, passed, message) {
    validationLog.push({ check: name, passed, message });
    if (!passed) {
      errors.push(`[${name}] ${message}`);
    }
  }

  // Permite override de manifest para testes controlados em memória
  let manifest = options.manifestOverride || null;

  // 1. EXISTÊNCIA E LEITURA DO MANIFEST.JSON
  if (!manifest) {
    if (!fs.existsSync(manifestPath)) {
      recordCheck('MANIFEST_EXISTS', false, `Arquivo manifest.json não encontrado em: ${manifestPath}`);
      return {
        allowed: false,
        reason: 'MANIFEST_NOT_FOUND',
        status: null,
        errors,
        validationLog
      };
    }

    try {
      const rawContent = fs.readFileSync(manifestPath, 'utf8');
      manifest = JSON.parse(rawContent);
      recordCheck('MANIFEST_EXISTS', true, 'manifest.json carregado com sucesso');
    } catch (err) {
      recordCheck('MANIFEST_VALID_JSON', false, `Erro ao processar manifest.json: ${err.message}`);
      return {
        allowed: false,
        reason: 'INVALID_MANIFEST_JSON',
        status: null,
        errors,
        validationLog
      };
    }
  } else {
    recordCheck('MANIFEST_EXISTS', true, 'manifest fornecido via in-memory fixture');
  }

  const currentStatus = manifest.status || 'UNKNOWN';

  // 2. CORRESPONDÊNCIA DE VERSÃO E OPORTUNIDADE
  const targetVersion = version || manifest.version;
  const versionMatches = (manifest.version === targetVersion);
  recordCheck(
    'VERSION_MATCH',
    versionMatches,
    versionMatches
      ? `Versão validada: ${targetVersion}`
      : `Versão informada (${targetVersion}) difere da versão do manifest (${manifest.version})`
  );

  const slugMatches = !manifest.projectSlug || (manifest.projectSlug === projectSlug);
  recordCheck(
    'SLUG_MATCH',
    slugMatches,
    slugMatches
      ? `ProjectSlug validado: ${projectSlug}`
      : `ProjectSlug (${projectSlug}) difere do manifest (${manifest.projectSlug})`
  );

  // 3. VALIDAÇÃO DO STATUS DO PROJETO (status === "APPROVED")
  if (currentStatus === 'PENDING_APPROVAL') {
    recordCheck('STATUS_APPROVED', false, 'O projeto encontra-se em PENDING_APPROVAL aguardando deliberação soberana de Paulo Nunes.');
    return {
      allowed: false,
      reason: 'APPROVAL_REQUIRED',
      status: 'PENDING_APPROVAL',
      message: 'BLOQUEIO POR GOVERNANÇA: O projeto está em PENDING_APPROVAL. Envio bloqueado até aprovação formal.',
      errors,
      validationLog
    };
  }

  if (currentStatus === 'DRAFT') {
    recordCheck('STATUS_APPROVED', false, 'O projeto encontra-se em DRAFT. Rascunhos não possuem autorização de envio.');
    return {
      allowed: false,
      reason: 'DRAFT_NOT_AUTHORIZED',
      status: 'DRAFT',
      message: 'BLOQUEIO POR GOVERNANÇA: O projeto está em DRAFT. Envio proibido.',
      errors,
      validationLog
    };
  }

  if (currentStatus !== REQUIRED_STATUS) {
    recordCheck('STATUS_APPROVED', false, `Status atual '${currentStatus}' é inválido. Esperado: '${REQUIRED_STATUS}'.`);
    return {
      allowed: false,
      reason: 'INVALID_STATUS',
      status: currentStatus,
      message: `BLOQUEIO POR GOVERNANÇA: Status '${currentStatus}' não autoriza envio.`,
      errors,
      validationLog
    };
  }
  recordCheck('STATUS_APPROVED', true, `Status é '${REQUIRED_STATUS}'`);

  // 4. VALIDAÇÃO DO APROVADOR (approvedBy === "Paulo Nunes")
  const approverValid = (manifest.approvedBy === REQUIRED_APPROVER);
  recordCheck(
    'APPROVED_BY_VALID',
    approverValid,
    approverValid
      ? `Aprovador formal validado: '${REQUIRED_APPROVER}'`
      : `Aprovador inválido ou ausente: '${manifest.approvedBy}'. Esperado: '${REQUIRED_APPROVER}'`
  );

  // 5. VALIDAÇÃO DO TIMESTAMP DE APROVAÇÃO (approvedAt válido)
  const hasApprovedAt = Boolean(manifest.approvedAt && typeof manifest.approvedAt === 'string');
  const timestampParsed = hasApprovedAt ? Date.parse(manifest.approvedAt) : NaN;
  const approvedAtValid = hasApprovedAt && !isNaN(timestampParsed);
  recordCheck(
    'APPROVED_AT_VALID',
    approvedAtValid,
    approvedAtValid
      ? `Timestamp de aprovação válido: ${manifest.approvedAt}`
      : `Timestamp de aprovação ausente ou inválido: '${manifest.approvedAt}'`
  );

  // 6. VALIDAÇÃO DA DECISÃO DO GATE (approvalGate.decision === "APROVAR")
  const gateObj = manifest.approvalGate || {};
  const decisionValid = (gateObj.decision === REQUIRED_DECISION);
  recordCheck(
    'GATE_DECISION_VALID',
    decisionValid,
    decisionValid
      ? `Decisão do Gate validada: '${REQUIRED_DECISION}'`
      : `Decisão do Gate inválida ou ausente: '${gateObj.decision}'. Esperado: '${REQUIRED_DECISION}'`
  );

  // 7. VALIDAÇÃO DA APROVAÇÃO COMERCIAL (publicPreview.commercialApproval === true)
  const previewObj = manifest.publicPreview || {};
  const commercialApprovalValid = (previewObj.commercialApproval === true);
  recordCheck(
    'COMMERCIAL_APPROVAL_VALID',
    commercialApprovalValid,
    commercialApprovalValid
      ? 'Aprovação comercial confirmada (commercialApproval === true)'
      : 'Aprovação comercial ausente (publicPreview.commercialApproval !== true)'
  );

  // 8. VALIDAÇÃO DA EXISTÊNCIA E CONTEÚDO DA MINUTA
  let minutaContent = options.minutaOverride || null;
  let minutaPath = null;

  if (!minutaContent) {
    minutaPath = findMinutaFile(projectDir, projectSlug, targetVersion);
    if (!minutaPath || !fs.existsSync(minutaPath)) {
      recordCheck('MINUTA_EXISTS', false, `Arquivo de minuta não encontrado no diretório: ${projectDir}`);
    } else {
      minutaContent = fs.readFileSync(minutaPath, 'utf8');
      recordCheck('MINUTA_EXISTS', true, `Minuta encontrada: ${path.basename(minutaPath)}`);
    }
  } else {
    recordCheck('MINUTA_EXISTS', true, 'Minuta fornecida via in-memory fixture');
  }

  const parsedMinuta = parseMinuta(minutaContent);
  const minutaHasSubstance = Boolean(minutaContent && parsedMinuta.hasContent);
  recordCheck(
    'MINUTA_SUBSTANCE_VALID',
    minutaHasSubstance,
    minutaHasSubstance
      ? `Minuta possui conteúdo válido (${minutaContent ? minutaContent.length : 0} caracteres)`
      : 'Minuta vazia, ilegível ou inexistente'
  );

  // 9. VALIDAÇÃO DO DESTINATÁRIO
  // Prioridade: override -> manifest.referenceEmail -> minuta.recipient -> manifest.commercialReference.recipientEmail
  let recipient = options.recipientOverride
    || manifest.referenceEmail
    || parsedMinuta.recipient
    || (manifest.commercialReference && manifest.commercialReference.recipientEmail)
    || null;

  const recipientValid = Boolean(recipient && typeof recipient === 'string' && EMAIL_REGEX.test(recipient.trim()));
  recordCheck(
    'RECIPIENT_VALID',
    recipientValid,
    recipientValid
      ? `Destinatário explicitamente definido e válido: '${recipient}'`
      : `Destinatário ausente ou formato de e-mail inválido: '${recipient}'`
  );

  // 10. VALIDAÇÃO DO REMETENTE OFICIAL
  // O remetente DEVE ser estritamente paulonunes.consultoriadigital@gmail.com
  let candidateSender = options.senderOverride
    || parsedMinuta.sender
    || OFFICIAL_SENDER;

  const senderValid = (candidateSender === OFFICIAL_SENDER);
  recordCheck(
    'OFFICIAL_SENDER_VALID',
    senderValid,
    senderValid
      ? `Remetente oficial verificado: '${OFFICIAL_SENDER}'`
      : `Remetente não autorizado: '${candidateSender}'. Deve ser estritamente '${OFFICIAL_SENDER}'`
  );

  // CONSOLIDAÇÃO FINAL DETERMINÍSTICA DO GATE
  const allPassed = versionMatches &&
    slugMatches &&
    (currentStatus === REQUIRED_STATUS) &&
    approverValid &&
    approvedAtValid &&
    decisionValid &&
    commercialApprovalValid &&
    minutaHasSubstance &&
    recipientValid &&
    senderValid;

  if (!allPassed) {
    let primaryReason = 'GATE_VALIDATION_FAILED';
    if (!versionMatches || !slugMatches) primaryReason = 'VERSION_OR_SLUG_MISMATCH';
    else if (!approverValid) primaryReason = 'INVALID_OR_MISSING_APPROVER';
    else if (!approvedAtValid) primaryReason = 'INVALID_OR_MISSING_APPROVAL_TIMESTAMP';
    else if (!decisionValid) primaryReason = 'GATE_DECISION_NOT_APPROVED';
    else if (!commercialApprovalValid) primaryReason = 'COMMERCIAL_APPROVAL_REQUIRED';
    else if (!minutaHasSubstance) primaryReason = 'MINUTA_NOT_FOUND_OR_EMPTY';
    else if (!recipientValid) primaryReason = 'MISSING_OR_INVALID_RECIPIENT';
    else if (!senderValid) primaryReason = 'UNAUTHORIZED_SENDER';

    return {
      allowed: false,
      reason: primaryReason,
      status: currentStatus,
      manifest,
      message: `BLOQUEIO DETERMINÍSTICO: O Gate rejeitou o disparo (${primaryReason}).`,
      errors,
      validationLog
    };
  }

  // GATE APROVADO COM SUCESSO
  return {
    allowed: true,
    status: REQUIRED_STATUS,
    dryRun: true,
    manifest,
    reason: 'GATE_PASSED_DRY_RUN_ONLY',
    message: '[DRY-RUN] Validação determinística do Gate aprovada integralmente. Pronto para simulação segura.',
    recipient: recipient ? recipient.trim() : null,
    sender: OFFICIAL_SENDER,
    subject: parsedMinuta.subject || `Proposta de Modernização - ${manifest.projectName || projectSlug}`,
    bodyText: parsedMinuta.bodyText || '',
    previewUrl: (manifest.publicPreview && manifest.publicPreview.url) || null,
    minutaPath: minutaPath || 'in-memory',
    audit: {
      projectSlug,
      version: targetVersion,
      approvedBy: manifest.approvedBy,
      approvedAt: manifest.approvedAt,
      decision: gateObj.decision,
      commercialApproval: previewObj.commercialApproval,
      validatedAt: new Date().toISOString()
    },
    validationLog
  };
}

/**
 * Abre ou foca um arquivo no editor central do Antigravity IDE (via CLI nativa)
 */
function openInAntigravityEditor(filePath) {
  const ideCmd = 'C:\\Users\\35tul\\AppData\\Local\\Programs\\Antigravity IDE\\bin\\antigravity-ide.cmd';
  if (!fs.existsSync(filePath)) return false;
  try {
    const { execSync } = require('child_process');
    if (fs.existsSync(ideCmd)) {
      execSync(`"${ideCmd}" -r "${filePath}"`, {
        windowsHide: true,
        stdio: 'ignore',
        timeout: 5000
      });
      return true;
    }
  } catch (e) {
    // Fallback silencioso caso o processo já tenha sido repassado à janela ativa
  }
  return false;
}

/**
 * Resolve dinamicamente os caminhos canônicos do site de produção para qualquer oportunidade.
 */
function getProductionSitePath(projectSlug, options = {}) {
  const defaultGarimpoDir = 'C:\\Users\\35tul\\Garimpo-sites\\esbocos';
  const baseDir = options.baseDir || (fs.existsSync(defaultGarimpoDir) ? defaultGarimpoDir : path.join(__dirname, '..', 'esbocos'));
  const projectDir = path.join(baseDir, projectSlug);
  const siteDir = path.join(projectDir, 'site-producao');
  const indexPath = path.join(siteDir, 'index.html');
  return {
    projectDir,
    siteDir,
    indexPath,
    exists: fs.existsSync(indexPath)
  };
}

/**
 * Abre o arquivo de produção index.html no navegador padrão do sistema operacional.
 */
function openProductionSiteInBrowser(projectSlug, options = {}) {
  const siteInfo = getProductionSitePath(projectSlug, options);
  if (!siteInfo.exists) {
    return {
      success: false,
      message: `Arquivo index.html de produção não encontrado em: ${siteInfo.indexPath}`,
      filePath: siteInfo.indexPath
    };
  }

  try {
    const { exec } = require('child_process');
    if (process.platform === 'win32') {
      const child = exec(`start "" "${siteInfo.indexPath}"`, { windowsHide: true });
      if (child && typeof child.unref === 'function') {
        child.unref();
      }
      return {
        success: true,
        filePath: siteInfo.indexPath,
        message: 'Aberto no navegador padrão do Windows'
      };
    } else {
      const cmd = process.platform === 'darwin' ? 'open' : 'xdg-open';
      const child = exec(`${cmd} "${siteInfo.indexPath}"`);
      if (child && typeof child.unref === 'function') {
        child.unref();
      }
      return {
        success: true,
        filePath: siteInfo.indexPath,
        message: `Aberto via ${cmd}`
      };
    }
  } catch (err) {
    return {
      success: false,
      message: err.message,
      filePath: siteInfo.indexPath
    };
  }
}

/**
 * Normaliza e valida estritamente a decisão de construção do site.
 * Rejeita qualquer texto livre, mensagens no chat ou linguagem natural.
 */
function normalizeBuildDecision(decision) {
  if (typeof decision === 'boolean') {
    return decision ? BUILD_DECISION_APPROVED : BUILD_DECISION_REJECTED;
  }
  if (!decision || typeof decision !== 'string') {
    throw new Error(`Decisão inválida ou ausente: '${decision}'. Decisões aceitas: PENDING, APPROVED, REJECTED.`);
  }

  const clean = decision.trim().toUpperCase();

  // Lista de bloqueio estrito para exemplos de linguagem natural
  const forbiddenNaturalPhrases = [
    'PODE CONSTRUIR',
    'PODE COMECAR',
    'PODE COMEÇAR',
    'CLIENTE APROVOU',
    'PODE IMPLEMENTAR',
    'COMECE O SITE',
    'VAMOS CONSTRUIR',
    'ESTA APROVADO',
    'ESTÁ APROVADO',
    'PODE AVANCAR',
    'PODE AVANÇAR',
    'CLIENTE AUTORIZOU'
  ];

  for (const phrase of forbiddenNaturalPhrases) {
    if (clean.includes(phrase)) {
      throw new Error(`[GOVERNANÇA BLOQUEADA] Linguagem natural não autoriza construção ('${decision}'). Exige decisão determinística formal (APPROVED | REJECTED | PENDING).`);
    }
  }

  if (clean === 'APPROVED' || clean === 'APROVADA' || clean === 'APROVAR') {
    return BUILD_DECISION_APPROVED;
  }
  if (clean === 'REJECTED' || clean === 'REJEITADA' || clean === 'REJEITAR') {
    return BUILD_DECISION_REJECTED;
  }
  if (clean === 'PENDING' || clean === 'PENDENTE') {
    return BUILD_DECISION_PENDING;
  }

  throw new Error(`Decisão de aprovação de construção não reconhecida: '${decision}'. Decisões aceitas: PENDING, APPROVED, REJECTED. Linguagem natural não é aceita.`);
}

/**
 * Obtém o estado atual da aprovação de construção de uma oportunidade.
 * Ausência de buildApproval no manifesto é tratada como PENDING por padrão seguro.
 */
function getBuildApproval(projectSlug, options = {}) {
  const defaultGarimpoDir = 'C:\\Users\\35tul\\Garimpo-sites\\esbocos';
  const baseDir = options.baseDir || (fs.existsSync(defaultGarimpoDir) ? defaultGarimpoDir : path.join(__dirname, '..', 'esbocos'));
  const projectDir = path.join(baseDir, projectSlug);
  const manifestPath = path.join(projectDir, 'manifest.json');

  let manifest = options.manifestOverride || null;

  if (!manifest) {
    if (!fs.existsSync(manifestPath)) {
      return {
        approved: false,
        decision: BUILD_DECISION_PENDING,
        decisionBy: null,
        decisionAt: null,
        projectSlug,
        exists: false,
        status: BUILD_STATUS_PENDING,
        reason: 'MANIFEST_NOT_FOUND'
      };
    }

    try {
      manifest = readJsonSafely(manifestPath);
    } catch (e) {
      return {
        approved: false,
        decision: BUILD_DECISION_PENDING,
        decisionBy: null,
        decisionAt: null,
        projectSlug,
        exists: false,
        status: BUILD_STATUS_PENDING,
        reason: 'INVALID_MANIFEST_JSON'
      };
    }
  }

  const rawApproval = manifest.buildApproval;
  if (!rawApproval || typeof rawApproval !== 'object') {
    return {
      approved: false,
      decision: BUILD_DECISION_PENDING,
      decisionBy: null,
      decisionAt: null,
      projectSlug,
      exists: true,
      status: BUILD_STATUS_PENDING,
      reason: 'DEFAULT_PENDING'
    };
  }

  let decision = BUILD_DECISION_PENDING;
  try {
    decision = normalizeBuildDecision(rawApproval.decision || '');
  } catch (e) {
    decision = BUILD_DECISION_PENDING;
  }

  const decisionBy = rawApproval.decisionBy || null;
  const decisionAt = rawApproval.decisionAt || null;
  const isApproverValid = (decisionBy === REQUIRED_APPROVER);
  const isApproved = (decision === BUILD_DECISION_APPROVED) && isApproverValid && Boolean(decisionAt);

  let status = BUILD_STATUS_PENDING;
  if (decision === BUILD_DECISION_APPROVED && isApproved) {
    status = BUILD_STATUS_APPROVED;
  } else if (decision === BUILD_DECISION_REJECTED) {
    status = BUILD_STATUS_REJECTED;
  }

  return {
    approved: isApproved,
    decision,
    decisionBy,
    decisionAt,
    projectSlug,
    exists: true,
    status,
    reason: isApproved ? 'APPROVED_BY_SOVEREIGN' : (decision === BUILD_DECISION_REJECTED ? 'REJECTED' : 'PENDING')
  };
}

/**
 * Registra a decisão formal de aprovação da construção para uma oportunidade específica.
 * Isolamento total por projectSlug: nunca altera outros projetos.
 */
function setBuildApproval(projectSlug, approved, options = {}) {
  if (!projectSlug || typeof projectSlug !== 'string' || projectSlug.trim() === '') {
    throw new Error('projectSlug inválido ou ausente para setBuildApproval.');
  }

  const normalizedDecision = normalizeBuildDecision(approved);

  const defaultGarimpoDir = 'C:\\Users\\35tul\\Garimpo-sites\\esbocos';
  const baseDir = options.baseDir || (fs.existsSync(defaultGarimpoDir) ? defaultGarimpoDir : path.join(__dirname, '..', 'esbocos'));
  const projectDir = path.join(baseDir, projectSlug);
  const manifestPath = path.join(projectDir, 'manifest.json');

  let manifest = options.manifestOverride || null;

  if (!manifest) {
    if (!fs.existsSync(manifestPath)) {
      throw new Error(`Projeto inexistente ou manifest.json não encontrado para '${projectSlug}' em: ${manifestPath}`);
    }
    try {
      manifest = readJsonSafely(manifestPath);
    } catch (e) {
      throw new Error(`Falha ao ler manifest.json para '${projectSlug}': ${e.message}`);
    }
  }

  // Verificação estrita de correspondência de projectSlug
  if (manifest.projectSlug && manifest.projectSlug !== projectSlug) {
    throw new Error(`Inconsistência de isolamento: projectSlug solicitado (${projectSlug}) difere do manifesto (${manifest.projectSlug})`);
  }

  const approver = options.approver || REQUIRED_APPROVER;
  if (normalizedDecision === BUILD_DECISION_APPROVED && approver !== REQUIRED_APPROVER) {
    throw new Error(`Aprovador inválido: '${approver}'. Apenas '${REQUIRED_APPROVER}' pode autorizar a aprovação de construção.`);
  }

  const now = options.timestamp || new Date().toISOString();

  manifest.buildApproval = {
    approved: (normalizedDecision === BUILD_DECISION_APPROVED),
    decision: normalizedDecision,
    decisionBy: (normalizedDecision === BUILD_DECISION_PENDING ? null : approver),
    decisionAt: (normalizedDecision === BUILD_DECISION_PENDING ? null : now)
  };

  if (!options.manifestOverride && options.save !== false) {
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  }

  // Atualiza dinamicamente o PAINEL_APROVACAO.md
  if (options.updatePanel !== false && !options.manifestOverride && fs.existsSync(projectDir)) {
    generateApprovalPanel(projectSlug, manifest.version || 'v2', {
      ...options,
      openInEditor: options.openInEditor !== undefined ? options.openInEditor : false
    });
  }

  return {
    approved: manifest.buildApproval.approved,
    decision: manifest.buildApproval.decision,
    decisionBy: manifest.buildApproval.decisionBy,
    decisionAt: manifest.buildApproval.decisionAt,
    projectSlug,
    status: (normalizedDecision === BUILD_DECISION_APPROVED ? BUILD_STATUS_APPROVED : (normalizedDecision === BUILD_DECISION_REJECTED ? BUILD_STATUS_REJECTED : BUILD_STATUS_PENDING))
  };
}

/**
 * Validação determinística do estado de aprovação de construção.
 */
function validateBuildApproval(projectSlug, options = {}) {
  const approval = getBuildApproval(projectSlug, options);
  const isValid = VALID_BUILD_DECISIONS.includes(approval.decision);

  return {
    valid: isValid,
    approved: approval.approved,
    decision: approval.decision,
    decisionBy: approval.decisionBy,
    decisionAt: approval.decisionAt,
    projectSlug,
    status: approval.status
  };
}

/**
 * Mecanismo de bloqueio/autorização para futura fase de construção.
 * Bloqueia PENDENTE e REJEITADA; permite exclusivamente APROVADA por Paulo Nunes.
 */
function assertBuildApproved(projectSlug, options = {}) {
  const validation = validateBuildApproval(projectSlug, options);

  if (!validation.approved) {
    const errorMsg = `[BLOQUEIO DE GOVERNANÇA] Construção não autorizada para o projeto '${projectSlug}'. Estado atual: ${validation.status} (${validation.decision}). Exige decisão formal 'APPROVED' por '${REQUIRED_APPROVER}'.`;
    const err = new Error(errorMsg);
    err.code = 'BUILD_APPROVAL_REQUIRED';
    err.status = validation.status;
    err.decision = validation.decision;
    err.projectSlug = projectSlug;
    throw err;
  }

  return {
    allowed: true,
    projectSlug,
    status: validation.status,
    decision: validation.decision,
    decisionBy: validation.decisionBy,
    decisionAt: validation.decisionAt
  };
}

/**
 * Adquire lock exclusivo para o build da oportunidade.
 * Utiliza arquivo físico .build.lock no diretório do projeto com verificação de processo ativo.
 */
function acquireBuildLock(projectSlug, version, options = {}) {
  const cleanSlug = validateProjectSlug(projectSlug);
  const cleanVersion = validateVersion(version || 'v2');
  const defaultGarimpoDir = 'C:\\Users\\35tul\\Garimpo-sites\\esbocos';
  const baseDir = options.baseDir || (fs.existsSync(defaultGarimpoDir) ? defaultGarimpoDir : path.join(__dirname, '..', 'esbocos'));
  const projectDir = path.join(baseDir, cleanSlug);

  if (!fs.existsSync(projectDir)) {
    fs.mkdirSync(projectDir, { recursive: true });
  }

  const lockPath = path.join(projectDir, '.build.lock');

  if (fs.existsSync(lockPath)) {
    let existingLock = null;
    try {
      existingLock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    } catch (e) {
      existingLock = null;
    }

    if (existingLock && existingLock.pid) {
      let isAlive = false;
      try {
        isAlive = process.kill(existingLock.pid, 0);
      } catch (e) {
        isAlive = (e.code === 'EPERM');
      }

      if (isAlive) {
        const err = new Error(`[LOCK ATIVO] O processo PID ${existingLock.pid} já está executando build para '${cleanSlug}' desde ${existingLock.startedAt}.`);
        err.code = 'BUILD_LOCK_ACTIVE';
        err.projectSlug = cleanSlug;
        err.lockPid = existingLock.pid;
        throw err;
      }
    }

    // Lock órfão de processo morto: remove com segurança
    try {
      fs.unlinkSync(lockPath);
    } catch (e) {}
  }

  const lockData = {
    pid: process.pid,
    startedAt: new Date().toISOString(),
    projectSlug: cleanSlug,
    version: cleanVersion
  };

  try {
    fs.writeFileSync(lockPath, JSON.stringify(lockData, null, 2), { flag: 'wx' });
  } catch (err) {
    if (err.code === 'EEXIST') {
      const lockErr = new Error(`[LOCK CONCORRENTE] Conflito ao adquirir lock para '${cleanSlug}'.`);
      lockErr.code = 'BUILD_LOCK_ACTIVE';
      throw lockErr;
    }
    throw err;
  }

  return { lockPath, lockData };
}

/**
 * Libera o lock exclusivo após o término do build.
 */
function releaseBuildLock(projectSlug, options = {}) {
  const cleanSlug = validateProjectSlug(projectSlug);
  const defaultGarimpoDir = 'C:\\Users\\35tul\\Garimpo-sites\\esbocos';
  const baseDir = options.baseDir || (fs.existsSync(defaultGarimpoDir) ? defaultGarimpoDir : path.join(__dirname, '..', 'esbocos'));
  const lockPath = path.join(baseDir, cleanSlug, '.build.lock');

  if (fs.existsSync(lockPath)) {
    try {
      fs.unlinkSync(lockPath);
    } catch (e) {}
  }
}

/**
 * Executa a construção controlada e orquestrada do site de produção (Fases 2 e 3).
 *
 * ORDEM DE OPERAÇÃO OBRIGATÓRIA (GOVERNANÇA FASE 3):
 * 1. Validar projectSlug e version (exige versão explícita).
 * 2. Carregar manifest.json e verificar isolamento estrito de slug.
 * 3. Chamar assertBuildApproved(cleanSlug) -> Bloqueio determinístico se não aprovado formalmente.
 * 4. Adquirir lock determinístico de concorrência.
 * 5. Executar buildProductionSite() no destino canônico exclusivo.
 * 6. Executar validateProductionSite() validando artefatos gerados.
 * 7. Gravar buildExecution e buildValidation em manifest.json (NUNCA altera buildApproval).
 * 8. Regenerar PAINEL_APROVACAO.md com todas as seções atualizadas.
 * 9. Liberar lock de concorrência.
 */
function executeBuildSite(projectSlug, version, options = {}) {
  const cleanSlug = validateProjectSlug(projectSlug);
  if (!version || typeof version !== 'string' || !version.trim()) {
    const err = new Error(`[VERSÃO OBRIGATÓRIA] É obrigatório especificar explicitamente a versão para a construção do site (ex: v2).`);
    err.code = 'VERSION_REQUIRED';
    err.projectSlug = cleanSlug;
    throw err;
  }
  const cleanVersion = validateVersion(version);

  const defaultGarimpoDir = 'C:\\Users\\35tul\\Garimpo-sites\\esbocos';
  const baseDir = options.baseDir || (fs.existsSync(defaultGarimpoDir) ? defaultGarimpoDir : path.join(__dirname, '..', 'esbocos'));
  const projectDir = path.join(baseDir, cleanSlug);
  const manifestPath = path.join(projectDir, 'manifest.json');

  let manifest = options.manifestOverride || null;

  if (!manifest) {
    if (!fs.existsSync(manifestPath)) {
      const err = new Error(`[MANIFESTO AUSENTE] manifest.json não encontrado para '${cleanSlug}' em: ${manifestPath}`);
      err.code = 'MANIFEST_NOT_FOUND';
      err.projectSlug = cleanSlug;
      throw err;
    }
    try {
      manifest = readJsonSafely(manifestPath);
    } catch (e) {
      const err = new Error(`[MANIFESTO INVÁLIDO] Falha ao analisar manifest.json para '${cleanSlug}': ${e.message}`);
      err.code = 'INVALID_MANIFEST_JSON';
      err.projectSlug = cleanSlug;
      throw err;
    }
  }

  // Verificação de isolamento estrito contra o manifesto
  if (manifest.projectSlug && manifest.projectSlug !== cleanSlug) {
    const err = new Error(`[ISOLAMENTO VIOLADO] projectSlug solicitado (${cleanSlug}) difere do manifesto (${manifest.projectSlug})`);
    err.code = 'CROSS_PROJECT_SLUG_MISMATCH';
    err.projectSlug = cleanSlug;
    throw err;
  }

  // PASSO 3: BUILD GATE OBRIGATÓRIO (assertBuildApproved)
  assertBuildApproved(cleanSlug, { ...options, manifestOverride: manifest });

  // PASSO 4: AQUISIÇÃO DO LOCK DETERMINÍSTICO DE CONCORRÊNCIA
  let lockAcquired = false;
  if (options.skipLock !== true && !options.manifestOverride) {
    acquireBuildLock(cleanSlug, cleanVersion, { baseDir });
    lockAcquired = true;
  }

  try {
    // PASSO 5: CONSTRUÇÃO CONTROLADA E ATÔMICA
    const buildResult = buildProductionSite(cleanSlug, cleanVersion, {
      ...options,
      manifestOverride: manifest,
      baseDir
    });

    // PASSO 6: VALIDAÇÃO TÉCNICA DETERMINÍSTICA DOS ARTEFATOS PRODUZIDOS
    const validationResult = validateProductionSite(cleanSlug, cleanVersion, {
      ...options,
      baseDir
    });

    // PASSO 7: REGISTRO SEPARADO DE buildExecution E buildValidation
    manifest.buildExecution = {
      status: validationResult.isValid ? 'CONCLUIDA' : 'FALHOU',
      projectSlug: cleanSlug,
      version: cleanVersion,
      executedAt: buildResult.executedAt || new Date().toISOString(),
      canonicalDestination: buildResult.canonicalPath,
      files: buildResult.files,
      filesCount: buildResult.files ? buildResult.files.length : 0
    };

    manifest.buildValidation = validationResult;

    // INVALIDAÇÃO DETERMINÍSTICA DE HOMOLOGAÇÃO:
    // Qualquer novo build ou rebuild invalida a homologação anterior, retornando-a a PENDENTE.
    manifest.siteHomologation = {
      approved: false,
      decision: HOMOLOGATION_DECISION_PENDING,
      status: 'PENDENTE',
      decisionBy: null,
      decisionAt: null,
      projectSlug: cleanSlug,
      version: cleanVersion,
      notes: null
    };

    if (!options.manifestOverride && options.save !== false) {
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
    }

    if (!validationResult.isValid) {
      const err = new Error(`[VALIDAÇÃO PÓS-BUILD FALHOU] Os arquivos gerados para '${cleanSlug}' falharam na validação técnica.`);
      err.code = 'POST_BUILD_VALIDATION_FAILED';
      err.projectSlug = cleanSlug;
      err.validation = validationResult;
      throw err;
    }

    // PASSO 8: REGENERAR PAINEL_APROVACAO.MD
    if (options.updatePanel !== false && !options.manifestOverride && fs.existsSync(projectDir)) {
      generateApprovalPanel(cleanSlug, cleanVersion, {
        ...options,
        openInEditor: options.openInEditor !== undefined ? options.openInEditor : false
      });
    }

    return {
      success: true,
      projectSlug: cleanSlug,
      version: cleanVersion,
      buildExecution: manifest.buildExecution,
      buildValidation: validationResult,
      buildResult
    };
  } finally {
    if (lockAcquired) {
      releaseBuildLock(cleanSlug, { baseDir });
    }
  }
}

/**
 * Consulta o estado da validação técnica do build.
 */
function getBuildValidation(projectSlug, options = {}) {
  const cleanSlug = validateProjectSlug(projectSlug);
  const defaultGarimpoDir = 'C:\\Users\\35tul\\Garimpo-sites\\esbocos';
  const baseDir = options.baseDir || (fs.existsSync(defaultGarimpoDir) ? defaultGarimpoDir : path.join(__dirname, '..', 'esbocos'));
  const projectDir = path.join(baseDir, cleanSlug);
  const manifestPath = path.join(projectDir, 'manifest.json');

  let manifest = options.manifestOverride || null;
  if (!manifest) {
    if (!fs.existsSync(manifestPath)) {
      return { isValid: false, status: 'PENDENTE', projectSlug: cleanSlug };
    }
    try {
      manifest = readJsonSafely(manifestPath);
    } catch (e) {
      return { isValid: false, status: 'PENDENTE', projectSlug: cleanSlug };
    }
  }

  return manifest.buildValidation || { isValid: false, status: 'PENDENTE', projectSlug: cleanSlug };
}

/**
 * Assegura que o build foi tecnicamente validado com sucesso.
 */
function assertBuildValidated(projectSlug, options = {}) {
  const cleanSlug = validateProjectSlug(projectSlug);
  const validation = getBuildValidation(cleanSlug, options);

  if (!validation || !validation.isValid || validation.status !== 'VALIDADA') {
    const err = new Error(`[VALIDAÇÃO NECESSÁRIA] O build para '${cleanSlug}' não possui validação técnica aprovada.`);
    err.code = 'BUILD_VALIDATION_REQUIRED';
    err.projectSlug = cleanSlug;
    err.status = validation ? validation.status : 'PENDENTE';
    throw err;
  }

  return {
    allowed: true,
    projectSlug: cleanSlug,
    status: validation.status,
    isValid: validation.isValid,
    validatedAt: validation.validatedAt
  };
}

/**
 * Valida a estrutura formal de siteHomologation.
 */
function validateHomologation(manifest) {
  if (!manifest || typeof manifest !== 'object') {
    return {
      valid: true,
      approved: false,
      decision: HOMOLOGATION_DECISION_PENDING,
      status: 'PENDENTE',
      decisionBy: null,
      decisionAt: null,
      notes: null
    };
  }

  const homo = manifest.siteHomologation;
  if (!homo || typeof homo !== 'object') {
    return {
      valid: true,
      approved: false,
      decision: HOMOLOGATION_DECISION_PENDING,
      status: 'PENDENTE',
      decisionBy: null,
      decisionAt: null,
      notes: null
    };
  }

  const decision = (typeof homo.decision === 'string') ? homo.decision.toUpperCase().trim() : '';
  if (!VALID_HOMOLOGATION_DECISIONS.includes(decision)) {
    return {
      valid: false,
      approved: false,
      decision: HOMOLOGATION_DECISION_PENDING,
      status: 'PENDENTE',
      reason: `Decisão de homologação desconhecida: '${homo.decision}'`
    };
  }

  if (decision === HOMOLOGATION_DECISION_APPROVED) {
    if (homo.approved !== true) {
      return {
        valid: false,
        approved: false,
        decision,
        status: 'PENDENTE',
        reason: "Decisão APPROVED requer approved === true."
      };
    }
    if (homo.decisionBy !== REQUIRED_APPROVER) {
      return {
        valid: false,
        approved: false,
        decision,
        status: 'PENDENTE',
        reason: `Homologação requer aprovador oficial '${REQUIRED_APPROVER}'.`
      };
    }
    if (!homo.decisionAt || typeof homo.decisionAt !== 'string') {
      return {
        valid: false,
        approved: false,
        decision,
        status: 'PENDENTE',
        reason: "Homologação requer timestamp 'decisionAt'."
      };
    }
    return {
      valid: true,
      approved: true,
      decision: HOMOLOGATION_DECISION_APPROVED,
      status: 'HOMOLOGADA',
      decisionBy: homo.decisionBy,
      decisionAt: homo.decisionAt,
      notes: homo.notes || null,
      projectSlug: homo.projectSlug,
      version: homo.version
    };
  }

  if (decision === HOMOLOGATION_DECISION_REJECTED) {
    return {
      valid: true,
      approved: false,
      decision: HOMOLOGATION_DECISION_REJECTED,
      status: 'REJEITADA',
      decisionBy: homo.decisionBy || REQUIRED_APPROVER,
      decisionAt: homo.decisionAt || null,
      notes: homo.notes || null,
      projectSlug: homo.projectSlug,
      version: homo.version
    };
  }

  return {
    valid: true,
    approved: false,
    decision: HOMOLOGATION_DECISION_PENDING,
    status: 'PENDENTE',
    decisionBy: null,
    decisionAt: null,
    notes: null
  };
}

/**
 * Lê o estado de homologação de uma oportunidade.
 */
function getHomologation(projectSlug, options = {}) {
  const cleanSlug = validateProjectSlug(projectSlug);
  const defaultGarimpoDir = 'C:\\Users\\35tul\\Garimpo-sites\\esbocos';
  const baseDir = options.baseDir || (fs.existsSync(defaultGarimpoDir) ? defaultGarimpoDir : path.join(__dirname, '..', 'esbocos'));
  const projectDir = path.join(baseDir, cleanSlug);
  const manifestPath = path.join(projectDir, 'manifest.json');

  let manifest = options.manifestOverride || null;
  if (!manifest) {
    if (!fs.existsSync(manifestPath)) {
      return {
        approved: false,
        decision: HOMOLOGATION_DECISION_PENDING,
        status: 'PENDENTE',
        valid: true,
        decisionBy: null,
        decisionAt: null,
        projectSlug: cleanSlug
      };
    }
    try {
      manifest = readJsonSafely(manifestPath);
    } catch (e) {
      return {
        approved: false,
        decision: HOMOLOGATION_DECISION_PENDING,
        status: 'PENDENTE',
        valid: false,
        reason: `Falha ao ler manifest.json: ${e.message}`,
        projectSlug: cleanSlug
      };
    }
  }

  const validation = validateHomologation(manifest);
  return { ...validation, projectSlug: cleanSlug };
}

/**
 * Registra a homologação formal soberana de Paulo Nunes para o site construído.
 *
 * PRÉ-REQUISITOS OBRIGATÓRIOS:
 * 1. Aprovação de construção prévia formal (buildApproval.approved === true).
 * 2. Construção executada (buildExecution.status === 'CONCLUIDA').
 * 3. Validação técnica de arquivos aprovada (buildValidation.status === 'VALIDADA').
 */
function setHomologation(projectSlug, approved, options = {}) {
  const cleanSlug = validateProjectSlug(projectSlug);
  const cleanVersion = validateVersion(options.version || 'v2');

  if (typeof approved !== 'boolean') {
    throw new Error(`Parâmetro de homologação inválido: '${approved}'. A deliberação deve ser estritamente booleana (true para aprovar, false para rejeitar).`);
  }

  const defaultGarimpoDir = 'C:\\Users\\35tul\\Garimpo-sites\\esbocos';
  const baseDir = options.baseDir || (fs.existsSync(defaultGarimpoDir) ? defaultGarimpoDir : path.join(__dirname, '..', 'esbocos'));
  const projectDir = path.join(baseDir, cleanSlug);
  const manifestPath = path.join(projectDir, 'manifest.json');

  let manifest = options.manifestOverride || null;
  if (!manifest) {
    if (!fs.existsSync(manifestPath)) {
      throw new Error(`Projeto inexistente ou manifest.json não encontrado para '${cleanSlug}' em: ${manifestPath}`);
    }
    try {
      manifest = readJsonSafely(manifestPath);
    } catch (e) {
      throw new Error(`Falha ao ler manifest.json para '${cleanSlug}': ${e.message}`);
    }
  }

  // PRÉ-REQUISITO 1: BUILD DEVE TER SIDO APROVADO
  const buildApp = getBuildApproval(cleanSlug, { ...options, manifestOverride: manifest });
  if (!buildApp.approved || buildApp.decision !== BUILD_DECISION_APPROVED) {
    const err = new Error(`[HOMOLOGAÇÃO BLOQUEADA] Impossível homologar site para '${cleanSlug}': A construção não possui aprovação formal prévia.`);
    err.code = 'CANNOT_HOMOLOGATE_UNAPPROVED_BUILD';
    err.projectSlug = cleanSlug;
    throw err;
  }

  // PRÉ-REQUISITO 2: BUILD DEVE TER SIDO EXECUTADO
  if (!manifest.buildExecution || manifest.buildExecution.status !== 'CONCLUIDA') {
    const err = new Error(`[HOMOLOGAÇÃO BLOQUEADA] Impossível homologar site para '${cleanSlug}': O site ainda não foi construído (buildExecution ausente ou incompleto).`);
    err.code = 'CANNOT_HOMOLOGATE_UNBUILT_SITE';
    err.projectSlug = cleanSlug;
    throw err;
  }

  // PRÉ-REQUISITO 3: BUILD DEVE TER SIDO VALIDADO
  if (!manifest.buildValidation || manifest.buildValidation.status !== 'VALIDADA' || !manifest.buildValidation.isValid) {
    const err = new Error(`[HOMOLOGAÇÃO BLOQUEADA] Impossível homologar site para '${cleanSlug}': Os arquivos de produção não foram validados tecnicamente.`);
    err.code = 'CANNOT_HOMOLOGATE_INVALID_BUILD';
    err.projectSlug = cleanSlug;
    throw err;
  }

  // PRÉ-REQUISITO 4: ISOLAMENTO ESTRITO POR VERSÃO (cleanVersion === manifest.buildExecution.version)
  const builtVersion = manifest.buildExecution.version;
  let targetVersion = builtVersion;
  if (options.version) {
    const cleanVersion = validateVersion(options.version);
    if (cleanVersion !== builtVersion) {
      const err = new Error(`[VERSÃO INCOMPATÍVEL] A versão solicitada para homologação ('${cleanVersion}') difere da versão atualmente construída no destino ('${builtVersion}') para '${cleanSlug}'.`);
      err.code = 'HOMOLOGATION_VERSION_MISMATCH';
      err.projectSlug = cleanSlug;
      err.requestedVersion = cleanVersion;
      err.builtVersion = builtVersion;
      throw err;
    }
    targetVersion = cleanVersion;
  }

  const decisionTimestamp = new Date().toISOString();
  if (approved) {
    manifest.siteHomologation = {
      approved: true,
      decision: HOMOLOGATION_DECISION_APPROVED,
      status: 'HOMOLOGADA',
      decisionBy: REQUIRED_APPROVER,
      decisionAt: decisionTimestamp,
      projectSlug: cleanSlug,
      version: targetVersion,
      notes: options.notes || 'Site de produção homologado soberanamente por Paulo Nunes após inspeção.'
    };
  } else {
    manifest.siteHomologation = {
      approved: false,
      decision: HOMOLOGATION_DECISION_REJECTED,
      status: 'REJEITADA',
      decisionBy: REQUIRED_APPROVER,
      decisionAt: decisionTimestamp,
      projectSlug: cleanSlug,
      version: targetVersion,
      notes: options.notes || 'Homologação do site de produção rejeitada soberanamente por Paulo Nunes.'
    };
  }

  if (!options.manifestOverride && options.save !== false) {
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  }

  if (options.updatePanel !== false && !options.manifestOverride && fs.existsSync(projectDir)) {
    generateApprovalPanel(cleanSlug, targetVersion, {
      ...options,
      openInEditor: options.openInEditor !== undefined ? options.openInEditor : false
    });
  }

  return {
    success: true,
    projectSlug: cleanSlug,
    version: targetVersion,
    decision: manifest.siteHomologation.decision,
    status: manifest.siteHomologation.status,
    decisionBy: manifest.siteHomologation.decisionBy,
    decisionAt: manifest.siteHomologation.decisionAt,
    notes: manifest.siteHomologation.notes
  };
}

/**
 * Bloqueia operações caso a homologação do site não esteja formalmente concedida.
 *
 * VERIFICAÇÕES OBRIGATÓRIAS (GOVERNANÇA FASE 3):
 * 1. Homologação formal válida concedida por Paulo Nunes (approved === true, decision === 'APPROVED').
 * 2. Isolamento por versão: homologation.version === expectedVersion (se fornecido).
 * 3. Coerência com o build atual: homologation.version === manifest.buildExecution.version.
 * 4. Proteção temporal contra rebuild: homologation.decisionAt >= manifest.buildExecution.executedAt.
 */
function assertSiteHomologated(projectSlug, versionOrOptions = {}, maybeOptions = {}) {
  const cleanSlug = validateProjectSlug(projectSlug);

  let expectedVersion = null;
  let options = {};

  if (typeof versionOrOptions === 'string') {
    expectedVersion = validateVersion(versionOrOptions);
    options = maybeOptions || {};
  } else if (typeof versionOrOptions === 'object' && versionOrOptions !== null) {
    options = versionOrOptions;
    if (options.version) {
      expectedVersion = validateVersion(options.version);
    }
  }

  const defaultGarimpoDir = 'C:\\Users\\35tul\\Garimpo-sites\\esbocos';
  const baseDir = options.baseDir || (fs.existsSync(defaultGarimpoDir) ? defaultGarimpoDir : path.join(__dirname, '..', 'esbocos'));
  const projectDir = path.join(baseDir, cleanSlug);
  const manifestPath = path.join(projectDir, 'manifest.json');

  let manifest = options.manifestOverride || null;
  if (!manifest) {
    if (!fs.existsSync(manifestPath)) {
      const err = new Error(`[HOMOLOGAÇÃO NECESSÁRIA] Projeto inexistente ou manifest.json não encontrado para '${cleanSlug}'.`);
      err.code = 'SITE_HOMOLOGATION_REQUIRED';
      err.projectSlug = cleanSlug;
      throw err;
    }
    try {
      manifest = readJsonSafely(manifestPath);
    } catch (e) {
      const err = new Error(`[HOMOLOGAÇÃO NECESSÁRIA] Falha ao ler manifest.json para '${cleanSlug}': ${e.message}`);
      err.code = 'SITE_HOMOLOGATION_REQUIRED';
      err.projectSlug = cleanSlug;
      throw err;
    }
  }

  const homologation = getHomologation(cleanSlug, { ...options, manifestOverride: manifest });

  // 1. Decisão e aprovação soberana
  if (!homologation.valid || !homologation.approved || homologation.decision !== HOMOLOGATION_DECISION_APPROVED) {
    const err = new Error(`[HOMOLOGAÇÃO NECESSÁRIA] O site da oportunidade '${cleanSlug}' não possui homologação formal aprovada.`);
    err.code = 'SITE_HOMOLOGATION_REQUIRED';
    err.projectSlug = cleanSlug;
    err.status = homologation.status;
    err.decision = homologation.decision;
    throw err;
  }

  if (homologation.decisionBy !== REQUIRED_APPROVER) {
    const err = new Error(`[HOMOLOGAÇÃO INVÁLIDA] Homologação requer aprovador oficial '${REQUIRED_APPROVER}'.`);
    err.code = 'SITE_HOMOLOGATION_REQUIRED';
    err.projectSlug = cleanSlug;
    throw err;
  }

  if (!homologation.decisionAt || typeof homologation.decisionAt !== 'string') {
    const err = new Error(`[HOMOLOGAÇÃO INVÁLIDA] Timestamp 'decisionAt' ausente ou inválido.`);
    err.code = 'SITE_HOMOLOGATION_REQUIRED';
    err.projectSlug = cleanSlug;
    throw err;
  }

  // 2. Isolamento por versão solicitada
  if (expectedVersion && homologation.version !== expectedVersion) {
    const err = new Error(`[VERSÃO NÃO HOMOLOGADA] A versão solicitada ('${expectedVersion}') difere da versão homologada ('${homologation.version}') para '${cleanSlug}'.`);
    err.code = 'HOMOLOGATION_VERSION_MISMATCH';
    err.projectSlug = cleanSlug;
    err.requestedVersion = expectedVersion;
    err.homologatedVersion = homologation.version;
    throw err;
  }

  // 3. Coerência com buildExecution atualmente construído
  if (!manifest.buildExecution || manifest.buildExecution.status !== 'CONCLUIDA') {
    const err = new Error(`[HOMOLOGAÇÃO INVÁLIDA] Build de produção ausente ou incompleto para '${cleanSlug}'.`);
    err.code = 'CANNOT_HOMOLOGATE_UNBUILT_SITE';
    err.projectSlug = cleanSlug;
    throw err;
  }

  if (homologation.version !== manifest.buildExecution.version) {
    const err = new Error(`[VERSÃO NÃO HOMOLOGADA] A versão homologada ('${homologation.version}') difere da versão atualmente construída no destino ('${manifest.buildExecution.version}') para '${cleanSlug}'.`);
    err.code = 'HOMOLOGATION_VERSION_MISMATCH';
    err.projectSlug = cleanSlug;
    err.homologatedVersion = homologation.version;
    err.builtVersion = manifest.buildExecution.version;
    throw err;
  }

  // 4. Proteção temporal contra rebuild
  if (manifest.buildExecution.executedAt && homologation.decisionAt) {
    const executedTime = new Date(manifest.buildExecution.executedAt).getTime();
    const decisionTime = new Date(homologation.decisionAt).getTime();
    if (!isNaN(executedTime) && !isNaN(decisionTime) && decisionTime < executedTime) {
      const err = new Error(`[HOMOLOGAÇÃO OBSOLETA] A homologação concedida em '${homologation.decisionAt}' é anterior à última execução de build em '${manifest.buildExecution.executedAt}' para '${cleanSlug}'. Requer nova homologação.`);
      err.code = 'HOMOLOGATION_STALE';
      err.projectSlug = cleanSlug;
      err.decisionAt = homologation.decisionAt;
      err.executedAt = manifest.buildExecution.executedAt;
      throw err;
    }
  }

  return {
    allowed: true,
    projectSlug: cleanSlug,
    version: homologation.version,
    status: homologation.status,
    decision: homologation.decision,
    decisionBy: homologation.decisionBy,
    decisionAt: homologation.decisionAt
  };
}

/**
 * Gera o Painel de Aprovação Comercial estruturado (PAINEL_APROVACAO.md).
 * CAMADA DE VISUALIZAÇÃO PASSIVA: NÃO EXECUTA DISPARO, NÃO ALTERA O MANIFEST.
 */
function generateApprovalPanel(projectSlug, version, options = {}) {
  const defaultGarimpoDir = 'C:\\Users\\35tul\\Garimpo-sites\\esbocos';
  const baseDir = options.baseDir || (fs.existsSync(defaultGarimpoDir) ? defaultGarimpoDir : path.join(__dirname, '..', 'esbocos'));
  const projectDir = path.join(baseDir, projectSlug);

  const gateResult = options.gateResult || validateEmailGate(projectSlug, version, options);
  const manifest = gateResult.manifest || {};

  const targetVersion = version || (gateResult.audit && gateResult.audit.version) || manifest.version || 'v2';
  const companyName = manifest.companyName || manifest.projectName || projectSlug;
  const projectName = manifest.projectName || projectSlug;
  const recipient = gateResult.recipient || '(Destinatário não definido)';
  const sender = gateResult.sender || OFFICIAL_SENDER;
  const senderDisplayName = 'Paulo Nunes | Consultoria de Presença Digital';
  const subject = gateResult.subject || '(Assunto não definido)';
  const previewUrl = gateResult.previewUrl || (manifest.publicPreview && manifest.publicPreview.url) || '(URL não definida)';
  const gateStatus = gateResult.status || 'UNKNOWN';
  const gateAllowed = gateResult.allowed === true;

  // Determina o badge visual de estado
  let statusBadge = '';
  let statusAlert = '';
  if (gateStatus === 'APPROVED' && gateAllowed) {
    statusBadge = '🟢 APPROVED (APROVADO — ENVIO RETIDO EM DRY-RUN)';
    statusAlert = [
      `> [!NOTE]`,
      `> **STATUS: APROVADO POR PAULO NUNES (AGUARDANDO COMANDO DE DISPARO)**  `,
      `> A oportunidade foi homologada no Gate Formal, mas o envio real **NÃO É DISPARADO AUTOMATICAMENTE**.  `,
      `> O sistema permanece em modo de simulação DRY-RUN até comando explícito com a flag '--production-send'.`
    ].join('\n');
  } else if (gateStatus === 'PENDING_APPROVAL') {
    statusBadge = '🟡 PENDING_APPROVAL (AGUARDANDO DELIBERAÇÃO SOBERANA)';
    statusAlert = [
      `> [!IMPORTANT]`,
      `> **STATUS: PENDING_APPROVAL (BLOQUEIO DE GOVERNANÇA)**  `,
      `> A oportunidade foi preparada e encontra-se aguardando deliberação soberana de Paulo Nunes.  `,
      `> Qualquer tentativa de envio comercial está terminantemente bloqueada.`
    ].join('\n');
  } else {
    statusBadge = `🔴 ${gateStatus} (BLOQUEADO PELO GATE)`;
    statusAlert = [
      `> [!WARNING]`,
      `> **STATUS: BLOQUEADO PELO GATE DETERMINÍSTICO**  `,
      `> Motivo: ${gateResult.reason || 'REJEITADO'}  `,
      `> O envio não é permitido pelas regras de segurança vigentes.`
    ].join('\n');
  }

  // Resumo/Prévia da mensagem
  const body = gateResult.bodyText || '';
  const initialSnippet = body.length > 220 ? body.substring(0, 220).replace(/\r?\n/g, ' ') + '...' : body;

  // Detecção dinâmica e genérica do site de produção e aprovação da construção
  const siteInfo = getProductionSitePath(projectSlug, options);
  const buildApproval = getBuildApproval(projectSlug, { ...options, manifestOverride: manifest });

  let buildStatusDisplay = '⏳ PENDENTE DE APROVAÇÃO';
  if (buildApproval.decision === BUILD_DECISION_APPROVED && buildApproval.approved) {
    buildStatusDisplay = '🟢 APROVADA';
  } else if (buildApproval.decision === BUILD_DECISION_REJECTED) {
    buildStatusDisplay = '🔴 REJEITADA';
  }

  const homologation = getHomologation(projectSlug, { ...options, manifestOverride: manifest });
  const buildValidation = manifest.buildValidation || getBuildValidation(projectSlug, { ...options, manifestOverride: manifest });

  let homologationStatusDisplay = '⏳ PENDENTE DE HOMOLOGAÇÃO';
  if (homologation.decision === HOMOLOGATION_DECISION_APPROVED && homologation.approved) {
    homologationStatusDisplay = '🟢 HOMOLOGADO';
  } else if (homologation.decision === HOMOLOGATION_DECISION_REJECTED) {
    homologationStatusDisplay = '🔴 REJEITADO';
  }

  let validationStatusDisplay = '⚪ PENDENTE DE VALIDAÇÃO';
  if (buildValidation && buildValidation.status === 'VALIDADA' && buildValidation.isValid) {
    validationStatusDisplay = '🟢 VALIDADA';
  } else if (buildValidation && buildValidation.status === 'INVALIDA') {
    validationStatusDisplay = '🔴 INVÁLIDA';
  }

  const content = [
    `# PAINEL DE APROVAÇÃO COMERCIAL — GARIMPO SITES`,
    ``,
    `> [!WARNING]`,
    `> **MODO ATUAL: DRY-RUN (SIMULAÇÃO SEGURA)**  `,
    `> O envio comercial real ainda **NÃO FOI REALIZADO**. Esta visualização tem caráter informativo e de decisão.`,
    ``,
    statusAlert,
    ``,
    `---`,
    ``,
    `### 1. EMPRESA / OPORTUNIDADE`,
    `- **Nome da Empresa:** ${companyName}`,
    `- **Project Slug:** \`${projectSlug}\``,
    `- **Versão Homologada:** \`${targetVersion}\``,
    ``,
    `### 2. DESTINATÁRIO`,
    `- **E-mail de Destino:** \`${recipient}\``,
    ``,
    `### 3. REMETENTE`,
    `- **E-mail Oficial:** \`${sender}\``,
    `- **Nome de Exibição:** ${senderDisplayName}`,
    `- **RFC 2047 Encoded:** \`=?UTF-8?B?UGF1bG8gTnVuZXMgfCBDb25zdWx0b3JpYSBkZSBQcmVzZW7Dp2EgRGlnaXRhbA==?=\``,
    ``,
    `### 4. ASSUNTO`,
    `- **Assunto Completo:** \`${subject}\``,
    ``,
    `### 5. ESBOÇO / PROTÓTIPO`,
    `- **Nome do Protótipo:** Protótipo Visual ${projectName} (${targetVersion})`,
    `- **Tecnologia:** HTML5 Semântico / CSS3 / Mobile-First WCAG 2.1`,
    ``,
    `### 6. LINK DO ESBOÇO`,
    `- **URL Pública Homologada:**  `,
    `  👉 [${previewUrl}](${previewUrl})  `,
    `  *(Aferição: Exatamente a mesma URL transmitida no pacote do e-mail)*`,
    ``,
    `### 7. RESUMO DA MENSAGEM (PRÉVIA EXECUTIVA)`,
    `- **Início da Abordagem:** *"${initialSnippet}"*`,
    `- **Tamanho do Corpo:** ${body.length} caracteres`,
    `- **Minuta Auditada:** \`${gateResult.minutaPath || 'in-memory'}\``,
    ``,
    `**Prévia Completa do Texto:**`,
    `\`\`\`text`,
    body,
    `\`\`\``,
    ``,
    `### 8. STATUS DO GATE`,
    `- **Classificação de Estado:** \`${statusBadge}\``,
    `- **Aprovador Formal:** ${gateResult.audit?.approvedBy || manifest.approvedBy || '(Pendente)'}`,
    `- **Data de Aprovação:** ${gateResult.audit?.approvedAt || manifest.approvedAt || '(Pendente)'}`,
    `- **Decisão Registrada:** ${gateResult.audit?.decision || manifest.approvalGate?.decision || '(Pendente)'}`,
    `- **Aprovação Comercial:** ${gateResult.audit?.commercialApproval ?? manifest.publicPreview?.commercialApproval ?? false}`,
    ``,
    `### 9. CHECKLIST DE SEGURANÇA`,
    `- [${gateResult.sender === OFFICIAL_SENDER ? 'x' : ' '}] Remetente oficial verificado (\`${OFFICIAL_SENDER}\`)`,
    `- [${recipient && recipient.includes('@') ? 'x' : ' '}] Destinatário explicitamente definido e válido (\`${recipient}\`)`,
    `- [${gateResult.minutaPath ? 'x' : ' '}] Minuta correspondente encontrada e legível`,
    `- [${previewUrl && previewUrl.startsWith('http') ? 'x' : ' '}] URL do protótipo homologada e limpa`,
    `- [${gateResult.audit?.decision === 'APROVAR' ? 'x' : ' '}] Decisão do Gate formalizada`,
    `- [${gateStatus === 'APPROVED' ? 'x' : ' '}] Status do manifest validado`,
    `- [x] Modo atual: **DRY-RUN (Simulação estrita sem rede externa)**`,
    `- [x] Garantia de Governança: Esta visualização NÃO dispara e-mails`,
    ``,
    `### 10. PRÉVIA DO ENVIO (RESPOSTAS IMEDIATAS)`,
    `| Pergunta do Decisor | Resposta do Sistema |`,
    `| :--- | :--- |`,
    `| **Quem vai receber?** | \`${recipient}\` (${companyName}) |`,
    `| **De qual e-mail?** | \`${sender}\` |`,
    `| **Qual assunto?** | \`${subject}\` |`,
    `| **Qual esboço?** | ${projectName} (${targetVersion}) |`,
    `| **Qual link será enviado?** | [${previewUrl}](${previewUrl}) |`,
    `| **Qual é o estado da aprovação?** | \`${gateStatus}\` (Envio retido) |`,
    `| **O sistema está em DRY-RUN ou produção?** | **DRY-RUN** |`,
    ``,
    `---`,
    ``,
    `## 🏗️ APROVAÇÃO DA CONSTRUÇÃO DO SITE`,
    ``,
    `### Aprovação da Construção`,
    `- **Status Atual:** ${buildStatusDisplay}`,
    `- **Decisão Registrada:** \`${buildApproval.decision}\``,
    `- **Projeto:** \`${projectSlug}\``,
    `- **Aprovador:** ${buildApproval.decisionBy || 'Pendente'}`,
    `- **Data/Hora:** ${buildApproval.decisionAt || 'Pendente'}`,
    `- **Estado de Governança:** Somente uma decisão formal e explícita autoriza a construção. Linguagem natural, comentários, texto no painel ou ausência de decisão NÃO autorizam a construção.`,
    ``,
    `> [!NOTE]`,
    `> **COMANDOS DE DELIBERAÇÃO FORMAL:**`,
    `> - Para aprovar a construção: \`node dispatcher.js ${projectSlug} ${targetVersion} --approve-build\``,
    `> - Para rejeitar a construção: \`node dispatcher.js ${projectSlug} ${targetVersion} --reject-build\``,
    ``,
    `---`,
    ``,
    `## 🔨 EXECUÇÃO DA CONSTRUÇÃO DO SITE`,
    ``,
    `- **Status da Execução:** ${manifest.buildExecution ? (manifest.buildExecution.status === 'CONCLUIDA' ? '🟢 CONCLUÍDA' : manifest.buildExecution.status) : '⚪ NÃO INICIADA'}`,
    `- **Projeto:** \`${projectSlug}\``,
    `- **Versão Construída:** \`${manifest.buildExecution?.version || targetVersion}\``,
    `- **Data/Hora da Execução:** ${manifest.buildExecution?.executedAt || 'Pendente'}`,
    `- **Destino Canônico:** \`${siteInfo.siteDir}\``,
    `- **Total de Arquivos:** ${manifest.buildExecution?.filesCount ?? (manifest.buildExecution?.files?.length || 'Pendente')}`,
    ``,
    `> [!NOTE]`,
    `> **COMANDO DE CONSTRUÇÃO:**`,
    `> - Para construir o site: \`node dispatcher.js ${projectSlug} ${targetVersion} --build-site\` (ou \`--execute-build\`)`,
    ``,
    `---`,
    ``,
    `## 🔎 VALIDAÇÃO DO BUILD`,
    ``,
    `- **Status da Validação:** ${validationStatusDisplay}`,
    `- **Data/Hora da Validação:** ${buildValidation?.validatedAt || 'Pendente'}`,
    `- **Destino Canônico:** \`${siteInfo.siteDir}\``,
    `- **Checagens Estruturais:**`,
    `  - [${buildValidation?.checks?.hasIndexHtml ? 'x' : ' '}] index.html presente com tamanho mínimo e estrutura válida`,
    `  - [${buildValidation?.checks?.hasStylesCss ? 'x' : ' '}] styles.css presente e integrado`,
    `  - [${buildValidation?.checks?.hasScriptJs ? 'x' : ' '}] script.js presente`,
    `  - [${buildValidation?.checks?.noPreviewElements ? 'x' : ' '}] Elementos de preview higienizados`,
    `  - [${buildValidation?.checks?.noForbiddenFiles ? 'x' : ' '}] Ausência de arquivos standalone / manifestos`,
    `  - [${buildValidation?.checks?.noPreviewsGarimpoPath ? 'x' : ' '}] Destino isolado fora de previews-garimpo`,
    ``,
    `> [!NOTE]`,
    `> **COMANDO DE VALIDAÇÃO TÉCNICA:**`,
    `> - Para validar os arquivos do site: \`node dispatcher.js ${projectSlug} ${targetVersion} --validate-site\``,
    ``,
    `---`,
    ``,
    `## ✅ HOMOLOGAÇÃO DO SITE DE PRODUÇÃO`,
    ``,
    `- **Status da Homologação:** ${homologationStatusDisplay}`,
    `- **Decisão Registrada:** \`${homologation.decision}\``,
    `- **Projeto:** \`${projectSlug}\``,
    `- **Homologador:** ${homologation.decisionBy || 'Pendente'}`,
    `- **Data/Hora:** ${homologation.decisionAt || 'Pendente'}`,
    `- **Notas de Homologação:** ${homologation.notes || '(Aguardando inspeção formal de Paulo Nunes)'}`,
    `- **Regra de Governança:** A homologação do site exige verificação humana formal após inspeção do site local e não ocorre automaticamente pelo simples término do build.`,
    ``,
    `> [!NOTE]`,
    `> **COMANDOS DE HOMOLOGAÇÃO:**`,
    `> - Para homologar o site construído: \`node dispatcher.js ${projectSlug} ${targetVersion} --approve-homologation\``,
    `> - Para rejeitar a homologação: \`node dispatcher.js ${projectSlug} ${targetVersion} --reject-homologation\``,
    `> - Para consultar status: \`node dispatcher.js ${projectSlug} ${targetVersion} --homologation-status\``,
    ``,
    `---`,
    ``,
    `## 🌐 SITE DE PRODUÇÃO`,
    ``,
    ...(siteInfo.exists ? [
      `- **Status Local:** 🟢 DISPONÍVEL NO DISCO LOCAL (SITE DE PRODUÇÃO LOCAL)`,
      `- **Localização Canônica:** \`${siteInfo.indexPath}\``,
      `- **Acesso Direto:** 👉 [ABRIR SITE DE PRODUÇÃO](file:///${siteInfo.indexPath.replace(/\\/g, '/')})`,
      ``,
      `> [!NOTE]`,
      `> **VISUALIZAÇÃO SEGURA (LOCAL):** Este link abre a versão definitiva de produção diretamente do armazenamento local do seu computador. Não requer conexão à internet, não realiza publicação e não altera o preview público.`,
      ``,
      `**Comando para abrir no navegador padrão via terminal:**`,
      `\`\`\`bash`,
      `node dispatcher.js ${projectSlug} ${targetVersion} --open-site`,
      `\`\`\``
    ] : [
      `⚪ SITE DE PRODUÇÃO AINDA NÃO DISPONÍVEL`,
      ``,
      `O diretório \`site-producao/index.html\` ainda não foi gerado para esta oportunidade.`
    ]),
    ``,
    `---`,
    `### COMANDO PARA AUTORIZAR DISPARO REAL (SOMENTE APÓS DELIBERAÇÃO HUMANA)`,
    `> [!CAUTION]`,
    `> **ATENÇÃO:** O envio real é irreversível e exige autorização soberana prévia de Paulo Nunes.`,
    `\`\`\`bash`,
    `node dispatcher.js ${projectSlug} ${targetVersion} --production-send`,
    `\`\`\``,
    ``
  ].join('\n');

  // Grava o arquivo PAINEL_APROVACAO.md na pasta da oportunidade
  let savedPath = null;
  if (fs.existsSync(projectDir)) {
    savedPath = path.join(projectDir, 'PAINEL_APROVACAO.md');
    fs.writeFileSync(savedPath, content, 'utf8');
  }

  // Tenta abrir/focar no editor central do Antigravity IDE se solicitado
  if (savedPath && options.openInEditor !== false) {
    openInAntigravityEditor(savedPath);
  }

  return {
    success: true,
    savedPath,
    content,
    statusBadge,
    gateStatus,
    recipient,
    sender,
    subject,
    previewUrl,
    buildApproval,
    productionSite: {
      exists: siteInfo.exists,
      path: siteInfo.indexPath
    }
  };
}

/**
 * Executor de E-mail (Integração Segura com Gmail API após Validação do Gate).
 *
 * ORDEM DE OPERAÇÃO RIGOROSA (11 PASSOS):
 * 1. Carregar manifest.json
 * 2. Validar integridade
 * 3. Validar status (exige APPROVED)
 * 4. Validar approvedBy (exige "Paulo Nunes")
 * 5. Validar approvedAt (exige data ISO válida)
 * 6. Validar versão
 * 7. Validar destinatário
 * 8. Validar conteúdo/minuta
 * 9. Validar demais regras existentes
 * (Se QUALQUER validação falhar: ABORTAR IMEDIATAMENTE. Nenhuma chamada Gmail é inicializada)
 * 10. Somente depois inicializar o cliente Gmail
 * 11. Somente depois enviar (Modo DRY-RUN obrigatório por padrão. Envio real exige --production-send)
 */
async function executeDispatcher(projectSlug, version, options = {}) {
  const isProductionSend = (options.productionSend === true) && (options.dryRun === false);
  const dryRunMode = !isProductionSend;

  console.log('====================================================');
  console.log(` EXECUTOR DE E-MAIL - GARIMPO SITES (${dryRunMode ? 'MODO SEGURO / DRY-RUN' : 'MODO PRODUÇÃO'})`);
  console.log('====================================================');
  console.log(`Projeto Alvo: ${projectSlug} | Versão: ${version || 'auto'}`);
  console.log(`Modo:         ${dryRunMode ? 'DRY-RUN (Simulação sem envio externo)' : 'PRODUÇÃO REAL (--production-send)'}`);
  console.log(`Timestamp:    ${new Date().toISOString()}`);
  console.log('----------------------------------------------------');

  // PASSOS 1 A 9: VALIDAÇÃO COMPLETA DO GATE HUMANO E INTEGRIDADE
  const gateResult = validateEmailGate(projectSlug, version, options);

  if (!gateResult.allowed) {
    console.error('\n[STATUS: BLOQUEADO PELO GATE DE SEGURANÇA]');
    console.error(`Motivo: ${gateResult.reason}`);
    console.error(`Status do Projeto: ${gateResult.status}`);
    if (gateResult.errors && gateResult.errors.length > 0) {
      console.error('\nViolações detectadas:');
      gateResult.errors.forEach(err => console.error(`  - ${err}`));
    }
    console.log('----------------------------------------------------');
    console.log('Ação: EXECUÇÃO ABORTADA. NENHUM CLIENTE GMAIL INICIALIZADO. NENHUM E-MAIL ENVIADO.\n');

    return {
      allowed: false,
      dispatched: false,
      blockedByGate: true,
      reason: gateResult.reason,
      status: gateResult.status,
      errors: gateResult.errors
    };
  }

  // PASSO 10: INICIALIZAR O CLIENTE GMAIL SOMENTE APÓS O GATE APROVAR
  console.log('\n[STATUS: GATE FORMAL APROVADO]');
  console.log('✓ 10 de 10 Regras do Gate Satisfeitas.');
  console.log('✓ Status formal APPROVED verificado.');
  console.log(`✓ Aprovado formalmente por: ${gateResult.audit.approvedBy}`);
  console.log(`✓ Data da Aprovação:        ${gateResult.audit.approvedAt}`);
  console.log(`✓ Decisão do Gate:          ${gateResult.audit.decision}`);
  console.log('----------------------------------------------------');

  const emailPayload = {
    from: gateResult.sender,
    to: gateResult.recipient,
    subject: gateResult.subject,
    bodyText: gateResult.bodyText,
    previewUrl: gateResult.previewUrl
  };

  // PASSO 11: ENVIO VIA CLIENTE GMAIL (DRY-RUN OU PRODUÇÃO)
  try {
    const gmailResult = await sendViaGmailApi(emailPayload, {
      ...options,
      productionSend: isProductionSend,
      dryRun: dryRunMode
    });

    if (dryRunMode) {
      const panelRes = generateApprovalPanel(projectSlug, version, { ...options, gateResult });
      console.log('PACOTE DE DISPARO (SIMULAÇÃO DRY-RUN):');
      console.log(`  De:          ${gateResult.sender}`);
      console.log(`  Para:        ${gateResult.recipient}`);
      console.log(`  Assunto:     ${gateResult.subject}`);
      console.log(`  Preview URL: ${gateResult.previewUrl}`);
      console.log(`  Minuta:      ${gateResult.minutaPath}`);
      console.log(`  Tamanho:     ${gateResult.bodyText ? gateResult.bodyText.length : 0} caracteres`);
      if (panelRes && panelRes.savedPath) {
        console.log(`  Painel:      ${panelRes.savedPath}`);
      }
      console.log('----------------------------------------------------');
      console.log('[CONFIRMAÇÃO DE SEGURANÇA]');
      console.log('Nenhuma conexão externa efetuada.');
      console.log('Nenhuma chamada de rede à Gmail API efetuada.');
      console.log('Modo padrão DRY-RUN mantido ativo.\n');
    } else {
      console.log('PACOTE DE DISPARO (PRODUÇÃO GMAIL):');
      console.log(`  Message ID:  ${gmailResult.messageId}`);
      console.log(`  Thread ID:   ${gmailResult.threadId}`);
      console.log(`  De:          ${gmailResult.sender}`);
      console.log(`  Para:        ${gmailResult.recipient}`);
      console.log('----------------------------------------------------');
    }

    return {
      allowed: true,
      status: gateResult.status,
      sender: gateResult.sender,
      recipient: gateResult.recipient,
      subject: gateResult.subject,
      previewUrl: gateResult.previewUrl,
      dryRun: gmailResult.dryRun,
      dispatched: gmailResult.dispatched,
      dispatchMode: gmailResult.mode || (gmailResult.dispatched ? 'PRODUCTION' : 'DRY_RUN_ONLY'),
      message: gmailResult.message,
      payload: {
        sender: gateResult.sender,
        recipient: gateResult.recipient,
        subject: gateResult.subject,
        previewUrl: gateResult.previewUrl,
        bodySnippet: gateResult.bodyText ? gateResult.bodyText.substring(0, 160) + '...' : '',
        bodyLength: gateResult.bodyText ? gateResult.bodyText.length : 0
      },
      gmailResult,
      audit: gateResult.audit
    };
  } catch (err) {
    console.error(`\n[ERRO NO CLIENTE GMAIL]: ${err.message}`);
    return {
      allowed: true,
      dispatched: false,
      error: err.message,
      reason: 'GMAIL_CLIENT_ERROR',
      audit: gateResult.audit
    };
  }
}

// Interface CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  const isProduction = args.includes('--production-send');
  const positionalArgs = args.filter(a => !a.startsWith('--'));
  const slug = positionalArgs[0] || 'castlink-world';
  const version = positionalArgs[1] || 'v2';

  // Modo exclusivo de visualização/geração do Painel Central
  if (args.includes('--panel')) {
    const panelRes = generateApprovalPanel(slug, version);
    console.log(`\n====================================================`);
    console.log(` PAINEL DE APROVAÇÃO COMERCIAL GERADO COM SUCESSO`);
    console.log(`====================================================`);
    console.log(`Arquivo: ${panelRes.savedPath}`);
    console.log(`Status:  ${panelRes.statusBadge}`);
    if (panelRes.productionSite && panelRes.productionSite.exists) {
      console.log(`Site:    🟢 DISPONÍVEL (${panelRes.productionSite.path})`);
    } else {
      console.log(`Site:    ⚪ AINDA NÃO DISPONÍVEL`);
    }
    console.log(`\n(Visualização central aberta no editor Antigravity IDE)\n`);
    process.exit(0);
  }

  // Abertura direta do site de produção no navegador padrão do sistema
  if (args.includes('--open-site') || args.includes('--open-production-site')) {
    const openRes = openProductionSiteInBrowser(slug);
    if (openRes.success) {
      console.log(`\n====================================================`);
      console.log(` 🌐 SITE DE PRODUÇÃO ABERTO COM SUCESSO`);
      console.log(`====================================================`);
      console.log(`Oportunidade: ${slug}`);
      console.log(`Arquivo:      ${openRes.filePath}`);
      console.log(`\n(Site aberto no navegador padrão do Windows)\n`);
      process.exit(0);
    } else {
      console.error(`\n[AVISO] Site de produção não disponível para: ${slug}`);
      console.error(`Motivo: ${openRes.message}`);
      process.exit(1);
    }
  }

  // Aprovação formal da construção do site
  if (args.includes('--approve-build')) {
    try {
      const res = setBuildApproval(slug, 'APPROVED', { approver: 'Paulo Nunes' });
      console.log(`\n====================================================`);
      console.log(` APROVAÇÃO DE CONSTRUÇÃO REGISTRADA COM SUCESSO`);
      console.log(`====================================================`);
      console.log(`Projeto:   ${slug}`);
      console.log(`Decisão:   🟢 ${res.decision} (${res.status})`);
      console.log(`Aprovador: ${res.decisionBy}`);
      console.log(`Data/Hora: ${res.decisionAt}`);
      console.log(`Painel:    Atualizado em Garimpo-sites\\esbocos\\${slug}\\PAINEL_APROVACAO.md`);
      console.log(`\n(Construção NÃO iniciada nesta fase. Governança registrada com sucesso)\n`);
      process.exit(0);
    } catch (err) {
      console.error(`\n[ERRO DE GOVERNANÇA]: ${err.message}`);
      process.exit(1);
    }
  }

  // Rejeição formal da construção do site
  if (args.includes('--reject-build')) {
    try {
      const res = setBuildApproval(slug, 'REJECTED', { approver: 'Paulo Nunes' });
      console.log(`\n====================================================`);
      console.log(` REJEIÇÃO DE CONSTRUÇÃO REGISTRADA COM SUCESSO`);
      console.log(`====================================================`);
      console.log(`Projeto:   ${slug}`);
      console.log(`Decisão:   🔴 ${res.decision} (${res.status})`);
      console.log(`Aprovador: ${res.decisionBy}`);
      console.log(`Data/Hora: ${res.decisionAt}`);
      console.log(`Painel:    Atualizado em Garimpo-sites\\esbocos\\${slug}\\PAINEL_APROVACAO.md\n`);
      process.exit(0);
    } catch (err) {
      console.error(`\n[ERRO DE GOVERNANÇA]: ${err.message}`);
      process.exit(1);
    }
  }

  // Consulta do status de aprovação da construção do site
  if (args.includes('--build-status')) {
    const val = validateBuildApproval(slug);
    console.log(`\n====================================================`);
    console.log(` STATUS DE APROVAÇÃO DA CONSTRUÇÃO`);
    console.log(`====================================================`);
    console.log(`Projeto:   ${val.projectSlug}`);
    console.log(`Status:    ${val.approved ? '🟢 APROVADA' : (val.decision === 'REJECTED' ? '🔴 REJEITADA' : '⏳ PENDENTE DE APROVAÇÃO')}`);
    console.log(`Decisão:   ${val.decision}`);
    console.log(`Aprovador: ${val.decisionBy || 'Pendente'}`);
    console.log(`Data/Hora: ${val.decisionAt || 'Pendente'}`);
    console.log(`Autorizado para construção: ${val.approved ? 'SIM' : 'NÃO'}\n`);
    process.exit(0);
  }

  // Construção controlada e orquestrada do site de produção (Fases 2 e 3)
  if (args.includes('--build-site') || args.includes('--execute-build')) {
    try {
      const buildRes = executeBuildSite(slug, version);
      console.log(`\n====================================================`);
      console.log(` 🏗️ CONSTRUÇÃO CONTROLADA DO SITE DE PRODUÇÃO`);
      console.log(`====================================================`);
      console.log(`Projeto:      ${slug}`);
      console.log(`Versão:       ${version}`);
      console.log(`Status:       🟢 ${buildRes.buildExecution.status}`);
      console.log(`Validação:    ${buildRes.buildValidation.isValid ? '🟢 VALIDADA' : '🔴 FALHOU'}`);
      console.log(`Destino:      ${buildRes.buildResult.canonicalPath}`);
      console.log(`Executado em: ${buildRes.buildExecution.executedAt}`);
      console.log(`Arquivos:     ${buildRes.buildResult.files.join(', ')}`);
      console.log(`Painel:       Atualizado em PAINEL_APROVACAO.md\n`);
      process.exit(0);
    } catch (err) {
      console.error(`\n[ERRO NA CONSTRUÇÃO]: ${err.message}`);
      process.exit(1);
    }
  }

  // Validação técnica independente dos arquivos no destino canônico (Fase 3)
  if (args.includes('--validate-site')) {
    const valRes = validateProductionSite(slug, version);
    console.log(`\n====================================================`);
    console.log(` 🔎 VALIDAÇÃO TÉCNICA DO SITE DE PRODUÇÃO`);
    console.log(`====================================================`);
    console.log(`Projeto:      ${slug}`);
    console.log(`Versão:       ${version}`);
    console.log(`Status:       ${valRes.isValid ? '🟢 VALIDADA' : '🔴 INVÁLIDA'}`);
    console.log(`Destino:      ${valRes.canonicalPath}`);
    console.log(`Data/Hora:    ${valRes.validatedAt}`);
    console.log(`Checagens:`);
    console.log(`  - Diretório de produção:       ${valRes.checks.dirExists ? '✓' : '✗'}`);
    console.log(`  - index.html presente:          ${valRes.checks.hasIndexHtml ? '✓' : '✗'}`);
    console.log(`  - index.html tamanho >= 200B:   ${valRes.checks.hasValidIndexHtmlSize ? '✓' : '✗'}`);
    console.log(`  - index.html estrutura válida:  ${valRes.checks.hasValidHtmlStructure ? '✓' : '✗'}`);
    console.log(`  - Elementos preview removidos:  ${valRes.checks.noPreviewElements ? '✓' : '✗'}`);
    console.log(`  - styles.css presente:          ${valRes.checks.hasStylesCss ? '✓' : '✗'}`);
    console.log(`  - script.js presente:           ${valRes.checks.hasScriptJs ? '✓' : '✗'}`);
    console.log(`  - Sem arquivos standalone:      ${valRes.checks.noForbiddenFiles ? '✓' : '✗'}`);
    console.log(`  - Isolado de previews-garimpo:  ${valRes.checks.noPreviewsGarimpoPath ? '✓' : '✗'}`);
    console.log(`  - Destino canônico verificado:  ${valRes.checks.isCanonicalPath ? '✓' : '✗'}\n`);
    process.exit(valRes.isValid ? 0 : 1);
  }

  // Homologação formal soberana do site construído (Fase 3)
  if (args.includes('--approve-homologation')) {
    try {
      const res = setHomologation(slug, true, { version });
      console.log(`\n====================================================`);
      console.log(` HOMOLOGAÇÃO DO SITE REGISTRADA COM SUCESSO`);
      console.log(`====================================================`);
      console.log(`Projeto:     ${slug}`);
      console.log(`Versão:      ${version}`);
      console.log(`Decisão:     🟢 ${res.decision} (${res.status})`);
      console.log(`Homologador: ${res.decisionBy}`);
      console.log(`Data/Hora:   ${res.decisionAt}`);
      console.log(`Notas:       ${res.notes}`);
      console.log(`Painel:      Atualizado em PAINEL_APROVACAO.md\n`);
      process.exit(0);
    } catch (err) {
      console.error(`\n[ERRO NA HOMOLOGAÇÃO]: ${err.message}`);
      process.exit(1);
    }
  }

  // Rejeição formal da homologação do site (Fase 3)
  if (args.includes('--reject-homologation')) {
    try {
      const res = setHomologation(slug, false, { version });
      console.log(`\n====================================================`);
      console.log(` REJEIÇÃO DE HOMOLOGAÇÃO REGISTRADA COM SUCESSO`);
      console.log(`====================================================`);
      console.log(`Projeto:     ${slug}`);
      console.log(`Versão:      ${version}`);
      console.log(`Decisão:     🔴 ${res.decision} (${res.status})`);
      console.log(`Homologador: ${res.decisionBy}`);
      console.log(`Data/Hora:   ${res.decisionAt}`);
      console.log(`Notas:       ${res.notes}`);
      console.log(`Painel:      Atualizado em PAINEL_APROVACAO.md\n`);
      process.exit(0);
    } catch (err) {
      console.error(`\n[ERRO NA HOMOLOGAÇÃO]: ${err.message}`);
      process.exit(1);
    }
  }

  // Consulta do status de homologação da oportunidade (Fase 3)
  if (args.includes('--homologation-status')) {
    const homo = getHomologation(slug);
    console.log(`\n====================================================`);
    console.log(` STATUS DE HOMOLOGAÇÃO DO SITE`);
    console.log(`====================================================`);
    console.log(`Projeto:     ${slug}`);
    console.log(`Status:      ${homo.approved ? '🟢 HOMOLOGADO' : (homo.decision === 'REJECTED' ? '🔴 REJEITADO' : '⏳ PENDENTE DE HOMOLOGAÇÃO')}`);
    console.log(`Decisão:     ${homo.decision}`);
    console.log(`Homologador: ${homo.decisionBy || 'Pendente'}`);
    console.log(`Data/Hora:   ${homo.decisionAt || 'Pendente'}`);
    console.log(`Notas:       ${homo.notes || 'Pendente'}\n`);
    process.exit(0);
  }

  executeDispatcher(slug, version, {
    productionSend: isProduction,
    dryRun: !isProduction
  }).then(result => {
    if (!result.allowed || (isProduction && !result.dispatched)) {
      process.exitCode = 1;
    }
  }).catch(err => {
    console.error('Erro na execução do dispatcher:', err);
    process.exitCode = 1;
  });
}

module.exports = {
  OFFICIAL_SENDER,
  REQUIRED_APPROVER,
  REQUIRED_DECISION,
  REQUIRED_STATUS,
  BUILD_DECISION_PENDING,
  BUILD_DECISION_APPROVED,
  BUILD_DECISION_REJECTED,
  VALID_BUILD_DECISIONS,
  BUILD_STATUS_PENDING,
  BUILD_STATUS_APPROVED,
  BUILD_STATUS_REJECTED,
  VALID_BUILD_STATUSES,
  HOMOLOGATION_DECISION_PENDING,
  HOMOLOGATION_DECISION_APPROVED,
  HOMOLOGATION_DECISION_REJECTED,
  VALID_HOMOLOGATION_DECISIONS,
  normalizeBuildDecision,
  parseMinuta,
  findMinutaFile,
  validateEmailGate,
  generateApprovalPanel,
  openInAntigravityEditor,
  executeDispatcher,
  getProductionSitePath,
  openProductionSiteInBrowser,
  getBuildApproval,
  setBuildApproval,
  validateBuildApproval,
  assertBuildApproved,
  acquireBuildLock,
  releaseBuildLock,
  validateProductionSite,
  getBuildValidation,
  assertBuildValidated,
  validateHomologation,
  getHomologation,
  setHomologation,
  assertSiteHomologated,
  executeBuildSite,
  executeApprovedBuild: executeBuildSite,
  buildSite: executeBuildSite
};
