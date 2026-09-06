/**
 * CREATIVE GOVERNANCE & ANTI-TEMPLATE ENGINE (FASE 6)
 * Garimpo Sites - Sistema de Direção Criativa Contextual e Diferenciação Visual
 *
 * RESPONSABILIDADES:
 * 1. Analisar profundamente o contexto de marca e negócio do cliente antes do design.
 * 2. Gerar uma Direção Criativa Contextual única e customizada (conceito, paleta, tipografia, composição).
 * 3. Aplicar o Teste de Identidade da Marca ("removendo nome e logo, a essência do negócio permanece?").
 * 4. Extrair assinaturas estruturais do DOM (sequência de seções, arquétipo de hero, padrões de layout).
 * 5. Comparar assinaturas entre projetos para detectar e bloquear a reutilização de design como fórmula (Anti-Template).
 * 6. Preservar a separação estrita: Código Reutilizável (permitido) vs. Design Reutilizado (proibido).
 */

const crypto = require('crypto');

// Arquétipos Criativos Reconhecidos
const CREATIVE_ARCHETYPES = [
  'LUXURY_EDITORIAL',
  'MINIMAL_EDITORIAL',
  'SOBER_INSTITUTIONAL',
  'BOLD_TECH',
  'WARM_ARTISANAL',
  'COMMERCIAL_DYNAMIC',
  'EXPERIMENTAL_ASYMMETRIC'
];

// Arquétipos de Hero Suportados
const HERO_ARCHETYPES = [
  'HERO_SPLIT_EDITORIAL',
  'HERO_TYPOGRAPHIC_MINIMAL',
  'HERO_PHOTO_HEROIC',
  'HERO_ASYMMETRIC_STORY',
  'HERO_PRODUCT_SHOWCASE',
  'HERO_NEWS_MASTHEAD'
];

/**
 * Analisa o contexto de marca e negócio do cliente.
 */
function analyzeBrandContext(input = {}) {
  if (!input || typeof input !== 'object') {
    throw new Error('Entrada inválida para análise de contexto de marca.');
  }

  const companyName = input.companyName || input.projectName || 'Empresa Sem Nome';
  const sector = (input.sector || 'generic').toLowerCase();
  const audience = input.audience || 'Público Geral';
  const valueProposition = input.valueProposition || 'Serviços especializados';
  const communicationTone = input.communicationTone || 'Profissional e transparente';

  // Determinação de arquétipo contextual conforme o nicho do negócio
  let suggestedArchetype = 'COMMERCIAL_DYNAMIC';
  if (sector.includes('marcenaria') || sector.includes('artesanal') || sector.includes('gastronomia') || sector.includes('café')) {
    suggestedArchetype = 'WARM_ARTISANAL';
  } else if (sector.includes('moda') || sector.includes('luxo') || sector.includes('fashion') || sector.includes('joalheria')) {
    suggestedArchetype = 'LUXURY_EDITORIAL';
  } else if (sector.includes('advocacia') || sector.includes('jurídico') || sector.includes('contabilidade') || sector.includes('finanças')) {
    suggestedArchetype = 'SOBER_INSTITUTIONAL';
  } else if (sector.includes('software') || sector.includes('saas') || sector.includes('tech') || sector.includes('ia')) {
    suggestedArchetype = 'BOLD_TECH';
  } else if (sector.includes('arte') || sector.includes('design') || sector.includes('arquitetura')) {
    suggestedArchetype = 'MINIMAL_EDITORIAL';
  }

  return {
    companyName,
    sector,
    audience,
    valueProposition,
    communicationTone,
    suggestedArchetype,
    existingVisualAssets: {
      hasLogo: Boolean(input.hasLogo || input.logoUrl),
      brandColors: Array.isArray(input.brandColors) ? input.brandColors : [],
      typographyPreference: input.typographyPreference || null,
      photographyStyle: input.photographyStyle || 'Fotografia editorial contextualizada'
    },
    analyzedAt: new Date().toISOString()
  };
}

/**
 * Gera a Direção Criativa Contextual antes de qualquer código HTML/CSS.
 */
