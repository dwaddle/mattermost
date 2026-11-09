// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import fs from 'node:fs';
import path from 'node:path';

import yaml from 'js-yaml';
import ts from 'typescript';

import {exprName, strip, typeText} from './ast.ts';
import {cmp} from './compare.ts';
import type {ProgramIndex} from './program_index.ts';

export type ClientRoute = {verb: string; path: string};

/** A client method's response type as importable TypeScript. */
export type BodyType = {type: string; imports: Record<string, string>};

export type OpenApiOp = {verb: string; path: string; opId: string; file: string; schema: string | null; responses: string[]};

/** An operation an action can trigger: an OpenAPI operation, or a client endpoint missing from the spec. */
export type Operation = {
    opId: string;
    verb: string;
    path: string;

    /** TypeScript type of the response body (from the client method), or null when unknown. */
    body: string | null;
    bodyImports?: Record<string, string>;

    /** OpenAPI response schema name. */
    schema?: string | null;
    inSpec: boolean;
    client: string;
};

type Member = ts.ClassElement;

/** Client4 method -> HTTP verb + path template, by evaluating its route helpers. */
export function clientRoutes(ix: ProgramIndex): {routes: Map<string, ClientRoute[]>; bodies: Map<string, BodyType | null>} {
    const routes = new Map<string, ClientRoute[]>();
    const bodies = new Map<string, BodyType | null>();
    const cfg = ix.config.client;
    if (!cfg) {
        return {routes, bodies};
    }
    const sf = ix.program.getSourceFile(cfg.file) ?? ix.program.getSourceFiles().find((f) => path.resolve(f.fileName) === path.resolve(cfg.file));
    if (!sf) {
        throw new Error(`client file ${cfg.file} is not part of the program`);
    }
    let cls: ts.ClassDeclaration | undefined;
    ts.forEachChild(sf, (n) => {
        if (ts.isClassDeclaration(n) && n.name?.text === cfg.className) {
            cls = n;
        }
    });
    if (!cls) {
        throw new Error(`class ${cfg.className} not found in ${cfg.file}`);
    }
    const members = new Map<string, Member>();
    for (const m of cls.members) {
        if (m.name) {
            members.set(m.name.getText(), m);
        }
    }
    const fnOf = (m: Member): ts.FunctionLikeDeclaration | null => {
        if (ts.isMethodDeclaration(m)) {
            return m;
        }
        if (ts.isPropertyDeclaration(m) && m.initializer && (ts.isArrowFunction(m.initializer) || ts.isFunctionExpression(m.initializer))) {
            return m.initializer;
        }
        return null;
    };
    const returnsOf = (fn: ts.FunctionLikeDeclaration) => {
        if (!fn.body) {
            return [];
        }
        if (!ts.isBlock(fn.body)) {
            return [fn.body];
        }
        const o: ts.Expression[] = [];
        const v = (n: ts.Node) => {
            if (ts.isReturnStatement(n) && n.expression) {
                o.push(n.expression);
            }
            if (!ts.isFunctionLike(n)) {
                ts.forEachChild(n, v);
            }
        };
        ts.forEachChild(fn.body, v);
        return o;
    };

    const evalUrl = (e: ts.Expression | undefined, env: Map<string, string | null>, depth = 0): string => {
        const x = strip(e) as ts.Expression;
        if (!x || depth > 12) {
            return '{*}';
        }
        if (ts.isStringLiteral(x) || ts.isNoSubstitutionTemplateLiteral(x)) {
            return x.text;
        }
        if (ts.isTemplateExpression(x)) {
            return x.head.text + x.templateSpans.map((s) => evalUrl(s.expression, env, depth + 1) + s.literal.text).join('');
        }
        if (ts.isBinaryExpression(x) && x.operatorToken.kind === ts.SyntaxKind.PlusToken) {
            return evalUrl(x.left, env, depth + 1) + evalUrl(x.right, env, depth + 1);
        }
        if (ts.isPropertyAccessExpression(x) && x.expression.kind === ts.SyntaxKind.ThisKeyword) {
            if (x.name.text === 'url') {
                return '';
            }
            if (x.name.text === 'urlVersion') {
                return cfg.urlVersion;
            }
            return '{*}';
        }
        if (ts.isPropertyAccessExpression(x)) {
            return `{${x.getText()}}`;
        }
        if (ts.isCallExpression(x)) {
            const c = strip(x.expression) as ts.Expression;
            if (ts.isPropertyAccessExpression(c) && c.expression.kind === ts.SyntaxKind.ThisKeyword && members.has(c.name.text)) {
                const fn = fnOf(members.get(c.name.text)!);
                if (fn) {
                    const env2 = new Map<string, string | null>();
                    fn.parameters.forEach((p, i) => env2.set(p.name.getText(), x.arguments[i] ? evalUrl(x.arguments[i], env, depth + 1) : ''));
                    const r = returnsOf(fn)[0];
                    return r ? evalUrl(r, env2, depth + 1) : '{*}';
                }
            }
            const name = exprName(c);
            if (name === 'buildQueryString') {
                return '';
            }
            if (name === 'encodeURIComponent' || name === 'encodeURI' || name === 'toString' || name === 'String') {
                return evalUrl(x.arguments[0] ?? (ts.isPropertyAccessExpression(c) ? c.expression : undefined), env, depth + 1);
            }
            return '{*}';
        }
        if (ts.isIdentifier(x)) {
            if (env.has(x.text)) {
                const v = env.get(x.text);
                return v === null || v === undefined ? `{${x.text}}` : v;
            }
            const d = ix.checker.getSymbolAtLocation(x)?.valueDeclaration;
            if (d && ts.isVariableDeclaration(d) && d.initializer) {
                return evalUrl(d.initializer, env, depth + 1);
            }
            return `{${x.text}}`;
        }
        if (ts.isConditionalExpression(x)) {
            return evalUrl(x.whenFalse, env, depth + 1);
        }
        return '{*}';
    };

    for (const [name, m] of members) {
        const fn = fnOf(m);
        if (!fn || !fn.body) {
            continue;
        }
        const found: ClientRoute[] = [];
        const v = (n: ts.Node) => {
            if (ts.isCallExpression(n)) {
                const c = strip(n.expression) as ts.Expression;
                if (ts.isPropertyAccessExpression(c) && c.expression.kind === ts.SyntaxKind.ThisKeyword && (/^doFetch/).test(c.name.text) && n.arguments[0]) {
                    const env = new Map<string, string | null>(fn.parameters.map((p) => [p.name.getText(), null]));
                    const url = evalUrl(n.arguments[0], env).split('?')[0].replace(/\/$/, '');
                    let opt = strip(n.arguments[1]) as ts.Expression | undefined;
                    if (opt && ts.isIdentifier(opt)) {
                        const d = ix.checker.getSymbolAtLocation(opt)?.valueDeclaration;
                        if (d && ts.isVariableDeclaration(d) && d.initializer) {
                            opt = strip(d.initializer) as ts.Expression;
                        }
                    }
                    let verbs = ['GET'];
                    if (opt && ts.isObjectLiteralExpression(opt)) {
                        const mp = opt.properties.find((p) => p.name?.getText() === 'method');
                        const mi = mp && ts.isPropertyAssignment(mp) ? strip(mp.initializer) as ts.Expression : null;
                        if (mi && ts.isStringLiteral(mi)) {
                            verbs = [mi.text.toUpperCase()];
                        } else if (mi && ts.isConditionalExpression(mi)) {
                            verbs = [mi.whenTrue, mi.whenFalse].filter(ts.isStringLiteral).map((s) => s.text.toUpperCase());
                        }
                    }
                    for (const vb of verbs) {
                        found.push({verb: vb, path: url});
                    }
                }
            }
            ts.forEachChild(n, v);
        };
        v(fn.body);
        if (found.length) {
            routes.set(name, found);
            bodies.set(name, bodyTypeOf(ix, fn));
        }
    }
    return {routes, bodies};
}

