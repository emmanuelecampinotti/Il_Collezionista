const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const { scrapePrices, parsePerfumeList } = require('./scraper');

const app = express();
const PORT = process.env.PORT || 3000;

// Connessione a MongoDB Atlas
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => console.log("MongoDB Connesso con successo!"))
  .catch(err => console.log("Errore connessione MongoDB:", err));

// Schema Utente
const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true }
});
const User = mongoose.model('User', UserSchema);

// Schema Profumo (legato all'utente tramite userId)
const PerfumeSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
    notes: String,
    customUrls: [{ name: String, url: String }]
});
const Perfume = mongoose.model('Perfume', PerfumeSchema);

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
    secret: 'il-collezionista-segreto-super- sicuro',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false } // Imposta true se usi HTTPS con dominio personalizzato
}));

// Middleware di protezione delle rotte
function isAuthenticated(req, res, next) {
    if (req.session && req.session.userId) {
        return next();
    }
    res.redirect('/login.html');
}

// --- ROTTE DI AUTENTICAZIONE ---

// Registrazione
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ username, password: hashedPassword });
        await newUser.save();
        res.redirect('/login.html?registered=true');
    } catch (e) {
        res.status(400).send("Errore durante la registrazione (utente già esistente?).");
    }
});

// Login
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

// Logout
app.get('/api/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/login.html');
    });
});

// Ottieni dati utente corrente
app.get('/api/current-user', (req, res) => {
    if (!req.session.userId) return res.status(401).json({ loggedIn: false });
    res.json({ loggedIn: true, username: req.session.username });
});

// --- ROTTE APPLICAZIONE (protette da userId) ---

// Ottieni la libreria profumi dell'utente loggato
app.get('/api/perfumes', isAuthenticated, async (req, res) => {
    try {
        const perfumes = await Perfume.find({ userId: req.session.userId });
        res.json(perfumes);
    } catch (e) {
        res.status(500).json({ error: "Errore nel caricamento della libreria" });
    }
});

// Aggiungi un profumo alla libreria dell'utente
app.post('/api/perfumes', isAuthenticated, async (req, res) => {
    try {
        const { name, notes, customUrls } = req.body;
        const newPerfume = new Perfume({
            userId: req.session.userId,
            name,
            notes,
            customUrls: customUrls || []
        });
        await newPerfume.save();
        res.json({ success: true, perfume: newPerfume });
    } catch (e) {
        res.status(500).json({ error: "Errore durante il salvataggio" });
    }
});

// Elimina un profumo (solo se appartiene all'utente loggato)
app.delete('/api/perfumes/:id', isAuthenticated, async (req, res) => {
    try {
        await Perfume.findOneAndDelete({ _id: req.params.id, userId: req.session.userId });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: "Errore durante l'eliminazione" });
    }
});

// Ricerca prezzi (scraper)
app.post('/api/scrape', isAuthenticated, async (req, res) => {
    try {
        const { query, customUrls } = req.body;
        const results = await scrapePrices(query, customUrls);
        res.json(results);
    } catch (e) {
        res.status(500).json({ error: "Errore nello scraping" });
    }
});

// Protezione file statici / index.html principale
app.get('/', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server avviato sulla porta ${PORT}`);
});
