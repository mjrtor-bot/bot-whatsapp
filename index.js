/**
 * index.js
 *
 * Ponto de entrada principal do Agente de Atendimento WhatsApp e Painel Web.
 * Empresa: ART ARTIGOS MILITARES
 * Atendente Virtual: Sofia
 */

require('dotenv').config();

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const {
  isHumanSupportRequest,
  isHumanSupportActive,
  activateHumanSupport,
  reactivateContact,
  parseAdminCommand,
  getPausedContacts,
  getHistory,
  addMessageToHistory,
  getMessageId,
  getConversationContactId,
  isMessageProcessed,
  markMessageProcessed
} = require('./chatManager');
const { generateAIResponse } = require('./openaiService');
const { setWhatsAppStatus, registerWhatsAppActions } = require('./whatsappStatus');
const { getSofiaConfig } = require('./db');
const { startServer } = require('./server');

console.log('=============================================================');
console.log('🚀 AGENTE DE ATENDIMENTO WHATSAPP - ART ARTIGOS MILITARES');
console.log('🤖 Atendente Virtual: Sofia');
const hasOpenAIKey = Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim());
console.log(`🔑 OPENAI_API_KEY configurada: ${hasOpenAIKey ? 'SIM' : 'NÃO'}`);
console.log(`📁 Contatos em atendimento humano carregados: ${getPausedContacts().length}`);
console.log('=============================================================\n');

// 1. Inicializa o Painel Web Administrativo Express
const PORT = parseInt(process.env.PORT, 10) || 3000;
startServer(PORT);

// 2. Configura o status inicial do WhatsApp
setWhatsAppStatus('inicializando');

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

// Registra ações administrativas de controle de conexão
registerWhatsAppActions({
  disconnect: async () => {
    try {
      if (client) {
        await client.logout().catch(() => null);
        await setWhatsAppStatus('desconectado');
        return { success: true, message: 'WhatsApp desconectado com sucesso.' };
      }
      return { success: false, message: 'Cliente WhatsApp não disponível.' };
    } catch (err) {
      await setWhatsAppStatus('desconectado');
      return { success: true, message: 'WhatsApp desconectado.' };
    }
  },
  reconnect: async () => {
    try {
      if (client) {
        await setWhatsAppStatus('inicializando');
        client.initialize();
        return { success: true, message: 'Inicializando reconexão com o WhatsApp...' };
      }
      return { success: false, message: 'Cliente WhatsApp não disponível.' };
    } catch (err) {
      await setWhatsAppStatus('erro', { errorMessage: err.message });
      return { success: false, message: 'Erro ao reconectar: ' + err.message };
    }
  }
});

// Evento: Geração e exibição do QR Code no terminal e status visual para o painel
client.on('qr', async (qr) => {
  await setWhatsAppStatus('aguardando_qr', { qrCode: qr });
  console.log('\n=============================================================');
  console.log('📱 ESCANEIE O QR CODE ABAIXO COM SEU WHATSAPP:');
  console.log('👉 WhatsApp > Menu (três pontos) ou Ajustes > Aparelhos conectados > Conectar aparelho');
  console.log('=============================================================\n');
  qrcode.generate(qr, { small: true });
});

// Evento: Autenticação concluída
client.on('authenticated', async () => {
  await setWhatsAppStatus('autenticando');
  console.log('🔐 Sessão autenticada com sucesso! Finalizando conexão...');
});

// Evento: Falha na autenticação
client.on('auth_failure', async (msg) => {
  const errMsg = typeof msg === 'string' ? msg : JSON.stringify(msg);
  await setWhatsAppStatus('falha_autenticacao', { errorMessage: errMsg });
  console.error('[ERRO WHATSAPP] Falha na autenticação do WhatsApp:', errMsg);
});

// Evento: Cliente pronto para uso
client.on('ready', async () => {
  await setWhatsAppStatus('conectado');
  console.log('\n=============================================================');
  console.log('✅ WhatsApp conectado e Sofia pronta para atendimento.');
  console.log('=============================================================\n');
});

