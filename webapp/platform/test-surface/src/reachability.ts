// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import ts from 'typescript';

/** Module specifiers a file loads: imports, re-exports, `import()` and `require()`. */
function specifiersOf(sf: ts.SourceFile): string[] {
    const out: string[] = [];
    const visit = (n: ts.Node) => {
        if ((ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) && n.moduleSpecifier && ts.isStringLiteralLike(n.moduleSpecifier)) {
            out.push(n.moduleSpecifier.text);
        } else if (ts.isImportEqualsDeclaration(n) && ts.isExternalModuleReference(n.moduleReference) && ts.isStringLiteralLike(n.moduleReference.expression)) {
            out.push(n.moduleReference.expression.text);
        } else if (ts.isCallExpression(n) && n.arguments.length && ts.isStringLiteralLike(n.arguments[0]) &&
            (n.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(n.expression) && n.expression.text === 'require'))) {
            out.push(n.arguments[0].text);
        }
        ts.forEachChild(n, visit);
    };
    visit(sf);
    return out;
}

/**
 * The program's files that the app loads: everything reachable from `entries` (absolute paths of files, or of
 * directories with an index) through the import graph. Files only tests or stories import aren't in it.
 */
export function reachableFiles(program: ts.Program, entries: string[]): Set<string> {
    const options = program.getCompilerOptions();
    const host = ts.createCompilerHost(options);
    const cache = ts.createModuleResolutionCache(program.getCurrentDirectory(), (f) => host.getCanonicalFileName(f), options);
    const resolve = (spec: string, from: string) => ts.resolveModuleName(spec, from, options, host, cache).resolvedModule?.resolvedFileName;
    const seen = new Set<string>();
    const queue: string[] = [];
    for (const entry of entries) {
        const f = program.getSourceFile(entry) ? entry : resolve(entry, `${entry}/index.ts`);
        if (f && program.getSourceFile(f)) {
            queue.push(f);
        }
    }
    while (queue.length) {
        const f = queue.pop()!;
        if (seen.has(f)) {
            continue;
        }
        seen.add(f);
        const sf = program.getSourceFile(f);
        if (!sf) {
            continue;
        }
        for (const spec of specifiersOf(sf)) {
            const target = resolve(spec, f);
            if (target && !seen.has(target) && program.getSourceFile(target)) {
                queue.push(target);
            }
        }
    }
    return seen;
}
