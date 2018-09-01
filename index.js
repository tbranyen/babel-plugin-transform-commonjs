"use strict";
exports.__esModule = true;
var helper_plugin_utils_1 = require("@babel/helper-plugin-utils");
var core_1 = require("@babel/core");
exports["default"] = helper_plugin_utils_1.declare(function (api, options) {
    api.assertVersion(7);
    var _a = options;
    return {
        visitor: {
            Program: {
                enter: function (path, state) {
                    var moduleExports = core_1.types.variableDeclaration('var', [
                        core_1.types.variableDeclarator(core_1.types.identifier('module'), core_1.types.objectExpression([
                            core_1.types.objectProperty(core_1.types.identifier('exports'), core_1.types.objectExpression([]))
                        ]))
                    ]);
                    var defaultExport = core_1.types.exportDefaultDeclaration(core_1.types.memberExpression(core_1.types.identifier('module'), core_1.types.identifier('exports')));
                    var programPath = path.scope.getProgramParent().path;
                    programPath.unshiftContainer('body', moduleExports);
                    programPath.pushContainer('body', defaultExport);
                }
            },
            VariableDeclarator: {
                enter: function (path, state) {
                    var programPath = path.scope.getProgramParent().path;
                    var name = path.node.id.name;
                    if (name && !programPath.scope.hasBinding(name)) {
                        programPath.scope.registerBinding(name, path);
                    }
                    else if (programPath.scope.getBinding(name)) {
                        programPath.scope.getBinding(name).reference(path);
                    }
                }
            },
            CallExpression: {
                enter: function (path, state) {
                    var node = path.node;
                    state.globals = state.globals || new Set();
                    // Look for `require()` any renaming is assumed to be intentionally
                    // done to break this kind of check, so we won't look for aliases.
                    if (core_1.types.isIdentifier(node.callee) && node.callee.name === 'require') {
                        // Check for nested string and template literals.
                        var isString = core_1.types.isStringLiteral(node.arguments[0]);
                        var isLiteral = core_1.types.isTemplateLiteral(node.arguments[0]);
                        // Normalize the string value, default to the standard string
                        // literal format of `{ value: "" }`.
                        var str = null;
                        if (isString) {
                            str = node.arguments[0];
                        }
                        else if (isLiteral) {
                            str = {
                                value: node.arguments[0].quasis[0].value.raw
                            };
                        }
                        else {
                            var str_1 = node.arguments[0];
                            path.parentPath.parentPath.replaceWith(core_1.types.expressionStatement(core_1.types.callExpression(core_1.types["import"](), [str_1])));
                            return;
                        }
                        var specifiers_1 = [];
                        // Convert to named import.
                        if (core_1.types.isObjectPattern(path.parentPath.node.id)) {
                            path.parentPath.node.id.properties.forEach(function (prop) {
                                specifiers_1.push(core_1.types.importSpecifier(prop.value, prop.key));
                                state.globals.add(prop.value.name);
                            });
                            var decl = core_1.types.importDeclaration(specifiers_1, core_1.types.stringLiteral(str.value));
                            path.scope.getProgramParent().path.unshiftContainer('body', decl);
                            path.parentPath.remove();
                        }
                        // Convert to default import.
                        else if (str) {
                            var parentPath = path.parentPath;
                            var left = parentPath.node.left;
                            var oldId = !core_1.types.isMemberExpression(left) ? left : left.id;
                            // Default to the closest likely identifier.
                            var id = oldId;
                            // If we can't find an id, generate one from the import path.
                            if (!oldId) {
                                id = path.scope.generateUidIdentifier(str.value);
                            }
                            // Add this global name to the list.
                            state.globals.add(id.name);
                            // Create an import declaration.
                            var decl = core_1.types.importDeclaration([core_1.types.importDefaultSpecifier(id)], core_1.types.stringLiteral(str.value));
                            // Push the declaration in the root scope.
                            path.scope.getProgramParent().path.unshiftContainer('body', decl);
                            var keys = Object.keys;
                            // If we needed to generate or the change the id, then make an
                            // assignment so the values stay in sync.
                            if (oldId && !core_1.types.isNodesEquivalent(oldId, id)) {
                                path.parentPath.parentPath.replaceWith(core_1.types.expressionStatement(core_1.types.assignmentExpression('=', oldId, id)));
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
                enter: function (path, state) {
                    path.scope.getProgramParent().registerBinding(path.node.local.name, path);
                }
            },
            ImportSpecifier: {
                enter: function (path, state) {
                    state.renamed = state.renamed || new Map();
                    var name = path.node.local.name;
                    // If this import was renamed, ensure the source reflects it.
                    if (state.renamed.has(name)) {
                        var oldName = core_1.types.identifier(name);
                        var newName = core_1.types.identifier(state.renamed.get(name));
                        path.replaceWith(core_1.types.importSpecifier(newName, oldName));
                    }
                    // Otherwise, register the final identifier.
                    else {
                        path.scope.getProgramParent().registerBinding(name, path);
                    }
                }
            },
            AssignmentExpression: {
                enter: function (path, state) {
                    state.globals = state.globals || new Set();
                    state.renamed = state.renamed || new Map();
                    // Check for module.exports.
                    if (core_1.types.isMemberExpression(path.node.left)) {
                        if (core_1.types.isIdentifier(path.node.left.object)) {
                            // Looking at a re-exports, handled above.
                            if (core_1.types.isCallExpression(path.node.right)) {
                                return;
                            }
                            if (path.node.left.object.name === 'exports') {
                                var prop = path.node.right;
                                if (path.scope.getProgramParent().hasBinding(prop.name) ||
                                    state.globals.has(prop.name)) {
                                    prop = path.scope.generateUidIdentifier(prop.name);
                                    state.globals.add(prop.name);
                                }
                                var decl = core_1.types.exportNamedDeclaration(core_1.types.variableDeclaration('const', [
                                    core_1.types.variableDeclarator(path.node.left.property, prop)
                                ]), []);
                                // If we're in the root scope then replace the node. Otherwise
                                // we cannot guarentee a named export.
                                if (path.scope.path.isProgram()) {
                                    // The order matters here, we need to rename first, and then
                                    // replace.
                                    path.scope.rename(path.node.right.name, prop.name);
                                    state.renamed.set(path.node.right.name, prop.name);
                                    path.parentPath.replaceWith(decl);
                                }
                            }
                        }
                    }
                }
            }
        }
    };
});
