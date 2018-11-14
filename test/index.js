const { throws, equal, deepEqual } = require('assert');
const { transformAsync } = require('@babel/core');
const { default: traverseAst } = require('@babel/traverse');
const { format } = require('./_utils');
const plugin = require('../lib/index.ts');

describe('Transform CommonJS', function() {
  const defaults = {
    plugins: [plugin],
    sourceType: 'module',
  };

  describe('General behavior', () => {
    it('can ignore esm modules', async () => {
      const input = `
        export const undef = undefined;
      `;

      const { code } = await transformAsync(input, {
        ...defaults,
        sourceType: 'module',
      });

      equal(code, format`
        export const undef = undefined;
      `);
    });

    it('can ignore esm modules with module argument', async () => {
      const input = `
        function fakeModule(module) {
          module.exports = {};
          module.exports.fake = 'not real';
        }

        export const undef = undefined;
      `;

      const { code } = await transformAsync(input, {
        ...defaults,
        sourceType: 'module',
      });

      equal(code, format`
        function fakeModule(module) {
          module.exports = {};
          module.exports.fake = 'not real';
        }

        export const undef = undefined;
      `);
    });

    it('can ignore esm modules with exports argument', async () => {
      const input = `
        function fakeExports(exports) {
          exports = {};
          exports.fake = 'not real';
        }

        export const undef = undefined;
      `;

      const { code } = await transformAsync(input, {
        ...defaults,
        sourceType: 'module',
      });

      equal(code, format`
        function fakeExports(exports) {
          exports = {};
          exports.fake = 'not real';
        }

        export const undef = undefined;
      `);
    });

    it('can ignore esm modules with this set in function', async () => {
      const input = `
        function fakeExports() {
          this.fake = 'not real';
        }

        export const undef = undefined;
      `;

      const { code } = await transformAsync(input, {
        ...defaults,
        sourceType: 'module',
      });

      equal(code, format`
        function fakeExports() {
          this.fake = 'not real';
        }

        export const undef = undefined;
      `);
    });

    it('can support exporting all literal types', async () => {
      const input = `
        exports.Undefined = undefined;
        exports.Null = null;
        exports.Symbol = Symbol('test');
        exports.Number = 5;
        exports.Boolean = false;
        exports.String = 'hello world';
        exports.Function = function() {};
      `;

      const { code } = await transformAsync(input, { ...defaults });

      equal(code, format`
        var module = {
          exports: {}
        };
        var exports = module.exports;
        exports.Undefined = undefined;
        exports.Null = null;
        exports.Symbol = Symbol('test');
        exports.Number = 5;
        exports.Boolean = false;
        exports.String = 'hello world';

        exports.Function = function () {};

        export const Undefined = exports.Undefined;
        export const Null = exports.Null;
        export const Symbol = exports.Symbol;
        export const Number = exports.Number;
        export const Boolean = exports.Boolean;
        export const String = exports.String;
        export const Function = exports.Function;
        export default module.exports;
      `);
    });

    it('can support a simple default export', async () => {
      const input = `
        module.exports = "hello world";
      `;

      const { code } = await transformAsync(input, { ...defaults });

      equal(code, format`
        var module = {
          exports: {}
        };
        var exports = module.exports;
        module.exports = "hello world";
        export default module.exports;
      `);
    });

    it('can support a simple named export through module.exports', async () => {
      const input = `
        module.exports.test = "hello world";
      `;

      const { code } = await transformAsync(input, { ...defaults });

      equal(code, format`
        var module = {
          exports: {}
        };
        var exports = module.exports;
        module.exports.test = "hello world";
        export default module.exports;
      `);
    });

    it('can support tracking nested identifiers properly', async () => {
      const input = `
        function test() {
          var l = true;
          reference[l];
        }
      `;

      const { code, ast } = await transformAsync(input, {
        ...defaults,
        ast: true,
      });

      let bindings = null;

      traverseAst(ast, {
        Program(path) {
          bindings = path.scope.getAllBindings();
        }
      });

      equal(bindings.test.referenced, false, 'test is in the global scope');
      equal(bindings.l, undefined, 'l is not in the global scope');
    });

    it('can support early return', async () => {
      const input = `
        const { isMaster } = require('cluster');

        if (isMaster) {
          return;
        }

        console.log('Is Worker');
      `;

      const { code } = await transformAsync(input, {
        ...defaults,
        parserOpts: {
          allowReturnOutsideFunction: true,
        },
      });

      equal(code, format`
        import { isMaster } from "cluster";
        var module = {
          exports: {}
        };
        var exports = module.exports;
        (function () {
          if (isMaster) {
            return;
          }

          console.log('Is Worker');
        }).call(module.exports);
        export default module.exports;
      `);
    });

    it('can ignore invalid named exports, keeping them on default', async () => {
      const input = `
        exports["I'mateapot"] = {
          a: true,
        };
      `;

      const { code } = await transformAsync(input, {
        ...defaults,
      });

      equal(code, format`
        var module = {
          exports: {}
        };
        var exports = module.exports;
        exports["I'mateapot"] = {
          a: true
        };
        export default module.exports;
      `);
    });

    it('can support exporting via `this`', async () => {
      const input = `
        this.export = 'true';
      `;

      const { code } = await transformAsync(input, {
        ...defaults,
        parserOpts: {
          allowReturnOutsideFunction: true,
        },
      });

      equal(code, format`
        var module = {
          exports: {}
        };
        var exports = module.exports;
        (function () {
          this.export = 'true';
        }).call(module.exports);
        export default module.exports;
      `);
    });
  });

  describe('Bindings', () => {
    it.skip('can support binding module and exports to the program', async () => {
      const input = `
        console.log('here');
      `;

      const { code, ast } = await transformAsync(input, {
        ...defaults,
        ast: true,
      });

      let bindings = null;

      traverseAst(ast, {
        Program(path) {
          bindings = path.scope.getAllBindings();
        }
      });

      equal(bindings.module.referenced, true);
      equal(bindings.exports.referenced, false);

      equal(code, format`
        var module = {
          exports: {}
        };
        var exports = module.exports;
        console.log('here');
        export default module.exports;
      `);
    });

    it.skip('can support binding new identifiers created when hoisting', async () => {
      const input = `
        let traverse;
        if (true) {
          traverse = require('fs');
        }
      `;

      const { code, ast } = await transformAsync(input, {
        ...defaults,
        ast: true,
      });

      let bindings = null;

      traverseAst(ast, {
        Program(path) {
          bindings = path.scope.getAllBindings();
        }
      });

      equal(bindings.traverse.referenced, false);
      equal(bindings._fs.referenced, false);

      equal(code, format`
        import _fs from "fs";
        var module = {
          exports: {}
        };
        var exports = module.exports;
        let traverse;

        if (true) {
          traverse = _fs;
        }

        export default module.exports;
      `);
    });

    it.skip('can support tracking identifiers to assignments', async () => {
      const input = `
        function b() {}
        exports.a = 'hello world';
        exports.b = b;
      `;

      const { code, ast } = await transformAsync(input, {
        ...defaults,
        ast: true,
      });

      let bindings = null;
      let programPath = null;

      traverseAst(ast, {
        Program(path) {
          programPath = path;

          // HELP!
          // Trying to get this to reference function b() {}, exports.b = b;
          // export const b = exports.b;
          const binding = path.scope.getBinding('b');

          // Remove all references to `b`.
          binding.referencePaths.forEach(path => {
            path.remove();
          });

          binding.path.remove();
        }
      });

      equal(programPath.toString(), format`
        var module = {
          exports: {}
        };
        var exports = module.exports;
        exports.a = 'hello world';
        export const a = exports.a;
        export default module.exports;
      `);
    });
  });

  describe('Require', () => {
    it('can support a single require call', async () => {
      const input = `
        var a = require('path');
      `;

      const { code } = await transformAsync(input, { ...defaults });

      equal(code, format`
        import _path from "path";
        var module = {
          exports: {}
        };
        var exports = module.exports;
        var a = _path;
        export default module.exports;
      `);
    });

    it('can support a single require call using template literal', async () => {
      const input = `
        var a = require(\`path\`);
      `;

      const { code } = await transformAsync(input, { ...defaults });

      equal(code, format`
        import _path from "path";
        var module = {
          exports: {}
        };
        var exports = module.exports;
        var a = _path;
        export default module.exports;
      `);
    });

    it('can support a wrapped require call', async () => {
      const input = `
        var a = wrapped(require('path'));
      `;

      const { code } = await transformAsync(input, { ...defaults });

      equal(code, format`
        import _path from "path";
        var module = {
          exports: {}
        };
        var exports = module.exports;
        var a = wrapped(_path);
        export default module.exports;
      `);
    });

    it('can produce a unique name for an anonymous require', async () => {
      const input = `
        ((a) => {console.log(a)})(deeply(nested(require('./some/complex/path'))));
      `;

      const { code } = await transformAsync(input, { ...defaults });

      equal(code, format`
        import _someComplexPath from "./some/complex/path";
        var module = {
          exports: {}
        };
        var exports = module.exports;

        (a => {
          console.log(a);
        })(deeply(nested(_someComplexPath)));

        export default module.exports;
      `);
    });

    it('can support a memberexpression import assignment', async () => {
      const input = `
        var ArrayObservable_1 = require('./ArrayObservable');
        exports.of = ArrayObservable_1.ArrayObservable.of;
      `;

      const { code } = await transformAsync(input, { ...defaults });

      equal(code, format`
        import _ArrayObservable from "./ArrayObservable";
        var module = {
          exports: {}
        };
        var exports = module.exports;
        var ArrayObservable_1 = _ArrayObservable;
        exports.of = ArrayObservable_1.ArrayObservable.of;
        export const of = exports.of;
        export default module.exports;
      `);
    });
  });

  describe('Imports', () => {
    it('can support top-level default', async () => {
      const input = `
        var a = require('path');
      `;

      const { code } = await transformAsync(input, { ...defaults });

      equal(code, format`
        import _path from "path";
        var module = {
          exports: {}
        };
        var exports = module.exports;
        var a = _path;
        export default module.exports;
      `);
    });

    it('can support nested default', async () => {
      const input = `
        if (true) {
          var a = require('path');
        }
      `;

      const { code } = await transformAsync(input, { ...defaults });

      equal(code, format`
        import _path from "path";
        var module = {
          exports: {}
        };
        var exports = module.exports;

        if (true) {
          var a = _path;
        }

        export default module.exports;
      `);
    });

    it('can not support non-static import inside a try/catch by default', async () => {
      const input = `
        function test() {
          try {
            return require(name);
          } finally {
            LOADING_MODULES.delete(name);
          }
        }
      `;

      await transformAsync(input, { ...defaults }).catch(ex => {
        equal(ex.toString(), `Error: Invalid require signature: require(name)`);
      });
    });

    it('can support non-static import inside a try/catch, with option', async () => {
      const input = `
        function test() {
          try {
            return require(name);
          } finally {
            LOADING_MODULES.delete(name);
          }
        }
      `;

      const { code } = await transformAsync(input, {
        ...defaults,
        plugins: [[plugin,  {
          synchronousImport: true,
        }]],
      });

      equal(code, format`
        var module = {
          exports: {}
        };
        var exports = module.exports;

        function test() {
          try {
            return import(name);
          } finally {
            LOADING_MODULES.delete(name);
          }
        }

        export default module.exports;
      `);
    });

    it('can not support interpolated require call', async () => {
      const input = `
        var a = require('pat' + 'h');
      `;

      await transformAsync(input, { ...defaults }).catch(ex => {
        equal(ex.toString(), `Error: Invalid require signature: require('pat' + 'h')`);
      });
    });

    it('can support interpolated require call with option', async () => {
      const input = `
        var a = require('pat' + 'h');
      `;

      const { code } = await transformAsync(input, {
        ...defaults,
        plugins: [[plugin, {
          synchronousImport: true,
        }]]
      });

      equal(code, format`
        var module = {
          exports: {}
        };
        var exports = module.exports;
        var a = import('pat' + 'h');
        export default module.exports;
      `);
    });

    it('can support top-level nested', async () => {
      const input = `
        var { a } = require('path');
      `;

      const { code } = await transformAsync(input, { ...defaults });

      equal(code, format`
        import { a } from "path";
        var module = {
          exports: {}
        };
        var exports = module.exports;
        export default module.exports;
      `);
    });

    it('can support top-level nested renaming', async () => {
      const input = `
        var { a: b } = require('path');
      `;

      const { code } = await transformAsync(input, { ...defaults });

      equal(code, format`
        import { a as b } from "path";
        var module = {
          exports: {}
        };
        var exports = module.exports;
        export default module.exports;
      `);
    });

    it('can support require inside of a call expression', async () => {
      const input = `
        const data = _interopRequireDefault(require('a'));
      `;

      const { code } = await transformAsync(input, { ...defaults });

      equal(code, format`
        import _a from "a";
        var module = {
          exports: {}
        };
        var exports = module.exports;

        const data = _interopRequireDefault(_a);

        export default module.exports;
      `);
    });
  });

  describe('Exports', () => {
    it('can support top-level default', async () => {
      const input = `
        module.exports = 'a';
      `;

      const { code } = await transformAsync(input, { ...defaults });

      equal(code, format`
        var module = {
          exports: {}
        };
        var exports = module.exports;
        module.exports = 'a';
        export default module.exports;
      `);
    });

    it('can support nested default', async () => {
      const input = `
        if (true) {
          module.exports = 'a';
        }
      `;

      const { code } = await transformAsync(input, { ...defaults });

      equal(code, format`
        var module = {
          exports: {}
        };
        var exports = module.exports;

        if (true) {
          module.exports = 'a';
        }

        export default module.exports;
      `);
    });

    it('can support top-level named', async () => {
      const input = `
        const { a } = require('path');

        exports.a = a;
      `;

      const { code } = await transformAsync(input, { ...defaults });

      equal(code, format`
        import { a as _a } from "path";
        var module = {
          exports: {}
        };
        var exports = module.exports;
        exports.a = _a;
        export const a = exports.a;
        export default module.exports;
      `);
    });

    it('can support nested named', async () => {
      const input = `
        {
          exports.a = true;
        }
      `;

      const { code } = await transformAsync(input, { ...defaults });

      equal(code, format`
        var module = {
          exports: {}
        };
        var exports = module.exports;
        {
          exports.a = true;
        }
        export const a = exports.a;
        export default module.exports;
      `);
    });

    it('can support reading named exports from exports object', async () => {
      const input = `
        var { readFileSync } = require('path');
        exports.readFileSync = readFileSync;
        console.log(module.exports.readFileSync);
      `;

      const { code } = await transformAsync(input, { ...defaults });

      equal(code, format`
        import { readFileSync as _readFileSync } from "path";
        var module = {
          exports: {}
        };
        var exports = module.exports;
        exports.readFileSync = _readFileSync;
        console.log(module.exports.readFileSync);
        export const readFileSync = exports.readFileSync;
        export default module.exports;
      `);
    });

    it.skip('can support assign', async () => {
      /* Something needs to set state.isCJS for Object.defineProperty
       * and Object.defineProperties for this test to pass. */
      const input = `
        Object.defineProperty(exports, "__esModule", { value: true });
      `;

      const { code } = await transformAsync(input, { ...defaults });

      equal(code, format`
        var module = {
          exports: {}
        };
        var exports = module.exports;
        Object.defineProperty(exports, "__esModule", {
          value: true
        });
        export default module.exports;
      `);
    });
  });

  describe('Re-exports', () => {
    it('can support top-level named', async () => {
      const input = `
        exports.a = require('path');
      `;

      const { code } = await transformAsync(input, { ...defaults });

      equal(code, format`
        import _path from "path";
        var module = {
          exports: {}
        };
        var exports = module.exports;
        exports.a = _path;
        export const a = exports.a;
        export default module.exports;
      `);
    });

    it('can support top-level default', async () => {
      const input = `
        module.exports = require('path');
      `;

      const { code } = await transformAsync(input, { ...defaults });

      equal(code, format`
        import _path from "path";
        var module = {
          exports: {}
        };
        var exports = module.exports;
        module.exports = _path;
        export default module.exports;
      `);
    });

    it('can ensure export names will not collide', async () => {
      const input = `
        var a = require('path');
        exports.a = a;
      `;

      const { code } = await transformAsync(input, { ...defaults });

      equal(code, format`
        import _path from "path";
        var module = {
          exports: {}
        };
        var exports = module.exports;
        var _a = _path;
        exports.a = _a;
        export const a = exports.a;
        export default module.exports;
      `);
    });

    it('can ensure export names from named imports will not collide', async () => {
      const input = `
        var { readFileSync } = require('path');
        exports.readFileSync = readFileSync;
      `;

      const { code } = await transformAsync(input, { ...defaults });

      equal(code, format`
        import { readFileSync as _readFileSync } from "path";
        var module = {
          exports: {}
        };
        var exports = module.exports;
        exports.readFileSync = _readFileSync;
        export const readFileSync = exports.readFileSync;
        export default module.exports;
      `);
    });

    it('can support nested default', async () => {
      const input = `
        {
          module.exports = require('path');
        }
      `;

      const { code } = await transformAsync(input, { ...defaults });

      equal(code, format`
        import _path from "path";
        var module = {
          exports: {}
        };
        var exports = module.exports;
        {
          module.exports = _path;
        }
        export default module.exports;
      `);
    });

    it('can support nested named', async () => {
      const input = `
        {
          exports.a = require('path');
        }
      `;

      const { code } = await transformAsync(input, { ...defaults });

      equal(code, format`
        import _path from "path";
        var module = {
          exports: {}
        };
        var exports = module.exports;
        {
          exports.a = _path;
        }
        export const a = exports.a;
        export default module.exports;
      `);
    });

    it('supports multiple export assignment', async () => {
      const input = `
        exports.a = exports.b = undefined;
      `;

      const { code } = await transformAsync(input, { ...defaults });

      equal(code, format`
        var module = {
          exports: {}
        };
        var exports = module.exports;
        exports.a = exports.b = undefined;
        export const a = exports.a;
        export const b = exports.b;
        export default module.exports;
      `);
    });
  });
});
