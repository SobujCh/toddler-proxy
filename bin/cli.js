#!/usr/bin/env node
// bin/cli.js
const startProxy = require('../index'); // or './proxy'
const argv = require('minimist')(process.argv.slice(2));

const port = Number(argv.port || process.env.PORT || 8000);
const user = argv.user || process.env.PROXY_USER || 'user';
const pass = argv.pass || process.env.PROXY_PASS || 'pass';

const instance = startProxy({ port, user, pass });

// handle signals to stop cleanly
process.on('SIGINT', () => {
  instance.stop(() => process.exit(0));
});
