// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import fs from 'node:fs';
import path from 'node:path';

import {pluginTestKey} from '@mattermost/types/test_id';

/**
 * Everything the scanner needs to know about a project. The webapp's config lives in
 * `webapp/channels/test-surface.config.json`; a plugin repo writes its own.
 * Every path in the file is relative to the file's own directory.
 */
export type ConfigFile = {

    /** Directory that locations in the manifest are relative to. */
    root: string;

    /** The tsconfig whose program is scanned. */
    tsconfig: string;

    /** `paths` entries added to the tsconfig so workspace packages resolve to their source (relative to its baseUrl, as tsconfig `paths` are). */
    pathOverrides?: Record<string, string[]>;

    /** Directories (relative to root) whose files are scanned. */
    include: string[];

    /** Regular expressions; matching files are not scanned (tests, mocks, stories). */
    exclude?: string[];

    /** Directories (relative to root) where entity types are declared (`Channel`, `Team`...). */
    entityTypeDirs?: string[];

    /** The REST client whose methods are matched to OpenAPI operations. */
    client?: {file: string; className: string; urlVersion: string} | null;

    /** Directory (relative to root) of OpenAPI yaml files. */
    openapiDir?: string | null;

    /** i18n catalog (relative to root). */
    i18n?: string | null;

    /** Calls whose subtree is an error path, not part of what an action does. */
    errorCalls?: string[];

    /**
     * How handlers are traced. `pureCalls`: method names that send no request when their target can't be known
     * (`ref.current.focus()`); any other call through data is an unknown effect, even when it returns nothing.
     * `declared`: requests an element sends that the scan can't see (`DeclaredEffect`).
     */
    effects?: {pureCalls?: string[]; declared?: DeclaredEffect[]};

    /** Where outputs are written (relative to root). */
    output: {
        manifest: string;
        generated?: string | null;

        /**
         * Where the generated page objects import the runtime from (`Scope`, the drivers, `effect`, `msg`): a package,
         * by default `@mattermost/playwright-lib`, or a path to the runtime's source (starting with `.`) when the
         * generated code is part of the runtime's own package, as the webapp's is.
         */
        runtime?: string;
        reports?: string | null;

        /** Library mode: where `test-surface parts` writes `test-parts.json`. */
        parts?: string | null;
    };

    /** Library mode (a component library such as compass-ui): its entry module and the part helper's name. */
    library?: {entry: string; helper?: string; testIdProp?: string};

    /**
     * Component libraries whose published `test-parts.json` the scan reads: a package name (from its
     * installed copy) or `{"package": …, "parts": "path/to/test-parts.json"}` (relative to root).
     */
    libraries?: LibraryRef[];

    /** When set, `generate` only emits elements whose template starts with one of these scopes. */
    generateScopes?: string[] | null;

    /**
     * The app's entry modules (relative to this file: a file, or a directory with an index). When set, elements
     * in files the entries never import (dead code, or code only tests use) are flagged `unreachable` and
     * not generated.
     */
    entries?: string[];

    /**
     * E2E code to check for testids the app no longer renders (relative to this file), and reviewed
     * exceptions: a testid the check can't see is fine (a column-named cell, an id built at runtime).
     */
    staleReferences?: {roots: string[]; allow?: Array<{testid: string; file?: string; reason: string}>};

    /** Where checks are errors rather than warnings (the migrated area grows over time). */
    checks?: {strictScopes?: string[]; strictPaths?: string[]; strictKeys?: boolean; allow?: AllowEntry[]; keyFields?: KeyFieldsConfig};

    /** Page class names for route components (`{"ChannelIdentifierRouter": "ChannelsPage"}`); default `<Component>Page`. */
    pageNames?: Record<string, string>;

    /**
     * Route params that take an entity or its key, and what tests call them:
     * `{"identifier": {"as": "channel", "entity": "Channel", "field": "name", "module": "@mattermost/types/channels"}}`.
     */
    pageParams?: Record<string, PageParamConfig>;

    /**
     * What shows a page is up, by page class: its `goto` waits for the first of these testids to be visible
     * (`{"ChannelsPage": ["center.composer", "center.archived_notice"]}`). Each must be an element the page renders.
     * A page with nothing to wait for (it redirects, or shows no testid yet) says why:
     * `{"TeamPage": {"ready": null, "reason": "redirects to the team's default channel"}}`. Every page needs an entry.
     */
    pageReady?: Record<string, PageReady>;

    /**
     * Sub-routes a page renders below its own path, as one typed param (`AdminConsolePage.path({section:
     * 'user_management/system_roles'})`): `values`, or `from` the string values of a property in a file (relative to
     * root; `{"file": "channels/src/components/admin_console/admin_definition.tsx", "property": "url"}`). A route param
     * in a value (`user/:user_id`) takes any string there.
     */
    pageSections?: Record<string, PageSections>;

    /**
     * The published plugin slot contract: a `const` object of slot name -> testid template with `{plugin}`
     * (`{"file": "platform/shared/src/utils/test_id/index.ts", "export": "PLUGIN_SLOT_TEST_IDS"}`, file relative to root),
     * and optionally the object of slot name -> registry methods that fill it (`"registryExport": "PLUGIN_SLOT_REGISTRY_METHODS"`).
     */
    pluginSlots?: {file: string; export: string; registryExport?: string};

    /**
     * Plugin mode: the plugin's `plugin.json` and the host versions it supports, each the `app-map.json` the
     * host's generated page objects ship (`{"name": "12.1", "appMap": "…/app-map.json"}`), relative to root.
     * Its testids live under `plugins.<plugin key>`, its registry calls say which host slots it uses, and
     * `generate` writes a test package that adds the plugin to `app.plugins`.
     */
    plugin?: {
        manifest: string;
        hosts?: Array<{name: string; appMap: string}>;

        /** The type of the registry `initialize` gets (default `PluginRegistry`): only calls on it fill host slots. */
        registryType?: string;
    };
};

