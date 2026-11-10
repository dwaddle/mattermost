// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {TestIdRole} from '@mattermost/types/test_id';

import type {Aria, AriaRole} from './roles.ts';

export type {Aria, AriaRole};

/** Repo-relative location, "channels/src/…/file.tsx:51". */
export type Loc = string;

export type KeyInfo = {
    kind: 'set' | 'entity' | 'plugin' | 'setting' | 'suggestion' | 'string' | 'number';

    /** Name of the fixed set in `Manifest.sets` (kind "set"). */
    set?: string;
    entity?: string;
    field?: string;

    /** Module the entity type is imported from. */
    module?: string;

    /** TypeScript type a test passes for the key. */
    type: string;

    /** Literal key values seen in source (also present for partly-known string keys). */
    values?: string[];
};

export type Instance = {

    /** Usage chain the testid flowed through, innermost first. */
    via: Loc[];
    keySet?: string[];
};

export type Open = {
    kind: 'modal' | 'menu' | 'popover' | 'page' | 'panel';
    target: string;
    at: Loc;

    /** The scope the opened component renders (modal, menu, popover, or a panel the store shows). */
    scope?: string;

    /** The page class a navigation goes to, when its target fits one route. */
    page?: string;

    /** The navigation happens on some paths through the handler only (inside an `if`). */
    conditional?: true;

    /** A modal: the requests this opener's dialogProps callbacks send (its buttons' requests when opened from here). */
    dialogOps?: string[];

    /** A modal the menu component opens itself (the menu in mobile view): the menu's other form, not another destination. */
    menuForm?: true;
};

export type ElementEffects = {

    /** operationIds (see `Manifest.operations`). */
    ops: string[];

    /** The handler calls through data (registries, plugin hooks, config callbacks): `settle` then needs an explicit `wait`. */
    unknown: boolean;

    /** Parent callbacks this element calls whose source isn't static. */
    delegated: Loc[];
};

export type RenderCondition = {expr: string; explained: string; kind: string; at: Loc};

export type Element = {

    /** "channel_settings_modal.tabs.tab:{key}--tab", or the raw testid when it doesn't follow the grammar yet. */
    template: string;

    /** False for testids that don't follow the grammar (legacy). The generator skips them. */
    grammar: boolean;
    scope: string[];
    name: string;
    role: TestIdRole | null;
    key?: KeyInfo;

    /** Where data-testid is emitted, and the component that emits it. */
    component: {name: string; at: Loc};

    /** Other emission points of the same template (exclusive branches). */
    alsoAt?: Loc[];
    instances: Instance[];
    aria: Aria;
    opens?: Open[];
    effects?: ElementEffects;
    renderedWhen?: RenderCondition[];

    /** Every place it renders is in a file the app's entries never import (config `entries`). Not generated. */
    unreachable?: true;
    form?: {scope: string; field: string; valueType: string};
};

export type FixedSet = {name: string; values: string[]; source: Loc};

export type ManifestOperation = {
    opId: string;
    verb: string;
    path: string;

    /** TypeScript type of the response body, or null when unknown. */
    body: string | null;
    bodyImports?: Record<string, string>;
    inSpec: boolean;
};

/**
 * A route param. `name` is the router's, `as` what tests pass (`identifier` -> `channel`); `values` the
 * fixed set its pattern allows (the first is the default); `entity` an entity whose `field` is the value.
 */
export type PageParam = {name: string; as: string; optional: boolean; values?: string[]; entity?: {type: string; field: string; module: string}};

/**
 * A route: its path as written (`/:team/:path(channels|messages)/:identifier/:postid?`), params, and the scopes it
 * renders. `ready`: testids of which one shows the page is up; `goto` waits for it (config `pageReady`).
 */
export type Page = {class: string; path: string; params: PageParam[]; scopes: string[]; ready?: string[]; component: {name: string; at: Loc}};

export type ComponentScopes = {name: string; at: Loc; scopes: string[]};

/** A testid a library component derives from its `testId` prop (compass-ui `test-parts.json`). */
export type TestPart = {

    /** Appended to the usage's `testId`: `--dialog`, `.close--button`, `.tab:{key}--tab`. */
    suffix: string;
    role: TestIdRole | null;

    /** TypeScript type of `{key}`, for keyed parts. */
    key?: string;

    /** Only rendered when the usage sets (`set: true`) or doesn't set this prop (`IconButton` `toggled` -> `--togglebutton`). */
    when?: {prop: string; set: boolean};

    /** The callback props the part's click calls (`onClose`): the part's effects are those props' at the usage. */
    handlers?: string[];
    at: Loc;
};

/** What a component library publishes for the webapp's scan: per exported component, its parts and pass-through role. */
export type TestParts = {
    version: 1;
    package: string;
    packageVersion: string;
    testIdProp: string;
    components: Record<string, {at: Loc; role: AriaRole | null; parts: TestPart[]}>;
};

/** A host-owned plugin slot from the published contract: its testid template (`{key}` = plugin key). */
export type PluginSlot = {slot: string; template: string; registry?: string[]; at: Loc};

/** Plugin mode: which plugin this is, and the host slots its registry calls fill. */
export type PluginInfo = {
    id: string;
    key: string;
    slotsUsed: Array<{method: string; slots: string[]; at: Loc}>;
};

export type Diagnostic = {rule: string; severity: 'error' | 'warning'; at: Loc; message: string; fix?: string};

/** The manifest format this version writes and reads (`Manifest.version`). */
export const MANIFEST_VERSION = 1;

/** The `app-map.json` format the generator writes and plugin mode reads (its `version`). */
export const APP_MAP_VERSION = 1;

export type Manifest = {
    version: typeof MANIFEST_VERSION;
    generatedFrom: {tsconfig: string; scope: string[]};
    elements: Element[];
    sets: FixedSet[];
    operations: ManifestOperation[];
    pages: Page[];

    /** The plugin slot contract (empty when the config has none). */
    pluginSlots: PluginSlot[];

    /** Plugin mode only. */
    plugin?: PluginInfo;

    /** Components that something opens (modals, popovers), with the testid scopes they render. */
    components: ComponentScopes[];
    diagnostics: Diagnostic[];
};
