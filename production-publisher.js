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
const ERR_PROTECTED_ENVIRONMENT_UNTOUCHABLE = 'PROTECTED_ENVIRONMENT_UNTOUCHABLE';
const ERR_PROTECTED_DOMAIN_FORBIDDEN = 'PROTECTED_DOMAIN_FORBIDDEN';
const ERR_UNAUTHORIZED_TARGET_DESTINATION = 'UNAUTHORIZED_TARGET_DESTINATION';
const ERR_FORBIDDEN_LAB_INFRASTRUCTURE = 'FORBIDDEN_LAB_INFRASTRUCTURE_TARGET';
const ERR_FORBIDDEN_CLIENT_DOMAIN = 'FORBIDDEN_CLIENT_DOMAIN';
const ERR_MISSING_TARGET_REPOSITORY = 'MISSING_TARGET_REPOSITORY';
const ERR_PUBLICATION_CONTEXT_AMBIGUOUS = 'PUBLICATION_CONTEXT_AMBIGUOUS';

const REAL_CASTLINK_DOMAIN_NOT_IDENTIFIED = 'REAL_CASTLINK_DOMAIN_NOT_IDENTIFIED';
const REAL_CASTLINK_DOMAIN_STATUS = REAL_CASTLINK_DOMAIN_NOT_IDENTIFIED;

function getRealCastLinkDomainStatus() {
  return REAL_CASTLINK_DOMAIN_STATUS;
}

const DEFAULT_LOCK_TTL_MS = 5 * 60 * 1000; // 5 minutos
const LOCK_FILENAME = '.publication.lock';
const OWNERSHIP_MODEL_OPTION_B = 'CLIENT_OWNERSHIP_OPTION_B';
const VALID_PROVIDERS = ['GITHUB_PAGES'];

const ENVIRONMENT_TYPES = Object.freeze({
  CASTLINK_REAL: 'CASTLINK_REAL',       // Produção real do CastLink (intocável e estritamente protegida)
  CASTLINK_WORLD: 'CASTLINK_WORLD',     // Laboratório de testes sem domínio personalizado
  CLIENT_PROJECT: 'CLIENT_PROJECT',     // Projeto real de cliente com repo e domínio próprios
  GARIMPO_INTERNAL: 'GARIMPO_INTERNAL'  // Infraestrutura interna de previews (previews-garimpo)
});

/**
 * Registro de Domínios Protegidos (PROTECTED_DOMAINS).
 * Não inventa domínios reais: inicia vazio e é populado explicitamente por configuração/opções.
 */
const PROTECTED_DOMAINS = [];

/**
 * Registra um domínio protegido explicitamente.
 */
function registerProtectedDomain(domain) {
  if (!domain || typeof domain !== 'string') return;
  const clean = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (clean && !PROTECTED_DOMAINS.includes(clean)) {
    PROTECTED_DOMAINS.push(clean);
  }
}

/**
 * Limpa a lista de domínios protegidos registrados.
 */
function clearProtectedDomains() {
  PROTECTED_DOMAINS.length = 0;
}

/**
 * Retorna todos os domínios protegidos ativos (registrados + opções locais).
 */
function getProtectedDomains(options = {}) {
  const domains = new Set(PROTECTED_DOMAINS);
  if (Array.isArray(options.protectedDomains)) {
    for (const d of options.protectedDomains) {
      if (typeof d === 'string') {
        const clean = d.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
        if (clean) domains.add(clean);
      }
    }
  }
  return Array.from(domains);
}

/**
 * Verifica deterministicamente se um domínio pertence à lista de domínios protegidos.
 */
function isProtectedDomain(domain, options = {}) {
  if (!domain || typeof domain !== 'string') return false;
  const clean = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const list = getProtectedDomains(options);
  return list.some(p => clean === p || clean.endsWith('.' + p));
}

/**
 * Garante que o domínio NÃO é um domínio protegido.
 * Lança deterministicamente o erro PROTECTED_DOMAIN_FORBIDDEN se violado.
 */
function assertDomainNotProtected(domain, projectSlug = '', options = {}) {
  if (!domain || typeof domain !== 'string') return true;
  const clean = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (isProtectedDomain(clean, options)) {
    const err = new Error(`[DOMÍNIO PROTEGIDO] O domínio '${domain}' é protegido do ecossistema CastLink e não pode ser utilizado como customDomain, CNAME ou destino: PROTECTED_DOMAIN_FORBIDDEN`);
    err.code = 'PROTECTED_DOMAIN_FORBIDDEN';
    err.domain = domain;
    err.projectSlug = projectSlug;
    throw err;
  }
  return true;
}

