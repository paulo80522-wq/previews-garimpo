/**
 * SCRIPT DE AUTENTICAÇÃO GMAIL OAUTH 2.0 (DESKTOP APP)
 * Garimpo Sites - Fluxo de Consentimento Seguro
 * 
 * DIRETRIZES DE SEGURANÇA:
 * 1. Escopo estrito e exclusivo: https://www.googleapis.com/auth/gmail.send
 * 2. Armazenamento seguro exclusivo em C:\Users\35tul\.gemini\config\credentials\gmail\
 * 3. NUNCA imprime o refresh_token ou client_secret no terminal.
 * 4. NUNCA grava tokens dentro do repositório Git.
 * 5. Requer consentimento interativo explícito de Paulo Nunes.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

const DEFAULT_CREDENTIALS_DIR = 'C:\\Users\\35tul\\.gemini\\config\\credentials\\gmail';
const REQUIRED_SCOPE = 'https://www.googleapis.com/auth/gmail.send';
const REDIRECT_PORT = 3000;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/oauth2callback`;

/**
 * Gera a URL oficial de consentimento do Google Accounts
 */
function generateAuthUrl(clientId, redirectUri = REDIRECT_URI) {
  if (!clientId) {
    throw new Error('client_id é obrigatório para gerar a URL de autorização.');
  }

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: REQUIRED_SCOPE,
    access_type: 'offline',
    prompt: 'consent'
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

/**
 * Troca o código de autorização recebido no callback pelos tokens OAuth2
 */
function exchangeCodeForTokens(clientId, clientSecret, code, redirectUri = REDIRECT_URI) {
  return new Promise((resolve, reject) => {
    const postData = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code: code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri
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
            reject(new Error(`Erro ao interpretar resposta de token: ${e.message}`));
          }
        } else {
          reject(new Error(`Falha na troca de código OAuth (HTTP ${res.statusCode}): ${data}`));
        }
      });
    });

    req.on('error', err => reject(err));
    req.write(postData);
    req.end();
  });
}

/**
 * Exibe o status atual das credenciais do Gmail
 */
function displayStatus(options = {}) {
  const credDir = options.credentialsDir || DEFAULT_CREDENTIALS_DIR;
  const credPath = path.join(credDir, 'credentials.json');
  const tokenPath = path.join(credDir, 'token.json');

  console.log('====================================================');
  console.log(' STATUS DA AUTENTICAÇÃO GMAIL - GARIMPO SITES');
  console.log('====================================================');
  console.log(`Diretório de Credenciais: ${credDir}`);
  console.log('----------------------------------------------------');

  const credExists = fs.existsSync(credPath);
  console.log(`credentials.json: [${credExists ? '✓ PRESENTE' : '✗ AUSENTE'}] (${credPath})`);

  let clientIdOk = false;
  if (credExists) {
    try {
      const cData = JSON.parse(fs.readFileSync(credPath, 'utf8'));
      const c = cData.installed || cData.web || cData;
      clientIdOk = Boolean(c && c.client_id && c.client_secret);
      console.log(`  Client ID detectado:  ${c.client_id ? c.client_id.substring(0, 20) + '...' : 'NÃO'}`);
      console.log(`  Client Secret presente: [${c.client_secret ? 'SIM' : 'NÃO'}]`);
    } catch (e) {
      console.log(`  Erro na leitura: ${e.message}`);
    }
  }

  const tokenExists = fs.existsSync(tokenPath);
  console.log(`token.json:       [${tokenExists ? '✓ PRESENTE' : '✗ AUSENTE'}] (${tokenPath})`);

  let scopeOk = false;
  let refreshOk = false;
  if (tokenExists) {
    try {
      const tData = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
      refreshOk = Boolean(tData.refresh_token);
      const scopes = typeof tData.scope === 'string' ? tData.scope.split(' ') : (tData.scopes || []);
      scopeOk = scopes.includes(REQUIRED_SCOPE);
      console.log(`  Refresh Token presente: [${refreshOk ? 'SIM' : 'NÃO'}]`);
      console.log(`  Escopo autorizado:      ${scopes.join(', ')}`);
      console.log(`  Escopo estrito válido:  [${scopeOk ? 'SIM' : 'NÃO'}]`);
    } catch (e) {
      console.log(`  Erro na leitura: ${e.message}`);
    }
  }

  console.log('----------------------------------------------------');
  const ready = credExists && clientIdOk && tokenExists && refreshOk && scopeOk;
  console.log(`STATUS OPERACIONAL: [${ready ? 'PRONTO PARA USO SEGURO' : 'CONFIGURAÇÃO PENDENTE'}]`);
  console.log('====================================================\n');

  return {
    credDir,
    credExists,
    clientIdOk,
    tokenExists,
    refreshOk,
    scopeOk,
    ready
  };
}

/**
 * Inicia o servidor local temporário para receber o callback OAuth 2.0
 */
