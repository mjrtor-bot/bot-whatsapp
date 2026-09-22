/**
 * server.js
 *
 * Servidor HTTP Express para o Painel Administrativo Web do Bot WhatsApp.
 * Gerencia autenticação de sessão, APIs REST de controle comercial e catálogo,
 * status em tempo real e exportação/importação de backups.
 */

const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const path = require('path');
const db = require('./db');
const { getSystemStatus, disconnectWhatsApp, reconnectWhatsApp } = require('./whatsappStatus');
const chatManager = require('./chatManager');

const app = express();

// Middlewares essenciais
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Sessão administrativa
const sessionSecret = process.env.SESSION_SECRET || 'art_artigos_militares_admin_secret_session_2026';
app.use(session({
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: false, // Permite rodar em localhost / HTTP local
    maxAge: 24 * 60 * 60 * 1000 // 24 horas
  }
}));

// Middleware de verificação de autenticação
function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) {
    return next();
  }

  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Acesso não autorizado. Faça login primeiro.' });
  }

  if (!db.hasAdminUser()) {
    return res.redirect('/setup.html');
  }

  return res.redirect('/login.html');
}

// ==================================================
// ROTAS DE AUTENTICAÇÃO PÚBLICAS
// ==================================================

app.get('/api/auth/setup-status', (req, res) => {
  try {
    const hasAdmin = db.hasAdminUser();
    return res.json({ setupRequired: !hasAdmin });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao verificar status de acesso: ' + err.message });
  }
});

app.post('/api/auth/setup', (req, res) => {
  try {
    if (db.hasAdminUser()) {
      return res.status(400).json({ error: 'O sistema já possui um administrador configurado.' });
    }

    const { name, username, password, confirmPassword } = req.body || {};

    if (!name || !name.trim() || !username || !username.trim() || !password) {
      return res.status(400).json({ error: 'Todos os campos são obrigatórios.' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'A senha deve ter no mínimo 8 caracteres.' });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ error: 'A confirmação de senha não confere.' });
    }

    const user = db.createAdminUser({ name, username, password });
    return res.status(201).json({
      success: true,
      message: 'Administrador configurado com sucesso! Redirecionando para login...',
      user
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};

  if (!db.hasAdminUser()) {
    return res.status(400).json({
      error: 'Nenhum administrador configurado. Configure seu acesso primeiro.',
      setupRequired: true
    });
  }

  if (!username || !password) {
    return res.status(400).json({ error: 'Usuário e senha são obrigatórios.' });
  }

  const user = db.verifyAdminUser(username, password);
  if (user) {
    req.session.authenticated = true;
    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.name = user.name;
    req.session.loginTime = new Date().toISOString();

    return res.json({
      success: true,
      user: {
        username: user.username,
        name: user.name,
        loginTime: req.session.loginTime
      }
    });
  }

  return res.status(401).json({ error: 'Credenciais inválidas. Verifique seu usuário e senha.' });
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.status(500).json({ error: 'Erro ao encerrar sessão.' });
    }
    res.clearCookie('connect.sid');
    return res.json({ success: true, message: 'Sessão encerrada com sucesso.' });
  });
});

app.get('/api/auth/me', (req, res) => {
  if (req.session && req.session.authenticated) {
    return res.json({
      authenticated: true,
      user: {
        username: req.session.username,
        name: req.session.name,
        loginTime: req.session.loginTime
      }
    });
  }
  return res.json({ authenticated: false });
});

// Arquivos públicos estáticos para tela de login e setup
app.use(express.static(path.join(__dirname, 'public'), {
  index: false // Desabilita index automático para proteger rota raiz
}));

