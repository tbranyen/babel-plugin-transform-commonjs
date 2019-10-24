const { throws, equal, deepEqual } = require('assert');
const { transformAsync } = require('@babel/core');
const { default: traverseAst } = require('@babel/traverse');
const { format } = require('./_utils');
const plugin = require('../lib/index.ts');

describe('Transform CommonJS', function () {
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

    it('can support a cjs module that has a binding to module', async () => {
      const input = `
        const { module } = global;

        module.exports = true;
      `;

      const { code } = await transformAsync(input, {
        ...defaults,
        sourceType: 'module',
      });

      equal(code, format`
        var module = {
          exports: {}
        };
        var exports = module.exports;
        const {
          module
        } = global;
        module.exports = true;
        export default module.exports;
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

        export let Undefined = exports.Undefined;
        export let Null = exports.Null;
        export let Symbol = exports.Symbol;
        export let Number = exports.Number;
        export let Boolean = exports.Boolean;
        export let String = exports.String;
        export let Function = exports.Function;
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
  });

  describe('Support `this`', () => {
    it('can support exporting via `this`', async () => {
      const input = `
        this.name = 'true';
        this.platform = {};
        this.platform.os = 'linux';
      `;

      const { code } = await transformAsync(input, {
        ...defaults,
      });

      equal(code, format`
        var module = {
          exports: {}
        };
        var exports = module.exports;
        exports.name = 'true';
        exports.platform = {};
        exports.platform.os = 'linux';
        export let name = exports.name;
        export let platform = exports.platform;
        export default module.exports;
      `);
    });

    it('does not transform scoped `this`', async () => {
      const input = `
        (() => {
          this.type = 'program'
        })()
        exports.name = 'babel'
      `;

      const { code } = await transformAsync(input, {
        ...defaults,
      });

      equal(code, format`
        var module = {
          exports: {}
        };
        var exports = module.exports;

        (() => {
          this.type = 'program';
        })();

        exports.name = 'babel';
        export let name = exports.name;
        export default module.exports;
      `);
    });
  })

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
        export let of = exports.of;
        export default module.exports;
      `);
    });
  });

  describe('Imports', () => {
    it('can ignore imports if exportsOnly is set', async () => {
      const input = `
        var a = require('path');
        exports.test = true;
      `;

      const { code } = await transformAsync(input, {
        ...defaults,
        plugins: [[plugin, {
          exportsOnly: true,
        }]],
      });

      equal(code, format`
        var module = {
          exports: {}
        };
        var exports = module.exports;

        var a = require('path');

        exports.test = true;
        export let test = exports.test;
        export default module.exports;
      `);
    });

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
        plugins: [[plugin, {
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
        export let a = exports.a;
        export default module.exports;
      `);
    });

    it('can support named default', async () => {
      const input = `
        const { a } = require('path');

        exports.default = a;
      `;

      const { code } = await transformAsync(input, { ...defaults });

      equal(code, format`
        import { a } from "path";
        var module = {
          exports: {}
        };
        var exports = module.exports;
        exports.default = a;
        export default module.exports;
      `);
    });

    it('can support named default with default', async () => {
      // export.default should be overridden
      const input = `
        const { a } = require('path');
        const thing = 'thing';

        exports.default = a;
        module.exports = thing;
      `;

      const { code } = await transformAsync(input, { ...defaults });

      equal(code, format`
        import { a } from "path";
        var module = {
          exports: {}
        };
        var exports = module.exports;
        const thing = 'thing';
        exports.default = a;
        module.exports = thing;
        export default module.exports;
      `);
    });

    it('can support duplicate named with initialization', async () => {
      const input = `
        exports.a = undefined;

        var a = exports.a = () => {};
      `;

      const { code } = await transformAsync(input, { ...defaults });

      equal(code, format`
        var module = {
          exports: {}
        };
        var exports = module.exports;
        exports.a = undefined;

        var _a = exports.a = () => {};

        export let a = exports.a;
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
        export let a = exports.a;
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
        export let readFileSync = exports.readFileSync;
        export default module.exports;
      `);
    });

    it('can support conditional mutable bindings', async () => {
      const input = `
        if (hasNativePerformanceNow) {
          var Performance = performance;
          exports.unstable_now = function () {
            return Performance.now();
          };
        } else {
          exports.unstable_now = function () {
            return localDate.now();
          };
        }
      `;

      const { code } = await transformAsync(input, { ...defaults });

      equal(code, format`
        var module = {
          exports: {}
        };
        var exports = module.exports;

        if (hasNativePerformanceNow) {
          var Performance = performance;

          exports.unstable_now = function () {
            return Performance.now();
          };
        } else {
          exports.unstable_now = function () {
            return localDate.now();
          };
        }

        export let unstable_now = exports.unstable_now;
        export default module.exports;
      `);
    });

    it.skip('can support defineProperty', async () => {
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
        export let __esModule = exports.__esModule;
        export default module.exports;
      `);
    });

    it.skip('can support defineProperties', async () => {
      /* Something needs to set state.isCJS for Object.defineProperty
       * and Object.defineProperties for this test to pass. */
      const input = `
        Object.defineProperties(exports, {
          __esModule: { value: true },
        });
      `;

      const { code } = await transformAsync(input, { ...defaults });

      equal(code, format`
        var module = {
          exports: {}
        };
        var exports = module.exports;
        Object.defineProperties(exports, {
          __esModule: {
            value: true
          }
        });
        export let __esModule = exports.__esModule;
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
        export let a = exports.a;
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
        export let a = exports.a;
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
        export let readFileSync = exports.readFileSync;
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
        export let a = exports.a;
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
        export let a = exports.a;
        export let b = exports.b;
        export default module.exports;
      `);
    });
  });
});
