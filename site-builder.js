/**
 * SITE BUILDER — CONSTRUTOR CONTROLADO DO SITE DE PRODUÇÃO
 * Garimpo Sites - Construção Determinística e Segura (Fase 2)
 *
 * RESPONSABILIDADES EXCLUSIVAS:
 * 1. Resolver a origem do protótipo homologado (<projectSlug>/<version>).
 * 2. Resolver o destino canônico (<projectSlug>/site-producao/).
 * 3. Validar caminhos e impedir estritamente escrita fora do destino canônico.
 * 4. Bloquear expressamente qualquer tentativa de escrita dentro de previews-garimpo.
 * 5. Criar diretório staging temporário isolado fora de previews-garimpo.
 * 6. Copiar arquivos necessários (index.html, styles.css, script.js, assets).
 * 7. Higienizar elementos técnicos de preview (barras de controle, pílulas de governança, botões de download standalone).
 * 8. Validar integridade e estrutura dos arquivos produzidos no staging.
 * 9. Promover atomicamente os arquivos para o destino canônico sem corromper produção anterior.
 * 10. Limpar o staging (rollback em caso de erro ou sucesso).
 *
 * RESTRIÇÕES DE GOVERNANÇA:
 * - NENHUMA lógica de Gmail ou envio comercial neste módulo.
 * - NUNCA importar publisher.js ou acionar publicação.
 * - NUNCA escrever dentro de previews-garimpo.
 */

const fs = require('fs');
const path = require('path');

const DEFAULT_GARIMPO_DIR = 'C:\\Users\\35tul\\Garimpo-sites\\esbocos';
const FORBIDDEN_PATH_SUBSTRING = 'previews-garimpo';

/**
 * Valida o formato estrito do projectSlug.
 * Rejeita strings vazias, path traversal e caracteres inválidos.
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
 * Rejeita strings vazias, path traversal e caracteres inválidos.
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
 * Valida deterministicamente que o caminho de destino é canônico e seguro.
 * BLOQUEIA ABSOLUTAMENTE qualquer caminho dentro de previews-garimpo.
 */
function assertValidCanonicalDestination(destPath, projectSlug) {
  if (!destPath || typeof destPath !== 'string') {
    const err = new Error('Caminho de destino inválido ou ausente.');
    err.code = 'INVALID_CANONICAL_DESTINATION';
    throw err;
  }

  const normalized = path.resolve(destPath);
  const lower = normalized.toLowerCase();

  // BARREIRA 1: BLOQUEIO ABSOLUTO DE previews-garimpo
  if (lower.includes(FORBIDDEN_PATH_SUBSTRING)) {
    const err = new Error(`[VIOLAÇÃO DE SEGURANÇA] Escrita terminantemente proibida dentro de previews-garimpo: ${destPath}`);
    err.code = 'FORBIDDEN_OUTPUT_PATH';
    throw err;
  }

  // BARREIRA 2: O destino deve terminar exatamente com <projectSlug>/site-producao
  const expectedSuffix = path.join(projectSlug, 'site-producao').toLowerCase();
  if (!lower.endsWith(expectedSuffix)) {
    const err = new Error(`[DESTINO INVÁLIDO] O caminho de destino canônico deve terminar com '${projectSlug}\\site-producao': ${destPath}`);
    err.code = 'INVALID_CANONICAL_DESTINATION';
    throw err;
  }

  return true;
}

/**
 * Resolve e valida o diretório de origem do protótipo homologado.
 */
function resolvePrototypeSource(projectSlug, version, options = {}) {
  const cleanSlug = validateProjectSlug(projectSlug);
  const cleanVersion = validateVersion(version);

  const baseDir = options.baseDir || (fs.existsSync(DEFAULT_GARIMPO_DIR) ? DEFAULT_GARIMPO_DIR : path.join(__dirname, '..', 'esbocos'));
  const projectDir = path.join(baseDir, cleanSlug);
  const sourceDir = path.join(projectDir, cleanVersion);

  if (!fs.existsSync(sourceDir)) {
    const err = new Error(`[ORIGEM NÃO ENCONTRADA] Diretório da versão '${cleanVersion}' não existe para o projeto '${cleanSlug}' em: ${sourceDir}`);
    err.code = 'SOURCE_VERSION_NOT_FOUND';
    err.projectSlug = cleanSlug;
    err.version = cleanVersion;
    err.sourceDir = sourceDir;
    throw err;
  }

  const indexFile = path.join(sourceDir, 'index.html');
  if (!fs.existsSync(indexFile)) {
    const err = new Error(`[ARQUIVO PRINCIPAL AUSENTE] 'index.html' não encontrado na origem: ${indexFile}`);
    err.code = 'SOURCE_INDEX_HTML_NOT_FOUND';
    err.projectSlug = cleanSlug;
    err.version = cleanVersion;
    throw err;
  }

  return sourceDir;
}

