# Demo plugin page objects

`app.plugins.comMattermostDemoPlugin` for the specs under `specs/functional/plugins/demo_plugin/webapp`: the
demo plugin's own UI (its Root Modal, right-hand sidebar, sidebar header, profile popover entries, file preview
and menu labels). The webapp's slots it fills (`app.appBar.plugin(...)`, `app.lhs.teamMenu.plugin(...)`, …) are
the webapp's own generated page objects.

Generated in the plugin's repo by `@mattermost/test-surface` in plugin mode (`webapp/test-surface.config.json`,
output `e2e/generated`) and copied here; don't edit by hand. To refresh after the plugin's testids change:

```sh
cd mattermost-plugin-demo/webapp
node <mattermost>/webapp/platform/test-surface/bin/test-surface.mjs scan --config test-surface.config.json
node <mattermost>/webapp/platform/test-surface/bin/test-surface.mjs generate --config test-surface.config.json
cp ../e2e/generated/*.ts <mattermost>/e2e-tests/playwright/plugins/com_mattermost_demo_plugin/
```

The specs need a plugin build that has these testids: set `PW_DEMO_PLUGIN_URL` to it (see `helpers.ts`).
