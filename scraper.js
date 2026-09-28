const axios = require('axios');
const cheerio = require('cheerio');
const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function parsePerfumeList(rawText) {
    if (!process.env.GEMINI_API_KEY) return [rawText];
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `Estrai da questo testo un elenco pulito dei nomi dei profumi menzionati. Restituisci SOLO i nomi separati da virgola, senza altro testo: "${rawText}"`,
        });
        const text = response.text().trim();
        return text.split(',').map(item => item.trim()).filter(Boolean);
    } catch (e) {
        console.log("Errore parsing Gemini:", e.message);
        return [rawText];
    }
}

async function scrapePrices(productQuery = "profumo", customUrls = []) {
    const results = [];
    const encodedQuery = encodeURIComponent(productQuery);

    try {
        const trovaprezziUrl = `https://www.trovaprezzi.it/prezzo_profumi-deodoranti/${encodedQuery}`;
        const tpResponse = await axios.get(trovaprezziUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15' }
        });
        const $tp = cheerio.load(tpResponse.data);

        $tp('.search-item, .list-item').slice(0, 3).each((i, el) => {
            const title = $tp(el).find('.item-description, .shop-item-title').text().trim();
            const price = $tp(el).find('.price, .item-price').text().trim();
            const shop = $tp(el).find('.merchant-name, .shop-name').text().trim() || "Trovaprezzi Store";
            
            if (title && price) {
                results.push({ source: `Trovaprezzi (${shop})`, name: title, price: price, link: "#" });
            }
        });
    } catch (e) {
        console.log("Errore Trovaprezzi:", e.message);
    }

    const trustedSites = [
        { name: "Notino", url: `https://www.notino.it/search?f=${encodedQuery}` },
        { name: "Casa del Profumo", url: `https://www.casadelprofumo.it/catalogsearch/result/?q=${encodedQuery}` },
        { name: "Occhiali Profumi", url: `https://www.occhiali-profumi.com/` },
        { name: "Niche Gallerie", url: `https://nichegallerie.com/` }
    ];

    for (let site of trustedSites) {
        results.push({ source: site.name, name: `Cerca "${productQuery}"`, price: "Verifica sul sito", link: site.url });
    }

    if (customUrls && customUrls.length > 0) {
        for (let custom of customUrls) {
            try {
                const customRes = await axios.get(custom.url, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15' },
                    timeout: 5000
                });
                const $c = cheerio.load(customRes.data);
                let foundPrice = $c('.price, [itemprop="price"], .amount, .current-price').first().text().trim() || "Prezzo non rilevato";

                results.push({ source: `Personalizzato: ${custom.name}`, name: productQuery, price: foundPrice, link: custom.url });
            } catch (err) {
                results.push({ source: `Personalizzato: ${custom.name}`, name: productQuery, price: "Errore link", link: custom.url });
            }
        }
    }

    return { success: true, query: productQuery, items: results, lastUpdated: new Date().toLocaleString('it-IT') };
}

module.exports = { scrapePrices, parsePerfumeList };
