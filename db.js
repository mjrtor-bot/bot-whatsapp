/**
 * db.js
 *
 * Camada de persistência e banco de dados SQLite para o agente WhatsApp Sofia
 * e o Painel Administrativo Web da ART ARTIGOS MILITARES.
 *
 * Utiliza o módulo nativo node:sqlite (DatabaseSync) disponível no Node.js.
 */

const { DatabaseSync } = require('node:sqlite');
const crypto = require('node:crypto');
const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'bot-whatsapp.db');
const ATTENDANCE_JSON_PATH = path.join(DATA_DIR, 'attendance-state.json');

let dbInstance = null;

/**
 * Retorna a instância do banco de dados SQLite aberta e com tabelas criadas.
 * @param {string} [customPath] Caminho alternativo para testes em memória ou temporários
 * @returns {DatabaseSync}
 */
function getDatabase(customPath) {
  if (customPath) {
    const customDb = new DatabaseSync(customPath);
    initSchema(customDb);
    return customDb;
  }

  if (!dbInstance) {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    dbInstance = new DatabaseSync(DB_PATH);
    initSchema(dbInstance);
    seedInitialData(dbInstance);
  }
  return dbInstance;
}

function initDatabase() {
  return getDatabase();
}

/**
 * Criação das tabelas no SQLite.
 * @param {DatabaseSync} db
 */
