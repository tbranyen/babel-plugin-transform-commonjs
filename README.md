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

- Non-static requires are invalid and will raise an exception
- Nested requires will always be hoisted, unless they are non-static, see above
- Invalid named exports (`exports["I'mateapot"]`) will only be available on the default export

Notable features supported:

- Early return
- Setting export values on `this`

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

### Options

- `synchronousImport` - Convert non-static require to a compatible dynamic
  import. If the bundler can inline and link synchronously, this should be
  okay, although this will produce invalid code for any other case. Use with
  caution!

  ```json
  {
    "plugins": [
      ["transform-commonjs", { "synchronousImport": true }]
    ]
  }
  ```

- `exportsOnly` - Keep `require` calls and process exports only.

  ```json
  {
    "plugins": [
      ["transform-commonjs", { "onlyExports": true }]
    ]
  }
  ```
