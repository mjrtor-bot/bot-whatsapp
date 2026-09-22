# 🤖 Agente de Atendimento WhatsApp com IA - ART ARTIGOS MILITARES

Agente inteligente de atendimento ao cliente para WhatsApp desenvolvido em **Node.js (CommonJS)**, utilizando a biblioteca **whatsapp-web.js** com autenticação persistente (`LocalAuth`) e a API da **OpenAI** para atendimento comercial automatizado, humanizado e seguro para a empresa **ART ARTIGOS MILITARES**.

---

## 🏢 Sobre a Empresa e a Atendente Virtual

- **Empresa:** ART ARTIGOS MILITARES
- **Atendente Virtual:** Sofia
- **Segmento:** Fardamentos, coturnos, mochilas táticas, cintos táticos, gandolas, calças camufladas e acessórios militares/operacionais.
- **Endereço:** Rua do Café, 123 - Centro
- **Horário de Atendimento:** Segunda a Sexta, das 08h às 18h | Sábado, das 08h às 12h
- **Formas de Pagamento:** PIX, Cartão de Crédito e Débito

---

## 📋 Funcionalidades Principais

- 📱 **Conexão via WhatsApp Web:** Geração de QR Code no terminal e persistência de sessão via `LocalAuth` (sem necessidade de escanear novamente a cada reinicialização).
- 🖥️ **Painel Administrativo Web Completo (`http://localhost:3000`):**
  - **Dashboard:** Visão geral com métricas em tempo real, status do WhatsApp, Sofia e OpenAI.
  - **Empresa:** Edição de dados cadastrais, endereço, horários e seleção de métodos de pagamento ativos (PIX, Cartão de Crédito/Débito, Dinheiro, Boleto, etc.).
  - **Produtos & Categorias:** CRUD completo de produtos, marcas, fotos, preços promocionais e controle ativo/inativo.
  - **Estoque por Variação:** Grade de tamanhos (38 a 48, P a GG) e cores com controle exato de quantidade em estoque.
  - **Motor de Busca de Catálogo Local (`catalogService.js`):** Extração inteligente de intenções, tamanhos e termos (ex: *"Tem coturno 42?"*) para alimentar o prompt da Sofia com fatos verificados do SQLite.
  - **Configurações da Sofia:** Personalização do nome da atendente, tom, mensagem de saudação, mensagem de transferência e regras comerciais adicionais.
  - **Gestão de Atendimentos:** Tabela de contatos com alternância instantânea entre `SOFIA` e `HUMANO` sincronizada com `#humano` e `#sofia`.
  - **Backup & Restauração:** Exportação e importação de dados operacionais em JSON seguro.
  - **Segurança:** Autenticação com sessão protegida por `ADMIN_USER` e `ADMIN_PASSWORD` (sem vazamento de credenciais).
- 💬 **Atendimento Privado Inteligente:** Responde exclusivamente a conversas privadas (ignora grupos `@g.us`, canais/newsletters `@newsletter` e status/broadcasts `@broadcast`).
- 🚫 **Regras Rígidas Anti-Alucinação:**
  - **Preços e Estoque:** Nunca inventa valores, tamanhos ou disponibilidade. Consulta o estoque real via catálogo local. Se o produto/tamanho estiver disponível, confirma o valor e disponibilidade; se estiver esgotado ou inexistente, informa com transparência e oferece transferência.
  - **Sem Promessas Falsas:** Nunca diz *"aguarde que vou verificar"* ou *"estou consultando o sistema"* se nenhuma consulta automatizada real estiver ocorrendo.
- 👤 **Transferência Automática para Atendimento Humano:**
  - Detecta intenções do cliente como *"quero falar com vendedor"*, *"atendente"*, *"humano"*, *"pessoa"*, *"chamar alguém"*.
  - Envia aviso cordial de transferência, pausa a IA para o contato e registra o log `[TRANSFERÊNCIA]`.
