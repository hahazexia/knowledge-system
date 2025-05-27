import { createRenderer } from 'packages/runtime-core/src/renderer';
import { patchProp } from './patchProp';
import { nodeOps } from './nodeOps';
import { extend } from '@vue/shared';

const renderOptions = extend({ patchProp }, nodeOps);

let renderer;

function ensureRenderer() {
  return renderer || (renderer = createRenderer(renderOptions));
}

export const render = (...args) => {
  ensureRenderer().render(...args);
};
