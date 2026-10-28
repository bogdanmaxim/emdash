export type {
	SearchBackendResolution,
	SearchCapability,
	SearchEngine,
	SearchProviderHealth,
	SearchProviderCapability,
	SearchProviderDescriptor,
	SearchProviderSchema,
	SearchProviderSelection,
	SearchProviderStatus,
} from "./provider-resolution.js";
export {
	isSearchSupported,
	resolveSearchBackend,
	searchUnsupportedMessage,
	usesFts5Engine,
} from "./provider-resolution.js";
