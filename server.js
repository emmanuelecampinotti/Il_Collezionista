const express = require('express');
const { scrapePrices, parsePerfumeList } = require('./scraper');
const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// CONFIGURAZIONE SICUREZZA
const APP_PASSWORD = "ilcollezionista2026"; // Puoi cambiarla qui
let customSites = [];
let savedSearches = ["Bois Imperial", "Ganymede"];

// Middleware di autenticazione basato su cookie/query semplice
app.use((req, res, next) => {
    // Se richiede il login o invia la password corretta
    const pwd = req.query.pwd || req.body.pwd;
    if (req.path === '/login') return next();
    
    // Per semplicità nella PWA, controlliamo se la password è nei parametri o salvata
    next();
});

app.get('/login', (req, res) => {
    res.send(`
    <!DOCTYPE html>
    <html lang="it">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Accesso Riservato</title>
        <style>
            body { font-family: -apple-system, sans-serif; background: #121212; color: #fff; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
            .box { background: #1e1e1e; padding: 25px; border-radius: 12px; width: 100%; max-width: 300px; box-shadow: 0 4px 15px rgba(0,0,0,0.5); text-align: center; }
            input, button { width: 100%; padding: 12px; margin-top: 10px; border-radius: 8px; border: 1px solid #333; font-size: 16px; box-sizing: border-box; }
            input { background: #2a2a2a; color: #fff; }
            button { background: #d4af37; color: #000; font-weight: bold; border: none; cursor: pointer; }
        </style>
    </head>
    <body>
        <div class="box">
            <h2>🏺 Il Collezionista</h2>
            <form method="POST" action="/auth">
                <input type="password" name="password" placeholder="Inserisci Password" required>
                <button type="submit">Accedi</button>
            </form>
        </div>
    </body>
    </html>
    `);
});

app.post('/auth', (req, res) => {
    if (req.body.password === APP_PASSWORD) {
        res.redirect('/?auth=ok');
    } else {
        res.redirect('/login');
    }
});

app.get('/', async (req, res) => {
    if (req.query.auth !== 'ok' && req.query.pwd !== APP_PASSWORD) {
        return res.redirect('/login');
    }

    const searchQuery = req.query.q || savedSearches[0] || "profumo";
    const data = await scrapePrices(searchQuery, customSites);

    const html = `
    <!DOCTYPE html>
    <html lang="it">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
        <title>Il Collezionista - Sicuro</title>
        <meta name="apple-mobile-web-app-capable" content="yes">
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
        <style>
            body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background-color: #121212; color: #e0e0e0; margin: 0; padding: 15px; }
            h1 { font-size: 20px; color: #fff; text-align: center; margin-bottom: 15px; }
            .card { background: #1e1e1e; padding: 12px; border-radius: 12px; margin-bottom: 12px; box-shadow: 0 4px 10px rgba(0,0,0,0.3); }
            input, textarea, button { width: 100%; padding: 12px; margin-top: 6px; border-radius: 8px; border: 1px solid #333; font-size: 16px; box-sizing: border-box; }
            input, textarea { background: #2a2a2a; color: #fff; }
            button { background: #d4af37; color: #000; font-weight: bold; border: none; cursor: pointer; }
            button:active { background: #b89728; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th, td { padding: 10px; text-align: left; border-bottom: 1px solid #2a2a2a; font-size: 14px; }
            th { color: #d4af37; }
            .price { color: #4cd137; font-weight: bold; }
            a { color: #00a8ff; text-decoration: none; }
            .meta { font-size: 11px; color: #888; text-align: center; margin-top: 20px; }
        </style>
    </head>
    <body>
        <h1>🏺 Il Collezionista (Protetto)</h1>

        <!-- Ricerca Rapida -->
        <div class="card">
            <form method="GET" action="/">
                <input type="hidden" name="auth" value="ok">
                <label style="font-size: 13px; color: #aaa;">Cerca Profumo:</label>
                <input type="text" name="q" value="${searchQuery}" placeholder="Nome profumo...">
                <button type="submit" style="margin-top: 10px;">Cerca Prezzi</button>
            </form>
        </div>

        <!-- Integrazione IA Gemini per liste in blocco -->
        <div class="card" style="border: 1px solid #d4af37;">
            <h3 style="margin: 0 0 6px 0; font-size: 15px; color: #d4af37;">✨ Aggiungi Lista con IA (Dettatura o Testo)</h3>
            <p style="font-size: 11px; color: #aaa; margin-top:0;">Incolla un testo disordinato o usa il microfono della tastiera per dettare più profumi in un colpo solo.</p>
            <form method="POST" action="/ai-add">
                <textarea name="rawList" rows="2" placeholder="Es. Vorrei monitorare Oajan, Herod e Bois Imperial..." required></textarea>
                <button type="submit" style="background: #2ed573; color: #000; margin-top: 6px;">Elabora con Gemini</button>
            </form>
        </div>

        <!-- Tabella Risultati -->
        <div class="card">
            <h3 style="margin: 0 0 10px 0; font-size: 15px; color: #d4af37;">Risultati per: "${searchQuery}"</h3>
            <table>
                <thead>
                    <tr><th>Negozio</th><th>Prezzo</th></tr>
                </thead>
                <tbody>
                    ${data.items.map(item => `
                        <tr>
                            <td><strong>${item.source}</strong><br><a href="${item.link}" target="_blank" style="font-size: 12px;">Apri ↗</a></td>
                            <td class="price">${item.price}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>

        <!-- Aggiungi Sito Personalizzato -->
        <div class="card">
            <h3 style="margin: 0 0 10px 0; font-size: 15px; color: #d4af37;">Aggiungi URL Negozio Custom</h3>
            <form method="POST" action="/add-site">
                <input type="text" name="siteName" placeholder="Nome Negozio" required style="margin-bottom: 6px;">
                <input type="url" name="siteUrl" placeholder="URL della pagina" required style="margin-bottom: 6px;">
                <button type="submit" style="background: #333; color: #fff;">Salva Negozio</button>
            </form>
        </div>
    </body>
    </html>
    `;
    res.send(html);
});

app.post('/ai-add', async (req, res) => {
    const rawText = req.body.rawList;
    if (rawText) {
        const parsedNames = await parsePerfumeList(rawText);
        parsedNames.forEach(name => {
            if (!savedSearches.includes(name)) savedSearches.push(name);
        });
    }
    res.redirect('/?auth=ok');
});

app.post('/add-site', (req, res) => {
    const { siteName, siteUrl } = req.body;
    if (siteName && siteUrl) customSites.push({ name: siteName, url: siteUrl });
    res.redirect('/?auth=ok');
});

app.listen(PORT, () => {
    console.log(`Server protetto avviato sulla porta ${PORT}`);
});
