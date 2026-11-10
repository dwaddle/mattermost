// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import fs from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

import {appMap, emitApi, emitMsg, emitSets} from './data.ts';
import {emitApp, emitClass, Imports, modalVariants, type Output} from './emit.ts';
import {buildModel, generated} from './model.ts';
import {emitPages, usablePages} from './pages.ts';

import {cmp} from '../compare.ts';
import {relativeToRoot, type Config} from '../config.ts';
import type {Diagnostic, Manifest} from '../manifest_types.ts';

export type GenerateResult = {files: string[]; changed: number; diagnostics: Diagnostic[]};

/** Formatted output by file for the source it was formatted from: watch mode only reformats what changed. */
const formatCache = new Map<string, {source: string; text: string}>();

type Prettier = {format(code: string, opts: Record<string, unknown>): Promise<string>; resolveConfig(file: string): Promise<Record<string, unknown> | null>};

/** The output project's own prettier (so generated code matches its lint), if it is installed. */
async function loadPrettier(outDir: string): Promise<Prettier | null> {
    try {
        const req = createRequire(path.join(outDir, 'noop.js'));
        const mod = await import(pathToFileURL(req.resolve('prettier')).href);
        return (mod.default ?? mod) as Prettier;
    } catch {
        return null;
    }
}

/**
 * Generates the typed page objects from the manifest (and the i18n catalog for `Msg`). Reads nothing else:
 * the manifest is the contract between the scan and the generated client.
 */
export async function generate(manifest: Manifest, config: Config): Promise<GenerateResult> {
    const outDir = config.output.generated;
    if (!outDir) {
        throw new Error('output.generated is not set in the config');
    }
    const diagnostics: Diagnostic[] = [];
    const plugin = config.plugin;
    const runtime = runtimeImport(config.output.runtime, outDir);
    const out: Output = {header: header(config), runtime};

    // a plugin generates its own subtree, `plugins.<key>`, named from the key on (`ComMattermostCalls…`)
    const pluginScope = plugin ? `plugins.${plugin.key}` : null;
    const elements = pluginScope ? generated(manifest, [], [pluginScope]) : generated(manifest, config.checks.strictPaths, config.generateScopes);
    const model = buildModel(elements, {dropWords: plugin ? 1 : 0, reservedNames: manifest.sets.map((x) => x.name)});
    const sources = new Map<string, string>();
    const variants = modalVariants(manifest, model);

    // classes, one file per top-level scope (shared classes in shared.ts)
    const byFile = new Map<string, typeof model.classes>();
    for (const cls of model.classes.filter((c) => !plugin || c.node.path.length > 1)) {
        byFile.set(cls.file, [...(byFile.get(cls.file) ?? []), cls]);
    }
    for (const [file, classes] of [...byFile.entries()].sort((a, b) => cmp(a[0], b[0]))) {
        const imports = new Imports(runtime);
        const ctx = {model, manifest, diagnostics, file, imports, variants};
        const parts = classes.sort((a, b) => cmp(a.node.path.join('.'), b.node.path.join('.'))).map((c) => emitClass(ctx, c));
        const types = parts.flatMap((p) => p.types);
        sources.set(`${file}.ts`, `${out.header}\n${imports.render()}\n${[...types, ...parts.map((p) => p.code)].join('\n')}`);
    }
    const pages = plugin ? [] : usablePages(manifest, diagnostics);
    if (!plugin) {
        sources.set('pages.ts', emitPages(pages, out));
        const appImports = new Imports(runtime);
        const app = emitApp({model, manifest, diagnostics, file: 'app', imports: appImports, variants}, model, pages);
        sources.set('app.ts', `${out.header}\n${appImports.render()}\n${app}`);
    }

    // a plugin package carries only what it has (its classes import `Api` / sets only when they use them)
    if (!plugin || manifest.operations.length) {
        sources.set('api.ts', emitApi(manifest, out));
    }
    if (!plugin || manifest.sets.length) {
        sources.set('sets.ts', emitSets(manifest, out));
    }
    if (config.i18n && fs.existsSync(config.i18n)) {
        sources.set('msg.ts', emitMsg(config.i18n, out));
    }
    const modules = [...sources.keys()].map((f) => f.replace(/\.ts$/, '')).sort();
    const reexports = modules.map((m) => `export * from './${m}';`).join('\n');
    const root = pluginScope ? model.byScope.get(pluginScope)?.cls : undefined;
    if (plugin && !root) {
        diagnostics.push({rule: 'generate', severity: 'error', at: relativeToRoot(config, config.configPath), message: `No testids under "${pluginScope}": nothing to generate for ${plugin.id}.`, fix: `Give the plugin's UI testids under "${pluginScope}."`});
    }
    sources.set('index.ts', plugin && root ? `${out.header}\n${pluginIndex(plugin, runtime, root.name, root.file, reexports)}` : `${out.header}\n${reexports}\n`);

    const prettier = await loadPrettier(outDir);
    if (!prettier) {
        diagnostics.push({rule: 'generate', severity: 'warning', at: path.basename(outDir), message: 'prettier is not installed next to the output; generated code is unformatted.', fix: 'Install the output project\'s dependencies (npm ci in e2e-tests/playwright, or the plugin\'s e2e project).'});
    }
    const files: string[] = [];
    let changed = 0;
    fs.mkdirSync(outDir, {recursive: true});
    const format = async (file: string, code: string) => {
        const hit = formatCache.get(file);
        if (hit && hit.source === code) {
            return hit.text;
        }
        const text = prettier ? await prettier.format(code, {...(await prettier.resolveConfig(file)), filepath: file}) : code;
        formatCache.set(file, {source: code, text});
        return text;
    };
    const formatted = await Promise.all([...sources].map(async ([name, code]) => {
        const file = path.join(outDir, name);
        return {file, text: await format(file, code)};
    }));
    for (const {file, text} of formatted) {
        files.push(file);
        if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== text) {
            fs.writeFileSync(file, text);
            changed++;
        }
    }
    const mapFile = path.join(outDir, 'app-map.json');
    const map = await format(mapFile, appMap(manifest, model, pages));
    files.push(mapFile);
    if (!fs.existsSync(mapFile) || fs.readFileSync(mapFile, 'utf8') !== map) {
        fs.writeFileSync(mapFile, map);
        changed++;
    }

    // files a previous run generated that this one didn't
    for (const f of fs.readdirSync(outDir)) {
        const full = path.join(outDir, f);
        if (!files.includes(full) && f.endsWith('.ts') && fs.readFileSync(full, 'utf8').includes('GENERATED by @mattermost/test-surface')) {
            fs.rmSync(full);
            changed++;
        }
    }
    return {files, changed, diagnostics};
}

