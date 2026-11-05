// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import path from 'node:path';

import ts from 'typescript';

import type {Config} from './config.ts';

export type LoadedProgram = {
    program: ts.Program;
    checker: ts.TypeChecker;
    options: ts.CompilerOptions;
    rootNames: string[];
    timings: {createProgram: number; getChecker: number};
};

/**
 * Compiler options from the project's tsconfig, with `paths` overridden so workspace packages
 * resolve to their source (the scan needs real code, e.g. Client4 URL templates, not built .d.ts).
 */
export function compilerSetup(config: Config): {options: ts.CompilerOptions; rootNames: string[]} {
    const read = ts.readConfigFile(config.tsconfig, ts.sys.readFile);
    if (read.error) {
        throw new Error(ts.flattenDiagnosticMessageText(read.error.messageText, '\n'));
    }
    const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, path.dirname(config.tsconfig));
    const options: ts.CompilerOptions = {
        ...parsed.options,
        paths: {...(parsed.options.paths ?? {}), ...config.pathOverrides},
        composite: false,
        incremental: false,
        noEmit: true,
        declaration: false,
        tsBuildInfoFile: undefined,
    };
    if (!options.baseUrl && Object.keys(config.pathOverrides).length) {
        options.baseUrl = path.dirname(config.tsconfig);
    }
    return {options, rootNames: parsed.fileNames};
}

export function loadProgram(config: Config): LoadedProgram {
    const {options, rootNames} = compilerSetup(config);
    const t0 = Date.now();
    const program = ts.createProgram({rootNames, options});
    const t1 = Date.now();
    const checker = program.getTypeChecker();
    const t2 = Date.now();
    return {program, checker, options, rootNames, timings: {createProgram: t1 - t0, getChecker: t2 - t1}};
}

/**
 * A long-lived language service for watch mode: one changed file costs an incremental
 * program update instead of a cold build.
 */
export class WatchedProgram {
    private readonly versions = new Map<string, number>();
    private readonly service: ts.LanguageService;
    readonly options: ts.CompilerOptions;
    private rootNames: string[];

    constructor(config: Config) {
        const setup = compilerSetup(config);
        this.options = setup.options;
        this.rootNames = setup.rootNames;
        const host: ts.LanguageServiceHost = {
            getScriptFileNames: () => this.rootNames,
            getScriptVersion: (f) => String(this.versions.get(f) ?? 0),
            getScriptSnapshot: (f) => {
                const text = ts.sys.readFile(f);
                return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text);
            },
            getCurrentDirectory: () => path.dirname(config.tsconfig),
            getCompilationSettings: () => this.options,
            getDefaultLibFileName: (o) => ts.getDefaultLibFilePath(o),
            fileExists: ts.sys.fileExists,
            readFile: ts.sys.readFile,
            readDirectory: ts.sys.readDirectory,
            directoryExists: ts.sys.directoryExists,
            getDirectories: ts.sys.getDirectories,
        };
        this.service = ts.createLanguageService(host, ts.createDocumentRegistry());
    }

    /** Marks files as changed (or added/removed) on disk. */
    touch(files: string[], rootNames?: string[]) {
        if (rootNames) {
            this.rootNames = rootNames;
        }
        for (const f of files) {
            this.versions.set(f, (this.versions.get(f) ?? 0) + 1);
        }
    }

    current(): LoadedProgram {
        const t0 = Date.now();
        const program = this.service.getProgram();
        if (!program) {
            throw new Error('language service produced no program');
        }
        const t1 = Date.now();
        const checker = program.getTypeChecker();
        return {program, checker, options: this.options, rootNames: this.rootNames, timings: {createProgram: t1 - t0, getChecker: Date.now() - t1}};
    }
}