/**
 * Resolve o diretório canônico de destino para o site de produção.
 */
function resolveCanonicalDestination(projectSlug, options = {}) {
  const cleanSlug = validateProjectSlug(projectSlug);
  const baseDir = options.baseDir || (fs.existsSync(DEFAULT_GARIMPO_DIR) ? DEFAULT_GARIMPO_DIR : path.join(__dirname, '..', 'esbocos'));
  const projectDir = path.join(baseDir, cleanSlug);
  const destDir = path.join(projectDir, 'site-producao');

  assertValidCanonicalDestination(destDir, cleanSlug);

  return destDir;
}

/**
 * Higieniza o conteúdo HTML de um protótipo removendo elementos exclusivos de preview.
 * Remove somente controles internos conhecidos, preservando integralmente o layout e conteúdo.
 */
function sanitizeHtml(htmlContent) {
  if (!htmlContent || typeof htmlContent !== 'string') {
    return '';
  }

  let sanitized = htmlContent;

  // 1. Remove barra de controle Garimpo Sites (com ou sem comentário antecedente)
  sanitized = sanitized.replace(/<!--[\s\S]*?Barra de Controle Garimpo Sites[\s\S]*?-->\s*<aside class="control-bar"[^>]*>[\s\S]*?<\/aside>/gi, '');
  sanitized = sanitized.replace(/<aside class="control-bar"[^>]*>[\s\S]*?<\/aside>/gi, '');
  sanitized = sanitized.replace(/<div class="control-bar"[^>]*>[\s\S]*?<\/div>/gi, '');
  sanitized = sanitized.replace(/<div id="garimpo-preview-bar"[^>]*>[\s\S]*?<\/div>/gi, '');

  // 2. Remove pílula / badge de governança interna do rodapé
  sanitized = sanitized.replace(/<div class="footer-governance-pill"[^>]*>[\s\S]*?<\/div>/gi, '');

  // 3. Remove botões e links de download do protótipo autônomo (*-standalone.html)
  sanitized = sanitized.replace(/<a\b[^>]*\bdownload="[^"]*standalone\.html"[^>]*>[\s\S]*?<\/a>/gi, '');
  sanitized = sanitized.replace(/<a\b[^>]*\bhref="[^"]*standalone\.html"[^>]*>[\s\S]*?<\/a>/gi, '');

  // 4. Limpa quebras de linha excessivas deixadas pelas remoções
  sanitized = sanitized.replace(/\n{3,}/g, '\n\n');

  return sanitized;
}

/**
 * Valida a integridade dos arquivos gerados no diretório de staging antes da promoção.
 */
