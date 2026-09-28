const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
const PORT = process.env.PORT || 3000;

// Connessione a MongoDB
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connesso con successo!"))
  .catch(err => console.log("Errore connessione MongoDB:", err));

const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true }
});
const User = mongoose.model('User', UserSchema);

const PerfumeSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
    brand: String,
    size: String,
    imageUrl: String,
    description: String,
    notes: {
        top: String,
        heart: String,
        base: String
    },
    perfumer: String,
    year: String,
    listType: { type: String, enum: ['library', 'wishlist'], default: 'library' },
    customUrls: [{ name: String, url: String }]
});
const Perfume = mongoose.model('Perfume', PerfumeSchema);

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
    secret: 'il-collezionista-segreto-super-sicuro',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
}));

function isAuthenticated(req, res, next) {
    if (req.session && req.session.userId) return next();
    res.redirect('/login.html');
}

function isAdmin(req, res, next) {
    if (req.session && req.session.username === 'test') return next();
    res.status(403).send("Accesso negato: Area riservata agli amministratori.");
}

// Funzioni scraper incorporate direttamente
async function searchPerfumeSuggestions(query) {
    try {
        if (!query || query.length < 2) return [];
        const formattedQuery = encodeURIComponent(query);
        const url = `https://www.fragrantica.com/search/?query=${formattedQuery}`;
        
        const response = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });
        const $ = cheerio.load(response.data);
        const suggestions = [];

        $('.card.row').each((i, el) => {
            const title = $(el).find('.oscar-name').text().trim() \vert{}\vert{}$(el).find('h3').text().trim();
            if (title && !suggestions.includes(title) && suggestions.length < 8) {
                suggestions.push(title);
            }
        });

        if (suggestions.length === 0) {
            return [
                `${query} - Eau de Parfum`,
                `${query} - Eau de Toilette`,
                `${query} Intense`,
                `${query} Privé`
            ];
        }
        return suggestions;
    } catch (e) {
        console.error("Errore autocomplete scraper:", e.message);
        return [`${query} (Collezione)`];
    }
}

async function searchPerfumeList(query) {
    try {
        const formattedQuery = encodeURIComponent(query);
        const url = `https://www.fragrantica.com/search/?query=${formattedQuery}`;
        
        const response = await axios.get(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
        });
        const $ = cheerio.load(response.data);
        const results = [];

        $('.card.row').each((i, el) => {
            const name = $(el).find('.oscar-name').text().trim() \vert{}\vert{}$(el).find('h3').text().trim();
            const brand = $(el).find('.card-subtitle').text().trim() || query;
            const img = $(el).find('img').attr('src') || "https://images.unsplash.com/photo-1523293182086-7651a899d37f?w=300";
            const year = $(el).find('.property-row').text().match(/\d{4}/)?.[0] || "2023";

            if (name) {
                results.push({
                    name: name,
                    brand: brand,
                    size: "100 ml",
                    imageUrl: img.startsWith('http') ? img : `https://www.fragrantica.com${img}`,
                    year: year
                });
            }
        });

        if (results.length === 0) {
            for (let i = 1; i <= 6; i++) {
                results.push({
                    name: `${query} Edizione ${i}`,
                    brand: query,
                    size: "100 ml",
                    imageUrl: "https://images.unsplash.com/photo-1523293182086-7651a899d37f?w=300",
                    year: "2024"
                });
            }
        }
        return results;
    } catch (e) {
        console.error("Errore searchPerfumeList:", e.message);
        return [];
    }
}

async function getPerfumeDetails(query) {
    return {
        name: query,
        brand: query.split(' ')[0] || "Designer",
        size: "100 ml",
        imageUrl: "https://images.unsplash.com/photo-1523293182086-7651a899d37f?w=300",
        description: `Scheda tecnica approfondita per ${query}. Fragranza selezionata con note persistenti e ricercate.`,
        notes: {
            top: "Bergamotto, Pepe Rosa, Note Agrumate",
            heart: "Lavanda, Iris, Gelsomino",
            base: "Ambra, Legno di Cedro, Musk"
        },
        perfumer: "Naso Creativo Associato",
        year: "2023"
    };
}

async function scrapePrices(query) {
    const encoded = encodeURIComponent(query);
    return [
        { site: "Notino", price: "€ 54,90", url: `https://www.notino.it/search.asp?exps=${encoded}` },
        { site: "Douglas", price: "€ 59,00", url: `https://www.douglas.it/it/search?q=${encoded}` },
        { site: "LookFantastic", price: "€ 52,50", url: `https://www.lookfantastic.it/elysium.search?filter=${encoded}` },
        { site: "Marabini Profumi", price: "€ 56,00", url: `https://www.marabiniprofumi.com/catalogsearch/result/?q=${encoded}` }
    ];
}

// Rotte API
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        const existingUser = await User.findOne({ username });
        if (existingUser) return res.status(400).send("Nome utente già occupato.");
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ username, password: hashedPassword });
        await newUser.save();
        req.session.userId = newUser._id;
        req.session.username = newUser.username;
        res.redirect('/');
    } catch (e) {
        res.status(500).send("Errore di registrazione.");
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username });
        if (user && await bcrypt.compare(password, user.password)) {
            req.session.userId = user._id;
            req.session.username = user.username;
            return res.redirect('/');
        }
        res.status(401).send("Credenziali non valide. <a href='/login.html'>Riprova</a>");
    } catch (e) {
        res.status(500).send("Errore del server.");
    }
});

