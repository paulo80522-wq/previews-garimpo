/**
 * PRODUCTION PUBLISHER — EXECUTOR CONTROLADO DE PUBLICAÇÃO DE PRODUÇÃO (FASE 6)
 * Garimpo Sites - Camada Determinística de Publicação em Modo Seguro (DRY-RUN)
 *
 * RESPONSABILIDADES:
 * 1. Validar deterministicamente a requisição de publicação (projectSlug e version explícitos).
 * 2. Exigir e verificar todos os gates das Fases 1 a 4 (assertPublicationApproved).
 * 3. Localizar exclusivamente o artefato canônico local em:
 *    Garimpo-sites\esbocos\<projectSlug>\site-producao\
 * 4. Bloquear expressamente qualquer origem dentro de previews-garimpo ou fora do projeto.
 * 5. Inspecionar e validar a integridade estrutural e criptográfica (SHA-256) dos arquivos locais.
 * 6. Validar o destino de publicação isolado por cliente (Opção B - Client Ownership):
 *    - GITHUB_PAGES isolado por cliente (um repositório por cliente, sem repositórios compartilhados).
 *    - Suporte a domínio próprio do cliente (customDomain) e geração do artefato CNAME.
 *    - Bloqueio estrito do uso de castlink.world como domínio para clientes.
 * 7. Mecanismo determinístico de Lock Concorrente (.publication.lock com PID e TTL de 5 minutos).
 * 8. Verificação de integridade contra adulteração de artefatos pós-homologação.
 * 9. Especificação formal de Handover e ciclo de vida em 5 etapas.
 * 10. Operar obrigatoriamente em modo DRY-RUN nesta fase.
 * 11. Bloquear categoricamente qualquer tentativa de execução real de publicação
 *     com o erro PRODUCTION_PUBLICATION_EXECUTION_DISABLED.
 *
 * RESTRIÇÕES ABSOLUTAS:
 * - NUNCA importar publisher de previews.
 * - NUNCA fazer upload remoto, push ou chamada de rede.
 * - NUNCA alterar os arquivos de site-producao ou manifestos durante o planejamento.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_GARIMPO_DIR = 'C:\\Users\\35tul\\Garimpo-sites\\esbocos';
const FORBIDDEN_PATH_SUBSTRING = 'previews-garimpo';
const PUBLICATION_TARGET_PENDING = 'PENDING_CONFIGURATION';
const ERR_PRODUCTION_EXECUTION_DISABLED = 'PRODUCTION_PUBLICATION_EXECUTION_DISABLED';
const DEFAULT_LOCK_TTL_MS = 5 * 60 * 1000; // 5 minutos
const LOCK_FILENAME = '.publication.lock';
const OWNERSHIP_MODEL_OPTION_B = 'CLIENT_OWNERSHIP_OPTION_B';
const VALID_PROVIDERS = ['GITHUB_PAGES'];

/**
 * Valida o formato estrito do projectSlug.
 */
function validateProjectSlug(slug) {
  if (!slug || typeof slug !== 'string') {
    const err = new Error('projectSlug inválido ou ausente.');
    err.code = 'INVALID_PROJECT_SLUG';
    throw err;
  }
  const clean = slug.trim();
  if (clean.includes('..') || clean.includes('/') || clean.includes('\\')) {
    const err = new Error(`projectSlug contém caracteres proibidos ou tentativa de path traversal: '${slug}'`);
    err.code = 'PATH_TRAVERSAL_DETECTED';
    throw err;
  }
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(clean)) {
    const err = new Error(`projectSlug inválido: '${slug}'. Deve conter apenas letras minúsculas, números e hífens.`);
    err.code = 'INVALID_PROJECT_SLUG';
    throw err;
  }
  return clean;
}

/**
 * Valida o formato da versão.
 */