/** `Promise<Channel>` -> Channel, importable from @mattermost/types when declared in the entity dirs. */
function bodyTypeOf(ix: ProgramIndex, fn: ts.FunctionLikeDeclaration): BodyType | null {
    const sig = ix.checker.getSignatureFromDeclaration(fn);
    if (!sig) {
        return null;
    }
    let t = ix.checker.getReturnTypeOfSignature(sig);
    if (t.getSymbol()?.getName() === 'Promise') {
        const [inner] = ix.checker.getTypeArguments(t as ts.TypeReference);
        if (inner) {
            t = inner;
        }
    }

    // doFetchWithResponse returns {response, headers, data}: the response body is `data`
    const data = (t.aliasSymbol ?? t.getSymbol())?.getName() === 'ClientResponse' ? ix.checker.getPropertyOfType(t, 'data') : undefined;
    if (data) {
        t = ix.checker.getTypeOfSymbolAtLocation(data, fn);
    }
    if (t.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) {
        return null;
    }
    const imports: Record<string, string> = {};
    const ok = collectImports(ix, t, imports, 0);
    if (!ok) {
        return null;
    }

    // union member order depends on type creation order in the checker: sort for a deterministic manifest
    const text = typeText(ix.checker, t, ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseFullyQualifiedType).replace(/import\("[^"]+"\)\./g, '');
    const sorted: Record<string, string> = {};
    for (const k of Object.keys(imports).sort()) {
        sorted[k] = imports[k];
    }
    return {type: text, imports: sorted};
}

/** Every named type in `t` must be importable (from an entity dir) or built-in. */
function collectImports(ix: ProgramIndex, t: ts.Type, out: Record<string, string>, depth: number): boolean {
    if (depth > 6) {
        return false;
    }
    if (t.flags & (ts.TypeFlags.String | ts.TypeFlags.Number | ts.TypeFlags.Boolean | ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.Void | ts.TypeFlags.Literal | ts.TypeFlags.BooleanLiteral)) {
        return true;
    }
    const alias = t.aliasSymbol;

    // a named alias from the entity dirs (ServerChannel = Channel & {...}) is imported by name
    const aliasDecl = alias?.declarations?.[0];
    const aliasDir = aliasDecl && ix.config.entityTypeDirs.find((d) => path.resolve(aliasDecl.getSourceFile().fileName).startsWith(d + path.sep));
    if ((t.isUnion() || t.isIntersection()) && !aliasDir) {
        return t.types.every((m) => collectImports(ix, m, out, depth + 1));
    }
    const sym = alias ?? t.getSymbol();
    if (ix.checker.isArrayType(t)) {
        const [el] = ix.checker.getTypeArguments(t as ts.TypeReference);
        return el ? collectImports(ix, el, out, depth + 1) : false;
    }
    if (sym) {
        const name = sym.getName();
        if (name === '__type' || name === '__object') {
            return false;
        }
        if (['Record', 'Partial', 'Array', 'Map', 'Set', 'Promise', 'Blob'].includes(name)) {
            const args = alias ? (t.aliasTypeArguments ?? []) : ix.checker.getTypeArguments(t as ts.TypeReference);
            return (args ?? []).every((a) => collectImports(ix, a, out, depth + 1));
        }
        const decl = sym.declarations?.[0];
        const file = decl ? path.resolve(decl.getSourceFile().fileName) : '';
        const dir = ix.config.entityTypeDirs.find((d) => file.startsWith(d + path.sep));
        if (!dir) {
            return false;
        }
        const mod = path.relative(dir, file).replace(/\.tsx?$/, '').split(path.sep).join('/').replace(/\/index$/, '');
        out[name] = `@mattermost/types/${mod}`;
        let args: readonly ts.Type[] = [];
        if (alias) {
            args = t.aliasTypeArguments ?? [];
        } else if ((t as ts.TypeReference).target) {
            args = ix.checker.getTypeArguments(t as ts.TypeReference);
        }
        return (args ?? []).every((a) => collectImports(ix, a, out, depth + 1));
    }
    return false;
}

export function openApiOps(dir: string | null): OpenApiOp[] {
    if (!dir || !fs.existsSync(dir)) {
        return [];
    }
    const ops: OpenApiOp[] = [];
    for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.yaml')).sort()) {
        let doc: unknown;
        try {
            doc = yaml.load(fs.readFileSync(path.join(dir, f), 'utf8'));
        } catch {
            continue;
        }
        if (!doc || typeof doc !== 'object') {
            continue;
        }
        for (const [p, item] of Object.entries(doc as Record<string, unknown>)) {
            if (!p.startsWith('/') || !item || typeof item !== 'object') {
                continue;
            }
            for (const [verb, op] of Object.entries(item as Record<string, {operationId?: string; responses?: Record<string, {content?: Record<string, {schema?: {$ref?: string; type?: string; items?: {$ref?: string}}}>}>}>)) {
                if (!['get', 'post', 'put', 'patch', 'delete'].includes(verb) || !op || !op.operationId) {
                    continue;
                }
                const okResp = op.responses && (op.responses['200'] ?? op.responses['201']);
                const sch = okResp?.content?.['application/json']?.schema;
                const ref = sch && (sch.$ref ?? sch.items?.$ref);
                const schema = ref ? ref.split('/').pop()! + (sch.items ? '[]' : '') : sch?.type ?? null;
                ops.push({verb: verb.toUpperCase(), path: p, opId: op.operationId, file: f, schema, responses: op.responses ? Object.keys(op.responses) : []});
            }
        }
    }
    return ops;
}