function initSchema(db) {
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS company (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      name TEXT NOT NULL,
      fantasy_name TEXT,
      description TEXT,
      segment TEXT,
      address TEXT,
      number TEXT,
      complement TEXT,
      neighborhood TEXT,
      city TEXT,
      state TEXT,
      zip_code TEXT,
      phone TEXT,
      whatsapp TEXT,
      email TEXT,
      website TEXT,
      instagram TEXT,
      opening_hours TEXT,
      business_hours TEXT,
      notes TEXT,
      service_policy TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS payment_methods (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      details TEXT
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sku TEXT UNIQUE,
      name TEXT NOT NULL,
      category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      brand TEXT,
      description TEXT,
      price REAL NOT NULL DEFAULT 0.0,
      promo_price REAL,
      is_active INTEGER NOT NULL DEFAULT 1,
      image_url TEXT,
      notes TEXT,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS product_variations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      size TEXT,
      color TEXT,
      stock_quantity INTEGER NOT NULL DEFAULT 0,
      sku_variation TEXT
    );

    CREATE TABLE IF NOT EXISTS sofia_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      agent_name TEXT NOT NULL DEFAULT 'Sofia',
      initial_message TEXT,
      tone TEXT DEFAULT 'comercial, educado e objetivo',
      max_response_length TEXT DEFAULT 'curto (2 a 3 frases)',
      additional_instructions TEXT,
      transfer_message TEXT,
      unavailable_message TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      company_rules TEXT,
      company_additional_rules TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS attendance_contacts (
      contact_id TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'SOFIA',
      paused_reason TEXT,
      pause_reason TEXT,
      last_activity TEXT,
      created_at TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      created_at TEXT,
      updated_at TEXT
    );
  `);

  // Migrações dinâmicas de colunas para bancos existentes
  const ensureCol = (table, col, type) => {
    try {
      const cols = db.prepare(`PRAGMA table_info(${table})`).all();
      if (!cols.some(c => c.name === col)) {
        db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
      }
    } catch (_) {}
  };

  ensureCol('company', 'opening_hours', 'TEXT');
  ensureCol('company', 'business_hours', 'TEXT');
  ensureCol('sofia_config', 'company_rules', 'TEXT');
  ensureCol('sofia_config', 'company_additional_rules', 'TEXT');
  ensureCol('attendance_contacts', 'paused_reason', 'TEXT');
  ensureCol('attendance_contacts', 'pause_reason', 'TEXT');
}

/**
 * Realiza o seed inicial apenas se o banco estiver vazio.
 * Nunca sobrescreve dados já alterados pelo operador.
 * @param {DatabaseSync} db
 */
function seedInitialData(db) {
  // 1. Dados da Empresa
  const companyRow = db.prepare('SELECT id FROM company WHERE id = 1').get();
  if (!companyRow) {
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO company (
        id, name, fantasy_name, description, segment, address, number, complement,
        neighborhood, city, state, zip_code, phone, whatsapp, email, website,
        instagram, opening_hours, business_hours, notes, service_policy, updated_at
      ) VALUES (
        1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `).run(
      'ART ARTIGOS MILITARES',
      'ART Artigos Militares',
      'Comércio de artigos e acessórios destinados ao público militar.',
      'Artigos e Acessórios Militares',
      'Rua do Café',
      '123',
      '',
      'Centro',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      'Das 08h às 18h.',
      'Das 08h às 18h.',
      'Atendimento e Venda de Artigos Militares.',
      'Atendimento comercial humanizado com transparência e rapidez.',
      now
    );
  }

  // 2. Formas de Pagamento Padrão
  const countPayments = db.prepare('SELECT COUNT(*) as count FROM payment_methods').get();
  if (countPayments.count === 0) {
    const defaultMethods = [
      { name: 'PIX', is_active: 1, details: 'Chave e QR Code disponíveis no fechamento' },
      { name: 'Cartão de Crédito', is_active: 1, details: 'Principais bandeiras aceitas' },
      { name: 'Cartão de Débito', is_active: 1, details: 'À vista' },
      { name: 'Dinheiro', is_active: 1, details: 'Pagamento na retirada/loja física' },
      { name: 'Parcelamento', is_active: 1, details: 'Consulte condições de parcelamento no cartão' },
      { name: 'Boleto', is_active: 0, details: 'Mediante aprovação cadastral' }
    ];
    const insertPayment = db.prepare('INSERT OR IGNORE INTO payment_methods (name, is_active, details) VALUES (?, ?, ?)');
    for (const m of defaultMethods) {
      insertPayment.run(m.name, m.is_active, m.details);
    }
  }

  // 3. Configurações da Sofia
  const sofiaRow = db.prepare('SELECT id FROM sofia_config WHERE id = 1').get();
  if (!sofiaRow) {
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO sofia_config (
        id, agent_name, initial_message, tone, max_response_length,
        additional_instructions, transfer_message, unavailable_message,
        is_active, company_rules, company_additional_rules, updated_at
      ) VALUES (
        1, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?
      )
    `).run(
      'Sofia',
      'Olá! Sou a Sofia, atendente virtual da ART ARTIGOS MILITARES. Como posso ajudar você hoje?',
      'comercial, educado, ágil e objetivo',
      'curto (máximo 2 a 3 frases por resposta)',
      'Seja sempre simpática, responda às dúvidas com clareza e ajude os clientes a encontrar os produtos que procuram.',
      'Entendi! Estou transferindo seu atendimento para a nossa equipe. Um de nossos vendedores entrará em contato com você em breve por aqui.',
      'Nosso assistente virtual está temporariamente indisponível. Um de nossos atendentes entrará em contato com você em breve.',
      '',
      '',
      now
    );
  }

  // 4. Migração segura do attendance-state.json existente
  try {
    if (fs.existsSync(ATTENDANCE_JSON_PATH)) {
      const raw = fs.readFileSync(ATTENDANCE_JSON_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.pausedContacts)) {
        const now = new Date().toISOString();
        const insertContact = db.prepare(`
          INSERT INTO attendance_contacts (contact_id, status, paused_reason, pause_reason, last_activity, created_at, updated_at)
          VALUES (?, 'HUMANO', 'migracao_json', 'migracao_json', ?, ?, ?)
          ON CONFLICT(contact_id) DO NOTHING
        `);
        for (const cid of parsed.pausedContacts) {
          if (cid && typeof cid === 'string' && cid.trim()) {
            insertContact.run(cid.trim(), parsed.updatedAt || now, now, now);
          }
        }
      }
    }
  } catch (err) {
    console.error('[ERRO DB]: Falha ao migrar attendance-state.json inicial:', err.message || err);
  }
}

// =========================================================================
// OPERAÇÕES: DADOS DA EMPRESA E FORMAS DE PAGAMENTO
// =========================================================================

function getCompany(db = getDatabase()) {
  const company = db.prepare('SELECT * FROM company WHERE id = 1').get() || {};
  return {
    ...company,
    business_hours: company.business_hours || company.opening_hours || 'Das 08h às 18h.'
  };
}

function getCompanyData(db = getDatabase()) {
  const company = getCompany(db);
  const paymentMethods = getPaymentMethods({}, db);
  return {
    ...company,
    paymentMethods
  };
}

function updateCompany(data, db = getDatabase()) {
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE company SET
      name = ?,
      fantasy_name = ?,
      description = ?,
      segment = ?,
      address = ?,
      number = ?,
      complement = ?,
      neighborhood = ?,
      city = ?,
      state = ?,
      zip_code = ?,
      phone = ?,
      whatsapp = ?,
      email = ?,
      website = ?,
      instagram = ?,
      opening_hours = ?,
      business_hours = ?,
      notes = ?,
      service_policy = ?,
      updated_at = ?
    WHERE id = 1
  `).run(
    data.name || '',
    data.fantasy_name || '',
    data.description || '',
    data.segment || '',
    data.address || '',
    data.number || '',
    data.complement || '',
    data.neighborhood || '',
    data.city || '',
    data.state || '',
    data.zip_code || '',
    data.phone || '',
    data.whatsapp || '',
    data.email || '',
    data.website || '',
    data.instagram || '',
    data.opening_hours || data.business_hours || '',
    data.business_hours || data.opening_hours || '',
    data.notes || '',
    data.service_policy || '',
    now
  );

  return getCompany(db);
}

