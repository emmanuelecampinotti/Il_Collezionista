const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const { scrapePrices, searchPerfumeSuggestions, getPerfumeDetails } = require('./scraper');

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

// Schema Profumo (con distinzione tra My Library e My Wishlist, note, brand, ml, immagini)
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

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
    secret: 'il-collezionista-segreto-super-sicuro',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
}));

// Middleware di autenticazione e admin
function isAuthenticated(req, res, next) {
    if (req.session && req.session.userId) return next();
    res.redirect('/login.html');
}

function isAdmin(req, res, next) {
    if (req.session && req.session.username === 'test') return next();
    res.status(403).send("Accesso negato: Area riservata agli amministratori.");
}

// --- ROTTE AUTENTICAZIONE & UTENTE ---
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

// Aggiornamento dati utente / password
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

// Eliminazione account utente e relativi profumi
app.delete('/api/user/delete', isAuthenticated, async (req, res) => {
    try {
        await User.findByIdAndDelete(req.session.userId);
        await Perfume.deleteMany({ userId: req.session.userId });
        req.session.destroy(() => res.json({ success: true }));
    } catch (e) {
        res.status(500).json({ error: "Errore eliminazione account." });
    }
});

// --- ROTTE ADMIN ---
app.get('/api/admin/users', isAuthenticated, isAdmin, async (req, res) => {
    const users = await User.find({}, { password: 0 });
    res.json(users);
});

app.delete('/api/admin/users/:id', isAuthenticated, isAdmin, async (req, res) => {
    await User.findByIdAndDelete(req.params.id);
    await Perfume.deleteMany({ userId: req.params.id });
    res.json({ success: true });
});

// --- ROTTE PROFUMI, RICERCA E SUGGERIMENTI ---

// Autocompletamento mentre scrivi (stile Google Search)
app.get('/api/perfumes/autocomplete', isAuthenticated, async (req, res) => {
    try {
        const query = req.query.q || '';
        const suggestions = await searchPerfumeSuggestions(query);
        res.json(suggestions);
    } catch (e) {
        res.status(500).json({ error: "Errore suggerimenti" });
    }
});

// Ricerca dettagliata profumo + Prezzi online (inclusi TrovaPrezzi e store)
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

// Ottieni libreria e wishlist dell'utente
app.get('/api/perfumes', isAuthenticated, async (req, res) => {
    try {
        const perfumes = await Perfume.find({ userId: req.session.userId });
        res.json(perfumes);
    } catch (e) {
        res.status(500).json({ error: "Errore caricamento profumi" });
    }
});

// Aggiungi profumo a My Library o My Wishlist
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

// Elimina profumo
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

app.listen(PORT, () => console.log(`Server avviato sulla porta ${PORT}`));