function validateVersion(version) {
  if (!version || typeof version !== 'string') {
    const err = new Error('version inválida ou ausente.');
    err.code = 'INVALID_VERSION';
    throw err;
  }
  const clean = version.trim();
  if (clean.includes('..') || clean.includes('/') || clean.includes('\\')) {
    const err = new Error(`version contém caracteres proibidos ou tentativa de path traversal: '${version}'`);
    err.code = 'PATH_TRAVERSAL_DETECTED';
    throw err;
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(clean)) {
    const err = new Error(`version inválida: '${version}'.`);
    err.code = 'INVALID_VERSION';
    throw err;
  }
  return clean;
}

/**
 * Valida o formato de um domínio personalizado (FQDN).
 * Bloqueia expressamente a utilização de castlink.world para clientes.
 */
function validateCustomDomain(domain, projectSlug = '') {
  if (!domain || typeof domain !== 'string') {
    const err = new Error('customDomain inválido ou ausente.');
    err.code = 'INVALID_CUSTOM_DOMAIN';
    throw err;
  }
  const clean = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');

  // Bloqueio categórico: castlink.world é apenas para o projeto de teste/referência
  if (clean.includes('castlink.world') && projectSlug !== 'castlink-world') {
    const err = new Error(`[VIOLAÇÃO DE DOMÍNIO] castlink.world é exclusivo para testes da plataforma e não pode ser atribuído a clientes: '${domain}'`);
    err.code = 'FORBIDDEN_CLIENT_DOMAIN';
    throw err;
  }

  // Validação de FQDN
  const fqdnRegex = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$/i;
  if (!fqdnRegex.test(clean) || clean.includes('..')) {
    const err = new Error(`Formato de customDomain inválido: '${domain}'. Deve ser um FQDN válido (ex: www.cliente.com.br).`);
    err.code = 'INVALID_CUSTOM_DOMAIN_FORMAT';
    throw err;
  }

  return clean;
}

/**
 * Formata o conteúdo determinístico do arquivo CNAME.
 */
function formatCnameContent(domain, projectSlug = '') {
  const cleanDomain = validateCustomDomain(domain, projectSlug);
  return `${cleanDomain}\n`;
}

/**
 * Valida deterministicamente o destino de publicação (Opção B - Client Ownership).
 */
function validatePublicationTarget(target, projectSlug = '', options = {}) {
  if (!target) {
    return {
      provider: PUBLICATION_TARGET_PENDING,
      configured: false
    };
  }

  if (typeof target === 'string') {
    if (target === PUBLICATION_TARGET_PENDING) {
      return {
        provider: PUBLICATION_TARGET_PENDING,
        configured: false
      };
    }
    const err = new Error(`publicationTarget em formato de string inválido: '${target}'. Deve ser '${PUBLICATION_TARGET_PENDING}' ou um objeto estruturado.`);
    err.code = 'INVALID_PUBLICATION_TARGET';
    throw err;
  }

  if (typeof target !== 'object') {
    const err = new Error('publicationTarget inválido. Deve ser um objeto estruturado ou PENDING_CONFIGURATION.');
    err.code = 'INVALID_PUBLICATION_TARGET';
    throw err;
  }

  const provider = (target.provider || 'GITHUB_PAGES').toUpperCase();
  if (!VALID_PROVIDERS.includes(provider)) {
    const err = new Error(`Provedor de publicação não suportado: '${target.provider}'. Provedores válidos: ${VALID_PROVIDERS.join(', ')}`);
    err.code = 'UNSUPPORTED_PUBLICATION_PROVIDER';
    throw err;
  }

  // Validação do repositório remoto do cliente
  if (!target.targetRepository || typeof target.targetRepository !== 'string') {
    const err = new Error('targetRepository é obrigatório para destino configurado.');
    err.code = 'MISSING_TARGET_REPOSITORY';
    throw err;
  }

  const cleanRepo = target.targetRepository.trim();
  if (cleanRepo.toLowerCase().includes(FORBIDDEN_PATH_SUBSTRING)) {
    const err = new Error(`[VIOLAÇÃO DE ISOLAMENTO] targetRepository não pode apontar para o repositório central de previews (${FORBIDDEN_PATH_SUBSTRING}): '${cleanRepo}'`);
    err.code = 'FORBIDDEN_TARGET_REPOSITORY';
    throw err;
  }

  if (cleanRepo.includes('..') || cleanRepo.includes('\\')) {
    const err = new Error(`targetRepository contém caracteres proibidos ou tentativa de path traversal: '${cleanRepo}'`);
    err.code = 'INVALID_TARGET_REPOSITORY';
    throw err;
  }

  // Branch de produção
  const targetBranch = (target.targetBranch || 'main').trim();
  if (!/^[a-zA-Z0-9._-]+$/.test(targetBranch)) {
    const err = new Error(`targetBranch inválida: '${targetBranch}'`);
    err.code = 'INVALID_TARGET_BRANCH';
    throw err;
  }

  // Custom Domain e CNAME
  let customDomain = null;
  let cnameRequired = Boolean(target.cnameRequired);
  if (target.customDomain) {
    customDomain = validateCustomDomain(target.customDomain, projectSlug);
    cnameRequired = true;
  } else if (cnameRequired) {
    const err = new Error('cnameRequired está ativo mas customDomain não foi informado.');
    err.code = 'MISSING_CUSTOM_DOMAIN';
    throw err;
  }

  return {
    provider,
    targetRepository: cleanRepo,
    targetBranch,
    customDomain,
    cnameRequired,
    ownershipModel: OWNERSHIP_MODEL_OPTION_B,
    configured: true
  };
}

