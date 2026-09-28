const axios = require('axios');
const cheerio = require('cheerio');

// Funzione di esempio per lo scraping
async function scrapePrices() {
    try {
        // Esempio fittizio: sostituisci con l'URL reale del profumo che vuoi monitorare
        const targetUrl = 'https://example.com/il-tuo-profumo'; 
        
        // Se il sito richiede uno User-Agent per non bloccare la richiesta:
        const response = await axios.get(targetUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)' }
        });
        
        const $ = cheerio.load(response.data);

        // MODIFICA QUESTI SELETTORI in base alla struttura HTML del sito target
        const productName = $('h1.product-title').text().trim() || "Profumo di Nicchia";
        const price = $('.product-price').text().trim() || "Prezzo non disponibile";

        return {
            success: true,
            name: productName,
            price: price,
            lastUpdated: new Date().toLocaleString('it-IT')
        };
    } catch (error) {
        console.error("Errore durante lo scraping:", error.message);
        return {
            success: false,
            error: error.message,
            lastUpdated: new Date().toLocaleString('it-IT')
        };
    }
}

module.exports = { scrapePrices };