- 🛠️ **Comandos Administrativos Exclusivos do Operador:**
  - `#humano`: Pausa a Sofia no chat onde o operador enviou o comando, permitindo atendimento manual sem interferência.
  - `#sofia`: Reativa o atendimento automático da Sofia no chat selecionado.
  - **Segurança:** Comandos administrativos só são executados quando enviados pelo próprio WhatsApp da empresa (`msg.fromMe === true`). Clientes não conseguem acionar comandos administrativos.
- 💾 **Persistência de Estado Confiável (SQLite + JSON):**
  - Contatos em atendimento humano são salvos no banco SQLite `data/bot-whatsapp.db` e sincronizados no `data/attendance-state.json`.
  - Escrita atômica e segura (via arquivo `.tmp`).
  - Carregamento automático na inicialização do serviço.
- 🛡️ **Tolerância a Falhas e Resiliência:**
  - Fallback no envio de mensagens (`msg.reply()` com fallback para `client.sendMessage()`).
  - Simulação segura de status *"digitando..."* sem travar a thread de execução.
  - Tratamento de exceções e erros da OpenAI (401, 429, timeout) mantendo o bot sempre ativo.
- 📊 **Padronização de Logs:**
  - `[MENSAGEM RECEBIDA]`, `[PROCESSANDO IA]`, `[RESPOSTA IA]`, `[RESPOSTA ENVIADA]`, `[TRANSFERÊNCIA]`, `[ADMIN]`, `[ATENDIMENTO HUMANO]`, `[ERRO OPENAI]`, `[ERRO WHATSAPP]`.

---

## 📁 Estrutura do Projeto

```
bot-whatsapp/
├── .env                  # Variáveis de ambiente locais (não versionado)
├── .env.example          # Modelo de configuração de variáveis de ambiente
├── .gitignore            # Regras de exclusão do Git (sessões, chaves, temporários, SQLite)
├── catalogService.js     # Motor de busca inteligente no catálogo local
├── chatManager.js        # Gestão de histórico, detecção humana, comandos e idempotência
├── company.js            # Informações da empresa e geração dinâmica do prompt da Sofia
├── db.js                 # Gerenciamento do banco SQLite (node:sqlite) e migrations
├── index.js              # Inicializador unificado (Express + WhatsApp Client)
├── openaiService.js      # Integração segura com OpenAI e injeção de fatos do catálogo
├── package.json          # Dependências e scripts (npm start, npm test)
├── public/               # Interface Web do Painel Administrativo SPA
│   ├── index.html        # Painel SPA com seções e modais
│   ├── login.html        # Tela de login administrativo
│   ├── css/style.css     # Estilização moderna e responsiva
│   └── js/
│       ├── api.js        # Cliente HTTP REST para as rotas da API
│       ├── app.js        # Lógica de interface, renderização e CRUDs
│       └── auth.js       # Autenticação e sessão administrativa
├── server.js             # Servidor Express, rotas da API REST e autenticação
├── test.js               # Suíte completa de 31 testes automatizados
├── whatsappStatus.js     # Rastreamento unificado de status do sistema
└── README.md             # Documentação oficial
```

---

## 🚀 Pré-requisitos e Instalação