export type AllowEntry = {rule: string; template: string; reason: string};

/**
 * `effects.declared`: requests an element sends that the scan can't see, by testid template, with why
 * (`{"testId": "center.post_create.attach--button", "ops": ["UploadFile"], "reason": "uploads go through a raw XHR"}`).
 * An op is a client method's operation or an OpenAPI operation id.
 */
export type DeclaredEffect = {testId: string; ops: string[]; reason: string};

/**
 * Which entity fields may key a testid without review (`checks.keyFields`): `pattern` matches the field's name (by
 * default id-like fields); `allow` lists reviewed others (`{"entity": "AppSelectOption", "field": "value", "reason": …}`).
 */
export type KeyFieldsConfig = {pattern?: string; allow?: KeyFieldAllow[]};
export type KeyFieldAllow = {entity: string; field: string; reason: string};

/** Id-like fields: an id, a unique name, or a foreign key (`channel_id`, `channelId`). A field like `text` can change with the language. */
export const DEFAULT_KEY_FIELDS = '^(id|name|username|[a-z_]+_id|[a-z]+Id)$';

export type LibraryRef = string | {package: string; parts: string};

export type PageParamConfig = {as?: string; entity: string; field: string; module: string};

export type PageSections = {param?: string; values?: string[]; from?: {file: string; property: string}};

/** A page's ready testids, or `{ready: null, reason}` for a page with nothing to wait for. */
export type PageReady = string[] | {ready: null; reason: string};

export type Config = {
    configPath: string;
    root: string;
    tsconfig: string;
    pathOverrides: Record<string, string[]>;
    include: string[];
    exclude: RegExp[];
    entityTypeDirs: string[];
    client: {file: string; className: string; urlVersion: string} | null;
    openapiDir: string | null;
    i18n: string | null;
    errorCalls: RegExp;
    effects: {pureCalls: string[]; declared: DeclaredEffect[]};
    output: {
        manifest: string;
        generated: string | null;

        /** A package name, or the absolute path of the runtime's source. */
        runtime: string;
        reports: string | null;
        parts: string | null;
    };
    library: {entry: string; helper: string; testIdProp: string} | null;
    libraries: LibraryRef[];
    generateScopes: string[] | null;
    entries: string[];
    staleReferences: {roots: string[]; allow: Array<{testid: string; file?: string; reason: string}>} | null;
    checks: {strictScopes: string[]; strictPaths: string[]; strictKeys: boolean; allow: AllowEntry[]; keyFields: {pattern: RegExp; allow: KeyFieldAllow[]}};
    pageNames: Record<string, string>;
    pageParams: Record<string, PageParamConfig>;
    pageReady: Record<string, PageReady>;
    pageSections: Record<string, PageSections>;
    pluginSlots: {file: string; export: string; registryExport?: string} | null;
    plugin: PluginConfig | null;
};

export type PluginConfig = {
    id: string;

    /** The registry's type name: a call is a registry call when its receiver has this type. */
    registryType: string;

    /** The plugin's id normalized for a testid key (`com_mattermost_calls`); its testids live under `plugins.<key>`. */
    key: string;
    hosts: Array<{name: string; appMap: string}>;
};

/** The config's file name: `findConfig` looks for it; diagnostics about config entries are reported at its path (`configPath`). */
export const CONFIG_FILE = 'test-surface.config.json';

/** DOM methods a handler calls on elements it can't see the type of (refs): focus and scrolling send nothing. */
export const DEFAULT_PURE_CALLS = ['focus', 'blur', 'select', 'scrollIntoView', 'scrollTo'];

export const DEFAULT_EXCLUDE = [
    '\\.test\\.',
    '__mocks__',
    '/tests?/',
    'test_helpers',
    'testUtils',
    '/testing/',
    '\\.stories\\.',
];