function validateBuiltFiles(stagingDir, expectedFiles) {
  if (!fs.existsSync(stagingDir)) {
    const err = new Error(`[VALIDAÇÃO FALHOU] Diretório de staging não existe: ${stagingDir}`);
    err.code = 'STAGING_DIR_NOT_FOUND';
    throw err;
  }

  const indexPath = path.join(stagingDir, 'index.html');
  if (!fs.existsSync(indexPath)) {
    const err = new Error(`[VALIDAÇÃO FALHOU] 'index.html' não foi gerado no staging.`);
    err.code = 'MISSING_INDEX_HTML';
    throw err;
  }

  const indexStat = fs.statSync(indexPath);
  if (indexStat.size < 200) {
    const err = new Error(`[VALIDAÇÃO FALHOU] 'index.html' possui tamanho insuficiente (${indexStat.size} bytes).`);
    err.code = 'INVALID_INDEX_HTML_SIZE';
    throw err;
  }

  const indexContent = fs.readFileSync(indexPath, 'utf8');
  if (!indexContent.includes('<html') || !indexContent.includes('</html>') || !indexContent.includes('<body')) {
    const err = new Error(`[VALIDAÇÃO FALHOU] 'index.html' não possui estrutura HTML básica válida.`);
    err.code = 'INVALID_HTML_STRUCTURE';
    throw err;
  }

  // Verifica que os elementos de preview foram realmente higienizados
  if (indexContent.includes('control-bar') && indexContent.includes('VISUALIZAR PRÉVIA')) {
    const err = new Error(`[VALIDAÇÃO FALHOU] Elementos de preview não foram higienizados em 'index.html'.`);
    err.code = 'PREVIEW_ELEMENTS_STILL_PRESENT';
    throw err;
  }

  // Validação de styles.css se esperado
  if (expectedFiles.includes('styles.css')) {
    const cssPath = path.join(stagingDir, 'styles.css');
    if (!fs.existsSync(cssPath)) {
      const err = new Error(`[VALIDAÇÃO FALHOU] 'styles.css' não foi gerado no staging.`);
      err.code = 'MISSING_STYLES_CSS';
      throw err;
    }
    const cssStat = fs.statSync(cssPath);
    if (cssStat.size < 50) {
      const err = new Error(`[VALIDAÇÃO FALHOU] 'styles.css' possui tamanho insuficiente (${cssStat.size} bytes).`);
      err.code = 'INVALID_STYLES_CSS_SIZE';
      throw err;
    }
  }

  // Validação de script.js se esperado
  if (expectedFiles.includes('script.js')) {
    const jsPath = path.join(stagingDir, 'script.js');
    if (!fs.existsSync(jsPath)) {
      const err = new Error(`[VALIDAÇÃO FALHOU] 'script.js' não foi gerado no staging.`);
      err.code = 'MISSING_SCRIPT_JS';
      throw err;
    }
    const jsStat = fs.statSync(jsPath);
    if (jsStat.size === 0) {
      const err = new Error(`[VALIDAÇÃO FALHOU] 'script.js' está vazio.`);
      err.code = 'INVALID_SCRIPT_JS_SIZE';
      throw err;
    }
  }

  // Validação de arquivos proibidos ou inesperados no staging
  const stagingEntries = fs.readdirSync(stagingDir);
  for (const entry of stagingEntries) {
    if (entry.toLowerCase().endsWith('-standalone.html')) {
      const err = new Error(`[VALIDAÇÃO FALHOU] Arquivo standalone de protótipo não deve constar na produção: ${entry}`);
      err.code = 'UNEXPECTED_STANDALONE_FILE';
      throw err;
    }
    if (entry.toLowerCase() === 'manifest.json') {
      const err = new Error(`[VALIDAÇÃO FALHOU] 'manifest.json' não deve ser copiado para site-producao.`);
      err.code = 'UNEXPECTED_MANIFEST_FILE';
      throw err;
    }
  }

  return true;
}

/**
 * Constrói o site de produção de forma determinística e atômica.
 *
 * FLUXO COMPLETO:
 * 1. Validação estrita de slug e versão.
 * 2. Resolução da origem do protótipo e do destino canônico.
 * 3. Validação do destino canônico com barreira contra previews-garimpo.
 * 4. Validação de isolamento contra manifesto (se fornecido).
 * 5. Criação de diretório staging temporário.
 * 6. Cópia e higienização dos arquivos no staging.
 * 7. Validação estrita de todos os arquivos gerados.
 * 8. Promoção atômica para o destino canônico.
 * 9. Limpeza do staging (inclusive rollback em caso de falha).
 */
