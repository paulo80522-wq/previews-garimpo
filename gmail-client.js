/**
 * GMAIL CLIENT (MÓDULO DE TRANSPORTE E SEGURANÇA GMAIL API)
 * Garimpo Sites - Executor de E-mail
 * 
 * DIRETRIZES DE SEGURANÇA:
 * 1. Utiliza OAuth 2.0 para aplicação Desktop.
 * 2. Escopo estrito e exclusivo: https://www.googleapis.com/auth/gmail.send
 * 3. As credenciais e tokens são carregados exclusivamente de C:\Users\35tul\.gemini\config\credentials\gmail\
 * 4. NUNCA decide sozinho enviar e-mails. É invocado exclusivamente pelo dispatcher após validação formal do Gate.
 * 5. O modo padrão é estritamente DRY-RUN (sem envio real de rede).
 * 6. O envio real exige explicitamente a flag productionSend === true.
 * 7. Remetente oficial obrigatório: paulonunes.consultoriadigital@gmail.com
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const DEFAULT_CREDENTIALS_DIR = 'C:\\Users\\35tul\\.gemini\\config\\credentials\\gmail';
const REQUIRED_SCOPE = 'https://www.googleapis.com/auth/gmail.send';
const OFFICIAL_SENDER = 'paulonunes.consultoriadigital@gmail.com';
const SENDER_DISPLAY_NAME = 'Paulo Nunes | Consultoria de Presença Digital';

/**
 * Converte Buffer/String para Base64URL (conforme RFC 4648 §5)
 */
