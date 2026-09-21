/**
 * openaiService.js
 *
 * Serviço de integração com a API da OpenAI.
 */

const OpenAI = require('openai');
const { getSystemPrompt } = require('./company');

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
 * @returns {Promise<string>} Resposta gerada pela IA
 */
async function generateAIResponse(userMessage, history = []) {
  try {
    const client = getOpenAIClient();

    if (!client) {
      console.error('[ERRO OPENAI]: OPENAI_API_KEY não foi configurada no arquivo .env.');
      return 'Olá! Nosso assistente virtual está em fase de configuração. Um de nossos atendentes entrará em contato com você em breve.';
    }

    const systemPrompt = getSystemPrompt();
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
      temperature: 0.7,
      max_tokens: 600
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
      return 'Atenção: A chave da OpenAI configurada é inválida ou expirou. Por favor, aguarde o atendimento humano.';
    }
    if (error.status === 429) {
      return 'Nosso sistema de atendimento inteligente está com alto volume no momento. Por favor, aguarde que um atendente humano irá te responder em breve.';
    }

    return 'Desculpe, tive uma instabilidade temporária para processar sua mensagem. Nossa equipe humana entrará em contato em breve.';
  }
}

module.exports = {
  generateAIResponse
};
