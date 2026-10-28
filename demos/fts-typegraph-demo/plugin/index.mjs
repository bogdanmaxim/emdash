/**
 * Demo plugin-side helper that declares Typegraph provider selection config.
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
