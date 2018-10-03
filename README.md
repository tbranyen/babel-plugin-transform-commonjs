# Babel Transform: CommonJS to ES modules

[![Build Status](https://travis-ci.org/tbranyen/babel-plugin-transform-commonjs.svg?branch=master)](https://travis-ci.org/tbranyen/babel-plugin-transform-commonjs)

A Babel 7 compatible transform to convert CommonJS modules into the ES module
specification. This was created specifically for a bundler, but has many uses
outside of that context. All major browsers have shipped support for ESM and
Node currently has experimental support from behind a flag. The movement is
inevitable. Babel offers us a bridge to bring the old to the new. This module
can reconcile differences as best as possible without hacks.

The goal of this transform is to produce spec-compliant code. Any behavior that
diverges will throw by default. However, there are escape hatches provided if
you know what you're doing.

### Notes

What to expect:

- A transform that can transform a majority of CommonJS modules to ES modules
- The integrity of `module.exports` intact, no tricks to separate this object
- Early returns are wrapped in an arrow function IIFE

What not to expect:

- `require.extensions` support, as this is a runtime concern
- Hoisting tricks, excessive code rewriting
- Browser support for core Node modules

Notable differences:

- Non-static requires are invalid and will raise an exception
- Nested requires will always be hoisted
- Reserved words are valid exports in CJS, but not in ESM

### Usage

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

### Options

- `synchronousImport` - Convert non-static require to a dynamic import if the
  bundler can inline and link synchronously. This will produce invalid code for
  any other use case, use with caution.