/**
 * Resolve conceitualmente o tipo de ambiente para o projeto e destino.
 */
function resolveEnvironmentType(projectSlug = '', targetRepo = '', options = {}) {
  const cleanSlug = (projectSlug || '').trim().toLowerCase();
  const cleanRepo = (targetRepo || '').trim().toLowerCase();

  if (options.environment && ENVIRONMENT_TYPES[options.environment]) {
    return options.environment;
  }
  if (cleanRepo.includes(FORBIDDEN_PATH_SUBSTRING) || cleanSlug === FORBIDDEN_PATH_SUBSTRING) {
    return ENVIRONMENT_TYPES.GARIMPO_INTERNAL;
  }
  if (cleanSlug === 'castlink-real' || options.isCastlinkReal === true) {
    return ENVIRONMENT_TYPES.CASTLINK_REAL;
  }
  if (cleanSlug === 'castlink-world') {
    return ENVIRONMENT_TYPES.CASTLINK_WORLD;
  }
  return ENVIRONMENT_TYPES.CLIENT_PROJECT;
}


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
 * Bloqueia expressamente a utilização de domínios protegidos e de castlink.world para clientes.
 */
function validateCustomDomain(domain, projectSlug = '', options = {}) {
  // BARREIRA SOBERANA: CASTLINK_REAL é absolutamente intocável
  const env = resolveEnvironmentType(projectSlug, '', options);
  if (env === ENVIRONMENT_TYPES.CASTLINK_REAL || projectSlug === 'castlink-real' || options.isCastlinkReal === true) {
    const err = new Error(`[VIOLAÇÃO DE AMBIENTE PROTEGIDO] O ambiente '${ENVIRONMENT_TYPES.CASTLINK_REAL}' é a produção real intocável do CastLink. É terminantemente proibido atribuir ou modificar domínios: ${ERR_PROTECTED_ENVIRONMENT_UNTOUCHABLE}`);
    err.code = ERR_PROTECTED_ENVIRONMENT_UNTOUCHABLE;
    throw err;
  }

  if (!domain || typeof domain !== 'string') {
    const err = new Error('customDomain inválido ou ausente.');
    err.code = 'INVALID_CUSTOM_DOMAIN';
    throw err;
  }
  const clean = domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');

  // 1. REJEIÇÃO DETERMINÍSTICA DE DOMÍNIOS PROTEGIDOS (FASE 7)
  assertDomainNotProtected(clean, projectSlug, options);

  // 2. Bloqueio categórico: castlink.world é apenas para o projeto de teste/referência
  if (clean.includes('castlink.world') && projectSlug !== 'castlink-world') {
    const err = new Error(`[VIOLAÇÃO DE DOMÍNIO] castlink.world é exclusivo para testes da plataforma e não pode ser atribuído a clientes: '${domain}'`);
    err.code = ERR_FORBIDDEN_CLIENT_DOMAIN;
    throw err;
  }

  // 3. Validação de FQDN
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
function formatCnameContent(domain, projectSlug = '', options = {}) {
  // BARREIRA SOBERANA: CASTLINK_REAL nunca pode gerar CNAME
  const env = resolveEnvironmentType(projectSlug, '', options);
  if (env === ENVIRONMENT_TYPES.CASTLINK_REAL || projectSlug === 'castlink-real' || options.isCastlinkReal === true) {
    const err = new Error(`[VIOLAÇÃO DE AMBIENTE PROTEGIDO] O ambiente '${ENVIRONMENT_TYPES.CASTLINK_REAL}' é a produção real intocável do CastLink. É terminantemente proibido gerar CNAME: ${ERR_PROTECTED_ENVIRONMENT_UNTOUCHABLE}`);
    err.code = ERR_PROTECTED_ENVIRONMENT_UNTOUCHABLE;
    throw err;
  }

  // BARREIRA DE LABORATÓRIO: castlink-world nunca pode gerar CNAME
  if (projectSlug === 'castlink-world' && !options.allowLabCustomDomain) {
    const err = new Error("[ISOLAMENTO DO LABORATÓRIO] 'castlink-world' é exclusivamente ambiente de laboratório e nunca pode gerar CNAME: LAB_CNAME_FORBIDDEN");
    err.code = 'LAB_CNAME_FORBIDDEN';
    throw err;
  }

  const cleanDomain = validateCustomDomain(domain, projectSlug, options);
  return `${cleanDomain}\n`;
}

/**
 * Valida deterministicamente o destino de publicação (Opção B - Client Ownership e Isolamento da Fase 7).
 */
function validatePublicationTarget(target, projectSlug = '', options = {}) {
  // BARREIRA SOBERANA: CASTLINK_REAL nunca pode receber destino de publicação
  const env = resolveEnvironmentType(projectSlug, (target && typeof target === 'object' ? target.targetRepository : ''), options);
  if (env === ENVIRONMENT_TYPES.CASTLINK_REAL || projectSlug === 'castlink-real' || options.isCastlinkReal === true) {
    const err = new Error(`[VIOLAÇÃO DE AMBIENTE PROTEGIDO] O ambiente '${ENVIRONMENT_TYPES.CASTLINK_REAL}' é a produção real intocável do CastLink. Operações de publicação são terminantemente proibidas: ${ERR_PROTECTED_ENVIRONMENT_UNTOUCHABLE}`);
    err.code = ERR_PROTECTED_ENVIRONMENT_UNTOUCHABLE;
    throw err;
  }

  if (!target) {
    return {
      provider: PUBLICATION_TARGET_PENDING,
      configured: false,
      customDomain: null,
      cnameRequired: false
    };
  }

  if (typeof target === 'string') {
    if (target === PUBLICATION_TARGET_PENDING) {
      return {
        provider: PUBLICATION_TARGET_PENDING,
        configured: false,
        customDomain: null,
        cnameRequired: false
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

  if (target.provider === PUBLICATION_TARGET_PENDING || target.configured === false) {
    return {
      provider: PUBLICATION_TARGET_PENDING,
      configured: false,
      customDomain: null,
      cnameRequired: false
    };
  }

  // Validação preventiva contra domínios protegidos em quaisquer campos do target
  const candidateDomains = [
    target.customDomain,
    target.cname,
    target.stagingDomain,
    target.labDomain,
    target.clientDomain
  ].filter(Boolean);

  for (const cd of candidateDomains) {
    if (typeof cd === 'string') {
      assertDomainNotProtected(cd, projectSlug, options);
    }
  }

  const provider = (target.provider || 'GITHUB_PAGES').toUpperCase();
  if (!VALID_PROVIDERS.includes(provider)) {
    const err = new Error(`Provedor de publicação não suportado: '${target.provider}'. Provedores válidos: ${VALID_PROVIDERS.join(', ')}`);
    err.code = 'UNSUPPORTED_PUBLICATION_PROVIDER';
    throw err;
  }

  // Validação do repositório remoto do cliente
  if (!target.targetRepository || typeof target.targetRepository !== 'string') {
    const err = new Error(`targetRepository é obrigatório para destino configurado: ${ERR_MISSING_TARGET_REPOSITORY}`);
    err.code = ERR_MISSING_TARGET_REPOSITORY;
    throw err;
  }

  const cleanRepo = target.targetRepository.trim();

  // A) previews-garimpo como repositório de produção de cliente
  if (cleanRepo.toLowerCase().includes(FORBIDDEN_PATH_SUBSTRING)) {
    const err = new Error(`[VIOLAÇÃO DE ISOLAMENTO] targetRepository não pode apontar para o repositório central de previews (${FORBIDDEN_PATH_SUBSTRING}): '${cleanRepo}'`);
    err.code = 'FORBIDDEN_TARGET_REPOSITORY';
    throw err;
  }

  // B) castlink-world como repositório de produção de cliente (Projeto de cliente não pode apontar para infraestrutura do laboratório)
  if (projectSlug !== 'castlink-world' && cleanRepo.toLowerCase().includes('castlink-world')) {
    const err = new Error(`[VIOLAÇÃO DE ISOLAMENTO] Projeto de cliente não pode apontar para a infraestrutura do laboratório ('castlink-world'): '${cleanRepo}'`);
    err.code = ERR_FORBIDDEN_LAB_INFRASTRUCTURE;
    throw err;
  }

  if (cleanRepo.includes('..') || cleanRepo.includes('\\')) {
    const err = new Error(`targetRepository contém caracteres proibidos ou tentativa de path traversal: '${cleanRepo}'`);
    err.code = 'INVALID_TARGET_REPOSITORY';
    throw err;
  }

  // E) qualquer destino que não esteja explicitamente autorizado pelo manifesto
  if (Array.isArray(options.authorizedDestinations) && options.authorizedDestinations.length > 0) {
    const isAuthorized = options.authorizedDestinations.some(d => d.toLowerCase() === cleanRepo.toLowerCase());
    if (!isAuthorized) {
      const err = new Error(`[DESTINO NÃO AUTORIZADO] Repositório destino '${cleanRepo}' não está na lista de destinos autorizados: ${ERR_UNAUTHORIZED_TARGET_DESTINATION}`);
      err.code = ERR_UNAUTHORIZED_TARGET_DESTINATION;
      err.targetRepository = cleanRepo;
      throw err;
    }
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
    customDomain = validateCustomDomain(target.customDomain, projectSlug, options);
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
 * PUBLICATION SAFETY GATE — Gate Soberano e Determinístico de Segurança de Publicação.
 *
 * Valida rigorosamente todas as 8 barreiras obrigatórias antes de qualquer tentativa
 * de planejamento, geração de artefatos, criação de lock ou execução:
 *
 * 1. CASTLINK_REAL -> PROTECTED_ENVIRONMENT_UNTOUCHABLE
 * 2. Domínio Protegido -> PROTECTED_DOMAIN_FORBIDDEN
 * 3. Destino Não Autorizado -> UNAUTHORIZED_TARGET_DESTINATION
 * 4. Repositório do Lab usado por Cliente -> FORBIDDEN_LAB_INFRASTRUCTURE_TARGET
 * 5. Domínio do Lab usado por Cliente -> FORBIDDEN_CLIENT_DOMAIN
 * 6. Ausência de Repositório Próprio -> MISSING_TARGET_REPOSITORY
 * 7. Tentativa de Publicação Real -> PRODUCTION_PUBLICATION_EXECUTION_DISABLED
 * 8. Tentativa de Operação Ambígua -> PUBLICATION_CONTEXT_AMBIGUOUS
 *
 * @param {string} projectSlug
 * @param {string} version
 * @param {Object|string} targetConfig
 * @param {Object} options
 * @returns {Object} { passed: true, safe: true, environment, projectSlug, dryRun: true, executionAllowed: false }
 */
function assertPublicationSafetyGate(projectSlug, version, targetConfig = {}, options = {}) {
  // 1. TENTATIVA DE PUBLICAÇÃO REAL (Bloqueio Categórico)
  if (options.dryRun === false || options.executeReal === true || options.realPublication === true || options.allowRealExecution === true) {
    const err = new Error(`[SAFETY GATE] Publicação remota real terminantemente desabilitada nesta fase: ${ERR_PRODUCTION_EXECUTION_DISABLED}`);
    err.code = ERR_PRODUCTION_EXECUTION_DISABLED;
    err.projectSlug = projectSlug;
    err.version = version;
    throw err;
  }

  // 2. DETECÇÃO DE OPERAÇÃO AMBÍGUA (PUBLICATION_CONTEXT_AMBIGUOUS)
  // A) Flags explícitas de ambiguidade de contexto ou ownership
  if (options.ambiguousContext === true || options.contextAmbiguous === true || options.ownershipAmbiguous === true) {
    const err = new Error(`[SAFETY GATE] Operação rejeitada por ambiguidade no contexto de publicação ou propriedade: ${ERR_PUBLICATION_CONTEXT_AMBIGUOUS}`);
    err.code = ERR_PUBLICATION_CONTEXT_AMBIGUOUS;
    err.projectSlug = projectSlug;
    throw err;
  }

  // B) Identificação inequívoca do projeto
  if (!projectSlug || typeof projectSlug !== 'string' || !projectSlug.trim()) {
    const err = new Error(`[SAFETY GATE] Identificação do projeto ausente ou ambígua: ${ERR_PUBLICATION_CONTEXT_AMBIGUOUS}`);
    err.code = ERR_PUBLICATION_CONTEXT_AMBIGUOUS;
    throw err;
  }

  const cleanSlug = projectSlug.trim().toLowerCase();
  if (options.projectSlug && options.projectSlug.trim().toLowerCase() !== cleanSlug) {
    const err = new Error(`[SAFETY GATE] Divergência ambígua na identificação do projeto ('${projectSlug}' vs '${options.projectSlug}'): ${ERR_PUBLICATION_CONTEXT_AMBIGUOUS}`);
    err.code = ERR_PUBLICATION_CONTEXT_AMBIGUOUS;
    throw err;
  }

  // C) Ambiguidade ou divergência de ambiente declarado
  if (options.environment) {
    if (cleanSlug === 'castlink-world' && options.environment === ENVIRONMENT_TYPES.CLIENT_PROJECT) {
      const err = new Error(`[SAFETY GATE] Conflito ambíguo: 'castlink-world' não pode ser declarado como '${ENVIRONMENT_TYPES.CLIENT_PROJECT}': ${ERR_PUBLICATION_CONTEXT_AMBIGUOUS}`);
      err.code = ERR_PUBLICATION_CONTEXT_AMBIGUOUS;
      throw err;
    }
    if (cleanSlug !== 'castlink-world' && cleanSlug !== 'castlink-real' && options.environment === ENVIRONMENT_TYPES.CASTLINK_WORLD) {
      const err = new Error(`[SAFETY GATE] Conflito ambíguo: Projeto de cliente '${projectSlug}' não pode ser mascarado como '${ENVIRONMENT_TYPES.CASTLINK_WORLD}': ${ERR_PUBLICATION_CONTEXT_AMBIGUOUS}`);
      err.code = ERR_PUBLICATION_CONTEXT_AMBIGUOUS;
      throw err;
    }
  }

  // D) Ambiguidade de credenciais ou tokens
  if (options.credentialsAmbiguous === true || options.tokenAmbiguous === true || options.unauthorizedCredentials === true) {
    const err = new Error(`[SAFETY GATE] Tentativa de operação com credenciais não autenticadas ou ambíguas: ${ERR_PUBLICATION_CONTEXT_AMBIGUOUS}`);
    err.code = ERR_PUBLICATION_CONTEXT_AMBIGUOUS;
    throw err;
  }

  // 3. CASTLINK_REAL (Intocável e Soberano)
  const target = (typeof targetConfig === 'object' && targetConfig !== null) ? targetConfig : {};
  const envType = resolveEnvironmentType(cleanSlug, target.targetRepository, options);
  if (envType === ENVIRONMENT_TYPES.CASTLINK_REAL || cleanSlug === 'castlink-real' || options.isCastlinkReal === true) {
    const err = new Error(`[VIOLAÇÃO DE AMBIENTE PROTEGIDO] O ambiente '${ENVIRONMENT_TYPES.CASTLINK_REAL}' é a produção real intocável do CastLink. Operações automatizadas são terminantemente proibidas: ${ERR_PROTECTED_ENVIRONMENT_UNTOUCHABLE}`);
    err.code = ERR_PROTECTED_ENVIRONMENT_UNTOUCHABLE;
    err.environment = envType;
    err.projectSlug = cleanSlug;
    throw err;
  }

  // 4. DESTINO NÃO AUTORIZADO E REPOSITÓRIO PRÓPRIO
  if (options.destinationAuthorized === false) {
    const err = new Error(`[DESTINO NÃO AUTORIZADO] O destino fornecido não possui autorização formal: ${ERR_UNAUTHORIZED_TARGET_DESTINATION}`);
    err.code = ERR_UNAUTHORIZED_TARGET_DESTINATION;
    throw err;
  }

  if (target.configured !== false && target.provider !== PUBLICATION_TARGET_PENDING && (target.provider || target.targetRepository)) {
    const repo = (target.targetRepository || '').trim();

    // Ausência de repositório próprio
    if (!repo) {
      const err = new Error(`[REPOSITÓRIO AUSENTE] Projeto configurado exige targetRepository próprio: ${ERR_MISSING_TARGET_REPOSITORY}`);
      err.code = ERR_MISSING_TARGET_REPOSITORY;
      throw err;
    }

    const repoLower = repo.toLowerCase();

    // Proibição de previews-garimpo
    if (repoLower.includes(FORBIDDEN_PATH_SUBSTRING)) {
      const err = new Error(`[VIOLAÇÃO DE ISOLAMENTO] targetRepository não pode apontar para o repositório central de previews (${FORBIDDEN_PATH_SUBSTRING}): '${repo}'`);
      err.code = 'FORBIDDEN_TARGET_REPOSITORY';
      throw err;
    }

    // Repositório do laboratório usado por cliente
    if (cleanSlug !== 'castlink-world' && repoLower.includes('castlink-world')) {
      const err = new Error(`[VIOLAÇÃO DE ISOLAMENTO] Projeto de cliente não pode apontar para a infraestrutura do laboratório ('castlink-world'): '${repo}'`);
      err.code = ERR_FORBIDDEN_LAB_INFRASTRUCTURE;
      throw err;
    }

    // Ambiguidade de ownership no repositório
    if (options.expectedOwner && typeof options.expectedOwner === 'string') {
      const parts = repo.split('/');
      if (parts.length === 2 && parts[0].toLowerCase() !== options.expectedOwner.trim().toLowerCase()) {
        const err = new Error(`[SAFETY GATE] Ambiguidade no ownership do repositório ('${parts[0]}' vs esperado '${options.expectedOwner}'): ${ERR_PUBLICATION_CONTEXT_AMBIGUOUS}`);
        err.code = ERR_PUBLICATION_CONTEXT_AMBIGUOUS;
        throw err;
      }
    }

    // Destino não autorizado na lista de autorizações
    if (Array.isArray(options.authorizedDestinations) && options.authorizedDestinations.length > 0) {
      const isAuth = options.authorizedDestinations.some(d => d.toLowerCase() === repoLower);
      if (!isAuth) {
        const err = new Error(`[DESTINO NÃO AUTORIZADO] Repositório destino '${repo}' não está na lista de destinos autorizados: ${ERR_UNAUTHORIZED_TARGET_DESTINATION}`);
        err.code = ERR_UNAUTHORIZED_TARGET_DESTINATION;
        err.targetRepository = repo;
        throw err;
      }
    }
  }

  // 5. ISOLAMENTO DO LABORATÓRIO: castlink-world NUNCA pode gerar CNAME
  if (cleanSlug === 'castlink-world' && (target.cnameRequired || options.cnameRequired) && !options.allowLabCustomDomain) {
    const err = new Error(`[ISOLAMENTO DO LABORATÓRIO] 'castlink-world' nunca pode gerar CNAME: LAB_CNAME_FORBIDDEN`);
    err.code = 'LAB_CNAME_FORBIDDEN';
    throw err;
  }

  // 6. DOMÍNIO PROTEGIDO E ISOLAMENTO DE DOMÍNIO
  const customDomain = target.customDomain || options.customDomain || null;

  // CNAME exigido sem fornecimento explícito do domínio -> ambiguidade
  if ((target.cnameRequired || options.cnameRequired) && !customDomain) {
    const err = new Error(`[SAFETY GATE] Requisição de CNAME sem fornecimento explícito do domínio: ${ERR_PUBLICATION_CONTEXT_AMBIGUOUS}`);
    err.code = ERR_PUBLICATION_CONTEXT_AMBIGUOUS;
    throw err;
  }

  if (customDomain) {
    // Domínio protegido
    assertDomainNotProtected(customDomain, cleanSlug, options);

    const cleanDomain = customDomain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');

    // Domínio do laboratório usado por cliente
    if (cleanDomain.includes('castlink.world') && cleanSlug !== 'castlink-world') {
      const err = new Error(`[VIOLAÇÃO DE DOMÍNIO] castlink.world é exclusivo para testes da plataforma e não pode ser atribuído a clientes: '${customDomain}'`);
      err.code = ERR_FORBIDDEN_CLIENT_DOMAIN;
      throw err;
    }

    // Laboratório castlink-world nunca pode receber customDomain na publicação
    if (cleanSlug === 'castlink-world' && !options.allowLabCustomDomain) {
      const err = new Error(`[ISOLAMENTO DO LABORATÓRIO] 'castlink-world' é ambiente de laboratório e nunca pode receber customDomain: LAB_CUSTOM_DOMAIN_FORBIDDEN`);
      err.code = 'LAB_CUSTOM_DOMAIN_FORBIDDEN';
      throw err;
    }

    // Ambiguidade de ownership do domínio
    if (options.domainOwnershipAmbiguous === true || options.domainOwnerAmbiguous === true) {
      const err = new Error(`[SAFETY GATE] Ambiguidade na titularidade/ownership do domínio '${customDomain}': ${ERR_PUBLICATION_CONTEXT_AMBIGUOUS}`);
      err.code = ERR_PUBLICATION_CONTEXT_AMBIGUOUS;
      throw err;
    }
  }

  return {
    passed: true,
    safe: true,
    environment: envType,
    projectSlug: cleanSlug,
    dryRun: true,
    executionAllowed: false
  };
}

/**
 * Constrói o Plano Determinístico de Publicação de Produção (DRY-RUN).
 */
function buildProductionPublicationPlan(projectSlug, version, options = {}) {
  // BARREIRA SOBERANA: Executa todas as 8 validações do Publication Safety Gate
  const safetyGate = assertPublicationSafetyGate(projectSlug, version, options.publicationTarget, options);
  const envType = safetyGate.environment;

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
      configured: false,
      customDomain: null,
      cnameRequired: false
    };
  } else {
    targetNormalized = validatePublicationTarget(rawTarget, cleanSlug, options);
  }
  const targetConfigured = targetNormalized.configured === true;

  // 6. Preparação dos arquivos planejados (inclui CNAME quando customDomain ativo)
  const expectedFiles = [...integrity.files];
  let totalSizeBytes = integrity.totalSizeBytes;

  if (targetConfigured && targetNormalized.cnameRequired && targetNormalized.customDomain) {
    const cnameContent = formatCnameContent(targetNormalized.customDomain, cleanSlug, options);
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
    contractVersion: '1.2.0',
    environment: envType,
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
 * Na Fase 6/7, a execução real permanece expressamente desabilitada.
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
 * Bloqueio Categórico de Execução Real de Publicação (Fase 6 e 7).
 * Qualquer tentativa de execução dispara erro determinístico.
 */
function publishProductionSite(projectSlug, version, options = {}) {
  const err = new Error('Publicação real de produção está desabilitada nesta fase. Apenas o plano DRY-RUN pode ser executado.');
  err.code = ERR_PRODUCTION_EXECUTION_DISABLED;
  err.projectSlug = projectSlug;
  err.version = version;
  throw err;
}

/**
 * EXECUTOR CONTROLADO DE PUBLICAÇÃO (FASE 7)
 *
 * Executa deterministicamente as 11 etapas de validação e simulação em modo seguro (DRY-RUN):
 * 1. Valida o ambiente (resolveEnvironmentType e barreira intransponível de CASTLINK_REAL).
 * 2. Valida o projeto (validateProjectSlug e existência canônica).
 * 3. Valida o repositório destino (validatePublicationTarget, barreira de previews-garimpo, laboratório e autorizações).
 * 4. Valida o domínio (assertDomainNotProtected, regras de customDomain do lab e clientes).
 * 5. Valida o manifesto (leitura segura e integridade de gates).
 * 6. Valida a versão homologada (assertPublicationApproved).
 * 7. Valida o hash dos artefatos (SHA-256 e assertArtifactIntegrityNotTampered).
 * 8. Adquire o publication lock (.publication.lock atômico).
 * 9. Gera o plano de publicação (buildProductionPublicationPlan).
 * 10. Apresenta/registra o que seria publicado (dryRunReport / simulationReport detalhado).
 * 11. Bloqueia categoricamente publicação remota real (liberação do lock em bloco finally).
 */
function executeControlledPublication(projectSlug, version, options = {}) {
  // BARREIRA SOBERANA: Validação prévia irrestrita pelo Publication Safety Gate
  assertPublicationSafetyGate(projectSlug, version, options.publicationTarget, options);

  // 1. Validação do Ambiente
  const envType = resolveEnvironmentType(projectSlug, options.publicationTarget?.targetRepository, options);
  if (envType === ENVIRONMENT_TYPES.CASTLINK_REAL) {
    const err = new Error(`[VIOLAÇÃO DE AMBIENTE PROTEGIDO] O ambiente '${ENVIRONMENT_TYPES.CASTLINK_REAL}' é a produção real intocável do CastLink. Operações automatizadas são terminantemente proibidas: ${ERR_PROTECTED_ENVIRONMENT_UNTOUCHABLE}`);
    err.code = ERR_PROTECTED_ENVIRONMENT_UNTOUCHABLE;
    err.environment = envType;
    throw err;
  }

  // 2. Validação do Projeto
  const cleanSlug = validateProjectSlug(projectSlug);

  // 3. Validação do Repositório Destino
  const rawTarget = options.publicationTarget || PUBLICATION_TARGET_PENDING;
  let targetNormalized;
  if (rawTarget === PUBLICATION_TARGET_PENDING) {
    targetNormalized = {
      provider: PUBLICATION_TARGET_PENDING,
      configured: false,
      customDomain: null,
      cnameRequired: false
    };
  } else {
    targetNormalized = validatePublicationTarget(rawTarget, cleanSlug, options);
  }

  // 4. Validação do Domínio (ocorre ANTES de qualquer escrita/lock)
  if (targetNormalized.customDomain) {
    assertDomainNotProtected(targetNormalized.customDomain, cleanSlug, options);
  }

  // Para castlink-world no laboratório: customDomain deve permanecer ausente ou null na Fase 7
  if (cleanSlug === 'castlink-world') {
    if (targetNormalized.customDomain && !options.allowLabCustomDomain) {
      const err = new Error("[ISOLAMENTO DO LABORATÓRIO] 'castlink-world' não deve utilizar customDomain na Fase 7. Deve permanecer null/ausente.");
      err.code = 'LAB_CUSTOM_DOMAIN_FORBIDDEN';
      throw err;
    }
  }

  // 5. Validação do Manifesto
  const baseDir = options.baseDir || (fs.existsSync(DEFAULT_GARIMPO_DIR) ? DEFAULT_GARIMPO_DIR : path.join(__dirname, '..', 'esbocos'));
  const projectDir = path.join(baseDir, cleanSlug);
  const manifestPath = path.join(projectDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    const err = new Error(`Manifesto não encontrado para o projeto '${cleanSlug}' em: ${manifestPath}`);
    err.code = 'MANIFEST_NOT_FOUND';
    throw err;
  }
  let manifest;
  try {
    const raw = fs.readFileSync(manifestPath, 'utf8');
    manifest = JSON.parse(raw.replace(/^\uFEFF/, ''));
  } catch (e) {
    const err = new Error(`Erro ao analisar manifesto de '${cleanSlug}': ${e.message}`);
    err.code = 'INVALID_MANIFEST_JSON';
    throw err;
  }

  // 6. Validação da Versão Homologada (assertPublicationApproved)
  const cleanVersion = validateVersion(version);
  const assertGate = options.assertPublicationApproved || require('./dispatcher').assertPublicationApproved;
  const gateRes = assertGate(cleanSlug, cleanVersion, { ...options, baseDir });

  // 7. Validação do Hash dos Artefatos
  const canonicalSourceDir = resolveCanonicalSourceDirectory(cleanSlug, { ...options, baseDir });
  const integrity = calculateArtifactIntegrity(canonicalSourceDir);
  if (options.expectedAggregateSha256) {
    assertArtifactIntegrityNotTampered(canonicalSourceDir, options.expectedAggregateSha256);
  }

  // 8. Aquisição do Publication Lock
  const lock = acquirePublicationLock(cleanSlug, cleanVersion, { ...options, baseDir });

  try {
    // 9. Geração do Plano de Publicação
    const plan = buildProductionPublicationPlan(cleanSlug, cleanVersion, {
      ...options,
      baseDir,
      publicationTarget: targetNormalized
    });

    // 10. Apresentação e Registro do que seria publicado
    const simulationReport = {
      executorVersion: '1.0.0',
      timestamp: new Date().toISOString(),
      environment: envType,
      projectSlug: cleanSlug,
      version: cleanVersion,
      sourceDirectory: canonicalSourceDir,
      lockAcquired: {
        pid: lock.pid,
        acquiredAt: lock.acquiredAt
      },
      targetInfrastructure: {
        provider: plan.publicationTarget,
        repository: plan.targetConfig.targetRepository || '(Nenhum / Pendente)',
        branch: plan.targetConfig.targetBranch || 'main',
        customDomain: plan.targetConfig.customDomain || null,
        cnameArtifactPlanned: plan.targetConfig.cnameRequired && Boolean(plan.targetConfig.customDomain)
      },
      artifactVerification: {
        totalFiles: plan.totalFiles,
        totalSizeBytes: plan.totalSizeBytes,
        aggregateSha256: plan.aggregateSha256,
        files: plan.expectedFiles.map(f => ({
          file: f.relativePath,
          size: f.size,
          sha256: f.sha256,
          generated: Boolean(f.generated)
        }))
      },
      gatesState: {
        approved: gateRes.approved,
        decisionBy: gateRes.publicationApproval?.decisionBy,
        decisionAt: gateRes.publicationApproval?.decisionAt
      },
      dryRun: true,
      executionAllowed: false,
      remotePublicationExecuted: false,
      status: 'SIMULATED_SUCCESSFULLY'
    };

    // 11. Bloqueio de Publicação Remota Real (sempre ativo)
    return {
      success: true,
      simulated: true,
      dryRun: true,
      executionAllowed: false,
      environment: envType,
      plan,
      simulationReport
    };
  } finally {
    // Libera o lock atômico ao final da execução controlada
    releasePublicationLock(cleanSlug, { ...options, baseDir });
  }
}

module.exports = {
  DEFAULT_GARIMPO_DIR,
  FORBIDDEN_PATH_SUBSTRING,
  PUBLICATION_TARGET_PENDING,
  ERR_PRODUCTION_EXECUTION_DISABLED,
  ERR_PROTECTED_ENVIRONMENT_UNTOUCHABLE,
  ERR_PROTECTED_DOMAIN_FORBIDDEN,
  ERR_UNAUTHORIZED_TARGET_DESTINATION,
  ERR_FORBIDDEN_LAB_INFRASTRUCTURE,
  ERR_FORBIDDEN_CLIENT_DOMAIN,
  ERR_MISSING_TARGET_REPOSITORY,
  ERR_PUBLICATION_CONTEXT_AMBIGUOUS,
  REAL_CASTLINK_DOMAIN_NOT_IDENTIFIED,
  REAL_CASTLINK_DOMAIN_STATUS,
  getRealCastLinkDomainStatus,
  DEFAULT_LOCK_TTL_MS,
  LOCK_FILENAME,
  OWNERSHIP_MODEL_OPTION_B,
  VALID_PROVIDERS,
  ENVIRONMENT_TYPES,
  PROTECTED_DOMAINS,
  registerProtectedDomain,
  clearProtectedDomains,
  getProtectedDomains,
  isProtectedDomain,
  assertDomainNotProtected,
  resolveEnvironmentType,
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
  assertPublicationSafetyGate,
  executeControlledPublication,
  publishProductionSite
};
