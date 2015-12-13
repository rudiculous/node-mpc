# node-mpc

[![NPM version][npm-image]][npm-url]
[![Build Status][travis-image]][travis-url]
[![Coverage Status][coveralls-image]][coveralls-url]

Library to connect with MPD.

##  Installation
`npm install @rdcl/mpc`

## Usage
```javascript
const MPC = require('@rdcl/mpc')
const mpc = new MPC({ port: 6600 })

mpc.connect()
  .then(() => mpc.command('play'))
```

## Tests
`npm test`


[npm-image]: https://img.shields.io/npm/v/@rdcl/mpc.svg?style=flat-square
[npm-url]: https://www.npmjs.com/package/@rdcl/mpc
[travis-image]: https://img.shields.io/travis/rudiculous/node-mpc/master.svg?style=flat-square
[travis-url]: https://travis-ci.org/rudiculous/node-mpc
[coveralls-image]: https://img.shields.io/coveralls/rudiculous/node-mpc/master.svg?style=flat-square
[coveralls-url]: https://coveralls.io/github/rudiculous/node-mpc?branch=master