function updateCompanyData(data, db = getDatabase()) {
  updateCompany(data, db);
  if (Array.isArray(data.paymentMethods)) {
    syncPaymentMethods(data.paymentMethods, db);
  }
  return getCompanyData(db);
}

function getPaymentMethods(filters = {}, db = getDatabase()) {
  let query = 'SELECT * FROM payment_methods';
  const params = [];
  if (filters.is_active !== undefined) {
    query += ' WHERE is_active = ?';
    params.push(filters.is_active ? 1 : 0);
  }
  query += ' ORDER BY id ASC';
  return db.prepare(query).all(...params);
}

function syncPaymentMethods(methodsArray, db = getDatabase()) {
  if (!Array.isArray(methodsArray)) return;
  for (const pm of methodsArray) {
    if (pm.id) {
      db.prepare('UPDATE payment_methods SET is_active = ?, details = ?, name = ? WHERE id = ?')
        .run(pm.is_active ? 1 : 0, pm.details || '', pm.name || '', pm.id);
    } else if (pm.name) {
      db.prepare('INSERT OR IGNORE INTO payment_methods (name, is_active, details) VALUES (?, ?, ?)')
        .run(pm.name, pm.is_active ? 1 : 0, pm.details || '');
    }
  }
}

// =========================================================================
// OPERAÇÕES: CATEGORIAS
// =========================================================================

function getAllCategories(db = getDatabase()) {
  return db.prepare(`
    SELECT c.*, COUNT(p.id) as products_count
    FROM categories c
    LEFT JOIN products p ON p.category_id = c.id
    GROUP BY c.id
    ORDER BY c.name ASC
  `).all();
}

function getCategories(db = getDatabase()) {
  return getAllCategories(db);
}

function getCategoryById(id, db = getDatabase()) {
  return db.prepare('SELECT * FROM categories WHERE id = ?').get(id) || null;
}

function createCategory({ name, description }, db = getDatabase()) {
  const now = new Date().toISOString();
  const res = db.prepare('INSERT INTO categories (name, description, created_at) VALUES (?, ?, ?)')
    .run(name.trim(), description || '', now);
  return getCategoryById(res.lastInsertRowid, db);
}

function updateCategory(id, { name, description }, db = getDatabase()) {
  db.prepare('UPDATE categories SET name = ?, description = ? WHERE id = ?')
    .run(name.trim(), description || '', id);
  return getCategoryById(id, db);
}

function deleteCategory(id, db = getDatabase()) {
  db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  return true;
}

// =========================================================================
// OPERAÇÕES: PRODUTOS E VARIAÇÕES
// =========================================================================

