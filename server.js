const express = require('express');
const { scrapePrices } = require('./scraper');

const app = express();
const PORT = process.env.PORT || 3000;

// Variabile in memoria per salvare l'ultimo risultato dello scraping
let latestData = {
    success: false,
    name: "Nessun dato ancora",
    price: "-",
    lastUpdated: "Mai eseguito"
};

// Pagina Web HTML mobile-friendly (la tua "app" su iPhone)
app.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html lang="it">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
            <title>Perfume Tracker</title>
            <meta name="apple-mobile-web-app-capable" content="yes">
            <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
            <style>
                body {
                    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                    background-color: #121212;
                    color: #e0e0e0;
                    margin: 0;
                    padding: 20px;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                }
                .container {
                    width: 100%;
                    max-width: 400px;
                    margin-top: 20px;
                }
                h1 {
                    font-size: 24px;
                    text-align: center;
                    margin-bottom: 25px;
                    color: #ffffff;
                }
                .card {
                    background: #1e1e1e;
                    border-radius: 14px;
                    padding: 20px;
                    box-shadow: 0 4px 15px rgba(0,0,0,0.5);
                    margin-bottom: 20px;
                }
                .label {
                    font-size: 12px;
                    color: #888;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                }
                .value {
                    font-size: 18px;
                    font-weight: 600;
                    margin-top: 5px;
                    color: #fff;
                }
                .price {
                    font-size: 28px;
                    color: #4cd964;
                    font-weight: 700;
                }
                button {
                    width: 100%;
                    background-color: #007aff;
                    color: white;
                    border: none;
                    border-radius: 12px;
                    padding: 16px;
                    font-size: 16px;
                    font-weight: 600;
                    cursor: pointer;
                    box-shadow: 0 4px 10px rgba(0,122,255,0.3);
                }
                button:active {
                    background-color: #0056b3;
                }
                .time {
                    text-align: center;
                    font-size: 11px;
                    color: #666;
                    margin-top: 15px;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>Esxence & Perfumes</h1>
                <div class="card">
                    <div class="label">Prodotto</div>
                    <div class="value" id="p-name">${latestData.name}</div>
                    <br>
                    <div class="label">Prezzo Rilevato</div>
                    <div class="value price" id="p-price">${latestData.price}</div>
                </div>
                <button onclick="triggerScrape()">Aggiorna Prezzi Ora</button>
                <div class="time">Ultimo aggiornamento: <span id="p-time">${latestData.lastUpdated}</span></div>
            </div>

            <script>
                async function triggerScrape() {
                    const btn = document.querySelector('button');
                    btn.textContent = 'Aggiornamento in corso...';
                    try {
                        const res = await fetch('/api/run-scrape');
                        const data = await res.json();
                        if(data.success) {
                            document.getElementById('p-name').textContent = data.name;
                            document.getElementById('p-price').textContent = data.price;
                            document.getElementById('p-time').textContent = data.lastUpdated;
                        } else {
                            alert('Errore durante l\\'aggiornamento');
                        }
                    } catch(e) {
                        alert('Errore di connessione');
                    }
                    btn.textContent = 'Aggiorna Prezzi Ora';
                }
            </script>
        </body>
        </html>
    `);
});

// Endpoint API che fa partire lo scraping quando premi il bottone dal telefono
app.get('/api/run-scrape', async (req, res) => {
    const result = await scrapePrices();
    latestData = result;
    res.json(result);
});

app.listen(PORT, () => {
    console.log(`Server avviato sulla porta ${PORT}`);
});