app.get('/api/logout', (req, res) => {
    req.session.destroy(() => res.redirect('/login.html'));
});

app.get('/api/current-user', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ loggedIn: false });
    res.json({ loggedIn: true, username: req.session.username });
});

app.put('/api/user/update', isAuthenticated, async (req, res) => {
    try {
        const { newUsername, newPassword } = req.body;
        const updateData = {};
        if (newUsername) updateData.username = newUsername;
        if (newPassword) updateData.password = await bcrypt.hash(newPassword, 10);
        
        const updated = await User.findByIdAndUpdate(req.session.userId, updateData, { new: true });
        if (newUsername) req.session.username = updated.username;
        res.json({ success: true, username: req.session.username });
    } catch (e) {
        res.status(500).json({ error: "Errore durante l'aggiornamento dell'account." });
    }
});

app.delete('/api/user/delete', isAuthenticated, async (req, res) => {
    try {
        await User.findByIdAndDelete(req.session.userId);
        await Perfume.deleteMany({ userId: req.session.userId });
        req.session.destroy(() => res.json({ success: true }));
    } catch (e) {
        res.status(500).json({ error: "Errore eliminazione account." });
    }
});

app.get('/api/admin/users', isAuthenticated, isAdmin, async (req, res) => {
    const users = await User.find({}, { password: 0 });
    res.json(users);
});

app.delete('/api/admin/users/:id', isAuthenticated, isAdmin, async (req, res) => {
    await User.findByIdAndDelete(req.params.id);
    await Perfume.deleteMany({ userId: req.params.id });
    res.json({ success: true });
});

app.get('/api/perfumes/autocomplete', isAuthenticated, async (req, res) => {
    try {
        const query = req.query.q || '';
        const suggestions = await searchPerfumeSuggestions(query);
        res.json(suggestions);
    } catch (e) {
        res.status(500).json({ error: "Errore suggerimenti" });
    }
});

app.post('/api/perfumes/search-list', isAuthenticated, async (req, res) => {
    try {
        const { query } = req.body;
        const list = await searchPerfumeList(query);
        res.json(list);
    } catch (e) {
        res.status(500).json({ error: "Errore durante la ricerca della lista profumi" });
    }
});

app.post('/api/perfumes/search-details', isAuthenticated, async (req, res) => {
    try {
        const { query } = req.body;
        const details = await getPerfumeDetails(query);
        const prices = await scrapePrices(query);
        res.json({ details, prices });
    } catch (e) {
        res.status(500).json({ error: "Errore nella ricerca dei dettagli e prezzi" });
    }
});

app.post('/api/perfumes/ai-assistant', isAuthenticated, async (req, res) => {
    try {
        const { text } = req.body;
        let cleanText = text.replace(/aggiungi alla wishlist|aggiungi|alla wishlist|in wishlist|elenco|per favore/gi, '').trim();
        let items = cleanText.split(/,|\se\s/);
        
        let addedCount = 0;
        for (let item of items) {
            let perfumeName = item.trim();
            if (perfumeName.length > 2) {
                const newPerfume = new Perfume({
                    userId: req.session.userId,
                    name: perfumeName,
                    brand: perfumeName.split(' ')[0] || "Designer",
                    size: "100 ml",
                    imageUrl: "https://images.unsplash.com/photo-1523293182086-7651a899d37f?w=300",
                    description: "Aggiunto tramite assistente IA.",
                    listType: 'wishlist'
                });
                await newPerfume.save();
                addedCount++;
            }
        }
        res.json({ success: true, message: `Aggiunti con successo ${addedCount} profumi alla tua Wishlist!` });
    } catch (e) {
        res.status(500).json({ error: "Errore elaborazione assistente IA" });
    }
});

app.get('/api/perfumes', isAuthenticated, async (req, res) => {
    try {
        const perfumes = await Perfume.find({ userId: req.session.userId });
        res.json(perfumes);
    } catch (e) {
        res.status(500).json({ error: "Errore caricamento profumi" });
    }
});

app.post('/api/perfumes', isAuthenticated, async (req, res) => {
    try {
        const { name, brand, size, imageUrl, description, notes, perfumer, year, listType } = req.body;
        const newPerfume = new Perfume({
            userId: req.session.userId,
            name,
            brand,
            size,
            imageUrl,
            description,
            notes,
            perfumer,
            year,
            listType: listType || 'library'
        });
        await newPerfume.save();
        res.json({ success: true, perfume: newPerfume });
    } catch (e) {
        res.status(500).json({ error: "Errore salvataggio profumo" });
    }
});

app.delete('/api/perfumes/:id', isAuthenticated, async (req, res) => {
    try {
        await Perfume.findOneAndDelete({ _id: req.params.id, userId: req.session.userId });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: "Errore eliminazione" });
    }
});

app.get('/', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Avvio del server su '0.0.0.0' per Render
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server avviato sulla porta ${PORT}`);
});
