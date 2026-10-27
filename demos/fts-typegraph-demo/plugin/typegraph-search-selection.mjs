/**
 * Demo "plugin" module that declares Typegraph provider selection config
 * for the demo CMS runtime.
 */
export function typegraphSearchSelection(endpoint) {
	return {
		provider: {
			id: "demo-typegraph",
			source: "external",
			engine: "typegraph",
			enabled: true,
			schema: {
				name: "typegraph-demo",
				config: { endpoint },
			},
		},
	};
}
