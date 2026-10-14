require('dotenv').config();

const path = require('path');
const express = require('express');
const session = require('./config/session');

const authRoutes = require('./routes/authRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const placeholderRoutes = require('./routes/placeholderRoutes');

const app = express();
const port = Number(process.env.PORT) || 3000;

app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session);

app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.currentPath = req.path;
  next();
});

app.get('/', (req, res) => {
  res.redirect(req.session.user ? '/dashboard' : '/login');
});

app.use('/', authRoutes);
app.use('/', dashboardRoutes);
app.use('/', placeholderRoutes);

app.use((req, res) => {
  res.status(404).render('pages/404', { title: 'Página não encontrada' });
});

app.use((error, req, res, next) => {
  console.error('Erro inesperado:', error);
  res.status(500).render('pages/500', {
    title: 'Erro interno',
    error: process.env.NODE_ENV === 'development' ? error : null
  });
});

if (require.main === module) {
  app.listen(port, () => {
    console.log(`SalonTech ouvindo na porta ${port}`);
  });
}

module.exports = app;
