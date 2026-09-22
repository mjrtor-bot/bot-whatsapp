/**
 * public/js/auth.js
 *
 * Gerenciamento de estado de autenticação no cliente.
 */

const Auth = {
  currentUser: null,

  async check() {
    try {
      const res = await Api.getAuthMe();
      if (res && res.authenticated) {
        this.currentUser = res.user;
        return true;
      }
      return false;
    } catch (_) {
      return false;
    }
  },

  async requireAuth() {
    const isAuth = await this.check();
    if (!isAuth) {
      if (window.location.pathname.includes('login.html') || window.location.pathname.includes('setup.html')) {
        return;
      }
      try {
        const setup = await Api.getSetupStatus();
        if (setup && setup.setupRequired) {
          window.location.href = '/setup.html';
          return;
        }
      } catch (_) {}
      window.location.href = '/login.html';
    }
  },

  async logout() {
    try {
      await Api.logout();
    } catch (_) {
    } finally {
      window.location.href = '/login.html';
    }
  }
};