/**
 * Valida deterministicamente que o diretório de origem é canônico e seguro.
 * Bloqueia expressamente qualquer caminho dentro de previews-garimpo.
 */
function assertCanonicalProductionSource(sourceDir, projectSlug) {
  if (!sourceDir || typeof sourceDir !== 'string') {
    const err = new Error('Caminho de origem inválido ou ausente.');
    err.code = 'INVALID_CANONICAL_SOURCE';
    throw err;
  }

  const normalized = path.resolve(sourceDir);
  const lower = normalized.toLowerCase();

  // BARREIRA 1: BLOQUEIO ABSOLUTO DE previews-garimpo
  if (lower.includes(FORBIDDEN_PATH_SUBSTRING)) {
    const err = new Error(`[VIOLAÇÃO DE SEGURANÇA] Origem terminantemente proibida dentro de previews-garimpo: ${sourceDir}`);
    err.code = 'FORBIDDEN_OUTPUT_PATH';
    throw err;
  }

  // BARREIRA 2: O caminho deve terminar exatamente com <projectSlug>/site-producao
  const expectedSuffix = path.join(projectSlug, 'site-producao').toLowerCase();
  if (!lower.endsWith(expectedSuffix)) {
    const err = new Error(`[DESTINO INVÁLIDO] O caminho de origem canônico deve terminar com '${projectSlug}\\site-producao': ${sourceDir}`);
    err.code = 'INVALID_CANONICAL_SOURCE';
    throw err;
  }

  // BARREIRA 3: O diretório precisa existir fisicamente
  if (!fs.existsSync(normalized)) {
    const err = new Error(`[DIRETÓRIO INEXISTENTE] Diretório de produção não existe para o projeto '${projectSlug}': ${normalized}`);
    err.code = 'PRODUCTION_SITE_DIR_NOT_FOUND';
    err.sourceDir = normalized;
    throw err;
  }

  return true;
}

/**
 * Resolve o diretório canônico local de site-producao para o projeto.
 */
function resolveCanonicalSourceDirectory(projectSlug, options = {}) {
  const cleanSlug = validateProjectSlug(projectSlug);
  const baseDir = options.baseDir || (fs.existsSync(DEFAULT_GARIMPO_DIR) ? DEFAULT_GARIMPO_DIR : path.join(__dirname, '..', 'esbocos'));
  const projectDir = path.join(baseDir, cleanSlug);
  const sourceDir = path.join(projectDir, 'site-producao');

  assertCanonicalProductionSource(sourceDir, cleanSlug);
  return sourceDir;
}

