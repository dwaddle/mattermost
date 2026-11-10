// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/**
 * The version of the runtime API generated page objects are written against (drivers and their methods, `Scope`,
 * `KeyedList`, `effect`, `msg`, plugin registration). Bump it when a change would break generated code, and the
 * generator's `GENERATOR_API` with it.
 *
 * Generated code checks it at compile time, so a plugin's test package generated for another runtime fails to build
 * instead of failing at run time. The generated `index.ts` emits:
 *
 *     export const GENERATOR_API = 1;
 *     export type GeneratorApiCheck = RuntimeApiCheck<typeof GENERATOR_API>;
 */
export const RUNTIME_API = 1;

/** Compiles only when `G` is the runtime's API version (see `RUNTIME_API`). */
export type RuntimeApiCheck<G extends typeof RUNTIME_API> = G;