// Evento: Cliente desconectado
client.on('disconnected', async (reason) => {
  await setWhatsAppStatus('desconectado', { errorMessage: String(reason) });
  console.warn('⚠️ [AVISO] WhatsApp foi desconectado:', reason);
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

// Evento unificado: Processamento de mensagens criadas (recebidas e enviadas)
client.on('message_create', async (msg) => {
  try {
    // =========================================================================
    // 1. MENSAGENS ENVIADAS PELO PRÓPRIO WHATSAPP DA EMPRESA (msg.fromMe === true)
    // =========================================================================
    if (msg.fromMe) {
      const messageBody = msg.body ? msg.body.trim() : '';
      const adminCommand = parseAdminCommand(messageBody);

      if (adminCommand) {
        const targetId = getConversationContactId(msg);

        // Ignora status, broadcast e grupos para comandos administrativos
        if (
          !targetId ||
          targetId.endsWith('@g.us') ||
          targetId.endsWith('@broadcast') ||
          targetId === 'status@broadcast' ||
          targetId.endsWith('@newsletter')
        ) {
          return;
        }

        if (adminCommand === 'pause') {
          activateHumanSupport(targetId, 'admin_manual');
          console.log(`\n[ADMIN] Sofia pausada para: ${targetId} (#humano)\n`);
          return;
        }

        if (adminCommand === 'activate') {
          reactivateContact(targetId);
          console.log(`\n[ADMIN] Sofia reativada para: ${targetId} (#sofia)\n`);
          return;
        }
      }

      // Mensagem comum digitada pelo operador humano -> não processar com IA
      return;
    }

    // =========================================================================
    // 2. MENSAGENS RECEBIDAS DE CLIENTES (msg.fromMe === false)
    // =========================================================================

    // Ignorar status e broadcasts
    if (msg.isStatus || msg.from === 'status@broadcast' || (typeof msg.from === 'string' && msg.from.endsWith('@broadcast'))) {
      return;
    }

    // Ignorar mensagens de grupos e canais (atendimento exclusivo para privado)
    if ((typeof msg.from === 'string' && (msg.from.endsWith('@g.us') || msg.from.endsWith('@newsletter'))) || msg.isGroupMsg) {
      return;
    }

    // Responder apenas mensagens de texto puro ('chat')
    if (msg.type !== 'chat') {
      console.log(`[INFO] Mensagem do tipo "${msg.type}" ignorada (o agente responde apenas texto).`);
      return;
    }

    const messageId = getMessageId(msg);
    const contactId = getConversationContactId(msg);
    const messageBody = msg.body ? msg.body.trim() : '';

    if (!messageBody) return;

    // Idempotência: verificar se esta mensagem já foi processada
    if (messageId && isMessageProcessed(messageId)) {
      console.log(`\n[DUPLICADA IGNORADA]`);
      console.log(`ID: ${messageId}\n`);
      return;
    }

    // Marca imediatamente como processada para evitar condições de corrida assíncronas
    if (messageId) {
      markMessageProcessed(messageId);
    }

    // Log de mensagem recebida
    console.log(`\n[MENSAGEM RECEBIDIDA]`);
    console.log(`ID: ${messageId || 'N/A'}`);
    console.log(`De: ${contactId}`);
    console.log(`Texto: ${messageBody}\n`);

    // Verificar se o atendimento automático da Sofia está ativo globalmente
    try {
      const sofiaConfig = getSofiaConfig();
      if (sofiaConfig && sofiaConfig.is_active === 0) {
        console.log(`[SOFIA DESATIVADA GLOBALMENTE] Atendimento automático pausado via painel.\n`);
        return;
      }
    } catch (_) {
      // Segue normal
    }

    // Verificar se o contato está atualmente em atendimento humano
    if (isHumanSupportActive(contactId)) {
      console.log(`[ATENDIMENTO HUMANO] Sofia pausada para ${contactId}. Mensagem retida para equipe humana.\n`);
      return;
    }

    // Verificar se o cliente solicitou falar com atendente humano
    if (isHumanSupportRequest(messageBody)) {
      activateHumanSupport(contactId, 'solicitado_pelo_cliente');
      console.log(`[TRANSFERÊNCIA] ${contactId} solicitou atendimento humano. IA pausada.\n`);

      let transferMessage =
        'Entendi! Estou transferindo seu atendimento para a nossa equipe. ' +
        'Um de nossos vendedores entrará em contato com você em breve por aqui.';

      try {
        const sofiaConfig = getSofiaConfig();
        if (sofiaConfig && sofiaConfig.transfer_message && sofiaConfig.transfer_message.trim()) {
          transferMessage = sofiaConfig.transfer_message.trim();
        }
      } catch (_) {}

      console.log(`[ENVIO]`);
      console.log(`ID da mensagem original: ${messageId || 'N/A'}\n`);
      await safeReply(msg, contactId, transferMessage);
      console.log('[RESPOSTA ENVIADA]\n');
      return;
    }

    // Simular status 'digitando...'
    await safeSendTyping(msg, contactId);

    // Fluxo normal: Gerar resposta com IA (OpenAI + Catálogo Local)
    const history = getHistory(contactId);
    const aiResponse = await generateAIResponse(messageBody, history);

    // Atualiza o histórico de mensagens do contato
    addMessageToHistory(contactId, 'user', messageBody);
    addMessageToHistory(contactId, 'assistant', aiResponse);

    // Envia a resposta de volta ao cliente
    console.log(`[ENVIO]`);
    console.log(`ID da mensagem original: ${messageId || 'N/A'}\n`);
    await safeReply(msg, contactId, aiResponse);
    console.log('[RESPOSTA ENVIADA]\n');
  } catch (error) {
    console.error('[ERRO WHATSAPP]:', error.message || error);
  }
});

// Tratamento de erros não capturados para manter o processo sempre ativo
process.on('uncaughtException', (err) => {
  console.error('💥 [ERRO NÃO TRATADO - uncaughtException]:', err.message || err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 [ERRO NÃO TRATADO - unhandledRejection]:', reason);
});

// Inicialização do cliente WhatsApp
client.initialize();