function generateCreativeDirection(brandContext = {}) {
  const context = brandContext.suggestedArchetype ? brandContext : analyzeBrandContext(brandContext);
  const archetype = brandContext.archetypeOverride || context.suggestedArchetype || 'COMMERCIAL_DYNAMIC';

  let palette = {};
  let typography = {};
  let heroArchetype = 'HERO_SPLIT_EDITORIAL';
  let sectionSequence = [];
  let spatialRhythm = {};

  switch (archetype) {
    case 'LUXURY_EDITORIAL':
      palette = {
        primary: '#0B0B0C',
        surface: '#141416',
        accent: '#D4AF37', // Ouro Champagne
        textPrimary: '#F6F5F2',
        textSecondary: '#A09FA6',
        contrastRatio: '21:1'
      };
      typography = {
        headlineFont: 'Cinzel, Cormorant Garamond, serif',
        bodyFont: 'Inter, sans-serif',
        scaleRatio: '1.414 (Augmented Fourth)',
        letterSpacingHeadlines: '0.08em'
      };
      heroArchetype = 'HERO_SPLIT_EDITORIAL';
      sectionSequence = ['fashion_ticker', 'masthead_header', 'hero_editorial', 'case_study_curated', 'acts_workflow', 'atelier_roles', 'vip_atelier_form', 'editorial_footer'];
      spatialRhythm = { density: 'generous', cornerRadius: '2px', shadowStyle: 'subtle_gold_glow' };
      break;

    case 'SOBER_INSTITUTIONAL':
      palette = {
        primary: '#0F1E36', // Azul Marinho Profundo
        surface: '#F8FAFC',
        accent: '#99733E', // Bronze Nobre
        textPrimary: '#0A101D',
        textSecondary: '#475569',
        contrastRatio: '18:1'
      };
      typography = {
        headlineFont: 'Playfair Display, Merriweather, serif',
        bodyFont: 'Source Sans 3, sans-serif',
        scaleRatio: '1.250 (Major Third)',
        letterSpacingHeadlines: '0.02em'
      };
      heroArchetype = 'HERO_TYPOGRAPHIC_MINIMAL';
      sectionSequence = ['institutional_header', 'hero_authority', 'areas_of_practice', 'credentials_stats', 'partners_dossier', 'consultation_form', 'institutional_footer'];
      spatialRhythm = { density: 'balanced', cornerRadius: '4px', shadowStyle: 'discrete_slate_shadow' };
      break;

    case 'BOLD_TECH':
      palette = {
        primary: '#030712', // Obsidian
        surface: '#111827',
        accent: '#06B6D4', // Ciano Neon
        textPrimary: '#F9FAFB',
        textSecondary: '#9CA3AF',
        contrastRatio: '19.5:1'
      };
      typography = {
        headlineFont: 'Space Grotesk, Plus Jakarta Sans, sans-serif',
        bodyFont: 'Inter, sans-serif',
        scaleRatio: '1.333 (Perfect Fourth)',
        letterSpacingHeadlines: '-0.02em'
      };
      heroArchetype = 'HERO_PRODUCT_SHOWCASE';
      sectionSequence = ['tech_nav', 'hero_terminal', 'metrics_strip', 'interactive_features', 'architecture_diagram', 'developer_api_demo', 'terminal_footer'];
      spatialRhythm = { density: 'compact', cornerRadius: '8px', shadowStyle: 'neon_halo' };
      break;

    case 'WARM_ARTISANAL':
      palette = {
        primary: '#292524', // Warm Charcoal
        surface: '#F5F5F0', // Papel Artesanal
        accent: '#B45309', // Terracota Quente
        textPrimary: '#1C1917',
        textSecondary: '#57534E',
        contrastRatio: '15:1'
      };
      typography = {
        headlineFont: 'Fraunces, serif',
        bodyFont: 'Lora, serif',
        scaleRatio: '1.200 (Minor Third)',
        letterSpacingHeadlines: '0.01em'
      };
      heroArchetype = 'HERO_PHOTO_HEROIC';
      sectionSequence = ['artisan_header', 'hero_workshop', 'materials_provenance', 'process_craftsmanship', 'curated_catalog', 'story_inquiry', 'artisan_footer'];
      spatialRhythm = { density: 'relaxed', cornerRadius: '12px', shadowStyle: 'soft_organic' };
      break;

    case 'MINIMAL_EDITORIAL':
    default:
      palette = {
        primary: '#121212',
        surface: '#FFFFFF',
        accent: '#E11D48',
        textPrimary: '#18181B',
        textSecondary: '#71717A',
        contrastRatio: '16:1'
      };
      typography = {
        headlineFont: 'Syne, sans-serif',
        bodyFont: 'DM Sans, sans-serif',
        scaleRatio: '1.250 (Major Third)',
        letterSpacingHeadlines: '-0.01em'
      };
      heroArchetype = 'HERO_ASYMMETRIC_STORY';
      sectionSequence = ['minimal_nav', 'hero_asymmetric', 'curated_index', 'exhibition_gallery', 'manifesto_editorial', 'contact_direct', 'minimal_footer'];
      spatialRhythm = { density: 'asymmetric', cornerRadius: '0px', shadowStyle: 'none' };
      break;
  }

  return {
    conceptName: `${context.companyName} — Direção Criativa (${archetype})`,
    archetype,
    brandName: context.companyName,
    sector: context.sector,
    visualAtmosphere: `Estética contextualizada para ${context.sector} com foco em ${context.valueProposition}.`,
    palette,
    typography,
    heroArchetype,
    sectionSequence,
    spatialRhythm,
    governance: {
      codeReuseAllowed: true,
      designFormulaForbidden: true,
      directionGeneratedAt: new Date().toISOString()
    }
  };
}

