export { noteCodec } from './noteCodec';
export { practiceCodec } from './practiceCodec';
export { goalCodec } from './goalCodec';
export { itemCodec } from './itemCodec';

// logCodec has a different shape than the others: its toLocal/diff take an
// extra resolved `localItem` argument and there is no toRemote (parent lookup
// happens in pushLog). It is exported as a namespace of named functions
// ({ table, toLocal, diff }) rather than a single object literal.
export * as logCodec from './logCodec';
