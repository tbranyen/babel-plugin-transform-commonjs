# Babel Transform: CommonJS to ES Modules

A Babel 7 compatible transform to convert CommonJS modules into the ES Module
specification. This was created specifically for a bundler, but has many uses
outside of that context.

What to expect:

- A transform that can transform a majority of CommonJS to ES Modules
- The integrity of `module.exports` in-tact, no tricks to separate this object
- Non-static requires are turned into incompatible dynamic `import(...)`s

What not to expect:

- `require.extensions` support, as this is a runtime concern
- Hoisting tricks, excessive code rewriting
- Browser support for core Node modules

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
export const readFileSync = _readFileSync;
export default module.exports;
```