export function loadConfig(configPath: string): Config {
    const abs = path.resolve(configPath);
    const dir = path.dirname(abs);
    const raw = JSON.parse(fs.readFileSync(abs, 'utf8')) as ConfigFile;
    return resolveConfig(raw, dir, abs);
}

export function resolveConfig(raw: ConfigFile, dir: string, configPath = path.join(dir, CONFIG_FILE)): Config {
    const root = path.resolve(dir, raw.root);
    const fromDir = (p: string) => path.resolve(dir, p);
    return {
        configPath,
        root,
        tsconfig: fromDir(raw.tsconfig),
        pathOverrides: raw.pathOverrides ?? {},
        include: raw.include.map((p) => path.resolve(dir, p)),
        exclude: (raw.exclude ?? DEFAULT_EXCLUDE).map((r) => new RegExp(r)),
        entityTypeDirs: (raw.entityTypeDirs ?? []).map(fromDir),
        client: raw.client ? {...raw.client, file: fromDir(raw.client.file)} : null,
        openapiDir: raw.openapiDir ? fromDir(raw.openapiDir) : null,
        i18n: raw.i18n ? fromDir(raw.i18n) : null,
        errorCalls: new RegExp(`^(${(raw.errorCalls ?? ['logError', 'forceLogoutIfNecessary', 'handleServerError']).join('|')})$`),
        effects: {pureCalls: raw.effects?.pureCalls ?? DEFAULT_PURE_CALLS, declared: raw.effects?.declared ?? []},
        output: {
            manifest: fromDir(raw.output.manifest),
            generated: raw.output.generated ? fromDir(raw.output.generated) : null,
            runtime: raw.output.runtime?.startsWith('.') ? fromDir(raw.output.runtime) : raw.output.runtime ?? '@mattermost/playwright-lib',
            reports: raw.output.reports ? fromDir(raw.output.reports) : null,
            parts: raw.output.parts ? fromDir(raw.output.parts) : null,
        },
        library: raw.library ? {entry: fromDir(raw.library.entry), helper: raw.library.helper ?? 'testIdPart', testIdProp: raw.library.testIdProp ?? 'testId'} : null,
        libraries: raw.libraries ?? [],
        generateScopes: raw.generateScopes ?? null,
        entries: (raw.entries ?? []).map(fromDir),
        staleReferences: raw.staleReferences ? {roots: raw.staleReferences.roots.map(fromDir), allow: raw.staleReferences.allow ?? []} : null,
        checks: {
            strictScopes: raw.checks?.strictScopes ?? [],
            strictPaths: raw.checks?.strictPaths ?? [],
            strictKeys: raw.checks?.strictKeys ?? false,
            allow: raw.checks?.allow ?? [],
            keyFields: {pattern: new RegExp(raw.checks?.keyFields?.pattern ?? DEFAULT_KEY_FIELDS), allow: raw.checks?.keyFields?.allow ?? []},
        },
        pageNames: raw.pageNames ?? {},
        pageParams: raw.pageParams ?? {},
        pageReady: raw.pageReady ?? {},
        pageSections: Object.fromEntries(Object.entries(raw.pageSections ?? {}).map(([k, v]) => [k, v.from ? {...v, from: {...v.from, file: path.resolve(root, v.from.file)}} : v])),
        pluginSlots: raw.pluginSlots ? {...raw.pluginSlots, file: path.resolve(root, raw.pluginSlots.file)} : null,
        plugin: raw.plugin ? resolvePlugin(raw.plugin, root) : null,
    };
}

function resolvePlugin(raw: NonNullable<ConfigFile['plugin']>, root: string): PluginConfig {
    const manifest = JSON.parse(fs.readFileSync(path.resolve(root, raw.manifest), 'utf8')) as {id?: string};
    if (!manifest.id) {
        throw new Error(`${raw.manifest} has no "id"`);
    }
    return {
        id: manifest.id,
        registryType: raw.registryType ?? 'PluginRegistry',
        key: pluginTestKey(manifest.id),
        hosts: (raw.hosts ?? []).map((h) => ({name: h.name, appMap: path.resolve(root, h.appMap)})),
    };
}

/** Finds the config: an explicit path, else the nearest test-surface.config.json at or above cwd. */
export function findConfig(explicit: string | undefined, cwd = process.cwd()): string {
    if (explicit) {
        return path.resolve(cwd, explicit);
    }
    for (let d = cwd; ; d = path.dirname(d)) {
        for (const candidate of [path.join(d, CONFIG_FILE), path.join(d, 'channels', CONFIG_FILE)]) {
            if (fs.existsSync(candidate)) {
                return candidate;
            }
        }
        if (path.dirname(d) === d) {
            throw new Error(`No ${CONFIG_FILE} found. Pass --config <path>.`);
        }
    }
}

/** Manifest locations are repo-relative to the config root, with forward slashes. */
export function relativeToRoot(config: Pick<Config, 'root'>, file: string): string {
    return path.relative(config.root, file).split(path.sep).join('/');
}