function getAllProducts(filters = {}, db = getDatabase()) {
  let query = `
    SELECT
      p.*,
      c.name as category_name,
      COALESCE(SUM(v.stock_quantity), 0) as total_stock,
      COUNT(v.id) as variations_count
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    LEFT JOIN product_variations v ON v.product_id = p.id
    WHERE 1=1
  `;
  const params = [];

  if (filters.search) {
    query += ` AND (p.name LIKE ? OR p.sku LIKE ? OR p.brand LIKE ? OR p.description LIKE ?)`;
    const s = `%${filters.search.trim()}%`;
    params.push(s, s, s, s);
  }

  if (filters.category_id) {
    query += ` AND p.category_id = ?`;
    params.push(filters.category_id);
  }

  if (filters.brand) {
    query += ` AND p.brand LIKE ?`;
    params.push(`%${filters.brand.trim()}%`);
  }

  if (filters.is_active !== undefined && filters.is_active !== '') {
    query += ` AND p.is_active = ?`;
    params.push(filters.is_active ? 1 : 0);
  }

  query += ` GROUP BY p.id`;

  if (filters.stock_status === 'available') {
    query += ` HAVING total_stock > 0`;
  } else if (filters.stock_status === 'out_of_stock') {
    query += ` HAVING total_stock = 0`;
  }

  query += ` ORDER BY p.id DESC`;

  const products = db.prepare(query).all(...params);

  const getVariationsStmt = db.prepare('SELECT * FROM product_variations WHERE product_id = ? ORDER BY size ASC, color ASC');
  return products.map(prod => ({
    ...prod,
    variations: getVariationsStmt.all(prod.id)
  }));
}

function getProducts(filters = {}, db = getDatabase()) {
  return getAllProducts(filters, db);
}

function getProductById(id, db = getDatabase()) {
  const prod = db.prepare(`
    SELECT p.*, c.name as category_name
    FROM products p
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE p.id = ?
  `).get(id);

  if (!prod) return null;

  const variations = db.prepare('SELECT * FROM product_variations WHERE product_id = ? ORDER BY size ASC, color ASC').all(id);
  const totalStock = variations.reduce((acc, v) => acc + (v.stock_quantity || 0), 0);

  return {
    ...prod,
    total_stock: totalStock,
    variations
  };
}

function createProduct(productData, db = getDatabase()) {
  const now = new Date().toISOString();
  const res = db.prepare(`
    INSERT INTO products (
      sku, name, category_id, brand, description, price, promo_price,
      is_active, image_url, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    productData.sku || null,
    productData.name.trim(),
    productData.category_id ? Number(productData.category_id) : null,
    productData.brand || '',
    productData.description || '',
    parseFloat(productData.price) || 0.0,
    productData.promo_price ? parseFloat(productData.promo_price) : (productData.promotional_price ? parseFloat(productData.promotional_price) : null),
    productData.is_active === false || productData.is_active === 0 ? 0 : 1,
    productData.image_url || '',
    productData.notes || '',
    now,
    now
  );

  const productId = res.lastInsertRowid;

  if (Array.isArray(productData.variations) && productData.variations.length > 0) {
    const insertVar = db.prepare(`
      INSERT INTO product_variations (product_id, size, color, stock_quantity, sku_variation)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const v of productData.variations) {
      insertVar.run(
        productId,
        v.size ? String(v.size).trim() : '',
        v.color ? String(v.color).trim() : '',
        parseInt(v.stock_quantity, 10) || 0,
        v.sku_variation || v.sku || ''
      );
    }
  }

  return getProductById(productId, db);
}

function updateProduct(id, productData, db = getDatabase()) {
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE products SET
      sku = ?,
      name = ?,
      category_id = ?,
      brand = ?,
      description = ?,
      price = ?,
      promo_price = ?,
      is_active = ?,
      image_url = ?,
      notes = ?,
      updated_at = ?
    WHERE id = ?
  `).run(
    productData.sku || null,
    productData.name.trim(),
    productData.category_id ? Number(productData.category_id) : null,
    productData.brand || '',
    productData.description || '',
    parseFloat(productData.price) || 0.0,
    productData.promo_price ? parseFloat(productData.promo_price) : (productData.promotional_price ? parseFloat(productData.promotional_price) : null),
    productData.is_active === false || productData.is_active === 0 ? 0 : 1,
    productData.image_url || '',
    productData.notes || '',
    now,
    id
  );

  if (Array.isArray(productData.variations)) {
    db.prepare('DELETE FROM product_variations WHERE product_id = ?').run(id);
    const insertVar = db.prepare(`
      INSERT INTO product_variations (product_id, size, color, stock_quantity, sku_variation)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const v of productData.variations) {
      insertVar.run(
        id,
        v.size ? String(v.size).trim() : '',
        v.color ? String(v.color).trim() : '',
        parseInt(v.stock_quantity, 10) || 0,
        v.sku_variation || v.sku || ''
      );
    }
  }

  return getProductById(id, db);
}

