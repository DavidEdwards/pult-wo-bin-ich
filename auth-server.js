require('dotenv').config();

const { startAuthServer } = require('./src/auth/server');

startAuthServer();
