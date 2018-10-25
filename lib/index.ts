import { declare } from '@babel/helper-plugin-utils';
import { template, types as t } from '@babel/core';

export default declare((api, options) => {
  api.assertVersion(7);

  const state = {
    globals: new Set(),
    renamed: new Map(),
    identifiers: new Map(),
  };

  const enter = path => {
    let cursor = path;

    do {
      // Ignore block statements.
      if (t.isBlockStatement(cursor.scope.path)) {
        continue;
      }

      if (t.isFunction(cursor.scope.path) || t.isProgram(cursor.scope.path)) {
        break;
      }
    } while (cursor = cursor.scope.path.parentPath);

    if (t.isProgram(cursor.scope.path)) {
      const nodes = [];
      const inner = [];

      // Break up the program, separate Nodes added by us from the nodes
      // created by the user.
      cursor.scope.path.node.body.filter(node => {
        // Keep replaced nodes together, these will not be wrapped.
        if (node.__replaced) {
          nodes.push(node);
        }
        else {
          inner.push(node);
        }
      });

      const program = t.program([
        ...nodes,
        t.expressionStatement(
          t.callExpression(
            t.memberExpression(
              t.functionExpression(
                null,
                [],
                t.blockStatement(inner),
              ),
              t.identifier('call'),
            ),
            [t.identifier('module.exports')],
          )
        ),
      ]);

      cursor.scope.path.replaceWith(program);
    }
  };

  return {
    post() {
      state.globals.clear();
      state.renamed.clear();
      state.identifiers.clear();
    },

    visitor: {
      Program: {
        enter(path) {
          if (path.node.__replaced) { return; }

          const exportsAlias = t.variableDeclaration('var', [
            t.variableDeclarator(
              t.identifier('exports'),
              t.memberExpression(
                t.identifier('module'),
                t.identifier('exports'),
              )
            )
          ]);

          const moduleExportsAlias = t.variableDeclaration('var', [
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

          exportsAlias.__replaced = true;
          moduleExportsAlias.__replaced = true;

          const programPath = path.scope.getProgramParent().path;

          // Add the `module` and `exports` globals into the program body.
          programPath.unshiftContainer('body', exportsAlias);
          programPath.unshiftContainer('body', moduleExportsAlias);

          const modulePath = programPath.get('body.0');
          const exportsPath = programPath.get('body.1');

          // Ensure these are registered in the program scope.
          path.scope.registerBinding('module', modulePath);
          path.scope.registerBinding('exports', exportsPath);

          // Ensure module gets referenced by the exports declaration.
          path.scope.getBinding('module').reference(exportsPath);
        },

        exit(path) {
          if (path.node.__replaced) { return; }

          const programPath = path.scope.getProgramParent().path;

          const defaultExport = t.exportDefaultDeclaration(
            t.memberExpression(
              t.identifier('module'),
              t.identifier('exports'),
            )
          );

          path.node.__replaced = true;
          defaultExport.__replaced = true;

          programPath.pushContainer('body', defaultExport);
        }
      },

      ThisExpression: { enter },
      ReturnStatement: { enter },

      Identifier: {
        enter(path) {
          state.identifiers.set(path, path.node.name);
        }
      },

      CallExpression: {
        enter(path) {
          const { node } = path;

          // Look for `require()` any renaming is assumed to be intentionally
          // done to break state kind of check, so we won't look for aliases.
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
            else if (options.synchronousImport) {
              const str = <t.StringLiteral>node.arguments[0];
              const newNode = t.expressionStatement(
                t.callExpression(t.import(), [str])
              );

              newNode.__replaced = true;

              path.replaceWith(newNode);

              return;
            }
            else {
              throw new Error(`Invalid require signature: ${path.toString()}`);
            }

            const specifiers = [];

            // Convert to named import.
            if (t.isObjectPattern(path.parentPath.node.id)) {
              path.parentPath.node.id.properties.forEach(prop => {
                specifiers.push(t.importSpecifier(
                  prop.value,
                  prop.key,
                ));

                state.globals.add(prop.value.name);
              });

              const decl = t.importDeclaration(
                specifiers,
                t.stringLiteral(str.value),
              );

              decl.__replaced = true;

              path.scope.getProgramParent().path.unshiftContainer('body', decl);
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
              if (!oldId || !t.isProgram(parentPath.scope.path.type)) {
                id = path.scope.generateUidIdentifier(str.value);
              }

              // Add state global name to the list.
              state.globals.add(id.name);

              // Create an import declaration.
              const decl = t.importDeclaration(
                [t.importDefaultSpecifier(id)],
                t.stringLiteral(str.value),
              );

              decl.__replaced = true;

              // Push the declaration in the root scope.
              path.scope.getProgramParent().path.unshiftContainer('body', decl);

              const { keys } = Object;

              // If we needed to generate or the change the id, then make an
              // assignment so the values stay in sync.
              if (oldId && !t.isNodesEquivalent(oldId, id)) {
                const newNode = t.expressionStatement(
                  t.assignmentExpression(
                    '=',
                    oldId,
                    id,
                  )
                );

                newNode.__replaced = true;

                path.parentPath.parentPath.replaceWith(newNode);
              }
              // If we generated a new identifier for state, replace the inline
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
        enter(path) {
          path.scope.getProgramParent().registerBinding(
            path.node.local.name,
            path,
          );
        }
      },

      ImportSpecifier: {
        enter(path) {
          const { name } = path.node.local;

          // If state import was renamed, ensure the source reflects it.
          if (state.renamed.has(name)) {
            const oldName = t.identifier(name);
            const newName = t.identifier(state.renamed.get(name));

            path.replaceWith(t.importSpecifier(newName, oldName));
            path.scope.getProgramParent().registerBinding(oldName.name, path);
          }
          // Otherwise, register the final identifier.
          else {
            path.scope.getProgramParent().registerBinding(name, path);
          }
        }
      },

      ExportNamedDeclaration: {
        enter(path) {
          const nested = path.node.declaration.declarations[0];
          let name = nested.name;

          if (nested.property) {
            name = nested.property.name;
          }

          if (nested.id) {
            name = nested.id.name;
          }

          const programScope = path.scope.getProgramParent();

          // If state import was renamed, ensure the source reflects it.
          if (name && state.renamed.has(name)) {
            //programScope.registerBinding(name, path);
            const oldBinding = programScope.getBinding(state.renamed.get(name));

            programScope.registerBinding(name, path);

            const newBinding = programScope.getBinding(name);

            // Mirror over the reference paths.
            const bindReferences = (oldBinding) => {
              oldBinding.referencePaths.forEach(path => {
                if (path.type === 'Identifier') {
                  newBinding.reference(path.parentPath);
                  const innerBinding = programScope.getBinding(path.node.name);

                  if (oldBinding !== innerBinding) {
                    bindReferences(innerBinding)
                  }
                }
                else {
                  newBinding.reference(path);
                }
              });
            };

            bindReferences(oldBinding);

            // Ensure all identifiers are linked up properly.
            state.identifiers.forEach((key, path) => {
              if (key === name || key === state.renamed.get(name)) {
                if (path.type === 'Identifier') {
                  newBinding.reference(path.parentPath);
                }
                else {
                  newBinding.reference(path);
                }
              }
            });
          }
          // Otherwise, register the final identifier.
          else if (name) {
            programScope.registerBinding(name, path);
          }
        }
      },

      AssignmentExpression: {
        enter(path) {
          if (path.node.__ignore) {
            return;
          }

          path.node.__ignore = true;

          // Check for module.exports.
          if (t.isMemberExpression(path.node.left)) {
            if (
              t.isIdentifier(path.node.left.object) && (
                path.node.left.object.name === 'module'
              )
            ) {
              // Looking at a re-exports, handled above.
              if (t.isCallExpression(path.node.right)) {
                return;
              }
            }
            // Check for regular exports
            else if (path.node.left.object.name === 'exports') {
              let prop = path.node.right;

              if (
                (
                  path.scope.getProgramParent().hasBinding(prop.name) ||
                  state.globals.has(prop.name)
                // Don't rename `undefined`.
                ) && prop.name !== 'undefined'
              ) {
                prop = path.scope.generateUidIdentifier(prop.name);

                const oldName = path.node.right.name;
                state.renamed.set(oldName, prop.name);

                // Add this new identifier into the globals and replace the
                // right hand side with this replacement.
                state.globals.add(prop.name);
                path.get('right').replaceWith(prop);
                path.scope.rename(oldName, prop.name);
              }

              // If we set an invalid name, then abort out.
              try {
                const decl = t.exportNamedDeclaration(
                  t.variableDeclaration('const', [
                    t.variableDeclarator(
                      path.node.left.property,
                      t.memberExpression(
                        t.identifier('exports'),
                        path.node.left.property
                      )
                    )
                  ]),
                  [],
                );

                path.scope.getProgramParent().path.pushContainer('body', decl);
              }
              catch (unhandledException) {}
            }
          }
        }
      },
    },
  };
});
