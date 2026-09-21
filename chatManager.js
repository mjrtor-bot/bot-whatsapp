/**
 * chatManager.js
 *
 * Gerencia o histórico de conversas por contato e o controle de atendimento humano.
 */

// Armazena o histórico recente por contato: contactId -> Array<{ role: string, content: string }>
const conversationHistory = new Map();

// Armazena contatos pausados para atendimento humano: contactId -> { pausedAt: Date, reason: string }
const pausedContacts = new Map();

// Limite padrão de mensagens mantidas no histórico por contato
const DEFAULT_MAX_HISTORY = 10;

/**
 * Normaliza o texto removendo acentos, pontuações extras e convertendo para minúsculas.
 * @param {string} text
 * @returns {string}
 */
function normalizeText(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove acentos
    .trim();
}

/**
 * Verifica se a mensagem do cliente expressa o desejo de falar com atendimento humano.
 * @param {string} text
 * @returns {boolean}
 */
function isHumanSupportRequest(text) {
  const clean = normalizeText(text);

  // Gatilhos diretos de solicitação humana
  const triggers = [
    /\batendente\b/,
    /\bhumano\b/,
    /\bhumana\b/,
    /\bpessoa\b/,
    /\bvendedor\b/,
    /\bvendedora\b/,
    /\bfalar com atendente\b/,
    /\bfalar com uma pessoa\b/,
    /\bfalar com alguem\b/,
    /\bfalar com humano\b/,
    /\bfalar com vendedor\b/,
    /\bfalar com a vendedora\b/,
    /\batendimento humano\b/,
    /\batendimento pessoal\b/,
    /\bquero atendente\b/,
    /\bquero vendedor\b/,
    /\bchamar atendente\b/,
    /\bchamar vendedor\b/,
    /\btransferir para atendente\b/,
    /\bsuporte humano\b/
  ];

  return triggers.some(regex => regex.test(clean));
}

/**
 * Verifica se a mensagem do cliente ou operador é um comando de reativação do bot.
 * @param {string} text
 * @returns {boolean}
 */
function isReactivationRequest(text) {
  const clean = normalizeText(text);
  const reactivationCommands = ['#bot', '#ativar', '#voltar', '#auto', '!bot', '!ativar'];
  return reactivationCommands.includes(clean);
}

/**
 * Verifica se o contato está com o atendimento automático pausado (em atendimento humano).
 * @param {string} contactId
 * @returns {boolean}
 */
function isHumanSupportActive(contactId) {
  return pausedContacts.has(contactId);
}

/**
 * Ativa o modo de atendimento humano para um contato específico (pausa o bot).
 * @param {string} contactId
 * @param {string} reason
 */
function activateHumanSupport(contactId, reason = 'solicitacao_cliente') {
  pausedContacts.set(contactId, {
    pausedAt: new Date(),
    reason
  });
}

/**
 * Reativa o atendimento automático por IA para um contato específico.
 * @param {string} contactId
 * @returns {boolean} true se o contato estava pausado e foi reativado
 */
function reactivateContact(contactId) {
  if (pausedContacts.has(contactId)) {
    pausedContacts.delete(contactId);
    return true;
  }
  return false;
}

/**
 * Retorna a lista de contatos atualmente em atendimento humano.
 * @returns {Array<{ contactId: string, pausedAt: Date, reason: string }>}
 */
function getPausedContacts() {
  const list = [];
  pausedContacts.forEach((info, contactId) => {
    list.push({ contactId, ...info });
  });
  return list;
}

/**
 * Obtém o histórico recente de um contato.
 * @param {string} contactId
 * @returns {Array<{ role: string, content: string }>}
 */
function getHistory(contactId) {
  return conversationHistory.get(contactId) || [];
}

/**
 * Adiciona uma mensagem ao histórico do contato, respeitando o limite máximo configurado.
 * @param {string} contactId
 * @param {'user' | 'assistant'} role
 * @param {string} content
 */
function addMessageToHistory(contactId, role, content) {
  const maxHistory = parseInt(process.env.MAX_HISTORY_MESSAGES, 10) || DEFAULT_MAX_HISTORY;

  if (!conversationHistory.has(contactId)) {
    conversationHistory.set(contactId, []);
  }

  const history = conversationHistory.get(contactId);
  history.push({ role, content });

  // Mantém apenas as últimas N mensagens
  if (history.length > maxHistory) {
    conversationHistory.set(contactId, history.slice(-maxHistory));
  }
}

/**
 * Limpa o histórico de mensagens de um contato.
 * @param {string} contactId
 */
function clearHistory(contactId) {
  conversationHistory.delete(contactId);
}

module.exports = {
  isHumanSupportRequest,
  isReactivationRequest,
  isHumanSupportActive,
  activateHumanSupport,
  reactivateContact,
  getPausedContacts,
  getHistory,
  addMessageToHistory,
  clearHistory
};