// Rota raiz protegida: redireciona para index autenticado, setup ou login
app.get('/', (req, res) => {
  if (req.session && req.session.authenticated) {
    return res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
  if (!db.hasAdminUser()) {
    return res.redirect('/setup.html');
  }
  return res.redirect('/login.html');
});

// ==================================================
// ROTAS DE API PROTEGIDAS (/api/*)
// ==================================================

// Status do sistema e métricas gerais para o Dashboard
app.get('/api/status', requireAuth, (req, res) => {
  try {
    const systemStatus = getSystemStatus();
    const metrics = db.getDashboardMetrics();

    return res.json({
      success: true,
      system: systemStatus,
      metrics
    });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao obter status do sistema: ' + err.message });
  }
});

// Desconexão manual do WhatsApp
app.post('/api/whatsapp/disconnect', requireAuth, async (req, res) => {
  try {
    const result = await disconnectWhatsApp();
    return res.json({
      success: true,
      message: result && result.message ? result.message : 'WhatsApp desconectado com sucesso.'
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Erro ao desconectar WhatsApp: ' + err.message });
  }
});

// Reconexão manual do WhatsApp
app.post('/api/whatsapp/reconnect', requireAuth, async (req, res) => {
  try {
    const result = await reconnectWhatsApp();
    return res.json({
      success: true,
      message: result && result.message ? result.message : 'Inicializando reconexão com o WhatsApp.'
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: 'Erro ao reconectar WhatsApp: ' + err.message });
  }
});

// --------------------------------------------------
// EMPRESA E FORMAS DE PAGAMENTO
// --------------------------------------------------

app.get('/api/company', requireAuth, (req, res) => {
  try {
    const company = db.getCompany();
    const paymentMethods = db.getPaymentMethods();
    return res.json({
      success: true,
      company,
      paymentMethods
    });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao carregar dados da empresa: ' + err.message });
  }
});

app.put('/api/company', requireAuth, (req, res) => {
  try {
    const { company, paymentMethods } = req.body || {};

    if (company && typeof company === 'object') {
      db.updateCompany(company);
    }

    if (paymentMethods && Array.isArray(paymentMethods)) {
      db.syncPaymentMethods(paymentMethods);
    }

    const updatedCompany = db.getCompany();
    const updatedPayments = db.getPaymentMethods();

    return res.json({
      success: true,
      message: 'Dados da empresa e formas de pagamento salvos com sucesso.',
      company: updatedCompany,
      paymentMethods: updatedPayments
    });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao atualizar dados da empresa: ' + err.message });
  }
});

// --------------------------------------------------
// CATEGORIAS
// --------------------------------------------------

app.get('/api/categories', requireAuth, (req, res) => {
  try {
    const categories = db.getAllCategories();
    return res.json({ success: true, categories });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao listar categorias: ' + err.message });
  }
});

app.post('/api/categories', requireAuth, (req, res) => {
  try {
    const { name, description } = req.body || {};
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'O nome da categoria é obrigatório.' });
    }

    const category = db.createCategory({ name, description });
    return res.status(201).json({ success: true, category });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

app.put('/api/categories/:id', requireAuth, (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { name, description } = req.body || {};
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'O nome da categoria é obrigatório.' });
    }

    const category = db.updateCategory(id, { name, description });
    return res.json({ success: true, category });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

app.delete('/api/categories/:id', requireAuth, (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    db.deleteCategory(id);
    return res.json({ success: true, message: 'Categoria excluída com sucesso.' });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// --------------------------------------------------
// PRODUTOS E VARIAÇÕES
// --------------------------------------------------

app.get('/api/products', requireAuth, (req, res) => {
  try {
    const filters = {
      search: req.query.search,
      category_id: req.query.category_id,
      is_active: req.query.is_active !== undefined ? parseInt(req.query.is_active, 10) : undefined
    };

    const products = db.getAllProducts(filters);
    return res.json({ success: true, products });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao listar produtos: ' + err.message });
  }
});

app.get('/api/products/:id', requireAuth, (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const product = db.getProductById(id);
    if (!product) {
      return res.status(404).json({ error: 'Produto não encontrado.' });
    }
    return res.json({ success: true, product });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/products', requireAuth, (req, res) => {
  try {
    const productData = req.body || {};
    if (!productData.name || !productData.name.trim()) {
      return res.status(400).json({ error: 'O nome do produto é obrigatório.' });
    }

    const created = db.createProduct(productData);
    return res.status(201).json({ success: true, product: created });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

app.put('/api/products/:id', requireAuth, (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const productData = req.body || {};
    if (!productData.name || !productData.name.trim()) {
      return res.status(400).json({ error: 'O nome do produto é obrigatório.' });
    }

    const updated = db.updateProduct(id, productData);
    return res.json({ success: true, product: updated });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

app.delete('/api/products/:id', requireAuth, (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    db.deleteProduct(id);
    return res.json({ success: true, message: 'Produto excluído com sucesso.' });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

app.patch('/api/products/:id/toggle', requireAuth, (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const product = db.getProductById(id);
    if (!product) {
      return res.status(404).json({ error: 'Produto não encontrado.' });
    }

    const newActiveState = product.is_active === 1 ? 0 : 1;
    const updated = db.updateProduct(id, { ...product, is_active: newActiveState });

    return res.json({ success: true, product: updated });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

app.patch('/api/products/:id/variations/:varId/stock', requireAuth, (req, res) => {
  try {
    const varId = parseInt(req.params.varId, 10);
    const { stock_quantity } = req.body || {};

    if (stock_quantity === undefined || isNaN(parseInt(stock_quantity, 10))) {
      return res.status(400).json({ error: 'Quantidade de estoque inválida.' });
    }

    db.updateVariationStock(varId, parseInt(stock_quantity, 10));
    return res.json({ success: true, message: 'Estoque da variação atualizado com sucesso.' });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// --------------------------------------------------
// CONFIGURAÇÕES DA SOFIA
// --------------------------------------------------

app.get('/api/sofia/config', requireAuth, (req, res) => {
  try {
    const config = db.getSofiaConfig();
    return res.json({ success: true, config });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao obter configurações da Sofia: ' + err.message });
  }
});

app.put('/api/sofia/config', requireAuth, (req, res) => {
  try {
    const configData = req.body || {};
    const updated = db.updateSofiaConfig(configData);
    return res.json({
      success: true,
      message: 'Configurações da Sofia salvas com sucesso.',
      config: updated
    });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// --------------------------------------------------
// ATENDIMENTOS (CONTATOS E CONTROLE HUMANO / SOFIA)
// --------------------------------------------------

app.get('/api/attendances', requireAuth, (req, res) => {
  try {
    // Sincroniza e obtém todos os contatos
    const contacts = db.getAllAttendanceContacts();
    return res.json({ success: true, contacts });
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao carregar atendimentos: ' + err.message });
  }
});

app.post('/api/attendances/:contactId/human', requireAuth, (req, res) => {
  try {
    const contactId = decodeURIComponent(req.params.contactId);
    if (!contactId) {
      return res.status(400).json({ error: 'ID do contato é obrigatório.' });
    }

    chatManager.pauseForHuman(contactId, 'Transferido manualmente via Painel Web');
    const updatedContact = db.getAttendanceContact(contactId);

    return res.json({
      success: true,
      message: `Atendimento transferido para equipe humana com sucesso.`,
      contact: updatedContact
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/attendances/:contactId/sofia', requireAuth, (req, res) => {
  try {
    const contactId = decodeURIComponent(req.params.contactId);
    if (!contactId) {
      return res.status(400).json({ error: 'ID do contato é obrigatório.' });
    }

    chatManager.resumeSofia(contactId);
    const updatedContact = db.getAttendanceContact(contactId);

    return res.json({
      success: true,
      message: `Atendimento da Sofia reativado com sucesso.`,
      contact: updatedContact
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// --------------------------------------------------
// BACKUP E RESTAURAÇÃO DE DADOS
// --------------------------------------------------

app.get('/api/backup/export', requireAuth, (req, res) => {
  try {
    const backupData = db.exportBackup();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="backup-art-artigos-militares-${Date.now()}.json"`);
    return res.send(JSON.stringify(backupData, null, 2));
  } catch (err) {
    return res.status(500).json({ error: 'Erro ao gerar backup: ' + err.message });
  }
});

app.post('/api/backup/import', requireAuth, (req, res) => {
  try {
    const backupData = req.body;
    if (!backupData || typeof backupData !== 'object') {
      return res.status(400).json({ error: 'Arquivo de backup inválido ou vazio.' });
    }

    const result = db.importBackup(backupData);
    return res.json({
      success: true,
      message: 'Backup restaurado com sucesso!',
      result
    });
  } catch (err) {
    return res.status(400).json({ error: 'Falha ao importar backup: ' + err.message });
  }
});

// ==================================================
// INICIALIZAÇÃO DO SERVIDOR
// ==================================================

function startServer(port = process.env.PORT || 3000) {
  return new Promise((resolve, reject) => {
    // Garante que o banco de dados e schema estão prontos
    db.initDatabase();

    const server = app.listen(port, () => {
      console.log(`\x1b[32m[PAINEL WEB] Painel Administrativo iniciado com sucesso em http://localhost:${port}\x1b[0m`);
      resolve(server);
    });

    server.on('error', (err) => {
      console.error(`\x1b[31m[PAINEL WEB] Erro ao iniciar servidor na porta ${port}:\x1b[0m`, err.message);
      reject(err);
    });
  });
}

if (require.main === module) {
  startServer();
}

module.exports = {
  app,
  startServer
};
