// the helpers' source as the shared package has it (a component in the package imports them by path): the scanner
// reads these calls the same way, and doesn't inline the bodies (the optional key and role would give phantom ids)
type TestIdRole = 'button' | 'link' | 'text' | 'menuitem' | 'option';
type Key = {key: string | number};

export const PLUGIN_SLOT_TEST_IDS = {
    app_bar_button: 'app_bar.plugin:{plugin}--button',
    post_menu_item: '*.actions_menu.plugin:{plugin}--button',
    product_menu_item: 'global_header.product_menu.plugin:{plugin}--menuitem',
} as const;

export function part(scope: string | undefined, path: string, keyOrRole?: Key | TestIdRole, role?: TestIdRole): string | undefined {
    if (!scope) {
        return undefined;
    }
    if (typeof keyOrRole === 'string') {
        return `${scope}.${path}--${keyOrRole}`;
    }
    const id = keyOrRole ? `${scope}.${path}:${keyOrRole.key}` : `${scope}.${path}`;
    return role ? `${id}--${role}` : id;
}

export function keyed(testId: string | undefined, key: string | number | undefined, role?: TestIdRole): string | undefined {
    if (!testId || key === undefined) {
        return undefined;
    }
    return role ? `${testId}:${key}--${role}` : `${testId}:${key}`;
}