export const normPath = (p: string) => p.replace(/\{[^}]*\}/g, '{}').replace(/\/$/, '');

/**
 * Exact verb+path match first; then segment-wise, where a spec parameter may be filled by a
 * literal the client hard-codes (/users/me/patch against /users/{user_id}/patch).
 */
export function opMatcher(ops: OpenApiOp[]): (verb: string, p: string) => OpenApiOp | null {
    const idx = new Map<string, OpenApiOp>();
    for (const o of ops) {
        const k = o.verb + ' ' + normPath(o.path);
        if (!idx.has(k)) {
            idx.set(k, o);
        }
    }
    const segs = ops.map((o) => ({o, s: normPath(o.path).split('/')}));
    return (verb, p) => {
        const exact = idx.get(verb + ' ' + normPath(p));
        if (exact) {
            return exact;
        }
        const cs = normPath(p).split('/');
        const cands = segs.filter(({o, s}) => o.verb === verb && s.length === cs.length && s.every((x, i) => x === cs[i] || x === '{}'));
        cands.sort((a, b) => b.s.filter((x) => x !== '{}').length - a.s.filter((x) => x !== '{}').length || cmp(a.o.opId, b.o.opId));
        return cands.length ? cands[0].o : null;
    };
}

const pascal = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Client method name -> operations it can call (one per route found in it). */
export class Operations {
    readonly byClientMethod = new Map<string, Operation[]>();
    readonly byId = new Map<string, Operation>();
    readonly specOps: OpenApiOp[];
    readonly stats: Record<string, number>;

