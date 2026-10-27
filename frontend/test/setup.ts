Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
// IndexedDB en memoria para la capa offline (jsdom no la incluye).
import 'fake-indexeddb/auto';
