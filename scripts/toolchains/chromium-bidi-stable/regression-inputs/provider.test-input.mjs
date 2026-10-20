// Inert input: the parent must register this suite only after obtaining its runtime
// window. This file does not register or run tests when imported.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

export async function registerProviderRegressionInputs({
  test,
  packageRoot,
  targetConstructorLayout,
}) {
  assert.equal(typeof test, 'function');
  assert.ok(['stable', 'target-type-before-logger'].includes(targetConstructorLayout),
    'Explicitly declare the reviewed provider constructor layout');
  const root = resolve(packageRoot);
  const manifest = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  assert.equal(manifest.name, 'chromium-bidi');
  const load = path => import(pathToFileURL(resolve(root, 'out/Default/gen/src', path)).href);
  const {ContextConfigStorage} = await load('bidiMapper/modules/browser/ContextConfigStorage.js');
  const {BrowsingContextStorage} = await load('bidiMapper/modules/context/BrowsingContextStorage.js');
  const {UserContextStorage} = await load('bidiMapper/modules/browser/UserContextStorage.js');
  const {EmulationProcessor} = await load('bidiMapper/modules/emulation/EmulationProcessor.js');
  const {CdpTarget} = await load('bidiMapper/modules/cdp/CdpTarget.js');
  const {BrowserProcessor} = await load('bidiMapper/modules/browser/BrowserProcessor.js');
  const {BidiParser} = await load('bidiTab/BidiParser.js');

  function emulationFixture() {
    const config = new ContextConfigStorage();
    const contexts = new BrowsingContextStorage();
    const client = {
      async sendCommand(method) {
        assert.equal(method, 'Target.getBrowserContexts');
        return {browserContextIds: ['user-a']};
      },
    };
    const users = new UserContextStorage(client);
    return {config, processor: new EmulationProcessor(contexts, users, config)};
  }

  function targetFixture(sendCommand) {
    // CdpTarget's real public constructor does not unblock or configure a browser.
    // Only the external CDP boundary is doubled. No mapper methods are replaced.
    const client = {sendCommand};
    const args = [
      'page-a', client, client, client,
      undefined, // event manager: these direct methods do not use it
      undefined, // realm storage
      undefined, // preload storage
      new BrowsingContextStorage(),
      new ContextConfigStorage(),
      undefined, // network storage
      'default',
      'source-only-fixture',
    ];
    if (targetConstructorLayout === 'target-type-before-logger') args.push('page');
    args.push(undefined); // logger
    return new CdpTarget(...args);
  }

  test('provider stores and clears global media settings and rejects unsupported features', async () => {
    const {config, processor} = emulationFixture();
    await processor.setMediaFeaturesOverride({features: {'prefers-color-scheme': 'dark'}});
    assert.deepEqual(config.getActiveConfig('page-a', 'default').mediaFeatures,
      {'prefers-color-scheme': 'dark'});
    await assert.rejects(processor.setMediaFeaturesOverride({features: {hover: 'hover'}}),
      error => error.error === 'unsupported operation');
    assert.deepEqual(config.getActiveConfig('page-a', 'default').mediaFeatures,
      {'prefers-color-scheme': 'dark'}, 'rejection must leave stored settings intact');
    await processor.setMediaFeaturesOverride({features: null});
    assert.equal(config.getActiveConfig('page-a', 'default').mediaFeatures, undefined);
  });

  test('provider stores and clears viewport meta and validates context selectors', async () => {
    const {config, processor} = emulationFixture();
    await processor.setViewportMetaOverride({viewportMeta: true});
    assert.equal(config.getActiveConfig('page-a', 'default').viewportMeta, true);
    await assert.rejects(processor.setViewportMetaOverride({viewportMeta: true, contexts: []}),
      error => error.error === 'invalid argument');
    await assert.rejects(processor.setViewportMetaOverride({
      viewportMeta: true, contexts: ['page-a'], userContexts: ['user-a'],
    }), error => error.error === 'invalid argument');
    await processor.setViewportMetaOverride({viewportMeta: null});
    assert.equal(config.getActiveConfig('page-a', 'default').viewportMeta, undefined);
  });

  test('real mapper parser validates both commands and preserves protocol error codes', () => {
    const parser = new BidiParser();
    assert.deepEqual(parser.parseSetMediaFeaturesOverrideParams({
      features: {'prefers-color-scheme': 'dark'}, contexts: ['page-a'],
    }), {features: {'prefers-color-scheme': 'dark'}, contexts: ['page-a']});
    assert.deepEqual(parser.parseSetViewportMetaOverrideParams({viewportMeta: true}),
      {viewportMeta: true});
    for (const params of [{}, {viewportMeta: false}, {viewportMeta: true, contexts: []}]) {
      assert.throws(() => parser.parseSetViewportMetaOverrideParams(params),
        error => error.error === 'invalid argument');
    }
    assert.throws(() => parser.parseSetMediaFeaturesOverrideParams({
      features: {'prefers-color-scheme': 'not-a-color-scheme'},
    }), error => error.error === 'invalid argument');
  });

  test('real target sends CDP media feature payloads and propagates CDP failures', async () => {
    const calls = [];
    const target = targetFixture(async (method, params) => {
      assert.equal(method, 'Emulation.setEmulatedMedia');
      calls.push({method, params});
      return {};
    });
    await target.setMediaFeaturesOverride({
      'prefers-color-scheme': 'dark', 'prefers-reduced-motion': null,
    });
    await target.setMediaFeaturesOverride(null);
    assert.deepEqual(calls, [
      {method: 'Emulation.setEmulatedMedia', params: {
        features: [{name: 'prefers-color-scheme', value: 'dark'}],
      }},
      {method: 'Emulation.setEmulatedMedia', params: {features: []}},
    ]);
    const failure = new Error('CDP command rejected');
    const rejected = targetFixture(async () => {throw failure;});
    await assert.rejects(rejected.setMediaFeaturesOverride({'prefers-contrast': 'more'}),
      error => error === failure);
  });

  test('viewport meta shares the real metrics path without clearing other overrides', async () => {
    const calls = [];
    const target = targetFixture(async (method, params) => {calls.push({method, params}); return {};});
    await target.setDeviceMetricsOverride({width: 800, height: 600}, 2, null,
      {width: 1920, height: 1080}, 'overlay', true);
    assert.equal(calls[0].method, 'Emulation.setDeviceMetricsOverride');
    assert.deepEqual(calls[0].params, {
      width: 800, height: 600, deviceScaleFactor: 2, screenOrientation: undefined,
      mobile: false, screenWidth: 1920, screenHeight: 1080,
      scrollbarType: 'overlay', viewportMeta: 'enable',
    });
    await target.setDeviceMetricsOverride(null, null, null, null, null, true);
    assert.equal(calls[1].method, 'Emulation.setDeviceMetricsOverride',
      'viewport-meta-only settings must not enter the metrics-clear branch');
    assert.equal(calls[1].params.viewportMeta, 'enable');
    await target.setDeviceMetricsOverride(null, null, null, null, null, null);
    assert.equal(calls[2].method, 'Emulation.clearDeviceMetricsOverride');
  });

  test('existing window capability restores maximized windows before resizing', async () => {
    let bounds = {windowState: 'maximized', width: 1920, height: 1080, left: 0, top: 0};
    const calls = [];
    const client = {
      async sendCommand(method, params) {
        assert.equal(params.windowId, 7);
        calls.push({method, params: structuredClone(params)});
        if (method === 'Browser.getWindowBounds') return {bounds: {...bounds}};
        assert.equal(method, 'Browser.setWindowBounds');
        // CDP disallows geometry updates while the window is non-normal.
        if (bounds.windowState !== 'normal' &&
          ['width', 'height', 'left', 'top'].some(key => params.bounds[key] !== undefined)) {
          throw new Error('To resize a window, first restore it to normal state.');
        }
        bounds = {...bounds, ...params.bounds};
        return {};
      },
    };
    const contexts = new BrowsingContextStorage();
    const processor = new BrowserProcessor(client, contexts, new ContextConfigStorage(),
      new UserContextStorage(client));
    const result = await processor.setClientWindowState({
      clientWindow: '7', state: 'normal', width: 800, height: 600,
    });
    assert.deepEqual(calls.filter(call => call.method === 'Browser.setWindowBounds')
      .map(call => call.params.bounds), [
      {windowState: 'normal'}, {windowState: 'normal', width: 800, height: 600},
    ]);
    assert.equal(result.width, 800);
    assert.equal(result.height, 600);
    assert.equal(result.state, 'normal');
  });
}
