import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';

const app = resolve(import.meta.dirname, '..');
const root = resolve(app, '../..');
let input = '';
for await (const chunk of process.stdin) input += chunk;
const paths = JSON.parse(input);
const result = {};
for (const item of paths) {
  const path = resolve(root, item);
  if (relative(resolve(root, 'web'), path).startsWith('..') || path.startsWith(app)) continue;
  const text = readFileSync(path, 'utf8');
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  const members = [];
  const isExported = node => node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword);
  function add(name, node, body, kind) {
    const statements = body && ts.isBlock(body) ? body.statements.length : body ? 1 : 0;
    const first = body && ts.isBlock(body) ? body.statements[0] : undefined;
    const constantReturn = statements === 1 && first && ts.isReturnStatement(first) &&
      (!first.expression || [ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NullKeyword, ts.SyntaxKind.NumericLiteral, ts.SyntaxKind.StringLiteral].includes(first.expression.kind));
    const throwOnly = statements === 1 && first && ts.isThrowStatement(first);
    members.push({name, kind, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
      statements, has_body: !!body, empty_body: !!body && statements === 0,
      constant_return: !!constantReturn, throw_only: !!throwOnly});
  }
  for (const statement of source.statements) {
    if (!isExported(statement)) continue;
    if (ts.isFunctionDeclaration(statement)) add(statement.name?.text ?? 'default', statement, statement.body, 'function');
    else if (ts.isClassDeclaration(statement)) {
      for (const member of statement.members) {
        if (ts.isMethodDeclaration(member) || ts.isConstructorDeclaration(member) || ts.isGetAccessorDeclaration(member) || ts.isSetAccessorDeclaration(member)) {
          const name = `${statement.name?.text ?? 'default'}::${member.name?.getText(source) ?? 'constructor'}`;
          add(name, member, member.body, 'class_member');
        }
      }
    } else if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        const init = declaration.initializer;
        if (init && (ts.isArrowFunction(init) || ts.isFunctionExpression(init))) add(declaration.name.getText(source), declaration, init.body, 'function');
        else if (init && ts.isObjectLiteralExpression(init)) {
          for (const member of init.properties) {
            if (ts.isMethodDeclaration(member)) add(`${declaration.name.getText(source)}.${member.name.getText(source)}`, member, member.body, 'object_member');
          }
        }
      }
    }
  }
  result[item] = {members, diagnostics: source.parseDiagnostics.map(d => ts.flattenDiagnosticMessageText(d.messageText, ' ')),
    executable_members: members.filter(m => m.has_body && !m.empty_body && !m.throw_only).length,
    empty_members: members.filter(m => m.empty_body).length,
    throw_only_members: members.filter(m => m.throw_only).length,
    constant_return_members: members.filter(m => m.constant_return).length};
}
process.stdout.write(JSON.stringify(result));
