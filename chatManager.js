/**
 * chatManager.js
 *
 * Gerencia o histórico de conversas por contato, persistência de estado
 * e o controle de atendimento humano / comandos administrativos.
 * Sincroniza em memória, arquivo JSON e SQLite.
 */

const fs = require('fs');
const path = require('path');
const { setAttendanceStatus } = require('./db');

// Diretório e arquivo de persistência de estado de atendimento humano
const DATA_DIR = path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'attendance-state.json');

// Armazena o histórico recente por contato: contactId -> Array<{ role: string, content: string }>
const conversationHistory = new Map();

// Armazena contatos pausados para atendimento humano: contactId -> { pausedAt: Date, reason: string }
const pausedContacts = new Map();

// Cache temporário para deduplicação de mensagens (idempotência): messageId -> timestamp (ms)
const processedMessages = new Map();

// Limite padrão de mensagens mantidas no histórico por contato
const DEFAULT_MAX_HISTORY = 10;

// Configurações padrão de retenção de cache de idempotência
const DEFAULT_MESSAGE_CACHE_TTL = 30 * 60 * 1000; // 30 minutos
const MAX_MESSAGE_CACHE_SIZE = 10000;

/**
 * Normaliza e extrai o identificador JID como string simples (@c.us ou @lid).
 * Remove sufixos de dispositivo se presentes (:0, :1, etc) sem alterar o domínio (@c.us/@lid).
 *
 * @param {string|object} val
 * @returns {string}
 */
function extractJid(val) {
  if (!val) return '';
  let str = '';
  if (typeof val === 'string') {
    str = val.trim();
  } else if (typeof val === 'object') {
    if (typeof val._serialized === 'string' && val._serialized.trim()) {
      str = val._serialized.trim();
    } else if (typeof val.user === 'string' && typeof val.server === 'string') {
      str = `${val.user.trim()}@${val.server.trim()}`;
    } else if (typeof val.id === 'string' && val.id.trim()) {
      str = val.id.trim();
    } else if (typeof val.remote === 'string' && val.remote.trim()) {
      str = val.remote.trim();
    } else {
      str = String(val).trim();
    }
  } else {
    str = String(val).trim();
  }

  // Remove sufixo de dispositivo se presente (ex: 12345:0@c.us -> 12345@c.us ou 12345:1@lid -> 12345@lid)
  if (str.includes(':') && (str.includes('@c.us') || str.includes('@lid') || str.includes('@g.us'))) {
    str = str.replace(/:[0-9]+@/, '@');
  }

  return str;
}

/**
 * Verifica se o identificador é de broadcast ou status do WhatsApp.
 * @param {string} id
 * @returns {boolean}
 */
function isSelfOrBroadcast(id) {
  if (!id || typeof id !== 'string') return true;
  const clean = id.trim();
  return (
    clean === 'status@broadcast' ||
    clean.endsWith('@broadcast')
  );
}

/**
 * Extrai de forma robusta e consistente o ID do outro participante da conversa
 * (o cliente no caso de atendimento 1 a 1), preservando @c.us e @lid.
 *
 * Para mensagens recebidas (msg.fromMe === false):
 * - Retorna o ID do cliente (msg.from ou msg.id.remote).
 *
 * Para mensagens enviadas pela empresa (msg.fromMe === true):
 * - Retorna o destinatário/cliente da conversa (msg.id.remote ou msg.to).
 *
 * @param {object|string} msg - Objeto da mensagem do whatsapp-web.js ou string
 * @returns {string} ID do contato da conversa (cliente) ou string vazia
 */
function getConversationContactId(msg) {
  if (!msg) return '';
  if (typeof msg === 'string') {
    return extractJid(msg);
  }

  const isFromMe = Boolean(
    msg.fromMe === true ||
    (msg.id && msg.id.fromMe === true) ||
    (typeof msg.id === 'string' && msg.id.startsWith('true_')) ||
    (msg.id && typeof msg.id._serialized === 'string' && msg.id._serialized.startsWith('true_'))
  );

  // Extrai o remote do id (representa o chat/conversa no WhatsApp Web)
  let remoteId = '';
  if (msg.id) {
    if (typeof msg.id.remote === 'string' || (msg.id.remote && typeof msg.id.remote === 'object')) {
      remoteId = extractJid(msg.id.remote);
    } else if (typeof msg.id._serialized === 'string') {
      const parts = msg.id._serialized.split('_');
      if (parts.length >= 2) {
        remoteId = extractJid(parts[1]);
      }
    } else if (typeof msg.id === 'string' && msg.id.includes('_')) {
      const parts = msg.id.split('_');
      if (parts.length >= 2) {
        remoteId = extractJid(parts[1]);
      }
    }
  }

  if (isFromMe) {
    // Para mensagens enviadas pela empresa (fromMe === true):
    // 1. msg.id.remote é a representação primária da conversa no WhatsApp Web
    if (remoteId && !isSelfOrBroadcast(remoteId)) {
      return remoteId;
    }
    // 2. msg.to é o destinatário da mensagem
    const toId = extractJid(msg.to);
    if (toId && !isSelfOrBroadcast(toId)) {
      return toId;
    }
    return remoteId || toId || '';
  } else {
    // Para mensagens recebidas de clientes (fromMe === false):
    // 1. msg.from é o remetente
    const fromId = extractJid(msg.from);
    if (fromId && !isSelfOrBroadcast(fromId)) {
      return fromId;
    }
    // 2. msg.id.remote é a conversa
    if (remoteId && !isSelfOrBroadcast(remoteId)) {
      return remoteId;
    }
    // 3. msg.author
    const authorId = extractJid(msg.author);
    if (authorId && !isSelfOrBroadcast(authorId)) {
      return authorId;
    }
    return fromId || remoteId || '';
  }
}