function updateVariationStock(variationId, stockQuantity, db = getDatabase()) {
  db.prepare('UPDATE product_variations SET stock_quantity = ? WHERE id = ?')
    .run(parseInt(stockQuantity, 10) || 0, variationId);
  return true;
}

function toggleProductStatus(id, db = getDatabase()) {
  const prod = getProductById(id, db);
  if (!prod) return null;
  const newStatus = prod.is_active ? 0 : 1;
  const now = new Date().toISOString();
  db.prepare('UPDATE products SET is_active = ?, updated_at = ? WHERE id = ?').run(newStatus, now, id);
  return getProductById(id, db);
}

function toggleProductActive(id, db = getDatabase()) {
  return toggleProductStatus(id, db);
}

function deleteProduct(id, db = getDatabase()) {
  db.prepare('DELETE FROM product_variations WHERE product_id = ?').run(id);
  db.prepare('DELETE FROM products WHERE id = ?').run(id);
  return true;
}

// =========================================================================
// OPERAÇÕES: CONFIGURAÇÃO DA SOFIA
// =========================================================================

function getSofiaConfig(db = getDatabase()) {
  const row = db.prepare('SELECT * FROM sofia_config WHERE id = 1').get() || {};
  return {
    ...row,
    company_rules: row.company_rules || row.company_additional_rules || ''
  };
}

function updateSofiaConfig(configData, db = getDatabase()) {
  const now = new Date().toISOString();
  const current = getSofiaConfig(db);
  const rules = configData.company_rules !== undefined ? configData.company_rules : (configData.company_additional_rules !== undefined ? configData.company_additional_rules : current.company_rules);

  db.prepare(`
    UPDATE sofia_config SET
      agent_name = ?,
      initial_message = ?,
      tone = ?,
      max_response_length = ?,
      additional_instructions = ?,
      transfer_message = ?,
      unavailable_message = ?,
      is_active = ?,
      company_rules = ?,
      company_additional_rules = ?,
      updated_at = ?
    WHERE id = 1
  `).run(
    configData.agent_name || current.agent_name || 'Sofia',
    configData.initial_message !== undefined ? configData.initial_message : current.initial_message,
    configData.tone || current.tone || 'comercial, educado e objetivo',
    configData.max_response_length || current.max_response_length || 'curto (2 a 3 frases)',
    configData.additional_instructions !== undefined ? configData.additional_instructions : current.additional_instructions,
    configData.transfer_message !== undefined ? configData.transfer_message : current.transfer_message,
    configData.unavailable_message !== undefined ? configData.unavailable_message : current.unavailable_message,
    configData.is_active === false || configData.is_active === 0 ? 0 : 1,
    rules || '',
    rules || '',
    now
  );
  return getSofiaConfig(db);
}

// =========================================================================
// OPERAÇÕES: ATENDIMENTOS E CONTATOS
// =========================================================================

function getAllAttendanceContacts(db = getDatabase()) {
  const rows = db.prepare('SELECT * FROM attendance_contacts ORDER BY updated_at DESC').all();
  return rows.map(r => ({
    ...r,
    pause_reason: r.pause_reason || r.paused_reason || ''
  }));
}

function getAttendanceContacts(db = getDatabase()) {
  return getAllAttendanceContacts(db);
}

function getAttendanceContact(contactId, db = getDatabase()) {
  if (!contactId) return null;
  const row = db.prepare('SELECT * FROM attendance_contacts WHERE contact_id = ?').get(contactId);
  if (!row) return null;
  return {
    ...row,
    pause_reason: row.pause_reason || row.paused_reason || ''
  };
}