function toBase64Url(strOrBuffer) {
  const buf = Buffer.isBuffer(strOrBuffer) ? strOrBuffer : Buffer.from(strOrBuffer, 'utf8');
  return buf.toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Codifica o cabeçalho Subject em formato MIME encoded-word (RFC 2047)
 */
function encodeMimeHeader(text) {
  if (!text) return '';
  const base64Text = Buffer.from(text, 'utf8').toString('base64');
  return `=?UTF-8?B?${base64Text}?=`;
}

/**
 * Constrói a mensagem RFC 2822 / MIME completa e codificada em Base64URL
 */
function buildRfc2822Message(params) {
  const { from, to, subject, bodyText, previewUrl } = params;

  if (!to) {
    throw new Error('Destinatário ("to") é obrigatório para construção da mensagem RFC 2822.');
  }

  const senderAddress = from || OFFICIAL_SENDER;
  if (senderAddress !== OFFICIAL_SENDER) {
    throw new Error(`Remetente inválido: "${senderAddress}". Esperado estritamente "${OFFICIAL_SENDER}".`);
  }

  let fullBody = bodyText || '';
  if (previewUrl && !fullBody.includes(previewUrl)) {
    fullBody += `\n\nLink do Protótipo Visual:\n${previewUrl}`;
  }

  const encodedSubject = encodeMimeHeader(subject || 'Contato Consultoria de Presença Digital');
  const bodyBase64 = Buffer.from(fullBody, 'utf8').toString('base64');

  const rawMessage = [
    `From: "${SENDER_DISPLAY_NAME}" <${OFFICIAL_SENDER}>`,
    `To: <${to.trim()}>`,
    `Subject: ${encodedSubject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    bodyBase64
  ].join('\r\n');

  return {
    rawMessage,
    rawBase64Url: toBase64Url(Buffer.from(rawMessage, 'utf8'))
  };
}

/**
 * Verifica o status de configuração das credenciais e tokens locais
 */
function checkCredentialsStatus(options = {}) {
  const credDir = options.credentialsDir || DEFAULT_CREDENTIALS_DIR;
  const credPath = path.join(credDir, 'credentials.json');
  const tokenPath = path.join(credDir, 'token.json');

  const status = {
    credentialsDir: credDir,
    credentialsExists: false,
    tokenExists: false,
    hasValidClientId: false,
    hasRefreshToken: false,
    hasValidScope: false,
    scopesFound: [],
    readyForSend: false,
    reason: null
  };

  // 1. Verifica credentials.json
  if (options.credentialsOverride) {
    status.credentialsExists = true;
    const creds = options.credentialsOverride.installed || options.credentialsOverride.web || options.credentialsOverride;
    status.hasValidClientId = Boolean(creds && creds.client_id && creds.client_secret);
  } else if (fs.existsSync(credPath)) {
    status.credentialsExists = true;
    try {
      const credData = JSON.parse(fs.readFileSync(credPath, 'utf8'));
      const creds = credData.installed || credData.web || credData;
      status.hasValidClientId = Boolean(creds && creds.client_id && creds.client_secret);
    } catch (e) {
      status.hasValidClientId = false;
      status.reason = `INVALID_CREDENTIALS_JSON: ${e.message}`;
    }
  }

  // 2. Verifica token.json
  if (options.tokenOverride) {
    status.tokenExists = true;
    const token = options.tokenOverride;
    status.hasRefreshToken = Boolean(token && (token.refresh_token || token.access_token));
    const scopes = typeof token.scope === 'string' ? token.scope.split(' ') : (token.scopes || []);
    status.scopesFound = scopes;
    status.hasValidScope = scopes.includes(REQUIRED_SCOPE);
  } else if (fs.existsSync(tokenPath)) {
    status.tokenExists = true;
    try {
      const tokenData = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
      status.hasRefreshToken = Boolean(tokenData && (tokenData.refresh_token || tokenData.access_token));
      const scopes = typeof tokenData.scope === 'string' ? tokenData.scope.split(' ') : (tokenData.scopes || []);
      status.scopesFound = scopes;
      status.hasValidScope = scopes.includes(REQUIRED_SCOPE);
    } catch (e) {
      status.tokenExists = false;
      status.reason = `INVALID_TOKEN_JSON: ${e.message}`;
    }
  }

  status.readyForSend = status.credentialsExists && status.hasValidClientId && status.tokenExists && status.hasRefreshToken && status.hasValidScope;

  if (!status.readyForSend && !status.reason) {
    if (!status.credentialsExists) status.reason = 'CREDENTIALS_FILE_NOT_FOUND';
    else if (!status.hasValidClientId) status.reason = 'CREDENTIALS_INVALID_OR_INCOMPLETE';
    else if (!status.tokenExists) status.reason = 'TOKEN_FILE_NOT_FOUND';
    else if (!status.hasRefreshToken) status.reason = 'REFRESH_TOKEN_NOT_FOUND';
    else if (!status.hasValidScope) status.reason = 'REQUIRED_SCOPE_NOT_AUTHORIZED';
  }

  return status;
}

/**
 * Carrega e valida credenciais OAuth locais
 */
function loadCredentials(options = {}) {
  let clientConfig;
  if (options.credentialsOverride) {
    const data = options.credentialsOverride;
    clientConfig = data.installed || data.web || data;
  } else {
    const credDir = options.credentialsDir || DEFAULT_CREDENTIALS_DIR;
    const credPath = path.join(credDir, 'credentials.json');

    if (!fs.existsSync(credPath)) {
      throw new Error(`Arquivo de credenciais não encontrado em: ${credPath}`);
    }

    const raw = fs.readFileSync(credPath, 'utf8');
    const data = JSON.parse(raw);
    clientConfig = data.installed || data.web || data;
  }

  if (!clientConfig || !clientConfig.client_id || !clientConfig.client_secret) {
    throw new Error('credentials.json inválido: client_id ou client_secret ausentes.');
  }

  return clientConfig;
}

/**
 * Carrega e valida token OAuth local
 */
function loadToken(options = {}) {
  let tokenData;
  if (options.tokenOverride) {
    tokenData = options.tokenOverride;
  } else {
    const credDir = options.credentialsDir || DEFAULT_CREDENTIALS_DIR;
    const tokenPath = path.join(credDir, 'token.json');

    if (!fs.existsSync(tokenPath)) {
      throw new Error(`Arquivo de token não encontrado em: ${tokenPath}`);
    }

    const raw = fs.readFileSync(tokenPath, 'utf8');
    tokenData = JSON.parse(raw);
  }

  if (!tokenData) {
    throw new Error('Dados de token ausentes ou inválidos.');
  }

  const scopes = typeof tokenData.scope === 'string' ? tokenData.scope.split(' ') : (tokenData.scopes || []);
  if (!scopes.includes(REQUIRED_SCOPE)) {
    throw new Error(`Escopo não autorizado. Esperado estritamente: ${REQUIRED_SCOPE}`);
  }

  return tokenData;
}

/**
 * Atualiza o access_token utilizando o refresh_token via endpoint oficial do Google
 */
function refreshAccessToken(clientConfig, tokenData) {
  return new Promise((resolve, reject) => {
    if (!tokenData.refresh_token) {
      return reject(new Error('refresh_token não disponível no tokenData.'));
    }

    const postData = new URLSearchParams({
      client_id: clientConfig.client_id,
      client_secret: clientConfig.client_secret,
      refresh_token: tokenData.refresh_token,
      grant_type: 'refresh_token'
    }).toString();

    const req = https.request({
      hostname: 'oauth2.googleapis.com',
      port: 443,
      path: '/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const parsed = JSON.parse(data);
            resolve(parsed);
          } catch (e) {
            reject(new Error(`Erro ao interpretar resposta do Google Token: ${e.message}`));
          }
        } else {
          reject(new Error(`Falha no refresh de token Google (HTTP ${res.statusCode}): ${data}`));
        }
      });
    });

    req.on('error', err => reject(err));
    req.write(postData);
    req.end();
  });
}

/**
 * Envia mensagem através da Gmail API (ou simula em modo DRY-RUN)
 * 
 * Regra de Segurança Inviolável:
 * - Se options.dryRun !== false: SEMPRE executa apenas em modo DRY-RUN.
 * - Envio real exige estritamente options.productionSend === true E options.dryRun === false.
 */
async function sendViaGmailApi(emailPayload, options = {}) {
  const isProductionSend = (options.productionSend === true) && (options.dryRun === false);

  // 1. Constrói e valida a mensagem RFC 2822
  const mimeMessage = buildRfc2822Message(emailPayload);

  // 2. MODO DRY-RUN MANDATÓRIO POR PADRÃO
  if (!isProductionSend) {
    return {
      success: true,
      dryRun: true,
      dispatched: false,
      mode: 'DRY_RUN_ONLY',
      message: '[DRY-RUN] Simulação de envio com cliente Gmail realizada com sucesso. Nenhuma chamada de rede à Gmail API efetuada.',
      recipient: emailPayload.to,
      sender: OFFICIAL_SENDER,
      subject: emailPayload.subject,
      rawBase64UrlPreview: mimeMessage.rawBase64Url.substring(0, 80) + '...',
      timestamp: new Date().toISOString()
    };
  }

  // 3. ENVIO REAL EM PRODUÇÃO (REQUER AUTORIZAÇÃO EXPLÍCITA)
  const clientConfig = loadCredentials(options);
  const tokenData = loadToken(options);

  // Se o access_token estiver expirado ou ausente, renova
  let accessToken = tokenData.access_token;
  const isExpired = tokenData.expiry_date && (Date.now() >= (tokenData.expiry_date - 60000));

  if (!accessToken || isExpired) {
    const refreshed = await refreshAccessToken(clientConfig, tokenData);
    accessToken = refreshed.access_token;

    // Atualiza token.json localmente se persistido em arquivo
    if (!options.tokenOverride) {
      const credDir = options.credentialsDir || DEFAULT_CREDENTIALS_DIR;
      const tokenPath = path.join(credDir, 'token.json');
      const updatedToken = {
        ...tokenData,
        access_token: refreshed.access_token,
        expiry_date: Date.now() + (refreshed.expires_in * 1000)
      };
      fs.writeFileSync(tokenPath, JSON.stringify(updatedToken, null, 2), 'utf8');
    }
  }

  // 4. Executa a chamada REST à Gmail API
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ raw: mimeMessage.rawBase64Url });

    const req = https.request({
      hostname: 'gmail.googleapis.com',
      port: 443,
      path: '/gmail/v1/users/me/messages/send',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const parsed = JSON.parse(data);
            resolve({
              success: true,
              dryRun: false,
              dispatched: true,
              messageId: parsed.id,
              threadId: parsed.threadId,
              recipient: emailPayload.to,
              sender: OFFICIAL_SENDER,
              timestamp: new Date().toISOString()
            });
          } catch (e) {
            reject(new Error(`Erro ao interpretar resposta da Gmail API: ${e.message}`));
          }
        } else {
          reject(new Error(`Falha no envio da Gmail API (HTTP ${res.statusCode}): ${data}`));
        }
      });
    });

    req.on('error', err => reject(err));
    req.write(postData);
    req.end();
  });
}

module.exports = {
  DEFAULT_CREDENTIALS_DIR,
  REQUIRED_SCOPE,
  OFFICIAL_SENDER,
  SENDER_DISPLAY_NAME,
  toBase64Url,
  encodeMimeHeader,
  buildRfc2822Message,
  checkCredentialsStatus,
  loadCredentials,
  loadToken,
  refreshAccessToken,
  sendViaGmailApi
};
