/**
 * whatsappStatus.js
 *
 * Módulo de monitoramento em tempo real do status de conexão do WhatsApp,
 * da atendente virtual Sofia e do serviço OpenAI.
 *
 * Gera a representação visual do QR Code para exibição segura no painel
 * administrativo para usuários autenticados.
 *
 * SEGURANÇA:
 * - Nunca expõe tokens, arquivos de sessão ou credenciais.
 * - Nunca expõe chaves de API.
 * - O QR Code é mantido apenas em memória temporária durante o emparelhamento.
 */

const QRCode = require('qrcode');
const { getSofiaConfig } = require('./db');

// Rótulos amigáveis e oficiais dos estados
const STATE_LABELS = {
  inicializando: 'INICIALIZANDO',
  aguardando_qr: 'AGUARDANDO QR CODE',
  autenticando: 'AUTENTICANDO',
  conectado: 'CONECTADO',
  desconectado: 'DESCONECTADO',
  falha_autenticacao: 'FALHA DE AUTENTICAÇÃO',
  erro: 'ERRO'
};

let whatsappState = {
  status: 'desconectado', // 'inicializando' | 'aguardando_qr' | 'autenticando' | 'conectado' | 'desconectado' | 'falha_autenticacao' | 'erro'
  qrCode: null,
  qrImage: null,
  statusMessage: 'WhatsApp desconectado.',
  lastUpdated: new Date().toISOString(),
  errorMessage: null,
  readyAt: null
};

// Ações registradas pelo inicializador do WhatsApp (index.js)
let registeredActions = {
  disconnect: null,
  reconnect: null
};

/**
 * Atualiza o status do WhatsApp e gera a imagem visual do QR Code se aplicável.
 *
 * @param {string} status
 * @param {object} details
 */
async function setWhatsAppStatus(status, details = {}) {
  whatsappState.status = status;
  whatsappState.lastUpdated = new Date().toISOString();

  if (details.errorMessage !== undefined) {
    whatsappState.errorMessage = details.errorMessage;
  }

  if (details.qrCode !== undefined) {
    whatsappState.qrCode = details.qrCode;
    if (details.qrCode) {
      try {
        whatsappState.qrImage = await QRCode.toDataURL(details.qrCode, {
          width: 280,
          margin: 2,
          color: {
            dark: '#0f172a',
            light: '#ffffff'
          }
        });
      } catch (err) {
        whatsappState.qrImage = null;
      }
    } else {
      whatsappState.qrImage = null;
    }
  }

  // Define a mensagem oficial para o estado atual
  switch (status) {
    case 'inicializando':
      whatsappState.statusMessage = 'Inicializando conexão com o WhatsApp...';
      whatsappState.qrCode = null;
      whatsappState.qrImage = null;
      break;

    case 'aguardando_qr':
      whatsappState.statusMessage = 'Aguardando leitura do QR Code.';
      break;

    case 'autenticando':
      whatsappState.statusMessage = 'WhatsApp autenticado. Finalizando conexão...';
      whatsappState.qrCode = null;
      whatsappState.qrImage = null;
      break;

    case 'conectado':
      whatsappState.statusMessage = 'WhatsApp conectado e Sofia pronta para atendimento.';
      whatsappState.readyAt = new Date().toISOString();
      whatsappState.qrCode = null;
      whatsappState.qrImage = null;
      whatsappState.errorMessage = null;
      break;

    case 'desconectado':
      whatsappState.statusMessage = 'WhatsApp desconectado.';
      whatsappState.qrCode = null;
      whatsappState.qrImage = null;
      break;

    case 'falha_autenticacao':
      whatsappState.statusMessage = 'Falha de autenticação do WhatsApp. É necessário escanear o QR Code novamente.';
      whatsappState.qrCode = null;
      whatsappState.qrImage = null;
      break;

    case 'erro':
      whatsappState.statusMessage = details.errorMessage
        ? `Erro na conexão do WhatsApp: ${details.errorMessage}`
        : 'Erro na conexão do WhatsApp.';
      whatsappState.qrCode = null;
      whatsappState.qrImage = null;
      break;

    default:
      whatsappState.statusMessage = details.statusMessage || '';
  }
}

/**
 * Registra as ações de controle de conexão do WhatsApp.
 * @param {{ disconnect?: Function, reconnect?: Function }} actions
 */
function registerWhatsAppActions(actions = {}) {
  if (actions.disconnect) registeredActions.disconnect = actions.disconnect;
  if (actions.reconnect) registeredActions.reconnect = actions.reconnect;
}

/**
 * Executa a desconexão do WhatsApp de forma segura.
 */
async function disconnectWhatsApp() {
  if (typeof registeredActions.disconnect === 'function') {
    return await registeredActions.disconnect();
  }
  await setWhatsAppStatus('desconectado');
  return { success: true, message: 'WhatsApp desconectado.' };
}

/**
 * Executa a reconexão do WhatsApp.
 */
async function reconnectWhatsApp() {
  if (typeof registeredActions.reconnect === 'function') {
    return await registeredActions.reconnect();
  }
  await setWhatsAppStatus('inicializando');
  return { success: true, message: 'Inicializando reconexão com o WhatsApp...' };
}

/**
 * Retorna o status completo e seguro do sistema para o Dashboard.
 */
function getSystemStatus() {
  const hasOpenAIKey = Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim());
  let sofiaActive = true;

  try {
    const sofiaConfig = getSofiaConfig();
    sofiaActive = sofiaConfig ? sofiaConfig.is_active !== 0 : true;
  } catch (_) {
    sofiaActive = true;
  }

  const instruction = whatsappState.status === 'aguardando_qr'
    ? 'No WhatsApp da empresa, acesse Aparelhos conectados > Conectar aparelho e escaneie o QR Code.'
    : null;

  return {
    whatsapp: {
      status: whatsappState.status,
      statusLabel: STATE_LABELS[whatsappState.status] || whatsappState.status.toUpperCase(),
      statusMessage: whatsappState.statusMessage,
      instruction,
      hasQr: Boolean(whatsappState.qrImage),
      qrImage: whatsappState.qrImage, // Data URL da imagem segura do QR
      readyAt: whatsappState.readyAt,
      lastUpdated: whatsappState.lastUpdated,
      error: whatsappState.errorMessage
    },
    openai: {
      isConfigured: hasOpenAIKey,
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini'
    },
    sofia: {
      isActive: sofiaActive,
      status: sofiaActive ? 'ATIVA' : 'PAUSADA'
    },
    serverTime: new Date().toISOString()
  };
}

module.exports = {
  setWhatsAppStatus,
  registerWhatsAppActions,
  disconnectWhatsApp,
  reconnectWhatsApp,
  getSystemStatus,
  STATE_LABELS
};
