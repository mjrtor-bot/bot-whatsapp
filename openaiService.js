/**
 * openaiService.js
 *
 * Serviço de integração com a API da OpenAI.
 * Incorpora busca inteligente no catálogo local e injeção de fatos verificados.
 */

const OpenAI = require('openai');
const { getSystemPrompt } = require('./company');
const { searchCatalog } = require('./catalogService');

// Instância preguiçosa (lazy initialization) do cliente OpenAI
let openaiClient = null;

function getOpenAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || apiKey.trim() === '') {
    return null;
  }
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: apiKey.trim() });
  }
  return openaiClient;
}

/**
 * Gera uma resposta para o cliente utilizando o modelo da OpenAI.
 *
 * @param {string} userMessage - Mensagem enviada pelo cliente
 * @param {Array<{ role: string, content: string }>} history - Histórico recente de mensagens
 * @param {object} [options] - Opções adicionais para testes/configurações
 * @returns {Promise<string>} Resposta gerada pela IA
 */
async function generateAIResponse(userMessage, history = [], options = {}) {
  try {
    const client = getOpenAIClient();

    if (!client) {
      console.error('[ERRO OPENAI]: OPENAI_API_KEY não foi configurada no arquivo .env.');
      return 'Olá! Nosso assistente virtual está temporariamente indisponível. Um de nossos atendentes entrará em contato com você em breve.';
    }

    let systemPrompt = getSystemPrompt(options.db);

    // Consulta de catálogo local para injeção de fatos verificados
    try {
      const catalogResult = searchCatalog(userMessage, options.db);
      if (catalogResult && catalogResult.promptInjection) {
        systemPrompt += `\n\n==================================================\nFATOS VERIFICADOS DO CATÁLOGO/ESTOQUE LOCAL (BASE REAL):\n==================================================\n${catalogResult.promptInjection}\nUse estritamente estes dados para responder ao cliente. NUNCA invente outros valores ou tamanhos.`;
      }
    } catch (catErr) {
      console.warn('[CATALOG SEARCH WARNING]:', catErr.message);
    }

    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

    console.log('[PROCESSANDO IA]');

    // Monta o payload de mensagens com system prompt + histórico + mensagem atual
    const messages = [
      { role: 'system', content: systemPrompt },
      ...history,
      { role: 'user', content: userMessage }
    ];

    const completion = await client.chat.completions.create({
      model: model,
      messages: messages,
      temperature: 0.6,
      max_tokens: 300
    });

    const reply = completion.choices[0]?.message?.content?.trim();

    if (!reply) {
      console.warn('[ERRO OPENAI]: Resposta vazia recebida do modelo.');
      return 'Desculpe, não consegui processar a resposta no momento. Vou encaminhar sua solicitação para nosso atendimento humano.';
    }

    console.log(`[RESPOSTA IA]\n${reply}\n`);

    return reply;
  } catch (error) {
    console.error('[ERRO OPENAI]:', error.message || error);

    // Tratamento de erros comuns da API sem interromper a execução do bot
    if (error.status === 401) {
      return 'Atenção: A chave da OpenAI configurada é inválida ou expirou. Por favor, aguarde o atendimento com nossa equipe humana.';
    }
    if (error.status === 429) {
      return 'Nosso atendimento automático está com alto volume no momento. Por favor, aguarde que um atendente irá te responder em breve.';
    }

    return 'Desculpe, tive uma instabilidade temporária para processar sua mensagem. Nossa equipe entrará em contato em breve.';
  }
}

module.exports = {
  generateAIResponse,
  getOpenAIClient
};