### 1. Pré-requisitos
- **Node.js** 18.x ou superior ([nodejs.org](https://nodejs.org/))
- **NPM** ou gerenciador de pacotes equivalente
- Chave de API da **OpenAI** com créditos válidos

### 2. Instalação das Dependências
Abra o terminal na pasta do projeto e execute:

```bash
npm install
```

---

## ⚙️ Configuração do Ambiente (.env)

Copie o arquivo de exemplo para criar seu `.env`:

```bash
cp .env.example .env
```

Edite o arquivo `.env` com sua chave e parâmetros desejados:

```env
# Chave de API da OpenAI (Obrigatório)
OPENAI_API_KEY=sk-proj-sua-chave-aqui...

# Modelo da OpenAI (Opcional, padrão: gpt-4o-mini)
OPENAI_MODEL=gpt-4o-mini

# Limite de mensagens recentes no histórico por contato (padrão: 10)
MAX_HISTORY_MESSAGES=10

# Porta do Painel Administrativo Web (padrão: 3000)
PORT=3000

# Credenciais do Painel Administrativo Web
ADMIN_USER=admin
ADMIN_PASSWORD=admin123
SESSION_SECRET=art_artigos_militares_admin_secret_session_2026
```

> 🔒 **Segurança:** O arquivo `.env`, o banco de dados `data/*.db` e a pasta de sessão `.wwebjs_auth/` estão no `.gitignore`. Nunca envie suas credenciais ou arquivos de sessão para o repositório.

---

## ▶️ Como Executar

### 1. Iniciar o Sistema (Bot WhatsApp + Painel Web)
Para iniciar a Sofia e o Painel Administrativo Web em paralelo:

```bash
npm start
```
*(ou `node index.js`)*

Ao inicializar, o servidor web estará ativo em: **`http://localhost:3000`**

### 2. Conectar com o WhatsApp pelo Painel Web
O administrador **não precisa usar o terminal** para conectar o WhatsApp:
1. Acesse **`http://localhost:3000`** no seu navegador.
2. Faça login com as credenciais configuradas (`ADMIN_USER` e `ADMIN_PASSWORD`).
3. No **Dashboard**, você verá a área **WhatsApp**:
   - **Aguardando QR Code:** O QR Code visual será renderizado em tempo real com as instruções:
     > *"No WhatsApp da empresa, acesse Aparelhos conectados > Conectar aparelho e escaneie o QR Code."*
   - **Autenticando:** Mensagem *"WhatsApp autenticado. Finalizando conexão..."*
   - **Conectado:** Mensagem *"WhatsApp conectado e Sofia pronta para atendimento."* e status **CONECTADO** em verde.
   - **Desconectar WhatsApp:** Botão com modal de confirmação segura.
4. O frontend atualiza o status automaticamente a cada 3 segundos sem recarregar a página.

---

## 🧪 Suíte de Testes Automatizados

Para executar todos os 31 testes automatizados (regras de negócio, comandos, anti-alucinação, deduplicação, SQLite, catálogo de estoque, Sofia e Painel Web):

```bash
npm test
```

### Principais Áreas Cobertas no `test.js`:
- **Parte 1 (Atendimento & WhatsApp):**
  - Configuração da empresa e geração do prompt.
  - Gatilhos de atendimento humano (*"quero falar com vendedor"*, etc.).
  - Comandos administrativos `#humano` e `#sofia` do operador.
  - Compatibilidade com IDs `@c.us` e `@lid`.
  - Cenários anti-alucinação de preço e estoque (Cenários A a J).
  - Deduplicação e idempotência contra triplicação de eventos.
  - Persistência resiliente em `attendance-state.json`.
- **Parte 2 (SQLite, Catálogo & Painel Web):**
  - Inicialização e migrations automáticas do SQLite (`data/bot-whatsapp.db`).
  - CRUD completo de Categorias e Produtos com variações de estoque.
  - Motor de busca no catálogo local (`catalogService.js`) para perguntas como *"Tem coturno 42?"*.
  - Prompt dinâmico da Sofia consumindo regras e catálogo do SQLite.
  - Sincronização bidirecional de atendimentos entre SQLite e chatManager.
  - Monitoramento seguro de status do WhatsApp, ciclo de vida e QR Code visual.
  - Exportação e importação transacional de backups em JSON.
- **Cenário D:** Cliente envia "Quero falar com vendedor" -> Ativação automática de atendimento humano.
- **Cenário E:** Cliente pausado envia mensagem -> IA não é chamada e mensagem fica disponível para o operador.
- **Cenário F:** Operador envia `#sofia` -> Sofia é reativada para o contato.
- **Cenário G:** Cliente envia nova mensagem após `#sofia` -> IA volta a responder normalmente.
- **Cenário H:** Operador envia `#humano` -> Sofia é pausada manualmente para aquele contato.
- **Cenário I:** Cliente envia `#sofia` -> Cliente NÃO tem permissão de comando administrativo; Sofia permanece no estado atual.
- **Cenário J:** Reinicialização do Node.js -> Contatos pausados permanecem preservados em `data/attendance-state.json`.

---

## 🛡️ Gestão de Atendimento Humano e Comandos

| Situação | Ação do Sistema / Operador | Efeito |
|---|---|---|
| **Cliente pede atendente** | Cliente digita *"quero falar com vendedor"* | Sofia avisa que transferiu, pausa a IA e loga `[TRANSFERÊNCIA]`. |
| **Operador assume chat** | Operador envia `#humano` na conversa | Sofia é pausada no chat e loga `[ADMIN] Sofia pausada`. |
| **Operador devolve chat** | Operador envia `#sofia` na conversa | Sofia volta a atender automaticamente e loga `[ADMIN] Atendimento automático reativado`. |
| **Cliente tenta usar comando** | Cliente envia `#sofia` ou `#humano` | O comando é ignorado para o cliente (`msg.fromMe === false`). |

---

## 📝 Roteiro para Testes Reais no WhatsApp

Após iniciar com `npm start` e conectar o aparelho:

1. **TESTE REAL 1 (Atendimento Inicial e Horário):**
   - No celular de teste (cliente), envie: *"Boa tarde, qual o horário de funcionamento de vocês?"*
   - Verifique se a Sofia responde informando os horários da ART ARTIGOS MILITARES de forma comercial e sem inventar dados.
2. **TESTE REAL 2 (Anti-alucinação de Estoque e Preço):**
   - No celular de teste (cliente), envie: *"Vocês têm coturno tamanho 42 a pronta entrega e quanto custa?"*
   - Verifique se a Sofia esclarece que trabalha com artigos militares, informa que a disponibilidade e valor exato precisam ser confirmados com a equipe e se oferece para chamar um vendedor.
3. **TESTE REAL 3 (Transferência Automática para Humano):**
   - No celular de teste (cliente), envie: *"Quero falar com um vendedor"*
   - Verifique se a Sofia envia a mensagem de transferência e se o terminal registra `[TRANSFERÊNCIA]`.
4. **TESTE REAL 4 (Silêncio da IA em Atendimento Humano):**
   - No celular de teste (cliente), envie: *"Olá, ainda estou aguardando..."*
   - Verifique se a Sofia **NÃO responde** e o terminal exibe `[ATENDIMENTO HUMANO]`.
5. **TESTE REAL 5 (Reativação pelo Operador):**
   - No WhatsApp da empresa, abra a conversa com esse cliente e envie a mensagem: `#sofia`
   - Verifique no terminal o log `[ADMIN] Atendimento automático reativado`.
   - Envie uma nova mensagem do celular do cliente (ex: *"Vocês vendem gandola?"*) e confirme que a Sofia voltou a responder normalmente.
6. **TESTE REAL 6 (Pausa Manual pelo Operador):**
   - No WhatsApp da empresa, envie na conversa com o cliente: `#humano`
   - Verifique o log `[ADMIN] Sofia pausada`.
   - Envie uma mensagem pelo cliente e certifique-se de que a Sofia permaneceu em silêncio.
7. **TESTE REAL 7 (Persistência pós-reinício):**
   - Com o cliente pausado, pare o processo no terminal (`Ctrl + C`) e execute `npm start` novamente.
   - Observe no log de inicialização que o contato pausado foi recarregado.
   - Envie uma mensagem do cliente e comprove que a Sofia permanece pausada.
