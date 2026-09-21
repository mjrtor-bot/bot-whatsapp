# 🤖 Agente de Atendimento para WhatsApp com IA

Um agente inteligente de atendimento ao cliente para WhatsApp desenvolvido em **Node.js (CommonJS)**, utilizando a biblioteca **whatsapp-web.js** com autenticação persistente (`LocalAuth`) e a API da **OpenAI** para gerar respostas precisas, cordiais e personalizadas sobre a sua empresa.

---

## 📋 Funcionalidades

- 📱 **Conexão via QR Code:** Exibe o QR Code diretamente no terminal para conexão simples e rápida.
- 🔐 **Sessão Persistente:** Utiliza `LocalAuth` para manter a sessão salva após o primeiro escaneamento.
- 💬 **Atendimento Privado Inteligente:**
  - Responde apenas a conversas privadas (ignora grupos automaticamente).
  - Ignora atualizações de status e mensagens enviadas pelo próprio número.
  - Responde exclusivamente a mensagens de texto.
- ✍️ **Indicador de Digitação:** Exibe o status de *"digitando..."* no WhatsApp enquanto processa a resposta.
- 🧠 **Histórico de Conversa:** Mantém um histórico recente individual para cada cliente para manter o contexto do diálogo.
- 🏢 **Fácil Customização da Empresa:** Arquivo `company.js` centralizado para configurar nome, produtos, serviços, preços, horários, endereço e regras.
- 🚫 **Anti-Alucinação:** O agente é instruído a **nunca inventar informações**. Quando não souber responder, avisa cordialmente e direciona para atendimento humano.
- 👤 **Suporte a Atendimento Humano:**
  - Identifica quando o cliente quer falar com uma pessoa (ex: *"quero falar com atendente"*, *"humano"*, *"pessoa"*).
  - Pausa automaticamente as respostas da IA para aquele cliente.
  - Permite reativar o bot facilmente a qualquer momento com o comando `#bot` ou `#ativar`.
- 🛡️ **Tolerância a Falhas:** Tratamento de erros robusto sem interromper ou derrubar o processo.

---

## 📁 Estrutura do Projeto

```
bot-whatsapp/
├── .env                  # Arquivo de configuração de variáveis de ambiente (local)
├── .env.example          # Modelo de variáveis de ambiente
├── .gitignore            # Arquivos ignorados pelo Git (sessões, chaves, node_modules)
├── chatManager.js        # Gerenciamento de histórico e controle de atendimento humano
├── company.js            # Configuração dos dados da empresa e geração do prompt de sistema
├── index.js              # Ponto de entrada e fluxo principal do WhatsApp
├── openaiService.js      # Integração com a API da OpenAI
├── package.json          # Dependências e metadados do projeto
└── README.md             # Documentação completa do projeto
```

---

## 🚀 Como Começar

### 1. Pré-requisitos