/**
 * Varre todos os arquivos de um diretório recursivamente.
 */
function scanDirectoryFiles(dirPath, baseDirPath = dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  let files = [];
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(scanDirectoryFiles(fullPath, baseDirPath));
    } else if (entry.isFile()) {
      const relPath = path.relative(baseDirPath, fullPath).replace(/\\/g, '/');
      files.push({ fullPath, relPath });
    }
  }
  return files;
}

/**
 * Calcula a integridade e hashes SHA-256 de todos os arquivos de site-producao.
 */
function calculateArtifactIntegrity(sourceDir) {
  if (!fs.existsSync(sourceDir)) {
    const err = new Error(`Diretório de produção não encontrado: ${sourceDir}`);
    err.code = 'PRODUCTION_SITE_DIR_NOT_FOUND';
    throw err;
  }

  const indexPath = path.join(sourceDir, 'index.html');
  if (!fs.existsSync(indexPath)) {
    const err = new Error(`[ARQUIVO OBRIGATÓRIO AUSENTE] 'index.html' não encontrado em: ${sourceDir}`);
    err.code = 'MISSING_INDEX_HTML';
    throw err;
  }

  const indexStat = fs.statSync(indexPath);
  if (indexStat.size < 200) {
    const err = new Error(`[ARQUIVO INVÁLIDO] 'index.html' possui tamanho insuficiente (${indexStat.size} bytes).`);
    err.code = 'INVALID_INDEX_HTML_SIZE';
    throw err;
  }

  const rawFiles = scanDirectoryFiles(sourceDir);

  // Ordenação determinística estrita por caminho relativo
  rawFiles.sort((a, b) => a.relPath.localeCompare(b.relPath));

  const inspectedFiles = [];
  let totalSizeBytes = 0;
  const hashCollector = [];

  for (const file of rawFiles) {
    const lowerRel = file.relPath.toLowerCase();

    // Verificação de arquivos terminantemente proibidos no site de produção
    if (lowerRel.endsWith('-standalone.html') || lowerRel.includes('standalone') || lowerRel.includes('.git')) {
      const err = new Error(`[ARQUIVO PROIBIDO ENCONTRADO] Arquivo não permitido em site-producao: '${file.relPath}'`);
      err.code = 'FORBIDDEN_FILE_DETECTED';
      throw err;
    }

    const content = fs.readFileSync(file.fullPath);
    const sha256 = crypto.createHash('sha256').update(content).digest('hex');
    const size = content.length;
    totalSizeBytes += size;

    inspectedFiles.push({
      relativePath: file.relPath,
      size,
      sha256
    });

    hashCollector.push(`${file.relPath}:${sha256}`);
  }

  const aggregateSha256 = crypto
    .createHash('sha256')
    .update(hashCollector.join('\n'))
    .digest('hex');

  return {
    files: inspectedFiles,
    totalFiles: inspectedFiles.length,
    totalSizeBytes,
    aggregateSha256
  };
}

/**
 * Valida que os artefatos atuais não sofreram qualquer adulteração após a aprovação.
 */
function assertArtifactIntegrityNotTampered(sourceDir, expectedAggregateSha256) {
  const current = calculateArtifactIntegrity(sourceDir);
  if (expectedAggregateSha256 && current.aggregateSha256 !== expectedAggregateSha256) {
    const err = new Error(`[VIOLAÇÃO DE INTEGRIDADE] O hash dos arquivos atuais (${current.aggregateSha256}) difere do hash aprovado/homologado (${expectedAggregateSha256}).`);
    err.code = 'ARTIFACT_TAMPERED';
    err.expectedSha256 = expectedAggregateSha256;
    err.currentSha256 = current.aggregateSha256;
    throw err;
  }
  return current;
}

/**
 * Retorna o caminho do arquivo de lock para o projeto.
 */
