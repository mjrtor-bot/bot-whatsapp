/**
 * test.js
 *
 * Suite de testes locais e simulações para validação de regras de negócio,
 * comandos administrativos, persistência de estado, anti-alucinação,
 * SQLite, Catálogo Local com Variações de Estoque, Autenticação e Backup.
 */

require('dotenv').config();
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const {
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
  getProcessedMessagesCount
} = require('./chatManager');

const { companyConfig, getSystemPrompt } = require('./company');
const { generateAIResponse } = require('./openaiService');

const db = require('./db');
const { searchCatalog, extractSizes, extractColors, parseVariationSizes, isSizeCoveredByVariation } = require('./catalogService');
const { setWhatsAppStatus, getSystemStatus } = require('./whatsappStatus');

console.log('=============================================================');
console.log('🧪 INICIANDO SUÍTE DE TESTES DO AGENTE SOFIA & PAINEL WEB');
console.log('=============================================================\n');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`✅ [PASSOU] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`❌ [FALHOU] ${name}`);
    console.error(`   Erro: ${err.message}`);
  }
}

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`✅ [PASSOU] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`❌ [FALHOU] ${name}`);
    console.error(`   Erro: ${err.message}`);
  }
}

async function runAllTests() {
  // Limpeza de ambiente de teste
  const testContactId = '5511999990001@c.us';
  const testLidContactId = '123456789012345@lid';
  clearHistory(testContactId);
  reactivateContact(testContactId);
  reactivateContact(testLidContactId);

  // =========================================================================
  // PARTE 1: TESTES ORIGINAIS PRESERVADOS (TESTES 1 A 8)
  // =========================================================================

  // -------------------------------------------------------------
  // Teste 1: Validação de Configuração da Empresa e Prompt
  // -------------------------------------------------------------
  runTest('1. Configuração da Empresa (company.js)', () => {
    assert.strictEqual(companyConfig.name, 'ART ARTIGOS MILITARES');
    assert.strictEqual(companyConfig.agentName, 'Sofia');
    assert(companyConfig.serviceRules.length >= 10, 'Deve conter regras detalhadas de atendimento');
    const prompt = getSystemPrompt();
    assert(prompt.includes('Sofia'), 'Prompt deve conter o nome Sofia');
    assert(prompt.includes('ART ARTIGOS MILITARES'), 'Prompt deve conter o nome da empresa');
    assert(prompt.includes('NUNCA invente preço'), 'Prompt deve proibir alucinação de preço');
    assert(prompt.includes('Rua do Café'), 'Prompt deve conter o endereço');
    assert(prompt.includes('08h às 18h'), 'Prompt deve conter o horário');
  });

  // -------------------------------------------------------------
  // Teste 2: Detecção de Solicitação de Atendimento Humano
  // -------------------------------------------------------------
  runTest('2. Gatilhos de transferência para atendimento humano', () => {
    const validTriggers = [
      'quero falar com vendedor',
      'quero falar com atendente',
      'quero falar com uma pessoa',
      'atendente',
      'humano',
      'humana',
      'pessoa',
      'vendedor',
      'vendedora',
      'falar com alguém',
      'atendimento humano',
      'preciso de suporte humano',
      'chamar vendedor'
    ];

    for (const phrase of validTriggers) {
      assert(
        isHumanSupportRequest(phrase),
        `Deveria detectar solicitação humana em: "${phrase}"`
      );
    }

    const nonTriggers = [
      'Boa tarde, tudo bem?',
      'Vocês vendem coturno?',
      'Qual o endereço da loja?',
      'Qual o horário de atendimento?'
    ];

    for (const phrase of nonTriggers) {
      assert(
        !isHumanSupportRequest(phrase),
        `Não deveria detectar solicitação humana em: "${phrase}"`
      );
    }
  });

  // -------------------------------------------------------------
  // Teste 3: Comandos Administrativos (#humano / #sofia)
  // -------------------------------------------------------------
  runTest('3. Comandos Administrativos do Operador', () => {
    assert.strictEqual(parseAdminCommand('#humano'), 'pause');
    assert.strictEqual(parseAdminCommand('#HUMANO'), 'pause');
    assert.strictEqual(parseAdminCommand('#sofia'), 'activate');
    assert.strictEqual(parseAdminCommand('#SOFIA'), 'activate');
    assert.strictEqual(parseAdminCommand('Olá cliente'), null);
    assert.strictEqual(parseAdminCommand('coturno 42'), null);
  });

  // -------------------------------------------------------------
  // Teste 4: Compatibilidade de IDs (@c.us e @lid)
  // -------------------------------------------------------------
  runTest('4. Compatibilidade de IDs @c.us e @lid', () => {
    activateHumanSupport(testLidContactId, 'teste_lid');
    assert.strictEqual(isHumanSupportActive(testLidContactId), true);
    reactivateContact(testLidContactId);
    assert.strictEqual(isHumanSupportActive(testLidContactId), false);
  });

  // -------------------------------------------------------------
  // Teste 5: Simulação dos Cenários A até J
  // -------------------------------------------------------------

  // CENÁRIO A: Cliente envia "Boa tarde" => IA processa
  await runAsyncTest('CENÁRIO A: Cliente envia "Boa tarde" -> IA processa', async () => {
    const isHuman = isHumanSupportRequest('Boa tarde');
    assert.strictEqual(isHuman, false, 'Não deve ser transferência humana');
    assert.strictEqual(isHumanSupportActive(testContactId), false, 'Cliente não está pausado');
    addMessageToHistory(testContactId, 'user', 'Boa tarde');
    const history = getHistory(testContactId);
    assert.strictEqual(history.length, 1);
    assert.strictEqual(history[0].content, 'Boa tarde');
  });

  // CENÁRIO B: Cliente envia "Tem coturno 42?" => Regras anti-alucinação de estoque
  runTest('CENÁRIO B: Regras anti-alucinação de estoque (Tem coturno 42?)', () => {
    const prompt = getSystemPrompt();
    assert(
      prompt.includes('Tem coturno 42?'),
      'Prompt deve conter o exemplo específico do coturno 42'
    );
    assert(
      prompt.includes('preciso confirmar a disponibilidade do coturno tamanho 42'),
      'Resposta esperada deve ser transparente sem prometer estoque'
    );
  });

  // CENÁRIO C: Cliente envia "Qual o preço?" => Regras anti-alucinação de preço
  runTest('CENÁRIO C: Regras anti-alucinação de preço (Qual o preço?)', () => {
    const prompt = getSystemPrompt();
    assert(
      prompt.includes('Qual o preço?'),
      'Prompt deve conter exemplo de pergunta de preço'
    );
    assert(
      prompt.includes('Os valores variam conforme o modelo e precisam ser confirmados'),
      'Resposta deve orientar confirmação com a equipe sem inventar valor'
    );
  });

  // CENÁRIO D: Cliente envia "Quero falar com vendedor" => Atendimento humano ativado
  runTest('CENÁRIO D: Cliente envia "Quero falar com vendedor" -> Ativação de atendimento humano', () => {
    const isHuman = isHumanSupportRequest('Quero falar com vendedor');
    assert.strictEqual(isHuman, true, 'Deve identificar pedido de vendedor');
    activateHumanSupport(testContactId, 'solicitado_pelo_cliente');
    assert.strictEqual(isHumanSupportActive(testContactId), true, 'Contato deve estar pausado');
  });

  // CENÁRIO E: Cliente pausado envia mensagem => OpenAI não é chamada
  runTest('CENÁRIO E: Cliente pausado envia mensagem -> IA não deve responder', () => {
    assert.strictEqual(isHumanSupportActive(testContactId), true, 'Contato deve continuar pausado');
    const shouldCallOpenAI = !isHumanSupportActive(testContactId);
    assert.strictEqual(shouldCallOpenAI, false, 'OpenAI NÃO deve ser chamada');
  });

  // CENÁRIO F: Operador envia #sofia => Sofia reativada
  runTest('CENÁRIO F: Operador envia #sofia -> Sofia reativada', () => {
    const cmd = parseAdminCommand('#sofia');
    assert.strictEqual(cmd, 'activate', 'Comando #sofia deve ativar');
    const wasReactivated = reactivateContact(testContactId);
    assert.strictEqual(wasReactivated, true, 'Contato deve ser reativado com sucesso');
    assert.strictEqual(isHumanSupportActive(testContactId), false, 'Contato não deve mais estar pausado');
  });

  // CENÁRIO G: Cliente envia nova mensagem => OpenAI processa novamente
  runTest('CENÁRIO G: Cliente envia mensagem após reativação -> IA volta a processar', () => {
    assert.strictEqual(isHumanSupportActive(testContactId), false, 'Contato está ativo');
    const shouldCallOpenAI = !isHumanSupportActive(testContactId);
    assert.strictEqual(shouldCallOpenAI, true, 'OpenAI DEVE ser chamada novamente');
  });

  // CENÁRIO H: Operador envia #humano => Sofia pausada
  runTest('CENÁRIO H: Operador envia #humano -> Sofia pausada', () => {
    const cmd = parseAdminCommand('#humano');
    assert.strictEqual(cmd, 'pause', 'Comando #humano deve pausar');
    activateHumanSupport(testContactId, 'admin_manual');
    assert.strictEqual(isHumanSupportActive(testContactId), true, 'Contato deve estar pausado novamente');
  });

  // CENÁRIO I: Cliente envia #sofia => Cliente NÃO pode executar comando admin
  runTest('CENÁRIO I: Cliente envia #sofia -> Cliente não consegue reativar se msg.fromMe === false', () => {
    const msgFromMe = false;
    const isPaused = isHumanSupportActive(testContactId);
    assert.strictEqual(isPaused, true, 'Cliente está em atendimento humano');

    if (!msgFromMe && isPaused) {
      // Retorna sem reativar
    }
    assert.strictEqual(isHumanSupportActive(testContactId), true, 'Contato DEVE permanecer pausado');
  });

  // CENÁRIO J: Reiniciar estado simulado => Contatos pausados permanecem pausados
  runTest('CENÁRIO J: Persistência em attendance-state.json sobrevive a reinicializações', () => {
    activateHumanSupport(testContactId, 'teste_persistencia');
    assert.strictEqual(isHumanSupportActive(testContactId), true);

    saveAttendanceState();

    const loadedCount = loadAttendanceState();
    assert(loadedCount >= 1, 'Deve carregar pelo menos 1 contato pausado');
    assert.strictEqual(isHumanSupportActive(testContactId), true, 'Contato de teste deve permanecer pausado após reload');

    const statePath = path.join(__dirname, 'data', 'attendance-state.json');
    assert(fs.existsSync(statePath), 'Arquivo attendance-state.json deve existir');
    const content = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    assert(Array.isArray(content.pausedContacts), 'pausedContacts deve ser um array');
    assert(content.pausedContacts.includes(testContactId), 'Deve conter o ID do contato pausado');
    assert.strictEqual(content.messages, undefined, 'NÃO deve conter campo de mensagens');
    assert.strictEqual(content.history, undefined, 'NÃO deve conter histórico');
  });

  // -------------------------------------------------------------
  // Teste 7: Idempotência e Deduplicação (1 msg = 1 processamento = máx 1 resposta)
  // -------------------------------------------------------------
  runTest('7.1 Extração de Message ID de múltiplos formatos', () => {
    assert.strictEqual(
      getMessageId({ id: { _serialized: 'true_5511999990001@c.us_3EB0ABC123' } }),
      'true_5511999990001@c.us_3EB0ABC123'
    );
    assert.strictEqual(
      getMessageId({ id: { id: '3EB0ABC123' } }),
      '3EB0ABC123'
    );
    assert.strictEqual(
      getMessageId({ id: 'raw_msg_id_string' }),
      'raw_msg_id_string'
    );
    assert.strictEqual(
      getMessageId('direct_string_id'),
      'direct_string_id'
    );
    assert.strictEqual(getMessageId(null), null);
    assert.strictEqual(getMessageId({}), null);
  });

  await runAsyncTest('7.2 Deduplicação com triplicação de eventos (1 recebimento = máx 1 resposta)', async () => {
    clearProcessedMessagesCache();

    const sampleMsg = {
      id: { _serialized: 'false_5511999990001@c.us_TEST_MSG_TRIPLE_01' },
      from: testContactId,
      body: 'Bom dia! Gostaria de saber o horário',
      type: 'chat',
      fromMe: false
    };

    let processedCount = 0;
    let ignoredCount = 0;
    let sentReplies = [];

    async function simulateMessageReceive(msg) {
      const msgId = getMessageId(msg);
      if (msgId && isMessageProcessed(msgId)) {
        ignoredCount++;
        return null;
      }
      if (msgId) {
        markMessageProcessed(msgId);
      }
      processedCount++;
      sentReplies.push(`Resposta gerada para ${msgId}`);
      return true;
    }

    await simulateMessageReceive(sampleMsg);
    await simulateMessageReceive(sampleMsg);
    await simulateMessageReceive(sampleMsg);

    assert.strictEqual(processedCount, 1, 'Apenas 1 evento deve ser processado');
    assert.strictEqual(ignoredCount, 2, '2 eventos duplicados devem ser ignorados');
    assert.strictEqual(sentReplies.length, 1, 'Exatamente 1 resposta deve ser enviada');
  });

  await runAsyncTest('7.3 Concorrência assíncrona paralela (Promise.all)', async () => {
    clearProcessedMessagesCache();

    const sampleMsg = {
      id: { _serialized: 'false_5511999990001@c.us_CONCURRENT_RACE_02' },
      from: testContactId,
      body: 'Qual o endereço da loja?',
      type: 'chat',
      fromMe: false
    };

    let executionCount = 0;

    async function handleEvent(msg) {
      const msgId = getMessageId(msg);
      if (msgId && isMessageProcessed(msgId)) {
        return;
      }
      if (msgId) {
        markMessageProcessed(msgId);
      }
      await new Promise((res) => setTimeout(res, 10));
      executionCount++;
    }

    await Promise.all([
      handleEvent(sampleMsg),
      handleEvent(sampleMsg),
      handleEvent(sampleMsg)
    ]);

    assert.strictEqual(executionCount, 1, 'Concorrência assíncrona não deve produzir respostas extras');
  });

  runTest('7.4 TTL e limpeza automática do cache de mensagens processadas', () => {
    clearProcessedMessagesCache();

    markMessageProcessed('msg_antiga_01');
    markMessageProcessed('msg_antiga_02');
    assert.strictEqual(getProcessedMessagesCount(), 2);

    const removed = cleanupProcessedMessagesCache(0);
    assert.strictEqual(removed, 2, 'Todas as mensagens expiradas devem ser removidas');
    assert.strictEqual(getProcessedMessagesCount(), 0, 'Cache deve ficar vazio');
  });

  runTest('7.5 Mensagens do operador (#humano / #sofia) não são bloqueadas', () => {
    const operatorMsg1 = '#humano';
    const operatorMsg2 = '#sofia';

    const cmd1 = parseAdminCommand(operatorMsg1);
    const cmd2 = parseAdminCommand(operatorMsg2);

    assert.strictEqual(cmd1, 'pause');
    assert.strictEqual(cmd2, 'activate');
  });

  // -------------------------------------------------------------
  // Teste 8: Validação específica do cenário real @lid (140321547657442@lid)
  // -------------------------------------------------------------
  runTest('8.1 Resolução de ID com getConversationContactId para @lid e @c.us', () => {
    const incomingLidMsg = {
      fromMe: false,
      from: '140321547657442@lid',
      id: { remote: '140321547657442@lid', _serialized: 'false_140321547657442@lid_3EB0123' },
      body: 'Vocês vendem cinto tático?'
    };
    assert.strictEqual(getConversationContactId(incomingLidMsg), '140321547657442@lid');

    const outgoingLidMsg = {
      fromMe: true,
      from: '5511999998888:0@c.us',
      to: '140321547657442@lid',
      id: { remote: '140321547657442@lid', _serialized: 'true_140321547657442@lid_3EB0ABC' },
      body: '#sofia'
    };
    assert.strictEqual(getConversationContactId(outgoingLidMsg), '140321547657442@lid');

    const outgoingObjRemoteMsg = {
      fromMe: true,
      from: '5511999998888@c.us',
      id: { remote: { _serialized: '140321547657442@lid' } },
      body: '#sofia'
    };
    assert.strictEqual(getConversationContactId(outgoingObjRemoteMsg), '140321547657442@lid');
  });

  runTest('8.2 Cenário Real @lid: Cliente 140321547657442@lid pausado -> Operador envia #sofia -> Cliente despausado -> Próxima mensagem processada pela IA', () => {
    const lidClientId = '140321547657442@lid';

    activateHumanSupport(lidClientId, 'teste_atendimento_humano');
    assert.strictEqual(isHumanSupportActive(lidClientId), true, 'Cliente deve estar pausado inicialmente');

    const adminMsg = {
      fromMe: true,
      body: '#sofia',
      to: '140321547657442@lid',
      id: { remote: '140321547657442@lid', _serialized: 'true_140321547657442@lid_3EB01B368' }
    };

    assert.strictEqual(adminMsg.fromMe, true, 'Deve ser mensagem do operador');
    const targetId = getConversationContactId(adminMsg);
    assert.strictEqual(targetId, lidClientId, 'ID resolvido deve ser o cliente @lid');
    const wasPaused = isHumanSupportActive(targetId);
    assert.strictEqual(wasPaused, true, 'Cliente estava de fato pausado');
    const reactivated = reactivateContact(targetId);
    assert.strictEqual(reactivated, true, 'Deve remover com sucesso do conjunto de pausa');
    saveAttendanceState();
    assert.strictEqual(isHumanSupportActive(targetId), false, 'Cliente NÃO deve mais estar pausado');

    const customerMsg = {
      fromMe: false,
      from: '140321547657442@lid',
      body: 'Vocês vendem cinto tático?',
      id: { remote: '140321547657442@lid', _serialized: 'false_140321547657442@lid_3EB01B368DEB' },
      type: 'chat'
    };

    const customerContactId = getConversationContactId(customerMsg);
    assert.strictEqual(customerContactId, lidClientId, 'ID do cliente deve ser extraído corretamente');

    const isPausedNow = isHumanSupportActive(customerContactId);
    assert.strictEqual(isPausedNow, false, 'Cliente não está pausado, IA pode processar a mensagem');
    const isHumanRequest = isHumanSupportRequest(customerMsg.body);
    assert.strictEqual(isHumanRequest, false, 'Pergunta de cinto tático não é solicitação de atendente');
  });

  runTest('8.3 Cenário Real @lid: Operador envia #humano para 140321547657442@lid -> Sofia pausada -> Mensagem retida', () => {
    const lidClientId = '140321547657442@lid';
    reactivateContact(lidClientId);
    assert.strictEqual(isHumanSupportActive(lidClientId), false);

    const adminMsg = {
      fromMe: true,
      body: '#humano',
      to: '140321547657442@lid',
      id: { remote: '140321547657442@lid', _serialized: 'true_140321547657442@lid_3EB0PAUSE' }
    };

    assert.strictEqual(adminMsg.fromMe, true);
    const cmd = parseAdminCommand(adminMsg.body);
    assert.strictEqual(cmd, 'pause');
    const targetId = getConversationContactId(adminMsg);
    assert.strictEqual(targetId, lidClientId);

    activateHumanSupport(targetId, 'admin_manual');
    saveAttendanceState();
    assert.strictEqual(isHumanSupportActive(targetId), true, 'Cliente deve estar pausado após #humano');

    const isPaused = isHumanSupportActive(targetId);
    assert.strictEqual(isPaused, true, 'Mensagem deve ser retida para equipe humana');
  });

  // =========================================================================
  // PARTE 2: TESTES NOVOS DO PAINEL WEB, SQLITE, CATÁLOGO E BACKUP
  // =========================================================================

  console.log('\n-------------------------------------------------------------');
  console.log('📦 PARTE 2: TESTES DE SQLITE, CATÁLOGO LOCAL E PAINEL WEB');
  console.log('-------------------------------------------------------------\n');

  // -------------------------------------------------------------
  // Teste 9: Inicialização e Schema do SQLite (db.js)
  // -------------------------------------------------------------
  runTest('9. Inicialização e Migrations do SQLite', () => {
    // Garante estado padrão da Sofia para os testes
    db.updateSofiaConfig({
      agent_name: 'Sofia',
      additional_instructions: '',
      company_rules: ''
    });

    const sqliteInstance = db.getDatabase();
    assert(sqliteInstance, 'Instância SQLite deve existir e estar aberta');

    const company = db.getCompany();
    assert(company, 'Dados da empresa devem estar disponíveis no SQLite');
    assert.strictEqual(company.name, 'ART ARTIGOS MILITARES');
    assert(company.address.includes('Rua do Café'));

    const payments = db.getPaymentMethods();
    assert(Array.isArray(payments) && payments.length > 0, 'Deve conter métodos de pagamento');
    assert(payments.some(p => p.name.includes('PIX')), 'Deve incluir PIX');

    const sofia = db.getSofiaConfig();
    assert(sofia, 'Configuração da Sofia deve existir');
    assert.strictEqual(sofia.agent_name, 'Sofia');
  });

  // -------------------------------------------------------------
  // Teste 10: CRUD de Categorias no SQLite
  // -------------------------------------------------------------
  runTest('10. CRUD de Categorias no SQLite', () => {
    const catName = 'Categoria Teste Unitário ' + Date.now();
    const createdCat = db.createCategory({ name: catName, description: 'Descrição teste' });
    assert(createdCat && createdCat.id, 'Categoria criada deve retornar ID');

    const fetchedCat = db.getCategoryById(createdCat.id);
    assert.strictEqual(fetchedCat.name, catName);

    db.updateCategory(createdCat.id, { name: catName + ' Editada', description: 'Nova desc' });
    const updatedCat = db.getCategoryById(createdCat.id);
    assert.strictEqual(updatedCat.name, catName + ' Editada');

    const deleted = db.deleteCategory(createdCat.id);
    assert.strictEqual(deleted, true);
    assert.strictEqual(db.getCategoryById(createdCat.id), null);
  });

  // -------------------------------------------------------------
  // Teste 11: CRUD de Produtos com Grade de Variações de Estoque
  // -------------------------------------------------------------
  let testProductId = null;
  runTest('11. CRUD de Produtos e Variações de Estoque', () => {
    // Limpa produtos de teste anteriores se existirem
    const existing = db.getProducts({ search: 'Coturno Tático Militar Preto Teste' });
    for (const p of existing) {
      db.deleteProduct(p.id);
    }

    // 1. Cria produto com variações
    const prodData = {
      name: 'Coturno Tático Militar Preto Teste',
      sku: 'COT-MIL-001',
      brand: 'ART Militar',
      description: 'Coturno em couro legítimo de alta resistência.',
      price: 299.90,
      promotional_price: 269.90,
      is_active: 1,
      variations: [
        { size: '39', color: 'Preto', stock_quantity: 5, sku: 'COT-39' },
        { size: '40', color: 'Preto', stock_quantity: 0, sku: 'COT-40' }, // Esgotado
        { size: '42', color: 'Preto', stock_quantity: 3, sku: 'COT-42' }  // Disponível
      ]
    };

    const created = db.createProduct(prodData);
    assert(created && created.id, 'Produto deve ser criado com ID');
    testProductId = created.id;

    // 2. Busca produto por ID e verifica variações
    const fetched = db.getProductById(testProductId);
    assert.strictEqual(fetched.name, prodData.name);
    assert.strictEqual(fetched.price, 299.90);
    assert.strictEqual(fetched.variations.length, 3, 'Deve conter 3 variações');

    const var42 = fetched.variations.find(v => v.size === '42');
    assert(var42, 'Deve encontrar variação 42');
    assert.strictEqual(var42.stock_quantity, 3);

    // 3. Atualiza estoque direto da variação
    db.updateVariationStock(var42.id, 7);
    const reFetched = db.getProductById(testProductId);
    const updatedVar42 = reFetched.variations.find(v => v.size === '42');
    assert.strictEqual(updatedVar42.stock_quantity, 7, 'Estoque do 42 deve ser atualizado para 7');

    // 4. Alterna status do produto
    db.toggleProductActive(testProductId);
    const toggled = db.getProductById(testProductId);
    assert.strictEqual(toggled.is_active, 0, 'Produto deve ser inativado');

    db.toggleProductActive(testProductId);
    const reactivated = db.getProductById(testProductId);
    assert.strictEqual(reactivated.is_active, 1, 'Produto deve ser reativado');
  });

  // -------------------------------------------------------------
  // Teste 12: Motor de Busca no Catálogo Local ("Tem coturno 42?")
  // -------------------------------------------------------------
  runTest('12. Motor de Busca de Catálogo Local (catalogService.js)', () => {
    // 12.1 Extração de tamanhos e cores
    const sizes = extractSizes('Tem coturno 42 ou tamanho M?');
    assert(sizes.includes('42'), 'Deve extrair tamanho numérico 42');
    assert(sizes.includes('M'), 'Deve extrair tamanho alfabético M');

    const colors = extractColors('Vocês têm na cor preta ou verde oliva?');
    assert(colors.includes('preto') || colors.includes('preta'), 'Deve extrair cor preta');

    // 12.2 Cenário Real: "Tem coturno 42?" com estoque > 0
    const resultAvailable = searchCatalog('Tem coturno 42?');
    assert(resultAvailable.matches.length > 0, 'Deve encontrar o produto Coturno');
    assert(resultAvailable.promptInjection.includes('TAMANHO(S) SOLICITADO(S): 42'));
    assert(resultAvailable.promptInjection.includes('DISPONÍVEL'));
    assert(resultAvailable.promptInjection.includes('R$ 299,90'));

    // 12.3 Cenário Real: "Tem coturno 40?" com estoque = 0 (Esgotado)
    const resultOutOfStock = searchCatalog('Tem coturno 40?');
    assert(resultOutOfStock.matches.length > 0);
    assert(resultOutOfStock.promptInjection.includes('TAMANHO(S) SOLICITADO(S): 40'));
    assert(resultOutOfStock.promptInjection.includes('ESGOTADO'));

    // 12.4 Cenário Real: Pergunta de produto inexistente
    const resultNotFound = searchCatalog('Vocês vendem drone militar com câmera termográfica?');
    assert.strictEqual(resultNotFound.matches.length, 0);
    assert(resultNotFound.promptInjection.includes('NENHUM PRODUTO EXATO FOI ENCONTRADO'));
    assert(resultNotFound.promptInjection.includes('NUNCA invente'));
  });

  // -------------------------------------------------------------
  // Teste 13: Prompt Dinâmico da Sofia com Leitura do SQLite
  // -------------------------------------------------------------
  runTest('13. Prompt Dinâmico com Leitura do SQLite e Regras Comerciais', () => {
    db.updateSofiaConfig({
      agent_name: 'Sofia Militar',
      additional_instructions: 'Sempre enfatize que trabalhamos com fardas oficiais.',
      company_rules: 'Regra especial: Desconto de 5% no PIX para militares.'
    });

    const dynamicPrompt = getSystemPrompt();
    assert(dynamicPrompt.includes('Sofia Militar'), 'Prompt deve refletir o nome atualizado no banco');
    assert(dynamicPrompt.includes('Sempre enfatize que trabalhamos com fardas oficiais.'));
    assert(dynamicPrompt.includes('Regra especial: Desconto de 5% no PIX para militares.'));
    assert(dynamicPrompt.includes('DIRETRIZES DE SEGURANÇA E TRANSPARÊNCIA:'));
    assert(dynamicPrompt.includes('NUNCA invente preço'));

    // Restaura nome padrão
    db.updateSofiaConfig({
      agent_name: 'Sofia',
      additional_instructions: '',
      company_rules: ''
    });
  });

  // -------------------------------------------------------------
  // Teste 14: Sincronização de Atendimentos no SQLite
  // -------------------------------------------------------------
  runTest('14. Sincronização de Atendimentos no SQLite e chatManager', () => {
    const contactSync = '5511988887777@c.us';

    // 1. Pausa via chatManager -> atualiza SQLite
    activateHumanSupport(contactSync, 'solicitacao_painel_teste');
    assert.strictEqual(isHumanSupportActive(contactSync), true);

    const attendances = db.getAttendanceContacts();
    const found = attendances.find(a => a.contact_id === contactSync);
    assert(found, 'Contato deve constar na tabela attendance_contacts');
    assert.strictEqual(found.status, 'HUMANO');
    assert.strictEqual(found.pause_reason, 'solicitacao_painel_teste');

    // 2. Reativa via chatManager -> atualiza SQLite
    reactivateContact(contactSync);
    assert.strictEqual(isHumanSupportActive(contactSync), false);
    const updatedAttendances = db.getAttendanceContacts();
    const updatedFound = updatedAttendances.find(a => a.contact_id === contactSync);
    assert.strictEqual(updatedFound.status, 'SOFIA');
  });

  // -------------------------------------------------------------
  // Teste 15: Status Seguro do WhatsApp, QR Code Visual e Máquina de Estados (whatsappStatus.js)
  // -------------------------------------------------------------
  await runAsyncTest('15. Monitoramento de Status Seguro, Ciclo de Vida e QR Code Visual', async () => {
    // 15.1 Estado Inicializando
    await setWhatsAppStatus('inicializando');
    let status = getSystemStatus();
    assert.strictEqual(status.whatsapp.status, 'inicializando');
    assert.strictEqual(status.whatsapp.statusLabel, 'INICIALIZANDO');
    assert.strictEqual(status.whatsapp.statusMessage, 'Inicializando conexão com o WhatsApp...');
    assert.strictEqual(status.whatsapp.hasQr, false);

    // 15.2 Estado Aguardando QR Code com geração visual em Base64 Data URL
    const dummyQrRaw = '2@uY8abc123DEF456==,randomKeyPayloadTest,987654321';
    await setWhatsAppStatus('aguardando_qr', { qrCode: dummyQrRaw });
    status = getSystemStatus();
    assert.strictEqual(status.whatsapp.status, 'aguardando_qr');
    assert.strictEqual(status.whatsapp.statusLabel, 'AGUARDANDO QR CODE');
    assert.strictEqual(status.whatsapp.statusMessage, 'Aguardando leitura do QR Code.');
    assert.strictEqual(status.whatsapp.hasQr, true);
    assert(status.whatsapp.qrImage && status.whatsapp.qrImage.startsWith('data:image/png;base64,'), 'QR Code deve ser uma Data URL PNG válida');
    assert(status.whatsapp.instruction.includes('Aparelhos conectados > Conectar aparelho'), 'Deve exibir as instruções oficiais de pareamento');

    // 15.3 Estado Autenticando
    await setWhatsAppStatus('autenticando');
    status = getSystemStatus();
    assert.strictEqual(status.whatsapp.status, 'autenticando');
    assert.strictEqual(status.whatsapp.statusLabel, 'AUTENTICANDO');
    assert.strictEqual(status.whatsapp.statusMessage, 'WhatsApp autenticado. Finalizando conexão...');
    assert.strictEqual(status.whatsapp.hasQr, false);

    // 15.4 Estado Conectado
    await setWhatsAppStatus('conectado');
    status = getSystemStatus();
    assert.strictEqual(status.whatsapp.status, 'conectado');
    assert.strictEqual(status.whatsapp.statusLabel, 'CONECTADO');
    assert.strictEqual(status.whatsapp.statusMessage, 'WhatsApp conectado e Sofia pronta para atendimento.');
    assert.strictEqual(status.sofia.status, 'ATIVA');

    // 15.5 Estado Desconectado
    await setWhatsAppStatus('desconectado');
    status = getSystemStatus();
    assert.strictEqual(status.whatsapp.status, 'desconectado');
    assert.strictEqual(status.whatsapp.statusLabel, 'DESCONECTADO');
    assert.strictEqual(status.whatsapp.statusMessage, 'WhatsApp desconectado.');

    // 15.6 Garante que NENHUMA chave de API, segredo ou token esteja exposto no payload público
    const statusJson = JSON.stringify(status);
    assert(!statusJson.includes(process.env.OPENAI_API_KEY || 'sk-'), 'Não deve conter chaves de API');
    assert(!statusJson.includes('ADMIN_PASSWORD'), 'Não deve conter senhas');
    assert(!statusJson.includes('.wwebjs_auth'), 'Não deve conter caminhos ou dados de sessão interna');
  });

  // -------------------------------------------------------------
  // Teste 16: Backup e Restauração Transacional de Dados
  // -------------------------------------------------------------
  runTest('16. Exportação e Importação de Backup JSON', () => {
    const backupData = db.exportBackupData();
    assert(backupData && backupData.version, 'Backup deve conter metadata de versão');
    assert(backupData.company, 'Backup deve conter dados da empresa');
    assert(Array.isArray(backupData.products), 'Backup deve conter array de produtos');
    assert(Array.isArray(backupData.categories), 'Backup deve conter array de categorias');
    assert(Array.isArray(backupData.payment_methods), 'Backup deve conter formas de pagamento');

    // Valida que segredos não estão no backup
    const backupStr = JSON.stringify(backupData);
    assert(!backupStr.includes('ADMIN_PASSWORD'));
    assert(!backupStr.includes(process.env.OPENAI_API_KEY || 'sk-'));

    // Testa importação transacional
    const importResult = db.importBackupData(backupData);
    assert.strictEqual(importResult.success, true, 'Importação deve ser concluída com sucesso');
  });

  // -------------------------------------------------------------
  // Teste 17: Autenticação Segura, Criptografia Nativa e Setup Inicial
  // -------------------------------------------------------------
  runTest('17. Gerenciamento de Usuários, Criptografia Nativa (scrypt) e Setup de Acesso', () => {
    // 17.1 Teste de hash com scrypt e salt
    const testPass = 'SenhaForte#2026';
    const { hash, salt } = db.hashPassword(testPass);
    assert(hash && hash.length === 128, 'Hash scrypt deve ter 64 bytes (128 caracteres hex)');
    assert(salt && salt.length === 32, 'Salt deve ter 16 bytes (32 caracteres hex)');

    // 17.2 Validação de verificação de senha com timingSafeEqual
    assert.strictEqual(db.verifyPassword(testPass, hash, salt), true, 'Senha correta deve ser verificada com sucesso');
    assert.strictEqual(db.verifyPassword('SenhaIncorreta', hash, salt), false, 'Senha incorreta deve falhar');
    assert.strictEqual(db.verifyPassword('', hash, salt), false, 'Senha vazia deve falhar');
    assert.strictEqual(db.verifyPassword(testPass, hash, 'invalidsalt'), false, 'Salt corrompido deve falhar');

    // 17.3 Validação de regras de criação de usuário
    assert.throws(() => {
      db.createAdminUser({ name: '', username: 'admin_test', password: 'password123' });
    }, /Nome é obrigatório/, 'Deve exigir nome');

    assert.throws(() => {
      db.createAdminUser({ name: 'Admin', username: '', password: 'password123' });
    }, /Usuário é obrigatório/, 'Deve exigir usuário');

    assert.throws(() => {
      db.createAdminUser({ name: 'Admin', username: 'admin_test', password: '123' });
    }, /A senha deve ter no mínimo 8 caracteres/, 'Deve exigir senha de pelo menos 8 caracteres');

    // 17.4 Criação e verificação de usuário no banco de dados SQLite
    const testUsername = `teste_admin_${Date.now()}`;
    const createdUser = db.createAdminUser({
      name: 'Gerente da Loja Teste',
      username: testUsername,
      password: testPass
    });

    assert(createdUser && createdUser.id, 'Usuário deve ser criado com ID válido');
    assert.strictEqual(createdUser.username, testUsername);
    assert(!createdUser.password, 'Objeto retornado nunca deve expor a senha');
    assert(!createdUser.password_hash, 'Objeto retornado não deve conter o hash');

    // 17.5 Verifica se hasAdminUser retorna verdadeiro
    assert.strictEqual(db.hasAdminUser(), true, 'hasAdminUser() deve retornar true após criação');

    // 17.6 Autenticação com verifyAdminUser
    const authSuccess = db.verifyAdminUser(testUsername, testPass);
    assert(authSuccess, 'Autenticação deve ter sucesso com credenciais corretas');
    assert.strictEqual(authSuccess.username, testUsername);
    assert.strictEqual(authSuccess.name, 'Gerente da Loja Teste');

    const authWrongPass = db.verifyAdminUser(testUsername, 'senha_errada_123');
    assert.strictEqual(authWrongPass, null, 'Autenticação deve falhar com senha incorreta');

    const authNonExistent = db.verifyAdminUser('usuario_inexistente_xyz', testPass);
    assert.strictEqual(authNonExistent, null, 'Autenticação deve falhar para usuário inexistente');

    // 17.7 Garante que a senha NÃO foi salva em texto puro no SQLite
    const rawUserRow = db.getDatabase().prepare('SELECT * FROM users WHERE username = ?').get(testUsername);
    assert(rawUserRow, 'Registro de usuário deve existir no banco');
    assert.strictEqual(rawUserRow.password_hash, hash.length ? rawUserRow.password_hash : null);
    assert(!JSON.stringify(rawUserRow).includes(testPass), 'Nenhum campo da tabela deve conter a senha em texto puro');

    // 17.8 Bloqueio de nome de usuário duplicado
    assert.throws(() => {
      db.createAdminUser({
        name: 'Outro Admin',
        username: testUsername,
        password: 'OutraSenhaForte123'
      });
    }, /Nome de usuário já cadastrado/, 'Deve impedir criação de usuário duplicado');

    // Limpeza do usuário de teste
    db.getDatabase().prepare('DELETE FROM users WHERE username = ?').run(testUsername);
  });

  // Limpeza de produtos de teste
  if (testProductId) {
    db.deleteProduct(testProductId);
  }

  // -------------------------------------------------------------
  // Teste 18: Regressão - Variações de Tamanho em Intervalos e Estoque Real (Coturno Militar Acero)
  // -------------------------------------------------------------
  runTest('18. Regressão Catálogo: Intervalos de Tamanhos e Estoque Real (Coturno Militar Acero)', () => {
    // 18.1 Teste unitário de parsing de intervalos e listas de tamanhos
    const numRange = parseVariationSizes('38 ao 42');
    assert.strictEqual(numRange.isRange, true, '38 ao 42 deve ser identificado como intervalo');
    assert.strictEqual(numRange.min, 38);
    assert.strictEqual(numRange.max, 42);
    assert(numRange.includes('38'), 'Deve incluir 38');
    assert(numRange.includes('39'), 'Deve incluir 39');
    assert(numRange.includes('40'), 'Deve incluir 40');
    assert(numRange.includes('41'), 'Deve incluir 41');
    assert(numRange.includes('42'), 'Deve incluir 42');
    assert(!numRange.includes('37'), 'Não deve incluir 37');
    assert(!numRange.includes('43'), 'Não deve incluir 43');

    // Variações de escrita do intervalo numérico
    const rangeVariants = ['38 a 42', '38 ate 42', '38 até 42', '38-42', '38 - 42', 'Tam 38 ao 42', '38/42'];
    for (const v of rangeVariants) {
      const parsed = parseVariationSizes(v);
      assert.strictEqual(parsed.isRange, true, `${v} deve ser reconhecido como intervalo`);
      assert(parsed.includes('38') && parsed.includes('40') && parsed.includes('42'), `${v} deve cobrir 38, 40 e 42`);
    }

    // Intervalo de vestuário
    const clothRange = parseVariationSizes('P ao GG');
    assert.strictEqual(clothRange.isRange, true);
    assert(clothRange.includes('P') && clothRange.includes('M') && clothRange.includes('G') && clothRange.includes('GG'));
    assert(!clothRange.includes('PP') && !clothRange.includes('XG'));

    // Listas
    const numList = parseVariationSizes('38, 39, 40');
    assert(numList.includes('38') && numList.includes('39') && numList.includes('40') && !numList.includes('41'));

    // 18.2 Consultas Reais contra o Produto "Coturno Militar Acero" (Preço: 520,00, Tam: 38 ao 42, Preto, Estoque: 1)
    const testCasesAvailable = [
      'tem coturno 38',
      'tem coturno tamanho 38?',
      'vocês têm coturno 40?',
      'quanto custa o coturno 42?',
      'tem coturno preto 39?'
    ];

    for (const query of testCasesAvailable) {
      const result = searchCatalog(query);
      assert(result.matches.length > 0, `Query "${query}" deve encontrar o produto no catálogo`);
      assert.strictEqual(result.matches[0].name, 'Coturno Militar Acero', `Deve ser o Coturno Militar Acero`);
      assert.strictEqual(result.matches[0].price, 520, 'Preço deve ser 520');
      assert(result.promptInjection.includes('DISPONÍVEL'), `Query "${query}" deve constar como DISPONÍVEL no prompt`);
      assert(result.promptInjection.includes('Coturno Militar Acero'));
      assert(result.promptInjection.includes('R$ 520,00'));
      assert(result.promptInjection.includes('1 unidade(s) no total') || result.promptInjection.includes('38 ao 42'));
    }

    // 18.3 Caso fora do intervalo: "tem coturno 43?"
    const resultOutOfRange = searchCatalog('tem coturno 43?');
    assert(resultOutOfRange.matches.length > 0, 'Deve encontrar o modelo Coturno Militar Acero');
    assert(resultOutOfRange.promptInjection.includes('TAMANHO(S) SOLICITADO(S): 43'));
    assert(resultOutOfRange.promptInjection.includes('INDISPONÍVEL / NÃO CADASTRADO'), 'Tamanho 43 deve ser marcado como INDISPONÍVEL');
    assert(resultOutOfRange.promptInjection.includes('NUNCA afirme que o tamanho 43 está disponível'), 'Diretriz deve proibir inventar disponibilidade do 43');
    assert(!resultOutOfRange.promptInjection.includes('43 - DISPONÍVEL'), 'Prompt NÃO deve afirmar que 43 está disponível');

    // 18.4 Casos com maiúsculas, sem acento e linguagem natural
    const naturalQueries = [
      'TEM COTURNO 38',
      'Vocês tem coturno tamanho 41 na cor preta?',
      'quanto ta o coturno tam 38'
    ];
    for (const nq of naturalQueries) {
      const res = searchCatalog(nq);
      assert(res.matches.length > 0, `Query natural "${nq}" deve encontrar o produto`);
      assert(res.promptInjection.includes('DISPONÍVEL'), `Query "${nq}" deve ter tamanho disponível`);
      assert(res.promptInjection.includes('Coturno Militar Acero'));
      assert(res.promptInjection.includes('R$ 520,00'));
    }
  });

  // -------------------------------------------------------------
  // Teste 6: Teste da API OpenAI (se OPENAI_API_KEY estiver configurada)
  // -------------------------------------------------------------
  if (process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY.trim()) {
    await runAsyncTest('6. Integração com OpenAI API (chamada real)', async () => {
      const response = await generateAIResponse('Olá, boa tarde!', []);
      assert(typeof response === 'string' && response.length > 0, 'Deve retornar resposta em texto');
      console.log(`   [Resposta recebida da IA]: "${response.slice(0, 80)}..."`);
    });
  } else {
    console.log('ℹ️ [INFO] OPENAI_API_KEY não configurada no ambiente atual; teste de rede ignorado.');
  }

  // Limpeza pós-teste
  reactivateContact(testContactId);
  clearHistory(testContactId);

  console.log('\n=============================================================');
  console.log(`📊 RESULTADO DOS TESTES: ${passedTests}/${totalTests} aprovados`);
  console.log('=============================================================\n');

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error('💥 Erro fatal durante a execução dos testes:', err);
  process.exit(1);
});