- **Node.js** versão 18 ou superior instalada ([nodejs.org](https://nodejs.org/)).
- Uma conta na **OpenAI** com créditos disponíveis e uma chave de API gerada.

### 2. Instalação

Abra o terminal na pasta do projeto e instale as dependências:

```bash
npm install
```

---

## ⚙️ Configuração

### Onde colocar a chave `OPENAI_API_KEY`

1. Abra o arquivo `.env` na raiz do projeto (se não existir, copie o `.env.example` para `.env`):
   ```bash
   cp .env.example .env
   ```

2. Adicione sua chave da OpenAI no campo `OPENAI_API_KEY`:

```env
# Insira sua chave da OpenAI abaixo:
OPENAI_API_KEY=sk-proj-sua-chave-aqui...

# Modelo da OpenAI (opcional, padrão: gpt-4o-mini)
OPENAI_MODEL=gpt-4o-mini

# Limite de mensagens mantidas no histórico por cliente (padrão: 10)
MAX_HISTORY_MESSAGES=10
```

> ⚠️ **Importante:** Nunca compartilhe ou faça commit do seu arquivo `.env` com sua chave real.

---

## 🏢 Como Alterar os Dados da Empresa

Todas as informações da empresa estão centralizadas no arquivo **`company.js`**.

Abra o arquivo `company.js` e personalize os campos:

```javascript
const companyConfig = {
  name: "Nome da Sua Empresa",
  description: "Descrição clara do que sua empresa faz.",
  openingHours: "Segunda a Sexta, das 08h00 às 18h00.",
  address: "Rua Exemplo, 123 - Cidade/UF",
  phone: "(11) 99999-9999",
  email: "contato@suaempresa.com.br",
  website: "https://www.suaempresa.com.br",

  // Adicione ou edite seus produtos:
  products: [
    { name: "Produto 1", description: "Descrição do produto", price: "R$ 99,90" }
  ],

  // Adicione ou edite seus serviços:
  services: [
    { name: "Serviço 1", description: "Descrição do serviço", price: "R$ 150,00" }
  ],

  // Formas de pagamento aceitas:
  paymentMethods: [
    "PIX (5% de desconto)",
    "Cartão de Crédito em até 3x sem juros",
    "Boleto Bancário"
  ],

  // Regras de atendimento e comportamento do agente:
  serviceRules: [
    "Responda sempre em português do Brasil com educação e clareza.",
    "Nunca invente informações fora deste catálogo."
  ]
};
```

O prompt de sistema é montado dinamicamente a partir dessas informações através da função `getSystemPrompt()`.

---

## ▶️ Como Executar

Para iniciar o agente de atendimento, execute:

```bash
node index.js
```

### Escaneando o QR Code

1. Ao rodar o comando, um **QR Code** será desenhado no terminal.
2. No celular com o WhatsApp:
   - Abra o **WhatsApp**.
   - Acesse **Configurações / Ajustes** (no iOS) ou toque nos **três pontinhos** no canto superior direito (no Android).
   - Toque em **Aparelhos conectados**.
   - Toque no botão **Conectar aparelho**.
   - Aponte a câmera para o QR Code exibido no terminal.
3. Quando a conexão for concluída, a mensagem abaixo será exibida no terminal:

```
WhatsApp conectado e agente pronto para atendimento.
```

4. A partir desse momento, qualquer mensagem de texto recebida em conversa privada será atendida automaticamente pela IA.

---

## 👤 Como Funciona o Atendimento Humano

O agente possui detecção automática de solicitações de atendimento humano:

### 1. Transferência para Atendente Humano
Se o cliente enviar termos como:
- *"quero falar com atendente"*
- *"quero falar com uma pessoa"*
- *"atendente"*
- *"humano"*
- *"falar com alguém"*

O agente irá:
1. Enviar uma mensagem avisando que está transferindo o atendimento para a equipe humana.
2. **Pausar as respostas automáticas** para aquele número específico.
3. Permitir que o operador humano converse com o cliente normalmente pelo WhatsApp Web ou celular sem interferência do bot.

### 2. Reativação do Atendimento Automático
Para reativar as respostas da IA para aquele contato, basta o cliente (ou o atendente no chat) enviar uma das seguintes palavras de comando:
- `#bot`
- `#ativar`
- `#voltar`
- `#auto`

O agente responderá confirmando a reativação:
> *✅ Atendimento automático reativado! Como posso ajudar você agora?*

---

## 🛡️ Boas Práticas e Segurança

- Os dados de sessão do WhatsApp são salvos na pasta `.wwebjs_auth/` para evitar que você precise ler o QR Code toda vez que iniciar o bot.
- A pasta `.wwebjs_auth/` e o arquivo `.env` estão incluídos no `.gitignore` para garantir que nenhuma credencial seja exposta.
- Para desconectar e forçar um novo QR Code, basta apagar a pasta `.wwebjs_auth/`.
