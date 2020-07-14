# Babel Transform: Node CommonJS to ES modules

[![Build Status](https://travis-ci.org/tbranyen/babel-plugin-transform-commonjs.svg?branch=master)](https://travis-ci.org/tbranyen/babel-plugin-transform-commonjs)

A Babel 7 compatible transform to convert Node-style CommonJS modules into the
ES module specification. This was created specifically for an experimental
module bundler, but has many uses outside of that initial use case. All major
browsers have shipped support for ESM and Node currently has experimental
support behind a flag. Babel offers a bridge to bring the old to the new, which
is humorous given the origins of Babel which brought the new to the old. This
module can reconcile differences as best as possible without resorting to
hacks.

The goal of this transform is to produce spec-compliant code. Any behavior that
diverges will throw by default. There are escape hatches however, if
you know what they do.

This module will ignore existing ESM modules by default, so long as they do not
reference the following globals: `require`, `module.exports`, or `exports`.

### Notes

What to expect:

- A transform that can transform a majority of Node CommonJS modules to ES modules
- The integrity of `module.exports` intact, no tricks to separate this object
- Early returns are wrapped in an arrow function IIFE

What not to expect:

- `require.extensions` support, as this is a runtime concern
- Hoisting tricks, excessive code rewriting
- Browser support for core Node modules

Notable features not supported:

- Nested requires will always be hoisted, unless they are non-static, see above
- Invalid named exports (`exports["I'mateapot"]`) are only available on the default export

Notable features supported:

- Early return
- Setting export values on `this`
- Dynamic requires are supported

### Usage

```sh
npm install --save-dev babel-plugin-transform-commonjs
```

Update your babel configuration:

```json
{
  "plugins": ["transform-commonjs"]
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

### Dynamic imports

Sometimes, when using CommonJS, developers will not know until runtime what the
import identifier should be. For instance, imagine you're loading a number of
modules from a loop.

```js
['home', 'about', 'contact'].forEach(page => require('./pages/' + page));
```

This would not be able to be transpiled into ES6, since the ES modules
specification only allows static imports. 

Note: you will need to use the
[@babel/plugin-syntax-top-level-await](https://github.com/tc39/proposal-top-level-await)
module in order to support the output generated using this approach.

### Options

- `exportsOnly` - Keep `require` calls and process exports only.

  ```json
  {
    "plugins": [
      ["transform-commonjs", { "onlyExports": true }]
    ]
  }
  ```