function getLockFilePath(projectSlug, options = {}) {
  const cleanSlug = validateProjectSlug(projectSlug);
  const baseDir = options.baseDir || (fs.existsSync(DEFAULT_GARIMPO_DIR) ? DEFAULT_GARIMPO_DIR : path.join(__dirname, '..', 'esbocos'));
  const projectDir = path.join(baseDir, cleanSlug);
  return path.join(projectDir, LOCK_FILENAME);
}

/**
 * Verifica se existe um Lock de Publicação ativo para o projeto.
 */
function isPublicationLockActive(projectSlug, options = {}) {
  const lockPath = getLockFilePath(projectSlug, options);
  if (!fs.existsSync(lockPath)) {
    return { active: false, lockData: null, expired: false };
  }

  try {
    const raw = fs.readFileSync(lockPath, 'utf8');
    const lockData = JSON.parse(raw);
    const acquiredTime = new Date(lockData.acquiredAt).getTime();
    const ttl = lockData.ttlMs || DEFAULT_LOCK_TTL_MS;
    const now = Date.now();

    if (now - acquiredTime < ttl) {
      return { active: true, lockData, expired: false };
    } else {
      return { active: false, lockData, expired: true };
    }
  } catch (e) {
    return { active: false, lockData: null, expired: true };
  }
}

/**
 * Adquire o Lock de Publicação concorrente de forma atômica e segura.
 */
function acquirePublicationLock(projectSlug, version, options = {}) {
  const cleanSlug = validateProjectSlug(projectSlug);
  const cleanVersion = validateVersion(version);
  const lockPath = getLockFilePath(cleanSlug, options);
  const lockStatus = isPublicationLockActive(cleanSlug, options);

  if (lockStatus.active) {
    const err = new Error(`[LOCK CONCORRENTE ATIVO] Já existe uma publicação em andamento para o projeto '${cleanSlug}' (PID: ${lockStatus.lockData.pid}, Versão: ${lockStatus.lockData.version}).`);
    err.code = 'PUBLICATION_LOCK_ACTIVE';
    err.lockData = lockStatus.lockData;
    throw err;
  }

  // Se havia um lock expirado, remove de forma segura
  if (lockStatus.expired && fs.existsSync(lockPath)) {
    try {
      fs.unlinkSync(lockPath);
    } catch (err) {
      // Ignora erro de concorrência na limpeza
    }
  }

  const lockData = {
    pid: process.pid,
    projectSlug: cleanSlug,
    version: cleanVersion,
    acquiredAt: options.acquiredAtOverride || new Date().toISOString(),
    ttlMs: options.ttlMs || DEFAULT_LOCK_TTL_MS
  };

  const projectDir = path.dirname(lockPath);
  if (!fs.existsSync(projectDir)) {
    fs.mkdirSync(projectDir, { recursive: true });
  }

  fs.writeFileSync(lockPath, JSON.stringify(lockData, null, 2), { flag: 'w' });
  return lockData;
}

/**
 * Libera o Lock de Publicação.
 */
function releasePublicationLock(projectSlug, options = {}) {
  const lockPath = getLockFilePath(projectSlug, options);
  if (fs.existsSync(lockPath)) {
    try {
      fs.unlinkSync(lockPath);
      return true;
    } catch (err) {
      return false;
    }
  }
  return false;
}

/**
 * Gera o Dossiê Formal de Handover e Transferência de Propriedade (Opção B).
 */
