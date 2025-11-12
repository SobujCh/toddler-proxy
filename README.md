# toddler-proxy

Simple HTTP(S) forward proxy for Node.js.

## Programmatic usage

```js
const startProxy = require('toddler-proxy');
const { server, stop } = startProxy({ port: 8000, user: 'user', pass: 'pass' });
