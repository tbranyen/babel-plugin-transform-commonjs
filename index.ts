import { declare } from '@babel/helper-plugin-utils';
import {
  isModule,
  rewriteModuleStatementsAndPrepareHeader,
  isSideEffectImport,
  buildNamespaceInitStatements,
  ensureStatementsHoisted,
} from '@babel/helper-module-transforms';
import simplifyAccess from '@babel/helper-simple-access';
import { template, types as t } from '@babel/core';

export default declare((api, options) => {
  api.assertVersion(7);

  const {} = options;

  return {
    visitor: {
      Program: {
        enter(path, state) {
          const moduleExports = t.variableDeclaration('var', [
            t.variableDeclarator(
              t.identifier('module'),
              t.objectExpression([
                t.objectProperty(
                  t.identifier('exports'),
                  t.objectExpression([]),
                )
              ]),
            )
          ]);

          const defaultExport = t.exportDefaultDeclaration(
            t.memberExpression(
              t.identifier('module'),
              t.identifier('exports'),
            )
          );

          const programPath = path.scope.getProgramParent().path;
          programPath.unshiftContainer('body', moduleExports);
          programPath.pushContainer('body', defaultExport);
        }
      },

      VariableDeclarator: {
        enter(path, state) {
          const programPath = path.scope.getProgramParent().path;
          const { name } = path.node.id;

          if (name && !programPath.scope.hasBinding(name)) {
            programPath.scope.registerBinding(name, path);
          }
          else if (programPath.scope.hasBinding(name)) {
            programPath.scope.getBinding(name).reference(path);
          }
        }
      },

      CallExpression: {
        enter(path, state) {
          const { node } = path;

          // Look for `require()` any renaming is assumed to be intentionally
          // done to break this kind of check, so we won't look for aliases.
          if (t.isIdentifier(node.callee) && node.callee.name === 'require') {
            // Check for nested string and template literals.
            const isString = t.isStringLiteral(node.arguments[0]);
            const isLiteral = t.isTemplateLiteral(node.arguments[0]);

            // Normalize the string value, default to the standard string
            // literal format of `{ value: "" }`.
            let str = null;

            if (isString) {
              str = <t.StringLiteral>node.arguments[0];
            }
            else if (isLiteral) {
              str = {
                value: (<t.TemplateLiteral>node.arguments[0]).quasis[0].value.raw,
              };
            }
            else {
              const str = <t.StringLiteral>node.arguments[0];

              path.parentPath.parentPath.replaceWith(
                t.expressionStatement(
                  t.callExpression(t.import(), [str])
                )
              );

              return;
            }

            const specifiers = [];

            // Convert to named import.
            if (t.isObjectPattern(path.parentPath.node.id)) {
              path.parentPath.node.id.properties.forEach(prop => {
                specifiers.push(t.importSpecifier(
                  prop.value,
                  prop.key,
                ));
              });

              path.scope.getProgramParent().block.body.unshift(
                t.importDeclaration(specifiers, t.stringLiteral(str.value))
              );

              path.parentPath.remove();
            }
            // Convert to default import.
            else if (str) {
              const { parentPath } = path;
              const { left } = parentPath.node;
              const oldId = !t.isMemberExpression(left) ? left : left.id;

              // Default to the closest likely identifier.
              let id = oldId;

              // If we can't find an id, generate one from the import path.
              if (!oldId) {
                id = path.scope.generateUidIdentifier(str.value);
              }

              // Create an import declaration.
              const decl = t.importDeclaration(
                [id ? t.importDefaultSpecifier(id) : null].filter(Boolean),
                t.stringLiteral(str.value),
              );

              // Push the declaration in the root scope.
              path.scope.getProgramParent().path.unshiftContainer('body', decl);

              const { keys } = Object;

              // If we needed to generate or the change the id, then make an
              // assignment so the values stay in sync.
              if (oldId && !t.isNodesEquivalent(oldId, id)) {
                path.parentPath.parentPath.replaceWith(
                  t.expressionStatement(
                    t.assignmentExpression(
                      '=',
                      oldId,
                      id,
                    )
                  )
                );
              }
              // If we generated a new identifier for this, replace the inline
              // call with the variable.
              else if (!oldId) {
                path.replaceWith(id);
              }
              // Otherwise completely remove.
              else {
                path.parentPath.remove();
              }
            }
          }
        }
      },

      ImportDefaultSpecifier: {
        enter(path, state) {
          path.scope.getProgramParent().registerBinding(path.node.local.name, path);
        }
      },

      AssignmentExpression: {
        enter(path, state) {
          // Check for module.exports.
          if (t.isMemberExpression(path.node.left)) {
            if (t.isIdentifier(path.node.left.object)) {
              // Looking at a re-exports, handled above.
              if (t.isCallExpression(path.node.right)) {
                return;
              }

              if (path.node.left.object.name === 'exports') {
                const decl =  t.exportNamedDeclaration(
                  t.variableDeclaration(
                    'const',
                    [t.variableDeclarator(
                      path.node.left.property,
                      path.node.right
                    )],
                  ),
                  [],
                );

                // If we're in the root scope then replace the node. Otherwise
                // we cannot guarentee a named export.
                if (path.scope.path.isProgram()) {
                  path.parentPath.replaceWith(decl);
                }
              }
            }
          }
        }
      },
    },
  };
});