    constructor(ix: ProgramIndex) {
        const {routes, bodies} = clientRoutes(ix);
        this.specOps = openApiOps(ix.config.openapiDir);
        const match = opMatcher(this.specOps);
        let fetches = 0;
        let apiCalls = 0;
        let matched = 0;
        for (const name of [...routes.keys()].sort()) {
            const ops: Operation[] = [];
            for (const r of routes.get(name)!) {
                fetches++;
                if (!r.path.startsWith(ix.config.client!.urlVersion)) {
                    continue;
                }
                apiCalls++;
                const m = match(r.verb, r.path);
                if (m) {
                    matched++;
                }
                const body = bodies.get(name) ?? null;
                const opId = m ? m.opId : pascal(name);
                const existing = this.byId.get(opId);
                const op: Operation = existing ?? {
                    opId,
                    verb: m ? m.verb : r.verb,
                    path: m ? m.path : r.path,
                    body: body?.type ?? null,
                    ...(body && Object.keys(body.imports).length ? {bodyImports: body.imports} : {}),
                    schema: m?.schema ?? null,
                    inSpec: Boolean(m),
                    client: name,
                };
                this.byId.set(opId, op);
                ops.push(op);
            }
            if (ops.length) {
                this.byClientMethod.set(name, ops);
            }
        }
        this.stats = {clientMethods: routes.size, fetchCalls: fetches, apiCalls, matchedToOpenAPI: matched, openApiOps: this.specOps.length};
    }
}