function saveContactAttendanceStatus(contactId, status, reason = '', db = getDatabase()) {
  if (!contactId) return;
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO attendance_contacts (contact_id, status, paused_reason, pause_reason, last_activity, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(contact_id) DO UPDATE SET
      status = excluded.status,
      paused_reason = excluded.paused_reason,
      pause_reason = excluded.pause_reason,
      last_activity = excluded.last_activity,
      updated_at = excluded.updated_at
  `).run(contactId, status, reason, reason, now, now, now);
}

function setAttendanceStatus(contactId, status, reason = '', db = getDatabase()) {
  return saveContactAttendanceStatus(contactId, status, reason, db);
}

function deleteContactAttendance(contactId, db = getDatabase()) {
  if (!contactId) return;
  db.prepare('DELETE FROM attendance_contacts WHERE contact_id = ?').run(contactId);
}

// =========================================================================
// OPERAÇÕES: MÉTRICAS DO DASHBOARD
// =========================================================================

function getDashboardMetrics(db = getDatabase()) {
  const totalProducts = db.prepare('SELECT COUNT(*) as count FROM products').get().count;
  const activeProducts = db.prepare('SELECT COUNT(*) as count FROM products WHERE is_active = 1').get().count;
  const totalCategories = db.prepare('SELECT COUNT(*) as count FROM categories').get().count;
  const humanAttendances = db.prepare("SELECT COUNT(*) as count FROM attendance_contacts WHERE status = 'HUMANO'").get().count;
  const sofiaAttendances = db.prepare("SELECT COUNT(*) as count FROM attendance_contacts WHERE status = 'SOFIA'").get().count;

  return {
    totalProducts,
    activeProducts,
    totalCategories,
    humanAttendances,
    sofiaAttendances
  };
}

// =========================================================================
// OPERAÇÕES: BACKUP E RESTAURAÇÃO (JSON)
// =========================================================================

function exportBackup(db = getDatabase()) {
  const company = getCompanyData(db);
  const paymentMethods = getPaymentMethods({}, db);
  const categories = db.prepare('SELECT * FROM categories ORDER BY id ASC').all();
  const products = getAllProducts({}, db);
  const sofia = getSofiaConfig(db);
  const attendances = getAllAttendanceContacts(db);

  return {
    version: '1.0.0',
    exported_at: new Date().toISOString(),
    system: 'ART ARTIGOS MILITARES - Painel Sofia',
    company,
    payment_methods: paymentMethods,
    categories,
    products,
    sofia,
    attendances,
    data: {
      company,
      payment_methods: paymentMethods,
      categories,
      products,
      sofia,
      attendances
    }
  };
}

function exportBackupData(db = getDatabase()) {
  return exportBackup(db);
}

function importBackup(backupPayload, db = getDatabase()) {
  if (!backupPayload) {
    throw new Error('Formato de backup inválido.');
  }

  const data = backupPayload.data || backupPayload;
  const { company, payment_methods, categories, products, sofia } = data;

  // Atualiza a empresa
  if (company) {
    updateCompany(company, db);
  }

  // Atualiza métodos de pagamento
  if (Array.isArray(payment_methods)) {
    syncPaymentMethods(payment_methods, db);
  }

  // Atualiza Sofia
  if (sofia) {
    updateSofiaConfig(sofia, db);
  }

  // Restaura categorias
  if (Array.isArray(categories)) {
    for (const cat of categories) {
      if (cat.name) {
        const existing = db.prepare('SELECT id FROM categories WHERE name = ?').get(cat.name);
        if (!existing) {
          createCategory({ name: cat.name, description: cat.description }, db);
        }
      }
    }
  }

  // Restaura produtos
  if (Array.isArray(products)) {
    for (const prod of products) {
      if (prod.name) {
        let categoryId = null;
        if (prod.category_name) {
          const cat = db.prepare('SELECT id FROM categories WHERE name = ?').get(prod.category_name);
          if (cat) categoryId = cat.id;
        }

        const existingProd = prod.sku ? db.prepare('SELECT id FROM products WHERE sku = ?').get(prod.sku) : null;
        if (existingProd) {
          updateProduct(existingProd.id, { ...prod, category_id: categoryId || prod.category_id }, db);
        } else {
          createProduct({ ...prod, category_id: categoryId || prod.category_id }, db);
        }
      }
    }
  }

  return { success: true };
}

function importBackupData(backupPayload, db = getDatabase()) {
  return importBackup(backupPayload, db);
}

// =========================================================================
// OPERAÇÕES: AUTENTICAÇÃO E USUÁRIOS (CRIPTO NATIVA)
// =========================================================================

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  if (!password || typeof password !== 'string') {
    throw new Error('Senha inválida para geração de hash.');
  }
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}

function verifyPassword(password, storedHash, salt) {
  if (!password || !storedHash || !salt) return false;
  try {
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    const hashBuf = Buffer.from(hash, 'hex');
    const storedBuf = Buffer.from(storedHash, 'hex');
    if (hashBuf.length !== storedBuf.length) return false;
    return crypto.timingSafeEqual(hashBuf, storedBuf);
  } catch (_) {
    return false;
  }
}

function hasAdminUser(db = getDatabase()) {
  try {
    const row = db.prepare('SELECT COUNT(*) as count FROM users').get();
    return row ? Number(row.count) > 0 : false;
  } catch (_) {
    return false;
  }
}

function getUserCount(db = getDatabase()) {
  try {
    const row = db.prepare('SELECT COUNT(*) as count FROM users').get();
    return row ? Number(row.count) : 0;
  } catch (_) {
    return 0;
  }
}

function createAdminUser({ name, username, password }, db = getDatabase()) {
  if (!name || typeof name !== 'string' || !name.trim()) {
    throw new Error('Nome é obrigatório.');
  }
  if (!username || typeof username !== 'string' || !username.trim()) {
    throw new Error('Usuário é obrigatório.');
  }
  if (!password || typeof password !== 'string') {
    throw new Error('Senha é obrigatória.');
  }
  if (password.length < 8) {
    throw new Error('A senha deve ter no mínimo 8 caracteres.');
  }

  const cleanName = name.trim();
  const cleanUser = username.trim().toLowerCase();

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(cleanUser);
  if (existing) {
    throw new Error('Nome de usuário já cadastrado.');
  }

  const { hash, salt } = hashPassword(password);
  const now = new Date().toISOString();

  const result = db.prepare(`
    INSERT INTO users (name, username, password_hash, salt, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(cleanName, cleanUser, hash, salt, now, now);

  return {
    id: Number(result.lastInsertRowid),
    name: cleanName,
    username: cleanUser
  };
}

function verifyAdminUser(username, password, db = getDatabase()) {
  if (!username || !password || typeof username !== 'string' || typeof password !== 'string') {
    return null;
  }
  const cleanUser = username.trim().toLowerCase();
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(cleanUser);
  if (!user) return null;

  const isValid = verifyPassword(password, user.password_hash, user.salt);
  if (!isValid) return null;

  return {
    id: user.id,
    name: user.name,
    username: user.username
  };
}

function listUsers(db = getDatabase()) {
  return db.prepare('SELECT id, name, username, created_at, updated_at FROM users ORDER BY id ASC').all();
}

module.exports = {
  getDatabase,
  initDatabase,
  initSchema,
  seedInitialData,
  hashPassword,
  verifyPassword,
  hasAdminUser,
  getUserCount,
  createAdminUser,
  verifyAdminUser,
  listUsers,
  getCompany,
  getCompanyData,
  updateCompany,
  updateCompanyData,
  getPaymentMethods,
  syncPaymentMethods,
  getAllCategories,
  getCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
  getAllProducts,
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  updateVariationStock,
  toggleProductStatus,
  toggleProductActive,
  deleteProduct,
  getSofiaConfig,
  updateSofiaConfig,
  getAllAttendanceContacts,
  getAttendanceContacts,
  getAttendanceContact,
  saveContactAttendanceStatus,
  setAttendanceStatus,
  deleteContactAttendance,
  getDashboardMetrics,
  exportBackup,
  exportBackupData,
  importBackup,
  importBackupData
};