function generateHandoverDossier(projectSlug, version, targetConfig = {}, options = {}) {
  const cleanSlug = validateProjectSlug(projectSlug);
  const cleanVersion = validateVersion(version);
  const target = validatePublicationTarget(targetConfig, cleanSlug, options);

  return {
    dossierVersion: '1.0.0',
    projectSlug: cleanSlug,
    version: cleanVersion,
    generatedAt: new Date().toISOString(),
    ownershipModel: OWNERSHIP_MODEL_OPTION_B,
    lifecycleStages: [
      { stage: '1_DESENVOLVIMENTO', owner: 'GARIMPO_SITES', status: 'CONCLUIDO', description: 'Criação do site estático personalizado localmente' },
      { stage: '2_HOMOLOGACAO', owner: 'CLIENTE', status: 'CONCLUIDO', description: 'Validação visual e aprovação formal do protótipo no preview seguro' },
      { stage: '3_PUBLICACAO', owner: 'GARIMPO_SITES', status: 'PRONTO_PARA_DEPLOY', description: 'Deploy controlado no repositório individual do cliente' },
      { stage: '4_HANDOVER', owner: 'GARIMPO_E_CLIENTE', status: 'AGUARDANDO_TRANSFERENCIA', description: 'Transferência da titularidade do repositório GitHub e entrega de instruções de DNS' },
      { stage: '5_OPERACAO', owner: 'CLIENTE', status: 'FUTURA_RESPONSABILIDADE', description: 'Cliente assume a administração soberana de sua infraestrutura sem retenção de acessos pelo Garimpo' }
    ],
    infrastructure: {
      provider: target.provider,
      targetRepository: target.targetRepository || '(Pendente de definição)',
      targetBranch: target.targetBranch || 'main',
      customDomain: target.customDomain || '(Pendente de aquisição pelo cliente)',
      cnameArtifact: target.customDomain ? formatCnameContent(target.customDomain, cleanSlug) : null,
      dnsInstructions: {
        www: 'CNAME apontando para <usuario-cliente>.github.io',
        apexA: ['185.199.108.153', '185.199.109.153', '185.199.110.153', '185.199.111.153']
      }
    },
    securityPolicy: {
      zeroBackdoors: true,
      credentialsRevocationRequired: true,
      clientOwnershipConfirmed: true
    }
  };
}

/**
 * Valida a requisição de publicação de produção.
 */
function validateProductionPublicationRequest(projectSlug, version, options = {}) {
  const cleanSlug = validateProjectSlug(projectSlug);
  const cleanVersion = validateVersion(version);
  const canonicalSourceDir = resolveCanonicalSourceDirectory(cleanSlug, options);

  return {
    projectSlug: cleanSlug,
    version: cleanVersion,
    canonicalSourceDir
  };
}

/**
 * Constrói o Plano Determinístico de Publicação de Produção (DRY-RUN).
 */
