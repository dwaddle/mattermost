// the components' testid helpers as `@mattermost/shared/utils/test_id` declares them (the scanner reads their calls,
// whatever their bodies)
declare module '@mattermost/shared/utils/test_id' {
    export type TestIdRole = 'button' | 'link' | 'text' | 'menuitem' | 'option';
    export type PluginSlot = 'app_bar_button' | 'post_menu_item' | 'product_menu_item';
    export function part(scope: string | undefined, path: string, keyOrRole?: {key: string | number} | TestIdRole, role?: TestIdRole): string | undefined;
    export function keyed(testId: string | undefined, key: string | number | undefined, role?: TestIdRole): string | undefined;
    export function pluginSlotTestId(slot: PluginSlot, pluginId: string, scope?: string): string | undefined;
    export function pluginSlotPath(slot: PluginSlot, pluginId: string, scope?: string): string | undefined;
}
