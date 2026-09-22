/**
 * public/js/app.js
 *
 * Lógica principal da interface da Loja (Painel Administrativo).
 * Totalmente em Português do Brasil, sem jargões técnicos para os lojistas.
 */

const App = {
  currentView: 'dashboard',
  state: {
    categories: [],
    products: [],
    paymentMethods: [],
    company: null,
    sofiaConfig: null,
    attendances: []
  },

  async init() {
    // 1. Verifica autenticação
    const isAuth = await Auth.check();
    if (!isAuth) {
      window.location.href = '/login.html';
      return;
    }

    // 2. Exibe nome do usuário no rodapé da sidebar
    if (Auth.currentUser && Auth.currentUser.username) {
      const userEl = document.getElementById('sidebar-username');
      if (userEl) userEl.textContent = Auth.currentUser.username;
    }

    // 3. Registra eventos e inicializa view
    this.bindEvents();
    this.navigateTo(this.getViewFromHash() || 'dashboard');
    this.refreshStatus();

    // 4. Atualização automática de status a cada 3 segundos
    setInterval(() => {
      if (this.currentView === 'dashboard') {
        this.refreshStatus();
      }
    }, 3000);
  },

  getViewFromHash() {
    const hash = window.location.hash.replace('#', '');
    const validViews = ['dashboard', 'products', 'company', 'attendances', 'sofia', 'categories', 'backup'];
    return validViews.includes(hash) ? hash : 'dashboard';
  },

  bindEvents() {
    // Navegação via sidebar
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const view = item.getAttribute('data-view');
        this.navigateTo(view);
      });
    });

    // Menu mobile
    const mobileToggle = document.getElementById('mobile-toggle');
    const sidebar = document.getElementById('sidebar');
    if (mobileToggle && sidebar) {
      mobileToggle.addEventListener('click', () => {
        sidebar.classList.toggle('open');
      });
    }

    // Botão Sair (Logout)
    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) {
      btnLogout.addEventListener('click', () => Auth.logout());
    }

    // Botão Atualizar Geral
    const btnRefresh = document.getElementById('btn-refresh-status');
    if (btnRefresh) {
      btnRefresh.addEventListener('click', () => {
        this.refreshStatus();
        this.loadCurrentViewData();
        this.toast('Dados atualizados com sucesso!', 'success');
      });
    }

    // Formulário Dados da Loja
    const formCompany = document.getElementById('form-company');
    if (formCompany) {
      formCompany.addEventListener('submit', (e) => this.handleSaveCompany(e));
    }

    // Formulário Sofia
    const formSofia = document.getElementById('form-sofia');
    if (formSofia) {
      formSofia.addEventListener('submit', (e) => this.handleSaveSofia(e));
    }

    // Seletor de Estilo da Sofia
    const toneSelect = document.getElementById('sofia-tone-select');
    const toneInput = document.getElementById('sofia-tone');
    if (toneSelect && toneInput) {
      toneSelect.addEventListener('change', () => {
        toneInput.value = toneSelect.value;
      });
    }

    // Produtos & Filtros
    const btnNewProduct = document.getElementById('btn-new-product');
    if (btnNewProduct) {
      btnNewProduct.addEventListener('click', () => this.openProductModal());
    }

    const formProduct = document.getElementById('form-product');
    if (formProduct) {
      formProduct.addEventListener('submit', (e) => this.handleSaveProduct(e));
    }

    const prodSearch = document.getElementById('product-search-input');
    if (prodSearch) {
      prodSearch.addEventListener('input', () => this.filterProducts());
    }

    const prodCatFilter = document.getElementById('product-category-filter');
    if (prodCatFilter) {
      prodCatFilter.addEventListener('change', () => this.filterProducts());
    }

    // Categorias
    const btnNewCategory = document.getElementById('btn-new-category');
    if (btnNewCategory) {
      btnNewCategory.addEventListener('click', () => this.openCategoryModal());
    }

    const formCategory = document.getElementById('form-category');
    if (formCategory) {
      formCategory.addEventListener('submit', (e) => this.handleSaveCategory(e));
    }

    // Atendimentos
    const btnRefreshAttendances = document.getElementById('btn-refresh-attendances');
    if (btnRefreshAttendances) {
      btnRefreshAttendances.addEventListener('click', () => this.loadAttendances());
    }

    // Backup
    const btnExportBackup = document.getElementById('btn-export-backup');
    if (btnExportBackup) {
      btnExportBackup.addEventListener('click', () => Api.exportBackup());
    }

    const btnImportBackup = document.getElementById('btn-import-backup');
    if (btnImportBackup) {
      btnImportBackup.addEventListener('click', () => this.handleImportBackup());
    }
  },

  navigateTo(viewName) {
    this.currentView = viewName;
    window.location.hash = viewName;

    // Atualiza classes ativas na sidebar
    document.querySelectorAll('.nav-item').forEach(item => {
      if (item.getAttribute('data-view') === viewName) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    // Atualiza seções visíveis
    document.querySelectorAll('.view-section').forEach(sec => {
      sec.classList.remove('active');
    });

    const activeSection = document.getElementById(`view-${viewName}`);
    if (activeSection) {
      activeSection.classList.add('active');
    }

    // Títulos amigáveis das páginas
    const titles = {
      dashboard: 'Início',
      products: 'Produtos & Estoque',
      company: 'Dados da Loja',
      attendances: 'Atendimentos no WhatsApp',
      sofia: 'Configurar Sofia',
      categories: 'Categorias de Produtos',
      backup: 'Backup'
    };

    const titleEl = document.getElementById('page-title');
    if (titleEl) titleEl.textContent = titles[viewName] || 'Painel da Loja';

    // Fecha sidebar no mobile ao navegar
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.remove('open');

    this.loadCurrentViewData();
  },

  async loadCurrentViewData() {
    try {
      if (this.currentView === 'dashboard') {
        await this.refreshStatus();
      } else if (this.currentView === 'products') {
        await this.loadCategoriesList();
        await this.loadProductsList();
      } else if (this.currentView === 'company') {
        await this.loadCompanyData();
      } else if (this.currentView === 'attendances') {
        await this.loadAttendances();
      } else if (this.currentView === 'sofia') {
        await this.loadSofiaData();
      } else if (this.currentView === 'categories') {
        await this.loadCategoriesList();
      }
    } catch (err) {
      this.toast('Erro ao carregar dados: ' + err.message, 'error');
    }
  },

  // ==================================================
  // STATUS E DASHBOARD PRINCIPAL
  // ==================================================
  async refreshStatus() {
    try {
      const res = await Api.getStatus();
      if (!res || !res.success) return;

      const { system, metrics } = res;

      // 1. Atualiza nome da loja no topo e no banner do Dashboard
      if (this.state.company && this.state.company.name) {
        const topStoreEl = document.getElementById('store-title-top');
        const dashCompName = document.getElementById('dash-company-name');
        if (topStoreEl) topStoreEl.textContent = this.state.company.name;
        if (dashCompName) dashCompName.textContent = this.state.company.name;
      }

      // 2. Indicadores Numéricos
      const elTotalProd = document.getElementById('dash-total-products');
      if (elTotalProd) elTotalProd.textContent = metrics.total_products || 0;

      const elHumanCont = document.getElementById('dash-human-contacts');
      if (elHumanCont) elHumanCont.textContent = metrics.human_attendances || 0;

      // 3. Status do WhatsApp
      const waStatus = (system && system.whatsapp && system.whatsapp.status) || 'desconectado';
      const isConnected = waStatus === 'conectado';
      const isAuthenticating = waStatus === 'autenticando';
      const isWaitingQr = waStatus === 'aguardando_qr';

      // Card WhatsApp do Dashboard
      const dashWaSimple = document.getElementById('dash-wa-simple');
      const dashWaSubtext = document.getElementById('dash-wa-status-subtext');
      const topBadge = document.getElementById('top-status-badge');
      const topBadgeText = document.getElementById('top-status-text');

      if (isConnected) {
        if (dashWaSimple) {
          dashWaSimple.textContent = 'CONECTADO';
          dashWaSimple.style.color = '#10b981';
        }
        if (dashWaSubtext) dashWaSubtext.textContent = 'WhatsApp conectado e operacional';
        if (topBadge) topBadge.className = 'status-pill online';
        if (topBadgeText) topBadgeText.textContent = 'WhatsApp Conectado';
      } else if (isWaitingQr) {
        if (dashWaSimple) {
          dashWaSimple.textContent = 'AGUARDANDO LEITURA';
          dashWaSimple.style.color = '#f59e0b';
        }
        if (dashWaSubtext) dashWaSubtext.textContent = 'Aponte a câmera do WhatsApp para o código';
        if (topBadge) topBadge.className = 'status-pill warning';
        if (topBadgeText) topBadgeText.textContent = 'Aguardando QR Code';
      } else if (isAuthenticating) {
        if (dashWaSimple) {
          dashWaSimple.textContent = 'AUTENTICANDO';
          dashWaSimple.style.color = '#f59e0b';
        }
        if (dashWaSubtext) dashWaSubtext.textContent = 'WhatsApp autenticado. Finalizando conexão...';
        if (topBadge) topBadge.className = 'status-pill warning';
        if (topBadgeText) topBadgeText.textContent = 'Autenticando...';
      } else {
        if (dashWaSimple) {
          dashWaSimple.textContent = 'DESCONECTADO';
          dashWaSimple.style.color = '#ef4444';
        }
        if (dashWaSubtext) dashWaSubtext.textContent = 'WhatsApp não conectado';
        if (topBadge) topBadge.className = 'status-pill offline';
        if (topBadgeText) topBadgeText.textContent = 'WhatsApp Desconectado';
      }

      // 4. Status da Sofia
      const isSofiaActive = Boolean(system && system.sofia && system.sofia.isActive);
      const dashSofiaSimple = document.getElementById('dash-sofia-simple');
      const dashSofiaSubtext = document.getElementById('dash-sofia-status-subtext');

      if (dashSofiaSimple) {
        dashSofiaSimple.textContent = isSofiaActive ? 'ATIVA' : 'PAUSADA';
        dashSofiaSimple.style.color = isSofiaActive ? '#10b981' : '#f59e0b';
      }
      if (dashSofiaSubtext) {
        dashSofiaSubtext.textContent = isSofiaActive ? 'Atendimento automático ligado' : 'Atendimento pausado';
      }

      // 5. Painel de Conexão do WhatsApp
      const alertBox = document.getElementById('wa-status-alert');
      const alertTitle = document.getElementById('wa-status-title');
      const alertMessage = document.getElementById('wa-status-message');
      const btnDisconnect = document.getElementById('btn-wa-disconnect');
      const btnReconnect = document.getElementById('btn-wa-reconnect');
      const qrBox = document.getElementById('wa-qr-box');
      const qrImg = document.getElementById('wa-qr-image');
      const connectedBox = document.getElementById('wa-connected-box');
      const connectedPhone = document.getElementById('wa-connected-phone');

      if (isConnected) {
        if (alertBox) alertBox.className = 'alert alert-success';
        if (alertTitle) alertTitle.textContent = 'Status: CONECTADO — ';
        if (alertMessage) alertMessage.textContent = 'WhatsApp conectado e Sofia pronta para atendimento.';
        if (btnDisconnect) btnDisconnect.style.display = 'inline-flex';
        if (btnReconnect) btnReconnect.style.display = 'none';
        if (qrBox) qrBox.style.display = 'none';
        if (connectedBox) connectedBox.style.display = 'block';

        if (connectedPhone) {
          const storePhone = (this.state.company && (this.state.company.whatsapp || this.state.company.phone)) || '';
          connectedPhone.textContent = storePhone ? `Número da Loja: ${this.formatPhoneDisplay(storePhone)}` : 'WhatsApp da Loja Conectado';
        }
      } else if (isWaitingQr) {
        if (alertBox) alertBox.className = 'alert alert-warning';
        if (alertTitle) alertTitle.textContent = 'Status: AGUARDANDO QR CODE — ';
        if (alertMessage) alertMessage.textContent = 'Escaneie o código abaixo com o WhatsApp da loja para conectar.';
        if (btnDisconnect) btnDisconnect.style.display = 'inline-flex';
        if (btnReconnect) btnReconnect.style.display = 'none';
        if (connectedBox) connectedBox.style.display = 'none';

        if (system.whatsapp.qrImage) {
          if (qrBox) qrBox.style.display = 'block';
          if (qrImg) qrImg.src = system.whatsapp.qrImage;
        } else {
          if (qrBox) qrBox.style.display = 'none';
        }
      } else if (isAuthenticating) {
        if (alertBox) alertBox.className = 'alert alert-warning';
        if (alertTitle) alertTitle.textContent = 'Status: AUTENTICANDO — ';
        if (alertMessage) alertMessage.textContent = 'WhatsApp autenticado. Finalizando conexão...';
        if (btnDisconnect) btnDisconnect.style.display = 'inline-flex';
        if (btnReconnect) btnReconnect.style.display = 'none';
        if (qrBox) qrBox.style.display = 'none';
        if (connectedBox) connectedBox.style.display = 'none';
      } else {
        if (alertBox) alertBox.className = 'alert alert-danger';
        if (alertTitle) alertTitle.textContent = 'Status: NÃO CONECTADO — ';
        if (alertMessage) alertMessage.textContent = 'WhatsApp desconectado. Clique em CONECTAR WHATSAPP para escanear o código.';
        if (btnDisconnect) btnDisconnect.style.display = 'none';
        if (btnReconnect) btnReconnect.style.display = 'inline-flex';
        if (qrBox) qrBox.style.display = 'none';
        if (connectedBox) connectedBox.style.display = 'none';
      }
    } catch (err) {
      console.warn('Erro ao atualizar status:', err);
    }
  },

  // ==================================================
  // GERENCIAMENTO DA CONEXÃO WHATSAPP
  // ==================================================
  openDisconnectModal() {
    const modal = document.getElementById('modal-disconnect-confirm');
    if (modal) modal.style.display = 'flex';
  },

  closeDisconnectModal() {
    const modal = document.getElementById('modal-disconnect-confirm');
    if (modal) modal.style.display = 'none';
  },

  async executeDisconnectWhatsApp() {
    const btn = document.getElementById('btn-confirm-disconnect');
    try {
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Desconectando...';
      }

      const res = await Api.disconnectWhatsApp();
      this.closeDisconnectModal();
      this.toast(res && res.message ? res.message : 'WhatsApp desconectado com sucesso.', 'info');
      await this.refreshStatus();
    } catch (err) {
      this.toast('Erro ao desconectar WhatsApp: ' + err.message, 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = '🔌 Confirmar Desconexão';
      }
    }
  },

  async handleReconnectWhatsApp() {
    const btn = document.getElementById('btn-wa-reconnect');
    try {
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Conectando...';
      }

      const res = await Api.reconnectWhatsApp();
      this.toast(res.message || 'Iniciando conexão com WhatsApp...', 'info');
      await this.refreshStatus();
    } catch (err) {
      this.toast('Erro ao iniciar conexão: ' + err.message, 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = '📲 CONECTAR WHATSAPP';
      }
    }
  },

  // ==================================================
  // PRODUTOS & ESTOQUE
  // ==================================================
  async loadProductsList() {
    const res = await Api.getProducts();
    if (!res.success) return;

    this.state.products = res.products || [];
    this.filterProducts();
  },

  filterProducts() {
    const searchVal = (document.getElementById('product-search-input')?.value || '').toLowerCase().trim();
    const catFilter = document.getElementById('product-category-filter')?.value || '';

    const filtered = this.state.products.filter(p => {
      const matchCat = catFilter ? String(p.category_id) === String(catFilter) : true;
      const matchText = searchVal ? (
        (p.name && p.name.toLowerCase().includes(searchVal)) ||
        (p.sku && p.sku.toLowerCase().includes(searchVal)) ||
        (p.brand && p.brand.toLowerCase().includes(searchVal))
      ) : true;
      return matchCat && matchText;
    });

    this.renderProductsTable(filtered);
  },

  renderProductsTable(products) {
    const tbody = document.getElementById('products-table-body');
    if (!tbody) return;

    if (products.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 32px;">Nenhum produto cadastrado. Clique em <strong>➕ Adicionar produto</strong> para começar.</td></tr>`;
      return;
    }

    tbody.innerHTML = products.map(prod => {
      const formattedPrice = `R$ ${parseFloat(prod.price || 0).toFixed(2).replace('.', ',')}`;
      const promoPrice = prod.promo_price ? `<br><small style="color: var(--success); font-weight: 600;">Promo: R$ ${parseFloat(prod.promo_price).toFixed(2).replace('.', ',')}</small>` : '';

      // Foto do produto
      const imgHtml = prod.image_url
        ? `<img src="${this.escapeHtml(prod.image_url)}" alt="${this.escapeHtml(prod.name)}" class="product-thumb" onerror="this.outerHTML='<div class=\\'product-thumb-placeholder\\'>📦</div>'">`
        : `<div class="product-thumb-placeholder">📦</div>`;

      // Grade de Variações / Estoque
      let stockHtml = '';
      if (prod.variations && prod.variations.length > 0) {
        stockHtml = prod.variations.map(v => {
          const sizeLabel = v.size ? `Tam ${this.escapeHtml(v.size)}` : 'Único';
          const colorLabel = v.color ? ` (${this.escapeHtml(v.color)})` : '';
          const isAvailable = (v.stock_quantity || 0) > 0;
          return `
            <span class="badge ${isAvailable ? 'badge-success' : 'badge-danger'}" style="margin: 2px 4px 2px 0; display: inline-block;">
              ${sizeLabel}${colorLabel}: <strong>${v.stock_quantity} un</strong>
            </span>
          `;
        }).join('');
      } else {
        stockHtml = `<small style="color: var(--text-muted);">Estoque não informado</small>`;
      }

      return `
        <tr>
          <td>${imgHtml}</td>
          <td>
            <strong>${this.escapeHtml(prod.name)}</strong>
            ${prod.category_name ? `<br><small style="color: var(--text-muted);">${this.escapeHtml(prod.category_name)}</small>` : ''}
          </td>
          <td><strong>${formattedPrice}</strong>${promoPrice}</td>
          <td>${stockHtml}</td>
          <td>
            <button class="status-pill ${prod.is_active ? 'online' : 'offline'}" style="border: none; cursor: pointer;" title="Clique para ativar/desativar" onclick="App.toggleProductStatus(${prod.id})">
              <span class="status-dot"></span>
              ${prod.is_active ? 'Sim' : 'Não'}
            </button>
          </td>
          <td style="text-align: right; white-space: nowrap;">
            <button class="btn btn-secondary btn-sm" onclick="App.openEditProductModal(${prod.id})">✏️ Editar</button>
            <button class="btn btn-danger btn-sm" onclick="App.deleteProduct(${prod.id})">🗑️ Excluir</button>
          </td>
        </tr>
      `;
    }).join('');
  },

  openProductModal() {
    document.getElementById('modal-product-title').textContent = '➕ Cadastrar Novo Produto';
    const form = document.getElementById('form-product');
    form.reset();
    document.getElementById('prod-id').value = '';
    document.getElementById('prod-default-qty').value = '1';
    document.getElementById('prod-quick-sizes').value = '';
    document.getElementById('prod-quick-colors').value = '';
    document.getElementById('modal-variations-list').innerHTML = '';

    // Fecha a seção "Mais opções" por padrão para manter a simplicidade
    const detailsEl = document.getElementById('product-more-options');
    if (detailsEl) detailsEl.open = false;

    document.getElementById('modal-product').style.display = 'flex';
  },

  async openEditProductModal(id) {
    try {
      const res = await Api.getProduct(id);
      if (!res.success || !res.product) return;

      const prod = res.product;
      document.getElementById('modal-product-title').textContent = `✏️ Editar Produto: ${prod.name}`;
      document.getElementById('prod-id').value = prod.id;
      document.getElementById('prod-name').value = prod.name || '';
      document.getElementById('prod-price').value = prod.price || '';
      document.getElementById('prod-category').value = prod.category_id || '';
      document.getElementById('prod-is-active').value = prod.is_active ? '1' : '0';
      document.getElementById('prod-image-url').value = prod.image_url || '';
      document.getElementById('prod-description').value = prod.description || '';

      // Campos avançados
      document.getElementById('prod-sku').value = prod.sku || '';
      document.getElementById('prod-brand').value = prod.brand || '';
      document.getElementById('prod-promo-price').value = prod.promo_price || '';

      // Extrai tamanhos e cores para os campos rápidos
      const varList = document.getElementById('modal-variations-list');
      varList.innerHTML = '';

      if (prod.variations && prod.variations.length > 0) {
        const uniqueSizes = [...new Set(prod.variations.map(v => v.size).filter(Boolean))];
        const uniqueColors = [...new Set(prod.variations.map(v => v.color).filter(Boolean))];
        const totalStock = prod.variations.reduce((sum, v) => sum + (v.stock_quantity || 0), 0);

        document.getElementById('prod-quick-sizes').value = uniqueSizes.join(', ');
        document.getElementById('prod-quick-colors').value = uniqueColors.join(', ');
        document.getElementById('prod-default-qty').value = totalStock || '1';

        // Preenche também as linhas detalhadas
        prod.variations.forEach(v => {
          this.addVariationRow(v.size, v.color, v.stock_quantity);
        });
      } else {
        document.getElementById('prod-quick-sizes').value = '';
        document.getElementById('prod-quick-colors').value = '';
        document.getElementById('prod-default-qty').value = '1';
      }

      document.getElementById('modal-product').style.display = 'flex';
    } catch (err) {
      this.toast('Erro ao carregar dados do produto: ' + err.message, 'error');
    }
  },

  closeProductModal() {
    document.getElementById('modal-product').style.display = 'none';
  },

  addVariationRow(size = '', color = '', stock = '1') {
    const list = document.getElementById('modal-variations-list');
    const div = document.createElement('div');
    div.className = 'variation-row';
    div.innerHTML = `
      <input type="text" class="form-control var-size" placeholder="Tamanho (Ex: 42, M, G)" value="${this.escapeHtml(size || '')}">
      <input type="text" class="form-control var-color" placeholder="Cor (Ex: Preto, Coyote)" value="${this.escapeHtml(color || '')}">
      <input type="number" min="0" class="form-control var-stock" placeholder="Estoque" value="${stock}">
      <button type="button" class="btn btn-danger btn-sm" onclick="this.parentElement.remove()" title="Remover">✕</button>
    `;
    list.appendChild(div);
  },

  async handleSaveProduct(e) {
    e.preventDefault();
    const id = document.getElementById('prod-id').value;

    // 1. Processa variações detalhadas ou converte tamanhos/cores rápidos
    let variations = [];
    const explicitRows = document.querySelectorAll('#modal-variations-list .variation-row');

    explicitRows.forEach(row => {
      const size = row.querySelector('.var-size').value.trim();
      const color = row.querySelector('.var-color').value.trim();
      const stock = parseInt(row.querySelector('.var-stock').value, 10) || 0;

      if (size || color || stock > 0) {
        variations.push({
          size: size || null,
          color: color || null,
          stock_quantity: stock
        });
      }
    });

    // Se o usuário não preencheu linhas individuais, processa os campos simples (Tamanhos e Cores)
    if (variations.length === 0) {
      const quickSizes = document.getElementById('prod-quick-sizes').value
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);

      const quickColors = document.getElementById('prod-quick-colors').value
        .split(',')
        .map(c => c.trim())
        .filter(Boolean);

      const defaultQty = parseInt(document.getElementById('prod-default-qty').value, 10) || 0;

      if (quickSizes.length > 0 && quickColors.length > 0) {
        quickSizes.forEach(size => {
          quickColors.forEach(color => {
            variations.push({ size, color, stock_quantity: defaultQty });
          });
        });
      } else if (quickSizes.length > 0) {
        quickSizes.forEach(size => {
          variations.push({ size, color: null, stock_quantity: defaultQty });
        });
      } else if (quickColors.length > 0) {
        quickColors.forEach(color => {
          variations.push({ size: null, color, stock_quantity: defaultQty });
        });
      } else if (defaultQty > 0) {
        variations.push({ size: null, color: null, stock_quantity: defaultQty });
      }
    }

    const productData = {
      name: document.getElementById('prod-name').value.trim(),
      price: parseFloat(document.getElementById('prod-price').value) || 0,
      category_id: document.getElementById('prod-category').value ? parseInt(document.getElementById('prod-category').value, 10) : null,
      is_active: parseInt(document.getElementById('prod-is-active').value, 10),
      image_url: document.getElementById('prod-image-url').value.trim() || null,
      description: document.getElementById('prod-description').value.trim() || null,
      sku: document.getElementById('prod-sku').value.trim() || null,
      brand: document.getElementById('prod-brand').value.trim() || null,
      promo_price: document.getElementById('prod-promo-price').value ? parseFloat(document.getElementById('prod-promo-price').value) : null,
      variations
    };

    try {
      if (id) {
        await Api.updateProduct(id, productData);
        this.toast('Salvo com sucesso!', 'success');
      } else {
        await Api.createProduct(productData);
        this.toast('Produto cadastrado com sucesso!', 'success');
      }

      this.closeProductModal();
      await this.loadProductsList();
      await this.refreshStatus();
    } catch (err) {
      this.toast('Erro ao salvar produto: ' + err.message, 'error');
    }
  },

  async toggleProductStatus(id) {
    try {
      const res = await Api.toggleProductActive(id);
      if (res.success) {
        this.toast(`Produto ${res.product.is_active ? 'ativado' : 'desativado'} com sucesso!`, 'info');
        await this.loadProductsList();
      }
    } catch (err) {
      this.toast('Erro ao alterar disponibilidade: ' + err.message, 'error');
    }
  },

  async deleteProduct(id) {
    if (!confirm('Tem certeza de que deseja excluir este produto?')) return;
    try {
      await Api.deleteProduct(id);
      this.toast('Produto excluído com sucesso!', 'success');
      await this.loadProductsList();
      await this.refreshStatus();
    } catch (err) {
      this.toast('Erro ao excluir produto: ' + err.message, 'error');
    }
  },

  // ==================================================
  // DADOS DA LOJA & PAGAMENTOS
  // ==================================================
  async loadCompanyData() {
    const res = await Api.getCompany();
    if (!res.success) return;

    this.state.company = res.company;
    this.state.paymentMethods = res.paymentMethods || [];

    const comp = res.company;
    const form = document.getElementById('form-company');

    form.name.value = comp.name || '';
    form.description.value = comp.description || '';
    form.address.value = comp.address || '';
    form.number.value = comp.number || '';
    form.neighborhood.value = comp.neighborhood || '';
    form.city.value = comp.city || '';
    form.state.value = comp.state || '';
    form.phone.value = comp.phone || '';
    form.whatsapp.value = comp.whatsapp || '';
    form.instagram.value = comp.instagram || '';
    form.website.value = comp.website || '';
    form.business_hours.value = comp.business_hours || '';

    // Campos auxiliares preservados
    if (form.trade_name) form.trade_name.value = comp.trade_name || '';
    if (form.segment) form.segment.value = comp.segment || '';
    if (form.complement) form.complement.value = comp.complement || '';
    if (form.zip_code) form.zip_code.value = comp.zip_code || '';
    if (form.email) form.email.value = comp.email || '';
    if (form.notes) form.notes.value = comp.notes || '';
    if (form.attendance_policy) form.attendance_policy.value = comp.attendance_policy || '';

    // Renderiza opções de formas de pagamento
    const paymentsContainer = document.getElementById('payment-methods-list');
    if (paymentsContainer) {
      paymentsContainer.innerHTML = '';
      this.state.paymentMethods.forEach((pm) => {
        const label = document.createElement('label');
        label.className = 'custom-checkbox';
        label.innerHTML = `
          <input type="checkbox" name="pm_${pm.name}" data-name="${pm.name}" ${pm.is_active ? 'checked' : ''}>
          <span>${this.escapeHtml(pm.name)}</span>
        `;
        paymentsContainer.appendChild(label);
      });
    }
  },

  async handleSaveCompany(e) {
    e.preventDefault();
    const form = document.getElementById('form-company');

    const companyData = {
      name: form.name.value.trim(),
      trade_name: form.trade_name?.value.trim() || form.name.value.trim(),
      segment: form.segment?.value.trim() || 'Artigos Militares',
      description: form.description.value.trim(),
      address: form.address.value.trim(),
      number: form.number.value.trim(),
      complement: form.complement?.value.trim() || '',
      neighborhood: form.neighborhood.value.trim(),
      city: form.city.value.trim(),
      state: form.state.value.trim(),
      zip_code: form.zip_code?.value.trim() || '',
      phone: form.phone.value.trim(),
      whatsapp: form.whatsapp.value.trim(),
      email: form.email?.value.trim() || '',
      website: form.website.value.trim(),
      instagram: form.instagram.value.trim(),
      business_hours: form.business_hours.value.trim(),
      notes: form.notes?.value.trim() || '',
      attendance_policy: form.attendance_policy?.value.trim() || ''
    };

    // Formas de pagamento
    const paymentMethods = [];
    document.querySelectorAll('#payment-methods-list input[type="checkbox"]').forEach(input => {
      paymentMethods.push({
        name: input.getAttribute('data-name'),
        is_active: input.checked ? 1 : 0
      });
    });

    try {
      const res = await Api.updateCompany({ company: companyData, paymentMethods });
      if (res.success) {
        this.state.company = companyData;
        this.toast('Salvo com sucesso!', 'success');
        this.refreshStatus();
      }
    } catch (err) {
      this.toast('Erro ao salvar dados da loja: ' + err.message, 'error');
    }
  },

  // ==================================================
  // ATENDIMENTOS NO WHATSAPP
  // ==================================================
  async loadAttendances() {
    const res = await Api.getAttendances();
    if (!res.success) return;

    this.state.attendances = res.contacts || [];
    this.renderAttendancesTable();
  },

  renderAttendancesTable() {
    const tbody = document.getElementById('attendances-table-body');
    if (!tbody) return;

    if (this.state.attendances.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 32px;">Nenhum atendimento registrado no momento.</td></tr>`;
      return;
    }

    tbody.innerHTML = this.state.attendances.map(c => {
      const isHuman = c.status === 'HUMANO';
      const statusBadge = isHuman
        ? `<span class="badge badge-warning" style="font-weight: 600;">👨‍💼 ATENDIMENTO HUMANO</span>`
        : `<span class="badge badge-success" style="font-weight: 600;">🤖 SOFIA ATENDENDO</span>`;

      const friendlyContact = this.formatPhoneDisplay(c.contact_id);
      const lastActive = c.last_activity ? new Date(c.last_activity).toLocaleString() : '-';

      // Motivo amigável
      let friendlyReason = '-';
      if (isHuman) {
        if (c.paused_reason && c.paused_reason.includes('transferência')) {
          friendlyReason = 'Cliente solicitou vendedor';
        } else if (c.paused_reason && c.paused_reason.includes('operador')) {
          friendlyReason = 'Assumido pelo operador';
        } else {
          friendlyReason = c.paused_reason || 'Atendimento manual';
        }
      } else {
        friendlyReason = 'Atendimento automático';
      }

      return `
        <tr>
          <td><strong>${friendlyContact}</strong></td>
          <td>${statusBadge}</td>
          <td><small>${this.escapeHtml(friendlyReason)}</small></td>
          <td><small>${lastActive}</small></td>
          <td style="text-align: right;">
            ${isHuman
              ? `<button class="btn btn-success btn-sm" onclick="App.activateSofia('${encodeURIComponent(c.contact_id)}')">🤖 DEVOLVER PARA SOFIA</button>`
              : `<button class="btn btn-warning btn-sm" onclick="App.passToHuman('${encodeURIComponent(c.contact_id)}')">👨‍💼 PASSAR PARA ATENDENTE</button>`
            }
          </td>
        </tr>
      `;
    }).join('');
  },

  async passToHuman(encodedContactId) {
    try {
      const contactId = decodeURIComponent(encodedContactId);
      const res = await Api.passToHuman(contactId);
      if (res.success) {
        this.toast('Atendimento transferido para a equipe humana!', 'info');
        await this.loadAttendances();
        await this.refreshStatus();
      }
    } catch (err) {
      this.toast('Erro ao transferir atendimento: ' + err.message, 'error');
    }
  },

  async activateSofia(encodedContactId) {
    try {
      const contactId = decodeURIComponent(encodedContactId);
      const res = await Api.activateSofia(contactId);
      if (res.success) {
        this.toast('Atendimento devolvido para a Sofia!', 'success');
        await this.loadAttendances();
        await this.refreshStatus();
      }
    } catch (err) {
      this.toast('Erro ao ativar Sofia: ' + err.message, 'error');
    }
  },

  // ==================================================
  // CONFIGURAÇÕES DA SOFIA
  // ==================================================
  async loadSofiaData() {
    const res = await Api.getSofiaConfig();
    if (!res.success) return;

    this.state.sofiaConfig = res.config;
    const conf = res.config;
    const form = document.getElementById('form-sofia');

    form.agent_name.value = conf.agent_name || 'Sofia';
    form.is_active.value = conf.is_active ? '1' : '0';

    // Mapeia estilo / tom
    const toneSelect = document.getElementById('sofia-tone-select');
    const toneInput = document.getElementById('sofia-tone');
    const currentTone = conf.tone || 'Amigável e profissional';

    if (toneInput) toneInput.value = currentTone;
    if (toneSelect) {
      if (currentTone.includes('Objetiva')) {
        toneSelect.value = 'Objetiva';
      } else if (currentTone.includes('Formal')) {
        toneSelect.value = 'Formal';
      } else {
        toneSelect.value = 'Amigável e profissional';
      }
    }

    form.transfer_message.value = conf.transfer_message || '';
    form.greeting_message.value = conf.greeting_message || '';
    form.company_rules.value = conf.company_rules || '';
    form.unavailable_message.value = conf.unavailable_message || '';

    // Campos técnicos preservados
    if (form.max_response_length) form.max_response_length.value = conf.max_response_length || '';
    if (form.additional_instructions) form.additional_instructions.value = conf.additional_instructions || '';
  },

  async handleSaveSofia(e) {
    e.preventDefault();
    const form = document.getElementById('form-sofia');

    const toneVal = document.getElementById('sofia-tone-select')?.value || form.tone?.value || 'Amigável e profissional';

    const configData = {
      agent_name: form.agent_name.value.trim(),
      is_active: parseInt(form.is_active.value, 10),
      tone: toneVal,
      transfer_message: form.transfer_message.value.trim(),
      greeting_message: form.greeting_message.value.trim(),
      company_rules: form.company_rules.value.trim(),
      unavailable_message: form.unavailable_message.value.trim(),
      max_response_length: form.max_response_length?.value.trim() || 'curta e objetiva',
      additional_instructions: form.additional_instructions?.value.trim() || ''
    };

    try {
      const res = await Api.updateSofiaConfig(configData);
      if (res.success) {
        this.toast('Salvo com sucesso!', 'success');
        this.refreshStatus();
      }
    } catch (err) {
      this.toast('Erro ao salvar configurações da Sofia: ' + err.message, 'error');
    }
  },

  // ==================================================
  // CATEGORIAS
  // ==================================================
  async loadCategoriesList() {
    const res = await Api.getCategories();
    if (!res.success) return;

    this.state.categories = res.categories || [];
    this.renderCategoriesTable();
    this.renderCategorySelects();
  },

  renderCategoriesTable() {
    const tbody = document.getElementById('categories-table-body');
    if (!tbody) return;

    if (this.state.categories.length === 0) {
      tbody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: var(--text-muted); padding: 32px;">Nenhuma categoria cadastrada.</td></tr>`;
      return;
    }

    tbody.innerHTML = this.state.categories.map(cat => `
      <tr>
        <td><strong>${this.escapeHtml(cat.name)}</strong></td>
        <td>${this.escapeHtml(cat.description || '-')}</td>
        <td style="text-align: right;">
          <button class="btn btn-secondary btn-sm" onclick="App.openEditCategoryModal(${cat.id})">✏️ Editar</button>
          <button class="btn btn-danger btn-sm" onclick="App.deleteCategory(${cat.id})">🗑️ Excluir</button>
        </td>
      </tr>
    `).join('');
  },

  renderCategorySelects() {
    const filterSelect = document.getElementById('product-category-filter');
    const modalSelect = document.getElementById('prod-category');

    if (filterSelect) {
      const currentVal = filterSelect.value;
      filterSelect.innerHTML = `<option value="">Todas as categorias</option>` +
        this.state.categories.map(c => `<option value="${c.id}">${this.escapeHtml(c.name)}</option>`).join('');
      filterSelect.value = currentVal;
    }

    if (modalSelect) {
      modalSelect.innerHTML = `<option value="">Sem categoria</option>` +
        this.state.categories.map(c => `<option value="${c.id}">${this.escapeHtml(c.name)}</option>`).join('');
    }
  },

  openCategoryModal() {
    document.getElementById('modal-category-title').textContent = '➕ Nova Categoria';
    document.getElementById('cat-id').value = '';
    document.getElementById('cat-name').value = '';
    document.getElementById('cat-description').value = '';
    document.getElementById('modal-category').style.display = 'flex';
  },

  openEditCategoryModal(id) {
    const cat = this.state.categories.find(c => c.id === id);
    if (!cat) return;

    document.getElementById('modal-category-title').textContent = `✏️ Editar Categoria: ${cat.name}`;
    document.getElementById('cat-id').value = cat.id;
    document.getElementById('cat-name').value = cat.name;
    document.getElementById('cat-description').value = cat.description || '';
    document.getElementById('modal-category').style.display = 'flex';
  },

  closeCategoryModal() {
    document.getElementById('modal-category').style.display = 'none';
  },

  async handleSaveCategory(e) {
    e.preventDefault();
    const id = document.getElementById('cat-id').value;
    const name = document.getElementById('cat-name').value.trim();
    const description = document.getElementById('cat-description').value.trim();

    try {
      if (id) {
        await Api.updateCategory(id, { name, description });
        this.toast('Categoria atualizada com sucesso!', 'success');
      } else {
        await Api.createCategory({ name, description });
        this.toast('Categoria cadastrada com sucesso!', 'success');
      }
      this.closeCategoryModal();
      await this.loadCategoriesList();
    } catch (err) {
      this.toast('Erro ao salvar categoria: ' + err.message, 'error');
    }
  },

  async deleteCategory(id) {
    if (!confirm('Tem certeza de que deseja excluir esta categoria?')) return;
    try {
      await Api.deleteCategory(id);
      this.toast('Categoria excluída com sucesso!', 'success');
      await this.loadCategoriesList();
    } catch (err) {
      this.toast('Erro ao excluir categoria: ' + err.message, 'error');
    }
  },

  // ==================================================
  // SALVAR & RESTAURAR DADOS (BACKUP)
  // ==================================================
  async handleImportBackup() {
    const fileInput = document.getElementById('backup-file-input');
    if (!fileInput.files || fileInput.files.length === 0) {
      this.toast('Selecione um arquivo de backup primeiro.', 'warning');
      return;
    }

    if (!confirm('Atenção: A restauração irá atualizar os produtos e dados da loja com os dados deste arquivo. Deseja continuar?')) {
      return;
    }

    const file = fileInput.files[0];
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const jsonData = JSON.parse(e.target.result);
        const res = await Api.importBackup(jsonData);
        if (res.success) {
          this.toast('Dados restaurados com sucesso!', 'success');
          fileInput.value = '';
          this.loadCurrentViewData();
        }
      } catch (err) {
        this.toast('Erro ao restaurar dados: ' + err.message, 'error');
      }
    };

    reader.readAsText(file);
  },

  // ==================================================
  // FORMATADORES E HELPERS (SEM JARGÕES TÉCNICOS)
  // ==================================================
  formatPhoneDisplay(raw) {
    if (!raw) return 'Cliente no WhatsApp';

    const str = String(raw).trim();

    // Se for formato @lid (identificador anônimo)
    if (str.includes('@lid')) {
      const cleanDigits = str.replace(/\D/g, '');
      const lastFour = cleanDigits.slice(-4);
      return `Cliente no WhatsApp ${lastFour ? `(Final ...${lastFour})` : ''}`;
    }

    // Extrai números
    let digits = str.replace('@c.us', '').replace(/\D/g, '');

    // Se for número brasileiro com 55 no início (DDD + número = 10 ou 11 dígitos)
    if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
      digits = digits.substring(2);
    }

    if (digits.length === 11) {
      // Celular: (XX) 9XXXX-XXXX
      return `(${digits.substring(0, 2)}) ${digits.substring(2, 7)}-${digits.substring(7)}`;
    } else if (digits.length === 10) {
      // Fixo: (XX) XXXX-XXXX
      return `(${digits.substring(0, 2)}) ${digits.substring(2, 6)}-${digits.substring(6)}`;
    }

    return digits || str;
  },

  toast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toastEl = document.createElement('div');
    toastEl.className = `toast toast-${type}`;
    toastEl.textContent = message;

    container.appendChild(toastEl);

    setTimeout(() => {
      toastEl.style.opacity = '0';
      toastEl.style.transform = 'translateY(10px)';
      toastEl.style.transition = 'all 0.3s ease';
      setTimeout(() => toastEl.remove(), 300);
    }, 3500);
  },

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
};

document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