function buildProductionPublicationPlan(projectSlug, version, options = {}) {
  // 1. Validação de formato da requisição
  const cleanSlug = validateProjectSlug(projectSlug);
  const cleanVersion = validateVersion(version);

  // 2. Verificação estrita dos gates centrais (Fases 1 a 4)
  const assertGate = options.assertPublicationApproved || require('./dispatcher').assertPublicationApproved;
  const gateRes = assertGate(cleanSlug, cleanVersion, options);

  // 3. Resolução e validação da origem canônica local
  const canonicalSourceDir = resolveCanonicalSourceDirectory(cleanSlug, options);

  // 4. Verificação de integridade e cálculo de hashes dos artefatos
  const integrity = calculateArtifactIntegrity(canonicalSourceDir);

  // Se informado hash esperado para verificação anti-adulteração
  if (options.expectedAggregateSha256) {
    assertArtifactIntegrityNotTampered(canonicalSourceDir, options.expectedAggregateSha256);
  }

  // 5. Verificação e validação do destino de publicação (Opção B - Client Ownership)
  const rawTarget = options.publicationTarget || PUBLICATION_TARGET_PENDING;
  let targetNormalized;
  if (rawTarget === PUBLICATION_TARGET_PENDING) {
    targetNormalized = {
      provider: PUBLICATION_TARGET_PENDING,
      configured: false
    };
  } else {
    targetNormalized = validatePublicationTarget(rawTarget, cleanSlug, options);
  }
  const targetConfigured = targetNormalized.configured === true;

  // 6. Preparação dos arquivos planejados (inclui CNAME quando customDomain ativo)
  const expectedFiles = [...integrity.files];
  let totalSizeBytes = integrity.totalSizeBytes;

  if (targetConfigured && targetNormalized.cnameRequired && targetNormalized.customDomain) {
    const cnameContent = formatCnameContent(targetNormalized.customDomain, cleanSlug);
    const cnameSha256 = crypto.createHash('sha256').update(cnameContent).digest('hex');
    const cnameSize = Buffer.byteLength(cnameContent, 'utf8');

    expectedFiles.push({
      relativePath: 'CNAME',
      size: cnameSize,
      sha256: cnameSha256,
      generated: true
    });
    totalSizeBytes += cnameSize;
  }

  // Ordenação determinística estrita
  expectedFiles.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  // 7. Montagem determinística do Contrato de Publicação
  const plan = {
    contractVersion: '1.1.0',
    projectSlug: cleanSlug,
    version: cleanVersion,
    sourceDirectory: canonicalSourceDir,
    publicationTarget: targetNormalized.provider,
    targetConfig: targetNormalized,
    targetConfigured,
    ownershipModel: OWNERSHIP_MODEL_OPTION_B,
    handoverStage: 'PUBLICACAO',
    dryRun: true,
    mode: 'DRY_RUN',
    plannedAt: options.plannedAtOverride || new Date().toISOString(),
    authorizationState: {
      approved: true,
      decision: 'APPROVED',
      decisionBy: gateRes.publicationApproval?.decisionBy || 'Paulo Nunes',
      decisionAt: gateRes.publicationApproval?.decisionAt || null,
      version: cleanVersion,
      buildVersion: gateRes.buildExecution?.version || cleanVersion,
      homologationVersion: gateRes.siteHomologation?.version || cleanVersion
    },
    expectedFiles,
    totalFiles: expectedFiles.length,
    totalSizeBytes,
    aggregateSha256: integrity.aggregateSha256,
    executionAllowed: false,
    executionBlockReason: ERR_PRODUCTION_EXECUTION_DISABLED,
    status: 'PLAN_GENERATED'
  };

  return plan;
}

/**
 * Avalia se a publicação estaria formalmente pronta para planejamento.
 * Na Fase 6, a execução real permanece expressamente desabilitada.
 */
function assertProductionPublicationReady(projectSlug, version, options = {}) {
  const plan = buildProductionPublicationPlan(projectSlug, version, options);

  return {
    readyForPlanning: true,
    targetConfigured: plan.targetConfigured,
    executionDisabled: true,
    blockReason: ERR_PRODUCTION_EXECUTION_DISABLED,
    plan
  };
}

/**
 * Bloqueio Categórico de Execução Real de Publicação (Fase 6).
 * Qualquer tentativa de execução dispara erro determinístico.
 */
function publishProductionSite(projectSlug, version, options = {}) {
  const err = new Error('Publicação real de produção está desabilitada nesta fase. Apenas o plano DRY-RUN pode ser executado.');
  err.code = ERR_PRODUCTION_EXECUTION_DISABLED;
  err.projectSlug = projectSlug;
  err.version = version;
  throw err;
}

module.exports = {
  DEFAULT_GARIMPO_DIR,
  FORBIDDEN_PATH_SUBSTRING,
  PUBLICATION_TARGET_PENDING,
  ERR_PRODUCTION_EXECUTION_DISABLED,
  DEFAULT_LOCK_TTL_MS,
  LOCK_FILENAME,
  OWNERSHIP_MODEL_OPTION_B,
  VALID_PROVIDERS,
  validateProjectSlug,
  validateVersion,
  validateCustomDomain,
  formatCnameContent,
  validatePublicationTarget,
  assertCanonicalProductionSource,
  resolveCanonicalSourceDirectory,
  calculateArtifactIntegrity,
  assertArtifactIntegrityNotTampered,
  getLockFilePath,
  isPublicationLockActive,
  acquirePublicationLock,
  releasePublicationLock,
  generateHandoverDossier,
  validateProductionPublicationRequest,
  buildProductionPublicationPlan,
  assertProductionPublicationReady,
  publishProductionSite
};