/** Every generated file's header: the manifest it comes from (relative to the config's root) and how to regenerate it. */
function header(config: Config): string {
    const manifest = relativeToRoot(config, config.output.manifest);
    return `// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// GENERATED by @mattermost/test-surface from ${manifest}. Do not edit.
// Regenerate with \`test-surface scan && test-surface generate\` (see test-surface.config.json).
`;
}

/** How a file in `outDir` imports the runtime: a package by its name, the runtime's source by a relative path. */
export function runtimeImport(runtime: string, outDir: string): string {
    if (!path.isAbsolute(runtime)) {
        return runtime;
    }
    const rel = path.relative(outDir, runtime).split(path.sep).join('/');
    return rel.startsWith('.') ? rel : `./${rel}`;
}

/**
 * A plugin package's entry: registers the plugin's root class with the host's `app.plugins` and adds its
 * types there by declaration merging, with the plugin's key for host slots (`PluginKeys`).
 */
function pluginIndex(plugin: NonNullable<Config['plugin']>, runtime: string, rootClass: string, rootFile: string, reexports: string): string {
    const name = rootClass.charAt(0).toLowerCase() + rootClass.slice(1);
    return `import {registerPluginSurface} from '${runtime}';

import {${rootClass}} from './${rootFile}';

${reexports}

/** \`app.plugins.${name}\`: ${plugin.id}'s UI. */
registerPluginSurface('${name}', (page) => new ${rootClass}(page));

declare module '${runtime}' {
    interface Plugins {
        ${name}: ${rootClass};
    }
    interface PluginKeys {
        ${plugin.key}: true;
    }
}
`;
}
