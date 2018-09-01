const { throws, equal, deepEqual } = require('assert');
const { transformAsync } = require('@babel/core');
const { format } = require('./_utils');
const plugin = require('../index.ts');

describe('Transform CommonJS', function() {
  const defaults = {
    plugins: [plugin],
    sourceType: 'module',
  };

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

        (a => {
          console.log(a);
        })(deeply(nested(_someComplexPath)));

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

        if (true) {
          var a = _path;
        }

        export default module.exports;
      `);
    });

    it('does not support interpolated require call', async () => {
      const input = `
        var a = require('pat' + 'h');
      `;

      const { code } = await transformAsync(input, { ...defaults });

      equal(code, format`
        var module = {
          exports: {}
        };
        import('pat' + 'h');
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
        exports.a = _a;
        export const a = _a;
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
        {
          exports.a = true;
        }
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
        exports.readFileSync = _readFileSync;
        export const readFileSync = _readFileSync;
        console.log(module.exports.readFileSync);
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
        exports.a = _path;
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
        var _a = _path;
        exports.a = _a;
        export const a = _a;
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
        exports.readFileSync = _readFileSync;
        export const readFileSync = _readFileSync;
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
        {
          exports.a = _path;
        }
        export default module.exports;
      `);
    });
  });
});
