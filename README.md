# Babel Transform: CommonJS to ES Modules

```
npm install --save-dev babel-plugin-transform-commonjs
```

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

```javascript
const input = `
  var a = require('path');
`;

const { code } = await transformAsync(input);

equal(code, `
  import a from "path";
  var module = {
    exports: {}
  };
  export default module.exports;
`);
```