/**
 * Validação Conceitual: O Teste de Identidade da Marca
 * "Se eu remover o nome e o logotipo do cliente, ainda consigo perceber qual é o tipo de negócio e qual é a personalidade da marca?"
 */
function evaluateIdentityTest(creativeDirection = {}) {
  if (!creativeDirection || !creativeDirection.archetype) {
    return {
      passed: false,
      score: 0,
      verdict: 'INSUFFICIENTLY_CONTEXTUALIZED',
      reason: 'Direção criativa ausente ou incompleta.'
    };
  }

  let score = 50;
  const reasons = [];

  // Avaliação de especificidade do setor
  if (creativeDirection.sector && creativeDirection.sector !== 'generic') {
    score += 20;
    reasons.push(`Setor específico e contextualizado: '${creativeDirection.sector}'`);
  } else {
    reasons.push('Setor genérico ou não especificado.');
  }

  // Avaliação da singularidade da paleta
  if (creativeDirection.palette && creativeDirection.palette.accent) {
    score += 15;
    reasons.push(`Paleta customizada com tom de acento '${creativeDirection.palette.accent}'`);
  }

  // Avaliação da hierarquia e tipografia
  if (creativeDirection.typography && creativeDirection.typography.headlineFont) {
    score += 15;
    reasons.push(`Tipografia com personalidade alinhada ao arquétipo '${creativeDirection.archetype}'`);
  }

  const passed = score >= 75;
  return {
    passed,
    score,
    verdict: passed ? 'DISTINCTIVE_AND_CONTEXTUAL' : 'INSUFFICIENTLY_CONTEXTUALIZED',
    summary: passed
      ? 'Aprovado no Teste de Identidade: A estética e a hierarquia comunicam a personalidade e nicho da marca sem depender exclusivamente de nome ou logotipo.'
      : 'Reprovado no Teste de Identidade: O design é excessivamente genérico e depende apenas de texto/logotipo para identificar o negócio.',
    details: reasons
  };
}

/**
 * Extrai a assinatura estrutural do DOM a partir do HTML.
 */
function extractLayoutSignature(htmlContent = '') {
  if (!htmlContent || typeof htmlContent !== 'string') {
    return {
      semanticStructure: [],
      sectionSequence: [],
      heroType: 'UNKNOWN',
      componentSignatures: [],
      signatureHash: 'empty'
    };
  }

  // Extração de tags semânticas e seus IDs ou classes principais
  const sectionSequence = [];
  const tagRegex = /<(header|section|article|aside|footer|nav|form)\b([^>]*)>/gi;
  let match;
  while ((match = tagRegex.exec(htmlContent)) !== null) {
    const tag = match[1].toLowerCase();
    const attrs = match[2];
    const idMatch = attrs.match(/id=["']([^"']+)["']/i);
    const classMatch = attrs.match(/class=["']([^"']+)["']/i);
    const identifier = idMatch ? `#${idMatch[1]}` : (classMatch ? `.${classMatch[1].split(/\s+/)[0]}` : tag);
    sectionSequence.push(`${tag}:${identifier}`);
  }

  // Detecção de Arquétipo de Hero
  let heroType = 'HERO_GENERIC';
  const lowerHtml = htmlContent.toLowerCase();
  if (lowerHtml.includes('fashion-ticker') || lowerHtml.includes('brand-subtitle') && lowerHtml.includes('comp card')) {
    heroType = 'HERO_SPLIT_EDITORIAL';
  } else if (lowerHtml.includes('terminal') || lowerHtml.includes('api-key') || lowerHtml.includes('metrics-strip')) {
    heroType = 'HERO_PRODUCT_SHOWCASE';
  } else if (lowerHtml.includes('authority') || lowerHtml.includes('areas-of-practice')) {
    heroType = 'HERO_TYPOGRAPHIC_MINIMAL';
  } else if (lowerHtml.includes('asymmetric') || lowerHtml.includes('gallery-feed')) {
    heroType = 'HERO_ASYMMETRIC_STORY';
  }

  // Assinatura determinística de componentes funcionais
  const componentSignatures = [];
  if (lowerHtml.includes('form id=')) componentSignatures.push('FORM_CONTAINER');
  if (lowerHtml.includes('modal') || lowerHtml.includes('dialog')) componentSignatures.push('MODAL_DIALOG');
  if (lowerHtml.includes('drawer') || lowerHtml.includes('mobile-toggle')) componentSignatures.push('MOBILE_DRAWER');
  if (lowerHtml.includes('table') || lowerHtml.includes('comparativo')) componentSignatures.push('COMPARISON_GRID');

  const signatureString = `${heroType}|${sectionSequence.join('->')}|${componentSignatures.join(',')}`;
  const signatureHash = crypto.createHash('sha256').update(signatureString).digest('hex');

  return {
    semanticStructure: sectionSequence,
    sectionSequence,
    sectionCount: sectionSequence.length,
    heroType,
    componentSignatures,
    signatureHash
  };
}

