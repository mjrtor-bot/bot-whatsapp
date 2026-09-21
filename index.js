/**
 * index.js
 *
 * Ponto de entrada principal do Agente de Atendimento WhatsApp.
 */

require('dotenv').config();

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const {
  isHumanSupportRequest,
  isReactivationRequest,
  isHumanSupportActive,
  activateHumanSupport,
  reactivateContact,
  getHistory,
  addMessageToHistory
} = require('./chatManager');
const { generateAIResponse } = require('./openaiService');

console.log('🚀 Inicializando Agente de Atendimento WhatsApp...');

// Configuração do cliente do WhatsApp com autenticação persistente (LocalAuth)
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu'
    ]
  }
});

// Evento: Geração e exibição do QR Code no terminal
client.on('qr', (qr) => {
  console.log('\n=============================================================');
  console.log('📱 ESCANEIE O QR CODE ABAIXO COM SEU WHATSAPP:');
  console.log('👉 WhatsApp > Menu (três pontos) ou Ajustes > Aparelhos conectados > Conectar aparelho');
  console.log('=============================================================\n');
  qrcode.generate(qr, { small: true });
});

// Evento: Autenticação concluída
client.on('authenticated', () => {
  console.log('🔐 Sessão autenticada com sucesso!');
});

// Evento: Falha na autenticação
client.on('auth_failure', (msg) => {
  console.error('❌ Falha na autenticação do WhatsApp:', msg);
});

// Evento: Cliente pronto para uso
client.on('ready', () => {
  console.log('\n=============================================================');
  console.log('WhatsApp conectado e agente pronto para atendimento.');
  console.log('=============================================================\n');
});

// Evento: Cliente desconectado
client.on('disconnected', (reason) => {
  console.warn('⚠️ WhatsApp foi desconectado:', reason);
});

// Função auxiliar segura para envio de status 'digitando...' sem quebrar o fluxo
async function safeSendTyping(msg, contactId) {
  try {
    if (typeof msg.getChat === 'function') {
      const chat = await msg.getChat().catch(() => null);
      if (chat && typeof chat.sendStateTyping === 'function') {
        await chat.sendStateTyping().catch(() => null);
        return;
      }
    }
    if (client && client.pupPage) {
      await client.pupPage.evaluate((cId) => {
        if (window.WWebJS && typeof window.WWebJS.sendChatstate === 'function') {
          window.WWebJS.sendChatstate('typing', cId);
        }
      }, contactId).catch(() => null);
    }
  } catch (_) {
    // Falha silenciosa em typing para garantir que o atendimento continue normalmente
  }
}

// Função auxiliar segura para envio de mensagens com fallback
async function safeReply(msg, contactId, text) {
  try {
    return await msg.reply(text);
  } catch (replyErr) {
    try {
      return await client.sendMessage(contactId, text);
    } catch (sendErr) {
      console.error('[ERRO WHATSAPP]:', sendErr.message || sendErr);
      throw sendErr;
    }
  }
}

// Evento: Recebimento de mensagens
client.on('message', async (msg) => {
  try {
    // 1. Ignorar mensagens enviadas pelo próprio bot
    if (msg.fromMe) return;

    // 2. Ignorar status do WhatsApp
    if (msg.isStatus || msg.from === 'status@broadcast' || msg.from.endsWith('@broadcast')) return;

    // 3. Ignorar mensagens de grupos e canais (responder apenas conversas privadas)
    if (msg.from.endsWith('@g.us') || msg.from.endsWith('@newsletter') || msg.isGroupMsg) return;

    // 4. Responder somente mensagens de texto puro ('chat')
    if (msg.type !== 'chat') {
      console.log(`[INFO] Mensagem do tipo "${msg.type}" ignorada (o agente responde apenas texto).`);
      return;
    }

    const contactId = msg.from;
    const messageBody = msg.body ? msg.body.trim() : '';

    if (!messageBody) return;

    // Log de diagnóstico da mensagem recebida
    console.log(`\n[MENSAGEM RECEBIDA]`);
    console.log(`De: ${contactId}`);
    console.log(`Texto: ${messageBody}\n`);

    // 5. Simular status 'digitando...'
    await safeSendTyping(msg, contactId);

    // 6. Verificar se o cliente solicitou reativação do atendimento automático
    if (isReactivationRequest(messageBody)) {
      reactivateContact(contactId);
      console.log(`🔄 [REATIVAÇÃO] Atendimento automático reativado para ${contactId}.`);
      await safeReply(msg, contactId, '✅ *Atendimento automático reativado!* Como posso ajudar você agora?');
      console.log('[RESPOSTA ENVIADA]\n');
      return;
    }

    // 7. Verificar se o contato está atualmente em atendimento humano
    if (isHumanSupportActive(contactId)) {
      console.log(`👤 [ATENDIMENTO HUMANO] Mensagem de ${contactId} retida para equipe humana. IA em pausa.\n`);
      return;
    }

    // 8. Verificar se o cliente solicitou falar com atendente humano
    if (isHumanSupportRequest(messageBody)) {
      activateHumanSupport(contactId, 'solicitado_pelo_cliente');
      console.log(`🔀 [TRANSFERÊNCIA] ${contactId} solicitou atendimento humano. IA pausada.`);

      const transferMessage =
        '🤝 Entendi perfeitamente! Estou transferindo seu atendimento para a nossa equipe humana.\n\n' +
        'Um de nossos atendentes entrará em contato com você aqui em breve.\n\n' +
        '_Caso queira reativar as respostas automáticas a qualquer momento, basta digitar *#bot* ou *#ativar*._';

      await safeReply(msg, contactId, transferMessage);
      console.log('[RESPOSTA ENVIADA]\n');
      return;
    }

    // 9. Fluxo normal: Gerar resposta com IA (OpenAI)
    // Recupera o histórico recente de conversas com este cliente
    const history = getHistory(contactId);

    // Gera a resposta com a OpenAI
    const aiResponse = await generateAIResponse(messageBody, history);

    // Atualiza o histórico com a mensagem do usuário e a resposta da IA
    addMessageToHistory(contactId, 'user', messageBody);
    addMessageToHistory(contactId, 'assistant', aiResponse);

    // Envia a resposta de volta ao cliente
    await safeReply(msg, contactId, aiResponse);
    console.log('[RESPOSTA ENVIADA]\n');
  } catch (error) {
    console.error('[ERRO WHATSAPP]:', error.message || error);
  }
});

// Tratamento de erros não capturados para manter o processo sempre ativo
process.on('uncaughtException', (err) => {
  console.error('💥 [ERRO NÃO TRATADO - uncaughtException]:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 [ERRO NÃO TRATADO - unhandledRejection]:', reason);
});

// Inicialização do cliente WhatsApp
client.initialize();