function startAuthServer(clientId, clientSecret, options = {}) {
  const credDir = options.credentialsDir || DEFAULT_CREDENTIALS_DIR;
  const tokenPath = path.join(credDir, 'token.json');

  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const reqUrl = new URL(req.url, `http://localhost:${REDIRECT_PORT}`);

        if (reqUrl.pathname === '/oauth2callback') {
          const code = reqUrl.searchParams.get('code');
          const error = reqUrl.searchParams.get('error');

          if (error) {
            res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`<h1>Erro na autorização</h1><p>${error}</p>`);
            server.close();
            return reject(new Error(`Erro retornado pelo Google OAuth: ${error}`));
          }

          if (!code) {
            res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end('<h1>Código de autorização não encontrado</h1>');
            return;
          }

          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`
            <html>
              <body style="font-family: sans-serif; text-align: center; padding: 50px;">
                <h2 style="color: #2e7d32;">Autenticação concluída com sucesso!</h2>
                <p>O token de envio para a conta oficial foi obtido com segurança.</p>
                <p>Você pode fechar esta janela e retornar ao terminal.</p>
              </body>
            </html>
          `);

          // Troca o código pelos tokens
          const tokens = await exchangeCodeForTokens(clientId, clientSecret, code);

          // Validação estrita do escopo retornado
          const returnedScope = tokens.scope || '';
          const grantedScopes = typeof returnedScope === 'string' ? returnedScope.split(' ') : [];
          if (!grantedScopes.includes(REQUIRED_SCOPE) && returnedScope !== REQUIRED_SCOPE) {
            res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end('<h1>Erro de escopo</h1><p>O escopo concedido não atende ao requisito estrito gmail.send.</p>');
            server.close();
            return reject(new Error(`Escopo inválido retornado pelo Google: ${returnedScope}. Esperado: ${REQUIRED_SCOPE}`));
          }

          // Salva os tokens no local seguro
          const tokenData = {
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            scope: tokens.scope || REQUIRED_SCOPE,
            token_type: tokens.token_type,
            expiry_date: Date.now() + (tokens.expires_in * 1000),
            account: 'paulonunes.consultoriadigital@gmail.com',
            createdAt: new Date().toISOString()
          };

          if (!fs.existsSync(credDir)) {
            fs.mkdirSync(credDir, { recursive: true });
          }

          fs.writeFileSync(tokenPath, JSON.stringify(tokenData, null, 2), 'utf8');
          console.log('\n✓ Token OAuth 2.0 gravado com sucesso no diretório seguro.');
          console.log(`Local: ${tokenPath}`);

          server.close();
          resolve(tokenData);
        } else {
          res.writeHead(404);
          res.end();
        }
      } catch (err) {
        res.writeHead(500);
        res.end(err.message);
        server.close();
        reject(err);
      }
    });

    server.listen(REDIRECT_PORT, () => {
      const authUrl = generateAuthUrl(clientId);
      console.log(`\nServidor de callback ouvindo em: ${REDIRECT_URI}`);
      console.log('\n----------------------------------------------------');
      console.log('URL OFICIAL DE AUTORIZAÇÃO GOOGLE:');
      console.log(authUrl);
      console.log('----------------------------------------------------\n');
      console.log('Abra a URL acima no navegador para autenticar a conta:');
      console.log('paulonunes.consultoriadigital@gmail.com\n');
    });

    server.on('error', err => reject(err));
  });
}

// Interface CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  const isAuthorize = args.includes('--authorize');

  if (args.includes('--status') || args.includes('--check')) {
    displayStatus();
    process.exit(0);
  }

  const status = displayStatus();

  if (!status.credExists || !status.clientIdOk) {
    console.log('[INSTRUÇÕES PARA CONFIGURAÇÃO DO GOOGLE CLOUD]:');
    console.log('1. Acesse o Google Cloud Console: https://console.cloud.google.com/');
    console.log('2. Habilite a Gmail API no projeto.');
    console.log('3. Crie credenciais OAuth 2.0 do tipo "Desktop App".');
    console.log(`4. Salve o arquivo JSON baixado exatamente em:`);
    console.log(`   ${path.join(DEFAULT_CREDENTIALS_DIR, 'credentials.json')}`);
    console.log('5. Execute novamente: node esbocos/auth-gmail.js --authorize\n');
    process.exit(1);
  }

  if (!isAuthorize) {
    console.log('[AVISO] Modo de consulta. O fluxo OAuth NÃO foi iniciado.');
    console.log('Para iniciar o fluxo de autorização no navegador quando deliberado por Paulo Nunes,');
    console.log('execute explicitamente com o parâmetro:');
    console.log('  node esbocos/auth-gmail.js --authorize\n');
    process.exit(0);
  }

  // FLUXO OAUTH AUTORIZADO VIA --authorize
  console.log('====================================================');
  console.log(' INICIANDO FLUXO OAUTH 2.0 (MODO --authorize)');
  console.log('====================================================');
  console.log('Conta Alvo: paulonunes.consultoriadigital@gmail.com');
  console.log(`Escopo:     ${REQUIRED_SCOPE}`);
  console.log(`Callback:   ${REDIRECT_URI}`);
  console.log('----------------------------------------------------');

  try {
    const credPath = path.join(DEFAULT_CREDENTIALS_DIR, 'credentials.json');
    const credData = JSON.parse(fs.readFileSync(credPath, 'utf8'));
    const clientConfig = credData.installed || credData.web || credData;

    startAuthServer(clientConfig.client_id, clientConfig.client_secret)
      .then(() => {
        console.log('\n[CONCLUÍDO] Autenticação realizada com sucesso.');
        process.exit(0);
      })
      .catch((err) => {
        console.error('\n[FALHA NO OAUTH]:', err.message);
        process.exit(1);
      });
  } catch (err) {
    console.error('Erro ao carregar credenciais para autorização:', err.message);
    process.exit(1);
  }
}

module.exports = {
  DEFAULT_CREDENTIALS_DIR,
  REQUIRED_SCOPE,
  REDIRECT_PORT,
  REDIRECT_URI,
  generateAuthUrl,
  exchangeCodeForTokens,
  displayStatus,
  startAuthServer
};