/**
 * Carrega o estado de contatos pausados a partir do arquivo JSON de persistência.
 * @returns {number} Quantidade de contatos pausados carregados
 */
function loadAttendanceState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.pausedContacts)) {
        pausedContacts.clear();
        for (const rawId of parsed.pausedContacts) {
          const id = extractJid(rawId);
          if (id) {
            pausedContacts.set(id, {
              pausedAt: parsed.updatedAt ? new Date(parsed.updatedAt) : new Date(),
              reason: 'persistido'
            });
          }
        }
        return pausedContacts.size;
      }
    }
  } catch (err) {
    console.error('[ERRO PERSISTÊNCIA]: Falha ao carregar estado de atendimento:', err.message || err);
  }
  return 0;
}

/**
 * Salva os IDs dos contatos em atendimento humano no arquivo JSON de forma segura.
 * Nunca grava o conteúdo das mensagens neste arquivo.
 */
function saveAttendanceState() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    const payload = {
      pausedContacts: Array.from(pausedContacts.keys()),
      updatedAt: new Date().toISOString()
    };

    const tempFile = `${STATE_FILE}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(payload, null, 2), 'utf8');
    fs.renameSync(tempFile, STATE_FILE);
  } catch (err) {
    console.error('[ERRO PERSISTÊNCIA]: Falha ao salvar estado de atendimento:', err.message || err);
  }
}

// Carrega o estado salvo na inicialização do módulo
loadAttendanceState();

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
 * Verifica se a mensagem enviada pelo operador é um comando administrativo.
 * Somente mensagens com msg.fromMe === true devem acionar este método.
 *
 * @param {string} text - Texto da mensagem
 * @returns {'pause' | 'activate' | null} Tipo de comando identificado ou null
 */
function parseAdminCommand(text) {
  if (!text || typeof text !== 'string') return null;
  const clean = text.trim().toLowerCase();

  if (clean === '#humano' || clean === '#human') {
    return 'pause';
  }
  if (clean === '#sofia' || clean === '#bot' || clean === '#ativar') {
    return 'activate';
  }
  return null;
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
 * Verifica se o contato está com o atendimento automático pausado (em atendimento humano).
 * Compatível com identificadores @c.us e @lid.
 * @param {string|object} contactId
 * @returns {boolean}
 */
function isHumanSupportActive(contactId) {
  const id = extractJid(contactId);
  if (!id) return false;
  return pausedContacts.has(id);
}

/**
 * Ativa o modo de atendimento humano para um contato específico (pausa a Sofia) e persiste.
 * Sincroniza em memória, no arquivo JSON e no SQLite.
 *
 * @param {string|object} contactId
 * @param {string} reason
 */
function activateHumanSupport(contactId, reason = 'solicitacao_cliente') {
  const id = extractJid(contactId);
  if (!id) return;
  pausedContacts.set(id, {
    pausedAt: new Date(),
    reason
  });
  saveAttendanceState();

  try {
    setAttendanceStatus(id, 'HUMANO', reason);
  } catch (_) {
    // Graceful fallback se banco não estiver acessível
  }
}

/**
 * Reativa o atendimento automático por IA para um contato específico e persiste.
 * Sincroniza em memória, no arquivo JSON e no SQLite.
 *
 * @param {string|object} contactId
 * @returns {boolean} true se o contato estava pausado e foi reativado
 */
function reactivateContact(contactId) {
  const id = extractJid(contactId);
  if (!id) return false;
  if (pausedContacts.has(id)) {
    pausedContacts.delete(id);
    saveAttendanceState();

    try {
      setAttendanceStatus(id, 'SOFIA');
    } catch (_) {
      // Graceful fallback se banco não estiver acessível
    }
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
 * @param {string|object} contactId
 * @returns {Array<{ role: string, content: string }>}
 */
function getHistory(contactId) {
  const id = extractJid(contactId);
  if (!id) return [];
  return conversationHistory.get(id) || [];
}

/**
 * Adiciona uma mensagem ao histórico do contato, respeitando o limite máximo configurado.
 * @param {string|object} contactId
 * @param {'user' | 'assistant'} role
 * @param {string} content
 */
function addMessageToHistory(contactId, role, content) {
  const id = extractJid(contactId);
  if (!id) return;
  const maxHistory = parseInt(process.env.MAX_HISTORY_MESSAGES, 10) || DEFAULT_MAX_HISTORY;

  if (!conversationHistory.has(id)) {
    conversationHistory.set(id, []);
  }

  const history = conversationHistory.get(id);
  history.push({ role, content });

  // Mantém apenas as últimas N mensagens
  if (history.length > maxHistory) {
    conversationHistory.set(id, history.slice(-maxHistory));
  }
}

/**
 * Limpa o histórico de mensagens de um contato.
 * @param {string|object} contactId
 */
function clearHistory(contactId) {
  const id = extractJid(contactId);
  if (!id) return;
  conversationHistory.delete(id);
}

/**
 * Extrai o identificador único e consistente de uma mensagem do WhatsApp.
 * Compatível com objetos do whatsapp-web.js e identificadores strings.
 * @param {object|string} msg
 * @returns {string|null}
 */
function getMessageId(msg) {
  if (!msg) return null;
  if (typeof msg === 'string' && msg.trim()) return msg.trim();
  if (typeof msg.id === 'string' && msg.id.trim()) return msg.id.trim();
  if (msg.id && typeof msg.id._serialized === 'string' && msg.id._serialized.trim()) {
    return msg.id._serialized.trim();
  }
  if (msg.id && typeof msg.id.id === 'string' && msg.id.id.trim()) {
    return msg.id.id.trim();
  }
  if (msg._serialized && typeof msg._serialized === 'string' && msg._serialized.trim()) {
    return msg._serialized.trim();
  }
  if (msg.id) return String(msg.id);
  return null;
}

/**
 * Verifica se a mensagem com o ID fornecido já foi processada ou está no cache de idempotência.
 * @param {string} messageId
 * @returns {boolean}
 */
function isMessageProcessed(messageId) {
  if (!messageId || typeof messageId !== 'string') return false;
  return processedMessages.has(messageId.trim());
}

/**
 * Marca o ID da mensagem como processada no cache de idempotência.
 * Realiza evicção dos registros mais antigos caso atinja o limite máximo.
 * @param {string} messageId
 */
function markMessageProcessed(messageId) {
  if (!messageId || typeof messageId !== 'string') return;
  const id = messageId.trim();

  // Se o cache atingir a capacidade máxima, descarta as chaves mais antigas
  if (processedMessages.size >= MAX_MESSAGE_CACHE_SIZE) {
    const oldestKey = processedMessages.keys().next().value;
    if (oldestKey) {
      processedMessages.delete(oldestKey);
    }
  }

  processedMessages.set(id, Date.now());
}

/**
 * Remove do cache de idempotência as mensagens processadas cujo TTL expirou.
 * @param {number} [ttlMs] - Tempo de vida em milissegundos
 * @returns {number} Quantidade de registros removidos
 */
function cleanupProcessedMessagesCache(ttlMs = DEFAULT_MESSAGE_CACHE_TTL) {
  const now = Date.now();
  let removedCount = 0;
  for (const [id, timestamp] of processedMessages.entries()) {
    if (now - timestamp >= ttlMs) {
      processedMessages.delete(id);
      removedCount++;
    }
  }
  return removedCount;
}

/**
 * Limpa completamente o cache de mensagens processadas.
 */
function clearProcessedMessagesCache() {
  processedMessages.clear();
}

/**
 * Retorna a contagem atual de mensagens no cache de idempotência.
 * @returns {number}
 */
function getProcessedMessagesCount() {
  return processedMessages.size;
}

// Configuração de limpeza periódica automática do cache a cada 5 minutos
const cleanupInterval = setInterval(() => {
  cleanupProcessedMessagesCache();
}, 5 * 60 * 1000);

if (cleanupInterval && typeof cleanupInterval.unref === 'function') {
  cleanupInterval.unref();
}

module.exports = {
  loadAttendanceState,
  saveAttendanceState,
  parseAdminCommand,
  isHumanSupportRequest,
  isHumanSupportActive,
  activateHumanSupport,
  reactivateContact,
  getPausedContacts,
  getHistory,
  addMessageToHistory,
  clearHistory,
  getMessageId,
  getConversationContactId,
  extractJid,
  isMessageProcessed,
  markMessageProcessed,
  cleanupProcessedMessagesCache,
  clearProcessedMessagesCache,
  getProcessedMessagesCount,
  pauseForHuman: activateHumanSupport,
  resumeSofia: reactivateContact
};
