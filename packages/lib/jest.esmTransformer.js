// Kysely is published as ES modules only, but the lib tests run as CommonJS.
// This transformer converts just the kysely files to CommonJS using the
// TypeScript compiler, so no extra dependency is needed.
const ts = require('typescript');

module.exports = {
	process(sourceText, sourcePath) {
		const result = ts.transpileModule(sourceText, {
			fileName: sourcePath,
			compilerOptions: {
				allowJs: true,
				module: ts.ModuleKind.CommonJS,
				target: ts.ScriptTarget.ES2019,
				sourceMap: false,
			},
		});
		return { code: result.outputText };
	},
};
