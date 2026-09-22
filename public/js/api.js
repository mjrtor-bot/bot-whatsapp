/**
 * public/js/api.js
 *
 * Camada de comunicação com a API REST do Painel Administrativo.
 * Trata erros de requisição e redirecionamentos de autenticação de forma centralizada.
 */

const Api = {
  async request(endpoint, options = {}) {
    const url = endpoint.startsWith('/') ? endpoint : `/api/${endpoint}`;
    const defaultHeaders = {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    };

    const config = {
      ...options,
      headers: {
        ...defaultHeaders,
        ...(options.headers || {})
      }
    };

    if (config.body && typeof config.body === 'object' && !(config.body instanceof FormData)) {
      config.body = JSON.stringify(config.body);
    }

    try {
      const res = await fetch(url, config);

      if (res.status === 401) {
        if (!window.location.pathname.includes('login.html')) {
          window.location.href = '/login.html';
        }
        return { success: false, error: 'Sessão expirada ou não autorizada.' };
      }

      const contentType = res.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || `Erro HTTP ${res.status}`);
        }
        return data;
      }

      return res;
    } catch (err) {
      console.error(`[API Error] ${options.method || 'GET'} ${url}:`, err);
      throw err;
    }
  },

  // Auth
  async getSetupStatus() {
    return this.request('/api/auth/setup-status');
  },

  async setupAccess(data) {
    return this.request('/api/auth/setup', {
      method: 'POST',
      body: data
    });
  },

  async login(username, password) {
    return this.request('/api/auth/login', {
      method: 'POST',
      body: { username, password }
    });
  },

  async logout() {
    return this.request('/api/auth/logout', { method: 'POST' });
  },

  async getAuthMe() {
    return this.request('/api/auth/me');
  },

  // Status & Dashboard
  async getStatus() {
    return this.request('/api/status');
  },

  async disconnectWhatsApp() {
    return this.request('/api/whatsapp/disconnect', {
      method: 'POST'
    });
  },

  async reconnectWhatsApp() {
    return this.request('/api/whatsapp/reconnect', {
      method: 'POST'
    });
  },

  // Empresa
  async getCompany() {
    return this.request('/api/company');
  },

  async updateCompany(payload) {
    return this.request('/api/company', {
      method: 'PUT',
      body: payload
    });
  },

  // Categorias
  async getCategories() {
    return this.request('/api/categories');
  },

  async createCategory(data) {
    return this.request('/api/categories', {
      method: 'POST',
      body: data
    });
  },

  async updateCategory(id, data) {
    return this.request(`/api/categories/${id}`, {
      method: 'PUT',
      body: data
    });
  },

  async deleteCategory(id) {
    return this.request(`/api/categories/${id}`, {
      method: 'DELETE'
    });
  },

  // Produtos
  async getProducts(params = {}) {
    const query = new URLSearchParams();
    if (params.search) query.append('search', params.search);
    if (params.category_id) query.append('category_id', params.category_id);
    if (params.is_active !== undefined) query.append('is_active', params.is_active);

    const queryString = query.toString();
    const endpoint = queryString ? `/api/products?${queryString}` : '/api/products';
    return this.request(endpoint);
  },

  async getProduct(id) {
    return this.request(`/api/products/${id}`);
  },

  async createProduct(data) {
    return this.request('/api/products', {
      method: 'POST',
      body: data
    });
  },

  async updateProduct(id, data) {
    return this.request(`/api/products/${id}`, {
      method: 'PUT',
      body: data
    });
  },

  async deleteProduct(id) {
    return this.request(`/api/products/${id}`, {
      method: 'DELETE'
    });
  },

  async toggleProductActive(id) {
    return this.request(`/api/products/${id}/toggle`, {
      method: 'PATCH'
    });
  },

  async updateVariationStock(productId, variationId, stock_quantity) {
    return this.request(`/api/products/${productId}/variations/${variationId}/stock`, {
      method: 'PATCH',
      body: { stock_quantity }
    });
  },

  // Sofia Config
  async getSofiaConfig() {
    return this.request('/api/sofia/config');
  },

  async updateSofiaConfig(data) {
    return this.request('/api/sofia/config', {
      method: 'PUT',
      body: data
    });
  },

  // Atendimentos
  async getAttendances() {
    return this.request('/api/attendances');
  },

  async passToHuman(contactId) {
    return this.request(`/api/attendances/${encodeURIComponent(contactId)}/human`, {
      method: 'POST'
    });
  },

  async activateSofia(contactId) {
    return this.request(`/api/attendances/${encodeURIComponent(contactId)}/sofia`, {
      method: 'POST'
    });
  },

  // Backup
  async exportBackup() {
    window.location.href = '/api/backup/export';
  },

  async importBackup(jsonData) {
    return this.request('/api/backup/import', {
      method: 'POST',
      body: jsonData
    });
  }
};
