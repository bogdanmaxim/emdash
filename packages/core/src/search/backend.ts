export type {
	SearchBackendResolution,
	SearchEngine,
	SearchProviderCapability,
	SearchProviderDescriptor,
	SearchProviderSchema,
	SearchProviderSelection,
} from "./provider-resolution.js";
export {
	isSearchSupported,
	resolveSearchBackend,
	searchUnsupportedMessage,
	usesFts5Engine,
} from "./provider-resolution.js";