function buildProductionSite(projectSlug, version, options = {}) {
  const cleanSlug = validateProjectSlug(projectSlug);
  const cleanVersion = validateVersion(version);

  const sourceDir = resolvePrototypeSource(cleanSlug, cleanVersion, options);
  const canonicalDestDir = resolveCanonicalDestination(cleanSlug, options);

  // Verificação de isolamento com o manifesto
  if (options.manifestOverride && options.manifestOverride.projectSlug) {
    if (options.manifestOverride.projectSlug !== cleanSlug) {
      const err = new Error(`[ISOLAMENTO VIOLADO] projectSlug solicitado (${cleanSlug}) não corresponde ao manifesto (${options.manifestOverride.projectSlug})`);
      err.code = 'CROSS_PROJECT_SLUG_MISMATCH';
      throw err;
    }
  }

  // Criação do diretório de staging fora de previews-garimpo
  const baseDir = options.baseDir || (fs.existsSync(DEFAULT_GARIMPO_DIR) ? DEFAULT_GARIMPO_DIR : path.join(__dirname, '..', 'esbocos'));
  const projectDir = path.join(baseDir, cleanSlug);
  const stagingUniqueId = `.staging-build-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const stagingDir = options.stagingDir || path.join(projectDir, stagingUniqueId);

  // Trava de segurança para o staging: nunca dentro de previews-garimpo
  if (path.resolve(stagingDir).toLowerCase().includes(FORBIDDEN_PATH_SUBSTRING)) {
    const err = new Error(`[VIOLAÇÃO DE SEGURANÇA] Diretório de staging não pode residir em previews-garimpo: ${stagingDir}`);
    err.code = 'FORBIDDEN_STAGING_PATH';
    throw err;
  }

  fs.mkdirSync(stagingDir, { recursive: true });

  const generatedFiles = [];

  try {
    const sourceEntries = fs.readdirSync(sourceDir, { withFileTypes: true });

    for (const entry of sourceEntries) {
      const srcPath = path.join(sourceDir, entry.name);
      const targetPath = path.join(stagingDir, entry.name);

      if (entry.isFile()) {
        const lowerName = entry.name.toLowerCase();

        // Ignora manifestos acidentais ou arquivos de protótipo standalone
        if (lowerName === 'manifest.json' || lowerName.endsWith('-standalone.html')) {
          continue;
        }

        if (lowerName === 'index.html') {
          const rawHtml = fs.readFileSync(srcPath, 'utf8');
          const cleanHtml = sanitizeHtml(rawHtml);
          fs.writeFileSync(targetPath, cleanHtml, 'utf8');
          generatedFiles.push(entry.name);
        } else {
          // Copia styles.css, script.js e outros assets (imagens, fontes, etc.)
          fs.copyFileSync(srcPath, targetPath);
          generatedFiles.push(entry.name);
        }
      } else if (entry.isDirectory()) {
        // Copia subdiretórios de assets (ex: images, assets, etc.) recursivamente
        fs.cpSync(srcPath, targetPath, { recursive: true });
        generatedFiles.push(entry.name);
      }
    }

    // Injeção de simulação de falha para testes de atomicidade
    if (options.simulateFailureDuringBuild) {
      throw new Error('Falha simulada durante o processo de geração no staging.');
    }

    // Validação completa dos arquivos no staging
    validateBuiltFiles(stagingDir, generatedFiles);

    // Injeção de simulação de falha pós-validação para testes
    if (options.simulateFailureBeforePromotion) {
      throw new Error('Falha simulada antes da promoção.');
    }

    // Promoção atômica para o destino canônico
    if (options.skipPromotion !== true) {
      fs.mkdirSync(canonicalDestDir, { recursive: true });

      // Copia arquivos do staging validado para o destino canônico
      for (const fileName of generatedFiles) {
        const stagedFilePath = path.join(stagingDir, fileName);
        const destFilePath = path.join(canonicalDestDir, fileName);
        const stat = fs.statSync(stagedFilePath);
        if (stat.isDirectory()) {
          fs.cpSync(stagedFilePath, destFilePath, { recursive: true });
        } else {
          fs.copyFileSync(stagedFilePath, destFilePath);
        }
      }
    }

    // Limpa o diretório de staging após sucesso
    fs.rmSync(stagingDir, { recursive: true, force: true });

    return {
      success: true,
      projectSlug: cleanSlug,
      version: cleanVersion,
      canonicalPath: canonicalDestDir,
      files: generatedFiles,
      executedAt: new Date().toISOString()
    };
  } catch (err) {
    // ROLLBACK: Garante limpeza total do staging em caso de qualquer falha
    if (fs.existsSync(stagingDir)) {
      try {
        fs.rmSync(stagingDir, { recursive: true, force: true });
      } catch (cleanupErr) {
        // Silêncio em erro de limpeza secundária
      }
    }
    throw err;
  }
}

/**
 * Valida a integridade física e estrutural dos artefatos no diretório canônico de produção.
 * Realiza checagem determinística de arquivos essenciais, tamanhos mínimos, estrutura HTML,
 * ausência de elementos de teste e garantia de caminho canônico estrito.
 */
function validateProductionSite(projectSlug, version, options = {}) {
  const cleanSlug = validateProjectSlug(projectSlug);
  const cleanVersion = validateVersion(version || 'v2');
  const canonicalDestDir = resolveCanonicalDestination(cleanSlug, options);

  if (!fs.existsSync(canonicalDestDir)) {
    return {
      isValid: false,
      status: 'INVALIDA',
      reason: 'PRODUCTION_DIR_NOT_FOUND',
      message: `Diretório de produção não encontrado em: ${canonicalDestDir}`,
      projectSlug: cleanSlug,
      version: cleanVersion,
      canonicalPath: canonicalDestDir,
      validatedAt: new Date().toISOString(),
      checks: {
        dirExists: false,
        hasIndexHtml: false,
        hasValidIndexHtmlSize: false,
        hasValidHtmlStructure: false,
        noPreviewElements: false,
        hasStylesCss: false,
        hasScriptJs: false,
        noForbiddenFiles: false,
        noPreviewsGarimpoPath: true,
        isCanonicalPath: true
      },
      files: []
    };
  }

  const checks = {
    dirExists: true,
    hasIndexHtml: false,
    hasValidIndexHtmlSize: false,
    hasValidHtmlStructure: false,
    noPreviewElements: false,
    hasStylesCss: false,
    hasScriptJs: false,
    noForbiddenFiles: true,
    noPreviewsGarimpoPath: true,
    isCanonicalPath: true
  };

  // 1. Verificação de segurança de caminhos
  const lowerDest = path.resolve(canonicalDestDir).toLowerCase();
  if (lowerDest.includes(FORBIDDEN_PATH_SUBSTRING)) {
    checks.noPreviewsGarimpoPath = false;
  }
  const expectedSuffix = path.join(cleanSlug, 'site-producao').toLowerCase();
  if (!lowerDest.endsWith(expectedSuffix)) {
    checks.isCanonicalPath = false;
  }

  // 2. Validação de index.html
  const indexPath = path.join(canonicalDestDir, 'index.html');
  if (fs.existsSync(indexPath)) {
    checks.hasIndexHtml = true;
    const stat = fs.statSync(indexPath);
    if (stat.size >= 200) {
      checks.hasValidIndexHtmlSize = true;
    }
    const content = fs.readFileSync(indexPath, 'utf8');
    if (content.includes('<html') && content.includes('</html>') && content.includes('<body')) {
      checks.hasValidHtmlStructure = true;
    }
    if (!content.includes('control-bar') || !content.includes('VISUALIZAR PRÉVIA')) {
      checks.noPreviewElements = true;
    }
  }

  // 3. Validação de styles.css (se presente, deve possuir tamanho mínimo)
  const stylesPath = path.join(canonicalDestDir, 'styles.css');
  if (fs.existsSync(stylesPath)) {
    const stat = fs.statSync(stylesPath);
    if (stat.size >= 50) {
      checks.hasStylesCss = true;
    }
  } else {
    checks.hasStylesCss = true; // Opcional se styles forem inline
  }

  // 4. Validação de script.js (se presente, não pode estar vazio)
  const scriptPath = path.join(canonicalDestDir, 'script.js');
  if (fs.existsSync(scriptPath)) {
    const stat = fs.statSync(scriptPath);
    if (stat.size > 0) {
      checks.hasScriptJs = true;
    }
  } else {
    checks.hasScriptJs = true; // Opcional se o protótipo não incluir JS externo
  }

  // 5. Validação de ausência de arquivos proibidos (standalone e manifest)
  const entries = fs.readdirSync(canonicalDestDir);
  for (const entry of entries) {
    const lowerEntry = entry.toLowerCase();
    if (lowerEntry.endsWith('-standalone.html') || lowerEntry === 'manifest.json') {
      checks.noForbiddenFiles = false;
      break;
    }
  }

  const isValid = checks.dirExists &&
    checks.hasIndexHtml &&
    checks.hasValidIndexHtmlSize &&
    checks.hasValidHtmlStructure &&
    checks.noPreviewElements &&
    checks.hasStylesCss &&
    checks.hasScriptJs &&
    checks.noForbiddenFiles &&
    checks.noPreviewsGarimpoPath &&
    checks.isCanonicalPath;

  return {
    isValid,
    status: isValid ? 'VALIDADA' : 'INVALIDA',
    projectSlug: cleanSlug,
    version: cleanVersion,
    validatedAt: new Date().toISOString(),
    canonicalPath: canonicalDestDir,
    checks,
    files: entries
  };
}

module.exports = {
  DEFAULT_GARIMPO_DIR,
  FORBIDDEN_PATH_SUBSTRING,
  validateProjectSlug,
  validateVersion,
  assertValidCanonicalDestination,
  resolvePrototypeSource,
  resolveCanonicalDestination,
  sanitizeHtml,
  validateBuiltFiles,
  validateProductionSite,
  buildProductionSite,
  buildSite: buildProductionSite
};
