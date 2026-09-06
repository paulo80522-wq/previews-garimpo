/**
 * PRODUCTION PUBLISHER — EXECUTOR CONTROLADO DE PUBLICAÇÃO DE PRODUÇÃO (FASE 5)
 * Garimpo Sites - Camada Determinística de Publicação em Modo Seguro (DRY-RUN)
 *
 * RESPONSABILIDADES:
 * 1. Validar deterministicamente a requisição de publicação (projectSlug e version explícitos).
 * 2. Exigir e verificar todos os gates das Fases 1 a 4 (assertPublicationApproved).
 * 3. Localizar exclusivamente o artefato canônico local em:
 *    Garimpo-sites\esbocos\<projectSlug>\site-producao\
 * 4. Bloquear expressamente qualquer origem dentro de previews-garimpo ou fora do projeto.
 * 5. Inspecionar e validar a integridade estrutural e criptográfica (SHA-256) dos arquivos locais.
 * 6. Construir um plano determinístico de publicação (Contrato de Publicação).
 * 7. Manter destino de publicação como PENDING_CONFIGURATION quando não configurado.
 * 8. Operar obrigatoriamente em modo DRY-RUN nesta fase.
 * 9. Bloquear categoricamente qualquer tentativa de execução real de publicação
 *    com o erro PRODUCTION_PUBLICATION_EXECUTION_DISABLED.
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

  // 5. Verificação do destino de publicação
  const target = options.publicationTarget || PUBLICATION_TARGET_PENDING;
  const targetConfigured = target !== PUBLICATION_TARGET_PENDING;

  // 6. Montagem determinística do Contrato de Publicação
  const plan = {
    contractVersion: '1.0.0',
    projectSlug: cleanSlug,
    version: cleanVersion,
    sourceDirectory: canonicalSourceDir,
    publicationTarget: target,
    targetConfigured,
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
    expectedFiles: integrity.files,
    totalFiles: integrity.totalFiles,
    totalSizeBytes: integrity.totalSizeBytes,
    aggregateSha256: integrity.aggregateSha256,
    executionAllowed: false,
    executionBlockReason: ERR_PRODUCTION_EXECUTION_DISABLED,
    status: 'PLAN_GENERATED'
  };

  return plan;
}

/**
 * Avalia se a publicação estaria formalmente pronta para planejamento.
 * Na Fase 5, a execução real permanece expressamente desabilitada.
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
 * Bloqueio Categórico de Execução Real de Publicação (Fase 5).
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
  validateProjectSlug,
  validateVersion,
  assertCanonicalProductionSource,
  resolveCanonicalSourceDirectory,
  calculateArtifactIntegrity,
  validateProductionPublicationRequest,
  buildProductionPublicationPlan,
  assertProductionPublicationReady,
  publishProductionSite
};