/**
 * Compara duas assinaturas estruturais para detectar excesso de similaridade visual (Anti-Template).
 */
function compareLayoutSignatures(sigA, sigB, options = {}) {
  const threshold = options.threshold || 0.85;

  if (!sigA || !sigB || !sigA.sectionSequence || !sigB.sectionSequence) {
    return {
      similarityScore: 0,
      isTemplateClone: false,
      reasons: ['Assinaturas insuficientes para comparação.'],
      verdict: 'AUTHENTIC_INDIVIDUAL_DESIGN'
    };
  }

  const seqA = sigA.sectionSequence;
  const seqB = sigB.sectionSequence;

  // Comparação de sequência de seções (Jaccard estrutural)
  const setA = new Set(seqA);
  const setB = new Set(seqB);
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  const union = new Set([...setA, ...setB]).size;
  const sequenceSimilarity = union > 0 ? intersection / union : 0;

  // Comparação do arquétipo de hero
  const sameHero = sigA.heroType !== 'UNKNOWN' && sigA.heroType === sigB.heroType;

  // Comparação de contagem de seções
  const lengthRatio = Math.min(seqA.length, seqB.length) / Math.max(seqA.length, seqB.length || 1);

  // Score ponderado de similaridade
  let similarityScore = (sequenceSimilarity * 0.6) + ((sameHero ? 1 : 0) * 0.3) + (lengthRatio * 0.1);
  similarityScore = Math.round(similarityScore * 100) / 100;

  const isTemplateClone = similarityScore >= threshold;
  const reasons = [];

  if (sameHero) {
    reasons.push(`Mesmo arquétipo de Hero detectado: '${sigA.heroType}'`);
  }
  if (sequenceSimilarity > 0.7) {
    reasons.push(`Sequência de seções altamente correlacionada (${Math.round(sequenceSimilarity * 100)}% de sobreposição)`);
  }
  if (isTemplateClone) {
    reasons.push(`Similaridade estrutural global de ${Math.round(similarityScore * 100)}% excede o limite permitido (${Math.round(threshold * 100)}%)`);
  }

  return {
    similarityScore,
    isTemplateClone,
    threshold,
    sameHero,
    sequenceSimilarity,
    reasons,
    verdict: isTemplateClone ? 'EXCESSIVE_VISUAL_HOMOGENEITY' : 'AUTHENTIC_INDIVIDUAL_DESIGN'
  };
}

/**
 * Assegura que um novo design não é um clone de template de outro projeto existente.
 */
function assertNotTemplateClone(sigA, sigB, options = {}) {
  const comp = compareLayoutSignatures(sigA, sigB, options);
  if (comp.isTemplateClone) {
    const err = new Error(`[VIOLAÇÃO ANTI-TEMPLATE] O design gerado é excessivamente similar a outro projeto (${Math.round(comp.similarityScore * 100)}% de similaridade estrutural). É obrigatório criar layout contextualizado.`);
    err.code = 'EXCESSIVE_VISUAL_HOMOGENEITY';
    err.details = comp;
    throw err;
  }
  return comp;
}

module.exports = {
  CREATIVE_ARCHETYPES,
  HERO_ARCHETYPES,
  analyzeBrandContext,
  generateCreativeDirection,
  evaluateIdentityTest,
  extractLayoutSignature,
  compareLayoutSignatures,
  assertNotTemplateClone
};
