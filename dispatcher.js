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

const OFFICIAL_SENDER = 'paulonunes.consultoriadigital@gmail.com';
const REQUIRED_APPROVER = 'Paulo Nunes';
const REQUIRED_DECISION = 'APROVAR';
const REQUIRED_STATUS = 'APPROVED';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
 * Executor de E-mail em Modo Seguro (DRY-RUN).
 * Garante que nenhuma chamada externa aconteça nesta etapa.
 */
function executeDispatcher(projectSlug, version, options = {}) {
  console.log('====================================================');
  console.log(' EXECUTOR DE E-MAIL - GARIMPO SITES (MODO SEGURO)');
  console.log('====================================================');
  console.log(`Projeto Alvo: ${projectSlug} | Versão: ${version || 'auto'}`);
  console.log(`Timestamp:    ${new Date().toISOString()}`);
  console.log('----------------------------------------------------');

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
    console.log('Ação: EXECUÇÃO ABORTADA. NENHUM E-MAIL FOI ENVIADO.\n');

    return {
      allowed: false,
      dispatched: false,
      reason: gateResult.reason,
      status: gateResult.status,
      errors: gateResult.errors
    };
  }

  // MODO DRY-RUN MANDATÓRIO
  console.log('\n[STATUS: PERMITIDO EM MODO DRY-RUN]');
  console.log('✓ 10 de 10 Regras do Gate Satisfeitas.');
  console.log('✓ Status formal APPROVED verificado.');
  console.log(`✓ Aprovado formalmente por: ${gateResult.audit.approvedBy}`);
  console.log(`✓ Data da Aprovação:        ${gateResult.audit.approvedAt}`);
  console.log(`✓ Decisão do Gate:          ${gateResult.audit.decision}`);
  console.log('----------------------------------------------------');
  console.log('PACOTE DE DISPARO (SIMULAÇÃO DRY-RUN):');
  console.log(`  De:          ${gateResult.sender}`);
  console.log(`  Para:        ${gateResult.recipient}`);
  console.log(`  Assunto:     ${gateResult.subject}`);
  console.log(`  Preview URL: ${gateResult.previewUrl}`);
  console.log(`  Minuta:      ${gateResult.minutaPath}`);
  console.log(`  Tamanho:     ${gateResult.bodyText ? gateResult.bodyText.length : 0} caracteres`);
  console.log('----------------------------------------------------');
  console.log('[CONFIRMAÇÃO DE SEGURANÇA]');
  console.log('Nenhuma conexão externa efetuada.');
  console.log('Nenhuma chamada Gmail API, SMTP ou OAuth efetuada.');
  console.log('Disparo real inativo nesta etapa.\n');

  return {
    allowed: true,
    status: gateResult.status,
    dryRun: true,
    dispatched: false,
    dispatchMode: 'DRY_RUN_ONLY',
    message: gateResult.message,
    payload: {
      sender: gateResult.sender,
      recipient: gateResult.recipient,
      subject: gateResult.subject,
      previewUrl: gateResult.previewUrl,
      bodySnippet: gateResult.bodyText ? gateResult.bodyText.substring(0, 160) + '...' : '',
      bodyLength: gateResult.bodyText ? gateResult.bodyText.length : 0
    },
    audit: gateResult.audit
  };
}

// Interface CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  const slug = args[0] || 'castlink-world';
  const version = args[1] || 'v2';

  const result = executeDispatcher(slug, version);

  if (!result.allowed) {
    process.exitCode = 1;
  }
}

module.exports = {
  OFFICIAL_SENDER,
  REQUIRED_APPROVER,
  REQUIRED_DECISION,
  REQUIRED_STATUS,
  parseMinuta,
  findMinutaFile,
  validateEmailGate,
  executeDispatcher
};
