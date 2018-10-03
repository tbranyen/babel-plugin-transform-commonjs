# Babel Transform: CommonJS to ES modules

[![Build Status](https://travis-ci.org/tbranyen/babel-plugin-transform-commonjs.svg?branch=master)](https://travis-ci.org/tbranyen/babel-plugin-transform-commonjs)

A Babel 7 compatible transform to convert CommonJS modules into the ES module
specification. This was created specifically for a bundler, but has many uses
outside of that context. Specifically for upgrading existing packages to ESM.

What to expect:

- A transform that can transform a majority of CommonJS modules to ES modules
- The integrity of `module.exports` intact, no tricks to separate this object
- Early returns are wrapped in an arrow function IIFE

What not to expect:

- `require.extensions` support, as this is a runtime concern
- Hoisting tricks, excessive code rewriting
- Browser support for core Node modules

Notable differences:

- Non-static requires are turned into incompatible dynamic `import(...)`s
- Reserved words are valid exports in CJS `exports.null = ...`, but not in ESM

```sh
npm install --save-dev babel-plugin-transform-commonjs
```

Update your babel configuration:

```json
{
  "plugins": "transform-commonjs"
}
```

Now code like this:

```javascript
var { readFileSync } = require('path');
exports.readFileSync = readFileSync;
```

Will turn into this:

``` javascript
import { readFileSync as _readFileSync } from "path";
var module = {
  exports: {}
};
exports.readFileSync = _readFileSync;
export const readFileSync = _readFileSync;
export default module.exports;
```
