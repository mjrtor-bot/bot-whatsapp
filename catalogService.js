/**
 * catalogService.js
 *
 * Motor de busca local e inteligente do catálogo de produtos e variações de estoque.
 * Extrai intenções, tamanhos, cores e termos da mensagem do cliente para fornecer
 * fatos precisos e verificados ao prompt da Sofia, sem enviar o banco inteiro à OpenAI.
 *
 * Suporta intervalos de numeração (ex: "38 ao 42", "38-42", "P ao GG") e múltiplos tamanhos.
 */

const { getAllProducts, getDatabase } = require('./db');

/**
 * Ordem padrão de tamanhos de vestuário
 */
const CLOTHING_SIZE_ORDER = ['PP', 'P', 'M', 'G', 'GG', 'XG', 'XGG', 'XXG', 'G1', 'G2', 'G3'];

/**
 * Normaliza o texto removendo acentos e convertendo para minúsculas.
 * @param {string} text
 * @returns {string}
 */
function normalizeQuery(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

/**
 * Extrai menções a tamanhos (calçados ou vestuário) do texto.
 * @param {string} text
 * @returns {string[]} Lista de tamanhos identificados
 */
function extractSizes(text) {
  const norm = normalizeQuery(text);
  const foundSizes = new Set();

  // Calçados / Números (33 a 50)
  const numberMatches = norm.match(/\b(3[3-9]|4[0-9]|5[0-0])\b/g);
  if (numberMatches) {
    numberMatches.forEach(n => foundSizes.add(n));
  }

  // Vestuário (PP, P, M, G, GG, XG, XXG, etc.)
  const clothingMatches = norm.match(/\b(pp|p|m|g|gg|xg|xgg|xxg|g1|g2|g3)\b/g);
  if (clothingMatches) {
    clothingMatches.forEach(c => foundSizes.add(c.toUpperCase()));
  }

  return Array.from(foundSizes);
}

/**
 * Extrai menções a cores do texto.
 * @param {string} text
 * @returns {string[]}
 */
function extractColors(text) {
  const norm = normalizeQuery(text);
  const colorKeywords = [
    'preto', 'preta', 'verde', 'oliva', 'coyote', 'camuflado', 'camuflada',
    'tan', 'deserto', 'multicam', 'marrom', 'azul', 'branco', 'cinza'
  ];
  const found = [];
  for (const c of colorKeywords) {
    if (new RegExp(`\\b${c}\\b`, 'i').test(norm)) {
      found.push(c);
    }
  }
  return found;
}

/**
 * Analisa uma string de tamanho de variação cadastrada e extrai todos os tamanhos contemplados.
 * Suporta tamanhos exatos, intervalos numéricos ("38 ao 42", "38-42", "38 a 42", "38 até 42", "38/42"),
 * intervalos de vestuário ("P ao GG", "P a GG") e listas ("38, 39, 40", "P, M, G").
 *
 * @param {string} sizeStr - String de tamanho cadastrada na variação
 * @returns {{
 *   raw: string,
 *   isRange: boolean,
 *   sizes: string[],
 *   type: 'numeric_range' | 'numeric_list' | 'numeric_exact' | 'clothing_range' | 'clothing_list' | 'clothing_exact' | 'text',
 *   min?: number | string,
 *   max?: number | string,
 *   includes: (targetSize: string) => boolean
 * }}
 */
function parseVariationSizes(sizeStr) {
  if (!sizeStr || typeof sizeStr !== 'string') {
    return {
      raw: '',
      isRange: false,
      sizes: [],
      type: 'text',
      includes: () => false
    };
  }

  const raw = sizeStr.trim();
  const norm = normalizeQuery(raw);

  // 1. Intervalo Numérico: ex: "38 ao 42", "38 a 42", "38 ate 42", "38 até 42", "38-42", "38 - 42", "tam 38 ao 42", "38/42"
  const numRangeMatch = norm.match(/\b(3[0-9]|4[0-9]|5[0-9]|[0-9]{2})\s*(?:ao|a|ate|\-|à|\/)\s*(3[0-9]|4[0-9]|5[0-9]|[0-9]{2})\b/);
  if (numRangeMatch) {
    const start = parseInt(numRangeMatch[1], 10);
    const end = parseInt(numRangeMatch[2], 10);
    if (!isNaN(start) && !isNaN(end) && start <= end) {
      const generatedSizes = [];
      for (let i = start; i <= end; i++) {
        generatedSizes.push(String(i));
      }
      return {
        raw,
        isRange: true,
        sizes: generatedSizes,
        type: 'numeric_range',
        min: start,
        max: end,
        includes: (target) => {
          const targetNum = parseInt(target, 10);
          if (!isNaN(targetNum)) {
            return targetNum >= start && targetNum <= end;
          }
          return generatedSizes.includes(normalizeQuery(target));
        }
      };
    }
  }

  // 2. Intervalo de Vestuário: ex: "p ao gg", "p a gg", "p - gg", "pp ao g"
  const clothRangeMatch = norm.match(/\b(pp|p|m|g|gg|xg|xgg|xxg|g1|g2|g3)\s*(?:ao|a|ate|\-|à)\s*(pp|p|m|g|gg|xg|xgg|xxg|g1|g2|g3)\b/);
  if (clothRangeMatch) {
    const startCode = clothRangeMatch[1].toUpperCase();
    const endCode = clothRangeMatch[2].toUpperCase();
    const startIdx = CLOTHING_SIZE_ORDER.indexOf(startCode);
    const endIdx = CLOTHING_SIZE_ORDER.indexOf(endCode);

    if (startIdx !== -1 && endIdx !== -1 && startIdx <= endIdx) {
      const generatedSizes = CLOTHING_SIZE_ORDER.slice(startIdx, endIdx + 1);
      return {
        raw,
        isRange: true,
        sizes: generatedSizes,
        type: 'clothing_range',
        min: startCode,
        max: endCode,
        includes: (target) => {
          const t = String(target).trim().toUpperCase();
          const targetIdx = CLOTHING_SIZE_ORDER.indexOf(t);
          if (targetIdx !== -1) {
            return targetIdx >= startIdx && targetIdx <= endIdx;
          }
          return generatedSizes.includes(t);
        }
      };
    }
  }

  // 3. Lista de Números separados por vírgula, barra ou 'e' (ex: "38, 39, 40", "38/39/40")
  const allNumbers = norm.match(/\b\d{2}\b/g);
  if (allNumbers && allNumbers.length > 1) {
    const uniqueNumbers = Array.from(new Set(allNumbers));
    return {
      raw,
      isRange: false,
      sizes: uniqueNumbers,
      type: 'numeric_list',
      includes: (target) => uniqueNumbers.includes(String(target).trim())
    };
  }

  // 4. Lista de Vestuário (ex: "P, M, G")
  const allCloth = norm.match(/\b(pp|p|m|g|gg|xg|xgg|xxg|g1|g2|g3)\b/g);
  if (allCloth && allCloth.length > 1) {
    const uniqueCloth = Array.from(new Set(allCloth.map(c => c.toUpperCase())));
    return {
      raw,
      isRange: false,
      sizes: uniqueCloth,
      type: 'clothing_list',
      includes: (target) => uniqueCloth.includes(String(target).trim().toUpperCase())
    };
  }

  // 5. Tamanho único numérico (ex: "38", "Tam 38", "Nº 38")
  if (allNumbers && allNumbers.length === 1) {
    const num = allNumbers[0];
    return {
      raw,
      isRange: false,
      sizes: [num],
      type: 'numeric_exact',
      min: parseInt(num, 10),
      max: parseInt(num, 10),
      includes: (target) => String(target).trim() === num
    };
  }

  // 6. Tamanho único de vestuário (ex: "M", "Tam M", "G")
  if (allCloth && allCloth.length === 1) {
    const code = allCloth[0].toUpperCase();
    return {
      raw,
      isRange: false,
      sizes: [code],
      type: 'clothing_exact',
      includes: (target) => String(target).trim().toUpperCase() === code
    };
  }

  // 7. Fallback textual direto
  return {
    raw,
    isRange: false,
    sizes: [raw],
    type: 'text',
    includes: (target) => norm.includes(normalizeQuery(target)) || normalizeQuery(target) === norm
  };
}

/**
 * Verifica se um tamanho solicitado está coberto por uma variação cadastrada.
 * @param {string} requestedSize
 * @param {string} variationSize
 * @returns {boolean}
 */
function isSizeCoveredByVariation(requestedSize, variationSize) {
  const parsed = parseVariationSizes(variationSize);
  return parsed.includes(requestedSize);
}

/**
 * Realiza busca local de produtos e variações no banco SQLite com base na mensagem do cliente.
 *
 * @param {string} userMessage - Mensagem recebida do cliente
 * @param {object} [db] - Instância opcional do banco para testes
 * @returns {{ promptInjection: string, matches: Array<object> }} Fatos concretos formatados para injeção no prompt da Sofia
 */
function searchCatalog(userMessage, db = getDatabase()) {
  if (!userMessage || typeof userMessage !== 'string' || !userMessage.trim()) {
    return {
      promptInjection: '',
      matches: []
    };
  }

  const queryNorm = normalizeQuery(userMessage);
  const extractedSizes = extractSizes(userMessage);
  const extractedColors = extractColors(userMessage);

  // Stopwords e termos genéricos de saudação/loja que não definem um produto específico
  const genericStopwords = [
    'tem', 'qual', 'preco', 'valor', 'quanto', 'custa', 'voce', 'voces', 'vende', 'vendem',
    'gostaria', 'quero', 'saber', 'tamanho', 'tamanhos', 'militar', 'militares', 'artigos', 'loja',
    'com', 'para', 'sobre', 'por', 'favor', 'bom', 'dia', 'boa', 'tarde', 'noite',
    'ola', 'olaa', 'uma', 'uns', 'umas', 'temos', 'teria', 'modelo', 'modelos', 'ola'
  ];

  // Divide a mensagem em palavras relevantes (tamanho >= 3)
  const words = queryNorm
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 3 && !genericStopwords.includes(w));

  // Busca todos os produtos ativos do banco
  const allActiveProducts = getAllProducts({ is_active: 1 }, db);

  if (!allActiveProducts || allActiveProducts.length === 0) {
    return {
      promptInjection: 'NENHUM PRODUTO EXATO FOI ENCONTRADO NO CATÁLOGO LOCAL.\nNUNCA invente preços, modelos ou disponibilidade.',
      matches: []
    };
  }

  // Pontuação de relevância de cada produto para a query
  const scoredProducts = [];

  for (const product of allActiveProducts) {
    let score = 0;
    const prodNameNorm = normalizeQuery(product.name);
    const prodDescNorm = normalizeQuery(product.description || '');
    const prodCatNorm = normalizeQuery(product.category_name || '');
    const prodBrandNorm = normalizeQuery(product.brand || '');
    const prodSkuNorm = normalizeQuery(product.sku || '');

    // Correspondência de palavras-chave no produto
    for (const word of words) {
      if (prodNameNorm.includes(word)) score += 10;
      if (prodDescNorm.includes(word)) score += 3;
      if (prodCatNorm.includes(word)) score += 5;
      if (prodBrandNorm.includes(word)) score += 5;
      if (prodSkuNorm.includes(word)) score += 15;
    }

    // Correspondência com variações de tamanho e cor
    const variations = product.variations || [];
    for (const v of variations) {
      const parsedVar = parseVariationSizes(v.size || '');
      const varColorNorm = normalizeQuery(v.color || '');

      for (const sz of extractedSizes) {
        if (parsedVar.includes(sz)) {
          score += 10;
        }
      }

      for (const col of extractedColors) {
        if (varColorNorm.includes(col)) {
          score += 5;
        }
      }
    }

    if (score > 0) {
      scoredProducts.push({ product, score });
    }
  }

  // Ordena por relevância e pega os 3 mais prováveis
  scoredProducts.sort((a, b) => b.score - a.score);
  const relevantMatches = scoredProducts.slice(0, 3).map(item => item.product);

  if (relevantMatches.length === 0) {
    return {
      promptInjection: 'NENHUM PRODUTO EXATO FOI ENCONTRADO NO CATÁLOGO LOCAL PARA ESTA SOLICITAÇÃO.\nNUNCA invente preços, modelos ou disponibilidade. Informe que não localizou no sistema imediato e ofereça transferência para um vendedor.',
      matches: []
    };
  }

  // Formata os fatos verificados do catálogo para enriquecer o prompt da Sofia
  const factsLines = [
    '==================================================',
    'INFORMAÇÕES REAIS E VERIFICADAS DO CATÁLOGO/ESTOQUE:',
    '=================================================='
  ];

  if (extractedSizes.length > 0) {
    factsLines.push(`TAMANHO(S) SOLICITADO(S): ${extractedSizes.join(', ')}`);
  }

  for (const prod of relevantMatches) {
    const formattedPrice = `R$ ${prod.price.toFixed(2).replace('.', ',')}`;
    const promoStr = prod.promo_price
      ? ` (Preço promocional: R$ ${prod.promo_price.toFixed(2).replace('.', ',')})`
      : (prod.promotional_price ? ` (Preço promocional: R$ ${prod.promotional_price.toFixed(2).replace('.', ',')})` : '');

    factsLines.push(`• PRODUTO: "${prod.name}"`);
    if (prod.brand) factsLines.push(`  - Marca: ${prod.brand}`);
    if (prod.category_name) factsLines.push(`  - Categoria: ${prod.category_name}`);
    factsLines.push(`  - Preço: ${formattedPrice}${promoStr}`);

    const variations = prod.variations || [];

    if (variations.length > 0) {
      // Se o cliente mencionou tamanho específico
      if (extractedSizes.length > 0) {
        for (const sz of extractedSizes) {
          const matchingVars = variations.filter(v => {
            const parsed = parseVariationSizes(v.size || '');
            return parsed.includes(sz);
          });

          if (matchingVars.length > 0) {
            const inStockVars = matchingVars.filter(v => v.stock_quantity > 0);
            if (inStockVars.length > 0) {
              for (const v of inStockVars) {
                const parsed = parseVariationSizes(v.size || '');
                const colorStr = v.color ? ` (${v.color})` : '';
                if (parsed.isRange) {
                  factsLines.push(`  - TAMANHO SOLICITADO: ${sz} - DISPONÍVEL (está incluído no intervalo de tamanhos cadastrados: ${v.size}${colorStr}).`);
                  factsLines.push(`    • Estoque registrado da variação/intervalo: ${v.stock_quantity} unidade(s) no total.`);
                  factsLines.push(`    • OBSERVAÇÃO DE ESTOQUE: O estoque de ${v.stock_quantity} un é o total registrado para o intervalo '${v.size}'. Confirme que o tamanho ${sz} está disponível entre os tamanhos atendidos pelo modelo (${v.size}) por ${formattedPrice}. Não afirme que existe estoque individual separado por número.`);
                } else {
                  factsLines.push(`  - TAMANHO SOLICITADO: ${sz} - DISPONÍVEL com ${v.stock_quantity} unidade(s) em estoque${colorStr}.`);
                }
              }
            } else {
              factsLines.push(`  - TAMANHO SOLICITADO: ${sz} - ATUALMENTE ESGOTADO / SEM ESTOQUE.`);
            }
          } else {
            const allAvailableSizes = variations.map(v => v.size).filter(Boolean);
            if (allAvailableSizes.length > 0) {
              factsLines.push(`  - TAMANHO SOLICITADO: ${sz} - INDISPONÍVEL / NÃO CADASTRADO para este modelo (tamanhos cadastrados: ${allAvailableSizes.join(', ')}).`);
              factsLines.push(`    • DIRETRIZ: NUNCA afirme que o tamanho ${sz} está disponível. Informe com clareza que o modelo trabalha apenas com os tamanhos ${allAvailableSizes.join(', ')} e ofereça falar com um vendedor.`);
            } else {
              factsLines.push(`  - TAMANHO SOLICITADO: ${sz} - Não temos este tamanho cadastrado para este modelo.`);
            }
          }
        }
      }

      // Lista geral de variações e estoque
      const availableVariations = variations
        .filter(v => v.stock_quantity > 0)
        .map(v => `${v.size}${v.color ? ' (' + v.color + ')' : ''}: ${v.stock_quantity} un.`);

      if (availableVariations.length > 0) {
        factsLines.push(`  - Variações cadastradas em estoque: ${availableVariations.join(', ')}.`);
      } else {
        factsLines.push(`  - Status geral de estoque: Produto atualmente ESGOTADO em todas as variações.`);
      }
    } else {
      factsLines.push(`  - Estoque: Consulte a equipe humana para detalhes específicos de disponibilidade.`);
    }

    if (prod.description) {
      factsLines.push(`  - Detalhes: ${prod.description}`);
    }
    factsLines.push('');
  }

  factsLines.push('DIRETRIZ OBRIGATÓRIA PARA ESTA RESPOSTA:');
  factsLines.push('- Use estritamente as informações reais acima para responder ao cliente com clareza e precisão.');
  factsLines.push('- Se o produto e tamanho solicitados constarem como DISPONÍVEIS, confirme prontamente com o nome do produto, o tamanho confirmado e o preço.');
  factsLines.push('- Quando o estoque estiver registrado em intervalo (ex: "38 ao 42"), informe que o tamanho solicitado está entre os tamanhos atendidos pelo modelo e mencione o estoque registrado da variação, sem inventar contagem individual por número.');
  factsLines.push('- Se o tamanho solicitado constar como INDISPONÍVEL ou NÃO CADASTRADO (ex: 43), informe claramente quais tamanhos são atendidos (ex: 38 ao 42) e pergunte se deseja falar com um vendedor.');
  factsLines.push('- NUNCA invente preços, tamanhos ou disponibilidade não constantes na lista acima.');

  return {
    promptInjection: factsLines.join('\n'),
    matches: relevantMatches
  };
}

module.exports = {
  searchCatalog,
  normalizeQuery,
  extractSizes,
  extractColors,
  parseVariationSizes,
  isSizeCoveredByVariation
};
