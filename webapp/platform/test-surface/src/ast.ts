// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import ts from 'typescript';

export type FunctionLike = ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression | ts.MethodDeclaration;
export type JsxTag = ts.JsxOpeningElement | ts.JsxSelfClosingElement;

export function isFunctionLike(n: ts.Node | undefined | null): n is FunctionLike {
    return Boolean(n) && (ts.isFunctionDeclaration(n!) || ts.isArrowFunction(n!) || ts.isFunctionExpression(n!) || ts.isMethodDeclaration(n!));
}

export function isJsxTag(n: ts.Node): n is JsxTag {
    return ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n);
}

/** Removes wrappers that don't change a value: parens, `as`, `!`, `satisfies`. */
export function strip<T extends ts.Node | undefined>(e: T): T | ts.Expression {
    let x: ts.Node | undefined = e;
    while (x && (ts.isParenthesizedExpression(x) || ts.isAsExpression(x) || ts.isNonNullExpression(x) || ts.isSatisfiesExpression(x) || ts.isTypeAssertionExpression(x))) {
        x = x.expression;
    }
    return x as T | ts.Expression;
}

/** `a.b.c` -> `c`, `f` -> `f`, anything else -> ''. */
export function exprName(e: ts.Expression): string {
    if (ts.isPropertyAccessExpression(e)) {
        return e.name.text;
    }
    return ts.isIdentifier(e) ? e.text : '';
}

/** Last name of a callee: `a.b.c(...)` -> `c`, `f(...)` -> `f`. */
export function calleeName(call: ts.CallExpression): string {
    const x = strip(call.expression);
    if (ts.isPropertyAccessExpression(x)) {
        return x.name.text;
    }
    if (ts.isIdentifier(x)) {
        return x.text;
    }
    return '';
}

/** Return expressions of a function, not descending into nested functions. */
export function returnsOf(fn: ts.SignatureDeclaration | {body?: ts.Node}): ts.Expression[] {
    const body = (fn as {body?: ts.Node}).body;
    if (!body) {
        return [];
    }
    if (!ts.isBlock(body)) {
        return [body as ts.Expression];
    }
    const out: ts.Expression[] = [];
    const visit = (n: ts.Node) => {
        if (ts.isReturnStatement(n) && n.expression) {
            out.push(n.expression);
        }
        if (!ts.isFunctionLike(n) && !ts.isClassLike(n)) {
            ts.forEachChild(n, visit);
        }
    };
    ts.forEachChild(body, visit);
    return out;
}

export function jsxAttr(tag: JsxTag, name: string): ts.JsxAttribute | undefined {
    return tag.attributes.properties.find((p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && attrName(p) === name);
}

export function attrName(a: ts.JsxAttribute): string {
    return a.name.getText();
}

/** The expression an attribute carries: `x='a'` -> 'a' literal, `x={e}` -> e, bare `x` -> undefined. */
export function attrValue(a: ts.JsxAttribute | undefined): ts.Expression | undefined {
    if (!a || !a.initializer) {
        return undefined;
    }
    if (ts.isJsxExpression(a.initializer)) {
        return a.initializer.expression;
    }
    return a.initializer as ts.Expression;
}

export function tagName(tag: JsxTag): string {
    return tag.tagName.getText();
}

export function isIntrinsic(tag: JsxTag): boolean {
    return ts.isIdentifier(tag.tagName) && (/^[a-z]/).test(tag.tagName.text);
}

/** The text of a property name: identifiers, string literals, computed string literals. */
export function propName(name: ts.PropertyName | ts.BindingName | undefined): string | null {
    if (!name) {
        return null;
    }
    if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name) || ts.isPrivateIdentifier(name)) {
        return name.text;
    }
    if (ts.isComputedPropertyName(name) && ts.isStringLiteralLike(name.expression)) {
        return name.expression.text;
    }
    return null;
}

/** typeToString with union members sorted: the checker's member order depends on type creation order. */
export function typeText(checker: ts.TypeChecker, t: ts.Type, flags = ts.TypeFormatFlags.NoTruncation): string {
    if (t.isUnion() && !(t.flags & ts.TypeFlags.Boolean)) {
        return [...new Set(t.types.map((m) => checker.typeToString(m, undefined, flags)))].sort().join(' | ');
    }
    return checker.typeToString(t, undefined, flags);
}

/** `s` as a regular expression that matches it literally. */
export function escapeRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** A node's source on one line (whitespace runs collapsed), whole: for identity, where `shortText` is for display. */
export function oneLine(n: ts.Node): string {
    return n.getText().replace(/\s+/g, ' ');
}

export function shortText(n: ts.Node, max = 60): string {
    const t = n.getText().replace(/\s+/g, ' ');
    return t.length > max ? t.slice(0, max - 1) + '…' : t;
}

/** Function or class that declares a component (or any function) around a node. */
export function enclosingFunction(n: ts.Node): FunctionLike | undefined {
    for (let p = n.parent; p; p = p.parent) {
        if (isFunctionLike(p)) {
            return p;
        }
    }
    return undefined;
}

export function nameOfFunction(fn: ts.Node): string {
    const f = fn as ts.FunctionDeclaration;
    if (f.name && ts.isIdentifier(f.name)) {
        return f.name.text;
    }
    if (ts.isClassLike(fn) && fn.name) {
        return fn.name.text;
    }
    if (ts.isMethodDeclaration(fn)) {
        const cls = fn.parent;
        const m = propName(fn.name) ?? '?';
        return ts.isClassLike(cls) && cls.name ? `${cls.name.text}.${m}` : m;
    }
    let p: ts.Node | undefined = fn.parent;

    // const X = memo(forwardRef((props) => ...)) -> X
    while (p && (ts.isCallExpression(p) || ts.isParenthesizedExpression(p) || ts.isAsExpression(p))) {
        p = p.parent;
    }
    if (p && ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) {
        return p.name.text;
    }
    if (p && ts.isPropertyAssignment(p)) {
        return propName(p.name) ?? '(anonymous)';
    }
    if (p && ts.isExportAssignment(p)) {
        return 'default';
    }
    return '(anonymous)';
}
