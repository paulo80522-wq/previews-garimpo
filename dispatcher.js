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

  // Detecção dinâmica e genérica do site de produção
  const siteInfo = getProductionSitePath(projectSlug, options);

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
  parseMinuta,
  findMinutaFile,
  validateEmailGate,
  generateApprovalPanel,
  openInAntigravityEditor,
  executeDispatcher,
  getProductionSitePath,
  openProductionSiteInBrowser
};
